var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// limits.mjs
var ROOM_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
var MAX_FRAME = 1e6;
var MAX_MEMBERS = 12;
var isRoomCode = /* @__PURE__ */ __name((room) => typeof room === "string" && ROOM_PATTERN.test(room), "isRoomCode");
var canonical = /* @__PURE__ */ __name((room) => room.trim().toUpperCase(), "canonical");

// worker.js
var worker_default = {
  async fetch(request, env) {
    const raw = new URL(request.url).searchParams.get("room");
    const room = raw ? canonical(raw) : null;
    if (!room || !isRoomCode(room)) {
      return new Response("a room code is required", { status: 400 });
    }
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected a websocket", { status: 426 });
    }
    const id = env.ROOMS.idFromName(room);
    return env.ROOMS.get(id).fetch(request);
  }
};
var Room = class {
  static {
    __name(this, "Room");
  }
  constructor(state) {
    this.state = state;
  }
  async fetch() {
    if (this.state.getWebSockets().length >= MAX_MEMBERS) {
      return new Response("this room is full", { status: 503 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(sender, message) {
    if (typeof message !== "string") return;
    if (message.length > MAX_FRAME) return;
    for (const socket of this.state.getWebSockets()) {
      if (socket !== sender) {
        try {
          socket.send(message);
        } catch {
        }
      }
    }
  }
};
export {
  Room,
  worker_default as default
};
//# sourceMappingURL=worker.js.map
