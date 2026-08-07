import { describe, expect, it } from 'vitest';
import type { Build } from '../types';
import { SPELLS, SPELLS_BY_ID } from '../data/spells';
import { deriveBuild, emptyBuild } from './character';
import { healingAt } from './healing';

/**
 * Healing, which the app could not see at all until this existed: it could
 * rank a Wizard's damage four ways and had nothing to say to a Life Cleric
 * about the one thing they were built for.
 *
 * Every figure below is from the SRD rather than from memory, because the
 * per-slot scaling is exactly the sort of thing recall gets subtly wrong -
 * Prayer of Healing is 2d8 at its own level and 1d8 per level above, not 2d8
 * per level.
 */

function build(overrides: Partial<Build> = {}): Build {
  return {
    ...emptyBuild(),
    raceId: 'human',
    baseScores: { str: 10, dex: 12, con: 14, int: 8, wis: 16, cha: 10 },
    ...overrides,
  };
}

const cleric = (level: number, spellIds: string[], subclassId = 'life') =>
  deriveBuild(
    build({ classes: [{ classId: 'cleric', level, subclassId }], spellIds }),
  ).healing;

describe('the healing table', () => {
  it('gives every healing spell dice or a flat amount, never neither', () => {
    for (const spell of SPELLS) {
      if (!spell.healing) continue;
      expect(
        spell.healing.dice !== undefined || spell.healing.flat !== undefined,
        spell.name,
      ).toBe(true);
      if (spell.healing.dice) expect(spell.healing.dice, spell.name).toMatch(/^\d+d\d+$/);
    }
  });

  /**
   * "Restore 700 hit points divided as you choose" and "all of them" are not
   * amounts a per-casting average describes, so they carry no structured
   * healing rather than a made-up number.
   */
  it('leaves the two unquantifiable ones out on purpose', () => {
    expect(SPELLS_BY_ID['mass-heal'].healing).toBeUndefined();
    expect(SPELLS_BY_ID['power-word-heal'].healing).toBeUndefined();
  });
});

describe('what a spell restores', () => {
  it('matches the SRD at its own level', () => {
    // 1d8 (4.5) + a +3 modifier.
    expect(healingAt(SPELLS_BY_ID['cure-wounds'], 1, 3)).toBe(7.5);
    // 1d4 (2.5) + 3.
    expect(healingAt(SPELLS_BY_ID['healing-word'], 1, 3)).toBe(5.5);
    // 2d8 (9) + 3.
    expect(healingAt(SPELLS_BY_ID['prayer-of-healing'], 2, 3)).toBe(12);
  });

  it('scales by the slot rather than by the level', () => {
    // Cure Wounds at 3rd is 3d8 (13.5) + 3, not 1d8 tripled.
    expect(healingAt(SPELLS_BY_ID['cure-wounds'], 3, 3)).toBe(16.5);
    // Prayer of Healing at 4th: 2d8 base plus 1d8 for each of two levels above
    // its own 2nd - 4d8 (18) + 3.
    expect(healingAt(SPELLS_BY_ID['prayer-of-healing'], 4, 3)).toBe(21);
  });

  it('scales Heal by a flat ten a slot, since it has no dice', () => {
    expect(healingAt(SPELLS_BY_ID['heal'], 6, 5)).toBe(70);
    expect(healingAt(SPELLS_BY_ID['heal'], 8, 5)).toBe(90);
    // And it adds no spellcasting modifier at all.
    expect(healingAt(SPELLS_BY_ID['heal'], 6, 0)).toBe(70);
  });

  it('adds no modifier to Regenerate, which does not get one', () => {
    // 4d8 (18) + 15.
    expect(healingAt(SPELLS_BY_ID['regenerate'], 7, 5)).toBe(33);
  });

  /** The single biggest multiplier on healing in the game. */
  it('adds Disciple of Life per target, at 2 plus the slot level', () => {
    const life = new Set(['life']);
    // Cure Wounds at 1st: 4.5 + 3 + (2 + 1).
    expect(healingAt(SPELLS_BY_ID['cure-wounds'], 1, 3, life)).toBe(10.5);
    // At 5th the bonus is 7, not 3.
    expect(healingAt(SPELLS_BY_ID['cure-wounds'], 5, 3, life)).toBe(
      healingAt(SPELLS_BY_ID['cure-wounds'], 5, 3) + 7,
    );
    // A cantrip-level casting gets nothing, since the feature needs 1st or up.
    expect(healingAt(SPELLS_BY_ID['cure-wounds'], 0, 3, life)).toBe(
      healingAt(SPELLS_BY_ID['cure-wounds'], 0, 3),
    );
  });
});

describe('a character who heals', () => {
  it('says nothing at all for someone who cannot', () => {
    const fighter = deriveBuild(build({ classes: [{ classId: 'fighter', level: 5 }] })).healing;
    expect(fighter.heals).toBe(false);
    expect(fighter.options).toEqual([]);
  });

  /*
    A War Cleric rather than a Life one, because a Life Cleric cannot be a
    caster carrying no healing spell: the domain grants Cure Wounds at 1st
    level and Beacon of Hope and Revivify at 5th, whether they picked them or
    not. That is the next test.
  */
  it('is silent for a caster carrying no healing spell', () => {
    expect(cleric(5, ['guiding-bolt', 'bless'], 'war').heals).toBe(false);
  });

  /*
    The domain list also grants Beacon of Hope and Revivify, which are not
    healing spells - one multiplies healing and the other brings the dead back
    - so neither shows up here. Mass Cure Wounds at 9th does.
  */
  it('counts the spells a subclass hands you, which are never picks', () => {
    const life = cleric(5, ['guiding-bolt'], 'life');
    expect(life.heals).toBe(true);
    expect(life.options.map((o) => o.spell.id)).toEqual(['cure-wounds']);

    const at9 = cleric(9, ['guiding-bolt'], 'life');
    expect(at9.options.map((o) => o.spell.id)).toEqual(
      expect.arrayContaining(['cure-wounds', 'mass-cure-wounds']),
    );
  });

  it('ranks by what one casting puts back in total', () => {
    // Cleric 9: 5th-level slots. Mass Cure Wounds reaches six creatures, so it
    // beats Cure Wounds on total even though each target gets the same.
    const healing = cleric(9, ['cure-wounds', 'mass-cure-wounds', 'healing-word']);
    expect(healing.best?.spell.id).toBe('mass-cure-wounds');
    expect(healing.best!.total).toBeGreaterThan(healing.best!.perTarget);
    expect(healing.best!.targets).toBe(6);
  });

  it('reports the best single-target heal separately from the best total', () => {
    const healing = cleric(9, ['cure-wounds', 'mass-cure-wounds']);
    expect(healing.best?.spell.id).toBe('mass-cure-wounds');
    expect(healing.bestSingleTarget?.spell.id).toBe('cure-wounds');
  });

  it('costs every spell at the best slot the character actually has', () => {
    const low = cleric(1, ['cure-wounds']);
    const high = cleric(9, ['cure-wounds']);
    expect(high.best!.perTarget).toBeGreaterThan(low.best!.perTarget);
    expect(low.best!.slotLevel).toBe(1);
    expect(high.best!.slotLevel).toBe(5);
  });

  it('says when a recorded spell is above any slot they have', () => {
    const healing = cleric(3, ['cure-wounds', 'heal']);
    expect(healing.options.map((o) => o.spell.id)).toEqual(['cure-wounds']);
    expect(healing.notes.join(' ')).toContain('Heal');
  });

  it('points out the one that costs a bonus action', () => {
    expect(cleric(5, ['healing-word']).notes.join(' ')).toContain('bonus action');
  });

  /** A Life Cleric out-heals another cleric with the same spells and stats. */
  it('puts a Life Cleric ahead of a Light Cleric on the same list', () => {
    const life = cleric(9, ['mass-cure-wounds'], 'life');
    const light = cleric(9, ['mass-cure-wounds'], 'light');
    expect(life.best!.total).toBeGreaterThan(light.best!.total);
    // Six targets, +7 each at a 5th-level slot.
    expect(life.best!.total - light.best!.total).toBeCloseTo(42, 1);
    expect(life.notes.join(' ')).toContain('Disciple of Life');
  });
});
