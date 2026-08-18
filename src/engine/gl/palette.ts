import type { Rgb, Rgba } from './types';

/**
 * The PS1 view's colors, per theme.
 *
 * TypeScript tables rather than CSS custom-property reads, and that is a
 * decision, not a shortcut: the SVG views color themselves through class
 * fills (`.iso-top`, `.iso-side.is-se`, …), not custom properties, so reading
 * the "same" colors back would mean probing dummy elements class by class -
 * and the PS1 look is deliberately its *own* crushed palette anyway, matched
 * to the app's parchment-and-ink mood rather than to its exact hexes. Two
 * tables the tests can read beat a runtime scrape of a stylesheet that was
 * never designed to be scraped.
 *
 * Every color is linear-ish sRGB in 0..1. The final RGB555 crush and Bayer
 * dither happen once, in the blit shader - these values are what the crush
 * quantises, so nothing here needs to be pre-banded.
 */
export interface Palette {
  /** What the void clears to - also the unexplored fog's color. */
  clear: Rgb;
  /** Cap colors by what the square is. */
  ground: Rgb;
  floor: Rgb;
  wall: Rgb;
  water: Rgb;
  /** Face shading: the cap keeps 1.0; the skirts step down from it. */
  seShade: number;
  swShade: number;
  neShade: number;
  nwShade: number;
  /** The movement wash, both tiers - translucent over the caps. */
  reach: Rgba;
  reachDash: Rgba;
  /** Zone tints 0-3, and the extra transparency a ghost preview gets. */
  zones: [Rgba, Rgba, Rgba, Rgba];
  ghostAlpha: number;
  /** The dark (§40), by level. */
  gloomDim: Rgba;
  gloomDark: Rgba;
  gloomMagicalDark: Rgba;
  /** Fog of war: seen-before, and the near-opaque never-seen. */
  fogKnown: Rgba;
  fogUnknown: Rgba;
  /** Lines. */
  sight: Rgba;
  sightBlocked: Rgba;
  /** §88's telegraphs: the walk to where a monster will stand, the strike. */
  intentWalk: Rgba;
  intentStrike: Rgba;
  ruler: Rgba;
  arc: Rgba;
  cursor: Rgba;
  /** Text sprite ink and the card chrome behind pawn initials. */
  ink: Rgb;
  paper: Rgb;
}

/** The parchment table under daylight. */
export const LIGHT: Palette = {
  clear: [0.16, 0.13, 0.10],
  ground: [0.82, 0.76, 0.64],
  floor: [0.87, 0.82, 0.70],
  wall: [0.55, 0.48, 0.38],
  water: [0.45, 0.58, 0.66],
  seShade: 0.72,
  swShade: 0.55,
  neShade: 0.80,
  nwShade: 0.64,
  reach: [0.95, 0.78, 0.30, 0.45],
  reachDash: [0.95, 0.62, 0.25, 0.30],
  zones: [
    [0.85, 0.35, 0.25, 0.4],
    [0.30, 0.55, 0.80, 0.4],
    [0.40, 0.70, 0.35, 0.4],
    [0.70, 0.45, 0.75, 0.4],
  ],
  ghostAlpha: 0.5,
  gloomDim: [0.15, 0.15, 0.25, 0.35],
  gloomDark: [0.08, 0.08, 0.18, 0.62],
  gloomMagicalDark: [0.10, 0.03, 0.16, 0.80],
  fogKnown: [0.12, 0.10, 0.08, 0.55],
  fogUnknown: [0.16, 0.13, 0.10, 0.96],
  sight: [0.30, 0.65, 0.35, 0.9],
  sightBlocked: [0.80, 0.30, 0.25, 0.9],
  intentWalk: [0.72, 0.35, 0.20, 0.55],
  intentStrike: [0.78, 0.22, 0.15, 0.95],
  ruler: [0.25, 0.22, 0.18, 0.95],
  arc: [0.85, 0.60, 0.20, 0.95],
  cursor: [1.0, 0.95, 0.75, 0.55],
  ink: [0.16, 0.13, 0.10],
  paper: [0.93, 0.89, 0.80],
};

/** The same table by candlelight. */
export const DARK: Palette = {
  clear: [0.05, 0.05, 0.08],
  ground: [0.30, 0.28, 0.24],
  floor: [0.36, 0.33, 0.28],
  wall: [0.20, 0.18, 0.16],
  water: [0.16, 0.26, 0.34],
  seShade: 0.68,
  swShade: 0.50,
  neShade: 0.78,
  nwShade: 0.60,
  reach: [0.95, 0.78, 0.30, 0.40],
  reachDash: [0.95, 0.62, 0.25, 0.26],
  zones: [
    [0.85, 0.35, 0.25, 0.4],
    [0.30, 0.55, 0.80, 0.4],
    [0.40, 0.70, 0.35, 0.4],
    [0.70, 0.45, 0.75, 0.4],
  ],
  ghostAlpha: 0.5,
  gloomDim: [0.05, 0.05, 0.15, 0.40],
  gloomDark: [0.02, 0.02, 0.10, 0.68],
  gloomMagicalDark: [0.08, 0.02, 0.12, 0.84],
  fogKnown: [0.03, 0.03, 0.05, 0.60],
  fogUnknown: [0.05, 0.05, 0.08, 0.97],
  sight: [0.35, 0.70, 0.40, 0.9],
  sightBlocked: [0.85, 0.35, 0.30, 0.9],
  intentWalk: [0.85, 0.45, 0.30, 0.55],
  intentStrike: [0.95, 0.35, 0.25, 0.95],
  ruler: [0.85, 0.80, 0.70, 0.95],
  arc: [0.90, 0.65, 0.25, 0.95],
  cursor: [1.0, 0.95, 0.75, 0.45],
  ink: [0.90, 0.87, 0.78],
  paper: [0.14, 0.13, 0.11],
};

export const paletteFor = (theme: 'light' | 'dark'): Palette =>
  theme === 'dark' ? DARK : LIGHT;

/**
 * The deterministic per-cell brightness jitter that sells "low-poly".
 *
 * A hash of the square, not a random - the same cell must shade the same on
 * every rebuild or the ground shimmers every time a float animates. The range
 * is ±4%, under the dither's own banding, so it reads as patchwork rather
 * than noise.
 */
export function cellJitter(x: number, y: number): number {
  let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
  h = (Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0) % 1000;
  return 0.96 + (h / 1000) * 0.08;
}
