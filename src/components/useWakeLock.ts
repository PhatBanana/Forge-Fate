import { useEffect, useState } from 'react';

/** The slice of the Screen Wake Lock API this uses - typed here because
    older TypeScript DOM libraries do not carry it. */
interface Sentinel {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}
interface WakeLockApi {
  request(type: 'screen'): Promise<Sentinel>;
}

const api = (): WakeLockApi | undefined =>
  typeof navigator === 'undefined'
    ? undefined
    : (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;

/** Whether this browser can keep the screen on at all. */
export const wakeLockSupported = (): boolean => !!api();

/**
 * §160: keep the screen on while `active`.
 *
 * A seated player's phone dims and locks between their turns, and a locked
 * phone drops off the relay - it rejoins on its own (§95), but the player
 * unlocks to a stale screen every time somebody else takes a turn. The
 * browser releases the lock whenever the tab is hidden, so it is taken
 * again each time the page comes back, and given up when `active` goes.
 *
 * Returns whether the lock is held right now, for the toggle's label.
 */
export function useWakeLock(active: boolean): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const wakeLock = api();
    if (!active || !wakeLock) return;
    let sentinel: Sentinel | null = null;
    let stopped = false;

    const take = () => {
      if (stopped || document.visibilityState !== 'visible') return;
      wakeLock
        .request('screen')
        .then((s) => {
          if (stopped) {
            void s.release();
            return;
          }
          sentinel = s;
          setHeld(true);
          s.addEventListener('release', () => setHeld(false));
        })
        // Refused (battery saver, a browser policy): the screen just sleeps
        // the way it always did.
        .catch(() => setHeld(false));
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') take();
    };

    take();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
      setHeld(false);
    };
  }, [active]);

  return held;
}
