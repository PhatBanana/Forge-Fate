import { describe, expect, it } from 'vitest';
import {
  bestRoutine,
  isMelee,
  maxReach,
  preferredReach,
  rangeOf,
  routineFor,
  singleStrikes,
  strikeOf,
} from './strikes';
import type { Monster, MonsterAbility } from '../data/monsters';
import fixture from '../data/srd/srd-2014-monsters.json';

const ability = (partial: Partial<MonsterAbility> & { name: string }): MonsterAbility => ({
  desc: '',
  ...partial,
});

const monster = (actions: MonsterAbility[]): Monster =>
  ({ id: 'm', name: 'Test', actions }) as unknown as Monster;

describe('reading reach out of the prose', () => {
  it('reads a melee reach', () => {
    expect(rangeOf('Melee Weapon Attack: +4 to hit, reach 5 ft., one target.')).toEqual({
      reach: 5,
    });
    // Bigger creatures reach further, and the sentence is the only place it says so.
    expect(rangeOf('Melee Weapon Attack: +14 to hit, reach 15 ft., one target.')).toEqual({
      reach: 15,
    });
  });

  it('reads a banded range', () => {
    expect(rangeOf('Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target.')).toEqual({
      ranged: { normal: 80, long: 320 },
    });
  });

  it('reads a spell attack that has only one range', () => {
    // "Hurl Flame" and its two cousins - the only three attacks in the SRD
    // that state a range with no long band.
    expect(rangeOf('Ranged Spell Attack: +5 to hit, range 150 ft., one target.')).toEqual({
      ranged: { normal: 150, long: 150 },
    });
  });

  it('keeps both when a weapon can be stabbed or thrown', () => {
    expect(
      rangeOf('Melee or Ranged Weapon Attack: +5 to hit, reach 5 ft. or range 20/60 ft.'),
    ).toEqual({ reach: 5, ranged: { normal: 20, long: 60 } });
  });

  it('says nothing rather than guessing when the prose does not', () => {
    // A homebrew monster from the bestiary workshop has no SRD sentence.
    expect(rangeOf('')).toBeNull();
    expect(rangeOf('It does something unpleasant.')).toBeNull();
  });
});

describe('every attack in the SRD parses', () => {
  /**
   * The point of this one: the parser reads generated prose, so the thing that
   * breaks it is a data refresh rewording the sentence - which would silently
   * make every monster melee-only rather than throwing. A count pinned across
   * all 334 stat blocks fails loudly instead.
   */
  const attacks = (fixture.records as unknown as Monster[]).flatMap((m) =>
    (m.actions ?? []).filter((a) => a.toHit !== undefined && (a.damage ?? []).length > 0),
  );

  it('finds the attacks it expects to find', () => {
    expect(attacks.length).toBe(514);
  });

  it('reads a reach or a range from every single one', () => {
    const silent = attacks.filter((a) => rangeOf(a.desc ?? '') === null);
    expect(silent.map((a) => a.name)).toEqual([]);
  });

  it('leaves no attack unable to reach anything at all', () => {
    for (const a of attacks) {
      const range = rangeOf(a.desc ?? '')!;
      expect(maxReach({ label: a.name, toHit: 0, damage: [], range })).toBeGreaterThan(0);
    }
  });

  it('reports the swarms honestly, and still lets them bite', () => {
    /*
      Nine swarms say "reach 0 ft., one creature in the swarm's space". The
      parser repeats it, because that is what the page says; the reach helpers
      read it as adjacent, because this grid has no way to stand inside a
      swarm and a swarm that can never attack is the worse error.
    */
    const swarms = (fixture.records as unknown as Monster[]).filter((m) =>
      (m.actions ?? []).some((a) => /reach 0\s*ft/i.test(a.desc ?? '')),
    );
    expect(swarms.length).toBe(9);
    expect(swarms.every((m) => m.name.startsWith('Swarm of'))).toBe(true);

    const bites = swarms[0].actions.find((a) => /reach 0/.test(a.desc))!;
    expect(rangeOf(bites.desc)).toEqual({ reach: 0 });
    expect(preferredReach(strikeOf(bites)!)).toBe(5);
  });
});

describe('how far a strike reaches', () => {
  const melee = strikeOf(
    ability({ name: 'Scimitar', desc: 'reach 5 ft.', toHit: 4, damage: [{ dice: '1d6', type: 's' }] }),
  )!;
  const bow = strikeOf(
    ability({
      name: 'Shortbow',
      desc: 'range 80/320 ft.',
      toHit: 4,
      damage: [{ dice: '1d6', type: 'p' }],
    }),
  )!;

  it('separates what it can reach from where it wants to stand', () => {
    expect(maxReach(bow)).toBe(320);
    // Long range is at disadvantage, so a planner standing there would be
    // taking odds it should not accept. 80 is the answer to "where do I go".
    expect(preferredReach(bow)).toBe(80);
    expect(maxReach(melee)).toBe(5);
    expect(preferredReach(melee)).toBe(5);
  });

  it('knows which one wants to close', () => {
    expect(isMelee(melee)).toBe(true);
    expect(isMelee(bow)).toBe(false);
  });

  it('treats a strike with no prose as ordinary melee rather than unlimited', () => {
    const homebrew = strikeOf(
      ability({ name: 'Slam', toHit: 3, damage: [{ dice: '1d8', type: 'b' }] }),
    )!;
    expect(homebrew.range).toBeUndefined();
    expect(maxReach(homebrew)).toBe(5);
    expect(isMelee(homebrew)).toBe(true);
  });
});

describe('what counts as an attack', () => {
  it('takes an ability with a bonus and damage', () => {
    expect(
      strikeOf(ability({ name: 'Bite', toHit: 7, damage: [{ dice: '2d6+4', type: 'piercing' }] })),
    ).toMatchObject({ label: 'Bite', toHit: 7 });
  });

  it('refuses one with no attack roll, or no damage', () => {
    expect(strikeOf(ability({ name: 'Frightful Presence', save: { ability: 'wis', dc: 19, onSuccess: 'none' } }))).toBeNull();
    expect(strikeOf(ability({ name: 'Shove', toHit: 5 }))).toBeNull();
  });
});

describe('the round a monster throws', () => {
  const bite = ability({
    name: 'Bite',
    desc: 'reach 10 ft.',
    toHit: 7,
    damage: [{ dice: '1d10+4', type: 'piercing' }],
  });
  const claw = ability({
    name: 'Claw',
    desc: 'reach 5 ft.',
    toHit: 7,
    damage: [{ dice: '1d6+4', type: 'slashing' }],
  });

  it('expands a Multiattack into the swings it is made of', () => {
    const m = monster([
      ability({ name: 'Multiattack', multiattack: [{ name: 'Bite', count: 1 }, { name: 'Claw', count: 2 }] }),
      bite,
      claw,
    ]);
    expect(routineFor(m).map((s) => s.label)).toEqual(['Bite', 'Claw', 'Claw']);
    // Each swing keeps its own reach: a bite at 10 and claws at 5 is a real
    // difference to a planner deciding where to stand.
    expect(routineFor(m).map(preferredReach)).toEqual([10, 5, 5]);
  });

  it('comes back empty when the Multiattack is prose only', () => {
    // 35 of the 148 describe it in a sentence, which is not something to parse.
    const m = monster([ability({ name: 'Multiattack', desc: 'It makes two attacks.' }), bite]);
    expect(routineFor(m)).toEqual([]);
  });

  it('skips a named part the actions list does not have', () => {
    const m = monster([
      ability({ name: 'Multiattack', multiattack: [{ name: 'Bite', count: 1 }, { name: 'Sting', count: 1 }] }),
      bite,
    ]);
    expect(routineFor(m).map((s) => s.label)).toEqual(['Bite']);
  });

  it('falls back to a single attack when there is no Multiattack', () => {
    const m = monster([bite, claw]);
    expect(routineFor(m)).toEqual([]);
    expect(singleStrikes(m).map((s) => s.label)).toEqual(['Bite', 'Claw']);
    expect(bestRoutine(m).map((s) => s.label)).toEqual(['Bite']);
  });

  it('prefers the Multiattack when there is one', () => {
    const m = monster([
      ability({ name: 'Multiattack', multiattack: [{ name: 'Claw', count: 2 }] }),
      bite,
      claw,
    ]);
    expect(bestRoutine(m).map((s) => s.label)).toEqual(['Claw', 'Claw']);
  });
});
