import type { Ruleset } from '../types';

export type WeaponCategory = 'simple' | 'martial';

export type DamageType = 'bludgeoning' | 'piercing' | 'slashing';

export type WeaponProperty =
  | 'ammunition'
  | 'finesse'
  | 'heavy'
  | 'light'
  | 'loading'
  | 'reach'
  | 'thrown'
  | 'two-handed'
  | 'versatile';

/**
 * The 2024 mastery properties. Every weapon has exactly one, and you only get
 * to use it on weapons you have mastery with.
 */
export type MasteryProperty =
  | 'cleave'
  | 'graze'
  | 'nick'
  | 'push'
  | 'sap'
  | 'slow'
  | 'topple'
  | 'vex';

export const MASTERY_LABELS: Record<MasteryProperty, string> = {
  cleave: 'Cleave',
  graze: 'Graze',
  nick: 'Nick',
  push: 'Push',
  sap: 'Sap',
  slow: 'Slow',
  topple: 'Topple',
  vex: 'Vex',
};

export const MASTERY_SUMMARIES: Record<MasteryProperty, string> = {
  cleave: 'On a hit with a melee weapon, make a second attack against another creature within 5 feet, without your ability modifier on the damage.',
  graze: 'On a miss, deal your ability modifier in damage anyway.',
  nick: 'The extra attack from Light can be made as part of the Attack action rather than as a bonus action.',
  push: 'On a hit, push a Large or smaller creature 10 feet away.',
  sap: 'On a hit, the target has disadvantage on its next attack roll.',
  slow: "On a hit, reduce the target's speed by 10 feet until your next turn.",
  topple: 'On a hit, the target makes a Constitution save or falls prone.',
  vex: 'On a hit, you have advantage on your next attack against that creature.',
};

export interface Weapon {
  id: string;
  name: string;
  category: WeaponCategory;
  melee: boolean;
  /** Damage in the default grip: 1d8 slashing is { count: 1, die: 8, ... }. */
  damage: { count: number; die: number; type: DamageType };
  /** Versatile's larger die, used when wielded two-handed. */
  versatileDie?: number;
  properties: WeaponProperty[];
  /**
   * The gear id this weapon loads, for anything with the ammunition property.
   * A bow that does not know it eats arrows cannot count them down.
   */
  ammo?: string;
  range?: { normal: number; long: number };
  /** 2024 only. */
  mastery?: MasteryProperty;
  /**
   * One of the five weapons Polearm Master names, so the polearm loadout is
   * derived from what you carry rather than declared.
   */
  polearm?: boolean;
  weight: number;
  /** In copper pieces, matching `data/gear.ts` so the two tables add up. */
  cost: number;
  note?: string;
  /** Which editions print this weapon at all. Both, unless it says otherwise. */
  rulesets?: Ruleset[];
  /**
   * What 2024 changed about it. Six rows in the table need this; the rest are
   * identical across the two editions apart from gaining a mastery property.
   */
  in2024?: Partial<Pick<Weapon, 'damage' | 'versatileDie' | 'properties' | 'weight' | 'cost' | 'note'>>;
}

/**
 * The PHB weapon table, shaped like `armor.ts`.
 *
 * Rows carry their **2014** stats, with `in2024` holding the revision, because
 * the two tables are the same weapon in all but a handful of places and
 * duplicating thirty-seven rows to change five would bury that. `mastery` is
 * the exception that proves it: it only exists in 2024, so it sits on the base
 * row and the 2014 reader simply ignores it.
 *
 * `note` is there for the handful of weapons a player actually chooses between;
 * most of the table exists so a sheet can be represented faithfully, not
 * because there is anything to say about a club.
 */
export const WEAPONS: Weapon[] = [
  // ------------------------------------------------------------ simple melee
  { id: 'club', name: 'Club', category: 'simple', melee: true, damage: { count: 1, die: 4, type: 'bludgeoning' }, properties: ['light'], mastery: 'slow', weight: 2, cost: 10 },
  { id: 'dagger', name: 'Dagger', category: 'simple', melee: true, damage: { count: 1, die: 4, type: 'piercing' }, properties: ['finesse', 'light', 'thrown'], range: { normal: 20, long: 60 }, mastery: 'nick', weight: 1, cost: 200, note: 'Finesse, light and thrown: the off-hand default, and the only weapon a Wizard can throw.' },
  { id: 'greatclub', name: 'Greatclub', category: 'simple', melee: true, damage: { count: 1, die: 8, type: 'bludgeoning' }, properties: ['two-handed'], mastery: 'push', weight: 10, cost: 20 },
  { id: 'handaxe', name: 'Handaxe', category: 'simple', melee: true, damage: { count: 1, die: 6, type: 'slashing' }, properties: ['light', 'thrown'], range: { normal: 20, long: 60 }, mastery: 'vex', weight: 2, cost: 500 },
  { id: 'javelin', name: 'Javelin', category: 'simple', melee: true, damage: { count: 1, die: 6, type: 'piercing' }, properties: ['thrown'], range: { normal: 30, long: 120 }, mastery: 'slow', weight: 2, cost: 50 },
  { id: 'light-hammer', name: 'Light hammer', category: 'simple', melee: true, damage: { count: 1, die: 4, type: 'bludgeoning' }, properties: ['light', 'thrown'], range: { normal: 20, long: 60 }, mastery: 'nick', weight: 2, cost: 200 },
  { id: 'mace', name: 'Mace', category: 'simple', melee: true, damage: { count: 1, die: 6, type: 'bludgeoning' }, properties: [], mastery: 'sap', weight: 4, cost: 500 },
  { id: 'quarterstaff', name: 'Quarterstaff', category: 'simple', melee: true, damage: { count: 1, die: 6, type: 'bludgeoning' }, versatileDie: 8, properties: ['versatile'], mastery: 'topple', polearm: true, weight: 4, cost: 20, note: 'A Polearm Master weapon a Wizard or Monk is proficient with, which is most of why anyone takes it.' },
  { id: 'sickle', name: 'Sickle', category: 'simple', melee: true, damage: { count: 1, die: 4, type: 'slashing' }, properties: ['light'], mastery: 'nick', weight: 2, cost: 100 },
  { id: 'spear', name: 'Spear', category: 'simple', melee: true, damage: { count: 1, die: 6, type: 'piercing' }, versatileDie: 8, properties: ['thrown', 'versatile'], range: { normal: 20, long: 60 }, mastery: 'sap', polearm: true, weight: 3, cost: 100 },

  // ----------------------------------------------------------- simple ranged
  { id: 'light-crossbow', name: 'Light crossbow', category: 'simple', melee: false, damage: { count: 1, die: 8, type: 'piercing' }, properties: ['ammunition', 'loading', 'two-handed'], ammo: 'crossbow-bolts', range: { normal: 80, long: 320 }, mastery: 'slow', weight: 5, cost: 2500 },
  { id: 'dart', name: 'Dart', category: 'simple', melee: false, damage: { count: 1, die: 4, type: 'piercing' }, properties: ['finesse', 'thrown'], range: { normal: 20, long: 60 }, mastery: 'vex', weight: 0.25, cost: 5, in2024: { weight: 1 } },
  { id: 'shortbow', name: 'Shortbow', category: 'simple', melee: false, damage: { count: 1, die: 6, type: 'piercing' }, properties: ['ammunition', 'two-handed'], ammo: 'arrows', range: { normal: 80, long: 320 }, mastery: 'vex', weight: 2, cost: 2500 },
  { id: 'sling', name: 'Sling', category: 'simple', melee: false, damage: { count: 1, die: 4, type: 'bludgeoning' }, properties: ['ammunition'], ammo: 'sling-bullets', range: { normal: 30, long: 120 }, mastery: 'slow', weight: 0, cost: 10 },

  // ----------------------------------------------------------- martial melee
  { id: 'battleaxe', name: 'Battleaxe', category: 'martial', melee: true, damage: { count: 1, die: 8, type: 'slashing' }, versatileDie: 10, properties: ['versatile'], mastery: 'topple', weight: 4, cost: 1000 },
  { id: 'flail', name: 'Flail', category: 'martial', melee: true, damage: { count: 1, die: 8, type: 'bludgeoning' }, properties: [], mastery: 'sap', weight: 2, cost: 1000 },
  { id: 'glaive', name: 'Glaive', category: 'martial', melee: true, damage: { count: 1, die: 10, type: 'slashing' }, properties: ['heavy', 'reach', 'two-handed'], mastery: 'graze', polearm: true, weight: 6, cost: 2000, note: 'Reach plus Polearm Master plus Great Weapon Master is the classic Strength melee build.' },
  { id: 'greataxe', name: 'Greataxe', category: 'martial', melee: true, damage: { count: 1, die: 12, type: 'slashing' }, properties: ['heavy', 'two-handed'], mastery: 'cleave', weight: 7, cost: 3000, note: 'The biggest single die, which matters for Barbarians who crit and reroll.' },
  { id: 'greatsword', name: 'Greatsword', category: 'martial', melee: true, damage: { count: 2, die: 6, type: 'slashing' }, properties: ['heavy', 'two-handed'], mastery: 'graze', weight: 6, cost: 5000, note: '2d6 averages higher than a greataxe and rerolls better with Great Weapon Fighting.' },
  { id: 'halberd', name: 'Halberd', category: 'martial', melee: true, damage: { count: 1, die: 10, type: 'slashing' }, properties: ['heavy', 'reach', 'two-handed'], mastery: 'cleave', polearm: true, weight: 6, cost: 2000 },
  // 2024 traded the lance's bigger die for Heavy and a plain two-handed grip,
  // replacing 2014's "special" clause about being mounted.
  { id: 'lance', name: 'Lance', category: 'martial', melee: true, damage: { count: 1, die: 12, type: 'piercing' }, properties: ['reach'], mastery: 'topple', weight: 6, cost: 1000, note: 'Disadvantage when you attack a target within 5 feet, and it takes two hands unless you are mounted.', in2024: { damage: { count: 1, die: 10, type: 'piercing' }, properties: ['heavy', 'reach', 'two-handed'], note: 'Two-handed unless you are mounted.' } },
  { id: 'longsword', name: 'Longsword', category: 'martial', melee: true, damage: { count: 1, die: 8, type: 'slashing' }, versatileDie: 10, properties: ['versatile'], mastery: 'sap', weight: 3, cost: 1500 },
  { id: 'maul', name: 'Maul', category: 'martial', melee: true, damage: { count: 2, die: 6, type: 'bludgeoning' }, properties: ['heavy', 'two-handed'], mastery: 'topple', weight: 10, cost: 1000 },
  { id: 'morningstar', name: 'Morningstar', category: 'martial', melee: true, damage: { count: 1, die: 8, type: 'piercing' }, properties: [], mastery: 'sap', weight: 4, cost: 1500 },
  { id: 'pike', name: 'Pike', category: 'martial', melee: true, damage: { count: 1, die: 10, type: 'piercing' }, properties: ['heavy', 'reach', 'two-handed'], mastery: 'push', polearm: true, weight: 18, cost: 500 },
  { id: 'rapier', name: 'Rapier', category: 'martial', melee: true, damage: { count: 1, die: 8, type: 'piercing' }, properties: ['finesse'], mastery: 'vex', weight: 2, cost: 2500, note: 'The best finesse die: everything a Dexterity melee build wants in one hand.' },
  { id: 'scimitar', name: 'Scimitar', category: 'martial', melee: true, damage: { count: 1, die: 6, type: 'slashing' }, properties: ['finesse', 'light'], mastery: 'nick', weight: 3, cost: 2500 },
  { id: 'shortsword', name: 'Shortsword', category: 'martial', melee: true, damage: { count: 1, die: 6, type: 'piercing' }, properties: ['finesse', 'light'], mastery: 'vex', weight: 2, cost: 1000, note: 'Finesse and light, so it works in either hand for a two-weapon build.' },
  // 2024 raised the trident a die step, which is the only thing that ever made
  // anyone pick one over a spear costing a twentieth as much.
  { id: 'trident', name: 'Trident', category: 'martial', melee: true, damage: { count: 1, die: 6, type: 'piercing' }, versatileDie: 8, properties: ['thrown', 'versatile'], range: { normal: 20, long: 60 }, mastery: 'topple', weight: 4, cost: 500, in2024: { damage: { count: 1, die: 8, type: 'piercing' }, versatileDie: 10 } },
  { id: 'war-pick', name: 'War pick', category: 'martial', melee: true, damage: { count: 1, die: 8, type: 'piercing' }, properties: [], mastery: 'sap', weight: 2, cost: 500, in2024: { properties: ['versatile'], versatileDie: 10 } },
  { id: 'warhammer', name: 'Warhammer', category: 'martial', melee: true, damage: { count: 1, die: 8, type: 'bludgeoning' }, versatileDie: 10, properties: ['versatile'], mastery: 'push', weight: 2, cost: 1500, in2024: { weight: 5 } },
  { id: 'whip', name: 'Whip', category: 'martial', melee: true, damage: { count: 1, die: 4, type: 'slashing' }, properties: ['finesse', 'reach'], mastery: 'slow', weight: 3, cost: 200, note: 'Reach on a finesse weapon, at the cost of the worst damage die in the martial list.' },

  // ---------------------------------------------------------- martial ranged
  { id: 'blowgun', name: 'Blowgun', category: 'martial', melee: false, damage: { count: 1, die: 1, type: 'piercing' }, properties: ['ammunition', 'loading'], ammo: 'blowgun-needles', range: { normal: 25, long: 100 }, mastery: 'vex', weight: 1, cost: 1000 },
  { id: 'hand-crossbow', name: 'Hand crossbow', category: 'martial', melee: false, damage: { count: 1, die: 6, type: 'piercing' }, properties: ['ammunition', 'light', 'loading'], ammo: 'crossbow-bolts', range: { normal: 30, long: 120 }, mastery: 'vex', weight: 3, cost: 7500, note: 'With Crossbow Expert this is the highest attack count in the game.' },
  { id: 'heavy-crossbow', name: 'Heavy crossbow', category: 'martial', melee: false, damage: { count: 1, die: 10, type: 'piercing' }, properties: ['ammunition', 'heavy', 'loading', 'two-handed'], ammo: 'crossbow-bolts', range: { normal: 100, long: 400 }, mastery: 'push', weight: 18, cost: 5000 },
  { id: 'longbow', name: 'Longbow', category: 'martial', melee: false, damage: { count: 1, die: 8, type: 'piercing' }, properties: ['ammunition', 'heavy', 'two-handed'], ammo: 'arrows', range: { normal: 150, long: 600 }, mastery: 'slow', weight: 2, cost: 5000, note: 'The default ranged weapon: best die and range without the loading property.' },
  { id: 'net', name: 'Net', category: 'martial', melee: false, damage: { count: 0, die: 0, type: 'bludgeoning' }, properties: ['thrown'], range: { normal: 5, long: 15 }, weight: 3, cost: 100, note: 'Deals no damage; it restrains. Rarely worth an attack unless you have several.' },
  // Firearms were a Dungeon Master's Guide optional rule in 2014 and are on the
  // martial ranged table in 2024, so they exist for one edition and not the other.
  { id: 'pistol', name: 'Pistol', category: 'martial', melee: false, damage: { count: 1, die: 10, type: 'piercing' }, properties: ['ammunition', 'loading'], ammo: 'firearm-bullets', range: { normal: 30, long: 90 }, mastery: 'vex', weight: 3, cost: 25000, rulesets: ['2024'] },
  { id: 'musket', name: 'Musket', category: 'martial', melee: false, damage: { count: 1, die: 12, type: 'piercing' }, properties: ['ammunition', 'loading', 'two-handed'], ammo: 'firearm-bullets', range: { normal: 40, long: 120 }, mastery: 'slow', weight: 10, cost: 50000, rulesets: ['2024'] },
];

export const WEAPONS_BY_ID: Record<string, Weapon> = Object.fromEntries(
  WEAPONS.map((w) => [w.id, w]),
);

/** Apply a weapon's 2024 revision, if it has one and we are in 2024. */
function forRuleset(weapon: Weapon, ruleset: Ruleset): Weapon {
  return ruleset === '2024' && weapon.in2024 ? { ...weapon, ...weapon.in2024 } : weapon;
}

export function weaponsFor(ruleset: Ruleset): Weapon[] {
  return WEAPONS.filter((w) => (w.rulesets ?? RULESETS).includes(ruleset)).map((w) =>
    forRuleset(w, ruleset),
  );
}

const RULESETS: Ruleset[] = ['2014', '2024'];

/**
 * Ruleset-aware lookup. `WEAPONS_BY_ID` returns the base (2014) record, which
 * is wrong anywhere a 2024 character's own damage is being computed - a 2024
 * trident is a die step larger than a 2014 one.
 */
export function weaponById(id: string | undefined, ruleset: Ruleset = '2014'): Weapon | undefined {
  const weapon = id ? WEAPONS_BY_ID[id] : undefined;
  return weapon ? forRuleset(weapon, ruleset) : undefined;
}

export function isTwoHanded(weapon: Weapon): boolean {
  return weapon.properties.includes('two-handed');
}

/** Light weapons can be used in the off hand for two-weapon fighting. */
export function isLight(weapon: Weapon): boolean {
  return weapon.properties.includes('light');
}

export function hasProperty(weapon: Weapon, property: WeaponProperty): boolean {
  return weapon.properties.includes(property);
}

/** "1d8", "2d6" - and "—" for the net, which deals none. */
export function damageDice(weapon: Weapon, twoHanded = false): string {
  if (weapon.damage.count === 0) return '—';
  const die = twoHanded && weapon.versatileDie ? weapon.versatileDie : weapon.damage.die;
  return `${weapon.damage.count}d${die}`;
}

export const PROPERTY_LABELS: Record<WeaponProperty, string> = {
  ammunition: 'Ammunition',
  finesse: 'Finesse',
  heavy: 'Heavy',
  light: 'Light',
  loading: 'Loading',
  reach: 'Reach',
  thrown: 'Thrown',
  'two-handed': 'Two-handed',
  versatile: 'Versatile',
};
