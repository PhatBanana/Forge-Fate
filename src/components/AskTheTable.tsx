import { useState } from 'react';
import { Panel } from './shared';
import { SKILLS } from '../data/skills';
import type { SkillId } from '../data/skills';
import type { CheckCall } from '../checkCall';
import { ABILITIES, ABILITY_NAMES } from '../types';
import type { Ability } from '../types';

/**
 * §141/§143: the DM asks the table something.
 *
 * "Who has the highest Perception" is the commonest thing said at a table
 * that this app had no answer for: six people leaf through six sheets, read
 * out six numbers, and the DM does the comparing out loud.
 *
 * Two kinds of question, and they are different in what the table does with
 * them rather than in the dice:
 *
 * - **A check** asks *who to ask*. Nobody has rolled and nothing is
 *   resolved, so nothing comes back: the answer is a hand going up.
 * - **A save** is an event everybody answers, and the answers change the
 *   fight, so the totals come back and the DM reads them.
 *
 * Beside `GroupSaves` on purpose, and deliberately not folded into it.
 * That panel rolls every save on this screen and applies the damage - a
 * fireball in three clicks (§108), which is the right trade when six
 * players are chatting. This is the other trade: slower, and the roll
 * belongs to the player. A save-or-die is worth waiting for; a wall of
 * fire ticking is not. The DM picks per question.
 */
export function AskTheTable({
  call,
  onCall,
  answers = {},
  names = {},
}: {
  /** What is being asked, if anything. */
  call: CheckCall;
  /** Ask, or put the question away with null. */
  onCall: (call: CheckCall) => void;
  /** §143: what each seat rolled, by roster id. Saves only. */
  answers?: Record<string, number>;
  /** Who those roster ids are, for reading the answers back. */
  names?: Record<string, string>;
}) {
  const [ask, setAsk] = useState<'skill' | 'save'>('skill');
  const [skillId, setSkillId] = useState<SkillId>('perception');
  const [ability, setAbility] = useState<Ability>('dex');
  const [dc, setDc] = useState('15');

  /** What is being asked, said the way a DM would say it out loud. */
  const asked = (() => {
    if (!call) return '';
    if (call.ask === 'skill') {
      return SKILLS.find((s) => s.id === call.skillId)?.name ?? call.skillId;
    }
    return `${ABILITY_NAMES[call.ability]} save${call.dc ? ` vs ${call.dc}` : ''}`;
  })();

  const rolled = Object.entries(answers);

  return (
    <Panel
      title="Ask the table"
      subtitle="Every seated phone lights the row. A check raises a hand; a save comes back."
    >
      {call ? (
        <>
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="detail">
              Asking for <b>{asked}</b>
            </span>
            <button type="button" className="btn btn-sm" onClick={() => onCall(null)}>
              Put it away
            </button>
          </div>
          {call.ask === 'save' && (
            <ul className="cs-list ask-answers">
              {rolled.length === 0 ? (
                <li className="muted">Waiting for the table to roll…</li>
              ) : (
                rolled
                  .sort((a, b) => b[1] - a[1])
                  .map(([rosterId, total]) => (
                    <li key={rosterId}>
                      <span className="val">
                        <b>{total}</b>
                      </span>
                      <span className="name">
                        {names[rosterId] ?? rosterId}
                        {call.dc !== undefined && (
                          <em>{total >= call.dc ? ' passed' : ' failed'}</em>
                        )}
                      </span>
                    </li>
                  ))
              )}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="field">
              <span>Ask for</span>
              <select
                value={ask}
                aria-label="What to ask for"
                onChange={(e) => setAsk(e.target.value as 'skill' | 'save')}
              >
                <option value="skill">A check</option>
                <option value="save">A saving throw</option>
              </select>
            </label>

            {ask === 'skill' ? (
              <label className="field">
                <span>Skill</span>
                <select
                  value={skillId}
                  aria-label="Skill to ask for"
                  onChange={(e) => setSkillId(e.target.value as SkillId)}
                >
                  {SKILLS.map((skill) => (
                    <option key={skill.id} value={skill.id}>
                      {skill.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label className="field">
                  <span>Save</span>
                  <select
                    value={ability}
                    aria-label="Save to ask for"
                    onChange={(e) => setAbility(e.target.value as Ability)}
                  >
                    {ABILITIES.map((one) => (
                      <option key={one} value={one}>
                        {ABILITY_NAMES[one]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>DC</span>
                  <input
                    type="number"
                    min={1}
                    aria-label="Difficulty class"
                    value={dc}
                    onChange={(e) => setDc(e.target.value)}
                  />
                </label>
              </>
            )}

            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() =>
                onCall(
                  ask === 'skill'
                    ? { ask: 'skill', skillId }
                    : { ask: 'save', ability, dc: Number(dc) || undefined },
                )
              }
            >
              Ask
            </button>
          </div>
          {/*
            Said plainly rather than left to be discovered, because the two
            questions behave differently and the difference is the point.
          */}
          <p className="hint" style={{ marginBottom: 0 }}>
            A check is answered in the room — nobody rolls on their phone. A save is rolled
            where the player is sitting, and the totals arrive here.
          </p>
        </>
      )}
    </Panel>
  );
}
