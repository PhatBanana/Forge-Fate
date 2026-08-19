// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CHRONICLE_LIMIT,
  activeCampaign,
  addCampaign,
  emptyCampaigns,
  layToRest,
  loadCampaigns,
  remember,
  removeCampaign,
  saveCampaigns,
  strikeMemorial,
  toggleMember,
  totalEarned,
  updateCampaign,
  writeEpitaph,
} from './campaign';

beforeEach(() => {
  localStorage.clear();
});

describe('the drawer', () => {
  it('is empty and harmless before anything is written', () => {
    expect(loadCampaigns()).toEqual({ campaigns: [] });
  });

  it('round-trips', () => {
    const file = addCampaign(emptyCampaigns(), 'The Sunless Citadel');
    saveCampaigns(file);
    const back = loadCampaigns();
    expect(back.campaigns.map((c) => c.name)).toEqual(['The Sunless Citadel']);
    expect(activeCampaign(back)?.name).toBe('The Sunless Citadel');
  });

  it('survives garbage without taking the app down', () => {
    localStorage.setItem('dnd-forge:campaigns:v1', '{"campaigns": [null, 3, {"notes": "no name"}]}');
    expect(loadCampaigns().campaigns).toEqual([]);
  });

  it('keeps a record that is missing the fields a later version added', () => {
    localStorage.setItem(
      'dnd-forge:campaigns:v1',
      JSON.stringify({ campaigns: [{ name: 'Half a record' }] }),
    );
    const [only] = loadCampaigns().campaigns;
    expect(only.name).toBe('Half a record');
    expect(only.partyIds).toEqual([]);
    expect(only.chronicle).toEqual([]);
    expect(only.id).toBeTruthy();
  });

  it('falls back to the first campaign when the active one is gone', () => {
    const file = addCampaign(addCampaign(emptyCampaigns(), 'One'), 'Two');
    saveCampaigns({ ...file, activeId: 'nobody' });
    expect(activeCampaign(loadCampaigns())?.name).toBe('One');
  });

  it('names an unnamed campaign rather than refusing it', () => {
    expect(addCampaign(emptyCampaigns(), '   ').campaigns[0].name).toBe('A new campaign');
  });
});

describe('the party', () => {
  const withOne = () => addCampaign(emptyCampaigns(), 'Ours');

  it('goes in and out', () => {
    const file = withOne();
    const id = file.campaigns[0].id;
    let out = updateCampaign(file, id, (c) => toggleMember(c, 'entry-a'));
    expect(activeCampaign(out)?.partyIds).toEqual(['entry-a']);
    out = updateCampaign(out, id, (c) => toggleMember(c, 'entry-a'));
    expect(activeCampaign(out)?.partyIds).toEqual([]);
  });

  it('keeps the order people were added in', () => {
    const file = withOne();
    const id = file.campaigns[0].id;
    const out = ['c', 'a', 'b'].reduce(
      (acc, member) => updateCampaign(acc, id, (c) => toggleMember(c, member)),
      file,
    );
    expect(activeCampaign(out)?.partyIds).toEqual(['c', 'a', 'b']);
  });
});

describe('the chronicle', () => {
  const chapter = (xp: number) => ({ defeated: '2× Goblin', xp, rounds: 3, mvp: 'Sera' });

  it('writes newest first', () => {
    let campaign = addCampaign(emptyCampaigns(), 'Ours').campaigns[0];
    campaign = remember(campaign, { ...chapter(100), defeated: 'first' });
    campaign = remember(campaign, { ...chapter(100), defeated: 'second' });
    expect(campaign.chronicle.map((c) => c.defeated)).toEqual(['second', 'first']);
  });

  it('adds up what the campaign has earned', () => {
    let campaign = addCampaign(emptyCampaigns(), 'Ours').campaigns[0];
    for (const xp of [50, 100, 450]) campaign = remember(campaign, chapter(xp));
    expect(totalEarned(campaign)).toBe(600);
  });

  it('is capped, because localStorage is not a database', () => {
    let campaign = addCampaign(emptyCampaigns(), 'Ours').campaigns[0];
    for (let i = 0; i < CHRONICLE_LIMIT + 10; i += 1) campaign = remember(campaign, chapter(1));
    expect(campaign.chronicle.length).toBe(CHRONICLE_LIMIT);
  });

  it('survives the round trip with the campaign', () => {
    const file = addCampaign(emptyCampaigns(), 'Ours');
    const id = file.campaigns[0].id;
    saveCampaigns(updateCampaign(file, id, (c) => remember(c, chapter(75))));
    expect(activeCampaign(loadCampaigns())?.chronicle[0].xp).toBe(75);
  });
});

describe('closing one down', () => {
  it('moves the active pointer to whatever is left', () => {
    const file = addCampaign(addCampaign(emptyCampaigns(), 'One'), 'Two');
    const out = removeCampaign(file, file.activeId!);
    expect(out.campaigns.map((c) => c.name)).toEqual(['One']);
    expect(activeCampaign(out)?.name).toBe('One');
  });

  it('leaves no dangling pointer when the last one goes', () => {
    const file = addCampaign(emptyCampaigns(), 'Only');
    expect(removeCampaign(file, file.activeId!)).toEqual({ campaigns: [] });
  });
});

describe('the Fallen (§91)', () => {
  const fresh = () => addCampaign(emptyCampaigns(), 'Ours').campaigns[0];

  it('writes a name onto the roll, oldest first and uncapped', () => {
    let campaign = layToRest(fresh(), { name: 'Sera', where: 'The Sunken Vault, room 3' });
    campaign = layToRest(campaign, { name: 'Bram' });
    expect(campaign.fallen?.map((m) => m.name)).toEqual(['Sera', 'Bram']);
    expect(campaign.fallen?.[0].where).toBe('The Sunken Vault, room 3');
    expect(campaign.fallen?.[0].id).toBeTruthy();
    expect(campaign.fallen?.[0].at).toBeGreaterThan(0);
  });

  it('takes the DM\'s words, and takes them back', () => {
    let campaign = layToRest(fresh(), { name: 'Sera' });
    const id = campaign.fallen![0].id;
    campaign = writeEpitaph(campaign, id, 'she held the door');
    expect(campaign.fallen?.[0].epitaph).toBe('she held the door');
    campaign = writeEpitaph(campaign, id, '  ');
    expect(campaign.fallen?.[0].epitaph).toBeUndefined();
  });

  it('strikes a name - the mistaken press, or the Revivify that landed', () => {
    let campaign = layToRest(layToRest(fresh(), { name: 'Sera' }), { name: 'Bram' });
    campaign = strikeMemorial(campaign, campaign.fallen![0].id);
    expect(campaign.fallen?.map((m) => m.name)).toEqual(['Bram']);
    // The last name off the roll takes the empty roll with it.
    campaign = strikeMemorial(campaign, campaign.fallen![0].id);
    expect(campaign.fallen).toBeUndefined();
  });

  it('survives the round trip, and the hydrator drops only garbage', () => {
    const file = addCampaign(emptyCampaigns(), 'Ours');
    const id = file.campaigns[0].id;
    saveCampaigns(updateCampaign(file, id, (c) => layToRest(c, { name: 'Sera' })));
    const raw = JSON.parse(localStorage.getItem('dnd-forge:campaigns:v1')!);
    raw.campaigns[0].fallen.push({ noName: true }, { name: '   ' });
    localStorage.setItem('dnd-forge:campaigns:v1', JSON.stringify(raw));
    expect(activeCampaign(loadCampaigns())?.fallen?.map((m) => m.name)).toEqual(['Sera']);
  });
});
