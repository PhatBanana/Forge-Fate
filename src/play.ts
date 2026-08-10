import { SORCERY_POINT_SLOT_COSTS } from './data/classResources';
import { appendRoll } from './engine/dice';
import type { RollRecord } from './engine/dice';
import type { ClassId, CustomResource } from './types';

/**
 * What changes during a session rather than between them.
 *
 * Everything else in this app describes a character; this describes their
 * afternoon. It is kept apart from `Build` for that reason - spending a slot is
 * not editing your character, and it should not land on the undo stack next to
 * "I took Sharpshooter".
 *
 * Unlike the undo history this **is** persisted. Losing your hit points to a
 * refresh mid-fight is exactly the failure that would make the feature useless.
 *
 * Class resources - Rage, Ki, Sorcery points, Channel Divinity and the rest -
 * are spent here too, against the table in `data/classResources.ts`. They are
 * keyed by class as well as resource, because a multiclass character can hold
 * two that share a name.
 */

export interface DeathSaves {
  successes: number;
  failures: number;
}

/**
 * One turn's worth of action economy.
 *
 * Three things you get once and a distance you get to cover, and the whole
 * reason to track them is that they do not all come back at the same moment.
 * Your action, your bonus action and your movement are yours again when your
 * turn starts; so is your reaction - and that last one is the rule tables get
 * wrong most often, because a reaction spent on somebody else's turn feels
 * spent "last turn" and gets ticked back too early. Nothing here refreshes at
 * the *end* of a turn, which is why the control is called "New turn".
 */
export interface TurnState {
  action: boolean;
  bonusAction: boolean;
  reaction: boolean;
  /** Feet covered so far this turn. */
  moved: number;
  /**
   * How many times you have Dashed. Each one adds your speed again rather
   * than doubling what is left, which is what the rule actually says - Dashing
   * after you have already moved 20 of 30 feet gives you 40 feet left, not 20.
   */
  dashes: number;
  /**
   * The action spent on how you are standing rather than on what you did.
   *
   * Disengage and Dodge were both offered from the very first command menu and
   * both only ever wrote a line in the log, which made Disengage the most
   * expensive no-op in the app: an entire action bought against a rule nothing
   * enforced. Recorded here because it is per-turn state that comes back with
   * everything else - `newTurn` clears it, and that is exactly right, since
   * dodging protects you until *your* next turn begins.
   */
  stance?: 'disengage' | 'dodge';
  /**
   * Spells cast this turn, and whether one of them took the bonus action.
   *
   * The 2014 rule that nothing enforced: "if you cast a spell with a bonus
   * action, you can't cast another spell during the same turn, except a
   * cantrip with a casting time of 1 action". Two flags rather than one,
   * because the restriction fires in either order - a bonus-action spell
   * after an action spell breaks it just as surely - and the menu needs to
   * know both which happened and whether either did.
   */
  spellCast?: boolean;
  bonusSpellCast?: boolean;
}

export function emptyTurn(): TurnState {
  return { action: false, bonusAction: false, reaction: false, moved: 0, dashes: 0 };
}

export interface PlayState {
  /**
   * Null means "at full". Storing it that way rather than as a number means
   * levelling up, or a Constitution increase, does not strand you on a maximum
   * that no longer exists.
   */
  currentHp: number | null;
  tempHp: number;
  /** Hit dice spent, by class id, since a multiclass character has several kinds. */
  hitDiceSpent: Partial<Record<ClassId, number>>;
  /** Slots spent at each level; index 0 is 1st level. */
  slotsSpent: number[];
  /**
   * Slots conjured out of sorcery points, above what the class table gives.
   * Kept apart from `slotsSpent` rather than counted as a negative spend, so
   * "you have four 1st-level slots because you made one" stays legible - and so
   * a long rest can take the made-up ones away, which the rules require.
   */
  slotsCreated: number[];
  /** Warlock slots, which come back on a short rest and so are counted apart. */
  pactSpent: number;
  /** Class resources spent, keyed "classId:resourceId". */
  resourcesSpent: Record<string, number>;
  /**
   * Ammunition shot, by gear id. Unlike everything else here it survives a
   * rest, because arrows do not grow back - you recover half of them off the
   * battlefield and buy the rest.
   */
  ammoSpent: Record<string, number>;
  deathSaves: DeathSaves;
  /**
   * Condition ids currently on you. A list rather than a set because it has to
   * survive JSON, and small enough that membership is a filter.
   */
  conditions: string[];
  /** Who caused a condition, by combatant id - see `MonsterCombatant`. Only
      the conditions that turn on a source ever appear here. */
  conditionSources?: Record<string, string>;
  /** 0 to 6. Six is death, and the app says so rather than hiding it. */
  exhaustion: number;
  /**
   * Experience earned, total.
   *
   * Here rather than on the build because it is a record of what happened at
   * the table, like hit points and spent slots, rather than a description of
   * the character - and because the battle screen is what writes it. No rest
   * touches it: nobody unlearns a fight.
   *
   * The app deliberately does not say what level this makes you. The
   * XP-per-level table is not in the data this project ships, and a number on
   * a character sheet that nothing in this repository can source is exactly
   * what the provenance discipline exists to prevent. Milestone tables ignore
   * the threshold anyway.
   *
   * Optional, and absent on every character who has not been in a fight.
   */
  xp?: number;
  /**
   * The last few dice rolls, newest first, capped at `ROLL_LOG_LIMIT`.
   *
   * This is history rather than state: no rest clears it, and `isFresh` does
   * not count it, because "you have rolled dice today" is not something a rest
   * could undo. It lives here rather than in component state so a refresh
   * mid-fight does not lose the roll everyone is still arguing about.
   */
  rolls: RollRecord[];
  /** What is left of this turn. See `TurnState`. */
  turn: TurnState;
  /**
   * Where each user-defined counter stands, by its id. Stored as the value on
   * screen rather than as an amount spent, because these run both ways - a
   * pool counts down and a score counts up, and "spent" has no meaning for the
   * second. Absent means the counter is at its starting value.
   */
  customValues: Record<string, number>;
  /**
   * The spell being concentrated on, by name. One at a time, which is the
   * whole rule: casting a second drops the first, and that drop is the thing
   * tables forget. Absent means not concentrating.
   */
  concentratingOn?: string;
  /**
   * Rounds left on a condition, by condition id. A condition without an entry
   * lasts until somebody removes it. Ticked as rounds pass, the same clock the
   * zones run on - round granularity is an approximation of "until the end of
   * its next turn", and the honest one available.
   */
  conditionTimers?: Record<string, number>;
  /**
   * Heroic Inspiration: one reroll, held or spent.
   *
   * A boolean rather than a count, because that is the rule - "you either have
   * it or you don't, and you can't stockpile it". The 2024 Human gets one on
   * every long rest and a DM hands them out for good play; either way the only
   * question a sheet has to answer is whether one is in hand.
   *
   * Absent means no, so nothing changes for a character who has never been
   * given one.
   */
  inspiration?: boolean;
}

export function emptyPlay(): PlayState {
  return {
    currentHp: null,
    tempHp: 0,
    hitDiceSpent: {},
    slotsSpent: [],
    slotsCreated: [],
    pactSpent: 0,
    resourcesSpent: {},
    ammoSpent: {},
    deathSaves: { successes: 0, failures: 0 },
    conditions: [],
    exhaustion: 0,
    rolls: [],
    turn: emptyTurn(),
    customValues: {},
  };
}

// -------------------------------------------------------- user-made counters

/** Where a counter sits when nothing has happened to it yet. */
export const customStart = (resource: CustomResource): number =>
  resource.startsAt === 'full' ? resource.max : 0;

export function customValue(play: PlayState, resource: CustomResource): number {
  const stored = play.customValues[resource.id];
  return clamp(stored ?? customStart(resource), 0, resource.max);
}

export function setCustomValue(
  play: PlayState,
  resource: CustomResource,
  value: number,
): PlayState {
  return {
    ...play,
    customValues: {
      ...play.customValues,
      [resource.id]: clamp(Math.round(value), 0, resource.max),
    },
  };
}

export function stepCustom(play: PlayState, resource: CustomResource, delta: number): PlayState {
  return setCustomValue(play, resource, customValue(play, resource) + delta);
}

/**
 * Put back the counters this rest recharges, and leave the rest alone. A long
 * rest recharges both kinds, since anything that comes back on a short rest
 * also comes back on a long one; `none` is untouched by either, which is what
 * a score like piety needs.
 */
function rechargeCustom(
  values: Record<string, number>,
  resources: CustomResource[],
  rest: 'short' | 'long',
): Record<string, number> {
  const next = { ...values };
  for (const resource of resources) {
    if (resource.recharge === 'none') continue;
    if (rest === 'short' && resource.recharge !== 'short') continue;
    next[resource.id] = customStart(resource);
  }
  return next;
}

// ------------------------------------------------------------ action economy

/** The three you get one of. Movement is a distance, so it is handled apart. */
export type TurnSlot = 'action' | 'bonusAction' | 'reaction';

export function setTurnSlot(play: PlayState, slot: TurnSlot, spent: boolean): PlayState {
  if (play.turn[slot] === spent) return play;
  return { ...play, turn: { ...play.turn, [slot]: spent } };
}

export function toggleTurnSlot(play: PlayState, slot: TurnSlot): PlayState {
  return setTurnSlot(play, slot, !play.turn[slot]);
}

/**
 * How far you can go this turn: your speed, plus your speed again for every
 * Dash. Dashing is *added* to the budget rather than applied to what is left,
 * which is what the rule says and what a half-moved character would otherwise
 * get wrong.
 */
export function movementBudget(play: PlayState, speed: number): number {
  return Math.max(0, speed) * (1 + play.turn.dashes);
}

export function movementLeft(play: PlayState, speed: number): number {
  return Math.max(0, movementBudget(play, speed) - play.turn.moved);
}

/** Move, clamped at nought and at what is left. Negative takes it back. */
export function moveBy(play: PlayState, feet: number, speed: number): PlayState {
  const moved = clamp(play.turn.moved + feet, 0, movementBudget(play, speed));
  if (moved === play.turn.moved) return play;
  return { ...play, turn: { ...play.turn, moved } };
}

/**
 * Dash. Deliberately does *not* spend the action itself: Dash is an action
 * for most characters, a bonus action for a Rogue's Cunning Action, and free
 * for a Tabaxi burning Feline Agility. Guessing which would be wrong for two
 * of the three, so the extra movement is granted and the cost is a separate
 * click.
 */
export function dash(play: PlayState): PlayState {
  return { ...play, turn: { ...play.turn, dashes: play.turn.dashes + 1 } };
}

/**
 * The start of your turn, which is when all four come back - the reaction
 * included, since you regain it at the start of each of your turns rather
 * than at the end of the last one.
 */
export function newTurn(play: PlayState): PlayState {
  return { ...play, turn: emptyTurn() };
}

/**
 * Hand somebody their share of a fight.
 *
 * Additive rather than assigning, because two fights in an evening is two
 * awards - and because the debrief that calls this has no idea what came
 * before it.
 */
export function awardXp(play: PlayState, amount: number): PlayState {
  if (amount <= 0) return play;
  return { ...play, xp: (play.xp ?? 0) + amount };
}

/**
 * Take the Disengage or the Dodge, which is a thing you *are* until your next
 * turn rather than a thing you did. The action itself is spent by the caller,
 * because the two facts come from different places: the tray knows a pip went,
 * this knows what it bought.
 */
export function setStance(play: PlayState, stance: 'disengage' | 'dodge'): PlayState {
  return { ...play, turn: { ...play.turn, stance } };
}

/** Whether anything of this turn has been used. */
export function turnSpent(turn: TurnState): boolean {
  return turn.action || turn.bonusAction || turn.reaction || turn.moved > 0 || turn.dashes > 0;
}

/** Puts a roll at the top of the log. The engine decides what it says. */
export function recordRoll(play: PlayState, record: Omit<RollRecord, 'id'>): PlayState {
  return { ...play, rolls: appendRoll(play.rolls, record) };
}

export function clearRolls(play: PlayState): PlayState {
  return play.rolls.length ? { ...play, rolls: [] } : play;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Hit points right now, resolving the "at full" default against the maximum. */
export function hpNow(play: PlayState, max: number): number {
  return play.currentHp === null ? max : clamp(play.currentHp, 0, max);
}

/**
 * Temporary hit points are spent first and are not healed back - they are a
 * buffer, not part of you, which is the rule people most often play wrong.
 */
export function damage(
  play: PlayState,
  amount: number,
  max: number,
  /**
   * Whether this damage came from a critical hit, which matters only when the
   * target is already down: "if the damage is from a critical hit, you suffer
   * two failures instead". A downed character on two failures dies to a crit
   * and survives an ordinary hit, so the difference is the whole outcome -
   * and the app applied one failure either way until this was checked.
   */
  fromCrit = false,
): PlayState {
  if (amount <= 0) return play;
  const absorbed = Math.min(play.tempHp, amount);
  const remaining = amount - absorbed;
  const hp = clamp(hpNow(play, max) - remaining, 0, max);

  return {
    ...play,
    tempHp: play.tempHp - absorbed,
    currentHp: hp,
    // Taking damage at 0 is a failed death save - two of them from a critical
    // hit - and enough damage at once kills outright, but massive damage is a
    // table call, so only the saves are applied here.
    deathSaves:
      hpNow(play, max) === 0 && remaining > 0
        ? {
            ...play.deathSaves,
            failures: Math.min(3, play.deathSaves.failures + (fromCrit ? 2 : 1)),
          }
        : play.deathSaves,
  };
}

export function heal(play: PlayState, amount: number, max: number): PlayState {
  if (amount <= 0) return play;
  return {
    ...play,
    currentHp: clamp(hpNow(play, max) + amount, 0, max),
    // Any healing brings you back up, and death saves stop mattering.
    deathSaves: { successes: 0, failures: 0 },
  };
}

/** Temporary hit points never stack; you keep whichever pool is larger. */
export function setTempHp(play: PlayState, amount: number): PlayState {
  return { ...play, tempHp: Math.max(0, Math.max(play.tempHp, amount)) };
}

export function spendHitDie(play: PlayState, classId: ClassId, available: number): PlayState {
  const spent = play.hitDiceSpent[classId] ?? 0;
  if (spent >= available) return play;
  return { ...play, hitDiceSpent: { ...play.hitDiceSpent, [classId]: spent + 1 } };
}

export function hitDiceLeft(play: PlayState, classId: ClassId, total: number): number {
  return Math.max(0, total - (play.hitDiceSpent[classId] ?? 0));
}

export function spendSlot(play: PlayState, level: number, fromTable: number): PlayState {
  const index = level - 1;
  const spent = play.slotsSpent[index] ?? 0;
  if (spent >= slotsTotal(play, level, fromTable)) return play;
  const slotsSpent = [...play.slotsSpent];
  slotsSpent[index] = spent + 1;
  return { ...play, slotsSpent };
}

export function restoreSlot(play: PlayState, level: number): PlayState {
  const index = level - 1;
  const spent = play.slotsSpent[index] ?? 0;
  if (spent <= 0) return play;
  const slotsSpent = [...play.slotsSpent];
  slotsSpent[index] = spent - 1;
  return { ...play, slotsSpent };
}

/**
 * How many slots of a level you have at all, which is what the class table
 * gives plus anything Font of Magic conjured. Every slot reading goes through
 * here so a made slot is a slot everywhere, not just where someone remembered.
 */
export function slotsTotal(play: PlayState, level: number, fromTable: number): number {
  return fromTable + (play.slotsCreated[level - 1] ?? 0);
}

export function slotsLeft(play: PlayState, level: number, fromTable: number): number {
  return Math.max(0, slotsTotal(play, level, fromTable) - (play.slotsSpent[level - 1] ?? 0));
}

export function spendPact(play: PlayState, available: number): PlayState {
  if (play.pactSpent >= available) return play;
  return { ...play, pactSpent: play.pactSpent + 1 };
}

export function restorePact(play: PlayState): PlayState {
  return { ...play, pactSpent: Math.max(0, play.pactSpent - 1) };
}

// ------------------------------------------------------------ class resources

export function resourceLeft(play: PlayState, key: string, max: number): number {
  return Math.max(0, max - (play.resourcesSpent[key] ?? 0));
}

/** Spend `amount`, which is more than one for a pool like Lay on Hands. */
export function spendResource(
  play: PlayState,
  key: string,
  max: number,
  amount = 1,
): PlayState {
  const spent = play.resourcesSpent[key] ?? 0;
  const next = Math.min(max, spent + Math.max(0, amount));
  if (next === spent) return play;
  return { ...play, resourcesSpent: { ...play.resourcesSpent, [key]: next } };
}

export function restoreResource(play: PlayState, key: string, amount = 1): PlayState {
  const spent = play.resourcesSpent[key] ?? 0;
  const next = Math.max(0, spent - Math.max(0, amount));
  if (next === spent) return play;
  return { ...play, resourcesSpent: { ...play.resourcesSpent, [key]: next } };
}

/** Set a pool directly, for typing a number rather than clicking it down. */
export function setResourceSpent(play: PlayState, key: string, spent: number, max: number): PlayState {
  return {
    ...play,
    resourcesSpent: { ...play.resourcesSpent, [key]: clamp(Math.round(spent), 0, max) },
  };
}

// ------------------------------------------------------------------ ammunition

export function ammoLeft(play: PlayState, gearId: string, total: number): number {
  return Math.max(0, total - (play.ammoSpent[gearId] ?? 0));
}

export function spendAmmo(play: PlayState, gearId: string, total: number, amount = 1): PlayState {
  const spent = play.ammoSpent[gearId] ?? 0;
  const next = Math.min(total, spent + Math.max(0, amount));
  if (next === spent) return play;
  return { ...play, ammoSpent: { ...play.ammoSpent, [gearId]: next } };
}

/** Set the count directly, for typing a number rather than clicking it down. */
export function setAmmoLeft(
  play: PlayState,
  gearId: string,
  left: number,
  total: number,
): PlayState {
  return {
    ...play,
    ammoSpent: { ...play.ammoSpent, [gearId]: clamp(total - Math.round(left), 0, total) },
  };
}

/**
 * Searching the battlefield after a fight: a minute's work returns half of what
 * you shot, rounded down, and the rest is broken or lost.
 *
 * This is deliberately **not** wired to a rest. A rest hands back the things
 * your body and your magic recover, and arrows are neither - a tracker that
 * refilled your quiver overnight would be quietly playing a different game.
 */
export function recoverAmmo(play: PlayState, gearId: string): PlayState {
  const spent = play.ammoSpent[gearId] ?? 0;
  if (spent <= 0) return play;
  return { ...play, ammoSpent: { ...play.ammoSpent, [gearId]: spent - Math.floor(spent / 2) } };
}

/** Back to a full quiver, for when you have been to a town and bought more. */
export function restockAmmo(play: PlayState, gearId: string): PlayState {
  if (!(gearId in play.ammoSpent)) return play;
  const ammoSpent = { ...play.ammoSpent };
  delete ammoSpent[gearId];
  return { ...play, ammoSpent };
}

// --------------------------------------------------------------- Font of Magic

/**
 * Spend sorcery points to conjure a spell slot.
 *
 * Refuses rather than throws when the level cannot be made or the points are
 * not there, so the sheet can offer the exchange and let the rules decline it.
 */
export function createSlotWithPoints(
  play: PlayState,
  level: number,
  pointsKey: string,
  pointsMax: number,
): PlayState {
  const cost = SORCERY_POINT_SLOT_COSTS[level];
  if (!cost || resourceLeft(play, pointsKey, pointsMax) < cost) return play;
  const slotsCreated = [...play.slotsCreated];
  slotsCreated[level - 1] = (slotsCreated[level - 1] ?? 0) + 1;
  return { ...spendResource(play, pointsKey, pointsMax, cost), slotsCreated };
}

/**
 * Expend a spell slot for its own level in sorcery points - no table, since the
 * rate going this way is one for one with the level.
 *
 * The exchange is deliberately lossy in the rules and stays lossy here: a 5th
 * slot yields 5 points, and 5 points will not buy one back. Points above your
 * maximum are simply not gained, which is what the cap already does.
 */
export function convertSlotToPoints(
  play: PlayState,
  level: number,
  fromTable: number,
  pointsKey: string,
): PlayState {
  if (slotsLeft(play, level, fromTable) <= 0) return play;
  return restoreResource(spendSlot(play, level, fromTable), pointsKey, level);
}

/**
 * The fight begins: hand back everything that recharges per encounter.
 *
 * The narrowest of the three restore functions, and deliberately so. It
 * touches `resourcesSpent` and nothing else - not hit points, not slots, not
 * the turn - because "a fight started" is not a rest and must not read like
 * one. A character who walks into round one at four hit points still has four
 * hit points.
 *
 * Returns `play` unchanged when there is nothing to give back, so the battle
 * screen can call it on every combatant at the top of every fight without
 * writing a new object per character for no reason.
 */
export function startOfEncounter(play: PlayState, encounterKeys: string[]): PlayState {
  if (!encounterKeys.length) return play;
  const resourcesSpent = { ...play.resourcesSpent };
  let gaveBack = false;
  for (const key of encounterKeys) {
    if (key in resourcesSpent) {
      delete resourcesSpent[key];
      gaveBack = true;
    }
  }
  return gaveBack ? { ...play, resourcesSpent } : play;
}

/**
 * A short rest returns Pact Magic and nothing else here. Hit dice are spent
 * *during* a short rest rather than restored by one, which is the part of the
 * rules a tracker most easily gets backwards.
 *
 * `shortRechargeKeys` is whatever the caller says comes back, which now
 * includes per-encounter resources - see `restoredKeys` for why an hour's rest
 * must not leave you with less than walking straight into the next fight would.
 */
export function shortRest(
  play: PlayState,
  shortRechargeKeys: string[] = [],
  customResources: CustomResource[] = [],
): PlayState {
  const resourcesSpent = { ...play.resourcesSpent };
  for (const key of shortRechargeKeys) delete resourcesSpent[key];
  return {
    ...play,
    pactSpent: 0,
    resourcesSpent,
    customValues: rechargeCustom(play.customValues, customResources, 'short'),
    // A short rest is an hour long, so whatever was left of a turn is over.
    turn: emptyTurn(),
  };
}

/**
 * A long rest returns hit points and every slot, and gives back half your total
 * hit dice rounded down, minimum one - not all of them.
 */
export function longRest(
  play: PlayState,
  hitDiceByClass: Partial<Record<ClassId, number>>,
  customResources: CustomResource[] = [],
): PlayState {
  const totalDice = Object.values(hitDiceByClass).reduce((sum, n) => sum + (n ?? 0), 0);
  let toRecover = Math.max(1, Math.floor(totalDice / 2));

  // Recovered dice are handed back to whichever class has spent the most, which
  // is the choice a player would make anyway.
  const hitDiceSpent: Partial<Record<ClassId, number>> = { ...play.hitDiceSpent };
  while (toRecover > 0) {
    const worst = (Object.keys(hitDiceSpent) as ClassId[])
      .filter((id) => (hitDiceSpent[id] ?? 0) > 0)
      .sort((a, b) => (hitDiceSpent[b] ?? 0) - (hitDiceSpent[a] ?? 0))[0];
    if (!worst) break;
    hitDiceSpent[worst] = (hitDiceSpent[worst] ?? 0) - 1;
    toRecover--;
  }

  return {
    currentHp: null,
    tempHp: 0,
    hitDiceSpent,
    slotsSpent: [],
    // Slots made out of sorcery points vanish at the end of a long rest, so
    // they are cleared rather than refilled.
    slotsCreated: [],
    pactSpent: 0,
    // A long rest returns everything, whatever its own recharge.
    resourcesSpent: {},
    // Except ammunition, which is not a resource that recharges. It is a thing
    // you own fewer of than you did this morning.
    ammoSpent: play.ammoSpent,
    deathSaves: { successes: 0, failures: 0 },
    // Conditions are not something a rest clears - most of them need a save or
    // a spell - so they are left alone, clocks included. Exhaustion is the
    // exception: a long rest removes exactly one level, provided you have
    // eaten and drunk. Concentration does not survive sleeping, and is simply
    // not carried into the new object.
    conditions: play.conditions,
    conditionTimers: play.conditionTimers,
    exhaustion: Math.max(0, play.exhaustion - 1),
    // The log is a record of what happened, and resting does not unhappen it.
    rolls: play.rolls,
    // Neither does experience. This object is built field by field rather than
    // spread on purpose - so anything new has to be thought about - and a
    // night's sleep does not make you forget a fight.
    xp: play.xp,
    turn: emptyTurn(),
    // A counter set to `none` is one no rest touches - a piety score is not
    // something you sleep off.
    customValues: rechargeCustom(play.customValues, customResources, 'long'),
  };
}

/**
 * A spell was cast this turn, with the pip it used.
 *
 * Recorded so the bonus-action spell rule can be applied by the one thing
 * that knows a turn's history. Cleared by `newTurn` along with everything
 * else the turn owns.
 */
export function recordSpellCast(play: PlayState, castingTime: string): PlayState {
  return {
    ...play,
    turn: {
      ...play.turn,
      spellCast: true,
      bonusSpellCast: play.turn.bonusSpellCast || castingTime === 'bonus',
    },
  };
}

/**
 * Whether this spell may be cast right now, given what the turn has already
 * done.
 *
 * The whole 2014 rule in one predicate. A reaction spell is outside it: the
 * restriction is about your own turn, and a shield cast on somebody else's
 * is not "during the same turn". Left permissive when the app cannot tell -
 * the refusals a tool makes have to be ones a table would agree with.
 */
export function maySpend(play: PlayState, spell: { level: number; castingTime: string }): boolean {
  if (spell.castingTime === 'reaction') return true;
  if (spell.castingTime === 'bonus') {
    // A bonus-action spell is barred by ANY spell already cast this turn.
    return !play.turn.spellCast;
  }
  // After a bonus-action spell, only a cantrip with a casting time of one
  // action gets through.
  if (play.turn.bonusSpellCast) return spell.level === 0;
  return true;
}

/**
 * Take it or spend it.
 *
 * Not a counter: "you either have Heroic Inspiration or you don't", and a
 * second one handed to somebody already holding one is not a second reroll.
 */
export function setInspiration(play: PlayState, held: boolean): PlayState {
  return { ...play, inspiration: held || undefined };
}

export function toggleCondition(play: PlayState, id: string): PlayState {
  if (play.conditions.includes(id)) {
    const conditionTimers = { ...play.conditionTimers };
    delete conditionTimers[id];
    return { ...play, conditions: play.conditions.filter((c) => c !== id), conditionTimers };
  }
  return { ...play, conditions: [...play.conditions, id] };
}

/**
 * Record who caused a condition, or clear the record.
 *
 * The character-side twin of `setConditionSource` in `encounter.ts`. The field
 * has existed since §27.2 for frightened and charmed, and only the monster
 * half ever had a writer - the DM's picker sets a goblin's source, and a
 * character's was read but never written. §39 needed the other half: a grapple
 * without a grappler is a condition nothing can end.
 */
export function setPlayConditionSource(
  play: PlayState,
  id: string,
  sourceId: string | undefined,
): PlayState {
  const conditionSources = { ...play.conditionSources };
  if (sourceId) conditionSources[id] = sourceId;
  else delete conditionSources[id];
  return {
    ...play,
    conditionSources: Object.keys(conditionSources).length ? conditionSources : undefined,
  };
}

/** Put a condition on with a clock: gone after this many rounds pass. */
export function addTimedCondition(play: PlayState, id: string, rounds: number): PlayState {
  return {
    ...play,
    conditions: play.conditions.includes(id) ? play.conditions : [...play.conditions, id],
    conditionTimers: { ...play.conditionTimers, [id]: Math.max(1, Math.round(rounds)) },
  };
}

/**
 * A round has passed: every timed condition burns one, and the ones that reach
 * nothing come off. Untimed conditions are untouched - they end when the save
 * is made or the spell drops, which is the table's call.
 */
export function tickConditions(play: PlayState): PlayState {
  if (!play.conditionTimers || !Object.keys(play.conditionTimers).length) return play;
  const conditionTimers: Record<string, number> = {};
  const expired: string[] = [];
  for (const [id, left] of Object.entries(play.conditionTimers)) {
    if (left - 1 <= 0) expired.push(id);
    else conditionTimers[id] = left - 1;
  }
  return {
    ...play,
    conditionTimers,
    conditions: play.conditions.filter((id) => !expired.includes(id)),
  };
}

// ------------------------------------------------------------- concentration

/**
 * Take up concentration on a spell, which drops whatever was held. The
 * dropped name comes back so the caller can say so out loud - the drop is the
 * half of the rule tables forget.
 */
export function startConcentration(
  play: PlayState,
  spell: string,
): { play: PlayState; dropped: string | null } {
  const dropped = play.concentratingOn && play.concentratingOn !== spell
    ? play.concentratingOn
    : null;
  return { play: { ...play, concentratingOn: spell }, dropped };
}

export function breakConcentration(play: PlayState): PlayState {
  if (!play.concentratingOn) return play;
  const next = { ...play };
  delete next.concentratingOn;
  return next;
}

/**
 * The save concentration demands when damage lands: Constitution, DC 10 or
 * half the damage, whichever is higher. Returned rather than rolled, because
 * whether the caster makes it is theirs to roll.
 */
export const concentrationDc = (damageTaken: number): number =>
  Math.max(10, Math.floor(damageTaken / 2));

export function setExhaustion(play: PlayState, level: number): PlayState {
  return { ...play, exhaustion: clamp(Math.round(level), 0, 6) };
}

export function recordDeathSave(play: PlayState, kind: 'success' | 'failure'): PlayState {
  const deathSaves =
    kind === 'success'
      ? { ...play.deathSaves, successes: Math.min(3, play.deathSaves.successes + 1) }
      : { ...play.deathSaves, failures: Math.min(3, play.deathSaves.failures + 1) };
  return { ...play, deathSaves };
}

export function clearDeathSaves(play: PlayState): PlayState {
  return { ...play, deathSaves: { successes: 0, failures: 0 } };
}

/**
 * A rolled death save, with the two special faces applied.
 *
 * Ten or better succeeds and anything under fails, but the ends of the die do
 * something else entirely: a natural 20 puts you back on your feet with one hit
 * point, and a natural 1 counts as **two** failures. Both are commonly
 * misplayed - the 20 as "a success" and the 1 as "a failure" - which is exactly
 * why a tracker that rolls for you should get them right rather than leave the
 * table to remember.
 *
 * Takes the roll rather than making it, so the rule is testable without an RNG.
 */
export function applyDeathSaveRoll(
  play: PlayState,
  roll: { total: number; natural: 20 | 1 | null },
  max: number,
): PlayState {
  // `heal` clears the death saves on its way past, which is what regaining
  // consciousness does to them.
  if (roll.natural === 20) return heal(play, 1, max);
  if (roll.natural === 1) return recordDeathSave(recordDeathSave(play, 'failure'), 'failure');
  return recordDeathSave(play, roll.total >= 10 ? 'success' : 'failure');
}

/**
 * Whether anything has been spent, so the UI can say "nothing to reset".
 *
 * Ammunition is left out on purpose: no rest gives it back, so counting it
 * would leave the sheet permanently reading "spent this session" with nothing
 * a rest could do about it. User-made counters are left out for the same
 * reason and one more: a score that counts up is *meant* to sit above nothing,
 * and a piety of 12 is progress rather than something spent.
 */
export function isFresh(play: PlayState, max: number): boolean {
  return (
    hpNow(play, max) === max &&
    play.tempHp === 0 &&
    play.pactSpent === 0 &&
    play.slotsSpent.every((n) => !n) &&
    play.slotsCreated.every((n) => !n) &&
    Object.values(play.hitDiceSpent).every((n) => !n) &&
    Object.values(play.resourcesSpent).every((n) => !n) &&
    play.deathSaves.successes === 0 &&
    play.deathSaves.failures === 0 &&
    play.conditions.length === 0 &&
    play.exhaustion === 0 &&
    !turnSpent(play.turn)
  );
}
