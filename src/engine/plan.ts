import type { Build } from '../types';
import { CLASSES_BY_ID } from '../data/classes';
import type { PlannedSlot } from './recommend';

/**
 * Taking a progression plan.
 *
 * `planProgression` in `recommend.ts` answers "what should I take at each ASI
 * level"; this is what happens when somebody presses the button. It lived
 * inside the Optimizer's progression section and had no tests of its own,
 * which is the reason it moved here in §33.1 rather than travelling with the
 * component: it raises class levels *and* spends ASI slots, and getting either
 * half wrong leaves a build that disagrees with itself - feats taken at levels
 * the character never reached.
 */

/**
 * The levels the build ends at once the plan is applied.
 *
 * The plan reaches forward to ASI levels the character has not hit yet, so
 * applying it has to take the character there too - otherwise the sheet spends
 * slots it does not own and the build review rightly complains.
 *
 * `Math.max` rather than assignment: a plan is in level order, but a build
 * already past one of its steps must not be *lowered* by it.
 */
export function plannedLevels(build: Build, plan: PlannedSlot[]): Map<string, number> {
  const levels = new Map<string, number>();
  for (const entry of build.classes) levels.set(entry.classId, entry.level);
  for (const step of plan) {
    if (!step.slot) continue;
    const current = levels.get(step.slot.classId) ?? 0;
    levels.set(step.slot.classId, Math.max(current, step.slot.classLevel));
  }
  return levels;
}

/** "Fighter 8" or "Fighter 6 / Rogue 2" - what the button offers to do. */
export function describePlannedLevels(build: Build, plan: PlannedSlot[]): string {
  const levels = plannedLevels(build, plan);
  return build.classes
    .map((c) => `${CLASSES_BY_ID[c.classId].name} ${levels.get(c.classId)}`)
    .join(' / ');
}

/**
 * The plan, taken: levels first, then every choice in the order planned.
 *
 * Purely additive to `featIds` and `asiPicks`, because the plan only ever
 * describes slots that are still open - it starts from what the build already
 * has, so replacing rather than appending would throw away the choices it was
 * planned around.
 */
export function applyPlan(build: Build, plan: PlannedSlot[]): Build {
  const levels = plannedLevels(build, plan);
  let updated: Build = {
    ...build,
    classes: build.classes.map((c) => ({ ...c, level: levels.get(c.classId) ?? c.level })),
  };
  for (const step of plan) {
    if (step.choice.kind === 'feat') {
      updated = {
        ...updated,
        featIds: [...updated.featIds, step.choice.id],
        featAsiChoices: step.choice.asiChoice
          ? { ...updated.featAsiChoices, [step.choice.id]: step.choice.asiChoice }
          : updated.featAsiChoices,
      };
    } else {
      updated = { ...updated, asiPicks: [...updated.asiPicks, [...step.choice.allocation]] };
    }
  }
  return updated;
}
