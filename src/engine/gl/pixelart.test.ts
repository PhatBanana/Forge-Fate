import { describe, expect, it } from 'vitest';
import {
  BASES,
  CLASS_ART,
  LEGAL_INDICES,
  POSES,
  SHARED,
  SPRITE_H,
  SPRITE_W,
  colorOf,
  spriteFor,
} from './pixelart';

/**
 * §67: the sprites, held to the standards of data rather than of art.
 *
 * Whether a sprite is *good* only eyes can say (the probe's screenshots).
 * What tests can say: every grid is exactly the size the rasterizer will
 * assume, every pixel is a legal palette index, every class resolves in
 * every pose, and - the non-vacuous part - the poses and classes genuinely
 * differ, so a stance change or a class swap cannot silently draw the same
 * picture.
 */

const CLASS_IDS = Object.keys(CLASS_ART);

describe('the grids', () => {
  it('are all exactly 12×18', () => {
    for (const pose of POSES) {
      expect(BASES[pose].length).toBe(SPRITE_H);
      for (const row of BASES[pose]) expect(row.length).toBe(SPRITE_W);
    }
    for (const classId of CLASS_IDS) {
      for (const pose of POSES) {
        const rows = spriteFor(classId, pose)!;
        expect(rows.length).toBe(SPRITE_H);
        for (const row of rows) expect(row.length).toBe(SPRITE_W);
      }
    }
  });

  it('use only legal palette indices', () => {
    for (const classId of CLASS_IDS) {
      for (const pose of POSES) {
        for (const row of spriteFor(classId, pose)!) {
          for (const ch of row) expect(LEGAL_INDICES.has(ch)).toBe(true);
        }
      }
    }
  });

  it('resolve every index a sprite uses to a color', () => {
    for (const classId of CLASS_IDS) {
      const art = CLASS_ART[classId];
      for (const pose of POSES) {
        for (const row of spriteFor(classId, pose)!) {
          for (const ch of row) {
            const color = colorOf(ch as never, art);
            if (ch === '.') expect(color).toBeNull();
            else expect(color).toHaveLength(3);
          }
        }
      }
    }
  });

  it('returns null for a class the table does not know', () => {
    // A monster id, a custom class, a typo: the caller falls back to the
    // initials card rather than drawing an empty ghost.
    expect(spriteFor('goblin', 'idle')).toBeNull();
  });
});

describe('the poses actually differ', () => {
  it.each(CLASS_IDS)('for %s, every pose draws a different picture', (classId) => {
    const pictures = POSES.map((pose) => spriteFor(classId, pose)!.join('\n'));
    expect(new Set(pictures).size).toBe(POSES.length);
  });

  it('keeps sneak low and down flat - the silhouettes, not just the pixels', () => {
    // Sneak: nothing in the top three rows (the crouch). Down: nothing in
    // the top half at all (the body is on the ground).
    for (const row of BASES.sneak.slice(0, 3)) expect(row).toBe('.'.repeat(SPRITE_W));
    for (const row of BASES.down.slice(0, 9)) expect(row).toBe('.'.repeat(SPRITE_W));
    // And idle stands tall: its head starts in the first row.
    expect(BASES.idle[0]).not.toBe('.'.repeat(SPRITE_W));
  });

  it('disarms sneak and down', () => {
    // A crouched silhouette with a sword sticking up is not sneaking. The
    // unarmed poses are the shared base and nothing else.
    for (const classId of CLASS_IDS) {
      expect(spriteFor(classId, 'sneak')).toEqual(BASES.sneak);
      expect(spriteFor(classId, 'down')).toEqual(BASES.down);
    }
  });
});

describe('the classes actually differ', () => {
  it('every pair differs in prop or palette', () => {
    for (let i = 0; i < CLASS_IDS.length; i++) {
      for (let j = i + 1; j < CLASS_IDS.length; j++) {
        const a = CLASS_ART[CLASS_IDS[i]];
        const b = CLASS_ART[CLASS_IDS[j]];
        const samePicture = a.prop === b.prop;
        const samePaint =
          a.primary.join() === b.primary.join() && a.secondary.join() === b.secondary.join();
        expect(samePicture && samePaint).toBe(false);
      }
    }
  });

  it('covers all seventeen classes, the originals included', () => {
    expect(CLASS_IDS.length).toBe(17);
    for (const forge of ['reckoner', 'harrier', 'marshal', 'adept']) {
      expect(CLASS_ART[forge]).toBeDefined();
    }
  });

  it('shares the fixed tones, so the set reads as one family', () => {
    expect(SHARED.S).toHaveLength(3);
    expect(SHARED.O[0]).toBeLessThan(0.2);
  });
});
