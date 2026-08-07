import type { CharClass, ClassId } from '../types';
import { CLASSES } from '../data/classes';
import { backgroundsFor } from '../data/backgrounds';
import type { Background } from '../data/backgrounds';
import { NOTABLE_SKILL_VALUE } from './skillValue';
import { FEATS_BY_ID } from '../data/feats';
import { TRAIT_SCALE, byQuality, choiceAbilityFit, needsFor, primaryNames, ratingFor } from './matrix';
import type { Cell } from './matrix';

/**
 * Background x class, for 2024.
 *
 * In 2024 the background carries the ability score increases and the first
 * feat, so "which origin suits which class" - the question the species matrix
 * answers under 2014 - is asked of backgrounds instead. Same scoring shape:
 * ability fit first, everything else as a tiebreaker.
 */


function abilityFit(background: Background, klass: CharClass): { score: number; reason: string } {
  const abilities = background.abilities ?? [];
  // Rated as +2/+1 placed on the two the class wants most, which is what a
  // player optimising for this class would take.
  const fit = choiceAbilityFit([2, 1], abilities, klass);
  const listed = abilities.map((a) => a.toUpperCase()).join('/');
  return {
    score: fit.score,
    reason:
      fit.score >= 6
        ? `Offers ${listed}; taken as ${fit.parts.join(' and ')} that lands on ${klass.name}'s ${primaryNames(klass)} priority.`
        : `Offers ${listed}, which only partly covers a class that wants ${primaryNames(klass)}.`,
  };
}

function packageFit(background: Background, klass: CharClass): { score: number; reasons: string[] } {
  const needs = needsFor(klass);
  let score = 0;
  const reasons: string[] = [];

  const feat = background.originFeatId ? FEATS_BY_ID[background.originFeatId] : undefined;
  if (feat) {
    // The feat's baseline power is a proxy: scoring it properly needs a full
    // build context, which a matrix cell does not have.
    score += feat.base * 0.5;
    reasons.push(`Grants ${feat.name} for free at 1st level (rated on its general power, not on this exact build).`);
  }

  for (const skill of background.skills) {
    const notable = NOTABLE_SKILL_VALUE[skill];
    if (notable) {
      score += notable.value;
      reasons.push(notable.why);
    }
  }
  if (needs.stealthy && background.skills.includes('stealth')) {
    score += 0.8;
    reasons.push(`${klass.name} wants to be unseen, and this grants Stealth without spending a class pick.`);
  }
  if (needs.social && (background.skills.includes('persuasion') || background.skills.includes('deception'))) {
    score += 0.6;
    reasons.push('Social proficiency this class will actually use.');
  }

  return { score: score * TRAIT_SCALE, reasons };
}

export function rateBackgroundCell(background: Background, klass: CharClass): Cell {
  const ability = abilityFit(background, klass);
  const rest = packageFit(background, klass);
  const score = ability.score + rest.score;

  return {
    originId: background.id,
    classId: klass.id,
    score,
    rating: ratingFor(score),
    reasons: [ability.reason, ...rest.reasons.slice(0, 3)],
    note: background.note,
  };
}

const cache = new Map<string, Cell>();

function key(backgroundId: string, classId: ClassId): string {
  return `${backgroundId}|${classId}`;
}

function ensureCache(): Map<string, Cell> {
  if (cache.size) return cache;
  for (const background of backgroundsFor('2024')) {
    for (const klass of CLASSES) {
      cache.set(key(background.id, klass.id), rateBackgroundCell(background, klass));
    }
  }
  return cache;
}

export function backgroundCellFor(backgroundId: string, classId: ClassId): Cell | undefined {
  return ensureCache().get(key(backgroundId, classId));
}

/** Best backgrounds for a class under 2024, best first. */
export function bestBackgroundsFor(classId: ClassId, limit = 8): Cell[] {
  return backgroundsFor('2024')
    .map((b) => backgroundCellFor(b.id, classId))
    .filter((c): c is Cell => !!c)
    .sort(byQuality)
    .slice(0, limit);
}
