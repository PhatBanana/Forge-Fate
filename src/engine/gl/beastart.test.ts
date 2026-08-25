import { describe, expect, it } from 'vitest';
import { FAMILIES } from '../beasts';
import {
  BEAST_H,
  BEAST_INDICES,
  BEAST_POSES,
  BEAST_W,
  beastColorOf,
  beastSprite,
} from './beastart';
import type { BeastIndex } from './beastart';

/*
  §149. The art, checked the way §67 checks the class sprites.

  Pixel art as data earns its keep by being testable, and these are the
  checks that catch the mistakes hand-authored grids actually make: a row
  one character short (which shears every row below it), a typo'd palette
  index (which paints nothing and leaves a hole), and two poses that are
  quietly the same picture (which is a feature nobody can see).
*/

const hue = {
  primary: [0.4, 0.5, 0.2],
  secondary: [0.2, 0.2, 0.3],
  glow: [1, 0.8, 0.2],
} as const;

describe('every body in the bestiary’s fifteen', () => {
  it('is exactly the grid it says it is, in every pose', () => {
    for (const family of FAMILIES) {
      for (const pose of BEAST_POSES) {
        const rows = beastSprite(family, pose);
        expect(rows.length, `${family}/${pose} height`).toBe(BEAST_H);
        for (const row of rows) {
          expect(row.length, `${family}/${pose} row width`).toBe(BEAST_W);
        }
      }
    }
  });

  it('paints only with indices the legend knows', () => {
    for (const family of FAMILIES) {
      for (const pose of BEAST_POSES) {
        for (const row of beastSprite(family, pose)) {
          for (const index of row) {
            expect(BEAST_INDICES.has(index), `${family}/${pose}: ${index}`).toBe(true);
          }
        }
      }
    }
  });

  it('draws something - no family is an empty grid', () => {
    for (const family of FAMILIES) {
      const ink = beastSprite(family, 'idle').join('').replace(/\./g, '');
      expect(ink.length, family).toBeGreaterThan(40);
    }
  });

  it('is a different silhouette per family, not one body recoloured', () => {
    // The whole claim of the section. Two families that came out identical
    // would be a monster you cannot tell from another monster.
    const seen = new Map<string, string>();
    for (const family of FAMILIES) {
      const art = beastSprite(family, 'idle').join('\n');
      expect(seen.get(art) ?? family).toBe(family);
      seen.set(art, family);
    }
    expect(seen.size).toBe(FAMILIES.length);
  });
});

describe('what a body does when the fight starts', () => {
  it('changes the picture, for every family', () => {
    for (const family of FAMILIES) {
      expect(beastSprite(family, 'battle'), family).not.toEqual(beastSprite(family, 'idle'));
    }
  });

  it('changes the outline rather than only the colours', () => {
    /*
      A rage that only brightened the eyes would read as the same picture
      from across a table, which is the same as not having drawn it.
    */
    const filled = (rows: string[]) => rows.join('').split('').filter((c) => c !== '.').length;
    for (const family of FAMILIES) {
      const idle = filled(beastSprite(family, 'idle'));
      const battle = filled(beastSprite(family, 'battle'));
      expect(battle, family).toBeGreaterThan(idle);
    }
  });

  it('leaves the body it was overlaid on untouched for the next caller', () => {
    const before = beastSprite('dragon', 'idle');
    beastSprite('dragon', 'battle');
    expect(beastSprite('dragon', 'idle')).toEqual(before);
  });

  it('lays every family down as the same heap', () => {
    // A dead thing is a dead thing, and fifteen bespoke corpses would be
    // fifteen grids saying one thing.
    const heap = beastSprite('ooze', 'down');
    for (const family of FAMILIES) expect(beastSprite(family, 'down')).toEqual(heap);
  });
});

describe('three tones from one colour', () => {
  it('shades and lights the primary rather than asking for them', () => {
    const body = beastColorOf('P', hue)!;
    const dark = beastColorOf('D', hue)!;
    const lit = beastColorOf('L', hue)!;
    expect(dark[1]).toBeLessThan(body[1]);
    expect(lit[1]).toBeGreaterThan(body[1]);
  });

  it('never leaves a channel outside the range a shader can take', () => {
    const bright = { primary: [0.95, 0.9, 0.99], secondary: hue.secondary, glow: hue.glow } as const;
    for (const channel of beastColorOf('L', bright)!) {
      expect(channel).toBeLessThanOrEqual(1);
    }
  });

  it('answers for every index in the legend, and nothing for empty', () => {
    expect(beastColorOf('.', hue)).toBeNull();
    for (const index of [...BEAST_INDICES].filter((i) => i !== '.')) {
      expect(beastColorOf(index as BeastIndex, hue), index).not.toBeNull();
    }
  });

  it('gives two monsters of one family two different pictures', () => {
    // The dragons' case: same grid, different colour, and the shading
    // follows the colour rather than being baked into the art.
    const red = beastColorOf('D', { ...hue, primary: [0.6, 0.16, 0.14] })!;
    const white = beastColorOf('D', { ...hue, primary: [0.82, 0.86, 0.9] })!;
    expect(red).not.toEqual(white);
  });
});
