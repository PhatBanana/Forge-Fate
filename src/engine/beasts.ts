import type { Rgb } from './gl/types';

/**
 * What a monster looks like, derived rather than drawn one at a time (§149).
 *
 * The bestiary is 334 stat blocks and nobody is drawing 334 monsters. The
 * class sprites (§67) already answered the same question for seventeen
 * classes - `base body + prop + palette` - and the answer generalises, but
 * the axes are different here:
 *
 *   family (what shape it is)  x  hue (what colour it is)  x  size (how big)
 *
 * Fifteen bodies, a colour per monster and a scale per size covers the whole
 * bestiary, and the dragons are the proof that this is the *bestiary's* own
 * structure rather than a convenience: an ancient red dragon and a white
 * dragon wyrmling are the same animal at two sizes in two colours, and the
 * ids say so out loud - `ancient-red-dragon`, `white-dragon-wyrmling`. Ten
 * colours and four ages give forty-three distinct dragons off one body.
 *
 * ## Why this module has no pixels in it
 *
 * The flat map wants a shape and a colour; the tactical view wants those
 * *and* twenty rows of art. Keeping the art in `gl/beastart.ts` and the
 * derivation here is what stops the top-down map bundling fifteen sprite
 * grids it will never rasterize.
 */

/** The fifteen bodies. One per creature type, near enough. */
export type BeastFamily =
  | 'humanoid'
  | 'beast'
  | 'dragon'
  | 'undead'
  | 'giant'
  | 'fiend'
  | 'celestial'
  | 'fey'
  | 'elemental'
  | 'construct'
  | 'plant'
  | 'ooze'
  | 'aberration'
  | 'swarm'
  | 'monstrosity';

export const FAMILIES: BeastFamily[] = [
  'humanoid',
  'beast',
  'dragon',
  'undead',
  'giant',
  'fiend',
  'celestial',
  'fey',
  'elemental',
  'construct',
  'plant',
  'ooze',
  'aberration',
  'swarm',
  'monstrosity',
];

/**
 * Which body stands for a stat block.
 *
 * The 5e type line does nearly all of it, because the type line is already a
 * statement about shape - that is what "ooze" means. Two exceptions earn
 * their conditionals: a *swarm of Tiny beasts* is a cloud rather than an
 * animal however the type reads, and a winged serpent filed under celestial
 * is a dragon to anyone looking at the table.
 */
export function familyOf(monster: { type: string; id?: string }): BeastFamily {
  const type = monster.type.toLowerCase();
  const id = monster.id ?? '';
  if (type.startsWith('swarm')) return 'swarm';
  // Winged serpents, whatever they are filed under.
  if (id === 'couatl' || id === 'wyvern') return 'dragon';
  const known = FAMILIES.find((family) => family === type);
  // Anything unrecognised is a monstrosity, which is what that word is for.
  return known ?? 'monstrosity';
}

/** The three colours a body is painted in. Shading is derived from these. */
export interface BeastHue {
  /** The body. Its lit and shaded tones come off this one automatically. */
  primary: Rgb;
  /** Wings, belly, cloth - whatever the body has a second surface of. */
  secondary: Rgb;
  /** Eyes, breath, fire. The one colour allowed to be loud. */
  glow: Rgb;
}

/**
 * The ten dragons, and the reason the whole scheme holds together.
 *
 * A dragon's id is `{age}-{colour}-dragon` or `{colour}-dragon-wyrmling`,
 * so the colour falls out of the string and the age falls out of the size
 * on the stat block. Nothing here is a list of forty-three dragons.
 */
const DRAGON_HUES: Record<string, BeastHue> = {
  black: { primary: [0.16, 0.15, 0.17], secondary: [0.3, 0.34, 0.28], glow: [0.5, 0.95, 0.3] },
  blue: { primary: [0.18, 0.34, 0.62], secondary: [0.35, 0.55, 0.8], glow: [0.75, 0.95, 1] },
  brass: { primary: [0.72, 0.58, 0.28], secondary: [0.85, 0.75, 0.45], glow: [1, 0.8, 0.4] },
  bronze: { primary: [0.55, 0.42, 0.22], secondary: [0.7, 0.6, 0.35], glow: [0.9, 0.95, 1] },
  copper: { primary: [0.66, 0.35, 0.2], secondary: [0.5, 0.6, 0.45], glow: [0.95, 0.6, 0.35] },
  gold: { primary: [0.82, 0.68, 0.24], secondary: [0.95, 0.87, 0.55], glow: [1, 0.95, 0.6] },
  green: { primary: [0.22, 0.38, 0.2], secondary: [0.4, 0.52, 0.28], glow: [0.7, 0.95, 0.4] },
  red: { primary: [0.6, 0.16, 0.14], secondary: [0.78, 0.35, 0.2], glow: [1, 0.6, 0.2] },
  silver: { primary: [0.68, 0.72, 0.76], secondary: [0.85, 0.88, 0.92], glow: [0.8, 0.95, 1] },
  white: { primary: [0.82, 0.86, 0.9], secondary: [0.6, 0.72, 0.82], glow: [0.7, 0.9, 1] },
};

/**
 * The monsters a table actually meets, coloured on purpose.
 *
 * Matched on the id as a substring, longest key first, so `ogre-zombie`
 * finds the zombie rather than the ogre and `vampire-spawn` and
 * `vampire-bat` both find the vampire. Everything not in here still gets a
 * colour - see `derivedHue` - this table is for the ones where being wrong
 * would be noticed.
 */
const NAMED: Record<string, BeastHue> = {
  goblin: { primary: [0.35, 0.5, 0.25], secondary: [0.5, 0.32, 0.2], glow: [0.95, 0.8, 0.3] },
  hobgoblin: { primary: [0.68, 0.35, 0.2], secondary: [0.25, 0.28, 0.35], glow: [0.95, 0.75, 0.3] },
  bugbear: { primary: [0.5, 0.38, 0.24], secondary: [0.35, 0.28, 0.2], glow: [0.95, 0.75, 0.3] },
  kobold: { primary: [0.65, 0.35, 0.25], secondary: [0.45, 0.3, 0.22], glow: [1, 0.8, 0.35] },
  orc: { primary: [0.35, 0.42, 0.3], secondary: [0.4, 0.28, 0.2], glow: [0.9, 0.75, 0.35] },
  gnoll: { primary: [0.6, 0.5, 0.3], secondary: [0.4, 0.3, 0.2], glow: [0.95, 0.7, 0.3] },
  drow: { primary: [0.28, 0.25, 0.32], secondary: [0.6, 0.6, 0.68], glow: [0.8, 0.7, 1] },
  duergar: { primary: [0.38, 0.36, 0.34], secondary: [0.5, 0.42, 0.28], glow: [0.9, 0.7, 0.4] },
  lizardfolk: { primary: [0.3, 0.45, 0.32], secondary: [0.55, 0.5, 0.3], glow: [0.9, 0.85, 0.4] },
  sahuagin: { primary: [0.25, 0.42, 0.45], secondary: [0.45, 0.55, 0.5], glow: [0.9, 0.9, 0.5] },
  grimlock: { primary: [0.5, 0.48, 0.44], secondary: [0.38, 0.34, 0.3], glow: [0.85, 0.85, 0.5] },
  skeleton: { primary: [0.85, 0.83, 0.74], secondary: [0.45, 0.4, 0.32], glow: [1, 0.55, 0.2] },
  zombie: { primary: [0.5, 0.55, 0.42], secondary: [0.4, 0.3, 0.28], glow: [0.8, 0.9, 0.5] },
  ghoul: { primary: [0.6, 0.6, 0.5], secondary: [0.4, 0.32, 0.32], glow: [0.9, 0.4, 0.3] },
  ghast: { primary: [0.55, 0.55, 0.45], secondary: [0.45, 0.3, 0.32], glow: [0.9, 0.3, 0.3] },
  wight: { primary: [0.4, 0.42, 0.45], secondary: [0.3, 0.3, 0.35], glow: [0.9, 0.75, 0.3] },
  wraith: { primary: [0.18, 0.18, 0.24], secondary: [0.28, 0.28, 0.36], glow: [0.6, 0.9, 0.9] },
  specter: { primary: [0.22, 0.28, 0.34], secondary: [0.3, 0.38, 0.45], glow: [0.6, 0.9, 1] },
  shadow: { primary: [0.12, 0.12, 0.16], secondary: [0.2, 0.2, 0.26], glow: [0.5, 0.4, 0.7] },
  ghost: { primary: [0.7, 0.78, 0.82], secondary: [0.5, 0.6, 0.68], glow: [0.8, 0.95, 1] },
  mummy: { primary: [0.72, 0.66, 0.5], secondary: [0.45, 0.38, 0.28], glow: [0.9, 0.7, 0.25] },
  vampire: { primary: [0.3, 0.24, 0.28], secondary: [0.55, 0.12, 0.15], glow: [1, 0.3, 0.3] },
  lich: { primary: [0.6, 0.6, 0.55], secondary: [0.3, 0.2, 0.38], glow: [0.5, 1, 0.7] },
  ogre: { primary: [0.62, 0.5, 0.36], secondary: [0.42, 0.3, 0.22], glow: [0.9, 0.75, 0.35] },
  troll: { primary: [0.4, 0.55, 0.35], secondary: [0.45, 0.35, 0.25], glow: [0.85, 0.9, 0.4] },
  ettin: { primary: [0.55, 0.45, 0.35], secondary: [0.4, 0.3, 0.25], glow: [0.9, 0.7, 0.35] },
  oni: { primary: [0.55, 0.3, 0.35], secondary: [0.3, 0.35, 0.45], glow: [1, 0.7, 0.3] },
  'hill-giant': { primary: [0.6, 0.5, 0.34], secondary: [0.45, 0.35, 0.25], glow: [0.9, 0.75, 0.35] },
  'stone-giant': { primary: [0.5, 0.5, 0.5], secondary: [0.38, 0.38, 0.4], glow: [0.8, 0.85, 0.9] },
  'frost-giant': { primary: [0.65, 0.75, 0.82], secondary: [0.35, 0.45, 0.6], glow: [0.75, 0.95, 1] },
  'fire-giant': { primary: [0.45, 0.3, 0.28], secondary: [0.7, 0.35, 0.18], glow: [1, 0.6, 0.2] },
  'cloud-giant': { primary: [0.72, 0.74, 0.8], secondary: [0.5, 0.55, 0.7], glow: [0.9, 0.9, 1] },
  'storm-giant': { primary: [0.45, 0.55, 0.62], secondary: [0.35, 0.4, 0.55], glow: [0.7, 0.9, 1] },
  balor: { primary: [0.5, 0.14, 0.12], secondary: [0.22, 0.15, 0.15], glow: [1, 0.5, 0.15] },
  imp: { primary: [0.6, 0.2, 0.24], secondary: [0.32, 0.16, 0.2], glow: [1, 0.7, 0.3] },
  quasit: { primary: [0.3, 0.35, 0.28], secondary: [0.2, 0.22, 0.2], glow: [0.8, 1, 0.4] },
  hezrou: { primary: [0.4, 0.5, 0.3], secondary: [0.3, 0.35, 0.22], glow: [0.9, 1, 0.4] },
  succubus: { primary: [0.62, 0.42, 0.5], secondary: [0.35, 0.2, 0.3], glow: [1, 0.6, 0.8] },
  'fire-elemental': { primary: [0.85, 0.4, 0.12], secondary: [1, 0.7, 0.2], glow: [1, 0.9, 0.5] },
  'water-elemental': { primary: [0.25, 0.45, 0.62], secondary: [0.4, 0.62, 0.78], glow: [0.7, 0.95, 1] },
  'air-elemental': { primary: [0.68, 0.72, 0.78], secondary: [0.5, 0.58, 0.68], glow: [0.9, 0.95, 1] },
  'earth-elemental': { primary: [0.45, 0.38, 0.3], secondary: [0.32, 0.28, 0.24], glow: [0.8, 0.7, 0.5] },
  magma: { primary: [0.35, 0.2, 0.18], secondary: [0.9, 0.4, 0.12], glow: [1, 0.8, 0.3] },
  azer: { primary: [0.6, 0.35, 0.2], secondary: [0.75, 0.7, 0.3], glow: [1, 0.7, 0.25] },
  gargoyle: { primary: [0.42, 0.42, 0.44], secondary: [0.3, 0.3, 0.32], glow: [0.9, 0.5, 0.35] },
  'iron-golem': { primary: [0.4, 0.42, 0.46], secondary: [0.28, 0.3, 0.34], glow: [1, 0.5, 0.2] },
  'stone-golem': { primary: [0.55, 0.54, 0.5], secondary: [0.4, 0.4, 0.38], glow: [0.8, 0.85, 0.9] },
  'clay-golem': { primary: [0.62, 0.45, 0.32], secondary: [0.45, 0.32, 0.24], glow: [0.9, 0.7, 0.4] },
  'flesh-golem': { primary: [0.55, 0.55, 0.45], secondary: [0.35, 0.3, 0.3], glow: [0.7, 0.9, 0.5] },
  'animated-armor': { primary: [0.5, 0.52, 0.56], secondary: [0.35, 0.36, 0.4], glow: [0.7, 0.85, 1] },
  'black-pudding': { primary: [0.14, 0.13, 0.15], secondary: [0.25, 0.24, 0.26], glow: [0.5, 0.9, 0.4] },
  'gelatinous-cube': { primary: [0.6, 0.72, 0.62], secondary: [0.72, 0.85, 0.75], glow: [0.8, 1, 0.8] },
  'gray-ooze': { primary: [0.42, 0.44, 0.44], secondary: [0.55, 0.56, 0.56], glow: [0.7, 0.8, 0.8] },
  'ochre-jelly': { primary: [0.7, 0.5, 0.2], secondary: [0.82, 0.65, 0.32], glow: [1, 0.85, 0.4] },
  wolf: { primary: [0.45, 0.42, 0.4], secondary: [0.3, 0.28, 0.26], glow: [0.9, 0.85, 0.4] },
  bear: { primary: [0.4, 0.28, 0.2], secondary: [0.28, 0.2, 0.15], glow: [0.9, 0.8, 0.4] },
  spider: { primary: [0.25, 0.22, 0.26], secondary: [0.4, 0.3, 0.2], glow: [0.9, 0.4, 0.4] },
  rat: { primary: [0.42, 0.36, 0.32], secondary: [0.55, 0.45, 0.42], glow: [0.9, 0.5, 0.4] },
  boar: { primary: [0.42, 0.34, 0.28], secondary: [0.3, 0.24, 0.2], glow: [0.9, 0.8, 0.5] },
  owlbear: { primary: [0.5, 0.35, 0.24], secondary: [0.62, 0.55, 0.4], glow: [0.95, 0.8, 0.3] },
  treant: { primary: [0.38, 0.3, 0.22], secondary: [0.3, 0.45, 0.24], glow: [0.7, 0.9, 0.4] },
  shrieker: { primary: [0.55, 0.5, 0.4], secondary: [0.4, 0.45, 0.3], glow: [0.9, 0.9, 0.5] },
  fungus: { primary: [0.45, 0.32, 0.45], secondary: [0.35, 0.4, 0.3], glow: [0.8, 0.5, 0.9] },
  aboleth: { primary: [0.32, 0.45, 0.45], secondary: [0.5, 0.4, 0.5], glow: [0.6, 1, 0.9] },
  cloaker: { primary: [0.28, 0.22, 0.26], secondary: [0.5, 0.2, 0.25], glow: [0.9, 0.5, 0.6] },
  otyugh: { primary: [0.42, 0.38, 0.28], secondary: [0.55, 0.45, 0.35], glow: [0.9, 0.85, 0.4] },
};

/** Match keys longest first, so `ogre-zombie` is a zombie and not an ogre. */
const NAMED_KEYS = Object.keys(NAMED).sort((a, b) => b.length - a.length);

/** A dull, deterministic hash. Same id, same colour, on every device. */
function hashOf(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** One hue's worth of RGB, at a fixed saturation and lightness. */
function fromHue(hue: number, sat: number, light: number): Rgb {
  const chroma = (1 - Math.abs(2 * light - 1)) * sat;
  const sector = (hue % 360) / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const rgb: [number, number, number] =
    sector < 1
      ? [chroma, second, 0]
      : sector < 2
        ? [second, chroma, 0]
        : sector < 3
          ? [0, chroma, second]
          : sector < 4
            ? [0, second, chroma]
            : sector < 5
              ? [second, 0, chroma]
              : [chroma, 0, second];
  const lift = light - chroma / 2;
  return [rgb[0] + lift, rgb[1] + lift, rgb[2] + lift];
}

/**
 * A colour for a monster nobody thought to name.
 *
 * Muted on purpose - the saturation and lightness are fixed and only the hue
 * moves - because the point is that two different monsters look different,
 * not that either one is striking. A neon long tail beside a hand-picked
 * goblin would make the hand-picked ones look like the mistake.
 */
function derivedHue(id: string): BeastHue {
  const hue = hashOf(id) % 360;
  return {
    primary: fromHue(hue, 0.3, 0.42),
    secondary: fromHue((hue + 40) % 360, 0.25, 0.3),
    glow: fromHue((hue + 180) % 360, 0.6, 0.62),
  };
}

/** The colours a monster is painted in, hand-picked where it matters. */
export function hueOf(monster: { id: string; type: string }): BeastHue {
  if (familyOf(monster) === 'dragon') {
    for (const [colour, hue] of Object.entries(DRAGON_HUES)) {
      if (monster.id.includes(colour)) return hue;
    }
  }
  const named = NAMED_KEYS.find((key) => monster.id.includes(key));
  return named ? NAMED[named] : derivedHue(monster.id);
}

/**
 * How much of its square a monster fills.
 *
 * The single biggest thing a glance can read, and nearly free: an ogre that
 * is physically bigger than the goblins around it says more than any amount
 * of detail in the sprite would. Large and up overflow their square
 * deliberately - a creature that takes four squares should look like it
 * does - which is also how a dragon's age reads without a word of text.
 */
export function scaleOf(size: string): number {
  switch (size.toLowerCase()) {
    case 'tiny':
      return 0.62;
    case 'small':
      return 0.82;
    case 'large':
      return 1.45;
    case 'huge':
      return 2;
    case 'gargantuan':
      return 2.7;
    default:
      return 1;
  }
}

/** Everything a renderer needs about one monster's appearance. */
export interface BeastArt extends BeastHue {
  family: BeastFamily;
  scale: number;
}

/**
 * One call, because the three axes are always wanted together and a caller
 * that fetched two of them would be a caller with a bug waiting.
 */
export function beastArtOf(monster: { id: string; type: string; size: string }): BeastArt {
  return { family: familyOf(monster), ...hueOf(monster), scale: scaleOf(monster.size) };
}
