import type { ArmorCategory } from './data/armor';
import type { SkillId } from './data/skills';
import type { WeaponCategory } from './data/weapons';
import type { CarriedItem } from './engine/items';
import type { CarriedGear, Coins } from './engine/inventory';
import type { ClassFeature } from './data/classFeatures';
import type { Source } from './data/sources';

// Shared domain types for the builder/optimizer.
// Rules target D&D 5e (2014 PHB core), with a Tasha's "custom origin" toggle
// for floating ability score increases.

/**
 * Which Player's Handbook a character is built under. The two differ in more
 * than values: 2024 moves origin ability increases from species to background,
 * and sorts feats into categories with level prerequisites.
 */
export type Ruleset = '2014' | '2024';

export const RULESETS: Ruleset[] = ['2014', '2024'];

export const RULESET_LABELS: Record<Ruleset, string> = {
  '2014': "2014 Player's Handbook",
  '2024': "2024 Player's Handbook",
};

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export const ABILITY_NAMES: Record<Ability, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

export type AbilityScores = Record<Ability, number>;

/** RPGBot-style four-tier rating scale. */
export type Rating = 'red' | 'orange' | 'blue' | 'sky';

export const RATING_LABELS: Record<Rating, string> = {
  red: 'Avoid',
  orange: 'Situational',
  blue: 'Solid',
  sky: 'Excellent',
};

export type CastingType = 'full' | 'half' | 'third' | 'pact' | 'none';

/** How the build makes attacks. Drives which combat feats are worth taking. */
export type WeaponStyle =
  | 'str-melee'
  | 'dex-melee'
  | 'dex-ranged'
  | 'unarmed'
  | 'spell';

/** Broad shape of the weapon/armor loadout, used by feat conditions. */
export type Loadout =
  | 'two-handed'
  | 'sword-and-board'
  | 'dual-wield'
  | 'polearm'
  | 'ranged'
  | 'none';

export interface Trait {
  name: string;
  text: string;
  /** Machine-readable hooks used by the race/class matrix. */
  tags?: TraitTag[];
}

export type TraitTag =
  | 'darkvision'
  | 'resistance'
  | 'extra-hp'
  | 'armor-prof'
  | 'light-armor-prof'
  | 'weapon-prof'
  | 'skill-prof'
  | 'expertise'
  | 'free-spells'
  | 'innate-caster-int'
  | 'innate-caster-wis'
  | 'innate-caster-cha'
  | 'mobility'
  | 'flight'
  | 'swim'
  | 'stealth'
  | 'advantage-saves'
  | 'save-reroll'
  | 'natural-armor'
  | 'natural-weapon'
  | 'breath-weapon'
  | 'extra-attack-ish'
  | 'reach'
  | 'carry-capacity'
  | 'no-sleep'
  | 'bonus-feat'
  | 'survivability'
  | 'action-economy'
  | 'skills'
  | 'social';

export interface Race {
  id: string;
  name: string;
  /** Which rulesets this record belongs to. Absent means 2014 only. */
  rulesets?: Ruleset[];
  /** Parent lineage when this entry is a subrace ("Elf" for "Wood Elf"). */
  parent?: string;
  source: Source;
  size: 'Small' | 'Medium';
  speed: number;
  /** Fixed ability score increases (2014-style). */
  asi: Partial<Record<Ability, number>>;
  /**
   * Player-chosen increases. One entry per choice, in order, e.g. Half-Elf is
   * [1, 1] excluding CHA, and a Monsters of the Multiverse lineage is [2, 1].
   */
  flexibleAsi?: { amounts: number[]; exclude?: Ability[] };
  traits: Trait[];
  /** Free feat at level 1 (Variant Human, Custom Lineage). */
  bonusFeat?: boolean;
  /**
   * Extra skill proficiencies beyond the class list, as a count. Kept because
   * the species matrix scores it; `skillGrants` is the machine-readable form.
   */
  bonusSkills?: number;
  /** Skills this lineage grants outright, and any it lets you choose. */
  skillGrants?: SkillGrant;
  /** Armor this lineage grants (Mountain Dwarf, Hobgoblin). */
  armorProficiency?: ArmorProficiency[];
  /** Weapons this lineage grants (Elf Weapon Training, Hobgoblin). */
  weaponProficiency?: WeaponProficiency;
  note: string;
}

export interface Subclass {
  id: string;
  name: string;
  /**
   * Which books this subclass appears in. Absent means 2014 only, which is
   * true of most of them - the 2024 Player's Handbook carries four per class.
   */
  rulesets?: Ruleset[];
  /** 2024 renamed a number of subclasses without changing what they are. */
  nameIn2024?: string;
  source: Source;
  /** Level the subclass is chosen. */
  level: number;
  note: string;
  /** Overrides for the parent class when this subclass changes the math. */
  abilityPriority?: Partial<Record<Ability, number>>;
  castingType?: CastingType;
  castingAbility?: Ability;
  /** Armor this subclass grants on top of the class list. */
  armorProficiency?: ArmorProficiency[];
  /** Weapons this subclass grants on top of the class list. */
  weaponProficiency?: WeaponProficiency;
  /**
   * Only the features that change maths the engine computes - a subclass that
   * grants Extra Attack, or half proficiency. Not an exhaustive feature list;
   * `note` is what a reader gets, and it is better at the job.
   */
  features?: ClassFeature[];
  /**
   * Spells the subclass hands you outright: a Life Cleric's Bless and Cure
   * Wounds, a Devotion Paladin's oath spells, a Fiend Warlock's expanded list.
   * They are always prepared and never count against how many you may prepare,
   * which is most of why those subclasses are rated as highly as they are.
   *
   * **These are the 2014 lists**, verified against SRD 5.1, and the engine
   * grants them under 2014 only. 2024 revised every one of them and no
   * licensed source carries the revisions — the SRD 5.2 API serves the
   * subclass but returns an empty spell list — so granting the 2014 list to a
   * 2024 character would be inventing the table rather than reading it.
   */
  spells?: SubclassSpells[];
  tags?: SubclassTag[];
}

/** Spells a subclass grants once you reach `level` in that class. */
export interface SubclassSpells {
  level: number;
  ids: string[];
}

export type SubclassTag =
  | 'heavy-armor'
  | 'medium-armor'
  | 'martial-weapons'
  | 'gish'
  | 'blaster'
  | 'support'
  | 'controller'
  | 'stealth'
  | 'summoner'
  | 'tank';

/**
 * The multiclassing proficiency table. Every line of it is narrower than what
 * the class gives at 1st level, and the differences are the whole point:
 * a Fighter dip brings medium armor but *not* heavy, a Barbarian dip brings
 * shields without any body armor, and a Rogue or Bard dip brings light armor
 * with no weapons whatsoever.
 */
export interface MulticlassGrant {
  /** Only Bard, Ranger and Rogue give a skill, and only one. */
  skills?: SkillChoice;
  armor?: ArmorProficiency[];
  weapons?: WeaponProficiency;
  /**
   * Tools a dip grants outright. Only the Rogue's thieves' tools qualify - a
   * Bard dip grants "one musical instrument of your choice", which is a choice
   * rather than a grant and belongs in the Tools panel.
   */
  tools?: string[];
}

export interface CharClass {
  id: ClassId;
  name: string;
  /** Which rulesets this class exists in. Absent means both. */
  rulesets?: Ruleset[];
  source: Source;
  hitDie: number;
  /** 0 = dump stat, 1 = nice, 2 = important, 3 = primary. */
  abilityPriority: Record<Ability, number>;
  saves: [Ability, Ability];
  asiLevels: number[];
  castingType: CastingType;
  castingAbility?: Ability;
  /**
   * The Artificer's two documented departures from the half-caster rules,
   * as flags rather than a third casting type - `castingType: 'half'` is
   * compared in five places and is right about everything else.
   *
   * `castsFromLevel1`: a Paladin and Ranger get their first slot at 2nd level
   * under 2014; the Artificer's own table starts at 1st. Without this the app
   * gave a 1st-level Artificer two cantrips and no slots to go with them.
   *
   * `multiclassRoundsUp`: the Artificer's multiclassing sidebar says to add
   * *half your levels rounded up*, where every other half caster rounds down.
   * Without it an Artificer 3 / Wizard 3 casts as a 4th-level caster instead
   * of a 5th - a whole spell level short, at every odd Artificer level.
   *
   * Both are TCoE, not the SRD, and unverifiable from any fixture this
   * project ships. Written from the book, and said so.
   */
  castsFromLevel1?: boolean;
  multiclassRoundsUp?: boolean;
  /**
   * The published class list this one draws its spells from.
   *
   * Every spell in `spells.ts` carries a `classes` array, so a class's list is
   * held by the spells rather than by the class. That is the right shape for
   * the thirteen published classes and the wrong shape for a fourteenth: a new
   * class would mean touching a few hundred spell rows, and the diff would be
   * unreviewable for a fact - "the Reckoner can cast Hex" - that is one
   * sentence when written down once.
   *
   * So a class may point at another class's list instead. It is not a fudge;
   * it is what the design actually says. The Reckoner is Warlock design space
   * and casts from the Warlock list, the Harrier from the Ranger list, and
   * both say so out loud on the class page. When a class has its own list this
   * is absent and the spells answer as before.
   */
  drawsSpellsFrom?: ClassId;
  armor: string;
  /** Structured form of `armor`, used by the AC calculation. */
  armorProficiency: ArmorProficiency[];
  weapons: string;
  /** Structured form of `weapons`, used by attack and prerequisite checks. */
  weaponProficiency: WeaponProficiency;
  /**
   * 2024 only: how many weapons this class has mastery with, by level. Absent
   * means the class has no Weapon Mastery feature.
   */
  masteries?: { level: number; count: number }[];
  defaultWeaponStyle: WeaponStyle;
  /** Skill proficiencies chosen from the class list at 1st level. */
  skillChoices: SkillChoice;
  /** 2024 changed one class skill list; absent means it is unchanged. */
  skillChoicesIn2024?: SkillChoice;
  /**
   * What a *multiclass* dip into this class grants, which is consistently less
   * than starting in it. Absent means a dip grants nothing at all, which is
   * true of Sorcerer and Wizard.
   */
  multiclass?: MulticlassGrant;
  /**
   * The ability scores a character needs to *take* a level in this class
   * after the first, from the SRD's Multiclassing prerequisites table.
   *
   * `mode` because the table has both shapes: a Fighter wants Strength 13
   * **or** Dexterity 13, a Paladin wants Strength 13 **and** Charisma 13,
   * and collapsing the two would let a Paladin in on Strength alone.
   *
   * Absent means the class has no prerequisite, which in the SRD is only
   * true of the Artificer - a class from a later book that this project
   * carries and the multiclassing table never covered.
   */
  multiclassPrereq?: { abilities: { ability: Ability; min: number }[]; mode: 'all' | 'any' };
  subclasses: Subclass[];
  note: string;
}

/**
 * Weapon proficiency, as categories plus the named exceptions several classes
 * and lineages carry (a Bard's four, a Wizard's five).
 */
export interface WeaponProficiency {
  categories: WeaponCategory[];
  specific?: string[];
}

export interface SkillChoice {
  count: number;
  /** The list you pick from. Bards pick from all 18. */
  from: SkillId[];
}

/**
 * What a lineage, background or feat hands you. `fixed` is granted outright;
 * `choose` is a pick, from `from` when the source restricts it and from all 18
 * when it does not.
 */
export interface FeatGrants {
  /** A number of free picks, or specific skills. */
  skills?: number | SkillId[];
  expertise?: number;
  tools?: number;
  languages?: number;
  /**
   * Observant raises the passive score without granting proficiency, which is
   * a distinction the engine has to keep - a +5 passive Perception on someone
   * who cannot roll it well is exactly what that feat does.
   */
  passive?: SkillId[];
}

export interface SkillGrant {
  fixed?: SkillId[];
  choose?: { count: number; from?: SkillId[] };
}

export type ArmorProficiency = ArmorCategory | 'shield';

export type ClassId =
  | 'artificer'
  | 'barbarian'
  | 'bard'
  | 'cleric'
  | 'druid'
  | 'fighter'
  | 'monk'
  | 'paladin'
  | 'ranger'
  | 'rogue'
  | 'sorcerer'
  | 'warlock'
  | 'wizard';

export type FeatTag =
  | 'damage'
  | 'accuracy'
  | 'defense'
  | 'control'
  | 'mobility'
  | 'utility'
  | 'social'
  | 'skills'
  | 'caster'
  | 'melee'
  | 'ranged'
  | 'action-economy'
  | 'survivability';

export interface FeatPrereq {
  abilities?: { ability: Ability; min: number }[];
  races?: string[];
  /** Requires the ability to cast at least one spell. */
  spellcasting?: boolean;
  /** Minimum character level, used by 2024 General feats and Epic Boons. */
  minLevel?: number;
  /** Free-text prerequisite shown in the UI (e.g. "Proficiency with medium armor"). */
  note?: string;
}

/** Half-feats: pick +1 in one of these abilities. */
export interface FeatAsi {
  abilities: Ability[];
  amount: number;
}

/**
 * 2024 sorts feats by when you can take them. Origin feats come from a
 * background at 1st level, General feats need level 4 and usually an ability of
 * 13, and Epic Boons need level 19.
 */
export type FeatCategory = 'origin' | 'general' | 'fighting-style' | 'epic-boon';

export interface Feat {
  id: string;
  name: string;
  source: Source;
  /** Which rulesets this feat exists in. Absent means 2014 only. */
  rulesets?: Ruleset[];
  /** 2024 only; 2014 has no feat categories. */
  category?: FeatCategory;
  summary: string;
  tags: FeatTag[];
  prereq?: FeatPrereq;
  asi?: FeatAsi;
  /** Baseline power level, 0-10, before build-specific adjustments. */
  base: number;
  /** Proficiencies this feat hands out, beyond its ability increase. */
  grants?: FeatGrants;
  rules?: ScoreRule[];
  /**
   * What changes about this feat under 2024, merged over the base record. Many
   * feats gained a +1 ability there, and a few were reworked outright. Keeping
   * both versions on one record means an id resolves in either ruleset, so
   * switching rules does not silently drop a feat you had taken.
   *
   * `asi: null` removes the 2014 half-feat increase rather than overriding it.
   */
  in2024?: Omit<Partial<Feat>, 'id' | 'in2024' | 'asi'> & { asi?: FeatAsi | null };
}

export interface ScoreRule {
  when: Condition;
  delta: number;
  why: string;
}

export type Condition =
  | { kind: 'class'; ids: ClassId[] }
  | { kind: 'subclass'; ids: string[] }
  | { kind: 'race'; ids: string[] }
  | { kind: 'weaponStyle'; styles: WeaponStyle[] }
  | { kind: 'loadout'; loadouts: Loadout[] }
  | { kind: 'armorCategory'; categories: ArmorCategory[] }
  | { kind: 'usingShield' }
  | { kind: 'casting'; types: CastingType[] }
  | { kind: 'ability'; ability: Ability; min?: number; max?: number }
  | { kind: 'level'; min?: number; max?: number }
  | { kind: 'extraAttack' }
  | { kind: 'hasFeat'; ids: string[] }
  | { kind: 'concentrates' }
  | { kind: 'all'; of: Condition[] }
  | { kind: 'any'; of: Condition[] }
  | { kind: 'not'; of: Condition };

/** A character in progress, and the unit the optimizer reasons about. */
/** Ordinary gear and coins, re-exported so `types` stays the one import. */
export type { CarriedGear, Coins } from './engine/inventory';

export interface Build {
  name: string;
  ruleset: Ruleset;
  raceId: string;
  backgroundId?: string;
  /**
   * 2024: a background offers three abilities and you take either +2/+1 across
   * two of them, or +1 to all three.
   */
  backgroundAsi: BackgroundAsi;
  /** Choices for races with floating increases. */
  flexibleAsiPicks: Ability[];
  customOrigin: boolean;
  classes: ClassEntry[];
  baseScores: AbilityScores;
  /** Feats already taken with an ability score improvement slot, in order. */
  featIds: string[];
  /**
   * Feats granted by your origin - a 2024 background, the 2024 Human's
   * Versatile trait, Variant Human or Custom Lineage. These cost no slot.
   */
  originFeatIds: string[];
  /** For half-feats, which ability the +1 went into. */
  featAsiChoices: Record<string, Ability>;
  /** Manual ASI allocations already spent, in order. */
  asiPicks: Ability[][];
  /**
   * What this character is holding. The attack style and loadout the feat rules
   * read are derived from it, not stored - so the app cannot rate a feat
   * against a profile you asserted but are not carrying.
   */
  weapons: Weapons;
  defenses: Defenses;
  /**
   * Magic items carried, and which are attuned. An item does nothing until it
   * is attuned when it needs to be, so this is a list of what you *have*, not
   * a list of bonuses.
   */
  items: CarriedItem[];
  /**
   * Skills chosen from the picks this character controls - class list, a
   * lineage's floating proficiencies, Skilled. Skills granted outright by a
   * background or lineage are not stored here; they are derived, so changing
   * background cannot leave a stale pick behind.
   */
  skillIds: SkillId[];
  /** Skills doubled by Rogue/Bard expertise, Skill Expert or Prodigy. */
  expertiseIds: SkillId[];
  /**
   * Fighting styles, invocations, metamagic, maneuvers - everything a class
   * feature lets you choose. One list, since the option knows its own kind.
   */
  classOptionIds: string[];
  /** Warlock only, and it gates about a third of the invocations. */
  pactBoon?: string;
  /** 2024 only: the weapons this character has mastery with. */
  masteryIds: string[];
  /** Cantrips and spells recorded: a known caster's list, or a Wizard's book. */
  spellIds: string[];
  /**
   * Which of those are prepared today. Only a book caster uses it - everyone
   * else prepares from their whole class list, so `spellIds` already is the
   * prepared list.
   */
  preparedIds: string[];
  /**
   * Which class each spell was learned through, keyed by spell id.
   *
   * Only a multiclass caster with two casting abilities can tell the
   * difference, and for them it is the difference between a Cleric/Wizard's
   * Fireball landing at DC 14 or DC 17. Absent entries fall back to assuming
   * you learned the spell from whichever of your classes casts it best, which
   * is the favourable reading rather than the certain one - so a sheet only
   * says it is assuming when it actually is.
   *
   * Optional, and absent on every character built before it existed.
   */
  spellSources?: Record<string, ClassId>;
  /** What the damage calculation should assume about a round. */
  combatAssumptions: { advantage: boolean; concentrating: boolean; targets: number };
  /** Tools and languages, tracked but not scored. */
  toolIds: string[];
  languages: string[];
  /** Ordinary equipment carried, by catalogue id and how many. */
  gear: CarriedGear[];
  /** What is in the purse, which is also five pounds a hundred coins. */
  coins: Coins;
  notes: string;
  /**
   * Counters this app has no table for. Optional, and absent on every
   * character built before it existed.
   */
  customResources?: CustomResource[];
  /** The parts of a paper sheet that describe a person rather than a number. */
  details: CharacterDetails;
  /** Set when the build came from an external sheet. */
  importedFrom?: string;
}

/**
 * A counter the table uses that this app has no table for.
 *
 * The app ships 2014 and 2024, which between them cover Ki (Focus Points in
 * 2024), Rage, Sorcery Points, Channel Divinity, Lay on Hands and the rest -
 * those are in `data/classResources.ts` and need nothing from you. What they
 * do not cover is anything from a supplement: Theros piety, Ravnica renown, a
 * subclass your DM wrote. Reproducing those tables would mean copying books
 * this project has no licence to, so instead you can name the counter and the
 * app will track it.
 *
 * Two shapes, and the difference is only where it starts and what a rest does:
 * a **pool** starts full and is spent down, a **score** starts at nothing and
 * is built up. Piety is a score, and no rest touches it.
 */
export interface CustomResource {
  id: string;
  name: string;
  max: number;
  /** Where it sits when new, and what a recharge returns it to. */
  startsAt: 'full' | 'empty';
  /** `none` for a score a rest does not touch. */
  recharge: 'short' | 'long' | 'none';
}

/**
 * Everything the printed sheet has a box for and the optimizer has no opinion
 * about. None of it changes a number; all of it is missing from the page if it
 * is not stored, and a character sheet with an empty Bonds box is not a
 * character sheet.
 */
export interface CharacterDetails {
  playerName: string;
  alignment: string;
  experience: string;
  personality: string;
  ideals: string;
  bonds: string;
  flaws: string;
  backstory: string;
  /**
   * A portrait, as a data URL.
   *
   * Downscaled to 512 square and re-encoded before it is stored, because a
   * phone camera produces four megabytes in a single photograph and the whole
   * roster shares one storage budget. See `engine/portrait.ts`.
   *
   * **Not carried in a share link.** A link is a URL fragment - about 1.2 kB
   * today - and a portrait would make it hundreds of kilobytes and unpasteable.
   * `share.ts` strips it, next to `combatAssumptions`.
   */
  portrait?: string;
}

export function emptyDetails(): CharacterDetails {
  return {
    playerName: '',
    alignment: '',
    experience: '',
    personality: '',
    ideals: '',
    bonds: '',
    flaws: '',
    backstory: '',
  };
}

/** Equipment and hit-point choices that drive the AC and HP calculations. */
export interface Weapons {
  mainHandId?: string;
  offHandId?: string;
  /** +1 to +3, keyed by weapon id. */
  magicBonus: Record<string, number>;
}

export interface Defenses {
  armorId: string;
  shield: boolean;
  /** +1 to +3 from magical armor and shields. */
  armorMagicBonus: number;
  shieldMagicBonus: number;
  /** Ring of Protection, Cloak of Protection, and anything else flat. */
  miscAcBonus: number;
  /**
   * How hit points per level are counted.
   *
   * `manual` is one number for the whole character - "I rolled, my dice came
   * to 34" - which is what somebody entering an existing sheet has. `rolled`
   * is the *level-up* answer: one die per level above the first, kept in
   * order, so the wizard can roll this level's die without disturbing the
   * ones before it. Both exist because they answer different questions.
   */
  hpMode: 'average' | 'max' | 'manual' | 'rolled';
  /** Used when hpMode is 'manual' - the total rolled from hit dice. */
  manualHitDiceTotal?: number;
  /**
   * Used when hpMode is 'rolled' - one face per level above the first, in
   * level order. Short lists are treated as "not rolled yet" and fall back to
   * the average for the levels they do not cover, so raising your level never
   * silently drops hit points you had.
   */
  rolledHitDice?: number[];
  miscHpBonus: number;
}

export interface BackgroundAsi {
  mode: '2+1' | '1+1+1';
  /** For '2+1': the first gets +2, the second +1. Unused for '1+1+1'. */
  picks: Ability[];
}

export interface ClassEntry {
  classId: ClassId;
  level: number;
  subclassId?: string;
}
