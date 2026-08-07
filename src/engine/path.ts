import type { Square } from '../encounter';
import type { SightContext } from './sight';
import { walkable } from './sight';
import { TERRAIN_BY_KIND, keyOf } from '../terrain';

/**
 * Where you can actually get to, and what it costs to get there.
 *
 * The first reach wash was a Chebyshev radius with blocked *destinations*
 * removed - which showed a square on the far side of a wall as five feet away,
 * because the wall was only in the way, not underfoot. People cannot go
 * through walls (typically). This walks the grid for real.
 *
 * Dijkstra rather than plain breadth-first because squares do not all cost
 * the same: ordinary ground costs five feet to enter, difficult ground -
 * water, rubble, the space under a tree - costs ten, which is the ordinary
 * rule this app previously only *showed*. A diagonal costs five like every
 * other step, the same one rule every distance in this app runs on.
 *
 * Corners are not cut: a diagonal step is allowed only when at least one of
 * its two orthogonal shoulders is passable. Squeezing between two pillars
 * that touch only at a corner is the classic grid argument, and the grid
 * settles it the way every tabletop engine does.
 */

/**
 * What the map's *effects* overlay onto squares - the zones' contribution,
 * precomputed to key sets by the caller so the engine stays ignorant of what
 * a zone is. `blocked` is a wall of force: nobody enters. `difficult` is a
 * web: double cost. `avoid` is a hazard the walk should route around when it
 * can - passed by excluding those squares in a second, "safe" walk, so the
 * caller can prefer the unburned route and fall back to the short one.
 */
export interface WalkOverlays {
  blocked?: Set<string>;
  difficult?: Set<string>;
  avoid?: Set<string>;
}

/** What it costs to *enter* a square, in feet, or null when nobody can. */
function entryCost(ctx: SightContext, at: Square, overlays?: WalkOverlays): number | null {
  if (!walkable(ctx, at)) return null;
  const key = keyOf(at);
  if (overlays?.blocked?.has(key)) return null;
  if (overlays?.avoid?.has(key)) return null;
  const kind = ctx.terrain[key];
  if (kind) {
    const info = TERRAIN_BY_KIND[kind];
    if (info.blocksMovement) return null;
    if (info.difficult) return 10;
  }
  return overlays?.difficult?.has(key) ? 10 : 5;
}

const STEPS = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
  { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
];

export interface Walk {
  /** Cheapest cost in feet to each reachable square. The origin is not here. */
  cost: Map<string, number>;
  /** Each square's predecessor on its cheapest route, for drawing the route. */
  prev: Map<string, string>;
}

/**
 * The full walk from a square: every square reachable within `feet`, its
 * cheapest cost, and the step it was reached by - which is what lets a ruler
 * bend around the wall instead of pretending to pass through it.
 */
export function walkMap(
  ctx: SightContext,
  from: Square,
  feet: number,
  overlays?: WalkOverlays,
): Walk {
  const best = new Map<string, number>();
  const prev = new Map<string, string>();
  best.set(keyOf(from), 0);

  /*
    A sorted-array frontier rather than a heap: a battle map caps at 64×48 and
    a speed at a few dozen squares, so the frontier stays small and the
    simplest correct structure wins.
  */
  const frontier: { at: Square; cost: number }[] = [{ at: from, cost: 0 }];
  while (frontier.length) {
    frontier.sort((a, b) => a.cost - b.cost);
    const current = frontier.shift()!;
    if (current.cost > (best.get(keyOf(current.at)) ?? Infinity)) continue;

    for (const step of STEPS) {
      const next = { x: current.at.x + step.x, y: current.at.y + step.y };
      const cost = entryCost(ctx, next, overlays);
      if (cost === null) continue;

      // No corner cutting: a diagonal needs a passable shoulder.
      if (step.x !== 0 && step.y !== 0) {
        const shoulderA = entryCost(ctx, { x: current.at.x + step.x, y: current.at.y }, overlays);
        const shoulderB = entryCost(ctx, { x: current.at.x, y: current.at.y + step.y }, overlays);
        if (shoulderA === null && shoulderB === null) continue;
      }

      const total = current.cost + cost;
      if (total > feet) continue;
      const key = keyOf(next);
      if (total >= (best.get(key) ?? Infinity)) continue;
      best.set(key, total);
      prev.set(key, keyOf(current.at));
      frontier.push({ at: next, cost: total });
    }
  }

  best.delete(keyOf(from));
  return { cost: best, prev };
}

/** The old shape, kept for the callers that only want the where and the cost. */
export function reachableFrom(
  ctx: SightContext,
  from: Square,
  feet: number,
): Map<string, number> {
  return walkMap(ctx, from, feet).cost;
}

/**
 * The route the walk took to a square, origin first, destination last -
 * or null when the walk never got there. This is the line the ruler draws.
 */
export function routeTo(walk: Walk, from: Square, to: Square): Square[] | null {
  const target = keyOf(to);
  if (!walk.cost.has(target)) return null;
  const points: Square[] = [];
  let key: string | undefined = target;
  while (key) {
    const [x, y] = key.split(',').map(Number);
    points.unshift({ x, y });
    if (key === keyOf(from)) break;
    key = walk.prev.get(key);
  }
  return points;
}
