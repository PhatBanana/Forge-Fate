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
    const seen = visibleFrom(open(), [{ x: 5, y: 5 }], 20, 20);
    expect(seen.size).toBe(400);
  });

  it('sees nothing with nobody standing anywhere', () => {
    expect(visibleFrom(open(), [], 20, 20).size).toBe(0);
  });

  it('stops at a wall, and a second eye lights the far side', () => {
    // A full wall column at x=10.
    let terrain: TerrainMap = {};
    for (let y = 0; y < 20; y++) terrain = paint(terrain, { x: 10, y }, 'wall');

    const oneEye = visibleFrom(open(terrain), [{ x: 5, y: 5 }], 20, 20);
    expect(oneEye.has('15,5')).toBe(false);
    expect(oneEye.has('9,5')).toBe(true);

    // The union: an eye on each side lights both, which is how a party works.
    const twoEyes = visibleFrom(open(terrain), [{ x: 5, y: 5 }, { x: 15, y: 5 }], 20, 20);
    expect(twoEyes.has('15,5')).toBe(true);
    expect(twoEyes.has('2,18')).toBe(true);
  });
});
