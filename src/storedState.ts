import { useEffect, useState } from 'react';
import { read, remove, write } from './persist';

/**
 * §124: a value that survives a reload, hydrated on the way in.
 *
 * Three of these grew up in `App.tsx`, each written out longhand - a
 * `useState` initialiser with a try/catch around a read, and an effect with a
 * try/catch around the matching write, keyed by a string literal that appears
 * in both halves and nowhere else. Same shape, three times, and the halves
 * only agree because somebody kept them in step.
 *
 * Two things were wrong with that beyond the repetition.
 *
 * **The guard was optional.** §118 hardened two of the three - the table
 * roster is written from what a host broadcast over the wire, and the relay
 * config is handed to `new WebSocket` at boot, so a poisoned copy of either
 * has to load as nothing rather than as a crash or a connection. The third
 * was not hardened, because nothing made it obvious there was a third. Here
 * `hydrate` is not a parameter you may pass; it is the only way in.
 *
 * **They bypassed the store.** Every other saved thing in this app goes
 * through `persist.ts`, which exists because `localStorage` is one five
 * megabyte budget for the whole origin and a roster with portraits in it does
 * not fit twice. These three read and wrote `localStorage` directly, so the
 * table roster - a whole roster, portraits and all - was competing for the
 * budget that module was written to escape. They go through the store now,
 * and a returning device finds its seat either way: the keys already carry
 * the `dnd-forge:` prefix the one-time migration scans for.
 */
export function useStored<T>(
  key: string,
  /**
   * Whatever was parsed out of the store, turned into a value - or null if it
   * is not one. Called on data this app did not necessarily write, so it must
   * answer for anything, including `undefined` and a hostile shape.
   */
  hydrate: (parsed: unknown) => T | null,
  /**
   * Consulted before the store, for the values a link can carry: a seat
   * fragment and a room code both beat what was last saved, because the
   * person following the link means the link.
   */
  seed?: () => T | null,
): [T | null, (next: T | null) => void] {
  const [value, setValue] = useState<T | null>(() => {
    const fromSeed = seed?.();
    if (fromSeed !== null && fromSeed !== undefined) return fromSeed;
    try {
      const raw = read(key);
      return raw === null ? null : hydrate(parsed(raw));
    } catch {
      // Corrupt, or a browser that refuses storage. Start with nothing
      // rather than refusing to boot.
      return null;
    }
  });

  useEffect(() => {
    try {
      if (value === null) remove(key);
      else write(key, JSON.stringify(value));
    } catch {
      // Private browsing, or a full quota. The value simply is not remembered.
    }
  }, [key, value]);

  return [value, setValue];
}

/**
 * What is in the store, as a value.
 *
 * JSON, except when it is not: the seat id was written with a bare
 * `setItem(key, seatId)` before this module existed, so a device that has
 * been sitting at a table has a raw `c3` under that key rather than `"c3"`.
 * Falling back to the string is what lets it keep its chair across this
 * change - and costs nothing afterwards, since everything written from here
 * is JSON and parses on the first attempt.
 */
function parsed(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * The hydrate for a value that is already exactly what it says it is.
 *
 * A seat id is a string and there is nothing to check beyond that, so this
 * says so out loud rather than letting the call site pass a lambda that looks
 * like it might be doing more.
 */
export const aString = (parsed: unknown): string | null =>
  typeof parsed === 'string' && parsed.length > 0 ? parsed : null;
