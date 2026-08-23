import { describe, expect, it } from 'vitest';
import { SECTIONS, SECTION_LABEL, openChoicesBySection } from './sections';
import { deriveBuild } from '../engine/character';
import { buildOf, fighter } from '../test/factories';
import { defaultDefenses } from '../engine/defense';

/** Nothing chosen: no background, every score at 8, nothing held or worn. */
const blank = () =>
  buildOf({
    backgroundId: undefined,
    baseScores: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },
    weapons: { magicBonus: {} },
    defenses: defaultDefenses(),
  });

/*
  §123. The badge counts, asked directly.

  These were only ever reachable by rendering the whole 2,985-line Builder
  and reading `getByTitle('N still to choose')` off the rail - so what the
  count actually is, for a character in a known state, was asserted through
  three layers of markup. The rule the badges enforce ("an unfinished choice
  is a badge, not a build-review finding") only works if the counts are
  right, and 2024's two extra choices were missing for a while precisely
  because nothing here could say so.
*/

describe('the section labels', () => {
  it('names every section exactly once', () => {
    expect(Object.keys(SECTION_LABEL).sort()).toEqual(SECTIONS.map((s) => s.id).sort());
    for (const section of SECTIONS) expect(SECTION_LABEL[section.id]).toBe(section.label);
  });
});

describe('what each section is still waiting on', () => {
  it('counts every section for a character with nothing chosen', () => {
    const open = openChoicesBySection(deriveBuild(blank()));
    expect(open.identity).toBeGreaterThan(0);
    // Every score at 8 with the whole budget unspent is the one case that
    // cannot be a false positive: nobody assigns all eights on purpose.
    expect(open.abilities).toBe(1);
    expect(open.equipment).toBeGreaterThan(0);
  });

  it('stops counting abilities the moment any of the budget is spent', () => {
    const spent = { ...blank(), baseScores: { str: 15, dex: 14, con: 14, int: 10, wis: 10, cha: 8 } };
    expect(openChoicesBySection(deriveBuild(spent)).abilities).toBe(0);
  });

  it('stops counting equipment once anything is held or worn', () => {
    const bare = openChoicesBySection(deriveBuild(blank())).equipment;
    expect(bare).toBeGreaterThan(0);
    const armed = { ...blank(), weapons: { mainHandId: 'longsword', magicBonus: {} } };
    expect(openChoicesBySection(deriveBuild(armed)).equipment).toBe(bare - 1);
  });

  it('counts a 2024 Fighter’s unspent weapon masteries, which 2014 has none of', () => {
    const base = { ...fighter(5), masteryIds: [] as string[] };
    const in2024 = deriveBuild({ ...base, ruleset: '2024' as const });
    const in2014 = deriveBuild({ ...base, ruleset: '2014' as const });
    // Masteries are a 2024 rule, so only that ruleset has any to be short of.
    expect(openChoicesBySection(in2024).equipment).toBeGreaterThan(
      openChoicesBySection(in2014).equipment,
    );
  });

  it('counts an unspent ability score improvement under feats', () => {
    // A Fighter reaches its first ASI at 4; nothing has been spent on it.
    const ctx = deriveBuild(fighter(4));
    expect(ctx.asiSlotsReached).toBeGreaterThan(ctx.asiSlotsSpent);
    expect(openChoicesBySection(ctx).feats).toBeGreaterThan(0);
  });

  it('never reports a negative count, however many slots have been spent', () => {
    for (const level of [1, 4, 8, 12, 20]) {
      const open = openChoicesBySection(deriveBuild(fighter(level)));
      for (const [id, count] of Object.entries(open)) {
        expect(count, `${id} at level ${level}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
