import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §57. The Builder <-> Battle round trip, pressed rather than asserted about.

  The bug this covers is not a wrong pixel, it is a missing door: every step
  below was reachable before *through the menu*, so a test that only checked
  "can I get there" would have been green over the complaint. What is checked
  is that each hop is **one press from the screen you are on**.
*/
const browser = await chromium.launch({ executablePath: EXE });

for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((t) => localStorage.setItem('dnd-forge:theme', t), theme);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /use these rules/i }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /show me an example/i }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /build a character/i }).first().click();
  await page.waitForTimeout(800);

  const screen = () => page.locator('.gbar-screen').first().innerText();
  const press = async (name) => {
    await page.getByRole('button', { name }).first().click();
    await page.waitForTimeout(900);
  };

  say((await screen()) === 'BUILDER' || (await screen()) === 'Builder', `${theme}: starts on the Builder`);

  await press(/^Battle →$/);
  say(await page.locator('.btl-bar').count() > 0, `${theme}: Builder → Battle, one press`);

  await press(/^Builder$/);
  say(/builder/i.test(await screen()), `${theme}: Battle → Builder, one press`);

  await press(/^Character sheet →$/);
  say(/sheet/i.test(await screen()), `${theme}: Builder → sheet, as before`);

  await press(/^Battle →$/);
  say(await page.locator('.btl-bar').count() > 0, `${theme}: sheet → Battle, one press`);

  await press(/^Sheet$/);
  say(/sheet/i.test(await screen()), `${theme}: Battle → sheet, one press`);

  // And the hub is still there, unchanged - the doors are between neighbours,
  // not a second navigation system growing back.
  await page.locator('.gbar-home').first().click();
  await page.waitForTimeout(500);
  say(await page.locator('.title-menu').count() > 0, `${theme}: the wordmark still reaches the menu`);

  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
