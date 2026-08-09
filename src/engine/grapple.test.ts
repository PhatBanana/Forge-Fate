import { describe, expect, it } from 'vitest';
import { canGrapple, dragSpeed, escapeContest, grappleEnds, END_REASON } from './grapple';
import { speedUnderConditions } from './advantage';
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

describe('who can be grabbed', () => {
  it('follows the same size rule a shove does', () => {
    expect(canGrapple('Medium', 'Large')).toBe(true);
    expect(canGrapple('Medium', 'Huge')).toBe(false);
    expect(canGrapple('Gargantuan', 'Tiny')).toBe(true);
  });
});

describe('escaping', () => {
  it('lets the escapee use their better skill', () => {
    // Athletics +0, Acrobatics +7: the second is what gets rolled, so a die
    // of 10 reads 17 rather than 10.
    const out = escapeContest(0, 7, 0, rolls(10, 5));
    expect(out.escapeeUsed).toBe('Acrobatics');
    expect(out.escapeeRoll).toBe(17);
    expect(out.grapplerRoll).toBe(5);
    expect(out.success).toBe(true);
  });

  it('gives the grappler Athletics and nothing else', () => {
    // The mirror of the shove contest: here the *grappler* has no choice.
    // Same dice, escapee's Athletics is the better one, so both roll flat.
    const out = escapeContest(4, 1, 4, rolls(10, 10));
    expect(out.escapeeUsed).toBe('Athletics');
    expect(out.escapeeRoll).toBe(14);
    expect(out.grapplerRoll).toBe(14);
  });

  it('leaves them held on a tie, because no change means still caught', () => {
    const out = escapeContest(3, 0, 3, rolls(12, 12));
    expect(out.escapeeRoll).toBe(out.grapplerRoll);
    expect(out.success).toBe(false);
  });
});

describe('when a hold stops being a hold', () => {
  const holding = { conditions: [], hp: 12, at: { x: 4, y: 4 } };

  it('holds while they are adjacent and the grappler is up', () => {
    expect(grappleEnds(holding, { at: { x: 5, y: 5 } })).toBe(null);
  });

  it('ends when the grappler drops', () => {
    expect(grappleEnds({ ...holding, hp: 0 }, { at: { x: 5, y: 5 } })).toBe('down');
  });

  it('ends on any of the conditions that mean letting go', () => {
    for (const c of ['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious']) {
      expect(grappleEnds({ ...holding, conditions: [c] }, { at: { x: 4, y: 5 } })).toBe(
        'incapacitated',
      );
    }
    // Prone is not one of them: you can hold somebody from the floor.
    expect(grappleEnds({ ...holding, conditions: ['prone'] }, { at: { x: 4, y: 5 } })).toBe(null);
  });

  it('ends when something moves them out of reach', () => {
    expect(grappleEnds(holding, { at: { x: 7, y: 4 } })).toBe('apart');
    // A reach of two squares holds them at ten feet, which is what a Large
    // creature with a long arm should get.
    expect(grappleEnds(holding, { at: { x: 6, y: 4 } }, 2)).toBe(null);
    expect(grappleEnds(holding, { at: { x: 7, y: 4 } }, 2)).toBe('apart');
  });

  it('ends when either of them is off the map, and when the grappler is gone', () => {
    expect(grappleEnds(holding, { at: null })).toBe('apart');
    expect(grappleEnds({ ...holding, at: null }, { at: { x: 4, y: 5 } })).toBe('apart');
    expect(grappleEnds(undefined, { at: { x: 4, y: 5 } })).toBe('gone');
  });

  it('has a sentence for every ending, so the log can never say undefined', () => {
    for (const reason of ['down', 'incapacitated', 'apart', 'gone'] as const) {
      expect(END_REASON[reason]).toBeTruthy();
    }
  });
});

describe('dragging somebody along', () => {
  it('halves your speed', () => {
    expect(dragSpeed(30, 'Medium', 'Medium')).toBe(15);
    expect(dragSpeed(25, 'Medium', 'Small')).toBe(12);
  });

  it('costs nothing when they are two or more sizes smaller', () => {
    expect(dragSpeed(30, 'Medium', 'Tiny')).toBe(30);
    expect(dragSpeed(40, 'Huge', 'Medium')).toBe(40);
  });

  it('halves it when they are bigger than you, which is the usual way round', () => {
    expect(dragSpeed(30, 'Small', 'Medium')).toBe(15);
  });
});

describe('the conditions that take the feet away', () => {
  it('zeroes a speed for each of the six', () => {
    for (const c of [
      'grappled',
      'restrained',
      'paralyzed',
      'petrified',
      'stunned',
      'unconscious',
    ]) {
      expect(speedUnderConditions(30, [c])).toBe(0);
    }
  });

  it('leaves the rest of them alone', () => {
    expect(speedUnderConditions(30, ['prone', 'frightened', 'poisoned', 'blinded'])).toBe(30);
    expect(speedUnderConditions(30, [])).toBe(30);
  });
});
