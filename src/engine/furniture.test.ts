import { describe, expect, it } from 'vitest';
import {
  doorAt,
  hydrateFurniture,
  isSecret,
  revealRoom,
  roomAt,
  secretRooms,
  seen,
  springTraps,
  toggleHidden,
  toggleTrap,
  trapAt,
  trapSaid,
  trapsOn,
} from './furniture';
import type { FurnitureState } from './furniture';
import { cycleDoor, dungeonFrom, generateDungeon, hydrateLayout, layoutOf } from './dungeon';
import type { Dungeon, DungeonLayout } from './dungeon';

/**
 * §81. The furniture rules, which are mostly one rule: a secret room is not
 * *drawn faintly*, it is absent, and absent everywhere at once.
 */

/** Two rooms side by side on a small grid, the second one secret. */
const twoRooms = (): Dungeon => ({
  seed: 'x',
  width: 20,
  height: 12,
  rooms: [
    { id: 1, x: 1, y: 1, w: 4, h: 4 },
    { id: 2, x: 10, y: 1, w: 4, h: 4, hidden: true },
  ],
  corridors: [],
  doors: [
    { x: 4, y: 2 },
    { x: 10, y: 2, locked: true },
  ],
  traps: [
    { x: 2, y: 2, note: 'pit, DC 13 Dex' },
    { x: 11, y: 2 },
  ],
});

describe('what the table can see', () => {
  it('takes a secret room out of the architecture entirely', () => {
    const before = twoRooms();
    const after = seen(before);
    expect(after.rooms.map((r) => r.id)).toEqual([1]);
    // Not merely unpainted: the door into it and the trap inside it go too,
    // because a door standing in rock is not a door.
    expect(after.doors).toEqual([{ x: 4, y: 2 }]);
    expect(after.traps.map((t) => t.x)).toEqual([2]);
  });

  it('gives it all back the moment the fight reveals it', () => {
    const after = seen(twoRooms(), [2]);
    expect(after.rooms.map((r) => r.id)).toEqual([1, 2]);
    expect(after.doors).toHaveLength(2);
    expect(after.traps).toHaveLength(2);
  });

  it('is the same object when nothing is hidden - no copy, no churn', () => {
    const plain = generateDungeon('seed', { rooms: 3, width: 30, height: 20 });
    expect(seen(plain)).toBe(plain);
  });

  it('leaves an ordinary room alone however loudly it is revealed', () => {
    const before = twoRooms();
    // Room 1 is not hidden, so "revealing" it changes nothing about it.
    expect(seen(before, [1]).rooms.map((r) => r.id)).toEqual([1]);
  });

  it('lists the secret rooms for the DM, and stops listing a found one', () => {
    const dungeon = twoRooms();
    expect(secretRooms(dungeon).map((r) => r.id)).toEqual([2]);
    expect(secretRooms(dungeon, [2])).toEqual([]);
    expect(isSecret(dungeon.rooms[1], [2])).toBe(false);
  });
});

describe('finding what stands on a square', () => {
  it('answers rooms, doors and traps by square', () => {
    const dungeon = twoRooms();
    expect(roomAt(dungeon.rooms, { x: 2, y: 2 })?.id).toBe(1);
    expect(roomAt(dungeon.rooms, { x: 8, y: 8 })).toBeUndefined();
    expect(doorAt(dungeon, { x: 10, y: 2 })?.locked).toBe(true);
    expect(doorAt(dungeon, { x: 4, y: 2 })?.locked).toBeUndefined();
    expect(trapAt(dungeon, { x: 2, y: 2 })?.note).toMatch(/pit/);
  });

  it('gives an overlap to the room drawn last, as the ground does', () => {
    // §73 allows overlapping rooms on purpose - an L-shaped hall is two
    // strokes - so "which room is this" has to have one answer.
    const rooms = [
      { id: 1, x: 0, y: 0, w: 5, h: 5 },
      { id: 2, x: 3, y: 3, w: 5, h: 5, hidden: true },
    ];
    expect(roomAt(rooms, { x: 4, y: 4 })?.id).toBe(2);
  });
});

describe('traps under a walk', () => {
  const dungeon = twoRooms();

  it('fires for a trap the route crosses', () => {
    const route = [
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
    ];
    expect(trapsOn(dungeon, route).map((t) => t.x)).toEqual([2]);
  });

  it('does not fire for the square the walk started on', () => {
    // Standing on a trap you already sprang and stepping off it is not a
    // second trap.
    const route = [
      { x: 2, y: 2 },
      { x: 3, y: 2 },
    ];
    expect(trapsOn(dungeon, route)).toEqual([]);
  });

  it('does not fire twice for one already sprung', () => {
    const route = [
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ];
    expect(trapsOn(dungeon, route, ['2,2'])).toEqual([]);
  });

  it('says the DM’s own words, and something plain without them', () => {
    expect(trapSaid({ x: 0, y: 0, note: 'scything blade' }, 'Ana')).toBe(
      'Ana sets off a trap: scything blade',
    );
    expect(trapSaid({ x: 0, y: 0 }, 'Ana')).toBe('Ana sets off a trap!');
    // Whitespace is not a note.
    expect(trapSaid({ x: 0, y: 0, note: '   ' }, 'Ana')).toBe('Ana sets off a trap!');
  });
});

describe('what the fight remembers', () => {
  it('reveals a room once and stays put on a second try', () => {
    const once = revealRoom<FurnitureState>({}, 2);
    expect(once.revealed).toEqual([2]);
    expect(revealRoom(once, 2)).toBe(once);
  });

  it('marks traps sprung by square, and only the new ones', () => {
    const first = springTraps<FurnitureState>({}, [{ x: 2, y: 2 }]);
    expect(first.sprung).toEqual(['2,2']);
    expect(springTraps(first, [{ x: 2, y: 2 }])).toBe(first);
    expect(springTraps(first, [{ x: 3, y: 4 }]).sprung).toEqual(['2,2', '3,4']);
    expect(springTraps(first, [])).toBe(first);
  });

  it('keeps the state off the map, so the dungeon stays reusable', () => {
    // The point of the split: a revealed room is a fact about this party's
    // afternoon. The saved architecture still hides it.
    const dungeon = twoRooms();
    const state = revealRoom<FurnitureState>({}, 2);
    expect(seen(dungeon, state.revealed).rooms).toHaveLength(2);
    expect(dungeon.rooms[1].hidden).toBe(true);
  });

  it('hydrates only numbers and strings, and nothing from an empty fight', () => {
    expect(hydrateFurniture(undefined)).toEqual({ revealed: undefined, sprung: undefined });
    expect(hydrateFurniture({ revealed: [1, 'two', null, 3], sprung: ['2,2', 7] })).toEqual({
      revealed: [1, 3],
      sprung: ['2,2'],
    });
    expect(hydrateFurniture({ revealed: 'all' })).toEqual({
      revealed: undefined,
      sprung: undefined,
    });
  });
});

describe('authoring furniture', () => {
  const layout = (): DungeonLayout => ({
    rooms: [{ id: 1, x: 1, y: 1, w: 4, h: 4 }],
    corridors: [],
    doors: [],
  });

  it('cycles a door through none, door, locked and back to none (§81)', () => {
    // §73 shipped this as a two-state toggle; the lock is a property of the
    // door, so the tool that makes a door is the one that bars it.
    const one = cycleDoor(layout(), { x: 2, y: 2 });
    expect(one.doors).toEqual([{ x: 2, y: 2 }]);
    const two = cycleDoor(one, { x: 2, y: 2 });
    expect(two.doors).toEqual([{ x: 2, y: 2, locked: true }]);
    expect(cycleDoor(two, { x: 2, y: 2 }).doors).toEqual([]);
  });

  it('still refuses a door outside a room', () => {
    expect(cycleDoor(layout(), { x: 9, y: 9 }).doors).toEqual([]);
  });

  it('hides and unhides the room under the click', () => {
    const hidden = toggleHidden(layout(), { x: 2, y: 2 });
    expect(hidden.rooms[0].hidden).toBe(true);
    expect(toggleHidden(hidden, { x: 2, y: 2 }).rooms[0].hidden).toBeUndefined();
    // Nothing under the click, nothing to hide.
    expect(toggleHidden(layout(), { x: 9, y: 9 })).toEqual(layout());
  });

  it('places a trap anywhere, unlike a door', () => {
    // A pit in a corridor is the classic one, and a blank grid has no rooms.
    const trapped = toggleTrap(layout(), { x: 9, y: 9 }, ' pit ');
    expect(trapped.traps).toEqual([{ x: 9, y: 9, note: 'pit' }]);
    expect(toggleTrap(trapped, { x: 9, y: 9 }).traps).toEqual([]);
    // An empty note is no note rather than an empty string.
    expect(toggleTrap(layout(), { x: 1, y: 1 }, '  ').traps).toEqual([{ x: 1, y: 1 }]);
  });
});

describe('furniture survives the round trip', () => {
  it('is carried by layoutOf, dungeonFrom and hydrateLayout', () => {
    let built: DungeonLayout = { rooms: [], corridors: [], doors: [] };
    built = { ...built, rooms: [{ id: 1, x: 1, y: 1, w: 4, h: 4 }] };
    built = cycleDoor(cycleDoor(built, { x: 2, y: 2 }), { x: 2, y: 2 });
    built = toggleHidden(built, { x: 3, y: 3 });
    built = toggleTrap(built, { x: 2, y: 3 }, 'dart');

    const dungeon = dungeonFrom('seed', 'small', 4, built);
    expect(dungeon.rooms[0].hidden).toBe(true);
    expect(dungeon.doors[0].locked).toBe(true);
    expect(dungeon.traps).toEqual([{ x: 2, y: 3, note: 'dart' }]);

    // Through storage and back.
    const stored = JSON.parse(JSON.stringify(layoutOf(dungeon)));
    const back = hydrateLayout(stored);
    expect(back?.rooms[0].hidden).toBe(true);
    expect(back?.doors[0].locked).toBe(true);
    expect(back?.traps).toEqual([{ x: 2, y: 3, note: 'dart' }]);
  });

  it('believes a stored flag only when it is really true', () => {
    const back = hydrateLayout({
      rooms: [{ id: 1, x: 0, y: 0, w: 2, h: 2, hidden: 'yes' }],
      corridors: [],
      doors: [{ x: 0, y: 0, locked: 1 }],
      traps: [{ x: 0, y: 1, note: 42 }, { x: 'x', y: 0 }],
    });
    expect(back?.rooms[0].hidden).toBeUndefined();
    expect(back?.doors[0].locked).toBeUndefined();
    expect(back?.traps).toEqual([{ x: 0, y: 1, note: undefined }]);
  });

  it('gives a layout written before §81 an empty trap list', () => {
    const dungeon = dungeonFrom('seed', 'small', 4, {
      rooms: [{ id: 1, x: 1, y: 1, w: 3, h: 3 }],
      corridors: [],
      doors: [],
    });
    expect(dungeon.traps).toEqual([]);
    expect(seen(dungeon).traps).toEqual([]);
  });
});
