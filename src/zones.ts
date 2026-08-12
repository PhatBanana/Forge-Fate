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

/**
 * What a patch of ground is made of.
 *
 * Distinct from a zone's label, which is whatever the DM typed: "Wall of
 * Fire", "Flaming Sphere" and a patch of ignited grease are three labels and
 * one material, and it is the material that reacts. `surfaces.ts` holds the
 * table of what happens when one lands on another.
 */
export type SurfaceKind = 'fire' | 'grease' | 'water' | 'ice' | 'web' | 'acid' | 'lightning';

export const SURFACE_KINDS: { kind: SurfaceKind; label: string }[] = [
  { kind: 'fire', label: 'Fire' },
  { kind: 'grease', label: 'Grease' },
  { kind: 'water', label: 'Water' },
  { kind: 'ice', label: 'Ice' },
  { kind: 'web', label: 'Web' },
  { kind: 'acid', label: 'Acid' },
  { kind: 'lightning', label: 'Lightning' },
];

/**
 * Which side a zone's effect reaches. Absent is everyone.
 *
 * "party" and "monsters" rather than "allies" and "enemies" because the map
 * has exactly two sides and naming them after what they are avoids asking
 * whose point of view the word is from.
 */
export type ZoneSide = 'party' | 'monsters';

/**
 * What standing in a zone is worth.
 *
 * Numbers where the app can apply them and a note where it cannot, which is
 * the same division the rest of this app uses: a fog cloud's obscurement is a
 * paragraph of rulings about who can see whom, and belongs in a sentence the
 * DM reads, while a paladin's aura is plainly +3 to saves and belongs in the
 * arithmetic.
 */
export interface ZoneGrant {
  /** Added to the AC of whoever is standing in it. */
  ac?: number;
  /** Added to attack rolls made *from* inside it. */
  toHit?: number;
  /** Added to saving throws made inside it. */
  saves?: number;
  /** Rolled at the end of a turn spent inside it, as healing. */
  heal?: string;
  /** Anything richer, said rather than applied. */
  note?: string;
}

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
  /**
   * Silence: no sound, so no verbal component.
   *
   * §64. The one thing on the battlefield that makes the V in "V, S, M"
   * matter - being unable to speak is otherwise inseparable from being
   * unable to act at all, since every condition that stops speech also
   * stops the action. A creature standing in here can still swing a sword
   * and still cast Counterspell, which is somatic only; it just cannot say
   * the words.
   */
  silences?: boolean;
  /** Web, grease: its ground costs double to cross. */
  difficult?: boolean;
  /**
   * Who this zone's effect reaches.
   *
   * Absent means everyone, which is right for a wall of fire - fire does not
   * check sides. Spirit Guardians does: it burns your enemies and leaves your
   * cleric alone, and until this field existed the app could not express that
   * at all, so the spell was either wrong or absent. It gates the damage, the
   * difficult ground and the grants alike, because a spell that helps one side
   * usually hinders the other by the same token.
   */
  affects?: ZoneSide;
  /**
   * What standing in it is worth, for the zones that help rather than hurt.
   *
   * The whole zone model has been able to say "this ground hurts" since 23.1
   * and nothing else, which left every beneficial area - a paladin's aura, a
   * fog cloud somebody is hiding in - as a drawing with a label. This is the
   * other sign.
   */
  grants?: ZoneGrant;
  /**
   * What the ground is made of, when it is made of anything.
   *
   * Separate from `label`, which is whatever the DM typed: "Wall of Fire",
   * "Flaming Sphere" and a patch of ignited grease are three labels and one
   * material. Section 26 reacts on the material - fire finds the grease,
   * lightning finds the water - and `surfaces.ts` holds the table. Absent
   * means the zone is not a surface and nothing reacts to it, which is right
   * for a wall of force and for spike growth.
   */
  surface?: SurfaceKind;
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
      surface: 'fire',
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
    effect: { difficult: true, surface: 'web' },
  },
  {
    id: 'grease',
    label: 'Grease',
    shape: 'cube',
    feet: 10,
    rounds: 10,
    effect: { difficult: true, surface: 'grease' },
  },
  /*
    The three below are ground rather than spells - what a spell leaves
    behind, and what section 26 turns one into another. Water is what an ice
    storm melts to and what a lightning bolt makes lethal; ice is difficult
    and slick; burning ground is what grease becomes when fire finds it,
    which is the reaction everyone reaches for first.
  */
  {
    id: 'spirit-guardians',
    label: 'Spirit Guardians',
    shape: 'sphere',
    feet: 15,
    rounds: 100,
    effect: {
      damage: { dice: '3d8', type: 'radiant' },
      save: { ability: 'wis', dc: 15, half: true },
      onEnter: true,
      onEndTurn: true,
      difficult: true,
      // The spell's whole shape: it burns what is coming for you and lets
      // your own side walk through it. Before `affects` the app could only
      // have this spell wrong.
      affects: 'monsters',
    },
  },
  {
    id: 'aura-of-protection',
    label: 'Aura of Protection',
    shape: 'sphere',
    feet: 10,
    effect: {
      // The paladin's Charisma, typed in as the DC field the form already
      // has; a level 6 paladin is usually +3 and often more later.
      grants: { saves: 3 },
      affects: 'party',
    },
  },
  {
    id: 'silence',
    label: 'Silence',
    shape: 'sphere',
    feet: 20,
    rounds: 100,
    effect: {
      silences: true,
      grants: {
        note: 'No sound: nobody inside can cast a spell with a verbal component, and everyone inside is deafened.',
      },
    },
  },
  {
    id: 'fog-cloud',
    label: 'Fog Cloud',
    shape: 'sphere',
    feet: 20,
    rounds: 100,
    effect: {
      grants: {
        note: 'Heavily obscured — anyone inside is effectively blinded, so attacks in or out are made blind.',
      },
    },
  },
  {
    id: 'water',
    label: 'Water',
    shape: 'sphere',
    feet: 15,
    rounds: 10,
    effect: { surface: 'water' },
  },
  {
    id: 'ice',
    label: 'Ice',
    shape: 'sphere',
    feet: 15,
    rounds: 10,
    effect: { difficult: true, surface: 'ice' },
  },
  {
    id: 'burning-ground',
    label: 'Burning ground',
    shape: 'sphere',
    feet: 10,
    rounds: 3,
    effect: {
      damage: { dice: '1d6', type: 'fire' },
      save: { ability: 'dex', dc: 10, half: true },
      onEnter: true,
      onEndTurn: true,
      surface: 'fire',
    },
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

/**
 * Whether a zone's effect reaches a given side.
 *
 * The default is everyone, because that is what fire does. A zone that names
 * a side reaches only that side - which gates its damage, its difficult
 * ground and its grants together, since a spell that helps one side usually
 * hinders the other by the same token.
 */
export const zoneReaches = (zone: Zone, side: ZoneSide): boolean =>
  zone.effect?.affects === undefined || zone.effect.affects === side;

/** Which side a combatant is on, in the terms a zone is written in. */
export const sideOf = (kind: 'character' | 'monster'): ZoneSide =>
  kind === 'character' ? 'party' : 'monsters';

/** A zone that damages whoever walks into it. */
export const bitesOnEnter = (zone: Zone): boolean =>
  Boolean(zone.effect?.onEnter && zone.effect.damage);

/** A zone that damages whoever ends a turn inside it. */
export const bitesOnEndTurn = (zone: Zone): boolean =>
  Boolean(zone.effect?.onEndTurn && zone.effect.damage);

/**
 * Everything the ground under somebody is worth, added up.
 *
 * Two auras overlapping stack, which is a ruling this makes on purpose: the
 * SRD's non-stacking rule is about the *same* spell cast twice, and two
 * different beneficial areas are two different effects. A table that
 * disagrees can move a token five feet, which is the whole point of a map.
 */
export function grantsUnder(
  zones: Zone[] | undefined,
  at: Square | undefined,
  side: ZoneSide,
): Required<Pick<ZoneGrant, 'ac' | 'toHit' | 'saves'>> & { notes: string[]; heals: string[] } {
  const out = { ac: 0, toHit: 0, saves: 0, notes: [] as string[], heals: [] as string[] };
  if (!at) return out;
  for (const zone of zones ?? []) {
    const grant = zone.effect?.grants;
    if (!grant || !zoneReaches(zone, side) || !inZone(zone, at)) continue;
    out.ac += grant.ac ?? 0;
    out.toHit += grant.toHit ?? 0;
    out.saves += grant.saves ?? 0;
    if (grant.note) out.notes.push(`${zone.label}: ${grant.note}`);
    if (grant.heal) out.heals.push(grant.heal);
  }
  return out;
}

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
  if (raw.affects === 'party' || raw.affects === 'monsters') out.affects = raw.affects;
  if (raw.grants && typeof raw.grants === 'object') {
    const g = raw.grants as Partial<ZoneGrant>;
    const grant: ZoneGrant = {};
    // Field by field and finite-checked: a stored NaN would poison every AC
    // it touched, and silently.
    if (Number.isFinite(g.ac)) grant.ac = g.ac;
    if (Number.isFinite(g.toHit)) grant.toHit = g.toHit;
    if (Number.isFinite(g.saves)) grant.saves = g.saves;
    if (typeof g.heal === 'string') grant.heal = g.heal;
    if (typeof g.note === 'string') grant.note = g.note;
    if (Object.keys(grant).length) out.grants = grant;
  }
  // Checked against the list rather than taken on trust: a saved surface of
  // "banana" would otherwise reach the reaction table as a material.
  if (typeof raw.surface === 'string' && SURFACE_KINDS.some((s) => s.kind === raw.surface)) {
    out.surface = raw.surface as SurfaceKind;
  }
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
