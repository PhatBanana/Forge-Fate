import type { Square } from '../encounter';
import { keyOf } from '../terrain';

/**
 * §88: the board tells the future.
 *
 * Two borrowed ideas, from the two tactics games that trust their players
 * with information. Fire Emblem's **danger zone**: every square an enemy
 * could reach and strike on its turn, washed so a player positions against
 * the truth rather than a guess. Into the Breach's **telegraph**: what each
 * enemy will actually do when its turn comes, drawn on the board before it
 * happens.
 *
 * Almost everything both need already exists - `walkMap` prices the walk,
 * `planTurn` decides the turn, `expectedDamage` weighs the round, and the
 * §18.1 odds chip carries a number over a head in every renderer. What was
 * missing is this one function: turning "the squares it can stand on" into
 * "the squares it can hurt".
 *
 * ## What the spread deliberately is not
 *
 * It is a breadth-first flood over squares, stepped like the walk (a
 * diagonal is one step, Chebyshev), stopped by squares an attack cannot pass
 * - walls, pillars, shut doors - and it is **not** a line-of-sight test.
 * Cover is not subtracted and a corner is turned more generously than a
 * ray would allow. That is the right kind of wrong for a threat display:
 * FE's wash over-warns and players plant their healer by what it says; a
 * wash that under-warned would get somebody killed by a square it called
 * safe. The exact shot, when it is taken, is still priced by `lineOfSight`
 * as it always was - this only says *worry here*.
 */

/** One square's worth of feet: the flood steps in squares, reach comes in feet. */
const FEET_PER_SQUARE = 5;

/**
 * Every square within `reachFeet` of any of `spots`, flooding around
 * anything `passable` refuses. The spots themselves are included - standing
 * where the monster could stand is not safe either.
 */
export function threatened(
  spots: Square[],
  reachFeet: number,
  passable: (at: Square) => boolean,
): Set<string> {
  const radius = Math.floor(reachFeet / FEET_PER_SQUARE);
  const out = new Set<string>(spots.map(keyOf));
  if (radius <= 0) return out;

  let frontier = spots;
  for (let step = 0; step < radius && frontier.length; step++) {
    const next: Square[] = [];
    for (const at of frontier) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const to = { x: at.x + dx, y: at.y + dy };
          const key = keyOf(to);
          if (out.has(key)) continue;
          /*
            A square the attack cannot pass is also not worth warning about:
            nobody stands inside a pillar. One check serves both meanings,
            which is why `passable` is the only question this asks.
          */
          if (!passable(to)) continue;
          out.add(key);
          next.push(to);
        }
      }
    }
    frontier = next;
  }
  return out;
}

/** A segment of a telegraphed turn, for the maps to draw. */
export interface IntentSegment {
  from: Square;
  to: Square;
  /** True for the walk to where it will stand; absent for the strike itself. */
  walk?: boolean;
}
