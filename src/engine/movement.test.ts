import { describe, expect, it } from 'vitest';
import { blankBuild, deriveBuild } from './character';
import {
  describeJump,
  jumpDistances,
  movementFor,
  moveGrantsFor,
  resolveMovement,
  squareCost,
  standUpCost,
} from './movement';
import { RACES } from '../data/races';
import { SPECIES_2024 } from '../data/species2024';
import { MAGIC_ITEMS } from '../data/magicItems';
import { SUBCLASS_FEATURES, SUBCLASS_FEATURES_2024 } from '../data/subclassFeatures';
import type { Build, ClassId } from '../types';

/**
 * §65. Climbing, swimming, crawling and jumping.
 *
 * Two halves, and the second is the one that matters. The cost rules are
 * arithmetic and easy to pin. What is *hard* - and what §63 got wrong first
 * time by missing an entire module of species - is whether every record that
 * grants one of these actually reaches the resolver. So the last block here
 * scans the shipped catalogues for records whose own text talks about
 * climbing, swimming or jumping and asserts each either carries a grant or is
 * on a written list of "mentions it, does not grant it".
 */

const at = (over: Partial<Build>): Build => ({ ...blankBuild(over.ruleset ?? '2014'), ...over });
const moveOf = (over: Partial<Build>) => movementFor(deriveBuild(at(over)));
const withClass = (classId: ClassId, level: number, subclassId?: string, more: Partial<Build> = {}) =>
  moveOf({ classes: [{ classId, level, ...(subclassId ? { subclassId } : {}) }], ...more });

describe('what a square costs to enter', () => {
  it('charges five feet for ordinary ground', () => {
    expect(squareCost({})).toBe(5);
  });

  it('charges ten for difficult ground, which is the rule the map already had', () => {
    expect(squareCost({ difficult: true })).toBe(10);
  });

  it('charges ten to climb or swim, and fifteen in difficult ground', () => {
    // "each foot of movement costs 1 extra foot (2 extra feet in difficult
    // terrain)" - so a square is 10, or 15 when the ground is difficult too.
    expect(squareCost({ climbing: true })).toBe(10);
    expect(squareCost({ swimming: true })).toBe(10);
    expect(squareCost({ climbing: true, difficult: true })).toBe(15);
  });

  it('charges fifteen to crawl through difficult ground, the SRD’s own example', () => {
    // "Crawling 1 foot in difficult terrain, therefore, costs 3 feet."
    expect(squareCost({ crawling: true, difficult: true })).toBe(15);
    expect(squareCost({ crawling: true })).toBe(10);
  });

  it('waives the climb surcharge for a climber and nothing else', () => {
    expect(squareCost({ climbing: true }, { climbFree: true })).toBe(5);
    // The waiver is specific: a climber still pays for deep water.
    expect(squareCost({ swimming: true }, { climbFree: true })).toBe(10);
    // And it does not touch difficult ground, which is a different rule.
    expect(squareCost({ climbing: true, difficult: true }, { climbFree: true })).toBe(10);
  });

  it('waives nothing for a crawler, because no grant in the SRD does', () => {
    expect(squareCost({ crawling: true }, { climbFree: true, swimFree: true })).toBe(10);
  });

  it('charges one surcharge, not three, for a crawling swim up a cliff', () => {
    // The declared ruling: the SRD never prices the combination.
    expect(squareCost({ climbing: true, swimming: true, crawling: true })).toBe(10);
  });
});

describe('getting off the floor', () => {
  it('costs half your speed', () => {
    expect(standUpCost(30)).toBe(15);
    expect(standUpCost(25)).toBe(12);
  });

  it('costs five feet with the grant that says so', () => {
    expect(standUpCost(30, true)).toBe(5);
    // And it is a flat five, not a smaller half - Athlete's whole point is
    // that it does not scale with a speed you may have spent feats raising.
    expect(standUpCost(60, true)).toBe(5);
  });
});

describe('how far a character jumps', () => {
  const plain = resolveMovement([], 30);

  it('measures a long jump by the Strength score, not the modifier', () => {
    // The rule everybody misremembers: Strength 16 clears sixteen feet.
    const jump = jumpDistances({ str: 16, dex: 10 }, { str: 3, dex: 0 }, plain);
    expect(jump.longRunning).toBe(16);
    expect(jump.longStanding).toBe(8);
  });

  it('measures a high jump by three plus the modifier', () => {
    const jump = jumpDistances({ str: 16, dex: 10 }, { str: 3, dex: 0 }, plain);
    expect(jump.highRunning).toBe(6);
    expect(jump.highStanding).toBe(3);
  });

  it('never returns a negative high jump', () => {
    const jump = jumpDistances({ str: 3, dex: 10 }, { str: -4, dex: 0 }, plain);
    expect(jump.highRunning).toBe(0);
    expect(jump.highStanding).toBe(0);
  });

  it('triples both jumps for the boots that say so', () => {
    const boots = resolveMovement([{ jumpTimes: 3 }], 30);
    const jump = jumpDistances({ str: 16, dex: 10 }, { str: 3, dex: 0 }, boots);
    expect(jump.longRunning).toBe(48);
    expect(jump.highRunning).toBe(18);
    // Halved after the multiplier, not before.
    expect(jump.longStanding).toBe(24);
  });

  it('swaps to Dexterity when a grant says the jump is measured by it', () => {
    const thief = resolveMovement([{ jumpBonus: 'dex' }], 30);
    const jump = jumpDistances({ str: 8, dex: 18 }, { str: -1, dex: 4 }, thief);
    expect(jump.longRunning).toBe(18);
    expect(jump.highRunning).toBe(7);
  });

  it('prints the line a sheet prints', () => {
    expect(describeJump(16, 8)).toBe('16 ft. running, 8 ft. standing');
  });
});

describe('resolving the grants', () => {
  it('gives a character with nothing no climb and no swim', () => {
    const profile = resolveMovement([], 30);
    expect(profile.climb).toBe(0);
    expect(profile.swim).toBe(0);
    expect(profile.climbFree).toBe(false);
    expect(profile.swimFree).toBe(false);
  });

  it('resolves "equal to your walking speed" against the final speed', () => {
    // Not against the species base - a Monk's Unarmored Movement has already
    // been added by the time this runs, and freezing 30 on the record would
    // have lost it.
    expect(resolveMovement([{ climb: 'walk' }], 45).climb).toBe(45);
  });

  it('takes the best of several rather than adding them', () => {
    expect(resolveMovement([{ swim: 30 }, { swim: 60 }], 30).swim).toBe(60);
  });

  it('reads a climb speed as implying the waiver, but never the reverse', () => {
    expect(resolveMovement([{ climb: 20 }], 30).climbFree).toBe(true);
    const waiverOnly = resolveMovement([{ climbFree: true }], 30);
    expect(waiverOnly.climbFree).toBe(true);
    expect(waiverOnly.climb).toBe(0);
  });

  it('keeps the two waivers apart', () => {
    const gloves = resolveMovement([{ climbFree: true, swimFree: true }], 30);
    expect(gloves.climbFree && gloves.swimFree).toBe(true);
    const rogue = resolveMovement([{ climbFree: true }], 30);
    expect(rogue.swimFree).toBe(false);
  });
});

describe('where a character’s movement comes from', () => {
  it('reads a species trait as data rather than out of its text', () => {
    expect(moveOf({ raceId: 'tabaxi' }).climb).toBe(20);
    expect(moveOf({ raceId: 'genasi-water' }).swim).toBe(30);
  });

  it('resolves a "walking speed" species grant against the walking speed', () => {
    // Dhampir walk at 35, so their Spider Climb is 35 and not 30.
    const dhampir = moveOf({ raceId: 'dhampir' });
    expect(dhampir.walk).toBe(35);
    expect(dhampir.climb).toBe(35);
  });

  it('reaches a feat', () => {
    const athlete = moveOf({ raceId: 'human', featIds: ['athlete'] });
    expect(athlete.climbFree).toBe(true);
    expect(athlete.standUp).toBe(5);
  });

  it('reaches a subclass feature at the level it arrives, and not before', () => {
    expect(withClass('rogue', 2, 'thief').climbFree).toBe(false);
    expect(withClass('rogue', 3, 'thief').climbFree).toBe(true);
  });

  it('reaches a worn item', () => {
    // The Ring of Swimming needs no attunement, so wearing it is enough -
    // which is why the attunement half of this is checked on the Cloak below
    // rather than here, where it would have asserted nothing.
    expect(moveOf({ items: [{ itemId: 'ring-of-swimming', attuned: false }] }).swim).toBe(40);
  });

  it('waits for attunement on an item that needs it', () => {
    const carried = { items: [{ itemId: 'cloak-of-arachnida', attuned: false }] };
    expect(moveOf(carried).climb).toBe(0);
    const worn = { items: [{ itemId: 'cloak-of-arachnida', attuned: true }] };
    expect(moveOf(worn).climb).toBe(30);
  });

  it('leaves a potion in the pack doing nothing', () => {
    // Potion of Climbing grants a climb speed for an hour once drunk. Carried,
    // it grants nothing - the guard in `resolveItems` that §65 put there.
    expect(moveOf({ items: [{ itemId: 'potion-of-climbing', attuned: false }] }).climb).toBe(0);
  });

  it('gives an ordinary human nothing at all', () => {
    const human = moveOf({ raceId: 'human' });
    expect(human.climb + human.swim).toBe(0);
    expect(human.climbFree || human.swimFree).toBe(false);
    expect(human.jumpTimes).toBe(1);
  });

  it('gathers from every kind of record at once', () => {
    const stacked = moveOf({
      raceId: 'tabaxi',
      classes: [{ classId: 'rogue', level: 3, subclassId: 'thief' }],
      featIds: ['athlete'],
      items: [{ itemId: 'gloves-of-swimming-and-climbing', attuned: true }],
    });
    expect(moveGrantsFor(deriveBuild(at({
      raceId: 'tabaxi',
      classes: [{ classId: 'rogue', level: 3, subclassId: 'thief' }],
      featIds: ['athlete'],
      items: [{ itemId: 'gloves-of-swimming-and-climbing', attuned: true }],
    }))).length).toBeGreaterThanOrEqual(4);
    expect(stacked.climb).toBe(20);
    expect(stacked.swimFree).toBe(true);
  });
});

/*
  The sweep, and why it scans text rather than counting records.

  §63's first pass gave structured ranges to 24 species traits and missed
  twelve, because the 2024 species are a separate module and a hand-written
  list of "the ones that grant it" cannot know that. A count would have passed.
  What catches it is asking the *catalogue* which records talk about this, and
  requiring each one to have either a grant or a written reason it has none.
*/
describe('every record that talks about climbing or swimming', () => {
  const SPEAKS = /climb|swim/i;
  /** Says a speed or a waiver in so many words. */
  const GRANTS = /(climb|swim)\w*\s+speed|speed\s+equal|costs? no extra|no extra movement|at full speed|cost no extra/i;

  /**
   * Records whose text mentions climbing or swimming without granting either.
   * Each is a decision, not an oversight.
   */
  const NOT_A_GRANT = new Set([
    // A choice made after a long rest, with nowhere on the sheet to record it.
    'Bestial Soul',
    // A sorcery point spent, not a speed owned - the same shape as Shadow Arts.
    'Revelation in Flesh',
    // Wild Shape forms, which are a stat block rather than this character.
    'Wild Shape (CR 1/2, no flying speed)',
    // Prose about where the subclass fights, not a grant.
    'Guardians of the Depths',
    'Hold Breath',
    /*
      A potion, and the one entry here that is about the *engine* rather than
      the rules: an item effect applies while the item is carried, and a
      potion's climb speed lasts an hour from the moment it is drunk. Giving
      it a grant would hand the speed to anyone with the bottle in their pack,
      which is why `resolveItems` now refuses consumables outright.
    */
    'Potion of Climbing',
  ]);

  const traits = [...RACES, ...SPECIES_2024].flatMap((r) => r.traits);

  it('either grants it on the record or is listed as not granting it', () => {
    const missed = traits
      .filter((t) => SPEAKS.test(`${t.name} ${t.text}`) && GRANTS.test(`${t.name} ${t.text}`))
      .filter((t) => !t.move && !NOT_A_GRANT.has(t.name));
    expect(missed.map((t) => t.name)).toEqual([]);
  });

  it('covers the 2024 species module too, which is where §63 was caught', () => {
    // Not a vacuous pass: the module has to actually be non-empty, or this
    // test would be asserting nothing about it at all.
    expect(SPECIES_2024.length).toBeGreaterThan(0);
    const speak = SPECIES_2024.flatMap((r) => r.traits).filter((t) =>
      SPEAKS.test(`${t.name} ${t.text}`),
    );
    // 2024's SRD species grant no climb or swim speeds. That is the claim,
    // and it is checked rather than assumed.
    expect(speak.map((t) => t.name)).toEqual([]);
  });

  it('holds for subclass features in both editions', () => {
    const features = [
      ...Object.values(SUBCLASS_FEATURES).flat(),
      ...Object.values(SUBCLASS_FEATURES_2024).flat(),
    ];
    const missed = features
      .filter((f) => SPEAKS.test(f.summary) && GRANTS.test(f.summary))
      .filter((f) => !f.move && !NOT_A_GRANT.has(f.name));
    expect(missed.map((f) => f.name)).toEqual([]);
    // And the sweep found something, so the filter is not simply empty.
    expect(features.filter((f) => f.move).length).toBeGreaterThan(0);
  });

  it('holds for the magic item catalogue', () => {
    const missed = MAGIC_ITEMS.filter(
      (item) => SPEAKS.test(item.summary) && GRANTS.test(item.summary),
    ).filter((item) => !item.effect?.move && !NOT_A_GRANT.has(item.name));
    expect(missed.map((item) => item.name)).toEqual([]);
  });
});
