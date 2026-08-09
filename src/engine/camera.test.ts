import { describe, expect, it } from 'vitest';
import {
  MAX_SCALE,
  WHOLE_MAP,
  centreOn,
  clampCamera,
  dragBy,
  isVisible,
  panBy,
  viewBoxFor,
  zoomAt,
} from './camera';
import type { Camera, Frame } from './camera';
import { toUserSpace } from './letterbox';

/**
 * The camera's arithmetic, away from React.
 *
 * The first block is the one that matters most: about forty component tests
 * stub a map's bounding box and compute clicks as raw client coordinates
 * against an un-panned, un-zoomed map. They keep passing only because the
 * default camera changes the viewBox by exactly nothing, so that is asserted
 * here rather than assumed.
 */

// The flat map: 48 x 36 squares of 14, origin at zero.
const flat: Frame = { x0: 0, y0: 0, w: 672, h: 504 };
// The isometric map reserves headroom above the drawing for tall terrain, so
// its origin is negative on y. Rotating it changes every one of these numbers.
const iso: Frame = { x0: 0, y0: -40, w: 600, h: 400 };

describe('scale 1 is the identity', () => {
  it('gives the flat map back its own frame', () => {
    expect(viewBoxFor(WHOLE_MAP, flat)).toEqual({ x: 0, y: 0, width: 672, height: 504 });
  });

  it("gives the isometric map back its negative origin", () => {
    expect(viewBoxFor(WHOLE_MAP, iso)).toEqual({ x: 0, y: -40, width: 600, height: 400 });
  });

  it('ignores where the centre was, because the clamp has nowhere to go', () => {
    // A camera left somewhere odd, then zoomed all the way out: the window is
    // the whole drawing, so there is exactly one rectangle it can be.
    for (const cx of [0, 0.25, 1]) {
      for (const cy of [0, 0.75, 1]) {
        expect(viewBoxFor({ cx, cy, scale: 1 }, flat)).toEqual({ x: 0, y: 0, width: 672, height: 504 });
      }
    }
  });

  it('resolves a click the same way the map did before the camera existed', () => {
    // The shape of the forty tests: a stubbed box, and a click computed from
    // the grid. Square (12, 9) of a 14-unit grid, in a box at half size.
    const box = { left: 0, top: 0, width: 336, height: 252 };
    const at = toUserSpace(box, viewBoxFor(WHOLE_MAP, flat), (12 + 0.5) * 7, (9 + 0.5) * 7);
    expect(Math.floor(at!.x / 14)).toBe(12);
    expect(Math.floor(at!.y / 14)).toBe(9);
  });
});

describe('clamping', () => {
  it('holds the scale between fit and the maximum', () => {
    expect(clampCamera({ cx: 0.5, cy: 0.5, scale: 0.1 }).scale).toBe(1);
    expect(clampCamera({ cx: 0.5, cy: 0.5, scale: 99 }).scale).toBe(MAX_SCALE);
  });

  it('holds the centre inside the drawing', () => {
    expect(clampCamera({ cx: -3, cy: 4, scale: 2 })).toEqual({ cx: 0, cy: 1, scale: 2 });
  });

  it('never shows anything outside the drawing, at any scale', () => {
    // The corners are where a naive centre-minus-half runs off the board.
    for (const frame of [flat, iso]) {
      for (const scale of [1, 1.5, 2, 3, MAX_SCALE]) {
        for (const cx of [0, 0.5, 1]) {
          for (const cy of [0, 0.5, 1]) {
            const view = viewBoxFor({ cx, cy, scale }, frame);
            expect(view.x).toBeGreaterThanOrEqual(frame.x0);
            expect(view.y).toBeGreaterThanOrEqual(frame.y0);
            expect(view.x + view.width).toBeLessThanOrEqual(frame.x0 + frame.w + 1e-9);
            expect(view.y + view.height).toBeLessThanOrEqual(frame.y0 + frame.h + 1e-9);
          }
        }
      }
    }
  });

  it('keeps the aspect ratio, which is what the container-query fit sizes from', () => {
    // Both axes divide by the same scale, so the window is always the shape of
    // the drawing and the letterbox term stays zero.
    for (const scale of [1, 2, MAX_SCALE]) {
      const view = viewBoxFor({ cx: 0.3, cy: 0.8, scale }, flat);
      expect(view.width / view.height).toBeCloseTo(flat.w / flat.h, 10);
    }
  });

  it('stops a pan at the edge instead of running off the board', () => {
    const east = panBy(panBy(panBy({ cx: 0.5, cy: 0.5, scale: 2 }, 0.5, 0), 0.5, 0), 0.5, 0);
    expect(east.cx).toBe(1);
    const view = viewBoxFor(east, flat);
    expect(view.x + view.width).toBeCloseTo(flat.w, 10);
  });
});

describe('panning', () => {
  it('walks the same proportion of the screen at every zoom', () => {
    // A fraction of the visible window, not a fixed distance: the point is
    // that one key press moves the view by the same *visible* amount whether
    // you are zoomed in or out.
    const near = viewBoxFor(panBy({ cx: 0.5, cy: 0.5, scale: 2 }, 0.15, 0), flat);
    const far = viewBoxFor(panBy({ cx: 0.5, cy: 0.5, scale: 4 }, 0.15, 0), flat);
    expect((near.x - viewBoxFor({ cx: 0.5, cy: 0.5, scale: 2 }, flat).x) / near.width).toBeCloseTo(
      (far.x - viewBoxFor({ cx: 0.5, cy: 0.5, scale: 4 }, flat).x) / far.width,
      10,
    );
  });

  it('does nothing visible at scale 1, because there is nowhere to go', () => {
    expect(viewBoxFor(panBy(WHOLE_MAP, 0.4, -0.4), flat)).toEqual(viewBoxFor(WHOLE_MAP, flat));
  });
});

describe('zoom keeps the anchor under the cursor', () => {
  /*
    The whole feel of a wheel zoom. The square you are pointing at should be
    the square you zoom into - not the middle of the screen drifting towards
    you. Stated as: the user-space point beneath a given client point is the
    same before and after.
  */
  const box = { left: 0, top: 0, width: 672, height: 504 };

  const under = (camera: Camera, frame: Frame, cx: number, cy: number) =>
    toUserSpace(box, viewBoxFor(camera, frame), cx, cy)!;

  it.each([
    ['the middle', 336, 252],
    ['off centre', 200, 150],
    ['near a corner', 640, 20],
    ['near the opposite corner', 40, 460],
  ])('holds the point %s still while zooming in', (_where, clientX, clientY) => {
    const before = under(WHOLE_MAP, flat, clientX, clientY);
    const after = under(zoomAt(WHOLE_MAP, flat, box, clientX, clientY, 1.6), flat, clientX, clientY);
    // Exactly, not approximately: holding the anchor is the whole point, and
    // zooming out of the fitted view never needs the clamp to intervene.
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('holds it exactly from an already-zoomed camera too', () => {
    const from: Camera = { cx: 0.4, cy: 0.6, scale: 2 };
    const before = under(from, flat, 500, 120);
    const after = under(zoomAt(from, flat, box, 500, 120, 1.5), flat, 500, 120);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('holds the anchor at the very corner, because zooming in never needs the clamp', () => {
    /*
      Worth stating, because it is not obvious. The anchor is by definition
      inside the current window, and zooming *in* only shrinks that window
      around it - so the new view can never reach past an edge the old one was
      already inside. The clamp is dead code on the way in.
    */
    const from: Camera = { cx: 1, cy: 1, scale: 2 };
    const before = under(from, flat, 672, 504);
    const after = under(zoomAt(from, flat, box, 672, 504, 2), flat, 672, 504);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('gives up the anchor rather than the board, zooming out at an edge', () => {
    /*
      Where the clamp does earn its place. Zoomed into the far corner and
      pulling back, holding the anchor under the cursor would mean showing
      blank space past the edge of the map. It would rather show the board -
      the cursor drifts, which is the lesser of the two.
    */
    const from: Camera = { cx: 1, cy: 1, scale: MAX_SCALE };
    const view = viewBoxFor(zoomAt(from, flat, box, 0, 0, 0.5), flat);
    expect(view.width).toBeCloseTo(flat.w / 2, 6);
    expect(view.x + view.width).toBeCloseTo(flat.w, 6);
    expect(view.y + view.height).toBeCloseTo(flat.h, 6);
  });

  it('works on the isometric frame too, negative origin and all', () => {
    const isoBox = { left: 0, top: 0, width: 600, height: 400 };
    const from: Camera = { cx: 0.5, cy: 0.5, scale: 2 };
    const before = toUserSpace(isoBox, viewBoxFor(from, iso), 300, 200)!;
    const zoomed = zoomAt(from, iso, isoBox, 300, 200, 1.5);
    const after = toUserSpace(isoBox, viewBoxFor(zoomed, iso), 300, 200)!;
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('stops at the limits rather than creeping sideways against the stop', () => {
    // A wheel spun past the end should do nothing at all, not slide the view.
    const out = zoomAt(WHOLE_MAP, flat, box, 100, 100, 0.5);
    expect(out).toEqual(WHOLE_MAP);
    const inn: Camera = { cx: 0.5, cy: 0.5, scale: MAX_SCALE };
    expect(zoomAt(inn, flat, box, 100, 100, 2)).toEqual(inn);
  });

  it('still changes scale when there is no box to anchor against', () => {
    // Before the first layout there is no rect; zooming should still work,
    // just from the centre.
    expect(zoomAt(WHOLE_MAP, flat, undefined, 0, 0, 2).scale).toBe(2);
  });
});

describe('a normalised centre survives a frame change', () => {
  /*
    Why the camera is stored as a fraction rather than a coordinate. Switching
    between the flat and isometric views, or turning the isometric one a
    quarter, changes the frame's width, height and origin together. The middle
    of the board should stay the middle of the board through all of it.
  */
  const rotated: Frame = { x0: 0, y0: -60, w: 400, h: 600 };

  it.each([
    ['flat', flat],
    ['isometric', iso],
    ['isometric, rotated', rotated],
  ])('centres on the middle of the %s frame', (_name, frame) => {
    const view = viewBoxFor({ cx: 0.5, cy: 0.5, scale: 2 }, frame);
    expect(view.x + view.width / 2).toBeCloseTo(frame.x0 + frame.w / 2, 10);
    expect(view.y + view.height / 2).toBeCloseTo(frame.y0 + frame.h / 2, 10);
  });

  it('keeps a quarter-along camera a quarter along, whatever the frame', () => {
    for (const frame of [flat, iso, rotated]) {
      const view = viewBoxFor({ cx: 0.25, cy: 0.25, scale: 2 }, frame);
      expect((view.x + view.width / 2 - frame.x0) / frame.w).toBeCloseTo(0.25, 10);
    }
  });
});

describe('centreOn and isVisible', () => {
  it('round-trip: what you centre on is what you can see', () => {
    for (const frame of [flat, iso]) {
      for (const at of [
        { x: frame.x0 + 10, y: frame.y0 + 10 },
        { x: frame.x0 + frame.w / 2, y: frame.y0 + frame.h / 2 },
        { x: frame.x0 + frame.w - 10, y: frame.y0 + frame.h - 10 },
      ]) {
        expect(isVisible(centreOn({ cx: 0, cy: 0, scale: MAX_SCALE }, frame, at), frame, at)).toBe(true);
      }
    }
  });

  it('reports the far corner as out of view when zoomed into the near one', () => {
    const camera = centreOn({ cx: 0, cy: 0, scale: 4 }, flat, { x: 20, y: 20 });
    expect(isVisible(camera, flat, { x: 20, y: 20 })).toBe(true);
    expect(isVisible(camera, flat, { x: 660, y: 490 })).toBe(false);
  });

  it('sees everything at scale 1, which is what stops follow-the-turn twitching', () => {
    // Zoomed out, nothing is ever off screen, so the camera never moves on its
    // own during a fight.
    expect(isVisible(WHOLE_MAP, flat, { x: 0, y: 0 })).toBe(true);
    expect(isVisible(WHOLE_MAP, flat, { x: 672, y: 504 })).toBe(true);
    expect(isVisible(WHOLE_MAP, iso, { x: 0, y: -40 })).toBe(true);
  });

  it('leaves the scale alone - centring is not zooming', () => {
    expect(centreOn({ cx: 0, cy: 0, scale: 2.5 }, flat, { x: 100, y: 100 }).scale).toBe(2.5);
  });
});

describe('dragging', () => {
  const box = { left: 0, top: 0, width: 672, height: 504 };

  it('moves the map with the pointer, so the ground stays under your finger', () => {
    // Pull right: the view walks left, and the drawing appears to follow.
    const from: Camera = { cx: 0.5, cy: 0.5, scale: 2 };
    const dragged = dragBy(from, flat, box, 100, 0);
    expect(dragged.cx).toBeLessThan(from.cx);
    const before = viewBoxFor(from, flat);
    const after = viewBoxFor(dragged, flat);
    // One client pixel is half a user unit at scale 2 in a full-size box.
    expect(before.x - after.x).toBeCloseTo(50, 6);
  });

  it('tracks the pointer one-for-one on screen at every zoom', () => {
    for (const scale of [1.5, 2, MAX_SCALE]) {
      const from: Camera = { cx: 0.5, cy: 0.5, scale };
      const shift = viewBoxFor(from, flat).x - viewBoxFor(dragBy(from, flat, box, 60, 0), flat).x;
      // Converted back to client pixels it is the distance dragged, whatever
      // the zoom - that is what makes a drag feel attached to the pointer.
      expect((shift * box.width) / viewBoxFor(from, flat).width).toBeCloseTo(60, 6);
    }
  });

  it('does nothing at scale 1, and nothing without a box', () => {
    expect(viewBoxFor(dragBy(WHOLE_MAP, flat, box, 200, 200), flat)).toEqual(viewBoxFor(WHOLE_MAP, flat));
    expect(dragBy({ cx: 0.3, cy: 0.4, scale: 2 }, flat, undefined, 50, 50)).toEqual({
      cx: 0.3,
      cy: 0.4,
      scale: 2,
    });
  });
});
