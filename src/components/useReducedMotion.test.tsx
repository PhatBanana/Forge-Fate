// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReducedMotion } from './useReducedMotion';

/** §79: the preference read live, and absent APIs answered with stillness off. */
describe('useReducedMotion', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stubMatchMedia = (matches: boolean) => {
    const listeners: ((e: unknown) => void)[] = [];
    const query = {
      matches,
      addEventListener: (_: string, fn: (e: unknown) => void) => listeners.push(fn),
      removeEventListener: (_: string, fn: (e: unknown) => void) => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      },
    };
    vi.stubGlobal('matchMedia', () => query);
    return {
      flip(next: boolean) {
        query.matches = next;
        for (const fn of [...listeners]) fn({ matches: next });
      },
    };
  };

  it('reads the preference at mount', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it('follows a change without a reload', () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    act(() => media.flip(true));
    expect(result.current).toBe(true);
  });

  it('answers false where matchMedia does not exist', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });
});
