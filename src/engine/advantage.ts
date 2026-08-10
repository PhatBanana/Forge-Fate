import type { D20Mode } from './dice';
import type { Ruleset } from '../types';
import { exhaustionEffect, speedAfterExhaustion } from './exhaustion';

/**
 * Whether an attack rolls one die, two and takes the best, or two and takes
 * the worst.
 *
 * The battle screen has announced advantage since §19.3 — "unseen attacker —
 * advantage" is in the log — and has never rolled it. Every combat roll in
 * this app has been `'normal'`, while the engine supported all three modes and
 * the character sheet's own dice roller offered them. Stating an advantage you
 * do not grant is worse than not mentioning it.
 *
 * §26.2 made that worse by creating **prone** and leaving nothing to read it.
 * A creature knocked down was knocked down decoratively.
 *
 * ## The one rule that matters
 *
 * Fifth edition does not stack. Any number of advantages and any number of
 * disadvantages cancel to a straight roll, and one of either alone decides it.
 * That is what makes this worth a function rather than a chain of ternaries:
 * the *reasons* all have to be gathered before the answer is known, and a DM
 * reading the log wants to see the ones that cancelled just as much as the one
 * that won.
 */

export interface Circumstance {
  /** What to say: "target is prone, and you are on top of them". */
  label: string;
  gives: 'advantage' | 'disadvantage';
}

/** What the battle knows about one side of an exchange. */
export interface Combatant {
  conditions: string[];
  /**
   * Levels of exhaustion, 0-6. Three of them cost advantage on attacks, which
   * is the first level a swing notices - the earlier ones hit ability checks
   * and speed instead, and speed is `walkInto`'s business rather than this
   * function's.
   */
  exhaustion?: number;
  /** Set when this creature is successfully hidden. */
  hidden?: boolean;
  /**
   * Set when this creature took the Dodge action and its next turn has not
   * come round yet. On the *target* it costs the attacker advantage, which is
   * the whole of what an action buys - and until §28 recorded the stance, an
   * action bought nothing at all.
   */
  dodging?: boolean;
  /**
   * Who caused a condition, by combatant id, for the ones that turn on it.
   * Frightened is the one that needs it.
   */
  conditionSources?: Record<string, string>;
}

export interface Exchange {
  attacker: Combatant;
  target: Combatant;
  /**
   * Which edition's rules to read. It matters for exactly one circumstance so
   * far - exhaustion, which is disadvantage in 2014 and a flat penalty in
   * 2024 - and defaults to 2014 so every existing caller keeps its behaviour.
   */
  ruleset?: Ruleset;
  /** True when the attacker is within five feet — prone cuts both ways on it. */
  adjacent: boolean;
  /**
   * Whether the attacker can currently see a given combatant, by id.
   *
   * Frightened costs advantage only *while the source of the fear is in
   * sight*, so the rule cannot be applied without asking. Absent means the
   * caller has no line-of-sight model, and frightened is then left alone
   * rather than guessed at.
   */
  canSee?: (id: string) => boolean;
  /**
   * Whether the attacker can see the target, and whether the target can see
   * the attacker - the two halves of fighting in the dark.
   *
   * "You have disadvantage when you attack a target you can't see, and
   * advantage when you attack a creature that can't see you." Two separate
   * facts, and in mutual darkness they cancel to a straight roll, which is
   * the answer the SRD gives and the reason this is two booleans rather than
   * one "in the dark" flag.
   *
   * Undefined means the caller has no light model, and both are then left
   * alone rather than guessed at - the same refusal `canSee` makes.
   */
  attackerSeesTarget?: boolean;
  targetSeesAttacker?: boolean;
}

const has = (c: Combatant, id: string) => c.conditions.includes(id);

/** "You lose this benefit if you are incapacitated or if your speed drops to
    0" - the incapacitated half, which is the half this app tracks. */
const STOPS_A_DODGE = ['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious'];

/**
 * Every circumstance the app can see, in the order a DM would read them out.
 *
 * Only conditions this app actually tracks appear here. Frightened needs to
 * know two things the others do not - who caused it, and whether they are
 * currently in sight - which is why conditions grew a source. Without either,
 * it is left alone rather than guessed at.
 */
export function circumstances(exchange: Exchange): Circumstance[] {
  const { attacker, target, adjacent, ruleset = '2014' } = exchange;
  const out: Circumstance[] = [];

  // --- what helps the attacker
  if (attacker.hidden) out.push({ label: 'unseen attacker', gives: 'advantage' });
  if (has(target, 'prone') && adjacent) {
    out.push({ label: 'target is prone and within reach', gives: 'advantage' });
  }
  if (has(target, 'restrained')) out.push({ label: 'target is restrained', gives: 'advantage' });
  if (has(target, 'blinded')) out.push({ label: 'target cannot see', gives: 'advantage' });
  for (const id of ['paralyzed', 'stunned', 'unconscious', 'petrified']) {
    if (has(target, id)) out.push({ label: `target is ${id}`, gives: 'advantage' });
  }

  // --- what hinders it
  if (has(target, 'prone') && !adjacent) {
    out.push({ label: 'target is prone and beyond reach', gives: 'disadvantage' });
  }
  if (has(target, 'invisible')) out.push({ label: 'target is unseen', gives: 'disadvantage' });
  /*
    The dark, both ways round. Explicitly `=== false` rather than falsy,
    because undefined means "no light model here" and must change nothing -
    the same distinction `canSee` draws.

    The advantage half sits down here beside its opposite rather than up with
    the other boons, because the two are one rule read from two ends and a
    reader checking whether they cancel should not have to scroll.
  */
  if (exchange.targetSeesAttacker === false) {
    out.push({ label: 'they cannot see you coming', gives: 'advantage' });
  }
  if (exchange.attackerSeesTarget === false) {
    out.push({ label: 'swinging at what you cannot see', gives: 'disadvantage' });
  }
  /*
    Dodge, which the SRD suspends the moment you are incapacitated or your
    speed drops to nought - so a dodging creature that has been paralysed gets
    nothing for the action it spent, and the conditions that say so are the
    same ones that stop a reaction.
  */
  if (target.dodging && !target.conditions.some((c) => STOPS_A_DODGE.includes(c))) {
    out.push({ label: 'target is dodging', gives: 'disadvantage' });
  }
  if (has(attacker, 'prone')) out.push({ label: 'attacking from the floor', gives: 'disadvantage' });
  if (has(attacker, 'restrained')) out.push({ label: 'attacker is restrained', gives: 'disadvantage' });
  if (has(attacker, 'blinded')) out.push({ label: 'attacker cannot see', gives: 'disadvantage' });
  if (has(attacker, 'poisoned')) out.push({ label: 'attacker is poisoned', gives: 'disadvantage' });
  if (frightenedInSight(exchange)) {
    out.push({ label: 'frightened, and it is watching', gives: 'disadvantage' });
  }
  /*
    2014 turns exhaustion into disadvantage at rung three. 2024 does not use
    advantage for this at all - it is a flat −2 per level, applied to the roll
    rather than to the dice, which is `exhaustionEffect().d20Penalty` and is
    added by the caller that owns the bonus. Asking for it here would double
    it, so this branch is 2014's alone.
  */
  if (exhaustionEffect(attacker.exhaustion ?? 0, ruleset).disadvantage) {
    out.push({ label: `exhaustion ${attacker.exhaustion}`, gives: 'disadvantage' });
  }

  return out;
}

/**
 * Whether the attacker is frightened *and* the thing that frightened them can
 * be seen from here.
 *
 * Both halves are required by the rule and both are refusable: no source
 * recorded, or no way to ask about sight, and this stays quiet. That is the
 * difference between a rule applied correctly and a rule applied often.
 */
export function frightenedInSight(exchange: Exchange): boolean {
  const { attacker, canSee } = exchange;
  if (!has(attacker, 'frightened') || !canSee) return false;
  const source = attacker.conditionSources?.frightened;
  return source !== undefined && canSee(source);
}

/**
 * Whether a frightened creature is allowed to walk here.
 *
 * The other half of the condition, and the more tactical one: "the creature
 * can't willingly move closer to the source of its fear". Measured in straight
 * line rather than by walking, because the rule is about approaching the thing
 * you are afraid of, not about the route - stepping behind a pillar to break
 * line of sight is allowed even though it may pass nearer for a moment.
 *
 * Returns true when the move is fine, so the caller reads as a permission.
 */
export function mayApproach(
  mover: Combatant,
  from: { x: number; y: number },
  to: { x: number; y: number },
  sourceAt: (id: string) => { x: number; y: number } | undefined,
): boolean {
  if (!has(mover, 'frightened')) return true;
  const source = mover.conditionSources?.frightened;
  const at = source ? sourceAt(source) : undefined;
  if (!at) return true;
  const gap = (p: { x: number; y: number }) =>
    Math.max(Math.abs(p.x - at.x), Math.abs(p.y - at.y));
  return gap(to) >= gap(from);
}

/**
 * What exhaustion does to a speed.
 *
 * Kept as a re-export so the callers that ask a movement question keep asking
 * it here, but the rule itself lives in `engine/exhaustion.ts` now: the two
 * editions do completely different things, and this function used to know
 * only 2014's - halving at two, stopping at five - which it then applied to
 * 2024 characters as well. See §51.
 */
export function speedUnderExhaustion(
  speed: number,
  exhaustion: number,
  ruleset: Ruleset = '2014',
): number {
  return speedAfterExhaustion(speed, exhaustion, ruleset);
}

/**
 * The six conditions whose text is, in whole or in part, "your speed is 0".
 *
 * Grappled and restrained say it outright. The other four say "can't move",
 * which is the same sentence written by a different author - and until §39
 * every one of them was decorative: the app tracked all six and a stunned
 * creature could still be walked across the map.
 */
export const STOPS_MOVEMENT = [
  'grappled',
  'restrained',
  'paralyzed',
  'petrified',
  'stunned',
  'unconscious',
];

/**
 * A speed with the conditions applied, which is nought or nothing.
 *
 * Deliberately separate from `speedUnderExhaustion` rather than folded into
 * it: exhaustion is a track that halves, conditions are states that stop, and
 * a caller wants both applied but wants to be able to say which one took the
 * feet away.
 */
export function speedUnderConditions(speed: number, conditions: string[]): number {
  return conditions.some((c) => STOPS_MOVEMENT.includes(c)) ? 0 : speed;
}

/**
 * Whether a charmed creature is allowed to attack this target.
 *
 * "The creature can't attack the charmer" - free once conditions carry a
 * source, which is the whole reason `conditionSources` is named for the
 * general case rather than for frightened.
 */
export function mayAttack(attacker: Combatant, targetId: string): boolean {
  if (!has(attacker, 'charmed')) return true;
  return attacker.conditionSources?.charmed !== targetId;
}

export interface Odds {
  mode: D20Mode;
  /** Everything that applied, including the ones that cancelled out. */
  reasons: Circumstance[];
  /** True when both sides were present and killed each other off. */
  cancelled: boolean;
}

/** Fold the circumstances into the one answer the dice need. */
export function oddsFor(exchange: Exchange): Odds {
  const reasons = circumstances(exchange);
  const up = reasons.some((r) => r.gives === 'advantage');
  const down = reasons.some((r) => r.gives === 'disadvantage');

  // However many of each: they do not stack, and one of each is a straight
  // roll. This is the whole rule.
  if (up && down) return { mode: 'normal', reasons, cancelled: true };
  if (up) return { mode: 'advantage', reasons, cancelled: false };
  if (down) return { mode: 'disadvantage', reasons, cancelled: false };
  return { mode: 'normal', reasons, cancelled: false };
}

/**
 * How it reads in the log.
 *
 * Names the outcome and then the reasons, so "(disadvantage: attacking from
 * the floor)" and "(straight: unseen attacker, attacking from the floor
 * cancel)" both say why. Empty when nothing applied, so an ordinary swing
 * stays an ordinary line.
 */
export function describeOdds(odds: Odds): string {
  if (!odds.reasons.length) return '';
  const list = odds.reasons.map((r) => r.label).join(', ');
  if (odds.cancelled) return `straight: ${list} cancel`;
  return `${odds.mode}: ${list}`;
}
