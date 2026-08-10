import { afterEach, beforeEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { resetForTests } from '../persist';
import type { PersistAdapter } from '../persist';

/**
 * Every async query gets five seconds instead of testing-library's one.
 *
 * ## Why this is global rather than per-call
 *
 * The suite failed about one run in three - a *different* test each time,
 * which is the signature of a timeout rather than a bug. §51 raised the one
 * helper that had been caught doing it and the suite still failed one run in
 * four, because the helper was never the problem: the default applies to
 * every `waitFor`, every `findBy*`, and every `user.click` that waits for a
 * re-render, and there were nine more of them.
 *
 * One second is generous when a file runs alone and tight when vitest is
 * running eighty-five in parallel and one of them is hydrating a ~500 kB
 * monster fixture through `persist`. Raising it costs nothing on a passing
 * run - `waitFor` polls and returns the moment the assertion holds, so the
 * timeout is a ceiling and not a delay - and it costs five seconds on a
 * genuinely failing one, which is a fair price for a gate that means what it
 * says.
 *
 * Patching call sites one at a time would have been chasing whichever test
 * happened to lose the race that run. This is the lever.
 */
configure({ asyncUtilTimeout: 5000 });

/**
 * Component tests share one jsdom document per file, so anything left mounted
 * by one test is still in the tree for the next. Unmounting between them keeps
 * `getByText` from matching a stale copy of the thing you just rendered.
 *
 * This runs for the node-environment engine tests too, where there is no DOM to
 * clean and `cleanup` is a no-op - cheaper than maintaining two setup files.
 */
afterEach(() => {
  cleanup();
});

/**
 * The stores read through `persist`, which talks to IndexedDB in a browser.
 * jsdom does not implement IndexedDB at all, so the tests get `localStorage`
 * instead - and because that adapter answers reads synchronously, a test that
 * seeds `localStorage.setItem('dnd-forge:...')` mid-test is seen immediately,
 * exactly as it was before any of this. That is why the migration needed no
 * test changes.
 *
 * The lookup is deliberately LAZY rather than captured once. Setup hooks run
 * before the ones in a test file, and `storage.test.ts` runs under node and
 * stands its own `localStorage` up with `vi.stubGlobal` in its own
 * `beforeEach` - so a captured reference would be the wrong object, or absent
 * entirely, by the time the test body reads it.
 */
const spare = new Map<string, string>();

const ambient = (): Storage | null => {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
};

const testAdapter: PersistAdapter = {
  async readAll() {
    const store = ambient();
    if (!store) return Object.fromEntries(spare);
    const out: Record<string, string> = {};
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key) out[key] = store.getItem(key) ?? '';
    }
    return out;
  },
  async write(key, value) {
    const store = ambient();
    if (store) store.setItem(key, value);
    else spare.set(key, value);
  },
  async remove(key) {
    const store = ambient();
    if (store) store.removeItem(key);
    else spare.delete(key);
  },
  readSync(key) {
    const store = ambient();
    return store ? store.getItem(key) : (spare.get(key) ?? null);
  },
};

beforeEach(() => {
  spare.clear();
  resetForTests(testAdapter);
});
