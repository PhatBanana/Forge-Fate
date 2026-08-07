import type { EncounterState } from './encounter';
import type { ElevationMap, TerrainMap } from './terrain';
import { hydrateElevation, hydrateTerrain } from './terrain';
import { newId } from './storage';

/**
 * Prepared places, in their own drawer.
 *
 * A dungeon is a place, not a fight: the seed that regenerates its rooms and
 * the terrain painted over them. The Dungeons tab authors these; the battle
 * loads one under whatever fight is on the table. Zones are deliberately not
 * part of the shape - a Wall of Fire is fight state, not architecture - and
 * neither are combatants, initiative or the log.
 *
 * Its own `localStorage` key for the bestiary's reason: a map outlives any
 * particular party or fight, and clearing either must not clear it.
 */

const DUNGEONS_KEY = 'dnd-forge:dungeons:v1';

/** The map fields of an EncounterState, and nothing else. */
export interface DungeonMapFields {
  mapSeed: string;
  mapSize: 'small' | 'medium' | 'large';
  mapRooms: number;
  terrain?: TerrainMap;
  elevation?: ElevationMap;
}

export interface SavedDungeon {
  id: string;
  name: string;
  savedAt: number;
  map: DungeonMapFields;
}

/** Never throws; an empty drawer is a valid one. */
export function loadDungeons(): SavedDungeon[] {
  try {
    const raw = localStorage.getItem(DUNGEONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { dungeons?: unknown[] };
    return (parsed?.dungeons ?? [])
      .map(hydrateSaved)
      .filter((d): d is SavedDungeon => d !== null);
  } catch {
    return [];
  }
}

export function saveDungeons(dungeons: SavedDungeon[]): void {
  try {
    localStorage.setItem(DUNGEONS_KEY, JSON.stringify({ dungeons }));
  } catch {
    // Private browsing or a full quota - the app still works, it just forgets.
  }
}

/** The start-up discipline: whole records or nothing. */
function hydrateSaved(parsed: unknown): SavedDungeon | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const raw = parsed as Partial<SavedDungeon>;
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null;
  const map = raw.map as Partial<DungeonMapFields> | undefined;
  if (!map || typeof map.mapSeed !== 'string' || !map.mapSeed) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    name: raw.name,
    savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : 0,
    map: {
      mapSeed: map.mapSeed,
      mapSize: map.mapSize === 'small' || map.mapSize === 'large' ? map.mapSize : 'medium',
      mapRooms:
        typeof map.mapRooms === 'number' && Number.isFinite(map.mapRooms)
          ? Math.max(0, Math.min(16, Math.round(map.mapRooms)))
          : 8,
      terrain: hydrateTerrain(map.terrain),
      elevation: hydrateElevation(map.elevation),
    },
  };
}

/** Save under a name; the same name replaces, which is what re-prep means. */
export function putDungeon(
  list: SavedDungeon[],
  name: string,
  map: DungeonMapFields,
): SavedDungeon[] {
  const existing = list.find((d) => d.name === name);
  const entry: SavedDungeon = {
    id: existing?.id ?? newId(),
    name,
    savedAt: Date.now(),
    map,
  };
  return existing ? list.map((d) => (d.id === existing.id ? entry : d)) : [...list, entry];
}

export function removeDungeon(list: SavedDungeon[], id: string): SavedDungeon[] {
  return list.filter((d) => d.id !== id);
}

/**
 * A saved dungeon, made the battlefield.
 *
 * The map fields are copied onto the live encounter; everyone comes off the
 * map, because the rooms they stood in are gone from under them. The fog's
 * memory and any standing zones go with the old ground. Combatants, hit
 * points, initiative and the log are untouched - the fight changes venue,
 * it does not restart.
 */
export function applyDungeon(encounter: EncounterState, map: DungeonMapFields): EncounterState {
  return {
    ...encounter,
    mapSeed: map.mapSeed,
    mapSize: map.mapSize,
    mapRooms: map.mapRooms,
    terrain: map.terrain,
    elevation: map.elevation,
    zones: undefined,
    explored: undefined,
    combatants: encounter.combatants.map((c) => ({ ...c, at: undefined })),
  };
}
