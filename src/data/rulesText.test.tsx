// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { SPELLS } from './spells';
import { MAGIC_ITEMS } from './magicItems';
import { srdKey } from './srd/names';
import fixture from './srd/srd-2014-text.json';
import { RulesBody } from '../components/RulesText';

/**
 * The full SRD text, and the entries that have none.
 *
 * The point of pinning the *absences* is that the UI says something about them
 * — a reader who opens a description and is told there is none deserves that
 * to be true and to stay true. An entry that quietly falls out of the match
 * would look identical to one that was never in the SRD.
 */

const records = (fixture as {
  records: { spells: Record<string, string[]>; magicItems: Record<string, string[]> };
}).records;

/**
 * Spells outside the SRD.
 *
 * Here the licence really is the reason: the source carries exactly 319 spells
 * and SRD 5.1 contains 319, so anything missing is genuinely not in it. These
 * are the ones the app carries anyway because they change how a class plays —
 * the smites, Hunter's Mark's cousins, Hex, and the cantrips the SRD omits.
 */
const SPELLS_WITHOUT_TEXT = [
  'Absorb Elements', 'Arcane Gate', 'Blade Ward', 'Compelled Duel', 'Conjure Barrage',
  'Conjure Volley', 'Cordon of Arrows', "Crusader's Mantle", 'Ensnaring Strike', 'Feign Death',
  'Friends', 'Hail of Thorns', 'Hex', 'Phantasmal Force', 'Power Word Heal', 'Ray of Sickness',
  'Searing Smite', 'Swift Quiver', 'Thorn Whip', 'Thunderous Smite', 'Toll the Dead', 'Tsunami',
  'Whirlwind', 'Witch Bolt', 'Wrathful Smite',
];

/**
 * Magic items with no text, which is a *different* problem and must not be
 * confused with the one above.
 *
 * Some are genuinely outside the SRD (Amulet of the Devout and Rod of the Pact
 * Keeper are Xanathar's). Some are entries the app deliberately combines, so no
 * single description fits — "Potion of Frost/Stone Giant Strength" is two SRD
 * items on one row. And some are in the SRD but absent from *both* APIs the
 * refresh script can reach: dnd5eapi serves 362 items and Open5e only 237, and
 * neither carries the artifacts. That last group is a source gap, not a licence
 * one, which is why the UI never claims a reason.
 */
const ITEMS_WITHOUT_TEXT = [
  '+1 Shield', '+2 Shield', '+3 Shield',
  'Amulet of the Devout +1', 'Amulet of the Devout +2',
  'Belt of Stone/Frost Giant Strength', 'Book of Vile Darkness', 'Efreeti Chain',
  'Eye of Vecna', 'Gloves of Thievery', 'Hand of Vecna', "Mariner's Armor",
  'Potion of Frost/Stone Giant Strength', 'Potion of Invulnerability',
  'Rod of the Pact Keeper +1', 'Rod of the Pact Keeper +2', 'Rod of the Pact Keeper +3',
  'Scroll of Protection', 'Staff of the Adder', 'Sword of Kas', 'Weapon of Warning',
];

describe('the SRD rules text', () => {
  it('covers every spell but the ones recorded as having none', () => {
    const without = SPELLS.filter((s) => !records.spells[srdKey(s.name)]).map((s) => s.name);
    expect(without.sort()).toEqual([...SPELLS_WITHOUT_TEXT].sort());
  });

  it('covers every magic item but the ones recorded as having none', () => {
    const without = MAGIC_ITEMS.filter((m) => !records.magicItems[srdKey(m.name)]).map((m) => m.name);
    expect(without.sort()).toEqual([...ITEMS_WITHOUT_TEXT].sort());
  });

  it('resolves the spells the SRD files under a different name', () => {
    // The SRD strips the wizards' names; the app keeps the ones players use.
    for (const name of ["Bigby's Hand", "Tenser's Floating Disk", "Melf's Acid Arrow"]) {
      expect(records.spells[srdKey(name)], name).toBeDefined();
    }
  });

  it('carries real prose, not empty strings', () => {
    for (const [name, lines] of Object.entries(records.spells)) {
      expect(lines.length, name).toBeGreaterThan(0);
      expect(lines.every((l) => l.trim().length > 0), name).toBe(true);
    }
  });

  it("keeps a spell's higher-level clause as its closing paragraph", () => {
    const fireball = records.spells[srdKey('Fireball')];
    expect(fireball[fireball.length - 1]).toContain('At Higher Levels');
  });
});

describe('rendering the text', () => {
  it('groups consecutive pipe rows into one table and leaves prose alone', () => {
    const { container } = render(
      <RulesBody lines={['Before.', '| A | B |', '|---|---|', '| 1 | 2 |', 'After.']} />,
    );
    expect(container.querySelectorAll('table')).toHaveLength(1);
    // The `|---|` separator is a markdown artefact, not a row.
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(container.querySelectorAll('th')).toHaveLength(2);
    expect(container.querySelectorAll('p')).toHaveLength(2);
  });

  it('renders bold and bold-italic without a markdown dependency', () => {
    const { container } = render(<RulesBody lines={['**At Higher Levels.** More dice.']} />);
    expect(container.querySelector('strong')?.textContent).toBe('At Higher Levels.');
    const { container: two } = render(<RulesBody lines={['***Bite.*** Melee attack.']} />);
    expect(two.querySelector('strong em')?.textContent).toBe('Bite.');
  });
});
