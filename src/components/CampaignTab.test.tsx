// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampaignTab } from './CampaignTab';
import { fighter, rosterOf, wizard } from '../test/factories';
import {
  activeCampaign,
  addCampaign,
  emptyCampaigns,
  layToRest,
  loadCampaigns,
  saveCampaigns,
  updateCampaign,
} from '../campaign';

/**
 * The campaign workshop.
 *
 * What is being checked here is mostly that this tab **reads** the roster and
 * never writes it: choosing who is at the table is not editing a character,
 * and the one thing this page must not be able to do is lose one.
 */

const roster = () => rosterOf(fighter(), wizard());

beforeEach(() => localStorage.clear());

describe('starting one', () => {
  it('names it, saves it, and makes it the one being played', async () => {
    const user = userEvent.setup();
    render(<CampaignTab roster={roster()} />);
    await user.type(screen.getByLabelText(/name this campaign/i), 'The Sunless Citadel');
    await user.click(screen.getByRole('button', { name: /start one/i }));

    expect(screen.getByText('The Sunless Citadel')).toBeInTheDocument();
    expect(activeCampaign(loadCampaigns())?.name).toBe('The Sunless Citadel');
    // And the panels that only exist once there is a campaign.
    expect(screen.getByText('The party')).toBeInTheDocument();
    expect(screen.getByText('The chronicle')).toBeInTheDocument();
  });

  it('says nothing has been fought yet rather than showing an empty list', async () => {
    const user = userEvent.setup();
    render(<CampaignTab roster={roster()} />);
    // §76: a name first - the nameless press used to invent "A new campaign".
    await user.type(screen.getByLabelText(/name this campaign/i), 'Quiet');
    await user.click(screen.getByRole('button', { name: /start one/i }));
    expect(screen.getByText(/Nothing fought yet/)).toBeInTheDocument();
  });
});

describe('the party', () => {
  it('picks from the roster without touching it', async () => {
    const user = userEvent.setup();
    const start = roster();
    const before = JSON.stringify(start);
    render(<CampaignTab roster={start} />);
    await user.type(screen.getByLabelText(/name this campaign/i), 'Ours');
    await user.click(screen.getByRole('button', { name: /start one/i }));

    const name = start.entries[0].build.name;
    await user.click(screen.getByRole('checkbox', { name: new RegExp(name) }));
    expect(activeCampaign(loadCampaigns())?.partyIds).toEqual([start.entries[0].id]);
    // The roster object handed in is the same one it was.
    expect(JSON.stringify(start)).toBe(before);
  });

  it('says so when somebody in the party is no longer on the roster', async () => {
    saveCampaigns({
      ...addCampaign(emptyCampaigns(), 'Ours'),
      campaigns: [
        {
          ...addCampaign(emptyCampaigns(), 'Ours').campaigns[0],
          partyIds: ['a-character-who-was-deleted'],
        },
      ],
    });
    const file = loadCampaigns();
    saveCampaigns({ ...file, activeId: file.campaigns[0].id });
    render(<CampaignTab roster={roster()} />);
    expect(screen.getByText(/no longer on the roster/)).toBeInTheDocument();
  });
});

describe('the chronicle', () => {
  it('reads back what the debrief wrote, newest first', () => {
    const started = addCampaign(emptyCampaigns(), 'Ours');
    const id = started.campaigns[0].id;
    saveCampaigns({
      ...started,
      campaigns: [
        {
          ...started.campaigns[0],
          chronicle: [
            { id: 'b', at: 2, defeated: '2× Hobgoblin', xp: 200, rounds: 4, mvp: 'Sera' },
            { id: 'a', at: 1, defeated: 'Goblin', xp: 50, rounds: 1 },
          ],
        },
      ],
      activeId: id,
    });
    render(<CampaignTab roster={roster()} />);
    const panel = screen.getByText('The chronicle').closest('.panel') as HTMLElement;
    const rows = [...panel.querySelectorAll('.zone-row')].map((r) => r.textContent);
    expect(rows[0]).toContain('2× Hobgoblin');
    expect(rows[0]).toContain('Sera');
    expect(rows[1]).toContain('Goblin');
    expect(within(panel).getByText(/250 XP across 2 fights/)).toBeInTheDocument();
  });
});

describe('closing one down', () => {
  it('deletes it and the panels go with it', async () => {
    const user = userEvent.setup();
    render(<CampaignTab roster={roster()} />);
    await user.type(screen.getByLabelText(/name this campaign/i), 'Brief');
    await user.click(screen.getByRole('button', { name: /start one/i }));
    // §76: the first press only asks - a campaign's chronicle cannot be
    // rebuilt from anything else in the app.
    await user.click(screen.getByRole('button', { name: /delete brief/i }));
    expect(loadCampaigns().campaigns).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /really delete/i }));
    expect(screen.queryByText('The chronicle')).not.toBeInTheDocument();
    expect(loadCampaigns().campaigns).toEqual([]);
  });

  it('will not start a campaign with no name (§76)', () => {
    render(<CampaignTab roster={roster()} />);
    expect(screen.getByRole('button', { name: /start one/i })).toBeDisabled();
  });
});

/**
 * §84. The way back.
 *
 * This screen needs both recorders and so it is the one that checks both: its
 * presses are decisions and stay separate, its one text box is typing and
 * coalesces. The case that matters most is a deleted campaign - the one
 * record in the app that cannot be rebuilt from anything else.
 */
describe('undo', () => {
  const start = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    await user.type(screen.getByLabelText(/name this campaign/i), name);
    await user.click(screen.getByRole('button', { name: /start one/i }));
  };

  it('offers nothing to undo on an empty screen', () => {
    render(<CampaignTab roster={roster()} />);
    expect(screen.queryByRole('button', { name: /↶ Undo/ })).not.toBeInTheDocument();
  });

  it('brings back a deleted campaign, chronicle and all', async () => {
    const user = userEvent.setup();
    saveCampaigns(addCampaign(emptyCampaigns(), 'The Sunless Citadel'));
    render(<CampaignTab roster={roster()} />);

    await user.click(screen.getByRole('button', { name: /delete the sunless citadel/i }));
    await user.click(screen.getByRole('button', { name: /really delete/i }));
    expect(loadCampaigns().campaigns).toEqual([]);

    // The button stays on screen with nothing left to list, which is exactly
    // when it is needed.
    await user.click(screen.getByRole('button', { name: /↶ Undo/ }));
    expect(activeCampaign(loadCampaigns())?.name).toBe('The Sunless Citadel');
    expect(screen.getByText('The Sunless Citadel')).toBeInTheDocument();
  });

  it('puts the deletion back on Redo', async () => {
    const user = userEvent.setup();
    saveCampaigns(addCampaign(emptyCampaigns(), 'Brief'));
    render(<CampaignTab roster={roster()} />);
    await user.click(screen.getByRole('button', { name: /delete brief/i }));
    await user.click(screen.getByRole('button', { name: /really delete/i }));
    await user.click(screen.getByRole('button', { name: /↶ Undo/ }));
    await user.click(screen.getByRole('button', { name: /↷ Redo/ }));
    expect(loadCampaigns().campaigns).toEqual([]);
  });

  it('keeps two quick presses as two steps', async () => {
    const user = userEvent.setup();
    const start_ = roster();
    render(<CampaignTab roster={start_} />);
    await start(user, 'Ours');
    // Straight into ticking somebody in - fast enough that a coalescing
    // recorder would fold the two together and lose the campaign on one press.
    await user.click(screen.getByRole('checkbox', { name: new RegExp(start_.entries[0].build.name) }));
    expect(activeCampaign(loadCampaigns())?.partyIds).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /↶ Undo/ }));
    expect(activeCampaign(loadCampaigns())?.partyIds).toEqual([]);
    // And the campaign itself is still there.
    expect(activeCampaign(loadCampaigns())?.name).toBe('Ours');
  });

  it('takes a sentence of notes back in one press, not sixty', async () => {
    const user = userEvent.setup();
    render(<CampaignTab roster={roster()} />);
    await start(user, 'Ours');
    await user.type(screen.getByLabelText(/campaign notes/i), 'the door was trapped');
    expect(activeCampaign(loadCampaigns())?.notes).toBe('the door was trapped');

    await user.click(screen.getByRole('button', { name: /↶ Undo/ }));
    expect(activeCampaign(loadCampaigns())?.notes).toBe('');
  });
});

describe('the Fallen (§91)', () => {
  const withFallen = () => {
    let file = addCampaign(emptyCampaigns(), 'Ours');
    file = updateCampaign(file, file.campaigns[0].id, (c) =>
      layToRest(c, { name: 'Sera', where: 'The Sunken Vault, room 3' }),
    );
    saveCampaigns(file);
  };

  it('keeps the graveyard off a campaign with nobody dead', async () => {
    const user = userEvent.setup();
    render(<CampaignTab roster={roster()} />);
    await user.type(screen.getByLabelText(/name this campaign/i), 'Quiet');
    await user.click(screen.getByRole('button', { name: /start one/i }));
    expect(screen.queryByText('The fallen')).toBeNull();
  });

  it('reads the roll with the where, and takes the DM\'s words', async () => {
    withFallen();
    const user = userEvent.setup();
    render(<CampaignTab roster={roster()} />);
    expect(screen.getByText('The fallen')).toBeInTheDocument();
    expect(screen.getByText(/The Sunken Vault, room 3/)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/epitaph for Sera/i), 'she held the door');
    expect(activeCampaign(loadCampaigns())?.fallen?.[0].epitaph).toBe('she held the door');
  });

  it('strikes a name only when asked twice, like every deletion since §76', async () => {
    withFallen();
    const user = userEvent.setup();
    render(<CampaignTab roster={roster()} />);
    await user.click(screen.getByRole('button', { name: /strike sera from the roll/i }));
    // Still there - the first press only arms the confirm.
    expect(activeCampaign(loadCampaigns())?.fallen).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /really strike/i }));
    expect(activeCampaign(loadCampaigns())?.fallen).toBeUndefined();
    expect(screen.queryByText('The fallen')).toBeNull();
  });
});
