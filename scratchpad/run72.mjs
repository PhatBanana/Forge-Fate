import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §72. Beyond level 20, capped at 30.

  The unit tests pin the arithmetic split (formulas climb, printed tables
  hold their level-20 row). What only a browser proves: the Builder's level
  input genuinely accepts the epic range and clamps at the cap, and a page
  full of derived numbers for a level-30 character renders without a NaN
  or an undefined anywhere - the whole derivation chain, laid out.
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
  await page.getByRole('button', { name: /build a character/i }).first().click();
  await page.waitForTimeout(700);

  const level = page.getByLabel('Level', { exact: true }).first();
  say((await level.count()) === 1, `${theme}: the Builder's level input is up`);

  // The cap: typing past 30 clamps to 30.
  await level.fill('40');
  await level.blur();
  await page.waitForTimeout(600);
  say((await level.inputValue()) === '30', `${theme}: typing 40 clamps to the level-30 cap`);

  // A level-30 character derives cleanly: proficiency +9 on the page, no
  // NaN or undefined anywhere in the laid-out sheet of numbers.
  const body = await page.evaluate(() => document.body.innerText);
  say(/\+9\b/.test(body), `${theme}: the +9 proficiency of an epic level shows up`);
  say(!/NaN|undefined/.test(body), `${theme}: no NaN or undefined across the derived page`);

  // And back inside the printed game: 20 stays exactly what it was.
  await level.fill('20');
  await level.blur();
  await page.waitForTimeout(600);
  const at20 = await page.evaluate(() => document.body.innerText);
  say(/\+6\b/.test(at20), `${theme}: back at 20 the proficiency is the printed +6`);
  say(!/NaN|undefined/.test(at20), `${theme}: still no NaN or undefined at 20`);

  await page.screenshot({ path: `scratchpad/run72-${theme}.png`, fullPage: false });
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
