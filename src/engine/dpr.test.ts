import { describe, expect, it } from 'vitest';
import type { Build } from '../types';
import { deriveBuild, emptyBuild, weaponsForProfile } from './character';
import {
  averageDice,
  averageWithReroll,
  expectedDamage,
  hitChance,
  oddsFor,
  cantripMultiplier,
  expectedSaveDamage,
  failChance,
  typicalAcFor,
  withAdvantage,
} from './dpr';

function build(overrides: Partial<Build> = {}): Build {
  return {
    ...emptyBuild(),
    raceId: 'human',
    baseScores: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 8 },
    ...overrides,
  };
}

const close = (actual: number, expected: number, tolerance = 0.05) =>
  expect(Math.abs(actual - expected), `${actual} vs ${expected}`).toBeLessThanOrEqual(tolerance);

describe('the dice maths', () => {
  it('averages dice', () => {
    expect(averageDice(1, 6)).toBe(3.5);
    expect(averageDice(2, 6)).toBe(7);
    expect(averageDice(1, 12)).toBe(6.5);
  });

  it('matches the published Great Weapon Fighting averages', () => {
    close(averageWithReroll(4), 3.0);
    close(averageWithReroll(6), 4.1667);
    close(averageWithReroll(8), 5.25);
    close(averageWithReroll(10), 6.3);
    close(averageWithReroll(12), 7.3333);
  });
});

describe('hit chance', () => {
  it('is the fraction of a d20 that lands', () => {
    // +5 against AC 15 needs a 10 or better: 11 faces out of 20.
    close(hitChance(5, 15), 0.55, 0.001);
    close(hitChance(0, 10), 0.55, 0.001);
    close(hitChance(7, 15), 0.65, 0.001);
  });

  it('clamps at both ends, because a 1 always misses and a 20 always hits', () => {
    expect(hitChance(50, 10)).toBe(0.95);
    expect(hitChance(-50, 25)).toBe(0.05);
  });

  it('compounds correctly with advantage', () => {
    // 55% twice is 1 - 0.45^2.
    close(withAdvantage(0.55), 0.7975, 0.001);
    close(withAdvantage(0.05), 0.0975, 0.001);
  });

  it('raises the crit chance with advantage', () => {
    const straight = oddsFor(5, 15, 20, false);
    const advantaged = oddsFor(5, 15, 20, true);
    close(straight.crit, 0.05, 0.001);
    close(advantaged.crit, 0.0975, 0.001);
  });
});

describe('expected damage from one swing', () => {
  it('doubles the dice on a crit but not the flat bonus', () => {
    // 55% to hit, 5% crit, 2d6 (avg 7) + 3.
    const odds = { hit: 0.55, crit: 0.05 };
    close(expectedDamage(odds, 7, 3), 0.55 * 10 + 0.05 * 7);
    close(expectedDamage(odds, 7, 3), 5.85);
  });

  it('is zero-damage safe', () => {
    expect(expectedDamage({ hit: 0.5, crit: 0.05 }, 0, 0)).toBe(0);
  });
});

describe('the headline target AC', () => {
  it('rises with tier', () => {
    expect(typicalAcFor(1)).toBe(13);
    expect(typicalAcFor(5)).toBe(15);
    expect(typicalAcFor(11)).toBe(17);
    expect(typicalAcFor(17)).toBe(18);
  });
});

describe('damage per round, end to end', () => {
  const dprOf = (overrides: Partial<Build> = {}) => deriveBuild(build(overrides)).dpr;

  it('matches a hand-computed Fighter 5 with a greatsword', () => {
    // STR 16 +1 Human is 17, a +3; proficiency +3; so +6 to hit. Against AC 15
    // that needs a 9, which is 12 faces of the d20: 60%.
    // 2d6 (7) + 3 = 10 on a hit, plus a 5% crit for another 7.
    // Per swing: 0.6 * 10 + 0.05 * 7 = 6.35. Two swings at level 5: 12.7.
    const dpr = dprOf({
      classes: [{ classId: 'fighter', level: 5 }],
      weapons: { mainHandId: 'greatsword', magicBonus: {} },
    });
    expect(dpr.targetAc).toBe(15);
    close(dpr.sustained, 12.7, 0.15);
  });

  it('rises with more attacks', () => {
    // Compared at a fixed AC, because the headline target AC rises with tier
    // and would otherwise mask the gain.
    const at = (level: number) =>
      dprOf({
        classes: [{ classId: 'fighter', level }],
        weapons: { mainHandId: 'greatsword', magicBonus: {} },
      }).curve.find((c) => c.ac === 15)!.sustained;

    // The jump from 4 to 5 is Extra Attack; 10 to 11 is the third attack.
    expect(at(5)).toBeGreaterThan(at(4) * 1.8);
    expect(at(11)).toBeGreaterThan(at(10) * 1.4);
  });

  it('counts Sneak Attack once per turn, not once per attack', () => {
    const rogue = dprOf({
      classes: [{ classId: 'rogue', level: 5 }],
      baseScores: { str: 10, dex: 16, con: 14, int: 10, wis: 10, cha: 8 },
      weapons: { mainHandId: 'rapier', magicBonus: {} },
    });
    const line = rogue.lines.find((l) => l.label.startsWith('Sneak Attack'))!;
    expect(line.label).toBe('Sneak Attack 3d6');
    // 3d6 is 10.5 average; landing it once is worth well under two hits of it.
    expect(line.value).toBeLessThan(10.5);
    expect(line.value).toBeGreaterThan(5);
  });

  it('adds Rage only to Strength melee', () => {
    const raging = (weapons: Build['weapons'], scores?: Build['baseScores']) =>
      dprOf({
        classes: [{ classId: 'barbarian', level: 5 }],
        weapons,
        ...(scores ? { baseScores: scores } : {}),
      }).lines.some((l) => l.label.startsWith('Rage'));
    expect(raging({ mainHandId: 'greatsword', magicBonus: {} })).toBe(true);
    // A bow is not a Strength melee attack.
    expect(raging({ mainHandId: 'longbow', magicBonus: {} })).toBe(false);
  });

  it('reports where -5/+10 stops paying, and takes it only below that', () => {
    const dpr = dprOf({
      classes: [{ classId: 'fighter', level: 5 }],
      weapons: { mainHandId: 'greatsword', magicBonus: {} },
      featIds: ['great-weapon-master'],
    });
    expect(dpr.powerAttackBreakEven).toBeDefined();
    // With +6 to hit and two attacks it is worth it against soft targets only.
    expect(dpr.powerAttackBreakEven!).toBeGreaterThanOrEqual(10);
    expect(dpr.powerAttackBreakEven!).toBeLessThanOrEqual(20);
    expect(dpr.notes.join(' ')).toContain('−5/+10');

    // Below the break-even the curve is above the same build without the feat;
    // above it, taking the feat must not make the number worse.
    const without = dprOf({
      classes: [{ classId: 'fighter', level: 5 }],
      weapons: { mainHandId: 'greatsword', magicBonus: {} },
    });
    for (const point of dpr.curve) {
      const plain = without.curve.find((c) => c.ac === point.ac)!;
      expect(point.sustained, `AC ${point.ac}`).toBeGreaterThanOrEqual(plain.sustained - 0.05);
    }
  });

  it('only offers -5/+10 on a weapon that qualifies', () => {
    const wrongWeapon = dprOf({
      classes: [{ classId: 'fighter', level: 5 }],
      weapons: { mainHandId: 'longsword', magicBonus: {} },
      featIds: ['great-weapon-master'],
    });
    expect(wrongWeapon.powerAttackBreakEven).toBeUndefined();
  });

  it('separates nova from sustained', () => {
    const fighter = dprOf({
      classes: [{ classId: 'fighter', level: 5 }],
      weapons: { mainHandId: 'greatsword', magicBonus: {} },
    });
    // Action Surge doubles the Attack action for one round.
    close(fighter.nova, fighter.sustained * 2, 0.2);

    const paladin = dprOf({
      classes: [{ classId: 'paladin', level: 5 }],
      weapons: { mainHandId: 'longsword', magicBonus: {} },
    });
    expect(paladin.nova).toBeGreaterThan(paladin.sustained);
    expect(paladin.lines.some((l) => l.label.includes('Divine Smite'))).toBe(true);
  });

  it('reads a caster with no weapon as casting, not as doing nothing', () => {
    const noSpells = dprOf({
      classes: [{ classId: 'wizard', level: 5 }],
      weapons: { magicBonus: {} },
    });
    expect(noSpells.sustained).toBe(0);
    expect(noSpells.notes.join(' ')).toContain('No spells chosen');

    const armed = dprOf({
      classes: [{ classId: 'wizard', level: 5 }],
      weapons: { magicBonus: {} },
      spellIds: ['fire-bolt', 'fireball'],
    });
    expect(armed.sustained).toBeGreaterThan(0);
  });

  it('produces a curve that falls as AC rises', () => {
    const { curve } = dprOf({
      classes: [{ classId: 'fighter', level: 5 }],
      weapons: { mainHandId: 'greatsword', magicBonus: {} },
    });
    expect(curve[0].ac).toBe(10);
    expect(curve.at(-1)!.ac).toBe(25);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].sustained, `AC ${curve[i].ac}`).toBeLessThanOrEqual(curve[i - 1].sustained);
    }
  });

  it('raises damage when advantage is assumed', () => {
    const weapons = { mainHandId: 'greatsword', magicBonus: {} };
    const straight = dprOf({ classes: [{ classId: 'fighter', level: 5 }], weapons });
    const advantaged = dprOf({
      classes: [{ classId: 'fighter', level: 5 }],
      weapons,
      combatAssumptions: { advantage: true, concentrating: true, targets: 1 },
    });
    expect(advantaged.sustained).toBeGreaterThan(straight.sustained);
  });

  it('widens the crit range for a Champion', () => {
    const weapons = { mainHandId: 'greatsword', magicBonus: {} };
    const champion = dprOf({
      classes: [{ classId: 'fighter', level: 5, subclassId: 'champion' }],
      weapons,
    });
    const battleMaster = dprOf({
      classes: [{ classId: 'fighter', level: 5, subclassId: 'battle-master' }],
      weapons,
    });
    expect(champion.sustained).toBeGreaterThan(battleMaster.sustained);
    expect(champion.notes.join(' ')).toContain('crits on 19+');
  });
});

/**
 * You concentrate on one spell, not all of them. The model used to add
 * Hunter's Mark and Hex together for anyone carrying both, and ignored Bless
 * entirely - so the "assume a concentration buff is up" switch did nothing at
 * all for a Cleric while double-counting for a Warlock/Ranger.
 */
describe('the concentration buff', () => {
  const rangerAt = (spellIds: string[], concentrating = true) =>
    deriveBuild(
      build({
        classes: [{ classId: 'ranger', level: 5, subclassId: 'hunter' }],
        baseScores: { str: 10, dex: 16, con: 14, int: 10, wis: 12, cha: 8 },
        weapons: weaponsForProfile('dex-ranged', 'ranged'),
        spellIds,
        combatAssumptions: { advantage: false, concentrating, targets: 1 },
      }),
    ).dpr;

  it('does nothing for a spell the character does not have', () => {
    expect(rangerAt([]).sustained).toBe(rangerAt(['cure-wounds']).sustained);
  });

  it("counts Hunter's Mark when it is up and not when it is not", () => {
    expect(rangerAt(['hunters-mark']).sustained).toBeGreaterThan(
      rangerAt(['hunters-mark'], false).sustained,
    );
  });

  /** The bug: two concentration spells cannot both be running. */
  it('does not stack Hunter\'s Mark with Hex', () => {
    const one = rangerAt(['hunters-mark']).sustained;
    const both = rangerAt(['hunters-mark', 'hex']).sustained;
    expect(both).toBe(one);
  });

  it('lists exactly one buff line, matching the number', () => {
    const lines = rangerAt(['hunters-mark', 'hex']).lines.filter(
      (l) => l.label.includes("Hunter's Mark") || l.label.includes('Hex'),
    );
    expect(lines).toHaveLength(1);
  });

  /** Bless is +1d4 on the attack roll, so it never appeared as damage at all. */
  it('counts Bless, which the switch used to ignore', () => {
    const cleric = (spellIds: string[]) =>
      deriveBuild(
        build({
          classes: [{ classId: 'cleric', level: 5, subclassId: 'life' }],
          baseScores: { str: 16, dex: 10, con: 14, int: 8, wis: 16, cha: 10 },
          weapons: { mainHandId: 'mace', magicBonus: {} },
          spellIds,
          combatAssumptions: { advantage: false, concentrating: true, targets: 1 },
        }),
      ).dpr;

    const blessed = cleric(['bless']);
    expect(blessed.sustained).toBeGreaterThan(cleric([]).sustained);
    expect(blessed.lines.some((l) => l.label.startsWith('Bless'))).toBe(true);
  });

  /**
   * The invariant that catches the mistake this change nearly shipped: Bless
   * was folded into the weapon line *and* given a line of its own, so the
   * breakdown claimed 5.7 under a headline of 4.9. Each line is rounded to one
   * decimal for display, so the tolerance scales with how many there are.
   */
  it('itemises to the headline number rather than past it', () => {
    const cases = [
      rangerAt(['hunters-mark']),
      rangerAt(['bless']),
      rangerAt(['hunters-mark', 'bless']),
      rangerAt([]),
    ];
    for (const dpr of cases) {
      const sum = dpr.lines.reduce((total, line) => total + line.value, 0);
      const slack = 0.05 * dpr.lines.length + 0.05;
      expect(Math.abs(sum - dpr.sustained), `${sum} vs ${dpr.sustained}`).toBeLessThanOrEqual(slack);
    }
  });

  /**
   * Which buff wins depends on the target: +1d4 to hit is worth more when you
   * are missing often, a flat d6 per hit when you are not.
   */
  it('picks the better of two buffs rather than the first listed', () => {
    const both = rangerAt(['hunters-mark', 'bless']);
    const markOnly = rangerAt(['hunters-mark']);
    const blessOnly = rangerAt(['bless']);
    for (const ac of [10, 15, 25]) {
      const at = (d: typeof both) => d.curve.find((c) => c.ac === ac)!.sustained;
      expect(at(both)).toBe(Math.max(at(markOnly), at(blessOnly)));
    }
  });
});

/**
 * The spell branch has its own concentration buffs, kept apart from the weapon
 * branch's because they do different jobs: Bane is worth nothing to a Fire Bolt
 * and Hunter's Mark is worth nothing to a Fireball.
 */
describe('the concentration buff, casting', () => {
  const cleric = (spellIds: string[], concentrating = true) =>
    deriveBuild(
      build({
        classes: [{ classId: 'cleric', level: 9, subclassId: 'life' }],
        baseScores: { str: 10, dex: 12, con: 14, int: 8, wis: 16, cha: 10 },
        weapons: weaponsForProfile('spell', 'none'),
        spellIds,
        combatAssumptions: { advantage: false, concentrating, targets: 1 },
      }),
    ).dpr;

  /**
   * 2.8 gave Bless to weapon swings and not to spell attacks. Testing it needs
   * a multiclass: Bless is Cleric and Paladin only, and neither has an
   * attack-roll cantrip for it to improve - a Cleric's Sacred Flame is a saving
   * throw, which Bless does nothing for.
   */
  it('adds Bless to a spell attack roll, not only to a swing', () => {
    const clericWizard = (spellIds: string[]) =>
      deriveBuild(
        build({
          classes: [
            { classId: 'cleric', level: 5, subclassId: 'life' },
            { classId: 'wizard', level: 5, subclassId: 'evocation' },
          ],
          baseScores: { str: 10, dex: 12, con: 14, int: 16, wis: 14, cha: 8 },
          weapons: weaponsForProfile('spell', 'none'),
          spellIds,
          combatAssumptions: { advantage: false, concentrating: true, targets: 1 },
        }),
      ).dpr;

    const plain = clericWizard(['fire-bolt']);
    const blessed = clericWizard(['fire-bolt', 'bless']);
    expect(blessed.sustained).toBeGreaterThan(plain.sustained);
    expect(blessed.lines.some((l) => l.label.startsWith('Bless'))).toBe(true);
  });

  /** And it stays out of the way of a save cantrip, which it cannot help. */
  it('leaves a save cantrip alone, since Bless is on attack rolls', () => {
    expect(cleric(['sacred-flame', 'bless']).sustained).toBe(cleric(['sacred-flame']).sustained);
  });

  it('lets Bane drop the target\'s save against a save spell', () => {
    const plain = cleric(['sacred-flame']);
    const baned = cleric(['sacred-flame', 'bane']);
    expect(baned.sustained).toBeGreaterThan(plain.sustained);
    const line = baned.lines.find((l) => l.label.startsWith('Bane'));
    expect(line?.detail).toContain('failed its own save');
  });

  it('does nothing with the concentration switch off', () => {
    expect(cleric(['sacred-flame', 'bane'], false).sustained).toBe(
      cleric(['sacred-flame'], false).sustained,
    );
  });

  /** Both are concentration, so a character with both still runs only one. */
  it('runs one of Bless and Bane, never both', () => {
    const both = cleric(['sacred-flame', 'bless', 'bane']);
    const blessOnly = cleric(['sacred-flame', 'bless']);
    const baneOnly = cleric(['sacred-flame', 'bane']);
    expect(both.sustained).toBe(Math.max(blessOnly.sustained, baneOnly.sustained));
    expect(both.lines.filter((l) => /^(Bless|Bane)/.test(l.label))).toHaveLength(1);
  });

  it('itemises to the headline number rather than past it', () => {
    for (const dpr of [cleric(['sacred-flame', 'bane']), cleric(['sacred-flame', 'bless'])]) {
      const sustainedLines = dpr.lines.filter((l) => !l.label.includes('nova only'));
      const sum = sustainedLines.reduce((total, line) => total + line.value, 0);
      const slack = 0.05 * sustainedLines.length + 0.05;
      expect(Math.abs(sum - dpr.sustained), `${sum} vs ${dpr.sustained}`).toBeLessThanOrEqual(slack);
    }
  });
});

describe('spell damage', () => {
  const wizard = (overrides: Partial<Build> = {}) =>
    deriveBuild(
      build({
        classes: [{ classId: 'wizard', level: 5 }],
        baseScores: { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 },
        weapons: { magicBonus: {} },
        ...overrides,
      }),
    ).dpr;

  it('computes the fail chance against a save DC', () => {
    // DC 14 against a +3 save needs an 11 or better: 10 of 20 faces succeed.
    close(failChance(14, 3), 0.5, 0.001);
    close(failChance(20, 0), 0.95, 0.001);
    close(failChance(5, 10), 0.05, 0.001);
  });

  it('halves damage on a successful save when the spell says so', () => {
    // 50% fail, 28 average: 0.5*28 + 0.5*14 = 21.
    close(expectedSaveDamage(0.5, 28, true, 1), 21);
    // Without half-on-save it is just the failures.
    close(expectedSaveDamage(0.5, 28, false, 1), 14);
    // And it multiplies by targets caught.
    close(expectedSaveDamage(0.5, 28, true, 3), 63);
  });

  it('steps a cantrip at 5, 11 and 17', () => {
    expect(cantripMultiplier(1)).toBe(1);
    expect(cantripMultiplier(4)).toBe(1);
    expect(cantripMultiplier(5)).toBe(2);
    expect(cantripMultiplier(11)).toBe(3);
    expect(cantripMultiplier(17)).toBe(4);
  });

  it('uses the best cantrip as sustained damage', () => {
    const dpr = wizard({ spellIds: ['fire-bolt'] });
    // Fire Bolt at level 5 is 2d10, average 11, against AC 15 with +6 to hit.
    expect(dpr.sustained).toBeGreaterThan(5);
    expect(dpr.lines[0].label).toBe('Fire Bolt');
    expect(dpr.lines[0].detail).toContain('At-will');
  });

  it('uses the best slot spell as nova, and not as sustained', () => {
    const dpr = wizard({ spellIds: ['fire-bolt', 'fireball'] });
    expect(dpr.nova).toBeGreaterThan(dpr.sustained);
    expect(dpr.lines.some((l) => l.label.includes('Fireball'))).toBe(true);
  });

  it('scales an area spell with the assumed target count', () => {
    const one = wizard({ spellIds: ['fireball'] });
    const three = wizard({
      spellIds: ['fireball'],
      combatAssumptions: { advantage: false, concentrating: true, targets: 3 },
    });
    expect(three.nova).toBeGreaterThan(one.nova * 2.5);
  });

  it('says when a caster has no damage cantrip', () => {
    const dpr = wizard({ spellIds: ['shield', 'mage-armor'] });
    expect(dpr.sustained).toBe(0);
    expect(dpr.notes.join(' ')).toContain('No damage cantrip');
  });

  it('gives a Warlock Eldritch Blast as their sustained number', () => {
    const warlock = deriveBuild(
      build({
        classes: [{ classId: 'warlock', level: 5, subclassId: 'fiend' }],
        baseScores: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 16 },
        weapons: { magicBonus: {} },
        spellIds: ['eldritch-blast', 'hex'],
      }),
    ).dpr;
    expect(warlock.lines[0].label).toBe('Eldritch Blast');
    expect(warlock.sustained).toBeGreaterThan(0);
  });

  /**
   * Toll the Dead is on the Cleric list and the Wizard list both, so which
   * class taught it decides the DC it is cast at - and the damage that follows.
   */
  it('casts a spell at the DC of the class recorded against it', () => {
    const clericWizard = (spellSources?: Build['spellSources']) =>
      deriveBuild(
        build({
          classes: [
            { classId: 'cleric', level: 5, subclassId: 'life' },
            { classId: 'wizard', level: 5, subclassId: 'evocation' },
          ],
          // WIS 14 is DC 14; INT 20 is DC 17.
          baseScores: { str: 10, dex: 12, con: 14, int: 20, wis: 14, cha: 8 },
          weapons: weaponsForProfile('spell', 'none'),
          spellIds: ['toll-the-dead'],
          combatAssumptions: { advantage: false, concentrating: false, targets: 1 },
          ...(spellSources ? { spellSources } : {}),
        }),
      ).dpr;

    const assumed = clericWizard();
    const asCleric = clericWizard({ 'toll-the-dead': 'cleric' });
    const asWizard = clericWizard({ 'toll-the-dead': 'wizard' });
    // Unrecorded takes the favourable reading, which is the Wizard's.
    expect(assumed.sustained).toBe(asWizard.sustained);
    expect(asCleric.sustained).toBeLessThan(asWizard.sustained);
  });

  it('does not give a non-caster spell damage', () => {
    const barbarian = deriveBuild(
      build({
        classes: [{ classId: 'barbarian', level: 5 }],
        weapons: { magicBonus: {} },
        spellIds: ['fireball'],
      }),
    ).dpr;
    // No save DC, so a spell cannot be cast at all.
    expect(barbarian.sustained).toBe(0);
  });
});

describe('swinging against casting', () => {
  const armed = (overrides: Partial<Build> = {}) =>
    deriveBuild(
      build({
        classes: [{ classId: 'wizard', level: 9 }],
        baseScores: { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 },
        weapons: weaponsForProfile('str-melee', 'two-handed'),
        ...overrides,
      }),
    ).dpr;

  it('reports the cantrip when a Wizard is holding a weapon they should not swing', () => {
    const wizard = armed({ spellIds: ['fire-bolt'] });
    expect(wizard.lines[0].label).toBe('Fire Bolt');
    // A greatsword on a Strength 8 Wizard is worse than a 3d10 Fire Bolt.
    expect(wizard.notes.some((n) => n.includes('Casting beats swinging'))).toBe(true);
  });

  it('keeps the weapon round when the weapon is genuinely better', () => {
    const eldritchKnight = deriveBuild(
      build({
        classes: [{ classId: 'fighter', level: 9, subclassId: 'eldritch-knight' }],
        baseScores: { str: 16, dex: 14, con: 14, int: 12, wis: 10, cha: 8 },
        weapons: weaponsForProfile('str-melee', 'two-handed'),
        spellIds: ['fire-bolt'],
      }),
    ).dpr;
    expect(eldritchKnight.lines[0].label).toContain('Greatsword');
    expect(eldritchKnight.notes.some((n) => n.includes('behind the'))).toBe(true);
  });

  it('leaves a weapon build alone when it has no damage spells at all', () => {
    const plain = armed({ spellIds: ['mage-armor'] });
    expect(plain.lines[0].label).toContain('Greatsword');
    expect(plain.notes.every((n) => !n.includes('beats swinging'))).toBe(true);
  });

  it('keeps the weapon nova when casting wins the sustained round', () => {
    // A Paladin's smite is a bigger single round than any cantrip, even where
    // the cantrip would win the round you repeat.
    const wizard = armed({ spellIds: ['fire-bolt'] });
    expect(wizard.nova).toBeGreaterThanOrEqual(wizard.sustained);
  });
});

/**
 * 2024 weapon mastery. The app has ranked which one to take since masteries
 * landed, from a table of opinions, while the damage model could not see them
 * at all - so a Fighter with six masteries and one with none produced the same
 * curve.
 */
describe('weapon mastery', () => {
  const fighter = (over: Partial<Build> = {}) =>
    deriveBuild(
      build({
        ruleset: '2024',
        raceId: 'human-2024',
        classes: [{ classId: 'fighter', level: 5, subclassId: 'champion' }],
        baseScores: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 },
        weapons: weaponsForProfile('str-melee', 'two-handed'),
        combatAssumptions: { advantage: false, concentrating: false, targets: 1 },
        ...over,
      }),
    ).dpr;

  it('adds Graze, and only for the weapon actually in hand', () => {
    const plain = fighter();
    const grazing = fighter({ masteryIds: ['greatsword'] });
    expect(grazing.sustained).toBeGreaterThan(plain.sustained);
    // Mastery recorded on something left at home changes nothing, which is what
    // the build review already says out loud.
    expect(fighter({ masteryIds: ['glaive'] }).sustained).toBe(plain.sustained);
  });

  /**
   * Graze is the ability modifier on every miss, so it is worth *more* against
   * a high AC - the opposite of everything else on the curve, and the reason
   * it is worth computing rather than scoring as a flat opinion.
   */
  it('pays more against a high AC than a low one', () => {
    const curve = fighter({ masteryIds: ['greatsword'] }).curve;
    const plain = fighter().curve;
    const gainAt = (ac: number) => {
      const a = curve.find((c) => c.ac === ac)!.sustained;
      const b = plain.find((c) => c.ac === ac)!.sustained;
      return a - b;
    };
    expect(gainAt(22)).toBeGreaterThan(gainAt(11));
  });

  it('computes Graze as the modifier on the swings that miss', () => {
    const grazing = fighter({ masteryIds: ['greatsword'] });
    const line = grazing.lines.find((l) => l.label.startsWith('Graze'));
    // Strength 16 is +3, two swings at 5th level, AC 15 against +6 to hit:
    // a straight roll hits on 9+, so 40% of swings miss. 2 x 0.4 x 3 = 2.4.
    expect(line?.label).toBe('Graze +3 on a miss');
    close(line!.value, 2.4, 0.05);
  });

  it('adds Vex, which needs a second swing to have anything to advantage', () => {
    const one = deriveBuild(
      build({
        ruleset: '2024',
        raceId: 'human-2024',
        classes: [{ classId: 'fighter', level: 1 }],
        baseScores: { str: 10, dex: 16, con: 14, int: 10, wis: 10, cha: 8 },
        weapons: { magicBonus: {}, mainHandId: 'rapier' },
        masteryIds: ['rapier'],
        combatAssumptions: { advantage: false, concentrating: false, targets: 1 },
      }),
    ).dpr;
    expect(one.lines.find((l) => l.label.startsWith('Vex'))?.value).toBe(0);

    const two = fighter({ weapons: { magicBonus: {}, mainHandId: 'rapier' }, masteryIds: ['rapier'] });
    expect(two.lines.find((l) => l.label.startsWith('Vex'))!.value).toBeGreaterThan(0);
  });

  it('gives Vex nothing when the build already assumes advantage', () => {
    const held = { weapons: { magicBonus: {}, mainHandId: 'rapier' }, masteryIds: ['rapier'] };
    const straight = fighter(held);
    const advantaged = fighter({
      ...held,
      combatAssumptions: { advantage: true, concentrating: false, targets: 1 },
    });
    expect(straight.lines.find((l) => l.label.startsWith('Vex'))!.value).toBeGreaterThan(0);
    expect(advantaged.lines.find((l) => l.label.startsWith('Vex'))!.value).toBe(0);
  });

  it('says so rather than guessing at the six that move the fight', () => {
    const topple = fighter({ weapons: { magicBonus: {}, mainHandId: 'maul' }, masteryIds: ['maul'] });
    expect(topple.lines.some((l) => /Graze|Vex/.test(l.label))).toBe(false);
    expect(topple.notes.join(' ')).toContain('not in these numbers');
  });

  it('is 2024 only', () => {
    const in2014 = deriveBuild(
      build({
        classes: [{ classId: 'fighter', level: 5, subclassId: 'champion' }],
        weapons: weaponsForProfile('str-melee', 'two-handed'),
        masteryIds: ['greatsword'],
        combatAssumptions: { advantage: false, concentrating: false, targets: 1 },
      }),
    ).dpr;
    expect(in2014.lines.some((l) => l.label.startsWith('Graze'))).toBe(false);
  });

  it('still itemises to the headline number', () => {
    for (const dpr of [
      fighter({ masteryIds: ['greatsword'] }),
      fighter({ weapons: { magicBonus: {}, mainHandId: 'rapier' }, masteryIds: ['rapier'] }),
    ]) {
      const sustainedLines = dpr.lines.filter((l) => !l.label.includes('nova only'));
      const sum = sustainedLines.reduce((total, line) => total + line.value, 0);
      const slack = 0.05 * sustainedLines.length + 0.05;
      expect(Math.abs(sum - dpr.sustained), `${sum} vs ${dpr.sustained}`).toBeLessThanOrEqual(slack);
    }
  });
});
