import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §88. The board tells the future.

  The flood, the planner and the wiring are pinned in vitest against the SVG
  board. What only the browser shows: the toggles working on the *built* app,
  the wash and the telegraphs surviving both themes, and the GL canvas
  taking the same props without a console error - jsdom never runs that
  renderer at all.
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
  await page.locator('.gbar-home').first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /run a battle|resume the fight/i }).first().click();
  await page.waitForTimeout(1200);

  // A fighter and a goblin on the board.
  await page.locator('.btl-bar').getByRole('button', { name: 'Fighters' }).click();
  await page.waitForTimeout(600);
  await page.locator('.btl-drawer button').filter({ hasText: 'Example Fighter' }).first().click();
  await page.waitForTimeout(400);
  await page.getByLabel(/search the bestiary/i).fill('goblin');
  await page.waitForTimeout(400);
  await page.locator('.mon-list li').filter({ hasText: 'Goblin' }).first()
    .getByRole('button', { name: 'Add' }).click();
  await page.waitForTimeout(400);
  await page.locator('.btl-bar').getByRole('button', { name: 'Field' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /put everyone on the map/i }).click();
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  const danger = () => page.getByRole('button', { name: 'Danger' });
  const intents = () => page.getByRole('button', { name: 'Intents' });
  const wash = () => page.locator('.dmap-zone.tint-0 rect').count();
  const lines = () => page.locator('.dmap-intent').count();

  // -------------------------------------------- deployment, the flat map
  say((await danger().getAttribute('aria-pressed')) === 'false', `${theme}: Danger starts off`);
  say((await wash()) === 0, `${theme}: and the board starts unwashed`);

  await danger().click();
  await page.waitForTimeout(600);
  const washed = await wash();
  say(washed > 8, `${theme}: Danger washes the goblin's whole next turn (${washed} squares) - before the fight starts`);

  await intents().click();
  await page.waitForTimeout(600);
  say((await lines()) > 0, `${theme}: Intents draws the telegraph`);

  await page.screenshot({ path: `scratchpad/run88-${theme}.png`, fullPage: false });

  // ------------------------------------------------- the GL canvas takes it
  await page.locator('.hud-cam').getByRole('button', { name: /tactical/i }).click();
  await page.waitForTimeout(900);
  say(
    (await page.locator('canvas.glmap').count()) === 1,
    `${theme}: the tactical view is the GL canvas`,
  );
  say(errors.length === 0, `${theme}: and it draws both futures without a console error`);
  if (theme === 'dark') await page.screenshot({ path: 'scratchpad/run88-gl.png', fullPage: false });
  await page.locator('.hud-cam').getByRole('button', { name: /plan/i }).click();
  await page.waitForTimeout(600);

  // --------------------------------------- stand them close, read the chip
  /*
    Deployment may have put them rooms apart - a walk-only telegraph with no
    number on it. Drag the fighter beside the goblin while placement is
    still free (setup is setup; mid-fight the same drag would be budgeted),
    and the telegraph turns into a strike with its expectation on the chip.
  */
  const at = await page.locator('.dmap-token.monster').first().getAttribute('data-at');
  const [gx, gy] = at.split(',').map(Number);
  const box = await page.locator('.dmap').boundingBox();
  const view = await page.locator('.dmap').getAttribute('viewBox');
  const [vx, vy, vw, vh] = view.split(' ').map(Number);
  const cell = 14; // CELL in the flat map's user units
  const px = (x) => box.x + ((x + 0.5) * cell - vx) * (box.width / vw);
  const py = (y) => box.y + ((y + 0.5) * cell - vy) * (box.height / vh);
  const fighter = page.locator('.dmap-token.character').first();
  const fat = (await fighter.getAttribute('data-at')).split(',').map(Number);
  await page.mouse.move(px(fat[0]), py(fat[1]));
  await page.mouse.down();
  await page.mouse.move(px(gx + 1), py(gy), { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(800);

  // textContent, not innerText: SVG <text> has no innerText - §80's lesson,
  // relearned here once and written down this time.
  const chip = await page.evaluate(
    () => document.querySelector('.dmap-odds')?.textContent?.trim() ?? '',
  );
  say(/^~\d+$/.test(chip), `${theme}: the fighter's chip carries the incoming expectation (${chip || 'none'})`);
  say((await lines()) > 0, `${theme}: and the strike line points at them`);

  // And the futures survive the fight actually starting.
  await page.getByRole('button', { name: /start the fight/i }).click();
  await page.waitForTimeout(800);
  say((await wash()) > 0 && (await lines()) > 0, `${theme}: both futures ride into round one`);

  // Off is off.
  await danger().click();
  await intents().click();
  await page.waitForTimeout(500);
  say((await wash()) === 0 && (await lines()) === 0, `${theme}: both futures clear when toggled off`);

  const body = await page.evaluate(() => document.body.innerText);
  say(!/NaN|undefined/.test(body), `${theme}: no NaN or undefined on the page`);
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
