import { describe, expect, it } from 'vitest';
import { castingBlocks, describeComponents, handsFree } from './components';
import { SPELLS } from '../data/spells';
import type { Spell } from '../data/spells';


/**
 * The component rules, which the app carried as prose in a summary and
 * enforced nowhere.
 *
 * Every case here is a sentence the SRD states: a free hand serves both the
 * somatic and the material component, War Caster frees the somatic one only,
 * and Subtle Spell removes both. The interesting failures are the ones where
 * a naive reading would be too strict (War Caster does *not* solve a material
 * component) or too loose (a two-handed weapon leaves no hand at all).
 */

const spell = (name: string): Spell => {
  const found = SPELLS.find((s) => s.name === name);
  if (!found) throw new Error(`no spell named ${name}`);
  return found;
};

const hands = (over: Partial<Parameters<typeof castingBlocks>[1]> = {}) => ({
  held: { shield: false },
  warCaster: false,
  subtleSpell: false,
  ...over,
});

describe('how many hands are free', () => {
  it('gives an empty-handed caster both', () => {
    expect(handsFree({ shield: false })).toBe(2);
  });

  it('takes both for a two-handed weapon', () => {
    expect(handsFree({ mainHandId: 'greatsword', shield: false })).toBe(0);
  });

  it('takes one for a sword and one for a shield', () => {
    expect(handsFree({ mainHandId: 'longsword', shield: true })).toBe(0);
    expect(handsFree({ mainHandId: 'longsword', shield: false })).toBe(1);
  });

  it('takes one each for two weapons', () => {
    expect(handsFree({ mainHandId: 'shortsword', offHandId: 'dagger', shield: false })).toBe(0);
  });
});

describe('what stops a casting', () => {
  // Fireball is V, S, M - the common shape, and the one every case below
  // needs so that a failure names the rule rather than the spell.
  const fireball = spell('Fireball');

  it('stops nothing for a caster with their hands free', () => {
    expect(castingBlocks(fireball, hands())).toEqual([]);
  });

  it('stops a somatic and a material component when both hands are full', () => {
    const blocked = castingBlocks(fireball, hands({
      held: { mainHandId: 'greatsword', shield: false },
    }));
    expect(blocked.map((b) => b.component)).toEqual(['somatic', 'material']);
  });

  it('is answered by a single free hand, which serves both', () => {
    // The SRD says so outright: the hand used for the somatic component can
    // be the one that reaches the pouch.
    expect(castingBlocks(fireball, hands({
      held: { mainHandId: 'longsword', shield: false },
    }))).toEqual([]);
  });

  it('lets War Caster answer the somatic component and not the material one', () => {
    const blocked = castingBlocks(fireball, hands({
      held: { mainHandId: 'greatsword', shield: false },
      warCaster: true,
    }));
    // The half a naive reading gets wrong: War Caster is about gestures, not
    // about having a hand free to find a bat dropping.
    expect(blocked.map((b) => b.component)).toEqual(['material']);
  });

  it('lets War Caster fully answer a spell with no material component', () => {
    // Shield is V, S and nothing else - the spell War Caster exists for.
    const blocked = castingBlocks(spell('Shield'), hands({
      held: { mainHandId: 'greatsword', shield: false },
      warCaster: true,
    }));
    expect(blocked).toEqual([]);
  });

  it('stops a verbal component when the caster cannot speak', () => {
    const blocked = castingBlocks(fireball, hands({ canSpeak: false }));
    expect(blocked.map((b) => b.component)).toEqual(['verbal']);
  });

  it('leaves the verbal rule alone when the caller has no model for speech', () => {
    // undefined is "this screen does not know", which must change nothing -
    // the same refusal the light model makes with attackerSeesTarget.
    expect(castingBlocks(fireball, hands({ canSpeak: undefined }))).toEqual([]);
  });

  it('lets Subtle Spell answer both of the components a body performs', () => {
    const blocked = castingBlocks(fireball, hands({
      held: { mainHandId: 'greatsword', shield: false },
      canSpeak: false,
      subtleSpell: true,
    }));
    expect(blocked).toEqual([]);
  });

  it('stops nothing for a spell whose components the SRD does not carry', () => {
    // Hex is one of the twenty-five. Unknown components must leave the rule
    // unapplied rather than assume the spell needs nothing OR everything.
    const hex = spell('Hex');
    expect(hex.components).toBeUndefined();
    expect(castingBlocks(hex, hands({
      held: { mainHandId: 'greatsword', shield: false },
      canSpeak: false,
    }))).toEqual([]);
  });
});

describe('the line a spell list prints', () => {
  it('reads the way the books write it', () => {
    expect(describeComponents(spell('Fireball'))).toBe('V, S, M');
    expect(describeComponents(spell('Shield'))).toBe('V, S');
    // Verbal only, which twenty-six SRD spells are - Healing Word is the one
    // a table meets first, and the reason it can be cast one-handed.
    expect(describeComponents(spell('Healing Word'))).toBe('V');
    // Somatic only, which just four are. Counterspell is a reaction you make
    // with a gesture, so a gagged caster still has it.
    expect(describeComponents(spell('Counterspell'))).toBe('S');
    // And the unverified twenty-five print nothing rather than a guess.
    expect(describeComponents(spell('Hex'))).toBe('');
  });
});
