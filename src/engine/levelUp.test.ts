import { describe, expect, it } from 'vitest';
import { blankBuild, deriveBuild } from './character';
import { levelUpSummary, recordHitDieRoll } from './levelUp';
import type { Build, ClassId } from '../types';

const at = (classId: ClassId, level: number, extra: Partial<Build> = {}): Build => ({
  ...blankBuild('2014'),
  classes: [{ classId, level }],
  ...extra,
});

const stepKinds = (summary: ReturnType<typeof levelUpSummary>) =>
  summary!.steps.map((s) => s.kind);

describe('what a level gave you', () => {
  it('reports the class, the die and the hit points', () => {
    const summary = levelUpSummary(at('fighter', 4), at('fighter', 5))!;
    expect(summary.from).toBe(4);
    expect(summary.to).toBe(5);
    expect(summary.className).toBe('Fighter');
    expect(summary.hitDie).toBe(10);
    // A d10 averages 6 (rounded up per the rules), and a blankBuild has Con 8
    // for -1, so five and a half becomes five.
    expect(summary.hpGained).toBe(5);
  });

  it('names the features this level added and no others', () => {
    // Extra Attack is a Fighter 5 feature; Action Surge is level 2 and was
    // already there.
    const summary = levelUpSummary(at('fighter', 4), at('fighter', 5))!;
    const names = summary.featuresGained.map((f) => f.name);
    expect(names).toContain('Extra Attack');
    expect(names).not.toContain('Action Surge');
  });

  it('always leads with hit points, because every level gives them', () => {
    expect(stepKinds(levelUpSummary(at('fighter', 6), at('fighter', 7)))[0]).toBe('hp');
  });
});

describe('what a level wants from you', () => {
  it('asks for a subclass at the level it is due', () => {
    // A 2014 Fighter chooses at 3rd.
    const summary = levelUpSummary(at('fighter', 2), at('fighter', 3))!;
    expect(stepKinds(summary)).toContain('subclass');
    expect(summary.owed).toBeGreaterThan(0);
  });

  it('does not ask again once one is chosen', () => {
    const chosen = (level: number) =>
      at('fighter', level, { classes: [{ classId: 'fighter', level, subclassId: 'champion' }] });
    const summary = levelUpSummary(chosen(3), chosen(4))!;
    expect(stepKinds(summary)).not.toContain('subclass');
  });

  it('asks earlier under 2024, which moved every subclass to 3rd', () => {
    // A 2014 Cleric chooses at 1st; a 2024 Cleric at 3rd. The step has to
    // follow the ruleset rather than a hardcoded level.
    const cleric2024 = (level: number): Build => ({
      ...blankBuild('2024'),
      classes: [{ classId: 'cleric', level }],
    });
    expect(stepKinds(levelUpSummary(cleric2024(1), cleric2024(2))!)).not.toContain('subclass');
    expect(stepKinds(levelUpSummary(cleric2024(2), cleric2024(3))!)).toContain('subclass');
  });

  it('opens an ability score improvement at 4th', () => {
    const summary = levelUpSummary(at('fighter', 3), at('fighter', 4))!;
    const asi = summary.steps.find((s) => s.kind === 'asi')!;
    expect(asi.title).toContain('ability score improvement');
    expect(asi.owed).toBe(1);
  });

  it('counts the ones left over from earlier levels too', () => {
    // A Fighter has slots at 4, 6 and 8. Going 7 -> 8 with none spent owes
    // three, and says which of them is new.
    const summary = levelUpSummary(at('fighter', 7), at('fighter', 8))!;
    const asi = summary.steps.find((s) => s.kind === 'asi')!;
    expect(asi.owed).toBe(3);
    expect(asi.detail).toContain('still waiting');
  });

  it('mentions spells for a caster and stays quiet for a Fighter', () => {
    expect(stepKinds(levelUpSummary(at('wizard', 2), at('wizard', 3))!)).toContain('spells');
    expect(stepKinds(levelUpSummary(at('fighter', 5), at('fighter', 6))!)).not.toContain('spells');
  });

  it('mentions class options where a class has them', () => {
    // A Warlock's invocations open at 2nd.
    const summary = levelUpSummary(at('warlock', 1), at('warlock', 2))!;
    expect(stepKinds(summary)).toContain('options');
  });

  it("sums what is owed, which is what a badge would show", () => {
    const summary = levelUpSummary(at('fighter', 3), at('fighter', 4))!;
    expect(summary.owed).toBe(summary.steps.reduce((sum, s) => sum + s.owed, 0));
  });
});

describe('when there is nothing to report', () => {
  it('says nothing when the level did not move', () => {
    expect(levelUpSummary(at('fighter', 5), at('fighter', 5))).toBeNull();
  });

  it('says nothing when the level went down', () => {
    expect(levelUpSummary(at('fighter', 5), at('fighter', 4))).toBeNull();
  });

  it('says nothing about a jump of more than one', () => {
    // Typing 12 over 3 is entering a character, not levelling one, and a
    // report of nine levels at once would be noise dressed as a summary.
    expect(levelUpSummary(at('fighter', 3), at('fighter', 12))).toBeNull();
  });

  it('says nothing when the character was replaced wholesale', () => {
    expect(levelUpSummary(at('fighter', 4), at('wizard', 5))).toBeNull();
  });

  it('handles a multiclass dip, and names the class that grew', () => {
    const before = at('fighter', 5, { classes: [{ classId: 'fighter', level: 5 }] });
    const after: Build = {
      ...before,
      classes: [
        { classId: 'fighter', level: 5 },
        { classId: 'rogue', level: 1 },
      ],
    };
    const summary = levelUpSummary(before, after)!;
    expect(summary.className).toBe('Rogue');
    expect(summary.hitDie).toBe(8);
  });
});

describe('rolling for hit points', () => {
  it('records this level’s roll and switches to the rolled mode', () => {
    const build = recordHitDieRoll(at('fighter', 3), 9);
    expect(build.defenses.hpMode).toBe('rolled');
    // Two entries for levels 2 and 3; the last is the one just rolled.
    expect(build.defenses.rolledHitDice).toEqual([0, 9]);
  });

  it('treats an unrolled level as the average rather than as zero', () => {
    /*
      The list is padded with zeroes for levels nobody rolled yet, and a die
      cannot land on zero - so it means "not rolled". Reading it as a rolled
      zero would take hit points off a character for levelling twice before
      reaching for the dice.
    */
    const rolled = recordHitDieRoll(at('fighter', 3), 10);
    const average = at('fighter', 3);
    const hp = deriveBuild(rolled).hp.total;
    const flat = deriveBuild(average).hp.total;
    // Level 2 falls back to the average; level 3 rolled a 10 against an
    // average of 6, so the character is exactly four ahead.
    expect(hp).toBe(flat + 4);
  });

  it('replaces the roll at the same level rather than growing the list', () => {
    const once = recordHitDieRoll(at('fighter', 3), 4);
    const again = recordHitDieRoll(once, 10);
    expect(again.defenses.rolledHitDice).toEqual([0, 10]);
  });

  it('keeps earlier rolls when the character levels again', () => {
    let build = recordHitDieRoll(at('fighter', 2), 7);
    build = { ...build, classes: [{ classId: 'fighter', level: 3 }] };
    build = recordHitDieRoll(build, 3);
    expect(build.defenses.rolledHitDice).toEqual([7, 3]);
  });

  it('drops rolls for levels the character no longer has', () => {
    // Correcting a level downwards should not leave a roll for a level that
    // is gone, waiting to reappear if you go back up.
    let build = recordHitDieRoll(at('fighter', 4), 8);
    build = { ...build, classes: [{ classId: 'fighter', level: 2 }] };
    build = recordHitDieRoll(build, 5);
    expect(build.defenses.rolledHitDice).toEqual([5]);
  });

  it('never counts more dice than the character has levels', () => {
    const build = recordHitDieRoll(at('fighter', 5), 6);
    expect(build.defenses.rolledHitDice).toHaveLength(4);
  });
});
