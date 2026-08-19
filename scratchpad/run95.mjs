import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';
const RELAY = 'ws://localhost:4390';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §95. The relay, end to end: the DM opens the table from the Prep drawer,
  hands a seat link across, and a phone in a SEPARATE browser context -
  separate storage, separate everything, a genuinely different device as
  far as the app can tell - joins over a real websocket relay, receives
  the whole fight on hello, queues a plan, and watches its turn arrive.
*/
const relay = spawn('node', ['relay/server.mjs', '--port', '4390'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

const browser = await chromium.launch({ executablePath: EXE });

for (const theme of ['dark', 'light']) {
  // ------------------------------------------------- context A: the DM
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
  await dm.locator('.btl-bar').getByRole('button', { name: 'Fighters' }).click();
  await dm.waitForTimeout(600);
  await dm.locator('.btl-drawer button').filter({ hasText: 'Example Fighter' }).first().click();
  await dm.waitForTimeout(400);
  await dm.getByLabel(/search the bestiary/i).fill('goblin');
  await dm.waitForTimeout(400);
  const entry = dm.locator('.mon-list li').filter({ has: dm.locator('b', { hasText: /^Goblin$/ }) });
  await entry.getByRole('button', { name: 'Add' }).click();
  await dm.waitForTimeout(400);
  await dm.locator('.btl-bar').getByRole('button', { name: 'Order' }).click();
  await dm.waitForTimeout(500);
  await dm.getByLabel('Goblin initiative').fill('20');
  await dm.getByLabel('Example Fighter initiative').fill('10');
  await dm.keyboard.press('Escape');
  await dm.waitForTimeout(300);

  // -------------------------------- the table opens from the Prep drawer
  await dm.locator('.btl-bar').getByRole('button', { name: 'Prep' }).click();
  await dm.waitForTimeout(500);
  await dm.getByLabel('Relay URL').fill(RELAY);
  await dm.getByRole('button', { name: /open the table/i }).click();
  await dm.waitForTimeout(600);
  const seatLink = await dm
    .getByLabel('Seat link for Example Fighter')
    .inputValue();
  say(
    /#seat=.+&table=[A-Z2-9]{6}&relay=/.test(seatLink),
    `${theme}: the invitation carries the seat, the room and the relay`,
  );
  await dm.keyboard.press('Escape');
  await dm.waitForTimeout(300);
  await dm.getByRole('button', { name: /start the fight/i }).click();
  await dm.waitForTimeout(600);

  // ------------------- context B: a different device follows the link in
  const ctxB = await browser.newContext({ viewport: { width: 380, height: 820 } });
  const phone = await ctxB.newPage();
  phone.on('console', (m) => { if (m.type() === 'error') errors.push(`B: ${m.text()}`); });
  await phone.addInitScript((t) => { localStorage.setItem('dnd-forge:theme:v1', t); }, theme);
  await phone.goto(seatLink, { waitUntil: 'networkidle' });
  // The whole fight arrives on hello - this context has never seen it.
  await phone.waitForSelector('.seat-status', { timeout: 8000 });
  say(
    /Goblin is up — 1 turn to yours/.test(await phone.locator('.seat-status').innerText()),
    `${theme}: a fresh device receives the fight over the relay`,
  );

  await phone.getByLabel('What you plan to do').selectOption('attack');
  await phone.getByLabel('Who you plan to attack').selectOption({ label: 'Goblin' });
  await phone.getByLabel('In your own words').fill('over the wire');
  await phone.getByRole('button', { name: 'Queue it' }).click();
  await phone.waitForTimeout(700);

  await dm.getByRole('button', { name: /end turn/i }).click();
  await dm.waitForTimeout(900);
  const flag = (await dm.locator('.turn-plan').textContent().catch(() => '')) ?? '';
  say(
    /Attack Goblin/.test(flag) && /over the wire/.test(flag),
    `${theme}: the plan crossed the network to the DM's strip - "${flag.trim()}"`,
  );
  say(
    /You’re up!/.test(await phone.locator('.seat-status').innerText()),
    `${theme}: and the turn crossed back`,
  );

  if (theme === 'dark') {
    await dm.screenshot({ path: 'scratchpad/run95-dm.png', fullPage: false });
    await phone.screenshot({ path: 'scratchpad/run95-phone.png', fullPage: false });
  }

  await dm.getByRole('button', { name: 'Run it' }).click();
  await dm.waitForTimeout(900);
  say(
    (await dm.locator('.turn-plan').count()) === 0 &&
      (await phone.locator('.plan-block.is-up').count()) === 0,
    `${theme}: Run it clears the plan at both ends of the wire`,
  );

  for (const [label, page] of [['A', dm], ['B', phone]]) {
    const body = await page.evaluate(() => document.body.innerText);
    say(!/NaN/.test(body), `${theme}: no NaN on page ${label}`);
  }
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctxA.close();
  await ctxB.close();
}

await browser.close();
relay.kill();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
