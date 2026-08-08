import type { D20Mode } from './dice';

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
  /** Set when this creature is successfully hidden. */
  hidden?: boolean;
}

export interface Exchange {
  attacker: Combatant;
  target: Combatant;
  /** True when the attacker is within five feet — prone cuts both ways on it. */
  adjacent: boolean;
}

const has = (c: Combatant, id: string) => c.conditions.includes(id);

/**
 * Every circumstance the app can see, in the order a DM would read them out.
 *
 * Only conditions this app actually tracks appear here. Frightened is
 * deliberately absent: it costs advantage only while the *source of the fear*
 * is in sight, and the app does not record what frightened you. A rule it
 * cannot apply correctly is one it should not apply at all.
 */
export function circumstances(exchange: Exchange): Circumstance[] {
  const { attacker, target, adjacent } = exchange;
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
  if (has(attacker, 'prone')) out.push({ label: 'attacking from the floor', gives: 'disadvantage' });
  if (has(attacker, 'restrained')) out.push({ label: 'attacker is restrained', gives: 'disadvantage' });
  if (has(attacker, 'blinded')) out.push({ label: 'attacker cannot see', gives: 'disadvantage' });
  if (has(attacker, 'poisoned')) out.push({ label: 'attacker is poisoned', gives: 'disadvantage' });

  return out;
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
