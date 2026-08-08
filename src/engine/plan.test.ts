import { describe, expect, it } from 'vitest';
import { emptyBuild } from './character';
import { FEATS_BY_ID } from '../data/feats';
import type { Ability, Build } from '../types';
import { planProgression } from './recommend';
import type { PlannedSlot } from './recommend';
import { applyPlan, describePlannedLevels, plannedLevels } from './plan';

/**
 * Taking a progression plan.
 *
 * These are the first tests this code has had. It shipped inside the
 * Optimizer's progression section and moved out in §33.1, on the way to the
 * Builder's pinned rail - and moving it is exactly when to find out whether it
 * works, because it does two things at once: it raises class levels *and*
 * spends ASI slots, and a build where those two disagree has feats taken at
 * levels the character never reached.
 *
 * Hand-built plans rather than real ones for the arithmetic, so a change to
 * what `planProgression` recommends does not rewrite the expectations; one test
 * at the end runs a real plan end to end, which is the part that would rot
 * silently otherwise.
 */

const fighter = (): Build => ({ ...emptyBuild(), featIds: [], asiPicks: [] });

/** A slot the plan reaches forward to, at the given class level. */
const at = (classLevel: number, classId = 'fighter') => ({
  classId,
  className: 'Fighter',
  classLevel,
  estimatedCharacterLevel: classLevel,
});

const scores: Record<Ability, number> = { str: 16, dex: 14, con: 15, int: 8, wis: 10, cha: 8 };

const takesFeat = (classLevel: number, id: string, asiChoice?: Ability): PlannedSlot => ({
  slot: at(classLevel),
  label: `Fighter ${classLevel}`,
  choice: {
    kind: 'feat',
    id,
    feat: FEATS_BY_ID[id],
    score: 1,
    reasons: [],
    headline: '',
    asiChoice,
    eligible: true,
    blockedBy: [],
  },
  scoresAfter: scores,
});

const takesAsi = (classLevel: number, allocation: Ability[]): PlannedSlot => ({
  slot: at(classLevel),
  label: `Fighter ${classLevel}`,
  choice: { kind: 'asi', id: `asi-${classLevel}`, allocation, score: 1, reasons: [], headline: '' },
  scoresAfter: scores,
});

describe('the levels a plan implies', () => {
  it('leaves a build alone when the plan is empty', () => {
    expect([...plannedLevels(fighter(), [])]).toEqual([['fighter', 5]]);
  });

  it('reaches forward to the highest level the plan plans for', () => {
    // The whole reason applying a plan touches levels at all: an ASI at
    // Fighter 8 is not a slot a Fighter 5 owns.
    const plan = [takesAsi(6, ['str', 'str']), takesFeat(8, 'sentinel')];
    expect(plannedLevels(fighter(), plan).get('fighter')).toBe(8);
  });

  it('never lowers a class the build is already past', () => {
    // A plan is in level order, but a build that has moved on since must not
    // be walked backwards by applying one.
    const build = { ...fighter(), classes: [{ classId: 'fighter', level: 12 }] } as Build;
    expect(plannedLevels(build, [takesAsi(6, ['str', 'str'])]).get('fighter')).toBe(12);
  });

  it('ignores a step with no slot, which is an ASI already in hand', () => {
    const plan: PlannedSlot[] = [{ ...takesAsi(6, ['str', 'str']), slot: null }];
    expect(plannedLevels(fighter(), plan).get('fighter')).toBe(5);
  });

  it('names the levels it would take you to', () => {
    expect(describePlannedLevels(fighter(), [takesFeat(8, 'sentinel')])).toBe('Fighter 8');
  });
});

describe('applying a plan', () => {
  it('raises the class and takes the feat together', () => {
    const next = applyPlan(fighter(), [takesFeat(6, 'sentinel')]);
    expect(next.classes[0].level).toBe(6);
    expect(next.featIds).toEqual(['sentinel']);
  });

  it('records a half-feat’s ability choice alongside the feat', () => {
    const next = applyPlan(fighter(), [takesFeat(6, 'resilient', 'str')]);
    expect(next.featAsiChoices.resilient).toBe('str');
  });

  it('carries the ability allocation of an ASI step', () => {
    const next = applyPlan(fighter(), [takesAsi(6, ['str', 'str'])]);
    expect(next.asiPicks).toEqual([['str', 'str']]);
  });

  it('adds to what the build already has rather than replacing it', () => {
    /*
      Load-bearing: a plan starts from the build it was made for, so it only
      ever describes slots that are still open. Replacing would throw away the
      very choices it was planned around.
    */
    const build: Build = {
      ...fighter(),
      featIds: ['great-weapon-master'],
      asiPicks: [['con', 'con']],
    };
    const next = applyPlan(build, [takesFeat(6, 'sentinel'), takesAsi(8, ['str', 'str'])]);
    expect(next.featIds).toEqual(['great-weapon-master', 'sentinel']);
    expect(next.asiPicks).toEqual([
      ['con', 'con'],
      ['str', 'str'],
    ]);
  });

  it('keeps the steps in the order they were planned', () => {
    const next = applyPlan(fighter(), [takesFeat(6, 'sentinel'), takesFeat(8, 'alert')]);
    expect(next.featIds).toEqual(['sentinel', 'alert']);
  });

  it('does not mutate the build it was given', () => {
    const build = fighter();
    applyPlan(build, [takesFeat(6, 'sentinel'), takesAsi(8, ['str', 'str'])]);
    expect(build.featIds).toEqual([]);
    expect(build.asiPicks).toEqual([]);
    expect(build.classes[0].level).toBe(5);
  });

  it('spends exactly as many slots as it raises levels for', () => {
    /*
      The invariant the whole thing exists to keep, run against a real plan
      rather than a hand-built one: every choice applied has to be paid for by
      a slot the build now owns.

      Four for this fixture, and the fourth is the interesting one. A Fighter
      gets ASIs at 4, 6, 8, 12, 14, 16 and 19; planning a level-5 Fighter to 12
      reaches three future slots - and the fixture has spent none of its
      `asiPicks`, so the one at 4 is still in hand. That is the `slot: null`
      step, which raises no level and must still be taken.
    */
    const build = fighter();
    const plan = planProgression(build, 12);
    const next = applyPlan(build, plan);

    const taken = next.featIds.length + next.asiPicks.length;
    expect(taken).toBe(plan.length);
    expect(taken).toBe(4);
    expect(plan.filter((step) => step.slot === null)).toHaveLength(1);
    expect(next.classes[0].level).toBe(12);
  });
});
