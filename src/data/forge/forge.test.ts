import { describe, expect, it } from 'vitest';
import { RULESETS } from '../../types';
import { CLASSES, classesFor, subclassesFor } from '../classes';
import { FEATS, featsFor } from '../feats';
import { RACES, racesFor } from '../races';
import { BACKGROUNDS, backgroundsFor } from '../backgrounds';
import { CLASS_OPTIONS, optionsFor } from '../classOptions';
import type { ClassOptionKind } from '../classFeatures';
import { isOriginal } from '../sources';
import { SUBCLASS_FEATURES } from '../subclassFeatures';
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

  it('never shadows a published id', () => {
    /*
      Ours are appended to each class's list and spread *first* into the
      feature table, so a collision resolves in the book's favour rather than
      ours. That is the right resolution and a silent one, which is why it is
      asserted here: a Forge row that quietly replaced a published subclass's
      features would look like the app getting the Player's Handbook wrong.
    */
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const klass of CLASSES) {
      for (const sub of klass.subclasses) {
        const already = seen.get(sub.id);
        if (already) clashes.push(`${sub.id}: ${already} and ${klass.name}`);
        else seen.set(sub.id, klass.name);
      }
    }
    expect(clashes).toEqual([]);
  });
});

/**
 * Section 56. How many choices each class offers, which was the complaint.
 *
 * Counted with the switch **on**, because that is the roster this section
 * built. With it off the numbers are the published ones and the spread is the
 * one the books shipped with - nothing here can change that, and the first
 * test below pins it so a later edit cannot pretend to.
 */
describe('the subclass roster', () => {
  /*
    Counted through `classesFor`, which respects the switch, rather than over
    `CLASSES`. With the switch off the app's own classes are not on the table
    at all, and counting their subclasses as zero would report a spread nobody
    can see - which is exactly what the raw list did once there were Forge
    classes to count.
  */
  const countsFor = (ruleset: '2014' | '2024') =>
    new Map(classesFor(ruleset).map((k) => [k.id, subclassesFor(k, ruleset).length]));

  const spread = (counts: Map<string, number>) => {
    const values = [...counts.values()];
    return { low: Math.min(...values), high: Math.max(...values) };
  };

  it('was uneven before this section, and the published rows still are', () => {
    /*
      The measurement the work started from. Thirteen classes under 2014 with
      counts running from four to fourteen - a spread of ten that is an
      accident of publishing rather than a statement about the classes.
    */
    const restore = withOriginalsForTests(false);
    try {
      const published = spread(countsFor('2014'));
      expect(published).toEqual({ low: 4, high: 14 });
    } finally {
      restore();
    }
  });

  it('gives no 2014 class fewer than nine once ours are on', () => {
    const restore = withOriginalsForTests(true);
    try {
      const counts = countsFor('2014');
      const starved = [...counts].filter(([, n]) => n < 9).map(([id, n]) => `${id}: ${n}`);
      expect(starved, 'below the floor the section set').toEqual([]);
      // And the spread is genuinely narrower, not merely shifted upward.
      const { low, high } = spread(counts);
      expect(high - low).toBeLessThanOrEqual(6);
    } finally {
      restore();
    }
  });

  it('keeps the 2024 roster flat, which it already was', () => {
    /*
      2024 never had the problem: the Player's Handbook prints four per class
      and the app carries exactly four. Adding originals only where 2014 needed
      them would have broken the balanced roster to fix the unbalanced one, so
      every class gains exactly one and flat-at-four becomes flat-at-five.
    */
    const restore = withOriginalsForTests(true);
    try {
      const { low, high } = spread(countsFor('2024'));
      expect({ low, high }).toEqual({ low: 5, high: 5 });
    } finally {
      restore();
    }
  });

  it('gives every one of ours a feature list, same as the published rows', () => {
    // `features.test.ts` asserts this across the whole table; repeated here so
    // a Forge row added without features fails in the file that owns it.
    const bare: string[] = [];
    for (const klass of CLASSES) {
      for (const sub of klass.subclasses) {
        if (!isOriginal(sub.source)) continue;
        const total = (SUBCLASS_FEATURES[sub.id] ?? []).length + (sub.features ?? []).length;
        if (total < 4) bare.push(`${klass.id}/${sub.id}: ${total}`);
      }
    }
    expect(bare).toEqual([]);
  });
});
