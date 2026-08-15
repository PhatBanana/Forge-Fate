import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §76. The safety net: nothing destructive fires on one click, and the
  worst destruction can be taken back.

  The unit tests pin the ConfirmButton machine and each call site's
  arithmetic; the browser proves the flows a DM actually walks: Clear asks
  and restores across the real drawer UI, the dungeon's Clear all and
  Delete ask, and saving a map answers out loud.
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
  // §77 lands the example in the Builder; these flows start from the hub.
  await page.locator('.gbar-home').first().click();
  await page.waitForTimeout(500);

  // ------------------------------------------- the battle's Clear and restore
  await page.getByRole('button', { name: /run a battle|resume the fight/i }).first().click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /^Fighters/ }).first().click();
  await page.waitForTimeout(700);
  await page.locator('.btl-drawer .roster-strip button, .btl-drawer button').filter({ hasText: 'Example Fighter' }).first().click();
  await page.waitForTimeout(500);

  await page.getByRole('button', { name: /^Order/ }).first().click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /^Clear$/ }).click();
  await page.waitForTimeout(300);
  say(
    (await page.getByRole('button', { name: /really clear/i }).count()) === 1,
    `${theme}: Clear asks before it acts`,
  );
  await page.getByRole('button', { name: /^Keep$/ }).click();
  await page.waitForTimeout(300);
  say(
    (await page.locator('.init-row').count()) === 1,
    `${theme}: Keep declines and the fighter stays`,
  );

  await page.getByRole('button', { name: /^Clear$/ }).click();
  await page.getByRole('button', { name: /really clear/i }).click();
  await page.waitForTimeout(400);
  say(
    (await page.locator('.init-row').count()) === 0,
    `${theme}: confirmed, the table empties`,
  );
  await page.getByRole('button', { name: /restore last encounter/i }).click();
  await page.waitForTimeout(400);
  say(
    (await page.locator('.init-row').count()) === 1,
    `${theme}: "Restore last encounter" brings the fight back`,
  );

  // -------------------------------------- the dungeon's asks and its answer
  await page.getByRole('button', { name: /^Menu$/ }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^Dungeons/i }).first().click();
  await page.waitForTimeout(1000);

  // Paint one pillar so Clear all appears; it must ask too.
  await page.getByRole('button', { name: 'Pillar' }).click();
  const box = await page.locator('svg.dmap').boundingBox();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /clear all/i }).click();
  await page.waitForTimeout(300);
  say(
    (await page.getByRole('button', { name: /really clear/i }).count()) === 1,
    `${theme}: the dungeon's Clear all asks first`,
  );
  await page.getByRole('button', { name: /^Keep$/ }).click();
  await page.waitForTimeout(300);
  say(
    (await page.locator('.dmap-t-pillar').count()) === 1,
    `${theme}: Keep leaves the painted pillar standing`,
  );

  // Save answers out loud, then delete asks.
  await page.getByLabel('Name this dungeon').fill(`probe hold ${theme}`);
  await page.getByRole('button', { name: /save this map/i }).click();
  await page.waitForTimeout(300);
  say(
    (await page.getByRole('button', { name: /^Saved$/ }).count()) === 1,
    `${theme}: the save button answers "Saved"`,
  );
  await page.getByRole('button', { name: `Delete probe hold ${theme}` }).click();
  await page.waitForTimeout(300);
  say(
    (await page.getByRole('button', { name: /really delete/i }).count()) === 1,
    `${theme}: deleting a saved dungeon asks first`,
  );
  await page.getByRole('button', { name: /really delete/i }).click();
  await page.waitForTimeout(400);
  say(
    /nothing saved yet/i.test(await page.evaluate(() => document.body.innerText)),
    `${theme}: confirmed, the saved dungeon goes`,
  );

  const body = await page.evaluate(() => document.body.innerText);
  say(!/NaN|undefined/.test(body), `${theme}: no NaN or undefined on the page`);
  await page.screenshot({ path: `scratchpad/run76-${theme}.png`, fullPage: false });
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
