import { describe, expect, it } from 'vitest';
import { FEATS, featsFor } from '../feats';
import { isOriginal } from '../sources';
import { withOriginalsForTests } from '../../originals';
import { RULESETS } from '../../types';

/**
 * §59.3. Whether the app's own feats are sized like feats.
 *
 * The same argument as `balance.test.ts` makes about the classes, applied to
 * the catalogue where homebrew most often goes wrong. A feat is a single line
 * of text with no level progression to hide behind, so an overtuned one is
 * both easy to write and hard to notice - it simply becomes the answer to
 * every ability score improvement, and the recommender says so with a straight
 * face because the recommender is reading the number this file wrote.
 *
 * Measured against the published catalogue's own distribution rather than
 * against a constant, so it moves when the published scores are retuned and
 * cannot go stale.
 */

const ours = () => FEATS.filter((f) => isOriginal(f.source));
const published = () => FEATS.filter((f) => !isOriginal(f.source));

describe('the app’s own feats', () => {
  it('exist at all, which is the thing that was missing', () => {
    /*
      §53 gated `featsFor` along with five other catalogues and §56 and §58
      filled two of them. This one was empty until now - the gate worked
      perfectly on nothing, which is the quietest kind of unfinished.
    */
    expect(ours().length).toBeGreaterThanOrEqual(8);
  });

  it('never outranks the best published feat', () => {
    const ceiling = Math.max(...published().map((f) => f.base));
    const over = ours()
      .filter((f) => f.base >= ceiling)
      .map((f) => `${f.name}: ${f.base} against a published ceiling of ${ceiling}`);
    expect(over, 'a homebrew feat should not be the best feat in the game').toEqual([]);
  });

  it('sits inside the published spread rather than at either edge', () => {
    /*
      The floor matters as much as the ceiling. A feat scored so low that the
      recommender never surfaces it is content nobody will ever see, which is a
      more wasteful failure than an overtuned one and a quieter one.
    */
    const bases = published().map((f) => f.base);
    const low = Math.min(...bases);
    const high = Math.max(...bases);
    const outside = ours()
      .filter((f) => f.base < low || f.base > high)
      .map((f) => `${f.name}: ${f.base} outside ${low}-${high}`);
    expect(outside).toEqual([]);
  });

  it('says what it does under both editions', () => {
    /*
      A 2024 feat needs a category or the Builder cannot tell an origin feat
      from a general one, and a general feat needs a level prerequisite or it
      is available at 1st - which is the difference between a feat and an
      origin feat, and the app enforces it everywhere else.
    */
    const wrong: string[] = [];
    for (const feat of ours()) {
      if (!feat.category) wrong.push(`${feat.name}: no 2024 category`);
      if (feat.category === 'general' && !feat.prereq?.minLevel) {
        wrong.push(`${feat.name}: a general feat with no level requirement`);
      }
      if (!(feat.rulesets ?? []).length) wrong.push(`${feat.name}: no ruleset`);
    }
    expect(wrong).toEqual([]);
  });

  it('is offered in both rulesets when the switch is on, and never when it is off', () => {
    for (const ruleset of RULESETS) {
      const off = withOriginalsForTests(false);
      const hidden = featsFor(ruleset).filter((f) => isOriginal(f.source));
      off();
      expect(hidden.map((f) => f.name), `leaked under ${ruleset}`).toEqual([]);

      const on = withOriginalsForTests(true);
      const shown = featsFor(ruleset).filter((f) => isOriginal(f.source));
      on();
      expect(shown.length, `none offered under ${ruleset}`).toBe(ours().length);
    }
  });
});
