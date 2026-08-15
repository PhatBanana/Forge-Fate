import { ABILITIES } from '../types';
import type { AbilityScores } from '../types';
import { rollDie } from './dice';
import type { Rng } from './dice';

export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;

/** Standard 5e point-buy costs. */
const COST: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

export function pointsSpent(scores: AbilityScores): number {
  return ABILITIES.reduce((sum, ability) => sum + (COST[scores[ability]] ?? 0), 0);
}

export function isLegalPointBuy(scores: AbilityScores): boolean {
  return (
    ABILITIES.every((a) => scores[a] >= POINT_BUY_MIN && scores[a] <= POINT_BUY_MAX) &&
    pointsSpent(scores) <= POINT_BUY_BUDGET
  );
}

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

/**
 * Spend the point-buy budget on a class's priorities: buy the primaries to 15
 * first, then fill down the priority order while points remain.
 */
export function optimalPointBuy(priority: Record<string, number>): AbilityScores {
  const scores: AbilityScores = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };
  const order = [...ABILITIES].sort((a, b) => priority[b] - priority[a]);

  // Primaries to 15 first - the modifier steps there are the cheapest per point.
  for (const ability of order) {
    if (priority[ability] < 3) continue;
    while (scores[ability] < 15 && pointsSpent({ ...scores, [ability]: scores[ability] + 1 }) <= POINT_BUY_BUDGET) {
      scores[ability] += 1;
    }
  }
  // Then buy everything else up to 14, which is the last cheap tier.
  for (const target of [14, 15]) {
    for (const ability of order) {
      if (priority[ability] <= 0) continue;
      while (
        scores[ability] < target &&
        pointsSpent({ ...scores, [ability]: scores[ability] + 1 }) <= POINT_BUY_BUDGET
      ) {
        scores[ability] += 1;
      }
    }
  }
  return scores;
}

/** Assign the standard array to a class's priorities, best score to best stat. */
export function assignStandardArray(priority: Record<string, number>): AbilityScores {
  const order = [...ABILITIES].sort((a, b) => priority[b] - priority[a]);
  const scores: AbilityScores = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };
  order.forEach((ability, i) => {
    scores[ability] = STANDARD_ARRAY[i];
  });
  return scores;
}

/**
 * §82: "roll 4d6, drop the lowest", six times.
 *
 * The oldest way to make a character, and the last of the four this app was
 * missing - point buy, the standard array and typing a number you rolled
 * elsewhere have all been here since the Builder had an Abilities section.
 *
 * The rng is a parameter for the reason every other roll in this app takes
 * one: a test that cannot fix the dice can only assert ranges, and ranges are
 * how a broken roller passes. `engine/dice.ts` owns the die itself.
 */
export function roll4d6DropLowest(rng: Rng): number {
  const dice = [rollDie(6, rng), rollDie(6, rng), rollDie(6, rng), rollDie(6, rng)];
  const lowest = Math.min(...dice);
  // `indexOf` rather than a filter: four sixes drops one six, not all four.
  dice.splice(dice.indexOf(lowest), 1);
  return dice.reduce((total, die) => total + die, 0);
}

/**
 * Six rolls, seated by what the class wants - the same courtesy
 * `assignStandardArray` does, and for the same reason: a player who rolls a
 * 17 and a 9 knows which one the Fighter wants in Strength, and making them
 * drag numbers around to say so is a chore rather than a choice. The rolls
 * come back too, in the order they were made, because "what did I actually
 * roll" is the question the table asks next.
 */
export function rollAbilityScores(
  priority: Record<string, number>,
  rng: Rng,
): { scores: AbilityScores; rolled: number[] } {
  const rolled = Array.from({ length: 6 }, () => roll4d6DropLowest(rng));
  const seated = [...rolled].sort((a, b) => b - a);
  const order = [...ABILITIES].sort((a, b) => priority[b] - priority[a]);
  const scores: AbilityScores = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };
  order.forEach((ability, i) => {
    scores[ability] = seated[i];
  });
  return { scores, rolled };
}
