import { useEffect, useRef, useState } from 'react';

/**
 * A panel you can drag by its title bar.
 *
 * Extracted from `PopOut`'s in-page fallback in §32.3, where it had been the
 * only draggable thing in the app. §32 gave every HUD panel a title bar and a
 * reason to move - a cockpit docked on the right is in the way of a fight
 * happening on the right - so the behaviour became worth having once rather
 * than twice.
 *
 * ## What it is, precisely
 *
 * An offset, not a position: `{x, y}` measured from wherever CSS put the
 * panel, applied as a `transform`. That matters. The panels this drives are
 * docked by CSS to an edge, and a docked panel that suddenly acquired
 * `left`/`top` would jump the moment it was touched. An offset of zero is the
 * dock, which is also how the caller can tell a panel has been moved at all.
 *
 * The listeners live on `window` rather than the panel, because every drag
 * outruns the thing being dragged, and they are attached only while a drag is
 * in progress.
 */

export interface DragPosition {
  /** Offset from where CSS put the panel. `{0, 0}` means untouched. */
  at: { x: number; y: number };
  /** True once dragged anywhere - what "undocked" is decided from. */
  moved: boolean;
  /** Spread onto the title bar. */
  handle: { onPointerDown: (e: { clientX: number; clientY: number }) => void };
  /** Put it back on its edge. */
  reset: () => void;
}

export function useDragPosition(initial = { x: 0, y: 0 }): DragPosition {
  const [at, setAt] = useState(initial);
  const [dragging, setDragging] = useState(false);
  const from = useRef<{ x: number; y: number } | null>(null);

  /*
    Whether a drag is running is *state*, not just the ref holding where it
    started, and that is a fix rather than a style. The version this was
    extracted from kept only the ref and ran the effect on every render with no
    dependency array - but pressing the title bar sets a ref and causes no
    render, so by the time a pointer moved there were no listeners attached and
    the panel did not move at all. It shipped unnoticed because the panel it
    was on only appears under 900px wide.
  */
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      if (!from.current) return;
      setAt({ x: e.clientX - from.current.x, y: e.clientY - from.current.y });
    };
    const drop = () => {
      from.current = null;
      setDragging(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', drop);
    window.addEventListener('pointercancel', drop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', drop);
      window.removeEventListener('pointercancel', drop);
    };
  }, [dragging]);

  return {
    at,
    moved: at.x !== 0 || at.y !== 0,
    handle: {
      onPointerDown: (e) => {
        from.current = { x: e.clientX - at.x, y: e.clientY - at.y };
        setDragging(true);
      },
    },
    reset: () => setAt({ x: 0, y: 0 }),
  };
}
