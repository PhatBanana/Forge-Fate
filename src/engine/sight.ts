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
 * on the attacker's side, that is cover as the SRD means it: half cover, +2 to
 * armor class. Reported as a note for the DM to apply, not an automatic
 * modifier - whether that pillar counts is famously a ruling.
 */

export interface SightContext {
  dungeon: Dungeon;
  terrain: TerrainMap;
  elevation: ElevationMap;
}

export interface SightResult {
  visible: boolean;
  /** The square that cut the line, when one did. */
  blockedBy?: Square;
  /** Half cover: a blocking square beside the target, on the attacker's side. */
  cover: boolean;
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
    if (top === Infinity) return { visible: false, blockedBy: at, cover: false };
    const lineHeight = eyeFrom + (eyeTo - eyeFrom) * t;
    // Strictly above: grazing the top of a ridge passes. This is what lets an
    // archer a step up clear the mid-field rock while the same rock still
    // hides whoever is crouched directly behind it.
    if (top > lineHeight) return { visible: false, blockedBy: at, cover: false };
  }

  return { visible: true, cover: hasCover(ctx, from, to) };
}

/**
 * Half cover: a sight-blocking square orthogonally beside the target, on the
 * side the attack comes from. The dot product is the whole test - "on the
 * attacker's side" means the step from target to cover points the same way as
 * the line back toward the attacker.
 */
function hasCover(ctx: SightContext, from: Square, to: Square): boolean {
  const toward = { x: from.x - to.x, y: from.y - to.y };
  const sides = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
  return sides.some((side) => {
    const at = { x: to.x + side.x, y: to.y + side.y };
    if (at.x === from.x && at.y === from.y) return false;
    const top = topOf(ctx, at);
    // Cover has to actually rise above the target's own ground.
    if (!(top > groundAt(ctx, to))) return false;
    return side.x * toward.x + side.y * toward.y > 0;
  });
}
