import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';
const RELAY = 'ws://localhost:4395';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §162. The dice in the player's hand, over the real relay: the phone rolls
  initiative before the fight and the DM's order takes it; the fight starts
  and the phone's attack roll lands in the DM's log, by name.
*/
const relay = spawn('node', ['relay/server.mjs', '--port', '4395'], { stdio: 'ignore' });
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
  await dm.keyboard.press('Escape');
  await dm.waitForTimeout(300);
  await dm.locator('.btl-bar').getByRole('button', { name: 'Prep' }).click();
  await dm.waitForTimeout(500);
  await dm.getByLabel('Relay URL').fill(RELAY);
  await dm.getByRole('button', { name: /open the table/i }).click();
  await dm.waitForTimeout(600);
  const code = (await dm.locator('.room-code').textContent())?.trim() ?? '';
  await dm.keyboard.press('Escape');
  await dm.waitForTimeout(300);

  // ----------------------------------------- context B: a player's phone
  const ctxB = await browser.newContext({ viewport: { width: 380, height: 820 } });
  const phone = await ctxB.newPage();
  phone.on('console', (m) => { if (m.type() === 'error') errors.push(`B: ${m.text()}`); });
  await phone.addInitScript((t) => { localStorage.setItem('dnd-forge:theme:v1', t); }, theme);
  await phone.goto(BASE, { waitUntil: 'networkidle' });
  await phone.getByRole('button', { name: /use these rules/i }).first().click();
  await phone.waitForTimeout(400);
  await phone.getByRole('button', { name: /show me an example/i }).first().click();
  await phone.waitForTimeout(900);
  await phone.locator('.gbar-home').first().click();
  await phone.waitForTimeout(600);
  await phone.getByRole('button', { name: /take a seat/i }).first().click();
  await phone.waitForTimeout(700);
  await phone.getByLabel('Room code').fill(code);
  await phone.getByLabel('Relay URL').fill(RELAY);
  await phone.getByRole('button', { name: 'Join' }).click();
  await phone.waitForTimeout(1000);
  await phone.getByRole('button', { name: 'Sit as Example Fighter' }).click();
  await phone.waitForTimeout(800);

  // Before the fight: initiative in one tap, straight into the DM's order.
  await phone.getByRole('button', { name: /roll initiative/i }).click();
  await phone.waitForTimeout(1200);
  const rolled = Number((await phone.locator('.seat-roll-result b').innerText()).trim());
  say(Number.isFinite(rolled), `${theme}: the phone shows its initiative roll (${rolled})`);
  await dm.locator('.btl-bar').getByRole('button', { name: 'Order' }).click();
  await dm.waitForTimeout(500);
  const inOrder = Number(await dm.getByLabel('Example Fighter initiative').inputValue());
  say(inOrder === rolled, `${theme}: the DM's order took it (${inOrder})`);
  say(
    /Example Fighter rolls Initiative: \d+ .*into the order/.test(await dm.locator('body').innerText()),
    `${theme}: and the DM's log says so`,
  );
  await dm.keyboard.press('Escape');
  await dm.waitForTimeout(300);
  await phone.screenshot({ path: `scratchpad/run162-phone-${theme}.png` });

  // The fight starts; the phone swings, and the DM's log reads it.
  await dm.getByRole('button', { name: /start the fight/i }).click();
  await dm.waitForTimeout(1000);
  say(
    (await phone.getByRole('button', { name: /roll initiative/i }).count()) === 0,
    `${theme}: once the fight runs, the initiative button is gone`,
  );
  const pick = phone.getByLabel('What to roll');
  const hitValue = await pick.locator('option', { hasText: /to hit/ }).first().getAttribute('value');
  await pick.selectOption(hitValue);
  await phone.getByRole('button', { name: 'Roll', exact: true }).click();
  await phone.waitForTimeout(1200);
  say(
    /Example Fighter rolls .+ to hit: \d+/.test(await dm.locator('body').innerText()),
    `${theme}: the attack roll lands in the DM's log, by name`,
  );
  await dm.screenshot({ path: `scratchpad/run162-dm-${theme}.png` });

  say(errors.length === 0, `${theme}: no console errors${errors.length ? ' - ' + errors.join(' | ') : ''}`);
  await ctxB.close();
  await ctxA.close();
}

await browser.close();
relay.kill();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll clear.');
process.exit(problems.length ? 1 : 0);
