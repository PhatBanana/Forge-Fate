// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYOUT,
  RAIL_COLLAPSED,
  RAIL_MAX,
  RAIL_MIN,
  clampRail,
  loadLayout,
  railWidth,
  resizeRail,
  saveLayout,
  toggleRail,
} from './workspace';

/**
 * The rails.
 *
 * All rules, no rendering: how far a drag may go, what a collapse means, and
 * what to do with a stored value that is no longer sensible. Dragging itself is
 * a pointer gesture and is checked in a browser; everything it decides is here.
 */

describe('how wide a rail may be', () => {
  it('refuses to go narrower than a turn order row', () => {
    expect(clampRail(10)).toBe(RAIL_MIN);
    expect(clampRail(-500)).toBe(RAIL_MIN);
  });

  it('refuses to take the screen from the thing it frames', () => {
    expect(clampRail(9000)).toBe(RAIL_MAX);
  });

  it('leaves a sensible width alone', () => {
    expect(clampRail(300)).toBe(300);
  });

  it('reports a collapsed rail as the strip it leaves behind', () => {
    expect(railWidth({ width: 320, collapsed: true })).toBe(RAIL_COLLAPSED);
    expect(railWidth({ width: 320, collapsed: false })).toBe(320);
  });
});

describe('dragging a divider', () => {
  it('grows the left rail as the pointer moves right', () => {
    expect(resizeRail({ width: 260, collapsed: false }, 40, 'left').width).toBe(300);
  });

  it('grows the right rail as the pointer moves left', () => {
    /*
      The direction is a parameter rather than something each caller works out,
      because getting it backwards makes a divider that shoves the panel away
      from the cursor - which reads fine in code and is obviously wrong the
      moment you touch it.
    */
    expect(resizeRail({ width: 320, collapsed: false }, -40, 'right').width).toBe(360);
    expect(resizeRail({ width: 320, collapsed: false }, 40, 'right').width).toBe(280);
  });

  it('stops at the limits rather than running away', () => {
    expect(resizeRail({ width: 260, collapsed: false }, 9000, 'left').width).toBe(RAIL_MAX);
    expect(resizeRail({ width: 260, collapsed: false }, -9000, 'left').width).toBe(RAIL_MIN);
  });

  it('opens a collapsed rail rather than arguing with the drag', () => {
    // Grabbing the edge of a closed rail and pulling means "open this".
    const opened = resizeRail({ width: 400, collapsed: true }, 30, 'left');
    expect(opened.collapsed).toBe(false);
    expect(opened.width).toBe(RAIL_MIN + 30);
  });
});

describe('collapsing', () => {
  it('remembers the width it had', () => {
    // So reopening returns the rail you set up, not the default.
    const closed = toggleRail({ width: 380, collapsed: false });
    expect(closed).toEqual({ width: 380, collapsed: true });
    expect(toggleRail(closed)).toEqual({ width: 380, collapsed: false });
  });
});

describe('remembering a layout', () => {
  beforeEach(() => localStorage.clear());

  it('starts from the default with nothing stored', () => {
    expect(loadLayout('table')).toEqual(DEFAULT_LAYOUT);
  });

  it('comes back as it was left', () => {
    const layout = { left: { width: 300, collapsed: true }, right: { width: 420, collapsed: false } };
    saveLayout('table', layout);
    expect(loadLayout('table')).toEqual(layout);
  });

  it('keeps one workspace out of another', () => {
    saveLayout('table', { left: { width: 300, collapsed: false }, right: { width: 300, collapsed: false } });
    expect(loadLayout('builder')).toEqual(DEFAULT_LAYOUT);
  });

  it('refuses a stored width that is not a number', () => {
    /*
      A grid handed `NaNpx` silently collapses the column, which looks like the
      rail failing to render rather than like bad stored state - so every field
      is checked rather than trusted.
    */
    localStorage.setItem(
      'dnd-forge:workspace:table:v1',
      JSON.stringify({ left: { width: 'wide' }, right: { width: null } }),
    );
    expect(loadLayout('table')).toEqual(DEFAULT_LAYOUT);
  });

  it('pulls a stored width back inside the limits', () => {
    // A value from a build where the limits were different is not corrupt, it
    // is just out of date.
    localStorage.setItem(
      'dnd-forge:workspace:table:v1',
      JSON.stringify({ left: { width: 5000, collapsed: false }, right: { width: 1, collapsed: false } }),
    );
    expect(loadLayout('table')).toEqual({
      left: { width: RAIL_MAX, collapsed: false },
      right: { width: RAIL_MIN, collapsed: false },
    });
  });

  it('survives something that is not JSON at all', () => {
    localStorage.setItem('dnd-forge:workspace:table:v1', 'not json {');
    expect(loadLayout('table')).toEqual(DEFAULT_LAYOUT);
  });
});
