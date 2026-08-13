import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §62. Forgoing the 2014 kit for coin, pressed in the built app.

  The assertion that matters is the *purse*, not the button: a control that
  renders and does nothing would pass any check that only looked for it. So
  the probe types an amount, presses it, and then reads the character sheet's
  own purse line - which is downstream of `build.coins`, the engine, and the
  save. And it checks 2024 does NOT offer the field, because offering it there
  would hand somebody gold their edition does not grant.
*/
const browser = await chromium.launch({ executablePath: EXE });

for (const theme of ['dark', 'light']) {
  for (const ruleset of ['2014', '2024']) {
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript((t) => { localStorage.setItem('dnd-forge:theme:v1', t); }, theme);

    const tag = `${theme}/${ruleset}`;
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /use these rules/i }).nth(ruleset === '2014' ? 0 : 1).click();
    await page.waitForTimeout(400);
    /*
      "Start blank", not the example. The example is a level 5 Fighter and the
      starting-equipment panel deliberately only renders at 1st level for a
      single class - so probing from the example would find no panel at all
      and report a bug that is the probe's.
    */
    await page.getByRole('button', { name: /start blank/i }).first().click();
    await page.waitForTimeout(700);
    await page.getByRole('button', { name: /build a character/i }).first().click();
    await page.waitForTimeout(900);

    const field = page.getByLabel(/starting gold instead of the kit/i);
    const present = await field.count();

    if (ruleset === '2024') {
      say(present === 0, `${tag}: no free-hand coin field — the SRD option carries the number`);
      const body = await page.evaluate(() => document.body.innerText);
      say(/\d+ gp/i.test(body), `${tag}: the SRD's own coin option is still offered`);
    } else {
      say(present === 1, `${tag}: the coin field is offered`);
      await field.fill('140');
      await page.getByRole('button', { name: /take coin instead/i }).click();
      await page.waitForTimeout(500);

      const after = await page.evaluate(() => document.body.innerText);
      say(/140 gp in the purse/i.test(after), `${tag}: the panel confirms 140 gp`);

      // And downstream: the sheet's purse line reads from build.coins.
      await page.getByRole('button', { name: /character sheet/i }).first().click();
      await page.waitForTimeout(800);
      const sheet = await page.evaluate(() => document.body.innerText);
      say(/140 gp/i.test(sheet), `${tag}: the character sheet's purse shows it`);
    }

    const body = await page.evaluate(() => document.body.innerText);
    say(!/NaN|undefined/.test(body), `${tag}: no NaN or undefined on the page`);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    say(overflow <= 1, `${tag}: no horizontal overflow (${overflow}px)`);
    say(errors.length === 0, `${tag}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

    await page.screenshot({ path: `scratchpad/run62-${theme}-${ruleset}.png`, fullPage: false });
    await ctx.close();
  }
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
