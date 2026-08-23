import type { BuildContext } from './engine/character';
import { heldResources, restoredKeys } from './engine/resources';
import type { HeldResource } from './engine/resources';
import { ammunitionCarried } from './engine/inventory';
import type { AmmoStack } from './engine/inventory';
import { ammoLeft, hitDiceLeft, hpNow, isFresh, resourceLeft, slotsLeft, slotsTotal } from './play';
import type { PlayState } from './play';
import type { ClassId } from './types';

/**
 * §120: what a character has left.
 *
 * A character in play is two stores. `BuildContext` is the derived side - the
 * caps: how many hit points, how many slots at each level, how many uses of
 * Second Wind, how many arrows. `PlayState` is the spent side, and it holds
 * only the spending: `slotsSpent`, `resourcesSpent`, `currentHp`.
 *
 * Every question worth asking is about the pair, and `play.ts` cannot answer
 * one on its own - so each of its reads takes the cap as an argument:
 *
 *     hpNow(play, ctx.hp.total)
 *     slotsLeft(play, level, casting.bySpellLevel[level - 1] ?? 0)
 *     resourceLeft(play, held.key, held.max)
 *     hitDiceLeft(play, slice.klass.id, slice.entry.level)
 *
 * Which means the join lived at each caller, and each caller reached into a
 * different corner of `ctx` to find its half of it. Four screens did it -
 * sheet, tray, play card, battle screen - and the awkward ones drifted: three
 * places wrote `casting.bySpellLevel[level - 1] ?? 0` out longhand, and three
 * wrote `heldResources(ctx.slices, build.ruleset, ctx.mods)`, an argument
 * triple assembled from `ctx` internals when `ctx` was right there.
 *
 * This is the read side of a character sheet, the way `FightView` (§110) is
 * the read side of a fight: one value, built once, with the caps already
 * inside it. Callers ask what is left; they no longer have to know what full
 * would have been.
 *
 * The write side is deliberately not here. `damage`, `spendSlot` and their
 * kin still live in `play.ts` and still take their cap, because a write needs
 * to be told the cap it clamps against and hiding that would make a reducer
 * that looks total but is not. A caller now has somewhere honest to get the
 * number from: `sheet.hp.max`, `sheet.slots[i].fromTable`.
 */

/** One spell level: what the table grants, and what is left of it. */
export interface SlotLevel {
  level: number;
  /** What the class table alone grants - the cap `spendSlot` clamps against. */
  fromTable: number;
  /** With any slot created from sorcery points folded in. */
  total: number;
  left: number;
}

export interface HitDicePool {
  classId: ClassId;
  name: string;
  die: number;
  total: number;
  left: number;
}

/** A held resource with its spend read off. */
export interface ResourceNow {
  held: HeldResource;
  left: number;
}

export interface AmmoNow {
  stack: AmmoStack;
  left: number;
}

export interface Sheet {
  hp: {
    now: number;
    max: number;
    temp: number;
    /** At zero and making death saves. */
    down: boolean;
    /** Untouched: full, no temp, no saves rolled. */
    fresh: boolean;
  };
  /**
   * Nine entries, level 1 to 9, mirroring the class table - so `slots[n - 1]`
   * is level n and a caller never does the off-by-one itself. A non-caster
   * gets nine zeros rather than an empty list, and a slot conjured from
   * sorcery points above the table shows up in `total` at its own level,
   * which is the case that used to be paid for and then invisible.
   */
  slots: SlotLevel[];
  pact: { level: number; total: number; left: number } | null;
  hitDice: HitDicePool[];
  resources: ResourceNow[];
  ammo: AmmoNow[];
}

export function sheetOf(ctx: BuildContext, play: PlayState): Sheet {
  const casting = ctx.spellcasting;
  const max = ctx.hp.total;

  const slots: SlotLevel[] = casting.bySpellLevel.map((fromTable, index) => {
    const level = index + 1;
    return {
      level,
      fromTable,
      total: slotsTotal(play, level, fromTable),
      left: slotsLeft(play, level, fromTable),
    };
  });

  return {
    hp: {
      now: hpNow(play, max),
      max,
      temp: play.tempHp,
      down: hpNow(play, max) === 0,
      fresh: isFresh(play, max),
    },
    slots,
    pact: casting.pact
      ? {
          level: casting.pact.level,
          total: casting.pact.count,
          left: Math.max(0, casting.pact.count - play.pactSpent),
        }
      : null,
    hitDice: ctx.slices.map((slice) => ({
      classId: slice.klass.id,
      name: slice.klass.name,
      die: slice.klass.hitDie,
      total: slice.entry.level,
      left: hitDiceLeft(play, slice.klass.id, slice.entry.level),
    })),
    resources: resourcesOf(ctx).map((held) => ({
      held,
      left: resourceLeft(play, held.key, held.max),
    })),
    ammo: ammunitionCarried(ctx.build).map((stack) => ({
      stack,
      left: ammoLeft(play, stack.gearId, stack.total),
    })),
  };
}

/**
 * The resources this character holds, asked of the context rather than of
 * three of its fields.
 *
 * `heldResources` wants slices, ruleset and modifiers; all three hang off a
 * `BuildContext`, so every caller was assembling the same triple by hand and
 * one of them could have got it wrong without anything noticing.
 */
export function resourcesOf(ctx: BuildContext): HeldResource[] {
  return heldResources(ctx.slices, ctx.build.ruleset, ctx.mods);
}

/**
 * Which resource keys a rest of this kind brings back.
 *
 * The battle screen runs rests for a whole party and the sheet runs them for
 * one character, and the list has to be derived identically or a Warlock's
 * pact slots come back at one table and not the other. It is one call now.
 */
export function restoredOn(ctx: BuildContext, moment: 'encounter' | 'short'): string[] {
  return restoredKeys(resourcesOf(ctx), moment);
}
