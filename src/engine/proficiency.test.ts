import { describe, expect, it } from 'vitest';
import type { Build } from '../types';
import type { SkillId } from '../data/skills';
import { deriveBuild, emptyBuild } from './character';
import { legalPicks, pickSources, reconcileSkillPicks } from './proficiency';
import { fillSkillPicks, recommendExpertise, recommendSkills } from './skillValue';
import { analyze } from './analyze';

function build(overrides: Partial<Build> = {}): Build {
  return { ...emptyBuild(), ...overrides };
}

/** A level 1 character with nothing but a class, for counting picks. */
function bare(overrides: Partial<Build> = {}): Build {
  return build({
    raceId: 'human',
    classes: [{ classId: 'fighter', level: 1 }],
    baseScores: { str: 15, dex: 14, con: 14, int: 10, wis: 12, cha: 8 },
    defenses: { ...emptyBuild().defenses, armorId: 'none' },
    ...overrides,
  });
}

const line = (b: Build, skill: SkillId) =>
  deriveBuild(b).proficiencies.skills.find((s) => s.skill === skill)!;

describe('skill picks', () => {
  it('counts the class list a character picks from', () => {
    const counts: Record<string, number> = {};
    for (const classId of ['rogue', 'fighter', 'wizard', 'ranger', 'bard'] as const) {
      counts[classId] = deriveBuild(bare({ classes: [{ classId, level: 1 }] })).proficiencies
        .skillPicks;
    }
    expect(counts).toEqual({ rogue: 4, fighter: 2, wizard: 2, ranger: 3, bard: 3 });
  });

  it('adds a lineage\'s floating proficiencies to the picks', () => {
    // Half-Elf's Skill Versatility is two more on top of the class list.
    expect(deriveBuild(bare({ raceId: 'half-elf' })).proficiencies.skillPicks).toBe(4);
  });

  it('grants a lineage\'s fixed skill without spending a pick', () => {
    const ctx = deriveBuild(bare({ raceId: 'elf-wood' }));
    expect(ctx.proficiencies.skillPicks).toBe(2);
    expect(line(bare({ raceId: 'elf-wood' }), 'perception').proficient).toBe(true);
    expect(line(bare({ raceId: 'elf-wood' }), 'perception').sources).toContain('Wood Elf');
    expect(ctx.proficiencies.collisions).toEqual([]);
  });

  it('grants the background skills outright', () => {
    const b = bare({
      ruleset: '2024',
      raceId: 'human-2024',
      backgroundId: 'soldier-2024',
    });
    // Soldier grants Athletics and Intimidation.
    expect(line(b, 'athletics').proficient).toBe(true);
    expect(line(b, 'intimidation').proficient).toBe(true);
    expect(line(b, 'athletics').sources).toContain('Soldier background');
  });

  it('reports a pick that collides with a granted skill', () => {
    // Athletics is on the Fighter list and granted by Soldier: taking it wastes
    // the pick. This is the finding the whole phase exists for.
    const collided = bare({
      ruleset: '2024',
      raceId: 'human-2024',
      backgroundId: 'soldier-2024',
      skillIds: ['athletics'],
    });
    const result = deriveBuild(collided).proficiencies;
    expect(result.collisions.map((c) => c.skill)).toEqual(['athletics']);
    expect(result.collisions[0].sources).toContain('Soldier background');
    // The wasted pick is still open, because it bought nothing: 2 from the
    // Fighter list plus 1 from the 2024 Human's Skillful, none of them landed.
    expect(result.skillPicks).toBe(3);
    expect(result.openSkillPicks).toBe(3);

    const clean = bare({
      ruleset: '2024',
      raceId: 'human-2024',
      backgroundId: 'soldier-2024',
      skillIds: ['acrobatics'],
    });
    expect(deriveBuild(clean).proficiencies.collisions).toEqual([]);
  });

  it('flags a pick that is not on any list this character can choose from', () => {
    // Arcana is not on the Fighter list.
    const b = bare({ skillIds: ['arcana'] });
    expect(deriveBuild(b).proficiencies.illegalPicks).toEqual(['arcana']);
  });

  it('opens the whole list when a feat grants free picks', () => {
    const b = bare({ featIds: ['skilled'], skillIds: ['arcana'] });
    const result = deriveBuild(b).proficiencies;
    expect(result.illegalPicks).toEqual([]);
    expect(result.skillPicks).toBe(5); // 2 from Fighter, 3 from Skilled
  });
});

describe('skill modifiers', () => {
  it('adds proficiency to a skill you are proficient in', () => {
    const b = bare({ skillIds: ['athletics'] });
    // STR 15 + 1 from Human is 16, a +3, plus a +2 proficiency bonus.
    expect(line(b, 'athletics').modifier).toBe(5);
    expect(line(b, 'acrobatics').modifier).toBe(2); // DEX 15, not proficient
  });

  it('doubles the bonus for expertise, and only when proficient', () => {
    const proficient = bare({
      classes: [{ classId: 'rogue', level: 1 }],
      skillIds: ['stealth'],
      expertiseIds: ['stealth'],
    });
    expect(line(proficient, 'stealth').modifier).toBe(6); // DEX +2, prof +2 doubled
    expect(line(proficient, 'stealth').expertise).toBe(true);

    const notProficient = bare({
      classes: [{ classId: 'rogue', level: 1 }],
      expertiseIds: ['stealth'],
    });
    expect(line(notProficient, 'stealth').modifier).toBe(2);
    expect(line(notProficient, 'stealth').expertise).toBe(false);
    expect(deriveBuild(notProficient).proficiencies.notes.join(' ')).toContain('Stealth');
  });

  it('counts expertise slots by class level', () => {
    const at = (level: number) =>
      deriveBuild(bare({ classes: [{ classId: 'rogue', level }] })).proficiencies.expertisePicks;
    expect(at(1)).toBe(2);
    expect(at(5)).toBe(2);
    expect(at(6)).toBe(4);

    const bard = (level: number) =>
      deriveBuild(bare({ classes: [{ classId: 'bard', level }] })).proficiencies.expertisePicks;
    expect(bard(2)).toBe(0);
    expect(bard(3)).toBe(2);
    expect(bard(10)).toBe(4);
  });

  it('gives a Bard half proficiency on everything else from level 2', () => {
    const one = bare({ classes: [{ classId: 'bard', level: 1 }] });
    const two = bare({ classes: [{ classId: 'bard', level: 2 }] });
    expect(line(one, 'arcana').halfProficiency).toBe(false);
    expect(line(two, 'arcana').halfProficiency).toBe(true);
    expect(line(two, 'arcana').modifier).toBe(1); // INT 10, half of +2
  });

  it('does not stack Jack of All Trades with real proficiency', () => {
    const b = bare({ classes: [{ classId: 'bard', level: 2 }], skillIds: ['persuasion'] });
    expect(line(b, 'persuasion').halfProficiency).toBe(false);
    expect(line(b, 'persuasion').proficient).toBe(true);
  });

  it('gives a Champion Remarkable Athlete from level 7', () => {
    const six = bare({ classes: [{ classId: 'fighter', level: 6, subclassId: 'champion' }] });
    const seven = bare({ classes: [{ classId: 'fighter', level: 7, subclassId: 'champion' }] });
    expect(line(six, 'acrobatics').halfProficiency).toBe(false);
    expect(line(seven, 'acrobatics').halfProficiency).toBe(true);
  });

  it('notes Reliable Talent from Rogue 11', () => {
    const ten = deriveBuild(bare({ classes: [{ classId: 'rogue', level: 10 }] }));
    const eleven = deriveBuild(bare({ classes: [{ classId: 'rogue', level: 11 }] }));
    expect(ten.proficiencies.notes.join(' ')).not.toContain('Reliable Talent');
    expect(eleven.proficiencies.notes.join(' ')).toContain('Reliable Talent');
  });
});

describe('passive scores', () => {
  it('is 10 plus the modifier', () => {
    const b = bare(); // WIS 12 is +1
    expect(deriveBuild(b).proficiencies.passivePerception).toBe(11);
  });

  it('moves with proficiency and expertise', () => {
    const proficient = bare({ classes: [{ classId: 'rogue', level: 1 }], skillIds: ['perception'] });
    expect(deriveBuild(proficient).proficiencies.passivePerception).toBe(13);

    const expert = bare({
      classes: [{ classId: 'rogue', level: 1 }],
      skillIds: ['perception'],
      expertiseIds: ['perception'],
    });
    expect(deriveBuild(expert).proficiencies.passivePerception).toBe(15);
  });

  it('takes Observant\'s +5 without granting proficiency', () => {
    const b = bare({ classes: [{ classId: 'fighter', level: 4 }], featIds: ['observant'] });
    const result = deriveBuild(b).proficiencies;
    // WIS 12 + 1 Human is 13, a +1. Observant is a half-feat, and its own +1
    // goes to Intelligence here, taking INT 11 to 12.
    expect(result.passivePerception).toBe(16); // 10 + 1 WIS + 5
    expect(result.skills.find((s) => s.skill === 'perception')!.proficient).toBe(false);
    expect(result.passiveInvestigation).toBe(16); // 10 + 1 INT + 5
  });
});

describe('armor and skills', () => {
  it('warns that armor blanks Stealth', () => {
    const b = bare({
      classes: [{ classId: 'fighter', level: 1 }],
      skillIds: ['athletics'],
      defenses: { ...emptyBuild().defenses, armorId: 'half-plate' },
    });
    expect(line(b, 'stealth').notes.join(' ')).toContain('disadvantage');
  });

  it('says nothing about Stealth in light armor', () => {
    const b = bare({ defenses: { ...emptyBuild().defenses, armorId: 'leather' } });
    expect(line(b, 'stealth').notes).toEqual([]);
  });
});

describe('skill recommendations', () => {
  it('puts Perception near the top for most builds', () => {
    const ctx = deriveBuild(bare());
    const top = recommendSkills(ctx, 4).map((s) => s.skill);
    expect(top).toContain('perception');
  });

  it('ranks Stealth above Athletics for a Rogue and below it for a Barbarian', () => {
    const rank = (b: Build, skill: SkillId) =>
      recommendSkills(deriveBuild(b)).findIndex((s) => s.skill === skill);

    const rogue = bare({ classes: [{ classId: 'rogue', level: 1 }] });
    expect(rank(rogue, 'stealth')).toBeLessThan(rank(rogue, 'athletics'));

    const barbarian = bare({
      classes: [{ classId: 'barbarian', level: 1 }],
      baseScores: { str: 15, dex: 10, con: 15, int: 8, wis: 12, cha: 8 },
    });
    expect(rank(barbarian, 'athletics')).toBeLessThan(rank(barbarian, 'stealth'));
  });

  it('sinks a skill whose ability this build dumped', () => {
    const dumped = bare({ baseScores: { str: 15, dex: 14, con: 14, int: 7, wis: 12, cha: 8 } });
    const arcana = recommendSkills(deriveBuild(dumped)).find((s) => s.skill === 'arcana')!;
    expect(arcana.reasons.some((r) => r.delta < 0)).toBe(true);
  });

  it('sorts skills you already have to the bottom', () => {
    const b = bare({ raceId: 'elf-wood' }); // grants Perception
    const list = recommendSkills(deriveBuild(b));
    expect(list.find((s) => s.skill === 'perception')!.taken).toBe(true);
    expect(list.findIndex((s) => s.skill === 'perception')).toBeGreaterThan(
      list.findIndex((s) => !s.taken),
    );
  });

  it('fills exactly the open picks, and only with legal untaken skills', () => {
    const b = bare({ classes: [{ classId: 'rogue', level: 1 }] });
    const ctx = deriveBuild(b);
    const legal = legalPicks({ build: b, race: ctx.race, slices: ctx.slices, featIds: ctx.featIds });
    const filled = fillSkillPicks(ctx, legal);
    expect(filled).toHaveLength(ctx.proficiencies.openSkillPicks);
    expect(new Set(filled).size).toBe(filled.length);
    for (const skill of filled) expect(legal.has(skill)).toBe(true);

    // Applying it leaves no open picks and no collisions.
    const after = deriveBuild({ ...b, skillIds: filled });
    expect(after.proficiencies.openSkillPicks).toBe(0);
    expect(after.proficiencies.collisions).toEqual([]);
    expect(after.proficiencies.illegalPicks).toEqual([]);
  });

  it('only offers expertise on skills you are proficient in', () => {
    const b = bare({ classes: [{ classId: 'rogue', level: 1 }], skillIds: ['stealth', 'perception'] });
    const options = recommendExpertise(deriveBuild(b)).map((s) => s.skill);
    expect(options.sort()).toEqual(['perception', 'stealth']);
  });
});

describe('armor-aware recommendations', () => {
  it('stops recommending Stealth to a character whose armor blanks it', () => {
    const rank = (armorId: string) => {
      const b = bare({
        classes: [{ classId: 'ranger', level: 1 }],
        defenses: { ...emptyBuild().defenses, armorId },
      });
      return recommendSkills(deriveBuild(b)).findIndex((s) => s.skill === 'stealth');
    };
    // A Ranger wants Stealth, so leather puts it near the top.
    expect(rank('leather')).toBeLessThan(2);
    // Half plate gives disadvantage; the proficiency stops being worth a pick.
    expect(rank('half-plate')).toBeGreaterThan(rank('leather'));
  });
});

describe('reconciling picks after a change', () => {
  it('drops a pick that the new class list does not offer', () => {
    const wizard = bare({ classes: [{ classId: 'wizard', level: 1 }], skillIds: ['arcana'] });
    const asFighter = reconcileSkillPicks({ ...wizard, classes: [{ classId: 'fighter', level: 1 }] });
    expect(asFighter.build.skillIds).toEqual([]);
    expect(asFighter.changes.join(' ')).toContain('Arcana');
  });

  it('frees a pick the new background now grants', () => {
    const b = bare({
      ruleset: '2024',
      raceId: 'human-2024',
      classes: [{ classId: 'fighter', level: 1 }],
      skillIds: ['athletics'],
    });
    const withSoldier = reconcileSkillPicks({ ...b, backgroundId: 'soldier-2024' });
    expect(withSoldier.build.skillIds).toEqual([]);
    expect(withSoldier.changes.join(' ')).toContain('Athletics');
  });

  it('drops expertise along with the proficiency it rested on', () => {
    const rogue = bare({
      classes: [{ classId: 'rogue', level: 1 }],
      skillIds: ['stealth'],
      expertiseIds: ['stealth'],
    });
    const asFighter = reconcileSkillPicks({ ...rogue, classes: [{ classId: 'fighter', level: 1 }] });
    expect(asFighter.build.expertiseIds).toEqual([]);
    expect(asFighter.changes.join(' ')).toContain('Expertise in Stealth');
  });

  it('says nothing and changes nothing when every pick is still legal', () => {
    const b = bare({ classes: [{ classId: 'fighter', level: 1 }], skillIds: ['athletics'] });
    const result = reconcileSkillPicks({ ...b, classes: [{ classId: 'fighter', level: 4 }] });
    expect(result.changes).toEqual([]);
    expect(result.build.skillIds).toEqual(['athletics']);
  });
});

describe('attributing picks to the sources that pay for them', () => {
  it('lets a lineage\'s free proficiency cover exactly one off-list skill', () => {
    // Variant Human grants one skill of any kind; the Wizard list covers two.
    // So one off-list pick is legal and a second is not.
    const one = bare({
      raceId: 'human-variant',
      classes: [{ classId: 'wizard', level: 1 }],
      skillIds: ['arcana', 'history', 'athletics'],
    });
    expect(deriveBuild(one).proficiencies.illegalPicks).toEqual([]);

    const two = bare({
      raceId: 'human-variant',
      classes: [{ classId: 'wizard', level: 1 }],
      skillIds: ['arcana', 'athletics', 'perception'],
    });
    expect(deriveBuild(two).proficiencies.illegalPicks).toHaveLength(1);
  });

  it('names the source that paid for each pick', () => {
    const b = bare({
      raceId: 'human-variant',
      classes: [{ classId: 'wizard', level: 1 }],
      skillIds: ['arcana', 'athletics'],
    });
    const p = deriveBuild(b).proficiencies;
    expect(p.granted.get('arcana')).toEqual(['Wizard skill list']);
    expect(p.granted.get('athletics')).toEqual(['Variant Human']);
  });

  it('does not let an unrestricted source starve a restricted one', () => {
    // Kenku picks two from a four-skill list. A Rogue's list also contains
    // Stealth and Deception, so a naive assignment could spend the Rogue picks
    // on them and leave the Kenku list with nothing it can pay for.
    const b = bare({
      raceId: 'kenku',
      classes: [{ classId: 'rogue', level: 1 }],
      skillIds: ['stealth', 'deception', 'perception', 'insight', 'athletics', 'investigation'],
    });
    expect(deriveBuild(b).proficiencies.illegalPicks).toEqual([]);
  });

  it('stops offering more picks once the sources are spent', () => {
    const full = bare({
      classes: [{ classId: 'fighter', level: 1 }],
      skillIds: ['athletics', 'perception'],
    });
    const ctx = deriveBuild(full);
    const legal = legalPicks({ build: full, race: ctx.race, slices: ctx.slices, featIds: ctx.featIds });
    // Both picks are spent, so nothing new is on offer - only what is held.
    expect([...legal].sort()).toEqual(['athletics', 'perception']);
  });
});

describe('build review findings', () => {
  const titles = (b: Build) => analyze(deriveBuild(b)).map((f) => f.title);

  it('flags a pick that collides with a background grant', () => {
    const b = bare({
      ruleset: '2024',
      raceId: 'human-2024',
      backgroundId: 'soldier-2024',
      skillIds: ['athletics'],
    });
    expect(titles(b)).toContain('Athletics is granted twice');
    expect(titles({ ...b, skillIds: ['acrobatics'] })).not.toContain('Athletics is granted twice');
  });

  it('flags unspent skill and expertise slots, and stops once they are filled', () => {
    const empty = bare({ classes: [{ classId: 'rogue', level: 1 }] });
    expect(titles(empty)).toContain('4 skill proficiencies not chosen');
    expect(titles(empty)).toContain('2 expertise slots unspent');

    const filled = bare({
      classes: [{ classId: 'rogue', level: 1 }],
      skillIds: ['stealth', 'perception', 'investigation', 'acrobatics'],
      expertiseIds: ['stealth', 'perception'],
    });
    const found = titles(filled);
    expect(found.some((t) => t.includes('not chosen'))).toBe(false);
    expect(found.some((t) => t.includes('expertise slots unspent'))).toBe(false);
  });

  it('flags Stealth proficiency under armor that blanks it', () => {
    const b = bare({
      classes: [{ classId: 'fighter', level: 1 }],
      skillIds: ['athletics'],
      defenses: { ...emptyBuild().defenses, armorId: 'half-plate' },
    });
    expect(titles(b)).not.toContain('Your armor cancels your Stealth proficiency');

    const stealthy = bare({
      raceId: 'bugbear', // grants Stealth outright
      classes: [{ classId: 'fighter', level: 1 }],
      defenses: { ...emptyBuild().defenses, armorId: 'half-plate' },
    });
    expect(titles(stealthy)).toContain('Your armor cancels your Stealth proficiency');
  });

  it('mentions Perception only when it was on offer and not taken', () => {
    // Both picks spent elsewhere: the choice was made, and Perception lost.
    const fighter = bare({ skillIds: ['athletics', 'intimidation'] });
    expect(titles(fighter)).toContain('Perception is on your class list and not taken');

    // Wood Elf is granted it, so there is nothing to mention.
    const elf = bare({ raceId: 'elf-wood', skillIds: ['athletics', 'intimidation'] });
    expect(titles(elf)).not.toContain('Perception is on your class list and not taken');

    // A Wizard is never offered it, so this is not their mistake to make.
    const wizard = bare({ classes: [{ classId: 'wizard', level: 1 }], skillIds: ['arcana', 'history'] });
    expect(titles(wizard)).not.toContain('Perception is on your class list and not taken');
  });

  /**
   * While picks are still open, "you have not taken Perception" is a report on
   * an unfinished sheet rather than a decision anyone made, and the Builder's
   * Skills badge is already saying there is work there.
   */
  it('says nothing about Perception while skill picks are still open', () => {
    expect(titles(bare())).not.toContain('Perception is on your class list and not taken');
  });

  it('flags expertise doubling a dumped ability', () => {
    const b = bare({
      classes: [{ classId: 'rogue', level: 1 }],
      baseScores: { str: 15, dex: 14, con: 14, int: 10, wis: 12, cha: 7 },
      skillIds: ['deception'],
      expertiseIds: ['deception'],
    });
    expect(titles(b)).toContain('Expertise in Deception is doubling a weak ability');
  });

  it('flags a pick no list can pay for', () => {
    const b = bare({ classes: [{ classId: 'fighter', level: 1 }], skillIds: ['arcana'] });
    expect(titles(b).join(' ')).toContain('not on any list');
  });
});

describe('multiclass skill proficiencies', () => {
  const at = (classes: Build['classes']) =>
    deriveBuild({ ...emptyBuild(), raceId: 'human', classes }).proficiencies;

  it('grants one skill for a Rogue dip, not the whole Rogue list', () => {
    const alone = at([{ classId: 'fighter', level: 5 }]);
    const dipped = at([
      { classId: 'fighter', level: 5 },
      { classId: 'rogue', level: 3 },
    ]);
    // A Fighter picks 2; the Rogue dip adds exactly one more, not four.
    expect(dipped.skillPicks).toBe(alone.skillPicks + 1);
  });

  it('grants nothing for a dip into a class that gives no skills', () => {
    const alone = at([{ classId: 'fighter', level: 5 }]);
    const dipped = at([
      { classId: 'fighter', level: 5 },
      { classId: 'wizard', level: 2 },
    ]);
    expect(dipped.skillPicks).toBe(alone.skillPicks);
  });

  it('restricts a Ranger dip to the Ranger list', () => {
    const ctx = deriveBuild({
      ...emptyBuild(),
      raceId: 'human',
      classes: [
        { classId: 'fighter', level: 5 },
        { classId: 'ranger', level: 2 },
      ],
    });
    const dip = pickSources({
      build: ctx.build,
      race: ctx.race,
      slices: ctx.slices,
      featIds: ctx.featIds,
    }).find((s) => s.label.includes('Ranger'));
    expect(dip?.count).toBe(1);
    // Arcana is not on the Ranger list, so the dip cannot supply it.
    expect(dip?.from?.has('arcana')).toBe(false);
    expect(dip?.from?.has('survival')).toBe(true);
  });

  it('still gives a starting Rogue the full four', () => {
    expect(at([{ classId: 'rogue', level: 3 }]).skillPicks).toBe(4);
  });
});
