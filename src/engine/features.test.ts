import { describe, expect, it } from 'vitest';
import type { Build, ClassId } from '../types';
import { CLASSES, CLASSES_BY_ID, classesFor, subclassLevelFor, subclassName, subclassesFor } from '../data/classes';
import { CLASS_FEATURES, classFeaturesAt } from '../data/classFeatures';
import { SUBCLASS_FEATURES } from '../data/subclassFeatures';
import { deriveBuild, emptyBuild } from './character';
import { featureCount, featuresFor, hasFeatureTag, optionSlots } from './features';
import { masterySlots } from './attacks';

function build(overrides: Partial<Build> = {}): Build {
  return { ...emptyBuild(), ...overrides, raceId: 'human' };
}

const at = (classId: ClassId, level: number, subclassId?: string, ruleset: Build['ruleset'] = '2014') =>
  deriveBuild(build({ ruleset, classes: [{ classId, level, subclassId }] }));

describe('the feature table', () => {
  it('covers every class, in level order, with no level outside 1-20', () => {
    for (const klass of CLASSES) {
      const features = CLASS_FEATURES[klass.id];
      expect(features.length, klass.name).toBeGreaterThan(0);
      for (const feature of features) {
        expect(feature.level, `${klass.name}: ${feature.name}`).toBeGreaterThanOrEqual(1);
        expect(feature.level, `${klass.name}: ${feature.name}`).toBeLessThanOrEqual(20);
        expect(feature.summary.length, `${klass.name}: ${feature.name}`).toBeGreaterThan(0);
      }
    }
  });

  it('only reports features the character has reached', () => {
    expect(classFeaturesAt('fighter', 1, '2014').map((f) => f.name)).toEqual([
      'Fighting Style',
      'Second Wind',
    ]);
    // Asserted by tag rather than by display name: the SRD calls this row
    // "Action Surge (1 use)" and the app now matches, so a test spelling the
    // name out would be testing the wording instead of the level it arrives at.
    const tagged = (level: number) =>
      classFeaturesAt('fighter', level, '2014').some((f) => f.tags?.includes('action-surge'));
    expect(tagged(2)).toBe(true);
    expect(tagged(1)).toBe(false);
  });

  it('respects a feature\'s ruleset', () => {
    // Favored Enemy was cut in 2024; Brutal Strike is new there.
    expect(classFeaturesAt('ranger', 5, '2014').map((f) => f.name)).toContain('Favored Enemy');
    expect(classFeaturesAt('ranger', 5, '2024').map((f) => f.name)).not.toContain('Favored Enemy');
    expect(classFeaturesAt('barbarian', 9, '2024').map((f) => f.name)).toContain('Brutal Strike');
    expect(classFeaturesAt('barbarian', 9, '2014').map((f) => f.name)).not.toContain('Brutal Strike');
  });

  it('names the class or subclass each feature came from', () => {
    const ctx = at('fighter', 7, 'champion');
    const remarkable = ctx.features.find((f) => f.name === 'Remarkable Athlete');
    expect(remarkable?.source).toBe('Champion');
    expect(ctx.features.find((f) => f.tags?.includes('action-surge'))?.source).toBe('Fighter');
  });
});

describe('Extra Attack, after moving it out of the engine', () => {
  it('arrives at 5 for the classes that have it', () => {
    expect(at('fighter', 4).hasExtraAttack).toBe(false);
    expect(at('fighter', 5).hasExtraAttack).toBe(true);
    expect(at('barbarian', 5).hasExtraAttack).toBe(true);
    expect(at('paladin', 5).hasExtraAttack).toBe(true);
    expect(at('monk', 5).hasExtraAttack).toBe(true);
    expect(at('ranger', 5).hasExtraAttack).toBe(true);
  });

  it('never arrives for the classes that do not', () => {
    expect(at('wizard', 20).hasExtraAttack).toBe(false);
    expect(at('rogue', 20).hasExtraAttack).toBe(false);
    expect(at('sorcerer', 20).hasExtraAttack).toBe(false);
    expect(at('cleric', 20).hasExtraAttack).toBe(false);
  });

  it('keeps all four subclass exceptions', () => {
    // Bladesinger, College of Swords and College of Valor at 6; Battle Smith at 5.
    expect(at('wizard', 5, 'bladesinging').hasExtraAttack).toBe(false);
    expect(at('wizard', 6, 'bladesinging').hasExtraAttack).toBe(true);
    expect(at('bard', 5, 'swords').hasExtraAttack).toBe(false);
    expect(at('bard', 6, 'swords').hasExtraAttack).toBe(true);
    expect(at('bard', 6, 'valor').hasExtraAttack).toBe(true);
    expect(at('artificer', 4, 'battle-smith').hasExtraAttack).toBe(false);
    expect(at('artificer', 5, 'battle-smith').hasExtraAttack).toBe(true);
  });

  it('does not grant a subclass feature before the subclass is chosen', () => {
    expect(at('wizard', 6, 'bladesinging', '2024').hasExtraAttack).toBe(true);

    // 2024 moves every subclass to level 3, so a level 2 Wizard has no
    // Bladesinger features even with one selected. Under 2014 a Wizard picks
    // their school at 2, so the same character does have them - which is the
    // whole point of asking the ruleset.
    expect(at('wizard', 2, 'bladesinging', '2024').features.some((f) => f.source === 'Bladesinging')).toBe(false);
    expect(at('wizard', 2, 'bladesinging', '2014').features.some((f) => f.source === 'Bladesinging')).toBe(true);
  });
});

describe('feature tags and counts', () => {
  it('counts expertise slots from the table', () => {
    expect(featureCount(at('rogue', 1).features, 'expertise')).toBe(2);
    expect(featureCount(at('rogue', 6).features, 'expertise')).toBe(4);
    expect(featureCount(at('bard', 2).features, 'expertise')).toBe(0);
    expect(featureCount(at('bard', 10).features, 'expertise')).toBe(4);
  });

  it('finds half proficiency and reliable talent', () => {
    expect(hasFeatureTag(at('bard', 2).features, 'half-proficiency')).toBe(true);
    expect(hasFeatureTag(at('bard', 1).features, 'half-proficiency')).toBe(false);
    expect(hasFeatureTag(at('fighter', 7, 'champion').features, 'half-proficiency')).toBe(true);
    expect(hasFeatureTag(at('fighter', 6, 'champion').features, 'half-proficiency')).toBe(false);
    expect(hasFeatureTag(at('rogue', 11).features, 'reliable-talent')).toBe(true);
    expect(hasFeatureTag(at('rogue', 10).features, 'reliable-talent')).toBe(false);
  });

  it('counts the option slots a class has unlocked', () => {
    expect(optionSlots(at('warlock', 1).features, 'invocation')).toBe(0);
    expect(optionSlots(at('warlock', 2).features, 'invocation')).toBe(2);
    expect(optionSlots(at('warlock', 5).features, 'invocation')).toBe(3);
    expect(optionSlots(at('warlock', 12).features, 'invocation')).toBe(6);
    expect(optionSlots(at('warlock', 3).features, 'pact-boon')).toBe(1);

    expect(optionSlots(at('sorcerer', 2).features, 'metamagic')).toBe(0);
    expect(optionSlots(at('sorcerer', 3).features, 'metamagic')).toBe(2);
    expect(optionSlots(at('sorcerer', 10).features, 'metamagic')).toBe(3);
    expect(optionSlots(at('sorcerer', 17).features, 'metamagic')).toBe(4);

    expect(optionSlots(at('fighter', 1).features, 'fighting-style')).toBe(1);
    expect(optionSlots(at('paladin', 1).features, 'fighting-style')).toBe(0);
    expect(optionSlots(at('paladin', 2).features, 'fighting-style')).toBe(1);
    expect(optionSlots(at('wizard', 20).features, 'fighting-style')).toBe(0);
  });

  it('sums features across a multiclass', () => {
    const ctx = deriveBuild(
      build({ classes: [{ classId: 'fighter', level: 5 }, { classId: 'rogue', level: 6 }] }),
    );
    expect(featureCount(ctx.features, 'expertise')).toBe(4);
    expect(ctx.hasExtraAttack).toBe(true);
    expect(featuresFor(ctx.slices, '2014').some((f) => f.name === 'Cunning Action')).toBe(true);
  });
});

describe('the 2024 subclass lists', () => {
  it('offers exactly four per class in 2024, and none for the Artificer', () => {
    for (const klass of classesFor('2024')) {
      expect(subclassesFor(klass, '2024').length, klass.name).toBe(4);
    }
    // The Artificer is not in that book at all, so it is not in the class list.
    expect(classesFor('2024').some((c) => c.id === 'artificer')).toBe(false);
  });

  it('leaves the 2014 lists untouched', () => {
    const fighter = CLASSES_BY_ID.fighter;
    expect(subclassesFor(fighter, '2014').length).toBe(9);
    expect(subclassesFor(fighter, '2024').map((s) => s.id).sort()).toEqual([
      'battle-master',
      'champion',
      'eldritch-knight',
      'psi-warrior',
    ]);
  });

  it('renames without changing the id, so a switch keeps your subclass', () => {
    const totem = CLASSES_BY_ID.barbarian.subclasses.find((s) => s.id === 'totem-warrior')!;
    expect(subclassName(totem, '2014')).toBe('Path of the Totem Warrior');
    expect(subclassName(totem, '2024')).toBe('Path of the Wild Heart');

    const evocation = CLASSES_BY_ID.wizard.subclasses.find((s) => s.id === 'evocation')!;
    expect(subclassName(evocation, '2024')).toBe('Evoker');
  });

  it('adds the three subclasses 2024 genuinely introduced', () => {
    for (const [classId, id] of [
      ['barbarian', 'world-tree'],
      ['bard', 'dance'],
      ['druid', 'sea'],
    ] as const) {
      const klass = CLASSES_BY_ID[classId];
      expect(subclassesFor(klass, '2024').some((s) => s.id === id), id).toBe(true);
      expect(subclassesFor(klass, '2014').some((s) => s.id === id), id).toBe(false);
    }
  });

  it('puts every 2024 subclass at level 3', () => {
    for (const klass of classesFor('2024')) {
      expect(subclassLevelFor(klass, '2024')).toBe(3);
      for (const sub of subclassesFor(klass, '2024')) {
        // The record's own level is only read under 2014.
        expect(sub.level, `${klass.name}: ${sub.name}`).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('verified 2024 progressions', () => {
  const masteries = (classId: ClassId, level: number) => {
    const ctx = deriveBuild({
      ...emptyBuild(),
      ruleset: '2024',
      raceId: 'human',
      classes: [{ classId, level }],
    });
    return masterySlots(ctx.slices, '2024');
  };

  it("grows the Barbarian's masteries and holds the other three flat", () => {
    expect(masteries('barbarian', 1)).toBe(2);
    expect(masteries('barbarian', 4)).toBe(3);
    expect(masteries('barbarian', 10)).toBe(4);
    expect(masteries('barbarian', 20)).toBe(4);

    // Paladin, Ranger and Rogue genuinely never grow past two.
    for (const id of ['paladin', 'ranger', 'rogue'] as ClassId[]) {
      expect(masteries(id, 1), id).toBe(2);
      expect(masteries(id, 20), id).toBe(2);
    }

    // The Fighter is the only class that reaches six.
    expect(masteries('fighter', 1)).toBe(3);
    expect(masteries('fighter', 16)).toBe(6);
  });

  it('gives a 2024 Ranger three expertise slots and a 2014 Ranger none', () => {
    const expertise = (ruleset: '2014' | '2024', level: number) =>
      deriveBuild({
        ...emptyBuild(),
        ruleset,
        raceId: 'human',
        classes: [{ classId: 'ranger', level }],
      }).proficiencies.expertisePicks;

    expect(expertise('2024', 1)).toBe(0);
    expect(expertise('2024', 2)).toBe(1);
    expect(expertise('2024', 9)).toBe(3);
    // The 2014 Ranger has no expertise at all.
    expect(expertise('2014', 20)).toBe(0);
  });
});

describe('subclass features', () => {
  /**
   * The regression: a level 10 Wizard's printed sheet listed two features, and
   * a Life Cleric's listed nothing from the Life Domain. `Subclass.features`
   * carried only what changed a number, which was the right set for the engine
   * and the wrong set for the page you take to the table.
   */
  it('gives every subclass in every class a feature list', () => {
    const bare: string[] = [];
    for (const klass of CLASSES) {
      for (const sub of klass.subclasses) {
        const total = (SUBCLASS_FEATURES[sub.id] ?? []).length + (sub.features ?? []).length;
        if (total === 0) bare.push(`${klass.id}/${sub.id}`);
      }
    }
    expect(bare).toEqual([]);
  });

  it('fills in the casters whose sheets were nearly empty', () => {
    expect(at('wizard', 10, 'evocation').features.map((f) => f.name)).toContain('Sculpt Spells');
    expect(at('cleric', 10, 'life').features.map((f) => f.name)).toContain('Blessed Healer');
    expect(at('druid', 10, 'land').features.map((f) => f.name)).toContain('Nature’s Ward');
    expect(at('sorcerer', 6, 'draconic').features.map((f) => f.name)).toContain('Elemental Affinity');
  });

  /** The engine entry has to win, or a tag it carries is silently dropped. */
  it('keeps the tagged entry when both halves name the same feature', () => {
    const extra = at('wizard', 6, 'bladesinging').features.filter((f) => f.name === 'Extra Attack');
    expect(extra).toHaveLength(1);
    expect(extra[0].tags).toContain('extra-attack');
  });

  /**
   * The 2014 table was serving both editions, so every subclass the 2024 SRD
   * covers was showing its features at the old levels - and the Champion's
   * half-proficiency was being granted to a 2024 character who does not get it.
   */
  it('uses the 2024 progression for the subclasses that were rewritten', () => {
    const levelOf = (klass: ClassId, level: number, sub: string, feature: string,
                     ruleset: Build['ruleset']) =>
      at(klass, level, sub, ruleset).features.find((f) => f.name === feature)?.level;

    // Remarkable Athlete moved from 7 to 3, and stopped being half-proficiency.
    expect(levelOf('fighter', 20, 'champion', 'Remarkable Athlete', '2014')).toBe(7);
    expect(levelOf('fighter', 20, 'champion', 'Remarkable Athlete', '2024')).toBe(3);
    expect(hasFeatureTag(at('fighter', 10, 'champion', '2014').features, 'half-proficiency')).toBe(true);
    expect(hasFeatureTag(at('fighter', 10, 'champion', '2024').features, 'half-proficiency')).toBe(false);

    // The Berserker's last two features swapped places.
    expect(levelOf('barbarian', 20, 'berserker', 'Retaliation', '2014')).toBe(14);
    expect(levelOf('barbarian', 20, 'berserker', 'Retaliation', '2024')).toBe(10);
    expect(levelOf('barbarian', 20, 'berserker', 'Intimidating Presence', '2024')).toBe(14);

    // The Evoker's first three features were reshuffled across 3 and 6.
    expect(levelOf('wizard', 20, 'evocation', 'Sculpt Spells', '2014')).toBe(2);
    expect(levelOf('wizard', 20, 'evocation', 'Sculpt Spells', '2024')).toBe(6);
    expect(levelOf('wizard', 20, 'evocation', 'Potent Cantrip', '2024')).toBe(3);

    // Features 2024 added, and one it renamed.
    expect(levelOf('fighter', 20, 'champion', 'Heroic Warrior', '2024')).toBe(10);
    expect(levelOf('monk', 20, 'open-hand', 'Fleet Step', '2024')).toBe(11);
    expect(levelOf('monk', 20, 'open-hand', 'Tranquility', '2014')).toBe(11);
    expect(levelOf('monk', 20, 'open-hand', 'Tranquility', '2024')).toBeUndefined();
  });

  /** A subclass with no 2024 entry keeps the 2014 list rather than emptying. */
  it('falls back to the 2014 progression where there is no source for 2024', () => {
    const names = at('fighter', 20, 'battle-master', '2024').features.map((f) => f.name);
    expect(names).toContain('Combat Superiority');
  });

  it('carries the official subclasses the list was missing', () => {
    const ids = CLASSES.flatMap((c) => c.subclasses.map((s) => s.id));
    for (const id of ['giant', 'oathbreaker', 'drakewarden', 'lunar-sorcery']) {
      expect(ids, id).toContain(id);
      expect(SUBCLASS_FEATURES[id]?.length ?? 0, id).toBeGreaterThan(0);
    }
  });
});

/**
 * The eight features the SRD audit found missing, and the journey each one has
 * to survive to be worth adding.
 *
 * A row in `CLASS_FEATURES` is not the deliverable. The deliverable is a
 * player finding out they have the thing, and there are three places that
 * happens: the derived build (which the Builder's Class features panel and the
 * printed sheet both render), the "what the next level brings" list, and the
 * level-up summary that names what a level just gave you. A row that reaches
 * the table and not those is data nobody reads.
 *
 * So these assert the whole path rather than the table. They are named for the
 * gap each one closes, so a failure says which rule went missing again.
 */
describe('the features the 2014 audit found missing reach the player', () => {
  const namesAt = (classId: ClassId, level: number, ruleset: Build['ruleset'] = '2014') =>
    at(classId, level, undefined, ruleset).features.map((f) => f.name);

  it("gives a level-2 Monk the three things ki is for", () => {
    // The Ki row's own summary named all three and the table listed none of
    // them, so the panel offered a pool of points and no way to spend it.
    const names = namesAt('monk', 2);
    expect(names).toContain('Flurry of Blows');
    expect(names).toContain('Patient Defense');
    expect(names).toContain('Step of the Wind');
    // And they are level-2 features, not something a level-1 Monk sees.
    expect(namesAt('monk', 1)).not.toContain('Flurry of Blows');
  });

  it('grows the Paladin auras at 18, which the list never reached', () => {
    expect(namesAt('paladin', 17)).not.toContain('Aura Improvements');
    expect(namesAt('paladin', 18)).toContain('Aura Improvements');
  });

  it('gives the Paladin and the Cleric their Channel Divinity', () => {
    expect(namesAt('paladin', 3)).toContain('Channel Divinity');
    expect(namesAt('cleric', 2)).toContain('Channel Divinity: Turn Undead');
  });

  it('names the Ranger and Sorcerer features the table skipped', () => {
    expect(namesAt('ranger', 3)).toContain('Primeval Awareness');
    expect(namesAt('sorcerer', 2)).toContain('Flexible Casting');
  });

  it('grants the Bard all three Magical Secrets, not just the first', () => {
    const levelsWithIt = [10, 14, 18].filter((l) => namesAt('bard', l).includes('Magical Secrets'));
    expect(levelsWithIt).toEqual([10, 14, 18]);
    // 2024 folded the later two in, so a 2024 Bard has one grant and no more.
    expect(namesAt('bard', 18, '2024').filter((n) => n === 'Magical Secrets')).toHaveLength(1);
  });

  it('stops handing a 2024 Barbarian the ladder that 2024 deleted', () => {
    // Untagged, Brutal Critical applied to both editions - so a 2024
    // Barbarian got Brutal Strike *and* the feature it replaced.
    const names2024 = namesAt('barbarian', 17, '2024');
    expect(names2024.some((n) => n.startsWith('Brutal Critical'))).toBe(false);
    expect(names2024).toContain('Brutal Strike');
    expect(namesAt('barbarian', 17).some((n) => n.startsWith('Brutal Critical'))).toBe(true);
  });

  it('tells a Fighter their scaling features actually scaled', () => {
    // Every one of these was a silent level: the app said nothing new arrived
    // at 13 or 17 because it carried only the first grant.
    expect(namesAt('fighter', 13)).toContain('Indomitable (2 uses)');
    expect(namesAt('fighter', 17)).toContain('Action Surge (2 uses)');
    expect(namesAt('fighter', 17)).toContain('Indomitable (3 uses)');
  });
});
