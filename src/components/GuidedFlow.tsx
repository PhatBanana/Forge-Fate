import type { ReactNode } from 'react';
import { signed } from '../format';
import type { Finding } from '../engine/analyze';
import type { LevelUpSummary } from '../engine/levelUp';
import type { GuidedStep, RankedPick } from './flowSteps';
import { hitPointDetail } from './levelUpText';

/**
 * §138. The guided flow, as a card that sits on the sheet.
 *
 * ## What this replaces
 *
 * A wizard. §31.4 built one - five sections, Back and Next - and §33.4 took
 * it apart, correctly: the sections were not five places, and a route you
 * cannot leave is a route people work around. What §33.4 left behind was one
 * long page with no answer to "what should I do next", which the badges
 * counted but never *asked*.
 *
 * This is that question asked, without the wizard's mistake. The flow is one
 * card at the top of a column whose remainder is the character sheet - so it
 * never becomes a place you are stuck in, and the thing it is asking about is
 * on screen underneath while it asks. Every step names the box it fills, and
 * answering writes into that box.
 *
 * **Not sticky.** A sticky card covered the sheet's own head on the first
 * scroll, which is exactly the thing the fusion exists to keep visible. The
 * band above it is sticky; this is not.
 *
 * ## The three shapes a step takes
 *
 * A **report** - what a level just gave you, and what it wants back. No
 * options, because nothing here is a choice.
 *
 * A **choice** - the body is whatever answering it needs. Where the engine
 * scores with reasons (feats, class options, skills, spells) that is a list
 * of `RankedOption`s; where the answer is a field or a grid it is the
 * section's own picker, in the card rather than beside it.
 *
 * The **review** - what is wrong with the build, as opposed to what is
 * unfinished. The band above counts the unfinished; a finding here is a
 * mistake that will not fix itself.
 */

export function GuidedFlow({
  steps,
  index,
  onIndex,
  waitingCount,
  footNote,
  children,
}: {
  steps: GuidedStep[];
  index: number;
  onIndex: (index: number) => void;
  /** Choices still outstanding across the whole character, for the header. */
  waitingCount: number;
  /** A sentence under the body, about what applying one will do. */
  footNote?: string;
  /** The step's body - the ranked list, the picker, the report, the review. */
  children: ReactNode;
}) {
  const step = steps[Math.min(index, steps.length - 1)];
  if (!step) return null;

  return (
    <section className="flow-step" aria-label={`Step ${index + 1} of ${steps.length}`}>
      <header className="flow-step-head">
        <span className="flow-step-n">
          Step {index + 1} of {steps.length}
        </span>
        {/*
          One pip per step, each a way to that step. Pips rather than a
          numbered strip because §138 kept §33.4's position that the sections
          are an order and not a route - a pip says "there are six of these
          and you are on the second" without implying you must walk them.
        */}
        <span className="flow-step-pips">
          {steps.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={i === index ? 'is-on' : i < index ? 'is-done' : ''}
              title={s.title}
              aria-label={`Step ${i + 1}: ${s.title}`}
              aria-current={i === index ? 'step' : undefined}
              onClick={() => onIndex(i)}
            />
          ))}
        </span>
        <span className="flow-step-waiting">
          {waitingCount === 0
            ? 'nothing waiting'
            : `${waitingCount} ${waitingCount === 1 ? 'choice' : 'choices'} waiting`}
        </span>
      </header>

      <div className="flow-step-body">
        <h2>
          {step.title}
          {/*
            The load-bearing piece of the fusion: the step always names the box
            on the sheet it writes to. Without it this is a wizard again, and
            the sheet underneath is decoration.
          */}
          <span className="flow-step-target">fills {step.target}</span>
        </h2>
        <p className="flow-step-blurb">{step.blurb}</p>

        {children}

        <footer className="flow-step-foot">
          <button
            type="button"
            className="btn btn-sm"
            disabled={index === 0}
            onClick={() => onIndex(index - 1)}
          >
            ← Back
          </button>
          <button
            type="button"
            className="flow-step-skip"
            disabled={index >= steps.length - 1}
            onClick={() => onIndex(index + 1)}
          >
            Skip for now
          </button>
          {footNote && <span className="flow-step-note">{footNote}</span>}
        </footer>
      </div>
    </section>
  );
}

/**
 * One thing the engine has an opinion about, with the opinion at rest.
 *
 * ## What changed, and why it is the point
 *
 * `SuggestionCard` is a `<details>`: the name, a source tag and a fit bar,
 * and everything about *why* behind a disclosure. So the ranking was visible
 * and the reasoning was not, which makes a ranked list a leaderboard - you
 * take the top one because it is the top one.
 *
 * Here the single strongest reason is always visible and the ±breakdown is
 * one click away. That is the same information in the opposite order, and it
 * is the difference between a tool that ranks for you and one that argues.
 *
 * ## Refusal at the choice
 *
 * A pick you cannot take is shown, dimmed, with the reason where its score
 * would be - not hidden, and not left to fail on apply. Three kinds and all
 * three are worth keeping: already taken (a feat cannot be taken twice), a
 * prerequisite not met, and one that is legal and simply does nothing for
 * this build. The last is the one people learn from, so it is scored low
 * rather than filtered out.
 */
/** The score the fit bar treats as a full bar, matching `FitBar`'s own scale. */
const FIT_MAX = 18;

export function RankedOption({
  pick,
  rank,
  open,
  onToggle,
  onApply,
}: {
  pick: RankedPick;
  rank: number;
  /** Whether the ±breakdown is showing. Held by the flow, not the card, so
      opening one and moving on does not leave a trail of open cards. */
  open: boolean;
  onToggle: () => void;
  onApply: () => void;
}) {
  const refusals = pick.taken
    ? ['Already on this character. It can only be taken once, so there is nothing here to apply.']
    : (pick.blockedBy ?? []);
  const blocked = refusals.length > 0;
  const pct = blocked || pick.score === null
    ? 0
    : Math.max(4, Math.min(100, (pick.score / FIT_MAX) * 100));

  return (
    <article
      className={`flow-opt${blocked ? ' is-blocked' : ''}${rank === 1 && !blocked ? ' is-top' : ''}`}
    >
      <span className="flow-opt-rank" aria-hidden="true">
        {rank}
      </span>

      <div className="flow-opt-main">
        <h3>
          {pick.name}
          {pick.source && <span className="flow-opt-src">{pick.source}</span>}
          {/* The refusal, where a reader is already looking for the name. */}
          {blocked && <span className="flow-opt-flag">{refusals[0]}</span>}
        </h3>

        {/*
          At rest, and never behind a disclosure. On a blocked pick the
          refusal takes this line, because the reason it cannot be taken is
          strictly more useful than the reason it scored well.
        */}
        <p className="flow-opt-top">{blocked ? refusals.join(' ') : pick.headline}</p>

        {pick.reasons.length > 0 && (
          <>
            <button type="button" className="flow-opt-why" aria-expanded={open} onClick={onToggle}>
              {open ? 'Hide the working' : 'Why this score'}
            </button>
            {open && (
              <ul className="flow-opt-reasons">
                {pick.reasons.map((reason, i) => (
                  <li key={i}>
                    {/*
                      §131's rule, applied to a delta rather than a modifier:
                      the sign is always written, and a reason worth nothing
                      says so rather than being left blank.
                    */}
                    <em
                      className={
                        reason.delta > 0 ? 'is-up' : reason.delta < 0 ? 'is-down' : 'is-flat'
                      }
                    >
                      {reason.delta === 0 ? '—' : signed(Math.round(reason.delta * 10) / 10)}
                    </em>
                    <span>{reason.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="flow-opt-fit">
        <span className="flow-opt-bar" aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </span>
        <span className="flow-opt-score">
          {blocked || pick.score === null ? '—' : signed(Math.round(pick.score * 10) / 10)}
        </span>
        <button
          type="button"
          className={`btn btn-sm${rank === 1 && !blocked ? ' btn-primary' : ''}`}
          disabled={blocked}
          onClick={onApply}
        >
          {blocked ? 'Unavailable' : 'Apply'}
        </button>
      </div>
    </article>
  );
}

/** A word for each kind of thing a level hands over, for the cell's label. */
const REPORT_LABELS: Record<LevelUpSummary['steps'][number]['kind'], string> = {
  hp: 'Hit points',
  features: 'Features',
  subclass: 'Subclass',
  asi: 'Improvement',
  spells: 'Spellcasting',
  options: 'Class options',
};

/**
 * The level-up step: what the book gave you, in cells rather than prose.
 *
 * Cells because the three facts are of one kind - a label, a figure, a note -
 * and a paragraph would make the reader extract them. `LevelUpPanel` says the
 * same things in a panel of its own for the dense page; this is the flow's
 * reading of it.
 */
export function LevelUpReport({
  summary,
  hpTotal,
  rolling,
  rolled,
  onRoll,
}: {
  summary: LevelUpSummary;
  /** Hit points as they stand, which a roll here changes. */
  hpTotal: number;
  /** Whether this character counts hit points by rolling. */
  rolling: boolean;
  /** This level's face, once rolled. */
  rolled: number | null;
  onRoll: () => void;
}) {
  return (
    <div className="flow-report">
      {summary.steps.map((step) => (
        <div className="flow-report-cell" key={step.kind}>
          <span>{REPORT_LABELS[step.kind]}</span>
          {/*
            The hit point figure stops being asserted once you roll: "+9" was
            this level under the fixed average, and standing next to "rolled a
            7" it reads as a contradiction.
          */}
          <b>{step.kind === 'hp' && rolled !== null ? 'Hit points' : step.title}</b>
          <em>
            {step.kind === 'hp'
              ? /* Shared with `LevelUpPanel` rather than written twice - the
                   sentence depends on how the character counts hit points
                   *now*, and rolling changes that from inside whichever of
                   the two is on screen. */
                hitPointDetail(rolling, rolled, summary.hitDie, hpTotal)
              : step.detail ||
                (step.owed > 0 ? `${step.owed} still to choose` : 'nothing to choose - it is already yours')}
          </em>
          {step.kind === 'hp' && summary.hitDie > 0 && (
            <button type="button" className="flow-step-skip" onClick={onRoll}>
              {rolled === null && !rolling
                ? `Roll a d${summary.hitDie} instead`
                : `Roll the d${summary.hitDie} again`}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * The review step: mistakes, each with the way to the step that fixes it.
 *
 * The colour is the severity and nothing else - a left edge rather than a
 * chip, because four chips down a list read as four labels to sort by and
 * this list is already in the order it should be read.
 */
export function ReviewFindings({ findings }: { findings: Finding[] }) {
  if (!findings.length) {
    return (
      <p className="muted">
        Nothing here is a mistake. What is left is taste, and the band above says where.
      </p>
    );
  }
  return (
    <div className="flow-findings">
      {findings.map((finding, i) => (
        <div className={`flow-finding is-${finding.severity}`} key={i}>
          <h3>{finding.title}</h3>
          <p>{finding.detail}</p>
          {finding.fix && (
            <p className="flow-finding-fix">
              <span aria-hidden="true">→</span> {finding.fix}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
