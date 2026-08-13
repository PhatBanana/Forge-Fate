import type { Square } from '../../encounter';
import { keyOf } from '../../terrain';
import type { IsoProjection } from '../iso';
import type { Palette } from './palette';
import { WHITE, finishMesh, newMesh, pushQuad, pushVertex } from './types';
import type { Mesh, Rgba } from './types';

/**
 * The washes: translucent diamonds on cells' top faces.
 *
 * One builder per layer rather than one big one, because they change at
 * different speeds - the reach changes when somebody arms a walk, the fog
 * when anybody steps, the zones when a spell lands - and per-layer meshes
 * mean a step re-uploads the fog's few kilobytes and nothing else.
 *
 * Layer order and depth behavior are the renderer's business; these builders
 * only promise the same squares the SVG tints, at the same drawn heights
 * (`drawZ`, so a wash on a wall cap sits on the cap).
 */

/** A tinted diamond per entry, at the square's drawn height. */
export function diamondWash(
  entries: { at: Square; color: Rgba }[],
  proj: IsoProjection,
): Mesh {
  const mesh = newMesh();
  for (const { at, color } of entries) {
    const corners = proj.faceCorners(at, proj.drawZ(at));
    const depth = proj.depthOf(at);
    const ids = corners.map(([x, y]) =>
      pushVertex(mesh, x, y, depth, WHITE.u0, WHITE.v0, color),
    );
    pushQuad(mesh, ids[0], ids[1], ids[2], ids[3]);
  }
  return finishMesh(mesh);
}

export const reachWash = (
  reach: { at: Square; dash?: boolean }[],
  proj: IsoProjection,
  palette: Palette,
): Mesh =>
  diamondWash(
    reach.map(({ at, dash }) => ({ at, color: dash ? palette.reachDash : palette.reach })),
    proj,
  );

export function zoneWash(
  zones: { tint: number; squares: Square[]; ghost?: boolean }[],
  proj: IsoProjection,
  palette: Palette,
): Mesh {
  const entries = zones.flatMap((zone) => {
    const base = palette.zones[((zone.tint % 4) + 4) % 4];
    const color: Rgba = zone.ghost
      ? [base[0], base[1], base[2], base[3] * palette.ghostAlpha]
      : base;
    return zone.squares.map((at) => ({ at, color }));
  });
  return diamondWash(entries, proj);
}

export function gloomWash(
  gloom: Record<string, 'dim' | 'dark' | 'magical-dark'> | undefined,
  ground: Square[],
  proj: IsoProjection,
  palette: Palette,
): Mesh {
  const tint: Record<'dim' | 'dark' | 'magical-dark', Rgba> = {
    dim: palette.gloomDim,
    dark: palette.gloomDark,
    'magical-dark': palette.gloomMagicalDark,
  };
  const entries = gloom
    ? ground
        .filter((at) => !!gloom[keyOf(at)])
        .map((at) => ({ at, color: tint[gloom[keyOf(at)]] }))
    : [];
  return diamondWash(entries, proj);
}

/**
 * The fog, exactly as the SVG layers it: never-seen is a near-opaque diamond
 * (over tokens and walls alike - a pawn on an unseen square must not show),
 * seen-before is a dimming, in-sight is nothing at all.
 */
export function fogWash(
  fog: { visible: Set<string>; explored: Set<string> } | null,
  ground: Square[],
  proj: IsoProjection,
  palette: Palette,
): Mesh {
  const entries = fog
    ? ground
        .filter((at) => !fog.visible.has(keyOf(at)))
        .map((at) => ({
          at,
          color: fog.explored.has(keyOf(at)) ? palette.fogKnown : palette.fogUnknown,
        }))
    : [];
  return diamondWash(entries, proj);
}

export const cursorWash = (
  cursor: Square | null,
  proj: IsoProjection,
  palette: Palette,
): Mesh =>
  diamondWash(cursor ? [{ at: cursor, color: palette.cursor }] : [], proj);
