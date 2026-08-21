import { useState } from 'react';
import { Panel } from './shared';
import { QrSvg } from './QrSvg';
import { newRoomCode } from '../sync';
import type { RelayConfig } from '../sync';
import { seatUrl } from '../share';
import type { Seat } from '../seats';

/**
 * §108: the table - the room phones join, and the invitations they join
 * with (§95, §96, §101).
 *
 * Peeled off the battle screen because nothing else on it reads any of
 * this. Two pieces of typing state came along, which is what makes it a
 * module rather than a moved block: the relay URL being entered before
 * a table exists, and which seat's QR is open. The screen above hands
 * in the room, the chairs and the guest list, and takes back one
 * decision - open this table, or close it.
 */
export function TablePanel({
  relay,
  onRelayChange,
  seats,
  entries,
}: {
  /** The room this table is meeting in, or null before one is opened. */
  relay: RelayConfig | null;
  /** Open a table (a fresh room code) or close it. */
  onRelayChange: (relay: RelayConfig | null) => void;
  /** Who has taken which chair, for the lobby line. */
  seats: Seat[];
  /** Everyone who could be handed an invitation, named. */
  entries: { id: string; name: string }[];
}) {
  const [relayUrl, setRelayUrl] = useState('');
  /** Which seat's invitation is showing as a QR, one at a time. */
  const [qrSeat, setQrSeat] = useState<string | null>(null);

  return (
      <Panel
        title="The table"
        subtitle="Phones join over a relay — a room that forwards and forgets. relay/README.md ships two you can run."
      >
        {!relay ? (
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <input
              type="text"
              className="detail"
              aria-label="Relay URL"
              placeholder="wss://forge-fate-relay.your-name.workers.dev"
              style={{ flex: 1, minWidth: 220 }}
              value={relayUrl}
              onChange={(e) => setRelayUrl(e.target.value)}
            />
            <button
              className="btn btn-sm btn-primary"
              disabled={!relayUrl.trim()}
              onClick={() => onRelayChange({ url: relayUrl.trim(), room: newRoomCode() })}
            >
              Open the table
            </button>
          </div>
        ) : (
          <>
            {/* §96: the Jackbox screen - a code big enough to read across
                the table. Phones join with it from Take a seat; the links
                below still carry everything for the ones far away. */}
            <div className="room-code" aria-label="Room code">
              {relay.room}
            </div>
            {seats.length > 0 && (
              <p className="hint" style={{ marginTop: 0 }}>
                Seated:{' '}
                {seats
                  .map((seat) => {
                    const who = entries.find((e) => e.id === seat.rosterId);
                    const name = who?.name ?? 'Unnamed';
                    return seat.playerName ? `${name} — ${seat.playerName}` : name;
                  })
                  .join(' · ')}
              </p>
            )}
            <p className="hint" style={{ marginTop: 0 }}>
              Players join with the code from Take a seat, or by link — it carries
              the seat, the room and the relay in one.
            </p>
            {entries.map((entry) => {
              const name = entry.name;
              const link = seatUrl(entry.id, relay);
              return (
                <div key={entry.id} className="zone-row seat-invite">
                  <p className="row" style={{ gap: 6, alignItems: 'center', margin: 0 }}>
                    <b>{name}</b>{' '}
                    <input
                      type="text"
                      className="detail"
                      readOnly
                      aria-label={`Seat link for ${name}`}
                      style={{ flex: 1, minWidth: 120 }}
                      value={link}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    {/* §101: the share sheet, where the platform has one -
                        texting a link to the player who stayed home. */}
                    {typeof navigator !== 'undefined' && !!navigator.share && (
                      <button
                        className="btn btn-sm"
                        onClick={() => {
                          navigator
                            .share({ title: `${name}'s seat at the table`, url: link })
                            .catch(() => {
                              // Cancelled is not an error anyone needs told about.
                            });
                        }}
                      >
                        Share
                      </button>
                    )}
                    {/* §101: the QR, which needs no platform at all - the
                        phone across the table points its camera at this
                        screen. Third-party QR services were never an
                        option: the link carries the room code, and the
                        room code is the whole secret (§95). */}
                    <button
                      className="btn btn-sm"
                      aria-pressed={qrSeat === entry.id}
                      onClick={() => setQrSeat(qrSeat === entry.id ? null : entry.id)}
                    >
                      QR
                    </button>
                  </p>
                  {qrSeat === entry.id && (
                    <div className="seat-qr">
                      <QrSvg text={link} label={`QR code of ${name}'s seat link`} />
                      <p className="hint">
                        {name}'s whole invitation — scan it with the phone's camera.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
            <button className="btn btn-sm" onClick={() => onRelayChange(null)}>
              Close the table
            </button>
          </>
        )}
      </Panel>
    );
}
