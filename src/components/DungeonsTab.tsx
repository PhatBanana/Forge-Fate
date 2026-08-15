import { useEffect, useMemo, useState } from 'react';
import { ConfirmButton } from './shared';
import { DungeonMap } from './DungeonMap';
import { toggleHidden, toggleTrap } from '../engine/furniture';
import type { Token } from './DungeonMap';
import { loadBestiary, mergeBestiary } from '../bestiary';
import { searchMonsters } from '../data/monsters';
import { useMonsters } from './useMonsters';
import {
  DEFAULT_SEED,
  MAP_SIZES,
  addCorridorPath,
  addRoom,
  corridorSquares,
  dungeonFrom,
  layoutOf,
  randomSeed,
  removeCorridorAt,
  removeRoomAt,
  cycleDoor,
} from '../engine/dungeon';
import type { DungeonLayout, MapSize } from '../engine/dungeon';
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

export function DungeonsTab({
  onBattle,
}: {
  /**
   * §77: take this saved map straight to the battle screen. The app's
   * flagship loop - draw a place, save it, fight in it - used to end at a
   * note saying the battle screen has a picker, four screens away. This is
   * the door.
   */
  onBattle?: (dungeonId: string) => void;
} = {}) {
  const [library, setLibrary] = useState(loadDungeons);
  useEffect(() => saveDungeons(library), [library]);
  const [name, setName] = useState('');
  /* §76: saving used to be silent - the row appears in the list below, but
     the eye is on the button. The label answers for a moment instead, the
     same way "Copy share link" answers with "Link copied". */
  const [justSaved, setJustSaved] = useState(false);

  const [draft, setDraft] = useState<DungeonMapFields>({
    mapSeed: DEFAULT_SEED,
    mapSize: 'medium',
    mapRooms: 8,
  });
  const [brush, setBrush] = useState<
    | TerrainKind
    | 'raise'
    | 'lower'
    | 'room'
    | 'corridor'
    | 'door'
    | 'hidden'
    | 'trap'
    | 'erase-arch'
    | 'monster'
    | null
  >(null);
  /** §81: what the next trap gets written on it. One box, reused per stamp. */
  const [trapNote, setTrapNote] = useState('');
  const [hover, setHover] = useState<Square | null>(null);
  /*
    §73: a two-corner tool mid-gesture. The room and corridor tools anchor on
    the first painted square, stretch with the stroke, and commit on release
    - the map's onPaintEnd. Held as state (not a ref) because the ghost
    preview renders from it.
  */
  const [anchor, setAnchor] = useState<Square | null>(null);
  const [stretch, setStretch] = useState<Square | null>(null);
  /*
    §74: the monster in hand. Picking one from the Denizens panel arms the
    stamp - each map click stands one on that square. The catalogue is the
    battle's own merged list, bestiary first.
  */
  const { monsters: srd } = useMonsters();
  const bestiary = useMemo(() => loadBestiary(), []);
  const monsters = useMemo(() => mergeBestiary(bestiary, srd), [bestiary, srd]);
  const monstersById = useMemo(() => new Map(monsters.map((m) => [m.id, m])), [monsters]);
  const [stamp, setStamp] = useState<string | null>(null);
  const [monsterQuery, setMonsterQuery] = useState('');
  /*
    Not persisted with the draft: where you were looking is not part of the
    place you drew. Saving it would mean a dungeon loaded on the battle
    screen arrived pre-zoomed to wherever its author last painted.
  */
  const [camera, setCamera] = useState<Camera>(WHOLE_MAP);

  const dungeon = useMemo(
    () => dungeonFrom(draft.mapSeed, draft.mapSize, draft.mapRooms, draft.layout),
    [draft.mapSeed, draft.mapRooms, draft.mapSize, draft.layout],
  );
  const bounds = MAP_SIZES[draft.mapSize];

  /*
    §73: the first architectural edit materialises the generated layout into
    the draft, and from then on the rooms are values being edited rather than
    consequences of a seed. The generator is one way to start; the layout is
    what you keep.
  */
  /*
    Always through `prev`, never the render's draft: a drag can land several
    edits in one React batch, and reading the render's layout would hand each
    of them the same starting point - only the last would survive.
  */
  const editable = (prev: DungeonMapFields): DungeonLayout => prev.layout ?? layoutOf(dungeon);

  // The last mark erased leaves no empty object behind, so "painted at all"
  // stays a truthy question and Clear all appears only when there is
  // something to clear.
  const occupied = <T,>(map: Record<string, T>): Record<string, T> | undefined =>
    Object.keys(map).length ? map : undefined;

  const paintAt = (at: Square) => {
    if (!brush) return;
    // §73: the architecture tools. Room and corridor stretch from an anchor
    // and commit on release; door and erase act square by square.
    if (brush === 'room' || brush === 'corridor') {
      if (!anchor) setAnchor(at);
      setStretch(at);
      return;
    }
    if (brush === 'monster') {
      if (!stamp) return;
      setDraft((prev) => ({
        ...prev,
        denizens: [...(prev.denizens ?? []), { monsterId: stamp, at }],
      }));
      return;
    }
    if (brush === 'door') {
      setDraft((prev) => ({ ...prev, layout: cycleDoor(editable(prev), at) }));
      return;
    }
    /*
      §81. Hidden takes the room under the click; a trap takes the square
      itself, which is why it is legal on bare corridor floor where a door
      is not. The note is whatever is in the box beside the tool - the DM's
      own words, since there is no trap table to read a number out of.
    */
    if (brush === 'hidden') {
      setDraft((prev) => ({ ...prev, layout: toggleHidden(editable(prev), at) }));
      return;
    }
    if (brush === 'trap') {
      setDraft((prev) => ({ ...prev, layout: toggleTrap(editable(prev), at, trapNote) }));
      return;
    }
    if (brush === 'erase-arch') {
      setDraft((prev) => {
        // A denizen standing on the square goes first - it is the thing on
        // top - then the architecture underneath.
        const standing = (prev.denizens ?? []).findIndex(
          (d) => d.at && d.at.x === at.x && d.at.y === at.y,
        );
        if (standing >= 0) {
          const denizens = (prev.denizens ?? []).filter((_, i) => i !== standing);
          return { ...prev, denizens: denizens.length ? denizens : undefined };
        }
        const layout = editable(prev);
        const hadDoor = layout.doors.some((d) => d.x === at.x && d.y === at.y);
        const next = hadDoor
          ? { ...layout, doors: layout.doors.filter((d) => !(d.x === at.x && d.y === at.y)) }
          : removeRoomAt(layout, at) !== layout
            ? removeRoomAt(layout, at)
            : removeCorridorAt(layout, at);
        return { ...prev, layout: next };
      });
      return;
    }
    setDraft((prev) =>
      brush === 'raise' || brush === 'lower'
        ? {
            ...prev,
            elevation: occupied(step(prev.elevation ?? {}, at, brush === 'raise' ? 1 : -1)),
          }
        : { ...prev, terrain: occupied(paint(prev.terrain ?? {}, at, brush)) },
    );
  };

  /* The release that commits a stretched room or corridor. */
  const paintEnd = () => {
    if (!anchor) return;
    const from = anchor;
    const to = stretch ?? anchor;
    setAnchor(null);
    setStretch(null);
    if (brush === 'room') {
      setDraft((prev) => ({ ...prev, layout: addRoom(editable(prev), from, to, bounds) }));
    } else if (brush === 'corridor') {
      setDraft((prev) => ({ ...prev, layout: addCorridorPath(editable(prev), from, to) }));
    }
  };

  /* §74: placed denizens stand on the editor map as monster tokens. */
  const denizenTokens = useMemo<Token[]>(
    () =>
      (draft.denizens ?? [])
        .filter((d) => d.at)
        .map((d, index) => {
          const name = monstersById.get(d.monsterId)?.name ?? d.monsterId;
          return {
            id: `dz${index}`,
            label: name.slice(0, 2).toUpperCase(),
            at: d.at!,
            kind: 'monster' as const,
            title: name,
          };
        }),
    [draft.denizens, monstersById],
  );

  /* The ghost of the room or corridor being stretched, drawn as a zone. */
  const ghost = useMemo(() => {
    if (!anchor || !brush) return [];
    const to = stretch ?? anchor;
    const squares: Square[] = [];
    if (brush === 'room') {
      for (let x = Math.min(anchor.x, to.x); x <= Math.max(anchor.x, to.x); x++) {
        for (let y = Math.min(anchor.y, to.y); y <= Math.max(anchor.y, to.y); y++) {
          squares.push({ x, y });
        }
      }
    } else if (brush === 'corridor') {
      squares.push(...corridorSquares({ points: [anchor, { x: to.x, y: anchor.y }, to] }));
    } else {
      return [];
    }
    return [
      { id: 'ghost', label: brush === 'room' ? 'New room' : 'New corridor', tint: 2, origin: anchor, squares, ghost: true },
    ];
  }, [anchor, stretch, brush]);

  const architecture: {
    id: 'room' | 'corridor' | 'door' | 'hidden' | 'trap' | 'erase-arch';
    label: string;
    title: string;
  }[] = [
    { id: 'room', label: 'Room', title: 'Drag a rectangle to add a room. A single square is a closet.' },
    { id: 'corridor', label: 'Corridor', title: 'Drag from one square to another; the corridor takes an L, doors appear where it meets rooms.' },
    { id: 'door', label: 'Door', title: 'Click a square inside a room: once for a door, again to bar it, again to take it away.' },
    { id: 'hidden', label: 'Hidden', title: 'Click a room to hide it. A hidden room is not on the battle map at all until you reveal it there.' },
    { id: 'trap', label: 'Trap', title: 'Click any square to arm or disarm a trap. It is invisible on the battle map until somebody walks onto it.' },
    { id: 'erase-arch', label: 'Erase', title: 'Click to remove — a door first, then the room under the click, then any corridor through it.' },
  ];

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
            /* §81: the author's view - hidden rooms dashed, every trap marked.
               The battle screen passes nothing and sees what the table sees. */
            authoring
            tokens={denizenTokens}
            terrain={draft.terrain}
            elevation={draft.elevation}
            zones={ghost}
            onPaint={paintAt}
            onPaintEnd={paintEnd}
            onHover={setHover}
            cursor={brush ? hover : null}
            camera={camera}
            onCamera={setCamera}
          />
          {/* §77: honestly, a *subset* of the battle screen's camera cluster -
              zoom only. The battle adds Plan/Tactical, Rotate and Classic,
              plus WASD/Q/E keys; the editor is one top-down drawing surface,
              so those controls have nothing here to control. Full parity is
              a roadmap question, not a fact this comment gets to claim. */}
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

          {/* §79: no longer aria-hidden - the tool guidance changes with the
              brush, and role="status" announces the change instead of
              keeping the instructions from the people who cannot hover. */}
          <div className="hud-legend" role="status">
            {brush === 'monster'
              ? 'Click the map to stand the picked monster there · one per click'
              : brush === 'room' || brush === 'corridor'
              ? 'Drag from corner to corner · release to place it'
              : brush === 'door'
                ? 'Click inside a room to place or remove a door'
                : brush === 'hidden'
                  ? 'Click a room to hide it from the battle map · click again to unhide'
                : brush === 'trap'
                  ? 'Click any square to arm a trap · click it again to disarm'
                : brush === 'erase-arch'
                  ? 'Click a door, room or corridor to remove it'
                  : brush
                    ? 'Click or drag to paint · painting the same thing again removes it'
                    : 'Pick a tool to start building'}
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
          <h2 className="dgn-rail-title">Rooms</h2>
          {architecture.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`brush ${brush === b.id ? 'is-on' : ''}`}
              aria-pressed={brush === b.id}
              title={b.title}
              onClick={() => {
                setAnchor(null);
                setStretch(null);
                setBrush(brush === b.id ? null : b.id);
              }}
            >
              {b.label}
            </button>
          ))}
          {/*
            §81: the note rides with the tool rather than opening a dialog per
            trap. A DM arming six darts down a corridor types "poison dart, DC
            15 Dex, 2d4" once and clicks six times, which is the shape the
            work actually has.
          */}
          {brush === 'trap' && (
            <label className="dgn-note">
              <span>What it does</span>
              <input
                type="text"
                value={trapNote}
                placeholder="scything blade, DC 15 Dex"
                onChange={(e) => setTrapNote(e.target.value)}
              />
            </label>
          )}
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
            /* §76: this wore the brush costume, sitting in the rail styled
               like one more tool to try - and it erased every painted square
               and every raised floor on the first click, with no undo. Now
               it dresses as the destructive act it is, and asks first. */
            <ConfirmButton
              label="Clear all"
              confirmLabel="Really clear"
              className="dgn-clear"
              title="Erase all painted terrain and elevation"
              onConfirm={() =>
                setDraft((prev) => ({ ...prev, terrain: undefined, elevation: undefined }))
              }
            />
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
                disabled={!!draft.layout}
                onChange={(e) => setDraft((prev) => ({ ...prev, mapSeed: e.target.value }))}
              />
            </label>
            <button
              className="btn btn-sm btn-primary dgn-wide"
              disabled={!!draft.layout}
              onClick={() => setDraft((prev) => ({ ...prev, mapSeed: randomSeed() }))}
            >
              Another one
            </button>
            <div className="dgn-pair">
              <label className="dgn-field">
                <span>Size</span>
                <select
                  aria-label="Map size"
                  disabled={!!draft.layout}
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
                  disabled={!!draft.layout}
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
              {draft.layout
                ? `Hand-built — ${dungeon.rooms.length} ${dungeon.rooms.length === 1 ? 'room' : 'rooms'}, yours to edit. The seed no longer applies.`
                : dungeon.rooms.length === 0
                  ? 'A blank grid — draw rooms with the Room tool, or paint floor square by square. Each square is 5 ft.'
                  : `${dungeon.rooms.length} rooms · each square is 5 ft. The first Room, Door or Erase stroke makes them yours to edit.`}
            </p>
            {draft.layout && (
              <button
                className="btn btn-sm dgn-wide"
                title="Drop the hand-built layout and let the seed generate again"
                onClick={() => setDraft((prev) => ({ ...prev, layout: undefined }))}
              >
                Back to the generator
              </button>
            )}
          </section>

          <section className="dgn-panel">
            <h2>Denizens</h2>
            <p className="dgn-note">
              The monsters that live here, saved with the place. Pick one, then click the
              map to stand it on a square — or add it as a wanderer, placed with the rest
              when the battle deploys.
            </p>
            <label className="dgn-field">
              <span>Monster</span>
              <input
                type="text"
                aria-label="Search monsters"
                placeholder="goblin"
                value={monsterQuery}
                onChange={(e) => setMonsterQuery(e.target.value)}
              />
            </label>
            {monsterQuery.trim() && (
              <ul className="dgn-list">
                {searchMonsters(monsters, monsterQuery).slice(0, 6).map((m) => (
                  <li key={m.id}>
                    <b>{m.name}</b>
                    <span className="dgn-row-actions">
                      <button
                        className={`btn btn-sm ${stamp === m.id && brush === 'monster' ? 'btn-primary' : ''}`}
                        aria-pressed={stamp === m.id && brush === 'monster'}
                        title="Arm the stamp, then click the map to place one per click"
                        onClick={() => {
                          setAnchor(null);
                          setStretch(null);
                          if (stamp === m.id && brush === 'monster') {
                            setBrush(null);
                            setStamp(null);
                          } else {
                            setStamp(m.id);
                            setBrush('monster');
                          }
                        }}
                      >
                        Place
                      </button>
                      <button
                        className="btn btn-sm"
                        title="A wanderer: loaded off-map, scattered across the rooms when the battle deploys"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            denizens: [...(prev.denizens ?? []), { monsterId: m.id }],
                          }))
                        }
                      >
                        Wander
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {(draft.denizens ?? []).length > 0 && (
              <ul className="dgn-list">
                {(draft.denizens ?? []).map((d, index) => (
                  <li key={index}>
                    <b>{monstersById.get(d.monsterId)?.name ?? d.monsterId}</b>
                    <span className="dgn-meta">
                      {d.at ? `standing at ${d.at.x},${d.at.y}` : 'wandering — placed on deploy'}
                    </span>
                    <span className="dgn-row-actions">
                      <button
                        className="btn btn-sm"
                        aria-label={`Remove this ${monstersById.get(d.monsterId)?.name ?? d.monsterId}`}
                        onClick={() =>
                          setDraft((prev) => {
                            const denizens = (prev.denizens ?? []).filter((_, i) => i !== index);
                            return { ...prev, denizens: denizens.length ? denizens : undefined };
                          })
                        }
                      >
                        Remove
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
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
              onClick={() => {
                setLibrary(putDungeon(library, name.trim(), draft));
                setJustSaved(true);
                setTimeout(() => setJustSaved(false), 2500);
              }}
            >
              {justSaved ? 'Saved' : 'Save this map'}
            </button>
            {library.length === 0 ? (
              <p className="dgn-note">Nothing saved yet. Build a place and name it.</p>
            ) : (
              <ul className="dgn-list">
                {library.map((saved) => (
                  <li key={saved.id}>
                    <b>{saved.name}</b>
                    <span className="dgn-meta">
                      {saved.map.layout
                        ? `hand-built · ${saved.map.layout.rooms.length} rooms · ${saved.map.mapSize}`
                        : `seed ${saved.map.mapSeed} · ${saved.map.mapSize} · ${saved.map.mapRooms} rooms`}
                      {saved.map.denizens?.length
                        ? ` · ${saved.map.denizens.length} ${saved.map.denizens.length === 1 ? 'denizen' : 'denizens'}`
                        : ''}
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
                      {onBattle && (
                        <button
                          className="btn btn-sm btn-primary"
                          aria-label={`Use ${saved.name} in a battle`}
                          title="Open the battle screen with this map loaded"
                          onClick={() => onBattle(saved.id)}
                        >
                          Use in a battle
                        </button>
                      )}
                      {/* §76: asked-for, like a character's delete always
                          was. A saved dungeon can be hours of drawing. */}
                      <ConfirmButton
                        label="Delete"
                        confirmLabel="Really delete"
                        ariaLabel={`Delete ${saved.name}`}
                        onConfirm={() => setLibrary(removeDungeon(library, saved.id))}
                      />
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
