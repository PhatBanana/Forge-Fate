import type { Ability, ArmorProficiency, Build, Defenses, Race, WeaponProficiency } from '../types';
import type { Weapon, WeaponCategory } from '../data/weapons';
import type { ArmorCategory } from '../data/armor';
import { ARMOR_BY_ID, SHIELD_AC } from '../data/armor';
import type { ClassSlice } from './character';
import { subclassLevelFor } from '../data/classes';
import { featById } from '../data/feats';
import { featuresFor } from './features';
import type { Ruleset } from '../types';

export interface Line {
  label: string;
  value: number;
}

export interface AcResult {
  total: number;
  lines: Line[];
  /** How the base AC was arrived at, e.g. "Half plate" or "Unarmored Defense (Monk)". */
  source: string;
  /** Rules problems with this combination, shown to the player. */
  problems: string[];
  notes: string[];
  category: ArmorCategory;
  stealthDisadvantage: boolean;
  /** Speed penalty from failing an armor's Strength requirement. */
  speedPenalty: number;
}

export interface HpResult {
  total: number;
  lines: Line[];
  /** Average total, for comparison when rolling. */
  averageTotal: number;
  notes: string[];
}

// ------------------------------------------------------------ proficiencies

/** Every armor proficiency this character has, from all sources. */
export function armorProficiencies(
  slices: ClassSlice[],
  race: Race,
  featIds: Set<string>,
  ruleset: Ruleset = '2014',
): Set<ArmorProficiency> {
  const out = new Set<ArmorProficiency>();
  for (const slice of slices) {
    // Only your starting class grants its full armor list. A dip grants the
    // narrower multiclassing set, which is why a Wizard 1 / Fighter 1 does not
    // get heavy armor - the single most common way a sheet ends up wrong.
    const granted =
      slice === slices[0] ? slice.klass.armorProficiency : (slice.klass.multiclass?.armor ?? []);
    for (const prof of granted) out.add(prof);
    // A subclass only grants its armor once you actually have the subclass.
    if (slice.subclass && slice.entry.level >= subclassLevelFor(slice.klass, ruleset)) {
      for (const prof of slice.subclass.armorProficiency ?? []) out.add(prof);
    }
  }
  for (const prof of race.armorProficiency ?? []) out.add(prof);
  if (featIds.has('lightly-armored')) out.add('light');
  if (featIds.has('moderately-armored')) {
    out.add('medium');
    out.add('shield');
  }
  if (featIds.has('heavily-armored')) out.add('heavy');
  return out;
}

/**
 * Every weapon proficiency this character has, from all sources. Same shape as
 * `armorProficiencies` above, and it replaces the hardcoded list of martial
 * classes, subclasses and lineages that used to live in conditions.ts.
 */
export function weaponProficiencies(
  slices: ClassSlice[],
  race: Race,
  ruleset: Ruleset = '2014',
): { categories: Set<WeaponCategory>; specific: Set<string> } {
  const categories = new Set<WeaponCategory>();
  const specific = new Set<string>();

  const add = (prof: WeaponProficiency | undefined) => {
    for (const category of prof?.categories ?? []) categories.add(category);
    for (const id of prof?.specific ?? []) specific.add(id);
  };

  for (const slice of slices) {
    // As with armor: the starting class grants its whole list, a dip grants the
    // multiclassing set. A Rogue or Bard dip grants no weapons at all.
    add(slice === slices[0] ? slice.klass.weaponProficiency : slice.klass.multiclass?.weapons);
    if (slice.subclass && slice.entry.level >= subclassLevelFor(slice.klass, ruleset)) {
      add(slice.subclass.weaponProficiency);
    }
  }
  add(race.weaponProficiency);
  return { categories, specific };
}

/** Whether a specific weapon is one this character can use without penalty. */
export function isProficientWith(
  weapon: Weapon,
  proficiencies: { categories: Set<WeaponCategory>; specific: Set<string> },
): boolean {
  return proficiencies.categories.has(weapon.category) || proficiencies.specific.has(weapon.id);
}

// ---------------------------------------------------------- unarmored defense

interface UnarmoredOption {
  source: string;
  /** AC = base + DEX + (extra ability, if any). */
  base: number;
  extra?: Ability;
  /** Barbarian's Unarmored Defense allows a shield; Monk's does not. */
  allowsShield: boolean;
}

function unarmoredOptions(
  slices: ClassSlice[],
  race: Race,
  featIds: Set<string>,
  ruleset: Ruleset,
): UnarmoredOption[] {
  const options: UnarmoredOption[] = [
    { source: 'Unarmored', base: 10, allowsShield: true },
  ];
  const subIds = new Set(
    slices
      .filter((s) => s.subclass && s.entry.level >= subclassLevelFor(s.klass, ruleset))
      .map((s) => s.subclass!.id),
  );

  // Which classes have an unarmored formula, and what it adds, is declared in
  // the feature table rather than listed here.
  for (const feature of featuresFor(slices, ruleset)) {
    if (!feature.unarmored) continue;
    options.push({
      source: `${feature.name} (${feature.source})`,
      base: 10,
      extra: feature.unarmored.extra,
      allowsShield: feature.unarmored.allowsShield,
    });
  }
  if (subIds.has('draconic')) {
    options.push({ source: 'Draconic Resilience', base: 13, allowsShield: true });
  }
  if (race.id === 'lizardfolk') {
    options.push({ source: 'Natural Armor (Lizardfolk)', base: 13, allowsShield: true });
  }
  if (featIds.has('dragon-hide')) {
    options.push({ source: 'Dragon Hide', base: 13, allowsShield: true });
  }
  return options;
}

// -------------------------------------------------------------------- armor

export function computeAc(
  build: Build,
  slices: ClassSlice[],
  race: Race,
  mods: Record<Ability, number>,
  scores: Record<Ability, number>,
  featIds: Set<string>,
  /** Flat armor class from magic items; the Items panel names which ones. */
  itemAc = 0,
  /**
   * What the armor's material does to it. Mithral removes both the Stealth
   * disadvantage and the Strength requirement, which are penalties this
   * function computes - so without this a Mithral-clad character was told
   * their armor gave disadvantage on Stealth, which is the opposite of what
   * the item is for.
   */
  material: { noStealthDisadvantage?: boolean; noStrengthRequirement?: boolean } = {},
): AcResult {
  const defenses = build.defenses;
  const armor = ARMOR_BY_ID[defenses.armorId] ?? ARMOR_BY_ID.none;
  const proficiencies = armorProficiencies(slices, race, featIds, build.ruleset);
  const problems: string[] = [];
  const notes: string[] = [];
  const lines: Line[] = [];

  const subIds = new Set(
    slices
      .filter((s) => s.subclass && s.entry.level >= subclassLevelFor(s.klass, build.ruleset))
      .map((s) => s.subclass!.id),
  );

  let source: string;
  let dexApplied: number;

  if (armor.category === 'none') {
    // Take the best unarmored formula available, respecting the shield rules.
    const options = unarmoredOptions(slices, race, featIds, build.ruleset).filter(
      (o) => o.allowsShield || !defenses.shield,
    );
    const best = options.reduce((a, b) => {
      const av = a.base + mods.dex + (a.extra ? mods[a.extra] : 0);
      const bv = b.base + mods.dex + (b.extra ? mods[b.extra] : 0);
      return bv > av ? b : a;
    });
    source = best.source;
    dexApplied = mods.dex;
    lines.push({ label: `${best.source} base`, value: best.base });
    lines.push({ label: 'Dexterity modifier', value: mods.dex });
    if (best.extra) {
      lines.push({ label: `${best.extra.toUpperCase()} modifier`, value: mods[best.extra] });
    }
    if (defenses.shield && slices.some((s) => s.klass.id === 'monk')) {
      notes.push("A Monk's Unarmored Defense does not work while using a shield.");
    }
  } else {
    source = armor.name;
    // Medium Armor Master raises the medium-armor Dexterity cap from +2 to +3.
    const cap =
      armor.category === 'medium' && featIds.has('medium-armor-master') ? 3 : armor.dexCap;
    dexApplied = cap === null ? mods.dex : Math.min(mods.dex, cap);
    lines.push({ label: `${armor.name} base`, value: armor.baseAc });
    if (dexApplied !== 0 || armor.dexCap !== 0) {
      lines.push({
        label:
          cap !== null && mods.dex > cap
            ? `Dexterity modifier (capped at +${cap})`
            : 'Dexterity modifier',
        value: dexApplied,
      });
    }
    if (cap !== null && mods.dex > cap) {
      notes.push(
        `${armor.name} caps the Dexterity bonus at +${cap}; ${mods.dex - cap} point${mods.dex - cap === 1 ? '' : 's'} of your modifier ${mods.dex - cap === 1 ? 'is' : 'are'} doing nothing for AC.`,
      );
    }

    if (!proficiencies.has(armor.category)) {
      problems.push(
        `Not proficient with ${armor.category} armor: disadvantage on every ability check, saving throw and attack roll that uses Strength or Dexterity, and you cannot cast spells.`,
      );
    }
    if (slices.some((s) => s.klass.id === 'monk')) {
      notes.push('Wearing armor switches off Martial Arts and Unarmored Movement.');
    }
    if (slices.some((s) => s.klass.id === 'barbarian') && armor.category === 'heavy') {
      notes.push('Rage does not function while wearing heavy armor.');
    }
    if (subIds.has('bladesinging') && armor.category !== 'light') {
      notes.push('Bladesong requires light armor or none.');
    }
    if (slices.some((s) => s.klass.id === 'druid') && armor.weight >= 40) {
      notes.push('Druids traditionally refuse metal armor - check with your DM.');
    }
  }

  let speedPenalty = 0;
  if (
    armor.strengthRequirement &&
    scores.str < armor.strengthRequirement &&
    !material.noStrengthRequirement
  ) {
    speedPenalty = 10;
    problems.push(
      `${armor.name} requires Strength ${armor.strengthRequirement}; at Strength ${scores.str} your speed drops by 10 ft.`,
    );
  }

  if (defenses.shield) {
    if (!proficiencies.has('shield')) {
      problems.push('Not proficient with shields.');
    }
    lines.push({ label: 'Shield', value: SHIELD_AC });
  }

  // Bladesong adds INT to AC, but only while it is running.
  if (subIds.has('bladesinging') && (armor.category === 'light' || armor.category === 'none')) {
    lines.push({ label: 'Bladesong (Intelligence)', value: mods.int });
    notes.push('Bladesong lasts one minute and takes a bonus action; without it, subtract that Intelligence bonus.');
  }

  if (race.id === 'warforged') {
    lines.push({ label: 'Integrated Protection (Warforged)', value: 1 });
  }
  // The Defense style is a 2014 class option and a 2024 feat. Both share the id
  // 'defense', and it counts once either way.
  if (featIds.has('defense') || build.classOptionIds.includes('defense')) {
    if (armor.category === 'none') {
      notes.push('The Defense fighting style only applies while you are wearing armor.');
    } else {
      lines.push({ label: 'Defense fighting style', value: 1 });
    }
  }
  if (featIds.has('dual-wielder') && !!build.weapons.offHandId) {
    lines.push({ label: 'Dual Wielder feat', value: 1 });
  }
  if (defenses.armorMagicBonus && armor.category !== 'none') {
    lines.push({ label: `Magic armor +${defenses.armorMagicBonus}`, value: defenses.armorMagicBonus });
  } else if (defenses.armorMagicBonus) {
    notes.push('A magic armor bonus needs armor to apply to.');
  }
  if (defenses.shieldMagicBonus && defenses.shield) {
    lines.push({ label: `Magic shield +${defenses.shieldMagicBonus}`, value: defenses.shieldMagicBonus });
  }
  if (itemAc) {
    lines.push({ label: 'Magic items', value: itemAc });
  }
  if (defenses.miscAcBonus) {
    lines.push({ label: 'Other bonuses', value: defenses.miscAcBonus });
  }

  const total = lines.reduce((sum, line) => sum + line.value, 0);

  return {
    total,
    lines,
    source,
    problems,
    notes,
    category: armor.category,
    stealthDisadvantage:
      !!armor.stealthDisadvantage &&
      !material.noStealthDisadvantage &&
      !(armor.category === 'medium' && featIds.has('medium-armor-master')),
    speedPenalty,
  };
}

// ---------------------------------------------------------------------- speed

export interface SpeedResult {
  total: number;
  lines: Line[];
}

/**
 * Walking speed, with every source that changes it on its own line.
 *
 * This calculation used to live as `race.speed - ac.speedPenalty +
 * itemEffects.speed` copy-pasted across six components - which meant a
 * character with the Mobile feat, or a fifth-level Barbarian, showed a base 30
 * on the battle map no matter what their sheet promised. Now the engine owns
 * it, and the map, the sheet, the play card and the comparison all read the
 * same number.
 */
export function computeSpeed(
  build: Build,
  slices: ClassSlice[],
  race: Race,
  featIds: Set<string>,
  ac: AcResult,
  itemSpeed: number,
): SpeedResult {
  const lines: Line[] = [{ label: `${race.name} base speed`, value: race.speed }];
  if (ac.speedPenalty) {
    lines.push({ label: 'Armor you lack the Strength for', value: -ac.speedPenalty });
  }
  if (itemSpeed) lines.push({ label: 'Magic items', value: itemSpeed });

  // Feats that add flat speed. Mobile is Speedy under 2024, so the label asks
  // the feat table rather than assuming a name.
  const speedFeats: [string, number][] = [
    ['mobile', 10],
    ['squat-nimbleness', 5],
    ['boon-of-speed', 30],
  ];
  for (const [id, bonus] of speedFeats) {
    if (!featIds.has(id)) continue;
    lines.push({ label: featById(id, build.ruleset)?.name ?? id, value: bonus });
  }

  const levelIn = (classId: string) =>
    slices.filter((s) => s.klass.id === classId).reduce((n, s) => n + s.entry.level, 0);

  // Fast Movement: +10 at Barbarian 5 while not in heavy armor. The rule is
  // about heavy armor specifically - a raging Barbarian in half plate keeps it.
  if (levelIn('barbarian') >= 5 && ac.category !== 'heavy') {
    lines.push({ label: 'Fast Movement (Barbarian 5)', value: 10 });
  }

  // Unarmored Movement: no armor, no shield, and it climbs with Monk level.
  const monk = levelIn('monk');
  if (monk >= 2 && ac.category === 'none' && !build.defenses.shield) {
    const bonus = monk >= 18 ? 30 : monk >= 14 ? 25 : monk >= 10 ? 20 : monk >= 6 ? 15 : 10;
    lines.push({ label: `Unarmored Movement (Monk ${monk})`, value: bonus });
  }

  const total = Math.max(0, lines.reduce((sum, line) => sum + line.value, 0));
  return { total, lines };
}

// ----------------------------------------------------------------- hit points

/** Average hit points gained per level from a die, rounded the way 5e does. */
export function averageRoll(hitDie: number): number {
  return Math.floor(hitDie / 2) + 1;
}

export function computeHp(
  build: Build,
  slices: ClassSlice[],
  race: Race,
  mods: Record<Ability, number>,
  featIds: Set<string>,
  totalLevel: number,
): HpResult {
  const defenses = build.defenses;
  const lines: Line[] = [];
  const notes: string[] = [];

  // The first level of your starting class is always maximum; every level
  // after that is rolled, or the fixed average.
  const first = slices[0];
  let fromDice = 0;
  let averageFromDice = 0;

  if (first) {
    fromDice += first.klass.hitDie;
    averageFromDice += first.klass.hitDie;
    lines.push({ label: `${first.klass.name} 1st level (maximum d${first.klass.hitDie})`, value: first.klass.hitDie });
  }

  /*
    `rolled` walks the levels one at a time, because each has its own die and
    the list is kept in level order. Any level the list does not reach yet
    falls back to the average rather than to nothing - raising your level
    before rolling for it should not cost you hit points you can see.
  */
  let rolledAt = 0;

  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];
    const levels = i === 0 ? slice.entry.level - 1 : slice.entry.level;
    if (levels <= 0) continue;
    averageFromDice += averageRoll(slice.klass.hitDie) * levels;

    if (defenses.hpMode === 'rolled') {
      const rolls = defenses.rolledHitDice ?? [];
      let sum = 0;
      let unrolled = 0;
      for (let n = 0; n < levels; n++) {
        const face = rolls[rolledAt++];
        /*
          Zero means "not rolled yet", and so does a missing entry. A die
          cannot land on zero, so it is a safe sentinel - and it has to be one
          rather than a hole in the array, because a hole becomes `null` on the
          way through JSON and the list has to survive being saved. Levelling
          twice before rolling for the first of them must not silently zero it.
        */
        if (!face || face < 1) {
          sum += averageRoll(slice.klass.hitDie);
          unrolled++;
        } else {
          sum += face;
        }
      }
      fromDice += sum;
      lines.push({
        label: `${slice.klass.name} levels 2-${slice.entry.level} (${levels} rolled d${slice.klass.hitDie}${unrolled ? `, ${unrolled} not yet rolled` : ''})`,
        value: sum,
      });
      continue;
    }

    const perLevel = defenses.hpMode === 'max' ? slice.klass.hitDie : averageRoll(slice.klass.hitDie);
    fromDice += perLevel * levels;
    lines.push({
      label: `${slice.klass.name} levels 2-${slice.entry.level} (${levels} × ${perLevel} per d${slice.klass.hitDie})`,
      value: perLevel * levels,
    });
  }

  if (defenses.hpMode === 'manual' && defenses.manualHitDiceTotal !== undefined) {
    lines.length = 0;
    fromDice = defenses.manualHitDiceTotal;
    lines.push({ label: 'Rolled hit dice total', value: fromDice });
  }

  if (defenses.hpMode === 'max') {
    notes.push('Maximum hit points per level is a house rule; the standard options are rolling or the fixed average.');
  }

  // Constitution applies to every level, and retroactively when it changes.
  lines.push({ label: `Constitution modifier × ${totalLevel} levels`, value: mods.con * totalLevel });
  if (mods.con < 0) {
    notes.push('A negative Constitution modifier still cannot take a level below 1 hit point.');
  }

  if (featIds.has('tough')) {
    lines.push({ label: `Tough (+2 × ${totalLevel} levels)`, value: 2 * totalLevel });
  }
  if (race.id === 'dwarf-hill') {
    lines.push({ label: `Dwarven Toughness (+1 × ${totalLevel} levels)`, value: totalLevel });
  }
  const sorcerer = slices.find(
    (s) => s.subclass?.id === 'draconic' && s.entry.level >= s.subclass.level,
  );
  if (sorcerer) {
    lines.push({
      label: `Draconic Resilience (+1 × ${sorcerer.entry.level} sorcerer levels)`,
      value: sorcerer.entry.level,
    });
  }
  if (defenses.miscHpBonus) {
    lines.push({ label: 'Other bonuses', value: defenses.miscHpBonus });
  }

  const bonuses = lines
    .filter((l) => !l.label.includes('level (maximum') && !l.label.includes('levels 2-') && l.label !== 'Rolled hit dice total')
    .reduce((sum, l) => sum + l.value, 0);

  // Each level is guaranteed at least 1 hit point even with a terrible
  // Constitution, so clamp rather than letting the total go silly.
  const total = Math.max(totalLevel, fromDice + bonuses);
  const averageTotal = Math.max(totalLevel, averageFromDice + bonuses);

  return { total, lines, averageTotal, notes };
}

export function defaultDefenses(): Defenses {
  return {
    armorId: 'none',
    shield: false,
    armorMagicBonus: 0,
    shieldMagicBonus: 0,
    miscAcBonus: 0,
    hpMode: 'average',
    miscHpBonus: 0,
  };
}

/**
 * The best armor a character can actually wear, for defaults and for the
 * "what should I be wearing?" suggestion.
 */
export function bestArmorFor(
  proficiencies: Set<ArmorProficiency>,
  mods: Record<Ability, number>,
  scores: Record<Ability, number>,
  unarmoredBase: number,
): string {
  let bestId = 'none';
  let bestAc = unarmoredBase + mods.dex;
  for (const armor of Object.values(ARMOR_BY_ID)) {
    if (armor.category === 'none') continue;
    if (!proficiencies.has(armor.category)) continue;
    if (armor.strengthRequirement && scores.str < armor.strengthRequirement) continue;
    const dex = armor.dexCap === null ? mods.dex : Math.min(mods.dex, armor.dexCap);
    const ac = armor.baseAc + dex;
    if (ac > bestAc) {
      bestAc = ac;
      bestId = armor.id;
    }
  }
  return bestId;
}
