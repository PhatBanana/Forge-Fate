import { read, write } from './persist';

/**
 * The optional rules a table has agreed to, and the ones it has not.
 *
 * This app has kept a "noted, never applied" register since section 12: cover
 * is computed and applied, but flanking and high ground are *announced* in the
 * log and change no number, because neither is a rule of fifth edition.
 * Flanking is the Dungeon Master's Guide's own optional rule; high ground is
 * not a rule at all - it is Baldur's Gate 3's, and a very good one, which is
 * why every table that has played it starts asking.
 *
 * Announcing them was the right default and a poor ceiling. A DM who has
 * decided their table uses high ground should not have to add two by hand
 * forty times a night. So the register grows a switch.
 *
 * ## Why they stay off
 *
 * Because the app's claim is that it plays the rules as written, and a number
 * that quietly disagreed with the book would make every other number harder to
 * trust. On is a choice somebody made; off is what the book says. The log says
 * which is in force either way - "(high ground +2)" when it is applied and
 * "(high ground)" when it is only noticed - so a player reading back through a
 * fight can always tell what the dice actually faced.
 */

export interface HouseRules {
  /**
   * Attacking downhill grants +2 to hit.
   *
   * Baldur's Gate 3's number, not the SRD's. Two rather than advantage because
   * advantage stacks strangely with everything else the map already grants,
   * and because +2 is what the game this is borrowed from actually gives.
   */
  highGround: boolean;
}

export const DEFAULT_HOUSE_RULES: HouseRules = {
  highGround: false,
};

/**
 * What each switch is called and what it does, for anything that renders them.
 *
 * A list rather than hand-written markup, so the next optional rule - flanking
 * is the obvious one, and grants advantage rather than a bonus - is a row here
 * plus its arithmetic, not a new control.
 */
export const HOUSE_RULE_INFO: {
  id: keyof HouseRules;
  label: string;
  hint: string;
}[] = [
  {
    id: 'highGround',
    label: 'High ground grants +2',
    hint: 'Attacking from a higher square adds 2 to hit. Not a 5e rule — this is the one Baldur’s Gate 3 uses. Off, the log still says who holds it.',
  },
];

const KEY = 'dnd-forge:house-rules:v1';

export function loadHouseRules(): HouseRules {
  try {
    const raw = read(KEY);
    if (!raw) return DEFAULT_HOUSE_RULES;
    const parsed = JSON.parse(raw) as Partial<HouseRules>;
    // Read field by field rather than spread: a stored file from a later
    // version must not smuggle in a rule this one does not know how to apply.
    return { highGround: parsed.highGround === true };
  } catch {
    // Corrupt, or storage refused. The book's rules are the safe answer.
    return DEFAULT_HOUSE_RULES;
  }
}

export function saveHouseRules(rules: HouseRules): void {
  try {
    write(KEY, JSON.stringify(rules));
  } catch {
    // Not remembering the choice is no reason to refuse to apply it.
  }
}

/**
 * What high ground is worth on this attack, in points of attack bonus.
 *
 * Takes the steps already computed by `heightAdvantage` rather than the map,
 * so the one place that decides whether somebody is uphill stays the one
 * place. Any height at all is the same +2 - a tower is not four times the
 * advantage of a kerb, and the game this is borrowed from does not pretend
 * otherwise.
 */
export const highGroundBonus = (rules: HouseRules, steps: number): number =>
  rules.highGround && steps > 0 ? 2 : 0;
