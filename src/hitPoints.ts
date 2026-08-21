import { appendLog, damageMonster, isRunning, recordDamage, setDormant } from './encounter';
import type { Combatant, EncounterState } from './encounter';
import { damage, heal, hpNow } from './play';
import { updateEncounter, updatePlay } from './storage';
import type { Roster } from './storage';

/**
 * §106: where a combatant's hit points live, and what happens when they
 * change.
 *
 * The multiplayer design's deepest rule is that **a character in the
 * fight is not a copy of them**: a monster carries its hit points on the
 * combatant, because a goblin exists only for this fight, while a
 * character's live in their `PlayState` on the roster, because they
 * outlive it and the player owns them (§92). Every screen that shows a
 * number, and every button that changes one, needs that reconciled - and
 * the reconciliation was two closures inside the battle screen's 7,500
 * lines, reachable only by mounting the whole thing.
 *
 * It is three functions here, all pure, and the write side returns the
 * new roster rather than calling a setter: the encounter is folded in
 * (`updateEncounter`), which is what the battle screen's own
 * `setEncounter` did one layer down, so both stores travel home as one
 * value. The one thing this module cannot know is a character's maximum,
 * which comes from deriving their build - so it is injected as `maxOf`,
 * and the caller (which already memoises those derivations per render)
 * hands one in.
 */

/** A character's hit point maximum, by roster id - `deriveBuild`'s work,
    injected because deriving is the caller's business and it caches. */
export type MaxHpOf = (rosterId: string) => number;

/** Hit points for a row, from whichever place owns them. */
export function hitPointsOf(
  combatant: Combatant,
  roster: Roster,
  maxOf: MaxHpOf,
): { now: number; max: number } | null {
  if (combatant.kind === 'monster') return { now: combatant.hp, max: combatant.maxHp };
  const entry = roster.entries.find((e) => e.id === combatant.rosterId);
  const max = maxOf(combatant.rosterId);
  return entry ? { now: hpNow(entry.play, max), max } : null;
}

/** What to call them: a monster's label, a character's own name. */
export function combatantName(combatant: Combatant, roster: Roster): string {
  if (combatant.kind === 'monster') return combatant.label;
  const entry = roster.entries.find((e) => e.id === combatant.rosterId);
  return entry ? entry.build.name || 'Unnamed' : 'Unknown';
}

/**
 * Damage (positive) or healing (negative), into whichever store owns the
 * number, with the fight's own bookkeeping done on the way:
 *
 * - the damage tally records the hit while a fight is running, capped at
 *   what was actually there to take, and marks the blow that downed them;
 * - **pain is an alarm clock** - damage wakes a dormant monster, and says
 *   so in the log;
 * - the encounter travels home folded into the roster, so one write lands
 *   both stores and one undo step covers them.
 *
 * Returns the roster unchanged when the combatant names a character who
 * is not on it - a stale token outliving its entry is a real state, and
 * throwing at it would take the fight down with it.
 */
export function applyHitPoints(
  roster: Roster,
  encounter: EncounterState,
  combatant: Combatant,
  amount: number,
  maxOf: MaxHpOf,
): Roster {
  const hpBefore = hitPointsOf(combatant, roster, maxOf)?.now ?? 0;
  const tallied =
    amount > 0 && isRunning(encounter)
      ? recordDamage(encounter, {
          to: combatant.id,
          amount: Math.min(amount, hpBefore),
          downed: hpBefore > 0 && hpBefore - amount <= 0,
        })
      : encounter;

  if (combatant.kind === 'monster') {
    const woken =
      amount > 0 && combatant.dormant
        ? appendLog(setDormant(tallied, combatant.id, false), `${combatant.label} activates!`)
        : tallied;
    return updateEncounter(roster, damageMonster(woken, combatant.id, amount));
  }

  const entry = roster.entries.find((e) => e.id === combatant.rosterId);
  if (!entry) return roster;
  const max = maxOf(combatant.rosterId);
  const play = amount >= 0 ? damage(entry.play, amount, max) : heal(entry.play, -amount, max);
  return updatePlay(updateEncounter(roster, tallied), entry.id, play);
}
