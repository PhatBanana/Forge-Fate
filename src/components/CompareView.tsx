import { ABILITIES, ABILITY_NAMES } from '../types';
import { featById } from '../data/feats';
import { SKILLS_BY_ID } from '../data/skills';
import { optionById } from '../data/classOptions';
import { spellById } from '../data/spells';
import type { BuildContext } from '../engine/character';

/**
 * Two characters side by side.
 *
 * The numbers alone would be a scoreboard without an explanation, so the
 * choices that differ come with them: if one build is four points of AC ahead,
 * the armor and the feats that did it are on the same screen. Everything the
 * two share is left out - two characters differ in hundreds of small ways and
 * almost none of them are why one hits harder.
 */

interface Row {
  label: string;
  left: number;
  right: number;
  /** Whether a bigger number is the better one. Not always true. */
  higherWins: boolean;
  format?: (value: number) => string;
  note?: string;
}

function rowsFor(left: BuildContext, right: BuildContext): Row[] {
  // Both DPR figures have to be read at the same AC or the comparison is
  // meaningless - a level 5 and a level 17 character face different tables.
  const ac = Math.max(left.dpr.targetAc, right.dpr.targetAc);
  const at = (ctx: BuildContext, key: 'sustained' | 'nova') =>
    ctx.dpr.curve.find((p) => p.ac === ac)?.[key] ?? 0;

  return [
    { label: 'Character level', left: left.totalLevel, right: right.totalLevel, higherWins: true },
    { label: 'Armor class', left: left.ac.total, right: right.ac.total, higherWins: true },
    { label: 'Hit points', left: left.hp.total, right: right.hp.total, higherWins: true },
    {
      label: `Sustained damage at AC ${ac}`,
      left: at(left, 'sustained'),
      right: at(right, 'sustained'),
      higherWins: true,
      note: 'Both read at the same target AC, so the two are comparable.',
    },
    { label: `Nova damage at AC ${ac}`, left: at(left, 'nova'), right: at(right, 'nova'), higherWins: true },
    {
      label: 'Attacks per round',
      left: left.attacks.length ? 1 + left.features.filter((f) => f.tags?.includes('extra-attack')).length : 0,
      right: right.attacks.length ? 1 + right.features.filter((f) => f.tags?.includes('extra-attack')).length : 0,
      higherWins: true,
    },
    { label: 'Spell save DC', left: left.spellSaveDc ?? 0, right: right.spellSaveDc ?? 0, higherWins: true },
    {
      label: 'Passive Perception',
      left: left.proficiencies.passivePerception,
      right: right.proficiencies.passivePerception,
      higherWins: true,
    },
    {
      label: 'Initiative',
      left: left.mods.dex,
      right: right.mods.dex,
      higherWins: true,
      format: (v) => (v >= 0 ? `+${v}` : `${v}`),
    },
    {
      label: 'Speed',
      left: left.speed.total,
      right: right.speed.total,
      higherWins: true,
      format: (v) => `${v} ft`,
    },
    {
      label: 'Problems flagged',
      left: left.ac.problems.length,
      right: right.ac.problems.length,
      // The one row where fewer is better, which is why the flag exists.
      higherWins: false,
    },
  ];
}

/** Names on one side and not the other, in both directions. */
function difference(a: string[], b: string[]): { onlyLeft: string[]; onlyRight: string[] } {
  const left = new Set(a);
  const right = new Set(b);
  return {
    onlyLeft: a.filter((x) => !right.has(x)),
    onlyRight: b.filter((x) => !left.has(x)),
  };
}

/**
 * Both damage curves on one chart.
 *
 * A single number at one AC hides the thing worth knowing: which build is ahead
 * depends on what you are fighting. A power-attack martial can lead by a wide
 * margin against a lightly armoured target and lose outright against a heavily
 * armoured one, and the crossing point is exactly what a comparison should
 * show. Drawn as an SVG rather than divs because two overlaid lines want to be
 * lines.
 */
function DprCurves({ left, right }: { left: BuildContext; right: BuildContext }) {
  const acs = left.dpr.curve.map((p) => p.ac);
  const peak = Math.max(
    1,
    ...left.dpr.curve.map((p) => p.sustained),
    ...right.dpr.curve.map((p) => p.sustained),
  );

  const W = 520;
  const H = 150;
  const PAD = { left: 30, right: 8, top: 8, bottom: 18 };
  const x = (index: number) =>
    PAD.left + (index / (acs.length - 1)) * (W - PAD.left - PAD.right);
  const y = (value: number) =>
    H - PAD.bottom - (value / peak) * (H - PAD.top - PAD.bottom);

  const path = (ctx: BuildContext) =>
    ctx.dpr.curve.map((point, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(point.sustained)}`).join(' ');

  // Where the lead changes hands, which is the one thing a reader should take
  // away from two lines that cross.
  const crossings = left.dpr.curve
    .map((point, i) => ({ ac: point.ac, leftAhead: point.sustained > right.dpr.curve[i].sustained }))
    .filter((point, i, all) => i > 0 && point.leftAhead !== all[i - 1].leftAhead);

  const nameOf = (ctx: BuildContext) => ctx.build.name || 'Unnamed';

  return (
    <div>
      <svg
        className="curve-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Sustained damage from AC ${acs[0]} to ${acs.at(-1)}. ${nameOf(left)}: ${left.dpr.curve.map((p) => p.sustained).join(', ')}. ${nameOf(right)}: ${right.dpr.curve.map((p) => p.sustained).join(', ')}.`}
      >
        {[0, peak / 2, peak].map((value) => (
          <g key={value}>
            <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(value)} y2={y(value)} />
            <text className="axis" x={PAD.left - 5} y={y(value) + 3} textAnchor="end">
              {Math.round(value)}
            </text>
          </g>
        ))}
        {acs.map((ac, i) =>
          ac % 5 === 0 ? (
            <text className="axis" key={ac} x={x(i)} y={H - 5} textAnchor="middle">
              {ac}
            </text>
          ) : null,
        )}
        <path className="curve curve-left" d={path(left)} />
        <path className="curve curve-right" d={path(right)} />
      </svg>

      <div className="curve-key">
        <span className="key-left">{nameOf(left)}</span>
        <span className="key-right">{nameOf(right)}</span>
      </div>

      {crossings.length > 0 && (
        <p className="note">
          The lead changes at AC {crossings.map((c) => c.ac).join(' and AC ')} — which of these two
          hits harder depends on what you are fighting.
        </p>
      )}
    </div>
  );
}

export function CompareView({ left, right }: { left: BuildContext; right: BuildContext }) {
  const rows = rowsFor(left, right);

  const nameOf = (ctx: BuildContext) => ctx.build.name || 'Unnamed';

  const lists: { label: string; onlyLeft: string[]; onlyRight: string[] }[] = [
    {
      label: 'Feats',
      ...difference(
        [...left.featIds].map((id) => featById(id, left.build.ruleset)?.name ?? id),
        [...right.featIds].map((id) => featById(id, right.build.ruleset)?.name ?? id),
      ),
    },
    {
      label: 'Skill proficiencies',
      ...difference(
        left.proficiencies.skills.filter((s) => s.proficient).map((s) => s.name),
        right.proficiencies.skills.filter((s) => s.proficient).map((s) => s.name),
      ),
    },
    {
      label: 'Expertise',
      ...difference(
        left.build.expertiseIds.map((id) => SKILLS_BY_ID[id]?.name ?? id),
        right.build.expertiseIds.map((id) => SKILLS_BY_ID[id]?.name ?? id),
      ),
    },
    {
      label: 'Class options',
      ...difference(
        left.build.classOptionIds.map((id) => optionById(id)?.name ?? id),
        right.build.classOptionIds.map((id) => optionById(id)?.name ?? id),
      ),
    },
    {
      label: 'Spells',
      ...difference(
        left.build.spellIds.map((id) => spellById(id)?.name ?? id),
        right.build.spellIds.map((id) => spellById(id)?.name ?? id),
      ),
    },
  ].filter((entry) => entry.onlyLeft.length || entry.onlyRight.length);

  const abilityRows = ABILITIES.filter((a) => left.scores[a] !== right.scores[a]);

  return (
    <div className="compare">
      <table className="compare-table">
        <thead>
          <tr>
            <th />
            <th>{nameOf(left)}</th>
            <th>{nameOf(right)}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const fmt = row.format ?? ((v: number) => `${v}`);
            const leftWins = row.higherWins ? row.left > row.right : row.left < row.right;
            const rightWins = row.higherWins ? row.right > row.left : row.right < row.left;
            return (
              <tr key={row.label}>
                <th scope="row" title={row.note}>
                  {row.label}
                </th>
                <td className={leftWins ? 'wins' : ''}>{fmt(row.left)}</td>
                <td className={rightWins ? 'wins' : ''}>{fmt(row.right)}</td>
              </tr>
            );
          })}
          {abilityRows.map((ability) => (
            <tr key={ability}>
              <th scope="row">{ABILITY_NAMES[ability]}</th>
              <td className={left.scores[ability] > right.scores[ability] ? 'wins' : ''}>
                {left.scores[ability]}
              </td>
              <td className={right.scores[ability] > left.scores[ability] ? 'wins' : ''}>
                {right.scores[ability]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="compare-heading">Damage across the range of target ACs</h3>
      <DprCurves left={left} right={right} />

      {lists.length > 0 ? (
        <>
          <h3 className="compare-heading">What they chose differently</h3>
          <table className="compare-table">
            <tbody>
              {lists.map((entry) => (
                <tr key={entry.label}>
                  <th scope="row">{entry.label}</th>
                  <td>{entry.onlyLeft.join(', ') || <span className="muted">—</span>}</td>
                  <td>{entry.onlyRight.join(', ') || <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="muted" style={{ marginTop: 12 }}>
          These two made all the same choices.
        </p>
      )}
    </div>
  );
}
