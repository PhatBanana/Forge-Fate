import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §93. The player's seat, driven whole: the fight set up on the DM's screen,
  the seat taken from the hub, a plan queued from the chair - and the SAME
  plan waiting in the DM's cockpit when the turn comes, because App holds
  one queue for both screens. Then the phone: 380 wide, no sideways scroll,
  the seat still legible and telling the player they are up.
*/
const browser = await chromium.launch({ executablePath: EXE });

for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((t) => { localStorage.setItem('dnd-forge:theme:v1', t); }, theme);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /use these rules/i }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /show me an example/i }).first().click();
  await page.waitForTimeout(900);
  await page.locator('.gbar-home').first().click();
  await page.waitForTimeout(600);

  // The DM sets the table: fighter and goblin, goblin up first.
  await page.getByRole('button', { name: /run a battle|resume the fight/i }).first().click();
  await page.waitForTimeout(1200);
  await page.locator('.btl-bar').getByRole('button', { name: 'Fighters' }).click();
  await page.waitForTimeout(600);
  await page.locator('.btl-drawer button').filter({ hasText: 'Example Fighter' }).first().click();
  await page.waitForTimeout(400);
  await page.getByLabel(/search the bestiary/i).fill('goblin');
  await page.waitForTimeout(400);
  const entry = page.locator('.mon-list li').filter({ has: page.locator('b', { hasText: /^Goblin$/ }) });
  await entry.getByRole('button', { name: 'Add' }).click();
  await page.waitForTimeout(400);
  await page.locator('.btl-bar').getByRole('button', { name: 'Order' }).click();
  await page.waitForTimeout(500);
  await page.getByLabel('Goblin initiative').fill('20');
  await page.getByLabel('Example Fighter initiative').fill('10');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /start the fight/i }).click();
  await page.waitForTimeout(600);

  // ---------------------------------------------- the seat, from the hub
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /take a seat/i }).first().click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Sit as Example Fighter' }).click();
  await page.waitForTimeout(500);
  say(
    /Goblin is up — 1 turn to yours/.test(await page.locator('.seat-status').innerText()),
    `${theme}: the seat counts the turns to yours`,
  );
  say(
    /hit points/i.test(await page.locator('.seat').innerText()),
    `${theme}: the sheet's play surface is in the hand`,
  );

  // Queue from the chair.
  await page.getByLabel('What you plan to do').selectOption('attack');
  await page.getByLabel('Who you plan to attack').selectOption({ label: 'Goblin' });
  await page.getByLabel('In your own words').fill('for the vault');
  await page.getByRole('button', { name: 'Queue it' }).click();
  await page.waitForTimeout(400);
  say(
    /Queued: Attack Goblin/.test(await page.locator('.plan-block').innerText()),
    `${theme}: the plan is queued from the seat`,
  );

  // ------------------------- the same queue, read from the DM's cockpit
  await page.locator('.gbar-home').first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /resume the fight/i }).first().click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /end turn/i }).click();
  await page.waitForTimeout(600);
  const flag = (await page.locator('.turn-plan').textContent().catch(() => '')) ?? '';
  say(
    /Attack Goblin.*for the vault/.test(flag),
    `${theme}: the DM's strip flies the seat's plan - "${flag.trim()}"`,
  );
  say(
    (await page.locator('.plan-block.is-up').count()) === 1,
    `${theme}: and the cockpit holds the §25.4 buttons for it`,
  );

  // ------------------------------------------- the phone: 380 wide, honest
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.waitForTimeout(600);
  await page.setViewportSize({ width: 380, height: 820 });
  await page.getByRole('button', { name: /take a seat/i }).first().click();
  await page.waitForTimeout(700);
  say(
    /You’re up!/.test(await page.locator('.seat-status').innerText()),
    `${theme}: at 380 wide the seat says you are up`,
  );
  say(
    /Attack Goblin/.test(await page.locator('.plan-block.is-up').innerText()),
    `${theme}: and reads your plan back - the table runs it`,
  );
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  say(scrollW <= 380, `${theme}: no sideways scroll on the phone (${scrollW}px)`);

  if (theme === 'dark') await page.screenshot({ path: 'scratchpad/run93-dark.png', fullPage: false });
  else await page.screenshot({ path: 'scratchpad/run93-light.png', fullPage: false });

  const body = await page.evaluate(() => document.body.innerText);
  say(!/NaN|undefined/.test(body), `${theme}: no NaN or undefined on the page`);
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
