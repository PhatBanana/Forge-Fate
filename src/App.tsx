import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { flush } from './persist';
import { originalsShown, setOriginalsShown } from './originals';
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
  isPristine,
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
import { push } from './toast';
import type { Toast } from './toast';
import { ToastHost } from './components/ToastHost';
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
import type { TitleGroup } from './components/TitleScreen';
import { activeCampaign, loadCampaigns } from './campaign';
import { loadDungeons } from './dungeons';
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
  /* §76: role="status" so a screen reader hears the wait instead of a silent
     page change, and --text-dim rather than the faint token, which fails AA
     against the page background in parchment. */
  return (
    <p role="status" style={{ padding: '24px 0', color: 'var(--text-dim)' }}>
      Loading…
    </p>
  );
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
  One nav, and this is not it.

  §35 deleted the tab strip: the title screen offered seven destinations and
  every one of them landed on a page whose top row offered the same seven
  again - two complete navigation systems, one of them decoration. The title
  screen is now the only global nav, the way a tactics game's main menu is,
  and each screen carries a small wordmark chip as its one way back.

  What survives of the strip is its labels, because the browser tab still
  says which screen it is showing.
*/
const TAB_LABELS: Record<Tab, string> = {
  title: 'Menu',
  builder: 'Builder',
  sheet: 'Character sheet',
  pairings: 'Species × Class',
  characters: 'Characters',
  dungeons: 'Dungeons',
  campaign: 'Campaign',
  table: 'Battle',
};

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

/**
 * The originals switch, in the menu's corner beside the theme.
 *
 * Here rather than in the Builder because it is a settings act - it changes
 * what every catalogue in the app offers, not what this character has - and
 * because the menu is the one screen you pass through on the way to anything.
 *
 * The reload is not laziness. `classesFor`, `subclassesFor` and the other four
 * accessors read module-level state during render; nothing subscribes to it,
 * so flipping the flag would leave every already-rendered picker showing the
 * old list until something unrelated happened to re-render it. A page that
 * half-changed would be worse than one that took a second. Storage is written
 * first, so the reload comes back with the new answer.
 */
function OriginalsToggle() {
  const shown = originalsShown();
  return (
    <button
      type="button"
      className={`originals-toggle ${shown ? 'is-on' : ''}`}
      aria-pressed={shown}
      title={
        shown
          ? 'Forge originals are on the table. Turn them off to see only what the books print.'
          : 'Show this project’s own classes and subclasses alongside the published ones. Never presented as official.'
      }
      onClick={async () => {
        setOriginalsShown(!shown);
        await flush();
        location.reload();
      }}
    >
      Forge originals: {shown ? 'on' : 'off'}
    </button>
  );
}

export default function App() {
  /*
    The menu is the landing, except for somebody arriving on a share link -
    they came to look at a character, and a menu between them and it is a
    question the link already answered.
  */
  const [tab, setTab] = useState<Tab>(() => (tokenFromLocation() ? 'builder' : 'title'));
  /* §77: a dungeon on its way to the battle screen - set by the Dungeons
     screen's "Use in a battle", consumed once by TableTab, then cleared.
     §90: the same door, marked when it is being entered as a delve. */
  const [pendingDungeon, setPendingDungeon] = useState<{ id: string; delve?: boolean } | null>(
    null,
  );
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

  /*
    §83: what the app says back, when the control that caused it is not under
    the user's eye. See `toast.ts` for the rule - a label flip on the button
    you just pressed is still the better answer, and the three the app already
    has are staying.
  */
  const [toasts, setToasts] = useState<Toast[]>([]);
  const say = useCallback(
    (text: string, action?: { label: string; onAct: () => void }) =>
      setToasts((current) => push(current, text, action)),
    [],
  );

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
    /*
      §77: land where the answer points. "Show me an example" promised the
      damage curve, the feat rankings and the sheet - and then dropped you on
      the main menu to go find them. Both answers are about building, so both
      land in the Builder; the wordmark chip is one press from the menu.
    */
    setTab('builder');
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
    const label = TAB_LABELS[tab];
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
    /*
      The two first-run questions, asked in the title screen's voice: centred
      wordmark, the question underneath, nothing else. This used to carry the
      masthead, which §35 deleted everywhere - a first screen that looks like
      a website header sets the wrong expectation for everything after it.
    */
    return (
      <div className="app is-title">
        <div className="setup-screen">
          <div className="title-corner">
            <ThemeToggle choice={themeChoice} onChange={chooseTheme} />
          </div>
          <h1 className="title-mark">
            Forge<span>&</span>Fate
          </h1>
          <div className="stack setup-body">
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
      </div>
    );
  }

  /*
    What the menu offers, grouped as the three decisions a table actually
    faces - play, create, keep - and carrying live state per line. Built here
    rather than inside the screen because every line of it is a fact this
    component owns: whose fight is on the table, which campaign is being
    played, how many characters and maps exist.

    The counts are read on render rather than held as state: the menu renders
    exactly when you arrive on it, which is exactly when they may have
    changed.
  */
  const fightOn = isRunning(activeEncounter(roster));
  const playing = activeCampaign(loadCampaigns());
  const dungeonCount = loadDungeons().length;
  const groups: TitleGroup[] = [
    {
      name: 'Play',
      entries: [
        fightOn
          ? {
              id: 'table',
              label: 'Resume the fight',
              hint: 'The board is exactly as you left it',
              state: `Round ${activeEncounter(roster).round}`,
              primary: true,
            }
          : {
              id: 'table',
              label: 'Run a battle',
              hint: 'The map, the initiative, the dice',
              primary: true,
            },
      ],
    },
    {
      name: 'Create',
      entries: [
        {
          id: 'builder',
          label: 'Build a character',
          hint: 'Species, class, feats, equipment, spells',
          state: build.name?.trim() || undefined,
        },
        { id: 'sheet', label: 'The character sheet', hint: 'The paper one, and the dice that go with it' },
      ],
    },
    {
      name: 'World',
      entries: [
        {
          id: 'characters',
          label: 'Characters & bestiary',
          hint: 'The roster, monsters you made, import and export',
          /* §77: "1 saved" before anybody saved anything was the starter
             entry talking. Pristine shows nothing, like the empty dungeons. */
          state: isPristine(roster) ? undefined : `${roster.entries.length} saved`,
        },
        {
          id: 'dungeons',
          label: 'Dungeons',
          hint: 'Draw the places you will fight in',
          state: dungeonCount ? `${dungeonCount} ${dungeonCount === 1 ? 'map' : 'maps'}` : undefined,
        },
        {
          id: 'campaign',
          label: 'Campaign',
          hint: 'The party, and the record of what it did',
          state: playing?.name,
        },
      ],
    },
  ];

  if (tab === 'title') {
    return (
      <div className="app is-title">
        <TitleScreen
          /* §77: the roster is never empty by construction, so the pristine
             check is what makes the welcome line reachable - a brand-new
             visitor should read "start with a character", not be told an
             "Unnamed character" they never made is loaded. */
          character={isPristine(roster) ? null : build.name || 'Unnamed character'}
          campaign={playing ? playing.name : null}
          groups={groups}
          onPick={(id) => setTab(id as Tab)}
          aside={
            <>
              <OriginalsToggle />
              <ThemeToggle choice={themeChoice} onChange={chooseTheme} />
            </>
          }
        />
      </div>
    );
  }

  /*
    The Table is a workspace rather than a document, so it gets the whole
    window. Everything else is reading matter - a form, a sheet, a matrix -
    and its *content* keeps the 1240px column that makes reading possible,
    while the chrome around it stops pretending to be a website.
  */
  return (
    <div
      className={`app ${tab === 'table' ? 'is-wide battle' : ''} ${
        // §38: the dungeon workshop is a stage too - its subject is a map, so
        // it takes the whole region under the game bar and manages its own
        // insides, exactly as the battle does. It keeps the bar, because it
        // is still a desk screen and the way home has to be somewhere.
        tab === 'dungeons' ? 'is-wide stage' : ''
      }`}
    >
      {/*
        The game bar: the only chrome a desk screen has since §35.

        One slim row. The wordmark chip on the left is the single way back to
        the menu - the same spot on every screen, so it becomes muscle memory
        - and the right side holds the screen's *own* actions, never global
        navigation. The tab strip this replaces offered all seven destinations
        on every screen, which made the title screen's menu a decoration.

        A bar rather than a floating overlay because desk screens scroll under
        their top edge, and §34.7 was a whole commit about chrome that was
        present, correct, and underneath something else.

        The battle screen renders none of this: the map takes the whole
        window, and its ways out are commands at the end of its own bar.

        ## The one correction §35 needed

        "Never global navigation" was the right rule and was applied one step
        too widely. Builder, sheet and battle are not three destinations - they
        are one character seen three ways, and during a session you move
        between them constantly. §35 gave Builder and sheet a door to each
        other and left the battle reachable only through the hub, so the most
        travelled route in the app was the one with a screen in the middle of
        it. Reported, and fair.

        So the three carry doors to each other, and nothing else does. The rule
        is unchanged: a screen offers its *neighbours*, not the whole map. The
        Dungeons, Characters, Campaign and Species screens still hold only
        their own actions, because nobody flips between those mid-fight.
      */}
      {tab !== 'table' && (
        <header className="gbar">
          <button type="button" className="gbar-home" onClick={() => setTab('title')}>
            Forge<span>&</span>Fate
          </button>
          <span className="gbar-screen">{TAB_LABELS[tab]}</span>
          <span className="gbar-actions">
            {tab === 'pairings' && (
              <button className="btn btn-sm" onClick={() => setTab('builder')}>
                Back to the Builder
              </button>
            )}
            {tab === 'builder' && (
              <>
                <button
                  className="btn btn-sm"
                  title="Every species × class pairing rated - the reference this screen decides against"
                  onClick={() => setTab('pairings')}
                >
                  Species × Class
                </button>
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
                {/* The pair people flip between, so each carries a door to
                    the other rather than a trip through the menu. */}
                <button className="btn btn-sm" onClick={() => setTab('sheet')}>
                  Character sheet →
                </button>
              </>
            )}
            {tab === 'sheet' && (
              <button className="btn btn-sm" onClick={() => setTab('builder')}>
                ← Edit in Builder
              </button>
            )}
            {(tab === 'builder' || tab === 'sheet') && (
              <button className="btn btn-sm" onClick={() => setTab('table')}>
                Battle →
              </button>
            )}
            {/* §78: the theme lived only on the title and setup screens, so
                switching it from a desk screen meant a trip home. It rides
                the bar every screen already wears. */}
            <ThemeToggle choice={themeChoice} onChange={chooseTheme} />
          </span>
        </header>
      )}

      {/*
        The content region, named so a screen reader can jump straight here.
        The share banner and link error live inside it now - on the battle
        screen they are deliberately not shown at all, because a fight owns
        its window and a banner arriving mid-round would sit over the board;
        they are waiting on any desk screen.
      */}
      <main id="content">
      {tab !== 'table' && linkError && (
        <div className="callout error" style={{ marginBottom: 14 }}>
          {linkError}
          <button className="btn btn-sm" style={{ marginLeft: 10 }} onClick={clearShare}>
            Dismiss
          </button>
        </div>
      )}
      {tab !== 'table' && incoming && (
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
            onHome={() => setTab('title')}
            onSheet={() => setTab('sheet')}
            say={say}
            pendingDungeonId={pendingDungeon?.id ?? null}
            pendingDelve={pendingDungeon?.delve}
            onPendingDungeonDone={() => setPendingDungeon(null)}
            aside={<ThemeToggle choice={themeChoice} onChange={chooseTheme} />}
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
            say={say}
          />
        )}
        {tab === 'dungeons' && (
          <DungeonsTab
            /* §77: "Use in a battle" - the drawn place goes to the fight in
               one press instead of a four-screen walk through the picker. */
            onBattle={(dungeonId, delve) => {
              setPendingDungeon({ id: dungeonId, ...(delve ? { delve } : {}) });
              setTab('table');
              /* §83: the clearest case for a toast in the app - the press
                 leaves the screen it was made on, so a label flip would be
                 acknowledging to nobody. */
              if (!delve) say('Loaded into the battle. The map is on the board.');
            }}
            say={say}
          />
        )}
        {tab === 'campaign' && <CampaignTab roster={roster} say={say} />}
      </Suspense>
      </main>
      {/*
        §86: the honest half of the phone decision. The battle and the editor
        are boards worked with two hands - §31.3 built the battle as a
        full-screen HUD deliberately - and at phone widths their command bars
        crush to single letters over a map nobody can hit. Pretending
        otherwise would ship a broken screen; this says what is true and
        offers the way back. CSS decides, not a resize listener: the div is
        in the DOM whenever either screen is, and only the ≤480 block shows
        it (hiding the screen behind it), so rotating a phone to landscape
        brings the board straight back.
      */}
      {(tab === 'table' || tab === 'dungeons') && (
        <div className="narrow-gate">
          <h2>{tab === 'table' ? 'The battle screen' : 'The dungeon workshop'} wants a tablet or wider</h2>
          <p>
            {tab === 'table'
              ? 'It is a full-screen board with drawers on both hands, and at this width the map would be all drawer. Nothing is lost — the fight is exactly as you left it.'
              : 'Drawing a map is two-handed work: brushes on one side, the drawing under them. Nothing is lost — your maps are exactly as you left them.'}
          </p>
          <p>Turn the phone sideways, or come back on a bigger screen.</p>
          <button type="button" className="btn btn-primary" onClick={() => setTab('title')}>
            Back to the menu
          </button>
        </div>
      )}
      {/*
        §83: inside `App` rather than beside it in `main.tsx`, where
        `UpdatePrompt` lives - these are answers to things done in here, and
        the state that holds them is here. The prompt stays outside the error
        boundary because it may be the fix for the thing that broke; a toast
        about a saved map is not.
      */}
      <ToastHost toasts={toasts} onChange={setToasts} />
    </div>
  );
}
