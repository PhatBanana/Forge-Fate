import type { Monster, MonsterAbility } from './data/monsters';
import { newId } from './storage';
import { read, write } from './persist';

/**
 * Monsters you made, kept separately from the ones the SRD gave you.
 *
 * ## Why this is its own store rather than part of the roster
 *
 * A bestiary outlives a party. The goblins a DM reskinned for their campaign
 * are worth keeping after every character in the roster has been deleted and
 * replaced, and a DM clearing out old characters should not lose two years of
 * stat blocks by doing it. So this is its own `localStorage` key with its own
 * export, and the two are only ever joined at the point of use - `mergeBestiary`
 * in front of a search box, and nowhere else.
 *
 * ## What a saved monster is
 *
 * The same `Monster` the SRD blocks are, with an id in the `custom:` namespace.
 * Nothing downstream has to know the difference: `MonsterCard` renders one,
 * `forecast.ts` measures one and `addMonster` puts one in the turn order,
 * because they all take a `Monster` and this is one. The prefix exists so a
 * lookup can tell which store to ask, and so an SRD id can never be shadowed by
 * accident.
 *
 * ## The XP table
 *
 * `xpForCr` is here because editing a challenge rating has to move the XP with
 * it - a DM who raises a bandit to CR 3 and is still told it is worth 200 XP
 * has been given a wrong number by the app rather than by the books. The table
 * is checked against all 334 SRD stat blocks in `bestiary.test.ts`, which is
 * what caught four of them carrying the value from the row above.
 */

const BESTIARY_KEY = 'dnd-forge:bestiary:v1';

/** Every id this store issues. `custom:` so an SRD id can never collide. */
export const CUSTOM_PREFIX = 'custom:';

export const isCustom = (id: string): boolean => id.startsWith(CUSTOM_PREFIX);

/**
 * Experience by challenge rating.
 *
 * A rules table, and one this project can check rather than trust: every SRD
 * stat block carries both numbers, so the fixture is 334 independent
 * confirmations of these rows.
 *
 * CR 0 is the one genuinely ambiguous row - the SRD awards either 0 or 10 XP
 * for one, depending on whether it can fight at all - so 10 is what an edit
 * produces and a stat block that already says 0 is left alone.
 */
export const XP_BY_CR: Record<number, number> = {
  0: 10,
  0.125: 25,
  0.25: 50,
  0.5: 100,
  1: 200,
  2: 450,
  3: 700,
  4: 1100,
  5: 1800,
  6: 2300,
  7: 2900,
  8: 3900,
  9: 5000,
  10: 5900,
  11: 7200,
  12: 8400,
  13: 10000,
  14: 11500,
  15: 13000,
  16: 15000,
  17: 18000,
  18: 20000,
  19: 22000,
  20: 25000,
  21: 33000,
  22: 41000,
  23: 50000,
  24: 62000,
  25: 75000,
  26: 90000,
  27: 105000,
  28: 120000,
  29: 135000,
  30: 155000,
};

/** Every rating a stat block can carry, in order, for a picker. */
export const CHALLENGE_RATINGS: number[] = [
  0, 0.125, 0.25, 0.5,
  ...Array.from({ length: 30 }, (_, i) => i + 1),
];

export const xpForCr = (cr: number): number => XP_BY_CR[cr] ?? 0;

/**
 * Proficiency bonus by challenge rating: +2 up to CR 4, then a step every four.
 *
 * The same shape a character's is, one column over. All 334 SRD stat blocks
 * agree with this, which the test asserts rather than assumes.
 */
export const proficiencyForCr = (cr: number): number =>
  cr < 1 ? 2 : 2 + Math.floor((cr - 1) / 4);

// ---------------------------------------------------------------- the records

const asRecord = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(raw);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
};

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

function asAbilities(value: unknown): MonsterAbility[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((a): a is MonsterAbility => Boolean(a) && typeof a === 'object')
    .map((a) => ({
      ...a,
      name: String(a.name ?? ''),
      desc: String(a.desc ?? ''),
    }));
}

/**
 * A stat block from storage or from a file, made safe to render.
 *
 * The same guard `hydrateBuild` applies to a saved character, for the same
 * reason: this is read at start-up, so a record missing a field the stat block
 * reads would white-screen the app on every load and the only way out would be
 * clearing site data. Anything without a name is refused; everything else is
 * filled in.
 */
export function hydrateMonster(parsed: unknown): Monster | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const raw = parsed as Partial<Monster> & Record<string, unknown>;
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null;

  const cr = Number(raw.cr);
  const scores = asRecord(raw.scores);

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `${CUSTOM_PREFIX}${newId()}`,
    name: raw.name,
    size: typeof raw.size === 'string' ? raw.size : 'Medium',
    type: typeof raw.type === 'string' ? raw.type : 'humanoid',
    subtype: typeof raw.subtype === 'string' ? raw.subtype : null,
    alignment: typeof raw.alignment === 'string' ? raw.alignment : 'unaligned',
    ac: Number(raw.ac) || 10,
    acNote: typeof raw.acNote === 'string' ? raw.acNote : null,
    hp: Number(raw.hp) || 1,
    hpRoll: typeof raw.hpRoll === 'string' && raw.hpRoll ? raw.hpRoll : null,
    speed: Object.keys(asRecord(raw.speed)).length ? asRecord(raw.speed) : { walk: 30 },
    hover: Boolean(raw.hover),
    scores: {
      str: scores.str || 10,
      dex: scores.dex || 10,
      con: scores.con || 10,
      int: scores.int || 10,
      wis: scores.wis || 10,
      cha: scores.cha || 10,
    },
    saves: asRecord(raw.saves),
    skills: asRecord(raw.skills),
    vulnerable: asStrings(raw.vulnerable),
    resist: asStrings(raw.resist),
    immune: asStrings(raw.immune),
    conditionImmunities: asStrings(raw.conditionImmunities),
    senses: (raw.senses && typeof raw.senses === 'object'
      ? (raw.senses as Record<string, number | string>)
      : {}),
    passivePerception:
      raw.passivePerception === null || raw.passivePerception === undefined
        ? null
        : Number(raw.passivePerception) || null,
    languages: typeof raw.languages === 'string' ? raw.languages : '',
    cr: Number.isFinite(cr) ? cr : 0,
    xp: Number.isFinite(Number(raw.xp)) ? Number(raw.xp) : xpForCr(Number.isFinite(cr) ? cr : 0),
    proficiencyBonus:
      raw.proficiencyBonus === null || raw.proficiencyBonus === undefined
        ? null
        : Number(raw.proficiencyBonus) || null,
    traits: asAbilities(raw.traits),
    actions: asAbilities(raw.actions),
    legendary: asAbilities(raw.legendary),
    reactions: asAbilities(raw.reactions),
  };
}

/** Never throws and never returns null: an empty bestiary is a valid one. */
export function loadBestiary(): Monster[] {
  try {
    const raw = read(BESTIARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { monsters?: unknown[] };
    return (parsed?.monsters ?? [])
      .map(hydrateMonster)
      .filter((m): m is Monster => m !== null);
  } catch {
    // Corrupt storage, private browsing, a full quota. An empty bestiary beats
    // refusing to load the app.
    return [];
  }
}

export function saveBestiary(monsters: Monster[]): void {
  try {
    write(BESTIARY_KEY, JSON.stringify({ monsters }));
  } catch {
    // Private browsing or a full quota - the app still works, it just forgets.
  }
}

/**
 * A copy under a new id, named so the two are told apart - the same rule
 * `duplicateCharacter` follows, because it is the same act: you copy in order
 * to change one, and a list with two identical names is the failure.
 */
export function copyOf(monster: Monster, existing: Monster[]): Monster {
  const base = monster.name.replace(/ \(copy( \d+)?\)$/, '');
  const taken = new Set(existing.map((m) => m.name));
  let name = `${base} (copy)`;
  for (let n = 2; taken.has(name); n++) name = `${base} (copy ${n})`;
  return { ...monster, id: `${CUSTOM_PREFIX}${newId()}`, name };
}

/** Add, or replace the one with the same id. Order is preserved on a replace. */
export function putMonster(bestiary: Monster[], monster: Monster): Monster[] {
  return bestiary.some((m) => m.id === monster.id)
    ? bestiary.map((m) => (m.id === monster.id ? monster : m))
    : [...bestiary, monster];
}

export function removeMonster(bestiary: Monster[], id: string): Monster[] {
  return bestiary.filter((m) => m.id !== id);
}

/**
 * What a search box looks at: yours first, then the SRD's.
 *
 * Yours first because a DM who saved a monster did it to use that one, and a
 * reskin usually keeps enough of the original's name to sort next to it. A
 * saved block whose id somehow matches an SRD one wins, which is what makes the
 * `custom:` prefix a safety net rather than the only thing holding it up.
 */
export function mergeBestiary(saved: Monster[], srd: Monster[]): Monster[] {
  const mine = new Set(saved.map((m) => m.id));
  return [...saved, ...srd.filter((m) => !mine.has(m.id))];
}
