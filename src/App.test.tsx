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

  it('asks after the ruleset, and not before', async () => {
    render(<App />);
    expect(screen.queryByText(/where would you like to start/i)).not.toBeInTheDocument();

    await answerRuleset();
    expect(screen.getByText(/where would you like to start/i)).toBeInTheDocument();
  });

  /*
    §77: answering the second question lands you in the Builder itself - both
    answers are about building, and "show me an example" used to promise the
    damage curve and then drop you on the main menu to go find it.
  */
  it('hands over a blank sheet when that is what was asked for', async () => {
    render(<App />);
    await answerRuleset();
    await userEvent.click(screen.getByRole('button', { name: /start blank/i }));

    // Level 1, unnamed, and nothing in hand - already on the Builder.
    const name = screen.getByLabelText(/^name$/i) as HTMLInputElement;
    expect(name.value).toBe('');
    expect(screen.getByText('At a glance').closest('.panel')).toHaveTextContent(/LEVEL\s*1/i);
  });

  it('keeps the example, names it, and lands on it (§77)', async () => {
    render(<App />);
    await answerRuleset();
    await userEvent.click(screen.getByRole('button', { name: /show me an example/i }));

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
    // §77: the example answer lands straight in the Builder.
    await userEvent.click(screen.getByRole('button', { name: /show me an example/i }));

    expect(screen.getByRole('button', { name: /undo/i })).toBeDisabled();
  });
});

describe('hub and spoke', () => {
  /**
   * §35. The title screen is the only global navigation: there is no tab
   * strip to offer every destination on every screen, so a screen's one way
   * back is its wordmark chip - and the battle's, which wears no bar at all,
   * is the Menu command in its own command bar. These tests are the shape of
   * the whole design: menu to screen, screen to menu, nothing in between.
   */
  const toMenu = async () => {
    render(<App />);
    await userEvent.click(screen.getAllByRole('button', { name: /use these rules/i })[0]);
    // §77 lands the example answer in the Builder; the wordmark walks home.
    await userEvent.click(screen.getByRole('button', { name: /show me an example/i }));
    await userEvent.click(screen.getByRole('button', { name: /forge\s*&\s*fate/i }));
  };

  it('offers no second navigation on a screen - the strip is gone', async () => {
    await toMenu();
    await userEvent.click(screen.getByRole('button', { name: /build a character/i }));

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    // The bar names the screen instead, so you still know where you are.
    expect(screen.getByText('Builder')).toBeInTheDocument();
  });

  it('goes home through the wordmark chip, from any desk screen', async () => {
    await toMenu();
    await userEvent.click(screen.getByRole('button', { name: /characters & bestiary/i }));
    // The screen is a lazy chunk; wait for it rather than for luck.
    expect(await screen.findByRole('heading', { name: 'Your characters' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /forge\s*&\s*fate/i }));
    // Back on the menu: the entries are offered again.
    expect(screen.getByRole('button', { name: /build a character/i })).toBeInTheDocument();
  });

  it('goes home from the battle through the Menu command in its bar', async () => {
    await toMenu();
    await userEvent.click(screen.getByRole('button', { name: /run a battle/i }));
    // The battle is a lazy chunk: wait for its bar, then check it wears no
    // game bar - the map takes the whole window.
    const menu = await screen.findByRole('button', { name: 'Menu' });
    expect(screen.queryByRole('button', { name: /forge\s*&\s*fate/i })).not.toBeInTheDocument();

    await userEvent.click(menu);
    expect(screen.getByRole('button', { name: /run a battle/i })).toBeInTheDocument();
  });

  it('carries the theme toggle on every screen, not only the title (§78)', async () => {
    await toMenu();
    await userEvent.click(screen.getByRole('button', { name: /build a character/i }));
    expect(screen.getByRole('group', { name: /colour theme/i })).toBeInTheDocument();

    // And on the battle, whose bar has no gbar to ride.
    await userEvent.click(screen.getByRole('button', { name: /forge\s*&\s*fate/i }));
    await userEvent.click(screen.getByRole('button', { name: /run a battle/i }));
    await screen.findByRole('button', { name: 'Menu' });
    expect(screen.getByRole('group', { name: /colour theme/i })).toBeInTheDocument();
  });

  it('flips between the Builder and the sheet without a trip through the menu', async () => {
    await toMenu();
    await userEvent.click(screen.getByRole('button', { name: /build a character/i }));
    await userEvent.click(screen.getByRole('button', { name: /character sheet →/i }));
    expect(await screen.findByText(/saving throws/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /edit in builder/i }));
    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
  });
});

/**
 * §86. The narrow gate.
 *
 * jsdom applies no media queries, so what a component test can pin is the
 * contract's other half: the gate's markup rides with exactly the two board
 * screens, and never with a player screen. Whether it is *visible* is the
 * ≤480 CSS block's decision, and run86 checks that in a real browser at both
 * widths.
 */
describe('the narrow gate (§86)', () => {
  const toMenu = async () => {
    render(<App />);
    await userEvent.click(screen.getAllByRole('button', { name: /use these rules/i })[0]);
    await userEvent.click(screen.getByRole('button', { name: /show me an example/i }));
    await userEvent.click(screen.getByRole('button', { name: /forge\s*&\s*fate/i }));
  };
  const gate = () => document.querySelector('.narrow-gate');

  it('rides with the battle, naming it and the way back', async () => {
    await toMenu();
    await userEvent.click(screen.getByRole('button', { name: /run a battle/i }));
    await screen.findByRole('button', { name: 'Menu' });

    expect(gate()).toBeInTheDocument();
    expect(gate()!.textContent).toMatch(/battle screen wants a tablet or wider/i);
    // Nothing is lost - the one sentence that stops "broken app" panic.
    expect(gate()!.textContent).toMatch(/nothing is lost/i);

    await userEvent.click(screen.getByRole('button', { name: /back to the menu/i }));
    expect(screen.getByRole('button', { name: /run a battle/i })).toBeInTheDocument();
  });

  it('rides with the dungeon workshop, with its own words', async () => {
    await toMenu();
    await userEvent.click(screen.getByRole('button', { name: /^dungeons/i }));
    await screen.findByRole('button', { name: 'Pillar' });
    expect(gate()!.textContent).toMatch(/dungeon workshop wants a tablet or wider/i);
  });

  it('stays off the player screens, which work at phone widths', async () => {
    await toMenu();
    await userEvent.click(screen.getByRole('button', { name: /build a character/i }));
    expect(gate()).not.toBeInTheDocument();
  });
});
