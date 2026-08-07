import { ABILITIES, emptyDetails } from '../types';
import type {
  Ability,
  AbilityScores,
  Build,
  Ruleset,
  CastingType,
  CharClass,
  ClassEntry,
  Loadout,
  Race,
  Subclass,
  WeaponStyle,
} from '../types';
import { CLASSES_BY_ID } from '../data/classes';
import { featById } from '../data/feats';
import { RACES_BY_ID, racesFor } from '../data/races';
import { BACKGROUNDS_BY_ID } from '../data/backgrounds';
import { armorProficiencies, bestArmorFor, computeAc, computeHp, computeSpeed, defaultDefenses, weaponProficiencies } from './defense';
import type { AcResult, HpResult, SpeedResult } from './defense';
import { featuresFor, hasFeatureTag } from './features';
import type { HeldFeature } from './features';
import { computeAttacks, deriveLoadout, weaponForProfile } from './attacks';
import type { Attack, Loadouts } from './attacks';
import { computeDpr } from './dpr';
import { computeHealing } from './healing';
import { computeSpellcasting } from './spellcasting';
import type { SpellcastingResult } from './spellcasting';
import type { DprResult } from './dpr';
import type { HealingResult } from './healing';
import { applySetAbilities, attunementLimit, resolveItems } from './items';
import { computeInventory, emptyCoins } from './inventory';
import type { InventoryResult } from './inventory';
import type { ItemEffects, ResolvedItem } from './items';
import { ARMOR_BY_ID } from '../data/armor';
import { computeProficiencies } from './proficiency';
import type { ProficiencyResult } from './proficiency';

export interface ClassSlice {
  entry: ClassEntry;
  klass: CharClass;
  subclass?: Subclass;
}

/**
 * Everything the optimizer needs to reason about a build, derived once and
 * passed to the scoring rules.
 */
export interface BuildContext {
  build: Build;
  race: Race;
  slices: ClassSlice[];
  primary: ClassSlice;
  totalLevel: number;
  /** Racial + feat + ASI contributions applied on top of base scores. */
  scores: AbilityScores;
  mods: Record<Ability, number>;
  proficiency: number;
  abilityPriority: Record<Ability, number>;
  /** The one ability this character attacks or casts with. */
  keyAbility: Ability;
  castingTypes: CastingType[];
  concentrates: boolean;
  hasExtraAttack: boolean;
  featIds: Set<string>;
  subclassIds: Set<string>;
  /** What this character is holding, and the style and loadout it implies. */
  loadouts: Loadouts;
  /** Shorthand for `loadouts.style`, which the feat conditions read. */
  weaponStyle: WeaponStyle;
  loadout: Loadout;
  /** What you roll to hit and for damage, per weapon in hand. */
  attacks: Attack[];
  /** Expected damage per round, across the plausible range of target ACs. */
  dpr: DprResult;
  /** What this character can restore, for the classes built to do it. */
  healing: HealingResult;
  /** Slots, spells known or prepared, and what this character can draw from. */
  spellcasting: SpellcastingResult;
  ac: AcResult;
  /** Walking speed with its breakdown: race, armor, items, feats, class features. */
  speed: SpeedResult;
  hp: HpResult;
  proficiencies: ProficiencyResult;
  /** Every class and subclass feature this character has reached. */
  features: HeldFeature[];
  /** Magic items carried, which are active, and what they add up to. */
  items: ResolvedItem[];
  itemEffects: ItemEffects;
  attunedCount: number;
  attunementSlots: number;
  /** What is carried, what it weighs, and what this character can lift. */
  inventory: InventoryResult;
  spellSaveDc: number | null;
  spellAttack: number | null;
  /** ASI/feat slots unlocked so far, and how many are still unspent. */
  asiSlotsReached: number;
  asiSlotsSpent: number;
  /** How many free origin feats this character is entitled to. */
  originFeatSlots: number;
}

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function proficiencyBonus(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

export function totalLevel(build: Build): number {
  return build.classes.reduce((sum, c) => sum + c.level, 0);
}

/**
 * Ability increases from a character's origin. This is the one place the two
 * rulesets genuinely diverge: in 2014 they come from your species, in 2024 from
 * your background.
 */
export function originAsi(build: Build, race: Race): Partial<Record<Ability, number>> {
  const out: Partial<Record<Ability, number>> = {};
  const add = (ability: Ability | undefined, amount: number) => {
    if (!ability) return;
    out[ability] = (out[ability] ?? 0) + amount;
  };

  if (build.ruleset === '2024') {
    const background = build.backgroundId ? BACKGROUNDS_BY_ID[build.backgroundId] : undefined;
    const abilities = background?.abilities ?? [];
    if (build.backgroundAsi.mode === '1+1+1') {
      // +1 to all three of the background's abilities; nothing to choose.
      for (const ability of abilities) add(ability, 1);
    } else {
      // +2 and +1 across two of the three, in the order the player picked.
      add(build.backgroundAsi.picks[0], 2);
      add(build.backgroundAsi.picks[1], 1);
    }
    return out;
  }

  if (build.customOrigin) {
    // Tasha's custom origin: move the lineage's increases anywhere you like.
    add(build.flexibleAsiPicks[0], 2);
    add(build.flexibleAsiPicks[1], 1);
    return out;
  }

  for (const [ability, amount] of Object.entries(race.asi)) {
    add(ability as Ability, amount);
  }
  if (race.flexibleAsi) {
    race.flexibleAsi.amounts.forEach((amount, i) => add(build.flexibleAsiPicks[i], amount));
  }
  return out;
}

/** Backwards-compatible alias; origin increases were species-only in 2014. */
export const racialAsi = originAsi;

/** How many ASI/feat slots the build has unlocked at its current levels. */
export function asiSlotsReached(build: Build): number {
  let count = 0;
  for (const entry of build.classes) {
    const klass = CLASSES_BY_ID[entry.classId];
    if (!klass) continue;
    count += klass.asiLevels.filter((l) => l <= entry.level).length;
  }
  return count;
}

/** Free feats from a character's origin, which never consume an ASI slot. */
export function originFeatSlots(build: Build, race: Race): number {
  let count = race.bonusFeat ? 1 : 0;
  if (build.ruleset === '2024') {
    const background = build.backgroundId ? BACKGROUNDS_BY_ID[build.backgroundId] : undefined;
    if (background?.originFeatId) count += 1;
  }
  return count;
}

/** Upcoming ASI slots, ordered by the class level they arrive at. */
export interface FutureSlot {
  classId: string;
  className: string;
  classLevel: number;
  /** Character level assuming you level only this class from here. */
  estimatedCharacterLevel: number;
}

export function futureAsiSlots(build: Build, maxCharacterLevel = 20): FutureSlot[] {
  const current = totalLevel(build);
  const slots: FutureSlot[] = [];
  for (const entry of build.classes) {
    const klass = CLASSES_BY_ID[entry.classId];
    if (!klass) continue;
    for (const classLevel of klass.asiLevels) {
      if (classLevel <= entry.level) continue;
      const estimated = current + (classLevel - entry.level);
      if (estimated > maxCharacterLevel) continue;
      slots.push({
        classId: klass.id,
        className: klass.name,
        classLevel,
        estimatedCharacterLevel: estimated,
      });
    }
  }
  return slots.sort((a, b) => a.estimatedCharacterLevel - b.estimatedCharacterLevel);
}

function mergeAbilityPriority(
  slices: ClassSlice[],
  weaponStyle: WeaponStyle,
): Record<Ability, number> {
  const out: Record<Ability, number> = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
  for (const slice of slices) {
    for (const ability of ABILITIES) {
      const base = slice.klass.abilityPriority[ability];
      const override = slice.subclass?.abilityPriority?.[ability];
      out[ability] = Math.max(out[ability], override ?? base);
    }
  }

  // Several classes work off either Strength or Dexterity, and the class table
  // cannot know which one this character picked. A Dexterity-based Fighter has
  // no use for Strength at all, so let the declared weapon style decide.
  const martial = out.str >= 2 || out.dex >= 2;
  if (!martial) return out;

  switch (weaponStyle) {
    case 'str-melee':
      out.str = Math.max(out.str, 3);
      out.dex = Math.min(out.dex, 2);
      break;
    case 'dex-melee':
    case 'dex-ranged':
    case 'unarmed':
      out.dex = Math.max(out.dex, 3);
      out.str = Math.min(out.str, 0);
      break;
    case 'spell':
      // Dexterity still carries AC, initiative and the most common save, so it
      // keeps whatever the class or subclass assigned it.
      out.str = Math.min(out.str, 1);
      break;
  }
  return out;
}

export function deriveBuild(build: Build): BuildContext {
  const race = RACES_BY_ID[build.raceId] ?? RACES_BY_ID['human'];
  const slices: ClassSlice[] = build.classes.flatMap((entry) => {
    const klass = CLASSES_BY_ID[entry.classId];
    if (!klass) return [];
    return [{ entry, klass, subclass: klass.subclasses.find((s) => s.id === entry.subclassId) }];
  });

  const primary =
    slices.slice().sort((a, b) => b.entry.level - a.entry.level)[0] ??
    ({ entry: { classId: 'fighter', level: 1 }, klass: CLASSES_BY_ID.fighter } as ClassSlice);

  const level = Math.max(1, totalLevel(build));
  // Origin feats count for scoring and prerequisites but were never bought with
  // an ability score improvement, so they stay out of the slot accounting.
  const featIds = new Set([...build.featIds, ...build.originFeatIds]);

  // Scores: base + racial + half-feat +1s + spent ASIs, capped at 20.
  const scores: AbilityScores = { ...build.baseScores };
  const racial = originAsi(build, race);
  for (const ability of ABILITIES) scores[ability] += racial[ability] ?? 0;

  for (const featId of [...build.featIds, ...build.originFeatIds]) {
    const feat = featById(featId, build.ruleset);
    if (!feat?.asi) continue;
    const chosen = build.featAsiChoices[featId] ?? feat.asi.abilities[0];
    scores[chosen] += feat.asi.amount;
  }
  for (const pick of build.asiPicks) {
    for (const ability of pick) scores[ability] += 1;
  }
  for (const ability of ABILITIES) scores[ability] = Math.min(20, scores[ability]);

  // Magic items resolve before the modifiers do, because an item that sets a
  // score - a Headband of Intellect, an Amulet of Health - changes every number
  // downstream of it, including hit points at every level.
  const artificerLevel = slices
    .filter((sl) => sl.klass.id === 'artificer')
    .reduce((n, sl) => n + sl.entry.level, 0);
  const items = resolveItems(build, {
    wearingArmor: (ARMOR_BY_ID[build.defenses.armorId]?.category ?? 'none') !== 'none',
    usingShield: build.defenses.shield,
    attunementSlots: attunementLimit(artificerLevel),
  });
  const withItems = applySetAbilities(scores, items.effects);
  for (const ability of ABILITIES) scores[ability] = withItems[ability];

  const mods = Object.fromEntries(
    ABILITIES.map((a) => [a, abilityMod(scores[a])]),
  ) as Record<Ability, number>;

  const castingTypes = slices
    .map((s) => s.subclass?.castingType ?? s.klass.castingType)
    .filter((t) => t !== 'none');

  const proficiency = proficiencyBonus(level);

  const casterSlice =
    slices.find((s) => (s.subclass?.castingType ?? s.klass.castingType) !== 'none') ?? null;
  const castingAbility = casterSlice?.subclass?.castingAbility ?? casterSlice?.klass.castingAbility;

  // The stat that drives attack rolls and save DCs. For a weapon build that is
  // whatever the weapon style uses; for a caster it is the casting ability.
  const subclassIds = new Set(slices.map((s) => s.subclass?.id).filter(Boolean) as string[]);
  const features = featuresFor(slices, build.ruleset);
  const spellcasting = computeSpellcasting({ build, slices, mods, proficiency, subclassIds });

  // The attack style and loadout the feat rules read come from what this
  // character is holding, rather than from two fields they filled in.
  const loadouts = deriveLoadout({
    build,
    mods,
    features,
    isCaster: castingTypes.length > 0,
    isMonk: slices.some((sl) => sl.klass.id === 'monk'),
  });

  const attacks = computeAttacks({
    build,
    loadouts,
    mods,
    proficiency,
    featIds,
    proficiencies: weaponProficiencies(slices, race, build.ruleset),
    itemWeaponBonus: items.effects.weaponBonus,
    itemAmmunitionBonus: items.effects.ammunitionBonus,
    isMonk: slices.some((sl) => sl.klass.id === 'monk'),
    hasExtraAttack: hasFeatureTag(features, 'extra-attack'),
    // Spellcasting is derived above this, so the ability Shillelagh swaps in is
    // already in hand.
    shillelagh:
      build.spellIds.includes('shillelagh') && spellcasting.ability
        ? { ability: spellcasting.ability }
        : undefined,
  });

  const weaponAbility: Ability = loadouts.style === 'str-melee' ? 'str' : 'dex';
  const keyAbility: Ability =
    loadouts.style === 'spell' ? (castingAbility ?? 'cha') : weaponAbility;

  // Speed reads the armor category and penalty, so AC resolves first.
  const ac = computeAc(build, slices, race, mods, scores, featIds, items.effects.ac, {
    noStealthDisadvantage: items.effects.noStealthDisadvantage,
    noStrengthRequirement: items.effects.noStrengthRequirement,
  });



  return {
    build,
    race,
    slices,
    primary,
    totalLevel: level,
    scores,
    mods,
    proficiency,
    abilityPriority: mergeAbilityPriority(slices, loadouts.style),
    keyAbility,
    castingTypes,
    concentrates: castingTypes.length > 0,
    // Which classes and subclasses grant Extra Attack, and at what level, is
    // declared in the feature table rather than listed here.
    hasExtraAttack: hasFeatureTag(features, 'extra-attack'),
    features,
    featIds,
    subclassIds,
    loadouts,
    weaponStyle: loadouts.style,
    loadout: loadouts.loadout,
    attacks,
    spellcasting,
    healing: computeHealing({
      // Everything they can cast, granted spells included - a Life Cleric's
      // Cure Wounds is free and is exactly the spell this panel is about.
      spells: spellcasting.castable,
      slices,
      subclassIds,
      castingMod: spellcasting.ability ? mods[spellcasting.ability] : null,
      slotsByLevel: spellcasting.bySpellLevel,
    }),
    dpr: computeDpr({
      build,
      attacks,
      features,
      slices,
      mods,
      totalLevel: level,
      proficiency,
      featIds,
      subclassIds,
      itemRiders: items.effects.damageRiders,
      itemExtraBonusAttack: items.effects.extraBonusAttack,
      advantage: build.combatAssumptions.advantage,
      concentrating: build.combatAssumptions.concentrating,
      targets: build.combatAssumptions.targets,
      spells: spellcasting.castable,
      spellSaveDc: spellcasting.saveDc,
      spellAttack: spellcasting.attackBonus,
      castingSources: spellcasting.sources,
      highestSlot: spellcasting.highestLevel,
    }),
    ac,
    speed: computeSpeed(build, slices, race, featIds, ac, items.effects.speed),
    hp: computeHp(build, slices, race, mods, featIds, level),
    proficiencies: computeProficiencies({
      build,
      race,
      slices,
      features,
      totalLevel: level,
      mods,
      proficiency,
      featIds,
      subclassIds,
    }),
    items: items.resolved,
    itemEffects: items.effects,
    attunedCount: items.attunedCount,
    attunementSlots: attunementLimit(artificerLevel),
    // After the item effects, so a Belt of Giant Strength raises what you can
    // carry as well as what you can hit with.
    inventory: computeInventory(build, scores.str),
    spellSaveDc: castingAbility
      ? 8 + proficiency + mods[castingAbility] + items.effects.spellBonus
      : null,
    spellAttack: castingAbility ? proficiency + mods[castingAbility] : null,
    asiSlotsReached: asiSlotsReached(build),
    asiSlotsSpent: build.featIds.length + build.asiPicks.length,
    // Variant Human, Custom Lineage, a 2024 background and the 2024 Human's
    // Versatile trait all hand out feats that cost no slot.
    originFeatSlots: originFeatSlots(build, race),
  };
}

/**
 * Put a character in the best armor their proficiencies allow. Used when a
 * build appears from somewhere that does not describe equipment - an import, or
 * loading a pairing out of the race/class matrix.
 */
export function equipBestArmor(build: Build): Build {
  const ctx = deriveBuild(build);
  const armorId = bestArmorFor(
    armorProficiencies(ctx.slices, ctx.race, ctx.featIds, build.ruleset),
    ctx.mods,
    ctx.scores,
    ctx.ac.total - ctx.mods.dex,
  );
  return { ...build, defenses: { ...build.defenses, armorId } };
}

/**
 * A weapons group standing in for an old hand-set combat profile. Used by the
 * migration and by tests that want to say "a two-handed Strength build" without
 * naming a weapon.
 */
export function weaponsForProfile(style: WeaponStyle, loadout: Loadout): Build['weapons'] {
  return { ...weaponForProfile(style, loadout), magicBonus: {} };
}

const PLAIN_HUMAN: Record<Ruleset, string> = { '2014': 'human', '2024': 'human-2024' };

/**
 * A character with nothing decided yet.
 *
 * `emptyBuild` is not that - it is a fully equipped Battle Master 5, which
 * makes a fine demonstration and a poor blank page. Someone who came here to
 * enter the character they already have does not want to delete a stranger's
 * choices first, so "start from scratch" and the New character button hand
 * over this instead: level 1, every score at 8 with the whole point-buy budget
 * unspent, nothing worn and nothing held.
 */
export function blankBuild(ruleset: Ruleset = '2014'): Build {
  return {
    ...emptyBuild(),
    name: '',
    ruleset,
    // Whichever list you are on, a plain Human is the least opinionated
    // starting point: no subrace to pick, no trait that steers a class.
    raceId: racesFor(ruleset).some((r) => r.id === PLAIN_HUMAN[ruleset])
      ? PLAIN_HUMAN[ruleset]
      : racesFor(ruleset)[0].id,
    // Something has to be selected, and Fighter asks the fewest further
    // questions of someone who has not chosen yet.
    classes: [{ classId: 'fighter', level: 1 }],
    baseScores: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },
    flexibleAsiPicks: [],
    weapons: { magicBonus: {} },
    defenses: defaultDefenses(),
    items: [],
    skillIds: [],
    expertiseIds: [],
    classOptionIds: [],
    masteryIds: [],
    spellIds: [],
    preparedIds: [],
    toolIds: [],
    languages: [],
    gear: [],
    coins: emptyCoins(),
    notes: '',
    details: emptyDetails(),
  };
}

export function emptyBuild(): Build {
  return {
    name: 'New Character',
    ruleset: '2014',
    backgroundAsi: { mode: '2+1', picks: [] },
    originFeatIds: [],
    raceId: 'human-variant',
    flexibleAsiPicks: ['str', 'con'],
    customOrigin: false,
    classes: [{ classId: 'fighter', level: 5, subclassId: 'battle-master' }],
    baseScores: { str: 15, dex: 14, con: 15, int: 8, wis: 10, cha: 8 },
    featIds: [],
    featAsiChoices: {},
    asiPicks: [],
    weapons: { mainHandId: 'greatsword', magicBonus: {} },
    items: [],
    defenses: { ...defaultDefenses(), armorId: 'chain-mail' },
    skillIds: [],
    expertiseIds: [],
    classOptionIds: [],
    masteryIds: [],
    spellIds: [],
    preparedIds: [],
    combatAssumptions: { advantage: false, concentrating: true, targets: 1 },
    toolIds: [],
    languages: [],
    gear: [],
    coins: emptyCoins(),
    notes: '',
    details: emptyDetails(),
  };
}
