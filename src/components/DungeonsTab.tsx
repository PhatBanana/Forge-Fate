import { useEffect, useMemo, useState } from 'react';
import { Panel } from './shared';
import { DungeonMap } from './DungeonMap';
import {
  DEFAULT_SEED,
  MAP_SIZES,
  generateDungeon,
  randomSeed,
} from '../engine/dungeon';
import type { MapSize } from '../engine/dungeon';
import { TERRAIN, paint, step } from '../terrain';
import type { TerrainKind } from '../terrain';
import type { Square } from '../encounter';
import {
  loadDungeons,
  putDungeon,
  removeDungeon,
  saveDungeons,
} from '../dungeons';
import type { DungeonMapFields } from '../dungeons';

/**
 * The dungeon workshop - where places are built, away from the fight.
 *
 * Play is for playing: the battle screen loads a finished map and gets on
 * with the combat. This tab owns the making - the seed and its generator,
 * the terrain brushes, the elevation - and a drawer of named dungeons that
 * the battle's "Load a dungeon" picker reads. The draft here is component
 * state, not the roster: nothing about a map-in-progress belongs to any
 * fight, so the one-composed-write discipline the battle lives by does not
 * apply, and paint strokes can use plain functional updates.
 */

export function DungeonsTab() {
  const [library, setLibrary] = useState(loadDungeons);
  useEffect(() => saveDungeons(library), [library]);
  const [name, setName] = useState('');

  const [draft, setDraft] = useState<DungeonMapFields>({
    mapSeed: DEFAULT_SEED,
    mapSize: 'medium',
    mapRooms: 8,
  });
  const [brush, setBrush] = useState<TerrainKind | 'raise' | 'lower' | null>(null);
  const [hover, setHover] = useState<Square | null>(null);

  const dungeon = useMemo(
    () =>
      generateDungeon(draft.mapSeed, {
        rooms: draft.mapRooms,
        ...MAP_SIZES[draft.mapSize],
      }),
    [draft.mapSeed, draft.mapRooms, draft.mapSize],
  );

  // The last mark erased leaves no empty object behind, so "painted at all"
  // stays a truthy question and Clear all appears only when there is
  // something to clear.
  const occupied = <T,>(map: Record<string, T>): Record<string, T> | undefined =>
    Object.keys(map).length ? map : undefined;

  const paintAt = (at: Square) => {
    if (!brush) return;
    setDraft((prev) =>
      brush === 'raise' || brush === 'lower'
        ? {
            ...prev,
            elevation: occupied(step(prev.elevation ?? {}, at, brush === 'raise' ? 1 : -1)),
          }
        : { ...prev, terrain: occupied(paint(prev.terrain ?? {}, at, brush)) },
    );
  };

  return (
    <div className="stack">
      <Panel
        title="A dungeon"
        subtitle="Generated from a seed, so the same seed always gives the same map. Save it under a name and the battle screen can load it."
      >
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          <label className="checkbox">
            <span>Seed</span>
            <input
              type="text"
              className="detail"
              aria-label="Map seed"
              value={draft.mapSeed}
              onChange={(e) => setDraft((prev) => ({ ...prev, mapSeed: e.target.value }))}
            />
          </label>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => setDraft((prev) => ({ ...prev, mapSeed: randomSeed() }))}
          >
            Another one
          </button>
          <label className="checkbox">
            <span>Size</span>
            <select
              aria-label="Map size"
              value={draft.mapSize}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, mapSize: e.target.value as MapSize }))
              }
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </label>
          <label className="checkbox">
            <span>Rooms</span>
            <input
              type="number"
              className="qty"
              min={0}
              max={16}
              aria-label="How many rooms — zero is a blank grid to build on"
              value={draft.mapRooms}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  mapRooms: Math.max(0, Math.min(16, Math.round(Number(e.target.value) || 0))),
                }))
              }
            />
          </label>
        </div>

        <p className="muted" style={{ margin: '0 0 8px' }}>
          {dungeon.rooms.length === 0
            ? 'A blank grid - paint floor and walls to build your own. Each square is 5 ft.'
            : `${dungeon.rooms.length} rooms · each square is 5 ft.`}
        </p>

        {/*
          The brushes. Painting the same kind onto a square erases it, so the
          common fix - "not there" - needs no trip back to an eraser. Raise
          and Lower are the Z axis: a ledge is +1, a pit is -1, and what a
          step means in feet is the table's call, not the map's.
        */}
        <div className="terrain-kit" role="group" aria-label="Terrain brushes">
          {TERRAIN.map((t) => (
            <button
              key={t.kind}
              type="button"
              className={`brush ${brush === t.kind ? 'is-on' : ''}`}
              aria-pressed={brush === t.kind}
              title={
                t.blocksSight
                  ? `${t.label} — blocks sight`
                  : t.difficult
                    ? `${t.label} — difficult ground, shown not policed`
                    : t.label
              }
              onClick={() => setBrush(brush === t.kind ? null : t.kind)}
            >
              {t.label}
            </button>
          ))}
          <button
            type="button"
            className={`brush ${brush === 'raise' ? 'is-on' : ''}`}
            aria-pressed={brush === 'raise'}
            title="Raise a square one step. A ledge is +1."
            onClick={() => setBrush(brush === 'raise' ? null : 'raise')}
          >
            Raise +
          </button>
          <button
            type="button"
            className={`brush ${brush === 'lower' ? 'is-on' : ''}`}
            aria-pressed={brush === 'lower'}
            title="Lower a square one step. A pit is −1."
            onClick={() => setBrush(brush === 'lower' ? null : 'lower')}
          >
            Lower −
          </button>
          {(draft.terrain || draft.elevation) && (
            <button
              type="button"
              className="brush"
              onClick={() =>
                setDraft((prev) => ({ ...prev, terrain: undefined, elevation: undefined }))
              }
            >
              Clear all
            </button>
          )}
        </div>
        {brush && (
          <p className="muted" style={{ margin: '0 0 8px' }}>
            Click or drag on the map to paint. Painting the same thing again removes it.
          </p>
        )}

        <div className="map-stage">
          <DungeonMap
            dungeon={dungeon}
            terrain={draft.terrain}
            elevation={draft.elevation}
            onPaint={paintAt}
            onHover={setHover}
            cursor={brush ? hover : null}
          />
        </div>

        <p className="muted" style={{ marginTop: 8 }}>
          Any text works as a seed - the name of the place is a better thing to
          write down than a number.
        </p>
      </Panel>

      <Panel
        title="Saved dungeons"
        subtitle="Named places, kept for the table. The battle screen loads them from its own picker."
      >
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <input
            type="text"
            className="detail"
            aria-label="Name this dungeon"
            placeholder="the sunken abbey"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="btn btn-sm btn-primary"
            disabled={!name.trim()}
            onClick={() => {
              setLibrary(putDungeon(library, name.trim(), draft));
            }}
          >
            Save
          </button>
        </div>
        {library.length === 0 && (
          <p className="muted">Nothing saved yet. Build a place and name it.</p>
        )}
        {library.map((saved) => (
          <p key={saved.id} className="zone-row">
            <button
              className="btn btn-sm"
              aria-label={`Open ${saved.name}`}
              title="Bring this dungeon back onto the drawing board"
              onClick={() => {
                setDraft(saved.map);
                setName(saved.name);
              }}
            >
              Open
            </button>{' '}
            <button
              className="btn btn-sm"
              aria-label={`Delete ${saved.name}`}
              onClick={() => setLibrary(removeDungeon(library, saved.id))}
            >
              Delete
            </button>{' '}
            <b>{saved.name}</b>
            <span className="src">
              {' '}
              · seed {saved.map.mapSeed} · {saved.map.mapSize} · {saved.map.mapRooms} rooms
            </span>
          </p>
        ))}
      </Panel>
    </div>
  );
}
