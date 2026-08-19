import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §94. The wire, across two real tabs of one browser: the DM's battle on
  page A is the host; a phone-sized seat on page B queues an attack that
  travels the BroadcastChannel, lands in A's cockpit, and runs there - and
  A's turn advancing travels back, so B knows the moment it is up. This is
  the whole §92-§94 loop with no server anywhere.
*/
const browser = await chromium.launch({ executablePath: EXE });

for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const dm = await ctx.newPage();
  const errors = [];
  dm.on('console', (m) => { if (m.type() === 'error') errors.push(`A: ${m.text()}`); });
  await dm.addInitScript((t) => { localStorage.setItem('dnd-forge:theme:v1', t); }, theme);

  // ---------------------------------------- page A: the DM's fight, as ever
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
  await dm.getByRole('button', { name: /start the fight/i }).click();
  await dm.waitForTimeout(600);

  // -------------------------- page B: the phone, joining the same browser
  const phone = await ctx.newPage();
  phone.on('console', (m) => { if (m.type() === 'error') errors.push(`B: ${m.text()}`); });
  await phone.setViewportSize({ width: 380, height: 820 });
  await phone.goto(BASE, { waitUntil: 'networkidle' });
  await phone.getByRole('button', { name: /take a seat/i }).first().click();
  await phone.waitForTimeout(600);
  await phone.getByRole('button', { name: 'Sit as Example Fighter' }).click();
  await phone.waitForTimeout(800);
  say(
    /Goblin is up — 1 turn to yours/.test(await phone.locator('.seat-status').innerText()),
    `${theme}: the phone knows whose turn it is`,
  );

  // The player queues while the goblin's turn runs; the op rides the wire.
  await phone.getByLabel('What you plan to do').selectOption('attack');
  await phone.getByLabel('Who you plan to attack').selectOption({ label: 'Goblin' });
  await phone.getByLabel('In your own words').fill('from the cheap seats');
  await phone.getByRole('button', { name: 'Queue it' }).click();
  await phone.waitForTimeout(600);

  // ------------------------- back on A: the plan arrived, the turn comes
  await dm.getByRole('button', { name: /end turn/i }).click();
  await dm.waitForTimeout(800);
  const flag = (await dm.locator('.turn-plan').textContent().catch(() => '')) ?? '';
  say(
    /Attack Goblin/.test(flag) && /cheap seats/.test(flag),
    `${theme}: the phone's plan flies on the DM's strip - "${flag.trim()}"`,
  );
  say(
    (await dm.locator('.plan-block.is-up').count()) === 1,
    `${theme}: and waits in the cockpit with the buttons`,
  );

  // ...and the advance travelled the other way.
  say(
    /You’re up!/.test(await phone.locator('.seat-status').innerText()),
    `${theme}: the phone heard the turn arrive`,
  );

  if (theme === 'dark') {
    await dm.screenshot({ path: 'scratchpad/run94-dm.png', fullPage: false });
    await phone.screenshot({ path: 'scratchpad/run94-phone.png', fullPage: false });
  }

  // The DM runs it; the empty queue travels back to the phone.
  await dm.getByRole('button', { name: 'Run it' }).click();
  await dm.waitForTimeout(800);
  say(
    (await dm.locator('.turn-plan').count()) === 0,
    `${theme}: running the plan clears it at the table`,
  );
  say(
    (await phone.locator('.plan-block.is-up').count()) === 0,
    `${theme}: and the phone's copy stands down too`,
  );

  for (const [label, page] of [['A', dm], ['B', phone]]) {
    const body = await page.evaluate(() => document.body.innerText);
    say(!/NaN/.test(body), `${theme}: no NaN on page ${label}`);
  }
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
