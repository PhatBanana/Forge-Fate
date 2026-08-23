import type { LightLevel, LightSource } from './engine/light';
import type { EncounterState } from './encounter';

/**
 * §126: the lights on the map.
 *
 * Four writers that were living in `encounter.ts` among forty-six others,
 * for no better reason than that they take an `EncounterState` and return
 * one - which is cohesion by argument type, not by concept. Half the fields
 * of that state are owned by a module somewhere else, and the light is one
 * of the clearer cases: `engine/light.ts` owns what a light *is*,
 * `fightSight.ts` (§111, §122) owns what it means for a square, and this is
 * the third piece - what a DM does to one during a fight.
 *
 * Verbatim, deliberately. Three separate sections of this history record a
 * move that quietly became a rewrite, so the bodies below were carried
 * across by substitution rather than retyped.
 */

/**
 * Put a light on the map, or into somebody's hand.
 *
 * Ids are minted from `nextSeq` the way combatant names are, so two torches
 * lit in the same session never collide - and so an undo that restores the
 * counter cannot hand out an id that is already in use.
 */
export function addLight(
  encounter: EncounterState,
  light: Omit<LightSource, 'id'>,
): EncounterState {
  return {
    ...encounter,
    nextSeq: encounter.nextSeq + 1,
    lights: [...(encounter.lights ?? []), { ...light, id: `light-${encounter.nextSeq}` }],
  };
}

export function removeLight(encounter: EncounterState, id: string): EncounterState {
  return { ...encounter, lights: (encounter.lights ?? []).filter((l) => l.id !== id) };
}

/** Snuff it, or light it again - the same lamp either way, which is why this
    is a flag rather than a delete. */
export function toggleLightOut(encounter: EncounterState, id: string): EncounterState {
  return {
    ...encounter,
    lights: (encounter.lights ?? []).map((l) => (l.id === id ? { ...l, out: !l.out } : l)),
  };
}

/** How bright the map is where no light reaches. */
export function setAmbientLight(
  encounter: EncounterState,
  level: LightLevel,
): EncounterState {
  return { ...encounter, ambientLight: level };
}

