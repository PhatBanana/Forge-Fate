import { useMemo } from 'react';
import type { Build } from '../types';
import { analyze, problemsOnly } from '../engine/analyze';
import { dprByLevel } from '../engine/scaling';
import { FlowFoot } from './FlowFoot';
import type { Section } from './sections';
import type { BuildContext } from '../engine/character';
import type { PlayState } from '../play';
import { CharacterSheet } from './CharacterSheet';
import { ScreenSheet } from './ScreenSheet';

/**
 * The sheet, in whichever of its two readings is showing.
 *
 * ## What this used to be
 *
 * A tab with a sub-toggle: "Character sheet" and "Build summary". The first
 * was the sheet; the second was the *Builder's* output on paper - the
 * progression plan, the damage model, what a reader would flag - which is a
 * different document about the same character, and it never belonged behind a
 * control that said which sheet you were reading. §138 moved it to the dense
 * page, where the rest of the Builder's output already is.
 *
 * ## What it is now
 *
 * Two readings and a Print button, and the button only means anything on one
 * of them:
 *
 * - **sheet** — `ScreenSheet`, the app's own palette, abridged, never printed.
 * - **paper** — `CharacterSheet`, ink on cream in both themes, the sheet of
 *   record, and the one the print block targets.
 *
 * That split is the §138 answer to a real collision. The handoff asked for
 * both readings to follow the theme, and the palette comment on `.cs` has
 * argued since it was written that the sheet must not, because the screen and
 * the printed page are the same document. Both are right about different
 * readings - the argument was always about print, and only one of these
 * prints. So the conceit stayed on the reading that earns it.
 */
export function SheetTab({
  ctx,
  view,
  play,
  onPlayChange,
  onBuildChange,
  onGoTo,
}: {
  ctx: BuildContext;
  view: 'sheet' | 'paper';
  play: PlayState;
  onPlayChange: (play: PlayState) => void;
  onBuildChange: (build: Build) => void;
  /** Take me to the Builder, on the section that fixes this finding. */
  onGoTo: (section: Section) => void;
}) {
  /* §139: twenty whole builds, so it is memoised on what actually moves it. */
  const byLevel = useMemo(
    () => dprByLevel(ctx.build, ctx.dpr.targetAc, Math.max(20, ctx.totalLevel)),
    [ctx.build, ctx.dpr.targetAc, ctx.totalLevel],
  );
  const problems = problemsOnly(analyze(ctx));

  return (
    <div className="flow-main print-sheet">
      <div className="print-controls">
        <button className="btn btn-primary" onClick={() => window.print()}>
          Print
        </button>
        <span className="muted">
          {view === 'paper'
            ? 'What you see here is what prints — the same boxes, without the app around them.'
            : 'The reading for a screen: abridged, and on the app’s own colours. Printing gives you the paper reading, which is the sheet of record.'}
        </span>
      </div>

      {view === 'paper' ? (
        <CharacterSheet
          ctx={ctx}
          play={play}
          onPlayChange={onPlayChange}
          onBuildChange={onBuildChange}
        />
      ) : (
        <ScreenSheet
          ctx={ctx}
          play={play}
          onPlayChange={onPlayChange}
          onBuildChange={onBuildChange}
        />
      )}

      {/*
        §139: the foot rides both readings of the sheet as well as the flow.
        "Is this build actually all right" is the same question asked from a
        different chair, and putting it only on the Builder would mean the
        answer vanished exactly when you went to look at what you had built.
      */}
      <FlowFoot ctx={ctx} byLevel={byLevel} findings={problems} onGoTo={onGoTo} />
    </div>
  );
}
