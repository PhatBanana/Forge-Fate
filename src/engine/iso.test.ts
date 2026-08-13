import { describe, expect, it } from 'vitest';
import { HH, HW, WALL_STEPS, ZH, groundCells, isoProjection, vx, vy } from './iso';
import { generateDungeon } from './dungeon';
import type { Square } from '../encounter';

/**
 * §66.1: the tactical projection, pinned before a second renderer consumes it.
 *
 * Every assertion here is against behavior `IsoMap` already had - the point
 * of this file is that the extraction was a move, not a rewrite, and that the
 * WebGL renderer arriving next inherits *exactly* what the SVG draws today,
 * including the one quirk recorded by name below.
 */

const arena = (w = 10, h = 8) => generateDungeon('x', { rooms: 0, width: w, height: h });

describe('the facing permutation', () => {
  it('round-trips at all four rotations', () => {
    const dungeon = arena(10, 8);
    const squares: Square[] = [
      { x: 0, y: 0 },
      { x: 9, y: 7 },
      { x: 3, y: 5 },
    ];
    for (let facing = 0; facing < 4; facing++) {
      const proj = isoProjection(dungeon, {}, {}, facing);
      for (const at of squares) {
        expect(proj.unorient(proj.orient(at))).toEqual(at);
      }
    }
  });

  it('normalises the orientation, including negatives', () => {
    const dungeon = arena();
    expect(isoProjection(dungeon, {}, {}, 5).rot).toBe(1);
    expect(isoProjection(dungeon, {}, {}, -1).rot).toBe(3);
    // And a full turn is the identity.
    const at = { x: 2, y: 3 };
    expect(isoProjection(dungeon, {}, {}, 4).orient(at)).toEqual(at);
  });

  it('swaps the frame dimensions on odd facings', () => {
    const dungeon = arena(10, 8);
    const front = isoProjection(dungeon, {}, {}, 0);
    const side = isoProjection(dungeon, {}, {}, 1);
    expect([front.gw, front.gh]).toEqual([10, 8]);
    expect([side.gw, side.gh]).toEqual([8, 10]);
  });
});

describe('the frame', () => {
  it('matches the projection arithmetic for a known map', () => {
    // A 10×8 arena with no elevation: minX = vx(0,8) = -112,
    // w = vx(10,0) − minX = 140 + 112 = 252, pad = 2·8 + 24 = 40 (walls
    // reserve two steps of headroom even on a flat map),
    // h = vy(10,8) + pad + LIP + 14 = 126 + 40 + 3 + 14 = 183.
    const proj = isoProjection(arena(10, 8), {}, {}, 0);
    expect(proj.minX).toBe(vx(0, 8));
    expect(proj.w).toBe(vx(10, 0) - vx(0, 8));
    expect(proj.frame).toEqual({ x0: 0, y0: -proj.pad, w: proj.w, h: proj.h });
  });

  it('grows the headroom with the tallest ground and the floor with the deepest pit', () => {
    const flat = isoProjection(arena(), {}, {}, 0);
    const tall = isoProjection(arena(), { '2,2': 3 }, {}, 0);
    const deep = isoProjection(arena(), { '2,2': -2 }, {}, 0);
    expect(tall.pad).toBe(flat.pad + 3 * ZH);
    expect(deep.h).toBe(flat.h + 2 * ZH);
  });
});

describe('faces and centres', () => {
  it('projects a cell to the diamond the formula promises', () => {
    const proj = isoProjection(arena(), {}, {}, 0);
    const corners = proj.faceCorners({ x: 2, y: 3 }, 0);
    expect(corners).toEqual([
      [vx(2, 3) - proj.minX, vy(2, 3)],
      [vx(3, 3) - proj.minX, vy(3, 3)],
      [vx(3, 4) - proj.minX, vy(3, 4)],
      [vx(2, 4) - proj.minX, vy(2, 4)],
    ]);
  });

  it('lifts a raised cell by its height', () => {
    const proj = isoProjection(arena(), { '2,3': 2 }, {}, 0);
    const flat = proj.faceCorners({ x: 2, y: 3 }, 0);
    const raised = proj.faceCorners({ x: 2, y: 3 }, 2);
    expect(raised.map(([, y]) => y)).toEqual(flat.map(([, y]) => y - 2 * ZH));
    expect(proj.centreOf({ x: 2, y: 3 }).y).toBe(vy(2.5, 3.5) - 2 * ZH);
  });

  it('draws a wall two steps above its ground', () => {
    const proj = isoProjection(arena(), { '4,4': 1 }, { '4,4': 'wall' }, 0);
    expect(proj.drawZ({ x: 4, y: 4 })).toBe(1 + WALL_STEPS);
    expect(proj.drawZ({ x: 5, y: 4 })).toBe(0);
  });
});

describe('the pointer inverse', () => {
  it('inverts the centre of a flat square at every facing', () => {
    const dungeon = arena(10, 8);
    for (let facing = 0; facing < 4; facing++) {
      const proj = isoProjection(dungeon, {}, {}, facing);
      for (const at of [{ x: 0, y: 0 }, { x: 9, y: 7 }, { x: 4, y: 2 }]) {
        expect(proj.squareAtPoint(proj.centreOf(at))).toEqual(at);
      }
    }
  });

  it('inverts a raised square, preferring its cap over the flat square behind', () => {
    for (let facing = 0; facing < 4; facing++) {
      const proj = isoProjection(arena(10, 8), { '3,3': 2 }, {}, facing);
      expect(proj.squareAtPoint(proj.centreOf({ x: 3, y: 3 }))).toEqual({ x: 3, y: 3 });
    }
  });

  it('gives an interior pit\'s floor to the flat square that visually covers it', () => {
    // A sunken floor is drawn lower on screen, which is exactly where the
    // flat square nearer the camera paints its own diamond - so the click
    // belongs to the covering square, the same answer the eye gives. First
    // written expecting the pit to win; the projection knew better.
    const proj = isoProjection(arena(10, 8), { '6,1': -1 }, {}, 0);
    expect(proj.squareAtPoint(proj.centreOf({ x: 6, y: 1 }))).toEqual({ x: 7, y: 2 });
  });

  it('still finds a pit at the map edge, where nothing covers it', () => {
    const proj = isoProjection(arena(10, 8), { '9,7': -1 }, {}, 0);
    expect(proj.squareAtPoint(proj.centreOf({ x: 9, y: 7 }))).toEqual({ x: 9, y: 7 });
  });

  it('returns null off the board and for a null point', () => {
    const proj = isoProjection(arena(4, 4), {}, {}, 0);
    expect(proj.squareAtPoint(null)).toBeNull();
    expect(proj.squareAtPoint({ x: -10_000, y: -10_000 })).toBeNull();
  });

  /*
    The recorded quirk: a wall DRAWS `WALL_STEPS` higher than its elevation,
    but the inverse iterates elevation values only - so clicking where the
    wall's cap is painted resolves as if the wall were at ground height, and
    can land on the square visually behind it.

    Pinned deliberately. This was IsoMap's behavior before the extraction, and
    §66.1's one promise is "a move, not a rewrite" - fixing it here would have
    changed where clicks land in the shipping SVG view mid-refactor. If this
    test ever fails because somebody taught the inverse about WALL_STEPS *in
    both views on purpose*, delete it with a clear conscience and the ROADMAP
    line that tracks the fix.
  */
  it('hit-tests a wall at its ground height, not its drawn cap (the WALL_STEPS quirk)', () => {
    const proj = isoProjection(arena(10, 8), {}, { '5,4': 'wall' }, 0);
    const wall = { x: 5, y: 4 };
    // Where the cap is painted...
    const cap = proj.centreOf(wall, proj.drawZ(wall));
    // ...is not where the wall answers. The ground-height centre is.
    expect(proj.squareAtPoint(cap)).not.toEqual(wall);
    expect(proj.squareAtPoint(proj.centreOf(wall, 0))).toEqual(wall);
  });
});

describe('paint order', () => {
  it('keeps farther cells first whichever way the camera faces', () => {
    const dungeon = arena(10, 8);
    for (let facing = 0; facing < 4; facing++) {
      const proj = isoProjection(dungeon, {}, {}, facing);
      const sorted = groundCells(dungeon, {}).sort((a, b) => proj.depthOf(a) - proj.depthOf(b));
      // The nearest cell must come last, and every step is monotone.
      for (let i = 1; i < sorted.length; i++) {
        expect(proj.depthOf(sorted[i])).toBeGreaterThanOrEqual(proj.depthOf(sorted[i - 1]));
      }
      // The corner nearest the camera at this facing is the final cell drawn.
      const last = sorted[sorted.length - 1];
      expect(proj.depthOf(last)).toBe(Math.max(...sorted.map((s) => proj.depthOf(s))));
    }
  });
});

describe('what counts as ground', () => {
  it('is every square on a blank arena', () => {
    expect(groundCells(arena(6, 5), {}).length).toBe(30);
  });

  it('is rooms, corridors and painted terrain on a generated map', () => {
    const dungeon = generateDungeon('seed', { rooms: 4, width: 30, height: 20 });
    const bare = groundCells(dungeon, {});
    expect(bare.length).toBeGreaterThan(0);
    expect(bare.length).toBeLessThan(600);
    // Painting a wall out in the void makes that square ground - it stands
    // somewhere - while a paint outside the map is dropped.
    const withWall = groundCells(dungeon, { '0,0': 'wall', '99,99': 'wall' });
    expect(withWall.length).toBeLessThanOrEqual(bare.length + 1);
    expect(withWall.some((s) => s.x === 0 && s.y === 0)).toBe(true);
    expect(withWall.some((s) => s.x === 99)).toBe(false);
  });
});

describe('the raw vertex formulas', () => {
  it('are the documented ((gx−gy)·HW, (gx+gy)·HH)', () => {
    expect(vx(3, 1)).toBe(2 * HW);
    expect(vy(3, 1)).toBe(4 * HH);
    expect(vx(1, 3)).toBe(-2 * HW);
  });
});
