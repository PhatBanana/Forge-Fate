import { describe, expect, it } from 'vitest';
import { CLASSES } from '../classes';
import { deriveBuild, emptyBuild } from '../../engine/character';
import { withOriginalsForTests } from '../../originals';
import type { Build, ClassId, Ruleset } from '../../types';

/**
 * §59.4. Two decisions the Reckoner and the Harrier were making by omission.
 *
 * Neither was a bug in the sense of something throwing. Both were the app
 * answering a question it had never been asked, and answering it the same way
 * a missing table always does: with zero.
 */

const at = (classId: ClassId, level: number, ruleset: Ruleset): Build => ({
  ...emptyBuild(),
  ruleset,
  classes: [{ classId, level }],
});

const casting = (classId: ClassId, level: number, ruleset: Ruleset) =>
  deriveBuild(at(classId, level, ruleset)).spellcasting;

describe('the app’s own casters', () => {
  it('gives the Reckoner cantrips, because it borrowed a list made of them', () => {
    /*
      With no `CANTRIPS_KNOWN` row it had none, which left a 1st-level Reckoner
      holding two spells, two slots and a rapier - a third of the Warlock list
      it had been handed was unreachable.
    */
    const restore = withOriginalsForTests(true);
    try {
      for (const ruleset of ['2014', '2024'] as Ruleset[]) {
        expect(casting('reckoner', 5, ruleset).cantripsKnown, ruleset).toBeGreaterThan(0);
      }
    } finally {
      restore();
    }
  });

  it('gives the Harrier none, because the list it borrowed has none', () => {
    // Not the same omission wearing a different hat: the Ranger list carries
    // no cantrips in either edition, so a count would have nothing to spend.
    const restore = withOriginalsForTests(true);
    try {
      expect(casting('harrier', 5, '2014').cantripsKnown).toBe(0);
      expect(casting('ranger', 5, '2014').cantripsKnown).toBe(0);
    } finally {
      restore();
    }
  });

  it('makes both prepare under 2024, like every other 2024 caster', () => {
    /*
      The edition's headline caster change is that everybody prepares and can
      swap on a long rest. Without a `PREPARED_2024` row these two knew a fixed
      list instead - the app playing 2014 rules under a 2024 heading.
    */
    const restore = withOriginalsForTests(true);
    try {
      for (const classId of ['reckoner', 'harrier'] as ClassId[]) {
        const modern = casting(classId, 5, '2024');
        expect(modern.spellsPrepared, `${classId} prepares under 2024`).toBeGreaterThan(0);
        expect(modern.spellsKnown, `${classId} does not also know a list`).toBeNull();

        const legacy = casting(classId, 5, '2014');
        expect(legacy.spellsKnown, `${classId} still knows a list under 2014`).toBeGreaterThan(0);
      }
    } finally {
      restore();
    }
  });

  it('holds fewer spells than the class it borrows from', () => {
    /*
      The count is each class's own, not the borrowed one's. Taking the
      Warlock's or the Ranger's 2024 column would have handed a half caster
      several more spells in one edition than the other for no reason except
      which table was nearest.
    */
    const restore = withOriginalsForTests(true);
    try {
      const held = (id: ClassId, rs: Ruleset) => {
        const c = casting(id, 5, rs);
        return c.spellsPrepared ?? c.spellsKnown ?? 0;
      };
      for (const rs of ['2014', '2024'] as Ruleset[]) {
        expect(held('reckoner', rs), `reckoner vs warlock, ${rs}`).toBeLessThan(held('warlock', rs));
        expect(held('harrier', rs), `harrier vs ranger, ${rs}`).toBeLessThanOrEqual(held('ranger', rs));
      }
    } finally {
      restore();
    }
  });

  it('leaves the published casters exactly as they were', () => {
    // The two tables are spread into, not replaced. A published column that
    // moved would mean a Forge key had collided with one.
    expect(casting('warlock', 5, '2014').cantripsKnown).toBe(3);
    expect(casting('wizard', 5, '2024').spellsPrepared).toBe(9);
    expect(CLASSES.filter((c) => c.id === 'reckoner')).toHaveLength(1);
  });
});
