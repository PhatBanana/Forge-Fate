import { useRef } from 'react';
import type { CSSProperties } from 'react';
import { toUserSpace, viewBoxAttr } from '../engine/letterbox';
import type { ViewBox } from '../engine/letterbox';
import { corridorSquares } from '../engine/dungeon';
import type { Dungeon } from '../engine/dungeon';
import type { Square } from '../encounter';
import { keyOf, squareOf } from '../terrain';
import type { ElevationMap, TerrainMap } from '../terrain';
import type { Token } from './DungeonMap';
import type { Camera, Frame } from '../engine/camera';
import { useMapCamera } from './useMapCamera';

/**
 * The tactical camera: the same battlefield, projected the way Final Fantasy
 * Tactics projects it - diamond tiles, height extruded into blocks, tokens
 * standing on the ground instead of lying on it.
 *
 * This is a *sibling* of `DungeonMap`, not a replacement: same props, same
 * pointer contract, different projection. The top-down map remains the truth
 * for printing and for painting terrain; this view exists because Z-height
 * has been in the data since section 12 and a flat wash was the only way to
 * see it.
 *
 * ## The projection, stated plainly
 *
 * A grid vertex (gx, gy) lands at `((gx − gy)·HW, (gx + gy)·HH)`, and
 * standing on ground of height z lifts it by `z·ZH`. That is the whole
 * camera. Cells are painted back-to-front by `x + y` so nearer tiles cover
 * farther ones; a cell's south-east and south-west faces are drawn as its
 * skirt, which is what makes height read as a block rather than a float.
 *
 * ## What this view approximates
 *
 * Tokens are billboards drawn over all ground, so a token directly behind a
 * tall wall block will draw over the wall's cap rather than peeking from
 * behind it. FFT solves this with per-sprite depth; a DM's table does not
 * need it solved. Painting is also not done here - arming a brush switches
 * back to the top-down map, where a square is a square.
 */

/** Half a diamond's width and height, and pixels per step of elevation. */
const HW = 14;
const HH = 7;
const ZH = 8;
/** The little lip every tile keeps below its top face, so flat ground still
    reads as tiles sitting on something. */
const LIP = 3;
/** How many steps tall a painted wall stands. */
const WALL_STEPS = 2;

interface IsoZone {
  id: string;
  label: string;
  tint: number;
  origin: Square;
  squares: Square[];
  ghost?: boolean;
}

export function IsoMap({
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
  orientation = 0,
  fog = null,
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
  terrain?: TerrainMap;
  elevation?: ElevationMap;
  sight?: { from: Square; to: Square; visible: boolean }[];
  zones?: IsoZone[];
  reach?: { at: Square; dash?: boolean }[];
  cursor?: Square | null;
  note?: string;
  noteAt?: Square | null;
  ruler?: { points: Square[] } | null;
  arc?: { from: Square; to: Square } | null;
  /** Which way the camera faces: 0-3, a quarter turn each - FFT's L1/R1. */
  orientation?: number;
  /** Fog of war, same contract as the flat map: dark, dim, or clear. */
  fog?: { visible: Set<string>; explored: Set<string> } | null;
  onMove?: (id: string, to: Square) => void;
  onPaint?: (at: Square) => void;
  onHover?: (at: Square | null) => void;
  onTokenClick?: (id: string) => void;
  onTokenOpen?: (id: string) => void;
  /** Where the camera is looking. Omitted means the whole map. */
  camera?: Camera;
  /** Present to make the map pannable and zoomable. See `useMapCamera`. */
  onCamera?: (next: Camera) => void;
  /** A square to keep in sight - whoever's turn it is. Projected through this
      view's own geometry before the camera sees it. */
  focus?: Square | null;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<string | null>(null);
  const brushDown = useRef(false);
  const lastPainted = useRef<string | null>(null);
  const lastHover = useRef<string | null>(null);
  const dragTravelled = useRef(false);

  const zOf = (at: Square): number => elevation[keyOf(at)] ?? 0;

  /*
    The camera's facing: a quarter-turn permutation of grid coordinates
    applied before projection - and inverted after the pointer's inverse -
    so rotating never touches the data, only which corner of it is near.
  */
  const rot = ((orientation % 4) + 4) % 4;
  const gw = rot % 2 ? dungeon.height : dungeon.width;
  const gh = rot % 2 ? dungeon.width : dungeon.height;
  const o = (at: Square): Square =>
    rot === 1
      ? { x: dungeon.height - 1 - at.y, y: at.x }
      : rot === 2
        ? { x: dungeon.width - 1 - at.x, y: dungeon.height - 1 - at.y }
        : rot === 3
          ? { x: at.y, y: dungeon.width - 1 - at.x }
          : at;
  const un = (at: Square): Square =>
    rot === 1
      ? { x: at.y, y: dungeon.height - 1 - at.x }
      : rot === 2
        ? { x: dungeon.width - 1 - at.x, y: dungeon.height - 1 - at.y }
        : rot === 3
          ? { x: dungeon.width - 1 - at.y, y: at.x }
          : at;

  /** A grid vertex on ground level, in the drawing's coordinates. */
  const vx = (gx: number, gy: number) => (gx - gy) * HW;
  const vy = (gx: number, gy: number) => (gx + gy) * HH;

  /*
    The frame: x runs from the far-left vertex (0, height) to the far-right
    (width, 0); y from the top vertex (0,0) down to (width, height), plus
    headroom for raised ground above and skirts below. All in the rotated
    frame, since that is the one being drawn.
  */
  const minX = vx(0, gh);
  const maxZ = Math.max(0, ...Object.values(elevation));
  const minZ = Math.min(0, ...Object.values(elevation));
  const pad = (maxZ + WALL_STEPS) * ZH + 24;
  const w = vx(gw, 0) - minX;
  const h = vy(gw, gh) + pad + Math.abs(minZ) * ZH + LIP + 14;

  /*
    The frame the camera moves around inside, and the part of it on screen.
    One object rather than two, because `squareAt` and the `viewBox` attribute
    have to be the same rectangle: they were written separately once and
    drifted, and §32.1 was the click that landed six squares away. See
    `engine/letterbox.ts`.

    The y origin is `-pad`, the headroom this projection reserves above the
    drawing for tall terrain. `minX` is *not* the x origin - the polygons are
    drawn already shifted by it, so the viewBox starts at zero and `squareAt`
    adds it back after the conversion.

    Rotating the camera changes `w`, `h`, `minX` and `pad` all at once, which
    is exactly why the camera is stored as a fraction of the frame rather than
    a coordinate in it: the middle of the board stays the middle through a
    quarter turn.
  */
  const frame: Frame = { x0: 0, y0: -pad, w, h };

  /** The four corners of a cell's top face at height z, as a points string. */
  const facePoints = (at: Square, z: number): string => {
    const lift = z * ZH;
    const r = o(at);
    return [
      [vx(r.x, r.y) - minX, vy(r.x, r.y) - lift],
      [vx(r.x + 1, r.y) - minX, vy(r.x + 1, r.y) - lift],
      [vx(r.x + 1, r.y + 1) - minX, vy(r.x + 1, r.y + 1) - lift],
      [vx(r.x, r.y + 1) - minX, vy(r.x, r.y + 1) - lift],
    ]
      .map((p) => p.join(','))
      .join(' ');
  };

  /** The centre of a cell's top face, where tokens stand and lines run. */
  const centre = (at: Square, z = zOf(at)) => {
    const r = o(at);
    return {
      x: vx(r.x + 0.5, r.y + 0.5) - minX,
      y: vy(r.x + 0.5, r.y + 0.5) - z * ZH,
    };
  };

  /*
    Declared here rather than beside the frame because following the turn needs
    `centre`: only this view knows where a square is drawn, so it projects the
    square and the camera works in drawing units it can compare against its own
    window.
  */
  const cam = useMapCamera(svg, frame, camera, onCamera, focus ? centre(focus) : null);
  const view: ViewBox = cam.view;

  /*
    Client coordinates back to a square: invert the vertex transform at each
    height that exists on this map, highest first - a raised tile's face
    covers the flat square behind it, so the taller candidate wins, exactly
    as it does visually. The z = 0 plane is the fallback.
  */
  const squareAt = (clientX: number, clientY: number): Square | null => {
    /*
      Through `toUserSpace`, which accounts for the letterbox: the drawing is
      centred inside its element whenever the two aspects disagree, and
      dividing straight through the box was wrong at the edges. The viewBox
      origin is `(0, -pad)` - the headroom above the drawing is real space,
      which is why y is not zero, and the helper takes the origin as an
      argument for exactly that reason. See `engine/letterbox.ts`.

      `minX` is added back afterwards rather than passed as the origin: the
      polygons are drawn already shifted by it (`facePoints`), so the viewBox
      starts at zero, while the inverse below wants an unshifted vertex.
    */
    const at = toUserSpace(svg.current?.getBoundingClientRect(), view, clientX, clientY);
    if (!at) return null;
    const sx = at.x + minX;
    const sy = at.y;
    const levels = [...new Set([...Object.values(elevation), 0])].sort((a, b) => b - a);
    let flat: Square | null = null;
    for (const z of levels) {
      const gy = sy + z * ZH;
      const a = (sx / HW + gy / HH) / 2;
      const b = (gy / HH - sx / HW) / 2;
      const rotated = { x: Math.floor(a), y: Math.floor(b) };
      if (rotated.x < 0 || rotated.y < 0 || rotated.x >= gw || rotated.y >= gh) continue;
      // The inverse lands in the rotated frame; the data lives in the real one.
      const at = un(rotated);
      if (zOf(at) === z) return at;
      if (z === 0) flat = at;
    }
    return flat;
  };

  /*
    Which cells are ground at all. The same rule the top-down map draws by:
    rooms, corridors and painted floor on a generated map; every square on a
    blank one. Painted terrain is ground too - a wall stands somewhere.
  */
  const cells = new Map<string, Square>();
  if (dungeon.rooms.length === 0) {
    for (let y = 0; y < dungeon.height; y++) {
      for (let x = 0; x < dungeon.width; x++) cells.set(`${x},${y}`, { x, y });
    }
  } else {
    for (const room of dungeon.rooms) {
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) cells.set(`${x},${y}`, { x, y });
      }
    }
    for (const corridor of dungeon.corridors) {
      for (const s of corridorSquares(corridor)) cells.set(`${s.x},${s.y}`, s);
    }
    for (const key of Object.keys(terrain)) {
      const s = squareOf(key);
      if (s.x >= 0 && s.y >= 0 && s.x < dungeon.width && s.y < dungeon.height) {
        cells.set(key, s);
      }
    }
  }

  // Back to front in the rotated frame: farther cells first, so nearer
  // tiles and their skirts paint over them whichever way the camera faces.
  const depth = (at: Square) => {
    const r = o(at);
    return r.x + r.y;
  };
  const ground = [...cells.values()].sort((a, b) => depth(a) - depth(b));

  const drawCell = (at: Square) => {
    const kind = terrain[keyOf(at)];
    const z = zOf(at) + (kind === 'wall' ? WALL_STEPS : 0);
    const lift = z * ZH;
    const drop = lift + LIP + (zOf(at) < 0 ? 0 : Math.max(0, -minZ) * ZH);
    const r = o(at);
    const b = [vx(r.x + 1, r.y) - minX, vy(r.x + 1, r.y) - lift];
    const c = [vx(r.x + 1, r.y + 1) - minX, vy(r.x + 1, r.y + 1) - lift];
    const d = [vx(r.x, r.y + 1) - minX, vy(r.x, r.y + 1) - lift];
    const cn = centre(at, z);
    return (
      <g key={keyOf(at)} className={`iso-cell ${kind ? `is-${kind}` : ''}`}>
        {/* The two visible skirt faces, then the cap over them. */}
        <polygon
          className="iso-side is-se"
          points={`${b.join(',')} ${c.join(',')} ${c[0]},${c[1] + drop} ${b[0]},${b[1] + drop}`}
        />
        <polygon
          className="iso-side is-sw"
          points={`${c.join(',')} ${d.join(',')} ${d[0]},${d[1] + drop} ${c[0]},${c[1] + drop}`}
        />
        {/* data-at names the square, for tests and for anyone debugging a
            projection: the DOM says which diamond is which. */}
        <polygon className="iso-top" data-at={keyOf(at)} points={facePoints(at, z)} />
        {kind === 'pillar' && <ellipse className="iso-pillar" cx={cn.x} cy={cn.y} rx={HW * 0.35} ry={HH * 0.35} />}
        {kind === 'tree' && (
          <g className="iso-tree">
            <line x1={cn.x} y1={cn.y} x2={cn.x} y2={cn.y - ZH * 1.6} />
            <circle cx={cn.x} cy={cn.y - ZH * 1.9} r={HW * 0.4} />
          </g>
        )}
        {kind === 'rock' && (
          <polygon
            className="iso-rock"
            points={`${cn.x - 4},${cn.y + 2} ${cn.x - 1},${cn.y - 4} ${cn.x + 3},${cn.y - 2} ${cn.x + 4},${cn.y + 2}`}
          />
        )}
        {kind === 'rubble' && (
          <g className="iso-rubble">
            <circle cx={cn.x - 3} cy={cn.y + 1} r={1.1} />
            <circle cx={cn.x + 1} cy={cn.y - 1} r={1.4} />
            <circle cx={cn.x + 3} cy={cn.y + 2} r={1} />
          </g>
        )}
      </g>
    );
  };

  /** A diamond overlay on a cell's top face - reach, zones, the cursor. */
  const overlay = (at: Square, className: string, key: string, title?: string) => {
    const z = zOf(at) + (terrain[keyOf(at)] === 'wall' ? WALL_STEPS : 0);
    return (
      <polygon key={key} className={className} points={facePoints(at, z)}>
        {title ? <title>{title}</title> : null}
      </polygon>
    );
  };

  return (
    <svg
      ref={svg}
      className="dmap isomap"
      viewBox={viewBoxAttr(view)}
      /* An intrinsic size and the shape it implies, so the element can be
         fitted rather than stretched - see `DungeonMap.tsx`. */
      width={w}
      height={h}
      style={{ '--map-ratio': `${w} / ${h}` } as CSSProperties}
      role="img"
      aria-label={`Tactical view of the map from seed ${dungeon.seed}`}
      onContextMenu={cam.onContextMenu}
      onPointerDown={(e) => {
        // The camera first, and only for a right-drag, a middle-drag or a
        // second finger. Left button still paints; see `useMapCamera`.
        if (!dragging.current && cam.onPointerDown(e)) return;
        if (!onPaint || dragging.current || e.button !== 0) return;
        const at = squareAt(e.clientX, e.clientY);
        if (!at) return;
        brushDown.current = true;
        lastPainted.current = keyOf(at);
        onPaint(at);
      }}
      onPointerMove={(e) => {
        if (cam.onPointerMove(e)) return;
        const at = squareAt(e.clientX, e.clientY);
        if (onHover) {
          const key = at ? keyOf(at) : null;
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
        if (!brushDown.current || !onPaint || !at) return;
        const key = keyOf(at);
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
        // A captured pan is meant to survive leaving the element - that is
        // what the capture is for. It ends on pointerup, wherever that lands.
        if (cam.active()) return;
        dragging.current = null;
        brushDown.current = false;
        lastPainted.current = null;
        lastHover.current = null;
        onHover?.(null);
      }}
    >
      {ground.map(drawCell)}

      {/* Overlays over the ground, in the same order the flat map layers
          them: reach, then zones, then sight, then everything that stands. */}
      {reach.map(({ at, dash }) =>
        overlay(
          at,
          `dmap-reach ${dash ? 'is-dash' : ''}`,
          `r${keyOf(at)}`,
          dash ? 'Reachable with a Dash' : 'Reachable this turn',
        ),
      )}

      {zones.map((zone) => (
        <g key={zone.id} className={`dmap-zone tint-${zone.tint % 4} ${zone.ghost ? 'is-ghost' : ''}`}>
          <title>{zone.label}</title>
          {zone.squares.map((s) => {
            const z = zOf(s) + (terrain[keyOf(s)] === 'wall' ? WALL_STEPS : 0);
            return <polygon key={keyOf(s)} points={facePoints(s, z)} />;
          })}
          <text
            className="dmap-zone-label"
            x={centre(zone.origin).x}
            y={centre(zone.origin).y - HH * 2}
            textAnchor="middle"
          >
            {zone.label}
          </text>
        </g>
      ))}

      {sight.map((line, i) => {
        const a = centre(line.from);
        const b = centre(line.to);
        return (
          <line
            key={i}
            className={`dmap-sight ${line.visible ? '' : 'is-blocked'}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
          />
        );
      })}

      {/* Tokens as billboards, nearest last so they overlap like the tiles
          they stand on. */}
      {[...tokens]
        .sort((a, b) => depth(a.at) - depth(b.at))
        .map((token) => {
          const cn = centre(token.at);
          return (
            <g
              key={`${token.id}:${token.flash ?? 0}`}
              className={`dmap-token iso-token ${token.kind} ${token.active ? 'is-up' : ''} ${
                token.down ? 'is-down' : ''
              } ${token.bloodied ? 'is-bloodied' : ''} ${token.flash ? 'is-hit' : ''} ${token.hiding ? 'is-hiding' : ''} ${token.targetable ? 'is-target' : ''}`}
              transform={`translate(${cn.x}, ${cn.y})`}
              onPointerDown={(e) => {
                dragging.current = token.id;
                dragTravelled.current = false;
                (e.target as Element).setPointerCapture?.(e.pointerId);
              }}
              onClick={() => {
                if (!dragTravelled.current) onTokenClick?.(token.id);
              }}
              onDoubleClick={() => onTokenOpen?.(token.id)}
            >
              <title>{token.title}</title>
              <ellipse className="iso-shadow" cx={0} cy={0} rx={HW * 0.5} ry={HH * 0.5} />
              <circle cy={-9} r={7} />
              <text y={-9} textAnchor="middle" dominantBaseline="central">
                {token.label}
              </text>
              {token.odds && (
                <text className="dmap-odds" y={-20} textAnchor="middle">
                  {token.odds}
                </text>
              )}
              {!token.odds && token.conditions && token.conditions.length > 0 && (
                <text className="dmap-cond" y={-20} textAnchor="middle">
                  <title>{token.conditions.map((c) => c.name).join(', ')}</title>
                  {token.conditions.slice(0, 3).map((c) => c.short).join('·')}
                </text>
              )}
              {token.float && (
                <text
                  key={`f${token.float.seq}`}
                  className={`dmap-float ${token.float.heal ? 'is-heal' : ''}`}
                  y={-14}
                  textAnchor="middle"
                >
                  {token.float.text}
                </text>
              )}
            </g>
          );
        })}

      {/* The fog, as tinted top faces over everything that stands: never
          seen is dark, seen-before is dim, in sight is clear. */}
      {fog && (
        <g className="dmap-fog-layer" pointerEvents="none">
          {ground
            .filter((at) => !fog.visible.has(keyOf(at)))
            .map((at) =>
              overlay(
                at,
                `dmap-fog ${fog.explored.has(keyOf(at)) ? 'is-known' : ''}`,
                `fog${keyOf(at)}`,
              ),
            )}
        </g>
      )}

      {ruler && ruler.points.length > 1 && (
        <polyline
          className="dmap-ruler"
          fill="none"
          points={ruler.points.map((p) => `${centre(p).x},${centre(p).y}`).join(' ')}
        />
      )}

      {arc && (arc.from.x !== arc.to.x || arc.from.y !== arc.to.y) && (() => {
        const a = centre(arc.from);
        const b = centre(arc.to);
        const lift = Math.min(4 * ZH + HH * 4, Math.hypot(b.x - a.x, b.y - a.y) / 3 + HH);
        return (
          <g className="dmap-arc" pointerEvents="none">
            <path
              d={`M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${Math.min(a.y, b.y) - lift} ${b.x} ${b.y}`}
              fill="none"
            />
            <ellipse className="dmap-impact" cx={b.x} cy={b.y} rx={HW * 0.55} ry={HH * 0.55} />
          </g>
        );
      })()}

      {cursor && overlay(cursor, 'dmap-cursor', 'cursor')}

      {/* Clamped inside the visible window rather than the whole drawing -
          they were the same rectangle until the camera arrived, and zoomed in
          the difference is a note the reader cannot see. */}
      {note && noteAt && (
        <text
          className="dmap-note"
          x={Math.max(view.x + 20, Math.min(view.x + view.width - 20, centre(noteAt).x))}
          y={Math.max(view.y + 10, centre(noteAt).y - HH * 2.2)}
          textAnchor="middle"
        >
          {note}
        </text>
      )}
    </svg>
  );
}
