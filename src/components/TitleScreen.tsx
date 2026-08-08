import type { ReactNode } from 'react';

/**
 * The main menu.
 *
 * For thirty sections this app opened on a form. That is the right landing for
 * a tool and the wrong one for the thing this has become: a table has several
 * jobs - build somebody, prep a dungeon, run the fight, keep the record - and
 * a tab strip above a form answers "which part of the Builder" rather than
 * "what are we doing tonight".
 *
 * So it opens on a menu, and the menu **says what it knows**. Which character
 * is loaded, which campaign is being played, and whether a fight is still on
 * the table. That last one is the whole reason this is worth building: a DM
 * who closed the laptop mid-combat and comes back wants one button, and until
 * now the app gave them a Builder and left them to find their way.
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
  /** Set on the one thing this menu most wants you to press. */
  primary?: boolean;
}

export function TitleScreen({
  character,
  campaign,
  entries,
  onPick,
  aside,
}: {
  /** The character currently loaded, or null when the roster is empty. */
  character: string | null;
  /** The campaign being played, or null when there is none. */
  campaign: string | null;
  entries: TitleEntry[];
  onPick: (id: string) => void;
  /** The theme toggle, passed in rather than imported - this screen has no
      opinion about what else belongs in its corner. */
  aside?: ReactNode;
}) {
  return (
    <div className="title">
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
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`title-item ${entry.primary ? 'is-primary' : ''}`}
              onClick={() => onPick(entry.id)}
            >
              <span className="title-item-label">{entry.label}</span>
              <span className="title-item-hint">{entry.hint}</span>
            </button>
          ))}
        </nav>

        <p className="title-foot">
          Everything is kept in this browser. Nothing is uploaded anywhere.
        </p>
      </div>
    </div>
  );
}
