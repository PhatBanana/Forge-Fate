import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { RULESETS, RULESET_LABELS } from './types';
import type { Build, ClassId, Ruleset } from './types';
import { CLASSES_BY_ID } from './data/classes';
import { RACES_BY_ID, racesFor } from './data/races';
import { blankBuild, deriveBuild, equipBestArmor, weaponsForProfile } from './engine/character';
import { optimalPointBuy } from './engine/pointBuy';
import { defaultDefenses } from './engine/defense';
import {
  LEGACY_BUILD_KEY,
  ROSTER_KEY,
  activeBuild,
  activeEncounter,
  activePlay,
  addCharacter,
  loadRoster,
  saveRoster,
  updateActive,
  updatePlay,
} from './storage';
import type { Roster } from './storage';
import { loadBestiary, saveBestiary } from './bestiary';
import type { Monster } from './data/monsters';
import { decodeBuild, tokenFromLocation } from './share';
import { canRedo, canUndo, forget, historyFor, record, redo, undo } from './undo';
import {
  applyTheme,
  loadThemeChoice,
  resolveTheme,
  saveThemeChoice,
  systemTheme,
} from './theme';
import type { ThemeChoice } from './theme';
import type { Histories } from './undo';
import { BuilderTab } from './components/BuilderTab';
import { TitleScreen } from './components/TitleScreen';
import type { TitleEntry } from './components/TitleScreen';
import { activeCampaign, loadCampaigns } from './campaign';
import { isRunning } from './encounter';
import { Panel } from './components/shared';

/*
  The Builder is the tab you land on, so it is bundled. The other three are
  loaded when you first open them.

  This is not shaving a few kilobytes off a page: the matrices behind the
  Optimizer are 43 lineages x 13 classes of written prose, the sheet carries the
  whole printable layout, and the Characters tab drags in the D&D Beyond
  importer and the comparison view. None of that is needed to open a character.

  A named chunk per tab rather than one "everything else", so a build's output
  says which tab grew.
*/
const SheetTab = lazy(async () => ({ default: (await import('./components/SheetTab')).SheetTab }));
/*
  §33.8. The Optimizer is retired and this is what is left of it.

  It was three sections behind a sub-tab - the progression plan, the feat
  browser and the species/class matrix - on the reasoning that they were one
  question, "what should I take?". They are, and the Builder is now where that
  question gets asked: the plan is pinned in its rail (§33.1, §33.5) and the
  feats rank themselves in the panel where you take them, through the same
  `recommendFeats` and the same card.

  The matrix is the one piece that could not move, and not for want of room.
  Picking a pairing calls `loadPairing`, which resets ability scores, defenses,
  feats, improvements and weapons - so it belongs on a screen you visit *before*
  building, not inlined into the page where you are editing the build it would
  wipe.
*/
const RacesTab = lazy(async () => ({
  default: (await import('./components/RacesTab')).RacesTab,
}));
const CharactersTab = lazy(async () => ({
  default: (await import('./components/CharactersTab')).CharactersTab,
}));
/*
  The Table drags in the bestiary loader, and through it a 590 kB chunk of stat
  blocks fetched on first use. A player who never runs a game pays for neither.
*/
const TableTab = lazy(async () => ({ default: (await import('./components/TableTab')).TableTab }));
const CampaignTab = lazy(async () => ({
  default: (await import('./components/CampaignTab')).CampaignTab,
}));

const DungeonsTab = lazy(async () => ({
  default: (await import('./components/DungeonsTab')).DungeonsTab,
}));

/*
  Loading a chunk off a local static host takes a frame or two, so this is a
  placeholder rather than a spinner - a spinner that flashes for 30ms reads as
  a glitch, and an empty box that is replaced reads as nothing at all.
*/
function TabLoading() {
  return <p className="muted" style={{ padding: '24px 0' }}>Loading…</p>;
}

const RULESET_CHOSEN_KEY = 'dnd-forge:ruleset-chosen';

/**
 * Four tabs, one per activity: build a character, read the sheet, ask what to
 * take next, manage the ones you have. The species matrix and the feat browser
 * were tabs of their own and are sections of the Optimizer now, because both
 * answer the same question; import and export moved onto Characters, because
 * both produce or consume a whole character rather than a part of one.
 */
type Tab =
  /*
    §31.2. The app opens here rather than on a form: a table has several jobs
    and a tab strip above the Builder answers "which part of the Builder"
    rather than "what are we doing tonight".
  */
  | 'title'
  | 'builder'
  | 'sheet'
  | 'pairings'
  | 'characters'
  | 'dungeons'
  | 'campaign'
  | 'table';

/*
  Two modes, one app.

  Create is the desk: build a character, read a sheet, weigh a feat, keep a
  bestiary. Play is the table: the battle screen, and it owns the whole window.
  The five-tab strip said "character builder with a DM tab at the end"; the
  mode switch says what the app now is - a DM tool with a workshop behind it.

  `table` stays a `Tab` rather than becoming separate state, so everything that
  already keys off the tab - the title, the wide layout, the lazy chunks -
  keeps working unchanged. The mode is *derived*: being on `table` is Play.
*/
const CREATE_TABS: { id: Tab; label: string }[] = [
  { id: 'builder', label: 'Builder' },
  { id: 'sheet', label: 'Character sheet' },
  { id: 'pairings', label: 'Species × Class' },
  { id: 'characters', label: 'Characters' },
  // The map workshop: building a place is desk work, not table work. The
  // battle screen loads what this tab saves.
  { id: 'dungeons', label: 'Dungeons' },
  // The party and the record of what it did - the one thing here that
  // outlives a single afternoon.
  { id: 'campaign', label: 'Campaign' },
];

const TABS: { id: Tab; label: string }[] = [
  ...CREATE_TABS,
  { id: 'table', label: 'Battle' },
];

/** "Wood Elf Ranger 11 / Rogue 3, 2014 rules" - enough to decide on. */
function describeShared(build: Build): string {
  const classes = build.classes
    .map((entry) => `${CLASSES_BY_ID[entry.classId]?.name ?? entry.classId} ${entry.level}`)
    .join(' / ');
  const race = RACES_BY_ID[build.raceId]?.name ?? build.raceId;
  return `${race} ${classes}, ${RULESET_LABELS[build.ruleset]}.`;
}

/**
 * A share link in the address bar, decoded. Read synchronously on mount rather
 * than in an effect, because whether there is one changes what the first render
 * shows: a link answers the ruleset question by itself, so someone arriving on
 * one must not be stopped and asked.
 */
function readShare(): { build: Build | null; error: string | null } {
  const token = tokenFromLocation();
  if (!token) return { build: null, error: null };
  const { build, error } = decodeBuild(token);
  return { build, error: build ? null : (error ?? 'That link could not be read.') };
}

/**
 * The light/dark switch.
 *
 * Two buttons rather than one, because a single toggle has to say either what
 * you are looking at or what you would get, and every such control gets that
 * backwards for somebody. Two states, one of them pressed, has no such
 * ambiguity - and `aria-pressed` says which to a screen reader.
 */
function ThemeToggle({
  choice,
  onChange,
}: {
  choice: ThemeChoice;
  onChange: (choice: ThemeChoice) => void;
}) {
  const active = resolveTheme(choice);
  return (
    <div className="theme-toggle" role="group" aria-label="Colour theme">
      {(['light', 'dark'] as const).map((theme) => (
        <button
          key={theme}
          type="button"
          className={active === theme ? 'is-on' : ''}
          aria-pressed={active === theme}
          onClick={() =>
            // Picking the one the system would have given you anyway means you
            // have no preference of your own, so the choice is cleared and the
            // app goes back to following the machine.
            onChange(theme === systemTheme() ? 'system' : theme)
          }
        >
          {theme === 'light' ? 'Parchment' : 'Dark'}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  /*
    The menu is the landing, except for somebody arriving on a share link -
    they came to look at a character, and a menu between them and it is a
    question the link already answered.
  */
  const [tab, setTab] = useState<Tab>(() => (tokenFromLocation() ? 'builder' : 'title'));
  /*
    Where "Create" goes back to. A DM flipping to the battle and back should
    land on the desk they left, not on the Builder every time - that would turn
    every glance at a stat block into a navigation chore.
  */
  const [createTab, setCreateTab] = useState<Tab>('builder');
  useEffect(() => {
    if (tab !== 'table' && tab !== 'title') setCreateTab(tab);
  }, [tab]);
  const [roster, setRoster] = useState<Roster>(loadRoster);
  /*
    Monsters you made, kept in their own store rather than on the roster.

    A bestiary outlives a party - the goblins reskinned for a campaign are
    worth keeping after every character in the roster has been replaced - so
    clearing out old characters must not take the stat blocks with them.
  */
  const [bestiary, setBestiary] = useState<Monster[]>(loadBestiary);
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(loadThemeChoice);

  /*
    Applied as an effect rather than at the call site so that following the
    system stays *live*: with no saved choice the media query is listened to,
    and a machine that flips at sunset takes the app with it.
  */
  useEffect(() => {
    applyTheme(resolveTheme(themeChoice));
    if (themeChoice !== 'system' || typeof matchMedia !== 'function') return;
    const query = matchMedia('(prefers-color-scheme: dark)');
    const follow = () => applyTheme(systemTheme());
    query.addEventListener('change', follow);
    return () => query.removeEventListener('change', follow);
  }, [themeChoice]);

  const chooseTheme = (choice: ThemeChoice) => {
    saveThemeChoice(choice);
    setThemeChoice(choice);
  };
  // Someone who arrived on a share link sees the character first and decides
  // whether to keep it; nothing is written to their roster until they do.
  const [share, setShare] = useState(readShare);
  const incoming = share.build;
  const linkError = share.error;
  const clearShare = () => setShare({ build: null, error: null });

  // Undo lives in memory, not in the saved roster: a deep stack across several
  // characters would multiply the roster on disk many times over, to keep
  // forever what only a session ever needs. See `undo.ts`.
  const [histories, setHistories] = useState<Histories<Build>>({});

  const build = activeBuild(roster);
  const activeHistory = historyFor(histories, roster.activeId);

  // Both updates are queued from here rather than one inside the other's
  // updater: a state updater has to be pure, and React calls it twice in
  // development, which would record every edit onto the history twice.
  const setBuild = (next: Build | ((current: Build) => Build)) => {
    const updated = typeof next === 'function' ? next(build) : next;
    if (updated === build) return;
    setHistories((all) => ({
      ...all,
      [roster.activeId]: record(historyFor(all, roster.activeId), build),
    }));
    setRoster((current) => updateActive(current, updated));
  };

  const stepBack = () => {
    const step = undo(activeHistory, build);
    if (!step) return;
    setHistories((all) => ({ ...all, [roster.activeId]: step.history }));
    setRoster((current) => updateActive(current, step.value));
  };

  const stepForward = () => {
    const step = redo(activeHistory, build);
    if (!step) return;
    setHistories((all) => ({ ...all, [roster.activeId]: step.history }));
    setRoster((current) => updateActive(current, step.value));
  };
  /**
   * First run, in two questions.
   *
   * There is no good default for the ruleset: 2014 is the complete dataset,
   * 2024 is what new campaigns use. And the character waiting behind that
   * question is a fully equipped Battle Master 5 - a fine demonstration, and a
   * confusing thing to be handed if you came to enter your own. So the second
   * question asks which of those two you actually wanted.
   */
  const [setup, setSetup] = useState<'ruleset' | 'start' | null>(() => {
    // A shared character carries the rules it was built under, so being handed
    // a link is itself the answer. Asking here would bury the character behind
    // a question the link already settled.
    if (tokenFromLocation()) return null;
    try {
      const fresh =
        !localStorage.getItem(RULESET_CHOSEN_KEY) &&
        !localStorage.getItem(ROSTER_KEY) &&
        !localStorage.getItem(LEGACY_BUILD_KEY);
      return fresh ? 'ruleset' : null;
    } catch {
      return null;
    }
  });

  const chooseRuleset = (ruleset: Ruleset) => {
    try {
      localStorage.setItem(RULESET_CHOSEN_KEY, ruleset);
    } catch {
      // Nothing to do; the prompt simply reappears next time.
    }
    setBuild((current) =>
      ruleset === current.ruleset
        ? current
        : {
            ...current,
            ruleset,
            raceId: racesFor(ruleset)[0].id,
            backgroundId: undefined,
            flexibleAsiPicks: [],
            originFeatIds: [],
            customOrigin: false,
          },
    );
    setSetup('start');
  };

  const chooseStart = (kind: 'blank' | 'example') => {
    // Written straight to the roster rather than through `setBuild`, so that
    // answering a setup question does not become the first entry on your undo
    // stack. Undo should reach back to changes you made, not to the app's.
    setRoster((current) =>
      updateActive(
        current,
        kind === 'blank'
          ? blankBuild(activeBuild(current).ruleset)
          : // Named, so it is never mistaken later for a character you made.
            { ...activeBuild(current), name: 'Example Fighter' },
      ),
    );
    setSetup(null);
  };

  const ctx = useMemo(() => deriveBuild(build), [build]);

  useEffect(() => saveRoster(roster), [roster]);
  useEffect(() => saveBestiary(bestiary), [bestiary]);

  // A character that has been deleted should not leave its history behind.
  useEffect(() => {
    setHistories((all) => {
      const live = new Set(roster.entries.map((e) => e.id));
      const stale = Object.keys(all).filter((id) => !live.has(id));
      return stale.length ? stale.reduce(forget, all) : all;
    });
  }, [roster.entries]);

  // Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z, except while typing - a text field has its
  // own undo and stealing it would be worse than not having one.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      e.preventDefault();
      if (e.shiftKey) stepForward();
      else stepBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /*
    The browser tab says which character it is showing.

    Comparing two builds means having the app open twice, and both tabs read
    "Forge & Fate — D&D 5e builder & optimizer", which is no help at all when
    the whole point is telling them apart.
  */
  useEffect(() => {
    const label = TABS.find((entry) => entry.id === tab)?.label ?? '';
    const name = build.name?.trim();
    document.title = name
      ? `${name} · ${label} — Forge & Fate`
      : `${label} — Forge & Fate`;
  }, [tab, build.name]);

  // The fragment is cleared once read, so a refresh does not re-offer a
  // character already dismissed. Pasting a link while the app is open only
  // changes the fragment and never remounts, so that case needs listening for.
  useEffect(() => {
    const strip = () => window.history.replaceState(null, '', location.pathname + location.search);
    if (tokenFromLocation()) strip();

    const onHashChange = () => {
      if (!tokenFromLocation()) return;
      setShare(readShare());
      setSetup(null);
      strip();
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  /** Jumping in from the matrix: swap lineage and class, keeping levels sane. */
  const loadPairing = (raceId: string, classId: ClassId) => {
    const klass = CLASSES_BY_ID[classId];
    setBuild((current) => equipBestArmor({
      ...current,
      raceId,
      flexibleAsiPicks: [],
      classes: [
        {
          classId,
          level: current.classes[0]?.level ?? 5,
          subclassId: undefined,
        },
      ],
      baseScores: optimalPointBuy(klass.abilityPriority),
      defenses: defaultDefenses(),
      featIds: [],
      featAsiChoices: {},
      asiPicks: [],
      weapons: weaponsForProfile(
        klass.defaultWeaponStyle,
        klass.defaultWeaponStyle === 'dex-ranged' ? 'ranged' : 'two-handed',
      ),
    }));
    setTab('builder');
  };

  if (setup) {
    return (
      <div className="app">
        <header className="masthead">
          <h1>
            Forge<span>&</span>Fate
          </h1>
          <span className="tagline">D&amp;D 5e character builder &amp; optimizer</span>
          <ThemeToggle choice={themeChoice} onChange={chooseTheme} />
        </header>
        <div className="stack" style={{ maxWidth: 640, marginTop: 32 }}>
          {setup === 'ruleset' && (
            <Panel
              title="Which rules does your table use?"
              subtitle="This changes where your ability score increases come from, which species and feats exist, and how the origin ratings work. You can switch at any time in the Builder."
            >
              {RULESETS.map((ruleset) => (
                <details className="suggestion" key={ruleset}>
                  <summary>
                    <span className="title">
                      <strong>{RULESET_LABELS[ruleset]}</strong>
                    </span>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => chooseRuleset(ruleset)}
                    >
                      Use these rules
                    </button>
                  </summary>
                  <div className="body">
                    <p>
                      {ruleset === '2014'
                        ? 'Species carry your ability score increases, so which species you pick genuinely changes which classes you are good at. This is the more complete dataset here: 43 lineages, 75 feats and a fully curated species/class matrix.'
                        : 'Species grant traits only; your background carries the +2/+1 and a free Origin feat. Feats are sorted into Origin, General, Fighting Style and Epic Boon, with level prerequisites, and the level 19 improvement is an Epic Boon. Every class picks its subclass at level 3, and there is no Artificer.'}
                    </p>
                  </div>
                </details>
              ))}
            </Panel>
          )}

          {setup === 'start' && (
            <Panel
              title="Where would you like to start?"
              subtitle="Either way nothing is locked in — you can make as many characters as you like, and delete this one."
            >
              <details className="suggestion">
                <summary>
                  <span className="title">
                    <strong>From scratch</strong>
                    <span className="src">a blank sheet</span>
                  </span>
                  <button className="btn btn-sm btn-primary" onClick={() => chooseStart('blank')}>
                    Start blank
                  </button>
                </summary>
                <div className="body">
                  <p>
                    A 1st-level character with nothing decided: no name, every score at 8 with the
                    whole point-buy budget unspent, nothing worn and nothing held. Pick this if you
                    have a character in mind, or one on paper to type in.
                  </p>
                </div>
              </details>

              <details className="suggestion is-top" open>
                <summary>
                  <span className="title">
                    <strong>From an example</strong>
                    <span className="src">a level 5 Fighter, already equipped</span>
                  </span>
                  <button className="btn btn-sm btn-primary" onClick={() => chooseStart('example')}>
                    Show me an example
                  </button>
                </summary>
                <div className="body">
                  <p>
                    A Variant Human Battle Master in chain mail with a greatsword. Every panel has
                    something in it, so the damage curve, the feat rankings and the character sheet
                    all show you what they do before you have made a single choice.
                  </p>
                </div>
              </details>
            </Panel>
          )}
        </div>
      </div>
    );
  }

  /*
    What the menu offers, and what it says about each. Built here rather than
    inside the screen because every line of it is a fact this component owns:
    whose fight is on the table, which campaign is being played, how many
    characters there are.
  */
  const fightOn = isRunning(activeEncounter(roster));
  const playing = activeCampaign(loadCampaigns());
  const menu: TitleEntry[] = [
    ...(fightOn
      ? [
          {
            id: 'table',
            label: 'Resume the fight',
            hint: `Round ${activeEncounter(roster).round} is still on the table`,
            primary: true,
          },
        ]
      : [{ id: 'table', label: 'Run a battle', hint: 'The map, the initiative, the dice', primary: true }]),
    { id: 'builder', label: 'Build a character', hint: 'Species, class, feats, equipment, spells' },
    { id: 'sheet', label: 'The character sheet', hint: 'The paper one, and the dice that go with it' },
    { id: 'pairings', label: 'Species × Class', hint: 'What each pairing is worth, before you commit to one' },
    { id: 'characters', label: 'Characters & bestiary', hint: 'The roster, monsters you made, import and export' },
    { id: 'dungeons', label: 'Dungeons', hint: 'Draw the places you will fight in' },
    { id: 'campaign', label: 'Campaign', hint: 'The party, and the record of what it did' },
  ];

  if (tab === 'title') {
    return (
      <div className="app is-title">
        <TitleScreen
          character={roster.entries.length ? build.name || 'Unnamed character' : null}
          campaign={playing ? playing.name : null}
          entries={menu}
          onPick={(id) => setTab(id as Tab)}
          aside={<ThemeToggle choice={themeChoice} onChange={chooseTheme} />}
        />
      </div>
    );
  }

  /*
    The Table is a workspace rather than a document, so it gets the whole
    window. Everything else is reading matter - a form, a sheet, a matrix - and
    a 1240px column is what makes those readable; a paragraph stretched across
    a 27-inch monitor is not an improvement.
  */
  return (
    <div className={`app ${tab === 'table' ? 'is-wide battle' : ''}`}>
      <header className="masthead">
        {/*
          The wordmark is the way back to the menu. A game's title in the
          corner goes home when pressed, and it saves this screen a button
          that would otherwise sit in the tab strip pretending to be a tab.
        */}
        <h1>
          <button type="button" className="mast-home" onClick={() => setTab('title')}>
            Forge<span>&</span>Fate
          </button>
        </h1>
        <span className="tagline">
          D&amp;D 5e character builder &amp; optimizer — {build.name || 'unnamed'}
        </span>
        <ThemeToggle choice={themeChoice} onChange={chooseTheme} />
      </header>

      {linkError && (
        <div className="callout error" style={{ marginBottom: 14 }}>
          {linkError}
          <button className="btn btn-sm" style={{ marginLeft: 10 }} onClick={clearShare}>
            Dismiss
          </button>
        </div>
      )}

      {incoming && (
        <Panel
          title={`Someone shared ${incoming.name || 'a character'} with you`}
          subtitle="Nothing has been saved yet. Adding it keeps your own characters untouched."
        >
          <p className="note">
            {describeShared(incoming)}
          </p>
          <div className="btn-row">
            <button
              className="btn btn-primary"
              onClick={() => {
                setRoster((current) => addCharacter(current, incoming));
                clearShare();
                setTab('builder');
              }}
            >
              Add to my characters
            </button>
            <button className="btn" onClick={clearShare}>
              No thanks
            </button>
          </div>
        </Panel>
      )}

      <nav className="tabs" role="tablist">
        {/*
          The mode switch. Play is styled as the thing you launch, because for
          a DM mid-session it is the only button that matters; Create returns
          to whichever desk tab you left. Both are also real tabs to a screen
          reader - the battle screen is a tab like any other, it just dresses
          differently.
        */}
        <span className="mode-switch">
          <button
            type="button"
            className={`mode-btn ${tab !== 'table' ? 'is-on' : ''}`}
            aria-pressed={tab !== 'table'}
            onClick={() => setTab(createTab)}
          >
            Create
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'table'}
            className={`mode-btn mode-play ${tab === 'table' ? 'is-on' : ''}`}
            onClick={() => setTab('table')}
          >
            Play
          </button>
        </span>

        {tab !== 'table' &&
          CREATE_TABS.map((entry) => (
            <button
              key={entry.id}
              role="tab"
              aria-selected={tab === entry.id}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
            </button>
          ))}

        {/* Undo belongs next to the thing it undoes. In the masthead it was a
            corner of the page away from every control it acts on. */}
        <span className="tab-actions">
          <button
            className="btn btn-sm"
            onClick={stepBack}
            disabled={!canUndo(activeHistory)}
            title="Undo (Ctrl+Z)"
          >
            ↶ Undo
          </button>
          <button
            className="btn btn-sm"
            onClick={stepForward}
            disabled={!canRedo(activeHistory)}
            title="Redo (Ctrl+Shift+Z)"
          >
            ↷ Redo
          </button>
        </span>
      </nav>

      {/*
        Everything above is chrome - the masthead, the tab strip, the share
        banner. This is the content, and naming it lets a screen reader jump
        straight here instead of walking the nav on every tab change.
      */}
      <main id="content">
      {/*
        The Builder is inside this, and was not until §33.4 - it sat above
        `#content`, as a direct child of `.app`, which is `overflow: hidden`.
        So the Builder simply did not scroll: everything past the first screen
        was unreachable by wheel, and only an anchor could move it. That went
        unnoticed while each section was about one screen tall; putting the
        whole character on one page made it fatal.

        Eager rather than inside the `Suspense` below, which is how it was
        before: it is the tab most sessions open on, and a loading flash on the
        thing you came for is worse than the few kilobytes.
      */}
      {tab === 'builder' && <BuilderTab build={build} ctx={ctx} onChange={setBuild} />}
      <Suspense fallback={<TabLoading />}>
        {tab === 'sheet' && (
          <SheetTab
            ctx={ctx}
            play={activePlay(roster)}
            onPlayChange={(next) => setRoster((current) => updatePlay(current, current.activeId, next))}
            onBuildChange={setBuild}
          />
        )}
        {tab === 'pairings' && (
          <RacesTab
            raceId={build.raceId}
            classId={ctx.primary.klass.id}
            ruleset={build.ruleset}
            onPick={loadPairing}
          />
        )}
        {tab === 'table' && (
          <TableTab
            roster={roster}
            onChange={setRoster}
            bestiary={bestiary}
            ruleset={build.ruleset}
          />
        )}
        {tab === 'characters' && (
          <CharactersTab
            roster={roster}
            onChange={setRoster}
            bestiary={bestiary}
            onBestiaryChange={setBestiary}
            onImport={setBuild}
            onEdit={() => setTab('builder')}
            onPrint={() => setTab('sheet')}
          />
        )}
        {tab === 'dungeons' && <DungeonsTab />}
        {tab === 'campaign' && <CampaignTab roster={roster} />}
      </Suspense>
      </main>
    </div>
  );
}
