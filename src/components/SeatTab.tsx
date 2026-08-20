import { useMemo, useState } from 'react';
import { Panel } from './shared';
import { PlayCard } from './PlayCard';
import { PlanComposer } from './PlanComposer';
import { deriveBuild } from '../engine/character';
import { currentCombatant, isRunning, sortCombatants } from '../encounter';
import type { Combatant, MonsterCombatant } from '../encounter';
import { activeEncounter } from '../storage';
import type { Roster } from '../storage';
import { describeIntent, intentFor } from '../seats';
import type { Intent, Seat } from '../seats';
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
  linkUp = true,
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
  /** §97: whether the line to the table is up. The relay says; the
      same-browser broadcast never goes down. */
  linkUp?: boolean;
  say?: Say;
}) {
  /* §96: the join block's scratch. The relay URL is remembered from the
     last table this device sat at; the code is what friends shout. */
  const [joinCode, setJoinCode] = useState('');
  const [joinUrl, setJoinUrl] = useState(lastRelayUrl);
  const [playerName, setPlayerName] = useState('');

  const entry = roster.entries.find((e) => e.id === seatId);
  const ctx = useMemo(() => (entry ? deriveBuild(entry.build) : null), [entry]);

  /* §97: the truth about the line, where the player can see it. A strip,
     not a lock - the sheet stays usable, because marks made now are kept
     by the wire and re-said when the line returns. A plan is the one
     thing that is not: an op is never replayed (§95's rule), so it says
     to queue it again. */
  const offline = relay && !linkUp && (
    <div className="seat-offline" role="status">
      The line to the table is down — reconnecting. Marks you make here are
      kept and said again when it returns; a plan queued now does not
      travel, so queue it again when the line is back.
    </div>
  );

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
        {offline}
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
      {offline}
      <Panel title={name} subtitle="Your seat at the table. The board stays with the DM; this screen is your hand.">
        <p className={`seat-status${away === 0 ? ' is-up' : ''}`}>{status}</p>
        {running && encounter.round > 0 && (
          <p className="hint" style={{ marginTop: 0 }}>
            Round {encounter.round}.
          </p>
        )}

        {/* §92's queue, from the chair it was built for - §105's shared
            composer, in the seat's voice. The target list stays this
            screen's own policy (§93, recorded): the fog's memory, a shade
            more generous than the cockpit's live sight. */}
        {me && running && away !== 0 && (
          <PlanComposer
            title="When your turn comes"
            perspective="seat"
            combatantId={me.id}
            targets={targets.map((t) => ({ id: t.id, label: t.label }))}
            castable={ctx.spellcasting.castable}
            plan={plan}
            onQueue={(intent) => {
              onQueue(intent);
              say?.('Queued. The DM sees it when your turn comes.');
            }}
            onWithdraw={onWithdraw}
          />
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
