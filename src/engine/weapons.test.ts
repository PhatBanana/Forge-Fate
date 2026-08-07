import { describe, expect, it } from 'vitest';
import type { Build, Loadout, WeaponStyle } from '../types';
import { WEAPONS, WEAPONS_BY_ID, damageDice, weaponsFor } from '../data/weapons';
import { CLASSES } from '../data/classes';
import { RACES } from '../data/races';
import { deriveBuild, emptyBuild, weaponsForProfile } from './character';
import { isProficientWith, weaponProficiencies } from './defense';
import { scoreFeat } from './recommend';
import { featById } from '../data/feats';

function build(overrides: Partial<Build> = {}): Build {
  return { ...emptyBuild(), raceId: 'human', ...overrides };
}

describe('the weapon table', () => {
  it('has unique ids and a damage type on every weapon', () => {
    const ids = WEAPONS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const weapon of WEAPONS) {
      expect(weapon.damage.type, weapon.name).toBeTruthy();
      expect(weapon.weight, weapon.name).toBeGreaterThanOrEqual(0);
    }
  });

  it('gives every ranged weapon a range, and no melee weapon one it should not have', () => {
    for (const weapon of WEAPONS) {
      if (!weapon.melee) expect(weapon.range, weapon.name).toBeDefined();
      // A melee weapon only has a range if it can be thrown.
      if (weapon.melee && weapon.range) {
        expect(weapon.properties, weapon.name).toContain('thrown');
      }
    }
  });

  /**
   * The table used to hold one row per weapon carrying whichever edition's
   * numbers had been written down last, so a 2014 lance hit for 1d10 and a
   * 2024 war pick could not be used two-handed. Six rows genuinely differ.
   */
  it('gives each edition its own stats where the two tables disagree', () => {
    const in2014 = Object.fromEntries(weaponsFor('2014').map((w) => [w.id, w]));
    const in2024 = Object.fromEntries(weaponsFor('2024').map((w) => [w.id, w]));

    // 2024 traded the lance's die for Heavy and a plain two-handed grip.
    expect(damageDice(in2014.lance)).toBe('1d12');
    expect(damageDice(in2024.lance)).toBe('1d10');
    expect(in2014.lance.properties).toEqual(['reach']);
    expect(in2024.lance.properties).toEqual(['heavy', 'reach', 'two-handed']);

    // The trident went up a die step in both grips.
    expect(damageDice(in2014.trident)).toBe('1d6');
    expect(damageDice(in2014.trident, true)).toBe('1d8');
    expect(damageDice(in2024.trident)).toBe('1d8');
    expect(damageDice(in2024.trident, true)).toBe('1d10');

    // The war pick gained Versatile; the warhammer and dart gained weight.
    expect(in2014['war-pick'].properties).toEqual([]);
    expect(damageDice(in2024['war-pick'], true)).toBe('1d10');
    expect(in2014.warhammer.weight).toBe(2);
    expect(in2024.warhammer.weight).toBe(5);
    expect(in2014.dart.weight).toBe(0.25);
    expect(in2024.dart.weight).toBe(1);

    // Firearms are a 2024 martial ranged weapon and a 2014 optional rule.
    expect(in2014.musket).toBeUndefined();
    expect(damageDice(in2024.musket)).toBe('1d12');
  });

  /** The whole point of the split: the same lance rolls a different die. */
  it('computes damage from the edition the character was built under', () => {
    const of = (weapon: string, ruleset: Build['ruleset'], raceId: string) =>
      deriveBuild(
        build({
          ruleset,
          raceId,
          classes: [{ classId: 'fighter', level: 1 }],
          weapons: { mainHandId: weapon, magicBonus: {} },
        }),
      ).attacks[0].damage.dice;

    expect(of('lance', '2014', 'human')).toBe('1d12');
    expect(of('lance', '2024', 'human-2024')).toBe('1d10');
    // A hand free makes a versatile weapon two-handed, and 2024 raised both
    // of the trident's dice, so this reads the versatile die in each edition.
    expect(of('trident', '2014', 'human')).toBe('1d8');
    expect(of('trident', '2024', 'human-2024')).toBe('1d10');
  });

  it('gives every weapon a 2024 mastery property, except the net', () => {
    for (const weapon of WEAPONS) {
      if (weapon.id === 'net') continue;
      expect(weapon.mastery, weapon.name).toBeTruthy();
    }
  });

  it('marks exactly the five weapons Polearm Master names', () => {
    expect(WEAPONS.filter((w) => w.polearm).map((w) => w.id).sort()).toEqual([
      'glaive',
      'halberd',
      'pike',
      'quarterstaff',
      'spear',
    ]);
  });

  it('renders damage dice, including versatile', () => {
    expect(damageDice(WEAPONS_BY_ID.greatsword)).toBe('2d6');
    expect(damageDice(WEAPONS_BY_ID.longsword)).toBe('1d8');
    expect(damageDice(WEAPONS_BY_ID.longsword, true)).toBe('1d10');
    // A greatsword has no versatile die, so two hands changes nothing.
    expect(damageDice(WEAPONS_BY_ID.greatsword, true)).toBe('2d6');
    expect(damageDice(WEAPONS_BY_ID.net)).toBe('—');
  });

  it('points every class and lineage weapon grant at a real weapon', () => {
    const known = new Set(WEAPONS.map((w) => w.id));
    const check = (ids: string[] | undefined, label: string) => {
      for (const id of ids ?? []) expect(known.has(id), `${label}: ${id}`).toBe(true);
    };
    for (const klass of CLASSES) {
      check(klass.weaponProficiency.specific, klass.name);
      for (const sub of klass.subclasses) check(sub.weaponProficiency?.specific, sub.name);
    }
    for (const race of RACES) check(race.weaponProficiency?.specific, race.name);
  });
});

describe('weapon proficiency', () => {
  const profs = (b: Build) => {
    const ctx = deriveBuild(b);
    return weaponProficiencies(ctx.slices, ctx.race, b.ruleset);
  };

  it('gives martial classes the whole category', () => {
    const fighter = profs(build({ classes: [{ classId: 'fighter', level: 5 }] }));
    expect(fighter.categories.has('martial')).toBe(true);
    expect(isProficientWith(WEAPONS_BY_ID.greatsword, fighter)).toBe(true);
  });

  it('gives a Wizard five weapons and nothing else', () => {
    const wizard = profs(build({ classes: [{ classId: 'wizard', level: 5 }] }));
    expect(wizard.categories.size).toBe(0);
    expect(isProficientWith(WEAPONS_BY_ID.quarterstaff, wizard)).toBe(true);
    expect(isProficientWith(WEAPONS_BY_ID.greatsword, wizard)).toBe(false);
    expect(isProficientWith(WEAPONS_BY_ID.mace, wizard)).toBe(false);
  });

  it('gives a Bard simple weapons plus four named martial ones', () => {
    const bard = profs(build({ classes: [{ classId: 'bard', level: 5 }] }));
    expect(isProficientWith(WEAPONS_BY_ID.dagger, bard)).toBe(true);
    expect(isProficientWith(WEAPONS_BY_ID.rapier, bard)).toBe(true);
    expect(isProficientWith(WEAPONS_BY_ID.greatsword, bard)).toBe(false);
  });

  it('adds what a subclass grants, once the subclass is reached', () => {
    // College of Valor arrives at 3, so a Bard 2 does not have its weapons yet.
    const at = (level: number) =>
      profs(build({ classes: [{ classId: 'bard', level, subclassId: 'valor' }] }));
    expect(at(2).categories.has('martial')).toBe(false);
    expect(at(3).categories.has('martial')).toBe(true);

    // A 2014 Warlock picks their patron at 1, so Hexblade applies immediately.
    const hexblade = profs(build({ classes: [{ classId: 'warlock', level: 1, subclassId: 'hexblade' }] }));
    expect(hexblade.categories.has('martial')).toBe(true);
  });

  it('adds what a lineage grants', () => {
    const elf = profs(build({ raceId: 'elf-high', classes: [{ classId: 'wizard', level: 5 }] }));
    expect(isProficientWith(WEAPONS_BY_ID.longsword, elf)).toBe(true);
    expect(isProficientWith(WEAPONS_BY_ID.greatsword, elf)).toBe(false);
  });
});

describe('the martial-weapon prerequisite, after dropping the hardcode', () => {
  // Fighting Initiate is the feat carrying "Proficiency with a martial weapon".
  const eligible = (b: Build) =>
    scoreFeat(featById('fighting-initiate', b.ruleset)!, deriveBuild(b)).eligible;

  it('answers the same way it did from the hardcoded list', () => {
    // Classes with the category.
    for (const classId of ['barbarian', 'fighter', 'paladin', 'ranger'] as const) {
      expect(eligible(build({ classes: [{ classId, level: 5 }] })), classId).toBe(true);
    }
    // Subclasses that grant it.
    for (const [classId, subclassId] of [
      ['warlock', 'hexblade'],
      ['bard', 'valor'],
      ['artificer', 'battle-smith'],
    ] as const) {
      expect(
        eligible(build({ classes: [{ classId, level: 6, subclassId }] })),
        subclassId,
      ).toBe(true);
    }
    // Lineages whose Weapon Training names martial weapons.
    for (const raceId of ['hobgoblin', 'elf-high', 'elf-wood', 'elf-drow']) {
      expect(
        eligible(build({ raceId, classes: [{ classId: 'wizard', level: 5 }] })),
        raceId,
      ).toBe(true);
    }
    // And a plain Wizard still does not qualify.
    expect(eligible(build({ classes: [{ classId: 'wizard', level: 5 }] }))).toBe(false);
  });
});

describe('deriving the combat profile from what you are holding', () => {
  const profile = (weapons: Build['weapons'], overrides: Partial<Build> = {}) => {
    const ctx = deriveBuild(build({
      classes: [{ classId: 'fighter', level: 5 }],
      baseScores: { str: 15, dex: 14, con: 14, int: 10, wis: 10, cha: 8 },
      weapons,
      ...overrides,
    }));
    return { style: ctx.weaponStyle, loadout: ctx.loadout, why: ctx.loadouts.why };
  };
  const hold = (mainHandId?: string, offHandId?: string) => ({ mainHandId, offHandId, magicBonus: {} });

  it('reads a two-handed weapon as a Strength melee build', () => {
    expect(profile(hold('greatsword'))).toMatchObject({ style: 'str-melee', loadout: 'two-handed' });
  });

  it('reads a bow as ranged', () => {
    expect(profile(hold('longbow'))).toMatchObject({ style: 'dex-ranged', loadout: 'ranged' });
    expect(profile(hold('hand-crossbow'))).toMatchObject({ style: 'dex-ranged', loadout: 'ranged' });
  });

  it('reads the five Polearm Master weapons as a polearm', () => {
    expect(profile(hold('glaive')).loadout).toBe('polearm');
    expect(profile(hold('halberd')).loadout).toBe('polearm');
    expect(profile(hold('pike')).loadout).toBe('polearm');
    // A quarterstaff is on the list but is not two-handed, so it is not a
    // polearm loadout by itself.
    expect(profile(hold('quarterstaff')).loadout).toBe('none');
  });

  it('lets a shield make it sword and board', () => {
    const withShield = { defenses: { ...emptyBuild().defenses, shield: true } };
    expect(profile(hold('longsword'), withShield).loadout).toBe('sword-and-board');
    expect(profile(hold('longsword')).loadout).toBe('none');
  });

  it('reads two weapons as dual wielding', () => {
    expect(profile(hold('shortsword', 'shortsword')).loadout).toBe('dual-wield');
  });

  it('follows the better ability on a finesse weapon, not the weapon', () => {
    const strong = { baseScores: { str: 16, dex: 10, con: 14, int: 10, wis: 10, cha: 8 } };
    const quick = { baseScores: { str: 10, dex: 16, con: 14, int: 10, wis: 10, cha: 8 } };
    expect(profile(hold('rapier'), strong).style).toBe('str-melee');
    expect(profile(hold('rapier'), quick).style).toBe('dex-melee');
    // A non-finesse weapon is Strength whatever your Dexterity.
    expect(profile(hold('longsword'), quick).style).toBe('str-melee');
  });

  it('gives a Monk Dexterity on a Monk weapon, which has no finesse property', () => {
    const quick = { baseScores: { str: 10, dex: 16, con: 14, int: 10, wis: 12, cha: 8 } };
    const monk = { ...quick, classes: [{ classId: 'monk' as const, level: 5 }] };
    expect(profile(hold('quarterstaff'), monk).style).toBe('dex-melee');
    expect(profile(hold('quarterstaff'), monk).why).toContain('Martial Arts');
    // A Fighter holding the same staff uses Strength.
    expect(profile(hold('quarterstaff'), quick).style).toBe('str-melee');
    // And a greatsword is not a Monk weapon.
    expect(profile(hold('greatsword'), monk).style).toBe('str-melee');
  });

  it('falls back to spells for an empty-handed caster and unarmed for a Monk', () => {
    const wizard = profile(hold(), { classes: [{ classId: 'wizard', level: 5 }] });
    expect(wizard.style).toBe('spell');
    const monk = profile(hold(), { classes: [{ classId: 'monk', level: 5 }] });
    expect(monk.style).toBe('unarmed');
  });

  it('explains itself', () => {
    expect(profile(hold('glaive')).why).toContain('Polearm Master');
    const quick = { baseScores: { str: 10, dex: 16, con: 14, int: 10, wis: 10, cha: 8 } };
    expect(profile(hold('rapier'), quick).why).toContain('Dexterity is higher');
  });
});

describe('migrating a hand-set combat profile', () => {
  it('round-trips every style and loadout pair the app could have stored', () => {
    const styles: Build['ruleset'] extends never ? never[] : WeaponStyle[] = [
      'str-melee',
      'dex-melee',
      'dex-ranged',
    ];
    const loadouts: Loadout[] = ['two-handed', 'polearm', 'sword-and-board', 'dual-wield', 'ranged', 'none'];

    for (const style of styles) {
      for (const loadout of loadouts) {
        const weapons = weaponsForProfile(style, loadout);
        const b = build({
          classes: [{ classId: 'fighter', level: 5 }],
          baseScores:
            style === 'str-melee'
              ? { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 }
              : { str: 10, dex: 16, con: 14, int: 10, wis: 10, cha: 8 },
          weapons,
          defenses: { ...emptyBuild().defenses, shield: loadout === 'sword-and-board' },
        });
        const ctx = deriveBuild(b);

        // The two dropdowns were independent, so a stored profile could
        // contradict itself. "Strength melee" with a "ranged" loadout resolves
        // to ranged, because you cannot swing a longbow. "Dexterity melee" with
        // "two-handed" has no answer at all: 5e has no two-handed finesse
        // weapon, and only a Monk gets Dexterity on a quarterstaff.
        const rangedContradiction = loadout === 'ranged' && style !== 'dex-ranged';
        // Every finesse weapon in 5e is one-handed, so "Dexterity melee" with
        // a two-handed or polearm loadout describes a weapon that does not
        // exist. Only a Monk gets Dexterity on a quarterstaff.
        const noSuchWeapon =
          style === 'dex-melee' && (loadout === 'two-handed' || loadout === 'polearm');
        if (rangedContradiction) {
          expect(ctx.weaponStyle, `${style}/${loadout}`).toBe('dex-ranged');
        } else if (!noSuchWeapon) {
          expect(ctx.weaponStyle, `${style}/${loadout}`).toBe(style);
        }

        // 'none' has no single right answer, and ranged always reads as ranged.
        if (loadout !== 'none' && style !== 'dex-ranged' && !noSuchWeapon) {
          expect(ctx.loadout, `${style}/${loadout}`).toBe(loadout);
        }
      }
    }
  });
});

describe('the attack line', () => {
  const attacks = (overrides: Partial<Build> = {}) =>
    deriveBuild(build({
      classes: [{ classId: 'fighter', level: 5 }],
      baseScores: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 8 },
      weapons: { mainHandId: 'longsword', magicBonus: {} },
      ...overrides,
    })).attacks;
  const hold = (mainHandId?: string, offHandId?: string, magicBonus: Record<string, number> = {}) =>
    ({ mainHandId, offHandId, magicBonus });

  it('adds ability and proficiency to hit, and ability to damage', () => {
    // STR 16 is +3, proficiency at level 5 is +3.
    const [main] = attacks();
    expect(main.toHit).toBe(6);
    expect(main.damage).toMatchObject({ dice: '1d10', bonus: 3, type: 'slashing' });
    expect(main.ability).toBe('str');
  });

  it('uses the versatile die only when the other hand is free', () => {
    expect(attacks()[0].damage.dice).toBe('1d10');
    expect(attacks({ weapons: hold('longsword', 'dagger') })[0].damage.dice).toBe('1d8');
    expect(
      attacks({ defenses: { ...emptyBuild().defenses, shield: true } })[0].damage.dice,
    ).toBe('1d8');
  });

  it('adds a magic bonus to both rolls', () => {
    const [main] = attacks({ weapons: hold('longsword', undefined, { longsword: 1 }) });
    expect(main.toHit).toBe(7);
    expect(main.damage.bonus).toBe(4);
  });

  it('drops the proficiency bonus on a weapon you are not trained with', () => {
    const [main] = attacks({
      classes: [{ classId: 'wizard', level: 5 }],
      weapons: hold('greatsword'),
    });
    expect(main.proficient).toBe(false);
    expect(main.toHit).toBe(3); // STR only
    expect(main.problems.join(' ')).toContain('Not proficient');
  });

  it('applies Archery to ranged attacks and nothing else', () => {
    const bow = (options: string[]) =>
      attacks({ weapons: hold('longbow'), classOptionIds: options })[0];
    expect(bow([]).toHit).toBe(5); // DEX +2, prof +3
    expect(bow(['archery']).toHit).toBe(7);
    // It does not touch a melee weapon.
    expect(attacks({ classOptionIds: ['archery'] })[0].toHit).toBe(6);
  });

  it('applies Duelling only to a one-handed weapon with no second weapon', () => {
    const withStyle = (weapons: Build['weapons']) =>
      attacks({ weapons, classOptionIds: ['dueling'] })[0].damage.bonus;
    expect(withStyle(hold('longsword'))).toBe(5); // +3 STR, +2 style
    expect(withStyle(hold('greatsword'))).toBe(3); // two-handed, no style
    expect(withStyle(hold('longsword', 'dagger'))).toBe(3); // second weapon, no style
  });

  it('gives the off-hand attack no ability modifier without Two-Weapon Fighting', () => {
    const both = attacks({ weapons: hold('shortsword', 'shortsword') });
    expect(both).toHaveLength(2);
    const [, off] = both;
    expect(off.hand).toBe('off');
    expect(off.damage.bonus).toBe(0);
    expect(off.notes.join(' ')).toContain('Two-Weapon Fighting');

    const [, styled] = attacks({
      weapons: hold('shortsword', 'shortsword'),
      classOptionIds: ['two-weapon-fighting'],
    });
    expect(styled.damage.bonus).toBe(3);
  });

  it('does not offer an off-hand attack alongside a two-hander or a shield', () => {
    expect(attacks({ weapons: hold('greatsword', 'dagger') })).toHaveLength(1);
    expect(
      attacks({
        weapons: hold('longsword', 'dagger'),
        defenses: { ...emptyBuild().defenses, shield: true },
      }),
    ).toHaveLength(1);
  });

  it('notes the -5/+10 feats only on a weapon that can use them', () => {
    const note = (weapons: Build['weapons'], featIds: string[]) =>
      attacks({ weapons, featIds })[0].notes.join(' ');
    expect(note(hold('greatsword'), ['great-weapon-master'])).toContain('−5 to hit');
    expect(note(hold('longsword'), ['great-weapon-master'])).not.toContain('−5 to hit');
    expect(note(hold('longbow'), ['sharpshooter'])).toContain('−5 to hit');
    expect(note(hold('greatsword'), ['sharpshooter'])).not.toContain('−5 to hit');
  });

  it('warns that Loading wastes Extra Attack', () => {
    const [main] = attacks({ weapons: hold('heavy-crossbow') });
    expect(main.problems.join(' ')).toContain('Loading');
    // A longbow has no such problem.
    expect(attacks({ weapons: hold('longbow') })[0].problems).toEqual([]);
  });

  it('gives a Monk Dexterity on a Monk weapon', () => {
    const [main] = attacks({
      classes: [{ classId: 'monk', level: 5 }],
      baseScores: { str: 10, dex: 16, con: 14, int: 10, wis: 14, cha: 8 },
      weapons: hold('quarterstaff'),
    });
    expect(main.ability).toBe('dex');
  });
});

/**
 * Shillelagh, which lives on the attack line rather than in the damage model.
 * Putting it in the curve alone would leave this table saying 1d4 and Strength
 * while the number below it assumed 1d8 and Wisdom.
 */
describe('Shillelagh', () => {
  const druid = (overrides: Partial<Build> = {}) =>
    deriveBuild(
      build({
        classes: [{ classId: 'druid', level: 5, subclassId: 'land' }],
        // Strength 8 is a −1; Wisdom 16 is a +3. Which one the club uses is
        // the whole question, and the gap makes the answer unmistakable.
        baseScores: { str: 8, dex: 12, con: 14, int: 10, wis: 16, cha: 10 },
        weapons: { mainHandId: 'club', magicBonus: {} },
        ...overrides,
      }),
    );

  it('leaves a club alone when the spell is not recorded', () => {
    const [main] = druid().attacks;
    expect(main.ability).toBe('str');
    expect(main.damage).toMatchObject({ dice: '1d4', bonus: -1 });
  });

  it('swaps the ability and sets the die to a d8', () => {
    const [main] = druid({ spellIds: ['shillelagh'] }).attacks;
    expect(main.ability).toBe('wis');
    // WIS 16 is +3, proficiency at level 5 is +3.
    expect(main.toHit).toBe(6);
    expect(main.damage).toMatchObject({ dice: '1d8', bonus: 3 });
  });

  it('says so on the attack line rather than changing numbers silently', () => {
    const [main] = druid({ spellIds: ['shillelagh'] }).attacks;
    expect(main.notes.join(' ')).toContain('Shillelagh');
    expect(main.toHitLines.some((l) => l.label.includes('Shillelagh'))).toBe(true);
  });

  it('applies to a quarterstaff, changing the ability but not the die', () => {
    const staff = druid({
      spellIds: ['shillelagh'],
      weapons: { mainHandId: 'quarterstaff', magicBonus: {} },
    }).attacks[0];
    // A quarterstaff in two hands is already a d8; Shillelagh only moves the
    // ability, which is still worth +4 to hit and damage here.
    expect(staff.damage.dice).toBe('1d8');
    expect(staff.ability).toBe('wis');
  });

  it('touches nothing else the Druid might be holding', () => {
    const scimitar = druid({
      spellIds: ['shillelagh'],
      weapons: { mainHandId: 'scimitar', magicBonus: {} },
    }).attacks[0];
    expect(scimitar.ability).not.toBe('wis');
    expect(scimitar.damage.dice).toBe('1d6');
  });

  /** The reason it went here: the curve reads the attack line. */
  it('carries through to the damage number', () => {
    const plain = druid().dpr.sustained;
    const shillelagh = druid({ spellIds: ['shillelagh'] }).dpr.sustained;
    expect(shillelagh).toBeGreaterThan(plain);
  });
});
