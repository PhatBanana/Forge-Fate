import { describe, expect, it } from 'vitest';
import { circumstances, describeOdds, oddsFor } from './advantage';
import type { Exchange } from './advantage';

const exchange = (
  attacker: string[] = [],
  target: string[] = [],
  extra: Partial<Exchange> = {},
): Exchange => ({
  attacker: { conditions: attacker },
  target: { conditions: target },
  adjacent: true,
  ...extra,
});

const modeOf = (e: Exchange) => oddsFor(e).mode;

describe('an ordinary swing', () => {
  it('rolls one die and says nothing about it', () => {
    const odds = oddsFor(exchange());
    expect(odds.mode).toBe('normal');
    expect(odds.reasons).toEqual([]);
    // No parenthesis on a plain attack: the log stays readable.
    expect(describeOdds(odds)).toBe('');
  });
});

describe('prone, which cuts both ways', () => {
  it('helps somebody standing over them', () => {
    expect(modeOf(exchange([], ['prone'], { adjacent: true }))).toBe('advantage');
  });

  it('hinders somebody shooting at them from across the room', () => {
    // The half of this rule everyone forgets, and the reason prone is a
    // tactical choice rather than a strict downgrade.
    expect(modeOf(exchange([], ['prone'], { adjacent: false }))).toBe('disadvantage');
  });

  it('hinders the one who is down, whoever they swing at', () => {
    expect(modeOf(exchange(['prone'], []))).toBe('disadvantage');
  });

  it('cancels when both of them are on the floor and in reach', () => {
    // Attacker prone is disadvantage; target prone and adjacent is advantage.
    const odds = oddsFor(exchange(['prone'], ['prone'], { adjacent: true }));
    expect(odds.mode).toBe('normal');
    expect(odds.cancelled).toBe(true);
  });
});

describe('the rest of what the app can see', () => {
  it('gives the unseen attacker the advantage it has always claimed', () => {
    const odds = oddsFor({ ...exchange(), attacker: { conditions: [], hidden: true } });
    expect(odds.mode).toBe('advantage');
    expect(odds.reasons[0].label).toBe('unseen attacker');
  });

  it('helps against the helpless', () => {
    for (const id of ['restrained', 'blinded', 'paralyzed', 'stunned', 'unconscious', 'petrified']) {
      expect(modeOf(exchange([], [id]))).toBe('advantage');
    }
  });

  it('hinders the hampered', () => {
    for (const id of ['restrained', 'blinded', 'poisoned']) {
      expect(modeOf(exchange([id], []))).toBe('disadvantage');
    }
  });

  it('hinders an attack on something it cannot see', () => {
    expect(modeOf(exchange([], ['invisible']))).toBe('disadvantage');
  });

  it('leaves frightened alone, because it cannot be applied correctly', () => {
    // Frightened costs advantage only while the *source* of the fear is in
    // sight, and nothing records what frightened you. A rule this app cannot
    // apply right is one it should not apply at all.
    expect(circumstances(exchange(['frightened'], ['frightened']))).toEqual([]);
  });

  it('ignores conditions with no bearing on a swing', () => {
    expect(circumstances(exchange(['charmed', 'deafened'], ['charmed', 'deafened']))).toEqual([]);
  });
});

describe('the rule that fifth edition actually has', () => {
  it('does not stack: three advantages are still one', () => {
    const odds = oddsFor({
      ...exchange([], ['restrained', 'blinded', 'stunned']),
      attacker: { conditions: [], hidden: true },
    });
    expect(odds.mode).toBe('advantage');
    // All four are still reported, because a DM wants to see them.
    expect(odds.reasons.length).toBeGreaterThan(3);
  });

  it('cancels however many of each there are', () => {
    const odds = oddsFor(exchange(['prone', 'poisoned'], ['restrained', 'blinded']));
    expect(odds.mode).toBe('normal');
    expect(odds.cancelled).toBe(true);
  });
});

describe('what the log says', () => {
  it('names the outcome and the reason', () => {
    expect(describeOdds(oddsFor(exchange(['prone'], [])))).toBe(
      'disadvantage: attacking from the floor',
    );
  });

  it('says so when they cancelled, and lists both', () => {
    const said = describeOdds(oddsFor(exchange(['prone'], ['restrained'])));
    expect(said).toMatch(/^straight: /);
    expect(said).toContain('restrained');
    expect(said).toContain('floor');
    expect(said).toMatch(/cancel$/);
  });
});
