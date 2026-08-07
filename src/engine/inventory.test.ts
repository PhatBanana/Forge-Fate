import { describe, expect, it } from 'vitest';
import { GEAR, GEAR_BY_ID, formatCost, formatWeight } from '../data/gear';
import { WEAPONS, WEAPONS_BY_ID, weaponsFor } from '../data/weapons';
import { ARMOR, ARMOR_BY_ID } from '../data/armor';
import { LANGUAGE_NAMES, languageByName } from '../data/languages';
import {
  ammunitionCarried,
  computeInventory,
  describePurse,
  emptyCoins,
  purseInCopper,
} from './inventory';
import { deriveBuild, emptyBuild } from './character';
import type { Build } from '../types';

/**
 * The equipment tables, and the one rule they drive.
 *
 * Nothing here changes a number the optimizer scores, so what is worth testing
 * is that the catalogue is coherent and that the weight adds up - including
 * the three sources a hand-written sheet always forgets: the weapon in your
 * hand, the armor on your body, and the coins in your purse.
 */

function build(overrides: Partial<Build> = {}): Build {
  return { ...emptyBuild(), ...overrides };
}

describe('the catalogue', () => {
  it('has unique ids', () => {
    const ids = GEAR.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('prices and weighs everything', () => {
    for (const item of GEAR) {
      expect(item.cost, item.name).toBeGreaterThanOrEqual(0);
      expect(item.weight, item.name).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(item.cost) && Number.isFinite(item.weight), item.name).toBe(true);
    }
  });

  /** A typo in an id would silently drop the item, so the ids are checked. */
  it('covers what a first-level character actually buys', () => {
    for (const id of [
      'rope-hempen',
      'rations',
      'torch',
      'bedroll',
      'thieves-tools',
      'backpack',
      'arrows',
      'healers-kit',
      'component-pouch',
      'spellbook',
      'pack-explorers',
      'lute',
      'smiths-tools',
    ]) {
      expect(GEAR_BY_ID[id], id).toBeDefined();
    }
  });

  /**
   * Barding is derived rather than transcribed, so what is worth checking is
   * that the rule reproduces the numbers the books actually print.
   */
  it('sizes barding at four times the cost and twice the weight', () => {
    expect(GEAR.filter((item) => item.id.startsWith('barding-'))).toHaveLength(12);
    expect(GEAR_BY_ID['barding-plate'].cost).toBe(600000);
    expect(GEAR_BY_ID['barding-plate'].weight).toBe(130);
    expect(GEAR_BY_ID['barding-chain-mail'].cost).toBe(30000);
    expect(GEAR_BY_ID['barding-chain-mail'].weight).toBe(110);
    // A horse in plate should not put its rider over their carrying capacity.
    expect(GEAR_BY_ID['barding-plate'].notCarried).toBe(true);
  });

  it('prints a cost in the largest whole denomination', () => {
    expect(formatCost(200)).toBe('2 gp');
    expect(formatCost(50)).toBe('5 sp');
    expect(formatCost(4)).toBe('4 cp');
    expect(formatCost(0)).toBe('—');
  });

  it('prints the fractional weights the tables really use', () => {
    expect(formatWeight(0.25)).toBe('¼ lb.');
    expect(formatWeight(0.5)).toBe('½ lb.');
    expect(formatWeight(0)).toBe('—');
  });
});

describe('what it weighs', () => {
  it('counts the armor and the weapon, not only the gear', () => {
    // Chain mail is 55 lb. and a greatsword 6, before anything is packed.
    const b = build();
    const bare = computeInventory(b, 15);
    expect(bare.weight).toBe(61);

    const packed = computeInventory({ ...b, gear: [{ gearId: 'rope-hempen', quantity: 1 }] }, 15);
    expect(packed.weight).toBe(71);
  });

  it('counts coins at fifty to the pound', () => {
    const b = build({ coins: { ...emptyCoins(), gp: 100 } });
    expect(computeInventory(b, 15).purseWeight).toBe(2);
  });

  /** A horse you own is not a horse you are carrying. */
  it('leaves mounts and vehicles off your back', () => {
    const b = build({ gear: [{ gearId: 'horse-riding', quantity: 1 }, { gearId: 'wagon', quantity: 1 }] });
    expect(computeInventory(b, 15).weight).toBe(computeInventory(build(), 15).weight);
  });

  it('reports capacity as Strength × 15, and the variant thresholds below it', () => {
    const inv = computeInventory(build(), 16);
    expect(inv.capacity).toBe(240);
    expect(inv.encumberedAt).toBe(80);
    expect(inv.heavilyEncumberedAt).toBe(160);
  });

  it('knows when you cannot pick it all up', () => {
    // Twenty chests is 500 lb.; a Strength of 8 can lift 120.
    const inv = computeInventory(build({ gear: [{ gearId: 'chest', quantity: 20 }] }), 8);
    expect(inv.weight).toBeGreaterThan(inv.capacity);
    expect(inv.overloaded).toBe(true);
  });
});

describe('the purse', () => {
  it('adds up in copper', () => {
    expect(purseInCopper({ cp: 3, sp: 2, ep: 1, gp: 4, pp: 1 })).toBe(3 + 20 + 50 + 400 + 1000);
  });

  it('reads the way a player would say it', () => {
    expect(describePurse({ ...emptyCoins(), gp: 12, sp: 4 })).toBe('12 gp 4 sp');
    expect(describePurse(emptyCoins())).toBe('nothing');
  });
});

describe('the build review', () => {
  it('flags a character who cannot lift what they listed', () => {
    const ctx = deriveBuild(build({ gear: [{ gearId: 'chest', quantity: 20 }] }));
    expect(ctx.inventory.overloaded).toBe(true);
  });
});

describe('the equipment tables agree with each other', () => {
  /**
   * Gear carried a cost from the start and weapons and armor did not, which
   * made "what is this character's kit worth" unanswerable for the two most
   * expensive things they own.
   */
  it('prices every weapon and every suit of armor', () => {
    for (const w of WEAPONS) {
      expect(w.cost, w.name).toBeGreaterThan(0);
      expect(Number.isInteger(w.cost), w.name).toBe(true);
    }
    for (const a of ARMOR) {
      expect(a.cost, a.name).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(a.cost), a.name).toBe(true);
    }
    // Only "no armor" is free.
    expect(ARMOR.filter((a) => a.cost === 0).map((a) => a.id)).toEqual(['none']);
  });

  it('prices them in the same copper as the gear table', () => {
    expect(formatCost(WEAPONS_BY_ID['greatsword'].cost)).toBe('50 gp');
    expect(formatCost(WEAPONS_BY_ID['dart'].cost)).toBe('5 cp');
    expect(formatCost(ARMOR_BY_ID['plate'].cost)).toBe('1500 gp');
  });

  it('carries the whole weapon and armor tables', () => {
    // 37 weapons in both editions, plus the two 2024 firearms; 12 suits of
    // armor plus the "no armor" row.
    expect(WEAPONS).toHaveLength(39);
    expect(weaponsFor('2014')).toHaveLength(37);
    expect(weaponsFor('2024')).toHaveLength(39);
    expect(ARMOR).toHaveLength(13);
    for (const id of ['net', 'lance', 'whip', 'blowgun', 'hand-crossbow']) {
      expect(WEAPONS_BY_ID[id], id).toBeDefined();
    }
  });
});

describe('ammunition', () => {
  /**
   * The whole feature rests on two links: a weapon knowing what it loads, and
   * that gear knowing how many come in a bundle. Either one missing turns a
   * quiver into a silently empty row.
   */
  it('gives every weapon that needs ammunition somewhere to get it', () => {
    for (const w of WEAPONS) {
      if (!w.properties.includes('ammunition')) continue;
      expect(w.ammo, w.name).toBeDefined();
      const gear = GEAR_BY_ID[w.ammo!];
      expect(gear, `${w.name} loads ${w.ammo}`).toBeDefined();
      expect(gear.bundle, gear.name).toBeGreaterThan(0);
    }
    // And nothing else claims to load anything.
    for (const w of WEAPONS) {
      if (!w.properties.includes('ammunition')) expect(w.ammo, w.name).toBeUndefined();
    }
  });

  it('counts pieces rather than purchases', () => {
    const stacks = ammunitionCarried(
      build({ gear: [{ gearId: 'arrows', quantity: 2 }], weapons: { magicBonus: {}, mainHandId: 'longbow' } }),
    );
    expect(stacks).toHaveLength(1);
    expect(stacks[0]).toMatchObject({ gearId: 'arrows', name: 'Arrows', total: 40 });
    expect(stacks[0].usedBy).toEqual(['Longbow']);
  });

  it('gives an empty-handed archer a row at zero, because that is the news', () => {
    const stacks = ammunitionCarried(build({ weapons: { magicBonus: {}, mainHandId: 'shortbow' } }));
    expect(stacks).toEqual([
      { gearId: 'arrows', name: 'Arrows', total: 0, usedBy: ['Shortbow'] },
    ]);
  });

  it('lists a stack nothing in hand can fire, with no weapon against it', () => {
    const stacks = ammunitionCarried(build({ gear: [{ gearId: 'sling-bullets', quantity: 1 }] }));
    expect(stacks[0]).toMatchObject({ total: 20, usedBy: [] });
  });

  it('puts a hand crossbow and a heavy crossbow on the same bolts', () => {
    const stacks = ammunitionCarried(
      build({
        gear: [{ gearId: 'crossbow-bolts', quantity: 1 }],
        weapons: { magicBonus: {}, mainHandId: 'hand-crossbow', offHandId: 'hand-crossbow' },
      }),
    );
    expect(stacks).toHaveLength(1);
    expect(stacks[0].usedBy).toEqual(['Hand crossbow', 'Hand crossbow']);
    expect(stacks[0].total).toBe(20);
  });

  it('ignores gear that is not sold by the bundle', () => {
    expect(ammunitionCarried(build({ gear: [{ gearId: 'rope-hempen', quantity: 1 }] }))).toEqual([]);
  });
});

describe('languages', () => {
  /** `build.languages` was written by nothing at all until there was a list. */
  it('covers the standard, exotic and secret lists', () => {
    for (const name of ['Common', 'Dwarvish', 'Draconic', 'Undercommon', 'Druidic', "Thieves' Cant"]) {
      expect(languageByName(name), name).toBeDefined();
    }
    expect(new Set(LANGUAGE_NAMES).size).toBe(LANGUAGE_NAMES.length);
  });
});
