import type { Rgb } from './types';

/**
 * The class sprites: pixel art as data (§67).
 *
 * ## Why strings and not image files
 *
 * The repo ships no binary assets and this section does not start. A sprite
 * here is rows of palette indices - `'..OSSO..'` - which is diffable in a
 * code review, testable in node (every grid is checked for size and legal
 * indices, and poses are checked to actually differ), themeable by swapping
 * the palette, and free of any question about where the art came from: it is
 * authored right here, deliberately *vague* - a silhouette, a stance and two
 * class colors, not a portrait.
 *
 * ## How seventeen classes stay one family
 *
 * Nobody draws seventeen characters four times. A sprite is composed:
 *
 *   base pose  (shared body: idle, battle, sneak, down)
 * + prop overlay (the class's tool, drawn for idle and battle)
 * + class palette (primary, secondary, glow)
 *
 * Ten props and four bodies cover every class, which is both the economy and
 * the aesthetic: PS1 party sprites read as a *set* because they shared bones
 * and swapped gear, and that is exactly what this does. Sneak and down carry
 * no prop - a crouched silhouette with a sword sticking up is not sneaking,
 * and a dropped weapon reads better as absence.
 *
 * ## The palette legend
 *
 * `.` empty · `O` ink outline · `S` skin · `H` hair · `P` primary ·
 * `Q` secondary · `M` metal · `W` wood · `G` glow (class accent)
 */

export const SPRITE_W = 12;
export const SPRITE_H = 18;

export type SpriteIndex = '.' | 'O' | 'S' | 'H' | 'P' | 'Q' | 'M' | 'W' | 'G';

export type Pose = 'idle' | 'battle' | 'sneak' | 'down';
export const POSES: Pose[] = ['idle', 'battle', 'sneak', 'down'];

/* ------------------------------------------------------------- the bodies */

const IDLE = [
  '....OOOO....',
  '...OSSSSO...',
  '...OSSSSO...',
  '....OSSO....',
  '...OPPPPO...',
  '..OPPPPPPO..',
  '..OPPPPPPO..',
  '..OPPPPPPO..',
  '..OSPPPPSO..',
  '...OPPPPO...',
  '...OQQQQO...',
  '...OQQQQO...',
  '...OQ..QO...',
  '...OQ..QO...',
  '...OQ..QO...',
  '...OQ..QO...',
  '..OOO..OOO..',
  '............',
];

/* Legs apart, weapon hand raised high on the left, off hand forward. */
const BATTLE = [
  '.....OOOO...',
  '....OSSSSO..',
  '....OSSSSO..',
  '.....OSSO...',
  '..S..OPPPO..',
  '..O.OPPPPPO.',
  '..OOPPPPPPO.',
  '...OPPPPPPS.',
  '...OPPPPPPO.',
  '....OPPPPO..',
  '...OQQQQQO..',
  '...OQQ.QQO..',
  '..OQQ...QQO.',
  '..OQ.....QO.',
  '..OQ.....QO.',
  '..OO.....OO.',
  '.OOO.....OOO',
  '............',
];

/* Crouched under the hood, low and compact. */
const SNEAK = [
  '............',
  '............',
  '............',
  '....OOOO....',
  '...OPPPPO...',
  '...OPSSPO...',
  '..OPPPPPPO..',
  '..OPPPPPPO..',
  '..OSPPPPSO..',
  '..OPPPPPPO..',
  '...OQQQQO...',
  '..OQQ..QQO..',
  '..OQ....QO..',
  '..OO....OO..',
  '.OOO....OOO.',
  '............',
  '............',
  '............',
];

/* Flat on the ground. No prop: it fell somewhere. */
const DOWN = [
  '............',
  '............',
  '............',
  '............',
  '............',
  '............',
  '............',
  '............',
  '............',
  '............',
  '............',
  '...OOOO.....',
  '..OSSSSOOOO.',
  '..OSSSPPPPO.',
  '..OSSSPPQQO.',
  '...OOOOOOOO.',
  '............',
  '............',
];

export const BASES: Record<Pose, string[]> = {
  idle: IDLE,
  battle: BATTLE,
  sneak: SNEAK,
  down: DOWN,
};

/* -------------------------------------------------------------- the props */

export type Prop =
  | 'sword'
  | 'axe'
  | 'bow'
  | 'dagger'
  | 'staff'
  | 'orb'
  | 'mace'
  | 'lute'
  | 'banner'
  | 'wrench';

/**
 * A prop is a sparse overlay: only its drawn pixels are listed, as
 * `[column, row, index]`, and they paint over the base. Sparse because most
 * of a prop's grid is empty and eighteen mostly-dot rows per prop per pose
 * would bury the art in filler.
 *
 * Battle variants sit in the raised hand (column 2, row 4 of BATTLE);
 * idle variants hang small at the hip or across the back.
 */
type Px = [number, number, SpriteIndex];

const PROPS: Record<Prop, { idle: Px[]; battle: Px[] }> = {
  sword: {
    battle: [[2, 0, 'M'], [2, 1, 'M'], [2, 2, 'M'], [2, 3, 'M'], [1, 4, 'W'], [3, 4, 'W']],
    idle: [[9, 9, 'W'], [10, 10, 'M'], [11, 11, 'M']],
  },
  axe: {
    battle: [[2, 1, 'W'], [2, 2, 'W'], [2, 3, 'W'], [3, 1, 'M'], [4, 1, 'M'], [3, 2, 'M']],
    idle: [[9, 9, 'W'], [10, 10, 'W'], [10, 9, 'M'], [11, 10, 'M']],
  },
  bow: {
    battle: [[1, 1, 'W'], [0, 2, 'W'], [0, 3, 'W'], [0, 4, 'W'], [0, 5, 'W'], [1, 6, 'W'], [2, 2, 'O'], [2, 5, 'O']],
    idle: [[9, 8, 'W'], [10, 9, 'W'], [10, 10, 'W'], [9, 11, 'W']],
  },
  dagger: {
    battle: [[2, 2, 'M'], [2, 3, 'M'], [2, 4, 'W']],
    idle: [[9, 10, 'M'], [10, 11, 'W']],
  },
  staff: {
    battle: [[2, 0, 'G'], [2, 1, 'W'], [2, 2, 'W'], [2, 3, 'W'], [2, 5, 'W'], [2, 6, 'W'], [2, 7, 'W'], [2, 8, 'W']],
    idle: [[9, 3, 'G'], [9, 4, 'W'], [9, 5, 'W'], [9, 6, 'W'], [9, 7, 'W'], [9, 8, 'W'], [9, 9, 'W'], [9, 10, 'W'], [9, 11, 'W']],
  },
  orb: {
    battle: [[9, 2, 'G'], [10, 2, 'G'], [9, 3, 'G'], [10, 3, 'G'], [11, 1, 'G'], [8, 4, 'G']],
    idle: [[9, 7, 'G'], [10, 7, 'G'], [9, 8, 'G'], [10, 8, 'G']],
  },
  mace: {
    battle: [[1, 0, 'M'], [2, 0, 'M'], [3, 0, 'M'], [1, 1, 'M'], [2, 1, 'M'], [3, 1, 'M'], [2, 2, 'W'], [2, 3, 'W']],
    idle: [[9, 9, 'M'], [10, 9, 'M'], [9, 10, 'W'], [10, 11, 'W']],
  },
  lute: {
    battle: [[8, 6, 'W'], [9, 6, 'W'], [8, 7, 'W'], [9, 7, 'W'], [8, 8, 'W'], [9, 8, 'W'], [10, 5, 'W'], [11, 4, 'O']],
    idle: [[8, 6, 'W'], [9, 6, 'W'], [8, 7, 'W'], [9, 7, 'W'], [8, 8, 'W'], [9, 8, 'W'], [10, 5, 'W'], [11, 4, 'O']],
  },
  banner: {
    battle: [[2, 0, 'W'], [2, 1, 'W'], [2, 2, 'W'], [2, 3, 'W'], [3, 0, 'G'], [4, 0, 'G'], [5, 0, 'G'], [3, 1, 'G'], [4, 1, 'G'], [3, 2, 'G']],
    idle: [[9, 2, 'W'], [9, 3, 'W'], [9, 4, 'W'], [9, 5, 'W'], [9, 6, 'W'], [9, 7, 'W'], [9, 8, 'W'], [9, 9, 'W'], [10, 2, 'G'], [11, 2, 'G'], [10, 3, 'G']],
  },
  wrench: {
    battle: [[2, 2, 'M'], [2, 3, 'M'], [2, 4, 'M'], [1, 2, 'M'], [3, 2, 'M']],
    idle: [[9, 10, 'M'], [10, 10, 'M'], [10, 11, 'M']],
  },
};

/* ------------------------------------------------------------ the classes */

export interface ClassArt {
  prop: Prop;
  primary: Rgb;
  secondary: Rgb;
  glow: Rgb;
}

/**
 * All seventeen classes, the four originals included. The colors are the
 * whole identity beyond the prop - a wizard and a sorcerer share a
 * silhouette and part at the palette, which is exactly how "vague" earns
 * its keep: enough to tell who is who across a table, never enough to
 * argue with anyone's own image of their character.
 */
export const CLASS_ART: Record<string, ClassArt> = {
  fighter: { prop: 'sword', primary: [0.42, 0.45, 0.52], secondary: [0.55, 0.2, 0.2], glow: [0.8, 0.8, 0.85] },
  paladin: { prop: 'sword', primary: [0.85, 0.78, 0.55], secondary: [0.9, 0.9, 0.92], glow: [1, 0.95, 0.6] },
  barbarian: { prop: 'axe', primary: [0.55, 0.35, 0.22], secondary: [0.4, 0.25, 0.18], glow: [0.8, 0.4, 0.2] },
  ranger: { prop: 'bow', primary: [0.25, 0.42, 0.28], secondary: [0.45, 0.35, 0.22], glow: [0.6, 0.75, 0.4] },
  rogue: { prop: 'dagger', primary: [0.25, 0.25, 0.3], secondary: [0.35, 0.2, 0.4], glow: [0.6, 0.6, 0.7] },
  monk: { prop: 'staff', primary: [0.75, 0.55, 0.3], secondary: [0.5, 0.3, 0.2], glow: [0.95, 0.8, 0.4] },
  bard: { prop: 'lute', primary: [0.5, 0.25, 0.45], secondary: [0.75, 0.6, 0.3], glow: [0.9, 0.7, 0.9] },
  cleric: { prop: 'mace', primary: [0.85, 0.85, 0.8], secondary: [0.7, 0.6, 0.3], glow: [1, 1, 0.8] },
  druid: { prop: 'staff', primary: [0.35, 0.5, 0.25], secondary: [0.5, 0.4, 0.25], glow: [0.7, 0.9, 0.4] },
  wizard: { prop: 'staff', primary: [0.25, 0.35, 0.6], secondary: [0.5, 0.55, 0.75], glow: [0.6, 0.8, 1] },
  sorcerer: { prop: 'orb', primary: [0.65, 0.25, 0.2], secondary: [0.85, 0.5, 0.25], glow: [1, 0.6, 0.3] },
  warlock: { prop: 'orb', primary: [0.4, 0.2, 0.5], secondary: [0.25, 0.4, 0.3], glow: [0.5, 1, 0.5] },
  artificer: { prop: 'wrench', primary: [0.6, 0.4, 0.25], secondary: [0.3, 0.5, 0.5], glow: [0.9, 0.7, 0.3] },
  reckoner: { prop: 'orb', primary: [0.35, 0.3, 0.25], secondary: [0.7, 0.55, 0.3], glow: [1, 0.8, 0.4] },
  harrier: { prop: 'bow', primary: [0.35, 0.4, 0.45], secondary: [0.25, 0.55, 0.5], glow: [0.6, 0.9, 0.8] },
  marshal: { prop: 'banner', primary: [0.6, 0.25, 0.25], secondary: [0.75, 0.65, 0.35], glow: [0.95, 0.85, 0.5] },
  adept: { prop: 'orb', primary: [0.45, 0.3, 0.55], secondary: [0.65, 0.65, 0.7], glow: [0.95, 0.5, 0.95] },
};

/** The colors every class shares. Skin is one fixed tone on purpose: these
    are game pieces, and a piece is not a claim about anybody's character. */
export const SHARED: Record<'O' | 'S' | 'H' | 'M' | 'W', Rgb> = {
  O: [0.08, 0.07, 0.06],
  S: [0.85, 0.65, 0.45],
  H: [0.3, 0.22, 0.15],
  M: [0.75, 0.78, 0.82],
  W: [0.5, 0.35, 0.2],
};

/* ------------------------------------------------------------ composition */

/**
 * The finished grid for a class in a pose: the base body with the class's
 * prop painted over it (idle and battle only - sneak and down go unarmed).
 * Returns fresh arrays; the bases are never mutated.
 */
export function spriteFor(classId: string, pose: Pose): string[] | null {
  const art = CLASS_ART[classId];
  if (!art) return null;
  const rows = BASES[pose].map((row) => row.split(''));
  if (pose === 'idle' || pose === 'battle') {
    for (const [x, y, index] of PROPS[art.prop][pose]) {
      rows[y][x] = index;
    }
  }
  return rows.map((row) => row.join(''));
}

/** The color a palette index resolves to for one class. Null for `.`. */
export function colorOf(index: SpriteIndex, art: ClassArt): Rgb | null {
  if (index === '.') return null;
  if (index === 'P') return art.primary;
  if (index === 'Q') return art.secondary;
  if (index === 'G') return art.glow;
  return SHARED[index];
}

export const LEGAL_INDICES = new Set<string>(['.', 'O', 'S', 'H', 'P', 'Q', 'M', 'W', 'G']);
