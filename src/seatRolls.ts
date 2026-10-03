import { ABILITIES, ABILITY_NAMES } from './types';
import { saveBonusOf } from './engine/character';
import type { BuildContext } from './engine/character';
import { parseNotation, rollD20, rollDamage } from './engine/dice';
import type { D20Mode, Rng } from './engine/dice';
import { appendLog, isRunning, setInitiative } from './encounter';
import { activeEncounter, updateEncounter } from './storage';
import type { Roster } from './storage';
import { signed } from './format';

/**
 * §162: the dice in the player's hand.
 *
 * A seated phone could roll one thing - a save the DM called (§143) - and its
 * sheet had no dice at all, so every attack and check went back to the
 * physical table or the DM's screen. This is the rest of the hand: initiative,
 * every attack's to-hit and damage, saves, skills and ability checks.
 *
 * Within §92's rule, the way a called save is: the phone rolls and *says*
 * what it rolled; the host writes the line into the fight's log for the whole
 * table to see, and the DM decides what it means. The one roll the host acts
 * on is initiative before the fight starts - the number is the player's to
 * roll, and typing it in for them was the DM's busywork. Once the fight is
 * running, a late initiative is only logged: reordering a live fight is the
 * DM's call, not a phone's.
 */

/** One thing this character can roll, ready to be rolled. */
export type RollOption =
  | { id: string; label: string; group: string; kind: 'd20'; modifier: number; initiative?: true }
  | { id: string; label: string; group: string; kind: 'damage'; notation: string; crit: boolean };

/** What the phone rolled, as it travels up the wire. */
export interface SeatRoll {
  rosterId: string;
  label: string;
  total: number;
  /** The working - `d20: 14 +5 = 19` - so the table can check the maths. */
  detail: string;
  initiative?: boolean;
}

/** Everything this character can roll, grouped the way a sheet reads. */
export function rollOptionsFor(ctx: BuildContext): RollOption[] {
  const out: RollOption[] = [
    { id: 'initiative', label: 'Initiative', group: 'Initiative', kind: 'd20', modifier: ctx.mods.dex, initiative: true },
  ];
  ctx.attacks.forEach((attack, i) => {
    const name = attack.weapon.name;
    out.push({ id: `hit:${i}`, label: `${name} to hit`, group: 'Attacks', kind: 'd20', modifier: attack.toHit });
    // The net deals no damage, and says so with a dash rather than dice.
    if (!parseNotation(attack.damage.dice)) return;
    const bonus = attack.damage.bonus;
    const notation = `${attack.damage.dice}${bonus ? signed(bonus) : ''}`;
    out.push({ id: `dmg:${i}`, label: `${name} damage`, group: 'Attacks', kind: 'damage', notation, crit: false });
    out.push({ id: `crit:${i}`, label: `${name} damage, critical`, group: 'Attacks', kind: 'damage', notation, crit: true });
  });
  for (const ability of ABILITIES) {
    out.push({ id: `save:${ability}`, label: `${ABILITY_NAMES[ability]} save`, group: 'Saving throws', kind: 'd20', modifier: saveBonusOf(ctx, ability) });
  }
  for (const line of ctx.proficiencies.skills) {
    out.push({ id: `skill:${line.skill}`, label: line.name, group: 'Skills', kind: 'd20', modifier: line.modifier });
  }
  for (const ability of ABILITIES) {
    out.push({ id: `check:${ability}`, label: `${ABILITY_NAMES[ability]} check`, group: 'Ability checks', kind: 'd20', modifier: ctx.mods[ability] });
  }
  return out;
}

/** Roll one option. Advantage applies to a d20; damage ignores it. */
export function performRoll(
  option: RollOption,
  mode: D20Mode,
  rng: Rng,
): { total: number; detail: string; natural: 20 | 1 | null } {
  if (option.kind === 'd20') {
    const roll = rollD20(option.modifier, mode, rng);
    return { total: roll.total, detail: roll.working, natural: roll.natural };
  }
  const roll = rollDamage(parseNotation(option.notation)!, option.crit, rng);
  return { total: roll.total, detail: roll.working, natural: null };
}

/** The wire carries only what passes this - a roll is a line in a log. */
export function isSeatRoll(value: unknown): value is SeatRoll {
  const r = value as Partial<SeatRoll> | null;
  return (
    !!r &&
    typeof r.rosterId === 'string' &&
    typeof r.label === 'string' &&
    r.label.length <= 80 &&
    typeof r.total === 'number' &&
    Number.isFinite(r.total) &&
    typeof r.detail === 'string' &&
    r.detail.length <= 160
  );
}

/**
 * What the host does with a roll: one line in the log, and - before the
 * fight starts - the initiative written where the DM would have typed it.
 */
export function applySeatRoll(roster: Roster, roll: SeatRoll): Roster {
  const entry = roster.entries.find((e) => e.id === roll.rosterId);
  if (!entry) return roster;
  const name = entry.build.name || 'Unnamed';
  let encounter = activeEncounter(roster);
  const combatant = encounter.combatants.find(
    (c) => c.kind === 'character' && c.rosterId === roll.rosterId,
  );

  let note = '';
  if (roll.initiative && combatant) {
    if (isRunning(encounter)) {
      note = ' - the fight is under way, so the order stays the DM’s';
    } else {
      encounter = setInitiative(encounter, combatant.id, roll.total);
      note = ' - into the order';
    }
  }
  encounter = appendLog(encounter, `${name} rolls ${roll.label}: ${roll.total} (${roll.detail})${note}.`);
  return updateEncounter(roster, encounter);
}
