import { subclassName, subclassesFor } from '../data/classes';
import { SKILLS } from '../data/skills';
import type { SkillId } from '../data/skills';
import { SOURCE_LABELS } from '../data/sources';
import { deriveBuild } from '../engine/character';
import type { BuildContext } from '../engine/character';
import { optionGroups, reconcileClassOptions } from '../engine/classOptions';
import { legalPicks } from '../engine/proficiency';
import { describeSuggestion, recommendFeats, recommendNext } from '../engine/recommend';
import { recommendSkills } from '../engine/skillValue';
import { describeSpell, recommendSpells, scoreSpell } from '../engine/spellRecommend';
import type { Build } from '../types';
import type { RankedPick } from './flowSteps';
import { SECTION_LABEL } from './sections';
import type { WaitingChoice } from './sections';

/**
 * §138. One waiting choice, as a ranked list and a way to apply one.
 *
 * ## Why this is a module and not four `if`s in the Builder
 *
 * The guided flow asks the same question of four different engines - feats
 * (`recommend.ts`), class options (`classOptions.ts`), skills
 * (`skillValue.ts`) and the ability score improvement, which is the feat
 * engine wearing a different hat. All four already return the same shape:
 * a score, a list of signed reasons, a headline that is the strongest of
 * them, and whether the thing can be taken at all. That was not designed for
 * this and it is the reason this card could be one card.
 *
 * What differs between them is only *how you apply one*, which is three lines
 * of `Build` patching each and lives here rather than being reached for
 * through the panel that happens to own it today. The Builder's own panels
 * keep their copies because they do more than apply - they toggle, they
 * remove, they reconcile - and the flow only ever adds.
 *
 * ## What is not here
 *
 * The form-shaped choices: a background, six ability scores, what you are
 * wearing. Those are not rankings and pretending they were would mean
 * inventing scores the engine does not have an opinion about. Their steps
 * name the section that answers them instead.
 */

export interface RankedStep {
  picks: RankedPick[];
  /** The build that results from taking one, by pick id. Null if it cannot. */
  apply: (id: string) => Build | null;
  /** A sentence for the card's foot about what applying one does. */
  foot: string;
}

/** How many takeable options a step shows before it is a wall rather than a list. */
const SHOWN = 4;

/**
 * How many refused options ride along, and why any do.
 *
 * A list that quietly drops what you cannot take teaches nothing: you go
 * looking for Perception, do not find it, and never learn that you already
 * have it. So the highest-scoring refusal is shown at the choice, dimmed, with
 * the reason where its score would be - already taken, prerequisite not met,
 * or legal and simply worthless here. The third is the one people learn from,
 * which is why it is scored low rather than hidden.
 *
 * One, not all of them. The point is that the refusal is *reachable* where the
 * choice is made, not that the card becomes a list of things you cannot do.
 */
const REFUSED_SHOWN = 1;

/** The takeable options, then the most instructive refusal. */
function withRefusals<T>(takeable: T[], refused: T[]): T[] {
  return [...takeable.slice(0, SHOWN), ...refused.slice(0, REFUSED_SHOWN)];
}

/**
 * The engine scores feats and skills on different scales, and neither is a
 * percentage. The bar normalises; the number beside it is the raw score,
 * rounded, because a made-up percentage is harder to argue with than a real
 * figure whose units you have to learn.
 */
export function rankedStepFor(
  choice: WaitingChoice,
  ctx: BuildContext,
  build: Build,
): RankedStep | null {
  if (choice.shape !== 'ranked') return null;

  // ------------------------------------- an improvement, or a feat instead
  if (choice.id === 'asi') {
    /*
      `recommendNext` filters out what cannot be taken, which is right for a
      ranking and wrong for a step - so the refusals are asked for separately
      and the best one is put back on the end. Asked of the same scorer, so it
      is ranked against the others rather than appended arbitrarily.
    */
    const refused = recommendFeats(ctx, {
      includeIneligible: true,
      excludeTaken: false,
      limit: 60,
    }).filter((s) => !s.eligible || build.featIds.includes(s.id));
    const suggestions = [...recommendNext(ctx, SHOWN), ...refused.slice(0, REFUSED_SHOWN)];
    return {
      foot: 'Applying one fills the Feats box on the sheet below and re-checks the plan.',
      picks: suggestions.map((s) => ({
        id: s.id,
        name: describeSuggestion(s),
        source: s.kind === 'feat' ? SOURCE_LABELS[s.feat.source] : 'ability score improvement',
        score: s.score,
        headline: s.headline,
        reasons: s.reasons,
        blockedBy: s.kind === 'feat' && !s.eligible ? s.blockedBy : undefined,
        taken: s.kind === 'feat' && build.featIds.includes(s.id),
      })),
      apply: (id) => {
        const pick = suggestions.find((s) => s.id === id);
        if (!pick) return null;
        if (pick.kind === 'asi') return { ...build, asiPicks: [...build.asiPicks, [...pick.allocation]] };
        return {
          ...build,
          featIds: [...build.featIds, pick.id],
          featAsiChoices: pick.asiChoice
            ? { ...build.featAsiChoices, [pick.id]: pick.asiChoice }
            : build.featAsiChoices,
        };
      },
    };
  }

  // ------------------------------------------------- the subclass, when due
  if (choice.id.startsWith('subclass:')) {
    const classId = choice.id.slice('subclass:'.length);
    const slice = ctx.slices.find((s) => s.klass.id === classId);
    if (!slice) return null;
    /*
      §156: offered, not ranked - `score: null` is the contract for exactly
      this. No engine scores subclasses, and inventing numbers would be
      inventing the opinion; what the data does carry is a curated note per
      subclass, which rides as the headline so the list still argues.
    */
    return {
      foot: 'A subclass shapes every level after this one. The note is its pitch; the sheet below shows what it changes.',
      picks: subclassesFor(slice.klass, build.ruleset).map((s) => ({
        id: s.id,
        name: subclassName(s, build.ruleset),
        source: SOURCE_LABELS[s.source],
        score: null,
        headline: s.note,
        reasons: [],
      })),
      apply: (id) => ({
        ...build,
        classes: build.classes.map((entry) =>
          entry.classId === classId ? { ...entry, subclassId: id } : entry,
        ),
      }),
    };
  }

  // --------------------------------------------- the free feat an origin grants
  if (choice.id === 'origin-feat') {
    /*
      2014 has no feat categories, so any feat can fill a Variant Human's free
      pick; 2024 restricts origin feats to the Origin category. Filtered after
      ranking rather than before, so the ranking is against the whole list and
      the same feat scores the same wherever it is offered.
    */
    const origin = recommendFeats(ctx, { includeIneligible: true, excludeTaken: false, limit: 80 })
      .filter((s) => build.ruleset === '2014' || s.feat.category === 'origin');
    const suggestions = withRefusals(
      origin.filter((s) => s.eligible && !build.originFeatIds.includes(s.id)),
      origin.filter((s) => !s.eligible || build.originFeatIds.includes(s.id)),
    );
    return {
      foot: 'An origin feat is free and does not spend an improvement.',
      picks: suggestions.map((s) => ({
        id: s.id,
        name: s.feat.name,
        source: SOURCE_LABELS[s.feat.source],
        score: s.score,
        headline: s.headline,
        reasons: s.reasons,
        blockedBy: s.eligible ? undefined : s.blockedBy,
        taken: build.originFeatIds.includes(s.id),
      })),
      apply: (id) => ({ ...build, originFeatIds: [...build.originFeatIds, id] }),
    };
  }

  // ------------------------------------------ a fighting style, an invocation
  if (choice.id.startsWith('option:')) {
    const kind = choice.id.slice('option:'.length);
    const group = optionGroups(ctx).find((g) => g.kind === kind);
    if (!group) return null;
    return {
      foot: 'Class options can be swapped when the class next levels.',
      picks: withRefusals(
        group.suggestions.filter((s) => s.eligible && !s.taken),
        /* `optionGroups` already sorts taken and ineligible to the bottom, so
           this is the same list read from the other end. */
        group.suggestions.filter((s) => !s.eligible || s.taken),
      ).map((s) => ({
        id: s.id,
        name: s.option.name,
        source: SOURCE_LABELS[s.option.source],
        score: s.score,
        headline: s.headline,
        reasons: s.reasons,
        blockedBy: s.eligible ? undefined : s.blockedBy,
        taken: s.taken,
      })),
      apply: (id) => {
        if (kind === 'pact-boon') {
          /* One Pact Boon, and changing it can invalidate invocations that
             needed the old one - so this goes through the same reconcile the
             Builder's own panel uses rather than writing the field raw. */
          const next = { ...build, pactBoon: id };
          const reconciled = reconcileClassOptions(next, deriveBuild(next));
          return {
            ...build,
            pactBoon: reconciled.build.pactBoon,
            classOptionIds: reconciled.build.classOptionIds,
          };
        }
        return { ...build, classOptionIds: [...build.classOptionIds, id] };
      },
    };
  }

  // ------------------------------------------------- skills, and doubling one
  if (choice.id === 'skills' || choice.id === 'expertise') {
    const expertise = choice.id === 'expertise';
    const ranked = recommendSkills(ctx);
    /*
      Expertise doubles a proficiency, so its list is what you are already
      proficient in - offering Athletics to somebody who cannot roll it is not
      a low-ranked suggestion, it is a wrong one. A plain skill pick is the
      other way round: whatever this character is legal to take.
    */
    const legal: Set<string> = expertise
      ? new Set(ctx.proficiencies.skills.filter((line) => line.proficient).map((l) => l.skill))
      : new Set(
          legalPicks({ build, race: ctx.race, slices: ctx.slices, featIds: ctx.featIds }),
        );
    const has: string[] = expertise ? build.expertiseIds : build.skillIds;
    /*
      A skill you already have is the commonest refusal there is, and the one
      most worth saying out loud: without it you look for Perception, do not
      find it, and never learn that it is already yours.
    */
    const offered = withRefusals(
      ranked.filter((s) => legal.has(s.skill) && !has.includes(s.skill)),
      ranked.filter((s) => has.includes(s.skill)),
    );
    return {
      foot: expertise
        ? 'Expertise doubles proficiency on the skill you choose.'
        : 'A proficiency adds your proficiency bonus to that skill for good.',
      picks: offered.map((s) => ({
        id: s.skill,
        name: s.name,
        source: SKILLS.find((skill) => skill.id === s.skill)?.ability.toUpperCase(),
        score: s.score,
        headline: s.headline,
        reasons: s.reasons,
        taken: (has as string[]).includes(s.skill),
      })),
      apply: (id) =>
        expertise
          ? { ...build, expertiseIds: [...build.expertiseIds, id as SkillId] }
          : { ...build, skillIds: [...build.skillIds, id as SkillId] },
    };
  }

  // ------------------------------------------------ what a caster knows
  if (choice.id === 'cantrips' || choice.id === 'spells') {
    const cantrips = choice.id === 'cantrips';
    const offered = recommendSpells(ctx, SHOWN + 8).filter((s) =>
      cantrips ? s.spell.level === 0 : s.spell.level > 0,
    );
    /* `recommendSpells` drops what is already known or granted, so the refusal
       has to be asked for separately - and a spell you already know is the
       one a reader is most likely to go looking for. */
    const known = ctx.spellcasting.available
      .filter((spell) => (cantrips ? spell.level === 0 : spell.level > 0))
      .filter((spell) => build.spellIds.includes(spell.id))
      .map((spell) => scoreSpell(spell, ctx));
    return {
      foot: cantrips
        ? 'A cantrip is known for good and costs no slot to cast.'
        : 'Recorded as known. What a prepared caster prepares from it is the next step.',
      picks: withRefusals(offered, known).map((s) => ({
        id: s.id,
        name: s.spell.name,
        source: describeSpell(s.spell),
        score: s.score,
        headline: s.headline,
        reasons: s.reasons,
        taken: build.spellIds.includes(s.id),
      })),
      /*
        No `spellSources` written. Where two of a character's classes could
        have taught a spell the Builder's own panel records which, and its
        default is "whichever casts it best" - which is exactly what
        `sourceForSpell` falls back to when there is no entry. So leaving it
        out and writing the best teacher in are the same sheet, and the flow
        writes the one that cannot go stale.
      */
      apply: (id) => ({ ...build, spellIds: [...build.spellIds, id] }),
    };
  }

  return null;
}

/**
 * A form-shaped step's body, in a sentence.
 *
 * These are the choices the engine holds no opinion about - a background, six
 * ability scores, what you are wearing - and inventing a ranking for them
 * would be inventing the scores too. So the step says what is waiting and
 * points at the section that answers it, which is a real answer rather than a
 * ranked list of one.
 */
export const formStepHint = (choice: WaitingChoice): string =>
  `${choice.open} ${choice.open === 1 ? 'answer is' : 'answers are'} waiting, and this one is a form rather than a ranking - there is nothing here for the engine to have an opinion about. It is filled in under ${SECTION_LABEL[choice.section]}.`;
