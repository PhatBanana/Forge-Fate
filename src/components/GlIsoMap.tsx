import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { toUserSpace } from '../engine/letterbox';
import { keyOf } from '../terrain';
import type { Square } from '../encounter';
import { IsoMap } from './IsoMap';
import type { IsoMapProps } from './IsoMap';
import { useMapCamera } from './useMapCamera';
import { isoProjection } from '../engine/iso';
import { canUseWebGl } from '../engine/gl/context';
import { createRenderer } from '../engine/gl/renderer';
import type { Renderer } from '../engine/gl/renderer';
import { DARK, LIGHT } from '../engine/gl/palette';
import { buildTerrain, depthRange } from '../engine/gl/scene';
import {
  cursorWash,
  fogWash,
  gloomWash,
  reachWash,
  zoneWash,
} from '../engine/gl/overlays';
import { arcLines, rulerLine, sightLines } from '../engine/gl/lines';
import {
  glyphSprites,
  noteText,
  tokenSprites,
  zoneLabels,
} from '../engine/gl/sprites';
import { motionFor, pruneAnims } from '../engine/gl/motion';
import type { TokenAnim } from '../engine/gl/motion';
import { groundCells } from '../engine/iso';

/**
 * The tactical view, rendered the way a PlayStation would have (§66).
 *
 * Same props as `IsoMap` - the type is shared, so the two renderers cannot
 * drift apart - and the same pointer contract: TableTab hands both the same
 * handlers and cannot tell which one is mounted.
 *
 * ## Which renderer answers
 *
 * This component owns the choice. `classic` (the user's toggle) or an
 * environment without WebGL or a context that died and would not come back -
 * every one of those renders the SVG `IsoMap` instead, which is also what
 * every jsdom test gets, since jsdom's `getContext` returns null. The
 * fallback is not a degraded mode: it is the shipping SVG view, tooltips,
 * per-token titles and printability included, which is why it doubles as
 * the accessible tactical mode.
 *
 * ## How drawing stays honest with clicking
 *
 * The projection comes from `engine/iso.ts` - the same module the SVG uses -
 * and the camera's `ViewBox` is the same object `toUserSpace` consumes, so
 * where a square is drawn and where a click lands cannot disagree (§32.1's
 * lesson, carried into the third renderer).
 */

export function GlIsoMap({ classic = false, ...props }: IsoMapProps & { classic?: boolean }) {
  const [dead, setDead] = useState(false);
  // Stable, because it is a dependency of GlSurface's mount effect - an
  // inline closure here would tear the renderer down on every render.
  const onDead = useCallback(() => setDead(true), []);
  if (classic || dead || !canUseWebGl()) return <IsoMap {...props} />;
  return <GlSurface {...props} onDead={onDead} />;
}

function GlSurface({
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
  gloom,
  onMove,
  onPaint,
  onHover,
  onTokenClick,
  onTokenOpen,
  camera,
  onCamera,
  focus = null,
  onDead,
}: IsoMapProps & { onDead: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<Renderer | null>(null);
  const dragging = useRef<string | null>(null);
  const brushDown = useRef(false);
  const lastPainted = useRef<string | null>(null);
  const lastHover = useRef<string | null>(null);
  const dragTravelled = useRef(false);
  /** Bumped when a lost context is restored, to rebuild the renderer. */
  const [contextEra, setContextEra] = useState(0);
  /*
    §68: the animation clock. Live animations, the sequence numbers already
    consumed, the running frame handle, and the one closure the ticker calls
    - refreshed every commit so a mid-animation React render never draws
    with stale props. Refs throughout: none of this is render state, and a
    setState per animation frame would be sixty commits a second.
  */
  const anims = useRef<TokenAnim[]>([]);
  const seenSeqs = useRef<
    Record<string, { flash?: number; lunge?: number; walk?: number; down?: boolean }>
  >({});
  const rafId = useRef<number | null>(null);
  const redrawSprites = useRef<(now: number) => void>(() => {});
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
  );

  useThemeObserver(setTheme);

  const proj = useMemo(
    () => isoProjection(dungeon, elevation, terrain, orientation),
    [dungeon, elevation, terrain, orientation],
  );
  const palette = theme === 'dark' ? DARK : LIGHT;

  const cam = useMapCamera(
    canvasRef,
    proj.frame,
    camera,
    onCamera,
    focus ? proj.centreOf(focus) : null,
  );
  const view = cam.view;

  // ------------------------------------------------------------ lifecycle
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const built = createRenderer(canvas);
    if (!built) {
      onDead();
      return;
    }
    renderer.current = built;
    built.onFrame(() => {
      // A portrait decoded after its card was drawn: paint again.
      if (renderer.current) renderer.current.render(cam.view);
    });

    const onLost = (e: Event) => {
      // Asking the browser to restore is opt-in; without this the context
      // stays dead and so would the board.
      e.preventDefault();
      renderer.current = null;
    };
    const onRestored = () => setContextEra((era) => era + 1);
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);

    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        renderer.current?.resize(rect.width, rect.height, window.devicePixelRatio || 1);
        renderer.current?.render(cam.view);
      }
    };
    fit();
    // jsdom has no ResizeObserver; the GL path never really runs there, but
    // the mount effect does, and a mocked renderer deserves a working one.
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    observer?.observe(canvas);

    return () => {
      observer?.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      built.destroy();
      renderer.current = null;
    };
    // The camera view is read through a ref-stable closure; re-creating the
    // renderer for a pan would be absurd, so cam is deliberately not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextEra, onDead]);

  // ------------------------------------------------------------ the scene
  const ground = useMemo(() => groundCells(dungeon, terrain), [dungeon, terrain]);

  const terrainMesh = useMemo(
    () => buildTerrain(dungeon, elevation, terrain, proj, palette),
    [dungeon, elevation, terrain, proj, palette],
  );

  const pawnArt = useMemo(() => {
    const art = new Map<
      string,
      { label: string; kind: 'character' | 'monster'; portrait?: string }
    >();
    for (const token of tokens) {
      art.set(token.id, {
        label: token.label,
        kind: token.kind,
        ...(token.portrait ? { portrait: token.portrait } : {}),
      });
    }
    return art;
  }, [tokens]);

  useEffect(() => {
    const r = renderer.current;
    if (!r) return;

    /*
      §68: new attacks and hits start animations. A sequence number this
      component has not consumed yet is the signal; a token seen for the
      first time records its numbers without animating, or a remount would
      replay every stale flash at once.
    */
    const now = performance.now();
    for (const token of tokens) {
      const seen = seenSeqs.current[token.id];
      if (seen) {
        if (token.flash && token.flash !== seen.flash) {
          anims.current.push({ id: token.id, kind: 'hit', start: now });
        }
        if (token.lunge && token.lunge.seq !== seen.lunge) {
          const from = proj.centreOf(token.at);
          const to = proj.centreOf(token.lunge.toward);
          anims.current.push({
            id: token.id,
            kind: 'lunge',
            start: now,
            dir: { x: to.x - from.x, y: to.y - from.y },
          });
        }
        if (token.down && !seen.down) {
          // §70: the drop to nought. Derived rather than reported - the
          // `down` flag flipping IS the death, whatever caused it - and it
          // covers monsters' cards the same as character sprites.
          anims.current.push({ id: token.id, kind: 'death', start: now });
        }
        if (token.walk && token.walk.seq !== seen.walk) {
          // §69: the route projected once, at the rotation it started under.
          // A walk supersedes any walk still in flight - one body, one route.
          anims.current = anims.current.filter(
            (anim) => !(anim.id === token.id && anim.kind === 'walk'),
          );
          anims.current.push({
            id: token.id,
            kind: 'walk',
            start: now,
            path: token.walk.route.map((sq) => ({ ...proj.centreOf(sq), depth: proj.depthOf(sq) })),
            hop: !token.walk.slide,
          });
        }
      }
      seenSeqs.current[token.id] = {
        flash: token.flash,
        lunge: token.lunge?.seq,
        walk: token.walk?.seq,
        down: token.down,
      };
    }

    const { sprites, texts } = tokenSprites(tokens, proj, motionFor(anims.current, now));
    r.update({
      palette,
      depthMax: depthRange(proj),
      terrain: terrainMesh,
      reach: reachWash(reach, proj, palette),
      zones: zoneWash(zones, proj, palette),
      gloom: gloomWash(gloom, ground, proj, palette),
      fog: fogWash(fog, ground, proj, palette),
      cursor: cursorWash(cursor, proj, palette),
      sight: sightLines(sight, proj, palette),
      rulerArc: mergeLines(rulerLine(ruler, proj, palette), arcLines(arc, proj, palette)),
      sprites: [...glyphSprites(terrain, proj), ...sprites],
      tokenTexts: texts,
      zoneTexts: zoneLabels(zones, proj),
      noteText: noteText(note, noteAt, view, proj),
      pawnArt,
    });
    r.render(view);

    // The ticker redraws only the sprite layers - the ground does not move
    // because somebody swung a sword.
    redrawSprites.current = (tick: number) => {
      const moved = tokenSprites(tokens, proj, motionFor(anims.current, tick));
      r.update({
        sprites: [...glyphSprites(terrain, proj), ...moved.sprites],
        tokenTexts: moved.texts,
      });
      r.render(view);
    };
    if (anims.current.length && rafId.current === null) {
      const tick = () => {
        const at = performance.now();
        anims.current = pruneAnims(anims.current, at);
        redrawSprites.current(at);
        rafId.current = anims.current.length ? requestAnimationFrame(tick) : null;
      };
      rafId.current = requestAnimationFrame(tick);
    }
  });

  // The clock dies with the component, not with the current renderer.
  useEffect(
    () => () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    },
    [],
  );

  // ------------------------------------------------------------- pointing
  const squareAt = (clientX: number, clientY: number): Square | null =>
    proj.squareAtPoint(
      toUserSpace(canvasRef.current?.getBoundingClientRect(), view, clientX, clientY),
    );

  /** The topmost token standing on a square - the one the SVG would have
      drawn last, and so the one a click means. */
  const tokenAt = (at: Square | null) => {
    if (!at) return null;
    const standing = tokens.filter((t) => t.at.x === at.x && t.at.y === at.y);
    if (standing.length === 0) return null;
    return standing.reduce((top, t) => (proj.depthOf(t.at) >= proj.depthOf(top.at) ? t : top));
  };

  return (
    <canvas
      ref={canvasRef}
      className="dmap glmap"
      style={{ '--map-ratio': `${proj.w} / ${proj.h}` } as CSSProperties}
      role="img"
      aria-label={`Tactical view of the map from seed ${dungeon.seed}`}
      onContextMenu={cam.onContextMenu}
      onPointerDown={(e) => {
        if (!dragging.current && cam.onPointerDown(e)) return;
        if (e.button !== 0) return;
        const at = squareAt(e.clientX, e.clientY);
        const token = tokenAt(at);
        if (token) {
          dragging.current = token.id;
          dragTravelled.current = false;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          return;
        }
        if (!onPaint || !at) return;
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
        if (dragging.current && !dragTravelled.current) onTokenClick?.(dragging.current);
        dragging.current = null;
        brushDown.current = false;
        lastPainted.current = null;
      }}
      onPointerCancel={(e) => {
        cam.onPointerUp(e);
        dragging.current = null;
        brushDown.current = false;
        lastPainted.current = null;
      }}
      onPointerLeave={() => {
        if (cam.active()) return;
        dragging.current = null;
        brushDown.current = false;
        lastPainted.current = null;
        lastHover.current = null;
        onHover?.(null);
      }}
      onDoubleClick={(e) => {
        const token = tokenAt(squareAt(e.clientX, e.clientY));
        if (token) onTokenOpen?.(token.id);
      }}
    />
  );
}

const mergeLines = (a: Float32Array, b: Float32Array): Float32Array => {
  const out = new Float32Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
};

/**
 * Watch the root element's `data-theme`, the attribute `theme.ts` writes.
 * A hook rather than an effect inline so the observer's lifetime is plainly
 * the component's.
 */
function useThemeObserver(onTheme: (theme: 'light' | 'dark') => void): void {
  useEffect(() => {
    const root = document.documentElement;
    const read = () => onTheme(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, [onTheme]);
}
