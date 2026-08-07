import { useState } from 'react';
import type { Build } from '../types';
import { KIND_LABELS, KIND_ORDER, MAGIC_ITEMS, RARITY_LABELS } from '../data/magicItems';
import type { BuildContext } from '../engine/character';
import { isConsumable, quantityOf } from '../engine/items';
import { Panel } from './shared';
import { RulesDisclosure } from './RulesText';

/**
 * Magic items, and the attunement slots they compete for.
 *
 * An item you carry but are not attuned to does nothing, and the panel says so
 * on the item rather than leaving you to wonder why your AC did not move. The
 * same goes for a Bracers of Defense worn under armor: the reason it is inert
 * is written where you would look for it.
 */

export function ItemsPanel({
  build,
  ctx,
  patch,
}: {
  build: Build;
  ctx: BuildContext;
  patch: (partial: Partial<Build>) => void;
}) {
  const [adding, setAdding] = useState('');
  const [customName, setCustomName] = useState('');

  const items = build.items ?? [];
  const setItems = (next: typeof items) => patch({ items: next });

  const overAttuned = ctx.attunedCount > ctx.attunementSlots;

  return (
    <Panel
      title="Magic items"
      subtitle={`${ctx.attunedCount}/${ctx.attunementSlots} attunement slots used. An item does nothing until it is attuned, where attunement is required.`}
    >
      <div className="row" style={{ gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <select
          aria-label="Add a magic item"
          value={adding}
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            setItems([...items, { itemId: id, attuned: false }]);
            setAdding('');
          }}
        >
          <option value="">Add an item…</option>
          {/* Grouped the way the books group them, because a flat list of two
              hundred is a scroll rather than a choice. */}
          {KIND_ORDER.map((kind) => (
            <optgroup key={kind} label={KIND_LABELS[kind]}>
              {MAGIC_ITEMS.filter((item) => item.kind === kind).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} — {RARITY_LABELS[item.rarity]}
                  {item.attunement ? ' (attunement)' : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <input
          type="text"
          placeholder="…or name your own"
          aria-label="Name a custom item"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || !customName.trim()) return;
            setItems([...items, { customName: customName.trim(), attuned: false }]);
            setCustomName('');
          }}
        />
      </div>

      {overAttuned && (
        <div className="callout error" style={{ marginBottom: 10 }}>
          You are attuned to {ctx.attunedCount} items but have {ctx.attunementSlots} slots. The ones
          past your limit are carried, not worn — un-attune one to choose which.
        </div>
      )}

      {ctx.items.length === 0 ? (
        <p className="muted">Nothing carried. Items that change a number are in the list above.</p>
      ) : (
        ctx.items.map((resolved, index) => (
          <div className={`item-row ${resolved.active ? 'is-active' : ''}`} key={index}>
            <div className="item-main">
              <strong>{resolved.name}</strong>
              {quantityOf(resolved.carried) > 1 && (
                <strong> ×{quantityOf(resolved.carried)}</strong>
              )}
              {resolved.carried.detail && <em> ({resolved.carried.detail})</em>}
              {resolved.item && (
                <span className="src">
                  {RARITY_LABELS[resolved.item.rarity]}
                  {resolved.item.attunement ? ' · attunement' : ''}
                </span>
              )}
              <div className="item-sub">
                {resolved.item?.summary ?? resolved.carried.note ?? 'A custom item.'}
              </div>
              {resolved.inactiveReason && (
                <div className="item-warn">{resolved.inactiveReason}</div>
              )}
              {resolved.item?.note && <div className="note">{resolved.item.note}</div>}
              {/* Custom items are the user's own words and have no SRD entry
                  to look up, so they are not offered a description. */}
              {resolved.item && <RulesDisclosure kind="magicItem" name={resolved.item.name} />}
            </div>

            <div className="item-actions">
              {/* Only the things you use up. Two of a permanent item would
                  double an effect that does not stack, and nobody carries
                  "three Cloaks of Protection" in a way worth modelling. */}
              {isConsumable(resolved.item) && (
                <>
                  <label className="checkbox">
                    <span>How many</span>
                    <input
                      type="number"
                      min={1}
                      className="qty"
                      aria-label={`How many ${resolved.name}`}
                      value={quantityOf(resolved.carried)}
                      onChange={(e) =>
                        setItems(
                          items.map((it, i) =>
                            i === index
                              ? { ...it, quantity: Math.max(1, Math.round(Number(e.target.value) || 1)) }
                              : it,
                          ),
                        )
                      }
                    />
                  </label>
                  {/* The SRD has no "Scroll of Invisibility" - it has a Spell
                      Scroll (2nd Level), and which spell is on it is written
                      on the scroll. Free text rather than a picker, because a
                      scroll can carry a spell this app does not know. */}
                  <input
                    type="text"
                    className="detail"
                    placeholder={resolved.item?.kind === 'scroll' ? 'Which spell?' : 'Note'}
                    aria-label={`What is written on this ${resolved.name}`}
                    value={resolved.carried.detail ?? ''}
                    onChange={(e) =>
                      setItems(
                        items.map((it, i) =>
                          i === index ? { ...it, detail: e.target.value || undefined } : it,
                        ),
                      )
                    }
                  />
                </>
              )}
              {resolved.item?.attunement && (
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={resolved.carried.attuned}
                    onChange={(e) =>
                      setItems(
                        items.map((it, i) =>
                          i === index ? { ...it, attuned: e.target.checked } : it,
                        ),
                      )
                    }
                  />
                  <span>Attuned</span>
                </label>
              )}
              <button
                className="btn btn-sm"
                onClick={() => setItems(items.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            </div>
          </div>
        ))
      )}

      {ctx.itemEffects.lines.length > 0 && (
        <>
          <div className="field-label" style={{ marginTop: 14 }}>
            What they are adding
          </div>
          <ul className="reasons">
            {ctx.itemEffects.lines.map((line, i) => (
              <li key={i}>
                <span className="delta pos">✓</span>
                <span>
                  {line.label}
                  <span className="src"> {line.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="muted" style={{ marginTop: 10 }}>
        {MAGIC_ITEMS.length} items. Those that move a number — armor class, an attack, a save DC, an
        ability score — feed it through to your sheet and say so above; the rest are recorded and
        printed, and the app does not pretend to compute what a Deck of Many Things does. Anything
        not listed can still be named by hand.
      </p>
    </Panel>
  );
}
