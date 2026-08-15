import type { Square } from '../encounter';
import { corridorSquares } from './dungeon';
import type { Dungeon } from './dungeon';
import { keyOf, squareOf } from '../terrain';
import type { ElevationMap, TerrainMap } from '../terrain';
import type { Frame } from './camera';

/**
 * The tactical projection, as data: diamond tiles, height as blocks, the way
 * Final Fantasy Tactics draws a battlefield.
 *
 * ## Why this left `IsoMap.tsx`
 *
 * §66 adds a second renderer for the same view - a WebGL one - and two
 * renderers each carrying their own copy of the projection is how a click
 * lands on one square while the drawing shows another. §32.1 already paid for
 * that class of bug once, inside a single component; across two it would be
 * worse and quieter. So the projection is one module, the SVG map and the GL
 * map both consume it, and the GL scene builder pre-projects its vertices
 * through these exact functions - the shader never re-derives the math.
 *
 * ## The projection, stated plainly
 *
 * A grid vertex (gx, gy) lands at `((gx − gy)·HW, (gx + gy)·HH)`, and standing
 * on ground of height z lifts it by `z·ZH`. That is the whole camera. The
 * facing (0-3, FFT's L1/R1) is a quarter-turn *permutation of grid
 * coordinates* applied before projection and inverted after the pointer's
 * inverse, so rotating never touches the data - only which corner of it is
 * near.
 *
 * ## The quirk that was, fixed
 *
 * §66.1 extracted this module with one recorded reproduction: a wall drew
 * `WALL_STEPS` higher than it hit-tested, so a click on its painted cap
 * could land on the square visually behind it. Reproduced then because the
 * extraction's promise was "a move, not a rewrite"; fixed in §80, once and
 * for both renderers, in `squareAtPoint` - which now iterates the heights
 * things are drawn at, not just the heights the ground has.
 */

/** Half a diamond's width and height, and pixels per step of elevation. */
export const HW = 14;
export const HH = 7;
export const ZH = 8;
/** The little lip every tile keeps below its top face, so flat ground still
    reads as tiles sitting on something. */
export const LIP = 3;
/** How many steps tall a painted wall stands. */
export const WALL_STEPS = 2;
/*
  The standing pawn (§37). A card `PAWN_W` wide and `PAWN_H` tall, slotted
  into a wedge base `BASE_H` deep. Sized against the tile rather than in
  absolute units - see the reasoning where the pawn is drawn.
*/
export const PAWN_W = HW * 0.78;
export const PAWN_H = PAWN_W * 1.5;
export const BASE_H = 3;

/** A grid vertex on ground level, in the drawing's coordinates. */
export const vx = (gx: number, gy: number): number => (gx - gy) * HW;
export const vy = (gx: number, gy: number): number => (gx + gy) * HH;

/**
 * Everything both renderers need to draw and hit-test one facing of one map.
 *
 * A factory rather than free functions because nearly every operation needs
 * the same five facts - the rotation, the rotated dimensions, the x shift and
 * the elevation range - and threading them through every call site is how one
 * caller ends up passing yesterday's `minX`.
 */
export interface IsoProjection {
  /** The facing, normalised to 0-3. */
  rot: number;
  /** Grid dimensions in the rotated frame (swapped on odd facings). */
  gw: number;
  gh: number;
  /** The far-left vertex's x; polygons are drawn already shifted by it. */
  minX: number;
  /** Headroom reserved above the drawing for tall terrain. */
  pad: number;
  /** The drawing's size. */
  w: number;
  h: number;
  /** The frame the camera moves around inside. y origin is `-pad`. */
  frame: Frame;
  /** Data square → rotated frame. */
  orient(at: Square): Square;
  /** Rotated frame → data square. */
  unorient(at: Square): Square;
  /** Paint order in the rotated frame: farther cells first. */
  depthOf(at: Square): number;
  /** Ground height of a square, in steps. */
  zOf(at: Square): number;
  /** The height a square is *drawn* at: ground, plus WALL_STEPS for a wall. */
  drawZ(at: Square): number;
  /** The four corners of a cell's top face at height z, drawing coordinates. */
  faceCorners(at: Square, z: number): [number, number][];
  /** The centre of a cell's top face, where tokens stand and lines run. */
  centreOf(at: Square, z?: number): { x: number; y: number };
  /**
   * A point in user space (already through `toUserSpace`) back to a square.
   *
   * Inverts the vertex transform at each height that exists on this map,
   * highest first - a raised tile's face covers the flat square behind it, so
   * the taller candidate wins, exactly as it does visually. The z = 0 plane
   * is the fallback.
   */
  squareAtPoint(point: { x: number; y: number } | null): Square | null;
}

export function isoProjection(
  dungeon: Dungeon,
  elevation: ElevationMap,
  terrain: TerrainMap,
  orientation = 0,
): IsoProjection {
  const rot = ((orientation % 4) + 4) % 4;
  const gw = rot % 2 ? dungeon.height : dungeon.width;
  const gh = rot % 2 ? dungeon.width : dungeon.height;

  const orient = (at: Square): Square =>
    rot === 1
      ? { x: dungeon.height - 1 - at.y, y: at.x }
      : rot === 2
        ? { x: dungeon.width - 1 - at.x, y: dungeon.height - 1 - at.y }
        : rot === 3
          ? { x: at.y, y: dungeon.width - 1 - at.x }
          : at;
  const unorient = (at: Square): Square =>
    rot === 1
      ? { x: at.y, y: dungeon.height - 1 - at.x }
      : rot === 2
        ? { x: dungeon.width - 1 - at.x, y: dungeon.height - 1 - at.y }
        : rot === 3
          ? { x: dungeon.width - 1 - at.y, y: at.x }
          : at;

  /*
    The frame: x runs from the far-left vertex (0, height) to the far-right
    (width, 0); y from the top vertex (0,0) down to (width, height), plus
    headroom for raised ground above and skirts below. All in the rotated
    frame, since that is the one being drawn.
  */
  const minX = vx(0, gh);
  const maxZ = Math.max(0, ...Object.values(elevation));
  const minZ = Math.min(0, ...Object.values(elevation));
  const pad = (maxZ + WALL_STEPS) * ZH + 24;
  const w = vx(gw, 0) - minX;
  const h = vy(gw, gh) + pad + Math.abs(minZ) * ZH + LIP + 14;
  const frame: Frame = { x0: 0, y0: -pad, w, h };

  const zOf = (at: Square): number => elevation[keyOf(at)] ?? 0;
  const drawZ = (at: Square): number =>
    zOf(at) + (terrain[keyOf(at)] === 'wall' ? WALL_STEPS : 0);

  const faceCorners = (at: Square, z: number): [number, number][] => {
    const lift = z * ZH;
    const r = orient(at);
    return [
      [vx(r.x, r.y) - minX, vy(r.x, r.y) - lift],
      [vx(r.x + 1, r.y) - minX, vy(r.x + 1, r.y) - lift],
      [vx(r.x + 1, r.y + 1) - minX, vy(r.x + 1, r.y + 1) - lift],
      [vx(r.x, r.y + 1) - minX, vy(r.x, r.y + 1) - lift],
    ];
  };

  const centreOf = (at: Square, z = zOf(at)) => {
    const r = orient(at);
    return {
      x: vx(r.x + 0.5, r.y + 0.5) - minX,
      y: vy(r.x + 0.5, r.y + 0.5) - z * ZH,
    };
  };

  const squareAtPoint = (point: { x: number; y: number } | null): Square | null => {
    if (!point) return null;
    /*
      `minX` is added back here rather than being part of the viewBox origin:
      the polygons are drawn already shifted by it, so the viewBox starts at
      zero, while the inverse below wants an unshifted vertex.
    */
    const sx = point.x + minX;
    const sy = point.y;
    /*
      §80: the heights anything is *drawn* at - ground elevations plus each
      wall's painted cap. For a year this iterated elevations only, so a
      click on a wall's cap resolved as if the wall were at ground height
      and landed on the square visually behind it (the WALL_STEPS quirk,
      §66.1's one recorded reproduction). Matching against `drawZ` makes
      the click land where the eye says it should, in both renderers at
      once, because both consume this inverse. A click on the wall's skirt
      still answers the wall, through the z = 0 fallback below.
    */
    const wallCaps = Object.entries(terrain)
      .filter(([, kind]) => kind === 'wall')
      .map(([key]) => (elevation[key] ?? 0) + WALL_STEPS);
    const levels = [...new Set([...Object.values(elevation), ...wallCaps, 0])].sort(
      (a, b) => b - a,
    );
    let flat: Square | null = null;
    for (const z of levels) {
      const gy = sy + z * ZH;
      const a = (sx / HW + gy / HH) / 2;
      const b = (gy / HH - sx / HW) / 2;
      const rotated = { x: Math.floor(a), y: Math.floor(b) };
      if (rotated.x < 0 || rotated.y < 0 || rotated.x >= gw || rotated.y >= gh) continue;
      // The inverse lands in the rotated frame; the data lives in the real one.
      const at = unorient(rotated);
      if (drawZ(at) === z) return at;
      if (z === 0) flat = at;
    }
    return flat;
  };

  return {
    rot,
    gw,
    gh,
    minX,
    pad,
    w,
    h,
    frame,
    orient,
    unorient,
    depthOf: (at) => {
      const r = orient(at);
      return r.x + r.y;
    },
    zOf,
    drawZ,
    faceCorners,
    centreOf,
    squareAtPoint,
  };
}

/**
 * Which cells are ground at all. The same rule the top-down map draws by:
 * rooms, corridors and painted floor on a generated map; every square on a
 * blank one. Painted terrain is ground too - a wall stands somewhere.
 */
export function groundCells(dungeon: Dungeon, terrain: TerrainMap): Square[] {
  const cells = new Map<string, Square>();
  if (dungeon.rooms.length === 0) {
    for (let y = 0; y < dungeon.height; y++) {
      for (let x = 0; x < dungeon.width; x++) cells.set(`${x},${y}`, { x, y });
    }
  } else {
    for (const room of dungeon.rooms) {
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) cells.set(`${x},${y}`, { x, y });
      }
    }
    for (const corridor of dungeon.corridors) {
      for (const s of corridorSquares(corridor)) cells.set(`${s.x},${s.y}`, s);
    }
    for (const key of Object.keys(terrain)) {
      const s = squareOf(key);
      if (s.x >= 0 && s.y >= 0 && s.x < dungeon.width && s.y < dungeon.height) {
        cells.set(key, s);
      }
    }
  }
  return [...cells.values()];
}
