// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PopOut } from './PopOut';

/**
 * The mini window.
 *
 * There are two presentations and the fallback is the one likely to rot, so it
 * is the one that runs by default here: jsdom's `window.open` returns null, and
 * the viewport it reports is 1024 wide, so `PopOut` tries a real window, is
 * refused, and lands on the floating panel. That is the same sequence a blocked
 * popup produces in a real browser, which makes it the right default rather
 * than a convenient one.
 *
 * The portal path is tested by handing it a document to portal into. What that
 * cannot check is whether a real browser lets the window open at all, or
 * whether the stylesheets land - the browser pass covers those, because jsdom
 * is not in a position to have an opinion about either.
 */

const originalOpen = window.open;
const originalWidth = window.innerWidth;

afterEach(() => {
  window.open = originalOpen;
  Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true });
  document.documentElement.removeAttribute('data-theme');
});

const setWidth = (value: number) =>
  Object.defineProperty(window, 'innerWidth', { value, configurable: true });

/** A stand-in for the window a browser would hand back. */
function fakeWindow() {
  const doc = document.implementation.createHTMLDocument('popped');
  const listeners: Record<string, (() => void)[]> = {};
  const opened = {
    document: doc,
    closed: false,
    close: vi.fn(() => {
      opened.closed = true;
    }),
    addEventListener: (kind: string, fn: () => void) => {
      (listeners[kind] ??= []).push(fn);
    },
    removeEventListener: (kind: string, fn: () => void) => {
      listeners[kind] = (listeners[kind] ?? []).filter((f) => f !== fn);
    },
    fire: (kind: string) => (listeners[kind] ?? []).forEach((fn) => fn()),
  };
  return opened;
}

describe('when a real window cannot be had', () => {
  it('falls back to a panel rather than rendering nothing', async () => {
    // A button that silently does nothing reads as broken, and a blocked popup
    // is the single most likely outcome of clicking one.
    window.open = vi.fn(() => null) as unknown as typeof window.open;
    setWidth(1400);

    render(
      <PopOut title="Grog" onClose={() => {}}>
        <p>hit points</p>
      </PopOut>,
    );

    expect(window.open).toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Grog' })).toBeInTheDocument();
    expect(screen.getByText('hit points')).toBeInTheDocument();
  });

  it('does not even try on a narrow viewport', () => {
    // A phone has nowhere to put a second window, and one opened as a tab you
    // have to swipe back from is the opposite of quick access.
    window.open = vi.fn(() => null) as unknown as typeof window.open;
    setWidth(380);

    render(
      <PopOut title="Grog" onClose={() => {}}>
        <p>hit points</p>
      </PopOut>,
    );

    expect(window.open).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Grog' })).toBeInTheDocument();
  });

  it('closes from its own bar', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    setWidth(380);

    render(
      <PopOut title="Grog" onClose={onClose}>
        <p>hit points</p>
      </PopOut>,
    );

    await user.click(screen.getByRole('button', { name: /close grog/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('when it opens a real window', () => {
  it('portals the content into the other document', () => {
    const opened = fakeWindow();
    window.open = vi.fn(() => opened) as unknown as typeof window.open;
    setWidth(1400);

    render(
      <PopOut title="Grog" onClose={() => {}}>
        <p>hit points</p>
      </PopOut>,
    );

    // In the child document, and *not* in this one - which is what makes it a
    // window rather than a panel.
    expect(opened.document.body.textContent).toContain('hit points');
    expect(screen.queryByText('hit points')).not.toBeInTheDocument();
    expect(opened.document.title).toBe('Grog');
  });

  it('copies the stylesheets across, or nothing in it is styled', () => {
    // A new window starts with an empty head. Without this the sheet arrives as
    // unstyled markup, which is the first thing anyone would notice.
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/assets/index.css';
    document.head.appendChild(link);

    const opened = fakeWindow();
    window.open = vi.fn(() => opened) as unknown as typeof window.open;
    setWidth(1400);

    render(
      <PopOut title="Grog" onClose={() => {}}>
        <p>hit points</p>
      </PopOut>,
    );

    expect(opened.document.querySelector('link[rel="stylesheet"]')).toBeTruthy();
    document.head.removeChild(link);
  });

  it('mirrors the theme, and keeps mirroring it', () => {
    // Otherwise the toggle moves the app and leaves the popped-out window on
    // last week's palette.
    document.documentElement.setAttribute('data-theme', 'dark');
    const opened = fakeWindow();
    window.open = vi.fn(() => opened) as unknown as typeof window.open;
    setWidth(1400);

    render(
      <PopOut title="Grog" onClose={() => {}}>
        <p>hit points</p>
      </PopOut>,
    );
    expect(opened.document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('closes the window when the panel unmounts', () => {
    const opened = fakeWindow();
    window.open = vi.fn(() => opened) as unknown as typeof window.open;
    setWidth(1400);

    const view = render(
      <PopOut title="Grog" onClose={() => {}}>
        <p>hit points</p>
      </PopOut>,
    );
    view.unmount();
    expect(opened.close).toHaveBeenCalled();
  });

  it('tells the app when the window is closed from its own chrome', () => {
    // Without this the app still believes it is open, and the button reading
    // "Close window" has nothing to close. A browser pass caught exactly that:
    // `beforeunload` on a popup does not fire reliably when the window is
    // closed rather than navigated, so `closed` is polled.
    vi.useFakeTimers();
    const onClose = vi.fn();
    const opened = fakeWindow();
    window.open = vi.fn(() => opened) as unknown as typeof window.open;
    setWidth(1400);

    render(
      <PopOut title="Grog" onClose={onClose}>
        <p>hit points</p>
      </PopOut>,
    );
    expect(onClose).not.toHaveBeenCalled();

    opened.closed = true;
    vi.advanceTimersByTime(600);
    expect(onClose).toHaveBeenCalledTimes(1);

    // And it does not keep saying so on every tick.
    vi.advanceTimersByTime(3000);
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('also takes pagehide, whichever gets there first', () => {
    const onClose = vi.fn();
    const opened = fakeWindow();
    window.open = vi.fn(() => opened) as unknown as typeof window.open;
    setWidth(1400);

    render(
      <PopOut title="Grog" onClose={onClose}>
        <p>hit points</p>
      </PopOut>,
    );
    opened.fire('pagehide');
    opened.closed = true;
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not report a close when the panel is the thing unmounting', () => {
    // Unmounting is the app closing the window, not the window closing on the
    // app - calling back would be a loop through whatever state opened it.
    const onClose = vi.fn();
    const opened = fakeWindow();
    window.open = vi.fn(() => opened) as unknown as typeof window.open;
    setWidth(1400);

    const view = render(
      <PopOut title="Grog" onClose={onClose}>
        <p>hit points</p>
      </PopOut>,
    );
    view.unmount();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes the child when the opener is refreshed', () => {
    // An orphaned window is a panel of numbers whose React tree has gone, which
    // is worse than no panel: it looks live and is not.
    const opened = fakeWindow();
    window.open = vi.fn(() => opened) as unknown as typeof window.open;
    setWidth(1400);

    render(
      <PopOut title="Grog" onClose={() => {}}>
        <p>hit points</p>
      </PopOut>,
    );
    window.dispatchEvent(new Event('beforeunload'));
    expect(opened.close).toHaveBeenCalled();
  });
});
