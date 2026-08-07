import { ARMOR_BY_ID } from '../data/armor';
import { GEAR_BY_ID } from '../data/gear';
import type { Gear } from '../data/gear';
import { weaponById } from '../data/weapons';
import type { Build } from '../types';

/**
 * What a character is carrying, and whether they can.
 *
 * Encumbrance is the one rule on the equipment tables the engine can actually
 * compute, and it is the one most tables ignore - so this reports it plainly
 * and lets you decide. Carrying capacity is Strength × 15 and that is a real
 * rule; the two thresholds below it are the *variant* encumbrance rule, which
 * is optional, so they are reported as a note rather than as a problem.
 *
 * Weight comes from four places and it is easy to forget three of them: the
 * gear you listed, the weapons in your hands, the armor on your body, and your
 * coins at fifty to the pound. A character sheet that counted only the first
 * would tell a plate-armoured Fighter they were travelling light.
 */

/** Fifty coins weigh a pound, whatever the metal. */
const COINS_PER_POUND = 50;

export interface CarriedLine {
  label: string;
  /** How many, for gear that stacks. */
  quantity: number;
  /** Pounds for the whole stack. */
  weight: number;
}

export interface Coins {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

export function emptyCoins(): Coins {
  return { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
}

export interface CarriedGear {
  gearId: string;
  quantity: number;
}

export interface InventoryResult {
  /** Every carried thing, itemised, heaviest first. */
  lines: CarriedLine[];
  /** Pounds, rounded to one decimal because quarter-pound pitons exist. */
  weight: number;
  /** Strength × 15. */
  capacity: number;
  /** Strength × 5 and × 10, from the optional variant rule. */
  encumberedAt: number;
  heavilyEncumberedAt: number;
  /** Over capacity outright: you cannot pick it all up. */
  overloaded: boolean;
  /** Total wealth in copper, for a single "you are worth this much" line. */
  purseCopper: number;
  purseWeight: number;
}

export function coinCount(coins: Coins): number {
  return coins.cp + coins.sp + coins.ep + coins.gp + coins.pp;
}

export function purseInCopper(coins: Coins): number {
  return coins.cp + coins.sp * 10 + coins.ep * 50 + coins.gp * 100 + coins.pp * 1000;
}

/** Gear that sits on your back, as opposed to a horse you happen to own. */
function carriedWeight(gear: Gear, quantity: number): number {
  return gear.notCarried ? 0 : gear.weight * quantity;
}

export function computeInventory(build: Build, strength: number): InventoryResult {
  const lines: CarriedLine[] = [];

  for (const entry of build.gear ?? []) {
    const gear = GEAR_BY_ID[entry.gearId];
    if (!gear || entry.quantity <= 0) continue;
    lines.push({
      label: gear.name,
      quantity: entry.quantity,
      weight: carriedWeight(gear, entry.quantity),
    });
  }

  // The weapons in your hands and the armor on your body are carried too, and
  // are by far the heaviest thing most characters own.
  for (const id of [build.weapons.mainHandId, build.weapons.offHandId]) {
    const weapon = weaponById(id, build.ruleset);
    if (weapon) lines.push({ label: weapon.name, quantity: 1, weight: weapon.weight });
  }

  const armor = ARMOR_BY_ID[build.defenses.armorId];
  if (armor && armor.weight > 0) {
    lines.push({ label: armor.name, quantity: 1, weight: armor.weight });
  }
  if (build.defenses.shield) lines.push({ label: 'Shield', quantity: 1, weight: 6 });

  const coins = build.coins ?? emptyCoins();
  const purseWeight = coinCount(coins) / COINS_PER_POUND;
  if (purseWeight > 0) {
    // Quantity 1, because "150 × Coins" reads as a hundred and fifty purses.
    // What they are worth is already stated beside the weight.
    lines.push({ label: describePurse(coins), quantity: 1, weight: purseWeight });
  }

  const weight = Math.round(lines.reduce((sum, line) => sum + line.weight, 0) * 10) / 10;
  const capacity = strength * 15;

  return {
    lines: lines.sort((a, b) => b.weight - a.weight),
    weight,
    capacity,
    encumberedAt: strength * 5,
    heavilyEncumberedAt: strength * 10,
    overloaded: weight > capacity,
    purseCopper: purseInCopper(coins),
    purseWeight,
  };
}

export interface AmmoStack {
  gearId: string;
  /** The gear name without its bundle size: "Arrows", not "Arrows (20)". */
  name: string;
  /** Individual pieces, which is bundles bought times bundle size. */
  total: number;
  /** The weapons in hand that draw on it, so a quiver says what it feeds. */
  usedBy: string[];
}

/**
 * The ammunition a character owns, counted in pieces rather than in purchases.
 *
 * A bow that is held but has nothing to shoot still gets a row, at zero, since
 * "you have no arrows" is the thing worth being told. A stack nothing in your
 * hands can fire is listed too - a quiver you are carrying is a quiver you are
 * carrying - but with no weapon named against it.
 */
export function ammunitionCarried(build: Build): AmmoStack[] {
  const stacks = new Map<string, AmmoStack>();

  const add = (gearId: string, bundles: number) => {
    const gear = GEAR_BY_ID[gearId];
    if (!gear?.bundle) return;
    const existing = stacks.get(gearId);
    if (existing) existing.total += bundles * gear.bundle;
    else {
      stacks.set(gearId, {
        gearId,
        name: gear.name.replace(/\s*\(\d+\)$/, ''),
        total: bundles * gear.bundle,
        usedBy: [],
      });
    }
  };

  for (const entry of build.gear ?? []) {
    if (entry.quantity > 0) add(entry.gearId, entry.quantity);
  }

  for (const id of [build.weapons.mainHandId, build.weapons.offHandId]) {
    const weapon = weaponById(id, build.ruleset);
    if (!weapon?.ammo) continue;
    add(weapon.ammo, 0);
    stacks.get(weapon.ammo)?.usedBy.push(weapon.name);
  }

  // Loaded weapons first, since those are the rows that will be clicked.
  return [...stacks.values()].sort(
    (a, b) => b.usedBy.length - a.usedBy.length || a.name.localeCompare(b.name),
  );
}

/** "12 gp 4 sp", or "nothing" for an empty purse. */
export function describePurse(coins: Coins): string {
  const parts: string[] = [];
  if (coins.pp) parts.push(`${coins.pp} pp`);
  if (coins.gp) parts.push(`${coins.gp} gp`);
  if (coins.ep) parts.push(`${coins.ep} ep`);
  if (coins.sp) parts.push(`${coins.sp} sp`);
  if (coins.cp) parts.push(`${coins.cp} cp`);
  return parts.length ? parts.join(' ') : 'nothing';
}
