import { emptyDetails } from './types';
import type { Build, Loadout, WeaponStyle } from './types';
import { emptyPlay } from './play';
import type { PlayState } from './play';
import { emptyEncounter, removeCombatant } from './encounter';
import type { EncounterState } from './encounter';
import { hydrateElevation, hydrateTerrain } from './terrain';
import { hydrateZones } from './zones';
import { emptyBuild, weaponsForProfile } from './engine/character';
import { defaultDefenses } from './engine/defense';
import { CLASSES } from './data/classes';
import { emptyCoins } from './engine/inventory';

/**
 * Saved characters.
 *
 * The app kept exactly one build in `localStorage` for its first six phases,
 * which meant trying an idea meant losing the character you had. A roster holds
 * several, with one active; the Builder edits the active one and writes through
 * on every change, so there is no save button and no unsaved state to lose.
 * Duplicate is the escape hatch that makes that safe: to try a variant you copy
 * first, deliberately, rather than risking the original.
 *
 * The old single-build key is migrated in as the first character and then left
 * where it is rather than deleted. It costs a few hundred bytes and means an
 * older deployment of the app still finds a character rather than an empty one.
 */

const ROSTER_KEY = 'dnd-forge:roster:v1';
const LEGACY_BUILD_KEY = 'dnd-forge:build:v1';

export interface RosterEntry {
  id: string;
  build: Build;
  /** Last write, used to order the list and to show "edited 5 minutes ago". */
  updatedAt: number;
  /**
   * What has been spent this session. Persisted, unlike the undo history:
   * losing your hit points to a page refresh mid-fight would make the whole
   * feature pointless.
   */
  play: PlayState;
}

export interface Roster {
  entries: RosterEntry[];
  /** The character the Builder is editing. Always present in `entries`. */
  activeId: string;
  /**
   * The fight on the table, if there is one.
   *
   * On the roster rather than on a character, because an encounter is
   * *between* them - it holds several of these entries plus a pile of monsters,
   * and belongs to none of them. Absent on every roster saved before it
   * existed, which the shallow merge in `loadRoster` fills in.
   */
  encounter?: EncounterState;
}

/** How the damage numbers are presented, not facts about the character. */
const DEFAULT_ASSUMPTIONS = { advantage: false, concentrating: true, targets: 1 };

export function newId(): string {
  // randomUUID needs a secure context, which a file:// build does not have.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      // Fall through to the counter below.
    }
  }
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Fill in the groups a build gained after it was saved.
 *
 * The spread is shallow, so a nested group added in a later phase would be
 * missing entirely on an older save. Each line here is a phase's worth of new
 * shape, and the migrations from before `weapons` and `classOptionIds` existed
 * are load-bearing: a build saved under the old dropdowns still describes a
 * combat profile, just not as equipment.
 */
export function hydrateBuild(parsed: unknown): Build | null {
  const candidate = parsed as Build | null;
  if (!candidate?.baseScores || !Array.isArray(candidate.classes)) return null;

  /*
    A class this app does not carry.

    Everything else here repairs old shapes; this one rejects data. A build
    naming a class that does not exist used to reach the engine, where
    `deriveBuild` looked up the class and used the result without checking -
    and a saved character that throws on render white-screens the app on
    *every* load, because the roster is read from storage at start-up. The
    only way out was clearing site data, which takes the whole roster with it.

    So an unknown class entry is dropped here, and a build left with no classes
    at all is refused, which the roster loader already knows how to skip. It
    happens where a share link came from a build of the app that carried a
    class this one does not, or where a class id is ever renamed. The error
    boundary in `App` is the second half of this: it catches what the check
    below cannot foresee.
  */
  const knownClasses = new Set(CLASSES.map((klass) => klass.id));
  const classes = candidate.classes.filter((entry) => knownClasses.has(entry?.classId));
  if (!classes.length) return null;

  return {
    ...emptyBuild(),
    ...candidate,
    classes,
    // Anything saved before the ruleset switch existed was built under 2014.
    ruleset: candidate.ruleset ?? '2014',
    originFeatIds: candidate.originFeatIds ?? [],
    backgroundAsi: candidate.backgroundAsi ?? { mode: '2+1', picks: [] },
    defenses: { ...defaultDefenses(), ...candidate.defenses },
    // A build saved before weapons existed declared its combat profile
    // directly. Map that to the weapon it described, so the derivation has
    // something to derive from.
    weapons:
      candidate.weapons ??
      weaponsForProfile(
        (candidate as { weaponStyle?: WeaponStyle }).weaponStyle ?? 'str-melee',
        (candidate as { loadout?: Loadout }).loadout ?? 'two-handed',
      ),
    // A build saved before proficiencies existed has no picks recorded. Empty
    // is the honest default: the app does not know what you chose.
    skillIds: candidate.skillIds ?? [],
    // The Defense fighting style used to be a checkbox on defenses; it is a
    // class option now, so a saved tick becomes the option.
    classOptionIds:
      candidate.classOptionIds ??
      ((candidate.defenses as { defenseFightingStyle?: boolean } | undefined)?.defenseFightingStyle
        ? ['defense']
        : []),
    masteryIds: candidate.masteryIds ?? [],
    // Absent on every character built before spell sources were recorded, which
    // is exactly what `sourceForSpell` falls back for.
    spellSources: candidate.spellSources ?? undefined,
    // Absent on anything saved before magic items existed.
    items: candidate.items ?? [],
    spellIds: candidate.spellIds ?? [],
    preparedIds: candidate.preparedIds ?? [],
    combatAssumptions: { ...DEFAULT_ASSUMPTIONS, ...candidate.combatAssumptions },
    expertiseIds: candidate.expertiseIds ?? [],
    toolIds: candidate.toolIds ?? [],
    languages: candidate.languages ?? [],
    // Absent on anything saved before the sheet had boxes to write them in.
    details: { ...emptyDetails(), ...candidate.details },
    // Absent on anything saved before ordinary gear was modelled.
    gear: candidate.gear ?? [],
    coins: { ...emptyCoins(), ...candidate.coins },
  };
}

export function entryFor(build: Build): RosterEntry {
  return { id: newId(), build, updatedAt: Date.now(), play: emptyPlay() };
}

/**
 * A saved encounter, checked against the roster it refers to.
 *
 * A character combatant is a *reference*, so a fight saved before somebody
 * deleted that character carries an id pointing at nothing. Dropping those on
 * load is the same guard `hydrateBuild` applies to an unknown class: a stale
 * reference that reaches the UI is a crash on every load, and the roster is
 * read at start-up, so the only way out would be clearing site data.
 */
function hydrateEncounter(
  parsed: EncounterState | undefined,
  entries: RosterEntry[],
): EncounterState | undefined {
  if (!parsed || !Array.isArray(parsed.combatants)) return undefined;
  const known = new Set(entries.map((e) => e.id));
  const combatants = parsed.combatants.filter(
    (c) => c && (c.kind === 'monster' || known.has(c.rosterId)),
  );
  /*
    An encounter that carries nothing is dropped - but "nothing" changed when
    the map became editable. A DM who spends an evening painting terrain and
    refreshes before adding anybody has an encounter with no combatants that is
    absolutely worth keeping.
  */
  const terrain = hydrateTerrain(parsed.terrain);
  const elevation = hydrateElevation(parsed.elevation);
  if (!combatants.length && !terrain && !elevation && !parsed.mapSeed) return undefined;
  return {
    ...emptyEncounter(),
    ...parsed,
    combatants,
    // Losing a combatant can leave the pointer past the end of the order.
    turnIndex: Math.min(parsed.turnIndex ?? -1, combatants.length - 1),
    // Painted squares, validated key by key - a corrupt kind must not crash
    // the map on every load.
    terrain,
    elevation,
    zones: hydrateZones(parsed.zones),
  };
}

function emptyRoster(): Roster {
  const entry = entryFor(emptyBuild());
  return { entries: [entry], activeId: entry.id };
}

/**
 * The roster, or a one-character roster built from whatever was there before.
 * Never throws and never returns something with no active character, because
 * every caller would otherwise need the same two guards.
 */
export function loadRoster(): Roster {
  try {
    const raw = localStorage.getItem(ROSTER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Roster;
      const entries = (parsed?.entries ?? [])
        .map((entry) => {
          const build = hydrateBuild(entry?.build);
          return build
            ? {
                id: entry.id || newId(),
                build,
                updatedAt: entry.updatedAt || 0,
                // Absent on anything saved before play tracking existed.
                play: { ...emptyPlay(), ...entry.play },
              }
            : null;
        })
        .filter((e): e is RosterEntry => e !== null);

      if (entries.length) {
        const activeId = entries.some((e) => e.id === parsed.activeId)
          ? parsed.activeId
          : entries[0].id;
        return {
          entries,
          activeId,
          // Absent before encounters existed, and hydrated rather than trusted:
          // a saved fight can name a character who has since been deleted.
          encounter: hydrateEncounter(parsed.encounter, entries),
        };
      }
    }

    // No roster yet: adopt the single build the app used to keep, so upgrading
    // does not look like losing your character.
    const legacy = hydrateBuild(JSON.parse(localStorage.getItem(LEGACY_BUILD_KEY) ?? 'null'));
    if (legacy) {
      const entry = entryFor(legacy);
      return { entries: [entry], activeId: entry.id };
    }
  } catch {
    // Corrupt storage, private browsing, a full quota. Start clean rather than
    // refusing to load.
  }
  return emptyRoster();
}

export function saveRoster(roster: Roster): void {
  try {
    localStorage.setItem(ROSTER_KEY, JSON.stringify(roster));
  } catch {
    // Private browsing or a full quota - the app still works, it just forgets.
  }
}

export function activeBuild(roster: Roster): Build {
  return roster.entries.find((e) => e.id === roster.activeId)?.build ?? emptyBuild();
}

/** Record what has been spent, without touching the character itself. */
export function updatePlay(roster: Roster, id: string, play: PlayState): Roster {
  return {
    ...roster,
    entries: roster.entries.map((entry) => (entry.id === id ? { ...entry, play } : entry)),
  };
}

export function activePlay(roster: Roster): PlayState {
  return roster.entries.find((e) => e.id === roster.activeId)?.play ?? emptyPlay();
}

/** Write a change through to the active character, stamping the time. */
export function updateActive(roster: Roster, build: Build): Roster {
  return {
    ...roster,
    entries: roster.entries.map((entry) =>
      entry.id === roster.activeId ? { ...entry, build, updatedAt: Date.now() } : entry,
    ),
  };
}

export function addCharacter(roster: Roster, build: Build): Roster {
  const entry = entryFor(build);
  return { ...roster, entries: [...roster.entries, entry], activeId: entry.id };
}

/**
 * A copy, named so the two are told apart in the list. "Thistle" becomes
 * "Thistle (copy)", and a second copy becomes "Thistle (copy 2)" rather than
 * another entry with an identical name.
 */
export function duplicateCharacter(roster: Roster, id: string): Roster {
  const source = roster.entries.find((e) => e.id === id);
  if (!source) return roster;

  const base = source.build.name || 'Unnamed';
  const taken = new Set(roster.entries.map((e) => e.build.name));
  let name = `${base} (copy)`;
  for (let n = 2; taken.has(name); n++) name = `${base} (copy ${n})`;

  // The copy starts fresh: inheriting "already spent three slots" from the
  // original would be nonsense for a character that has not played yet.
  const entry = entryFor({ ...source.build, name });
  const at = roster.entries.findIndex((e) => e.id === id);
  const entries = [...roster.entries];
  entries.splice(at + 1, 0, entry);
  return { ...roster, entries, activeId: entry.id };
}

/**
 * Removing the last character leaves a fresh one rather than an empty roster,
 * so the Builder always has something to edit.
 */
export function removeCharacter(roster: Roster, id: string): Roster {
  const entries = roster.entries.filter((e) => e.id !== id);
  if (!entries.length) return emptyRoster();
  const activeId = roster.activeId === id ? entries[0].id : roster.activeId;
  /*
    Take them out of the fight too.

    A combatant refers to a character by id and nothing else, so deleting the
    character while they are in an encounter would leave the tracker pointing
    at somebody who no longer exists. `hydrateEncounter` catches that on the
    next load; this catches it now, which is the difference between a row that
    disappears and a row that reads "Unnamed" until you refresh.
  */
  const inFight = roster.encounter?.combatants.find(
    (c) => c.kind === 'character' && c.rosterId === id,
  );
  const encounter = inFight
    ? removeCombatant(roster.encounter!, inFight.id)
    : roster.encounter;

  return { ...roster, entries, activeId, encounter };
}

/** The fight on the table. Absent until somebody starts one. */
export function activeEncounter(roster: Roster): EncounterState {
  return roster.encounter ?? emptyEncounter();
}

export function updateEncounter(roster: Roster, encounter: EncounterState): Roster {
  return { ...roster, encounter };
}

export function renameCharacter(roster: Roster, id: string, name: string): Roster {
  return {
    ...roster,
    entries: roster.entries.map((entry) =>
      entry.id === id ? { ...entry, build: { ...entry.build, name }, updatedAt: Date.now() } : entry,
    ),
  };
}

export { ROSTER_KEY, LEGACY_BUILD_KEY };
