import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §77. Doors and first steps.

  The dark run takes "Start blank": it must land in the Builder, and the hub
  must greet a pristine roster with the welcome line instead of "Unnamed
  character · 1 saved". The light run takes "Show me an example": it must
  land on the example itself. Both runs then walk the battle pitch and the
  Dungeons screen's "Use in a battle" door.
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

  if (theme === 'dark') {
    await page.getByRole('button', { name: /start blank/i }).first().click();
    await page.waitForTimeout(900);
    say(
      /builder/i.test(await page.locator('.gbar-screen').first().innerText()),
      `${theme}: "Start blank" lands in the Builder, not on the menu`,
    );
    await page.locator('.gbar-home').first().click();
    await page.waitForTimeout(500);
    const hub = await page.evaluate(() => document.body.innerText);
    say(/Nothing loaded yet/i.test(hub), `${theme}: the pristine hub says to start with a character`);
    say(!/1 saved/.test(hub), `${theme}: and does not count the untouched starter as "1 saved"`);
  } else {
    await page.getByRole('button', { name: /show me an example/i }).first().click();
    await page.waitForTimeout(900);
    say(
      /builder/i.test(await page.locator('.gbar-screen').first().innerText()),
      `${theme}: "Show me an example" lands on the example`,
    );
    say(
      (await page.getByLabel(/^Name$/).first().inputValue()) === 'Example Fighter',
      `${theme}: and the example is the loaded character`,
    );
    await page.locator('.gbar-home').first().click();
    await page.waitForTimeout(500);
  }

  // The battle pitch: what a cold arrival reads, and what it opens.
  await page.getByRole('button', { name: /run a battle/i }).first().click();
  await page.waitForTimeout(1200);
  say(
    /An empty table/i.test(await page.evaluate(() => document.body.innerText)),
    `${theme}: the empty battle pitches instead of standing silent`,
  );
  await page.getByRole('button', { name: /add the fighters/i }).click();
  await page.waitForTimeout(700);
  say(
    /Your party/i.test(await page.locator('.btl-drawer').innerText()),
    `${theme}: "Add the fighters" opens the Fighters drawer`,
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // The Dungeons screen's door into the battle.
  await page.getByRole('button', { name: /^Menu$/ }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^Dungeons/i }).first().click();
  await page.waitForTimeout(1000);
  const seed = page.getByLabel('Map seed');
  await seed.fill(`probe vault ${theme}`);
  await page.waitForTimeout(400);
  await page.getByLabel('Name this dungeon').fill(`the vault ${theme}`);
  await page.getByRole('button', { name: /save this map/i }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: `Use the vault ${theme} in a battle` }).click();
  await page.waitForTimeout(1400);
  say((await page.locator('.btl-bar').count()) === 1, `${theme}: "Use in a battle" opens the battle`);
  await page.getByRole('button', { name: /^Field/ }).first().click();
  await page.waitForTimeout(700);
  say(
    new RegExp(`Seed probe vault ${theme}`, 'i').test(await page.locator('.btl-drawer').innerText()),
    `${theme}: and the battle stands on the saved map`,
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  const body = await page.evaluate(() => document.body.innerText);
  say(!/NaN|undefined/.test(body), `${theme}: no NaN or undefined on the page`);
  await page.screenshot({ path: `scratchpad/run77-${theme}.png`, fullPage: false });
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
