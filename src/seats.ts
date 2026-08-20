import { newId } from './storage';

/**
 * §92: seats and intents - the bones of the multiplayer table.
 *
 * The shape every later section builds on, settled here as pure data before
 * any of it touches a network: **the DM's device is the table.** Players
 * hold *seats*, and a seat never writes the fight - it writes an *intent*,
 * a proposal in the command menu's own vocabulary, and the DM runs it.
 * That is not a compromise forced by sync; it is §25.4's pattern with a
 * person on the other end - the cockpit has proposed monster turns since
 * the planner shipped, and "Run it" was always the DM's button. One
 * writer also means no merge to resolve, ever, which is what makes the
 * eventual transport (§94) a relay rather than a database.
 *
 * Intents are **ephemeral by design** - component state beside the
 * encounter, never on it. A proposal is not fight state until the DM runs
 * it: it should not survive in a save, land in the log unrun, or be a step
 * Undo walks back through. The queue clears itself the moment the turn it
 * was for is over.
 */

/** A player's claim on a roster character. Claimed on the player's device
    in §93; modeled now because the intent needs an owner to come from. */
export interface Seat {
  id: string;
  /** The roster entry this seat plays. One seat per character. */
  rosterId: string;
  /** What the player calls themselves at the table. */
  playerName?: string;
  claimedAt: number;
}

/** One claim per character: claiming again re-claims (a phone rejoining),
    it never doubles the chair. */
export function claimSeat(seats: Seat[], rosterId: string, playerName?: string): Seat[] {
  const kept = seats.filter((s) => s.rosterId !== rosterId);
  return [
    ...kept,
    { id: newId(), rosterId, ...(playerName ? { playerName } : {}), claimedAt: Date.now() },
  ];
}

export function releaseSeat(seats: Seat[], rosterId: string): Seat[] {
  return seats.filter((s) => s.rosterId !== rosterId);
}

/**
 * What a player wants to do when their turn comes, in the vocabulary the
 * command menu already speaks. `other` exists because a table's plans are
 * bigger than any enum - "I shove him off the ledge" rides the note.
 */
export type IntentKind =
  | 'attack'
  | 'cast'
  | 'move'
  | 'dash'
  | 'dodge'
  | 'disengage'
  | 'help'
  | 'hide'
  | 'other';

export interface Intent {
  id: string;
  /** Whose turn this is a plan for. */
  combatantId: string;
  kind: IntentKind;
  /** Who to hit, when the plan swings. */
  targetId?: string;
  /**
   * §98: which spell, when the plan casts - picked from the caster's own
   * castable list, so "I cast a spell" stops arriving as free text the DM
   * retypes. The name rides along so every screen can say it without a
   * lookup; upcasting and the slot it comes from ride the note, because
   * that is a table conversation, not a field.
   */
  spellId?: string;
  spellName?: string;
  /** The player's own words - the half of every plan no enum holds. */
  note?: string;
  at: number;
}

/**
 * One plan per combatant: queueing again replaces, because your latest
 * plan is your plan. Withdrawn, declined and run all land in the same
 * place - the plan is gone.
 */
export function queueIntent(
  intents: Intent[],
  intent: Omit<Intent, 'id' | 'at'>,
): Intent[] {
  const kept = intents.filter((i) => i.combatantId !== intent.combatantId);
  return [...kept, { id: newId(), at: Date.now(), ...intent }];
}

export function withdrawIntent(intents: Intent[], combatantId: string): Intent[] {
  return intents.filter((i) => i.combatantId !== combatantId);
}

export const intentFor = (intents: Intent[], combatantId: string): Intent | undefined =>
  intents.find((i) => i.combatantId === combatantId);

/** The plan said back in one line, for the cockpit and the turn strip. */
export function describeIntent(
  intent: Intent,
  targetName?: string,
): string {
  const what = (() => {
    switch (intent.kind) {
      case 'attack':
        return `Attack${targetName ? ` ${targetName}` : ''}`;
      case 'cast':
        return `Cast ${intent.spellName ?? 'a spell'}${targetName ? ` at ${targetName}` : ''}`;
      case 'move':
        return 'Move';
      case 'dash':
        return 'Dash';
      case 'dodge':
        return 'Dodge';
      case 'disengage':
        return 'Disengage';
      case 'help':
        return 'Help';
      case 'hide':
        return 'Hide';
      case 'other':
        return intent.note?.trim() ? '' : 'Something else';
    }
  })();
  const note = intent.note?.trim();
  if (!what) return note ?? 'Something else';
  return note ? `${what} — “${note}”` : what;
}
