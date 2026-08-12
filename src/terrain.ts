import type { Square } from './encounter';

/**
 * What a square has in it besides floor.
 *
 * Terrain lives on the **encounter**, not on the dungeon: the dungeon is a
 * pure function of its seed and regenerates identical for ever, but a fallen
 * pillar the DM painted in is a fact about *this* fight, and it has to survive
 * a refresh the same way the tokens do.
 *
 * The kinds fall into three families the rules care about:
 *
 * - **Blocks sight and ground**: a wall, a pillar, a boulder. You cannot stand
 *   there and you cannot see through it. These are what line of sight cuts on.
 * - **Blocks sight only**: a tree. You can stand in its square - people climb
 *   trees and stand under them - but the canopy breaks the sight line.
 * - **Difficult ground**: water, rubble. Costs extra movement at the table;
 *   the map *shows* it rather than policing it, the same choice as monster
 *   movement - a budget the app enforced wrongly would be worse than one the
 *   DM applies by eye.
 *
 * `floor` is the odd one out: it is how a DM *builds*, not decorates. Painted
 * floor is walkable ground outside any generated room, which is what "manual
 * placement of rooms" means on a grid - carve the shape you want, square by
 * square, on a blank map or off the side of a generated one.
 */

export type TerrainKind =
  | 'wall'
  | 'pillar'
  | 'rock'
  | 'tree'
  | 'water'
  | 'rubble'
  | 'floor';

export interface TerrainInfo {
  kind: TerrainKind;
  label: string;
  /** A sight line crossing this square stops. */
  blocksSight: boolean;
  /** Nobody can stand here. */
  blocksMovement: boolean;
  /** Costs double to cross, by the ordinary rule. Enforced: `entryCost` in
      `engine/path.ts` charges 10 feet for it, so the walk, the glow tiles and
      the click's price all agree. (This said "shown, not enforced" long after
      it stopped being true.) */
  difficult: boolean;
  /**
   * Deep enough that crossing it is swimming, not wading.
   *
   * §65, and a separate flag from `difficult` rather than a stronger version
   * of it, because the two are waived by different things: a Ring of Swimming
   * answers this and does nothing at all about rubble. Water was `difficult`
   * alone until §65, which meant a Water Genasi with a permanent swim speed
   * paid the same ten feet a Dwarf in plate did.
   */
  swim?: boolean;
}

export const TERRAIN: TerrainInfo[] = [
  { kind: 'wall', label: 'Wall', blocksSight: true, blocksMovement: true, difficult: false },
  { kind: 'pillar', label: 'Pillar', blocksSight: true, blocksMovement: true, difficult: false },
  { kind: 'rock', label: 'Rock', blocksSight: true, blocksMovement: true, difficult: false },
  { kind: 'tree', label: 'Tree', blocksSight: true, blocksMovement: false, difficult: true },
  /*
    Water carries `swim` and *not* `difficult`, which looks like a downgrade
    and is not: both cost ten feet to a creature that cannot swim, and the
    difference only shows for one that can. Marking it both would have made a
    swim speed worth nothing here, since the difficult half nothing waives
    would still be charged.
  */
  { kind: 'water', label: 'Water', blocksSight: false, blocksMovement: false, difficult: false, swim: true },
  { kind: 'rubble', label: 'Rubble', blocksSight: false, blocksMovement: false, difficult: true },
  { kind: 'floor', label: 'Floor', blocksSight: false, blocksMovement: false, difficult: false },
];

export const TERRAIN_BY_KIND: Record<TerrainKind, TerrainInfo> = Object.fromEntries(
  TERRAIN.map((t) => [t.kind, t]),
) as Record<TerrainKind, TerrainInfo>;

const KINDS = new Set<string>(TERRAIN.map((t) => t.kind));

/** Storage keys terrain by square, `"x,y"`, so a map is one flat object. */
export const keyOf = (at: Square): string => `${at.x},${at.y}`;

export const squareOf = (key: string): Square => {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
};

export type TerrainMap = Record<string, TerrainKind>;

/** Paint a square, or erase it with null. Painting the same kind twice erases -
 * a brush that toggles needs no separate eraser for the common fix. */
export function paint(terrain: TerrainMap, at: Square, kind: TerrainKind | null): TerrainMap {
  const key = keyOf(at);
  if (kind === null || terrain[key] === kind) {
    if (!(key in terrain)) return terrain;
    const next = { ...terrain };
    delete next[key];
    return next;
  }
  return { ...terrain, [key]: kind };
}

/**
 * A stored terrain map, made safe to render.
 *
 * Same discipline as every other thing read from storage at start-up: a key
 * that is not a coordinate or a kind that no longer exists is dropped rather
 * than crashing the map on every load.
 */
export function hydrateTerrain(parsed: unknown): TerrainMap | undefined {
  if (!parsed || typeof parsed !== 'object') return undefined;
  const out: TerrainMap = {};
  for (const [key, kind] of Object.entries(parsed as Record<string, unknown>)) {
    if (!/^-?\d+,-?\d+$/.test(key)) continue;
    if (typeof kind !== 'string' || !KINDS.has(kind)) continue;
    out[key] = kind as TerrainKind;
  }
  return Object.keys(out).length ? out : undefined;
}

export const blocksSightAt = (terrain: TerrainMap, at: Square): boolean => {
  const kind = terrain[keyOf(at)];
  return kind ? TERRAIN_BY_KIND[kind].blocksSight : false;
};

// ------------------------------------------------------------------- height

/**
 * Z, in steps.
 *
 * A square's elevation, in abstract steps rather than feet: a ledge is +1, a
 * pit is -1, a tower top is +3. Steps rather than feet because that is how a
 * DM talks about a battlefield - "the archers are one level up" - and because
 * five-foot increments would invite precision the rest of the map does not
 * have. Call a step 5 or 10 feet at the table; the map does not care.
 *
 * Its own layer rather than a terrain kind, because height is orthogonal to
 * what is *on* the square: a tree grows on a ledge, water pools in a pit.
 * Level 0 is the floor and is never stored - an empty map is flat.
 */
export type ElevationMap = Record<string, number>;

export const ELEVATION_MIN = -3;
export const ELEVATION_MAX = 8;

export const elevationAt = (elevation: ElevationMap, at: Square): number =>
  elevation[keyOf(at)] ?? 0;

/** Step a square up or down. Zero is the floor and leaves the map. */
export function step(elevation: ElevationMap, at: Square, delta: 1 | -1): ElevationMap {
  const key = keyOf(at);
  const next = Math.max(ELEVATION_MIN, Math.min(ELEVATION_MAX, (elevation[key] ?? 0) + delta));
  if (next === 0) {
    if (!(key in elevation)) return elevation;
    const out = { ...elevation };
    delete out[key];
    return out;
  }
  return { ...elevation, [key]: next };
}

/** Same discipline as `hydrateTerrain`: read at start-up, so validate or drop. */
export function hydrateElevation(parsed: unknown): ElevationMap | undefined {
  if (!parsed || typeof parsed !== 'object') return undefined;
  const out: ElevationMap = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!/^-?\d+,-?\d+$/.test(key)) continue;
    const level = Number(value);
    if (!Number.isInteger(level) || level === 0) continue;
    out[key] = Math.max(ELEVATION_MIN, Math.min(ELEVATION_MAX, level));
  }
  return Object.keys(out).length ? out : undefined;
}
