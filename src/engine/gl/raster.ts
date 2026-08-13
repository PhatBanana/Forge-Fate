import type { PackedRect } from './atlas';
import type { Palette } from './palette';
import { CLASS_ART, SPRITE_H, SPRITE_W, colorOf, spriteFor } from './pixelart';
import type { Pose } from './pixelart';

/**
 * The pixels behind the atlas keys: pawn cards, prop glyphs, markers, text.
 *
 * Drawn on a 2D canvas at a deliberately low resolution - `PPU` pixels per
 * drawing unit - because the whole frame ends up at ~240 virtual rows anyway
 * and art rasterized finer would only be thrown away. Chunky source art
 * sampled with nearest filtering *is* the sprite aesthetic; nothing here
 * tries to be smooth.
 *
 * Every entry point is null-tolerant: jsdom's `getContext('2d')` returns
 * null (the `portrait.ts:66` pattern), and a renderer that cannot rasterize
 * simply draws untextured - it will never run in jsdom anyway, since the
 * context probe already said no.
 */

/** Atlas pixels per drawing unit. Two: text stays legible, cards stay chunky. */
export const PPU = 2;

/** The atlas texture's side, in pixels. Plenty: a pawn is ~30×45. */
export const ATLAS_SIZE = 512;

export interface AtlasCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export function createAtlasCanvas(): AtlasCanvas | null {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

const css = ([r, g, b]: readonly [number, number, number], a = 1) =>
  `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;

/** The one white texel every untextured wash and prism samples. */
export function paintWhite(ctx: CanvasRenderingContext2D, rect: PackedRect): void {
  ctx.fillStyle = '#fff';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
}

/** A soft contact ellipse, dark and translucent. */
export function paintShadow(ctx: CanvasRenderingContext2D, rect: PackedRect): void {
  ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, rect.h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * The standing props, as a few flat-shaded rectangles each - deliberately
 * cruder than the SVG glyphs they mirror, because at 240p a silhouette reads
 * and detail smears.
 */
export function paintGlyph(
  ctx: CanvasRenderingContext2D,
  rect: PackedRect,
  kind: string,
  palette: Palette,
): void {
  ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
  const { x, y, w, h } = rect;
  if (kind === 'tree') {
    ctx.fillStyle = css([0.35, 0.26, 0.16]);
    ctx.fillRect(x + w * 0.44, y + h * 0.5, w * 0.14, h * 0.5);
    ctx.fillStyle = css([0.24, 0.42, 0.22]);
    ctx.fillRect(x + w * 0.15, y + h * 0.18, w * 0.7, h * 0.42);
    ctx.fillRect(x + w * 0.3, y, w * 0.4, h * 0.3);
  } else if (kind === 'pillar') {
    ctx.fillStyle = css(palette.wall);
    ctx.fillRect(x + w * 0.28, y + h * 0.08, w * 0.44, h * 0.92);
    ctx.fillStyle = css(palette.wall.map((c) => c * 1.25) as unknown as Palette['wall']);
    ctx.fillRect(x + w * 0.18, y, w * 0.64, h * 0.14);
  } else if (kind === 'rock') {
    ctx.fillStyle = css(palette.wall);
    ctx.fillRect(x + w * 0.15, y + h * 0.35, w * 0.7, h * 0.65);
    ctx.fillRect(x + w * 0.35, y + h * 0.1, w * 0.35, h * 0.35);
  } else {
    // Rubble: three lumps.
    ctx.fillStyle = css(palette.wall);
    ctx.fillRect(x + w * 0.1, y + h * 0.5, w * 0.28, h * 0.45);
    ctx.fillRect(x + w * 0.45, y + h * 0.3, w * 0.3, h * 0.6);
    ctx.fillRect(x + w * 0.72, y + h * 0.55, w * 0.22, h * 0.4);
  }
}

export function paintMarker(
  ctx: CanvasRenderingContext2D,
  rect: PackedRect,
  kind: string,
  palette: Palette,
): void {
  ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
  const { x, y, w, h } = rect;
  if (kind === 'active') {
    // The turn marker: a small down-pointing wedge, the tactics-game classic.
    ctx.fillStyle = css([0.95, 0.78, 0.3]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w / 2, y + h);
    ctx.closePath();
    ctx.fill();
  } else {
    // The target ring.
    ctx.strokeStyle = css([0.9, 0.3, 0.25]);
    ctx.lineWidth = Math.max(1, h * 0.18);
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = css(palette.ink);
  }
}

/**
 * A standee: the wedge base with the card standing out of it, §37's geometry
 * flattened into one sprite. The face is the portrait when one has decoded,
 * the initials until then (and forever, for the many tokens without art).
 */
export function paintPawn(
  ctx: CanvasRenderingContext2D,
  rect: PackedRect,
  options: {
    label: string;
    kind: 'character' | 'monster';
    portrait?: HTMLImageElement;
    palette: Palette;
  },
): void {
  const { x, y, w, h } = rect;
  const { palette } = options;
  ctx.clearRect(x, y, w, h);

  // The base wedge sits in the bottom ~15%: full width at the foot,
  // narrower at its top, exactly the SVG's slotted-in read.
  const baseTop = y + h * 0.85;
  ctx.fillStyle = options.kind === 'character' ? css([0.32, 0.4, 0.55]) : css([0.5, 0.3, 0.26]);
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w * 0.84, baseTop);
  ctx.lineTo(x + w * 0.16, baseTop);
  ctx.closePath();
  ctx.fill();

  // The card: paper with an ink border.
  const cardH = h * 0.85;
  ctx.fillStyle = css(palette.paper);
  ctx.fillRect(x, y, w, cardH);
  ctx.strokeStyle = css(palette.ink);
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, cardH - 1);

  if (options.portrait) {
    // Cover-fit, matching the SVG's preserveAspectRatio="slice".
    const img = options.portrait;
    const scale = Math.max((w - 2) / img.width, (cardH - 2) / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1, y + 1, w - 2, cardH - 2);
    ctx.clip();
    ctx.drawImage(img, x + 1 + (w - 2 - dw) / 2, y + 1 + (cardH - 2 - dh) / 2, dw, dh);
    ctx.restore();
  } else {
    ctx.fillStyle = css(palette.ink);
    ctx.font = `bold ${Math.round(cardH * 0.42)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(options.label, x + w / 2, y + cardH * 0.55);
  }
}

/**
 * A class sprite (§67): the composed pixel grid painted cell by cell at an
 * integer scale, centred in its rect. Integer scale is the point - a pixel
 * of the art is n×n texels exactly, so nearest sampling never shears a
 * sprite's pixels into unequal columns. Returns false for a class the art
 * table does not know, and the caller falls back to the initials card.
 */
export function paintClassSprite(
  ctx: CanvasRenderingContext2D,
  rect: PackedRect,
  classId: string,
  pose: Pose,
): boolean {
  const art = CLASS_ART[classId];
  const rows = spriteFor(classId, pose);
  if (!art || !rows) return false;
  ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
  const scale = Math.max(1, Math.floor(Math.min(rect.w / SPRITE_W, rect.h / SPRITE_H)));
  const ox = rect.x + Math.floor((rect.w - SPRITE_W * scale) / 2);
  const oy = rect.y + Math.floor((rect.h - SPRITE_H * scale) / 2);
  for (let y = 0; y < SPRITE_H; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      const color = colorOf(rows[y][x] as never, art);
      if (!color) continue;
      ctx.fillStyle = `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`;
      ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    }
  }
  return true;
}

/** How tall each kind of text stands, in drawing units. */
export const TEXT_HEIGHT: Record<string, number> = {
  odds: 7,
  cond: 6,
  float: 9,
  'float-heal': 9,
  zone: 8,
  note: 8,
};

/**
 * Measure a text sprite's drawing-unit size without painting it, so the
 * placement can be built before (or without) the raster landing.
 */
export function measureText(
  ctx: CanvasRenderingContext2D,
  text: string,
  kind: string,
): { w: number; h: number } {
  const heightUnits = TEXT_HEIGHT[kind] ?? 8;
  ctx.font = `bold ${Math.round(heightUnits * PPU)}px ui-monospace, monospace`;
  const metrics = ctx.measureText(text);
  return { w: Math.ceil(metrics.width / PPU) + 2, h: heightUnits + 2 };
}

/**
 * White glyphs with a dark outline. White so the *tint* colors it (a float
 * is red, a heal green, a label ink - all one raster), outlined so it reads
 * over any ground.
 */
export function paintText(
  ctx: CanvasRenderingContext2D,
  rect: PackedRect,
  text: string,
  kind: string,
): void {
  ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
  const heightUnits = TEXT_HEIGHT[kind] ?? 8;
  ctx.font = `bold ${Math.round(heightUnits * PPU)}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    ctx.fillText(text, cx + dx, cy + dy);
  }
  ctx.fillStyle = '#fff';
  ctx.fillText(text, cx, cy);
}
