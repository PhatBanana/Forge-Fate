import { describe, expect, it } from 'vitest';
import type { Build } from '../types';
import { deriveBuild, emptyBuild, weaponsForProfile } from './character';
import { planProgression, recommendNext, describeSuggestion } from './recommend';
import { analyze } from './analyze';
import { bestRacesFor } from './raceMatrix';
import { masterySlots } from './attacks';

/**
 * These pin what a build derives to, so a refactor cannot change it quietly.
 *
 * The 2014 table came first, to hold the line through the ruleset refactor.
 * The 2024 table came much later and for a worse reason: a code review noticed
 * that every one of these was a 2014 build, so the edition with different
 * species, backgrounds, origin feats, weapon mastery and subclass levels had
 * unit tests for the behaviours somebody thought to check and nothing at all
 * for the behaviours nobody did. That is precisely the gap a snapshot fills.
 */

function build(overrides: Partial<Build> = {}): Build {
  return { ...emptyBuild(), ...overrides };
}

/**
 * A compact, comparable summary of everything derived from a build.
 *
 * The edition-specific parts are spread in only when they have something to
 * say. A 2014 character has no weapon masteries and one casting ability, so
 * those keys are simply absent and every 2014 snapshot here predates them
 * unchanged - which is what let this grow without re-recording seventeen files
 * and losing the signal in the churn.
 */
function fingerprint(b: Build) {
  const ctx = deriveBuild(b);
  const masterySlotCount = masterySlots(ctx.slices, b.ruleset);
  const casting = ctx.spellcasting;

  return {
    scores: ctx.scores,
    ac: ctx.ac.total,
    acSource: ctx.ac.source,
    hp: ctx.hp.total,
    slots: `${ctx.asiSlotsSpent}/${ctx.asiSlotsReached}`,
    keyAbility: ctx.keyAbility,
    priority: ctx.abilityPriority,
    top3: recommendNext(ctx, 3).map(describeSuggestion),
    findings: analyze(ctx).map((f) => f.title),
    /*
      The damage model, which this file did not pin at all until weapon mastery
      went into it and nothing here noticed. One of these cases *does* carry
      masteries on an equipped greatsword, so it should have moved and could
      not - the fingerprint had every derived number except the one the app
      spends the most arithmetic on.

      Recorded as a string of the headline figures rather than the whole curve:
      enough that a real change fails, little enough that the diff stays
      readable. The itemised lines are asserted in dpr.test.ts, where a change
      to one of them says which one.
    */
    dpr: `${ctx.dpr.sustained} sustained, ${ctx.dpr.nova} nova at AC ${ctx.dpr.targetAc}`,
    ...(masterySlotCount > 0
      ? { masteries: `${b.masteryIds.length}/${masterySlotCount}: ${b.masteryIds.join(', ') || 'none taken'}` }
      : {}),
    ...(b.originFeatIds.length ? { originFeats: b.originFeatIds } : {}),
    ...(casting.sources.length > 1
      ? { casting: casting.sources.map((s) => `${s.classId} ${s.ability} DC${s.saveDc}`) }
      : {}),
  };
}

const CASES: Record<string, Build> = {
  'variant human battlemaster in chain mail': build(),

  'wood elf gloom stalker archer': build({
    name: 'Thistle',
    raceId: 'elf-wood',
    flexibleAsiPicks: [],
    classes: [{ classId: 'ranger', level: 8, subclassId: 'gloom-stalker' }],
    baseScores: { str: 8, dex: 15, con: 14, int: 10, wis: 13, cha: 12 },
    weapons: weaponsForProfile('dex-ranged', 'ranged'),
    featIds: ['sharpshooter'],
    asiPicks: [['dex', 'dex']],
    defenses: { ...emptyBuild().defenses, armorId: 'half-plate' },
  }),

  'mountain dwarf wizard in half plate': build({
    raceId: 'dwarf-mountain',
    flexibleAsiPicks: [],
    classes: [{ classId: 'wizard', level: 8, subclassId: 'evocation' }],
    baseScores: { str: 8, dex: 14, con: 14, int: 15, wis: 10, cha: 8 },
    weapons: weaponsForProfile('spell', 'none'),
    defenses: { ...emptyBuild().defenses, armorId: 'half-plate' },
  }),

  'goliath zealot barbarian': build({
    raceId: 'goliath',
    flexibleAsiPicks: [],
    classes: [{ classId: 'barbarian', level: 12, subclassId: 'zealot' }],
    baseScores: { str: 15, dex: 14, con: 15, int: 8, wis: 10, cha: 8 },
    weapons: weaponsForProfile('str-melee', 'two-handed'),
    featIds: ['great-weapon-master'],
    asiPicks: [['str', 'str'], ['str', 'str']],
  }),

  /*
    A subclass that hands over spells, which no case here had. The Life Domain
    grants six by 5th level, always prepared and free of the count - so this
    pins both that they arrive and that they do not eat the prepared budget.
  */
  'hill dwarf life cleric with domain spells': build({
    raceId: 'dwarf-hill',
    classes: [{ classId: 'cleric', level: 5, subclassId: 'life' }],
    baseScores: { str: 14, dex: 10, con: 14, int: 10, wis: 15, cha: 12 },
    weapons: weaponsForProfile('str-melee', 'sword-and-board'),
    defenses: { ...emptyBuild().defenses, armorId: 'chain-mail', shield: true },
    spellIds: ['sacred-flame', 'guidance', 'healing-word', 'spiritual-weapon'],
  }),

  'half-elf lore bard with custom origin': build({
    raceId: 'half-elf',
    customOrigin: true,
    flexibleAsiPicks: ['cha', 'con'],
    classes: [{ classId: 'bard', level: 12, subclassId: 'lore' }],
    baseScores: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 15 },
    weapons: weaponsForProfile('spell', 'none'),
  }),

  'fighter/rogue multiclass': build({
    raceId: 'halfling-stout',
    flexibleAsiPicks: [],
    classes: [
      { classId: 'fighter', level: 5, subclassId: 'battle-master' },
      { classId: 'rogue', level: 3, subclassId: 'thief' },
    ],
    baseScores: { str: 8, dex: 15, con: 14, int: 10, wis: 12, cha: 10 },
    weapons: weaponsForProfile('dex-melee', 'dual-wield'),
  }),
};

/**
 * The 2024 table. Each case exists to cover a dimension the 2014 cases cannot
 * reach at all, rather than to repeat them in a different edition.
 */
const CASES_2024: Record<string, Build> = {
  // Weapon mastery, which 2014 does not have: slots reached, and some spent.
  'human champion with masteries': build({
    ruleset: '2024',
    raceId: 'human-2024',
    backgroundId: 'soldier-2024',
    backgroundAsi: { mode: '2+1', picks: ['str', 'con'] },
    originFeatIds: ['savage-attacker', 'skilled'],
    classes: [{ classId: 'fighter', level: 9, subclassId: 'champion' }],
    baseScores: { str: 15, dex: 14, con: 14, int: 10, wis: 10, cha: 8 },
    weapons: weaponsForProfile('str-melee', 'two-handed'),
    masteryIds: ['greatsword', 'longsword', 'handaxe'],
  }),

  // The same character with nothing chosen, which is what a half-built 2024
  // sheet actually looks like - and the case the build review is silent on.
  'dwarf fighter with nothing 2024 chosen': build({
    ruleset: '2024',
    raceId: 'dwarf-2024',
    backgroundId: 'guard-2024',
    backgroundAsi: { mode: '2+1', picks: [] },
    classes: [{ classId: 'fighter', level: 9, subclassId: 'champion' }],
    baseScores: { str: 15, dex: 14, con: 14, int: 10, wis: 10, cha: 8 },
    weapons: weaponsForProfile('str-melee', 'two-handed'),
  }),

  // The 2024 background is where ability increases come from, and the +1/+1/+1
  // mode is the one the 2014 shape has no equivalent for at all.
  'high elf wizard on a spread background': build({
    ruleset: '2024',
    raceId: 'elf-high-2024',
    backgroundId: 'sage-2024',
    backgroundAsi: { mode: '1+1+1', picks: ['con', 'int', 'wis'] },
    originFeatIds: ['magic-initiate'],
    classes: [{ classId: 'wizard', level: 8, subclassId: 'evocation' }],
    baseScores: { str: 8, dex: 14, con: 14, int: 15, wis: 10, cha: 8 },
    weapons: weaponsForProfile('spell', 'none'),
    spellIds: ['fire-bolt', 'fireball', 'shield'],
  }),

  /*
    Two casting abilities, which is the shape that printed one wrong save DC
    until a review caught it. The scores are deliberately lopsided - an
    Intelligence-first Cleric/Wizard - because two equal DCs would pin nothing:
    the bug this guards against is only visible when the numbers differ.
  */
  'cleric/wizard with two save DCs': build({
    ruleset: '2024',
    raceId: 'human-2024',
    backgroundId: 'acolyte-2024',
    // Acolyte raises Intelligence, Wisdom or Charisma - and only those three.
    // Writing 'con' here is what the new background finding caught.
    backgroundAsi: { mode: '2+1', picks: ['int', 'cha'] },
    classes: [
      { classId: 'cleric', level: 5, subclassId: 'life' },
      { classId: 'wizard', level: 5, subclassId: 'evocation' },
    ],
    baseScores: { str: 10, dex: 12, con: 14, int: 15, wis: 13, cha: 8 },
    weapons: weaponsForProfile('spell', 'none'),
    spellIds: ['fire-bolt', 'fireball', 'cure-wounds'],
  }),
};

describe('2024 builds derive as recorded', () => {
  for (const [name, subject] of Object.entries(CASES_2024)) {
    it(name, () => {
      expect(fingerprint(subject)).toMatchSnapshot();
    });
  }
});

describe('2024 progression planning is stable', () => {
  for (const [name, subject] of Object.entries(CASES_2024)) {
    it(name, () => {
      const plan = planProgression(subject, 20).map((step) => ({
        at: step.label,
        take: describeSuggestion(step.choice),
      }));
      expect(plan).toMatchSnapshot();
    });
  }
});

describe('2014 builds derive exactly as they did before the ruleset refactor', () => {
  for (const [name, subject] of Object.entries(CASES)) {
    it(name, () => {
      expect(fingerprint(subject)).toMatchSnapshot();
    });
  }
});

describe('2014 progression planning is stable', () => {
  for (const [name, subject] of Object.entries(CASES)) {
    it(name, () => {
      const plan = planProgression(subject, 20).map((step) => ({
        at: step.label,
        take: describeSuggestion(step.choice),
      }));
      expect(plan).toMatchSnapshot();
    });
  }
});

describe('2014 race/class ratings are stable', () => {
  for (const classId of ['fighter', 'wizard', 'rogue', 'cleric', 'barbarian'] as const) {
    it(classId, () => {
      expect(
        bestRacesFor(classId, 8).map((c) => `${c.originId} ${c.rating} ${c.score.toFixed(1)}`),
      ).toMatchSnapshot();
    });
  }
});
