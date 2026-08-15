import { ABILITIES, ABILITY_NAMES } from '../types';
import type { Ability } from '../types';
import type { BuildContext } from '../engine/character';
import type { PlayState } from '../play';
import {
  addTimedCondition,
  applyDeathSaveRoll,
  breakConcentration,
  damage,
  heal,
  hpNow,
  movementLeft,
  setInspiration,
  setTurnSlot,
  toggleCondition,
  toggleTurnSlot,
} from '../play';
import { damageDice } from '../data/weapons';
import { CONDITIONS, CONDITIONS_BY_ID, conditionTextFor } from '../data/conditions';
import { defaultRng, rollD20 } from '../engine/dice';
import { useState } from 'react';
import type { Build } from '../types';
import { CommandMenu } from './ActionTray';
import { DamageField } from './shared';
import type { GrabMode } from '../engine/grapple';

/**
 * A character in a 320px column.
 *
 * Not the character sheet. The sheet is a piece of paper - one layout that is
 * read on screen and printed unchanged, and it wants the width it was designed
 * for. Squeezing it into a rail would break the one promise it makes.
 *
 * So this is a different thing with a different job: what a DM needs about
 * somebody *while it is not their turn*. Hit points and armor class, because
 * those are what the next attack roll is measured against. Saves, because half
 * of what a monster does is a saving throw. The attack line and what is left of
 * their movement, because that is the question when it *is* their turn. Nothing
 * else - no skills, no equipment, no spell list. Those are a click away on the
 * sheet, and the point of a rail is that it fits.
 *
 * Every number here is read from the same `BuildContext` and `PlayState` the
 * sheet reads, and every write goes back through the same functions. There is
 * one copy of a character's hit points in this app and this is a third window
 * onto it, not a fourth store.
 */

const signed = (value: number) => (value >= 0 ? `+${value}` : `${value}`);

export function PlayCard({
  ctx,
  play,
  onPlayChange,
  onPopOut,
  onAim,
  onAct,
  onMoveCommand,
  onGrab,
  onEscapeGrapple,
  onStandUp,
  onReleaseGrapple,
  onHide,
  silenced,
  standing,
}: {
  ctx: BuildContext;
  play: PlayState;
  onPlayChange: (play: PlayState) => void;
  /** Absent when there is nowhere to pop out to. */
  onPopOut?: () => void;
  /** Battle wiring, present when this card is the fight's cockpit: the
      command menu opens from the pips and acts through these. */
  onAim?: (strikes: { label: string; toHit: number; damage: { dice: string; type: string }[] }[]) => void;
  /** One composed write for whatever a command touches - play, build, the
      fight's log - because two writes from one gesture clobber each other. */
  onAct?: (act: { play?: PlayState; build?: Build; log?: string }) => void;
  /** Arm move mode on the battlefield. Movement is its own budget, not the
      action, so this spends nothing. */
  onMoveCommand?: () => void;
  /** Arm a shove, a trip or a grapple; the next click on a combatant resolves it. */
  onGrab?: (mode: GrabMode) => void;
  /** Offered only while this character is held, and only by the battle. */
  onEscapeGrapple?: () => void;
  onStandUp?: { feet: number; act: () => void };
  /** Offered only while they are holding somebody. */
  onReleaseGrapple?: () => void;
  onHide?: () => void;
  /**
   * Standing in a Silence, §64 - so no spell with a verbal component.
   *
   * Passed through rather than worked out here: whether a square is silent is
   * the battlefield's business, and a card shown outside a fight has no
   * battlefield to ask. Absent leaves the rule unapplied.
   */
  silenced?: boolean;
  /** The battle cockpit keeps the command box open the way the monster rail
      does - one glance answers "what can they do". Elsewhere the box still
      opens from a pip and closes behind itself. */
  standing?: boolean;
}) {
  /** Rounds typed beside the condition select; empty is "until removed". */
  const [conditionRounds, setConditionRounds] = useState('');
  /** Which pip's command menu is open - the Breath-of-Fire box. */
  const [menu, setMenu] = useState<'action' | 'bonus' | null>(standing ? 'action' : null);

  const max = ctx.hp.total;
  const current = hpNow(play, max);
  const down = current === 0;
  const speed = ctx.speed.total;

  // Saving throws come from the starting class only, the same rule the sheet
  // and the multiclass tables follow.
  const saveAbilities = new Set<Ability>(ctx.slices[0]?.klass.saves ?? []);
  const saveFor = (ability: Ability) =>
    ctx.mods[ability] +
    (saveAbilities.has(ability) ? ctx.proficiency : 0) +
    ctx.itemEffects.saves;

  return (
    <div className={`pcard ${down ? 'is-down' : ''}`}>
      <div className="pcard-head">
        <strong>{ctx.build.name || 'Unnamed'}</strong>
        {onPopOut && (
          <button type="button" className="btn btn-sm" onClick={onPopOut}>
            Pop out
          </button>
        )}
      </div>

      <div className="pcard-vitals">
        <div>
          <span className="k">Hit points</span>
          <b className={down ? 'is-down' : ''}>
            {current}
            <span className="of">/{max}</span>
          </b>
        </div>
        <div>
          <span className="k">Armor class</span>
          <b>{ctx.ac.total}</b>
        </div>
        <div>
          <span className="k">Speed</span>
          <b>
            {movementLeft(play, speed)}
            <span className="of">/{speed}</span>
          </b>
        </div>
      </div>

      {/* A bar rather than only a number: "about a third left" is the thing a
          DM reads at a glance while deciding what a monster does next. */}
      <div className="pcard-bar" role="img" aria-label={`${current} of ${max} hit points`}>
        <i style={{ width: `${max ? (current / max) * 100 : 0}%` }} />
      </div>

      {/* The movement, as the same bar the dock used to carry - folded in
          here when the dock retired. Same title, same numbers as the vitals. */}
      <div
        className="pcard-movebar hud-move"
        title={`${movementLeft(play, speed)} of ${speed} feet left this turn`}
      >
        <span className="hud-k">Move</span>
        <span className="hud-move-bar" aria-hidden="true">
          <i
            style={{
              width: `${speed ? Math.min(100, (movementLeft(play, speed) / speed) * 100) : 0}%`,
            }}
          />
        </span>
        <b>
          {movementLeft(play, speed)}
          <span className="of">/{speed} ft</span>
        </b>
      </div>

      <div className="pcard-row">
        {/* §80: the shared field - this card's idiom, extracted so the
            cockpit and the Order drawer speak it too. */}
        <DamageField
          label={`Damage or healing for ${ctx.build.name || 'this character'}`}
          onDamage={(n) => onPlayChange(damage(play, n, max))}
          onHeal={(n) => onPlayChange(heal(play, n, max))}
        />
      </div>

      {/*
        The action economy, as three toggles.

        The same `turn` the sheet tracks and the tracker resets, so a reaction
        spent here is spent everywhere. Movement is not repeated - it is in the
        vitals above, where it reads as a resource rather than as a control.
      */}
      {/*
        The pips, and the menu behind them. An UNSPENT Action or Bonus pip
        opens the command menu - which actions this character can take, the
        way the old RPGs asked - and acting through the menu is what spends
        it. A SPENT pip still refunds on press, and Reaction stays a plain
        toggle: reactions happen to you, menus do not.
      */}
      <div className="pcard-turn" role="group" aria-label="This turn">
        {(['action', 'bonusAction', 'reaction'] as const).map((slot) => (
          <button
            key={slot}
            type="button"
            className={`${play.turn[slot] ? 'is-spent' : ''} ${
              (slot === 'action' && menu === 'action') || (slot === 'bonusAction' && menu === 'bonus')
                ? 'is-open'
                : ''
            }`}
            aria-pressed={play.turn[slot]}
            title={
              play.turn[slot]
                ? 'Spent — press to give it back'
                : slot === 'reaction'
                  ? 'Press to spend'
                  : 'Press to choose what to spend it on'
            }
            onClick={() => {
              if (slot === 'reaction' || play.turn[slot]) {
                // A spent pip refunds. The standing box stays open through
                // it - only the pop-from-pip card closes behind the press.
                if (!standing) setMenu(null);
                onPlayChange(toggleTurnSlot(play, slot));
                return;
              }
              const which = slot === 'bonusAction' ? 'bonus' : 'action';
              setMenu(menu === which && !standing ? null : which);
            }}
          >
            {slot === 'bonusAction' ? 'Bonus' : slot === 'reaction' ? 'Reaction' : 'Action'}
          </button>
        ))}
        <button
          type="button"
          className="pcard-newturn"
          title="Everything comes back at the start of your turn, the reaction included"
          onClick={() =>
            onPlayChange(
              (['action', 'bonusAction', 'reaction'] as const).reduce(
                (next, slot) => setTurnSlot(next, slot, false),
                play,
              ),
            )
          }
        >
          New turn
        </button>
      </div>

      {menu && (
        <CommandMenu
          ctx={ctx}
          play={play}
          slot={menu}
          // Standalone cards (no battle wiring) still get a working menu:
          // a lone play write goes through the ordinary channel.
          onAct={onAct ?? (({ play: next }) => next && onPlayChange(next))}
          onAim={onAim}
          onMoveCommand={onMoveCommand}
          onGrab={onGrab}
          onEscapeGrapple={onEscapeGrapple}
          onStandUp={onStandUp}
          onReleaseGrapple={onReleaseGrapple}
          onHide={onHide}
          silenced={silenced}
          standing={standing}
          onClose={() => {
            if (!standing) setMenu(null);
          }}
        />
      )}

      <div className="pcard-saves">
        <span className="k">Saves</span>
        <span className="pcard-savelist">
          {ABILITIES.map((ability) => (
            <span key={ability} className={saveAbilities.has(ability) ? 'is-proficient' : ''}>
              <em title={ABILITY_NAMES[ability]}>{ability.toUpperCase()}</em>
              {signed(saveFor(ability))}
            </span>
          ))}
        </span>
      </div>

      {ctx.attacks.length > 0 && (
        <div className="pcard-attacks">
          <span className="k">Attacks</span>
          {ctx.attacks.map((attack, i) => (
            <p key={i}>
              {/* The second argument is whether it is swung two-handed, which
                  is what picks the versatile die - the same call the sheet
                  makes, so a longsword reads the same in both places. */}
              <b>{attack.weapon.name}</b> {signed(attack.toHit)} ·{' '}
              {damageDice(attack.weapon, attack.hand === 'main' && !ctx.loadouts.offHand)}
              {attack.damage.bonus ? signed(attack.damage.bonus) : ''} {attack.damage.type}
            </p>
          ))}
        </div>
      )}

      {/* Concentration, one chip: what is held, and a press to lose it. */}
      {play.concentratingOn && (
        <button
          type="button"
          className="tag hud-condition pcard-conc"
          title="Concentrating — press when it breaks"
          onClick={() => onPlayChange(breakConcentration(play))}
        >
          ✦ {play.concentratingOn} ×
        </button>
      )}

      {/* Only what is actually on them, removable in place. An empty list of
          fourteen conditions would be most of the rail. */}
      {play.conditions.length > 0 && (
        <div className="pcard-conditions">
          {play.conditions.map((id) => (
            <button
              key={id}
              type="button"
              className="tag hud-condition"
              title={`${conditionTextFor(id, ctx.build.ruleset)} — press to remove`}
              onClick={() => onPlayChange(toggleCondition(play, id))}
            >
              {CONDITIONS_BY_ID[id]?.name ?? id} ×
            </button>
          ))}
        </div>
      )}

      {/* The quick-add the dock used to carry: pick a condition, optionally
          with a clock in rounds, into the same store the sheet reads. */}
      <div className="pcard-addcond">
        <input
          type="number"
          min={1}
          className="hud-rounds"
          placeholder="∞"
          aria-label="Rounds the next condition lasts — empty means until removed"
          title="Rounds the next condition lasts — empty means until removed"
          value={conditionRounds}
          onChange={(e) => setConditionRounds(e.target.value)}
        />
        <select
          className="hud-add-condition"
          aria-label={`Add a condition to ${ctx.build.name || 'this character'}`}
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            onPlayChange(
              conditionRounds
                ? addTimedCondition(play, e.target.value, Math.max(1, Number(conditionRounds)))
                : toggleCondition(play, e.target.value),
            );
            setConditionRounds('');
          }}
        >
          <option value="">+ condition</option>
          {CONDITIONS.filter((c) => !play.conditions.includes(c.id)).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/*
        Heroic Inspiration, §42. It was in the data - the 2024 Human's
        Resourceful trait says "gain Heroic Inspiration on every long rest" -
        and there was nowhere on the sheet to put one, so the trait was a
        sentence rather than a resource. A single chip, because that is the
        whole rule: you have one or you do not, and a second is not a second
        reroll.
      */}
      <button
        type="button"
        className={`pcard-insp ${play.inspiration ? 'is-held' : ''}`}
        aria-pressed={!!play.inspiration}
        title={
          play.inspiration
            ? 'Heroic Inspiration in hand — spend it to reroll any d20. Press to spend.'
            : 'No Heroic Inspiration. Press when the DM hands you one.'
        }
        onClick={() => onPlayChange(setInspiration(play, !play.inspiration))}
      >
        <span className="hud-k">Inspiration</span>
        <b>{play.inspiration ? 'held' : '—'}</b>
      </button>

      {play.exhaustion > 0 && (
        <p className="pcard-warn">Exhaustion {play.exhaustion}</p>
      )}
      {down && (
        <>
          <p className="pcard-warn">Down — rolling death saves.</p>
          <div className="hud-deathsaves" role="group" aria-label="Death saves">
            <span className="hud-ds-dots" aria-hidden="true">
              {Array.from({ length: 3 }, (_, i) => (
                <i key={`s${i}`} className={i < play.deathSaves.successes ? 'is-success' : ''} />
              ))}
              ·
              {Array.from({ length: 3 }, (_, i) => (
                <i key={`f${i}`} className={i < play.deathSaves.failures ? 'is-failure' : ''} />
              ))}
            </span>
            <button
              type="button"
              className="btn btn-sm"
              title="Roll a death save — a 20 brings them back with 1 hp, a 1 is two failures"
              onClick={() => {
                const roll = rollD20(0, 'normal', defaultRng);
                onPlayChange(
                  applyDeathSaveRoll(
                    play,
                    {
                      total: roll.total,
                      natural: roll.rolls[0] === 20 ? 20 : roll.rolls[0] === 1 ? 1 : null,
                    },
                    max,
                  ),
                );
              }}
            >
              Roll
            </button>
          </div>
        </>
      )}
    </div>
  );
}
