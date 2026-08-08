import { describe, expect, it } from 'vitest';
import { toUserSpace } from './letterbox';

/**
 * The maths behind a click on a map.
 *
 * Worth testing in isolation because the bug it fixes was invisible for a
 * whole section: every component test handed the map a box of exactly the
 * right aspect, and every browser probe clicked token and tile *elements*,
 * whose own boxes are correct whatever the parent does. Only a click on empty
 * ground, on a stage that is not the grid's shape, could see it.
 */

const grid = { x: 0, y: 0, width: 672, height: 504 }; // 48 x 36 squares of 14

describe('a box that matches the drawing', () => {
  it('maps corner to corner', () => {
    const box = { left: 0, top: 0, width: 672, height: 504 };
    expect(toUserSpace(box, grid, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(toUserSpace(box, grid, 672, 504)).toEqual({ x: 672, y: 504 });
  });

  it('scales evenly when the box is smaller but the same shape', () => {
    const box = { left: 0, top: 0, width: 336, height: 252 };
    expect(toUserSpace(box, grid, 336, 252)).toEqual({ x: 672, y: 504 });
  });

  it("takes the box's own offset into account", () => {
    const box = { left: 100, top: 40, width: 672, height: 504 };
    expect(toUserSpace(box, grid, 100, 40)).toEqual({ x: 0, y: 0 });
  });
});

describe('a box wider than the drawing', () => {
  /*
    The case that was broken. 640 x 360 against a 4:3 grid: the drawing is
    scaled to the height, 480 wide, leaving 80px bars either side.
  */
  const box = { left: 0, top: 0, width: 640, height: 360 };

  it("finds the drawing's left edge past the bar, not at the box edge", () => {
    expect(toUserSpace(box, grid, 80, 0)).toEqual({ x: 0, y: 0 });
  });

  it("finds its right edge, which is where the old maths was six squares out", () => {
    expect(toUserSpace(box, grid, 560, 360)).toEqual({ x: 672, y: 504 });
    // What dividing straight through the box used to give at the same point.
    expect((560 / 640) * 672).toBeCloseTo(588);
  });

  it('reports the bars as outside the drawing rather than clamping', () => {
    // The caller decides what a click on the bar means; both maps reject an
    // out-of-range square, which is the right answer and not this function's.
    expect(toUserSpace(box, grid, 0, 180)!.x).toBeLessThan(0);
    expect(toUserSpace(box, grid, 640, 180)!.x).toBeGreaterThan(672);
  });
});

describe('a box taller than the drawing', () => {
  // 480 x 480: scaled to the width, 360 tall, 60px bars top and bottom.
  const box = { left: 0, top: 0, width: 480, height: 480 };

  it('splits the leftover evenly, top and bottom', () => {
    expect(toUserSpace(box, grid, 0, 60)).toEqual({ x: 0, y: 0 });
    expect(toUserSpace(box, grid, 480, 420)).toEqual({ x: 672, y: 504 });
  });
});

describe('a viewBox that does not start at the origin', () => {
  /*
    The isometric map's does not: it reserves headroom above the drawing for
    tall terrain, so its origin is `(0, -pad)`. Both axes are exercised here
    anyway - the helper should not care which one is offset.
  */
  const iso = { x: -300, y: -40, width: 600, height: 400 };

  it('maps the top-left of the box to the viewBox origin', () => {
    const box = { left: 0, top: 0, width: 600, height: 400 };
    expect(toUserSpace(box, iso, 0, 0)).toEqual({ x: -300, y: -40 });
    expect(toUserSpace(box, iso, 600, 400)).toEqual({ x: 300, y: 360 });
  });
});

describe('nothing to divide by', () => {
  it.each([undefined, { left: 0, top: 0, width: 0, height: 100 }, { left: 0, top: 0, width: 100, height: 0 }])(
    'returns null rather than infinity (%#)',
    (box) => {
      expect(toUserSpace(box, grid, 10, 10)).toBeNull();
    },
  );
});
