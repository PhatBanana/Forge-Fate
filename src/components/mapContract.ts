import type { Dungeon } from '../engine/dungeon';
import type { Square } from '../encounter';
import type { ElevationMap, TerrainMap } from '../terrain';
import type { Token } from './DungeonMap';
import type { Camera } from '../engine/camera';

/**
 * §104: the map's whole contract, one named interface for all three
 * renderers - the top-down SVG (`DungeonMap`), the isometric SVG
 * (`IsoMap`) and the WebGL view (`GlIsoMap`).
 *
 * §66 named the tactical half of this (`IsoMapProps`) precisely so "a
 * prop added to one renderer can't silently never reach the other" - and
 * then the top-down map's props stayed an anonymous inline type, and the
 * battle screen spread one untyped literal into all three. A JSX spread
 * from a variable gets no excess-property check, so when §81 gave the
 * top-down map `sprung`, nothing said the tactical view never learned
 * the word: sprung traps were simply invisible through FFT's lens. This
 * module is the fix as a seam: the shared core is one interface, each
 * projection declares its own extras, and the caller's literal is typed
 * - so the next dropped prop is a compile error, not a quiet absence.
 */

export interface MapZone {
  id: string;
  label: string;
  tint: number;
  origin: Square;
  squares: Square[];
  /** A footprint being previewed, not a zone that exists. */
  ghost?: boolean;
}

/** What every projection of the battlefield answers. */
export interface MapCoreProps {
  dungeon: Dungeon;
  /** §81: traps already set off, by square key, drawn for everyone -
      that is what being sprung means, in every projection. */
  sprung?: string[];
  tokens?: Token[];
  /** What the DM painted onto squares. See `terrain.ts`. */
  terrain?: TerrainMap;
  /** Z per square, in steps. Level 0 is the floor and is not stored. */
  elevation?: ElevationMap;
  /** Sight lines from the selected combatant, drawn over everything. */
  sight?: { from: Square; to: Square; visible: boolean }[];
  /** §88: telegraphed enemy turns - the walk dashed, the strike solid. */
  intents?: { from: Square; to: Square; walk?: boolean }[];
  /** Areas of effect, squares precomputed so the map stays a drawing. */
  zones?: MapZone[];
  /** Squares the selected combatant can still reach, washed under the
      tokens. The dash tier is what a Dash would add, drawn apart. */
  reach?: { at: Square; dash?: boolean }[];
  /** The hovered square, outlined while a tool is armed. */
  cursor?: Square | null;
  /** One short line - the ruler, mostly. Rides `noteAt` when given. */
  note?: string;
  /** Where the note floats, clamped inside the drawing. */
  noteAt?: Square | null;
  /** The measurement being read: the walked route, origin to cursor. */
  ruler?: { points: Square[] } | null;
  /** The lob being aimed, drawn as X-COM draws a grenade. */
  arc?: { from: Square; to: Square } | null;
  /** Fog of war: what the party sees now, and what it has seen before.
      Squares in neither set are dark; explored-but-unseen are dim. */
  fog?: { visible: Set<string>; explored: Set<string> } | null;
  /** How dark each square is, by key - only the ones that are not
      bright. Under the fog: the fog is what the party knows, the gloom
      is what is there. */
  gloom?: Record<string, 'dim' | 'dark' | 'magical-dark'>;
  onMove?: (id: string, to: Square) => void;
  /** Present while a terrain brush is selected; once per square entered. */
  onPaint?: (at: Square) => void;
  /** The hovered square changed. Fired once per square, null on leaving. */
  onHover?: (at: Square | null) => void;
  /** A token was clicked without being dragged. Targeting, mostly. */
  onTokenClick?: (id: string) => void;
  /** A token was double-clicked: open the full thing. */
  onTokenOpen?: (id: string) => void;
  /** Where the camera is looking. Omitted means the whole map. */
  camera?: Camera;
  /** Present to make the map pannable and zoomable. See `useMapCamera`. */
  onCamera?: (next: Camera) => void;
  /** A square to keep in sight - whoever's turn it is. */
  focus?: Square | null;
}

/** The isometric projections' extras - the SVG and GL tactical views. */
export interface IsoExtraProps {
  /** Which way the camera faces: 0-3, a quarter turn each - FFT's L1/R1. */
  orientation?: number;
}

/** The top-down projection's extras - the one that prints and paints. */
export interface TopDownExtraProps {
  /** §81: the DM's own view of the furniture. In the editor a hidden room
      is drawn dashed and every trap is marked; at the table it is false. */
  authoring?: boolean;
  /** §73: a paint stroke ended (pointer up or gone). Lets a rectangle
      tool commit on release rather than guessing from per-square calls. */
  onPaintEnd?: () => void;
}
