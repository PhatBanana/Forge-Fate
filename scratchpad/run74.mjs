import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §74. Denizens: monsters saved with the place.

  The store tests pin the algebra (spawn placed/wanderer, unknown ids
  skipped, hydration). The browser proves the authoring chain: search the
  bestiary from the Dungeons tab, stamp one onto a square (a token appears
  on the editor map), add a second as a wanderer, save - and when the
  battle loads the map, the placed one is standing on its square while the
  wanderer waits off-map until "Put everyone on the map" scatters it.
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
  await page.getByRole('button', { name: /^Dungeons/i }).first().click();
  await page.waitForTimeout(1200);

  // Stamp a goblin onto the map.
  await page.getByLabel('Search monsters').fill('goblin');
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Place', exact: true }).first().click();
  await page.waitForTimeout(300);
  const box = await page.locator('svg.dmap').boundingBox();
  await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.4);
  await page.waitForTimeout(500);
  say(
    (await page.locator('.dmap-token.monster').count()) === 1,
    `${theme}: the stamped goblin stands on the editor map`,
  );

  // And one wanderer, placed only when the battle deploys.
  await page.getByRole('button', { name: 'Wander', exact: true }).first().click();
  await page.waitForTimeout(400);
  const panel = await page.evaluate(() => document.body.innerText);
  say(/standing at \d+,\d+/.test(panel), `${theme}: the panel lists the standing goblin`);
  say(/wandering — placed on deploy/.test(panel), `${theme}: the panel lists the wanderer`);

  await page.getByLabel('Name this dungeon').fill(`the kennel ${theme}`);
  await page.getByRole('button', { name: /save this map/i }).click();
  await page.waitForTimeout(400);
  say(/2 denizens/.test(await page.evaluate(() => document.body.innerText)), `${theme}: the saved list counts its denizens`);

  // The battle loads the place: the standing goblin is already on its square.
  await page.locator('.gbar-home').click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /run a battle|resume the fight/i }).first().click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /^Field/ }).first().click();
  await page.waitForTimeout(600);
  await page.getByLabel('Load a saved dungeon').selectOption({ label: `the kennel ${theme}` });
  await page.waitForTimeout(800);
  say(
    (await page.locator('.dmap-token.monster').count()) === 1,
    `${theme}: the standing goblin arrives placed; the wanderer waits off-map`,
  );

  // Deploy scatters the wanderer with everyone else.
  await page.getByRole('button', { name: /put everyone on the map/i }).click();
  await page.waitForTimeout(800);
  say(
    (await page.locator('.dmap-token.monster').count()) === 2,
    `${theme}: "Put everyone on the map" seats the wanderer too`,
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  const body = await page.evaluate(() => document.body.innerText);
  say(!/NaN|undefined/.test(body), `${theme}: no NaN or undefined on the page`);
  await page.screenshot({ path: `scratchpad/run74-${theme}.png`, fullPage: false });
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
