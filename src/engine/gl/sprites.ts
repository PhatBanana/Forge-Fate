import type { Square } from '../../encounter';
import { keyOf, squareOf } from '../../terrain';
import type { TerrainMap } from '../../terrain';
import type { Token } from '../../components/DungeonMap';
import { BASE_H, HH, HW, PAWN_H, PAWN_W, ZH } from '../iso';
import type { IsoProjection } from '../iso';
import type { Rgba } from './types';

/**
 * Everything that stands up or floats: pawns, terrain glyphs, and text.
 *
 * These are *placements*, not pixels - `{where, size, which atlas entry,
 * tint}` - because rasterization needs a 2D canvas and this module has to run
 * in node. The renderer resolves `key` against the atlas and rasterizes on a
 * miss; the tests here check the placement math, which is the half that can
 * silently drift from the SVG.
 *
 * ## How token state is expressed
 *
 * The SVG expresses is-down/is-bloodied/is-hiding through CSS on the pawn
 * group. Here the card art is one atlas entry per token (face or initials),
 * and state rides on the *tint* plus small shared marker sprites - baking a
 * card variant per state combination would multiply the atlas by every
 * combination of five flags for art that differs only by a wash of color.
 */

export interface SpritePlacement {
  /** Anchor: the bottom-centre, in drawing coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The SVG paint-order key, same scale as the terrain's depth attribute. */
  depth: number;
  /** Which atlas entry to sample: 'pawn:{id}', 'glyph:tree', 'marker:…'. */
  key: string;
  tint: Rgba;
}

export interface TextPlacement {
  text: string;
  /** Anchor: the text's centre, in drawing coordinates. */
  x: number;
  y: number;
  kind: 'odds' | 'cond' | 'float' | 'float-heal' | 'zone' | 'note';
}

const PLAIN: Rgba = [1, 1, 1, 1];

/** The tint each state washes the card with, first match wins. */
const tintFor = (token: Token): Rgba => {
  if (token.down) return [0.45, 0.42, 0.4, 0.75];
  if (token.hiding) return [1, 1, 1, 0.45];
  if (token.bloodied) return [1, 0.62, 0.58, 1];
  return PLAIN;
};

export function tokenSprites(
  tokens: Token[],
  proj: IsoProjection,
): { sprites: SpritePlacement[]; texts: TextPlacement[] } {
  const sprites: SpritePlacement[] = [];
  const texts: TextPlacement[] = [];

  for (const token of tokens) {
    const cn = proj.centreOf(token.at);
    const depth = proj.depthOf(token.at);
    const tint = tintFor(token);

    // The contact shadow, then the standee (base + card in one atlas entry).
    sprites.push({
      x: cn.x,
      y: cn.y + HH * 0.52,
      w: HW * 1.04,
      h: HH * 1.04,
      depth,
      key: 'shadow',
      tint: PLAIN,
    });
    sprites.push({
      x: cn.x,
      y: cn.y,
      w: PAWN_W,
      h: BASE_H + PAWN_H,
      depth,
      key: `pawn:${token.id}`,
      tint,
    });
    // Hit flash: a bright wash re-triggered by the flash sequence number. The
    // renderer animates its alpha down; the placement only says "flashing".
    if (token.flash) {
      sprites.push({
        x: cn.x,
        y: cn.y,
        w: PAWN_W,
        h: BASE_H + PAWN_H,
        depth,
        key: `pawn:${token.id}`,
        tint: [1, 0.4, 0.3, 0.8],
      });
    }
    if (token.active) {
      sprites.push({
        x: cn.x,
        y: cn.y - BASE_H - PAWN_H - 8,
        w: 6,
        h: 4,
        depth,
        key: 'marker:active',
        tint: PLAIN,
      });
    }
    if (token.targetable) {
      sprites.push({
        x: cn.x,
        y: cn.y + HH * 0.6,
        w: HW * 1.2,
        h: HH * 1.2,
        depth,
        key: 'marker:target',
        tint: PLAIN,
      });
    }

    const topY = cn.y - BASE_H - PAWN_H;
    if (token.odds) {
      texts.push({ text: token.odds, x: cn.x, y: topY - 5, kind: 'odds' });
    } else if (token.conditions && token.conditions.length > 0) {
      texts.push({
        text: token.conditions.slice(0, 3).map((c) => c.short).join('·'),
        x: cn.x,
        y: topY - 5,
        kind: 'cond',
      });
    }
    if (token.float) {
      texts.push({
        text: token.float.text,
        x: cn.x,
        y: topY + 2,
        kind: token.float.heal ? 'float-heal' : 'float',
      });
    }
  }

  return { sprites, texts };
}

/** The glyph each prop kind stands as, sized against the tile like the SVG's. */
const GLYPHS: Record<string, { w: number; h: number } | undefined> = {
  tree: { w: HW * 0.9, h: ZH * 2.6 },
  pillar: { w: HW * 0.75, h: ZH * 1.8 },
  rock: { w: HW * 0.7, h: ZH * 1.1 },
  rubble: { w: HW * 0.8, h: ZH * 0.7 },
};

/**
 * Standing props as billboards. Wall, water and floor are cell *surfaces*
 * and were built into the terrain mesh; these four stand on top of theirs.
 */
export function glyphSprites(terrain: TerrainMap, proj: IsoProjection): SpritePlacement[] {
  const out: SpritePlacement[] = [];
  for (const [key, kind] of Object.entries(terrain)) {
    const size = GLYPHS[kind];
    if (!size) continue;
    const at = squareOf(key);
    const cn = proj.centreOf(at, proj.drawZ(at));
    out.push({
      x: cn.x,
      y: cn.y,
      w: size.w,
      h: size.h,
      depth: proj.depthOf(at),
      key: `glyph:${kind}`,
      tint: PLAIN,
    });
  }
  return out;
}

export function zoneLabels(
  zones: { label: string; origin: Square }[],
  proj: IsoProjection,
): TextPlacement[] {
  return zones.map((zone) => {
    const cn = proj.centreOf(zone.origin);
    return { text: zone.label, x: cn.x, y: cn.y - HH * 2, kind: 'zone' as const };
  });
}

/**
 * The ruler note, clamped inside the visible window exactly as the SVG
 * clamps it - zoomed in, a note pinned to the whole drawing is a note the
 * reader cannot see.
 */
export function noteText(
  note: string | undefined,
  noteAt: Square | null,
  view: { x: number; y: number; width: number },
  proj: IsoProjection,
): TextPlacement | null {
  if (!note || !noteAt) return null;
  const cn = proj.centreOf(noteAt);
  return {
    text: note,
    x: Math.max(view.x + 20, Math.min(view.x + view.width - 20, cn.x)),
    y: Math.max(view.y + 10, cn.y - HH * 2.2),
    kind: 'note',
  };
}

/** One stable ordering for a frame's sprites: the SVG's depth sort. */
export const byDepth = (sprites: SpritePlacement[]): SpritePlacement[] =>
  [...sprites].sort((a, b) => a.depth - b.depth);

export { keyOf };
