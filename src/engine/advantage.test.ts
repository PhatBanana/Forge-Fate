import { describe, expect, it } from 'vitest';
import {
  circumstances,
  describeOdds,
  mayApproach,
  mayAttack,
  oddsFor,
  speedUnderExhaustion,
} from './advantage';
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

  it('leaves frightened alone when neither half of the rule can be checked', () => {
    // Frightened needs a recorded source *and* a way to ask about sight. This
    // exchange has neither, so it stays quiet - see the frightened describe
    // below for the cases where it does apply.
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

describe('frightened, which needed conditions to grow a source', () => {
  const scared = (sourceId?: string, canSee?: (id: string) => boolean): Exchange => ({
    attacker: {
      conditions: ['frightened'],
      ...(sourceId ? { conditionSources: { frightened: sourceId } } : {}),
    },
    target: { conditions: [] },
    adjacent: true,
    ...(canSee ? { canSee } : {}),
  });

  it('costs advantage while the thing that scared you is watching', () => {
    const odds = oddsFor(scared('dragon', (id) => id === 'dragon'));
    expect(odds.mode).toBe('disadvantage');
    expect(odds.reasons[0].label).toBe('frightened, and it is watching');
  });

  it('costs nothing once you break line of sight', () => {
    // The half that makes frightened a positioning problem rather than a
    // flat penalty: get the pillar between you and it.
    expect(oddsFor(scared('dragon', () => false)).mode).toBe('normal');
  });

  it('stays quiet when nobody recorded what frightened them', () => {
    expect(oddsFor(scared(undefined, () => true)).reasons).toEqual([]);
  });

  it('stays quiet when the caller has no way to ask about sight', () => {
    // Better silent than wrong: a rule applied often is not a rule applied
    // correctly.
    expect(oddsFor(scared('dragon')).reasons).toEqual([]);
  });

  it('cancels against advantage like anything else', () => {
    const odds = oddsFor({
      ...scared('dragon', (id) => id === 'dragon'),
      attacker: {
        conditions: ['frightened'],
        conditionSources: { frightened: 'dragon' },
        hidden: true,
      },
    });
    expect(odds.mode).toBe('normal');
    expect(odds.cancelled).toBe(true);
  });
});

describe('frightened on the move', () => {
  const at = (id: string) => (id === 'dragon' ? { x: 10, y: 10 } : undefined);
  const scaredMover = {
    conditions: ['frightened'],
    conditionSources: { frightened: 'dragon' },
  };

  it('refuses a step toward the thing you are afraid of', () => {
    expect(mayApproach(scaredMover, { x: 5, y: 10 }, { x: 6, y: 10 }, at)).toBe(false);
  });

  it('allows retreat, and allows staying the same distance', () => {
    expect(mayApproach(scaredMover, { x: 5, y: 10 }, { x: 4, y: 10 }, at)).toBe(true);
    // Circling at range is not approaching.
    expect(mayApproach(scaredMover, { x: 5, y: 10 }, { x: 5, y: 9 }, at)).toBe(true);
  });

  it('does not restrain somebody who is not frightened', () => {
    expect(mayApproach({ conditions: [] }, { x: 5, y: 10 }, { x: 6, y: 10 }, at)).toBe(true);
  });

  it('does not restrain when the source is not on the map', () => {
    expect(mayApproach(scaredMover, { x: 5, y: 10 }, { x: 6, y: 10 }, () => undefined)).toBe(true);
  });
});

describe('exhaustion, which was a number that did nothing', () => {
  it('costs advantage from level three, and not before', () => {
    const tired = (level: number): Exchange => ({
      attacker: { conditions: [], exhaustion: level },
      target: { conditions: [] },
      adjacent: true,
    });
    // One and two hit ability checks and speed; a swing notices at three.
    expect(oddsFor(tired(1)).mode).toBe('normal');
    expect(oddsFor(tired(2)).mode).toBe('normal');
    expect(oddsFor(tired(3)).mode).toBe('disadvantage');
    expect(oddsFor(tired(6)).mode).toBe('disadvantage');
  });

  it('halves a speed from level two and stops it at five', () => {
    expect(speedUnderExhaustion(30, 0)).toBe(30);
    expect(speedUnderExhaustion(30, 1)).toBe(30);
    expect(speedUnderExhaustion(30, 2)).toBe(15);
    expect(speedUnderExhaustion(30, 4)).toBe(15);
    expect(speedUnderExhaustion(30, 5)).toBe(0);
    // Odd speeds round down, the way everything here rounds.
    expect(speedUnderExhaustion(25, 2)).toBe(12);
  });
});

describe('charmed, which the source field also answers', () => {
  const charmed = { conditions: ['charmed'], conditionSources: { charmed: 'bard' } };

  it('will not attack the one who charmed them', () => {
    expect(mayAttack(charmed, 'bard')).toBe(false);
  });

  it('will attack anybody else', () => {
    expect(mayAttack(charmed, 'goblin')).toBe(true);
  });

  it('does not restrain somebody who is not charmed', () => {
    expect(mayAttack({ conditions: [] }, 'bard')).toBe(true);
  });

  it('does not restrain when nobody recorded the charmer', () => {
    expect(mayAttack({ conditions: ['charmed'] }, 'bard')).toBe(true);
  });
});

describe('the Dodge action, at last worth an action', () => {
  const plain = { conditions: [] as string[] };

  it('costs the attacker advantage', () => {
    const odds = oddsFor({
      attacker: plain,
      target: { conditions: [], dodging: true },
      adjacent: true,
    });
    expect(odds.mode).toBe('disadvantage');
    expect(describeOdds(odds)).toContain('target is dodging');
  });

  it('cancels against a reason to be glad, like every other pair', () => {
    expect(
      oddsFor({
        attacker: { conditions: [], hidden: true },
        target: { conditions: [], dodging: true },
        adjacent: true,
      }).mode,
    ).toBe('normal');
  });

  it('is worth nothing once the dodger is stunned', () => {
    expect(
      oddsFor({
        attacker: plain,
        target: { conditions: ['stunned'], dodging: true },
        adjacent: true,
      }).mode,
      // Stunned already hands out advantage; the dodge does not claw it back.
    ).toBe('advantage');
  });
});
