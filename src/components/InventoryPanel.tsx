import { useMemo, useState } from 'react';
import type { Build, Coins } from '../types';
import {
  GEAR,
  GEAR_CATEGORY_LABELS,
  GEAR_CATEGORY_ORDER,
  formatCost,
  formatWeight,
  gearById,
} from '../data/gear';
import type { BuildContext } from '../engine/character';
import { describePurse, purseInCopper } from '../engine/inventory';
import { ChoiceRow } from './ChoiceRow';
import { rowState } from './picker';
import type { PickerProps } from './picker';

/**
 * Ordinary equipment: rope, rations, torches, tools, and what it all weighs.
 *
 * None of it changes a number the optimizer scores, which is why the app went
 * six phases without it. What it does change is whether the sheet is a sheet -
 * and weight is the one thing here the rules genuinely compute, so carrying
 * capacity is reported against what you are actually carrying rather than left
 * as an exercise.
 *
 * The picker is a search over the whole catalogue rather than a set of nested
 * menus. Two hundred entries in a grouped `<select>` is a scroll; a search box
 * finds "rope" in four keystrokes.
 */

const COIN_ORDER: (keyof Coins)[] = ['pp', 'gp', 'ep', 'sp', 'cp'];
const COIN_NAMES: Record<keyof Coins, string> = {
  pp: 'Platinum',
  gp: 'Gold',
  ep: 'Electrum',
  sp: 'Silver',
  cp: 'Copper',
};

export function InventoryPanel({
  build,
  ctx,
  patch,
  picker,
  onPicker,
}: {
  build: Build;
  ctx: BuildContext;
  patch: (partial: Partial<Build>) => void;
} & PickerProps) {
  const [query, setQuery] = useState('');
  const gear = build.gear ?? [];
  const inv = ctx.inventory;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return GEAR.filter((item) => item.name.toLowerCase().includes(q)).slice(0, 12);
  }, [query]);

  const add = (gearId: string) => {
    const existing = gear.find((entry) => entry.gearId === gearId);
    patch({
      gear: existing
        ? gear.map((entry) =>
            entry.gearId === gearId ? { ...entry, quantity: entry.quantity + 1 } : entry,
          )
        : [...gear, { gearId, quantity: 1 }],
    });
    setQuery('');
  };

  const setQuantity = (gearId: string, quantity: number) =>
    patch({
      gear:
        quantity <= 0
          ? gear.filter((entry) => entry.gearId !== gearId)
          : gear.map((entry) => (entry.gearId === gearId ? { ...entry, quantity } : entry)),
    });

  const setCoins = (partial: Partial<Coins>) => patch({ coins: { ...build.coins, ...partial } });

  // Grouped so a list of thirty things reads as an inventory rather than a pile.
  const held = GEAR_CATEGORY_ORDER.map((category) => ({
    category,
    entries: gear
      .map((entry) => ({ entry, gear: gearById(entry.gearId) }))
      .filter((row) => row.gear?.category === category),
  })).filter((group) => group.entries.length > 0);

  const pct = inv.capacity > 0 ? Math.min(100, (inv.weight / inv.capacity) * 100) : 0;

  return (
    <ChoiceRow
      {...rowState('inventory', { picker, onPicker })}
      title="Inventory"
      summary={`${inv.weight} lb of ${inv.capacity} · ${describePurse(build.coins)}`}
      emptyLabel="nothing carried"
      /* Every line of gear, so shutting the catalogue never hides something
         you are carrying - and each drops one, the same as setting its
         quantity to zero inside. */
      taken={gear.map((entry) => ({
        id: entry.gearId,
        label: `${gearById(entry.gearId)?.name ?? entry.gearId}${entry.quantity > 1 ? ` ×${entry.quantity}` : ''}`,
        onRemove: () => setQuantity(entry.gearId, 0),
      }))}
    >
      <label className="field">
        <span>Add equipment</span>
        <input
          type="text"
          placeholder="rope, rations, thieves' tools…"
          aria-label="Search the equipment catalogue"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      {query.trim() !== '' && (
        <div className="gear-results">
          {matches.length === 0 && <p className="muted">Nothing in the catalogue matches that.</p>}
          {matches.map((item) => (
            <button key={item.id} className="gear-result" onClick={() => add(item.id)}>
              <span className="name">{item.name}</span>
              <span className="src">{GEAR_CATEGORY_LABELS[item.category]}</span>
              <span className="cost">{formatCost(item.cost)}</span>
              <span className="weight">{formatWeight(item.weight)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="carry-bar" role="img" aria-label={`${inv.weight} of ${inv.capacity} pounds`}>
        <span
          className={`fill ${inv.overloaded ? 'is-over' : inv.weight > inv.heavilyEncumberedAt ? 'is-heavy' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {inv.overloaded && (
        <div className="callout error" style={{ marginTop: 10 }}>
          {inv.weight} lb. is more than your carrying capacity of {inv.capacity}. You cannot pick it
          all up.
        </div>
      )}
      {!inv.overloaded && inv.weight > inv.encumberedAt && (
        <p className="note" style={{ marginTop: 10 }}>
          Under the optional encumbrance variant you are{' '}
          {inv.weight > inv.heavilyEncumberedAt ? 'heavily encumbered' : 'encumbered'} past{' '}
          {inv.weight > inv.heavilyEncumberedAt ? inv.heavilyEncumberedAt : inv.encumberedAt} lb.
          Most tables do not use it, so this is a note rather than a problem.
        </p>
      )}

      {held.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>
          Nothing carried yet. Search above, or take a starting pack — an Explorer's pack is most of
          what a first-level character needs.
        </p>
      ) : (
        held.map((group) => (
          <div key={group.category} style={{ marginTop: 14 }}>
            <div className="field-label">{GEAR_CATEGORY_LABELS[group.category]}</div>
            {group.entries.map(({ entry, gear: item }) => (
              <div className="gear-row" key={entry.gearId}>
                <input
                  type="number"
                  min={0}
                  className="gear-qty"
                  aria-label={`How many ${item!.name}`}
                  value={entry.quantity}
                  onChange={(e) => setQuantity(entry.gearId, Number(e.target.value) || 0)}
                />
                <span className="name">
                  {item!.name}
                  {item!.note && <em className="note">{item!.note}</em>}
                </span>
                <span className="weight">
                  {item!.notCarried ? 'not carried' : formatWeight(item!.weight * entry.quantity)}
                </span>
                <button className="btn btn-sm" onClick={() => setQuantity(entry.gearId, 0)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        ))
      )}

      <div className="field-label" style={{ marginTop: 16 }}>
        Coins
      </div>
      <div className="coin-row">
        {COIN_ORDER.map((coin) => (
          <label className="coin" key={coin}>
            <input
              type="number"
              min={0}
              aria-label={COIN_NAMES[coin]}
              value={build.coins[coin]}
              onChange={(e) => setCoins({ [coin]: Math.max(0, Number(e.target.value) || 0) })}
            />
            <span>{coin}</span>
          </label>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 6 }}>
        {formatCost(purseInCopper(build.coins))} in total, weighing{' '}
        {Math.round(inv.purseWeight * 10) / 10} lb. — fifty coins to the pound, whatever the metal.
      </p>
    </ChoiceRow>
  );
}
