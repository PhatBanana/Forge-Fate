import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §154. The first question, asked first: a blank sheet opens the guided flow
  on "Who you are", with the species × class explorer inside the card. Loading
  a pairing answers it - the scores arrive with it, so the step closes and the
  flow moves on. The separate Species × Class screen is gone, gbar door and all.
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
  await page.getByRole('button', { name: /start blank/i }).first().click();
  await page.waitForTimeout(1200);

  // The flow opens on the first question. Titles render uppercased (§91).
  const card = page.locator('.flow-step');
  say(/who you are/i.test(await card.innerText()), `${theme}: a blank sheet opens on Who you are`);

  // The explorer is in the card: ranked lineages for a class, loadable.
  say(
    /best lineages for a class/i.test(await card.innerText()),
    `${theme}: the ranked pairings stand inside the step`,
  );
  await page.screenshot({ path: `scratchpad/run154-who-${theme}.png` });

  // And the old separate screen is gone from the bar.
  say(
    (await page.getByRole('button', { name: 'Species × Class' }).count()) === 0,
    `${theme}: no Species × Class door remains in the bar`,
  );

  // Open the top suggestion and load it; the flow should move on because
  // the pairing brings its own point-buy.
  await card.locator('.suggestion summary').first().click();
  await page.waitForTimeout(300);
  await card.getByRole('button', { name: /load this pairing/i }).first().click();
  await page.waitForTimeout(900);
  const after = await page.locator('.flow-step').innerText();
  say(!/who you are/i.test(after), `${theme}: loading a pairing answers the question and moves on`);
  // The sheet under the card carries the pairing now - scores no longer all 8.
  const sheet = await page.locator('.ss').first().innerText();
  say(!/8 \/ 8 \/ 8 \/ 8 \/ 8 \/ 8/.test(sheet), `${theme}: the pairing brought its scores`);
  await page.screenshot({ path: `scratchpad/run154-loaded-${theme}.png` });

  say(errors.length === 0, `${theme}: no console errors${errors.length ? ' - ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll clear.');
process.exit(problems.length ? 1 : 0);
