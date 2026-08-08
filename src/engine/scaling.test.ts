import { describe, expect, it } from 'vitest';
import { buildAtLevel, dprByLevel } from './scaling';
import { deriveBuild, emptyBuild } from './character';
import type { Build } from '../types';

/**
 * Damage against level, which is the other half of "scaling".
 *
 * The AC curve answers "can I hit this dragon"; this answers "is this build
 * front-loaded or does it come good at eleven". The judgement worth pinning is
 * in `buildAtLevel`: the stored build has no idea *when* a feat was taken, so
 * charting a level-12 character at level 3 has to decide what they had.
 */

const fighter = (over: Partial<Build> = {}): Build => ({
  ...emptyBuild(),
  featIds: [],
  asiPicks: [],
  ...over,
});

describe('the build at an earlier level', () => {
  it('lowers the primary class to that level', () => {
    expect(buildAtLevel(fighter(), 3)!.classes[0].level).toBe(3);
  });

  it('leaves the other classes where they are', () => {
    // A Fighter 6 / Rogue 2 at level 5 is a Fighter 3 / Rogue 2: the build the
    // player actually walked through, not a proportional blend.
    const multi = fighter({
      classes: [
        { classId: 'fighter', level: 6 },
        { classId: 'rogue', level: 2 },
      ],
    });
    const at = buildAtLevel(multi, 5)!;
    expect(at.classes.map((c) => [c.classId, c.level])).toEqual([
      ['fighter', 3],
      ['rogue', 2],
    ]);
  });

  it('has nothing to say below the level the dip already occupies', () => {
    const multi = fighter({
      classes: [
        { classId: 'fighter', level: 6 },
        { classId: 'rogue', level: 2 },
      ],
    });
    expect(buildAtLevel(multi, 2)).toBeNull();
  });

  it('trims feats to the slots that level had reached', () => {
    /*
      The load-bearing one. A Fighter gets improvements at 4, 6 and 8; a
      level-8 Fighter with three feats charted at level 4 had one of them.
      Without this the early levels would be flattered by everything the
      character has not earned yet.
    */
    const built = fighter({
      classes: [{ classId: 'fighter', level: 8 }],
      featIds: ['sentinel', 'alert', 'lucky'],
    });
    expect(buildAtLevel(built, 8)!.featIds).toEqual(['sentinel', 'alert', 'lucky']);
    expect(buildAtLevel(built, 6)!.featIds).toEqual(['sentinel', 'alert']);
    expect(buildAtLevel(built, 4)!.featIds).toEqual(['sentinel']);
    expect(buildAtLevel(built, 3)!.featIds).toEqual([]);
  });

  it('keeps the earliest taken, since order is all the build records', () => {
    const built = fighter({
      classes: [{ classId: 'fighter', level: 8 }],
      featIds: ['sentinel'],
      asiPicks: [['str', 'str'], ['con', 'con']],
    });
    // Feats are counted before improvements, which is the order they are
    // stored in - the build knows nothing finer than that.
    const at = buildAtLevel(built, 6)!;
    expect(at.featIds.length + at.asiPicks.length).toBe(2);
  });

  it('never trims an origin feat, which costs no slot', () => {
    const built = fighter({
      classes: [{ classId: 'fighter', level: 8 }],
      originFeatIds: ['tough'],
      featIds: ['sentinel', 'alert', 'lucky'],
    });
    expect(buildAtLevel(built, 3)!.originFeatIds).toEqual(['tough']);
  });

  it('does not mutate the build it was given', () => {
    const built = fighter({
      classes: [{ classId: 'fighter', level: 8 }],
      featIds: ['sentinel', 'alert'],
    });
    buildAtLevel(built, 3);
    expect(built.classes[0].level).toBe(8);
    expect(built.featIds).toEqual(['sentinel', 'alert']);
  });
});

describe('damage against level', () => {
  const built = fighter({ classes: [{ classId: 'fighter', level: 11, subclassId: 'champion' }] });
  const ac = deriveBuild(built).dpr.targetAc;

  it('gives a point for every level up to the build’s own', () => {
    expect(dprByLevel(built, ac, 11).map((p) => p.level)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });

  it('measures every level against the same armor class', () => {
    // Letting the target drift with level would fold two curves into one and
    // leave a rise that could be the build improving or the target getting
    // harder. The last point has to agree with the build's own headline.
    const points = dprByLevel(built, ac, 11);
    expect(points.at(-1)!.sustained).toBe(deriveBuild(built).dpr.sustained);
  });

  it('finds the step a Fighter actually has at five', () => {
    /*
      Extra Attack. This is the whole reason to re-derive at each level rather
      than extrapolate: the jump is a rule, not a trend, and it lands where the
      class table says.
    */
    const points = dprByLevel(built, ac, 11);
    const four = points.find((p) => p.level === 4)!.sustained;
    const five = points.find((p) => p.level === 5)!.sustained;
    expect(five).toBeGreaterThan(four * 1.5);
  });

  it('rises, or at worst holds, all the way up', () => {
    const points = dprByLevel(built, ac, 11);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].sustained, `level ${points[i].level}`).toBeGreaterThanOrEqual(
        points[i - 1].sustained,
      );
    }
  });

  it('starts a multiclass at the level it can first exist', () => {
    const multi = fighter({
      classes: [
        { classId: 'fighter', level: 5 },
        { classId: 'rogue', level: 2 },
      ],
    });
    expect(dprByLevel(multi, ac, 7)[0].level).toBe(3);
  });
});
