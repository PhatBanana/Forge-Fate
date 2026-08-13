import type { Gl } from './context';

/**
 * Three programs, GLSL ES 1.00 throughout so one set of sources runs on
 * WebGL2 and WebGL1 alike.
 *
 * ## Where each PS1 artifact lives
 *
 * - **Vertex snapping** - the wobble - is in the scene vertex shader: the
 *   position is taken to *virtual-pixel* space (the ~240p framebuffer's
 *   grid), floored to the pixel centre, and only then to clip space. This is
 *   the artifact FFT actually had; the PS1's rasterizer worked in integer
 *   screen coordinates and geometry visibly popped between them.
 * - **Affine texture warp is deliberately absent**, and would be even if we
 *   tried: it is a *perspective* artifact (the PS1 skipped the per-pixel
 *   divide), and this camera is orthographic - every w is 1, so affine and
 *   perspective-correct interpolation are the same function. Do not "add it
 *   back"; there is nothing to add it to.
 * - **Bayer dithering and the RGB555 crush** live in the blit shader, applied
 *   once to the finished 240p frame - one implementation point, every layer
 *   treated identically, exactly as the console's video output stage did it.
 */

/** Shared by terrain, washes and sprites: pos/depth/uv/color, snapped. */
export const SCENE_VERTEX = `
attribute vec2 aPos;
attribute float aDepth;
attribute vec2 aUv;
attribute vec4 aColor;
uniform vec4 uView;      /* viewBox: x, y, w, h in drawing units */
uniform vec2 uVirtual;   /* the low-res framebuffer's size in pixels */
uniform float uDepthMax;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec2 px = (aPos - uView.xy) / uView.zw * uVirtual;
  /* The PS1 wobble: vertices live on the virtual pixel grid, nowhere else. */
  px = floor(px) + 0.5;
  vec2 clip = px / uVirtual * 2.0 - 1.0;
  /* Bigger depth = nearer the camera = must win the depth test. */
  float z = 0.9 - (aDepth / max(uDepthMax, 1.0)) * 1.8;
  gl_Position = vec4(clip.x, -clip.y, z, 1.0);
  vUv = aUv;
  vColor = aColor;
}
`;

export const SCENE_FRAGMENT = `
precision mediump float;
uniform sampler2D uAtlas;
uniform float uAlphaTest; /* 0 for geometry/washes, 0.5 for sprite cutouts */
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 tex = texture2D(uAtlas, vUv);
  /* Cutout on the texture's own alpha, not the tint's: a hiding pawn is a
     translucent pawn, not a discarded one. */
  if (tex.a < uAlphaTest) discard;
  gl_FragColor = tex * vColor;
}
`;

/** Lines: slimmer attributes, same snap, drawn in the depth-off passes. */
export const LINE_VERTEX = `
attribute vec2 aPos;
attribute vec4 aColor;
uniform vec4 uView;
uniform vec2 uVirtual;
varying vec4 vColor;
void main() {
  vec2 px = (aPos - uView.xy) / uView.zw * uVirtual;
  px = floor(px) + 0.5;
  vec2 clip = px / uVirtual * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vColor = aColor;
}
`;

export const LINE_FRAGMENT = `
precision mediump float;
varying vec4 vColor;
void main() {
  gl_FragColor = vColor;
}
`;

/** The upscale: a fullscreen triangle sampling the 240p frame with nearest
    filtering, dithered and crushed to RGB555 on the way out. */
export const BLIT_VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const BLIT_FRAGMENT = `
precision mediump float;
uniform sampler2D uScene;
uniform vec2 uVirtual;
varying vec2 vUv;

/* The 2x2 Bayer cell: 0 2 / 3 1, as arithmetic (no arrays in ES 1.00
   without constant indices). Checked against the matrix in the tests. */
float bayer2(vec2 p) {
  return 2.0 * p.x + 3.0 * p.y - 4.0 * p.x * p.y;
}

/* The 4x4 matrix by recursion: coarse cell scaled, fine cell added. */
float bayer4(vec2 p) {
  vec2 fine = mod(p, 2.0);
  vec2 coarse = mod(floor(p * 0.5), 2.0);
  return 4.0 * bayer2(fine) + bayer2(coarse);
}

void main() {
  /* Nearest sample of the virtual frame: snap the UV to a texel centre. */
  vec2 texel = (floor(vUv * uVirtual) + 0.5) / uVirtual;
  vec3 color = texture2D(uScene, texel).rgb;
  /* Dither in *virtual* pixels, so the pattern scales with the chunk. */
  float threshold = (bayer4(floor(vUv * uVirtual)) + 0.5) / 16.0 - 0.5;
  /* RGB555: 31 levels a channel, the PlayStation's own framebuffer depth. */
  vec3 crushed = floor(color * 31.0 + 0.5 + threshold) / 31.0;
  gl_FragColor = vec4(clamp(crushed, 0.0, 1.0), 1.0);
}
`;

/** Compile both stages and link, or say which stage refused and why. */
export function buildProgram(gl: Gl, vertexSource: string, fragmentSource: string): WebGLProgram {
  const compile = (type: number, source: string): WebGLShader => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`shader refused: ${log}`);
    }
    return shader;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`program refused: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

/**
 * The Bayer maths above, in TypeScript, so a node test can pin the shader's
 * arithmetic against the canonical matrix without a GPU in the room.
 */
export function bayer4Reference(x: number, y: number): number {
  const b2 = (px: number, py: number) => 2 * px + 3 * py - 4 * px * py;
  return 4 * b2(x % 2, y % 2) + b2(Math.floor(x / 2) % 2, Math.floor(y / 2) % 2);
}
