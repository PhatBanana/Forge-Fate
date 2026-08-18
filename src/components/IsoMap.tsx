import { useRef } from 'react';
import type { CSSProperties } from 'react';
import { toUserSpace, viewBoxAttr } from '../engine/letterbox';
import type { ViewBox } from '../engine/letterbox';
import type { Dungeon } from '../engine/dungeon';
import type { Square } from '../encounter';
import { keyOf } from '../terrain';
import type { ElevationMap, TerrainMap } from '../terrain';
import type { Token } from './DungeonMap';
import type { Camera } from '../engine/camera';
import { useMapCamera } from './useMapCamera';
import { BASE_H, HH, HW, LIP, PAWN_H, PAWN_W, ZH, groundCells, isoProjection } from '../engine/iso';

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

/*
  The projection constants and math live in `engine/iso.ts` since §66, shared
  with the WebGL renderer so the two views cannot drift. This file keeps the
  JSX and the pointer contract; the geometry is consumed, not owned.

  The pawn proportions (§37): a card as wide as the diamond's half-width sits
  inside its own square, and one about one and a half times as tall as it is
  wide is the proportion a cardboard standee actually has. Taller looks like a
  banner; shorter looks like a sign.
*/

export interface IsoZone {
  id: string;
  label: string;
  tint: number;
  origin: Square;
  squares: Square[];
  ghost?: boolean;
}

/**
 * The tactical view's whole contract, as a named type since §66: two
 * renderers answer it - this SVG one and `GlIsoMap` - and a shared type is
 * what keeps a prop added to one from silently never reaching the other.
 */
export interface IsoMapProps {
  dungeon: Dungeon;
  tokens?: Token[];
  terrain?: TerrainMap;
  elevation?: ElevationMap;
  sight?: { from: Square; to: Square; visible: boolean }[];
  /** §88: telegraphed enemy turns - the walk dashed, the strike solid. */
  intents?: { from: Square; to: Square; walk?: boolean }[];
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
  /** How dark each square is, by key - only the ones that are not bright. */
  gloom?: Record<string, 'dim' | 'dark' | 'magical-dark'>;
  onMove?: (id: string, to: Square) => void;
  onPaint?: (at: Square) => void;
  onHover?: (at: Square | null) => void;
  onTokenClick?: (id: string) => void;
  onTokenOpen?: (id: string) => void;
  /** Where the camera is looking. Omitted means the whole map. */
  camera?: Camera;
  /** Present to make the map pannable and zoomable. See `useMapCamera`. */
  onCamera?: (next: Camera) => void;
  /** A square to keep in sight - whoever's turn it is. */
  focus?: Square | null;
}

export function IsoMap({
  dungeon,
  tokens = [],
  terrain = {},
  elevation = {},
  sight = [],
  intents = [],
  zones = [],
  reach = [],
  cursor = null,
  note,
  noteAt = null,
  ruler = null,
  arc = null,
  orientation = 0,
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
}: IsoMapProps) {
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<string | null>(null);
  const brushDown = useRef(false);
  const lastPainted = useRef<string | null>(null);
  const lastHover = useRef<string | null>(null);
  const dragTravelled = useRef(false);

  /*
    The whole projection - facing permutation, frame, face corners, centres
    and the pointer inverse - from `engine/iso.ts`, shared with the WebGL
    renderer. One object per render: it closes over this facing of this map.

    The frame is one object because `squareAt` and the `viewBox` attribute
    have to be the same rectangle: they were written separately once and
    drifted, and §32.1 was the click that landed six squares away. Rotating
    the camera changes `w`, `h`, `minX` and `pad` all at once, which is why
    the camera is stored as a fraction of the frame rather than a coordinate
    in it: the middle of the board stays the middle through a quarter turn.
  */
  const proj = isoProjection(dungeon, elevation, terrain, orientation);
  const { frame, w, h } = proj;
  const zOf = proj.zOf;

  /** The four corners of a cell's top face at height z, as a points string. */
  const facePoints = (at: Square, z: number): string =>
    proj
      .faceCorners(at, z)
      .map((p) => p.join(','))
      .join(' ');

  const centre = proj.centreOf;

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
  const squareAt = (clientX: number, clientY: number): Square | null =>
    /*
      Through `toUserSpace`, which accounts for the letterbox: the drawing is
      centred inside its element whenever the two aspects disagree, and
      dividing straight through the box was wrong at the edges. The inverse
      itself lives in `engine/iso.ts` with the rest of the projection, so the
      WebGL view cannot end up with a different one.
    */
    proj.squareAtPoint(
      toUserSpace(svg.current?.getBoundingClientRect(), view, clientX, clientY),
    );

  // Back to front in the rotated frame: farther cells first, so nearer
  // tiles and their skirts paint over them whichever way the camera faces.
  const depth = proj.depthOf;
  const ground = groundCells(dungeon, terrain).sort((a, b) => depth(a) - depth(b));

  // How far below ground level the map's deepest pit goes - skirts on flat
  // ground drop past it so a pit reads as a hole in something solid.
  const minZ = Math.min(0, ...Object.values(elevation));

  const drawCell = (at: Square) => {
    const kind = terrain[keyOf(at)];
    const z = proj.drawZ(at);
    const lift = z * ZH;
    const drop = lift + LIP + (zOf(at) < 0 ? 0 : Math.max(0, -minZ) * ZH);
    // The cap's corners; b, c and d bound the two visible skirt faces.
    const [, b, c, d] = proj.faceCorners(at, z);
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

  /**
   * A diamond overlay on a cell's top face - reach, zones, the cursor.
   *
   * `data-at` for the same reason `.iso-top` carries it: a browser probe needs
   * to ask where a square was *drawn* and then click there, which is the only
   * check that can see a camera applied to the drawing but not to `squareAt`.
   */
  const overlay = (at: Square, className: string, key: string, title?: string) => {
    const z = proj.drawZ(at);
    return (
      <polygon key={key} className={className} data-at={keyOf(at)} points={facePoints(at, z)}>
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
      /* §79: `role="group"`, not `img`. An image role prunes the subtree
         from the accessibility tree, which silently discarded every
         per-token <title> below - the names, the zone labels, the condition
         lists. A group keeps the label and lets the children speak, which is
         the whole reason Classic look is the accessible tactical mode. */
      role="group"
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
          {zone.squares.map((s) => (
            <polygon key={keyOf(s)} points={facePoints(s, proj.drawZ(s))} />
          ))}
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

      {/* §88: the telegraphs, on the same centre-to-centre geometry. */}
      {intents.map((seg, i) => {
        const a = centre(seg.from);
        const b = centre(seg.to);
        return (
          <line
            key={`intent-${i}`}
            className={`dmap-intent ${seg.walk ? 'is-walk' : ''}`}
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
              /* Same as the flat map: the square this token stands on, for a
                 probe that clicks a tile and checks where it landed. */
              data-at={keyOf(token.at)}
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
              {/*
                A standee, not a disc (§37).

                The tactical view exists because height is in the data and a
                flat wash could not show it - and a token lying flat on a
                board of standing blocks was the last thing still pretending
                the board was flat. So: an elliptical shadow on the ground,
                a wedge base sitting in it, and a card standing up out of the
                base carrying the face or the initials. Cardboard miniatures,
                which is what a table without painted metal actually uses.

                Drawn in SVG rather than through a 3D library on purpose: the
                whole map pipeline is dependency-free SVG with a box-based hit
                test, a viewBox camera (§34) and a print path. A WebGL canvas
                would orphan all four at once for an effect a wedge and a
                shadow already sell.

                Geometry, all relative to the tile centre at (0, 0):
                  - the shadow is the tile's own ellipse, so it reads as
                    contact with *this* square rather than a blob;
                  - the base is a shallow wedge, narrower at the top, which
                    is what makes the card look slotted into it;
                  - the card is `PAWN_W` x `PAWN_H` with its foot at the base,
                    so everything above the ground is negative y - and the
                    condition and float text that used to sit at -20 moves up
                    with it rather than through it.
              */}
              <ellipse className="iso-shadow" cx={0} cy={0} rx={HW * 0.52} ry={HH * 0.52} />
              <polygon
                className="iso-pawn-base"
                points={`${-PAWN_W * 0.5},0 ${PAWN_W * 0.5},0 ${PAWN_W * 0.34},${-BASE_H} ${-PAWN_W * 0.34},${-BASE_H}`}
              />
              <g className="iso-pawn-card">
                <rect
                  x={-PAWN_W / 2}
                  y={-BASE_H - PAWN_H}
                  width={PAWN_W}
                  height={PAWN_H}
                  rx={2}
                />
                {token.portrait ? (
                  <>
                    {/*
                      The face on the card. Clipped to the card's own rect so
                      a tall photograph does not spill past the cardboard, and
                      `preserveAspectRatio="slice"` fills rather than
                      letterboxes - a portrait with bars either side would look
                      like a mistake at this size.
                    */}
                    <clipPath id={`pawn-${token.id}`}>
                      <rect
                        x={-PAWN_W / 2 + 1}
                        y={-BASE_H - PAWN_H + 1}
                        width={PAWN_W - 2}
                        height={PAWN_H - 2}
                        rx={1.5}
                      />
                    </clipPath>
                    <image
                      href={token.portrait}
                      x={-PAWN_W / 2 + 1}
                      y={-BASE_H - PAWN_H + 1}
                      width={PAWN_W - 2}
                      height={PAWN_H - 2}
                      preserveAspectRatio="xMidYMid slice"
                      clipPath={`url(#pawn-${token.id})`}
                    />
                  </>
                ) : (
                  <text
                    y={-BASE_H - PAWN_H / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {token.label}
                  </text>
                )}
              </g>
              {token.odds && (
                <text className="dmap-odds" y={-BASE_H - PAWN_H - 5} textAnchor="middle">
                  {token.odds}
                </text>
              )}
              {!token.odds && token.conditions && token.conditions.length > 0 && (
                <text className="dmap-cond" y={-BASE_H - PAWN_H - 5} textAnchor="middle">
                  <title>{token.conditions.map((c) => c.name).join(', ')}</title>
                  {token.conditions.slice(0, 3).map((c) => c.short).join('·')}
                </text>
              )}
              {token.float && (
                <text
                  key={`f${token.float.seq}`}
                  className={`dmap-float ${token.float.heal ? 'is-heal' : ''}`}
                  y={-BASE_H - PAWN_H + 2}
                  textAnchor="middle"
                >
                  {token.float.text}
                </text>
              )}
            </g>
          );
        })}

      {/* The dark, §40, under the fog for the same reason the flat map draws
          it there: the fog is what the party knows, the gloom is what is
          there, and an unexplored square must not read as merely unlit. */}
      {gloom && Object.keys(gloom).length > 0 && (
        <g className="dmap-gloom-layer" pointerEvents="none">
          {ground
            .filter((at) => !!gloom[keyOf(at)])
            .map((at) => overlay(at, `dmap-gloom is-${gloom[keyOf(at)]}`, `gloom${keyOf(at)}`))}
        </g>
      )}

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
