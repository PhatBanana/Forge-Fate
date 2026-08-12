import type { Ability, SightGrant } from '../types';
import type { ArmorCategory } from './armor';

/**
 * The magic item catalogue.
 *
 * It used to hold only the items that changed a number the engine computes,
 * on the grounds that a Bag of Holding moves nothing. That was the right call
 * while there was nowhere to write a Bag of Holding down; now that a character
 * has an inventory it is just a gap, and "the app has never heard of a Deck of
 * Many Things" is a worse answer than listing it.
 *
 * So the catalogue is the whole Player's Handbook list, and `effect` is what
 * splits it. An item with one moves your armor class, your attack line, your
 * save DC or an ability score, and the sheet can trace the number back to it.
 * An item without one is recorded, printed and attuned exactly as the others
 * are - the app simply does not claim to compute what it does, which is the
 * honest position for a Deck of Many Things.
 *
 * Effects are declared as data rather than code for the same reason the feat
 * and resource tables are: a wrong number is a visible edit, and the character
 * sheet can explain where a bonus came from.
 */

export type ItemSlot =
  /** Applies to the weapon you are holding. */
  | 'weapon'
  /** Body armor, and so only when armor is worn. */
  | 'armor'
  | 'shield'
  /** Worn or carried; the catch-all for rings, cloaks, amulets and boots. */
  | 'wondrous';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'very-rare' | 'legendary' | 'artifact';

/** How the catalogue is grouped, which is how the books group it. */
export type ItemKind =
  | 'armor'
  | 'potion'
  | 'ring'
  | 'rod'
  | 'scroll'
  | 'staff'
  | 'wand'
  | 'weapon'
  | 'wondrous';

export const KIND_LABELS: Record<ItemKind, string> = {
  armor: 'Armor and shields',
  potion: 'Potions and oils',
  ring: 'Rings',
  rod: 'Rods',
  scroll: 'Scrolls',
  staff: 'Staffs',
  wand: 'Wands',
  weapon: 'Weapons',
  wondrous: 'Wondrous items',
};

export const KIND_ORDER: ItemKind[] = [
  'weapon',
  'armor',
  'wondrous',
  'ring',
  'staff',
  'wand',
  'rod',
  'potion',
  'scroll',
];

export interface ItemEffect {
  /** What wearing it does to your eyes: Goggles of Night and its kind. */
  sight?: SightGrant;
  /** Flat armor class, over and above what your armor gives. */
  ac?: number;
  /** Saving throws, which several protective items grant alongside AC. */
  saves?: number;
  /** Attack and damage with the weapon this is. */
  weaponBonus?: number;
  /** Spell attack rolls and save DC, from a rod, staff or holy symbol. */
  spellBonus?: number;
  /** Ability checks, which is a different thing from saves. */
  abilityChecks?: number;
  /**
   * Sets a score to a fixed value, and does nothing if yours is already
   * higher - Headband of Intellect, Belt of Giant Strength.
   */
  setAbility?: { ability: Ability; score: number };
  /** A straight increase, which stacks with your own score. */
  abilityBonus?: Partial<Record<Ability, number>>;
  /**
   * The ceiling an increase cannot pass. An Ioun Stone raises a score by 2 but
   * never above 20, which is a different rule from the usual cap of 30.
   */
  abilityBonusCap?: number;
  /** Walking speed, in feet. */
  speed?: number;
  /**
   * Extra damage the weapon deals, for the damage model.
   *
   * Only for riders that apply against anything - a Flame Tongue burns
   * whatever it hits. The ones that trigger on a creature type, like a Dragon
   * Slayer's 3d6, are deliberately absent: folding them into a curve would
   * quietly assume every fight is against a dragon. Those keep a `note`.
   */
  damageRider?: {
    /** "2d6", or omitted where the item deals a flat amount. */
    dice?: string;
    flat?: number;
    type: string;
    /** Every hit, or only a critical - a Vicious Weapon is crit-only. */
    when: 'hit' | 'crit';
  };
  /**
   * An extra attack the weapon itself grants, over what the class gives. The
   * Scimitar of Speed's bonus action is the only one in the catalogue.
   */
  extraAttack?: 'bonus';
  /**
   * A bonus that rides on the *ammunition* rather than the weapon.
   *
   * Kept apart from `weaponBonus` because it only applies to a weapon that
   * fires it. Folding it in would give a greatsword +3 for the arrows in your
   * pack, which is the sort of quietly wrong number this app exists to avoid.
   */
  ammunitionBonus?: number;
  /**
   * What the material does to the armor it is made of.
   *
   * Mithral is the only entry: it removes the Stealth disadvantage and the
   * Strength requirement from whatever armor it is. Both are things the
   * defence model already computes, so this is a correction to a number the
   * app was getting wrong rather than a new one.
   */
  armorTraits?: { noStealthDisadvantage?: boolean; noStrengthRequirement?: boolean };
}

export interface MagicItem {
  id: string;
  name: string;
  /** How the catalogue groups it. */
  kind: ItemKind;
  slot: ItemSlot;
  rarity: Rarity;
  attunement: boolean;
  summary: string;
  effect?: ItemEffect;
  /**
   * What happens when you consume it, for the things you consume.
   *
   * Kept apart from `effect` on purpose. `effect` means "this changes a number
   * on your sheet for as long as you carry it" and is what the app counts when
   * it says how many items it computes. A potion changes nothing until you
   * drink it and nothing afterwards either, so folding the two together would
   * make that count say something it does not mean.
   *
   * Only `heals` so far, because restoring hit points is the one potion effect
   * this app has somewhere to put. A Potion of Speed's haste, a Potion of Giant
   * Strength's score, and every scroll's spell need a *timed effect* the app
   * does not model - so those are consumed and logged, and what they do is left
   * to the description and the table.
   */
  use?: { heals?: string };
  /** Bracers of Defense only work with no armor and no shield. */
  requires?: { noArmor?: boolean; noShield?: boolean; armorCategory?: ArmorCategory[] };
  note?: string;
}

const plusWeapon = (n: number, rarity: Rarity): MagicItem => ({
  id: `weapon-plus-${n}`,
  name: `+${n} Weapon`,
  kind: 'weapon',
  slot: 'weapon',
  rarity,
  attunement: false,
  summary: `+${n} to attack and damage rolls with this weapon.`,
  effect: { weaponBonus: n },
});

const plusArmor = (n: number, rarity: Rarity): MagicItem => ({
  id: `armor-plus-${n}`,
  name: `+${n} Armor`,
  kind: 'armor',
  slot: 'armor',
  rarity,
  attunement: false,
  summary: `+${n} armor class while wearing this armor.`,
  effect: { ac: n },
});

const plusShield = (n: number, rarity: Rarity): MagicItem => ({
  id: `shield-plus-${n}`,
  name: `+${n} Shield`,
  kind: 'armor',
  slot: 'shield',
  rarity,
  attunement: false,
  summary: `+${n} armor class while holding this shield.`,
  effect: { ac: n },
});


/**
 * Terse constructor for the bulk of the catalogue. Most entries are a name, a
 * rarity, whether they need attunement and a line about what they do; spelling
 * out an object literal for two hundred of those would bury the six fields
 * that vary in the twelve that do not.
 */
function m(
  id: string,
  name: string,
  kind: ItemKind,
  rarity: Rarity,
  attunement: boolean,
  summary: string,
  extra: Partial<MagicItem> = {},
): MagicItem {
  const slot: ItemSlot =
    kind === 'weapon' ? 'weapon' : kind === 'armor' ? 'armor' : 'wondrous';
  return { id, name, kind, slot, rarity, attunement, summary, ...extra };
}

export const MAGIC_ITEMS: MagicItem[] = [
  // ------------------------------------------------------ the plain plusses
  plusWeapon(1, 'uncommon'),
  plusWeapon(2, 'rare'),
  plusWeapon(3, 'very-rare'),
  plusArmor(1, 'rare'),
  plusArmor(2, 'very-rare'),
  plusArmor(3, 'legendary'),
  plusShield(1, 'uncommon'),
  plusShield(2, 'rare'),
  plusShield(3, 'very-rare'),
  // Ammunition carries no effect: the bonus belongs to the arrow rather than
  // the bow, and it is spent the moment it hits. Recording a permanent bonus
  // for a consumable would overstate every character carrying a quiver.
  m('ammunition-plus-1', '+1 Ammunition', 'weapon', 'uncommon', false, '+1 to attack and damage with this piece of ammunition, until it hits something.', { effect: { ammunitionBonus: 1 } }),
  m('ammunition-plus-2', '+2 Ammunition', 'weapon', 'rare', false, '+2 to attack and damage with this piece of ammunition, until it hits something.', { effect: { ammunitionBonus: 2 } }),
  m('ammunition-plus-3', '+3 Ammunition', 'weapon', 'very-rare', false, '+3 to attack and damage with this piece of ammunition, until it hits something.', { effect: { ammunitionBonus: 3 } }),

  // --------------------------------------------------------------- defence
  {
    id: 'cloak-of-protection',
    name: 'Cloak of Protection',
    kind: 'wondrous',
    slot: 'wondrous',
    rarity: 'uncommon',
    attunement: true,
    summary: '+1 to armor class and to all saving throws.',
    effect: { ac: 1, saves: 1 },
    note: 'Does not stack usefully with a Ring of Protection - the two do the same job, and most tables let you wear both for +2 total. The app adds them; check with your DM.',
  },
  {
    id: 'ring-of-protection',
    name: 'Ring of Protection',
    kind: 'wondrous',
    slot: 'wondrous',
    rarity: 'rare',
    attunement: true,
    summary: '+1 to armor class and to all saving throws.',
    effect: { ac: 1, saves: 1 },
  },
  {
    id: 'bracers-of-defense',
    name: 'Bracers of Defense',
    kind: 'wondrous',
    slot: 'wondrous',
    rarity: 'rare',
    attunement: true,
    summary: '+2 armor class while wearing no armor and holding no shield.',
    effect: { ac: 2 },
    requires: { noArmor: true, noShield: true },
    note: 'A Monk, Barbarian or unarmoured Sorcerer only. Put on armor and it does nothing.',
  },
  {
    id: 'amulet-of-health',
    name: 'Amulet of Health',
    kind: 'wondrous',
    slot: 'wondrous',
    rarity: 'rare',
    attunement: true,
    summary: 'Your Constitution becomes 19.',
    effect: { setAbility: { ability: 'con', score: 19 } },
    note: 'Nothing if your Constitution is already 19 or higher, and the hit points it grants apply retroactively to every level.',
  },
  {
    id: 'stone-of-good-luck',
    name: 'Stone of Good Luck (Luckstone)',
    kind: 'wondrous',
    slot: 'wondrous',
    rarity: 'uncommon',
    attunement: true,
    summary: '+1 to ability checks and saving throws.',
    effect: { saves: 1, abilityChecks: 1 },
    note: 'One of the best uncommon items in the game: it touches every skill check you will ever make.',
  },

  // --------------------------------------------------------- ability scores
  {
    id: 'headband-of-intellect',
    name: 'Headband of Intellect',
    kind: 'wondrous',
    slot: 'wondrous',
    rarity: 'uncommon',
    attunement: true,
    summary: 'Your Intelligence becomes 19.',
    effect: { setAbility: { ability: 'int', score: 19 } },
  },
  {
    id: 'gauntlets-of-ogre-power',
    name: 'Gauntlets of Ogre Power',
    kind: 'wondrous',
    slot: 'wondrous',
    rarity: 'uncommon',
    attunement: true,
    summary: 'Your Strength becomes 19.',
    effect: { setAbility: { ability: 'str', score: 19 } },
  },
  {
    id: 'amulet-of-the-devout-1',
    name: 'Amulet of the Devout +1',
    kind: 'wondrous',
    slot: 'wondrous',
    rarity: 'uncommon',
    attunement: true,
    summary: '+1 to spell attack rolls and spell save DC.',
    effect: { spellBonus: 1 },
  },
  {
    id: 'amulet-of-the-devout-2',
    name: 'Amulet of the Devout +2',
    kind: 'wondrous',
    slot: 'wondrous',
    rarity: 'rare',
    attunement: true,
    summary: '+2 to spell attack rolls and spell save DC.',
    effect: { spellBonus: 2 },
  },
  {
    id: 'rod-of-the-pact-keeper-1',
    name: 'Rod of the Pact Keeper +1',
    kind: 'wondrous',
    slot: 'wondrous',
    rarity: 'uncommon',
    attunement: true,
    summary: '+1 to spell attack rolls and spell save DC, and regain a Pact Magic slot on a short rest.',
    effect: { spellBonus: 1 },
  },
  {
    id: 'rod-of-the-pact-keeper-2',
    name: 'Rod of the Pact Keeper +2',
    kind: 'wondrous',
    slot: 'wondrous',
    rarity: 'rare',
    attunement: true,
    summary: '+2 to spell attack rolls and spell save DC, and regain a Pact Magic slot on a short rest.',
    effect: { spellBonus: 2 },
  },
  {
    id: 'wand-of-the-war-mage-1',
    name: 'Wand of the War Mage +1',
    kind: 'wondrous',
    slot: 'wondrous',
    rarity: 'uncommon',
    attunement: true,
    summary: '+1 to spell attack rolls, and you ignore half cover.',
    effect: { spellBonus: 1 },
    note: 'Attack rolls only - unlike an Amulet of the Devout, it does not raise your save DC.',
  },

  // ---------------------------------------------------------------- movement
  {
    id: 'boots-of-speed',
    name: 'Boots of Speed',
    kind: 'wondrous',
    slot: 'wondrous',
    rarity: 'rare',
    attunement: true,
    summary: 'Double your walking speed for up to 10 minutes a day.',
    note: 'The doubling is a limited daily effect rather than a permanent one, so it is not added to your speed here.',
  },
  {
    id: 'winged-boots',
    name: 'Winged Boots',
    kind: 'wondrous',
    slot: 'wondrous',
    rarity: 'uncommon',
    attunement: true,
    summary: 'A flying speed equal to your walking speed, for up to four hours a day.',
  },
  {
    id: 'ring-of-free-action',
    name: 'Ring of Free Action',
    kind: 'wondrous',
    slot: 'wondrous',
    rarity: 'rare',
    attunement: true,
    summary: 'Difficult terrain costs nothing, and you cannot be paralysed or restrained by magic.',
    note: 'Answers the conditions that otherwise take a martial character out of a fight entirely.',
  },

  // ----------------------------------------------------------------- stealth
  {
    id: 'cloak-of-elvenkind',
    name: 'Cloak of Elvenkind',
    kind: 'wondrous',
    slot: 'wondrous',
    rarity: 'uncommon',
    attunement: true,
    summary: 'Advantage on Stealth checks, and disadvantage on Perception to see you.',
  },
  {
    id: 'boots-of-elvenkind',
    name: 'Boots of Elvenkind',
    kind: 'wondrous',
    slot: 'wondrous',
    rarity: 'uncommon',
    attunement: false,
    summary: 'Advantage on Stealth checks made to move silently.',
  },
  {
    id: 'cloak-of-displacement',
    name: 'Cloak of Displacement',
    kind: 'wondrous',
    slot: 'wondrous',
    rarity: 'rare',
    attunement: true,
    summary: 'Attacks against you have disadvantage, until you take damage.',
    note: 'Effectively the best defensive item at its rarity, but it switches off for a round each time you are hit.',
  },

  // ======================================================= weapons
  m('berserker-axe', 'Berserker Axe', 'weapon', 'rare', true, '+1 to attack and damage, and your hit point maximum rises by 1 each time you level. It also makes you attack the nearest creature when you take damage.', { effect: { weaponBonus: 1 } }),
  m('dagger-of-venom', 'Dagger of Venom', 'weapon', 'rare', false, '+1 to attack and damage, and once a day it coats itself in poison for 2d10 extra damage.', { effect: { weaponBonus: 1 } }),
  m('dancing-sword', 'Dancing Sword', 'weapon', 'very-rare', true, 'A bonus action sends it flying to attack on its own for up to four rounds.'),
  m('defender', 'Defender', 'weapon', 'legendary', true, '+3 to split as you like each turn between attack rolls and armor class.', { effect: { weaponBonus: 3 }, note: 'The app counts the whole +3 on attacks. Moving some of it to armor class is a turn-by-turn choice the model cannot make for you.' }),
  m('dragon-slayer', 'Dragon Slayer', 'weapon', 'rare', false, '+1 to attack and damage, and 3d6 extra against dragons.', { effect: { weaponBonus: 1 } }),
  m('dwarven-thrower', 'Dwarven Thrower', 'weapon', 'very-rare', true, '+3 warhammer that returns when thrown, with extra damage against giants. Dwarves only.', { effect: { weaponBonus: 3 } }),
  m('flame-tongue', 'Flame Tongue', 'weapon', 'rare', true, 'A bonus action sets it alight for 2d6 extra fire damage.', { effect: { damageRider: { dice: '2d6', type: 'fire', when: 'hit' } }, note: 'The damage model assumes the blade is lit, which costs a bonus action on the first turn of a fight.' }),
  m('frost-brand', 'Frost Brand', 'weapon', 'very-rare', true, '1d6 extra cold damage, resistance to fire, and it sheds light in the cold.', { effect: { damageRider: { dice: '1d6', type: 'cold', when: 'hit' } } }),
  m('giant-slayer', 'Giant Slayer', 'weapon', 'rare', false, '+1 to attack and damage, and 2d6 extra against giants.', { effect: { weaponBonus: 1 } }),
  m('hammer-of-thunderbolts', 'Hammer of Thunderbolts', 'weapon', 'legendary', true, '+1 maul, and with a belt and gauntlets of giant strength it kills giants outright.', { effect: { weaponBonus: 1 } }),
  m('holy-avenger', 'Holy Avenger', 'weapon', 'legendary', true, '+3 to attack and damage, 2d10 extra against fiends and undead, and an aura granting the party advantage on saves against magic. Paladins only.', { effect: { weaponBonus: 3 } }),
  m('javelin-of-lightning', 'Javelin of Lightning', 'weapon', 'uncommon', false, 'Thrown, it becomes a bolt of lightning for 4d6 to everything in a line.'),
  m('luck-blade', 'Luck Blade', 'weapon', 'legendary', true, '+1 to attack and damage, +1 to all saving throws, and a reroll once a day.', { effect: { weaponBonus: 1, saves: 1 } }),
  m('mace-of-disruption', 'Mace of Disruption', 'weapon', 'rare', true, '2d6 extra against fiends and undead, and it can destroy them outright at low hit points.'),
  m('mace-of-smiting', 'Mace of Smiting', 'weapon', 'rare', false, '+1 to attack and damage, +3 against constructs, and critical hits against objects are devastating.', { effect: { weaponBonus: 1 } }),
  m('mace-of-terror', 'Mace of Terror', 'weapon', 'rare', true, 'Three charges a day to frighten everything within 30 feet.'),
  m('nine-lives-stealer', 'Nine Lives Stealer', 'weapon', 'very-rare', true, '+2 to attack and damage, and a critical hit can kill outright.', { effect: { weaponBonus: 2 } }),
  m('oathbow', 'Oathbow', 'weapon', 'very-rare', true, 'Name a sworn enemy for 3d6 extra damage against them, at the cost of disadvantage against everyone else.'),
  m('scimitar-of-speed', 'Scimitar of Speed', 'weapon', 'very-rare', true, '+2 to attack and damage, and one extra attack as a bonus action every turn.', { effect: { weaponBonus: 2, extraAttack: 'bonus' } }),
  m('sun-blade', 'Sun Blade', 'weapon', 'rare', true, '+2 longsword of pure radiance, with extra damage to undead and sunlight for 30 feet.', { effect: { weaponBonus: 2 } }),
  m('sword-of-life-stealing', 'Sword of Life Stealing', 'weapon', 'rare', true, 'On a natural 20, 3d6 extra necrotic and the same number back as temporary hit points.', { effect: { damageRider: { dice: '3d6', type: 'necrotic', when: 'crit' } }, note: 'The SRD exempts constructs and undead, so the curve is a slight overstatement against those two.' }),
  m('sword-of-sharpness', 'Sword of Sharpness', 'weapon', 'very-rare', true, 'Maximum damage on a hit against an object, and a natural 20 can sever a limb.'),
  m('sword-of-wounding', 'Sword of Wounding', 'weapon', 'rare', true, 'Wounds keep bleeding, and cannot be healed until the target passes a save.'),
  m('trident-of-fish-command', 'Trident of Fish Command', 'weapon', 'uncommon', true, 'Three charges a day of dominate beast, against creatures that swim.'),
  m('arrow-of-slaying', 'Arrow of Slaying', 'weapon', 'very-rare', false, 'Against the one kind of creature it was made for, 6d10 extra piercing on a hit, halved on a Constitution save. Then it becomes an ordinary arrow.'),
  m('vicious-weapon', 'Vicious Weapon', 'weapon', 'rare', false, 'On a natural 20, 7 extra damage of the weapon\'s type.', { effect: { damageRider: { flat: 7, type: "the weapon's own", when: 'crit' } } }),
  m('vorpal-sword', 'Vorpal Sword', 'weapon', 'legendary', true, '+3 to attack and damage, and a natural 20 takes the head off anything with one.', { effect: { weaponBonus: 3 } }),
  m('weapon-of-warning', 'Weapon of Warning', 'weapon', 'uncommon', true, 'You cannot be surprised, and you and your companions roll initiative with advantage.'),

  // ======================================================= armor and shields
  m('adamantine-armor', 'Adamantine Armor', 'armor', 'uncommon', false, 'Critical hits against you become ordinary hits.', { note: 'Not an armor class bonus, but it removes the spikes from incoming damage.' }),
  m('animated-shield', 'Animated Shield', 'armor', 'very-rare', true, 'A bonus action sets it floating to protect you, leaving both hands free for a minute.', { slot: 'shield' }),
  m('armor-of-invulnerability', 'Armor of Invulnerability', 'armor', 'legendary', true, 'Resistance to nonmagical damage, and total immunity for ten minutes a day.'),
  m('armor-of-resistance', 'Armor of Resistance', 'armor', 'rare', true, 'Resistance to one damage type of the armor\'s kind.'),
  m('armor-of-vulnerability', 'Armor of Vulnerability', 'armor', 'rare', true, 'Resistance to one damage type and vulnerability to the other two. Cursed.'),
  m('arrow-catching-shield', 'Arrow-Catching Shield', 'armor', 'rare', true, '+2 armor class against ranged attacks, and attacks aimed at nearby allies redirect to you.', { slot: 'shield', note: 'Against ranged attacks only, so it is not added to your armor class here.' }),
  m('demon-armor', 'Demon Armor', 'armor', 'very-rare', true, '+1 plate with clawed gauntlets, at the cost of being charmed by demons. Cursed.', { effect: { ac: 1 } }),
  m('dragon-scale-mail', 'Dragon Scale Mail', 'armor', 'very-rare', true, '+1 scale mail with resistance to the dragon\'s damage type, and it senses that kind of dragon.', { effect: { ac: 1 } }),
  m('dragon-scale-mail-black', 'Black Dragon Scale Mail', 'armor', 'very-rare', true, '+1 scale mail, resistance to acid damage, and once a day you can sense the nearest black dragon within 30 miles.', { effect: { ac: 1 } }),
  m('dragon-scale-mail-blue', 'Blue Dragon Scale Mail', 'armor', 'very-rare', true, '+1 scale mail, resistance to lightning damage, and once a day you can sense the nearest blue dragon within 30 miles.', { effect: { ac: 1 } }),
  m('dragon-scale-mail-brass', 'Brass Dragon Scale Mail', 'armor', 'very-rare', true, '+1 scale mail, resistance to fire damage, and once a day you can sense the nearest brass dragon within 30 miles.', { effect: { ac: 1 } }),
  m('dragon-scale-mail-bronze', 'Bronze Dragon Scale Mail', 'armor', 'very-rare', true, '+1 scale mail, resistance to lightning damage, and once a day you can sense the nearest bronze dragon within 30 miles.', { effect: { ac: 1 } }),
  m('dragon-scale-mail-copper', 'Copper Dragon Scale Mail', 'armor', 'very-rare', true, '+1 scale mail, resistance to acid damage, and once a day you can sense the nearest copper dragon within 30 miles.', { effect: { ac: 1 } }),
  m('dragon-scale-mail-gold', 'Gold Dragon Scale Mail', 'armor', 'very-rare', true, '+1 scale mail, resistance to fire damage, and once a day you can sense the nearest gold dragon within 30 miles.', { effect: { ac: 1 } }),
  m('dragon-scale-mail-green', 'Green Dragon Scale Mail', 'armor', 'very-rare', true, '+1 scale mail, resistance to poison damage, and once a day you can sense the nearest green dragon within 30 miles.', { effect: { ac: 1 } }),
  m('dragon-scale-mail-red', 'Red Dragon Scale Mail', 'armor', 'very-rare', true, '+1 scale mail, resistance to fire damage, and once a day you can sense the nearest red dragon within 30 miles.', { effect: { ac: 1 } }),
  m('dragon-scale-mail-silver', 'Silver Dragon Scale Mail', 'armor', 'very-rare', true, '+1 scale mail, resistance to cold damage, and once a day you can sense the nearest silver dragon within 30 miles.', { effect: { ac: 1 } }),
  m('dragon-scale-mail-white', 'White Dragon Scale Mail', 'armor', 'very-rare', true, '+1 scale mail, resistance to cold damage, and once a day you can sense the nearest white dragon within 30 miles.', { effect: { ac: 1 } }),
  m('dwarven-plate', 'Dwarven Plate', 'armor', 'very-rare', false, '+2 plate, and it resists being moved against your will.', { effect: { ac: 2 } }),
  m('efreeti-chain', 'Efreeti Chain', 'armor', 'legendary', true, '+3 chain mail, immunity to fire, and you can walk on molten rock.', { effect: { ac: 3 } }),
  m('elven-chain', 'Elven Chain', 'armor', 'rare', false, '+1 chain shirt, and you are proficient with it whether or not you have medium armor.', { effect: { ac: 1 } }),
  m('glamoured-studded-leather', 'Glamoured Studded Leather', 'armor', 'rare', false, '+1 studded leather that looks like anything you like.', { effect: { ac: 1 } }),
  m('mariners-armor', "Mariner's Armor", 'armor', 'uncommon', false, 'A swimming speed, and you float rather than sink.'),
  m('mithral-armor', 'Mithral Armor', 'armor', 'uncommon', false, 'No Stealth disadvantage and no Strength requirement, whatever the armor.', { effect: { armorTraits: { noStealthDisadvantage: true, noStrengthRequirement: true } }, note: 'Applies to the armor you are wearing, so it is worth most on the heavy armor that carries both penalties.' }),
  m('plate-armor-of-etherealness', 'Plate Armor of Etherealness', 'armor', 'legendary', true, 'Ten minutes a day on the Ethereal Plane, walking through walls.'),
  m('shield-of-missile-attraction', 'Shield of Missile Attraction', 'armor', 'rare', true, 'Resistance to ranged weapon damage, but every nearby ranged attack aims at you. Cursed.', { slot: 'shield' }),
  m('spellguard-shield', 'Spellguard Shield', 'armor', 'very-rare', true, 'Advantage on saving throws against spells, and spell attacks against you have disadvantage.', { slot: 'shield', note: 'The best defensive shield in the book, and none of it is a flat armor class bonus.' }),

  // ======================================================= rings
  m('ring-of-animal-influence', 'Ring of Animal Influence', 'ring', 'rare', false, 'Three charges a day of animal friendship, fear or speak with animals.'),
  m('ring-of-djinni-summoning', 'Ring of Djinni Summoning', 'ring', 'legendary', true, 'Summons a djinni to serve you for an hour, once a day.'),
  m('ring-of-elemental-command', 'Ring of Elemental Command', 'ring', 'legendary', true, 'Command elementals of one kind, with powers that grow as you attune.'),
  m('ring-of-elemental-command-air', 'Ring of Air Elemental Command', 'ring', 'legendary', true, 'Advantage against air elementals and disadvantage for them against you, plus invisibility, gaseous form, wind wall and chain lightning. Its powers grow as you slay elementals.'),
  m('ring-of-elemental-command-earth', 'Ring of Earth Elemental Command', 'ring', 'legendary', true, 'Advantage against earth elementals and disadvantage for them against you, plus stone shape, passwall, wall of stone and move earth. Its powers grow as you slay elementals.'),
  m('ring-of-elemental-command-fire', 'Ring of Fire Elemental Command', 'ring', 'legendary', true, 'Advantage against fire elementals and disadvantage for them against you, plus burning hands, fireball and wall of fire, with resistance to fire. Its powers grow as you slay elementals.'),
  m('ring-of-elemental-command-water', 'Ring of Water Elemental Command', 'ring', 'legendary', true, 'Advantage against water elementals and disadvantage for them against you, plus create or destroy water, water walk, control water and ice storm. Its powers grow as you slay elementals.'),
  m('ring-of-evasion', 'Ring of Evasion', 'ring', 'rare', true, 'Three charges a day to turn a failed Dexterity save into a success.'),
  m('ring-of-feather-falling', 'Ring of Feather Falling', 'ring', 'rare', true, 'You never take falling damage.'),
  m('ring-of-invisibility', 'Ring of Invisibility', 'ring', 'legendary', true, 'Turn invisible at will, as an action.'),
  m('ring-of-jumping', 'Ring of Jumping', 'ring', 'uncommon', true, 'Cast jump on yourself at will, as a bonus action.'),
  m('ring-of-mind-shielding', 'Ring of Mind Shielding', 'ring', 'uncommon', true, 'Immune to mind reading and to magic that detects your alignment.'),
  m('ring-of-regeneration', 'Ring of Regeneration', 'ring', 'very-rare', true, 'Regain 1d6 hit points every ten minutes, and regrow severed limbs.'),
  m('ring-of-resistance', 'Ring of Resistance', 'ring', 'rare', true, 'Resistance to one damage type.'),
  m('ring-of-resistance-acid', 'Ring of Acid Resistance', 'ring', 'rare', true, 'Resistance to acid damage while you wear this pearl ring.'),
  m('ring-of-resistance-cold', 'Ring of Cold Resistance', 'ring', 'rare', true, 'Resistance to cold damage while you wear this tourmaline ring.'),
  m('ring-of-resistance-fire', 'Ring of Fire Resistance', 'ring', 'rare', true, 'Resistance to fire damage while you wear this garnet ring.'),
  m('ring-of-resistance-force', 'Ring of Force Resistance', 'ring', 'rare', true, 'Resistance to force damage while you wear this sapphire ring.'),
  m('ring-of-resistance-lightning', 'Ring of Lightning Resistance', 'ring', 'rare', true, 'Resistance to lightning damage while you wear this citrine ring.'),
  m('ring-of-resistance-necrotic', 'Ring of Necrotic Resistance', 'ring', 'rare', true, 'Resistance to necrotic damage while you wear this jet ring.'),
  m('ring-of-resistance-poison', 'Ring of Poison Resistance', 'ring', 'rare', true, 'Resistance to poison damage while you wear this amethyst ring.'),
  m('ring-of-resistance-psychic', 'Ring of Psychic Resistance', 'ring', 'rare', true, 'Resistance to psychic damage while you wear this jade ring.'),
  m('ring-of-resistance-radiant', 'Ring of Radiant Resistance', 'ring', 'rare', true, 'Resistance to radiant damage while you wear this topaz ring.'),
  m('ring-of-resistance-thunder', 'Ring of Thunder Resistance', 'ring', 'rare', true, 'Resistance to thunder damage while you wear this spinel ring.'),
  m('ring-of-shooting-stars', 'Ring of Shooting Stars', 'ring', 'very-rare', true, 'Light, lightning and motes of force, on charges that recover at dusk.'),
  m('ring-of-the-ram', 'Ring of the Ram', 'ring', 'rare', true, 'Three charges: a +7 ram attack for 2d10 force per charge that pushes the target 5 feet, or a shove against a door.'),
  m('ring-of-spell-storing', 'Ring of Spell Storing', 'ring', 'rare', true, 'Holds up to five levels of spells for anyone to cast later.'),
  m('ring-of-spell-turning', 'Ring of Spell Turning', 'ring', 'legendary', true, 'Advantage on saves against spells that target only you, and a natural 20 reflects them.'),
  m('ring-of-swimming', 'Ring of Swimming', 'ring', 'uncommon', false, 'A swimming speed of 40 feet.'),
  m('ring-of-telekinesis', 'Ring of Telekinesis', 'ring', 'very-rare', true, 'Cast telekinesis at will.'),
  m('ring-of-three-wishes', 'Ring of Three Wishes', 'ring', 'legendary', false, 'Three wishes, and then it is a ring.'),
  m('ring-of-warmth', 'Ring of Warmth', 'ring', 'uncommon', true, 'Resistance to cold, and you and your clothes stay comfortable in it.'),
  m('ring-of-water-walking', 'Ring of Water Walking', 'ring', 'uncommon', false, 'Walk on any liquid as if it were solid ground.'),
  m('ring-of-x-ray-vision', 'Ring of X-ray Vision', 'ring', 'rare', true, 'See through solid matter for a minute, at the cost of a level of exhaustion.'),

  // ======================================================= rods
  m('immovable-rod', 'Immovable Rod', 'rod', 'uncommon', false, 'A button fixes it in space, holding up to 8,000 pounds.', { note: 'The most creatively abused item in the game.' }),
  m('rod-of-absorption', 'Rod of Absorption', 'rod', 'very-rare', true, 'Absorbs a spell aimed at you and gives you the levels back as slots.'),
  m('rod-of-alertness', 'Rod of Alertness', 'rod', 'very-rare', true, 'Advantage on Perception and on initiative, plus an aura granting +1 armor class and saves to everyone near it.', { note: 'The aura needs the rod planted in the ground, so it is not counted on your own armor class.' }),
  m('rod-of-lordly-might', 'Rod of Lordly Might', 'rod', 'legendary', true, '+3 mace that also becomes a flame tongue, a battleaxe, a spear, a ladder and a compass.', { effect: { weaponBonus: 3 }, slot: 'weapon', kind: 'rod' }),
  m('rod-of-rulership', 'Rod of Rulership', 'rod', 'rare', true, 'Charm everything within 120 feet for eight hours, once a day.'),
  m('rod-of-security', 'Rod of Security', 'rod', 'very-rare', false, 'A paradise where up to 199 creatures rest, eat and heal for up to 200 days.'),
  m('rod-of-the-pact-keeper-3', 'Rod of the Pact Keeper +3', 'rod', 'very-rare', true, '+3 to spell attack rolls and spell save DC, and regain a Pact Magic slot on a short rest.', { effect: { spellBonus: 3 } }),

  // ======================================================= staffs
  m('staff-of-charming', 'Staff of Charming', 'staff', 'rare', true, 'Charm person, command and comprehend languages, and it can absorb an enchantment aimed at you.'),
  m('staff-of-fire', 'Staff of Fire', 'staff', 'very-rare', true, 'Resistance to fire, plus burning hands, fireball and wall of fire.'),
  m('staff-of-frost', 'Staff of Frost', 'staff', 'very-rare', true, 'Resistance to cold, plus cone of cold, fog cloud, ice storm and wall of ice.'),
  m('staff-of-healing', 'Staff of Healing', 'staff', 'rare', true, 'Cure wounds, lesser restoration and mass cure wounds, on ten charges.'),
  m('staff-of-power', 'Staff of Power', 'staff', 'very-rare', true, '+2 quarterstaff, +2 to armor class, saving throws and spell attacks, and a wall of spells on charges.', { effect: { weaponBonus: 2, ac: 2, saves: 2, spellBonus: 2 }, slot: 'weapon' }),
  m('staff-of-striking', 'Staff of Striking', 'staff', 'very-rare', true, '+3 quarterstaff that can spend charges for up to 3d6 extra force damage.', { effect: { weaponBonus: 3 }, slot: 'weapon' }),
  m('staff-of-swarming-insects', 'Staff of Swarming Insects', 'staff', 'very-rare', true, 'Giant insect and insect plague, and a swarm that blinds anything next to you.'),
  m('staff-of-the-adder', 'Staff of the Adder', 'staff', 'uncommon', true, 'The head becomes a poisonous snake you can attack with.'),
  m('staff-of-the-magi', 'Staff of the Magi', 'staff', 'legendary', true, '+2 quarterstaff, +2 to spell attacks, absorbs spells aimed at you, and casts almost everything.', { effect: { weaponBonus: 2, spellBonus: 2 }, slot: 'weapon', note: 'The single most powerful item a Wizard can hold.' }),
  m('staff-of-the-python', 'Staff of the Python', 'staff', 'very-rare', true, 'It becomes a giant constrictor snake that fights for you.'),
  m('staff-of-the-woodlands', 'Staff of the Woodlands', 'staff', 'rare', true, '+2 quarterstaff, druid spells, and it can grow into a tree.', { effect: { weaponBonus: 2 }, slot: 'weapon' }),
  m('staff-of-thunder-and-lightning', 'Staff of Thunder and Lightning', 'staff', 'very-rare', true, '+2 quarterstaff with lightning, thunder and a thunderclap on charges.', { effect: { weaponBonus: 2 }, slot: 'weapon' }),
  m('staff-of-withering', 'Staff of Withering', 'staff', 'rare', true, 'Extra necrotic damage, and it can leave a target with disadvantage on Strength or Constitution.'),

  // ======================================================= wands
  m('wand-of-binding', 'Wand of Binding', 'wand', 'rare', true, 'Hold monster and hold person, plus advantage on saves against being paralysed or restrained.'),
  m('wand-of-enemy-detection', 'Wand of Enemy Detection', 'wand', 'rare', true, 'Points at every hostile creature within 60 feet, even invisible ones.'),
  m('wand-of-fear', 'Wand of Fear', 'wand', 'rare', true, 'Command or a cone of fear, on seven charges.'),
  m('wand-of-fireballs', 'Wand of Fireballs', 'wand', 'rare', true, 'Fireball, up to 5th level, on seven charges.'),
  m('wand-of-lightning-bolts', 'Wand of Lightning Bolts', 'wand', 'rare', true, 'Lightning bolt, up to 5th level, on seven charges.'),
  m('wand-of-magic-detection', 'Wand of Magic Detection', 'wand', 'uncommon', false, 'Detect magic three times a day, without concentration.'),
  m('wand-of-magic-missiles', 'Wand of Magic Missiles', 'wand', 'uncommon', false, 'Magic missile, up to 7th level, on seven charges.'),
  m('wand-of-paralysis', 'Wand of Paralysis', 'wand', 'rare', true, 'Paralyse a creature for a minute on a failed save.'),
  m('wand-of-polymorph', 'Wand of Polymorph', 'wand', 'very-rare', true, 'Polymorph, on seven charges.'),
  m('wand-of-secrets', 'Wand of Secrets', 'wand', 'uncommon', false, 'Points at hidden doors and traps within 30 feet.'),
  m('wand-of-the-war-mage-2', 'Wand of the War Mage +2', 'wand', 'rare', true, '+2 to spell attack rolls, and you ignore half cover.', { effect: { spellBonus: 2 }, note: 'Attack rolls only - it does not raise your save DC.' }),
  m('wand-of-the-war-mage-3', 'Wand of the War Mage +3', 'wand', 'very-rare', true, '+3 to spell attack rolls, and you ignore half cover.', { effect: { spellBonus: 3 }, note: 'Attack rolls only - it does not raise your save DC.' }),
  m('wand-of-web', 'Wand of Web', 'wand', 'uncommon', true, 'Web, on seven charges.'),
  m('wand-of-wonder', 'Wand of Wonder', 'wand', 'rare', true, 'A random effect from a long table. Occasionally what you wanted.'),

  // ======================================================= potions and oils
  m('potion-of-animal-friendship', 'Potion of Animal Friendship', 'potion', 'uncommon', false, 'Animal friendship at will for an hour.'),
  m('potion-of-clairvoyance', 'Potion of Clairvoyance', 'potion', 'rare', false, 'The effect of clairvoyance.'),
  m('potion-of-climbing', 'Potion of Climbing', 'potion', 'common', false, 'A climbing speed and advantage on Athletics to climb, for an hour.'),
  m('potion-of-diminution', 'Potion of Diminution', 'potion', 'rare', false, 'The reduce effect of enlarge/reduce for 1d4 hours.'),
  m('potion-of-flying', 'Potion of Flying', 'potion', 'very-rare', false, 'A flying speed equal to your walking speed, with hovering, for an hour.'),
  m('potion-of-gaseous-form', 'Potion of Gaseous Form', 'potion', 'rare', false, 'Gaseous form for an hour, with no concentration.'),
  m('potion-of-giant-strength-hill', 'Potion of Hill Giant Strength', 'potion', 'uncommon', false, 'Your Strength becomes 21 for an hour.'),
  m('potion-of-giant-strength-frost', 'Potion of Frost/Stone Giant Strength', 'potion', 'rare', false, 'Your Strength becomes 23 for an hour.'),
  m('potion-of-giant-strength-fire', 'Potion of Fire Giant Strength', 'potion', 'rare', false, 'Your Strength becomes 25 for an hour.'),
  m('potion-of-giant-strength-cloud', 'Potion of Cloud Giant Strength', 'potion', 'very-rare', false, 'Your Strength becomes 27 for an hour.'),
  m('potion-of-giant-strength-storm', 'Potion of Storm Giant Strength', 'potion', 'legendary', false, 'Your Strength becomes 29 for an hour.'),
  m('potion-of-growth', 'Potion of Growth', 'potion', 'uncommon', false, 'The enlarge effect of enlarge/reduce for 1d4 hours.'),
  m('potion-of-healing', 'Potion of Healing', 'potion', 'common', false, 'Regain 2d4 + 2 hit points.', { use: { heals: '2d4+2' } }),
  m('potion-of-greater-healing', 'Potion of Greater Healing', 'potion', 'uncommon', false, 'Regain 4d4 + 4 hit points.', { use: { heals: '4d4+4' } }),
  m('potion-of-superior-healing', 'Potion of Superior Healing', 'potion', 'rare', false, 'Regain 8d4 + 8 hit points.', { use: { heals: '8d4+8' } }),
  m('potion-of-supreme-healing', 'Potion of Supreme Healing', 'potion', 'very-rare', false, 'Regain 10d4 + 20 hit points.', { use: { heals: '10d4+20' } }),
  m('potion-of-heroism', 'Potion of Heroism', 'potion', 'rare', false, '10 temporary hit points and the effect of bless, for an hour.'),
  m('potion-of-invisibility', 'Potion of Invisibility', 'potion', 'very-rare', false, 'Invisible for an hour, until you attack or cast.'),
  m('potion-of-invulnerability', 'Potion of Invulnerability', 'potion', 'rare', false, 'Resistance to all damage for a minute.'),
  m('potion-of-mind-reading', 'Potion of Mind Reading', 'potion', 'rare', false, 'The effect of detect thoughts.'),
  m('potion-of-poison', 'Potion of Poison', 'potion', 'uncommon', false, 'Looks like a beneficial potion. It is 3d6 poison damage and the poisoned condition.'),
  m('potion-of-resistance', 'Potion of Resistance', 'potion', 'uncommon', false, 'Resistance to one damage type for an hour.'),
  m('potion-of-resistance-acid', 'Potion of Acid Resistance', 'potion', 'uncommon', false, 'Resistance to acid damage for an hour.'),
  m('potion-of-resistance-cold', 'Potion of Cold Resistance', 'potion', 'uncommon', false, 'Resistance to cold damage for an hour.'),
  m('potion-of-resistance-fire', 'Potion of Fire Resistance', 'potion', 'uncommon', false, 'Resistance to fire damage for an hour.'),
  m('potion-of-resistance-force', 'Potion of Force Resistance', 'potion', 'uncommon', false, 'Resistance to force damage for an hour.'),
  m('potion-of-resistance-lightning', 'Potion of Lightning Resistance', 'potion', 'uncommon', false, 'Resistance to lightning damage for an hour.'),
  m('potion-of-resistance-necrotic', 'Potion of Necrotic Resistance', 'potion', 'uncommon', false, 'Resistance to necrotic damage for an hour.'),
  m('potion-of-resistance-poison', 'Potion of Poison Resistance', 'potion', 'uncommon', false, 'Resistance to poison damage for an hour.'),
  m('potion-of-resistance-psychic', 'Potion of Psychic Resistance', 'potion', 'uncommon', false, 'Resistance to psychic damage for an hour.'),
  m('potion-of-resistance-radiant', 'Potion of Radiant Resistance', 'potion', 'uncommon', false, 'Resistance to radiant damage for an hour.'),
  m('potion-of-resistance-thunder', 'Potion of Thunder Resistance', 'potion', 'uncommon', false, 'Resistance to thunder damage for an hour.'),
  m('potion-of-speed', 'Potion of Speed', 'potion', 'very-rare', false, 'The effect of haste for a minute, with no concentration.'),
  m('potion-of-water-breathing', 'Potion of Water Breathing', 'potion', 'uncommon', false, 'Breathe underwater for an hour.'),
  m('oil-of-etherealness', 'Oil of Etherealness', 'potion', 'rare', false, 'Etherealness for an hour, after ten minutes spent applying it.'),
  m('oil-of-sharpness', 'Oil of Sharpness', 'potion', 'very-rare', false, 'One weapon becomes +3 for an hour.'),
  m('oil-of-slipperiness', 'Oil of Slipperiness', 'potion', 'uncommon', false, 'Freedom of movement for eight hours, or a grease spell poured on the ground.'),
  m('philter-of-love', 'Philter of Love', 'potion', 'uncommon', false, 'Charmed by the first creature you see, for an hour.'),
  m('restorative-ointment', 'Restorative Ointment', 'potion', 'uncommon', false, 'Five doses: 2d8 + 2 hit points, and it cures poison or disease.'),
  m('sovereign-glue', 'Sovereign Glue', 'potion', 'legendary', false, 'Bonds two things permanently. Only universal solvent undoes it.'),
  m('universal-solvent', 'Universal Solvent', 'potion', 'legendary', false, 'Dissolves any adhesive it touches, including sovereign glue.'),

  // ======================================================= scrolls
  m('spell-scroll', 'Spell Scroll', 'scroll', 'common', false, 'One spell, cast without a slot. Rarity and the save DC rise with the spell level.', { note: 'Cantrip and 1st are common, 2nd-3rd uncommon, 4th-5th rare, 6th-7th very rare, 8th-9th legendary.' }),
  m('spell-scroll-cantrip', 'Spell Scroll (Cantrip)', 'scroll', 'common', false, 'One cantrip spell, cast without a slot. Save DC 13, attack bonus +3.'),
  m('spell-scroll-1st', 'Spell Scroll (1st Level)', 'scroll', 'common', false, 'One 1st-level spell, cast without a slot. Save DC 13, attack bonus +3.', { note: 'Casting it off your own list needs an ability check against DC 10 + the spell level, or the scroll is lost.' }),
  m('spell-scroll-2nd', 'Spell Scroll (2nd Level)', 'scroll', 'uncommon', false, 'One 2nd-level spell, cast without a slot. Save DC 13, attack bonus +3.', { note: 'Casting it off your own list needs an ability check against DC 10 + the spell level, or the scroll is lost.' }),
  m('spell-scroll-3rd', 'Spell Scroll (3rd Level)', 'scroll', 'uncommon', false, 'One 3rd-level spell, cast without a slot. Save DC 15, attack bonus +5.', { note: 'Casting it off your own list needs an ability check against DC 10 + the spell level, or the scroll is lost.' }),
  m('spell-scroll-4th', 'Spell Scroll (4th Level)', 'scroll', 'rare', false, 'One 4th-level spell, cast without a slot. Save DC 15, attack bonus +5.', { note: 'Casting it off your own list needs an ability check against DC 10 + the spell level, or the scroll is lost.' }),
  m('spell-scroll-5th', 'Spell Scroll (5th Level)', 'scroll', 'rare', false, 'One 5th-level spell, cast without a slot. Save DC 17, attack bonus +7.', { note: 'Casting it off your own list needs an ability check against DC 10 + the spell level, or the scroll is lost.' }),
  m('spell-scroll-6th', 'Spell Scroll (6th Level)', 'scroll', 'very-rare', false, 'One 6th-level spell, cast without a slot. Save DC 17, attack bonus +7.', { note: 'Casting it off your own list needs an ability check against DC 10 + the spell level, or the scroll is lost.' }),
  m('spell-scroll-7th', 'Spell Scroll (7th Level)', 'scroll', 'very-rare', false, 'One 7th-level spell, cast without a slot. Save DC 18, attack bonus +8.', { note: 'Casting it off your own list needs an ability check against DC 10 + the spell level, or the scroll is lost.' }),
  m('spell-scroll-8th', 'Spell Scroll (8th Level)', 'scroll', 'very-rare', false, 'One 8th-level spell, cast without a slot. Save DC 18, attack bonus +8.', { note: 'Casting it off your own list needs an ability check against DC 10 + the spell level, or the scroll is lost.' }),
  m('spell-scroll-9th', 'Spell Scroll (9th Level)', 'scroll', 'legendary', false, 'One 9th-level spell, cast without a slot. Save DC 19, attack bonus +9.', { note: 'Casting it off your own list needs an ability check against DC 10 + the spell level, or the scroll is lost.' }),
  m('scroll-of-protection', 'Scroll of Protection', 'scroll', 'rare', false, 'A 5-foot circle that one kind of creature cannot enter, for five minutes.'),

  // ======================================================= wondrous items
  m('amulet-of-proof', 'Amulet of Proof against Detection and Location', 'wondrous', 'uncommon', true, 'Hidden from divination and from any magic that would scry or locate you.'),
  m('amulet-of-the-planes', 'Amulet of the Planes', 'wondrous', 'very-rare', true, 'Plane shift, if you can describe the destination well enough.'),
  m('apparatus-of-the-crab', 'Apparatus of the Crab', 'wondrous', 'legendary', false, 'An iron barrel that unfolds into a two-person submersible with claws.'),
  m('bag-of-beans', 'Bag of Beans', 'wondrous', 'rare', false, 'Plant one and something happens. The table is long and mostly alarming.'),
  m('bag-of-devouring', 'Bag of Devouring', 'wondrous', 'very-rare', false, 'Looks like a bag of holding. It is the gullet of a creature from elsewhere.'),
  m('bag-of-holding', 'Bag of Holding', 'wondrous', 'uncommon', false, '500 pounds in a bag that always weighs fifteen.', { note: 'The app does not subtract its contents from your carrying capacity - list what is inside it in your notes.' }),
  m('handy-haversack', 'Handy Haversack', 'wondrous', 'rare', false, '120 pounds across three compartments, in a pack that always weighs five. Whatever you reach for is on top.'),
  m('bag-of-tricks', 'Bag of Tricks', 'wondrous', 'uncommon', false, 'A fuzzy ball becomes an animal that fights for you, three times a day.'),
  m('bag-of-tricks-gray', 'Gray Bag of Tricks', 'wondrous', 'uncommon', false, 'A weasel, giant rat, badger, boar, panther or giant badger.'),
  m('bag-of-tricks-rust', 'Rust Bag of Tricks', 'wondrous', 'uncommon', false, 'A rat, owl, mastiff, goat, giant goat or giant boar.'),
  m('bag-of-tricks-tan', 'Tan Bag of Tricks', 'wondrous', 'uncommon', false, 'A jackal, ape, baboon, axe beak, black bear or giant weasel.'),
  m('bead-of-force', 'Bead of Force', 'wondrous', 'rare', false, 'Thrown, it explodes for 5d4 force and traps everything in a sphere.'),
  m('belt-of-dwarvenkind', 'Belt of Dwarvenkind', 'wondrous', 'rare', true, '+2 Constitution to a maximum of 20, darkvision, and advantage on saves against poison.', { effect: { abilityBonus: { con: 2 }, abilityBonusCap: 20 } }),
  m('belt-of-hill-giant-strength', 'Belt of Hill Giant Strength', 'wondrous', 'rare', true, 'Your Strength becomes 21.', { effect: { setAbility: { ability: 'str', score: 21 } } }),
  m('belt-of-stone-giant-strength', 'Belt of Stone/Frost Giant Strength', 'wondrous', 'very-rare', true, 'Your Strength becomes 23.', { effect: { setAbility: { ability: 'str', score: 23 } } }),
  m('belt-of-fire-giant-strength', 'Belt of Fire Giant Strength', 'wondrous', 'very-rare', true, 'Your Strength becomes 25.', { effect: { setAbility: { ability: 'str', score: 25 } } }),
  m('belt-of-cloud-giant-strength', 'Belt of Cloud Giant Strength', 'wondrous', 'legendary', true, 'Your Strength becomes 27.', { effect: { setAbility: { ability: 'str', score: 27 } } }),
  m('belt-of-storm-giant-strength', 'Belt of Storm Giant Strength', 'wondrous', 'legendary', true, 'Your Strength becomes 29.', { effect: { setAbility: { ability: 'str', score: 29 } } }),
  m('boots-of-levitation', 'Boots of Levitation', 'wondrous', 'rare', true, 'Levitate at will.'),
  m('boots-of-striding-and-springing', 'Boots of Striding and Springing', 'wondrous', 'uncommon', true, 'Your walking speed becomes 30 if it is lower, you are never slowed by carrying, and you jump three times as far.'),
  m('boots-of-the-winterlands', 'Boots of the Winterlands', 'wondrous', 'uncommon', true, 'Resistance to cold, ice is not difficult terrain, and you tolerate temperatures to −50°F.'),
  m('bowl-of-commanding-water-elementals', 'Bowl of Commanding Water Elementals', 'wondrous', 'rare', false, 'Fill it and summon a water elemental, once a day.'),
  m('bracers-of-archery', 'Bracers of Archery', 'wondrous', 'uncommon', true, 'Proficiency with longbows and shortbows, and +2 damage with them.', { note: 'Bow damage only, so it is not in the general weapon bonus.' }),
  m('brazier-of-commanding-fire-elementals', 'Brazier of Commanding Fire Elementals', 'wondrous', 'rare', false, 'Summon a fire elemental, once a day.'),
  m('brooch-of-shielding', 'Brooch of Shielding', 'wondrous', 'uncommon', true, 'Resistance to force damage, and immunity to magic missile.'),
  m('broom-of-flying', 'Broom of Flying', 'wondrous', 'uncommon', false, 'Flies at 50 feet, and comes when you call it.'),
  m('candle-of-invocation', 'Candle of Invocation', 'wondrous', 'very-rare', true, 'Burn it to cast any spell you have prepared without a slot.'),
  m('cape-of-the-mountebank', 'Cape of the Mountebank', 'wondrous', 'rare', false, 'Dimension door once a day, in a puff of smoke.'),
  m('carpet-of-flying', 'Carpet of Flying', 'wondrous', 'very-rare', false, 'Flies at 30 to 80 feet depending on its size, carrying up to four people.'),
  m('carpet-of-flying-3x5', 'Carpet of Flying (3 ft. × 5 ft.)', 'wondrous', 'very-rare', false, 'Flies at 80 feet, carrying up to 200 pounds. Half speed over its capacity, up to twice it.'),
  m('carpet-of-flying-4x6', 'Carpet of Flying (4 ft. × 6 ft.)', 'wondrous', 'very-rare', false, 'Flies at 60 feet, carrying up to 400 pounds. Half speed over its capacity, up to twice it.'),
  m('carpet-of-flying-5x7', 'Carpet of Flying (5 ft. × 7 ft.)', 'wondrous', 'very-rare', false, 'Flies at 40 feet, carrying up to 600 pounds. Half speed over its capacity, up to twice it.'),
  m('carpet-of-flying-6x9', 'Carpet of Flying (6 ft. × 9 ft.)', 'wondrous', 'very-rare', false, 'Flies at 30 feet, carrying up to 800 pounds. Half speed over its capacity, up to twice it.'),
  m('censer-of-controlling-air-elementals', 'Censer of Controlling Air Elementals', 'wondrous', 'rare', false, 'Summon an air elemental, once a day.'),
  m('chime-of-opening', 'Chime of Opening', 'wondrous', 'rare', false, 'Ten uses, each opening one lock, lid or door.'),
  m('circlet-of-blasting', 'Circlet of Blasting', 'wondrous', 'uncommon', false, 'Scorching ray once a day, at +5 to hit.'),
  m('cloak-of-arachnida', 'Cloak of Arachnida', 'wondrous', 'very-rare', true, 'Resistance to poison, a climbing speed, web once a day, and webs never hold you.'),
  m('cloak-of-the-bat', 'Cloak of the Bat', 'wondrous', 'rare', true, 'Advantage on Stealth, a flying speed in dim light, and you can become a bat.'),
  m('cloak-of-the-manta-ray', 'Cloak of the Manta Ray', 'wondrous', 'uncommon', false, 'Breathe underwater with a swimming speed of 60 feet.'),
  m('crystal-ball', 'Crystal Ball', 'wondrous', 'very-rare', true, 'Scrying at will.'),
  m('crystal-ball-mind-reading', 'Crystal Ball of Mind Reading', 'wondrous', 'legendary', true, 'Scrying at will, plus detect thoughts against anything you can see through it.'),
  m('crystal-ball-telepathy', 'Crystal Ball of Telepathy', 'wondrous', 'legendary', true, 'Scrying at will, plus talking to and suggesting things to whoever you are watching.'),
  m('crystal-ball-true-seeing', 'Crystal Ball of True Seeing', 'wondrous', 'legendary', true, 'Scrying at will, plus truesight out to 120 feet through the sensor.'),
  m('cube-of-force', 'Cube of Force', 'wondrous', 'rare', true, 'A barrier that keeps out matter, energy or planar travel, on charges.'),
  m('cubic-gate', 'Cubic Gate', 'wondrous', 'legendary', false, 'Gates to six planes, on charges that recover daily.'),
  m('decanter-of-endless-water', 'Decanter of Endless Water', 'wondrous', 'uncommon', false, 'A stream, a fountain or a geyser of fresh water, on command.'),
  m('deck-of-illusions', 'Deck of Illusions', 'wondrous', 'uncommon', false, 'Throw a card and the creature on it appears as an illusion.'),
  m('deck-of-many-things', 'Deck of Many Things', 'wondrous', 'legendary', false, 'Draw a card. It will change your character, and possibly end them.', { note: 'The app models none of what it does, because neither does anyone else.' }),
  m('dimensional-shackles', 'Dimensional Shackles', 'wondrous', 'rare', false, 'The bound creature cannot teleport or leave the plane.'),
  m('dust-of-disappearance', 'Dust of Disappearance', 'wondrous', 'uncommon', false, 'Everything in a 10-foot cube turns invisible for 2d4 minutes.'),
  m('dust-of-dryness', 'Dust of Dryness', 'wondrous', 'uncommon', false, 'Absorbs 15 feet of water into a pellet that can be thrown to release it.'),
  m('dust-of-sneezing-and-choking', 'Dust of Sneezing and Choking', 'wondrous', 'uncommon', false, 'Looks like dust of disappearance. It incapacitates everyone within 30 feet.'),
  m('efficient-quiver', 'Efficient Quiver', 'wondrous', 'uncommon', false, 'Sixty arrows, eighteen javelins and six bows or staffs, weighing two pounds.'),
  m('efreeti-bottle', 'Efreeti Bottle', 'wondrous', 'very-rare', false, 'An efreeti, whose mood on being released is rolled for.'),
  m('elemental-gem', 'Elemental Gem', 'wondrous', 'uncommon', false, 'Break it to summon an elemental of the matching kind.'),
  m('elemental-gem-air', 'Air Elemental Gem', 'wondrous', 'uncommon', false, 'Break this blue sapphire to summon an air elemental, as conjure elemental. The gem is spent.'),
  m('elemental-gem-earth', 'Earth Elemental Gem', 'wondrous', 'uncommon', false, 'Break this yellow diamond to summon an earth elemental, as conjure elemental. The gem is spent.'),
  m('elemental-gem-fire', 'Fire Elemental Gem', 'wondrous', 'uncommon', false, 'Break this red corundum to summon a fire elemental, as conjure elemental. The gem is spent.'),
  m('elemental-gem-water', 'Water Elemental Gem', 'wondrous', 'uncommon', false, 'Break this emerald to summon a water elemental, as conjure elemental. The gem is spent.'),
  m('eversmoking-bottle', 'Eversmoking Bottle', 'wondrous', 'uncommon', false, 'Smoke that heavily obscures a growing area until it is stoppered.'),
  m('eyes-of-charming', 'Eyes of Charming', 'wondrous', 'uncommon', true, 'Charm person three times a day, by meeting someone\'s eyes.'),
  m('eyes-of-minute-seeing', 'Eyes of Minute Seeing', 'wondrous', 'uncommon', false, 'See fine detail within a foot as if it were much closer.'),
  m('eyes-of-the-eagle', 'Eyes of the Eagle', 'wondrous', 'uncommon', true, 'Advantage on Perception checks that rely on sight.'),
  m('feather-token', 'Feather Token', 'wondrous', 'rare', false, 'One of several single-use tokens: an anchor, a bird, a fan, a tree, a whip.'),
  m('feather-token-anchor', 'Anchor Feather Token', 'wondrous', 'rare', false, 'A boat cannot be moved by any means for a day.'),
  m('feather-token-bird', 'Bird Feather Token', 'wondrous', 'rare', false, 'A roc that carries you, and vanishes after 300 miles or two days.'),
  m('feather-token-fan', 'Fan Feather Token', 'wondrous', 'rare', false, 'A wind strong enough to fill a ship\'s sails, for eight hours.'),
  m('feather-token-swan-boat', 'Swan Boat Feather Token', 'wondrous', 'rare', false, 'A 50-foot swan boat that steers itself, for a day.'),
  m('feather-token-tree', 'Tree Feather Token', 'wondrous', 'rare', false, 'An oak tree, 60 feet tall, springs into being.'),
  m('feather-token-whip', 'Whip Feather Token', 'wondrous', 'rare', false, 'A floating whip that attacks at +9 for 1d6 + 5 force, for an hour.'),
  m('figurine-of-wondrous-power', 'Figurine of Wondrous Power', 'wondrous', 'rare', false, 'A statuette that becomes a real creature and serves you.'),
  m('figurine-bronze-griffon', 'Bronze Griffon Figurine of Wondrous Power', 'wondrous', 'rare', false, 'A griffon for up to six hours, once every five days.'),
  m('figurine-ebony-fly', 'Ebony Fly Figurine of Wondrous Power', 'wondrous', 'rare', false, 'A giant fly to ride for up to twelve hours, once every two days.'),
  m('figurine-golden-lions', 'Golden Lions Figurine of Wondrous Power', 'wondrous', 'rare', false, 'A pair of lions for up to an hour, once every seven days.'),
  m('figurine-ivory-goats', 'Ivory Goats Figurine of Wondrous Power', 'wondrous', 'rare', false, 'Three goats with different powers: travelling, fighting, and bearing a load.'),
  m('figurine-marble-elephant', 'Marble Elephant Figurine of Wondrous Power', 'wondrous', 'rare', false, 'An elephant for up to a day, once every seven days.'),
  m('figurine-obsidian-steed', 'Obsidian Steed Figurine of Wondrous Power', 'wondrous', 'very-rare', false, 'A nightmare for up to a day, which may betray a character who is not evil.'),
  m('figurine-onyx-dog', 'Onyx Dog Figurine of Wondrous Power', 'wondrous', 'rare', false, 'A mastiff with darkvision and keen senses, for up to six hours.'),
  m('figurine-serpentine-owl', 'Serpentine Owl Figurine of Wondrous Power', 'wondrous', 'rare', false, 'A giant owl that can speak to you telepathically within a mile.'),
  m('figurine-silver-raven', 'Silver Raven Figurine of Wondrous Power', 'wondrous', 'uncommon', false, 'A raven that can carry a message, and cast animal messenger.'),
  m('folding-boat', 'Folding Boat', 'wondrous', 'rare', false, 'A box that becomes a ten-foot boat, or a twenty-four-foot ship.'),
  m('gem-of-brightness', 'Gem of Brightness', 'wondrous', 'uncommon', false, 'Light, a blinding beam, or a blinding flash, on fifty charges.'),
  m('gem-of-seeing', 'Gem of Seeing', 'wondrous', 'rare', true, 'Truesight to 120 feet, for ten minutes at a time.'),
  m('gloves-of-missile-snaring', 'Gloves of Missile Snaring', 'wondrous', 'uncommon', true, 'Reduce ranged weapon damage by 1d10 + Dexterity, and catch the missile if it drops to nothing.'),
  m('gloves-of-swimming-and-climbing', 'Gloves of Swimming and Climbing', 'wondrous', 'uncommon', true, 'Climbing and swimming cost no extra movement, and +5 on Athletics to do either.'),
  m('gloves-of-thievery', 'Gloves of Thievery', 'wondrous', 'uncommon', false, '+5 on Sleight of Hand and on picking locks.'),
  m('goggles-of-night', 'Goggles of Night', 'wondrous', 'uncommon', false, 'Darkvision to 60 feet, or 60 feet further if you already have it.', { effect: { sight: { darkvision: 60, extendsBy: 60 } } }),
  m('hat-of-disguise', 'Hat of Disguise', 'wondrous', 'uncommon', true, 'Disguise self at will.'),
  m('helm-of-brilliance', 'Helm of Brilliance', 'wondrous', 'very-rare', true, 'Daylight, fireball, prismatic spray and scorching ray, from the gems set in it.'),
  m('helm-of-comprehending-languages', 'Helm of Comprehending Languages', 'wondrous', 'uncommon', false, 'Comprehend languages at will.'),
  m('helm-of-telepathy', 'Helm of Telepathy', 'wondrous', 'uncommon', true, 'Detect thoughts, and speak mind to mind with what you find.'),
  m('helm-of-teleportation', 'Helm of Teleportation', 'wondrous', 'rare', true, 'Teleport, on three charges a day.'),
  m('horn-of-blasting', 'Horn of Blasting', 'wondrous', 'rare', false, '5d6 thunder in a 30-foot cone, and the deafened condition.'),
  m('horn-of-valhalla', 'Horn of Valhalla', 'wondrous', 'rare', false, 'Summons berserkers to fight for you, once a day.'),
  m('horn-of-valhalla-silver', 'Silver Horn of Valhalla', 'wondrous', 'rare', false, '2d4 + 2 berserkers, with no proficiency required.'),
  m('horn-of-valhalla-brass', 'Brass Horn of Valhalla', 'wondrous', 'rare', false, '3d4 + 3 berserkers. You must be proficient with all simple weapons or take 5d6 damage.'),
  m('horn-of-valhalla-bronze', 'Bronze Horn of Valhalla', 'wondrous', 'very-rare', false, '4d4 + 4 berserkers. You must be proficient with medium armor or take 5d6 damage.'),
  m('horn-of-valhalla-iron', 'Iron Horn of Valhalla', 'wondrous', 'legendary', false, '5d4 + 5 berserkers. You must be proficient with all martial weapons or take 5d6 damage.'),
  m('horseshoes-of-a-zephyr', 'Horseshoes of a Zephyr', 'wondrous', 'very-rare', false, 'The mount moves as if over solid ground, four inches above it.'),
  m('horseshoes-of-speed', 'Horseshoes of Speed', 'wondrous', 'rare', false, 'The mount\'s walking speed rises by 30 feet.'),
  m('instant-fortress', 'Instant Fortress', 'wondrous', 'rare', false, 'A cube that becomes a twenty-foot square adamantine tower.'),
  m('ioun-stone-absorption', 'Ioun Stone of Absorption', 'wondrous', 'very-rare', true, 'Cancel a spell of 4th level or lower aimed only at you, on charges.'),
  m('ioun-stone-agility', 'Ioun Stone of Agility', 'wondrous', 'very-rare', true, '+2 Dexterity, to a maximum of 20.', { effect: { abilityBonus: { dex: 2 }, abilityBonusCap: 20 } }),
  m('ioun-stone-awareness', 'Ioun Stone of Awareness', 'wondrous', 'rare', true, 'You cannot be surprised.'),
  m('ioun-stone-fortitude', 'Ioun Stone of Fortitude', 'wondrous', 'very-rare', true, '+2 Constitution, to a maximum of 20.', { effect: { abilityBonus: { con: 2 }, abilityBonusCap: 20 } }),
  m('ioun-stone-greater-absorption', 'Ioun Stone of Greater Absorption', 'wondrous', 'legendary', true, 'Cancel a spell of 8th level or lower aimed only at you, on charges.'),
  m('ioun-stone-insight', 'Ioun Stone of Insight', 'wondrous', 'very-rare', true, '+2 Wisdom, to a maximum of 20.', { effect: { abilityBonus: { wis: 2 }, abilityBonusCap: 20 } }),
  m('ioun-stone-intellect', 'Ioun Stone of Intellect', 'wondrous', 'very-rare', true, '+2 Intelligence, to a maximum of 20.', { effect: { abilityBonus: { int: 2 }, abilityBonusCap: 20 } }),
  m('ioun-stone-leadership', 'Ioun Stone of Leadership', 'wondrous', 'very-rare', true, '+2 Charisma, to a maximum of 20.', { effect: { abilityBonus: { cha: 2 }, abilityBonusCap: 20 } }),
  m('ioun-stone-mastery', 'Ioun Stone of Mastery', 'wondrous', 'legendary', true, 'Your proficiency bonus rises by 1.'),
  m('ioun-stone-protection', 'Ioun Stone of Protection', 'wondrous', 'rare', true, '+1 to armor class.', { effect: { ac: 1 } }),
  m('ioun-stone-regeneration', 'Ioun Stone of Regeneration', 'wondrous', 'legendary', true, 'Regain 15 hit points every hour, as long as you have at least one.'),
  m('ioun-stone-reserve', 'Ioun Stone of Reserve', 'wondrous', 'rare', true, 'Stores up to three levels of spells for you to cast later.'),
  m('ioun-stone-strength', 'Ioun Stone of Strength', 'wondrous', 'very-rare', true, '+2 Strength, to a maximum of 20.', { effect: { abilityBonus: { str: 2 }, abilityBonusCap: 20 } }),
  m('ioun-stone-sustenance', 'Ioun Stone of Sustenance', 'wondrous', 'rare', true, 'You need no food or water.'),
  m('iron-bands-of-bilarro', 'Iron Bands of Bilarro', 'wondrous', 'rare', false, 'Thrown at a Huge or smaller creature, they wrap it and restrain it.'),
  m('iron-flask', 'Iron Flask', 'wondrous', 'legendary', false, 'Traps one creature from another plane, and later releases it as your servant.'),
  m('lantern-of-revealing', 'Lantern of Revealing', 'wondrous', 'uncommon', false, 'Invisible creatures and objects in its light become visible.'),
  m('manual-of-bodily-health', 'Manual of Bodily Health', 'wondrous', 'very-rare', false, 'Six days of study raise your Constitution by 2, and its maximum with it.', { note: 'A permanent change, so record it by raising the score itself rather than by carrying the book.' }),
  m('manual-of-gainful-exercise', 'Manual of Gainful Exercise', 'wondrous', 'very-rare', false, 'Six days of study raise your Strength by 2, and its maximum with it.', { note: 'A permanent change, so record it by raising the score itself.' }),
  m('manual-of-golems', 'Manual of Golems', 'wondrous', 'very-rare', false, 'Instructions for building a golem, and the months and gold to do it.'),
  m('manual-of-golems-clay', 'Manual of Clay Golems', 'wondrous', 'very-rare', false, 'Instructions for building a clay golem: 30 days and 65,000 gp. You need two 5th-level slots to read it at all.'),
  m('manual-of-golems-flesh', 'Manual of Flesh Golems', 'wondrous', 'very-rare', false, 'Instructions for building a flesh golem: 30 days and 50,000 gp. You need two 5th-level slots to read it at all.'),
  m('manual-of-golems-iron', 'Manual of Iron Golems', 'wondrous', 'very-rare', false, 'Instructions for building a iron golem: 120 days and 80,000 gp. You need two 5th-level slots to read it at all.'),
  m('manual-of-golems-stone', 'Manual of Stone Golems', 'wondrous', 'very-rare', false, 'Instructions for building a stone golem: 90 days and 80,000 gp. You need two 5th-level slots to read it at all.'),
  m('manual-of-quickness-of-action', 'Manual of Quickness of Action', 'wondrous', 'very-rare', false, 'Six days of study raise your Dexterity by 2, and its maximum with it.', { note: 'A permanent change, so record it by raising the score itself.' }),
  m('marvelous-pigments', 'Marvelous Pigments', 'wondrous', 'very-rare', false, 'Paint an object and it becomes real, up to 1,000 cubic feet.'),
  m('medallion-of-thoughts', 'Medallion of Thoughts', 'wondrous', 'uncommon', true, 'Detect thoughts, three times a day.'),
  m('mirror-of-life-trapping', 'Mirror of Life Trapping', 'wondrous', 'very-rare', false, 'Twelve cells behind the glass, each holding a creature that looked into it.'),
  m('necklace-of-adaptation', 'Necklace of Adaptation', 'wondrous', 'uncommon', true, 'Breathe normally anywhere, and advantage on saves against harmful gases.'),
  m('necklace-of-fireballs', 'Necklace of Fireballs', 'wondrous', 'rare', false, 'Beads that detach and explode as fireballs of rising level.'),
  m('necklace-of-prayer-beads', 'Necklace of Prayer Beads', 'wondrous', 'rare', true, 'Blessing, curing, favor, smiting, summons or wind walk, from the beads on it.'),
  m('pearl-of-power', 'Pearl of Power', 'wondrous', 'uncommon', true, 'Regain one spent spell slot of 3rd level or lower, once a day.'),
  m('periapt-of-health', 'Periapt of Health', 'wondrous', 'uncommon', false, 'You are immune to disease.'),
  m('periapt-of-proof-against-poison', 'Periapt of Proof against Poison', 'wondrous', 'rare', false, 'Immune to poison damage and to the poisoned condition.'),
  m('periapt-of-wound-closure', 'Periapt of Wound Closure', 'wondrous', 'uncommon', true, 'Stabilise automatically, and hit dice heal twice as much.'),
  m('pipes-of-haunting', 'Pipes of Haunting', 'wondrous', 'uncommon', false, 'Frighten everything within 30 feet, three times a day.'),
  m('pipes-of-the-sewers', 'Pipes of the Sewers', 'wondrous', 'uncommon', true, 'Summon and command swarms of rats.'),
  m('portable-hole', 'Portable Hole', 'wondrous', 'rare', false, 'A six-foot cylinder of extradimensional space, in a cloth circle.'),
  m('robe-of-eyes', 'Robe of Eyes', 'wondrous', 'rare', true, 'See in all directions, with darkvision and see invisibility, and you cannot be blinded by ordinary means.'),
  m('robe-of-scintillating-colors', 'Robe of Scintillating Colors', 'wondrous', 'very-rare', true, 'Dazzling light that gives attackers disadvantage, on three charges a day.'),
  m('robe-of-stars', 'Robe of Stars', 'wondrous', 'very-rare', true, '+1 to saving throws, six stars that cast magic missile, and travel to the Astral Plane.', { effect: { saves: 1 } }),
  m('mantle-of-spell-resistance', 'Mantle of Spell Resistance', 'wondrous', 'rare', true, 'Advantage on saving throws against spells while you wear this cloak.'),
  m('robe-of-the-archmagi', 'Robe of the Archmagi', 'wondrous', 'legendary', true, 'Base armor class 15 + Dexterity with no armor, advantage on saves against spells, and +2 to spell save DC and spell attacks.', { effect: { spellBonus: 2 }, requires: { noArmor: true, noShield: true }, note: 'The armor class it sets is a base rather than a bonus, so pick "No armor" and add the difference by hand.' }),
  m('robe-of-useful-items', 'Robe of Useful Items', 'wondrous', 'uncommon', false, 'Patches that become the thing they depict, from a dagger to a portable ram.'),
  m('rope-of-climbing', 'Rope of Climbing', 'wondrous', 'uncommon', false, 'Sixty feet that knots, fastens and moves on command.'),
  m('rope-of-entanglement', 'Rope of Entanglement', 'wondrous', 'rare', false, 'Entangles a creature within 20 feet, and holds it.'),
  m('scarab-of-protection', 'Scarab of Protection', 'wondrous', 'legendary', true, 'Advantage on saves against spells, and it absorbs necrotic effects that would kill you.'),
  m('slippers-of-spider-climbing', 'Slippers of Spider Climbing', 'wondrous', 'uncommon', true, 'Walk on walls and ceilings with your hands free.'),
  m('sphere-of-annihilation', 'Sphere of Annihilation', 'wondrous', 'legendary', false, 'A two-foot hole in reality that destroys what it touches.'),
  m('stone-of-controlling-earth-elementals', 'Stone of Controlling Earth Elementals', 'wondrous', 'rare', false, 'Summon an earth elemental, once a day.'),
  m('talisman-of-pure-good', 'Talisman of Pure Good', 'wondrous', 'legendary', true, '+2 to spell attack rolls, and it destroys an evil creature outright on seven charges.', { effect: { spellBonus: 2 } }),
  m('talisman-of-the-sphere', 'Talisman of the Sphere', 'wondrous', 'legendary', true, 'Double your Intelligence modifier when controlling a sphere of annihilation.'),
  m('talisman-of-ultimate-evil', 'Talisman of Ultimate Evil', 'wondrous', 'legendary', true, '+2 to spell attack rolls, and it destroys a good creature outright on six charges.', { effect: { spellBonus: 2 } }),
  m('tome-of-clear-thought', 'Tome of Clear Thought', 'wondrous', 'very-rare', false, 'Six days of study raise your Intelligence by 2, and its maximum with it.', { note: 'A permanent change, so record it by raising the score itself.' }),
  m('tome-of-leadership-and-influence', 'Tome of Leadership and Influence', 'wondrous', 'very-rare', false, 'Six days of study raise your Charisma by 2, and its maximum with it.', { note: 'A permanent change, so record it by raising the score itself.' }),
  m('tome-of-understanding', 'Tome of Understanding', 'wondrous', 'very-rare', false, 'Six days of study raise your Wisdom by 2, and its maximum with it.', { note: 'A permanent change, so record it by raising the score itself.' }),
  m('well-of-many-worlds', 'Well of Many Worlds', 'wondrous', 'legendary', false, 'A cloth that opens a two-way gate to another plane.'),
  m('wind-fan', 'Wind Fan', 'wondrous', 'uncommon', false, 'Gust of wind, without a slot and without components.'),
  m('wings-of-flying', 'Wings of Flying', 'wondrous', 'rare', true, 'A flying speed of 60 feet for up to an hour, once a day.'),

  // ======================================================= artifacts
  m('book-of-vile-darkness', 'Book of Vile Darkness', 'wondrous', 'artifact', true, 'The definitive work on evil. Studying it changes you, permanently and not for the better.'),
  m('eye-of-vecna', 'Eye of Vecna', 'wondrous', 'artifact', true, 'Truesight and Vecna\'s own spells, for the price of your own eye.'),
  m('hand-of-vecna', 'Hand of Vecna', 'wondrous', 'artifact', true, 'Strength 20 and a withering touch, for the price of your own hand.', { effect: { setAbility: { ability: 'str', score: 20 } } }),
  m('orb-of-dragonkind', 'Orb of Dragonkind', 'wondrous', 'artifact', true, '+3 to spell attack rolls and save DC, and it commands dragons.', { effect: { spellBonus: 3 } }),
  m('sword-of-kas', 'Sword of Kas', 'weapon', 'artifact', true, '+3 longsword with 2d10 extra against undead, and it wants Vecna destroyed.', { effect: { weaponBonus: 3 } }),
];

export const MAGIC_ITEMS_BY_ID: Record<string, MagicItem> = Object.fromEntries(
  MAGIC_ITEMS.map((item) => [item.id, item]),
);

export function magicItemById(id: string): MagicItem | undefined {
  return MAGIC_ITEMS_BY_ID[id];
}

export const RARITY_LABELS: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  'very-rare': 'Very rare',
  legendary: 'Legendary',
  artifact: 'Artifact',
};

/** How many things you can be attuned to at once. */
export const ATTUNEMENT_LIMIT = 3;
