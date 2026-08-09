import { describe, expect, it } from 'vitest';
import { checkMulticlass } from './conditions';
import { analyze } from './analyze';
import { deriveBuild, emptyBuild } from './character';
import { CLASSES_BY_ID } from '../data/classes';
import type { Ability, Build, ClassId } from '../types';

/**
 * Section 43. `checkPrereq` has covered feats since the Builder had feats,
 * and the *multiclassing* prerequisites table was never checked at all - so a
 * Wizard 5 with Strength 8 could take a Fighter level and no screen said a
 * word about it.
 */

const scores = (over: Partial<Record<Ability, number>> = {}) => ({
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
  ...over,
});

const slices = (...ids: ClassId[]) => ids.map((id) => ({ klass: CLASSES_BY_ID[id] }));

describe('multiclass prerequisites', () => {
  it('leaves a single-class character entirely alone', () => {
    // The prerequisites are a multiclassing rule and nothing else. Without
    // this scoping every 1st-level Wizard with Intelligence 12 gets scolded.
    expect(checkMulticlass(slices('wizard'), scores({ int: 8 })).ok).toBe(true);
  });

  it('checks the class being left as well as the one being taken', () => {
    // "You must meet the ability score prerequisites for both your current
    // class and the new one" - both halves, and this is the half people skip.
    const out = checkMulticlass(slices('wizard', 'fighter'), scores({ int: 8, str: 16 }));
    expect(out.ok).toBe(false);
    expect(out.problems.join(' ')).toContain('Wizard');
  });

  it('reads "or" as or: a Fighter wants Strength 13 or Dexterity 13', () => {
    expect(checkMulticlass(slices('rogue', 'fighter'), scores({ dex: 16 })).ok).toBe(true);
    expect(checkMulticlass(slices('rogue', 'fighter'), scores({ dex: 16, str: 8 })).ok).toBe(true);
  });

  it('reads "and" as and, so a Paladin cannot get in on Strength alone', () => {
    const out = checkMulticlass(slices('fighter', 'paladin'), scores({ str: 16, cha: 8 }));
    expect(out.ok).toBe(false);
    expect(out.problems.join(' ')).toContain('Charisma 13');
  });

  it('passes a build that meets both tables', () => {
    expect(
      checkMulticlass(slices('fighter', 'paladin'), scores({ str: 16, cha: 14 })).ok,
    ).toBe(true);
  });

  it('does not fail a class the multiclassing table never covered', () => {
    // The Artificer is from a later book and has no row. A missing row is not
    // a failed one.
    expect(checkMulticlass(slices('artificer', 'wizard'), scores({ int: 16 })).ok).toBe(true);
  });
});

describe('the build review carries it', () => {
  const buildOf = (classes: Build['classes'], baseScores: Partial<Record<Ability, number>>) => ({
    ...emptyBuild(),
    raceId: 'human',
    classes,
    baseScores: { ...emptyBuild().baseScores, ...baseScores },
  });

  it('names an illegal multiclass as an error, not a suggestion', () => {
    const ctx = deriveBuild(
      buildOf(
        [
          { classId: 'wizard', level: 5 },
          { classId: 'fighter', level: 1 },
        ],
        { int: 8, str: 15, dex: 8 },
      ),
    );
    const finding = analyze(ctx).find((f) => f.title.includes('prerequisites'));
    expect(finding).toBeTruthy();
    // "Your character could not legally have been made" is not the same
    // severity as "your build is weak".
    expect(finding!.severity).toBe('error');
    // Flagged rather than forbidden: the fix names the waiver, because some
    // tables run it and a sheet imported from one has to survive the trip.
    expect(finding!.fix).toMatch(/waiv/i);
  });

  it('says nothing about a legal one', () => {
    const ctx = deriveBuild(
      buildOf(
        [
          { classId: 'fighter', level: 5 },
          { classId: 'paladin', level: 2 },
        ],
        { str: 15, cha: 14 },
      ),
    );
    expect(analyze(ctx).some((f) => f.title.includes('prerequisites'))).toBe(false);
  });
});
