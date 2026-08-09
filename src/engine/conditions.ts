import type { Ability, CharClass, Condition, Feat } from '../types';
import type { BuildContext } from './character';
import { armorProficiencies, weaponProficiencies } from './defense';
import { WEAPONS_BY_ID } from '../data/weapons';
import { hasFeatureTag } from './features';

/** Evaluate a declarative scoring condition against a derived build. */
export function matches(condition: Condition, ctx: BuildContext): boolean {
  switch (condition.kind) {
    case 'class':
      return ctx.slices.some((s) => condition.ids.includes(s.klass.id));
    case 'subclass':
      return condition.ids.some((id) => ctx.subclassIds.has(id));
    case 'race':
      return condition.ids.includes(ctx.race.id);
    case 'weaponStyle':
      return condition.styles.includes(ctx.weaponStyle);
    case 'loadout':
      return condition.loadouts.includes(ctx.loadout);
    case 'armorCategory':
      return condition.categories.includes(ctx.ac.category);
    case 'usingShield':
      return ctx.build.defenses.shield;
    case 'casting':
      if (condition.types.includes('none')) {
        return ctx.castingTypes.length === 0 || ctx.castingTypes.some((t) => condition.types.includes(t));
      }
      return ctx.castingTypes.some((t) => condition.types.includes(t));
    case 'ability': {
      const value = ctx.scores[condition.ability];
      if (condition.min !== undefined && value < condition.min) return false;
      if (condition.max !== undefined && value > condition.max) return false;
      return true;
    }
    case 'level': {
      const value = ctx.totalLevel;
      if (condition.min !== undefined && value < condition.min) return false;
      if (condition.max !== undefined && value > condition.max) return false;
      return true;
    }
    case 'extraAttack':
      return ctx.hasExtraAttack;
    case 'hasFeat':
      return condition.ids.some((id) => ctx.featIds.has(id));
    case 'concentrates':
      return ctx.concentrates;
    case 'all':
      return condition.of.every((c) => matches(c, ctx));
    case 'any':
      return condition.of.some((c) => matches(c, ctx));
    case 'not':
      return !matches(condition.of, ctx);
    default:
      return false;
  }
}

export interface PrereqResult {
  ok: boolean;
  /** Human-readable reasons the build does not qualify. */
  problems: string[];
}

const ABILITY_LABEL: Record<string, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

/**
 * Ritual Caster reads "INT or WIS 13" and Skulker reads "DEX 13"; the data
 * models both as an ability list, so a single satisfied entry is enough.
 */
export function checkPrereq(feat: Feat, ctx: BuildContext, atLevel?: number): PrereqResult {
  const problems: string[] = [];
  const prereq = feat.prereq;
  if (!prereq) return { ok: true, problems };

  // The planner asks "could I take this at level 12?", so level prerequisites
  // are measured against the level the slot is reached at, not today's.
  const level = atLevel ?? ctx.totalLevel;

  if (prereq.abilities?.length) {
    const met = prereq.abilities.some((req) => ctx.scores[req.ability] >= req.min);
    if (!met) {
      const text = prereq.abilities
        .map((req) => `${ABILITY_LABEL[req.ability]} ${req.min}`)
        .join(' or ');
      problems.push(`Requires ${text}`);
    }
  }

  if (prereq.races?.length) {
    const lineage = ctx.race.parent ?? ctx.race.name;
    const ok = prereq.races.includes(ctx.race.id) || prereq.races.includes(lineage);
    if (!ok) problems.push(`Requires ${prereq.races.filter((r) => !r.includes('-')).join(', ') || 'a specific lineage'}`);
  }

  if (prereq.minLevel && level < prereq.minLevel) {
    problems.push(`Requires character level ${prereq.minLevel}; this character is level ${level}.`);
  }

  if (prereq.spellcasting && ctx.castingTypes.length === 0) {
    problems.push('Requires the ability to cast at least one spell');
  }

  if (prereq.note) {
    const note = prereq.note.toLowerCase();
    const proficiencies = armorProficiencies(ctx.slices, ctx.race, ctx.featIds, ctx.build.ruleset);
    let covered: boolean | null = null;

    if (note.includes('fighting style')) {
      // 2024 turns fighting styles into feats, but only a class feature hands
      // out the slot to spend one on.
      covered = hasFeatureTag(ctx.features, 'fighting-style');
    } else if (note.includes('heavy armor')) covered = proficiencies.has('heavy');
    else if (note.includes('medium armor')) covered = proficiencies.has('medium');
    else if (note.includes('light armor')) covered = proficiencies.has('light');
    else if (note.includes('martial weapon')) {
      const weapons = weaponProficiencies(ctx.slices, ctx.race, ctx.build.ruleset);
      // The category covers a Fighter; the specific list covers an Elf, whose
      // Weapon Training names four martial weapons without the category.
      covered =
        weapons.categories.has('martial') ||
        [...weapons.specific].some((id) => WEAPONS_BY_ID[id]?.category === 'martial');
    }
    if (covered === false) problems.push(prereq.note);
  }

  return { ok: problems.length === 0, problems };
}

/**
 * Whether this build is legal to have taken, as a multiclass.
 *
 * "To qualify for a new class, you must meet the ability score prerequisites
 * for both your current class and the new one." Both halves matter and both
 * are checked: a Wizard 5 with Strength 8 cannot take a Fighter level, and a
 * Fighter 5 with Intelligence 8 cannot take a Wizard one.
 *
 * ## Why it flags rather than forbids
 *
 * The Builder is a planning tool, and half the reason to open it is to find
 * out *whether* a build works before committing to it. Refusing the class
 * outright would answer that question by hiding it. So this reports, the
 * build review carries it as a finding, and the character is still built -
 * which is also the only behaviour that can be right for a table using the
 * optional rule that waives prerequisites, and for a build imported from
 * somewhere that did.
 *
 * A single-class character is never checked, because the prerequisites are a
 * multiclassing rule and nothing else. That is the SRD's own scoping, and
 * without it every 1st-level Wizard with Intelligence 12 would be scolded.
 */
export function checkMulticlass(
  slices: { klass: CharClass }[],
  scores: Record<Ability, number>,
): PrereqResult {
  const problems: string[] = [];
  if (slices.length < 2) return { ok: true, problems };

  for (const { klass } of slices) {
    const prereq = klass.multiclassPrereq;
    // No entry means the multiclassing table never covered this class - the
    // Artificer, here - and a missing row is not a failed one.
    if (!prereq) continue;
    const met =
      prereq.mode === 'any'
        ? prereq.abilities.some((req) => scores[req.ability] >= req.min)
        : prereq.abilities.every((req) => scores[req.ability] >= req.min);
    if (met) continue;
    const text = prereq.abilities
      .map((req) => `${ABILITY_LABEL[req.ability]} ${req.min}`)
      .join(prereq.mode === 'any' ? ' or ' : ' and ');
    problems.push(
      `Multiclassing into ${klass.name} needs ${text}; this build has ${prereq.abilities
        .map((req) => `${ABILITY_LABEL[req.ability]} ${scores[req.ability]}`)
        .join(', ')}.`,
    );
  }

  return { ok: problems.length === 0, problems };
}
