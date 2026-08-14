import { describe, expect, it } from 'vitest';
import type { Ability, Build } from '../types';
import { RULESETS } from '../types';
import { FEATS, FEATS_BY_ID, featById, featsFor } from '../data/feats';
import { RACES, racesFor } from '../data/races';
import { CLASSES, CLASSES_BY_ID, classesFor, skillChoicesFor, subclassLevelFor } from '../data/classes';
import { ALL_SKILL_IDS } from '../data/skills';
import { BACKGROUNDS } from '../data/backgrounds';
import { abilityMod, blankBuild, deriveBuild, emptyBuild, futureAsiSlots, proficiencyBonus, totalLevel, weaponsForProfile } from './character';
import { bestAsiAllocations, planProgression, recommendFeats, recommendNext, scoreFeat } from './recommend';
import { bestRacesFor, cellFor } from './raceMatrix';
import { bestBackgroundsFor } from './backgroundMatrix';
import { isLegalPointBuy, optimalPointBuy, pointsSpent } from './pointBuy';
import { analyze, problemsOnly } from './analyze';

function build(overrides: Partial<Build> = {}): Build {
  return { ...emptyBuild(), ...overrides };
}

function rankOf(featId: string, ctx: ReturnType<typeof deriveBuild>): number {
  const list = recommendFeats(ctx, { includeIneligible: true });
  return list.findIndex((s) => s.id === featId);
}

describe('ability maths', () => {
  it('computes modifiers', () => {
    expect(abilityMod(8)).toBe(-1);
    expect(abilityMod(10)).toBe(0);
    expect(abilityMod(15)).toBe(2);
    expect(abilityMod(20)).toBe(5);
  });

  it('computes proficiency bonus', () => {
    expect(proficiencyBonus(1)).toBe(2);
    expect(proficiencyBonus(4)).toBe(2);
    expect(proficiencyBonus(5)).toBe(3);
    expect(proficiencyBonus(17)).toBe(6);
  });
});

describe('data integrity', () => {
  it('has unique ids', () => {
    for (const [label, ids] of [
      ['race', RACES.map((r) => r.id)],
      ['class', CLASSES.map((c) => c.id)],
      ['feat', FEATS.map((f) => f.id)],
    ] as const) {
      expect(new Set(ids).size, `${label} ids must be unique`).toBe(ids.length);
    }
  });

  it('gives every class a subclass list and two saves', () => {
    for (const klass of CLASSES) {
      expect(klass.subclasses.length, klass.name).toBeGreaterThan(0);
      expect(klass.saves).toHaveLength(2);
      expect(new Set(klass.subclasses.map((s) => s.id)).size).toBe(klass.subclasses.length);
    }
  });

  it('only lets half-feats grant +1', () => {
    for (const feat of FEATS) {
      if (!feat.asi) continue;
      expect(feat.asi.amount, feat.name).toBe(1);
      expect(feat.asi.abilities.length, feat.name).toBeGreaterThan(0);
    }
  });

  it('gives every class a skill list it can actually fill', () => {
    const known = new Set(ALL_SKILL_IDS);
    for (const klass of CLASSES) {
      for (const ruleset of RULESETS) {
        const choice = skillChoicesFor(klass, ruleset);
        expect(choice.count, klass.name).toBeGreaterThan(0);
        expect(choice.from.length, klass.name).toBeGreaterThanOrEqual(choice.count);
        for (const id of choice.from) expect(known.has(id), `${klass.name}: ${id}`).toBe(true);
      }
    }
  });

  it('points every skill grant at a real skill', () => {
    const known = new Set<string>(ALL_SKILL_IDS);
    for (const race of RACES) {
      for (const id of race.skillGrants?.fixed ?? []) {
        expect(known.has(id), `${race.name}: ${id}`).toBe(true);
      }
      for (const id of race.skillGrants?.choose?.from ?? []) {
        expect(known.has(id), `${race.name}: ${id}`).toBe(true);
      }
    }
    for (const background of BACKGROUNDS) {
      for (const id of background.skills) {
        expect(known.has(id), `${background.name}: ${id}`).toBe(true);
      }
    }
    for (const feat of FEATS) {
      const skills = feat.grants?.skills;
      if (Array.isArray(skills)) {
        for (const id of skills) expect(known.has(id), `${feat.name}: ${id}`).toBe(true);
      }
      for (const id of feat.grants?.passive ?? []) {
        expect(known.has(id), `${feat.name}: ${id}`).toBe(true);
      }
    }
  });

  it('drops Keen Mind from 2024, where it was cut', () => {
    expect(featsFor('2014').some((f) => f.id === 'keen-mind')).toBe(true);
    expect(featsFor('2024').some((f) => f.id === 'keen-mind')).toBe(false);
  });

  it('points every lineage feat prerequisite at a real lineage', () => {
    const known = new Set<string>([
      ...RACES.map((r) => r.id),
      ...RACES.map((r) => r.parent ?? r.name),
    ]);
    for (const feat of FEATS) {
      for (const race of feat.prereq?.races ?? []) {
        expect(known.has(race), `${feat.name} requires unknown lineage "${race}"`).toBe(true);
      }
    }
  });
});

describe('derived build', () => {
  it('applies racial increases on top of base scores', () => {
    const ctx = deriveBuild(
      build({
        raceId: 'dwarf-mountain',
        baseScores: { str: 15, dex: 12, con: 14, int: 8, wis: 10, cha: 8 },
      }),
    );
    expect(ctx.scores.str).toBe(17);
    expect(ctx.scores.con).toBe(16);
    expect(ctx.scores.dex).toBe(12);
  });

  it('honours the Tasha\'s custom origin toggle', () => {
    const ctx = deriveBuild(
      build({
        raceId: 'dwarf-mountain',
        customOrigin: true,
        flexibleAsiPicks: ['int', 'con'],
        baseScores: { str: 8, dex: 14, con: 14, int: 15, wis: 10, cha: 8 },
      }),
    );
    expect(ctx.scores.int).toBe(17);
    expect(ctx.scores.con).toBe(15);
    expect(ctx.scores.str).toBe(8); // the lineage's fixed +2 STR no longer applies
  });

  it('caps scores at 20', () => {
    const ctx = deriveBuild(
      build({
        raceId: 'human',
        baseScores: { str: 20, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        asiPicks: [['str', 'str']],
      }),
    );
    expect(ctx.scores.str).toBe(20);
  });

  it('counts ASI slots per class, including the Fighter\'s extras', () => {
    expect(deriveBuild(build({ raceId: 'human', classes: [{ classId: 'fighter', level: 6 }] })).asiSlotsReached).toBe(2);
    expect(deriveBuild(build({ raceId: 'human', classes: [{ classId: 'wizard', level: 6 }] })).asiSlotsReached).toBe(1);
    expect(deriveBuild(build({ raceId: 'human', classes: [{ classId: 'rogue', level: 10 }] })).asiSlotsReached).toBe(3);
  });

  it('counts the Variant Human bonus feat as a free origin feat, not an ASI slot', () => {
    const ctx = deriveBuild(build({ raceId: 'human-variant', classes: [{ classId: 'wizard', level: 4 }] }));
    expect(ctx.asiSlotsReached).toBe(1);
    expect(ctx.originFeatSlots).toBe(1);
  });

  it('grants a free origin feat from a 2024 background', () => {
    const ctx = deriveBuild(
      build({
        ruleset: '2024',
        raceId: 'elf-wood-2024',
        backgroundId: 'soldier-2024',
        classes: [{ classId: 'fighter', level: 4 }],
      }),
    );
    // Background feat only; the 2024 Human would grant a second.
    expect(ctx.originFeatSlots).toBe(1);
    expect(deriveBuild(build({
      ruleset: '2024',
      raceId: 'human-2024',
      backgroundId: 'soldier-2024',
      classes: [{ classId: 'fighter', level: 4 }],
    })).originFeatSlots).toBe(2);
  });

  it('takes 2024 origin increases from the background, not the species', () => {
    const ctx = deriveBuild(
      build({
        ruleset: '2024',
        raceId: 'elf-wood-2024',
        backgroundId: 'soldier-2024',
        backgroundAsi: { mode: '2+1', picks: ['str', 'con'] },
        classes: [{ classId: 'fighter', level: 4 }],
        baseScores: { str: 15, dex: 14, con: 14, int: 8, wis: 10, cha: 8 },
      }),
    );
    expect(ctx.scores.str).toBe(17);
    expect(ctx.scores.con).toBe(15);
    expect(ctx.scores.dex).toBe(14); // the species grants nothing
  });

  it('supports the +1/+1/+1 background spread', () => {
    const ctx = deriveBuild(
      build({
        ruleset: '2024',
        raceId: 'human-2024',
        backgroundId: 'soldier-2024',
        backgroundAsi: { mode: '1+1+1', picks: [] },
        classes: [{ classId: 'fighter', level: 4 }],
        baseScores: { str: 15, dex: 14, con: 14, int: 8, wis: 10, cha: 8 },
      }),
    );
    // Soldier lists Strength, Dexterity and Constitution.
    expect([ctx.scores.str, ctx.scores.dex, ctx.scores.con]).toEqual([16, 15, 15]);
  });

  it('keeps each ruleset\'s feats out of the other\'s recommendations', () => {
    const only2014 = deriveBuild(build({ classes: [{ classId: 'fighter', level: 8 }] }));
    const ids2014 = recommendFeats(only2014, { includeIneligible: true }).map((s) => s.id);
    expect(ids2014).toContain('sharpshooter');
    expect(ids2014).not.toContain('sharpshooter-2024');
    expect(ids2014).not.toContain('crafter');

    const only2024 = deriveBuild(
      build({ ruleset: '2024', raceId: 'human-2024', classes: [{ classId: 'fighter', level: 8 }] }),
    );
    const ids2024 = recommendFeats(only2024, { includeIneligible: true }).map((s) => s.id);
    expect(ids2024).toContain('sharpshooter');
    expect(ids2024).not.toContain('elven-accuracy'); // lineage feats are gone in 2024
  });

  it('gives a feat its 2024 form without changing its id', () => {
    // One record, two versions: switching ruleset must not drop a taken feat.
    const in2014 = featById('sharpshooter', '2014')!;
    const in2024 = featById('sharpshooter', '2024')!;
    expect(in2014.asi).toBeUndefined();
    expect(in2024.asi).toEqual({ abilities: ['dex'], amount: 1 });
    expect(in2024.summary).not.toBe(in2014.summary);
    expect(in2024.id).toBe(in2014.id);
  });

  it('applies a 2024 half-feat increase to the actual scores', () => {
    const ctx = deriveBuild(
      build({
        ruleset: '2024',
        raceId: 'human-2024',
        backgroundId: 'soldier-2024',
        backgroundAsi: { mode: '2+1', picks: ['dex', 'con'] },
        classes: [{ classId: 'fighter', level: 4 }],
        baseScores: { str: 8, dex: 15, con: 14, int: 10, wis: 12, cha: 10 },
        weapons: weaponsForProfile('dex-ranged', 'ranged'),
        featIds: ['sharpshooter'],
      }),
    );
    // 15 base + 2 background + 1 from the 2024 Sharpshooter.
    expect(ctx.scores.dex).toBe(18);

    // The same character under 2014 gets no such increase.
    const legacy = deriveBuild(
      build({
        raceId: 'human',
        classes: [{ classId: 'fighter', level: 4 }],
        baseScores: { str: 8, dex: 15, con: 14, int: 10, wis: 12, cha: 10 },
        weapons: weaponsForProfile('dex-ranged', 'ranged'),
        featIds: ['sharpshooter'],
      }),
    );
    expect(legacy.scores.dex).toBe(16); // 15 + 1 human, and nothing from the feat
  });

  it('gates 2024 General feats behind level 4', () => {
    const low = deriveBuild(
      build({ ruleset: '2024', raceId: 'human-2024', classes: [{ classId: 'fighter', level: 3 }] }),
    );
    expect(scoreFeat(featById('sharpshooter', '2024')!, low).eligible).toBe(false);
    expect(scoreFeat(featById('alert', '2024')!, low).eligible).toBe(true);

    const high = deriveBuild(
      build({ ruleset: '2024', raceId: 'human-2024', classes: [{ classId: 'fighter', level: 4 }] }),
    );
    expect(scoreFeat(featById('sharpshooter', '2024')!, high).eligible).toBe(true);
  });

  it('lists future ASI levels in order', () => {
    const slots = futureAsiSlots(build({ classes: [{ classId: 'fighter', level: 5 }] }));
    expect(slots.map((s) => s.classLevel)).toEqual([6, 8, 12, 14, 16, 19]);
  });
});

describe('point buy', () => {
  it('prices scores correctly', () => {
    expect(pointsSpent({ str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 })).toBe(27);
    expect(pointsSpent({ str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 })).toBe(0);
  });

  it('produces a legal spread for every class', () => {
    for (const klass of CLASSES) {
      const scores = optimalPointBuy(klass.abilityPriority);
      expect(isLegalPointBuy(scores), klass.name).toBe(true);
      const primary = (Object.keys(klass.abilityPriority) as Ability[]).filter(
        (a) => klass.abilityPriority[a] === 3,
      );
      for (const ability of primary) {
        expect(scores[ability], `${klass.name} ${ability}`).toBeGreaterThanOrEqual(14);
      }
    }
  });
});

describe('feat scoring', () => {
  it('rates Sharpshooter top for an archer and near-worthless for a greatsword', () => {
    const archer = deriveBuild(
      build({
        classes: [{ classId: 'fighter', level: 8, subclassId: 'samurai' }],
        weapons: weaponsForProfile('dex-ranged', 'ranged'),
        baseScores: { str: 8, dex: 15, con: 14, int: 10, wis: 12, cha: 10 },
      }),
    );
    const greatsword = deriveBuild(
      build({
        classes: [{ classId: 'fighter', level: 8, subclassId: 'samurai' }],
        weapons: weaponsForProfile('str-melee', 'two-handed'),
      }),
    );
    expect(scoreFeat(FEATS_BY_ID['sharpshooter'], archer).score).toBeGreaterThan(
      scoreFeat(FEATS_BY_ID['sharpshooter'], greatsword).score + 8,
    );
    expect(rankOf('sharpshooter', archer)).toBeLessThan(3);
  });

  it('rates Great Weapon Master for two-handed builds only', () => {
    const barbarian = deriveBuild(
      build({
        raceId: 'goliath',
        classes: [{ classId: 'barbarian', level: 8, subclassId: 'zealot' }],
        weapons: weaponsForProfile('str-melee', 'two-handed'),
      }),
    );
    const wizard = deriveBuild(
      build({
        raceId: 'gnome-rock',
        classes: [{ classId: 'wizard', level: 8, subclassId: 'evocation' }],
        weapons: weaponsForProfile('spell', 'none'),
      }),
    );
    expect(rankOf('great-weapon-master', barbarian)).toBeLessThan(4);
    expect(scoreFeat(FEATS_BY_ID['great-weapon-master'], wizard).score).toBeLessThan(3);
  });

  it('pairs Polearm Master and Sentinel', () => {
    const withoutPam = deriveBuild(
      build({ classes: [{ classId: 'fighter', level: 8 }], weapons: weaponsForProfile('str-melee', 'polearm') }),
    );
    const withPam = deriveBuild(
      build({
        classes: [{ classId: 'fighter', level: 8 }],
        weapons: weaponsForProfile('str-melee', 'polearm'),
        featIds: ['polearm-master'],
      }),
    );
    expect(scoreFeat(FEATS_BY_ID['sentinel'], withPam).score).toBeGreaterThan(
      scoreFeat(FEATS_BY_ID['sentinel'], withoutPam).score,
    );
  });

  it('puts a half-feat +1 into the ability where it crosses a modifier step', () => {
    const ctx = deriveBuild(
      build({
        raceId: 'half-elf',
        flexibleAsiPicks: ['dex', 'con'],
        classes: [{ classId: 'sorcerer', level: 8, subclassId: 'divine-soul' }],
        weapons: weaponsForProfile('spell', 'none'),
        baseScores: { str: 8, dex: 13, con: 14, int: 10, wis: 10, cha: 15 },
      }),
    );
    // CHA ends on 17, so Fey Touched's +1 should go there rather than anywhere else.
    expect(ctx.scores.cha).toBe(17);
    expect(scoreFeat(FEATS_BY_ID['fey-touched'], ctx).asiChoice).toBe('cha');
  });

  it('blocks lineage feats on the wrong lineage and allows them on the right one', () => {
    const dwarf = deriveBuild(build({ raceId: 'dwarf-hill', classes: [{ classId: 'cleric', level: 8 }] }));
    const halfElf = deriveBuild(
      build({ raceId: 'half-elf', flexibleAsiPicks: ['dex', 'con'], classes: [{ classId: 'rogue', level: 8 }] }),
    );
    expect(scoreFeat(FEATS_BY_ID['elven-accuracy'], dwarf).eligible).toBe(false);
    expect(scoreFeat(FEATS_BY_ID['elven-accuracy'], halfElf).eligible).toBe(true);
    expect(scoreFeat(FEATS_BY_ID['dwarven-fortitude'], dwarf).eligible).toBe(true);
  });

  it('never recommends an ineligible feat by default', () => {
    const ctx = deriveBuild(build({ raceId: 'human', classes: [{ classId: 'barbarian', level: 12 }] }));
    for (const suggestion of recommendFeats(ctx)) {
      expect(suggestion.eligible, suggestion.feat.name).toBe(true);
    }
  });
});

describe('ASI valuation', () => {
  it('follows the declared weapon style, not the class table', () => {
    // Fighter's table lists Strength as primary, but this one shoots a bow.
    const archer = deriveBuild(
      build({
        classes: [{ classId: 'fighter', level: 8, subclassId: 'samurai' }],
        weapons: weaponsForProfile('dex-ranged', 'ranged'),
        baseScores: { str: 8, dex: 15, con: 14, int: 10, wis: 12, cha: 10 },
      }),
    );
    expect(archer.abilityPriority.dex).toBe(3);
    expect(archer.abilityPriority.str).toBe(0);
    for (const option of bestAsiAllocations(archer, 5)) {
      expect(option.allocation, 'never invest in a dumped Strength').not.toContain('str');
    }
  });

  it('keeps Strength primary for a greatsword Fighter', () => {
    const brute = deriveBuild(
      build({
        classes: [{ classId: 'fighter', level: 8 }],
        weapons: weaponsForProfile('str-melee', 'two-handed'),
      }),
    );
    expect(brute.abilityPriority.str).toBe(3);
  });

  it('prefers the primary ability while it is below 20', () => {
    const ctx = deriveBuild(
      build({
        raceId: 'human',
        classes: [{ classId: 'wizard', level: 8, subclassId: 'evocation' }],
        weapons: weaponsForProfile('spell', 'none'),
        baseScores: { str: 8, dex: 14, con: 14, int: 15, wis: 10, cha: 8 },
      }),
    );
    expect(bestAsiAllocations(ctx)[0].allocation).toContain('int');
  });

  it('stops valuing an ability once it is maxed', () => {
    const ctx = deriveBuild(
      build({
        raceId: 'human',
        classes: [{ classId: 'wizard', level: 12 }],
        weapons: weaponsForProfile('spell', 'none'),
        baseScores: { str: 8, dex: 14, con: 14, int: 19, wis: 10, cha: 8 },
      }),
    );
    expect(ctx.scores.int).toBe(20);
    expect(bestAsiAllocations(ctx).every((o) => !o.allocation.includes('int'))).toBe(true);
  });
});

describe('progression planning', () => {
  it('fills every remaining slot exactly once and never repeats a feat', () => {
    const source = build({
      raceId: 'human-variant',
      flexibleAsiPicks: ['dex', 'con'],
      classes: [{ classId: 'fighter', level: 4, subclassId: 'battle-master' }],
      weapons: weaponsForProfile('dex-ranged', 'ranged'),
    });
    const plan = planProgression(source, 20);
    const ctx = deriveBuild(source);
    const unspent = ctx.asiSlotsReached - ctx.asiSlotsSpent;
    expect(plan).toHaveLength(unspent + futureAsiSlots(source, 20).length);

    const featChoices = plan
      .filter((step) => step.choice.kind === 'feat')
      .map((step) => step.choice.id);
    expect(new Set(featChoices).size).toBe(featChoices.length);
  });

  it('reaches 20 in the primary ability by the end of a 20-level plan', () => {
    const source = build({
      raceId: 'half-elf',
      flexibleAsiPicks: ['dex', 'con'],
      classes: [{ classId: 'bard', level: 3, subclassId: 'lore' }],
      weapons: weaponsForProfile('spell', 'none'),
      baseScores: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 15 },
    });
    const plan = planProgression(source, 20);
    expect(plan.at(-1)!.scoresAfter.cha).toBe(20);
  });

  it('applies the plan without exceeding the level\'s slot budget', () => {
    const source = build({ classes: [{ classId: 'paladin', level: 12, subclassId: 'vengeance' }] });
    const plan = planProgression(source, 12);
    let updated = source;
    for (const step of plan) {
      updated =
        step.choice.kind === 'feat'
          ? { ...updated, featIds: [...updated.featIds, step.choice.id] }
          : { ...updated, asiPicks: [...updated.asiPicks, step.choice.allocation] };
    }
    const ctx = deriveBuild(updated);
    expect(ctx.asiSlotsSpent).toBe(ctx.asiSlotsReached);
  });
});

describe('2024 classes and feat categories', () => {
  const fighter2024 = (level: number, overrides: Partial<Build> = {}) =>
    deriveBuild(
      build({
        ruleset: '2024',
        raceId: 'human-2024',
        backgroundId: 'soldier-2024',
        classes: [{ classId: 'fighter', level }],
        ...overrides,
      }),
    );

  it('offers Epic Boons only at the level 19 slot', () => {
    const ctx = fighter2024(19);
    const at19 = recommendNext(ctx, 40, 19).map((s) => s.id);
    expect(at19.length).toBeGreaterThan(0);
    expect(at19.every((id) => featById(id, '2024')?.category === 'epic-boon')).toBe(true);

    const at16 = recommendNext(ctx, 40, 16).map((s) => s.id);
    expect(at16.some((id) => featById(id, '2024')?.category === 'epic-boon')).toBe(false);
  });

  it('leaves 2014 progression free to take an ASI at 19', () => {
    const legacy = deriveBuild(build({ classes: [{ classId: 'fighter', level: 19 }] }));
    expect(recommendNext(legacy, 40, 19).length).toBeGreaterThan(0);
  });

  it('gives Fighting Style feats only to classes that grant a style', () => {
    const wizard = deriveBuild(
      build({
        ruleset: '2024',
        raceId: 'human-2024',
        backgroundId: 'sage-2024',
        classes: [{ classId: 'wizard', level: 8 }],
      }),
    );
    expect(scoreFeat(featById('archery', '2024')!, wizard).eligible).toBe(false);
    expect(scoreFeat(featById('archery', '2024')!, fighter2024(8)).eligible).toBe(true);
  });

  it('counts the Defense fighting style feat towards AC', () => {
    const plain = fighter2024(8, { defenses: { ...emptyBuild().defenses, armorId: 'chain-mail' } });
    const styled = fighter2024(8, {
      defenses: { ...emptyBuild().defenses, armorId: 'chain-mail' },
      featIds: ['defense'],
    });
    expect(styled.ac.total).toBe(plain.ac.total + 1);
  });

  it('moves every subclass to level 3 under 2024', () => {
    const cleric = (ruleset: Build['ruleset'], level: number) =>
      subclassLevelFor(CLASSES_BY_ID.cleric, ruleset) <= level;
    expect(cleric('2024', 1)).toBe(false);
    expect(cleric('2024', 3)).toBe(true);
    expect(cleric('2014', 1)).toBe(true); // 2014 Clerics pick a domain at 1
    expect(subclassLevelFor(CLASSES_BY_ID.wizard, '2024')).toBe(3);
    expect(subclassLevelFor(CLASSES_BY_ID.wizard, '2014')).toBe(2);
  });

  it('plans an Epic Boon into the level 19 slot', () => {
    const source = build({
      ruleset: '2024',
      raceId: 'human-2024',
      backgroundId: 'soldier-2024',
      classes: [{ classId: 'fighter', level: 4 }],
    });
    const last = planProgression(source, 20).at(-1)!;
    expect(last.slot?.classLevel).toBe(19);
    expect(last.choice.kind).toBe('feat');
    expect(featById(last.choice.id, '2024')?.category).toBe('epic-boon');
  });

  it('plans a feat the character will qualify for by the time the slot arrives', () => {
    // A level 3 character cannot take a General feat today, but the level 6
    // slot is a level 6 decision.
    const source = build({
      ruleset: '2024',
      raceId: 'human-2024',
      backgroundId: 'soldier-2024',
      classes: [{ classId: 'fighter', level: 3 }],
    });
    const plan = planProgression(source, 8);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.map((s) => s.slot?.classLevel)).toContain(6);
  });

  it('drops the Artificer from the 2024 class list', () => {
    expect(classesFor('2024').some((c) => c.id === 'artificer')).toBe(false);
    expect(classesFor('2014').some((c) => c.id === 'artificer')).toBe(true);
  });
});

describe('race/class matrix', () => {
  it('rates every pairing in every ruleset', () => {
    for (const ruleset of RULESETS) {
      for (const race of racesFor(ruleset)) {
        for (const klass of CLASSES) {
          expect(cellFor(race.id, klass.id, ruleset), `${race.name} ${klass.name} (${ruleset})`).toBeDefined();
        }
      }
    }
  });

  it('keeps each ruleset\'s species out of the other\'s lists', () => {
    expect(racesFor('2014').some((r) => r.id === 'human-2024')).toBe(false);
    expect(racesFor('2024').some((r) => r.id === 'human-variant')).toBe(false);
    expect(cellFor('human-2024', 'fighter', '2014')).toBeUndefined();
  });

  it('rates 2024 species on traits alone and says so', () => {
    const cell = cellFor('elf-wood-2024', 'ranger', '2024')!;
    expect(cell.reasons[0]).toContain('no ability increases');
    // Curated 2014 verdicts assume 2014 increases, so they must not leak over.
    expect(cell.note).toBeUndefined();
  });

  it('agrees with the well-known picks', () => {
    expect(cellFor('dwarf-mountain', 'wizard')!.rating).toBe('sky');
    expect(cellFor('elf-wood', 'ranger')!.rating).toBe('sky');
    expect(cellFor('goliath', 'barbarian')!.rating).toBe('sky');
    expect(cellFor('half-elf', 'bard')!.rating).toBe('sky');
  });

  it('rates a mismatched pairing below a matched one', () => {
    const matched = cellFor('gnome-rock', 'wizard')!;
    const mismatched = cellFor('half-orc', 'wizard')!;
    expect(matched.score).toBeGreaterThan(mismatched.score);
  });

  it('returns lineages with the right primary stat at the top of each class list', () => {
    const forWizard = bestRacesFor('wizard', 5).map((c) => c.originId);
    expect(forWizard).toContain('gnome-rock');

    const forBarbarian = bestRacesFor('barbarian', 5).map((c) => c.originId);
    expect(forBarbarian.some((id) => ['goliath', 'half-orc', 'orc'].includes(id))).toBe(true);
  });

  it('keeps the top rating scarce enough to mean something', () => {
    const counts = { sky: 0, blue: 0, orange: 0, red: 0 };
    const races = racesFor('2014');
    for (const race of races) {
      for (const klass of CLASSES) counts[cellFor(race.id, klass.id, '2014')!.rating]++;
    }
    const total = races.length * CLASSES.length;
    // If everything is excellent, nothing is. Guards against rating inflation
    // creeping back in when weights are retuned.
    expect(counts.sky / total).toBeGreaterThan(0.03);
    expect(counts.sky / total).toBeLessThan(0.25);
    for (const klass of CLASSES) {
      const skies = races.filter((r) => cellFor(r.id, klass.id, '2014')!.rating === 'sky').length;
      expect(skies, `${klass.name} has too many top-rated lineages`).toBeLessThanOrEqual(12);
    }
  });

  it('rates 2024 species on a scale suited to traits alone', () => {
    // Traits-only scores run about 1.5-6.5 rather than 0-20. Reusing the 2014
    // cutoffs would paint the whole table red and tell players to avoid every
    // species, which is not what "species no longer carry increases" means.
    const counts = { sky: 0, blue: 0, orange: 0, red: 0 };
    const species = racesFor('2024');
    for (const race of species) {
      for (const klass of CLASSES) counts[cellFor(race.id, klass.id, '2024')!.rating]++;
    }
    const total = species.length * CLASSES.length;
    expect(counts.red / total, 'not everything should read as Avoid').toBeLessThan(0.6);
    expect(counts.sky / total).toBeGreaterThan(0.02);
    expect(counts.sky / total).toBeLessThan(0.25);
  });

  it('explains every cell', () => {
    for (const ruleset of RULESETS) {
      for (const race of racesFor(ruleset)) {
        for (const klass of CLASSES) {
          expect(cellFor(race.id, klass.id, ruleset)!.reasons.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('ranks backgrounds for a class under 2024', () => {
    const forWizard = bestBackgroundsFor('wizard', 4).map((c) => c.originId);
    expect(forWizard).toContain('sage-2024');

    const forFighter = bestBackgroundsFor('fighter', 4).map((c) => c.originId);
    expect(forFighter.some((id) => ['soldier-2024', 'guard-2024'].includes(id))).toBe(true);

    for (const cell of bestBackgroundsFor('rogue', 16)) {
      expect(cell.reasons.length, cell.originId).toBeGreaterThan(0);
    }
  });
});

describe('build review', () => {
  it('flags unspent ASI slots', () => {
    const ctx = deriveBuild(build({ raceId: 'human', classes: [{ classId: 'fighter', level: 12 }] }));
    expect(analyze(ctx).some((f) => f.title.includes('unspent'))).toBe(true);
  });

  it('flags an odd primary score', () => {
    const ctx = deriveBuild(
      build({
        raceId: 'human',
        classes: [{ classId: 'wizard', level: 8 }],
        weapons: weaponsForProfile('spell', 'none'),
        baseScores: { str: 8, dex: 14, con: 14, int: 16, wis: 10, cha: 8 },
      }),
    );
    expect(ctx.scores.int).toBe(17);
    expect(analyze(ctx).some((f) => f.title.startsWith('Odd score'))).toBe(true);
  });

  it('flags a combat feat that does nothing with the chosen loadout', () => {
    const ctx = deriveBuild(
      build({
        classes: [{ classId: 'fighter', level: 8 }],
        weapons: weaponsForProfile('str-melee', 'two-handed'),
        featIds: ['sharpshooter'],
      }),
    );
    expect(analyze(ctx).some((f) => f.title.includes('Sharpshooter') && f.severity === 'error')).toBe(
      true,
    );
  });

  it('flags a full caster with no concentration protection', () => {
    const ctx = deriveBuild(
      build({
        raceId: 'half-elf',
        flexibleAsiPicks: ['dex', 'con'],
        classes: [{ classId: 'bard', level: 12, subclassId: 'lore' }],
        weapons: weaponsForProfile('spell', 'none'),
        asiPicks: [['cha', 'cha'], ['cha', 'cha'], ['con', 'con']],
      }),
    );
    expect(analyze(ctx).some((f) => f.title === 'No concentration protection')).toBe(true);
  });

  it('is satisfied once War Caster is taken', () => {
    const ctx = deriveBuild(
      build({
        raceId: 'half-elf',
        flexibleAsiPicks: ['dex', 'con'],
        classes: [{ classId: 'bard', level: 12, subclassId: 'lore' }],
        weapons: weaponsForProfile('spell', 'none'),
        featIds: ['war-caster'],
      }),
    );
    expect(analyze(ctx).some((f) => f.title === 'Concentration is protected')).toBe(true);
  });
});

/**
 * 2024's own choices. The review said nothing about either of these for
 * several phases: a Fighter could sit on six unspent masteries and a
 * background could hand out increases to abilities it does not raise, and the
 * sheet was silent on both.
 */
describe('the review on 2024-only choices', () => {
  const fighter2024 = (overrides: Partial<Build> = {}) =>
    deriveBuild(
      build({
        ruleset: '2024',
        raceId: 'human-2024',
        backgroundId: 'soldier-2024',
        classes: [{ classId: 'fighter', level: 9, subclassId: 'champion' }],
        baseScores: { str: 15, dex: 14, con: 14, int: 10, wis: 10, cha: 8 },
        weapons: weaponsForProfile('str-melee', 'two-handed'),
        ...overrides,
      }),
    );

  const titles = (ctx: ReturnType<typeof deriveBuild>) => analyze(ctx).map((f) => f.title);

  it('says nothing about a mastery you are actually holding', () => {
    const ctx = fighter2024({ masteryIds: ['greatsword'] });
    expect(ctx.build.weapons.mainHandId).toBe('greatsword');
    expect(titles(ctx).some((t) => t.includes('mastery'))).toBe(false);
  });

  /** Not an error - swapping weapons is legitimate - but worth knowing. */
  it('mentions a mastery sitting on a weapon left at home', () => {
    const ctx = fighter2024({ masteryIds: ['greatsword', 'handaxe'] });
    const finding = analyze(ctx).find((f) => f.title.includes('mastery'));
    expect(finding?.severity).toBe('info');
    expect(finding?.detail).toContain('Handaxe');
  });

  /** Unchosen masteries are a section badge, not a finding, by standing rule. */
  it('does not nag about masteries that are merely unchosen', () => {
    expect(titles(fighter2024()).some((t) => t.includes('mastery'))).toBe(false);
  });

  it('catches a background increase the background cannot grant', () => {
    // Soldier raises Strength, Dexterity or Constitution - never Charisma.
    const ctx = fighter2024({ backgroundAsi: { mode: '2+1', picks: ['str', 'cha'] } });
    const finding = analyze(ctx).find((f) => f.title.includes('cannot raise'));
    expect(finding?.severity).toBe('error');
    expect(finding?.title).toContain('Charisma');
  });

  it('is quiet when the picks are ones the background offers', () => {
    const ctx = fighter2024({ backgroundAsi: { mode: '2+1', picks: ['str', 'con'] } });
    expect(ctx.scores.str).toBe(17);
    expect(titles(ctx).some((t) => t.includes('cannot raise'))).toBe(false);
  });

  /** None of this applies to a 2014 character, who has neither feature. */
  it('leaves a 2014 build alone', () => {
    const ctx = deriveBuild(
      build({
        classes: [{ classId: 'fighter', level: 9, subclassId: 'champion' }],
        masteryIds: ['handaxe'],
        backgroundAsi: { mode: '2+1', picks: ['cha'] },
      }),
    );
    expect(titles(ctx).some((t) => t.includes('mastery') || t.includes('cannot raise'))).toBe(false);
  });
});

describe('what the review counts as a mistake', () => {
  /**
   * The split matters because the two go to different places: the Builder
   * shows only the mistakes, while the printed build summary shows both -
   * on paper there is no section badge to read instead.
   */
  it('marks unmade choices apart from things that are wrong', () => {
    const ctx = deriveBuild(
      build({
        classes: [{ classId: 'fighter', level: 8, subclassId: 'battle-master' }],
        baseScores: { str: 15, dex: 14, con: 14, int: 10, wis: 10, cha: 8 },
      }),
    );
    const all = analyze(ctx);
    const problems = problemsOnly(all);

    expect(all.some((f) => f.alsoShownAs === 'section-badge')).toBe(true);
    expect(problems.length).toBeLessThan(all.length);
    expect(problems.every((f) => !f.alsoShownAs)).toBe(true);
    // Nothing is lost - the Builder hides them, analyze still reports them.
    expect(all.some((f) => f.title.includes('unspent'))).toBe(true);
  });
});

describe('a blank character', () => {
  /**
   * `emptyBuild` is a fully equipped Battle Master 5 - a fine demonstration
   * and a poor blank page. Someone who came to enter the character they
   * already have should not have to delete a stranger's choices first.
   */
  it('has nothing decided and the whole budget to spend', () => {
    const b = blankBuild('2014');
    expect(b.name).toBe('');
    expect(totalLevel(b)).toBe(1);
    expect(pointsSpent(b.baseScores)).toBe(0);
    expect(b.weapons.mainHandId).toBeUndefined();
    expect(b.defenses.armorId).toBe('none');
    expect([b.featIds, b.skillIds, b.classOptionIds, b.spellIds].every((l) => l.length === 0)).toBe(
      true,
    );
  });

  it('starts on a species that exists in the chosen rules', () => {
    for (const ruleset of RULESETS) {
      const b = blankBuild(ruleset);
      expect(racesFor(ruleset).some((r) => r.id === b.raceId)).toBe(true);
    }
  });

  /**
   * Every number on an unassigned sheet is low by construction, so the review
   * would open with a wall of complaints about choices nobody has made.
   */
  it('draws no complaints about numbers nobody has set', () => {
    const problems = problemsOnly(analyze(deriveBuild(blankBuild('2014'))));
    expect(problems).toHaveLength(0);
  });
});

describe('beyond level 20 (§72)', () => {
  /*
    The cap is 30, and the split is honest: formulas keep climbing, printed
    tables hold their level-20 row. These pin both halves so a table lookup
    that stops clamping - or a formula that starts - fails by name.
  */
  it('keeps the proficiency formula climbing past the printed table', () => {
    expect(proficiencyBonus(20)).toBe(6);
    expect(proficiencyBonus(21)).toBe(7);
    expect(proficiencyBonus(25)).toBe(8);
    expect(proficiencyBonus(29)).toBe(9);
    expect(proficiencyBonus(30)).toBe(9);
  });

  it('derives a level-30 single-class build without inventing table rows', () => {
    const twenty = deriveBuild(build({ classes: [{ classId: 'fighter', level: 20 }] }));
    const thirty = deriveBuild(build({ classes: [{ classId: 'fighter', level: 30 }] }));
    expect(thirty.totalLevel).toBe(30);
    expect(thirty.proficiency).toBe(9);
    // Hit points are a per-level formula: ten more levels keep accruing.
    expect(thirty.hp.total).toBeGreaterThan(twenty.hp.total);
    // ASI slots come from the class table, which ends at 19: no new rows.
    expect(thirty.asiSlotsReached).toBe(twenty.asiSlotsReached);
    // And nothing in the derivation goes undefined on the way.
    expect(Number.isFinite(thirty.hp.total)).toBe(true);
    expect(thirty.attacks.every((a) => Number.isFinite(a.toHit))).toBe(true);
  });

  it('holds a level-30 caster at the level-20 slot row', () => {
    const twenty = deriveBuild(
      build({ classes: [{ classId: 'wizard', level: 20 }], weapons: { magicBonus: {} } }),
    );
    const thirty = deriveBuild(
      build({ classes: [{ classId: 'wizard', level: 30 }], weapons: { magicBonus: {} } }),
    );
    expect(thirty.spellcasting.bySpellLevel).toEqual(twenty.spellcasting.bySpellLevel);
    expect(thirty.spellcasting.cantripsKnown).toBe(twenty.spellcasting.cantripsKnown);
  });

  it('plans progression to 30 without inventing ASI slots past the table', () => {
    const b = build({ classes: [{ classId: 'fighter', level: 20 }] });
    expect(futureAsiSlots(b, 30)).toEqual([]);
    expect(planProgression(b, 30).every((step) => step.slot === null)).toBe(true);
  });
});
