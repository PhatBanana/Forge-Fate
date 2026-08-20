import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';
const RELAY = 'ws://localhost:4391';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §96. The Jackbox join, whole: the DM's Prep drawer shows a room code big
  enough to shout; a phone with its OWN characters joins by typing it,
  gives a name, picks a chair from the lobby, and the DM's screen says who
  sat down. Then the two promises: the phone's own characters survive the
  join untouched, and a mid-session reload lands the player straight back
  on their sheet with their plan intact - because the table roster and the
  seat live on the phone.
*/
const relay = spawn('node', ['relay/server.mjs', '--port', '4391'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

/** The roster lives behind persist.ts in IndexedDB (§24), not localStorage. */
const readOwnRoster = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('dnd-forge', 1);
        req.onsuccess = () => {
          try {
            const get = req.result.transaction('kv', 'readonly').objectStore('kv').get('dnd-forge:roster:v1');
            get.onsuccess = () => resolve(String(get.result ?? ''));
            get.onerror = () => resolve('');
          } catch {
            resolve('');
          }
        };
        req.onerror = () => resolve('');
      }),
  );

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
  say(/^[A-Z2-9]{6}$/.test(code), `${theme}: the room code stands readable across the table - ${code}`);
  await dm.keyboard.press('Escape');
  await dm.waitForTimeout(300);
  await dm.getByRole('button', { name: /start the fight/i }).click();
  await dm.waitForTimeout(600);

  // -------------- context B: a player's phone, with characters of its own
  const ctxB = await browser.newContext({ viewport: { width: 380, height: 820 } });
  const phone = await ctxB.newPage();
  phone.on('console', (m) => { if (m.type() === 'error') errors.push(`B: ${m.text()}`); });
  await phone.addInitScript((t) => { localStorage.setItem('dnd-forge:theme:v1', t); }, theme);
  await phone.goto(BASE, { waitUntil: 'networkidle' });
  await phone.getByRole('button', { name: /use these rules/i }).first().click();
  await phone.waitForTimeout(400);
  await phone.getByRole('button', { name: /show me an example/i }).first().click();
  await phone.waitForTimeout(900);
  await phone.waitForTimeout(600); // let the write-behind settle
  const ownRoster = await readOwnRoster(phone);
  await phone.locator('.gbar-home').first().click();
  await phone.waitForTimeout(600);
  await phone.getByRole('button', { name: /take a seat/i }).first().click();
  await phone.waitForTimeout(700);

  // The Jackbox door: shout the code, type it, join.
  await phone.getByLabel('Room code').fill(code);
  await phone.getByLabel('Relay URL').fill(RELAY);
  await phone.getByRole('button', { name: 'Join' }).click();
  await phone.waitForTimeout(1000);
  // Panel titles render uppercased - §91's lesson, relearned in §96.
  say(
    /at table/i.test(await phone.locator('body').innerText()),
    `${theme}: the phone is at the table by code alone`,
  );
  await phone.getByLabel('Your name').fill('Alex');
  await phone.getByRole('button', { name: 'Sit as Example Fighter' }).click();
  await phone.waitForTimeout(800);
  say(
    /Goblin is up — 1 turn to yours/.test(await phone.locator('.seat-status').innerText()),
    `${theme}: seated, with the fight live from the host`,
  );

  // The DM's lobby says who sat down.
  await dm.locator('.btl-bar').getByRole('button', { name: 'Prep' }).click();
  await dm.waitForTimeout(600);
  say(
    /Seated: Example Fighter — Alex/.test(await dm.locator('.btl-drawer').innerText()),
    `${theme}: the DM's lobby names the player in the chair`,
  );
  await dm.keyboard.press('Escape');
  await dm.waitForTimeout(300);

  // The plan queued from the chair...
  await phone.getByLabel('What you plan to do').selectOption('attack');
  await phone.getByLabel('Who you plan to attack').selectOption({ label: 'Goblin' });
  await phone.getByLabel('In your own words').fill('called it');
  await phone.getByRole('button', { name: 'Queue it' }).click();
  await phone.waitForTimeout(700);

  // ...survives the phone reloading mid-session: seat, table and plan all
  // walk back in - the table roster and the chair live on the phone, and
  // the host echoes the queue on hello.
  await phone.goto(BASE, { waitUntil: 'networkidle' });
  await phone.waitForTimeout(1200);
  say(
    /Goblin is up — 1 turn to yours/.test(
      (await phone.locator('.seat-status').textContent().catch(() => '')) ?? '',
    ),
    `${theme}: a reload lands the player straight back on their sheet`,
  );
  say(
    /Queued: Attack Goblin/.test(await phone.locator('body').innerText()),
    `${theme}: with their queued plan intact`,
  );

  // And the phone's own characters were never touched by the join.
  await phone.waitForTimeout(600);
  const ownAfter = await readOwnRoster(phone);
  if (ownAfter !== ownRoster) {
    let i = 0;
    while (ownRoster[i] === ownAfter[i]) i++;
    console.log('  DIFF at', i, 'of', ownRoster.length, '->', ownAfter.length);
    console.log('  before:', ownRoster.slice(Math.max(0, i - 70), i + 70).replace(/\n/g, ' '));
    console.log('  after :', ownAfter.slice(Math.max(0, i - 70), i + 70).replace(/\n/g, ' '));
  }
  say(
    ownRoster.length > 0 && ownAfter === ownRoster,
    `${theme}: the phone's own characters are untouched by the table`,
  );

  if (theme === 'dark') {
    await dm.screenshot({ path: 'scratchpad/run96-dm.png', fullPage: false });
    await phone.screenshot({ path: 'scratchpad/run96-phone.png', fullPage: false });
  }

  await dm.getByRole('button', { name: /end turn/i }).click();
  await dm.waitForTimeout(900);
  const flag = (await dm.locator('.turn-plan').textContent().catch(() => '')) ?? '';
  say(
    /Attack Goblin/.test(flag) && /called it/.test(flag),
    `${theme}: and the plan still flies at the table - "${flag.trim()}"`,
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
