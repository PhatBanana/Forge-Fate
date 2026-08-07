import type { Combatant, EncounterState, Square } from './encounter';
import type { Ability } from './types';

/**
 * Areas of effect that persist on the map.
 *
 * The problem these solve is memory, not geometry: a wall of fire stays where
 * it was cast for a minute of rounds, everyone moves three times, and by round
 * four the table is arguing about where the wall was. A zone is that fact,
 * drawn - it lives on the encounter beside the tokens, survives a refresh,
 * counts its own rounds down and names who is standing in it.
 *
 * ## Shapes, as the SRD measures them
 *
 * - **Sphere**: every square within the radius, distance measured the way this
 *   app measures everything - a diagonal is five feet - so a 20 ft radius is a
 *   square-ish blob nine across, which is what it looks like on every table's
 *   grid.
 * - **Cube**: the stated edge, so a 15 ft cube is 3×3 squares with its corner
 *   at the origin.
 * - **Cone**: as long as it is wide, the SRD's own proportion; a square is in
 *   if its centre is within the length and within the spread either side of
 *   the aim line.
 * - **Line**: one square wide along the aim line for the stated length.
 *
 * ## What a zone does
 *
 * Since section 23, a zone can carry an *effect* - the part of the spell the
 * battlefield itself enforces. A wall of fire burns whoever walks through it
 * or ends a turn inside; a wall of force lets nobody through at all; a web
 * is difficult ground. The effect is data, so "wall of fire" versus "wall of
 * force" versus "blade barrier" is the same machinery with different fields -
 * change the shape and the dice and it is a different spell. Anything richer
 * (a web that restrains, a darkness that blinds) stays the DM's narration:
 * the log says who is in what, and the table rules the rest.
 */

export type ZoneShape = 'sphere' | 'cube' | 'cone' | 'line';

/** The battlefield-enforced part of what a zone does. All optional - a zone
    with no effect is the old kind, drawn and counted and nothing more. */
export interface ZoneEffect {
  /** Damage to whoever it bites: "5d8" fire and the like. */
  damage?: { dice: string; type: string };
  /** The save against that damage; `half` is "half on a success". */
  save?: { ability: Ability; dc: number; half: boolean };
  /** Bites on walking into any of its squares (once per zone per move). */
  onEnter?: boolean;
  /** Bites on ending your turn in it. */
  onEndTurn?: boolean;
  /** Wall of Force: nothing walks through. */
  blocks?: boolean;
  /** Web, grease: its ground costs double to cross. */
  difficult?: boolean;
}

export interface Zone {
  id: string;
  /** "Wall of fire", "Web" - whatever the DM calls it out loud. */
  label: string;
  shape: ZoneShape;
  at: Square;
  /** Radius for a sphere, edge for a cube, length for a cone or line. */
  feet: number;
  /** Radians, 0 pointing east, for the shapes that aim. */
  angle: number;
  /** Rounds left; absent means until somebody removes it. */
  rounds?: number;
  /** An index into the zone palette, so two spells read apart at a glance. */
  tint: number;
  effect?: ZoneEffect;
}

/**
 * The hazard shelf: the SRD's standing areas, ready to place. Each is the
 * ordinary casting (a sphere entry's feet are its radius); the DM can still
 * change shape, size or label after picking one, because a preset is a
 * starting point, not a cage. DCs are the spell's ordinary save DC left to
 * the caster - the form's DC field fills `save.dc`.
 */
export const ZONE_PRESETS: {
  id: string;
  label: string;
  shape: ZoneShape;
  feet: number;
  rounds?: number;
  effect?: ZoneEffect;
}[] = [
  { id: 'custom', label: 'Custom area', shape: 'sphere', feet: 20 },
  {
    id: 'wall-of-fire',
    label: 'Wall of Fire',
    shape: 'line',
    feet: 60,
    rounds: 10,
    effect: {
      damage: { dice: '5d8', type: 'fire' },
      save: { ability: 'dex', dc: 15, half: true },
      onEnter: true,
      onEndTurn: true,
    },
  },
  {
    id: 'wall-of-force',
    label: 'Wall of Force',
    shape: 'line',
    feet: 100,
    rounds: 100,
    effect: { blocks: true },
  },
  {
    id: 'blade-barrier',
    label: 'Blade Barrier',
    shape: 'line',
    feet: 100,
    rounds: 100,
    effect: {
      damage: { dice: '6d10', type: 'slashing' },
      save: { ability: 'dex', dc: 16, half: true },
      onEnter: true,
      onEndTurn: true,
    },
  },
  {
    id: 'cloudkill',
    label: 'Cloudkill',
    shape: 'sphere',
    feet: 20,
    rounds: 100,
    effect: {
      damage: { dice: '5d8', type: 'poison' },
      save: { ability: 'con', dc: 15, half: true },
      onEnter: true,
      onEndTurn: true,
    },
  },
  {
    id: 'moonbeam',
    label: 'Moonbeam',
    shape: 'sphere',
    feet: 5,
    rounds: 10,
    effect: {
      damage: { dice: '2d10', type: 'radiant' },
      save: { ability: 'con', dc: 14, half: true },
      onEnter: true,
      onEndTurn: true,
    },
  },
  {
    id: 'spike-growth',
    label: 'Spike Growth',
    shape: 'sphere',
    feet: 20,
    rounds: 100,
    effect: {
      damage: { dice: '2d4', type: 'piercing' },
      onEnter: true,
      difficult: true,
    },
  },
  {
    id: 'web',
    label: 'Web',
    shape: 'cube',
    feet: 20,
    rounds: 10,
    effect: { difficult: true },
  },
  {
    id: 'grease',
    label: 'Grease',
    shape: 'cube',
    feet: 10,
    rounds: 10,
    effect: { difficult: true },
  },
];

export const ZONE_SHAPES: { shape: ZoneShape; label: string; sizes: number[]; aimed: boolean }[] = [
  { shape: 'sphere', label: 'Sphere', sizes: [5, 10, 15, 20, 30, 40], aimed: false },
  { shape: 'cube', label: 'Cube', sizes: [5, 10, 15, 20, 30], aimed: false },
  { shape: 'cone', label: 'Cone', sizes: [15, 30, 60], aimed: true },
  { shape: 'line', label: 'Line', sizes: [30, 60, 100], aimed: true },
];

/** The squares a zone covers. Pure, so the map and "who is inside" agree. */
export function zoneSquares(zone: Zone): Square[] {
  const squares: Square[] = [];
  const radius = Math.floor(zone.feet / 5);

  if (zone.shape === 'sphere') {
    for (let x = zone.at.x - radius; x <= zone.at.x + radius; x++) {
      for (let y = zone.at.y - radius; y <= zone.at.y + radius; y++) {
        // Chebyshev, the app's one distance rule: a diagonal is five feet.
        if (Math.max(Math.abs(x - zone.at.x), Math.abs(y - zone.at.y)) <= radius) {
          squares.push({ x, y });
        }
      }
    }
    return squares;
  }

  if (zone.shape === 'cube') {
    const edge = Math.max(1, radius);
    for (let x = zone.at.x; x < zone.at.x + edge; x++) {
      for (let y = zone.at.y; y < zone.at.y + edge; y++) squares.push({ x, y });
    }
    return squares;
  }

  // The aimed shapes: walk a bounding box and test each centre against the ray.
  const dir = { x: Math.cos(zone.angle), y: Math.sin(zone.angle) };
  for (let x = zone.at.x - radius; x <= zone.at.x + radius; x++) {
    for (let y = zone.at.y - radius; y <= zone.at.y + radius; y++) {
      const dx = x - zone.at.x;
      const dy = y - zone.at.y;
      const along = dx * dir.x + dy * dir.y;
      if (along < 0 || along > radius) continue;
      const across = Math.abs(dx * -dir.y + dy * dir.x);
      if (zone.shape === 'cone') {
        // As wide as it is long: half a square of spread per square out, plus
        // enough slack that the origin square itself is in.
        if (across <= along * 0.5 + 0.01) squares.push({ x, y });
      } else {
        // A line is one square wide.
        if (across <= 0.5) squares.push({ x, y });
      }
    }
  }
  return squares;
}

export const inZone = (zone: Zone, at: Square): boolean =>
  zoneSquares(zone).some((s) => s.x === at.x && s.y === at.y);

/** Every square key of every zone a predicate picks - the map's overlays. */
export function zoneSquareKeys(
  zones: Zone[] | undefined,
  pick: (zone: Zone) => boolean,
): Set<string> {
  const keys = new Set<string>();
  for (const zone of zones ?? []) {
    if (!pick(zone)) continue;
    for (const s of zoneSquares(zone)) keys.add(`${s.x},${s.y}`);
  }
  return keys;
}

/** A zone that damages whoever walks into it. */
export const bitesOnEnter = (zone: Zone): boolean =>
  Boolean(zone.effect?.onEnter && zone.effect.damage);

/** A zone that damages whoever ends a turn inside it. */
export const bitesOnEndTurn = (zone: Zone): boolean =>
  Boolean(zone.effect?.onEndTurn && zone.effect.damage);

/**
 * Which biting zones a walked route enters - each zone once, however many of
 * its squares the route crosses, which is the ordinary once-per-event rule.
 * The route's first square is where the walker already stood, so it is not
 * an entry.
 */
export function hazardsCrossed(zones: Zone[] | undefined, route: Square[]): Zone[] {
  if (!zones?.length || route.length < 2) return [];
  const walked = route.slice(1);
  return zones.filter(
    (zone) => bitesOnEnter(zone) && walked.some((step) => inZone(zone, step)),
  );
}

/** Who is standing in it. The answer to read out at the top of a round. */
export function combatantsIn(zone: Zone, combatants: Combatant[]): Combatant[] {
  return combatants.filter((c) => c.at && inZone(zone, c.at));
}

export function addZone(encounter: EncounterState, zone: Omit<Zone, 'id'>): EncounterState {
  return {
    ...encounter,
    zones: [...(encounter.zones ?? []), { ...zone, id: `z${encounter.nextSeq}` }],
    nextSeq: encounter.nextSeq + 1,
  };
}

export function removeZone(encounter: EncounterState, id: string): EncounterState {
  const zones = (encounter.zones ?? []).filter((z) => z.id !== id);
  return { ...encounter, zones: zones.length ? zones : undefined };
}

/**
 * A round has passed: every counted zone burns one, and the ones that reach
 * nothing are gone. Called when the top of the order comes back around,
 * because "lasts three rounds" is counted in rounds, not turns.
 */
export function tickZones(encounter: EncounterState): EncounterState {
  if (!encounter.zones?.length) return encounter;
  const zones = encounter.zones
    .map((z) => (z.rounds === undefined ? z : { ...z, rounds: z.rounds - 1 }))
    .filter((z) => z.rounds === undefined || z.rounds > 0);
  return { ...encounter, zones: zones.length ? zones : undefined };
}

/** A stored effect, made safe: known fields with the right shapes, or nothing. */
function hydrateEffect(parsed: unknown): ZoneEffect | undefined {
  if (!parsed || typeof parsed !== 'object') return undefined;
  const raw = parsed as Partial<ZoneEffect>;
  const out: ZoneEffect = {};
  if (
    raw.damage &&
    typeof raw.damage === 'object' &&
    typeof raw.damage.dice === 'string' &&
    typeof raw.damage.type === 'string'
  ) {
    out.damage = { dice: raw.damage.dice, type: raw.damage.type };
  }
  if (
    raw.save &&
    typeof raw.save === 'object' &&
    typeof raw.save.ability === 'string' &&
    Number.isFinite(raw.save.dc)
  ) {
    out.save = { ability: raw.save.ability, dc: raw.save.dc, half: Boolean(raw.save.half) };
  }
  if (raw.onEnter) out.onEnter = true;
  if (raw.onEndTurn) out.onEndTurn = true;
  if (raw.blocks) out.blocks = true;
  if (raw.difficult) out.difficult = true;
  return Object.keys(out).length ? out : undefined;
}

/** Stored zones, made safe to render - the start-up discipline. */
export function hydrateZones(parsed: unknown): Zone[] | undefined {
  if (!Array.isArray(parsed)) return undefined;
  const shapes = new Set(ZONE_SHAPES.map((s) => s.shape));
  const zones = parsed
    .filter((z): z is Zone => {
      if (!z || typeof z !== 'object') return false;
      const zone = z as Partial<Zone>;
      return (
        typeof zone.id === 'string' &&
        typeof zone.label === 'string' &&
        typeof zone.shape === 'string' &&
        shapes.has(zone.shape as ZoneShape) &&
        !!zone.at &&
        Number.isFinite(zone.at.x) &&
        Number.isFinite(zone.at.y) &&
        Number.isFinite(zone.feet) &&
        Number.isFinite(zone.angle) &&
        Number.isFinite(zone.tint)
      );
    })
    .map((zone) => ({ ...zone, effect: hydrateEffect(zone.effect) }));
  return zones.length ? zones : undefined;
}
