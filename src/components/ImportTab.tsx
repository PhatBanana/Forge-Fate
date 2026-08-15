import { useState } from 'react';
import type { Build } from '../types';
import {
  ImportError,
  buildFromDdb,
  characterServiceUrl,
  fetchDdbCharacter,
  parseCharacterId,
} from '../import/dndbeyond';
import { Panel } from './shared';

export function ImportTab({
  build,
  onImport,
}: {
  build: Build;
  onImport: (build: Build) => void;
}) {
  const [url, setUrl] = useState('');
  const [json, setJson] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  /* §76: a clean import used to look exactly like nothing happening - the
     warnings panel only appears when something went partly wrong, so the
     best outcome was the silent one. This names what arrived. */
  const [importedName, setImportedName] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  const characterId = parseCharacterId(url);

  const apply = (result: { build: Build; warnings: string[] }) => {
    setWarnings(result.warnings);
    setError(null);
    setImportedName(result.build.name || 'Unnamed character');
    onImport(result.build);
  };

  const handleFetch = async () => {
    setBusy(true);
    setError(null);
    setWarnings([]);
    setImportedName(null);
    try {
      apply(await fetchDdbCharacter(url, build.ruleset));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handlePaste = () => {
    setError(null);
    setWarnings([]);
    setImportedName(null);
    try {
      apply(buildFromDdb(JSON.parse(json), build.ruleset));
    } catch (e) {
      setError(
        e instanceof ImportError
          ? e.message
          : e instanceof SyntaxError
            ? 'That is not valid JSON. Copy the entire response, from the first { to the last }.'
            : e instanceof Error
              ? e.message
              : String(e),
      );
    }
  };

  const handleNativeFile = async (file: File) => {
    setError(null);
    setWarnings([]);
    setImportedName(null);
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed && typeof parsed === 'object' && 'baseScores' in parsed) {
        onImport(parsed as Build);
        setImportedName((parsed as Build).name || 'Unnamed character');
        setWarnings(['Loaded a build saved by this app.']);
      } else {
        apply(buildFromDdb(parsed, build.ruleset));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const exportBuild = () => {
    const blob = new Blob([JSON.stringify(build, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${build.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'character'}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="columns">
      <div className="stack">
        <Panel
          title="Import from D&D Beyond"
          subtitle="Paste a character URL. This works out of the box when running the app locally with npm run dev."
        >
          <label className="field">
            <span>Character URL or ID</span>
            <input
              type="text"
              placeholder="https://www.dndbeyond.com/characters/123456789"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={handleFetch} disabled={!characterId || busy}>
              {busy ? 'Fetching…' : 'Fetch character'}
            </button>
          </div>
          {url && !characterId && (
            <p className="muted" style={{ marginTop: 10 }}>
              No character ID found in that text.
            </p>
          )}
          <p className="muted" style={{ marginTop: 12 }}>
            The character must be set to <strong>public</strong> in its D&D Beyond privacy settings,
            or the API returns 403.
          </p>
        </Panel>

        <Panel
          title="Paste JSON instead"
          subtitle="Always works, including on a hosted build. D&D Beyond's API sends no CORS headers, so a page served from another domain cannot call it directly - but your browser can."
        >
          {characterId && (
            <div className="callout" style={{ marginBottom: 12 }}>
              <ol>
                <li>
                  Open{' '}
                  <a href={characterServiceUrl(characterId)} target="_blank" rel="noreferrer">
                    <code>{characterServiceUrl(characterId)}</code>
                  </a>{' '}
                  in a new tab.
                </li>
                <li>Select all of it and copy.</li>
                <li>Paste it below and press Import.</li>
              </ol>
            </div>
          )}
          {!characterId && (
            <div className="callout" style={{ marginBottom: 12 }}>
              Enter a character URL above and this box will show you the exact link to copy from.
            </div>
          )}
          <label className="field">
            <span>Character JSON</span>
            <textarea
              rows={8}
              placeholder='{"success":true,"data":{ … }}'
              value={json}
              onChange={(e) => setJson(e.target.value)}
            />
          </label>
          <button className="btn btn-primary" onClick={handlePaste} disabled={!json.trim()}>
            Import pasted JSON
          </button>
        </Panel>

        <Panel title="Files" subtitle="Load a saved build, or a D&D Beyond JSON export from disk.">
          <label className="field">
            <span>Open a .json file</span>
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleNativeFile(file);
              }}
            />
          </label>
          <button
            className="btn"
            onClick={() => {
              exportBuild();
              setDownloaded(true);
              setTimeout(() => setDownloaded(false), 2500);
            }}
          >
            {downloaded ? 'Downloaded' : 'Download this build as JSON'}
          </button>
        </Panel>
      </div>

      <div className="stack">
        {error && (
          <Panel title="Import failed">
            <div className="callout error">{error}</div>
          </Panel>
        )}

        {importedName && !error && (
          <Panel title="Imported">
            <div className="callout" role="status">
              <b>{importedName}</b> is loaded as the active character. The Builder and the sheet
              show it now.
            </div>
          </Panel>
        )}

        {warnings.length > 0 && (
          <Panel title="Imported — read these">
            <div className="callout warn">
              <ul>
                {warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </div>
          </Panel>
        )}

        <Panel title="What gets imported">
          <dl className="detail-list">
            <div>
              <dt>Lineage, classes, subclasses and levels</dt>
              <dd>Matched by name against this app's database; anything unrecognised is reported.</dd>
            </div>
            <div>
              <dt>Ability scores, split back into layers</dt>
              <dd>
                D&amp;D Beyond stores your entered base scores separately from the increases granted
                by lineage, feats and Ability Score Improvements. The importer keeps them apart, so
                the optimizer sees the same "base score plus choices" structure you would have built
                by hand — and can tell you which of those choices to make differently.
              </dd>
            </div>
            <div>
              <dt>Feats</dt>
              <dd>
                Matched by name, including the chosen option in brackets — "Resilient (Constitution)"
                imports with the Constitution increase already assigned.
              </dd>
            </div>
            <div>
              <dt>What does not import</dt>
              <dd>
                The roleplay boxes — traits, ideals, bonds, flaws, backstory — and campaign details.
                They are free text on D&amp;D Beyond's side, so they start empty here rather than
                being guessed at. Class options — invocations, metamagic, maneuvers, fighting styles
                — along with languages, tools and which spells are prepared today also start empty
                and are set on the Builder tab. A magic item that sets an ability score is flagged
                rather than absorbed.
              </dd>
            </div>
            <div>
              <dt>Set your weapon loadout after importing</dt>
              <dd>
                The sheet does not say whether you actually swing the greatsword in your pack, and
                that single choice moves Sharpshooter and Great Weapon Master by ten points.
              </dd>
            </div>
          </dl>
        </Panel>
      </div>
    </div>
  );
}
