import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §91. The Fallen, walked whole: a campaign started, a fighter dropped to
  nought in a real fight, the After drawer offering the memorial, the press
  writing the roll, and the Campaign screen taking the DM's epitaph - which
  must still be there after a reload, because a memorial that forgets is
  not one.
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

  // ------------------------------------------------- a campaign is playing
  await page.locator('.gbar-home').first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^Campaign/ }).first().click();
  await page.waitForTimeout(700);
  await page.getByLabel(/name this campaign/i).fill('Saturdays');
  await page.getByRole('button', { name: /start one/i }).click();
  await page.waitForTimeout(400);
  say(
    (await page.locator('body').innerText()).includes('Saturdays'),
    `${theme}: a campaign is being played`,
  );

  // --------------------------------------- the fighter falls in a real fight
  await page.locator('.gbar-home').first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /run a battle|resume the fight/i }).first().click();
  await page.waitForTimeout(1200);
  await page.locator('.btl-bar').getByRole('button', { name: 'Fighters' }).click();
  await page.waitForTimeout(600);
  await page.locator('.btl-drawer button').filter({ hasText: 'Example Fighter' }).first().click();
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /start the fight/i }).click();
  await page.waitForTimeout(500);

  await page.locator('.btl-bar').getByRole('button', { name: 'Order' }).click();
  await page.waitForTimeout(500);
  const row = page.locator('.init-row').filter({ hasText: 'Example Fighter' }).first();
  await row.getByLabel(/damage or healing/i).fill('99');
  await row.getByRole('button', { name: 'Damage' }).click();
  await page.waitForTimeout(400);

  // ------------------------------------------------ the offer, and the press
  await page.locator('.btl-bar').getByRole('button', { name: 'After' }).click();
  await page.waitForTimeout(500);
  const drawer = await page.locator('.btl-drawer').innerText();
  say(/The fallen/i.test(drawer), `${theme}: the After drawer notices who is at nought`);
  say(/at nought/.test(drawer), `${theme}: and says so plainly`);
  await page.getByRole('button', { name: /lay example fighter to rest/i }).click();
  await page.waitForTimeout(400);
  say(
    (await page.locator('.toast').filter({ hasText: /joins the Fallen/i }).count()) > 0,
    `${theme}: the press is said out loud`,
  );
  say(
    /on the roll/.test(await page.locator('.btl-drawer').innerText()),
    `${theme}: and the offer stands down - they are on the roll`,
  );

  // ------------------------------------------- the roll, and the DM's words
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^Campaign/ }).first().click();
  await page.waitForTimeout(700);
  // Panel titles render uppercased, so innerText carries "THE FALLEN".
  say(
    /the fallen/i.test(await page.locator('body').innerText()),
    `${theme}: the Campaign screen carries the roll`,
  );
  await page.getByLabel(/epitaph for example fighter/i).fill('they held the door');
  await page.waitForTimeout(600);

  // ---------------------------------------------- a memorial does not forget
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /^Campaign/ }).first().click();
  await page.waitForTimeout(700);
  say(
    (await page.getByLabel(/epitaph for example fighter/i).inputValue()) === 'they held the door',
    `${theme}: the epitaph survives a reload`,
  );

  if (theme === 'dark') await page.screenshot({ path: 'scratchpad/run91-dark.png', fullPage: false });
  else await page.screenshot({ path: 'scratchpad/run91-light.png', fullPage: false });

  const body = await page.evaluate(() => document.body.innerText);
  say(!/NaN|undefined/.test(body), `${theme}: no NaN or undefined on the page`);
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
