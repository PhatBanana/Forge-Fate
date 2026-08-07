import { useEffect, useState } from 'react';
import type { Build } from '../types';
import { RULESET_LABELS } from '../types';
import { CLASSES_BY_ID } from '../data/classes';
import { RACES_BY_ID } from '../data/races';
import { blankBuild, deriveBuild } from '../engine/character';
import {
  addCharacter,
  duplicateCharacter,
  removeCharacter,
  renameCharacter,
} from '../storage';
import type { Roster, RosterEntry } from '../storage';
import type { Monster } from '../data/monsters';
import { shareUrl } from '../share';
import { Panel } from './shared';
import { CompareView } from './CompareView';
import { ImportTab } from './ImportTab';
import { BestiaryTab } from './BestiaryTab';

/**
 * The roster: every character you have, what each one is, and the things you do
 * to a whole character rather than to a part of one - switch, duplicate,
 * rename, delete, share, print, compare.
 *
 * Duplicate is the load-bearing one. The Builder writes every edit straight
 * through to the active character, so the way to try an idea without risking
 * the original is to copy it first. That only works if copying is obvious.
 *
 * Import and export live here too. Both hand over or take back a whole
 * character rather than a part of one, which is exactly what the rest of this
 * tab does; as a tab of its own it sat beside five tabs that edit pieces.
 *
 * The bestiary is here for the same reason, asked for in those words:
 * *"monsters may want to be moved into characters so they can be built and
 * saved for later."* A monster you made is a thing you build once and keep,
 * which is what every other section of this tab is about - and the Table gets
 * on with running the fight rather than becoming a workshop as well.
 */

type Section = 'roster' | 'bestiary' | 'transfer';

export function CharactersTab({
  roster,
  onChange,
  bestiary,
  onBestiaryChange,
  onEdit,
  onPrint,
  onImport,
}: {
  roster: Roster;
  onChange: (roster: Roster) => void;
  /** Monsters you made. Their own store — see `src/bestiary.ts`. */
  bestiary: Monster[];
  onBestiaryChange: (bestiary: Monster[]) => void;
  onEdit: () => void;
  onPrint: () => void;
  onImport: (build: Build) => void;
}) {
  const [section, setSection] = useState<Section>('roster');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [compareWith, setCompareWith] = useState<string | null>(null);

  // Escape closes the menu, as it closes anything that opens over the page.
  useEffect(() => {
    if (!menuFor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuFor(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuFor]);

  const derived = roster.entries.map((entry) => ({ entry, ctx: deriveBuild(entry.build) }));
  const active = derived.find((d) => d.entry.id === roster.activeId);

  const share = async (entry: RosterEntry) => {
    const url = shareUrl(entry.build);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId(null), 2500);
    } catch {
      // Clipboard needs a secure context and permission. Fall back to showing
      // the link so it can be copied by hand rather than failing silently.
      window.prompt('Copy this link:', url);
    }
  };

  return (
    <div className="stack">
      <nav className="subtabs" role="tablist" aria-label="Character sections">
        <button
          role="tab"
          aria-selected={section === 'roster'}
          onClick={() => setSection('roster')}
        >
          Your characters
        </button>
        <button
          role="tab"
          aria-selected={section === 'bestiary'}
          onClick={() => setSection('bestiary')}
        >
          Bestiary
        </button>
        <button
          role="tab"
          aria-selected={section === 'transfer'}
          onClick={() => setSection('transfer')}
        >
          Import / Export
        </button>
      </nav>

      {section === 'bestiary' && (
        <BestiaryTab saved={bestiary} onChange={onBestiaryChange} />
      )}

      {section === 'transfer' && (
        <ImportTab build={active?.entry.build ?? roster.entries[0].build} onImport={onImport} />
      )}

      {section === 'roster' && (
        <>
      <Panel
        title="Your characters"
        subtitle={`${roster.entries.length} saved. Edits go straight to whichever character is active, so duplicate before trying something you might not keep.`}
      >
        <div className="btn-row" style={{ marginBottom: 14 }}>
          <button
            className="btn btn-primary"
            onClick={() => {
              // A blank sheet, not a copy of the example. Clicking "New
              // character" and being handed a stranger's level 5 Fighter is
              // the same confusion the first run now asks about.
              onChange(addCharacter(roster, blankBuild(active?.entry.build.ruleset ?? '2014')));
              onEdit();
            }}
          >
            New character
          </button>
        </div>

        {derived.map(({ entry, ctx }) => {
          const isActive = entry.id === roster.activeId;
          return (
            <div className={`roster-row ${isActive ? 'is-active' : ''}`} key={entry.id}>
              <div className="roster-main">
                <input
                  className="roster-name"
                  value={entry.build.name}
                  placeholder="Unnamed"
                  aria-label="Character name"
                  onChange={(e) => onChange(renameCharacter(roster, entry.id, e.target.value))}
                />
                <div className="roster-sub">{describe(entry.build)}</div>
              </div>

              <div className="roster-stats">
                <span title="Armor class">AC {ctx.ac.total}</span>
                <span title="Hit points">{ctx.hp.total} hp</span>
                <span title="Damage per round, sustained, at a level-appropriate AC">
                  {ctx.dpr.sustained} dpr
                </span>
              </div>

              <div className="roster-actions">
                {isActive ? (
                  <button className="btn btn-sm btn-primary" onClick={onEdit}>
                    Edit
                  </button>
                ) : (
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      onChange({ ...roster, activeId: entry.id });
                      onEdit();
                    }}
                  >
                    Switch to
                  </button>
                )}
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    // The sheet always shows the active character, so opening
                    // someone else's sheet has to switch to them first.
                    if (!isActive) onChange({ ...roster, activeId: entry.id });
                    onPrint();
                  }}
                >
                  Sheet
                </button>

                {/*
                  Everything else goes behind one button. Five per row is a
                  wall by the sixth character, and four of the five are things
                  you do to a character occasionally rather than every visit.
                  Delete keeps its confirmation, which happens on the row
                  rather than in the menu so the question is impossible to
                  miss.
                */}
                {confirming === entry.id ? (
                  <>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => {
                        onChange(removeCharacter(roster, entry.id));
                        setConfirming(null);
                      }}
                    >
                      Really delete
                    </button>
                    <button className="btn btn-sm" onClick={() => setConfirming(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <div className="row-menu">
                    <button
                      className="btn btn-sm"
                      aria-haspopup="menu"
                      aria-expanded={menuFor === entry.id}
                      aria-label={`More for ${entry.build.name || 'this character'}`}
                      onClick={() => setMenuFor(menuFor === entry.id ? null : entry.id)}
                    >
                      ⋯
                    </button>
                    {menuFor === entry.id && (
                      <>
                        {/*
                          A menu drops over the row beneath it, which puts it
                          on top of that row's own buttons - so clicking the
                          next character's ⋯ would land on "Copy share link"
                          instead. The backdrop swallows that first click and
                          closes the menu, which is what a click outside an
                          open menu should do anyway.
                        */}
                        <div className="menu-backdrop" onClick={() => setMenuFor(null)} />
                      <div className="row-menu-list" role="menu">
                        <button
                          role="menuitem"
                          onClick={() => {
                            onChange(duplicateCharacter(roster, entry.id));
                            setMenuFor(null);
                          }}
                        >
                          Duplicate
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => {
                            void share(entry);
                            setMenuFor(null);
                          }}
                        >
                          {copiedId === entry.id ? 'Link copied' : 'Copy share link'}
                        </button>
                        <button
                          role="menuitem"
                          className="is-danger"
                          onClick={() => {
                            setConfirming(entry.id);
                            setMenuFor(null);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </Panel>

      {roster.entries.length > 1 && active && (
        <Panel
          title="Compare"
          subtitle={`${active.entry.build.name || 'The active character'} against another of yours.`}
        >
          <div className="chips" style={{ marginBottom: 14 }}>
            {derived
              .filter((d) => d.entry.id !== roster.activeId)
              .map(({ entry }) => (
                <button
                  key={entry.id}
                  className={`chip-btn ${compareWith === entry.id ? 'is-on' : ''}`}
                  onClick={() => setCompareWith(compareWith === entry.id ? null : entry.id)}
                >
                  {entry.build.name || 'Unnamed'}
                </button>
              ))}
          </div>

          {compareWith ? (
            <CompareView
              left={active.ctx}
              right={derived.find((d) => d.entry.id === compareWith)!.ctx}
            />
          ) : (
            <p className="muted">Pick a character above to see them side by side.</p>
          )}
        </Panel>
      )}
        </>
      )}
    </div>
  );
}

/** "Wood Elf Ranger 11 / Rogue 3 — 2014 rules" */
function describe(build: Build): string {
  const classes = build.classes
    .map((entry) => `${CLASSES_BY_ID[entry.classId]?.name ?? entry.classId} ${entry.level}`)
    .join(' / ');
  const race = RACES_BY_ID[build.raceId]?.name ?? build.raceId;
  return `${race} ${classes} — ${RULESET_LABELS[build.ruleset]}`;
}
