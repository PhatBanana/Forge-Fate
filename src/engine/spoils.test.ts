import { describe, expect, it } from 'vitest';
import { describeSpoils, spoilsFor } from './spoils';

describe('adding up a fight', () => {
  it('groups identical monsters and counts them', () => {
    const spoils = spoilsFor(
      [
        { name: 'Goblin', xp: 50 },
        { name: 'Goblin', xp: 50 },
        { name: 'Hobgoblin', xp: 100 },
      ],
      4,
    );
    expect(spoils.defeated).toEqual([
      { name: 'Goblin', count: 2, each: 50 },
      { name: 'Hobgoblin', count: 1, each: 100 },
    ]);
    expect(spoils.total).toBe(200);
    expect(spoils.each).toBe(50);
  });

  it('rounds the share down and lets the remainder go nowhere', () => {
    // 200 across three is 66.67; picking somebody to hand the extra to would
    // be a decision this has no business making.
    const spoils = spoilsFor([{ name: 'Ogre', xp: 200 }], 3);
    expect(spoils.each).toBe(66);
  });

  it('sorts by what the group was worth, not by what one was', () => {
    const spoils = spoilsFor(
      [
        { name: 'Ogre', xp: 450 },
        { name: 'Goblin', xp: 50 },
        ...Array.from({ length: 10 }, () => ({ name: 'Goblin', xp: 50 })),
      ],
      1,
    );
    expect(spoils.defeated[0].name).toBe('Goblin');
  });

  it('is empty and harmless when nothing went down', () => {
    const spoils = spoilsFor([], 4);
    expect(spoils.total).toBe(0);
    expect(spoils.each).toBe(0);
    expect(describeSpoils(spoils)).toBe('Nothing was defeated.');
  });

  it('does not divide by a party of nobody', () => {
    const spoils = spoilsFor([{ name: 'Goblin', xp: 50 }], 0);
    expect(spoils.each).toBe(0);
    expect(spoils.total).toBe(50);
  });

  it('reads back as a sentence', () => {
    expect(
      describeSpoils(
        spoilsFor(
          [
            { name: 'Goblin', xp: 50 },
            { name: 'Goblin', xp: 50 },
          ],
          2,
        ),
      ),
    ).toBe('2× Goblin — 100 XP, 50 each across 2.');
  });
});
