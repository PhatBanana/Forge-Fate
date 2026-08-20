import type { ReactNode } from 'react';

/**
 * The main menu - and since §35, the app's **only** navigation.
 *
 * For thirty sections this app opened on a form. §31.2 put a menu in front of
 * it, but left the tab strip on every screen behind it - so the menu offered
 * seven destinations and each of them landed on a page offering the same
 * seven again. Two navigation systems, one of them decoration. §35 deleted
 * the strip: this screen is the hub, each screen is a spoke, and a spoke's
 * only way out is back through here (a wordmark chip on the desk screens, a
 * Menu command in the battle's own bar).
 *
 * That is what earns the menu its screen: it is not a duplicate of anything
 * any more, and it **says what it knows** - which character is loaded, which
 * campaign is on, whether a fight is still on the table, how many characters
 * and maps exist. A hub that says nothing makes you press a button to find
 * out.
 *
 * ## Shape
 *
 * Six destinations read as three decisions: Play, at the top and primary;
 * Create, the desk work; World, the things that outlive one evening. Groups
 * rather than a shorter list, because nothing that is reachable today should
 * become unreachable to make a menu prettier.
 *
 * ## What it deliberately is not
 *
 * There is no animation and no splash. A menu you have to sit through is a
 * menu you resent by the fourth time, and this one is in front of somebody
 * every time they open the app. It is a list of large, plainly named buttons
 * that put you somewhere in one press.
 */

export interface TitleEntry {
  id: string;
  label: string;
  /** The line underneath: what the place is for, in a DM's words. */
  hint: string;
  /** Live state, mono, right-aligned: "5 characters", "Round 3". A menu line
      that knows something says it; one that knows nothing shows nothing. */
  state?: string;
  /** Set on the one thing this menu most wants you to press. */
  primary?: boolean;
}

export interface TitleGroup {
  /** "Play" · "Create" · "World" - the decision, not the destination. */
  name: string;
  entries: TitleEntry[];
}

export function TitleScreen({
  character,
  campaign,
  groups,
  onPick,
  aside,
}: {
  /** The character currently loaded, or null when the roster is empty. */
  character: string | null;
  /** The campaign being played, or null when there is none. */
  campaign: string | null;
  groups: TitleGroup[];
  onPick: (id: string) => void;
  /** The theme toggle, passed in rather than imported - this screen has no
      opinion about what else belongs in its corner. */
  aside?: ReactNode;
}) {
  return (
    <div className="title-screen">
      <div className="title-corner">{aside}</div>

      <div className="title-inner">
        <h1 className="title-mark">
          Forge<span>&amp;</span>Fate
        </h1>
        <p className="title-sub">
          {/*
            The state of the app in one line, because a menu that says nothing
            about what is loaded makes you press a button to find out.
          */}
          {[character, campaign].filter(Boolean).join(' · ') ||
            'Nothing loaded yet — start with a character.'}
        </p>

        <nav className="title-menu" aria-label="Main menu">
          {groups.map((group) => (
            <section key={group.name} className="title-group" aria-label={group.name}>
              <h2 className="title-group-name">{group.name}</h2>
              {group.entries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`title-item ${entry.primary ? 'is-primary' : ''}`}
                  onClick={() => onPick(entry.id)}
                >
                  <span className="title-item-row">
                    <span className="title-item-label">{entry.label}</span>
                    {entry.state && <span className="title-item-state">{entry.state}</span>}
                  </span>
                  <span className="title-item-hint">{entry.hint}</span>
                </button>
              ))}
            </section>
          ))}
        </nav>

        <p className="title-foot">
          Everything is kept in this browser. Nothing is uploaded anywhere.
          {/* §102: which build this is - the newest shipped section and the
              commit, stamped at build time. A bug report that starts with
              what this line says has already answered the first question. */}
          {__APP_VERSION__ && <span className="title-version">{__APP_VERSION__}</span>}
        </p>
      </div>
    </div>
  );
}
