/**
 * A dungeon, from a seed.
 *
 * Pure, deterministic and small: the same seed gives the same map on every
 * machine, for ever. That is the whole design constraint, and it buys three
 * things at once. A DM can write `k7f3m2q1` in their notes and get the map back
 * next week. A map travels in a share link as eight characters rather than as
 * a picture. And it is testable, because "generates a dungeon" is otherwise a
 * thing you can only look at.
 *
 * The generator is the classic one - binary space partition, a room in each
 * leaf, corridors joining siblings - chosen because it produces rooms that read
 * as *rooms*, which is what a DM is going to describe out loud. Cellular
 * automata make prettier caves and worse dungeons: you cannot say "you are in
 * the third room on the left" about a blob.
 */

// ------------------------------------------------------------------- the rng

/**
 * xorshift32. Thirty lines of Mersenne Twister would buy nothing here - this
 * needs to be reproducible and cheap, not cryptographic, and `Math.random`
 * cannot be seeded at all.
 */
export function makeRng(seed: number): () => number {
  let state = seed | 0 || 0x2545f491;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    // `>>> 0` back to unsigned before dividing, or half the values are negative.
    return (state >>> 0) / 0x100000000;
  };
}

/**
 * A seed string to a number. Any text works, so a DM can seed a map on the name
 * of the place - "the sunken abbey" is a better thing to write down than a
 * number, and it is one fewer thing to lose.
 */
export function seedFrom(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A short, readable seed to show and to put in a link. */
export function randomSeed(): string {
  return Math.floor(Math.random() * 0x100000000).toString(36).padStart(6, '0').slice(0, 8);
}

// ------------------------------------------------------------------ the shape

export interface Room {
  /** 1-based, in the order a corridor walk reaches them, so "room 3" means one. */
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Corridor {
  /** An L, as two segments. Straight corridors have a zero-length second leg. */
  points: { x: number; y: number }[];
}

export interface Door {
  x: number;
  y: number;
}

export interface Dungeon {
  seed: string;
  width: number;
  height: number;
  rooms: Room[];
  corridors: Corridor[];
  doors: Door[];
}

export interface DungeonOptions {
  /** In grid squares, each one 5 feet. */
  width?: number;
  height?: number;
  /** Roughly how many rooms. The partition decides the exact number. */
  rooms?: number;
}

const DEFAULTS = { width: 48, height: 36, rooms: 8 };

/**
 * The seed the app wakes up with. Fixed rather than random, so the map does
 * not change under a DM who reloads the page - and so two people opening the
 * app cold see the same thing when they are talking about it.
 */
export const DEFAULT_SEED = 'first light';

/** In grid squares, each one 5 feet - so Large is 320 by 240 feet of ground. */
export const MAP_SIZES = {
  small: { width: 36, height: 27 },
  medium: { width: 48, height: 36 },
  large: { width: 64, height: 48 },
} as const;

export type MapSize = keyof typeof MAP_SIZES;

/** The smallest a leaf can be and still hold a room worth walking into. */
const MIN_LEAF = 8;
const MIN_ROOM = 3;

interface Leaf {
  x: number;
  y: number;
  w: number;
  h: number;
  left?: Leaf;
  right?: Leaf;
  room?: Room;
}

/**
 * Split a leaf in two, along its longer axis.
 *
 * Splitting the longer side is what keeps rooms from coming out as slivers: a
 * region twice as wide as it is tall gets cut vertically, so both halves move
 * back toward square. Below `MIN_LEAF * 2` there is no room for two rooms, so
 * the leaf stays whole.
 */
function split(leaf: Leaf, rng: () => number): boolean {
  if (leaf.left || leaf.right) return false;

  const horizontal = leaf.h > leaf.w;
  const extent = horizontal ? leaf.h : leaf.w;
  if (extent < MIN_LEAF * 2) return false;

  // Cut between 35% and 65%, so the halves differ without either being a strip.
  const at = Math.floor(extent * (0.35 + rng() * 0.3));

  if (horizontal) {
    leaf.left = { x: leaf.x, y: leaf.y, w: leaf.w, h: at };
    leaf.right = { x: leaf.x, y: leaf.y + at, w: leaf.w, h: leaf.h - at };
  } else {
    leaf.left = { x: leaf.x, y: leaf.y, w: at, h: leaf.h };
    leaf.right = { x: leaf.x + at, y: leaf.y, w: leaf.w - at, h: leaf.h };
  }
  return true;
}

const leaves = (leaf: Leaf): Leaf[] =>
  leaf.left && leaf.right ? [...leaves(leaf.left), ...leaves(leaf.right)] : [leaf];

const centre = (room: Room) => ({
  x: Math.floor(room.x + room.w / 2),
  y: Math.floor(room.y + room.h / 2),
});

/**
 * Join two points with an L, going one way then the other.
 *
 * Which way first is decided by the rng rather than fixed, because a map where
 * every corridor leaves horizontally reads as generated. The elbow is the
 * corner point, and the two straight cases collapse to it harmlessly.
 */
function connect(a: { x: number; y: number }, b: { x: number; y: number }, rng: () => number): Corridor {
  const elbow = rng() < 0.5 ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  return { points: [a, elbow, b] };
}

/**
 * Every square a corridor covers, in order, from its two segments.
 *
 * One list rather than two walks: the elbow belongs to both legs and would
 * otherwise be visited twice, which put a spurious door at every corner.
 */
export function corridorSquares(corridor: Corridor): { x: number; y: number }[] {
  const squares: { x: number; y: number }[] = [];
  const [a, elbow, b] = corridor.points;

  for (const [from, to] of [
    [a, elbow],
    [elbow, b],
  ]) {
    const steps = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
    const dx = Math.sign(to.x - from.x);
    const dy = Math.sign(to.y - from.y);
    for (let i = 0; i <= steps; i++) {
      const square = { x: from.x + dx * i, y: from.y + dy * i };
      const last = squares[squares.length - 1];
      if (!last || last.x !== square.x || last.y !== square.y) squares.push(square);
    }
  }
  return squares;
}

/**
 * Where a corridor meets a room.
 *
 * A door is **always on a square inside a room** - the threshold square, the
 * one whose neighbour along the corridor is outside. The first attempt marked
 * the square on the far side of the boundary instead, on both the entering and
 * the leaving branch, which put every door one square out into open floor. It
 * looked plausible in a list and was obvious the moment the map was drawn as
 * text: doors floating in corridors with no wall near them.
 *
 * That is what `everyDoorIsOnARoomEdge` in the tests now pins.
 */
function doorsFor(rooms: Room[], corridor: Corridor): Door[] {
  const squares = corridorSquares(corridor);
  const found: Door[] = [];

  for (let i = 0; i < squares.length; i++) {
    if (!insideAny(rooms, squares[i].x, squares[i].y)) continue;
    const before = squares[i - 1];
    const after = squares[i + 1];
    const opensOut =
      (before && !insideAny(rooms, before.x, before.y)) ||
      (after && !insideAny(rooms, after.x, after.y));
    if (opensOut) found.push(squares[i]);
  }
  return found;
}

/** Two corridors can meet a room at the same square; it is still one door. */
function dedupe(doors: Door[]): Door[] {
  const seen = new Set<string>();
  return doors.filter((door) => {
    const key = `${door.x},${door.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const insideAny = (rooms: Room[], x: number, y: number) =>
  rooms.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);

export function generateDungeon(seed: string, options: DungeonOptions = {}): Dungeon {
  const width = options.width ?? DEFAULTS.width;
  const height = options.height ?? DEFAULTS.height;

  /*
    Zero rooms is a blank grid, on purpose: the canvas for a hand-built map.
    Terrain painting can carve floor and walls square by square, and a DM who
    wants to lay their own rooms out needs somewhere with none already on it.
  */
  if (options.rooms === 0) {
    return { seed, width, height, rooms: [], corridors: [], doors: [] };
  }

  const target = Math.max(2, options.rooms ?? DEFAULTS.rooms);
  const rng = makeRng(seedFrom(seed));

  // Partition until there are enough leaves to hold the rooms asked for.
  const root: Leaf = { x: 0, y: 0, w: width, h: height };
  let open = [root];
  while (open.length < target) {
    // Split the largest leaf, so the rooms end up a similar size rather than
    // one hall and a warren.
    const biggest = [...open].sort((a, b) => b.w * b.h - a.w * a.h)[0];
    if (!split(biggest, rng)) break;
    open = leaves(root);
  }

  const rooms: Room[] = [];
  for (const leaf of leaves(root)) {
    // Inset by one so neighbouring rooms never share a wall, which is what
    // makes a corridor between them meaningful.
    const maxW = leaf.w - 2;
    const maxH = leaf.h - 2;
    if (maxW < MIN_ROOM || maxH < MIN_ROOM) continue;

    const w = MIN_ROOM + Math.floor(rng() * (maxW - MIN_ROOM + 1));
    const h = MIN_ROOM + Math.floor(rng() * (maxH - MIN_ROOM + 1));
    const x = leaf.x + 1 + Math.floor(rng() * (maxW - w + 1));
    const y = leaf.y + 1 + Math.floor(rng() * (maxH - h + 1));
    rooms.push({ id: rooms.length + 1, x, y, w, h });
  }

  /*
    Join them in a chain rather than by tree sibling.

    A BSP tree joins siblings, which is tidy and produces a map where two rooms
    can be adjacent on screen and twenty squares apart to walk. Sorting by
    position and joining neighbours gives a dungeon you can describe as a route,
    which is what a DM narrates.
  */
  const order = [...rooms].sort((a, b) => a.x - b.x || a.y - b.y);
  order.forEach((room, i) => {
    room.id = i + 1;
  });

  const corridors: Corridor[] = [];
  for (let i = 1; i < order.length; i++) {
    corridors.push(connect(centre(order[i - 1]), centre(order[i]), rng));
  }

  const doors = dedupe(corridors.flatMap((corridor) => doorsFor(rooms, corridor)));

  return { seed, width, height, rooms: order, corridors, doors };
}
