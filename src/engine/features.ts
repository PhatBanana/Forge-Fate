import type { Ruleset } from '../types';
import { classFeaturesAt } from '../data/classFeatures';
import type { ClassFeature, ClassOptionKind, FeatureTag } from '../data/classFeatures';
import { subclassLevelFor } from '../data/classes';
import { SUBCLASS_FEATURES, SUBCLASS_FEATURES_2024 } from '../data/subclassFeatures';
import type { ClassSlice } from './character';

/**
 * The one place that answers "what does this character have".
 *
 * Before this existed, Extra Attack lived in character.ts as a boolean plus
 * four subclass exceptions written out by id, Jack of All Trades and Reliable
 * Talent were class-id checks in proficiency.ts, and unarmored defense was
 * another set in defense.ts. Every phase added to that pile. Now a feature is
 * declared once in the data with a tag, and the engine asks for the tag.
 */

/** A feature, plus which class or subclass on this character supplied it. */
export interface HeldFeature extends ClassFeature {
  source: string;
  /** Which class slice it came from, for per-class level questions. */
  classLevel: number;
}

export function featuresFor(slices: ClassSlice[], ruleset: Ruleset): HeldFeature[] {
  const out: HeldFeature[] = [];

  for (const slice of slices) {
    for (const feature of classFeaturesAt(slice.klass.id, slice.entry.level, ruleset)) {
      out.push({ ...feature, source: slice.klass.name, classLevel: slice.entry.level });
    }

    // A subclass only contributes once the character is high enough to have
    // chosen it, which 2024 moved to level 3 for everyone.
    if (!slice.subclass) continue;
    if (slice.entry.level < subclassLevelFor(slice.klass, ruleset)) continue;

    /*
      Two sources, merged by name. `Subclass.features` is the engine half - the
      handful that carry a tag, like a Bladesinger's Extra Attack - and
      `SUBCLASS_FEATURES` is the display half. The engine entry wins where both
      describe the same feature, because losing a tag would quietly switch off
      whatever reads it.
    */
    const engineFeatures = (slice.subclass.features ?? []).filter((f) =>
      (f.rulesets ?? ['2014', '2024']).includes(ruleset),
    );
    // Only an engine feature that applies here suppresses the display entry of
    // the same name. A Champion's 2014 Remarkable Athlete is a different
    // feature from the 2024 one, so scoping it to 2014 must let the 2024
    // version through rather than silencing both.
    const declared = new Set(engineFeatures.map((f) => f.name));
    // 2024 moved subclass features wholesale, so where there is a rewritten
    // progression it replaces the 2014 one rather than merging with it - a
    // feature that moved from level 7 to level 3 must not appear at both.
    const table =
      (ruleset === '2024' ? SUBCLASS_FEATURES_2024[slice.subclass.id] : undefined) ??
      SUBCLASS_FEATURES[slice.subclass.id] ??
      [];
    const display = table.filter((f) => !declared.has(f.name));

    for (const feature of [...engineFeatures, ...display]) {
      if (slice.entry.level < feature.level) continue;
      if (!(feature.rulesets ?? ['2014', '2024']).includes(ruleset)) continue;
      out.push({ ...feature, source: slice.subclass.name, classLevel: slice.entry.level });
    }
  }

  return out.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

export function hasFeatureTag(features: HeldFeature[], tag: FeatureTag): boolean {
  return features.some((f) => f.tags?.includes(tag));
}

/** The feature that supplied a tag, for naming it in the UI. */
export function featureWithTag(features: HeldFeature[], tag: FeatureTag): HeldFeature | undefined {
  return features.find((f) => f.tags?.includes(tag));
}

/** Total count across every feature carrying a tag - expertise slots, mainly. */
export function featureCount(features: HeldFeature[], tag: FeatureTag): number {
  return features
    .filter((f) => f.tags?.includes(tag))
    .reduce((sum, f) => sum + (f.count ?? 1), 0);
}

/** How many choices of a kind this character has unlocked. */
export function optionSlots(features: HeldFeature[], kind: ClassOptionKind): number {
  return features
    .filter((f) => f.grants?.kind === kind)
    .reduce((sum, f) => sum + f.grants!.count, 0);
}

/** Every option kind this character has any slots in, in a stable order. */
export const OPTION_KINDS: ClassOptionKind[] = [
  'fighting-style',
  'pact-boon',
  'invocation',
  'metamagic',
  'maneuver',
];
