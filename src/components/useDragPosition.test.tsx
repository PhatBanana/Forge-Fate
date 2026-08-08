// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useDragPosition } from './useDragPosition';

/**
 * The drag, on its own.
 *
 * Worth testing here rather than only through the battle screen, because the
 * bug it was extracted with was invisible from above: the listeners were
 * attached inside an effect guarded on a ref, and pressing a title bar changes
 * a ref without causing a render, so nothing was ever listening. The panel
 * simply did not move - and the one panel using it appeared under 900px, where
 * nothing was measuring.
 */

function Panel() {
  const drag = useDragPosition();
  return (
    <div data-testid="panel" style={{ transform: `translate(${drag.at.x}px, ${drag.at.y}px)` }}>
      <div data-testid="bar" {...drag.handle}>
        bar
      </div>
      <span data-testid="state">{drag.moved ? 'loose' : 'docked'}</span>
      <button type="button" onClick={drag.reset}>
        dock
      </button>
    </div>
  );
}

const panel = () => screen.getByTestId('panel');
const bar = () => screen.getByTestId('bar');
const state = () => screen.getByTestId('state').textContent;

describe('dragging a panel by its bar', () => {
  it('starts docked, at no offset at all', () => {
    render(<Panel />);
    expect(panel().style.transform).toBe('translate(0px, 0px)');
    expect(state()).toBe('docked');
  });

  it('follows the pointer once the bar is pressed', () => {
    render(<Panel />);
    fireEvent.pointerDown(bar(), { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 130, clientY: 80 });
    expect(panel().style.transform).toBe('translate(30px, -20px)');
    expect(state()).toBe('loose');
  });

  it('measures from where the pointer went down, not from the panel', () => {
    // Grabbing the bar at its right-hand end must not teleport the panel so
    // that its origin jumps under the cursor.
    render(<Panel />);
    fireEvent.pointerDown(bar(), { clientX: 400, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: 410, clientY: 300 });
    expect(panel().style.transform).toBe('translate(10px, 0px)');
  });

  it('picks up where it left off on the next drag', () => {
    render(<Panel />);
    fireEvent.pointerDown(bar(), { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 50, clientY: 50 });
    fireEvent.pointerUp(window);

    fireEvent.pointerDown(bar(), { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 10, clientY: 10 });
    expect(panel().style.transform).toBe('translate(60px, 60px)');
  });

  it('stops following once the pointer is up', () => {
    render(<Panel />);
    fireEvent.pointerDown(bar(), { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 20, clientY: 20 });
    fireEvent.pointerUp(window);
    fireEvent.pointerMove(window, { clientX: 900, clientY: 900 });
    expect(panel().style.transform).toBe('translate(20px, 20px)');
  });

  it('is still docked after a press that went nowhere', () => {
    render(<Panel />);
    fireEvent.pointerDown(bar(), { clientX: 40, clientY: 40 });
    fireEvent.pointerUp(window);
    expect(state()).toBe('docked');
  });

  it('goes back to its edge when told to', () => {
    render(<Panel />);
    fireEvent.pointerDown(bar(), { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 200, clientY: 200 });
    fireEvent.pointerUp(window);
    fireEvent.click(screen.getByRole('button', { name: 'dock' }));
    expect(panel().style.transform).toBe('translate(0px, 0px)');
    expect(state()).toBe('docked');
  });

  it('gives up the drag if the pointer is cancelled out from under it', () => {
    // A touch that becomes a scroll gesture fires pointercancel and no
    // pointerup; without it the panel would stay glued to the finger.
    render(<Panel />);
    fireEvent.pointerDown(bar(), { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 15, clientY: 0 });
    fireEvent.pointerCancel(window);
    fireEvent.pointerMove(window, { clientX: 400, clientY: 0 });
    expect(panel().style.transform).toBe('translate(15px, 0px)');
  });
});
