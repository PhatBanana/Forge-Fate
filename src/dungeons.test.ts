// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyDungeon,
  loadDungeons,
  putDungeon,
  removeDungeon,
  saveDungeons,
} from './dungeons';
import type { DungeonMapFields } from './dungeons';
import { emptyEncounter } from './encounter';
import type { EncounterState, MonsterCombatant } from './encounter';

/**
 * The dungeon drawer: places saved by name, loaded under a fight.
 *
 * Same discipline as the encounter drawer it mirrors - whole records or
 * nothing on the way in, the same name replacing on the way back - plus the
 * one function with rules of its own: applyDungeon changes the venue without
 * touching the fight.
 */

const abbey = (): DungeonMapFields => ({
  mapSeed: 'the sunken abbey',
  mapSize: 'large',
  mapRooms: 10,
  terrain: { '3,4': 'wall', '5,5': 'water' },
  elevation: { '7,7': 2 },
});

beforeEach(() => localStorage.clear());

describe('the drawer', () => {
  it('round-trips through storage', () => {
    saveDungeons(putDungeon([], 'the abbey', abbey()));
    const back = loadDungeons();
    expect(back).toHaveLength(1);
    expect(back[0].name).toBe('the abbey');
    expect(back[0].map.mapSeed).toBe('the sunken abbey');
    expect(back[0].map.terrain).toEqual({ '3,4': 'wall', '5,5': 'water' });
    expect(back[0].map.elevation).toEqual({ '7,7': 2 });
  });

  it('replaces under the same name, keeping the id', () => {
    const first = putDungeon([], 'the abbey', abbey());
    const second = putDungeon(first, 'the abbey', { ...abbey(), mapRooms: 4 });
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
    expect(second[0].map.mapRooms).toBe(4);
  });

  it('removes by id', () => {
    const list = putDungeon([], 'the abbey', abbey());
    expect(removeDungeon(list, list[0].id)).toHaveLength(0);
  });

  it('hydrates garbage to an empty drawer', () => {
    localStorage.setItem('dnd-forge:dungeons:v1', 'not even json');
    expect(loadDungeons()).toEqual([]);
    localStorage.setItem(
      'dnd-forge:dungeons:v1',
      JSON.stringify({ dungeons: [{ name: '' }, { name: 'no map' }, 42] }),
    );
    expect(loadDungeons()).toEqual([]);
  });
});

describe('applyDungeon', () => {
  const fought = (): EncounterState => {
    const goblin: MonsterCombatant = {
      kind: 'monster',
      id: 'm1',
      monsterId: 'srd:goblin',
      label: 'Goblin',
      hp: 7,
      maxHp: 7,
      initiative: 12,
      tieBreak: 0,
      conditions: [],
      at: { x: 3, y: 3 },
    };
    return {
      ...emptyEncounter(),
      combatants: [goblin],
      round: 2,
      mapSeed: 'old ground',
      zones: [],
      explored: ['1,1'],
      log: [{ id: 1, text: 'something happened' }],
    };
  };

  it('copies the map fields and clears the old ground', () => {
    const next = applyDungeon(fought(), abbey());
    expect(next.mapSeed).toBe('the sunken abbey');
    expect(next.mapSize).toBe('large');
    expect(next.mapRooms).toBe(10);
    expect(next.terrain).toEqual({ '3,4': 'wall', '5,5': 'water' });
    expect(next.elevation).toEqual({ '7,7': 2 });
    expect(next.zones).toBeUndefined();
    expect(next.explored).toBeUndefined();
  });

  it('takes everyone off the map but leaves the fight alone', () => {
    const before = fought();
    const next = applyDungeon(before, abbey());
    expect(next.combatants).toHaveLength(1);
    expect(next.combatants[0].at).toBeUndefined();
    expect(next.combatants[0].id).toBe(before.combatants[0].id);
    expect(next.round).toBe(2);
    expect(next.log).toEqual(before.log);
  });
});

describe('denizens (§74)', () => {
  const goblinish = (id: string) =>
    ({
      id,
      name: 'Test Goblin',
      hp: 7,
      hpRoll: null,
      scores: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    }) as unknown as import('./data/monsters').Monster;

  it('spawns placed denizens standing and wanderers placeless', () => {
    const map: DungeonMapFields = {
      ...abbey(),
      denizens: [
        { monsterId: 'srd:goblin', at: { x: 4, y: 5 } },
        { monsterId: 'srd:goblin' },
      ],
    };
    const next = applyDungeon(emptyEncounter(), map, goblinish);
    const spawned = next.combatants.filter((c) => c.kind === 'monster');
    expect(spawned).toHaveLength(2);
    expect(spawned[0].at).toEqual({ x: 4, y: 5 });
    expect(spawned[1].at).toBeUndefined();
    // Distinct combatants, both with their hit points standing.
    expect(new Set(spawned.map((c) => c.id)).size).toBe(2);
    expect(spawned.every((c) => (c as MonsterCombatant).hp === 7)).toBe(true);
  });

  it('skips a denizen the catalogue cannot answer for', () => {
    const map: DungeonMapFields = {
      ...abbey(),
      denizens: [{ monsterId: 'bestiary:deleted-since' }],
    };
    const next = applyDungeon(emptyEncounter(), map, () => undefined);
    expect(next.combatants).toHaveLength(0);
    // And with no resolver at all, nothing spawns and nothing throws.
    expect(applyDungeon(emptyEncounter(), map).combatants).toHaveLength(0);
  });

  it('keeps denizens through the save drawer, whole records or nothing', () => {
    const map: DungeonMapFields = {
      ...abbey(),
      denizens: [
        { monsterId: 'srd:goblin', at: { x: 1, y: 2 } },
        { monsterId: 'srd:wolf' },
      ],
    };
    saveDungeons(putDungeon([], 'the kennel', map));
    const loaded = loadDungeons();
    expect(loaded[0].map.denizens).toEqual(map.denizens);
    // Corrupt entries are dropped on the way in, not carried.
    saveDungeons(
      putDungeon([], 'the kennel', {
        ...abbey(),
        denizens: [
          { monsterId: 'srd:goblin' },
          { monsterId: 42 },
          { monsterId: 'srd:orc', at: { x: -1, y: 2 } },
        ] as unknown as DungeonMapFields['denizens'],
      }),
    );
    expect(loadDungeons()[0].map.denizens).toEqual([{ monsterId: 'srd:goblin' }]);
  });
});
