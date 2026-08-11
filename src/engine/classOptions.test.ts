import { describe, expect, it } from 'vitest';
import type { Build, ClassId, Ruleset } from '../types';
import { CLASS_OPTIONS, optionById, optionsFor } from '../data/classOptions';
import { deriveBuild, emptyBuild, weaponsForProfile } from './character';
import { optionGroups, reconcileClassOptions, scoreOption, slotsFor } from './classOptions';
import { analyze } from './analyze';
import { recommendFeats } from './recommend';

function build(overrides: Partial<Build> = {}): Build {
  return {
    ...emptyBuild(),
    raceId: 'human',
    baseScores: { str: 10, dex: 14, con: 14, int: 10, wis: 10, cha: 15 },
    ...overrides,
  };
}

const warlock = (level: number, extra: Partial<Build> = {}) =>
  deriveBuild(build({
    classes: [{ classId: 'warlock', level, subclassId: level >= 1 ? 'fiend' : undefined }],
    weapons: weaponsForProfile('spell', 'none'),
    ...extra,
  }));

describe('the options table', () => {
  it('has unique ids and a summary on every record', () => {
    const ids = CLASS_OPTIONS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const option of CLASS_OPTIONS) {
      expect(option.summary.length, option.name).toBeGreaterThan(0);
      expect(option.base, option.name).toBeGreaterThanOrEqual(0);
    }
  });

  it('points every pact-boon prerequisite at a real pact boon', () => {
    const boons = new Set(optionsFor('pact-boon', '2014').map((o) => o.id));
    for (const option of CLASS_OPTIONS) {
      if (!option.prereq?.pactBoon) continue;
      expect(boons.has(option.prereq.pactBoon), option.name).toBe(true);
    }
  });

  it('offers a fighting style under both editions, from each one\u2019s own table', () => {
    /*
      This test used to read *"keeps 2014 fighting styles out of 2024, where
      they are feats instead"* and assert that the 2024 list was empty. Both
      halves of that sentence were true and the conclusion was wrong: the
      styles did move to `feats.ts`, and the class *feature* that grants the
      slot did not move at all. So a 2024 Fighter, Paladin, Ranger and Marshal
      each had a slot to fill and an empty list to fill it from - and this
      assertion pinned that as intended.

      A test can enshrine a defect as neatly as it can catch one. §59.1 found
      this by building each class and looking at what the Builder would render,
      which is a question the assertion below was not asking.

      The rows now come from `feats.ts` under 2024, projected into the option
      shape, so there is still exactly one place each style is written down.
    */
    expect(optionsFor('fighting-style', '2014').length).toBe(10);
    expect(optionsFor('fighting-style', '2024').length).toBe(10);
    // Same ids either way, so switching rules keeps your style.
    expect(optionById('archery')!.id).toBe('archery');
    expect(optionById('defense')!.id).toBe('defense');
    for (const id of ['archery', 'defense', 'dueling']) {
      expect(optionsFor('fighting-style', '2024').map((o) => o.id), id).toContain(id);
    }
  });
});

describe('option slots', () => {
  it('counts invocations off the Warlock table', () => {
    expect(slotsFor('invocation', warlock(1))).toBe(0);
    expect(slotsFor('invocation', warlock(2))).toBe(2);
    expect(slotsFor('invocation', warlock(5))).toBe(3);
    expect(slotsFor('invocation', warlock(18))).toBe(8);
  });

  it('counts metamagic off the Sorcerer table', () => {
    const sorcerer = (level: number) =>
      deriveBuild(build({ classes: [{ classId: 'sorcerer', level }] }));
    expect(slotsFor('metamagic', sorcerer(2))).toBe(0);
    expect(slotsFor('metamagic', sorcerer(3))).toBe(2);
    expect(slotsFor('metamagic', sorcerer(17))).toBe(4);
  });

  it('counts maneuvers off the Battle Master subclass, not the Fighter class', () => {
    const fighter = (level: number, subclassId?: string) =>
      deriveBuild(build({ classes: [{ classId: 'fighter', level, subclassId }] }));
    expect(slotsFor('maneuver', fighter(3, 'champion'))).toBe(0);
    expect(slotsFor('maneuver', fighter(3, 'battle-master'))).toBe(3);
    expect(slotsFor('maneuver', fighter(7, 'battle-master'))).toBe(5);
    expect(slotsFor('maneuver', fighter(15, 'battle-master'))).toBe(9);
  });

  it('gives a slot to the feats that grant one', () => {
    const wizard = (featIds: string[]) =>
      deriveBuild(build({ classes: [{ classId: 'wizard', level: 8 }], featIds }));
    expect(slotsFor('invocation', wizard([]))).toBe(0);
    expect(slotsFor('invocation', wizard(['eldritch-adept']))).toBe(1);
    expect(slotsFor('metamagic', wizard(['metamagic-adept']))).toBe(2);
    expect(slotsFor('maneuver', wizard(['martial-adept']))).toBe(2);
    expect(slotsFor('fighting-style', wizard(['fighting-initiate']))).toBe(1);
  });
});

describe('scoring options', () => {
  it('puts Agonizing Blast at the top for a blasting Warlock', () => {
    const ranked = optionGroups(warlock(5)).find((g) => g.kind === 'invocation')!.suggestions;
    expect(ranked[0].id).toBe('agonizing-blast');
    expect(ranked[0].headline).toContain('Eldritch Blast');
  });

  it('does not offer invocations to a Sorcerer', () => {
    const sorcerer = deriveBuild(build({ classes: [{ classId: 'sorcerer', level: 5 }] }));
    expect(optionGroups(sorcerer).some((g) => g.kind === 'invocation')).toBe(false);
    expect(optionGroups(sorcerer).some((g) => g.kind === 'metamagic')).toBe(true);
  });

  it('blocks a pact invocation without the boon and allows it with', () => {
    const noBoon = warlock(5);
    const withChain = warlock(5, { pactBoon: 'pact-of-the-chain' });
    const voice = (ctx: ReturnType<typeof deriveBuild>) =>
      scoreOption(optionById('voice-of-the-chain-master')!, ctx);
    expect(voice(noBoon).eligible).toBe(false);
    expect(voice(noBoon).blockedBy[0]).toContain('Pact of the Chain');
    expect(voice(withChain).eligible).toBe(true);
  });

  it('measures an invocation\'s level against Warlock levels, not character level', () => {
    // Thirsting Blade needs Warlock 5. A Fighter 10 / Warlock 2 does not have it.
    const dip = deriveBuild(build({
      classes: [
        { classId: 'fighter', level: 10, subclassId: 'champion' },
        { classId: 'warlock', level: 2, subclassId: 'hexblade' },
      ],
      pactBoon: 'pact-of-the-blade',
    }));
    expect(scoreOption(optionById('thirsting-blade')!, dip).eligible).toBe(false);
    expect(scoreOption(optionById('thirsting-blade')!, dip).blockedBy[0]).toContain('level 5');
  });

  it('ranks a melee invocation above a blasting one for a bladelock', () => {
    const blade = warlock(12, {
      pactBoon: 'pact-of-the-blade',
      weapons: weaponsForProfile('str-melee', 'two-handed'),
      classes: [{ classId: 'warlock', level: 12, subclassId: 'hexblade' }],
    });
    const ranked = optionGroups(blade).find((g) => g.kind === 'invocation')!.suggestions;
    const rank = (id: string) => ranked.findIndex((s) => s.id === id);
    expect(rank('thirsting-blade')).toBeLessThan(rank('agonizing-blast'));
  });

  it('sorts options you already have to the bottom', () => {
    const ctx = warlock(5, { classOptionIds: ['agonizing-blast'] });
    const ranked = optionGroups(ctx).find((g) => g.kind === 'invocation')!.suggestions;
    expect(ranked.find((s) => s.id === 'agonizing-blast')!.taken).toBe(true);
    expect(ranked[0].id).not.toBe('agonizing-blast');
  });

  it('counts open slots against what you have chosen', () => {
    const group = (ctx: ReturnType<typeof deriveBuild>) =>
      optionGroups(ctx).find((g) => g.kind === 'invocation')!;
    expect(group(warlock(5)).open).toBe(3);
    expect(group(warlock(5, { classOptionIds: ['agonizing-blast'] })).open).toBe(2);
    expect(
      group(warlock(5, { classOptionIds: ['agonizing-blast', 'devils-sight', 'repelling-blast'] }))
        .open,
    ).toBe(0);
  });
});

describe('reconciling options after a change', () => {
  it('drops an invocation whose pact boon changed', () => {
    const b = build({
      classes: [{ classId: 'warlock', level: 5, subclassId: 'fiend' }],
      pactBoon: 'pact-of-the-chain',
      classOptionIds: ['agonizing-blast', 'voice-of-the-chain-master'],
    });
    const switched = { ...b, pactBoon: 'pact-of-the-tome' };
    const result = reconcileClassOptions(switched, deriveBuild(switched));
    expect(result.build.classOptionIds).toEqual(['agonizing-blast']);
    expect(result.changes.join(' ')).toContain('Voice of the Chain Master');
  });

  it('clears a Pact Boon when the character stops being a Warlock', () => {
    const b = build({
      classes: [{ classId: 'fighter', level: 5 }],
      pactBoon: 'pact-of-the-blade',
    });
    const result = reconcileClassOptions(b, deriveBuild(b));
    expect(result.build.pactBoon).toBeUndefined();
    expect(result.changes.join(' ')).toContain('no longer a Warlock');
  });

  it('says nothing when every option still holds', () => {
    const b = build({
      classes: [{ classId: 'warlock', level: 5, subclassId: 'fiend' }],
      classOptionIds: ['agonizing-blast'],
    });
    const result = reconcileClassOptions(b, deriveBuild(b));
    expect(result.changes).toEqual([]);
    expect(result.build.classOptionIds).toEqual(['agonizing-blast']);
  });
});

describe('build review findings', () => {
  const titles = (b: Build) => analyze(deriveBuild(b)).map((f) => f.title);

  it('flags unspent slots with the right grammar', () => {
    const warlock2 = build({ classes: [{ classId: 'warlock', level: 2, subclassId: 'fiend' }] });
    expect(titles(warlock2)).toContain('2 Eldritch Invocations unspent');

    const warlock2WithOne = build({
      classes: [{ classId: 'warlock', level: 2, subclassId: 'fiend' }],
      classOptionIds: ['agonizing-blast'],
    });
    expect(titles(warlock2WithOne)).toContain('1 Eldritch Invocation unspent');

    const battleMaster = build({ classes: [{ classId: 'fighter', level: 3, subclassId: 'battle-master' }] });
    expect(titles(battleMaster)).toContain('3 maneuvers unspent');
    expect(titles(battleMaster)).toContain('1 fighting style unspent');
  });

  it('stops flagging once the slots are filled', () => {
    const filled = build({
      classes: [{ classId: 'sorcerer', level: 3 }],
      classOptionIds: ['quickened-spell', 'twinned-spell'],
    });
    expect(titles(filled).some((t) => t.includes('Metamagic'))).toBe(false);
  });

  it('flags a blasting Warlock with no Agonizing Blast, and praises one who has it', () => {
    const without = build({
      classes: [{ classId: 'warlock', level: 5, subclassId: 'fiend' }],
      weapons: weaponsForProfile('spell', 'none'),
    });
    expect(titles(without)).toContain('No Agonizing Blast');

    const with_ = { ...without, classOptionIds: ['agonizing-blast'] };
    expect(titles(with_)).not.toContain('No Agonizing Blast');
    expect(titles(with_)).toContain('Agonizing Blast is taken');
  });

  it('says nothing about Agonizing Blast to a bladelock', () => {
    const blade = build({
      classes: [{ classId: 'warlock', level: 5, subclassId: 'hexblade' }],
      weapons: weaponsForProfile('str-melee', 'two-handed'),
      pactBoon: 'pact-of-the-blade',
    });
    expect(titles(blade)).not.toContain('No Agonizing Blast');
  });

  it('flags an option whose prerequisite has lapsed', () => {
    const lapsed = build({
      classes: [{ classId: 'warlock', level: 5, subclassId: 'fiend' }],
      pactBoon: 'pact-of-the-tome',
      classOptionIds: ['voice-of-the-chain-master'],
    });
    expect(titles(lapsed)).toContain('A class option no longer applies');
  });
});

describe('the Defense fighting style', () => {
  const inPlate = (extra: Partial<Build>) =>
    deriveBuild(build({
      classes: [{ classId: 'fighter', level: 5 }],
      defenses: { ...emptyBuild().defenses, armorId: 'plate' },
      ...extra,
    }));

  it('adds 1 AC as a 2014 class option', () => {
    expect(inPlate({ classOptionIds: ['defense'] }).ac.total)
      .toBe(inPlate({}).ac.total + 1);
  });

  it('adds 1 AC as the 2024 feat', () => {
    expect(inPlate({ ruleset: '2024', featIds: ['defense'] }).ac.total)
      .toBe(inPlate({ ruleset: '2024' }).ac.total + 1);
  });

  it('does not stack when a character somehow has both', () => {
    expect(inPlate({ classOptionIds: ['defense'], featIds: ['defense'] }).ac.total)
      .toBe(inPlate({}).ac.total + 1);
  });

  it('does nothing without armor', () => {
    const unarmored = (extra: Partial<Build>) =>
      deriveBuild(build({
        classes: [{ classId: 'fighter', level: 5 }],
        defenses: { ...emptyBuild().defenses, armorId: 'none' },
        ...extra,
      }));
    expect(unarmored({ classOptionIds: ['defense'] }).ac.total).toBe(unarmored({}).ac.total);
  });
});

describe('fighting styles under 2024', () => {
  /*
    §59.1. 2024 turned fighting styles into feats, and the class feature that
    grants the slot did not move - so `optionsFor('fighting-style', '2024')`
    answered with nothing while `optionGroups` still reported a slot to fill.
    The Builder showed "0 of 1 chosen · 1 to choose" over an empty list, on
    every 2024 class that grants a style.

    Both directions are asserted, because each half was broken on its own.
  */
  const at = (classId: ClassId, level: number, ruleset: Ruleset) =>
    deriveBuild({ ...emptyBuild(), ruleset, classes: [{ classId, level }] });

  it('offers a style to every 2024 class that grants a slot', () => {
    const empty: string[] = [];
    for (const classId of ['fighter', 'paladin', 'ranger'] as ClassId[]) {
      const group = optionGroups(at(classId, 5, '2024')).find((g) => g.kind === 'fighting-style');
      if (!group) empty.push(`${classId}: no group at all`);
      else if (group.suggestions.length === 0) empty.push(`${classId}: ${group.slots} slots, 0 options`);
    }
    expect(empty).toEqual([]);
  });

  it('keeps the same ids in both editions, so switching rules keeps your style', () => {
    const ids = (ruleset: Ruleset) =>
      optionsFor('fighting-style', ruleset).map((o) => o.id).sort();
    // Not identical lists - 2024 dropped some and added others - but every
    // style that exists in both must answer to the same id.
    const shared = ids('2014').filter((id) => ids('2024').includes(id));
    expect(shared.length, 'no style survives the edition change by id').toBeGreaterThan(3);
  });

  it('never offers a fighting style as an ability score improvement', () => {
    /*
      The quieter half. A 2024 Fighter could spend an improvement on Archery,
      which the class hands over for free - four of them were eligible when
      this was measured.
    */
    const spent = recommendFeats(at('fighter', 5, '2024'), { limit: 60 })
      .filter((s) => s.feat.category === 'fighting-style')
      .map((s) => s.feat.name);
    expect(spent).toEqual([]);
  });
});
