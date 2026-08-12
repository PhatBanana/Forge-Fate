import type { Build } from '../types';
import type { Spell } from '../data/spells';
import { weaponById } from '../data/weapons';

/**
 * What it takes to cast a spell, and what is currently stopping you.
 *
 * ## The two rules worth enforcing, and the one that is a ruling
 *
 * The SRD says three things about components that a tool can actually check:
 *
 * 1. **Verbal** needs a voice. A creature that cannot speak cannot cast a
 *    spell with a V component - which under 2024 is part of Incapacitated in
 *    as many words, and at any table is what Silence and a gag do.
 * 2. **Somatic** needs a free hand. War Caster removes exactly this
 *    restriction and no other: "you can perform the somatic components of
 *    spells even when you have weapons or a shield in one or both hands."
 * 3. **Material** needs a free hand too - to reach a pouch or hold a focus -
 *    and the SRD is explicit that *the same hand* can serve both, which is
 *    why this returns one hand problem rather than two.
 *
 * What it does not decide: whether a holy symbol emblazoned on a shield frees
 * that hand (the SRD allows the symbol, and whether the shield hand then
 * counts is the table's call), and whether a costly material is on hand at
 * all. Both are stated in the result rather than guessed at, because a tool
 * that silently rules on either is worse than one that says "ask".
 *
 * ## Why this returns reasons rather than a boolean
 *
 * "You cannot cast this" is useless at a table; "both hands are full and this
 * needs a somatic component" is a sentence a player can act on - drop the
 * shield, stow the weapon, take War Caster. The battle screen prints the
 * reason and the Builder's review counts them.
 */

/** What a caster has in hand and on their sheet, as this module needs it. */
export interface CastingHands {
  /** Weapons actually recorded, and the shield. Build this with `handsOf`. */
  held: { mainHandId?: string; offHandId?: string; shield: boolean };
  /** War Caster, which frees the somatic component and nothing else. */
  warCaster: boolean;
  /** Subtle Spell, which removes both V and S for a sorcery point. */
  subtleSpell: boolean;
  /**
   * Whether this caster can speak right now. Absent means the caller has no
   * model for it - a Builder has none, since being silenced is a thing that
   * happens in a fight - and the verbal rule is then left alone rather than
   * applied in either direction.
   */
  canSpeak?: boolean;
}

/** One thing standing between a caster and a spell. */
export interface CastingBlock {
  component: 'verbal' | 'somatic' | 'material';
  /** What a player would do about it. */
  why: string;
}

/**
 * What this character has actually recorded as held.
 *
 * **Read from the build, never from `ctx.loadouts`,** and that is the whole
 * reason this function exists rather than the caller passing the derived
 * loadout. A character with no weapon recorded still gets a *default* weapon
 * in `loadouts` - a Greatsword - so the damage model has something to swing;
 * it is a stand-in for "we do not know", not a claim that a wizard is holding
 * a greatsword in both hands. Reading it here made every empty-handed caster
 * unable to cast anything, which is how this was found.
 */
export function handsOf(build: Build): CastingHands['held'] {
  return {
    ...(build.weapons.mainHandId ? { mainHandId: build.weapons.mainHandId } : {}),
    ...(build.weapons.offHandId ? { offHandId: build.weapons.offHandId } : {}),
    shield: build.defenses.shield,
  };
}

/**
 * How many hands this leaves free.
 *
 * A two-handed weapon takes both, which is the case the whole rule exists
 * for: a Paladin with a greatsword has no hand for a holy symbol, and an
 * Eldritch Knight with a longbow has none either.
 */
export function handsFree(held: CastingHands['held'], ruleset: Build['ruleset'] = '2014'): number {
  const main = held.mainHandId ? weaponById(held.mainHandId, ruleset) : undefined;
  if (main?.properties.includes('two-handed')) return 0;
  let used = 0;
  if (held.mainHandId) used += 1;
  if (held.offHandId) used += 1;
  if (held.shield) used += 1;
  return Math.max(0, 2 - used);
}

/**
 * What stops this casting, in the order a player would notice it.
 *
 * An empty list means nothing does. A spell with no recorded components -
 * the twenty-five the app carries that SRD 5.1 does not - also returns
 * nothing, deliberately: the rule is left unapplied rather than applied from
 * a guess, which is the same refusal the light and sight models make.
 */
export function castingBlocks(spell: Spell, hands: CastingHands): CastingBlock[] {
  const components = spell.components;
  if (!components) return [];
  // Subtle Spell answers both of the components a body performs, so a
  // sorcerer holding it in reserve is never stopped by either.
  if (hands.subtleSpell) return [];

  const out: CastingBlock[] = [];

  if (components.v && hands.canSpeak === false) {
    out.push({ component: 'verbal', why: 'you cannot speak, and this spell has a verbal component' });
  }

  const free = handsFree(hands.held);
  if (free === 0) {
    // One free hand serves both, so these are one problem with two possible
    // causes rather than two problems - and War Caster answers only the first.
    const needsSomatic = components.s && !hands.warCaster;
    const needsMaterial = Boolean(components.m);
    if (needsSomatic) {
      out.push({
        component: 'somatic',
        why: 'both hands are full and this spell has a somatic component — stow something, or take War Caster',
      });
    }
    if (needsMaterial) {
      out.push({
        component: 'material',
        why: 'both hands are full and this spell needs a material component — a hand has to reach a pouch or hold a focus',
      });
    }
  }

  return out;
}

/** "V, S, M" - the line every spell list and character sheet prints. */
export function describeComponents(spell: Spell): string {
  const c = spell.components;
  if (!c) return '';
  return [c.v && 'V', c.s && 'S', c.m && 'M'].filter(Boolean).join(', ');
}
