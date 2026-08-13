import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../dungeon';
import { isoProjection } from '../iso';
import { BASE_H, HH, PAWN_H, PAWN_W } from '../iso';
import { LIGHT, DARK, cellJitter } from './palette';
import { PRISM_INDICES, PRISM_VERTICES, buildTerrain, depthRange } from './scene';
import { fogWash, gloomWash, reachWash, zoneWash } from './overlays';
import { ARC_SEGMENTS, IMPACT_SEGMENTS, LINE_FLOATS, arcLines, sightLines } from './lines';
import { glyphSprites, tokenSprites, zoneLabels } from './sprites';
import type { Token } from '../../components/DungeonMap';
import { VERTEX_FLOATS } from './types';

/**
 * §66.2: the scene as data, tested where the GPU cannot hide it.
 *
 * Everything here runs in node with no GL context - which is the point of
 * the pure builders: the geometry maths, the layer contracts and the color
 * plumbing are all checkable as arrays, and the renderer that consumes them
 * is left with nothing to be wrong about except GL state.
 */

const arena = (w = 4, h = 3) => generateDungeon('x', { rooms: 0, width: w, height: h });
const projOf = (w = 4, h = 3, elevation = {}, terrain = {}, facing = 0) =>
  isoProjection(arena(w, h), elevation, terrain, facing);

describe('the palettes', () => {
  it('carry the same keys, so a theme swap can never miss a color', () => {
    expect(Object.keys(DARK).sort()).toEqual(Object.keys(LIGHT).sort());
  });
});

describe('the terrain mesh', () => {
  it('builds a full prism per ground cell', () => {
    const proj = projOf(4, 3);
    const mesh = buildTerrain(arena(4, 3), {}, {}, proj, LIGHT);
    expect(mesh.vertices.length).toBe(12 * PRISM_VERTICES * VERTEX_FLOATS);
    expect(mesh.indices.length).toBe(12 * PRISM_INDICES);
  });

  it('needs 32-bit indices, by arithmetic a 64×48 board nearly proves', () => {
    /*
      A blank 64×48 board is 3,072 cells × 20 vertices = 61,440 - inside a
      Uint16's 65,536, but by six percent. This test does the sum on the real
      builder so the day a prism gains a vertex, the assertion that we ship
      Uint32 stops being decoration and starts being the fix.
    */
    const big = arena(64, 48);
    const proj = isoProjection(big, {}, {}, 0);
    const mesh = buildTerrain(big, {}, {}, proj, LIGHT);
    expect(mesh.vertices.length / VERTEX_FLOATS).toBe(61_440);
    expect(mesh.indices).toBeInstanceOf(Uint32Array);
  });

  it('projects the cap exactly where the SVG draws its top face', () => {
    const proj = projOf();
    const mesh = buildTerrain(arena(), {}, {}, proj, LIGHT);
    // The first cell's first four vertices are its cap, in ring order.
    const corners = proj.faceCorners({ x: 0, y: 0 }, 0);
    for (let i = 0; i < 4; i++) {
      expect(mesh.vertices[i * VERTEX_FLOATS]).toBe(corners[i][0]);
      expect(mesh.vertices[i * VERTEX_FLOATS + 1]).toBe(corners[i][1]);
    }
  });

  it('raises a wall two steps and colors it as a wall', () => {
    const terrain = { '1,1': 'wall' as const };
    const proj = projOf(4, 3, {}, terrain);
    const mesh = buildTerrain(arena(4, 3), {}, terrain, proj, LIGHT);
    // Find the wall cell's cap: its y is lifted by drawZ · ZH.
    const capY = proj.faceCorners({ x: 1, y: 1 }, proj.drawZ({ x: 1, y: 1 }))[0][1];
    const flatY = proj.faceCorners({ x: 1, y: 1 }, 0)[0][1];
    expect(capY).toBeLessThan(flatY);
    // And some vertex in the mesh sits at exactly that lifted height with
    // the wall's color rather than the ground's.
    const floats = mesh.vertices;
    let found = false;
    for (let v = 0; v < floats.length; v += VERTEX_FLOATS) {
      if (floats[v + 1] === capY && Math.abs(floats[v + 5] - LIGHT.wall[0] * cellJitter(1, 1)) < 1e-6) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('shades the four skirts differently, the low-poly tell', () => {
    const proj = projOf(1, 1);
    const mesh = buildTerrain(arena(1, 1), {}, {}, proj, LIGHT);
    // One cell: vertices 4..19 are the four side quads. Each side's first
    // vertex carries its face shade; collect the four reds.
    const reds = [0, 1, 2, 3].map(
      (side) => mesh.vertices[(4 + side * 4) * VERTEX_FLOATS + 5],
    );
    expect(new Set(reds).size).toBe(4);
  });

  it('jitters per cell, deterministically', () => {
    expect(cellJitter(3, 7)).toBe(cellJitter(3, 7));
    expect(cellJitter(3, 7)).not.toBe(cellJitter(7, 3));
    // Bounded: never enough to fight the dither.
    for (let x = 0; x < 20; x++) {
      for (let y = 0; y < 20; y++) {
        expect(cellJitter(x, y)).toBeGreaterThanOrEqual(0.96);
        expect(cellJitter(x, y)).toBeLessThanOrEqual(1.04);
      }
    }
  });

  it('normalises depth against the rotated frame', () => {
    expect(depthRange(projOf(10, 4))).toBe(14);
    expect(depthRange(isoProjection(arena(10, 4), {}, {}, 1))).toBe(14);
  });
});

describe('the washes', () => {
  const proj = projOf();

  it('draws the dash tier in its own tint', () => {
    const mesh = reachWash(
      [
        { at: { x: 0, y: 0 } },
        { at: { x: 1, y: 0 }, dash: true },
      ],
      proj,
      LIGHT,
    );
    expect(mesh.vertices.length).toBe(2 * 4 * VERTEX_FLOATS);
    const alphaOf = (quad: number) => mesh.vertices[quad * 4 * VERTEX_FLOATS + 8];
    expect(alphaOf(0)).toBeCloseTo(LIGHT.reach[3]);
    expect(alphaOf(1)).toBeCloseTo(LIGHT.reachDash[3]);
  });

  it('wraps zone tints mod 4 and fades a ghost', () => {
    const squares = [{ x: 0, y: 0 }];
    const five = zoneWash([{ tint: 5, squares }], proj, LIGHT);
    const one = zoneWash([{ tint: 1, squares }], proj, LIGHT);
    expect([...five.vertices]).toEqual([...one.vertices]);
    const ghost = zoneWash([{ tint: 1, squares, ghost: true }], proj, LIGHT);
    expect(ghost.vertices[8]).toBeCloseTo(LIGHT.zones[1][3] * LIGHT.ghostAlpha);
  });

  it('tints gloom by level and only on squares that have some', () => {
    const ground = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
    const mesh = gloomWash({ '0,0': 'dim', '2,0': 'magical-dark' }, ground, proj, LIGHT);
    expect(mesh.vertices.length).toBe(2 * 4 * VERTEX_FLOATS);
    expect(mesh.vertices[8]).toBeCloseTo(LIGHT.gloomDim[3]);
    expect(mesh.vertices[4 * VERTEX_FLOATS + 8]).toBeCloseTo(LIGHT.gloomMagicalDark[3]);
  });

  it('fogs the unseen near-opaque, the explored dimly, the visible not at all', () => {
    const ground = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
    const fog = { visible: new Set(['0,0']), explored: new Set(['1,0']) };
    const mesh = fogWash(fog, ground, proj, LIGHT);
    // Two quads: explored (1,0) and unknown (2,0). Visible (0,0) is absent.
    expect(mesh.vertices.length).toBe(2 * 4 * VERTEX_FLOATS);
    expect(mesh.vertices[8]).toBeCloseTo(LIGHT.fogKnown[3]);
    expect(mesh.vertices[4 * VERTEX_FLOATS + 8]).toBeCloseTo(LIGHT.fogUnknown[3]);
    expect(fogWash(null, ground, proj, LIGHT).vertices.length).toBe(0);
  });
});

describe('the lines', () => {
  const proj = projOf(6, 6);

  it('colors a blocked sight line differently', () => {
    const lines = sightLines(
      [
        { from: { x: 0, y: 0 }, to: { x: 3, y: 0 }, visible: true },
        { from: { x: 0, y: 0 }, to: { x: 0, y: 3 }, visible: false },
      ],
      proj,
      LIGHT,
    );
    expect(lines.length).toBe(4 * LINE_FLOATS);
    expect(lines[2]).toBeCloseTo(LIGHT.sight[0]);
    expect(lines[2 * LINE_FLOATS + 2]).toBeCloseTo(LIGHT.sightBlocked[0]);
  });

  it('tessellates the arc from centre to centre with an impact ring', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 4, y: 2 };
    const lines = arcLines({ from, to }, proj, LIGHT);
    expect(lines.length).toBe((ARC_SEGMENTS + IMPACT_SEGMENTS) * 2 * LINE_FLOATS);
    // The curve's first vertex is the thrower's centre, and the last curve
    // vertex is the target's - the same endpoints the SVG's path has.
    const a = proj.centreOf(from);
    const b = proj.centreOf(to);
    expect(lines[0]).toBeCloseTo(a.x);
    expect(lines[1]).toBeCloseTo(a.y);
    const lastCurve = (ARC_SEGMENTS * 2 - 1) * LINE_FLOATS;
    expect(lines[lastCurve]).toBeCloseTo(b.x);
    expect(lines[lastCurve + 1]).toBeCloseTo(b.y);
  });

  it('draws nothing for a throw onto your own square', () => {
    expect(arcLines({ from: { x: 1, y: 1 }, to: { x: 1, y: 1 } }, proj, LIGHT).length).toBe(0);
  });
});

describe('the sprites', () => {
  const proj = projOf(6, 6);
  const token = (over: Partial<Token> = {}): Token => ({
    id: 't1',
    label: 'GO',
    at: { x: 2, y: 2 },
    kind: 'monster',
    title: 'Goblin',
    ...over,
  });

  it('stands a pawn and its shadow on the tile centre', () => {
    const { sprites } = tokenSprites([token()], proj);
    const pawn = sprites.find((s) => s.key === 'pawn:t1');
    const cn = proj.centreOf({ x: 2, y: 2 });
    expect(pawn).toMatchObject({ x: cn.x, y: cn.y, w: PAWN_W, h: BASE_H + PAWN_H });
    expect(sprites.some((s) => s.key === 'shadow')).toBe(true);
  });

  it('expresses state as tint rather than as new art', () => {
    const { sprites } = tokenSprites([token({ down: true })], proj);
    const pawn = sprites.find((s) => s.key === 'pawn:t1')!;
    expect(pawn.tint[3]).toBeLessThan(1);
    const plain = tokenSprites([token()], proj).sprites.find((s) => s.key === 'pawn:t1')!;
    expect(plain.tint).toEqual([1, 1, 1, 1]);
  });

  it('floats damage text over the card, and odds where the SVG puts them', () => {
    const { texts } = tokenSprites(
      [token({ odds: '65%', float: { seq: 1, text: '-7' } })],
      proj,
    );
    expect(texts.map((t) => t.kind).sort()).toEqual(['float', 'odds']);
    const cn = proj.centreOf({ x: 2, y: 2 });
    for (const t of texts) expect(t.x).toBe(cn.x);
  });

  it('prefers odds over condition shorts, exactly as the SVG does', () => {
    const conditions = [{ short: 'Pr', name: 'Prone' }];
    const both = tokenSprites([token({ odds: '40%', conditions })], proj).texts;
    expect(both.some((t) => t.kind === 'cond')).toBe(false);
    const alone = tokenSprites([token({ conditions })], proj).texts;
    expect(alone.some((t) => t.kind === 'cond')).toBe(true);
  });

  it('stands a class sprite for a portraitless character, in their stance (§67)', () => {
    const { sprites } = tokenSprites(
      [token({ kind: 'character', classId: 'wizard', stance: 'battle' })],
      proj,
    );
    const figure = sprites.find((s) => s.key.startsWith('sprite:'));
    expect(figure?.key).toBe('sprite:wizard:battle');
    // Taller than wide in the grid's own 12:18 proportion.
    expect(figure!.h / figure!.w).toBeCloseTo(1.5);
  });

  it('lets a recorded portrait outrank the house silhouette', () => {
    const { sprites } = tokenSprites(
      [token({ kind: 'character', classId: 'wizard', stance: 'battle', portrait: 'data:x' })],
      proj,
    );
    expect(sprites.some((s) => s.key.startsWith('sprite:'))).toBe(false);
    expect(sprites.some((s) => s.key === 'pawn:t1')).toBe(true);
  });

  it('keeps monsters and unknown classes on their cards', () => {
    const monster = tokenSprites([token({ stance: 'battle' })], proj).sprites;
    expect(monster.some((s) => s.key.startsWith('sprite:'))).toBe(false);
    const custom = tokenSprites(
      [token({ kind: 'character', classId: 'blood-hunter', stance: 'idle' })],
      proj,
    ).sprites;
    expect(custom.some((s) => s.key.startsWith('sprite:'))).toBe(false);
  });

  it('shares one atlas entry between two of the same class and stance', () => {
    const { sprites } = tokenSprites(
      [
        token({ id: 'a', kind: 'character', classId: 'fighter', stance: 'idle' }),
        token({ id: 'b', kind: 'character', classId: 'fighter', stance: 'idle', at: { x: 3, y: 3 } }),
      ],
      proj,
    );
    const keys = sprites.filter((s) => s.key.startsWith('sprite:')).map((s) => s.key);
    expect(keys).toEqual(['sprite:fighter:idle', 'sprite:fighter:idle']);
  });

  it('moves the figure with the animation clock but leaves the shadow grounded (§68)', () => {
    const motion = new Map([['t1', { dx: 5, dy: -3, gdx: 0, gdy: 0, ddepth: 0, flashAlpha: 0 }]]);
    const { sprites } = tokenSprites([token()], proj, motion);
    const cn = proj.centreOf({ x: 2, y: 2 });
    const pawn = sprites.find((s) => s.key === 'pawn:t1')!;
    expect(pawn.x).toBeCloseTo(cn.x + 5);
    expect(pawn.y).toBeCloseTo(cn.y - 3);
    // The shadow is what makes the lunge read as a step and not a slide.
    const shadow = sprites.find((s) => s.key === 'shadow')!;
    expect(shadow.x).toBeCloseTo(cn.x);
  });

  it('walks the shadow and the paint order along with a walking body (§69)', () => {
    const motion = new Map([
      ['t1', { dx: -20, dy: -12, gdx: -20, gdy: -10, ddepth: -2, flashAlpha: 0 }],
    ]);
    const { sprites } = tokenSprites([token()], proj, motion);
    const cn = proj.centreOf({ x: 2, y: 2 });
    const shadow = sprites.find((s) => s.key === 'shadow')!;
    expect(shadow.x).toBeCloseTo(cn.x - 20);
    expect(shadow.y).toBeCloseTo(cn.y - 10 + HH * 0.52);
    // Both figure and shadow sort where the body IS, not where it will land.
    const pawn = sprites.find((s) => s.key === 'pawn:t1')!;
    expect(pawn.depth).toBeCloseTo(proj.depthOf({ x: 2, y: 2 }) - 2);
    expect(shadow.depth).toBeCloseTo(pawn.depth);
  });

  it('lets the clock own the hit wash, and keeps the static wash for clockless callers (§68)', () => {
    // With a clock: the wash's opacity is the fade's, and a fade that has
    // ended (alpha 0) means no wash even though the token still says flash.
    const fading = tokenSprites(
      [token({ flash: 1 })],
      proj,
      new Map([['t1', { dx: 0, dy: 0, gdx: 0, gdy: 0, ddepth: 0, flashAlpha: 0.4 }]]),
    ).sprites;
    const wash = fading.filter((s) => s.key === 'pawn:t1');
    expect(wash.length).toBe(2);
    expect(wash[1].tint[3]).toBeCloseTo(0.4);
    const done = tokenSprites([token({ flash: 1 })], proj, new Map()).sprites;
    expect(done.filter((s) => s.key === 'pawn:t1').length).toBe(1);
    // Without a clock the §67 static wash stands.
    const static_ = tokenSprites([token({ flash: 1 })], proj).sprites;
    expect(static_.filter((s) => s.key === 'pawn:t1').length).toBe(2);
  });

  it('billboards the four standing props and leaves surfaces to the mesh', () => {
    const sprites = glyphSprites(
      { '0,0': 'tree', '1,0': 'pillar', '2,0': 'rock', '3,0': 'rubble', '4,0': 'wall', '5,0': 'water' },
      proj,
    );
    expect(sprites.map((s) => s.key).sort()).toEqual([
      'glyph:pillar',
      'glyph:rock',
      'glyph:rubble',
      'glyph:tree',
    ]);
  });

  it('lifts a zone label above its origin, like the SVG', () => {
    const [label] = zoneLabels([{ label: 'Web', origin: { x: 1, y: 1 } }], proj);
    expect(label.text).toBe('Web');
    expect(label.y).toBe(proj.centreOf({ x: 1, y: 1 }).y - HH * 2);
  });
});
