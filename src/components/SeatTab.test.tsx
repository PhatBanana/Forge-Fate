// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SeatTab } from './SeatTab';
import { fighter, rosterOf, wizard } from '../test/factories';
import { addCharacter, emptyEncounter, nextTurn } from '../encounter';
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
  /* The mocks stay concretely typed by living outside the spread. */
  const onChange = vi.fn();
  const onPlansChange = vi.fn();
  const onSeatsChange = vi.fn();
  const onSeatChange = vi.fn();
  render(
    <SeatTab
      roster={rosterOf(fighter(), wizard())}
      onChange={onChange}
      plans={[] as Intent[]}
      onPlansChange={onPlansChange}
      seats={[] as Seat[]}
      onSeatsChange={onSeatsChange}
      seatId={null}
      onSeatChange={onSeatChange}
      {...over}
    />,
  );
  return { onChange, onPlansChange, onSeatsChange, onSeatChange };
}

describe('taking a seat', () => {
  it('offers every roster character and claims the chair picked', async () => {
    const user = userEvent.setup();
    const props = seat();
    await user.click(screen.getByRole('button', { name: 'Sit as Basher' }));
    expect(props.onSeatChange).toHaveBeenCalledWith('c0');
    expect(props.onSeatsChange).toHaveBeenCalled();
    const claimed = props.onSeatsChange.mock.calls[0][0] as Seat[];
    expect(claimed.map((s) => s.rosterId)).toEqual(['c0']);
  });

  it('shows the seated character with their sheet, and tells the truth about the fight', () => {
    seat({ seatId: 'c0' });
    // Twice on purpose: the panel names the seat, the play card names itself.
    expect(screen.getAllByText('Basher').length).toBeGreaterThan(0);
    // Nobody has seated them at the table, and the screen says whose job that is.
    expect(screen.getByText(/You are not in this fight/)).toBeInTheDocument();
    // The play surface is the sheet's own card.
    expect(screen.getByText(/hit points/i)).toBeInTheDocument();
  });

  it('says the fight has not started while they wait in the order', () => {
    const roster = rosterOf(fighter(), wizard());
    const enc = addCharacter(emptyEncounter(), 'c0');
    seat({ roster: updateEncounter(roster, enc), seatId: 'c0' });
    expect(screen.getByText(/The fight has not started/)).toBeInTheDocument();
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

    const queued = props.onPlansChange.mock.calls[0][0] as Intent[];
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ kind: 'dodge', note: 'behind the pillar' });
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
