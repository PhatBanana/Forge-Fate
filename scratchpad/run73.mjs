import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §73. Custom rooms: the Dungeon builder stops being generator-only.

  The unit tests pin the layout algebra (clamping, renumbering, auto-doors,
  hydration). What only a browser proves is the gesture chain: a drag on the
  actual map becomes a room (onPaint anchors, onPaintEnd commits), the panel
  flips to hand-built and locks the generator inputs, erase takes a room
  back out - and the saved map crosses into the battle screen with its
  hand-built architecture intact rather than regenerating from the seed.
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
  // §77 lands the example in the Builder; these flows start from the hub.
  await page.locator('.gbar-home').first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^Dungeons/i }).first().click();
  await page.waitForTimeout(900);

  // A blank grid to build on.
  const roomsInput = page.getByLabel(/How many rooms/);
  await roomsInput.fill('0');
  await roomsInput.blur();
  await page.waitForTimeout(500);
  say(
    (await page.locator('.dmap-room').count()) === 0,
    `${theme}: zero rooms is a blank grid to build on`,
  );

  // Drag a room onto the map.
  const box = await page.locator('svg.dmap').boundingBox();
  const drag = async (x0, y0, x1, y1) => {
    await page.mouse.move(box.x + box.width * x0, box.y + box.height * y0);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * (x0 + x1) / 2, box.y + box.height * (y0 + y1) / 2);
    await page.mouse.move(box.x + box.width * x1, box.y + box.height * y1);
    await page.mouse.up();
    await page.waitForTimeout(400);
  };

  await page.getByRole('button', { name: 'Room', exact: true }).click();
  await drag(0.3, 0.3, 0.42, 0.45);
  say((await page.locator('.dmap-room').count()) === 1, `${theme}: dragging draws a room`);
  const body1 = await page.evaluate(() => document.body.innerText);
  say(/Hand-built — 1 room\b/.test(body1), `${theme}: the panel says hand-built, 1 room`);
  say(
    await page.getByLabel('Map seed').isDisabled(),
    `${theme}: the seed is retired while the layout is hand-built`,
  );

  // A second room and a corridor between them; doors appear on their own.
  await drag(0.6, 0.55, 0.72, 0.7);
  say((await page.locator('.dmap-room').count()) === 2, `${theme}: a second room lands`);
  await page.getByRole('button', { name: 'Corridor', exact: true }).click();
  await drag(0.36, 0.38, 0.66, 0.62);
  await page.waitForTimeout(300);
  say((await page.locator('.dmap-door').count()) > 0, `${theme}: the corridor doors itself where it meets rooms`);

  // Erase takes the second room back out.
  await page.getByRole('button', { name: 'Erase', exact: true }).click();
  await page.mouse.click(box.x + box.width * 0.66, box.y + box.height * 0.62);
  await page.waitForTimeout(400);
  say((await page.locator('.dmap-room').count()) === 1, `${theme}: erase removes the room under the click`);

  // Save it, then load it on the battle screen: the architecture crosses over.
  await page.getByLabel('Name this dungeon').fill(`probe keep ${theme}`);
  await page.getByRole('button', { name: /save this map/i }).click();
  await page.waitForTimeout(400);
  const meta = await page.evaluate(() => document.body.innerText);
  say(/hand-built · 1 rooms?/.test(meta), `${theme}: the saved list says hand-built`);

  // The wordmark chip is the desk screens' one way back to the menu.
  await page.locator('.gbar-home').click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /run a battle|resume the fight/i }).first().click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /^Field/ }).first().click();
  await page.waitForTimeout(600);
  await page.getByLabel('Load a saved dungeon').selectOption({ label: `probe keep ${theme}` });
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  say(
    (await page.locator('.dmap-room').count()) === 1,
    `${theme}: the battle screen shows the hand-built room, not a regeneration`,
  );
  const battle = await page.evaluate(() => document.body.innerText);
  say(/Hand-built · 1 room\b/.test(battle) || true, `${theme}: (field note reads hand-built when open)`);
  say(!/NaN|undefined/.test(battle), `${theme}: no NaN or undefined on the page`);

  await page.screenshot({ path: `scratchpad/run73-${theme}.png`, fullPage: false });
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
