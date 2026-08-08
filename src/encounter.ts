import { defaultRng, parseNotation, rollD20, rollNotation } from './engine/dice';
import type { Rng } from './engine/dice';
import type { Monster } from './data/monsters';
import { initiativeMod } from './data/monsters';

/**
 * A fight, in turn order.
 *
 * This is the DM's side of the same line `play.ts` draws: it describes an
 * afternoon rather than a character, it is persisted so a refresh mid-fight
 * loses nothing, and it stays off the undo stack because rolling initiative is
 * not an edit to anybody.
 *
 * ## Two kinds of combatant, and only one of them owns its hit points
 *
 * A player character in the tracker is a **reference**, not a copy: the
 * combatant holds their roster id and nothing else, and every read and write
 * goes through the `PlayState` their own sheet already uses. Damage dealt here
 * *is* damage on their sheet, in the same tick, because there is only one copy
 * of the number. The alternative - a hit point total in the encounter that has
 * to be pushed back afterwards - is two sources of truth and a bug waiting for
 * the moment somebody edits one of them.
 *
 * A monster has no sheet, so its instance owns its hit points, its conditions
 * and its notes. Three goblins are three instances with one `monsterId`
 * between them, which is what lets Goblin B die while A and C fight on.
 *
 * ## What is stored
 *
 * Ids and numbers. A monster instance keeps the SRD index, never the stat
 * block, so a saved encounter is a few hundred bytes rather than 60 kB. That
 * was first done against a five megabyte `localStorage` budget; the store has
 * since moved to IndexedDB and the reason survived the move, because a stat
 * block copied into a save is a stat block that goes stale the moment the
 * bestiary is corrected. The block is resolved at render time instead.
 */

/**
 * Where a combatant is standing, in grid squares. Absent until somebody puts
 * them somewhere - a fight run in the head rather than on a map is the normal
 * case, and a token that appeared at 0,0 by default would be a lie about it.
 */
export interface Square {
  x: number;
  y: number;
}

export interface CharacterCombatant {
  kind: 'character';
  id: string;
  /** The roster entry. Their hit points live in its `PlayState`. */
  rosterId: string;
  initiative: number;
  /** Kept so ties break the same way on every render. See `sortCombatants`. */
  tieBreak: number;
  at?: Square;
  /** Hiding, and the Stealth total that hides them. A battlefield fact, so
      it lives on the combatant rather than the sheet. */
  hidden?: number;
}

export interface MonsterCombatant {
  kind: 'monster';
  id: string;
  monsterId: string;
  /** "Goblin B" - what the DM says out loud. */
  label: string;
  hp: number;
  maxHp: number;
  initiative: number;
  tieBreak: number;
  /** Condition ids from `data/conditions.ts`. */
  conditions: string[];
  /** Rounds left per condition; absent means until removed. Same clock as zones. */
  conditionTimers?: Record<string, number>;
  /**
   * Who caused a condition, by combatant id, for the ones that turn on it.
   *
   * Frightened is the reason this exists. It costs advantage and forbids
   * approach *only while the source of the fear is in sight*, so a rule this
   * app could not apply was simply skipped - the honest choice at the time and
   * a poor ceiling. Charmed carries a source too and can use the same field.
   *
   * Sparse on purpose: most conditions have nobody to blame.
   */
  conditionSources?: Record<string, string>;
  /** Anything the stat block does not say: "bloodied", "up the stairs". */
  note?: string;
  at?: Square;
  /**
   * Limited abilities, spent against the stat block's own counts. `usesSpent`
   * counts the "3/Day"s by ability name; `recharge` marks a recharge ability
   * spent (absent means available - a fresh monster has everything). On the
   * *instance*, because Goblin A's breath being spent says nothing about
   * Goblin B's.
   */
  usesSpent?: Record<string, number>;
  recharge?: Record<string, boolean>;
  /** Legendary actions spent since its last turn. Reset when its turn begins. */
  legendarySpent?: number;
  /** Feet of movement spent this turn. Reset when its turn begins. */
  moved?: number;
  /**
   * Its one reaction, spent. The monster side of the table had legendary
   * actions, recharges and movement and no reaction at all until §28 made
   * opportunity attacks real - which is the moment a goblin's reaction became
   * a resource somebody could run out of.
   *
   * Reset when its turn begins, with the movement, because that is when a
   * reaction comes back. Getting this wrong in the other direction - clearing
   * it at the *end* of the turn - is the mistake tables make most often.
   */
  reactionSpent?: boolean;
  /**
   * Disengage or Dodge, taken. Same per-turn life as the movement above, and
   * the same reset. Monsters take the same actions characters do, and the
   * monster tray has offered Disengage since §13.1 while nothing read it.
   */
  stance?: 'disengage' | 'dodge';
  /**
   * Not yet part of the fight: skipped in the turn order, woken when the
   * party first sees it or when it takes damage - the squad-game pod,
   * translated. Meaningful mostly under fog of war.
   */
  dormant?: boolean;
  /** Hiding, and the Stealth total that hides them. Cleared by attacking,
      by being spotted, or by hand. */
  hidden?: number;
}

export type Combatant = CharacterCombatant | MonsterCombatant;

export interface EncounterState {
  combatants: Combatant[];
  /**
   * Whose turn it is, as an index into the sorted order. -1 before the fight
   * starts, so "add three more goblins" does not read as a turn passing.
   */
  turnIndex: number;
  /** 0 before the fight starts; the first `nextTurn` makes it 1. */
  round: number;
  /** Monotonic, so a name and a tie-break are never reused within a fight. */
  nextSeq: number;
  /**
   * The map's seed, when there is a map.
   *
   * Here rather than in component state, and the reason is the tokens. A
   * combatant's square is stored on the fight, so a seed that lived in the
   * Table tab would be regenerated the moment somebody looked at a character
   * sheet and came back - leaving everyone standing where the *old* map's
   * rooms were. Eight characters is a cheap thing to keep and the map is part
   * of the session, which is exactly what this object is.
   */
  mapSeed?: string;
  /**
   * Map shape, stored beside the seed for the same reason the seed is stored:
   * the dungeon is `generate(seed, size, rooms)`, and any input left in
   * component state regenerates a *different* map on reload while the tokens
   * stay where the old one's rooms were. The room count had exactly that bug
   * until these moved here. Zero rooms is a blank grid to build on.
   */
  mapSize?: 'small' | 'medium' | 'large';
  mapRooms?: number;
  /**
   * What the DM painted onto the map - pillars, trees, water, hand-carved
   * floor - keyed by square. On the fight for the same reason the tokens are:
   * the dungeon regenerates from its seed, but a fallen pillar is a fact about
   * this session and has to survive a refresh. See `terrain.ts`.
   */
  terrain?: import('./terrain').TerrainMap;
  /**
   * Z, per square, in steps - a ledge is +1, a pit is -1. Its own layer
   * because height is orthogonal to what stands on the square. See
   * `terrain.ts`.
   */
  elevation?: import('./terrain').ElevationMap;
  /**
   * Areas of effect standing on the map - a wall of fire, a cloudkill - with
   * their own round counts. See `zones.ts`.
   */
  zones?: import('./zones').Zone[];
  /**
   * The last thirty things that happened, newest first, in sentences.
   *
   * A character's rolls land in their own sheet's log; a monster has no sheet,
   * and an attack resolved against a target belongs to the *fight* rather than
   * to either side of it. Capped so a long session cannot grow the save
   * without bound.
   */
  log?: { id: number; text: string }[];
  /** The debrief's score: damage dealt and taken, kills and knockdowns, per
      combatant id. Cleared when a fight starts; read when it ends. */
  tally?: Record<string, TallyEntry>;
  /** Fog of war: the map shows only what the party can see or has seen. */
  fog?: boolean;
  /** Squares the party has laid eyes on, by key - the fog's memory. On the
      encounter because what has been explored is a fact about the session. */
  explored?: string[];
  /** How many rounds the last fight ran, stamped by `endEncounter` - the
      round counter itself resets to 0. */
  endedAfter?: number;
}

export function emptyEncounter(): EncounterState {
  return { combatants: [], turnIndex: -1, round: 0, nextSeq: 0 };
}

export const isRunning = (encounter: EncounterState) => encounter.round > 0;

// ------------------------------------------------------------------ ordering

/**
 * Turn order: initiative high to low, ties broken by the tie-break each
 * combatant carries.
 *
 * The tie-break is decided **once, when initiative is rolled**, and stored.
 * Deciding it at sort time - by Dexterity looked up from a stat block, or
 * worse by `Math.random` - would reorder the list on some later render for
 * reasons nobody could see, in the middle of a fight, which is the one place
 * an order has to hold still. Storing it also means the DM can drag two
 * combatants apart and have it stay.
 */
export function sortCombatants(combatants: Combatant[]): Combatant[] {
  return [...combatants].sort(
    (a, b) => b.initiative - a.initiative || b.tieBreak - a.tieBreak,
  );
}

/** Whose turn it is, or null before the fight starts. */
export function currentCombatant(encounter: EncounterState): Combatant | null {
  if (!isRunning(encounter)) return null;
  return sortCombatants(encounter.combatants)[encounter.turnIndex] ?? null;
}

// --------------------------------------------------------------- the roster

/**
 * A name that says which one. The first of a kind keeps its plain name; a
 * second arrival makes both lettered, because "Goblin" and "Goblin B" reads as
 * two different things and one of them wrong.
 */
export function labelFor(existing: Combatant[], monster: Monster): {
  label: string;
  renames: { id: string; label: string }[];
} {
  const kin = existing.filter(
    (c): c is MonsterCombatant => c.kind === 'monster' && c.monsterId === monster.id,
  );
  if (!kin.length) return { label: monster.name, renames: [] };

  const letter = (n: number) => String.fromCharCode(65 + n);
  const renames =
    kin.length === 1 && kin[0].label === monster.name
      ? [{ id: kin[0].id, label: `${monster.name} A` }]
      : [];
  return { label: `${monster.name} ${letter(kin.length)}`, renames };
}

/**
 * Hit points for a new monster: the average printed on the stat block, or
 * rolled from `hpRoll`.
 *
 * Both are how tables play it, so both are offered rather than one being
 * chosen for everybody - and a rolled goblin with 3 hit points is a different
 * fight from a rolled goblin with 11.
 */
export function monsterHp(monster: Monster, roll: boolean, rng: Rng = defaultRng): number {
  if (!roll || !monster.hpRoll) return monster.hp;
  const notation = parseNotation(monster.hpRoll);
  if (!notation) return monster.hp;
  // A creature is never dropped to nothing by its own hit dice.
  return Math.max(1, rollNotation(notation, rng).total);
}

export function addMonster(
  encounter: EncounterState,
  monster: Monster,
  options: { rollHp?: boolean; rng?: Rng } = {},
): EncounterState {
  const rng = options.rng ?? defaultRng;
  const { label, renames } = labelFor(encounter.combatants, monster);
  const hp = monsterHp(monster, options.rollHp ?? false, rng);

  const combatant: MonsterCombatant = {
    kind: 'monster',
    id: `m${encounter.nextSeq}`,
    monsterId: monster.id,
    label,
    hp,
    maxHp: hp,
    // Rolled straight away, so a monster added mid-fight has a place in the
    // order rather than sitting at zero until somebody notices.
    initiative: rollD20(initiativeMod(monster), 'normal', rng).total,
    tieBreak: monster.scores.dex,
    conditions: [],
  };

  return {
    ...encounter,
    combatants: [
      ...encounter.combatants.map((c) => {
        const rename = renames.find((r) => r.id === c.id);
        return rename && c.kind === 'monster' ? { ...c, label: rename.label } : c;
      }),
      combatant,
    ],
    nextSeq: encounter.nextSeq + 1,
  };
}

/** A character joins by reference. Adding one twice is a no-op, not a clone. */
export function addCharacter(
  encounter: EncounterState,
  rosterId: string,
  options: { initiative?: number; dex?: number } = {},
): EncounterState {
  if (encounter.combatants.some((c) => c.kind === 'character' && c.rosterId === rosterId)) {
    return encounter;
  }
  const combatant: CharacterCombatant = {
    kind: 'character',
    id: `c${encounter.nextSeq}`,
    rosterId,
    // Zero rather than a roll: a player rolls their own initiative, and the
    // tracker taking that away is the one thing a table would notice.
    initiative: options.initiative ?? 0,
    tieBreak: options.dex ?? 0,
  };
  return {
    ...encounter,
    combatants: [...encounter.combatants, combatant],
    nextSeq: encounter.nextSeq + 1,
  };
}

export function removeCombatant(encounter: EncounterState, id: string): EncounterState {
  const order = sortCombatants(encounter.combatants);
  const going = order.findIndex((c) => c.id === id);
  if (going === -1) return encounter;

  const combatants = encounter.combatants.filter((c) => c.id !== id);
  if (!combatants.length) return { ...emptyEncounter(), nextSeq: encounter.nextSeq };

  /*
    Keep the pointer on the same combatant.

    Removing somebody earlier in the order shifts everyone after them down one,
    so an untouched `turnIndex` would silently skip whoever is up. Removing the
    one whose turn it is leaves the index where it is, which now points at the
    next combatant - which is what "they are gone, carry on" means.
  */
  const turnIndex = !isRunning(encounter)
    ? -1
    : going < encounter.turnIndex
      ? encounter.turnIndex - 1
      : Math.min(encounter.turnIndex, combatants.length - 1);

  return { ...encounter, combatants, turnIndex };
}

export function setInitiative(
  encounter: EncounterState,
  id: string,
  initiative: number,
): EncounterState {
  return {
    ...encounter,
    combatants: encounter.combatants.map((c) =>
      c.id === id ? { ...c, initiative: Math.round(initiative) } : c,
    ),
  };
}

// ------------------------------------------------------------- on the map

/**
 * Distance between two squares, in feet.
 *
 * A diagonal counts as five feet, the same as a straight step - that is the
 * ordinary rule, and the reason a battle grid measures in squares at all. The
 * alternative that alternates 5 and 10 is an optional variant, and picking it
 * for everybody would quietly change how far a Rogue can get.
 *
 * So it is Chebyshev distance, not Pythagoras: the longer of the two axes.
 * Moving three squares across and two down is fifteen feet, not twenty-five and
 * not eighteen.
 */
export function distanceBetween(a: Square, b: Square): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) * 5;
}

/** Put a combatant on the map, or move them without measuring it. */
export function placeCombatant(
  encounter: EncounterState,
  id: string,
  at: Square | undefined,
): EncounterState {
  return {
    ...encounter,
    combatants: encounter.combatants.map((c) => (c.id === id ? { ...c, at } : c)),
  };
}

/**
 * Move a combatant, reporting how far in feet.
 *
 * The distance comes back rather than being applied here, because what it costs
 * depends on whose it is: a character's movement lives in their own
 * `PlayState`, which this module deliberately does not reach into. The caller
 * charges it; this measures it.
 */
export function moveCombatantTo(
  encounter: EncounterState,
  id: string,
  to: Square,
): { encounter: EncounterState; feet: number } {
  const combatant = encounter.combatants.find((c) => c.id === id);
  const feet = combatant?.at ? distanceBetween(combatant.at, to) : 0;
  return { encounter: placeCombatant(encounter, id, to), feet };
}

// -------------------------------------------------------------- monster state

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/** Damage or heal a monster. Negative heals, matching `play.ts`'s vocabulary. */
export function damageMonster(
  encounter: EncounterState,
  id: string,
  amount: number,
): EncounterState {
  return {
    ...encounter,
    combatants: encounter.combatants.map((c) =>
      c.id === id && c.kind === 'monster'
        ? { ...c, hp: clamp(c.hp - amount, 0, c.maxHp) }
        : c,
    ),
  };
}

/**
 * Set a monster's hit points directly, raising its maximum if the DM types a
 * larger number - which is how a DM makes this goblin the tough one, and is
 * most of what "adjust the stat block at the table" means in practice.
 */
export function setMonsterHp(
  encounter: EncounterState,
  id: string,
  hp: number,
): EncounterState {
  const value = Math.max(0, Math.round(hp));
  return {
    ...encounter,
    combatants: encounter.combatants.map((c) =>
      c.id === id && c.kind === 'monster'
        ? { ...c, hp: value, maxHp: Math.max(c.maxHp, value) }
        : c,
    ),
  };
}

export function toggleMonsterCondition(
  encounter: EncounterState,
  id: string,
  conditionId: string,
): EncounterState {
  return {
    ...encounter,
    combatants: encounter.combatants.map((c) =>
      c.id === id && c.kind === 'monster'
        ? {
            ...c,
            conditions: c.conditions.includes(conditionId)
              ? c.conditions.filter((x) => x !== conditionId)
              : [...c.conditions, conditionId],
          }
        : c,
    ),
  };
}

export function setMonsterNote(
  encounter: EncounterState,
  id: string,
  note: string,
): EncounterState {
  return {
    ...encounter,
    combatants: encounter.combatants.map((c) =>
      c.id === id && c.kind === 'monster' ? { ...c, note: note || undefined } : c,
    ),
  };
}

// ------------------------------------------------------- limited abilities

/** Spend one use of a per-day ability, by the name on the stat block. */
export function spendMonsterUse(
  encounter: EncounterState,
  id: string,
  ability: string,
): EncounterState {
  return {
    ...encounter,
    combatants: encounter.combatants.map((c) =>
      c.id === id && c.kind === 'monster'
        ? { ...c, usesSpent: { ...c.usesSpent, [ability]: (c.usesSpent?.[ability] ?? 0) + 1 } }
        : c,
    ),
  };
}

export const usesLeft = (
  combatant: MonsterCombatant,
  ability: string,
  times: number,
): number => Math.max(0, times - (combatant.usesSpent?.[ability] ?? 0));

/** Mark a recharge ability spent, or recharged. Absent means available. */
export function setMonsterRecharge(
  encounter: EncounterState,
  id: string,
  ability: string,
  available: boolean,
): EncounterState {
  return {
    ...encounter,
    combatants: encounter.combatants.map((c) =>
      c.id === id && c.kind === 'monster'
        ? { ...c, recharge: { ...c.recharge, [ability]: available } }
        : c,
    ),
  };
}

export const rechargeReady = (combatant: MonsterCombatant, ability: string): boolean =>
  combatant.recharge?.[ability] !== false;

/** Spend legendary actions - between other creatures' turns, per the rule. */
export function spendLegendary(
  encounter: EncounterState,
  id: string,
  cost: number,
): EncounterState {
  return {
    ...encounter,
    combatants: encounter.combatants.map((c) =>
      c.id === id && c.kind === 'monster'
        ? { ...c, legendarySpent: (c.legendarySpent ?? 0) + cost }
        : c,
    ),
  };
}

/**
 * The running score for the debrief: what each combatant dealt and took,
 * who they dropped, how often they went down. Written wherever damage
 * already lands, cleared when a fight starts, read back when it ends -
 * X-COM's post-mission report, tallied as it happens rather than
 * reconstructed from prose.
 */
export interface TallyEntry {
  dealt: number;
  taken: number;
  kills: number;
  drops: number;
}

const tallyOf = (encounter: EncounterState, id: string): TallyEntry =>
  encounter.tally?.[id] ?? { dealt: 0, taken: 0, kills: 0, drops: 0 };

/**
 * Damage happened: `to` took `amount`, dealt by `by` when somebody owns it
 * (a saving-throw zone has no single hand behind it). `downed` marks the
 * blow that dropped them - the dealer's kill, the target's knockdown.
 */
export function recordDamage(
  encounter: EncounterState,
  hit: { by?: string; to: string; amount: number; downed?: boolean },
): EncounterState {
  if (hit.amount <= 0) return encounter;
  const tally = { ...encounter.tally };
  const target = tallyOf(encounter, hit.to);
  tally[hit.to] = {
    ...target,
    taken: target.taken + hit.amount,
    drops: target.drops + (hit.downed ? 1 : 0),
  };
  if (hit.by && hit.by !== hit.to) {
    const dealer = tallyOf({ ...encounter, tally }, hit.by);
    tally[hit.by] = {
      ...dealer,
      dealt: dealer.dealt + hit.amount,
      kills: dealer.kills + (hit.downed ? 1 : 0),
    };
  }
  return { ...encounter, tally };
}

/**
 * Charge a monster for feet walked. Movement is a per-turn resource on the
 * monster's side of the table too - the reset lives in `nextTurn`, next to
 * the legendary-action clock, because that is the thing that knows a turn
 * began.
 */
export function spendMonsterMovement(
  encounter: EncounterState,
  id: string,
  feet: number,
): EncounterState {
  if (feet <= 0) return encounter;
  return {
    ...encounter,
    combatants: encounter.combatants.map((c) =>
      c.id === id && c.kind === 'monster'
        ? { ...c, moved: (c.moved ?? 0) + feet }
        : c,
    ),
  };
}

/**
 * Mark a monster's reaction spent, or hand it back.
 *
 * Separate from `spendMonsterMovement` despite the family resemblance, because
 * a reaction is spent on somebody *else's* turn - it is the one resource in
 * the fight that leaves while the creature is not acting.
 */
export function spendMonsterReaction(
  encounter: EncounterState,
  id: string,
  spent = true,
): EncounterState {
  return {
    ...encounter,
    combatants: encounter.combatants.map((c) =>
      c.id === id && c.kind === 'monster' ? { ...c, reactionSpent: spent || undefined } : c,
    ),
  };
}

/** Take the Disengage or the Dodge, on the monster's side of the table. */
export function setMonsterStance(
  encounter: EncounterState,
  id: string,
  stance: 'disengage' | 'dodge' | undefined,
): EncounterState {
  return {
    ...encounter,
    combatants: encounter.combatants.map((c) =>
      c.id === id && c.kind === 'monster' ? { ...c, stance } : c,
    ),
  };
}

/** Wake a monster into the fight, or stand it down. Monsters only - a
    character is always in the fight. */
export function setDormant(encounter: EncounterState, id: string, dormant: boolean): EncounterState {
  return {
    ...encounter,
    combatants: encounter.combatants.map((c) =>
      c.id === id && c.kind === 'monster' ? { ...c, dormant: dormant || undefined } : c,
    ),
  };
}

/** Mark somebody hiding with the Stealth total that hides them, or reveal
    them (undefined). Either side of the table hides the same way. */
export function setHidden(
  encounter: EncounterState,
  id: string,
  roll: number | undefined,
): EncounterState {
  return {
    ...encounter,
    combatants: encounter.combatants.map((c) => (c.id === id ? { ...c, hidden: roll } : c)),
  };
}

/** Put a condition on a monster with a clock: gone after this many rounds. */
/**
 * Record who caused a condition, or clear the record.
 *
 * Separate from applying the condition itself because the two arrive at
 * different moments: the DM ticks "frightened" and only then says what of.
 */
export function setConditionSource(
  encounter: EncounterState,
  id: string,
  conditionId: string,
  sourceId: string | undefined,
): EncounterState {
  return {
    ...encounter,
    combatants: encounter.combatants.map((c) => {
      if (c.id !== id || c.kind !== 'monster') return c;
      const conditionSources = { ...c.conditionSources };
      if (sourceId) conditionSources[conditionId] = sourceId;
      else delete conditionSources[conditionId];
      return {
        ...c,
        conditionSources: Object.keys(conditionSources).length ? conditionSources : undefined,
      };
    }),
  };
}

/** Conditions whose rules turn on who caused them, so the UI knows to ask. */
export const CONDITIONS_WITH_A_SOURCE = ['frightened', 'charmed'];

export function addTimedMonsterCondition(
  encounter: EncounterState,
  id: string,
  conditionId: string,
  rounds: number,
): EncounterState {
  return {
    ...encounter,
    combatants: encounter.combatants.map((c) =>
      c.id === id && c.kind === 'monster'
        ? {
            ...c,
            conditions: c.conditions.includes(conditionId)
              ? c.conditions
              : [...c.conditions, conditionId],
            conditionTimers: {
              ...c.conditionTimers,
              [conditionId]: Math.max(1, Math.round(rounds)),
            },
          }
        : c,
    ),
  };
}

/** A round passed: every monster's timed conditions burn one and expire at nothing. */
export function tickMonsterConditions(encounter: EncounterState): EncounterState {
  return {
    ...encounter,
    combatants: encounter.combatants.map((c) => {
      if (c.kind !== 'monster' || !c.conditionTimers) return c;
      const conditionTimers: Record<string, number> = {};
      const expired: string[] = [];
      for (const [id, left] of Object.entries(c.conditionTimers)) {
        if (left - 1 <= 0) expired.push(id);
        else conditionTimers[id] = left - 1;
      }
      return {
        ...c,
        conditionTimers,
        conditions: c.conditions.filter((id) => !expired.includes(id)),
      };
    }),
  };
}

/**
 * Delay: step down the order past whoever is next.
 *
 * Implemented as taking the next combatant's initiative with a tie-break just
 * under theirs, so the sorted order - the only order there is - moves them
 * exactly one place. When the delayer is the one whose turn it is, the pointer
 * stays where it is and now names the combatant who moved up, which is what
 * "you go, I'll act after" means.
 */
export function delayTurn(encounter: EncounterState, id: string): EncounterState {
  const order = sortCombatants(encounter.combatants);
  const at = order.findIndex((c) => c.id === id);
  if (at === -1 || at === order.length - 1) return encounter;
  const next = order[at + 1];
  return {
    ...encounter,
    combatants: encounter.combatants.map((c) =>
      c.id === id
        ? { ...c, initiative: next.initiative, tieBreak: next.tieBreak - 1 }
        : c,
    ),
  };
}

/** The battle's own record, newest first, capped. */
export function appendLog(encounter: EncounterState, text: string): EncounterState {
  return {
    ...encounter,
    log: [{ id: encounter.nextSeq, text }, ...(encounter.log ?? [])].slice(0, 30),
    nextSeq: encounter.nextSeq + 1,
  };
}

// ---------------------------------------------------------------- the fight

/** Roll initiative for every monster. Characters keep whatever was typed. */
export function rollMonsterInitiative(
  encounter: EncounterState,
  monsters: Map<string, Monster>,
  rng: Rng = defaultRng,
): EncounterState {
  return {
    ...encounter,
    combatants: encounter.combatants.map((c) => {
      if (c.kind !== 'monster') return c;
      const monster = monsters.get(c.monsterId);
      const modifier = monster ? initiativeMod(monster) : 0;
      return { ...c, initiative: rollD20(modifier, 'normal', rng).total };
    }),
  };
}

/** Round one, top of the order. Nobody has walked anywhere or scored yet. */
export function startEncounter(encounter: EncounterState): EncounterState {
  if (!encounter.combatants.length) return encounter;
  return {
    ...encounter,
    round: 1,
    turnIndex: 0,
    tally: undefined,
    endedAfter: undefined,
    combatants: encounter.combatants.map((c) =>
      c.kind === 'monster' && (c.moved || c.reactionSpent || c.stance)
        ? { ...c, moved: 0, reactionSpent: undefined, stance: undefined }
        : c,
    ),
  };
}

/**
 * The next combatant, wrapping into a new round at the bottom of the order.
 *
 * Deliberately returns whose turn it *became* alongside the new state, so the
 * caller can reset that character's action economy. This is the whole point of
 * tracking a turn: `newTurn` in `play.ts` gives back the action, the bonus
 * action, the reaction and the movement at the start of a turn, and a tracker
 * that knows when a turn starts should be the thing pressing it.
 */
export function nextTurn(encounter: EncounterState): {
  encounter: EncounterState;
  began: Combatant | null;
} {
  if (!encounter.combatants.length) return { encounter, began: null };
  const order = sortCombatants(encounter.combatants);
  // A dormant monster has no turn to take: the pointer passes over it the
  // way a squad game's unactivated pod simply is not in the fight yet. If
  // everyone is dormant the pointer still moves one place - a stuck pointer
  // would be worse than an odd one.
  const dormant = (c: Combatant | undefined) => c?.kind === 'monster' && !!c.dormant;

  if (!isRunning(encounter)) {
    const started = startEncounter(encounter);
    let index = 0;
    while (index < order.length - 1 && dormant(order[index])) index += 1;
    const began = order[index] ?? null;
    return { encounter: { ...started, turnIndex: index }, began };
  }

  let round = encounter.round;
  let index = encounter.turnIndex;
  for (let step = 0; step < order.length; step++) {
    index += 1;
    if (index >= order.length) {
      index = 0;
      round += 1;
    }
    if (!dormant(order[index])) break;
  }
  const began = order[index] ?? null;
  const next = {
    ...encounter,
    turnIndex: index,
    round,
    // Legendary actions, movement, the reaction and the stance all refresh at
    // the start of the creature's own turn - the same moment a character's
    // action economy comes back, handled the same way: by the thing that knows
    // a turn began. The reaction in particular: it comes back when your turn
    // *starts*, not when the turn you spent it on ends.
    combatants:
      began?.kind === 'monster' &&
      (began.legendarySpent || began.moved || began.reactionSpent || began.stance)
        ? encounter.combatants.map((c) =>
            c.id === began.id
              ? { ...c, legendarySpent: 0, moved: 0, reactionSpent: undefined, stance: undefined }
              : c,
          )
        : encounter.combatants,
  };
  return { encounter: next, began };
}

/**
 * End the fight but keep who was in it, so "same goblins, new round" does not
 * mean adding them all again. `emptyEncounter` is the other button. The
 * rounds it ran are stamped for the debrief - the round counter itself goes
 * back to 0 - and the log gets its closing line.
 */
export function endEncounter(encounter: EncounterState): EncounterState {
  const ended = { ...encounter, round: 0, turnIndex: -1 };
  if (!isRunning(encounter)) return ended;
  return appendLog(
    { ...ended, endedAfter: encounter.round },
    `The fight ends — ${encounter.round} round${encounter.round === 1 ? '' : 's'}.`,
  );
}
