import type { Ruleset } from '../types';

/**
 * The conditions, and the exhaustion track.
 *
 * Play tracking covered hit points, hit dice, slots, class resources and death
 * saves - everything with a number attached - and none of the fifteen states
 * that change what you can actually do on your turn. Those are what a table
 * forgets: nobody forgets they are on 6 hit points, and everybody forgets that
 * being prone means their ranged attacks have disadvantage.
 *
 * Exhaustion is kept apart because it is a track rather than a state, it stacks
 * to six, and each level keeps the ones below it. It is also the one here that
 * changes a number the app computes: at level 2 your speed is halved.
 *
 * ## §60: which edition's rule you are reading
 *
 * `summary` had no ruleset dimension, so a 2024 character was shown 2014 text
 * on every screen that displays a condition - the same defect §46 found in
 * Brutal Critical, §47 in Artificer casting and §51 in exhaustion, and for the
 * same reason: **a rule with nowhere to say which edition it belongs to.**
 * Four times now. It is the most common bug in this codebase.
 *
 * ### What 2024 actually changed, which is less than it looks
 *
 * All fourteen texts differ in the SRD, and a text diff is therefore useless:
 * 2024 rewrote the *format* - every condition now opens "While you have the X
 * condition..." with a bolded heading per clause - so fourteen differences
 * report where four rules changed.
 *
 * Read rather than diffed, the changes are:
 *
 * - **Grappled** gains disadvantage on attacks against anyone but the
 *   grappler, and a movable clause: the grappler drags you at one extra foot
 *   per foot. The 2014 "ends if the grappler is incapacitated" line is gone
 *   from the condition itself.
 * - **Incapacitated** grows teeth. It now also costs your Bonus Action, breaks
 *   Concentration, stops you speaking, and gives **disadvantage on Initiative**
 *   if you have it when you roll.
 * - **Invisible** is rewritten around being *concealed* rather than heavily
 *   obscured, gains **advantage on Initiative**, and - the part people miss -
 *   **you lose the attack benefits against anyone who can somehow see you.**
 * - **Prone** prices standing up: half your Speed rounded down, and you cannot
 *   stand at all if your Speed is 0.
 * - **Unconscious** now says you remain Prone when it ends.
 *
 * Paralyzed, petrified and stunned were restated rather than changed - 2024
 * folds "can't move or speak" into Incapacitated and names Speed 0 explicitly.
 * Those get a 2024 line because the restatement is what a player at a 2024
 * table will be looking for; blinded, charmed, deafened, frightened, poisoned
 * and restrained get none, and **the absence is the claim**: no
 * `summaryIn2024` means the rule did not change.
 *
 * `srdAudit.test.ts` checks each 2024 line against the clause in the fixture it
 * rests on, which is a question a prose diff cannot ask.
 */

export interface Condition {
  id: string;
  name: string;
  /** What it does to you, in the terms you need mid-turn. 2014 wording. */
  summary: string;
  /**
   * The 2024 rule, where it differs. Absent means the two editions say the
   * same thing, which is the case for six of the fourteen - so this being
   * optional is a statement rather than a convenience.
   */
  summaryIn2024?: string;
  /**
   * This condition's own text includes the Incapacitated condition, so
   * everything that turns on "while incapacitated" - dodges ending, grapples
   * releasing - turns on this one too. A fact of the condition, so it lives
   * here rather than as an id list in whichever engine file asked first.
   */
  incapacitates?: true;
  /** This condition's text sets your speed to 0 (or says "can't move"). */
  stopsMovement?: true;
}

export const CONDITIONS: Condition[] = [
  { id: 'blinded', name: 'Blinded', summary: 'You cannot see: your attacks have disadvantage, and attacks against you have advantage.' },
  { id: 'charmed', name: 'Charmed', summary: 'You cannot attack the charmer, and they have advantage on social checks against you.' },
  { id: 'deafened', name: 'Deafened', summary: 'You cannot hear, and fail any check that needs hearing.' },
  { id: 'frightened', name: 'Frightened', summary: 'Disadvantage while the source is in sight, and you cannot willingly move closer to it.' },
  {
    id: 'grappled',
    name: 'Grappled',
    stopsMovement: true,
    summary: 'Your speed is 0, and it ends if the grappler is incapacitated or you are moved away.',
    summaryIn2024:
      'Speed 0, disadvantage on attacks against anyone but the grappler, and the grappler can drag you along at one extra foot per foot moved.',
  },
  {
    id: 'incapacitated',
    name: 'Incapacitated',
    incapacitates: true,
    summary: 'You can take no actions and no reactions at all.',
    summaryIn2024:
      'No action, bonus action or reaction, concentration broken, cannot speak — and disadvantage on initiative if you have this when you roll it.',
  },
  {
    id: 'invisible',
    name: 'Invisible',
    summary: 'You cannot be seen without magic: your attacks have advantage, and attacks against you have disadvantage.',
    summaryIn2024:
      'Concealed from anything that needs to see you, and advantage on initiative. Your attacks have advantage and attacks against you disadvantage — but not against a creature that can somehow see you.',
  },
  {
    id: 'paralyzed',
    name: 'Paralyzed',
    incapacitates: true,
    stopsMovement: true,
    summary: 'Incapacitated, cannot move or speak, fail Strength and Dexterity saves, and hits within 5 feet are critical.',
    summaryIn2024:
      'Incapacitated with speed 0, automatic failure on Strength and Dexterity saves, attacks against you have advantage, and hits within 5 feet are critical.',
  },
  {
    id: 'petrified',
    name: 'Petrified',
    incapacitates: true,
    stopsMovement: true,
    summary: 'Turned to stone: incapacitated, resistant to all damage, and immune to poison and disease.',
    summaryIn2024:
      'Turned to stone: incapacitated with speed 0, resistant to all damage, immune to the poisoned condition, and you fail Strength and Dexterity saves.',
  },
  { id: 'poisoned', name: 'Poisoned', summary: 'Disadvantage on attack rolls and on every ability check.' },
  {
    id: 'prone',
    name: 'Prone',
    summary: 'Disadvantage on your attacks; attacks against you have advantage within 5 feet and disadvantage beyond.',
    summaryIn2024:
      'Crawl, or spend half your speed rounded down to stand — and you cannot stand at all at speed 0. Disadvantage on your attacks; attacks against you have advantage within 5 feet and disadvantage beyond.',
  },
  { id: 'restrained', name: 'Restrained', stopsMovement: true, summary: 'Speed 0, disadvantage on attacks and Dexterity saves, and attacks against you have advantage.' },
  {
    id: 'stunned',
    name: 'Stunned',
    incapacitates: true,
    stopsMovement: true,
    summary: 'Incapacitated, cannot move, fail Strength and Dexterity saves, and attacks against you have advantage.',
    summaryIn2024:
      'Incapacitated — so no action, bonus action or reaction and no concentration — you fail Strength and Dexterity saves, and attacks against you have advantage.',
  },
  {
    id: 'unconscious',
    name: 'Unconscious',
    incapacitates: true,
    stopsMovement: true,
    summary: 'Incapacitated and prone, unaware of everything, and hits within 5 feet are critical.',
    summaryIn2024:
      'Incapacitated and prone with speed 0, you drop what you are holding, you fail Strength and Dexterity saves, and hits within 5 feet are critical. You stay prone when it ends.',
  },
];

export const CONDITIONS_BY_ID: Record<string, Condition> = Object.fromEntries(
  CONDITIONS.map((c) => [c.id, c]),
);

/**
 * The two condition families the engine keys rules off, derived from the
 * flags above rather than listed where they are used. Before this, the same
 * five ids were spelled out in three engine files - a dodge ending, a grapple
 * releasing, movement stopping - and a new condition would have had to find
 * all three.
 */
export const INCAPACITATING: string[] = CONDITIONS.filter((c) => c.incapacitates).map((c) => c.id);
export const SPEED_ZERO: string[] = CONDITIONS.filter((c) => c.stopsMovement).map((c) => c.id);

/**
 * What this condition does, under the rules this character is playing.
 *
 * One function rather than `condition.summaryIn2024 ?? condition.summary` at
 * each call site, because there are five call sites across four components and
 * the fifth would have been added by somebody else on a different day. That is
 * exactly how the 2014 text ended up on every 2024 screen in the first place.
 */
export function conditionText(condition: Condition, ruleset: Ruleset): string {
  return ruleset === '2024' ? condition.summaryIn2024 ?? condition.summary : condition.summary;
}

/** The same, from an id, for the callers that only have one. */
export function conditionTextFor(id: string, ruleset: Ruleset): string {
  const condition = CONDITIONS_BY_ID[id];
  return condition ? conditionText(condition, ruleset) : '';
}

/**
 * Each level keeps every effect below it, so level 3 is disadvantage on
 * attacks *and* half speed *and* disadvantage on checks.
 */
/**
 * Exhaustion moved to `engine/exhaustion.ts` in §51.
 *
 * It lived here as a six-line array with no ruleset dimension, which meant a
 * 2024 character was shown the 2014 ladder - the wrong rule at every level.
 * The two editions do different enough things that the answer is a computed
 * object rather than a list of strings, so it belongs with the engine and not
 * beside the conditions it is no longer shaped like.
 *
 * Re-exported here for the callers that still say `from '../data/conditions'`,
 * and for the fact that a reader looking for exhaustion looks here first.
 */
export { MAX_EXHAUSTION, exhaustionEffect, exhaustionLines } from '../engine/exhaustion';
