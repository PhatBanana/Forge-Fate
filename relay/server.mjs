/**
 * §95: the relay - a room that forwards and forgets.
 *
 * The whole server: a websocket endpoint where `?room=CODE` names a room,
 * and every message a member sends is forwarded verbatim to every other
 * member of the same room. No storage, no accounts, no parsing of the
 * payload - the protocol lives entirely in the app (src/sync.ts), and the
 * room code is the whole secret. This is a networked BroadcastChannel and
 * nothing more, which is exactly what §94's design asks of a network.
 *
 * Run it on the laptop at the table:
 *
 *     npm install          # ws is a devDependency
 *     node relay/server.mjs --port 4390
 *
 * and point the app's relay URL at ws://<that-laptop>:<port>. For a room
 * in the cloud instead, deploy relay/worker.js - same behaviour, same
 * protocol, interchangeable.
 *
 * §117: **rooms are independent, and that is the property worth
 * testing.** One relay carries as many tables as ask for it; a message
 * reaches the other members of its own room and nobody else. The room
 * code is the whole partition, so it is canonicalised on the way in -
 * two spellings of a code would otherwise be two tables, which is how a
 * table splits in half without anybody seeing why.
 */
import { WebSocketServer } from 'ws';
import { MAX_FRAME, MAX_MEMBERS, canonical, isRoomCode } from './limits.mjs';

/**
 * Start the relay. Exported so a test can run one on an ephemeral port
 * and prove what matters: that two rooms on one server never hear each
 * other, and that a room is forgotten when its last member leaves.
 */
export function startRelay({ port = 4390 } = {}) {
  const rooms = new Map(); // room code -> Set<socket>
  const server = new WebSocketServer({ port });

  server.on('connection', (socket, request) => {
    const raw = new URL(request.url ?? '/', 'ws://relay').searchParams.get('room');
    const room = raw ? canonical(raw) : null;
    /* §135: shaped like a room code, or it never names a room. A probe
       costs the prober a request and this relay a regex. */
    if (!room || !isRoomCode(room)) {
      socket.close(4000, 'a room code is required');
      return;
    }
    let members = rooms.get(room);
    if (!members) rooms.set(room, (members = new Set()));
    // §135: a table is a DM and their players, not ten thousand sockets.
    if (members.size >= MAX_MEMBERS) {
      socket.close(4001, 'this room is full');
      return;
    }
    members.add(socket);

    socket.on('message', (data, isBinary) => {
      if (isBinary) return; // the protocol is JSON text; anything else is noise
      /* §135: the same cap the app applies on the way in. Dropped rather
         than closed on: a table whose roster has grown large should lose
         the broadcast, not the connection. */
      if (data.length > MAX_FRAME) return;
      // `members` is this room's set and no other: the isolation is the
      // partition itself rather than a check on the way out.
      for (const other of members) {
        if (other !== socket && other.readyState === other.OPEN) {
          other.send(data.toString());
        }
      }
    });
    socket.on('close', () => {
      members.delete(socket);
      if (members.size === 0) rooms.delete(room);
    });
    socket.on('error', () => socket.close());
  });

  return {
    /** The port actually bound, which an ephemeral request does not know. */
    port: () => server.address().port,
    /** How many rooms are standing - the test's window on the partition. */
    rooms: () => rooms.size,
    close: () => new Promise((done) => server.close(done)),
  };
}

// Run directly rather than imported: `node relay/server.mjs --port 4390`.
if (process.argv[1]?.endsWith('server.mjs')) {
  const port = Number(process.argv[process.argv.indexOf('--port') + 1] || 4390);
  startRelay({ port });
  console.log(`relay listening on ws://localhost:${port} - rooms forward and forget`);
}
