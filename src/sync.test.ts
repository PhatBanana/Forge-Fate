import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hostApply,
  isTableMessage,
  mergePortraits,
  newRoomCode,
  nothingUnsaid,
  noteUnsaid,
  pairedWires,
  relayWire,
  resay,
  seatApply,
  slimRoster,
} from './sync';
import type { TableMessage } from './sync';
import { fighter, rosterOf, wizard } from './test/factories';
import { hpNow } from './play';
import { deriveBuild } from './engine/character';
import type { Intent } from './seats';

/**
 * §94. The protocol, without a browser in sight: the host applies
 * operations and never takes dictation about state; a seat takes the truth
 * and never applies an operation it overhears. The wires themselves are
 * checked as a pair - a message reaches the other end and never echoes.
 */

const plan = (over: Partial<Intent> = {}): Intent => ({
  id: 'i1',
  combatantId: 'cbt1',
  kind: 'dodge',
  at: 1,
  ...over,
});

describe('the host', () => {
  it('applies queue and withdraw as operations on its own queue', () => {
    const roster = rosterOf(fighter());
    const queued = hostApply(
      { kind: 'intent', op: 'queue', intent: { combatantId: 'cbt1', kind: 'dodge' } },
      roster,
      [],
    );
    expect(queued.plans).toHaveLength(1);
    expect(queued.roster).toBeUndefined();

    const gone = hostApply(
      { kind: 'intent', op: 'withdraw', combatantId: 'cbt1' },
      roster,
      queued.plans!,
    );
    expect(gone.plans).toEqual([]);
  });

  it('takes a seat\'s play state - the one slice a player owns', () => {
    const roster = rosterOf(fighter(), wizard());
    const max = deriveBuild(roster.entries[0].build).hp.total;
    const wounded = { ...roster.entries[0].play, currentHp: 3 };
    const applied = hostApply({ kind: 'play', rosterId: 'c0', play: wounded }, roster, []);
    expect(hpNow(applied.roster!.entries[0].play, max)).toBe(3);
    // Everyone else is untouched.
    expect(applied.roster!.entries[1].play).toBe(roster.entries[1].play);
  });

  it('never takes dictation about state - it is the truth source', () => {
    const roster = rosterOf(fighter());
    const foreign = rosterOf(wizard());
    expect(hostApply({ kind: 'state', roster: foreign }, roster, [])).toEqual({});
    expect(hostApply({ kind: 'plans', plans: [plan()] }, roster, [])).toEqual({});
    expect(hostApply({ kind: 'hello' }, roster, [])).toEqual({});
  });
});

describe('a seat', () => {
  it('takes the truth and ignores overheard operations', () => {
    const roster = rosterOf(fighter());
    expect(seatApply({ kind: 'state', roster }).roster).toBe(roster);
    expect(seatApply({ kind: 'plans', plans: [plan()] }).plans).toHaveLength(1);
    expect(
      seatApply({ kind: 'intent', op: 'queue', intent: { combatantId: 'x', kind: 'dash' } }),
    ).toEqual({});
    expect(seatApply({ kind: 'hello' })).toEqual({});
  });
});

describe('the paired wires', () => {
  it('delivers to the other end and never echoes to the sender', () => {
    const [host, seat] = pairedWires();
    const heardByHost: TableMessage[] = [];
    const heardBySeat: TableMessage[] = [];
    host.onMessage((m) => heardByHost.push(m));
    seat.onMessage((m) => heardBySeat.push(m));

    seat.send({ kind: 'hello' });
    host.send({ kind: 'plans', plans: [] });

    expect(heardByHost).toEqual([{ kind: 'hello' }]);
    expect(heardBySeat).toEqual([{ kind: 'plans', plans: [] }]);

    // Unsubscribed is unsubscribed.
    const off = host.onMessage(() => {
      throw new Error('should not hear this');
    });
    off();
    seat.send({ kind: 'hello' });
    expect(heardByHost).toHaveLength(2);
  });
});

describe('the relay trimmings (§95)', () => {
  it('mints room codes long enough and free of lookalike letters', () => {
    const codes = new Set(Array.from({ length: 50 }, () => newRoomCode()));
    expect(codes.size).toBe(50);
    for (const code of codes) expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
  });

  it('sends the roster slim and lets a seat keep the faces it knew', () => {
    const roster = rosterOf(fighter(), wizard());
    const withFace: typeof roster = {
      ...roster,
      entries: roster.entries.map((entry, i) =>
        i === 0
          ? {
              ...entry,
              build: {
                ...entry.build,
                details: { ...entry.build.details, portrait: 'data:image/png;base64,xyz' },
              },
            }
          : entry,
      ),
    };
    const slim = slimRoster(withFace);
    expect(slim.entries[0].build.details.portrait).toBeUndefined();
    // The wizard's entry is untouched, not rebuilt.
    expect(slim.entries[1]).toBe(withFace.entries[1]);

    // The seat that knew the face keeps it; the one that never did shows none.
    const merged = mergePortraits(slim, withFace);
    expect(merged.entries[0].build.details.portrait).toBe('data:image/png;base64,xyz');
    expect(mergePortraits(slim, roster).entries[0].build.details.portrait).toBeUndefined();
  });
});

/**
 * §97. The dead spot: what a wire may keep to say again, and what it must
 * still drop. The pocket holds a device's own truth - its chair, its
 * marks, latest per character - and refuses every operation, which is how
 * §95's drop-not-queue decision survives the feature that softens it.
 */
describe('the unsaid pocket (§97)', () => {
  const chair = { id: 's1', rosterId: 'c0', playerName: 'Alex', claimedAt: 1 };
  const rested = rosterOf(fighter()).entries[0].play;
  const marks = { ...rested, currentHp: 3 };

  it('keeps the latest sit and the latest marks per character', () => {
    let unsaid = nothingUnsaid();
    unsaid = noteUnsaid(unsaid, { kind: 'sit', seat: { ...chair, playerName: 'Al' } });
    unsaid = noteUnsaid(unsaid, { kind: 'sit', seat: chair });
    unsaid = noteUnsaid(unsaid, { kind: 'play', rosterId: 'c0', play: rested });
    unsaid = noteUnsaid(unsaid, { kind: 'play', rosterId: 'c0', play: marks });
    unsaid = noteUnsaid(unsaid, { kind: 'play', rosterId: 'c1', play: marks });

    const said = resay(unsaid);
    expect(said).toEqual([
      { kind: 'sit', seat: chair },
      { kind: 'play', rosterId: 'c0', play: marks },
      { kind: 'play', rosterId: 'c1', play: marks },
    ]);
  });

  it('§100: the boundary guard accepts the protocol and nothing else', () => {
    const roster = rosterOf(fighter());
    // Every word the protocol speaks.
    expect(isTableMessage({ kind: 'hello' })).toBe(true);
    expect(isTableMessage({ kind: 'state', roster })).toBe(true);
    expect(isTableMessage({ kind: 'plans', plans: [] })).toBe(true);
    expect(isTableMessage({ kind: 'seats', seats: [] })).toBe(true);
    expect(isTableMessage({ kind: 'sit', seat: chair })).toBe(true);
    expect(isTableMessage({ kind: 'play', rosterId: 'c0', play: marks })).toBe(true);
    expect(
      isTableMessage({ kind: 'intent', op: 'queue', intent: { combatantId: 'x', kind: 'cast' } }),
    ).toBe(true);
    expect(isTableMessage({ kind: 'intent', op: 'withdraw', combatantId: 'x' })).toBe(true);
    // And none of a stranger's.
    expect(isTableMessage(null)).toBe(false);
    expect(isTableMessage('hello')).toBe(false);
    expect(isTableMessage({ kind: 'pwn' })).toBe(false);
    expect(isTableMessage({ kind: 'state', roster: [] })).toBe(false);
    expect(isTableMessage({ kind: 'play', play: marks })).toBe(false);
    expect(
      isTableMessage({ kind: 'intent', op: 'queue', intent: { combatantId: 'x', kind: 'pwn' } }),
    ).toBe(false);
  });

  it('refuses operations and the host\'s own words', () => {
    let unsaid = nothingUnsaid();
    unsaid = noteUnsaid(unsaid, {
      kind: 'intent',
      op: 'queue',
      intent: { combatantId: 'cbt1', kind: 'dodge' },
    });
    unsaid = noteUnsaid(unsaid, { kind: 'state', roster: rosterOf(fighter()) });
    unsaid = noteUnsaid(unsaid, { kind: 'plans', plans: [plan()] });
    unsaid = noteUnsaid(unsaid, { kind: 'hello' });
    expect(resay(unsaid)).toEqual([]);
  });
});

/**
 * The relay wire itself, over a socket the test owns: the line goes down,
 * the screen is told, the pocket fills, and the reconnect says hello
 * before it says anything held.
 */
describe('the relay wire through a dead spot (§97)', () => {
  class FakeSocket {
    static OPEN = 1;
    static instances: FakeSocket[] = [];
    url: string;
    readyState = 0;
    sent: string[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(url: string) {
      this.url = url;
      FakeSocket.instances.push(this);
    }
    send(data: string) {
      this.sent.push(data);
    }
    close() {
      this.readyState = 3;
      this.onclose?.();
    }
    open() {
      this.readyState = FakeSocket.OPEN;
      this.onopen?.();
    }
    drop() {
      this.readyState = 3;
      this.onclose?.();
    }
  }

  beforeEach(() => {
    FakeSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const saidBy = (socket: FakeSocket): TableMessage[] =>
    socket.sent.map((frame) => JSON.parse(frame) as TableMessage);

  it('reports the line, pockets marks in the dead spot, and re-says them after hello', () => {
    const status: boolean[] = [];
    const wire = relayWire(
      { url: 'wss://relay.example', room: 'ABCDEF' },
      () => wire.send({ kind: 'hello' }),
      (up) => status.push(up),
    );
    const first = FakeSocket.instances[0];
    first.open();
    expect(status).toEqual([true]);
    expect(saidBy(first)).toEqual([{ kind: 'hello' }]);

    first.drop();
    expect(status).toEqual([true, false]);

    // In the dead spot: marks and the chair go in the pocket, an op does not.
    const marks = { ...rosterOf(fighter()).entries[0].play, currentHp: 3 };
    const chair = { id: 's1', rosterId: 'c0', claimedAt: 1 };
    wire.send({ kind: 'play', rosterId: 'c0', play: marks });
    wire.send({ kind: 'sit', seat: chair });
    wire.send({ kind: 'intent', op: 'withdraw', combatantId: 'cbt1' });

    vi.advanceTimersByTime(1000);
    const second = FakeSocket.instances[1];
    expect(second).toBeDefined();
    second.open();

    // Hello first (onOpen), then the pocket - the op stays dropped.
    expect(saidBy(second)).toEqual([
      { kind: 'hello' },
      { kind: 'sit', seat: chair },
      { kind: 'play', rosterId: 'c0', play: marks },
    ]);
    expect(status).toEqual([true, false, true]);

    // Said is said: a second drop re-says nothing stale.
    second.drop();
    vi.advanceTimersByTime(2000);
    const third = FakeSocket.instances[2];
    third.open();
    expect(saidBy(third)).toEqual([{ kind: 'hello' }]);
  });

  it('§100: a hostile frame is not a message - oversized, misshapen or untyped', () => {
    const heard: TableMessage[] = [];
    const wire = relayWire({ url: 'wss://relay.example', room: 'ABCDEF' });
    wire.onMessage((m) => heard.push(m));
    const socket = FakeSocket.instances[0];
    socket.open();

    // The room admits whoever holds the code; what they SEND is typed.
    socket.onmessage?.({ data: JSON.stringify({ kind: 'pwn', payload: 'x' }) });
    socket.onmessage?.({ data: JSON.stringify({ kind: 'state', roster: 'not a roster' }) });
    socket.onmessage?.({ data: JSON.stringify({ kind: 'play', play: {} }) }); // no rosterId
    socket.onmessage?.({ data: `{"kind":"hello","pad":"${'x'.repeat(1_000_001)}"}` });
    expect(heard).toEqual([]);

    // The real protocol still speaks.
    socket.onmessage?.({ data: JSON.stringify({ kind: 'hello' }) });
    expect(heard).toEqual([{ kind: 'hello' }]);
    wire.close();
  });

  it('closed is closed - no reconnect, no status noise', () => {
    const status: boolean[] = [];
    const wire = relayWire(
      { url: 'wss://relay.example', room: 'ABCDEF' },
      undefined,
      (up) => status.push(up),
    );
    FakeSocket.instances[0].open();
    wire.close();
    vi.advanceTimersByTime(10000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(status).toEqual([true]);
  });
});
