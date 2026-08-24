import type { LevelUpSummary } from '../engine/levelUp';
import type { WaitingChoice } from './sections';

/**
 * §138. The guided flow's model: what a step is, and what a ranked pick is.
 *
 * Split from the card that draws them so that the shapes can be imported by
 * things that are not components - the adapters in `guidedPicks.ts`, and the
 * Builder, which derives the list. Both types are deliberately narrower than
 * the engine's own suggestion types: four engines score four different kinds
 * of thing and the card only ever needs the five fields they have in common.
 */

export type GuidedStep =
  | { kind: 'report'; id: 'levelup'; title: string; target: string; blurb: string }
  | ({ kind: 'choice'; id: string; title: string; target: string; blurb: string } & {
      choice: WaitingChoice;
    })
  | { kind: 'review'; id: 'review'; title: string; target: string; blurb: string };

/**
 * The steps, from the character as it stands.
 *
 * Derived every render rather than held: a step list that was state would go
 * stale the moment a choice was applied, which is every time it is used.
 */
export function guidedStepsFor(
  waiting: WaitingChoice[],
  levelUp: LevelUpSummary | null,
): GuidedStep[] {
  const steps: GuidedStep[] = [];
  if (levelUp) {
    steps.push({
      kind: 'report',
      id: 'levelup',
      title: `Level ${levelUp.to}${levelUp.className ? ` — ${levelUp.className}` : ''}`,
      target: 'the whole sheet',
      blurb:
        'You typed a number and the book answered. Here is what it gave you, and what it now wants back.',
    });
  }
  for (const choice of waiting) {
    steps.push({
      kind: 'choice',
      id: choice.id,
      title: choice.title,
      target: choice.target,
      blurb:
        choice.open === 1
          ? 'Ranked against this character exactly as it stands below.'
          : `${choice.open} of these are waiting. Ranked against this character exactly as it stands below.`,
      choice,
    });
  }
  steps.push({
    kind: 'review',
    id: 'review',
    title: 'What is wrong with this build',
    target: 'Build review',
    blurb:
      'Mistakes, not unfinished business. The band above already told you what is unchosen; these are the things that will not fix themselves.',
  });
  return steps;
}

export interface RankedPick {
  id: string;
  name: string;
  /** "Xanathar's", "Player's Handbook", "Wisdom" - where it comes from. */
  source?: string;
  /** Null where the thing carries no opinion: offered, not ranked. */
  score: number | null;
  /** The strongest single reason the score is where it is. Always visible. */
  headline: string;
  reasons: { text: string; delta: number }[];
  /** Why this cannot be taken. Empty or absent means it can. */
  blockedBy?: string[];
  /** Already on the character. Shown, refused, and said so. */
  taken?: boolean;
}
