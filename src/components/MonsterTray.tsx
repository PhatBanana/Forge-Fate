import { useState } from 'react';
import type { Monster, MonsterAbility } from '../data/monsters';
import { parseUsage } from '../data/monsters';
import type { MonsterCombatant } from '../encounter';
import { rechargeReady, usesLeft } from '../encounter';
import { defaultRng, rollDie } from '../engine/dice';

/**
 * The monster's command menu - the stat block behind Attack / Abilities,
 * the same box shape the characters get, because a DM running a goblin
 * deserves the same grammar as a DM running the fighter.
 *
 * Attack drills into the aimable rows: every strike with its to-hit, the
 * Multiattack as the whole routine, recharge dice rolled on request,
 * per-day uses counted on the *instance* - Goblin A's breath being spent
 * says nothing about Goblin B's. Attacks resolve through the same
 * aim-and-chips flow the characters use. Save-based abilities are announced
 * rather than resolved - "DC 21 DEX, 18d6 fire" is the call a DM reads out,
 * and the group-saves panel is where the answers land.
 *
 * The one-click commands (Dash, Dodge, Disengage, Help) write the log line;
 * nothing polices a monster's economy, as ever - the log is the record.
 * Hide rolls the stat block's real Stealth through the battlefield.
 */

export interface Strike {
  label: string;
  toHit: number;
  damage: { dice: string; type: string }[];
}

const strikeOf = (ability: MonsterAbility): Strike | null =>
  ability.toHit !== undefined && ability.damage?.length
    ? { label: ability.name, toHit: ability.toHit, damage: ability.damage }
    : null;

export function MonsterCommandMenu({
  monster,
  combatant,
  onAim,
  onUse,
  onRecharge,
  onLog,
  onMove,
  onHide,
}: {
  monster: Monster;
  combatant: MonsterCombatant;
  /** Start aiming these strikes; the next click on a combatant resolves them. */
  onAim: (strikes: Strike[]) => void;
  /** A limited ability was used: count it and say so. */
  onUse: (ability: MonsterAbility, note: string) => void;
  /** A recharge die came up; flip the ability back on (or log the miss). */
  onRecharge: (ability: MonsterAbility, ready: boolean, rolled: number) => void;
  /** Write a line to the fight's log: "takes the Dodge action." */
  onLog?: (text: string) => void;
  /** Arm move mode on the battlefield - walking is the monster's own
      per-turn budget, so this logs nothing and spends nothing. */
  onMove?: () => void;
  /** Roll Stealth and hide, through the battlefield's own machinery. */
  onHide?: () => void;
}) {
  const [sub, setSub] = useState<null | 'attack' | 'abilities'>(null);

  const byName = new Map(monster.actions.map((a) => [a.name, a]));
  const multi = monster.actions.find((a) => a.multiattack?.length);
  const routine: Strike[] = multi?.multiattack
    ? multi.multiattack.flatMap((part) => {
        const strike = strikeOf(byName.get(part.name) ?? ({} as MonsterAbility));
        return strike ? Array.from({ length: part.count }, () => strike) : [];
      })
    : [];

  const strikes = monster.actions.filter((a) => strikeOf(a) !== null);
  const announced = monster.actions.filter((a) => strikeOf(a) === null && !a.multiattack?.length);

  /** Whether a usage-limited ability can be used right now, and its badge. */
  const gate = (ability: MonsterAbility): { ok: boolean; badge?: string } => {
    const usage = parseUsage(ability.usage);
    if (!usage) return { ok: true };
    if (usage.kind === 'recharge') {
      return rechargeReady(combatant, ability.name)
        ? { ok: true, badge: ability.usage }
        : { ok: false, badge: 'spent' };
    }
    const left = usesLeft(combatant, ability.name, usage.times);
    return { ok: left > 0, badge: `${left}/${usage.times}` };
  };

  const use = (ability: MonsterAbility) => {
    const note =
      ability.save && ability.toHit === undefined
        ? `${combatant.label}: ${ability.name} — DC ${ability.save.dc} ${ability.save.ability.toUpperCase()}${
            ability.damage?.length
              ? `, ${ability.damage.map((d) => `${d.dice} ${d.type}`).join(' + ')}`
              : ''
          }`
        : `${combatant.label} uses ${ability.name}`;
    onUse(ability, note);
  };

  const rechargeRoll = (ability: MonsterAbility, min: number) => {
    const rolled = rollDie(6, defaultRng);
    onRecharge(ability, rolled >= min, rolled);
  };

  const item = (label: string, onPick: () => void, hint?: string, count?: number) => (
    <button key={label} type="button" className="cmd-item" title={hint} onClick={onPick}>
      {label}
      {count !== undefined && <em>{count}</em>}
    </button>
  );

  return (
    <div
      className="cmd-menu"
      role="menu"
      aria-label={`${combatant.label}'s actions`}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !sub) return;
        e.stopPropagation();
        setSub(null);
      }}
    >
      {sub === null && (
        <div className="cmd-grid">
          {onMove &&
            item('Move', () => onMove(), 'Walk the lit tiles — movement is its own budget')}
          {(strikes.length > 0 || routine.length > 0) &&
            item('Attack', () => setSub('attack'), 'The stat block, aimable', strikes.length + (routine.length ? 1 : 0))}
          {announced.length > 0 &&
            item('Abilities', () => setSub('abilities'), 'Saves and everything announced', announced.length)}
          {onLog &&
            item('Dash', () => onLog('Dashes.'), "The map's amber tier charges the feet; this says it out loud")}
          {onHide && item('Hide', () => onHide(), 'Roll the stat block Stealth and vanish from the fog')}
          {onLog && item('Disengage', () => onLog('takes the Disengage action.'), 'No opportunity attacks this turn')}
          {onLog && item('Dodge', () => onLog('takes the Dodge action.'), 'Attacks against it have disadvantage')}
          {onLog && item('Help', () => onLog('takes the Help action.'), 'An ally gets advantage')}
        </div>
      )}

      {sub === 'attack' && (
        <div className="cmd-sub">
          {routine.length > 0 && (
            <button
              type="button"
              className="hud-act"
              title={`The whole routine: ${routine.map((s) => s.label).join(', ')} — then click a target`}
              onClick={() => onAim(routine)}
            >
              Multiattack <em>{routine.length}</em>
            </button>
          )}
          {monster.actions.map((ability) => {
            const strike = strikeOf(ability);
            if (!strike) return null;
            const { ok, badge } = gate(ability);
            return (
              <button
                key={ability.name}
                type="button"
                className="hud-act"
                disabled={!ok}
                title={ok ? `Aim ${ability.name}, then click a target` : `${ability.name} is spent`}
                onClick={() => {
                  onAim([strike]);
                  if (parseUsage(ability.usage)) use(ability);
                }}
              >
                {ability.name} {ability.toHit !== undefined ? `+${ability.toHit}` : ''}
                {badge && <em>{badge}</em>}
              </button>
            );
          })}
          <button type="button" className="cmd-back" onClick={() => setSub(null)}>
            ‹ Back
          </button>
        </div>
      )}

      {sub === 'abilities' && (
        <div className="cmd-sub">
          {announced.map((ability) => {
            const usage = parseUsage(ability.usage);
            const { ok, badge } = gate(ability);
            if (usage?.kind === 'recharge' && !ok) {
              return (
                <button
                  key={ability.name}
                  type="button"
                  className="hud-act hud-act-sub"
                  title={`Roll a d6 at the start of the turn; ${ability.usage} brings it back`}
                  onClick={() => rechargeRoll(ability, usage.min)}
                >
                  {ability.name}: roll recharge
                </button>
              );
            }
            return (
              <button
                key={ability.name}
                type="button"
                className="hud-act"
                disabled={!ok}
                title={ability.desc}
                onClick={() => use(ability)}
              >
                {ability.name}
                {ability.save && <em>DC {ability.save.dc}</em>}
                {badge && <em>{badge}</em>}
              </button>
            );
          })}
          <button type="button" className="cmd-back" onClick={() => setSub(null)}>
            ‹ Back
          </button>
        </div>
      )}
    </div>
  );
}
