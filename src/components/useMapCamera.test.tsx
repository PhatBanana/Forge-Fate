// @vitest-environment jsdom
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WHOLE_MAP } from '../engine/camera';
import type { Camera } from '../engine/camera';
import { generateDungeon } from '../engine/dungeon';
import type { Square } from '../encounter';
import { DungeonMap } from './DungeonMap';

/**
 * The camera's gestures, through a real map.
 *
 * Tested here rather than only in `engine/camera.test.ts` because the maths
 * was never the risky part - the wiring is. Which button starts a pan, whether
 * a right-click still paints, and whether the `viewBox` and the hit test move
 * together are all questions the pure functions cannot answer.
 *
 * The last of those is the one that matters. A camera that moved the drawing
 * but not `squareAt` would put every token in the wrong square, silently, and
 * that is the exact bug §32.1 spent a section fixing.
 */

const dungeon = generateDungeon('camera-test');

/** jsdom gives every element a zero box, so hand the map the drawing's own. */
const boxOf = (width: number, height: number) =>
  ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

function Harness({ live = true, onPaint }: { live?: boolean; onPaint?: (at: Square) => void }) {
  const [camera, setCamera] = useState<Camera>(WHOLE_MAP);
  return (
    <>
      <DungeonMap
        dungeon={dungeon}
        camera={camera}
        onCamera={live ? setCamera : undefined}
        onPaint={onPaint ?? (() => {})}
      />
      <span data-testid="scale">{camera.scale.toFixed(3)}</span>
    </>
  );
}

const map = () => document.querySelector('.dmap') as SVGSVGElement;
const viewBox = () => map().getAttribute('viewBox');
const scale = () => screen.getByTestId('scale').textContent;

/** The map's own drawing size, so there is no letterbox to reason about. */
const sizeMap = () => {
  const [, , w, h] = viewBox()!.split(' ').map(Number);
  map().getBoundingClientRect = () => boxOf(w, h);
};

describe('what the buttons mean', () => {
  it('leaves the view alone at rest, exactly as before the camera existed', () => {
    render(<Harness />);
    expect(viewBox()).toBe(`0 0 ${dungeon.width * 14} ${dungeon.height * 14}`);
  });

  it('paints on the left button, which is the game’s own click', () => {
    const onPaint = vi.fn();
    render(<Harness onPaint={onPaint} />);
    sizeMap();
    fireEvent.pointerDown(map(), { button: 0, clientX: 70, clientY: 70 });
    expect(onPaint).toHaveBeenCalledWith({ x: 5, y: 5 });
  });

  it('does not paint on the right button', () => {
    /*
      The bug this fixes predates the camera: the maps checked `onPaint` and
      the token drag but never the button, so right-clicking the battle map
      placed or walked the selected token - on top of opening the browser's
      menu. Right-drag could not be added without fixing it.
    */
    const onPaint = vi.fn();
    render(<Harness onPaint={onPaint} />);
    sizeMap();
    fireEvent.pointerDown(map(), { button: 2, clientX: 70, clientY: 70 });
    expect(onPaint).not.toHaveBeenCalled();
  });

  it('does not paint on the middle button either', () => {
    const onPaint = vi.fn();
    render(<Harness onPaint={onPaint} />);
    sizeMap();
    fireEvent.pointerDown(map(), { button: 1, clientX: 70, clientY: 70 });
    expect(onPaint).not.toHaveBeenCalled();
  });
});

describe('right-drag pans', () => {
  const zoomIn = () => {
    // Panning at the fitted view does nothing by design - there is nowhere to
    // go - so every pan test starts by wheeling in a little.
    fireEvent.wheel(map(), { deltaY: -400, clientX: 336, clientY: 252 });
    sizeMap();
  };

  it('moves the view opposite the pointer, so the ground follows your hand', () => {
    render(<Harness />);
    sizeMap();
    zoomIn();
    const [x0] = viewBox()!.split(' ').map(Number);
    fireEvent.pointerDown(map(), { button: 2, pointerId: 1, clientX: 300, clientY: 200 });
    fireEvent.pointerMove(map(), { pointerId: 1, clientX: 380, clientY: 200 });
    const [x1] = viewBox()!.split(' ').map(Number);
    expect(x1).toBeLessThan(x0);
  });

  it('does not paint while panning, even though the pointer is moving', () => {
    const onPaint = vi.fn();
    render(<Harness onPaint={onPaint} />);
    sizeMap();
    zoomIn();
    fireEvent.pointerDown(map(), { button: 2, pointerId: 1, clientX: 300, clientY: 200 });
    fireEvent.pointerMove(map(), { pointerId: 1, clientX: 380, clientY: 240 });
    fireEvent.pointerUp(map(), { pointerId: 1 });
    expect(onPaint).not.toHaveBeenCalled();
  });

  it('stops when the button comes up, and a later move is not a pan', () => {
    render(<Harness />);
    sizeMap();
    zoomIn();
    fireEvent.pointerDown(map(), { button: 2, pointerId: 1, clientX: 300, clientY: 200 });
    fireEvent.pointerMove(map(), { pointerId: 1, clientX: 380, clientY: 200 });
    fireEvent.pointerUp(map(), { pointerId: 1 });
    const settled = viewBox();
    fireEvent.pointerMove(map(), { pointerId: 1, clientX: 500, clientY: 200 });
    expect(viewBox()).toBe(settled);
  });

  it('suppresses the context menu, or one would open the moment a pan ends', () => {
    render(<Harness />);
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    map().dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
  });
});

describe('fingers on a tablet', () => {
  const finger = (id: number, x: number, y: number) => ({
    pointerId: id,
    pointerType: 'touch',
    button: 0,
    clientX: x,
    clientY: y,
  });

  it('paints with one finger, because that is still the game’s click', () => {
    const onPaint = vi.fn();
    render(<Harness onPaint={onPaint} />);
    sizeMap();
    fireEvent.pointerDown(map(), finger(1, 70, 70));
    expect(onPaint).toHaveBeenCalledWith({ x: 5, y: 5 });
  });

  it('turns into a camera gesture when a second finger lands', () => {
    const onPaint = vi.fn();
    render(<Harness onPaint={onPaint} />);
    sizeMap();
    fireEvent.pointerDown(map(), finger(1, 200, 200));
    onPaint.mockClear();
    fireEvent.pointerDown(map(), finger(2, 300, 200));
    // Spread the fingers: a pinch out, which zooms in.
    fireEvent.pointerMove(map(), finger(1, 150, 200));
    fireEvent.pointerMove(map(), finger(2, 350, 200));
    expect(Number(scale())).toBeGreaterThan(1);
    expect(onPaint).not.toHaveBeenCalled();
  });

  it('pinching together zooms back out', () => {
    render(<Harness />);
    sizeMap();
    fireEvent.wheel(map(), { deltaY: -400, clientX: 336, clientY: 252 });
    sizeMap();
    const before = Number(scale());
    fireEvent.pointerDown(map(), finger(1, 100, 200));
    fireEvent.pointerDown(map(), finger(2, 400, 200));
    fireEvent.pointerMove(map(), finger(1, 220, 200));
    fireEvent.pointerMove(map(), finger(2, 280, 200));
    expect(Number(scale())).toBeLessThan(before);
  });

  it('goes back to painting once a finger lifts', () => {
    const onPaint = vi.fn();
    render(<Harness onPaint={onPaint} />);
    sizeMap();
    fireEvent.pointerDown(map(), finger(1, 200, 200));
    fireEvent.pointerDown(map(), finger(2, 300, 200));
    fireEvent.pointerUp(map(), finger(2, 300, 200));
    fireEvent.pointerUp(map(), finger(1, 200, 200));
    onPaint.mockClear();
    sizeMap();
    fireEvent.pointerDown(map(), finger(1, 70, 70));
    expect(onPaint).toHaveBeenCalledWith({ x: 5, y: 5 });
  });
});

describe('the wheel zooms', () => {
  it('goes in on a scroll up and back out on a scroll down', () => {
    render(<Harness />);
    sizeMap();
    fireEvent.wheel(map(), { deltaY: -300, clientX: 200, clientY: 150 });
    expect(Number(scale())).toBeGreaterThan(1);
  });

  it('is a constant ratio, so in-and-out lands exactly where it started', () => {
    render(<Harness />);
    sizeMap();
    const start = viewBox();
    fireEvent.wheel(map(), { deltaY: -120, clientX: 200, clientY: 150 });
    sizeMap();
    fireEvent.wheel(map(), { deltaY: 120, clientX: 200, clientY: 150 });
    expect(viewBox()).toBe(start);
  });

  it('never zooms out past the whole map', () => {
    render(<Harness />);
    sizeMap();
    for (let i = 0; i < 5; i++) fireEvent.wheel(map(), { deltaY: 200, clientX: 200, clientY: 150 });
    expect(scale()).toBe('1.000');
    expect(viewBox()).toBe(`0 0 ${dungeon.width * 14} ${dungeon.height * 14}`);
  });

  it('reads each notch against the camera the last one left', () => {
    /*
      The listener is attached once and must not close over the render's
      camera, or two notches would both start from scale 1 and the second
      would merely repeat the first instead of compounding.
    */
    render(<Harness />);
    sizeMap();
    fireEvent.wheel(map(), { deltaY: -120, clientX: 200, clientY: 150 });
    const once = Number(scale());
    sizeMap();
    fireEvent.wheel(map(), { deltaY: -120, clientX: 200, clientY: 150 });
    expect(Number(scale())).toBeGreaterThan(once);
  });

  it('prevents the default, so the page neither scrolls nor page-zooms', () => {
    render(<Harness />);
    sizeMap();
    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120 });
    map().dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
  });
});

describe('the drawing and the hit test move together', () => {
  /*
    The one that would have caught §32.1. Ask where a square is drawn, click
    the middle of it, and check the map reports that same square - but now
    zoomed in, where a camera applied to only one of the two would be wrong by
    however far it had moved.
  */
  /*
    `sizeMap` gives the element the *window's* size, so one client pixel is one
    user unit and a click is simply the square's centre less the origin. That
    keeps the arithmetic here short enough to read - the letterbox itself is
    already covered in `letterbox.test.ts`.
  */
  const clickSquare = (at: Square) => {
    const [vx, vy] = viewBox()!.split(' ').map(Number);
    fireEvent.pointerDown(map(), {
      button: 0,
      clientX: (at.x + 0.5) * 14 - vx,
      clientY: (at.y + 0.5) * 14 - vy,
    });
  };

  /** A square well inside the visible window, wherever that window now is. */
  const insideView = (fx: number, fy: number): Square => {
    const [vx, vy, vw, vh] = viewBox()!.split(' ').map(Number);
    return { x: Math.floor((vx + vw * fx) / 14), y: Math.floor((vy + vh * fy) / 14) };
  };

  it('resolves a click to the square under it after a zoom', () => {
    const onPaint = vi.fn();
    render(<Harness onPaint={onPaint} />);
    sizeMap();
    // Zoom in on the middle of the drawing.
    fireEvent.wheel(map(), { deltaY: -400, clientX: 336, clientY: 252 });
    sizeMap();
    const target = insideView(0.4, 0.4);
    clickSquare(target);
    expect(onPaint).toHaveBeenCalledWith(target);
  });

  it('resolves a click to the square under it after a pan', () => {
    const onPaint = vi.fn();
    render(<Harness onPaint={onPaint} />);
    sizeMap();
    fireEvent.wheel(map(), { deltaY: -400, clientX: 336, clientY: 252 });
    sizeMap();
    fireEvent.pointerDown(map(), { button: 2, pointerId: 1, clientX: 300, clientY: 200 });
    fireEvent.pointerMove(map(), { pointerId: 1, clientX: 360, clientY: 260 });
    fireEvent.pointerUp(map(), { pointerId: 1 });
    sizeMap();

    const target = insideView(0.6, 0.6);
    clickSquare(target);
    expect(onPaint).toHaveBeenCalledWith(target);
  });

  it('keeps the drawing the shape of its element, so no letterbox appears', () => {
    render(<Harness />);
    sizeMap();
    const flat = viewBox()!.split(' ').map(Number);
    fireEvent.wheel(map(), { deltaY: -400, clientX: 200, clientY: 150 });
    const zoomed = viewBox()!.split(' ').map(Number);
    expect(zoomed[2] / zoomed[3]).toBeCloseTo(flat[2] / flat[3], 10);
  });
});

describe('without an onCamera the map is exactly as it was', () => {
  it('ignores the wheel and lets the page have it', () => {
    render(<Harness live={false} />);
    sizeMap();
    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -300 });
    map().dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);
    expect(viewBox()).toBe(`0 0 ${dungeon.width * 14} ${dungeon.height * 14}`);
  });

  it('leaves the context menu alone, since there is no right-drag to protect', () => {
    render(<Harness live={false} />);
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    map().dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(false);
  });
});
