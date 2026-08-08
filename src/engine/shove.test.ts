import { describe, expect, it } from 'vitest';
import { canShove, fallDamage, fallFeet, pushedTo, shoveContest } from './shove';
import type { Rng } from './dice';

/** A d20 sequence, so a contest can be pinned instead of hoped at. */
const rolls = (...values: number[]): Rng => {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i++;
    // rollDie does Math.floor(rng() * die) + 1, so this lands on `v`.
    return (v - 1) / 20 + 0.001;
  };
};

describe('who can be shoved', () => {
  it('allows one size larger, and refuses two', () => {
    expect(canShove('Medium', 'Large')).toBe(true);
    expect(canShove('Medium', 'Huge')).toBe(false);
    // Downwards is always fine: an ogre can shove a halfling.
    expect(canShove('Huge', 'Small')).toBe(true);
    expect(canShove('Medium', 'Medium')).toBe(true);
  });

  it('reads a size whatever case it was written in', () => {
    expect(canShove('medium', 'LARGE')).toBe(true);
  });

  it('treats an unknown size as Medium rather than as immovable', () => {
    // A homebrew monster with a blank size field should not accidentally
    // become the one thing in the game nobody can push.
    expect(canShove('Medium', '')).toBe(true);
    expect(canShove('', 'Large')).toBe(true);
  });
});

describe('the contest', () => {
  it('succeeds when the shover rolls higher', () => {
    const result = shoveContest(5, 0, 0, rolls(15, 4));
    expect(result.shoverRoll).toBe(20);
    expect(result.targetRoll).toBe(4);
    expect(result.success).toBe(true);
  });

  it('gives a tie to the defender, which is how a contest resolves', () => {
    const result = shoveContest(0, 0, 0, rolls(10, 10));
    expect(result.shoverRoll).toBe(result.targetRoll);
    expect(result.success).toBe(false);
  });

  it('resists with whichever skill is better, and says which', () => {
    // Acrobatics is the higher, so that is what the defender uses.
    const nimble = shoveContest(0, 1, 7, rolls(10, 10));
    expect(nimble.targetUsed).toBe('Acrobatics');
    expect(nimble.targetRoll).toBe(17);

    const burly = shoveContest(0, 7, 1, rolls(10, 10));
    expect(burly.targetUsed).toBe('Athletics');
    expect(burly.targetRoll).toBe(17);
  });

  it('prefers Athletics when the two are equal', () => {
    expect(shoveContest(0, 3, 3, rolls(10, 10)).targetUsed).toBe('Athletics');
  });
});

describe('where they end up', () => {
  it('pushes directly away, orthogonally', () => {
    expect(pushedTo({ x: 5, y: 5 }, { x: 6, y: 5 })).toEqual({ x: 7, y: 5 });
    expect(pushedTo({ x: 5, y: 5 }, { x: 4, y: 5 })).toEqual({ x: 3, y: 5 });
    expect(pushedTo({ x: 5, y: 5 }, { x: 5, y: 4 })).toEqual({ x: 5, y: 3 });
  });

  it('pushes diagonally when that is the way they are standing', () => {
    // The same one distance rule as everything else here: a diagonal is a step.
    expect(pushedTo({ x: 5, y: 5 }, { x: 6, y: 6 })).toEqual({ x: 7, y: 7 });
    expect(pushedTo({ x: 5, y: 5 }, { x: 4, y: 6 })).toEqual({ x: 3, y: 7 });
  });

  it('pushes from wherever the shover actually is, not from the origin', () => {
    expect(pushedTo({ x: 20, y: 20 }, { x: 19, y: 20 })).toEqual({ x: 18, y: 20 });
  });

  it('has nowhere to push somebody standing on top of you', () => {
    expect(pushedTo({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 5, y: 5 });
  });
});

describe('the drop', () => {
  it('is a d6 for every ten feet', () => {
    expect(fallDamage(10)).toBe('1d6');
    expect(fallDamage(30)).toBe('3d6');
    expect(fallDamage(35)).toBe('3d6');
  });

  it('is nothing at all under ten feet, rather than a pointless roll', () => {
    expect(fallDamage(0)).toBeNull();
    expect(fallDamage(5)).toBeNull();
    expect(fallDamage(9)).toBeNull();
  });

  it('caps where the SRD caps it', () => {
    expect(fallDamage(200)).toBe('20d6');
    expect(fallDamage(1000)).toBe('20d6');
  });

  it('measures a step as ten feet, which is a stated reading', () => {
    // terrain.ts keeps height in abstract steps on purpose. This module reads
    // one as ten feet and says so in the log rather than deciding quietly.
    expect(fallFeet(2, 0)).toBe(20);
    expect(fallFeet(3, 1)).toBe(20);
    // Being shoved uphill is not a fall.
    expect(fallFeet(0, 2)).toBe(0);
    expect(fallFeet(1, 1)).toBe(0);
  });
});
