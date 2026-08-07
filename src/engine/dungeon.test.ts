import { describe, expect, it } from 'vitest';
import {
  corridorSquares,
  generateDungeon,
  makeRng,
  randomSeed,
  seedFrom,
} from './dungeon';
import type { Dungeon, Room } from './dungeon';

/**
 * The dungeon generator.
 *
 * "It generates a dungeon" is otherwise a thing you can only look at, which is
 * why the whole design is seeded: given a seed the output is a fixed value, so
 * the properties that make a map usable can be asserted rather than eyeballed.
 *
 * The properties, not the output. Pinning the exact rectangles would fail on
 * any change to the generator and say nothing about whether the change was an
 * improvement; what has to hold is that rooms do not overlap, every room is
 * reachable, and every door is in a wall.
 */

const inside = (room: Room, x: number, y: number) =>
  x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h;

const overlaps = (a: Room, b: Room) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const SEEDS = ['k7f3m2q1', 'sunken abbey', 'a', '', 'ZZZ', '12345678', 'the tomb of horrors'];

describe('the random number generator', () => {
  it('is a function of its seed and nothing else', () => {
    const a = makeRng(12345);
    const b = makeRng(12345);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('stays inside [0, 1)', () => {
    // The `>>> 0` in there is load-bearing: without it half the values come out
    // negative, and every "35% to 65%" split becomes nonsense.
    const rng = makeRng(seedFrom('spread'));
    for (let i = 0; i < 5000; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('turns any text into a seed, including nothing', () => {
    expect(seedFrom('sunken abbey')).toBe(seedFrom('sunken abbey'));
    expect(seedFrom('sunken abbey')).not.toBe(seedFrom('sunken abbeys'));
    expect(Number.isFinite(seedFrom(''))).toBe(true);
  });

  it('offers a short seed worth writing down', () => {
    const seed = randomSeed();
    expect(seed.length).toBeLessThanOrEqual(8);
    expect(seed).toMatch(/^[0-9a-z]+$/);
  });
});

describe('the same seed gives the same dungeon', () => {
  it('is identical run to run', () => {
    // The point of the whole design: a DM writes the seed in their notes and
    // gets the map back next week, and a share link carries eight characters
    // rather than a picture.
    for (const seed of SEEDS) {
      expect(generateDungeon(seed)).toEqual(generateDungeon(seed));
    }
  });

  it('gives different seeds different dungeons', () => {
    const shapes = SEEDS.map((seed) => JSON.stringify(generateDungeon(seed).rooms));
    expect(new Set(shapes).size).toBe(SEEDS.length);
  });

  it('takes a size, and the size is honoured', () => {
    const small = generateDungeon('k7f3m2q1', { width: 24, height: 20, rooms: 4 });
    expect(small.width).toBe(24);
    for (const room of small.rooms) {
      expect(room.x + room.w).toBeLessThanOrEqual(24);
      expect(room.y + room.h).toBeLessThanOrEqual(20);
    }
  });
});

describe('what makes a map usable', () => {
  const maps = SEEDS.map((seed) => generateDungeon(seed));

  it('puts every room inside the map', () => {
    for (const map of maps) {
      for (const room of map.rooms) {
        expect(room.x, map.seed).toBeGreaterThanOrEqual(0);
        expect(room.y, map.seed).toBeGreaterThanOrEqual(0);
        expect(room.x + room.w, map.seed).toBeLessThanOrEqual(map.width);
        expect(room.y + room.h, map.seed).toBeLessThanOrEqual(map.height);
      }
    }
  });

  it('never overlaps two rooms', () => {
    // The partition guarantees it, and the inset by one is what stops two rooms
    // sharing a wall - which is what makes a corridor between them mean
    // something rather than being a doorway drawn twice.
    for (const map of maps) {
      for (let i = 0; i < map.rooms.length; i++) {
        for (let j = i + 1; j < map.rooms.length; j++) {
          expect(overlaps(map.rooms[i], map.rooms[j]), `${map.seed}: ${i} and ${j}`).toBe(false);
        }
      }
    }
  });

  it('gives every room a size worth walking into', () => {
    for (const map of maps) {
      for (const room of map.rooms) {
        expect(room.w, map.seed).toBeGreaterThanOrEqual(3);
        expect(room.h, map.seed).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('numbers the rooms 1 upward in the order they are laid out', () => {
    // So "the third room on the left" is a thing a DM can say and a player can
    // find on the printed page.
    for (const map of maps) {
      expect(map.rooms.map((r) => r.id)).toEqual(map.rooms.map((_, i) => i + 1));
    }
  });

  it('connects every room to the rest', () => {
    /*
      A room nothing reaches is a bug you only notice at the table. The
      corridors form a chain over the rooms sorted by position, so walking the
      corridor graph has to touch all of them.
    */
    for (const map of maps) {
      expect(reachable(map).size, `${map.seed}`).toBe(map.rooms.length);
    }
  });

  it('puts every door in a wall', () => {
    /*
      A door has to be a square *inside* a room whose neighbour along the
      corridor is outside it. The first version marked the square on the far
      side of the boundary on both branches, so every door floated one square
      out in open floor - plausible in a list of coordinates, and obvious the
      moment the map was drawn as text.
    */
    for (const map of maps) {
      for (const door of map.doors) {
        const room = map.rooms.find((r) => inside(r, door.x, door.y));
        expect(room, `${map.seed}: door at ${door.x},${door.y} is in no room`).toBeTruthy();

        const onEdge =
          door.x === room!.x ||
          door.y === room!.y ||
          door.x === room!.x + room!.w - 1 ||
          door.y === room!.y + room!.h - 1;
        expect(onEdge, `${map.seed}: door at ${door.x},${door.y} is not on a wall`).toBe(true);
      }
    }
  });

  it('records each door once, however many corridors meet there', () => {
    for (const map of maps) {
      const keys = map.doors.map((d) => `${d.x},${d.y}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('walks a corridor without repeating the elbow', () => {
    // The corner belongs to both legs. Visiting it twice put a spurious door at
    // every turn before the two walks were merged into one list.
    for (const map of maps) {
      for (const corridor of map.corridors) {
        const squares = corridorSquares(corridor);
        const keys = squares.map((s) => `${s.x},${s.y}`);
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
  });

  it('draws corridors of only horizontal and vertical runs', () => {
    // Diagonal movement through a wall corner is a rules argument nobody wants
    // to have because of a map.
    for (const map of maps) {
      for (const corridor of map.corridors) {
        const squares = corridorSquares(corridor);
        for (let i = 1; i < squares.length; i++) {
          const step =
            Math.abs(squares[i].x - squares[i - 1].x) + Math.abs(squares[i].y - squares[i - 1].y);
          expect(step).toBe(1);
        }
      }
    }
  });
});

/** Which rooms a walk of the corridor graph can get to from the first one. */
function reachable(map: Dungeon): Set<number> {
  const roomAt = (x: number, y: number) => map.rooms.find((r) => inside(r, x, y))?.id;
  const links = new Map<number, Set<number>>();
  for (const room of map.rooms) links.set(room.id, new Set());

  for (const corridor of map.corridors) {
    const touched = new Set<number>();
    for (const square of corridorSquares(corridor)) {
      const id = roomAt(square.x, square.y);
      if (id) touched.add(id);
    }
    for (const a of touched) for (const b of touched) if (a !== b) links.get(a)!.add(b);
  }

  const seen = new Set<number>();
  const queue = [map.rooms[0].id];
  while (queue.length) {
    const id = queue.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of links.get(id) ?? []) queue.push(next);
  }
  return seen;
}

describe('the blank grid', () => {
  it('is what zero rooms means: a canvas for a hand-built map', () => {
    const blank = generateDungeon('anything', { rooms: 0, width: 30, height: 20 });
    expect(blank.rooms).toEqual([]);
    expect(blank.corridors).toEqual([]);
    expect(blank.doors).toEqual([]);
    expect(blank.width).toBe(30);
    expect(blank.height).toBe(20);
  });
});
