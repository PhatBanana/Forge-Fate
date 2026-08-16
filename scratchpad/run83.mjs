import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §83. The toast layer.

  The store's lifecycle is pinned against a clock the tests own, and the
  host's contract is pinned in jsdom. What the browser is for is the part
  neither can see: that the layer is actually reachable from the app, that it
  says the right thing when the control that caused it has *gone* - the share
  menu that closes on the same click, the screen switch that leaves the button
  behind - and that a toast expires on a real timer rather than staying on the
  board over a fight.
*/
const browser = await chromium.launch({ executablePath: EXE });

for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({
    viewport: { width: 1360, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((t) => { localStorage.setItem('dnd-forge:theme:v1', t); }, theme);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /use these rules/i }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /show me an example/i }).first().click();
  await page.waitForTimeout(900);

  const toasts = () => page.locator('.toast');

  say((await toasts().count()) === 0, `${theme}: nothing is said before anything happens`);

  // ------------------------------------- the share link: §83's flagship case
  await page.locator('.gbar-home').first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /characters & bestiary/i }).first().click();
  await page.waitForTimeout(900);

  await page.getByRole('button', { name: /^More for/ }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole('menuitem', { name: /copy share link/i }).click();
  await page.waitForTimeout(400);

  /*
    The menu that held the old "Link copied" flip is gone - that is the whole
    defect §83 fixed, and it is what makes the toast the only place the news
    can be.
  */
  say(
    (await page.getByRole('menu').count()) === 0,
    `${theme}: the menu closed on the same click, as it always did`,
  );
  say((await toasts().count()) === 1, `${theme}: and the news is on screen anyway`);
  say(
    /link copied/i.test(await toasts().first().innerText()),
    `${theme}: it says the link was copied`,
  );

  // It IS the live region - one element, one copy of the words.
  const live = page.locator('[role="status"][aria-live="polite"]').filter({ hasText: /link copied/i });
  say((await live.count()) === 1, `${theme}: the toast host is itself the live region`);

  // Dismissable by hand.
  await page.getByRole('button', { name: /^Dismiss:/ }).first().click();
  await page.waitForTimeout(300);
  say((await toasts().count()) === 0, `${theme}: the close button clears it`);

  // ------------------------------------------ a press that leaves its screen
  await page.locator('.gbar-home').first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^Dungeons/ }).first().click();
  await page.waitForTimeout(900);
  await page.getByLabel(/name this dungeon/i).fill('the toast cellar');
  await page.getByRole('button', { name: /save this map/i }).click();
  await page.waitForTimeout(400);

  // The flip §76 shipped stays: this button is under the user's eye, and a
  // word on it is the most direct answer there is.
  say(
    /saved/i.test(await page.getByRole('button', { name: /^Saved$|save this map/i }).first().innerText()),
    `${theme}: the Save button still flips its own label - §76's rule holds`,
  );

  await page.getByRole('button', { name: /use the toast cellar in a battle/i }).first().click();
  await page.waitForTimeout(1600);
  say(
    (await toasts().count()) === 1 &&
      /battle/i.test(await toasts().first().innerText()),
    `${theme}: a press that leaves its screen says so on the one it lands on`,
  );

  // ------------------------------------------------- it goes away by itself
  await page.waitForTimeout(4600);
  say((await toasts().count()) === 0, `${theme}: and it expires on its own`);

  // ------------------------------------------- the board behind the drawer
  await page.locator('.btl-bar').getByRole('button', { name: 'Fighters' }).click();
  await page.waitForTimeout(600);
  await page.locator('.btl-drawer button').filter({ hasText: 'Example Fighter' }).first().click();
  await page.waitForTimeout(500);
  await page.locator('.btl-bar').getByRole('button', { name: 'Field' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /put everyone on the map/i }).click();
  await page.waitForTimeout(500);
  say(
    /seated \d+/i.test((await toasts().first().innerText().catch(() => '')) || ''),
    `${theme}: seating everyone says how many, from behind the drawer that did it`,
  );

  await page.screenshot({ path: `scratchpad/run83-${theme}.png`, fullPage: false });

  const body = await page.evaluate(() => document.body.innerText);
  say(!/NaN|undefined/.test(body), `${theme}: no NaN or undefined on the page`);
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
