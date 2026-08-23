# The relay

A room that forwards and forgets: every message a member sends is delivered
to every other member of the same `?room=CODE`, verbatim. No storage, no
accounts, no knowledge of the app's protocol - that lives in `src/sync.ts`.
The room code is the whole secret, minted unguessable by the app.

Two interchangeable rooms:

## On the laptop at the table

    npm install
    node relay/server.mjs --port 4390

Point the app's relay URL at `ws://<the-laptop's-address>:4390` (find it
with `ipconfig` / `ip addr`; everyone must be on the same network). Note
that a page served over **https** (GitHub Pages) can only open **wss:**
sockets - so the laptop relay pairs with a locally served app, or put a
TLS proxy in front of it. The cloud worker below avoids all of that.

## In the cloud (Cloudflare Workers, free tier)

    cd relay
    npx -y wrangler@4 deploy

Point the app's relay URL at `wss://forge-fate-relay.<your-subdomain>.workers.dev`.
Durable Objects on the free plan cover a table's worth of traffic easily —
they must be the SQLite-backed kind (`new_sqlite_classes` in wrangler.toml;
the free plan admits no other, and this room stores nothing anyway).

**This project's instance** is deployed and live:

    wss://forge-fate-relay.phatbanana.workers.dev

Anyone running the app from GitHub Pages can use it as the relay URL. It
forwards and forgets like every other room; being on the free plan, if it
ever goes over quota it stops until the day rolls over rather than costing
anyone anything. `scratchpad/setup-relay.sh` is the wizard that walks a
human through deploying their own.

## What it refuses (§135)

The room code is the whole secret - no accounts, nothing stored - so there
is no auth to add without giving the app a second secret to carry. What the
relay does instead is turn away traffic no table ever produces. All of it is
invisible to a game in progress, and all of it lives in `limits.mjs` so the
Node relay and the Worker cannot drift apart:

| Limit | Why |
|---|---|
| The code must match `[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}` | The shape `newRoomCode()` mints. A probe never names a Durable Object, so scanning costs this account nothing - and a mistyped code is refused rather than silently seating somebody in a room of one. |
| 12 sockets per room | A table is a DM and their players. The number is generous because the cost of being wrong is a real person who cannot join. |
| 1 MB per frame, dropped not closed on | The same cap the app applies on the way in. Without it the guard was one-sided: a client refuses to *read* a frame this big, but the relay would push one at every phone first. |

Note the alphabet omits `0`, `O`, `1`, `I` and `L`, so a code with any of
them in it is not a code. Two of this repo's own test fixtures had to be
renamed when the check went in, which is a fair illustration of the point.

Rate limiting per IP is left to Cloudflare's own dashboard rules rather than
to code: it is a control the platform already has, and putting a counter in
the Durable Object would cost storage that this relay deliberately does not
use.

## In the app

The DM opens the battle screen's **Prep** drawer → *The table*: set the
relay URL, press *Open the table*, and hand each player their seat link.
A player on a phone just opens the link - it carries the seat, the room
and the relay in its fragment.
