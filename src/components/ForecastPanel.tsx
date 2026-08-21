import { useEffect, useState } from 'react';
import { Panel } from './shared';
import { simulate } from '../engine/simulate';
import type { Combatants, forecast } from '../engine/forecast';

/**
 * §107: the forecast, peeled off the battle screen.
 *
 * "What will this fight do" is one question with three answers - the
 * damage model's expectation, a fixed-seed 200-run balance dial, and a
 * thousand-run distribution the DM asks for - and all three lived in the
 * middle of a 7,500-line component, reachable only by mounting a whole
 * battle. Nothing else on that screen reads them.
 *
 * The simulation state comes with it, which is what makes this a module
 * rather than a moved block: `sim` is *this* panel's, cleared when the
 * sides change so a stale distribution can never sit beside fresh
 * combatants. The screen above hands in three facts and learns nothing
 * about how a simulation is run or when its answer expires.
 */

/** The win rate in a DM's words. Bands, not precision - it is 200 runs. */
const balanceWord = (winRate: number): string =>
  winRate >= 0.95
    ? 'a walkover'
    : winRate >= 0.8
      ? 'comfortable'
      : winRate >= 0.55
        ? 'a real fight'
        : winRate >= 0.3
          ? 'desperate'
          : 'a likely wipe';

export function ForecastPanel({
  sides,
  outlook,
  quick,
}: {
  /** The two sides as the damage model sees them - what a run needs. */
  sides: Combatants;
  /** The expectation: no variance, nobody moving. Null hides the panel. */
  outlook: ReturnType<typeof forecast> | null;
  /** The prep dial: 200 runs under a fixed seed, or null before there are
      two sides to pit against each other. */
  quick: ReturnType<typeof simulate>;
}) {
  const [sim, setSim] = useState<ReturnType<typeof simulate>>(null);
  // A stale distribution must never sit beside fresh combatants.
  useEffect(() => setSim(null), [sides]);

  return (
    <>
      {outlook && (
        <Panel
          title="What this fight will do"
          subtitle="From this app's own damage model, against these characters and these monsters — not an XP budget."
        >
          <p className="forecast-verdict">{outlook.verdict}</p>
          <div className="forecast-grid">
            <div>
              <span className="k">Your party</span>
              <b>{outlook.partyDpr}</b> damage a round at AC {outlook.monsterAc}
              <span className="src">
                {outlook.partyHp} hit points between them · AC {outlook.partyAc} average
              </span>
            </div>
            <div>
              <span className="k">Against you</span>
              <b>{outlook.monsterDpr}</b> damage a round at AC {outlook.partyAc}
              <span className="src">
                {outlook.monsterHp} hit points left · AC {outlook.monsterAc} average
              </span>
            </div>
            <div>
              <span className="k">Rounds</span>
              <b>{outlook.roundsToClear ?? '—'}</b> to clear ·{' '}
              <b>{outlook.roundsToDrop ?? '—'}</b> before the party is out
              <span className="src">{outlook.xp.toLocaleString()} XP from the stat blocks</span>
            </div>
          </div>
          {/*
            What was left out, by name. A model that quietly skipped a dragon's
            breath weapon would read as precise and be wrong; one that named
            what it skipped lets a DM weigh it by eye.
          */}
          {outlook.notes.length > 0 && (
            <ul className="reasons" style={{ marginTop: 8 }}>
              {outlook.notes.map((note, i) => (
                <li key={i}>
                  <span className="delta zero">·</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="muted" style={{ marginTop: 8 }}>
            Expected damage with no variance, nobody moving and nobody using the thing that
            would actually decide it. A projection, not a promise.
          </p>

          {/*
            The prep dial: a fixed-seed 200-run estimate that moves as monsters
            are added. Not the DMG's XP thresholds - this app does not carry
            them - but its own simulation, which knows these characters.
          */}
          {quick && (
            <p className="forecast-verdict" style={{ marginTop: 10 }}>
              Balance: the party wins <b>{Math.round(quick.winRate * 100)}%</b> of 200 quick
              runs — {balanceWord(quick.winRate)}.
            </p>
          )}

          {/*
            The distribution, on request. The expectation above says how the
            averages go; this says how often it goes wrong, which is the
            question a close fight actually poses.
          */}
          <div style={{ marginTop: 12 }}>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => setSim(simulate(sides, { trials: 1000 }))}
            >
              Run it 1,000 times
            </button>
          </div>

          {sim && (
            <div className="sim-result" style={{ marginTop: 10 }}>
              <p className="forecast-verdict">
                The party wins <b>{Math.round(sim.winRate * 100)}%</b> of the time, a typical
                fight lasting <b>{sim.medianRounds}</b> round{sim.medianRounds === 1 ? '' : 's'}
                {sim.winRate > 0 && <> with <b>{sim.meanHpLeftOnWin}</b> hit points left between them</>}
                .
              </p>
              <ul className="reasons">
                {sim.downRate.map((entry) => (
                  <li key={entry.name}>
                    <span
                      className={`delta ${entry.rate > 0.5 ? 'neg' : entry.rate > 0.15 ? 'zero' : 'pos'}`}
                    >
                      {Math.round(entry.rate * 100)}%
                    </span>
                    <span>
                      {entry.name} hits the floor at some point in {Math.round(entry.rate * 100)}% of
                      fights.
                    </span>
                  </li>
                ))}
              </ul>
              <p className="muted" style={{ marginTop: 6 }}>{sim.caveat}</p>
            </div>
          )}
        </Panel>
      )}
    </>
  );
}
