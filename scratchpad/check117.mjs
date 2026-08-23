/**
 * The relay's properties, proven against the DEPLOYED worker rather than
 * the Node relay the CI test covers.
 *
 * §117 established why this script exists: `relay.test.mjs` runs against
 * `server.mjs`, and the Worker is a *second implementation* of the same
 * room. Two implementations that have never been compared are two
 * implementations that can disagree, and the disagreement shows up at
 * somebody's table rather than in CI.
 *
 * §136 extends it to §135's limits, which have exactly that shape: the
 * Worker counts members with `this.state.getWebSockets().length` where the
 * Node relay counts a `Set`, and caps a frame on `message.length` where the
 * Node relay reads `data.length`. Same rule, different code, never checked
 * against each other until now.
 *
 * Run by hand after `wrangler deploy`: node scratchpad/check117.mjs
 */
import { WebSocket } from 'ws';
import { MAX_FRAME, MAX_MEMBERS } from '../relay/limits.mjs';

const RELAY = 'wss://forge-fate-relay.phatbanana.workers.dev';
const problems = [];
const say = (ok, what) => {
  console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`);
  if (!ok) problems.push(what);
};

const join = (room) =>
  new Promise((done, fail) => {
    const socket = new WebSocket(`${RELAY}/?room=${room}`);
    const heard = [];
    socket.on('message', (d) => heard.push(d.toString()));
    socket.on('open', () => done({ socket, heard, say: (t) => socket.send(t) }));
    socket.on('error', fail);
  });
const settle = (ms = 900) => new Promise((r) => setTimeout(r, ms));

/**
 * Join, and report whether the socket is up afterwards instead of throwing.
 *
 * A refusal is not an exception here: the Worker turns a full room away
 * with a 503 rather than a websocket, and a code of the wrong shape never
 * reaches the room at all. Both are answers, so both are awaited.
 */
const tryJoin = async (room) => {
  const socket = new WebSocket(`${RELAY}/?room=${room}`);
  socket.on('error', () => undefined);
  await settle(1200);
  return { opened: socket.readyState === WebSocket.OPEN, socket };
};

/*
  Unique per run: a stale member of a fixed code would poison the result.
  Drawn from the room alphabet rather than base36, because §135 made the
  relay refuse anything that is not shaped like a real code - and base36
  produces 0, 1, I, L and O, every one of which the alphabet omits.
*/
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const stamp = (n) =>
  Array.from({ length: n }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
const A = `A${stamp(5)}`;
const B = `B${stamp(5)}`;

const [dmA, playerA, dmB, playerB] = await Promise.all([join(A), join(A), join(B), join(B)]);
dmA.say('table A');
dmB.say('table B');
await settle();

say(playerA.heard.join() === 'table A', `room ${A} heard its own message`);
say(playerB.heard.join() === 'table B', `room ${B} heard its own message`);
say(dmA.heard.length === 0, `room ${A}'s DM heard nothing from ${B} (no bleedover)`);
say(dmB.heard.length === 0, `room ${B}'s DM heard nothing from ${A} (no bleedover)`);

// The case rule, live: idFromName is case-sensitive without it.
const C = `C${stamp(5)}`;
const [upper, lower] = await Promise.all([join(C), join(C.toLowerCase())]);
upper.say('same table?');
await settle();
say(lower.heard.join() === 'same table?', 'a lower-cased code reaches the same room');

/*
  §135's member cap. The one number a real table could plausibly meet, so
  it is worth knowing the deployed Worker agrees with the Node relay about
  where the line is rather than assuming it.
*/
const D = `D${stamp(5)}`;
const crowd = [];
for (let i = 0; i < MAX_MEMBERS; i++) crowd.push(await tryJoin(D));
say(
  crowd.every((m) => m.opened),
  `room ${D} seated all ${MAX_MEMBERS} of a full table`,
);
const turnedAway = await tryJoin(D);
say(!turnedAway.opened, `room ${D} turned the ${MAX_MEMBERS + 1}th away`);

/*
  §135's frame cap, and the half of it that matters: the frame is dropped,
  the socket is not. An oversized broadcast must cost the broadcast rather
  than the table, or one large roster ends the session.
*/
const E = `E${stamp(5)}`;
const [sender, listener] = await Promise.all([join(E), join(E)]);
sender.say('x'.repeat(MAX_FRAME + 1));
await settle();
say(listener.heard.length === 0, 'an oversized frame is not forwarded');
sender.say('and the table plays on');
await settle();
say(listener.heard.join() === 'and the table plays on', 'the socket survives the oversized frame');

for (const s of [dmA, playerA, dmB, playerB, upper, lower, sender, listener]) s.socket.close();
for (const m of [...crowd, turnedAway]) m.socket.close();
console.log(problems.length ? `\n${problems.length} FAILED` : '\nall good');
process.exit(problems.length ? 1 : 0);
