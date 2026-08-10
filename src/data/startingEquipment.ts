import type { Ruleset } from '../types';
import { GEAR_BY_ID } from './gear';
import { ARMOR_BY_ID } from './armor';
import { weaponsFor } from './weapons';
import raw from './srd/srd-starting-equipment.json';
import { FORGE_STARTING_EQUIPMENT } from './forge/classes';

/**
 * What a 1st-level character of each class starts with.
 *
 * ## Classes only, and that is not a shortcut
 *
 * The SRD carries this for all twelve of its classes in both editions, as
 * structured data rather than prose, so this table is verified rather than
 * written. Backgrounds are absent because no licensed structured source has
 * them: SRD 5.1 contains exactly **one** background, and even that one's list
 * in the API is two items where the book has six. SRD 5.2 has four, and only
 * as a sentence of prose in a third-party aggregator. The app carries 13
 * backgrounds for 2014 and 16 for 2024; inventing kits for the other twelve
 * would be exactly the "written from the books" provenance the roadmap warns
 * about, applied to a table nobody could check.
 *
 * The Artificer has no entry for the same reason it has no verified subclass
 * features: it is not in either SRD.
 *
 * ## The shape, and why the two editions share it
 *
 * 2014 hands you a kit assembled from four or five separate questions - armor,
 * then a weapon, then a pack. 2024 asks **one** question whose answers are two
 * or three complete kits, plus "or take the gold instead". Both come out as a
 * list of groups, each a choose-one, so one renderer serves both editions and
 * neither is the special case.
 *
 * An option can also carry a *pick*: "any martial melee weapon" is a second
 * choice inside the first, and the number of picks is part of the data
 * ("two martial weapons" is one pick of two). Resolving those against this
 * app's own catalogues is what the rest of this file does.
 */

export interface StartingPick {
  /** The source's own words: "a martial weapon", "any simple melee weapon". */
  label: string;
  /** SRD equipment-category indices; more than one only for the 2024 Monk. */
  categories: string[];
  choose: number;
}

export interface StartingItemRef {
  index: string;
  name: string;
  quantity: number;
}

export interface StartingOption {
  items: StartingItemRef[];
  picks: StartingPick[];
  /**
   * Gold pieces this option also hands over.
   *
   * 2024 only, and read out of the source's sentence rather than its
   * structure - see `scripts/audit/refresh.mjs`, which explains why. It
   * matters because one 2024 option per class is *only* gold: without this
   * "or 155 GP" would render as an answer containing nothing at all.
   *
   * 2014 is always zero. Its starting gold is rolled separately and is not
   * part of the kit.
   */
  gold: number;
}

export interface StartingGroup {
  /** The source's own sentence, which is the clearest label there is. */
  desc: string;
  options: StartingOption[];
}

export interface StartingEquipment {
  fixed: StartingItemRef[];
  groups: StartingGroup[];
}

const TABLE = (raw as { records: Record<string, Record<string, StartingEquipment>> }).records;

/**
 * A kit, or null for a class that has none.
 *
 * Two sources, and the split is the provenance rule this project runs on.
 * `TABLE` is the SRD's own structured data, diffed against the source by the
 * audit. `FORGE_STARTING_EQUIPMENT` is written by hand, for classes that have
 * no book to check against because this project wrote them - so they are kept
 * out of the verified table rather than mixed into it, and consulted only
 * after it has had its say.
 *
 * Null is left for the **Artificer** alone. Its kit exists in a book this
 * project cannot read, and writing one would be putting words in the
 * publisher's mouth. That reasoning does not reach the app's own classes:
 * there is no book to misquote, and a class that cannot tell a first-level
 * player what they are holding is half a class.
 *
 * The same kit under both rulesets for the Forge four, because nothing about
 * them changed between editions - there was no earlier edition of them.
 */
export function startingEquipmentFor(
  classId: string,
  ruleset: Ruleset,
): StartingEquipment | null {
  return TABLE[ruleset]?.[classId] ?? FORGE_STARTING_EQUIPMENT[classId] ?? null;
}

// ------------------------------------------------------- resolving the items

/**
 * What one line of a kit turns into on a character.
 *
 * A shield is its own kind because this app does not carry one as an item: it
 * is a boolean on `defenses`, since whether it is on your arm changes your AC
 * and whether it is in your pack does not.
 */
export type Resolved =
  | { kind: 'weapon'; id: string; name: string; quantity: number }
  | { kind: 'armor'; id: string; name: string }
  | { kind: 'gear'; id: string; name: string; quantity: number }
  | { kind: 'shield' };

/**
 * SRD equipment indices that are not this app's ids for the same thing.
 *
 * Almost all of it is spelling - `explorers-pack` against `pack-explorers` -
 * and the table is here rather than guessed at by fuzzy matching because a
 * near-miss would silently hand somebody the wrong item. `startingEquipment.test.ts`
 * asserts that every index in the fixture resolves, so a source that renames
 * something fails a test rather than quietly dropping a line from a kit.
 */
const ALIAS: Record<string, string> = {
  // Ammunition: the source counts single arrows, this app counts bundles of
  // twenty and divides at the point of use.
  arrow: 'arrows',
  'crossbow-bolt': 'crossbow-bolts',
  // Packs.
  'burglars-pack': 'pack-burglars',
  'diplomats-pack': 'pack-diplomats',
  'dungeoneers-pack': 'pack-dungeoneers',
  // 2024 spells one of them without the possessive `s`.
  'dungeoneer-pack': 'pack-dungeoneers',
  'entertainers-pack': 'pack-entertainers',
  'explorers-pack': 'pack-explorers',
  'priests-pack': 'pack-priests',
  'scholars-pack': 'pack-scholars',
  // Armor, where the source says "armor" in the name and this app does not.
  'leather-armor': 'leather',
  'studded-leather-armor': 'studded-leather',
  // Weapons.
  'crossbow-light': 'light-crossbow',
  robe: 'robes',
  /*
    2024 lists "Holy Symbol" as a concrete item using the *category* index,
    where the app has three of them - amulet, emblem, reliquary. The plain
    amulet stands in; an emblem is borne on a shield and a reliquary is
    heavier, so neither is a safe default. It is one line in the inventory and
    a player who wants a different one can swap it.
  */
  'holy-symbols': 'amulet',
};

const idFor = (index: string) => ALIAS[index] ?? index;

/**
 * Resolve one reference against the catalogues, or null if nothing matches.
 *
 * Order matters: weapons before gear, because a few names exist in both - a
 * quarterstaff is a weapon here and the gear list has none, but a source that
 * grew an entry would otherwise land in the wrong catalogue.
 */
export function resolveStartingItem(
  ref: StartingItemRef,
  ruleset: Ruleset,
): Resolved | null {
  if (ref.index === 'shield') return { kind: 'shield' };

  const id = idFor(ref.index);
  const weapon = weaponsFor(ruleset).find((w) => w.id === id);
  if (weapon) return { kind: 'weapon', id, name: weapon.name, quantity: ref.quantity };

  const armor = ARMOR_BY_ID[id];
  if (armor && armor.id !== 'none') return { kind: 'armor', id, name: armor.name };

  const gear = GEAR_BY_ID[id];
  if (gear) {
    /*
      The source counts pieces and this app counts purchases, so twenty arrows
      is one bundle rather than twenty. Rounded up, because half a bundle is
      not a thing you can own.
    */
    const quantity = gear.bundle ? Math.ceil(ref.quantity / gear.bundle) : ref.quantity;
    return { kind: 'gear', id, name: gear.name, quantity };
  }

  return null;
}

// ------------------------------------------------------ resolving the picks

/**
 * What a pick offers, by SRD category.
 *
 * Weapon categories are answered from the weapon table itself rather than
 * stored, so a pick can never offer a weapon the edition does not have. The
 * focus and tool categories are answered from the gear table by the suffix
 * their names carry - `Amulet (holy symbol)` - which is how that catalogue
 * already distinguishes them.
 */
export function pickOptions(
  category: string,
  ruleset: Ruleset,
): { id: string; name: string; kind: 'weapon' | 'gear' }[] {
  const weapons = weaponsFor(ruleset);
  const byWeapon = (test: (w: (typeof weapons)[number]) => boolean) =>
    weapons.filter(test).map((w) => ({ id: w.id, name: w.name, kind: 'weapon' as const }));

  const byGear = (test: (name: string, category: string) => boolean) =>
    Object.values(GEAR_BY_ID)
      .filter((g) => test(g.name.toLowerCase(), g.category))
      .map((g) => ({ id: g.id, name: g.name, kind: 'gear' as const }));

  switch (category) {
    case 'simple-weapons':
      return byWeapon((w) => w.category === 'simple');
    case 'simple-melee-weapons':
      return byWeapon((w) => w.category === 'simple' && w.melee);
    case 'martial-weapons':
      return byWeapon((w) => w.category === 'martial');
    case 'martial-melee-weapons':
      return byWeapon((w) => w.category === 'martial' && w.melee);
    case 'arcane-foci':
      return byGear((name) => name.includes('(arcane focus)'));
    case 'druidic-foci':
      return byGear((name) => name.includes('(druidic focus)'));
    case 'holy-symbols':
      return byGear((name) => name.includes('(holy symbol)'));
    case 'musical-instruments':
      return byGear((_name, gearCategory) => gearCategory === 'instrument');
    case 'artisans-tools':
      return byGear((_name, gearCategory) => gearCategory === 'artisan');
    default:
      return [];
  }
}

/** Every category the fixture references, for the test that pins them. */
export function referencedCategories(): string[] {
  const out = new Set<string>();
  for (const edition of Object.values(TABLE)) {
    for (const entry of Object.values(edition)) {
      for (const group of entry.groups) {
        for (const option of group.options) {
          for (const pick of option.picks) pick.categories.forEach((c) => out.add(c));
        }
      }
    }
  }
  return [...out].sort();
}

/** Every item index the fixture references, for the same reason. */
export function referencedItems(): StartingItemRef[] {
  const out = new Map<string, StartingItemRef>();
  for (const edition of Object.values(TABLE)) {
    for (const entry of Object.values(edition)) {
      const add = (ref: StartingItemRef) => out.set(ref.index, ref);
      entry.fixed.forEach(add);
      for (const group of entry.groups) {
        for (const option of group.options) option.items.forEach(add);
      }
    }
  }
  return [...out.values()];
}
