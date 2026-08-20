import type { Roster } from './storage';
import { updatePlay } from './storage';
import type { PlayState } from './play';
import { queueIntent, withdrawIntent } from './seats';
import type { Intent, Seat } from './seats';

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
  /**
   * §96: seat → host - a player took a chair, name and all. An honor
   * system, deliberately: the claim informs, it never locks. Friends at a
   * table pick their own character correctly, and the one enforcement
   * worth having is everyone *seeing* who sat where.
   */
  | { kind: 'sit'; seat: Seat }
  /** §96: host → seats - who is sitting where, for the lobby. */
  | { kind: 'seats'; seats: Seat[] }
  /** Seat → host: just joined; answer with state, plans and seats. */
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
  seats: Seat[] = [],
): { roster?: Roster; plans?: Intent[]; seats?: Seat[] } {
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
    case 'sit':
      // One chair per character, §92's rule: sitting again is rejoining.
      return {
        seats: [...seats.filter((s) => s.rosterId !== message.seat.rosterId), message.seat],
      };
    // `state`, `plans` and `seats` are the host's own words: hearing them
    // back (a second host, a §95 relay echo) must never overwrite the
    // truth source.
    case 'state':
    case 'plans':
    case 'seats':
    case 'hello':
      return {};
  }
}

/** What a seat does with a message: take the truth, ignore operations -
    those are the host's to apply, even when overheard on a broadcast bus. */
export function seatApply(
  message: TableMessage,
): { roster?: Roster; plans?: Intent[]; seats?: Seat[] } {
  switch (message.kind) {
    case 'state':
      return { roster: message.roster };
    case 'plans':
      return { plans: message.plans };
    case 'seats':
      return { seats: message.seats };
    case 'intent':
    case 'play':
    case 'sit':
    case 'hello':
      return {};
  }
}

/* ------------------------------------------------------------------ §95 -
   The relay: the same wire over an actual network. A relay is a networked
   BroadcastChannel - a websocket room that forwards each message to every
   other member and stores nothing - so the protocol above rides it
   unchanged. `relay/` in the repo holds two interchangeable rooms: a Node
   one for the laptop at the table, a Cloudflare Worker for the cloud. */

/** Where the table meets: the relay's address and the room's name. */
export interface RelayConfig {
  url: string;
  room: string;
}

/**
 * A room name nobody guesses: ~30 bits from an alphabet with no 0/O or
 * 1/I/L to squint at over a table. The room name is the whole secret -
 * the relay stores nothing and admits anyone who knows it - which is the
 * bearer-token model every "join my game" code uses.
 */
const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * §96: the Jackbox half of joining. A room code is what friends shout
 * across a table; the relay URL is plumbing nobody should type twice. So
 * the last relay this device used is remembered on its own, and the join
 * screen asks for the code big and the URL only once - or never, when the
 * player arrived by a seat link that carried it.
 */
const RELAY_URL_KEY = 'dnd-forge:relay-url:v1';

export function rememberRelayUrl(url: string): void {
  try {
    localStorage.setItem(RELAY_URL_KEY, url);
  } catch {
    // Private browsing; it is retyped, not lost.
  }
}

export function lastRelayUrl(): string {
  try {
    return localStorage.getItem(RELAY_URL_KEY) ?? '';
  } catch {
    return '';
  }
}

export function newRoomCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join('');
}

/**
 * The roster without its faces. §24.4 raised the portrait ceiling and a
 * roster of five can carry a quarter-megabyte of data URLs - free as an
 * in-process structured clone, rude as a network broadcast sent on every
 * hit point typed. The wire sends the slim form; a seat that already knew
 * a face keeps it via `mergePortraits`, and one that never did shows none,
 * exactly as a share link (§45) already behaves.
 */
export function slimRoster(roster: Roster): Roster {
  return {
    ...roster,
    entries: roster.entries.map((entry) => {
      if (!entry.build.details.portrait) return entry;
      const { portrait: _face, ...details } = entry.build.details;
      return { ...entry, build: { ...entry.build, details } };
    }),
  };
}

/** Keep the faces this device already knows on the state that arrives bare. */
export function mergePortraits(incoming: Roster, known: Roster): Roster {
  return {
    ...incoming,
    entries: incoming.entries.map((entry) => {
      if (entry.build.details.portrait) return entry;
      const face = known.entries.find((k) => k.id === entry.id)?.build.details.portrait;
      if (!face) return entry;
      return {
        ...entry,
        build: { ...entry.build, details: { ...entry.build.details, portrait: face } },
      };
    }),
  };
}

/**
 * The networked wire. JSON on a websocket, reconnecting forever with a
 * capped backoff, because the phone at the table locks its screen and the
 * whole §95 design rides on rejoining being invisible: the socket reopens,
 * `onOpen` fires, the caller re-says `hello` (a seat) or re-broadcasts the
 * truth (the host), and the room converges. `close()` is the only way out.
 */
export function relayWire(
  config: RelayConfig,
  onOpen?: () => void,
): TableWire {
  const handlers = new Set<(message: TableMessage) => void>();
  let socket: WebSocket | null = null;
  let closed = false;
  let attempt = 0;

  const connect = () => {
    if (closed) return;
    const joined = new URL(config.url);
    joined.searchParams.set('room', config.room);
    socket = new WebSocket(joined.toString());
    socket.onopen = () => {
      attempt = 0;
      onOpen?.();
    };
    socket.onmessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(String(event.data)) as TableMessage;
        for (const handler of handlers) handler(message);
      } catch {
        // A frame that does not parse is not a message; the room goes on.
      }
    };
    socket.onclose = () => {
      socket = null;
      if (closed) return;
      attempt += 1;
      setTimeout(connect, Math.min(500 * 2 ** attempt, 8000));
    };
    socket.onerror = () => socket?.close();
  };
  connect();

  return {
    send: (message) => {
      // A message while the socket is down is dropped, not queued: state
      // and plans are re-broadcast whole on reconnect, hello is re-said by
      // onOpen, and a stale op replayed late is worse than one retyped.
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    },
    onMessage: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    close: () => {
      closed = true;
      socket?.close();
    },
  };
}
