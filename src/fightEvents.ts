import type { Roster } from './storage';
import type { Square } from './encounter';

/**
 * §114: what a rule did, said back to the screen.
 *
 * The write-side half of ROADMAP §9's shape. A rules module returns the
 * new truth **and a list of what happened**; the screen plays the list.
 * That split exists for one concrete reason: the resolvers fire five
 * animation channels and a toast from inside the rules, and a module
 * that called `setLunges` would be a component with extra steps - it
 * could never be tested without React, which is the whole point of
 * moving it.
 *
 * So: rules say what happened. They do not do it.
 *
 * The union carries only what the rules that have moved actually emit.
 * It is meant to grow one member at a time, as each step needs one -
 * an event nobody raises is an event nobody has to play.
 */
export type FightEvent =
  /** §69: somebody travelled. `slide` marks forced movement - a shove or
      a drag glides flat instead of taking walking hops. */
  | { kind: 'walk'; id: string; route: Square[]; slide?: boolean }
  /** §68: somebody swung, and at what - the sprite lunges toward it. */
  | { kind: 'lunge'; id: string; toward: Square }
  /** A number floated off a token: "-7" red, "+5" green. */
  | { kind: 'float'; id: string; text: string; heal?: boolean }
  /** The hit flash on a token that just took damage. */
  | { kind: 'flash'; id: string }
  /** One line across the top of the board - the loud, brief kind. */
  | { kind: 'banner'; text: string }
  /** Something worth saying to the DM in a toast rather than the log. */
  | { kind: 'say'; text: string };

/**
 * The new truth, and what to play. The encounter travels folded into the
 * roster (§106), so one write lands both stores and one undo step covers
 * them.
 */
export interface Resolution {
  roster: Roster;
  events: FightEvent[];
}

/** A resolution that changed nothing and has nothing to say - the
    mis-click answer, so callers never have to special-case null. */
export const nothingHappened = (roster: Roster): Resolution => ({ roster, events: [] });
