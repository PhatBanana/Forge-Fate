import { deriveBuild } from './character';
import type { Build } from '../types';

/**
 * How this build's damage grows as it levels.
 *
 * The Builder has always charted damage per round against the *target's* armor
 * class - "can I hit this dragon". That is a real question and it stays, but it
 * is not the one people mean by scaling. This answers the other one: **is this
 * build front-loaded or does it come good at eleven?**
 *
 * ## How a level is derived
 *
 * By re-deriving the whole build at that level rather than extrapolating, so
 * every rider the damage model knows about - Extra Attack, a subclass die, a
 * cantrip's third beam, a mastery - lands at exactly the level it lands at.
 * Twenty `deriveBuild` calls, which is why the caller memoises. There is
 * precedent: `planProgression` already re-derives internally for each ASI it
 * considers.
 *
 * ## Two things it has to decide, and does so explicitly
 *
 * **Which class gains the levels.** The primary one; every other class stays
 * where it is. A Fighter 6 / Rogue 2 charted at level 5 is a Fighter 3 /
 * Rogue 2, not some proportional blend, because that is the build the player
 * actually walked through.
 *
 * **How many feats they had.** The build stores feats and ability score
 * improvements as flat lists with no level attached, so charting a level-12
 * character at level 3 with all four of their feats would flatter the early
 * levels badly. They are trimmed to the number of slots that level had
 * reached, keeping the earliest taken - "your feats in the order you took
 * them, as many as that level had room for". Origin feats are never trimmed:
 * they are granted at first level and cost no slot.
 */

export interface LevelPoint {
  level: number;
  sustained: number;
  nova: number;
}

/**
 * The build at one character level, as near as the stored build can say.
 *
 * Exported for testing: the trimming is the part with a judgement in it.
 */
export function buildAtLevel(build: Build, level: number): Build | null {
  const primary = build.classes[0];
  if (!primary) return null;
  const others = build.classes.slice(1).reduce((sum, entry) => sum + entry.level, 0);
  const primaryLevel = level - others;
  // Below this the multiclass does not exist yet, and inventing an order for
  // it would be making something up.
  if (primaryLevel < 1) return null;

  const scaled: Build = {
    ...build,
    classes: [{ ...primary, level: primaryLevel }, ...build.classes.slice(1)],
  };

  /*
    Trim to the slots this level had. `deriveBuild` is what knows how many that
    is - it walks the class tables - so it is asked rather than guessed at.
  */
  const slots = deriveBuild(scaled).asiSlotsReached;
  const taken: { kind: 'feat' | 'asi'; index: number }[] = [
    ...build.featIds.map((_, index) => ({ kind: 'feat' as const, index })),
    ...build.asiPicks.map((_, index) => ({ kind: 'asi' as const, index })),
  ].slice(0, slots);

  return {
    ...scaled,
    featIds: build.featIds.filter((_, i) => taken.some((t) => t.kind === 'feat' && t.index === i)),
    asiPicks: build.asiPicks.filter((_, i) => taken.some((t) => t.kind === 'asi' && t.index === i)),
  };
}

/**
 * Sustained and nova damage at every level this build can reach, measured
 * against one armor class throughout.
 *
 * One AC on purpose. Letting it drift with level - "typical for the tier" -
 * would fold two curves into one and leave a rise that could be the build
 * getting better or the target getting harder. The caller states which AC on
 * the chart.
 */
export function dprByLevel(build: Build, targetAc: number, maxLevel = 20): LevelPoint[] {
  const points: LevelPoint[] = [];
  for (let level = 1; level <= maxLevel; level++) {
    const at = buildAtLevel(build, level);
    if (!at) continue;
    const { dpr } = deriveBuild(at);
    const point = dpr.curve.find((p) => p.ac === targetAc);
    if (!point) continue;
    points.push({ level, sustained: point.sustained, nova: point.nova });
  }
  return points;
}
