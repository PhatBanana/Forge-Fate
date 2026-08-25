import { describe, expect, it } from 'vitest';
import { createShelfAtlas } from './atlas';
import { ATLAS_SIZE } from './raster';
import { TERRAIN_UVS, buildTerrain } from './scene';
import { LIGHT } from './palette';
import { isoProjection } from '../iso';
import { generateDungeon } from '../dungeon';
import {
  RESERVED_HEIGHT,
  SURFACE_ART,
  SURFACE_KINDS,
  SURFACE_LEVELS,
  SURFACE_SIZE,
  slotOf,
} from './surfaceart';

/*
  §150. The surfaces, and the invariant that keeps them where they are.

  The failure this section can have is not "the wall looks wrong". It is
  the floor sampling somebody's damage float, which happens the moment a
  packed entry lands on a terrain texture, and only after the atlas has
  filled - a bug that would ship green and appear an hour into a session.
  Most of what follows is about that.
*/

const arena = (w = 6, h = 6) => generateDungeon('x', { rooms: 0, width: w, height: h });
const proj = isoProjection(arena(), {}, {}, 0);

describe('the textures themselves', () => {
  it('is a square grid of legal levels, for every surface', () => {
    for (const kind of SURFACE_KINDS) {
      const rows = SURFACE_ART[kind];
      expect(rows.length, kind).toBe(SURFACE_SIZE);
      for (const row of rows) {
        expect(row.length, kind).toBe(SURFACE_SIZE);
        for (const level of row) expect(SURFACE_LEVELS[level], `${kind}: ${level}`).toBeDefined();
      }
    }
  });

  it('never brightens past the colour the palette chose', () => {
    /*
      The shader is `tex * vColor`, so a level above one is a level that
      cannot happen - it would clamp at white and quietly flatten the
      relief it was drawn to give.
    */
    for (const level of Object.values(SURFACE_LEVELS)) {
      expect(level).toBeGreaterThan(0);
      expect(level).toBeLessThanOrEqual(1);
    }
  });

  it('gives every surface a different one - six textures, not one reused', () => {
    const seen = new Set(SURFACE_KINDS.map((kind) => SURFACE_ART[kind].join('\n')));
    expect(seen.size).toBe(SURFACE_KINDS.length);
  });

  it('tiles - no edge is a bigger step than the material’s own features', () => {
    /*
      Each face maps one whole texture, so a tile's right edge meets its
      neighbour's left edge on every square boundary. A texture that did not
      tile would draw a seam down every one of them, which is the artefact a
      player notices immediately and never stops seeing.

      Measured against the texture's own worst interior step rather than
      against a number somebody picked: the claim is that the join is not
      more of a discontinuity than the material already contains, which is
      exactly what "it tiles" means for art like this.
    */
    for (const kind of SURFACE_KINDS) {
      const rows = SURFACE_ART[kind];
      const at = (x: number, y: number) => SURFACE_LEVELS[rows[y][x]];
      const last = SURFACE_SIZE - 1;

      let worst = 0;
      for (let y = 0; y < SURFACE_SIZE; y++) {
        for (let x = 0; x < last; x++) {
          worst = Math.max(worst, Math.abs(at(x, y) - at(x + 1, y)));
          worst = Math.max(worst, Math.abs(at(y, x) - at(y, x + 1)));
        }
      }

      let across = 0;
      let down = 0;
      for (let i = 0; i < SURFACE_SIZE; i++) {
        across += Math.abs(at(last, i) - at(0, i));
        down += Math.abs(at(i, last) - at(i, 0));
      }
      expect(across / SURFACE_SIZE, `${kind} wraps left to right`).toBeLessThanOrEqual(worst);
      expect(down / SURFACE_SIZE, `${kind} wraps top to bottom`).toBeLessThanOrEqual(worst);
    }
  });

  it('draws a wall face that is not the rock face beside it', () => {
    // The whole point of the sixth texture: broken rock and coursed masonry
    // are not the same material, and drawing them alike is what made walls
    // read as coloured blocks.
    expect(SURFACE_ART.wallSide).not.toEqual(SURFACE_ART.side);
  });
});

describe('where they live, which is the part that can break silently', () => {
  it('keeps every slot inside the reserved strip', () => {
    for (const kind of SURFACE_KINDS) {
      const slot = slotOf(kind);
      expect(slot.y + slot.h, kind).toBeLessThanOrEqual(RESERVED_HEIGHT);
      expect(slot.x + slot.w, kind).toBeLessThanOrEqual(ATLAS_SIZE);
    }
  });

  it('never overlaps two surfaces, nor the white texel', () => {
    const boxes = [{ x: 0, y: 0, w: 2, h: 2 }, ...SURFACE_KINDS.map(slotOf)];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const apart =
          a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart, `${i} overlaps ${j}`).toBe(true);
      }
    }
  });

  it('keeps the shelf packer out of the strip, from the first entry', () => {
    const atlas = createShelfAtlas(ATLAS_SIZE, ATLAS_SIZE, RESERVED_HEIGHT);
    const rect = atlas.pack('anything', 8, 8)!;
    expect(rect.y).toBeGreaterThanOrEqual(RESERVED_HEIGHT);
  });

  it('keeps it out after a reset too, which is when this would go wrong', () => {
    /*
      A reset is not a bug - the text region churns and a full atlas is an
      eventuality. It is also the only moment the packer could wander back
      up into the strip, and the terrain mesh would not notice: its UVs were
      baked into a vertex buffer generations ago.
    */
    const atlas = createShelfAtlas(ATLAS_SIZE, ATLAS_SIZE, RESERVED_HEIGHT);
    atlas.pack('first', 64, 64);
    atlas.reset();
    const rect = atlas.pack('after', 8, 8)!;
    expect(rect.y).toBeGreaterThanOrEqual(RESERVED_HEIGHT);
  });

  it('leaves the white texel at the atlas origin, where WHITE points', () => {
    // `WHITE` in types.ts is a degenerate UV at (0, 0). Every untextured
    // wash and prism in the app samples it.
    for (const kind of SURFACE_KINDS) expect(slotOf(kind).x).toBeGreaterThanOrEqual(4);
  });
});

describe('what the mesh samples', () => {
  it('carries real UVs rather than the white texel', () => {
    const flat = buildTerrain(arena(), {}, {}, proj, LIGHT);
    const textured = buildTerrain(arena(), {}, {}, proj, LIGHT, undefined, TERRAIN_UVS);
    expect(textured.vertices).not.toEqual(flat.vertices);
    expect(textured.vertices.length).toBe(flat.vertices.length);
  });

  it('sends a wall’s faces to the masonry and everything else to the rock', () => {
    const walled = buildTerrain(
      arena(2, 2),
      {},
      { '0,0': 'wall' },
      proj,
      LIGHT,
      undefined,
      TERRAIN_UVS,
    );
    const us = new Set<number>();
    // Vertex layout is x, y, depth, u, v, then colour - see types.ts.
    for (let i = 0; i < walled.vertices.length; i += 9) us.add(walled.vertices[i + 3]);
    expect(us.has(TERRAIN_UVS.wallSide.u0)).toBe(true);
    expect(us.has(TERRAIN_UVS.side.u0)).toBe(true);
  });

  it('still draws flat when asked to, which is what the tests below assume', () => {
    const flat = buildTerrain(arena(1, 1), {}, {}, proj, LIGHT);
    for (let i = 0; i < flat.vertices.length; i += 9) {
      expect(flat.vertices[i + 3]).toBe(0);
    }
  });
});
