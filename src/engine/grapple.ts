import { INCAPACITATING } from '../data/conditions';
import type { Square } from '../encounter';
import { rollD20 } from './dice';
import type { Rng } from './dice';
import { canShove, sizeRank } from './shove';

/**
 * Grappling: the hold, the escape, and what it costs to drag somebody.
 *
 * ## Why this exists now, having been ruled out twice
 *
 * Section 23 put grappling in the "deliberately absent" register alongside
 * shoving, on the grounds that both are rulings richer than a grid should
 * model. §26.2 took shoving back and said grappling "stays absent, and stays
 * absent for its own reasons". Those reasons were real and are now spent:
 *
 * - **It needs ongoing state.** A shove resolves and is over; a grapple is a
 *   relationship that persists across turns. The app had nowhere to record
 *   "this goblin is holding that wizard" - until conditions grew a *source*
 *   in §27.2, for frightened and charmed. `conditionSources.grappled` is
 *   exactly the missing field, already persisted, already migrated.
 * - **It changes movement.** Speed 0 is the whole of what the condition does,
 *   and until §16.7 derived speed and spent it as a budget, there was no
 *   number for it to zero.
 *
 * Both are now true, so the only remaining reason to leave grappling out was
 * that it had always been left out. That is not a reason.
 *
 * ## The rules, as the SRD states them
 *
 * A grapple replaces one attack of the Attack action, and needs a free hand.
 * Athletics against the target's choice of Athletics or Acrobatics - the same
 * contest as a shove, from the same function, because it *is* the same
 * contest. A creature more than one size larger cannot be grabbed.
 *
 * Success applies the **grappled** condition: speed 0, and it ends when the
 * grappler lets go, when the grappler is incapacitated, or when something
 * moves the target out of the grappler's reach.
 *
 * Escaping is an action: the grappled creature's Athletics **or** Acrobatics -
 * their choice, so their better - against the grappler's Athletics. Ties go to
 * the grappler, because a tied contest is no change and no change means still
 * held.
 *
 * Moving while holding somebody drags them along at **half speed**, unless
 * they are two or more sizes smaller than you, in which case they weigh
 * nothing worth mentioning and you move at full pace.
 *
 * ## What this module refuses to decide
 *
 * Whether a hand is free. The app models a loadout, but "free hand" in
 * practice is a table question - a shield can be doffed, a torch dropped, and
 * a DM who has to argue with a tool about it will stop using the tool. The
 * contest is offered; whether the character could reach out is theirs.
 */

/** The condition a successful grapple applies, spelled once. */
export const GRAPPLED = 'grappled';

/**
 * What the map can arm and point at somebody: the two shove modes and the
 * grab. One union because it is one gesture - arm it, click a token - and the
 * battle screen holds exactly one of them at a time.
 */
export type GrabMode = 'push' | 'prone' | 'grapple';

/**
 * Nobody grabs hold of what is more than one size larger than they are.
 *
 * The same rule as a shove, deliberately not re-derived: the SRD states the
 * size limit once and applies it to both, and two copies of one rule is one
 * copy waiting to drift.
 */
export const canGrapple = canShove;

/** How the escape contest came out, from the escapee's side of it. */
export interface Escape {
  escapeeRoll: number;
  grapplerRoll: number;
  /** Which skill the escapee ended up wriggling with. */
  escapeeUsed: 'Athletics' | 'Acrobatics';
  /** Strictly greater: a tie leaves them held, which is the SRD's own answer. */
  success: boolean;
}

/**
 * One contested roll to get free.
 *
 * The mirror of `shoveContest`, and deliberately its own function rather than
 * that one with the arguments swapped: here it is the *escapee* who picks the
 * better of two skills and the *grappler* who is stuck with Athletics, which
 * is the opposite of who chooses in a shove. Passing the arguments in the
 * wrong holes would still typecheck and would silently give the grappler
 * Acrobatics.
 */
export function escapeContest(
  escapeeAthletics: number,
  escapeeAcrobatics: number,
  grapplerAthletics: number,
  rng: Rng,
): Escape {
  const useAcrobatics = escapeeAcrobatics > escapeeAthletics;
  const escapeeRoll = rollD20(
    useAcrobatics ? escapeeAcrobatics : escapeeAthletics,
    'normal',
    rng,
  ).total;
  const grapplerRoll = rollD20(grapplerAthletics, 'normal', rng).total;
  return {
    escapeeRoll,
    grapplerRoll,
    escapeeUsed: useAcrobatics ? 'Acrobatics' : 'Athletics',
    success: escapeeRoll > grapplerRoll,
  };
}

/**
 * The conditions that end a grapple by ending the grappler.
 *
 * A grapple releases when the grappler becomes incapacitated, and four other
 * conditions *include* incapacitated by their own text - so a paralysed
 * grappler has let go whether or not anybody wrote 'incapacitated' on them
 * too. Which conditions those are is a flag on the `Condition` records.
 */
const RELEASES_A_GRAPPLE = INCAPACITATING;

/** Why a hold stopped being a hold, or null while it still is one. */
export type GrappleEnd = 'down' | 'incapacitated' | 'apart' | 'gone';

/**
 * Whether an existing grapple has quietly ended.
 *
 * Called on every render rather than remembered, because every one of these
 * can happen without the grapple being touched: the grappler gets stunned by
 * somebody else's spell, the target is teleported away, the grappler drops.
 * A hold that outlived its grappler is the bug this function exists to make
 * impossible.
 *
 * Distance is Chebyshev in squares, the same one-distance rule the rest of
 * the app measures by, with reach in squares so a Large creature with a ten
 * foot reach can hold somebody at arm's length.
 */
export function grappleEnds(
  grappler: { conditions: string[]; hp: number; at?: Square | null } | undefined,
  target: { at?: Square | null },
  reach = 1,
): GrappleEnd | null {
  // Nobody there: the grappler left the fight entirely, which the encounter
  // allows - a removed combatant should not keep holding anybody.
  if (!grappler) return 'gone';
  if (grappler.hp <= 0) return 'down';
  if (grappler.conditions.some((c) => RELEASES_A_GRAPPLE.includes(c))) return 'incapacitated';
  if (!grappler.at || !target.at) return 'apart';
  const gap = Math.max(
    Math.abs(grappler.at.x - target.at.x),
    Math.abs(grappler.at.y - target.at.y),
  );
  return gap > reach ? 'apart' : null;
}

/** How it reads in the log, without the module deciding whose name goes where. */
export const END_REASON: Record<GrappleEnd, string> = {
  down: 'their grappler is down',
  incapacitated: 'their grappler cannot hold on',
  apart: 'they are out of reach',
  gone: 'their grappler has left the fight',
};

/**
 * What dragging somebody does to your speed.
 *
 * Halved, unless they are two or more sizes smaller - a Medium creature
 * hauling a Tiny one is not slowed by it, and the SRD says so. Rounded down,
 * because a speed of 25 dragging somebody is 12 feet of walking and the grid
 * charges in fives regardless.
 */
export function dragSpeed(speed: number, grapplerSize: string, targetSize: string): number {
  if (sizeRank(grapplerSize) - sizeRank(targetSize) >= 2) return speed;
  return Math.floor(speed / 2);
}
