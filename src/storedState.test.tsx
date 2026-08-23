// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { aString, useStored } from './storedState';
import { aRelay } from './sync';
import { read, write } from './persist';

/*
  §124. A value that survives a reload, and the guard on the way in.

  The three of these in `App.tsx` were three hand-written copies of the same
  read/write pair, and only two of the three had a hydrate - which is exactly
  the failure a shared one prevents, because here there is no way to build a
  stored value without saying what a valid one looks like.
*/

const KEY = 'dnd-forge:test:v1';

beforeEach(() => localStorage.clear());

describe('useStored', () => {
  it('starts from nothing when the store is empty', () => {
    const { result } = renderHook(() => useStored(KEY, aString));
    expect(result.current[0]).toBeNull();
  });

  it('reads what was written, on the next mount', () => {
    const first = renderHook(() => useStored(KEY, aString));
    act(() => first.result.current[1]('c3'));
    expect(read(KEY)).toBe('"c3"');

    const second = renderHook(() => useStored(KEY, aString));
    expect(second.result.current[0]).toBe('c3');
  });

  it('forgets the key when the value goes back to null', () => {
    const { result } = renderHook(() => useStored(KEY, aString));
    act(() => result.current[1]('c3'));
    act(() => result.current[1](null));
    expect(read(KEY)).toBeNull();
  });

  it('loads a poisoned value as nothing rather than as a crash', () => {
    // The shape is wrong for `aRelay`, which is the whole point: this store
    // is written from what a host broadcast, and its contents get handed to
    // `new WebSocket` at boot.
    write(KEY, JSON.stringify({ url: 42, room: ['not', 'a', 'code'] }));
    const { result } = renderHook(() => useStored(KEY, aRelay));
    expect(result.current[0]).toBeNull();
  });

  it('loads unparseable contents as nothing', () => {
    write(KEY, '{not json at all');
    const { result } = renderHook(() => useStored(KEY, aRelay));
    expect(result.current[0]).toBeNull();
  });

  it('keeps a seat written before this module existed', () => {
    // The seat id used to be stored with a bare `setItem(key, seatId)`, so a
    // device that has been sitting at a table has `c3` under that key rather
    // than `"c3"`. Losing it would put the player back on the picker.
    write(KEY, 'c3');
    const { result } = renderHook(() => useStored(KEY, aString));
    expect(result.current[0]).toBe('c3');
  });

  it('lets a link beat what was saved', () => {
    write(KEY, JSON.stringify('saved'));
    const { result } = renderHook(() => useStored(KEY, aString, () => 'from-the-link'));
    expect(result.current[0]).toBe('from-the-link');
  });

  it('falls back to the store when the link carries nothing', () => {
    write(KEY, JSON.stringify('saved'));
    const { result } = renderHook(() => useStored(KEY, aString, () => null));
    expect(result.current[0]).toBe('saved');
  });

  it('honours an empty string from a link - a bare #seat means the picker', () => {
    // `''` is a seat claim with no character chosen yet, which is not the
    // same as no seat: it has to survive, and `aString` never sees it.
    const { result } = renderHook(() => useStored(KEY, aString, () => ''));
    expect(result.current[0]).toBe('');
  });
});

describe('aRelay', () => {
  it('takes a well-shaped config and nothing else', () => {
    expect(aRelay({ url: 'wss://x', room: 'ABC' })).toEqual({ url: 'wss://x', room: 'ABC' });
    expect(aRelay({ url: 'wss://x' })).toBeNull();
    expect(aRelay({ room: 'ABC' })).toBeNull();
    expect(aRelay(null)).toBeNull();
    expect(aRelay('wss://x')).toBeNull();
    expect(aRelay(undefined)).toBeNull();
  });

  it('carries only the two fields, however much it was handed', () => {
    const extra = { url: 'wss://x', room: 'ABC', evil: () => 'boom' };
    expect(aRelay(extra)).toEqual({ url: 'wss://x', room: 'ABC' });
  });
});
