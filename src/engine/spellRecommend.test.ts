import { describe, expect, it } from 'vitest';
import { deriveBuild, emptyBuild } from './character';
import { describeSpell, recommendSpells, scoreSpell, spellGroups } from './spellRecommend';
import { spellById } from '../data/spells';
import type { Build, ClassId } from '../types';

function caster(classId: ClassId, level: number, spellIds: string[] = []): Build {
  const base = emptyBuild();
  return {
    ...base,
    classes: [{ classId, level }],
    spellIds,
  };
}

describe('spell scoring', () => {
  it('ranks a scored spell and leaves an unscored one without a number', () => {
    const ctx = deriveBuild(caster('wizard', 5));
    const fireball = scoreSpell(spellById('fireball')!, ctx);
    expect(fireball.score).toBeGreaterThan(0);

    const unscored = ctx.spellcasting.available.find((s) => s.base === undefined);
    expect(unscored).toBeDefined();
    expect(scoreSpell(unscored!, ctx).score).toBeNull();
  });

  it('explains itself with the rules that fired', () => {
    const ctx = deriveBuild(caster('warlock', 5));
    const blast = scoreSpell(spellById('eldritch-blast')!, ctx);
    expect(blast.reasons.some((r) => r.text.includes('Agonizing Blast'))).toBe(true);
    expect(blast.headline).not.toBe('');
  });

  it('discounts a concentration spell when one is already relied on', () => {
    const alone = deriveBuild(caster('wizard', 5));
    const hasted = deriveBuild(caster('wizard', 5, ['haste']));

    const solo = scoreSpell(spellById('web')!, alone).score!;
    const rival = scoreSpell(spellById('web')!, hasted).score!;
    expect(rival).toBeLessThan(solo);
  });

  it('does not penalise a spell for competing with itself', () => {
    const ctx = deriveBuild(caster('wizard', 5, ['web']));
    const web = scoreSpell(spellById('web')!, ctx);
    expect(web.taken).toBe(true);
    expect(web.reasons.every((r) => !r.text.includes('only one can be up'))).toBe(true);
  });

  it('does not penalise a spell that needs no concentration', () => {
    const alone = deriveBuild(caster('wizard', 5));
    const hasted = deriveBuild(caster('wizard', 5, ['haste']));
    const solo = scoreSpell(spellById('fireball')!, alone).score;
    expect(scoreSpell(spellById('fireball')!, hasted).score).toBe(solo);
  });
});

describe('spell groups', () => {
  it('groups by spell level and stops at the highest slot', () => {
    const ctx = deriveBuild(caster('wizard', 5));
    const groups = spellGroups(ctx);
    expect(groups[0].level).toBe(0);
    expect(groups[0].label).toBe('Cantrips');
    // A Wizard 5 has 3rd-level slots and no more.
    expect(Math.max(...groups.map((g) => g.level))).toBe(3);
  });

  it('puts taken spells first and scored ahead of unscored', () => {
    const ctx = deriveBuild(caster('wizard', 5, ['fireball']));
    const third = spellGroups(ctx).find((g) => g.level === 3)!;
    expect(third.suggestions[0].id).toBe('fireball');

    const scores = third.suggestions.map((s) => s.score);
    const firstUnscored = scores.indexOf(null);
    if (firstUnscored >= 0) {
      expect(scores.slice(firstUnscored).every((s) => s === null)).toBe(true);
    }
  });

  it('offers nothing to a class that does not cast', () => {
    const ctx = deriveBuild(caster('barbarian', 5));
    expect(spellGroups(ctx)).toHaveLength(0);
    expect(recommendSpells(ctx)).toHaveLength(0);
  });
});

describe('recommendSpells', () => {
  it('leaves out spells already taken', () => {
    const ctx = deriveBuild(caster('wizard', 5, ['fireball']));
    expect(recommendSpells(ctx, 20).some((s) => s.id === 'fireball')).toBe(false);
  });

  it('can be narrowed to one spell level', () => {
    const ctx = deriveBuild(caster('wizard', 5));
    const cantrips = recommendSpells(ctx, 20, 0);
    expect(cantrips.length).toBeGreaterThan(0);
    expect(cantrips.every((s) => s.spell.level === 0)).toBe(true);
  });

  it('only ever offers spells on this character’s own list', () => {
    const ctx = deriveBuild(caster('cleric', 9));
    expect(recommendSpells(ctx, 50).every((s) => s.spell.classes.includes('cleric'))).toBe(true);
  });
});

describe('describeSpell', () => {
  it('reads as a spell entry line', () => {
    expect(describeSpell(spellById('fire-bolt')!)).toBe('Evocation cantrip');
    expect(describeSpell(spellById('fireball')!)).toBe('3rd level evocation');
    expect(describeSpell(spellById('haste')!)).toContain('concentration');
  });
});
