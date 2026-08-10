import type { CastingType, Ruleset } from '../types';
import { FORGE_SPELLS_KNOWN } from './forge/classes';

/**
 * Spell slot progressions.
 *
 * Three tables plus the Warlock, whose Pact Magic is a separate resource that
 * never merges with the rest - a Warlock 5 / Sorcerer 5 has both the slots of a
 * 5th-level caster and two 3rd-level pact slots, and spending one does not
 * touch the other.
 */

/** Slots at each spell level 1-9, indexed by caster level 1-20. */
export const FULL_CASTER_SLOTS: number[][] = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0], // 1
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0], // 5
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0], // 10
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0], // 15
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1], // 20
];

/**
 * Pact Magic: a small number of slots, always at the highest level you have,
 * and they come back on a short rest. Indexed by Warlock level 1-20.
 */
export const PACT_SLOTS: { count: number; level: number }[] = [
  { count: 1, level: 1 }, // 1
  { count: 2, level: 1 },
  { count: 2, level: 2 },
  { count: 2, level: 2 },
  { count: 2, level: 3 }, // 5
  { count: 2, level: 3 },
  { count: 2, level: 4 },
  { count: 2, level: 4 },
  { count: 2, level: 5 },
  { count: 2, level: 5 }, // 10
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 }, // 15
  { count: 3, level: 5 },
  { count: 4, level: 5 },
  { count: 4, level: 5 },
  { count: 4, level: 5 },
  { count: 4, level: 5 }, // 20
];

/**
 * How much a class level contributes to the shared multiclass caster level.
 * This is the rule most builders get wrong: a Paladin 6 / Sorcerer 6 casts as a
 * 9th-level caster, not a 12th - the Paladin half rounds down to 3.
 */
export function casterLevelContribution(
  castingType: CastingType,
  classLevel: number,
  /**
   * The Artificer, and only the Artificer: its multiclassing sidebar says to
   * add half your levels **rounded up**, where the Paladin and Ranger round
   * down. Missing this made an Artificer 3 / Wizard 3 cast as a 4th-level
   * caster rather than a 5th, at every odd Artificer level.
   */
  roundsUp = false,
): number {
  switch (castingType) {
    case 'full':
      return classLevel;
    case 'half':
      if (roundsUp) return Math.ceil(classLevel / 2);
      // A half caster contributes nothing until level 2, when casting starts.
      return classLevel >= 2 ? Math.floor(classLevel / 2) : 0;
    case 'third':
      return classLevel >= 3 ? Math.floor(classLevel / 3) : 0;
    default:
      // Pact Magic is its own resource and never joins the pool.
      return 0;
  }
}

/**
 * The caster level a class's *own* table gives it, which is not the same
 * number as its multiclass contribution above - and the difference is a real
 * rule rather than an inconsistency.
 *
 * A single-class Paladin 5 has four 1st-level slots and two 2nd, which is what
 * a 3rd-level caster has. The multiclass formula would say `floor(5/2) = 2`
 * and hand them three 1st-level slots and nothing else, a whole spell level
 * short. Both are correct in their own place: the class table governs a
 * character who has only that class, and the multiclass table governs one who
 * has two. Rounding *up* is what reproduces the printed progression, verified
 * against the SRD 5.1 Paladin and Ranger tables at all 20 levels.
 *
 * The only thing 2024 changed is where it starts: a Paladin and Ranger cast
 * from 1st level rather than 2nd, so a 2024 Ranger 1 has two 1st-level slots
 * where a 2014 Ranger 1 has none.
 */
export function soleCasterLevel(
  castingType: CastingType,
  classLevel: number,
  ruleset: Ruleset,
  /**
   * The Artificer again: its own table has slots at 1st level under both
   * editions, where the 2014 Paladin and Ranger wait until 2nd. Sharing the
   * `'half'` casting type meant it inherited their late start and a 1st-level
   * Artificer was shown two cantrips and no slots to cast anything with.
   */
  fromLevel1 = false,
): number {
  switch (castingType) {
    case 'full':
      return classLevel;
    case 'half': {
      const startsAt = fromLevel1 || ruleset === '2024' ? 1 : 2;
      return classLevel >= startsAt ? Math.ceil(classLevel / 2) : 0;
    }
    case 'third':
      return classLevel >= 3 ? Math.ceil(classLevel / 3) : 0;
    default:
      return 0;
  }
}

/** Slots at each spell level 1-9 for a given effective caster level. */
export function slotsForCasterLevel(casterLevel: number): number[] {
  if (casterLevel < 1) return [0, 0, 0, 0, 0, 0, 0, 0, 0];
  return FULL_CASTER_SLOTS[Math.min(20, casterLevel) - 1];
}

export function pactSlotsFor(warlockLevel: number): { count: number; level: number } | null {
  if (warlockLevel < 1) return null;
  return PACT_SLOTS[Math.min(20, warlockLevel) - 1];
}

/**
 * Cantrips known, by class and level. Classes not listed here get none from
 * their class - a Paladin and Ranger have no cantrips at all.
 */
export const CANTRIPS_KNOWN: Record<string, number[]> = {
  //          1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20
  bard:      [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  cleric:    [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  druid:     [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  sorcerer:  [4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
  warlock:   [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  wizard:    [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  artificer: [2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4],
};

/**
 * Spells known, for the classes that know a fixed list rather than preparing
 * from the whole one. A Cleric, Druid, Paladin, Artificer and Wizard are absent
 * because they prepare instead.
 */
export const SPELLS_KNOWN: Record<string, number[]> = {
  // The app's own two casters. Both are half casters drawing on a published
  // list rather than carrying one, so a known column rather than a prepared
  // one - a borrowed list is already generous enough without free preparation.
  ...FORGE_SPELLS_KNOWN,

  //          1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20
  bard:      [4, 5, 6, 7, 8, 9,10,11,12,14,15,15,16,18,19,19,20,22,22,22],
  ranger:    [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9,10,10,11,11],
  sorcerer:  [2, 3, 4, 5, 6, 7, 8, 9,10,11,12,12,13,13,14,14,15,15,15,15],
  warlock:   [2, 3, 4, 5, 6, 7, 8, 9,10,10,11,11,12,12,13,13,14,14,15,15],
};

/**
 * 2024 replaced both of the above with one idea: **every** caster prepares,
 * and how many is a printed column rather than a formula.
 *
 * That is two changes at once. A Sorcerer who knew 6 spells at 5th level now
 * prepares 9, and a Cleric who prepared "Wisdom modifier + level" now prepares
 * whatever the table says regardless of their Wisdom - so a high-Wisdom Cleric
 * lost a spell and a low-Wisdom one gained several. Only the Warlock's column
 * is unchanged from their 2014 known list.
 *
 * Transcribed from the SRD 5.2 class tables in `srd/srd-2024-classes.json`, and
 * checked against them by the data audit.
 */
export const PREPARED_2024: Record<string, number[]> = {
  //          1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20
  bard:      [4, 5, 6, 7, 9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22],
  cleric:    [4, 5, 6, 7, 9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22],
  druid:     [4, 5, 6, 7, 9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22],
  paladin:   [2, 3, 4, 5, 6, 6, 7, 7, 9, 9,10,10,11,11,12,12,14,14,15,15],
  ranger:    [2, 3, 4, 5, 6, 6, 7, 7, 9, 9,10,10,11,11,12,12,14,14,15,15],
  sorcerer:  [2, 4, 6, 7, 9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22],
  warlock:   [2, 3, 4, 5, 6, 7, 8, 9,10,10,11,11,12,12,13,13,14,14,15,15],
  wizard:    [4, 5, 6, 7, 9,10,11,12,14,15,16,16,17,18,19,21,22,23,24,25],
};
