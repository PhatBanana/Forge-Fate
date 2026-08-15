import type { Square } from '../encounter';
import type { Dungeon, DungeonLayout, Room, Trap } from './dungeon';

/**
 * The furniture a dungeon carries: locked doors, hidden rooms, traps.
 *
 * ## Why this is one module and not three fields
 *
 * The three were asked for together and designed together in ROADMAP, and
 * they share the one problem that kept them out of §73 with the rest of the
 * editable architecture: **the battle screen is a single screen that both
 * sides of the table look at.** "The players cannot see this yet" has to
 * mean something concrete when the thing not to be seen is drawn on a board
 * everyone is leaning over. Each answers it differently, and the differences
 * are the design:
 *
 * - A **locked door** has no reveal problem at all. Everyone can see a door
 *   is barred; whether it opens is a ruling. It is drawn and nothing else.
 * - A **hidden room** cannot be drawn faintly, because faint is still seen.
 *   `seen()` removes it from the architecture outright, so every consumer -
 *   both renderers, `groundCells`, the sight model, the pathing, the
 *   deployment - agrees it is rock, because they are all reading a dungeon
 *   that does not contain it. Revealing is an edit to the *fight*, not to
 *   the map, so the map is still the map next session.
 * - A **trap** is invisible until it is sprung, which is a thing that
 *   happens to a walk. It rides the walk-settlement hook §23's hazards
 *   already use, and springing one is a log line, not a damage roll: see
 *   `Trap` for why the number is the DM's.
 *
 * Everything here is pure. The encounter helpers take a state and return a
 * state, the layout helpers take a layout and return a layout, and the
 * reading helpers answer questions - the same split `dungeon.ts` draws
 * between authoring a layout and generating one.
 */

export const keyOfSquare = (at: { x: number; y: number }): string => `${at.x},${at.y}`;

const on = (thing: { x: number; y: number }, at: { x: number; y: number }): boolean =>
  thing.x === at.x && thing.y === at.y;

const within = (room: Room, at: { x: number; y: number }): boolean =>
  at.x >= room.x && at.x < room.x + room.w && at.y >= room.y && at.y < room.y + room.h;

// ------------------------------------------------------------------ reading

/** The room standing on this square, if any. Later rooms win an overlap. */
export function roomAt(rooms: Room[], at: { x: number; y: number }): Room | undefined {
  return [...rooms].reverse().find((room) => within(room, at));
}

/** Is this room still secret? Hidden *and* not yet revealed by this fight. */
export const isSecret = (room: Room, revealed?: number[]): boolean =>
  !!room.hidden && !(revealed ?? []).includes(room.id);

/**
 * The dungeon as everyone at the table sees it.
 *
 * The one function that resolves hiding, called once where the battle builds
 * its dungeon so that nothing downstream has to know the rule - a renderer
 * that had to remember to skip hidden rooms is a renderer that will forget,
 * and §32.1 already paid for one hit-test disagreeing with one drawing.
 *
 * A secret room takes its doors and its traps with it: a door into a room
 * nobody can see is a door standing in rock, and a trap inside one cannot be
 * stepped on because there is no floor there to step on.
 */
export function seen(dungeon: Dungeon, revealed?: number[]): Dungeon {
  const secret = dungeon.rooms.filter((room) => isSecret(room, revealed));
  if (!secret.length) return dungeon;
  const inSecret = (at: { x: number; y: number }) => secret.some((room) => within(room, at));
  return {
    ...dungeon,
    rooms: dungeon.rooms.filter((room) => !isSecret(room, revealed)),
    doors: dungeon.doors.filter((door) => !inSecret(door)),
    traps: dungeon.traps.filter((trap) => !inSecret(trap)),
  };
}

/** The door on this square, barred or not. */
export const doorAt = (dungeon: Dungeon, at: { x: number; y: number }) =>
  dungeon.doors.find((door) => on(door, at));

/** The trap on this square, sprung or not. */
export const trapAt = (dungeon: Dungeon, at: { x: number; y: number }) =>
  dungeon.traps.find((trap) => on(trap, at));

/** Every secret room, for the DM's own list. Ordered as the rooms are. */
export const secretRooms = (dungeon: Dungeon, revealed?: number[]): Room[] =>
  dungeon.rooms.filter((room) => isSecret(room, revealed));

/**
 * The traps a walk sets off: on the route, and not already sprung.
 *
 * The route's first square is where the walker started, so it is skipped -
 * standing still on a trap you already sprang does not spring it again, and
 * a walk that begins on one has already had its moment.
 */
export function trapsOn(dungeon: Dungeon, route: Square[], sprung?: string[]): Trap[] {
  const already = new Set(sprung ?? []);
  const found: Trap[] = [];
  for (const at of route.slice(1)) {
    const trap = trapAt(dungeon, at);
    if (trap && !already.has(keyOfSquare(trap)) && !found.includes(trap)) found.push(trap);
  }
  return found;
}

/** What a sprung trap says out loud. The note when there is one, plainly. */
export const trapSaid = (trap: Trap, who: string): string =>
  trap.note?.trim()
    ? `${who} sets off a trap: ${trap.note.trim()}`
    : `${who} sets off a trap!`;

// ------------------------------------------------- authoring, on the layout

/** Hide or unhide the room under this square. No room, no change. */
export function toggleHidden(layout: DungeonLayout, at: { x: number; y: number }): DungeonLayout {
  const room = roomAt(layout.rooms, at);
  if (!room) return layout;
  return {
    ...layout,
    rooms: layout.rooms.map((r) => (r === room ? { ...r, hidden: r.hidden ? undefined : true } : r)),
  };
}

/**
 * Place or remove a trap. Unlike a door this is legal anywhere on the grid -
 * a pit in a corridor is the classic one, and a blank hand-painted map has no
 * rooms to be inside of.
 */
export function toggleTrap(
  layout: DungeonLayout,
  at: { x: number; y: number },
  note?: string,
): DungeonLayout {
  const traps = layout.traps ?? [];
  const standing = traps.find((trap) => on(trap, at));
  if (standing) return { ...layout, traps: traps.filter((trap) => trap !== standing) };
  return { ...layout, traps: [...traps, { x: at.x, y: at.y, note: note?.trim() || undefined }] };
}

// --------------------------------------------------------- on the encounter

/**
 * The two facts a *fight* holds about furniture, kept off the map on purpose:
 * which secret rooms this party has found, and which traps they have already
 * set off. Both are true of an afternoon, not of a place - reveal a room and
 * the saved dungeon still hides it for the next party, which is what makes a
 * dungeon reusable.
 */
export interface FurnitureState {
  revealed?: number[];
  sprung?: string[];
}

/** Found. Idempotent: revealing a revealed room is not a change. */
export function revealRoom<T extends FurnitureState>(state: T, roomId: number): T {
  if ((state.revealed ?? []).includes(roomId)) return state;
  return { ...state, revealed: [...(state.revealed ?? []), roomId] };
}

/** Sprung, by square key, so a trap that fires once stays fired. */
export function springTraps<T extends FurnitureState>(state: T, traps: Trap[]): T {
  if (!traps.length) return state;
  const keys = traps.map(keyOfSquare).filter((key) => !(state.sprung ?? []).includes(key));
  if (!keys.length) return state;
  return { ...state, sprung: [...(state.sprung ?? []), ...keys] };
}

/** Stored furniture state, believed only as far as it verifies. */
export function hydrateFurniture(raw: unknown): FurnitureState {
  const state = (raw ?? {}) as Partial<FurnitureState>;
  const revealed = Array.isArray(state.revealed)
    ? state.revealed.filter((id): id is number => typeof id === 'number' && Number.isFinite(id))
    : [];
  const sprung = Array.isArray(state.sprung)
    ? state.sprung.filter((key): key is string => typeof key === 'string')
    : [];
  return {
    revealed: revealed.length ? revealed : undefined,
    sprung: sprung.length ? sprung : undefined,
  };
}
