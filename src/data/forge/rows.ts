import type { ClassId, Subclass } from '../../types';
import type { ClassFeature } from '../classFeatures';

/**
 * The one shape both Forge subclass files write their rows in, and the one
 * grouping both need. Before this, `subclasses.ts` and `classSubclasses.ts`
 * each declared the same three-field interface and pasted the same
 * reduce-and-fromEntries pair; a third forge file would have made it three.
 */
export interface ForgeSubclassRow {
  classId: ClassId;
  subclass: Subclass;
  features: ClassFeature[];
}

/** The app's four original classes, as a type the tables can be keyed by. */
export type ForgeClassId = 'reckoner' | 'harrier' | 'marshal' | 'adept';

/**
 * Rows grouped the two ways the consumers merge them: subclasses by class
 * for `classes.ts` to fold in, and features by subclass id in the shape
 * `subclassFeatures.ts` exports.
 */
export function groupForgeRows(rows: ForgeSubclassRow[]): {
  byClass: Partial<Record<ClassId, Subclass[]>>;
  features: Record<string, ClassFeature[]>;
} {
  const byClass: Partial<Record<ClassId, Subclass[]>> = {};
  for (const row of rows) (byClass[row.classId] ??= []).push(row.subclass);
  return {
    byClass,
    features: Object.fromEntries(rows.map((row) => [row.subclass.id, row.features])),
  };
}
