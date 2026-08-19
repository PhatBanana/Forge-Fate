import { describe, expect, it } from 'vitest';
import {
  claimSeat,
  describeIntent,
  intentFor,
  queueIntent,
  releaseSeat,
  withdrawIntent,
} from './seats';
import type { Intent } from './seats';

/**
 * §92. The table's bones, pinned as pure data: one seat per character, one
 * plan per combatant, and the words the DM reads. The authority rule -
 * a seat proposes, only the DM writes the fight - is not testable here
 * because it is structural: nothing in this module can touch an encounter.
 */

describe('seats', () => {
  it('claims one chair per character, and re-claiming is rejoining', () => {
    const one = claimSeat([], 'c1', 'Alex');
    expect(one).toHaveLength(1);
    expect(one[0].playerName).toBe('Alex');

    // The phone that dropped off the wifi comes back: same chair, new claim.
    const again = claimSeat(one, 'c1', 'Alex');
    expect(again).toHaveLength(1);
    expect(again[0].id).not.toBe(one[0].id);

    const two = claimSeat(again, 'c2');
    expect(two).toHaveLength(2);
    expect(releaseSeat(two, 'c1').map((s) => s.rosterId)).toEqual(['c2']);
  });
});

describe('intents', () => {
  it('keeps one plan per combatant - your latest plan is your plan', () => {
    let queue = queueIntent([], { combatantId: 'c1', kind: 'dodge' });
    queue = queueIntent(queue, { combatantId: 'c2', kind: 'attack', targetId: 'm1' });
    queue = queueIntent(queue, { combatantId: 'c1', kind: 'attack', targetId: 'm1' });

    expect(queue).toHaveLength(2);
    expect(intentFor(queue, 'c1')?.kind).toBe('attack');
    expect(withdrawIntent(queue, 'c1').map((i) => i.combatantId)).toEqual(['c2']);
  });

  it('says the plan back the way the DM reads it', () => {
    const plan = (over: Partial<Intent>): Intent => ({
      id: 'x',
      combatantId: 'c1',
      kind: 'dodge',
      at: 1,
      ...over,
    });
    expect(describeIntent(plan({}))).toBe('Dodge');
    expect(describeIntent(plan({ kind: 'attack', targetId: 'm1' }), 'Goblin A')).toBe(
      'Attack Goblin A',
    );
    expect(describeIntent(plan({ kind: 'move', note: 'behind the pillar' }))).toBe(
      'Move — “behind the pillar”',
    );
    // `other` is the note, whole - the enum steps aside for the table's words.
    expect(describeIntent(plan({ kind: 'other', note: 'shove him off the ledge' }))).toBe(
      'shove him off the ledge',
    );
    expect(describeIntent(plan({ kind: 'other' }))).toBe('Something else');
  });
});
