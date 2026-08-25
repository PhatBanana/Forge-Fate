/**
 * What the ground is made of, up close (§150).
 *
 * The terrain mesh has sampled a texture atlas since §66 - every cap and
 * every skirt carries UVs and the fragment shader is `tex * vColor`. It has
 * only ever sampled the white texel, so every surface came out a flat
 * palette colour. This is the texture half, finally supplied: greyscale
 * detail that *multiplies* the palette rather than replacing it.
 *
 * Multiplying is the whole design. A theme swap still recolours the entire
 * board, a lit cell is still lit and a shaded face still shaded, because
 * none of that lives here - what lives here is where the mortar runs and
 * which stones catch the light. Painting coloured tiles instead would have
 * frozen the palette into the art and quietly killed the themes.
 *
 * ## Why the walls needed their own face
 *
 * `side` was one rock face shared by every prism, whatever stood above it -
 * fine when the difference between a wall and a raised floor was a cap
 * colour, and the reason walls read as coloured blocks rather than as
 * masonry. A wall's vertical face is the surface a player actually looks
 * at in this projection, so it gets its own: coursed stone, staggered, with
 * the courses running horizontally the way built things do and the rock
 * face's striations running vertically the way broken things do.
 *
 * ## The legend
 *
 * Brightness, not colour. `.` is the base tone and the rest step away from
 * it, so a grid reads as a relief map of the surface:
 *
 *   `#` deep · `-` shaded · `.` base · `+` lit · `*` bright
 */

export type SurfaceKind = 'ground' | 'floor' | 'wall' | 'wallSide' | 'water' | 'side';

export const SURFACE_KINDS: SurfaceKind[] = [
  'ground',
  'floor',
  'wall',
  'wallSide',
  'water',
  'side',
];

/** One texture's side, in texels. Sixteen: a course of masonry is 4. */
export const SURFACE_SIZE = 16;

/**
 * What each character multiplies the palette colour by.
 *
 * All at or below one, and that is a constraint rather than a taste: the
 * shader is `tex * vColor`, so a texel cannot brighten a surface past the
 * colour the palette already chose. Relief is carved *down* from the lit
 * tone, and the base sits a little under it so a highlight has somewhere to
 * go. The board reads a shade darker than the flat colours did, which is
 * what having a surface looks like.
 */
export const SURFACE_LEVELS: Record<string, number> = {
  '#': 0.68,
  '-': 0.82,
  '.': 0.92,
  '+': 0.97,
  '*': 1,
};

/*
  Every grid below tiles: column 15 meets column 0, row 15 meets row 0.
  A texture that did not would draw a seam down every square edge, which is
  the one artefact a player would notice immediately and never stop seeing.
*/

/* Trodden earth. Speckle, no structure - it must not read as a grid. */
const GROUND = [
  '..-...+....-....',
  '.....-...+...-..',
  '..+.....-.....+.',
  '-...+.......-...',
  '.....-..+.......',
  '..-.......-...+.',
  '+...-.......+...',
  '.......+...-....',
  '..-.......-.....',
  '....+...-....+..',
  '.-.......+......',
  '.....-......-...',
  '..+.....-.....+.',
  '......+.....-...',
  '-...-.....+.....',
  '...+.....-......',
];

/* Flagstones: four slabs, cut joints, and the odd worn corner. */
const FLOOR = [
  '################',
  '#+.....##+.....#',
  '#......##......#',
  '#.....-##....-.#',
  '#..-...##..-...#',
  '#......##......#',
  '#....+.##.....+#',
  '################',
  '################',
  '#.....+##+.....#',
  '#..-...##...-..#',
  '#......##......#',
  '#.+....##....+.#',
  '#...-..##..-...#',
  '#......##......#',
  '################',
];

/* The top of a wall, seen from above: the same courses, end on. */
const WALL = [
  '################',
  '#++...+#+...++.#',
  '#.....-#-......#',
  '################',
  '..#++...+#+...++',
  '..#.....-#-.....',
  '################',
  '#+...++.#++...+#',
  '#-......#.....-#',
  '################',
  '+#+...++..#++...',
  '-#-.......#.....',
  '################',
  '#++...+#+...++.#',
  '#.....-#-......#',
  '################',
];

/*
  A wall's face, which is what a player is actually looking at. Coursed
  stone, staggered every other course, lit along the top of each block and
  shadowed under it - the two lines that make a flat rectangle read as a
  thing with depth.
*/
const WALL_SIDE = [
  '****+*****+*****',
  '..#....#....#...',
  '..#....#....#...',
  '--#----#----#---',
  '################',
  '*****+*****+**+*',
  '#....#....#....#',
  '#....#....#....#',
  '#----#----#----#',
  '################',
  '**+*****+*****+*',
  '..#....#....#...',
  '..#....#....#...',
  '--#----#----#---',
  '################',
  '*+*****+*****+**',
];

/* Broken rock, not built: striations run down, and nothing lines up. */
const SIDE = [
  '.-..#..-.#..-..#',
  '.-..#..-.#..-..#',
  '.-.+#..-.#.+-..#',
  '..-.#.+-.#..-.+#',
  '..-.#..-.#..-..#',
  '#.-.#..-.#..-..#',
  '#.-..#.-..#.-..#',
  '#..-.#.-..#.-.+#',
  '#..-.#.-..#.-..#',
  '.+.-.#.-..#.-..#',
  '..-..#-...#..-.#',
  '..-.#.-...#..-.#',
  '.-..#.-..#..-..#',
  '.-..#..-.#..-..#',
  '.-..#..-.#..-..#',
  '.-..#..-.#..-..#',
];

/* Ripples. Bands across, offset, so it reads as moving even standing still. */
const WATER = [
  '................',
  '..++........++..',
  '.+**+......+**+.',
  '..++........++..',
  '................',
  '......----......',
  '.....--##--.....',
  '......----......',
  '................',
  '........++......',
  '.++....+**+.....',
  '+**+....++......',
  '.++.............',
  '....----........',
  '...--##--.......',
  '....----........',
];

export const SURFACE_ART: Record<SurfaceKind, string[]> = {
  ground: GROUND,
  floor: FLOOR,
  wall: WALL,
  wallSide: WALL_SIDE,
  water: WATER,
  side: SIDE,
};

/* --------------------------------------------------------- where they live */

/**
 * The atlas slots these occupy, and why they are fixed rather than packed.
 *
 * Every other atlas entry is packed on demand and re-packed after a reset,
 * which is fine because the thing that wants it - a sprite, a text run - is
 * looked up by key at the moment it is drawn. The terrain mesh is not like
 * that. It is built by the *component*, once, with UVs baked into a vertex
 * buffer, and it outlives any number of atlas generations. UVs that moved
 * when the atlas filled would smear the floor with somebody's damage float.
 *
 * So these six live in a reserved strip along the top of the atlas at
 * addresses arithmetic can compute, and the shelf packer is told to start
 * below it. Both the painter and the UV table derive from `slotOf`, so they
 * cannot disagree about where a texture is.
 */

/** Atlas pixels per surface texel. Two: the courses stay legible up close. */
export const SURFACE_SCALE = 2;

/** One slot's side in atlas pixels, gutter included. */
export const SURFACE_SLOT = SURFACE_SIZE * SURFACE_SCALE;

/**
 * How tall the reserved strip is. The white texel shares the first slot's
 * row, which is why this is one slot and not two - and the shelf packer
 * starts here, so nothing it packs can ever land on a terrain texture.
 */
export const RESERVED_HEIGHT = SURFACE_SLOT + 2;

/** Where a surface's texture sits, in atlas pixels. */
export function slotOf(kind: SurfaceKind): { x: number; y: number; w: number; h: number } {
  // The white texel takes the first two columns; surfaces follow it.
  const index = SURFACE_KINDS.indexOf(kind);
  // Two texels between neighbours, against bleed at nearest filtering - the
  // same reason the shelf packer keeps a gutter.
  return { x: 4 + index * (SURFACE_SLOT + 2), y: 0, w: SURFACE_SLOT, h: SURFACE_SLOT };
}
