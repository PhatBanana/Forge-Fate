import { describe, expect, it } from 'vitest';
import { reachableFrom, walkMap } from './path';
import { walkable } from './sight';
import type { SightContext } from './sight';
import { generateDungeon } from './dungeon';
import { paint } from '../terrain';
import type { TerrainMap } from '../terrain';

/**
 * Walking, worked by hand on small maps.
 *
 * The case that forced this module into existence is the first one: a square
 * five feet away on the far side of a wall, which the radius-based wash
 * happily offered and no wall has ever permitted.
 */

const open = (terrain: TerrainMap = {}): SightContext => ({
  dungeon: generateDungeon('x', { rooms: 0, width: 20, height: 20 }),
  terrain,
  elevation: {},
});

describe('walls are walls', () => {
  it('does not walk through one, however close the far side is', () => {
    // A wall column at x=5 with one gap at y=9, standing at (4,5).
    let terrain: TerrainMap = {};
    for (let y = 0; y < 20; y++) {
      if (y !== 9) terrain = paint(terrain, { x: 5, y }, 'wall');
    }
    const reach = reachableFrom(open(terrain), { x: 4, y: 5 }, 25);
    // (6,5) is ten feet away as the crow flies and unreachable as the feet walk
    // in twenty-five: through the gap at y=9 it is a long way round.
    expect(reach.has('6,5')).toBe(false);
    // The gap itself is reachable, at its real walked price: three squares
    // down the wall and a diagonal in, twenty feet.
    expect(reach.get('5,9')).toBe(20);
  });

  it('charges the walk around, not the crow\'s line', () => {
    // A three-square wall between (2,2) and (4,2): straight over is 10 ft,
    // around the end is 20.
    let terrain: TerrainMap = {};
    for (let y = 1; y <= 3; y++) terrain = paint(terrain, { x: 3, y }, 'wall');
    const reach = reachableFrom(open(terrain), { x: 2, y: 2 }, 30);
    expect(reach.get('4,2')).toBe(20);
  });

  it('refuses to cut the corner between two pillars', () => {
    const terrain = paint(paint({}, { x: 3, y: 2 }, 'pillar'), { x: 2, y: 3 }, 'pillar');
    const reach = reachableFrom(open(terrain), { x: 2, y: 2 }, 20);
    // The diagonal (3,3) is walkable ground, but both shoulders are pillars:
    // getting there means going around, three steps for fifteen feet. (The
    // first version of this test gave the walk ten feet of budget and was
    // surprised the square was missing - the detour is the point.)
    expect(reach.get('3,3')).toBe(15);
  });
});

describe('the ground itself', () => {
  it('charges double to enter difficult ground', () => {
    const terrain = paint({}, { x: 3, y: 2 }, 'water');
    const reach = reachableFrom(open(terrain), { x: 2, y: 2 }, 30);
    // Stepping into the pool costs ten...
    expect(reach.get('3,2')).toBe(10);
    // ...and the far bank costs ten too, because the walk goes AROUND the
    // water on the diagonals rather than paying fifteen to wade through.
    // Worked by hand expecting fifteen; Dijkstra found the dry route, which
    // is exactly what it is for.
    expect(reach.get('4,2')).toBe(10);
  });

  it('respects the movement budget to the foot', () => {
    const reach = reachableFrom(open(), { x: 10, y: 10 }, 10);
    // Two squares in any direction, diagonals included - the 5×5 block minus
    // the origin: 24 squares. Not one more.
    expect(reach.size).toBe(24);
    expect(reach.get('12,12')).toBe(10);
    expect(reach.has('13,10')).toBe(false);
  });

  it('ends at the map edge, even on a blank map with no budget cap', () => {
    /*
      The regression that found itself: a blank map used to be walkable in
      every direction without end, so the uncapped walk the ruler runs on
      explored an infinite plane and never came back - the screen froze the
      moment a token was selected on a zero-room arena. The edge of the map
      is the edge of the map.
    */
    const ctx = open();
    const walk = walkMap(ctx, { x: 10, y: 10 }, Infinity);
    // Every square of the 20x20 grid except the origin, and not one more.
    expect(walk.cost.size).toBe(20 * 20 - 1);
  });

  it('treats generated dungeon rock as unwalkable', () => {
    const dungeon = generateDungeon('first light', { rooms: 8 });
    const ctx: SightContext = { dungeon, terrain: {}, elevation: {} };
    const room = dungeon.rooms[0];
    // Standing mid-room with a big budget: nothing outside rooms, corridors
    // and doors is ever in the map.
    const reach = reachableFrom(
      ctx,
      { x: room.x + 1, y: room.y + 1 },
      60,
    );
    for (const key of reach.keys()) {
      const [x, y] = key.split(',').map(Number);
      expect(walkable(ctx, { x, y }), key).toBe(true);
    }
    expect(reach.size).toBeGreaterThan(0);
  });
});

describe('the zones underfoot', () => {
  it('a blocked overlay is a wall: nothing enters, routes bend around', () => {
    // A wall-of-force column at x=5, one gap at y=9.
    const blocked = new Set<string>();
    for (let y = 0; y < 20; y++) if (y !== 9) blocked.add(`5,${y}`);
    const walk = walkMap(open(), { x: 4, y: 5 }, Infinity, { blocked });
    expect(walk.cost.has('5,5')).toBe(false);
    // The far side is reachable only through the gap: 4 down, across, 4 up.
    expect(walk.cost.get('6,5')).toBeGreaterThanOrEqual(30);
  });

  it('a difficult overlay doubles the toll, like painted water', () => {
    // A full column of web at x=5: no dry way around, so crossing costs 10.
    const difficult = new Set<string>();
    for (let y = 0; y < 20; y++) difficult.add(`5,${y}`);
    const walk = walkMap(open(), { x: 4, y: 5 }, Infinity, { difficult });
    expect(walk.cost.get('5,5')).toBe(10);
    expect(walk.cost.get('6,5')).toBe(15);
  });

  it('an avoid overlay excludes the hazard, for the safe route to prefer', () => {
    // Fire on the direct line; the safe walk routes around it.
    const avoid = new Set(['5,5']);
    const walk = walkMap(open(), { x: 4, y: 5 }, Infinity, { avoid });
    expect(walk.cost.has('5,5')).toBe(false);
    // One square east of the fire still reachable, around: still 5 ft
    // diagonal-around on an open field? No - (6,5) via (5,4) diagonal is 10.
    expect(walk.cost.get('6,5')).toBe(10);
  });
});

describe('a walk from several places at once', () => {
  /**
   * Seeded from every one of them, so each square holds its distance to the
   * *nearest*. One sweep answers "how far is this square from the party",
   * which is the question a monster deciding which way to run has to ask
   * about every square it could stand on.
   */
  it('gives each square its distance to the nearest source', () => {
    const walk = walkMap(open(), [{ x: 2, y: 2 }, { x: 12, y: 2 }], Infinity);
    // Between the two, nearer the second.
    expect(walk.cost.get('10,2')).toBe(10);
    expect(walk.cost.get('4,2')).toBe(10);
    // Dead centre is the same either way.
    expect(walk.cost.get('7,2')).toBe(25);
  });

  it('leaves every source itself out, the way one source is left out', () => {
    const walk = walkMap(open(), [{ x: 2, y: 2 }, { x: 12, y: 2 }], Infinity);
    expect(walk.cost.has('2,2')).toBe(false);
    expect(walk.cost.has('12,2')).toBe(false);
  });

  it('agrees with the single-source walk when there is only one', () => {
    const one = walkMap(open(), { x: 4, y: 5 }, 30);
    const asList = walkMap(open(), [{ x: 4, y: 5 }], 30);
    expect([...asList.cost.entries()].sort()).toEqual([...one.cost.entries()].sort());
  });

  it('still refuses to cross a wall, from any of them', () => {
    let terrain: TerrainMap = {};
    // `paint` returns a new map rather than mutating one.
    for (let y = 0; y < 20; y++) terrain = paint(terrain, { x: 5, y }, 'wall');
    const walk = walkMap(open(terrain), [{ x: 2, y: 2 }, { x: 2, y: 15 }], Infinity);
    // Two sources, both west of an unbroken wall: nothing east is reachable.
    expect(walk.cost.has('6,2')).toBe(false);
    expect(walk.cost.get('3,8')).toBeDefined();
  });
});
