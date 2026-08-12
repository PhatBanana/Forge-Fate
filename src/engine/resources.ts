import type { Ability, ClassId, Ruleset } from '../types';
import { resourcesForClass } from '../data/classResources';
import type { ClassResource, Recharge, ResourceMax } from '../data/classResources';
import type { ClassSlice } from './character';

/**
 * Turning the resource table into numbers for one character.
 *
 * The only subtlety is multiclassing, and it is the same one the spell slots
 * have: a resource counts your level *in the class that grants it*, not your
 * character level. A Fighter 3 / Wizard 9 has one Action Surge, not the two a
 * 17th-level Fighter would.
 */

export interface HeldResource {
  /** Unique across the whole character, since two classes can both grant one. */
  key: string;
  classId: ClassId;
  className: string;
  /**
   * The level in the class that grants it - carried here because every
   * question about a held resource (its recharge, its detail line) is asked
   * at this level, and the callers that used to answer it re-derived the
   * level with three identical lookups.
   */
  classLevel: number;
  resource: ClassResource;
  max: number;
  /**
   * What a use is worth at this level, where that is not the same question as
   * how many uses there are. Resolved here because this is where the class
   * level is known; `null` for the resources whose count says it all.
   */
  detail: string | null;
}

function resolveMax(
  max: ResourceMax,
  classLevel: number,
  mods: Record<Ability, number>,
): number {
  switch (max.kind) {
    case 'table': {
      // The highest entry at or below this level, the way every other
      // progression in the app is read.
      const reached = max.byLevel.filter((entry) => classLevel >= entry.level);
      return reached.length ? reached[reached.length - 1].count : 0;
    }
    case 'classLevel':
      return classLevel * (max.times ?? 1);
    case 'abilityMod':
      return Math.max(max.min ?? 0, mods[max.ability] + (max.plus ?? 0));
  }
}

export function heldResources(
  slices: ClassSlice[],
  ruleset: Ruleset,
  mods: Record<Ability, number>,
): HeldResource[] {
  const held: HeldResource[] = [];

  for (const slice of slices) {
    const classLevel = slice.entry.level;
    for (const resource of resourcesForClass(slice.klass.id, ruleset)) {
      if (classLevel < resource.minLevel) continue;
      const max = resolveMax(resource.max, classLevel, mods);
      // A Bard with Charisma 8 has a negative modifier; the floor already
      // handles it, but a resource that resolves to nothing is not worth a row.
      if (max <= 0) continue;
      held.push({
        key: `${slice.klass.id}:${resource.id}`,
        classId: slice.klass.id,
        className: slice.klass.name,
        classLevel,
        resource,
        max,
        detail: resource.detail?.(classLevel) ?? null,
      });
    }
  }

  return held;
}

/**
 * A recharge can improve with level - Font of Inspiration at 5th turns
 * Bardic Inspiration from once a day into once a short rest. Which resources
 * do that, and when, is data on the resource (`rechargeFrom`) rather than an
 * id check here.
 */
export function rechargeFor(held: HeldResource): Recharge {
  const upgrade = held.resource.rechargeFrom;
  if (upgrade && held.classLevel >= upgrade.level) return upgrade.recharge;
  return held.resource.recharge;
}

/**
 * The keys a given moment hands back, for one character.
 *
 * Two rules live here rather than at the four call sites that used to spell
 * them out, because they were spelled out as `=== 'short'` and that comparison
 * quietly became wrong the moment `'encounter'` joined the union - a
 * per-encounter resource would have been treated as once-a-day by every rest
 * button in the app.
 *
 * - A short rest returns anything that is not long-rest-only.
 * - The start of a fight returns exactly the per-encounter ones.
 */
export function restoredKeys(
  held: HeldResource[],
  moment: 'encounter' | 'short',
): string[] {
  return held
    .filter((h) => {
      const recharge = rechargeFor(h);
      return moment === 'short' ? recharge !== 'long' : recharge === 'encounter';
    })
    .map((h) => h.key);
}

/** What to call this recharge on a sheet. */
export const RECHARGE_LABEL: Record<Recharge, string> = {
  short: 'short rest',
  long: 'long rest',
  encounter: 'each fight',
};
