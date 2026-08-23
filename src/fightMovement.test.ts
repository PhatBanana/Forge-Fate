import { describe, expect, it } from 'vitest';
import { addCharacter, addMonster, emptyEncounter, placeCombatant } from './encounter';
import { generateDungeon } from './engine/dungeon';
import type { Zone } from './zones';
import { updateEncounter, updatePlay } from './storage';
import { deriveBuild } from './engine/character';
import { GRAPPLED } from './engine/grapple';
import {
  movementLeftFor,
  speedOf,
  standUpCostFor,
  walkBudget,
  walkPlanFor,
  walkerOf,
} from './fightMovement';
import { charOf, fixtureMonster, monsterOf, viewOf } from './test/fight';
import { fighter, rosterOf, wizard } from './test/factories';

/**
 * §112. Speed, and the order the rules that reduce it apply in - which
 * is the thing that was spread across five modules and is now asked in
 * one place. Every case here is a rule the app used to get right only
 * because four files happened to agree.
 */

const goblin = () => fixtureMonster('goblin');

const table = () => {
  const roster = rosterOf(fighter(), wizard());
  let enc = addCharacter(emptyEncounter(), 'c0', { initiative: 20 });
  enc = addCharacter(enc, 'c1', { initiative: 10 });
  enc = addMonster(enc, goblin(), { rng: () => 0.5 });
  const [a, b] = enc.combatants.filter((c) => c.kind === 'character');
  enc = placeCombatant(enc, a.id, { x: 1, y: 1 });
  enc = placeCombatant(enc, b.id, { x: 3, y: 1 });
  return updateEncounter(roster, enc);
};



describe('speed, and everything that takes it away', () => {
  it('reads the base from whichever side owns it', () => {
    const v = viewOf(table());
    expect(speedOf(v, charOf(v, 'c0'))).toBe(deriveBuild(fighter()).speed.total);
    expect(speedOf(v, monsterOf(v))).toBe(goblin().speed.walk);
  });

  it('is nought while surprised - no move on your first turn, before any other rule', () => {
    const v = viewOf(table());
    const ambushed = { ...charOf(v, 'c0'), surprised: true };
    expect(speedOf(v, ambushed)).toBe(0);
  });

  it('is nought under any of the six conditions that say so', () => {
    let roster = table();
    const play = roster.entries[0].play;
    for (const condition of ['grappled', 'restrained', 'stunned', 'paralyzed', 'petrified', 'unconscious']) {
      roster = updatePlay(roster, 'c0', { ...play, conditions: [condition] });
      const v = viewOf(roster);
      expect(speedOf(v, charOf(v, 'c0')), condition).toBe(0);
    }
  });

  it('is halved by exhaustion from rung two, and gone at five', () => {
    const full = speedOf(viewOf(table()), charOf(viewOf(table()), 'c0'));
    const at = (level: number) => {
      const roster = table();
      const play = roster.entries[0].play;
      const worn = updatePlay(roster, 'c0', { ...play, exhaustion: level });
      const v = viewOf(worn);
      return speedOf(v, charOf(v, 'c0'));
    };
    expect(at(1)).toBe(full);
    expect(at(2)).toBe(Math.floor(full / 2));
    expect(at(5)).toBe(0);
  });

  it('halves again while hauling somebody your own size', () => {
    let roster = table();
    const me = charOf(viewOf(roster), 'c0');
    const them = charOf(viewOf(roster), 'c1');
    const full = speedOf(viewOf(roster), me);
    // The wizard is held by the fighter: the drag is read off the condition.
    const play = roster.entries[1].play;
    roster = updatePlay(roster, 'c1', {
      ...play,
      conditions: [GRAPPLED],
      conditionSources: { [GRAPPLED]: me.id },
    });
    const v = viewOf(roster);
    expect(speedOf(v, charOf(v, 'c0'))).toBe(Math.floor(full / 2));
    // And the one being hauled has no speed of their own at all.
    expect(speedOf(v, charOf(v, 'c1'))).toBe(0);
    expect(them.id).toBeDefined();
  });
});

describe('what is left of a turn', () => {
  it('charges a monster off the combatant and a character off their sheet', () => {
    const roster = table();
    const v = viewOf(roster);
    const gob = monsterOf(v);
    const full = speedOf(v, gob);
    const halfWalked = { ...gob, moved: 10 } as typeof gob;
    expect(movementLeftFor(v, halfWalked)).toBe(full - 10);
    // Nobody has moved yet, so a character has all of theirs.
    expect(movementLeftFor(v, charOf(v, 'c0'))).toBe(speedOf(v, charOf(v, 'c0')));
  });

  it('offers a Dash as one more speed on top of what is left', () => {
    const v = viewOf(table());
    const me = charOf(v, 'c0');
    const speed = speedOf(v, me);
    expect(walkBudget(v, me)).toEqual({ base: speed, dash: speed * 2 });
    // Nobody selected is nothing to spend.
    expect(walkBudget(v, null)).toEqual({ base: 0, dash: 0 });
  });

  it('prices standing up at half a speed', () => {
    const v = viewOf(table());
    const me = charOf(v, 'c0');
    expect(standUpCostFor(v, me)).toBe(Math.floor(speedOf(v, me) / 2));
  });
});

describe('the body the pathfinder walks', () => {
  it('knows a swimmer from somebody who has to wade', () => {
    const v = viewOf(table());
    // A goblin has neither a climb nor a swim speed on its block.
    const gob = walkerOf(v, monsterOf(v));
    expect(gob.climbFree).toBe(false);
    expect(gob.swimFree).toBe(false);
  });

  it('carries prone through, because standing costs feet', () => {
    let roster = table();
    const play = roster.entries[0].play;
    roster = updatePlay(roster, 'c0', { ...play, conditions: ['prone'] });
    const v = viewOf(roster);
    expect(walkerOf(v, charOf(v, 'c0')).prone).toBe(true);
  });
});

/*
  §121. The walk plan, which used to be four exports the caller ran in a
  fixed order - and which therefore had no direct test, because reaching
  them meant rebuilding the chain here too. The hazard preference below is
  the case that was never covered at all.
*/

const dungeon = generateDungeon('walkplan', { rooms: 0, width: 10, height: 8 });
const sight = { dungeon, terrain: {}, elevation: {} };

/** A wall of fire laid across the row the walker would otherwise cross. */
const fireAt = (x: number, y: number): Zone => ({
  id: 'fire',
  label: 'Wall of fire',
  shape: 'cube',
  at: { x, y },
  feet: 5,
  angle: 0,
  tint: 0,
  effect: { onEnter: true, damage: { dice: '5d8', type: 'fire' } },
});

/** A wall of force in the same square: nothing walks through it. */
const forceAt = (x: number, y: number): Zone => ({
  id: 'force',
  label: 'Wall of force',
  shape: 'cube',
  at: { x, y },
  feet: 5,
  angle: 0,
  tint: 1,
  effect: { blocks: true },
});

describe('the walk plan', () => {
  it('carries the budget, the walk and the safe walk together', () => {
    const v = viewOf(table());
    const me = charOf(v, 'c0');
    const plan = walkPlanFor(v, sight, me, []);
    expect(plan.budget).toEqual(walkBudget(v, me));
    expect(plan.walk).not.toBeNull();
    // With no hazards standing, the sane route and the short one are one map.
    expect(plan.safe).toBe(plan.walk);
  });

  it('is empty for nobody selected', () => {
    const plan = walkPlanFor(viewOf(table()), sight, null, []);
    expect(plan.budget).toEqual({ base: 0, dash: 0 });
    expect(plan.walk).toBeNull();
    expect(plan.routeTo('0,0')).toBeNull();
  });

  it('prices a square by the route the feet would actually take', () => {
    const v = viewOf(table());
    const me = charOf(v, 'c0');
    const plan = walkPlanFor(v, sight, me, []);
    // The walker stands at 1,1; a square two east is two ordinary steps.
    const priced = plan.routeTo('3,1');
    expect(priced).not.toBeNull();
    expect(priced?.cost).toBe(plan.walk?.cost.get('3,1'));
  });

  it('goes around a hazard when the budget stretches, and through it when it does not', () => {
    const v = viewOf(table());
    const me = charOf(v, 'c0');
    const plan = walkPlanFor(v, sight, me, [fireAt(2, 1)]);
    expect(plan.safe).not.toBe(plan.walk);

    const target = '3,1';
    const around = plan.safe?.cost.get(target);
    const through = plan.walk?.cost.get(target);
    expect(through).toBeDefined();
    // Stepping round the fire is never cheaper than walking straight through.
    expect(around).toBeGreaterThanOrEqual(through!);

    const priced = plan.routeTo(target);
    expect(priced).not.toBeNull();
    // A full-speed character can afford the detour, so the detour is the
    // price and the safe map is what answered. Asserted flat rather than
    // behind an `if`: a conditional here would pass by never firing.
    expect(around).toBeDefined();
    expect(around!).toBeLessThanOrEqual(plan.budget.dash);
    expect(priced?.cost).toBe(around);
    expect(priced?.via).toBe(plan.safe);
  });

  it('will not route through a wall of force at any price', () => {
    const v = viewOf(table());
    const me = charOf(v, 'c0');
    // Boxed in: force on all four sides of the square at 1,1.
    const walls = [forceAt(0, 1), forceAt(2, 1), forceAt(1, 0), forceAt(1, 2)];
    const plan = walkPlanFor(v, sight, me, walls);
    expect(plan.routeTo('3,1')).toBeNull();
  });

  it('gives nobody on the board no walk', () => {
    const v = viewOf(table());
    const gob = monsterOf(v);
    // The goblin was added but never placed, so it has no square to walk from.
    expect(gob.at).toBeUndefined();
    expect(walkPlanFor(v, sight, gob, []).walk).toBeNull();
  });
});
