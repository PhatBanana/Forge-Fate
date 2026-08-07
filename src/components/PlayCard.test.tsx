// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlayCard } from './PlayCard';
import { deriveBuild } from '../engine/character';
import { emptyPlay, hpNow } from '../play';
import type { PlayState } from '../play';
import { fighter, wizard } from '../test/factories';
import type { Build } from '../types';

/**
 * A character in a 320px column.
 *
 * The card is a *view*, so what these check is that it shows the same numbers
 * the sheet does and writes through the same functions. A second store of hit
 * points would be the failure, and it would not announce itself - the card
 * would simply drift from the sheet over an evening.
 */

function setup(build: Build = fighter(), initial: PlayState = emptyPlay()) {
  const ctx = deriveBuild(build);
  const onPlayChange = vi.fn();
  const onPopOut = vi.fn();
  let play = initial;

  const view = render(
    <PlayCard ctx={ctx} play={play} onPlayChange={onPlayChange} onPopOut={onPopOut} />,
  );
  onPlayChange.mockImplementation((next: PlayState) => {
    play = next;
    view.rerender(
      <PlayCard ctx={ctx} play={play} onPlayChange={onPlayChange} onPopOut={onPopOut} />,
    );
  });

  return {
    ctx,
    onPopOut,
    get play() {
      return play;
    },
  };
}

const vitals = () => document.querySelector('.pcard-vitals') as HTMLElement;

describe('what it shows', () => {
  it('leads with the three numbers the next attack roll needs', () => {
    const view = setup();
    const box = within(vitals());
    expect(box.getByText('Hit points')).toBeInTheDocument();
    expect(box.getByText('Armor class')).toBeInTheDocument();
    expect(box.getByText(String(view.ctx.ac.total))).toBeInTheDocument();
    expect(box.getByText(String(view.ctx.hp.total))).toBeInTheDocument();
  });

  it('marks the saves the class is proficient in', () => {
    // Half of what a monster does is a saving throw, so which two are good is
    // the thing a DM checks before choosing a spell.
    setup(fighter());
    const proficient = [...document.querySelectorAll('.pcard-savelist .is-proficient')].map(
      (el) => el.textContent,
    );
    expect(proficient).toHaveLength(2);
    expect(proficient.join(' ')).toMatch(/STR/);
    expect(proficient.join(' ')).toMatch(/CON/);
  });

  it('lists the attack line, not the equipment', () => {
    setup();
    const attacks = document.querySelector('.pcard-attacks') as HTMLElement;
    expect(within(attacks).getByText(/greatsword/i)).toBeInTheDocument();
  });

  it('shows only the conditions actually on somebody', () => {
    // An empty list of fourteen would be most of the rail.
    setup(fighter(), emptyPlay());
    expect(document.querySelector('.pcard-conditions')).toBeNull();

    setup(fighter(), { ...emptyPlay(), conditions: ['prone'] });
    expect(screen.getByText('Prone')).toBeInTheDocument();
  });

  it('says when somebody is down', () => {
    setup(fighter(), { ...emptyPlay(), currentHp: 0 });
    expect(screen.getByText(/rolling death saves/i)).toBeInTheDocument();
  });

  it('leaves out spell lists, skills and equipment', () => {
    // The rail's job is what you need while it is *not* their turn. Everything
    // else is a click away on the sheet, and a rail that carried it would not
    // fit in a rail.
    setup(wizard());
    expect(screen.queryByText(/spell save dc/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/acrobatics/i)).not.toBeInTheDocument();
  });
});

describe('what it writes', () => {
  it('damages and heals through the same functions the sheet uses', async () => {
    const user = userEvent.setup();
    const view = setup();
    const max = view.ctx.hp.total;

    await user.type(screen.getByLabelText(/damage or healing/i), '7');
    await user.click(screen.getByRole('button', { name: /^damage$/i }));
    expect(hpNow(view.play, max)).toBe(max - 7);

    await user.type(screen.getByLabelText(/damage or healing/i), '3');
    await user.click(screen.getByRole('button', { name: /^heal$/i }));
    expect(hpNow(view.play, max)).toBe(max - 4);
  });

  it('clears the field after applying, so a number is not used twice', async () => {
    const user = userEvent.setup();
    setup();
    const field = screen.getByLabelText(/damage or healing/i) as HTMLInputElement;
    await user.type(field, '5');
    await user.click(screen.getByRole('button', { name: /^damage$/i }));
    expect(field.value).toBe('');
  });

  it('spends the same turn the sheet and the tracker read', async () => {
    // One `turn`, three windows onto it. A reaction spent here is spent
    // everywhere.
    const user = userEvent.setup();
    const view = setup();
    await user.click(screen.getByRole('button', { name: 'Reaction' }));
    expect(view.play.turn.reaction).toBe(true);

    await user.click(screen.getByRole('button', { name: /new turn/i }));
    expect(view.play.turn.reaction).toBe(false);
  });

  it('counts movement down as the tracker spends it', () => {
    const view = setup(fighter(), { ...emptyPlay(), turn: { ...emptyPlay().turn, moved: 10 } });
    const speed = view.ctx.speed.total;
    expect(within(vitals()).getByText(String(speed - 10))).toBeInTheDocument();
  });

  it('offers the full sheet rather than trying to be it', async () => {
    const user = userEvent.setup();
    const view = setup();
    await user.click(screen.getByRole('button', { name: /pop out/i }));
    expect(view.onPopOut).toHaveBeenCalled();
  });

  it('hides the pop-out when there is nowhere to pop out to', () => {
    const ctx = deriveBuild(fighter());
    render(<PlayCard ctx={ctx} play={emptyPlay()} onPlayChange={() => {}} />);
    expect(screen.queryByRole('button', { name: /pop out/i })).not.toBeInTheDocument();
  });
});
