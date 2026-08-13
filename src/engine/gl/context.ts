/**
 * Getting a WebGL context, and knowing when you cannot.
 *
 * ## The contract with the tests
 *
 * jsdom implements `getContext` by logging "not implemented" and returning
 * `null` - verified against jsdom 30, and the reason every function here is
 * null-tolerant rather than try/catch-theatrical. `canUseWebGl()` returning
 * `false` cleanly in jsdom is what routes every component test to the SVG
 * fallback without a single mock; the try/catch stays anyway because a
 * browser with WebGL *blocked* (enterprise policy, software-rendering
 * denylist) is allowed to throw instead.
 *
 * ## WebGL2 vs WebGL1
 *
 * The shaders are GLSL ES 1.00 everywhere - the only WebGL2 feature this
 * renderer wants is native 32-bit element indices, which WebGL1 offers as
 * the `OES_element_index_uint` extension (universally supported for a
 * decade). A WebGL1 context *without* that extension is treated as no
 * context at all: the terrain mesh genuinely needs the indices, and a
 * renderer that silently truncated them would draw garbage precisely on the
 * biggest maps.
 */

export type Gl = WebGLRenderingContext | WebGL2RenderingContext;

export interface AcquiredContext {
  gl: Gl;
  isWebGl2: boolean;
}

const CONTEXT_OPTIONS: WebGLContextAttributes = {
  // The probe reads pixels back and the print path snapshots the canvas;
  // at this renderer's half-dozen draw calls the cost is unmeasurable.
  preserveDrawingBuffer: true,
  antialias: false,
  alpha: false,
  depth: true,
};

export function acquireContext(canvas: HTMLCanvasElement): AcquiredContext | null {
  try {
    const gl2 = canvas.getContext('webgl2', CONTEXT_OPTIONS);
    if (gl2) return { gl: gl2 as WebGL2RenderingContext, isWebGl2: true };
    const gl1 = canvas.getContext('webgl', CONTEXT_OPTIONS);
    if (gl1) {
      const gl = gl1 as WebGLRenderingContext;
      if (!gl.getExtension('OES_element_index_uint')) return null;
      return { gl, isWebGl2: false };
    }
  } catch {
    // A blocked context is an absent one.
  }
  return null;
}

let probed: boolean | null = null;

/**
 * Whether this environment can run the GL view at all. Cached: the answer
 * cannot change within a session, and the probe costs a context.
 */
export function canUseWebGl(): boolean {
  if (probed !== null) return probed;
  try {
    const canvas = document.createElement('canvas');
    const acquired = acquireContext(canvas);
    // Give the probe context back straight away rather than leaking it
    // toward the browser's context cap.
    acquired?.gl.getExtension('WEBGL_lose_context')?.loseContext();
    probed = acquired !== null;
  } catch {
    probed = false;
  }
  return probed;
}

/** Test seam: force or clear the cached answer. */
export function setWebGlProbeForTests(value: boolean | null): void {
  probed = value;
}
