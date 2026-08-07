import type { Build } from '../types';
import { CLASS_OPTIONS, optionById, optionsFor } from '../data/classOptions';
import type { ClassOption } from '../data/classOptions';
import type { ClassOptionKind } from '../data/classFeatures';
import { OPTION_KINDS, optionSlots } from './features';
import type { BuildContext } from './character';
import { headlineOf, scoreRules } from './recommend';
import type { Reason } from './recommend';

/**
 * Scoring for the choices a class feature hands you.
 *
 * These reuse the feat machinery deliberately - `scoreRules` and `headlineOf`
 * are the same functions - so an invocation explains itself the way a feat
 * does, with every rule that fired and by how much.
 */

export interface OptionSuggestion {
  kind: 'class-option';
  id: string;
  option: ClassOption;
  score: number;
  reasons: Reason[];
  headline: string;
  eligible: boolean;
  blockedBy: string[];
  /** Already chosen; shown, but not offered again. */
  taken: boolean;
}

function checkOptionPrereq(option: ClassOption, ctx: BuildContext): string[] {
  const problems: string[] = [];
  const prereq = option.prereq;
  if (!prereq) return problems;

  // A Warlock's invocation level requirement is against Warlock levels, not
  // character level - a Fighter 10 / Warlock 2 does not get Thirsting Blade.
  if (prereq.minLevel !== undefined) {
    const classLevel = ctx.slices
      .filter((s) => s.klass.id === option.classId)
      .reduce((sum, s) => sum + s.entry.level, 0);
    if (classLevel < prereq.minLevel) {
      problems.push(
        `Requires ${option.classId} level ${prereq.minLevel}; this character has ${classLevel}.`,
      );
    }
  }

  if (prereq.pactBoon && ctx.build.pactBoon !== prereq.pactBoon) {
    const needed = optionById(prereq.pactBoon);
    problems.push(`Requires ${needed?.name ?? prereq.pactBoon}.`);
  }

  if (prereq.note) problems.push(prereq.note);
  return problems;
}

export function scoreOption(option: ClassOption, ctx: BuildContext): OptionSuggestion {
  const { score, reasons } = scoreRules(option.base, option.rules, ctx);
  const blockedBy = checkOptionPrereq(option, ctx);

  return {
    kind: 'class-option',
    id: option.id,
    option,
    score: Math.max(0, score),
    reasons: reasons.filter((r) => r.delta !== 0 || reasons.length === 1),
    headline: headlineOf(reasons, option.summary),
    eligible: blockedBy.length === 0,
    blockedBy,
    taken: ctx.build.classOptionIds.includes(option.id) || ctx.build.pactBoon === option.id,
  };
}

export interface OptionGroup {
  kind: ClassOptionKind;
  label: string;
  slots: number;
  /** Choices already made that belong to this kind. */
  chosen: string[];
  open: number;
  suggestions: OptionSuggestion[];
}

const KIND_LABELS: Record<ClassOptionKind, { one: string; many: string }> = {
  'fighting-style': { one: 'fighting style', many: 'fighting styles' },
  'pact-boon': { one: 'Pact Boon', many: 'Pact Boons' },
  invocation: { one: 'Eldritch Invocation', many: 'Eldritch Invocations' },
  // Metamagic is its own plural.
  metamagic: { one: 'Metamagic option', many: 'Metamagic options' },
  maneuver: { one: 'maneuver', many: 'maneuvers' },
};

/** "3 maneuvers", "1 Eldritch Invocation". */
export function describeSlots(kind: ClassOptionKind, count: number): string {
  const label = KIND_LABELS[kind];
  return `${count} ${count === 1 ? label.one : label.many}`;
}

/**
 * Maneuvers come from the Battle Master subclass rather than the Fighter class,
 * so their slots are counted here rather than declared on a class feature.
 */
function extraSlots(kind: ClassOptionKind, ctx: BuildContext): number {
  if (kind !== 'maneuver') return 0;
  const battleMaster = ctx.slices.find((s) => s.subclass?.id === 'battle-master');
  if (!battleMaster) return 0;
  const level = battleMaster.entry.level;
  return [3, 7, 10, 15].filter((l) => level >= l).reduce((sum, l) => sum + (l === 3 ? 3 : 2), 0);
}

/** Feats that hand out a class option to someone who would not otherwise have one. */
const FEAT_SLOTS: Record<string, { kind: ClassOptionKind; count: number }> = {
  'eldritch-adept': { kind: 'invocation', count: 1 },
  'metamagic-adept': { kind: 'metamagic', count: 2 },
  'martial-adept': { kind: 'maneuver', count: 2 },
  'fighting-initiate': { kind: 'fighting-style', count: 1 },
};

export function slotsFor(kind: ClassOptionKind, ctx: BuildContext): number {
  let slots = optionSlots(ctx.features, kind) + extraSlots(kind, ctx);
  for (const featId of ctx.featIds) {
    const grant = FEAT_SLOTS[featId];
    if (grant?.kind === kind) slots += grant.count;
  }
  return slots;
}

/**
 * Every kind of choice this character has open, with the options ranked. Only
 * kinds they actually have slots in appear, so a Wizard is not shown an empty
 * invocation list.
 */
export function optionGroups(ctx: BuildContext): OptionGroup[] {
  const groups: OptionGroup[] = [];

  for (const kind of OPTION_KINDS) {
    const slots = slotsFor(kind, ctx);
    if (slots === 0) continue;

    const chosen =
      kind === 'pact-boon'
        ? ctx.build.pactBoon
          ? [ctx.build.pactBoon]
          : []
        : ctx.build.classOptionIds.filter((id) => optionById(id)?.kind === kind);

    const suggestions = optionsFor(kind, ctx.build.ruleset)
      .map((option) => scoreOption(option, ctx))
      .sort(
        (a, b) =>
          Number(a.taken) - Number(b.taken) ||
          Number(b.eligible) - Number(a.eligible) ||
          b.score - a.score ||
          a.option.name.localeCompare(b.option.name),
      );

    groups.push({
      kind,
      label: KIND_LABELS[kind].many,
      slots,
      chosen,
      open: Math.max(0, slots - chosen.length),
      suggestions,
    });
  }

  return groups;
}

/**
 * Options that are no longer legal - a Pact of the Blade invocation kept after
 * switching to Tome, or a choice from a class this character no longer has.
 * Reported rather than silently dropped, the way skill picks are.
 */
export function reconcileClassOptions(build: Build, ctx: BuildContext): {
  build: Build;
  changes: string[];
} {
  const changes: string[] = [];
  const kept = build.classOptionIds.filter((id) => {
    const option = optionById(id);
    if (!option) {
      changes.push('An option this character no longer has access to was removed.');
      return false;
    }
    if (!(option.rulesets ?? ['2014', '2024']).includes(build.ruleset)) {
      changes.push(`${option.name} is not in this ruleset, so it was dropped.`);
      return false;
    }
    const problems = checkOptionPrereq(option, ctx);
    if (problems.length) {
      changes.push(`${option.name} was dropped: ${problems[0].toLowerCase()}`);
      return false;
    }
    return true;
  });

  let pactBoon = build.pactBoon;
  if (pactBoon && !ctx.slices.some((s) => s.klass.id === 'warlock')) {
    changes.push('Your Pact Boon was cleared, since this character is no longer a Warlock.');
    pactBoon = undefined;
  }

  if (!changes.length) return { build, changes };
  return { build: { ...build, classOptionIds: kept, pactBoon }, changes };
}

/** All options, for the data-integrity tests. */
export { CLASS_OPTIONS };
