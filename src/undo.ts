/**
 * Undo and redo, per character.
 *
 * The Builder writes every edit straight through to the active character, which
 * is what removes the save button - and what makes a wrong click cost you
 * something. This is the way back.
 *
 * Two things are deliberate. The history lives in memory rather than being
 * saved: a deep stack across several characters would multiply the roster on
 * disk many times over, and forty copies of a character is a strange thing to
 * keep forever to serve a session's worth of undo. And edits made in quick
 * succession **coalesce**, so typing a nine-letter name is one step back
 * rather than nine.
 */

/** How many steps back a character remembers. */
export const HISTORY_LIMIT = 40;

/**
 * Edits closer together than this are treated as one. Long enough to swallow
 * typing, short enough that two deliberate changes stay separate.
 */
export const COALESCE_MS = 700;

export interface History<T> {
  past: T[];
  future: T[];
  /** When the most recent entry was pushed, for coalescing. */
  lastPushAt: number;
}

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [], lastPushAt: 0 };
}

/**
 * Record the state being replaced. Call this with the *previous* value, before
 * applying the new one.
 *
 * `now` is a parameter rather than a call to `Date.now()` so the coalescing can
 * be tested without waiting for real time to pass.
 */
export function record<T>(history: History<T>, previous: T, now: number = Date.now()): History<T> {
  // Part of the same burst of typing: keep the older entry, which is the one
  // worth coming back to, and just extend the window.
  const coalesce = history.past.length > 0 && now - history.lastPushAt < COALESCE_MS;
  const past = coalesce ? history.past : [...history.past, previous].slice(-HISTORY_LIMIT);

  // A fresh edit abandons any redo branch, which is what every editor does.
  return { past, future: [], lastPushAt: now };
}

/**
 * Record without coalescing, for surfaces where speed does not mean "one
 * gesture".
 *
 * §84 needed this the moment undo reached the battle. `record`'s window is
 * right for the Builder and for the dungeon editor, where a burst is a name
 * being typed or a brush being dragged - forty writes that are obviously one
 * act. In a fight it is wrong: seating a fighter and then clearing the table
 * are two deliberate presses, and a DM who does them half a second apart
 * means both. Merging them means the first Undo throws away the thing they
 * were trying to get back.
 *
 * What coalescing was actually protecting against there is narrower and is
 * handled exactly: one handler writing twice records the *same* previous
 * value twice, which would cost two presses to walk back one change. So
 * identical consecutive states collapse, and nothing else does.
 */
export function recordStep<T>(history: History<T>, previous: T): History<T> {
  if (history.past.length > 0 && history.past[history.past.length - 1] === previous) {
    // Still a fresh edit, so the redo branch goes - just not a new entry.
    return history.future.length ? { ...history, future: [] } : history;
  }
  return { past: [...history.past, previous].slice(-HISTORY_LIMIT), future: [], lastPushAt: 0 };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}

/** The previous state, and the history to keep. Null when there is nothing. */
export function undo<T>(history: History<T>, current: T): { history: History<T>; value: T } | null {
  if (!history.past.length) return null;
  const past = history.past.slice(0, -1);
  const value = history.past[history.past.length - 1];
  return {
    history: { past, future: [current, ...history.future], lastPushAt: 0 },
    value,
  };
}

export function redo<T>(history: History<T>, current: T): { history: History<T>; value: T } | null {
  if (!history.future.length) return null;
  const [value, ...future] = history.future;
  return {
    history: { past: [...history.past, current], future, lastPushAt: 0 },
    value,
  };
}

/**
 * Histories keyed by character, so switching between two characters does not
 * mix their undo stacks - stepping back on one should never rewrite the other.
 */
export type Histories<T> = Record<string, History<T>>;

export function historyFor<T>(histories: Histories<T>, id: string): History<T> {
  return histories[id] ?? emptyHistory<T>();
}

/** Drop a character's history when the character itself goes. */
export function forget<T>(histories: Histories<T>, id: string): Histories<T> {
  if (!(id in histories)) return histories;
  const next = { ...histories };
  delete next[id];
  return next;
}
