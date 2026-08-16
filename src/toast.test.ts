import { describe, expect, it } from 'vitest';
import { TOAST_LIMIT, TOAST_MS, dismiss, expire, hold, push, release } from './toast';
import type { Toast } from './toast';

/**
 * §83. The toast store, driven by a clock the test owns - which is the whole
 * reason `now` is a parameter rather than a call to `Date.now()` inside.
 */

const at = (toasts: Toast[], i: number) => toasts[i].text;

describe('saying something', () => {
  it('puts the newest first, because that is the one worth reading', () => {
    let toasts = push([], 'first', undefined, 0);
    toasts = push(toasts, 'second', undefined, 1);
    expect(toasts.map((t) => t.text)).toEqual(['second', 'first']);
  });

  it('caps the stack and drops the oldest, not the newest', () => {
    let toasts: Toast[] = [];
    for (let i = 0; i < TOAST_LIMIT + 2; i++) toasts = push(toasts, `t${i}`, undefined, i);
    expect(toasts).toHaveLength(TOAST_LIMIT);
    expect(at(toasts, 0)).toBe(`t${TOAST_LIMIT + 1}`);
    // The two oldest are gone.
    expect(toasts.map((t) => t.text)).not.toContain('t0');
    expect(toasts.map((t) => t.text)).not.toContain('t1');
  });

  it('gives every toast its own id, even two in the same millisecond', () => {
    let toasts = push([], 'a', undefined, 7);
    toasts = push(toasts, 'b', undefined, 7);
    expect(new Set(toasts.map((t) => t.id)).size).toBe(2);
  });

  it('carries at most one way back', () => {
    const onAct = () => {};
    const toasts = push([], 'Undone: cleared the fight', { label: 'Redo', onAct }, 0);
    expect(toasts[0].action?.label).toBe('Redo');
    expect(toasts[0].action?.onAct).toBe(onAct);
  });
});

describe('going away again', () => {
  it('dismisses by id and leaves the rest', () => {
    let toasts = push(push([], 'a', undefined, 0), 'b', undefined, 0);
    toasts = dismiss(toasts, toasts[0].id);
    expect(toasts.map((t) => t.text)).toEqual(['a']);
  });

  it('expires on its own once its time is up', () => {
    const toasts = push([], 'a', undefined, 0);
    expect(expire(toasts, TOAST_MS - 1)).toHaveLength(1);
    expect(expire(toasts, TOAST_MS)).toHaveLength(0);
  });

  it('returns the same array when nothing expired', () => {
    // This runs on a timer: a fresh array every tick would re-render for ever.
    const toasts = push([], 'a', undefined, 0);
    expect(expire(toasts, 10)).toBe(toasts);
    expect(expire([], 10_000)).toEqual([]);
  });

  it('will not expire one that is being held', () => {
    // The oldest bug in every toast layer: it vanishes out from under the
    // click that was about to land on it.
    let toasts = push([], 'Undone', { label: 'Redo', onAct: () => {} }, 0);
    toasts = hold(toasts, toasts[0].id, true);
    expect(expire(toasts, TOAST_MS * 10)).toHaveLength(1);
  });

  it('restarts the clock when a held toast is released', () => {
    let toasts = push([], 'a', undefined, 0);
    toasts = hold(toasts, toasts[0].id, true);
    // Released long after it would have expired: it gets its full life again
    // rather than disappearing the instant the pointer leaves.
    toasts = release(toasts, toasts[0].id, 10_000);
    expect(expire(toasts, 10_000 + TOAST_MS - 1)).toHaveLength(1);
    expect(expire(toasts, 10_000 + TOAST_MS)).toHaveLength(0);
  });

  it('holds and releases only the one named', () => {
    let toasts = push(push([], 'a', undefined, 0), 'b', undefined, 0);
    const [newest, oldest] = toasts;
    toasts = hold(toasts, newest.id, true);
    expect(toasts.find((t) => t.id === newest.id)?.held).toBe(true);
    expect(toasts.find((t) => t.id === oldest.id)?.held).toBeUndefined();
    // Only the unheld one goes.
    expect(expire(toasts, TOAST_MS).map((t) => t.id)).toEqual([newest.id]);
  });
});
