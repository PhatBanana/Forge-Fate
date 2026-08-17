// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CharactersTab } from './CharactersTab';
import type { Roster } from '../storage';
import { fighter, rosterOf, wizard } from '../test/factories';

/**
 * The roster, and the operations that act on a whole character.
 *
 * Duplicate carries the most weight: because the Builder writes every edit
 * straight through, copying first is the only way to try an idea safely, so it
 * has to leave the original untouched and hand you the copy.
 */

function setup(initial: Roster) {
  const onEdit = vi.fn();
  const onChange = vi.fn();
  const onPrint = vi.fn();
  const onImport = vi.fn();
  const say = vi.fn();
  let roster = initial;

  const props = () => ({
    roster,
    onChange,
    say,
    onEdit,
    onPrint,
    onImport,
    // The bestiary is a different store with its own tests; these are about the
    // roster, and an empty one keeps them about that.
    bestiary: [],
    onBestiaryChange: () => {},
  });
  const view = render(<CharactersTab {...props()} />);
  onChange.mockImplementation((next: Roster) => {
    roster = next;
    view.rerender(<CharactersTab {...props()} />);
  });

  return { onEdit, onChange, onPrint, onImport, say, get roster() { return roster; } };
}

/** The occasional actions live behind the row's ⋯ button. */
const openMenu = async (name: string) =>
  userEvent.click(within(rowFor(name)).getByRole('button', { name: /^more for/i }));

const rows = () => screen.getAllByRole('textbox', { name: /character name/i });
const rowFor = (name: string) =>
  rows().find((input) => (input as HTMLInputElement).value === name)!.closest('.roster-row') as HTMLElement;

describe('the list', () => {
  it('shows every character with what they are and their headline numbers', () => {
    setup(rosterOf(fighter(), wizard()));

    expect(rows().map((r) => (r as HTMLInputElement).value)).toEqual(['Basher', 'Ünwyn']);
    expect(screen.getByText(/Human Fighter 5/)).toBeInTheDocument();
    expect(within(rowFor('Basher')).getByText(/^AC \d+$/)).toBeInTheDocument();
    expect(within(rowFor('Basher')).getByText(/hp$/)).toBeInTheDocument();
    expect(within(rowFor('Basher')).getByText(/dpr$/)).toBeInTheDocument();
  });

  it('marks which character the Builder is editing', () => {
    setup(rosterOf(fighter(), wizard()));
    expect(rowFor('Basher').className).toContain('is-active');
    expect(rowFor('Ünwyn').className).not.toContain('is-active');

    // The active one offers Edit; the others offer Switch to.
    expect(within(rowFor('Basher')).getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    expect(within(rowFor('Ünwyn')).getByRole('button', { name: /switch to/i })).toBeInTheDocument();
  });

  it('switches which character is active and jumps to the Builder', async () => {
    const app = setup(rosterOf(fighter(), wizard()));
    await userEvent.click(within(rowFor('Ünwyn')).getByRole('button', { name: /switch to/i }));

    expect(app.roster.activeId).toBe(app.roster.entries[1].id);
    expect(app.onEdit).toHaveBeenCalled();
  });

  it('renames in place', async () => {
    const app = setup(rosterOf(fighter()));
    await userEvent.type(rows()[0], '!');
    expect(app.roster.entries[0].build.name).toBe('Basher!');
  });
});

describe('duplicate', () => {
  it('leaves the original alone and makes the copy active', async () => {
    const app = setup(rosterOf(fighter()));
    await openMenu('Basher');
    await userEvent.click(screen.getByRole('menuitem', { name: /duplicate/i }));

    const names = app.roster.entries.map((e) => e.build.name);
    expect(names).toEqual(['Basher', 'Basher (copy)']);
    expect(app.roster.entries.find((e) => e.id === app.roster.activeId)!.build.name).toBe(
      'Basher (copy)',
    );
  });

  it('starts the copy on a fresh session rather than inheriting spent resources', async () => {
    const roster = rosterOf(fighter());
    roster.entries[0].play = { ...roster.entries[0].play, currentHp: 3, pactSpent: 1 };

    const app = setup(roster);
    await openMenu('Basher');
    await userEvent.click(screen.getByRole('menuitem', { name: /duplicate/i }));

    const copy = app.roster.entries.find((e) => e.build.name === 'Basher (copy)')!;
    expect(copy.play.currentHp).toBeNull();
    expect(copy.play.pactSpent).toBe(0);
  });
});

describe('delete', () => {
  it('asks before removing anything', async () => {
    const app = setup(rosterOf(fighter(), wizard()));
    await openMenu('Ünwyn');
    await userEvent.click(screen.getByRole('menuitem', { name: /^delete$/i }));

    expect(app.roster.entries).toHaveLength(2);
    expect(screen.getByRole('button', { name: /really delete/i })).toBeInTheDocument();
  });

  it('can be backed out of', async () => {
    const app = setup(rosterOf(fighter(), wizard()));
    await openMenu('Ünwyn');
    await userEvent.click(screen.getByRole('menuitem', { name: /^delete$/i }));
    await userEvent.click(screen.getByRole('button', { name: /keep/i }));

    expect(app.roster.entries).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /really delete/i })).not.toBeInTheDocument();
  });

  it('removes once confirmed', async () => {
    const app = setup(rosterOf(fighter(), wizard()));
    await openMenu('Ünwyn');
    await userEvent.click(screen.getByRole('menuitem', { name: /^delete$/i }));
    await userEvent.click(screen.getByRole('button', { name: /really delete/i }));

    expect(app.roster.entries.map((e) => e.build.name)).toEqual(['Basher']);
  });
});

describe('compare', () => {
  it('is not offered when there is only one character', () => {
    setup(rosterOf(fighter()));
    expect(screen.queryByText(/^Compare$/)).not.toBeInTheDocument();
  });

  it('offers only the characters that are not already the active one', () => {
    setup(rosterOf(fighter(), wizard()));
    const chips = screen.getAllByRole('button', { name: /^(Basher|Ünwyn)$/ });
    expect(chips.map((c) => c.textContent)).toEqual(['Ünwyn']);
  });

  it('shows the two side by side once one is picked', async () => {
    setup(rosterOf(fighter(), wizard()));
    await userEvent.click(screen.getByRole('button', { name: 'Ünwyn' }));

    expect(screen.getByText('Armor class')).toBeInTheDocument();
    expect(screen.getByText(/damage across the range/i)).toBeInTheDocument();
  });
});

describe('the sheet button', () => {
  it('asks the app to show the sheet', async () => {
    const app = setup(rosterOf(fighter()));
    await userEvent.click(within(rowFor('Basher')).getByRole('button', { name: /^sheet$/i }));
    expect(app.onPrint).toHaveBeenCalled();
  });

  /**
   * The sheet always shows the active character, so opening someone else's has
   * to switch to them first - otherwise the button silently shows the wrong
   * character's hit points.
   */
  it('switches to a character that is not active before showing it', async () => {
    const app = setup(rosterOf(fighter(), wizard()));
    const before = app.roster.activeId;

    await userEvent.click(within(rowFor('Ünwyn')).getByRole('button', { name: /^sheet$/i }));

    expect(app.roster.activeId).not.toBe(before);
    expect(app.onPrint).toHaveBeenCalled();
  });
});

describe('the bestiary', () => {
  it('is a section here, because a monster you made is a thing you keep', async () => {
    setup(rosterOf(fighter()));
    await userEvent.click(screen.getByRole('tab', { name: /bestiary/i }));
    expect(
      screen.getByRole('searchbox', { name: /search your monsters and the bestiary/i }),
    ).toBeInTheDocument();
  });
});

describe('import and export', () => {
  it('is a section of this tab rather than one of its own', async () => {
    setup(rosterOf(fighter()));
    await userEvent.click(screen.getByRole('tab', { name: /import \/ export/i }));
    expect(screen.getByText(/import from d&d beyond/i)).toBeInTheDocument();
  });
});

describe('the row menu', () => {
  /**
   * Five buttons a row is a wall by the sixth character, and four of the five
   * are things you do occasionally rather than every visit.
   */
  it('keeps only the two everyday actions on the row', () => {
    setup(rosterOf(fighter(), wizard()));
    const row = within(rowFor('Basher'));

    expect(row.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    expect(row.getByRole('button', { name: /^sheet$/i })).toBeInTheDocument();
    expect(row.queryByRole('button', { name: /duplicate/i })).not.toBeInTheDocument();
    expect(row.queryByRole('button', { name: /share/i })).not.toBeInTheDocument();
    expect(row.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
  });

  /**
   * The menu drops over the row beneath it, covering that row's own buttons.
   * Without something to swallow it, a click aimed at the next character's ⋯
   * lands on "Copy share link" instead.
   */
  it('closes on a click outside rather than letting it through', async () => {
    setup(rosterOf(fighter(), wizard()));
    await openMenu('Basher');
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await userEvent.click(document.querySelector('.menu-backdrop') as HTMLElement);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  /**
   * §83, and a real defect rather than a gap: the acknowledgement for this
   * used to be a label flip on the menu item itself - inside
   * `{menuFor === entry.id && ...}`, while the same click ran
   * `setMenuFor(null)`. The menu unmounted before the flip could render, so
   * nobody ever saw it, and no test caught it because none asserted a thing
   * that was never visible. It says so out loud now.
   */
  it('says the link was copied, somewhere the closed menu is not', async () => {
    const clipboard = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: clipboard } });

    const app = setup(rosterOf(fighter(), wizard()));
    await openMenu('Basher');
    await userEvent.click(screen.getByRole('menuitem', { name: /copy share link/i }));

    expect(clipboard).toHaveBeenCalledOnce();
    // The menu is gone, which is exactly why the news cannot live in it.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(app.say).toHaveBeenCalledWith(expect.stringMatching(/link copied/i));
  });

  it('closes on Escape', async () => {
    setup(rosterOf(fighter(), wizard()));
    await openMenu('Basher');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  /** Delete asks on the row, not in the menu, so the question cannot be missed. */
  it('moves the confirmation onto the row', async () => {
    setup(rosterOf(fighter(), wizard()));
    await openMenu('Ünwyn');
    await userEvent.click(screen.getByRole('menuitem', { name: /^delete$/i }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(
      within(rowFor('Ünwyn')).getByRole('button', { name: /really delete/i }),
    ).toBeInTheDocument();
  });
});

/* §85: the tablist rule lives in `useRovingTabs.test.tsx`. This is the one
   assertion that says this row is actually wired to it. */
describe('the sections tablist', () => {
  it('answers the arrow key its role promises', async () => {
    const user = userEvent.setup();
    setup(rosterOf(fighter()));
    await user.click(screen.getByRole('tab', { name: /your characters/i }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /bestiary/i })).toHaveAttribute('aria-selected', 'true');
  });
});
