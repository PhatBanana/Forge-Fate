import { describe, expect, it } from 'vitest';
import { hostApply, mergePortraits, newRoomCode, pairedWires, seatApply, slimRoster } from './sync';
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
