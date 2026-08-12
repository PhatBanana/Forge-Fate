import type { SightGrant } from '../types';
import { CLASS_OPTIONS } from '../data/classOptions';
import { featById } from '../data/feats';
import type { BuildContext } from './character';
import { feetIn } from './light';
import type { Eyes } from './light';

/**
 * What a creature can see in the dark, gathered from everything that grants it.
 *
 * ## Why this is a module and not four lines in the battle screen
 *
 * It was four lines in the battle screen, and they read the range out of a
 * trait's **display name**:
 *
 * ```ts
 * traits.filter((t) => t.tags?.includes('darkvision'))
 *       .reduce((most, t) => Math.max(most, feetIn(t.name) || feetIn(t.text)), 0)
 * ```
 *
 * §61's review flagged that as the same defect the damage model had when it
 * matched the string "Action Surge": a UI string load-bearing for a rule.
 * Reword a species trait and that species goes blind in the dark, with no
 * type error and no failing test. §61 could only afford a tripwire; this is
 * the fix it named.
 *
 * Worse than fragile, it was **incomplete**. A dwarf's 60 feet was the only
 * darkvision the app had ever known about. Not the Twilight Cleric's 300, not
 * the Shadow Sorcerer's 120, not Goggles of Night, and - the one that changes
 * how a fight is played - not the Warlock's Devil's Sight, which is the whole
 * reason a Warlock casts Darkness on themselves.
 *
 * ## The shape
 *
 * Every record that can grant a sense carries the same `SightGrant`: species
 * traits, class and subclass features, invocations, feats and worn items.
 * This collects them and resolves the best answer. A new source is a line of
 * data - which is the lesson §61 kept relearning, applied before the fact
 * this time rather than after.
 *
 * Feats carry the field and no SRD feat uses it, which is deliberate: the
 * rule magical darkness is written around is "unless something says
 * otherwise", and when something does say otherwise it should be data.
 */

/** Everything on a character that could be carrying a sense grant. */
export function sightGrantsFor(ctx: BuildContext): SightGrant[] {
  const out: SightGrant[] = [];

  // Species traits. `feet` is the structured range; the tag says which sense.
  for (const trait of ctx.race.traits) {
    if (!trait.feet) continue;
    if (trait.tags?.includes('darkvision')) out.push({ darkvision: trait.feet });
  }

  // Class and subclass features already filtered to the levels reached.
  for (const feature of ctx.features) {
    if (feature.sight) out.push(feature.sight);
  }

  // Invocations, maneuvers, fighting styles - whatever was actually taken.
  for (const id of ctx.build.classOptionIds ?? []) {
    const option = CLASS_OPTIONS.find((o) => o.id === id);
    if (option?.sight) out.push(option.sight);
  }

  for (const id of ctx.featIds) {
    const feat = featById(id, ctx.build.ruleset);
    if (feat?.sight) out.push(feat.sight);
  }

  // Worn items, already filtered to the ones actually working - attuned,
  // within slots, and not switched off by armor.
  out.push(...ctx.itemEffects.sight);

  return out;
}

/**
 * The best of a set of grants, as one answer.
 *
 * Ordinary darkvision is the only one with any subtlety, and it is the
 * `extendsBy` rule: "60 feet, or 60 feet further if you already have it".
 * Goggles of Night and the Gloom Stalker's Umbral Sight both say exactly
 * that, so the resolution is
 *
 * 1. take the best *plain* grant, then
 * 2. for each extending grant, either add its bonus to that or - if there was
 *    no plain grant at all - take its own flat number.
 *
 * Two extending grants do not compound: each is written "if you already have
 * darkvision from another source", and reading that as "from each other" is a
 * table ruling rather than a rule. The better single application wins.
 */
export function resolveSight(grants: SightGrant[]): Omit<Eyes, 'at'> {
  const plain = grants
    .filter((g) => !g.extendsBy)
    .reduce((best, g) => Math.max(best, g.darkvision ?? 0), 0);

  let darkvision = plain;
  for (const grant of grants) {
    if (!grant.extendsBy) continue;
    darkvision = Math.max(darkvision, plain > 0 ? plain + grant.extendsBy : (grant.darkvision ?? 0));
  }

  const magical = grants.reduce((best, g) => Math.max(best, g.magical ?? 0), 0);
  const blindsight = grants.reduce((best, g) => Math.max(best, g.blindsight ?? 0), 0);

  return {
    ...(darkvision ? { darkvision } : {}),
    ...(magical ? { magicalSight: magical } : {}),
    ...(blindsight ? { blindsight } : {}),
  };
}

/** What this character's eyes are worth, before they are put on the map. */
export function sensesFor(ctx: BuildContext): Omit<Eyes, 'at'> {
  return resolveSight(sightGrantsFor(ctx));
}

/**
 * The same question for a monster, whose senses are prose and stay prose.
 *
 * A stat block is upstream data this project does not author, and the SRD
 * states a range inside a sentence: `{ darkvision: '60 ft.' }`. Reading it is
 * therefore right here and wrong for a character, where the app owns the
 * record and can simply write the number down.
 *
 * Truesight and blindsight collapse to one number because they differ in what
 * *else* they see through, and this module is about light. Devil's sight has
 * no structured home on a stat block, so a monster that has it is the DM's to
 * rule on - stated here rather than silently absent.
 */
export function sensesForMonster(senses: Record<string, unknown> | undefined): Omit<Eyes, 'at'> {
  const feet = (key: string): number => {
    const value = senses?.[key];
    if (typeof value === 'number') return value;
    return typeof value === 'string' ? feetIn(value) : 0;
  };
  const blindsight = Math.max(feet('blindsight'), feet('truesight'));
  const darkvision = feet('darkvision');
  return {
    ...(darkvision ? { darkvision } : {}),
    ...(blindsight ? { blindsight } : {}),
  };
}
