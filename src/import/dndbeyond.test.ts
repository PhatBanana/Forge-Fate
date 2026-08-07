import { describe, expect, it } from 'vitest';
import { ImportError, buildFromDdb, parseCharacterId } from './dndbeyond';
import { deriveBuild } from '../engine/character';

/**
 * A cut-down character document in D&D Beyond's shape: Wood Elf Gloom Stalker
 * Ranger 8 with Sharpshooter and Resilient, DEX raised to 18 by a class ASI.
 */
function sampleCharacter() {
  return {
    success: true,
    data: {
      id: 123456,
      name: 'Thistle',
      race: { fullName: 'Wood Elf', baseRaceName: 'Elf', subRaceShortName: 'Wood', isSubRace: true },
      classes: [
        {
          level: 8,
          isStartingClass: true,
          definition: { name: 'Ranger' },
          subclassDefinition: { name: 'Gloom Stalker' },
        },
      ],
      // Player-entered base scores, before lineage and level-ups.
      stats: [
        { id: 1, value: 8 },
        { id: 2, value: 15 },
        { id: 3, value: 14 },
        { id: 4, value: 10 },
        { id: 5, value: 13 },
        { id: 6, value: 12 },
      ],
      bonusStats: [
        { id: 1, value: null },
        { id: 2, value: null },
        { id: 3, value: null },
        { id: 4, value: null },
        { id: 5, value: null },
        { id: 6, value: null },
      ],
      overrideStats: [
        { id: 1, value: null },
        { id: 2, value: null },
        { id: 3, value: null },
        { id: 4, value: null },
        { id: 5, value: null },
        { id: 6, value: null },
      ],
      modifiers: {
        race: [
          { type: 'bonus', subType: 'dexterity-score', value: 2 },
          { type: 'bonus', subType: 'wisdom-score', value: 1 },
        ],
        // One ASI spent as +2 DEX at Ranger 4.
        class: [
          { type: 'bonus', subType: 'dexterity-score', value: 1 },
          { type: 'bonus', subType: 'dexterity-score', value: 1 },
        ],
        // Resilient's +1 went into Constitution.
        feat: [{ type: 'bonus', subType: 'constitution-score', value: 1 }],
        background: [],
        item: [],
        condition: [],
      },
      feats: [{ definition: { name: 'Sharpshooter' } }, { definition: { name: 'Resilient' } }],
      // Declared so a test can populate them; a real sheet always carries both
      // keys, and an empty sheet is the "character has no spells" case.
      classSpells: [] as {
        characterClassId?: number;
        spells?: { definition?: { name?: string } | null }[] | null;
      }[],
      spells: {} as Record<string, { definition?: { name?: string } | null }[] | null>,
      background: null as {
        definition?: { name?: string } | null;
        hasCustomBackground?: boolean;
        customBackground?: { name?: string } | null;
      } | null,
      currencies: {} as Partial<Record<'cp' | 'sp' | 'ep' | 'gp' | 'pp', number>>,
      inventory: [] as DdbItem[],
    },
  };
}

/** One inventory line, in the shape D&D Beyond writes them. */
type DdbItem = {
  quantity?: number;
  equipped?: boolean;
  isAttuned?: boolean;
  definition?: {
    name?: string;
    type?: string | null;
    filterType?: string | null;
    magic?: boolean | null;
    rarity?: string | null;
  } | null;
};

const item = (
  name: string,
  filterType: string,
  extra: Partial<DdbItem> & { magic?: boolean } = {},
): DdbItem => {
  const { magic, ...rest } = extra;
  return { quantity: 1, ...rest, definition: { name, filterType, magic: magic ?? false } };
};

describe('parseCharacterId', () => {
  it('accepts URLs, profile URLs and bare IDs', () => {
    expect(parseCharacterId('https://www.dndbeyond.com/characters/123456')).toBe('123456');
    expect(parseCharacterId('dndbeyond.com/profile/someone/characters/98765')).toBe('98765');
    expect(parseCharacterId('  4242  ')).toBe('4242');
    expect(parseCharacterId('https://example.com/nope')).toBeNull();
  });
});

describe('buildFromDdb', () => {
  it('rejects JSON that is not a character sheet', () => {
    expect(() => buildFromDdb({ hello: 'world' })).toThrow(ImportError);
  });

  it('reads lineage, class, subclass and level', () => {
    const { build } = buildFromDdb(sampleCharacter());
    expect(build.name).toBe('Thistle');
    expect(build.raceId).toBe('elf-wood');
    expect(build.classes).toEqual([{ classId: 'ranger', level: 8, subclassId: 'gloom-stalker' }]);
  });

  it('separates base scores from lineage, feat and ASI increases', () => {
    const { build } = buildFromDdb(sampleCharacter());
    // Base scores exclude everything the builder re-applies itself.
    expect(build.baseScores).toEqual({ str: 8, dex: 15, con: 14, int: 10, wis: 13, cha: 12 });
    expect(build.asiPicks).toEqual([['dex', 'dex']]);
    expect(build.featIds).toEqual(['sharpshooter', 'resilient']);
    expect(build.featAsiChoices).toEqual({ resilient: 'con' });
  });

  it('recomposes to the same totals the sheet shows', () => {
    const ctx = deriveBuild(buildFromDdb(sampleCharacter()).build);
    // 15 base + 2 racial + 2 ASI
    expect(ctx.scores.dex).toBe(19);
    // 14 base + 1 from Resilient
    expect(ctx.scores.con).toBe(15);
    // 13 base + 1 racial
    expect(ctx.scores.wis).toBe(14);
    expect(ctx.scores.str).toBe(8);
  });

  it('accounts for exactly the slots the level provides', () => {
    const ctx = deriveBuild(buildFromDdb(sampleCharacter()).build);
    expect(ctx.asiSlotsReached).toBe(2); // Ranger 4 and 8
    expect(ctx.asiSlotsSpent).toBe(3); // two feats plus one ASI - flagged below
  });

  it('honours the ability named in a feat like "Resilient (Constitution)"', () => {
    const character = sampleCharacter();
    character.data.feats = [{ definition: { name: 'Resilient (Wisdom)' } }];
    character.data.modifiers.feat = [{ type: 'bonus', subType: 'wisdom-score', value: 1 }];
    const { build } = buildFromDdb(character);
    expect(build.featAsiChoices).toEqual({ resilient: 'wis' });
  });

  it('warns about unknown feats and unsupported classes instead of failing', () => {
    const character = sampleCharacter();
    character.data.feats = [{ definition: { name: 'Homebrew Superpower' } }];
    const { build, warnings } = buildFromDdb(character);
    expect(build.featIds).toEqual([]);
    expect(warnings.some((w) => w.includes('Homebrew Superpower'))).toBe(true);
  });

  it('flags an item that sets an ability score rather than absorbing it', () => {
    const character = sampleCharacter();
    character.data.modifiers.item = [
      { type: 'set', subType: 'strength-score', value: 21 },
    ] as never;
    const { warnings } = buildFromDdb(character);
    expect(warnings.some((w) => w.includes('set to 21'))).toBe(true);
  });

  it('flags a lineage whose increases disagree with our data', () => {
    const character = sampleCharacter();
    character.data.modifiers.race = [{ type: 'bonus', subType: 'strength-score', value: 2 }];
    const { warnings } = buildFromDdb(character);
    expect(warnings.some((w) => w.includes('do not match'))).toBe(true);
  });

  it('accepts a bare character object without the "data" envelope', () => {
    const { build } = buildFromDdb(sampleCharacter().data);
    expect(build.raceId).toBe('elf-wood');
  });

  it('puts the starting class first in a multiclass sheet', () => {
    const character = sampleCharacter();
    character.data.classes = [
      { level: 2, isStartingClass: false, definition: { name: 'Fighter' }, subclassDefinition: null },
      {
        level: 6,
        isStartingClass: true,
        definition: { name: 'Ranger' },
        subclassDefinition: { name: 'Gloom Stalker' },
      },
    ] as never;
    const { build } = buildFromDdb(character);
    expect(build.classes[0].classId).toBe('ranger');
    expect(build.classes.map((c) => c.level)).toEqual([6, 2]);
  });
});

describe('proficiencies from a sheet', () => {
  it('reads skill proficiencies and expertise', () => {
    const character = sampleCharacter();
    character.data.modifiers.class = [
      ...character.data.modifiers.class,
      { type: 'proficiency', subType: 'stealth', value: null },
      { type: 'proficiency', subType: 'survival', value: null },
      { type: 'proficiency', subType: 'sleight-of-hand', value: null },
      { type: 'expertise', subType: 'stealth', value: null },
    ] as never;

    const { build } = buildFromDdb(character);
    expect(build.skillIds.sort()).toEqual(['sleight-of-hand', 'stealth', 'survival']);
    expect(build.expertiseIds).toEqual(['stealth']);

    const ctx = deriveBuild(build);
    expect(ctx.proficiencies.skills.find((s) => s.skill === 'stealth')!.expertise).toBe(true);
  });

  it('does not import a skill the lineage already grants', () => {
    const character = sampleCharacter();
    // Wood Elf grants Perception; importing it as a pick would read as a
    // collision with the grant it came from.
    character.data.modifiers.race = [
      ...character.data.modifiers.race,
      { type: 'proficiency', subType: 'arcana', value: null },
    ] as never;

    const { build } = buildFromDdb(character);
    expect(build.skillIds).not.toContain('perception');
    expect(deriveBuild(build).proficiencies.collisions).toEqual([]);
    // It is still a proficiency, just a derived one.
    expect(deriveBuild(build).proficiencies.skills.find((s) => s.skill === 'perception')!.proficient).toBe(true);
  });

  it('ignores modifier subtypes that are not skills', () => {
    const character = sampleCharacter();
    character.data.modifiers.class = [
      ...character.data.modifiers.class,
      { type: 'proficiency', subType: 'light-armor', value: null },
      { type: 'proficiency', subType: 'longbow', value: null },
    ] as never;
    expect(buildFromDdb(character).build.skillIds).toEqual([]);
  });
});

describe('spells from a sheet', () => {
  it('reads spells chosen through a class', () => {
    const sheet = sampleCharacter();
    sheet.data.classSpells = [
      {
        spells: [
          { definition: { name: "Hunter's Mark" } },
          { definition: { name: 'Spike Growth' } },
          { definition: { name: 'Pass Without Trace' } },
        ],
      },
    ];
    const { build } = buildFromDdb(sheet);
    expect(build.spellIds).toContain('hunters-mark');
    expect(build.spellIds).toContain('spike-growth');
    expect(build.spellIds).toContain('pass-without-trace');
  });

  it('also reads spells a race, item or feat granted', () => {
    const sheet = sampleCharacter();
    sheet.data.spells = {
      race: [{ definition: { name: 'Longstrider' } }],
      item: [{ definition: { name: 'Fog Cloud' } }],
      class: null,
    };
    const { build } = buildFromDdb(sheet);
    expect(build.spellIds).toEqual(expect.arrayContaining(['longstrider', 'fog-cloud']));
  });

  it('matches a named-caster spell whether or not the name is shortened', () => {
    const sheet = sampleCharacter();
    sheet.data.classSpells = [
      { spells: [{ definition: { name: "Melf's Acid Arrow" } }, { definition: { name: 'Acid Arrow' } }] },
    ];
    const { build } = buildFromDdb(sheet);
    // Both spellings resolve to the one entry, and it is not recorded twice.
    expect(build.spellIds.filter((id) => id === 'melfs-acid-arrow')).toHaveLength(1);
  });

  it('says which spells it could not place rather than dropping them quietly', () => {
    const sheet = sampleCharacter();
    sheet.data.classSpells = [
      { spells: [{ definition: { name: 'Hunter\'s Mark' } }, { definition: { name: 'Steel Wind Strike' } }] },
    ];
    const { build, warnings } = buildFromDdb(sheet);
    expect(build.spellIds).toEqual(['hunters-mark']);
    expect(warnings.some((w) => w.includes('Steel Wind Strike'))).toBe(true);
  });

  it('does not record the same spell twice across both sources', () => {
    const sheet = sampleCharacter();
    sheet.data.classSpells = [{ spells: [{ definition: { name: 'Longstrider' } }] }];
    sheet.data.spells = { race: [{ definition: { name: 'Longstrider' } }] };
    const { build } = buildFromDdb(sheet);
    expect(build.spellIds).toEqual(['longstrider']);
  });

  it('imports nothing and warns nothing for a sheet with no spells', () => {
    const { build, warnings } = buildFromDdb(sampleCharacter());
    expect(build.spellIds).toEqual([]);
    expect(warnings.some((w) => w.includes('not in the builder'))).toBe(false);
  });

  /**
   * The point of the attribution: a Cleric/Wizard's Fire Bolt is cast off
   * Intelligence and their Bless off Wisdom, and the sheet says which is which.
   */
  it('records which class taught each spell', () => {
    const sheet = sampleCharacter();
    sheet.data.classes = [
      { id: 11, level: 4, isStartingClass: true, definition: { name: 'Cleric' }, subclassDefinition: null },
      { id: 22, level: 4, isStartingClass: false, definition: { name: 'Wizard' }, subclassDefinition: null },
    ] as never;
    sheet.data.classSpells = [
      { characterClassId: 11, spells: [{ definition: { name: 'Bless' } }] },
      { characterClassId: 22, spells: [{ definition: { name: 'Fire Bolt' } }] },
    ];
    const { build } = buildFromDdb(sheet);
    expect(build.spellSources).toEqual({ bless: 'cleric', 'fire-bolt': 'wizard' });
  });

  it('leaves a spell unattributed when the sheet does not link it to a class', () => {
    const sheet = sampleCharacter();
    // No `characterClassId`, and a granted spell has no class behind it at all.
    sheet.data.classSpells = [{ spells: [{ definition: { name: "Hunter's Mark" } }] }];
    sheet.data.spells = { race: [{ definition: { name: 'Longstrider' } }] };
    const { build } = buildFromDdb(sheet);
    expect(build.spellIds).toEqual(expect.arrayContaining(['hunters-mark', 'longstrider']));
    // Absent rather than empty-and-wrong: the app falls back to the best DC,
    // which is exactly where every import stood before attribution existed.
    expect(build.spellSources).toBeUndefined();
  });

  it('ignores a link pointing at a class this app does not carry', () => {
    const sheet = sampleCharacter();
    sheet.data.classes = [
      { id: 11, level: 5, isStartingClass: true, definition: { name: 'Ranger' }, subclassDefinition: null },
      { id: 22, level: 3, isStartingClass: false, definition: { name: 'Blood Hunter' }, subclassDefinition: null },
    ] as never;
    sheet.data.classSpells = [{ characterClassId: 22, spells: [{ definition: { name: 'Bless' } }] }];
    const { build } = buildFromDdb(sheet);
    expect(build.spellIds).toContain('bless');
    expect(build.spellSources).toBeUndefined();
  });
});

describe('the pack from a sheet', () => {
  it('reads the background', () => {
    const sheet = sampleCharacter();
    sheet.data.background = { definition: { name: 'Outlander' } };
    const { build } = buildFromDdb(sheet);
    expect(build.backgroundId).toBe('outlander');
  });

  /**
   * D&D Beyond states every proficiency the same way, whoever granted it. Once
   * the background is known its two skills are derived, so importing them as
   * picks would read as a collision with the grant they came from.
   */
  it('stops a matched background\'s own skills reading as picks', () => {
    const sheet = sampleCharacter();
    sheet.data.background = { definition: { name: 'Outlander' } };
    sheet.data.modifiers.background = [
      { type: 'proficiency', subType: 'athletics', value: null },
      { type: 'proficiency', subType: 'survival', value: null },
    ] as never;
    sheet.data.modifiers.class = [
      ...sheet.data.modifiers.class,
      { type: 'proficiency', subType: 'arcana', value: null },
    ] as never;
    const { build, warnings } = buildFromDdb(sheet);
    expect(build.skillIds).toEqual(['arcana']);
    expect(warnings.some((w) => w.includes('Without a background'))).toBe(false);
  });

  it('says so when a background is not one this app carries', () => {
    const sheet = sampleCharacter();
    sheet.data.background = { definition: { name: 'Faction Agent' } };
    const { build, warnings } = buildFromDdb(sheet);
    expect(build.backgroundId).toBeUndefined();
    expect(warnings.some((w) => w.includes('Faction Agent'))).toBe(true);
  });

  it('reads the purse', () => {
    const sheet = sampleCharacter();
    sheet.data.currencies = { cp: 15, gp: 42, pp: 2 };
    const { build } = buildFromDdb(sheet);
    expect(build.coins).toEqual({ cp: 15, sp: 0, ep: 0, gp: 42, pp: 2 });
  });

  it('equips the weapons that are equipped, and only two of them', () => {
    const sheet = sampleCharacter();
    sheet.data.inventory = [
      item('Longbow', 'Weapon', { equipped: true }),
      item('Shortsword', 'Weapon', { equipped: true }),
      item('Greatsword', 'Weapon', { equipped: true }),
      item('Dagger', 'Weapon'),
    ];
    const { build, warnings } = buildFromDdb(sheet);
    expect(build.weapons.mainHandId).toBe('longbow');
    expect(build.weapons.offHandId).toBe('shortsword');
    // The third is carried, not held, and the default-loadout warning is gone.
    expect(warnings.some((w) => w.includes('No weapon was equipped'))).toBe(false);
  });

  it('wears the armor and the shield that are equipped', () => {
    const sheet = sampleCharacter();
    sheet.data.inventory = [
      item('Studded Leather', 'Armor', { equipped: true }),
      item('Shield', 'Armor', { equipped: true }),
      item('Plate', 'Armor'),
    ];
    const { build, warnings } = buildFromDdb(sheet);
    expect(build.defenses.armorId).toBe('studded-leather');
    expect(build.defenses.shield).toBe(true);
    // The unequipped plate is not silently put on instead.
    expect(warnings.some((w) => w.includes('No armor was equipped'))).toBe(false);
  });

  /**
   * D&D Beyond counts arrows one at a time; this app sells them by the bundle,
   * because that is how the equipment table prices them.
   */
  it('converts loose ammunition into the bundles the gear table sells', () => {
    const sheet = sampleCharacter();
    sheet.data.inventory = [
      item('Arrows', 'Other Gear', { quantity: 40 }),
      item('Rope, Hempen (50 feet)', 'Other Gear', { quantity: 1 }),
    ];
    const { build } = buildFromDdb(sheet);
    expect(build.gear).toContainEqual({ gearId: 'arrows', quantity: 2 });
    expect(build.gear).toContainEqual({ gearId: 'rope-hempen', quantity: 1 });
  });

  it('rounds a part-used bundle up, since a half quiver is still carried', () => {
    const sheet = sampleCharacter();
    sheet.data.inventory = [item('Arrows', 'Other Gear', { quantity: 21 })];
    expect(buildFromDdb(sheet).build.gear).toEqual([{ gearId: 'arrows', quantity: 2 }]);
  });

  it('sends magic items to the item list, carrying attunement', () => {
    const sheet = sampleCharacter();
    sheet.data.inventory = [
      item('Cloak of Protection', 'Wondrous item', { magic: true, isAttuned: true }),
      item('Bag of Holding', 'Wondrous item', { magic: true }),
    ];
    const { build } = buildFromDdb(sheet);
    expect(build.items).toEqual([
      { itemId: 'cloak-of-protection', attuned: true },
      { itemId: 'bag-of-holding', attuned: false },
    ]);
  });

  /** A homebrew wand is still something you own, so it is kept by name. */
  it('keeps a magic item this app does not carry, as a named line', () => {
    const sheet = sampleCharacter();
    sheet.data.inventory = [item('Wand of Smiles', 'Wand', { magic: true, isAttuned: true })];
    const { build } = buildFromDdb(sheet);
    expect(build.items).toEqual([{ customName: 'Wand of Smiles', attuned: true }]);
  });

  it('says which ordinary lines it could not place rather than dropping them', () => {
    const sheet = sampleCharacter();
    sheet.data.inventory = [
      item('Rations (1 day)', 'Other Gear', { quantity: 5 }),
      item("Ted's Lucky Spoon", 'Other Gear'),
    ];
    const { build, warnings } = buildFromDdb(sheet);
    expect(build.gear).toEqual([{ gearId: 'rations', quantity: 5 }]);
    expect(warnings.some((w) => w.includes("Ted's Lucky Spoon"))).toBe(true);
  });

  it('adds up two lines of the same thing', () => {
    const sheet = sampleCharacter();
    sheet.data.inventory = [
      item('Torch', 'Other Gear', { quantity: 4 }),
      item('Torch', 'Other Gear', { quantity: 6 }),
    ];
    expect(buildFromDdb(sheet).build.gear).toEqual([{ gearId: 'torch', quantity: 10 }]);
  });

  it('leaves a sheet with no inventory exactly as it was', () => {
    const { build, warnings } = buildFromDdb(sampleCharacter());
    expect(build.gear).toEqual([]);
    expect(build.items).toEqual([]);
    expect(warnings.some((w) => w.includes('No weapon was equipped'))).toBe(true);
  });

  it('carries the whole pack through to a derived character', () => {
    const sheet = sampleCharacter();
    sheet.data.background = { definition: { name: 'Outlander' } };
    sheet.data.currencies = { gp: 50 };
    sheet.data.inventory = [
      item('Longbow', 'Weapon', { equipped: true }),
      item('Studded Leather', 'Armor', { equipped: true }),
      item('Arrows', 'Other Gear', { quantity: 40 }),
      item('Cloak of Protection', 'Wondrous item', { magic: true, isAttuned: true }),
    ];
    const ctx = deriveBuild(buildFromDdb(sheet).build);
    // Studded leather 12 + DEX 4 + the cloak's +1.
    expect(ctx.ac.total).toBe(17);
    expect(ctx.attacks[0].weapon.id).toBe('longbow');
    // The bow, the armor, two bundles of arrows and a pound of coins.
    expect(ctx.inventory.weight).toBeGreaterThan(15);
  });
});
