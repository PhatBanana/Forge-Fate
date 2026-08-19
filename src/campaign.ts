import { newId } from './storage';
import { read, write } from './persist';

/**
 * The thing that outlives a fight.
 *
 * Everything in this app has been about one afternoon. A roster of characters,
 * a drawer of prepped encounters, a library of dungeons, and a battle screen
 * that runs exactly one fight at a time and forgets it when the next one
 * starts. §29 made the fight pay out; this is where the payments accumulate
 * into something a table would call a campaign.
 *
 * ## What a campaign actually is here
 *
 * Two things and no more, because a campaign manager that tries to be a wiki
 * ends up being neither:
 *
 * - **A party.** Which of the roster's characters are the ones playing. The
 *   roster is everybody you have ever built - your friend's Paladin, the
 *   Barbarian you were trying out, three versions of the same Wizard. The
 *   party is who is at the table on Saturday, and the battle screen can seat
 *   them in one press instead of five.
 * - **A chronicle.** One line per fight, written when the debrief pays out:
 *   what was beaten, how long it took, who did the most, what it was worth.
 *   Written by the app rather than by the DM, because the DM is busy, and a
 *   record nobody has to keep is the only kind that gets kept.
 *
 * Its own key, for the reason the bestiary and the dungeons have their own:
 * a campaign outlives any particular character, and clearing the roster must
 * not clear the record of what the party did.
 */

const CAMPAIGNS_KEY = 'dnd-forge:campaigns:v1';

/** One fight, remembered. */
export interface Chapter {
  id: string;
  /** When it was written, so the chronicle can be read in order. */
  at: number;
  /** What was beaten, as the debrief said it. */
  defeated: string;
  /** How many rounds it ran, when the fight was actually fought out. */
  rounds?: number;
  /** Experience the party earned, in total rather than each. */
  xp: number;
  /** Who dealt the most damage. Absent when nobody dealt any. */
  mvp?: string;
  /** §89: how the objective ended, as one clause - absent for a plain rout. */
  objective?: string;
  /** §90: the delve, as one clause - the place, the rooms, the rests, who
      fell where. Absent when the fight was not a run through a place. */
  delve?: string;
}

/**
 * §91: one of the Fallen - a memorial, not a death certificate.
 *
 * Fire Emblem's permadeath *culture*, not its rule: what makes a loss land
 * in that game is not the mechanic, it is the roll call afterwards. Nothing
 * here kills anybody - dropping to nought is not dying in fifth edition,
 * three failed saves is, and even then the table rules on what happens next
 * (a Revivify, a bargain, a retirement). The app only *offers* the memorial
 * when the facts suggest one, and the DM writes it by pressing the button.
 * Laying someone to rest edits no character and touches no roster entry:
 * a memorial is additive, and the name is copied onto it so the roll
 * survives the roster forgetting them.
 */
export interface Memorial {
  id: string;
  /** Their name, copied - a memorial outlives the character record. */
  name: string;
  /** When they were laid to rest. */
  at: number;
  /** Where it happened, as the battle knew it - "The Sunken Vault, room 3". */
  where?: string;
  /** The DM's own words, written on the campaign screen. */
  epitaph?: string;
}

export interface Campaign {
  id: string;
  name: string;
  createdAt: number;
  /** Roster entry ids. Checked against the roster on use, never on load - a
      character deleted between sessions should not delete the campaign. */
  partyIds: string[];
  /** Newest first, the way the battle log reads. */
  chronicle: Chapter[];
  /** §91: the roll of the Fallen, oldest first - a roll is read in order. */
  fallen?: Memorial[];
  /** The DM's own, for everything the app has no field for. */
  notes: string;
}

export interface CampaignFile {
  campaigns: Campaign[];
  /** Which one is being played. The battle screen reads only this one. */
  activeId?: string;
}

export const emptyCampaigns = (): CampaignFile => ({ campaigns: [] });

/** Never throws; no campaigns is a valid state and the common one. */
export function loadCampaigns(): CampaignFile {
  try {
    const raw = read(CAMPAIGNS_KEY);
    if (!raw) return emptyCampaigns();
    const parsed = JSON.parse(raw) as Partial<CampaignFile>;
    const campaigns = (parsed?.campaigns ?? [])
      .map(hydrateCampaign)
      .filter((c): c is Campaign => c !== null);
    const activeId = campaigns.some((c) => c.id === parsed?.activeId)
      ? parsed?.activeId
      : campaigns[0]?.id;
    return { campaigns, ...(activeId ? { activeId } : {}) };
  } catch {
    return emptyCampaigns();
  }
}

export function saveCampaigns(file: CampaignFile): void {
  try {
    write(CAMPAIGNS_KEY, JSON.stringify(file));
  } catch {
    // Private browsing or a full quota - the app still works, it just forgets.
  }
}

/**
 * Whole records or nothing, the discipline every store here uses.
 *
 * A campaign with no name is not a campaign; everything else has a defensible
 * empty value, so a file written by a future version that adds fields loads
 * with the fields this version knows about rather than being thrown away.
 */
function hydrateCampaign(parsed: unknown): Campaign | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const raw = parsed as Partial<Campaign>;
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    name: raw.name,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
    partyIds: Array.isArray(raw.partyIds) ? raw.partyIds.filter((id) => typeof id === 'string') : [],
    chronicle: Array.isArray(raw.chronicle)
      ? raw.chronicle.filter(
          (c): c is Chapter =>
            !!c && typeof c === 'object' && typeof (c as Chapter).defeated === 'string',
        )
      : [],
    ...(Array.isArray(raw.fallen)
      ? {
          fallen: raw.fallen.filter(
            (m): m is Memorial =>
              !!m &&
              typeof m === 'object' &&
              typeof (m as Memorial).name === 'string' &&
              !!(m as Memorial).name.trim(),
          ),
        }
      : {}),
    notes: typeof raw.notes === 'string' ? raw.notes : '',
  };
}

/** Start one, and make it the one being played. */
export function addCampaign(file: CampaignFile, name: string): CampaignFile {
  const campaign: Campaign = {
    id: newId(),
    name: name.trim() || 'A new campaign',
    createdAt: Date.now(),
    partyIds: [],
    chronicle: [],
    notes: '',
  };
  return { campaigns: [...file.campaigns, campaign], activeId: campaign.id };
}

export function removeCampaign(file: CampaignFile, id: string): CampaignFile {
  const campaigns = file.campaigns.filter((c) => c.id !== id);
  const activeId = file.activeId === id ? campaigns[0]?.id : file.activeId;
  return { campaigns, ...(activeId ? { activeId } : {}) };
}

/** Change one campaign in place, leaving the rest alone. */
export function updateCampaign(
  file: CampaignFile,
  id: string,
  change: (campaign: Campaign) => Campaign,
): CampaignFile {
  return { ...file, campaigns: file.campaigns.map((c) => (c.id === id ? change(c) : c)) };
}

export const activeCampaign = (file: CampaignFile): Campaign | null =>
  file.campaigns.find((c) => c.id === file.activeId) ?? null;

/** In or out of the party, which is the one question this store exists for. */
export function toggleMember(campaign: Campaign, rosterId: string): Campaign {
  return {
    ...campaign,
    partyIds: campaign.partyIds.includes(rosterId)
      ? campaign.partyIds.filter((id) => id !== rosterId)
      : [...campaign.partyIds, rosterId],
  };
}

/**
 * Write a fight into the record.
 *
 * Newest first, and capped: a long campaign is a good thing and an unbounded
 * array in `localStorage` is not. Fifty fights is more than any table plays in
 * a year of Saturdays, and the ones that fall off the end are the ones nobody
 * remembers anyway.
 */
export const CHRONICLE_LIMIT = 50;

export function remember(campaign: Campaign, chapter: Omit<Chapter, 'id' | 'at'>): Campaign {
  const entry: Chapter = { id: newId(), at: Date.now(), ...chapter };
  return { ...campaign, chronicle: [entry, ...campaign.chronicle].slice(0, CHRONICLE_LIMIT) };
}

/** What the party has earned across the whole campaign. */
export const totalEarned = (campaign: Campaign): number =>
  campaign.chronicle.reduce((sum, c) => sum + c.xp, 0);

/**
 * §91: write a name onto the roll. Oldest first and uncapped - the chronicle
 * caps at fifty because fights are routine; deaths are not, and a roll of
 * honor that forgets its oldest names is not one.
 */
export function layToRest(
  campaign: Campaign,
  memorial: Omit<Memorial, 'id' | 'at'>,
): Campaign {
  const entry: Memorial = { id: newId(), at: Date.now(), ...memorial };
  return { ...campaign, fallen: [...(campaign.fallen ?? []), entry] };
}

/** The DM's words on one memorial, replaced whole. */
export function writeEpitaph(campaign: Campaign, id: string, epitaph: string): Campaign {
  return {
    ...campaign,
    fallen: (campaign.fallen ?? []).map((m) =>
      m.id === id ? { ...m, ...(epitaph.trim() ? { epitaph } : { epitaph: undefined }) } : m,
    ),
  };
}

/** Take a name off the roll - the mistaken press, or the Revivify that
    landed after all. Asked-for in the UI, like every deletion since §76. */
export function strikeMemorial(campaign: Campaign, id: string): Campaign {
  const fallen = (campaign.fallen ?? []).filter((m) => m.id !== id);
  return { ...campaign, ...(fallen.length ? { fallen } : { fallen: undefined }) };
}
