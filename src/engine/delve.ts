import type { Square } from '../encounter';
import type { Room } from './dungeon';
import { keyOf } from '../terrain';

/**
 * §90: the Delve - a drawn place, survived.
 *
 * Every piece of a dungeon-crawl mode already existed by the time this file
 * was written: deployment seats the party in room 1 and spreads the monsters
 * far-first (§22.2), fog remembers what has been seen (§19.1), a dormant
 * monster is not in the fight until the party lays eyes on it (§19.2), short
 * rests restore what a short rest restores (§51/§54), and the chronicle takes
 * a chapter per fight (§30). What was missing was the loop being *named and
 * paced*: this file is the naming and the pacing, and nothing else.
 *
 * The stance is the house stance, once more: **the app notices, the DM
 * rules.** Nothing here opens a door, springs a trap, forbids a rest or ends
 * the run. A room "clears" because the facts say nobody hostile is left
 * standing in a room the party has seen; a "breath" is offered because no
 * awake enemy is left on the board, not enforced because a timer says so.
 * X-COM paces its runs with rules; a table paces its own with judgement, and
 * this is the judgement's instrument panel.
 *
 * What must persist is deliberately small - the name, the rests taken, and
 * who fell where - because everything else the strip shows is derivable from
 * facts the encounter already holds (rooms, fog, hit points, dormancy), and
 * a derived fact cannot drift from the board the way a stored copy can.
 */

/** The run, on the encounter: saved, cleared and undone with the fight. */
export interface DelveState {
  /** The place's name, from the saved dungeon - the chapter's title. */
  name: string;
  /** Short rests taken during the run. Counted, never limited: how many
      breaths a party may take is the table's economy, not the app's. */
  rests: number;
  /** Who dropped, and where. A record, not a state: healing somebody back
      up does not un-fall them - the chronicle remembers the moment. */
  fallen: Fallen[];
}

export interface Fallen {
  name: string;
  /** The room they were standing in, absent when they fell in a corridor. */
  room?: number;
  round: number;
}

/** What the pacing turns on, read off the fight by the caller. */
export interface DelveMonster {
  at?: Square;
  alive: boolean;
  dormant: boolean;
}

export type RoomState = 'unseen' | 'held' | 'cleared';

/** Which room a square is inside, if any. Callers pass *resolved* rooms -
    a hidden room the party has not found is not there to be inside of. */
export function roomOf(rooms: Room[], at: Square): Room | undefined {
  return rooms.find(
    (r) => at.x >= r.x && at.x < r.x + r.w && at.y >= r.y && at.y < r.y + r.h,
  );
}

/**
 * Every room's standing, from the fog's memory and the monsters' facts.
 *
 * - **unseen** - the party has laid eyes on none of its squares.
 * - **held** - seen, and a living monster stands in it (dormant or not: a
 *   sleeping guard still holds the guard room).
 * - **cleared** - seen, and nobody hostile left inside. An empty room clears
 *   the moment it is seen: walking through it is all clearing it takes.
 *
 * Indexed as `rooms` is, so callers can zip the two.
 */
export function roomStates(
  rooms: Room[],
  explored: Iterable<string>,
  monsters: DelveMonster[],
): RoomState[] {
  const seen = explored instanceof Set ? (explored as Set<string>) : new Set(explored);
  const standing = monsters.filter((m) => m.alive && m.at);
  return rooms.map((room) => {
    let anySeen = false;
    for (let y = room.y; y < room.y + room.h && !anySeen; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (seen.has(keyOf({ x, y }))) {
          anySeen = true;
          break;
        }
      }
    }
    if (!anySeen) return 'unseen';
    return standing.some((m) => roomOf([room], m.at!) === room) ? 'held' : 'cleared';
  });
}

export interface DelveProgress {
  cleared: number;
  /** Resolved rooms only: finding a hidden room grows the total, which is
      exactly what finding a hidden room should do to a delve. */
  total: number;
}

export const delveProgress = (states: RoomState[]): DelveProgress => ({
  cleared: states.filter((s) => s === 'cleared').length,
  total: states.length,
});

/**
 * A breath: no living monster on the board is awake. The moment between
 * rooms every dungeon crawl is actually made of - the app offers the rest
 * here rather than in a menu, and the DM still rules on whether the party
 * gets ten quiet minutes.
 */
export const breathTime = (monsters: DelveMonster[]): boolean =>
  monsters.every((m) => !m.alive || m.dormant);

/** The strip's short line: `3/8 rooms · 1 rest`. Shares the glass with the
    turn and the objective flag, so it counts rather than narrates. */
export function delveStrip(delve: DelveState, progress: DelveProgress): string {
  const rooms = `${progress.cleared}/${progress.total} rooms`;
  const rests = delve.rests
    ? ` · ${delve.rests} ${delve.rests === 1 ? 'rest' : 'rests'}`
    : '';
  return `${rooms}${rests}`;
}

/**
 * The chronicle's clause, written at payout: the whole run in one line.
 * `The Sunken Vault — 6 of 8 rooms cleared, 2 short rests; Sera fell in
 * room 3`. Falls read newest-last, the order they happened in.
 */
export function delveLine(delve: DelveState, progress: DelveProgress): string {
  const rooms = `${progress.cleared} of ${progress.total} rooms cleared`;
  const rests = delve.rests
    ? `, ${delve.rests} short ${delve.rests === 1 ? 'rest' : 'rests'}`
    : '';
  const fallen = delve.fallen.length
    ? `; ${delve.fallen
        .map((f) => `${f.name} fell ${f.room !== undefined ? `in room ${f.room}` : 'in the corridors'}`)
        .join(', ')}`
    : '';
  return `${delve.name} — ${rooms}${rests}${fallen}`;
}

/** Record a fall, once per name: the first time is the moment the chronicle
    keeps, and a second drop after a heal is the same sad story continuing. */
export function recordFall(delve: DelveState, fall: Fallen): DelveState {
  if (delve.fallen.some((f) => f.name === fall.name)) return delve;
  return { ...delve, fallen: [...delve.fallen, fall] };
}
