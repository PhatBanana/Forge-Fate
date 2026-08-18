import type { Square } from '../encounter';
import { keyOf } from '../terrain';

/**
 * §89: what this fight is for.
 *
 * Every fight the app has run so far had the same unwritten objective: kill
 * everything, then open the After drawer. That is one mission type, and the
 * tactics games this app keeps borrowing from get most of their texture from
 * the others - X-COM's extractions and timers, Fire Emblem's defend-the-gate
 * and seize chapters. The DM authors one; the app *notices*; the DM still
 * rules. Nothing here ends a fight, exactly as flanking never adds the
 * advantage - noticing is the app's whole jurisdiction.
 *
 * Three kinds, each one parameter, all judged from facts the encounter
 * already holds:
 *
 * - **hold** - the line is held for N full rounds. Won when round N ends
 *   with somebody still standing.
 * - **reach** - somebody reaches the marked squares. Won the moment a living
 *   party member stands on the mark.
 * - **protect** - a named combatant must stay standing. Never "won" by the
 *   engine: it is a constraint the fight ends under, and the debrief records
 *   whether it held. While the ward is down the verdict warns, and it is
 *   *not* latched - dropping to nought is not dying in fifth edition, and a
 *   ward healed back up is a ward protected. The table rules on the corpse
 *   case, not the app.
 *
 * The default - no objective - is the rout, and stays implicit: it needs no
 * judge because the After drawer has been its judge since §29.
 *
 * Only a **win** is remembered (`wonAt`, written by the caller with a log
 * line): an announcement should not flicker off because the rogue stepped
 * off the mark after touching it. A loss is never latched, because every
 * loss here - the party down, the ward down - is a state the fight can come
 * back from, and the app refusing to notice the recovery would be ruling.
 */

export type Objective =
  | { kind: 'hold'; rounds: number; wonAt?: number }
  | { kind: 'reach'; squares: Square[]; wonAt?: number }
  | { kind: 'protect'; combatantId: string; wonAt?: number };

/** The facts a verdict turns on, read off the fight by the caller. */
export interface FightFacts {
  /** 0 before the fight starts. */
  round: number;
  /**
   * Living party members, mapped or not. The count and the squares are two
   * facts, not one: the tracker has run map-less fights since §12, and a
   * party holding the line in a fight with no tokens is still holding it.
   * Only the mark needs to know where anybody is.
   */
  standing: number;
  /** Squares of living party members currently on the map. */
  party: Square[];
  /** The named ward still has hit points. Undefined when nobody is named
      or the ward has left the fight entirely. */
  wardStanding?: boolean;
}

export type Verdict =
  | { state: 'open' }
  /** Warned, not lost: the thing the objective protects is down right now. */
  | { state: 'wavering' }
  | { state: 'won'; line: string }
  | { state: 'lost'; line: string };

export function judgeObjective(objective: Objective, facts: FightFacts): Verdict {
  // Already won stays won - the latch is the caller's, the answer is ours.
  if (objective.wonAt !== undefined) {
    return { state: 'won', line: wonLine(objective) };
  }

  // A fight that has not started judges nothing: deployment is deployment.
  if (facts.round <= 0) return { state: 'open' };

  // The party wiped loses every objective there is. Latched by nobody: a
  // Revivify changes the facts and the verdict follows them.
  if (facts.standing === 0 && objective.kind !== 'protect') {
    return { state: 'lost', line: 'Nobody left standing.' };
  }

  switch (objective.kind) {
    case 'hold':
      // Round N+1 beginning means N full rounds were stood through.
      return facts.round > objective.rounds
        ? { state: 'won', line: wonLine(objective) }
        : { state: 'open' };
    case 'reach': {
      const marks = new Set(objective.squares.map(keyOf));
      return facts.party.some((at) => marks.has(keyOf(at)))
        ? { state: 'won', line: wonLine(objective) }
        : { state: 'open' };
    }
    case 'protect':
      if (facts.wardStanding === undefined) return { state: 'open' };
      return facts.wardStanding ? { state: 'open' } : { state: 'wavering' };
  }
}

/** The one sentence the log and the chronicle get when a win latches. */
export function wonLine(objective: Objective): string {
  switch (objective.kind) {
    case 'hold':
      return `The line holds — ${objective.rounds} full ${objective.rounds === 1 ? 'round' : 'rounds'} stood.`;
    case 'reach':
      return 'The mark is reached.';
    case 'protect':
      return 'The ward still stands.';
  }
}

/** What the DM authored, said back - the HUD's flag and the Prep summary. */
export function describeObjective(objective: Objective, wardName?: string): string {
  switch (objective.kind) {
    case 'hold':
      return `Hold the line for ${objective.rounds} ${objective.rounds === 1 ? 'round' : 'rounds'}`;
    case 'reach':
      return `Reach the mark (${objective.squares.length} ${objective.squares.length === 1 ? 'square' : 'squares'})`;
    case 'protect':
      return `${wardName ?? 'The ward'} must stand`;
  }
}

/**
 * Where the objective is right now, for the flag on the glass. Short,
 * because it shares a strip with whose turn it is.
 */
export function progressLine(
  objective: Objective,
  facts: FightFacts,
  wardName?: string,
): string {
  const verdict = judgeObjective(objective, facts);
  if (verdict.state === 'won') return verdict.line;
  if (verdict.state === 'lost') return verdict.line;
  if (verdict.state === 'wavering') return `${wardName ?? 'The ward'} is down!`;
  switch (objective.kind) {
    case 'hold':
      return facts.round > 0
        ? `round ${Math.min(facts.round, objective.rounds)} of ${objective.rounds}`
        : describeObjective(objective);
    case 'reach':
      return 'the mark waits';
    case 'protect':
      return `${wardName ?? 'the ward'} stands`;
  }
}

/**
 * The chronicle's clause, written at payout - the one moment the app knows
 * how it ended. Protect resolves here: standing at payout is the constraint
 * having held.
 */
export function chronicleLine(
  objective: Objective,
  facts: FightFacts,
  wardName?: string,
): string {
  const what = describeObjective(objective, wardName);
  if (objective.wonAt !== undefined) {
    return `${what} — done${objective.kind !== 'protect' ? ` in round ${objective.wonAt}` : ''}`;
  }
  const verdict = judgeObjective(objective, facts);
  if (verdict.state === 'won') return `${what} — done`;
  if (objective.kind === 'protect') {
    return facts.wardStanding === false ? `${what} — they fell` : `${what} — they stood`;
  }
  return `${what} — not done`;
}

/** Toggle a square in a reach objective's mark - the paint tool's write. */
export function toggleMark(squares: Square[], at: Square): Square[] {
  const key = keyOf(at);
  const without = squares.filter((s) => keyOf(s) !== key);
  return without.length === squares.length ? [...squares, at] : without;
}
