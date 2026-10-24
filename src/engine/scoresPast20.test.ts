import { describe, expect, it } from 'vitest';
import { blankBuild, deriveBuild } from './character';
import type { Build } from '../types';

/*
  §163: scores past 20.

  Ordinary increases stop at 20. An Epic Boon's +1 goes to 30, the 2024
  Monk's Body and Mind and the Barbarian's Primal Champion add +4 to their
  own ceilings, and boons a DM awards past 20th level stack on top.
*/

function monk20(overrides: Partial<Build> = {}): Build {
  return {
    ...blankBuild('2024'),
    raceId: 'human-2024',
    backgroundId: 'sailor-2024',
    backgroundAsi: { mode: '2+1', picks: ['dex', 'wis'] },
    classes: [{ classId: 'monk', level: 20, subclassId: 'shadow' }],
    baseScores: { str: 8, dex: 15, con: 15, int: 8, wis: 15, cha: 8 },
    originFeatIds: ['tavern-brawler', 'alert'],
    featIds: ['grappler', 'lucky', 'boon-of-the-night-spirit'],
    featAsiChoices: { grappler: 'dex', 'boon-of-the-night-spirit': 'cha' },
    asiPicks: [
      ['wis', 'wis'],
      ['con', 'con'],
    ],
    ...overrides,
  };
}

describe('scores past 20', () => {
  it('gives a 2024 Monk 20 Body and Mind: +4 Dexterity and Wisdom', () => {
    const ctx = deriveBuild(monk20());
    expect(ctx.scores.dex).toBe(22);
    expect(ctx.scores.wis).toBe(22);
    // 10 + DEX 6 + WIS 6, with nothing worn.
    expect(ctx.ac.total).toBe(22);
  });

  it('caps Body and Mind at 25', () => {
    const ctx = deriveBuild(
      monk20({ baseScores: { str: 8, dex: 18, con: 15, int: 8, wis: 18, cha: 8 }, asiPicks: [['dex', 'wis'], ['con', 'con']] }),
    );
    // DEX 18 +2 +1 +1 stops at 20, then +4 = 24; WIS 18 +1 +1 = 20, then 24.
    expect(ctx.scores.dex).toBe(24);
    expect(ctx.scores.wis).toBe(24);
    const higher = deriveBuild(
      monk20({
        baseScores: { str: 8, dex: 18, con: 15, int: 8, wis: 18, cha: 8 },
        featAsiChoices: { grappler: 'dex', 'boon-of-the-night-spirit': 'dex' },
        asiPicks: [['dex', 'wis'], ['con', 'con']],
      }),
    );
    // The boon takes DEX to 21 before the capstone, which then stops at 25.
    expect(higher.scores.dex).toBe(25);
  });

  it('does not give a 2014 Monk 20 Body and Mind', () => {
    const ctx = deriveBuild({
      ...monk20(),
      ruleset: '2014',
      raceId: 'human',
      backgroundId: undefined,
      originFeatIds: [],
      featIds: [],
      featAsiChoices: {},
      asiPicks: [],
      baseScores: { str: 8, dex: 18, con: 14, int: 8, wis: 18, cha: 8 },
    });
    expect(ctx.scores.dex).toBe(19);
  });

  it('lets an Epic Boon raise a score past 20, but not a half-feat', () => {
    const base = monk20({
      classes: [{ classId: 'monk', level: 19, subclassId: 'shadow' }],
      baseScores: { str: 8, dex: 17, con: 15, int: 8, wis: 15, cha: 8 },
      featAsiChoices: { grappler: 'dex', 'boon-of-the-night-spirit': 'dex' },
      asiPicks: [['dex', 'dex'], ['con', 'con']],
    });
    // 17 +2 Sailor +1 Grappler +2 ASI = 22, stopped at 20; the boon makes 21.
    expect(deriveBuild(base).scores.dex).toBe(21);
  });

  it('applies awarded boons past 20th level on top of Body and Mind', () => {
    const ctx = deriveBuild(
      monk20({
        awardedBoonIds: ['boon-of-fortitude'],
        featAsiChoices: { grappler: 'dex', 'boon-of-the-night-spirit': 'cha', 'boon-of-fortitude': 'wis' },
      }),
    );
    expect(ctx.scores.wis).toBe(23);
    expect(ctx.featIds.has('boon-of-fortitude')).toBe(true);
    expect(ctx.hp.lines.some((l) => l.label === 'Boon of Fortitude' && l.value === 40)).toBe(true);
  });

  it('gives a Barbarian 20 Primal Champion to its edition’s ceiling', () => {
    const barbarian = (ruleset: '2014' | '2024'): Build => ({
      ...blankBuild(ruleset),
      classes: [{ classId: 'barbarian', level: 20 }],
      baseScores: { str: 20, dex: 14, con: 20, int: 8, wis: 10, cha: 8 },
    });
    expect(deriveBuild(barbarian('2014')).scores.str).toBe(24);
    expect(deriveBuild(barbarian('2024')).scores.con).toBe(24);
  });

  it('never lets an Ioun Stone pull a score past 20 back down', () => {
    const ctx = deriveBuild(
      monk20({ items: [{ itemId: 'ioun-stone-insight', attuned: true }] }),
    );
    expect(ctx.scores.wis).toBe(22);
  });
});
