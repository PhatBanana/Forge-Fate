import { useState } from 'react';
import { describeIntent } from '../seats';
import type { Intent, IntentKind } from '../seats';
import type { Spell } from '../data/spells';

/**
 * §105: the plan composer - §92's queue, composed from either chair.
 *
 * Two screens write the same queue: the seat (§93, the player's own hand)
 * and the cockpit's pass-the-tablet block. They carried two hand-kept
 * copies of this form, and §98's cast feature was propagated into both by
 * hand - the empirical proof the copies wanted to be one module. This is
 * that module: the kind menu, the cast picker, the target picker, the
 * note, the disabled rule and the intent construction, in one place.
 *
 * What deliberately stays the caller's:
 * - **The target list.** Who a plan may name is a per-screen policy and a
 *   recorded decision (§93): the seat sees through the fog's *memory*, the
 *   cockpit through live sight. The list comes in; the rule does not live
 *   here.
 * - **The castable list**, from the caller's own derivation of the build.
 * - **The commit and its announcement.** `onQueue` receives the intent;
 *   whether that travels a wire, lands in local state, or says a toast is
 *   the chair's business.
 */

const VOICE = {
  /* The seat speaks to the player; the cockpit speaks about them. */
  seat: {
    kind: 'What you plan to do',
    attackTarget: 'Who you plan to attack',
    spell: 'What you plan to cast',
    note: 'In your own words',
    placeholder: 'in your own words',
  },
  cockpit: {
    kind: 'What they plan to do',
    attackTarget: 'Who they plan to attack',
    spell: 'What they plan to cast',
    note: 'In their own words',
    placeholder: 'in their own words',
  },
} as const;

export function PlanComposer({
  title,
  perspective,
  combatantId,
  targets,
  castable,
  plan,
  onQueue,
  onWithdraw,
}: {
  /** The block's header: "When your turn comes", "Queue for X's turn". */
  title: string;
  perspective: keyof typeof VOICE;
  /** Whose turn the plan is for. */
  combatantId: string;
  /** Who a plan may name - the caller's visibility policy, applied. */
  targets: { id: string; label: string }[];
  /** What this character can cast - the caller's own derivation. */
  castable: Spell[];
  /** The plan already queued for this combatant, read back with Withdraw. */
  plan?: Intent;
  onQueue: (intent: Omit<Intent, 'id' | 'at'>) => void;
  onWithdraw: (combatantId: string) => void;
}) {
  const voice = VOICE[perspective];
  const [kind, setKind] = useState<IntentKind>('attack');
  const [target, setTarget] = useState('');
  const [spell, setSpell] = useState('');
  const [note, setNote] = useState('');

  return (
    <div className="plan-block">
      <b>{title}</b>
      {plan && (
        <span className="plan-line">
          Queued:{' '}
          {describeIntent(
            plan,
            plan.targetId ? targets.find((t) => t.id === plan.targetId)?.label : undefined,
          )}{' '}
          <button className="btn btn-sm" onClick={() => onWithdraw(combatantId)}>
            Withdraw
          </button>
        </span>
      )}
      <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <select
          aria-label={voice.kind}
          value={kind}
          onChange={(e) => setKind(e.target.value as IntentKind)}
        >
          <option value="attack">Attack</option>
          {/* §98: only a caster is offered the word. */}
          {castable.length > 0 && <option value="cast">Cast a spell</option>}
          <option value="move">Move</option>
          <option value="dash">Dash</option>
          <option value="dodge">Dodge</option>
          <option value="disengage">Disengage</option>
          <option value="help">Help</option>
          <option value="hide">Hide</option>
          <option value="other">Something else</option>
        </select>
        {kind === 'attack' && (
          <select
            aria-label={voice.attackTarget}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">— pick a target —</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        )}
        {kind === 'cast' && (
          <>
            {/* §98: the spell by name, from the character's own castable
                list. The slot it comes from, and any upcast, ride the
                note: a table conversation, not a field. */}
            <select
              aria-label={voice.spell}
              value={spell}
              onChange={(e) => setSpell(e.target.value)}
            >
              <option value="">— pick a spell —</option>
              {[...castable]
                .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.level ? ` — level ${s.level}` : ' — cantrip'}
                  </option>
                ))}
            </select>
            <select
              aria-label="Who it lands on"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">— nobody in particular —</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </>
        )}
        <input
          type="text"
          aria-label={voice.note}
          placeholder={voice.placeholder}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          className="btn btn-sm btn-primary"
          disabled={(kind === 'attack' && !target) || (kind === 'cast' && !spell)}
          onClick={() => {
            const chosen = kind === 'cast' ? castable.find((s) => s.id === spell) : undefined;
            onQueue({
              combatantId,
              kind,
              ...((kind === 'attack' || kind === 'cast') && target ? { targetId: target } : {}),
              ...(chosen ? { spellId: chosen.id, spellName: chosen.name } : {}),
              ...(note.trim() ? { note: note.trim() } : {}),
            });
            setNote('');
          }}
        >
          Queue it
        </button>
      </span>
    </div>
  );
}
