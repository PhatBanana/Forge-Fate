import { ABILITIES, ABILITY_NAMES } from '../types';
import type { Ability, Build, Feat, ScoreRule } from '../types';
import { featsFor } from '../data/feats';
import { abilityMod, deriveBuild, futureAsiSlots } from './character';
import type { BuildContext, FutureSlot } from './character';
import { checkPrereq, matches } from './conditions';

/**
 * Value of a full +2 into an ability, by how much the build cares about it.
 * Calibrated so that a +2 to a primary stat lands between "good generic feat"
 * and "perfectly fitted combat feat" - which is how ASI-vs-feat actually plays
 * out at the table.
 */
const PRIORITY_VALUE: Record<number, number> = { 3: 10, 2: 4, 1: 1.6, 0: 0.2 };

/**
 * Most of an increase's value is the modifier you get right now; the rest is
 * progress banked toward the next step. Splitting it this way is what makes a
 * +1 onto an odd score worth nearly a whole ASI, and a +1 onto an even score
 * worth very little.
 */
const MOD_SHARE = 0.6;
const PROGRESS_SHARE = 0.2;

/**
 * A half-feat's +1 is credited at a discount. You are buying the feat and the
 * ability bump comes attached, so the bump is a bonus rather than a substitute
 * for a full ability score improvement.
 */
const HALF_FEAT_DISCOUNT = 0.6;

/**
 * Below this an increase is not worth presenting: it neither reaches a
 * modifier step nor advances anything the build cares about.
 */
const MIN_ASI_VALUE = 1;

export interface Reason {
  text: string;
  delta: number;
}

export interface FeatSuggestion {
  kind: 'feat';
  id: string;
  feat: Feat;
  score: number;
  reasons: Reason[];
  /** The single most load-bearing reason, for one-line summaries. */
  headline: string;
  /** Chosen ability for a half-feat's +1. */
  asiChoice?: Ability;
  eligible: boolean;
  blockedBy: string[];
}

export interface AsiSuggestion {
  kind: 'asi';
  id: string;
  /** One entry per +1; [str, str] means +2 Strength. */
  allocation: Ability[];
  score: number;
  reasons: Reason[];
  headline: string;
}

export type Suggestion = FeatSuggestion | AsiSuggestion;

/** Value of raising `ability` from `from` to `to` for this build. */
export function pointValue(ctx: BuildContext, ability: Ability, from: number, to: number): number {
  const capped = Math.min(20, to);
  const points = capped - from;
  if (points <= 0) return 0;
  const modGain = abilityMod(capped) - abilityMod(from);
  const priority = ctx.abilityPriority[ability] ?? 0;
  const weight = PRIORITY_VALUE[priority] ?? 0.2;

  let value = weight * (MOD_SHARE * modGain + PROGRESS_SHARE * points);
  if (modGain > 0) {
    if (priority === 3 && capped === 20) value += 1;
    if (ability === 'con' && ctx.concentrates) value += 1;
  }
  return value;
}

/** Best way to spend a +2 ASI: either +2 in one stat or +1 in two. */
export function bestAsiAllocations(ctx: BuildContext, limit = 3): AsiSuggestion[] {
  const options: AsiSuggestion[] = [];

  for (let ai = 0; ai < ABILITIES.length; ai++) {
    const a = ABILITIES[ai];
    const from = ctx.scores[a];
    if (from < 20) {
      const value = pointValue(ctx, a, from, from + 2);
      options.push({
        kind: 'asi',
        id: `asi:${a}:${a}`,
        allocation: [a, a],
        score: value,
        headline: `${ABILITY_NAMES[a]} ${from} → ${Math.min(20, from + 2)}, a full modifier step.`,
        reasons: [
          {
            text: `${ABILITY_NAMES[a]} ${from} → ${Math.min(20, from + 2)} (modifier ${formatMod(abilityMod(from))} → ${formatMod(abilityMod(Math.min(20, from + 2)))})`,
            delta: value,
          },
        ],
      });
    }
    // Each unordered pair once: +1/+1 across two different abilities.
    for (let bi = ai + 1; bi < ABILITIES.length; bi++) {
      const b = ABILITIES[bi];
      if (ctx.scores[a] >= 20 || ctx.scores[b] >= 20) continue;
      const va = pointValue(ctx, a, ctx.scores[a], ctx.scores[a] + 1);
      const vb = pointValue(ctx, b, ctx.scores[b], ctx.scores[b] + 1);
      // Only offer a split when both halves earn their point. Otherwise the
      // dead half is noise and putting the whole +2 in one stat is better.
      if (va < MIN_ASI_VALUE || vb < MIN_ASI_VALUE) continue;
      options.push({
        kind: 'asi',
        id: `asi:${a}:${b}`,
        allocation: [a, b],
        score: va + vb,
        headline: `A modifier step in both ${ABILITY_NAMES[a]} and ${ABILITY_NAMES[b]}, which beats +2 in either one.`,
        reasons: [
          { text: `${ABILITY_NAMES[a]} ${ctx.scores[a]} → ${ctx.scores[a] + 1}`, delta: va },
          { text: `${ABILITY_NAMES[b]} ${ctx.scores[b]} → ${ctx.scores[b] + 1}`, delta: vb },
        ],
      });
    }
  }

  return options
    .filter((o) => o.score >= MIN_ASI_VALUE)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}

function formatMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

/**
 * The part of scoring that is the same for a feat and for a class option: a
 * baseline power level, then every conditional rule that fires contributing
 * both its delta and its reason. Keeping it in one place is what stops feats
 * and invocations explaining themselves in two different formats.
 */
export function scoreRules(
  base: number,
  rules: ScoreRule[] | undefined,
  ctx: BuildContext,
): { score: number; reasons: Reason[] } {
  const reasons: Reason[] = [{ text: 'Baseline power level', delta: base }];
  let score = base;
  for (const rule of rules ?? []) {
    if (!matches(rule.when, ctx)) continue;
    score += rule.delta;
    reasons.push({ text: rule.why, delta: rule.delta });
  }
  return { score, reasons };
}

/** The most load-bearing reason, which is what a one-line summary should say. */
export function headlineOf(reasons: Reason[], fallback: string): string {
  const specific = reasons.slice(1).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
  return specific?.text ?? fallback;
}

export function scoreFeat(feat: Feat, ctx: BuildContext, atLevel?: number): FeatSuggestion {
  const rolled = scoreRules(feat.base, feat.rules, ctx);
  const reasons = rolled.reasons;
  let score = rolled.score;

  // Half-feats: credit the +1 wherever it does the most good.
  let asiChoice: Ability | undefined;
  if (feat.asi) {
    let best = -1;
    for (const ability of feat.asi.abilities) {
      const from = ctx.scores[ability];
      const value = pointValue(ctx, ability, from, from + feat.asi.amount);
      if (value > best) {
        best = value;
        asiChoice = ability;
      }
    }
    if (asiChoice && best > 0) {
      best *= HALF_FEAT_DISCOUNT;
      score += best;
      const from = ctx.scores[asiChoice];
      const to = Math.min(20, from + feat.asi.amount);
      const crossesStep = abilityMod(to) > abilityMod(from);
      reasons.push({
        text: `Half-feat: put the +1 into ${ABILITY_NAMES[asiChoice]} (${from} → ${to})${
          crossesStep ? ', which is a full modifier step' : ''
        }`,
        delta: best,
      });
    } else if (asiChoice) {
      reasons.push({
        text: 'Half-feat, but the +1 does not cross a modifier step in this build',
        delta: 0,
      });
    }
  }

  const prereq = checkPrereq(feat, ctx, atLevel);

  return {
    kind: 'feat',
    id: feat.id,
    feat,
    score: Math.max(0, score),
    // The baseline is true of the feat everywhere; the headline should be what
    // makes it good (or bad) for *this* build.
    headline: headlineOf(reasons, feat.summary),
    reasons: reasons.filter((r) => r.delta !== 0 || reasons.length === 1),
    asiChoice,
    eligible: prereq.ok,
    blockedBy: prereq.problems,
  };
}

export interface RecommendOptions {
  /** Exclude feats the build already has. */
  excludeTaken?: boolean;
  /** Show feats whose prerequisites are not met (greyed out in the UI). */
  includeIneligible?: boolean;
  limit?: number;
  /**
   * The class level of the slot being filled. In 2024 the level 19 improvement
   * is specifically an Epic Boon, so that slot offers only Boons and every
   * other slot offers none.
   */
  slotLevel?: number;
  /**
   * The character level this slot is reached at. Level prerequisites are
   * measured against it, so planning ahead can offer a feat the character does
   * not yet qualify for but will by the time the slot arrives.
   */
  atLevel?: number;
}

/** Which feat categories can fill a given improvement slot. */
function allowedInSlot(feat: Feat, ctx: BuildContext, slotLevel: number | undefined): boolean {
  if (ctx.build.ruleset !== '2024') return true;
  const isBoon = feat.category === 'epic-boon';
  // Without a known slot we are answering "what is worth taking generally",
  // where a Boon is only relevant to a character who has reached 19.
  if (slotLevel === undefined) return isBoon ? ctx.totalLevel >= 19 : true;
  return slotLevel >= 19 ? isBoon : !isBoon;
}

/**
 * An Epic Boon replaces the level 19 improvement. The slot is identified by
 * character level where we know it, falling back to the class level for a
 * single-classed character.
 */
function boonLevel(slotLevel?: number, atLevel?: number): number | undefined {
  if (slotLevel === undefined) return undefined;
  return Math.max(slotLevel, atLevel ?? 0);
}

export function recommendFeats(ctx: BuildContext, options: RecommendOptions = {}): FeatSuggestion[] {
  const { excludeTaken = true, includeIneligible = false, limit, slotLevel, atLevel } = options;
  let list = featsFor(ctx.build.ruleset)
    .filter((feat) => allowedInSlot(feat, ctx, slotLevel))
    .map((feat) => scoreFeat(feat, ctx, atLevel));
  if (excludeTaken) list = list.filter((s) => !ctx.featIds.has(s.id));
  if (!includeIneligible) list = list.filter((s) => s.eligible);
  list.sort((a, b) => b.score - a.score || a.feat.name.localeCompare(b.feat.name));
  return limit ? list.slice(0, limit) : list;
}

/** Everything worth spending the next ASI slot on, feats and ability bumps together. */
export function recommendNext(
  ctx: BuildContext,
  limit = 8,
  slotLevel?: number,
  atLevel?: number,
): Suggestion[] {
  const level = boonLevel(slotLevel, atLevel);
  const feats = recommendFeats(ctx, { limit: limit + 4, slotLevel: level, atLevel });
  // At 19 in 2024 the improvement must be an Epic Boon, so a plain ability
  // increase is not on the table.
  const boonSlot = ctx.build.ruleset === '2024' && level !== undefined && level >= 19;
  const asis = boonSlot ? [] : bestAsiAllocations(ctx, 3);
  return [...feats, ...asis].sort((a, b) => b.score - a.score).slice(0, limit);
}

// ---------------------------------------------------------------- level plan

export interface PlannedSlot {
  slot: FutureSlot | null;
  /** null slot means an unspent ASI the character already has available. */
  label: string;
  choice: Suggestion;
  runnerUp?: Suggestion;
  scoresAfter: Record<Ability, number>;
}

function applySuggestion(build: Build, suggestion: Suggestion): Build {
  const next: Build = {
    ...build,
    featIds: [...build.featIds],
    featAsiChoices: { ...build.featAsiChoices },
    asiPicks: build.asiPicks.map((p) => [...p]),
  };
  if (suggestion.kind === 'feat') {
    next.featIds.push(suggestion.id);
    if (suggestion.asiChoice) next.featAsiChoices[suggestion.id] = suggestion.asiChoice;
  } else {
    next.asiPicks.push([...suggestion.allocation]);
  }
  return next;
}

/**
 * Walk the character forward through every remaining ASI level, greedily
 * taking the highest-value option and re-deriving the build each time. Greedy
 * is the right model here because 5e ASIs are taken one at a time and each
 * choice changes what the next one is worth.
 */
export function planProgression(build: Build, maxCharacterLevel = 20): PlannedSlot[] {
  const plan: PlannedSlot[] = [];
  let current = build;
  let ctx = deriveBuild(current);

  const unspent = Math.max(0, ctx.asiSlotsReached - ctx.asiSlotsSpent);
  for (let i = 0; i < unspent; i++) {
    const options = recommendNext(ctx, 3);
    if (!options.length) break;
    const [choice, runnerUp] = options;
    current = applySuggestion(current, choice);
    ctx = deriveBuild(current);
    plan.push({
      slot: null,
      label: `Unspent slot ${i + 1} (available now)`,
      choice,
      runnerUp,
      scoresAfter: { ...ctx.scores },
    });
  }

  for (const slot of futureAsiSlots(current, maxCharacterLevel)) {
    const options = recommendNext(ctx, 3, slot.classLevel, slot.estimatedCharacterLevel);
    if (!options.length) break;
    const [choice, runnerUp] = options;
    current = applySuggestion(current, choice);
    ctx = deriveBuild(current);
    plan.push({
      slot,
      label: `${slot.className} ${slot.classLevel} (character level ~${slot.estimatedCharacterLevel})`,
      choice,
      runnerUp,
      scoresAfter: { ...ctx.scores },
    });
  }

  return plan;
}

export function describeSuggestion(suggestion: Suggestion): string {
  if (suggestion.kind === 'feat') return suggestion.feat.name;
  const [a, b] = suggestion.allocation;
  return a === b
    ? `+2 ${ABILITY_NAMES[a]}`
    : `+1 ${ABILITY_NAMES[a]} / +1 ${ABILITY_NAMES[b]}`;
}
