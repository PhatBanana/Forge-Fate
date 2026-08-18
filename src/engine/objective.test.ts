import { describe, expect, it } from 'vitest';
import {
  chronicleLine,
  describeObjective,
  judgeObjective,
  progressLine,
  toggleMark,
} from './objective';
import type { FightFacts, Objective } from './objective';
import type { Square } from '../encounter';

/**
 * §89. The judge, against hand-drawn fights.
 *
 * The stance under every case: the app notices, the DM rules. Nothing here
 * ends anything, a loss is never latched (every loss is a state a fight can
 * come back from), and only a win is remembered - by the caller, whose latch
 * is the `wonAt` these tests hand in.
 */

const at = (x: number, y: number): Square => ({ x, y });
const facts = (over: Partial<FightFacts> = {}): FightFacts => {
  const party = over.party ?? [at(1, 1)];
  return { round: 1, standing: party.length, party, ...over };
};

describe('holding the line', () => {
  const hold: Objective = { kind: 'hold', rounds: 3 };

  it('is open through the rounds being held', () => {
    expect(judgeObjective(hold, facts({ round: 1 })).state).toBe('open');
    expect(judgeObjective(hold, facts({ round: 3 })).state).toBe('open');
  });

  it('is won when round N+1 begins - N full rounds stood', () => {
    const verdict = judgeObjective(hold, facts({ round: 4 }));
    expect(verdict.state).toBe('won');
    expect(verdict).toMatchObject({ line: expect.stringMatching(/line holds.*3 full rounds/i) });
  });

  it('is lost while nobody stands, and only while', () => {
    expect(judgeObjective(hold, facts({ round: 2, party: [] })).state).toBe('lost');
    // A Revivify changes the facts; the verdict follows them - no latch.
    expect(judgeObjective(hold, facts({ round: 2 })).state).toBe('open');
  });

  it('judges nothing before the fight starts - deployment is deployment', () => {
    expect(judgeObjective(hold, facts({ round: 0, party: [] })).state).toBe('open');
  });

  it('holds in a fight with no tokens at all - the tracker mode §12 shipped', () => {
    expect(
      judgeObjective({ kind: 'hold', rounds: 2 }, { round: 3, standing: 2, party: [] }).state,
    ).toBe('won');
  });
});

describe('reaching the mark', () => {
  const reach: Objective = { kind: 'reach', squares: [at(5, 5), at(6, 5)] };

  it('is open while nobody stands on it', () => {
    expect(judgeObjective(reach, facts({ party: [at(1, 1)] })).state).toBe('open');
  });

  it('is won the moment a living party member stands on any marked square', () => {
    expect(judgeObjective(reach, facts({ party: [at(9, 9), at(6, 5)] })).state).toBe('won');
  });

  it('stays won once latched, whoever stepped off - the caller wrote wonAt', () => {
    const latched: Objective = { ...reach, wonAt: 2 };
    expect(judgeObjective(latched, facts({ party: [at(0, 0)] })).state).toBe('won');
  });
});

describe('protecting the ward', () => {
  const protect: Objective = { kind: 'protect', combatantId: 'vip' };

  it('is open while they stand, and never engine-won', () => {
    expect(judgeObjective(protect, facts({ wardStanding: true })).state).toBe('open');
  });

  it('wavers rather than loses when they drop - nought is not death', () => {
    expect(judgeObjective(protect, facts({ wardStanding: false })).state).toBe('wavering');
    // Healed back up, the warning clears: the table rules on the corpse case.
    expect(judgeObjective(protect, facts({ wardStanding: true })).state).toBe('open');
  });

  it('is open when the ward has left the fight entirely', () => {
    expect(judgeObjective(protect, facts({})).state).toBe('open');
  });
});

describe('the words', () => {
  it('describes each kind the way the Prep drawer authored it', () => {
    expect(describeObjective({ kind: 'hold', rounds: 1 })).toBe('Hold the line for 1 round');
    expect(describeObjective({ kind: 'reach', squares: [at(1, 1)] })).toBe(
      'Reach the mark (1 square)',
    );
    expect(describeObjective({ kind: 'protect', combatantId: 'x' }, 'Sera')).toBe(
      'Sera must stand',
    );
  });

  it('keeps the flag short and counting', () => {
    expect(progressLine({ kind: 'hold', rounds: 5 }, facts({ round: 3 }))).toBe('round 3 of 5');
    expect(progressLine({ kind: 'reach', squares: [at(5, 5)] }, facts())).toBe('the mark waits');
    expect(
      progressLine({ kind: 'protect', combatantId: 'x' }, facts({ wardStanding: false }), 'Sera'),
    ).toBe('Sera is down!');
  });

  it('writes the chronicle clause from how it actually ended', () => {
    expect(
      chronicleLine({ kind: 'hold', rounds: 3, wonAt: 4 }, facts({ round: 5 })),
    ).toBe('Hold the line for 3 rounds — done in round 4');
    expect(chronicleLine({ kind: 'hold', rounds: 3 }, facts({ round: 2 }))).toBe(
      'Hold the line for 3 rounds — not done',
    );
    expect(
      chronicleLine({ kind: 'protect', combatantId: 'x' }, facts({ wardStanding: true }), 'Sera'),
    ).toBe('Sera must stand — they stood');
    expect(
      chronicleLine({ kind: 'protect', combatantId: 'x' }, facts({ wardStanding: false }), 'Sera'),
    ).toBe('Sera must stand — they fell');
  });
});

describe('painting the mark', () => {
  it('adds a fresh square and removes a painted one', () => {
    const one = toggleMark([], at(3, 3));
    expect(one).toEqual([at(3, 3)]);
    expect(toggleMark(one, at(3, 3))).toEqual([]);
    expect(toggleMark(one, at(4, 3))).toEqual([at(3, 3), at(4, 3)]);
  });
});
