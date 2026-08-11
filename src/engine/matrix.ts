import { ABILITIES, ABILITY_NAMES } from '../types';
import type { Ability, CharClass, ClassId, Rating } from '../types';
import { CLASS_FEATURES } from '../data/classFeatures';

/**
 * Machinery shared by the two "which origin suits which class" matrices.
 *
 * In 2014 that question is about your species, because species carry the
 * ability score increases. In 2024 the increases moved to your background, so
 * the same question is asked of backgrounds instead. Both matrices score the
 * same way: how well the increases land on what the class needs, plus how much
 * the rest of the package patches that class's weaknesses.
 */

export const PRIORITY_WEIGHT: Record<number, number> = { 3: 4.0, 2: 1.7, 1: 0.6, 0: -0.6 };

/**
 * Everything that is not an ability increase is scaled down. The increases are
 * what make an origin good or bad at a class; the rest is the tiebreaker, and
 * without this weighting a pile of small perks outranks a +2 in the stat the
 * class actually runs on.
 */
export const TRAIT_SCALE = 0.7;

export const SKY_THRESHOLD = 14;
export const BLUE_THRESHOLD = 9.5;
export const ORANGE_THRESHOLD = 5.5;

/**
 * When a matrix rates traits alone - 2024 species, which grant no ability
 * increases - the scores live on a completely different scale, roughly 1.5 to
 * 6.5 rather than 0 to 20. Reusing the normal cutoffs would paint the whole
 * table red and tell players to avoid every species, when the honest answer is
 * that species barely differentiate class fit under 2024.
 */
export const TRAIT_ONLY_SKY = 4.8;
export const TRAIT_ONLY_BLUE = 3.6;
export const TRAIT_ONLY_ORANGE = 2.4;

export interface Cell {
  /** The species or background being rated. */
  originId: string;
  classId: ClassId;
  score: number;
  rating: Rating;
  reasons: string[];
  /** Curated commentary, when this pairing has a well-known verdict. */
  note?: string;
}

export interface ClassNeeds {
  /** No armor proficiency at all, or light only. */
  armorStarved: boolean;
  unarmoredAc: boolean;
  featHungry: boolean;
  stealthy: boolean;
  melee: boolean;
  ranged: boolean;
  frail: boolean;
  social: boolean;
  weaponStarved: boolean;
  castingAbility?: Ability;
}

/**
 * The thirteen these lists were written for.
 *
 * Every list below names published classes and only published classes, which
 * was invisible while thirteen was all there was. It stopped being invisible
 * the moment the app had classes of its own: a Reckoner, Harrier, Marshal and
 * Adept came out of `needsFor` with `featHungry` and `frail` - the only two
 * fields derived rather than listed - and **false for everything else**.
 *
 * So the whole species x class matrix and the feat scorer were rating four
 * classes on almost no information. It showed: the feat recommender's top pick
 * for a Dexterity-and-bows Harrier, and for an unarmoured Intelligence Adept,
 * was Great Weapon Master.
 *
 * The fix is not four more ids in seven lists - that is the same mistake with
 * a longer runway, and the fifth class would repeat it. Instead the lists stay
 * authoritative **for the classes they were written about**, and anything else
 * is derived from the class record.
 */
const CURATED = new Set<ClassId>([
  /*
    Twelve, not thirteen. The **Artificer is deliberately absent**, and finding
    that out is what the sweep in `matrix.test.ts` was worth.

    It arrived after these lists were written and was never added to any of
    them, so it had exactly the problem the app's own four had, for exactly as
    long as it has been in the app: rated on hit die and casting type and
    nothing else. Deriving gives it `weaponStarved`, which is true - simple
    weapons only - and false everywhere else, which is also true. It is a
    correction, and the species matrix scores for the Artificer move because
    they were wrong.
  */
  'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk',
  'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard',
]);

/**
 * What the class record itself says, for a class no list mentions.
 *
 * Deliberately not applied to the published thirteen even where it agrees with
 * them, and it agrees in most places - `melee` derives to exactly the curated
 * list, `armorStarved` to exactly the curated list. It disagrees in a handful:
 * the Druid is curated as stealthy on the strength of Wild Shape rather than
 * its skill list, and the Rogue as social on the strength of Expertise rather
 * than its ability priorities. Those are judgements the derivation cannot
 * make, and overriding thirteen tuned rows to save a `Set` lookup would move
 * ratings nobody asked to move.
 */
function derivedNeeds(klass: CharClass): Omit<ClassNeeds, 'featHungry' | 'frail' | 'castingAbility'> {
  const armor = new Set(klass.armorProficiency);
  const features = CLASS_FEATURES[klass.id] ?? [];
  return {
    armorStarved: !armor.has('medium') && !armor.has('heavy'),
    // Read from the feature that grants it, which is where every published
    // unarmored defence already declares itself to the AC calculation.
    unarmoredAc: features.some((f) => f.tags?.includes('unarmored-defense')),
    stealthy: klass.skillChoices.from.includes('stealth'),
    melee: ['str-melee', 'dex-melee', 'unarmed'].includes(klass.defaultWeaponStyle),
    ranged: klass.defaultWeaponStyle === 'dex-ranged',
    social: klass.abilityPriority.cha >= 2,
    weaponStarved: !klass.weaponProficiency.categories.includes('martial'),
  };
}

export function needsFor(klass: CharClass): ClassNeeds {
  const listed = CURATED.has(klass.id);
  const own = derivedNeeds(klass);
  const pick = (ids: ClassId[], field: keyof typeof own) =>
    listed ? ids.includes(klass.id) : own[field];

  return {
    armorStarved: pick(['wizard', 'sorcerer', 'bard', 'warlock', 'rogue', 'monk'], 'armorStarved'),
    unarmoredAc: pick(['monk', 'barbarian', 'sorcerer', 'wizard'], 'unarmoredAc'),
    // Martials have spare ASIs and their feats are build-defining.
    featHungry: klass.castingType === 'none' || klass.castingType === 'half',
    stealthy: pick(['rogue', 'ranger', 'monk', 'bard', 'druid'], 'stealthy'),
    melee: pick(['barbarian', 'fighter', 'monk', 'paladin', 'rogue'], 'melee'),
    ranged: pick(['ranger', 'fighter', 'rogue'], 'ranged'),
    frail: klass.hitDie <= 8,
    social: pick(['bard', 'warlock', 'sorcerer', 'paladin', 'rogue'], 'social'),
    weaponStarved: pick(['wizard', 'sorcerer', 'druid', 'warlock', 'cleric', 'monk'], 'weaponStarved'),
    castingAbility: klass.castingAbility,
  };
}

export function ratingFor(score: number): Rating {
  if (score >= SKY_THRESHOLD) return 'sky';
  if (score >= BLUE_THRESHOLD) return 'blue';
  if (score >= ORANGE_THRESHOLD) return 'orange';
  return 'red';
}

export function ratingForTraitsOnly(score: number): Rating {
  if (score >= TRAIT_ONLY_SKY) return 'sky';
  if (score >= TRAIT_ONLY_BLUE) return 'blue';
  if (score >= TRAIT_ONLY_ORANGE) return 'orange';
  return 'red';
}

const RATING_RANK: Record<Rating, number> = { sky: 0, blue: 1, orange: 2, red: 3 };

/**
 * Rating, then curated pairings, then raw score. A pairing someone has written
 * a verdict for should never sit below one that merely computes well - the
 * formula is a floor for the cells nobody has an opinion about, not a
 * replacement for the opinion.
 */
export function byQuality(a: Cell, b: Cell): number {
  return (
    RATING_RANK[a.rating] - RATING_RANK[b.rating] ||
    (a.note ? 0 : 1) - (b.note ? 0 : 1) ||
    b.score - a.score
  );
}

/** Score a fixed set of ability increases against what a class wants. */
export function fixedAbilityFit(
  increases: Partial<Record<Ability, number>>,
  klass: CharClass,
): { score: number; parts: string[] } {
  let score = 0;
  const parts: string[] = [];
  for (const ability of ABILITIES) {
    const amount = increases[ability];
    if (!amount) continue;
    score += (PRIORITY_WEIGHT[klass.abilityPriority[ability]] ?? 0) * amount;
    parts.push(`+${amount} ${ABILITY_NAMES[ability]}`);
  }
  return { score, parts };
}

/**
 * Score increases the player gets to place, assuming they place them well -
 * which is what a player would do. Used for 2014's floating lineages and for
 * every 2024 background.
 */
export function choiceAbilityFit(
  amounts: number[],
  choices: Ability[],
  klass: CharClass,
): { score: number; parts: string[] } {
  const ranked = [...choices].sort(
    (a, b) => klass.abilityPriority[b] - klass.abilityPriority[a],
  );
  let score = 0;
  const parts: string[] = [];
  amounts.forEach((amount, i) => {
    const ability = ranked[i % Math.max(1, ranked.length)];
    if (!ability) return;
    score += (PRIORITY_WEIGHT[klass.abilityPriority[ability]] ?? 0) * amount;
    parts.push(`+${amount} ${ABILITY_NAMES[ability]}`);
  });
  return { score, parts };
}

export function primaryNames(klass: CharClass): string {
  return ABILITIES.filter((a) => klass.abilityPriority[a] === 3)
    .map((a) => ABILITY_NAMES[a])
    .join('/');
}
