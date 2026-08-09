import { describe, expect, it } from 'vitest';
import { visibleFrom } from './fog';
import type { SightContext } from './sight';
import { generateDungeon } from './dungeon';
import { paint } from '../terrain';
import type { TerrainMap } from '../terrain';

const open = (terrain: TerrainMap = {}): SightContext => ({
  dungeon: generateDungeon('x', { rooms: 0, width: 20, height: 20 }),
  terrain,
  elevation: {},
});

describe('what the party can see', () => {
  it('sees the whole open field from one eye', () => {
    const seen = visibleFrom(open(), [{ at: { x: 5, y: 5 } }], 20, 20);
    expect(seen.size).toBe(400);
  });

  it('sees nothing with nobody standing anywhere', () => {
    expect(visibleFrom(open(), [], 20, 20).size).toBe(0);
  });

  it('stops at a wall, and a second eye lights the far side', () => {
    // A full wall column at x=10.
    let terrain: TerrainMap = {};
    for (let y = 0; y < 20; y++) terrain = paint(terrain, { x: 10, y }, 'wall');

    const oneEye = visibleFrom(open(terrain), [{ at: { x: 5, y: 5 } }], 20, 20);
    expect(oneEye.has('15,5')).toBe(false);
    expect(oneEye.has('9,5')).toBe(true);

    // The union: an eye on each side lights both, which is how a party works.
    const twoEyes = visibleFrom(open(terrain), [{ at: { x: 5, y: 5 } }, { at: { x: 15, y: 5 } }], 20, 20);
    expect(twoEyes.has('15,5')).toBe(true);
    expect(twoEyes.has('2,18')).toBe(true);
  });
});

describe('what the light lets them see', () => {
  /** A dark field, lit only by whatever the test says. */
  const dark = () => 'dark' as const;

  it('shows a creature nothing but its own square in the pitch dark', () => {
    const seen = visibleFrom(open(), [{ at: { x: 5, y: 5 } }], 20, 20, dark);
    expect(seen.size).toBe(1);
    expect(seen.has('5,5')).toBe(true);
  });

  it('gives darkvision its sixty feet and stops there', () => {
    const seen = visibleFrom(open(), [{ at: { x: 5, y: 5 }, darkvision: 60 }], 20, 20, dark);
    // Twelve squares is sixty feet, and Chebyshev makes it a square rather
    // than a circle - the same shape every other range in this app draws.
    expect(seen.has('17,5')).toBe(true);
    expect(seen.has('18,5')).toBe(false);
    expect(seen.has('17,17')).toBe(true);
  });

  it('lights a lit patch for everybody, darkvision or not', () => {
    const lamp = (at: { x: number; y: number }) =>
      Math.max(Math.abs(at.x - 15), Math.abs(at.y - 15)) <= 2 ? ('bright' as const) : ('dark' as const);
    const seen = visibleFrom(open(), [{ at: { x: 5, y: 5 } }], 20, 20, lamp);
    expect(seen.has('15,15')).toBe(true);
    expect(seen.has('10,10')).toBe(false);
  });

  it('unions the two kinds of eyes, which is what a party is', () => {
    const seen = visibleFrom(
      open(),
      [{ at: { x: 2, y: 2 } }, { at: { x: 16, y: 16 }, darkvision: 30 }],
      20,
      20,
      dark,
    );
    // The human's own square, and everything within the dwarf's thirty feet.
    expect(seen.has('2,2')).toBe(true);
    expect(seen.has('12,16')).toBe(true);
    expect(seen.has('9,16')).toBe(false);
  });
});
