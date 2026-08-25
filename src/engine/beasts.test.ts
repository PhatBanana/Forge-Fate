import { describe, expect, it } from 'vitest';
import fixture from '../data/srd/srd-2014-monsters.json';
import { FAMILIES, beastArtOf, familyOf, hueOf, scaleOf } from './beasts';
import type { BeastHue } from './beasts';

/*
  §149. Every monster in the book gets a look, and no two kinds share one.

  These run against the shipped bestiary rather than a fixture, because the
  claim being made is about all 334 stat blocks - "the long tail still gets a
  colour" is not a claim a handful of hand-picked examples can support, and
  the long tail is exactly where a scheme like this quietly fails.
*/

const ALL = fixture.records as { id: string; type: string; size: string; name: string }[];

const same = (a: BeastHue, b: BeastHue) =>
  JSON.stringify([a.primary, a.secondary, a.glow]) ===
  JSON.stringify([b.primary, b.secondary, b.glow]);

const find = (id: string) => ALL.find((m) => m.id === id)!;

describe('which body a stat block stands as', () => {
  it('gives every monster in the bestiary one of the fifteen', () => {
    for (const monster of ALL) {
      expect(FAMILIES).toContain(familyOf(monster));
    }
  });

  it('reads the type line, which is already a statement about shape', () => {
    expect(familyOf({ type: 'ooze', id: 'gray-ooze' })).toBe('ooze');
    expect(familyOf({ type: 'undead', id: 'skeleton' })).toBe('undead');
  });

  it('makes a swarm a cloud rather than the animal it is a swarm of', () => {
    const swarms = ALL.filter((m) => m.type.startsWith('swarm'));
    expect(swarms.length).toBeGreaterThan(0);
    for (const swarm of swarms) expect(familyOf(swarm)).toBe('swarm');
  });

  it('stands a wyvern up as a dragon, whatever the type line files it under', () => {
    expect(familyOf(find('wyvern'))).toBe('dragon');
    expect(familyOf(find('couatl'))).toBe('dragon');
  });

  it('falls back to monstrosity, which is what that word is for', () => {
    expect(familyOf({ type: 'something-new', id: 'x' })).toBe('monstrosity');
  });
});

describe('the dragons, which are why this scheme is the bestiary’s own', () => {
  const dragons = ALL.filter((m) => m.type === 'dragon');

  it('covers all forty-three off one body', () => {
    expect(dragons.length).toBe(43);
    for (const dragon of dragons) expect(familyOf(dragon)).toBe('dragon');
  });

  it('takes its colour from the id, at every age', () => {
    // The whole example: same animal, two ages, one colour.
    expect(same(hueOf(find('ancient-red-dragon')), hueOf(find('red-dragon-wyrmling')))).toBe(true);
    expect(same(hueOf(find('young-red-dragon')), hueOf(find('adult-red-dragon')))).toBe(true);
  });

  it('parts the ten colours from each other', () => {
    const colours = ['black', 'blue', 'brass', 'bronze', 'copper', 'gold', 'green', 'red', 'silver', 'white'];
    const hues = colours.map((c) => hueOf(find(`adult-${c}-dragon`)));
    for (let i = 0; i < hues.length; i++) {
      for (let j = i + 1; j < hues.length; j++) {
        expect(same(hues[i], hues[j])).toBe(false);
      }
    }
  });

  it('tells the ages apart by size alone, the way the book does', () => {
    const at = (id: string) => beastArtOf(find(id)).scale;
    expect(at('red-dragon-wyrmling')).toBeLessThan(at('young-red-dragon'));
    expect(at('young-red-dragon')).toBeLessThan(at('adult-red-dragon'));
    expect(at('adult-red-dragon')).toBeLessThan(at('ancient-red-dragon'));
  });
});

describe('the colour a monster is painted in', () => {
  it('is a real colour for every stat block, hand-picked or not', () => {
    for (const monster of ALL) {
      const hue = hueOf(monster);
      for (const channel of [...hue.primary, ...hue.secondary, ...hue.glow]) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  });

  it('matches the longest key, so an ogre zombie is a zombie', () => {
    expect(same(hueOf(find('ogre-zombie')), hueOf(find('zombie')))).toBe(true);
    expect(same(hueOf(find('ogre-zombie')), hueOf(find('ogre')))).toBe(false);
  });

  it('is the same colour on every device, for a monster nobody named', () => {
    const once = hueOf({ id: 'roc', type: 'monstrosity' });
    const twice = hueOf({ id: 'roc', type: 'monstrosity' });
    expect(same(once, twice)).toBe(true);
  });

  it('parts the long tail rather than washing it all one grey', () => {
    /*
      The failure this scheme would have if the fallback were lazy: 250-odd
      monsters that all look the same, with the forty hand-picked ones
      looking like the mistake. A few dozen distinct colours is enough for a
      table to tell two unnamed monstrosities apart.
    */
    const seen = new Set(ALL.map((m) => JSON.stringify(hueOf(m).primary)));
    expect(seen.size).toBeGreaterThan(60);
  });
});

describe('how much of its square a monster fills', () => {
  it('grows with the size line, and Medium is the square itself', () => {
    expect(scaleOf('Medium')).toBe(1);
    expect(scaleOf('Tiny')).toBeLessThan(scaleOf('Small'));
    expect(scaleOf('Small')).toBeLessThan(scaleOf('Medium'));
    expect(scaleOf('Large')).toBeGreaterThan(1);
    expect(scaleOf('Huge')).toBeGreaterThan(scaleOf('Large'));
    expect(scaleOf('Gargantuan')).toBeGreaterThan(scaleOf('Huge'));
  });

  it('treats a size it has never heard of as Medium rather than nothing', () => {
    expect(scaleOf('Colossal')).toBe(1);
  });

  it('reads every size the bestiary actually prints', () => {
    for (const monster of ALL) expect(scaleOf(monster.size)).toBeGreaterThan(0);
  });
});
