import { describe, expect, it } from 'vitest';
import { ENVIRONMENT, addCharacter, addMonster, emptyEncounter, isRunning, placeCombatant } from './encounter';
import { activeEncounter, updateEncounter, updatePlay } from './storage';
import { biteZone, healFromZone } from './fightZones';
import { hitPointsOf } from './hitPoints';
import type { Zone } from './zones';
import { charOf, fixtureMonster, monsterOf, viewOf } from './test/fight';
import { fighter, rosterOf, wizard } from './test/factories';

/**
 * §113. Ground that bites and ground that mends - testable at last,
 * because the dice became a parameter. A bite that rolls its own damage
 * cannot be asserted on, which is why none of this had a test before.
 */


/** Every die reads high, so a roll is its own maximum: 6 on a d6, 20 on
    a d20. Deterministic, and the arithmetic stays legible. */
const maxRoll = () => 0.999999;
/** Every die reads 1 - a failed save, minimum damage. */
const minRoll = () => 0;

const table = () => {
  const roster = rosterOf(fighter(), wizard());
  let enc = addCharacter(emptyEncounter(), 'c0', { initiative: 20 });
  enc = addCharacter(enc, 'c1', { initiative: 10 });
  enc = addMonster(enc, fixtureMonster('goblin'), { rng: () => 0.5 });
  const [a, b] = enc.combatants.filter((c) => c.kind === 'character');
  enc = placeCombatant(enc, a.id, { x: 1, y: 1 });
  enc = placeCombatant(enc, b.id, { x: 2, y: 1 });
  return updateEncounter(roster, enc);
};



const fire = (over: Partial<Zone> = {}): Zone =>
  ({
    id: 'z1',
    label: 'Wall of Fire',
    shape: 'sphere',
    at: { x: 1, y: 1 },
    feet: 20,
    tint: 0,
    effect: { damage: { dice: '2d6', type: 'Fire' } },
    ...over,
  }) as Zone;

const hpNowOf = (roster: ReturnType<typeof table>, rosterId: string) => {
  const v = viewOf(roster);
  return hitPointsOf(charOf(v, rosterId), roster, (id) => v.buildOf(id)?.hp.total ?? 0)!.now;
};

describe('ground that bites', () => {
  it('rolls, logs and lands the damage on a character sheet', () => {
    const roster = table();
    const before = hpNowOf(roster, 'c0');
    const v = viewOf(roster);

    const after = biteZone(v, roster, charOf(v, 'c0').id, fire(), 'walks into', maxRoll);
    // 2d6 all sixes.
    expect(hpNowOf(after, 'c0')).toBe(before - 12);
    expect(activeEncounter(after).log?.[0]?.text).toMatch(/walks into Wall of Fire.*12 Fire/);
  });

  it('halves on a passed save and spares entirely without the rider', () => {
    const roster = table();
    const before = hpNowOf(roster, 'c0');
    const v = viewOf(roster);
    const saved = fire({ effect: { damage: { dice: '2d6', type: 'Fire' }, save: { ability: 'dex', dc: 5, half: true } } } as Partial<Zone>);

    // Every die high: 12 damage, and a 20 beats DC 5, so half lands.
    const halved = biteZone(v, roster, charOf(v, 'c0').id, saved, 'walks into', maxRoll);
    expect(hpNowOf(halved, 'c0')).toBe(before - 6);

    // The same save without the half rider: a pass takes nothing at all.
    const allOrNothing = fire({ effect: { damage: { dice: '2d6', type: 'Fire' }, save: { ability: 'dex', dc: 5, half: false } } } as Partial<Zone>);
    const spared = biteZone(v, roster, charOf(v, 'c0').id, allOrNothing, 'walks into', maxRoll);
    expect(hpNowOf(spared, 'c0')).toBe(before);
    expect(activeEncounter(spared).log?.[0]?.text).toMatch(/pass.*no damage/);
  });

  it('tallies the hit for the debrief, capped at what was there to take', () => {
    const roster = table();
    const v = viewOf(roster);
    const gob = monsterOf(v);
    const standing = hitPointsOf(gob, roster, () => 0)!.now;
    const huge = fire({ effect: { damage: { dice: '99d6', type: 'Fire' } } } as Partial<Zone>);

    const after = biteZone(v, roster, gob.id, huge, 'is caught by', maxRoll);
    const tally = activeEncounter(after).tally?.[gob.id];
    expect(tally?.taken).toBe(standing);
    expect(tally?.drops).toBe(1);
  });

  /*
    §133. The room gets the credit. There is no hand behind a wall of fire,
    so this used to record the damage against the target and against nobody
    at all - which meant a party could walk out of a room having lost half
    its hit points to it, and the debrief would show the loss with no
    account of where it went.

    Deliberately not gated on the fight running. A hazard that bites during
    setup dealt that damage, and the recap is the only place it is ever
    said. That is the one thing that still differs from `applyHitPoints`,
    and it differs on purpose: that path is also how a DM nudges a number
    by hand, which is bookkeeping rather than an event.
  */
  it('credits the room, so the debrief can say where the damage went', () => {
    const roster = table();
    const v = viewOf(roster);
    const gob = monsterOf(v);
    const before = hitPointsOf(gob, roster, () => 0)!.now;

    const after = biteZone(v, roster, gob.id, fire(), 'is caught by', maxRoll);
    const tally = activeEncounter(after).tally!;
    const dealt = tally[ENVIRONMENT]?.dealt ?? 0;
    expect(dealt).toBeGreaterThan(0);
    // What the room dealt is what the goblin took - one event, two sides.
    expect(dealt).toBe(tally[gob.id]?.taken);
    expect(before).toBeGreaterThan(0);
  });

  it('tallies a bite taken before the fight started, which is when it is only ever said', () => {
    const roster = table();
    const v = viewOf(roster);
    // `table()` never calls `startEncounter`, so this fight is not running.
    expect(isRunning(activeEncounter(roster))).toBe(false);

    const after = biteZone(v, roster, monsterOf(v).id, fire(), 'is caught by', maxRoll);
    expect(activeEncounter(after).tally?.[ENVIRONMENT]?.dealt).toBeGreaterThan(0);
  });

  it('wakes a dormant monster, because ground hurts like a sword does', () => {
    const roster = table();
    const v0 = viewOf(roster);
    const gob = monsterOf(v0);
    const sleeping = updateEncounter(roster, {
      ...activeEncounter(roster),
      combatants: activeEncounter(roster).combatants.map((c) =>
        c.id === gob.id ? { ...c, dormant: true } : c,
      ),
    });
    const v = viewOf(sleeping);

    const after = biteZone(v, sleeping, gob.id, fire(), 'is caught by', maxRoll);
    const woken = activeEncounter(after).combatants.find((c) => c.id === gob.id)!;
    expect(woken.kind === 'monster' && woken.dormant).toBeFalsy();
  });

  it('rolls concentration when it hurts a caster, and drops the spell on a failure', () => {
    let roster = table();
    const play = roster.entries[1].play;
    roster = updatePlay(roster, 'c1', { ...play, concentratingOn: 'Bless' });
    const v = viewOf(roster);

    // Every die reads 1: minimum damage, and a 1 on the CON save fails.
    const after = biteZone(v, roster, charOf(v, 'c1').id, fire(), 'walks into', minRoll);
    expect(after.entries[1].play.concentratingOn).toBeUndefined();
    expect((activeEncounter(after).log ?? []).some((l) => /to hold Bless: LOST/.test(l.text))).toBe(
      true,
    );
  });

  it('does nothing at all for ground with no teeth', () => {
    const roster = table();
    const v = viewOf(roster);
    const harmless = fire({ effect: {} } as Partial<Zone>);
    expect(biteZone(v, roster, charOf(v, 'c0').id, harmless, 'walks into', maxRoll)).toBe(roster);
  });
});

describe('ground that mends', () => {
  it('gives back what it rolls, and never past full', () => {
    let roster = table();
    const full = hpNowOf(roster, 'c0');
    const play = roster.entries[0].play;
    roster = updatePlay(roster, 'c0', { ...play, currentHp: full - 10 });
    const v = viewOf(roster);

    const after = healFromZone(v, roster, charOf(v, 'c0').id, '1d4', maxRoll);
    expect(hpNowOf(after, 'c0')).toBe(full - 6);
    expect(activeEncounter(after).log?.[0]?.text).toMatch(/healing ground — 4 back/);
  });

  it('leaves the untouched alone and refuses the dropped - that is a ruling', () => {
    let roster = table();
    const v0 = viewOf(roster);
    // At full: nothing to mend.
    expect(healFromZone(v0, roster, charOf(v0, 'c0').id, '1d4', maxRoll)).toBe(roster);

    // At nought: healing the dropped is a loud ruling, not a side effect.
    const play = roster.entries[0].play;
    roster = updatePlay(roster, 'c0', { ...play, currentHp: 0 });
    const v = viewOf(roster);
    expect(healFromZone(v, roster, charOf(v, 'c0').id, '1d4', maxRoll)).toBe(roster);
  });
});
