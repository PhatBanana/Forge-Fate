// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_HOUSE_RULES,
  HOUSE_RULE_INFO,
  highGroundBonus,
  loadHouseRules,
  saveHouseRules,
} from './houseRules';
import type { HouseRules } from './houseRules';

const KEY = 'dnd-forge:house-rules:v1';

beforeEach(() => localStorage.clear());

describe('what a table has agreed to', () => {
  it('starts with the book, not with the house', () => {
    // The app's claim is that it plays the rules as written; a number that
    // quietly disagreed would make every other number harder to trust.
    expect(loadHouseRules()).toEqual(DEFAULT_HOUSE_RULES);
    expect(DEFAULT_HOUSE_RULES.highGround).toBe(false);
  });

  it('remembers a choice across a reload', () => {
    saveHouseRules({ highGround: true, flanking: false });
    expect(loadHouseRules().highGround).toBe(true);
  });

  it('falls back to the book when the stored value is nonsense', () => {
    localStorage.setItem(KEY, 'not json');
    expect(loadHouseRules()).toEqual(DEFAULT_HOUSE_RULES);
  });

  it('reads field by field, so a later version cannot smuggle a rule in', () => {
    /*
      A file written by a version that knows about a rule this one does not
      must not turn that rule on here.

      The example used to be flanking, which §145 then implemented - so the
      fixture needs a rule that is genuinely unknown, or the test asserts
      nothing. That it had to be changed is the point rather than a nuisance:
      the smuggling guard is exactly what makes adding a rule safe.
    */
    localStorage.setItem(KEY, JSON.stringify({ highGround: true, cleaveOnKill: true }));
    const loaded = loadHouseRules() as HouseRules & { cleaveOnKill?: boolean };
    expect(loaded).toEqual({ highGround: true, flanking: false });
    expect(loaded.cleaveOnKill).toBeUndefined();
  });

  it('treats anything but true as off', () => {
    localStorage.setItem(KEY, JSON.stringify({ highGround: 'yes' }));
    expect(loadHouseRules().highGround).toBe(false);
  });

  it('describes every switch it carries, so nothing is unlabelled', () => {
    const described = new Set(HOUSE_RULE_INFO.map((r) => r.id));
    for (const id of Object.keys(DEFAULT_HOUSE_RULES)) {
      expect(described.has(id as keyof typeof DEFAULT_HOUSE_RULES)).toBe(true);
    }
  });
});

describe('what high ground is worth', () => {
  const on = { highGround: true, flanking: false };
  const off = { highGround: false, flanking: false };

  it('is nothing at all while the switch is off', () => {
    expect(highGroundBonus(off, 3)).toBe(0);
  });

  it('is two for any height, once it is on', () => {
    // A tower is not four times the advantage of a kerb, and the game this
    // is borrowed from does not pretend otherwise.
    expect(highGroundBonus(on, 1)).toBe(2);
    expect(highGroundBonus(on, 4)).toBe(2);
  });

  it('is nothing when level, and nothing when shooting uphill', () => {
    expect(highGroundBonus(on, 0)).toBe(0);
    expect(highGroundBonus(on, -2)).toBe(0);
  });
});
