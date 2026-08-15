import { ABILITIES, emptyDetails } from '../types';
import type { Ability, AbilityScores, Build, ClassEntry, ClassId, Ruleset } from '../types';
import { CLASSES } from '../data/classes';
import { FEATS } from '../data/feats';
import { SPELLS } from '../data/spells';
import { RACES } from '../data/races';
import { skillIdFromName } from '../data/skills';
import type { SkillId } from '../data/skills';
import { ARMOR, ARMOR_BY_ID } from '../data/armor';
import { GEAR } from '../data/gear';
import { MAGIC_ITEMS } from '../data/magicItems';
import { backgroundsFor } from '../data/backgrounds';
import type { Background } from '../data/backgrounds';
import { weaponsFor } from '../data/weapons';
import { equipBestArmor, weaponsForProfile } from '../engine/character';
import { defaultDefenses } from '../engine/defense';
import { emptyCoins } from '../engine/inventory';
import type { Coins } from '../engine/inventory';
import type { CarriedItem } from '../engine/items';

/**
 * D&D Beyond's character service returns a large JSON document. We only read
 * the parts that describe the build: lineage, background, classes, ability
 * scores, feats, spells and the whole pack - inventory, magic items, coins and
 * what is actually equipped. Campaign and roleplay text are ignored.
 *
 * The endpoint does not send CORS headers, so a browser cannot fetch it
 * directly from a static page. In `npm run dev` a Vite proxy handles it; in a
 * production build the app falls back to pasting the JSON.
 */

const STAT_IDS: Record<number, Ability> = { 1: 'str', 2: 'dex', 3: 'con', 4: 'int', 5: 'wis', 6: 'cha' };

const SCORE_SUBTYPES: Record<string, Ability> = {
  'strength-score': 'str',
  'dexterity-score': 'dex',
  'constitution-score': 'con',
  'intelligence-score': 'int',
  'wisdom-score': 'wis',
  'charisma-score': 'cha',
};

export interface ImportResult {
  build: Build;
  warnings: string[];
}

export class ImportError extends Error {}

interface DdbStat {
  id?: number;
  value?: number | null;
}

interface DdbModifier {
  type?: string;
  subType?: string;
  value?: number | null;
}

interface DdbCharacter {
  id?: number;
  name?: string;
  race?: {
    fullName?: string;
    baseRaceName?: string;
    subRaceShortName?: string | null;
    isSubRace?: boolean;
  };
  classes?: {
    id?: number;
    level?: number;
    isStartingClass?: boolean;
    definition?: { name?: string };
    subclassDefinition?: { name?: string } | null;
  }[];
  stats?: DdbStat[];
  bonusStats?: DdbStat[];
  overrideStats?: DdbStat[];
  modifiers?: Record<string, DdbModifier[]>;
  feats?: { definition?: { name?: string } }[];
  /** Spells chosen through a class, one entry per casting class. */
  classSpells?: {
    /** Links the block to an entry in `classes`, so a spell knows its class. */
    characterClassId?: number;
    spells?: { definition?: { name?: string } | null }[] | null;
  }[];
  /** Spells granted by race, background, item or feat rather than chosen. */
  spells?: Record<string, { definition?: { name?: string } | null }[] | null> | null;
  notes?: { personalPossessions?: string | null } | null;
  background?: {
    definition?: { name?: string } | null;
    hasCustomBackground?: boolean;
    customBackground?: { name?: string } | null;
  } | null;
  currencies?: Partial<Record<'cp' | 'sp' | 'ep' | 'gp' | 'pp', number>> | null;
  inventory?: DdbInventoryEntry[] | null;
}

/**
 * One line of a D&D Beyond character's pack. `filterType` is the coarse bucket
 * their UI sorts by - "Weapon", "Armor", "Wondrous item", "Other Gear" - and is
 * the most reliable field on the entry; `definition.type` is finer but varies
 * by source book.
 */
interface DdbInventoryEntry {
  quantity?: number | null;
  equipped?: boolean | null;
  isAttuned?: boolean | null;
  definition?: {
    name?: string;
    type?: string | null;
    filterType?: string | null;
    magic?: boolean | null;
    rarity?: string | null;
    armorClass?: number | null;
    armorTypeId?: number | null;
  } | null;
}

/** Accepts a character ID, a full D&D Beyond URL, or a bare number. */
export function parseCharacterId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/dndbeyond\.com\/(?:profile\/[^/]+\/)?characters\/(\d+)/i);
  return match ? match[1] : null;
}

export function characterServiceUrl(id: string): string {
  return `https://character-service.dndbeyond.com/character/v5/character/${id}`;
}

/** Same endpoint through the dev-server proxy, which adds the CORS headers. */
export function proxyUrl(id: string): string {
  return `/ddb/character/v5/character/${id}`;
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function matchRace(raceName: string): { id: string; exact: boolean } {
  const target = normalise(raceName);
  const exact = RACES.find((r) => normalise(r.name) === target);
  if (exact) return { id: exact.id, exact: true };

  // "Elf (Wood)" or "Wood Elf (Variant)" - look for a lineage whose name is
  // wholly contained in the D&D Beyond string, longest name first.
  const contained = [...RACES]
    .sort((a, b) => b.name.length - a.name.length)
    .find((r) => target.includes(normalise(r.name)));
  if (contained) return { id: contained.id, exact: false };

  const byParent = RACES.find((r) => r.parent && target.includes(normalise(r.parent)));
  if (byParent) return { id: byParent.id, exact: false };

  return { id: 'human', exact: false };
}

function matchClass(className: string): ClassId | null {
  const target = normalise(className);
  return CLASSES.find((c) => normalise(c.name) === target)?.id ?? null;
}

function matchSubclass(classId: ClassId, subclassName: string): string | undefined {
  const target = normalise(subclassName);
  const klass = CLASSES.find((c) => c.id === classId);
  if (!klass) return undefined;
  return (
    klass.subclasses.find((s) => normalise(s.name) === target)?.id ??
    klass.subclasses.find((s) => normalise(s.name).includes(target) || target.includes(normalise(s.name)))?.id
  );
}

function matchFeat(featName: string): string | undefined {
  const target = normalise(featName);
  // D&D Beyond appends the chosen option, e.g. "Resilient (Constitution)".
  // Strip it before normalising, since normalising turns brackets into spaces.
  const bare = normalise(featName.replace(/\s*\([^)]*\)\s*$/, ''));
  return (
    FEATS.find((f) => normalise(f.name) === target)?.id ??
    FEATS.find((f) => normalise(f.name) === bare)?.id
  );
}

/**
 * Spells by name. D&D Beyond writes them plainly - "Fire Bolt", "Melf's Acid
 * Arrow" - so a normalised comparison is enough, with the possessive stripped
 * as a fallback for the named-wizard spells it sometimes shortens.
 */
function matchSpell(spellName: string): string | undefined {
  const target = normalise(spellName);
  const bare = normalise(spellName.replace(/^[^']+'s\s+/, ''));
  return (
    SPELLS.find((s) => normalise(s.name) === target)?.id ??
    SPELLS.find((s) => normalise(s.name.replace(/^[^']+'s\s+/, '')) === bare)?.id
  );
}

/** "Resilient (Constitution)" -> con */
function featAbilityChoice(featName: string): Ability | undefined {
  const match = featName.match(/\(([^)]+)\)/);
  if (!match) return undefined;
  const inner = normalise(match[1]);
  return ABILITIES.find((a) => {
    const full = { str: 'strength', dex: 'dexterity', con: 'constitution', int: 'intelligence', wis: 'wisdom', cha: 'charisma' }[a];
    return inner.includes(full);
  });
}

/**
 * Spells a character has recorded. D&D Beyond keeps them in two places:
 * `classSpells` for the ones chosen through a class, and `spells` for the ones
 * a race, background, item or feat handed over. Both count as spells this
 * character has, so both are read.
 *
 * A spell the builder does not carry is reported rather than silently dropped,
 * the same way an unknown feat is - a sheet with six spells and four imported
 * should say so.
 *
 * Each `classSpells` block names the class it belongs to through
 * `characterClassId`, so an imported spell can say which class taught it - the
 * thing a multiclass caster with two casting abilities needs in order to be
 * given the right save DC. The link is followed defensively: an entry with no
 * `characterClassId`, or one pointing at a class this app does not carry,
 * simply arrives unattributed, which is where every import stood before.
 */
function readSpells(data: DdbCharacter): {
  spellIds: string[];
  spellSources: Record<string, ClassId>;
  warnings: string[];
} {
  const warnings: string[] = [];
  const spellIds: string[] = [];
  const spellSources: Record<string, ClassId> = {};
  const missing: string[] = [];

  const classById = new Map<number, ClassId>();
  for (const entry of data.classes ?? []) {
    const name = entry.definition?.name;
    const id = name ? matchClass(name) : null;
    if (entry.id !== undefined && id) classById.set(entry.id, id);
  }

  const entries: { name?: string | null; classId?: ClassId }[] = [
    ...(data.classSpells ?? []).flatMap((block) => {
      const classId =
        block.characterClassId !== undefined ? classById.get(block.characterClassId) : undefined;
      return (block.spells ?? []).map((spell) => ({ name: spell?.definition?.name, classId }));
    }),
    // Spells from a race, background, item or feat have no class behind them,
    // so they stay unattributed however the app resolves them.
    ...Object.values(data.spells ?? {}).flatMap((list) =>
      (list ?? []).map((spell) => ({ name: spell?.definition?.name })),
    ),
  ];

  for (const entry of entries) {
    const name = entry.name;
    if (!name) continue;
    const id = matchSpell(name);
    if (!id) {
      if (!missing.includes(name)) missing.push(name);
      continue;
    }
    if (!spellIds.includes(id)) spellIds.push(id);
    // First attribution wins: a spell on two class lists was recorded once per
    // class by D&D Beyond, and the earlier block is the character's first class.
    if (entry.classId && !spellSources[id]) spellSources[id] = entry.classId;
  }

  if (missing.length) {
    warnings.push(
      `${missing.length} ${missing.length === 1 ? 'spell is' : 'spells are'} not in the builder's list and ${missing.length === 1 ? 'was' : 'were'} skipped: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ', and others' : ''}.`,
    );
  }
  return { spellIds, spellSources, warnings };
}

/**
 * D&D Beyond keeps a character's ability scores in layers:
 *   stats          - the base score the player entered (point buy / array / rolls)
 *   bonusStats     - the manual "other modifier" box in the UI
 *   overrideStats  - a hard override that replaces everything
 *   modifiers.*    - everything granted by race, class ASIs, feats and items
 *
 * The builder wants those layers separated, because it re-applies lineage
 * increases and half-feat increases itself from its own data. So we read the
 * player-entered base, and read class ASI increases out of modifiers.class.
 */
interface ScoreLayers {
  /** What the player entered, before any lineage or level-up increases. */
  base: AbilityScores;
  /** Increases from the Ability Score Improvement class feature. */
  classAsi: Partial<Record<Ability, number>>;
  /** Increases granted by the lineage, per D&D Beyond. */
  racial: Partial<Record<Ability, number>>;
  /** 2024: increases granted by the background. */
  background: Partial<Record<Ability, number>>;
  /** Increases granted by feats (the +1 on half-feats). */
  fromFeats: Partial<Record<Ability, number>>;
  warnings: string[];
}

function sumBonuses(modifiers: DdbModifier[] | undefined): Partial<Record<Ability, number>> {
  const out: Partial<Record<Ability, number>> = {};
  for (const modifier of modifiers ?? []) {
    if (modifier.type !== 'bonus') continue;
    const ability = modifier.subType ? SCORE_SUBTYPES[modifier.subType] : undefined;
    if (!ability || typeof modifier.value !== 'number') continue;
    out[ability] = (out[ability] ?? 0) + modifier.value;
  }
  return out;
}

function readScoreLayers(data: DdbCharacter): ScoreLayers {
  const warnings: string[] = [];
  const base: AbilityScores = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

  for (const stat of data.stats ?? []) {
    const ability = stat.id ? STAT_IDS[stat.id] : undefined;
    if (ability && typeof stat.value === 'number') base[ability] = stat.value;
  }
  for (const stat of data.bonusStats ?? []) {
    const ability = stat.id ? STAT_IDS[stat.id] : undefined;
    if (ability && typeof stat.value === 'number') base[ability] += stat.value;
  }
  for (const stat of data.overrideStats ?? []) {
    const ability = stat.id ? STAT_IDS[stat.id] : undefined;
    if (ability && typeof stat.value === 'number' && stat.value > 0) {
      base[ability] = stat.value;
      warnings.push(
        `${ability.toUpperCase()} is hard-overridden to ${stat.value} on the sheet, so its increases could not be separated out.`,
      );
    }
  }

  // Anything that sets rather than adds (Headband of Intellect, Belt of Giant
  // Strength) is reported instead of absorbed - the optimizer should reason
  // about the character, not about their loot.
  for (const kind of ['item', 'feat', 'condition'] as const) {
    for (const modifier of data.modifiers?.[kind] ?? []) {
      const ability = modifier.subType ? SCORE_SUBTYPES[modifier.subType] : undefined;
      if (ability && modifier.type === 'set' && typeof modifier.value === 'number') {
        warnings.push(
          `${ability.toUpperCase()} is set to ${modifier.value} by an ${kind} on the sheet. The builder uses your underlying score instead.`,
        );
      }
    }
  }

  return {
    base,
    classAsi: sumBonuses(data.modifiers?.class),
    racial: sumBonuses(data.modifiers?.race),
    background: sumBonuses(data.modifiers?.background),
    fromFeats: sumBonuses(data.modifiers?.feat),
    warnings,
  };
}

/**
 * Skill proficiencies and expertise, which D&D Beyond states outright as
 * modifiers rather than as layered numbers. This is the one part of a sheet
 * that needs no reconstruction.
 *
 * Only picks are kept. Anything the character's background or lineage grants is
 * derived by the engine, so importing it as a pick would show up as a collision
 * against the grant it came from.
 */
function readProficiencies(
  data: DdbCharacter,
  granted: Set<SkillId>,
): { skillIds: SkillId[]; expertiseIds: SkillId[] } {
  const skills = new Set<SkillId>();
  const expertise = new Set<SkillId>();

  for (const list of Object.values(data.modifiers ?? {})) {
    for (const modifier of list ?? []) {
      const id = modifier.subType ? skillIdFromName(modifier.subType.replace(/-/g, ' ')) : undefined;
      if (!id) continue;
      if (modifier.type === 'proficiency') skills.add(id);
      else if (modifier.type === 'expertise') expertise.add(id);
    }
  }

  return {
    skillIds: [...skills].filter((id) => !granted.has(id)),
    // Expertise is kept whatever granted it, since nothing else derives it.
    expertiseIds: [...expertise],
  };
}

/**
 * The pack, read off the sheet.
 *
 * D&D Beyond writes every carried thing into one `inventory` array and sorts it
 * by `filterType`, so this is one pass that fans out to four destinations: the
 * weapons in hand, the armor worn, the magic items attuned, and everything else
 * as ordinary gear. Names are matched against this app's catalogues, and what
 * does not match is reported rather than dropped - a pack that quietly loses
 * six lines is worse than one that says which six.
 *
 * Ammunition is the one place the counts differ. D&D Beyond stores 40 arrows as
 * quantity 40; this app stores two bundles of twenty, because that is how the
 * equipment table sells them. So a bundled item's quantity is divided, rounded
 * up, since half a bundle of arrows is still a quiver you are carrying.
 */
interface PackRead {
  gear: { gearId: string; quantity: number }[];
  items: CarriedItem[];
  mainHandId?: string;
  offHandId?: string;
  armorId?: string;
  shield: boolean;
  warnings: string[];
}

function matchByName<T extends { id: string; name: string }>(
  table: T[],
  name: string,
): T | undefined {
  const target = normalise(name);
  return (
    table.find((row) => normalise(row.name) === target) ??
    // "Arrows (20)" against "Arrows", "Potion of Healing (Greater)" against the
    // family row - drop a trailing parenthetical and try once more.
    table.find((row) => normalise(row.name.replace(/\s*\([^)]*\)\s*$/, '')) === target)
  );
}

function readPack(data: DdbCharacter, ruleset: Ruleset): PackRead {
  const out: PackRead = { gear: [], items: [], shield: false, warnings: [] };
  const unmatched: string[] = [];
  const weapons = weaponsFor(ruleset);

  for (const entry of data.inventory ?? []) {
    const name = entry.definition?.name;
    if (!name) continue;
    const quantity = Math.max(1, entry.quantity ?? 1);
    const filter = (entry.definition?.filterType ?? '').toLowerCase();
    const equipped = entry.equipped === true;

    // --- weapons ---------------------------------------------------------
    if (filter === 'weapon') {
      const weapon = matchByName(weapons, name);
      if (!weapon) {
        unmatched.push(name);
        continue;
      }
      // Two hands, filled in the order the sheet lists them. A third equipped
      // weapon is carried, not held, which is the same answer the rules give.
      if (equipped && !out.mainHandId) out.mainHandId = weapon.id;
      else if (equipped && !out.offHandId && weapon.id !== out.mainHandId) out.offHandId = weapon.id;
      continue;
    }

    // --- armor and shields ------------------------------------------------
    if (filter === 'armor') {
      if (/shield/i.test(name)) {
        if (equipped) out.shield = true;
        continue;
      }
      const armor = matchByName(ARMOR, name);
      if (!armor) {
        unmatched.push(name);
        continue;
      }
      if (equipped && !out.armorId) out.armorId = armor.id;
      continue;
    }

    // --- magic items ------------------------------------------------------
    // Anything the sheet calls magic goes to the magic item catalogue first,
    // since a Cloak of Protection is not a cloak as far as this app cares.
    if (entry.definition?.magic) {
      const item = matchByName(MAGIC_ITEMS, name);
      if (item) {
        out.items.push({ itemId: item.id, attuned: entry.isAttuned === true });
        continue;
      }
      // A magic item this app does not carry is still worth keeping as a named
      // line, because the sheet is also a record of what you own.
      out.items.push({ customName: name, attuned: entry.isAttuned === true });
      continue;
    }

    // --- ordinary gear ----------------------------------------------------
    const gear = matchByName(GEAR, name);
    if (!gear) {
      unmatched.push(name);
      continue;
    }
    const bundles = gear.bundle ? Math.ceil(quantity / gear.bundle) : quantity;
    const existing = out.gear.find((g) => g.gearId === gear.id);
    if (existing) existing.quantity += bundles;
    else out.gear.push({ gearId: gear.id, quantity: bundles });
  }

  if (unmatched.length) {
    out.warnings.push(
      `${unmatched.length} inventory ${unmatched.length === 1 ? 'line is' : 'lines are'} not in this app's catalogue and ${unmatched.length === 1 ? 'was' : 'were'} skipped: ${unmatched.slice(0, 6).join(', ')}${unmatched.length > 6 ? ', and others' : ''}.`,
    );
  }
  return out;
}

/** The four purses, which D&D Beyond states plainly. */
function readCoins(data: DdbCharacter): Coins {
  const coins = emptyCoins();
  for (const denomination of ['cp', 'sp', 'ep', 'gp', 'pp'] as const) {
    const value = data.currencies?.[denomination];
    if (typeof value === 'number' && value > 0) coins[denomination] = value;
  }
  return coins;
}

/**
 * Which ruleset a sheet was built under. D&D Beyond serves both, and the tell is
 * where the ability increases live: 2014 puts them on the species, 2024 on the
 * background.
 */
function detectRuleset(data: DdbCharacter, fallback: Ruleset): { ruleset: Ruleset; certain: boolean } {
  const fromRace = Object.keys(sumBonuses(data.modifiers?.race)).length > 0;
  const fromBackground = Object.keys(sumBonuses(data.modifiers?.background)).length > 0;
  if (fromRace && !fromBackground) return { ruleset: '2014', certain: true };
  if (fromBackground && !fromRace) return { ruleset: '2024', certain: true };
  return { ruleset: fallback, certain: false };
}

/** Convert a D&D Beyond character document into a builder Build. */
export function buildFromDdb(raw: unknown, fallbackRuleset: Ruleset = '2014'): ImportResult {
  const root = raw as { data?: DdbCharacter } & DdbCharacter;
  const data: DdbCharacter | undefined = root?.data ?? (root?.classes ? root : undefined);
  if (!data || !Array.isArray(data.classes)) {
    throw new ImportError(
      'That JSON does not look like a D&D Beyond character. Expected an object with a "data" property containing "classes".',
    );
  }

  const warnings: string[] = [];

  // --- ruleset -------------------------------------------------------------
  const detected = detectRuleset(data, fallbackRuleset);
  const ruleset = detected.ruleset;
  if (!detected.certain) {
    warnings.push(
      `Could not tell which ruleset this sheet uses, so it was imported as ${ruleset}. Switch it in the Builder if that is wrong.`,
    );
  }

  // --- lineage -------------------------------------------------------------
  const raceName =
    data.race?.fullName ??
    [data.race?.subRaceShortName, data.race?.baseRaceName].filter(Boolean).join(' ') ??
    'Human';
  const race = matchRace(raceName);
  if (!race.exact) {
    warnings.push(`Lineage "${raceName}" is not in the builder's list; matched to the closest entry.`);
  }

  // --- classes -------------------------------------------------------------
  const classes: ClassEntry[] = [];
  for (const entry of data.classes) {
    const name = entry.definition?.name;
    if (!name) continue;
    const classId = matchClass(name);
    if (!classId) {
      warnings.push(`Class "${name}" is not supported by the builder and was skipped.`);
      continue;
    }
    const subclassName = entry.subclassDefinition?.name;
    const subclassId = subclassName ? matchSubclass(classId, subclassName) : undefined;
    if (subclassName && !subclassId) {
      warnings.push(`Subclass "${subclassName}" is not in the builder's list; left unset.`);
    }
    classes.push({ classId, level: entry.level ?? 1, subclassId });
  }
  if (!classes.length) {
    throw new ImportError('No supported classes found on that character sheet.');
  }
  // Starting class first: it decides saving throws and drives the plan order.
  const startingIndex = data.classes.findIndex((c) => c.isStartingClass);
  if (startingIndex > 0 && classes[startingIndex]) {
    const [starting] = classes.splice(startingIndex, 1);
    classes.unshift(starting);
  }

  // --- ability scores ------------------------------------------------------
  const layers = readScoreLayers(data);
  warnings.push(...layers.warnings);
  const baseScores: AbilityScores = { ...layers.base };

  // --- feats ---------------------------------------------------------------
  // Half-feat increases live in modifiers.feat, not in the feat's name. Pool
  // them and hand each one to a feat that is allowed to take it.
  const featAbilityPool: Ability[] = [];
  for (const ability of ABILITIES) {
    for (let i = 0; i < (layers.fromFeats[ability] ?? 0); i++) featAbilityPool.push(ability);
  }

  const featIds: string[] = [];
  const featAsiChoices: Record<string, Ability> = {};
  for (const entry of data.feats ?? []) {
    const name = entry.definition?.name;
    if (!name) continue;
    const featId = matchFeat(name);
    if (!featId) {
      warnings.push(`Feat "${name}" is not in the builder's database and was skipped.`);
      continue;
    }
    if (featIds.includes(featId)) continue;
    featIds.push(featId);

    const feat = FEATS.find((f) => f.id === featId);
    const allowed = feat?.asi?.abilities;
    if (!allowed) continue;
    // "Resilient (Constitution)" states the choice outright; otherwise take a
    // matching increase from the pool of feat-granted increases.
    const named = featAbilityChoice(name);
    const chosen =
      named && allowed.includes(named) ? named : featAbilityPool.find((a) => allowed.includes(a));
    if (!chosen) continue;
    featAsiChoices[featId] = chosen;
    const poolIndex = featAbilityPool.indexOf(chosen);
    if (poolIndex >= 0) featAbilityPool.splice(poolIndex, 1);
  }

  // --- spent ASIs ----------------------------------------------------------
  // modifiers.class carries the Ability Score Improvement feature's increases,
  // one +1 at a time. Pair them back up into the +2 / +1+1 choices they were.
  const increases: Ability[] = [];
  for (const ability of ABILITIES) {
    for (let i = 0; i < (layers.classAsi[ability] ?? 0); i++) increases.push(ability);
  }
  const asiPicks: Ability[][] = [];
  for (let i = 0; i < increases.length; i += 2) {
    asiPicks.push(increases.slice(i, i + 2));
  }
  if (increases.length % 2 === 1) {
    warnings.push(
      'An odd number of ability score increases came from class features; the last one was recorded as a single +1.',
    );
  }

  // Cross-check the lineage: if D&D Beyond's racial increases disagree with
  // what this app has on file, the lineage match is probably wrong.
  const expectedRace = RACES.find((r) => r.id === race.id);
  if (expectedRace && !expectedRace.flexibleAsi) {
    const mismatch = ABILITIES.some(
      (a) => (layers.racial[a] ?? 0) !== (expectedRace.asi[a] ?? 0),
    );
    if (mismatch) {
      warnings.push(
        `The sheet's racial ability increases do not match this app's entry for ${expectedRace.name}. Check the lineage in the Builder.`,
      );
    }
  }

  const primaryClass = CLASSES.find((c) => c.id === classes[0].classId)!;

  // --- background ----------------------------------------------------------
  const backgroundName =
    data.background?.definition?.name ??
    (data.background?.hasCustomBackground ? data.background.customBackground?.name : undefined);
  let background: Background | undefined;
  if (backgroundName) {
    background = matchByName(backgroundsFor(ruleset), backgroundName);
    if (!background) {
      warnings.push(
        `Background "${backgroundName}" is not in this app's list, so it was left unset. Its skill proficiencies will show as your own picks.`,
      );
    }
  }

  // Skills the lineage or the background grants outright are derived, so
  // importing them as picks would read as a collision with the grant they came
  // from. This is the whole reason the background is read before them.
  const grantedSkills = new Set<SkillId>([
    ...(RACES.find((r) => r.id === race.id)?.skillGrants?.fixed ?? []),
    ...(background?.skills ?? []),
  ]);
  const proficiencies = readProficiencies(data, grantedSkills);
  if (proficiencies.skillIds.length && !background) {
    warnings.push(
      `${proficiencies.skillIds.length} skill ${proficiencies.skillIds.length === 1 ? 'proficiency was' : 'proficiencies were'} read from the sheet. Without a background, any that came from one will show as your own picks - set it in the Builder.`,
    );
  }

  const spells = readSpells(data);
  warnings.push(...spells.warnings);

  // --- the pack ------------------------------------------------------------
  const pack = readPack(data, ruleset);
  warnings.push(...pack.warnings);

  const build: Build = {
    name: data.name ?? 'Imported Character',
    ruleset,
    raceId: race.id,
    backgroundId: background?.id,
    backgroundAsi: { mode: '2+1', picks: [] },
    originFeatIds: [],
    flexibleAsiPicks: [],
    customOrigin: false,
    classes,
    baseScores,
    featIds,
    featAsiChoices,
    asiPicks,
    weapons: pack.mainHandId
      ? { magicBonus: {}, mainHandId: pack.mainHandId, offHandId: pack.offHandId }
      : weaponsForProfile(
          primaryClass.defaultWeaponStyle,
          primaryClass.defaultWeaponStyle === 'dex-ranged' ? 'ranged' : 'two-handed',
        ),
    defenses: pack.armorId
      ? { ...defaultDefenses(), armorId: pack.armorId, shield: pack.shield }
      : { ...defaultDefenses(), shield: pack.shield },
    ...proficiencies,
    classOptionIds: [],
    masteryIds: [],
    items: pack.items,
    spellIds: spells.spellIds,
    ...(Object.keys(spells.spellSources).length ? { spellSources: spells.spellSources } : {}),
    // Which of a Wizard's book is prepared today is not on the sheet.
    preparedIds: [],
    combatAssumptions: { advantage: false, concentrating: true, targets: 1 },
    toolIds: [],
    languages: [],
    gear: pack.gear,
    coins: readCoins(data),
    notes: '',
    // The roleplay boxes - traits, ideals, bonds, flaws - are free text on
    // D&D Beyond's side and are not read, so they start empty rather than
    // being guessed at.
    details: emptyDetails(),
    importedFrom: data.id ? `D&D Beyond character ${data.id}` : 'D&D Beyond',
  };

  // A sheet with no armor equipped might be a Monk or might be someone who
  // never ticked the box, so the character is still placed in the best armor
  // their proficiencies allow - but said so, rather than left to be noticed.
  let equipped = build;
  if (!pack.armorId) {
    equipped = equipBestArmor(build);
    if (equipped.defenses.armorId !== 'none') {
      warnings.push(
        `No armor was equipped on the sheet, so the character has been placed in ${ARMOR_BY_ID[equipped.defenses.armorId].name.toLowerCase()}, the best their proficiencies allow. Adjust it in the Builder.`,
      );
    }
  }

  if (!pack.mainHandId) {
    warnings.push(
      'No weapon was equipped on the sheet, so a default loadout was assumed - set it in the Builder so combat feats are scored correctly.',
    );
  }

  return { build: equipped, warnings };
}

/**
 * Try the dev proxy first, then the public endpoint. In a static production
 * build both will usually fail on CORS, which is why the paste box exists.
 */
export async function fetchDdbCharacter(
  idOrUrl: string,
  fallbackRuleset: Ruleset = '2014',
): Promise<ImportResult> {
  const id = parseCharacterId(idOrUrl);
  if (!id) {
    throw new ImportError(
      'Could not find a character ID. Paste a D&D Beyond character URL (e.g. https://www.dndbeyond.com/characters/123456) or the ID itself.',
    );
  }

  const attempts = [proxyUrl(id), characterServiceUrl(id)];
  let lastError: unknown = null;

  for (const url of attempts) {
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        lastError = new ImportError(
          response.status === 403
            ? 'D&D Beyond returned 403. The character must be set to public sharing before it can be read.'
            : `D&D Beyond returned HTTP ${response.status}.`,
        );
        continue;
      }
      return buildFromDdb(await response.json(), fallbackRuleset);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof ImportError) throw lastError;
  throw new ImportError(
    'Could not reach D&D Beyond from the browser. Their character API does not send CORS headers, so a static page cannot call it directly. Use the "Paste JSON" option below - the instructions there take about ten seconds.',
  );
}
