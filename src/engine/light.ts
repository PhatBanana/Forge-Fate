import { distanceBetween } from '../encounter';
import type { Square } from '../encounter';

/**
 * Light, darkness, and who can see through them.
 *
 * ## Why this is the biggest gap the audit found
 *
 * The battlefield has had fog of war since §19.1 - what the party can see,
 * by line of sight, from their own eyes. What it has never had is a reason
 * for a corridor to be dark. Line of sight had unlimited range and every
 * square was implicitly floodlit, so a dungeon at midnight played exactly
 * like a meadow at noon, and darkvision - a trait the Builder *rates*, and
 * one of the top three reasons anyone picks a species - changed nothing at
 * all. Most dungeons are dark. That was the gap.
 *
 * ## The three levels, and the two obscurities
 *
 * The SRD keeps light and obscurity as separate ideas that happen to line
 * up, and this module keeps them lined up on purpose:
 *
 * - **Bright light** - see normally.
 * - **Dim light** - *lightly obscured*: disadvantage on Perception checks
 *   that rely on sight. You can still see; you just miss things.
 * - **Darkness** - *heavily obscured*: you are effectively blinded when
 *   trying to see anything in it.
 *
 * Darkvision shifts a creature one step up the ladder within its range:
 * darkness reads as dim, dim reads as bright. It does **not** make darkness
 * read as bright, which is the mistake everyone makes at the table - a
 * dwarf in an unlit room still has disadvantage on Perception.
 *
 * ## What this refuses to model
 *
 * **Shadows.** Light here spreads by distance and does not care what is in
 * the way, so a torch lights the far side of a pillar. Doing it properly
 * means running `lineOfSight` from every source to every square on every
 * render, and the honest trade is that a DM can see where the torch is and
 * rule on the one square it matters for. Stated here rather than discovered.
 *
 * **Bright light as an advantage.** Sunlight Sensitivity is on four
 * species and two dozen stat blocks, and it turns on *sunlight*
 * specifically rather than on bright light - a torch does not trigger it.
 * Nothing here can tell one from the other, so it stays a ruling.
 */

/** The three levels, darkest last, so a comparison is an index. */
export type LightLevel = 'bright' | 'dim' | 'dark';

const LADDER: LightLevel[] = ['bright', 'dim', 'dark'];

/** How dark it is, as a number, so "one step brighter" is subtraction. */
const rankOfLight = (level: LightLevel): number => LADDER.indexOf(level);

/** The brighter of two levels, which is how overlapping *light* works. */
export const brighter = (a: LightLevel, b: LightLevel): LightLevel =>
  rankOfLight(a) <= rankOfLight(b) ? a : b;

/** One step up the ladder, which is exactly what darkvision buys. */
export const oneBrighter = (level: LightLevel): LightLevel =>
  LADDER[Math.max(0, rankOfLight(level) - 1)];

/** A light on the map, or in somebody's hand. */
export interface LightSource {
  id: string;
  label: string;
  /** Where it stands - absent when it is carried. */
  at?: Square;
  /**
   * Carried by this combatant, in which case the position is theirs and
   * moves when they do. A torch is the commonest light in the game and a
   * torch that stays where it was lit is not a torch.
   */
  carriedBy?: string;
  /** Feet of bright light. */
  bright: number;
  /** Feet of dim light *beyond* the bright radius, as the book states it. */
  dim: number;
  /** Snuffed without being deleted: the same lamp, currently out. */
  out?: boolean;
}

/** The lights a table actually puts on a map, with the SRD's own radii. */
export const LIGHT_KINDS: {
  id: string;
  label: string;
  bright: number;
  dim: number;
  hint: string;
}[] = [
  { id: 'candle', label: 'Candle', bright: 5, dim: 5, hint: '5 ft bright, 5 dim — one hour of it' },
  { id: 'torch', label: 'Torch', bright: 20, dim: 20, hint: '20 ft bright, 20 dim — the standard hand-held light' },
  { id: 'lamp', label: 'Lamp', bright: 15, dim: 30, hint: '15 ft bright, 30 dim — six hours on a flask of oil' },
  { id: 'lantern', label: 'Hooded lantern', bright: 30, dim: 30, hint: '30 ft bright, 30 dim — and it can be hooded down to 5 ft dim' },
  {
    id: 'bullseye',
    label: 'Bullseye lantern',
    bright: 60,
    dim: 60,
    hint: '60 ft bright, 60 dim — a cone in the book; this map lights it as a circle',
  },
  { id: 'light', label: 'Light (cantrip)', bright: 20, dim: 20, hint: '20 ft bright, 20 dim — an hour, on an object' },
  { id: 'daylight', label: 'Daylight', bright: 60, dim: 60, hint: '60 ft bright, 60 dim — the third-level spell' },
  { id: 'fire', label: 'Campfire', bright: 20, dim: 20, hint: '20 ft bright, 20 dim — scenery that happens to be lit' },
];

/**
 * How bright one square is.
 *
 * The brightest source wins rather than the levels adding up: two torches do
 * not make daylight, and the SRD has no notion of light stacking. Ambient is
 * the floor - an unlit dungeon is `dark`, and an outdoor fight at noon is
 * `bright`, which is the default so that every encounter that existed before
 * this section plays exactly as it did.
 */
export function lightAt(sources: LightSource[], at: Square, ambient: LightLevel = 'bright'): LightLevel {
  let level = ambient;
  for (const source of sources) {
    if (source.out || !source.at) continue;
    const feet = distanceBetween(source.at, at);
    // Bright is the top of the ladder, so inside a bright radius the answer
    // is bright no matter what was there before.
    if (feet <= source.bright) level = 'bright';
    else if (feet <= source.bright + source.dim) level = brighter(level, 'dim');
  }
  return level;
}

/**
 * A source with its position resolved, so `lightAt` never has to know that
 * carried lights exist.
 *
 * A carried light whose bearer is off the map lights nothing, rather than
 * lighting the origin - which is what an unresolved `undefined` would do if
 * this returned it with a default.
 */
export function placeLights(
  sources: LightSource[],
  where: (combatantId: string) => Square | undefined,
): LightSource[] {
  return sources
    .map((source) => {
      if (!source.carriedBy) return source;
      const at = where(source.carriedBy);
      return at ? { ...source, at } : { ...source, at: undefined };
    })
    .filter((source) => !!source.at);
}

/** What one creature's eyes are worth, beyond where they are. */
export interface Eyes {
  at: Square;
  /**
   * Feet of darkvision. Within it, darkness reads as dim and dim as bright -
   * one step, not two.
   */
  darkvision?: number;
  /**
   * Feet of blindsight or truesight, within which light is irrelevant. Both
   * collapse to one number here because they differ only in what *else*
   * they see through, and this module is about light.
   */
  blindsight?: number;
}

/**
 * How a square reads to these particular eyes.
 *
 * The whole of darkvision, in three lines: one step up the ladder, within
 * range, and no further. A creature with 60 ft darkvision standing in an
 * unlit room sees the room as dim - not as day.
 */
export function seenAs(eyes: Eyes, at: Square, level: LightLevel): LightLevel {
  const feet = distanceBetween(eyes.at, at);
  if (eyes.blindsight && feet <= eyes.blindsight) return 'bright';
  if (eyes.darkvision && feet <= eyes.darkvision) return oneBrighter(level);
  return level;
}

/**
 * Whether these eyes can make anything out here at all.
 *
 * Darkness is heavily obscured, which the SRD spells out as "effectively
 * blinded" - so this is the difference between a creature being on your map
 * and not. Dim light is *lightly* obscured, so it is still seen; you just
 * roll Perception at disadvantage, which is `perceptionPenalty` below.
 */
export function canSeeInto(eyes: Eyes, at: Square, level: LightLevel): boolean {
  return seenAs(eyes, at, level) !== 'dark';
}

/**
 * What dim light costs a passive Perception.
 *
 * The active check is disadvantage; a *passive* score takes -5 instead,
 * which is the SRD's own conversion and the only form this app can apply -
 * the fog's spotting checks are passive by design, because asking the DM to
 * roll Perception for every monster every round is not a tool, it is a
 * chore.
 */
export function perceptionPenalty(level: LightLevel): number {
  return level === 'dim' ? -5 : 0;
}

/**
 * Feet out of a trait or sense line: "Darkvision 60 ft." is 60.
 *
 * Both sides of the table state a range in prose - a species trait is
 * `{ name: 'Darkvision 60 ft.' }` and a stat block is `{ darkvision: 60 }` -
 * and this is the half that has to be read rather than looked up. Zero when
 * there is no number, which reads as "no darkvision" everywhere it is used.
 */
export function feetIn(text: string): number {
  const match = /(\d+)\s*(?:ft|feet|foot)/i.exec(text);
  return match ? Number(match[1]) : 0;
}
