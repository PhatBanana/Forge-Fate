import { describe, expect, it } from 'vitest';
import { called, verdict } from './checkCall';
import { deriveBuild, saveBonusOf } from './engine/character';
import { buildOf, rosterOf } from './test/factories';
import type { Build } from './types';

/*
  §141. The DM asks; each sheet answers for itself.

  Every case here is about the comparison, because that is the part that
  can be wrong in a way nobody notices: a verdict that reads "raise your
  hand" for the second-best character is worse than no verdict at all, and
  it looks exactly the same on screen.
*/

/** A character with a known Perception: Wisdom, and proficiency or not. */
const watcher = (name: string, wis: number, proficient: boolean): Build =>
  buildOf({
    name,
    raceId: 'human',
    classes: [{ classId: 'fighter', level: 1 }],
    baseScores: { str: 10, dex: 10, con: 10, int: 10, wis, cha: 10 },
    skillIds: proficient ? ['perception'] : [],
  });

const ctxOf = (build: Build) => deriveBuild(build);
const PERCEPTION = { ask: 'skill', skillId: 'perception' } as const;

describe('what a call asks of one sheet', () => {
  it('is nothing at all when nothing is being asked', () => {
    const me = ctxOf(watcher('Nyx', 16, true));
    expect(called(null, me, 'c0', null)).toBeNull();
  });

  it('reads this character’s own modifier off the sheet’s own lines', () => {
    const build = watcher('Nyx', 16, true);
    const me = ctxOf(build);
    const answer = called(PERCEPTION, me, 'c0', rosterOf(build))!;
    const line = me.proficiencies.skills.find((s) => s.skill === 'perception')!;
    expect(answer.mine).toBe(line.modifier);
    expect(answer.name).toBe('Perception');
  });

  it('raises a hand when nobody else is at the table', () => {
    const build = watcher('Nyx', 8, false);
    const answer = called(PERCEPTION, ctxOf(build), 'c0', rosterOf(build))!;
    // A dreadful Perception is still the best one in the room when it is
    // the only one - the DM asked who is highest, not who is good.
    expect(answer.best).toBeNull();
    expect(answer.raise).toBe(true);
  });

  it('names whoever has it instead, and says not to raise', () => {
    const mine = watcher('Nyx', 10, false);
    const better = watcher('Bram', 18, true);
    const party = rosterOf(mine, better);
    const answer = called(PERCEPTION, ctxOf(mine), party.entries[0].id, party)!;
    expect(answer.raise).toBe(false);
    expect(answer.best?.name).toBe('Bram');
    expect(answer.best!.modifier).toBeGreaterThan(answer.mine);
  });

  it('raises when this character is the best of several', () => {
    const mine = watcher('Nyx', 18, true);
    const party = rosterOf(mine, watcher('Bram', 10, false), watcher('Vex', 12, false));
    const answer = called(PERCEPTION, ctxOf(mine), party.entries[0].id, party)!;
    expect(answer.raise).toBe(true);
  });

  it('raises on a tie, because both of them are the best', () => {
    // Two identical watchers. A tie broken by roster order would be a lie
    // told by a sort: the DM asked who is highest and they equally are.
    const mine = watcher('Nyx', 16, true);
    const party = rosterOf(mine, watcher('Bram', 16, true));
    const answer = called(PERCEPTION, ctxOf(mine), party.entries[0].id, party)!;
    expect(answer.best!.modifier).toBe(answer.mine);
    expect(answer.raise).toBe(true);
  });

  it('compares by roster id, not by name', () => {
    /*
      Two players both called their fighter Bram, which is a real thing that
      happens. Filtering the speaker out by name would drop the *other*
      Bram from the comparison and hand this one a hand-raise it has not
      earned.
    */
    const mine = watcher('Bram', 8, false);
    const party = rosterOf(mine, watcher('Bram', 18, true));
    const answer = called(PERCEPTION, ctxOf(mine), party.entries[0].id, party)!;
    expect(answer.raise).toBe(false);
    expect(answer.best!.name).toBe('Bram');
  });

  it('answers for a skill this character is not proficient in', () => {
    // The point of asking is that somebody might be short. A sheet with no
    // Perception row still has a Wisdom modifier and still has an answer.
    const build = watcher('Nyx', 14, false);
    const answer = called(PERCEPTION, ctxOf(build), 'c0', rosterOf(build))!;
    expect(answer.mine).toBe(2);
  });

  it('is nothing for a skill that does not exist', () => {
    const build = watcher('Nyx', 10, false);
    const bogus = { ask: 'skill', skillId: 'telepathy' } as unknown as typeof PERCEPTION;
    expect(called(bogus, ctxOf(build), 'c0', rosterOf(build))).toBeNull();
  });
});

describe('the line the heading carries', () => {
  it('says to raise, with the number', () => {
    const build = watcher('Nyx', 16, true);
    const answer = called(PERCEPTION, ctxOf(build), 'c0', rosterOf(build))!;
    expect(verdict(answer)).toBe(`+${answer.mine} · raise your hand`);
  });

  it('names the one who has it instead', () => {
    const mine = watcher('Nyx', 10, false);
    const party = rosterOf(mine, watcher('Bram', 18, true));
    const answer = called(PERCEPTION, ctxOf(mine), party.entries[0].id, party)!;
    expect(verdict(answer)).toBe(`+${answer.mine} · Bram has this one`);
  });

  it('signs a negative modifier rather than printing a bare minus', () => {
    const build = watcher('Nyx', 6, false);
    const answer = called(PERCEPTION, ctxOf(build), 'c0', rosterOf(build))!;
    expect(answer.mine).toBeLessThan(0);
    expect(verdict(answer)).toMatch(/^-\d+ · raise your hand$/);
  });
});

/*
  §143. The save half.

  Checks and saves are the same two dice and different questions, and the
  difference shows up here: a check compares this character against the
  party, a save does not compare at all. Everybody rolls one, so telling a
  player "Bram has this one" while the fireball lands on them too would be
  the wrong answer said confidently.
*/
describe('a called save', () => {
  const DEX = { ask: 'save', ability: 'dex', dc: 15 } as const;

  it('adds what the sheet adds to that save', () => {
    const build = watcher('Nyx', 10, false);
    const ctx = ctxOf(build);
    const answer = called(DEX, ctx, 'c0', rosterOf(build))!;
    expect(answer.ask).toBe('save');
    expect(answer.mine).toBe(saveBonusOf(ctx, 'dex'));
    expect(answer.name).toBe('Dexterity');
  });

  it('does not compare against the party, however good somebody else is', () => {
    const mine = watcher('Nyx', 10, false);
    const party = rosterOf(mine, watcher('Bram', 18, true));
    const answer = called(DEX, ctxOf(mine), party.entries[0].id, party)!;
    // Nobody is best at a save everybody is making.
    expect(answer.best).toBeNull();
    expect(answer.raise).toBe(false);
  });

  it('says what to beat rather than whose moment it is', () => {
    const build = watcher('Nyx', 10, false);
    const answer = called(DEX, ctxOf(build), 'c0', rosterOf(build))!;
    expect(verdict(answer)).toBe(`+${answer.mine} · beat 15`);
  });

  it('asks for the roll when no DC was given', () => {
    const build = watcher('Nyx', 10, false);
    const open = { ask: 'save', ability: 'dex' } as const;
    const answer = called(open, ctxOf(build), 'c0', rosterOf(build))!;
    expect(verdict(answer)).toBe(`+${answer.mine} · roll it`);
    expect(answer.dc).toBeUndefined();
  });

  it('is nothing for an ability that does not exist', () => {
    const build = watcher('Nyx', 10, false);
    const bogus = { ask: 'save', ability: 'luck' } as unknown as typeof DEX;
    expect(called(bogus, ctxOf(build), 'c0', rosterOf(build))).toBeNull();
  });
});
