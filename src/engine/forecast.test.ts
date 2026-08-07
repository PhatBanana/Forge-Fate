import { describe, expect, it } from 'vitest';
import fixture from '../data/srd/srd-2014-monsters.json';
import type { Monster } from '../data/monsters';
import {
  forecast,
  monsterDamagePerRound,
  uncountedAbilities,
  verdictFor,
} from './forecast';
import { hitChance } from './dpr';

/**
 * Rating a fight from this app's own damage model.
 *
 * The arithmetic is checked against numbers worked by hand rather than pinned
 * to whatever the code first produced, because a snapshot of a wrong answer is
 * a wrong answer with a test defending it.
 */

const monsters = (fixture as unknown as { records: Monster[] }).records;
const find = (id: string) => monsters.find((m) => m.id === id)!;

/** A party member the forecast can read, without building a whole character. */
const pc = (name: string, dpr: number, ac: number, hp: number) => ({
  name,
  dprAt: () => dpr,
  ac,
  hp,
});

describe('what one monster does in a round', () => {
  it('reads a single attack', () => {
    /*
      A goblin's scimitar is +4 for 1d6+2 against AC 15, so it needs an 11:
      hit 0.5, crit 0.05. Expected = 0.5 * (3.5 + 2) + 0.05 * 3.5 = 2.925.
      A crit doubles the dice and not the bonus, which is the rule `dpr.ts`
      already models and the reason this is not simply hit x average.
    */
    expect(hitChance(4, 15)).toBeCloseTo(0.5, 5);
    expect(monsterDamagePerRound(find('goblin'), 15)).toBeCloseTo(2.925, 3);
  });

  it('takes the best attack when there is no Multiattack', () => {
    // A goblin has a scimitar and a shortbow with identical numbers, and does
    // not get both: one attack, not the sum of the list.
    const goblin = find('goblin');
    expect(goblin.actions.filter((a) => a.toHit !== undefined)).toHaveLength(2);
    expect(monsterDamagePerRound(goblin, 15)).toBeLessThan(3);
  });

  it('reads a whole Multiattack, not the first line of it', () => {
    /*
      The reason the multiattack structure is carried at all. An adult red
      dragon makes one bite and two claws; reading only its first attack would
      rate it at about a third of what it does.
    */
    const dragon = find('adult-red-dragon');
    const round = monsterDamagePerRound(dragon, 16);
    const bite = dragon.actions.find((a) => a.name === 'Bite')!;
    const claw = dragon.actions.find((a) => a.name === 'Claw')!;
    expect(bite.damage).toHaveLength(2); // piercing and fire, on one hit
    expect(round).toBeGreaterThan(50);
    // Bite + 2 claws, and nothing else - the breath weapon is on a recharge.
    const single = monsterDamagePerRound({ ...dragon, actions: [claw] }, 16);
    expect(round).toBeCloseTo(
      monsterDamagePerRound({ ...dragon, actions: [bite] }, 16) + single * 2,
      1,
    );
  });

  it('sums the damage types on one attack, because they land together', () => {
    // The dragon's bite is 2d10+8 piercing *and* 2d6 fire on the same hit.
    const dragon = find('adult-red-dragon');
    const bite = dragon.actions.find((a) => a.name === 'Bite')!;
    const piercingOnly = { ...bite, damage: [bite.damage![0]] };
    expect(monsterDamagePerRound({ ...dragon, actions: [bite] }, 16)).toBeGreaterThan(
      monsterDamagePerRound({ ...dragon, actions: [piercingOnly] }, 16),
    );
  });

  it('counts nothing for a monster with no attack it can make', () => {
    const dragon = find('adult-red-dragon');
    const presence = dragon.actions.find((a) => a.name === 'Frightful Presence')!;
    expect(monsterDamagePerRound({ ...dragon, actions: [presence] }, 16)).toBe(0);
  });

  it('hits harder against worse armor', () => {
    expect(monsterDamagePerRound(find('wolf'), 12)).toBeGreaterThan(
      monsterDamagePerRound(find('wolf'), 20),
    );
  });
});

describe('what is deliberately left out', () => {
  it('names a recharge ability rather than counting it or hiding it', () => {
    /*
      A dragon's breath weapon counted every round overstates the fight as
      badly as ignoring it understates it - it is a die rolled each turn. The
      middle is to leave it out of the arithmetic and say so by name, which is
      a thing a DM can weigh by eye.
    */
    expect(uncountedAbilities(find('adult-red-dragon'))).toContain('Fire Breath');
    expect(monsterDamagePerRound(find('adult-red-dragon'), 16)).toBeLessThan(120);
  });

  it('leaves an ordinary attacker with nothing to disclaim', () => {
    expect(uncountedAbilities(find('wolf'))).toEqual([]);
  });
});

describe('the fight as a whole', () => {
  const party = [pc('Grog', 20, 18, 50), pc('Lyra', 16, 14, 30)];

  it('needs both sides', () => {
    expect(forecast({ party: [], monsters: [{ monster: find('goblin'), hp: 7 }] })).toBeNull();
    expect(forecast({ party, monsters: [] })).toBeNull();
  });

  it('averages the armor on each side and totals the hit points', () => {
    const result = forecast({
      party,
      monsters: [
        { monster: find('goblin'), hp: 7 },
        { monster: find('wolf'), hp: 11 },
      ],
    })!;
    expect(result.partyAc).toBe(16); // (18 + 14) / 2
    expect(result.monsterAc).toBe(14); // (15 + 13) / 2
    expect(result.partyHp).toBe(80);
    expect(result.monsterHp).toBe(18);
  });

  it('counts rounds from hit points and output, rounding up', () => {
    // 18 monster hit points against 36 party damage is one round, not half of
    // one - you cannot stop a fight partway through a round.
    const result = forecast({ party, monsters: [{ monster: find('goblin'), hp: 7 }] })!;
    expect(result.roundsToClear).toBe(1);
    expect(result.roundsToDrop).toBeGreaterThan(10);
  });

  it('takes the XP straight from the stat blocks', () => {
    // The one figure here that is not a model. The thresholds it would be
    // compared against are DMG content and are deliberately not reproduced.
    const result = forecast({
      party,
      monsters: [
        { monster: find('goblin'), hp: 7 },
        { monster: find('goblin'), hp: 7 },
      ],
    })!;
    expect(result.xp).toBe(100);
  });

  it('uses the hit points a monster has left, not the ones it started with', () => {
    const full = forecast({ party, monsters: [{ monster: find('adult-red-dragon'), hp: 256 }] })!;
    const hurt = forecast({ party, monsters: [{ monster: find('adult-red-dragon'), hp: 30 }] })!;
    expect(hurt.roundsToClear!).toBeLessThan(full.roundsToClear!);
  });

  it('says what it did not count', () => {
    const result = forecast({ party, monsters: [{ monster: find('adult-red-dragon'), hp: 256 }] })!;
    expect(result.notes.join(' ')).toMatch(/Fire Breath/);
    expect(result.notes.join(' ')).toMatch(/Legendary actions/);
  });

  it('warns where a Multiattack could only be read as prose', () => {
    // 35 of the 148 state it in prose alone, so those monsters are counted at
    // one attack - understated, and said so rather than quietly wrong.
    const proseOnly = monsters.find(
      (m) =>
        m.actions.some((a) => a.name.startsWith('Multiattack')) &&
        !m.actions.some((a) => a.multiattack?.length),
    )!;
    const result = forecast({ party, monsters: [{ monster: proseOnly, hp: proseOnly.hp }] })!;
    expect(result.notes.join(' ')).toMatch(/only in prose/);
  });
});

describe('the one-line read', () => {
  it('scales on the ratio rather than on either number alone', () => {
    // Three rounds to win is a walkover against a party who can last twelve
    // and a coin toss against one who can last four.
    expect(verdictFor(3, 20)).toMatch(/walkover/i);
    expect(verdictFor(3, 9)).toMatch(/comfortable/i);
    expect(verdictFor(3, 6)).toMatch(/real fight/i);
    expect(verdictFor(3, 4)).toMatch(/dangerous/i);
    expect(verdictFor(6, 3)).toMatch(/loses this/i);
  });

  it('says so when a side deals nothing at all', () => {
    expect(verdictFor(null, 5)).toMatch(/no damage/i);
    expect(verdictFor(4, null)).toMatch(/taking nothing back/i);
  });

  it('does not grade a fight with a word from a table it cannot carry', () => {
    // "Deadly", "hard", "medium" are the DMG's XP-threshold vocabulary, and
    // borrowing it would imply arithmetic this app deliberately does not do.
    const said = [verdictFor(3, 20), verdictFor(3, 9), verdictFor(3, 6), verdictFor(3, 4)]
      .join(' ')
      .toLowerCase();
    expect(said).not.toMatch(/\bdeadly\b|\bmedium\b|\bhard\b/);
  });

  it('gets the plural right for a one-round fight', () => {
    expect(verdictFor(1, 20)).toContain('1 round,');
  });
});
