import { ZONE_PRESETS, inZone, zoneSquares } from './zones';
import type { SurfaceKind, Zone } from './zones';

/**
 * What happens when one surface lands on another.
 *
 * Section 23 gave a zone an effect, which made a wall of fire different from a
 * drawing of one. It still left every zone alone in the world: pour a fireball
 * onto a slick of grease and the grease sat there being slippery. The whole
 * appeal of a battlefield made of stuff is that the stuff interacts - fire
 * finds the grease, lightning finds the water - and that is a thing a table
 * rules by hand every single time because no tool remembers to ask.
 *
 * ## Why a table rather than a function
 *
 * Every reaction is a row. Adding "acid dissolves web" is a row, not a branch,
 * which is the same bet section 23 made about presets and the same reason it
 * paid off: the interesting part is the *list*, and a list is something a DM
 * can read and disagree with.
 *
 * ## What a reaction may do
 *
 * Three things, deliberately. The standing surface can be **consumed** (the
 * web burns away), it can **become** something else (grease catches and is
 * fire now), and it can **jolt** - bite everyone standing in it once, right
 * then, which is what makes lightning-into-water frightening rather than
 * decorative. Anything richer stays the DM's call, the way it does everywhere
 * else in this app.
 */

/*
  `SurfaceKind` and the list of them live in `zones.ts`, with the effect they
  are a field of. The dependency runs one way - this file knows about zones,
  zones knows nothing about reactions - so the reaction table can be read,
  argued with and rewritten without the zone model noticing.
*/

export interface SurfaceReaction {
  /** The surface being placed. */
  incoming: SurfaceKind;
  /** The surface already on the ground. */
  standing: SurfaceKind;
  /** For the log: "{standing} {verb}". */
  verb: string;
  /** The standing zone goes away. */
  consumes?: boolean;
  /** The standing zone turns into this preset, keeping its shape and place. */
  becomes?: string;
  /** Everyone standing in the overlap takes this at once, when it happens. */
  jolt?: { dice: string; type: string; dc?: number };
}

/**
 * The reactions, in the order they are checked.
 *
 * Each is something a table would rule the same way without being asked,
 * which is the bar: this is a tool remembering the obvious, not inventing
 * house rules. The ones that would need a ruling - what a fireball does to a
 * cloudkill, whether ice is difficult ground or merely slippery - are absent
 * on purpose.
 */
export const SURFACE_REACTIONS: SurfaceReaction[] = [
  {
    incoming: 'fire',
    standing: 'grease',
    verb: 'catches and burns',
    becomes: 'burning-ground',
  },
  {
    incoming: 'fire',
    standing: 'web',
    verb: 'burns away',
    consumes: true,
    // The web goes up all at once. Small, because it is the burst rather than
    // a fire that stays.
    jolt: { dice: '2d4', type: 'fire' },
  },
  {
    incoming: 'fire',
    standing: 'ice',
    verb: 'melts',
    becomes: 'water',
  },
  {
    incoming: 'water',
    standing: 'fire',
    verb: 'is doused',
    consumes: true,
  },
  {
    incoming: 'ice',
    standing: 'water',
    verb: 'freezes over',
    becomes: 'ice',
  },
  {
    incoming: 'lightning',
    standing: 'water',
    verb: 'conducts the charge',
    // The water stays; what changes is that standing in it just became a
    // mistake. This is the one that makes players stop and look at the map.
    jolt: { dice: '2d8', type: 'lightning', dc: 13 },
  },
  {
    incoming: 'acid',
    standing: 'web',
    verb: 'dissolves',
    consumes: true,
  },
];

/** The reaction between two materials, or nothing. */
export const reactionFor = (
  incoming: SurfaceKind | undefined,
  standing: SurfaceKind | undefined,
): SurfaceReaction | null =>
  incoming && standing
    ? (SURFACE_REACTIONS.find((r) => r.incoming === incoming && r.standing === standing) ?? null)
    : null;

/** Whether two zones share any ground at all. */
export const overlaps = (a: Zone, b: Zone): boolean =>
  zoneSquares(a).some((s) => inZone(b, s));

export interface SurfaceOutcome {
  /** The zone list afterwards: transformed, consumed, with the new one added. */
  zones: Zone[];
  /** What to say, in the order it happened. */
  log: string[];
  /**
   * Zones that bite **once, now**, for whoever is standing in them.
   *
   * Returned rather than applied because hit points live in two stores - a
   * character's on their sheet, a monster's on the combatant - and this file
   * knows about neither. The caller runs them through the same machinery a
   * wall of fire already uses, so a jolt and a hazard cost the same way.
   */
  jolts: Zone[];
}

/**
 * Put a zone down, and let the ground answer.
 *
 * Pure: the zone list in, the zone list out. The incoming zone is checked
 * against every zone it overlaps, in the order they were placed, and each
 * match is resolved before the next - so dropping fire onto grease that is
 * itself on top of a web does both things, in the order the ground was built.
 */
export function placeZone(zones: Zone[], incoming: Zone): SurfaceOutcome {
  const log: string[] = [];
  const jolts: Zone[] = [];
  const out: Zone[] = [];
  let seq = 0;

  for (const standing of zones) {
    const reaction =
      overlaps(incoming, standing)
        ? reactionFor(incoming.effect?.surface, standing.effect?.surface)
        : null;

    if (!reaction) {
      out.push(standing);
      continue;
    }

    log.push(`${incoming.label} meets ${standing.label} — ${standing.label} ${reaction.verb}.`);

    if (reaction.jolt) {
      /*
        The jolt is shaped like the surface it happened to, not like the thing
        that set it off: lightning into a lake catches everyone in the lake,
        not everyone in the bolt.
      */
      jolts.push({
        ...standing,
        id: `${standing.id}-jolt${seq++}`,
        label: `${standing.label} (${reaction.verb})`,
        rounds: undefined,
        effect: {
          damage: { dice: reaction.jolt.dice, type: reaction.jolt.type },
          ...(reaction.jolt.dc
            ? { save: { ability: 'dex' as const, dc: reaction.jolt.dc, half: true } }
            : {}),
        },
      });
    }

    if (reaction.consumes) continue;

    if (reaction.becomes) {
      const preset = ZONE_PRESETS.find((p) => p.id === reaction.becomes);
      if (preset) {
        // The ground keeps its shape and its place; only what it is made of
        // changes. A burning slick is exactly where the grease was.
        out.push({
          ...standing,
          label: preset.label,
          rounds: preset.rounds,
          effect: preset.effect,
        });
        continue;
      }
    }

    out.push(standing);
  }

  out.push(incoming);
  return { zones: out, log, jolts };
}
