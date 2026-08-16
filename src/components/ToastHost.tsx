import { useEffect } from 'react';
import { TOAST_MS, dismiss, expire, hold, release } from '../toast';
import type { Toast } from '../toast';

/**
 * Where the app's short answers appear.
 *
 * ## It *is* the live region, not a second one
 *
 * §79's rule, learned the hard way when a separate visually-hidden element
 * duplicating the combat log made `getByText` find two of everything: the
 * thing on screen carries `role="status"` itself, so there is **one copy of
 * the text**, visible to everyone, announced once. A toast layer with its own
 * hidden mirror would repeat that mistake exactly.
 *
 * `status` rather than `alert`: these are acknowledgements of something the
 * user just did, not interruptions. A screen reader finishes its sentence
 * first, which is right for "Saved" and right for "Undone" too.
 *
 * ## Where it sits, and why not the middle
 *
 * Bottom-left, clear of `UpdatePrompt`'s bottom-centre and clear of the battle
 * screen's command bar on the right. The prompt is the one floating thing that
 * must not be raced for space: it appears rarely, matters more, and waits for
 * a press rather than expiring - see its own header.
 */
export function ToastHost({
  toasts,
  onChange,
}: {
  toasts: Toast[];
  /** The whole list, back to whoever owns it - the store is pure. */
  onChange: (next: Toast[]) => void;
}) {
  /*
    One timer for the list rather than one per toast: `expire` returns the
    same array when nothing is due, so a tick that changes nothing costs a
    comparison and no render. The interval is a fraction of a toast's life,
    which is close enough for something that fades.
  */
  useEffect(() => {
    if (!toasts.length) return;
    const timer = setInterval(() => onChange(expire(toasts)), TOAST_MS / 8);
    return () => clearInterval(timer);
  }, [toasts, onChange]);

  // Nothing to say: no empty box, and nothing for a reader to land on.
  if (!toasts.length) return null;

  return (
    <div className="toasts" role="status" aria-live="polite" aria-label="Recent actions">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="toast"
          /*
            Held while the pointer is over it or the focus is inside it. A
            toast that vanishes as the click lands is the oldest bug this
            kind of component has, and an action toast is the one people
            actually reach for.
          */
          onMouseEnter={() => onChange(hold(toasts, toast.id, true))}
          onMouseLeave={() => onChange(release(toasts, toast.id))}
          onFocus={() => onChange(hold(toasts, toast.id, true))}
          onBlur={() => onChange(release(toasts, toast.id))}
        >
          <span className="toast-text">{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                toast.action?.onAct();
                onChange(dismiss(toasts, toast.id));
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            className="toast-close"
            aria-label={`Dismiss: ${toast.text}`}
            onClick={() => onChange(dismiss(toasts, toast.id))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
