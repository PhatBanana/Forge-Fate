import { signed } from '../format';
import type { Finding } from '../engine/analyze';
import type { BuildContext } from '../engine/character';
import type { LevelPoint } from '../engine/scaling';
import type { Section } from './sections';

/**
 * §138. The foot: what the build hits for, and what is wrong with it.
 *
 * ## Why these two, on every reading
 *
 * They were both in the Builder's pinned rail, and the rail's argument for
 * them was right - "where is this build going" and "what would a reader flag"
 * are questions you ask while making any part of a character, not questions
 * that belong to one section. §138 removed the rail, so they needed somewhere
 * that is not a section, and the foot of the column is it.
 *
 * They ride every reading for the same reason. A choice applied in the guided
 * flow moves the damage figure and can silence or raise a finding; reading the
 * sheet and wondering "is this build actually all right" is the same question
 * asked from a different chair. Putting them only on the Builder would mean
 * the answer disappeared exactly when you went to look at what you had built.
 *
 * ## Summary, not the panel
 *
 * `DamagePanel` is still on the dense page and still has the two charts, the
 * assumptions and the AC toggle. This is the one figure and the shape of the
 * curve - what you glance at - and the panel is what you open when the glance
 * raises a question. The same relationship the pending band has to the
 * sections: a readout above, the work below.
 *
 * The curve is passed in rather than computed here. `dprByLevel` derives
 * twenty whole builds, and the dense page already runs it for the panel - so
 * the caller memoises it once and both readers take it, instead of the page
 * paying for the same twenty derivations twice.
 */
export function FlowFoot({
  ctx,
  byLevel,
  findings,
  onGoTo,
}: {
  ctx: BuildContext;
  /** Sustained and nova at every level, for the sparkline. */
  byLevel: LevelPoint[];
  /** Mistakes only - what is merely unfinished is the band's job, at the top. */
  findings: Finding[];
  /** Take me to the section that fixes this one. */
  onGoTo: (section: Section) => void;
}) {
  const dpr = ctx.dpr;
  const peak = Math.max(1, ...byLevel.map((point) => point.sustained));
  const here = byLevel.find((point) => point.level === ctx.totalLevel);
  const previous = byLevel.find((point) => point.level === ctx.totalLevel - 1);
  const delta = here && previous ? Math.round((here.sustained - previous.sustained) * 10) / 10 : null;

  return (
    <div className="flow-foot">
      <section className="flow-dpr">
        <h2>Damage per round</h2>
        <p>
          <b>{dpr.sustained.toFixed(1)}</b>
          <em>{dpr.nova.toFixed(1)} nova</em>
        </p>
        {/*
          Twenty bars and no axis. This is the *shape* of the curve - front
          loaded, or does it come good at eleven - and an axis would invite
          reading values off it, which is what the panel's chart is for.
        */}
        <div className="flow-spark" role="img" aria-label={`Damage per round from level 1 to ${byLevel.length}`}>
          {byLevel.map((point) => (
            <i
              key={point.level}
              className={point.level === ctx.totalLevel ? 'is-here' : ''}
              style={{ height: `${Math.max(3, (point.sustained / peak) * 100)}%` }}
            />
          ))}
        </div>
        <span>
          level {ctx.totalLevel} · {dpr.sustained.toFixed(1)}
          {delta !== null && delta !== 0 && ` (${signed(delta)})`} · against AC {dpr.targetAc}
        </span>
      </section>

      <section className="flow-review">
        <h2>Build review</h2>
        {findings.length === 0 ? (
          <p className="muted">Nothing here is a mistake.</p>
        ) : (
          findings.map((finding, i) => (
            /*
              Each finding is the way to the section that fixes it, because a
              review you cannot act on from where you are reading it is a list
              of things to remember. Which section is a judgement the finding
              does not carry, so it is made here, once - see `SECTION_FOR`.
            */
            <button
              type="button"
              key={i}
              className={`flow-review-row is-${finding.severity}`}
              onClick={() => onGoTo(sectionFor(finding))}
            >
              {finding.title}
            </button>
          ))
        )}
      </section>
    </div>
  );
}

/**
 * Which section answers a finding.
 *
 * `Finding` carries no section of its own and should not: `analyze.ts` is
 * about the character, not about the screen that shows it, and a rule module
 * that knew the Builder's five sections would be the wrong module knowing it.
 *
 * So the mapping is made here, from the words the finding uses. Crude on
 * purpose - it is routing a click, and the cost of getting one wrong is
 * landing a section away from the fix rather than on it. The fallback is
 * Feats, which is where the largest share of them are answered.
 */
function sectionFor(finding: Finding): Section {
  const text = `${finding.title} ${finding.detail}`.toLowerCase();
  if (/\barmor|weapon|shield|equip|carr|attack\b/.test(text)) return 'equipment';
  if (/\bskill|proficien|spell|cantrip|invocation|maneuver|fighting style\b/.test(text)) {
    return 'options';
  }
  if (/\bscore|dexterity|strength|constitution|intelligence|wisdom|charisma\b/.test(text)) {
    return 'abilities';
  }
  if (/\bbackground|species|lineage|race|subclass\b/.test(text)) return 'identity';
  return 'feats';
}
