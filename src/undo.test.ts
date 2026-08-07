import { describe, expect, it } from 'vitest';
import {
  COALESCE_MS,
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  emptyHistory,
  forget,
  historyFor,
  record,
  redo,
  undo,
} from './undo';
import type { History } from './undo';

/** A stand-in for a build; the history does not care what T is. */
type State = string;

/** Apply a sequence of edits, spacing them far enough apart not to coalesce. */
function editedThrough(...states: State[]): { history: History<State>; current: State } {
  let history = emptyHistory<State>();
  let current = states[0];
  let clock = 0;
  for (const next of states.slice(1)) {
    clock += COALESCE_MS * 2;
    history = record(history, current, clock);
    current = next;
  }
  return { history, current };
}

describe('undo', () => {
  it('has nothing to undo before anything happens', () => {
    const history = emptyHistory<State>();
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
    expect(undo(history, 'a')).toBeNull();
    expect(redo(history, 'a')).toBeNull();
  });

  it('steps back through edits one at a time', () => {
    let { history, current } = editedThrough('a', 'b', 'c');

    let step = undo(history, current)!;
    expect(step.value).toBe('b');
    ({ history } = step);
    current = step.value;

    step = undo(history, current)!;
    expect(step.value).toBe('a');
    ({ history } = step);
    current = step.value;

    expect(undo(history, current)).toBeNull();
  });

  it('redoes what it just undid', () => {
    const { history, current } = editedThrough('a', 'b');

    const back = undo(history, current)!;
    expect(back.value).toBe('a');
    expect(canRedo(back.history)).toBe(true);

    const forward = redo(back.history, back.value)!;
    expect(forward.value).toBe('b');
    expect(canRedo(forward.history)).toBe(false);
    expect(canUndo(forward.history)).toBe(true);
  });

  it('abandons the redo branch once you edit again, as every editor does', () => {
    const { history, current } = editedThrough('a', 'b', 'c');
    const back = undo(history, current)!;
    expect(canRedo(back.history)).toBe(true);

    // A new edit from here makes the old 'c' unreachable.
    const after = record(back.history, back.value, 99999);
    expect(canRedo(after)).toBe(false);
  });
});

describe('coalescing', () => {
  /**
   * Typing a name fires a change per keystroke. Without this, undoing a rename
   * would be nine presses, which is not an undo anybody wants.
   */
  it('treats a burst of edits as one step', () => {
    let history = emptyHistory<State>();
    history = record(history, 'T', 1000);
    history = record(history, 'Th', 1100);
    history = record(history, 'Thi', 1200);
    history = record(history, 'This', 1300);

    expect(history.past).toEqual(['T']);
    const step = undo(history, 'Thistle')!;
    expect(step.value).toBe('T');
  });

  it('keeps deliberate edits apart', () => {
    let history = emptyHistory<State>();
    history = record(history, 'a', 1000);
    history = record(history, 'b', 1000 + COALESCE_MS + 1);
    expect(history.past).toEqual(['a', 'b']);
  });

  it('never coalesces the very first edit away', () => {
    const history = record(emptyHistory<State>(), 'a', 5);
    expect(history.past).toEqual(['a']);
  });
});

describe('the limit', () => {
  it('keeps the most recent steps and drops the oldest', () => {
    let history = emptyHistory<State>();
    let clock = 0;
    for (let i = 0; i < HISTORY_LIMIT + 15; i++) {
      clock += COALESCE_MS * 2;
      history = record(history, `state-${i}`, clock);
    }
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    // The oldest are gone; the newest are kept.
    expect(history.past[0]).toBe(`state-${15}`);
    expect(history.past.at(-1)).toBe(`state-${HISTORY_LIMIT + 14}`);
  });
});

describe('histories per character', () => {
  it('hands back an empty history for a character with no edits', () => {
    expect(historyFor({}, 'nobody').past).toEqual([]);
  });

  it('keeps two characters from sharing a stack', () => {
    const a = record(emptyHistory<State>(), 'a1', 1000);
    const b = record(emptyHistory<State>(), 'b1', 1000);
    const histories = { a, b };

    expect(historyFor(histories, 'a').past).toEqual(['a1']);
    expect(historyFor(histories, 'b').past).toEqual(['b1']);
  });

  it('forgets a deleted character rather than leaking its history', () => {
    const histories = { a: record(emptyHistory<State>(), 'a1', 1) };
    expect(forget(histories, 'a')).toEqual({});
    // And leaves the object alone when there is nothing to forget.
    expect(forget(histories, 'missing')).toBe(histories);
  });
});
