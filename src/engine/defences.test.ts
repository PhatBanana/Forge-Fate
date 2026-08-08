import { describe, expect, it } from 'vitest';
import { applyDefences, parseDefence, verdictFor } from './defences';
import fixture from '../data/srd/srd-2014-monsters.json';

interface Rec {
  name: string;
  resist?: string[];
  immune?: string[];
  vulnerable?: string[];
}
const records = fixture.records as unknown as Rec[];

const entries = () => {
  const all = new Set<string>();
  for (const m of records) {
    for (const key of ['resist', 'immune', 'vulnerable'] as const) {
      for (const v of m[key] ?? []) all.add(v);
    }
  }
  return [...all];
};

describe('reading a stat block’s defences', () => {
  it('covers every entry the whole bestiary uses', () => {
    // The failure this catches is a data refresh inventing new prose, which
    // would otherwise degrade silently. There are 19 today.
    const all = entries();
    expect(all.length).toBe(19);
    const unread = all.filter((e) => parseDefence(e).unknown);
    expect(unread).toEqual([]);
  });

  it('takes a bare damage type at face value', () => {
    expect(parseDefence('fire')).toEqual({ types: ['fire'], source: 'fire' });
    expect(parseDefence('poison').qualifier).toBeUndefined();
  });

  it('reads the three types out of the common weapon clause', () => {
    const parsed = parseDefence('bludgeoning, piercing, and slashing from nonmagical weapons');
    expect(parsed.types).toEqual(['bludgeoning', 'piercing', 'slashing']);
    expect(parsed.qualifier).toBe('nonmagical');
  });

  it('prefers the narrower qualifier, since the wider one is a substring', () => {
    // "that aren't silvered" also contains "nonmagical"; the metal is the point.
    expect(
      parseDefence("bludgeoning, piercing, and slashing from nonmagical weapons that aren't silvered")
        .qualifier,
    ).toBe('nonmagical-not-silvered');
    expect(
      parseDefence("piercing and slashing from nonmagical weapons that aren't adamantine").qualifier,
    ).toBe('nonmagical-not-adamantine');
  });

  it('reads the two it can never settle', () => {
    const spells = parseDefence('damage from spells');
    expect(spells.qualifier).toBe('from-spells');
    // It names no type because it covers all of them: this is a defence
    // against where the damage came from, not against a kind of hurt.
    expect(spells.allTypes).toBe(true);
    expect(spells.unknown).toBeUndefined();
    expect(parseDefence('piercing from magic weapons wielded by good creatures').qualifier).toBe(
      'good-wielder',
    );
  });

  it('degrades to a question rather than a wrong number', () => {
    // Prose nobody has taught it: it says so, and the caller asks the table.
    const parsed = parseDefence('fire from angry bees');
    expect(parsed.unknown).toBe(true);
    expect(verdictFor(parsed, { type: 'fire' })).toBe('ask');
  });
});

describe('whether an entry bites', () => {
  const skeleton = parseDefence('bludgeoning, piercing, and slashing from nonmagical weapons');

  it('ignores a damage type it does not cover', () => {
    expect(verdictFor(parseDefence('fire'), { type: 'cold' })).toBe('no');
    expect(verdictFor(skeleton, { type: 'fire' })).toBe('no');
  });

  it('settles the magic question by itself, both ways', () => {
    expect(verdictFor(skeleton, { type: 'bludgeoning' })).toBe('applies');
    expect(verdictFor(skeleton, { type: 'bludgeoning', magical: true })).toBe('no');
  });

  it('settles the magic half of a metal clause and asks about the rest', () => {
    const wolf = parseDefence(
      "bludgeoning, piercing, and slashing from nonmagical weapons that aren't silvered",
    );
    // A magic weapon is out either way, so that half needs no ruling.
    expect(verdictFor(wolf, { type: 'piercing', magical: true })).toBe('no');
    // A mundane one might be silvered, and only the table knows.
    expect(verdictFor(wolf, { type: 'piercing' })).toBe('ask');
  });

  it('always asks about alignment and about spells', () => {
    expect(verdictFor(parseDefence('damage from spells'), { type: 'fire' })).toBe('ask');
    expect(
      verdictFor(parseDefence('piercing from magic weapons wielded by good creatures'), {
        type: 'piercing',
        magical: true,
      }),
    ).toBe('ask');
  });
});

describe('putting damage through', () => {
  it('leaves an undefended blow exactly as it was', () => {
    expect(applyDefences(11, { type: 'fire' }, {})).toEqual({ dealt: 11, notes: [] });
  });

  it('halves against resistance, rounding down as the book rounds', () => {
    const out = applyDefences(11, { type: 'fire' }, { resist: ['fire'] });
    expect(out.dealt).toBe(5);
    expect(out.notes[0]).toBe('resists fire');
  });

  it('doubles against vulnerability', () => {
    expect(applyDefences(7, { type: 'fire' }, { vulnerable: ['fire'] }).dealt).toBe(14);
  });

  it('zeroes against immunity, and immunity beats everything', () => {
    const out = applyDefences(20, { type: 'poison' }, { immune: ['poison'], vulnerable: ['poison'] });
    expect(out.dealt).toBe(0);
    expect(out.notes[0]).toBe('immune to poison');
  });

  it('cancels resistance against vulnerability, which is a ruling', () => {
    // The SRD does not say. Cancelling is what most tables do, and the only
    // answer that does not depend on which is applied first.
    const out = applyDefences(10, { type: 'fire' }, { resist: ['fire'], vulnerable: ['fire'] });
    expect(out.dealt).toBe(10);
    expect(out.notes[0]).toMatch(/they cancel/);
  });

  it('does not halve a skeleton’s wounds from a magic mace', () => {
    const skeleton = { resist: ['bludgeoning, piercing, and slashing from nonmagical weapons'] };
    expect(applyDefences(10, { type: 'bludgeoning' }, skeleton).dealt).toBe(5);
    expect(applyDefences(10, { type: 'bludgeoning', magical: true }, skeleton).dealt).toBe(10);
  });

  it('passes the damage and hands the ruling over when it cannot decide', () => {
    const wolf = {
      resist: ["bludgeoning, piercing, and slashing from nonmagical weapons that aren't silvered"],
    };
    const out = applyDefences(10, { type: 'piercing' }, wolf);
    // Full damage, plus a line naming exactly what the table has to settle.
    expect(out.dealt).toBe(10);
    expect(out.notes[0]).toMatch(/^ask the table: /);
    expect(out.notes[0]).toContain('silvered');
  });

  it('leaves healing and zero alone', () => {
    expect(applyDefences(0, { type: 'fire' }, { vulnerable: ['fire'] }).dealt).toBe(0);
    expect(applyDefences(-5, { type: 'fire' }, { vulnerable: ['fire'] }).dealt).toBe(-5);
  });
});

describe('against the whole bestiary', () => {
  it('never turns a hit into healing, whatever the stat block says', () => {
    for (const m of records) {
      for (const type of ['fire', 'bludgeoning', 'poison', 'radiant']) {
        const out = applyDefences(10, { type }, m);
        expect(out.dealt).toBeGreaterThanOrEqual(0);
        expect(out.dealt).toBeLessThanOrEqual(20);
      }
    }
  });

  it('actually changes the answer for the creatures it should', () => {
    const fireImmune = records.find((m) => (m.immune ?? []).includes('fire'))!;
    expect(applyDefences(18, { type: 'fire' }, fireImmune).dealt).toBe(0);

    // A skeleton is *vulnerable* to bludgeoning, not resistant - the first
    // draft of this test asserted the opposite while its own comment said the
    // right thing. Checked against the real record rather than a memory.
    const skeleton = records.find((m) => m.name === 'Skeleton')!;
    expect(skeleton.vulnerable).toContain('bludgeoning');
    expect(applyDefences(10, { type: 'bludgeoning' }, skeleton).dealt).toBe(20);
    expect(applyDefences(10, { type: 'fire' }, skeleton).dealt).toBe(10);
  });
});
