import { describe, expect, it } from 'vitest';
import fixture from './data/srd/srd-2014-monsters.json';
import type { Monster } from './data/monsters';
import { addCharacter, addMonster, emptyEncounter, placeCombatant } from './encounter';
import { activeEncounter, updateEncounter, updatePlay } from './storage';
import { deriveBuild } from './engine/character';
import { GRAPPLED } from './engine/grapple';
import {
  movementLeftFor,
  speedOf,
  standUpCostFor,
  walkBudget,
  walkerOf,
  zoneOverlays,
} from './fightMovement';
import type { FightView } from './fightFacts';
import { fighter, rosterOf, wizard } from './test/factories';

/**
 * §112. Speed, and the order the rules that reduce it apply in - which
 * is the thing that was spread across five modules and is now asked in
 * one place. Every case here is a rule the app used to get right only
 * because four files happened to agree.
 */

const monsters = (fixture as unknown as { records: Monster[] }).records;
const byId = new Map(monsters.map((m) => [m.id, m]));
const goblin = () => byId.get('goblin')!;

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

const viewOf = (roster: ReturnType<typeof table>): FightView => ({
  encounter: activeEncounter(roster),
  roster,
  monsterById: (id) => byId.get(id),
  buildOf: (rosterId) => {
    const entry = roster.entries.find((e) => e.id === rosterId);
    return entry ? deriveBuild(entry.build) : undefined;
  },
  ruleset: '2014',
});

const charOf = (v: FightView, rosterId: string) =>
  v.encounter.combatants.find((c) => c.kind === 'character' && c.rosterId === rosterId)!;
const monsterOf = (v: FightView) => v.encounter.combatants.find((c) => c.kind === 'monster')!;

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

describe('what the standing zones do to the ground', () => {
  it('separates a wall from deep going from a place to avoid', () => {
    const overlays = zoneOverlays([]);
    expect(overlays.blocked.size).toBe(0);
    expect(overlays.difficult.size).toBe(0);
    expect(overlays.hazard.size).toBe(0);
    expect(overlays.difficultFor('party').size).toBe(0);
  });
});
