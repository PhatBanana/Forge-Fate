import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §63. Darkvision and the dark it cannot beat, pressed in the built app.

  The assertion that matters is drawn on the *map*, not printed in a panel:
  magical darkness has to be a visibly different square from the ordinary
  kind, and a torch inside it must change nothing. Counting `.dmap-gloom`
  elements by class is the strongest available check that the light model
  reached the camera - the CSS class carries the level, so a square drawn as
  ordinary dark when it should be magical is a failed count, not a subtle
  shade nobody notices.
*/
const browser = await chromium.launch({ executablePath: EXE });

for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((t) => { localStorage.setItem('dnd-forge:theme', t); }, theme);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /use these rules/i }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /show me an example/i }).first().click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /run a battle|resume the fight/i }).first().click();
  await page.waitForTimeout(1200);

  const count = (cls) => page.evaluate((c) => document.querySelectorAll(c).length, cls);

  // Open the Field drawer, where the light controls live.
  await page.getByRole('button', { name: /^Field/ }).first().click();
  await page.waitForTimeout(400);

  const darkness = page.getByRole('button', { name: /darkness \(magical\)/i });
  say(await darkness.count() === 1, `${theme}: the Darkness control is offered beside the torches`);

  say(await count('.dmap-gloom.is-magical-dark') === 0, `${theme}: a bright map has no magical dark`);

  // Put it on the board. The map is the click target; centre is fine.
  await darkness.click();
  const box = await page.locator('.dmap').first().boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(500);

  const magical = await count('.dmap-gloom.is-magical-dark');
  say(magical > 0, `${theme}: the sphere is drawn as magical darkness (${magical} squares)`);
  say(await count('.dmap-gloom.is-dark') === 0, `${theme}: and not as the ordinary kind`);

  // A torch inside it changes nothing: "nonmagical light can't illuminate it".
  await page.getByRole('button', { name: /^Torch$/ }).first().click();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(500);
  say(
    await count('.dmap-gloom.is-magical-dark') === magical,
    `${theme}: a torch standing in it lights nothing`,
  );

  const body = await page.evaluate(() => document.body.innerText);
  say(/magical darkness falls/i.test(body), `${theme}: the log says what happened`);
  say(!/NaN|undefined/.test(body), `${theme}: no NaN or undefined on the page`);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  say(overflow <= 1, `${theme}: no horizontal overflow (${overflow}px)`);
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await page.screenshot({ path: `scratchpad/run63-${theme}.png`, fullPage: false });
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
