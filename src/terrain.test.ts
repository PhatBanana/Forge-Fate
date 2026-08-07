import { describe, expect, it } from 'vitest';
import {
  ELEVATION_MAX,
  ELEVATION_MIN,
  TERRAIN,
  TERRAIN_BY_KIND,
  blocksSightAt,
  elevationAt,
  hydrateElevation,
  hydrateTerrain,
  keyOf,
  paint,
  squareOf,
  step,
} from './terrain';

/**
 * Terrain and height.
 *
 * Two promises carry the weight. Painting has to be reversible in place -
 * "not there" is the commonest fix, and a brush that toggles is how it needs
 * no eraser. And hydration has to be as paranoid as everything else read at
 * start-up, because a corrupt square would crash the map on every load.
 */

describe('the kinds', () => {
  it('says what blocks sight and what merely slows you down', () => {
    // These flags are what line of sight will cut on, so they are pinned as
    // facts rather than left to drift with a refactor.
    expect(TERRAIN_BY_KIND.wall.blocksSight).toBe(true);
    expect(TERRAIN_BY_KIND.pillar.blocksSight).toBe(true);
    expect(TERRAIN_BY_KIND.rock.blocksSight).toBe(true);
    // A tree breaks the sight line but you can stand under it.
    expect(TERRAIN_BY_KIND.tree.blocksSight).toBe(true);
    expect(TERRAIN_BY_KIND.tree.blocksMovement).toBe(false);
    // Water and rubble slow you and hide nothing.
    expect(TERRAIN_BY_KIND.water.blocksSight).toBe(false);
    expect(TERRAIN_BY_KIND.water.difficult).toBe(true);
    expect(TERRAIN_BY_KIND.rubble.difficult).toBe(true);
    // Floor is ground you built, and does nothing at all.
    expect(TERRAIN_BY_KIND.floor.blocksSight).toBe(false);
    expect(TERRAIN_BY_KIND.floor.blocksMovement).toBe(false);
    expect(TERRAIN.length).toBe(7);
  });
});

describe('painting', () => {
  it('paints, and painting the same kind again erases', () => {
    const one = paint({}, { x: 3, y: 4 }, 'pillar');
    expect(one['3,4']).toBe('pillar');
    expect(paint(one, { x: 3, y: 4 }, 'pillar')).toEqual({});
  });

  it('paints over rather than stacking', () => {
    const pillar = paint({}, { x: 1, y: 1 }, 'pillar');
    expect(paint(pillar, { x: 1, y: 1 }, 'tree')).toEqual({ '1,1': 'tree' });
  });

  it('erases with null and does nothing on an already-empty square', () => {
    const map = paint({}, { x: 2, y: 2 }, 'water');
    expect(paint(map, { x: 2, y: 2 }, null)).toEqual({});
    // Same reference back, so a no-op erase does not trigger a save.
    expect(paint(map, { x: 9, y: 9 }, null)).toBe(map);
  });

  it('round-trips a key', () => {
    expect(squareOf(keyOf({ x: -2, y: 17 }))).toEqual({ x: -2, y: 17 });
  });

  it('answers the question sight will ask', () => {
    const map = paint(paint({}, { x: 0, y: 0 }, 'pillar'), { x: 1, y: 0 }, 'water');
    expect(blocksSightAt(map, { x: 0, y: 0 })).toBe(true);
    expect(blocksSightAt(map, { x: 1, y: 0 })).toBe(false);
    expect(blocksSightAt(map, { x: 5, y: 5 })).toBe(false);
  });
});

describe('height', () => {
  it('steps up and down, and level nought leaves the map', () => {
    const up = step({}, { x: 2, y: 3 }, 1);
    expect(elevationAt(up, { x: 2, y: 3 })).toBe(1);
    // Back down to the floor is not stored: an empty map is flat.
    expect(step(up, { x: 2, y: 3 }, -1)).toEqual({});
  });

  it('clamps at the ends rather than climbing for ever', () => {
    let map = {};
    for (let i = 0; i < 20; i++) map = step(map, { x: 0, y: 0 }, 1);
    expect(elevationAt(map, { x: 0, y: 0 })).toBe(ELEVATION_MAX);
    for (let i = 0; i < 40; i++) map = step(map, { x: 0, y: 0 }, -1);
    expect(elevationAt(map, { x: 0, y: 0 })).toBe(ELEVATION_MIN);
  });
});

describe('what survives storage', () => {
  it('keeps good squares and drops the unreadable', () => {
    expect(
      hydrateTerrain({
        '3,4': 'pillar',
        'not-a-square': 'pillar',
        '5,5': 'lava',
        '6,-2': 'tree',
      }),
    ).toEqual({ '3,4': 'pillar', '6,-2': 'tree' });
  });

  it('treats an empty or broken map as no map', () => {
    expect(hydrateTerrain(undefined)).toBeUndefined();
    expect(hydrateTerrain('pillars everywhere')).toBeUndefined();
    expect(hydrateTerrain({})).toBeUndefined();
  });

  it('drops a stored level nought and clamps the rest', () => {
    expect(hydrateElevation({ '1,1': 3, '2,2': 0, '3,3': 99, '4,4': 'high' })).toEqual({
      '1,1': 3,
      '3,3': ELEVATION_MAX,
    });
  });
});
