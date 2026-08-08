import type { ReactNode } from 'react';
import { ABILITY_NAMES, RATING_LABELS } from '../types';
import type { Rating } from '../types';
import { SOURCE_LABELS, isOriginal, shortLabel } from '../data/sources';
import type { Source } from '../data/sources';
import { describeSuggestion } from '../engine/recommend';
import type { Reason, Suggestion } from '../engine/recommend';

export function Panel({
  title,
  subtitle,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && <h2>{title}</h2>}
      {subtitle && <p className="panel-sub">{subtitle}</p>}
      {children}
    </section>
  );
}

export function RatingTag({ rating }: { rating: Rating }) {
  return <span className={`tag rating-${rating}`}>{RATING_LABELS[rating]}</span>;
}

/**
 * Which book a row came from.
 *
 * Four tables have carried an honest `source` since they were written and the
 * app never showed it to anybody. It matters for two different readers: a
 * player checking whether their table allows Tasha's, and - once section 9's
 * originals exist - anybody who needs to know at a glance that an option is
 * *not* a published one.
 *
 * Published books get their short code, because that is what a table already
 * says out loud: "that's an XGtE subclass". The original says so in words,
 * since a code would read as one more book nobody had heard of. The full title
 * is in the tooltip either way.
 */
export function SourceTag({ source }: { source: Source }) {
  return (
    <span
      className={`tag source-tag ${isOriginal(source) ? 'is-original' : ''}`}
      title={SOURCE_LABELS[source]}
    >
      {shortLabel(source)}
    </span>
  );
}

export function Delta({ value }: { value: number }) {
  const cls = value > 0 ? 'pos' : value < 0 ? 'neg' : 'zero';
  const text = value > 0 ? `+${round(value)}` : value < 0 ? `${round(value)}` : '0';
  return <span className={`delta ${cls}`}>{text}</span>;
}

function round(value: number): string {
  return (Math.round(value * 10) / 10).toString();
}

export function ReasonList({ reasons }: { reasons: Reason[] }) {
  if (!reasons.length) return null;
  return (
    <ul className="reasons">
      {reasons.map((reason, i) => (
        <li key={i}>
          <Delta value={reason.delta} />
          <span>{reason.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Normalises the engine's raw score onto a 0-100 bar for display. */
export function FitBar({ score, max = 18 }: { score: number; max?: number }) {
  const pct = Math.max(4, Math.min(100, (score / max) * 100));
  return (
    <span className="fitbar" title={`Fit score ${round(score)}`}>
      <i style={{ width: `${pct}%` }} />
    </span>
  );
}

export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; group?: string }[];
}) {
  const groups = new Map<string, typeof options>();
  for (const option of options) {
    const key = option.group ?? '';
    const list = groups.get(key) ?? [];
    list.push(option);
    groups.set(key, list);
  }
  const grouped = groups.size > 1 || !groups.has('');

  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {grouped
          ? [...groups.entries()].map(([group, list]) =>
              group ? (
                <optgroup key={group} label={group}>
                  {list.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ) : (
                list.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))
              ),
            )
          : options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
      </select>
    </label>
  );
}

/**
 * One ranked suggestion, open to its reasons.
 *
 * Shared rather than owned by one tab because several render it - and it
 * outlived the Optimizer, which is where it started. When §33.8 deleted that
 * tab and its feat browser, this needed no change at all, which is the whole
 * argument for it living here.
 */
export function SuggestionCard({
  suggestion,
  rank,
  onTake,
}: {
  suggestion: Suggestion;
  rank: number;
  onTake?: () => void;
}) {
  const isFeat = suggestion.kind === 'feat';
  const blocked = isFeat && !suggestion.eligible;

  return (
    <details className={`suggestion ${rank === 1 ? 'is-top' : ''} ${blocked ? 'is-blocked' : ''}`}>
      <summary>
        <span className="rank">{rank}</span>
        <span className="title">
          <strong>{describeSuggestion(suggestion)}</strong>
          {/* Was a plain `.src` span carrying the same string. The tag reads
              the same for a published book and stands out for an original,
              which is the only case where the difference matters. */}
          {isFeat && <SourceTag source={suggestion.feat.source} />}
          {!isFeat && <span className="src">ability score improvement</span>}
        </span>
        <FitBar score={suggestion.score} />
      </summary>
      <div className="body">
        {isFeat && <p>{suggestion.feat.summary}</p>}
        {isFeat && suggestion.asiChoice && (
          <p className="muted">
            Recommended half-feat increase: +1 {ABILITY_NAMES[suggestion.asiChoice]}
          </p>
        )}
        {blocked && (
          <div className="callout error" style={{ marginBottom: 10 }}>
            {suggestion.blockedBy.join('; ')}
          </div>
        )}
        <ReasonList reasons={suggestion.reasons} />
        {onTake && !blocked && (
          <button className="btn btn-sm" style={{ marginTop: 12 }} onClick={onTake}>
            Take {describeSuggestion(suggestion)}
          </button>
        )}
      </div>
    </details>
  );
}
