import { describe, expect, it } from 'vitest';
import { exhaustionLines } from './data/conditions';
import { deriveBuild, emptyBuild } from './engine/character';
import {
  applyDeathSaveRoll,
  clearDeathSaves,
  maySpend,
  recordSpellCast,
  setInspiration,
  clearRolls,
  recordRoll,
  damage,
  emptyPlay,
  heal,
  hitDiceLeft,
  hpNow,
  isFresh,
  longRest,
  recordDeathSave,
  restorePact,
  restoreSlot,
  setTempHp,
  shortRest,
  slotsLeft,
  slotsTotal,
  ammoLeft,
  spendAmmo,
  setAmmoLeft,
  recoverAmmo,
  restockAmmo,
  createSlotWithPoints,
  convertSlotToPoints,
  spendHitDie,
  spendPact,
  spendResource,
  spendSlot,
  resourceLeft,
  restoreResource,
  setResourceSpent,
  setExhaustion,
  toggleCondition,
  newTurn,
  toggleTurnSlot,
  moveBy,
  movementBudget,
  movementLeft,
  dash,
  turnSpent,
  customValue,
  stepCustom,
  addTimedCondition,
  breakConcentration,
  concentrationDc,
  startConcentration,
  tickConditions,
} from './play';
import type { CustomResource } from './types';

const MAX = 60;

describe('hit points', () => {
  /**
   * Stored as null rather than a number so a level-up does not strand you on
   * a maximum that no longer exists.
   */
  it('reads as full until something happens', () => {
    expect(hpNow(emptyPlay(), MAX)).toBe(MAX);
    expect(hpNow(emptyPlay(), 100)).toBe(100);
  });

  it('takes damage and heals back', () => {
    let play = damage(emptyPlay(), 22, MAX);
    expect(hpNow(play, MAX)).toBe(38);
    play = heal(play, 10, MAX);
    expect(hpNow(play, MAX)).toBe(48);
  });

  it('does not heal past the maximum or fall below zero', () => {
    expect(hpNow(heal(emptyPlay(), 999, MAX), MAX)).toBe(MAX);
    expect(hpNow(damage(emptyPlay(), 999, MAX), MAX)).toBe(0);
  });

  it('ignores nonsense amounts', () => {
    const play = emptyPlay();
    expect(damage(play, 0, MAX)).toBe(play);
    expect(heal(play, -5, MAX)).toBe(play);
  });
});

describe('temporary hit points', () => {
  it('is spent before real hit points', () => {
    let play = setTempHp(emptyPlay(), 10);
    play = damage(play, 6, MAX);
    expect(play.tempHp).toBe(4);
    expect(hpNow(play, MAX)).toBe(MAX);
  });

  it('spills over once it runs out', () => {
    let play = setTempHp(emptyPlay(), 10);
    play = damage(play, 16, MAX);
    expect(play.tempHp).toBe(0);
    expect(hpNow(play, MAX)).toBe(MAX - 6);
  });

  /** The rule people most often play wrong: it does not stack. */
  it('keeps the larger pool rather than adding them', () => {
    let play = setTempHp(emptyPlay(), 10);
    play = setTempHp(play, 6);
    expect(play.tempHp).toBe(10);
    play = setTempHp(play, 15);
    expect(play.tempHp).toBe(15);
  });

  it('is not restored by healing', () => {
    let play = setTempHp(emptyPlay(), 10);
    play = damage(play, 10, MAX);
    play = heal(play, 20, MAX);
    expect(play.tempHp).toBe(0);
  });
});

describe('death saves', () => {
  it('counts up to three either way', () => {
    let play = emptyPlay();
    for (let i = 0; i < 5; i++) play = recordDeathSave(play, 'failure');
    expect(play.deathSaves.failures).toBe(3);
  });

  it('is cleared by any healing', () => {
    let play = damage(emptyPlay(), 999, MAX);
    play = recordDeathSave(play, 'failure');
    play = heal(play, 1, MAX);
    expect(play.deathSaves).toEqual({ successes: 0, failures: 0 });
    expect(hpNow(play, MAX)).toBe(1);
  });

  it('counts damage taken at zero as a failed save', () => {
    let play = damage(emptyPlay(), 999, MAX);
    expect(play.deathSaves.failures).toBe(0);
    play = damage(play, 5, MAX);
    expect(play.deathSaves.failures).toBe(1);
  });

  it('counts a critical hit on a downed character as two failures', () => {
    /*
      "If the damage is from a critical hit, you suffer two failures instead."
      The app applied one either way, which is the difference between a
      character on two failures dying to the crit and walking away from it -
      so it decided outcomes, silently, in the direction of surviving.
    */
    let play = damage(emptyPlay(), 999, MAX);
    play = damage(play, 5, MAX, true);
    expect(play.deathSaves.failures).toBe(2);
  });

  it('still stops at three, however the failures arrive', () => {
    let play = damage(emptyPlay(), 999, MAX);
    play = damage(play, 5, MAX, true);
    play = damage(play, 5, MAX, true);
    expect(play.deathSaves.failures).toBe(3);
  });

  it('leaves a standing character alone, crit or not', () => {
    // The rule is about being at zero. A crit on someone upright costs hit
    // points and nothing else.
    const play = damage(emptyPlay(), 5, MAX, true);
    expect(play.deathSaves.failures).toBe(0);
  });

  it('can be cleared by hand', () => {
    const play = recordDeathSave(emptyPlay(), 'success');
    expect(clearDeathSaves(play).deathSaves.successes).toBe(0);
  });
});

describe('a rolled death save', () => {
  const down = () => damage(emptyPlay(), 999, MAX);

  it('succeeds on ten and fails on nine', () => {
    expect(applyDeathSaveRoll(down(), { total: 10, natural: null }, MAX).deathSaves).toEqual({
      successes: 1,
      failures: 0,
    });
    expect(applyDeathSaveRoll(down(), { total: 9, natural: null }, MAX).deathSaves).toEqual({
      successes: 0,
      failures: 1,
    });
  });

  it('stands you up on a natural 20 rather than counting a success', () => {
    // The rule people most often play as "that's one success".
    const play = applyDeathSaveRoll(down(), { total: 20, natural: 20 }, MAX);
    expect(hpNow(play, MAX)).toBe(1);
    expect(play.deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  it('counts a natural 1 as two failures', () => {
    const play = applyDeathSaveRoll(down(), { total: 1, natural: 1 }, MAX);
    expect(play.deathSaves.failures).toBe(2);
  });

  it('kills on a natural 1 with one failure already recorded', () => {
    let play = recordDeathSave(down(), 'failure');
    play = applyDeathSaveRoll(play, { total: 1, natural: 1 }, MAX);
    expect(play.deathSaves.failures).toBe(3);
  });
});

describe('the roll log', () => {
  const roll = (label: string, total: number) => ({
    kind: 'check' as const,
    label,
    total,
    working: `d20: ${total} = ${total}`,
  });

  it('keeps what was rolled, newest first', () => {
    let play = recordRoll(emptyPlay(), roll('Stealth', 14));
    play = recordRoll(play, roll('Perception', 7));
    expect(play.rolls.map((r) => r.label)).toEqual(['Perception', 'Stealth']);
  });

  it('survives a long rest, because resting does not unroll a die', () => {
    const play = recordRoll(emptyPlay(), roll('Initiative', 18));
    expect(longRest(play, { fighter: 5 }).rolls).toHaveLength(1);
  });

  it('does not make a character look spent', () => {
    // A roll is history, not a resource, so `isFresh` must not count it - or
    // the sheet would read "spent this session" after one skill check.
    const play = recordRoll(emptyPlay(), roll('Athletics', 12));
    expect(isFresh(play, MAX)).toBe(true);
  });

  it('can be cleared', () => {
    const play = recordRoll(emptyPlay(), roll('Athletics', 12));
    expect(clearRolls(play).rolls).toEqual([]);
    // Clearing an empty log changes nothing, so React sees the same object.
    const empty = emptyPlay();
    expect(clearRolls(empty)).toBe(empty);
  });
});

describe('hit dice', () => {
  it('spends down and stops at nothing left', () => {
    let play = emptyPlay();
    play = spendHitDie(play, 'fighter', 3);
    play = spendHitDie(play, 'fighter', 3);
    expect(hitDiceLeft(play, 'fighter', 3)).toBe(1);

    play = spendHitDie(play, 'fighter', 3);
    play = spendHitDie(play, 'fighter', 3);
    expect(hitDiceLeft(play, 'fighter', 3)).toBe(0);
  });

  it("keeps a multiclass character's two kinds apart", () => {
    let play = spendHitDie(emptyPlay(), 'fighter', 5);
    expect(hitDiceLeft(play, 'fighter', 5)).toBe(4);
    expect(hitDiceLeft(play, 'rogue', 3)).toBe(3);
  });
});

describe('spell slots', () => {
  it('spends and restores', () => {
    let play = spendSlot(emptyPlay(), 3, 3);
    expect(slotsLeft(play, 3, 3)).toBe(2);
    play = restoreSlot(play, 3);
    expect(slotsLeft(play, 3, 3)).toBe(3);
  });

  it('will not spend past what you have, or restore past full', () => {
    let play = emptyPlay();
    for (let i = 0; i < 5; i++) play = spendSlot(play, 1, 2);
    expect(slotsLeft(play, 1, 2)).toBe(0);
    expect(restoreSlot(restoreSlot(restoreSlot(play, 1), 1), 1).slotsSpent[0]).toBe(0);
  });

  it('counts pact slots apart from the rest', () => {
    let play = spendSlot(emptyPlay(), 3, 3);
    play = spendPact(play, 2);
    expect(play.pactSpent).toBe(1);
    expect(slotsLeft(play, 3, 3)).toBe(2);
    expect(restorePact(play).pactSpent).toBe(0);
  });
});

describe('ammunition', () => {
  const ARROWS = 'arrows';

  it('counts down and back up', () => {
    let play = spendAmmo(emptyPlay(), ARROWS, 20);
    expect(ammoLeft(play, ARROWS, 20)).toBe(19);
    play = spendAmmo(play, ARROWS, 20, 5);
    expect(ammoLeft(play, ARROWS, 20)).toBe(14);
    play = setAmmoLeft(play, ARROWS, 20, 20);
    expect(ammoLeft(play, ARROWS, 20)).toBe(20);
  });

  it('will not shoot arrows you do not have', () => {
    const play = spendAmmo(emptyPlay(), ARROWS, 3, 10);
    expect(ammoLeft(play, ARROWS, 3)).toBe(0);
  });

  /** A minute searching returns half of what you shot, rounded down. */
  it('recovers half off the battlefield, and loses the rest', () => {
    let play = spendAmmo(emptyPlay(), ARROWS, 20, 7);
    play = recoverAmmo(play, ARROWS);
    // Seven shot returns three, and four stay broken on the field.
    expect(ammoLeft(play, ARROWS, 20)).toBe(16);
    // Searching again picks up half of what is still missing: four returns two.
    play = recoverAmmo(play, ARROWS);
    expect(ammoLeft(play, ARROWS, 20)).toBe(18);
    // A single arrow rounds down to nothing, so it never reaches full by itself.
    play = spendAmmo(emptyPlay(), ARROWS, 20, 1);
    expect(ammoLeft(recoverAmmo(play, ARROWS), ARROWS, 20)).toBe(19);
  });

  /**
   * The one thing this must not do. A rest hands back what your body and your
   * magic recover; arrows are neither.
   */
  it('survives a long rest, unlike everything else on the sheet', () => {
    let play = spendAmmo(emptyPlay(), ARROWS, 20, 8);
    play = spendSlot(play, 1, 2);
    play = longRest(play, { fighter: 5 });
    expect(ammoLeft(play, ARROWS, 20)).toBe(12);
    expect(slotsLeft(play, 1, 2)).toBe(2);
  });

  it('restocks to full, for when you have been to a town', () => {
    const play = restockAmmo(spendAmmo(emptyPlay(), ARROWS, 20, 8), ARROWS);
    expect(ammoLeft(play, ARROWS, 20)).toBe(20);
    expect(play.ammoSpent).toEqual({});
  });

  /** Or the sheet would read "spent this session" forever with no cure. */
  it('does not make the sheet look unrested', () => {
    expect(isFresh(spendAmmo(emptyPlay(), ARROWS, 20, 8), MAX)).toBe(true);
  });
});

describe('Font of Magic', () => {
  const PTS = 'sorcerer:sorcery-points';
  // A Sorcerer 5 has five sorcery points and slots 4/3/2.
  const MAX_PTS = 5;

  it('buys a slot at the rate the SRD charges', () => {
    const play = createSlotWithPoints(emptyPlay(), 3, PTS, MAX_PTS);
    expect(resourceLeft(play, PTS, MAX_PTS)).toBe(0);
    expect(slotsTotal(play, 3, 2)).toBe(3);
    expect(slotsLeft(play, 3, 2)).toBe(3);
  });

  it('refuses when the points are not there, rather than going negative', () => {
    const broke = createSlotWithPoints(emptyPlay(), 5, PTS, MAX_PTS);
    expect(broke).toEqual(emptyPlay());
  });

  it('will not make a slot above 5th, because Font of Magic cannot', () => {
    expect(createSlotWithPoints(emptyPlay(), 6, PTS, 20)).toEqual(emptyPlay());
  });

  it('gives a burnt slot its own level back in points', () => {
    let play = spendResource(emptyPlay(), PTS, MAX_PTS, 5);
    expect(resourceLeft(play, PTS, MAX_PTS)).toBe(0);
    play = convertSlotToPoints(play, 3, 2, PTS);
    expect(resourceLeft(play, PTS, MAX_PTS)).toBe(3);
    expect(slotsLeft(play, 3, 2)).toBe(1);
  });

  it('never lets the exchange run at a profit', () => {
    // Five points buys a 3rd-level slot; burning that slot returns three. The
    // rules are lossy on purpose and the tracker must not launder it.
    let play = createSlotWithPoints(emptyPlay(), 3, PTS, MAX_PTS);
    play = convertSlotToPoints(play, 3, 2, PTS);
    expect(resourceLeft(play, PTS, MAX_PTS)).toBe(3);
    expect(slotsLeft(play, 3, 2)).toBe(2);
  });

  it('caps points at your maximum rather than banking the excess', () => {
    const play = convertSlotToPoints(emptyPlay(), 5, 1, PTS);
    expect(resourceLeft(play, PTS, MAX_PTS)).toBe(MAX_PTS);
    expect(slotsLeft(play, 5, 1)).toBe(0);
  });

  it('refuses to burn a slot that is already spent', () => {
    const spent = spendSlot(emptyPlay(), 1, 1);
    expect(convertSlotToPoints(spent, 1, 1, PTS)).toEqual(spent);
  });

  it('lets a made slot be spent like any other', () => {
    let play = createSlotWithPoints(emptyPlay(), 1, PTS, MAX_PTS);
    play = spendSlot(play, 1, 4);
    play = spendSlot(play, 1, 4);
    play = spendSlot(play, 1, 4);
    play = spendSlot(play, 1, 4);
    expect(slotsLeft(play, 1, 4)).toBe(1);
    play = spendSlot(play, 1, 4);
    expect(slotsLeft(play, 1, 4)).toBe(0);
    // And the sixth does nothing, because the fifth was the made one.
    expect(spendSlot(play, 1, 4)).toEqual(play);
  });

  it('takes made slots away on a long rest rather than refilling them', () => {
    let play = createSlotWithPoints(emptyPlay(), 2, PTS, MAX_PTS);
    expect(slotsTotal(play, 2, 3)).toBe(4);
    play = longRest(play, { sorcerer: 5 });
    expect(slotsTotal(play, 2, 3)).toBe(3);
    expect(resourceLeft(play, PTS, MAX_PTS)).toBe(MAX_PTS);
  });

  it('counts a made slot as something to reset', () => {
    expect(isFresh(createSlotWithPoints(emptyPlay(), 1, PTS, MAX_PTS), MAX)).toBe(false);
  });
});

describe('resting', () => {
  /**
   * The part a tracker most easily gets backwards: hit dice are spent *during*
   * a short rest, not handed back by one.
   */
  it('gives a short rest back Pact Magic and nothing else', () => {
    let play = damage(emptyPlay(), 20, MAX);
    play = spendSlot(play, 1, 4);
    play = spendPact(play, 2);
    play = spendHitDie(play, 'warlock', 5);

    const rested = shortRest(play);
    expect(rested.pactSpent).toBe(0);
    expect(hpNow(rested, MAX)).toBe(MAX - 20);
    expect(rested.slotsSpent[0]).toBe(1);
    expect(hitDiceLeft(rested, 'warlock', 5)).toBe(4);
  });

  it('gives a long rest back hit points and every slot', () => {
    let play = damage(emptyPlay(), 40, MAX);
    play = spendSlot(play, 2, 3);
    play = spendPact(play, 2);
    play = setTempHp(play, 12);

    const rested = longRest(play, { wizard: 9 });
    expect(hpNow(rested, MAX)).toBe(MAX);
    expect(rested.slotsSpent).toEqual([]);
    expect(rested.pactSpent).toBe(0);
    expect(rested.tempHp).toBe(0);
  });

  it('returns half your hit dice, not all of them', () => {
    let play = emptyPlay();
    for (let i = 0; i < 8; i++) play = spendHitDie(play, 'fighter', 10);
    expect(hitDiceLeft(play, 'fighter', 10)).toBe(2);

    // Ten total dice, so five come back: eight spent becomes three.
    const rested = longRest(play, { fighter: 10 });
    expect(hitDiceLeft(rested, 'fighter', 10)).toBe(7);
  });

  it('always returns at least one die, even at level 1', () => {
    const play = spendHitDie(emptyPlay(), 'wizard', 1);
    expect(hitDiceLeft(longRest(play, { wizard: 1 }), 'wizard', 1)).toBe(1);
  });

  it('gives dice back to whichever class has spent the most', () => {
    let play = emptyPlay();
    for (let i = 0; i < 4; i++) play = spendHitDie(play, 'fighter', 6);
    play = spendHitDie(play, 'rogue', 4);

    // Ten dice total, so five recovered - more than the five spent.
    const rested = longRest(play, { fighter: 6, rogue: 4 });
    expect(rested.hitDiceSpent.fighter).toBe(0);
    expect(rested.hitDiceSpent.rogue).toBe(0);
  });

  it('clears death saves on either rest', () => {
    const play = recordDeathSave(emptyPlay(), 'failure');
    expect(longRest(play, { fighter: 5 }).deathSaves.failures).toBe(0);
  });
});

describe('isFresh', () => {
  it('is true for an untouched character and false once anything is spent', () => {
    expect(isFresh(emptyPlay(), MAX)).toBe(true);
    expect(isFresh(damage(emptyPlay(), 1, MAX), MAX)).toBe(false);
    expect(isFresh(spendSlot(emptyPlay(), 1, 2), MAX)).toBe(false);
    expect(isFresh(spendHitDie(emptyPlay(), 'fighter', 2), MAX)).toBe(false);
    expect(isFresh(setTempHp(emptyPlay(), 5), MAX)).toBe(false);
  });

  it('is true again after a long rest', () => {
    let play = damage(emptyPlay(), 30, MAX);
    play = spendSlot(play, 1, 4);
    expect(isFresh(longRest(play, { fighter: 5 }), MAX)).toBe(true);
  });
});

describe('class resources', () => {
  const RAGE = 'barbarian:rage';
  const KI = 'monk:ki';

  it('spends one use at a time and stops at empty', () => {
    let play = spendResource(emptyPlay(), RAGE, 3);
    expect(resourceLeft(play, RAGE, 3)).toBe(2);

    for (let i = 0; i < 5; i++) play = spendResource(play, RAGE, 3);
    expect(resourceLeft(play, RAGE, 3)).toBe(0);
  });

  it('spends a pool several points at a time', () => {
    // Lay on Hands is a pool of hit points, not a count of uses.
    const play = spendResource(emptyPlay(), 'paladin:lay-on-hands', 25, 8);
    expect(resourceLeft(play, 'paladin:lay-on-hands', 25)).toBe(17);
  });

  it('restores without going past full', () => {
    let play = spendResource(emptyPlay(), RAGE, 3, 2);
    play = restoreResource(play, RAGE);
    expect(resourceLeft(play, RAGE, 3)).toBe(2);

    play = restoreResource(restoreResource(restoreResource(play, RAGE), RAGE), RAGE);
    expect(resourceLeft(play, RAGE, 3)).toBe(3);
  });

  it('can be set directly, for typing a pool rather than clicking it down', () => {
    let play = setResourceSpent(emptyPlay(), KI, 7, 11);
    expect(resourceLeft(play, KI, 11)).toBe(4);
    // And it never lands outside the pool.
    play = setResourceSpent(play, KI, 99, 11);
    expect(resourceLeft(play, KI, 11)).toBe(0);
    play = setResourceSpent(play, KI, -5, 11);
    expect(resourceLeft(play, KI, 11)).toBe(11);
  });

  it('keeps two classes resources apart', () => {
    let play = spendResource(emptyPlay(), 'cleric:channel-divinity', 2);
    play = spendResource(play, 'paladin:channel-divinity-paladin', 1);
    expect(resourceLeft(play, 'cleric:channel-divinity', 2)).toBe(1);
    expect(resourceLeft(play, 'paladin:channel-divinity-paladin', 1)).toBe(0);
  });

  describe('resting', () => {
    it('gives a short rest back only the resources that recharge on one', () => {
      let play = spendResource(emptyPlay(), RAGE, 3);
      play = spendResource(play, KI, 11, 4);

      // Ki recharges short, Rage does not.
      const rested = shortRest(play, [KI]);
      expect(resourceLeft(rested, KI, 11)).toBe(11);
      expect(resourceLeft(rested, RAGE, 3)).toBe(2);
    });

    it('gives a long rest back everything, whatever its own recharge', () => {
      let play = spendResource(emptyPlay(), RAGE, 3, 3);
      play = spendResource(play, KI, 11, 11);

      const rested = longRest(play, { barbarian: 5 });
      expect(resourceLeft(rested, RAGE, 3)).toBe(3);
      expect(resourceLeft(rested, KI, 11)).toBe(11);
    });

    it('still returns Pact Magic on a short rest with no class resources', () => {
      const play = spendPact(emptyPlay(), 2);
      expect(shortRest(play).pactSpent).toBe(0);
    });
  });

  it('counts as spent for isFresh', () => {
    expect(isFresh(spendResource(emptyPlay(), RAGE, 3), MAX)).toBe(false);
    expect(isFresh(longRest(spendResource(emptyPlay(), RAGE, 3), { barbarian: 5 }), MAX)).toBe(true);
  });
});

describe('conditions and exhaustion', () => {
  /**
   * Play tracking covered everything with a number on it and none of the
   * fifteen states that change what you can do on your turn. Nobody forgets
   * they are on 6 hit points; everybody forgets prone.
   */
  it('toggles a condition on and off', () => {
    const on = toggleCondition(emptyPlay(), 'prone');
    expect(on.conditions).toEqual(['prone']);
    expect(toggleCondition(on, 'prone').conditions).toEqual([]);
  });

  it('holds several at once', () => {
    let play = emptyPlay();
    for (const id of ['prone', 'poisoned', 'frightened']) play = toggleCondition(play, id);
    expect(play.conditions).toHaveLength(3);
  });

  it('clamps exhaustion to the six-level track', () => {
    expect(setExhaustion(emptyPlay(), 9).exhaustion).toBe(6);
    expect(setExhaustion(emptyPlay(), -2).exhaustion).toBe(0);
  });

  /** Each level keeps the ones below it, which is the part people get wrong. */
  it('reports every effect at and below the level reached', () => {
    // §51 gave exhaustion a ruleset, because the two editions do it
    // completely differently. This test is the 2014 ladder it always was.
    expect(exhaustionLines(0, '2014')).toEqual([]);
    expect(exhaustionLines(3, '2014')).toHaveLength(3);
    expect(exhaustionLines(3, '2014')[1]).toMatch(/speed is halved/i);
    // And the same level under 2024 is one flat penalty, not three rungs.
    expect(exhaustionLines(3, '2024')).toHaveLength(2);
    expect(exhaustionLines(3, '2024')[0]).toMatch(/−6 on every D20 test/);
  });

  /**
   * A long rest removes one level of exhaustion, not all of it - and it does
   * not touch conditions, most of which need a save or a spell to end.
   */
  it('a long rest removes one level of exhaustion and leaves conditions alone', () => {
    const play = { ...setExhaustion(emptyPlay(), 3), conditions: ['poisoned'] };
    const rested = longRest(play, { fighter: 5 });
    expect(rested.exhaustion).toBe(2);
    expect(rested.conditions).toEqual(['poisoned']);
  });

  it('counts a condition as something spent', () => {
    expect(isFresh(toggleCondition(emptyPlay(), 'prone'), 20)).toBe(false);
    expect(isFresh(setExhaustion(emptyPlay(), 1), 20)).toBe(false);
  });
});

describe('a multiclass dip', () => {
  /** The one tool the multiclassing table grants outright. */
  it('brings thieves’ tools from a Rogue and nothing from a Fighter', () => {
    const withRogue = deriveBuild({
      ...emptyBuild(),
      classes: [
        { classId: 'fighter', level: 5, subclassId: 'champion' },
        { classId: 'rogue', level: 1 },
      ],
    });
    expect(withRogue.proficiencies.tools).toContain("Thieves' tools");

    const withoutRogue = deriveBuild({
      ...emptyBuild(),
      classes: [
        { classId: 'rogue', level: 5, subclassId: 'thief' },
        { classId: 'fighter', level: 1 },
      ],
    });
    // A Rogue who *starts* as one gets them from the class, not the dip - and a
    // Fighter dip brings no tools at all.
    expect(withoutRogue.proficiencies.tools).not.toContain('Smith’s tools');
  });
});

describe('the exhaustion track', () => {
  /**
   * A track, not a pool: clicking the fourth circle means "I am on four", not
   * "add one to whatever I had". The first browser pass caught this - every pip
   * incremented by one, so reaching level 4 took four clicks on any circle.
   */
  it('sets the level clicked, and steps down off the one you are on', () => {
    expect(setExhaustion(emptyPlay(), 4).exhaustion).toBe(4);
    expect(setExhaustion(setExhaustion(emptyPlay(), 4), 3).exhaustion).toBe(3);
  });
});

/**
 * The action economy.
 *
 * Four things, and the only interesting rules are about *when* they come back
 * and how Dash interacts with what you have already walked. Both are things a
 * table gets wrong at speed, which is the whole argument for tracking them.
 */
describe('a turn', () => {
  const SPEED = 30;

  it('starts with everything available', () => {
    const play = emptyPlay();
    expect(play.turn).toEqual({
      action: false,
      bonusAction: false,
      reaction: false,
      moved: 0,
      dashes: 0,
    });
    expect(movementLeft(play, SPEED)).toBe(30);
  });

  it('spends and un-spends each slot', () => {
    let play = toggleTurnSlot(emptyPlay(), 'bonusAction');
    expect(play.turn).toMatchObject({ action: false, bonusAction: true, reaction: false });
    play = toggleTurnSlot(play, 'bonusAction');
    expect(play.turn.bonusAction).toBe(false);
  });

  it('gives the reaction back at the start of your turn, not the end of it', () => {
    // The rule tables misplay most often. There is deliberately no "end turn"
    // here: a reaction spent between your turns is gone until the next one
    // begins, and an end-of-turn reset would hand it back a beat early.
    const spent = toggleTurnSlot(toggleTurnSlot(emptyPlay(), 'action'), 'reaction');
    expect(newTurn(spent).turn.reaction).toBe(false);
    expect(newTurn(spent).turn.action).toBe(false);
  });

  it('counts movement down and back up, stopping at both ends', () => {
    let play = moveBy(emptyPlay(), 20, SPEED);
    expect(movementLeft(play, SPEED)).toBe(10);
    play = moveBy(play, 25, SPEED);
    expect(movementLeft(play, SPEED)).toBe(0);
    play = moveBy(play, -100, SPEED);
    expect(movementLeft(play, SPEED)).toBe(30);
  });

  it('adds your speed again on a Dash rather than doubling what is left', () => {
    // Twenty feet in, a Dash leaves 40 - not 20. Doubling the remainder is the
    // intuitive reading and the wrong one.
    let play = moveBy(emptyPlay(), 20, SPEED);
    play = dash(play);
    expect(movementBudget(play, SPEED)).toBe(60);
    expect(movementLeft(play, SPEED)).toBe(40);
  });

  it('does not spend anything for the Dash itself', () => {
    // Dash is an action for most, a bonus action with Cunning Action, and
    // free for a Tabaxi. Charging one of those would be wrong twice.
    expect(dash(emptyPlay()).turn).toMatchObject({ action: false, bonusAction: false });
  });

  it('measures against the speed it is handed', () => {
    // Heavy armor you are too weak for, or Boots of Speed - the tracker reads
    // the same number the sheet prints rather than a base speed.
    expect(movementLeft(emptyPlay(), 20)).toBe(20);
    expect(movementLeft(dash(emptyPlay()), 40)).toBe(80);
  });

  it('is over when you rest', () => {
    const mid = moveBy(toggleTurnSlot(emptyPlay(), 'action'), 15, SPEED);
    expect(turnSpent(shortRest(mid).turn)).toBe(false);
    expect(turnSpent(longRest(mid, { fighter: 3 }).turn)).toBe(false);
  });

  it('counts as spent for the rest hint', () => {
    expect(isFresh(toggleTurnSlot(emptyPlay(), 'reaction'), MAX)).toBe(false);
    expect(isFresh(moveBy(emptyPlay(), 5, SPEED), MAX)).toBe(false);
  });
});

/**
 * Counters the app has no table for.
 *
 * Piety is the case that shapes the design: it is a score rather than a pool,
 * it counts up rather than down, and no rest touches it. A model that only
 * knew how to spend Ki would get all three wrong.
 */
describe('your own counters', () => {
  const POOL: CustomResource = {
    id: 'pool', name: 'Wrath', max: 4, startsAt: 'full', recharge: 'short',
  };
  const PIETY: CustomResource = {
    id: 'piety', name: 'Piety', max: 50, startsAt: 'empty', recharge: 'none',
  };

  it('starts a pool full and a score at nothing', () => {
    expect(customValue(emptyPlay(), POOL)).toBe(4);
    expect(customValue(emptyPlay(), PIETY)).toBe(0);
  });

  it('steps both ways within its bounds', () => {
    expect(customValue(stepCustom(emptyPlay(), POOL, -1), POOL)).toBe(3);
    expect(customValue(stepCustom(emptyPlay(), POOL, -9), POOL)).toBe(0);
    expect(customValue(stepCustom(emptyPlay(), PIETY, 3), PIETY)).toBe(3);
    expect(customValue(stepCustom(emptyPlay(), PIETY, 99), PIETY)).toBe(50);
  });

  it('recharges a short-rest pool on a short rest', () => {
    const spent = stepCustom(emptyPlay(), POOL, -3);
    expect(customValue(shortRest(spent, [], [POOL]), POOL)).toBe(4);
  });

  it('leaves a piety score alone through both rests', () => {
    // The failure this guards is a long rest wiping a campaign's worth of
    // progress, which is what happens if it clears every counter it can see.
    const earned = stepCustom(emptyPlay(), PIETY, 12);
    expect(customValue(shortRest(earned, [], [PIETY]), PIETY)).toBe(12);
    expect(customValue(longRest(earned, { cleric: 5 }, [PIETY]), PIETY)).toBe(12);
  });

  it('leaves a long-rest counter alone on a short rest', () => {
    const daily: CustomResource = { ...POOL, id: 'daily', recharge: 'long' };
    const spent = stepCustom(emptyPlay(), daily, -2);
    expect(customValue(shortRest(spent, [], [daily]), daily)).toBe(2);
    expect(customValue(longRest(spent, { cleric: 5 }, [daily]), daily)).toBe(4);
  });

  it('does not make the sheet claim something was spent', () => {
    // A score that counts up is meant to sit above nothing, so 12 piety is
    // progress rather than "spent this session".
    expect(isFresh(stepCustom(emptyPlay(), PIETY, 12), MAX)).toBe(true);
  });
});

describe('concentration', () => {
  it('holds one spell and names what a second cast dropped', () => {
    const first = startConcentration(emptyPlay(), 'Bless');
    expect(first.play.concentratingOn).toBe('Bless');
    expect(first.dropped).toBeNull();

    const second = startConcentration(first.play, 'Hold Person');
    expect(second.play.concentratingOn).toBe('Hold Person');
    // The half of the rule tables forget, handed back to be said out loud.
    expect(second.dropped).toBe('Bless');
  });

  it('recasting the same spell drops nothing', () => {
    const first = startConcentration(emptyPlay(), 'Bless');
    expect(startConcentration(first.play, 'Bless').dropped).toBeNull();
  });

  it('breaks cleanly and does not survive a long rest', () => {
    const { play } = startConcentration(emptyPlay(), 'Bless');
    expect(breakConcentration(play).concentratingOn).toBeUndefined();
    expect(longRest(play, {}).concentratingOn).toBeUndefined();
  });

  it('demands the right save: 10, or half the damage when that is worse', () => {
    expect(concentrationDc(7)).toBe(10);
    expect(concentrationDc(20)).toBe(10);
    expect(concentrationDc(22)).toBe(11);
    expect(concentrationDc(31)).toBe(15);
  });
});

describe('condition clocks', () => {
  it('burns a round and takes the condition off at nothing', () => {
    let play = addTimedCondition(emptyPlay(), 'stunned', 2);
    expect(play.conditions).toContain('stunned');

    play = tickConditions(play);
    expect(play.conditions).toContain('stunned');
    expect(play.conditionTimers?.stunned).toBe(1);

    play = tickConditions(play);
    expect(play.conditions).not.toContain('stunned');
  });

  it('leaves untimed conditions alone for ever', () => {
    let play = toggleCondition(emptyPlay(), 'prone');
    for (let i = 0; i < 5; i++) play = tickConditions(play);
    expect(play.conditions).toContain('prone');
  });

  it('clears the clock when the condition is toggled off by hand', () => {
    const timed = addTimedCondition(emptyPlay(), 'stunned', 3);
    const off = toggleCondition(timed, 'stunned');
    expect(off.conditions).not.toContain('stunned');
    expect(off.conditionTimers?.stunned).toBeUndefined();
  });
});

describe('the bonus-action spell rule', () => {
  const fresh = () => emptyPlay();

  it('allows anything on a turn where nothing has been cast', () => {
    expect(maySpend(fresh(), { level: 3, castingTime: 'action' })).toBe(true);
    expect(maySpend(fresh(), { level: 1, castingTime: 'bonus' })).toBe(true);
  });

  it('bars a second spell after a bonus-action one, cantrips excepted', () => {
    const after = recordSpellCast(fresh(), 'bonus');
    expect(maySpend(after, { level: 1, castingTime: 'action' })).toBe(false);
    // "except a cantrip with a casting time of 1 action" - the exception is
    // the whole reason a Quickened caster still gets to throw a Fire Bolt.
    expect(maySpend(after, { level: 0, castingTime: 'action' })).toBe(true);
  });

  it('bars a bonus-action spell after ANY spell, which is the half people miss', () => {
    // The restriction fires in either order: casting Fireball and then
    // Healing Word breaks it just as surely as the other way round.
    const after = recordSpellCast(fresh(), 'action');
    expect(maySpend(after, { level: 1, castingTime: 'bonus' })).toBe(false);
  });

  it('leaves reactions alone, because they happen on somebody else’s turn', () => {
    const after = recordSpellCast(fresh(), 'bonus');
    expect(maySpend(after, { level: 1, castingTime: 'reaction' })).toBe(true);
  });

  it('forgets all of it when the turn does', () => {
    const after = newTurn(recordSpellCast(fresh(), 'bonus'));
    expect(after.turn.spellCast).toBeFalsy();
    expect(maySpend(after, { level: 1, castingTime: 'bonus' })).toBe(true);
  });
});

describe('heroic inspiration', () => {
  it('is held or not held, and never two', () => {
    const held = setInspiration(emptyPlay(), true);
    expect(held.inspiration).toBe(true);
    expect(setInspiration(held, true).inspiration).toBe(true);
    // Spent, and gone rather than stored as false - absent is the default
    // every character who has never been given one carries.
    expect(setInspiration(held, false).inspiration).toBeUndefined();
  });

  it('is not something a rest hands out by itself', () => {
    // The 2024 Human's trait grants it and a DM grants it; a long rest on its
    // own does not, so nothing here should invent one.
    expect(longRest(emptyPlay(), { fighter: 5 }).inspiration).toBeUndefined();
  });
});

