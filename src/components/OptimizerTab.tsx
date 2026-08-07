import { useMemo, useState } from 'react';
import { ABILITIES } from '../types';
import type { Build } from '../types';
import type { BuildContext } from '../engine/character';
import { CLASSES_BY_ID } from '../data/classes';
import { describeSuggestion, planProgression } from '../engine/recommend';
import type { PlannedSlot } from '../engine/recommend';
import type { ClassId } from '../types';
import { Panel } from './shared';
import { RacesTab } from './RacesTab';
import { FeatsTab } from './FeatsTab';

/**
 * Every question of the form "what should I take?", in one place.
 *
 * The progression plan, the species/class matrix and the feat browser were
 * three top-level tabs, which made them look like three unrelated features.
 * They are one: each ranks a choice against the build you actually have, using
 * the same scoring machinery and the same explanations. Splitting them across
 * the nav meant someone comparing a feat against an ability score increase had
 * to remember what the other tab said.
 */

type Section = 'plan' | 'pairings' | 'feats';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'plan', label: 'Progression' },
  { id: 'pairings', label: 'Species × Class' },
  { id: 'feats', label: 'Feats' },
];

export function OptimizerTab({
  build,
  ctx,
  onChange,
  onPickPairing,
}: {
  build: Build;
  ctx: BuildContext;
  onChange: (build: Build) => void;
  onPickPairing: (raceId: string, classId: ClassId) => void;
}) {
  const [section, setSection] = useState<Section>('plan');

  return (
    <>
      <nav className="subtabs" role="tablist" aria-label="Optimizer sections">
        {SECTIONS.map((entry) => (
          <button
            key={entry.id}
            role="tab"
            aria-selected={section === entry.id}
            onClick={() => setSection(entry.id)}
          >
            {entry.id === 'pairings' && build.ruleset === '2014' ? 'Lineage × Class' : entry.label}
          </button>
        ))}
      </nav>

      {section === 'plan' && <ProgressionSection build={build} ctx={ctx} onChange={onChange} />}
      {section === 'pairings' && (
        <RacesTab
          raceId={build.raceId}
          classId={ctx.primary.klass.id}
          ruleset={build.ruleset}
          onPick={onPickPairing}
        />
      )}
      {section === 'feats' && <FeatsTab build={build} ctx={ctx} onChange={onChange} />}
    </>
  );
}

function ProgressionSection({
  build,
  ctx,
  onChange,
}: {
  build: Build;
  ctx: BuildContext;
  onChange: (build: Build) => void;
}) {
  const [maxLevel, setMaxLevel] = useState(20);
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
            max={20}
            value={maxLevel}
            onChange={(e) => setMaxLevel(Math.max(1, Math.min(20, Number(e.target.value) || 20)))}
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
                {step.runnerUp && (
                  <div className="alt">
                    Runner-up: {describeSuggestion(step.runnerUp)}
                  </div>
                )}
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

/**
 * The levels the build ends at once the plan is applied. The plan reaches
 * forward to ASI levels the character has not hit yet, so applying it has to
 * take the character there too - otherwise the sheet spends slots it does not
 * own and the build review rightly complains.
 */
function plannedLevels(build: Build, plan: PlannedSlot[]): Map<string, number> {
  const levels = new Map<string, number>();
  for (const entry of build.classes) levels.set(entry.classId, entry.level);
  for (const step of plan) {
    if (!step.slot) continue;
    const current = levels.get(step.slot.classId) ?? 0;
    levels.set(step.slot.classId, Math.max(current, step.slot.classLevel));
  }
  return levels;
}

function describePlannedLevels(build: Build, plan: PlannedSlot[]): string {
  const levels = plannedLevels(build, plan);
  return build.classes.map((c) => `${CLASSES_BY_ID[c.classId].name} ${levels.get(c.classId)}`).join(' / ');
}

function applyPlan(build: Build, plan: PlannedSlot[]): Build {
  const levels = plannedLevels(build, plan);
  let updated: Build = {
    ...build,
    classes: build.classes.map((c) => ({ ...c, level: levels.get(c.classId) ?? c.level })),
  };
  for (const step of plan) {
    if (step.choice.kind === 'feat') {
      updated = {
        ...updated,
        featIds: [...updated.featIds, step.choice.id],
        featAsiChoices: step.choice.asiChoice
          ? { ...updated.featAsiChoices, [step.choice.id]: step.choice.asiChoice }
          : updated.featAsiChoices,
      };
    } else {
      updated = { ...updated, asiPicks: [...updated.asiPicks, [...step.choice.allocation]] };
    }
  }
  return updated;
}
