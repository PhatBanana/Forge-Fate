import { describe, expect, it } from 'vitest';
import {
  breathTime,
  delveLine,
  delveProgress,
  delveStrip,
  recordFall,
  roomOf,
  roomStates,
} from './delve';
import type { DelveMonster, DelveState } from './delve';
import type { Room } from './dungeon';

/**
 * §90. The delve's instrument panel, against hand-drawn runs.
 *
 * Everything here is derived - rooms from the fog and the monsters' facts,
 * a breath from nobody being awake - because a derived fact cannot drift
 * from the board. Only the name, the rests and the fallen persist, and the
 * fallen are a *record*: healing somebody does not un-fall them.
 */

const room = (id: number, x: number, y: number, w = 4, h = 4): Room => ({ id, x, y, w, h });
const rooms: Room[] = [room(1, 0, 0), room(2, 10, 0), room(3, 20, 0)];

const monster = (over: Partial<DelveMonster> = {}): DelveMonster => ({
  at: { x: 11, y: 1 },
  alive: true,
  dormant: false,
  ...over,
});

describe('which room a square is in', () => {
  it('finds the room and knows a corridor is no room at all', () => {
    expect(roomOf(rooms, { x: 11, y: 2 })?.id).toBe(2);
    expect(roomOf(rooms, { x: 3, y: 3 })?.id).toBe(1);
    expect(roomOf(rooms, { x: 7, y: 1 })).toBeUndefined();
  });
});

describe('room standings', () => {
  it('unseen until the fog remembers a square, held while a living monster stands in it', () => {
    // Room 1 walked through, room 2 seen with its guard, room 3 dark.
    const states = roomStates(rooms, ['1,1', '10,0'], [monster()]);
    expect(states).toEqual(['cleared', 'held', 'unseen']);
  });

  it('clears when the last living monster in it falls - a dead guard holds nothing', () => {
    expect(roomStates(rooms, ['10,0'], [monster({ alive: false })])).toEqual([
      'unseen',
      'cleared',
      'unseen',
    ]);
  });

  it('a sleeping guard still holds the guard room', () => {
    expect(roomStates(rooms, ['10,0'], [monster({ dormant: true })])[1]).toBe('held');
  });

  it('an empty room clears the moment it is seen - walking through is all it takes', () => {
    expect(roomStates(rooms, ['21,1'], [])[2]).toBe('cleared');
  });

  it('a placeless wanderer holds no room', () => {
    expect(roomStates(rooms, ['10,0'], [monster({ at: undefined })])[1]).toBe('cleared');
  });
});

describe('the breath between rooms', () => {
  it('is offered when every living monster is dormant, and not before', () => {
    expect(breathTime([monster({ alive: false }), monster({ dormant: true })])).toBe(true);
    expect(breathTime([monster()])).toBe(false);
    // A cleared dungeon is one long exhale.
    expect(breathTime([])).toBe(true);
  });
});

describe('the words', () => {
  const delve: DelveState = { name: 'The Sunken Vault', rests: 0, fallen: [] };

  it('counts on the strip and omits a restless run’s rests', () => {
    const progress = delveProgress(['cleared', 'held', 'unseen']);
    expect(progress).toEqual({ cleared: 1, total: 3 });
    expect(delveStrip(delve, progress)).toBe('1/3 rooms');
    expect(delveStrip({ ...delve, rests: 2 }, progress)).toBe('1/3 rooms · 2 rests');
  });

  it('writes the chronicle clause with the falls where they happened', () => {
    const run: DelveState = {
      name: 'The Sunken Vault',
      rests: 1,
      fallen: [
        { name: 'Sera', room: 3, round: 4 },
        { name: 'Bram', round: 6 },
      ],
    };
    expect(delveLine(run, { cleared: 6, total: 8 })).toBe(
      'The Sunken Vault — 6 of 8 rooms cleared, 1 short rest; Sera fell in room 3, Bram fell in the corridors',
    );
  });
});

describe('recording a fall', () => {
  it('keeps the first fall and shrugs at the second - one memorial per name', () => {
    const delve: DelveState = { name: 'x', rests: 0, fallen: [] };
    const once = recordFall(delve, { name: 'Sera', room: 2, round: 3 });
    expect(once.fallen).toHaveLength(1);
    const twice = recordFall(once, { name: 'Sera', room: 4, round: 7 });
    expect(twice.fallen).toEqual([{ name: 'Sera', room: 2, round: 3 }]);
  });
});
