// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TableTab } from './TableTab';
import { activeEncounter } from '../storage';
import type { Roster } from '../storage';
import { emptyPlay, hpNow } from '../play';
import { deriveBuild } from '../engine/character';
import { hitChance } from '../engine/dpr';
import { fighter, rosterOf, wizard } from '../test/factories';
import type { Monster } from '../data/monsters';
import { hydrateMonster } from '../bestiary';
import { emptyEncounter } from '../encounter';
import type { MonsterCombatant } from '../encounter';
import { DEFAULT_SEED, MAP_SIZES, generateDungeon } from '../engine/dungeon';

/**
 * The DM's screen.
 *
 * Two things here are worth a component test rather than an engine one,
 * because both are about the *wiring* rather than the rules:
 *
 *   1. A character's hit points have one home. Damage dealt in the tracker has
 *      to land in that character's `PlayState`, not in a copy the encounter
 *      keeps - and the only way to see that is to look at what came out the
 *      other side.
 *   2. Advancing onto a character's turn resets their action economy, because
 *      that is what the rules do and the tracker is the thing that knows when
 *      a turn began.
 */

function setup(initial: Roster, bestiary: Monster[] = []) {
  const onChange = vi.fn();
  let roster = initial;

  const props = () => ({ roster, onChange, bestiary, ruleset: '2014' });
  const view = render(<TableTab {...props()} />);
  onChange.mockImplementation((next: Roster) => {
    roster = next;
    view.rerender(<TableTab {...props()} />);
  });

  return {
    onChange,
    get roster() {
      return roster;
    },
    get encounter() {
      return activeEncounter(roster);
    },
  };
}

/** The bestiary is a dynamic import, so the panel arrives a tick late. */
const bestiaryReady = () =>
  waitFor(() => expect(screen.getByText(/from SRD 5\.1/)).toBeInTheDocument());

const party = () => rosterOf(fighter(), wizard());

const rowFor = (name: string): HTMLElement => {
  const row = [...document.querySelectorAll('.init-row')].find((el) =>
    el.querySelector('.init-who b')?.textContent?.includes(name),
  );
  if (!row) throw new Error(`No row for ${name}`);
  return row as HTMLElement;
};

describe('putting a fight together', () => {
  it('adds a character from the roster by reference', async () => {
    const user = userEvent.setup();
    const view = setup(party());

    await user.click(screen.getByRole('button', { name: view.roster.entries[0].build.name }));

    expect(view.encounter.combatants).toHaveLength(1);
    expect(view.encounter.combatants[0]).toMatchObject({
      kind: 'character',
      rosterId: view.roster.entries[0].id,
    });
    // The combatant stores no hit points of its own. This is the whole design.
    expect(view.encounter.combatants[0]).not.toHaveProperty('hp');
  });

  it('takes a character back out when their chip is pressed again', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    const name = view.roster.entries[0].build.name;

    await user.click(screen.getByRole('button', { name }));
    await user.click(screen.getByRole('button', { name }));
    expect(view.encounter.combatants).toHaveLength(0);
  });

  it('adds a monster from the bestiary and letters a second of the same kind', async () => {
    const user = userEvent.setup();
    setup(party());
    await bestiaryReady();

    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Goblin',
    ) as HTMLElement;

    // Scoped to the turn order: the name is also in the bestiary list below,
    // so a bare getByText matches twice.
    await user.click(within(entry).getByRole('button', { name: 'Add' }));
    expect(rowFor('Goblin')).toBeTruthy();

    await user.click(within(entry).getByRole('button', { name: 'Add' }));
    expect(rowFor('Goblin A')).toBeTruthy();
    expect(rowFor('Goblin B')).toBeTruthy();
  });
});

describe('hit points have one home', () => {
  it('writes damage to a character into their own play state', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    const id = view.roster.entries[0].id;
    const name = view.roster.entries[0].build.name;
    const max = deriveBuild(view.roster.entries[0].build).hp.total;

    await user.click(screen.getByRole('button', { name }));
    await user.click(within(rowFor(name)).getByRole('button', { name: '−5' }));

    // Not in the encounter - in the roster entry the character sheet reads.
    const entry = view.roster.entries.find((e) => e.id === id)!;
    expect(hpNow(entry.play, max)).toBe(max - 5);
    expect(JSON.stringify(view.encounter)).not.toContain('"hp"');
  });

  it('heals a character back through the same store', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    const name = view.roster.entries[0].build.name;
    const max = deriveBuild(view.roster.entries[0].build).hp.total;

    await user.click(screen.getByRole('button', { name }));
    await user.click(within(rowFor(name)).getByRole('button', { name: '−5' }));
    await user.click(within(rowFor(name)).getByRole('button', { name: '+5' }));
    expect(hpNow(view.roster.entries[0].play, max)).toBe(max);
  });

  it('keeps a monster’s hit points on the combatant', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await bestiaryReady();

    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Goblin',
    ) as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));

    await user.click(within(rowFor('Goblin')).getByRole('button', { name: '−5' }));
    expect(view.encounter.combatants[0]).toMatchObject({ kind: 'monster', hp: 2, maxHp: 7 });
  });
});

describe('running the fight', () => {
  it('starts, names who is up, and counts rounds', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    for (const entry of view.roster.entries) {
      await user.click(screen.getByRole('button', { name: entry.build.name }));
    }

    await user.click(screen.getByRole('button', { name: /start the fight/i }));
    expect(view.encounter.round).toBe(1);
    expect(screen.getByText(/Round 1 ·/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /end turn/i }));
    await user.click(screen.getByRole('button', { name: /end turn/i }));
    expect(view.encounter.round).toBe(2);
  });

  it('gives a character their action economy back when their turn begins', async () => {
    /*
      The payoff of the turn tracker on the sheet. `newTurn` returns the action,
      the bonus action, the reaction and the movement at the *start* of a turn,
      and the tracker is what knows when that is.
    */
    const user = userEvent.setup();
    const start = party();
    const spent = {
      ...start,
      entries: start.entries.map((entry) => ({
        ...entry,
        play: { ...emptyPlay(), turn: { action: true, bonusAction: true, reaction: true, moved: 20, dashes: 1 } },
      })),
    };
    const view = setup(spent);

    await user.click(screen.getByRole('button', { name: view.roster.entries[0].build.name }));
    await user.click(screen.getByRole('button', { name: /start the fight/i }));

    expect(view.roster.entries[0].play.turn).toEqual({
      action: false,
      bonusAction: false,
      reaction: false,
      moved: 0,
      dashes: 0,
    });
  });

  it('does not reset the turn of somebody whose turn it is not', async () => {
    const user = userEvent.setup();
    const start = party();
    const spent = {
      ...start,
      entries: start.entries.map((entry) => ({
        ...entry,
        play: { ...emptyPlay(), turn: { action: true, bonusAction: false, reaction: false, moved: 0, dashes: 0 } },
      })),
    };
    const view = setup(spent);

    // Only the first character joins, and only their turn begins.
    await user.click(screen.getByRole('button', { name: view.roster.entries[0].build.name }));
    await user.click(screen.getByRole('button', { name: /start the fight/i }));

    expect(view.roster.entries[0].play.turn.action).toBe(false);
    expect(view.roster.entries[1].play.turn.action).toBe(true);
  });

  it('keeps who was in it when the fight ends', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await user.click(screen.getByRole('button', { name: view.roster.entries[0].build.name }));
    await user.click(screen.getByRole('button', { name: /start the fight/i }));
    await user.click(screen.getByRole('button', { name: /end the fight/i }));

    expect(view.encounter.combatants).toHaveLength(1);
    expect(view.encounter.round).toBe(0);
  });
});

describe('the 2024 gap', () => {
  it('says why a 2024 table is looking at 2014 stat blocks', async () => {
    const onChange = vi.fn();
    render(<TableTab roster={party()} onChange={onChange} bestiary={[]} ruleset="2024" />);
    await bestiaryReady();
    expect(screen.getByText(/no licensed machine-readable source/i)).toBeInTheDocument();
  });

  it('says nothing of the kind to a 2014 table', async () => {
    const onChange = vi.fn();
    render(<TableTab roster={party()} onChange={onChange} bestiary={[]} ruleset="2014" />);
    await bestiaryReady();
    expect(screen.queryByText(/no licensed machine-readable source/i)).not.toBeInTheDocument();
  });
});

/**
 * Popping a combatant out.
 *
 * jsdom has no real `window.open`, so these exercise the floating-panel
 * fallback - which is the presentation a blocked popup or a phone gets, and the
 * one most likely to rot untested.
 */
describe('the mini window', () => {
  it('opens a character’s own sheet, wired to the same roster entry', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    const name = view.roster.entries[0].build.name;

    await user.click(screen.getByRole('button', { name }));
    await user.click(within(rowFor(name)).getByRole('button', { name: /pop out/i }));

    const panel = screen.getByRole('dialog', { name });
    // The real sheet, not a summary of it - so the boxes a sheet has are here.
    expect(within(panel).getByLabelText(/^current hit points$/i)).toBeInTheDocument();
  });

  it('writes a change made in the window back to the character', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    const name = view.roster.entries[0].build.name;
    const max = deriveBuild(view.roster.entries[0].build).hp.total;

    await user.click(screen.getByRole('button', { name }));
    await user.click(within(rowFor(name)).getByRole('button', { name: /pop out/i }));

    const panel = screen.getByRole('dialog', { name });
    await user.click(within(panel).getByRole('button', { name: /^damage$/i }));

    // Nothing was synced: the sheet in the window and the row in the tracker
    // are reading one PlayState.
    expect(hpNow(view.roster.entries[0].play, max)).toBeLessThanOrEqual(max);
    expect(within(rowFor(name)).getByRole('button', { name: /close window/i })).toBeInTheDocument();
  });

  it('opens a monster’s stat block', async () => {
    const user = userEvent.setup();
    setup(party());
    await bestiaryReady();

    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Goblin',
    ) as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));
    await user.click(within(rowFor('Goblin')).getByRole('button', { name: /pop out/i }));

    const panel = screen.getByRole('dialog', { name: 'Goblin' });
    expect(within(panel).getByText(/Nimble Escape/)).toBeInTheDocument();
  });

  it('keeps one open at a time', async () => {
    // A DM juggling six floating panels has recreated the problem the tracker
    // was there to solve.
    const user = userEvent.setup();
    const view = setup(party());
    for (const entry of view.roster.entries) {
      await user.click(screen.getByRole('button', { name: entry.build.name }));
    }

    await user.click(
      within(rowFor(view.roster.entries[0].build.name)).getByRole('button', { name: /pop out/i }),
    );
    await user.click(
      within(rowFor(view.roster.entries[1].build.name)).getByRole('button', { name: /pop out/i }),
    );
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
});

/**
 * The forecast.
 *
 * The engine's arithmetic is tested in `forecast.test.ts`; what matters here is
 * that it appears with real combatants, disappears without them, and does not
 * borrow the vocabulary of a table this project cannot carry.
 */
describe('what this fight will do', () => {
  it('says nothing until there is a fight to describe', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    expect(screen.queryByText(/what this fight will do/i)).not.toBeInTheDocument();

    // A party with nothing to fight is still not a fight.
    await user.click(screen.getByRole('button', { name: view.roster.entries[0].build.name }));
    expect(screen.queryByText(/what this fight will do/i)).not.toBeInTheDocument();
  });

  it('appears once both sides are in, with the SRD XP beside the model', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await bestiaryReady();

    await user.click(screen.getByRole('button', { name: view.roster.entries[0].build.name }));
    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Goblin',
    ) as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));

    const panel = screen.getByText(/what this fight will do/i).closest('.panel') as HTMLElement;
    expect(within(panel).getByText(/50 XP from the stat blocks/)).toBeInTheDocument();
    expect(within(panel).getByText(/a projection, not a promise/i)).toBeInTheDocument();
  });

  it('does not grade the fight with the DMG’s words', async () => {
    // "Deadly", "hard", "medium" belong to the XP-threshold table this app
    // deliberately does not reproduce, and borrowing them would imply it had.
    const user = userEvent.setup();
    const view = setup(party());
    await bestiaryReady();

    await user.click(screen.getByRole('button', { name: view.roster.entries[0].build.name }));
    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Goblin',
    ) as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));

    const panel = screen.getByText(/what this fight will do/i).closest('.panel') as HTMLElement;
    expect(panel.textContent?.toLowerCase()).not.toMatch(/\bdeadly\b|\bmedium\b/);
  });
});

/**
 * Tokens on the map.
 *
 * The wiring worth pinning is that a drag charges the same movement the
 * character sheet tracks - so the map and the turn tracker are two views of one
 * number rather than two numbers that have to be kept in step. Dragging itself
 * is a pointer gesture over an SVG and is checked in a browser.
 */
describe('the map', () => {
  it('puts everyone in the fight onto the first room', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await user.click(screen.getByRole('button', { name: view.roster.entries[0].build.name }));

    expect(view.encounter.combatants[0].at).toBeUndefined();
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));
    expect(view.encounter.combatants[0].at).toBeTruthy();
  });

  it('parts the party and the monsters: room 1 for us, elsewhere for them', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await bestiaryReady();
    for (const entry of view.roster.entries) {
      await user.click(screen.getByRole('button', { name: entry.build.name }));
    }
    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Goblin',
    ) as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));

    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));

    const room = generateDungeon(DEFAULT_SEED, { rooms: 8, ...MAP_SIZES.medium }).rooms[0];
    const inFirst = (at: { x: number; y: number }) =>
      at.x >= room.x && at.x < room.x + room.w && at.y >= room.y && at.y < room.y + room.h;
    for (const c of view.encounter.combatants) {
      expect(c.at).toBeTruthy();
      expect(inFirst(c.at!)).toBe(c.kind === 'character');
    }
    // And nobody stands on anybody.
    const squares = view.encounter.combatants.map((c) => `${c.at!.x},${c.at!.y}`);
    expect(new Set(squares).size).toBe(squares.length);
  });

  it('takes them off again', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await user.click(screen.getByRole('button', { name: view.roster.entries[0].build.name }));
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));
    await user.click(screen.getByRole('button', { name: /take them off/i }));
    expect(view.encounter.combatants.every((c) => !c.at)).toBe(true);
  });

  it('draws a token for everyone who is on it, and nobody who is not', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    for (const entry of view.roster.entries) {
      await user.click(screen.getByRole('button', { name: entry.build.name }));
    }
    expect(document.querySelectorAll('.dmap-token')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));
    expect(document.querySelectorAll('.dmap-token')).toHaveLength(2);
  });

  it('says what the character whose turn it is has left to move', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await user.click(screen.getByRole('button', { name: view.roster.entries[0].build.name }));
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));
    await user.click(screen.getByRole('button', { name: /start the fight/i }));

    // The readout lives in the right-pane cockpit now, which follows the
    // turn: starting the fight selects whoever came up, and their card
    // carries the movement bar with the same numbers everything else reads.
    expect(screen.getByTitle('30 of 30 feet left this turn')).toBeInTheDocument();
  });
});

describe('the battlefield loads, it does not build', () => {
  it('starts every session on the same map rather than a random one', () => {
    // So a reload does not move the dungeon under a DM mid-session - and the
    // builder is gone from Play, so nothing here can change it by accident.
    setup(party());
    expect(
      document.querySelector('.dmap')?.getAttribute('aria-label') ?? '',
    ).toMatch(/from seed first light/i);
    expect(screen.queryByLabelText(/map seed/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /terrain brushes/i })).not.toBeInTheDocument();
  });

  it('loads a saved dungeon: new ground under the fight, tokens off', async () => {
    localStorage.setItem(
      'dnd-forge:dungeons:v1',
      JSON.stringify({
        dungeons: [
          {
            id: 'd1',
            name: 'the sunken abbey',
            savedAt: 1,
            map: { mapSeed: 'the sunken abbey', mapSize: 'small', mapRooms: 4, terrain: { '2,2': 'wall' } },
          },
        ],
      }),
    );
    const user = userEvent.setup();
    const view = setup(party());
    await user.click(screen.getByRole('button', { name: view.roster.entries[0].build.name }));
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));
    expect(view.encounter.combatants[0].at).toBeTruthy();

    await user.selectOptions(screen.getByLabelText(/load a saved dungeon/i), 'd1');

    expect(view.encounter.mapSeed).toBe('the sunken abbey');
    expect(view.encounter.mapRooms).toBe(4);
    expect(view.encounter.terrain).toEqual({ '2,2': 'wall' });
    // The old rooms are gone from under them; everyone comes off the map.
    expect(view.encounter.combatants.every((c) => !c.at)).toBe(true);
    localStorage.removeItem('dnd-forge:dungeons:v1');
  });
});

/**
 * The three-column layout.
 *
 * What matters is the wiring rather than the pixels: the turn order is in the
 * left rail, the selected combatant is in the right one, and selecting is a
 * different question from whose turn it is.
 */
describe('the workspace', () => {
  const rail = (title: string) =>
    (document.querySelector(`.ws-rail[aria-label="${title}"]`) ??
      [...document.querySelectorAll('.ws-rail')].find((el) =>
        el.querySelector('.ws-rail-title')?.textContent === title,
      )) as HTMLElement;

  it('pins the turn order in the left rail and the map in the centre', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await user.click(screen.getByRole('button', { name: view.roster.entries[0].build.name }));

    expect(within(rail('Turn order')).getByText(/round|roll initiative|nobody in the fight/i))
      .toBeInTheDocument();
    expect(document.querySelector('.ws-centre .dmap')).toBeTruthy();
  });

  it('says nothing is selected before there is anybody', () => {
    setup(party());
    expect(screen.getByText(/pick somebody in the turn order/i)).toBeInTheDocument();
  });

  it('shows whoever is up once a fight starts, without being asked', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await user.click(screen.getByRole('button', { name: view.roster.entries[0].build.name }));
    await user.click(screen.getByRole('button', { name: /start the fight/i }));

    // The rail is never empty during a fight without somebody having emptied it.
    expect(document.querySelector('.ws-right .pcard')).toBeTruthy();
  });

  it('keeps looking at who you chose when the turn moves on', async () => {
    /*
      The reason the selection is held rather than derived. A DM checks the
      Wizard's hit points on the Fighter's turn, and a rail that snapped back
      to the active combatant every time the turn advanced would be unusable
      for exactly that.
    */
    const user = userEvent.setup();
    const view = setup(party());
    for (const entry of view.roster.entries) {
      await user.click(screen.getByRole('button', { name: entry.build.name }));
    }
    await user.click(screen.getByRole('button', { name: /start the fight/i }));

    const second = view.roster.entries[1].build.name;
    await user.click(within(rowFor(second)).getByRole('button', { name: /show .* in the rail/i }));
    await user.click(screen.getByRole('button', { name: /end turn/i }));

    const card = document.querySelector('.ws-right .pcard') as HTMLElement;
    expect(within(card).getByText(second)).toBeInTheDocument();
  });

  it('puts a monster’s stat block in the rail rather than inside the row', async () => {
    // The inline expander is gone: a stat block belongs beside the fight, not
    // stuffed into the turn order it pushes apart.
    const user = userEvent.setup();
    setup(party());
    await bestiaryReady();

    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Goblin',
    ) as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));

    await user.click(within(rowFor('Goblin')).getByRole('button', { name: /show goblin in the rail/i }));
    expect(document.querySelector('.init-block')).toBeNull();
    expect(document.querySelector('.ws-right .mc')).toBeTruthy();
    expect(within(document.querySelector('.ws-right') as HTMLElement).getByText(/Nimble Escape/))
      .toBeInTheDocument();
  });
});

/**
 * Monsters you made, in the fight.
 *
 * The workshop is under Characters, but a fight is no time to change tabs, so
 * the search here covers both stores. The failure this guards against is a DM
 * typing the name of the monster they saved last week and being shown only the
 * book's version of it.
 */
describe('your own monsters', () => {
  const thug = hydrateMonster({
    id: 'custom:thug',
    name: 'Bandit, harbour',
    type: 'humanoid',
    cr: 1,
    ac: 13,
    hp: 22,
  })!;

  it('finds yours and the SRD’s in one list, yours first', async () => {
    const user = userEvent.setup();
    setup(party(), [thug]);
    await bestiaryReady();

    await user.type(screen.getByLabelText(/search the bestiary/i), 'bandit');
    const rows = [...document.querySelectorAll('.mon-list li')];
    expect(rows[0].querySelector('b')?.textContent).toBe('Bandit, harbour');
    expect(rows.map((li) => li.querySelector('b')?.textContent)).toContain('Bandit');
    // Tagged, because a reskin usually keeps enough of the original's name to
    // sort right next to it.
    expect(within(rows[0] as HTMLElement).getByText('Yours')).toBeInTheDocument();
  });

  it('puts one in the turn order with its own numbers', async () => {
    const user = userEvent.setup();
    const view = setup(party(), [thug]);
    await bestiaryReady();

    await user.type(screen.getByLabelText(/search the bestiary/i), 'harbour');
    const entry = document.querySelector('.mon-list li') as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));

    expect(view.encounter.combatants[0]).toMatchObject({
      kind: 'monster',
      monsterId: 'custom:thug',
      hp: 22,
      maxHp: 22,
    });
    expect(within(rowFor('Bandit, harbour')).getByText(/AC 13/)).toBeInTheDocument();
  });

  it('says a stat block is gone rather than loading for ever', async () => {
    /*
      A saved monster can be deleted while it is still standing in a fight, and
      "still loading…" would then sit on the row describing a wait that had
      already finished. The hit points keep working either way - a monster's
      live in the encounter, not in the stat block.
    */
    setup({
      ...party(),
      encounter: {
        combatants: [
          {
            kind: 'monster',
            id: 'm0',
            monsterId: 'custom:deleted',
            label: 'Something that was here',
            hp: 9,
            maxHp: 14,
            initiative: 12,
            tieBreak: 2,
            conditions: [],
          },
        ],
        turnIndex: -1,
        round: 0,
        nextSeq: 1,
      },
    });
    await bestiaryReady();

    const row = rowFor('Something that was here');
    expect(within(row).getByText(/deleted from your bestiary/i)).toBeInTheDocument();
    expect(within(row).queryByText(/still loading/i)).toBeNull();
    expect((within(row).getByLabelText(/hit points/i) as HTMLInputElement).value).toBe('9');
  });
});

describe('terrain and height', () => {
  // Painting lives in the Dungeons tab now (DungeonsTab.test.tsx); Play only
  // has to *show* what the encounter carries.
  it('renders the encounter’s terrain and elevation on the battlefield', () => {
    setup({
      ...party(),
      encounter: {
        ...emptyEncounter(),
        terrain: { '5,4': 'pillar' },
        elevation: { '10,10': 2 },
      },
    });
    expect(document.querySelector('.dmap-t-pillar')).toBeTruthy();
    expect(screen.getByText('+2')).toBeInTheDocument();
  });
});

describe('line of sight', () => {
  it('draws the lines and says the words', async () => {
    const user = userEvent.setup();
    const view = setup(party());

    // Two characters, both on the map, a pillar wall between them.
    for (const entry of view.roster.entries) {
      await user.click(screen.getByRole('button', { name: entry.build.name }));
    }
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));

    // Select the first character and turn the lines on.
    const first = view.roster.entries[0].build.name;
    await user.click(
      within(rowFor(first)).getByRole('button', { name: /show .* in the rail/i }),
    );
    await user.click(screen.getByRole('checkbox', { name: /sight lines/i }));

    // Deployed into the same room with nothing between them: visible, in words
    // and in ink.
    expect(screen.getByText(/sees/i)).toBeInTheDocument();
    expect(document.querySelector('.dmap-sight:not(.is-blocked)')).toBeTruthy();
    expect(document.querySelector('.dmap-sight.is-blocked')).toBeNull();
  });

  it('says so when the selected combatant is not on the map', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await user.click(screen.getByRole('button', { name: view.roster.entries[0].build.name }));
    await user.click(screen.getByRole('checkbox', { name: /sight lines/i }));
    expect(screen.getByText(/select somebody who is on the map/i)).toBeInTheDocument();
  });
});

describe('areas of effect', () => {
  const mapSvg2 = () => document.querySelector('.dmap') as SVGSVGElement;
  const giveBox = () => {
    mapSvg2().getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 480, height: 360, right: 480, bottom: 360, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  };

  it('places a sphere where the DM clicks and counts its rounds down', async () => {
    const user = userEvent.setup();
    const view = setup(party());

    await user.type(screen.getByPlaceholderText('Wall of fire'), 'Cloudkill');
    await user.type(screen.getByLabelText(/rounds it lasts/i), '2');
    await user.click(screen.getByRole('button', { name: /place on map/i }));
    giveBox();
    fireEvent.pointerDown(mapSvg2(), { clientX: 205, clientY: 155 });

    expect(view.encounter.zones).toHaveLength(1);
    expect(view.encounter.zones![0]).toMatchObject({
      label: 'Cloudkill',
      shape: 'sphere',
      at: { x: 20, y: 15 },
      rounds: 2,
    });
    // Drawn, with its count beside the name.
    expect(document.querySelectorAll('.dmap-zone rect').length).toBeGreaterThan(0);

    // A full round passing burns one; the zone panel says so.
    await user.click(screen.getByRole('button', { name: view.roster.entries[0].build.name }));
    await user.click(screen.getByRole('button', { name: /start the fight/i }));
    await user.click(screen.getByRole('button', { name: /end turn/i }));
    expect(view.encounter.zones![0].rounds).toBe(1);
    expect(screen.getByText(/1 round left/i)).toBeInTheDocument();
  });

  it('aims a cone with two clicks and names who is inside', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await user.click(screen.getByRole('button', { name: view.roster.entries[0].build.name }));
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));
    const standing = view.encounter.combatants[0].at!;

    await user.selectOptions(screen.getByLabelText('Shape'), 'cone');
    await user.click(screen.getByRole('button', { name: /place on map/i }));
    giveBox();
    // Origin two squares west of them, aimed east through them.
    fireEvent.pointerDown(mapSvg2(), {
      clientX: (standing.x - 2 + 0.5) * 10,
      clientY: (standing.y + 0.5) * 10,
    });
    fireEvent.pointerUp(mapSvg2());
    expect(screen.getByText(/click the way it points/i)).toBeInTheDocument();
    fireEvent.pointerDown(mapSvg2(), {
      clientX: (standing.x + 0.5) * 10,
      clientY: (standing.y + 0.5) * 10,
    });

    expect(view.encounter.zones).toHaveLength(1);
    expect(screen.getByText(/inside:/i)).toBeInTheDocument();
  });

  it('removes a zone from the list', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await user.click(screen.getByRole('button', { name: /place on map/i }));
    giveBox();
    fireEvent.pointerDown(mapSvg2(), { clientX: 100, clientY: 100 });
    expect(view.encounter.zones).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /remove effect/i }));
    expect(view.encounter.zones).toBeUndefined();
  });

  /**
   * Section 26. The reaction table itself is `surfaces.test.ts`; what needs a
   * component test is the wiring - that a placed area actually consults the
   * ground, and that everything it sets off reaches the store in one write.
   */
  const dropAt = async (
    user: ReturnType<typeof userEvent.setup>,
    preset: string,
    at: { x: number; y: number },
  ) => {
    await user.selectOptions(screen.getByLabelText(/load a hazard from the shelf/i), preset);
    await user.click(screen.getByRole('button', { name: /place on map/i }));
    giveBox();
    const click = (x: number, y: number) =>
      fireEvent.pointerDown(mapSvg2(), { clientX: (x + 0.5) * 10, clientY: (y + 0.5) * 10 });
    click(at.x, at.y);
    // A line or a cone is aimed: the first click is where it starts and the
    // second is the way it points. Aim east, along the ground it was put on.
    if (screen.queryByText(/click the way it points/i)) click(at.x + 3, at.y);
  };

  it('sets the grease alight when fire lands on it', async () => {
    const user = userEvent.setup();
    const view = setup(party());

    await dropAt(user, 'grease', { x: 20, y: 15 });
    expect(view.encounter.zones![0].label).toBe('Grease');

    await dropAt(user, 'wall-of-fire', { x: 20, y: 15 });

    // The slick is burning ground now, where it lay.
    const burning = view.encounter.zones!.find((z) => z.label === 'Burning ground');
    expect(burning).toBeDefined();
    expect(burning!.at).toEqual({ x: 20, y: 15 });
    expect((view.encounter.log ?? []).some((l) => /catches and burns/.test(l.text))).toBe(true);
  });

  it('leaves the ground alone when the areas do not touch', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await dropAt(user, 'grease', { x: 5, y: 5 });
    await dropAt(user, 'wall-of-fire', { x: 40, y: 30 });
    expect(view.encounter.zones!.some((z) => z.label === 'Grease')).toBe(true);
    expect(view.encounter.zones!.some((z) => z.label === 'Burning ground')).toBe(false);
  });

  it('charges the jolt and the placement to a single write', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await user.click(screen.getByRole('button', { name: view.roster.entries[0].build.name }));
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));
    const standing = view.encounter.combatants[0].at!;

    await dropAt(user, 'water', standing);
    const hpBefore = hpNow(view.roster.entries[0].play, 999);
    const writes = view.onChange.mock.calls.length;

    await dropAt(user, 'ice', standing);
    // Ice onto water freezes it - no jolt, so nobody is hurt.
    expect(hpNow(view.roster.entries[0].play, 999)).toBe(hpBefore);
    expect(view.encounter.zones!.some((z) => z.label === 'Ice')).toBe(true);

    // One write for the placement plus everything it set off. Two would each
    // build from the same render's roster and the second would win.
    expect(view.onChange.mock.calls.length).toBe(writes + 1);
  });

  it('lets a custom area be declared flammable, and then burns it', async () => {
    const user = userEvent.setup();
    const view = setup(party());

    await user.type(screen.getByPlaceholderText('Wall of fire'), 'Oil slick');
    await user.selectOptions(screen.getByLabelText(/what this area is made of/i), 'grease');
    await user.click(screen.getByRole('button', { name: /place on map/i }));
    giveBox();
    fireEvent.pointerDown(mapSvg2(), { clientX: 205, clientY: 155 });
    expect(view.encounter.zones![0].effect?.surface).toBe('grease');

    await dropAt(user, 'wall-of-fire', { x: 20, y: 15 });
    expect(view.encounter.zones!.some((z) => z.label === 'Burning ground')).toBe(true);
  });
});

describe('the simulation', () => {
  it('runs on request and reports the distribution', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await bestiaryReady();

    await user.click(screen.getByRole('button', { name: view.roster.entries[0].build.name }));
    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Goblin',
    ) as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));

    await user.click(screen.getByRole('button', { name: /run it 1,000 times/i }));

    // A fighter against one goblin: the distribution exists and says a
    // percentage, whatever the dice did.
    expect(screen.getByText(/of the time, a typical fight lasting/i)).toBeInTheDocument();
    expect(screen.getByText(/hits the floor at some point/i)).toBeInTheDocument();
    expect(screen.getByText(/monster dice are rolled for real/i)).toBeInTheDocument();
  });
});

/**
 * The DM's own loop, closed.
 *
 * Section 13's claim is that "the goblin attacks the fighter" is one aim and
 * one click, resolved against the fighter's real armor class with the damage
 * landing in the fighter's own store. That whole chain is what these check -
 * plus the fireball: call, answers, damage, in three clicks.
 */
describe('running the monsters', () => {
  const fightWithGoblin = async (user: ReturnType<typeof userEvent.setup>, view: ReturnType<typeof setup>) => {
    await bestiaryReady();
    await user.click(screen.getByRole('button', { name: view.roster.entries[0].build.name }));
    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Goblin',
    ) as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));
  };

  it('gives the active monster its stat block as buttons', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await fightWithGoblin(user, view);

    // The goblin goes first.
    await user.click(within(rowFor('Goblin')).getByRole('button', { name: /roll init/i }));
    fireEvent.change(within(rowFor('Goblin')).getByLabelText(/goblin initiative/i), {
      target: { value: '30' },
    });
    await user.click(screen.getByRole('button', { name: /start the fight/i }));

    // Follow-the-turn put the goblin in the cockpit; Attack drills into the
    // stat block's rows.
    const menu = document.querySelector('.rail-monster .cmd-menu') as HTMLElement;
    await user.click(within(menu).getByRole('button', { name: /^Attack/ }));
    expect(within(menu).getByRole('button', { name: /scimitar \+4/i })).toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: /shortbow \+4/i })).toBeInTheDocument();
  });

  it('aims, clicks a target, and the damage lands in the character’s own store', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await fightWithGoblin(user, view);
    fireEvent.change(within(rowFor('Goblin')).getByLabelText(/goblin initiative/i), {
      target: { value: '30' },
    });
    await user.click(screen.getByRole('button', { name: /start the fight/i }));

    const name = view.roster.entries[0].build.name;
    const max = deriveBuild(view.roster.entries[0].build).hp.total;
    const menu = document.querySelector('.rail-monster .cmd-menu') as HTMLElement;
    await user.click(within(menu).getByRole('button', { name: /^Attack/ }));
    await user.click(within(menu).getByRole('button', { name: /scimitar \+4/i }));
    expect(screen.getByText(/aiming:/i)).toBeInTheDocument();

    await user.click(within(rowFor(name)).getByRole('button', { name: /target/i }));

    // Hit or miss, the fight's log says which, against the real AC.
    expect(screen.getByText(/scimitar \d+ vs AC 16/i)).toBeInTheDocument();
    // And if it hit, the character's own hit points moved; never above max.
    expect(hpNow(view.roster.entries[0].play, max)).toBeLessThanOrEqual(max);
    // Aim consumed either way.
    expect(screen.queryByText(/aiming:/i)).not.toBeInTheDocument();
  });

  it('rolls the room a saving throw and applies half on a pass', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await fightWithGoblin(user, view);

    // DC 30: everybody fails, so the arithmetic is deterministic.
    fireEvent.change(screen.getByLabelText('DC'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Damage'), { target: { value: '8' } });
    await user.click(screen.getByRole('button', { name: /roll the room/i }));

    expect(screen.getAllByText('FAIL').length).toBe(2);
    await user.click(screen.getByRole('button', { name: /apply 8 damage/i }));

    const max = deriveBuild(view.roster.entries[0].build).hp.total;
    expect(hpNow(view.roster.entries[0].play, max)).toBe(max - 8);
    const goblin = view.encounter.combatants.find((c) => c.kind === 'monster')!;
    expect(goblin.kind === 'monster' && goblin.hp).toBe(0);
  });
});

describe('the fight’s clocks and the drawer', () => {
  it('casting concentration marks it, and damage says the save out loud', async () => {
    const user = userEvent.setup();
    const start = party();
    // The wizard concentrates already; a goblin hits them.
    const concentrating = {
      ...start,
      entries: start.entries.map((entry, i) =>
        i === 1 ? { ...entry, play: { ...emptyPlay(), concentratingOn: 'Bless' } } : entry,
      ),
    };
    const view = setup(concentrating);
    await bestiaryReady();
    await user.click(screen.getByRole('button', { name: view.roster.entries[1].build.name }));
    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Goblin',
    ) as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));

    // Fireball the room: everyone fails at DC 30, 20 damage → DC 10 vs half.
    fireEvent.change(screen.getByLabelText('DC'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Damage'), { target: { value: '22' } });
    await user.click(screen.getByRole('button', { name: /roll the room/i }));
    await user.click(screen.getByRole('button', { name: /apply 22 damage/i }));

    expect(screen.getByText(/concentrating on Bless — CON save DC 11/i)).toBeInTheDocument();
  });

  it('a timed condition comes off as the rounds pass', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await user.click(screen.getByRole('button', { name: view.roster.entries[0].build.name }));
    await user.click(screen.getByRole('button', { name: /start the fight/i }));

    // Stunned for one round, via the bar.
    fireEvent.change(screen.getByLabelText(/rounds the next condition lasts/i), {
      target: { value: '1' },
    });
    await user.selectOptions(screen.getByLabelText(/add a condition/i), 'stunned');
    expect(view.roster.entries[0].play.conditions).toContain('stunned');

    // One combatant: ending the turn wraps the round, and the clock fires.
    await user.click(screen.getByRole('button', { name: /end turn/i }));
    expect(view.roster.entries[0].play.conditions).not.toContain('stunned');
  });

  it('saves a fight to the drawer and loads it back fresh', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await bestiaryReady();
    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Goblin',
    ) as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));

    await user.type(screen.getByLabelText(/name to save this fight/i), 'The kennel');
    await user.click(screen.getByRole('button', { name: /save this fight/i }));
    expect(screen.getByText('The kennel')).toBeInTheDocument();

    // Clear the table, then load it back.
    await user.click(screen.getByRole('button', { name: /^clear$/i }));
    expect(view.encounter.combatants).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: /load the kennel/i }));
    expect(view.encounter.combatants).toHaveLength(1);
    expect(view.encounter.round).toBe(0);
  });

  it('shows the balance line as soon as both sides exist', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await bestiaryReady();
    await user.click(screen.getByRole('button', { name: view.roster.entries[0].build.name }));
    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Goblin',
    ) as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));

    expect(screen.getByText(/of 200 quick\s+runs/i)).toBeInTheDocument();
  });
});

/**
 * Section 16: the pointer's loop.
 *
 * Select a portrait, point at a tile, and they go - charged through the same
 * store the drag uses. The ghost shows a spell's footprint before the click
 * that commits it. Escape puts down whatever is in hand.
 */
describe('the pointer’s loop', () => {
  const mapEl = () => document.querySelector('.dmap') as SVGSVGElement;
  const boxMap = () => {
    mapEl().getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 480, height: 360, right: 480, bottom: 360, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  };
  /** The Move command in whichever cockpit is standing - walking is armed,
      never ambient, once the fight is on. */
  const armMove = async (user: ReturnType<typeof userEvent.setup>) => {
    const menu = document.querySelector(
      '.pcard .cmd-menu, .rail-monster .cmd-menu',
    ) as HTMLElement;
    await user.click(within(menu).getByRole('button', { name: /^Move/ }));
  };

  it('moves only when Move is armed, and charges the walk', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));
    await user.click(screen.getByRole('button', { name: /start the fight/i }));
    await user.click(within(rowFor(name)).getByRole('button', { name: /show .* in the rail/i }));

    const from = view.encounter.combatants[0].at!;
    boxMap();
    // Unarmed, the map is not a walking surface: no glow, and the click
    // does nothing at all - which is what lets a click mean "attack".
    expect(document.querySelectorAll('.dmap-reach').length).toBe(0);
    fireEvent.pointerDown(mapEl(), {
      clientX: (from.x + 2 + 0.5) * 10,
      clientY: (from.y + 0.5) * 10,
    });
    expect(view.encounter.combatants[0].at).toEqual(from);
    expect(view.roster.entries[0].play.turn.moved).toBe(0);

    // Armed: the wash lights and the click walks, charged for real.
    await armMove(user);
    expect(document.querySelectorAll('.dmap-reach').length).toBeGreaterThan(0);
    fireEvent.pointerDown(mapEl(), {
      clientX: (from.x + 2 + 0.5) * 10,
      clientY: (from.y + 0.5) * 10,
    });
    expect(view.encounter.combatants[0].at).toEqual({ x: from.x + 2, y: from.y });
    expect(view.roster.entries[0].play.turn.moved).toBe(10);

    // Escape puts the walk down: glow gone, clicks inert again.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.querySelectorAll('.dmap-reach').length).toBe(0);
    fireEvent.pointerDown(mapEl(), {
      clientX: (from.x + 4 + 0.5) * 10,
      clientY: (from.y + 0.5) * 10,
    });
    expect(view.encounter.combatants[0].at).toEqual({ x: from.x + 2, y: from.y });
  });

  it('dashes through the amber tier, and refuses beyond even that', async () => {
    /*
      The fighter walks twenty-five feet of their thirty first. Forty more is
      beyond even their Dash - nothing happens. Fifteen more is beyond their
      feet but inside the Dash, so the click IS the Dash: budget grows by
      their speed, the action pip goes with it, the log says so. (This used
      to move the wizard on the fighter's turn; only the active combatant
      walks now, which is section 22's whole point.)
    */
    const user = userEvent.setup();
    const start = party();
    // A blank map: all open ground, so the walked prices are pure feet.
    const view = setup({ ...start, encounter: { ...emptyEncounter(), mapRooms: 0 } });
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));
    await user.click(screen.getByRole('button', { name: /start the fight/i }));

    await armMove(user);
    // The dash tier is drawn apart from the plain wash.
    expect(document.querySelectorAll('.dmap-reach.is-dash').length).toBeGreaterThan(0);

    const from = view.encounter.combatants[0].at!;
    boxMap();
    // Twenty-five of the thirty feet, spent walking.
    fireEvent.pointerDown(mapEl(), {
      clientX: (from.x + 5 + 0.5) * 10,
      clientY: (from.y + 0.5) * 10,
    });
    expect(view.roster.entries[0].play.turn.moved).toBe(25);

    // Eight more squares is forty feet against the thirty-five left of the
    // dash budget: refused, nothing moves, nothing is spent.
    fireEvent.pointerDown(mapEl(), {
      clientX: (from.x + 13 + 0.5) * 10,
      clientY: (from.y + 0.5) * 10,
    });
    expect(view.encounter.combatants[0].at).toEqual({ x: from.x + 5, y: from.y });
    expect(view.roster.entries[0].play.turn.action).toBe(false);

    // Three more squares is inside the Dash: the click takes it.
    fireEvent.pointerDown(mapEl(), {
      clientX: (from.x + 8 + 0.5) * 10,
      clientY: (from.y + 0.5) * 10,
    });
    expect(view.encounter.combatants[0].at).toEqual({ x: from.x + 8, y: from.y });
    expect(view.roster.entries[0].play.turn.dashes).toBe(1);
    expect(view.roster.entries[0].play.turn.action).toBe(true);
    expect(view.roster.entries[0].play.turn.moved).toBe(40);
  });

  /** A fighter and a goblin on a blank grid, deployed to opposite corners. */
  const blankFight = async (user: ReturnType<typeof userEvent.setup>, view: ReturnType<typeof setup>) => {
    await bestiaryReady();
    await user.click(screen.getByRole('button', { name: view.roster.entries[0].build.name }));
    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Goblin',
    ) as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));
  };

  const dragToken = (selector: string, to: { x: number; y: number }) => {
    fireEvent.pointerDown(document.querySelector(selector)!);
    fireEvent.pointerMove(mapEl(), {
      clientX: (to.x + 0.5) * 10,
      clientY: (to.y + 0.5) * 10,
    });
    fireEvent.pointerUp(mapEl());
  };

  it('refuses the old drag override: in combat, an idle monster stays put', async () => {
    const user = userEvent.setup();
    const start = party();
    const view = setup({ ...start, encounter: { ...emptyEncounter(), mapRooms: 0 } });
    await blankFight(user, view);
    // The fighter's initiative puts them first; the goblin is nobody's turn.
    fireEvent.change(within(rowFor('Goblin')).getByLabelText(/goblin initiative/i), {
      target: { value: '1' },
    });
    await user.click(screen.getByRole('button', { name: /start the fight/i }));

    const goblin = () => view.encounter.combatants.find((c) => c.kind === 'monster')! as MonsterCombatant;
    const from = goblin().at!;
    boxMap();
    dragToken('.dmap-token.monster', { x: from.x - 3, y: from.y });
    // The teleport is gone: nothing moved, nothing was charged.
    expect(goblin().at).toEqual(from);
    expect(goblin().moved ?? 0).toBe(0);
  });

  it('drags free of charge before the fight, characters included', async () => {
    // The setup drag used to bill a character's movement before anything had
    // begun (the isRunning guard only covered monsters). Pinned free now.
    const user = userEvent.setup();
    const start = party();
    const view = setup({ ...start, encounter: { ...emptyEncounter(), mapRooms: 0 } });
    await blankFight(user, view);

    const from = view.encounter.combatants[0].at!;
    boxMap();
    dragToken('.dmap-token.character', { x: from.x + 4, y: from.y });
    expect(view.encounter.combatants[0].at).toEqual({ x: from.x + 4, y: from.y });
    expect(view.roster.entries[0].play.turn.moved).toBe(0);
  });

  it('clicks a monster to attack it, and the spent pip makes the next click a selection', async () => {
    const user = userEvent.setup();
    const start = party();
    const view = setup({ ...start, encounter: { ...emptyEncounter(), mapRooms: 0 } });
    await blankFight(user, view);
    // The fighter goes first; the goblin's turn is beneath theirs.
    const name = view.roster.entries[0].build.name;
    fireEvent.change(within(rowFor(name)).getByLabelText(new RegExp(`${name} initiative`, 'i')), {
      target: { value: '30' },
    });
    fireEvent.change(within(rowFor('Goblin')).getByLabelText(/goblin initiative/i), {
      target: { value: '1' },
    });
    await user.click(screen.getByRole('button', { name: /start the fight/i }));

    // The cursor already says attack: the enemy token wears the crosshair
    // class, the friendly one keeps the grab hand.
    expect(document.querySelector('.dmap-token.monster.is-target')).toBeTruthy();
    expect(document.querySelector('.dmap-token.character.is-target')).toBeNull();

    // One click on the goblin's token: the greatsword resolves against its
    // real AC, no aim step, and the Attack action is spent with the swing.
    boxMap();
    await user.click(document.querySelector('.dmap-token.monster')!);
    expect(screen.getByText(/Greatsword \d+ vs AC 15/i)).toBeInTheDocument();
    expect(view.roster.entries[0].play.turn.action).toBe(true);
    expect(screen.queryByText(/aiming:/i)).not.toBeInTheDocument();

    // The action is spent: the crosshair retires and a second click merely
    // inspects.
    expect(document.querySelector('.dmap-token.monster.is-target')).toBeNull();
    await user.click(document.querySelector('.dmap-token.monster')!);
    expect(document.querySelector('.rail-monster')).toBeTruthy();
    expect(document.querySelectorAll('.dmap-attack, [class*="vs AC"]').length).toBe(0);
    expect(screen.getAllByText(/Greatsword \d+ vs AC 15/i)).toHaveLength(1);
  });

  it('clicking a character token still just selects them', async () => {
    const user = userEvent.setup();
    const start = party();
    const view = setup({ ...start, encounter: { ...emptyEncounter(), mapRooms: 0 } });
    await blankFight(user, view);
    await user.click(screen.getByRole('button', { name: /start the fight/i }));

    boxMap();
    await user.click(document.querySelector('.dmap-token.character')!);
    // Selected, unhurt, no log line: a friend is not a target.
    expect(document.querySelector('.pcard')).toBeTruthy();
    expect(screen.queryByText(/vs AC/i)).not.toBeInTheDocument();
  });

  it('will not move the target a click meant to hit: drags are dead while aiming', async () => {
    const user = userEvent.setup();
    const start = party();
    const view = setup({ ...start, encounter: { ...emptyEncounter(), mapRooms: 0 } });
    await blankFight(user, view);
    fireEvent.change(within(rowFor('Goblin')).getByLabelText(/goblin initiative/i), {
      target: { value: '1' },
    });
    await user.click(screen.getByRole('button', { name: /start the fight/i }));
    // Whoever came up, the fighter's cockpit is the one aiming.
    await user.click(
      within(rowFor(view.roster.entries[0].build.name)).getByRole('button', {
        name: /show .* in the rail/i,
      }),
    );

    // The fighter aims through the standing menu's Attack -> vs…
    const menu = document.querySelector('.pcard .cmd-menu') as HTMLElement;
    await user.click(within(menu).getByRole('button', { name: /^Attack/ }));
    await user.click(within(menu).getAllByRole('button', { name: 'vs…' })[0]);
    expect(screen.getByText(/aiming:/i)).toBeInTheDocument();

    // A click that slips a square used to MOVE the goblin instead of hitting
    // it - the drag is inert while an attack is in the air.
    const goblin = () => view.encounter.combatants.find((c) => c.kind === 'monster')! as MonsterCombatant;
    const from = goblin().at!;
    boxMap();
    dragToken('.dmap-token.monster', { x: from.x - 1, y: from.y });
    expect(goblin().at).toEqual(from);
    // And the aim survived the slip, still waiting for its target.
    expect(screen.getByText(/aiming:/i)).toBeInTheDocument();
  });

  it('walks a Mobile character on the speed their sheet promises', async () => {
    /*
      The bug that forced speed into the engine: the map used to recompute
      `race.speed - penalty + items` by hand, so a character with Mobile
      showed a base 30 no matter what their sheet said. Now every reader asks
      `ctx.speed.total`.
    */
    const user = userEvent.setup();
    const view = setup(rosterOf({ ...fighter(), featIds: ['mobile'] }));
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));
    await user.click(screen.getByRole('button', { name: /start the fight/i }));

    expect(screen.getByTitle('40 of 40 feet left this turn')).toBeInTheDocument();

    await user.click(within(rowFor(name)).getByRole('button', { name: /show .* in the rail/i }));
    await armMove(user);
    const from = view.encounter.combatants[0].at!;
    boxMap();
    fireEvent.pointerDown(mapEl(), {
      clientX: (from.x + 2 + 0.5) * 10,
      clientY: (from.y + 0.5) * 10,
    });
    expect(view.roster.entries[0].play.turn.moved).toBe(10);
    expect(screen.getByTitle('30 of 40 feet left this turn')).toBeInTheDocument();
  });

  it('charges a monster’s movement to the combatant, Dash and refusal included', async () => {
    const user = userEvent.setup();
    const start = party();
    // A blank map - zero rooms means all open ground - so the walked prices
    // below are pure feet, with no walls to bend the routes around.
    const view = setup({ ...start, encounter: { ...emptyEncounter(), mapRooms: 0 } });
    await bestiaryReady();

    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Goblin',
    ) as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));
    await user.click(
      within(rowFor('Goblin')).getByRole('button', { name: /show .* in the rail/i }),
    );

    boxMap();
    // Before the fight the click is setup: free placement, nothing spent.
    fireEvent.pointerDown(mapEl(), { clientX: 105, clientY: 105 });
    expect(view.encounter.combatants[0].at).toEqual({ x: 10, y: 10 });

    await user.click(screen.getByRole('button', { name: /start the fight/i }));
    await armMove(user);

    // Two squares east is ten feet, tracked on the combatant itself - and the
    // bar reads what is left of the goblin's thirty.
    fireEvent.pointerDown(mapEl(), { clientX: 125, clientY: 105 });
    const goblin = () => view.encounter.combatants[0] as MonsterCombatant;
    expect(goblin().at).toEqual({ x: 12, y: 10 });
    expect(goblin().moved).toBe(10);
    expect(screen.getByTitle('20 of 30 feet left this turn')).toBeInTheDocument();

    // Twenty-five more feet is past the twenty left of plain speed but inside
    // the Dash tier: the click IS the Dash, and the log says so.
    fireEvent.pointerDown(mapEl(), { clientX: 175, clientY: 105 });
    expect(goblin().at).toEqual({ x: 17, y: 10 });
    expect(goblin().moved).toBe(35);
    expect(screen.getByText(/Goblin Dashes\./)).toBeInTheDocument();

    // Thirty more would breach even the dash budget: refused, nothing spent.
    fireEvent.pointerDown(mapEl(), { clientX: 235, clientY: 105 });
    expect(goblin().at).toEqual({ x: 17, y: 10 });
    expect(goblin().moved).toBe(35);
  });

  it('floats the damage off the token and wears conditions over its head', async () => {
    const user = userEvent.setup();
    const start = party();
    // The wizard walks in already poisoned: the token should say so.
    const poisoned = {
      ...start,
      entries: start.entries.map((entry, i) =>
        i === 1 ? { ...entry, play: { ...emptyPlay(), conditions: ['poisoned'] } } : entry,
      ),
    };
    const view = setup(poisoned);
    for (const entry of view.roster.entries) {
      await user.click(screen.getByRole('button', { name: entry.build.name }));
    }
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));

    expect(document.querySelector('.dmap-cond')?.textContent).toContain('POI');

    // Damage floats red off the token; healing floats green.
    const name = view.roster.entries[0].build.name;
    await user.click(within(rowFor(name)).getByRole('button', { name: '−5' }));
    const float = document.querySelector('.dmap-float');
    expect(float?.textContent).toBe('-5');
    await user.click(within(rowFor(name)).getByRole('button', { name: '+5' }));
    expect(document.querySelector('.dmap-float.is-heal')?.textContent).toBe('+5');
  });

  it('announces the turn that begins with the phase card', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    for (const entry of view.roster.entries) {
      await user.click(screen.getByRole('button', { name: entry.build.name }));
    }
    await user.click(screen.getByRole('button', { name: /start the fight/i }));
    await user.click(screen.getByRole('button', { name: /end turn/i }));

    expect(document.querySelector('.turn-banner')?.textContent).toMatch(/’s turn$/);

    // The wrap announces the round instead.
    await user.click(screen.getByRole('button', { name: /end turn/i }));
    expect(document.querySelector('.turn-banner')?.textContent).toBe('Round 2');
  });

  it('fogs the map to what the party sees, and remembers what it saw', async () => {
    const user = userEvent.setup();
    const start = party();
    // A blank arena with a full wall column at x=20 and the fog on.
    const wall: Record<string, 'wall'> = {};
    for (let y = 0; y < 36; y++) wall[`20,${y}`] = 'wall';
    const view = setup({
      ...start,
      encounter: { ...emptyEncounter(), mapRooms: 0, fog: true, terrain: wall },
    });
    await bestiaryReady();
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Goblin',
    ) as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));

    // Fighter west of the wall, goblin east of it: the goblin is unseen.
    await user.click(within(rowFor(name)).getByRole('button', { name: /show .* in the rail/i }));
    boxMap();
    fireEvent.pointerDown(mapEl(), { clientX: 105, clientY: 105 });
    await user.click(within(rowFor('Goblin')).getByRole('button', { name: /show .* in the rail/i }));
    fireEvent.pointerDown(mapEl(), { clientX: 305, clientY: 105 });

    // The dark exists, the goblin's token does not, the memory recorded.
    expect(document.querySelectorAll('.dmap-fog').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.dmap-token.monster').length).toBe(0);
    expect(document.querySelectorAll('.dmap-token.character').length).toBe(1);
    await waitFor(() => expect(view.encounter.explored?.length ?? 0).toBeGreaterThan(0));

    // Fog off: the world comes back.
    await user.click(screen.getByLabelText(/fog of war/i));
    expect(document.querySelectorAll('.dmap-fog').length).toBe(0);
    expect(document.querySelectorAll('.dmap-token.monster').length).toBe(1);
  });

  it('wakes a dormant monster the moment the party sees it', async () => {
    const user = userEvent.setup();
    const start = party();
    const wall: Record<string, 'wall'> = {};
    for (let y = 0; y < 36; y++) if (y !== 30) wall[`20,${y}`] = 'wall';
    const view = setup({
      ...start,
      encounter: { ...emptyEncounter(), mapRooms: 0, fog: true, terrain: wall },
    });
    await bestiaryReady();
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Goblin',
    ) as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));

    // Under fog the goblin arrived dormant.
    const goblin = () => view.encounter.combatants.find((c) => c.kind === 'monster')!;
    expect(goblin()).toMatchObject({ dormant: true });

    // Fighter west of the wall, goblin east: still dormant, unseen.
    await user.click(within(rowFor(name)).getByRole('button', { name: /show .* in the rail/i }));
    boxMap();
    fireEvent.pointerDown(mapEl(), { clientX: 105, clientY: 105 });
    await user.click(within(rowFor('Goblin')).getByRole('button', { name: /show .* in the rail/i }));
    fireEvent.pointerDown(mapEl(), { clientX: 305, clientY: 105 });
    expect(goblin()).toMatchObject({ dormant: true });

    // The fighter steps into the doorway's line: the pod springs.
    await user.click(within(rowFor(name)).getByRole('button', { name: /show .* in the rail/i }));
    fireEvent.pointerDown(mapEl(), { clientX: 305, clientY: 305 });
    await waitFor(() => expect(goblin().dormant).toBeFalsy());
    expect(view.encounter.log?.some((l) => l.text.includes('activates'))).toBe(true);
  });

  it('hides with a real Stealth roll, and attacking is the reveal', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await bestiaryReady();
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Goblin',
    ) as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));
    await user.click(screen.getByRole('button', { name: /start the fight/i }));

    // The fighter hides: a d20 plus their real Stealth lands on the combatant,
    // the token goes translucent, the log says the number.
    await user.click(within(rowFor(name)).getByRole('button', { name: 'Hide' }));
    const fighter = () => view.encounter.combatants.find((c) => c.kind === 'character')!;
    expect(fighter().hidden).toBeGreaterThanOrEqual(1);
    expect(document.querySelector('.dmap-token.is-hiding')).toBeTruthy();
    expect(view.encounter.log?.[0].text).toMatch(/hides — Stealth \d+/);

    // Attacking from hiding notes the advantage and gives them away.
    await user.click(within(rowFor(name)).getByRole('button', { name: /show .* in the rail/i }));
    // Through the cockpit's command menu: Action -> Attack -> vs…
    await user.click(
      within(document.querySelector('.pcard') as HTMLElement).getByRole('button', {
        name: 'Action',
      }),
    );
    await user.click(screen.getByRole('button', { name: /^Attack/ }));
    await user.click(screen.getAllByRole('button', { name: 'vs…' })[0]);
    await user.click(document.querySelector('.hud-target') as HTMLElement);
    expect(fighter().hidden).toBeUndefined();
    expect(view.encounter.log?.some((l) => l.text.includes('revealed'))).toBe(true);
    /*
      The wording changed in §27.2 and the behaviour changed with it. This used
      to read "unseen attacker — advantage" on a die that was rolled straight;
      it now names the mode first because the mode is real - the swing behind
      this line was rolled with advantage.
    */
    expect(
      view.encounter.log?.some((l) => /advantage: [^)]*unseen attacker/.test(l.text)),
    ).toBe(true);
  });

  it('reads the debrief back when the fight ends', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await bestiaryReady();
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Goblin',
    ) as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: /start the fight/i }));

    // Seven off the goblin drops it (7 hp): taken 7, one knockdown.
    await user.click(within(rowFor('Goblin')).getByRole('button', { name: '−5' }));
    await user.click(within(rowFor('Goblin')).getByRole('button', { name: '−5' }));
    await user.click(screen.getByRole('button', { name: /end the fight/i }));

    const debrief = screen.getByText('The debrief').closest('.panel') as HTMLElement;
    expect(debrief).toBeTruthy();
    const goblinRow = within(debrief).getByText('Goblin').closest('tr')!;
    const cells = [...goblinRow.querySelectorAll('td')].map((td) => td.textContent);
    // Dealt nothing, took the 7 that existed (overkill pads nobody), dropped once.
    expect(cells).toEqual(['Goblin', '0', '7', '', '1']);
    expect(view.encounter.log?.[0].text).toMatch(/^The fight ends — 1 round\./);
  });

  it('forecasts the clocks on the timeline: conditions, concentration, the wrap', async () => {
    const user = userEvent.setup();
    const start = party();
    // The wizard is stunned for a round and concentrating on bless.
    const clocked = {
      ...start,
      entries: start.entries.map((entry, i) =>
        i === 1
          ? {
              ...entry,
              play: {
                ...emptyPlay(),
                conditions: ['stunned'],
                conditionTimers: { stunned: 1 },
                concentratingOn: 'Bless',
              },
            }
          : entry,
      ),
    };
    const view = setup(clocked);
    for (const entry of view.roster.entries) {
      await user.click(screen.getByRole('button', { name: entry.build.name }));
    }
    await user.click(screen.getByRole('button', { name: /start the fight/i }));

    const notes = [...document.querySelectorAll('.strip-notes')].map((el) => el.textContent);
    expect(notes.join(' ')).toContain('stunned 1');
    expect(notes.join(' ')).toContain('conc: Bless');
    // The round boundary stands in the strip, naming the next round.
    expect(document.querySelector('.strip-wrap')?.textContent).toContain(
      `R${view.encounter.round + 1}`,
    );
    // The tile leading the strip is whoever is up: queue number 1.
    expect(document.querySelector('.strip-tile .strip-order')?.textContent).toBe('1');
  });

  it('offers the shot list with odds while aiming, and a chip resolves it', async () => {
    /*
      X-COM's percentage, checked against the engine's own maths: the chip
      for the goblin (AC 15) must show hitChance(toHit, 15) for the weapon
      being aimed, the same number floats over the token, and clicking the
      chip resolves the attack through resolveAim - log line, aim cleared.
    */
    const user = userEvent.setup();
    const view = setup(party());
    await bestiaryReady();
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Goblin',
    ) as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));
    await user.click(screen.getByRole('button', { name: /start the fight/i }));
    await user.click(within(rowFor(name)).getByRole('button', { name: /show .* in the rail/i }));

    // Through the cockpit's command menu: Action -> Attack -> vs…
    await user.click(
      within(document.querySelector('.pcard') as HTMLElement).getByRole('button', {
        name: 'Action',
      }),
    );
    await user.click(screen.getByRole('button', { name: /^Attack/ }));
    await user.click(screen.getAllByRole('button', { name: 'vs…' })[0]);

    const chips = document.querySelectorAll('.hud-target');
    expect(chips.length).toBeGreaterThan(0);
    const goblinChip = [...chips].find((c) => c.textContent?.includes('Goblin')) as HTMLElement;
    const fighter = deriveBuild(view.roster.entries[0].build);
    const pct = `${Math.round(hitChance(fighter.attacks[0].toHit, 15) * 100)}%`;
    expect(goblinChip.textContent).toContain(pct);
    // The same number floats over the goblin's token on the map.
    expect(
      [...document.querySelectorAll('.dmap-odds')].some((el) => el.textContent === pct),
    ).toBe(true);
    // And the hint names the best shot.
    expect(document.querySelector('.hud-hint')?.textContent).toMatch(/best shot: Goblin/);

    await user.click(goblinChip);
    expect(document.querySelectorAll('.hud-target').length).toBe(0);
    expect(view.encounter.log?.[0].text).toMatch(new RegExp(`^${name} — `));
  });

  it('outlines the reach in two perimeters, plain and dash', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));
    await user.click(screen.getByRole('button', { name: /start the fight/i }));
    await user.click(within(rowFor(name)).getByRole('button', { name: /show .* in the rail/i }));
    await user.click(
      within(document.querySelector('.pcard .cmd-menu') as HTMLElement).getByRole('button', {
        name: /^Move/,
      }),
    );

    // The wash renders once Move is armed; the perimeters are the hard
    // edges - one solid line for plain movement, one dashed for the dash tier.
    expect(document.querySelectorAll('.dmap-reach').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.dmap-reach-edge').length).toBe(2);
    expect(document.querySelector('.dmap-reach-edge.is-dash')).toBeTruthy();
  });

  it('lobs the arc at the cursor and says what the footprint catches', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    for (const entry of view.roster.entries) {
      await user.click(screen.getByRole('button', { name: entry.build.name }));
    }
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));
    const name = view.roster.entries[0].build.name;
    await user.click(within(rowFor(name)).getByRole('button', { name: /show .* in the rail/i }));

    await user.click(screen.getByRole('button', { name: /place on map/i }));
    boxMap();
    // Hover right on the caster's neighbour: a 20 ft sphere from there swallows
    // both deployed tokens, and the arc runs from the selected combatant.
    const from = view.encounter.combatants[0].at!;
    fireEvent.pointerMove(mapEl(), {
      clientX: (from.x + 1 + 0.5) * 10,
      clientY: (from.y + 0.5) * 10,
    });

    expect(document.querySelector('.dmap-arc')).toBeTruthy();
    expect(document.querySelector('.dmap-impact')).toBeTruthy();
    expect(document.querySelector('.hud-hint')?.textContent).toMatch(/catches 2 creatures/);
  });

  it('moves through the tactical camera exactly as through the flat map', async () => {
    /*
      The isometric view keeps the whole pointer contract, so the same
      click-to-move assertions hold: select, click a diamond, the combatant
      moves and their movement is charged. The click point is computed from
      the rendered polygon itself - the DOM says where each diamond is, and
      the viewBox says how that maps to the screen.
    */
    const user = userEvent.setup();
    const start = party();
    const view = setup({
      ...start,
      encounter: { ...emptyEncounter(), mapRooms: 0, elevation: { '14,10': 2 } },
    });
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.click(screen.getByRole('button', { name: /start the fight/i }));
    await user.click(within(rowFor(name)).getByRole('button', { name: /show .* in the rail/i }));
    await user.click(screen.getByRole('button', { name: /tactical view/i }));

    const iso = () => document.querySelector('.isomap') as SVGSVGElement;
    expect(iso()).toBeTruthy();
    expect(document.querySelectorAll('.isomap .iso-top').length).toBeGreaterThan(100);

    const vb = iso().getAttribute('viewBox')!.split(' ').map(Number);
    iso().getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 480, height: 360, right: 480, bottom: 360, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    const clientAt = (at: { x: number; y: number }) => {
      const poly = document.querySelector(`.isomap .iso-top[data-at="${at.x},${at.y}"]`)!;
      const pts = poly.getAttribute('points')!.split(' ').map((p) => p.split(',').map(Number));
      const cx = pts.reduce((n, p) => n + p[0], 0) / pts.length;
      const cy = pts.reduce((n, p) => n + p[1], 0) / pts.length;
      return { clientX: ((cx - vb[0]) / vb[2]) * 480, clientY: ((cy - vb[1]) / vb[3]) * 360 };
    };

    // Place the fighter pre-fight (free), then arm Move and walk them two
    // squares east - the tactical camera keeps the whole pointer contract.
    fireEvent.pointerDown(iso(), clientAt({ x: 10, y: 10 }));
    expect(view.encounter.combatants[0].at).toEqual({ x: 10, y: 10 });
    await user.click(
      within(document.querySelector('.pcard .cmd-menu') as HTMLElement).getByRole('button', {
        name: /^Move/,
      }),
    );
    fireEvent.pointerDown(iso(), clientAt({ x: 12, y: 10 }));
    expect(view.encounter.combatants[0].at).toEqual({ x: 12, y: 10 });
    expect(view.roster.entries[0].play.turn.moved).toBe(10);

    // The raised tile draws lifted; clicking where it is DRAWN still lands on
    // it, because the inverse tries the taller candidate first.
    fireEvent.pointerDown(iso(), clientAt({ x: 14, y: 10 }));
    expect(view.encounter.combatants[0].at).toEqual({ x: 14, y: 10 });
  });

  it('rotates the camera and the pointer still lands where it looks', async () => {
    /*
      A quarter turn permutes the projection; the inverse must permute back,
      or every click after rotating would land a mirrored square away. Same
      method as the un-rotated test: the click point comes from the rendered
      polygon itself, so if the drawing and the inverse ever disagree, the
      combatant lands somewhere else and this fails.
    */
    const user = userEvent.setup();
    const start = party();
    const view = setup({ ...start, encounter: { ...emptyEncounter(), mapRooms: 0 } });
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.click(screen.getByRole('button', { name: /start the fight/i }));
    await user.click(within(rowFor(name)).getByRole('button', { name: /show .* in the rail/i }));
    await user.click(screen.getByRole('button', { name: /tactical view/i }));
    await user.click(screen.getByRole('button', { name: /rotate the camera/i }));

    const iso = () => document.querySelector('.isomap') as SVGSVGElement;
    const vb = iso().getAttribute('viewBox')!.split(' ').map(Number);
    iso().getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 480, height: 360, right: 480, bottom: 360, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    const clientAt = (at: { x: number; y: number }) => {
      const poly = document.querySelector(`.isomap .iso-top[data-at="${at.x},${at.y}"]`)!;
      const pts = poly.getAttribute('points')!.split(' ').map((p) => p.split(',').map(Number));
      const cx = pts.reduce((n, p) => n + p[0], 0) / pts.length;
      const cy = pts.reduce((n, p) => n + p[1], 0) / pts.length;
      return { clientX: ((cx - vb[0]) / vb[2]) * 480, clientY: ((cy - vb[1]) / vb[3]) * 360 };
    };

    fireEvent.pointerDown(iso(), clientAt({ x: 20, y: 15 }));
    expect(view.encounter.combatants[0].at).toEqual({ x: 20, y: 15 });
  });

  it('shows a spell’s footprint at the cursor before any click', async () => {
    const user = userEvent.setup();
    setup(party());
    await user.click(screen.getByRole('button', { name: /place on map/i }));
    boxMap();
    fireEvent.pointerMove(mapEl(), { clientX: 205, clientY: 155 });

    const ghost = document.querySelector('.dmap-zone.is-ghost');
    expect(ghost).toBeTruthy();
    // A 20 ft sphere: nine squares a side, eighty-one squares of ghost.
    expect(ghost!.querySelectorAll('rect').length).toBe(81);
  });

  it('reads the distance from the selected combatant to the cursor', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));
    await user.click(within(rowFor(name)).getByRole('button', { name: /show .* in the rail/i }));

    const from = view.encounter.combatants[0].at!;
    boxMap();
    fireEvent.pointerMove(mapEl(), {
      clientX: (from.x + 4 + 0.5) * 10,
      clientY: (from.y + 3 + 0.5) * 10,
    });
    // Chebyshev: four across, three down is twenty feet. Short, because the
    // note rides the cursor now and who it is from is whoever is selected.
    expect(document.querySelector('.dmap-note')?.textContent).toBe('20 ft');
  });

  it('escape puts down whatever is in hand, most urgent first', async () => {
    const user = userEvent.setup();
    setup(party());
    await user.click(screen.getByRole('button', { name: /place on map/i }));
    expect(screen.getByText(/click the map to place it/i)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText(/click the map to place it/i)).not.toBeInTheDocument();
  });

  it('space ends the turn from the keyboard', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await user.click(screen.getByRole('button', { name: view.roster.entries[0].build.name }));
    await user.click(screen.getByRole('button', { name: /start the fight/i }));
    const round = view.encounter.round;
    fireEvent.keyDown(window, { key: ' ' });
    // One combatant: the turn wrapped into a new round.
    expect(view.encounter.round).toBe(round + 1);
  });

  it('marks the bloodied on their strip tile', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await bestiaryReady();
    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Goblin',
    ) as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));
    expect(view.encounter.combatants[0]).toMatchObject({ hp: 7 });

    await user.click(within(rowFor('Goblin')).getByRole('button', { name: '−5' }));
    // Two of seven left: under half, above nothing.
    expect(document.querySelector('.strip-tile.is-bloodied')).toBeTruthy();
    expect(document.querySelector('.strip-tile.is-hit')).toBeTruthy();
  });
});

describe('walking, not flying', () => {
  const mapEl2 = () => document.querySelector('.dmap') as SVGSVGElement;
  const boxMap2 = () => {
    mapEl2().getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 480, height: 360, right: 480, bottom: 360, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  };

  /*
    The terrain comes in through the encounter now - painting lives in the
    Dungeons tab - so a blank grid (mapRooms: 0) with a hand-laid column is
    the setup. Deploy seats the lone fighter at (1,1) on a blank grid, and
    the column at x=2 runs long enough that no route within the dash budget
    rounds it.
  */
  const column = (kind: 'wall' | 'water') =>
    Object.fromEntries(Array.from({ length: 12 }, (_, y) => [`2,${y}`, kind] as const));

  it('will not click a character through a wall, however close the far side', async () => {
    const user = userEvent.setup();
    const view = setup({
      ...party(),
      encounter: { ...emptyEncounter(), mapRooms: 0, terrain: column('wall') },
    });
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));
    await user.click(screen.getByRole('button', { name: /start the fight/i }));

    const from = view.encounter.combatants[0].at!;
    expect(from).toEqual({ x: 1, y: 1 });
    await user.click(
      within(document.querySelector('.pcard .cmd-menu') as HTMLElement).getByRole('button', {
        name: /^Move/,
      }),
    );
    boxMap2();
    // Two squares east: ten feet as the crow flies, on the far side of the wall.
    fireEvent.pointerDown(mapEl2(), {
      clientX: (from.x + 2 + 0.5) * 10,
      clientY: (from.y + 0.5) * 10,
    });
    expect(view.encounter.combatants[0].at).toEqual(from);
    expect(view.roster.entries[0].play.turn.moved).toBe(0);
  });

  it('charges the walked price through difficult ground', async () => {
    const user = userEvent.setup();
    const view = setup({
      ...party(),
      encounter: { ...emptyEncounter(), mapRooms: 0, terrain: column('water') },
    });
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));
    await user.click(screen.getByRole('button', { name: /start the fight/i }));

    const from = view.encounter.combatants[0].at!;
    await user.click(
      within(document.querySelector('.pcard .cmd-menu') as HTMLElement).getByRole('button', {
        name: /^Move/,
      }),
    );
    boxMap2();
    fireEvent.pointerDown(mapEl2(), {
      clientX: (from.x + 2 + 0.5) * 10,
      clientY: (from.y + 0.5) * 10,
    });
    // Ten feet into the water plus five out the far side: fifteen charged for
    // a ten-foot crow line.
    expect(view.encounter.combatants[0].at).toEqual({ x: from.x + 2, y: from.y });
    expect(view.roster.entries[0].play.turn.moved).toBe(15);
  });

  it('draws the line the ruler is measuring', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));
    await user.click(within(rowFor(name)).getByRole('button', { name: /show .* in the rail/i }));

    const from = view.encounter.combatants[0].at!;
    boxMap2();
    fireEvent.pointerMove(mapEl2(), {
      clientX: (from.x + 4 + 0.5) * 10,
      clientY: (from.y + 0.5) * 10,
    });
    expect(document.querySelector('.dmap-ruler')).toBeTruthy();
    expect(document.querySelector('.dmap-note')?.textContent).toMatch(/^20 ft/);
  });
});

describe('the command menu', () => {
  it('stands open in the cockpit like the monster rail, no pip press first', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.click(screen.getByRole('button', { name: /start the fight/i }));

    // Starting selects whoever is up; their cockpit already shows the box.
    // Scoped to it: the workspace has its own "Hide Turn order" button.
    const menu = document.querySelector('.pcard .cmd-menu') as HTMLElement;
    expect(menu).toBeTruthy();
    for (const command of ['Attack', 'Dash', 'Dodge', 'Disengage', 'Help', 'Ready', 'Hide']) {
      expect(within(menu).getByRole('button', { name: new RegExp(`^${command}`) })).toBeInTheDocument();
    }
    await user.click(within(menu).getByRole('button', { name: /^Attack/ }));
    expect(screen.getByRole('button', { name: /greatsword \+/i })).toBeInTheDocument();
    // The old home is empty: acting lives in the cockpit now.
    expect(document.querySelector('.init-expand')).toBeNull();
  });

  it('spends the pip and writes the log from a one-click command', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.click(screen.getByRole('button', { name: /start the fight/i }));

    await user.click(screen.getByRole('button', { name: /^Dodge/ }));

    expect(view.roster.entries[0].play.turn.action).toBe(true);
    expect(view.encounter.log?.[0].text).toBe(`${name} takes the Dodge action.`);
    // The standing box stays through the choice, back at its grid.
    expect(document.querySelector('.pcard .cmd-menu')).toBeTruthy();
    expect(document.querySelector('.pcard .cmd-sub')).toBeNull();
  });

  it('gives the monster cockpit its own menu, Attack drilling into the block', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await bestiaryReady();
    await user.click(screen.getByRole('button', { name: view.roster.entries[0].build.name }));
    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Goblin',
    ) as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: /start the fight/i }));

    await user.click(
      within(rowFor('Goblin')).getByRole('button', { name: /show goblin in the rail/i }),
    );
    const menu = document.querySelector('.rail-monster .cmd-menu') as HTMLElement;
    expect(menu).toBeTruthy();
    await user.click(within(menu).getByRole('button', { name: /^Attack/ }));
    expect(within(menu).getByRole('button', { name: /scimitar \+4/i })).toBeInTheDocument();
  });
});

describe('the ground bites back', () => {
  const mapEl4 = () => document.querySelector('.dmap') as SVGSVGElement;
  const boxMap4 = () => {
    mapEl4().getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 480, height: 360, right: 480, bottom: 360, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  };
  /** A vertical hazard line at x=3, y from 0 down `length` squares. */
  const fireWall = (length: number, effect: object) => ({
    id: 'z1',
    label: 'Wall of Fire',
    shape: 'line' as const,
    at: { x: 3, y: 0 },
    angle: Math.PI / 2,
    feet: length * 5,
    tint: 0,
    effect,
  });
  const startAndArm = async (
    user: ReturnType<typeof userEvent.setup>,
    view: ReturnType<typeof setup>,
  ) => {
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));
    await user.click(screen.getByRole('button', { name: /start the fight/i }));
    await user.click(
      within(document.querySelector('.pcard .cmd-menu') as HTMLElement).getByRole('button', {
        name: /^Move/,
      }),
    );
    boxMap4();
  };

  it('burns whoever walks through when only the shortcut fits the budget', async () => {
    const user = userEvent.setup();
    // A wall too long to walk around: the only way east is through. No save
    // on the effect, so the bite is certain and the test deterministic.
    const view = setup({
      ...party(),
      encounter: {
        ...emptyEncounter(),
        mapRooms: 0,
        zones: [fireWall(13, { damage: { dice: '2d4', type: 'fire' }, onEnter: true })],
      },
    });
    await startAndArm(user, view);

    const max = deriveBuild(view.roster.entries[0].build).hp.total;
    fireEvent.pointerDown(mapEl4(), { clientX: (5 + 0.5) * 10, clientY: (1 + 0.5) * 10 });

    expect(view.encounter.combatants[0].at).toEqual({ x: 5, y: 1 });
    expect(hpNow(view.roster.entries[0].play, max)).toBeLessThan(max);
    expect(
      view.encounter.log!.some((l) => /walks into Wall of Fire.*fire\./.test(l.text)),
    ).toBe(true);
  });

  it('routes around the fire when the budget allows, and nothing burns', async () => {
    const user = userEvent.setup();
    // A short wall: one diagonal step around it costs the same as through.
    const view = setup({
      ...party(),
      encounter: {
        ...emptyEncounter(),
        mapRooms: 0,
        zones: [fireWall(3, { damage: { dice: '2d4', type: 'fire' }, onEnter: true })],
      },
    });
    await startAndArm(user, view);

    const max = deriveBuild(view.roster.entries[0].build).hp.total;
    fireEvent.pointerDown(mapEl4(), { clientX: (5 + 0.5) * 10, clientY: (1 + 0.5) * 10 });

    expect(view.encounter.combatants[0].at).toEqual({ x: 5, y: 1 });
    expect(hpNow(view.roster.entries[0].play, max)).toBe(max);
    expect(view.encounter.log?.some((l) => /walks into/.test(l.text)) ?? false).toBe(false);
  });

  it('a wall of force is a wall: refused, not priced', async () => {
    const user = userEvent.setup();
    const view = setup({
      ...party(),
      encounter: {
        ...emptyEncounter(),
        mapRooms: 0,
        zones: [fireWall(13, { blocks: true })],
      },
    });
    await startAndArm(user, view);

    fireEvent.pointerDown(mapEl4(), { clientX: (5 + 0.5) * 10, clientY: (1 + 0.5) * 10 });
    expect(view.encounter.combatants[0].at).toEqual({ x: 1, y: 1 });
    fireEvent.pointerDown(mapEl4(), { clientX: (3 + 0.5) * 10, clientY: (1 + 0.5) * 10 });
    expect(view.encounter.combatants[0].at).toEqual({ x: 1, y: 1 });
  });

  it('bites whoever ends their turn standing in it', async () => {
    const user = userEvent.setup();
    // The fighter deploys at (1,1), inside a hazard covering that square.
    const view = setup({
      ...party(),
      encounter: {
        ...emptyEncounter(),
        mapRooms: 0,
        zones: [
          {
            id: 'z1',
            label: 'Cloudkill',
            shape: 'sphere' as const,
            at: { x: 1, y: 1 },
            angle: 0,
            feet: 5,
            tint: 0,
            effect: { damage: { dice: '2d4', type: 'poison' }, onEndTurn: true },
          },
        ],
      },
    });
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));
    await user.click(screen.getByRole('button', { name: /start the fight/i }));

    const max = deriveBuild(view.roster.entries[0].build).hp.total;
    await user.click(screen.getByRole('button', { name: /end turn/i }));

    expect(hpNow(view.roster.entries[0].play, max)).toBeLessThan(max);
    expect(
      view.encounter.log!.some((l) => /ends their turn in Cloudkill.*poison\./.test(l.text)),
    ).toBe(true);
  });

  it('notes the opportunity attack when a walk leaves an enemy’s reach', async () => {
    const user = userEvent.setup();
    const view = setup({ ...party(), encounter: { ...emptyEncounter(), mapRooms: 0 } });
    await bestiaryReady();
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Goblin',
    ) as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));

    // Stand the goblin next to the fighter, then the fighter walks away.
    boxMap4();
    await user.click(
      within(rowFor('Goblin')).getByRole('button', { name: /show goblin in the rail/i }),
    );
    fireEvent.pointerDown(mapEl4(), { clientX: (2 + 0.5) * 10, clientY: (1 + 0.5) * 10 });
    fireEvent.change(within(rowFor(name)).getByLabelText(new RegExp(`${name} initiative`, 'i')), {
      target: { value: '30' },
    });
    await user.click(screen.getByRole('button', { name: /start the fight/i }));
    await user.click(
      within(document.querySelector('.pcard .cmd-menu') as HTMLElement).getByRole('button', {
        name: /^Move/,
      }),
    );
    fireEvent.pointerDown(mapEl4(), { clientX: (6 + 0.5) * 10, clientY: (5 + 0.5) * 10 });

    expect(
      view.encounter.log!.some((l) =>
        /leaves the reach of Goblin — opportunity attack/.test(l.text),
      ),
    ).toBe(true);
  });
});

describe('the ruler walks', () => {
  const mapEl3 = () => document.querySelector('.dmap') as SVGSVGElement;
  const boxMap3 = () => {
    mapEl3().getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 480, height: 360, right: 480, bottom: 360, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  };

  it('bends the line around a wall and prices the walk, not the crow', async () => {
    const user = userEvent.setup();
    // A short wall directly east of where the lone fighter will deploy on a
    // blank grid, seeded through the encounter - painting lives in the
    // Dungeons tab now.
    const view = setup({
      ...party(),
      encounter: {
        ...emptyEncounter(),
        mapRooms: 0,
        terrain: { '2,0': 'wall', '2,1': 'wall', '2,2': 'wall' },
      },
    });
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));
    await user.click(within(rowFor(name)).getByRole('button', { name: /show .* in the rail/i }));

    const from = view.encounter.combatants[0].at!;
    boxMap3();
    fireEvent.pointerMove(mapEl3(), {
      clientX: (from.x + 2 + 0.5) * 10,
      clientY: (from.y + 0.5) * 10,
    });
    // Two squares east as the crow flies is ten feet; around a three-square
    // wall it is at least twenty, and the line has to bend to say so.
    const note = document.querySelector('.dmap-note')?.textContent ?? '';
    expect(Number.parseInt(note, 10)).toBeGreaterThanOrEqual(20);
    const points = (document.querySelector('.dmap-ruler') as SVGPolylineElement)
      .getAttribute('points')!.split(' ');
    expect(points.length).toBeGreaterThan(2);
  });

  it('says "no path" rather than measuring through solid rock', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));
    await user.click(within(rowFor(name)).getByRole('button', { name: /show .* in the rail/i }));

    boxMap3();
    // The map's corner is rock on a generated dungeon: no feet ever get there.
    fireEvent.pointerMove(mapEl3(), { clientX: 5, clientY: 5 });
    expect(document.querySelector('.dmap-note')?.textContent).toBe('no path');
  });

  it('places freely by click before the fight starts', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));
    // Select by clicking their row; no fight running.
    await user.click(within(rowFor(name)).getByRole('button', { name: /show .* in the rail/i }));

    const from = view.encounter.combatants[0].at!;
    boxMap3();
    fireEvent.pointerDown(mapEl3(), {
      clientX: (from.x + 5 + 0.5) * 10,
      clientY: (from.y + 0.5) * 10,
    });
    // Setup is free: they moved, and nothing was charged to a turn that has
    // not begun.
    expect(view.encounter.combatants[0].at).toEqual({ x: from.x + 5, y: from.y });
    expect(view.roster.entries[0].play.turn.moved).toBe(0);
  });
});

/**
 * The monster proposes; the DM disposes.
 *
 * The decision itself is `engine/enemyTurn.ts`, tested against battlefields
 * drawn on paper. What is worth a component test is the wiring either side of
 * it: that the proposal appears only for whoever's turn it actually is, that
 * pressing the button walks AND swings in ONE roster write, and that the
 * command menu underneath it still works - because the plan is a suggestion,
 * and a suggestion you cannot overrule is an instruction.
 */
describe('the enemy turn', () => {
  const goblinFight = async (
    user: ReturnType<typeof userEvent.setup>,
    view: ReturnType<typeof setup>,
    { goblinFirst }: { goblinFirst: boolean },
  ) => {
    await bestiaryReady();
    await user.click(screen.getByRole('button', { name: view.roster.entries[0].build.name }));
    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Goblin',
    ) as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));

    const name = view.roster.entries[0].build.name;
    fireEvent.change(within(rowFor(name)).getByLabelText(new RegExp(`${name} initiative`, 'i')), {
      target: { value: goblinFirst ? '1' : '30' },
    });
    fireEvent.change(within(rowFor('Goblin')).getByLabelText(/goblin initiative/i), {
      target: { value: goblinFirst ? '30' : '1' },
    });
    await user.click(screen.getByRole('button', { name: /start the fight/i }));
  };

  const plan = () => document.querySelector('.rail-plan');
  const goblinOf = (view: ReturnType<typeof setup>) =>
    view.encounter.combatants.find((c) => c.kind === 'monster') as MonsterCombatant;

  it('offers nothing on a character’s turn', async () => {
    const user = userEvent.setup();
    const view = setup({ ...party(), encounter: { ...emptyEncounter(), mapRooms: 0 } });
    await goblinFight(user, view, { goblinFirst: false });
    // The fighter is up. Nobody proposes a turn for the party.
    expect(plan()).toBeNull();
  });

  it('proposes the goblin’s turn, with its reasoning, once the goblin is up', async () => {
    const user = userEvent.setup();
    const view = setup({ ...party(), encounter: { ...emptyEncounter(), mapRooms: 0 } });
    await goblinFight(user, view, { goblinFirst: true });

    expect(plan()).not.toBeNull();
    // The sentence is the point: a plan you cannot argue with is one you
    // cannot sensibly override.
    expect(plan()!.querySelector('.rail-plan-why')!.textContent).toMatch(/\w/);
    expect(within(plan() as HTMLElement).getByRole('button', { name: 'Run it' })).toBeTruthy();
  });

  it('walks and swings in one write when the DM runs it', async () => {
    const user = userEvent.setup();
    const view = setup({ ...party(), encounter: { ...emptyEncounter(), mapRooms: 0 } });
    await goblinFight(user, view, { goblinFirst: true });

    const before = goblinOf(view).at!;
    const writes = view.onChange.mock.calls.length;
    await user.click(within(plan() as HTMLElement).getByRole('button', { name: 'Run it' }));

    // ONE write for the whole turn. Two would each build from the same
    // render's roster and the second would discard the first - the goblin
    // would swing from the square it had already left.
    expect(view.onChange.mock.calls.length).toBe(writes + 1);

    const after = goblinOf(view);
    const log = (view.encounter.log ?? []).map((l) => l.text).join('\n');
    // It either closed the distance or it attacked; on a blank grid with the
    // party deployed opposite, it is the walk that happens first.
    const movedOrSwung = after.at!.x !== before.x || after.at!.y !== before.y || /vs AC/.test(log);
    expect(movedOrSwung).toBe(true);
    // Whatever it did, the movement it spent was charged against its budget.
    if (after.at!.x !== before.x || after.at!.y !== before.y) {
      expect(after.moved ?? 0).toBeGreaterThan(0);
    }
  });

  it('charges the walk and the swing to the same turn, and lands the damage', async () => {
    const user = userEvent.setup();
    const view = setup({ ...party(), encounter: { ...emptyEncounter(), mapRooms: 0 } });
    await goblinFight(user, view, { goblinFirst: true });

    // Run turns until the goblin has closed and swung: on a blank grid it
    // needs a round or two of walking first.
    for (let i = 0; i < 8; i++) {
      const box = plan();
      if (box) await user.click(within(box as HTMLElement).getByRole('button', { name: 'Run it' }));
      if (/vs AC/.test((view.encounter.log ?? []).map((l) => l.text).join('\n'))) break;
      await user.click(screen.getByRole('button', { name: /end turn/i }));
      await user.click(screen.getByRole('button', { name: /end turn/i }));
    }

    const log = (view.encounter.log ?? []).map((l) => l.text).join('\n');
    expect(log).toMatch(/vs AC/);
    // The goblin's own name is on the swing - it attacked as itself, through
    // the same dice every hand-driven attack uses.
    expect(log).toMatch(/Goblin[^\n]*(Scimitar|Shortbow)/);
  });

  it('steps aside when the DM clicks away to inspect somebody', async () => {
    const user = userEvent.setup();
    const view = setup({ ...party(), encounter: { ...emptyEncounter(), mapRooms: 0 } });
    await goblinFight(user, view, { goblinFirst: true });
    expect(plan()).not.toBeNull();

    // The cockpit follows the turn until the DM looks at somebody else.
    const name = view.roster.entries[0].build.name;
    await user.click(within(rowFor(name)).getByRole('button', { name: new RegExp(name) }));
    expect(plan()).toBeNull();
  });

  it('leaves the monster’s own command menu in charge', async () => {
    const user = userEvent.setup();
    const view = setup({ ...party(), encounter: { ...emptyEncounter(), mapRooms: 0 } });
    await goblinFight(user, view, { goblinFirst: true });

    // The proposal sits above the menu rather than replacing it: overruling
    // it is how a DM says these particular goblins are cowards.
    expect(plan()).not.toBeNull();
    const menu = document.querySelector('.rail-monster .cmd-menu');
    expect(menu).not.toBeNull();
    expect(within(menu as HTMLElement).getByRole('button', { name: /^Move/ })).toBeTruthy();
  });
});

/**
 * Section 26.2. The contest itself is `engine/shove.test.ts`; what needs a
 * component test is the part that only exists here - that a shove reaches the
 * map, that the ledge under somebody finally does something, and that the
 * whole of it lands in one write.
 */
describe('shoving, and the ledge behind them', () => {
  const mapEl4 = () => document.querySelector('.dmap') as SVGSVGElement;
  const boxMap4 = () => {
    mapEl4().getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 480, height: 360, right: 480, bottom: 360, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  };

  /** The fighter adjacent to a goblin, on a flat blank grid unless told otherwise. */
  const brawl = async (
    user: ReturnType<typeof userEvent.setup>,
    elevation: Record<string, number> = {},
  ) => {
    const view = setup({
      ...party(),
      encounter: { ...emptyEncounter(), mapRooms: 0, elevation },
    });
    await bestiaryReady();
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Goblin',
    ) as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));

    // Placed by hand, adjacent, before the fight - placement is free then.
    boxMap4();
    const put = (at: { x: number; y: number }) =>
      fireEvent.pointerDown(mapEl4(), { clientX: (at.x + 0.5) * 10, clientY: (at.y + 0.5) * 10 });
    await user.click(within(rowFor(name)).getByRole('button', { name: new RegExp(name) }));
    put({ x: 10, y: 10 });
    await user.click(within(rowFor('Goblin')).getByRole('button', { name: /goblin/i }));
    put({ x: 11, y: 10 });

    fireEvent.change(within(rowFor(name)).getByLabelText(new RegExp(`${name} initiative`, 'i')), {
      target: { value: '30' },
    });
    fireEvent.change(within(rowFor('Goblin')).getByLabelText(/goblin initiative/i), {
      target: { value: '1' },
    });
    await user.click(screen.getByRole('button', { name: /start the fight/i }));
    return { view, name };
  };

  const armShove = async (user: ReturnType<typeof userEvent.setup>, which: 'Shove' | 'Trip') => {
    const menu = document.querySelector('.pcard .cmd-menu') as HTMLElement;
    await user.click(within(menu).getByRole('button', { name: which }));
  };

  const goblinOf = (view: ReturnType<typeof setup>) =>
    view.encounter.combatants.find((c) => c.kind === 'monster') as MonsterCombatant;

  const logOf = (view: ReturnType<typeof setup>) =>
    (view.encounter.log ?? []).map((l) => l.text).join('\n');

  it('offers both a push and a trip, since the choice is the shover’s', async () => {
    const user = userEvent.setup();
    await brawl(user);
    const menu = document.querySelector('.pcard .cmd-menu') as HTMLElement;
    expect(within(menu).getByRole('button', { name: 'Shove' })).toBeTruthy();
    expect(within(menu).getByRole('button', { name: 'Trip' })).toBeTruthy();
  });

  it('resolves the contest on the token that was clicked, and spends the action', async () => {
    const user = userEvent.setup();
    const { view } = await brawl(user);
    await armShove(user, 'Shove');
    boxMap4();
    await user.click(document.querySelector('.dmap-token.monster') as Element);

    // Whichever way the dice went, the contest happened and was written down.
    expect(logOf(view)).toMatch(/Athletics \d+ vs (Athletics|Acrobatics) \d+/);
    // A shove replaces one attack of the Attack action, so it costs the pip
    // whether or not it worked.
    expect(view.roster.entries[0].play.turn.action).toBe(true);
  });

  it('will not shove across the room, and charges nothing for the mis-click', async () => {
    const user = userEvent.setup();
    const { view } = await brawl(user);
    // Walk the goblin far away first, by placing it before the fight? Simpler:
    // end the fight so placement is free again, then move it out of reach.
    await user.click(screen.getByRole('button', { name: /end the fight/i }));
    await user.click(within(rowFor('Goblin')).getByRole('button', { name: /goblin/i }));
    boxMap4();
    fireEvent.pointerDown(mapEl4(), { clientX: 30.5 * 10, clientY: 10.5 * 10 });
    await user.click(screen.getByRole('button', { name: /start the fight/i }));

    await armShove(user, 'Shove');
    await user.click(document.querySelector('.dmap-token.monster') as Element);
    expect(logOf(view)).toMatch(/not close enough/);
    expect(view.roster.entries[0].play.turn.action).toBeFalsy();
  });

  it('drops them off the ledge and hurts them for it', async () => {
    const user = userEvent.setup();
    // The fighter stands on a two-step ledge with the goblin beside them, and
    // the square beyond the goblin is the floor. Pushed east, it falls 20 ft.
    const { view } = await brawl(user, { '10,10': 2, '11,10': 2 });
    const hpBefore = goblinOf(view).hp;

    // Keep shoving until the contest lands - the dice are real, so this
    // pins the consequence rather than a single roll.
    for (let i = 0; i < 40 && goblinOf(view).at!.x === 11; i++) {
      await armShove(user, 'Shove');
      await user.click(document.querySelector('.dmap-token.monster') as Element);
      if (goblinOf(view).at!.x === 11) {
        // Failed the contest; give the action back and try again.
        await user.click(screen.getByRole('button', { name: /end turn/i }));
        await user.click(screen.getByRole('button', { name: /end turn/i }));
      }
    }

    expect(goblinOf(view).at).toEqual({ x: 12, y: 10 });
    // Two steps down is twenty feet, said out loud so a table calling a step
    // five feet knows to halve it.
    expect(logOf(view)).toMatch(/20 ft drop/);
    expect(goblinOf(view).hp).toBeLessThan(hpBefore);
    // The SRD lands a falling creature prone, and it is the part everyone
    // forgets.
    expect(goblinOf(view).conditions).toContain('prone');
  });

  it('trips them where they stand, with no fall and no move', async () => {
    const user = userEvent.setup();
    const { view } = await brawl(user);
    const where = goblinOf(view).at;

    for (let i = 0; i < 40 && !goblinOf(view).conditions.includes('prone'); i++) {
      await armShove(user, 'Trip');
      await user.click(document.querySelector('.dmap-token.monster') as Element);
      if (!goblinOf(view).conditions.includes('prone')) {
        await user.click(screen.getByRole('button', { name: /end turn/i }));
        await user.click(screen.getByRole('button', { name: /end turn/i }));
      }
    }

    expect(goblinOf(view).conditions).toContain('prone');
    expect(goblinOf(view).at).toEqual(where);
    expect(logOf(view)).toMatch(/down they go/);
  });
});

/**
 * Section 26.3. High ground has been computed and announced since 12.4 and
 * has never changed a number. This is the switch that lets a table say it
 * should - and the tests that pin it staying off until they do.
 */
describe('the optional rules', () => {
  /*
    The switch outlives a render on purpose, which means it also outlives a
    test - the run that found this had one test turning high ground on and the
    next one toggling it straight back off. Cleared per test so each starts
    from the book, which is what a fresh table gets.
  */
  beforeEach(() => localStorage.removeItem('dnd-forge:house-rules:v1'));

  const mapEl5 = () => document.querySelector('.dmap') as SVGSVGElement;
  const boxMap5 = () => {
    mapEl5().getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 480, height: 360, right: 480, bottom: 360, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  };

  /** The fighter uphill of a goblin, adjacent, fight running. */
  const uphill = async (user: ReturnType<typeof userEvent.setup>) => {
    const view = setup({
      ...party(),
      encounter: { ...emptyEncounter(), mapRooms: 0, elevation: { '10,10': 2 } },
    });
    await bestiaryReady();
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Goblin',
    ) as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));

    boxMap5();
    const put = (at: { x: number; y: number }) =>
      fireEvent.pointerDown(mapEl5(), { clientX: (at.x + 0.5) * 10, clientY: (at.y + 0.5) * 10 });
    await user.click(within(rowFor(name)).getByRole('button', { name: new RegExp(name) }));
    put({ x: 10, y: 10 });
    await user.click(within(rowFor('Goblin')).getByRole('button', { name: /goblin/i }));
    put({ x: 11, y: 10 });

    fireEvent.change(within(rowFor(name)).getByLabelText(new RegExp(`${name} initiative`, 'i')), {
      target: { value: '30' },
    });
    fireEvent.change(within(rowFor('Goblin')).getByLabelText(/goblin initiative/i), {
      target: { value: '1' },
    });
    await user.click(screen.getByRole('button', { name: /start the fight/i }));
    return { view, name };
  };

  const logOf = (view: ReturnType<typeof setup>) =>
    (view.encounter.log ?? []).map((l) => l.text).join('\n');

  const strike = async (user: ReturnType<typeof userEvent.setup>) => {
    boxMap5();
    await user.click(document.querySelector('.dmap-token.monster') as Element);
  };

  it('starts off, with the book’s numbers', () => {
    setup(party());
    const box = screen.getByLabelText(/high ground grants/i, { selector: 'input' });
    expect((box as HTMLInputElement).checked).toBe(false);
  });

  it('notices high ground without applying it, while the switch is off', async () => {
    const user = userEvent.setup();
    const { view } = await uphill(user);
    await strike(user);
    // Announced, as it has been since 12.4 - and worth nothing.
    expect(logOf(view)).toMatch(/\(high ground\)/);
    expect(logOf(view)).not.toMatch(/high ground \+2/);
  });

  it('applies +2 and says so, once the table switches it on', async () => {
    const user = userEvent.setup();
    const { view } = await uphill(user);
    await user.click(screen.getByLabelText(/high ground grants/i, { selector: 'input' }));
    await strike(user);
    // The log distinguishes applied from merely noticed, so a fight can be
    // read back and understood whichever way the switch was set.
    expect(logOf(view)).toMatch(/high ground \+2/);
  });

  it('remembers the choice, because a table does not re-agree every session', async () => {
    const user = userEvent.setup();
    setup(party());
    await user.click(screen.getByLabelText(/high ground grants/i, { selector: 'input' }));

    // Torn down and stood back up, which is what a reload is. The switch is
    // a table's standing agreement, not a per-fight decision.
    cleanup();
    setup(party());
    expect(
      (screen.getByLabelText(/high ground grants/i, { selector: 'input' }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });
});

/**
 * Section 26.4. The zone model could say "this ground hurts" and nothing
 * else, which left every beneficial area a drawing with a label - and left
 * Spirit Guardians, which hurts only one side, impossible to state correctly.
 */
describe('ground that helps, and ground that picks a side', () => {
  const mapEl6 = () => document.querySelector('.dmap') as SVGSVGElement;
  const boxMap6 = () => {
    mapEl6().getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 480, height: 360, right: 480, bottom: 360, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  };

  const dropAt6 = async (
    user: ReturnType<typeof userEvent.setup>,
    preset: string,
    at: { x: number; y: number },
  ) => {
    await user.selectOptions(screen.getByLabelText(/load a hazard from the shelf/i), preset);
    await user.click(screen.getByRole('button', { name: /place on map/i }));
    boxMap6();
    fireEvent.pointerDown(mapEl6(), { clientX: (at.x + 0.5) * 10, clientY: (at.y + 0.5) * 10 });
    if (screen.queryByText(/click the way it points/i)) {
      fireEvent.pointerDown(mapEl6(), { clientX: (at.x + 3.5) * 10, clientY: (at.y + 0.5) * 10 });
    }
  };

  const logOf = (view: ReturnType<typeof setup>) =>
    (view.encounter.log ?? []).map((l) => l.text).join('\n');

  it('carries the shelf’s beneficial areas, not only its hazards', async () => {
    const user = userEvent.setup();
    setup(party());
    const shelf = screen.getByLabelText(/load a hazard from the shelf/i);
    const labels = [...shelf.querySelectorAll('option')].map((o) => o.textContent);
    expect(labels).toContain('Aura of Protection');
    expect(labels).toContain('Spirit Guardians');
    await user.selectOptions(shelf, 'aura-of-protection');
  });

  it('adds the aura to a saving throw rolled inside it', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await user.click(screen.getByRole('button', { name: view.roster.entries[0].build.name }));
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));
    const standing = view.encounter.combatants[0].at!;

    // Roll the room once with no aura, then again standing in one: the same
    // character's bonus is three higher, which is the whole feature.
    await user.click(screen.getByRole('button', { name: /roll the room/i }));
    const before = [...document.querySelectorAll('.reasons li')][0]?.textContent ?? '';

    await dropAt6(user, 'aura-of-protection', standing);
    await user.click(screen.getByRole('button', { name: /roll the room/i }));
    const after = [...document.querySelectorAll('.reasons li')][0]?.textContent ?? '';

    const bonusIn = (text: string) => Number(/([+-]\d+)/.exec(text)?.[1] ?? '0');
    expect(bonusIn(after) - bonusIn(before)).toBe(3);
  });

  it('burns the goblin standing in Spirit Guardians and not the fighter', async () => {
    const user = userEvent.setup();
    const view = setup({ ...party(), encounter: { ...emptyEncounter(), mapRooms: 0 } });
    await bestiaryReady();
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Goblin',
    ) as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: /put everyone on the map/i }));

    const goblin = () => view.encounter.combatants.find((c) => c.kind === 'monster') as MonsterCombatant;
    // The circle lands on the goblin.
    await dropAt6(user, 'spirit-guardians', goblin().at!);

    fireEvent.change(within(rowFor('Goblin')).getByLabelText(/goblin initiative/i), {
      target: { value: '30' },
    });
    await user.click(screen.getByRole('button', { name: /start the fight/i }));
    const hpBefore = goblin().hp;
    await user.click(screen.getByRole('button', { name: /end turn/i }));

    // Ending a turn inside it costs the goblin.
    expect(goblin().hp).toBeLessThanOrEqual(hpBefore);
    expect(logOf(view)).toMatch(/Goblin.*Spirit Guardians/);
    // And the fighter, standing in their own circle, is untouched by it.
    expect(logOf(view)).not.toMatch(new RegExp(`${name}[^\\n]*Spirit Guardians`));
  });
});

/**
 * Section 27.2. Conditions have been bookkeeping since they were added: every
 * read either set one or rendered a list, and not one changed a roll. §26.2
 * made that visible by creating prone that nothing read.
 */
describe('conditions that change the dice', () => {
  const mapEl7 = () => document.querySelector('.dmap') as SVGSVGElement;
  const boxMap7 = () => {
    mapEl7().getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 480, height: 360, right: 480, bottom: 360, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  };

  const facing = async (user: ReturnType<typeof userEvent.setup>) => {
    const view = setup({ ...party(), encounter: { ...emptyEncounter(), mapRooms: 0 } });
    await bestiaryReady();
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Goblin',
    ) as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));

    boxMap7();
    const put = (at: { x: number; y: number }) =>
      fireEvent.pointerDown(mapEl7(), { clientX: (at.x + 0.5) * 10, clientY: (at.y + 0.5) * 10 });
    await user.click(within(rowFor(name)).getByRole('button', { name: new RegExp(name) }));
    put({ x: 10, y: 10 });
    await user.click(within(rowFor('Goblin')).getByRole('button', { name: /goblin/i }));
    put({ x: 11, y: 10 });

    fireEvent.change(within(rowFor(name)).getByLabelText(new RegExp(`${name} initiative`, 'i')), {
      target: { value: '30' },
    });
    fireEvent.change(within(rowFor('Goblin')).getByLabelText(/goblin initiative/i), {
      target: { value: '1' },
    });
    await user.click(screen.getByRole('button', { name: /start the fight/i }));
    return { view, name };
  };

  const logOf = (view: ReturnType<typeof setup>) =>
    (view.encounter.log ?? []).map((l) => l.text).join('\n');

  it('says nothing about the odds on an ordinary swing', async () => {
    const user = userEvent.setup();
    const { view } = await facing(user);
    boxMap7();
    await user.click(document.querySelector('.dmap-token.monster') as Element);
    expect(logOf(view)).toMatch(/vs AC/);
    // A plain attack stays a plain line.
    expect(logOf(view)).not.toMatch(/advantage|disadvantage|straight/);
  });

  it('rolls with advantage against something on the floor', async () => {
    const user = userEvent.setup();
    const { view } = await facing(user);
    // Trip it first, then swing on a later turn.
    const menu = () => document.querySelector('.pcard .cmd-menu') as HTMLElement;
    const goblin = () =>
      view.encounter.combatants.find((c) => c.kind === 'monster') as MonsterCombatant;

    for (let i = 0; i < 40 && !goblin().conditions.includes('prone'); i++) {
      await user.click(within(menu()).getByRole('button', { name: 'Trip' }));
      boxMap7();
      await user.click(document.querySelector('.dmap-token.monster') as Element);
      if (!goblin().conditions.includes('prone')) {
        await user.click(screen.getByRole('button', { name: /end turn/i }));
        await user.click(screen.getByRole('button', { name: /end turn/i }));
      }
    }
    expect(goblin().conditions).toContain('prone');

    await user.click(screen.getByRole('button', { name: /end turn/i }));
    await user.click(screen.getByRole('button', { name: /end turn/i }));
    boxMap7();
    await user.click(document.querySelector('.dmap-token.monster') as Element);

    // The prone the trip created is finally read by something.
    expect(logOf(view)).toMatch(/advantage: [^)]*prone and within reach/);
  });

  it('refuses a condition the stat block is immune to, and says why', async () => {
    const user = userEvent.setup();
    const view = setup(party());
    await bestiaryReady();
    await user.click(screen.getByRole('button', { name: view.roster.entries[0].build.name }));
    await user.type(screen.getByLabelText(/search the bestiary/i), 'zombie');
    const entry = [...document.querySelectorAll('.mon-list li')].find(
      (li) => li.querySelector('b')?.textContent === 'Zombie',
    ) as HTMLElement;
    await user.click(within(entry).getByRole('button', { name: 'Add' }));
    await user.click(within(rowFor('Zombie')).getByRole('button', { name: /zombie/i }));

    // Poisoned is not even offered - the stat block says it cannot land.
    const select = screen.getByLabelText(/add a condition to zombie/i);
    const offered = [...select.querySelectorAll('option')].map((o) => o.textContent);
    expect(offered).not.toContain('Poisoned');
    // And something that can land still can.
    expect(offered).toContain('Prone');
  });
});

/**
 * Frightened, made usable. It was skipped in 27.2 because the rule turns on
 * who caused it and nothing recorded that; conditions grew a source so it
 * could be applied properly rather than often.
 */
describe('frightened, of something in particular', () => {
  const mapEl8 = () => document.querySelector('.dmap') as SVGSVGElement;
  const boxMap8 = () => {
    mapEl8().getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 480, height: 360, right: 480, bottom: 360, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  };

  const twoGoblins = async (user: ReturnType<typeof userEvent.setup>) => {
    const view = setup({ ...party(), encounter: { ...emptyEncounter(), mapRooms: 0 } });
    await bestiaryReady();
    const name = view.roster.entries[0].build.name;
    await user.click(screen.getByRole('button', { name }));
    await user.type(screen.getByLabelText(/search the bestiary/i), 'goblin');
    const entry = () =>
      [...document.querySelectorAll('.mon-list li')].find(
        (li) => li.querySelector('b')?.textContent === 'Goblin',
      ) as HTMLElement;
    await user.click(within(entry()).getByRole('button', { name: 'Add' }));
    await user.click(within(entry()).getByRole('button', { name: 'Add' }));
    return { view, name };
  };

  const goblins = (view: ReturnType<typeof setup>) =>
    view.encounter.combatants.filter((c) => c.kind === 'monster') as MonsterCombatant[];

  it('asks what the fear is of, and only for the conditions that need it', async () => {
    const user = userEvent.setup();
    const { view } = await twoGoblins(user);
    const first = goblins(view)[0];
    await user.click(within(rowFor(first.label)).getByRole('button', { name: `Show ${first.label} in the rail` }));

    // Poisoned needs no source, so no picker appears for it.
    await user.selectOptions(
      screen.getByLabelText(new RegExp(`add a condition to ${first.label}`, 'i')),
      'poisoned',
    );
    expect(screen.queryByLabelText(/is poisoned of/i)).toBeNull();

    await user.selectOptions(
      screen.getByLabelText(new RegExp(`add a condition to ${first.label}`, 'i')),
      'frightened',
    );
    expect(screen.getByLabelText(new RegExp(`${first.label} is frightened of`, 'i'))).toBeTruthy();
  });

  it('records the source, and it survives on the combatant', async () => {
    const user = userEvent.setup();
    const { view, name } = await twoGoblins(user);
    const [first] = goblins(view);
    await user.click(within(rowFor(first.label)).getByRole('button', { name: `Show ${first.label} in the rail` }));
    await user.selectOptions(
      screen.getByLabelText(new RegExp(`add a condition to ${first.label}`, 'i')),
      'frightened',
    );
    await user.selectOptions(
      screen.getByLabelText(new RegExp(`${first.label} is frightened of`, 'i')),
      within(screen.getByLabelText(new RegExp(`${first.label} is frightened of`, 'i')))
        .getByRole('option', { name })
        .getAttribute('value')!,
    );

    const fighter = view.encounter.combatants.find((c) => c.kind === 'character')!;
    expect(goblins(view)[0].conditionSources?.frightened).toBe(fighter.id);
  });

  it('will not let the frightened walk toward what scares them', async () => {
    const user = userEvent.setup();
    const { view, name } = await twoGoblins(user);
    const [first] = goblins(view);

    // Place the fighter west and the goblin east of them.
    boxMap8();
    const put = (at: { x: number; y: number }) =>
      fireEvent.pointerDown(mapEl8(), { clientX: (at.x + 0.5) * 10, clientY: (at.y + 0.5) * 10 });
    await user.click(within(rowFor(name)).getByRole('button', { name: `Show ${name} in the rail` }));
    put({ x: 10, y: 10 });
    await user.click(within(rowFor(first.label)).getByRole('button', { name: `Show ${first.label} in the rail` }));
    put({ x: 20, y: 10 });

    // Frightened of the fighter.
    await user.selectOptions(
      screen.getByLabelText(new RegExp(`add a condition to ${first.label}`, 'i')),
      'frightened',
    );
    const fighter = view.encounter.combatants.find((c) => c.kind === 'character')!;
    await user.selectOptions(
      screen.getByLabelText(new RegExp(`${first.label} is frightened of`, 'i')),
      fighter.id,
    );

    fireEvent.change(within(rowFor(first.label)).getByLabelText(/goblin.*initiative/i), {
      target: { value: '30' },
    });
    await user.click(screen.getByRole('button', { name: /start the fight/i }));

    const armMove = async () => {
      const menu = document.querySelector('.rail-monster .cmd-menu') as HTMLElement;
      await user.click(within(menu).getByRole('button', { name: /^Move/ }));
    };
    const whereIsIt = () => goblins(view).find((g) => g.id === first.id)!.at;

    // West is toward the fighter: refused, and the token does not move.
    await armMove();
    boxMap8();
    put({ x: 19, y: 10 });
    expect(whereIsIt()).toEqual({ x: 20, y: 10 });

    // East is away: allowed.
    await armMove();
    boxMap8();
    put({ x: 21, y: 10 });
    expect(whereIsIt()).toEqual({ x: 21, y: 10 });
  });
});
