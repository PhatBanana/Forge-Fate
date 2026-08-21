import { useState } from 'react';
import { Panel } from './shared';
import { putEncounter, removeEncounter } from '../encounters';
import type { SavedEncounter } from '../encounters';
import type { EncounterState } from '../encounter';

/**
 * §108: the encounter library - Saturday's other three fights, prepped.
 *
 * Peeled off the battle screen because nothing else on it reads any of
 * this: the shelf, the name being typed, and the three verbs (save,
 * load, delete). The name is the panel's own state, which is what makes
 * this a module rather than a moved block - the screen above never had
 * a use for a half-typed label.
 *
 * Loading is handed up rather than done here: a saved fight has to be
 * reseated against *today's* roster, and who is on the roster is the
 * screen's knowledge, not the shelf's.
 */
export function EncounterLibrary({
  library,
  encounter,
  onLibraryChange,
  onLoad,
}: {
  library: SavedEncounter[];
  /** The fight on the table, for the save button to put on the shelf. */
  encounter: EncounterState;
  onLibraryChange: (next: SavedEncounter[]) => void;
  /** Put this saved fight on the table, reseated against today's roster. */
  onLoad: (saved: SavedEncounter) => void;
}) {
  const [prepName, setPrepName] = useState('');

  return (
    <Panel
      title="Encounter library"
      subtitle="Prep the other three fights for Saturday. A saved fight keeps its monsters, map, terrain and effects; loading one starts it fresh against today's roster."
    >
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <input
          type="text"
          placeholder="The kennel, level B2…"
          aria-label="Name to save this fight under"
          value={prepName}
          onChange={(e) => setPrepName(e.target.value)}
        />
        <button
          className="btn btn-sm btn-primary"
          disabled={!prepName.trim() || !encounter.combatants.length}
          onClick={() => {
            onLibraryChange(putEncounter(library, prepName.trim(), encounter));
            setPrepName('');
          }}
        >
          Save this fight
        </button>
      </div>

      {library.length === 0 && (
        <p className="muted">Nothing prepped yet. Build a fight and save it under a name.</p>
      )}
      {library.map((saved) => (
        <p key={saved.id} className="zone-row">
          <button
            className="btn btn-sm"
            aria-label={`Load ${saved.name}`}
            onClick={() =>
              onLoad(saved)
            }
          >
            Load
          </button>{' '}
          <button
            className="btn btn-sm"
            aria-label={`Delete ${saved.name}`}
            onClick={() => onLibraryChange(removeEncounter(library, saved.id))}
          >
            Delete
          </button>{' '}
          <b>{saved.name}</b>
          <span className="src">
            {' '}
            · {saved.encounter.combatants.filter((c) => c.kind === 'monster').length} monsters
            {saved.encounter.mapSeed ? ` · ${saved.encounter.mapSeed}` : ''}
          </span>
        </p>
      ))}
    </Panel>
  );
}
