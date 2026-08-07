import type { Spell } from '../data/spells';
import { averageDice, parseDice } from './dpr';
import type { ClassSlice } from './character';

/**
 * What a healer actually restores.
 *
 * The app could rank a Wizard's damage in four different ways and had nothing
 * at all to say to a Life Cleric about the thing they were built to do. This is
 * the other half of that: healing per casting, at each slot the character has.
 *
 * It is deliberately not part of the damage model. Damage and healing are never
 * compared - nobody asks whether Cure Wounds out-damages Fire Bolt - and
 * folding them into one number would invite exactly that comparison. They are
 * two columns, not one.
 *
 * The number is an average. Healing has no attack roll and no saving throw, so
 * unlike damage there is no hit chance to fold in: what you roll is what you
 * restore, which makes this the most honest figure in the app.
 */

export interface HealingOption {
  spell: Spell;
  /** The slot this was costed at. */
  slotLevel: number;
  /** Average restored to one creature. */
  perTarget: number;
  /** How many creatures it reaches. */
  targets: number;
  /** Everything it restores at once, which is what a group heal is for. */
  total: number;
  /** Healing you can do without spending your action. */
  bonusAction: boolean;
}

export interface HealingResult {
  /** Whether this character can heal at all. */
  heals: boolean;
  /** Every healing spell they have, best total first. */
  options: HealingOption[];
  /** The most healing in one casting, and the most to a single creature. */
  best?: HealingOption;
  bestSingleTarget?: HealingOption;
  /** Where the numbers come from, itemised the way the damage model is. */
  lines: { label: string; detail: string }[];
  notes: string[];
}

export interface HealingInput {
  spells: Spell[];
  slices: ClassSlice[];
  subclassIds: Set<string>;
  /** The spellcasting modifier, which most healing spells add. */
  castingMod: number | null;
  /** Slots at each level, index 0 being 1st. */
  slotsByLevel: number[];
}

/**
 * Disciple of Life: a Life Cleric's healing spell of 1st level or higher
 * restores an extra 2 + the slot's level, to each target. It is the single
 * biggest multiplier on healing in the game and it applies per creature, which
 * is why a Life Cleric's Mass Cure Wounds is so far ahead of anyone else's.
 */
function discipleOfLife(subclassIds: Set<string>, slotLevel: number): number {
  return subclassIds.has('life') && slotLevel >= 1 ? 2 + slotLevel : 0;
}

/** The average a spell restores to one creature, cast at a given slot level. */
export function healingAt(
  spell: Spell,
  slotLevel: number,
  castingMod: number,
  subclassIds: Set<string> = new Set(),
): number {
  const healing = spell.healing;
  if (!healing) return 0;

  const above = Math.max(0, slotLevel - spell.level);
  let amount = healing.flat ?? 0;

  if (healing.dice) {
    const { count, die } = parseDice(healing.dice);
    amount += averageDice(count, die);
  }
  if (healing.perSlot && above > 0) {
    const extra = parseDice(healing.perSlot);
    amount += averageDice(extra.count * above, extra.die);
  }
  if (healing.perSlotFlat && above > 0) amount += healing.perSlotFlat * above;
  if (healing.addsModifier) amount += castingMod;

  return amount + discipleOfLife(subclassIds, slotLevel);
}

export function computeHealing(input: HealingInput): HealingResult {
  const { spells, subclassIds, castingMod, slotsByLevel } = input;
  const lines: HealingResult['lines'] = [];
  const notes: string[] = [];

  const healers = spells.filter((s) => s.healing);
  if (!healers.length || castingMod === null) {
    return { heals: false, options: [], lines, notes };
  }

  // The highest slot this character actually has. A spell cannot be cast below
  // its own level, so each one is costed at the best slot it fits in.
  const highestSlot = slotsByLevel.reduce((best, count, i) => (count > 0 ? i + 1 : best), 0);

  const options: HealingOption[] = healers
    .filter((spell) => spell.level <= highestSlot)
    .map((spell) => {
      // Costed at the best slot available, since these were filtered to the
      // ones that fit in it.
      const slotLevel = highestSlot;
      const perTarget = healingAt(spell, slotLevel, castingMod, subclassIds);
      const targets = spell.healing?.targets ?? 1;
      return {
        spell,
        slotLevel,
        perTarget: Math.round(perTarget * 10) / 10,
        targets,
        total: Math.round(perTarget * targets * 10) / 10,
        bonusAction: spell.healing?.bonusAction ?? false,
      };
    })
    .sort((a, b) => b.total - a.total || a.spell.name.localeCompare(b.spell.name));

  const unreachable = healers.filter((spell) => spell.level > highestSlot);
  if (unreachable.length) {
    notes.push(
      `${unreachable.map((s) => s.name).join(', ')} ${unreachable.length === 1 ? 'is' : 'are'} recorded but above the highest slot this character has.`,
    );
  }

  if (!options.length) return { heals: false, options: [], lines, notes };

  const best = options[0];
  const bestSingleTarget = options.find((o) => o.targets === 1);

  for (const option of options) {
    lines.push({
      label: `${option.spell.name} at level ${option.slotLevel}`,
      detail:
        option.targets > 1
          ? `${option.perTarget} each to ${option.targets}, ${option.total} in all`
          : `${option.perTarget} to one creature${option.bonusAction ? ', as a bonus action' : ''}`,
    });
  }

  if (subclassIds.has('life')) {
    notes.push(
      `Disciple of Life adds 2 + the slot's level to every creature each spell touches, which is why these numbers are so far ahead of another cleric's.`,
    );
  }
  const bonus = options.find((o) => o.bonusAction);
  if (bonus) {
    notes.push(
      `${bonus.spell.name} costs a bonus action, so it is the one that gets someone up without giving up your turn.`,
    );
  }

  return { heals: true, options, best, bestSingleTarget, lines, notes };
}
