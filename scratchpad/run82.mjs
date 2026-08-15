import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §82. The two small ones: rolling for scores, and the appearance boxes.

  The dice are pinned against a fixed rng in the unit tests, so what the
  browser is for is the wiring - that the button moves six real numbers into
  the six real fields, that it says what it rolled, and that a height typed
  on the paper sheet is still there after the app has saved and reloaded,
  which is the only part of a free-text field that can actually break.
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

  // ----------------------------------------------------- roll 4d6, drop one
  await page.evaluate(() => document.getElementById('section-abilities')?.scrollIntoView());
  await page.waitForTimeout(500);

  /* The Builder shows a base score as text under the total, not as an input -
     the steppers are the control. `.breakdown` reads "15 +2" when a lineage
     adds one, so the base is the first number. */
  const scores = () =>
    page.locator('.abilities .ability .breakdown').evaluateAll((els) =>
      els.map((e) => Number((e.textContent ?? '').trim().split(/\s+/)[0])),
    );
  const before = await scores();
  say(before.length === 6, `${theme}: six ability boxes on the page (${before.length})`);

  await page.getByRole('button', { name: /roll 4d6/i }).click();
  await page.waitForTimeout(400);

  const after = await scores();
  say(
    after.length === 6 && after.every((n) => n >= 3 && n <= 18),
    `${theme}: every score is a real 4d6-drop-one result (${after.join(', ')})`,
  );

  const line = await page.getByText(/^Rolled /).innerText();
  const dice = (line.match(/\d+/g) ?? []).slice(0, 6).map(Number);
  say(
    dice.length === 6 && dice.every((n) => n >= 3 && n <= 18),
    `${theme}: and it says what the dice were (${dice.join(', ')})`,
  );
  // Seated, not scattered: the six shown are the six on the sheet.
  say(
    [...dice].sort((a, b) => a - b).join() === [...after].sort((a, b) => a - b).join(),
    `${theme}: the rolls shown are the scores seated, same six numbers`,
  );

  // Rolling again gives a different hand sooner or later - three tries is
  // enough that identical results mean a stuck rng rather than luck.
  let moved = false;
  for (let i = 0; i < 3 && !moved; i++) {
    await page.getByRole('button', { name: /roll 4d6/i }).click();
    await page.waitForTimeout(250);
    moved = (await scores()).join() !== after.join();
  }
  say(moved, `${theme}: rolling again rolls again`);

  // ------------------------------------------------- the appearance boxes
  await page.locator('.gbar-home').first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /the character sheet/i }).first().click();
  await page.waitForTimeout(1000);

  for (const label of ['Age', 'Height', 'Weight', 'Eyes', 'Skin', 'Hair']) {
    say(
      (await page.getByLabel(new RegExp(`^${label}$`, 'i')).count()) === 1,
      `${theme}: the sheet has a box for ${label}`,
    );
  }

  // A height with an apostrophe and an inch mark - the reason these are text.
  await page.getByLabel(/^height$/i).fill(`6'2"`);
  await page.getByLabel(/^eyes$/i).fill('grey');
  await page.waitForTimeout(500);

  // Reload: the whole point of a box on a sheet is that it is still filled in
  // next session. The app wakes on its hub, so walk back to the sheet.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /the character sheet/i }).first().click();
  await page.waitForTimeout(1000);
  say(
    (await page.getByLabel(/^height$/i).inputValue()) === `6'2"`,
    `${theme}: a written height survives a reload, apostrophe and all`,
  );
  say(
    (await page.getByLabel(/^eyes$/i).inputValue()) === 'grey',
    `${theme}: and so does the rest of it`,
  );

  await page.screenshot({ path: `scratchpad/run82-${theme}.png`, fullPage: false });

  const body = await page.evaluate(() => document.body.innerText);
  say(!/NaN|undefined/.test(body), `${theme}: no NaN or undefined on the page`);
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
