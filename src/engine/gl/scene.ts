import type { Square } from '../../encounter';
import type { Dungeon } from '../dungeon';
import { keyOf } from '../../terrain';
import type { ElevationMap, TerrainMap } from '../../terrain';
import { LIP, ZH, groundCells } from '../iso';
import type { IsoProjection } from '../iso';
import { cellJitter } from './palette';
import type { Palette } from './palette';
import { WHITE, finishMesh, newMesh, pushQuad, pushVertex, shade } from './types';
import type { AtlasRect, Mesh, Rgb } from './types';
import { uvOf } from './atlas';
import { ATLAS_SIZE } from './raster';
import { slotOf } from './surfaceart';

/**
 * The ground, as triangles.
 *
 * Every cell becomes a full prism - a cap and all four side faces - rather
 * than the SVG's cap-plus-two-visible-skirts shortcut. The SVG can afford the
 * shortcut because it paints back to front and the front covers the back; the
 * GL view has a depth buffer, which does the same job per fragment and does
 * it better (the SVG's own header admits a token can draw over the wall it
 * stands behind - per-fragment depth fixes that for free).
 *
 * Positions are pre-projected through `engine/iso.ts` on the CPU. The shader
 * receives finished drawing-space coordinates and never re-derives the
 * projection - which is the whole §66.1 contract: one projection, two
 * renderers, no drift.
 */

/** Which atlas region each kind of surface samples. */
export interface TerrainUvs {
  ground: AtlasRect;
  floor: AtlasRect;
  wall: AtlasRect;
  water: AtlasRect;
  /** The skirts share one rock-face texture whatever stands above them. */
  side: AtlasRect;
  /**
   * §150: except a wall's, which is the surface a player is actually looking
   * at in this projection. Broken rock and coursed masonry are not the same
   * material, and drawing them alike is what made walls read as blocks.
   */
  wallSide: AtlasRect;
}

/** Every region as the white texel: flat-colored prisms, fine for tests. */
export const FLAT_UVS: TerrainUvs = {
  ground: WHITE,
  floor: WHITE,
  wall: WHITE,
  water: WHITE,
  side: WHITE,
  wallSide: WHITE,
};

/**
 * §150: where the real terrain textures live, as UVs.
 *
 * A constant rather than something the renderer hands out, because the
 * addresses are arithmetic - see `surfaceart.ts`. That is what lets the
 * *component* bake UVs into a vertex buffer without waiting for a renderer
 * to exist or caring how many atlas generations it outlives.
 */
export const TERRAIN_UVS: TerrainUvs = {
  ground: uvOf(slotOf('ground'), { width: ATLAS_SIZE, height: ATLAS_SIZE }),
  floor: uvOf(slotOf('floor'), { width: ATLAS_SIZE, height: ATLAS_SIZE }),
  wall: uvOf(slotOf('wall'), { width: ATLAS_SIZE, height: ATLAS_SIZE }),
  water: uvOf(slotOf('water'), { width: ATLAS_SIZE, height: ATLAS_SIZE }),
  side: uvOf(slotOf('side'), { width: ATLAS_SIZE, height: ATLAS_SIZE }),
  wallSide: uvOf(slotOf('wallSide'), { width: ATLAS_SIZE, height: ATLAS_SIZE }),
};

const capColor = (kind: string | undefined, palette: Palette): Rgb => {
  if (kind === 'wall') return palette.wall;
  if (kind === 'water') return palette.water;
  if (kind === 'floor') return palette.floor;
  return palette.ground;
};

const capUv = (kind: string | undefined, uvs: TerrainUvs): AtlasRect => {
  if (kind === 'wall') return uvs.wall;
  if (kind === 'water') return uvs.water;
  if (kind === 'floor') return uvs.floor;
  return uvs.ground;
};

/** Vertices per prism and indices per prism, for the tests that do the
    arithmetic on why indices are 32-bit. */
export const PRISM_VERTICES = 20;
export const PRISM_INDICES = 30;

export function buildTerrain(
  dungeon: Dungeon,
  elevation: ElevationMap,
  terrain: TerrainMap,
  proj: IsoProjection,
  palette: Palette,
  /** §148: the fog's explored set. Unexplored ground is never built. */
  known?: ReadonlySet<string>,
  uvs: TerrainUvs = FLAT_UVS,
): Mesh {
  const mesh = newMesh();
  const minZ = Math.min(0, ...Object.values(elevation));
  // Where every skirt bottoms out: one bedrock plane under the whole board,
  // so a pit reads as a hole in something solid rather than a floating tile.
  const bedrockDrop = Math.abs(minZ) * ZH + LIP;

  for (const at of groundCells(dungeon, terrain, known)) {
    const kind = terrain[keyOf(at)];
    const z = proj.drawZ(at);
    const corners = proj.faceCorners(at, z);
    const depth = proj.depthOf(at);
    const jitter = cellJitter(at.x, at.y);
    const base = capColor(kind, palette);
    const uv = capUv(kind, uvs);

    // The cap: corners in ring order, UV spanning the atlas region.
    const capUvXy: [number, number][] = [
      [uv.u0, uv.v0],
      [uv.u1, uv.v0],
      [uv.u1, uv.v1],
      [uv.u0, uv.v1],
    ];
    const cap = corners.map(([x, y], i) =>
      pushVertex(mesh, x, y, depth, capUvXy[i][0], capUvXy[i][1], shade(base, jitter)),
    );
    pushQuad(mesh, cap[0], cap[1], cap[2], cap[3]);

    /*
      The four sides, each from a pair of cap corners down to bedrock. Shading
      follows the SVG's two-tone skirt read - SE bright, SW darker - extended
      to the two faces the SVG never drew, which only the camera's far side
      sees. Corner ring order is [N, E, S, W] in screen terms, so the faces
      are NE (0-1), SE (1-2), SW (2-3), NW (3-0).
    */
    const shades = [palette.neShade, palette.seShade, palette.swShade, palette.nwShade];
    // §150: a wall's face is masonry; everything else's is broken rock.
    const face = kind === 'wall' ? uvs.wallSide : uvs.side;
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = corners[i];
      const [bx, by] = corners[(i + 1) % 4];
      const color = shade(base, shades[i] * jitter);
      const bottom = z * ZH + bedrockDrop;
      const a = pushVertex(mesh, ax, ay, depth, face.u0, face.v0, color);
      const b = pushVertex(mesh, bx, by, depth, face.u1, face.v0, color);
      const c = pushVertex(mesh, bx, by + bottom, depth, face.u1, face.v1, color);
      const d = pushVertex(mesh, ax, ay + bottom, depth, face.u0, face.v1, color);
      pushQuad(mesh, a, b, c, d);
    }
  }

  return finishMesh(mesh);
}

/**
 * The largest depth value this scene can produce, for the shader's
 * normalisation - the rotated frame's far corner.
 */
export const depthRange = (proj: IsoProjection): number => proj.gw + proj.gh;

/** Re-exported so the renderer can size its draw call without re-deriving. */
export { groundCells } from '../iso';
export type { Square };
