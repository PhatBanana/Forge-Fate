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

## In the app

The DM opens the battle screen's **Prep** drawer → *The table*: set the
relay URL, press *Open the table*, and hand each player their seat link.
A player on a phone just opens the link - it carries the seat, the room
and the relay in its fragment.
