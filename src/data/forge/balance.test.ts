import { describe, expect, it } from 'vitest';
import type { Build, ClassId, Ruleset } from '../../types';
import { CLASSES, subclassesFor } from '../classes';
import { isOriginal } from '../sources';
import { deriveBuild, emptyBuild, equipBestArmor, weaponsForProfile } from '../../engine/character';
import { withOriginalsForTests } from '../../originals';

/**
 * Whether the app's own classes hit as hard as the published ones.
 *
 * ## Why a test rather than a judgement
 *
 * A new class that quietly outdamages the published thirteen is not a new
 * class, it is a mistake with a name on it - and it is the specific mistake
 * homebrew is expected to make, so the burden of proof sits here rather than
 * on a reader's goodwill. Equally, a class that lands well under the band is
 * a trap: somebody plays it for twenty levels and finds out at the table.
 *
 * ## What the band is
 *
 * Measured from the published classes **at run time**, not typed in. Each
 * published class is built at the level under test with the same point-buy
 * spread, the same equipment logic and its best-rated subclass, and its
 * sustained damage recorded. The band is the range those numbers occupy, and
 * every Forge class has to sit inside it.
 *
 * Measured rather than pinned because a pinned number goes stale the moment
 * the damage model changes, and then it is a test that passes for the wrong
 * reason. This one moves with `computeDpr`: if weapon mastery or a rider is
 * retuned, the band moves and the check still means what it says.
 *
 * ## What it cannot see
 *
 * Damage, and only damage. The Marshal's whole output is other people's turns
 * - an ally attacking off a Field Order does that ally's damage on that ally's
 * sheet - so it will sit at the bottom of the band by construction, and that
 * is correct rather than a failure. The band's *floor* is what catches a class
 * that is genuinely weak; the class note is what warns a player that the
 * number understates it. No damage model in this app or any other can price a
 * granted attack, and pretending otherwise by inventing a rider would be worse
 * than saying so.
 */

const LEVELS = [5, 11, 17];

/** Point buy at its most ordinary, so no class is flattered by its scores. */
function at(classId: ClassId, level: number, ruleset: Ruleset): Build {
  const klass = CLASSES.find((c) => c.id === classId)!;
  const subclass = subclassesFor(klass, ruleset)[0];
  let build: Build = {
    ...emptyBuild(),
    ruleset,
    classes: [{ classId, level, subclassId: subclass?.id }],
  };
  /*
    Armed and armoured the way the app itself would arm them - the same two
    helpers the Builder calls when you pick a class - so a low number is the
    class's, not the fixture's. A hand-picked greatsword for one class and a
    dagger for another would make this test an opinion about equipment.
  */
  build = { ...build, weapons: weaponsForProfile(klass.defaultWeaponStyle, 'two-handed') };
  build = equipBestArmor(build);
  return build;
}

function sustainedFor(classId: ClassId, level: number, ruleset: Ruleset): number {
  return deriveBuild(at(classId, level, ruleset)).dpr.sustained;
}

/*
  The switch is set inside each test rather than around the describe. A
  describe body runs at collection time and the tests run later, so a flag set
  out here would already have been restored by the time anything read it - and
  the tests would have measured the published classes only, passed, and meant
  nothing.
*/
describe('the app’s own classes against the published band', () => {
  for (const ruleset of ['2014', '2024'] as Ruleset[]) {
    describe(ruleset, () => {
      for (const level of LEVELS) {
        it(`keeps every Forge class inside the published band at level ${level}`, () => {
          const on = withOriginalsForTests(true);
          try {
            const published = CLASSES.filter(
              (c) => !isOriginal(c.source) && (c.rulesets ?? ['2014', '2024']).includes(ruleset),
            );
            /*
              Zeroes are dropped, and they are not zero-damage classes.

              The fixture arms each class from `defaultWeaponStyle`, which
              for a Wizard or a Cleric is `'spell'` - no weapon in hand, so
              `computeDpr` takes its casting branch, and a fixture build has
              no spells recorded to cast. That is the fixture being silent
              about casters rather than the model saying a Wizard deals no
              damage, and leaving it in put the band's floor at zero, which
              is a floor nothing can fall through.

              So the band is the published classes the model can actually
              price. A Forge caster is measured against them on its weapon
              output alone, which understates it in exactly the same way and
              is therefore a fair comparison.
            */
            const band = published
              .map((c) => sustainedFor(c.id, level, ruleset))
              .filter((n) => n > 0);
            const low = Math.min(...band);
            const high = Math.max(...band);

            const ours = CLASSES.filter(
              (c) => isOriginal(c.source) && (c.rulesets ?? ['2014', '2024']).includes(ruleset),
            );
            const outside = ours
              .map((c) => ({ name: c.name, dpr: sustainedFor(c.id, level, ruleset) }))
              .filter((row) => row.dpr < low || row.dpr > high)
              .map((row) => `${row.name}: ${row.dpr} outside ${low}-${high}`);

            expect(outside, `level ${level}, ${ruleset}`).toEqual([]);
          } finally {
            on();
          }
        });
      }
    });
  }

  it('does not put any of ours at the very top of the band', () => {
    /*
      Inside the band is the bar; being the *best* class in the game is a
      different claim and not one this project gets to make about its own
      content. Checked at 11, the level a long campaign actually reaches.

      Deliberately not applied to the floor. Something has to be the lowest
      damage class at every level, and the Marshal is a support class whose
      contribution this model cannot see - failing it for that would be the
      test punishing a design decision it is not equipped to evaluate.
    */
    const on = withOriginalsForTests(true);
    try {
      const rows = CLASSES.filter((c) => (c.rulesets ?? ['2014', '2024']).includes('2014')).map(
        (c) => ({ name: c.name, own: isOriginal(c.source), dpr: sustainedFor(c.id, 11, '2014') }),
      );
      const best = rows.reduce((top, row) => (row.dpr > top.dpr ? row : top));
      expect(best.own, `${best.name} is the highest-damage class in the app`).toBe(false);
    } finally {
      on();
    }
  });
});
