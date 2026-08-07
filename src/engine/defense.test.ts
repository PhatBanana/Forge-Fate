import { describe, expect, it } from 'vitest';
import type { Build, Defenses } from '../types';
import { deriveBuild, emptyBuild, weaponsForProfile } from './character';
import { armorProficiencies, averageRoll, bestArmorFor, defaultDefenses, weaponProficiencies } from './defense';
import { analyze } from './analyze';
import { scoreFeat } from './recommend';
import { FEATS_BY_ID } from '../data/feats';

function build(overrides: Partial<Build> = {}, defenses: Partial<Defenses> = {}): Build {
  const base = emptyBuild();
  return { ...base, ...overrides, defenses: { ...defaultDefenses(), ...defenses } };
}

describe('armor class', () => {
  it('adds Dexterity in full under light armor', () => {
    const ctx = deriveBuild(
      build(
        {
          classes: [{ classId: 'rogue', level: 5 }],
          baseScores: { str: 8, dex: 15, con: 14, int: 12, wis: 12, cha: 10 },
          raceId: 'human',
        },
        { armorId: 'studded-leather' },
      ),
    );
    expect(ctx.mods.dex).toBe(3); // 15 base +1 human = 16
    expect(ctx.ac.total).toBe(15); // 12 + 3
  });

  it('caps Dexterity at +2 in medium armor', () => {
    const ctx = deriveBuild(
      build(
        {
          raceId: 'human',
          classes: [{ classId: 'ranger', level: 5 }],
          baseScores: { str: 8, dex: 17, con: 14, int: 10, wis: 14, cha: 8 },
        },
        { armorId: 'half-plate' },
      ),
    );
    expect(ctx.mods.dex).toBe(4);
    expect(ctx.ac.total).toBe(17); // 15 + 2, not 15 + 4
    expect(ctx.ac.notes.join(' ')).toContain('caps the Dexterity bonus at +2');
  });

  it('raises the medium cap to +3 with Medium Armor Master', () => {
    const withFeat = deriveBuild(
      build(
        {
          raceId: 'human',
          classes: [{ classId: 'ranger', level: 5 }],
          baseScores: { str: 8, dex: 17, con: 14, int: 10, wis: 14, cha: 8 },
          featIds: ['medium-armor-master'],
        },
        { armorId: 'half-plate' },
      ),
    );
    expect(withFeat.ac.total).toBe(18);
    expect(withFeat.ac.stealthDisadvantage).toBe(false);
  });

  it('ignores Dexterity entirely in heavy armor', () => {
    const ctx = deriveBuild(
      build(
        {
          raceId: 'human',
          classes: [{ classId: 'fighter', level: 5 }],
          baseScores: { str: 15, dex: 14, con: 14, int: 8, wis: 10, cha: 8 },
        },
        { armorId: 'plate' },
      ),
    );
    expect(ctx.ac.total).toBe(18);
  });

  it('adds a shield and magic bonuses on top', () => {
    const ctx = deriveBuild(
      build(
        {
          raceId: 'human',
          classes: [{ classId: 'fighter', level: 5 }],
          baseScores: { str: 15, dex: 14, con: 14, int: 8, wis: 10, cha: 8 },
          // The Defense style is a class option now, not a checkbox.
          classOptionIds: ['defense'],
        },
        { armorId: 'plate', shield: true, armorMagicBonus: 1, shieldMagicBonus: 1 },
      ),
    );
    // 18 plate + 2 shield + 1 armor + 1 shield magic + 1 Defense style
    expect(ctx.ac.total).toBe(23);
  });

  it('gets the Mountain Dwarf Wizard to AC 16 in half plate', () => {
    const ctx = deriveBuild(
      build(
        {
          raceId: 'dwarf-mountain',
          classes: [{ classId: 'wizard', level: 5, subclassId: 'evocation' }],
          baseScores: { str: 8, dex: 14, con: 14, int: 15, wis: 10, cha: 8 },
          weapons: weaponsForProfile('spell', 'none'),
        },
        { armorId: 'half-plate' },
      ),
    );
    expect(ctx.ac.total).toBe(17); // 15 + 2 dex
    expect(ctx.ac.problems).toEqual([]); // Dwarven Armor Training covers it
  });

  it('flags armor the character is not proficient with', () => {
    const ctx = deriveBuild(
      build(
        {
          raceId: 'human',
          classes: [{ classId: 'wizard', level: 5 }],
          weapons: weaponsForProfile('spell', 'none'),
        },
        { armorId: 'plate' },
      ),
    );
    expect(ctx.ac.problems.join(' ')).toContain('Not proficient with heavy armor');
  });

  it('flags an unmet Strength requirement and the speed penalty', () => {
    const ctx = deriveBuild(
      build(
        {
          raceId: 'human',
          classes: [{ classId: 'fighter', level: 5 }],
          baseScores: { str: 12, dex: 14, con: 14, int: 8, wis: 10, cha: 8 },
        },
        { armorId: 'plate' },
      ),
    );
    expect(ctx.ac.speedPenalty).toBe(10);
    expect(ctx.ac.problems.join(' ')).toContain('requires Strength 15');
  });
});

describe('unarmored defense', () => {
  it('uses the Monk formula when it beats plain unarmored', () => {
    const ctx = deriveBuild(
      build({
        raceId: 'elf-wood',
        classes: [{ classId: 'monk', level: 5, subclassId: 'open-hand' }],
        baseScores: { str: 10, dex: 15, con: 14, int: 8, wis: 15, cha: 8 },
        weapons: weaponsForProfile('unarmed', 'none'),
      }),
    );
    // DEX 17 (+3), WIS 16 (+3) -> 10 + 3 + 3
    expect(ctx.ac.source).toBe('Unarmored Defense (Monk)');
    expect(ctx.ac.total).toBe(16);
  });

  it("drops the Monk's Unarmored Defense when a shield is used", () => {
    const ctx = deriveBuild(
      build(
        {
          raceId: 'elf-wood',
          classes: [{ classId: 'monk', level: 5 }],
          baseScores: { str: 10, dex: 15, con: 14, int: 8, wis: 15, cha: 8 },
          weapons: weaponsForProfile('unarmed', 'none'),
        },
        { shield: true },
      ),
    );
    expect(ctx.ac.source).toBe('Unarmored');
    expect(ctx.ac.notes.join(' ')).toContain('does not work while using a shield');
  });

  it('keeps the Barbarian formula with a shield, since that is allowed', () => {
    const ctx = deriveBuild(
      build(
        {
          raceId: 'goliath',
          classes: [{ classId: 'barbarian', level: 5, subclassId: 'zealot' }],
          baseScores: { str: 15, dex: 14, con: 15, int: 8, wis: 10, cha: 8 },
        },
        { shield: true },
      ),
    );
    // DEX 14 (+2), CON 16 (+3) -> 10 + 2 + 3 + 2 shield
    expect(ctx.ac.source).toBe('Unarmored Defense (Barbarian)');
    expect(ctx.ac.total).toBe(17);
  });

  it('uses Draconic Resilience for an unarmored sorcerer', () => {
    const ctx = deriveBuild(
      build({
        raceId: 'human',
        classes: [{ classId: 'sorcerer', level: 5, subclassId: 'draconic' }],
        baseScores: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 15 },
        weapons: weaponsForProfile('spell', 'none'),
      }),
    );
    expect(ctx.ac.source).toBe('Draconic Resilience');
    expect(ctx.ac.total).toBe(15); // 13 + 2, DEX 15 after the human +1
  });
});

describe('armor proficiency', () => {
  it('collects proficiencies from class, subclass, lineage and feats', () => {
    const ctx = deriveBuild(
      build({
        raceId: 'dwarf-mountain',
        classes: [{ classId: 'wizard', level: 5 }],
        featIds: ['heavily-armored'],
      }),
    );
    const profs = armorProficiencies(ctx.slices, ctx.race, ctx.featIds);
    expect([...profs].sort()).toEqual(['heavy', 'light', 'medium']);
  });

  it('only grants a subclass\'s armor once the subclass is online', () => {
    const early = deriveBuild(
      build({ raceId: 'human', classes: [{ classId: 'cleric', level: 1, subclassId: 'life' }] }),
    );
    expect(armorProficiencies(early.slices, early.race, early.featIds).has('heavy')).toBe(true);

    const warlock2 = deriveBuild(
      build({ raceId: 'human', classes: [{ classId: 'warlock', level: 1, subclassId: 'hexblade' }] }),
    );
    expect(armorProficiencies(warlock2.slices, warlock2.race, warlock2.featIds).has('medium')).toBe(true);
  });

  it('picks the best legal armor for a character', () => {
    const ctx = deriveBuild(
      build({
        raceId: 'human',
        classes: [{ classId: 'fighter', level: 5 }],
        baseScores: { str: 15, dex: 14, con: 14, int: 8, wis: 10, cha: 8 },
      }),
    );
    const profs = armorProficiencies(ctx.slices, ctx.race, ctx.featIds);
    expect(bestArmorFor(profs, ctx.mods, ctx.scores, 10)).toBe('plate');

    // Strength 10 rules plate and splint out on the speed penalty.
    expect(bestArmorFor(profs, { ...ctx.mods, dex: 3 }, { ...ctx.scores, str: 10 }, 10)).toBe(
      'half-plate',
    );
  });
});

describe('hit points', () => {
  it('takes max at 1st level and the fixed average after', () => {
    const ctx = deriveBuild(
      build({
        raceId: 'human',
        classes: [{ classId: 'fighter', level: 5 }],
        baseScores: { str: 15, dex: 14, con: 14, int: 8, wis: 10, cha: 8 },
      }),
    );
    // d10: 10 + 4x6 = 34, CON 15 (+2) x 5 = 10
    expect(averageRoll(10)).toBe(6);
    expect(ctx.hp.total).toBe(44);
  });

  it('only maxes the first level of the starting class when multiclassing', () => {
    const ctx = deriveBuild(
      build({
        raceId: 'human',
        classes: [
          { classId: 'fighter', level: 2 },
          { classId: 'rogue', level: 3 },
        ],
        baseScores: { str: 15, dex: 14, con: 14, int: 8, wis: 10, cha: 8 },
      }),
    );
    // Fighter: 10 + 6 = 16. Rogue: 3 x 5 = 15. CON +2 x 5 = 10.
    expect(ctx.hp.total).toBe(41);
  });

  it('adds Tough, Dwarven Toughness and Draconic Resilience per level', () => {
    const tough = deriveBuild(
      build({
        raceId: 'dwarf-hill',
        classes: [{ classId: 'barbarian', level: 5, subclassId: 'zealot' }],
        baseScores: { str: 15, dex: 14, con: 14, int: 8, wis: 10, cha: 8 },
        featIds: ['tough'],
      }),
    );
    // d12: 12 + 4x7 = 40. CON 16 (+3) x5 = 15. Tough +10. Dwarf +5.
    expect(tough.hp.total).toBe(70);

    const draconic = deriveBuild(
      build({
        raceId: 'human',
        classes: [{ classId: 'sorcerer', level: 5, subclassId: 'draconic' }],
        baseScores: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 15 },
        weapons: weaponsForProfile('spell', 'two-handed'),
      }),
    );
    // d6: 6 + 4x4 = 22. CON 15 (+2) x5 = 10. Draconic +5.
    expect(draconic.hp.total).toBe(37);
  });

  it('supports maximum and manually rolled totals', () => {
    const common = {
      raceId: 'human',
      classes: [{ classId: 'fighter' as const, level: 5 }],
      baseScores: { str: 15, dex: 14, con: 14, int: 8, wis: 10, cha: 8 },
    };
    const max = deriveBuild(build(common, { hpMode: 'max' }));
    expect(max.hp.total).toBe(60); // 5 x 10 + 10
    expect(max.hp.averageTotal).toBe(44);

    const rolled = deriveBuild(build(common, { hpMode: 'manual', manualHitDiceTotal: 30 }));
    expect(rolled.hp.total).toBe(40); // 30 rolled + 10 CON
  });

  it('never drops below one hit point per level', () => {
    const ctx = deriveBuild(
      build({
        raceId: 'human',
        classes: [{ classId: 'wizard', level: 5 }],
        baseScores: { str: 8, dex: 10, con: 3, int: 15, wis: 10, cha: 8 },
        weapons: weaponsForProfile('spell', 'two-handed'),
      }),
    );
    expect(ctx.hp.total).toBeGreaterThanOrEqual(5);
  });
});

describe('feats scored against real equipment', () => {
  it('rates Heavy Armor Master only when heavy armor is worn', () => {
    const common = {
      raceId: 'human',
      classes: [{ classId: 'fighter' as const, level: 5 }],
      baseScores: { str: 15, dex: 14, con: 14, int: 8, wis: 10, cha: 8 },
    };
    const inPlate = deriveBuild(build(common, { armorId: 'plate' }));
    const inLeather = deriveBuild(build(common, { armorId: 'leather' }));
    expect(scoreFeat(FEATS_BY_ID['heavy-armor-master'], inPlate).score).toBeGreaterThan(
      scoreFeat(FEATS_BY_ID['heavy-armor-master'], inLeather).score + 5,
    );
  });

  it('rates Medium Armor Master only in medium armor', () => {
    const common = {
      raceId: 'human',
      classes: [{ classId: 'ranger' as const, level: 5 }],
      baseScores: { str: 8, dex: 15, con: 14, int: 10, wis: 14, cha: 8 },
    };
    const medium = deriveBuild(build(common, { armorId: 'half-plate' }));
    const light = deriveBuild(build(common, { armorId: 'studded-leather' }));
    expect(scoreFeat(FEATS_BY_ID['medium-armor-master'], medium).score).toBeGreaterThan(
      scoreFeat(FEATS_BY_ID['medium-armor-master'], light).score + 3,
    );
  });

  it('rates Shield Master off the actual shield, not the loadout label', () => {
    const common = { raceId: 'human', classes: [{ classId: 'fighter' as const, level: 5 }] };
    const withShield = deriveBuild(build(common, { armorId: 'chain-mail', shield: true }));
    const without = deriveBuild(build(common, { armorId: 'chain-mail', shield: false }));
    expect(scoreFeat(FEATS_BY_ID['shield-master'], withShield).score).toBeGreaterThan(
      scoreFeat(FEATS_BY_ID['shield-master'], without).score + 5,
    );
  });
});

describe('the build review reads equipment', () => {
  it('flags wasted Dexterity under a medium armor cap', () => {
    const ctx = deriveBuild(
      build(
        {
          raceId: 'human',
          classes: [{ classId: 'ranger', level: 8 }],
          baseScores: { str: 8, dex: 15, con: 14, int: 10, wis: 14, cha: 8 },
          asiPicks: [['dex', 'dex'], ['dex', 'dex']],
        },
        { armorId: 'half-plate' },
      ),
    );
    expect(ctx.mods.dex).toBe(5);
    expect(analyze(ctx).some((f) => f.title.includes('doing nothing'))).toBe(true);
  });

  it('flags non-proficient armor as an error', () => {
    const ctx = deriveBuild(
      build(
        { raceId: 'human', classes: [{ classId: 'wizard', level: 5 }], weapons: weaponsForProfile('spell', 'none') },
        { armorId: 'plate' },
      ),
    );
    const findings = analyze(ctx);
    expect(findings.some((f) => f.severity === 'error' && f.title.includes('armor'))).toBe(true);
    // One finding, however many rules the armor breaks.
    expect(findings.filter((f) => f.title.includes('armor') && f.severity === 'error')).toHaveLength(1);
  });

  it('flags stealth disadvantage', () => {
    const ctx = deriveBuild(
      build(
        { raceId: 'human', classes: [{ classId: 'ranger', level: 5 }] },
        { armorId: 'half-plate' },
      ),
    );
    expect(analyze(ctx).some((f) => f.title.includes('Stealth'))).toBe(true);
  });
});

/**
 * The multiclassing proficiency table. Every line of it is narrower than what
 * the class gives at 1st level, and taking the full grant on a dip is the most
 * common way a multiclassed sheet ends up wrong.
 */
describe('proficiency from a multiclass dip', () => {
  const profs = (classes: Build['classes']) => {
    const ctx = deriveBuild({ ...emptyBuild(), raceId: 'human', classes });
    return {
      armor: armorProficiencies(ctx.slices, ctx.race, ctx.featIds),
      weapons: weaponProficiencies(ctx.slices, ctx.race),
    };
  };

  it('does not hand a Wizard heavy armor for a one-level Fighter dip', () => {
    const pure = profs([{ classId: 'fighter', level: 5 }]);
    expect(pure.armor.has('heavy')).toBe(true);

    const dip = profs([
      { classId: 'wizard', level: 5 },
      { classId: 'fighter', level: 1 },
    ]);
    // The dip brings light, medium and shields - but never heavy.
    expect([...dip.armor].sort()).toEqual(['light', 'medium', 'shield']);
    expect(dip.weapons.categories.has('martial')).toBe(true);
  });

  it('gives a Rogue dip light armor and no weapons at all', () => {
    const pure = profs([{ classId: 'rogue', level: 5 }]);
    expect(pure.weapons.categories.has('simple')).toBe(true);

    const dip = profs([
      { classId: 'wizard', level: 5 },
      { classId: 'rogue', level: 1 },
    ]);
    expect([...dip.armor]).toEqual(['light']);
    expect(dip.weapons.categories.has('simple')).toBe(false);
    expect(dip.weapons.specific.has('rapier')).toBe(false);
  });

  it('gives a Barbarian dip shields but no body armor', () => {
    const dip = profs([
      { classId: 'wizard', level: 5 },
      { classId: 'barbarian', level: 1 },
    ]);
    expect([...dip.armor]).toEqual(['shield']);
    expect(dip.weapons.categories.has('martial')).toBe(true);
  });

  it('gives nothing at all for a Sorcerer or Wizard dip', () => {
    const dip = profs([
      { classId: 'rogue', level: 5 },
      { classId: 'wizard', level: 1 },
      { classId: 'sorcerer', level: 1 },
    ]);
    // Still exactly what the Rogue started with.
    expect([...dip.armor]).toEqual(['light']);
    expect(dip.weapons.specific.has('rapier')).toBe(true);
  });

  it('still gives the starting class everything', () => {
    const pure = profs([{ classId: 'paladin', level: 6, subclassId: 'devotion' }]);
    expect(pure.armor.has('heavy')).toBe(true);
    expect(pure.weapons.categories.has('martial')).toBe(true);
  });
});

describe('walking speed', () => {
  it('adds Mobile on top of the race base', () => {
    const ctx = deriveBuild(
      build({
        raceId: 'human',
        classes: [{ classId: 'fighter', level: 5 }],
        featIds: ['mobile'],
      }),
    );
    expect(ctx.speed.total).toBe(40);
    expect(ctx.speed.lines.map((l) => l.label)).toContain('Mobile');
  });

  it('gives a fifth-level Barbarian Fast Movement, unless the armor is heavy', () => {
    const barbarian = (armorId: string) =>
      deriveBuild(
        build(
          {
            raceId: 'human',
            classes: [{ classId: 'barbarian', level: 5 }],
            baseScores: { str: 15, dex: 14, con: 14, int: 8, wis: 10, cha: 8 },
          },
          { armorId },
        ),
      );
    // The rule is about heavy armor specifically: half plate keeps the +10.
    expect(barbarian('none').speed.total).toBe(40);
    expect(barbarian('half-plate').speed.total).toBe(40);
    expect(barbarian('plate').speed.total).toBe(30);
  });

  it('scales Unarmored Movement with Monk level, and a shield forfeits it', () => {
    const monk = (level: number, shield = false) =>
      deriveBuild(
        build({ raceId: 'human', classes: [{ classId: 'monk', level }] }, { shield }),
      );
    expect(monk(2).speed.total).toBe(40);
    expect(monk(6).speed.total).toBe(45);
    expect(monk(10).speed.total).toBe(50);
    expect(monk(18).speed.total).toBe(60);
    // No armor and no shield is the whole condition.
    expect(monk(6, true).speed.total).toBe(30);
  });

  it('stacks the armor penalty and item speed into the same total', () => {
    const ctx = deriveBuild(
      build(
        {
          raceId: 'human',
          classes: [{ classId: 'fighter', level: 5 }],
          // Strength 8 in plate: 10 feet slower until they can carry it.
          baseScores: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 10 },
        },
        { armorId: 'plate' },
      ),
    );
    expect(ctx.ac.speedPenalty).toBe(10);
    expect(ctx.speed.total).toBe(20);
    expect(ctx.speed.lines.length).toBe(2);
  });
});
