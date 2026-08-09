import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { WHOLE_MAP, dragBy, viewBoxFor, zoomAt } from '../engine/camera';
import type { Camera, Frame } from '../engine/camera';
import type { ViewBox } from '../engine/letterbox';

/**
 * The gestures that move a map's camera, wired once for both maps.
 *
 * `DungeonMap` and `IsoMap` draw completely differently but handle a pointer
 * identically - the same paint stroke, the same token drag, the same
 * hover-per-square. The camera is the same again, so it lives here rather than
 * being written twice and drifting, which is the mistake §32.1 was about.
 *
 * ## Which button does what, and why
 *
 * **Left is not the pan.** It already means something: before a fight a click
 * places the selected combatant, and in combat it walks them. Taking it for
 * the camera would take the game's primary verb away, so the pan is on
 * **hold right-click and drag**, which is what the user asked for and what
 * every map application uses. Middle-drag does the same, for one extra
 * condition, because a CAD habit reaches for it.
 *
 * That needed a fix first: the maps' `onPointerDown` checked `onPaint` and the
 * token drag but **never checked `e.button`**, so right-clicking the battle map
 * already placed or walked a token on top of opening the context menu. Painting
 * is gated to button 0 here, and it was worth fixing on its own.
 *
 * ## Three things that are easy to leave out
 *
 * - **`contextmenu` is prevented** over the map, or the browser menu appears
 *   the moment a right-drag ends. The map has no menu of its own, so nothing
 *   is lost.
 * - **The pointer is captured**, so a fast drag that leaves the element keeps
 *   panning instead of stopping dead at the edge.
 * - **Wheel is a native non-passive listener**, not React's `onWheel`. React
 *   attaches wheel passively, where `preventDefault` is ignored with a
 *   console warning - so a ctrl+wheel would zoom the whole page instead of the
 *   map, and an ordinary wheel would scroll whatever is behind it.
 *
 * ## Inert by default
 *
 * With no `onCamera` the hook does nothing at all: no listener, no capture, no
 * prevented menu. That is what keeps the Dungeons editor - which passes no
 * camera - exactly as it was.
 */

/** Two fingers, mid-gesture: where they were, so the next move is a delta. */
interface Pinch {
  cx: number;
  cy: number;
  dist: number;
}

export interface MapCamera {
  /** The rectangle of the drawing on screen. Render it *and* hit-test it. */
  view: ViewBox;
  /** True while a camera gesture owns the pointer, so painting stands down. */
  active: () => boolean;
  /** Returns true when the camera consumed the event and the map should not. */
  onPointerDown: (e: ReactPointerEvent) => boolean;
  onPointerMove: (e: ReactPointerEvent) => boolean;
  onPointerUp: (e: ReactPointerEvent) => void;
  onContextMenu: ((e: { preventDefault: () => void }) => void) | undefined;
}

export function useMapCamera(
  svg: RefObject<SVGSVGElement | null>,
  frame: Frame,
  camera: Camera = WHOLE_MAP,
  onCamera?: (next: Camera) => void,
): MapCamera {
  const view = viewBoxFor(camera, frame);

  /** The button-drag pan: the pointer id that owns it, and its last position. */
  const pan = useRef<{ id: number; x: number; y: number } | null>(null);
  /** Every touch currently down, so a second finger can start a pinch. */
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<Pinch | null>(null);

  /*
    The camera and frame as they are *now*, for the wheel listener. The
    listener is attached once - re-attaching it on every camera change would
    mean adding and removing a DOM listener on every wheel notch - so it must
    not close over the render's values, or zooming twice would both start from
    the same camera and the second notch would undo the first.
  */
  const live = useRef({ camera, frame, onCamera });
  live.current = { camera, frame, onCamera };

  useEffect(() => {
    const el = svg.current;
    if (!el || !onCamera) return;

    const onWheel = (e: WheelEvent) => {
      const { camera: from, frame: on, onCamera: emit } = live.current;
      if (!emit) return;
      /*
        Always prevented: without it a ctrl+wheel zooms the whole page (the
        browser's pinch-zoom gesture on a trackpad) and a plain wheel scrolls
        whatever is behind the map, both instead of zooming it.
      */
      e.preventDefault();

      // Lines and pages come through as small numbers; normalise to pixels so
      // a trackpad and a notched wheel move the camera by comparable amounts.
      const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      // Exponential, so each notch is a constant *ratio*: zooming in three
      // and out three lands exactly back where it started.
      const factor = Math.exp(-Math.max(-200, Math.min(200, px)) * 0.0016);
      emit(zoomAt(from, on, el.getBoundingClientRect(), e.clientX, e.clientY, factor));
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [svg, onCamera]);

  const centreOfTouches = (): Pinch | null => {
    const points = [...touches.current.values()];
    if (points.length < 2) return null;
    const [a, b] = points;
    return {
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
    };
  };

  const end = (e: ReactPointerEvent) => {
    if (pan.current?.id === e.pointerId) pan.current = null;
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2) pinch.current = null;
  };

  return {
    view,
    active: () => pan.current !== null || pinch.current !== null,

    onPointerDown: (e) => {
      if (!onCamera) return false;

      if (e.pointerType === 'touch') {
        touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        // The second finger turns a paint stroke into a camera gesture. One
        // finger stays a paint, which is what a tablet user expects.
        pinch.current = centreOfTouches();
        return pinch.current !== null;
      }

      // Right or middle. Left is the game's own click and is left alone.
      if (e.button !== 2 && e.button !== 1) return false;
      pan.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      // So a fast drag that leaves the map keeps panning rather than stopping
      // dead at the edge - the same thing the token drag already does.
      svg.current?.setPointerCapture?.(e.pointerId);
      return true;
    },

    onPointerMove: (e) => {
      if (!onCamera) return false;
      const box = svg.current?.getBoundingClientRect();

      if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) {
        touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const now = centreOfTouches();
        const was = pinch.current;
        if (!now || !was) return false;
        pinch.current = now;
        // Pan by the centroid, zoom by the spread - the two together are what
        // makes a pinch feel like moving a photograph rather than a slider.
        const panned = dragBy(camera, frame, box, now.cx - was.cx, now.cy - was.cy);
        onCamera(zoomAt(panned, frame, box, now.cx, now.cy, now.dist / was.dist));
        return true;
      }

      const from = pan.current;
      if (!from || from.id !== e.pointerId) return false;
      pan.current = { id: from.id, x: e.clientX, y: e.clientY };
      onCamera(dragBy(camera, frame, box, e.clientX - from.x, e.clientY - from.y));
      return true;
    },

    onPointerUp: end,

    /*
      Only prevented when the camera is live. Where there is no camera there is
      no right-drag either, so suppressing the browser's menu would take
      something away and give nothing back.
    */
    onContextMenu: onCamera ? (e) => e.preventDefault() : undefined,
  };
}
