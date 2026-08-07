import type { SkillId } from '../data/skills';
import { SKILLS, SKILLS_BY_ID } from '../data/skills';
import { needsFor } from './matrix';
import type { ClassNeeds } from './matrix';
import type { BuildContext } from './character';

/**
 * What a skill is worth, and why.
 *
 * One table, read by two callers: the background matrix, which asks "is this
 * origin's skill package any good", and the Builder's recommendations, which
 * ask the same question of a specific character. Keeping it in one place is
 * what stops the two drifting into disagreeing about Perception.
 *
 * The scale is deliberately narrow. A skill is worth far less than a `+2` to
 * your primary ability, and pretending otherwise would make the numbers lie.
 */
export const SKILL_BASE_VALUE: Record<SkillId, { value: number; why: string }> = {
  perception: { value: 1.2, why: 'Perception is the most-rolled skill in the game.' },
  stealth: { value: 1.0, why: 'Stealth decides how most encounters begin.' },
  athletics: { value: 0.8, why: 'Athletics covers grappling and shoving.' },
  insight: { value: 0.7, why: 'Insight is the defensive half of every social scene.' },
  persuasion: {
    value: 0.7,
    why: 'Persuasion is the skill parties reach for most often out of combat.',
  },
  arcana: { value: 0.5, why: 'Arcana pays off in magic-heavy campaigns.' },
  investigation: { value: 0.5, why: 'Investigation finds what Perception only notices.' },
  deception: { value: 0.5, why: 'Deception opens the doors Persuasion cannot.' },
  acrobatics: { value: 0.4, why: 'Acrobatics escapes grapples and keeps you upright.' },
  survival: { value: 0.4, why: 'Survival tracks, and its value swings on how much travel your DM runs.' },
  intimidation: { value: 0.4, why: 'Intimidation works where Persuasion will not.' },
  'sleight-of-hand': { value: 0.35, why: 'Sleight of Hand palms things, and plants them.' },
  nature: { value: 0.3, why: 'Nature is knowledge, and often ruled interchangeable with Survival.' },
  religion: { value: 0.3, why: 'Religion lands hard in the campaigns built around it.' },
  history: { value: 0.3, why: 'History is almost entirely campaign-dependent.' },
  'animal-handling': { value: 0.3, why: 'Animal Handling is narrow without a mount.' },
  performance: { value: 0.2, why: 'Performance is fun, and Persuasion usually covers it.' },
  medicine: { value: 0.1, why: 'Medicine is the weakest skill in the game; a cantrip does its job better.' },
};

/** The subset the background matrix treats as notable, by the old cutoff. */
export const NOTABLE_SKILL_VALUE: Partial<Record<SkillId, { value: number; why: string }>> = {
  perception: SKILL_BASE_VALUE.perception,
  stealth: SKILL_BASE_VALUE.stealth,
  athletics: SKILL_BASE_VALUE.athletics,
  insight: SKILL_BASE_VALUE.insight,
  persuasion: SKILL_BASE_VALUE.persuasion,
  arcana: SKILL_BASE_VALUE.arcana,
};

export interface SkillSuggestion {
  skill: SkillId;
  name: string;
  score: number;
  /** Every adjustment that moved the score, in the same shape as feat reasons. */
  reasons: { text: string; delta: number }[];
  headline: string;
  /** Already granted or picked - shown, but not recommended again. */
  taken: boolean;
}

/** Class-shaped adjustments, from the same needs the matrices use. */
function classAdjustments(
  skill: SkillId,
  needs: ClassNeeds,
): { text: string; delta: number }[] {
  const out: { text: string; delta: number }[] = [];
  if (needs.stealthy && skill === 'stealth') {
    out.push({ text: 'This class wants to be unseen.', delta: 0.8 });
  }
  if (needs.social && (skill === 'persuasion' || skill === 'deception')) {
    out.push({ text: 'This class leads social scenes.', delta: 0.6 });
  }
  if (needs.melee && skill === 'athletics') {
    out.push({ text: 'A frontliner uses Athletics to grapple and shove.', delta: 0.5 });
  }
  return out;
}

/**
 * Rank the skills this character could still take. The ability modifier matters
 * as well as the skill: Athletics on an 8 Strength is a worse buy than the
 * table value suggests.
 */
export function recommendSkills(ctx: BuildContext, limit?: number): SkillSuggestion[] {
  const needs = needsFor(ctx.primary.klass);
  const { granted } = ctx.proficiencies;

  const list = SKILLS.map((skill) => {
    const base = SKILL_BASE_VALUE[skill.id];
    const reasons = [{ text: base.why, delta: base.value }];
    let score = base.value;

    for (const adjustment of classAdjustments(skill.id, needs)) {
      score += adjustment.delta;
      reasons.push(adjustment);
    }

    // Recommending Stealth to someone in plate is exactly the kind of advice a
    // builder exists to stop you taking.
    if (skill.id === 'stealth' && ctx.ac.stealthDisadvantage) {
      score -= 0.9;
      reasons.push({
        text: 'Your armor gives disadvantage on Stealth, which costs more than the proficiency gains.',
        delta: -0.9,
      });
    }

    // A skill keys off an ability, and a dumped ability makes it a poor buy
    // however good the skill is in the abstract.
    const mod = ctx.mods[skill.ability];
    if (mod >= 3) {
      score += 0.4;
      reasons.push({
        text: `Your ${SKILLS_BY_ID[skill.id].ability.toUpperCase()} is high, so this rolls well.`,
        delta: 0.4,
      });
    } else if (mod <= -1) {
      score -= 0.5;
      reasons.push({
        text: `Your ${SKILLS_BY_ID[skill.id].ability.toUpperCase()} is a dump stat, so this rolls badly whatever your proficiency.`,
        delta: -0.5,
      });
    }

    const specific = reasons.slice(1).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];

    return {
      skill: skill.id,
      name: skill.name,
      score,
      reasons,
      headline: specific?.text ?? base.why,
      taken: granted.has(skill.id),
    };
  });

  list.sort((a, b) => Number(a.taken) - Number(b.taken) || b.score - a.score || a.name.localeCompare(b.name));
  return limit ? list.slice(0, limit) : list;
}

/**
 * The skills to fill a character's open picks with. Only ever suggests legal,
 * untaken skills, so applying it cannot create a collision.
 */
export function fillSkillPicks(ctx: BuildContext, legal: Set<SkillId>): SkillId[] {
  const open = ctx.proficiencies.openSkillPicks;
  if (open <= 0) return [];
  return recommendSkills(ctx)
    .filter((s) => !s.taken && legal.has(s.skill))
    .slice(0, open)
    .map((s) => s.skill);
}

/**
 * Expertise doubles a proficiency, so it is worth most on a skill you will roll
 * often and already roll well.
 */
export function recommendExpertise(ctx: BuildContext, limit?: number): SkillSuggestion[] {
  const needs = needsFor(ctx.primary.klass);
  const taken = new Set(ctx.build.expertiseIds);

  const list = ctx.proficiencies.skills
    .filter((line) => line.proficient && !taken.has(line.skill))
    .map((line) => {
      const base = SKILL_BASE_VALUE[line.skill];
      const reasons = [{ text: base.why, delta: base.value }];
      let score = base.value;

      for (const adjustment of classAdjustments(line.skill, needs)) {
        score += adjustment.delta;
        reasons.push(adjustment);
      }
      // Doubling is worth more the better the underlying modifier already is.
      const mod = ctx.mods[SKILLS_BY_ID[line.skill].ability];
      if (mod >= 3) {
        score += 0.6;
        reasons.push({ text: 'Doubling compounds an already high modifier.', delta: 0.6 });
      }

      const specific = reasons.slice(1).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
      return {
        skill: line.skill,
        name: line.name,
        score,
        reasons,
        headline: specific?.text ?? base.why,
        taken: false,
      };
    });

  list.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return limit ? list.slice(0, limit) : list;
}
