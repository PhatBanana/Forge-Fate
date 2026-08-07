// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ItemsPanel } from './ItemsPanel';
import { deriveBuild } from '../engine/character';
import type { Build } from '../types';
import { buildOf, fighter } from '../test/factories';

/**
 * The items panel is where "why did my AC not move" gets answered, so most of
 * these check that an inert item explains itself rather than sitting silent.
 */

function setup(initial: Build) {
  const patch = vi.fn();
  let build = initial;

  const view = render(
    <ItemsPanel build={build} ctx={deriveBuild(build)} patch={patch} />,
  );
  patch.mockImplementation((partial: Partial<Build>) => {
    build = { ...build, ...partial };
    view.rerender(<ItemsPanel build={build} ctx={deriveBuild(build)} patch={patch} />);
  });

  return { get build() { return build; } };
}

/**
 * Item names also appear in the "add an item" select, so a plain getByText
 * matches twice. Only the rendered rows are of interest here.
 */
const rowFor = (name: string): HTMLElement => {
  const row = [...document.querySelectorAll('.item-row')].find(
    (el) => el.querySelector('strong')?.textContent === name,
  );
  if (!row) throw new Error(`No item row for ${name}`);
  return row as HTMLElement;
};

const withItems = (items: Build['items'], overrides: Partial<Build> = {}) =>
  buildOf({ ...fighter(), items, ...overrides });

describe('adding and removing', () => {
  it('starts empty and says so', () => {
    setup(withItems([]));
    expect(screen.getByText(/nothing carried/i)).toBeInTheDocument();
  });

  it('adds an item from the catalogue', async () => {
    const app = setup(withItems([]));
    await userEvent.selectOptions(screen.getByLabelText(/add a magic item/i), 'cloak-of-protection');
    expect(app.build.items.map((i) => i.itemId)).toEqual(['cloak-of-protection']);
  });

  it('records a custom item under whatever you call it', async () => {
    const app = setup(withItems([]));
    await userEvent.type(screen.getByLabelText(/name a custom item/i), 'Sword of Nine Names{Enter}');
    expect(app.build.items[0].customName).toBe('Sword of Nine Names');
    expect(screen.getByText('Sword of Nine Names')).toBeInTheDocument();
  });

  it('removes one', async () => {
    const app = setup(withItems([{ itemId: 'cloak-of-protection', attuned: true }]));
    await userEvent.click(screen.getByRole('button', { name: /remove/i }));
    expect(app.build.items).toEqual([]);
  });
});

describe('attunement', () => {
  it('offers a toggle only for items that need one', () => {
    setup(withItems([
      { itemId: 'cloak-of-protection', attuned: false },
      { itemId: 'weapon-plus-1', attuned: false },
    ]));
    expect(within(rowFor('Cloak of Protection')).getByRole('checkbox')).toBeInTheDocument();
    expect(within(rowFor('+1 Weapon')).queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('says an unattuned item is doing nothing', () => {
    setup(withItems([{ itemId: 'cloak-of-protection', attuned: false }]));
    expect(within(rowFor('Cloak of Protection')).getByText(/not attuned/i)).toBeInTheDocument();
    expect(rowFor('Cloak of Protection').className).not.toContain('is-active');
  });

  it('marks it active once attuned', async () => {
    setup(withItems([{ itemId: 'cloak-of-protection', attuned: false }]));
    await userEvent.click(within(rowFor('Cloak of Protection')).getByRole('checkbox'));

    expect(rowFor('Cloak of Protection').className).toContain('is-active');
    expect(within(rowFor('Cloak of Protection')).queryByText(/not attuned/i)).not.toBeInTheDocument();
  });

  it('warns when you are attuned past your slots, and names the reason on the item', () => {
    setup(withItems([
      { itemId: 'cloak-of-protection', attuned: true },
      { itemId: 'ring-of-protection', attuned: true },
      { itemId: 'stone-of-good-luck', attuned: true },
      { itemId: 'amulet-of-health', attuned: true },
    ]));
    expect(screen.getByText(/attuned to 4 items but have 3 slots/i)).toBeInTheDocument();
    expect(within(rowFor('Amulet of Health')).getByText(/attunement slots/i)).toBeInTheDocument();
  });
});

describe('items that depend on the rest of the build', () => {
  it('explains why Bracers of Defense are inert in armor', () => {
    setup(withItems([{ itemId: 'bracers-of-defense', attuned: true }]));
    // The summary also says "no armor", so target the warning specifically.
    expect(rowFor('Bracers of Defense').querySelector('.item-warn')!.textContent).toMatch(
      /only works while wearing no armor/i,
    );
  });

  it('marks them active once the armor comes off', () => {
    setup(withItems([{ itemId: 'bracers-of-defense', attuned: true }], {
      defenses: { ...fighter().defenses, armorId: 'none', shield: false },
    }));
    expect(rowFor('Bracers of Defense').className).toContain('is-active');
  });
});

describe('what they add up to', () => {
  it('itemises the active effects', () => {
    setup(withItems([
      { itemId: 'cloak-of-protection', attuned: true },
      { itemId: 'weapon-plus-2', attuned: false },
    ]));
    expect(screen.getByText(/what they are adding/i)).toBeInTheDocument();
    expect(screen.getByText(/\+1 AC, \+1 saves/i)).toBeInTheDocument();
    expect(screen.getByText(/\+2 attack and damage/i)).toBeInTheDocument();
  });

  it('shows nothing to add up when everything is inert', () => {
    setup(withItems([{ itemId: 'cloak-of-protection', attuned: false }]));
    expect(screen.queryByText(/what they are adding/i)).not.toBeInTheDocument();
  });

  /** A custom item is a record, and the panel does not pretend otherwise. */
  it('says a custom item is recorded only', () => {
    setup(withItems([{ customName: 'Homebrew Thing', attuned: true }]));
    expect(within(rowFor('Homebrew Thing')).getByText(/recorded only/i)).toBeInTheDocument();
  });
});

/**
 * Consumables carry two fields nothing else does: how many, and what is
 * written on it. The second exists because the SRD has no "Scroll of
 * Invisibility" - it has a Spell Scroll (2nd Level), and the spell is on the
 * scroll rather than in the catalogue.
 */
describe('potions and scrolls', () => {
  it('offers a count and a detail on a scroll', () => {
    setup(withItems([{ itemId: 'spell-scroll-2nd', attuned: false }]));
    const row = rowFor('Spell Scroll (2nd Level)');
    expect(within(row).getByLabelText(/how many/i)).toBeInTheDocument();
    expect(within(row).getByPlaceholderText(/which spell/i)).toBeInTheDocument();
  });

  it('offers neither on something you wear', () => {
    // A quantity on a permanent item would invite two of a thing whose effect
    // does not stack, and the panel would then have to explain itself.
    const row = (setup(withItems([{ itemId: 'cloak-of-protection', attuned: true }])),
      rowFor('Cloak of Protection'));
    expect(within(row).queryByLabelText(/how many/i)).not.toBeInTheDocument();
  });

  it('records the spell on the scroll and shows it', async () => {
    const user = userEvent.setup();
    const view = setup(withItems([{ itemId: 'spell-scroll-2nd', attuned: false }]));

    await user.type(
      within(rowFor('Spell Scroll (2nd Level)')).getByPlaceholderText(/which spell/i),
      'Invisibility',
    );
    expect(view.build.items[0].detail).toBe('Invisibility');
    expect(within(rowFor('Spell Scroll (2nd Level)')).getByText('(Invisibility)')).toBeInTheDocument();
  });

  it('keeps a count and prints it beside the name', async () => {
    const view = setup(withItems([{ itemId: 'potion-of-healing', attuned: false }]));
    fireEvent.change(
      within(rowFor('Potion of Healing')).getByLabelText(/how many/i),
      { target: { value: '3' } },
    );
    expect(view.build.items[0].quantity).toBe(3);
    expect(within(rowFor('Potion of Healing')).getByText('×3')).toBeInTheDocument();
  });
});
