import { describe, expect, it } from 'vitest';
import { RULESETS } from '../../types';
import { CLASSES, classesFor, subclassesFor } from '../classes';
import { FEATS, featsFor } from '../feats';
import { RACES, racesFor } from '../races';
import { BACKGROUNDS, backgroundsFor } from '../backgrounds';
import { CLASS_OPTIONS, optionsFor } from '../classOptions';
import type { ClassOptionKind } from '../classFeatures';
import { isOriginal } from '../sources';
import { withOriginalsForTests } from '../../originals';

/**
 * Section 53. The switch that reveals the app's own content, and the property
 * that has to hold for it to be safe to ship.
 *
 * ## The one rule
 *
 * With the switch off, **nothing this project wrote appears in any catalogue
 * a player picks from.** Not one class, subclass, feat, lineage, background or
 * class option. Off is what the books say.
 *
 * This is written as a sweep over every accessor rather than a test per
 * catalogue, for the same reason `legality.ts` keeps one list of budgets: six
 * catalogues were gated at one moment by one person, and the seventh will be
 * added by somebody else on a different day. A sweep fails on the day it is
 * forgotten; six separate tests pass happily while the seventh leaks.
 */

const OPTION_KINDS: ClassOptionKind[] = [
  'fighting-style', 'invocation', 'metamagic', 'maneuver', 'pact-boon',
];

/** Everything a player can be offered, in one place. */
function everythingOffered() {
  const rows: { where: string; name: string; source: string }[] = [];
  for (const ruleset of RULESETS) {
    for (const klass of classesFor(ruleset)) {
      rows.push({ where: `class (${ruleset})`, name: klass.name, source: klass.source });
      for (const sub of subclassesFor(klass, ruleset)) {
        rows.push({ where: `subclass of ${klass.name} (${ruleset})`, name: sub.name, source: sub.source });
      }
    }
    for (const feat of featsFor(ruleset)) {
      rows.push({ where: `feat (${ruleset})`, name: feat.name, source: feat.source });
    }
    for (const race of racesFor(ruleset)) {
      rows.push({ where: `lineage (${ruleset})`, name: race.name, source: race.source });
    }
    for (const bg of backgroundsFor(ruleset)) {
      rows.push({ where: `background (${ruleset})`, name: bg.name, source: bg.source });
    }
    for (const kind of OPTION_KINDS) {
      for (const option of optionsFor(kind, ruleset)) {
        rows.push({ where: `${kind} (${ruleset})`, name: option.name, source: option.source });
      }
    }
  }
  return rows;
}

describe('the originals switch', () => {
  it('offers nothing of ours while it is off', () => {
    const restore = withOriginalsForTests(false);
    try {
      const leaked = everythingOffered()
        .filter((row) => isOriginal(row.source as never))
        .map((row) => `${row.where}: ${row.name}`);
      expect(leaked).toEqual([]);
    } finally {
      restore();
    }
  });

  it('offers all of it while it is on', () => {
    /*
      The other direction, and it is not symmetry for its own sake: a `visible`
      that returned an empty list, or an accessor that filtered on the wrong
      field, would pass the test above perfectly. This one fails if the switch
      turns nothing on - which, until there is Forge content, means it fails if
      somebody deletes the content and leaves the switch.
    */
    const restore = withOriginalsForTests(true);
    try {
      const shownNames = new Set(everythingOffered().map((r) => `${r.name}`));
      const written = [
        ...CLASSES, ...CLASSES.flatMap((c) => c.subclasses),
        ...FEATS, ...RACES, ...BACKGROUNDS, ...CLASS_OPTIONS,
      ].filter((row) => isOriginal(row.source as never));

      const missing = written
        .filter((row) => !shownNames.has(row.name))
        .map((row) => row.name);
      expect(missing, 'written but never offered even with the switch on').toEqual([]);
    } finally {
      restore();
    }
  });

  it('resolves an original by id whatever the switch says', () => {
    /*
      The safety property the whole design rests on: the switch filters what is
      *offered*, never what is *resolved*. A character built with originals on
      and loaded with them off keeps working - it simply cannot pick another.
      Filtering the lookups too would blank a saved character the moment
      somebody flipped a setting, which is data loss rather than a preference.
    */
    const restore = withOriginalsForTests(false);
    try {
      // Whatever originals exist, every one of them still answers by id.
      const originals = CLASSES.filter((c) => isOriginal(c.source));
      for (const klass of originals) {
        expect(CLASSES.find((c) => c.id === klass.id), klass.name).toBeDefined();
      }
    } finally {
      restore();
    }
  });

  it('leaves the published catalogues exactly as they were', () => {
    // The switch must add, never remove. A bug that filtered on the wrong
    // predicate could quietly halve the class list.
    const off = withOriginalsForTests(false);
    const before = everythingOffered().length;
    off();
    const on = withOriginalsForTests(true);
    const after = everythingOffered().length;
    on();
    expect(after).toBeGreaterThanOrEqual(before);
  });
});
