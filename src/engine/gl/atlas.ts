/**
 * A shelf atlas: rectangles packed left-to-right in rows, rows stacked top
 * to bottom. The classic texture-atlas structure, chosen for the classic
 * reason - everything this app rasterizes is roughly text-height or
 * card-height, and shelves waste almost nothing when heights cluster.
 *
 * Pure bookkeeping. The pixels live on a canvas the *renderer* owns; this
 * module only answers "where does this key's image live" and "is there room",
 * so it tests in node without a canvas in sight.
 *
 * ## When it fills
 *
 * The text region churns (damage floats are born and die every round), so a
 * full atlas is an eventuality, not a bug. The policy is the simplest one
 * that cannot corrupt: `pack` returns null, the caller calls `reset()` and
 * re-rasterizes the keys it still needs into a fresh generation. An LRU
 * *eviction* would reclaim single slots instead, but freeing one rect in a
 * shelf leaves a hole only an equal-or-smaller rect can use - the bookkeeping
 * outgrows the win at this scale (dozens of entries, kilobyte textures).
 * `generation` exists so the renderer knows every previously handed-out rect
 * just died.
 */

export interface PackedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShelfAtlas {
  readonly width: number;
  readonly height: number;
  /** Which packing era rects belong to; bumped by every reset. */
  readonly generation: number;
  /** The rect for a key, or null if it has never been packed (or died). */
  rectFor(key: string): PackedRect | null;
  /**
   * Pack a new rect for a key. Returns the rect, the *existing* rect if the
   * key is already packed (idempotent), or null when there is no room - at
   * which point the caller resets and repacks what it still needs.
   */
  pack(key: string, w: number, h: number): PackedRect | null;
  /** Forget everything and start a new generation. */
  reset(): void;
  /** Every live key, for the repack after a reset. */
  keys(): string[];
}

/** A texel of breathing room around every entry, against bleed at nearest
    filtering when UVs land on a seam. */
const GUTTER = 1;

export function createShelfAtlas(
  width: number,
  height: number,
  /**
   * §150: rows at the top the packer may not use.
   *
   * The terrain textures live there at fixed addresses, because the terrain
   * mesh bakes its UVs into a vertex buffer and outlives any number of atlas
   * generations - UVs that moved when the atlas filled would smear the floor
   * with somebody's damage float. Everything else is packed and re-packed on
   * demand and is looked up by key at the moment it is drawn.
   */
  reserved = 0,
): ShelfAtlas {
  let entries = new Map<string, PackedRect>();
  let shelfY = reserved;
  let shelfH = 0;
  let cursorX = 0;
  let generation = 0;

  const atlas: ShelfAtlas = {
    width,
    height,
    get generation() {
      return generation;
    },
    rectFor: (key) => entries.get(key) ?? null,
    pack(key, w, h) {
      const existing = entries.get(key);
      if (existing) return existing;
      const needW = w + GUTTER;
      const needH = h + GUTTER;
      if (needW > width || needH > height) return null;
      // Open a new shelf when this one cannot take the width.
      if (cursorX + needW > width) {
        shelfY += shelfH;
        shelfH = 0;
        cursorX = 0;
      }
      // A taller entry raises the current shelf, if the atlas still allows.
      const rowH = Math.max(shelfH, needH);
      if (shelfY + rowH > height) return null;
      shelfH = rowH;
      const rect = { x: cursorX, y: shelfY, w, h };
      cursorX += needW;
      entries.set(key, rect);
      return rect;
    },
    reset() {
      entries = new Map();
      shelfY = reserved;
      shelfH = 0;
      cursorX = 0;
      generation += 1;
    },
    keys: () => [...entries.keys()],
  };
  return atlas;
}

/** A packed rect as normalised UVs into a texture of this atlas's size. */
export const uvOf = (
  rect: PackedRect,
  atlas: { width: number; height: number },
): { u0: number; v0: number; u1: number; v1: number } => ({
  u0: rect.x / atlas.width,
  v0: rect.y / atlas.height,
  u1: (rect.x + rect.w) / atlas.width,
  v1: (rect.y + rect.h) / atlas.height,
});
