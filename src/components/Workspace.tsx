import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  DEFAULT_LAYOUT,
  loadLayout,
  railWidth,
  resizeRail,
  saveLayout,
  toggleRail,
} from '../workspace';
import type { RailState, WorkspaceLayout } from '../workspace';

/**
 * Three columns: a rail, the thing you are working on, a rail.
 *
 * The shape every tool that runs a session settles on - Photoshop, Foundry,
 * Roll20 - because the same two questions are always live while you work on
 * the third. Here that is "whose turn is it" on one side and "what is left of
 * them" on the other, with the map in the middle.
 *
 * Deliberately **not** applied to the whole app. The Builder is a form and the
 * character sheet is a piece of paper; both want width more than they want
 * company. This is built as a shell so a second surface can adopt it if it
 * earns it, rather than because every screen should look the same.
 *
 * ## What "moveable" means here
 *
 * Drag a divider to resize, click it to collapse a rail to a strip, and the
 * widths are remembered per workspace. Full Photoshop docking - dragging
 * panels between docks into tabbed groups - is a different project, and most
 * of what it buys is already here: `PopOut` detaches anything into its own
 * window, which is further than a dock goes.
 *
 * ## The parts that are easy to get wrong
 *
 * The drag listeners live on `window` rather than on the divider, because a
 * pointer moving faster than React re-renders leaves the element behind and
 * the drag stops halfway. The separators are focusable and take arrow keys,
 * because a resizer that only answers to a mouse is a resizer half the people
 * using it cannot reach. And below `--ws-stack` the whole thing becomes one
 * column: three columns on a phone is three unusable columns.
 */

export interface Rail {
  /** Shown on the strip when collapsed, and above the contents when not. */
  title: string;
  content: ReactNode;
}

export function Workspace({
  id,
  left,
  right,
  children,
}: {
  /** Which layout to remember. One per surface that adopts this. */
  id: string;
  left?: Rail;
  right?: Rail;
  children: ReactNode;
}) {
  const [layout, setLayout] = useState<WorkspaceLayout>(DEFAULT_LAYOUT);

  // Read after mount rather than in the initialiser: `loadLayout` touches
  // `localStorage`, which is not there when this is rendered on a machine
  // without one, and the default is the right answer until it is.
  useEffect(() => setLayout(loadLayout(id)), [id]);

  const update = useCallback(
    (next: WorkspaceLayout) => {
      setLayout(next);
      saveLayout(id, next);
    },
    [id],
  );

  const setRail = useCallback(
    (side: 'left' | 'right', rail: RailState) => update({ ...layout, [side]: rail }),
    [layout, update],
  );

  const columns = [
    left ? `${railWidth(layout.left)}px` : null,
    left ? 'var(--ws-divider)' : null,
    'minmax(0, 1fr)',
    right ? 'var(--ws-divider)' : null,
    right ? `${railWidth(layout.right)}px` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="ws" style={{ gridTemplateColumns: columns }}>
      {left && (
        <>
          <RailPanel
            side="left"
            rail={left}
            state={layout.left}
            onToggle={() => setRail('left', toggleRail(layout.left))}
          />
          <Divider
            side="left"
            state={layout.left}
            onResize={(delta) => setRail('left', resizeRail(layout.left, delta, 'left'))}
            onToggle={() => setRail('left', toggleRail(layout.left))}
            label={left.title}
          />
        </>
      )}

      <main className="ws-centre">{children}</main>

      {right && (
        <>
          <Divider
            side="right"
            state={layout.right}
            onResize={(delta) => setRail('right', resizeRail(layout.right, delta, 'right'))}
            onToggle={() => setRail('right', toggleRail(layout.right))}
            label={right.title}
          />
          <RailPanel
            side="right"
            rail={right}
            state={layout.right}
            onToggle={() => setRail('right', toggleRail(layout.right))}
          />
        </>
      )}
    </div>
  );
}

function RailPanel({
  side,
  rail,
  state,
  onToggle,
}: {
  side: 'left' | 'right';
  rail: Rail;
  state: RailState;
  onToggle: () => void;
}) {
  if (state.collapsed) {
    /*
      A collapsed rail is a button, not an empty column. The title runs
      vertically up it so the strip still says what is behind it - a bare arrow
      would leave you opening rails to find out which one you wanted.
    */
    return (
      <aside className={`ws-rail is-collapsed ws-${side}`}>
        {/* An explicit label, because the accessible name would otherwise be
            the bare title - "Turn order" - which names the thing rather than
            what pressing it does. */}
        <button
          type="button"
          className="ws-strip"
          onClick={onToggle}
          aria-label={`Show ${rail.title}`}
          title={`Show ${rail.title}`}
        >
          <span>{rail.title}</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className={`ws-rail ws-${side}`} aria-label={rail.title}>
      <div className="ws-rail-head">
        <span className="ws-rail-title">{rail.title}</span>
        <button
          type="button"
          className="ws-collapse"
          onClick={onToggle}
          aria-label={`Hide ${rail.title}`}
          title={`Hide ${rail.title}`}
        >
          {side === 'left' ? '⟨' : '⟩'}
        </button>
      </div>
      <div className="ws-rail-body">{rail.content}</div>
    </aside>
  );
}

/** How far an arrow key moves a divider. A shift-arrow moves four of them. */
const NUDGE = 16;

function Divider({
  side,
  state,
  onResize,
  onToggle,
  label,
}: {
  side: 'left' | 'right';
  state: RailState;
  onResize: (delta: number) => void;
  onToggle: () => void;
  label: string;
}) {
  const from = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);

  /*
    On `window`, not on the divider.

    A divider is six pixels wide and a pointer moving at any speed leaves it
    behind between renders. Listening on the element means the drag stops the
    moment the cursor outruns it, which feels like the panel sticking.
  */
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      if (from.current === null) return;
      onResize(e.clientX - from.current);
      from.current = e.clientX;
    };
    const stop = () => {
      from.current = null;
      setDragging(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [dragging, onResize]);

  return (
    <div
      className={`ws-divider ws-divider-${side} ${dragging ? 'is-dragging' : ''}`}
      /*
        A real separator, focusable and keyboard-operable. A resizer that only
        answers to a mouse is one that a keyboard user cannot reach at all, and
        `role="separator"` with `aria-valuenow` is what a screen reader needs to
        say how wide the rail currently is.
      */
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label}`}
      aria-valuenow={railWidth(state)}
      tabIndex={0}
      onPointerDown={(e) => {
        from.current = e.clientX;
        setDragging(true);
      }}
      onDoubleClick={onToggle}
      onKeyDown={(e) => {
        const step = e.shiftKey ? NUDGE * 4 : NUDGE;
        // Arrows move the divider in screen terms; `resizeRail` turns that into
        // the right direction for whichever side this is.
        if (e.key === 'ArrowLeft') onResize(-step);
        else if (e.key === 'ArrowRight') onResize(step);
        else if (e.key === 'Enter' || e.key === ' ') onToggle();
        else return;
        e.preventDefault();
      }}
    >
      <span className="ws-grip" aria-hidden="true" />
    </div>
  );
}
