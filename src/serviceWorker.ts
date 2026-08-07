/**
 * Registering the service worker, and noticing when a new one is waiting.
 *
 * The app is static, has no runtime API, and is used at tables with no signal,
 * so caching it whole is close to free. What is not free is getting the
 * *update* right: a tool whose rules tables are a month behind, silently, is
 * worse than one that needs a connection.
 *
 * So the worker never takes over on its own (see `scripts/build-sw.mjs`). It
 * installs, then waits, and this module tells the app there is something to
 * take. The reader presses the button.
 */

/** What the app needs to know, without knowing anything about workers. */
export interface UpdateWatcher {
  /** Called once a new version is installed and waiting to take over. */
  onWaiting: () => void;
}

let waiting: ServiceWorker | null = null;

/**
 * Where `sw.js` lives.
 *
 * Resolved against the document rather than hardcoded, because the app is
 * served from a repository path on GitHub Pages and from the root elsewhere -
 * the same reason `vite.config.ts` sets `base: './'`. Getting this wrong
 * registers a worker whose scope does not cover the page, which fails quietly.
 */
function scriptUrl(): string {
  return new URL('sw.js', document.baseURI).href;
}

export function registerServiceWorker(watcher: UpdateWatcher): void {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker
    .register(scriptUrl(), { scope: new URL('./', document.baseURI).href })
    .then((registration) => {
      /*
        A worker can already be waiting when the page loads - the reader
        refreshed while an update was mid-install last time - so the current
        state is checked before listening for a change to it.
      */
      if (registration.waiting && navigator.serviceWorker.controller) {
        waiting = registration.waiting;
        watcher.onWaiting();
      }

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          /*
            `controller` is the test for "was there an old version". Without
            it this is the very first install, and announcing "a new version is
            ready" to somebody who has just arrived would be nonsense.
          */
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            waiting = installing;
            watcher.onWaiting();
          }
        });
      });
    })
    .catch(() => {
      // Registration fails on an insecure origin, in a private window on some
      // browsers, or where a policy forbids it. Offline is an enhancement, so
      // there is nothing to report and nothing to fall back to.
    });
}

/**
 * Take the waiting version: tell it to activate, and reload once it has.
 *
 * The reload is driven by `controllerchange` rather than fired immediately,
 * or the page can reload while the old worker is still serving and get the
 * old assets back - the update appearing to fail, which is the worst outcome
 * because the reader will stop pressing the button.
 */
export function applyUpdate(): void {
  if (!waiting) {
    location.reload();
    return;
  }
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
  waiting.postMessage('skip-waiting');
}
