/**
 * Things the app says back.
 *
 * ## Why this exists, when §76 argued against it
 *
 * §76 wanted acknowledgement and shipped **label flips** instead of a toast
 * layer - "Save this map" becomes "Saved" for a moment, the way
 * `CharactersTab` had done since §44. That was the right call for what it
 * covered and it stays: a word on the button you *just pressed* is the most
 * direct acknowledgement there is, needs no new machinery, and cannot be
 * missed because your eyes are already there.
 *
 * It fails for the other half. When the news arrives somewhere the button is
 * not - a fight cleared from a menu three screens of drawer away, an undo
 * fired from a keystroke, a save that happened because you left - a flip on a
 * control nobody is looking at says nothing at all. §84's undo makes that the
 * common case rather than the odd one, which is what finally earns the layer.
 *
 * So the rule is not "toasts replace flips". It is:
 *
 * > If the control that caused it is under the user's eye, flip its label.
 * > If it is not, say it here.
 *
 * ## Two things this deliberately does
 *
 * **Time is a parameter.** `expire` takes `now` rather than reading the clock,
 * so the whole lifecycle is testable without waiting for real seconds to pass
 * - the same choice `undo.ts` made about coalescing, for the same reason.
 *
 * **A toast can carry one action.** That is what makes it more than a
 * notification: "Undone — Redo" is a sentence and a way back in one object. It
 * is capped at one because two buttons on a transient strip is a dialog that
 * runs away from you.
 */

/** How long a toast lives before it expires on its own. */
export const TOAST_MS = 4000;

/**
 * How many are visible at once. Three, because a fourth means the app is
 * narrating rather than answering - and because the stack is fixed to a corner
 * and a tall pile of them starts covering the thing you did.
 */
export const TOAST_LIMIT = 3;

/**
 * What a screen is handed so it can say something. One name for it, because
 * §84 gives three more screens a reason to and a prop typed slightly
 * differently in each is how "Redo" quietly stops being offered.
 */
export type Say = (text: string, action?: ToastAction) => void;

export interface ToastAction {
  label: string;
  onAct: () => void;
}

export interface Toast {
  id: string;
  text: string;
  /** One way back, at most. See the header. */
  action?: ToastAction;
  /** When it was pushed, for `expire`. */
  at: number;
  /**
   * Held open. A toast the pointer is over, or whose action has focus, must
   * not vanish out from under the click that is about to land on it - the
   * oldest bug in every toast implementation.
   */
  held?: boolean;
}

let counter = 0;
/** Ids are sequential rather than random: two toasts in one millisecond are
    ordinary, and a duplicate React key is not. */
const nextId = (): string => `t${++counter}`;

/**
 * Say something. Newest first, capped - the cap drops the *oldest*, because
 * the thing that just happened is the thing worth reading.
 */
export function push(
  toasts: Toast[],
  text: string,
  action?: ToastAction,
  now: number = Date.now(),
): Toast[] {
  return [{ id: nextId(), text, action, at: now }, ...toasts].slice(0, TOAST_LIMIT);
}

export function dismiss(toasts: Toast[], id: string): Toast[] {
  return toasts.filter((toast) => toast.id !== id);
}

/** Hold one open, or let it go again. */
export function hold(toasts: Toast[], id: string, held: boolean): Toast[] {
  return toasts.map((toast) => (toast.id === id ? { ...toast, held } : toast));
}

/**
 * Drop whatever has had its time. A held toast is exempt and its clock
 * restarts when it is released, so a pointer resting on one does not leave it
 * on borrowed time the instant it moves away.
 */
export function expire(toasts: Toast[], now: number = Date.now()): Toast[] {
  const kept = toasts.filter((toast) => toast.held || now - toast.at < TOAST_MS);
  // Same array when nothing changed: this runs on a timer, and a new array
  // every tick would re-render the host forever.
  return kept.length === toasts.length ? toasts : kept;
}

/** Release a held toast, restarting its clock rather than expiring it at once. */
export function release(toasts: Toast[], id: string, now: number = Date.now()): Toast[] {
  return toasts.map((toast) => (toast.id === id ? { ...toast, held: false, at: now } : toast));
}
