import { describe, expect, it } from 'vitest';
import {
  ZONE_PRESETS,
  addZone,
  bitesOnEnter,
  combatantsIn,
  grantsUnder,
  hazardsCrossed,
  hydrateZones,
  removeZone,
  sideOf,
  tickZones,
  zoneReaches,
  zoneSquareKeys,
  zoneSquares,
} from './zones';
import type { Zone } from './zones';
import { emptyEncounter } from './encounter';
import type { MonsterCombatant } from './encounter';

/**
 * Zones, worked by hand.
 *
 * The geometry is checked square by square on shapes small enough to draw,
 * because "the cone looks about right" is exactly the kind of test that let
 * the dungeon's doors float in corridors for a phase.
 */

const zone = (partial: Partial<Zone>): Zone => ({
  id: 'z0',
  label: 'Test',
  shape: 'sphere',
  at: { x: 10, y: 10 },
  feet: 10,
  angle: 0,
  tint: 0,
  ...partial,
});

describe('the shapes', () => {
  it('makes a 10 ft sphere five squares across, diagonals included', () => {
    // Chebyshev radius 2: a 5×5 block. That is what a 10 ft radius looks like
    // on every table's grid under the five-foot-diagonal rule.
    const squares = zoneSquares(zone({ shape: 'sphere', feet: 10 }));
    expect(squares).toHaveLength(25);
    expect(squares.some((s) => s.x === 8 && s.y === 8)).toBe(true);
    expect(squares.some((s) => s.x === 7 && s.y === 10)).toBe(false);
  });

  it('makes a 15 ft cube 3×3 with its corner at the origin', () => {
    const squares = zoneSquares(zone({ shape: 'cube', feet: 15 }));
    expect(squares).toHaveLength(9);
    expect(squares.some((s) => s.x === 10 && s.y === 10)).toBe(true);
    expect(squares.some((s) => s.x === 12 && s.y === 12)).toBe(true);
    expect(squares.some((s) => s.x === 9 && s.y === 10)).toBe(false);
  });

  it('makes a cone as wide as it is long, the SRD proportion', () => {
    // 15 ft east: three squares out, spreading half a square a side per
    // square travelled.
    const squares = zoneSquares(zone({ shape: 'cone', feet: 15, angle: 0 }));
    expect(squares.some((s) => s.x === 13 && s.y === 10)).toBe(true);
    expect(squares.some((s) => s.x === 12 && s.y === 11)).toBe(true);
    // Not two squares off-axis at only two squares out.
    expect(squares.some((s) => s.x === 12 && s.y === 8)).toBe(false);
    // Nothing behind the caster.
    expect(squares.every((s) => s.x >= 10)).toBe(true);
  });

  it('makes a line one square wide along the aim', () => {
    const squares = zoneSquares(zone({ shape: 'line', feet: 30, angle: Math.PI / 2 }));
    // Straight south: same column, seven squares including the origin.
    expect(squares.every((s) => s.x === 10)).toBe(true);
    expect(squares.some((s) => s.x === 10 && s.y === 16)).toBe(true);
    expect(squares.some((s) => s.y === 9)).toBe(false);
  });
});

describe('who is inside', () => {
  const goblinAt = (x: number, y: number): MonsterCombatant => ({
    kind: 'monster',
    id: `m${x}`,
    monsterId: 'goblin',
    label: 'Goblin',
    hp: 7,
    maxHp: 7,
    initiative: 10,
    tieBreak: 2,
    conditions: [],
    at: { x, y },
  });

  it('names who stands in the fire and skips who does not', () => {
    const wall = zone({ shape: 'line', feet: 30, angle: 0, at: { x: 5, y: 5 } });
    const inside = goblinAt(8, 5);
    const outside = goblinAt(8, 7);
    const nowhere = { ...goblinAt(9, 9), at: undefined };
    expect(combatantsIn(wall, [inside, outside, nowhere]).map((c) => c.id)).toEqual(['m8']);
  });
});

describe('the round count', () => {
  it('burns a round and removes what reaches nothing', () => {
    let enc = addZone(emptyEncounter(), {
      label: 'Cloudkill',
      shape: 'sphere',
      at: { x: 5, y: 5 },
      feet: 20,
      angle: 0,
      rounds: 2,
      tint: 1,
    });
    enc = addZone(enc, {
      label: 'Web',
      shape: 'cube',
      at: { x: 8, y: 8 },
      feet: 20,
      angle: 0,
      // No count: until dispelled.
      tint: 2,
    });

    enc = tickZones(enc);
    expect(enc.zones?.find((z) => z.label === 'Cloudkill')?.rounds).toBe(1);
    enc = tickZones(enc);
    // The cloud is spent; the web, uncounted, stands.
    expect(enc.zones?.map((z) => z.label)).toEqual(['Web']);
  });

  it('removes by id and leaves no empty list behind', () => {
    let enc = addZone(emptyEncounter(), {
      label: 'Web', shape: 'cube', at: { x: 1, y: 1 }, feet: 10, angle: 0, tint: 0,
    });
    enc = removeZone(enc, enc.zones![0].id);
    expect(enc.zones).toBeUndefined();
  });
});

describe('what survives storage', () => {
  it('keeps whole zones and drops the broken', () => {
    const good = zone({ id: 'z1', label: 'Wall of fire' });
    expect(
      hydrateZones([good, { id: 'z2' }, { ...zone({}), shape: 'donut' }, null]),
    ).toEqual([good]);
    expect(hydrateZones('zones')).toBeUndefined();
    expect(hydrateZones([])).toBeUndefined();
  });
});

describe('what a zone does', () => {
  const wallOfFire = (): Zone =>
    zone({
      shape: 'line',
      at: { x: 10, y: 5 },
      angle: Math.PI / 2, // pointing south: a vertical wall at x=10
      feet: 30,
      effect: {
        damage: { dice: '5d8', type: 'fire' },
        save: { ability: 'dex', dc: 15, half: true },
        onEnter: true,
        onEndTurn: true,
      },
    });

  it('collects the square keys of the zones a predicate picks', () => {
    const keys = zoneSquareKeys([wallOfFire()], bitesOnEnter);
    expect(keys.has('10,5')).toBe(true);
    expect(keys.has('10,8')).toBe(true);
    expect(keys.has('11,5')).toBe(false);
    expect(zoneSquareKeys([wallOfFire()], (z) => Boolean(z.effect?.blocks)).size).toBe(0);
  });

  it('names the hazards a route walks into - once per zone, never the origin', () => {
    const fire = wallOfFire();
    // A walk that starts IN the wall and crosses it twice: one bite.
    const route = [
      { x: 10, y: 6 },
      { x: 9, y: 6 },
      { x: 10, y: 7 },
      { x: 11, y: 7 },
    ];
    expect(hazardsCrossed([fire], route)).toHaveLength(1);
    // A walk that never touches it: no bite.
    expect(
      hazardsCrossed([fire], [{ x: 5, y: 5 }, { x: 6, y: 5 }]),
    ).toHaveLength(0);
    // A blocking wall with no damage never bites.
    const force = zone({ id: 'z9', effect: { blocks: true } });
    expect(hazardsCrossed([force], route)).toHaveLength(0);
  });

  it('hydrates effects whole, and drops garbage without dropping the zone', () => {
    const back = hydrateZones([
      { ...wallOfFire(), effect: wallOfFire().effect },
      { ...zone({ id: 'z1' }), effect: 'burning' },
    ]);
    expect(back).toHaveLength(2);
    expect(back![0].effect?.damage).toEqual({ dice: '5d8', type: 'fire' });
    expect(back![0].effect?.save).toEqual({ ability: 'dex', dc: 15, half: true });
    expect(back![0].effect?.onEnter).toBe(true);
    expect(back![1].effect).toBeUndefined();
  });

  it('ships the shelf: every preset is a legal zone recipe', () => {
    for (const preset of ZONE_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.feet).toBeGreaterThan(0);
      if (preset.effect?.damage) expect(preset.effect.damage.dice).toMatch(/^\d+d\d+$/);
      // A preset that damages says when it damages.
      if (preset.effect?.damage) {
        expect(preset.effect.onEnter || preset.effect.onEndTurn).toBe(true);
      }
    }
    const force = ZONE_PRESETS.find((p) => p.id === 'wall-of-force')!;
    expect(force.effect?.blocks).toBe(true);
    expect(force.effect?.damage).toBeUndefined();
  });
});

describe('whose side the ground is on', () => {
  const zone = (effect: Partial<import('./zones').ZoneEffect>): Zone => ({
    id: 'z1',
    label: 'Spirit Guardians',
    shape: 'sphere',
    at: { x: 5, y: 5 },
    feet: 15,
    angle: 0,
    tint: 0,
    effect,
  });

  it('reaches everyone when it does not say', () => {
    // Fire does not check sides, and that stays the default.
    const fire = zone({ damage: { dice: '5d8', type: 'fire' }, onEnter: true });
    expect(zoneReaches(fire, 'party')).toBe(true);
    expect(zoneReaches(fire, 'monsters')).toBe(true);
  });

  it('reaches only the side it names', () => {
    // The whole shape of Spirit Guardians: it burns what is coming for you
    // and leaves your own cleric alone.
    const guardians = zone({ damage: { dice: '3d8', type: 'radiant' }, affects: 'monsters' });
    expect(zoneReaches(guardians, 'monsters')).toBe(true);
    expect(zoneReaches(guardians, 'party')).toBe(false);
  });

  it('names a side for each kind of combatant', () => {
    expect(sideOf('character')).toBe('party');
    expect(sideOf('monster')).toBe('monsters');
  });
});

describe('what standing somewhere is worth', () => {
  const aura = (at: { x: number; y: number }, grants: import('./zones').ZoneGrant): Zone => ({
    id: `a${at.x}${at.y}`,
    label: 'Aura of Protection',
    shape: 'sphere',
    at,
    feet: 10,
    angle: 0,
    tint: 0,
    effect: { grants, affects: 'party' },
  });

  it('is nothing at all when standing nowhere in particular', () => {
    expect(grantsUnder([aura({ x: 5, y: 5 }, { saves: 3 })], { x: 40, y: 40 }, 'party')).toMatchObject({
      ac: 0,
      saves: 0,
      toHit: 0,
    });
    expect(grantsUnder(undefined, { x: 5, y: 5 }, 'party').saves).toBe(0);
    expect(grantsUnder([aura({ x: 5, y: 5 }, { saves: 3 })], undefined, 'party').saves).toBe(0);
  });

  it('adds up what the ground gives, for the side it gives it to', () => {
    const zones = [aura({ x: 5, y: 5 }, { saves: 3, ac: 1 })];
    expect(grantsUnder(zones, { x: 6, y: 5 }, 'party')).toMatchObject({ saves: 3, ac: 1 });
    // The paladin's aura does nothing for the goblin standing in it.
    expect(grantsUnder(zones, { x: 6, y: 5 }, 'monsters')).toMatchObject({ saves: 0, ac: 0 });
  });

  it('stacks two overlapping auras, which is a ruling made on purpose', () => {
    // The SRD's non-stacking rule is about the same spell cast twice; two
    // different beneficial areas are two different effects. A table that
    // disagrees can move a token five feet, which is what a map is for.
    const zones = [aura({ x: 5, y: 5 }, { saves: 3 }), aura({ x: 6, y: 5 }, { saves: 2 })];
    expect(grantsUnder(zones, { x: 5, y: 5 }, 'party').saves).toBe(5);
  });

  it('collects the notes it cannot apply rather than dropping them', () => {
    const fog: Zone = {
      id: 'f',
      label: 'Fog Cloud',
      shape: 'sphere',
      at: { x: 5, y: 5 },
      feet: 20,
      angle: 0,
      tint: 0,
      effect: { grants: { note: 'Heavily obscured.' } },
    };
    expect(grantsUnder([fog], { x: 5, y: 5 }, 'monsters').notes).toEqual([
      'Fog Cloud: Heavily obscured.',
    ]);
  });
});

describe('grants that come back off the disk', () => {
  const stored = (effect: unknown) => [
    { id: 'z', label: 'X', shape: 'sphere', at: { x: 1, y: 1 }, feet: 10, angle: 0, tint: 0, effect },
  ];

  it('keeps a grant it understands', () => {
    const zones = hydrateZones(stored({ grants: { saves: 3, note: 'hi' }, affects: 'party' }))!;
    expect(zones[0].effect?.grants).toEqual({ saves: 3, note: 'hi' });
    expect(zones[0].effect?.affects).toBe('party');
  });

  it('drops a number that is not one, rather than poisoning an AC with NaN', () => {
    const zones = hydrateZones(stored({ grants: { ac: 'lots', saves: null } }))!;
    expect(zones[0].effect?.grants).toBeUndefined();
  });

  it('ignores a side it does not recognise', () => {
    const zones = hydrateZones(stored({ damage: { dice: '1d6', type: 'fire' }, affects: 'nobody' }))!;
    expect(zones[0].effect?.affects).toBeUndefined();
  });
});
