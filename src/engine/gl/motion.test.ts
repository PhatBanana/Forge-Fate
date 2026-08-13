import { describe, expect, it } from 'vitest';
import {
  DEATH_LIFT,
  DEATH_MS,
  FLASH_MS,
  HOP_LIFT,
  LUNGE_MS,
  LUNGE_REACH,
  SHAKE_MS,
  WALK_MAX_MS,
  WALK_TILE_MS,
  deathFall,
  flashFade,
  lungeOffset,
  motionFor,
  pruneAnims,
  shakeOffset,
  walkDuration,
  walkOffset,
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

describe('the walk (§69)', () => {
  // A right-angled two-segment route, with a depth step on the last tile.
  const path = [
    { x: 0, y: 0, depth: 0 },
    { x: 28, y: 0, depth: 1 },
    { x: 28, y: 14, depth: 2 },
  ];

  it('paces per tile, but a long dash fits under the ceiling', () => {
    expect(walkDuration(path)).toBe(2 * WALK_TILE_MS);
    const twelve = Array.from({ length: 13 }, (_, i) => ({ x: i * 28, y: 0, depth: 0 }));
    expect(walkDuration(twelve)).toBe(WALK_MAX_MS);
    expect(walkDuration([path[0]])).toBe(0);
  });

  it('starts on the origin, walks the corner, and ends on time', () => {
    const total = walkDuration(path);
    // Offsets are from the route's END, where the token's state stands.
    const atStart = walkOffset(0, path)!;
    expect(atStart.gdx).toBeCloseTo(-28);
    expect(atStart.gdy).toBeCloseTo(-14);
    expect(atStart.ddepth).toBeCloseTo(-2);
    // Halfway = exactly the corner square: the route is traced, not chorded.
    const atCorner = walkOffset(total / 2, path)!;
    expect(atCorner.gdx).toBeCloseTo(0);
    expect(atCorner.gdy).toBeCloseTo(-14);
    expect(atCorner.ddepth).toBeCloseTo(-1);
    expect(walkOffset(total, path)).toBeNull();
  });

  it('hops once per tile, landing exactly on each square crossed', () => {
    const total = walkDuration(path);
    expect(walkOffset(0, path)!.lift).toBeCloseTo(0);
    expect(walkOffset(total / 2, path)!.lift).toBeCloseTo(0); // the corner
    expect(walkOffset(total / 4, path)!.lift).toBeCloseTo(HOP_LIFT); // mid-tile
  });

  it('carries the ground - shadow and paint order - with the body', () => {
    const now = 1000;
    const total = walkDuration(path);
    const walking = motionFor(
      [{ id: 'w', kind: 'walk', start: now - total / 4, path, hop: true }],
      now,
    ).get('w')!;
    // Mid-tile: the figure rides the ground sideways but hops above it.
    expect(walking.gdx).toBeCloseTo(walking.dx);
    expect(walking.dy).toBeCloseTo(walking.gdy - HOP_LIFT);
    expect(walking.ddepth).toBeLessThan(0);
    // A shove glides flat: same ground, no lift.
    const shoved = motionFor(
      [{ id: 'w', kind: 'walk', start: now - total / 4, path, hop: false }],
      now,
    ).get('w')!;
    expect(shoved.dy).toBeCloseTo(shoved.gdy);
    // And a lunge never touches the ground - the §68 grounded-shadow contract.
    const lunging = motionFor(
      [{ id: 'l', kind: 'lunge', start: now - LUNGE_MS / 2, dir: { x: 100, y: 0 } }],
      now,
    ).get('l')!;
    expect(lunging.gdx).toBe(0);
    expect(lunging.gdy).toBe(0);
    expect(lunging.ddepth).toBe(0);
  });
});

describe('the death (§70)', () => {
  it('falls onto the tile: lifted at first, landed and clear by the end', () => {
    const start = deathFall(0)!;
    expect(start.dy).toBeCloseTo(-DEATH_LIFT);
    const late = deathFall(DEATH_MS * 0.99)!;
    expect(late.dy).toBeGreaterThan(start.dy);
    expect(late.dy).toBeLessThanOrEqual(0);
    expect(Math.abs(late.dy)).toBeLessThan(DEATH_LIFT * 0.01);
    expect(deathFall(DEATH_MS)).toBeNull();
  });

  it('flickers with a decaying depth and ends at full - the tint owns the rest', () => {
    const alphas = Array.from({ length: 64 }, (_, i) =>
      deathFall((i / 64) * DEATH_MS)!.alpha,
    );
    // It genuinely dips - this is a flicker, not a fade-in...
    expect(Math.min(...alphas.slice(0, 32))).toBeLessThan(0.5);
    // ...it never leaves [0,1]...
    for (const alpha of alphas) {
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThanOrEqual(1);
    }
    // ...the envelope decays: the last quarter never dips as deep as the
    // first quarter did...
    expect(Math.min(...alphas.slice(48))).toBeGreaterThan(Math.min(...alphas.slice(0, 16)));
    // ...and it is deterministic, like every motion here.
    expect(deathFall(123)).toEqual(deathFall(123));
  });

  it('dims only the figure - the ground offsets stay zero through a death', () => {
    const now = 1000;
    const dying = motionFor([{ id: 'd', kind: 'death', start: now - DEATH_MS / 3 }], now).get('d')!;
    expect(dying.alpha).toBeLessThan(1);
    expect(dying.dy).toBeLessThan(0);
    expect(dying.gdx).toBe(0);
    expect(dying.gdy).toBe(0);
    expect(dying.ddepth).toBe(0);
    // The killing blow's flash rides along: both animations on one body.
    const struck = motionFor(
      [
        { id: 'd', kind: 'death', start: now - DEATH_MS / 3 },
        { id: 'd', kind: 'hit', start: now - 30 },
      ],
      now,
    ).get('d')!;
    expect(struck.alpha).toBeLessThan(1);
    expect(struck.flashAlpha).toBeGreaterThan(0);
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
    const path = [
      { x: 0, y: 0, depth: 0 },
      { x: 28, y: 0, depth: 0 },
    ];
    const anims = [
      { id: 'a', kind: 'lunge' as const, start: now - LUNGE_MS - 1, dir: { x: 1, y: 0 } },
      { id: 'b', kind: 'hit' as const, start: now - FLASH_MS + 10 },
      { id: 'c', kind: 'walk' as const, start: now - WALK_TILE_MS + 10, path },
      { id: 'd', kind: 'walk' as const, start: now - WALK_TILE_MS, path },
      { id: 'e', kind: 'death' as const, start: now - DEATH_MS },
      { id: 'f', kind: 'death' as const, start: now - DEATH_MS + 10 },
    ];
    const left = pruneAnims(anims, now);
    expect(left.map((anim) => anim.id)).toEqual(['b', 'c', 'f']);
    expect(pruneAnims(left, now + FLASH_MS)).toEqual([]);
  });

  it('leaves un-animated tokens out of the map entirely', () => {
    const motion = motionFor([{ id: 'a', kind: 'hit', start: 0 }], 10);
    expect(motion.has('b')).toBe(false);
  });
});
