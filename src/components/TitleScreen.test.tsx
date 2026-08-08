// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TitleScreen } from './TitleScreen';

/**
 * The main menu.
 *
 * Almost all of what makes this screen worth having is what it *says* rather
 * than where it goes: which character is loaded, which campaign is being
 * played, and whether a fight is still on the table. A menu that omits those
 * makes you press a button to find out, which is the thing it exists to stop.
 */

const entries = [
  { id: 'table', label: 'Run a battle', hint: 'The map, the initiative, the dice', primary: true },
  { id: 'builder', label: 'Build a character', hint: 'Species, class, feats' },
];

describe('what the menu says', () => {
  it('names the character and the campaign', () => {
    render(
      <TitleScreen character="Sera" campaign="The Sunless Citadel" entries={entries} onPick={vi.fn()} />,
    );
    expect(screen.getByText(/Sera · The Sunless Citadel/)).toBeInTheDocument();
  });

  it('names whichever one it has', () => {
    render(<TitleScreen character="Sera" campaign={null} entries={entries} onPick={vi.fn()} />);
    expect(screen.getByText('Sera')).toBeInTheDocument();
  });

  it('says so plainly when there is nothing loaded, rather than showing a blank', () => {
    render(<TitleScreen character={null} campaign={null} entries={entries} onPick={vi.fn()} />);
    expect(screen.getByText(/nothing loaded yet/i)).toBeInTheDocument();
  });

  it('gives every item its own line about what the place is for', () => {
    render(<TitleScreen character={null} campaign={null} entries={entries} onPick={vi.fn()} />);
    expect(screen.getByText('The map, the initiative, the dice')).toBeInTheDocument();
    expect(screen.getByText('Species, class, feats')).toBeInTheDocument();
  });

  it('is honest about where everything is kept', () => {
    render(<TitleScreen character={null} campaign={null} entries={entries} onPick={vi.fn()} />);
    expect(screen.getByText(/kept in this browser/i)).toBeInTheDocument();
  });
});

describe('pressing one', () => {
  it('hands back the id rather than knowing what any of them mean', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<TitleScreen character={null} campaign={null} entries={entries} onPick={onPick} />);
    await user.click(screen.getByRole('button', { name: /Build a character/i }));
    expect(onPick).toHaveBeenCalledWith('builder');
  });

  it('marks the one it most wants pressed, and only that one', () => {
    render(<TitleScreen character={null} campaign={null} entries={entries} onPick={vi.fn()} />);
    expect(document.querySelectorAll('.title-item.is-primary').length).toBe(1);
    expect(
      screen.getByRole('button', { name: /Run a battle/i }).classList.contains('is-primary'),
    ).toBe(true);
  });

  it('takes whatever the app hands it, in the order given', () => {
    render(
      <TitleScreen
        character={null}
        campaign={null}
        entries={[{ id: 'a', label: 'First', hint: 'one' }, { id: 'b', label: 'Second', hint: 'two' }]}
        onPick={vi.fn()}
      />,
    );
    const labels = [...document.querySelectorAll('.title-item-label')].map((n) => n.textContent);
    expect(labels).toEqual(['First', 'Second']);
  });
});
