import { addMonster, placeCombatant } from './encounter';
import type { EncounterState, Square } from './encounter';
import type { Monster } from './data/monsters';
import type { DungeonLayout } from './engine/dungeon';
import { hydrateLayout } from './engine/dungeon';
import type { ElevationMap, TerrainMap } from './terrain';
import { hydrateElevation, hydrateTerrain } from './terrain';
import { newId } from './storage';
import { read, write } from './persist';

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
  /** §73: a hand-built architecture. Present, it wins over the generator. */
  layout?: DungeonLayout;
  /**
   * §74: the monsters that live here, saved with the place. An entry with a
   * square is a body standing on it; one without is a wanderer - loaded
   * placeless, so "Put everyone on the map" scatters it across the rooms
   * with the rest of the deployment. One list, both authoring styles.
   */
  denizens?: DungeonDenizen[];
}

export interface DungeonDenizen {
  monsterId: string;
  at?: Square;
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
    const raw = read(DUNGEONS_KEY);
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
    write(DUNGEONS_KEY, JSON.stringify({ dungeons }));
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
      layout: hydrateLayout(map.layout) ?? undefined,
      denizens: hydrateDenizens(map.denizens),
    },
  };
}

/** §74: stored denizens, believed only as far as they verify. */
function hydrateDenizens(raw: unknown): DungeonDenizen[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const kept = raw.filter((d): d is DungeonDenizen => {
    if (!d || typeof d === 'string' || typeof d !== 'object') return false;
    const entry = d as Partial<DungeonDenizen>;
    if (typeof entry.monsterId !== 'string' || !entry.monsterId) return false;
    return entry.at === undefined || (num(entry.at?.x) && num(entry.at?.y));
  });
  return kept.length ? kept : undefined;
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
export function applyDungeon(
  encounter: EncounterState,
  map: DungeonMapFields,
  /**
   * §74: how a denizen's id becomes a stat block - the battle passes its
   * merged bestiary. Without a resolver (or for an id it cannot answer,
   * say a bestiary monster deleted since the map was saved) the denizen is
   * skipped rather than spawned broken.
   */
  resolveMonster?: (id: string) => Monster | undefined,
): EncounterState {
  let next: EncounterState = {
    ...encounter,
    mapSeed: map.mapSeed,
    mapSize: map.mapSize,
    mapRooms: map.mapRooms,
    mapLayout: map.layout,
    terrain: map.terrain,
    elevation: map.elevation,
    zones: undefined,
    explored: undefined,
    combatants: encounter.combatants.map((c) => ({ ...c, at: undefined })),
  };
  for (const denizen of map.denizens ?? []) {
    const monster = resolveMonster?.(denizen.monsterId);
    if (!monster) continue;
    // The id addMonster will mint, taken before it does - placement needs it.
    const id = `m${next.nextSeq}`;
    next = addMonster(next, monster);
    if (denizen.at) next = placeCombatant(next, id, denizen.at);
  }
  return next;
}
