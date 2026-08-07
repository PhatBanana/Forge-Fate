import type { Dungeon, Room } from './dungeon';

/**
 * Who stands where when the fight is put on the map.
 *
 * The party into room 1; the monsters spread across the other rooms,
 * farthest first - nobody starts the day in melee, and walking the corridor
 * chain toward the noise is what a dungeon is for. Deterministic on purpose:
 * the same fight deploys the same way every time, which is what makes it
 * testable and unsurprising.
 */

interface Square {
  x: number;
  y: number;
}

/** Room 1's natural marching order: row-major from the top-left corner. */
function* roomSquares(room: Room): Generator<Square> {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      yield { x, y };
    }
  }
}

/** The same room walked from the bottom-right - the far end of a shared room. */
function* roomSquaresReversed(room: Room): Generator<Square> {
  for (let y = room.y + room.h - 1; y >= room.y; y--) {
    for (let x = room.x + room.w - 1; x >= room.x; x--) {
      yield { x, y };
    }
  }
}

/** The whole grid, inset one from the edge, from a corner in a direction. */
function* gridSquares(width: number, height: number, backwards: boolean): Generator<Square> {
  if (backwards) {
    for (let y = height - 2; y >= 1; y--) {
      for (let x = width - 2; x >= 1; x--) yield { x, y };
    }
  } else {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) yield { x, y };
    }
  }
}

const centre = (room: Room) => ({
  x: room.x + room.w / 2,
  y: room.y + room.h / 2,
});

/** Chebyshev between room centres - the grid's own idea of "far". */
const roomDistance = (a: Room, b: Room) => {
  const ca = centre(a);
  const cb = centre(b);
  return Math.max(Math.abs(ca.x - cb.x), Math.abs(ca.y - cb.y));
};

/**
 * Plan the deployment: every id in the result stands on its own open square.
 *
 * - Party: room 1 (the start of the corridor chain), filled row-major,
 *   overflowing into the next rooms if the party outnumbers the room.
 * - Monsters: round-robin across the other rooms, farthest from room 1
 *   first. A room that fills drops out of the ring; when every room is
 *   full, any open square on the grid; when nothing at all is open, the
 *   id is simply absent from the map - unplaced, not stacked.
 * - No rooms (a blank, hand-painted grid): the party fills from the
 *   top-left corner, the monsters from the bottom-right - opposite ends
 *   of the canvas. One room: same idea inside it, opposite corners.
 *
 * `isOpen` is the caller's law (walkable, unoccupied); a local set keeps
 * this plan's own placements from stacking on each other.
 */
export function planDeployment(
  dungeon: Dungeon,
  isOpen: (at: Square) => boolean,
  partyIds: string[],
  monsterIds: string[],
): Map<string, Square> {
  const placed = new Map<string, Square>();
  const taken = new Set<string>();
  const open = (at: Square) => !taken.has(`${at.x},${at.y}`) && isOpen(at);

  const claim = (id: string, at: Square) => {
    placed.set(id, at);
    taken.add(`${at.x},${at.y}`);
  };

  /** Walk a lazy list of squares, seating each id on the next open one. */
  const seat = (ids: string[], squares: Iterable<Square>) => {
    const rest = [...ids];
    for (const at of squares) {
      if (!rest.length) break;
      if (open(at)) claim(rest.shift()!, at);
    }
    return rest; // whoever found no seat
  };

  const rooms = dungeon.rooms;

  if (rooms.length === 0) {
    // The blank canvas: opposite corners of whatever floor is painted.
    seat(monsterIds, gridSquares(dungeon.width, dungeon.height, true));
    seat(partyIds, gridSquares(dungeon.width, dungeon.height, false));
    return placed;
  }

  if (rooms.length === 1) {
    // One room, opposite ends: still never nose to nose on square one.
    seat(monsterIds, roomSquaresReversed(rooms[0]));
    seat(partyIds, roomSquares(rooms[0]));
    return placed;
  }

  // The party into room 1, overflowing down the corridor chain if it must.
  let partyLeft = [...partyIds];
  for (const room of rooms) {
    if (!partyLeft.length) break;
    partyLeft = seat(partyLeft, roomSquares(room));
  }

  // The monsters, round-robin over the other rooms, farthest first. Each
  // room keeps a cursor over its own squares; a room that fills leaves the
  // ring rather than stalling it.
  const ring = rooms
    .slice(1)
    .sort((a, b) => roomDistance(b, rooms[0]) - roomDistance(a, rooms[0]))
    .map((room) => {
      const walk = roomSquares(room);
      return () => {
        for (let step = walk.next(); !step.done; step = walk.next()) {
          if (open(step.value)) return step.value;
        }
        return null;
      };
    });

  let monstersLeft: string[] = [];
  let ringIndex = 0;
  for (const id of monsterIds) {
    let seated = false;
    while (ring.length > 0 && !seated) {
      const cursor = ring[ringIndex % ring.length];
      const at = cursor();
      if (at) {
        claim(id, at);
        ringIndex++;
        seated = true;
      } else {
        ring.splice(ringIndex % ring.length, 1);
      }
    }
    if (!seated) monstersLeft.push(id);
  }

  // Every room full: anywhere open on the grid. Nothing open: unplaced.
  if (monstersLeft.length) {
    monstersLeft = seat(monstersLeft, gridSquares(dungeon.width, dungeon.height, true));
  }

  return placed;
}
