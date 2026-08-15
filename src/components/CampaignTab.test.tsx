// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampaignTab } from './CampaignTab';
import { fighter, rosterOf, wizard } from '../test/factories';
import { activeCampaign, addCampaign, emptyCampaigns, loadCampaigns, saveCampaigns } from '../campaign';

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
