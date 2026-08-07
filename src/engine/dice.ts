/**
 * Rolling dice.
 *
 * `dpr.ts` answers "what will this average over a fight". This answers "what
 * happened just now", which is a different job and needs the individual dice
 * rather than their mean. The two share their vocabulary deliberately - a crit
 * doubles the dice and not the flat bonus in both, advantage is two d20s in
 * both - so a player cannot be shown one rule while the optimizer reasons from
 * another.
 *
 * ## The RNG is injected
 *
 * Every function here takes an `Rng` rather than reaching for `Math.random`.
 * A dice roller whose output cannot be pinned in a test is a dice roller whose
 * "advantage" could quietly be "roll twice, keep the second" and nothing would
 * catch it. `defaultRng` is the only place randomness enters, and the UI is the
 * only caller that uses it.
 */

/** Returns a float in `[0, 1)`, like `Math.random`. */
export type Rng = () => number;

export const defaultRng: Rng = () => Math.random();

/** One face, one die. */
export function rollDie(die: number, rng: Rng): number {
  return Math.floor(rng() * die) + 1;
}

// ----------------------------------------------------------------- notation

export interface DiceTerm {
  count: number;
  die: number;
}

export interface Notation {
  terms: DiceTerm[];
  modifier: number;
}

/**
 * `2d6+3`, `1d8`, `d20-1`, `1d10+2d6+5`.
 *
 * Returns null rather than throwing on anything it does not understand, so a
 * malformed damage string in the data tables costs a disabled button rather
 * than a blank sheet. `dpr.ts` has its own `parseDice` for the bare `NdX` its
 * tables use; this one is the superset and they are kept apart because the
 * average-damage path has no business accepting a modifier it would ignore.
 */
export function parseNotation(input: string): Notation | null {
  /*
    Spaces are dropped only where they surround an operator, so `2d6 + 3` is
    read and `2d6 3` is not. Collapsing all whitespace first would turn the
    second into `2d63` - two sixty-three-sided dice, rolled without complaint.
  */
  const text = input.trim().toLowerCase().replace(/\s*([+-])\s*/g, '$1');
  if (!text || /\s/.test(text)) return null;
  // Every term after the first must be signed, so nothing is inferred.
  if (!/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(text)) return null;

  const terms: DiceTerm[] = [];
  let modifier = 0;
  for (const [, sign, body] of text.matchAll(/([+-]?)(\d*d\d+|\d+)/g)) {
    const negative = sign === '-';
    if (body.includes('d')) {
      const [count, die] = body.split('d');
      // A negative dice term ("1d8-1d4", bane) is not something this app's
      // tables produce, and silently rolling it as positive would be a lie.
      if (negative) return null;
      terms.push({ count: count === '' ? 1 : Number(count), die: Number(die) });
    } else {
      modifier += negative ? -Number(body) : Number(body);
    }
  }
  return terms.length || modifier ? { terms, modifier } : null;
}

const signed = (n: number) => (n < 0 ? `${n}` : `+${n}`);

/** `{ terms: [2d6], modifier: 3 }` -> `"2d6+3"`, for labelling a button. */
export function formatNotation({ terms, modifier }: Notation): string {
  const dice = terms.map((t) => `${t.count}d${t.die}`).join('+');
  if (!dice) return `${modifier}`;
  return modifier ? `${dice}${signed(modifier)}` : dice;
}

/** What the notation rolls on average: `2d6+3` -> 10. For previews. */
export function expectedTotal({ terms, modifier }: Notation): number {
  return terms.reduce((sum, t) => sum + (t.count * (t.die + 1)) / 2, modifier);
}

// -------------------------------------------------------------- the results

export interface DiceGroup {
  die: number;
  values: number[];
}

export interface RollResult {
  total: number;
  groups: DiceGroup[];
  modifier: number;
  /** `d20: 14 +5 = 19` - the working, so a player can check the maths. */
  working: string;
}

function workingFor(groups: DiceGroup[], modifier: number, total: number): string {
  // The dot separates *dice groups* from each other; the modifier hangs off the
  // end with a space, the way it is written in `2d6+3`.
  const dice = groups.map((g) => `${g.values.length}d${g.die}: ${g.values.join(' ')}`).join(' · ');
  const mod = modifier ? `${dice ? ' ' : ''}${signed(modifier)}` : '';
  return `${dice}${mod} = ${total}`;
}

/** Rolls a parsed notation straight, with no d20 rules applied. */
export function rollNotation(notation: Notation, rng: Rng): RollResult {
  const groups = notation.terms.map((term) => ({
    die: term.die,
    values: Array.from({ length: term.count }, () => rollDie(term.die, rng)),
  }));
  const total =
    groups.reduce((sum, g) => sum + g.values.reduce((a, b) => a + b, 0), 0) + notation.modifier;
  return { total, groups, modifier: notation.modifier, working: workingFor(groups, notation.modifier, total) };
}

// ------------------------------------------------------------------ the d20

export type D20Mode = 'normal' | 'advantage' | 'disadvantage';

export interface D20Result {
  total: number;
  /** Both dice under advantage or disadvantage; one otherwise. */
  rolls: number[];
  /** The one that counted. */
  kept: number;
  modifier: number;
  mode: D20Mode;
  /**
   * Natural 20 or natural 1 **on the die that counted**.
   *
   * Deliberately not called "crit": a natural 20 is only a critical hit on an
   * attack roll. On a skill check it is a 20, and on a death save it is a rule
   * of its own. What it means is the caller's business; this reports the face.
   */
  natural: 20 | 1 | null;
  working: string;
}

/**
 * Advantage and disadvantage are two dice, keep the better or the worse. Both
 * are always reported, because seeing the die you did not keep is most of the
 * pleasure of rolling with advantage.
 */
export function rollD20(modifier: number, mode: D20Mode, rng: Rng): D20Result {
  const rolls = [rollDie(20, rng)];
  if (mode !== 'normal') rolls.push(rollDie(20, rng));
  /*
    Which die was kept, by index rather than by value. Two dice can land on the
    same face, and a value comparison then marks both as kept - so a pair of
    sevens under advantage printed as `d20: 7 7`, with nothing saying one of
    them was dropped. Exactly one die always counts, so exactly one is shown
    that way.
  */
  const keptAt =
    mode === 'advantage'
      ? rolls.indexOf(Math.max(...rolls))
      : mode === 'disadvantage'
        ? rolls.indexOf(Math.min(...rolls))
        : 0;
  const kept = rolls[keptAt];
  const total = kept + modifier;

  const dice =
    mode === 'normal'
      ? `d20: ${kept}`
      : `d20: ${rolls.map((r, i) => (i === keptAt ? `${r}` : `(${r})`)).join(' ')}`;
  const working = `${dice}${modifier ? ` ${signed(modifier)}` : ''} = ${total}`;

  return {
    total,
    rolls,
    kept,
    modifier,
    mode,
    natural: kept === 20 ? 20 : kept === 1 ? 1 : null,
    working,
  };
}

// ----------------------------------------------------------------- damage

/**
 * Damage, with a critical hit doubling the **dice** and not the flat bonus.
 *
 * This is the same rule `expectedDamage` in `dpr.ts` models, and it is the
 * reason a greatsword's 2d6 gains more from a crit than a rapier's 1d8 plus a
 * large Dexterity bonus. The extra dice are rolled fresh rather than the first
 * set being doubled, which is what the books say and is not the same thing:
 * doubling a roll of 6 gives 12 every time, rolling two gives an average of 7.
 */
export function rollDamage(notation: Notation, crit: boolean, rng: Rng): RollResult {
  if (!crit) return rollNotation(notation, rng);
  const doubled: Notation = {
    terms: notation.terms.map((t) => ({ ...t, count: t.count * 2 })),
    modifier: notation.modifier,
  };
  const result = rollNotation(doubled, rng);
  return { ...result, working: `critical · ${result.working}` };
}

// -------------------------------------------------------------- the log

export type RollKind =
  | 'check'
  | 'save'
  | 'attack'
  | 'damage'
  | 'initiative'
  | 'hit-die'
  | 'death-save';

export interface RollRecord {
  /** Monotonic within a session; only ever used as a list key. */
  id: number;
  kind: RollKind;
  /** What was rolled, in the player's words: "Stealth", "Greatsword damage". */
  label: string;
  total: number;
  working: string;
  natural?: 20 | 1;
}

/**
 * How many rolls the log keeps.
 *
 * Long enough to answer "what did I just roll" twice over; short enough that
 * it is a log rather than a session transcript, and that persisting it costs
 * nothing against the roster's shared storage budget.
 */
export const ROLL_LOG_LIMIT = 20;

/** Newest first, oldest dropped past the limit. */
export function appendRoll(log: RollRecord[], record: Omit<RollRecord, 'id'>): RollRecord[] {
  const id = (log[0]?.id ?? 0) + 1;
  return [{ ...record, id }, ...log].slice(0, ROLL_LOG_LIMIT);
}
