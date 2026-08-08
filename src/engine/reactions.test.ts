import { describe, expect, it } from 'vitest';
import type { Monster } from '../data/monsters';
import fixture from '../data/srd/srd-2014-monsters.json';
import { isMelee, singleStrikes } from './strikes';
import {
  CANNOT_REACT,
  mayReact,
  meleeReach,
  opportunityStrike,
  provokedBy,
  type Reactor,
} from './reactions';

const reactor = (over: Partial<Reactor> = {}): Reactor => ({
  id: 'guard',
  conditions: [],
  at: { x: 5, y: 5 },
  hp: 10,
  reach: 5,
  ...over,
});

describe('who can react at all', () => {
  it('an ordinary living creature with its reaction in hand can', () => {
    expect(mayReact(reactor())).toBe(true);
  });

  it('one that already reacted cannot', () => {
    expect(mayReact(reactor({ reactionSpent: true }))).toBe(false);
  });

  it('a dropped one cannot', () => {
    expect(mayReact(reactor({ hp: 0 }))).toBe(false);
  });

  it.each(CANNOT_REACT)('%s stops it', (condition) => {
    expect(mayReact(reactor({ conditions: [condition] }))).toBe(false);
  });

  it('a condition that is merely unpleasant does not', () => {
    expect(mayReact(reactor({ conditions: ['poisoned', 'frightened'] }))).toBe(true);
  });
});

describe('leaving reach', () => {
  const mover = { id: 'thief', at: { x: 6, y: 5 } };

  it('walking out of a five-foot reach provokes', () => {
    expect(provokedBy(mover, { x: 9, y: 5 }, [reactor()]).map((r) => r.id)).toEqual(['guard']);
  });

  it('walking around inside it does not - the rule is about leaving', () => {
    expect(provokedBy(mover, { x: 5, y: 6 }, [reactor()])).toEqual([]);
  });

  it('walking in from outside does not', () => {
    expect(provokedBy({ id: 'thief', at: { x: 9, y: 5 } }, { x: 6, y: 5 }, [reactor()])).toEqual([]);
  });

  it('an ogre with reach 10 notices what an ordinary guard would not', () => {
    const away = { x: 7, y: 5 };
    expect(provokedBy(mover, away, [reactor({ reach: 5 })]).length).toBe(1);
    expect(provokedBy(mover, away, [reactor({ reach: 10 })]).length).toBe(0);
  });

  it('Disengage turns the whole thing off', () => {
    expect(provokedBy({ ...mover, disengaged: true }, { x: 9, y: 5 }, [reactor()])).toEqual([]);
  });

  it('a creature that cannot see the mover does not swing', () => {
    const away = { x: 9, y: 5 };
    expect(provokedBy(mover, away, [reactor()], () => false)).toEqual([]);
    expect(provokedBy(mover, away, [reactor()], () => true).length).toBe(1);
  });

  it('no sight model at all still applies the rule', () => {
    expect(provokedBy(mover, { x: 9, y: 5 }, [reactor()]).length).toBe(1);
  });

  it('the mover never provokes itself', () => {
    expect(provokedBy(mover, { x: 9, y: 5 }, [reactor({ id: 'thief' })])).toEqual([]);
  });

  it('a reactor with no square on the map is not standing anywhere to swing from', () => {
    expect(provokedBy(mover, { x: 9, y: 5 }, [reactor({ at: undefined })])).toEqual([]);
  });

  it('several people can be left behind at once', () => {
    const ids = provokedBy(mover, { x: 9, y: 5 }, [
      reactor({ id: 'a' }),
      reactor({ id: 'b', at: { x: 6, y: 6 } }),
      reactor({ id: 'c', at: { x: 1, y: 1 } }),
    ]).map((r) => r.id);
    expect(ids).toEqual(['a', 'b']);
  });
});

describe('the swing itself', () => {
  const MONSTERS = fixture.records as unknown as Monster[];
  const goblin = MONSTERS.find((m) => /^goblin$/i.test(m.name))!;

  it('is exactly one attack, never a Multiattack', () => {
    for (const monster of MONSTERS) {
      expect(opportunityStrike(monster).length).toBeLessThanOrEqual(1);
    }
  });

  it('is a melee attack', () => {
    for (const monster of MONSTERS) {
      for (const strike of opportunityStrike(monster)) expect(isMelee(strike)).toBe(true);
    }
  });

  it('picks the goblin scimitar over its shortbow', () => {
    expect(opportunityStrike(goblin)[0]?.label).toMatch(/scimitar/i);
  });

  it('is empty for a monster with no melee attack at all', () => {
    const noMelee = MONSTERS.filter((m) => !singleStrikes(m).some(isMelee));
    for (const monster of noMelee) expect(opportunityStrike(monster)).toEqual([]);
  });

  it('picks the biggest melee attack when there is a choice', () => {
    const dragon = MONSTERS.find((m) => /adult red dragon/i.test(m.name));
    if (!dragon) return;
    expect(opportunityStrike(dragon)[0]?.label).toMatch(/bite/i);
  });

  /*
    An audit rather than a spot check: most of the bestiary should be able to
    swing back, and a data refresh that broke the melee parse would show up
    here as a collapse rather than as a quiet pacifism.
  */
  it('most of the bestiary can take one', () => {
    const armed = MONSTERS.filter((m) => opportunityStrike(m).length).length;
    expect(armed).toBeGreaterThan(MONSTERS.length * 0.7);
  });
});

describe('melee reach', () => {
  it('is five feet when the creature has nothing in melee', () => {
    expect(meleeReach([])).toBe(5);
  });

  it('takes the longest melee reach, ignoring ranged attacks entirely', () => {
    expect(
      meleeReach([
        { label: 'claw', toHit: 5, damage: [], range: { reach: 10 } },
        { label: 'dagger', toHit: 5, damage: [], range: { reach: 5 } },
        { label: 'bow', toHit: 5, damage: [], range: { ranged: { normal: 80, long: 320 } } },
      ]),
    ).toBe(10);
  });
});
