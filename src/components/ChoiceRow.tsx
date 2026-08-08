import type { ReactNode } from 'react';

/**
 * A catalogue, closed.
 *
 * §33 puts the whole Builder on one page, and the reason that was abandoned
 * the first time is recorded in `BuilderTab`'s own header: seventeen panels all
 * open at once ran five screens tall, and the pain named was scrolling past
 * sixteen ranked cards to reach the feats. Four panels have arrived since, so
 * a naive merge is worse than the design already rejected.
 *
 * The answer is a rule rather than a diet:
 *
 * > Your character is always visible. The catalogue of things you have **not**
 * > taken is not. Exactly one catalogue is open at a time.
 *
 * That bounds the page at `sum(closed rows) + max(one open picker)`, so the
 * eighteenth panel costs about fifty pixels instead of a screen. It is not a
 * new idea here - `GlancePanel` already argues it: *"One at a time,
 * deliberately: the value of this panel is that it stays short enough to sit
 * above everything else."* Same argument, applied to the column.
 *
 * ## Two things this deliberately does not do
 *
 * **There is no uncontrolled mode.** `open` and `onOpen` are required, and the
 * one-at-a-time rule lives in whatever state the caller keeps. Giving each row
 * its own `useState` would be more convenient and would quietly delete the
 * height bound - every row could be open at once and the five-screen page
 * would be back.
 *
 * **What you have taken is never hidden.** The chips stay on the closed row
 * and each removes itself, because `ClassOptionsPanel` already ruled that *"an
 * option you cannot see is an option you cannot remove"* - and compacting has
 * to strengthen that rather than weaken it.
 */

export interface Chip {
  id: string;
  label: string;
  /** Absent for something granted rather than chosen - a class's fixed pick. */
  onRemove?: () => void;
}

export function ChoiceRow({
  id,
  title,
  /** The state of the choice: "2 to choose", "all chosen". */
  summary,
  taken = [],
  /** Shown in place of the chips when nothing is taken yet. */
  emptyLabel = 'nothing chosen yet',
  open,
  onOpen,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  taken?: Chip[];
  emptyLabel?: string;
  open: boolean;
  onOpen: (open: boolean) => void;
  children: ReactNode;
}) {
  const bodyId = `${id}-body`;
  return (
    <section className={`crow ${open ? 'is-open' : ''}`} data-choice={id}>
      <div className="crow-head">
        <button
          type="button"
          className="crow-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => onOpen(!open)}
        >
          <span className="crow-caret" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
          {/*
            The space between the two spans is deliberate and load-bearing.
            An accessible name is the concatenation of the text, not of the
            rendered boxes - `gap` separates them on screen and joins them in
            a screen reader, which was announcing "maneuvers0 of 3 chosen".
          */}
          <span className="crow-title">{title}</span>{' '}
          <span className="crow-summary">{summary}</span>
        </button>
      </div>

      {/*
        The chips belong to the *closed* row. Open, the catalogue itself shows
        what you have taken and offers to drop it, and rendering both put two
        "Remove Riposte" buttons on screen at once.

        That makes one thing a contract rather than a nicety: **an open body
        must show what is taken**, not only what is available. Otherwise this
        hides the only way to remove something, which is exactly the rule
        `ClassOptionsPanel` set out to protect.
      */}
      {!open && (
        <div className="crow-chips">
          {taken.length === 0 ? (
            <span className="crow-empty">{emptyLabel}</span>
          ) : (
            taken.map((chip) => (
              <span key={chip.id} className="crow-chip">
                {chip.label}
                {chip.onRemove && (
                  <button type="button" onClick={chip.onRemove} aria-label={`Remove ${chip.label}`}>
                    ✕
                  </button>
                )}
              </span>
            ))
          )}
        </div>
      )}

      {/*
        Rendered only when open, which is the height bound doing its work: a
        closed row costs its header and its chips and nothing else. That also
        means a test can assert on the *absence* of the cards, which is the
        cheapest way to check the rule is actually in force.
      */}
      {open && (
        <div className="crow-body" id={bodyId}>
          {children}
        </div>
      )}
    </section>
  );
}
