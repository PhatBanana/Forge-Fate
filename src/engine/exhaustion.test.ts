import { describe, expect, it } from 'vitest';
import { MAX_EXHAUSTION, exhaustionEffect, exhaustionLines, speedAfterExhaustion } from './exhaustion';

/**
 * Section 51. The app carried the 2014 exhaustion ladder and applied it to
 * both editions, so a 2024 character was told the wrong rule at every level.
 * These pin both editions against each other, because the whole risk is one
 * bleeding into the other.
 */

describe('2014 exhaustion, the six-step ladder', () => {
  const at = (n: number) => exhaustionEffect(n, '2014');

  it('adds a rung at a time and keeps the ones below', () => {
    expect(exhaustionLines(1, '2014')).toEqual(['Disadvantage on ability checks.']);
    expect(exhaustionLines(3, '2014')).toHaveLength(3);
    expect(at(3).disadvantage).toBe(true);
    expect(at(2).disadvantage).toBe(false);
  });

  it('halves speed at two and stops it at five', () => {
    expect(speedAfterExhaustion(30, 1, '2014')).toBe(30);
    expect(speedAfterExhaustion(30, 2, '2014')).toBe(15);
    expect(speedAfterExhaustion(30, 4, '2014')).toBe(15);
    expect(speedAfterExhaustion(30, 5, '2014')).toBe(0);
    // Odd speeds round down, the way everything here rounds.
    expect(speedAfterExhaustion(25, 2, '2014')).toBe(12);
  });

  it('never applies a flat penalty, which is the other edition entirely', () => {
    for (let n = 0; n <= MAX_EXHAUSTION; n++) {
      expect(at(n).d20Penalty, `level ${n}`).toBe(0);
      expect(at(n).speedPenalty, `level ${n}`).toBe(0);
    }
  });

  it('halves hit points at four and kills at six', () => {
    expect(at(4).hpMaxHalved).toBe(true);
    expect(at(3).hpMaxHalved).toBe(false);
    expect(at(6).dead).toBe(true);
  });
});

describe('2024 exhaustion, one rule scaled', () => {
  const at = (n: number) => exhaustionEffect(n, '2024');

  it('is minus two per level on every D20 test', () => {
    expect(at(1).d20Penalty).toBe(2);
    expect(at(3).d20Penalty).toBe(6);
    expect(at(5).d20Penalty).toBe(10);
  });

  it('takes five feet per level rather than halving', () => {
    expect(speedAfterExhaustion(30, 1, '2024')).toBe(25);
    expect(speedAfterExhaustion(30, 2, '2024')).toBe(20);
    // The level that most obviously separates the editions: 2014 halves to
    // 15, 2024 takes ten feet.
    expect(speedAfterExhaustion(30, 2, '2014')).toBe(15);
  });

  it('never goes below zero, however slow the creature started', () => {
    expect(speedAfterExhaustion(20, 5, '2024')).toBe(0);
    expect(speedAfterExhaustion(0, 1, '2024')).toBe(0);
  });

  it('uses none of the 2014 ladder rungs', () => {
    for (let n = 1; n < MAX_EXHAUSTION; n++) {
      expect(at(n).disadvantage, `level ${n}`).toBe(false);
      expect(at(n).hpMaxHalved, `level ${n}`).toBe(false);
      expect(at(n).speedHalved, `level ${n}`).toBe(false);
    }
  });

  it('kills at six, in both editions', () => {
    expect(at(6).dead).toBe(true);
    expect(exhaustionEffect(6, '2014').dead).toBe(true);
  });

  it('says nothing at all when rested', () => {
    expect(exhaustionLines(0, '2024')).toEqual([]);
    expect(exhaustionLines(0, '2014')).toEqual([]);
  });
});
