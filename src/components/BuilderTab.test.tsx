// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BuilderTab } from './BuilderTab';
import { deriveBuild } from '../engine/character';
import type { Build } from '../types';
import { buildOf, fighter } from '../test/factories';

/**
 * The Builder offers every choice where the choice is made, one section at a
 * time.
 *
 * Skills, class options and spells already ranked themselves in place; feats
 * and ability score improvements were ranked on another tab, so taking one and
 * seeing which ones you had taken were two different screens. These pin that
 * they are now one panel, that the sections show only their own panels, and
 * that nothing about playing leaked back in.
 */

function setup(build: Build) {
  const onChange = vi.fn();
  let current = build;

  const view = render(<BuilderTab build={current} ctx={deriveBuild(current)} onChange={onChange} />);
  onChange.mockImplementation((next: Build) => {
    current = next;
    view.rerender(<BuilderTab build={current} ctx={deriveBuild(current)} onChange={onChange} />);
  });

  return {
    onChange,
    get build() {
      return current;
    },
  };
}

const goTo = (label: string | RegExp) =>
  userEvent.click(screen.getByRole('tab', { name: label }));

const panelTitles = () =>
  [...document.querySelectorAll('.panel > h2')].map((h) => h.textContent);

const featsPanel = () =>
  screen.getByText('Feats and ability score improvements').closest('.panel') as HTMLElement;

describe('feats and ability score improvements', () => {
  it('offers the ranked picks in the same panel as the ones already taken', async () => {
    // A Fighter 5 has reached one improvement at level 4 and spent none.
    setup(fighter(5));
    await goTo(/^feats/i);
    const panel = featsPanel();
    expect(within(panel).getByText(/spend now — 1 unspent slot/i)).toBeInTheDocument();
    expect(within(panel).getAllByRole('group').length).toBeGreaterThan(1);
  });

  it('applies a pick and shows it as taken, in the one place', async () => {
    const app = setup(fighter(5));
    await goTo(/^feats/i);
    const take = within(featsPanel()).getAllByRole('button', { name: /^take /i })[0];
    const label = take.textContent!.replace(/^Take /, '');

    await userEvent.click(take);

    expect(app.build.featIds.length + app.build.asiPicks.length).toBe(1);
    // The chip for what was just taken is in the same panel as the button was.
    expect(within(featsPanel()).getByText(new RegExp(label.split(' ')[0], 'i'))).toBeInTheDocument();
  });

  it('previews the next level-up once nothing is unspent', async () => {
    // A Fighter 3 has not reached an improvement yet.
    setup(fighter(3));
    await goTo(/^feats/i);
    expect(within(featsPanel()).getByText(/if you had a slot right now/i)).toBeInTheDocument();
  });
});

describe('the section nav', () => {
  it('opens on Identity and shows only that section', () => {
    setup(fighter(5));
    expect(screen.getByText('Character')).toBeInTheDocument();
    expect(screen.queryByText('Ability scores')).not.toBeInTheDocument();
    expect(screen.queryByText('Feats and ability score improvements')).not.toBeInTheDocument();
  });

  /** The readouts an edit moves have to be beside the edit, or the loop breaks. */
  it('keeps each section beside the numbers its own edits move', async () => {
    setup(fighter(5));

    await goTo(/^equipment/i);
    expect(screen.getByText('Attacks')).toBeInTheDocument();
    expect(screen.getByText('Damage per round')).toBeInTheDocument();

    await goTo(/^abilities/i);
    expect(panelTitles()).not.toContain('Damage per round');
  });

  it('keeps At a glance and the build review on every section', async () => {
    setup(fighter(5));
    for (const label of [/^identity/i, /^abilities/i, /^equipment/i, /^skills/i, /^feats/i]) {
      await goTo(label);
      expect(screen.getByText('At a glance')).toBeInTheDocument();
      expect(screen.getByText('Build review')).toBeInTheDocument();
    }
  });

  /**
   * The badge is the reason for having a nav rather than five headings: it
   * says where work is left without making you scroll the tab to find out.
   */
  it('badges the sections that still have a choice to make', () => {
    setup(fighter(5));
    // One unspent improvement, reached at Fighter 4. A plain Human grants no
    // free origin feat, so that is the whole count.
    expect(within(screen.getByRole('tab', { name: /^feats/i })).getByText('1')).toBeInTheDocument();
    // Skill picks and the Battle Master's style and maneuvers.
    expect(
      Number(within(screen.getByRole('tab', { name: /^skills/i })).getByTitle(/still to choose/i).textContent),
    ).toBeGreaterThan(0);
    // Nothing is outstanding on abilities.
    expect(
      within(screen.getByRole('tab', { name: /^abilities/i })).queryByTitle(/still to choose/i),
    ).not.toBeInTheDocument();
  });

  /**
   * Both of these went uncounted for several phases, so a 2024 Fighter could
   * carry six unspent weapon masteries and three points of unassigned ability
   * increase with every badge on the nav reading zero.
   */
  it('counts the two things only a 2024 character has', () => {
    const badge = (section: RegExp) =>
      Number(
        within(screen.getByRole('tab', { name: section })).queryByTitle(/still to choose/i)
          ?.textContent ?? 0,
      );

    const soldier = buildOf({
      ...fighter(9),
      ruleset: '2024',
      raceId: 'human-2024',
      backgroundId: 'soldier-2024',
      backgroundAsi: { mode: '2+1', picks: [] },
    });
    setup(soldier);
    const equipmentOpen = badge(/^equipment/i);
    const identityOpen = badge(/^identity/i);
    // Four mastery slots at Fighter 9, none taken.
    expect(equipmentOpen).toBeGreaterThanOrEqual(4);
    // The background's +2 and +1, both unassigned.
    expect(identityOpen).toBe(2);
  });

  it('stops counting them once they are assigned', () => {
    setup(
      buildOf({
        ...fighter(9),
        ruleset: '2024',
        raceId: 'human-2024',
        backgroundId: 'soldier-2024',
        backgroundAsi: { mode: '2+1', picks: ['str', 'con'] },
        masteryIds: ['greatsword', 'longsword', 'handaxe', 'battleaxe'],
      }),
    );
    expect(
      within(screen.getByRole('tab', { name: /^identity/i })).queryByTitle(/still to choose/i),
    ).not.toBeInTheDocument();
  });

  /** A 2014 character has neither feature, so neither can inflate their nav. */
  it('counts neither of them for a 2014 character', () => {
    setup(fighter(9));
    const equipment = within(screen.getByRole('tab', { name: /^equipment/i })).queryByTitle(
      /still to choose/i,
    );
    expect(equipment).not.toBeInTheDocument();
  });
});

/*
  §31.4 turned the five sections into a numbered route with Back and Next,
  without taking away the ability to jump between them - a returning player
  editing one thing must not have to walk past four screens to reach it.
*/
describe('the creation route', () => {
  it('numbers the steps in the order a character is made', () => {
    setup(fighter(5));
    const numbers = [...document.querySelectorAll('.step-n')].map((n) => n.textContent);
    expect(numbers).toEqual(['1', '2', '3', '4', '5']);
  });

  it('walks forward, and the button says where it is going', async () => {
    const user = userEvent.setup();
    setup(fighter(5));
    await user.click(screen.getByRole('button', { name: /^Abilities ›/ }));
    expect(screen.getByRole('tab', { name: /^abilities/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('walks back, and the button says where that is too', async () => {
    const user = userEvent.setup();
    setup(fighter(5));
    await user.click(screen.getByRole('button', { name: /^Abilities ›/ }));
    await user.click(screen.getByRole('button', { name: /^‹ Identity/ }));
    expect(screen.getByRole('tab', { name: /^identity/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('offers no Back from the first step', () => {
    setup(fighter(5));
    expect(screen.queryByRole('button', { name: /^‹/ })).toBeNull();
  });

  /*
    Nothing is submitted at the end. The character has been saved the whole way
    down, and a "Finish" implying otherwise would be a lie about how this app
    works.
  */
  it('says the route is over rather than pretending there is a sixth step', async () => {
    const user = userEvent.setup();
    setup(fighter(5));
    await user.click(screen.getByRole('tab', { name: /^feats/i }));
    expect(screen.getByText(/already saved/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /›$/ })).toBeNull();
  });

  it('still lets you jump straight to a step', async () => {
    const user = userEvent.setup();
    setup(fighter(5));
    await user.click(screen.getByRole('tab', { name: /^feats/i }));
    expect(screen.getByText('Feats and ability score improvements')).toBeInTheDocument();
  });
});

describe('what the Builder no longer carries', () => {
  it('has no play tracking on it', () => {
    setup(fighter(5));
    expect(screen.queryByText(/^in play$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /short rest/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/current hit points/i)).not.toBeInTheDocument();
  });
});

describe('the build review', () => {
  /**
   * The regression this fixes: nine findings on a character nobody had
   * touched, six of which were "you have not filled this in yet". A panel that
   * cries wolf on an untouched sheet is a panel you learn to skip.
   */
  it('reports mistakes and leaves unmade choices to the section badges', () => {
    setup(fighter(5));
    const review = screen.getByText('Build review').closest('.panel') as HTMLElement;

    // Not a mistake: an unspent slot is what the Feats badge counts.
    expect(within(review).queryByText(/unspent ASI or feat slot/i)).not.toBeInTheDocument();
    expect(within(review).queryByText(/skill proficiencies not chosen/i)).not.toBeInTheDocument();
    // A real one: chain mail throws away two points of this Fighter's Dexterity.
    expect(within(review).getByText(/doing nothing/i)).toBeInTheDocument();
    // And it says the open choices exist without listing them.
    expect(within(review).getByText(/still unmade/i)).toBeInTheDocument();

    // The count agrees with the badges by construction, not by coincidence.
    const badges = screen
      .getAllByRole('tab')
      .map((tab) => Number(tab.querySelector('.badge')?.textContent ?? 0));
    expect(within(review).getByText(/still unmade/i).textContent).toContain(
      String(badges.reduce((sum, n) => sum + n, 0)),
    );
  });

  /** The lineage verdict is on screen already, in more detail, right above. */
  it('does not repeat the lineage fit panel', () => {
    setup(fighter(5));
    const review = screen.getByText('Build review').closest('.panel') as HTMLElement;
    expect(within(review).queryByText(/top-tier|weak fit/i)).not.toBeInTheDocument();
  });
});

describe('at a glance', () => {
  /**
   * The regression this replaces: armor class and hit points had panels of
   * their own, one section away from the strip showing the same two figures,
   * so a number and its arithmetic were never on screen together.
   */
  it('explains a figure where the figure is, on any section', async () => {
    setup(fighter(5));
    expect(panelTitles()).not.toContain('Armor class');
    expect(panelTitles()).not.toContain('Hit points');

    const glance = screen.getByText('At a glance').closest('.panel') as HTMLElement;
    await userEvent.click(within(glance).getByRole('button', { name: /armor class/i }));
    // The source line, the base-AC line and the Stealth note all name the
    // armor, which is itself the point: the explanation is right there.
    expect(within(glance).getAllByText(/chain mail/i).length).toBeGreaterThan(0);
    expect(within(glance).getByText('Total')).toBeInTheDocument();
  });

  it('shows one breakdown at a time, and closes the one you reopen', async () => {
    setup(fighter(5));
    const glance = screen.getByText('At a glance').closest('.panel') as HTMLElement;
    const ac = within(glance).getByRole('button', { name: /armor class/i });
    const hp = within(glance).getByRole('button', { name: /hit points/i });

    await userEvent.click(ac);
    expect(ac).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(hp);
    expect(ac).toHaveAttribute('aria-expanded', 'false');
    expect(hp).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(hp);
    expect(hp).toHaveAttribute('aria-expanded', 'false');
  });

  /** A figure with nothing to explain should not pretend to be a button. */
  it('leaves initiative alone', () => {
    setup(fighter(5));
    const glance = screen.getByText('At a glance').closest('.panel') as HTMLElement;
    expect(within(glance).queryByRole('button', { name: /initiative/i })).not.toBeInTheDocument();
  });
});

describe('class options', () => {
  const optionsPanel = () => screen.getByText('Class options').closest('.panel') as HTMLElement;
  const cards = () => within(optionsPanel()).getAllByRole('group');

  /** Two groups at once - a fighting style and three maneuvers. */
  const battleMaster = () =>
    buildOf({
      name: 'Duelist',
      classes: [{ classId: 'fighter', level: 5, subclassId: 'battle-master' }],
      baseScores: { str: 15, dex: 14, con: 14, int: 10, wis: 10, cha: 8 },
    });

  /**
   * The regression: a Battle Master picking a fighting style and three
   * maneuvers was shown sixteen ranked cards for two decisions.
   */
  it('shows the best three of each group, not all of them', async () => {
    setup(battleMaster());
    await goTo(/^skills/i);
    // Two groups of three, and nothing taken yet.
    expect(cards()).toHaveLength(6);
    // One "show more" per group, since both have more than three to offer.
    expect(within(optionsPanel()).getAllByRole('button', { name: /show \d+ more/i })).toHaveLength(2);
  });

  it('opens the full list and folds it back', async () => {
    setup(battleMaster());
    await goTo(/^skills/i);
    const before = cards().length;

    await userEvent.click(
      within(optionsPanel()).getAllByRole('button', { name: /show \d+ more/i })[0],
    );
    expect(cards().length).toBeGreaterThan(before);

    await userEvent.click(within(optionsPanel()).getByRole('button', { name: /show fewer/i }));
    expect(cards()).toHaveLength(before);
  });

  /** An option you cannot see is an option you cannot remove. */
  it('never truncates what is already taken', async () => {
    setup(battleMaster());
    await goTo(/^skills/i);

    // Fill all three maneuver slots, so what is taken outnumbers the window
    // that would be left for suggestions.
    for (let i = 0; i < 3; i++) {
      const takeable = within(optionsPanel()).getAllByRole('button', { name: /^take /i });
      await userEvent.click(takeable[takeable.length - 1]);
    }

    const removable = within(optionsPanel()).getAllByRole('button', { name: /^remove /i });
    expect(removable).toHaveLength(3);
  });
});

/**
 * Which class taught a spell decides the DC it is cast at, and only a
 * multiclass caster with two casting abilities has a question to answer.
 */
describe('which class a spell was learned as', () => {
  const clericWizard = (overrides: Partial<Build> = {}) =>
    buildOf({
      name: 'Two Books',
      classes: [
        { classId: 'cleric', level: 5, subclassId: 'life' },
        { classId: 'wizard', level: 5, subclassId: 'evocation' },
      ],
      // WIS 14 is DC 14; INT 20 is DC 17.
      baseScores: { str: 10, dex: 12, con: 14, int: 20, wis: 14, cha: 8 },
      spellIds: ['toll-the-dead', 'fireball'],
      ...overrides,
    });

  /* The panel shows one spell level at a time, so search is how both reach it. */
  const find = async (name: string) => {
    const box = screen.getByPlaceholderText(/search every spell/i);
    await userEvent.clear(box);
    await userEvent.type(box, name);
    return screen
      .getByText(name, { selector: '.suggestion summary strong' })
      .closest('.suggestion')!
      .parentElement!.querySelector('.spell-source');
  };

  it('offers the choice only for a spell both classes could have taught', async () => {
    setup(clericWizard());
    await goTo(/^skills/i);
    // Toll the Dead is on both lists; Fireball is the Wizard's alone.
    expect(await find('Toll the Dead')).not.toBeNull();
    expect(await find('Fireball')).toBeNull();
  });

  it('records the pick, and defaults to the better DC', async () => {
    const view = setup(clericWizard());
    await goTo(/^skills/i);
    const chooser = (await find('Toll the Dead')) as HTMLElement;
    // Unrecorded, the card has to agree with what the sheet assumes: the best.
    expect(within(chooser).getByText(/Wizard/).className).toContain('is-on');
    expect(within(chooser).getByText(/Cleric/).className).not.toContain('is-on');

    await userEvent.click(within(chooser).getByText(/Cleric/));
    expect(view.build.spellSources?.['toll-the-dead']).toBe('cleric');
  });

  it('says nothing to a single-class caster', async () => {
    setup(
      buildOf({
        classes: [{ classId: 'wizard', level: 9, subclassId: 'evocation' }],
        baseScores: { str: 8, dex: 14, con: 14, int: 20, wis: 12, cha: 10 },
        spellIds: ['fire-bolt', 'fireball'],
      }),
    );
    await goTo(/^skills/i);
    expect(document.querySelector('.spell-source')).toBeNull();
  });
});

describe('going up a level', () => {
  /**
   * The panel is an explanation, not a wizard. These pin that it appears on a
   * real level-up, stays quiet for everything else, and does not stand between
   * anyone and the level field.
   */
  const levelField = () => screen.getByLabelText('Level') as HTMLInputElement;
  /*
    One change event, not a clear and a retype. Typing goes through the field
    a character at a time and the control clamps an empty box to 1, so
    `clear()` then `type('6')` is really 5 -> 1 -> 6 - two steps, neither of
    them the one under test, and the second of them not a level-up at all.
  */
  const setLevel = (level: string) =>
    fireEvent.change(levelField(), { target: { value: level } });
  const levelPanel = () =>
    (document.querySelector('.levelup')?.closest('.panel') as HTMLElement | null) ?? null;

  it('says nothing until the level moves', () => {
    setup(fighter());
    expect(levelPanel()).toBeNull();
  });

  it('reports the step and what it is waiting on', () => {
    const view = setup(fighter()); // a level 5 Champion
    setLevel('6');

    const panel = levelPanel()!;
    expect(panel).not.toBeNull();
    expect(within(panel).getByText(/Fighter 5 → 6/)).toBeInTheDocument();
    // Level 6 is a Fighter ASI level, so it owes one.
    expect(within(panel).getByText(/ability score improvement/i)).toBeInTheDocument();
    expect(view.build.classes[0].level).toBe(6);
  });

  it('always leads with the hit points, which every level gives', () => {
    setup(fighter());
    setLevel('6');
    const first = levelPanel()!.querySelector('.levelup li b')!;
    expect(first.textContent).toMatch(/^\+\d+ hit points$/);
  });

  it('rolls this level’s hit die and keeps the result', async () => {
    const user = userEvent.setup();
    const view = setup(fighter());
    setLevel('6');

    await user.click(within(levelPanel()!).getByRole('button', { name: /Roll a d10 instead/ }));
    expect(view.build.defenses.hpMode).toBe('rolled');
    // Five entries for levels 2 through 6, the last of them just rolled.
    const rolls = view.build.defenses.rolledHitDice!;
    expect(rolls).toHaveLength(5);
    expect(rolls[4]).toBeGreaterThanOrEqual(1);
    expect(rolls[4]).toBeLessThanOrEqual(10);
    // And the line says so, rather than still claiming the fixed average -
    // the wording follows the character's current mode, not the one it had
    // when the level changed.
    expect(within(levelPanel()!).getByText(/Rolled a \d+ on the d10/)).toBeInTheDocument();
    expect(within(levelPanel()!).queryByText(/fixed average/)).toBeNull();
  });

  it('can be dismissed without touching the character', async () => {
    const user = userEvent.setup();
    const view = setup(fighter());
    setLevel('6');
    const before = view.build;

    await user.click(within(levelPanel()!).getByRole('button', { name: /Dismiss|Done/ }));
    expect(levelPanel()).toBeNull();
    expect(view.build).toBe(before);
  });

  it('says nothing when a level is typed over rather than stepped', () => {
    // Entering a character you already have is not levelling one up, and a
    // report of seven levels at once would be noise.
    setup(fighter());
    setLevel('12');
    expect(levelPanel()).toBeNull();
  });

  it('leaves the number field alone', () => {
    // The wizard is an alternative, not a gate: typing still works, including
    // typing downwards.
    const view = setup(fighter());
    setLevel('4');
    expect(view.build.classes[0].level).toBe(4);
    expect(levelPanel()).toBeNull();
  });
});
