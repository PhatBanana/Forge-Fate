import type { EncounterState } from './encounter';
import { emptyEncounter } from './encounter';
import { hydrateElevation, hydrateTerrain } from './terrain';
import { hydrateZones } from './zones';
import { newId } from './storage';

/**
 * Prepared fights, in their own store.
 *
 * A DM preps four encounters for Saturday; the roster holds the one on the
 * table. This is the drawer the other three wait in - monsters, map seed,
 * terrain, zones, everything - loaded when the party opens that door.
 *
 * Its own `localStorage` key for the bestiary's reason: prep outlives any
 * particular party, and clearing characters must not clear it. Character
 * combatants are saved as the references they are and re-checked against the
 * roster on load, so a fight prepped with last month's party simply loads
 * without the departed.
 */

const ENCOUNTERS_KEY = 'dnd-forge:encounters:v1';

export interface SavedEncounter {
  id: string;
  name: string;
  savedAt: number;
  encounter: EncounterState;
}

/** Never throws; an empty drawer is a valid one. */
export function loadEncounters(): SavedEncounter[] {
  try {
    const raw = localStorage.getItem(ENCOUNTERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { encounters?: unknown[] };
    return (parsed?.encounters ?? [])
      .map(hydrateSaved)
      .filter((e): e is SavedEncounter => e !== null);
  } catch {
    return [];
  }
}

export function saveEncounters(encounters: SavedEncounter[]): void {
  try {
    localStorage.setItem(ENCOUNTERS_KEY, JSON.stringify({ encounters }));
  } catch {
    // Private browsing or a full quota - the app still works, it just forgets.
  }
}

/** The start-up discipline: whole records or nothing. */
function hydrateSaved(parsed: unknown): SavedEncounter | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const raw = parsed as Partial<SavedEncounter>;
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null;
  if (!raw.encounter || !Array.isArray(raw.encounter.combatants)) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    name: raw.name,
    savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : 0,
    encounter: {
      ...emptyEncounter(),
      ...raw.encounter,
      terrain: hydrateTerrain(raw.encounter.terrain),
      elevation: hydrateElevation(raw.encounter.elevation),
      zones: hydrateZones(raw.encounter.zones),
    },
  };
}

/** Save under a name; the same name replaces, which is what re-prep means. */
export function putEncounter(
  list: SavedEncounter[],
  name: string,
  encounter: EncounterState,
): SavedEncounter[] {
  const existing = list.find((e) => e.name === name);
  const entry: SavedEncounter = {
    id: existing?.id ?? newId(),
    name,
    savedAt: Date.now(),
    encounter,
  };
  return existing
    ? list.map((e) => (e.id === existing.id ? entry : e))
    : [...list, entry];
}

export function removeEncounter(list: SavedEncounter[], id: string): SavedEncounter[] {
  return list.filter((e) => e.id !== id);
}

/**
 * A saved fight, made current: back to the top of round nothing, and any
 * character reference the roster no longer holds is dropped - the fight was
 * prepped for a door, not for last month's party.
 */
export function loadIntoPlay(saved: SavedEncounter, knownRosterIds: Set<string>): EncounterState {
  return {
    ...saved.encounter,
    combatants: saved.encounter.combatants.filter(
      (c) => c.kind === 'monster' || knownRosterIds.has(c.rosterId),
    ),
    round: 0,
    turnIndex: -1,
    log: undefined,
  };
}
