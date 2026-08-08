import { useEffect, useState } from 'react';
import { Panel } from './shared';
import {
  activeCampaign,
  addCampaign,
  loadCampaigns,
  removeCampaign,
  saveCampaigns,
  toggleMember,
  totalEarned,
  updateCampaign,
} from '../campaign';
import type { Roster } from '../storage';

/**
 * The thing that outlives a fight.
 *
 * Everything else in this app is about one afternoon: a roster of everyone you
 * have ever built, a drawer of prepped encounters, a battle screen that runs
 * exactly one fight and forgets it when the next starts. §29 made the fight pay
 * out; this is where the payments add up into a campaign.
 *
 * Two things and no more, because a campaign manager that tries to be a wiki
 * ends up being neither. **A party** - which of the roster's characters are the
 * ones playing, so the battle screen can seat them in one press rather than
 * five. And **a chronicle** - one line per fight, written by the debrief rather
 * than by the DM, because the DM is busy and a record nobody has to keep is the
 * only kind that gets kept.
 *
 * The roster is read but never written. Choosing who is at the table is not
 * editing a character, and this tab must not be able to lose one.
 */
export function CampaignTab({ roster }: { roster: Roster }) {
  const [file, setFile] = useState(loadCampaigns);
  useEffect(() => saveCampaigns(file), [file]);
  const [name, setName] = useState('');

  const campaign = activeCampaign(file);
  const change = (fn: Parameters<typeof updateCampaign>[2]) =>
    campaign && setFile(updateCampaign(file, campaign.id, fn));

  return (
    <div className="stack">
      <Panel
        title="Campaigns"
        subtitle="A party and a record of what it did. The battle screen reads whichever one is being played."
      >
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <input
            type="text"
            className="detail"
            aria-label="Name this campaign"
            placeholder="the sunless citadel"
            style={{ flex: 1, minWidth: 180 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="btn btn-sm btn-primary"
            style={{ flex: '0 0 auto' }}
            onClick={() => {
              setFile(addCampaign(file, name));
              setName('');
            }}
          >
            Start one
          </button>
        </div>

        {file.campaigns.length === 0 && (
          <p className="muted">
            Nothing yet. A campaign is a party plus a record — start one and the debrief will
            begin writing it for you.
          </p>
        )}

        {file.campaigns.map((one) => (
          <p key={one.id} className="zone-row">
            <button
              className="btn btn-sm"
              aria-label={`Play ${one.name}`}
              title="Make this the campaign the battle screen reads"
              disabled={one.id === file.activeId}
              onClick={() => setFile({ ...file, activeId: one.id })}
            >
              {one.id === file.activeId ? 'Playing' : 'Play'}
            </button>{' '}
            <button
              className="btn btn-sm"
              aria-label={`Delete ${one.name}`}
              onClick={() => setFile(removeCampaign(file, one.id))}
            >
              Delete
            </button>{' '}
            <b>{one.name}</b>
            <span className="src">
              {' '}
              · {one.partyIds.length} in the party · {one.chronicle.length} fight
              {one.chronicle.length === 1 ? '' : 's'} · {totalEarned(one).toLocaleString()} XP
            </span>
          </p>
        ))}
      </Panel>

      {campaign && (
        <Panel
          title="The party"
          subtitle="Who is at the table. Everyone else stays on the roster — this picks, it never edits."
        >
          {roster.entries.length === 0 && <p className="muted">No characters built yet.</p>}
          {roster.entries.map((entry) => (
            <label key={entry.id} className="check">
              <input
                type="checkbox"
                checked={campaign.partyIds.includes(entry.id)}
                onChange={() => change((c) => toggleMember(c, entry.id))}
              />
              <span>{entry.build.name || 'Unnamed'}</span>
              {!!entry.play.xp && <span className="src"> · {entry.play.xp.toLocaleString()} XP</span>}
            </label>
          ))}
          {/*
            A character deleted between sessions leaves their id behind on
            purpose: dropping it silently would rewrite the party because
            somebody tidied the roster. Named rather than removed.
          */}
          {campaign.partyIds.some((id) => !roster.entries.some((e) => e.id === id)) && (
            <p className="hint">
              Someone in this party is no longer on the roster. They are kept here until you
              take them out, so a tidy-up cannot quietly change who was playing.
            </p>
          )}
        </Panel>
      )}

      {campaign && (
        <Panel
          title="The chronicle"
          subtitle="Written by the debrief. Newest first."
        >
          {campaign.chronicle.length === 0 && (
            <p className="muted">
              Nothing fought yet. Award a fight in the Play tab's debrief and it lands here.
            </p>
          )}
          {campaign.chronicle.map((chapter) => (
            <p key={chapter.id} className="zone-row">
              <b>{chapter.defeated}</b>
              <span className="src">
                {' · '}
                {chapter.xp.toLocaleString()} XP
                {chapter.rounds ? ` · ${chapter.rounds} round${chapter.rounds === 1 ? '' : 's'}` : ''}
                {chapter.mvp ? ` · ${chapter.mvp}` : ''}
                {chapter.at ? ` · ${new Date(chapter.at).toLocaleDateString()}` : ''}
              </span>
            </p>
          ))}
          {campaign.chronicle.length > 0 && (
            <p className="hint">
              {totalEarned(campaign).toLocaleString()} XP across {campaign.chronicle.length} fight
              {campaign.chronicle.length === 1 ? '' : 's'}. What that is worth in levels is the
              table's call — the advancement table is not data this app ships.
            </p>
          )}
        </Panel>
      )}

      {campaign && (
        <Panel title="Notes" subtitle="Everything this app has no field for.">
          <textarea
            className="detail"
            aria-label="Campaign notes"
            rows={6}
            style={{ width: '100%' }}
            value={campaign.notes}
            onChange={(e) => {
              const notes = e.target.value;
              change((c) => ({ ...c, notes }));
            }}
          />
          <p className="hint">
            Kept beside the party rather than on any one character, because most of what a DM
            writes down belongs to nobody in particular.
          </p>
        </Panel>
      )}
    </div>
  );
}
