// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TitleScreen } from './TitleScreen';

/**
 * The main menu - since §35, the app's only navigation.
 *
 * Almost all of what makes this screen worth having is what it *says* rather
 * than where it goes: which character is loaded, which campaign is being
 * played, whether a fight is still on the table, and now a live line on any
 * entry with something to report. A menu that omits those makes you press a
 * button to find out, which is the thing it exists to stop.
 */

const groups = [
  {
    name: 'Play',
    entries: [
      {
        id: 'table',
        label: 'Run a battle',
        hint: 'The map, the initiative, the dice',
        primary: true,
      },
    ],
  },
  {
    name: 'Create',
    entries: [
      { id: 'builder', label: 'Build a character', hint: 'Species, class, feats' },
      { id: 'characters', label: 'Characters', hint: 'The roster', state: '5 saved' },
    ],
  },
];

const draw = (over: Partial<Parameters<typeof TitleScreen>[0]> = {}) =>
  render(
    <TitleScreen character={null} campaign={null} groups={groups} onPick={vi.fn()} {...over} />,
  );

describe('what the menu says', () => {
  it('names the character and the campaign', () => {
    draw({ character: 'Sera', campaign: 'The Sunless Citadel' });
    expect(screen.getByText(/Sera · The Sunless Citadel/)).toBeInTheDocument();
  });

  it('names whichever one it has', () => {
    draw({ character: 'Sera' });
    expect(screen.getByText('Sera')).toBeInTheDocument();
  });

  it('says so plainly when there is nothing loaded, rather than showing a blank', () => {
    draw();
    expect(screen.getByText(/nothing loaded yet/i)).toBeInTheDocument();
  });

  it('§102: names the build in the footer - the newest section, derived', () => {
    draw();
    // Stamped by vite.config.ts from HISTORY.md's headings, never typed.
    expect(screen.getByText(/^§\d+/)).toBeInTheDocument();
  });

  it('gives every item its own line about what the place is for', () => {
    draw();
    expect(screen.getByText('The map, the initiative, the dice')).toBeInTheDocument();
    expect(screen.getByText('Species, class, feats')).toBeInTheDocument();
  });

  it('reads as three decisions: the groups are named', () => {
    draw();
    expect(screen.getByRole('heading', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Create' })).toBeInTheDocument();
  });

  it('carries live state on the lines that have something to report', () => {
    // And only on those: an entry that knows nothing shows nothing, rather
    // than an empty chip.
    draw();
    expect(screen.getByText('5 saved')).toBeInTheDocument();
    expect(document.querySelectorAll('.title-item-state').length).toBe(1);
  });

  it('is honest about where everything is kept', () => {
    draw();
    expect(screen.getByText(/kept in this browser/i)).toBeInTheDocument();
  });
});

describe('pressing one', () => {
  it('hands back the id rather than knowing what any of them mean', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    draw({ onPick });
    await user.click(screen.getByRole('button', { name: /Build a character/i }));
    expect(onPick).toHaveBeenCalledWith('builder');
  });

  it('marks the one it most wants pressed, and only that one', () => {
    draw();
    expect(document.querySelectorAll('.title-item.is-primary').length).toBe(1);
    expect(
      screen.getByRole('button', { name: /Run a battle/i }).classList.contains('is-primary'),
    ).toBe(true);
  });

  it('takes whatever the app hands it, in the order given', () => {
    draw({
      groups: [
        {
          name: 'One',
          entries: [
            { id: 'a', label: 'First', hint: 'one' },
            { id: 'b', label: 'Second', hint: 'two' },
          ],
        },
      ],
    });
    const labels = [...document.querySelectorAll('.title-item-label')].map((n) => n.textContent);
    expect(labels).toEqual(['First', 'Second']);
  });
});
