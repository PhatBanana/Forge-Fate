import type { Square } from '../encounter';
import { rollD20 } from './dice';
import type { Rng } from './dice';

/**
 * Shoving, and what the ground does to whoever lands on it.
 *
 * ## Why this exists now, having been ruled out
 *
 * Section 23 put grappling and shoving in the "deliberately absent" register,
 * with the reason that they are rulings richer than a grid should model. That
 * was right about grappling and wrong about shoving, for one reason the
 * register did not account for: **this map has height**. Elevation has been a
 * layer since 12.3 and has never once changed a number - it tinted squares and
 * annotated an attack with "high ground", and that was all. A ledge nobody can
 * be pushed off is scenery.
 *
 * Shoving is also, unlike grappling, a single contested roll with two possible
 * outcomes and no ongoing state to track. It fits in a function. Grappling
 * stays absent, and stays absent for its own reasons.
 *
 * ## The rules, as the SRD states them
 *
 * A shove replaces one attack of the Attack action. Athletics against the
 * defender's choice of Athletics or Acrobatics; the defender takes whichever
 * is better, because a defender who would not is a defender making a mistake
 * the dice should not reward. Ties go to the defender - the SRD resolves a
 * tied contest as no change. Success pushes five feet **or** knocks prone,
 * chosen by the shover, and a creature more than one size larger cannot be
 * shoved at all.
 *
 * ## Feet per step, stated out loud
 *
 * `terrain.ts` keeps height in abstract steps on purpose - "call a step 5 or
 * 10 feet at the table; the map does not care." Falling damage cannot be
 * agnostic, so this module reads a step as ten feet and **says so in the log**
 * rather than deciding quietly. A table that calls it five feet can halve the
 * dice, and will know to.
 */

/** What one step of the elevation map is worth when somebody falls down it. */
export const FEET_PER_STEP = 10;

/** Sizes, smallest first, so "more than one larger" is a subtraction. */
export const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];

const rankOf = (size: string): number => {
  const i = SIZES.findIndex((s) => s.toLowerCase() === size.trim().toLowerCase());
  // An unknown size is treated as Medium rather than as unshovable: a
  // homebrew monster with a blank size should not become immovable by accident.
  return i === -1 ? SIZES.indexOf('Medium') : i;
};

/** Nobody shoves what is more than one size larger than they are. */
export const canShove = (shover: string, target: string): boolean =>
  rankOf(target) - rankOf(shover) <= 1;

export interface Contest {
  shoverRoll: number;
  targetRoll: number;
  /** Which skill the defender ended up resisting with. */
  targetUsed: 'Athletics' | 'Acrobatics';
  /** Strictly greater: a tie is no change, which is the SRD's own answer. */
  success: boolean;
}

/**
 * One contested roll.
 *
 * The defender's better skill is used rather than a choice being asked for,
 * because the choice has one right answer and putting it to the table would
 * be theatre.
 */
export function shoveContest(
  shoverAthletics: number,
  targetAthletics: number,
  targetAcrobatics: number,
  rng: Rng,
): Contest {
  const useAcrobatics = targetAcrobatics > targetAthletics;
  const shoverRoll = rollD20(shoverAthletics, 'normal', rng).total;
  const targetRoll = rollD20(
    useAcrobatics ? targetAcrobatics : targetAthletics,
    'normal',
    rng,
  ).total;
  return {
    shoverRoll,
    targetRoll,
    targetUsed: useAcrobatics ? 'Acrobatics' : 'Athletics',
    success: shoverRoll > targetRoll,
  };
}

/**
 * The square five feet directly away from the shover.
 *
 * Directly away is the direction of the push, so a diagonal shove lands them
 * diagonally - the same one distance rule the rest of the app runs on. The
 * caller still has to check the square is somewhere a body can be.
 */
export function pushedTo(shover: Square, target: Square): Square {
  const dx = Math.sign(target.x - shover.x);
  const dy = Math.sign(target.y - shover.y);
  // Shover and target on the same square should not happen, and if it does,
  // there is no direction to push in.
  if (dx === 0 && dy === 0) return target;
  return { x: target.x + dx, y: target.y + dy };
}

/**
 * What a fall costs: 1d6 per ten feet, capped at 20d6 as the SRD caps it.
 *
 * Returns null for a drop of less than ten feet, because stepping off a kerb
 * is not a fall and rolling for it wastes everyone's time.
 */
export function fallDamage(feet: number): string | null {
  if (feet < 10) return null;
  const dice = Math.min(20, Math.floor(feet / 10));
  return `${dice}d6`;
}

/** How far somebody falls going from one elevation step to another. */
export const fallFeet = (fromStep: number, toStep: number): number =>
  Math.max(0, fromStep - toStep) * FEET_PER_STEP;
