import { useState } from 'react';
import { Panel } from './shared';

/** The call being made: which save, against what, for how much. */
export interface SaveCall {
  ability: string;
  dc: number;
  damage: string;
  /** Half on a pass - the commonest rider in the game, so it defaults on. */
  half: boolean;
}

export interface SaveResult {
  id: string;
  name: string;
  bonus: number;
  total: number;
  pass: boolean;
}

/**
 * §108: a fireball in three clicks - the call, the answers, the damage.
 *
 * The *call* is this panel's own state, which is the peel: a half-typed
 * DC was never the battle screen's business. The fight math stays where
 * the fight is - who is in the room, what each of them adds, and how
 * damage lands in two different stores - so the handlers take the call
 * as an argument instead of reading it out of a closure.
 */
export function GroupSaves({
  canRoll,
  results,
  onRoll,
  onApply,
  onDiscard,
}: {
  /** Nobody in the fight, nothing to roll. */
  canRoll: boolean;
  /** The answers, once the room has rolled. */
  results: SaveResult[] | null;
  onRoll: (call: SaveCall) => void;
  onApply: (call: SaveCall) => void;
  onDiscard: () => void;
}) {
  const [form, setForm] = useState<SaveCall>({ ability: 'dex', dc: 15, damage: '', half: true });

  return (
    <Panel
      title="Saving throws"
      subtitle="The call, the answers, the damage — a fireball in three clicks. Everyone rolls with their real bonus."
    >
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <label className="field field-sm">
          <span>Save</span>
          <select
            value={form.ability}
            onChange={(e) => setForm({ ...form, ability: e.target.value })}
          >
            {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((a) => (
              <option key={a} value={a}>
                {a.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="field field-sm">
          <span>DC</span>
          <input
            type="number"
            className="qty"
            value={form.dc}
            onChange={(e) => setForm({ ...form, dc: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="field field-sm">
          <span>Damage</span>
          <input
            type="number"
            className="qty"
            placeholder="—"
            value={form.damage}
            onChange={(e) => setForm({ ...form, damage: e.target.value })}
          />
        </label>
        <label className="checkbox" style={{ alignSelf: 'center' }}>
          <input
            type="checkbox"
            checked={form.half}
            onChange={(e) => setForm({ ...form, half: e.target.checked })}
          />
          <span>Half on a pass</span>
        </label>
        <button
          className="btn btn-sm btn-primary"
          style={{ alignSelf: 'center' }}
          disabled={!canRoll}
          onClick={() => onRoll(form)}
        >
          Roll the room
        </button>
      </div>

      {results && (
        <>
          <ul className="reasons">
            {results.map((result) => (
              <li key={result.id}>
                <span className={`delta ${result.pass ? 'pos' : 'neg'}`}>
                  {result.pass ? 'pass' : 'FAIL'}
                </span>
                <span>
                  {result.name} rolled <b>{result.total}</b> ({result.bonus >= 0 ? '+' : ''}
                  {result.bonus})
                </span>
              </li>
            ))}
          </ul>
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button
              className="btn btn-sm btn-primary"
              disabled={!Number(form.damage)}
              onClick={() => onApply(form)}
            >
              Apply {form.damage || '—'} damage
            </button>
            <button className="btn btn-sm" onClick={onDiscard}>
              Discard
            </button>
          </div>
        </>
      )}
    </Panel>
  );
}
