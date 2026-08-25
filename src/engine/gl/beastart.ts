import type { BeastFamily, BeastHue } from '../beasts';
import type { Rgb } from './types';

/**
 * The fifteen monster bodies: pixel art as data (§149).
 *
 * Same argument as the class sprites (§67) - no binary assets, diffable in
 * review, testable in node, themeable by swapping a palette, and authored
 * right here so there is never a question about where the art came from.
 * What is different is the axis of variety. A class varies by *prop*: same
 * body, different tool. A monster varies by *shape and colour*, because a
 * goblin and an owlbear are not the same silhouette holding different
 * things, and a red dragon and a white one are the same silhouette exactly.
 *
 *   fifteen bodies  x  a colour per monster  x  a scale per size
 *
 * ## Why these are bigger than the class sprites
 *
 * A class sprite is 12x18 and reads as a party member seen from across a
 * battlefield. A monster is what the table is looking *at*, so these are
 * 16x20 with three tones on the body rather than one - Doom's trick, where
 * the enemy is the most detailed thing on screen and everything else is
 * geometry. The extra rows go into the silhouette, which is what a player
 * actually reads at a glance: wings out, four legs, no legs at all.
 *
 * ## Three tones from one colour
 *
 * `D` and `L` are not authored. They are the monster's own primary, shaded
 * and lit, computed at raster time - which is the whole reason ten dragon
 * colours cost one body. Author the form once in P/D/L and every recolour
 * keeps its shading for free, instead of ten hand-shaded dragons that drift
 * apart the first time the body is edited.
 *
 * ## The palette legend
 *
 * `.` empty · `O` outline · `P` primary · `D` primary, shaded ·
 * `L` primary, lit · `Q` secondary · `M` bone, claw and metal · `G` glow
 */

export const BEAST_W = 16;
export const BEAST_H = 20;

export type BeastIndex = '.' | 'O' | 'P' | 'D' | 'L' | 'Q' | 'M' | 'G';

export const BEAST_INDICES = new Set<string>(['.', 'O', 'P', 'D', 'L', 'Q', 'M', 'G']);

/** What a monster is doing. Fewer than a character's: a monster does not sneak. */
export type BeastPose = 'idle' | 'battle' | 'down';
export const BEAST_POSES: BeastPose[] = ['idle', 'battle', 'down'];

/* ------------------------------------------------------------ the bodies */

/* Upright, armed, shoulders squared. The goblins, orcs and bandits. */
const HUMANOID = [
  '................',
  '.....OOOO.......',
  '....OLPPDO......',
  '....OPGPGO......',
  '....OPPPPO......',
  '.....OPPO.......',
  '...OOPPPPOO.....',
  '..OQLPPPPDQO....',
  '..OQPPPPPPQO....',
  '..OPPPPPPPPO....',
  '...OPPPPPPO.....',
  '...OQQQQQQO.....',
  '...OQQ..QQO.....',
  '...OQO..OQO.....',
  '...OQO..OQO.....',
  '...ODO..ODO.....',
  '...ODO..ODO.....',
  '..OOOO..OOOO....',
  '................',
  '................',
];

/* Four legs, low to the ground, a tail behind. Wolves, bears, boars. */
const BEAST = [
  '................',
  '................',
  '................',
  '................',
  '..OOO...........',
  '.OLPPO..........',
  '.OPGPPOOOOOO....',
  'OMPPPPPPPPPPO...',
  'OMOPPLLPPPPPPO..',
  '.OOPPPPPPPPPPOO.',
  '..OPPPPPPPPPPDQO',
  '..ODPPPPPPPPDOQO',
  '..ODDPPPPPPDDO..',
  '..OQOO..OOQOO...',
  '..OQO....OQO....',
  '..ODO....ODO....',
  '..ODO....ODO....',
  '..OOO....OOO....',
  '................',
  '................',
];

/* Wings out, neck up, tail coiled under. One body, forty-three dragons. */
const DRAGON = [
  '......OOOO......',
  '.....OLPPDO.....',
  '.....OGPPGO.....',
  '.OO...OPPO...OO.',
  'OQQO..OPPO..OQQO',
  'OQQQO.OPPO.OQQQO',
  'OQQQQOOPPOOQQQQO',
  'OQQQQQLPPDQQQQQO',
  'OQQQQQPPPPQQQQQO',
  '.OQQQOPPPPOQQQO.',
  '..OQQOPPPPOQQO..',
  '...OOOLPPDOOO...',
  '.....OPPPPO.....',
  '....OPPPPPPO....',
  '....ODPPPPDO....',
  '...OPPO..OPPO...',
  '...OMO....OMO...',
  '...OOO....OOO...',
  '................',
  '................',
];

/* Bone. Thin, ribbed, and lit where a face used to be. */
const UNDEAD = [
  '................',
  '.....OOOO.......',
  '....OMMMMO......',
  '....OMGMGO......',
  '....OMMMMO......',
  '.....OMMO.......',
  '...OOMMMMOO.....',
  '..OMOMMMMOMO....',
  '..OM.OMMO.MO....',
  '..OM.OMMO.MO....',
  '..OO.OMMO.OO....',
  '.....OMMO.......',
  '....OMMMMO......',
  '....OMO.OMO.....',
  '....OMO.OMO.....',
  '....OMO.OMO.....',
  '....OMO.OMO.....',
  '...OOO..OOO.....',
  '................',
  '................',
];

/* Broad enough that the shoulders leave the square. Ogres and giants. */
const GIANT = [
  '................',
  '......OOOO......',
  '.....OLPPDO.....',
  '.....OGPPGO.....',
  '.....OPPPPO.....',
  '..OOOOOPPOOOOO..',
  '.OQLPPPPPPPPDQO.',
  'OQQPPPPPPPPPPQQO',
  'OQQPPPPPPPPPPQQO',
  'OQOPPPPPPPPPPOQO',
  'OMO.OPPPPPPO.OMO',
  '....ODPPPPDO....',
  '...OQQQQQQQQO...',
  '...OQQQOOQQQO...',
  '...OQQO..OQQO...',
  '...OQO....OQO...',
  '...ODO....ODO...',
  '..OOOO....OOOO..',
  '................',
  '................',
];

/* Horns, a wing on each side, and a tail. The things from below. */
const FIEND = [
  '................',
  '..OO......OO....',
  '..OMO....OMO....',
  '...OOOOOOOO.....',
  '...OLPGPGPO.....',
  '...OPPPPPPO.....',
  '.OO.OPPPPO.OO...',
  'OQQOOPPPPOOQQO..',
  'OQQQQLPPDQQQQO..',
  'OQQQQPPPPQQQQO..',
  '.OQQOPPPPOQQO...',
  '..OOOPPPPOOO....',
  '....ODPPDO..OQ..',
  '...OQQQQQQO.OQ..',
  '...OQO..OQOOQ...',
  '...OQO..OQQQ....',
  '...OMO..OMO.....',
  '..OOO....OOO....',
  '................',
  '................',
];

/* Wings up rather than out, and lit from inside. Devas and unicorns. */
const CELESTIAL = [
  '.....OGGGO......',
  '....OG...GO.....',
  '.....OOOO.......',
  'OO..OLPPDO..OO..',
  'OQO.OPGPGO.OQO..',
  'OQQO.OPPO.OQQO..',
  'OQQQOOPPOOQQQO..',
  'OQQQQLPPDQQQQO..',
  'OQQQQPPPPQQQQO..',
  'OQQQOPPPPOQQQO..',
  '.OQOOPPPPOOQO...',
  '..OOOPPPPOOO....',
  '....OPPPPO......',
  '....OQQQQO......',
  '....OQQQQO......',
  '....OQO.OQO.....',
  '....ODO.ODO.....',
  '...OOO...OOO....',
  '................',
  '................',
];

/* Small, quick, and off the ground. Sprites, dryads, blink dogs. */
const FEY = [
  '................',
  '................',
  '................',
  '.......OOO......',
  '......OLPDO.....',
  '......OGPGO.....',
  '.OO....OPO......',
  'OQQO..OOPOO..OO.',
  '.OQQOOQPPQOOQQO.',
  '..OQQQPPPPQQQO..',
  '...OOOPPPPOOO...',
  '......OPPO......',
  '.....OQQQQO.....',
  '.....OQO.OQO....',
  '.....ODO.ODO....',
  '.....OO...OO....',
  '................',
  '................',
  '................',
  '................',
];

/* No legs. It is a column of the thing it is made of, and it moves. */
const ELEMENTAL = [
  '................',
  '.....OGGGO......',
  '....OLPGPLO.....',
  '...OPPGGGPPO....',
  '...OPLPPPLPO....',
  '..OPPPPPPPPO....',
  '..OPLPPPPLPO....',
  '..OPPPPPPPPO....',
  '..ODPPPPPPDO....',
  '...OPPPPPPO.....',
  '...ODPPPPDO.....',
  '....OPPPPO......',
  '....ODPPDO......',
  '.....OPPO.......',
  '.....ODDO.......',
  '....OQQQQO......',
  '...OQQQQQQO.....',
  '..OQQQQQQQQO....',
  '................',
  '................',
];

/* Blocks, hinges and a lit core. Golems, armour, guardians. */
const CONSTRUCT = [
  '................',
  '....OOOOOO......',
  '....OMLPDMO.....',
  '....OMGPGMO.....',
  '....OOOOOOO.....',
  '.....OPPPO......',
  '..OOOOOOOOOO....',
  '..OMPPPPPPMO....',
  '..OMPPGGPPMO....',
  '..OMPPGGPPMO....',
  '..OMPPPPPPMO....',
  '..OOOPPPPOOO....',
  '....OPPPPO......',
  '...OMPPPPMO.....',
  '...OMO..OMO.....',
  '...OMO..OMO.....',
  '...OMO..OMO.....',
  '..OOOO..OOOO....',
  '................',
  '................',
];

/* A trunk and what grows off it. Treants, shambling mounds, fungi. */
const PLANT = [
  '................',
  '..OQO....OQO....',
  '.OQQQO..OQQQO...',
  'OQQQQQOOQQQQQO..',
  '.OQQQQQQQQQQO...',
  '..OQQQGQQGQQO...',
  '...OQQQQQQQO....',
  '....OLPPPDO.....',
  '....OPPPPPO.....',
  '...OPPPPPPPO....',
  '...OPPPPPPPO....',
  '...OPDPPDPPO....',
  '...OPPPPPPPO....',
  '...ODPPPPPDO....',
  '..OPPO..OPPO....',
  '..OPO....OPO....',
  '.OOO......OOO...',
  '................',
  '................',
  '................',
];

/* No shape of its own. It is the floor with an appetite. */
const OOZE = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.......OO.......',
  '.....OOPPOO.....',
  '...OOPPPPPPOO...',
  '..OPLPPPPPPLPO..',
  '.OPPPPGPPGPPPPO.',
  '.OPPPPPPPPPPPPO.',
  'OPPPPPPPPPPPPPPO',
  'OPDPPPPPPPPPPDPO',
  'ODDPPPPPPPPPPDDO',
  'ODDDPPPPPPPPDDDO',
  '.OODDDDDDDDDDOO.',
  '...OOOOOOOOOO...',
  '................',
  '................',
];

/* Off the ground, too many eyes, and reaching. */
const ABERRATION = [
  '................',
  '......OOOO......',
  '....OOPPPPOO....',
  '...OPPGPPGPPO...',
  '..OPLPPPPPPLPO..',
  '..OPPPGPPGPPPO..',
  '..OPPPPPPPPPPO..',
  '..ODPPPPPPPPDO..',
  '...OMPPPPPPMO...',
  '....OOMMMMOO....',
  '..OQO.OQQO.OQO..',
  '.OQQO.OQQO.OQQO.',
  '.OQO..OQQO..OQO.',
  'OQQO..OQO....OQO',
  'OQO...OQO....OQO',
  'OQO...OO......OO',
  'OO..............',
  '................',
  '................',
  '................',
];

/* Not one thing. A cloud of small ones, which is what makes it frightening. */
const SWARM = [
  '................',
  '....O..O...O....',
  '..O...OOO..O.O..',
  '.O.OO.OGO.OO..O.',
  '..OOO.OOO..OOO..',
  'O.OGO.OOO.OGO.O.',
  '.OOO.OOOOO.OOO..',
  'O.O.OOOGOOO.O.O.',
  '..OOOOOOOOOOO...',
  '.O.OOOGOGOOO.O..',
  '..OOOOOOOOOOO...',
  'O.O.OOOOOOO.O.O.',
  '..OOO.OOO.OOO...',
  '.O.OO.OGO.OO.O..',
  '..O...OOO...O...',
  '...O..OOO..O....',
  '....O.O.O.O.....',
  '................',
  '................',
  '................',
];

/* Too many limbs and the wrong number of heads. Everything else. */
const MONSTROSITY = [
  '................',
  '...OO.....OO....',
  '..OLPO...OPDO...',
  '..OGPO...OPGO...',
  '..OPPOOOOOPPO...',
  '..OPPPLPPDPPO...',
  '.OOPPPPPPPPPOO..',
  'OMOPPPPPPPPPPOMO',
  'OMOPPMMMMPPPPOMO',
  'OMODPPPPPPPPDOMO',
  '.OOOPPPPPPPPOOO.',
  '...OPPPPPPPPO...',
  '...ODPPPPPPDO...',
  '..OPPO....OPPO..',
  '..OPO......OPO..',
  '..OMO......OMO..',
  '..OOO......OOO..',
  '................',
  '................',
  '................',
];

/* Whatever it was, it is a heap now. Shared: a dead thing is a dead thing. */
const DOWN = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '...OOOO.........',
  '..OLPPPOOOOO....',
  '..OPPPPPPPPDO...',
  '..ODPPDPPPDDO...',
  '..OODDDDDDDOO...',
  '....OOOOOOO.....',
  '................',
];

export const BEAST_BODIES: Record<BeastFamily, string[]> = {
  humanoid: HUMANOID,
  beast: BEAST,
  dragon: DRAGON,
  undead: UNDEAD,
  giant: GIANT,
  fiend: FIEND,
  celestial: CELESTIAL,
  fey: FEY,
  elemental: ELEMENTAL,
  construct: CONSTRUCT,
  plant: PLANT,
  ooze: OOZE,
  aberration: ABERRATION,
  swarm: SWARM,
  monstrosity: MONSTROSITY,
};

/* ------------------------------------------------------------- the rage */

type Px = [number, number, BeastIndex];

/**
 * What a body does when the fight starts, as a sparse overlay.
 *
 * The same economy the class props use, for the same reason: eighteen
 * mostly-empty rows per family per pose would bury the art in filler, and
 * the difference between at-ease and fighting is a dozen pixels - a raised
 * blade, a lit mouth, a limb that was not out a moment ago. Drawing thirty
 * bodies instead of fifteen would double the art to say the same thing.
 *
 * Every one of these is a *silhouette* change somewhere. A body that only
 * brightened its eyes would read as the same picture, and a table glancing
 * at the board would not see that anything had happened.
 */
const RAGE: Record<BeastFamily, Px[]> = {
  // A blade comes up in the near hand.
  humanoid: [[1, 3, 'M'], [1, 4, 'M'], [1, 5, 'M'], [1, 6, 'M'], [0, 7, 'O'], [2, 7, 'O'], [1, 7, 'Q']],
  // Hackles up, jaws open on teeth.
  beast: [[2, 3, 'O'], [4, 3, 'O'], [6, 3, 'O'], [0, 9, 'M'], [1, 9, 'M'], [0, 10, 'M'], [1, 8, 'G']],
  // The breath is coming, and the mouth is already lit for it.
  dragon: [[7, 3, 'G'], [8, 3, 'G'], [4, 2, 'G'], [4, 3, 'G'], [5, 3, 'G'], [4, 4, 'G'], [5, 4, 'G']],
  // A hand out, and the sockets burn through.
  undead: [[1, 7, 'M'], [0, 7, 'M'], [0, 6, 'M'], [5, 3, 'G'], [7, 3, 'G'], [14, 7, 'M'], [15, 7, 'M']],
  // Both arms up. There is nothing subtle about a giant.
  giant: [[0, 5, 'O'], [1, 5, 'M'], [14, 5, 'M'], [15, 5, 'O'], [1, 4, 'M'], [14, 4, 'M']],
  // Wings snap wide and the tail comes round.
  fiend: [[0, 6, 'Q'], [0, 7, 'Q'], [13, 6, 'Q'], [13, 7, 'Q'], [14, 13, 'Q'], [14, 12, 'Q'], [15, 12, 'O']],
  // The halo flares and the blade comes down.
  celestial: [[5, 0, 'G'], [9, 0, 'G'], [13, 8, 'M'], [13, 9, 'M'], [13, 10, 'M'], [13, 11, 'O']],
  // Small things get faster rather than bigger.
  fey: [[1, 6, 'Q'], [2, 6, 'Q'], [13, 6, 'Q'], [14, 6, 'Q'], [6, 4, 'G'], [9, 4, 'G']],
  // It stops being a column and becomes a wave.
  elemental: [[2, 4, 'G'], [12, 4, 'G'], [1, 5, 'P'], [13, 5, 'P'], [1, 6, 'O'], [13, 6, 'O']],
  // The core opens. That is the tell, and it is the only one it gives.
  construct: [[6, 7, 'G'], [7, 7, 'G'], [0, 7, 'O'], [1, 7, 'M'], [12, 7, 'M'], [13, 7, 'O']],
  // Roots come up out of the floor.
  plant: [[1, 14, 'Q'], [1, 15, 'Q'], [13, 14, 'Q'], [13, 15, 'Q'], [0, 15, 'O'], [14, 15, 'O']],
  // A pseudopod, which is the only gesture it has.
  ooze: [[3, 5, 'P'], [3, 6, 'P'], [2, 6, 'O'], [4, 6, 'O'], [3, 4, 'G'], [3, 7, 'P']],
  // Everything reaches at once.
  aberration: [[0, 9, 'Q'], [1, 9, 'Q'], [14, 9, 'Q'], [15, 9, 'Q'], [0, 8, 'O'], [15, 8, 'O']],
  // It spreads. There is more of it than there was.
  swarm: [[0, 1, 'O'], [15, 1, 'O'], [0, 15, 'O'], [15, 15, 'O'], [1, 2, 'G'], [14, 2, 'G']],
  // Both heads look at you at once.
  monstrosity: [[3, 2, 'G'], [11, 2, 'G'], [0, 6, 'M'], [15, 6, 'M'], [1, 13, 'M'], [14, 13, 'M']],
};

/* ----------------------------------------------------------- composition */

/**
 * The finished grid for a family in a pose. Fresh arrays; the bodies above
 * are never mutated.
 *
 * `down` is shared and takes no overlay - whatever it was, it is a heap now,
 * and fifteen bespoke corpses would be fifteen grids saying one thing.
 */
export function beastSprite(family: BeastFamily, pose: BeastPose): string[] {
  if (pose === 'down') return [...DOWN];
  const rows = BEAST_BODIES[family].map((row) => row.split(''));
  if (pose === 'battle') {
    for (const [x, y, index] of RAGE[family]) rows[y][x] = index;
  }
  return rows.map((row) => row.join(''));
}

/** Primary, shaded and lit. The three tones that come free with one colour. */
const shaded = ([r, g, b]: Rgb, factor: number): Rgb => [
  Math.min(1, r * factor),
  Math.min(1, g * factor),
  Math.min(1, b * factor),
];

/** The colours every monster shares, whatever it is made of. */
export const BEAST_SHARED: Record<'O' | 'M', Rgb> = {
  O: [0.06, 0.05, 0.05],
  M: [0.88, 0.86, 0.78],
};

/** What a palette index resolves to for one monster. Null for `.`. */
export function beastColorOf(index: BeastIndex, hue: BeastHue): Rgb | null {
  switch (index) {
    case '.':
      return null;
    case 'P':
      return hue.primary;
    case 'D':
      return shaded(hue.primary, 0.62);
    case 'L':
      return shaded(hue.primary, 1.35);
    case 'Q':
      return hue.secondary;
    case 'G':
      return hue.glow;
    default:
      return BEAST_SHARED[index];
  }
}
