import { describe, expect, it } from 'vitest';
import { applySeatRoll, isSeatRoll, performRoll, rollOptionsFor } from './seatRolls';
import type { RollOption } from './seatRolls';
import { deriveBuild } from './engine/character';
import { addCharacter, emptyEncounter, nextTurn } from './encounter';
import { activeEncounter, updateEncounter } from './storage';
import { fighter, rosterOf } from './test/factories';
import type { Rng } from './engine/dice';

/** Every die lands on `face`. */
const always = (face: number): Rng => () => (face - 1) / 20 + 0.001;

describe('§162: what a player can roll', () => {
  const options = rollOptionsFor(deriveBuild(fighter()));
  const byId = (id: string) => options.find((o) => o.id === id)!;

  it('offers initiative, every attack, saves, skills and checks', () => {
    expect(byId('initiative')).toMatchObject({ kind: 'd20', initiative: true });
    expect(options.some((o) => o.id.startsWith('hit:'))).toBe(true);
    expect(options.some((o) => o.id.startsWith('dmg:'))).toBe(true);
    expect(options.filter((o) => o.id.startsWith('save:'))).toHaveLength(6);
    expect(options.filter((o) => o.id.startsWith('skill:')).length).toBeGreaterThan(10);
    expect(options.filter((o) => o.id.startsWith('check:'))).toHaveLength(6);
  });

  it('rolls a d20 with its modifier, and advantage keeps the better die', () => {
    const hit = byId('hit:0') as Extract<RollOption, { kind: 'd20' }>;
    const straight = performRoll(hit, 'normal', always(12));
    expect(straight.total).toBe(12 + hit.modifier);
    let i = 0;
    const lowThenHigh: Rng = () => [3, 17][i++ % 2] / 20 - 0.04;
    expect(performRoll(hit, 'advantage', lowThenHigh).total).toBe(17 + hit.modifier);
    expect(performRoll(hit, 'normal', always(20)).natural).toBe(20);
  });

  it('doubles the dice, not the bonus, on a critical', () => {
    const plain = performRoll(byId('dmg:0'), 'normal', always(1));
    const crit = performRoll(byId('crit:0'), 'normal', always(1));
    // Every die shows 1: a crit adds exactly one more 1 per die, nothing else.
    const dice = Number((byId('dmg:0') as Extract<RollOption, { kind: 'damage' }>).notation.match(/^(\d+)d/)![1]);
    expect(crit.total - plain.total).toBe(dice);
  });
});

describe('§162: what the host does with a roll', () => {
  const table = () => {
    const roster = rosterOf(fighter());
    return updateEncounter(roster, addCharacter(emptyEncounter(), roster.entries[0].id));
  };
  const roll = (rosterId: string, over = {}) => ({
    rosterId,
    label: 'Athletics',
    total: 17,
    detail: 'd20: 12 +5 = 17',
    ...over,
  });

  it('writes the roll into the fight’s log, by name', () => {
    const roster = table();
    const after = applySeatRoll(roster, roll(roster.entries[0].id));
    expect(activeEncounter(after).log?.[0]?.text).toBe('Basher rolls Athletics: 17 (d20: 12 +5 = 17).');
  });

  it('takes an initiative into the order before the fight starts', () => {
    const roster = table();
    const after = applySeatRoll(roster, roll(roster.entries[0].id, { label: 'Initiative', total: 14, initiative: true }));
    expect(activeEncounter(after).combatants[0].initiative).toBe(14);
    expect(activeEncounter(after).log?.[0]?.text).toMatch(/into the order/);
  });

  it('only logs a late initiative - reordering a live fight is the DM’s call', () => {
    let roster = table();
    roster = updateEncounter(roster, nextTurn(activeEncounter(roster)).encounter);
    const before = activeEncounter(roster).combatants[0].initiative;
    const after = applySeatRoll(roster, roll(roster.entries[0].id, { label: 'Initiative', total: 19, initiative: true }));
    expect(activeEncounter(after).combatants[0].initiative).toBe(before);
    expect(activeEncounter(after).log?.[0]?.text).toMatch(/order stays the DM/);
  });

  it('ignores a roll for somebody who is not on the roster', () => {
    const roster = table();
    expect(applySeatRoll(roster, roll('nobody'))).toBe(roster);
  });

  it('lets only a well-formed roll through the boundary', () => {
    expect(isSeatRoll(roll('c0'))).toBe(true);
    expect(isSeatRoll({ ...roll('c0'), total: Number.NaN })).toBe(false);
    expect(isSeatRoll({ ...roll('c0'), label: 'x'.repeat(200) })).toBe(false);
    expect(isSeatRoll({ rosterId: 'c0' })).toBe(false);
    expect(isSeatRoll(null)).toBe(false);
  });
});
