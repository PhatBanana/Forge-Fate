import type { Square } from '../encounter';
import { keyOf } from '../terrain';
import { expectedTotal, parseNotation } from './dice';
import { hitChance } from './dpr';
import { routineReach } from './strikes';
import type { Strike } from './strikes';

/**
 * What a monster does on its turn, decided rather than driven.
 *
 * Every monster turn in this app has been hand-driven: the DM picks the
 * token, arms Move, clicks a square, opens the menu, picks the attack, clicks
 * the target. That is fine for one ogre and miserable for eight goblins, and
 * it is the single biggest reason the battle screen is slower to run than a
 * sheet of paper.
 *
 * So this decides, and hands the decision back with its reasoning attached.
 * It does **not** act: the caller shows the plan, the DM approves it, and
 * only then does anything move. An AI that acted on its own would be a worse
 * tool, because the DM is the one who knows that these particular goblins are
 * cowards.
 *
 * ## What it is, and is not
 *
 * Pure, deterministic, and free of the roster and the encounter model - it
 * takes a flat view of who is standing where, and a function that prices a
 * square. That is what lets it be tested against a hand-drawn battlefield
 * rather than a mocked React tree, and what keeps the fog, the hazards and
 * the walk rules in the caller where they already live and are already
 * tested: the price it is handed is the price the DM's own click would pay,
 * hazard-avoiding route and all.
 *
 * It rolls no dice. The odds it weighs are expectations - `hitChance` against
 * the target's AC, average damage off the same notation the dice use - so the
 * plan does not change when you look at it twice.
 */

/** One combatant, flattened to the fields a decision actually turns on. */
export interface Actor {
  id: string;
  name: string;
  /** Which side. Nothing ever plans an attack on its own side. */
  side: 'party' | 'foe';
  at?: Square;
  hp: number;
  ac: number;
  /** Out of the fight - dropped, or not yet woken. Neither target nor threat. */
  out?: boolean;
}

export interface PlannedMove {
  to: Square;
  /** Feet, priced by the caller's own walk. */
  cost: number;
  /** True when this took the Dash, which is why no attack came with it. */
  dash: boolean;
}

export interface TurnPlan {
  /** Absent when it is already standing where it wants to be. */
  move?: PlannedMove;
  /** Absent when the whole plan is to walk, or to do nothing. */
  targetId?: string;
  /** The round it means to throw. Empty when it is not attacking. */
  strikes: Strike[];
  /** One sentence for the DM, saying why. This is what makes overriding it
      a judgement rather than a guess. */
  reason: string;
}

export interface TurnInput {
  self: Actor;
  /** Everyone on the field, `self` included or not - it is filtered out. */
  actors: Actor[];
  /**
   * The rounds it could throw, each entire. `routineOptions` builds these:
   * one entry for a Multiattack, or one per single attack.
   */
  options: Strike[][];
  /** Feet of ordinary movement left, and what a Dash would raise it to. */
  budget: { base: number; dash: number };
  /**
   * What it costs to stand on a square, in feet, or null for nowhere it can
   * get to. The caller's Dijkstra, hazards and all - so a plan never routes
   * through a wall of fire that the DM's own click would have gone around.
   */
  priceOf: (at: Square) => number | null;
  /** Every square the walk can reach, which is the search space. */
  candidates: Square[];
  /**
   * How far a square is from the nearest enemy **by walking**, or null when
   * there is no route at all.
   *
   * Only used to decide which way to run when nothing can be attacked, and it
   * has to be a walk rather than a straight line. A goblin standing against
   * the west wall of its room, with the party a long way west, is exactly the
   * same crow-flies distance from them wherever inside the room it steps - so
   * a planner measuring in straight lines concludes it cannot get closer and
   * stands there for the whole fight. The door is the way out and only a walk
   * knows that. `walkMap` takes several sources at once for precisely this.
   *
   * Absent falls back to the straight line, which is right for open ground and
   * is what the tests on open ground assume.
   */
  approach?: (at: Square) => number | null;
}

/** Feet between two squares, on the one rule every distance here runs on:
    a diagonal costs the same as a step, so it is Chebyshev times five. */
export const feetBetween = (a: Square, b: Square): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) * 5;

/** What a round is worth against a given AC, before any dice are rolled. */
export function expectedDamage(strikes: Strike[], ac: number): number {
  let total = 0;
  for (const strike of strikes) {
    const chance = hitChance(strike.toHit, ac);
    for (const part of strike.damage) {
      const parsed = parseNotation(part.dice);
      if (parsed) total += chance * expectedTotal(parsed);
    }
  }
  return total;
}

const alive = (a: Actor): boolean => !a.out && a.hp > 0 && a.at !== undefined;

/**
 * A plan, scored so the best one wins by comparison rather than by a magic
 * number. Read in order: something it can drop this turn beats everything;
 * then the most damage it can expect to do; then the least walking to do it.
 * The last two entries are ids, so a tie never depends on iteration order.
 */
type Score = [lethal: number, expected: number, closeness: number, foe: string, square: string];

const better = (a: Score, b: Score): boolean => {
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    // Ids sort ascending; everything before them sorts descending.
    if (i >= 3) return String(a[i]) < String(b[i]);
    return (a[i] as number) > (b[i] as number);
  }
  return false;
};

/**
 * Decide the turn.
 *
 * ## The rules, in the order they apply
 *
 * 1. **Attack if you can.** Every round it could throw, against every living
 *    enemy, from every square it can afford to stand on - the best of those
 *    wins. A kill beats more damage, more damage beats a shorter walk.
 * 2. **Do not Dash into an attack.** Dashing *is* the action, so a square
 *    only reachable by Dashing is a square you arrive at with nothing left to
 *    do. Attack plans are priced against ordinary movement only.
 * 3. **Otherwise close.** Nothing in reach means walking at whatever the
 *    nearest enemy is, as far as the budget allows, Dash included - because
 *    a monster that cannot reach anybody should be running, not standing.
 * 4. **Otherwise hold**, and say so.
 */
export function planTurn(input: TurnInput): TurnPlan {
  const { self, actors, options, budget, priceOf, candidates } = input;

  const foes = actors.filter((a) => a.id !== self.id && a.side !== self.side && alive(a));
  if (!self.at) {
    return { strikes: [], reason: `${self.name} is not on the map.` };
  }
  if (foes.length === 0) {
    return { strikes: [], reason: `${self.name} has nothing left to fight.` };
  }

  /*
    Somebody is standing there.

    The walk the caller hands in prices occupied squares like any other - it
    is a map of the ground, not of the crowd - so the crowd is subtracted
    here. Everyone with a square counts, dropped included, because that is
    exactly the rule the DM's own click obeys: a plan that cannot be run when
    the DM presses the button is worse than no plan.
  */
  const taken = new Set(
    actors.filter((a) => a.id !== self.id && a.at).map((a) => keyOf(a.at!)),
  );

  // The square it is already on is always a candidate, and costs nothing.
  const here = self.at;
  const spots: { at: Square; cost: number }[] = [{ at: here, cost: 0 }];
  for (const at of candidates) {
    if (at.x === here.x && at.y === here.y) continue;
    if (taken.has(keyOf(at))) continue;
    const cost = priceOf(at);
    if (cost === null || cost > budget.dash) continue;
    spots.push({ at, cost });
  }

  let best: { score: Score; plan: TurnPlan } | null = null;

  for (const routine of options) {
    if (!routine.length) continue;
    const reach = routineReach(routine);
    for (const foe of foes) {
      const expected = expectedDamage(routine, foe.ac);
      for (const spot of spots) {
        // Rule 2: an attack has to be affordable without the Dash.
        if (spot.cost > budget.base) continue;
        if (feetBetween(spot.at, foe.at!) > reach) continue;

        const score: Score = [
          expected >= foe.hp ? 1 : 0,
          expected,
          -spot.cost,
          foe.id,
          keyOf(spot.at),
        ];
        if (best && !better(score, best.score)) continue;

        const moved = spot.cost > 0;
        const label = routine.length > 1 ? `${routine.length} attacks` : routine[0].label;
        best = {
          score,
          plan: {
            ...(moved ? { move: { to: spot.at, cost: spot.cost, dash: false } } : {}),
            targetId: foe.id,
            strikes: routine,
            reason:
              expected >= foe.hp
                ? `${foe.name} is within one round of dropping — ${label}${moved ? `, after ${spot.cost} ft` : ''}.`
                : moved
                  ? `Closes ${spot.cost} ft on ${foe.name} and attacks — ${label}.`
                  : `${foe.name} is already in reach — ${label}.`,
          },
        };
      }
    }
  }

  if (best) return best.plan;

  /*
    Rule 3. Nothing can be attacked from anywhere it can afford to stand, so
    the turn is a walk: whichever reachable square leaves it closest to the
    nearest enemy. The Dash is allowed here precisely because there is no
    attack to protect.

    "Closest" is measured by walking when the caller can say - see `approach`.
    The straight line is only the fallback, and only right on open ground.
  */
  const distanceFromNearest = (at: Square): number => {
    if (input.approach) {
      const walked = input.approach(at);
      // No route at all is infinitely far, not zero: a square the party
      // cannot be reached from must never look like the best place to stand.
      return walked === null ? Infinity : walked;
    }
    return Math.min(...foes.map((f) => feetBetween(at, f.at!)));
  };

  let closest: { at: Square; cost: number; gap: number } | null = null;
  for (const spot of spots) {
    const gap = distanceFromNearest(spot.at);
    if (
      !closest ||
      gap < closest.gap ||
      // Same distance for less walking is the same result for less risk.
      (gap === closest.gap && spot.cost < closest.cost)
    ) {
      closest = { at: spot.at, cost: spot.cost, gap };
    }
  }

  const standing = distanceFromNearest(here);
  if (!closest || closest.cost === 0 || closest.gap >= standing) {
    return {
      strikes: [],
      reason: `${self.name} can reach nobody and get no closer — holds.`,
    };
  }

  const nearest = foes.reduce((a, b) =>
    feetBetween(closest!.at, a.at!) <= feetBetween(closest!.at, b.at!) ? a : b,
  );
  const dash = closest.cost > budget.base;
  return {
    move: { to: closest.at, cost: closest.cost, dash },
    strikes: [],
    reason: `Nothing in reach — ${dash ? 'Dashes' : 'moves'} ${closest.cost} ft toward ${nearest.name}.`,
  };
}
