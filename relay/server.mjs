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
 */
import { WebSocketServer } from 'ws';

const port = Number(process.argv[process.argv.indexOf('--port') + 1] || 4390);
const rooms = new Map(); // room code -> Set<socket>

const server = new WebSocketServer({ port });
server.on('connection', (socket, request) => {
  const room = new URL(request.url ?? '/', 'ws://relay').searchParams.get('room');
  if (!room) {
    socket.close(4000, 'a room code is required');
    return;
  }
  let members = rooms.get(room);
  if (!members) rooms.set(room, (members = new Set()));
  members.add(socket);

  socket.on('message', (data, isBinary) => {
    if (isBinary) return; // the protocol is JSON text; anything else is noise
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

console.log(`relay listening on ws://localhost:${port} - rooms forward and forget`);
