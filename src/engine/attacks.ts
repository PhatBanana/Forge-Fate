import type { Ability, Build, Loadout, Ruleset, WeaponStyle } from '../types';
import { MASTERY_LABELS, MASTERY_SUMMARIES, damageDice, isTwoHanded, weaponById, weaponsFor } from '../data/weapons';
import type { MasteryProperty, Weapon, WeaponCategory } from '../data/weapons';
import type { Line } from './defense';
import { hasFeatureTag } from './features';
import type { HeldFeature } from './features';

/**
 * What a character is holding, and what that means.
 *
 * Until this existed the app asked you: two dropdowns for attack style and
 * weapon loadout, which fifty-one feat rules keyed off. That let the app rate
 * Great Weapon Master highly because you ticked "two-handed", not because you
 * were carrying a greatsword.
 *
 * Now the weapons are the answer and those two values are derived. The feat
 * rules are unchanged - they read the same two fields, which are computed
 * rather than asserted.
 */

export interface Loadouts {
  mainHand?: Weapon;
  offHand?: Weapon;
  shield: boolean;
  style: WeaponStyle;
  loadout: Loadout;
  /** Why the style and loadout came out the way they did, for the UI. */
  why: string;
}

export interface DeriveInput {
  build: Build;
  mods: Record<Ability, number>;
  features: HeldFeature[];
  isCaster: boolean;
  isMonk: boolean;
}

/**
 * A Monk weapon is a simple melee weapon, or a shortsword, that is neither
 * two-handed nor heavy. Martial Arts lets a Monk use Dexterity with them, which
 * is why a Monk with a quarterstaff is a Dexterity build even though a
 * quarterstaff has no finesse property.
 */
export function isMonkWeapon(weapon: Weapon): boolean {
  if (!weapon.melee) return false;
  if (weapon.properties.includes('two-handed') || weapon.properties.includes('heavy')) return false;
  return weapon.category === 'simple' || weapon.id === 'shortsword';
}

/**
 * A finesse weapon uses whichever of Strength and Dexterity is better, so the
 * style follows the character rather than the weapon. A rapier in the hands of
 * a Strength build really is a Strength melee build.
 */
function meleeStyle(weapon: Weapon, mods: Record<Ability, number>, isMonk: boolean): WeaponStyle {
  const usesDex = weapon.properties.includes('finesse') || (isMonk && isMonkWeapon(weapon));
  if (usesDex && mods.dex > mods.str) return 'dex-melee';
  return 'str-melee';
}

export function deriveLoadout(input: DeriveInput): Loadouts {
  const { build, mods, isCaster, isMonk } = input;
  const mainHand = weaponById(build.weapons.mainHandId, build.ruleset);
  const offHand = weaponById(build.weapons.offHandId, build.ruleset);
  const shield = build.defenses.shield;

  // --- nothing in hand -----------------------------------------------------
  if (!mainHand) {
    const unarmed = isMonk || build.classOptionIds.includes('unarmed-fighting');
    return {
      mainHand: undefined,
      offHand,
      shield,
      style: unarmed ? 'unarmed' : isCaster ? 'spell' : 'unarmed',
      loadout: shield ? 'sword-and-board' : 'none',
      why: unarmed
        ? 'No weapon equipped, and this character fights unarmed.'
        : isCaster
          ? 'No weapon equipped, so this is read as a caster who attacks with spells.'
          : 'No weapon equipped.',
    };
  }

  // --- ranged --------------------------------------------------------------
  if (!mainHand.melee) {
    return {
      mainHand,
      offHand,
      shield,
      style: 'dex-ranged',
      loadout: 'ranged',
      why: `${mainHand.name} is a ranged weapon, so this build attacks at range with Dexterity.`,
    };
  }

  // --- melee ---------------------------------------------------------------
  const style = meleeStyle(mainHand, mods, isMonk);
  const usesDex = mainHand.properties.includes('finesse') || (isMonk && isMonkWeapon(mainHand));
  const finesseNote = !usesDex
    ? ''
    : style === 'dex-melee'
      ? mainHand.properties.includes('finesse')
        ? ' It is finesse, and your Dexterity is higher, so it uses Dexterity.'
        : ' Martial Arts lets a Monk use Dexterity with it.'
      : ' It could use Dexterity, but your Strength is higher.';

  let loadout: Loadout;
  let reason: string;

  if (mainHand.polearm && mainHand.properties.includes('two-handed')) {
    loadout = 'polearm';
    reason = `${mainHand.name} is one of the weapons Polearm Master works with.`;
  } else if (mainHand.properties.includes('two-handed')) {
    loadout = 'two-handed';
    reason = `${mainHand.name} is two-handed.`;
  } else if (shield) {
    // The shield lives on the defenses group and occupies the off hand.
    loadout = 'sword-and-board';
    reason = `${mainHand.name} in one hand and a shield in the other.`;
  } else if (offHand) {
    loadout = 'dual-wield';
    reason = `${mainHand.name} and ${offHand.name}, one in each hand.`;
  } else {
    loadout = 'none';
    reason = `${mainHand.name} in one hand, with the other empty.`;
  }

  return { mainHand, offHand, shield, style, loadout, why: reason + finesseNote };
}

// ---------------------------------------------------------------- migration

/**
 * The weapon that best represents an old hand-set combat profile.
 *
 * Before weapons existed a character declared a style and a loadout directly.
 * Migrating those to a weapon is what lets the derivation be checked: the six
 * regression snapshots pin derived output for builds whose profile was set by
 * hand, so if this mapping plus the derivation above disagree with what a
 * player told the app, a fingerprint moves.
 */
export function weaponForProfile(
  style: WeaponStyle,
  loadout: Loadout,
): { mainHandId?: string; offHandId?: string } {
  if (style === 'spell' || style === 'unarmed') return {};

  if (style === 'dex-ranged' || loadout === 'ranged') {
    return { mainHandId: 'longbow' };
  }

  switch (loadout) {
    case 'polearm':
      return { mainHandId: 'glaive' };
    case 'two-handed':
      return { mainHandId: style === 'dex-melee' ? 'quarterstaff' : 'greatsword' };
    case 'dual-wield':
      return style === 'dex-melee'
        ? { mainHandId: 'shortsword', offHandId: 'shortsword' }
        : { mainHandId: 'handaxe', offHandId: 'handaxe' };
    case 'sword-and-board':
      return { mainHandId: style === 'dex-melee' ? 'rapier' : 'longsword' };
    default:
      return { mainHandId: style === 'dex-melee' ? 'rapier' : 'longsword' };
  }
}

/** Weapons a class is proficient with, best first, for equipping a fresh build. */
export function bestWeaponFor(
  style: WeaponStyle,
  proficient: (w: Weapon) => boolean,
  ruleset: Ruleset = '2014',
): string | undefined {
  const wants = (weapon: Weapon): boolean => {
    if (style === 'dex-ranged') return !weapon.melee && !weapon.properties.includes('loading');
    if (style === 'dex-melee') return weapon.melee && weapon.properties.includes('finesse');
    if (style === 'str-melee') return weapon.melee && !weapon.properties.includes('finesse');
    return false;
  };
  const candidates = weaponsFor(ruleset).filter((w) => wants(w) && proficient(w));
  if (!candidates.length) return undefined;
  // Best average damage wins, which is a good enough proxy for "best weapon".
  return candidates.reduce((a, b) => (average(b) > average(a) ? b : a)).id;
}

function average(weapon: Weapon): number {
  return weapon.damage.count * ((weapon.damage.die + 1) / 2);
}

/** Whether this build has a Monk's Martial Arts, for the unarmed default. */
export function fightsUnarmed(features: HeldFeature[], build: Build): boolean {
  return (
    features.some((f) => f.name === 'Martial Arts') ||
    build.classOptionIds.includes('unarmed-fighting') ||
    hasFeatureTag(features, 'unarmored-defense')
  );
}

// ------------------------------------------------------------------ attacks

export interface Attack {
  weapon: Weapon;
  hand: 'main' | 'off';
  ability: Ability;
  toHit: number;
  damage: { dice: string; bonus: number; type: string };
  /** Itemised, the way the AC calculation is - no number is just asserted. */
  toHitLines: Line[];
  damageLines: Line[];
  notes: string[];
  problems: string[];
  proficient: boolean;
}

export interface AttackInput {
  build: Build;
  loadouts: Loadouts;
  mods: Record<Ability, number>;
  proficiency: number;
  featIds: Set<string>;
  proficiencies: { categories: Set<WeaponCategory>; specific: Set<string> };
  isMonk: boolean;
  hasExtraAttack: boolean;
  /**
   * The best weapon bonus from an attuned magic item. Taken as the higher of
   * this and any bonus typed against the weapon itself, rather than added to
   * it - a +1 sword and a "+1" typed by hand are the same sword.
   */
  itemWeaponBonus?: number;
  /**
   * A bonus carried by magic *ammunition*, which reaches only a weapon that
   * fires some. Kept apart from `itemWeaponBonus` so a quiver of +3 arrows
   * cannot improve the greatsword on your back.
   */
  itemAmmunitionBonus?: number;
  /**
   * Shillelagh, when the character has it recorded, with the ability it swaps
   * in. Applied without a toggle: it is a cantrip lasting a minute and costing
   * no concentration, so a Druid holding a club has always cast it. The attack
   * line says so rather than assuming it silently.
   */
  shillelagh?: { ability: Ability };
}

/** The two weapons Shillelagh names. Nothing else qualifies. */
const SHILLELAGH_WEAPONS = ['club', 'quarterstaff'];

/**
 * What you roll to hit and what you roll for damage, for each weapon in hand.
 *
 * Reads what the earlier phases built: weapon proficiency from the class lists,
 * fighting styles from the class options, and riders from the feats. The
 * off-hand rule is the one most sheets get wrong - the bonus-action attack
 * carries no ability modifier unless Two-Weapon Fighting is taken.
 */
export function computeAttacks(input: AttackInput): Attack[] {
  const { loadouts } = input;
  const attacks: Attack[] = [];
  if (loadouts.mainHand) attacks.push(oneAttack(loadouts.mainHand, 'main', input));
  // A two-handed main hand leaves no hand for an off-hand weapon.
  if (loadouts.offHand && loadouts.mainHand && !isTwoHanded(loadouts.mainHand) && !loadouts.shield) {
    attacks.push(oneAttack(loadouts.offHand, 'off', input));
  }
  return attacks;
}

function oneAttack(weapon: Weapon, hand: 'main' | 'off', input: AttackInput): Attack {
  const { build, mods, proficiency, featIds, proficiencies, isMonk, hasExtraAttack } = input;
  const itemWeaponBonus = input.itemWeaponBonus ?? 0;
  const itemAmmunitionBonus = input.itemAmmunitionBonus ?? 0;
  const options = new Set(build.classOptionIds);
  const toHitLines: Line[] = [];
  const damageLines: Line[] = [];
  const notes: string[] = [];
  const problems: string[] = [];

  // --- which ability ---------------------------------------------------------
  const canUseDex =
    !weapon.melee || weapon.properties.includes('finesse') || (isMonk && isMonkWeapon(weapon));

  /*
    Shillelagh replaces the ability outright rather than competing with it: a
    Druid's club attacks on Wisdom whether or not their Strength is better.
    It is computed here, on the attack line, rather than in the damage model -
    putting it there alone would leave this table saying 1d4 and Strength while
    the curve below it assumed 1d8 and Wisdom, which is the number disagreeing
    with its own explanation.
  */
  const shillelagh =
    input.shillelagh && weapon.melee && SHILLELAGH_WEAPONS.includes(weapon.id)
      ? input.shillelagh
      : undefined;

  const ability: Ability = shillelagh
    ? shillelagh.ability
    : !weapon.melee
      ? 'dex'
      : canUseDex && mods.dex > mods.str
        ? 'dex'
        : 'str';

  let toHit = mods[ability];
  toHitLines.push({
    label: shillelagh
      ? `${ability.toUpperCase()} modifier (Shillelagh)`
      : `${ability.toUpperCase()} modifier`,
    value: mods[ability],
  });

  // --- proficiency -----------------------------------------------------------
  const proficient = isProficientWithLocal(weapon, proficiencies);
  if (proficient) {
    toHit += proficiency;
    toHitLines.push({ label: 'Proficiency bonus', value: proficiency });
  } else {
    problems.push(
      `Not proficient with ${weapon.name.toLowerCase()}: you add no proficiency bonus to the attack.`,
    );
  }

  // --- magic -----------------------------------------------------------------
  /*
    A weapon's own bonus and its ammunition's do not stack - the SRD's +1
    arrow is +1 to that shot, not +1 on top of a +1 bow - so the better of the
    two applies, the same way two sources of a weapon bonus already do. And
    ammunition only reaches a weapon that fires it: `weapon.ammo` is the field
    that already tells the quiver which weapon eats from it.
  */
  const ammunition = weapon.ammo ? itemAmmunitionBonus : 0;
  const magic = Math.max(build.weapons.magicBonus[weapon.id] ?? 0, itemWeaponBonus, ammunition);
  if (magic) {
    toHit += magic;
    toHitLines.push({
      label: magic === ammunition && magic > itemWeaponBonus
        ? `Magic ammunition +${magic}`
        : `Magic weapon +${magic}`,
      value: magic,
    });
  }

  // --- fighting styles -------------------------------------------------------
  if (options.has('archery') && !weapon.melee) {
    toHit += 2;
    toHitLines.push({ label: 'Archery fighting style', value: 2 });
  }

  // --- damage ----------------------------------------------------------------
  // Versatile only pays out when the other hand is free.
  const twoHandedGrip =
    !!weapon.versatileDie && hand === 'main' && !input.loadouts.offHand && !input.loadouts.shield;
  // Shillelagh sets the die to a d8 outright. A quarterstaff held in two hands
  // is already there, so it changes nothing but the ability; a club goes from
  // a d4, which is most of the point.
  const dice = shillelagh ? '1d8' : damageDice(weapon, twoHandedGrip);
  if (shillelagh) {
    notes.push(
      `Shillelagh: this ${weapon.name.toLowerCase()} deals 1d8 and attacks on ${ability.toUpperCase()}, and counts as magical.`,
    );
  } else if (twoHandedGrip) {
    notes.push(`Held in two hands, so the damage die is a d${weapon.versatileDie}.`);
  }

  let bonus = 0;
  // The off-hand attack does not add the ability modifier without the style.
  const offHandGetsModifier = hand === 'off' && options.has('two-weapon-fighting');
  if (hand === 'main' || offHandGetsModifier) {
    bonus += mods[ability];
    damageLines.push({ label: `${ability.toUpperCase()} modifier`, value: mods[ability] });
  } else {
    notes.push(
      'The off-hand attack adds no ability modifier to damage. The Two-Weapon Fighting style would change that.',
    );
  }
  if (magic) {
    bonus += magic;
    damageLines.push({ label: `Magic weapon +${magic}`, value: magic });
  }
  if (options.has('dueling') && weapon.melee && !isTwoHanded(weapon) && !input.loadouts.offHand) {
    bonus += 2;
    damageLines.push({ label: 'Duelling fighting style', value: 2 });
  }
  if (options.has('thrown-weapon-fighting') && weapon.properties.includes('thrown')) {
    bonus += 2;
    damageLines.push({ label: 'Thrown Weapon Fighting style', value: 2 });
  }
  if (options.has('great-weapon-fighting') && (isTwoHanded(weapon) || weapon.versatileDie)) {
    notes.push('Great Weapon Fighting: reroll 1s and 2s on the damage dice.');
  }

  // --- feats -----------------------------------------------------------------
  if (featIds.has('great-weapon-master') && weapon.properties.includes('heavy') && weapon.melee) {
    notes.push('Great Weapon Master: you may take −5 to hit for +10 damage.');
  }
  if (featIds.has('sharpshooter') && !weapon.melee) {
    notes.push('Sharpshooter: you may take −5 to hit for +10 damage, and long range costs nothing.');
  }
  if (featIds.has('polearm-master') && weapon.polearm) {
    notes.push('Polearm Master: a bonus-action attack with the butt end for 1d4.');
  }
  if (featIds.has('crossbow-expert') && weapon.id === 'hand-crossbow') {
    notes.push('Crossbow Expert: a bonus-action shot, and no disadvantage in melee.');
  }
  if (hasExtraAttack && hand === 'main') {
    notes.push('Extra Attack: this attack is made more than once on your turn.');
  }
  if (weapon.properties.includes('loading') && hasExtraAttack) {
    problems.push(
      `${weapon.name} has the Loading property: one shot per action, so Extra Attack does nothing with it.`,
    );
  }

  return {
    weapon,
    hand,
    ability,
    toHit,
    damage: { dice, bonus, type: weapon.damage.type },
    toHitLines,
    damageLines,
    notes,
    problems,
    proficient,
  };
}

function isProficientWithLocal(
  weapon: Weapon,
  proficiencies: { categories: Set<WeaponCategory>; specific: Set<string> },
): boolean {
  return proficiencies.categories.has(weapon.category) || proficiencies.specific.has(weapon.id);
}

// ----------------------------------------------------------- weapon mastery

export interface MasterySuggestion {
  weapon: Weapon;
  mastery: MasteryProperty;
  label: string;
  summary: string;
  score: number;
  why: string;
  taken: boolean;
  /** You only get mastery with weapons you are proficient with. */
  eligible: boolean;
}

/**
 * How many weapons this character has mastery with. 2024 only - the feature
 * does not exist in 2014.
 */
export function masterySlots(
  slices: { klass: { masteries?: { level: number; count: number }[] }; entry: { level: number } }[],
  ruleset: string,
): number {
  if (ruleset !== '2024') return 0;
  return slices.reduce(
    (sum, slice) =>
      sum +
      (slice.klass.masteries ?? [])
        .filter((m) => slice.entry.level >= m.level)
        .reduce((n, m) => n + m.count, 0),
    0,
  );
}

/**
 * Which mastery properties suit this build. Vex and Topple are the strong
 * generic picks - advantage on your next attack, and knocking a target prone
 * for everyone else - so they lead unless the build wants something specific.
 */
const MASTERY_VALUE: Record<MasteryProperty, { value: number; why: string }> = {
  vex: { value: 9, why: 'Advantage on your next attack, which is the most reliable damage boost on the list.' },
  topple: { value: 9, why: 'Prone gives every melee attacker advantage, and costs the target half its movement to stand.' },
  graze: { value: 6, why: 'Damage on a miss, which smooths out a build that swings hard and misses often.' },
  cleave: { value: 6, why: 'A second attack when enemies are packed together.' },
  sap: { value: 6, why: "Disadvantage on the target's next attack is a defensive tax on every hit." },
  push: { value: 4, why: 'Forced movement, which is worth more with a controller in the party.' },
  slow: { value: 4, why: 'Cutting speed keeps a melee threat off your casters.' },
  nick: { value: 7, why: 'Folds the off-hand attack into the Attack action, freeing your bonus action.' },
};

export function recommendMasteries(
  build: Build,
  proficiencies: { categories: Set<WeaponCategory>; specific: Set<string> },
  style: WeaponStyle,
): MasterySuggestion[] {
  const suits = (weapon: Weapon): boolean => {
    if (style === 'dex-ranged') return !weapon.melee;
    if (style === 'dex-melee') return weapon.melee && weapon.properties.includes('finesse');
    if (style === 'str-melee') return weapon.melee;
    return true;
  };

  return weaponsFor(build.ruleset)
    .filter((w) => w.mastery)
    .map((weapon) => {
      const mastery = weapon.mastery!;
      const base = MASTERY_VALUE[mastery];
      const fits = suits(weapon);
      const equipped =
        weapon.id === build.weapons.mainHandId || weapon.id === build.weapons.offHandId;
      return {
        weapon,
        mastery,
        label: MASTERY_LABELS[mastery],
        summary: MASTERY_SUMMARIES[mastery],
        score: base.value + (equipped ? 4 : 0) + (fits ? 1 : -3),
        why: equipped
          ? `You are carrying this. ${base.why}`
          : fits
            ? base.why
            : `${base.why} This weapon does not suit your attack style, though.`,
        taken: build.masteryIds.includes(weapon.id),
        eligible: isProficientWithLocal(weapon, proficiencies),
      };
    })
    .sort(
      (a, b) =>
        Number(a.taken) - Number(b.taken) ||
        Number(b.eligible) - Number(a.eligible) ||
        b.score - a.score ||
        a.weapon.name.localeCompare(b.weapon.name),
    );
}
