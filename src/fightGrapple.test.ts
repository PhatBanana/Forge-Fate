import { describe, expect, it } from 'vitest';
import fixture from './data/srd/srd-2014-monsters.json';
import type { Monster } from './data/monsters';
import { addCharacter, addMonster, emptyEncounter, placeCombatant } from './encounter';
import { activeEncounter, updateEncounter, updatePlay } from './storage';
import { deriveBuild } from './engine/character';
import { generateDungeon } from './engine/dungeon';
import { GRAPPLED } from './engine/grapple';
import {
  escapeGrapple,
  knockProne,
  letGo,
  releaseGrapple,
  resolveGrab,
  rollHide,
  setHeld,
  standUpFrom,
} from './fightGrapple';
import { conditionsOf, grapplerOf, heldBy, sourcesOf } from './fightFacts';
import type { FightView } from './fightFacts';
import { movementLeftFor } from './fightMovement';
import { fighter, rosterOf, wizard } from './test/factories';

/**
 * §114. Hands on somebody: the contest, what it costs, and the chain a
 * shove off a ledge sets off - all of it callable, none of it needing a
 * battle screen.
 */

const monsters = (fixture as unknown as { records: Monster[] }).records;
const byId = new Map(monsters.map((m) => [m.id, m]));
const dungeon = generateDungeon('x', { rooms: 0, width: 10, height: 8 });
const sight = { dungeon, terrain: {}, elevation: {} };

/** Every die reads high - the shover wins every contest. */
const shoverWins = () => 0.999999;
/** The shover rolls a 1 and the defender everything after: one rng, in
    call order, because a flat low roll is not a loss when the shover has
    the better Athletics to begin with. */
const shoverLoses = () => {
  let first = true;
  return () => {
    if (first) {
      first = false;
      return 0;
    }
    return 0.999999;
  };
};

const table = (elevation: Record<string, number> = {}) => {
  const roster = rosterOf(fighter(), wizard());
  let enc = addCharacter(emptyEncounter(), 'c0', { initiative: 20 });
  enc = addCharacter(enc, 'c1', { initiative: 10 });
  enc = addMonster(enc, byId.get('goblin')!, { rng: () => 0.5 });
  const [a, b] = enc.combatants.filter((c) => c.kind === 'character');
  // Side by side, so every reach check passes unless a test moves them.
  enc = placeCombatant(enc, a.id, { x: 3, y: 3 });
  enc = placeCombatant(enc, b.id, { x: 4, y: 3 });
  if (Object.keys(elevation).length) enc = { ...enc, elevation };
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
const atOf = (roster: ReturnType<typeof table>, id: string) =>
  activeEncounter(roster).combatants.find((c) => c.id === id)?.at;

describe('the three refusals, which are mis-clicks rather than attempts', () => {
  it('refuses out of reach, and spends nothing', () => {
    let roster = table();
    const v0 = viewOf(roster);
    // Move the wizard well away.
    roster = updateEncounter(roster, placeCombatant(activeEncounter(roster), charOf(v0, 'c1').id, { x: 8, y: 7 }));
    const v = viewOf(roster);

    const out = resolveGrab(v, roster, charOf(v, 'c0').id, charOf(v, 'c1').id, 'grapple', sight, shoverWins);
    expect(activeEncounter(out.roster).log?.[0]?.text).toMatch(/not close enough/);
    // The action pip is untouched: nothing was tried.
    expect(out.roster.entries[0].play.turn.action).toBeFalsy();
    expect(out.events).toEqual([]);
  });

  it('refuses a second hold - two hands, one creature', () => {
    let roster = table();
    const v0 = viewOf(roster);
    const me = charOf(v0, 'c0');
    // The fighter already has hold of the wizard.
    roster = setHeld(roster, charOf(v0, 'c1').id, me.id);
    const v = viewOf(roster);
    const gob = v.encounter.combatants.find((c) => c.kind === 'monster')!;
    const beside = updateEncounter(roster, placeCombatant(activeEncounter(roster), gob.id, { x: 3, y: 4 }));

    const out = resolveGrab(viewOf(beside), beside, me.id, gob.id, 'grapple', sight, shoverWins);
    expect(activeEncounter(out.roster).log?.[0]?.text).toMatch(/already has hold of.*let go first/);
  });
});

describe('the contest, and what it costs', () => {
  it('spends the action even when the attempt fails - trying is what costs', () => {
    const roster = table();
    const v = viewOf(roster);
    const out = resolveGrab(v, roster, charOf(v, 'c0').id, charOf(v, 'c1').id, 'grapple', sight, shoverLoses());
    expect(activeEncounter(out.roster).log?.[0]?.text).toMatch(/twist away|holds firm/);
    expect(out.roster.entries[0].play.turn.action).toBe(true);
  });

  it('a won grapple writes the condition AND who caused it', () => {
    const roster = table();
    const v = viewOf(roster);
    const me = charOf(v, 'c0');
    const out = resolveGrab(v, roster, me.id, charOf(v, 'c1').id, 'grapple', sight, shoverWins);

    const after = viewOf(out.roster);
    const held = charOf(after, 'c1');
    expect(conditionsOf(after, held)).toContain(GRAPPLED);
    // A grappled with nobody named on it is a condition nothing can end.
    expect(sourcesOf(after, held)[GRAPPLED]).toBe(me.id);
    expect(grapplerOf(after, held)?.id).toBe(me.id);
    expect(heldBy(after, charOf(after, 'c0'))?.id).toBe(held.id);
  });

  it('a won trip puts them down, and does not stand an already-prone target up', () => {
    const roster = table();
    const v = viewOf(roster);
    const out = resolveGrab(v, roster, charOf(v, 'c0').id, charOf(v, 'c1').id, 'prone', sight, shoverWins);
    const after = viewOf(out.roster);
    expect(conditionsOf(after, charOf(after, 'c1'))).toContain('prone');

    // Prone added rather than toggled.
    const again = knockProne(out.roster, charOf(after, 'c1').id);
    expect(conditionsOf(viewOf(again), charOf(viewOf(again), 'c1'))).toContain('prone');
  });
});

describe('a shove, and the chain a ledge sets off', () => {
  it('pushes five feet directly away and says the body slid', () => {
    const roster = table();
    const v = viewOf(roster);
    const me = charOf(v, 'c0');
    const them = charOf(v, 'c1');

    const out = resolveGrab(v, roster, me.id, them.id, 'push', sight, shoverWins);
    // From (3,3) shoving (4,3): pushed to (5,3).
    expect(atOf(out.roster, them.id)).toEqual({ x: 5, y: 3 });
    // §69: forced movement glides flat rather than taking walking hops.
    expect(out.events).toEqual([
      { kind: 'walk', id: them.id, route: [{ x: 4, y: 3 }, { x: 5, y: 3 }], slide: true },
    ]);
  });

  it('a shove into a wall goes nowhere, and still costs the action', () => {
    const roster = table();
    const v = viewOf(roster);
    const me = charOf(v, 'c0');
    const them = charOf(v, 'c1');
    // Nothing is walkable: every landing square is refused.
    const walled = { dungeon: generateDungeon('y', { rooms: 0, width: 1, height: 1 }), terrain: {}, elevation: {} };

    const out = resolveGrab(v, roster, me.id, them.id, 'push', walled, shoverWins);
    expect(activeEncounter(out.roster).log?.[0]?.text).toMatch(/nowhere to go, they stay put/);
    expect(atOf(out.roster, them.id)).toEqual({ x: 4, y: 3 });
    expect(out.roster.entries[0].play.turn.action).toBe(true);
  });

  it('off a ledge: they land, they take the fall, and they land prone', () => {
    // The square they are shoved into is two steps lower.
    const roster = table({ '4,3': 2 });
    const v = viewOf(roster);
    const me = charOf(v, 'c0');
    const them = charOf(v, 'c1');
    const before = roster.entries[1].play.currentHp;

    const out = resolveGrab(v, roster, me.id, them.id, 'push', sight, shoverWins);
    const after = viewOf(out.roster);
    expect(atOf(out.roster, them.id)).toEqual({ x: 5, y: 3 });
    // The part everyone forgets, which is exactly what a tool should remember.
    expect(conditionsOf(after, charOf(after, 'c1'))).toContain('prone');
    // And the drop bit: the log names the feet, the hit points went down.
    expect((activeEncounter(out.roster).log ?? []).some((l) => /ft drop/.test(l.text))).toBe(true);
    expect(out.roster.entries[1].play.currentHp).not.toBe(before);
  });
});

describe('getting free, and getting up', () => {
  it('spends the action on a failed escape - a free re-roll never fails', () => {
    let roster = table();
    const v0 = viewOf(roster);
    roster = setHeld(roster, charOf(v0, 'c1').id, charOf(v0, 'c0').id);
    const v = viewOf(roster);

    const after = escapeGrapple(v, roster, charOf(v, 'c1'), shoverLoses());
    expect(after.entries[1].play.turn.action).toBe(true);
    // Still held: the roll failed.
    expect(conditionsOf(viewOf(after), charOf(viewOf(after), 'c1'))).toContain(GRAPPLED);
  });

  it('lets go on request, free and without a roll', () => {
    let roster = table();
    const v0 = viewOf(roster);
    roster = setHeld(roster, charOf(v0, 'c1').id, charOf(v0, 'c0').id);
    const v = viewOf(roster);

    const after = releaseGrapple(v, roster, charOf(v, 'c0'))!;
    expect(conditionsOf(viewOf(after), charOf(viewOf(after), 'c1'))).not.toContain(GRAPPLED);
    // Nothing left pointing at a grappler who is no longer holding anybody.
    expect(sourcesOf(viewOf(after), charOf(viewOf(after), 'c1'))[GRAPPLED]).toBeUndefined();
    // And nobody to release is null rather than a write.
    expect(releaseGrapple(viewOf(after), after, charOf(viewOf(after), 'c0'))).toBeNull();
  });

  it('charges standing up half a speed, and refuses it when the budget will not cover it', () => {
    let roster = table();
    const play = roster.entries[0].play;
    roster = updatePlay(roster, 'c0', { ...play, conditions: ['prone'] });
    const v = viewOf(roster);
    const me = charOf(v, 'c0');
    const left = movementLeftFor(v, me);

    const up = standUpFrom(v, roster, me)!;
    expect(conditionsOf(viewOf(up), charOf(viewOf(up), 'c0'))).not.toContain('prone');
    expect(movementLeftFor(viewOf(up), charOf(viewOf(up), 'c0'))).toBe(left - Math.floor(left / 2));

    // Nothing left in the budget: refused, which is what makes a Trip cost.
    const spent = updatePlay(roster, 'c0', {
      ...roster.entries[0].play,
      conditions: ['prone'],
      turn: { ...roster.entries[0].play.turn, moved: 999 },
    });
    expect(standUpFrom(viewOf(spent), spent, charOf(viewOf(spent), 'c0'))).toBeNull();
  });
});

describe('hiding', () => {
  it('rolls, records and spends the pip only for the Hide action', () => {
    const roster = table();
    const v = viewOf(roster);
    const me = charOf(v, 'c0');

    const free = rollHide(v, roster, me, false, shoverWins);
    expect(activeEncounter(free).log?.[0]?.text).toMatch(/hides — Stealth/);
    // The row's Hide is free of the pip: out-of-turn hiding is the DM's business.
    expect(free.entries[0].play.turn.action).toBeFalsy();

    const asAction = rollHide(v, roster, me, true, shoverWins);
    expect(asAction.entries[0].play.turn.action).toBe(true);
  });
});

describe('letting go', () => {
  it('clears the condition and the source together', () => {
    let roster = table();
    const v0 = viewOf(roster);
    roster = setHeld(roster, charOf(v0, 'c1').id, charOf(v0, 'c0').id);
    const freed = letGo(roster, charOf(viewOf(roster), 'c1').id);
    const v = viewOf(freed);
    expect(conditionsOf(v, charOf(v, 'c1'))).not.toContain(GRAPPLED);
    expect(sourcesOf(v, charOf(v, 'c1'))[GRAPPLED]).toBeUndefined();
  });
});
