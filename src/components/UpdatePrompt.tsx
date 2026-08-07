import { useEffect, useState } from 'react';
import { applyUpdate, registerServiceWorker } from '../serviceWorker';

/**
 * "A new version is ready."
 *
 * The app caches itself so it works at a table with no signal, which means a
 * deploy does not reach anyone until their copy is replaced. Doing that
 * silently under a running page can hand it a chunk from a different build, so
 * the swap waits for a press - and this is the press.
 *
 * It is a prompt rather than a toast that fades: somebody mid-build should be
 * able to finish first, and an update they never saw offered is the same as no
 * update at all.
 */
export function UpdatePrompt() {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    /*
      Production only. `sw.js` is written by `scripts/build-sw.mjs` after a
      build and does not exist under `npm run dev`, so registering there buys
      a 404 in every developer's console and nothing else. The registration
      module itself stays unconditional, and is tested directly.
    */
    if (!import.meta.env.PROD) return;
    registerServiceWorker({ onWaiting: () => setReady(true) });
  }, []);

  if (!ready || dismissed) return null;

  return (
    <div className="update-prompt cs-screen" role="status">
      <span className="update-prompt-text">
        <b>A new version is ready.</b> Reloading keeps everything you have saved.
      </span>
      {/* Kept together, so they wrap as a pair rather than one at a time. */}
      <span className="update-prompt-actions">
        <button type="button" className="btn btn-sm btn-primary" onClick={applyUpdate}>
          Reload
        </button>
        <button
          type="button"
          className="btn btn-sm"
          title="Stay on this version until you next open the app"
          onClick={() => setDismissed(true)}
        >
          Later
        </button>
      </span>
    </div>
  );
}
