import { describe, expect, it } from 'vitest';
import { createShelfAtlas, uvOf } from './atlas';

/**
 * §66.2: the atlas bookkeeping, without a pixel in sight.
 *
 * The rasterization happens on a canvas the renderer owns; what can go
 * quietly wrong is the packing - two entries sharing texels, a full atlas
 * corrupting instead of refusing - and that is all arithmetic.
 */

describe('the shelf atlas', () => {
  it('packs along a shelf and starts a new one when the width runs out', () => {
    const atlas = createShelfAtlas(64, 64);
    const a = atlas.pack('a', 30, 10)!;
    const b = atlas.pack('b', 30, 10)!;
    const c = atlas.pack('c', 30, 10)!;
    expect(a.y).toBe(b.y);
    expect(b.x).toBeGreaterThan(a.x);
    // The third does not fit beside the second (31+31+31 > 64): new shelf.
    expect(c.y).toBeGreaterThan(a.y);
    expect(c.x).toBe(0);
  });

  it('never overlaps two entries', () => {
    const atlas = createShelfAtlas(128, 128);
    const rects = [];
    for (let i = 0; i < 30; i++) {
      const rect = atlas.pack(`k${i}`, 10 + (i % 7) * 4, 8 + (i % 5) * 3);
      if (rect) rects.push(rect);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const apart =
          a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it('is idempotent per key', () => {
    const atlas = createShelfAtlas(64, 64);
    const first = atlas.pack('face', 20, 20);
    expect(atlas.pack('face', 20, 20)).toBe(first);
    expect(atlas.keys()).toEqual(['face']);
  });

  it('refuses when full rather than corrupting, and reset starts an era', () => {
    const atlas = createShelfAtlas(32, 32);
    expect(atlas.pack('big', 30, 30)).not.toBeNull();
    // No room for a second 30-tall shelf.
    expect(atlas.pack('more', 30, 30)).toBeNull();
    // And an entry that could never fit is refused outright.
    expect(atlas.pack('huge', 100, 10)).toBeNull();
    const era = atlas.generation;
    atlas.reset();
    expect(atlas.generation).toBe(era + 1);
    expect(atlas.rectFor('big')).toBeNull();
    expect(atlas.pack('more', 30, 30)).not.toBeNull();
  });

  it('converts a rect to the UVs the vertex format wants', () => {
    const atlas = createShelfAtlas(100, 200);
    const rect = atlas.pack('x', 50, 100)!;
    expect(uvOf(rect, atlas)).toEqual({ u0: 0, v0: 0, u1: 0.5, v1: 0.5 });
  });
});
