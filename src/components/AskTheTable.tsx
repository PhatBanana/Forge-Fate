import { useState } from 'react';
import { Panel } from './shared';
import { SKILLS } from '../data/skills';
import type { SkillId } from '../data/skills';
import type { CheckCall } from '../checkCall';

/**
 * §141: the DM asks the table for a skill.
 *
 * "Who has the highest Perception" is the commonest thing said at a table
 * that this app had no answer for: six people leaf through six sheets, read
 * out six numbers, and the DM does the comparing out loud.
 *
 * Beside `GroupSaves` on purpose, because that is the other panel that puts
 * a question to the whole party - but deliberately *not* folded into it.
 * A save resolves damage and belongs to the fight; a check is a question,
 * and folding them would give the lighter one a DC and a damage field it
 * has no use for.
 *
 * One control, because there is only one thing to decide. No DC: the DM has
 * one in their head and the answer they want is who to ask for a roll, not
 * whether it beat a number nobody has said out loud yet.
 */
export function AskTheTable({
  call,
  onCall,
}: {
  /** What is being asked, if anything. */
  call: CheckCall;
  /** Ask, or put the question away with null. */
  onCall: (call: CheckCall) => void;
}) {
  const [skillId, setSkillId] = useState<SkillId>('perception');
  const asked = call ? SKILLS.find((s) => s.id === call.skillId) : undefined;

  return (
    <Panel
      title="Ask the table"
      subtitle="Every seated phone lights that row and says whether to raise a hand."
    >
      {call ? (
        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="detail">
            Asking for <b>{asked?.name ?? call.skillId}</b>
          </span>
          <button type="button" className="btn btn-sm" onClick={() => onCall(null)}>
            Put it away
          </button>
        </div>
      ) : (
        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => onCall({ skillId })}
          >
            Ask
          </button>
        </div>
      )}
      {/*
        Said plainly rather than left to be discovered: nothing comes back
        over the wire. The answer is a hand going up in the room, which is
        §92's rule rather than an exception to it - a seat that could send
        its roll back would be a seat dictating a fact about the fight.
      */}
      <p className="hint" style={{ marginBottom: 0 }}>
        Nobody rolls on their phone — hands go up in the room.
      </p>
    </Panel>
  );
}
