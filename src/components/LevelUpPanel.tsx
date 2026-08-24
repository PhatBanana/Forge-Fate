import { useState } from 'react';
import type { Build } from '../types';
import { Panel } from './shared';
import { defaultRng, rollDie } from '../engine/dice';
import { recordHitDieRoll } from '../engine/levelUp';
import type { LevelUpStep, LevelUpSummary } from '../engine/levelUp';
import { hitPointDetail } from './levelUpText';
import { SECTION_LABEL } from './sections';
import type { Section } from './sections';

/**
 * What just happened when you went up a level.
 *
 * Everything downstream of the level field was already right - the features
 * appeared, the ASI slot opened, the spell counts moved - but nothing said so,
 * so you found out by noticing a badge or by not noticing it. This is the
 * sentence that was missing.
 *
 * It is an explanation, not a wizard that takes over. Typing a level still
 * works exactly as it did, the panel appears beside the work rather than in
 * front of it, and every step points at the section that already knows how to
 * make that choice rather than reimplementing the picker.
 */

/** Which Builder section answers each kind of step. */
const SECTION_FOR: Record<LevelUpStep['kind'], Section | null> = {
  hp: null,
  features: null,
  subclass: 'identity',
  asi: 'feats',
  spells: 'options',
  options: 'options',
};

export function LevelUpPanel({
  summary,
  build,
  hpTotal,
  patch,
  onGoTo,
  onDismiss,
}: {
  summary: LevelUpSummary;
  build: Build;
  /** The character's hit points as they stand, which a roll here changes. */
  hpTotal: number;
  patch: (partial: Partial<Build>) => void;
  onGoTo: (section: Section) => void;
  onDismiss: () => void;
}) {
  const [rolled, setRolled] = useState<number | null>(null);

  /*
    Rolling switches the character to the per-level rolled mode and records
    this level's face. Offered rather than assumed: plenty of tables take the
    fixed average, and a button that quietly changed how every level was
    counted would be a poor way to find that out.
  */
  const roll = () => {
    const face = rollDie(summary.hitDie, defaultRng);
    setRolled(face);
    patch(recordHitDieRoll(build, face));
  };

  const rolling = build.defenses.hpMode === 'rolled';

  return (
    <Panel
      title={`Level ${summary.to}`}
      subtitle={
        summary.className
          ? `${summary.className} ${summary.from} → ${summary.to}. Here is what the level gave you, and what it is waiting on.`
          : `Level ${summary.from} → ${summary.to}.`
      }
    >
      <ol className="levelup">
        {summary.steps.map((step) => {
          const section = SECTION_FOR[step.kind];
          return (
            <li key={step.kind} className={step.owed > 0 ? 'is-owed' : ''}>
              <div className="levelup-head">
                {/*
                  The hit point figure stops being asserted once you roll: the
                  summary's "+9" was this level under the fixed average, and
                  standing next to "rolled a 7" it reads as a contradiction.
                  The detail line carries the live numbers instead.
                */}
                <b>{step.kind === 'hp' && rolled !== null ? 'Hit points' : step.title}</b>
                {step.owed > 0 && <span className="levelup-count">{step.owed}</span>}
              </div>
              <div className="levelup-detail">
                {step.kind === 'hp' ? hitPointDetail(rolling, rolled, summary.hitDie, hpTotal) : step.detail}
              </div>

              {step.kind === 'hp' && summary.hitDie > 0 && (
                <div className="levelup-actions">
                  <button type="button" className="btn btn-sm" onClick={roll}>
                    {rolled === null && !rolling
                      ? `Roll a d${summary.hitDie} instead`
                      : `Roll the d${summary.hitDie} again`}
                  </button>
                </div>
              )}

              {section && step.owed > 0 && (
                <div className="levelup-actions">
                  <button type="button" className="btn btn-sm" onClick={() => onGoTo(section)}>
                    Go to {SECTION_LABEL[section]}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
        <button type="button" className="btn btn-sm" onClick={onDismiss}>
          {summary.owed > 0 ? 'Dismiss' : 'Done'}
        </button>
        {summary.owed > 0 && (
          <span className="muted">
            {/* The section badges keep the count either way, so dismissing
                this loses a reminder rather than the information. */}
            The counts on the sections above stay until these are made.
          </span>
        )}
      </div>
    </Panel>
  );
}
