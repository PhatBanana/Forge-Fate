import { describe, expect, it } from 'vitest';
import { threatened } from './foresight';
import type { Square } from '../encounter';

/**
 * §88. The spread from standing spots to threatened squares.
 *
 * The walk and the plan have their own suites; what this pins is the flood -
 * radius in feet, diagonals as one step, walls stopping it, and the
 * deliberate honesty stance that over-warning is the correct direction.
 */

const open = () => true;
const at = (x: number, y: number): Square => ({ x, y });
const keys = (set: Set<string>) => [...set].sort();

describe('the reach of a standing spot', () => {
  it('is the spot itself at zero reach - where it stands is not safe', () => {
    expect(keys(threatened([at(3, 3)], 0, open))).toEqual(['3,3']);
  });

  it('is the ring around it at five feet, diagonals included', () => {
    const got = threatened([at(3, 3)], 5, open);
    expect(got.size).toBe(9);
    expect(got.has('2,2')).toBe(true);
    expect(got.has('4,4')).toBe(true);
  });

  it('reaches two squares at ten feet - a polearm, in squares', () => {
    const got = threatened([at(3, 3)], 10, open);
    expect(got.size).toBe(25);
    expect(got.has('1,1')).toBe(true);
    expect(got.has('5,5')).toBe(true);
  });

  it('rounds partial squares down, the way the grid rounds everything', () => {
    // 7 feet is one square and change; the change buys nothing.
    expect(threatened([at(0, 0)], 7, open).size).toBe(9);
  });
});

describe('what stops it', () => {
  it('floods around a wall rather than through it', () => {
    // A north-south wall at x=2 with no gap in reach: nothing east of it is
    // threatened, even though the crow flies there easily.
    const wall = (s: Square) => s.x !== 2;
    const got = threatened([at(0, 0)], 10, wall);
    expect(got.has('1,0')).toBe(true);
    expect(got.has('2,0')).toBe(false);
    expect(got.has('3,0')).toBe(false);
  });

  it('turns a corner the long way, spending reach to do it', () => {
    /*
      A wall at x=2 for y<=1 - the flood must go south around its end:
      (1,0) → (1,1) → (2,2) → (3,1) → (3,0), four steps. Twenty feet buys
      the detour; fifteen does not, though the crow flies it in ten.
    */
    const wall = (s: Square) => !(s.x === 2 && s.y <= 1);
    expect(threatened([at(1, 0)], 15, wall).has('3,0')).toBe(false);
    expect(threatened([at(1, 0)], 20, wall).has('3,0')).toBe(true);
  });

  it('unions several spots in one flood', () => {
    const got = threatened([at(0, 0), at(10, 10)], 5, open);
    expect(got.has('1,1')).toBe(true);
    expect(got.has('9,9')).toBe(true);
    expect(got.has('5,5')).toBe(false);
  });
});
