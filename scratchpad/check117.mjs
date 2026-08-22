/**
 * §117: isolation, proven against the DEPLOYED worker rather than the
 * Node relay the CI test covers. Two rooms, four sockets, one live
 * Cloudflare instance - plus the case rule, which is the one that
 * silently splits a table in half.
 *
 * Run by hand: node scratchpad/check117.mjs
 */
import { WebSocket } from 'ws';

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

// Unique per run: a stale member of a fixed code would poison the result.
const stamp = Math.random().toString(36).slice(2, 8).toUpperCase();
const A = `A${stamp}`;
const B = `B${stamp}`;

const [dmA, playerA, dmB, playerB] = await Promise.all([join(A), join(A), join(B), join(B)]);
dmA.say('table A');
dmB.say('table B');
await settle();

say(playerA.heard.join() === 'table A', `room ${A} heard its own message`);
say(playerB.heard.join() === 'table B', `room ${B} heard its own message`);
say(dmA.heard.length === 0, `room ${A}'s DM heard nothing from ${B} (no bleedover)`);
say(dmB.heard.length === 0, `room ${B}'s DM heard nothing from ${A} (no bleedover)`);

// The case rule, live: idFromName is case-sensitive without it.
const C = `C${stamp}`;
const [upper, lower] = await Promise.all([join(C), join(C.toLowerCase())]);
upper.say('same table?');
await settle();
say(lower.heard.join() === 'same table?', 'a lower-cased code reaches the same room');

for (const s of [dmA, playerA, dmB, playerB, upper, lower]) s.socket.close();
console.log(problems.length ? `\n${problems.length} FAILED` : '\nall good');
process.exit(problems.length ? 1 : 0);
