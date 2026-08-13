import { HH, HW } from '../iso';

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

/** The walk's pace (§69), and the ceiling a long dash must fit under. */
export const WALK_TILE_MS = 140;
export const WALK_MAX_MS = 900;

/** How high the walking hop lifts, in drawing units. */
export const HOP_LIFT = HH * 0.35;

/** What one token's animations add up to this frame. */
export interface Motion {
  dx: number;
  dy: number;
  /**
   * §69: where the *ground* under the figure is - the shadow's offset and
   * the paint-order shift. A lunge or a flinch leaves these at zero (the
   * shadow stays put, which is what makes those read as a step and a
   * stagger); a walk carries them, because a figure three tiles from its
   * own shadow reads as flying.
   */
  gdx: number;
  gdy: number;
  ddepth: number;
  /** The red hit wash's opacity right now; 0 means no wash this frame. */
  flashAlpha: number;
}

/** One projected square along a walked route. */
export interface WalkPoint {
  x: number;
  y: number;
  depth: number;
}

export interface TokenAnim {
  id: string;
  kind: 'lunge' | 'hit' | 'walk';
  /** `performance.now()` when it started. */
  start: number;
  /** For a lunge: toward the target, in drawing units (not normalised). */
  dir?: { x: number; y: number };
  /** For a walk: the route's projected centres, origin first. */
  path?: WalkPoint[];
  /** For a walk: hop each tile (a walk) or glide flat (a shove, a drag). */
  hop?: boolean;
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

/**
 * How long walking a route takes: a steady pace per tile, squeezed under a
 * ceiling so a twelve-tile dash does not hold the table for two seconds.
 */
export function walkDuration(path: WalkPoint[]): number {
  const segments = path.length - 1;
  if (segments <= 0) return 0;
  return Math.min(segments * WALK_TILE_MS, WALK_MAX_MS);
}

/**
 * The walk (§69): where along the route the body is at `elapsed`, expressed
 * as an offset from the route's *end* - the token's state already stands on
 * the destination, so the animation walks the drawing backward through the
 * squares it just crossed. Constant pace, no easing: PS1 pieces marched.
 *
 * Returns the ground's offset (`gdx`/`gdy`/`ddepth` - the shadow and the
 * paint order follow the body through the world) plus `lift`, the hop's
 * height above that ground: one hop per tile, zero exactly at each tile
 * boundary, so the figure lands on every square it crosses.
 */
export function walkOffset(
  elapsed: number,
  path: WalkPoint[],
): { gdx: number; gdy: number; ddepth: number; lift: number } | null {
  const total = walkDuration(path);
  if (elapsed < 0 || elapsed >= total || total === 0) return null;
  const segments = path.length - 1;
  const along = (elapsed / total) * segments;
  const seg = Math.min(Math.floor(along), segments - 1);
  const t = along - seg;
  const a = path[seg];
  const b = path[seg + 1];
  const end = path[segments];
  return {
    gdx: a.x + (b.x - a.x) * t - end.x,
    gdy: a.y + (b.y - a.y) * t - end.y,
    ddepth: a.depth + (b.depth - a.depth) * t - end.depth,
    lift: Math.sin(t * Math.PI) * HOP_LIFT,
  };
}

/** Drop everything that has finished. */
export function pruneAnims(anims: TokenAnim[], now: number): TokenAnim[] {
  return anims.filter((anim) => {
    const elapsed = now - anim.start;
    if (anim.kind === 'lunge') return elapsed < LUNGE_MS;
    if (anim.kind === 'walk') return elapsed < walkDuration(anim.path ?? []);
    return elapsed < Math.max(SHAKE_MS, FLASH_MS);
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
    const motion = out.get(anim.id) ?? { dx: 0, dy: 0, gdx: 0, gdy: 0, ddepth: 0, flashAlpha: 0 };
    if (anim.kind === 'lunge' && anim.dir) {
      const offset = lungeOffset(elapsed, anim.dir);
      if (offset) {
        motion.dx += offset.dx;
        motion.dy += offset.dy;
      }
    } else if (anim.kind === 'walk' && anim.path) {
      const offset = walkOffset(elapsed, anim.path);
      if (offset) {
        // The body rides the ground; the hop (a walk, not a shove) lifts the
        // figure off it. A hit taken mid-walk still shakes on top.
        motion.gdx += offset.gdx;
        motion.gdy += offset.gdy;
        motion.ddepth += offset.ddepth;
        motion.dx += offset.gdx;
        motion.dy += offset.gdy - (anim.hop ? offset.lift : 0);
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
