import { describe, expect, it } from 'vitest';
import { SOURCE_LABELS, isOriginal, shortLabel } from './sources';
import type { Source } from './sources';
import { CLASSES, subclassSource } from './classes';
import { RACES } from './races';
import { FEATS } from './feats';
import { BACKGROUNDS } from './backgrounds';

/**
 * Where every row says it came from.
 *
 * Four tables carried an honest `source` from the day they were written and
 * nothing ever read it. Closing the set turns a typo into a type error, and
 * these tests cover the two things a type cannot: that every code has a label
 * a reader can use, and that nothing quietly relabels itself as something it
 * is not.
 *
 * The second is the one that matters once section 9's originals exist. An
 * original presented as a published option is the single failure this whole
 * layer is here to prevent.
 */

const everySource: Source[] = [
  ...RACES.map((r) => r.source),
  ...CLASSES.map((c) => c.source),
  ...CLASSES.flatMap((c) => c.subclasses.map((s) => s.source)),
  ...FEATS.map((f) => f.source),
  ...BACKGROUNDS.map((b) => b.source),
];

describe('the source vocabulary', () => {
  it('gives every code a title somebody could look up', () => {
    for (const [code, label] of Object.entries(SOURCE_LABELS)) {
      expect(label.length, code).toBeGreaterThan(3);
      // A label that is just the code back again helps nobody.
      expect(label).not.toBe(code);
    }
  });

  it('is used by every row in every table that has one', () => {
    const unknown = everySource.filter((source) => !(source in SOURCE_LABELS));
    expect([...new Set(unknown)]).toEqual([]);
  });

  it('has no code nothing uses', () => {
    /*
      A stale member is not harmless: it reads as a book the app covers. The
      one exception is `Forge`, which is declared before the content it will
      label exists - that is the point of building the layer first.
    */
    const used = new Set<string>(everySource);
    const orphans = Object.keys(SOURCE_LABELS).filter((c) => c !== 'Forge' && !used.has(c));
    expect(orphans).toEqual([]);
  });
});

describe('telling this project’s own content apart', () => {
  it('counts only Forge as original', () => {
    expect(isOriginal('Forge')).toBe(true);
    for (const source of everySource) {
      expect(isOriginal(source), source).toBe(false);
    }
  });

  it('says so in words rather than in a code', () => {
    // "Forge" beside "XGtE" and "TCoE" would read as one more book nobody had
    // heard of, which is the opposite of the point.
    expect(shortLabel('Forge')).toBe('Forge original');
    expect(shortLabel('XGtE')).toBe('XGtE');
  });

  it('carries a label that says it is not published', () => {
    expect(SOURCE_LABELS.Forge).toMatch(/not a published option/i);
  });
});

describe('what the 2024 relabelling may and may not do', () => {
  const zealot = CLASSES.find((c) => c.id === 'barbarian')!.subclasses.find(
    (s) => s.id === 'zealot',
  )!;

  it('sends a 2024 player to the 2024 book', () => {
    // The 2024 list *is* that book's four per class, so showing a Zealot as
    // XGtE would send somebody to the wrong shelf.
    expect(subclassSource(zealot, '2014')).toBe('XGtE');
    expect(subclassSource(zealot, '2024')).toBe('PHB 2024');
  });

  it('never relabels an original as published', () => {
    /*
      The bug this exists to stop. `subclassSource` rewrote *every* source to
      `PHB 2024` under the 2024 ruleset, so the moment a Forge subclass existed
      the app would have told a 2024 player it came from the Player's Handbook.
    */
    const original = { ...zealot, id: 'forge-test', source: 'Forge' as Source };
    expect(subclassSource(original, '2024')).toBe('Forge');
    expect(subclassSource(original, '2014')).toBe('Forge');
  });
});
