import { describe, expect, it } from 'vitest';
import { deriveBuild, emptyBuild } from './character';
import { applySetAbilities, attunementLimit, consumeItem, isConsumable, quantityOf } from './items';
import { parseNotation, rollNotation } from './dice';
import type { ItemEffects } from './items';
import type { CarriedItem } from './items';
import { KIND_ORDER, MAGIC_ITEMS, RARITY_LABELS, magicItemById } from '../data/magicItems';
import type { Build } from '../types';

/**
 * Magic items.
 *
 * The two things worth guarding are the ones a plain sum would get wrong:
 * an item does nothing until it is attuned, and several only work in
 * conditions the rest of the build decides.
 */

function withItems(items: CarriedItem[], overrides: Partial<Build> = {}) {
  return deriveBuild({
    ...emptyBuild(),
    raceId: 'human',
    classes: [{ classId: 'fighter', level: 5, subclassId: 'champion' }],
    baseScores: { str: 15, dex: 14, con: 14, int: 10, wis: 10, cha: 8 },
    items,
    ...overrides,
  });
}

const attuned = (itemId: string): CarriedItem => ({ itemId, attuned: true });
const carried = (itemId: string): CarriedItem => ({ itemId, attuned: false });

describe('the catalogue', () => {
  it('has unique ids', () => {
    const ids = MAGIC_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every item that claims an effect something to apply', () => {
    for (const item of MAGIC_ITEMS) {
      if (!item.effect) continue;
      expect(Object.keys(item.effect).length, item.name).toBeGreaterThan(0);
    }
  });

  it('only requires attunement where the item says so', () => {
    expect(magicItemById('weapon-plus-1')!.attunement).toBe(false);
    expect(magicItemById('cloak-of-protection')!.attunement).toBe(true);
  });
});

describe('attunement', () => {
  it('does nothing until the item is attuned', () => {
    const notYet = withItems([carried('cloak-of-protection')]);
    const now = withItems([attuned('cloak-of-protection')]);
    expect(now.ac.total).toBe(notYet.ac.total + 1);
    expect(notYet.items[0].inactiveReason).toMatch(/not attuned/i);
  });

  it('stops applying past the third attuned item', () => {
    const ctx = withItems([
      attuned('cloak-of-protection'),
      attuned('ring-of-protection'),
      attuned('stone-of-good-luck'),
      attuned('amulet-of-health'),
    ]);
    expect(ctx.attunedCount).toBe(4);
    expect(ctx.attunementSlots).toBe(3);
    // The fourth is carried but inert.
    expect(ctx.items[3].active).toBe(false);
    expect(ctx.items[3].inactiveReason).toMatch(/attunement slots/i);
    expect(ctx.items[0].active).toBe(true);
  });

  it('gives an Artificer more slots as they level', () => {
    expect(attunementLimit(0)).toBe(3);
    expect(attunementLimit(9)).toBe(3);
    expect(attunementLimit(10)).toBe(4);
    expect(attunementLimit(14)).toBe(5);
    expect(attunementLimit(18)).toBe(6);
  });

  it('does not count an item that needs no attunement against the limit', () => {
    const ctx = withItems([carried('weapon-plus-1'), attuned('cloak-of-protection')]);
    expect(ctx.attunedCount).toBe(1);
    // The weapon works without attunement.
    expect(ctx.items[0].active).toBe(true);
  });
});

describe('armor class', () => {
  it('adds a protective item to the total', () => {
    const bare = withItems([]);
    const cloaked = withItems([attuned('cloak-of-protection')]);
    expect(cloaked.ac.total).toBe(bare.ac.total + 1);
    expect(cloaked.ac.lines.some((l) => l.label === 'Magic items')).toBe(true);
  });

  it('stacks a cloak and a ring, as the app reads them', () => {
    const both = withItems([attuned('cloak-of-protection'), attuned('ring-of-protection')]);
    expect(both.ac.total).toBe(withItems([]).ac.total + 2);
  });

  /** Bracers of Defense do nothing the moment you put armor on. */
  it('switches Bracers of Defense off in armor', () => {
    const armoured = withItems([attuned('bracers-of-defense')]);
    expect(armoured.items[0].active).toBe(false);
    expect(armoured.items[0].inactiveReason).toMatch(/no armor/i);

    const unarmoured = withItems([attuned('bracers-of-defense')], {
      defenses: { ...emptyBuild().defenses, armorId: 'none', shield: false },
    });
    expect(unarmoured.items[0].active).toBe(true);
    expect(unarmoured.ac.total).toBe(
      withItems([], { defenses: { ...emptyBuild().defenses, armorId: 'none', shield: false } })
        .ac.total + 2,
    );
  });

  it('switches them off for a shield too', () => {
    const ctx = withItems([attuned('bracers-of-defense')], {
      defenses: { ...emptyBuild().defenses, armorId: 'none', shield: true },
    });
    expect(ctx.items[0].inactiveReason).toMatch(/no shield/i);
  });
});

describe('ability scores', () => {
  it('raises a score to the value the item sets', () => {
    const ctx = withItems([attuned('amulet-of-health')]);
    expect(ctx.scores.con).toBe(19);
  });

  /** A floor, not a bonus: it does nothing to someone already above it. */
  it('does nothing when the score is already higher', () => {
    const ctx = withItems([attuned('amulet-of-health')], {
      baseScores: { str: 15, dex: 14, con: 20, int: 10, wis: 10, cha: 8 },
    });
    expect(ctx.scores.con).toBe(20);
  });

  it('carries the new score through to hit points', () => {
    const before = withItems([]);
    const after = withItems([attuned('amulet-of-health')]);
    // Constitution 14 to 19 is two more per level, across five levels.
    expect(after.hp.total).toBeGreaterThan(before.hp.total);
  });

  it('takes the higher of two items setting the same score', () => {
    const ctx = withItems([attuned('gauntlets-of-ogre-power'), attuned('amulet-of-health')]);
    expect(ctx.scores.str).toBe(19);
    expect(ctx.scores.con).toBe(19);
  });
});

describe('weapons', () => {
  it('adds the bonus to the attack line', () => {
    const plain = withItems([]);
    const magic = withItems([carried('weapon-plus-2')]);
    expect(magic.attacks[0].toHit).toBe(plain.attacks[0].toHit + 2);
  });

  it('does not stack two magic weapons, since you swing one', () => {
    const ctx = withItems([carried('weapon-plus-1'), carried('weapon-plus-3')]);
    expect(ctx.attacks[0].toHit).toBe(withItems([]).attacks[0].toHit + 3);
  });

  it('raises damage per round along with the attack', () => {
    expect(withItems([carried('weapon-plus-3')]).dpr.sustained).toBeGreaterThan(
      withItems([]).dpr.sustained,
    );
  });

  /**
   * Flame Tongue's 2d6 and the Scimitar of Speed's extra swing are the whole
   * reason to carry either, and for two phases neither reached the curve -
   * both items carried a note admitting it. A Fighter 5 swings twice, so the
   * fire lands twice a round.
   */
  it('counts a weapon rider on every hit', () => {
    const plain = withItems([]);
    const burning = withItems([attuned('flame-tongue')]);
    expect(burning.dpr.sustained).toBeGreaterThan(plain.dpr.sustained);

    const line = burning.dpr.lines.find((l) => l.label.includes('Flame Tongue'));
    expect(line, 'the fire should be itemised, not folded into the total').toBeDefined();
    expect(line!.label).toContain('2d6 fire');
    // Two swings at roughly 65% to hit, 7 average on 2d6: around 9.
    expect(line!.value).toBeGreaterThan(6);
    expect(line!.value).toBeLessThan(12);
  });

  /** A crit-only rider is worth far less than a per-hit one of the same size. */
  it('counts a crit-only rider only on a critical', () => {
    const vicious = withItems([carried('vicious-weapon')]);
    const line = vicious.dpr.lines.find((l) => l.label.includes('Vicious Weapon'));
    expect(line).toBeDefined();
    // Two swings at 7 damage, and this build is a Champion - Improved Critical
    // crits on a 19 too, so it lands twice as often as it would otherwise.
    // 2 × 0.1 × 7 = 1.4, which is also a check that the crit range reaches here.
    expect(line!.value).toBeCloseTo(1.4, 1);
    expect(line!.detail).toMatch(/critical/i);

    // The same rider on a build without the wider range is worth half as much.
    const plainCrit = deriveBuild({
      ...emptyBuild(),
      raceId: 'human',
      classes: [{ classId: 'fighter', level: 5, subclassId: 'battle-master' }],
      baseScores: { str: 15, dex: 14, con: 14, int: 10, wis: 10, cha: 8 },
      items: [carried('vicious-weapon')],
    });
    const narrow = plainCrit.dpr.lines.find((l) => l.label.includes('Vicious Weapon'));
    expect(narrow!.value).toBeCloseTo(0.7, 1);
  });

  it('counts the extra swing a Scimitar of Speed grants', () => {
    const ctx = withItems([attuned('scimitar-of-speed')]);
    const line = ctx.dpr.lines.find((l) => l.label.includes('Extra attack'));
    expect(line).toBeDefined();
    expect(line!.value).toBeGreaterThan(0);
    // And it is a real increase, not only a label.
    expect(ctx.dpr.sustained).toBeGreaterThan(withItems([carried('weapon-plus-2')]).dpr.sustained);
  });

  /**
   * A Dragon Slayer's 3d6 only lands against dragons. Folding that into a
   * general curve would assume every fight is against one, so it stays a note.
   */
  it('leaves riders that depend on the target out of the curve', () => {
    const slayer = withItems([carried('dragon-slayer')]);
    expect(slayer.dpr.lines.some((l) => l.label.includes('Dragon Slayer'))).toBe(false);
  });
});

describe('spellcasting items', () => {
  it('raises the save DC', () => {
    const wizard = (items: CarriedItem[]) =>
      deriveBuild({
        ...emptyBuild(),
        raceId: 'human',
        classes: [{ classId: 'wizard', level: 9, subclassId: 'evocation' }],
        baseScores: { str: 8, dex: 14, con: 14, int: 15, wis: 12, cha: 10 },
        items,
      });

    const plain = wizard([]);
    const boosted = wizard([attuned('amulet-of-the-devout-2')]);
    expect(boosted.spellSaveDc).toBe(plain.spellSaveDc! + 2);
  });
});

describe('free-form items', () => {
  it('records a named item without pretending to know what it does', () => {
    const ctx = withItems([{ customName: 'Sword of the Sunless Deep', attuned: true, note: 'Homebrew' }]);
    expect(ctx.items[0].name).toBe('Sword of the Sunless Deep');
    expect(ctx.items[0].active).toBe(false);
    expect(ctx.items[0].inactiveReason).toMatch(/recorded only/i);
    // And it changes nothing.
    expect(ctx.ac.total).toBe(withItems([]).ac.total);
  });
});

describe('a character with no items', () => {
  it('is completely unaffected', () => {
    const ctx = withItems([]);
    expect(ctx.items).toEqual([]);
    expect(ctx.itemEffects.ac).toBe(0);
    expect(ctx.attunedCount).toBe(0);
  });
});

describe('the whole catalogue', () => {
  /**
   * The catalogue stopped being "items that change a number" once a character
   * had an inventory to write a Bag of Holding into. What has to stay true is
   * that both halves are coherent: unique ids, a summary on everything, and an
   * effect only where the app can honestly compute one.
   */
  it('has unique ids and names', () => {
    const ids = MAGIC_ITEMS.map((i) => i.id);
    const names = MAGIC_ITEMS.map((i) => i.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('says what every item does, whether or not it computes anything', () => {
    for (const item of MAGIC_ITEMS) {
      expect(item.summary.length, item.name).toBeGreaterThan(10);
      expect(KIND_ORDER, item.name).toContain(item.kind);
      expect(RARITY_LABELS[item.rarity], item.name).toBeDefined();
    }
  });

  it('covers every kind the books do', () => {
    for (const kind of KIND_ORDER) {
      expect(MAGIC_ITEMS.some((i) => i.kind === kind), kind).toBe(true);
    }
  });

  /**
   * Ten families were carried as a single generic row - one "Figurine of
   * Wondrous Power" standing in for nine statuettes of three different
   * rarities. A player who finds a Silver Raven wants to write down a Silver
   * Raven, so the SRD's variants are each their own entry.
   */
  it('enumerates the families the books enumerate', () => {
    // Each family keeps its generic row too, so a character who wrote down
    // "Dragon Scale Mail" before the colours existed still has an item. Only
    // this one shares a prefix with its variants.
    const countStarting = (prefix: string) =>
      MAGIC_ITEMS.filter((i) => i.id.startsWith(prefix)
        && i.id !== 'figurine-of-wondrous-power').length;

    expect(countStarting('dragon-scale-mail-')).toBe(10);
    expect(countStarting('figurine-')).toBe(9);
    expect(countStarting('horn-of-valhalla-')).toBe(4);
    expect(countStarting('bag-of-tricks-')).toBe(3);
    expect(countStarting('elemental-gem-')).toBe(4);
    expect(countStarting('feather-token-')).toBe(6);
    expect(countStarting('carpet-of-flying-')).toBe(4);
    expect(countStarting('crystal-ball-')).toBe(3);
    expect(countStarting('manual-of-golems-')).toBe(4);
    expect(countStarting('spell-scroll-')).toBe(10);
    expect(countStarting('ring-of-elemental-command-')).toBe(4);

    // One per damage type, in both the potion and the ring.
    expect(countStarting('potion-of-resistance-')).toBe(10);
    expect(countStarting('ring-of-resistance-')).toBe(10);
  });

  /** Rarity is the one field a player reads off the sheet and trusts. */
  it('rates the variants the way the SRD does', () => {
    expect(magicItemById('figurine-silver-raven')?.rarity).toBe('uncommon');
    expect(magicItemById('figurine-obsidian-steed')?.rarity).toBe('very-rare');
    expect(magicItemById('horn-of-valhalla-silver')?.rarity).toBe('rare');
    expect(magicItemById('horn-of-valhalla-iron')?.rarity).toBe('legendary');
    expect(magicItemById('spell-scroll-cantrip')?.rarity).toBe('common');
    expect(magicItemById('spell-scroll-9th')?.rarity).toBe('legendary');
    expect(magicItemById('crystal-ball-true-seeing')?.rarity).toBe('legendary');
  });

  it('carries the items a player will actually look for', () => {
    for (const id of [
      'bag-of-holding',
      'deck-of-many-things',
      'holy-avenger',
      'flame-tongue',
      'ring-of-spell-storing',
      'staff-of-the-magi',
      'portable-hole',
      'pearl-of-power',
      'belt-of-storm-giant-strength',
      'spell-scroll',
      'immovable-rod',
      'sun-blade',
    ]) {
      expect(magicItemById(id), id).toBeDefined();
    }
  });
});

describe('an increase with a ceiling', () => {
  /**
   * An Ioun Stone raises a score by 2 but never past 20, which is a different
   * rule from the usual cap of 30 - and it is not wasted at 19, it just stops.
   */
  it('stops at the item’s own maximum rather than the usual one', () => {
    const stone = magicItemById('ioun-stone-intellect')!;
    const effects = {
      ac: 0,
      saves: 0,
      weaponBonus: 0,
      spellBonus: 0,
      abilityChecks: 0,
      setAbility: {},
      abilityBonus: { int: 2 },
      abilityBonusCap: { int: 20 },
      speed: 0,
      damageRiders: [],
      extraBonusAttack: false,
      ammunitionBonus: 0,
      noStealthDisadvantage: false,
      noStrengthRequirement: false,
      sight: [],
      lines: [],
    } satisfies ItemEffects;
    expect(applySetAbilities({ str: 10, dex: 10, con: 10, int: 19, wis: 10, cha: 10 }, effects).int).toBe(20);
    expect(applySetAbilities({ str: 10, dex: 10, con: 10, int: 14, wis: 10, cha: 10 }, effects).int).toBe(16);
    expect(stone.effect?.abilityBonusCap).toBe(20);
  });
});

describe('items that correct a number the app was getting wrong', () => {
  /**
   * The catalogue lists 371 items and computes about a fifth of them. These
   * three moved into that fifth because the machinery to honour them already
   * existed and their absence made the app state something false — not merely
   * something incomplete, which is the ordinary case and stays a summary.
   */

  it('lets Mithral Armor clear the Stealth disadvantage it is famous for', () => {
    // Without this the app told a Mithral-clad character their armor gave
    // disadvantage on Stealth, which is the exact opposite of the item.
    const plain = withItems([], { defenses: { ...emptyBuild().defenses, armorId: 'chain-mail' } });
    expect(plain.ac.stealthDisadvantage).toBe(true);

    const mithral = withItems([carried('mithral-armor')], {
      defenses: { ...emptyBuild().defenses, armorId: 'chain-mail' },
    });
    expect(mithral.ac.stealthDisadvantage).toBe(false);
  });

  it('lets Mithral Armor clear the Strength requirement too', () => {
    // Chain mail wants Strength 13; at 8 it costs ten feet of speed.
    const weak = { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 8 };
    const plain = withItems([], {
      baseScores: weak,
      defenses: { ...emptyBuild().defenses, armorId: 'chain-mail' },
    });
    expect(plain.ac.speedPenalty).toBe(10);

    const mithral = withItems([carried('mithral-armor')], {
      baseScores: weak,
      defenses: { ...emptyBuild().defenses, armorId: 'chain-mail' },
    });
    expect(mithral.ac.speedPenalty).toBe(0);
  });

  it('carries a Mithral bonus without inventing armor class', () => {
    // It is not a +1: the item removes penalties and nothing else.
    const mithral = withItems([carried('mithral-armor')], {
      defenses: { ...emptyBuild().defenses, armorId: 'chain-mail' },
    });
    const plain = withItems([], { defenses: { ...emptyBuild().defenses, armorId: 'chain-mail' } });
    expect(mithral.ac.total).toBe(plain.ac.total);
  });

  it('gives magic ammunition to the bow and not to the greatsword', () => {
    // The whole reason this is not `weaponBonus`: a quiver of +3 arrows must
    // not improve the sword on your back.
    const bow = withItems([carried('ammunition-plus-2')], {
      weapons: { magicBonus: {}, mainHandId: 'longbow' },
    });
    const sword = withItems([carried('ammunition-plus-2')], {
      weapons: { magicBonus: {}, mainHandId: 'greatsword' },
    });
    const plainSword = withItems([], { weapons: { magicBonus: {}, mainHandId: 'greatsword' } });

    expect(bow.attacks[0].toHit).toBe(
      withItems([], { weapons: { magicBonus: {}, mainHandId: 'longbow' } }).attacks[0].toHit + 2,
    );
    expect(sword.attacks[0].toHit).toBe(plainSword.attacks[0].toHit);
  });

  it('names the ammunition in the breakdown rather than calling it a weapon', () => {
    const bow = withItems([carried('ammunition-plus-2')], {
      weapons: { magicBonus: {}, mainHandId: 'longbow' },
    });
    expect(bow.attacks[0].toHitLines.map((l) => l.label)).toContain('Magic ammunition +2');
  });

  it('does not stack ammunition with the weapon\'s own bonus', () => {
    // A +1 arrow from a +1 bow is +1, not +2. The better of the two applies,
    // which is the rule two weapon bonuses already follow.
    const both = withItems([carried('ammunition-plus-1')], {
      weapons: { magicBonus: { longbow: 2 }, mainHandId: 'longbow' },
    });
    const bowOnly = withItems([], {
      weapons: { magicBonus: { longbow: 2 }, mainHandId: 'longbow' },
    });
    expect(both.attacks[0].toHit).toBe(bowOnly.attacks[0].toHit);
  });

  it('gives the Sword of Life Stealing its crit damage', () => {
    // The same shape as a Vicious Weapon: it triggers on a natural 20 against
    // anything, so it belongs in the curve rather than in a note.
    const sword = withItems([attuned('sword-of-life-stealing')], {
      weapons: { magicBonus: {}, mainHandId: 'longsword' },
    });
    const rider = sword.itemEffects.damageRiders.find((r) => r.label.includes('Life Stealing'));
    expect(rider).toMatchObject({ dice: '3d6', type: 'necrotic', when: 'crit' });
  });

  it('does nothing with the Sword of Life Stealing until it is attuned', () => {
    const sword = withItems([carried('sword-of-life-stealing')], {
      weapons: { magicBonus: {}, mainHandId: 'longsword' },
    });
    expect(sword.itemEffects.damageRiders).toEqual([]);
  });
});

/**
 * Consumables.
 *
 * A potion and a scroll are the two things in the books you use up, and the
 * model had no concept of either until now: no count, no way to record which
 * spell is on a scroll, and no way to spend one. The rules below are small,
 * but every one of them is a way an inventory can quietly go wrong.
 */
describe('potions and scrolls', () => {
  it('counts exactly the two kinds you use up', () => {
    for (const item of MAGIC_ITEMS) {
      expect(isConsumable(item), item.name).toBe(item.kind === 'potion' || item.kind === 'scroll');
    }
  });

  it('treats a custom item as permanent', () => {
    // A named-by-hand item has no kind, so it cannot be spent - and offering
    // a Use button on something the app knows nothing about would be a guess.
    expect(isConsumable(null)).toBe(false);
  });

  it('reads an absent quantity as one', () => {
    // Every character saved before consumables existed has no quantity at
    // all. Reading that as nothing would empty their packs.
    expect(quantityOf({ itemId: 'potion-of-healing', attuned: false })).toBe(1);
    expect(quantityOf({ itemId: 'potion-of-healing', attuned: false, quantity: 0 })).toBe(1);
  });

  it('decrements a stack', () => {
    const before: CarriedItem[] = [{ itemId: 'potion-of-healing', attuned: false, quantity: 3 }];
    expect(consumeItem(before, 0)).toEqual([
      { itemId: 'potion-of-healing', attuned: false, quantity: 2 },
    ]);
  });

  it('drops the line at the last one', () => {
    // Not a row reading "0 x Potion of Healing". A pack does not list the
    // potion you no longer have.
    const before: CarriedItem[] = [
      { itemId: 'potion-of-healing', attuned: false },
      { itemId: 'cloak-of-protection', attuned: true },
    ];
    expect(consumeItem(before, 0)).toEqual([{ itemId: 'cloak-of-protection', attuned: true }]);
  });

  it('leaves the list alone when there is nothing at that index', () => {
    const before: CarriedItem[] = [{ itemId: 'potion-of-healing', attuned: false }];
    expect(consumeItem(before, 4)).toBe(before);
  });

  it('does not let a stack multiply a permanent effect', () => {
    // The quantity field is only meaningful on consumables, and the effect
    // engine must not read it: three Cloaks of Protection are one +1, not +3.
    const one = withItems([attuned('cloak-of-protection')]);
    const three = withItems([{ itemId: 'cloak-of-protection', attuned: true, quantity: 3 }]);
    expect(three.itemEffects.ac).toBe(one.itemEffects.ac);
    expect(three.itemEffects.saves).toBe(one.itemEffects.saves);
  });

  it('gives the healing potions dice the app can actually roll', () => {
    // The four in the SRD, and the point of the structured field: without it
    // "Regain 2d4 + 2 hit points" is a sentence rather than a heal.
    const healers = MAGIC_ITEMS.filter((item) => item.use?.heals);
    expect(healers.map((item) => item.id).sort()).toEqual([
      'potion-of-greater-healing',
      'potion-of-healing',
      'potion-of-superior-healing',
      'potion-of-supreme-healing',
    ]);
    for (const item of healers) {
      expect(parseNotation(item.use!.heals!), item.name).not.toBeNull();
    }
  });

  it('heals within the range the potion prints', () => {
    const parsed = parseNotation(magicItemById('potion-of-healing')!.use!.heals!)!;
    // The RNG hands back a fraction, so 0 is every die's floor and 0.999 its
    // ceiling - 2d4 + 2 runs from 4 to 10.
    const lowest = rollNotation(parsed, () => 0).total;
    const highest = rollNotation(parsed, () => 0.999).total;
    expect([lowest, highest]).toEqual([4, 10]);
  });
});
