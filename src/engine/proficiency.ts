import type { Ability, Build, Race, SkillGrant } from '../types';
import { SKILLS, SKILLS_BY_ID } from '../data/skills';
import type { SkillId } from '../data/skills';
import { CLASSES_BY_ID, skillChoicesFor } from '../data/classes';
import { RACES_BY_ID } from '../data/races';
import { BACKGROUNDS_BY_ID } from '../data/backgrounds';
import { featById } from '../data/feats';
import { ARMOR_BY_ID } from '../data/armor';
import type { ClassSlice } from './character';
import { featureCount, featureWithTag, hasFeatureTag } from './features';
import type { HeldFeature } from './features';

/**
 * Skill proficiencies, worked out the same way AC is: every contribution named,
 * so a number on screen can always be traced back to what produced it.
 *
 * The distinction that matters throughout is between skills you are *granted*
 * (a background's two, an Elf's Perception) and skills you *pick* (your class
 * list, a Half-Elf's two floating). Only picks are stored on the build;
 * everything else is derived, so changing your background cannot leave a stale
 * proficiency behind.
 */

export interface SkillLine {
  skill: SkillId;
  name: string;
  ability: Ability;
  modifier: number;
  proficient: boolean;
  expertise: boolean;
  /** Jack of All Trades and Remarkable Athlete: half proficiency, rounded down. */
  halfProficiency: boolean;
  /** "Soldier background", "Fighter skill picks", "Wood Elf". */
  sources: string[];
  notes: string[];
}

export interface ProficiencyResult {
  skills: SkillLine[];
  passivePerception: number;
  passiveInvestigation: number;
  /** Skills granted outright, before anything the player picked. */
  granted: Map<SkillId, string[]>;
  /** Picks this character is entitled to, and how many are still unmade. */
  skillPicks: number;
  openSkillPicks: number;
  expertisePicks: number;
  openExpertisePicks: number;
  /**
   * A skill picked that was already granted. The pick is wasted - the second
   * proficiency does nothing.
   */
  collisions: { skill: SkillId; sources: string[] }[];
  /** Picks that are not on any list this character can choose from. */
  illegalPicks: SkillId[];
  tools: string[];
  languages: { known: string[]; open: number };
  notes: string[];
}

function addSource(map: Map<SkillId, string[]>, skill: SkillId, source: string): void {
  const existing = map.get(skill);
  if (existing) existing.push(source);
  else map.set(skill, [source]);
}

/** The fixed half of a grant. The `choose` half becomes a pick instead. */
function applyFixed(map: Map<SkillId, string[]>, grant: SkillGrant | undefined, source: string): void {
  for (const skill of grant?.fixed ?? []) addSource(map, skill, source);
}

function chooseCount(grant: SkillGrant | undefined): number {
  return grant?.choose?.count ?? 0;
}

/**
 * What it takes to answer "which skills may this character pick". Kept separate
 * from the full input because the Builder asks that question while assembling a
 * change, before there is a derived context to ask it of.
 */
export interface PickContext {
  build: Build;
  race: Race;
  slices: ClassSlice[];
  featIds: Set<string>;
}

export interface ProficiencyInput extends PickContext {
  /** Class and subclass features, which declare expertise and half proficiency. */
  features: HeldFeature[];
  totalLevel: number;
  mods: Record<Ability, number>;
  proficiency: number;
  subclassIds: Set<string>;
}

/**
 * Jack of All Trades and Remarkable Athlete both give half your proficiency
 * bonus on checks you are *not* proficient in, and expertise supersedes both
 * rather than stacking. Which features do this is declared in the feature
 * table; the feature's own name is what gets shown.
 */
function halfProficiencySource(input: ProficiencyInput): string | null {
  return featureWithTag(input.features, 'half-proficiency')?.name ?? null;
}

export function computeProficiencies(input: ProficiencyInput): ProficiencyResult {
  const { build, race, slices, mods, proficiency, featIds } = input;
  const ruleset = build.ruleset;
  const notes: string[] = [];

  // --- what you are given, before anything you chose ------------------------
  const granted = new Map<SkillId, string[]>();

  const background = build.backgroundId ? BACKGROUNDS_BY_ID[build.backgroundId] : undefined;
  if (background) {
    for (const skill of background.skills) addSource(granted, skill, `${background.name} background`);
  }
  applyFixed(granted, race.skillGrants, race.name);

  // --- how many picks you control ------------------------------------------
  let skillPicks = chooseCount(race.skillGrants);

  for (const slice of slices) {
    // Your starting class grants its full list; a dip into Bard, Ranger or
    // Rogue grants one skill from a narrower set, and every other class none.
    skillPicks +=
      slice === slices[0]
        ? skillChoicesFor(slice.klass, ruleset).count
        : (slice.klass.multiclass?.skills?.count ?? 0);
  }

  let expertisePicks = featureCount(input.features, 'expertise');

  let openLanguages = 0;
  const allFeatIds = [...featIds];
  for (const id of allFeatIds) {
    const feat = featById(id, ruleset);
    const grants = feat?.grants;
    if (!grants) continue;
    if (typeof grants.skills === 'number') {
      skillPicks += grants.skills;
    } else if (Array.isArray(grants.skills)) {
      for (const skill of grants.skills) addSource(granted, skill, feat!.name);
    }
    if (grants.expertise) expertisePicks += grants.expertise;
    if (grants.languages) openLanguages += grants.languages;
  }
  if (background?.languages) openLanguages += background.languages;

  // --- the picks themselves -------------------------------------------------
  const collisions: { skill: SkillId; sources: string[] }[] = [];
  const picked = new Set<SkillId>();

  // A pick that duplicates a granted skill buys nothing, so it is set aside
  // before attribution rather than consuming a slot.
  const effective: SkillId[] = [];
  for (const skill of build.skillIds) {
    if (granted.has(skill)) {
      collisions.push({ skill, sources: [...granted.get(skill)!] });
      continue;
    }
    effective.push(skill);
  }

  const { assigned, unassignable } = attributePicks(pickSources(input), effective);
  for (const skill of effective) {
    picked.add(skill);
    addSource(granted, skill, assigned.get(skill) ?? 'Your pick');
  }

  const openSkillPicks = Math.max(0, skillPicks - picked.size);

  // --- expertise ------------------------------------------------------------
  // Expertise only applies to a skill you are actually proficient in.
  const expertise = new Set(build.expertiseIds.filter((s) => granted.has(s)));
  for (const skill of build.expertiseIds) {
    if (!granted.has(skill)) {
      notes.push(
        `Expertise in ${SKILLS_BY_ID[skill].name} does nothing until you are proficient in it.`,
      );
    }
  }
  const openExpertisePicks = Math.max(0, expertisePicks - expertise.size);

  // --- the lines ------------------------------------------------------------
  const half = halfProficiencySource(input);
  const armor = ARMOR_BY_ID[build.defenses.armorId];
  const observant = allFeatIds.some((id) => featById(id, ruleset)?.grants?.passive?.length);

  const skills: SkillLine[] = SKILLS.map((skill) => {
    const sources = granted.get(skill.id) ?? [];
    const proficient = sources.length > 0;
    const hasExpertise = expertise.has(skill.id);
    const halfApplies = !proficient && half !== null;

    let modifier = mods[skill.ability];
    if (hasExpertise) modifier += proficiency * 2;
    else if (proficient) modifier += proficiency;
    else if (halfApplies) modifier += Math.floor(proficiency / 2);

    const lineNotes: string[] = [];
    if (halfApplies) lineNotes.push(`${half}: half your proficiency bonus, rounded down.`);
    if (hasExpertise) lineNotes.push('Expertise: double proficiency bonus.');
    if (skill.id === 'stealth' && armor?.stealthDisadvantage) {
      lineNotes.push(`${armor.name} gives disadvantage on this, whatever the modifier says.`);
    }
    if (skill.id === 'perception' && observant) {
      lineNotes.push('Observant adds +5 to the passive score, not to the roll.');
    }

    return {
      skill: skill.id,
      name: skill.name,
      ability: skill.ability,
      modifier,
      proficient,
      expertise: hasExpertise,
      halfProficiency: halfApplies,
      sources: proficient ? sources : half ? [half] : [],
      notes: lineNotes,
    };
  });

  if (reliableTalent(input)) {
    notes.push(
      'Reliable Talent: any skill you are proficient in treats a d20 roll of 9 or lower as a 10.',
    );
  }

  const byId = (id: SkillId) => skills.find((s) => s.skill === id)!;
  const passiveBonus = (id: SkillId) =>
    allFeatIds.some((f) => featById(f, ruleset)?.grants?.passive?.includes(id)) ? 5 : 0;

  return {
    skills,
    passivePerception: 10 + byId('perception').modifier + passiveBonus('perception'),
    passiveInvestigation: 10 + byId('investigation').modifier + passiveBonus('investigation'),
    granted,
    skillPicks,
    openSkillPicks,
    expertisePicks,
    openExpertisePicks,
    collisions,
    illegalPicks: unassignable,
    tools: toolGrants(input),
    languages: { known: build.languages, open: Math.max(0, openLanguages - build.languages.length) },
    notes,
  };
}

/** Rogue 11: never roll below a 10 on anything you are proficient in. */
function reliableTalent(input: ProficiencyInput): boolean {
  return hasFeatureTag(input.features, 'reliable-talent');
}

/**
 * Where a pick can come from. A class list is restricted to that list; a
 * Variant Human's free proficiency is not restricted at all.
 *
 * Sources are kept separate rather than unioned because the counts matter. A
 * Variant Human Wizard has one unrestricted pick and two from the Wizard list -
 * so they can hold exactly one off-list skill, not three.
 */
export interface PickSource {
  label: string;
  count: number;
  /** null means any skill. */
  from: Set<SkillId> | null;
}

export function pickSources(input: PickContext): PickSource[] {
  const sources: PickSource[] = [];
  const { build, race, slices } = input;

  const raceChoice = race.skillGrants?.choose;
  if (raceChoice) {
    sources.push({
      label: race.name,
      count: raceChoice.count,
      from: raceChoice.from ? new Set(raceChoice.from) : null,
    });
  }
  if (slices[0]) {
    const choice = skillChoicesFor(slices[0].klass, build.ruleset);
    sources.push({
      label: `${slices[0].klass.name} skill list`,
      count: choice.count,
      from: new Set(choice.from),
    });
  }
  // A multiclass dip grants far less than starting in the class - only Bard,
  // Ranger and Rogue give a skill at all, and only one. The other ten give
  // none, which is why `multiclass.skills` is absent on them.
  for (const slice of slices.slice(1)) {
    const dip = slice.klass.multiclass?.skills;
    if (!dip) continue;
    sources.push({
      label: `${slice.klass.name} multiclass`,
      count: dip.count,
      from: new Set(dip.from),
    });
  }
  for (const id of input.featIds) {
    const feat = featById(id, build.ruleset);
    const skills = feat?.grants?.skills;
    if (typeof skills === 'number') {
      sources.push({ label: feat!.name, count: skills, from: null });
    }
  }
  return sources;
}

/**
 * Assign each pick to a source that can supply it, most-constrained first so a
 * restricted list is not starved by an unrestricted one. Anything left over is
 * a pick this character is not entitled to.
 */
export function attributePicks(
  sources: PickSource[],
  picks: SkillId[],
): { assigned: Map<SkillId, string>; unassignable: SkillId[] } {
  const remaining = sources.map((s) => ({ ...s }));
  const assigned = new Map<SkillId, string>();
  const unassignable: SkillId[] = [];

  const optionsFor = (skill: SkillId) =>
    remaining.filter((s) => s.count > 0 && (s.from === null || s.from.has(skill)));

  // Fewest options first: a pick only one source can cover must claim it before
  // a pick that anything could have covered takes the slot.
  const ordered = [...picks].sort((a, b) => optionsFor(a).length - optionsFor(b).length);

  for (const skill of ordered) {
    const options = optionsFor(skill);
    if (!options.length) {
      unassignable.push(skill);
      continue;
    }
    // Prefer the most restrictive source, keeping flexible ones in reserve.
    options.sort((a, b) => (a.from?.size ?? Infinity) - (b.from?.size ?? Infinity));
    options[0].count -= 1;
    assigned.set(skill, options[0].label);
  }

  return { assigned, unassignable };
}

/**
 * The skills this character could still add. Computed by asking, for each
 * skill, whether the whole set of picks would still attribute if it were added
 * - which is the only way to get the arithmetic right when a lineage's single
 * free proficiency is competing with a class list.
 */
export function legalPicks(input: PickContext): Set<SkillId> {
  const sources = pickSources(input);
  const current = input.build.skillIds;
  const allowed = new Set<SkillId>();

  for (const skill of SKILLS) {
    if (current.includes(skill.id)) {
      allowed.add(skill.id);
      continue;
    }
    const { unassignable } = attributePicks(sources, [...current, skill.id]);
    if (!unassignable.length) allowed.add(skill.id);
  }
  return allowed;
}

/** Tools are tracked and displayed, not scored. */
function toolGrants(input: ProficiencyInput): string[] {
  const tools: string[] = [];
  const background = input.build.backgroundId
    ? BACKGROUNDS_BY_ID[input.build.backgroundId]
    : undefined;
  if (background) tools.push(...background.tools);
  tools.push(...input.build.toolIds);
  // A dip into Rogue brings thieves' tools with it, which is the one tool the
  // multiclassing table grants outright.
  for (const slice of input.slices.slice(1)) {
    tools.push(...(slice.klass.multiclass?.tools ?? []));
  }
  return [...new Set(tools)];
}

/**
 * `reconcileSkillPicks` runs before a build is committed, so it cannot use a
 * derived context - deriving one would compute proficiencies from the very
 * picks it is about to prune. It rebuilds only the parts `legalPicks` reads.
 */
function buildInput(build: Build): PickContext {
  return {
    build,
    race: RACES_BY_ID[build.raceId],
    slices: build.classes.map((entry) => ({
      entry,
      klass: CLASSES_BY_ID[entry.classId],
      subclass: CLASSES_BY_ID[entry.classId].subclasses.find((s) => s.id === entry.subclassId),
    })),
    featIds: new Set([...build.featIds, ...build.originFeatIds]),
  };
}

/**
 * Drop skill picks a change has made illegal, and say which. Changing class or
 * background narrows what you are allowed to have chosen, and silently keeping
 * a pick that is no longer on any list would be a lie about the character.
 */
export function reconcileSkillPicks(build: Build): { build: Build; changes: string[] } {
  const ctx = buildInput(build);
  const granted = new Map<SkillId, string[]>();

  const background = build.backgroundId ? BACKGROUNDS_BY_ID[build.backgroundId] : undefined;
  for (const skill of background?.skills ?? []) {
    addSource(granted, skill, `${background!.name} background`);
  }
  applyFixed(granted, ctx.race.skillGrants, ctx.race.name);

  const changes: string[] = [];

  // A pick the new origin now grants outright is freed up rather than dropped.
  const surviving: SkillId[] = [];
  for (const skill of build.skillIds) {
    if (granted.has(skill)) {
      changes.push(
        `${SKILLS_BY_ID[skill].name} is now granted by your ${granted.get(skill)![0]}, so the pick was freed up.`,
      );
      continue;
    }
    surviving.push(skill);
  }

  // Ask whether what is left can still be paid for by this character's pick
  // sources. This is attribution, not membership: a Variant Human Wizard can
  // hold one off-list skill, not three.
  const { unassignable } = attributePicks(pickSources(ctx), surviving);
  const dropped = new Set(unassignable);
  const kept = surviving.filter((skill) => {
    if (!dropped.has(skill)) return true;
    changes.push(
      `${SKILLS_BY_ID[skill].name} is not on this character's list any more, so it was dropped.`,
    );
    return false;
  });

  const stillProficient = new Set([...kept, ...granted.keys()]);
  const expertise = build.expertiseIds.filter((skill) => {
    if (stillProficient.has(skill)) return true;
    changes.push(`Expertise in ${SKILLS_BY_ID[skill].name} was dropped along with the proficiency.`);
    return false;
  });

  if (!changes.length) return { build, changes };
  return { build: { ...build, skillIds: kept, expertiseIds: expertise }, changes };
}
