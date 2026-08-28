import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';
const RELAY = 'ws://localhost:4392';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §151. The QR beside the room code: the DM opens the table and the room
  code stands with a QR at its side - the unnamed invitation. A phone
  "scans" it (goes where it points) and lands on the picker, already at
  that table, free to choose any chair.
*/
const relay = spawn('node', ['relay/server.mjs', '--port', '4392'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

const browser = await chromium.launch({ executablePath: EXE });

for (const theme of ['dark', 'light']) {
  const ctxA = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const dm = await ctxA.newPage();
  const errors = [];
  dm.on('console', (m) => { if (m.type() === 'error') errors.push(`A: ${m.text()}`); });
  await dm.addInitScript((t) => { localStorage.setItem('dnd-forge:theme:v1', t); }, theme);

  await dm.goto(BASE, { waitUntil: 'networkidle' });
  await dm.getByRole('button', { name: /use these rules/i }).first().click();
  await dm.waitForTimeout(400);
  await dm.getByRole('button', { name: /show me an example/i }).first().click();
  await dm.waitForTimeout(900);
  await dm.locator('.gbar-home').first().click();
  await dm.waitForTimeout(600);
  await dm.getByRole('button', { name: /run a battle|resume the fight/i }).first().click();
  await dm.waitForTimeout(1200);
  await dm.locator('.btl-bar').getByRole('button', { name: 'Prep' }).click();
  await dm.waitForTimeout(500);
  await dm.getByLabel('Relay URL').fill(RELAY);
  await dm.getByRole('button', { name: /open the table/i }).click();
  await dm.waitForTimeout(600);

  const code = (await dm.locator('.room-code').textContent())?.trim() ?? '';
  say(/^[A-Z2-9]{6}$/.test(code), `${theme}: the room code stands - ${code}`);

  // The QR at the code's side, one .room-join holding both.
  const qr = dm.locator('.room-join svg.qr');
  say((await qr.count()) === 1, `${theme}: a QR stands beside the room code`);
  const box = await qr.boundingBox();
  say(!!box && box.width > 100, `${theme}: the QR is sized for a camera (${box?.width}px)`);
  const encoded = (await qr.getAttribute('data-encodes')) ?? '';
  say(
    encoded.includes(`table=${code}`) && encoded.includes('seat=&'),
    `${theme}: it encodes the unnamed invitation - ${encoded}`,
  );
  await dm.screenshot({ path: `scratchpad/run151-dm-${theme}.png` });

  // ------------------- the "scan": a phone goes where the QR points
  const ctxB = await browser.newContext({ viewport: { width: 380, height: 820 } });
  const phone = await ctxB.newPage();
  phone.on('console', (m) => { if (m.type() === 'error') errors.push(`B: ${m.text()}`); });
  await phone.addInitScript((t) => { localStorage.setItem('dnd-forge:theme:v1', t); }, theme);
  await phone.goto(encoded.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: 'networkidle' });
  await phone.waitForTimeout(1200);
  const body = await phone.locator('body').innerText();
  // Panel titles render uppercased - match case-insensitively (§91/§96).
  say(/at table/i.test(body), `${theme}: the scanned phone is at the table`);
  say(new RegExp(code, 'i').test(body), `${theme}: at THIS table - the code is named`);
  const sit = phone.getByRole('button', { name: /sit as/i });
  say((await sit.count()) > 0, `${theme}: with the chairs open to pick from`);
  await phone.screenshot({ path: `scratchpad/run151-phone-${theme}.png` });

  say(errors.length === 0, `${theme}: no console errors${errors.length ? ' - ' + errors.join(' | ') : ''}`);
  await ctxB.close();
  await ctxA.close();
}

await browser.close();
relay.kill();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll clear.');
process.exit(problems.length ? 1 : 0);
