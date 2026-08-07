/**
 * Where everything is kept.
 *
 * For its whole life this app stored itself in `localStorage`, which is one
 * budget of roughly five megabytes for the entire origin. That is not much
 * once a roster carries portraits, a bestiary carries stat blocks and a
 * drawer carries painted dungeons - and the failure mode is the worst kind,
 * because the quota is only reached when somebody has *already* built the
 * thing that will not fit. `engine/portrait.ts` is a whole file of careful
 * work spent buying headroom back a kilobyte at a time.
 *
 * IndexedDB has no such ceiling. What it has instead is an asynchronous API,
 * and this app reads its stores synchronously in a hundred places - every
 * `useState(loadRoster)` in the tree assumes an answer is available now.
 * Rewriting all of that would be a large, risky change to make in service of
 * a storage swap.
 *
 * So the async lives here and nowhere else:
 *
 *  - `hydrate()` runs ONCE before the first render and pulls every key into
 *    an in-memory cache.
 *  - `read()` and `write()` are synchronous against that cache, so every
 *    caller keeps the signature it already had.
 *  - writes are echoed to the real store in the background, coalesced, so a
 *    keystroke-per-render save costs one write per burst rather than each.
 *
 * The store itself is behind an adapter, for two reasons. A browser that
 * refuses IndexedDB - private windows, in some browsers - must still run, so
 * `localStorage` remains a working fallback rather than a failure. And the
 * tests run in jsdom, which does not implement IndexedDB at all; they get the
 * same `localStorage` adapter, which is why not one of them needed changing.
 */

export interface PersistAdapter {
  /** Everything in the store, for the one hydration at boot. */
  readAll(): Promise<Record<string, string>>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  /**
   * A synchronous read, where the backing store can answer immediately.
   *
   * `localStorage` can, and when it does the cache is bypassed entirely -
   * which is what keeps the fallback path honest about writes made by
   * anything other than this module (another tab, a test seeding a fixture
   * after boot). IndexedDB cannot, and leaves this undefined.
   */
  readSync?(key: string): string | null;
}

/** Everything this app owns is under one prefix, which is what makes the
    one-time migration a scan rather than a list to keep in step. */
export const KEY_PREFIX = 'dnd-forge:';

const DB_NAME = 'dnd-forge';
const STORE = 'kv';
/** Set once the contents of `localStorage` have been carried across. */
const MIGRATED_KEY = 'dnd-forge:migrated-to-idb';

// ---------------------------------------------------------------- adapters

/** `localStorage` (or any `Storage`): the fallback, and the tests' store. */
export function webStorageAdapter(storage: Storage): PersistAdapter {
  return {
    async readAll() {
      const out: Record<string, string> = {};
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key || !key.startsWith(KEY_PREFIX)) continue;
        const value = storage.getItem(key);
        if (value !== null) out[key] = value;
      }
      return out;
    },
    async write(key, value) {
      storage.setItem(key, value);
    },
    async remove(key) {
      storage.removeItem(key);
    },
    readSync(key) {
      return storage.getItem(key);
    },
  };
}

/** Nothing at all - for a browser with neither store, so the app still runs
    for the length of the session rather than refusing to start. */
export function memoryAdapter(): PersistAdapter {
  const map = new Map<string, string>();
  return {
    async readAll() {
      return Object.fromEntries(map);
    },
    async write(key, value) {
      map.set(key, value);
    },
    async remove(key) {
      map.delete(key);
    },
    readSync(key) {
      return map.get(key) ?? null;
    },
  };
}

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('indexedDB blocked'));
  });

export function indexedDbAdapter(db: IDBDatabase): PersistAdapter {
  const run = <T,>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) =>
    new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

  return {
    async readAll() {
      const [keys, values] = await Promise.all([
        run<IDBValidKey[]>('readonly', (s) => s.getAllKeys()),
        run<unknown[]>('readonly', (s) => s.getAll()),
      ]);
      const out: Record<string, string> = {};
      keys.forEach((key, i) => {
        const value = values[i];
        if (typeof key === 'string' && typeof value === 'string') out[key] = value;
      });
      return out;
    },
    write(key, value) {
      return run('readwrite', (s) => s.put(value, key)).then(() => undefined);
    },
    remove(key) {
      return run('readwrite', (s) => s.delete(key)).then(() => undefined);
    },
  };
}

// ------------------------------------------------------------- the module

let adapter: PersistAdapter = memoryAdapter();
const cache = new Map<string, string>();

/** Keys written since the last flush, and the timer that will carry them. */
const dirty = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> = Promise.resolve();

/**
 * A save per render would be a write per keystroke. The app's stores are
 * written from `useEffect`, so a burst is normal and coalescing it is the
 * difference between one transaction and thirty.
 */
const FLUSH_DELAY = 120;

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_DELAY);
}

/**
 * Carry everything pending to the store. Awaitable, because a test and a
 * closing page both want to know the write actually happened.
 */
export function flush(): Promise<void> {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const keys = [...dirty];
  dirty.clear();
  if (!keys.length) return inFlight;

  inFlight = inFlight
    .then(async () => {
      for (const key of keys) {
        const value = cache.get(key);
        if (value === undefined) await adapter.remove(key);
        else await adapter.write(key, value);
      }
    })
    // A store that refuses a write is not a reason to take the app down; the
    // session keeps working from the cache, exactly as the old localStorage
    // try/catch behaved when the quota was hit.
    .catch(() => undefined);
  return inFlight;
}

/**
 * Fill the cache and pick a store. Runs once, before the first render.
 *
 * Falls back rather than throws: IndexedDB refused (a private window) drops
 * to `localStorage`, and no web storage at all drops to memory, because an
 * app that will not start is worse than an app that will not remember.
 */
export async function hydrate(preferred?: PersistAdapter): Promise<void> {
  if (preferred) {
    adapter = preferred;
  } else {
    adapter = await pickAdapter();
  }
  cache.clear();
  try {
    for (const [key, value] of Object.entries(await adapter.readAll())) {
      cache.set(key, value);
    }
  } catch {
    // An unreadable store is an empty one; the app starts fresh rather than
    // not at all.
  }
  await migrateFromWebStorage();
}

async function pickAdapter(): Promise<PersistAdapter> {
  if (typeof indexedDB !== 'undefined') {
    try {
      return indexedDbAdapter(await openDb());
    } catch {
      // Fall through to web storage.
    }
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.getItem(KEY_PREFIX);
      return webStorageAdapter(localStorage);
    }
  } catch {
    // Fall through to memory.
  }
  return memoryAdapter();
}

/**
 * The one-time carry across, for everybody who used the app before this.
 *
 * Only keys the new store lacks are copied, so it is idempotent and can
 * never overwrite something newer. `localStorage` is deliberately NOT
 * cleared: it costs nothing to leave, and it means a version rolled back
 * finds every character exactly where it left them.
 */
async function migrateFromWebStorage(): Promise<void> {
  if (adapter.readSync) return; // already reading web storage directly
  if (cache.has(MIGRATED_KEY)) return;
  let legacy: Storage;
  try {
    if (typeof localStorage === 'undefined') return;
    legacy = localStorage;
  } catch {
    return;
  }

  const carried: [string, string][] = [];
  for (let i = 0; i < legacy.length; i++) {
    const key = legacy.key(i);
    if (!key || !key.startsWith(KEY_PREFIX) || cache.has(key)) continue;
    const value = legacy.getItem(key);
    if (value !== null) carried.push([key, value]);
  }
  for (const [key, value] of carried) cache.set(key, value);
  cache.set(MIGRATED_KEY, new Date().toISOString());
  for (const [key] of carried) dirty.add(key);
  dirty.add(MIGRATED_KEY);
  await flush();
}

// ------------------------------------------------------- the sync surface

/** What a store reads. Synchronous, which is the whole point of the cache. */
export function read(key: string): string | null {
  if (adapter.readSync) return adapter.readSync(key);
  return cache.get(key) ?? null;
}

/** What a store writes. Lands in the cache now, in the store shortly. */
export function write(key: string, value: string): void {
  cache.set(key, value);
  if (adapter.readSync) {
    // The synchronous stores are their own cache; write straight through so
    // another tab or a test sees it immediately.
    void adapter.write(key, value).catch(() => undefined);
    return;
  }
  dirty.add(key);
  scheduleFlush();
}

export function remove(key: string): void {
  cache.delete(key);
  if (adapter.readSync) {
    void adapter.remove(key).catch(() => undefined);
    return;
  }
  dirty.add(key);
  scheduleFlush();
}

/** Test seam: forget the adapter and everything cached. */
export function resetForTests(next?: PersistAdapter): void {
  adapter = next ?? memoryAdapter();
  cache.clear();
  dirty.clear();
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}
