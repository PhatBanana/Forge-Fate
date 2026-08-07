// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * The boundary exists for one scenario: a character that throws while
 * rendering, in an app that reloads its roster from storage at start-up. That
 * combination is not "an error this time", it is an app that never opens
 * again, and the tests below are about the way *out* rather than the message.
 */

const KEY = 'test:roster';

function Boom(): React.ReactNode {
  throw new Error('deriveBuild exploded');
}

let reload: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  reload = vi.fn();
  Object.defineProperty(window, 'location', {
    value: { ...window.location, reload },
    writable: true,
  });
  // React logs a caught error; the test asserts on behaviour, not noise.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

const roster = (activeId: string, ids: string[]) =>
  JSON.stringify({ entries: ids.map((id) => ({ id, build: { name: id } })), activeId });

describe('when a character cannot be rendered', () => {
  it('shows what happened instead of a blank page', () => {
    render(
      <ErrorBoundary rosterKey={KEY}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /discard this character/i })).toBeInTheDocument();
  });

  it('leaves a working child alone', () => {
    render(
      <ErrorBoundary rosterKey={KEY}>
        <p>the app</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('the app')).toBeInTheDocument();
  });

  /**
   * The escape hatch edits the stored JSON directly rather than going through
   * the roster module, because the code that reads a character is the code
   * that just failed. A recovery path that needs the broken thing to work is
   * not a recovery path.
   */
  it('discards only the active character and keeps the rest', async () => {
    localStorage.setItem(KEY, roster('b', ['a', 'b', 'c']));
    render(
      <ErrorBoundary rosterKey={KEY}>
        <Boom />
      </ErrorBoundary>,
    );

    await userEvent.click(screen.getByRole('button', { name: /discard this character/i }));
    const after = JSON.parse(localStorage.getItem(KEY)!);
    expect(after.entries.map((e: { id: string }) => e.id)).toEqual(['a', 'c']);
    expect(after.activeId).toBe('a');
    expect(reload).toHaveBeenCalled();
  });

  it('reloads even when the stored roster is itself unreadable', async () => {
    localStorage.setItem(KEY, '{ not json');
    render(
      <ErrorBoundary rosterKey={KEY}>
        <Boom />
      </ErrorBoundary>,
    );
    await userEvent.click(screen.getByRole('button', { name: /discard this character/i }));
    expect(reload).toHaveBeenCalled();
  });

  /** Offered before anything destructive, so a bug never costs someone a roster. */
  it('can hand the whole roster over as a file first', async () => {
    localStorage.setItem(KEY, roster('a', ['a']));
    const createObjectURL = vi.fn(() => 'blob:x');
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    render(
      <ErrorBoundary rosterKey={KEY}>
        <Boom />
      </ErrorBoundary>,
    );
    await userEvent.click(screen.getByRole('button', { name: /download all my characters/i }));
    expect(createObjectURL).toHaveBeenCalled();
    // And nothing was removed on the way.
    expect(JSON.parse(localStorage.getItem(KEY)!).entries).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});
