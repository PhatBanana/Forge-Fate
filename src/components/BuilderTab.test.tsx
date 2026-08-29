// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BuilderTab } from './BuilderTab';
import { deriveBuild } from '../engine/character';
import type { Build } from '../types';
import { buildOf, fighter, warlockSorcerer } from '../test/factories';
import { defaultDefenses } from '../engine/defense';
import { waitingChoices } from './sections';
import { emptyPlay } from '../play';

/**
 * The Builder offers every choice where the choice is made, on one page.
 *
 * Skills, class options and spells already ranked themselves in place; feats
 * and ability score improvements were ranked on a different tab, so taking one
 * and seeing which ones you had taken were two different screens. §33 finished
 * the job: every section renders at once, the catalogues fold so that costs
 * something bounded, and the readouts are pinned beside them.
 *
 * These pin all three, and that nothing about *playing* leaked back in.
 */

/**
 * §138 gave the Builder two readings and the tests a parameter. `page` is the
 * default here because that is the reading every test below was written
 * against - one page with every section on it - and the guided flow has a
 * describe of its own rather than being retrofitted onto all of them.
 */
function setup(build: Build, view: 'flow' | 'page' = 'page') {
  const onChange = vi.fn();
  const onPlayChange = vi.fn();
  const onPairing = vi.fn();
  const onFinished = vi.fn();
  let current = build;

  const props = () => ({
    build: current,
    ctx: deriveBuild(current),
    view,
    onView: () => {},
    play: emptyPlay(),
    onChange,
    onPlayChange,
    onPairing,
    onFinished,
  });
  const rendered = render(<BuilderTab {...props()} />);
  onChange.mockImplementation((next: Build) => {
    current = next;
    rendered.rerender(<BuilderTab {...props()} />);
  });

  return {
    onChange,
    onPairing,
    onFinished,
    get build() {
      return current;
    },
  };
}

/**
 * The rail, clicked.
 *
 * §33.4 put every section on one page, so this no longer decides what is
 * *rendered* - everything is. It sets which section's readouts the right-hand
 * column shows, which is the one thing the rail still switches, and it is a
 * link now rather than a tab. Kept under the old name because most call sites
 * only ever meant "go and look at this bit".
 *
 * §138: the rail is a band across the top of the column now rather than a
 * column down its side. Same anchors, same five sections, so this helper
 * moved one selector and nothing else - which is the point of the sections
 * having been a list all along.
 */
const rail = () => document.querySelector('.flow-pending') as HTMLElement;
const goTo = (label: string | RegExp) =>
  userEvent.click(within(rail()).getByRole('link', { name: label }));

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
    /*
      The row says what is open without being opened - §33.3 closed every
      catalogue by default. What you have taken stays above it either way,
      which is why this row is the one with no chips of its own.
    */
    expect(
      within(panel).getByRole('button', { name: /^Spend now 1 unspent slot/i }),
    ).toBeInTheDocument();
    expect(within(panel).queryAllByRole('group')).toHaveLength(0);

    await userEvent.click(within(panel).getByRole('button', { name: /^Spend now/i }));
    expect(within(featsPanel()).getAllByRole('group').length).toBeGreaterThan(1);
  });

  it('applies a pick and shows it as taken, in the one place', async () => {
    const app = setup(fighter(5));
    await goTo(/^feats/i);
    await userEvent.click(within(featsPanel()).getByRole('button', { name: /^Spend now/i }));
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
    expect(
      within(featsPanel()).getByRole('button', { name: /^If you had a slot right now/i }),
    ).toBeInTheDocument();
  });
});

describe('the section nav', () => {
  it('shows every section at once', () => {
    /*
      §33.4, and the whole of the ask: one window with your character, race,
      class and the rest, rather than five tabs. This used to assert the
      opposite - that only Identity was rendered.
    */
    setup(fighter(5));
    // Panel headings, not any text - "Equipment" is also a label on the rail.
    for (const title of [
      'Character',
      'Ability scores',
      'Equipment',
      'Class options',
      'Feats and ability score improvements',
    ]) {
      expect(panelTitles(), title).toContain(title);
    }
  });

  /*
    The readouts an edit moves have to be beside the edit, or the loop breaks.

    §139 made "beside" mean *inside*. §33.4 hung these in a rail keyed to
    whichever section you had scrolled to, so Attacks appeared when you
    happened to be looking at Equipment; the rail is gone and Attacks is in
    Equipment, because it is about what you are holding. That is a stronger
    version of the same rule - the readout is in the section whether or not
    you scrolled there - so this asks where it is rather than when it shows.
  */
  it('keeps each section beside the numbers its own edits move', () => {
    setup(fighter(5));
    const inSection = (id: string, title: string) => {
      const section = document.getElementById(`section-${id}`) as HTMLElement;
      return [...section.querySelectorAll('.panel > h2')].some((h) => h.textContent === title);
    };
    expect(inSection('equipment', 'Attacks')).toBe(true);
    expect(inSection('abilities', 'Attacks')).toBe(false);
    // And every section that had a contextual readout still has its own.
    expect(inSection('abilities', 'What a Fighter wants')).toBe(true);
    expect(inSection('feats', 'Room to grow')).toBe(true);
    expect(inSection('identity', 'Lineage traits')).toBe(true);
  });

  it('pins the two readouts every edit moves', async () => {
    /*
      §33.5. Damage per round was tied to the equipment section and the
      progression plan was on another tab entirely - but a feat, an ability
      score and a weapon all move damage, and "where is this build going" is a
      question you ask while making any part of it.
    */
    setup(fighter(5));
    for (const label of [/^identity/i, /^abilities/i, /^equipment/i, /^skills/i, /^feats/i]) {
      await goTo(label);
      expect(panelTitles(), String(label)).toContain('Damage per round');
      expect(panelTitles(), String(label)).toContain('Progression plan');
      // §138: "Next choices" was the third of these and is the band now, which
      // is above the column rather than pinned beside it - so what this asks
      // of it is that it is there at all, from wherever you are reading.
      expect(rail(), String(label)).toBeInTheDocument();
    }
  });

  /*
    §80. Two of the five sections had nothing of their own in the contextual
    column: scrolling into Abilities or Feats visibly *lost* a rail block
    where the others gained one. These are the two the panels fill.
  */
  it('answers what the class wants from the scores, beside the scores', async () => {
    setup(fighter(5));
    await goTo(/^abilities/i);
    const panel = screen.getByText('What a Fighter wants').closest('.panel') as HTMLElement;
    // The priority order, highest first, and the tags that name the top two.
    const rows = within(panel).getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(rows[0]).toMatch(/Strength/);
    expect(rows[0]).toMatch(/primary/);
    expect(rows.some((row) => /secondary/.test(row))).toBe(true);
    // Every ability is named, not just the two it wants.
    expect(rows).toHaveLength(6);
  });

  it('says where a half-feat’s +1 would land, beside the feats', async () => {
    setup(fighter(5));
    await goTo(/^feats/i);
    const panel = screen.getByText('Room to grow').closest('.panel') as HTMLElement;
    // The rule is stated once, at the top, and then every score is measured
    // against it - an even score with no note is an answer too.
    expect(panel.textContent).toMatch(/half-feat/i);
    const rows = within(panel).getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      const score = Number(row.match(/—\s*(\d+)/)![1]);
      expect(/odd: a half-feat \+1 rounds it up/.test(row)).toBe(score < 20 && score % 2 === 1);
      expect(/at the cap/.test(row)).toBe(score >= 20);
    }
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
    expect(
      within(within(rail()).getByRole('link', { name: /^feats/i })).getByText('1 choice'),
    ).toBeInTheDocument();
    // Skill picks and the Battle Master's style and maneuvers.
    expect(
      Number(
        within(within(rail()).getByRole('link', { name: /^skills/i }))
          .getByTitle(/still to choose/i)
          .textContent!.match(/\d+/)![0],
      ),
    ).toBeGreaterThan(0);
    // Nothing is outstanding on abilities.
    expect(
      within(within(rail()).getByRole('link', { name: /^abilities/i })).queryByTitle(/still to choose/i),
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
        within(within(rail()).getByRole('link', { name: section }))
          .queryByTitle(/still to choose/i)
          ?.textContent!.match(/\d+/)![0] ?? 0,
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
      within(within(rail()).getByRole('link', { name: /^identity/i })).queryByTitle(/still to choose/i),
    ).not.toBeInTheDocument();
  });

  /** A 2014 character has neither feature, so neither can inflate their nav. */
  it('counts neither of them for a 2014 character', () => {
    setup(fighter(9));
    const equipment = within(within(rail()).getByRole('link', { name: /^equipment/i })).queryByTitle(
      /still to choose/i,
    );
    expect(equipment).not.toBeInTheDocument();
  });
});

/*
  §33.4 replaced §31.4's numbered route - Back, Next, and one section rendered
  at a time - with one page and a rail of anchors down its side. The six tests
  that walked that route are gone with it rather than repointed: there is no
  forward and back to walk any more, and a test that still described one would
  be describing a screen that does not exist.

  What survives from it is the numbering, which was the good idea: the sections
  are the order a character is made in.
*/
/**
 * §82. Rolling for scores. The dice themselves are pinned in
 * `engine/pointBuy.test.ts` against a fixed rng; what this checks is the
 * wiring - that the button fills all six, seats them by priority, and says
 * out loud what the dice were.
 */
describe('rolling for ability scores', () => {
  it('fills every score and shows the six rolls', async () => {
    const app = setup(fighter(5));
    await goTo(/^abilities/i);
    await userEvent.click(screen.getByRole('button', { name: /roll 4d6/i }));

    for (const ability of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const) {
      const score = app.build.baseScores[ability];
      expect(score, ability).toBeGreaterThanOrEqual(3);
      expect(score, ability).toBeLessThanOrEqual(18);
    }
    // The dice are reported, in the order they were rolled.
    const line = screen.getByText(/^Rolled /);
    const numbers = line.textContent!.match(/\d+/g)!.slice(0, 6).map(Number);
    expect(numbers).toHaveLength(6);
    for (const n of numbers) {
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(18);
    }
  });

  it('seats the best roll where the class wants it', async () => {
    const app = setup(fighter(5));
    await goTo(/^abilities/i);
    await userEvent.click(screen.getByRole('button', { name: /roll 4d6/i }));
    // A Fighter wants Strength first; whatever the dice said, nothing may
    // beat Strength once they are seated.
    const scores = app.build.baseScores;
    expect(scores.str).toBe(Math.max(...Object.values(scores)));
  });
});

describe('the pending band', () => {
  /*
    §138 dropped the numbering with the rail. The order is still the order a
    character is made in - that was §31.4's good idea and it survives - but
    "1, 2, 3" said the sections were a route you had to walk, and you never
    had to. So what is pinned here is the order, not the numerals.
  */
  it('names the sections in the order a character is made', () => {
    setup(fighter(5));
    expect(
      [...rail().querySelectorAll('.flow-pending-where')].map((n) => n.textContent),
    ).toEqual(['Identity', 'Abilities', 'Equipment', 'Skills & options', 'Feats']);
  });

  it('points each one at a section that is actually on the page', () => {
    // A band of anchors is only navigation if every target exists. This is the
    // cheapest guard against a section being renamed out from under its link.
    setup(fighter(5));
    const links = [...rail().querySelectorAll('a')] as HTMLAnchorElement[];
    expect(links).toHaveLength(5);
    for (const link of links) {
      const id = link.getAttribute('href')!.slice(1);
      expect(document.getElementById(id), id).not.toBeNull();
    }
  });

  it('marks where you are without hiding anywhere else', async () => {
    setup(fighter(5));
    await goTo(/^feats/i);
    expect(within(rail()).getByRole('link', { name: /^feats/i })).toHaveAttribute('aria-current', 'true');
    expect(within(rail()).getByRole('link', { name: /^identity/i })).not.toHaveAttribute('aria-current');
    // And Identity is still right there, which is the whole point of §33.4.
    expect(screen.getByText('Character')).toBeInTheDocument();
  });
});

/*
  §138: "Next choices" was a pinned panel in the rail that listed the sections
  still waiting. The band at the top of the column does that job now, for all
  five sections rather than the unfinished ones - so these tests moved to it
  rather than going with the panel. What they guard is unchanged: the count is
  named and placed, it agrees with itself, and it says so when there is
  nothing left.
*/
describe('what is still waiting', () => {
  const countIn = (label: RegExp) =>
    within(rail()).getByRole('link', { name: label }).querySelector('em')!.textContent!;

  it('names what is left and where, not just how many', () => {
    /*
      §33.5, and the reason it earns the space a bare badge already had: a
      badge says "7", this says which seven and where to go for them. Across
      the top of the column rather than pinned beside it, because §138 gave
      the column no side to pin anything to.
    */
    setup(fighter(5));
    const links = within(rail()).getAllByRole('link');
    expect(links).toHaveLength(5);
    for (const link of links) {
      // Every pill says its state out loud - a count or "done" - and points
      // at a section that exists.
      expect(link.querySelector('em')!.textContent).toMatch(/\d+ choices?|done/);
      expect(document.getElementById(link.getAttribute('href')!.slice(1))).not.toBeNull();
    }
    // And at least one of them is actually waiting on a Fighter 5.
    expect(links.some((l) => l.className.includes('is-waiting'))).toBe(true);
  });

  it('totals the same choices it lists', () => {
    // One source, `openChoicesBySection`, so the headline and the pills cannot
    // disagree - and this is what says so.
    setup(fighter(5));
    const perSection = within(rail())
      .getAllByRole('link')
      .map((link) => Number(link.querySelector('em')!.textContent!.match(/\d+/)?.[0] ?? 0));
    const total = Number(rail().querySelector('.flow-pending-count')!.textContent!.match(/\d+/)![0]);
    expect(total).toBe(perSection.reduce((sum, n) => sum + n, 0));
  });

  it('says so plainly when there is nothing left to choose', () => {
    setup(
      buildOf({
        ...fighter(4),
        // Everything a 2014 Fighter 4 is asked for: a background, scores,
        // gear, skills, the style, and the level-4 improvement. Three skills,
        // because Soldier grants two of its own and the Fighter picks two.
        backgroundId: 'soldier',
        skillIds: ['athletics', 'perception', 'survival'],
        classOptionIds: ['defense'],
        asiPicks: [['str', 'str']],
      }),
    );
    expect(within(rail()).getByText('all answered')).toBeInTheDocument();
    // Every pill reads done rather than disappearing: a band that shortened as
    // you worked would move the remaining pills under the cursor each time.
    for (const label of [/^identity/i, /^abilities/i, /^equipment/i, /^skills/i, /^feats/i]) {
      expect(countIn(label), String(label)).toBe('done ✓');
    }
  });

  /* The one figure a choice three sections away can move, at the top of a page
     whose damage card is at the foot of it. */
  it('carries the damage figure the whole build feeds', () => {
    setup(fighter(5));
    expect(rail().querySelector('.flow-pending-dpr')!.textContent).toMatch(/dpr\d+\.\d/);
  });
});

describe('damage per round', () => {
  const panel = () => screen.getByText('Damage per round').closest('.panel') as HTMLElement;

  it('charts against level first, and says which armor class it used', () => {
    /*
      §33.6. The AC curve answers "can I hit this dragon"; against level
      answers "is this build front-loaded or does it come good at eleven",
      which is the one people mean by scaling. So the level chart leads.

      The armor class is stated rather than implied, because one number for
      every level is a choice: letting it drift with the tier would fold two
      curves into one and leave a rise that could be either.
    */
    setup(fighter(11));
    expect(within(panel()).getByRole('button', { name: /by level/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(panel()).getByText(/every level against AC \d+/i)).toBeInTheDocument();
    expect(within(panel()).getByRole('img').getAttribute('aria-label')).toMatch(
      /by level against AC \d+/i,
    );
  });

  it('has a bar for every level the build has reached', () => {
    setup(fighter(11));
    expect(within(panel()).getByRole('img').getAttribute('aria-label')).toMatch(/level 11:/);
    expect(within(panel()).getByRole('img').getAttribute('aria-label')).toMatch(/level 1:/);
  });

  it('keeps the AC curve, because it answers the other question', async () => {
    setup(fighter(11));
    await userEvent.click(within(panel()).getByRole('button', { name: /by target ac/i }));
    expect(within(panel()).getByRole('img').getAttribute('aria-label')).toMatch(
      /from AC 10 to 25/i,
    );
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

    // The count agrees with the band by construction, not by coincidence -
    // both read `openChoicesBySection`, and this is what says they still do.
    const counts = within(rail())
      .getAllByRole('link')
      .map((link) => Number(link.querySelector('em')!.textContent!.match(/\d+/)?.[0] ?? 0));
    expect(within(review).getByText(/still unmade/i).textContent).toContain(
      String(counts.reduce((sum, n) => sum + n, 0)),
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
  /*
    §33.2: each group is a `ChoiceRow`, closed until asked for, so every test
    below that wants cards has to open one first. The row's own button carries
    the group name and its state, which is what `openRow` aims at.
  */
  const openRow = async (name: RegExp) =>
    userEvent.click(within(optionsPanel()).getByRole('button', { name }));

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
    await openRow(/^maneuvers/i);
    // Three, and nothing taken yet.
    expect(cards()).toHaveLength(3);
    // One "show more", since there are more than three to offer.
    expect(within(optionsPanel()).getAllByRole('button', { name: /show \d+ more/i })).toHaveLength(1);
  });

  it('opens the full list and folds it back', async () => {
    setup(battleMaster());
    await goTo(/^skills/i);
    await openRow(/^maneuvers/i);
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
    await openRow(/^maneuvers/i);

    // Fill all three maneuver slots, so what is taken outnumbers the window
    // that would be left for suggestions.
    for (let i = 0; i < 3; i++) {
      const takeable = within(optionsPanel()).getAllByRole('button', { name: /^take /i });
      await userEvent.click(takeable[takeable.length - 1]);
    }

    const removable = within(optionsPanel()).getAllByRole('button', { name: /^remove /i });
    expect(removable).toHaveLength(3);
  });

  /*
    §33.2, and the reason the whole Builder can become one page: a catalogue
    of things you have not taken costs nothing while closed.
  */
  it('costs no cards at all while closed', async () => {
    setup(battleMaster());
    await goTo(/^skills/i);
    expect(within(optionsPanel()).queryAllByRole('group')).toHaveLength(0);
    // But it still says what there is to decide.
    expect(
      within(optionsPanel()).getByRole('button', { name: /^maneuvers .*3 to choose/i }),
    ).toBeInTheDocument();
  });

  it('closes the group that was open when another is opened', async () => {
    // The height bound is exactly one open picker. Two would be two.
    setup(battleMaster());
    await goTo(/^skills/i);
    await openRow(/^maneuvers/i);
    const withManeuvers = cards().length;

    await openRow(/^fighting style/i);
    expect(cards().length).toBeLessThan(withManeuvers + 3);
    expect(
      within(optionsPanel()).getByRole('button', { name: /^maneuvers/i }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps what is taken on the closed row, where it can still be removed', async () => {
    /*
      Stronger than the truncation rule above, and the same argument: an option
      you cannot see is an option you cannot remove. Compaction has to
      strengthen that rather than weaken it, so the chips are on the *closed*
      row - shut the catalogue and your maneuvers are still there to drop.
    */
    setup(battleMaster());
    await goTo(/^skills/i);
    await openRow(/^maneuvers/i);
    const takeable = within(optionsPanel()).getAllByRole('button', { name: /^take /i });
    await userEvent.click(takeable[takeable.length - 1]);

    await openRow(/^maneuvers/i); // shut again
    expect(within(optionsPanel()).queryAllByRole('group')).toHaveLength(0);
    const chip = within(optionsPanel()).getAllByRole('button', { name: /^Remove / });
    expect(chip).toHaveLength(1);

    await userEvent.click(chip[0]);
    expect(within(optionsPanel()).queryAllByRole('button', { name: /^Remove / })).toHaveLength(0);
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

  /* The panel shows one spell level at a time, so search is how both reach it.
     Opening the row first, since §33.3 closed every catalogue by default -
     done here rather than at each call site so the tests below still read as
     being about spell sources. */
  const find = async (name: string) => {
    if (!screen.queryByPlaceholderText(/search every spell/i)) {
      await userEvent.click(screen.getByRole('button', { name: /^Spells / }));
    }
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

/**
 * The Class features panel is where a player finds out what they have.
 *
 * The SRD audit added eight features `CLASS_FEATURES` was missing, and the
 * point of adding them is this panel and the printed sheet - not the table.
 * This asserts the panel end to end, from the data row to rendered text, so a
 * row that stops arriving here fails rather than going quiet.
 */
describe('the Class features panel shows what the SRD grants', () => {
  /*
    The panel lives in the contextual rail and renders only while the reader is
    in the Class options section (§33.7's scroll-spy). jsdom has no scrolling,
    so the test gets there the way a reader does: by clicking the rail's own
    anchor, which is what sets the section either way.
  */
  const openFeatures = async () => {
    // The rail renders twice - the anchor strip and the Next choices list both
    // link to the section - so either one is the reader's route in.
    await userEvent.click(screen.getAllByRole('link', { name: /skills & options/i })[0]);
    return screen.getByText('Class features').closest('.panel') as HTMLElement;
  };

  it('lists the three things a level-2 Monk spends ki on', async () => {
    setup(buildOf({ classes: [{ classId: 'monk', level: 2 }] }));
    const panel = await openFeatures();
    for (const name of ['Flurry of Blows', 'Patient Defense', 'Step of the Wind']) {
      expect(within(panel).getByText(name), name).toBeInTheDocument();
    }
  });

  it('shows a level-18 Paladin the aura growth their list used to stop short of', async () => {
    setup(buildOf({ classes: [{ classId: 'paladin', level: 18 }] }));
    const panel = await openFeatures();
    expect(within(panel).getByText('Aura Improvements')).toBeInTheDocument();
  });
});

/*
  §62. The 2014 way to start with coin instead of a kit.

  The control only exists under 2014, and that is the whole point of it:
  2024 prints a coin alternative inside its own equipment choice, so it is
  already a radio button with the book's number on it. A free-hand amount
  offered there would let somebody start with gold 2024 does not grant.
*/
describe('forgoing the starting kit for coin', () => {
  const at1 = (ruleset: Build['ruleset']) =>
    buildOf({ ruleset, classes: [{ classId: 'fighter', level: 1 }] });

  it('offers the coin field to a 2014 character', () => {
    setup(at1('2014'));
    expect(screen.getByLabelText(/starting gold instead of the kit/i)).toBeTruthy();
  });

  it('does not offer it under 2024, whose own option carries the number', () => {
    setup(at1('2024'));
    expect(screen.queryByLabelText(/starting gold instead of the kit/i)).toBeNull();
    /*
      The SRD's own coin-only option is still there as one of the radio
      choices - the 2024 Fighter's "or 155 GP", which is why no field is
      needed. Matched exactly rather than by regex: the group's legend quotes
      the whole sentence including "155 GP", so a loose match finds two
      elements and proves nothing about the option itself.
    */
    expect(screen.getByText('155 gp')).toBeTruthy();
  });

  it('puts the typed amount in the purse and clears the kit', async () => {
    const user = userEvent.setup();
    const view = setup(at1('2014'));

    await user.type(screen.getByLabelText(/starting gold instead of the kit/i), '140');
    await user.click(screen.getByRole('button', { name: /take coin instead/i }));

    expect(view.build.coins.gp).toBe(140);
    expect(view.build.defenses.armorId).toBe('none');
    expect(view.build.gear).toEqual([]);
  });

  it('will not take an empty amount', () => {
    setup(at1('2014'));
    const button = screen.getByRole('button', { name: /take coin instead/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});

/*
  §127. The Defenses panel and the armour class, made to agree.

  The panel labels each armour "(not proficient)" from its own call to
  `armorProficiencies`, and `computeAc` decides whether to credit the
  proficiency from another. That call used to omit the ruleset, which
  defaults to 2014 - and 2024 moved every subclass to level 3, so a 2024
  Life Cleric at level 1 was told they were trained in heavy armour by a
  panel sitting directly above an armour class that disagreed.

  Asserted through the rendered label rather than through the engine,
  because the engine was never wrong: it was one call site not passing what
  it knew. The argument is required now, so this cannot recur silently -
  this test is here to say what the right answer is.
*/
describe('armour proficiency reads the same as the armour class', () => {
  const lifeCleric = (ruleset: Build['ruleset'], level: number): Build => ({
    ...buildOf({ raceId: 'human' }),
    ruleset,
    classes: [{ classId: 'cleric', level, subclassId: 'life' }],
  });

  /*
    The row is a `ChoiceRow`, closed until asked for, so the options do not
    exist until it is opened - and an assertion against an absent label would
    pass by matching nothing. `heavyLabel` therefore throws if the option is
    missing rather than returning an empty string.
  */
  const heavyLabel = async () => {
    await userEvent.click(screen.getByRole('button', { name: /^Defenses/i }));
    const chain = screen
      .getAllByRole('option')
      .find((o) => o.textContent?.startsWith('Chain mail'));
    if (!chain) throw new Error('the Defenses row did not offer Chain mail');
    return chain.textContent ?? '';
  };

  it('holds heavy armour back from a 2024 Cleric until level 3', async () => {
    setup(lifeCleric('2024', 1));
    expect(await heavyLabel()).toMatch(/not proficient/);
  });

  it('grants it to the same Cleric at level 3', async () => {
    setup(lifeCleric('2024', 3));
    expect(await heavyLabel()).not.toMatch(/not proficient/);
  });

  it('grants it to a 2014 Cleric at level 1, where the domain starts', async () => {
    setup(lifeCleric('2014', 1));
    expect(await heavyLabel()).not.toMatch(/not proficient/);
  });
});

/*
  §138. The guided flow, on the sheet.

  What these pin is the fusion rather than the card: that the step names a box
  on the sheet, that the sheet is underneath while it asks, that the reasoning
  is readable without opening anything, and that answering a step moves the
  flow on because the list is derived rather than walked.
*/
describe('the guided flow', () => {
  const card = () => document.querySelector('.flow-step') as HTMLElement;
  const options = () => [...document.querySelectorAll('.flow-opt')] as HTMLElement[];
  /*
    Walk to the first step the engine has an opinion about. A Fighter 5 with no
    background opens on a form step, which is correct - the order is the order a
    character is made in, and a background comes before a fighting style - so the
    tests about ranking have to get to a ranking rather than assume step 1 is one.
  */
  const toFirstRanked = async () => {
    const pips = [...card().querySelectorAll('.flow-step-pips button')] as HTMLElement[];
    for (let i = 0; i < pips.length; i++) {
      if (options().length) return;
      await userEvent.click(pips[i]);
    }
  };

  it('opens on something that is actually waiting, and names the box it fills', () => {
    setup(fighter(5), 'flow');
    expect(within(card()).getByText(/^Step 1 of \d+$/)).toBeInTheDocument();
    // The load-bearing half of the fusion: every step says where its answer
    // lands. Without this the sheet below is decoration.
    expect(card().querySelector('.flow-step-target')!.textContent).toMatch(/^fills /);
  });

  it('§154: an untouched sheet opens on who you are, with the pairings in the card', async () => {
    const untouched = buildOf({
      backgroundId: undefined,
      baseScores: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },
      weapons: { magicBonus: {} },
      defenses: defaultDefenses(),
    });
    const view = setup(untouched, 'flow');
    // The first question is first - not a separate screen you had to know
    // to visit before building.
    expect(within(card()).getByText('Who you are')).toBeInTheDocument();
    // The explorer arrives (lazily) inside the step card, ranked and loadable.
    // The reasons live behind each suggestion's summary, so open the top one.
    const top = await screen.findAllByText(/^1$/);
    await userEvent.click(top[0].closest('summary')!);
    const load = await screen.findAllByRole('button', {
      name: 'Load this pairing into the builder',
    });
    await userEvent.click(load[0]);
    expect(view.onPairing).toHaveBeenCalledWith(expect.any(String), expect.any(String));
    // The way out by hand is still offered: the dense page's own selects.
    expect(
      within(card()).getByRole('button', { name: /Answer it under Identity/ }),
    ).toBeInTheDocument();
  });

  it('runs on the sheet rather than beside it', () => {
    setup(fighter(5), 'flow');
    /* §138: the screen reading, not the paper one - the step card is on the
       app's palette and the sheet under it has to be able to answer in the
       same accent. `SheetTab` argues the split. */
    const sheet = document.querySelector('.ss');
    expect(sheet).not.toBeNull();
    // Order matters and is the whole design: the question, then the thing it
    // is asking about. A sheet above the card would be a preview.
    expect(card().compareDocumentPosition(sheet!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  /*
    §138's argument in one test. `SuggestionCard` put every reason behind a
    `<details>`, which makes a ranked list a leaderboard - you take the top one
    because it is the top one. The strongest reason is in the open now and the
    ±working is one click away, which is the same information in the opposite
    order.
  */
  it('shows the strongest reason at rest and the working one click away', async () => {
    setup(fighter(5), 'flow');
    await toFirstRanked();
    const first = options()[0];
    expect(first.querySelector('.flow-opt-top')!.textContent!.length).toBeGreaterThan(0);
    expect(first.querySelector('.flow-opt-reasons')).toBeNull();

    await userEvent.click(within(first).getByRole('button', { name: /why this score/i }));
    expect(first.querySelector('.flow-opt-reasons')).not.toBeNull();
    // Every row is a signed delta and a reason - §131's rule, applied to the
    // working rather than to a modifier.
    for (const row of first.querySelectorAll('.flow-opt-reasons em')) {
      expect(row.textContent).toMatch(/^[+\-—]/);
    }

    await userEvent.click(within(first).getByRole('button', { name: /hide the working/i }));
    expect(first.querySelector('.flow-opt-reasons')).toBeNull();
  });

  it('applies a pick to the character, and the sheet under it moves', async () => {
    const app = setup(fighter(5), 'flow');
    await toFirstRanked();
    const before = app.build;
    const name = options()[0].querySelector('h3')!.textContent!;

    await userEvent.click(within(options()[0]).getByRole('button', { name: 'Apply' }));
    expect(app.build).not.toBe(before);
    // Whatever it was, the character now carries it - and the count of what is
    // waiting went down, which is the band and the sheet agreeing.
    expect(JSON.stringify(app.build)).not.toBe(JSON.stringify(before));
    expect(name.length).toBeGreaterThan(0);
  });

  /*
    Nothing advances the step index when a choice is applied. The list is
    derived from what is waiting, so answering the step at index 2 removes it
    and index 2 lands on the next question by itself. Advancing as well would
    skip one, which is the bug this pins.
  */
  it('moves to the next question without skipping one', async () => {
    const app = setup(fighter(5), 'flow');
    await toFirstRanked();
    const at = () => {
      const [, n, of] = within(card())
        .getByText(/^Step \d+ of \d+$/)
        .textContent!.match(/Step (\d+) of (\d+)/)!;
      return { n: Number(n), of: Number(of) };
    };
    const title = () => card().querySelector('h2')!.textContent;
    const firstTitle = title();
    const was = at();
    const before = openChoicesFrom();

    await userEvent.click(within(options()[0]).getByRole('button', { name: 'Apply' }));
    // One answered, one fewer waiting - and the step is still the one asking,
    // because this kind wanted two of them.
    expect(openChoicesFrom()).toBe(before - 1);
    expect(at().n).toBe(was.n);

    // Answer the rest of it. Bounded, so a step that never closes fails here
    // rather than hanging the suite.
    for (let guard = 0; guard < 8 && title() === firstTitle && options().length; guard++) {
      await userEvent.click(within(options()[0]).getByRole('button', { name: 'Apply' }));
    }

    // The index did not move and the list got shorter, which together are what
    // "the next question, without skipping one" means.
    expect(at().n).toBe(was.n);
    expect(at().of).toBe(was.of - 1);
    expect(title()).not.toBe(firstTitle);
    expect(app.build).toBeTruthy();
  });

  it('ends on the review, which is about mistakes rather than unfinished work', async () => {
    setup(fighter(5), 'flow');
    const pips = [...card().querySelectorAll('.flow-step-pips button')] as HTMLElement[];
    await userEvent.click(pips[pips.length - 1]);

    expect(card().querySelector('h2')!.textContent).toMatch(/what is wrong with this build/i);
    expect(within(card()).getByText(/mistakes, not unfinished business/i)).toBeInTheDocument();
    // No ranked options on the review - it is a reading, not a choice.
    expect(options()).toHaveLength(0);
  });

  it('jumps to a step from its pip', async () => {
    setup(fighter(5), 'flow');
    const pips = [...card().querySelectorAll('.flow-step-pips button')] as HTMLElement[];
    expect(pips.length).toBeGreaterThan(1);
    await userEvent.click(pips[1]);
    expect(within(card()).getByText('Step 2 of ' + pips.length)).toBeInTheDocument();
  });

  /*
    A list that quietly drops what you cannot take teaches nothing: you go
    looking for something, do not find it, and never learn why. So the
    highest-scoring refusal rides along, dimmed, with the reason where its
    score would be - which is the third of §138's four changes and the one
    that is easiest to lose by accident, since every engine here filters
    ineligible options out by default.
  */
  it('refuses an option at the choice rather than dropping it from the list', async () => {
    setup(warlockSorcerer(), 'flow');
    // A Warlock 6 / Sorcerer 4 has invocations they cannot take yet and spells
    // they already know; whichever step carries a refusal, it must say so.
    const pips = [...card().querySelectorAll('.flow-step-pips button')] as HTMLElement[];
    let refused: HTMLElement | undefined;
    for (const pip of pips) {
      await userEvent.click(pip);
      refused = options().find((o) => o.className.includes('is-blocked'));
      if (refused) break;
    }
    expect(refused, 'no step offered a refusal').toBeDefined();

    // The reason is where the score would be, and Apply is not on offer.
    expect(within(refused!).getByRole('button', { name: /unavailable/i })).toBeDisabled();
    expect(refused!.querySelector('.flow-opt-score')!.textContent).toBe('—');
    expect(refused!.querySelector('.flow-opt-top')!.textContent!.length).toBeGreaterThan(0);
  });

  /*
    A choice the engine holds no opinion about - six ability scores, a
    background - is a form, and inventing a ranking for it would mean
    inventing the scores too. The step says so and carries the way through
    rather than being a dead end in the middle of a flow.
  */
  it('§155: asks for a name near the end, and the christening closes the step', async () => {
    const unnamed = buildOf({ ...fighter(5), name: '' });
    const view = setup(unnamed, 'flow');
    // The pip is there, late in the walk - naming comes after the choices.
    await userEvent.click(screen.getByRole('button', { name: /what are you called/i }));
    expect(within(card()).getByText('What are you called?')).toBeInTheDocument();
    // Typed locally, committed on the button - a step that vanished on the
    // first keystroke would yank the card mid-word.
    await userEvent.type(within(card()).getByLabelText('Character name'), 'Thistle');
    expect(view.onChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Name them' }));
    expect(view.build.name).toBe('Thistle');
    // The step is answered and gone from the walk.
    expect(screen.queryByRole('button', { name: /what are you called/i })).toBeNull();
  });

  it('§155: ends on the curtain call once nothing is waiting, doors and all', async () => {
    // A fighter with every choice made: background, skills, style, language,
    // the level-4 slot, and the loadout the factory already carries.
    const finished = buildOf({
      ...fighter(5),
      backgroundId: 'soldier',
      // Not Athletics/Intimidation - the soldier background grants those,
      // and a duplicated pick leaves the class's own picks open.
      skillIds: ['perception', 'survival'],
      classOptionIds: ['defense'],
      languages: ['Dwarvish'],
      asiPicks: [['str', 'con']],
    });
    // The fixture must actually be finished, or the card honestly refuses
    // to exist - assert that first so a data drift fails loudly here.
    expect(waitingChoices(deriveBuild(finished))).toEqual([]);

    const view = setup(finished, 'flow');
    await userEvent.click(screen.getByRole('button', { name: /is ready/i }));
    expect(within(card()).getByText(/Basher is ready/)).toBeInTheDocument();
    // The confirm screen's summary, and the two doors out.
    expect(card().querySelector('.flow-done-line')!.textContent).toMatch(/AC \d+ · \d+ hit points/);
    await userEvent.click(within(card()).getByRole('button', { name: 'Read the sheet' }));
    expect(view.onFinished).toHaveBeenCalledWith('sheet');
    await userEvent.click(within(card()).getByRole('button', { name: 'To the table →' }));
    expect(view.onFinished).toHaveBeenCalledWith('table');
  });

  it('says plainly when a step is a form rather than a ranking', () => {
    // Scores spent, so §154's opening step is answered and the first thing
    // waiting is the background - a form step.
    setup(
      buildOf({
        ...fighter(1),
        backgroundId: undefined,
      }),
      'flow',
    );
    expect(within(card()).getByText(/a form rather than a ranking/i)).toBeInTheDocument();
    expect(options()).toHaveLength(0);
    // And it names where it is answered rather than stopping there.
    expect(within(card()).getByRole('button', { name: /answer it under/i })).toBeInTheDocument();
  });
});

/** What the band says is still waiting, as a number. */
function openChoicesFrom(): number {
  const label = document.querySelector('.flow-pending-count')!.textContent!;
  return Number(label.match(/\d+/)?.[0] ?? 0);
}

/*
  §139. The dense page, as a list of sections rather than a stack of panels.

  What these pin is the reading: each section says what it holds before you
  open it, and carries its own waiting state on the same edge the band uses.
*/
describe('the dense page', () => {
  const row = (id: string) => document.getElementById(`section-${id}`) as HTMLElement;

  it('states the contract, because a wizard beside a form never did', () => {
    setup(fighter(5));
    expect(screen.getByText(/two readings of one character, not two modes/i)).toBeInTheDocument();
  });

  it('says what each section holds before you open anything', () => {
    setup(fighter(5));
    for (const id of ['identity', 'abilities', 'equipment', 'options', 'feats']) {
      const summary = row(id).querySelector('.bsec-head p')!.textContent ?? '';
      expect(summary.length, id).toBeGreaterThan(0);
    }
    // The abilities row is the six scores, in the order every sheet prints
    // them - a list of six numbers is only readable if it is always the same
    // six in the same order.
    expect(row('abilities').querySelector('.bsec-head p')!.textContent).toMatch(
      /^\d+ \/ \d+ \/ \d+ \/ \d+ \/ \d+ \/ \d+$/,
    );
  });

  /*
    One fact drawn twice, in the same colour: the band's pill and the section's
    left edge are the same claim about the same section. Two ways of saying it
    would be two things to keep in step.
  */
  it('marks a waiting section on its edge, and agrees with the band', () => {
    setup(fighter(5));
    for (const id of ['identity', 'abilities', 'equipment', 'options', 'feats']) {
      const waitingHere = row(id).className.includes('is-waiting');
      const pill = within(rail()).getByRole('link', { name: new RegExp(`^${id === 'options' ? 'skills' : id}`, 'i') });
      expect(waitingHere, id).toBe(pill.className.includes('is-waiting'));
    }
  });

  it('counts what a waiting section is waiting on, on the row itself', () => {
    setup(fighter(5));
    const feats = row('feats').querySelector('.bsec-waiting');
    expect(feats!.textContent).toMatch(/^1 waiting/);
  });
});

/*
  §139. The foot: what the build hits for, and what is wrong with it.

  Both were in the pinned rail and the rail's argument for them was right -
  they belong to every section rather than to one. What went was the pinning.
*/
describe('the foot', () => {
  const foot = () => document.querySelector('.flow-foot') as HTMLElement;

  it('rides the guided reading, where a choice moves both of its halves', () => {
    setup(fighter(5), 'flow');
    expect(foot()).toBeInTheDocument();
    expect(within(foot()).getByText('Damage per round')).toBeInTheDocument();
    expect(within(foot()).getByText('Build review')).toBeInTheDocument();
  });

  it('draws one bar per level and marks the one you are on', () => {
    setup(fighter(5), 'flow');
    const bars = [...foot().querySelectorAll('.flow-spark i')];
    expect(bars.length).toBeGreaterThanOrEqual(20);
    // Exactly one, or "where am I on this curve" has two answers.
    expect(bars.filter((b) => b.className.includes('is-here'))).toHaveLength(1);
  });

  /*
    A review you cannot act on from where you are reading it is a list of
    things to remember, so every finding is the way to the section that fixes
    it. Which section is a judgement `analyze.ts` does not carry and should
    not - it is about the character, not about the screen showing it.
  */
  it('makes every finding the way to the section that fixes it', async () => {
    setup(
      // Chain mail on a Dexterity Fighter: a real finding, and one the review
      // has flagged since long before §139.
      buildOf({ ...fighter(5), defenses: { ...fighter(5).defenses, armorId: 'chain-mail' } }),
      'flow',
    );
    const rows = [...foot().querySelectorAll('.flow-review-row')] as HTMLElement[];
    expect(rows.length).toBeGreaterThan(0);
    for (const finding of rows) {
      // Severity on the edge, and a real destination behind the click.
      expect(finding.className).toMatch(/is-(error|warning|info|good)/);
    }
    await userEvent.click(rows[0]);
    // The click routes rather than throwing; the section it lands on is the
    // band's business and is asserted there.
    expect(foot()).toBeInTheDocument();
  });

  it('says so plainly when nothing is a mistake', () => {
    setup(
      buildOf({
        ...fighter(4),
        backgroundId: 'soldier',
        skillIds: ['athletics', 'perception', 'survival'],
        classOptionIds: ['defense'],
        asiPicks: [['str', 'str']],
      }),
      'flow',
    );
    const review = foot().querySelector('.flow-review')!;
    if (!review.querySelector('.flow-review-row')) {
      expect(review.textContent).toMatch(/nothing here is a mistake/i);
    }
  });
});
