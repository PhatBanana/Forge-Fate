/**
 * The shared shapes of the GL layer, in one small file so `scene.ts` and the
 * renderer agree by import rather than by convention.
 */

/** Channels in 0..1, the way a shader wants them. */
export type Rgb = readonly [number, number, number];
export type Rgba = readonly [number, number, number, number];

/** A region of a texture atlas, in normalised UV coordinates. */
export interface AtlasRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/**
 * One vertex is nine floats, interleaved:
 *
 *   [ x, y, depth, u, v, r, g, b, a ]
 *
 * `x`/`y` are the *drawing's* user-space coordinates - pre-projected on the
 * CPU through `engine/iso.ts`, so the shader never re-derives the projection
 * and the GL view provably draws where the SVG view draws. `depth` is the
 * SVG's paint-order key (`rx + ry` in the rotated frame) carried per vertex,
 * which the depth buffer turns into per-fragment occlusion - strictly better
 * than the painter's algorithm it replaces.
 */
export const VERTEX_FLOATS = 9;

/** A filled quad's worth of indices: two triangles, one shared diagonal. */
export const QUAD_INDICES = 6;

/** The full-white texel every untextured wash samples. */
export const WHITE: AtlasRect = { u0: 0, v0: 0, u1: 0, v1: 0 };

/** A growable pair of vertex/index arrays, so builders can append quads. */
export interface MeshBuilder {
  vertices: number[];
  indices: number[];
}

export const newMesh = (): MeshBuilder => ({ vertices: [], indices: [] });

/** Append one vertex; returns its index. */
export function pushVertex(
  mesh: MeshBuilder,
  x: number,
  y: number,
  depth: number,
  u: number,
  v: number,
  color: Rgba,
): number {
  const index = mesh.vertices.length / VERTEX_FLOATS;
  mesh.vertices.push(x, y, depth, u, v, color[0], color[1], color[2], color[3]);
  return index;
}

/**
 * Append a quad from four corner vertices in ring order (a, b, c, d).
 * Two triangles: a-b-c and a-c-d.
 */
export function pushQuad(mesh: MeshBuilder, a: number, b: number, c: number, d: number): void {
  mesh.indices.push(a, b, c, a, c, d);
}

/** The finished, GPU-ready shape. */
export interface Mesh {
  vertices: Float32Array;
  /**
   * 32-bit on purpose. A blank 64×48 board is 3,072 cells at 20 vertices a
   * prism - 61,440 of a Uint16's 65,536. Betting a renderer on 6% headroom
   * is how a slightly bigger map one day draws garbage, so the indices are
   * wide from the start and the test pins the arithmetic that says why.
   */
  indices: Uint32Array;
}

export const finishMesh = (mesh: MeshBuilder): Mesh => ({
  vertices: new Float32Array(mesh.vertices),
  indices: new Uint32Array(mesh.indices),
});

/** Multiply a color's channels, leaving alpha alone - the face-shading op. */
export const shade = (color: Rgb, factor: number, alpha = 1): Rgba => [
  color[0] * factor,
  color[1] * factor,
  color[2] * factor,
  alpha,
];
