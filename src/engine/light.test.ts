import { describe, expect, it } from 'vitest';
import {
  LIGHT_KINDS,
  canSeeInto,
  feetIn,
  lightAt,
  oneBrighter,
  perceptionPenalty,
  placeLights,
  seenAs,
} from './light';
import type { LightSource } from './light';
import { resolveSight } from './senses';
import { RACES } from '../data/races';

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

  it('gives every listed kind a positive radius, whichever way it works', () => {
    // One entry darkens rather than lights, so the claim is "reaches
    // somewhere" rather than "is bright" - a kind with no radius at all would
    // render as a control that does nothing.
    for (const kind of LIGHT_KINDS) {
      if (kind.darkness) {
        expect(kind.darkness, kind.label).toBeGreaterThan(0);
        // And it does not also claim to light anything, which lightAt ignores.
        expect(kind.bright, kind.label).toBe(0);
        expect(kind.dim, kind.label).toBe(0);
      } else {
        expect(kind.bright, kind.label).toBeGreaterThan(0);
        expect(kind.dim, kind.label).toBeGreaterThan(0);
      }
      expect(kind.hint, kind.label).toBeTruthy();
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

/*
  §61 left a tripwire here: it could not afford to migrate species darkvision
  off the prose scrape, so it pinned the scrape instead and named the real
  fix. §63 made the migration, and this is the stronger claim that replaces
  it - every darkvision trait carries a *structured* range, and that range
  still agrees with the sentence a player reads.

  The agreement half is the one worth having. A `feet` nobody checks against
  the prose is a number that can drift away from the trait it belongs to, and
  a species whose card says 60 while the battle map plays 120 is a worse bug
  than the one this replaced.
*/
describe('every darkvision trait carries its range as data', () => {
  it('has a structured feet on each tagged trait', () => {
    for (const race of RACES) {
      for (const trait of race.traits.filter((t) => t.tags?.includes('darkvision'))) {
        expect(trait.feet, `${race.name}: "${trait.name}" has no feet`).toBeGreaterThan(0);
      }
    }
  });

  it('agrees with the range printed in its own text', () => {
    for (const race of RACES) {
      for (const trait of race.traits.filter((t) => t.tags?.includes('darkvision'))) {
        const printed = feetIn(trait.name) || feetIn(trait.text);
        if (!printed) continue; // A trait may legitimately not state a number.
        expect(trait.feet, `${race.name}: "${trait.name}" says ${printed}`).toBe(printed);
      }
    }
  });
});

/*
  §63. Magical darkness, and the one sense that beats it.

  Every assertion here is a sentence the SRD says outright, because the whole
  point of the level is that it is not simply "very dark":

  - "A creature with darkvision can't see through this darkness."
  - "…and nonmagical light can't illuminate it."
  - Devil's Sight: "you can see normally in darkness, both magical and
    nonmagical" - normally, so all the way to bright, not one step.
*/
const dark15 = (at: { x: number; y: number }): LightSource => ({
  id: 'd', label: 'Darkness', at, bright: 0, dim: 0, darkness: 15,
});

describe('magical darkness', () => {
  const centre = { x: 10, y: 10 };

  it('darkens its own sphere and nothing beyond it', () => {
    const lights = [dark15(centre)];
    expect(lightAt(lights, { x: 13, y: 10 }, 'bright')).toBe('magical-dark');
    // Four squares is twenty feet: outside a fifteen-foot radius.
    expect(lightAt(lights, { x: 14, y: 10 }, 'bright')).toBe('bright');
  });

  it('cannot be lit by a torch standing in it', () => {
    // The half everyone forgets, and the reason the spell is worth a slot.
    const lights = [torch(centre), dark15(centre)];
    expect(lightAt(lights, centre, 'dark')).toBe('magical-dark');
    expect(lightAt(lights, { x: 12, y: 10 }, 'dark')).toBe('magical-dark');
    // Beyond the darkness the same torch still lights normally.
    expect(lightAt(lights, { x: 14, y: 10 }, 'dark')).toBe('bright');
  });

  it('is not helped by darkvision, however much of it there is', () => {
    const drow = { at: { x: 10, y: 10 }, darkvision: 120 };
    expect(seenAs(drow, { x: 12, y: 10 }, 'magical-dark')).toBe('magical-dark');
    expect(canSeeInto(drow, { x: 12, y: 10 }, 'magical-dark')).toBe(false);
    // The same eyes handle ordinary darkness perfectly well, which is the
    // contrast that makes the rule worth enforcing.
    expect(canSeeInto(drow, { x: 12, y: 10 }, 'dark')).toBe(true);
  });

  it('is no obstacle at all to Devil’s Sight, within its range', () => {
    const warlock = { at: { x: 10, y: 10 }, magicalSight: 120 };
    // Normally, not one step: bright.
    expect(seenAs(warlock, { x: 12, y: 10 }, 'magical-dark')).toBe('bright');
    expect(seenAs(warlock, { x: 12, y: 10 }, 'dark')).toBe('bright');
    expect(canSeeInto(warlock, { x: 12, y: 10 }, 'magical-dark')).toBe(true);
    // And it stops at its range like everything else.
    expect(canSeeInto(warlock, { x: 35, y: 10 }, 'magical-dark')).toBe(false);
  });

  it('is irrelevant to blindsight, which is not sight', () => {
    const bat = { at: { x: 10, y: 10 }, blindsight: 60 };
    expect(seenAs(bat, { x: 12, y: 10 }, 'magical-dark')).toBe('bright');
  });

  it('goes out with the rest of the lights when snuffed', () => {
    expect(lightAt([{ ...dark15(centre), out: true }], centre, 'bright')).toBe('bright');
  });
});

/*
  The resolver, which is the other half of §63: darkvision arrives from five
  kinds of record and they do not simply take the largest.
*/
describe('resolving what a creature can see with', () => {
  it('takes the best of several plain grants', () => {
    expect(resolveSight([{ darkvision: 60 }, { darkvision: 120 }]).darkvision).toBe(120);
  });

  it('adds an extending grant to what is already there', () => {
    // Goggles of Night on a dwarf: 60 + 60, not 60.
    const eyes = resolveSight([{ darkvision: 60 }, { darkvision: 60, extendsBy: 60 }]);
    expect(eyes.darkvision).toBe(120);
  });

  it('gives an extending grant its flat number when there is nothing to extend', () => {
    // A human Gloom Stalker gets 60, not 90.
    expect(resolveSight([{ darkvision: 60, extendsBy: 30 }]).darkvision).toBe(60);
  });

  it('does not compound two extending grants with each other', () => {
    // Each says "if you already have darkvision from another source"; reading
    // that as "from each other" is a table ruling, not a rule.
    const eyes = resolveSight([
      { darkvision: 60, extendsBy: 30 },
      { darkvision: 60, extendsBy: 60 },
    ]);
    expect(eyes.darkvision).toBe(60);
  });

  it('keeps magical sight apart from the ordinary kind', () => {
    const eyes = resolveSight([{ darkvision: 60 }, { darkvision: 120, magical: 120 }]);
    expect(eyes.darkvision).toBe(120);
    expect(eyes.magicalSight).toBe(120);
  });

  it('leaves a creature with no grants with nothing at all', () => {
    expect(resolveSight([])).toEqual({});
  });
});
