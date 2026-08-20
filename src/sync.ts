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
 * Known cost, accepted here: `state` carries the whole roster, and a
 * roster with §24.4 portraits is not small. In-process structured clones
 * make that free on this wire; the network sends it slim - `slimRoster`,
 * below, which was §95's first job.
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

/* ------------------------------------------------------------------ §97 -
   What the wire could not say, kept to say again.

   The §95 decision stands: an *operation* sent into a dead socket is
   dropped, because a stale op replayed late is worse than one retyped -
   the turn it planned for may already have run. But `sit` and `play` are
   not operations. Each carries this device's own current truth (§92: a
   player owns their hit points and their chair), so the latest one is
   idempotent to re-say and wrong to lose - a player who marks damage in a
   dead spot must not watch the host's rejoin broadcast undo it. The
   pocket keeps only the latest per character, and hands it back after
   the reconnect's hello. */

export interface Unsaid {
  sit?: Seat;
  play: Record<string, PlayState>;
}

export const nothingUnsaid = (): Unsaid => ({ play: {} });

/** Fold a message the wire failed to carry into the pocket - or refuse
    it, which is how the drop-not-queue rule stays a rule. */
export function noteUnsaid(unsaid: Unsaid, message: TableMessage): Unsaid {
  switch (message.kind) {
    case 'sit':
      return { ...unsaid, sit: message.seat };
    case 'play':
      return { ...unsaid, play: { ...unsaid.play, [message.rosterId]: message.play } };
    default:
      return unsaid;
  }
}

/** The pocket as messages, sit before marks - a chair before its owner
    speaks. */
export function resay(unsaid: Unsaid): TableMessage[] {
  return [
    ...(unsaid.sit ? [{ kind: 'sit', seat: unsaid.sit } satisfies TableMessage] : []),
    ...Object.entries(unsaid.play).map(
      ([rosterId, play]) => ({ kind: 'play', rosterId, play }) satisfies TableMessage,
    ),
  ];
}

/* ----------------------------------------------------------------- §100 -
   The network boundary types its input. The room code admits whoever
   holds it - that is the Jackbox model, chosen on purpose - so what a
   member can *send* is the surface worth guarding. Two rules, both at
   the wire and only at the network wire (the same-browser broadcast is
   this browser talking to itself):

   - A frame bigger than the worker's own per-message ceiling is not a
     message. Nothing this protocol says legitimately approaches it, and
     a phone should not be made to parse a megabyte because a stranger
     found the room.
   - A frame that parses but is not shaped like a TableMessage is not a
     message either. The check is shallow by design - the deep defense is
     that hostile data has nowhere to go (React escapes what it renders,
     §96 quarantines synced state from the device's own roster) - but a
     typed boundary means hostApply and seatApply never see a `kind` they
     did not declare. */

const MAX_FRAME = 1_000_000;

const INTENT_KINDS = new Set([
  'attack', 'cast', 'move', 'dash', 'dodge', 'disengage', 'help', 'hide', 'other',
]);

export function isTableMessage(value: unknown): value is TableMessage {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  switch (m.kind) {
    case 'state': {
      const roster = m.roster as { entries?: unknown } | null;
      return typeof roster === 'object' && roster !== null && Array.isArray(roster.entries);
    }
    case 'plans':
      return Array.isArray(m.plans);
    case 'seats':
      return Array.isArray(m.seats);
    case 'intent': {
      if (m.op === 'withdraw') return typeof m.combatantId === 'string';
      if (m.op !== 'queue') return false;
      const intent = m.intent as Record<string, unknown> | null;
      return (
        typeof intent === 'object' &&
        intent !== null &&
        typeof intent.combatantId === 'string' &&
        INTENT_KINDS.has(intent.kind as string)
      );
    }
    case 'play':
      return typeof m.rosterId === 'string' && typeof m.play === 'object' && m.play !== null;
    case 'sit': {
      const seat = m.seat as Record<string, unknown> | null;
      return typeof seat === 'object' && seat !== null && typeof seat.rosterId === 'string';
    }
    case 'hello':
      return true;
    default:
      return false;
  }
}

/**
 * The networked wire. JSON on a websocket, reconnecting forever with a
 * capped backoff, because the phone at the table locks its screen and the
 * whole §95 design rides on rejoining being invisible: the socket reopens,
 * `onOpen` fires, and the session above re-says `hello` (a seat) or
 * re-broadcasts the truth (the host), and the room converges. `close()`
 * is the only way out.
 *
 * §97 added the two things a dead spot needs: `onStatus` says whether the
 * line is up, so a screen can stop pretending, and the unsaid pocket
 * re-says a player's own marks after the reconnect's hello. §100 added
 * the boundary checks above.
 */
export function relayWire(
  config: RelayConfig,
  onOpen?: () => void,
  onStatus?: (up: boolean) => void,
): TableWire {
  const handlers = new Set<(message: TableMessage) => void>();
  let socket: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let unsaid = nothingUnsaid();

  const connect = () => {
    if (closed) return;
    const joined = new URL(config.url);
    joined.searchParams.set('room', config.room);
    socket = new WebSocket(joined.toString());
    socket.onopen = () => {
      attempt = 0;
      onStatus?.(true);
      onOpen?.();
      // After onOpen, so a seat's hello lands before its re-said marks.
      const held = resay(unsaid);
      unsaid = nothingUnsaid();
      for (const message of held) socket?.send(JSON.stringify(message));
    };
    socket.onmessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string' || event.data.length > MAX_FRAME) return;
      try {
        const message: unknown = JSON.parse(event.data);
        if (!isTableMessage(message)) return;
        for (const handler of handlers) handler(message);
      } catch {
        // A frame that does not parse is not a message; the room goes on.
      }
    };
    socket.onclose = () => {
      socket = null;
      if (closed) return;
      onStatus?.(false);
      attempt += 1;
      setTimeout(connect, Math.min(500 * 2 ** attempt, 8000));
    };
    socket.onerror = () => socket?.close();
  };
  connect();

  return {
    send: (message) => {
      // A message while the socket is down: ops are dropped (state and
      // plans are re-broadcast whole on reconnect, hello is re-said by
      // onOpen), and the device's own sit and marks go in the pocket.
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      } else {
        unsaid = noteUnsaid(unsaid, message);
      }
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

/* ----------------------------------------------------------------- §103 -
   The session: the whole protocol policy, behind one seam.

   hostApply and seatApply carry the message algebra and always did; what
   they never carried was the *policy* around them - who answers a hello
   and with what, what a rejoin re-says, which roster incoming truth is
   allowed to touch. All of that lived inline in App's wire effect,
   threaded through eight refs, and every bug this arc has had (§96's
   data loss, §97's dead spot) lived exactly there, tested by nothing.
   The session moves the policy behind an interface small enough to hold:
   a role, a way to say an operation, a way to announce changed truth,
   and close. App keeps only the React binding - state setters on one
   side, current-value readers on the other.

   The wire is the session's seam, and it is injectable because three
   adapters really cross it: broadcastWire in a browser, relayWire over
   the network, and pairedWires in the tests - which is what finally
   lets two whole sessions converse in a test with no browser at all. */

export type SessionRole = 'host' | 'seat' | 'off';

/** What the session reads of the caller's world - current values, every
    time, because a wire outlives many renders. */
export interface SessionWorld {
  roster(): Roster;
  plans(): Intent[];
  seats(): Seat[];
  seatId(): string | null;
  tableRoster(): Roster | null;
}

/** What the session tells the caller. `home` carries §96's quarantine
    verdict: over a relay, truth lands in the table roster and never on
    the device's own characters; on the same-browser broadcast the tabs
    already share one roster and keep sharing it. */
export interface SessionEvents {
  onRoster(roster: Roster, home: 'own' | 'table'): void;
  onPlans(plans: Intent[]): void;
  onSeats(seats: Seat[]): void;
  onStatus?(up: boolean): void;
}

export interface TableSession {
  /** The §92 rule as a switch: the battle screen is the host, a seat
      screen is a seat, and every other screen is off - a tab editing a
      character must not have broadcasts land on its half-typed name. */
  setRole(role: SessionRole): void;
  /** An operation from this device, host echo and dead-spot pocket
      included - the wire's business, not the caller's. */
  say(message: TableMessage): void;
  /** The host's truth changed; a non-host announcing is a no-op, which
      is the protocol rule kept where the protocol lives. */
  announce(kind: 'state' | 'plans' | 'seats'): void;
  close(): void;
}

/**
 * Open the table's session. Returns null where there is no wire to be
 * had (no relay configured and no BroadcastChannel) - the app then
 * simply has no second screen. Pass `wire` to stand at the seam
 * yourself; the tests hand in one half of `pairedWires()`.
 */
export function tableSession(
  relay: RelayConfig | null,
  world: SessionWorld,
  events: SessionEvents,
  wire?: TableWire | null,
): TableSession | null {
  let role: SessionRole = 'off';

  /* The rejoin, §95/§97: a reopened socket converges the room. The host
     re-says the truth whole; a seat re-says hello and its own chair -
     rejoining IS re-sitting (§96), said as well as meant, because a host
     that reloaded while this phone was away has an empty lobby until the
     chairs speak up. The wire re-says dead-spot marks by itself. */
  const sayAgain = () => {
    if (role === 'host') {
      announce('state');
      announce('plans');
    } else {
      line?.send({ kind: 'hello' });
      const seatId = world.seatId();
      const chair = seatId ? world.seats().find((s) => s.rosterId === seatId) : undefined;
      if (chair) line?.send({ kind: 'sit', seat: chair });
    }
  };

  const line =
    wire !== undefined
      ? wire
      : relay
        ? relayWire(relay, sayAgain, (up) => events.onStatus?.(up))
        : broadcastWire();
  if (!line) return null;

  const announce = (kind: 'state' | 'plans' | 'seats') => {
    if (role !== 'host') return;
    if (kind === 'state') line.send({ kind: 'state', roster: slimRoster(world.roster()) });
    if (kind === 'plans') line.send({ kind: 'plans', plans: world.plans() });
    if (kind === 'seats') line.send({ kind: 'seats', seats: world.seats() });
  };

  const off = line.onMessage((message) => {
    if (role === 'host') {
      const applied = hostApply(message, world.roster(), world.plans(), world.seats());
      if (applied.roster) events.onRoster(applied.roster, 'own');
      if (applied.plans) events.onPlans(applied.plans);
      if (applied.seats) events.onSeats(applied.seats);
      if (message.kind === 'hello') {
        // The newcomer's answer: the whole truth, in three messages.
        line.send({ kind: 'state', roster: slimRoster(world.roster()) });
        line.send({ kind: 'plans', plans: world.plans() });
        line.send({ kind: 'seats', seats: world.seats() });
      }
    } else if (role === 'seat') {
      const applied = seatApply(message);
      if (applied.roster) {
        if (relay) {
          events.onRoster(
            mergePortraits(applied.roster, world.tableRoster() ?? world.roster()),
            'table',
          );
        } else {
          events.onRoster(mergePortraits(applied.roster, world.roster()), 'own');
        }
      }
      if (applied.plans) events.onPlans(applied.plans);
      if (applied.seats) events.onSeats(applied.seats);
    }
  });

  // A broadcast wire is up the moment it exists, so hello is said here;
  // a relay's hello is said by sayAgain when the socket actually opens.
  if (!relay) line.send({ kind: 'hello' });

  return {
    setRole: (next) => {
      role = next;
    },
    say: (message) => line.send(message),
    announce,
    close: () => {
      off();
      line.close();
    },
  };
}
