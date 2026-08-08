import { useState } from 'react';
import type { Build, CustomResource } from '../types';
import { ChoiceRow } from './ChoiceRow';
import { rowState } from './picker';
import type { PickerProps } from './picker';

/**
 * Counters the app has no table for.
 *
 * Everything a 2014 or 2024 class hands you is already tracked - Ki (Focus
 * Points in 2024), Rage, Sorcery Points, Channel Divinity, Lay on Hands,
 * Bardic Inspiration, all of it, from `data/classResources.ts`, with the
 * right maximum for your level and the right recharge on the right rest.
 * Nothing here is needed for those.
 *
 * What this is for is everything else: Theros piety, Ravnica renown, a
 * subclass your DM wrote, a pool a supplement introduced. Those tables live in
 * books this project has no licence to reproduce, so the honest answer is not
 * to guess at them but to let you name the counter and have the app keep it -
 * on the sheet, in the rests, and in the save.
 *
 * Two shapes, and the only difference is where the counter sits when it is
 * new: a **pool** starts full and you spend it down, a **score** starts at
 * nothing and you build it up. Piety is a score, and no rest touches it.
 */

const RECHARGES: { value: CustomResource['recharge']; label: string; hint: string }[] = [
  { value: 'long', label: 'Long rest', hint: 'Back to where it started after a long rest.' },
  { value: 'short', label: 'Short rest', hint: 'Back after a short rest, and so after a long one too.' },
  { value: 'none', label: 'Never', hint: 'No rest touches it. This is what a score like piety wants.' },
];

export function CountersPanel({
  build,
  patch,
  picker,
  onPicker,
}: {
  build: Build;
  patch: (partial: Partial<Build>) => void;
} & PickerProps) {
  const counters = build.customResources ?? [];
  const [name, setName] = useState('');
  const [max, setMax] = useState('5');
  const [startsAt, setStartsAt] = useState<CustomResource['startsAt']>('full');
  const [recharge, setRecharge] = useState<CustomResource['recharge']>('long');

  const setCounters = (next: CustomResource[]) => patch({ customResources: next });

  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCounters([
      ...counters,
      {
        // Time-based rather than an index, so removing one cannot hand a new
        // counter an id whose tracked value is still sitting in play state.
        id: `custom-${Date.now().toString(36)}-${counters.length}`,
        name: trimmed,
        max: Math.max(1, Math.round(Number(max) || 1)),
        startsAt,
        recharge,
      },
    ]);
    setName('');
  };

  return (
    <ChoiceRow
      {...rowState('counters', { picker, onPicker })}
      title="Your own counters"
      summary={
        counters.length
          ? `${counters.length} tracked`
          : 'for anything the app has no table for'
      }
      emptyLabel="none added — class resources are already tracked"
      taken={counters.map((counter) => ({
        id: counter.id,
        label: `${counter.name} ${counter.max}`,
        onRemove: () => setCounters(counters.filter((c) => c.id !== counter.id)),
      }))}
    >
      <div className="row" style={{ gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Name it — Piety, Renown…"
          aria-label="Name the counter"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
          }}
        />
        <label className="checkbox">
          <span>Out of</span>
          <input
            type="number"
            min={1}
            className="qty"
            aria-label="Maximum"
            value={max}
            onChange={(e) => setMax(e.target.value)}
          />
        </label>
        <select
          aria-label="Pool or score"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value as CustomResource['startsAt'])}
        >
          <option value="full">A pool — starts full, spent down</option>
          <option value="empty">A score — starts at nothing, built up</option>
        </select>
        <select
          aria-label="When it comes back"
          value={recharge}
          onChange={(e) => setRecharge(e.target.value as CustomResource['recharge'])}
        >
          {RECHARGES.map((option) => (
            <option key={option.value} value={option.value} title={option.hint}>
              {option.label}
            </option>
          ))}
        </select>
        <button className="btn btn-sm btn-primary" disabled={!name.trim()} onClick={add}>
          Add
        </button>
      </div>

      {counters.length === 0 ? (
        <p className="muted">
          Nothing added. A Monk's Ki, a Barbarian's Rage and every other class resource are already
          on your sheet — this is only for what the books this app ships do not have.
        </p>
      ) : (
        counters.map((counter, index) => (
          <div className="item-row" key={counter.id}>
            <div className="item-main">
              <strong>{counter.name}</strong>
              <span className="src">
                out of {counter.max} ·{' '}
                {counter.startsAt === 'full' ? 'starts full' : 'starts at nothing'}
              </span>
              <div className="item-sub">
                {counter.recharge === 'none'
                  ? 'No rest brings it back or takes it away.'
                  : `Back to ${counter.startsAt === 'full' ? counter.max : 0} on a ${counter.recharge} rest.`}
              </div>
            </div>
            <div className="item-actions">
              <button
                className="btn btn-sm"
                onClick={() => setCounters(counters.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            </div>
          </div>
        ))
      )}
    </ChoiceRow>
  );
}
