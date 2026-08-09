import type { Square } from '../encounter';
import type { SightContext } from './sight';
import { lineOfSight } from './sight';
import { keyOf } from '../terrain';
import { canSeeInto } from './light';
import type { Eyes, LightLevel } from './light';

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
 *
 * ## Light, added in §40
 *
 * Until then this was line of sight alone, which meant unlimited range
 * through a pitch-dark dungeon. It now asks a second question of every
 * square - is there enough light *for these particular eyes* - and each pair
 * of eyes answers for itself, because that is the whole point of darkvision.
 * The dwarf sees the unlit corridor and the human beside him does not, and
 * the union is what the party knows between them.
 *
 * `lit` absent means the caller has no light model and every square is lit,
 * which is exactly the behaviour every call had before this parameter
 * existed.
 */
export function visibleFrom(
  ctx: SightContext,
  eyes: Eyes[],
  width: number,
  height: number,
  lit?: (at: Square) => LightLevel,
): Set<string> {
  const out = new Set<string>();
  if (!eyes.length) return out;
  // Your own square is yours whatever the light: a creature in a pitch-dark
  // room still knows where it is standing.
  for (const eye of eyes) out.add(keyOf(eye.at));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = { x, y };
      const key = keyOf(at);
      if (out.has(key)) continue;
      for (const eye of eyes) {
        if (lit && !canSeeInto(eye, at, lit(at))) continue;
        if (lineOfSight(ctx, eye.at, at).visible) {
          out.add(key);
          break;
        }
      }
    }
  }
  return out;
}
