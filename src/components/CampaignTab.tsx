import { useEffect, useState } from 'react';
import { ConfirmButton, Panel } from './shared';
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
import type { CampaignFile } from '../campaign';
import type { Roster } from '../storage';
import { canRedo, canUndo, emptyHistory, record, recordStep, redo, undo } from '../undo';
import type { History } from '../undo';
import type { Say } from '../toast';

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
export function CampaignTab({
  roster,
  say,
}: {
  roster: Roster;
  /** §84: an undo has to say what came back, and nothing here flips a label. */
  say?: Say;
}) {
  const [file, writeFile] = useState(loadCampaigns);
  useEffect(() => saveCampaigns(file), [file]);
  const [name, setName] = useState('');

  /*
    §84: undo, on the smallest surface of the three and the one where it
    matters most in a single case - a deleted campaign is the one record in
    the app that cannot be rebuilt from anything else. §76 gave that a
    confirm; this gives it a way back after the confirm was wrong.

    Same wrapper trick as the battle and the editor: the setter that writes is
    renamed, and `setFile` becomes the recording one, so every call site
    already written records without being touched.

    This screen is the one that needs *both* recorders, and that is what makes
    the distinction worth having a name. Its presses - start one, play,
    delete, tick somebody into the party - are each a decision, so they take
    `recordStep`. Its one text box is typing, so it takes `record` and a
    sentence of notes is one step back rather than sixty. Using either alone
    would break the other: coalescing everything loses the deleted campaign
    behind whatever was clicked half a second earlier, and coalescing nothing
    lets a paragraph push it off the end of a forty-deep stack.
  */
  const [history, setHistory] = useState<History<CampaignFile>>(emptyHistory);
  const setFile = (next: CampaignFile) => {
    if (next === file) return;
    setHistory((current) => recordStep(current, file));
    writeFile(next);
  };

  const typeIntoFile = (next: CampaignFile) => {
    if (next === file) return;
    setHistory((current) => record(current, file));
    writeFile(next);
  };

  const stepBack = () => {
    const step = undo(history, file);
    if (!step) return;
    setHistory(step.history);
    writeFile(step.value);
    say?.('Undone.', { label: 'Redo', onAct: stepForward });
  };

  const stepForward = () => {
    const step = redo(history, file);
    if (!step) return;
    setHistory(step.history);
    writeFile(step.value);
  };

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
            /* §76: disabled until named, as the Dungeons save already is - an
               empty press used to invent "A new campaign" on your behalf. */
            disabled={!name.trim()}
            onClick={() => {
              setFile(addCampaign(file, name));
              setName('');
            }}
          >
            Start one
          </button>
        </div>

        {/* §84: shown once there is anything to lose, and kept on screen while
            there is anything to get back - so deleting the last campaign does
            not take its own way back down with it. */}
        {(file.campaigns.length > 0 || canUndo(history)) && (
          <div className="row" style={{ gap: 6, marginBottom: 8 }}>
            <button
              className="btn btn-sm"
              disabled={!canUndo(history)}
              title="Undo the last change to your campaigns"
              onClick={stepBack}
            >
              ↶ Undo
            </button>
            <button
              className="btn btn-sm"
              disabled={!canRedo(history)}
              title="Put it back"
              onClick={stepForward}
            >
              ↷ Redo
            </button>
          </div>
        )}

        {/*
          §38: the empty state sells the record rather than apologising for
          not having one. A single grey line on a whole empty screen said
          "nothing here" and left you to guess what would be here - so this
          says what a campaign *does*, in the three things it actually keeps,
          and the one line of prose that names where they come from.
        */}
        {file.campaigns.length === 0 && (
          <div className="empty-pitch">
            <h3>No campaign yet</h3>
            <p>
              A campaign is a party and the record of what it did. Name one above and every
              fight you run starts writing it.
            </p>
            <ul>
              <li>
                <b>The party</b>
                <span>Who is in it, drawn from your roster.</span>
              </li>
              <li>
                <b>The ledger</b>
                <span>Experience and treasure, totted up per fight by the debrief.</span>
              </li>
              <li>
                <b>The record</b>
                <span>What each fight cost and who nearly died in it.</span>
              </li>
            </ul>
          </div>
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
            {/* §76: a campaign is a party and its whole chronicle - the one
                record in the app that cannot be rebuilt from anything else. */}
            <ConfirmButton
              label="Delete"
              confirmLabel="Really delete"
              ariaLabel={`Delete ${one.name}`}
              onConfirm={() => setFile(removeCampaign(file, one.id))}
            />{' '}
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
              Nothing fought yet. Award a fight in the battle's After drawer and it lands here.
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
                {chapter.objective ? ` · ⚑ ${chapter.objective}` : ''}
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
              // The one typing surface on the screen, and so the one write
              // that coalesces. See the header on the two recorders.
              typeIntoFile(updateCampaign(file, campaign.id, (c) => ({ ...c, notes })));
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
