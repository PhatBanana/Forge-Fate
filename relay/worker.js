/**
 * §95: the same relay as server.mjs, shaped for Cloudflare Workers.
 *
 * One Durable Object per room code: every websocket that joins a room is
 * forwarded every text message the others send, and nothing is stored.
 * Deploy with wrangler (see relay/README.md) and point the app's relay
 * URL at wss://<your-worker>.<your-subdomain>.workers.dev.
 */
export default {
  async fetch(request, env) {
    const room = new URL(request.url).searchParams.get('room');
    if (!room) return new Response('a room code is required', { status: 400 });
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
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(sender, message) {
    if (typeof message !== 'string') return;
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
