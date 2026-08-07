import { defaultRng, parseNotation, rollD20, rollNotation } from './dice';
import type { Rng } from './dice';
import type { Monster, MonsterAbility } from '../data/monsters';
import { initiativeMod } from '../data/monsters';
import type { Combatants } from './forecast';

/**
 * The fight, run many times.
 *
 * 8.4's forecast answers with expected value: so much damage a round, so many
 * rounds. The question a DM actually has is different in kind - *how often
 * does this wipe them* - and only a distribution answers it, because the
 * danger in a close fight lives in the variance the expectation throws away: a
 * pair of early crits, an ogre rolling high on initiative, the healer dropping
 * in round one.
 *
 * ## What is sampled and what is not, stated plainly
 *
 * **Monster dice are real.** Initiative, every attack roll, every damage die,
 * multiattacks resolved attack by attack, natural twenties doubling dice -
 * rolled through the same dice engine the sheet's roller uses.
 *
 * **The party's damage is the model's.** Each character deals their modelled
 * damage-per-round - the same curve the Builder shows, which already knows
 * their real weapons, feats and spells - against the armor class of the
 * monster they are focused on. Sampling a caster's actual round - which spell,
 * which slot, which save - would mean inventing decisions this app has no
 * business making; the DPR curve is the honest summary of what they do over a
 * fight.
 *
 * So the spread in the results comes from initiative, targeting, deaths and
 * the monsters' dice. That is most of where the spread in a real fight comes
 * from, and the caveat is printed with the results rather than buried here.
 *
 * ## Tactics, fixed and dumb on purpose
 *
 * The party focuses the wounded monster; monsters spread across random living
 * characters. Neither side moves, nobody is out of reach, nothing recharges.
 * Fixed tactics mean two runs differ only by dice - which is the thing being
 * measured.
 */

export interface SimulationResult {
  trials: number;
  /** How often the party was left standing. */
  winRate: number;
  /** Rounds the fight took, across all trials. */
  medianRounds: number;
  /** Chance each character hit nought at some point, win or lose. */
  downRate: { name: string; rate: number }[];
  /** Party hit points left, averaged over the winning trials only. */
  meanHpLeftOnWin: number;
  caveat: string;
}

/** A monster's attack routine: the multiattack when readable, else its best swing. */
function routineOf(monster: Monster): MonsterAbility[] {
  const byName = new Map(monster.actions.map((a) => [a.name, a]));
  const multi = monster.actions.find((a) => a.multiattack?.length);
  if (multi?.multiattack) {
    const parts = multi.multiattack.flatMap((part) => {
      const action = byName.get(part.name);
      return action?.toHit !== undefined && action.damage?.length
        ? Array.from({ length: part.count }, () => action)
        : [];
    });
    if (parts.length) return parts;
  }
  // The single hardest-hitting attack, judged by average dice.
  const swings = monster.actions.filter((a) => a.toHit !== undefined && a.damage?.length);
  if (!swings.length) return [];
  const avg = (a: MonsterAbility) =>
    a.damage!.reduce((sum, d) => {
      const parsed = parseNotation(d.dice);
      return parsed
        ? sum +
            parsed.terms.reduce((s, t) => s + (t.count * (t.die + 1)) / 2, 0) +
            parsed.modifier
        : sum;
    }, 0);
  return [swings.reduce((best, a) => (avg(a) > avg(best) ? a : best))];
}

/** One attack, rolled for real. A natural 20 doubles the dice, as the rules say. */
function rollAttack(attack: MonsterAbility, targetAc: number, rng: Rng): number {
  const d20 = rollD20(attack.toHit ?? 0, 'normal', rng);
  const natural = d20.rolls[0];
  if (natural === 1) return 0;
  const crit = natural === 20;
  if (!crit && d20.total < targetAc) return 0;

  let total = 0;
  for (const part of attack.damage ?? []) {
    const parsed = parseNotation(part.dice);
    if (!parsed) continue;
    total += rollNotation(parsed, rng).total;
    if (crit) {
      // Crit: the dice again, not the modifier.
      total += rollNotation({ ...parsed, modifier: 0 }, rng).total;
    }
  }
  return total;
}

export function simulate(
  { party, monsters }: Combatants,
  options: { trials?: number; rng?: Rng } = {},
): SimulationResult | null {
  if (!party.length || !monsters.length) return null;
  const trials = options.trials ?? 500;
  const rng = options.rng ?? defaultRng;

  let wins = 0;
  const roundCounts: number[] = [];
  const downs = new Map(party.map((p) => [p.name, 0]));
  let hpLeftOnWins = 0;

  for (let trial = 0; trial < trials; trial++) {
    // Fresh hit points, fresh initiative. Characters roll at +0 - their sheet
    // knows their modifier but the forecast's inputs do not carry it, and a
    // flat d20 against the monsters' real modifiers is close enough for order.
    const side = [
      ...party.map((p) => ({
        kind: 'pc' as const,
        name: p.name,
        hp: p.hp,
        ac: p.ac,
        dprAt: p.dprAt,
        initiative: rollD20(0, 'normal', rng).total,
      })),
      ...monsters.map((m, i) => ({
        kind: 'foe' as const,
        name: `${m.monster.name} ${i}`,
        hp: m.hp,
        ac: m.monster.ac,
        routine: routineOf(m.monster),
        initiative: rollD20(initiativeMod(m.monster), 'normal', rng).total,
      })),
    ].sort((a, b) => b.initiative - a.initiative);

    const wentDown = new Set<string>();
    let round = 0;
    // A hard cap, so two sides that cannot hurt each other end as a draw
    // rather than an infinite loop.
    while (round < 50) {
      round++;
      for (const actor of side) {
        if (actor.hp <= 0) continue;
        const foes = side.filter((c) => c.kind !== actor.kind && c.hp > 0);
        if (!foes.length) break;

        if (actor.kind === 'pc') {
          // Focus fire on the wounded: the tactic every table converges on.
          const target = foes.reduce((low, f) => (f.hp < low.hp ? f : low));
          target.hp -= actor.dprAt(Math.round(target.ac));
        } else {
          for (const attack of actor.routine) {
            const living = side.filter((c) => c.kind === 'pc' && c.hp > 0);
            if (!living.length) break;
            const target = living[Math.floor(rng() * living.length)];
            target.hp -= rollAttack(attack, target.ac, rng);
            if (target.hp <= 0) wentDown.add(target.name);
          }
        }
      }

      const pcsUp = side.some((c) => c.kind === 'pc' && c.hp > 0);
      const foesUp = side.some((c) => c.kind === 'foe' && c.hp > 0);
      if (!pcsUp || !foesUp) {
        if (pcsUp) {
          wins++;
          hpLeftOnWins += side
            .filter((c) => c.kind === 'pc')
            .reduce((sum, c) => sum + Math.max(0, c.hp), 0);
        }
        break;
      }
    }
    roundCounts.push(round);
    for (const name of wentDown) downs.set(name, (downs.get(name) ?? 0) + 1);
  }

  roundCounts.sort((a, b) => a - b);
  return {
    trials,
    winRate: wins / trials,
    medianRounds: roundCounts[Math.floor(roundCounts.length / 2)] ?? 0,
    downRate: party.map((p) => ({ name: p.name, rate: (downs.get(p.name) ?? 0) / trials })),
    meanHpLeftOnWin: wins ? Math.round(hpLeftOnWins / wins) : 0,
    caveat:
      'Monster dice are rolled for real; your side deals its modelled damage per round. ' +
      'Nobody moves, nothing recharges, and the spread comes from initiative, targeting and the monsters’ dice.',
  };
}
