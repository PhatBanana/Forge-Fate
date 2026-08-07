import { describe, expect, it } from 'vitest';
import { deriveBuild, emptyBuild } from './character';
import { heldResources, rechargeFor } from './resources';
import { CLASS_RESOURCES, resourcesForClass } from '../data/classResources';
import type { Build, ClassId, Ruleset } from '../types';

function ctxOf(classes: Build['classes'], overrides: Partial<Build> = {}) {
  return deriveBuild({
    ...emptyBuild(),
    raceId: 'human',
    baseScores: { str: 14, dex: 14, con: 14, int: 14, wis: 14, cha: 14 },
    classes,
    ...overrides,
  });
}

function held(classes: Build['classes'], overrides: Partial<Build> = {}) {
  const ctx = ctxOf(classes, overrides);
  return heldResources(ctx.slices, ctx.build.ruleset, ctx.mods);
}

const find = (list: ReturnType<typeof held>, id: string) =>
  list.find((r) => r.resource.id === id);

describe('the resource table', () => {
  it('gives every resource a unique id within its class', () => {
    for (const [classId, resources] of Object.entries(CLASS_RESOURCES)) {
      const ids = (resources ?? []).map((r) => r.id);
      expect(new Set(ids).size, classId).toBe(ids.length);
    }
  });

  it('never starts a resource before the level it arrives', () => {
    for (const [classId, resources] of Object.entries(CLASS_RESOURCES)) {
      for (const resource of resources ?? []) {
        if (resource.max.kind !== 'table') continue;
        const first = Math.min(...resource.max.byLevel.map((e) => e.level));
        expect(resource.minLevel, `${classId} ${resource.id}`).toBe(first);
      }
    }
  });

  /**
   * This table was 2014-only for a long time, on the belief that the 2024
   * sources never printed the numbers. SRD 5.2 does print them, and being
   * 2014-only was not a neutral fallback: it left a 2024 character with no
   * tracked resources at all.
   */
  it('gives a 2024 character resources at all, which it once did not', () => {
    const fighter = resourcesForClass('fighter', '2024' as Ruleset).map((r) => r.id);
    expect(fighter).toEqual(expect.arrayContaining(['second-wind', 'action-surge', 'indomitable']));
    expect(resourcesForClass('barbarian', '2024' as Ruleset).length).toBeGreaterThan(0);
  });

  /** Only where the count could be sourced. Three rows stay 2014-only. */
  it('keeps out of 2024 the three whose numbers are not in the source', () => {
    const only2014 = Object.entries(CLASS_RESOURCES).flatMap(([classId, list]) =>
      (list ?? []).filter((r) => r.rulesets?.length === 1 && r.rulesets[0] === '2014')
        .map((r) => `${classId}:${r.id}`),
    );
    expect(only2014.sort()).toEqual([
      'artificer:flash-of-genius',
      'druid:wild-shape',
      'paladin:divine-sense',
    ]);
    // And each says why on the row rather than leaving it to be guessed at.
    for (const [, list] of Object.entries(CLASS_RESOURCES)) {
      for (const r of list ?? []) {
        if (r.rulesets?.length === 1 && r.id !== 'flash-of-genius') {
          expect(r.note, r.id).toBeTruthy();
        }
      }
    }
  });

  it('applies the 2024 revisions rather than the 2014 numbers', () => {
    const at = (classId: Parameters<typeof resourcesForClass>[0], id: string, ruleset: Ruleset) =>
      resourcesForClass(classId, ruleset).find((r) => r.id === id);

    // Second Wind is the one most likely to be missed: 2024 gives two rising
    // to four, where 2014 gives one.
    expect(at('fighter', 'second-wind', '2014')!.max).toEqual({
      kind: 'table', byLevel: [{ level: 1, count: 1 }],
    });
    expect(at('fighter', 'second-wind', '2024' as Ruleset)!.max).toEqual({
      kind: 'table',
      byLevel: [{ level: 1, count: 2 }, { level: 4, count: 3 }, { level: 10, count: 4 }],
    });

    // Ki became Focus, with the same count.
    expect(at('monk', 'ki', '2014')!.name).toBe('Ki points');
    expect(at('monk', 'ki', '2024' as Ruleset)!.name).toBe('Focus Points');
    expect(at('monk', 'ki', '2024' as Ruleset)!.max).toEqual({ kind: 'classLevel' });

    // A row with no revision reads the same in both.
    expect(at('barbarian', 'rage', '2024' as Ruleset)!.max)
      .toEqual(at('barbarian', 'rage', '2014')!.max);
  });

  it("gives a 2024 Ranger the Hunter's Mark castings 2014 has no equivalent for", () => {
    expect(held([{ classId: 'ranger', level: 11, subclassId: 'hunter' }])).toEqual([]);
    const in2024 = resourcesForClass('ranger', '2024' as Ruleset);
    expect(in2024.map((r) => r.id)).toEqual(['favored-enemy']);
  });

  it('gives a Rogue nothing in either edition, having no per-rest pool', () => {
    expect(held([{ classId: 'rogue', level: 11, subclassId: 'thief' }])).toEqual([]);
    expect(resourcesForClass('rogue', '2024' as Ruleset)).toEqual([]);
  });
});

describe('fixed progressions', () => {
  it('steps Rage up at the levels it should', () => {
    const rageAt = (level: number) =>
      find(held([{ classId: 'barbarian', level }]), 'rage')?.max;
    expect(rageAt(1)).toBe(2);
    expect(rageAt(2)).toBe(2);
    expect(rageAt(3)).toBe(3);
    expect(rageAt(6)).toBe(4);
    expect(rageAt(11)).toBe(4);
    expect(rageAt(12)).toBe(5);
    expect(rageAt(17)).toBe(6);
    expect(rageAt(20)).toBe(6);
  });

  it('gives a Fighter Action Surge at 2 and a second at 17', () => {
    const at = (level: number) => find(held([{ classId: 'fighter', level }]), 'action-surge');
    expect(at(1)).toBeUndefined();
    expect(at(2)?.max).toBe(1);
    expect(at(16)?.max).toBe(1);
    expect(at(17)?.max).toBe(2);
  });

  it('withholds Indomitable until 9th level', () => {
    expect(find(held([{ classId: 'fighter', level: 8 }]), 'indomitable')).toBeUndefined();
    expect(find(held([{ classId: 'fighter', level: 9 }]), 'indomitable')?.max).toBe(1);
    expect(find(held([{ classId: 'fighter', level: 13 }]), 'indomitable')?.max).toBe(2);
  });
});

describe('level-based pools', () => {
  it('gives a Monk ki equal to their level, from 2nd', () => {
    expect(find(held([{ classId: 'monk', level: 1 }]), 'ki')).toBeUndefined();
    expect(find(held([{ classId: 'monk', level: 2 }]), 'ki')?.max).toBe(2);
    expect(find(held([{ classId: 'monk', level: 11 }]), 'ki')?.max).toBe(11);
  });

  it('gives a Paladin five hit points of Lay on Hands per level', () => {
    expect(find(held([{ classId: 'paladin', level: 1 }]), 'lay-on-hands')?.max).toBe(5);
    expect(find(held([{ classId: 'paladin', level: 11 }]), 'lay-on-hands')?.max).toBe(55);
  });
});

describe('ability-based pools', () => {
  it('scales Bardic Inspiration with Charisma, never below one', () => {
    const withCha = (cha: number) =>
      find(
        held([{ classId: 'bard', level: 3 }], {
          baseScores: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha },
        }),
        'bardic-inspiration',
      )?.max;

    expect(withCha(16)).toBe(3);
    expect(withCha(20)).toBe(5);
    // A Charisma 8 Bard still gets one, rather than zero or a negative.
    expect(withCha(8)).toBe(1);
  });

  it('gives a Paladin one Divine Sense plus their Charisma modifier', () => {
    const list = held([{ classId: 'paladin', level: 5, subclassId: 'devotion' }], {
      baseScores: { str: 15, dex: 10, con: 14, int: 8, wis: 10, cha: 16 },
    });
    expect(find(list, 'divine-sense')?.max).toBe(4);
  });
});

describe('multiclassing', () => {
  /**
   * The rule this shares with spell slots: a resource counts your level in the
   * class that grants it, not your character level.
   */
  it('counts the granting class level, not the character level', () => {
    const list = held([
      { classId: 'fighter', level: 3 },
      { classId: 'wizard', level: 9, subclassId: 'evocation' },
    ]);
    // Character level 12, but only a 3rd-level Fighter: one Action Surge.
    expect(find(list, 'action-surge')?.max).toBe(1);
    expect(find(list, 'indomitable')).toBeUndefined();
  });

  it('keys two classes apart so neither overwrites the other', () => {
    const list = held([
      { classId: 'cleric', level: 6, subclassId: 'life' },
      { classId: 'paladin', level: 5, subclassId: 'devotion' },
    ]);
    const keys = list.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('cleric:channel-divinity');
    expect(keys).toContain('paladin:channel-divinity-paladin');
  });

  it('carries both classes resources at once', () => {
    const list = held([
      { classId: 'barbarian', level: 3, subclassId: 'zealot' },
      { classId: 'fighter', level: 2 },
    ]);
    expect(find(list, 'rage')?.max).toBe(3);
    expect(find(list, 'action-surge')?.max).toBe(1);
    expect(find(list, 'second-wind')?.max).toBe(1);
  });
});

describe('recharge', () => {
  it('moves Bardic Inspiration to a short rest at 5th level', () => {
    const bard = (level: number) => {
      const list = held([{ classId: 'bard', level, subclassId: level >= 3 ? 'lore' : undefined }]);
      return rechargeFor(find(list, 'bardic-inspiration')!, level);
    };
    expect(bard(4)).toBe('long');
    expect(bard(5)).toBe('short');
  });

  it('leaves every other resource on its declared recharge', () => {
    const list = held([{ classId: 'barbarian', level: 17, subclassId: 'zealot' }]);
    expect(rechargeFor(find(list, 'rage')!, 17)).toBe('long');

    const fighter = held([{ classId: 'fighter', level: 17, subclassId: 'champion' }]);
    expect(rechargeFor(find(fighter, 'action-surge')!, 17)).toBe('short');
    expect(rechargeFor(find(fighter, 'indomitable')!, 17)).toBe('long');
  });
});

export type { ClassId };
