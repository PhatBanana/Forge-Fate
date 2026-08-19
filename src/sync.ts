import type { Roster } from './storage';
import { updatePlay } from './storage';
import type { PlayState } from './play';
import { queueIntent, withdrawIntent } from './seats';
import type { Intent } from './seats';

/**
 * §94: the wire between the table and its seats.
 *
 * The §92 authority rule, made into a protocol: **one host, and everything
 * flows through it.** The DM's battle screen is the host; it broadcasts the
 * truth (the roster, whose encounter rides on it, and the plan queue), and
 * a seat sends *operations* - queue this, withdraw that, here is my own
 * play state - which the host applies and echoes back. A seat never sends
 * state, so there is never a merge: last write cannot lose because only
 * one device writes.
 *
 * The transport is an interface with a deliberately tiny surface -
 * `send`, `onMessage`, `close` - and §94 ships exactly one real
 * implementation: **BroadcastChannel**, which reaches every tab of this
 * browser on this origin. That is not a toy: it is a second screen at the
 * table today (a laptop for the DM, a tab handed to a player), and it
 * proves the whole protocol end to end with no server, no accounts and no
 * new failure modes. §95 swaps the implementation for a networked one -
 * a relay or WebRTC, the one decision deliberately still open - and
 * nothing above this file changes, the same trick persist.ts (§24) used
 * to make storage pluggable.
 *
 * Two pure functions carry the semantics so the tests need no channel at
 * all: `hostApply` is everything the host does with an incoming message,
 * `seatApply` everything a seat does. The React wiring in App is only
 * plumbing around them.
 *
 * Known cost, accepted for now: `state` carries the whole roster, and a
 * roster with §24.4 portraits is not small. In-process structured clones
 * make that free here; §95's network transport will want to slim it, and
 * that is a §95 problem recorded where §95 will trip over it.
 */

export type TableMessage =
  /** Host → seats: the whole truth. */
  | { kind: 'state'; roster: Roster }
  /** Host → seats: the plan queue as it stands. */
  | { kind: 'plans'; plans: Intent[] }
  /** Seat → host: an operation on the queue, never the queue itself. */
  | { kind: 'intent'; op: 'queue'; intent: Omit<Intent, 'id' | 'at'> }
  | { kind: 'intent'; op: 'withdraw'; combatantId: string }
  /** Seat → host: their own bookkeeping - a player owns their play state. */
  | { kind: 'play'; rosterId: string; play: PlayState }
  /** Seat → host: just joined; answer with state and plans. */
  | { kind: 'hello' };

export interface TableWire {
  send(message: TableMessage): void;
  /** Returns the unsubscribe. A message never echoes to its sender. */
  onMessage(handler: (message: TableMessage) => void): () => void;
  close(): void;
}

const CHANNEL = 'dnd-forge:table:v1';

/**
 * Every tab of this browser, this origin. Returns null where the API is
 * missing (old WebKit, some jsdom builds) - the app then simply has no
 * second screen, which is what it had before §94.
 */
export function broadcastWire(name = CHANNEL): TableWire | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  const channel = new BroadcastChannel(name);
  const handlers = new Set<(message: TableMessage) => void>();
  channel.onmessage = (event: MessageEvent) => {
    for (const handler of handlers) handler(event.data as TableMessage);
  };
  return {
    send: (message) => channel.postMessage(message),
    onMessage: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    close: () => channel.close(),
  };
}

/** Two wires joined back to back - the tests' table, no browser needed. */
export function pairedWires(): [TableWire, TableWire] {
  const a = new Set<(message: TableMessage) => void>();
  const b = new Set<(message: TableMessage) => void>();
  const wire = (
    mine: Set<(m: TableMessage) => void>,
    theirs: Set<(m: TableMessage) => void>,
  ): TableWire => ({
    send: (message) => {
      for (const handler of theirs) handler(message);
    },
    onMessage: (handler) => {
      mine.add(handler);
      return () => mine.delete(handler);
    },
    close: () => mine.clear(),
  });
  return [wire(a, b), wire(b, a)];
}

/**
 * What the host does with a message: apply the operation, ignore what only
 * a host may say. Returns only what changed; `hello` changes nothing here -
 * the caller answers it by broadcasting, which is plumbing, not semantics.
 */
export function hostApply(
  message: TableMessage,
  roster: Roster,
  plans: Intent[],
): { roster?: Roster; plans?: Intent[] } {
  switch (message.kind) {
    case 'intent':
      return {
        plans:
          message.op === 'queue'
            ? queueIntent(plans, message.intent)
            : withdrawIntent(plans, message.combatantId),
      };
    case 'play':
      // The one slice a seat owns. Everything else about the roster stays
      // the host's; a seat cannot rename a character over this wire.
      return { roster: updatePlay(roster, message.rosterId, message.play) };
    // `state` and `plans` are the host's own words: hearing them back (a
    // second host, a §95 relay echo) must never overwrite the truth source.
    case 'state':
    case 'plans':
    case 'hello':
      return {};
  }
}

/** What a seat does with a message: take the truth, ignore operations -
    those are the host's to apply, even when overheard on a broadcast bus. */
export function seatApply(
  message: TableMessage,
): { roster?: Roster; plans?: Intent[] } {
  switch (message.kind) {
    case 'state':
      return { roster: message.roster };
    case 'plans':
      return { plans: message.plans };
    case 'intent':
    case 'play':
    case 'hello':
      return {};
  }
}
