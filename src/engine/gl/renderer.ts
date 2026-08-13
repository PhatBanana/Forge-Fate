import type { ViewBox } from '../letterbox';
import { createShelfAtlas, uvOf } from './atlas';
import type { ShelfAtlas } from './atlas';
import { acquireContext } from './context';
import type { Gl } from './context';
import type { Palette } from './palette';
import {
  ATLAS_SIZE,
  PPU,
  createAtlasCanvas,
  measureText,
  paintClassSprite,
  paintGlyph,
  paintMarker,
  paintPawn,
  paintShadow,
  paintText,
  paintWhite,
} from './raster';
import { SPRITE_H, SPRITE_W } from './pixelart';
import type { Pose } from './pixelart';
import type { AtlasCanvas } from './raster';
import {
  BLIT_FRAGMENT,
  BLIT_VERTEX,
  LINE_FRAGMENT,
  LINE_VERTEX,
  SCENE_FRAGMENT,
  SCENE_VERTEX,
  buildProgram,
} from './shaders';
import { spriteQuads } from './sprites';
import type { SpritePlacement, TextPlacement } from './sprites';
import { LINE_FLOATS } from './lines';
import { VERTEX_FLOATS, WHITE } from './types';
import type { AtlasRect, Mesh, Rgba } from './types';

/**
 * The renderer: buffers in, a 240p frame out, upscaled nearest to the canvas.
 *
 * ## The passes, and why this order
 *
 * 1. **Terrain**, opaque, depth test + write. The prisms do their own
 *    occlusion per fragment - the painter's algorithm the SVG uses, done
 *    properly.
 * 2. **Under-sprite washes** (reach, zones, zone labels) - blended, depth
 *    *test* on so a tall prism in front hides the wash behind it, depth
 *    *write* off so they never occlude each other.
 * 3. **Sight lines** - the SVG draws them after zones and before tokens, so
 *    the pawns drawn next can stand in front of them.
 * 4. **Sprites** - alpha-cutout on the texture's silhouette, depth test AND
 *    write, sorted far-to-near so translucent tints blend correctly while
 *    walls still occlude pawns behind them.
 * 5. **Token text** (odds, condition shorts, floats) - in the SVG these live
 *    inside the token groups, under the gloom and fog. Depth off.
 * 6. **Over-everything washes** (gloom, fog, cursor), then the ruler and
 *    arc, then the note - the SVG's exact top layers, depth off, in its
 *    exact order. Fog over a pawn on an unseen square is a *feature*.
 * 7. **Blit**: the virtual frame to the canvas, nearest-sampled, Bayer
 *    dithered, crushed to RGB555.
 *
 * ## What this module refuses to know
 *
 * Nothing here computes geometry - meshes arrive from the pure builders,
 * pre-projected. Nothing here reacts - the component decides when to call
 * `update` and `render`. And nothing here handles context loss - the
 * component owns the canvas and its events, and rebuilds a fresh renderer
 * from the same props when the context comes back.
 */

/** The virtual framebuffer's height: the PS1's own vertical resolution. */
export const VIRTUAL_HEIGHT = 240;

export interface SceneUpdate {
  terrain?: Mesh;
  reach?: Mesh;
  zones?: Mesh;
  gloom?: Mesh;
  fog?: Mesh;
  cursor?: Mesh;
  sight?: Float32Array;
  rulerArc?: Float32Array;
  /** Depth-tested standing sprites: pawns, glyphs, markers, shadows. */
  sprites?: SpritePlacement[];
  /** Token text: odds, condition shorts, floats - drawn under fog. */
  tokenTexts?: TextPlacement[];
  /** Zone labels, drawn with the under-sprite washes. */
  zoneTexts?: TextPlacement[];
  /** The ruler note, drawn last. */
  noteText?: TextPlacement | null;
  depthMax?: number;
  palette?: Palette;
  /** What each pawn's card shows, for rasterization on first sight. */
  pawnArt?: Map<string, { label: string; kind: 'character' | 'monster'; portrait?: string }>;
}

interface MeshBuffers {
  vbo: WebGLBuffer;
  ibo: WebGLBuffer;
  count: number;
}

interface LineBuffer {
  vbo: WebGLBuffer;
  count: number;
}

export interface Renderer {
  update(scene: SceneUpdate): void;
  /** Called when a texture lands late (a portrait decode) and the picture on
      screen is stale - the component answers with a render. */
  onFrame(callback: () => void): void;
  /** Draw one frame: the ViewBox is the same object the hit test consumes. */
  render(view: ViewBox): void;
  /** Resize the canvas backing store; the virtual frame follows the aspect. */
  resize(cssWidth: number, cssHeight: number, dpr: number): void;
  destroy(): void;
}

const TEXT_TINTS: Record<string, Rgba> = {
  odds: [0.98, 0.9, 0.6, 1],
  cond: [0.95, 0.85, 0.55, 1],
  float: [1, 0.4, 0.32, 1],
  'float-heal': [0.45, 0.9, 0.5, 1],
  zone: [0.95, 0.92, 0.8, 1],
  note: [0.95, 0.92, 0.8, 1],
};

export function createRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const acquired = acquireContext(canvas);
  const atlasCanvas: AtlasCanvas | null = createAtlasCanvas();
  if (!acquired || !atlasCanvas) return null;
  const { gl } = acquired;

  // ------------------------------------------------------------- programs
  const scene = buildProgram(gl, SCENE_VERTEX, SCENE_FRAGMENT);
  const line = buildProgram(gl, LINE_VERTEX, LINE_FRAGMENT);
  const blit = buildProgram(gl, BLIT_VERTEX, BLIT_FRAGMENT);

  const sceneLoc = {
    aPos: gl.getAttribLocation(scene, 'aPos'),
    aDepth: gl.getAttribLocation(scene, 'aDepth'),
    aUv: gl.getAttribLocation(scene, 'aUv'),
    aColor: gl.getAttribLocation(scene, 'aColor'),
    uView: gl.getUniformLocation(scene, 'uView'),
    uVirtual: gl.getUniformLocation(scene, 'uVirtual'),
    uDepthMax: gl.getUniformLocation(scene, 'uDepthMax'),
    uAtlas: gl.getUniformLocation(scene, 'uAtlas'),
    uAlphaTest: gl.getUniformLocation(scene, 'uAlphaTest'),
  };
  const lineLoc = {
    aPos: gl.getAttribLocation(line, 'aPos'),
    aColor: gl.getAttribLocation(line, 'aColor'),
    uView: gl.getUniformLocation(line, 'uView'),
    uVirtual: gl.getUniformLocation(line, 'uVirtual'),
  };
  const blitLoc = {
    aPos: gl.getAttribLocation(blit, 'aPos'),
    uScene: gl.getUniformLocation(blit, 'uScene'),
    uVirtual: gl.getUniformLocation(blit, 'uVirtual'),
  };

  // ------------------------------------------------------------- textures
  const nearest = () => {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };

  const atlasTexture = gl.createTexture()!;
  const atlas: ShelfAtlas = createShelfAtlas(ATLAS_SIZE, ATLAS_SIZE);
  let atlasDirty = true;
  // The white texel is entry zero, always - `WHITE` in types.ts points at it.
  {
    const rect = atlas.pack('white', 2, 2)!;
    paintWhite(atlasCanvas.ctx, rect);
  }

  const sceneTexture = gl.createTexture()!;
  const depthBuffer = gl.createRenderbuffer()!;
  const framebuffer = gl.createFramebuffer()!;
  let virtualW = 320;
  let virtualH = VIRTUAL_HEIGHT;

  const sizeVirtual = (w: number, h: number) => {
    virtualW = Math.max(64, Math.round(w));
    virtualH = Math.max(64, Math.round(h));
    gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, virtualW, virtualH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    nearest();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, virtualW, virtualH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTexture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };
  sizeVirtual(virtualW, virtualH);

  // -------------------------------------------------------------- buffers
  const meshes = new Map<string, MeshBuffers>();
  const lines = new Map<string, LineBuffer>();

  const setMesh = (name: string, mesh: Mesh) => {
    let entry = meshes.get(name);
    if (!entry) {
      entry = { vbo: gl.createBuffer()!, ibo: gl.createBuffer()!, count: 0 };
      meshes.set(name, entry);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, entry.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, entry.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.DYNAMIC_DRAW);
    entry.count = mesh.indices.length;
  };

  const setLines = (name: string, data: Float32Array) => {
    let entry = lines.get(name);
    if (!entry) {
      entry = { vbo: gl.createBuffer()!, count: 0 };
      lines.set(name, entry);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, entry.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    entry.count = data.length / LINE_FLOATS;
  };

  const blitVbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, blitVbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  // ------------------------------------------------------------ the atlas
  const portraits = new Map<string, HTMLImageElement>();
  let currentPalette: Palette | null = null;
  let pawnArt: SceneUpdate['pawnArt'] = new Map();

  /**
   * The rect for a key, rasterizing on first sight. Null when the atlas is
   * out of room this generation - the caller skips the sprite this frame,
   * and the reset below buys the room back.
   */
  const rectFor = (key: string, w: number, h: number): AtlasRect | null => {
    if (key === 'white') return WHITE;
    const have = atlas.rectFor(key);
    if (have) return uvOf(have, atlas);
    /*
      §67: class sprites raster at the pixel grid's own size times an
      integer scale, whatever the placement measures - a 12×18 grid squeezed
      into a fractional rect would shear its pixels into unequal columns.
    */
    const [rw, rh] = key.startsWith('sprite:')
      ? [SPRITE_W * PPU, SPRITE_H * PPU]
      : [Math.ceil(w * PPU), Math.ceil(h * PPU)];
    let rect = atlas.pack(key, rw, rh);
    if (!rect) {
      // Full: start a fresh generation. Live keys re-rasterize on demand,
      // which is exactly one frame of missing floats - invisible in play.
      atlas.reset();
      const white = atlas.pack('white', 2, 2)!;
      paintWhite(atlasCanvas.ctx, white);
      rect = atlas.pack(key, rw, rh);
      if (!rect) return null;
    }
    paint(key, rect);
    atlasDirty = true;
    return uvOf(rect, atlas);
  };

  const paint = (key: string, rect: { x: number; y: number; w: number; h: number }) => {
    const palette = currentPalette;
    if (!palette) return;
    const { ctx } = atlasCanvas;
    if (key === 'shadow') paintShadow(ctx, rect);
    else if (key.startsWith('sprite:')) {
      const [, classId, pose] = key.split(':');
      paintClassSprite(ctx, rect, classId, pose as Pose);
    } else if (key.startsWith('glyph:')) paintGlyph(ctx, rect, key.slice(6), palette);
    else if (key.startsWith('marker:')) paintMarker(ctx, rect, key.slice(7), palette);
    else if (key.startsWith('pawn:')) {
      const id = key.slice(5);
      const art = pawnArt?.get(id);
      paintPawn(ctx, rect, {
        label: art?.label ?? '?',
        kind: art?.kind ?? 'monster',
        portrait: art?.portrait ? portraits.get(art.portrait) : undefined,
        palette,
      });
    } else if (key.startsWith('text:')) {
      const [, kind, ...rest] = key.split(':');
      paintText(ctx, rect, rest.join(':'), kind);
    }
  };

  /** Kick off a portrait decode; when it lands, redraw that card's entry. */
  const ensurePortrait = (id: string, source: string) => {
    if (portraits.has(source)) return;
    const image = new Image();
    portraits.set(source, image);
    image.onload = () => {
      const rect = atlas.rectFor(`pawn:${id}`);
      if (rect) {
        paint(`pawn:${id}`, rect);
        atlasDirty = true;
        onFrameNeeded?.();
      }
    };
    image.src = source;
  };

  /** The component's hook for "a texture landed late, draw again". */
  let onFrameNeeded: (() => void) | null = null;

  // ---------------------------------------------------------- scene state
  const state: Required<Pick<SceneUpdate, 'sprites' | 'tokenTexts' | 'zoneTexts'>> & {
    noteText: TextPlacement | null;
    depthMax: number;
  } = {
    sprites: [],
    tokenTexts: [],
    zoneTexts: [],
    noteText: null,
    depthMax: 1,
  };

  const update = (next: SceneUpdate) => {
    if (next.palette) currentPalette = next.palette;
    if (next.pawnArt) {
      pawnArt = next.pawnArt;
      for (const [id, art] of next.pawnArt) {
        if (art.portrait) ensurePortrait(id, art.portrait);
      }
    }
    if (next.terrain) setMesh('terrain', next.terrain);
    if (next.reach) setMesh('reach', next.reach);
    if (next.zones) setMesh('zones', next.zones);
    if (next.gloom) setMesh('gloom', next.gloom);
    if (next.fog) setMesh('fog', next.fog);
    if (next.cursor) setMesh('cursor', next.cursor);
    if (next.sight) setLines('sight', next.sight);
    if (next.rulerArc) setLines('rulerArc', next.rulerArc);
    if (next.sprites) state.sprites = next.sprites;
    if (next.tokenTexts) state.tokenTexts = next.tokenTexts;
    if (next.zoneTexts) state.zoneTexts = next.zoneTexts;
    if (next.noteText !== undefined) state.noteText = next.noteText;
    if (next.depthMax) state.depthMax = next.depthMax;
  };

  /** Text placements to sprite placements, measured against the atlas font. */
  const textSprites = (texts: TextPlacement[]): SpritePlacement[] =>
    texts.map((text) => {
      const size = measureText(atlasCanvas.ctx, text.text, text.kind);
      return {
        x: text.x,
        y: text.y + size.h / 2,
        w: size.w,
        h: size.h,
        depth: state.depthMax,
        key: `text:${text.kind}:${text.text}`,
        tint: TEXT_TINTS[text.kind] ?? [1, 1, 1, 1],
      };
    });

  // ------------------------------------------------------------- drawing
  const bindSceneAttributes = (vbo: WebGLBuffer) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    const stride = VERTEX_FLOATS * 4;
    gl.enableVertexAttribArray(sceneLoc.aPos);
    gl.vertexAttribPointer(sceneLoc.aPos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(sceneLoc.aDepth);
    gl.vertexAttribPointer(sceneLoc.aDepth, 1, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(sceneLoc.aUv);
    gl.vertexAttribPointer(sceneLoc.aUv, 2, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(sceneLoc.aColor);
    gl.vertexAttribPointer(sceneLoc.aColor, 4, gl.FLOAT, false, stride, 20);
  };

  const drawMesh = (name: string) => {
    const entry = meshes.get(name);
    if (!entry || entry.count === 0) return;
    bindSceneAttributes(entry.vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, entry.ibo);
    gl.drawElements(gl.TRIANGLES, entry.count, gl.UNSIGNED_INT, 0);
  };

  const drawQuadMesh = (mesh: Mesh, vbo: WebGLBuffer, ibo: WebGLBuffer) => {
    if (mesh.indices.length === 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.DYNAMIC_DRAW);
    bindSceneAttributes(vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.DYNAMIC_DRAW);
    gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_INT, 0);
  };
  const spriteVbo = gl.createBuffer()!;
  const spriteIbo = gl.createBuffer()!;
  const textVbo = gl.createBuffer()!;
  const textIbo = gl.createBuffer()!;

  const drawLines = (name: string, view: ViewBox) => {
    const entry = lines.get(name);
    if (!entry || entry.count === 0) return;
    gl.useProgram(line);
    gl.uniform4f(lineLoc.uView, view.x, view.y, view.width, view.height);
    gl.uniform2f(lineLoc.uVirtual, virtualW, virtualH);
    gl.bindBuffer(gl.ARRAY_BUFFER, entry.vbo);
    const stride = LINE_FLOATS * 4;
    gl.enableVertexAttribArray(lineLoc.aPos);
    gl.vertexAttribPointer(lineLoc.aPos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(lineLoc.aColor);
    gl.vertexAttribPointer(lineLoc.aColor, 4, gl.FLOAT, false, stride, 8);
    gl.drawArrays(gl.LINES, 0, entry.count);
  };

  const bindScene = (view: ViewBox, alphaTest: number) => {
    gl.useProgram(scene);
    gl.uniform4f(sceneLoc.uView, view.x, view.y, view.width, view.height);
    gl.uniform2f(sceneLoc.uVirtual, virtualW, virtualH);
    gl.uniform1f(sceneLoc.uDepthMax, state.depthMax);
    gl.uniform1f(sceneLoc.uAlphaTest, alphaTest);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
    gl.uniform1i(sceneLoc.uAtlas, 0);
  };

  const render = (view: ViewBox) => {
    const palette = currentPalette;
    if (!palette) return;

    /*
      Sprite and text quads are rebuilt every frame - they are dozens of
      quads, and building them here is what lets `rectFor` rasterize new
      floats mid-frame. The heavy meshes were uploaded in `update`.
    */
    const spriteMesh = spriteQuads(state.sprites, (key) => {
      const placement = state.sprites.find((s) => s.key === key)!;
      return rectFor(key, placement.w, placement.h);
    });
    const tokenTextMesh = spriteQuads(textSprites(state.tokenTexts), (key) =>
      rectForText(key),
    );
    const zoneTextMesh = spriteQuads(textSprites(state.zoneTexts), (key) => rectForText(key));
    const noteMesh = spriteQuads(
      state.noteText ? textSprites([state.noteText]) : [],
      (key) => rectForText(key),
    );

    if (atlasDirty) {
      gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas.canvas);
      nearest();
      atlasDirty = false;
    }

    // Pass 0: the virtual frame.
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0, 0, virtualW, virtualH);
    gl.clearColor(palette.clear[0], palette.clear[1], palette.clear[2], 1);
    gl.clearDepth(1);
    /*
      glClear respects the write masks, and the previous frame ended with
      depthMask(false) for its overlay pass - without turning writes back on
      first, the depth clear is a no-op on every frame after the first. The
      frame then still looks right while the camera holds still (the same
      geometry re-lands on its own depths and LEQUAL lets equals through),
      and falls apart the moment it moves: fragments arrive on pixels
      holding some earlier frame's nearer depths and are rejected - ragged
      holes in the terrain that worsen with every pan or zoom step.
    */
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 1. Terrain: opaque, depth on.
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    bindScene(view, 0);
    drawMesh('terrain');

    // 2. Under-sprite washes: blended, depth test on, write off.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    drawMesh('reach');
    drawMesh('zones');
    drawQuadMesh(zoneTextMesh, textVbo, textIbo);

    // 3. Sight lines, then 4. sprites (cutout, depth back on).
    gl.disable(gl.DEPTH_TEST);
    drawLines('sight', view);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    bindScene(view, 0.5);
    drawQuadMesh(spriteMesh, spriteVbo, spriteIbo);

    // 5-6. Everything over: token text, gloom, fog, cursor, ruler, arc, note.
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    bindScene(view, 0.01);
    drawQuadMesh(tokenTextMesh, textVbo, textIbo);
    drawMesh('gloom');
    drawMesh('fog');
    drawMesh('cursor');
    drawLines('rulerArc', view);
    bindScene(view, 0.01);
    drawQuadMesh(noteMesh, textVbo, textIbo);

    // 7. The blit: virtual frame to canvas, dithered and crushed.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.BLEND);
    gl.useProgram(blit);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
    gl.uniform1i(blitLoc.uScene, 0);
    gl.uniform2f(blitLoc.uVirtual, virtualW, virtualH);
    gl.bindBuffer(gl.ARRAY_BUFFER, blitVbo);
    gl.enableVertexAttribArray(blitLoc.aPos);
    gl.vertexAttribPointer(blitLoc.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  /** Text keys carry their own size; measure from the key's own text. */
  const rectForText = (key: string): AtlasRect | null => {
    const [, kind, ...rest] = key.split(':');
    const size = measureText(atlasCanvas.ctx, rest.join(':'), kind);
    return rectFor(key, size.w, size.h);
  };

  return {
    update,
    render,
    onFrame(callback) {
      onFrameNeeded = callback;
    },
    resize(cssWidth, cssHeight, dpr) {
      canvas.width = Math.max(1, Math.round(cssWidth * dpr));
      canvas.height = Math.max(1, Math.round(cssHeight * dpr));
      const aspect = cssWidth / Math.max(1, cssHeight);
      sizeVirtual(VIRTUAL_HEIGHT * aspect, VIRTUAL_HEIGHT);
    },
    destroy() {
      for (const { vbo, ibo } of meshes.values()) {
        gl.deleteBuffer(vbo);
        gl.deleteBuffer(ibo);
      }
      for (const { vbo } of lines.values()) gl.deleteBuffer(vbo);
      gl.deleteBuffer(blitVbo);
      gl.deleteBuffer(spriteVbo);
      gl.deleteBuffer(spriteIbo);
      gl.deleteBuffer(textVbo);
      gl.deleteBuffer(textIbo);
      gl.deleteTexture(atlasTexture);
      gl.deleteTexture(sceneTexture);
      gl.deleteRenderbuffer(depthBuffer);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteProgram(scene);
      gl.deleteProgram(line);
      gl.deleteProgram(blit);
    },
  };
}

export type { Gl };
