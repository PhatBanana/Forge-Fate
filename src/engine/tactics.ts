import type { Square } from '../encounter';
import { keyOf } from '../terrain';
import type { ElevationMap } from '../terrain';

/**
 * Table rulings the map can see coming.
 *
 * Neither of these changes a roll on its own: flanking is the DMG's
 * *optional* rule, and high ground is a ruling, not a rule, in fifth
 * edition. The app's job is to notice - the way X-COM annotates a shot -
 * and leave the call to the DM. The shot chips and the log say the word;
 * nothing adds the advantage for you.
 */

/**
 * The optional flanking rule, on a grid: the attacker is in melee reach of
 * the target, and an ally of the attacker stands directly opposite - the
 * line through the target continues into a friend.
 */
export function flanked(attacker: Square, target: Square, allies: Square[]): boolean {
  const dx = target.x - attacker.x;
  const dy = target.y - attacker.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return false;
  const opposite = { x: target.x + dx, y: target.y + dy };
  return allies.some((ally) => ally.x === opposite.x && ally.y === opposite.y);
}

/** Steps of height the attacker holds over the target; 0 or less is none. */
export function heightAdvantage(
  elevation: ElevationMap,
  attacker: Square,
  target: Square,
): number {
  return (elevation[keyOf(attacker)] ?? 0) - (elevation[keyOf(target)] ?? 0);
}
