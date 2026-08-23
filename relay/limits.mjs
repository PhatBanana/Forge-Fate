/**
 * §135: what a relay refuses.
 *
 * The room code is the whole secret (§95) and that is deliberate - there are
 * no accounts, nothing is stored, and a code shouted across a table is the
 * entire join. Auth would mean a second secret the app has to carry, which
 * buys little when the first one is already unguessable at ~30 bits.
 *
 * What the relay *can* do without the app knowing anything about it is
 * refuse the traffic no real table ever produces. Every limit here is
 * invisible to a game in progress and expensive to whoever is not playing
 * one. They live in one file so the Node relay and the Worker cannot drift:
 * two implementations of the same room that disagree about what is allowed
 * is the kind of difference that only shows up at somebody's table.
 */

/**
 * A room code, exactly as `newRoomCode()` mints them: six characters from an
 * alphabet with no 0/O or 1/I/L to squint at (`src/sync.ts`). Checked after
 * upper-casing, because that is the canonical spelling (§117).
 *
 * This is the cheap half of the hardening and the valuable one. A probe that
 * does not match never names a Durable Object, so scanning the relay costs
 * the scanner a request and costs this account nothing. It also turns a
 * mistyped code into a refusal instead of a silent room of one, which is the
 * failure §117 spent a section chasing.
 */
export const ROOM_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

/**
 * The largest frame a relay will forward, matching the cap the app already
 * applies on the way in (`MAX_FRAME`, §100).
 *
 * Without it the guard was one-sided: a client refuses to *read* a frame
 * over a megabyte, but the relay would happily push one at every phone in
 * the room first. Oversized frames are dropped rather than closed on - a
 * table whose roster has grown large should lose the broadcast, not the
 * connection.
 */
export const MAX_FRAME = 1_000_000;

/**
 * How many sockets one room admits. A table is a DM and their players; the
 * number is generous on purpose, because the cost of being wrong is a real
 * person who cannot join, and the thing being defended against is not a
 * thirteenth friend but a script opening ten thousand sockets.
 */
export const MAX_MEMBERS = 12;

/** Whether this is a room code at all, canonical spelling assumed. */
export const isRoomCode = (room) => typeof room === 'string' && ROOM_PATTERN.test(room);

/** One canonical spelling of a room code. The alphabet it is minted from
    has no lower case; anything else arrived through something that touched
    it - a chat client, a QR reader, somebody retyping it. */
export const canonical = (room) => room.trim().toUpperCase();
