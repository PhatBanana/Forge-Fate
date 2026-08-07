import { AC_RANGE, averageDice, expectedDamage, oddsFor } from './dpr';
import { parseNotation } from './dice';
import type { Monster, MonsterAbility } from '../data/monsters';

/**
 * What this fight will actually do.
 *
 * D&D Beyond and most encounter builders answer "how hard is this?" with an XP
 * budget: sum the monsters' XP, multiply by a table keyed on how many there
 * are, and compare against a threshold per character level. Those thresholds
 * are **not in the SRD** - they are Dungeon Master's Guide content, and this
 * project does not reproduce what it has no licence to. Every monster's own XP
 * value *is* in the SRD, so that number is shown; the verdict is not built on
 * a table this app cannot carry.
 *
 * It is built on something better anyway. This app already models damage per
 * round against a target's armor class, for a real character with their real
 * weapons and feats. So the question becomes a concrete one: how much damage
 * will the party do to *these* monsters, how much will the monsters do back to
 * *this* party, and who runs out of hit points first. That is a more useful
 * answer than "deadly", and it is this project's own work rather than
 * reproduced content.
 *
 * ## What it is not
 *
 * A projection, not a promise - the same hedge the README makes about every
 * damage figure. Everything below is expected value with no variance, nobody
 * moves, nobody targets sensibly, and nobody uses the thing that would actually
 * decide the fight. The exclusions are listed rather than buried: see `notes`.
 */

export interface Combatants {
  /** One per character: what they put out, and what they can take. */
  party: { name: string; dprAt: (ac: number) => number; ac: number; hp: number }[];
  monsters: { monster: Monster; hp: number }[];
}

export interface EncounterForecast {
  /** Average armor class on each side, which is what the other side rolls at. */
  partyAc: number;
  monsterAc: number;
  partyDpr: number;
  monsterDpr: number;
  partyHp: number;
  monsterHp: number;
  /** Whole rounds, rounded up. Null when that side deals nothing at all. */
  roundsToClear: number | null;
  roundsToDrop: number | null;
  /** Straight from the stat blocks, and the one figure here that is not a model. */
  xp: number;
  verdict: string;
  notes: string[];
}

const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

/**
 * Expected damage from one of a monster's attacks against a given armor class.
 *
 * Only attack rolls. A monster with several damage types on one attack - a
 * bite that is piercing plus fire - has them summed, because they land
 * together on the same hit.
 */
function attackDamage(ability: MonsterAbility, targetAc: number): number {
  if (ability.toHit === undefined || !ability.damage?.length) return 0;
  // Crits are the ordinary 20 only: no SRD monster has an expanded crit range.
  const odds = oddsFor(ability.toHit, targetAc, 20, false);
  let total = 0;
  for (const part of ability.damage) {
    /*
      `parseNotation` rather than `dpr.ts`'s `parseDice`.

      The latter is anchored on bare dice - `^(\d+)d(\d+)$` - and returns zeroes
      for "1d6+2", which is the shape almost every monster's damage takes. It
      served the weapon table, where the bonus is a separate column. Reaching
      for it here silently rated a goblin's scimitar at 1 damage a round, which
      is what the hand-worked test caught. `parseNotation` reads the whole
      expression and is the same function `monsters.test.ts` asserts all 140 of
      them against, so there is one parser for one job.
    */
    const parsed = parseNotation(part.dice);
    if (!parsed) continue;
    const dice = parsed.terms.reduce((sum, t) => sum + averageDice(t.count, t.die), 0);
    total += expectedDamage(odds, dice, parsed.modifier);
  }
  return total;
}

/**
 * One monster's damage in a round.
 *
 * A Multiattack is the round, when the stat block states one in a form that
 * can be read - 113 of the 148 that have one. Otherwise the single best attack,
 * which is deliberately conservative: a monster with a bite *or* a tail slap
 * does not do both, and guessing that it does would overstate every fight.
 */
export function monsterDamagePerRound(monster: Monster, targetAc: number): number {
  const byName = new Map(monster.actions.map((a) => [a.name, a]));

  const multi = monster.actions.find((a) => a.multiattack?.length);
  if (multi?.multiattack) {
    let total = 0;
    for (const part of multi.multiattack) {
      const action = byName.get(part.name);
      if (action) total += attackDamage(action, targetAc) * part.count;
    }
    if (total > 0) return total;
  }

  return Math.max(0, ...monster.actions.map((a) => attackDamage(a, targetAc)));
}

/**
 * Abilities this deliberately does not count, named so a DM can weigh them by
 * eye rather than wonder what was left out.
 *
 * Anything on a recharge or a limited number of uses, and anything resolved by
 * a saving throw. Both need something the model does not have - a recharge is a
 * die rolled each round, and a save needs the party's real save bonuses spread
 * across six abilities - and a dragon's breath weapon counted as though it
 * happened every round would overstate the fight as badly as ignoring it
 * understates it. Naming them is the honest middle.
 */
export function uncountedAbilities(monster: Monster): string[] {
  return monster.actions
    .filter((a) => a.usage || (a.save && a.toHit === undefined))
    .map((a) => a.name);
}

/** The AC the curve was computed at, clamped to the range it covers. */
const clampAc = (ac: number) =>
  Math.round(Math.min(AC_RANGE.max, Math.max(AC_RANGE.min, ac)));

export function forecast({ party, monsters }: Combatants): EncounterForecast | null {
  if (!party.length || !monsters.length) return null;

  const partyAc = Math.round(mean(party.map((p) => p.ac)));
  const monsterAc = Math.round(mean(monsters.map((m) => m.monster.ac)));

  const partyDpr = party.reduce((sum, p) => sum + p.dprAt(clampAc(monsterAc)), 0);
  const monsterDpr = monsters.reduce(
    (sum, m) => sum + monsterDamagePerRound(m.monster, clampAc(partyAc)),
    0,
  );

  const partyHp = party.reduce((sum, p) => sum + p.hp, 0);
  const monsterHp = monsters.reduce((sum, m) => sum + m.hp, 0);

  const roundsToClear = partyDpr > 0 ? Math.ceil(monsterHp / partyDpr) : null;
  const roundsToDrop = monsterDpr > 0 ? Math.ceil(partyHp / monsterDpr) : null;

  const notes: string[] = [];
  const uncounted = monsters.flatMap((m) =>
    uncountedAbilities(m.monster).map((name) => `${m.monster.name}: ${name}`),
  );
  if (uncounted.length) {
    notes.push(
      `Not counted — anything on a recharge or a saving throw: ${[...new Set(uncounted)].join(', ')}.`,
    );
  }
  const proseOnly = monsters.filter(
    (m) =>
      m.monster.actions.some((a) => a.name.startsWith('Multiattack')) &&
      !m.monster.actions.some((a) => a.multiattack?.length),
  );
  if (proseOnly.length) {
    notes.push(
      `Counted as one attack — the stat block states its Multiattack only in prose: ${[
        ...new Set(proseOnly.map((m) => m.monster.name)),
      ].join(', ')}.`,
    );
  }
  if (monsters.some((m) => m.monster.legendary.length)) {
    notes.push('Legendary actions are not counted; they land between turns.');
  }

  return {
    partyAc,
    monsterAc,
    partyDpr: Math.round(partyDpr * 10) / 10,
    monsterDpr: Math.round(monsterDpr * 10) / 10,
    partyHp,
    monsterHp,
    roundsToClear,
    roundsToDrop,
    xp: monsters.reduce((sum, m) => sum + m.monster.xp, 0),
    verdict: verdictFor(roundsToClear, roundsToDrop),
    notes,
  };
}

/**
 * The one-line read, from the two numbers that matter: how long the party needs
 * and how long they have.
 *
 * The ratio is what says something, not either figure alone - three rounds to
 * win is a walkover against a party who can last twelve and a coin toss against
 * one who can last four. The wording deliberately describes the shape of the
 * fight rather than grading it, because "deadly" is a word from a table this
 * app does not carry and using it would imply the same arithmetic.
 */
export function verdictFor(toClear: number | null, toDrop: number | null): string {
  if (toClear === null) return 'Your party is dealing no damage the model can see.';
  if (toDrop === null) return `Cleared in about ${toClear} ${plural(toClear)}, taking nothing back.`;

  const ratio = toDrop / toClear;
  if (ratio >= 4) return `A walkover: cleared in about ${toClear} ${plural(toClear)}, with room to spare.`;
  if (ratio >= 2.5) return `Comfortable: about ${toClear} ${plural(toClear)}, and the party can afford them.`;
  if (ratio >= 1.5) return `A real fight: about ${toClear} ${plural(toClear)}, and it will cost hit points.`;
  if (ratio >= 1) return `Dangerous: ${toClear} ${plural(toClear)} to clear, and the party runs out around ${toDrop}.`;
  return `The party loses this on the numbers: down around round ${toDrop}, clearing at ${toClear}.`;
}

const plural = (n: number) => (n === 1 ? 'round' : 'rounds');
