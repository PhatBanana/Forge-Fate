import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useDragPosition } from './useDragPosition';

/**
 * A floating frame: title bar, a body that scrolls, and the three things a
 * DM does to a panel in the middle of a fight.
 *
 * §32 turned the battle screen into one stage with everything floating inside
 * it, and the moment panels float they need to be movable - a cockpit docked
 * on the right is in the way of a fight happening on the right. Before this
 * there were two different frames doing nearly the same job (the cockpit's
 * `<aside>` and the drawer's `<section>`), each with its own header markup,
 * and neither could be collapsed, dragged or torn off.
 *
 * ## Docked, and what un-docking costs
 *
 * A panel is **docked** where CSS put it, and a docked panel may reserve part
 * of the board through the stage's safe area. Two things give that space back:
 *
 * - **Collapsing** it to just its title bar, which is the deliberate version;
 * - **Dragging** it, which un-docks it. A panel the DM has moved somewhere
 *   they chose is no longer at a known edge, so it cannot honestly claim an
 *   inset - it becomes a free float that covers whatever it is over.
 *
 * The caller owns both facts, because the caller is what computes the safe
 * area. `onDockChange` fires the first time a drag moves the panel.
 *
 * ## Why the body is not conditionally rendered
 *
 * Collapsing hides the body with CSS rather than returning `null` for it.
 * The cockpit's body holds live controls with their own state - a damage
 * field mid-type, a scroll position - and unmounting them means a DM who
 * collapses a panel to see the board loses whatever they had half-entered.
 */

export interface HudPanelProps {
  /** Stable across renders: what a caller persists position against. */
  id: string;
  title: string;
  /** Extra classes on the frame - which edge it docks to, mostly. */
  className?: string;
  collapsed?: boolean;
  onCollapse?: (collapsed: boolean) => void;
  /** Present when this panel can become its own window. */
  onPopOut?: () => void;
  /** Present when the panel can go away entirely. Drawers can; the cockpit
      cannot, because the cockpit is what the current turn is read from. */
  onClose?: () => void;
  /** Called with `false` the first time a drag moves it off its edge. */
  onDockChange?: (docked: boolean) => void;
  /** Rides the title bar, left of the buttons - a round counter, a count. */
  badge?: ReactNode;
  children: ReactNode;
}

export function HudPanel({
  id,
  title,
  className = '',
  collapsed = false,
  onCollapse,
  onPopOut,
  onClose,
  onDockChange,
  badge,
  children,
}: HudPanelProps) {
  const drag = useDragPosition();

  /*
    Docked-ness follows the offset, rather than being announced on pointer
    down. A press on the title bar that goes nowhere is a click, not an
    un-dock, and this is what tells the two apart - the panel is loose once it
    has actually moved, and docked again the moment the offset returns to zero,
    whether that came from the Dock button or from being dragged back.
  */
  useEffect(() => {
    onDockChange?.(!drag.moved);
    // The callback is the caller's business and often an inline arrow; keying
    // on it would fire this on every render of the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag.moved]);

  return (
    <section
      className={`hudp ${className} ${collapsed ? 'is-collapsed' : ''} ${drag.moved ? 'is-loose' : ''}`}
      aria-label={title}
      data-hud={id}
      style={drag.moved ? { transform: `translate(${drag.at.x}px, ${drag.at.y}px)` } : undefined}
    >
      <header
        className="hudp-bar"
        onPointerDown={(e) => {
          // A pointer that went down on one of the buttons is a click, not a
          // drag - without this, pressing Collapse would also start moving
          // the panel out from under the pointer.
          if ((e.target as HTMLElement).closest('button')) return;
          drag.handle.onPointerDown(e);
        }}
      >
        <span className="hudp-title">{title}</span>
        {badge ? <span className="hudp-badge">{badge}</span> : null}
        <span className="hudp-tools">
          {drag.moved ? (
            <button
              type="button"
              onClick={() => {
                drag.reset();
                onDockChange?.(true);
              }}
              aria-label={`Dock ${title}`}
              title="Put it back on its edge"
            >
              ⇥
            </button>
          ) : null}
          {onCollapse ? (
            <button
              type="button"
              onClick={() => onCollapse(!collapsed)}
              aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${title}`}
              aria-expanded={!collapsed}
            >
              {collapsed ? '▸' : '▾'}
            </button>
          ) : null}
          {onPopOut ? (
            <button type="button" onClick={onPopOut} aria-label={`Pop out ${title}`} title="Its own window">
              ⧉
            </button>
          ) : null}
          {onClose ? (
            <button type="button" onClick={onClose} aria-label={`Close ${title}`}>
              ✕
            </button>
          ) : null}
        </span>
      </header>
      <div className="hudp-body">{children}</div>
    </section>
  );
}
