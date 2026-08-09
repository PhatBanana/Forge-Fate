import { describe, expect, it } from 'vitest';
import { surprisedAtStart } from './surprise';
import type { Sneak } from './surprise';

const pc = (id: string, passivePerception: number, hidden?: number): Sneak => ({
  id,
  side: 'party',
  passivePerception,
  ...(hidden === undefined ? {} : { hidden }),
});

const foe = (id: string, passivePerception: number, hidden?: number): Sneak => ({
  id,
  side: 'monsters',
  passivePerception,
  ...(hidden === undefined ? {} : { hidden }),
});

describe('who is surprised', () => {
  it('surprises nobody when both sides are standing in the open', () => {
    // Which is most fights, and the reason this whole feature has to default
    // to doing nothing at all.
    expect(surprisedAtStart([pc('a', 12), foe('g', 9)]).size).toBe(0);
  });

  it('surprises whoever cannot beat the ambusher’s Stealth', () => {
    const out = surprisedAtStart([pc('sharp', 17), pc('dull', 10), foe('g', 9, 15)]);
    expect(out.has('dull')).toBe(true);
    // Per creature, not per side: the elf with the good ears acts while the
    // rest of the party stands there, which is the texture of the rule.
    expect(out.has('sharp')).toBe(false);
  });

  it('gives a tie to the watcher, the way the spotting check does', () => {
    expect(surprisedAtStart([pc('a', 15), foe('g', 9, 15)]).size).toBe(0);
  });

  it('is not surprised by a hidden foe when an unhidden one is right there', () => {
    // "Doesn't notice a threat" is about threats, plural. One goblin in the
    // open means the ambush is blown however well its friends are hiding.
    const out = surprisedAtStart([pc('a', 10), foe('sneak', 9, 20), foe('oaf', 9)]);
    expect(out.size).toBe(0);
  });

  it('works in the other direction, because monsters get ambushed too', () => {
    const out = surprisedAtStart([pc('rogue', 12, 18), foe('g', 10), foe('h', 8)]);
    expect(out.has('g')).toBe(true);
    expect(out.has('h')).toBe(true);
    expect(out.has('rogue')).toBe(false);
  });

  it('does not surprise a side that has nobody to be ambushed by', () => {
    expect(surprisedAtStart([pc('a', 5), pc('b', 5, 30)]).size).toBe(0);
  });

  it('can surprise both sides at once, which is two ambushes meeting', () => {
    const out = surprisedAtStart([pc('a', 10, 20), foe('g', 10, 20)]);
    expect(out.has('a')).toBe(true);
    expect(out.has('g')).toBe(true);
  });
});
