import { describe, expect, it } from 'vitest';
import { planDeployment } from './deploy';
import { generateDungeon } from './dungeon';
import type { Dungeon, Room } from './dungeon';

/**
 * The deployment plan: the party in room 1, the monsters anywhere else.
 *
 * The user's complaint was blunt - "monsters and players should not start
 * all in same room" - and these pin the promise from every side: separation,
 * spread, no stacking, and the degenerate maps (one room, no rooms) where
 * "another room" does not exist and opposite corners have to do.
 */

const inRoom = (room: Room, at: { x: number; y: number }) =>
  at.x >= room.x && at.x < room.x + room.w && at.y >= room.y && at.y < room.y + room.h;

const openEverywhere = () => true;

/** A hand-laid dungeon: three rooms on a row, so distances are legible. */
const threeRooms = (): Dungeon => ({
  seed: 'test',
  width: 40,
  height: 12,
  rooms: [
    { id: 1, x: 1, y: 1, w: 4, h: 4 },
    { id: 2, x: 14, y: 1, w: 4, h: 4 },
    { id: 3, x: 30, y: 1, w: 4, h: 4 },
  ],
  corridors: [],
  doors: [],
});

describe('the party and the monsters part ways', () => {
  it('seats the party in room 1 and every monster somewhere else', () => {
    const dungeon = generateDungeon('first light', { rooms: 8 });
    const plan = planDeployment(
      dungeon,
      openEverywhere,
      ['a', 'b', 'c'],
      ['m1', 'm2', 'm3', 'm4'],
    );

    for (const id of ['a', 'b', 'c']) {
      expect(inRoom(dungeon.rooms[0], plan.get(id)!)).toBe(true);
    }
    for (const id of ['m1', 'm2', 'm3', 'm4']) {
      expect(inRoom(dungeon.rooms[0], plan.get(id)!)).toBe(false);
    }
  });

  it('never seats two bodies on one square', () => {
    const dungeon = generateDungeon('first light', { rooms: 8 });
    const plan = planDeployment(
      dungeon,
      openEverywhere,
      ['a', 'b', 'c', 'd', 'e'],
      ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'],
    );
    const squares = [...plan.values()].map((at) => `${at.x},${at.y}`);
    expect(new Set(squares).size).toBe(squares.length);
  });

  it('sends the first monster to the farthest room and spreads the rest', () => {
    const dungeon = threeRooms();
    const plan = planDeployment(dungeon, openEverywhere, ['a'], ['m1', 'm2', 'm3']);

    // Room 3 is farthest from room 1; the round-robin's first stop.
    expect(inRoom(dungeon.rooms[2], plan.get('m1')!)).toBe(true);
    expect(inRoom(dungeon.rooms[1], plan.get('m2')!)).toBe(true);
    // Third monster wraps back around the ring.
    expect(inRoom(dungeon.rooms[2], plan.get('m3')!)).toBe(true);
  });

  it('skips squares the caller says are closed', () => {
    const dungeon = threeRooms();
    const room = dungeon.rooms[0];
    // The room's first square is a boulder.
    const blocked = `${room.x},${room.y}`;
    const plan = planDeployment(
      dungeon,
      (at) => `${at.x},${at.y}` !== blocked,
      ['a'],
      [],
    );
    const at = plan.get('a')!;
    expect(`${at.x},${at.y}`).not.toBe(blocked);
    expect(inRoom(room, at)).toBe(true);
  });

  it('leaves the surplus unplaced rather than stacking it', () => {
    // A dungeon of two 1x1 closets: one seat each side.
    const dungeon: Dungeon = {
      seed: 'tiny',
      width: 6,
      height: 4,
      rooms: [
        { id: 1, x: 1, y: 1, w: 1, h: 1 },
        { id: 2, x: 4, y: 1, w: 1, h: 1 },
      ],
      corridors: [],
      doors: [],
    };
    // Nothing outside the two rooms is open, so overflow has nowhere to go.
    const insideEither = (at: { x: number; y: number }) =>
      dungeon.rooms.some((r) => inRoom(r, at));
    const plan = planDeployment(dungeon, insideEither, ['a', 'b'], ['m1', 'm2']);
    expect(plan.size).toBe(2);
    const squares = [...plan.values()].map((at) => `${at.x},${at.y}`);
    expect(new Set(squares).size).toBe(squares.length);
  });
});

describe('the degenerate maps', () => {
  it('one room: party at the top-left, monsters at the bottom-right', () => {
    const dungeon: Dungeon = {
      seed: 'hall',
      width: 20,
      height: 20,
      rooms: [{ id: 1, x: 2, y: 2, w: 6, h: 6 }],
      corridors: [],
      doors: [],
    };
    const plan = planDeployment(dungeon, openEverywhere, ['a'], ['m1']);
    expect(plan.get('a')).toEqual({ x: 2, y: 2 });
    expect(plan.get('m1')).toEqual({ x: 7, y: 7 });
  });

  it('no rooms: opposite corners of the blank canvas', () => {
    const dungeon = generateDungeon('blank', { rooms: 0, width: 12, height: 10 });
    const plan = planDeployment(dungeon, openEverywhere, ['a'], ['m1']);
    expect(plan.get('a')).toEqual({ x: 1, y: 1 });
    expect(plan.get('m1')).toEqual({ x: 10, y: 8 });
  });
});
