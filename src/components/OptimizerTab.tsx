import { useState } from 'react';
import type { Build } from '../types';
import type { BuildContext } from '../engine/character';
import type { ClassId } from '../types';
import { ProgressionPanel } from './ProgressionPanel';
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

      {section === 'plan' && <ProgressionPanel build={build} ctx={ctx} onChange={onChange} />}
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
