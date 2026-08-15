import { describe, expect, it } from 'vitest';
import { STANDARD_ARRAY, roll4d6DropLowest, rollAbilityScores } from './pointBuy';
import { ABILITIES } from '../types';

/**
 * §82. Rolling for ability scores - the fourth way to fill in six numbers,
 * and the one the other three were always compared to.
 *
 * The rng is a parameter, so these are assertions about dice rather than
 * assertions about ranges. A roller that dropped the highest, or dropped
 * every copy of the lowest, passes a range test and fails these.
 */

/** A fixed rng that walks a list of die faces, looping. */
const facesOf = (faces: number[]): (() => number) => {
  let i = 0;
  // `rollDie` computes floor(rng() * 6) + 1, so a face f needs (f - 1) / 6
  // plus a nudge that cannot reach the next face.
  return () => {
    const face = faces[i++ % faces.length];
    return (face - 1) / 6 + 0.01;
  };
};

describe('4d6, drop the lowest', () => {
  it('drops exactly one die, the lowest', () => {
    expect(roll4d6DropLowest(facesOf([6, 5, 4, 1]))).toBe(15);
    expect(roll4d6DropLowest(facesOf([1, 2, 3, 4]))).toBe(9);
  });

  it('drops one copy of the lowest, not all of them', () => {
    // Four sixes is eighteen, not zero - the bug a filter would have.
    expect(roll4d6DropLowest(facesOf([6, 6, 6, 6]))).toBe(18);
    // Three ones and a six keeps two ones: 1 + 1 + 6.
    expect(roll4d6DropLowest(facesOf([1, 1, 1, 6]))).toBe(8);
  });

  it('cannot leave the 3-18 range whatever the dice say', () => {
    for (let seed = 0; seed < 200; seed++) {
      const score = roll4d6DropLowest(() => ((seed * 97) % 1000) / 1000);
      expect(score).toBeGreaterThanOrEqual(3);
      expect(score).toBeLessThanOrEqual(18);
    }
  });
});

describe('six of them, seated', () => {
  /** A Fighter's shape: Strength first, then Constitution, then Dexterity. */
  const priority = { str: 5, con: 4, dex: 3, wis: 2, cha: 1, int: 0 };

  it('gives the highest roll to what the class wants most', () => {
    // Twenty-four faces: four per score, descending, so the rolls come out
    // 15, 12, 9, 9, 6, 3 in the order they were made.
    const { scores, rolled } = rollAbilityScores(
      priority,
      facesOf([6, 5, 4, 1, 5, 4, 3, 2, 4, 3, 2, 1, 3, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1]),
    );
    expect(rolled).toEqual([15, 12, 9, 9, 6, 3]);
    expect(scores.str).toBe(15);
    expect(scores.con).toBe(12);
    expect(scores.dex).toBe(9);
    expect(scores.int).toBe(3);
  });

  it('hands back six rolls in the order they were made, unsorted', () => {
    // The seating sorts; the record does not, because "what did I roll" is
    // asked about the dice rather than about the sheet.
    const { rolled } = rollAbilityScores(
      priority,
      facesOf([1, 1, 1, 1, 6, 6, 6, 6, 1, 1, 1, 1, 6, 6, 6, 6, 1, 1, 1, 1, 6, 6, 6, 6]),
    );
    expect(rolled).toEqual([3, 18, 3, 18, 3, 18]);
  });

  it('fills all six abilities and nothing else', () => {
    const { scores } = rollAbilityScores(priority, () => 0.5);
    expect(Object.keys(scores).sort()).toEqual([...ABILITIES].sort());
    for (const ability of ABILITIES) {
      expect(scores[ability]).toBeGreaterThanOrEqual(3);
      expect(scores[ability]).toBeLessThanOrEqual(18);
    }
  });

  it('is a different shape from the standard array, deliberately', () => {
    // The array is fixed and legal; a roll is neither, which is the whole
    // reason a table picks one over the other.
    const { rolled } = rollAbilityScores(priority, facesOf([6, 6, 6, 6]));
    expect(rolled).toEqual([18, 18, 18, 18, 18, 18]);
    expect(STANDARD_ARRAY).toEqual([15, 14, 13, 12, 10, 8]);
  });
});
