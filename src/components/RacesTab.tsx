import { useMemo, useState } from 'react';
import type { ClassId, Ruleset } from '../types';
import { CLASSES, classesFor } from '../data/classes';
import { RACES_BY_ID, racesFor } from '../data/races';
import { BACKGROUNDS_BY_ID } from '../data/backgrounds';
import { skillName } from '../data/skills';
import { bestClassesFor, bestRacesFor, cellFor } from '../engine/raceMatrix';
import { bestBackgroundsFor } from '../engine/backgroundMatrix';
import { Panel, RatingTag, Select } from './shared';

type Mode = 'matrix' | 'by-class' | 'by-race' | 'by-background';

export function RacesTab({
  raceId,
  classId,
  ruleset,
  onPick,
}: {
  raceId: string;
  classId: ClassId;
  ruleset: Ruleset;
  onPick: (raceId: string, classId: ClassId) => void;
}) {
  const [mode, setMode] = useState<Mode>(ruleset === '2024' ? 'by-background' : 'by-class');
  const RACES = racesFor(ruleset);
  const [selectedClass, setSelectedClass] = useState<ClassId>(classId);
  const [selectedRace, setSelectedRace] = useState<string>(raceId);

  return (
    <div className="stack">
      <Panel
        title={ruleset === '2024' ? 'Which origin for which class' : 'Which lineage for which class'}
        subtitle={
          ruleset === '2024'
            ? 'Under 2024 rules your ability score increases come from your background, so that is where this question moved. Species are still rated, but on traits alone.'
            : "Ratings are computed from how well a lineage's ability increases land on a class's priorities, plus how much its traits patch that class's weaknesses. Well-known pairings carry a written verdict on top."
        }
      >
        <div className="legend">
          <span>
            <i className="swatch sky" /> Excellent — best in class
          </span>
          <span>
            <i className="swatch blue" /> Solid — no complaints
          </span>
          <span>
            <i className="swatch orange" /> Situational — works with effort
          </span>
          <span>
            <i className="swatch red" /> Avoid — the numbers fight you
          </span>
        </div>
        <div className="btn-row">
          {ruleset === '2024' && (
            <button
              className={`btn btn-sm ${mode === 'by-background' ? 'btn-primary' : ''}`}
              onClick={() => setMode('by-background')}
            >
              Best backgrounds for a class
            </button>
          )}
          <button
            className={`btn btn-sm ${mode === 'by-class' ? 'btn-primary' : ''}`}
            onClick={() => setMode('by-class')}
          >
            Best species for a class
          </button>
          <button
            className={`btn btn-sm ${mode === 'by-race' ? 'btn-primary' : ''}`}
            onClick={() => setMode('by-race')}
          >
            Best classes for a lineage
          </button>
          <button
            className={`btn btn-sm ${mode === 'matrix' ? 'btn-primary' : ''}`}
            onClick={() => setMode('matrix')}
          >
            Full matrix
          </button>
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          {ruleset === '2024'
            ? 'Species ratings here reflect traits only, so they compress toward the middle by design — in 2024 the ability increases that used to separate them come from your background instead.'
            : "These ratings assume 2014 rules, where lineages give fixed ability increases. With Tasha's custom origin switched on (Builder tab), ability increases stop mattering and only the traits do — which flattens most of this table."}
        </p>
      </Panel>

      {mode === 'by-background' && (
        <Panel
          title="Best backgrounds for a class"
          subtitle="Rated on where the +2/+1 lands and what the free Origin feat is worth."
        >
          <Select
            label="Class"
            value={selectedClass}
            onChange={(value) => setSelectedClass(value as ClassId)}
            options={classesFor(ruleset).map((c) => ({ value: c.id, label: c.name }))}
          />
          <p className="note">{CLASSES.find((c) => c.id === selectedClass)?.note}</p>
          {bestBackgroundsFor(selectedClass, 16).map((cell, index) => {
            const background = BACKGROUNDS_BY_ID[cell.originId];
            return (
              <details className={`suggestion ${index === 0 ? 'is-top' : ''}`} key={cell.originId}>
                <summary>
                  <span className="rank">{index + 1}</span>
                  <span className="title">
                    <strong>{background.name}</strong>
                    <span className="src">{background.skills.map(skillName).join(', ')}</span>
                  </span>
                  <RatingTag rating={cell.rating} />
                </summary>
                <div className="body">
                  {cell.note && <p className="note">{cell.note}</p>}
                  <ul className="reasons">
                    {cell.reasons.map((reason, i) => (
                      <li key={i}>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            );
          })}
        </Panel>
      )}

      {mode === 'by-class' && (
        <Panel title="Best lineages for a class">
          <Select
            label="Class"
            value={selectedClass}
            onChange={(value) => setSelectedClass(value as ClassId)}
            options={classesFor(ruleset).map((c) => ({ value: c.id, label: c.name }))}
          />
          <p className="note">{CLASSES.find((c) => c.id === selectedClass)?.note}</p>
          {bestRacesFor(selectedClass, 12, ruleset).map((cell, index) => {
            const race = RACES_BY_ID[cell.originId];
            return (
              <details className={`suggestion ${index === 0 ? 'is-top' : ''}`} key={cell.originId}>
                <summary>
                  <span className="rank">{index + 1}</span>
                  <span className="title">
                    <strong>{race.name}</strong>
                    <span className="src">{race.source}</span>
                  </span>
                  <RatingTag rating={cell.rating} />
                </summary>
                <div className="body">
                  {cell.note && <p className="note">{cell.note}</p>}
                  <ul className="reasons">
                    {cell.reasons.map((reason, i) => (
                      <li key={i}>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    className="btn btn-sm"
                    style={{ marginTop: 12 }}
                    onClick={() => onPick(cell.originId, selectedClass)}
                  >
                    Load this pairing into the builder
                  </button>
                </div>
              </details>
            );
          })}
        </Panel>
      )}

      {mode === 'by-race' && (
        <Panel title="Best classes for a lineage">
          <Select
            label="Lineage"
            value={selectedRace}
            onChange={setSelectedRace}
            options={RACES.map((r) => ({
              value: r.id,
              label: r.name,
              group: r.parent ?? r.name,
            }))}
          />
          <p className="note">{RACES_BY_ID[selectedRace]?.note}</p>
          {bestClassesFor(selectedRace, ruleset).map((cell, index) => {
            const klass = CLASSES.find((c) => c.id === cell.classId)!;
            return (
              <details className={`suggestion ${index === 0 ? 'is-top' : ''}`} key={cell.classId}>
                <summary>
                  <span className="rank">{index + 1}</span>
                  <span className="title">
                    <strong>{klass.name}</strong>
                  </span>
                  <RatingTag rating={cell.rating} />
                </summary>
                <div className="body">
                  {cell.note && <p className="note">{cell.note}</p>}
                  <ul className="reasons">
                    {cell.reasons.map((reason, i) => (
                      <li key={i}>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    className="btn btn-sm"
                    style={{ marginTop: 12 }}
                    onClick={() => onPick(selectedRace, cell.classId)}
                  >
                    Load this pairing into the builder
                  </button>
                </div>
              </details>
            );
          })}
        </Panel>
      )}

      {mode === 'matrix' && <Matrix raceId={raceId} classId={classId} ruleset={ruleset} onPick={onPick} />}
    </div>
  );
}

function Matrix({
  raceId,
  classId,
  ruleset,
  onPick,
}: {
  raceId: string;
  classId: ClassId;
  ruleset: Ruleset;
  onPick: (raceId: string, classId: ClassId) => void;
}) {
  const races = racesFor(ruleset);
  /*
    Through `classesFor` rather than over `CLASSES`, so the matrix respects
    both the ruleset and the originals switch. Over the raw list it printed an
    Artificer column under 2024 - a class that does not exist there - and, once
    the app had classes of its own, four more columns to a player who had never
    turned them on.
  */
  const klasses = classesFor(ruleset);
  const rows = useMemo(
    () =>
      races.map((race) => ({
        race,
        cells: klasses.map((klass) => cellFor(race.id, klass.id, ruleset)!),
      })),
    [races, klasses, ruleset],
  );

  return (
    <Panel title={`Full matrix — ${races.length} species × ${klasses.length} classes`}>
      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th>Species</th>
              {klasses.map((klass) => (
                <th key={klass.id}>{klass.name.slice(0, 4)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ race, cells }) => (
              <tr key={race.id}>
                <th>
                  {race.name}
                  <span className="src">{race.source}</span>
                </th>
                {cells.map((cell) => (
                  <td
                    key={cell.classId}
                    className={`cell-${cell.rating} ${
                      cell.originId === raceId && cell.classId === classId ? 'is-selected' : ''
                    }`}
                    title={`${race.name} ${cell.classId}: ${cell.note ?? cell.reasons[0]}`}
                  >
                    <button onClick={() => onPick(cell.originId, cell.classId)}>
                      {cell.score.toFixed(0)}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ marginTop: 12 }}>
        Numbers are the raw fit score behind each colour. Click any cell to load that pairing into
        the builder; hover for the reasoning.
      </p>
    </Panel>
  );
}
