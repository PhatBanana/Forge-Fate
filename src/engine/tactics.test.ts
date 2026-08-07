import { describe, expect, it } from 'vitest';
import { flanked, heightAdvantage } from './tactics';

describe('the optional flanking rule', () => {
  it('sees the ally directly opposite, orthogonal or diagonal', () => {
    // Attacker west, ally east: the line continues through the target.
    expect(flanked({ x: 4, y: 5 }, { x: 5, y: 5 }, [{ x: 6, y: 5 }])).toBe(true);
    // Diagonal works the same way.
    expect(flanked({ x: 4, y: 4 }, { x: 5, y: 5 }, [{ x: 6, y: 6 }])).toBe(true);
  });

  it('is not fooled by an ally merely nearby', () => {
    // Beside the target rather than opposite the attacker.
    expect(flanked({ x: 4, y: 5 }, { x: 5, y: 5 }, [{ x: 5, y: 6 }])).toBe(false);
  });

  it('requires the attacker in melee reach', () => {
    // Two squares out is a bow shot, and bows do not flank.
    expect(flanked({ x: 3, y: 5 }, { x: 5, y: 5 }, [{ x: 6, y: 5 }])).toBe(false);
  });
});

describe('high ground', () => {
  it('counts the steps the attacker holds over the target', () => {
    const elevation = { '2,2': 2, '5,5': -1 };
    expect(heightAdvantage(elevation, { x: 2, y: 2 }, { x: 5, y: 5 })).toBe(3);
    expect(heightAdvantage(elevation, { x: 5, y: 5 }, { x: 2, y: 2 })).toBe(-3);
    expect(heightAdvantage({}, { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(0);
  });
});
