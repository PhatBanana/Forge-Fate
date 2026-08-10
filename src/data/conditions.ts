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
 */

export interface Condition {
  id: string;
  name: string;
  /** What it does to you, in the terms you need mid-turn. */
  summary: string;
}

export const CONDITIONS: Condition[] = [
  { id: 'blinded', name: 'Blinded', summary: 'You cannot see: your attacks have disadvantage, and attacks against you have advantage.' },
  { id: 'charmed', name: 'Charmed', summary: 'You cannot attack the charmer, and they have advantage on social checks against you.' },
  { id: 'deafened', name: 'Deafened', summary: 'You cannot hear, and fail any check that needs hearing.' },
  { id: 'frightened', name: 'Frightened', summary: 'Disadvantage while the source is in sight, and you cannot willingly move closer to it.' },
  { id: 'grappled', name: 'Grappled', summary: 'Your speed is 0, and it ends if the grappler is incapacitated or you are moved away.' },
  { id: 'incapacitated', name: 'Incapacitated', summary: 'You can take no actions and no reactions at all.' },
  { id: 'invisible', name: 'Invisible', summary: 'You cannot be seen without magic: your attacks have advantage, and attacks against you have disadvantage.' },
  { id: 'paralyzed', name: 'Paralyzed', summary: 'Incapacitated, cannot move or speak, fail Strength and Dexterity saves, and hits within 5 feet are critical.' },
  { id: 'petrified', name: 'Petrified', summary: 'Turned to stone: incapacitated, resistant to all damage, and immune to poison and disease.' },
  { id: 'poisoned', name: 'Poisoned', summary: 'Disadvantage on attack rolls and on every ability check.' },
  { id: 'prone', name: 'Prone', summary: 'Disadvantage on your attacks; attacks against you have advantage within 5 feet and disadvantage beyond.' },
  { id: 'restrained', name: 'Restrained', summary: 'Speed 0, disadvantage on attacks and Dexterity saves, and attacks against you have advantage.' },
  { id: 'stunned', name: 'Stunned', summary: 'Incapacitated, cannot move, fail Strength and Dexterity saves, and attacks against you have advantage.' },
  { id: 'unconscious', name: 'Unconscious', summary: 'Incapacitated and prone, unaware of everything, and hits within 5 feet are critical.' },
];

export const CONDITIONS_BY_ID: Record<string, Condition> = Object.fromEntries(
  CONDITIONS.map((c) => [c.id, c]),
);

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
