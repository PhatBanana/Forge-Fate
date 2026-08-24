import { SECTIONS, openChoicesBySection } from './sections';
import type { Section } from './sections';
import type { BuildContext } from '../engine/character';

/**
 * §138. What the pinned rail's "Next choices" panel became.
 *
 * ## Why it moved
 *
 * The rail existed to answer "what did that change" and "what is still
 * unmade" while you were changing things, and it answered both from beside
 * the form. §138 fused the flow with the sheet, so the first question is now
 * answered by the sheet itself - the box the choice fills is right there, and
 * the figures move in it. That left the rail holding one thing worth keeping.
 *
 * So it is a band rather than a panel: one line across the top of the column,
 * above whichever of the four readings is showing. Horizontal because it is
 * now a table of contents rather than a column of readouts, and above rather
 * than beside because there is no beside any more.
 *
 * ## What it says, and what it does not
 *
 * The §123 sections that are still waiting, named and counted, each a way to
 * the section that answers it. Not the findings - those are the build review,
 * and a finding is a mistake while this is unfinished business. Not the whole
 * glance - AC and hit points are on the sheet underneath, and repeating them
 * two inches above where they are printed is how the rail got to be three
 * screens tall in the first place.
 *
 * The one figure that does ride here is damage per round, because it is the
 * only number on the sheet that a choice three sections away can move, and
 * the card that holds it is at the foot of a page you are at the top of.
 *
 * Sections that are done stay in the band rather than disappearing from it.
 * A band that shortened as you worked would move every remaining pill under
 * the cursor each time you answered one, and "done ✓" beside a name is the
 * thing that tells you the section was ever asking.
 *
 * ## Anchors, still
 *
 * This band is the `.steps` rail redrawn, and it keeps that rail's one
 * structural decision: the pills are real `href`s into the sections rather
 * than buttons that scroll. §33.4 argued it and the argument has not changed
 * - a link gives keyboard behaviour, the back button, and a URL you can send
 * someone, none of which a button does, and it needs no `scrollIntoView`,
 * which jsdom does not implement. The handler beside it sets the section for
 * anything watching, which is the seam that makes the jump testable.
 */
export function PendingBand({
  ctx,
  current,
  onGoTo,
}: {
  ctx: BuildContext;
  /**
   * Which section is being read. The contextual column still shows the
   * readouts belonging to wherever you are, so the band still has to say
   * where that is - marked, never hidden, which was always §33.4's rule.
   */
  current?: Section;
  /** Take me to the section that makes this choice. */
  onGoTo: (section: Section) => void;
}) {
  const open = openChoicesBySection(ctx);
  const waiting = SECTIONS.filter((entry) => open[entry.id] > 0);
  const left = waiting.reduce((sum, entry) => sum + open[entry.id], 0);

  return (
    <nav className="flow-pending" aria-label="Sections of this character">
      <span className="flow-pending-count">{left === 0 ? 'all answered' : `${left} waiting`}</span>
      {SECTIONS.map((entry) => {
        const count = open[entry.id];
        return (
          <a
            key={entry.id}
            href={`#section-${entry.id}`}
            className={`flow-pending-pill${count > 0 ? ' is-waiting' : ''}${
              current === entry.id ? ' is-on' : ''
            }`}
            aria-current={current === entry.id ? 'true' : undefined}
            onClick={() => onGoTo(entry.id)}
          >
            <span className="flow-pending-where">{entry.label}</span>
            {/*
              "1 choice" rather than a bare "1": a lone number beside a section
              name reads as how big the section is, which is what the badge it
              replaces had a `title` attribute to correct. The title stays for
              the same reason it was there, and it is on this element rather
              than on the pill so that "is anything waiting here" is a
              question about the count and not about the link.
            */}
            <em title={count > 0 ? `${count} still to choose` : undefined}>
              {count > 0 ? `${count} ${count === 1 ? 'choice' : 'choices'}` : 'done ✓'}
            </em>
          </a>
        );
      })}
      <span
        className="flow-pending-dpr"
        title="Sustained damage per round, at this build's target AC"
      >
        <b>dpr</b>
        {ctx.dpr.sustained.toFixed(1)}
      </span>
    </nav>
  );
}
