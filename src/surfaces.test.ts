import { describe, expect, it } from 'vitest';
import { SURFACE_REACTIONS, overlaps, placeZone, reactionFor } from './surfaces';
import { ZONE_PRESETS } from './zones';
import type { SurfaceKind, Zone } from './zones';

/**
 * The ground answering back.
 *
 * Every case here is one a table would rule the same way without being asked,
 * which is the bar these reactions are held to: remembering the obvious, not
 * inventing house rules.
 */

let seq = 0;
const zone = (
  label: string,
  surface: SurfaceKind | undefined,
  at = { x: 5, y: 5 },
  feet = 10,
): Zone => ({
  id: `z${seq++}`,
  label,
  shape: 'sphere',
  at,
  feet,
  angle: 0,
  tint: 0,
  ...(surface ? { effect: { surface } } : {}),
});

const fire = (at?: { x: number; y: number }) => zone('Fireball', 'fire', at);
const grease = (at?: { x: number; y: number }) => zone('Grease', 'grease', at);
const web = (at?: { x: number; y: number }) => zone('Web', 'web', at);
const water = (at?: { x: number; y: number }) => zone('Water', 'water', at);

describe('which materials react', () => {
  it('finds the pair, in the direction it was written', () => {
    expect(reactionFor('fire', 'grease')?.becomes).toBe('burning-ground');
    // Direction matters: water douses fire, fire does not douse water.
    expect(reactionFor('water', 'fire')?.consumes).toBe(true);
    expect(reactionFor('grease', 'fire')).toBeNull();
  });

  it('says nothing about a zone that is not a surface', () => {
    // A wall of force is not made of anything a fireball can argue with.
    expect(reactionFor('fire', undefined)).toBeNull();
    expect(reactionFor(undefined, 'grease')).toBeNull();
  });

  it('names a preset that exists, for every reaction that transforms one', () => {
    // The failure this catches is a renamed preset leaving a reaction
    // pointing at nothing, which would silently do nothing at all.
    for (const reaction of SURFACE_REACTIONS) {
      if (!reaction.becomes) continue;
      expect(ZONE_PRESETS.map((p) => p.id)).toContain(reaction.becomes);
    }
  });
});

describe('sharing ground', () => {
  it('is what decides whether anything happens at all', () => {
    expect(overlaps(fire({ x: 5, y: 5 }), grease({ x: 6, y: 5 }))).toBe(true);
    // Far apart: a fireball across the room does nothing to the slick here.
    expect(overlaps(fire({ x: 5, y: 5 }), grease({ x: 40, y: 40 }))).toBe(false);
  });

  it('leaves a surface alone when the new one lands somewhere else', () => {
    const before = [grease({ x: 40, y: 40 })];
    const out = placeZone(before, fire({ x: 5, y: 5 }));
    expect(out.log).toEqual([]);
    expect(out.jolts).toEqual([]);
    expect(out.zones[0].label).toBe('Grease');
    // The new zone is still placed - it just did not meet anything.
    expect(out.zones).toHaveLength(2);
  });
});

describe('fire finds the grease', () => {
  it('turns the slick into burning ground where it lay', () => {
    const slick = grease({ x: 6, y: 5 });
    const out = placeZone([slick], fire());

    const burning = out.zones.find((z) => z.id === slick.id)!;
    expect(burning.label).toBe('Burning ground');
    expect(burning.effect?.surface).toBe('fire');
    expect(burning.effect?.damage?.type).toBe('fire');
    // Same ground, same shape: a burning slick is exactly where the grease was.
    expect(burning.at).toEqual(slick.at);
    expect(burning.shape).toBe(slick.shape);
    expect(burning.feet).toBe(slick.feet);
  });

  it('says so, in words a DM can read out', () => {
    const out = placeZone([grease({ x: 6, y: 5 })], fire());
    expect(out.log).toEqual(['Fireball meets Grease — Grease catches and burns.']);
  });

  it('gives the burning ground its own clock rather than the grease’s', () => {
    const slick = { ...grease({ x: 6, y: 5 }), rounds: 9 };
    const out = placeZone([slick], fire());
    const preset = ZONE_PRESETS.find((p) => p.id === 'burning-ground')!;
    expect(out.zones.find((z) => z.id === slick.id)!.rounds).toBe(preset.rounds);
  });
});

describe('what burns away and what is doused', () => {
  it('burns the web off the map, and it goes up as it goes', () => {
    const strands = web({ x: 6, y: 5 });
    const out = placeZone([strands], fire());

    expect(out.zones.find((z) => z.id === strands.id)).toBeUndefined();
    expect(out.jolts).toHaveLength(1);
    expect(out.jolts[0].effect?.damage).toEqual({ dice: '2d4', type: 'fire' });
    // Shaped like the web, not like the fireball: what burns is what was there.
    expect(out.jolts[0].at).toEqual(strands.at);
    expect(out.jolts[0].feet).toBe(strands.feet);
  });

  it('douses a fire under water, the other way round', () => {
    const flames = zone('Wall of Fire', 'fire', { x: 6, y: 5 });
    const out = placeZone([flames], water());
    expect(out.zones.find((z) => z.id === flames.id)).toBeUndefined();
    expect(out.log[0]).toMatch(/is doused/);
    // Nothing is hurt by putting a fire out.
    expect(out.jolts).toEqual([]);
  });

  it('dissolves a web under acid without setting anything alight', () => {
    const strands = web({ x: 6, y: 5 });
    const out = placeZone([strands], zone('Acid', 'acid'));
    expect(out.zones.find((z) => z.id === strands.id)).toBeUndefined();
    expect(out.jolts).toEqual([]);
  });
});

describe('lightning finds the water', () => {
  it('leaves the water and makes standing in it a mistake', () => {
    const pool = water({ x: 6, y: 5 });
    const out = placeZone([pool], zone('Lightning Bolt', 'lightning'));

    // The pool is still there; what changed is what it costs to be in it.
    expect(out.zones.find((z) => z.id === pool.id)).toBeDefined();
    expect(out.jolts).toHaveLength(1);
    expect(out.jolts[0].effect?.damage).toEqual({ dice: '2d8', type: 'lightning' });
    expect(out.jolts[0].effect?.save).toEqual({ ability: 'dex', dc: 13, half: true });
    // Everyone in the pool, not everyone in the bolt.
    expect(out.jolts[0].at).toEqual(pool.at);
  });

  it('gives the jolt no clock, because it happens once', () => {
    const out = placeZone([{ ...water({ x: 6, y: 5 }), rounds: 8 }], zone('Bolt', 'lightning'));
    expect(out.jolts[0].rounds).toBeUndefined();
  });

  it('gives each jolt its own id, so two never collide', () => {
    const out = placeZone(
      [water({ x: 5, y: 5 }), water({ x: 6, y: 6 })],
      zone('Bolt', 'lightning', { x: 5, y: 5 }, 20),
    );
    expect(out.jolts).toHaveLength(2);
    expect(new Set(out.jolts.map((j) => j.id)).size).toBe(2);
  });
});

describe('several surfaces at once', () => {
  it('resolves each one it meets, in the order the ground was built', () => {
    const slick = grease({ x: 5, y: 5 });
    const strands = web({ x: 6, y: 5 });
    const out = placeZone([slick, strands], fire({ x: 5, y: 5 }));

    // The grease catches, the web burns off, and the fireball is placed.
    expect(out.zones.find((z) => z.id === slick.id)!.label).toBe('Burning ground');
    expect(out.zones.find((z) => z.id === strands.id)).toBeUndefined();
    expect(out.zones.map((z) => z.label)).toContain('Fireball');
    expect(out.log).toHaveLength(2);
  });

  it('leaves everything alone when nothing reacts', () => {
    const before = [zone('Wall of Force', undefined, { x: 5, y: 5 })];
    const out = placeZone(before, fire());
    expect(out.zones[0]).toEqual(before[0]);
    expect(out.log).toEqual([]);
  });

  it('does not react a surface with itself', () => {
    // Fire on fire is just more fire; no row says otherwise, and the absence
    // is the answer rather than an oversight.
    const out = placeZone([fire({ x: 5, y: 5 })], fire({ x: 5, y: 5 }));
    expect(out.log).toEqual([]);
    expect(out.zones).toHaveLength(2);
  });
});
