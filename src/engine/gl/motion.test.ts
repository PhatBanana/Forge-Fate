import { describe, expect, it } from 'vitest';
import {
  FLASH_MS,
  LUNGE_MS,
  LUNGE_REACH,
  SHAKE_MS,
  flashFade,
  lungeOffset,
  motionFor,
  pruneAnims,
  shakeOffset,
} from './motion';

/**
 * §68: the motion math, held still and measured.
 *
 * Everything is a pure function of elapsed time - no accumulation - which is
 * what these tests lean on: the same instant always answers the same, an
 * animation ends exactly when its duration says, and the offsets point where
 * the fiction points.
 */

describe('the lunge', () => {
  it('goes out and comes back on a half-sine, peaking in the middle', () => {
    const dir = { x: 100, y: 0 };
    const start = lungeOffset(0, dir)!;
    const peak = lungeOffset(LUNGE_MS / 2, dir)!;
    const late = lungeOffset(LUNGE_MS * 0.99, dir)!;
    expect(start.dx).toBeCloseTo(0);
    expect(peak.dx).toBeCloseTo(LUNGE_REACH);
    expect(late.dx).toBeLessThan(peak.dx);
    expect(late.dx).toBeGreaterThanOrEqual(0);
  });

  it('points toward the target, whatever the distance', () => {
    // The direction vector is not normalised by the caller; a lunge at a
    // target eight tiles away must not fly eight tiles.
    const near = lungeOffset(LUNGE_MS / 2, { x: 10, y: 0 })!;
    const far = lungeOffset(LUNGE_MS / 2, { x: 1000, y: 0 })!;
    expect(near.dx).toBeCloseTo(far.dx);
    const diagonal = lungeOffset(LUNGE_MS / 2, { x: 30, y: 40 })!;
    expect(diagonal.dx / diagonal.dy).toBeCloseTo(3 / 4);
    expect(Math.hypot(diagonal.dx, diagonal.dy)).toBeCloseTo(LUNGE_REACH);
  });

  it('ends on time, and survives a zero-length direction', () => {
    expect(lungeOffset(LUNGE_MS, { x: 1, y: 0 })).toBeNull();
    // Attacking your own square (a thrown flask at your feet): no direction,
    // no movement, no NaN.
    expect(lungeOffset(LUNGE_MS / 2, { x: 0, y: 0 })).toEqual({ dx: 0, dy: 0 });
  });
});

describe('the flinch', () => {
  it('alternates and decays to nothing', () => {
    const samples = [30, 60, 90, 120, 200, 300].map((t) => shakeOffset(t)!.dx);
    // It crosses zero at least once (the alternation)...
    const signs = new Set(samples.map((dx) => Math.sign(dx)).filter((sign) => sign !== 0));
    expect(signs.size).toBeGreaterThan(1);
    // ...and the envelope shrinks.
    expect(Math.abs(shakeOffset(SHAKE_MS * 0.9)!.dx)).toBeLessThan(
      Math.abs(shakeOffset(SHAKE_MS * 0.1)!.dx) + 0.01,
    );
    expect(shakeOffset(SHAKE_MS)).toBeNull();
  });

  it('is deterministic, so a paused frame is reproducible', () => {
    expect(shakeOffset(123)).toEqual(shakeOffset(123));
  });
});

describe('the hit wash', () => {
  it('fades monotonically from strong to gone', () => {
    expect(flashFade(0)).toBeCloseTo(0.75);
    expect(flashFade(FLASH_MS / 2)!).toBeLessThan(flashFade(0)!);
    expect(flashFade(FLASH_MS)).toBeNull();
  });
});

describe('the frame combiner', () => {
  it('adds a counter-attacked attacker\'s lunge and flinch together', () => {
    const now = 1000;
    const motion = motionFor(
      [
        { id: 'a', kind: 'lunge', start: now - LUNGE_MS / 2, dir: { x: 100, y: 0 } },
        { id: 'a', kind: 'hit', start: now - 30 },
      ],
      now,
    );
    const a = motion.get('a')!;
    expect(a.dx).not.toBeCloseTo(LUNGE_REACH); // the flinch moved it off the pure lunge
    expect(a.flashAlpha).toBeGreaterThan(0);
  });

  it('prunes exactly on the longest duration', () => {
    const now = 10_000;
    const anims = [
      { id: 'a', kind: 'lunge' as const, start: now - LUNGE_MS - 1, dir: { x: 1, y: 0 } },
      { id: 'b', kind: 'hit' as const, start: now - FLASH_MS + 10 },
    ];
    const left = pruneAnims(anims, now);
    expect(left.map((anim) => anim.id)).toEqual(['b']);
    expect(pruneAnims(left, now + FLASH_MS)).toEqual([]);
  });

  it('leaves un-animated tokens out of the map entirely', () => {
    const motion = motionFor([{ id: 'a', kind: 'hit', start: 0 }], 10);
    expect(motion.has('b')).toBe(false);
  });
});
