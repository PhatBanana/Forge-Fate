import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { startRelay } from './server.mjs';

/**
 * §117: the relay carries as many tables as ask for it, and they do not
 * hear each other.
 *
 * Real sockets against a real server on an ephemeral port, because the
 * property being asserted is about a running relay rather than about a
 * function: two rooms, four members, and a message that must reach
 * exactly one other person.
 */

let relay;
const open = [];

/** A member of a room, connected and ready, collecting what it hears. */
const join = (room) =>
  new Promise((done, fail) => {
    const socket = new WebSocket(`ws://localhost:${relay.port()}/?room=${room}`);
    const heard = [];
    socket.on('message', (data) => heard.push(data.toString()));
    socket.on('open', () => done({ socket, heard, say: (t) => socket.send(t) }));
    socket.on('error', fail);
    open.push(socket);
  });

/** Long enough for a forwarded frame to have arrived on loopback. */
const settle = () => new Promise((done) => setTimeout(done, 60));

beforeEach(() => {
  relay = startRelay({ port: 0 });
});

afterEach(async () => {
  for (const socket of open.splice(0)) socket.close();
  await relay.close();
});

describe('two tables on one relay', () => {
  it('keeps their traffic apart entirely', async () => {
    const [dmA, playerA, dmB, playerB] = await Promise.all([
      join('AAAAAA'),
      join('AAAAAA'),
      join('BBBBBB'),
      join('BBBBBB'),
    ]);
    expect(relay.rooms()).toBe(2);

    dmA.say('table A: the goblin swings');
    dmB.say('table B: the dragon lands');
    await settle();

    // Each message reached the other member of its own room...
    expect(playerA.heard).toEqual(['table A: the goblin swings']);
    expect(playerB.heard).toEqual(['table B: the dragon lands']);
    // ...and neither DM heard anything at all: not their own message,
    // and not one syllable of the other table's.
    expect(dmA.heard).toEqual([]);
    expect(dmB.heard).toEqual([]);
  });

  it('never echoes a message back to the member who sent it', async () => {
    const [one, two] = await Promise.all([join('CCCCCC'), join('CCCCCC')]);
    one.say('hello');
    await settle();
    expect(two.heard).toEqual(['hello']);
    expect(one.heard).toEqual([]);
  });

  it('scales to many rooms without leaking between any of them', async () => {
    const codes = ['R1', 'R2', 'R3', 'R4', 'R5'];
    const pairs = await Promise.all(
      codes.map(async (code) => ({ code, a: await join(code), b: await join(code) })),
    );
    expect(relay.rooms()).toBe(codes.length);

    for (const { code, a } of pairs) a.say(`from ${code}`);
    await settle();

    for (const { code, a, b } of pairs) {
      expect(b.heard).toEqual([`from ${code}`]);
      expect(a.heard).toEqual([]);
    }
  });
});

describe('the room code is the whole partition', () => {
  it('treats one code in any case as one table', async () => {
    // A link whose case got touched on the way must not open a second,
    // silent room: the phone that joins it has to land at the table.
    const [dm, player] = await Promise.all([join('KWXR7N'), join('kwxr7n')]);
    expect(relay.rooms()).toBe(1);

    dm.say('are you there?');
    await settle();
    expect(player.heard).toEqual(['are you there?']);
  });

  it('refuses a socket that names no room at all', async () => {
    const closed = await new Promise((done) => {
      const socket = new WebSocket(`ws://localhost:${relay.port()}/`);
      socket.on('close', (code) => done(code));
      socket.on('error', () => {});
      open.push(socket);
    });
    expect(closed).toBe(4000);
    expect(relay.rooms()).toBe(0);
  });
});

describe('forwarding and forgetting', () => {
  it('drops a room the moment its last member leaves', async () => {
    const one = await join('EMPTY1');
    expect(relay.rooms()).toBe(1);
    one.socket.close();
    await settle();
    expect(relay.rooms()).toBe(0);
  });

  it('ignores a binary frame - the protocol is text', async () => {
    const [sender, other] = await Promise.all([join('BINARY'), join('BINARY')]);
    sender.socket.send(Buffer.from([1, 2, 3]));
    sender.say('but text still travels');
    await settle();
    expect(other.heard).toEqual(['but text still travels']);
  });
});
