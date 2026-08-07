// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BestiaryTab } from './BestiaryTab';
import type { Monster } from '../data/monsters';
import { isCustom } from '../bestiary';

/**
 * The workshop.
 *
 * Two promises are worth pinning, and both are the sort that fail quietly.
 *
 * The first is that copying leaves the original alone. A DM who edits their
 * reskinned bandit and finds the SRD's has changed too has lost the reference
 * they were working from, and would only notice weeks later.
 *
 * The second is that an edit is *saved*, not held in a draft. There is no save
 * button here, on purpose - so a field that changed the screen without changing
 * the store would look exactly like a field that worked.
 */

function setup(initial: Monster[] = []) {
  const onChange = vi.fn();
  let saved = initial;

  const view = render(<BestiaryTab saved={saved} onChange={onChange} />);
  onChange.mockImplementation((next: Monster[]) => {
    saved = next;
    view.rerender(<BestiaryTab saved={saved} onChange={onChange} />);
  });

  return {
    get saved() {
      return saved;
    },
  };
}

/**
 * Find a row by name.
 *
 * Searching first rather than scrolling: the list is capped at forty, and forty
 * alphabetical stat blocks is still inside the dragons. The SRD chunk is
 * fetched, so the box is empty for a tick before any of this works.
 */
const findRow = async (name: string) => {
  const user = userEvent.setup();
  const box = screen.getByRole('searchbox');
  await user.clear(box);
  await user.type(box, name);
  const row = await screen.findByText(name, { selector: '.mon-list b' });
  return row.closest('li') as HTMLElement;
};

const copy = async (name: string) => {
  const user = userEvent.setup();
  await user.click(within(await findRow(name)).getByRole('button', { name: /^copy/i }));
};

describe('finding one', () => {
  it('searches your monsters and the SRD in one list, yours first', async () => {
    setup();
    await copy('Bandit');
    await findRow('Bandit');

    const names = [...document.querySelectorAll('.mon-list b')].map((el) => el.textContent);
    expect(names[0]).toBe('Bandit (copy)');
    expect(names).toContain('Bandit');
    expect(names).toContain('Bandit Captain');
  });

  it('says which store every row came from', async () => {
    setup();
    await copy('Bandit');
    const mine = within(await findRow('Bandit (copy)')).getByText('Yours');
    const theirs = within(await findRow('Bandit')).getByText('SRD');
    expect(mine).toBeInTheDocument();
    expect(theirs).toBeInTheDocument();
  });
});

describe('copying', () => {
  it('leaves the SRD block exactly as it was', async () => {
    const user = userEvent.setup();
    const view = setup();
    await copy('Goblin');

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Harbour thug');

    // One record in the store, and it is the copy - the SRD block is not in
    // this store at all, which is the strongest form of "untouched".
    expect(view.saved).toHaveLength(1);
    expect(view.saved[0].name).toBe('Harbour thug');
    expect(isCustom(view.saved[0].id)).toBe(true);
    expect(await findRow('Goblin')).toBeInTheDocument();
  });

  it('names a second copy so the two are told apart', async () => {
    const view = setup();
    await copy('Goblin');
    await copy('Goblin');
    expect(view.saved.map((m) => m.name)).toEqual(['Goblin (copy)', 'Goblin (copy 2)']);
  });
});

describe('editing', () => {
  it('writes every change straight through, with no save button', async () => {
    const user = userEvent.setup();
    const view = setup();
    await copy('Goblin');

    const ac = screen.getByLabelText('Armor class');
    await user.clear(ac);
    await user.type(ac, '18');
    expect(view.saved[0].ac).toBe(18);

    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
  });

  it('moves experience and proficiency with the challenge rating', async () => {
    // A DM who raises a bandit to CR 3 and is still told it is worth 200 XP has
    // been handed a wrong number by this app rather than by the books.
    const user = userEvent.setup();
    const view = setup();
    await copy('Bandit');
    await user.selectOptions(screen.getByLabelText('Rating'), '3');

    expect(view.saved[0].cr).toBe(3);
    expect(view.saved[0].xp).toBe(700);
    expect(view.saved[0].proficiencyBonus).toBe(2);
  });

  it('drops a speed set to nought rather than printing "burrow 0 ft."', async () => {
    const user = userEvent.setup();
    const view = setup();
    await copy('Goblin');

    const walk = screen.getByLabelText('walk');
    await user.clear(walk);
    await user.type(walk, '0');
    expect(view.saved[0].speed.walk).toBeUndefined();
  });

  it('says so when the hit dice are not dice it can roll', async () => {
    // The tracker offers to roll a monster's hit points from this string, and
    // falling back to the average without a word would look like it worked.
    const user = userEvent.setup();
    setup();
    await copy('Goblin');

    const dice = screen.getByLabelText('Hit dice');
    await user.clear(dice);
    await user.type(dice, '2d6 plus a bit');
    expect(screen.getByText(/not dice this app can roll/i)).toBeInTheDocument();
  });

  it('keeps the numbers the damage model reads editable beside the prose', async () => {
    // Prose-only editing would let a DM double a club's damage in the text and
    // then be told the fight is easy, which is a wrong answer rather than a
    // missing one.
    const user = userEvent.setup();
    const view = setup();
    await copy('Goblin');

    const damage = screen.getAllByLabelText('Damage')[0];
    await user.clear(damage);
    await user.type(damage, '2d6+4');
    expect(view.saved[0].actions[0].damage?.[0].dice).toBe('2d6+4');
  });

  it('shows the stat block beside the fields that change it', async () => {
    const user = userEvent.setup();
    setup();
    await copy('Goblin');
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Snagfang');

    // The card's own h3, not the "Actions" headings below it.
    await waitFor(() =>
      expect(document.querySelector('.mc h3')).toHaveTextContent('Snagfang'),
    );
  });
});

describe('as a file', () => {
  const asFile = (body: unknown) =>
    new File([JSON.stringify(body)], 'bestiary.json', { type: 'application/json' });

  it('loads a bestiary without a character attached to it', async () => {
    const user = userEvent.setup();
    const view = setup();
    await user.upload(
      screen.getByLabelText(/open a bestiary/i),
      asFile({ monsters: [{ id: 'custom:a', name: 'Harbour thug' }] }),
    );

    await waitFor(() => expect(view.saved.map((m) => m.name)).toEqual(['Harbour thug']));
    expect(screen.getByText('1 loaded.')).toBeInTheDocument();
  });

  it('updates rather than duplicates when the same file is opened twice', async () => {
    // Matched by id, so a DM re-importing their own export gets their bestiary
    // back rather than two of everything.
    const user = userEvent.setup();
    const view = setup();
    const file = () => asFile({ monsters: [{ id: 'custom:a', name: 'Harbour thug' }] });

    await user.upload(screen.getByLabelText(/open a bestiary/i), file());
    await waitFor(() => expect(view.saved).toHaveLength(1));
    await user.upload(screen.getByLabelText(/open a bestiary/i), file());
    await waitFor(() => expect(screen.getByText('1 loaded.')).toBeInTheDocument());
    expect(view.saved).toHaveLength(1);
  });

  it('says so rather than throwing when the file is something else', async () => {
    const user = userEvent.setup();
    const view = setup();
    await user.upload(
      screen.getByLabelText(/open a bestiary/i),
      new File(['not json at all'], 'notes.json', { type: 'application/json' }),
    );
    await waitFor(() =>
      expect(screen.getByText(/not a bestiary this app wrote/i)).toBeInTheDocument(),
    );
    expect(view.saved).toEqual([]);
  });
});

describe('deleting', () => {
  it('asks before it deletes, and only deletes yours', async () => {
    const user = userEvent.setup();
    const view = setup();
    await copy('Goblin');

    // The SRD rows offer no delete at all: there is nothing there to delete.
    expect(within(await findRow('Goblin')).queryByRole('button', { name: /^delete/i })).toBeNull();

    const row = await findRow('Goblin (copy)');
    await user.click(within(row).getByRole('button', { name: /delete goblin \(copy\)/i }));
    await user.click(within(row).getByRole('button', { name: /keep/i }));
    expect(view.saved).toHaveLength(1);

    await user.click(within(row).getByRole('button', { name: /delete goblin \(copy\)/i }));
    await user.click(within(row).getByRole('button', { name: /really delete/i }));
    expect(view.saved).toHaveLength(0);
  });
});
