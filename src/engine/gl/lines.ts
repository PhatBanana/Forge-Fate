import type { Square } from '../../encounter';
import { HH, HW, ZH } from '../iso';
import type { IsoProjection } from '../iso';
import type { Palette } from './palette';
import type { Rgba } from './types';

/**
 * Everything drawn as a stroke: sight lines, the ruler, the throw arc and
 * its impact ring.
 *
 * `gl.LINES` vertices - pairs of endpoints - in a slim format of their own:
 * `[x, y, r, g, b, a]` per vertex, no depth and no UV, because every one of
 * these draws in the over-everything pass where depth is off and nothing is
 * textured. At the 240p virtual resolution a 1-device-pixel line lands as one
 * chunky virtual pixel, which is exactly the line weight the aesthetic wants,
 * so there is no thick-quad expansion here.
 */

export const LINE_FLOATS = 6;

const push = (out: number[], x: number, y: number, color: Rgba) =>
  out.push(x, y, color[0], color[1], color[2], color[3]);

const segment = (
  out: number[],
  a: { x: number; y: number },
  b: { x: number; y: number },
  color: Rgba,
) => {
  push(out, a.x, a.y, color);
  push(out, b.x, b.y, color);
};

export function sightLines(
  sight: { from: Square; to: Square; visible: boolean }[],
  proj: IsoProjection,
  palette: Palette,
): Float32Array {
  const out: number[] = [];
  for (const line of sight) {
    segment(
      out,
      proj.centreOf(line.from),
      proj.centreOf(line.to),
      line.visible ? palette.sight : palette.sightBlocked,
    );
  }
  return new Float32Array(out);
}

/**
 * §88's telegraphs: the same centre-to-centre segments the SVG maps draw,
 * with the walk in the dimmer ink. `gl.LINES` has no dash, so where the SVG
 * dashes the walk this dims it - the grammar survives the medium.
 */
export function intentLines(
  intents: { from: Square; to: Square; walk?: boolean }[],
  proj: IsoProjection,
  palette: Palette,
): Float32Array {
  const out: number[] = [];
  for (const seg of intents) {
    segment(
      out,
      proj.centreOf(seg.from),
      proj.centreOf(seg.to),
      seg.walk ? palette.intentWalk : palette.intentStrike,
    );
  }
  return new Float32Array(out);
}

export function rulerLine(
  ruler: { points: Square[] } | null,
  proj: IsoProjection,
  palette: Palette,
): Float32Array {
  const out: number[] = [];
  if (ruler && ruler.points.length > 1) {
    for (let i = 1; i < ruler.points.length; i++) {
      segment(out, proj.centreOf(ruler.points[i - 1]), proj.centreOf(ruler.points[i]), palette.ruler);
    }
  }
  return new Float32Array(out);
}

/** How many straight pieces stand in for the arc's curve. */
export const ARC_SEGMENTS = 24;
export const IMPACT_SEGMENTS = 16;

/**
 * The throw arc: the same quadratic Bézier the SVG draws, tessellated, plus
 * an ellipse of line segments where it lands. The control point's lift is
 * `IsoMap`'s own formula, kept verbatim so both views loft a flask the same.
 */
export function arcLines(
  arc: { from: Square; to: Square } | null,
  proj: IsoProjection,
  palette: Palette,
): Float32Array {
  const out: number[] = [];
  if (arc && (arc.from.x !== arc.to.x || arc.from.y !== arc.to.y)) {
    const a = proj.centreOf(arc.from);
    const b = proj.centreOf(arc.to);
    const lift = Math.min(4 * ZH + HH * 4, Math.hypot(b.x - a.x, b.y - a.y) / 3 + HH);
    const control = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - lift };
    const at = (t: number) => ({
      x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * control.x + t * t * b.x,
      y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * control.y + t * t * b.y,
    });
    for (let i = 0; i < ARC_SEGMENTS; i++) {
      segment(out, at(i / ARC_SEGMENTS), at((i + 1) / ARC_SEGMENTS), palette.arc);
    }
    // The impact: the SVG's ellipse (rx = HW·0.55, ry = HH·0.55) as a ring.
    for (let i = 0; i < IMPACT_SEGMENTS; i++) {
      const t0 = (i / IMPACT_SEGMENTS) * Math.PI * 2;
      const t1 = ((i + 1) / IMPACT_SEGMENTS) * Math.PI * 2;
      segment(
        out,
        { x: b.x + Math.cos(t0) * HW * 0.55, y: b.y + Math.sin(t0) * HH * 0.55 },
        { x: b.x + Math.cos(t1) * HW * 0.55, y: b.y + Math.sin(t1) * HH * 0.55 },
        palette.arc,
      );
    }
  }
  return new Float32Array(out);
}
