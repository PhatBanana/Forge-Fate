import { toUserSpace } from './letterbox';
import type { Box, ViewBox } from './letterbox';

/**
 * Where the battle map is looking.
 *
 * §32 turned the battle screen into one full-bleed stage and deferred this on
 * purpose: pan and zoom rewrite the pointer's inverse in *both* maps at once,
 * and getting that wrong puts tokens in the wrong square - the bug §32.1 had
 * just finished fixing.
 *
 * ## The camera is the viewBox, not a transform
 *
 * This is the load-bearing decision. Both maps map a click through
 * `getBoundingClientRect()` of the `<svg>` itself, which reports the element's
 * *untransformed* box. A CSS transform would move the drawing on screen and
 * leave that box saying the drawing had not moved, so every click would land
 * somewhere else and nothing would say so.
 *
 * Expressed in the viewBox instead, `toUserSpace` needs no change at all - it
 * already takes an arbitrary `ViewBox`, because IsoMap's origin was never
 * zero. The camera is simply the viewBox becoming state.
 *
 * ## Stored normalised, and why
 *
 * `{cx, cy}` is the *centre* of the view as a fraction of the drawing, not a
 * corner in user units. The two maps have entirely different coordinate
 * systems - the flat one is grid pixels, the isometric one is a diamond
 * projection with a negative origin - and rotating the isometric camera
 * changes its width, height, `minX` and `pad` together. A fraction survives
 * all of that: the middle of the board stays the middle of the board through
 * a view switch and a quarter turn, where a coordinate would land somewhere
 * arbitrary.
 *
 * ## The invariant that protects forty tests
 *
 * **At `scale: 1` the viewBox is exactly the frame.** `vw` equals `w`, the
 * clamp range collapses to a single point, and the result is `0 0 w h` for the
 * flat map and `0 -pad w h` for the isometric one - byte for byte what they
 * rendered before this file existed.
 *
 * That matters beyond tidiness: about forty tests stub the map's bounding box
 * and compute clicks as raw client coordinates against it. They are testing
 * the un-panned, un-zoomed map, and they keep passing because the default
 * camera changes nothing. `camera.test.ts` asserts the identity for both
 * frames rather than leaving it to be noticed.
 */

/** How far in the camera can go. Eight squares across a 48-wide map. */
export const MAX_SCALE = 4;

export interface Camera {
  /** View centre across the drawing, 0 (left) to 1 (right). */
  cx: number;
  /** View centre down the drawing, 0 (top) to 1 (bottom). */
  cy: number;
  /** 1 is the whole map. Above that is closer. Never below. */
  scale: number;
}

/**
 * The whole drawing, in its own units - what the camera moves around inside.
 *
 * The flat map's is `{0, 0, w, h}`; the isometric map's y origin is `-pad`,
 * the headroom it reserves above the drawing for tall terrain.
 */
export interface Frame {
  x0: number;
  y0: number;
  w: number;
  h: number;
}

export const WHOLE_MAP: Camera = { cx: 0.5, cy: 0.5, scale: 1 };

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/** A camera with its scale in range and its centre inside the drawing. */
export function clampCamera(camera: Camera): Camera {
  return {
    cx: clamp(camera.cx, 0, 1),
    cy: clamp(camera.cy, 0, 1),
    scale: clamp(camera.scale, 1, MAX_SCALE),
  };
}

/**
 * The rectangle of the drawing this camera can see.
 *
 * Clamped so the view never runs off the board: at any scale the window is
 * pushed back inside the frame rather than showing blank space beside the map.
 * At scale 1 the window *is* the frame and the clamp has nothing to do, which
 * is the identity above.
 */
export function viewBoxFor(camera: Camera, frame: Frame): ViewBox {
  const { cx, cy, scale } = clampCamera(camera);
  const width = frame.w / scale;
  const height = frame.h / scale;
  return {
    x: clamp(frame.x0 + cx * frame.w - width / 2, frame.x0, frame.x0 + frame.w - width),
    y: clamp(frame.y0 + cy * frame.h - height / 2, frame.y0, frame.y0 + frame.h - height),
    width,
    height,
  };
}

/** The camera centred on a point in the drawing's own units. */
export function centreOn(camera: Camera, frame: Frame, at: { x: number; y: number }): Camera {
  return clampCamera({
    ...camera,
    cx: frame.w ? (at.x - frame.x0) / frame.w : 0.5,
    cy: frame.h ? (at.y - frame.y0) / frame.h : 0.5,
  });
}

/** Whether a point in the drawing's units is inside what the camera sees. */
export function isVisible(camera: Camera, frame: Frame, at: { x: number; y: number }): boolean {
  const view = viewBoxFor(camera, frame);
  return (
    at.x >= view.x &&
    at.x <= view.x + view.width &&
    at.y >= view.y &&
    at.y <= view.y + view.height
  );
}

/**
 * The camera moved by a fraction of what it can currently see.
 *
 * A fraction rather than a distance, so one press of a key walks the same
 * *proportion* of the screen at every zoom level - a fixed number of user
 * units would crawl when zoomed out and leap when zoomed in.
 */
export function panBy(camera: Camera, fx: number, fy: number): Camera {
  const { scale } = clampCamera(camera);
  return clampCamera({
    ...camera,
    cx: camera.cx + fx / scale,
    cy: camera.cy + fy / scale,
  });
}

/**
 * Zoom, keeping one point of the drawing under one point of the screen.
 *
 * This is the whole feel of a wheel zoom: the square you are pointing at is
 * the square you zoom into, rather than the middle of the screen drifting
 * towards you. Done by finding the user-space point under the cursor before
 * the zoom, then choosing the centre that puts it back under the same cursor
 * afterwards.
 *
 * Returns the camera unchanged when the box has no size to divide by, or when
 * the scale was already at its limit - so a wheel spun against the stop does
 * not creep the view sideways.
 */
export function zoomAt(
  camera: Camera,
  frame: Frame,
  box: Box | undefined,
  clientX: number,
  clientY: number,
  factor: number,
): Camera {
  const from = clampCamera(camera);
  const scale = clamp(from.scale * factor, 1, MAX_SCALE);
  if (scale === from.scale) return from;

  const before = viewBoxFor(from, frame);
  const anchor = toUserSpace(box, before, clientX, clientY);
  if (!anchor) return { ...from, scale };

  /*
    Where the anchor sits inside the visible window, as a fraction. Held
    across the zoom: the new window is a different size but the anchor is the
    same fraction along it, which is what keeps it under the cursor.

    Zooming *in* this can never hit the clamp - the anchor is already inside
    the window and the window only shrinks around it. Zooming out it can, and
    then the clamp wins: better a drifting cursor than blank space beside the
    board.
  */
  const fx = before.width ? (anchor.x - before.x) / before.width : 0.5;
  const fy = before.height ? (anchor.y - before.y) / before.height : 0.5;

  const width = frame.w / scale;
  const height = frame.h / scale;
  const x = anchor.x - fx * width;
  const y = anchor.y - fy * height;

  return clampCamera({
    cx: frame.w ? (x + width / 2 - frame.x0) / frame.w : 0.5,
    cy: frame.h ? (y + height / 2 - frame.y0) / frame.h : 0.5,
    scale,
  });
}

/**
 * The camera dragged by a screen distance.
 *
 * The drag moves the *map*, not the camera, so the two are opposite: pulling
 * the pointer right walks the view left, and the ground stays under your
 * finger. `box` converts pixels to the fraction of the drawing they cover,
 * which is what makes a drag track the pointer at every zoom level.
 */
export function dragBy(
  camera: Camera,
  frame: Frame,
  box: Box | undefined,
  dxClient: number,
  dyClient: number,
): Camera {
  if (!box || !box.width || !box.height) return clampCamera(camera);
  const view = viewBoxFor(camera, frame);
  // The same `meet` scale `toUserSpace` uses: the drawing is fitted to its
  // element, so one client pixel is this many user units.
  const perPixel = 1 / Math.min(box.width / view.width, box.height / view.height);
  return clampCamera({
    ...camera,
    cx: camera.cx - (dxClient * perPixel) / (frame.w || 1),
    cy: camera.cy - (dyClient * perPixel) / (frame.h || 1),
  });
}
