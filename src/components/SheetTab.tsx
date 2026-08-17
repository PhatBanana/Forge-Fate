import { useRovingTabs } from './useRovingTabs';
import { useState } from 'react';
import type { Build } from '../types';
import type { BuildContext } from '../engine/character';
import type { PlayState } from '../play';
import { CharacterSheet } from './CharacterSheet';
import { PrintSummary } from './PrintSummary';

/**
 * The sheet, on screen and on paper.
 *
 * There used to be a print-only view reached from the roster, which meant the
 * printed page was a thing you could only see by printing it. It is a tab now,
 * and what is on it is what comes out of the printer - the stylesheet's print
 * block removes the app around it and nothing else.
 *
 * The build summary is the second thing worth printing and has almost nothing
 * in common with the first: it is the optimizer's view on paper, for planning
 * rather than playing.
 */

type Layout = 'sheet' | 'summary';

export function SheetTab({
  ctx,
  play,
  onPlayChange,
  onBuildChange,
}: {
  ctx: BuildContext;
  play: PlayState;
  onPlayChange: (play: PlayState) => void;
  onBuildChange: (build: Build) => void;
}) {
  const [layout, setLayout] = useState<Layout>('sheet');
  /* §85: the row claimed role="tab" and answered no arrow key. */
  const { tablistProps, tabProps } = useRovingTabs();

  return (
    <div className="print-sheet">
      <div className="print-controls">
        <div className="spell-levels" role="tablist" style={{ margin: 0 }} {...tablistProps}>
          <button
            role="tab"
            aria-selected={layout === 'sheet'}
            {...tabProps(layout === 'sheet')}
            onClick={() => setLayout('sheet')}
          >
            Character sheet
          </button>
          <button
            role="tab"
            aria-selected={layout === 'summary'}
            {...tabProps(layout === 'summary')}
            onClick={() => setLayout('summary')}
          >
            Build summary
          </button>
        </div>
        <button className="btn btn-primary" onClick={() => window.print()}>
          Print
        </button>
        <span className="muted">
          {layout === 'sheet'
            ? 'What you see here is what prints — the same boxes, without the app around them.'
            : 'Where the character is going, what the damage model says, and what a reader would flag.'}
        </span>
      </div>

      {layout === 'sheet' ? (
        <CharacterSheet
          ctx={ctx}
          play={play}
          onPlayChange={onPlayChange}
          onBuildChange={onBuildChange}
        />
      ) : (
        <PrintSummary ctx={ctx} />
      )}
    </div>
  );
}
