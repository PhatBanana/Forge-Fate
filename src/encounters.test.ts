// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadEncounters,
  loadIntoPlay,
  putEncounter,
  removeEncounter,
  saveEncounters,
} from './encounters';
import { emptyEncounter } from './encounter';
import type { EncounterState } from './encounter';

/**
 * The drawer the other three fights wait in.
 *
 * What matters: a prepped fight survives a reload whole - terrain, zones, map
 * inputs - and loading one is a fresh start against *today's* roster, not a
 * resumption of a fight nobody was having.
 */

beforeEach(() => localStorage.clear());

const prepped = (): EncounterState => ({
  ...emptyEncounter(),
  combatants: [
    {
      kind: 'monster', id: 'm0', monsterId: 'goblin', label: 'Goblin',
      hp: 7, maxHp: 7, initiative: 12, tieBreak: 2, conditions: [],
    },
    { kind: 'character', id: 'c1', rosterId: 'old-pc', initiative: 0, tieBreak: 1 },
  ],
  nextSeq: 2,
  round: 3,
  turnIndex: 1,
  mapSeed: 'the sunken abbey',
  mapRooms: 12,
  terrain: { '3,4': 'pillar' },
  zones: [
    { id: 'z0', label: 'Web', shape: 'cube', at: { x: 1, y: 1 }, feet: 20, angle: 0, tint: 0 },
  ],
  log: [{ id: 9, text: 'old news' }],
});

describe('the drawer', () => {
  it('keeps a prepped fight whole across a reload', () => {
    saveEncounters(putEncounter([], 'The kennel', prepped()));
    const back = loadEncounters();
    expect(back).toHaveLength(1);
    expect(back[0].name).toBe('The kennel');
    expect(back[0].encounter.mapSeed).toBe('the sunken abbey');
    expect(back[0].encounter.terrain).toEqual({ '3,4': 'pillar' });
    expect(back[0].encounter.zones?.[0].label).toBe('Web');
  });

  it('replaces under the same name rather than stacking copies', () => {
    let list = putEncounter([], 'The kennel', prepped());
    list = putEncounter(list, 'The kennel', emptyEncounter());
    expect(list).toHaveLength(1);
    expect(list[0].encounter.combatants).toHaveLength(0);
    expect(removeEncounter(list, list[0].id)).toHaveLength(0);
  });

  it('drops broken records and survives garbage storage', () => {
    localStorage.setItem(
      'dnd-forge:encounters:v1',
      JSON.stringify({ encounters: [{ name: 'ok', encounter: { combatants: [] } }, { id: 'x' }] }),
    );
    expect(loadEncounters().map((e) => e.name)).toEqual(['ok']);
    localStorage.setItem('dnd-forge:encounters:v1', 'not json');
    expect(loadEncounters()).toEqual([]);
  });
});

describe('loading one into play', () => {
  it('starts fresh, keeps the monsters, and drops departed characters', () => {
    const saved = putEncounter([], 'The kennel', prepped())[0];
    const live = loadIntoPlay(saved, new Set(['current-pc']));

    // Round nothing, no stale pointer, no last month's log.
    expect(live.round).toBe(0);
    expect(live.turnIndex).toBe(-1);
    expect(live.log).toBeUndefined();
    // The goblin came; the reference to a deleted character did not.
    expect(live.combatants.map((c) => c.kind)).toEqual(['monster']);
    // The board itself travels whole.
    expect(live.mapSeed).toBe('the sunken abbey');
    expect(live.terrain).toEqual({ '3,4': 'pillar' });
  });
});
