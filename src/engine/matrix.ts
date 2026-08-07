import { ABILITIES, ABILITY_NAMES } from '../types';
import type { Ability, CharClass, ClassId, Rating } from '../types';

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

export function needsFor(klass: CharClass): ClassNeeds {
  const armorStarved = ['wizard', 'sorcerer', 'bard', 'warlock', 'rogue', 'monk'].includes(klass.id);
  return {
    armorStarved,
    unarmoredAc: ['monk', 'barbarian', 'sorcerer', 'wizard'].includes(klass.id),
    // Martials have spare ASIs and their feats are build-defining.
    featHungry: klass.castingType === 'none' || klass.castingType === 'half',
    stealthy: ['rogue', 'ranger', 'monk', 'bard', 'druid'].includes(klass.id),
    melee: ['barbarian', 'fighter', 'monk', 'paladin', 'rogue'].includes(klass.id),
    ranged: ['ranger', 'fighter', 'rogue'].includes(klass.id),
    frail: klass.hitDie <= 8,
    social: ['bard', 'warlock', 'sorcerer', 'paladin', 'rogue'].includes(klass.id),
    weaponStarved: ['wizard', 'sorcerer', 'druid', 'warlock', 'cleric', 'monk'].includes(klass.id),
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
