import type { Ruleset } from '../types';

/**
 * Exhaustion, which the two editions do completely differently.
 *
 * 2014 is a six-step ladder, each step adding a *different* effect and keeping
 * the ones below it: disadvantage on checks, then half speed, then
 * disadvantage on attacks and saves, then half hit points, then no speed at
 * all, then death.
 *
 * 2024 threw the ladder away. Every level is the same two things, and they
 * scale: **−2 on every D20 test** and **−5 feet of Speed**, per level,
 * cumulative, death at 6. A 2024 character at exhaustion 1 is worse at
 * attacking than a 2014 one (who is not affected at all until 3), and better
 * off at 2 (whose speed halves rather than dropping five feet).
 *
 * ## Why this is its own module
 *
 * The app shipped the 2014 ladder with no ruleset branch at all, so a 2024
 * character was told "disadvantage on ability checks" at level 1 and given a
 * halved speed at 2 - neither of which is the 2024 rule. That is the same
 * failure as §46's Brutal Critical: a 2014 rule applied to both editions
 * because the data had nowhere to say which edition it belonged to.
 *
 * The fix is one function that answers the question completely, rather than
 * three places each remembering one rung. Everything that cares - the sheet's
 * effect list, the movement budget, the attack roll - reads this.
 */

/** What being this exhausted actually does, in the edition being played. */
export interface ExhaustionEffect {
  /** Subtracted from every D20 test. 2024 only; 2014 uses advantage instead. */
  d20Penalty: number;
  /** Feet removed from Speed outright. 2024 only. */
  speedPenalty: number;
  /** 2014's rung 2. Applied after `speedPenalty`, though never both. */
  speedHalved: boolean;
  /** 2014's rung 5 and 2024's death, whichever arrives. */
  speedZero: boolean;
  /** 2014's rung 4. 2024 has no equivalent. */
  hpMaxHalved: boolean;
  /** Disadvantage on attacks and saves - 2014's rung 3 only. */
  disadvantage: boolean;
  dead: boolean;
  /** One line per effect in play, for the sheet to render. */
  lines: string[];
}

export const MAX_EXHAUSTION = 6;

const clampLevel = (level: number) => Math.max(0, Math.min(MAX_EXHAUSTION, Math.round(level)));

const NONE: ExhaustionEffect = {
  d20Penalty: 0,
  speedPenalty: 0,
  speedHalved: false,
  speedZero: false,
  hpMaxHalved: false,
  disadvantage: false,
  dead: false,
  lines: [],
};

/**
 * The 2014 ladder, as rungs. Each one adds its line and keeps the ones below,
 * which is how the track actually works and how it is read at a table.
 */
const LADDER_2014: { line: string; apply: (e: ExhaustionEffect) => void }[] = [
  { line: 'Disadvantage on ability checks.', apply: () => {} },
  { line: 'Your speed is halved.', apply: (e) => { e.speedHalved = true; } },
  {
    line: 'Disadvantage on attack rolls and saving throws.',
    apply: (e) => { e.disadvantage = true; },
  },
  { line: 'Your hit point maximum is halved.', apply: (e) => { e.hpMaxHalved = true; } },
  { line: 'Your speed drops to 0.', apply: (e) => { e.speedZero = true; } },
  { line: 'Death.', apply: (e) => { e.dead = true; } },
];

export function exhaustionEffect(level: number, ruleset: Ruleset): ExhaustionEffect {
  const n = clampLevel(level);
  if (n === 0) return { ...NONE, lines: [] };

  if (ruleset === '2024') {
    /*
      One rule, scaled. Stated as two lines rather than six because that is
      what a 2024 player needs to read - the numbers change, the sentences
      do not.
    */
    const dead = n >= MAX_EXHAUSTION;
    return {
      ...NONE,
      d20Penalty: n * 2,
      speedPenalty: n * 5,
      speedZero: dead,
      dead,
      lines: dead
        ? ['Death.']
        : [
            `−${n * 2} on every D20 test: attacks, checks and saves alike.`,
            `−${n * 5} feet of Speed.`,
          ],
    };
  }

  const out: ExhaustionEffect = { ...NONE, lines: [] };
  for (const rung of LADDER_2014.slice(0, n)) {
    rung.apply(out);
    out.lines.push(rung.line);
  }
  return out;
}

/**
 * Speed after exhaustion, in the edition being played.
 *
 * Never negative: a 2024 character with 30 feet and four levels of exhaustion
 * is crawling on 10, and at six they are dead rather than moving backwards.
 */
export function speedAfterExhaustion(speed: number, level: number, ruleset: Ruleset): number {
  const effect = exhaustionEffect(level, ruleset);
  if (effect.speedZero) return 0;
  if (effect.speedHalved) return Math.floor(speed / 2);
  return Math.max(0, speed - effect.speedPenalty);
}

/**
 * The lines a sheet shows for this level. `[]` when rested, in both editions.
 */
export function exhaustionLines(level: number, ruleset: Ruleset): string[] {
  return exhaustionEffect(level, ruleset).lines;
}
