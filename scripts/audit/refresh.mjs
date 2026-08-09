/**
 * Refresh the SRD fixtures the data audit checks against.
 *
 *   node scripts/audit/refresh.mjs
 *
 * The audit itself (`src/data/srdAudit.test.ts`) runs inside `npm test` and
 * must not touch the network, so the comparison values are written to
 * `src/data/srd` as JSON and imported from there. This script is the only
 * thing that fetches, and it is run by hand when you want to re-verify against
 * upstream rather than on every build.
 *
 * The fixtures are distilled rather than raw: only the fields the audit
 * actually compares. That keeps them small enough to read, and makes a diff
 * mean something - "this weapon's damage die changed upstream" rather than
 * four thousand lines of reformatted prose.
 *
 * Two sources, because neither is right on its own:
 *
 *   dnd5eapi     SRD 5.1, complete and careful. The source for everything
 *                2014, and for 2024 subclass features.
 *   open5e       SRD 5.2, which is where the 2024 equipment table and the 2024
 *                class progressions live. Used for those two only: its 2014
 *                spell-to-class data has no paladin list at all, and dnd5eapi's
 *                2024 cost column is visibly broken (longbow, javelin, dart and
 *                mace all "5 gp") while its 2024 class levels endpoint is
 *                advertised and returns 404.
 *
 * Behind a proxy, Node needs telling: NODE_USE_ENV_PROXY=1 node scripts/...
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'src', 'data', 'srd');

const DND5EAPI = 'https://www.dnd5eapi.co';
const OPEN5E = 'https://api.open5e.com';

/** Requests in flight at once. Enough to be quick, not enough to be rude. */
const CONCURRENCY = 8;

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.json();
}

/** Fetch many URLs with a bounded number in flight, preserving input order. */
async function getAll(urls) {
  const out = new Array(urls.length);
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      const i = next++;
      out[i] = await getJson(urls[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));
  return out;
}

/** Every record behind an index endpoint. */
async function getIndex(path) {
  const index = await getJson(`${DND5EAPI}${path}?limit=500`);
  return getAll(index.results.map((r) => `${DND5EAPI}${r.url}`));
}

/**
 * The audit matches on names, so they are compared with case and punctuation
 * flattened - "Thieves' Tools" and "Thieves’ tools" are one row.
 *
 * What is deliberately *kept* is anything in brackets. An earlier version
 * dropped it, on the grounds that "Caltrops (bag of 20)" and "Caltrops" are
 * the same thing - and quietly collapsed the four sizes of Carpet of Flying
 * and the ten Spell Scrolls onto one key each, losing fourteen records from a
 * fixture whose whole job is to notice missing records. Where two sources
 * really do name a thing differently, that is what the audit's alias table is
 * for; it is a stated exception rather than a silent merge.
 */
function key(name) {
  return name
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Keyed by name, refusing to let two records land on the same key. */
function byKey(rows) {
  const out = {};
  for (const row of rows) {
    const k = key(row.name);
    if (k in out) {
      throw new Error(
        `Two records share the key "${k}": "${out[k].name}" and "${row.name}". ` +
        'Distinguish them, or the fixture is hiding one of them.',
      );
    }
    out[k] = row;
  }
  return out;
}

function write(name, value) {
  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, `${name}.json`);
  writeFileSync(path, `${JSON.stringify(value, null, 1)}\n`);
  const count = Object.keys(value.records ?? value).length;
  console.log(`  ${name.padEnd(24)} ${String(count).padStart(4)} records`);
}

const COPPER = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };
const inCopper = (cost) => (cost ? cost.quantity * COPPER[cost.unit] : 0);

/**
 * The properties the app models. Masteries are not among them: they arrive
 * tagged `type: "Mastery"` in the 2024 source and are pulled out separately.
 */
const PROPERTIES = ['ammunition', 'finesse', 'heavy', 'light', 'loading', 'reach',
  'thrown', 'two-handed', 'versatile'];

// --------------------------------------------------------------- equipment
async function equipment2014() {
  const rows = await getIndex('/api/2014/equipment');
  const records = [];
  for (const r of rows) {
    const category = r.equipment_category?.index;
    const record = {
      name: r.name,
      category,
      gearCategory: r.gear_category?.index ?? null,
      cost: inCopper(r.cost),
      weight: r.weight ?? 0,
    };
    if (category === 'weapon' && r.damage) {
      record.damage = r.damage.damage_dice;
      record.damageType = r.damage.damage_type?.name?.toLowerCase() ?? null;
      record.versatile = r.two_handed_damage?.damage_dice ?? null;
      record.properties = (r.properties ?? []).map((p) => p.index)
        .filter((p) => PROPERTIES.includes(p)).sort();
      record.weaponCategory = r.weapon_category?.toLowerCase() ?? null;
      // Thrown weapons carry their melee reach in `range` and the throw
      // distance separately, so the audit has to read the right one.
      const range = (r.properties ?? []).some((p) => p.index === 'thrown')
        ? r.throw_range : r.range;
      record.range = range?.normal ? { normal: range.normal, long: range.long ?? null } : null;
    }
    if (category === 'armor') {
      record.baseAc = r.armor_class?.base ?? null;
      record.dexBonus = r.armor_class?.dex_bonus ?? false;
      record.maxDexBonus = r.armor_class?.max_bonus ?? null;
      record.strengthRequirement = r.str_minimum || 0;
      record.stealthDisadvantage = Boolean(r.stealth_disadvantage);
      record.armorCategory = r.armor_category?.toLowerCase() ?? null;
    }
    records.push(record);
  }
  return byKey(records);
}

// ----------------------------------------------------------- 2024 classes
/**
 * The 2024 class progression tables.
 *
 * SRD 5.2 prints a column per class resource - Rages, Focus Points, Channel
 * Divinity, Second Wind and the rest - and Open5e carries each as
 * `data_for_class_table` on the feature it belongs to. This was the source the
 * roadmap spent a long time saying did not exist.
 *
 * Stored as steps rather than twenty rows a column: a progression only changes
 * at a handful of levels, and that is the shape `classResources.ts` holds them
 * in, so the audit compares like with like.
 */
async function classes2024() {
  const page = await getJson(`${OPEN5E}/v2/classes/?document__key=srd-2024&limit=100`);
  const records = {};

  for (const klass of page.results) {
    if (klass.document?.key !== 'srd-2024' || klass.subclass_of) continue;
    const name = klass.key.replace(/^srd-2024_/, '');
    const columns = {};

    for (const feature of klass.features ?? []) {
      const table = feature.data_for_class_table ?? [];
      if (!table.length) continue;
      const rows = [...table].sort((a, b) => a.level - b.level);
      // Only the levels where the value changes.
      const steps = rows
        .filter((row, i) => i === 0 || row.column_value !== rows[i - 1].column_value)
        .map((row) => ({ level: row.level, value: String(row.column_value) }));
      // A name can appear twice, once without a table; keep the one with data.
      if (!columns[feature.name] || steps.length > columns[feature.name].length) {
        columns[feature.name] = steps;
      }
    }

    if (Object.keys(columns).length) records[name] = columns;
  }

  return records;
}

// ----------------------------------------------------------- 2024 weapons
async function weapons2024() {
  const page = await getJson(`${OPEN5E}/v2/items/?document__key=srd-2024&limit=1000`);
  const records = [];
  for (const r of page.results) {
    if (r.document?.key !== 'srd-2024' || !r.weapon) continue;
    const w = r.weapon;
    const properties = [];
    let mastery = null;
    let versatile = null;
    for (const entry of w.properties ?? []) {
      const name = entry.property.name.split('(')[0].trim().toLowerCase();
      if (entry.property.type === 'Mastery') { mastery = name; continue; }
      if (PROPERTIES.includes(name)) properties.push(name);
      if (name === 'versatile') versatile = entry.detail;
    }
    records.push({
      name: r.name,
      cost: Math.round(Number(r.cost ?? 0) * 100),
      weight: Number(r.weight ?? 0),
      damage: w.damage_dice,
      damageType: w.damage_type?.name?.toLowerCase() ?? null,
      versatile,
      properties: properties.sort(),
      mastery,
      weaponCategory: w.is_martial ? 'martial' : 'simple',
    });
  }
  return byKey(records);
}

// -------------------------------------------------------------- magic items
async function magicItems2014() {
  const rows = await getIndex('/api/2014/magic-items');
  const records = [];
  for (const r of rows) {
    // Rarity "Varies" marks a family header rather than an item: the SRD lists
    // "Weapon, +1, +2, or +3", "Ioun Stone" and "Potion of Healing" as
    // introductions to the graded versions that follow. The app carries the
    // versions, so the headers would only ever read as missing. One of them
    // also shares its name with a real item, which is what surfaced this.
    if (r.rarity?.name === 'Varies') continue;
    // The SRD restates "requires attunement" in the item's opening line, which
    // is the only place the flag exists in this dataset.
    const opening = (r.desc ?? []).join(' ').slice(0, 300).toLowerCase();
    records.push({
      name: r.name,
      rarity: r.rarity?.name ?? null,
      attunement: opening.includes('requires attunement'),
      category: r.equipment_category?.index ?? null,
    });
  }
  return byKey(records);
}

// ------------------------------------------------------------------- spells
async function spells2014() {
  const rows = await getIndex('/api/2014/spells');
  return byKey(rows.map((r) => ({
    name: r.name,
    level: r.level,
    school: r.school?.name?.toLowerCase() ?? null,
    concentration: Boolean(r.concentration),
    ritual: Boolean(r.ritual),
    classes: (r.classes ?? []).map((c) => c.index).sort(),
    // The SRD prints a spell's Range line verbatim, so "Self" here means the
    // spell targets you and any shape or throw distance is in the rules text.
    // The app states the shape in the same field, which the audit allows for.
    range: r.range,
    duration: r.duration,
    castingTime: r.casting_time,
  })));
}

// -------------------------------------------------------- 2024 subclasses
async function subclasses2024() {
  const index = await getJson(`${DND5EAPI}/api/2024/subclasses?limit=100`);
  const rows = await getAll(index.results.map((r) => `${DND5EAPI}${r.url}`));
  return byKey(rows.map((r) => ({
    name: r.name,
    class: r.class?.index ?? null,
    features: (r.features ?? [])
      .map((f) => ({ name: f.name, level: f.level }))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
  })));
}

// -------------------------------------------------- 2014 class level tables
/**
 * What each 2014 class gets at each of its twenty levels.
 *
 * The gap this closes: `core2014` compares hit die, saves and skill picks and
 * stops, so `CLASS_FEATURES` - the table the Builder panel, the printed sheet
 * and the level-up summary all read from - was checked against nothing at
 * all. Reading it by hand against this endpoint found eight features the app
 * simply did not have, including the Monk's entire level-2 kit.
 *
 * Three kinds of row are dropped here rather than in the audit, because they
 * are not features the app's table is supposed to carry:
 *
 *   `subclass` rows        The endpoint repeats every level once per subclass
 *                          to carry that subclass's own progression. Those
 *                          belong to `subclasses2024`'s 2014 sibling and to
 *                          `SUBCLASS_FEATURES`, not here.
 *   Ability Score          Lives on `CharClass.asiLevels`, which drives the
 *   Improvement            planner. Repeating it as a feature would double it
 *                          in every list that renders both.
 *   Subclass placeholders  "Sacred Oath feature", "Path feature" and friends
 *                          are the endpoint's way of saying *your subclass
 *                          gives you something here*. The app renders the
 *                          actual subclass feature instead.
 *
 * Everything else is kept verbatim, parentheticals included, because
 * "Brutal Critical (2 dice)" versus "Brutal Critical (1 die)" is exactly the
 * distinction the audit needs to tell a scaling tier from a fresh grant.
 */
const SUBCLASS_PLACEHOLDER =
  /(\bfeature$)|^(Primal Path|Bard College|Divine Domain|Druid Circle|Martial Archetype|Monastic Tradition|Sacred Oath|Ranger Archetype|Roguish Archetype|Sorcerous Origin|Otherworldly Patron|Arcane Tradition|Domain Spells|Oath Spells)$/;

async function classLevels2014() {
  const index = await getJson(`${DND5EAPI}/api/2014/classes?limit=100`);
  const tables = await getAll(index.results.map((r) => `${DND5EAPI}${r.url}/levels`));
  return byKey(index.results.map((klass, i) => ({
    name: klass.name,
    levels: tables[i]
      // A row with a `subclass` is that subclass's progression, not the class's.
      .filter((row) => !row.subclass)
      .map((row) => ({
        level: row.level,
        features: row.features
          .map((f) => f.name)
          .filter((n) => n !== 'Ability Score Improvement' && !SUBCLASS_PLACEHOLDER.test(n)),
      }))
      .filter((row) => row.features.length)
      .sort((a, b) => a.level - b.level),
  })));
}

// --------------------------------------------------------------------- core
const ABILITY = { STR: 'str', DEX: 'dex', CON: 'con', INT: 'int', WIS: 'wis', CHA: 'cha' };

async function core2014() {
  const [classes, races, skills, conditions, languages] = await Promise.all([
    getIndex('/api/2014/classes'),
    getIndex('/api/2014/races'),
    getIndex('/api/2014/skills'),
    getJson(`${DND5EAPI}/api/2014/conditions?limit=100`),
    getJson(`${DND5EAPI}/api/2014/languages?limit=100`),
  ]);

  const classRecords = [];
  for (const c of classes) {
    // Skill picks are stated as a choose-N whose options are all skills.
    const skillChoice = (c.proficiency_choices ?? []).find((choice) =>
      (choice.from?.options ?? []).length > 0 &&
      choice.from.options.every((o) => o.item?.index?.startsWith('skill-')),
    );
    classRecords.push({
      name: c.name,
      hitDie: c.hit_die,
      saves: (c.saving_throws ?? []).map((s) => ABILITY[s.name]).sort(),
      skillPicks: skillChoice?.choose ?? null,
    });
  }

  // Font of Magic's exchange rate is class-specific data hung off a level, not
  // a feature description, so it is fetched separately. Any level from 2nd up
  // carries the whole table.
  const sorcerer5 = await getJson(`${DND5EAPI}/api/2014/classes/sorcerer/levels/5`);
  const sorceryPointCosts = {};
  for (const row of sorcerer5.class_specific?.creating_spell_slots ?? []) {
    sorceryPointCosts[row.spell_slot_level] = row.sorcery_point_cost;
  }

  /*
    Subclass spell lists - a Life Cleric's domain spells, a Devotion Paladin's
    oath spells, a Fiend Warlock's expanded list. Four of the twelve SRD
    subclasses have one, and they are the reason those subclasses rate as
    highly as they do, so the app grants them and this is what checks them.

    The level lives in a prerequisite phrased as "Cleric 3", so it is read out
    of the number on the end.
  */
  const subclasses = await getIndex('/api/2014/subclasses');
  const subclassRecords = [];
  for (const sub of subclasses) {
    const byLevel = {};
    for (const entry of sub.spells ?? []) {
      const pre = (entry.prerequisites ?? []).find((p) => /\s\d+$/.test(p.name ?? ''));
      const level = pre ? Number(pre.name.match(/(\d+)$/)[1]) : 0;
      (byLevel[level] ??= []).push(entry.spell.name);
    }
    subclassRecords.push({
      name: sub.name,
      class: sub.class?.index ?? null,
      spells: Object.fromEntries(
        Object.entries(byLevel)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([level, names]) => [level, [...new Set(names)].sort()]),
      ),
    });
  }

  const raceRecords = [];
  for (const r of races) {
    const asi = {};
    for (const b of r.ability_bonuses ?? []) asi[ABILITY[b.ability_score.name]] = b.bonus;
    raceRecords.push({ name: r.name, speed: r.speed, size: r.size, asi });
  }

  return {
    classes: byKey(classRecords),
    subclasses: byKey(subclassRecords),
    sorceryPointCosts,
    races: byKey(raceRecords),
    skills: byKey(skills.map((s) => ({ name: s.name, ability: ABILITY[s.ability_score.name] }))),
    conditions: conditions.results.map((c) => c.name).sort(),
    languages: languages.results.map((l) => l.name).sort(),
  };
}


// ------------------------------------------------------- 2014 rules text

/**
 * The full text of every SRD spell and magic item.
 *
 * Kept apart from the other fixtures because it is the only one the *app*
 * loads rather than the audit: it is roughly 400 kB, so it ships as its own
 * lazily-imported chunk and must never join the bundle everything else is in.
 *
 * SRD 5.1 and 5.2 are CC-BY-4.0, so this text may be reproduced with
 * attribution - see the README. Nothing outside the SRD appears here, which is
 * the point: an entry from Xanathar's or Tasha's has no licensed text and the
 * app says so rather than inventing one.
 */
async function text2014() {
  const [spells, items] = await Promise.all([
    getIndex('/api/2014/spells'),
    getIndex('/api/2014/magic-items'),
  ]);

  const paragraphs = (rows, extra) => {
    const out = {};
    for (const r of rows) {
      const body = [...(r.desc ?? []), ...(extra ? extra(r) : [])]
        .map((line) => String(line).trim())
        .filter(Boolean);
      if (body.length) out[key(r.name)] = body;
    }
    return out;
  };

  return {
    // "At Higher Levels" is a separate field in the source and reads as a
    // closing paragraph, which is where the books put it too.
    spells: paragraphs(spells, (r) =>
      (r.higher_level ?? []).length ? ['**At Higher Levels.** ' + r.higher_level.join(' ')] : []),
    magicItems: paragraphs(items),
  };
}


/**
 * What each class starts with, in both editions.
 *
 * The source states this as a small tree: a list of fixed items, then a number
 * of "choose one" groups whose options are either a concrete item, several
 * concrete items, or *a category to pick from* - "any martial melee weapon".
 * That last one is a second choice inside the first, and it is the reason this
 * is normalised here rather than read raw: the app needs to know it must offer
 * a picker, and how many picks, without walking a four-level structure at
 * render time.
 *
 * The two editions differ in kind, not only in contents. 2014 hands you a kit
 * assembled from several separate questions; 2024 asks one question with two
 * or three complete kits as the answers, plus "or just take the gold". Both
 * come out as groups of options here, which is what let one renderer serve
 * both.
 *
 * **Classes only.** Backgrounds are not here because no licensed structured
 * source has them: SRD 5.1 carries exactly one background (Acolyte), and even
 * that one's list in the API is two items where the book has six. See the
 * roadmap - inventing the other fifteen would be worse than the gap.
 */
async function startingEquipment() {
  const editions = {};

  for (const api of ['2014', '2024']) {
    const classes = await getIndex(`/api/${api}/classes`);
    const out = {};

    /** A `counted_reference` node: N of one named thing. */
    const counted = (node) => ({
      index: node.of.index,
      name: node.of.name,
      quantity: node.count ?? 1,
    });

    /**
     * A `choice` node: pick N from one or more equipment categories.
     *
     * Plural because of exactly one entry - the 2024 Monk's "Artisan's Tools
     * or Musical Instrument", where the choice is over a *list* of categories
     * rather than one. Modelling every pick as a set of categories costs
     * nothing and means that entry is not a special case downstream.
     */
    const pick = (choice) => {
      const from = choice.from;
      const categories =
        from.option_set_type === 'equipment_category'
          ? [from.equipment_category.index]
          : (from.options ?? []).flatMap((o) =>
              o.option_type === 'choice' && o.choice.from.equipment_category
                ? [o.choice.from.equipment_category.index]
                : [],
            );
      return { label: choice.desc, categories, choose: choice.choose ?? 1 };
    };

    /**
     * One selectable answer. Items and picks are flattened out of whatever
     * nesting the source used, because "a martial weapon and a shield" is one
     * answer with one item and one pick however the tree expresses it.
     */
    const option = (node) => {
      const items = [];
      const picks = [];
      const walk = (n) => {
        if (n.option_type === 'counted_reference') items.push(counted(n));
        else if (n.option_type === 'choice') picks.push(pick(n.choice));
        else if (n.option_type === 'multiple') (n.items ?? []).forEach(walk);
      };
      walk(node);
      return { items, picks };
    };

    for (const c of classes) {
      const fixed = (c.starting_equipment ?? []).map((entry) => ({
        index: entry.equipment.index,
        name: entry.equipment.name,
        quantity: entry.quantity ?? 1,
      }));

      /*
        The gold, which the source states only in prose.

        A 2024 kit is "(a) Chain Mail, ... and 4 GP; (b) ... and 11 GP; or
        (c) 155 GP", and the coin is nowhere in the structured options - the
        third option is structurally *empty*, which would have shown as an
        answer containing nothing. So it is read out of the sentence.

        Only when the count matches exactly: one amount per option, in order.
        That holds for all twelve 2024 classes and for none of 2014, whose
        starting gold is rolled separately and is not part of the kit. If a
        source ever states it differently the counts stop matching and this
        records no gold at all, which is a visible gap rather than a wrong
        number attached to the wrong option.
      */
      const goldFor = (group, options) => {
        const amounts = [...group.desc.matchAll(/(\d+)\s*GP/gi)].map((m) => Number(m[1]));
        return amounts.length === options.length ? amounts : options.map(() => 0);
      };

      const groups = (c.starting_equipment_options ?? []).map((group) => {
        // A group whose `from` is a bare category is not a choice between
        // options at all - it is one pick, phrased as a group.
        if (group.from.option_set_type === 'equipment_category') {
          return {
            desc: group.desc || group.from.equipment_category.name,
            options: [{ items: [], picks: [pick(group)], gold: 0 }],
          };
        }
        const options = (group.from.options ?? []).map(option);
        const gold = goldFor(group, options);
        return {
          desc: group.desc,
          options: options.map((o, i) => ({ ...o, gold: gold[i] })),
        };
      });

      out[c.index] = { fixed, groups };
    }
    editions[api] = out;
  }

  return editions;
}

/**
 * The bestiary.
 *
 * Unlike every other set here this one is not only a fixture for the audit -
 * the app *serves* it, the way `srd-2014-text` is served. It is the thing a DM
 * has open in front of them, so what is kept is a whole stat block rather than
 * the handful of fields a comparison needs.
 *
 * **SRD 5.1 only, and this is a real gap rather than an oversight.** The 2024
 * endpoint carries three monsters - an aboleth and two dragons - so there is no
 * licensed structured source for SRD 5.2's bestiary. A 2024 table gets the 5.1
 * monsters and is told why, which is the same answer the full rules text gives
 * for the spells it has no licence to. Inventing the rest would be worse than
 * the gap; see the roadmap.
 *
 * The numbers are pulled out of the shapes the source states them in, because
 * every one of them is read by something. `hit_points_roll` is "19d12+133",
 * which `parseNotation` already parses, so rolling a monster's hit points needs
 * no new dice code. Speeds become numbers so the map can measure them, keeping
 * the source string when it carries a qualifier - "60 ft. (hover)" is not a
 * number and pretending otherwise would lose the word that matters.
 */
/** Experience by challenge rating. Mirrored in `src/bestiary.ts`. */
const XP_BY_CR = {
  0: 10, 0.125: 25, 0.25: 50, 0.5: 100,
  1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800,
  6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900,
  11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000,
  16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000,
  21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000,
  26: 90000, 27: 105000, 28: 120000, 29: 135000, 30: 155000,
};

async function monsters2014() {
  const rows = await getIndex('/api/2014/monsters');

  /** "40 ft." -> 40. Anything with a qualifier stays a string. */
  const feet = (value) => {
    const match = /^(\d+)\s*ft\.?$/.exec(String(value).trim());
    return match ? Number(match[1]) : String(value);
  };

  /** Saving throws and skills arrive in one list, told apart by their index. */
  const proficiencies = (list) => {
    const saves = {};
    const skills = {};
    for (const entry of list ?? []) {
      const index = entry.proficiency?.index ?? '';
      const save = /^saving-throw-(\w+)$/.exec(index);
      if (save) saves[save[1]] = entry.value;
      const skill = /^skill-(.+)$/.exec(index);
      if (skill) skills[skill[1]] = entry.value;
    }
    return { saves, skills };
  };

  /**
   * An action, a trait, a legendary action or a reaction - one shape, because
   * the source gives them one and a stat block reads them the same way.
   */
  const ability = (entry) => {
    const out = { name: entry.name, desc: entry.desc };
    if (typeof entry.attack_bonus === 'number') out.toHit = entry.attack_bonus;
    const damage = (entry.damage ?? [])
      .filter((d) => d.damage_dice)
      .map((d) => ({ dice: d.damage_dice, type: d.damage_type?.name?.toLowerCase() ?? 'damage' }));
    if (damage.length) out.damage = damage;
    if (entry.dc) {
      out.save = {
        ability: entry.dc.dc_type?.index ?? '',
        dc: entry.dc.dc_value,
        onSuccess: entry.dc.success_type ?? 'none',
      };
    }
    // How often it can be used, which a tracker has to show even where it
    // cannot enforce it. The source states this three different ways and none
    // of them reads like a stat block until it is rewritten:
    //   {type:'recharge on roll', min_value:5}  -> "Recharge 5-6"
    //   {type:'per day', times:3}               -> "3/Day"
    //   {type:'recharge after rest', rest_types:['short','long']}
    // A recharge on a 6 is written "Recharge 6", not "Recharge 6-6".
    const usage = entry.usage;
    if (usage?.type === 'recharge on roll') {
      out.usage = usage.min_value >= 6 ? 'Recharge 6' : `Recharge ${usage.min_value}-6`;
    } else if (usage?.type === 'per day') {
      out.usage = `${usage.times}/Day`;
    } else if (usage?.type === 'recharge after rest') {
      const rests = (usage.rest_types ?? []).join(' or ');
      out.usage = rests ? `Recharges after a ${rests} rest` : 'Recharges after a rest';
    } else if (usage?.type) {
      out.usage = usage.type;
    }

    /*
      Multiattack, structured.

      148 of the 334 monsters have one, and they are the dangerous half - an
      adult red dragon makes a bite and two claws, so reading only its first
      action would rate it at a third of what it does. The source states this
      as prose *and* as a list of `{action_name, count}`, and only the second
      is usable, so the second is what is kept.

      `count` arrives as a string, and a few are not numbers at all - "one of
      the following" and the like. Those are dropped rather than guessed, and
      the model falls back to the monster's single best attack, which is the
      conservative direction to be wrong in.
    */
    if (entry.multiattack_type === 'actions' && Array.isArray(entry.actions)) {
      const parts = entry.actions
        .map((a) => ({ name: a.action_name, count: Number(a.count) }))
        .filter((a) => a.name && Number.isFinite(a.count) && a.count > 0);
      if (parts.length) out.multiattack = parts;
    }

    return out;
  };

  const list = (entries) => (entries ?? []).map(ability);

  return rows.map((m) => {
    const { saves, skills } = proficiencies(m.proficiencies);

    // `hover` sits in the speed object but is a boolean, not a distance - a
    // will-o'-wisp is `{walk: '0 ft.', fly: '50 ft.', hover: true}`. Left where
    // it is it would print as "hover true ft."
    const { hover, ...rawSpeed } = m.speed ?? {};
    const speed = {};
    for (const [kind, value] of Object.entries(rawSpeed)) speed[kind] = feet(value);

    const senses = {};
    let passivePerception = null;
    for (const [kind, value] of Object.entries(m.senses ?? {})) {
      if (kind === 'passive_perception') passivePerception = value;
      else senses[kind] = feet(value);
    }

    return {
      id: m.index,
      name: m.name,
      size: m.size,
      type: m.type,
      subtype: m.subtype ?? null,
      alignment: m.alignment,
      // The source states armor class as a list because a few monsters have a
      // second, conditional one. The first is the one on the stat block line.
      ac: m.armor_class?.[0]?.value ?? 10,
      acNote: m.armor_class?.[0]?.type ?? null,
      hp: m.hit_points,
      hpRoll: m.hit_points_roll ?? m.hit_dice ?? null,
      speed,
      hover: Boolean(hover),
      scores: {
        str: m.strength, dex: m.dexterity, con: m.constitution,
        int: m.intelligence, wis: m.wisdom, cha: m.charisma,
      },
      saves,
      skills,
      vulnerable: m.damage_vulnerabilities ?? [],
      resist: m.damage_resistances ?? [],
      immune: m.damage_immunities ?? [],
      conditionImmunities: (m.condition_immunities ?? []).map((c) => c.index),
      senses,
      passivePerception,
      languages: m.languages ?? '',
      cr: m.challenge_rating,
      /*
        XP from the challenge rating, not from the record.

        Four stat blocks upstream carry the row above's value - a Brass Dragon
        Wyrmling at CR 1 worth 100 XP, a Dretch and a Riding Horse at CR 1/4
        worth 25, a Deep Gnome at CR 1/2 worth 50. Experience is a function of
        challenge rating, so the rating is what to believe, and taking it from
        the table rather than the record means a future drift is corrected on
        the next refresh rather than shipped.

        CR 0 is left alone: the SRD awards either 0 or 10 XP for one, depending
        on whether it can fight at all, and the record is the only thing that
        knows which. `src/bestiary.ts` carries the same table for the app, and
        `bestiary.test.ts` checks the two agree across all 334.
      */
      xp: m.challenge_rating > 0 ? XP_BY_CR[m.challenge_rating] ?? m.xp : m.xp,
      proficiencyBonus: m.proficiency_bonus ?? null,
      traits: list(m.special_abilities),
      actions: list(m.actions),
      legendary: list(m.legendary_actions),
      reactions: list(m.reactions),
    };
  });
}

// ---------------------------------------------------------------------- main
const SETS = {
  'srd-2014-equipment': equipment2014,
  'srd-2014-magic-items': magicItems2014,
  'srd-2014-spells': spells2014,
  'srd-2014-core': core2014,
  'srd-2014-class-levels': classLevels2014,
  'srd-2024-weapons': weapons2024,
  'srd-2024-subclasses': subclasses2024,
  'srd-2024-classes': classes2024,
  'srd-2014-text': text2014,
  'srd-2014-monsters': monsters2014,
  'srd-starting-equipment': startingEquipment,
};

const wanted = process.argv.slice(2);
const chosen = wanted.length
  ? Object.entries(SETS).filter(([name]) => wanted.some((w) => name.includes(w)))
  : Object.entries(SETS);

if (!chosen.length) {
  console.error(`No fixture matches ${wanted.join(', ')}. Known: ${Object.keys(SETS).join(', ')}`);
  process.exit(1);
}

console.log(`Refreshing ${chosen.length} fixture set(s) into src/data/srd\n`);
for (const [name, build] of chosen) {
  write(name, {
    source: name === 'srd-2024-weapons' || name === 'srd-2024-classes'
      ? 'open5e SRD 5.2'
      : name.startsWith('srd-2024') ? 'dnd5eapi SRD 5.2' : 'dnd5eapi SRD 5.1',
    refreshed: new Date().toISOString().slice(0, 10),
    records: await build(),
  });
}
console.log('\nDone. Run `npm test` to check the tables against them.');
