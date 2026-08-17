import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDragPosition } from './useDragPosition';

/**
 * A panel that leaves the page.
 *
 * The DM's ask is "ping it open in a mini window for quick access" - a sheet or
 * a stat block parked beside the tracker, ideally on a second screen. This does
 * that with `window.open` plus a React **portal**, which is the part that
 * matters: the popped-out content is the *same component instance* rendered
 * into another document, so a hit point changed in the window changes in the
 * tracker in the same tick. One JS context, one state tree, nothing to sync.
 * `BroadcastChannel` and `localStorage` events would both be answers to a
 * problem this shape does not have.
 *
 * ## Two ways to open, and the fallback is not the sad path
 *
 * A real window cannot always be had. Popup blockers refuse one that did not
 * come from a gesture they trust, and a phone has nowhere to put it. So there
 * is a **draggable in-page panel**, and callers never branch: `PopOut` decides,
 * renders one or the other, and looks the same from outside.
 *
 * The fallback is the path most likely to rot, so it is the one that runs by
 * default in tests - jsdom has no real `window.open`, so every component test
 * that pops something out exercises the panel. The portal path has a test of
 * its own that stubs `window.open`.
 *
 * ## Making another document look like this one
 *
 * A new window starts with an empty `<head>`, so nothing is styled. Every
 * `<link rel="stylesheet">` and `<style>` is cloned across, and `data-theme` is
 * mirrored onto the child's root and kept in sync - otherwise the theme toggle
 * would move the app and leave the popped-out window behind. The character
 * sheet's own ink palette travels with the stylesheet, since it is scoped to
 * `.cs` rather than to the document.
 *
 * The window is closed on unmount and on the opener's `beforeunload`. A
 * refresh that left one open would leave a window whose React tree is gone -
 * a dead panel showing numbers that no longer update, which is worse than no
 * panel at all.
 */

/** Wide enough for the sheet's narrow layout, tall enough to be worth it. */
const FEATURES = 'width=460,height=760,menubar=no,toolbar=no,location=no';

function copyStyles(from: Document, to: Document): void {
  for (const node of from.querySelectorAll('link[rel="stylesheet"], style')) {
    to.head.appendChild(node.cloneNode(true));
  }
}

/**
 * Keep the child document on the same theme as the opener.
 *
 * `data-theme` is what the toggle stamps on the root, and the palettes hang off
 * it. A `MutationObserver` rather than a prop, because the theme is not this
 * component's state and threading it through every caller to reach a window
 * they did not open would be a worse shape than watching the attribute that
 * already exists.
 */
function useMirroredTheme(child: Document | null): void {
  useEffect(() => {
    if (!child) return;
    const root = document.documentElement;
    const apply = () => {
      const theme = root.getAttribute('data-theme');
      if (theme) child.documentElement.setAttribute('data-theme', theme);
      else child.documentElement.removeAttribute('data-theme');
      child.documentElement.style.colorScheme = root.style.colorScheme;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme', 'style'] });
    return () => observer.disconnect();
  }, [child]);
}

/** A real browser window with the content portalled into it. */
function Windowed({
  title,
  onClose,
  onBlocked,
  children,
}: {
  title: string;
  onClose: () => void;
  onBlocked: () => void;
  children: React.ReactNode;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const windowRef = useRef<Window | null>(null);

  useEffect(() => {
    const opened = window.open('', '', FEATURES);
    if (!opened) {
      // Blocked. Tell the parent so it can fall back rather than rendering
      // nothing at all, which would read as a broken button.
      onBlocked();
      return;
    }
    windowRef.current = opened;

    opened.document.title = title;
    copyStyles(document, opened.document);

    const container = opened.document.createElement('div');
    container.className = 'popout-body';
    opened.document.body.appendChild(container);
    setHost(container);

    /*
      Noticing that the window was closed from its own chrome.

      This is polled rather than listened for, which looks lazy and is not.
      `beforeunload` on a popup is the obvious hook and it does not fire
      reliably when the window is closed rather than navigated - browsers
      increasingly withhold it without a user gesture in that window, and a
      browser pass caught exactly that: the window shut and the app went on
      believing it was open, leaving a button reading "Close window" with
      nothing to close. `closed` is a plain boolean that is always true once it
      is true. Twice a second is imperceptible and costs nothing.

      `pagehide` is kept as well, because when it does fire it is immediate,
      and `once` plus the guard means whichever gets there first wins.
    */
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onClose();
    };
    opened.addEventListener('pagehide', finish);
    const poll = window.setInterval(() => {
      if (opened.closed) finish();
    }, 500);

    // A refresh of the opener must not leave an orphan whose React tree has
    // gone: a panel of numbers that looks live and is not.
    const closeChild = () => opened.close();
    window.addEventListener('beforeunload', closeChild);

    return () => {
      done = true; // Unmounting is not the window closing on us.
      window.clearInterval(poll);
      window.removeEventListener('beforeunload', closeChild);
      opened.removeEventListener('pagehide', finish);
      opened.close();
    };
    // Deliberately opened once. Re-running on a title change would close the
    // window and open a new one somewhere else on screen, mid-fight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useMirroredTheme(host?.ownerDocument ?? null);

  return host ? createPortal(children, host) : null;
}

/** The in-page fallback: draggable, and it cannot leave the browser window. */
function Floating({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // §32.3 moved the dragging into `useDragPosition`, which every HUD panel
  // now uses too. This was where it was written; it is no longer where it
  // lives.
  const { at, handle } = useDragPosition();

  /*
    §79: a dialog role without the dialog contract is worse than none - it
    promises focus behaviour it does not have. The minimum honoured here:
    focus lands on Close when the float opens, returns to where it was when
    the float closes, and Escape closes it.

    **§85: the missing trap is a decision, not a gap.** §79 left it "deferred",
    which reads like a job somebody forgot; §85 went through every dialog in
    the app and this one keeps its non-trap on purpose. `ShortcutsHelp` is
    `aria-modal` - it is a page of text that owns the screen until dismissed,
    so it got a real trap. A pop-out is the opposite: it exists so a DM can
    keep a monster's stat block open *while working the board behind it*, and
    several can be open at once. Trapping Tab inside one would forbid the only
    thing it is for, and would be lying twice over about a surface that is not
    modal and does not claim to be - which is why it carries `role="dialog"`
    without `aria-modal`, and why the two dialogs differ.
  */
  const closer = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closer.current?.focus();
    return () => opener?.focus?.();
  }, []);

  return (
    <div
      className="popout-float"
      style={{ transform: `translate(${at.x}px, ${at.y}px)` }}
      role="dialog"
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="popout-bar" {...handle}>
        <span>{title}</span>
        <button ref={closer} type="button" onClick={onClose} aria-label={`Close ${title}`}>
          ✕
        </button>
      </div>
      <div className="popout-body">{children}</div>
    </div>
  );
}

/**
 * Whether a real window is worth trying.
 *
 * A narrow viewport is a phone or a tablet, where a second window is either
 * refused outright or opens as a tab you have to swipe back from - the opposite
 * of "quick access". The floating panel is the better answer there, so it is
 * chosen rather than fallen back to.
 */
function canOpenWindow(): boolean {
  if (typeof window === 'undefined' || typeof window.open !== 'function') return false;
  return window.innerWidth >= 900;
}

export function PopOut({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Decided once, on mount. Re-deciding on a resize would slam a window shut
  // because somebody dragged the browser narrower.
  const [mode, setMode] = useState<'window' | 'float'>(() =>
    canOpenWindow() ? 'window' : 'float',
  );

  if (mode === 'float') {
    return (
      <Floating title={title} onClose={onClose}>
        {children}
      </Floating>
    );
  }

  return (
    <Windowed title={title} onClose={onClose} onBlocked={() => setMode('float')}>
      {children}
    </Windowed>
  );
}
