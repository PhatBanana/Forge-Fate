import { useRef } from 'react';
import type { CSSProperties } from 'react';
import { corridorSquares } from '../engine/dungeon';
import type { Dungeon } from '../engine/dungeon';
import type { Square } from '../encounter';
import { toUserSpace, viewBoxAttr } from '../engine/letterbox';
import type { ViewBox } from '../engine/letterbox';
import type { Camera, Frame } from '../engine/camera';
import { useMapCamera } from './useMapCamera';
import { squareOf } from '../terrain';
import type { ElevationMap, TerrainKind, TerrainMap } from '../terrain';

/**
 * A dungeon, drawn.
 *
 * SVG rather than canvas, for three reasons that all come from the same place:
 * this is a thing a DM prints. It scales to any paper size without going soft,
 * it is in the DOM so a screen reader has something to read and the browser can
 * search it, and it needs no `ref`, no resize handler and no redraw on a theme
 * change. A canvas would need all four and print at whatever pixel density it
 * happened to be laid out at.
 *
 * Ink on paper in both themes, like the character sheet and the stat block, and
 * for the same reason: it goes on the table.
 *
 * **Each square is 5 feet**, so the grid is the distance rule rather than
 * decoration - which is what lets a dragged token report how far it went.
 */

export interface Token {
  id: string;
  /** One or two characters. A grid square is small and a name will not fit. */
  label: string;
  at: Square;
  kind: 'character' | 'monster';
  /** Whose turn it is, drawn so it can be picked out at a glance. */
  active?: boolean;
  /** At nought hit points. */
  down?: boolean;
  /** At or under half - the word every table uses. */
  bloodied?: boolean;
  /** Bumped each time damage lands, so the hit animation replays. */
  flash?: number;
  /** "72%" while an attack is aimed at this token - X-COM's number. */
  odds?: string;
  /** The last hit-point change, floated off the token: "-7" red, "+5" green.
      The seq replays the animation on each new change. */
  float?: { seq: number; text: string; heal?: boolean };
  /** Conditions on this combatant, shortened for the space over a head. */
  conditions?: { short: string; name: string }[];
  /** Hiding: drawn translucent and dashed, the way a plan drawing marks
      what is there but not seen. */
  hiding?: boolean;
  /** A click on this token would be an attack: the cursor says crosshair,
      not grab-hand - which is how the player knows before committing. */
  targetable?: boolean;
  /** The character's face, if they have one. The flat map ignores it - a
      14px disc has no room - but the tactical view stands the token up as a
      cardboard pawn and puts the portrait on the card (§37). */
  portrait?: string;
  /**
   * §67: which class sprite the PS1 view stands up for this token, and in
   * what pose. Characters only - monsters keep their cards. Both maps other
   * than the GL one ignore these, and a recorded `portrait` outranks the
   * sprite: somebody's own art beats the house silhouette.
   */
  classId?: string;
  stance?: 'idle' | 'battle' | 'sneak' | 'down';
  /**
   * §68: bumped when this token attacks, with where the swing went - the GL
   * view lunges the sprite toward it. The SVG views ignore it, the same way
   * the flat map ignores the portrait.
   */
  lunge?: { seq: number; toward: Square };
  /**
   * §69: bumped when this token walks, with the route it took - the GL view
   * marches the sprite along it, tile by tile, instead of teleporting.
   * `slide` marks forced movement (a shove, being dragged): the body glides
   * flat instead of hopping. The SVG views ignore it.
   */
  walk?: { seq: number; route: Square[]; slide?: boolean };
  title: string;
}

/** Pixels per grid square in the drawing's own coordinates. */
const CELL = 14;

/**
 * The outline around a set of squares: every tile edge not shared with
 * another tile in the set, as one path. This is X-COM's move perimeter -
 * the wash says "roughly here", the line says "exactly this far".
 */
function perimeterPath(cells: Square[]): string {
  const set = new Set(cells.map((c) => `${c.x},${c.y}`));
  const parts: string[] = [];
  for (const c of cells) {
    const x = c.x * CELL;
    const y = c.y * CELL;
    if (!set.has(`${c.x},${c.y - 1}`)) parts.push(`M ${x} ${y} H ${x + CELL}`);
    if (!set.has(`${c.x},${c.y + 1}`)) parts.push(`M ${x} ${y + CELL} H ${x + CELL}`);
    if (!set.has(`${c.x - 1},${c.y}`)) parts.push(`M ${x} ${y} V ${y + CELL}`);
    if (!set.has(`${c.x + 1},${c.y}`)) parts.push(`M ${x + CELL} ${y} V ${y + CELL}`);
  }
  return parts.join(' ');
}

/**
 * One square's worth of terrain, drawn in the map's ink.
 *
 * Glyphs rather than icons: a pillar is a filled circle, a tree a canopy ring,
 * rubble a scatter of dots - the marks a DM makes on graph paper, which is the
 * register the whole map draws in. Each carries a `<title>` so hovering
 * (and a screen reader) says what the mark means.
 */
function TerrainGlyph({ at, kind }: { at: Square; kind: TerrainKind }) {
  const x = at.x * CELL;
  const y = at.y * CELL;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;

  const body = (() => {
    switch (kind) {
      case 'wall':
        return <rect className="dmap-t-wall" x={x} y={y} width={CELL} height={CELL} />;
      case 'floor':
        return <rect className="dmap-t-floor" x={x} y={y} width={CELL} height={CELL} />;
      case 'water':
        return (
          <g>
            <rect className="dmap-t-water" x={x} y={y} width={CELL} height={CELL} />
            <path
              className="dmap-t-wave"
              d={`M ${x + 2} ${cy} q 2.5 -2.5 5 0 t 5 0`}
              fill="none"
            />
          </g>
        );
      case 'pillar':
        return <circle className="dmap-t-pillar" cx={cx} cy={cy} r={CELL * 0.3} />;
      case 'rock':
        return (
          <polygon
            className="dmap-t-rock"
            points={`${cx - 4},${cy + 3} ${cx - 1},${cy - 4} ${cx + 3},${cy - 2} ${cx + 4},${cy + 3}`}
          />
        );
      case 'tree':
        return (
          <g>
            <circle className="dmap-t-tree" cx={cx} cy={cy} r={CELL * 0.38} />
            <circle className="dmap-t-trunk" cx={cx} cy={cy} r={1.4} />
          </g>
        );
      case 'rubble':
        return (
          <g className="dmap-t-rubble">
            <circle cx={cx - 3} cy={cy + 2} r={1.2} />
            <circle cx={cx + 1} cy={cy - 2} r={1.5} />
            <circle cx={cx + 3} cy={cy + 3} r={1} />
          </g>
        );
    }
  })();

  return (
    <g className="dmap-terrain">
      <title>{kind[0].toUpperCase() + kind.slice(1)}</title>
      {body}
    </g>
  );
}

export function DungeonMap({
  dungeon,
  tokens = [],
  terrain = {},
  elevation = {},
  sight = [],
  zones = [],
  reach = [],
  cursor = null,
  note,
  noteAt = null,
  ruler = null,
  arc = null,
  fog = null,
  gloom,
  onMove,
  onPaint,
  onHover,
  onTokenClick,
  onTokenOpen,
  camera,
  onCamera,
  focus = null,
}: {
  dungeon: Dungeon;
  tokens?: Token[];
  /** What the DM painted onto squares. See `terrain.ts`. */
  terrain?: TerrainMap;
  /** Z per square, in steps. Level 0 is the floor and is not stored. */
  elevation?: ElevationMap;
  /** Sight lines from the selected combatant, drawn over everything. */
  sight?: { from: Square; to: Square; visible: boolean }[];
  /** Areas of effect, squares precomputed so the map stays a drawing. */
  zones?: {
    id: string;
    label: string;
    tint: number;
    origin: Square;
    squares: Square[];
    /** A footprint being previewed, not a zone that exists. */
    ghost?: boolean;
  }[];
  /** Squares the selected combatant can still reach, washed under the tokens.
      The dash tier is what a Dash would add, drawn apart. */
  reach?: { at: Square; dash?: boolean }[];
  /** The hovered square, outlined while a tool is armed. */
  cursor?: Square | null;
  /** One short line - the ruler, mostly. Rides `noteAt` when given. */
  note?: string;
  /** Where the note floats: over this square, clamped inside the drawing.
      Without it the note sits in the top-left corner. */
  noteAt?: Square | null;
  /** The measurement being read: the walked route, origin to cursor. */
  ruler?: { points: Square[] } | null;
  /** The lob being aimed: caster to cursor, drawn as X-COM draws a grenade. */
  arc?: { from: Square; to: Square } | null;
  /** Fog of war: what the party sees now, and what it has seen before.
      Squares in neither set are dark; explored-but-unseen are dim. */
  fog?: { visible: Set<string>; explored: Set<string> } | null;
  /**
   * How dark each square is, by key - only the ones that are not bright, so
   * a fully lit map hands over an empty object and draws nothing.
   *
   * Under the fog rather than over it: the fog is what the party *knows*
   * and the gloom is what is *there*, so an unexplored square reads as
   * unexplored rather than as unlit. Both layers ignore the pointer.
   */
  gloom?: Record<string, 'dim' | 'dark' | 'magical-dark'>;
  onMove?: (id: string, to: Square) => void;
  /**
   * Present while a terrain brush is selected. Clicking or dragging across
   * squares calls it once per square entered; the caller decides what the
   * brush does. Token drags still win - a pointer that went down on a token is
   * moving the token, not painting under it.
   */
  onPaint?: (at: Square) => void;
  /** The hovered square changed. Fired once per square, null on leaving. */
  onHover?: (at: Square | null) => void;
  /** A token was clicked without being dragged. Targeting, mostly. */
  onTokenClick?: (id: string) => void;
  /** A token was double-clicked: open the full thing. */
  onTokenOpen?: (id: string) => void;
  /** Where the camera is looking. Omitted means the whole map, which is what
      the Dungeons editor wants and what every existing test assumes. */
  camera?: Camera;
  /** Present to make the map pannable and zoomable. Without it there are no
      gestures at all - no wheel listener, no suppressed context menu. */
  onCamera?: (next: Camera) => void;
  /** A square to keep in sight - whoever's turn it is. The camera moves only
      when it has gone off screen; see `useMapCamera`. */
  focus?: Square | null;
}) {
  const w = dungeon.width * CELL;
  const h = dungeon.height * CELL;

  const svg = useRef<SVGSVGElement>(null);

  /*
    What part of the drawing is on screen. One object, not two: `squareAt`
    below and the `viewBox` attribute have to be the *same* rectangle, and
    when they were written separately they drifted and a click landed six
    squares from where it was made. See `engine/letterbox.ts`.

    At the default camera this is exactly `0 0 w h` - the rectangle the map
    rendered before the camera existed, which is why the tests that stub this
    element's box and click through raw coordinates are untouched.
  */
  const frame: Frame = { x0: 0, y0: 0, w, h };
  const cam = useMapCamera(
    svg,
    frame,
    camera,
    onCamera,
    focus ? { x: (focus.x + 0.5) * CELL, y: (focus.y + 0.5) * CELL } : null,
  );
  const view: ViewBox = cam.view;
  const dragging = useRef<string | null>(null);
  const brushDown = useRef(false);
  /** The last square painted this stroke, so dragging inside one square is one paint. */
  const lastPainted = useRef<string | null>(null);
  /** The last square hovered, so `onHover` fires once per square. */
  const lastHover = useRef<string | null>(null);
  /** Whether the current token drag actually went anywhere - a drag that
      never left its square is a click, and clicks target. */
  const dragTravelled = useRef(false);

  /*
    Client coordinates to a grid square.

    Through the element's own box rather than `getScreenCTM`, because the SVG
    is laid out with `width: 100%` and a `viewBox`, so the drawing's units and
    the screen's are never the same scale and the ratio changes with the panel.
    The box is the one thing that is always current.

    `toUserSpace` does the division, and it accounts for the letterbox - the
    drawing is centred inside its element whenever the two aspects disagree,
    and dividing straight through the box was six squares wrong at the edges
    of a wide stage. See `engine/letterbox.ts`.
  */
  const squareAt = (clientX: number, clientY: number): Square | null => {
    const at = toUserSpace(svg.current?.getBoundingClientRect(), view, clientX, clientY);
    if (!at) return null;
    const x = Math.floor(at.x / CELL);
    const y = Math.floor(at.y / CELL);
    if (x < 0 || y < 0 || x >= dungeon.width || y >= dungeon.height) return null;
    return { x, y };
  };

  // Which squares the corridors cover, deduplicated, so overlapping runs are
  // drawn once rather than stacking their strokes into a darker line.
  const floor = new Map<string, { x: number; y: number }>();
  for (const corridor of dungeon.corridors) {
    for (const square of corridorSquares(corridor)) {
      floor.set(`${square.x},${square.y}`, square);
    }
  }

  return (
    <svg
      ref={svg}
      className="dmap"
      viewBox={viewBoxAttr(view)}
      /*
        An intrinsic size and the shape it implies. The stylesheet cannot know
        how many squares this dungeon is, and the battle stage needs the shape
        to fit the drawing to its safe rectangle rather than stretch it -
        which is what keeps the element box equal to the drawing box, and
        `squareAt` exact. See `engine/letterbox.ts`.
      */
      width={w}
      height={h}
      style={{ '--map-ratio': `${w} / ${h}` } as CSSProperties}
      role="img"
      aria-label={`Dungeon map from seed ${dungeon.seed}: ${dungeon.rooms.length} rooms`}
      onContextMenu={cam.onContextMenu}
      onPointerDown={(e) => {
        /*
          The camera looks first, and only ever claims a right-drag, a
          middle-drag or a second finger. A token drag still wins outright:
          the token's own handler has claimed the pointer by the time this
          bubbles, so a pan cannot start underneath one.
        */
        if (!dragging.current && cam.onPointerDown(e)) return;
        // Left button only. Without this check a right-click placed or walked
        // the selected token, on top of opening the browser's menu.
        if (!onPaint || dragging.current || e.button !== 0) return;
        const at = squareAt(e.clientX, e.clientY);
        if (!at) return;
        brushDown.current = true;
        lastPainted.current = `${at.x},${at.y}`;
        onPaint(at);
      }}
      onPointerMove={(e) => {
        if (cam.onPointerMove(e)) return;
        const at = squareAt(e.clientX, e.clientY);
        if (onHover) {
          const key = at ? `${at.x},${at.y}` : null;
          if (key !== lastHover.current) {
            lastHover.current = key;
            onHover(at);
          }
        }
        if (dragging.current) {
          if (at) {
            const before = tokens.find((t) => t.id === dragging.current)?.at;
            if (before && (before.x !== at.x || before.y !== at.y)) dragTravelled.current = true;
            onMove?.(dragging.current, at);
          }
          return;
        }
        if (!brushDown.current || !onPaint) return;
        if (!at) return;
        const key = `${at.x},${at.y}`;
        if (key === lastPainted.current) return;
        lastPainted.current = key;
        onPaint(at);
      }}
      onPointerUp={(e) => {
        cam.onPointerUp(e);
        dragging.current = null;
        brushDown.current = false;
        lastPainted.current = null;
      }}
      onPointerCancel={cam.onPointerUp}
      onPointerLeave={() => {
        /*
          Not the camera's cue to stop: a captured pan is *meant* to survive
          leaving the element, which is the whole reason for the capture. It
          ends on pointerup, wherever that happens.
        */
        if (cam.active()) return;
        dragging.current = null;
        brushDown.current = false;
        lastPainted.current = null;
        lastHover.current = null;
        onHover?.(null);
      }}
    >
      {/*
        The grid, as a pattern rather than a few thousand line elements. At 48
        by 36 squares that is the difference between one node and 1,700.
      */}
      <defs>
        <pattern id="dmap-grid" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
          <path d={`M ${CELL} 0 L 0 0 0 ${CELL}`} fill="none" className="dmap-grid" />
        </pattern>
      </defs>
      <rect width={w} height={h} fill="url(#dmap-grid)" />

      {/* Corridors under the rooms, so a room's wall draws over the join. */}
      {[...floor.values()].map((square) => (
        <rect
          key={`${square.x},${square.y}`}
          className="dmap-floor"
          x={square.x * CELL}
          y={square.y * CELL}
          width={CELL}
          height={CELL}
        />
      ))}

      {dungeon.rooms.map((room) => (
        <g key={room.id}>
          <rect
            className="dmap-room"
            x={room.x * CELL}
            y={room.y * CELL}
            width={room.w * CELL}
            height={room.h * CELL}
          />
          {/* The number a DM says out loud, so it has to survive printing at
              whatever size the page ends up. */}
          <text
            className="dmap-number"
            x={(room.x + room.w / 2) * CELL}
            y={(room.y + room.h / 2) * CELL}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {room.id}
          </text>
        </g>
      ))}

      {dungeon.doors.map((door) => (
        <rect
          key={`${door.x},${door.y}`}
          className="dmap-door"
          x={door.x * CELL + CELL * 0.2}
          y={door.y * CELL + CELL * 0.2}
          width={CELL * 0.6}
          height={CELL * 0.6}
        />
      ))}

      {/*
        Height first, terrain over it, tokens over both. Elevation is a wash on
        the square - darker the deeper, lighter the higher - with the level
        written in the corner, because a wash alone cannot say whether +2 is
        higher than +1 without a legend nobody will read.
      */}
      {Object.entries(elevation).map(([key, level]) => {
        const at = squareOf(key);
        return (
          <g key={`z${key}`} className={level > 0 ? 'dmap-z-up' : 'dmap-z-down'}>
            <rect
              x={at.x * CELL}
              y={at.y * CELL}
              width={CELL}
              height={CELL}
              opacity={Math.min(0.55, 0.18 + Math.abs(level) * 0.12)}
            />
            <text x={at.x * CELL + 1.5} y={at.y * CELL + 5} className="dmap-z-label">
              {level > 0 ? `+${level}` : level}
            </text>
          </g>
        );
      })}

      {/* Painted terrain, over the rooms and under the tokens: a pillar stands
          on the floor and somebody can stand on the map in front of it. */}
      {Object.entries(terrain).map(([key, kind]) => (
        <TerrainGlyph key={key} at={squareOf(key)} kind={kind} />
      ))}

      {/* Where the selected combatant can still get to, washed under
          everything that acts. The wash is also the mis-click guard: for a
          character, clicks outside it do nothing. */}
      {reach.map(({ at, dash }) => (
        <rect
          key={`r${at.x},${at.y}`}
          className={`dmap-reach ${dash ? 'is-dash' : ''}`}
          /* Named, so a probe can ask where this square was drawn and click
             exactly there - the check that catches a camera the hit test does
             not share. The tactical view names its tiles for the same reason. */
          data-at={`${at.x},${at.y}`}
          x={at.x * CELL}
          y={at.y * CELL}
          width={CELL}
          height={CELL}
        >
          <title>{dash ? 'Reachable with a Dash' : 'Reachable this turn'}</title>
        </rect>
      ))}

      {/* The perimeters: one line around what plain movement covers, one
          around what a Dash adds. The wash says roughly, the line exactly. */}
      {reach.length > 0 && (
        <>
          <path
            className="dmap-reach-edge is-dash"
            d={perimeterPath(reach.map((r) => r.at))}
            fill="none"
          />
          <path
            className="dmap-reach-edge"
            d={perimeterPath(reach.filter((r) => !r.dash).map((r) => r.at))}
            fill="none"
          />
        </>
      )}

      {/*
        Zones under the sight lines and tokens: a wall of fire is something
        people stand in, so they draw over it. The label sits at the origin -
        the square the spell was cast on - which is where a DM points.
      */}
      {zones.map((zone) => (
        <g key={zone.id} className={`dmap-zone tint-${zone.tint % 4} ${zone.ghost ? 'is-ghost' : ''}`}>
          <title>{zone.label}</title>
          {zone.squares.map((s) => (
            <rect
              key={`${s.x},${s.y}`}
              x={s.x * CELL}
              y={s.y * CELL}
              width={CELL}
              height={CELL}
            />
          ))}
          <text
            className="dmap-zone-label"
            x={(zone.origin.x + 0.5) * CELL}
            y={zone.origin.y * CELL - 2}
            textAnchor="middle"
          >
            {zone.label}
          </text>
        </g>
      ))}

      {/*
        Sight lines under the tokens, over everything else: a clear line runs
        unbroken, a blocked one is dashed and stops mattering at a glance. The
        geometry is centre to centre, the same line the engine tested.
      */}
      {sight.map((line, i) => (
        <line
          key={i}
          className={`dmap-sight ${line.visible ? '' : 'is-blocked'}`}
          x1={(line.from.x + 0.5) * CELL}
          y1={(line.from.y + 0.5) * CELL}
          x2={(line.to.x + 0.5) * CELL}
          y2={(line.to.y + 0.5) * CELL}
        />
      ))}

      {/*
        Tokens last, so they sit over the map rather than under a room's fill.
        The pointer handlers are on the <svg> rather than on each token: a drag
        that outruns the token - which every drag does - would otherwise stop
        the moment the pointer left the circle it started on.
      */}
      {tokens.map((token) => (
        <g
          /* The flash count is in the key so a hit remounts the group and the
             CSS animation replays - an attribute change alone would not. */
          key={`${token.id}:${token.flash ?? 0}`}
          className={`dmap-token ${token.kind} ${token.active ? 'is-up' : ''} ${token.down ? 'is-down' : ''} ${token.bloodied ? 'is-bloodied' : ''} ${token.flash ? 'is-hit' : ''} ${token.hiding ? 'is-hiding' : ''} ${token.targetable ? 'is-target' : ''}`}
          /* Which square this token is standing on, so a probe can click a
             tile and then ask where the token actually went. */
          data-at={`${token.at.x},${token.at.y}`}
          transform={`translate(${(token.at.x + 0.5) * CELL}, ${(token.at.y + 0.5) * CELL})`}
          onPointerDown={(e) => {
            dragging.current = token.id;
            dragTravelled.current = false;
            // Without capture the pointer is lost to whatever it passes over.
            (e.target as Element).setPointerCapture?.(e.pointerId);
          }}
          onClick={() => {
            // A drag that went somewhere is a move, not a click.
            if (!dragTravelled.current) onTokenClick?.(token.id);
          }}
          onDoubleClick={() => onTokenOpen?.(token.id)}
        >
          <title>{token.title}</title>
          <circle r={CELL * 0.42} />
          <text textAnchor="middle" dominantBaseline="central">
            {token.label}
          </text>
          {token.odds && (
            <text className="dmap-odds" y={-CELL * 0.62} textAnchor="middle">
              {token.odds}
            </text>
          )}
          {/* Conditions over the head, FFT's status bubbles - hidden while
              the odds need the same air. */}
          {!token.odds && token.conditions && token.conditions.length > 0 && (
            <text className="dmap-cond" y={-CELL * 0.62} textAnchor="middle">
              <title>{token.conditions.map((c) => c.name).join(', ')}</title>
              {token.conditions.slice(0, 3).map((c) => c.short).join('·')}
            </text>
          )}
          {token.float && (
            <text
              key={`f${token.float.seq}`}
              className={`dmap-float ${token.float.heal ? 'is-heal' : ''}`}
              y={-CELL * 0.3}
              textAnchor="middle"
            >
              {token.float.text}
            </text>
          )}
        </g>
      ))}

      {/*
        The dark, §40. Drawn as a wash over the ground and everything on it,
        because a torch does not light a room by lighting the floor - the
        whole square is dim or is not.
      */}
      {gloom && Object.keys(gloom).length > 0 && (
        <g className="dmap-gloom-layer" pointerEvents="none">
          {Object.entries(gloom).map(([key, level]) => {
            const { x, y } = squareOf(key);
            return (
              <rect
                key={`gloom${key}`}
                className={`dmap-gloom is-${level}`}
                x={x * CELL}
                y={y * CELL}
                width={CELL}
                height={CELL}
              />
            );
          })}
        </g>
      )}

      {/*
        The fog, over everything that stands and under the measuring tools:
        never seen is dark, seen-before is dim, in sight is clear. Tokens the
        party cannot see were filtered before they got here - the fog is the
        picture's honesty, not its only guard.
      */}
      {fog && (
        <g className="dmap-fog-layer" pointerEvents="none">
          {Array.from({ length: dungeon.height }, (_, y) =>
            Array.from({ length: dungeon.width }, (_, x) => {
              const key = `${x},${y}`;
              if (fog.visible.has(key)) return null;
              return (
                <rect
                  key={`fog${key}`}
                  className={`dmap-fog ${fog.explored.has(key) ? 'is-known' : ''}`}
                  x={x * CELL}
                  y={y * CELL}
                  width={CELL}
                  height={CELL}
                />
              );
            }),
          )}
        </g>
      )}

      {/* The measurement, drawn: centre to centre, dashed so it never reads
          as a wall or a sight line. */}
      {ruler && ruler.points.length > 1 && (
        <polyline
          className="dmap-ruler"
          fill="none"
          points={ruler.points.map((p) => `${(p.x + 0.5) * CELL},${(p.y + 0.5) * CELL}`).join(' ')}
        />
      )}

      {/*
        The lob, the way X-COM draws a grenade: an arc from the caster's
        square to where the pointer is, bowing up the screen, with an impact
        ring where it lands. The footprint ghost under it says what it
        catches; this says where it flies.
      */}
      {arc && (arc.from.x !== arc.to.x || arc.from.y !== arc.to.y) && (() => {
        const x1 = (arc.from.x + 0.5) * CELL;
        const y1 = (arc.from.y + 0.5) * CELL;
        const x2 = (arc.to.x + 0.5) * CELL;
        const y2 = (arc.to.y + 0.5) * CELL;
        const lift = Math.min(4 * CELL, Math.hypot(x2 - x1, y2 - y1) / 3 + CELL / 2);
        return (
          <g className="dmap-arc" pointerEvents="none">
            <path
              d={`M ${x1} ${y1} Q ${(x1 + x2) / 2} ${Math.min(y1, y2) - lift} ${x2} ${y2}`}
              fill="none"
            />
            <circle className="dmap-impact" cx={x2} cy={y2} r={CELL * 0.55} />
            <circle className="dmap-impact is-core" cx={x2} cy={y2} r={CELL * 0.18} />
          </g>
        );
      })()}

      {/* The armed tool's footprint cursor: one square, outlined. */}
      {cursor && (
        <rect
          className="dmap-cursor"
          x={cursor.x * CELL}
          y={cursor.y * CELL}
          width={CELL}
          height={CELL}
        />
      )}

      {/*
        The note rides the cursor rather than sitting in a corner: measuring
        the bottom-right of a big map with the answer printed forty squares
        away was a quiz. Flipped below the square when the cursor is on the
        top row.

        Clamped inside the *visible window*, not the whole drawing. Those were
        the same rectangle until §34; now that they are not, clamping to the
        drawing would let the note sit off screen whenever the camera is
        zoomed in - which is exactly when the note is being read. Without a
        `noteAt` it parks in the window's top-left corner, wherever that is.
      */}
      {note && (
        <text
          className="dmap-note"
          x={
            noteAt
              ? Math.max(view.x + 14, Math.min(view.x + view.width - 14, (noteAt.x + 0.5) * CELL))
              : view.x + 14
          }
          y={(() => {
            if (!noteAt) return view.y + 11;
            // Above the square by default, below it when there is no room -
            // which used to mean "on row 0" and now means "against the top of
            // what you can see", the same rule with the camera taken into
            // account.
            const above = noteAt.y * CELL - 4;
            const below = (noteAt.y + 1) * CELL + 10;
            return above < view.y + 11 ? below : above;
          })()}
          textAnchor={noteAt ? 'middle' : 'start'}
        >
          {note}
        </text>
      )}
    </svg>
  );
}
