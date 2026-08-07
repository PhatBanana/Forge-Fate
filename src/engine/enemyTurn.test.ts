import { describe, expect, it } from 'vitest';
import { expectedDamage, feetBetween, planTurn } from './enemyTurn';
import type { Actor, TurnInput } from './enemyTurn';
import type { Strike } from './strikes';

/**
 * The planner, against battlefields small enough to draw on paper.
 *
 * Every test here states where everyone stands and what the ground costs,
 * which is the whole input - no roster, no encounter, no React. That is the
 * point of keeping it pure: a tactical decision is exactly the kind of thing
 * that is unreadable when it can only be checked through a rendered tray.
 */

const scimitar: Strike = {
  label: 'Scimitar',
  toHit: 4,
  damage: [{ dice: '1d6+2', type: 'slashing' }],
  range: { reach: 5 },
};
const shortbow: Strike = {
  label: 'Shortbow',
  toHit: 4,
  damage: [{ dice: '1d6+2', type: 'piercing' }],
  range: { ranged: { normal: 80, long: 320 } },
};

const goblin = (at: { x: number; y: number }): Actor => ({
  id: 'gob',
  name: 'Goblin A',
  side: 'foe',
  at,
  hp: 7,
  ac: 15,
});

const hero = (
  id: string,
  name: string,
  at: { x: number; y: number },
  extra: Partial<Actor> = {},
): Actor => ({ id, name, side: 'party', at, hp: 30, ac: 15, ...extra });

/**
 * Open ground: every square within `feet` costs five per step, Chebyshev.
 * Enough for the decisions under test, and the real caller hands in its own
 * Dijkstra with the walls and the fire already in it.
 */
const openGround = (self: Actor, feet: number) => {
  const from = self.at!;
  const candidates: { x: number; y: number }[] = [];
  const span = Math.ceil(feet / 5);
  for (let x = from.x - span; x <= from.x + span; x++) {
    for (let y = from.y - span; y <= from.y + span; y++) {
      if (x < 0 || y < 0) continue;
      candidates.push({ x, y });
    }
  }
  return {
    candidates,
    priceOf: (at: { x: number; y: number }) => feetBetween(from, at),
  };
};

const setup = (
  self: Actor,
  actors: Actor[],
  options: Strike[][],
  budget = { base: 30, dash: 60 },
): TurnInput => ({ self, actors, options, budget, ...openGround(self, budget.dash) });

describe('measuring the field', () => {
  it('counts a diagonal as one step, like every other distance here', () => {
    expect(feetBetween({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(5);
    expect(feetBetween({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(15);
    expect(feetBetween({ x: 2, y: 2 }, { x: 2, y: 2 })).toBe(0);
  });

  it('weighs a round by odds and averages, not by dice rolled', () => {
    // +4 against AC 15 hits on an 11: 50%. 1d6+2 averages 5.5.
    expect(expectedDamage([scimitar], 15)).toBeCloseTo(2.75, 5);
    // Two swings is twice the expectation, which is what makes a Multiattack
    // beat a single attack when both can reach.
    expect(expectedDamage([scimitar, scimitar], 15)).toBeCloseTo(5.5, 5);
  });

  it('is the same answer every time it is asked', () => {
    const input = () => setup(goblin({ x: 5, y: 5 }), [hero('a', 'Thorin', { x: 8, y: 5 })], [[scimitar]]);
    expect(planTurn(input())).toEqual(planTurn(input()));
  });
});

describe('attacking without moving', () => {
  it('stands still when the target is already in reach', () => {
    const plan = planTurn(
      setup(goblin({ x: 5, y: 5 }), [hero('a', 'Thorin', { x: 6, y: 5 })], [[scimitar]]),
    );
    expect(plan.move).toBeUndefined();
    expect(plan.targetId).toBe('a');
    expect(plan.strikes).toEqual([scimitar]);
    expect(plan.reason).toBe('Thorin is already in reach — Scimitar.');
  });

  it('shoots from where it stands rather than walking into melee', () => {
    // 40 feet away: out of a scimitar's reach, well inside a shortbow's 80.
    // A planner handed only the first action would have marched it in.
    const plan = planTurn(
      setup(goblin({ x: 5, y: 5 }), [hero('a', 'Thorin', { x: 13, y: 5 })], [[scimitar], [shortbow]]),
    );
    expect(plan.move).toBeUndefined();
    expect(plan.strikes.map((s) => s.label)).toEqual(['Shortbow']);
  });
});

describe('choosing who to hit', () => {
  it('takes the one it can drop this turn over the one it would hurt more', () => {
    const routine = [scimitar, scimitar, scimitar];
    // Expected against AC 15 is 8.25 over three swings: enough for the
    // 5 hp wizard, not for the 30 hp fighter, who is otherwise identical.
    const plan = planTurn(
      setup(
        goblin({ x: 5, y: 5 }),
        [hero('fighter', 'Thorin', { x: 6, y: 5 }), hero('wizard', 'Vex', { x: 4, y: 5 }, { hp: 5 })],
        [routine],
      ),
    );
    expect(plan.targetId).toBe('wizard');
    expect(plan.reason).toBe('Vex is within one round of dropping — 3 attacks.');
  });

  it('takes the softer target when it cannot drop either', () => {
    const plan = planTurn(
      setup(
        goblin({ x: 5, y: 5 }),
        [
          hero('plate', 'Thorin', { x: 6, y: 5 }, { ac: 20 }),
          hero('robes', 'Vex', { x: 4, y: 5 }, { ac: 12 }),
        ],
        [[scimitar]],
      ),
    );
    // Neither is droppable, so the tie-break is expected damage, and a lower
    // AC is more expected damage.
    expect(plan.targetId).toBe('robes');
  });

  it('never plans an attack on its own side', () => {
    const plan = planTurn(
      setup(
        goblin({ x: 5, y: 5 }),
        [
          { id: 'gob2', name: 'Goblin B', side: 'foe', at: { x: 6, y: 5 }, hp: 2, ac: 15 },
          hero('a', 'Thorin', { x: 20, y: 20 }),
        ],
        [[scimitar]],
      ),
    );
    expect(plan.targetId).not.toBe('gob2');
  });

  it('ignores the dropped and the sleeping', () => {
    const plan = planTurn(
      setup(
        goblin({ x: 5, y: 5 }),
        [
          hero('down', 'Thorin', { x: 6, y: 5 }, { hp: 0 }),
          hero('dormant', 'Vex', { x: 4, y: 5 }, { out: true }),
        ],
        [[scimitar]],
      ),
    );
    // Neither is a target, and neither counts as somebody to walk at.
    expect(plan.targetId).toBeUndefined();
    expect(plan.reason).toBe('Goblin A has nothing left to fight.');
  });
});

describe('moving in order to attack', () => {
  it('walks the shortest distance that puts the target in reach', () => {
    // 20 feet off. It needs to be adjacent, so it walks 15 and no further.
    const plan = planTurn(
      setup(goblin({ x: 5, y: 5 }), [hero('a', 'Thorin', { x: 9, y: 5 })], [[scimitar]]),
    );
    expect(plan.move).toMatchObject({ cost: 15, dash: false });
    expect(feetBetween(plan.move!.to, { x: 9, y: 5 })).toBe(5);
    expect(plan.targetId).toBe('a');
    expect(plan.reason).toBe('Closes 15 ft on Thorin and attacks — Scimitar.');
  });

  it('will not Dash into an attack, because the Dash is the action', () => {
    // 45 feet: reachable only by Dashing, which would leave nothing to
    // attack with. So the plan is the walk, and no swing.
    const plan = planTurn(
      setup(goblin({ x: 5, y: 5 }), [hero('a', 'Thorin', { x: 14, y: 5 })], [[scimitar]]),
    );
    expect(plan.strikes).toEqual([]);
    expect(plan.targetId).toBeUndefined();
    expect(plan.move).toMatchObject({ dash: true });
    expect(plan.reason).toMatch(/^Nothing in reach — Dashes \d+ ft toward Thorin\.$/);
  });

  it('prefers the round that reaches over the bigger round that does not', () => {
    const pike: Strike = {
      label: 'Pike',
      toHit: 6,
      damage: [{ dice: '2d10+4', type: 'piercing' }],
      range: { reach: 10 },
    };
    // Standing 10 ft away with 0 movement left: only the pike can be used,
    // even though it is the single swing and the other option is two.
    const plan = planTurn(
      setup(
        goblin({ x: 5, y: 5 }),
        [hero('a', 'Thorin', { x: 7, y: 5 })],
        [[scimitar, scimitar], [pike]],
        { base: 0, dash: 0 },
      ),
    );
    expect(plan.strikes.map((s) => s.label)).toEqual(['Pike']);
  });
});

describe('when there is nothing to be done', () => {
  it('closes on the nearest enemy when none can be reached', () => {
    const plan = planTurn(
      setup(
        goblin({ x: 5, y: 5 }),
        [hero('far', 'Thorin', { x: 40, y: 5 }), hero('nearer', 'Vex', { x: 25, y: 5 })],
        [[scimitar]],
      ),
    );
    expect(plan.strikes).toEqual([]);
    expect(plan.reason).toContain('toward Vex');
    // It spent everything it had getting there - a monster that cannot reach
    // anybody should be running.
    expect(plan.move!.cost).toBe(60);
    expect(plan.move!.dash).toBe(true);
  });

  it('holds when it can neither reach anyone nor get closer', () => {
    const plan = planTurn(
      setup(goblin({ x: 5, y: 5 }), [hero('a', 'Thorin', { x: 40, y: 5 })], [[scimitar]], {
        base: 0,
        dash: 0,
      }),
    );
    expect(plan.move).toBeUndefined();
    expect(plan.strikes).toEqual([]);
    expect(plan.reason).toBe('Goblin A can reach nobody and get no closer — holds.');
  });

  it('says so rather than guessing when it is not on the map', () => {
    const off: Actor = { id: 'gob', name: 'Goblin A', side: 'foe', hp: 7, ac: 15 };
    expect(
      planTurn({
        self: off,
        actors: [hero('a', 'Thorin', { x: 1, y: 1 })],
        options: [[scimitar]],
        budget: { base: 30, dash: 60 },
        priceOf: () => null,
        candidates: [],
      }),
    ).toEqual({ strikes: [], reason: 'Goblin A is not on the map.' });
  });

  it('holds when it has no attacks at all', () => {
    const plan = planTurn(setup(goblin({ x: 5, y: 5 }), [hero('a', 'Thorin', { x: 6, y: 5 })], []));
    expect(plan.strikes).toEqual([]);
    // Already adjacent, and the only square closer is the one Thorin is
    // standing in, so there is nowhere to go.
    expect(plan.reason).toBe('Goblin A can reach nobody and get no closer — holds.');
  });
});

describe('the crowd on the field', () => {
  /**
   * The walk the caller hands in prices occupied squares like any other - it
   * maps the ground, not the crowd. Left to itself the planner would cheerfully
   * plan to stand on top of the fighter, and the plan would then be refused by
   * the very move code meant to run it.
   */
  it('never plans to stand where somebody already is', () => {
    const plan = planTurn(
      setup(
        goblin({ x: 5, y: 5 }),
        [hero('a', 'Thorin', { x: 9, y: 5 }), hero('b', 'Vex', { x: 8, y: 5 })],
        [[scimitar]],
      ),
    );
    expect(plan.move).toBeDefined();
    expect(plan.move!.to).not.toEqual({ x: 8, y: 5 });
    expect(plan.move!.to).not.toEqual({ x: 9, y: 5 });
  });

  it('counts the fallen too, because the move code does', () => {
    // A body in the doorway is still refused by `moveSelected`, so a plan
    // that walked onto it could never be run.
    const plan = planTurn(
      setup(
        goblin({ x: 5, y: 5 }),
        [
          hero('down', 'Thorin', { x: 6, y: 5 }, { hp: 0 }),
          hero('up', 'Vex', { x: 7, y: 5 }),
        ],
        [[scimitar]],
      ),
    );
    expect(plan.targetId).toBe('up');
    expect(plan.move?.to).not.toEqual({ x: 6, y: 5 });
  });
});

describe('the ground the caller priced', () => {
  it('never routes anywhere the caller refused', () => {
    /*
      The wall of fire case, in miniature. The caller's own Dijkstra has
      already decided that the direct line costs more than going around; the
      planner must take that price rather than measuring the crow's distance,
      or a monster would happily plan a walk straight through the fire.
    */
    const self = goblin({ x: 5, y: 5 });
    const plan = planTurn({
      self,
      actors: [hero('a', 'Thorin', { x: 9, y: 5 })],
      options: [[scimitar]],
      budget: { base: 30, dash: 60 },
      // The row at y=5 is on fire: priced beyond anything, so unreachable.
      // Everything else is ordinary ground.
      priceOf: (at) => (at.y === 5 && at.x > 5 ? null : feetBetween(self.at!, at)),
      candidates: [
        { x: 6, y: 5 },
        { x: 7, y: 5 },
        { x: 8, y: 5 },
        { x: 8, y: 4 },
        { x: 8, y: 6 },
      ],
    });
    // It got adjacent, but around rather than through.
    expect(plan.targetId).toBe('a');
    expect(plan.move!.to.y).not.toBe(5);
  });

  it('cannot stand somewhere the walk never offered', () => {
    const self = goblin({ x: 5, y: 5 });
    const plan = planTurn({
      self,
      actors: [hero('a', 'Thorin', { x: 9, y: 5 })],
      options: [[scimitar]],
      budget: { base: 30, dash: 60 },
      priceOf: () => 5,
      // A walled-in goblin: the walk reaches nowhere at all.
      candidates: [],
    });
    expect(plan.move).toBeUndefined();
    expect(plan.strikes).toEqual([]);
  });
});
