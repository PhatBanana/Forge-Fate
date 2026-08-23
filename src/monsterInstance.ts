import type { EncounterState, MonsterCombatant } from './encounter';

/**
 * §126: what happens to one monster during a fight.
 *
 * Seventeen writers, plus the two readers that go with them, lifted out of
 * `encounter.ts`. They had been living among forty-six other exports whose
 * only shared property was the argument type - every one of them
 * `(EncounterState, ...) => EncounterState` - which is cohesion by shape
 * rather than by concept, and it made the file a place things were put
 * rather than a module that answers something.
 *
 * This is the concept: a monster's own state during a fight. Hit points,
 * conditions and who caused them, limited uses, recharges, legendary
 * actions, movement and reaction, stance, dormancy, hiding, surprise, and
 * the round-timer that expires the timed ones. §106 named the read side of
 * this - "monster hit points ride the combatant, character hit points live
 * on the roster" - and this is the write side of the same rule.
 *
 * What stayed behind: the turn order and the fight's lifecycle, the map and
 * its rooms, the log and the damage tally. Those are the fight, not the
 * monster in it.
 *
 * Carried across verbatim. Three sections of this history (§107, §114,
 * §116) record a move that quietly became a rewrite, and the last of those
 * cost a real regression that no type could see - so these bodies were
 * moved by substitution rather than retyped, and not a character of them
 * changed.
 */

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

/**
 * Conditions whose rules turn on who caused them, so the UI knows to ask.
 *
 * Grappled joined in the hygiene pass after §39: the grapple engine reads
 * `conditionSources.grappled` for the escape roll and the auto-release sweep,
 * but a DM who ticked Grappled by hand had no way to name the grappler - a
 * speed-0 condition the rules engine could never end, while the selector that
 * answers it already existed one line away for the other two.
 */
export const CONDITIONS_WITH_A_SOURCE = ['frightened', 'charmed', 'grappled'];

// ---------------------------------------------------------------- surprise

/**
 * Mark somebody surprised, or wake them up.
 *
 * A writer rather than a field the caller sets, for the usual reason: both
 * kinds of combatant carry the flag and neither the battle screen nor the
 * order drawer should have to remember which branch of the union it is
 * holding.
 */
export function setSurprised(
  encounter: EncounterState,
  id: string,
  surprised: boolean,
): EncounterState {
  return {
    ...encounter,
    combatants: encounter.combatants.map((c) =>
      c.id === id ? { ...c, surprised: surprised || undefined } : c,
    ),
  };
}

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
