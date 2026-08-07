import { describe, expect, it } from 'vitest';
import { CLASSES } from './classes';
import { GEAR_BY_ID } from './gear';
import {
  pickOptions,
  referencedCategories,
  referencedItems,
  resolveStartingItem,
  startingEquipmentFor,
} from './startingEquipment';
import type { Ruleset } from '../types';

const RULESETS: Ruleset[] = ['2014', '2024'];

/**
 * The table is generated from the SRD, so what is worth testing is not its
 * contents - the audit fixture is the contents - but the *seam*: every index
 * and every category the source names has to land on something this app
 * actually has. A reference that resolves to nothing is a line silently
 * missing from somebody's starting kit, which is the one failure mode here
 * that nobody would notice.
 */
describe('every reference resolves', () => {
  it.each(RULESETS)('resolves every item index in %s', (ruleset) => {
    const unresolved = referencedItems()
      .filter((ref) => !resolveStartingItem(ref, ruleset))
      .map((ref) => `${ref.index} (${ref.name})`);
    expect(unresolved).toEqual([]);
  });

  it('offers something for every category the source picks from', () => {
    const empty: string[] = [];
    for (const category of referencedCategories()) {
      for (const ruleset of RULESETS) {
        if (!pickOptions(category, ruleset).length) empty.push(`${category} in ${ruleset}`);
      }
    }
    expect(empty).toEqual([]);
  });

  it('pins the categories, so a new one cannot arrive unhandled', () => {
    // `pickOptions` returns an empty list for anything it does not know, which
    // would render as a picker with nothing in it. This is what catches that.
    expect(referencedCategories()).toEqual([
      'arcane-foci',
      'artisans-tools',
      'druidic-foci',
      'holy-symbols',
      'martial-melee-weapons',
      'martial-weapons',
      'musical-instruments',
      'simple-melee-weapons',
      'simple-weapons',
    ]);
  });
});

describe('what each class starts with', () => {
  it.each(RULESETS)('covers every class in %s except the Artificer', (ruleset) => {
    const missing = CLASSES.filter((klass) => !startingEquipmentFor(klass.id, ruleset)).map(
      (klass) => klass.id,
    );
    // The Artificer is in neither SRD, which is the same reason its subclass
    // features are unverified. Nothing is invented for it.
    expect(missing).toEqual(['artificer']);
  });

  it('gives a 2014 Fighter the four questions the book asks', () => {
    const kit = startingEquipmentFor('fighter', '2014')!;
    expect(kit.groups.map((g) => g.desc)).toEqual([
      '(a) chain mail or (b) leather armor, longbow, and 20 arrows',
      '(a) a martial weapon and a shield or (b) two martial weapons',
      '(a) a light crossbow and 20 bolts or (b) two handaxes',
      '(a) a dungeoneer’s pack or (b) an explorer’s pack',
    ]);
  });

  it('carries the 2024 gold, which the source states only in prose', () => {
    const kit = startingEquipmentFor('fighter', '2024')!;
    expect(kit.groups[0].options.map((o) => o.gold)).toEqual([4, 11, 155]);
  });

  it('carries no gold for 2014, whose starting coin is rolled apart from the kit', () => {
    for (const classId of ['fighter', 'wizard', 'cleric']) {
      const kit = startingEquipmentFor(classId, '2014')!;
      const gold = kit.groups.flatMap((g) => g.options.map((o) => o.gold));
      expect(gold.every((n) => n === 0), classId).toBe(true);
    }
  });

  it('gives a 2024 Fighter one question with whole kits as answers', () => {
    // The editions differ in kind, not only in contents, and the shape has to
    // carry both without either being a special case.
    const kit = startingEquipmentFor('fighter', '2024')!;
    expect(kit.groups).toHaveLength(1);
    expect(kit.groups[0].options).toHaveLength(3);
    expect(kit.groups[0].desc).toContain('155 GP');
  });
});

describe('resolving an item', () => {
  it('reads a shield as the flag it is, not an item', () => {
    // AC depends on whether it is on your arm, so this app stores it as a
    // boolean rather than a line in the pack.
    expect(resolveStartingItem({ index: 'shield', name: 'Shield', quantity: 1 }, '2014')).toEqual({
      kind: 'shield',
    });
  });

  it('counts ammunition in bundles, because that is what this app owns', () => {
    const arrows = resolveStartingItem({ index: 'arrow', name: 'Arrow', quantity: 20 }, '2014');
    expect(arrows).toEqual({ kind: 'gear', id: 'arrows', name: 'Arrows (20)', quantity: 1 });
    expect(GEAR_BY_ID.arrows.bundle).toBe(20);
  });

  it('rounds a part-bundle up rather than dropping it', () => {
    // The 2024 Rogue's kit is 20 bolts; a hypothetical 25 is two bundles, not
    // one and a quarter.
    const bolts = resolveStartingItem(
      { index: 'crossbow-bolt', name: 'Crossbow bolt', quantity: 25 },
      '2014',
    );
    expect(bolts).toMatchObject({ id: 'crossbow-bolts', quantity: 2 });
  });

  it('translates the names the source spells differently', () => {
    expect(
      resolveStartingItem({ index: 'leather-armor', name: 'Leather Armor', quantity: 1 }, '2014'),
    ).toEqual({ kind: 'armor', id: 'leather', name: 'Leather' });
    expect(
      resolveStartingItem({ index: 'explorers-pack', name: "Explorer's Pack", quantity: 1 }, '2014'),
    ).toMatchObject({ kind: 'gear', id: 'pack-explorers' });
  });

  it('gives up rather than guessing at something it does not have', () => {
    expect(resolveStartingItem({ index: 'flumph', name: 'Flumph', quantity: 1 }, '2014')).toBeNull();
  });
});

describe('what a pick offers', () => {
  it('offers only weapons of the category asked for', () => {
    const martialMelee = pickOptions('martial-melee-weapons', '2014');
    expect(martialMelee.map((o) => o.id)).toContain('greatsword');
    expect(martialMelee.map((o) => o.id)).not.toContain('longbow'); // martial, ranged
    expect(martialMelee.map((o) => o.id)).not.toContain('club'); // simple, melee
  });

  it('offers each edition its own weapon table', () => {
    // 2024 added firearms; a 2014 character must not be offered one.
    const ids2024 = pickOptions('martial-weapons', '2024').map((o) => o.id);
    const ids2014 = pickOptions('martial-weapons', '2014').map((o) => o.id);
    expect(new Set(ids2024)).not.toEqual(new Set(ids2014));
  });

  it('tells the three kinds of focus apart', () => {
    expect(pickOptions('holy-symbols', '2014').map((o) => o.id)).toEqual([
      'amulet',
      'emblem',
      'reliquary',
    ]);
    expect(pickOptions('arcane-foci', '2014').map((o) => o.id)).not.toContain('amulet');
    expect(pickOptions('druidic-foci', '2014').map((o) => o.id)).toContain('sprig-of-mistletoe');
  });
});
