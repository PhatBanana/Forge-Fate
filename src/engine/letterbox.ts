/**
 * Where a click landed inside an SVG that letterboxes.
 *
 * An `<svg>` with a `viewBox` and no `preserveAspectRatio` scales its drawing
 * to *fit* its element box and centres what is left over - `xMidYMid meet`,
 * the default. So whenever the box and the viewBox disagree about aspect
 * ratio, the drawing does **not** fill its own element, and bars appear on two
 * sides.
 *
 * Both maps used to map a click by dividing straight through the element's
 * box, which is only correct while those two agree. §31.3 made them disagree:
 * it styled the battle map `height: 100%` to fill the stage, and on a
 * 988x662 stage against a 672x504 grid that left 52px bars either side. A
 * click at the drawing's right edge resolved six squares out. Token clicks
 * were unaffected - a token is its own element with its own correct box -
 * which is why every browser probe missed it for a whole section.
 *
 * The fix lives here rather than in the CSS because **this is the layer that
 * can be wrong**. A stylesheet can be changed by anybody at any time; the
 * maths should not care what it says. The battle screen also styles the map to
 * keep its aspect now, so in practice there is no letterbox at all - and this
 * function returns the same answer either way, which is the point.
 */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ViewBox {
  /** Origin in user units - IsoMap's y is negative, for headroom. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A client point in the SVG's own user units, or null when the box has no
 * size to divide by.
 *
 * Points inside the letterbox bars come back as user coordinates *outside* the
 * viewBox, which is the honest answer: the caller decides whether that counts
 * as a miss, and both maps already reject out-of-range squares.
 */
export function toUserSpace(
  box: Box | undefined,
  view: ViewBox,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  if (!box || !box.width || !box.height) return null;

  // `meet`: the drawing is scaled by whichever axis runs out first.
  const scale = Math.min(box.width / view.width, box.height / view.height);
  if (!scale) return null;

  // `xMidYMid`: whatever is left over is split evenly between the two sides.
  const originX = box.left + (box.width - view.width * scale) / 2;
  const originY = box.top + (box.height - view.height * scale) / 2;

  return {
    x: view.x + (clientX - originX) / scale,
    y: view.y + (clientY - originY) / scale,
  };
}
