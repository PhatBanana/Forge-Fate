import { canSeeInto, lightAt, placeLights } from './engine/light';
import type { Eyes, LightLevel, LightSource } from './engine/light';
import { sensesFor, sensesForMonster } from './engine/senses';
import { lineOfSight } from './engine/sight';
import type { SightContext } from './engine/sight';
import { visibleFrom } from './engine/fog';
import { inZone } from './zones';
import { keyOf } from './terrain';
import type { Square, Combatant, EncounterState } from './encounter';
import { hitPointsOf } from './hitPoints';
import { maxHpOf } from './fightFacts';
import type { FightView } from './fightFacts';

/**
 * §111: what the fight can see, and how dark it is where they are
 * looking (§40, §63).
 *
 * Two questions that are really one, which is why they were tangled
 * together in the battle screen and are lifted together here. **Light is
 * a fact about a square**; **sight is a fact about a pair of eyes** -
 * and since §40 every square is asked both, because the whole point of
 * darkvision is that the dwarf sees the unlit corridor and the human
 * beside him does not.
 *
 * All of it is pure. What deliberately did *not* move is the caching:
 * `litAt` is asked once per square per pair of eyes and again per drawn
 * square, so a party of five on a 40x30 map is thousands of calls, and
 * the memo that makes that cheap belongs to the render that owns it. So
 * this module hands back a *lookup* the caller memoises, rather than
 * keeping a cache of its own that would outlive the fight it described.
 * Second step of ROADMAP §9.
 */

/**
 * The lights, with carried ones stood where their bearer is standing.
 *
 * A torch is the commonest light in the game and a torch that stays
 * where it was lit is not a torch, so a carried light's position is
 * derived from its bearer rather than written down and kept in step.
 */
export const lightsInPlay = (lights: LightSource[], combatants: Combatant[]) =>
  placeLights(lights, (id) => combatants.find((c) => c.id === id)?.at ?? undefined);

/** How bright the map is where no light reaches. Bright unless said. */
export const ambientOf = (encounter: EncounterState): LightLevel =>
  encounter.ambientLight ?? 'bright';

/**
 * How bright one square is - as a lookup with a cache of its own, for
 * the caller to hold for exactly as long as the lights stand still.
 */
export function litLookup(
  lights: ReturnType<typeof lightsInPlay>,
  ambient: LightLevel,
): (at: Square) => LightLevel {
  const cache = new Map<string, LightLevel>();
  return (at: Square): LightLevel => {
    const key = keyOf(at);
    const seen = cache.get(key);
    if (seen) return seen;
    const level = lightAt(lights, at, ambient);
    cache.set(key, level);
    return level;
  };
}

/**
 * The dark, as the map draws it: every square that is not bright, by
 * key. Only the exceptions travel, so a lit map hands the cameras an
 * empty object and both draw nothing at all.
 */
export function gloomMap(
  litAt: (at: Square) => LightLevel,
  ambient: LightLevel,
  litCount: number,
  width: number,
  height: number,
): Record<string, 'dim' | 'dark' | 'magical-dark'> {
  if (ambient === 'bright' && !litCount) return {};
  const out: Record<string, 'dim' | 'dark' | 'magical-dark'> = {};
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const level = litAt({ x, y });
      if (level !== 'bright') out[keyOf({ x, y })] = level;
    }
  }
  return out;
}

/**
 * What a creature's eyes are worth: where they are, and what they can
 * see in the dark.
 *
 * The position is the fight's business; everything else is
 * `engine/senses.ts`, which gathers a character's sight from all five
 * places it can come from - species, features, invocations, feats and
 * worn items - and a monster's from the stat block's prose (§63).
 */
export function eyesOf(view: FightView, c: Combatant): Eyes | null {
  if (!c.at) return null;
  if (c.kind === 'monster') {
    return { at: c.at, ...sensesForMonster(view.monsterById(c.monsterId)?.senses) };
  }
  const ctx = view.buildOf(c.rosterId);
  return { at: c.at, ...(ctx ? sensesFor(ctx) : {}) };
}

/**
 * Fog of war: what the party can see right now, from their eyes, by the
 * same line-of-sight rule attacks and cover already use. Null when the
 * fog is off - the map shows everything, as it always has.
 *
 * Only those still standing look: a character at nought has their eyes
 * shut, which is what makes a party wipe dark rather than omniscient.
 */
export function partyVisible(
  view: FightView,
  sight: SightContext,
  size: { width: number; height: number },
  litAt: (at: Square) => LightLevel,
): Set<string> | null {
  if (!view.encounter.fog) return null;
  const eyes = view.encounter.combatants
    .filter(
      (c) => c.kind === 'character' && c.at && (hitPointsOf(c, view.roster, maxHpOf(view))?.now ?? 0) > 0,
    )
    .map((c) => eyesOf(view, c))
    .filter((e): e is Eyes => !!e);
  return visibleFrom(sight, eyes, size.width, size.height, litAt);
}

/** Whether this watcher's eyes can make out that square, light and all. */
export function lightSees(
  view: FightView,
  watcher: Combatant,
  at: Square,
  litAt: (at: Square) => LightLevel,
): boolean {
  const eyes = eyesOf(view, watcher);
  return eyes ? canSeeInto(eyes, at, litAt(at)) : true;
}

/** Whether this watcher has a clear line to that combatant. */
export const canSeeFrom =
  (view: FightView, sight: SightContext, watcher: Combatant) =>
  (id: string): boolean => {
    const other = view.encounter.combatants.find((c) => c.id === id);
    if (!watcher.at || !other?.at) return false;
    return lineOfSight(sight, watcher.at, other.at).visible;
  };

/** Whether a square sits under something that swallows sound - asked of
    a square rather than of a turn, because Silence is a zone (§64). */
export const silencedAt = (encounter: EncounterState, at: Square): boolean =>
  (encounter.zones ?? []).some((zone) => zone.effect?.silences && inZone(zone, at));
