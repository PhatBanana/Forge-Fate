// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { encodeBuild } from './share';
import { wizard } from './test/factories';
import { LEGACY_BUILD_KEY, ROSTER_KEY } from './storage';

/**
 * The app shell, and specifically the share-link landing.
 *
 * This is where the one bug that actually escaped lived: a first-time visitor
 * opening a share link was stopped and asked which ruleset they use, and the
 * fragment had already been cleared, so the shared character was simply gone.
 * The first test here is that bug, pinned.
 */

const RULESET_KEY = 'dnd-forge:ruleset-chosen';

function goTo(hash: string): void {
  window.history.replaceState(null, '', hash ? `/${hash}` : '/');
}

beforeEach(() => {
  localStorage.clear();
  goTo('');
});

describe('the ruleset prompt', () => {
  it('asks a brand-new visitor which rules they use', () => {
    render(<App />);
    expect(screen.getByText(/which rules does your table use/i)).toBeInTheDocument();
  });

  it('does not ask again once answered', () => {
    localStorage.setItem(RULESET_KEY, '2014');
    render(<App />);
    expect(screen.queryByText(/which rules does your table use/i)).not.toBeInTheDocument();
  });

  it('does not ask someone who already has a character from an older version', () => {
    localStorage.setItem(LEGACY_BUILD_KEY, JSON.stringify(wizard()));
    render(<App />);
    expect(screen.queryByText(/which rules does your table use/i)).not.toBeInTheDocument();
  });
});

describe('where to start', () => {
  /**
   * The character waiting behind the ruleset question is a fully equipped
   * Battle Master 5. That is a good demonstration and a confusing thing to be
   * handed if you came to type in the character you already have, and nothing
   * used to say which it was.
   */
  const answerRuleset = async () =>
    userEvent.click(screen.getAllByRole('button', { name: /use these rules/i })[0]);

  /*
    §31.2 put a main menu where the Builder used to be. Answering the setup
    questions now lands you on it rather than in a form, so a test that wants
    the Builder presses the Builder - which is what a person does.
  */
  const fromMenu = async (label: RegExp) =>
    userEvent.click(screen.getByRole('button', { name: label }));

  it('asks after the ruleset, and not before', async () => {
    render(<App />);
    expect(screen.queryByText(/where would you like to start/i)).not.toBeInTheDocument();

    await answerRuleset();
    expect(screen.getByText(/where would you like to start/i)).toBeInTheDocument();
  });

  it('hands over a blank sheet when that is what was asked for', async () => {
    render(<App />);
    await answerRuleset();
    await userEvent.click(screen.getByRole('button', { name: /start blank/i }));
    await fromMenu(/build a character/i);

    // Level 1, unnamed, and nothing in hand.
    expect(screen.getByRole('tab', { name: 'Builder' })).toHaveAttribute('aria-selected', 'true');
    const name = screen.getByLabelText(/^name$/i) as HTMLInputElement;
    expect(name.value).toBe('');
    expect(screen.getByText('At a glance').closest('.panel')).toHaveTextContent(/LEVEL\s*1/i);
  });

  it('keeps the example and names it, so it is never mistaken for your own', async () => {
    render(<App />);
    await answerRuleset();
    await userEvent.click(screen.getByRole('button', { name: /show me an example/i }));
    await fromMenu(/build a character/i);

    expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe('Example Fighter');
  });

  it('asks neither question of someone who has been here before', () => {
    localStorage.setItem(RULESET_KEY, '2014');
    render(<App />);
    expect(screen.queryByText(/which rules does your table use/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/where would you like to start/i)).not.toBeInTheDocument();
  });
});

describe('arriving on a share link', () => {
  /**
   * The regression. A shared build carries the rules it was built under, so
   * being handed a link is itself the answer - asking would bury the character
   * behind a question the link already settled, and the fragment is cleared on
   * read, so the character would be unrecoverable.
   */
  it('offers the character instead of asking a first-time visitor for a ruleset', () => {
    goTo(`#${encodeBuild(wizard())}`);
    render(<App />);

    expect(screen.queryByText(/which rules does your table use/i)).not.toBeInTheDocument();
    expect(screen.getByText(/someone shared ünwyn with you/i)).toBeInTheDocument();
  });

  it('clears the fragment so a refresh does not re-offer a dismissed character', () => {
    goTo(`#${encodeBuild(wizard())}`);
    render(<App />);
    expect(window.location.hash).toBe('');
  });

  it('writes nothing to the roster until the character is accepted', async () => {
    localStorage.setItem(RULESET_KEY, '2014');
    goTo(`#${encodeBuild(wizard())}`);
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: /no thanks/i }));
    expect(screen.queryByText(/someone shared/i)).not.toBeInTheDocument();

    const stored = JSON.parse(localStorage.getItem(ROSTER_KEY) ?? '{"entries":[]}');
    expect(stored.entries.some((e: { build: { name: string } }) => e.build.name === 'Ünwyn')).toBe(
      false,
    );
  });

  it('adds the character alongside your own rather than replacing them', async () => {
    localStorage.setItem(RULESET_KEY, '2014');
    goTo(`#${encodeBuild(wizard())}`);
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: /add to my characters/i }));

    const stored = JSON.parse(localStorage.getItem(ROSTER_KEY) ?? '{"entries":[]}');
    const names = stored.entries.map((e: { build: { name: string } }) => e.build.name);
    // The empty character the roster starts with is still there.
    expect(names).toContain('Ünwyn');
    expect(names.length).toBeGreaterThan(1);
  });

  it('explains a damaged link rather than failing silently', () => {
    const full = encodeBuild(wizard());
    goTo(`#${full.slice(0, full.length - 30)}`);
    render(<App />);

    expect(screen.getByText(/damaged/i)).toBeInTheDocument();
    expect(screen.queryByText(/someone shared/i)).not.toBeInTheDocument();
  });

  it('says so when a link comes from a format it does not know', () => {
    goTo('#c9.abcdef');
    render(<App />);
    expect(screen.getByText(/newer build of the app/i)).toBeInTheDocument();
  });

  it('skips both first-run questions, since the link answers them', () => {
    goTo(`#${encodeBuild(wizard())}`);
    render(<App />);
    expect(screen.queryByText(/which rules does your table use/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/where would you like to start/i)).not.toBeInTheDocument();
  });

  it('ignores a fragment that is not a share link at all', () => {
    localStorage.setItem(RULESET_KEY, '2014');
    goTo('#builder');
    render(<App />);
    expect(screen.queryByText(/someone shared/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/could not be read/i)).not.toBeInTheDocument();
  });
});

describe('undo', () => {
  it('is offered but disabled until something is edited', async () => {
    localStorage.setItem(RULESET_KEY, '2014');
    render(<App />);
    // Undo lives on the chrome above a tab, and §31.2 put the menu in front
    // of that - so this walks through it the way a person would.
    await userEvent.click(screen.getByRole('button', { name: /build a character/i }));
    expect(screen.getByRole('button', { name: /undo/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /redo/i })).toBeDisabled();
  });
});

describe('undo', () => {
  /**
   * Answering a setup question is the app writing your character, not you
   * editing it. If it landed on the history, the first thing undo would offer
   * a brand-new visitor is to reverse the choice they just made.
   */
  it('is still empty after the first-run questions are answered', async () => {
    render(<App />);
    await userEvent.click(screen.getAllByRole('button', { name: /use these rules/i })[0]);
    await userEvent.click(screen.getByRole('button', { name: /show me an example/i }));
    await userEvent.click(screen.getByRole('button', { name: /build a character/i }));

    expect(screen.getByRole('button', { name: /undo/i })).toBeDisabled();
  });
});

describe('the two modes', () => {
  /**
   * Create is the desk, Play is the table. The switch has to remember the desk:
   * a DM flipping to the battle and back should land where they left, not on
   * the Builder every time - that would make every glance at a stat block a
   * navigation chore.
   */
  it('returns from Play to the Create tab you left', async () => {
    render(<App />);
    await userEvent.click(screen.getAllByRole('button', { name: /use these rules/i })[0]);
    await userEvent.click(screen.getByRole('button', { name: /show me an example/i }));
    await userEvent.click(screen.getByRole('button', { name: /build a character/i }));

    await userEvent.click(screen.getByRole('tab', { name: 'Characters' }));
    await userEvent.click(screen.getByRole('tab', { name: /play/i }));
    // Play owns the window: the desk tabs are gone until you come back.
    expect(screen.queryByRole('tab', { name: 'Builder' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /create/i }));
    expect(screen.getByRole('tab', { name: 'Characters' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
