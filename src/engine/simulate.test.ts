import { describe, expect, it } from 'vitest';
import { simulate } from './simulate';
import { makeRng } from './dungeon';
import fixture from '../data/srd/srd-2014-monsters.json';
import type { Monster } from '../data/monsters';

/**
 * The simulation, checked at its ends.
 *
 * A monte carlo cannot be pinned number for number, so what these check is
 * that the distribution lands where the fight obviously goes: a party that
 * demolishes a goblin wins essentially always, a commoner against an ancient
 * dragon essentially never, and the same seed gives the same answer twice -
 * which is what makes any of the other numbers checkable at all.
 */

const monsters = (fixture as unknown as { records: Monster[] }).records;
const byId = (id: string) => monsters.find((m) => m.id === id)!;

const bruiser = {
  name: 'Bruiser',
  ac: 18,
  hp: 40,
  dprAt: () => 15,
};

describe('the obvious fights', () => {
  it('wins the walkover essentially always', () => {
    const result = simulate(
      { party: [bruiser], monsters: [{ monster: byId('goblin'), hp: 7 }] },
      { trials: 200, rng: makeRng(7) },
    )!;
    expect(result.winRate).toBeGreaterThan(0.95);
    expect(result.medianRounds).toBe(1);
    expect(result.downRate[0].rate).toBeLessThan(0.05);
  });

  it('loses the massacre essentially always', () => {
    const commoner = { name: 'Commoner', ac: 10, hp: 4, dprAt: () => 2 };
    const result = simulate(
      {
        party: [commoner],
        monsters: [{ monster: byId('adult-red-dragon'), hp: 256 }],
      },
      { trials: 100, rng: makeRng(7) },
    )!;
    expect(result.winRate).toBeLessThan(0.02);
    expect(result.downRate[0].rate).toBeGreaterThan(0.98);
  });

  it('gives the same distribution for the same seed', () => {
    const run = () =>
      simulate(
        { party: [bruiser], monsters: [{ monster: byId('ogre'), hp: 59 }] },
        { trials: 100, rng: makeRng(42) },
      )!;
    const a = run();
    const b = run();
    expect(a.winRate).toBe(b.winRate);
    expect(a.medianRounds).toBe(b.medianRounds);
    expect(a.downRate).toEqual(b.downRate);
  });

  it('finds danger the expectation misses', () => {
    /*
      The reason this phase exists. Against two ogres, a lone bruiser's
      expectation might read as a win on averages - but ogres swing 2d8+4, and
      the variance means some trials go badly. The check is only that the
      distribution is a distribution: neither certain victory nor certain
      death, and somebody hits the floor sometimes.
    */
    const ogre = byId('ogre');
    const result = simulate(
      {
        party: [{ ...bruiser, hp: 60, dprAt: () => 20 }],
        monsters: [
          { monster: ogre, hp: 59 },
          { monster: ogre, hp: 59 },
        ],
      },
      { trials: 300, rng: makeRng(11) },
    )!;
    expect(result.winRate).toBeGreaterThan(0.05);
    expect(result.winRate).toBeLessThan(0.95);
  });

  it('ends a stalemate as a draw rather than hanging', () => {
    // Nobody can hurt anybody: the cap ends it, and it counts as a loss for
    // the party rather than a win.
    const pacifist = { name: 'Pacifist', ac: 30, hp: 10, dprAt: () => 0 };
    const result = simulate(
      { party: [pacifist], monsters: [{ monster: byId('goblin'), hp: 7 }] },
      { trials: 5, rng: makeRng(3) },
    )!;
    expect(result.winRate).toBe(0);
  });

  it('returns null with nobody on either side', () => {
    expect(simulate({ party: [], monsters: [] })).toBeNull();
  });
});
