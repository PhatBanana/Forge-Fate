import type { Square } from '../../encounter';
import { keyOf, squareOf } from '../../terrain';
import type { TerrainMap } from '../../terrain';
import type { Token } from '../../components/DungeonMap';
import { BASE_H, HH, HW, PAWN_H, PAWN_W, ZH } from '../iso';
import { CLASS_ART, SPRITE_H, SPRITE_W } from './pixelart';
import type { IsoProjection } from '../iso';
import { finishMesh, newMesh, pushQuad, pushVertex } from './types';
import type { AtlasRect, Mesh, Rgba } from './types';

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
  /**
   * §68: per-token offsets and flash opacity from the animation clock. The
   * figure moves; the shadow stays grounded, which is what makes a lunge
   * read as a step rather than the whole piece sliding. When a motion map is
   * provided, the hit wash exists only while an animation says so - passing
   * none keeps the §67 static wash for callers with no clock.
   */
  motion?: Map<string, { dx: number; dy: number; flashAlpha: number }>,
): { sprites: SpritePlacement[]; texts: TextPlacement[] } {
  const sprites: SpritePlacement[] = [];
  const texts: TextPlacement[] = [];

  for (const token of tokens) {
    const cn = proj.centreOf(token.at);
    const depth = proj.depthOf(token.at);
    const tint = tintFor(token);
    const moved = motion?.get(token.id);
    const mx = cn.x + (moved?.dx ?? 0);
    const my = cn.y + (moved?.dy ?? 0);

    /*
      §67: which art stands on the tile. A recorded portrait keeps the §37
      card - somebody's own face beats the house silhouette. A portraitless
      character whose class the sprite table knows gets the class sprite in
      the token's stance, and the atlas entry is *shared* per
      (class, stance) rather than per token: five portraitless fighters are
      one raster, not five. Everyone else (monsters, custom classes) keeps
      the initials card.
    */
    const sprite =
      !token.portrait && token.classId && CLASS_ART[token.classId]
        ? `sprite:${token.classId}:${token.stance ?? 'idle'}`
        : null;
    const key = sprite ?? `pawn:${token.id}`;
    // The sprite's grid is 12×18; the card's proportions are the pawn's.
    const w = sprite ? PAWN_W * 1.1 : PAWN_W;
    const h = sprite ? (w * SPRITE_H) / SPRITE_W : BASE_H + PAWN_H;

    // The contact shadow, then the figure.
    sprites.push({
      x: cn.x,
      y: cn.y + HH * 0.52,
      w: HW * 1.04,
      h: HH * 1.04,
      depth,
      key: 'shadow',
      tint: PLAIN,
    });
    sprites.push({ x: mx, y: my, w, h, depth, key, tint });
    // The hit wash: with a clock, its opacity is the animation's and it ends
    // when the fade does; without one, the §67 static wash stands.
    const flashAlpha = motion ? (moved?.flashAlpha ?? 0) : token.flash ? 0.8 : 0;
    if (token.flash && flashAlpha > 0) {
      sprites.push({ x: mx, y: my, w, h, depth, key, tint: [1, 0.4, 0.3, flashAlpha] });
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

/**
 * Placements into GPU quads, in the same nine-float format the terrain uses,
 * so the renderer draws sprites with the geometry program and one uniform's
 * difference (the alpha cutout).
 *
 * Pure, and deliberately so: `rectFor` is injected, so this converts and is
 * tested without an atlas canvas in sight. A placement whose key has no rect
 * yet (a portrait still decoding) is skipped this frame rather than drawn as
 * garbage - it appears the frame after the rasterizer lands it.
 */
export function spriteQuads(
  placements: SpritePlacement[],
  rectFor: (key: string) => AtlasRect | null,
): Mesh {
  const mesh = newMesh();
  for (const sprite of byDepth(placements)) {
    const uv = rectFor(sprite.key);
    if (!uv) continue;
    const x0 = sprite.x - sprite.w / 2;
    const x1 = sprite.x + sprite.w / 2;
    const y0 = sprite.y - sprite.h;
    const y1 = sprite.y;
    const a = pushVertex(mesh, x0, y0, sprite.depth, uv.u0, uv.v0, sprite.tint);
    const b = pushVertex(mesh, x1, y0, sprite.depth, uv.u1, uv.v0, sprite.tint);
    const c = pushVertex(mesh, x1, y1, sprite.depth, uv.u1, uv.v1, sprite.tint);
    const d = pushVertex(mesh, x0, y1, sprite.depth, uv.u0, uv.v1, sprite.tint);
    pushQuad(mesh, a, b, c, d);
  }
  return finishMesh(mesh);
}

/** One stable ordering for a frame's sprites: the SVG's depth sort. */
export const byDepth = (sprites: SpritePlacement[]): SpritePlacement[] =>
  [...sprites].sort((a, b) => a.depth - b.depth);

export { keyOf };
