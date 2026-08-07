import { describe, expect, it } from 'vitest';
import { startingEquipmentFor } from '../data/startingEquipment';
import { blankBuild, deriveBuild } from './character';
import {
  applyStartingEquipment,
  blankChoices,
  chooseOption,
  isComplete,
  resolveKit,
  setPick,
} from './startingEquipment';
import type { ClassId, Ruleset } from '../types';

const at1 = (classId: ClassId, ruleset: Ruleset = '2014') => ({
  ...blankBuild(ruleset),
  classes: [{ classId, level: 1 }],
});

const kitFor = (classId: string, ruleset: Ruleset = '2014') =>
  startingEquipmentFor(classId, ruleset)!;

describe('answering the questions', () => {
  it('starts on the first option of every group with nothing picked', () => {
    const kit = kitFor('fighter');
    const choices = blankChoices(kit);
    expect(choices).toHaveLength(kit.groups.length);
    expect(choices.every((c) => c.option === 0)).toBe(true);
    // The Fighter's first group is two concrete kits, so nothing to pick.
    expect(choices[0].picks).toEqual([]);
  });

  it('is incomplete until every pick is answered', () => {
    const kit = kitFor('fighter');
    // Group 2 is "(a) a martial weapon and a shield or (b) two martial weapons".
    let choices = blankChoices(kit);
    expect(isComplete(choices)).toBe(false);

    choices = setPick(choices, 1, 0, 0, 'longsword');
    expect(isComplete(choices)).toBe(true);
  });

  it('takes two answers where the option says two', () => {
    const kit = kitFor('fighter');
    let choices = chooseOption(kit, blankChoices(kit), 1, 1); // two martial weapons
    expect(choices[1].picks[0]).toHaveLength(2);

    choices = setPick(choices, 1, 0, 0, 'longsword');
    expect(isComplete(choices)).toBe(false);
    choices = setPick(choices, 1, 0, 1, 'battleaxe');
    expect(isComplete(choices)).toBe(true);
  });

  it('drops the answers when a different option is chosen', () => {
    // The picks belong to the option, not the group: answers to "a martial
    // weapon and a shield" are not answers to "two martial weapons".
    const kit = kitFor('fighter');
    let choices = setPick(blankChoices(kit), 1, 0, 0, 'longsword');
    choices = chooseOption(kit, choices, 1, 1);
    expect(choices[1].picks[0]).toEqual(['', '']);
  });
});

describe('what the kit turns into', () => {
  it('equips a 2014 Fighter who took chain mail, a martial weapon and a shield', () => {
    const kit = kitFor('fighter');
    let choices = blankChoices(kit); // (a) chain mail, (a) weapon + shield, ...
    choices = setPick(choices, 1, 0, 0, 'greatsword');

    const { build } = applyStartingEquipment(at1('fighter'), choices);
    expect(build.defenses.armorId).toBe('chain-mail');
    expect(build.defenses.shield).toBe(true);
    expect(build.weapons.mainHandId).toBe('greatsword');
    // The shield takes the off hand, so no second weapon is equipped even
    // though the third group hands over two handaxes.
    expect(build.weapons.offHandId).toBeUndefined();
    expect(build.gear.map((g) => g.gearId)).toContain('pack-dungeoneers');
  });

  it('reads the alternative kit, arrows and all', () => {
    const kit = kitFor('fighter');
    let choices = chooseOption(kit, blankChoices(kit), 0, 1); // leather, longbow, 20 arrows
    choices = setPick(choices, 1, 0, 0, 'longsword');

    const { build } = applyStartingEquipment(at1('fighter'), choices);
    expect(build.defenses.armorId).toBe('leather');
    // Twenty arrows is one bundle, because that is the unit this app owns.
    expect(build.gear.find((g) => g.gearId === 'arrows')).toEqual({ gearId: 'arrows', quantity: 1 });
  });

  it('puts the biggest weapon in the main hand', () => {
    // A Barbarian's kit is a greataxe (1d12) and two handaxes (1d6) plus four
    // javelins. The axe is what you swing.
    const kit = kitFor('barbarian');
    const { build } = applyStartingEquipment(at1('barbarian'), blankChoices(kit));
    expect(build.weapons.mainHandId).toBe('greataxe');
  });

  it('only fills the off hand when both weapons are light', () => {
    // Two-weapon fighting needs two light weapons; a greataxe and a handaxe
    // is not a loadout the rules allow, so the off hand stays empty.
    const kit = kitFor('barbarian');
    let choices = chooseOption(kit, blankChoices(kit), 0, 0); // greataxe
    choices = chooseOption(kit, choices, 1, 0); // two handaxes
    const { build } = applyStartingEquipment(at1('barbarian'), choices);
    expect(build.weapons.offHandId).toBeUndefined();

    // A Rogue's kit is two daggers, a shortsword and a shortbow. Choosing the
    // shortsword twice leaves four light weapons, so the two biggest pair.
    const rogue = kitFor('rogue');
    let rogueChoices = chooseOption(rogue, blankChoices(rogue), 0, 1); // shortsword
    rogueChoices = chooseOption(rogue, rogueChoices, 1, 1); // shortsword
    const equipped = applyStartingEquipment(at1('rogue'), rogueChoices).build;
    expect(equipped.weapons.mainHandId).toBe('shortsword');
    expect(equipped.weapons.offHandId).toBe('shortsword');
  });

  it('gives the bigger die the hand even when a pair was chosen', () => {
    /*
      A Ranger's fixed kit is a longbow; the group offers two shortswords. The
      rule is the biggest average damage, so the bow wins - 1d8 against 1d6 -
      and no off hand is filled because a longbow is not light.

      That is a judgement, not a fact, and it is the one this app already makes
      everywhere: the archery opening is the standard Ranger. The Equipment
      panel changes it in one click, which is why a defensible default beats a
      clever one.
    */
    const ranger = kitFor('ranger');
    const choices = chooseOption(ranger, blankChoices(ranger), 1, 0);
    const equipped = applyStartingEquipment(at1('ranger'), choices).build;
    expect(equipped.weapons.mainHandId).toBe('longbow');
    expect(equipped.weapons.offHandId).toBeUndefined();
    // And the shortswords are reported rather than lost.
    // Two of them, counted, because "you also have a shortsword" would be
    // half the truth.
    expect(applyStartingEquipment(at1('ranger'), choices).unrecorded).toContain('Shortsword ×2');
  });

  it('says which weapons it could not record rather than dropping them', () => {
    // A build has two hands and no place for a spare, so the Barbarian's four
    // javelins and second handaxe go nowhere. That is worth saying out loud.
    const kit = kitFor('barbarian');
    const { unrecorded } = applyStartingEquipment(at1('barbarian'), blankChoices(kit));
    expect(unrecorded).toContain('Javelin ×4');
  });

  it('hands over the gold a 2024 kit comes with', () => {
    // The coin is only in the source's sentence, never in its structure, so
    // this is what proves it survived the reading.
    const kit = kitFor('fighter', '2024');
    const { build } = applyStartingEquipment(at1('fighter', '2024'), blankChoices(kit));
    expect(build.coins.gp).toBe(4);
  });

  it('reads an option that is only gold as exactly that', () => {
    // 2024's third Fighter option is structurally empty - "or 155 GP" - and
    // without the prose reading it would have been an answer containing
    // nothing at all.
    const kit = kitFor('fighter', '2024');
    const choices = chooseOption(kit, blankChoices(kit), 0, 2);
    const { build } = applyStartingEquipment(at1('fighter', '2024'), choices);
    expect(build.coins.gp).toBe(155);
    expect(build.gear).toEqual([]);
    expect(build.weapons.mainHandId).toBeUndefined();
    expect(build.defenses.armorId).toBe('none');
  });

  it('leaves 2014 gold alone, because it is rolled separately', () => {
    const kit = kitFor('fighter');
    const { build } = applyStartingEquipment(at1('fighter'), blankChoices(kit));
    expect(build.coins.gp).toBe(0);
  });

  it('sums a repeated line instead of listing it twice', () => {
    // The 2024 Rogue's kit names daggers twice; two "Dagger" rows in an
    // inventory reads as a bug.
    const kit = kitFor('rogue', '2024');
    const { build } = applyStartingEquipment(at1('rogue', '2024'), blankChoices(kit));
    const ids = build.gear.map((g) => g.gearId);
    expect(ids).toEqual([...new Set(ids)]);
  });

  it('leaves a build with no SRD kit alone', () => {
    const build = at1('artificer');
    expect(applyStartingEquipment(build, [])).toEqual({ build, unrecorded: [] });
  });

  it('replaces rather than merges, so taking it twice is taking it once', () => {
    const kit = kitFor('wizard');
    const choices = blankChoices(kit);
    const once = applyStartingEquipment(at1('wizard'), choices).build;
    const twice = applyStartingEquipment(once, choices).build;
    expect(twice.gear).toEqual(once.gear);
    expect(twice.weapons).toEqual(once.weapons);
  });
});

describe('the result is a legal character', () => {
  const RULESETS: Ruleset[] = ['2014', '2024'];

  it.each(RULESETS)('derives without throwing for every %s class', (ruleset) => {
    const SRD_CLASSES: ClassId[] = [
      'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk',
      'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard',
    ];
    for (const classId of SRD_CLASSES) {
      const kit = kitFor(classId, ruleset);
      // Every pick answered with the first thing offered, which is what a
      // player clicking through the defaults would get.
      let choices = blankChoices(kit);
      kit.groups.forEach((group, g) => {
        group.options[0]?.picks.forEach((pick, p) => {
          for (let slot = 0; slot < pick.choose; slot++) {
            // Deliberately not `pickOptions` here - the point is that the
            // engine survives whatever it is handed, including a blank.
            choices = setPick(choices, g, p, slot, 'dagger');
          }
        });
      });

      const { build } = applyStartingEquipment(at1(classId, ruleset), choices);
      expect(() => deriveBuild(build), `${classId} in ${ruleset}`).not.toThrow();
      const ctx = deriveBuild(build);
      /*
        Base 10 plus Dexterity, or better. Not "at least 10": `blankBuild`
        leaves every score at 8 with the point-buy budget unspent, so an
        unarmoured Barbarian is legitimately AC 9. Asserting the flat number
        would have been asserting that every class starts in armor, which the
        Barbarian and the Monk do not.
      */
      expect(ctx.ac.total, `${classId} in ${ruleset} AC`).toBeGreaterThanOrEqual(
        10 + ctx.mods.dex,
      );
    }
  });

  it('resolves every fixed item of every kit', () => {
    for (const ruleset of RULESETS) {
      for (const classId of ['cleric', 'druid', 'monk', 'rogue', 'wizard'] as ClassId[]) {
        const kit = kitFor(classId, ruleset);
        const resolved = resolveKit(kit, blankChoices(kit), ruleset);
        expect(resolved.length, `${classId} in ${ruleset}`).toBeGreaterThan(0);
      }
    }
  });
});
