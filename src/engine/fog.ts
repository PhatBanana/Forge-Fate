import type { Square } from '../encounter';
import type { SightContext } from './sight';
import { lineOfSight } from './sight';
import { keyOf } from '../terrain';

/**
 * Fog of war: what the party actually knows about the field.
 *
 * Three states, the way squad games have always drawn it: never seen
 * (dark), seen before but not now (dim - the map remembered), and in
 * somebody's line of sight right now (clear). The engine here computes only
 * the third; the remembered set lives on the encounter, because what the
 * party has explored is a fact about the session.
 *
 * Sight is the same `lineOfSight` every attack and cover call already uses
 * - one rule for whether A sees B, whoever is asking. Union over the
 * party's eyes: the fighter peering down the corridor lights it for
 * everyone, which is how a table actually plays.
 */
export function visibleFrom(
  ctx: SightContext,
  eyes: Square[],
  width: number,
  height: number,
): Set<string> {
  const out = new Set<string>();
  if (!eyes.length) return out;
  for (const eye of eyes) out.add(keyOf(eye));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = { x, y };
      const key = keyOf(at);
      if (out.has(key)) continue;
      for (const eye of eyes) {
        if (lineOfSight(ctx, eye, at).visible) {
          out.add(key);
          break;
        }
      }
    }
  }
  return out;
}
