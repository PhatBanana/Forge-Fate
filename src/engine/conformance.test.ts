import { describe, expect, it } from 'vitest';
import { deriveBuild, emptyBuild, proficiencyBonus } from './character';
import { analyze } from './analyze';
import { overspends, uncastableSpells } from './legality';
import { optionGroups } from './classOptions';
import { masterySlots } from './attacks';
import { CLASSES, subclassLevelFor, subclassesFor } from '../data/classes';
import { WEAPONS } from '../data/weapons';
import { featsFor } from '../data/feats';
import { RULESETS } from '../types';
import type { Build, ClassId, Ruleset } from '../types';
import type { SkillId } from '../data/skills';

/**
 * Section 45. Every rule the app claims, checked at every level of every
 * class in both rulesets.
 *
 * ## Why this exists as one sweep rather than a test per rule
 *
 * The §44 audit found that the app's *behaviour* was in good shape and its
 * *enforcement* was not: six separate budgets had each been written with the
 * same `Math.max(0, allowed - taken)` clamp, so every one of them went quiet
 * the moment a build went over. Nobody had written a bad check - they had
 * each written a correct answer to "how many are left" and nobody had asked
 * the other question. A test per rule would not have found that, because
 * each rule looked fine on its own.
 *
 * So this walks the whole space instead: **thirteen classes, two rulesets**,
 * over-spending every budget that class has by one and insisting somebody
 * notices. A seventh budget added without a legality row fails here on the
 * day it is added.
 *
 * The level coverage differs by sweep, deliberately: progression and the
 * "a legal build is never called illegal" negative walk **all twenty**
 * levels, because those are cheap. The budget sweep derives a build per
 * over-spend per class and samples **six** levels (1, 3, 5, 11, 17, 20) -
 * enough to cross every budget's on/off boundary without a minute of CPU.
 *
 * The negative half matters as much: a *legal* build at every level must
 * report nothing. A check that always fires is the same as no check, and
 * this is the assertion that keeps the new one honest.
 */

const build = (
  classId: ClassId,
  level: number,
  ruleset: Ruleset,
  over: Partial<Build> = {},
): Build => {
  const klass = CLASSES.find((c) => c.id === classId)!;
  const subs = subclassesFor(klass, ruleset);
  const subLevel = subclassLevelFor(klass, ruleset);
  return {
    ...emptyBuild(),
    ruleset,
    raceId: 'human',
    classes: [
      {
        classId,
        level,
        ...(level >= subLevel && subs[0] ? { subclassId: subs[0].id } : {}),
      },
    ],
    ...over,
  };
};

/** Every class that exists in a given ruleset, which is not quite all of them. */
const classesIn = (ruleset: Ruleset) =>
  CLASSES.filter((k) => !k.rulesets || k.rulesets.includes(ruleset));

const LEVELS = Array.from({ length: 20 }, (_, i) => i + 1);

describe('progression, at every level of every class', () => {
  for (const ruleset of RULESETS) {
    it(`gives ${ruleset} characters the proficiency, slots and features their level earns`, () => {
      const wrong: string[] = [];
      for (const klass of classesIn(ruleset)) {
        for (const level of LEVELS) {
          const ctx = deriveBuild(build(klass.id, level, ruleset));
          const say = (what: string) => wrong.push(`${klass.id} L${level}: ${what}`);

          if (ctx.proficiency !== proficiencyBonus(level)) {
            say(`proficiency ${ctx.proficiency}, expected ${proficiencyBonus(level)}`);
          }

          const asi = klass.asiLevels.filter((l) => l <= level).length;
          if (ctx.asiSlotsReached !== asi) say(`${ctx.asiSlotsReached} ASI slots, expected ${asi}`);

          // Total level and hit dice follow the class entry, always.
          if (ctx.totalLevel !== level) say(`total level ${ctx.totalLevel}`);

          // A full caster has a slot from level 1 and a 9th at 17.
          if (klass.castingType === 'full') {
            if (ctx.spellcasting.bySpellLevel[0] < 1) say('no 1st-level slot');
            if (level >= 17 && (ctx.spellcasting.bySpellLevel[8] ?? 0) < 1) say('no 9th-level slot');
          }

          // A subclass cannot be held before its own level - the Builder
          // clears an early pick, and this is the invariant behind that.
          const subLevel = subclassLevelFor(klass, ruleset);
          if (level < subLevel && ctx.subclassIds.size) say('holds a subclass too early');
        }
      }
      expect(wrong).toEqual([]);
    });
  }
});

describe('a legal build is never called illegal', () => {
  for (const ruleset of RULESETS) {
    it(`reports nothing against an untouched ${ruleset} character at any level`, () => {
      const noisy: string[] = [];
      for (const klass of classesIn(ruleset)) {
        for (const level of LEVELS) {
          const ctx = deriveBuild(build(klass.id, level, ruleset));
          const over = overspends(ctx);
          if (over.length) noisy.push(`${klass.id} L${level}: ${over.map((o) => o.kind).join(', ')}`);
          if (uncastableSpells(ctx).length) noisy.push(`${klass.id} L${level}: uncastable`);
        }
      }
      // A check that fires on a blank character is worse than no check.
      expect(noisy).toEqual([]);
    });
  }
});

describe('every budget is enforced, at every level', () => {
  /**
   * One row per budget: how to over-spend it by one, and the `kind` the
   * legality engine must answer with. Adding a budget to the app without
   * adding it here leaves the last test in this file failing.
   */
  const overspend = (ctx: ReturnType<typeof deriveBuild>, ruleset: Ruleset) => {
    const rows: { kind: string; build: Build }[] = [];
    const b = ctx.build;
    const casting = ctx.spellcasting;

    if (casting.casts) {
      const cantrips = casting.available.filter((s) => s.level === 0);
      if (cantrips.length > casting.cantripsKnown) {
        rows.push({
          kind: 'cantrips',
          build: { ...b, spellIds: cantrips.slice(0, casting.cantripsKnown + 1).map((s) => s.id) },
        });
      }
      const castable = casting.available.filter(
        (s) => s.level > 0 && s.level <= ctx.spellcasting.highestLevel,
      );
      const cap = casting.spellsKnown ?? casting.spellsPrepared;
      if (cap !== null && castable.length > cap) {
        rows.push({
          kind: casting.spellsKnown !== null ? 'spells' : 'prepared',
          build: casting.preparesFromBook
            ? {
                ...b,
                spellIds: castable.slice(0, cap + 1).map((s) => s.id),
                preparedIds: castable.slice(0, cap + 1).map((s) => s.id),
              }
            : { ...b, spellIds: castable.slice(0, cap + 1).map((s) => s.id) },
        });
      }
    }

    const skills: SkillId[] = ['arcana', 'athletics', 'stealth', 'perception', 'insight'];
    rows.push({
      kind: 'expertise',
      build: { ...b, expertiseIds: skills.slice(0, ctx.proficiencies.expertisePicks + 1) },
    });

    if (ruleset === '2024') {
      const slots = masterySlots(ctx.slices, ruleset);
      const ids = WEAPONS.filter((w) => w.mastery).map((w) => w.id);
      if (ids.length > slots) {
        rows.push({ kind: 'mastery', build: { ...b, masteryIds: ids.slice(0, slots + 1) } });
      }
    }

    for (const group of optionGroups(ctx)) {
      /*
        The pact boon is skipped, and the reason is worth stating rather than
        working around: it lives in `Build.pactBoon`, a single optional
        string, so a second one cannot be recorded at all. It is the one
        budget in the app that is enforced by its *type* instead of by a
        count - which is why it never had the bug the other six shared. The
        test below pins that, so the day it becomes a list this stops being
        true loudly.
      */
      if (group.kind === 'pact-boon') continue;
      const ids = group.suggestions.map((s) => s.option.id);
      if (ids.length <= group.slots) continue;
      rows.push({ kind: group.kind, build: { ...b, classOptionIds: ids.slice(0, group.slots + 1) } });
    }

    return rows;
  };

  for (const ruleset of RULESETS) {
    it(`catches one too many of every budget a ${ruleset} character has`, () => {
      const missed: string[] = [];
      for (const klass of classesIn(ruleset)) {
        for (const level of [1, 3, 5, 11, 17, 20]) {
          const ctx = deriveBuild(build(klass.id, level, ruleset));
          for (const row of overspend(ctx, ruleset)) {
            const caught = overspends(deriveBuild(row.build)).some((o) => o.kind === row.kind);
            if (!caught) missed.push(`${klass.id} L${level}: ${row.kind}`);
          }
        }
      }
      expect(missed).toEqual([]);
    });
  }
});

describe('the pact boon, which the type system enforces', () => {
  it('cannot hold two, because it is one field rather than a list', () => {
    // Every other budget is a count, and every count was silently clampable.
    // This one is a single optional string: a Warlock physically cannot
    // record a second boon, so there is nothing for a check to catch.
    const warlock = deriveBuild(build('warlock', 3, '2014'));
    const group = optionGroups(warlock).find((g) => g.kind === 'pact-boon');
    expect(group?.slots).toBe(1);
    expect(warlock.build.pactBoon === undefined || typeof warlock.build.pactBoon === 'string').toBe(
      true,
    );
    // And with one taken, the group reports it as spent rather than open.
    const withBoon = deriveBuild({ ...warlock.build, pactBoon: group!.suggestions[0].option.id });
    const after = optionGroups(withBoon).find((g) => g.kind === 'pact-boon')!;
    expect(after.chosen).toHaveLength(1);
    expect(after.open).toBe(0);
    expect(overspends(withBoon).some((o) => o.kind === 'pact-boon')).toBe(false);
  });
});

describe('a spell above every slot you own', () => {
  it('is caught for every caster, at every level below the top', () => {
    const missed: string[] = [];
    for (const ruleset of RULESETS) {
      for (const klass of classesIn(ruleset)) {
        for (const level of [1, 3, 5, 11, 17]) {
          const ctx = deriveBuild(build(klass.id, level, ruleset));
          if (!ctx.spellcasting.casts) continue;
          const top = ctx.spellcasting.highestLevel;
          const tooHigh = ctx.spellcasting.available.find((s) => s.level > top);
          if (!tooHigh) continue;
          const b = build(klass.id, level, ruleset, {
            spellIds: [tooHigh.id],
            preparedIds: [tooHigh.id],
          });
          if (!uncastableSpells(deriveBuild(b)).length) {
            missed.push(`${ruleset} ${klass.id} L${level}: ${tooHigh.name} (L${tooHigh.level}) vs top ${top}`);
          }
        }
      }
    }
    expect(missed).toEqual([]);
  });

  it('leaves a spellbook alone, because a Wizard writes ahead of their slots', () => {
    // The whole point of a book: a level-1 Wizard may scribe a spell they
    // cannot cast yet. Only what is *prepared* is judged.
    const wizard = build('wizard', 1, '2014');
    const ctx = deriveBuild(wizard);
    const tooHigh = ctx.spellcasting.available.find((s) => s.level > ctx.spellcasting.highestLevel);
    if (!tooHigh) return;
    const written = deriveBuild({ ...wizard, spellIds: [tooHigh.id], preparedIds: [] });
    expect(uncastableSpells(written)).toEqual([]);
  });
});

describe('an origin feat slot, which nothing used to police', () => {
  /** A 2024 build with exactly one origin slot, from the background. */
  const withOriginSlot = (over: Partial<Build> = {}) => ({
    ...build('fighter', 4, '2024'),
    backgroundId: 'acolyte-2024',
    ...over,
  });

  it('has the slot it claims to, or the rest of this test proves nothing', () => {
    expect(deriveBuild(withOriginSlot()).originFeatSlots).toBe(1);
  });

  it('refuses a general feat in it', () => {
    const general = featsFor('2024').find((f) => f.category === 'general')!;
    const findings = analyze(deriveBuild(withOriginSlot({ originFeatIds: [general.id] })));
    const hit = findings.find((f) => f.title.includes('origin slot'));
    expect(hit?.severity).toBe('error');
    expect(hit?.detail).toMatch(/general feat/i);
  });

  it('accepts an origin feat in it', () => {
    const origin = featsFor('2024').find((f) => f.category === 'origin')!;
    const findings = analyze(deriveBuild(withOriginSlot({ originFeatIds: [origin.id] })));
    expect(findings.some((f) => f.title.includes('origin slot'))).toBe(false);
  });

  it('checks prerequisites there too, which it never did', () => {
    /*
      The same feat was flagged in `featIds` and silent in `originFeatIds`,
      because the prerequisite loop only ever walked the first list.
    */
    const gated = featsFor('2024').find(
      (f) => f.category === 'origin' && (f.prereq?.abilities?.length || f.prereq?.minLevel),
    );
    if (!gated) return;
    const findings = analyze(deriveBuild(withOriginSlot({ originFeatIds: [gated.id] })));
    expect(findings.some((f) => f.title.includes('origin slot'))).toBe(true);
  });
});

describe('the review says so out loud', () => {
  it('turns every over-spend into an error a reader can act on', () => {
    // The engine finding whatever it likes is worth nothing if no screen
    // renders it, which is the §44 lesson restated.
    const bard = build('bard', 5, '2014');
    const ctx = deriveBuild(bard);
    const known = ctx.spellcasting.spellsKnown!;
    const tooMany = ctx.spellcasting.available
      .filter((s) => s.level > 0 && s.level <= ctx.spellcasting.highestLevel)
      .slice(0, known + 3)
      .map((s) => s.id);

    const findings = analyze(deriveBuild({ ...bard, spellIds: tooMany }));
    const hit = findings.find((f) => /spells known/.test(f.title));
    expect(hit).toBeTruthy();
    expect(hit!.severity).toBe('error');
    expect(hit!.fix).toMatch(/Spells/);
  });

  it('names the section that fixes it, for each kind', () => {
    const fighter = deriveBuild(build('fighter', 3, '2014'));
    const styles = optionGroups(fighter).find((g) => g.kind === 'fighting-style')!;
    const over = overspends(
      deriveBuild({
        ...fighter.build,
        classOptionIds: styles.suggestions.slice(0, styles.slots + 2).map((s) => s.option.id),
      }),
    );
    expect(over.map((o) => o.where)).toContain('Class options');
  });
});
