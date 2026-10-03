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
  /** §160: set by the memory fallback, which keeps nothing past the session. */
  kind?: 'memory';
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
    kind: 'memory',
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
 * §160: when the store refuses, somebody has to be told.
 *
 * A failed write used to be swallowed whole - the session carried on from
 * the cache, which was right, and nobody learned that nothing was reaching
 * the disk, which was not. A full quota or a private window meant an evening
 * of edits gone on reload with no warning. Now the trouble is recorded and
 * said to whoever listens (App turns it into a toast), and the keys stay
 * dirty so the next write burst tries them again - a portrait deleted to
 * make room is enough for the retry to land.
 */
export type SaveTrouble = 'refused' | 'memory-only';

let trouble: SaveTrouble | null = null;
const troubleListeners = new Set<(kind: SaveTrouble) => void>();

function reportTrouble(kind: SaveTrouble): void {
  trouble = kind;
  for (const listener of troubleListeners) listener(kind);
}

/** What has gone wrong with saving, if anything, this session. */
export const saveTrouble = (): SaveTrouble | null => trouble;

/** Hear about save trouble as it happens. Returns the unsubscribe. */
export function onSaveTrouble(listener: (kind: SaveTrouble) => void): () => void {
  troubleListeners.add(listener);
  return () => troubleListeners.delete(listener);
}

/**
 * §160: ask the browser to keep this origin's data.
 *
 * Without it, storage is "best effort": Safari clears a site's data after
 * about a week without a visit, and Chrome clears under disk pressure - so a
 * character saved on a player's phone could be gone by the next session.
 * Asked once, after the first real save rather than at boot, because
 * Firefox puts the question to the user and a prompt is only fair once
 * there is something to keep.
 */
let durableAsked = false;
function askForDurableStorage(): void {
  if (durableAsked) return;
  durableAsked = true;
  try {
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
    if (!storage?.persist) return;
    void storage
      .persisted()
      .then((already) => (already ? true : storage.persist()))
      .catch(() => undefined);
  } catch {
    // An API that is not there is a browser that does not offer it.
  }
}

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
      if (keys.some((key) => key !== MIGRATED_KEY)) askForDurableStorage();
    })
    // A store that refuses a write is not a reason to take the app down; the
    // session keeps working from the cache, exactly as the old localStorage
    // try/catch behaved when the quota was hit. §160: but it is a reason to
    // say so, and to try those keys again with the next burst.
    .catch(() => {
      for (const key of keys) dirty.add(key);
      reportTrouble('refused');
    });
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
    // §160: no store at all - nothing this session makes will outlive it.
    if (adapter.kind === 'memory') trouble = 'memory-only';
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
    void adapter.write(key, value).then(askForDurableStorage, () => reportTrouble('refused'));
    return;
  }
  dirty.add(key);
  scheduleFlush();
}

export function remove(key: string): void {
  cache.delete(key);
  if (adapter.readSync) {
    void adapter.remove(key).catch(() => reportTrouble('refused'));
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
  trouble = null;
  troubleListeners.clear();
  durableAsked = false;
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

// ------------------------------------------------------------- §160 backup

/**
 * Everything worth carrying to another device or keeping against a wiped
 * browser: every key under the prefix except this device's session - which
 * seat it sits in, which room it is in, the table's copy of the roster.
 * Restoring those onto a new phone would sit it in a chair at a table that
 * closed weeks ago.
 */
const SESSION_ONLY = /^dnd-forge:(seat|relay|table-roster):/;

/** The file format, versioned so a future change can refuse an old one. */
export interface Backup {
  format: 'forge-fate-backup';
  version: 1;
  savedAt: string;
  data: Record<string, string>;
}

/** Everything, flushed first so the file holds what the screen shows. */
export async function exportAll(): Promise<Backup> {
  await flush();
  let stored: Record<string, string> = {};
  try {
    stored = await adapter.readAll();
  } catch {
    // An unreadable store still has the cache, which is what the screen shows.
  }
  const data: Record<string, string> = {};
  for (const source of [stored, Object.fromEntries(cache)]) {
    for (const [key, value] of Object.entries(source)) {
      if (key.startsWith(KEY_PREFIX) && !SESSION_ONLY.test(key)) data[key] = value;
    }
  }
  return { format: 'forge-fate-backup', version: 1, savedAt: new Date().toISOString(), data };
}

/**
 * Read a backup file back, or say plainly why not. Pure, so the screen can
 * show what is in a file before anything is overwritten.
 */
export function parseBackup(text: string): { backup: Backup | null; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { backup: null, error: 'That file is not a backup - it is not even JSON.' };
  }
  const b = parsed as Partial<Backup> | null;
  if (!b || b.format !== 'forge-fate-backup') {
    return { backup: null, error: 'That file is not a Forge & Fate backup.' };
  }
  if (b.version !== 1) {
    return {
      backup: null,
      error: 'That backup was made by a newer version of the app. Update this one and try again.',
    };
  }
  const data = b.data;
  if (
    !data ||
    typeof data !== 'object' ||
    Object.entries(data).some(
      ([key, value]) => !key.startsWith(KEY_PREFIX) || typeof value !== 'string',
    )
  ) {
    return { backup: null, error: 'That backup is damaged - its contents are not readable.' };
  }
  return { backup: b as Backup };
}

/**
 * Write a backup over what is here. Store by store: a key in the file
 * replaces the same key here, and a key the file lacks is left alone - so a
 * backup made before any campaigns existed does not wipe today's campaigns.
 * Session keys are skipped even if a hand-edited file carries them. The
 * caller reloads afterwards, because every store was read once at boot.
 */
export async function importAll(backup: Backup): Promise<number> {
  let written = 0;
  for (const [key, value] of Object.entries(backup.data)) {
    if (!key.startsWith(KEY_PREFIX) || SESSION_ONLY.test(key)) continue;
    write(key, value);
    written++;
  }
  await flush();
  return written;
}
