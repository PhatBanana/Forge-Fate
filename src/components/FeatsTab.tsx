import { useMemo, useState } from 'react';
import type { Build, FeatTag } from '../types';
import type { BuildContext } from '../engine/character';
import { recommendFeats } from '../engine/recommend';
import { Panel, SuggestionCard } from './shared';

const TAGS: { value: FeatTag | 'all'; label: string }[] = [
  { value: 'all', label: 'Every feat' },
  { value: 'damage', label: 'Damage' },
  { value: 'accuracy', label: 'Accuracy' },
  { value: 'defense', label: 'Defense' },
  { value: 'survivability', label: 'Survivability' },
  { value: 'control', label: 'Control' },
  { value: 'mobility', label: 'Mobility' },
  { value: 'action-economy', label: 'Action economy' },
  { value: 'caster', label: 'Casting' },
  { value: 'melee', label: 'Melee' },
  { value: 'ranged', label: 'Ranged' },
  { value: 'skills', label: 'Skills' },
  { value: 'social', label: 'Social' },
  { value: 'utility', label: 'Utility' },
];

export function FeatsTab({
  build,
  ctx,
  onChange,
}: {
  build: Build;
  ctx: BuildContext;
  onChange: (build: Build) => void;
}) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<FeatTag | 'all'>('all');
  const [showIneligible, setShowIneligible] = useState(true);

  const suggestions = useMemo(
    () => recommendFeats(ctx, { excludeTaken: true, includeIneligible: showIneligible }),
    [ctx, showIneligible],
  );

  const filtered = suggestions.filter((s) => {
    if (tag !== 'all' && !s.feat.tags.includes(tag)) return false;
    if (!query.trim()) return true;
    const needle = query.toLowerCase();
    return (
      s.feat.name.toLowerCase().includes(needle) ||
      s.feat.summary.toLowerCase().includes(needle) ||
      s.feat.source.toLowerCase().includes(needle)
    );
  });

  const take = (featId: string, asiChoice?: string) => {
    onChange({
      ...build,
      featIds: [...build.featIds, featId],
      featAsiChoices: asiChoice
        ? { ...build.featAsiChoices, [featId]: asiChoice as never }
        : build.featAsiChoices,
    });
  };

  return (
    <Panel
      title="Every feat, scored for this build"
      subtitle={`Ranked for ${ctx.race.name} ${ctx.slices
        .map((s) => `${s.klass.name} ${s.entry.level}`)
        .join(' / ')} using a ${ctx.weaponStyle} / ${ctx.loadout} loadout. Change the combat profile on the Builder tab and the whole list re-sorts.`}
    >
      <div className="searchbar">
        <input
          type="text"
          placeholder="Search feats…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={tag} onChange={(e) => setTag(e.target.value as FeatTag | 'all')}>
          {TAGS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={showIneligible}
          onChange={(e) => setShowIneligible(e.target.checked)}
        />
        <span>Show feats whose prerequisites this build does not meet</span>
      </label>

      <p className="muted" style={{ marginBottom: 14 }}>
        {filtered.length} feats. Expand any row to see exactly which conditions in this build moved
        its score, and by how much.
      </p>

      {filtered.map((suggestion, index) => (
        <SuggestionCard
          key={suggestion.id}
          suggestion={suggestion}
          rank={index + 1}
          onTake={() => take(suggestion.id, suggestion.asiChoice)}
        />
      ))}
    </Panel>
  );
}
