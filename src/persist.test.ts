import { beforeEach, describe, expect, it } from 'vitest';
import {
  KEY_PREFIX,
  flush,
  hydrate,
  memoryAdapter,
  read,
  remove,
  resetForTests,
  webStorageAdapter,
  write,
} from './persist';
import type { PersistAdapter } from './persist';

/**
 * The storage layer, checked at the seam that matters: a store that cannot
 * answer synchronously must still let `read` answer synchronously, because a
 * hundred `useState(loadRoster)` call sites depend on it.
 *
 * The IndexedDB adapter itself is exercised in a browser rather than here -
 * jsdom has no IndexedDB - so what these pin is the cache, the coalescing,
 * the migration and the fallbacks, which is where the behaviour lives.
 */

/** A store with no synchronous read, standing in for IndexedDB. */
function asyncAdapter(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  const writes: string[] = [];
  const adapter: PersistAdapter = {
    async readAll() {
      return Object.fromEntries(map);
    },
    async write(key, value) {
      writes.push(key);
      map.set(key, value);
    },
    async remove(key) {
      writes.push(key);
      map.delete(key);
    },
  };
  return { adapter, map, writes };
}

const fakeStorage = (): Storage => {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as Storage;
};

beforeEach(() => resetForTests());

describe('the synchronous surface over an asynchronous store', () => {
  it('answers reads from the cache the moment hydration is done', async () => {
    const { adapter } = asyncAdapter({ [`${KEY_PREFIX}roster:v1`]: '{"entries":[]}' });
    await hydrate(adapter);
    // No await, no promise: this is what every store call site does.
    expect(read(`${KEY_PREFIX}roster:v1`)).toBe('{"entries":[]}');
    expect(read(`${KEY_PREFIX}missing`)).toBeNull();
  });

  it('reads back a write immediately, long before it reaches the store', async () => {
    const { adapter, map } = asyncAdapter();
    await hydrate(adapter);
    write(`${KEY_PREFIX}theme:v1`, 'dark');

    // Visible at once...
    expect(read(`${KEY_PREFIX}theme:v1`)).toBe('dark');
    // ...and not yet carried across.
    expect(map.has(`${KEY_PREFIX}theme:v1`)).toBe(false);
    await flush();
    expect(map.get(`${KEY_PREFIX}theme:v1`)).toBe('dark');
  });

  it('coalesces a burst into one write per key', async () => {
    const { adapter, writes } = asyncAdapter();
    await hydrate(adapter);
    // A save-per-render burst, which is exactly what a useEffect store does.
    for (let i = 0; i < 30; i++) write(`${KEY_PREFIX}roster:v1`, `v${i}`);
    await flush();
    expect(writes).toEqual([`${KEY_PREFIX}roster:v1`]);
    expect(read(`${KEY_PREFIX}roster:v1`)).toBe('v29');
  });

  it('removes from the cache and the store', async () => {
    const { adapter, map } = asyncAdapter({ [`${KEY_PREFIX}theme:v1`]: 'dark' });
    await hydrate(adapter);
    remove(`${KEY_PREFIX}theme:v1`);
    expect(read(`${KEY_PREFIX}theme:v1`)).toBeNull();
    await flush();
    expect(map.has(`${KEY_PREFIX}theme:v1`)).toBe(false);
  });

  it('keeps working when the store refuses every write', async () => {
    const refuses: PersistAdapter = {
      async readAll() {
        return {};
      },
      async write() {
        throw new Error('quota');
      },
      async remove() {
        throw new Error('quota');
      },
    };
    await hydrate(refuses);
    write(`${KEY_PREFIX}roster:v1`, 'something');
    await expect(flush()).resolves.toBeUndefined();
    // The session carries on from the cache, which is the old localStorage
    // try/catch behaviour: a full quota never took the app down.
    expect(read(`${KEY_PREFIX}roster:v1`)).toBe('something');
  });
});

describe('a store that can answer synchronously', () => {
  it('is read straight through, so another writer is seen at once', async () => {
    const storage = fakeStorage();
    await hydrate(webStorageAdapter(storage));
    // Written by something that is not this module - another tab, or a test
    // seeding a fixture after boot. The cache never saw it; the read must.
    storage.setItem(`${KEY_PREFIX}roster:v1`, 'fresh');
    expect(read(`${KEY_PREFIX}roster:v1`)).toBe('fresh');
    storage.removeItem(`${KEY_PREFIX}roster:v1`);
    expect(read(`${KEY_PREFIX}roster:v1`)).toBeNull();
  });
});

describe('the carry across from localStorage', () => {
  it('copies what the old store held, and leaves it there', async () => {
    const legacy = fakeStorage();
    legacy.setItem(`${KEY_PREFIX}roster:v1`, '{"entries":[1]}');
    legacy.setItem(`${KEY_PREFIX}bestiary:v1`, '{"monsters":[]}');
    legacy.setItem('unrelated-app-key', 'not ours');
    globalThis.localStorage = legacy;

    const { adapter, map } = asyncAdapter();
    await hydrate(adapter);

    expect(read(`${KEY_PREFIX}roster:v1`)).toBe('{"entries":[1]}');
    expect(map.get(`${KEY_PREFIX}bestiary:v1`)).toBe('{"monsters":[]}');
    // Somebody else's key is somebody else's.
    expect(map.has('unrelated-app-key')).toBe(false);
    // The old store is untouched, so a version rolled back finds everything.
    expect(legacy.getItem(`${KEY_PREFIX}roster:v1`)).toBe('{"entries":[1]}');
  });

  it('never overwrites what the new store already has', async () => {
    const legacy = fakeStorage();
    legacy.setItem(`${KEY_PREFIX}roster:v1`, 'old');
    globalThis.localStorage = legacy;

    const { adapter } = asyncAdapter({ [`${KEY_PREFIX}roster:v1`]: 'new' });
    await hydrate(adapter);
    expect(read(`${KEY_PREFIX}roster:v1`)).toBe('new');
  });

  it('runs once, not on every boot', async () => {
    const legacy = fakeStorage();
    legacy.setItem(`${KEY_PREFIX}roster:v1`, 'first');
    globalThis.localStorage = legacy;

    const { adapter, map } = asyncAdapter();
    await hydrate(adapter);

    // The fight moves on; the old store still holds the stale copy.
    write(`${KEY_PREFIX}roster:v1`, 'second');
    await flush();

    // Boot again against the same store: the marker stops the stale copy
    // from being carried back over the top of the newer one.
    await hydrate(adapter);
    expect(read(`${KEY_PREFIX}roster:v1`)).toBe('second');
    expect(map.get(`${KEY_PREFIX}roster:v1`)).toBe('second');
  });
});

describe('when there is no store at all', () => {
  it('falls back to memory rather than refusing to start', async () => {
    await hydrate(memoryAdapter());
    write(`${KEY_PREFIX}roster:v1`, 'in memory');
    expect(read(`${KEY_PREFIX}roster:v1`)).toBe('in memory');
  });
});
