import { describe, expect, it } from 'vitest';
import fixture from './data/srd/srd-2014-monsters.json';
import type { Monster } from './data/monsters';
import { addCharacter, addMonster, emptyEncounter, placeCombatant } from './encounter';
import { activeEncounter, updateEncounter, updatePlay } from './storage';
import { deriveBuild } from './engine/character';
import { generateDungeon } from './engine/dungeon';
import { DEFAULT_HOUSE_RULES } from './houseRules';
import { spendReactionOf, strikesInto } from './fightStrike';
import { hitPointsOf } from './hitPoints';
import { maxHpOf } from './fightFacts';
import type { StrikeContext } from './fightStrike';
import { reactionSpentOf } from './fightFacts';
import type { FightView } from './fightFacts';
import type { Strike } from './engine/strikes';
import { fighter, rosterOf, wizard } from './test/factories';

/**
 * §115. The swing, asked directly. Every one of these was previously
 * reachable only by mounting a battle screen and clicking a token.
 */

const monsters = (fixture as unknown as { records: Monster[] }).records;
const byId = new Map(monsters.map((m) => [m.id, m]));
const dungeon = generateDungeon('x', { rooms: 0, width: 10, height: 8 });

/** Every die reads its maximum: a natural 20, top damage. */
const alwaysHigh = () => 0.999999;
/** Every die reads 1: a natural 1, which misses whatever the bonus. */
const alwaysLow = () => 0;

const ctx = (over: Partial<StrikeContext> = {}): StrikeContext => ({
  sight: { dungeon, terrain: {}, elevation: {} },
  litAt: () => 'bright',
  houseRules: DEFAULT_HOUSE_RULES,
  ...over,
});

const table = () => {
  const roster = rosterOf(fighter(), wizard());
  let enc = addCharacter(emptyEncounter(), 'c0', { initiative: 20 });
  enc = addCharacter(enc, 'c1', { initiative: 10 });
  enc = addMonster(enc, byId.get('goblin')!, { rng: () => 0.5 });
  const [a, b] = enc.combatants.filter((c) => c.kind === 'character');
  const gob = enc.combatants.find((c) => c.kind === 'monster')!;
  enc = placeCombatant(enc, a.id, { x: 3, y: 3 });
  enc = placeCombatant(enc, b.id, { x: 6, y: 6 });
  enc = placeCombatant(enc, gob.id, { x: 4, y: 3 });
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

/** A plain, predictable swing: +5 to hit, 1d6 slashing. */
const sword = (): Strike[] => [
  { label: 'Longsword', toHit: 5, damage: [{ dice: '1d6', type: 'slashing' }] } as Strike,
];

const hpOfMonster = (roster: ReturnType<typeof table>) => {
  const gob = monsterOf(viewOf(roster));
  return gob.kind === 'monster' ? gob.hp : 0;
};

describe('a swing that lands', () => {
  it('rolls, hits, and takes the damage off the monster', () => {
    const roster = table();
    const v = viewOf(roster);
    const before = hpOfMonster(roster);

    const after = strikesInto(
      v,
      ctx(),
      roster,
      { name: 'Basher', id: charOf(v, 'c0').id },
      sword(),
      monsterOf(v),
      undefined,
      alwaysHigh,
    );
    expect(hpOfMonster(after)).toBeLessThan(before);
    expect(activeEncounter(after).log?.[0]?.text).toMatch(/Basher/);
  });

  it('a natural 1 misses however good the bonus, and takes nothing off', () => {
    const roster = table();
    const v = viewOf(roster);
    const before = hpOfMonster(roster);

    const after = strikesInto(
      v,
      ctx(),
      roster,
      { name: 'Basher', id: charOf(v, 'c0').id },
      [{ label: 'Sure thing', toHit: 99, damage: [{ dice: '1d6', type: 'slashing' }] } as Strike],
      monsterOf(v),
      undefined,
      alwaysLow,
    );
    expect(hpOfMonster(after)).toBe(before);
  });

  it('spends the action only when the caller says the swing was the Attack action', () => {
    const roster = table();
    const v = viewOf(roster);
    const me = charOf(v, 'c0');

    const free = strikesInto(v, ctx(), roster, { name: 'Basher', id: me.id }, sword(), monsterOf(v), undefined, alwaysHigh);
    expect(free.entries[0].play.turn.action).toBeFalsy();

    const spent = strikesInto(v, ctx(), roster, { name: 'Basher', id: me.id }, sword(), monsterOf(v), { spendAction: true }, alwaysHigh);
    expect(spent.entries[0].play.turn.action).toBe(true);
  });

  it('tallies the damage against the dealer as well as the target', () => {
    const roster = table();
    const v = viewOf(roster);
    const me = charOf(v, 'c0');
    const gob = monsterOf(v);

    const after = strikesInto(v, ctx(), roster, { name: 'Basher', id: me.id }, sword(), gob, undefined, alwaysHigh);
    const tally = activeEncounter(after).tally;
    expect(tally?.[gob.id]?.taken).toBeGreaterThan(0);
    expect(tally?.[me.id]?.dealt).toBeGreaterThan(0);
  });
});

describe('what the swing asks before the die', () => {
  it('says the odds in the log - the advantage is rolled, not just announced', () => {
    let roster = table();
    // Prone in reach: the SRD gives the attacker advantage.
    const play = roster.entries[0].play;
    roster = updatePlay(roster, 'c0', { ...play, conditions: [] });
    const v = viewOf(roster);
    const gob = monsterOf(v);
    const proneGoblin = updateEncounter(roster, {
      ...activeEncounter(roster),
      combatants: activeEncounter(roster).combatants.map((c) =>
        c.id === gob.id && c.kind === 'monster' ? { ...c, conditions: ['prone'] } : c,
      ),
    });
    const v2 = viewOf(proneGoblin);

    const after = strikesInto(
      v2,
      ctx(),
      proneGoblin,
      { name: 'Basher', id: charOf(v2, 'c0').id },
      sword(),
      monsterOf(v2),
      undefined,
      alwaysHigh,
    );
    expect(activeEncounter(after).log?.[0]?.text).toMatch(/advantage/i);
  });

  it('leaves a target with no armour to speak of alone rather than guessing', () => {
    const roster = table();
    const v: FightView = { ...viewOf(roster), monsterById: () => undefined };
    const before = hpOfMonster(roster);
    // No stat block means no AC, and an attack with no AC to beat is not
    // resolved at all - the roster comes back untouched.
    const after = strikesInto(v, ctx(), roster, { name: 'Basher' }, sword(), monsterOf(viewOf(roster)), undefined, alwaysHigh);
    expect(after).toBe(roster);
    expect(hpOfMonster(after)).toBe(before);
  });

  it('breaks concentration on a caster it hurts badly enough', () => {
    let roster = table();
    const play = roster.entries[1].play;
    roster = updatePlay(roster, 'c1', { ...play, concentratingOn: 'Bless' });
    const v = viewOf(roster);

    const after = strikesInto(
      v,
      ctx(),
      roster,
      { name: 'Goblin', id: monsterOf(v).id },
      [{ label: 'Maul', toHit: 20, damage: [{ dice: '20d12', type: 'bludgeoning' }] } as Strike],
      charOf(v, 'c1'),
      undefined,
      // High damage, then a failed save: the DC scales with the damage.
      (() => {
        let n = 0;
        return () => (n++ < 25 ? 0.999999 : 0);
      })(),
    );
    expect(after.entries[1].play.concentratingOn).toBeUndefined();
  });
});

describe('the reaction', () => {
  it('is spent onto the roster rather than written, so it lands in one write', () => {
    const roster = table();
    const v = viewOf(roster);
    const me = charOf(v, 'c0');
    expect(reactionSpentOf(v, me)).toBe(false);

    const after = spendReactionOf(roster, me);
    expect(reactionSpentOf(viewOf(after), charOf(viewOf(after), 'c0'))).toBe(true);
    // A monster's rides the combatant instead, and works the same way.
    const gobSpent = spendReactionOf(roster, monsterOf(v));
    expect(reactionSpentOf(viewOf(gobSpent), monsterOf(viewOf(gobSpent)))).toBe(true);
  });
});

describe('the roster it reads from, which is not the one it writes to', () => {
  /*
    The scope a scripted move got wrong once, and which the compiler
    could not catch: a *character's* hit points are read off the
    render's roster, while combatants are re-read off the threaded one.
    (A monster's ride the combatant itself, so the roster argument never
    reaches them - which is why the first draft of this test proved
    nothing.) It looks like an oversight and may well be one; a move is
    not the place to decide, so it is pinned and a change has to be
    deliberate.
  */
  it("caps a character's tally from the render's roster, not the threaded one", () => {
    const roster = table();
    const v = viewOf(roster);
    const gob = monsterOf(v);
    // Fresh play state leaves currentHp undefined, meaning full - so ask.
    const full = hitPointsOf(charOf(v, 'c1'), roster, maxHpOf(v))!.now;

    // The wizard is already at 1hp in the roster threaded in - the sort of
    // thing a walk through a wall of fire composes just before a swing.
    const wounded = updatePlay(roster, 'c1', { ...roster.entries[1].play, currentHp: 1 });

    const after = strikesInto(
      v,
      ctx(),
      wounded,
      { name: 'Goblin', id: gob.id },
      [{ label: 'Maul', toHit: 20, damage: [{ dice: '4d6', type: 'bludgeoning' }] } as Strike],
      charOf(v, 'c1'),
      undefined,
      alwaysHigh,
    );
    const taken = activeEncounter(after).tally?.[charOf(v, 'c1').id]?.taken ?? 0;
    // Capped against the render's hit points (full), not the threaded 1.
    expect(full).toBeGreaterThan(1);
    expect(taken).toBeGreaterThan(1);
  });
});
