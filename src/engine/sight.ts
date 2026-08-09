import type { Square } from '../encounter';
import type { Dungeon } from './dungeon';
import { corridorSquares } from './dungeon';
import { TERRAIN_BY_KIND, keyOf } from '../terrain';
import type { ElevationMap, TerrainMap } from '../terrain';

/**
 * Line of sight, on the grid, with height.
 *
 * ## What blocks
 *
 * Three things, in one model:
 *
 * 1. **The dungeon itself.** On a generated map, anywhere that is not room,
 *    corridor or painted floor is solid rock - that is what the drawing means,
 *    and sight never crosses it. A blank grid is open ground.
 * 2. **Painted terrain** whose kind blocks sight: walls (infinite), pillars,
 *    rocks and trees (one step above their ground).
 * 3. **The ground itself**, where Z says so: a ridge at +1 stands between two
 *    people on the flat.
 *
 * ## The height model, stated plainly
 *
 * An approximation, chosen to behave sensibly rather than to simulate: eyes
 * are half a step above the ground stood on, the sight line runs straight
 * between the two pairs of eyes, and a square cuts it when that square's top
 * rises to meet the line above it. Strictly above - grazing passes.
 *
 * What that buys, concretely: a ridge blocks two people on the flat; an archer
 * one step up shoots *over* the rock in the middle of the field; the same rock
 * still hides somebody crouched right behind it, because there the line has
 * come down to head height. Which is the behaviour a DM would rule at the
 * table, arrived at with one linear interpolation.
 *
 * ## Cover
 *
 * When the line is clear but passes a blocking square adjacent to the target
 * on the attacker's side, that is cover as the SRD means it. **One** such
 * square is half cover (+2 AC); **two** - the target tucked into a corner,
 * blocked on both of the axes the attack is coming down - is three-quarters
 * cover (+5), which had no model at all until §42. Total cover is not a
 * degree of cover here: it is simply no line of sight, which `visible`
 * already answers.
 *
 * Reported alongside the sight rather than folded into a number, because
 * whether that pillar counts is famously a ruling and the DM is the one
 * making it.
 */

export interface SightContext {
  dungeon: Dungeon;
  terrain: TerrainMap;
  elevation: ElevationMap;
}

/** How much of the target is behind something. Total cover is `visible: false`. */
export type Cover = 'none' | 'half' | 'three-quarters';

/** What each degree is worth to armor class, in the SRD's own numbers. */
export const COVER_AC: Record<Cover, number> = {
  none: 0,
  half: 2,
  'three-quarters': 5,
};

export interface SightResult {
  visible: boolean;
  /** The square that cut the line, when one did. */
  blockedBy?: Square;
  /**
   * Blocking squares beside the target on the attacker's side: one is half
   * cover, two is three-quarters.
   *
   * Was a boolean until §42, which is why the name reads like one. Widened
   * rather than joined by a second field, because two fields describing one
   * fact is one of them waiting to go stale.
   */
  cover: Cover;
}

/** Eyes are half a step above the ground stood on. */
const EYE = 0.5;

const groundAt = (ctx: SightContext, at: Square): number =>
  ctx.elevation[keyOf(at)] ?? 0;

/**
 * Open ground on a generated map is room, corridor or painted floor; the rest
 * is rock. A blank grid - no rooms - is all open, because there is nothing
 * drawn to be inside of.
 */
export function walkable(ctx: SightContext, at: Square): boolean {
  // The map's edge is the map's edge on every kind of map. Before this
  // check, a blank map was open in every direction without end - and the
  // uncapped walk the ruler runs on would explore it forever, freezing the
  // whole screen the moment a token was selected on a zero-room arena.
  if (at.x < 0 || at.y < 0 || at.x >= ctx.dungeon.width || at.y >= ctx.dungeon.height) {
    return false;
  }
  if (ctx.dungeon.rooms.length === 0) return true;
  if (ctx.terrain[keyOf(at)] === 'floor') return true;
  if (
    ctx.dungeon.rooms.some(
      (r) => at.x >= r.x && at.x < r.x + r.w && at.y >= r.y && at.y < r.y + r.h,
    )
  ) {
    return true;
  }
  return ctx.dungeon.corridors.some((c) =>
    corridorSquares(c).some((s) => s.x === at.x && s.y === at.y),
  );
}

/** How high a square reaches: its ground, plus what stands on it. */
function topOf(ctx: SightContext, at: Square): number {
  if (!walkable(ctx, at)) return Infinity;
  const kind = ctx.terrain[keyOf(at)];
  if (kind === 'wall') return Infinity;
  const stands = kind && TERRAIN_BY_KIND[kind].blocksSight ? 1 : 0;
  return groundAt(ctx, at) + stands;
}

/**
 * The squares a segment crosses between two centres, endpoints excluded, each
 * with how far along the line it sits.
 *
 * Sampled rather than Bresenham'd, at four points a square: the corner cases
 * of grid walking - does a diagonal squeeze between two pillars - become
 * "does the line actually pass through the square", which is the question a
 * ruler on a battle mat answers.
 */
export function lineSquares(from: Square, to: Square): { at: Square; t: number }[] {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) * 4;
  if (steps === 0) return [];
  const seen = new Map<string, { at: Square; t: number }>();
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = Math.round(from.x + (to.x - from.x) * t);
    const y = Math.round(from.y + (to.y - from.y) * t);
    if ((x === from.x && y === from.y) || (x === to.x && y === to.y)) continue;
    const key = `${x},${y}`;
    // Keep the first crossing: the earliest t is where the line met the square.
    if (!seen.has(key)) seen.set(key, { at: { x, y }, t });
  }
  return [...seen.values()];
}

export function lineOfSight(ctx: SightContext, from: Square, to: Square): SightResult {
  const eyeFrom = groundAt(ctx, from) + EYE;
  const eyeTo = groundAt(ctx, to) + EYE;

  for (const { at, t } of lineSquares(from, to)) {
    const top = topOf(ctx, at);
    if (top === Infinity) return { visible: false, blockedBy: at, cover: 'none' };
    const lineHeight = eyeFrom + (eyeTo - eyeFrom) * t;
    // Strictly above: grazing the top of a ridge passes. This is what lets an
    // archer a step up clear the mid-field rock while the same rock still
    // hides whoever is crouched directly behind it.
    if (top > lineHeight) return { visible: false, blockedBy: at, cover: 'none' };
  }

  return { visible: true, cover: coverFor(ctx, from, to) };
}

/**
 * How much of the target is behind something.
 *
 * A sight-blocking square orthogonally beside the target, on the side the
 * attack comes from. The dot product is the whole test - "on the attacker's
 * side" means the step from target to cover points the same way as the line
 * back toward the attacker.
 *
 * **Counted rather than merely spotted**, which is the §42 change. On a grid
 * there are at most two such sides - the two axes the attack comes down - so
 * one blocker is a pillar to lean out past (half, +2) and two is a corner the
 * target is tucked into, shot at diagonally with masonry on both approaches.
 * That is three-quarters cover (+5), which the SRD prices for exactly this
 * and which this app has been quietly rounding down to +2 since §12.4.
 */
function coverFor(ctx: SightContext, from: Square, to: Square): Cover {
  const toward = { x: from.x - to.x, y: from.y - to.y };
  const sides = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
  const blocking = sides.filter((side) => {
    const at = { x: to.x + side.x, y: to.y + side.y };
    if (at.x === from.x && at.y === from.y) return false;
    const top = topOf(ctx, at);
    // Cover has to actually rise above the target's own ground.
    if (!(top > groundAt(ctx, to))) return false;
    return side.x * toward.x + side.y * toward.y > 0;
  }).length;
  if (blocking >= 2) return 'three-quarters';
  return blocking === 1 ? 'half' : 'none';
}
