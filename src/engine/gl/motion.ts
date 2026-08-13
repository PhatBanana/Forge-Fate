import { HW } from '../iso';

/**
 * The little animations (§68): an attacker lunges at their target, a victim
 * shakes and flashes. Pure functions of elapsed time, because that is what
 * makes them testable in node and deterministic on screen - the render loop
 * asks "where is everybody at t", it never accumulates.
 *
 * ## The vocabulary, deliberately small
 *
 * FFT's readback: an attack is a step toward, a hit is a flinch and a flash.
 * No tweened walk cycles, no per-class swing arcs - at 240p a whole animation
 * language would smear, and the two motions a table actually reads are "who
 * swung" and "who got hit". Durations sit under half a second so the game
 * never feels like it is waiting for its own theatre.
 */

export const LUNGE_MS = 260;
export const SHAKE_MS = 380;
export const FLASH_MS = 450;

/** How far a lunge carries, in drawing units: about half a tile. */
export const LUNGE_REACH = HW * 0.6;

/** What one token's animations add up to this frame. */
export interface Motion {
  dx: number;
  dy: number;
  /** The red hit wash's opacity right now; 0 means no wash this frame. */
  flashAlpha: number;
}

export interface TokenAnim {
  id: string;
  kind: 'lunge' | 'hit';
  /** `performance.now()` when it started. */
  start: number;
  /** For a lunge: toward the target, in drawing units (not normalised). */
  dir?: { x: number; y: number };
}

/**
 * The lunge: out and back on a half-sine, so it leaves and returns with no
 * snap at either end. Null once it is over - the caller prunes on null.
 */
export function lungeOffset(
  elapsed: number,
  dir: { x: number; y: number },
): { dx: number; dy: number } | null {
  if (elapsed < 0 || elapsed >= LUNGE_MS) return null;
  const length = Math.hypot(dir.x, dir.y);
  if (length === 0) return { dx: 0, dy: 0 };
  const amplitude = Math.sin((elapsed / LUNGE_MS) * Math.PI) * LUNGE_REACH;
  return { dx: (dir.x / length) * amplitude, dy: (dir.y / length) * amplitude };
}

/**
 * The flinch: a fast horizontal alternation that decays to nothing.
 * Deterministic - the same elapsed always shakes the same way - so a paused
 * frame or a probe screenshot is reproducible.
 */
export function shakeOffset(elapsed: number): { dx: number; dy: number } | null {
  if (elapsed < 0 || elapsed >= SHAKE_MS) return null;
  const decay = 1 - elapsed / SHAKE_MS;
  return { dx: Math.sin(elapsed * 0.09) * 2.4 * decay, dy: 0 };
}

/** The hit wash, fading linearly from strong to gone. */
export function flashFade(elapsed: number): number | null {
  if (elapsed < 0 || elapsed >= FLASH_MS) return null;
  return 0.75 * (1 - elapsed / FLASH_MS);
}

/** Drop everything that has finished. */
export function pruneAnims(anims: TokenAnim[], now: number): TokenAnim[] {
  return anims.filter((anim) => {
    const elapsed = now - anim.start;
    return elapsed < (anim.kind === 'lunge' ? LUNGE_MS : Math.max(SHAKE_MS, FLASH_MS));
  });
}

/**
 * Everybody's motion this frame. One token can hold both kinds at once - the
 * counter-attacked attacker - and the offsets simply add.
 */
export function motionFor(anims: TokenAnim[], now: number): Map<string, Motion> {
  const out = new Map<string, Motion>();
  for (const anim of anims) {
    const elapsed = now - anim.start;
    const motion = out.get(anim.id) ?? { dx: 0, dy: 0, flashAlpha: 0 };
    if (anim.kind === 'lunge' && anim.dir) {
      const offset = lungeOffset(elapsed, anim.dir);
      if (offset) {
        motion.dx += offset.dx;
        motion.dy += offset.dy;
      }
    } else if (anim.kind === 'hit') {
      const offset = shakeOffset(elapsed);
      if (offset) {
        motion.dx += offset.dx;
        motion.dy += offset.dy;
      }
      motion.flashAlpha = Math.max(motion.flashAlpha, flashFade(elapsed) ?? 0);
    }
    out.set(anim.id, motion);
  }
  return out;
}
