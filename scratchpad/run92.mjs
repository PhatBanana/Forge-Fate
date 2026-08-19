import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §92. Seats and intents, driven whole: while the goblin's turn runs, the
  fighter's plan is composed in the cockpit; when the fighter's turn comes,
  the strip flags it, the cockpit reads it back, and Run it rolls the same
  dice a click would. Pass-the-tablet today; §93's phone writes through the
  same seam.
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
  await page.getByRole('button', { name: /run a battle|resume the fight/i }).first().click();
  await page.waitForTimeout(1200);

  // The fighter and a goblin, initiative set so the goblin is up first.
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
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /start the fight/i }).click();
  await page.waitForTimeout(600);

  // ------------------------- the goblin is up; the fighter composes a plan
  await page.getByRole('button', { name: 'Show Example Fighter in the rail' }).first().click();
  await page.waitForTimeout(400);
  say(
    /Queue for Example Fighter/i.test(await page.locator('.plan-block').innerText().catch(() => '')),
    `${theme}: the composer opens for the character whose turn it is not`,
  );
  await page.getByLabel('What they plan to do').selectOption('attack');
  await page.getByLabel('Who they plan to attack').selectOption({ label: 'Goblin' });
  await page.getByLabel('In their own words').fill('straight down his throat');
  await page.getByRole('button', { name: 'Queue it' }).click();
  await page.waitForTimeout(400);
  say(
    /Queued: Attack Goblin/.test(await page.locator('.plan-block').innerText()),
    `${theme}: the plan is queued in the command menu's own words`,
  );

  // --------------------------------- the turn arrives with the plan on it
  await page.getByRole('button', { name: /end turn/i }).click();
  await page.waitForTimeout(600);
  const flag = (await page.locator('.turn-plan').textContent().catch(() => '')) ?? '';
  say(/Attack Goblin/.test(flag), `${theme}: the strip flags the plan - "${flag.trim()}"`);
  say(
    /straight down his throat/.test(await page.locator('.plan-block.is-up').innerText().catch(() => '')),
    `${theme}: the cockpit reads it back, player's words and all`,
  );

  if (theme === 'dark') await page.screenshot({ path: 'scratchpad/run92-dark.png', fullPage: false });
  else await page.screenshot({ path: 'scratchpad/run92-light.png', fullPage: false });

  await page.getByRole('button', { name: 'Run it' }).click();
  await page.waitForTimeout(600);
  say(
    (await page.locator('.plan-block.is-up').count()) === 0 &&
      (await page.locator('.turn-plan').count()) === 0,
    `${theme}: running the plan clears it`,
  );
  await page.locator('.btl-bar').getByRole('button', { name: 'After' }).click();
  await page.waitForTimeout(500);
  say(
    /Example Fighter — .* vs AC 15/.test(await page.locator('.btl-drawer').innerText()),
    `${theme}: and the dice rolled exactly as a click would have`,
  );
  await page.keyboard.press('Escape');

  const body = await page.evaluate(() => document.body.innerText);
  say(!/NaN|undefined/.test(body), `${theme}: no NaN or undefined on the page`);
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
