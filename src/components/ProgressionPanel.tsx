import { useMemo, useState } from 'react';
import { ABILITIES } from '../types';
import type { Build } from '../types';
import { LEVEL_CAP } from '../engine/character';
import type { BuildContext } from '../engine/character';
import { describeSuggestion, planProgression } from '../engine/recommend';
import { applyPlan, describePlannedLevels } from '../engine/plan';
import { Panel } from './shared';

/**
 * Every remaining ASI level, planned out.
 *
 * Lifted out of the Optimizer in §33.1, ahead of the Builder becoming one page.
 * It was one of three sections behind a sub-tab there; it belongs in the
 * Builder's pinned rail, beside the character it is planning for, because
 * "what should I take at 8?" is a question you ask *while* building, not on a
 * different screen.
 *
 * The plan is greedy and re-evaluates after every choice, which is how ASIs
 * actually work at the table: each pick changes what the next one is worth.
 */

export function ProgressionPanel({
  build,
  ctx,
  onChange,
}: {
  build: Build;
  ctx: BuildContext;
  onChange: (build: Build) => void;
}) {
  // §72: default to the printed game's 20, but a character already past it
  // starts the planner at their own level. The input runs to LEVEL_CAP.
  const [maxLevel, setMaxLevel] = useState(() => Math.max(20, ctx.totalLevel));
  const plan = useMemo(() => planProgression(build, maxLevel), [build, maxLevel]);

  return (
    <div className="stack">
      <Panel
        title="Progression plan"
        subtitle="Every remaining ASI level, planned out. The slot you have open right now is offered on the Builder, next to the feats you have already taken."
      >
        <label className="field field-sm">
          <span>Plan to character level</span>
          <input
            type="number"
            min={ctx.totalLevel}
            max={LEVEL_CAP}
            value={maxLevel}
            onChange={(e) =>
              setMaxLevel(Math.max(1, Math.min(LEVEL_CAP, Number(e.target.value) || 20)))
            }
          />
        </label>
        <p className="muted">
          The plan is greedy and re-evaluates after every choice, which is how ASIs actually work at
          the table: each pick changes what the next one is worth. Half-feats climb the list the
          moment a primary score goes odd.
        </p>
        {plan.length === 0 && (
          <p className="muted" style={{ marginTop: 12 }}>
            No ASI levels remain below character level {maxLevel}.
          </p>
        )}

        {plan.length > 0 && (
          <div className="field-label" style={{ marginTop: 18 }}>
            Level by level — each step assumes you took the one before it
          </div>
        )}
        {plan.map((step, index) => (
          <div className="plan-step" key={index}>
            <div className="when">{step.label}</div>
            <div>
              <div className="what">
                <span className="kind">{step.choice.kind === 'feat' ? 'Feat' : 'ASI'}</span>
                <strong>{describeSuggestion(step.choice)}</strong>
              </div>
              <div className="why">{step.choice.headline}</div>
              {step.runnerUp && <div className="alt">Runner-up: {describeSuggestion(step.runnerUp)}</div>}
              <div className="scores-after">
                {ABILITIES.map((a) => `${a.toUpperCase()} ${step.scoresAfter[a]}`).join('  ')}
              </div>
            </div>
          </div>
        ))}
        {plan.length > 0 && (
          <button
            className="btn btn-primary"
            style={{ marginTop: 14 }}
            onClick={() => onChange(applyPlan(build, plan))}
          >
            Apply the plan and level up to {describePlannedLevels(build, plan)}
          </button>
        )}
      </Panel>
    </div>
  );
}
