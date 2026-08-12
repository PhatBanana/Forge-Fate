import { describe, expect, it } from 'vitest';
import { blankBuild, deriveBuild } from './character';
import { sensesFor, sensesForMonster } from './senses';
import type { Build, ClassId, Ruleset } from '../types';

/**
 * Darkvision through a whole character, not through a unit-tested helper.
 *
 * `resolveSight` is pinned in `light.test.ts`; what this file asks is whether
 * the five kinds of record that grant a sense actually *reach* it - a species
 * trait, a subclass feature at the level it arrives, an invocation that was
 * taken, a worn item that is attuned, and nothing at all.
 *
 * Every case here failed before §63: the app knew about species darkvision
 * and nothing else, so a Twilight Cleric, a Gloom Stalker, a Devil's Sight
 * Warlock and a character in Goggles of Night were all as blind as a human.
 */

const at = (over: Partial<Build>): Build => ({ ...blankBuild(over.ruleset ?? '2014'), ...over });

const eyesOf = (over: Partial<Build>) => sensesFor(deriveBuild(at(over)));

const withClass = (classId: ClassId, level: number, subclassId?: string, more: Partial<Build> = {}) =>
  eyesOf({ classes: [{ classId, level, ...(subclassId ? { subclassId } : {}) }], ...more });

describe('where a character’s darkvision comes from', () => {
  it('reads a species trait as data rather than out of its name', () => {
    expect(eyesOf({ raceId: 'dwarf-hill' }).darkvision).toBe(60);
    // The 120-foot lineages, which the app had always flattened to nothing.
    expect(eyesOf({ raceId: 'elf-drow' }).darkvision).toBe(120);
  });

  it('gives a human none, which is the control for every case above', () => {
    expect(eyesOf({ raceId: 'human' }).darkvision).toBeUndefined();
  });

  it('picks up a subclass feature at the level it arrives, and not before', () => {
    // Shadow Sorcerer: Eyes of the Dark at 1st, 120 feet.
    expect(withClass('sorcerer', 1, 'shadow-magic').darkvision).toBe(120);
    // Twilight Cleric: 300 feet, the biggest in the game and previously zero.
    expect(withClass('cleric', 1, 'twilight').darkvision).toBe(300);
  });

  it('extends existing darkvision rather than replacing it', () => {
    /*
      Umbral Sight: 60 feet, "or 30 feet further if you already have it". A
      human Gloom Stalker gets 60; a drow one gets 150, not 120 and not 60.
      This is the case a plain "best wins" resolver gets wrong in both
      directions depending on which way it rounds.
    */
    expect(withClass('ranger', 3, 'gloom-stalker', { raceId: 'human' }).darkvision).toBe(60);
    expect(withClass('ranger', 3, 'gloom-stalker', { raceId: 'elf-drow' }).darkvision).toBe(150);
  });

  it('picks up an invocation that was actually taken', () => {
    const plain = withClass('warlock', 5, 'fiend');
    expect(plain.magicalSight).toBeUndefined();

    const seer = withClass('warlock', 5, 'fiend', { classOptionIds: ['devils-sight'] });
    expect(seer.magicalSight).toBe(120);
    expect(seer.darkvision).toBe(120);
  });

  it('picks up a worn item, and only while it is attuned', () => {
    // Goggles of Night need no attunement in the SRD, so carrying is enough.
    const goggled = eyesOf({
      raceId: 'human',
      items: [{ itemId: 'goggles-of-night', attuned: false }],
    });
    expect(goggled.darkvision).toBe(60);

    // And on a dwarf they extend rather than replace: 60 + 60.
    const dwarf = eyesOf({
      raceId: 'dwarf-hill',
      items: [{ itemId: 'goggles-of-night', attuned: false }],
    });
    expect(dwarf.darkvision).toBe(120);
  });
});

describe('what the resolver refuses to claim', () => {
  it('gives a Shadow Monk nothing, because Shadow Arts is a spell they pay ki for', () => {
    // Four features in the data mention darkvision without granting it. This
    // is the one a player would most expect to be wrong in the other
    // direction, so it is the one worth pinning.
    expect(withClass('monk', 3, 'shadow').darkvision).toBeUndefined();
  });

  it('gives a Divination Wizard nothing, because The Third Eye is one option of several', () => {
    expect(withClass('wizard', 10, 'divination').darkvision).toBeUndefined();
  });
});

describe('a monster’s senses, which stay prose', () => {
  it('reads a range out of the stat block’s own sentence', () => {
    expect(sensesForMonster({ darkvision: '60 ft.' }).darkvision).toBe(60);
    expect(sensesForMonster({ darkvision: 120 }).darkvision).toBe(120);
  });

  it('collapses truesight and blindsight to the one that reaches furthest', () => {
    const eyes = sensesForMonster({ blindsight: '30 ft.', truesight: '120 ft.' });
    expect(eyes.blindsight).toBe(120);
  });

  it('gives a stat block with no senses at all nothing', () => {
    expect(sensesForMonster(undefined)).toEqual({});
    expect(sensesForMonster({})).toEqual({});
  });
});

describe('both rulesets', () => {
  const RULESETS: Ruleset[] = ['2014', '2024'];

  it.each(RULESETS)('resolves every species without throwing under %s', (ruleset) => {
    // 2024 moved several lineages to 120 feet, and the species file is a
    // separate module - which is exactly where the first pass of this
    // migration missed twelve records.
    const build = at({ ruleset });
    expect(() => sensesFor(deriveBuild(build))).not.toThrow();
  });

  it('gives the 2024 dwarf the 120 feet that edition grants', () => {
    expect(eyesOf({ ruleset: '2024', raceId: 'dwarf-2024' }).darkvision).toBe(120);
  });
});
