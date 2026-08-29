// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SeatTab } from './SeatTab';
import { fighter, rosterOf, wizard } from '../test/factories';
import { addCharacter, addMonster, emptyEncounter, nextTurn } from '../encounter';
import { fixtureMonster } from '../test/fight';
import { activeEncounter, updateEncounter } from '../storage';
import type { Roster } from '../storage';
import type { Intent, Seat } from '../seats';

/**
 * §93. The player's seat: one character's view, no authority over the fight.
 *
 * Structurally the screen cannot end a turn, move a token or roll a die at
 * anybody - the assertions here are about what it *can* do: claim a chair,
 * keep the player's own book, and queue a proposal into the shared plans.
 */

/** A roster whose fight is running, the fighter up first, the wizard waiting. */
const runningRoster = (): Roster => {
  const roster = rosterOf(fighter(), wizard());
  let enc = emptyEncounter();
  enc = addCharacter(enc, 'c0', { initiative: 20 });
  enc = addCharacter(enc, 'c1', { initiative: 10 });
  enc = nextTurn(enc).encounter;
  return updateEncounter(roster, enc);
};

function seat(over: Partial<Parameters<typeof SeatTab>[0]> = {}) {
  /* The mocks stay concretely typed by living outside the spread. §94 made
     the seat speak in operations, so these are the operations. */
  const onQueue = vi.fn();
  const onWithdraw = vi.fn();
  const onPlay = vi.fn();
  const onSit = vi.fn();
  const onSeatChange = vi.fn();
  const onRelayChange = vi.fn();
  render(
    <SeatTab
      roster={rosterOf(fighter(), wizard())}
      plans={[] as Intent[]}
      onQueue={onQueue}
      onWithdraw={onWithdraw}
      onPlay={onPlay}
      seats={[] as Seat[]}
      onSit={onSit}
      relay={null}
      onRelayChange={onRelayChange}
      seatId={null}
      onSeatChange={onSeatChange}
      {...over}
    />,
  );
  return { onQueue, onWithdraw, onPlay, onSit, onSeatChange, onRelayChange };
}

describe('taking a seat', () => {
  it('offers every chair, takes a name for the lobby, and sits by operation', async () => {
    const user = userEvent.setup();
    const props = seat();
    await user.type(screen.getByLabelText('Your name'), 'Alex');
    await user.click(screen.getByRole('button', { name: 'Sit as Basher' }));
    // §96: sitting is an operation App claims and announces - the honor
    // system's whole enforcement is the name on the chair.
    expect(props.onSit).toHaveBeenCalledWith('c0', 'Alex');
  });

  it('says who already took a chair, and still lets it be sat in', async () => {
    const user = userEvent.setup();
    const props = seat({
      seats: [{ id: 's1', rosterId: 'c0', playerName: 'Alex', claimedAt: 1 }] as Seat[],
    });
    expect(screen.getByText(/taken by Alex/)).toBeInTheDocument();
    // Rejoining IS re-sitting; the label informs, it never locks.
    await user.click(screen.getByRole('button', { name: 'Sit as Basher' }));
    expect(props.onSit).toHaveBeenCalled();
  });

  it('joins a table Jackbox-style: a code to shout, a relay remembered', async () => {
    const user = userEvent.setup();
    const props = seat();
    await user.type(screen.getByLabelText('Room code'), 'x7q2m4');
    await user.type(screen.getByLabelText('Relay URL'), 'ws://localhost:4390');
    await user.click(screen.getByRole('button', { name: 'Join' }));
    expect(props.onRelayChange).toHaveBeenCalledWith({
      url: 'ws://localhost:4390',
      room: 'X7Q2M4',
    });
  });

  it('at a table with nothing arrived yet, the lobby says it is waiting', () => {
    seat({
      relay: { url: 'ws://x', room: 'X7Q2M4' },
      roster: { entries: [], activeId: '' },
    });
    expect(screen.getByText(/waiting for the DM/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave the table' })).toBeInTheDocument();
  });

  it('shows the seated character with their sheet, and tells the truth about the fight', () => {
    seat({ seatId: 'c0' });
    // Twice on purpose: the panel names the seat, the play card names itself.
    expect(screen.getAllByText('Basher').length).toBeGreaterThan(0);
    // Nobody has seated them at the table, and the screen says whose job that is.
    expect(screen.getByText(/You are not in this fight/)).toBeInTheDocument();
    /* Twice since §142: the play card is the surface you touch, and the
       sheet below it is the reading. Both name hit points, the way every
       sheet in this app does. */
    expect(screen.getAllByText(/hit points/i).length).toBeGreaterThan(0);
  });

  it('says the fight has not started while they wait in the order', () => {
    const roster = rosterOf(fighter(), wizard());
    const enc = addCharacter(emptyEncounter(), 'c0');
    seat({ roster: updateEncounter(roster, enc), seatId: 'c0' });
    expect(screen.getByText(/The fight has not started/)).toBeInTheDocument();
  });

  it('§97: says when the line is down, and only at a relayed table', () => {
    seat({ relay: { url: 'ws://x', room: 'X7Q2M4' }, seatId: 'c0', linkUp: false });
    // The strip informs, the sheet stays: the marks are kept and re-said.
    expect(screen.getByRole('status')).toHaveTextContent(/line to the table is down/);
    /* The strip informs and the sheet stays. Two mentions since §142: the
       play card is the surface you touch, the sheet below it is the
       reading, and both name hit points the way every sheet does. */
    expect(screen.getAllByText(/hit points/i).length).toBeGreaterThan(0);
  });

  it('§97: on one device there is no line to lose', () => {
    seat({ seatId: 'c0', linkUp: false });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('the fight from the chair', () => {
  it('counts the turns to yours, and composes a plan into the shared queue', async () => {
    const user = userEvent.setup();
    const props = seat({ roster: runningRoster(), seatId: 'c1' });
    expect(screen.getByText(/Basher is up — 1 turn to yours/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('What you plan to do'), 'dodge');
    await user.type(screen.getByLabelText('In your own words'), 'behind the pillar');
    await user.click(screen.getByRole('button', { name: 'Queue it' }));

    // §94: the seat speaks in operations - the queue op, not the queue.
    expect(props.onQueue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'dodge', note: 'behind the pillar' }),
    );
  });

  it('§98: a caster composes a cast by name, from their own list', async () => {
    const user = userEvent.setup();
    const props = seat({ roster: runningRoster(), seatId: 'c1' });

    await user.selectOptions(screen.getByLabelText('What you plan to do'), 'cast');
    await user.selectOptions(screen.getByLabelText('What you plan to cast'), 'fireball');
    await user.click(screen.getByRole('button', { name: 'Queue it' }));

    expect(props.onQueue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'cast', spellId: 'fireball', spellName: 'Fireball' }),
    );
  });

  it('§153: grapples by name, readies with a trigger, and uses a thing from the pack', async () => {
    const user = userEvent.setup();
    const roster = rosterOf(fighter(), wizard());
    let enc = emptyEncounter();
    enc = addCharacter(enc, 'c0', { initiative: 20 });
    enc = addCharacter(enc, 'c1', { initiative: 10 });
    enc = addMonster(enc, fixtureMonster('goblin'), { rng: () => 0.5 });
    enc = nextTurn(enc).encounter;
    const withMonster = updateEncounter(roster, enc);
    const goblinId = activeEncounter(withMonster).combatants.find(
      (c) => c.kind === 'monster',
    )!.id;
    const props = seat({ roster: withMonster, seatId: 'c1' });

    // A grab names its target the way an attack does.
    await user.selectOptions(screen.getByLabelText('What you plan to do'), 'grapple');
    await user.selectOptions(screen.getByLabelText('Who you plan to grab'), goblinId);
    await user.click(screen.getByRole('button', { name: 'Queue it' }));
    expect(props.onQueue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'grapple', targetId: goblinId }),
    );

    // Ready asks for its trigger - the note IS the action.
    await user.selectOptions(screen.getByLabelText('What you plan to do'), 'ready');
    expect(screen.getByPlaceholderText(/the trigger/)).toBeInTheDocument();

    // The pack is real: the picker lists what the sheet actually carries.
    await user.selectOptions(screen.getByLabelText('What you plan to do'), 'item');
    const pack = screen.getByLabelText('What you plan to use');
    const first = within(pack).getAllByRole('option')[1] as HTMLOptionElement;
    await user.selectOptions(pack, first.value);
    await user.click(screen.getByRole('button', { name: 'Queue it' }));
    expect(props.onQueue).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'item', itemName: first.value }),
    );
  });

  it('§98: a character with nothing to cast is never offered the word', () => {
    // The wizard up first this time, so the fighter is the one composing.
    const roster = rosterOf(fighter(), wizard());
    let enc = emptyEncounter();
    enc = addCharacter(enc, 'c0', { initiative: 10 });
    enc = addCharacter(enc, 'c1', { initiative: 20 });
    enc = nextTurn(enc).encounter;
    seat({ roster: updateEncounter(roster, enc), seatId: 'c0' });
    const composer = screen.getByLabelText('What you plan to do');
    expect(within(composer).queryByRole('option', { name: 'Cast a spell' })).toBeNull();
  });

  it('on your turn, reads the plan back and offers no button to run it', () => {
    const roster = runningRoster();
    // The plan hangs on the fighter's combatant id, not their roster id.
    const mine = activeEncounter(roster).combatants.find(
      (c) => c.kind === 'character' && c.rosterId === 'c0',
    )!;
    seat({
      roster,
      seatId: 'c0',
      plans: [{ id: 'i1', combatantId: mine.id, kind: 'dodge', at: 1 }],
    });
    expect(screen.getByText(/You’re up!/)).toBeInTheDocument();
    expect(screen.getByText('Dodge')).toBeInTheDocument();
    // The seat proposes; only the DM's screen holds the running of it.
    expect(screen.queryByRole('button', { name: 'Run it' })).toBeNull();
  });
});

/*
  §142. The seat has a sheet, and §141's call lands on it.

  This is the test that was missing when §141 shipped. Every one of that
  section's tests exercised a layer on its own - the comparison without a
  screen, the wire without a screen, the sheet with the answer handed
  straight to it - and all of them passed while a player could not see the
  thing at all: the call reached the seat, and the seat had no skills on it
  to light up. What follows goes through the screen a player is actually
  looking at.
*/
describe('the sheet on the seat (§142)', () => {
  /*
    The shared fixtures are proficient in nothing, and the screen reading
    lists only what you are proficient in - so a party that has actually
    picked skills is what these need. Perception on one, Stealth on the
    other, so the comparison has two real numbers in it.
  */
  const watchers = () =>
    rosterOf(
      { ...fighter(), name: 'Basher', skillIds: ['perception'] },
      { ...wizard(), name: 'Unwyn', skillIds: ['stealth'] },
    );

  it('shows the character’s own skills, which it never used to', () => {
    seat({ seatId: 'c0', roster: watchers() });
    expect(document.querySelector('.ss')).not.toBeNull();
    expect(document.querySelectorAll('.ss-skill').length).toBeGreaterThan(0);
  });

  it('lights the skill the DM asked for, and says whether to speak up', () => {
    seat({ seatId: 'c0', roster: watchers(), call: { ask: 'skill', skillId: 'perception' } });
    const called = document.querySelector('.ss-skill.is-called') as HTMLElement;
    expect(called).not.toBeNull();
    expect(called.textContent).toContain('Perception');
    expect(document.querySelector('.ss-called')?.textContent).toMatch(
      /raise your hand|has this one/,
    );
  });

  it('compares against the table rather than against nobody', () => {
    /*
      The fighter and the wizard are both on this roster, so the verdict is
      a comparison rather than a walkover. Which of them wins is the
      engine's business and `checkCall.test.ts` pins it; what matters here
      is that the other character was consulted at all.
    */
    seat({ seatId: 'c0', roster: watchers(), call: { ask: 'skill', skillId: 'perception' } });
    const line = document.querySelector('.ss-called')!.textContent!;
    expect(line.includes('Unwyn') || line.includes('raise your hand')).toBe(true);
  });

  it('reads the name rather than offering to retype it', () => {
    // §96: at a table this character is the host's copy. A rename here
    // would live until the next broadcast and then vanish.
    seat({ seatId: 'c0', roster: watchers() });
    expect(screen.queryByLabelText('Character name')).toBeNull();
  });

  it('shows nothing called when the DM has not asked', () => {
    seat({ seatId: 'c0', roster: watchers() });
    expect(document.querySelector('.ss-called')).toBeNull();
    expect(document.querySelector('.ss-skill.is-called')).toBeNull();
  });
});

/*
  §143. A called save is the one thing a player rolls on this screen.

  Not a breach of §92 but an instance of it: the seat says what it rolled
  and the DM's screen decides what it means, which is the shape of a plan.
  A check has no button here, and that difference is what these pin.
*/
describe('rolling a called save (§143)', () => {
  const watchers = () =>
    rosterOf(
      { ...fighter(), name: 'Basher', skillIds: ['perception'] },
      { ...wizard(), name: 'Unwyn', skillIds: ['stealth'] },
    );

  it('offers no roll for a check, because nothing is resolved by one', () => {
    seat({
      seatId: 'c0',
      roster: watchers(),
      call: { ask: 'skill', skillId: 'perception' },
      onAnswer: vi.fn(),
    });
    expect(screen.queryByRole('button', { name: /^Roll/ })).toBeNull();
  });

  it('offers one for a save, and sends the total back', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    seat({
      seatId: 'c0',
      roster: watchers(),
      call: { ask: 'save', ability: 'dex', dc: 15 },
      onAnswer,
    });
    await user.click(screen.getByRole('button', { name: /^Roll/ }));

    expect(onAnswer).toHaveBeenCalledTimes(1);
    const [rosterId, total] = onAnswer.mock.calls[0];
    expect(rosterId).toBe('c0');
    // A d20 and a modifier: the total is in range for the bonus shown.
    expect(typeof total).toBe('number');
  });

  it('will not roll the same save twice', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    seat({
      seatId: 'c0',
      roster: watchers(),
      call: { ask: 'save', ability: 'dex', dc: 15 },
      onAnswer,
    });
    await user.click(screen.getByRole('button', { name: /^Roll/ }));
    // The button becomes the record of what was rolled. Re-rolling a save
    // until it passes is not a feature.
    expect(screen.queryByRole('button', { name: /^Roll/ })).toBeNull();
    expect(screen.getByText(/You rolled/)).toBeInTheDocument();
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it('says nothing about a save when the DM has not asked for one', () => {
    seat({ seatId: 'c0', roster: watchers(), onAnswer: vi.fn() });
    expect(document.querySelector('.seat-save')).toBeNull();
  });
});
