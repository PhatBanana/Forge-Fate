import { describe, expect, it } from 'vitest';
import { canUseWebGl, setWebGlProbeForTests } from './context';
import {
  BLIT_FRAGMENT,
  LINE_VERTEX,
  SCENE_FRAGMENT,
  SCENE_VERTEX,
  bayer4Reference,
} from './shaders';
import { spriteQuads } from './sprites';
import { VERTEX_FLOATS } from './types';

/**
 * §66.3: the GL runtime, tested at the two seams a GPU cannot reach.
 *
 * The renderer itself is pressed by the browser probe (`run66.mjs`), where
 * real pixels come out - a stub GL big enough to "test" draw calls would be
 * a second renderer that can only agree with the first by construction. What
 * *is* testable here: the environment probe's contract with jsdom, the
 * shader sources' load-bearing arithmetic, and the sprite-quad conversion.
 */

describe('the environment probe', () => {
  it('says no cleanly where there is no canvas at all', () => {
    // This suite runs in node: no document, no canvas, no GL - and the
    // probe's answer must be a calm false, because this same code path is
    // what routes every jsdom component test to the SVG fallback.
    setWebGlProbeForTests(null);
    expect(canUseWebGl()).toBe(false);
    // And the answer is cached rather than re-probed.
    expect(canUseWebGl()).toBe(false);
    setWebGlProbeForTests(null);
  });

  it('honours the test seam, which is how GlIsoMap tests reach the GL path', () => {
    setWebGlProbeForTests(true);
    expect(canUseWebGl()).toBe(true);
    setWebGlProbeForTests(null);
  });
});

describe('the shader sources', () => {
  it('snap vertices to the virtual pixel grid - the wobble', () => {
    expect(SCENE_VERTEX).toContain('floor(px) + 0.5');
    expect(LINE_VERTEX).toContain('floor(px) + 0.5');
  });

  it('cut sprites out on the texture alpha, not the tint', () => {
    // The tint's alpha is how a hiding pawn goes translucent; a cutout on
    // the product would discard that pawn entirely.
    expect(SCENE_FRAGMENT).toContain('if (tex.a < uAlphaTest) discard;');
    expect(SCENE_FRAGMENT).toContain('tex * vColor');
  });

  it('crush to RGB555 with a Bayer threshold, once, in the blit', () => {
    expect(BLIT_FRAGMENT).toContain('31.0');
    expect(BLIT_FRAGMENT).toContain('bayer4');
    // And nowhere else: one implementation point for the whole look.
    expect(SCENE_FRAGMENT).not.toContain('31.0');
  });

  it('has no affine-warp emulation to un-add', () => {
    // The camera is orthographic; every w is 1 and affine == correct. If a
    // w ever appears in the scene shaders, somebody is adding perspective.
    expect(SCENE_VERTEX).not.toMatch(/gl_Position\.w\s*=/);
  });
});

describe('the Bayer arithmetic', () => {
  it('reproduces the canonical 4×4 matrix', () => {
    // The ordered-dither matrix every reference prints. The shader carries
    // the same recursion as `bayer4Reference`, so pinning the reference in
    // node pins the shader's maths without a GPU in the room.
    const canonical = [
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5],
    ];
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        expect(bayer4Reference(x, y)).toBe(canonical[y][x]);
      }
    }
  });
});

describe('the sprite-quad conversion', () => {
  const sprite = (over: object = {}) => ({
    x: 10,
    y: 20,
    w: 8,
    h: 12,
    depth: 3,
    key: 'pawn:a',
    tint: [1, 1, 1, 1] as const,
    ...over,
  });

  it('anchors the quad at the bottom-centre, like a standee on its tile', () => {
    const mesh = spriteQuads([sprite()], () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }));
    const xs = [0, 1, 2, 3].map((i) => mesh.vertices[i * VERTEX_FLOATS]);
    const ys = [0, 1, 2, 3].map((i) => mesh.vertices[i * VERTEX_FLOATS + 1]);
    expect(Math.min(...xs)).toBe(6);
    expect(Math.max(...xs)).toBe(14);
    expect(Math.min(...ys)).toBe(8);
    expect(Math.max(...ys)).toBe(20);
  });

  it('skips a placement whose texture has not landed, rather than drawing garbage', () => {
    const mesh = spriteQuads(
      [sprite(), sprite({ key: 'pawn:pending' })],
      (key) => (key === 'pawn:a' ? { u0: 0, v0: 0, u1: 1, v1: 1 } : null),
    );
    expect(mesh.indices.length).toBe(6);
  });

  it('orders quads far-to-near so translucent tints blend correctly', () => {
    const mesh = spriteQuads(
      [sprite({ depth: 9, key: 'near' }), sprite({ depth: 1, key: 'far' })],
      () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }),
    );
    expect(mesh.vertices[2]).toBe(1);
    expect(mesh.vertices[4 * VERTEX_FLOATS + 2]).toBe(9);
  });
});
