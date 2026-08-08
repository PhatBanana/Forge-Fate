import { feetBetween } from './enemyTurn';
import { isMelee, preferredReach, singleStrikes } from './strikes';
import type { Strike } from './strikes';
import type { Monster } from '../data/monsters';

/**
 * The opportunity attack, taken rather than mentioned.
 *
 * §22.5 made movement deliberate and, in the same breath, wrote the note this
 * file exists to replace: *"leaves the reach of X — opportunity attack, unless
 * they Disengaged"*. That sentence has been printed on every walk out of melee
 * since, and no die has ever followed it. It is the last big entry in the
 * noted-never-applied register, and the most consequential one left, because
 * the whole reason to spend an action on Disengage is a swing that never
 * happened.
 *
 * ## What was actually missing
 *
 * Not the dice - `strikesInto` has resolved a full exchange since §13.2. Three
 * pieces of state:
 *
 * - **Disengage as a fact.** Both trays offered it and both only logged it, so
 *   the app could not tell the creature that spent its action from the one that
 *   did not.
 * - **A reaction the monsters own.** Characters have had a reaction pip since
 *   §7; the monster side of the table had legendary actions and movement and no
 *   reaction at all.
 * - **Reach in feet.** The old note fired on Chebyshev adjacency, which is
 *   wrong for every monster with reach 10 - an ogre watched people walk out of
 *   its reach unremarked.
 *
 * Everything here is a decision about *whether* a swing happens. The swing
 * itself stays in `strikesInto`, so an opportunity attack rolls the same cover,
 * high ground, advantage and defences as any other - which is the point of
 * having one exchange function.
 */

export interface Square {
  x: number;
  y: number;
}

/**
 * Conditions that stop a creature reacting.
 *
 * All of them are incapacitated or include being incapacitated, and an
 * incapacitated creature "can't take actions or reactions" - one clause,
 * five ids, because this app stores the specific condition rather than the
 * general one it implies.
 */
export const CANNOT_REACT = ['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious'];

/** One creature that might get to swing, as this rule sees it. */
export interface Reactor {
  id: string;
  conditions: string[];
  /** Already spent it this round. Characters and monsters both track one. */
  reactionSpent?: boolean;
  at?: Square;
  hp: number;
  /**
   * How far its melee reaches, in feet. The reason this is a number rather
   * than a lookup is that it is the *melee* reach specifically - an archer
   * does not get an opportunity attack at eighty feet.
   */
  reach: number;
}

/** The creature walking away, and what it did about it. */
export interface Mover {
  id: string;
  at: Square;
  /** True when it spent its action on Disengage this turn. */
  disengaged?: boolean;
}

/**
 * Whether this creature is in any state to take a reaction at all.
 *
 * Deliberately not asking about the mover: that is `provokedBy`. Split so the
 * UI can grey a reaction pip without knowing who is walking past.
 */
export function mayReact(reactor: Reactor): boolean {
  if (reactor.reactionSpent) return false;
  if (reactor.hp <= 0) return false;
  return !reactor.conditions.some((c) => CANNOT_REACT.includes(c));
}

/**
 * Everyone who gets a swing as `mover` walks from where it stands to `to`.
 *
 * The rule has four parts and all four are here: the mover has to *leave* the
 * reach (stepping around inside it provokes nothing), the reactor has to be
 * able to react, it has to be able to see the mover, and Disengage turns the
 * whole thing off.
 *
 * `canSee` is optional and absent means yes, matching every other sight-aware
 * rule in this codebase: a caller with no line-of-sight model gets the rule
 * applied rather than skipped, because the alternative is an app that quietly
 * stops enforcing opportunity attacks the moment fog is off.
 */
export function provokedBy(
  mover: Mover,
  to: Square,
  candidates: Reactor[],
  canSee?: (watcherId: string, moverId: string) => boolean,
): Reactor[] {
  if (mover.disengaged) return [];
  return candidates.filter((c) => {
    if (!c.at || c.id === mover.id) return false;
    if (feetBetween(c.at, mover.at) > c.reach) return false;
    if (feetBetween(c.at, to) <= c.reach) return false;
    if (!mayReact(c)) return false;
    return canSee ? canSee(c.id, mover.id) : true;
  });
}

/**
 * The one swing a creature takes when it reacts.
 *
 * An opportunity attack is "one melee attack", not a Multiattack - a dragon
 * that walked its whole routine into a reaction would be the single biggest
 * damage bug this app could ship. The pick is the melee strike with the
 * highest flat average, since a reaction is a free swing and nobody chooses
 * the worse one.
 *
 * Empty when the creature has no melee attack at all, which is the honest
 * answer for a monster whose only action is a ranged one.
 */
export function opportunityStrike(monster: Monster): Strike[] {
  const melee = singleStrikes(monster).filter(isMelee);
  if (!melee.length) return [];
  const average = (s: Strike) =>
    s.damage.reduce((sum, part) => {
      const match = /^(\d+)d(\d+)([+-]\d+)?$/.exec(part.dice.replace(/\s/g, ''));
      if (!match) return sum;
      const [, count, faces, bonus] = match;
      return sum + Number(count) * ((Number(faces) + 1) / 2) + Number(bonus ?? 0);
    }, 0);
  return [melee.reduce((best, s) => (average(s) > average(best) ? s : best))];
}

/** Melee reach in feet for a set of strikes, or 5 when it has none. */
export function meleeReach(strikes: Strike[]): number {
  const melee = strikes.filter(isMelee);
  return melee.length ? Math.max(...melee.map(preferredReach)) : 5;
}
