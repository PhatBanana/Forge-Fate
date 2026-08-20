import { useMemo, useState } from 'react';
import { Panel } from './shared';
import { PlayCard } from './PlayCard';
import { deriveBuild } from '../engine/character';
import { currentCombatant, isRunning, sortCombatants } from '../encounter';
import type { Combatant, MonsterCombatant } from '../encounter';
import { activeEncounter } from '../storage';
import type { Roster } from '../storage';
import { describeIntent, intentFor } from '../seats';
import type { Intent, IntentKind, Seat } from '../seats';
import { keyOf } from '../terrain';
import type { PlayState } from '../play';
import { lastRelayUrl } from '../sync';
import type { RelayConfig } from '../sync';
import type { Say } from '../toast';

/**
 * §93: the player's seat.
 *
 * One character's view of the table, sized for the phone in their hand: the
 * sheet's play surface, where the fight stands, and the §92 composer for
 * what they will do when their turn comes. On one device today - the DM
 * hands the phone-sized screen across the table, or opens `#seat=<id>` -
 * and §94's transport slots in underneath without this screen changing,
 * because everything here already goes through the two shared surfaces:
 * the roster (their own play state; a player owns their hit points) and
 * the lifted plan queue (a proposal; only the DM's screen runs it).
 *
 * What this screen deliberately is not: a second battle map. The board is
 * the table's; the seat is the hand. It shows facts, takes the player's
 * own bookkeeping, and queues intentions - it can not move a token, roll
 * an attack, or end a turn, which is exactly the §92 authority rule
 * enforced by having no button for any of it.
 */
export function SeatTab({
  roster,
  plans,
  onQueue,
  onWithdraw,
  onPlay,
  seats,
  onSit,
  relay,
  onRelayChange,
  seatId,
  onSeatChange,
  say,
}: {
  roster: Roster;
  plans: Intent[];
  /**
   * §94: the seat speaks in operations, never in state - queue this,
   * withdraw that, here is my own play. On one device App applies them
   * directly; with the wire up they also travel to the host, and this
   * component cannot tell the difference, which is the point.
   */
  onQueue: (intent: Omit<Intent, 'id' | 'at'>) => void;
  onWithdraw: (combatantId: string) => void;
  onPlay: (rosterId: string, play: PlayState) => void;
  seats: Seat[];
  /** §96: take a chair, name attached - claimed here, announced up the
      wire by App, shown in every lobby. An honor system: it informs. */
  onSit: (rosterId: string, playerName?: string) => void;
  /** §96: the table this device is at, and the hand that joins or leaves. */
  relay?: RelayConfig | null;
  onRelayChange?: (relay: RelayConfig | null) => void;
  /** The roster entry this seat plays; null shows the picker. */
  seatId: string | null;
  onSeatChange: (id: string | null) => void;
  say?: Say;
}) {
  const [kind, setKind] = useState<IntentKind>('attack');
  const [target, setTarget] = useState('');
  const [note, setNote] = useState('');
  /* §96: the join block's scratch. The relay URL is remembered from the
     last table this device sat at; the code is what friends shout. */
  const [joinCode, setJoinCode] = useState('');
  const [joinUrl, setJoinUrl] = useState(lastRelayUrl);
  const [playerName, setPlayerName] = useState('');

  const entry = roster.entries.find((e) => e.id === seatId);
  const ctx = useMemo(() => (entry ? deriveBuild(entry.build) : null), [entry]);

  if (!entry || !ctx) {
    /*
      §96: the Jackbox door. No table yet: a code big enough to shout, the
      relay remembered from last time, and a name so the lobby knows who
      sat down. At a table with nothing arrived yet: the lobby is loading -
      the host answers hello with the whole fight. Then the chairs, each
      one saying who already took it. An honor system on purpose: a taken
      chair still sits (rejoining IS re-sitting), the label is the lock.
    */
    return (
      <div className="stack seat">
        {onRelayChange && !relay && (
          <Panel
            title="Join a table"
            subtitle="The DM's screen shows the room code. The relay is remembered after the first time."
          >
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <input
                type="text"
                className="detail seat-code"
                aria-label="Room code"
                placeholder="ROOM CODE"
                maxLength={6}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              />
              <input
                type="text"
                className="detail"
                aria-label="Relay URL"
                placeholder="wss://forge-fate-relay.your-name.workers.dev"
                style={{ flex: 1, minWidth: 200 }}
                value={joinUrl}
                onChange={(e) => setJoinUrl(e.target.value)}
              />
              <button
                className="btn btn-sm btn-primary"
                disabled={!joinCode.trim() || !joinUrl.trim()}
                onClick={() =>
                  onRelayChange({ url: joinUrl.trim(), room: joinCode.trim().toUpperCase() })
                }
              >
                Join
              </button>
            </div>
          </Panel>
        )}
        <Panel
          title={relay ? `At table ${relay.room}` : 'Take a seat'}
          subtitle="A player's view: your sheet, the fight as it stands, and your next move — queued while the others take their turns."
        >
          {relay && roster.entries.length === 0 ? (
            <p className="muted">
              Connected to room {relay.room} — waiting for the DM's table to answer…
            </p>
          ) : roster.entries.length === 0 ? (
            <p className="muted">No characters built yet. The Builder is where one starts.</p>
          ) : (
            <>
              <input
                type="text"
                className="detail"
                aria-label="Your name"
                placeholder="your name, for the lobby"
                style={{ width: '100%', marginBottom: 8 }}
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
              />
              {roster.entries.map((one) => {
                const taken = seats.find((seat) => seat.rosterId === one.id);
                return (
                  <p key={one.id} className="zone-row">
                    <button
                      className="btn btn-sm"
                      aria-label={`Sit as ${one.build.name || 'Unnamed'}`}
                      onClick={() => onSit(one.id, playerName.trim() || undefined)}
                    >
                      Sit here
                    </button>{' '}
                    <b>{one.build.name || 'Unnamed'}</b>
                    {taken && (
                      <span className="src">
                        {' '}
                        · taken{taken.playerName ? ` by ${taken.playerName}` : ''}
                      </span>
                    )}
                  </p>
                );
              })}
            </>
          )}
          {relay && onRelayChange && (
            <p className="hint" style={{ marginBottom: 0 }}>
              <button className="btn btn-sm" onClick={() => onRelayChange(null)}>
                Leave the table
              </button>
            </p>
          )}
        </Panel>
      </div>
    );
  }

  const name = entry.build.name || 'Unnamed';
  const encounter = activeEncounter(roster);
  const running = isRunning(encounter);
  const me = encounter.combatants.find(
    (c) => c.kind === 'character' && c.rosterId === entry.id,
  );
  const order = sortCombatants(encounter.combatants);
  const active = currentCombatant(encounter);
  const combatantName = (c: Combatant) =>
    c.kind === 'monster'
      ? c.label
      : roster.entries.find((e) => e.id === c.rosterId)?.build.name || 'Unnamed';

  /* How many turns until yours, walking the order from whoever is up. */
  const away = (() => {
    if (!running || !me || !active) return null;
    const from = order.findIndex((c) => c.id === active.id);
    const mine = order.findIndex((c) => c.id === me.id);
    if (from < 0 || mine < 0) return null;
    return (mine - from + order.length) % order.length;
  })();

  const status = !me
    ? 'You are not in this fight — the DM seats you from the Fighters drawer.'
    : !running
      ? 'The fight has not started.'
      : away === 0
        ? 'You’re up!'
        : `${combatantName(active!)} is up — ${away} ${away === 1 ? 'turn' : 'turns'} to yours.`;

  const plan = me ? intentFor(plans, me.id) : undefined;

  /*
    Who a plan may name: living monsters, and under fog only those the party
    has laid eyes on where they stand. `explored` is the fog's memory rather
    than its current sight, so this is a shade more generous than the
    cockpit's veil - the honest cost of a screen with no sight engine, noted
    here and in HISTORY. A hidden monster stays unnameable either way.
  */
  const targets = encounter.combatants.filter(
    (c): c is MonsterCombatant =>
      c.kind === 'monster' &&
      c.hp > 0 &&
      !c.hidden &&
      !(encounter.fog && (!c.at || !(encounter.explored ?? []).includes(keyOf(c.at)))),
  );

  return (
    <div className="stack seat">
      <Panel title={name} subtitle="Your seat at the table. The board stays with the DM; this screen is your hand.">
        <p className={`seat-status${away === 0 ? ' is-up' : ''}`}>{status}</p>
        {running && encounter.round > 0 && (
          <p className="hint" style={{ marginTop: 0 }}>
            Round {encounter.round}.
          </p>
        )}

        {/* §92's queue, from the chair it was built for. */}
        {me && running && away !== 0 && (
          <div className="plan-block">
            <b>When your turn comes</b>
            {plan && (
              <span className="plan-line">
                Queued: {describeIntent(
                  plan,
                  plan.targetId
                    ? targets.find((t) => t.id === plan.targetId)?.label
                    : undefined,
                )}{' '}
                <button
                  className="btn btn-sm"
                  onClick={() => onWithdraw(me.id)}
                >
                  Withdraw
                </button>
              </span>
            )}
            <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <select
                aria-label="What you plan to do"
                value={kind}
                onChange={(e) => setKind(e.target.value as IntentKind)}
              >
                <option value="attack">Attack</option>
                <option value="move">Move</option>
                <option value="dash">Dash</option>
                <option value="dodge">Dodge</option>
                <option value="disengage">Disengage</option>
                <option value="help">Help</option>
                <option value="hide">Hide</option>
                <option value="other">Something else</option>
              </select>
              {kind === 'attack' && (
                <select
                  aria-label="Who you plan to attack"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">— pick a target —</option>
                  {targets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}
              <input
                type="text"
                aria-label="In your own words"
                placeholder="in your own words"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                className="btn btn-sm btn-primary"
                disabled={kind === 'attack' && !target}
                onClick={() => {
                  onQueue({
                    combatantId: me.id,
                    kind,
                    ...(kind === 'attack' && target ? { targetId: target } : {}),
                    ...(note.trim() ? { note: note.trim() } : {}),
                  });
                  setNote('');
                  say?.('Queued. The DM sees it when your turn comes.');
                }}
              >
                Queue it
              </button>
            </span>
          </div>
        )}
        {me && running && away === 0 && plan && (
          <div className="plan-block is-up">
            <b>Your plan</b>
            <span className="plan-line">
              {describeIntent(
                plan,
                plan.targetId ? targets.find((t) => t.id === plan.targetId)?.label : undefined,
              )}
            </span>
            <p className="hint" style={{ margin: 0 }}>
              It is in the DM’s cockpit — the table runs it.
            </p>
          </div>
        )}
      </Panel>

      {/* The sheet's play surface: their own hit points, slots and
          conditions, written to the same roster the battle reads. */}
      <PlayCard
        ctx={ctx}
        play={entry.play}
        onPlayChange={(next) => onPlay(entry.id, next)}
      />

      <p className="hint seat-leave">
        <button className="btn btn-sm" onClick={() => onSeatChange(null)}>
          Leave the seat
        </button>{' '}
        The character stays; only the chair empties.
      </p>
    </div>
  );
}
