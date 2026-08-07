import { describe, expect, it } from 'vitest';
import fixture from './data/srd/srd-2014-monsters.json';
import type { Monster } from './data/monsters';
import {
  addCharacter,
  addMonster,
  currentCombatant,
  damageMonster,
  emptyEncounter,
  endEncounter,
  isRunning,
  labelFor,
  monsterHp,
  nextTurn,
  removeCombatant,
  distanceBetween,
  moveCombatantTo,
  placeCombatant,
  rollMonsterInitiative,
  setInitiative,
  setMonsterHp,
  sortCombatants,
  startEncounter,
  toggleMonsterCondition,
  appendLog,
  rechargeReady,
  setMonsterRecharge,
  recordDamage,
  setDormant,
  setHidden,
  spendLegendary,
  spendMonsterMovement,
  spendMonsterUse,
  usesLeft,
  addTimedMonsterCondition,
  delayTurn,
  tickMonsterConditions,
} from './encounter';
import type { EncounterState, MonsterCombatant } from './encounter';

/**
 * The fight.
 *
 * Almost everything here is about two things that go wrong quietly. Turn order
 * must not move on its own, and a character's hit points must have exactly one
 * home - so the tests that matter most are the ones about ties, about removing
 * somebody mid-fight, and about what the tracker deliberately does *not* store.
 */

const monsters = (fixture as unknown as { records: Monster[] }).records;
const monster = (id: string) => monsters.find((m) => m.id === id)!;
const goblin = () => monster('goblin');

/** A deterministic RNG. `dice.ts` takes a fraction in [0, 1). */
const always = (face: number, die = 20) => () => (face - 1) / die;

const ids = (encounter: EncounterState) =>
  sortCombatants(encounter.combatants).map((c) =>
    c.kind === 'monster' ? c.label : c.rosterId,
  );

describe('who is in the fight', () => {
  it('starts empty and not running', () => {
    const encounter = emptyEncounter();
    expect(encounter.combatants).toEqual([]);
    expect(isRunning(encounter)).toBe(false);
    expect(currentCombatant(encounter)).toBeNull();
  });

  it('letters a monster only once there are two of it', () => {
    // "Goblin" and "Goblin B" reads as two different creatures, one of them
    // wrong. The first one is renamed when the second arrives.
    let encounter = addMonster(emptyEncounter(), goblin(), { rng: always(10) });
    expect(ids(encounter)).toEqual(['Goblin']);

    encounter = addMonster(encounter, goblin(), { rng: always(10) });
    expect(new Set(ids(encounter))).toEqual(new Set(['Goblin A', 'Goblin B']));

    encounter = addMonster(encounter, goblin(), { rng: always(10) });
    expect(new Set(ids(encounter))).toEqual(new Set(['Goblin A', 'Goblin B', 'Goblin C']));
  });

  it('does not letter two different monsters', () => {
    let encounter = addMonster(emptyEncounter(), goblin(), { rng: always(10) });
    encounter = addMonster(encounter, monster('orc'), { rng: always(10) });
    expect(new Set(ids(encounter))).toEqual(new Set(['Goblin', 'Orc']));
  });

  it('renames nothing when the first was already lettered', () => {
    // Built through `addMonster` rather than written by hand: a hand-made
    // combatant missing `kind` or `monsterId` is invisible to `labelFor`'s
    // filter, and casting one to the type only hides that from the compiler.
    let encounter = addMonster(emptyEncounter(), goblin(), { rng: always(10) });
    encounter = addMonster(encounter, goblin(), { rng: always(10) });
    expect(labelFor(encounter.combatants, goblin())).toEqual({
      label: 'Goblin C',
      renames: [],
    });
  });

  it('takes a character by reference and refuses a second copy', () => {
    // The combatant holds a roster id and nothing else. Two rows for one
    // character would be two rows sharing one pool of hit points.
    let encounter = addCharacter(emptyEncounter(), 'grog', { initiative: 18, dex: 14 });
    encounter = addCharacter(encounter, 'grog', { initiative: 4 });
    expect(encounter.combatants).toHaveLength(1);
    expect(encounter.combatants[0]).toMatchObject({ rosterId: 'grog', initiative: 18 });
  });

  it('stores no hit points for a character', () => {
    // The point of the whole design. Their hit points live in their PlayState
    // and are read from there, so there is nothing here to drift.
    const encounter = addCharacter(emptyEncounter(), 'grog');
    expect(encounter.combatants[0]).not.toHaveProperty('hp');
  });
});

describe('hit points for a monster', () => {
  it('takes the printed average by default', () => {
    expect(monsterHp(goblin(), false)).toBe(7);
  });

  it('rolls them when asked, from the dice the stat block prints', () => {
    // A goblin is 2d6, so 2 at the floor and 12 at the ceiling.
    expect(monsterHp(goblin(), true, () => 0)).toBe(2);
    expect(monsterHp(goblin(), true, () => 0.999)).toBe(12);
  });

  it('never rolls a creature to nothing', () => {
    // Some stat blocks are a die with a negative Constitution behind them, and
    // a monster that arrives dead is not a monster.
    const weak = { ...goblin(), hpRoll: '1d4-6' };
    expect(monsterHp(weak, true, () => 0)).toBe(1);
  });

  it('falls back to the average when the roll cannot be read', () => {
    expect(monsterHp({ ...goblin(), hpRoll: null }, true)).toBe(7);
  });

  it('raises the maximum when a DM types a bigger number', () => {
    // Which is most of what adjusting a stat block at the table means.
    let encounter = addMonster(emptyEncounter(), goblin(), { rng: always(10) });
    const id = encounter.combatants[0].id;
    encounter = setMonsterHp(encounter, id, 30);
    expect(encounter.combatants[0]).toMatchObject({ hp: 30, maxHp: 30 });
  });

  it('clamps damage at nothing and healing at the maximum', () => {
    let encounter = addMonster(emptyEncounter(), goblin(), { rng: always(10) });
    const id = encounter.combatants[0].id;
    encounter = damageMonster(encounter, id, 99);
    expect((encounter.combatants[0] as MonsterCombatant).hp).toBe(0);
    encounter = damageMonster(encounter, id, -99);
    expect((encounter.combatants[0] as MonsterCombatant).hp).toBe(7);
  });

  it('toggles a condition on a monster', () => {
    let encounter = addMonster(emptyEncounter(), goblin(), { rng: always(10) });
    const id = encounter.combatants[0].id;
    encounter = toggleMonsterCondition(encounter, id, 'prone');
    expect((encounter.combatants[0] as MonsterCombatant).conditions).toEqual(['prone']);
    encounter = toggleMonsterCondition(encounter, id, 'prone');
    expect((encounter.combatants[0] as MonsterCombatant).conditions).toEqual([]);
  });
});

describe('turn order', () => {
  it('runs highest initiative first', () => {
    let encounter = addCharacter(emptyEncounter(), 'lyra', { initiative: 12 });
    encounter = addCharacter(encounter, 'grog', { initiative: 18 });
    expect(ids(encounter)).toEqual(['grog', 'lyra']);
  });

  it('breaks a tie the same way on every read', () => {
    /*
      The rule this whole field exists for. A tie broken at sort time - by a
      Dexterity looked up from a stat block, or worse by Math.random - would
      reorder the list on some later render for reasons nobody could see, in
      the middle of a fight. The tie-break is decided once and stored, so
      sorting is a pure function of what is saved.
    */
    let encounter = addCharacter(emptyEncounter(), 'lyra', { initiative: 15, dex: 10 });
    encounter = addCharacter(encounter, 'grog', { initiative: 15, dex: 18 });
    const first = ids(encounter);
    expect(first).toEqual(['grog', 'lyra']);
    for (let i = 0; i < 20; i++) expect(ids(encounter)).toEqual(first);
  });

  it('rolls monster initiative off Dexterity and leaves characters alone', () => {
    // A player rolls their own initiative. A tracker taking that away is the
    // one thing a table would actually notice.
    let encounter = addCharacter(emptyEncounter(), 'grog', { initiative: 18 });
    encounter = addMonster(encounter, goblin(), { rng: always(1) });

    const table = new Map([[goblin().id, goblin()]]);
    encounter = rollMonsterInitiative(encounter, table, always(11));

    const monsterRow = encounter.combatants.find((c) => c.kind === 'monster')!;
    expect(monsterRow.initiative).toBe(13); // 11 on the die, +2 for Dex 14
    expect(encounter.combatants.find((c) => c.kind === 'character')!.initiative).toBe(18);
  });

  it('counts rounds and wraps at the bottom of the order', () => {
    let encounter = addCharacter(emptyEncounter(), 'grog', { initiative: 18 });
    encounter = addCharacter(encounter, 'lyra', { initiative: 12 });

    let step = nextTurn(encounter);
    expect(step.encounter.round).toBe(1);
    expect(step.began).toMatchObject({ rosterId: 'grog' });

    step = nextTurn(step.encounter);
    expect(step.encounter.round).toBe(1);
    expect(step.began).toMatchObject({ rosterId: 'lyra' });

    step = nextTurn(step.encounter);
    expect(step.encounter.round).toBe(2);
    expect(step.began).toMatchObject({ rosterId: 'grog' });
  });

  it('says whose turn began, so the caller can reset their action economy', () => {
    // The payoff of the turn tracker: `newTurn` in play.ts gives back the
    // action, bonus action, reaction and movement at the start of a turn, and
    // the thing that knows when a turn starts should be what presses it.
    let encounter = addCharacter(emptyEncounter(), 'grog', { initiative: 18 });
    encounter = addMonster(encounter, goblin(), { rng: always(1) });
    const { began } = nextTurn(encounter);
    expect(began?.kind).toBe('character');
  });

  it('does not start a fight with nobody in it', () => {
    expect(startEncounter(emptyEncounter()).round).toBe(0);
    expect(nextTurn(emptyEncounter()).began).toBeNull();
  });
});

describe('somebody leaves mid-fight', () => {
  const three = () => {
    let encounter = addCharacter(emptyEncounter(), 'grog', { initiative: 20 });
    encounter = addCharacter(encounter, 'lyra', { initiative: 15 });
    encounter = addCharacter(encounter, 'pike', { initiative: 10 });
    return startEncounter(encounter);
  };

  it('keeps the pointer on the same combatant when an earlier one goes', () => {
    /*
      The bug this is here for: removing somebody above you in the order shifts
      everyone below them down one, so an untouched index silently skips
      whoever was up. Lyra is on turn; Grog is removed; it must still be Lyra.
    */
    let encounter = { ...three(), turnIndex: 1 };
    expect(currentCombatant(encounter)).toMatchObject({ rosterId: 'lyra' });
    encounter = removeCombatant(encounter, encounter.combatants[0].id);
    expect(currentCombatant(encounter)).toMatchObject({ rosterId: 'lyra' });
  });

  it('moves on when the one whose turn it is goes', () => {
    let encounter = { ...three(), turnIndex: 1 };
    const lyra = sortCombatants(encounter.combatants)[1];
    encounter = removeCombatant(encounter, lyra.id);
    expect(currentCombatant(encounter)).toMatchObject({ rosterId: 'pike' });
  });

  it('does not run off the end when the last one goes', () => {
    let encounter = { ...three(), turnIndex: 2 };
    const pike = sortCombatants(encounter.combatants)[2];
    encounter = removeCombatant(encounter, pike.id);
    expect(currentCombatant(encounter)).toMatchObject({ rosterId: 'lyra' });
  });

  it('ends the fight when the last combatant leaves', () => {
    let encounter = startEncounter(addCharacter(emptyEncounter(), 'grog', { initiative: 5 }));
    encounter = removeCombatant(encounter, encounter.combatants[0].id);
    expect(encounter.combatants).toEqual([]);
    expect(isRunning(encounter)).toBe(false);
  });

  it('ignores an id that is not in the fight', () => {
    const encounter = three();
    expect(removeCombatant(encounter, 'nobody')).toBe(encounter);
  });
});

describe('ending it', () => {
  it('keeps who was in it, so the same goblins can fight again', () => {
    let encounter = addCharacter(emptyEncounter(), 'grog', { initiative: 18 });
    encounter = addMonster(encounter, goblin(), { rng: always(10) });
    encounter = endEncounter(startEncounter(encounter));
    expect(encounter.combatants).toHaveLength(2);
    expect(isRunning(encounter)).toBe(false);
    expect(currentCombatant(encounter)).toBeNull();
  });

  it('lets initiative be typed over', () => {
    const encounter = addCharacter(emptyEncounter(), 'grog', { initiative: 3 });
    const fixed = setInitiative(encounter, encounter.combatants[0].id, 21);
    expect(fixed.combatants[0].initiative).toBe(21);
  });
});

/**
 * Tokens on the map.
 *
 * The only rule here is the one about diagonals, and it is the one a grid
 * exists to settle.
 */
describe('standing somewhere', () => {
  it('nobody is on the map until they are put there', () => {
    // A fight run in the head is the normal case. A token defaulting to the
    // top-left corner would be a statement about where somebody is standing.
    const encounter = addCharacter(emptyEncounter(), 'grog', { initiative: 12 });
    expect(encounter.combatants[0].at).toBeUndefined();
  });

  it('counts a diagonal as five feet, like every other step', () => {
    /*
      Chebyshev, not Pythagoras. Three across and two down is fifteen feet, not
      twenty-five and not eighteen. The variant that alternates 5 and 10 is
      optional, and choosing it for everybody would quietly change how far a
      Rogue gets on a turn.
    */
    expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(15);
    expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(15);
    expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 2 })).toBe(15);
    expect(distanceBetween({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });

  it('measures a move without charging it', () => {
    // What a move costs depends on whose it is, and a character's movement
    // lives in their own PlayState. This module measures; the caller charges.
    let encounter = addCharacter(emptyEncounter(), 'grog', { initiative: 12 });
    const id = encounter.combatants[0].id;
    encounter = placeCombatant(encounter, id, { x: 2, y: 2 });

    const step = moveCombatantTo(encounter, id, { x: 6, y: 4 });
    expect(step.feet).toBe(20);
    expect(step.encounter.combatants[0].at).toEqual({ x: 6, y: 4 });
  });

  it('charges nothing for the first placement', () => {
    // Putting a token down at the start of a fight is not a move.
    const encounter = addCharacter(emptyEncounter(), 'grog', { initiative: 12 });
    const id = encounter.combatants[0].id;
    expect(moveCombatantTo(encounter, id, { x: 9, y: 9 }).feet).toBe(0);
  });

  it('takes a combatant back off the map', () => {
    let encounter = addCharacter(emptyEncounter(), 'grog', { initiative: 12 });
    const id = encounter.combatants[0].id;
    encounter = placeCombatant(encounter, id, { x: 1, y: 1 });
    encounter = placeCombatant(encounter, id, undefined);
    expect(encounter.combatants[0].at).toBeUndefined();
  });
});

describe('limited abilities', () => {
  const goblinish = { id: 'breather', name: 'Breather', scores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } } as unknown as Monster;

  it('counts a per-day ability down on the one goblin that used it', () => {
    let enc = addMonster(emptyEncounter(), goblinish);
    enc = addMonster(enc, goblinish);
    const [a] = enc.combatants as MonsterCombatant[];

    enc = spendMonsterUse(enc, a.id, 'Leadership');
    const after = enc.combatants as MonsterCombatant[];
    expect(usesLeft(after[0], 'Leadership', 3)).toBe(2);
    // B's count is untouched: the spend is the instance's, not the kind's.
    expect(usesLeft(after[1], 'Leadership', 3)).toBe(3);
  });

  it('marks a breath spent and ready again, starting ready', () => {
    let enc = addMonster(emptyEncounter(), goblinish);
    const dragon = enc.combatants[0] as MonsterCombatant;
    expect(rechargeReady(dragon, 'Fire Breath')).toBe(true);

    enc = setMonsterRecharge(enc, dragon.id, 'Fire Breath', false);
    expect(rechargeReady(enc.combatants[0] as MonsterCombatant, 'Fire Breath')).toBe(false);
    enc = setMonsterRecharge(enc, dragon.id, 'Fire Breath', true);
    expect(rechargeReady(enc.combatants[0] as MonsterCombatant, 'Fire Breath')).toBe(true);
  });

  it('gives legendary actions back at the start of the monster’s own turn', () => {
    let enc = addMonster(emptyEncounter(), goblinish);
    const dragon = enc.combatants[0] as MonsterCombatant;
    enc = startEncounter(enc);
    enc = spendLegendary(enc, dragon.id, 2);
    expect((enc.combatants[0] as MonsterCombatant).legendarySpent).toBe(2);

    // Its own turn comes round again (a one-monster fight: next turn is it).
    enc = nextTurn(enc).encounter;
    expect((enc.combatants[0] as MonsterCombatant).legendarySpent).toBe(0);
  });

  it('tracks a monster’s movement and refunds it when its turn comes round', () => {
    let enc = addMonster(emptyEncounter(), goblinish);
    const walker = enc.combatants[0] as MonsterCombatant;
    enc = startEncounter(enc);

    enc = spendMonsterMovement(enc, walker.id, 20);
    enc = spendMonsterMovement(enc, walker.id, 10);
    expect((enc.combatants[0] as MonsterCombatant).moved).toBe(30);

    // Its own turn begins again: the feet come back, like the legendaries.
    enc = nextTurn(enc).encounter;
    expect((enc.combatants[0] as MonsterCombatant).moved).toBe(0);
  });

  it('starts the fight with nobody having walked', () => {
    let enc = addMonster(emptyEncounter(), goblinish);
    const walker = enc.combatants[0] as MonsterCombatant;
    enc = startEncounter(enc);
    enc = spendMonsterMovement(enc, walker.id, 25);
    enc = endEncounter(enc);

    enc = startEncounter(enc);
    expect((enc.combatants[0] as MonsterCombatant).moved).toBe(0);
  });

  it('passes the turn pointer over dormant monsters', () => {
    let enc = addMonster(emptyEncounter(), goblinish, { rng: always(15) });
    enc = addMonster(enc, goblinish, { rng: always(10) });
    enc = addMonster(enc, goblinish, { rng: always(5) });
    const [a, b, c] = sortCombatants(enc.combatants).map((x) => x.id);
    enc = setDormant(enc, b, true);

    // The fight opens on A; the next turn skips dormant B and lands on C.
    let step = nextTurn(enc);
    expect(step.began?.id).toBe(a);
    step = nextTurn(step.encounter);
    expect(step.began?.id).toBe(c);
    expect(step.encounter.round).toBe(1);

    // Woken, B takes its place in the order again.
    let woken = setDormant(step.encounter, b, false);
    const next = nextTurn(woken);
    // C was up; the wrap comes back around to A in round two.
    expect(next.began?.id).toBe(a);
    expect(next.encounter.round).toBe(2);
    woken = nextTurn(next.encounter).encounter;
    expect(currentCombatant(woken)?.id).toBe(b);
  });

  it('opens the fight past a dormant monster at the top of the order', () => {
    let enc = addMonster(emptyEncounter(), goblinish, { rng: always(15) });
    enc = addMonster(enc, goblinish, { rng: always(10) });
    const [a, b] = sortCombatants(enc.combatants).map((x) => x.id);
    enc = setDormant(enc, a, true);
    const { began } = nextTurn(enc);
    expect(began?.id).toBe(b);
  });

  it('hides and reveals either side of the table', () => {
    let enc = addMonster(emptyEncounter(), goblinish);
    const id = enc.combatants[0].id;
    enc = setHidden(enc, id, 17);
    expect((enc.combatants[0] as MonsterCombatant).hidden).toBe(17);
    enc = setHidden(enc, id, undefined);
    expect((enc.combatants[0] as MonsterCombatant).hidden).toBeUndefined();
  });

  it('keeps the score for the debrief, and a fresh fight wipes it', () => {
    let enc = addMonster(emptyEncounter(), goblinish);
    enc = addMonster(enc, goblinish);
    const [a, b] = enc.combatants;
    enc = startEncounter(enc);

    enc = recordDamage(enc, { by: a.id, to: b.id, amount: 6 });
    enc = recordDamage(enc, { by: a.id, to: b.id, amount: 4, downed: true });
    expect(enc.tally![a.id]).toEqual({ dealt: 10, taken: 0, kills: 1, drops: 0 });
    expect(enc.tally![b.id]).toEqual({ dealt: 0, taken: 10, kills: 0, drops: 1 });

    // Ending stamps the rounds and says so; starting again wipes the slate.
    enc = endEncounter(enc);
    expect(enc.endedAfter).toBe(1);
    expect(enc.log![0].text).toBe('The fight ends — 1 round.');
    enc = startEncounter(enc);
    expect(enc.tally).toBeUndefined();
    expect(enc.endedAfter).toBeUndefined();
  });

  it('scores unowned damage to the taker alone', () => {
    let enc = addMonster(emptyEncounter(), goblinish);
    const target = enc.combatants[0];
    enc = recordDamage(enc, { to: target.id, amount: 5 });
    expect(enc.tally![target.id]).toEqual({ dealt: 0, taken: 5, kills: 0, drops: 0 });
  });

  it('keeps the last thirty log lines, newest first', () => {
    let enc = emptyEncounter();
    for (let i = 0; i < 35; i++) enc = appendLog(enc, `line ${i}`);
    expect(enc.log).toHaveLength(30);
    expect(enc.log![0].text).toBe('line 34');
  });
});

describe('the fight’s clocks', () => {
  const plain = { id: 'p', name: 'P', scores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } } as unknown as Monster;

  it('ticks a monster’s timed condition off and leaves the untimed alone', () => {
    let enc = addMonster(emptyEncounter(), plain);
    const id = enc.combatants[0].id;
    enc = toggleMonsterCondition(enc, id, 'prone');
    enc = addTimedMonsterCondition(enc, id, 'stunned', 1);

    enc = tickMonsterConditions(enc);
    const monster = enc.combatants[0] as MonsterCombatant;
    expect(monster.conditions).toContain('prone');
    expect(monster.conditions).not.toContain('stunned');
  });

  it('delays one place down the order and keeps the pointer honest', () => {
    // Pinned initiatives: rolled ones can tie, and a tie makes "one place
    // down" ambiguous - this test failed one full-suite run in dozens before
    // the pin, on exactly that.
    let enc = addMonster(emptyEncounter(), plain, { rng: always(15) });
    enc = addMonster(enc, plain, { rng: always(10) });
    enc = addMonster(enc, plain, { rng: always(5) });
    const [a, b, c] = sortCombatants(enc.combatants).map((x) => x.id);
    enc = startEncounter(enc);

    enc = delayTurn(enc, a);
    const order = sortCombatants(enc.combatants).map((x) => x.id);
    // A moved exactly one place: past B, not past C.
    expect(order).toEqual([b, a, c]);
    // The pointer stayed at index 0, which now names B - "you go, I'll act
    // after" - and B is whose turn it is.
    expect(currentCombatant(enc)?.id).toBe(b);
  });

  it('delaying from the bottom of the order changes nothing', () => {
    let enc = addMonster(emptyEncounter(), plain);
    enc = addMonster(enc, plain);
    const last = sortCombatants(enc.combatants)[1].id;
    expect(delayTurn(enc, last)).toBe(enc);
  });
});
