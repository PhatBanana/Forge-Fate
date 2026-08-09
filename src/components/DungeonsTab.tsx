import { useEffect, useMemo, useState } from 'react';
import { DungeonMap } from './DungeonMap';
import {
  DEFAULT_SEED,
  MAP_SIZES,
  generateDungeon,
  randomSeed,
} from '../engine/dungeon';
import type { MapSize } from '../engine/dungeon';
import { MAX_SCALE, WHOLE_MAP, clampCamera } from '../engine/camera';
import type { Camera } from '../engine/camera';
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
 *
 * ## §38: a stage, not a page
 *
 * This was the last screen still laid out as a document - a form stacked on
 * top of a map that scrolled below the fold - which is a strange shape for
 * the one desk screen whose subject *is* a map. It is now built the way the
 * battle screen is: the drawing fills the window, and the controls float
 * over it as HUD.
 *
 * The two panels **reserve** their columns rather than covering the map,
 * through the same `--hud-left`/`--hud-right` safe area the battle uses.
 * That is the §36 distinction: a full-width row of chrome above a board is
 * chrome, but a side column you *work in* is a workspace, and every square
 * has to stay clickable in a screen whose whole purpose is painting them.
 *
 * The camera (§34) is plumbed in here for the first time. It was built for
 * exactly this - a big map you want to get close to - and the editor is
 * where getting close matters most, because a brush stroke lands on one
 * square.
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
  /*
    Not persisted with the draft: where you were looking is not part of the
    place you drew. Saving it would mean a dungeon loaded on the battle
    screen arrived pre-zoomed to wherever its author last painted.
  */
  const [camera, setCamera] = useState<Camera>(WHOLE_MAP);

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

  const brushes: { id: TerrainKind | 'raise' | 'lower'; label: string; title: string }[] = [
    ...TERRAIN.map((t) => ({
      id: t.kind,
      label: t.label,
      title: t.blocksSight
        ? `${t.label} — blocks sight`
        : t.difficult
          ? `${t.label} — difficult ground, shown not policed`
          : t.label,
    })),
    { id: 'raise', label: 'Raise +', title: 'Raise a square one step. A ledge is +1.' },
    { id: 'lower', label: 'Lower −', title: 'Lower a square one step. A pit is −1.' },
  ];

  return (
    <div className="dgn">
      <div className="dgn-stage">
        <div className="map-stage">
          <DungeonMap
            dungeon={dungeon}
            terrain={draft.terrain}
            elevation={draft.elevation}
            onPaint={paintAt}
            onHover={setHover}
            cursor={brush ? hover : null}
            camera={camera}
            onCamera={setCamera}
          />
          {/* The same camera cluster the battle screen wears, in the same
              corner, doing the same thing. One control, learnt once. */}
          <div className="hud-cam">
            <div className="hud-cam-row">
              <div className="seg">
                <button
                  type="button"
                  onClick={() => setCamera((c) => clampCamera({ ...c, scale: c.scale / 1.3 }))}
                  disabled={camera.scale <= 1}
                  aria-label="Zoom out"
                >
                  −
                </button>
                <button type="button" onClick={() => setCamera(WHOLE_MAP)} aria-label="Fit the whole map">
                  Fit
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCamera((c) => clampCamera({ ...c, scale: Math.min(MAX_SCALE, c.scale * 1.3) }))
                  }
                  disabled={camera.scale >= MAX_SCALE}
                  aria-label="Zoom in"
                >
                  +
                </button>
              </div>
              <span className="hud-zoom-n">{camera.scale.toFixed(1)}×</span>
            </div>
          </div>

          <div className="hud-legend" aria-hidden="true">
            {brush
              ? 'Click or drag to paint · painting the same thing again removes it'
              : 'Pick a brush to start painting'}
            {' · '}
            right-drag or wheel moves the camera
          </div>
        </div>

        {/*
          The brush rail: the screen's primary verb, so it gets the edge
          nearest the hand and stays put. Vertical because a painting tool
          belongs in a palette, and because a column costs the map less than
          a row - the drawing is wider than it is tall.
        */}
        <aside className="dgn-rail" aria-label="Terrain brushes">
          <h2 className="dgn-rail-title">Brushes</h2>
          {brushes.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`brush ${brush === b.id ? 'is-on' : ''}`}
              aria-pressed={brush === b.id}
              title={b.title}
              onClick={() => setBrush(brush === b.id ? null : b.id)}
            >
              {b.label}
            </button>
          ))}
          {(draft.terrain || draft.elevation) && (
            <button
              type="button"
              className="brush dgn-clear"
              onClick={() =>
                setDraft((prev) => ({ ...prev, terrain: undefined, elevation: undefined }))
              }
            >
              Clear all
            </button>
          )}
        </aside>

        <aside className="dgn-side" aria-label="The dungeon">
          <section className="dgn-panel">
            <h2>The place</h2>
            <p className="dgn-note">
              Generated from a seed, so the same seed always gives the same map. Any text
              works — the name of the place is a better thing to write down than a number.
            </p>
            <label className="dgn-field">
              <span>Seed</span>
              <input
                type="text"
                aria-label="Map seed"
                value={draft.mapSeed}
                onChange={(e) => setDraft((prev) => ({ ...prev, mapSeed: e.target.value }))}
              />
            </label>
            <button
              className="btn btn-sm btn-primary dgn-wide"
              onClick={() => setDraft((prev) => ({ ...prev, mapSeed: randomSeed() }))}
            >
              Another one
            </button>
            <div className="dgn-pair">
              <label className="dgn-field">
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
              <label className="dgn-field">
                <span>Rooms</span>
                <input
                  type="number"
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
            <p className="dgn-note">
              {dungeon.rooms.length === 0
                ? 'A blank grid — paint floor and walls to build your own. Each square is 5 ft.'
                : `${dungeon.rooms.length} rooms · each square is 5 ft.`}
            </p>
          </section>

          <section className="dgn-panel dgn-library">
            <h2>Saved dungeons</h2>
            <p className="dgn-note">
              Named places, kept for the table. The battle screen loads them from its own
              picker.
            </p>
            <label className="dgn-field">
              <span>Name</span>
              <input
                type="text"
                aria-label="Name this dungeon"
                placeholder="the sunken abbey"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button
              className="btn btn-sm btn-primary dgn-wide"
              disabled={!name.trim()}
              onClick={() => setLibrary(putDungeon(library, name.trim(), draft))}
            >
              Save this map
            </button>
            {library.length === 0 ? (
              <p className="dgn-note">Nothing saved yet. Build a place and name it.</p>
            ) : (
              <ul className="dgn-list">
                {library.map((saved) => (
                  <li key={saved.id}>
                    <b>{saved.name}</b>
                    <span className="dgn-meta">
                      seed {saved.map.mapSeed} · {saved.map.mapSize} · {saved.map.mapRooms} rooms
                    </span>
                    <span className="dgn-row-actions">
                      <button
                        className="btn btn-sm"
                        aria-label={`Open ${saved.name}`}
                        title="Bring this dungeon back onto the drawing board"
                        onClick={() => {
                          setDraft(saved.map);
                          setName(saved.name);
                          // A different map is a different board: keep the
                          // camera honest rather than pointing it at squares
                          // the new place may not have.
                          setCamera(WHOLE_MAP);
                        }}
                      >
                        Open
                      </button>
                      <button
                        className="btn btn-sm"
                        aria-label={`Delete ${saved.name}`}
                        onClick={() => setLibrary(removeDungeon(library, saved.id))}
                      >
                        Delete
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
