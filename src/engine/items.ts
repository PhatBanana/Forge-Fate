import type { Ability, Build, MoveGrant, SightGrant } from '../types';
import { ATTUNEMENT_LIMIT, magicItemById } from '../data/magicItems';
import type { ItemEffect, MagicItem } from '../data/magicItems';

/**
 * What the items a character carries actually do.
 *
 * Two rules make this less trivial than summing a column. An item that needs
 * attunement does nothing until you attune to it, and you get three slots - so
 * carrying a fourth Cloak of Protection is carrying, not wearing. And several
 * items only work in conditions the rest of the build decides: Bracers of
 * Defense do nothing the moment you put on armor, so the effect has to be
 * resolved against the equipment, not just added up.
 */

export interface CarriedItem {
  /** Catalogue id, or absent for something you named yourself. */
  itemId?: string;
  /** For a free-form entry. */
  customName?: string;
  attuned: boolean;
  /** Free-form note, and the only record of what a custom item does. */
  note?: string;
  /**
   * How many you have. Absent means one, so every character saved before
   * consumables existed reads correctly without a migration.
   *
   * Only meaningful for the things you consume: nobody owns "three Cloaks of
   * Protection" in a way the app should reason about, and two of a permanent
   * item would double an effect that does not stack.
   */
  quantity?: number;
  /**
   * What is written on it, for the items whose identity is not their name.
   *
   * The SRD has no "Scroll of Invisibility" - it has a Spell Scroll (2nd
   * Level), and which spell is on it is written on the scroll. Free text
   * rather than a picker from this app's spell list, because a scroll can
   * carry a spell this app does not know and a picker would make that
   * unrecordable.
   */
  detail?: string;
}

/**
 * Whether this is something you use up.
 *
 * Potions and scrolls, which is exactly the two kinds the books treat that
 * way. Everything else is worn, wielded or carried, and stays.
 */
export function isConsumable(item: MagicItem | null): boolean {
  return item?.kind === 'potion' || item?.kind === 'scroll';
}

/** How many of a carried line there are; absent means one. */
export const quantityOf = (carried: CarriedItem) => Math.max(1, carried.quantity ?? 1);

/**
 * Use one up.
 *
 * Decrements, and drops the line entirely at zero rather than leaving an empty
 * row - a pack does not list the potion you no longer have. Returns the list
 * unchanged when there is nothing at that index, so a stale click cannot
 * corrupt an inventory.
 */
export function consumeItem(items: CarriedItem[], index: number): CarriedItem[] {
  const carried = items[index];
  if (!carried) return items;
  const left = quantityOf(carried) - 1;
  if (left <= 0) return items.filter((_, i) => i !== index);
  return items.map((entry, i) => (i === index ? { ...entry, quantity: left } : entry));
}

export interface ResolvedItem {
  carried: CarriedItem;
  item: MagicItem | null;
  name: string;
  /** Whether its effect is being applied right now. */
  active: boolean;
  /** Why it is not, when it is not. */
  inactiveReason?: string;
}

export interface ItemEffects {
  /**
   * Sense grants from worn items, unresolved. A list rather than a number
   * because `engine/senses.ts` owns the resolution - an extending grant needs
   * to know what the rest of the character already has, which this layer
   * cannot see.
   */
  sight: SightGrant[];
  /**
   * Movement grants from worn items, unresolved for the same reason `sight`
   * is: "a climbing speed equal to your walking speed" cannot be turned into
   * a number until the walking speed is final, which happens well after this.
   */
  move: MoveGrant[];
  ac: number;
  saves: number;
  weaponBonus: number;
  spellBonus: number;
  abilityChecks: number;
  /** Scores an item sets outright, highest wins. */
  setAbility: Partial<Record<Ability, number>>;
  abilityBonus: Partial<Record<Ability, number>>;
  /** The lowest ceiling any contributing item imposes, per ability. */
  abilityBonusCap: Partial<Record<Ability, number>>;
  speed: number;
  /**
   * Extra damage carried weapons add, for the damage model. A list rather than
   * a total because each one has its own dice and its own trigger.
   */
  damageRiders: { label: string; dice?: string; flat?: number; type: string; when: 'hit' | 'crit' }[];
  /** Whether a carried weapon grants an attack as a bonus action. */
  extraBonusAttack: boolean;
  /**
   * A bonus that rides on ammunition, so it reaches a bow and not a
   * greatsword. Applied by `attacks.ts`, which knows what the weapon fires.
   */
  ammunitionBonus: number;
  /** What a material does to the armor it is made of - Mithral, and only it. */
  noStealthDisadvantage: boolean;
  noStrengthRequirement: boolean;
  /** One line per contributing item, so a number on screen can be traced. */
  lines: { label: string; detail: string }[];
}

function emptyEffects(): ItemEffects {
  return {
    sight: [],
    move: [],
    ac: 0,
    saves: 0,
    weaponBonus: 0,
    spellBonus: 0,
    abilityChecks: 0,
    setAbility: {},
    abilityBonus: {},
    abilityBonusCap: {},
    speed: 0,
    damageRiders: [],
    extraBonusAttack: false,
    ammunitionBonus: 0,
    noStealthDisadvantage: false,
    noStrengthRequirement: false,
    lines: [],
  };
}

/** How many attunement slots this character has. Artificers get more. */
export function attunementLimit(artificerLevel: number): number {
  if (artificerLevel >= 18) return ATTUNEMENT_LIMIT + 3;
  if (artificerLevel >= 14) return ATTUNEMENT_LIMIT + 2;
  if (artificerLevel >= 10) return ATTUNEMENT_LIMIT + 1;
  return ATTUNEMENT_LIMIT;
}

/**
 * Resolve every carried item against the build, marking which are actually
 * doing something. Attunement is honoured in the order the items are listed:
 * once the slots are full the rest are carried but inert, which is the same
 * answer the rules give and avoids silently picking a favourite.
 */
export function resolveItems(
  build: Build,
  options: { wearingArmor: boolean; usingShield: boolean; attunementSlots: number },
): { resolved: ResolvedItem[]; effects: ItemEffects; attunedCount: number } {
  const resolved: ResolvedItem[] = [];
  const effects = emptyEffects();
  let attunedCount = 0;

  for (const carried of build.items ?? []) {
    const item = carried.itemId ? (magicItemById(carried.itemId) ?? null) : null;
    const name = item?.name ?? carried.customName ?? 'Unnamed item';

    // A custom item has no declared effect, so it is recorded and nothing more.
    if (!item) {
      resolved.push({ carried, item: null, name, active: false, inactiveReason: 'Recorded only - the app does not know what it does.' });
      continue;
    }

    if (item.attunement && carried.attuned) attunedCount++;

    let inactiveReason: string | undefined;
    /*
      A potion in your pack is not a potion you have drunk.

      No consumable in the catalogue declares an effect today, so this guard
      changes nothing yet - and that is exactly why it is here. §65 wanted to
      give Potion of Climbing its climb speed and found that doing so would
      have granted it permanently, from inside a backpack, to a character who
      never opened it. The effects gathered here are what *wearing* something
      does; a potion's hour of duration is a thing that happens in play, and
      the app has nowhere to track it.

      Conditioned on there *being* an effect so nothing changes on screen
      today: `.item-warn` is a warning, and "your potion is not doing anything
      while corked" is not a problem worth flagging on every potion in every
      pack. The day one carries an effect, the note explains itself.
    */
    if (isConsumable(item) && item.effect) {
      inactiveReason = 'Drunk or read in play, so it does nothing while carried.';
    } else if (item.attunement && !carried.attuned) {
      inactiveReason = 'Not attuned, so it does nothing.';
    } else if (item.attunement && attunedCount > options.attunementSlots) {
      inactiveReason = `Beyond your ${options.attunementSlots} attunement slots.`;
    } else if (item.requires?.noArmor && options.wearingArmor) {
      inactiveReason = 'Only works while wearing no armor.';
    } else if (item.requires?.noShield && options.usingShield) {
      inactiveReason = 'Only works while holding no shield.';
    }

    const active = !inactiveReason && Boolean(item.effect);
    resolved.push({ carried, item, name, active, inactiveReason });
    if (active && item.effect) applyEffect(effects, item.effect, name);
  }

  return { resolved, effects, attunedCount };
}

function applyEffect(into: ItemEffects, effect: ItemEffect, name: string): void {
  const parts: string[] = [];

  if (effect.sight) {
    into.sight.push(effect.sight);
    const { darkvision, magical, blindsight, extendsBy } = effect.sight;
    if (darkvision) parts.push(extendsBy ? `darkvision +${extendsBy} ft` : `darkvision ${darkvision} ft`);
    if (magical) parts.push(`sight in magical darkness ${magical} ft`);
    if (blindsight) parts.push(`blindsight ${blindsight} ft`);
  }

  if (effect.move) {
    into.move.push(effect.move);
    const { climb, swim, climbFree, swimFree, jumpTimes } = effect.move;
    const feet = (v: number | 'walk') => (v === 'walk' ? 'your walking speed' : `${v} ft`);
    if (climb) parts.push(`climb speed ${feet(climb)}`);
    if (swim) parts.push(`swim speed ${feet(swim)}`);
    if (climbFree && !climb) parts.push('climbing costs no extra movement');
    if (swimFree && !swim) parts.push('swimming costs no extra movement');
    if (jumpTimes) parts.push(`jump ${jumpTimes}x as far`);
  }

  if (effect.ac) {
    into.ac += effect.ac;
    parts.push(`+${effect.ac} AC`);
  }
  if (effect.saves) {
    into.saves += effect.saves;
    parts.push(`+${effect.saves} saves`);
  }
  if (effect.weaponBonus) {
    // Two magic weapons do not stack; you swing one of them.
    into.weaponBonus = Math.max(into.weaponBonus, effect.weaponBonus);
    parts.push(`+${effect.weaponBonus} attack and damage`);
  }
  if (effect.spellBonus) {
    into.spellBonus = Math.max(into.spellBonus, effect.spellBonus);
    parts.push(`+${effect.spellBonus} spell attack and DC`);
  }
  if (effect.abilityChecks) {
    into.abilityChecks += effect.abilityChecks;
    parts.push(`+${effect.abilityChecks} ability checks`);
  }
  if (effect.setAbility) {
    const { ability, score } = effect.setAbility;
    // Two items setting the same score do not add; the higher one wins.
    into.setAbility[ability] = Math.max(into.setAbility[ability] ?? 0, score);
    parts.push(`${ability.toUpperCase()} becomes ${score}`);
  }
  if (effect.abilityBonus) {
    for (const [ability, value] of Object.entries(effect.abilityBonus)) {
      const key = ability as Ability;
      into.abilityBonus[key] = (into.abilityBonus[key] ?? 0) + (value ?? 0);
      if (effect.abilityBonusCap !== undefined) {
        // Two items with different ceilings: the lower one wins, because
        // neither can be exceeded.
        into.abilityBonusCap[key] = Math.min(
          into.abilityBonusCap[key] ?? Infinity,
          effect.abilityBonusCap,
        );
      }
      parts.push(
        `+${value} ${ability.toUpperCase()}${effect.abilityBonusCap ? ` (max ${effect.abilityBonusCap})` : ''}`,
      );
    }
  }
  if (effect.speed) {
    into.speed += effect.speed;
    parts.push(`+${effect.speed} ft speed`);
  }
  if (effect.damageRider) {
    const { dice, flat, type, when } = effect.damageRider;
    into.damageRiders.push({ label: name, dice, flat, type, when });
    const amount = dice ?? String(flat);
    parts.push(`+${amount} ${type}${when === 'crit' ? ' on a critical' : ''}`);
  }
  if (effect.ammunitionBonus) {
    // Highest wins rather than summing, the same as `weaponBonus`: you fire
    // one arrow, not every arrow in the quiver at once.
    into.ammunitionBonus = Math.max(into.ammunitionBonus, effect.ammunitionBonus);
    parts.push(`+${effect.ammunitionBonus} attack and damage with ammunition`);
  }

  if (effect.armorTraits?.noStealthDisadvantage) {
    into.noStealthDisadvantage = true;
    parts.push('no Stealth disadvantage from armor');
  }
  if (effect.armorTraits?.noStrengthRequirement) {
    into.noStrengthRequirement = true;
    parts.push('no Strength requirement from armor');
  }

  if (effect.extraAttack === 'bonus') {
    into.extraBonusAttack = true;
    parts.push('an extra attack as a bonus action');
  }

  if (parts.length) into.lines.push({ label: name, detail: parts.join(', ') });
}

/**
 * A score an item sets outright, applied after everything else. It is a floor
 * rather than a bonus: a Headband of Intellect does nothing to a Wizard whose
 * Intelligence is already 20.
 */
export function applySetAbilities(
  scores: Record<Ability, number>,
  effects: ItemEffects,
): Record<Ability, number> {
  const out = { ...scores };
  for (const [ability, score] of Object.entries(effects.setAbility)) {
    const key = ability as Ability;
    if ((score ?? 0) > out[key]) out[key] = score ?? out[key];
  }
  for (const [ability, bonus] of Object.entries(effects.abilityBonus)) {
    const key = ability as Ability;
    // An Ioun Stone stops at 20, where the ordinary ceiling is 30 - and it
    // stops there rather than being wasted, so a score of 19 still gains 1.
    const ceiling = Math.min(30, effects.abilityBonusCap[key] ?? 30);
    out[key] = Math.min(ceiling, out[key] + (bonus ?? 0));
  }
  return out;
}
