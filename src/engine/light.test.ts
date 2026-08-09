import { describe, expect, it } from 'vitest';
import {
  LIGHT_KINDS,
  canSeeInto,
  darker,
  feetIn,
  lightAt,
  oneBrighter,
  perceptionPenalty,
  placeLights,
  seenAs,
} from './light';
import type { LightSource } from './light';

const torch = (at: { x: number; y: number }, over: Partial<LightSource> = {}): LightSource => ({
  id: 't',
  label: 'Torch',
  at,
  bright: 20,
  dim: 20,
  ...over,
});

describe('how bright a square is', () => {
  it('defaults to bright, so every fight from before this section is unchanged', () => {
    expect(lightAt([], { x: 3, y: 3 })).toBe('bright');
  });

  it('lights a circle of bright and a ring of dim around a torch', () => {
    const lights = [torch({ x: 10, y: 10 })];
    // Four squares out is twenty feet: the edge of the bright radius.
    expect(lightAt(lights, { x: 14, y: 10 }, 'dark')).toBe('bright');
    // Five out is twenty-five: into the dim ring, which reaches forty.
    expect(lightAt(lights, { x: 15, y: 10 }, 'dark')).toBe('dim');
    expect(lightAt(lights, { x: 18, y: 10 }, 'dark')).toBe('dim');
    // Nine out is forty-five feet: past both.
    expect(lightAt(lights, { x: 19, y: 10 }, 'dark')).toBe('dark');
  });

  it('measures the diagonal the way the rest of the grid does', () => {
    // Chebyshev: four diagonal steps is twenty feet, same as four straight.
    expect(lightAt([torch({ x: 10, y: 10 })], { x: 14, y: 14 }, 'dark')).toBe('bright');
  });

  it('takes the brightest source rather than adding them up', () => {
    // Two torches on one square do not make daylight, and a square in the
    // dim ring of one and the bright of the other is bright.
    const lights = [torch({ x: 10, y: 10 }), { ...torch({ x: 18, y: 10 }), id: 't2' }];
    expect(lightAt(lights, { x: 15, y: 10 }, 'dark')).toBe('bright');
  });

  it('never makes a bright day darker', () => {
    // Ambient is a floor, not a starting point to be overwritten.
    expect(lightAt([torch({ x: 0, y: 0 })], { x: 30, y: 30 }, 'bright')).toBe('bright');
  });

  it('ignores a light that has gone out', () => {
    expect(lightAt([torch({ x: 10, y: 10 }, { out: true })], { x: 10, y: 10 }, 'dark')).toBe('dark');
  });

  it('gives every listed kind a positive radius', () => {
    for (const kind of LIGHT_KINDS) {
      expect(kind.bright).toBeGreaterThan(0);
      expect(kind.dim).toBeGreaterThan(0);
      expect(kind.hint).toBeTruthy();
    }
  });
});

describe('carried lights', () => {
  const carried: LightSource = { id: 'c', label: 'Torch', carriedBy: 'hero', bright: 20, dim: 20 };

  it('stands where its bearer stands', () => {
    const placed = placeLights([carried], () => ({ x: 7, y: 7 }));
    expect(placed[0].at).toEqual({ x: 7, y: 7 });
    expect(lightAt(placed, { x: 9, y: 7 }, 'dark')).toBe('bright');
  });

  it('lights nothing when its bearer is off the map', () => {
    // Not the origin, which is what a defaulted position would light.
    expect(placeLights([carried], () => undefined)).toEqual([]);
  });

  it('leaves a fixed light where it was put', () => {
    const fixed = torch({ x: 2, y: 2 });
    expect(placeLights([fixed], () => ({ x: 9, y: 9 }))[0].at).toEqual({ x: 2, y: 2 });
  });
});

describe('what a creature actually sees', () => {
  const dwarf = { at: { x: 10, y: 10 }, darkvision: 60 };
  const human = { at: { x: 10, y: 10 } };

  it('reads darkness as dim within darkvision, and no better', () => {
    // The mistake everyone makes at the table: darkvision is one step, so an
    // unlit room is dim to a dwarf, not daylight.
    expect(seenAs(dwarf, { x: 14, y: 10 }, 'dark')).toBe('dim');
    expect(seenAs(dwarf, { x: 14, y: 10 }, 'dim')).toBe('bright');
  });

  it('stops at the edge of the range', () => {
    // Twelve squares is sixty feet - the last square that counts.
    expect(seenAs(dwarf, { x: 22, y: 10 }, 'dark')).toBe('dim');
    expect(seenAs(dwarf, { x: 23, y: 10 }, 'dark')).toBe('dark');
  });

  it('leaves eyes without darkvision in the dark', () => {
    expect(seenAs(human, { x: 11, y: 10 }, 'dark')).toBe('dark');
    expect(canSeeInto(human, { x: 11, y: 10 }, 'dark')).toBe(false);
    expect(canSeeInto(dwarf, { x: 11, y: 10 }, 'dark')).toBe(true);
  });

  it('lets dim light be seen through by anybody, because it is only lightly obscured', () => {
    expect(canSeeInto(human, { x: 11, y: 10 }, 'dim')).toBe(true);
  });

  it('makes light irrelevant inside blindsight', () => {
    const bat = { at: { x: 10, y: 10 }, blindsight: 60 };
    expect(seenAs(bat, { x: 20, y: 10 }, 'dark')).toBe('bright');
    // And beyond it, an ordinary pair of eyes again.
    expect(seenAs(bat, { x: 30, y: 10 }, 'dark')).toBe('dark');
  });
});

describe('the small pieces', () => {
  it('penalises a passive Perception in dim light and nowhere else', () => {
    expect(perceptionPenalty('dim')).toBe(-5);
    expect(perceptionPenalty('bright')).toBe(0);
    // Darkness is not a penalty, it is a wall: nothing is seen at all, which
    // canSeeInto answers rather than this.
    expect(perceptionPenalty('dark')).toBe(0);
  });

  it('takes the darker of two levels, which is how darkness overlaps', () => {
    expect(darker('bright', 'dim')).toBe('dim');
    expect(darker('dark', 'dim')).toBe('dark');
  });

  it('cannot step brighter than bright', () => {
    expect(oneBrighter('bright')).toBe('bright');
    expect(oneBrighter('dark')).toBe('dim');
  });

  it('reads feet out of the prose both sides of the table state it in', () => {
    expect(feetIn('Darkvision 60 ft.')).toBe(60);
    expect(feetIn('Superior Darkvision 120 ft.')).toBe(120);
    expect(feetIn('30 feet')).toBe(30);
    // No number is no darkvision, which is what every caller wants from it.
    expect(feetIn('Keen Smell')).toBe(0);
  });
});
