import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

/**
 * The last line between a bad character and a blank page.
 *
 * This app reads its roster from `localStorage` at start-up, so a character
 * that throws while rendering throws again on every reload - the app is not
 * broken *this time*, it is broken permanently, and the only escape a user has
 * is clearing site data, which takes every character they own with it. That is
 * the worst outcome in the app and it deserves a guard rather than a promise
 * that no such bug will ever exist.
 *
 * `hydrateBuild` rejects the one shape known to cause it. This catches the
 * ones nobody has thought of yet, which is the point: a boundary you only add
 * for faults you can already name is not doing anything a fix would not.
 *
 * The recovery UI deliberately touches **nothing derived**. Discarding the
 * active character is offered as a raw `localStorage` edit rather than through
 * the roster store, because whatever just threw may well throw again on the
 * way through it - a recovery path that needs the broken thing to work is not
 * a recovery path.
 */

interface Props {
  children: ReactNode;
  /** Storage key holding the roster, so the escape hatch can edit it directly. */
  rosterKey: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No telemetry to send it to, but the console is where someone reporting
    // this will be asked to look.
    console.error('Forge & Fate could not render:', error, info.componentStack);
  }

  /**
   * Drop the character the app was showing and reload.
   *
   * Written against the stored JSON rather than the roster module on purpose:
   * this has to work when the code that reads a character is the code that
   * just failed.
   */
  private discardActive = () => {
    try {
      const raw = localStorage.getItem(this.props.rosterKey);
      if (raw) {
        const roster = JSON.parse(raw) as { entries?: { id: string }[]; activeId?: string };
        const entries = (roster.entries ?? []).filter((entry) => entry.id !== roster.activeId);
        localStorage.setItem(
          this.props.rosterKey,
          JSON.stringify({ entries, activeId: entries[0]?.id ?? '' }),
        );
      }
    } catch {
      // If even that fails, the reload below at least tries again cleanly.
    }
    location.reload();
  };

  /** The whole roster as a file, before doing anything destructive to it. */
  private download = () => {
    try {
      const raw = localStorage.getItem(this.props.rosterKey) ?? '{}';
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'forge-and-fate-characters.json';
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      // Nothing useful to say; the other two buttons still work.
    }
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="stack" style={{ maxWidth: 620, margin: '48px auto' }}>
        <section className="panel">
          <h2>Something went wrong</h2>
          <p className="panel-sub">
            The app could not display this character. This is a bug, not something you did.
          </p>
          <p>
            Your other characters are almost certainly fine. Save a copy of everything first, then
            discard the one that will not open — the app will start again on the next character in
            your list.
          </p>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn" onClick={this.download}>
              Download all my characters
            </button>
            <button className="btn btn-primary" onClick={this.discardActive}>
              Discard this character and reload
            </button>
            <button className="btn" onClick={() => location.reload()}>
              Just reload
            </button>
          </div>
          <details style={{ marginTop: 16 }}>
            <summary className="muted" style={{ cursor: 'pointer', fontSize: 13 }}>
              What went wrong, for a bug report
            </summary>
            <pre
              style={{
                marginTop: 8,
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
              }}
            >
              {this.state.error.message}
            </pre>
          </details>
        </section>
      </div>
    );
  }
}
