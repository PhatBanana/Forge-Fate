import { describe, expect, it } from 'vitest';
import equipmentFixture from './srd/srd-2014-equipment.json';
import magicItemFixture from './srd/srd-2014-magic-items.json';
import spellFixture from './srd/srd-2014-spells.json';
import coreFixture from './srd/srd-2014-core.json';
import classLevelsFixture from './srd/srd-2014-class-levels.json';
import weapon2024Fixture from './srd/srd-2024-weapons.json';
import subclass2024Fixture from './srd/srd-2024-subclasses.json';
import subclass2014Fixture from './srd/srd-2014-subclasses.json';
import featBackgroundFixture from './srd/srd-feats-backgrounds.json';
import class2024Fixture from './srd/srd-2024-classes.json';
import { GEAR } from './gear';
import { WEAPONS, weaponsFor } from './weapons';
import { ARMOR } from './armor';
import { MAGIC_ITEMS } from './magicItems';
import { SPELLS, SPELLS_BY_ID } from './spells';
import type { CastingTime } from './spells';
import { CLASSES } from './classes';
import { isOriginal } from './sources';
import { CLASS_FEATURES } from './classFeatures';
import { SORCERY_POINT_SLOT_COSTS, resourcesForClass } from './classResources';
import { heldResources } from '../engine/resources';
import { PREPARED_2024 } from './spellSlots';
import { computeSlots } from '../engine/spellcasting';
import { deriveBuild, emptyBuild } from '../engine/character';
import type { Ability, ClassId, Ruleset } from '../types';
import { RULESETS } from '../types';
import { featById, featsFor } from './feats';
import { BACKGROUNDS } from './backgrounds';
import { RACES } from './races';
import { SKILLS } from './skills';
import { CONDITIONS } from './conditions';
import { LANGUAGES } from './languages';
import { SUBCLASS_FEATURES, SUBCLASS_FEATURES_2024 } from './subclassFeatures';
import { key, srdKey } from './srd/names';

/**
 * The data tables, checked against the SRD.
 *
 * Every table here was first written from the books, and a one-off diff
 * against the SRD found fourteen real defects across them: a 2014 lance
 * rolling the 2024 damage die, two magic items demanding an attunement slot
 * they do not need, thirteen spells offered to Warlocks who cannot take them,
 * and every 2024 subclass showing its 2014 feature levels. Recall is a
 * perfectly good way to write a table and a poor way to be sure of one.
 *
 * So the diff is a test rather than an errand. It compares against fixtures in
 * `src/data/srd`, distilled from the SRD 5.1 and 5.2 APIs, so this
 * needs no network and runs with everything else. Refresh them with
 * `npm run audit:refresh` when you want to re-verify against upstream.
 *
 * Where the app deliberately departs from a source, `EXPECTED` records it with
 * a reason. An exception that stops matching anything fails too - a stale
 * excuse is worse than no excuse, because it reads as though someone checked.
 */

/**
 * The fixtures are imported rather than read off disk so the typecheck stays a
 * browser typecheck: pulling in `node:fs` here would mean adding node types to
 * the app project, and then app code could reach for `process` and still pass.
 * Nothing in the app graph imports these, so they never reach the bundle.
 */
const records = <T,>(f: { records: unknown }): T => f.records as T;

/**
 * Where the app knowingly differs from a source, and why.
 *
 * Keyed `domain:record:field`. Most of these are the source being wrong: the
 * two SRD APIs are careful transcriptions and neither is perfect, so where one
 * contradicts the Player's Handbook the book wins and the disagreement is
 * written down here rather than argued again every time the audit runs.
 */
const EXPECTED_SOURCE: Record<string, string> = {
  // --- dnd5eapi's spell-to-class mapping contradicts the PHB in five places.
  'spell:Arcane Eye:classes':
    'dnd5eapi adds Cleric. Arcane Eye is a Wizard spell in the PHB.',
  'spell:Create Food and Water:classes':
    'dnd5eapi adds Druid. The PHB has Cleric and Paladin.',
  'spell:Divination:classes':
    'dnd5eapi swaps Cleric for Druid. Divination is a Cleric spell.',
  'spell:Faerie Fire:classes':
    'dnd5eapi omits Bard. Faerie Fire is on the Bard and Druid lists.',
  'spell:Meld into Stone:classes':
    'dnd5eapi omits Druid. The PHB has Cleric and Druid.',

  // --- dnd5eapi's equipment table has four cells the books disagree with.
  'gear:Caltrops (bag of 20):cost':
    'dnd5eapi says 5 cp for a bag of twenty; both the PHB and open5e say 1 gp.',
  'gear:Spikes, iron (10):cost':
    'dnd5eapi prices one spike where the app lists ten, as the PHB does.',
  'gear:Saddle, exotic:weight':
    'dnd5eapi says 50 lb.; the PHB and open5e both say 40.',
  'weapon:Blowgun:damage':
    'The blowgun deals a flat 1 damage, which the app models as 1d1 so the '
    + 'damage calculator has dice to read.',

  'weapon2024:Blowgun:damage':
    'As above. The 2024 blowgun is unchanged.',
  'gear:Barding, ring mail:cost':
    'Barding is four times the armor it is made from, which the SRD confirms in '
    + 'twelve of thirteen rows. Its ring mail barding at 12 gp is a dropped zero.',

  // --- Equipment the SRD API records with no weight at all.
  "gear:Burglar's Pack:weight": 'The API gives packs no weight and lists their contents instead.',
  "gear:Diplomat's Pack:weight": 'The API gives packs no weight and lists their contents instead.',
  "gear:Dungeoneer's Pack:weight": 'The API gives packs no weight and lists their contents instead.',
  "gear:Entertainer's Pack:weight": 'The API gives packs no weight and lists their contents instead.',
  "gear:Explorer's Pack:weight": 'The API gives packs no weight and lists their contents instead.',
  "gear:Priest's Pack:weight": 'The API gives packs no weight and lists their contents instead.',
  "gear:Scholar's Pack:weight": 'The API gives packs no weight and lists their contents instead.',
  'gear:Rowboat:weight': 'The API gives vehicles no weight; the PHB rowboat is 100 lb.',

  // --- A subrace that changes its lineage's speed.
  'race:Wood Elf:speed':
    'Fleet of Foot raises a Wood Elf to 35 feet; the SRD records the Elf base of 30.',

  // --- A 2024 feat the app models as a mechanic rather than a row.
  'feat:Ability Score Improvement:missing':
    '2024 turned Ability Score Improvement into a General feat, and the SRD '
    + 'lists it as one. The app models it as the thing it has always been - '
    + 'the ASI slots on `CharClass.asiLevels`, spendable on two points or a '
    + 'feat - so adding a row would put it in the feat list *and* the slot it '
    + 'competes with, and a player could take it twice for one slot.',

  // --- A choice the source flattened into a grant.
  'race:Variant Human:asi':
    'dnd5eapi records +1 to all six abilities. The Variant Human gets +1 to '
    + '*two of your choice*, which the app models as `flexibleAsi` with no '
    + 'baked-in increase - so the app has zero where the source has six, and '
    + 'the app is right. Taking the source literally would hand every Variant '
    + 'Human +6 total.',

  // --- Subclass spell lists.
  'subclassSpells:life 7:spells':
    'dnd5eapi lists only Death Ward at Cleric 7. The PHB and the SRD document '
    + 'both give the Life Domain Guardian of Faith there too, so the book wins.',
  'subclassSpells:land:missing':
    "Circle of the Land's spells depend on which land you picked, and the app "
    + 'does not model that choice. dnd5eapi flattens all seven lands into one '
    + 'list, so granting it would hand a coastal Druid the mountain spells.',
};

/** Normalised the same way findings are, so the keys can be written readably. */
const EXPECTED: Record<string, string> = Object.fromEntries(
  Object.entries(EXPECTED_SOURCE).map(([composite, reason]) => {
    const [domain, name, field] = composite.split(':');
    return [`${domain}:${key(name)}:${field}`, reason];
  }),
);

/** A single disagreement between the app and a fixture. */
interface Finding {
  key: string;
  detail: string;
}

/**
 * Split findings into the ones that were expected and the ones that were not,
 * and report any exception that no longer applies.
 *
 * `fields` is what this particular check looked at, and it matters: two tests
 * share the `spell` domain, and without it the range check would call the five
 * class-list exceptions stale purely because it never examines class lists.
 * Pass `['*']` where the field is open-ended, as it is for subclass features.
 */
function reconcile(findings: Finding[], domains: string[], fields: string[]) {
  const unexpected = findings.filter((f) => !(f.key in EXPECTED));
  const matched = new Set(findings.map((f) => f.key));
  const examined = (k: string) => {
    const parts = k.split(':');
    return domains.includes(parts[0])
      && (fields.includes('*') || fields.includes(parts[parts.length - 1]));
  };
  const stale = Object.keys(EXPECTED).filter((k) => examined(k) && !matched.has(k));
  return { unexpected, stale };
}

const show = (findings: Finding[]) => findings.map((f) => `${f.key} — ${f.detail}`);

// ---------------------------------------------------------------- equipment

interface SrdEquipment {
  name: string; category: string; cost: number; weight: number;
  damage?: string; damageType?: string; versatile?: string | null;
  properties?: string[]; range?: { normal: number; long: number | null } | null;
  baseAc?: number | null; strengthRequirement?: number; stealthDisadvantage?: boolean;
}

describe('the equipment tables against SRD 5.1', () => {
  const srd = records<Record<string, SrdEquipment>>(equipmentFixture);

  it('prices and weighs the gear the way the books do', () => {
    const findings: Finding[] = [];
    for (const item of GEAR) {
      const s = srd[srdKey(item.name)];
      if (!s) continue;
      if (s.cost !== item.cost) {
        findings.push({ key: `gear:${key(item.name)}:cost`, detail: `app ${item.cost}cp, srd ${s.cost}cp` });
      }
      if (Math.abs(s.weight - item.weight) > 0.001) {
        findings.push({ key: `gear:${key(item.name)}:weight`, detail: `app ${item.weight}lb, srd ${s.weight}lb` });
      }
    }
    const { unexpected, stale } = reconcile(findings, ['gear'], ['cost', 'weight']);
    expect(show(unexpected)).toEqual([]);
    expect(stale, 'exceptions that no longer apply').toEqual([]);
  });

  it('gives the 2014 weapons their 2014 stats', () => {
    const findings: Finding[] = [];
    for (const weapon of weaponsFor('2014')) {
      const s = srd[srdKey(weapon.name)];
      if (!s?.damage) continue;
      const k = key(weapon.name);
      const dice = `${weapon.damage.count}d${weapon.damage.die}`;
      if (s.damage !== dice) findings.push({ key: `weapon:${k}:damage`, detail: `app ${dice}, srd ${s.damage}` });
      if (s.damageType !== weapon.damage.type) {
        findings.push({ key: `weapon:${k}:damageType`, detail: `app ${weapon.damage.type}, srd ${s.damageType}` });
      }
      const versatile = weapon.versatileDie ? `1d${weapon.versatileDie}` : null;
      if ((s.versatile ?? null) !== versatile) {
        findings.push({ key: `weapon:${k}:versatile`, detail: `app ${versatile}, srd ${s.versatile}` });
      }
      const props = [...weapon.properties].sort().join(',');
      const srdProps = (s.properties ?? []).join(',');
      if (props !== srdProps) findings.push({ key: `weapon:${k}:properties`, detail: `app [${props}], srd [${srdProps}]` });
      if (s.cost !== weapon.cost) findings.push({ key: `weapon:${k}:cost`, detail: `app ${weapon.cost}cp, srd ${s.cost}cp` });
      if (Math.abs(s.weight - weapon.weight) > 0.001) {
        findings.push({ key: `weapon:${k}:weight`, detail: `app ${weapon.weight}lb, srd ${s.weight}lb` });
      }
      if (s.range && weapon.range && s.range.normal !== weapon.range.normal) {
        findings.push({ key: `weapon:${k}:range`, detail: `app ${weapon.range.normal}, srd ${s.range.normal}` });
      }
    }
    const { unexpected, stale } = reconcile(findings, ['weapon'],
      ['damage', 'damageType', 'versatile', 'properties', 'cost', 'weight', 'range']);
    expect(show(unexpected)).toEqual([]);
    expect(stale, 'exceptions that no longer apply').toEqual([]);
  });

  it('matches the armor table on class, cap and Strength requirement', () => {
    const findings: Finding[] = [];
    for (const armor of ARMOR) {
      const s = srd[srdKey(armor.name)];
      if (!s || s.baseAc == null) continue;
      const k = key(armor.name);
      if (s.baseAc !== armor.baseAc) findings.push({ key: `armor:${k}:baseAc`, detail: `app ${armor.baseAc}, srd ${s.baseAc}` });
      if ((s.strengthRequirement ?? 0) !== (armor.strengthRequirement ?? 0)) {
        findings.push({ key: `armor:${k}:strength`, detail: `app ${armor.strengthRequirement ?? 0}, srd ${s.strengthRequirement}` });
      }
      if (Boolean(s.stealthDisadvantage) !== Boolean(armor.stealthDisadvantage)) {
        findings.push({ key: `armor:${k}:stealth`, detail: `app ${armor.stealthDisadvantage}, srd ${s.stealthDisadvantage}` });
      }
      if (s.cost !== armor.cost) findings.push({ key: `armor:${k}:cost`, detail: `app ${armor.cost}cp, srd ${s.cost}cp` });
      if (Math.abs(s.weight - armor.weight) > 0.001) {
        findings.push({ key: `armor:${k}:weight`, detail: `app ${armor.weight}lb, srd ${s.weight}lb` });
      }
    }
    const { unexpected, stale } = reconcile(findings, ['armor'], ['baseAc', 'strength', 'stealth', 'cost', 'weight']);
    expect(show(unexpected)).toEqual([]);
    expect(stale, 'exceptions that no longer apply').toEqual([]);
  });

  /** Everything the SRD sells should be somewhere in the three tables. */
  it('carries every piece of SRD equipment somewhere', () => {
    const known = new Set([
      ...GEAR.map((g) => srdKey(g.name)),
      ...WEAPONS.map((w) => srdKey(w.name)),
      ...ARMOR.map((a) => srdKey(a.name)),
      // The app models a shield as a flag on the character rather than a row.
      'shield',
      // The books sell a donkey and a mule as one line at the same price; the
      // SRD splits them, and the app follows the books.
      'mule',
    ]);
    const missing = Object.entries(srd)
      .filter(([k]) => !known.has(k))
      .map(([, s]) => s.name);
    expect(missing).toEqual([]);
  });
});

// -------------------------------------------------------------- 2024 weapons

interface SrdWeapon2024 {
  name: string; cost: number; weight: number; damage: string;
  versatile: string | null; properties: string[]; mastery: string | null;
}

describe('the weapon table against SRD 5.2', () => {
  const srd = records<Record<string, SrdWeapon2024>>(weapon2024Fixture);

  it('gives the 2024 weapons their 2024 stats, including mastery', () => {
    const findings: Finding[] = [];
    for (const weapon of weaponsFor('2024')) {
      const s = srd[srdKey(weapon.name)];
      if (!s) continue;
      const k = key(weapon.name);
      const dice = `${weapon.damage.count}d${weapon.damage.die}`;
      if (s.damage !== dice) findings.push({ key: `weapon2024:${k}:damage`, detail: `app ${dice}, srd ${s.damage}` });
      const versatile = weapon.versatileDie ? `1d${weapon.versatileDie}` : null;
      if ((s.versatile ?? null) !== versatile) {
        findings.push({ key: `weapon2024:${k}:versatile`, detail: `app ${versatile}, srd ${s.versatile}` });
      }
      const props = [...weapon.properties].sort().join(',');
      if (props !== s.properties.join(',')) {
        findings.push({ key: `weapon2024:${k}:properties`, detail: `app [${props}], srd [${s.properties.join(',')}]` });
      }
      if ((weapon.mastery ?? null) !== s.mastery) {
        findings.push({ key: `weapon2024:${k}:mastery`, detail: `app ${weapon.mastery}, srd ${s.mastery}` });
      }
      if (Math.abs(s.weight - weapon.weight) > 0.001) {
        findings.push({ key: `weapon2024:${k}:weight`, detail: `app ${weapon.weight}lb, srd ${s.weight}lb` });
      }
    }
    const { unexpected, stale } = reconcile(findings, ['weapon2024'],
      ['damage', 'versatile', 'properties', 'mastery', 'weight']);
    expect(show(unexpected)).toEqual([]);
    expect(stale, 'exceptions that no longer apply').toEqual([]);
  });
});

// -------------------------------------------------------------- magic items

interface SrdMagicItem { name: string; rarity: string; attunement: boolean }

const RARITY: Record<string, string> = {
  Common: 'common', Uncommon: 'uncommon', Rare: 'rare',
  'Very Rare': 'very-rare', Legendary: 'legendary', Artifact: 'artifact',
};

describe('the magic item catalogue against SRD 5.1', () => {
  const srd = records<Record<string, SrdMagicItem>>(magicItemFixture);

  it('rates every item the way the SRD rates it', () => {
    const findings: Finding[] = [];
    for (const item of MAGIC_ITEMS) {
      const s = srd[srdKey(item.name)];
      if (!s) continue;
      const k = key(item.name);
      const rarity = RARITY[s.rarity];
      if (rarity && rarity !== item.rarity) {
        findings.push({ key: `item:${k}:rarity`, detail: `app ${item.rarity}, srd ${s.rarity}` });
      }
      if (s.attunement !== Boolean(item.attunement)) {
        findings.push({ key: `item:${k}:attunement`, detail: `app ${Boolean(item.attunement)}, srd ${s.attunement}` });
      }
    }
    const { unexpected, stale } = reconcile(findings, ['item'], ['rarity', 'attunement']);
    expect(show(unexpected)).toEqual([]);
    expect(stale, 'exceptions that no longer apply').toEqual([]);
  });

  it('carries every SRD magic item', () => {
    const known = new Set(MAGIC_ITEMS.map((i) => srdKey(i.name)));
    // The app splits several families the SRD keeps whole and vice versa; the
    // ones it merges are named here rather than duplicated in the table.
    const MERGED: Record<string, string> = {
      'belt of stone giant strength': 'belt of stone frost giant strength',
      'belt of frost giant strength': 'belt of stone frost giant strength',
      'potion of stone giant strength': 'potion of frost stone giant strength',
      'potion of frost giant strength': 'potion of frost stone giant strength',
    };
    const missing = Object.entries(srd)
      .filter(([k]) => !known.has(k) && !known.has(MERGED[k] ?? ''))
      .map(([, s]) => s.name);
    expect(missing).toEqual([]);
  });
});

// ------------------------------------------------------------------- spells

interface SrdSpell {
  name: string; level: number; school: string;
  concentration: boolean; ritual: boolean; classes: string[];
  range: string; duration: string; castingTime: string;
}

/**
 * The SRD writes casting times as prose; the app models the nine distinct
 * values those 319 spells actually use. Anything not in this map is a time no
 * SRD spell has, and should fail rather than be quietly bucketed.
 */
const CASTING_TIME_FROM_SRD: Record<string, CastingTime> = {
  '1 action': 'action',
  '1 bonus action': 'bonus',
  '1 reaction': 'reaction',
  '1 minute': 'minute',
  '10 minutes': '10-minutes',
  '1 hour': 'hour',
  '8 hours': '8-hours',
  '12 hours': '12-hours',
  '24 hours': '24-hours',
};

/**
 * Durations, reduced to the thing being compared.
 *
 * The SRD writes "Up to 1 hour" and carries concentration in its own field;
 * the app writes "Concentration, up to 1 hour" because that is what belongs on
 * a printed sheet. And a day is twenty-four hours whichever the source says.
 */
function normaliseDuration(text: string): string {
  return text
    .toLowerCase()
    .replace(/^concentration,\s*/, '')
    .replace(/^up to\s*/, '')
    .replace(/\b1 day\b/, '24 hours')
    .trim();
}

describe('the spell list against SRD 5.1', () => {
  const srd = records<Record<string, SrdSpell>>(spellFixture);
  // The app models the Artificer, which the SRD does not carry at all.
  const NOT_IN_SRD = new Set(['artificer']);

  it('matches on level, school, concentration, ritual and class list', () => {
    const findings: Finding[] = [];
    for (const spell of SPELLS) {
      const s = srd[srdKey(spell.name)];
      if (!s) continue;
      const k = key(spell.name);
      if (s.level !== spell.level) findings.push({ key: `spell:${k}:level`, detail: `app ${spell.level}, srd ${s.level}` });
      if (s.school !== spell.school) findings.push({ key: `spell:${k}:school`, detail: `app ${spell.school}, srd ${s.school}` });
      if (s.concentration !== spell.concentration) {
        findings.push({ key: `spell:${k}:concentration`, detail: `app ${spell.concentration}, srd ${s.concentration}` });
      }
      if (s.ritual !== spell.ritual) {
        findings.push({ key: `spell:${k}:ritual`, detail: `app ${spell.ritual}, srd ${s.ritual}` });
      }
      const app = spell.classes.filter((c) => !NOT_IN_SRD.has(c)).sort().join(',');
      const want = s.classes.join(',');
      if (app !== want) findings.push({ key: `spell:${k}:classes`, detail: `app [${app}], srd [${want}]` });
    }
    const { unexpected, stale } = reconcile(findings, ['spell'],
      ['level', 'school', 'concentration', 'ritual', 'classes']);
    expect(show(unexpected)).toEqual([]);
    expect(stale, 'exceptions that no longer apply').toEqual([]);
  });

  /**
   * Range and duration, which nothing was checking - which is how Produce
   * Flame came to be recorded at 30 feet. Its range is Self; the 30 feet is
   * how far you may then hurl the flame, and the two are not the same thing
   * to anything that reads the field.
   *
   * The app writes the shape into the range where the SRD leaves it to the
   * rules text, so "Self (15-foot cone)" is right where the SRD says "Self".
   * That is allowed by prefix. Everything else has to match.
   */
  it('states the range, duration and casting time the books state', () => {
    const findings: Finding[] = [];
    for (const spell of SPELLS) {
      const s = srd[srdKey(spell.name)];
      if (!s) continue;
      const k = key(spell.name);

      const srdRange = s.range.trim().toLowerCase();
      const appRange = String(spell.range).trim().toLowerCase();
      const rangeOk = srdRange === 'self'
        ? appRange === 'self' || appRange.startsWith('self (')
        : srdRange.replace(/\.$/, '') === appRange.replace(/\.$/, '');
      if (!rangeOk) {
        findings.push({ key: `spell:${k}:range`, detail: `app "${spell.range}", srd "${s.range}"` });
      }

      if (normaliseDuration(s.duration) !== normaliseDuration(String(spell.duration))) {
        findings.push({
          key: `spell:${k}:duration`,
          detail: `app "${spell.duration}", srd "${s.duration}"`,
        });
      }

      const wantTime = CASTING_TIME_FROM_SRD[s.castingTime.trim().toLowerCase()];
      if (!wantTime) {
        findings.push({
          key: `spell:${k}:castingTime`,
          detail: `the SRD says "${s.castingTime}", which the app has no value for`,
        });
      } else if (wantTime !== spell.castingTime) {
        findings.push({
          key: `spell:${k}:castingTime`,
          detail: `app "${spell.castingTime}", srd "${s.castingTime}"`,
        });
      }
    }
    const { unexpected, stale } = reconcile(findings, ['spell'], ['range', 'duration', 'castingTime']);
    expect(show(unexpected)).toEqual([]);
    expect(stale, 'exceptions that no longer apply').toEqual([]);
  });

  it('carries every SRD spell', () => {
    const known = new Set(SPELLS.map((s) => srdKey(s.name)));
    const missing = Object.entries(srd).filter(([k]) => !known.has(k)).map(([, s]) => s.name);
    expect(missing).toEqual([]);
  });
});

// ---------------------------------------------------- 2014 subclass spells

interface SrdSubclass2014 {
  name: string;
  class: string | null;
  spells: Record<string, string[]>;
}

/**
 * The spells a subclass hands over. Four of the twelve SRD subclasses have a
 * list and the app grants three of them - Circle of the Land is a choice the
 * app does not model, which is recorded above rather than silently skipped.
 */
describe('the 2014 subclass spell lists against SRD 5.1', () => {
  const srd = records<{ subclasses: Record<string, SrdSubclass2014> }>(coreFixture).subclasses;

  it('grants exactly what the subclass table prints', () => {
    const findings: Finding[] = [];
    for (const [subclassKey, entry] of Object.entries(srd)) {
      const levels = Object.keys(entry.spells);
      if (!levels.length) continue;

      const klass = CLASSES.find((c) => c.id === entry.class);
      const sub = klass?.subclasses.find((s) => key(s.name) === subclassKey)
        ?? klass?.subclasses.find((s) => s.id === subclassKey);
      expect(sub, `no app subclass matches "${entry.name}"`).toBeDefined();

      if (!sub!.spells?.length) {
        findings.push({ key: `subclassSpells:${sub!.id}:missing`, detail: 'the app grants none' });
        continue;
      }

      const ours = new Map(sub!.spells.map((g) => [String(g.level), g.ids]));
      for (const [level, names] of Object.entries(entry.spells)) {
        const book = names.map((n) => srdKey(n)).sort();
        const app = (ours.get(level) ?? []).map((id) => srdKey(SPELLS_BY_ID[id]?.name ?? id)).sort();
        if (app.join('|') !== book.join('|')) {
          findings.push({
            key: `subclassSpells:${sub!.id} ${level}:spells`,
            detail: `app [${app.join(', ')}], srd [${book.join(', ')}]`,
          });
        }
      }
    }
    const { unexpected, stale } = reconcile(findings, ['subclassSpells'], ['spells', 'missing']);
    expect(show(unexpected)).toEqual([]);
    expect(stale, 'exceptions that no longer apply').toEqual([]);
  });

  /** Every id in every list has to resolve, or the grant hands over nothing. */
  it('names spells that exist', () => {
    for (const klass of CLASSES) {
      for (const sub of klass.subclasses) {
        for (const grant of sub.spells ?? []) {
          for (const id of grant.ids) {
            expect(SPELLS_BY_ID[id], `${sub.id} level ${grant.level}: ${id}`).toBeDefined();
          }
        }
      }
    }
  });
});

// -------------------------------------------------------- 2024 subclasses

interface SrdSubclass {
  name: string; class: string; features: { name: string; level: number }[];
}

describe('the 2024 subclasses against SRD 5.2', () => {
  const srd = records<Record<string, SrdSubclass>>(subclass2024Fixture);

  /** SRD 5.2 renamed several subclasses the app still lists under 2014 names. */
  const SUBCLASS_ALIAS: Record<string, string> = {
    'path of the berserker': 'berserker',
    'warrior of the open hand': 'way of the open hand',
    'draconic sorcery': 'draconic bloodline',
    'fiend patron': 'the fiend',
    evoker: 'school of evocation',
  };

  it('places every feature at the level 2024 gives it', () => {
    const byName = new Map<string, { id: string; name: string }>();
    for (const klass of CLASSES) {
      for (const sub of klass.subclasses) byName.set(key(sub.name), { id: sub.id, name: sub.name });
    }

    const findings: Finding[] = [];
    for (const [k, s] of Object.entries(srd)) {
      const match = byName.get(SUBCLASS_ALIAS[k] ?? k) ?? byName.get(k);
      expect(match, `no app subclass matches "${s.name}"`).toBeDefined();
      const table = SUBCLASS_FEATURES_2024[match!.id] ?? SUBCLASS_FEATURES[match!.id] ?? [];
      const app = new Map(table.map((f) => [key(f.name), f.level]));

      for (const feature of s.features) {
        // The SRD runs a couple of feature tables into the name field; compare
        // on the leading words, which are the name proper.
        const fk = key(feature.name).split(' ').slice(0, 4).join(' ');
        const hit = [...app].find(([n]) => n.startsWith(fk) || fk.startsWith(n));
        if (!hit) {
          findings.push({ key: `subclass:${k}:${fk}`, detail: `missing, srd has it at level ${feature.level}` });
        } else if (hit[1] !== feature.level) {
          findings.push({ key: `subclass:${k}:${fk}`, detail: `app level ${hit[1]}, srd level ${feature.level}` });
        }
      }
    }
    const { unexpected, stale } = reconcile(findings, ['subclass'], ['*']);
    expect(show(unexpected)).toEqual([]);
    expect(stale, 'exceptions that no longer apply').toEqual([]);
  });
});

/**
 * The twelve SRD 5.1 subclasses against their own edition.
 *
 * §5 audited the *2024* subclass progressions and found that every one of
 * them had been showing 2014 feature levels. The obvious follow-up - are the
 * 2014 levels themselves right? - was never asked, and the two editions move
 * features often enough that neither table can vouch for the other.
 *
 * Twelve is all SRD 5.1 carries. The other ~108 the app ships have no
 * licensed source; they are labelled rather than verified, which is the
 * standing decision recorded under Provenance and not something this can fix.
 */
describe('the 2014 subclasses against SRD 5.1', () => {
  const srd = records<Record<string, {
    name: string; id: string; features: { level: number; name: string }[];
  }>>(subclass2014Fixture);

  it('places every feature at the level 2014 gives it', () => {
    const findings: Finding[] = [];
    for (const [k, s] of Object.entries(srd)) {
      const table = SUBCLASS_FEATURES[s.id] ?? [];
      expect(table.length, `no app features for subclass "${s.id}"`).toBeGreaterThan(0);
      const app = new Map(table.map((f) => [key(f.name), f.level]));

      for (const feature of s.features) {
        const fk = key(feature.name);
        const hit = [...app].find(([n]) => n === fk || n.startsWith(fk) || fk.startsWith(n));
        if (!hit) {
          findings.push({
            key: `subclass2014:${k}:${fk}`,
            detail: `missing; the SRD grants it at level ${feature.level}`,
          });
        } else if (hit[1] !== feature.level) {
          findings.push({
            key: `subclass2014:${k}:${fk}`,
            detail: `app level ${hit[1]}, srd level ${feature.level}`,
          });
        }
      }
    }
    const { unexpected, stale } = reconcile(findings, ['subclass2014'], ['*']);
    expect(show(unexpected)).toEqual([]);
    expect(stale, 'exceptions that no longer apply').toEqual([]);
  });

  it('covers all twelve, so a subclass cannot pass by being absent', () => {
    expect(Object.keys(srd)).toHaveLength(12);
  });
});

// --------------------------------------------------------------------- core

interface SrdCore {
  classes: Record<string, {
    name: string; hitDie: number; saves: string[]; skillPicks: number | null;
    /** Armor and weapon categories, saving throws excluded - checked above. */
    proficiencies?: string[];
    /** `null` where the SRD says "choose any", which the Bard does. */
    skillOptions?: string[] | null;
  }>;
  races: Record<string, { name: string; speed: number; size: string; asi: Record<string, number> }>;
  /** The four SRD 5.1 subraces, carrying their own increase only. */
  subraces: Record<string, { name: string; parent: string | null; asi: Record<string, number> }>;
  skills: Record<string, { name: string; ability: string }>;
  sorceryPointCosts: Record<string, number>;
  conditions: string[];
  languages: string[];
}

describe('classes, races, skills, conditions and languages against SRD 5.1', () => {
  const srd = records<SrdCore>(coreFixture);

  it('matches every class on hit die, saves and skill picks', () => {
    const findings: Finding[] = [];
    for (const klass of CLASSES) {
      const s = srd.classes[key(klass.name)];
      if (!s) continue;
      const k = key(klass.name);
      if (s.hitDie !== klass.hitDie) findings.push({ key: `class:${k}:hitDie`, detail: `app d${klass.hitDie}, srd d${s.hitDie}` });
      const saves = [...klass.saves].sort().join(',');
      if (saves !== s.saves.join(',')) findings.push({ key: `class:${k}:saves`, detail: `app [${saves}], srd [${s.saves.join(',')}]` });
      if (s.skillPicks != null && s.skillPicks !== klass.skillChoices.count) {
        findings.push({ key: `class:${k}:skillPicks`, detail: `app ${klass.skillChoices.count}, srd ${s.skillPicks}` });
      }
    }
    const { unexpected, stale } = reconcile(findings, ['class'], ['hitDie', 'saves', 'skillPicks']);
    expect(show(unexpected)).toEqual([]);
    expect(stale, 'exceptions that no longer apply').toEqual([]);
  });

  it('gives every class the armor and weapon proficiency the SRD gives it', () => {
    /*
      `armorProficiency` and `weaponProficiency` drive AC, the attack line and
      half the feat prerequisites, and until 2026-08-09 nothing compared
      either - the class check next door read hit die, saves and skill picks
      and stopped. A Fighter who had lost heavy armor would have shown a wrong
      AC on every screen and failed no test.
    */
    const findings: Finding[] = [];
    for (const klass of CLASSES) {
      const s = srd.classes[key(klass.name)];
      if (!s?.proficiencies) continue;
      const mine = [
        ...klass.armorProficiency,
        ...(klass.weaponProficiency.categories ?? []),
      ].sort().join(',');
      const theirs = [...s.proficiencies].sort().join(',');
      if (mine !== theirs) {
        findings.push({
          key: `class:${key(klass.name)}:proficiencies`,
          detail: `app [${mine}], srd [${theirs}]`,
        });
      }
    }
    const { unexpected, stale } = reconcile(findings, ['class'], ['proficiencies']);
    expect(show(unexpected)).toEqual([]);
    expect(stale, 'exceptions that no longer apply').toEqual([]);
  });

  it('offers every class the skills the SRD lets it choose from', () => {
    /*
      The count was checked; the list never was. A wrong list is the Builder
      offering a skill the class cannot take, or hiding one it can - and it
      cannot be caught by looking at a number.

      `null` means the SRD says "choose any", which the Bard does and which is
      a real answer rather than a missing one.
    */
    const byId = new Map(SKILLS.map((sk) => [sk.id, sk.name]));
    const findings: Finding[] = [];
    for (const klass of CLASSES) {
      const s = srd.classes[key(klass.name)];
      if (!s || s.skillOptions === undefined) continue;

      const mine = klass.skillChoices.from.map((id) => byId.get(id) ?? id).sort();
      if (s.skillOptions === null) {
        // "Choose any three" - the app spells the whole list out, so the
        // comparison is against every skill rather than against nothing.
        if (mine.length !== SKILLS.length) {
          findings.push({
            key: `class:${key(klass.name)}:skillOptions`,
            detail: `srd says any skill; app offers ${mine.length} of ${SKILLS.length}`,
          });
        }
        continue;
      }
      const theirs = [...s.skillOptions].sort();
      if (mine.join(', ') !== theirs.join(', ')) {
        findings.push({
          key: `class:${key(klass.name)}:skillOptions`,
          detail: `app [${mine.join(', ')}], srd [${theirs.join(', ')}]`,
        });
      }
    }
    const { unexpected, stale } = reconcile(findings, ['class'], ['skillOptions']);
    expect(show(unexpected)).toEqual([]);
    expect(stale, 'exceptions that no longer apply').toEqual([]);
  });

  it('matches every 2014 lineage on speed, size and ability increases', () => {
    const findings: Finding[] = [];
    // Only the 2014 lineages, because this fixture is SRD 5.1 - the 2024
    // species share their names and differ on purpose. A Forest Gnome moves at
    // 25 feet in 2014 and 30 in 2024, and comparing the latter to the former
    // is how this check first reported a bug that was not there.
    const in2014 = RACES.filter((r) => (r.rulesets ?? ['2014']).includes('2014'));

    // A lineage's numbers live on its subraces where it has any, because that
    // is where the books put them.
    const children = new Map<string, typeof RACES>();
    for (const race of in2014) {
      if (!race.parent) continue;
      const list = children.get(key(race.parent)) ?? [];
      list.push(race);
      children.set(key(race.parent), list);
    }

    for (const [k, s] of Object.entries(srd.races)) {
      const kids = children.get(k);
      const compare = kids ?? in2014.filter((r) => key(r.name) === k && !r.parent);
      for (const race of compare) {
        if (s.speed !== race.speed) {
          findings.push({ key: `race:${key(race.name)}:speed`, detail: `app ${race.speed}, srd ${s.speed}` });
        }
        if (s.size.toLowerCase() !== race.size.toLowerCase()) {
          findings.push({ key: `race:${key(race.name)}:size`, detail: `app ${race.size}, srd ${s.size}` });
        }

        /*
          The ability increases, which this test has claimed in its own name
          since it was written and did not compare until 2026-08-09. They are
          the part of a lineage that moves a number on the sheet - a wrong +2
          is a wrong modifier, a wrong attack bonus and a wrong save DC - so
          leaving them out made the title the least accurate line in the file.

          The app flattens lineages: "Hill Dwarf" holds the Dwarf's +2
          Constitution *and* its own +1 Wisdom, while the fixture keeps them
          apart. So the lineage's own bonuses have to be a subset here, and
          the subrace check below covers the other half.
        */
        for (const [ability, bonus] of Object.entries(s.asi)) {
          const mine = (race.asi as Partial<Record<Ability, number>> | undefined)?.[ability as Ability] ?? 0;
          if (mine !== bonus) {
            findings.push({
              key: `race:${key(race.name)}:asi`,
              detail: `${ability}: app +${mine}, srd +${bonus}`,
            });
          }
        }
      }
    }
    const { unexpected, stale } = reconcile(findings, ['race'], ['speed', 'size', 'asi']);
    expect(show(unexpected)).toEqual([]);
    expect(stale, 'exceptions that no longer apply').toEqual([]);
  });

  it('gives each SRD subrace its own increase on top of its lineage', () => {
    /*
      The other half of the flattening. SRD 5.1 carries four subraces, and for
      each one the app's single entry must equal the lineage's bonuses plus
      the subrace's own - no more and no less. A Hill Dwarf who lost the +2
      Constitution, or kept it twice, fails here rather than on a sheet.
    */
    const wrong: string[] = [];
    for (const sub of Object.values(srd.subraces)) {
      const parent = sub.parent ? srd.races[key(sub.parent)] : null;
      const want: Record<string, number> = { ...(parent?.asi ?? {}) };
      for (const [ability, bonus] of Object.entries(sub.asi)) {
        want[ability] = (want[ability] ?? 0) + bonus;
      }
      const race = RACES.find((r) => key(r.name) === key(sub.name));
      if (!race) {
        wrong.push(`${sub.name}: not in the app at all`);
        continue;
      }
      const mine = Object.fromEntries(
        Object.entries(race.asi ?? {}).filter(([, n]) => n),
      );
      if (JSON.stringify(mine) !== JSON.stringify(want)) {
        wrong.push(`${sub.name}: app ${JSON.stringify(mine)}, srd ${JSON.stringify(want)}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('carries all eighteen skills against the right abilities', () => {
    const app = new Map(SKILLS.map((s) => [key(s.name), s.ability]));
    const findings: Finding[] = [];
    for (const [k, s] of Object.entries(srd.skills)) {
      const ability = app.get(k);
      if (!ability) findings.push({ key: `skill:${k}:missing`, detail: 'not in the app' });
      else if (ability !== s.ability) findings.push({ key: `skill:${k}:ability`, detail: `app ${ability}, srd ${s.ability}` });
    }
    expect(show(findings)).toEqual([]);
    expect(SKILLS).toHaveLength(Object.keys(srd.skills).length);
  });

  it("charges Font of Magic's rate for a made spell slot", () => {
    // The rate is not derivable - 5 points for a 3rd-level slot, 6 for a 4th -
    // so the whole value of having it in a table is that it came from the SRD
    // and not from memory.
    expect(
      Object.fromEntries(
        Object.entries(SORCERY_POINT_SLOT_COSTS).map(([level, cost]) => [String(level), cost]),
      ),
    ).toEqual(srd.sorceryPointCosts);
  });

  it('carries every condition and every language', () => {
    const conditions = new Set(CONDITIONS.map((c) => key(c.name)));
    const missingConditions = srd.conditions
      // Exhaustion is a six-level track rather than an on/off state, so it is
      // modelled apart from the rest in `EXHAUSTION_LEVELS`.
      .filter((c) => key(c) !== 'exhaustion')
      .filter((c) => !conditions.has(key(c)));
    expect(missingConditions).toEqual([]);

    const languages = new Set(LANGUAGES.map((l) => key(l.name)));
    const missingLanguages = srd.languages.filter((l) => !languages.has(key(l)));
    expect(missingLanguages).toEqual([]);
  });
});

/**
 * Feats and backgrounds against both SRDs.
 *
 * This item spent two sections marked "blocked, no source" because nobody had
 * checked the 2024 namespace - `/api/feats` aliases to 2014 and answers with
 * Grappler alone. See §49. The source was there the whole time.
 *
 * ## Why the counts do not, and cannot, match
 *
 * The app ships 97 feats and 29 backgrounds. SRD 5.2 carries **17 and 4**;
 * SRD 5.1 carries **1 and 1**. So most of both tables has no licensed source
 * and never will, exactly like the ~108 non-SRD subclasses.
 *
 * That shapes what these checks can be. They are not "every row is verified" -
 * they are **"every row the SRD covers agrees, and the remainder is counted
 * rather than assumed"**. The coverage figures are pinned so that a row moving
 * between the two groups has to be looked at: silently dropping an SRD feat
 * would otherwise just make the covered set smaller.
 */
describe('feats and backgrounds against SRD 5.1 and 5.2', () => {
  const srd = records<Record<string, {
    feats: Record<string, { name: string; category: string | null }>;
    backgrounds: Record<string, {
      name: string; abilities: string[]; originFeat: string | null; skills: string[];
    }>;
  }>>(featBackgroundFixture);

  const appFeats = (ruleset: Ruleset) =>
    new Map(featsFor(ruleset).map((f) => [key(f.name), f]));
  const appBackgrounds = (ruleset: Ruleset) =>
    new Map(BACKGROUNDS.filter((b) => b.rulesets.includes(ruleset)).map((b) => [key(b.name), b]));

  it('carries every feat the SRD prints, in the edition that prints it', () => {
    const findings: Finding[] = [];
    for (const ruleset of RULESETS) {
      const mine = appFeats(ruleset);
      for (const [k, s] of Object.entries(srd[ruleset].feats)) {
        const feat = mine.get(k);
        if (!feat) {
          findings.push({ key: `feat:${k}:missing`, detail: `SRD ${ruleset} has it; the app does not` });
          continue;
        }
        // 2014 has no feat categories at all, so `category` is only compared
        // where the source states one.
        if (s.category && feat.category !== s.category) {
          findings.push({
            key: `feat:${k}:category`,
            detail: `app ${feat.category ?? 'none'}, srd ${s.category}`,
          });
        }
      }
    }
    const { unexpected, stale } = reconcile(findings, ['feat'], ['missing', 'category']);
    expect(show(unexpected)).toEqual([]);
    expect(stale, 'exceptions that no longer apply').toEqual([]);
  });

  it('gives every SRD background its abilities, origin feat and skills', () => {
    /*
      The three fields that move real numbers under 2024: `abilities` decides
      where +2/+1 can go, `originFeatId` is a free feat at 1st level, and the
      skills are proficiencies. A wrong row here is a wrong modifier on a
      sheet, which is why backgrounds were worth chasing a source for at all.
    */
    const findings: Finding[] = [];
    for (const ruleset of RULESETS) {
      const mine = appBackgrounds(ruleset);
      for (const [k, s] of Object.entries(srd[ruleset].backgrounds)) {
        const bg = mine.get(k);
        if (!bg) {
          findings.push({ key: `background:${k}:missing`, detail: `SRD ${ruleset} has it; the app does not` });
          continue;
        }
        if (s.abilities.length) {
          const theirs = [...s.abilities].sort().join(',');
          const ours = [...(bg.abilities ?? [])].sort().join(',');
          if (ours !== theirs) {
            findings.push({ key: `background:${k}:abilities`, detail: `app [${ours}], srd [${theirs}]` });
          }
        }
        if (s.originFeat) {
          const granted = bg.originFeatId ? featById(bg.originFeatId, ruleset) : undefined;
          if (key(granted?.name ?? '') !== key(s.originFeat)) {
            findings.push({
              key: `background:${k}:originFeat`,
              detail: `app ${granted?.name ?? bg.originFeatId ?? 'none'}, srd ${s.originFeat}`,
            });
          }
        }
        if (s.skills.length) {
          const theirs = [...s.skills].map((n) => key(n)).sort().join(', ');
          const ours = [...bg.skills].map((id) => key(SKILLS.find((sk) => sk.id === id)?.name ?? id)).sort().join(', ');
          if (ours !== theirs) {
            findings.push({ key: `background:${k}:skills`, detail: `app [${ours}], srd [${theirs}]` });
          }
        }
      }
    }
    const { unexpected, stale } = reconcile(
      findings, ['background'], ['missing', 'abilities', 'originFeat', 'skills'],
    );
    expect(show(unexpected)).toEqual([]);
    expect(stale, 'exceptions that no longer apply').toEqual([]);
  });

  it('makes the boon it was missing a real, takeable feat', () => {
    /*
      A row in the table is not the deliverable - the deliverable is a 19th
      level character being offered it. Boon of the Night Spirit was the one
      SRD feat the app did not have, and it is checked here the way a player
      reaches it: through the ruleset-aware lookup the Builder uses, with its
      prerequisite and its epic-boon slot intact.
    */
    const boon = featById('boon-of-the-night-spirit', '2024');
    expect(boon, 'the boon the SRD has and the app did not').toBeDefined();
    expect(boon!.category).toBe('epic-boon');
    expect(boon!.prereq?.minLevel).toBe(19);
    // 2024 only: epic boons do not exist in 2014, and a 2014 character asking
    // for it must not silently get one.
    expect(featsFor('2024').some((f) => f.id === 'boon-of-the-night-spirit')).toBe(true);
    expect(featsFor('2014').some((f) => f.id === 'boon-of-the-night-spirit')).toBe(false);
  });

  it('has every epic boon the SRD prints, and says which ones it adds', () => {
    // The app carries nine boons where the SRD prints seven. Being *longer*
    // than the source hid being incomplete, which is how the missing one
    // survived: nobody compares a list to a shorter list.
    const boons = featsFor('2024').filter((f) => f.category === 'epic-boon');
    const srdBoons = Object.values(srd['2024'].feats)
      .filter((f) => f.category === 'epic-boon').map((f) => f.name).sort();
    const mine = boons.map((f) => f.name).sort();
    expect(srdBoons.every((n) => mine.includes(n)), 'every SRD boon is present').toBe(true);
    expect(mine.filter((n) => !srdBoons.includes(n))).toEqual([
      // 2024 PHB, not in the SRD. Labelled, not verified.
      'Boon of Recovery', 'Boon of Skill', 'Boon of Speed',
    ]);
  });

  it('counts how much of each table the SRD actually covers', () => {
    /*
      The number this item is really about. Pinned rather than computed into a
      message, because the whole risk here is a table quietly drifting away
      from its source - and a coverage figure that moves on its own is the
      first sign of it.
    */
    const covered = (appNames: Iterable<string>, srdKeys: string[]) =>
      [...appNames].filter((k) => srdKeys.includes(k)).length;

    const feats2024 = appFeats('2024');
    const bg2024 = appBackgrounds('2024');

    expect({
      feats: {
        app: feats2024.size,
        srd: Object.keys(srd['2024'].feats).length,
        covered: covered(feats2024.keys(), Object.keys(srd['2024'].feats)),
      },
      backgrounds: {
        app: bg2024.size,
        srd: Object.keys(srd['2024'].backgrounds).length,
        covered: covered(bg2024.keys(), Object.keys(srd['2024'].backgrounds)),
      },
    }).toEqual({
      /*
        Sixteen of the SRD's seventeen 2024 feats are rows here; the
        seventeenth is Ability Score Improvement, which the app models as a
        slot rather than a feat (see EXPECTED). The other fifty-four of the
        app's seventy are 2024 PHB content with no licensed source, and stay
        labelled rather than verified.

        `app: 70` moved from 69 the moment Boon of the Night Spirit was
        added, which is the check doing its job - a coverage figure that
        drifts on its own is the first sign of a table leaving its source.
      */
      feats: { app: 70, srd: 17, covered: 16 },
      backgrounds: { app: 16, srd: 4, covered: 4 },
    });
  });
});

/**
 * The 2014 class feature table against SRD 5.1.
 *
 * The check above compares hit die, saves and skill picks - the only three
 * fields `srd-2014-core.json` carries - and for a long time that was the whole
 * of "the classes are audited". `CLASS_FEATURES` was checked against nothing,
 * and it is the table the Builder's Class features panel, the printed sheet's
 * Features and Traits box and the level-up summary all read from. When this
 * fixture was finally added it found **eight features the app did not have**,
 * including all three things a Monk spends ki on and the Paladin's level-18
 * aura expansion, plus a Barbarian ladder that a 2024 character was getting
 * on top of the feature that replaced it.
 *
 * ## What is compared, and what is not
 *
 * Names are matched on their **base**: the trailing parenthetical is dropped,
 * so "Brutal Critical (2 dice)" and "Brutal Critical (1 die)" are the same
 * feature - and then matched *per level*, so the app still has to carry a row
 * at 9, 13 and 17 to satisfy a source that grants it three times. That is the
 * shape that tells a scaling tier apart from a missing grant while letting the
 * two tables word the parenthetical differently.
 *
 * The fixture has already dropped the rows this table is not meant to hold:
 * Ability Score Improvements (they live on `CharClass.asiLevels`), subclass
 * placeholders, and the per-subclass repeats of every level. See
 * `classLevels2014` in the refresh script.
 *
 * Only 2014-applicable rows are compared, because the app's table serves both
 * editions off one list. **The 2024 half of this table is still unverified** -
 * no fixture anywhere carries 2024 class features - so a row tagged `['2014']`
 * here is a claim about SRD 5.1 only, and rows added for 2024 are still
 * written from the books.
 */
describe('the 2014 class feature table against SRD 5.1', () => {
  const srd = records<Record<string, { name: string; levels: { level: number; features: string[] }[] }>>(
    classLevelsFixture,
  );

  /**
   * Where the two tables name the same feature differently.
   *
   * Deliberately tiny. `key` already flattens punctuation, so the SRD's "Ki
   * Empowered Strikes" and the app's "Ki-Empowered Strikes" match with no
   * entry here; only a genuine difference in words needs one.
   */
  const ALIAS_SOURCE: Record<string, string> = {
    // SRD 5.1 prints the Wizard capstone singular; the PHB does not.
    'signature spell': 'signature spells',
    // The SRD splits Flexible Casting into its two directions. The app lists
    // the feature once, which is how the PHB prints it.
    'flexible casting creating spell slots': 'flexible casting',
    'flexible casting converting spell slot': 'flexible casting',
  };
  const ALIAS: Record<string, string> = Object.fromEntries(
    Object.entries(ALIAS_SOURCE).map(([from, to]) => [key(from), key(to)]),
  );

  /** The comparable form of a feature name: no tier, no class suffix, aliased. */
  const base = (name: string) => {
    const stripped = name
      // "Spellcasting: Bard" is the SRD disambiguating twelve rows that the
      // app never needs to tell apart - each one sits under its own class.
      .replace(/^Spellcasting:.*/, 'Spellcasting')
      .replace(/\s*\([^)]*\)\s*$/, '');
    const k = key(stripped);
    return ALIAS[k] ?? k;
  };

  it('grants every feature the SRD grants, at the level the SRD grants it', () => {
    const findings: Finding[] = [];
    for (const [id, table] of Object.entries(srd)) {
      const mine = (CLASS_FEATURES[id as ClassId] ?? []).filter(
        (f) => !f.rulesets || f.rulesets.includes('2014'),
      );
      for (const row of table.levels) {
        for (const feature of row.features) {
          const want = base(feature);
          if (mine.some((f) => f.level === row.level && base(f.name) === want)) continue;
          findings.push({
            key: `classFeature:${id} ${row.level}:missing`,
            detail: `the SRD grants ${table.name} "${feature}" at level ${row.level}; the app has nothing by that name there`,
          });
        }
      }
    }
    const { unexpected, stale } = reconcile(findings, ['classFeature'], ['missing']);
    expect(show(unexpected)).toEqual([]);
    expect(stale, 'exceptions that no longer apply').toEqual([]);
  });

  it('covers every SRD class, so a class cannot go unchecked by being absent', () => {
    // The check above iterates the fixture, so a class the fixture lost would
    // pass it in silence. The artificer is the one deliberate absence: it is
    // not in the SRD at all.
    const inFixture = new Set(Object.keys(srd));
    const unchecked = CLASSES
      // An SRD audit has nothing to say about content that was never in a
      // book. The app's own classes are excluded by `source` rather than by
      // name, so a fifth would be excluded automatically and a *published*
      // class could never be excluded by accident.
      .filter((c) => !isOriginal(c.source))
      .map((c) => c.id)
      .filter((id) => id !== 'artificer' && !inFixture.has(id));
    expect(unchecked).toEqual([]);
    expect(inFixture.size).toBe(12);
  });

  it('puts nothing at a level the SRD leaves empty, except where 2024 owns it', () => {
    /*
      The other direction, and the one that caught a live bug: a 2014-legal
      feature at a level the SRD's 2014 table does not mention. Extra rows are
      allowed - the app models the Warlock's invocation count as features where
      the SRD puts it in a table column - so this reports rather than fails,
      and the list is pinned so a new one has to be looked at.
    */
    const extra: string[] = [];
    for (const [id, table] of Object.entries(srd)) {
      const granted = new Map(table.levels.map((r) => [r.level, r.features.map(base)]));
      for (const f of CLASS_FEATURES[id as ClassId] ?? []) {
        if (f.rulesets && !f.rulesets.includes('2014')) continue;
        if (granted.get(f.level)?.includes(base(f.name))) continue;
        extra.push(`${id} L${f.level} ${f.name}`);
      }
    }
    expect(extra).toEqual([
      // `classLevels2014` strips subclass placeholders, which is right for
      // "Divine Domain feature" at level 6 and wrong for the level the
      // subclass is *chosen* at - the app keeps a row there because that row
      // is the Builder's prompt to pick one. Only the two classes that choose
      // at 1st level land here; the rest choose at 2 or 3, where the SRD names
      // the choice without the word "feature" and both tables agree.
      'cleric L1 Divine Domain',
      'warlock L1 Otherworldly Patron',
      // The SRD prints Invocations Known as a column on the Warlock table; the
      // app makes each increase a feature so the level-up summary can say
      // "a fifth invocation" instead of nothing.
      'warlock L5 Eldritch Invocations',
      'warlock L7 Eldritch Invocations',
      'warlock L9 Eldritch Invocations',
      'warlock L12 Eldritch Invocations',
      'warlock L15 Eldritch Invocations',
      'warlock L18 Eldritch Invocations',
    ]);
  });
});

/**
 * Spell slots, cantrips and spells known against SRD 5.1.
 *
 * Five tables rested on one transcription and had no source: the full-caster
 * slot grid, the pact-slot ladder, `CANTRIPS_KNOWN`, `SPELLS_KNOWN`, and the
 * half-caster round-*up* in `soleCasterLevel` - a rule whose comment already
 * claimed it was "verified against the SRD 5.1 Paladin and Ranger tables at
 * all 20 levels" with nothing in the repo doing the verifying.
 *
 * These are also the numbers with the longest blast radius in the app. Slots
 * feed the Spells panel, the printed sheet, play tracking, the legality
 * check's `topSlotLevel`, and the caster half of the damage model. A wrong
 * row is wrong in six places at once.
 *
 * So the check runs `deriveBuild` rather than reading the tables: it compares
 * what a real character of that class and level ends up holding, which is the
 * only thing a player sees. A table that is right and a lookup that is wrong
 * fails here, and reading `FULL_CASTER_SLOTS` directly would not notice.
 */
describe('spell slots, cantrips and spells known against SRD 5.1', () => {
  const srd = records<Record<string, {
    name: string;
    levels: {
      level: number;
      casting?: { slots: number[]; cantripsKnown: number | null; spellsKnown: number | null };
    }[];
  }>>(classLevelsFixture);

  const derive = (classId: ClassId, level: number) =>
    deriveBuild({
      ...emptyBuild(),
      ruleset: '2014',
      raceId: 'human',
      classes: [{ classId, level }],
    });

  it('gives every class the slots its own table prints, at all twenty levels', () => {
    const wrong: string[] = [];
    for (const [id, table] of Object.entries(srd)) {
      for (const row of table.levels) {
        if (!row.casting) continue;
        const casting = derive(id as ClassId, row.level).spellcasting;

        /*
          The Warlock is the one class whose printed row is not the slot grid:
          the SRD prints its pact slots in the same columns as everyone else's,
          so `spell_slots_level_5: 3` at Warlock 11 means three pact slots at
          5th level, not three fifth-level slots from the shared pool. The app
          keeps them apart on purpose - a Warlock 5 / Sorcerer 5 has both - so
          the comparison is against `pact`, and this is the one place the two
          shapes have to be reconciled rather than compared.
        */
        if (id === 'warlock') {
          const level = row.casting.slots.reduce((best, n, i) => (n > 0 ? i + 1 : best), 0);
          const count = level ? row.casting.slots[level - 1] : 0;
          const pact = casting.pact;
          if (!pact || pact.level !== level || pact.count !== count) {
            wrong.push(`warlock L${row.level}: app ${pact ? `${pact.count}x${pact.level}` : 'none'}, srd ${count}x${level}`);
          }
          continue;
        }

        const mine = casting.bySpellLevel.join(',');
        const theirs = row.casting.slots.join(',');
        if (mine !== theirs) wrong.push(`${id} L${row.level}: app [${mine}], srd [${theirs}]`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('gives every class the cantrips its own table prints', () => {
    const wrong: string[] = [];
    for (const [id, table] of Object.entries(srd)) {
      for (const row of table.levels) {
        const want = row.casting?.cantripsKnown;
        if (want == null) continue;
        const got = derive(id as ClassId, row.level).spellcasting.cantripsKnown;
        if (got !== want) wrong.push(`${id} L${row.level}: app ${got}, srd ${want}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('gives the known casters the spells their table prints', () => {
    const wrong: string[] = [];
    for (const [id, table] of Object.entries(srd)) {
      for (const row of table.levels) {
        const want = row.casting?.spellsKnown;
        if (want == null) continue;
        const got = derive(id as ClassId, row.level).spellcasting.spellsKnown;
        // A preparer has no known count at all, which is a different answer
        // from zero and is why `spellsKnown` is nullable.
        if (got !== want) wrong.push(`${id} L${row.level}: app ${got ?? 'prepares'}, srd ${want}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('starts each caster at the level the SRD starts them', () => {
    /*
      The off-by-one that the round-up rule exists to get right: a 2014 Paladin
      and Ranger have no slots at all at level 1, and the multiclass formula
      would also give a *single-class* Paladin 5 three 1st-level slots instead
      of four-and-two. Pinned from the fixture rather than asserted from
      memory, both ends.
    */
    const first = (id: string) =>
      srd[id].levels.find((r) => r.casting?.slots.some((n) => n > 0))?.level ?? null;
    expect(first('paladin')).toBe(2);
    expect(first('ranger')).toBe(2);
    expect(first('wizard')).toBe(1);
    expect(derive('paladin', 1).spellcasting.bySpellLevel.every((n) => n === 0)).toBe(true);
    expect(derive('paladin', 5).spellcasting.bySpellLevel.slice(0, 2)).toEqual([4, 2]);
  });
});

/**
 * The 2014 class resource columns against SRD 5.1.
 *
 * §5 audited the *2024* resource progressions against SRD 5.2 and left their
 * 2014 originals resting on a hand transcription - the exact asymmetry that
 * §5's own finding warned about, since it had just caught every 2024 subclass
 * wearing 2014 levels.
 *
 * Only the columns the app actually tracks as a spendable resource are
 * compared. The SRD prints several more - sneak attack dice, the Martial Arts
 * die, rage damage, aura range - which are numbers a feature *has* rather than
 * a pool a player spends, and the app models those on the feature rather than
 * in `CLASS_RESOURCES`. Comparing them here would mean inventing rows nobody
 * ticks down.
 */
describe('the 2014 class resource columns against SRD 5.1', () => {
  const srd = records<Record<string, {
    levels: { level: number; resources?: Record<string, unknown> | null }[];
  }>>(classLevelsFixture);

  /** The SRD's column name for each resource the app tracks. */
  const COLUMN: Record<string, string> = {
    'barbarian:rage': 'rage_count',
    'monk:ki': 'ki_points',
    'fighter:action-surge': 'action_surges',
    'fighter:indomitable': 'indomitable_uses',
    'sorcerer:sorcery-points': 'sorcery_points',
    'cleric:channel-divinity': 'channel_divinity_charges',
  };

  /*
    Two SRD columns deliberately have no row above, and both were findings
    against the test rather than the app when this was first written:

    `arcane_recovery_levels` counts *slot levels recovered*, not uses. The
    app's resource is the one use a day, which is right, and the levels are
    `resource.detail` - checked separately below rather than mapped to a
    count that means something else.

    `favored_enemies` is the 2014 Favored Enemy, a list of creature types
    with nothing to spend. The app's `favored-enemy` row is the *2024*
    resource of the same name, which is free castings of Hunter's Mark - a
    different rule that happens to share a label. Comparing them made a
    2024-only row look like a missing 2014 one.
  */

  const mods = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };

  it('gives every tracked resource the count its column prints, at every level', () => {
    const wrong: string[] = [];
    for (const [key_, column] of Object.entries(COLUMN)) {
      const [classId, resourceId] = key_.split(':') as [ClassId, string];
      for (const row of srd[classId].levels) {
        const printed = row.resources?.[column];
        if (typeof printed !== 'number') continue;
        /*
          The SRD encodes "unlimited" as 9999 - a Barbarian's rages at 20th
          level. The app stops the tracker at six and says so in a note,
          because a pip row with 9999 pips is not a tracker.
        */
        if (printed >= 9999) continue;

        const klass = CLASSES.find((c) => c.id === classId)!;
        const held = heldResources(
          [{ klass, entry: { classId, level: row.level } }] as never,
          '2014',
          mods,
        ).find((h) => h.resource.id === resourceId);
        const mine = held?.max ?? 0;
        if (mine !== printed) {
          wrong.push(`${classId} L${row.level} ${resourceId}: app ${mine}, srd ${printed}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('tells a Wizard how much Arcane Recovery actually gives back', () => {
    /*
      The column the map above deliberately skips, checked in its own terms.
      The app tracked one use a day - correct - and left "half your level
      rounded up" as prose in a tooltip, so a 13th-level Wizard was told the
      formula and left to run it. `detail` computes it; this pins it against
      the SRD's own column at every level.
    */
    const wrong: string[] = [];
    for (const row of srd.wizard.levels) {
      const printed = row.resources?.arcane_recovery_levels;
      if (typeof printed !== 'number') continue;
      const held = heldResources(
        [{ klass: CLASSES.find((c) => c.id === 'wizard')!, entry: { classId: 'wizard', level: row.level } }] as never,
        '2014',
        mods,
      ).find((h) => h.resource.id === 'arcane-recovery');
      // One use a day at every level, and the levels it restores on top.
      if (held?.max !== 1) wrong.push(`L${row.level}: ${held?.max} uses, expected 1`);
      if (held?.detail !== `${printed} levels of slots`) {
        wrong.push(`L${row.level}: app "${held?.detail}", srd ${printed} levels`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('starts each resource at the level the column first shows it', () => {
    // `minLevel` is a separate field from the count table and can disagree
    // with it - a Monk's ki column reads 0 at 1st level and 2 at 2nd.
    const wrong: string[] = [];
    for (const [key_, column] of Object.entries(COLUMN)) {
      const [classId, resourceId] = key_.split(':') as [ClassId, string];
      const rows = srd[classId].levels;
      const firstPrinted = rows.find((r) => typeof r.resources?.[column] === 'number'
        && (r.resources[column] as number) > 0)?.level;
      const resource = resourcesForClass(classId, '2014').find((r) => r.id === resourceId);
      if (!firstPrinted || !resource) continue;
      if (resource.minLevel !== firstPrinted) {
        wrong.push(`${classId} ${resourceId}: app from ${resource.minLevel}, srd from ${firstPrinted}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

/**
 * The 2024 class resource counts.
 *
 * This table was 2014-only for a long time, on the recorded belief that "the
 * 2024 sources describe what changed qualitatively and never print the
 * per-level tables". They do: SRD 5.2 prints a column per resource, and the
 * fixture is that column. This check exists so the belief cannot come back.
 */
describe('the 2024 class resources against SRD 5.2', () => {
  const srd = records<Record<string, Record<string, { level: number; value: string }[]>>>(
    class2024Fixture,
  );

  /** Which of our resources answers which column of the printed table. */
  const COLUMNS: [ClassId, string, string][] = [
    ['barbarian', 'rage', 'Rages'],
    ['cleric', 'channel-divinity', 'Channel Divinity'],
    ['fighter', 'second-wind', 'Second Wind'],
    ['paladin', 'channel-divinity-paladin', 'Channel Divinity'],
    ['ranger', 'favored-enemy', 'Favored Enemy'],
  ];

  it('matches the printed progression for every resource with a column', () => {
    const findings: Finding[] = [];
    for (const [classId, resourceId, column] of COLUMNS) {
      const ours = resourcesForClass(classId, '2024').find((r) => r.id === resourceId);
      const theirs = srd[classId]?.[column];
      if (!ours || !theirs) {
        findings.push({ key: `resource:${classId} ${resourceId}:missing`, detail: `ours ${!!ours}, srd ${!!theirs}` });
        continue;
      }
      if (ours.max.kind !== 'table') {
        findings.push({ key: `resource:${classId} ${resourceId}:shape`, detail: `app is ${ours.max.kind}, the SRD prints a table` });
        continue;
      }
      const app = ours.max.byLevel.map((b) => `${b.level}:${b.count}`).join(' ');
      const book = theirs.map((s) => `${s.level}:${s.value}`).join(' ');
      if (app !== book) {
        findings.push({ key: `resource:${classId} ${resourceId}:counts`, detail: `app [${app}], srd [${book}]` });
      }
    }
    const { unexpected, stale } = reconcile(findings, ['resource'], ['missing', 'shape', 'counts']);
    expect(show(unexpected)).toEqual([]);
    expect(stale, 'exceptions that no longer apply').toEqual([]);
  });

  /**
   * The Prepared Spells column, which 2024 gave to every caster in place of
   * both "spells known" and "Wisdom + level". The app applied the 2014 rules
   * under both rulesets for a while, which was wrong for seven of the eight.
   */
  it('matches the printed Prepared Spells column for every caster', () => {
    const findings: Finding[] = [];
    /*
      The app's own classes are excluded, by `source` rather than by name, for
      the reason every other exclusion in this file has: an SRD audit has
      nothing to say about a class that was never in a book. Filtering here
      rather than at the table means a Forge caster still gets a prepared
      column - it just is not diffed against a fixture that could not contain
      it. A *published* caster can never be excluded by accident.
    */
    const own = new Set(CLASSES.filter((c) => isOriginal(c.source)).map((c) => c.id as string));
    for (const [classId, table] of Object.entries(PREPARED_2024)) {
      if (own.has(classId)) continue;
      const book = srd[classId]?.['Prepared Spells'];
      if (!book) {
        findings.push({ key: `prepared:${classId}:missing`, detail: 'no column in the fixture' });
        continue;
      }
      // The fixture records the levels a number changes at; the app carries one
      // entry per level, so the column is expanded before comparing.
      const expanded = Array.from({ length: 20 }, (_, i) => {
        let value = 0;
        for (const step of book) if (step.level <= i + 1) value = Number(step.value);
        return value;
      });
      const app = table.join(',');
      if (app !== expanded.join(',')) {
        findings.push({ key: `prepared:${classId}:counts`, detail: `app [${app}], srd [${expanded.join(',')}]` });
      }
    }
    const { unexpected, stale } = reconcile(findings, ['prepared'], ['missing', 'counts']);
    expect(show(unexpected)).toEqual([]);
    expect(stale, 'exceptions that no longer apply').toEqual([]);
  });

  /**
   * The half-caster slot progression, which is where rounding the class's own
   * table *down* cost a single-class Paladin or Ranger a whole spell level.
   * 2024 also moved their first slots from 2nd level to 1st, so this checks
   * both the shape and where it starts.
   */
  it('gives a 2024 Paladin and Ranger the slots their table prints', () => {
    const columns = ['1st', '2nd', '3rd', '4th', '5th'];
    const findings: Finding[] = [];
    for (const classId of ['paladin', 'ranger'] as ClassId[]) {
      const klass = CLASSES.find((c) => c.id === classId)!;
      for (let level = 1; level <= 20; level++) {
        const book = columns.map((column) => {
          let value = 0;
          for (const step of srd[classId]?.[column] ?? []) if (step.level <= level) value = Number(step.value);
          return value;
        });
        const app = computeSlots(
          [{ entry: { classId, level }, klass, subclass: undefined }],
          '2024',
        ).bySpellLevel.slice(0, 5);
        if (app.join(',') !== book.join(',')) {
          findings.push({ key: `slots:${classId} ${level}:counts`, detail: `app [${app}], srd [${book}]` });
        }
      }
    }
    const { unexpected, stale } = reconcile(findings, ['slots'], ['counts']);
    expect(show(unexpected)).toEqual([]);
    expect(stale, 'exceptions that no longer apply').toEqual([]);
  });

  /**
   * A pool equal to your class level is printed as twenty identical-looking
   * rows, so it is checked at its ends rather than transcribed.
   */
  it('agrees that Focus and Sorcery Points track your level', () => {
    for (const [classId, column] of [['monk', 'Focus Points'], ['sorcerer', 'Sorcery Points']] as const) {
      const ours = resourcesForClass(classId, '2024').find((r) => r.max.kind === 'classLevel');
      expect(ours, classId).toBeDefined();
      const book = srd[classId][column];
      expect(book[0], classId).toEqual({ level: 2, value: '2' });
      expect(book[book.length - 1], classId).toEqual({ level: 20, value: '20' });
    }
  });

  /** Ki is Focus in 2024, which is a rename and not a second resource. */
  it('renames Ki to Focus Points without duplicating it', () => {
    expect(resourcesForClass('monk', '2014').map((r) => r.name)).toEqual(['Ki points']);
    expect(resourcesForClass('monk', '2024').map((r) => r.name)).toEqual(['Focus Points']);
  });

  /**
   * The reason this item was worth doing at all. Every row used to be tagged
   * 2014-only, so a 2024 character was shown nothing.
   */
  it('leaves no 2024 class without the resources it has', () => {
    for (const classId of ['barbarian', 'bard', 'cleric', 'fighter', 'monk', 'paladin',
                           'ranger', 'sorcerer', 'warlock', 'wizard'] as ClassId[]) {
      expect(resourcesForClass(classId, '2024').length, classId).toBeGreaterThan(0);
    }
  });
});
