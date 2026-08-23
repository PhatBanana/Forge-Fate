/**
 * §95: the same relay as server.mjs, shaped for Cloudflare Workers.
 *
 * One Durable Object per room code: every websocket that joins a room is
 * forwarded every text message the others send, and nothing is stored.
 * Deploy with wrangler (see relay/README.md) and point the app's relay
 * URL at wss://<your-worker>.<your-subdomain>.workers.dev.
 */
import { MAX_FRAME, MAX_MEMBERS, canonical, isRoomCode } from './limits.mjs';

export default {
  async fetch(request, env) {
    /*
      §117: upper-cased before it names anything. `idFromName` is
      case-sensitive, so without this a link whose case got touched on
      the way - a chat client, a QR reader - addresses a different
      Durable Object, and that phone sits alone in a room of one.
    */
    const raw = new URL(request.url).searchParams.get('room');
    const room = raw ? canonical(raw) : null;
    /*
      §135: shaped like a room code, or it never names a Durable Object.
      This is the check that matters most here - `idFromName` on unfiltered
      input means anyone scanning the URL can spin up a DO instance per
      guess against this account's quota. A regex is the whole defence.
    */
    if (!room || !isRoomCode(room)) {
      return new Response('a room code is required', { status: 400 });
    }
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected a websocket', { status: 426 });
    }
    const id = env.ROOMS.idFromName(room);
    return env.ROOMS.get(id).fetch(request);
  },
};

export class Room {
  constructor(state) {
    this.state = state;
  }

  async fetch() {
    // §135: a table is a DM and their players. Refused with a status
    // rather than a socket, so the joiner is told rather than left waiting.
    if (this.state.getWebSockets().length >= MAX_MEMBERS) {
      return new Response('this room is full', { status: 503 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(sender, message) {
    if (typeof message !== 'string') return;
    /* §135: the same cap the app applies on the way in - the guard was
       one-sided without it, since a client refuses to read a frame this
       big but the relay would push one at every phone in the room first.
       Dropped, not closed on. */
    if (message.length > MAX_FRAME) return;
    for (const socket of this.state.getWebSockets()) {
      if (socket !== sender) {
        try {
          socket.send(message);
        } catch {
          // A member mid-disconnect; the room goes on.
        }
      }
    }
  }
}
