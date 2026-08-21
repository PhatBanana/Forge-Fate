import { describe, expect, it } from 'vitest';
import fixture from './data/srd/srd-2014-monsters.json';
import type { Monster } from './data/monsters';
import { addCharacter, addMonster, emptyEncounter, nextTurn } from './encounter';
import { activeEncounter, updateEncounter } from './storage';
import { applyHitPoints, combatantName, hitPointsOf } from './hitPoints';
import { hpNow } from './play';
import { deriveBuild } from './engine/character';
import { fighter, rosterOf, wizard } from './test/factories';

/**
 * §106. Where a combatant's hit points live, and what changing them does -
 * tested by calling it, which is the whole point of the extraction: this
 * rule used to be two closures inside a 7,500-line component and could
 * only be reached by mounting one.
 */

const monsters = (fixture as unknown as { records: Monster[] }).records;
const goblin = () => monsters.find((m) => m.id === 'goblin')!;

/** A roster with the party in a running fight, and a goblin in it too. */
const table = () => {
  const roster = rosterOf(fighter(), wizard());
  let enc = addCharacter(emptyEncounter(), 'c0', { initiative: 20 });
  enc = addCharacter(enc, 'c1', { initiative: 15 });
  enc = addMonster(enc, goblin(), { rng: () => 0.5 });
  enc = nextTurn(enc).encounter;
  return updateEncounter(roster, enc);
};

const maxOf = (roster: ReturnType<typeof table>) => (rosterId: string) => {
  const entry = roster.entries.find((e) => e.id === rosterId);
  return entry ? deriveBuild(entry.build).hp.total : 0;
};

const monsterIn = (roster: ReturnType<typeof table>) =>
  activeEncounter(roster).combatants.find((c) => c.kind === 'monster')!;
const characterIn = (roster: ReturnType<typeof table>, rosterId: string) =>
  activeEncounter(roster).combatants.find(
    (c) => c.kind === 'character' && c.rosterId === rosterId,
  )!;

describe('which store owns the number', () => {
  it('reads a monster from the combatant and a character from their play state', () => {
    const roster = table();
    const max = maxOf(roster);

    const goblinHp = hitPointsOf(monsterIn(roster), roster, max)!;
    expect(goblinHp.now).toBe(goblinHp.max);
    expect(goblinHp.max).toBeGreaterThan(0);

    const fighterHp = hitPointsOf(characterIn(roster, 'c0'), roster, max)!;
    expect(fighterHp.max).toBe(deriveBuild(fighter()).hp.total);
    expect(fighterHp.now).toBe(fighterHp.max);
  });

  it('names a monster by its label and a character by their own name', () => {
    const roster = table();
    expect(combatantName(monsterIn(roster), roster)).toMatch(/goblin/i);
    expect(combatantName(characterIn(roster, 'c1'), roster)).toBe('Ünwyn');
  });

  it('answers null for a token whose character has left the roster', () => {
    const roster = table();
    const orphaned = { ...characterIn(roster, 'c0'), rosterId: 'gone' } as const;
    expect(hitPointsOf(orphaned, roster, maxOf(roster))).toBeNull();
    expect(combatantName(orphaned, roster)).toBe('Unknown');
  });
});

describe('changing them', () => {
  it('damages a character into their play state, and heals back', () => {
    const roster = table();
    const max = maxOf(roster);
    const me = characterIn(roster, 'c0');
    const full = hitPointsOf(me, roster, max)!.max;

    const hurt = applyHitPoints(roster, activeEncounter(roster), me, 7, max);
    expect(hpNow(hurt.entries[0].play, full)).toBe(full - 7);
    // The wizard is untouched: one character's pain is their own.
    expect(hurt.entries[1].play).toBe(roster.entries[1].play);

    const mended = applyHitPoints(hurt, activeEncounter(hurt), me, -3, max);
    expect(hpNow(mended.entries[0].play, full)).toBe(full - 4);
  });

  it('damages a monster on the combatant, leaving every play state alone', () => {
    const roster = table();
    const max = maxOf(roster);
    const before = hitPointsOf(monsterIn(roster), roster, max)!;

    const hurt = applyHitPoints(roster, activeEncounter(roster), monsterIn(roster), 4, max);
    expect(hitPointsOf(monsterIn(hurt), hurt, max)!.now).toBe(before.now - 4);
    expect(hurt.entries.map((e) => e.play)).toEqual(roster.entries.map((e) => e.play));
  });

  it('tallies the hit while a fight runs, capped at what was there to take', () => {
    const roster = table();
    const max = maxOf(roster);
    const gob = monsterIn(roster);
    const standing = hitPointsOf(gob, roster, max)!.now;

    // Overkill: the tally records what was actually there, not the swing.
    const dead = applyHitPoints(roster, activeEncounter(roster), gob, standing + 50, max);
    const tally = activeEncounter(dead).tally?.[gob.id];
    expect(tally?.taken).toBe(standing);
    expect(tally?.drops).toBe(1);
  });

  it('wakes a dormant monster, because pain is an alarm clock', () => {
    const roster = table();
    const max = maxOf(roster);
    const gob = monsterIn(roster);
    const sleeping = updateEncounter(roster, {
      ...activeEncounter(roster),
      combatants: activeEncounter(roster).combatants.map((c) =>
        c.id === gob.id ? { ...c, dormant: true } : c,
      ),
    });

    const woken = applyHitPoints(
      sleeping,
      activeEncounter(sleeping),
      activeEncounter(sleeping).combatants.find((c) => c.id === gob.id)!,
      3,
      max,
    );
    const after = activeEncounter(woken).combatants.find((c) => c.id === gob.id)!;
    expect(after.kind === 'monster' && after.dormant).toBeFalsy();
    expect(activeEncounter(woken).log?.[0]?.text).toMatch(/activates/i);
  });

  it('leaves the roster alone when the token names nobody', () => {
    const roster = table();
    const orphaned = { ...characterIn(roster, 'c0'), rosterId: 'gone' };
    expect(applyHitPoints(roster, activeEncounter(roster), orphaned, 5, maxOf(roster))).toBe(
      roster,
    );
  });
});
