import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';
const RELAY = 'ws://localhost:4393';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §153. The seat speaks more of the menu: from the phone, a player can queue
  a grapple or shove by name, a Ready with its trigger, or an item from their
  own pack - and the DM's cockpit can run the Ready with one click. Proven
  over the real relay, phone to table.
*/
const relay = spawn('node', ['relay/server.mjs', '--port', '4393'], { stdio: 'ignore' });
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
  await dm.locator('.btl-bar').getByRole('button', { name: 'Prep' }).click();
  await dm.waitForTimeout(500);
  await dm.getByLabel('Relay URL').fill(RELAY);
  await dm.getByRole('button', { name: /open the table/i }).click();
  await dm.waitForTimeout(600);
  const code = (await dm.locator('.room-code').textContent())?.trim() ?? '';
  await dm.keyboard.press('Escape');
  await dm.waitForTimeout(300);
  await dm.getByRole('button', { name: /start the fight/i }).click();
  await dm.waitForTimeout(600);

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

  // The menu grew: the grabs, Ready, and the pack.
  const kinds = await phone.getByLabel('What you plan to do').innerText();
  say(
    /Grapple/.test(kinds) && /Shove/.test(kinds) && /Ready/.test(kinds) && /Use an item/.test(kinds),
    `${theme}: the seat offers grapple, shove, Ready and the pack`,
  );

  // A grapple names its mark from the phone.
  await phone.getByLabel('What you plan to do').selectOption('grapple');
  say(
    /Goblin/.test(await phone.getByLabel('Who you plan to grab').innerText()),
    `${theme}: the grab's target list names the goblin`,
  );

  // Queue a Ready with its trigger - the note placeholder asks for one.
  await phone.getByLabel('What you plan to do').selectOption('ready');
  const note = phone.getByLabel('In your own words');
  say(
    /trigger/i.test((await note.getAttribute('placeholder')) ?? ''),
    `${theme}: Ready asks for its trigger`,
  );
  await note.fill('when it rounds the corner');
  await phone.getByRole('button', { name: 'Queue it' }).click();
  await phone.waitForTimeout(700);
  await phone.screenshot({ path: `scratchpad/run153-phone-${theme}.png` });

  // The DM ends the goblin's turn; the fighter's turn opens with the plan.
  await dm.getByRole('button', { name: /end turn/i }).click();
  await dm.waitForTimeout(700);
  say(
    /Ready — “when it rounds the corner”/.test(await dm.locator('body').innerText()),
    `${theme}: the plan crossed the relay, trigger and all`,
  );
  // The cockpit holds the buttons for whoever is selected; select the
  // fighter whose turn it now is.
  await dm.getByRole('button', { name: /show example fighter in the rail/i }).first().click();
  await dm.waitForTimeout(400);
  await dm.locator('.plan-block').getByRole('button', { name: 'Run it' }).click();
  await dm.waitForTimeout(600);
  say(
    /readies — when it rounds the corner/i.test(await dm.locator('body').innerText()),
    `${theme}: Run it takes the Ready action, trigger in the log`,
  );
  await dm.screenshot({ path: `scratchpad/run153-dm-${theme}.png` });

  say(errors.length === 0, `${theme}: no console errors${errors.length ? ' - ' + errors.join(' | ') : ''}`);
  await ctxB.close();
  await ctxA.close();
}

await browser.close();
relay.kill();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll clear.');
process.exit(problems.length ? 1 : 0);
