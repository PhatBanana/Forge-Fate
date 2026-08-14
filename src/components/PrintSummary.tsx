import { ABILITIES, ABILITY_NAMES } from '../types';
import { analyze } from '../engine/analyze';
import { describeSuggestion, planProgression } from '../engine/recommend';
import type { BuildContext } from '../engine/character';

/**
 * The planning sheet, as opposed to the playing one.
 *
 * This is the optimizer's view on paper: where the character is going, what the
 * damage model says, and what a knowledgeable reader would flag. All the things
 * the character sheet deliberately leaves out, because they are useful while
 * building and noise at the table.
 */

function signed(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

export function PrintSummary({ ctx }: { ctx: BuildContext }) {
  const plan = planProgression(ctx.build);
  const findings = analyze(ctx);
  const curve = ctx.dpr.curve;
  const peak = Math.max(1, ...curve.map((p) => p.nova));

  const classLine = ctx.slices
    .map((s) => `${s.klass.name}${s.subclass ? ` (${s.subclass.name})` : ''} ${s.entry.level}`)
    .join(' / ');

  return (
    <article className="sheet">
      <header className="sheet-head">
        <h1>{ctx.build.name || 'Unnamed'}</h1>
        <p>
          {ctx.race.name} · {classLine} · level {ctx.totalLevel} · build summary
        </p>
      </header>

      <section className="sheet-abilities">
        {ABILITIES.map((ability) => (
          <div className="sheet-ability" key={ability}>
            <div className="k">{ABILITY_NAMES[ability]}</div>
            <div className="score">{ctx.scores[ability]}</div>
            <div className="mod">{signed(ctx.mods[ability])}</div>
          </div>
        ))}
      </section>

      <h2>Damage per round</h2>
      <p className="sheet-para">
        {ctx.dpr.sustained} sustained, {ctx.dpr.nova} nova, against AC {ctx.dpr.targetAc} — typical
        for level {ctx.totalLevel}.
        {ctx.dpr.powerAttackBreakEven !== undefined &&
          ` The −5/+10 option pays off up to AC ${ctx.dpr.powerAttackBreakEven}.`}
      </p>
      <table className="sheet-table">
        <thead>
          <tr>
            <th>Target AC</th>
            {curve.filter((p) => p.ac % 2 === 0).map((p) => (
              <th key={p.ac}>{p.ac}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Sustained</td>
            {curve.filter((p) => p.ac % 2 === 0).map((p) => (
              <td key={p.ac}>{p.sustained}</td>
            ))}
          </tr>
          <tr>
            <td>Nova</td>
            {curve.filter((p) => p.ac % 2 === 0).map((p) => (
              <td key={p.ac}>{p.nova}</td>
            ))}
          </tr>
        </tbody>
      </table>
      <div className="summary-bars" aria-hidden="true">
        {curve.map((point) => (
          <span key={point.ac} style={{ height: `${(point.sustained / peak) * 100}%` }} />
        ))}
      </div>

      <h2>What each contributes</h2>
      <ul className="sheet-features">
        {ctx.dpr.lines.map((line, i) => (
          <li key={i}>
            <b>{line.value}</b> {line.label}
            {line.detail && <em> — {line.detail}</em>}
          </li>
        ))}
      </ul>

      <h2>The plan ahead</h2>
      {plan.length ? (
        <table className="sheet-table">
          <thead>
            <tr>
              <th>Level</th>
              <th>Take</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {plan.map((slot, i) => (
              <tr key={i}>
                <td>{slot.label}</td>
                <td>{describeSuggestion(slot.choice)}</td>
                <td>{slot.choice.headline}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">No improvements left to plan — this character is finished.</p>
      )}

      <h2>Build review</h2>
      {findings.length ? (
        <ul className="sheet-features">
          {findings.map((finding, i) => (
            <li key={i}>
              <b>{finding.title}</b> — {finding.detail}
              {finding.fix && <em> {finding.fix}</em>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Nothing to flag.</p>
      )}
    </article>
  );
}
