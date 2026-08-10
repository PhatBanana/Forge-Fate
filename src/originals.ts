import { read, write } from './persist';
import { isOriginal } from './data/sources';
import type { Source } from './data/sources';

/**
 * Whether the app's own content is on the table.
 *
 * Section 9 argued this out and then parked it. The argument, in short: you
 * cannot add the missing published content - a table that wants the Hexblade
 * wants *the Hexblade*, and a reworded copy is both useless to them and not
 * ours to ship. What you can add is **different** content covering the same
 * ground under its own name. Game mechanics are not copyrightable; the prose,
 * the names and the particular arrangement are.
 *
 * So the app may write its own, and this is the switch that reveals it.
 *
 * ## Why it is off by default, and stays off
 *
 * Because the app's whole claim is that it plays the rules as written, and a
 * class nobody at the table has heard of, appearing unasked in the class list,
 * would undermine every other row in it. On is a choice somebody made. Off is
 * what the books say.
 *
 * ## Offered versus resolved - the distinction that makes this safe
 *
 * The switch filters what is **offered**: the class list, the subclass picker,
 * the feat catalogue. It must never filter what is **resolved**:
 * `CLASSES_BY_ID`, `FEATS_BY_ID` and friends answer for any id, always.
 *
 * That split is the whole safety property. A character built with originals on
 * and then loaded with them off keeps working - their sheet computes, their
 * DPR is right, their features render - they simply cannot pick another one
 * until the switch goes back on. The alternative, filtering the lookups too,
 * turns a saved character into a blank the moment somebody flips a setting,
 * which is the kind of data loss a tool does not get to do twice.
 */

const KEY = 'dnd-forge:originals';

let shown = false;

/** Whether Forge originals are currently offered. Synchronous by design. */
export function originalsShown(): boolean {
  return shown;
}

/**
 * Load the switch from storage. Called once at boot, beside the other stores.
 *
 * Synchronous read through `persist`'s cache rather than a promise, because
 * the data accessors that consult this are pure functions called during
 * render - `classesFor(ruleset)` cannot await anything, and threading a flag
 * through all six of them would mean six chances to forget one.
 */
export function loadOriginals(): boolean {
  // `persist` deals in strings; the switch is one character either way.
  shown = read(KEY) === 'true';
  return shown;
}

export function setOriginalsShown(next: boolean): void {
  shown = next;
  write(KEY, String(next));
}

/**
 * Set the switch without touching storage, for tests.
 *
 * Returns a restore function so a test can put it back without knowing what it
 * was - the accessors are module-level state, and a test that leaves this on
 * would make every later file's catalogue silently longer.
 */
export function withOriginalsForTests(next: boolean): () => void {
  const before = shown;
  shown = next;
  return () => {
    shown = before;
  };
}

/**
 * Drop the rows the switch is currently hiding.
 *
 * Every catalogue accessor ends with this, which is the point: one function
 * means adding a seventh catalogue is one call rather than a new place to
 * forget. `forge.test.ts` walks all of them with the switch off and fails on
 * any Forge row that gets through.
 */
export function visible<T extends { source: Source }>(rows: T[]): T[] {
  return shown ? rows : rows.filter((row) => !isOriginal(row.source));
}
