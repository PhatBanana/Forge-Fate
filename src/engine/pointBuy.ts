import { ABILITIES } from '../types';
import type { AbilityScores } from '../types';

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
