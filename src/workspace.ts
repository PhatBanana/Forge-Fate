/**
 * How wide the rails are, and whether they are showing.
 *
 * The layout is a preference of the browser you are sitting at, not a fact
 * about a character - the same reasoning `theme.ts` gives. So it never lands on
 * the undo stack, never travels in a share link, and switching character does
 * not rearrange the screen.
 *
 * Kept apart from the components on purpose. Clamping a drag, deciding what a
 * collapse means and reading a stored value are all rules rather than
 * rendering, and rules are worth testing without a DOM to hold them.
 */

export interface RailState {
  width: number;
  collapsed: boolean;
}

export interface WorkspaceLayout {
  left: RailState;
  right: RailState;
}

/**
 * A rail narrower than this cannot hold a turn order row - a name, an
 * initiative and a hit point count - and one wider than this is taking width
 * from the thing the rails exist to frame.
 */
export const RAIL_MIN = 200;
export const RAIL_MAX = 480;

/** What a collapsed rail leaves behind: enough to grab and to label. */
export const RAIL_COLLAPSED = 28;

export const DEFAULT_LAYOUT: WorkspaceLayout = {
  left: { width: 260, collapsed: false },
  right: { width: 320, collapsed: false },
};

export const clampRail = (width: number): number =>
  Math.round(Math.min(RAIL_MAX, Math.max(RAIL_MIN, width)));

/** What the grid should give a rail right now. */
export const railWidth = (rail: RailState): number =>
  rail.collapsed ? RAIL_COLLAPSED : clampRail(rail.width);

/**
 * Resize from a drag.
 *
 * The right rail grows as the pointer moves *left*, which is why the direction
 * is a parameter rather than something each caller works out: getting it
 * backwards makes a divider that shoves the panel away from the cursor, and it
 * is the kind of thing that reads fine in code and is obviously wrong in a
 * browser.
 *
 * A drag also uncollapses. Grabbing the edge of a closed rail and pulling means
 * "open this", and refusing because it is collapsed would be the app arguing.
 */
export function resizeRail(rail: RailState, delta: number, side: 'left' | 'right'): RailState {
  const from = rail.collapsed ? RAIL_MIN : rail.width;
  const width = clampRail(from + (side === 'left' ? delta : -delta));
  return { width, collapsed: false };
}

export function toggleRail(rail: RailState): RailState {
  return { ...rail, collapsed: !rail.collapsed };
}

// ------------------------------------------------------------------ storage

const KEY = (id: string) => `dnd-forge:workspace:${id}:v1`;

const validRail = (value: unknown): RailState | null => {
  if (!value || typeof value !== 'object') return null;
  const rail = value as Partial<RailState>;
  if (typeof rail.width !== 'number' || !Number.isFinite(rail.width)) return null;
  return { width: clampRail(rail.width), collapsed: Boolean(rail.collapsed) };
};

/**
 * A stored layout, or the default.
 *
 * Every field is checked rather than trusted. A width that arrives as a string,
 * a NaN, or a number from a build where the limits were different would
 * otherwise reach a CSS grid, and a grid handed `NaNpx` silently collapses the
 * column - which looks like the rail failing to render rather than like bad
 * stored state.
 */
export function loadLayout(id: string): WorkspaceLayout {
  try {
    const raw = localStorage.getItem(KEY(id));
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<WorkspaceLayout>;
    return {
      left: validRail(parsed?.left) ?? DEFAULT_LAYOUT.left,
      right: validRail(parsed?.right) ?? DEFAULT_LAYOUT.right,
    };
  } catch {
    // Private browsing, disabled storage, or something that is not JSON.
    return DEFAULT_LAYOUT;
  }
}

export function saveLayout(id: string, layout: WorkspaceLayout): void {
  try {
    localStorage.setItem(KEY(id), JSON.stringify(layout));
  } catch {
    // Not being able to remember the layout is not a reason to refuse to
    // change it.
  }
}
