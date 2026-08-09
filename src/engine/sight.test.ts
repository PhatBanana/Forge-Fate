import { describe, expect, it } from 'vitest';
import { COVER_AC, lineOfSight, lineSquares, walkable } from './sight';
import type { SightContext } from './sight';
import { generateDungeon } from './dungeon';
import { paint } from '../terrain';
import type { ElevationMap, TerrainMap } from '../terrain';

/**
 * Sight, worked by hand on small maps.
 *
 * Every case here is one a DM would rule at the table, and the point of the
 * tests is that the model agrees with the ruling - not with itself. The
 * numbers are laid out so a reader can draw the squares on paper and check.
 */

/** A blank grid: no dungeon walls, so only terrain and height are in play. */
const open = (terrain: TerrainMap = {}, elevation: ElevationMap = {}): SightContext => ({
  dungeon: generateDungeon('x', { rooms: 0, width: 30, height: 30 }),
  terrain,
  elevation,
});

describe('on open ground', () => {
  it('sees straight down a clear line', () => {
    expect(lineOfSight(open(), { x: 0, y: 5 }, { x: 10, y: 5 }).visible).toBe(true);
  });

  it('is cut by a pillar in the way, and says which square did it', () => {
    const ctx = open(paint({}, { x: 5, y: 5 }, 'pillar'));
    const result = lineOfSight(ctx, { x: 0, y: 5 }, { x: 10, y: 5 });
    expect(result.visible).toBe(false);
    expect(result.blockedBy).toEqual({ x: 5, y: 5 });
  });

  it('is cut by a tree but not by water', () => {
    expect(
      lineOfSight(open(paint({}, { x: 5, y: 5 }, 'tree')), { x: 0, y: 5 }, { x: 10, y: 5 })
        .visible,
    ).toBe(false);
    expect(
      lineOfSight(open(paint({}, { x: 5, y: 5 }, 'water')), { x: 0, y: 5 }, { x: 10, y: 5 })
        .visible,
    ).toBe(true);
  });

  it('does not let a diagonal skim through a pillar', () => {
    const ctx = open(paint({}, { x: 5, y: 5 }, 'pillar'));
    expect(lineOfSight(ctx, { x: 3, y: 3 }, { x: 7, y: 7 }).visible).toBe(false);
  });
});

describe('height', () => {
  it('lets a ridge hide two people on the flat from each other', () => {
    const ctx = open({}, { '5,5': 1 });
    const result = lineOfSight(ctx, { x: 0, y: 5 }, { x: 10, y: 5 });
    expect(result.visible).toBe(false);
    expect(result.blockedBy).toEqual({ x: 5, y: 5 });
  });

  it('lets an archer a step up shoot over the mid-field rock', () => {
    // Eyes at 1.5 against eyes at 0.5: at mid-field the line is at 1.0, and
    // the rock's top is 1.0 - grazing, which passes. The high ground working
    // is the whole point of modelling Z at all.
    const ctx = open(paint({}, { x: 5, y: 5 }, 'rock'), { '0,5': 1 });
    expect(lineOfSight(ctx, { x: 0, y: 5 }, { x: 10, y: 5 }).visible).toBe(true);
  });

  it('still hides whoever is crouched right behind that rock', () => {
    // Same archer, same rock - but the rock is now beside the target, where
    // the line has come down to head height.
    const ctx = open(paint({}, { x: 9, y: 5 }, 'rock'), { '0,5': 1 });
    expect(lineOfSight(ctx, { x: 0, y: 5 }, { x: 10, y: 5 }).visible).toBe(false);
  });

  it('sees into a pit from near, and is stopped by its rim from far', () => {
    /*
      The rim is just flat ground at level 0, but from ten squares away the
      sight line into a two-deep pit has dropped below it before it arrives -
      so the model hides the pit's floor from distance and shows it up close,
      with nobody having painted a wall. This test began life expecting the
      far ledge to see in, and the model refusing was the model being right.
    */
    const ctx = open({}, { '0,0': 2, '3,0': -1, '10,0': -2 });
    expect(lineOfSight(ctx, { x: 0, y: 0 }, { x: 3, y: 0 }).visible).toBe(true);
    expect(lineOfSight(ctx, { x: 0, y: 0 }, { x: 10, y: 0 }).visible).toBe(false);
  });
});

describe('the dungeon itself', () => {
  const dungeon = generateDungeon('first light', { rooms: 8 });
  const ctx: SightContext = { dungeon, terrain: {}, elevation: {} };

  it('treats everything outside rooms and corridors as rock', () => {
    // Room 1's centre is open; the map's corner is solid.
    const room = dungeon.rooms[0];
    expect(walkable(ctx, { x: room.x, y: room.y })).toBe(true);
    expect(walkable(ctx, { x: dungeon.width - 1, y: dungeon.height - 1 })).toBe(false);
  });

  it('never sees from one room into another through rock', () => {
    /*
      Two rooms that no straight corridor joins: the line between their
      centres crosses solid rock somewhere, whatever the seed drew. If this
      ever fails, the map has two rooms sharing a wall - which the generator's
      one-square inset is supposed to make impossible.
    */
    const [a, b] = [dungeon.rooms[0], dungeon.rooms[dungeon.rooms.length - 1]];
    const centre = (r: typeof a) => ({
      x: Math.floor(r.x + r.w / 2),
      y: Math.floor(r.y + r.h / 2),
    });
    expect(lineOfSight(ctx, centre(a), centre(b)).visible).toBe(false);
  });

  it('opens rock where floor has been painted', () => {
    const corner = { x: dungeon.width - 1, y: dungeon.height - 1 };
    const painted: SightContext = {
      ...ctx,
      terrain: paint({}, corner, 'floor'),
    };
    expect(walkable(painted, corner)).toBe(true);
  });
});

describe('cover', () => {
  it('grants half cover behind a pillar on the attacker’s side', () => {
    // Pillar one square from the target, between them: the line to the
    // target's square itself is clear, but that is cover as the SRD means it.
    const ctx = open(paint({}, { x: 9, y: 5 }, 'pillar'));
    const result = lineOfSight(ctx, { x: 0, y: 5 }, { x: 10, y: 5 });
    // The pillar cuts the direct line here, so approach at an angle instead.
    const angled = lineOfSight(ctx, { x: 6, y: 0 }, { x: 10, y: 5 });
    expect(result.visible).toBe(false);
    expect(angled.visible).toBe(true);
    expect(angled.cover).toBe('half');
  });

  it('grants none when the cover is behind the target instead', () => {
    const ctx = open(paint({}, { x: 11, y: 5 }, 'pillar'));
    const result = lineOfSight(ctx, { x: 0, y: 5 }, { x: 10, y: 5 });
    expect(result.visible).toBe(true);
    expect(result.cover).toBe('none');
  });

  it('grants three-quarters in a corner, blocked on both approaches', () => {
    /*
      The target tucked into a masonry corner and shot at diagonally: a pillar
      on each of the two axes the attack comes down. On a grid that is the
      most cover short of total, and the SRD prices it at +5 - a degree this
      app rounded down to +2 for thirty sections.
    */
    const ctx = open(paint(paint({}, { x: 9, y: 5 }, 'pillar'), { x: 10, y: 4 }, 'pillar'));
    const result = lineOfSight(ctx, { x: 4, y: 0 }, { x: 10, y: 5 });
    expect(result.visible).toBe(true);
    expect(result.cover).toBe('three-quarters');
  });

  it('prices each degree the way the book does', () => {
    expect(COVER_AC.none).toBe(0);
    expect(COVER_AC.half).toBe(2);
    expect(COVER_AC['three-quarters']).toBe(5);
  });
});

describe('the line itself', () => {
  it('excludes both endpoints, so nobody blocks their own sight', () => {
    const squares = lineSquares({ x: 0, y: 0 }, { x: 4, y: 0 });
    expect(squares.some((s) => s.at.x === 0 && s.at.y === 0)).toBe(false);
    expect(squares.some((s) => s.at.x === 4 && s.at.y === 0)).toBe(false);
    expect(squares.map((s) => s.at.x)).toEqual([1, 2, 3]);
  });

  it('is empty between adjacent squares', () => {
    expect(lineSquares({ x: 2, y: 2 }, { x: 3, y: 3 })).toEqual([]);
  });
});
