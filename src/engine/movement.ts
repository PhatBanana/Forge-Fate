import type { MoveGrant } from '../types';
import { CLASS_OPTIONS } from '../data/classOptions';
import { featById } from '../data/feats';
import type { BuildContext } from './character';

/**
 * Climbing, swimming, crawling and jumping: what they cost and how far you go.
 *
 * ## The rule, and where the numbers come from
 *
 * Verified against SRD 5.1 `rule-sections/movement` and
 * `movement-and-position` rather than written from memory, because every one
 * of these is a number somebody will check at a table:
 *
 * - *"While climbing or swimming, each foot of movement costs 1 extra foot
 *   (2 extra feet in difficult terrain), unless a creature has a climbing or
 *   swimming speed."*
 * - *"Every foot of movement while crawling costs 1 extra foot. Crawling 1
 *   foot in difficult terrain, therefore, costs 3 feet of movement."*
 * - *"Standing up costs an amount of movement equal to half your speed."*
 * - Long jump: *"a number of feet up to your Strength score if you move at
 *   least 10 feet on foot immediately before"*, half that standing. High
 *   jump: *"3 + your Strength modifier"*, half that standing. Either way,
 *   *"each foot you clear on the jump costs a foot of movement"*.
 *
 * That last clause is why jumping needs no cost model of its own: a jump is
 * paid for out of the same feet a step is, so the map already charges it. What
 * the app was missing was the *distance* - the number a player asks for when
 * there is a chasm in front of them.
 *
 * ## Why the surcharges stack the way they do
 *
 * The two rules above are stated as separate extras and they add: difficult
 * ground is +1 foot per foot, climbing is another, and 1 + 1 + 1 = 3, which
 * is the number the crawling rule spells out. Difficult terrain does *not*
 * stack with itself ("even if multiple things in a space count as difficult
 * terrain"), which is why `difficult` is a boolean here rather than a count.
 *
 * ## What is the same in both editions, and how that was checked
 *
 * SRD 5.2 moves these to a Rules Glossary that neither dnd5eapi nor open5e
 * carries, so the 2024 numbers could not be verified the way the 2014 ones
 * were. What *is* verified from open5e's SRD 5.2 "Movement and Position" is
 * that difficult terrain is still 1 extra foot and that climbing, crawling,
 * jumping and swimming are still modes of ordinary movement rather than
 * something new. So this module has no edition split - and if 5.2 ever turns
 * out to differ, the fix is a table here rather than a branch, which is the
 * lesson §46, §47, §51 and §60 each paid for separately.
 */

/** A square is five feet, and that is the unit every cost here is in. */
export const SQUARE_FEET = 5;

/** How far you must move on foot first for a running jump to be a running one. */
export const RUN_UP_FEET = 10;

/** What is happening in a square that changes what entering it costs. */
export interface MoveConditions {
  /** Rubble, water, a web - the ordinary doubling. */
  difficult?: boolean;
  /** Entering means going up: a cliff, a ledge, the side of a building. */
  climbing?: boolean;
  /** Entering means swimming it, not wading it. */
  swimming?: boolean;
  /** The mover is prone, so every foot of this is a crawl. */
  crawling?: boolean;
}

/** What the mover brings to that, and which surcharges it waives. */
export interface Mover {
  /** A climbing speed, or the plain waiver - either one ignores the extra. */
  climbFree?: boolean;
  swimFree?: boolean;
}

/**
 * What it costs to enter one square, in feet.
 *
 * Five, plus five for difficult ground, plus five more for a foot of the move
 * that is a climb, a swim or a crawl.
 *
 * At most one of those last three is charged, and that is **a ruling rather
 * than a rule**: the SRD prices climbing, swimming and crawling separately
 * and never says what a creature crawling up a cliff pays. Stacking them
 * reads as literal, but it triples a cost off a combination nobody wrote
 * down, so this takes the cheaper reading and says so here rather than
 * leaving a DM to work out which it did.
 */
export function squareCost(conditions: MoveConditions, mover: Mover = {}): number {
  let feet = SQUARE_FEET;
  if (conditions.difficult) feet += SQUARE_FEET;

  const climbing = conditions.climbing && !mover.climbFree;
  const swimming = conditions.swimming && !mover.swimFree;
  if (climbing || swimming || conditions.crawling) feet += SQUARE_FEET;

  return feet;
}

/** What standing up from prone costs, in feet. */
export function standUpCost(speed: number, quickStand = false): number {
  if (quickStand) return SQUARE_FEET;
  return Math.floor(speed / 2);
}

// ------------------------------------------------------------ the character

/** Everything on a character that could be carrying a movement grant. */
export function moveGrantsFor(ctx: BuildContext): MoveGrant[] {
  const out: MoveGrant[] = [];

  for (const trait of ctx.race.traits) {
    if (trait.move) out.push(trait.move);
  }
  // Class and subclass features, already filtered to the levels reached.
  for (const feature of ctx.features) {
    if (feature.move) out.push(feature.move);
  }
  for (const id of ctx.build.classOptionIds ?? []) {
    const option = CLASS_OPTIONS.find((o) => o.id === id);
    if (option?.move) out.push(option.move);
  }
  for (const id of ctx.featIds) {
    const feat = featById(id, ctx.build.ruleset);
    if (feat?.move) out.push(feat.move);
  }
  // Worn items, already filtered to the ones actually working.
  out.push(...ctx.itemEffects.move);

  return out;
}

/** What a character can do about getting around, as one answer. */
export interface MovementProfile {
  /** The walking speed this was resolved against. */
  walk: number;
  /** A climbing speed in feet, or 0 for none. */
  climb: number;
  swim: number;
  /** Whether climbing costs nothing extra - a speed or a bare waiver. */
  climbFree: boolean;
  swimFree: boolean;
  /** What jump distances are multiplied by. 1 when nothing multiplies them. */
  jumpTimes: number;
  /** Flat feet added to a jump, before the multiplier. */
  jumpBonus: number;
  /** Whether a jump is measured by Dexterity rather than Strength. */
  jumpByDex: boolean;
  /** Whether standing from prone is a flat five feet rather than half. */
  quickStand: boolean;
  /**
   * What standing up costs against the *build's* walking speed.
   *
   * A convenience for the sheet. Anywhere the speed can differ from the
   * build's - the battle screen, where conditions, exhaustion and dragging
   * all get a say - call `standUpCost(speedNow, profile.quickStand)` instead.
   * Reading this number and comparing it to five to work out whether the
   * grant is present is exactly the kind of inference this project keeps
   * getting burned by: a character with a speed of 10 has a half of five.
   */
  standUp: number;
}

/**
 * The best of a set of grants, as one answer.
 *
 * Best-wins throughout, like `resolveSight`: a Water Genasi in a Ring of
 * Swimming has one swim speed of 40, not two. `'walk'` resolves here rather
 * than on the record, because "equal to your walking speed" has to wait for
 * Fast Movement and Unarmored Movement to finish having their say.
 *
 * **A climbing speed implies the waiver.** The SRD's own sentence makes the
 * extra cost conditional on not having the speed, so a grant of one is a
 * grant of both - and that is the whole reason the two fields exist
 * separately: the implication runs one way only, and the Rogue who has the
 * waiver has not been handed a wall-crawl.
 */
export function resolveMovement(grants: MoveGrant[], walk: number): MovementProfile {
  const speedOf = (value: number | 'walk' | undefined): number => {
    if (value === undefined) return 0;
    return value === 'walk' ? walk : value;
  };

  const quickStand = grants.some((g) => g.quickStand);
  const climb = grants.reduce((best, g) => Math.max(best, speedOf(g.climb)), 0);
  const swim = grants.reduce((best, g) => Math.max(best, speedOf(g.swim)), 0);

  return {
    walk,
    climb,
    swim,
    climbFree: climb > 0 || grants.some((g) => g.climbFree),
    swimFree: swim > 0 || grants.some((g) => g.swimFree),
    jumpTimes: grants.reduce((best, g) => Math.max(best, g.jumpTimes ?? 1), 1),
    jumpBonus: grants.reduce(
      (sum, g) => sum + (typeof g.jumpBonus === 'number' ? g.jumpBonus : 0),
      0,
    ),
    jumpByDex: grants.some((g) => g.jumpBonus === 'dex'),
    quickStand,
    standUp: standUpCost(walk, quickStand),
  };
}

/** What this character can do about getting around, from the whole build. */
export function movementFor(ctx: BuildContext): MovementProfile {
  return resolveMovement(moveGrantsFor(ctx), ctx.speed.total);
}

// ------------------------------------------------------------------- jumping

export interface JumpDistances {
  /** Feet cleared with a run-up of at least `RUN_UP_FEET`. */
  longRunning: number;
  /** Half of that, from standing. */
  longStanding: number;
  highRunning: number;
  highStanding: number;
}

/**
 * How far this character jumps, in feet.
 *
 * Long jump is the Strength *score*, not the modifier, which is the one thing
 * everybody gets wrong about this rule - a Strength 16 fighter clears sixteen
 * feet, not three. High jump is 3 + the modifier, which is a different shape
 * for the same ability and is why they cannot share a line.
 *
 * A minimum of zero rather than a negative high jump: 3 + a -4 modifier is
 * -1 feet, which is not a thing a body does.
 */
export function jumpDistances(
  scores: { str: number; dex: number },
  mods: { str: number; dex: number },
  profile: MovementProfile,
): JumpDistances {
  // The 2024 Thief measures a running jump by Dexterity. The rule swaps the
  // ability, not the formula, so both halves move together.
  const score = profile.jumpByDex ? scores.dex : scores.str;
  const mod = profile.jumpByDex ? mods.dex : mods.str;

  const long = Math.max(0, (score + profile.jumpBonus) * profile.jumpTimes);
  const high = Math.max(0, (3 + mod + profile.jumpBonus) * profile.jumpTimes);

  return {
    longRunning: long,
    // Halved *after* the multiplier, because "you can leap only half that
    // distance" is written against the distance the running jump reached.
    longStanding: Math.floor(long / 2),
    highRunning: high,
    highStanding: Math.floor(high / 2),
  };
}

/** "16 ft. running, 8 ft. standing" - the line a sheet prints. */
export function describeJump(running: number, standing: number): string {
  return `${running} ft. running, ${standing} ft. standing`;
}
