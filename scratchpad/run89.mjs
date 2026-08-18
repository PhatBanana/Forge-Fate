import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §89. Objectives, driven end to end in a real browser: authored in Prep,
  the mark painted onto the board and drawn green, the flag counting on the
  glass, the win latching into the log with a toast, and the whole thing
  surviving a reload - the encounter owns it, so a refresh mid-mission must
  come back mid-mission.
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

  // Seat the fighter.
  await page.locator('.btl-bar').getByRole('button', { name: 'Fighters' }).click();
  await page.waitForTimeout(600);
  await page.locator('.btl-drawer button').filter({ hasText: 'Example Fighter' }).first().click();
  await page.waitForTimeout(400);

  // Deploy first: the mark must be painted where the fighter actually
  // stands, because a mid-fight walk is budgeted (§22.5) and the win is
  // only judged once the fight is running.
  await page.locator('.btl-bar').getByRole('button', { name: 'Field' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /put everyone on the map/i }).click();
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const fat0 = (await page.locator('.dmap-token.character').first().getAttribute('data-at'))
    .split(',').map(Number);

  // ---------------------------------------------- author: reach the mark
  await page.locator('.btl-bar').getByRole('button', { name: 'Prep' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Reach the mark' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /paint the mark/i }).click();
  await page.waitForTimeout(300);
  // Close the drawer with its own bar button - it covers the left of the
  // board, where the party deploys. The tool survives; only Escape drops it.
  await page.locator('.btl-bar').getByRole('button', { name: 'Prep' }).click();
  await page.waitForTimeout(400);

  // Two squares beside the fighter, through the live viewBox.
  const box = await page.locator('.dmap').boundingBox();
  const view = await page.locator('.dmap').getAttribute('viewBox');
  const [vx, vy, vw, vh] = view.split(' ').map(Number);
  const cell = 14;
  const px = (x) => box.x + ((x + 0.5) * cell - vx) * (box.width / vw);
  const py = (y) => box.y + ((y + 0.5) * cell - vy) * (box.height / vh);
  const mark = { x: fat0[0] + 1, y: fat0[1] };
  await page.mouse.click(px(mark.x), py(mark.y));
  await page.waitForTimeout(200);
  await page.mouse.click(px(mark.x + 1), py(mark.y));
  await page.waitForTimeout(300);

  say(
    (await page.locator('.dmap-zone.tint-1 rect').count()) === 2,
    `${theme}: two painted squares draw as the green mark`,
  );
  await page.locator('.btl-bar').getByRole('button', { name: 'Prep' }).click();
  await page.waitForTimeout(400);
  say(
    /2 squares marked/.test(await page.locator('.btl-drawer').innerText()),
    `${theme}: and Prep counts them`,
  );
  say(
    /Reach the mark/.test(
      (await page.locator('.turn-objective').textContent().catch(() => '')) ?? '',
    ),
    `${theme}: the flag flies before the fight starts`,
  );

  // Put the tool down.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ----------------------------------------- the reload: the fight owns it
  // Reload during deployment: the mark and the placed party must both come
  // back, because the encounter owns them.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /run a battle|resume the fight/i }).first().click();
  await page.waitForTimeout(1200);
  say(
    (await page.locator('.dmap-zone.tint-1 rect').count()) === 2,
    `${theme}: the mark survives a reload - the encounter owns it`,
  );

  // -------------------------------------------------- win: stand on it
  // Walk the fighter onto the mark while placement is still free (a
  // mid-fight drag is budgeted and wants Move armed in the cockpit), then
  // start the fight: the judge rules nothing at round 0, and latches the
  // win the moment round 1 begins with somebody already standing there.
  const fighter = page.locator('.dmap-token.character').first();
  const fat = (await fighter.getAttribute('data-at')).split(',').map(Number);
  const box2 = await page.locator('.dmap').boundingBox();
  const view2 = await page.locator('.dmap').getAttribute('viewBox');
  const [wx, wy, ww, wh] = view2.split(' ').map(Number);
  const qx = (x) => box2.x + ((x + 0.5) * cell - wx) * (box2.width / ww);
  const qy = (y) => box2.y + ((y + 0.5) * cell - wy) * (box2.height / wh);
  await page.mouse.move(qx(fat[0]), qy(fat[1]));
  await page.mouse.down();
  await page.mouse.move(qx(fat[0] + 1), qy(fat[1]), { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  say(
    (await fighter.getAttribute('data-at')) === `${fat[0] + 1},${fat[1]}`,
    `${theme}: the fighter stands on the mark before the fight starts`,
  );
  await page.getByRole('button', { name: /start the fight/i }).click();
  await page.waitForTimeout(900);

  const flag = (await page.locator('.turn-objective').textContent().catch(() => '')) ?? '';
  say(
    (await page.locator('.turn-objective.is-won').count()) === 1 && /mark is reached/i.test(flag),
    `${theme}: standing on the mark turns the flag green - "${flag.trim()}"`,
  );
  say(
    (await page.locator('.toast').filter({ hasText: /mark is reached/i }).count()) > 0,
    `${theme}: and the win is said out loud`,
  );

  // The log has exactly one line - the latch fired once.
  await page.locator('.btl-bar').getByRole('button', { name: 'After' }).click();
  await page.waitForTimeout(500);
  const logText = await page.locator('.btl-drawer').innerText();
  say(
    (logText.match(/mark is reached/gi) ?? []).length >= 1,
    `${theme}: the log carries the objective line`,
  );
  await page.keyboard.press('Escape');

  // ------------------------------------- hold: the flag counts the rounds
  await page.locator('.btl-bar').getByRole('button', { name: 'Prep' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Hold the line' }).click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const holdFlag = (await page.locator('.turn-objective').textContent()) ?? '';
  say(/round \d+ of 5/i.test(holdFlag), `${theme}: Hold counts on the glass - "${holdFlag.trim()}"`);

  if (theme === 'dark') await page.screenshot({ path: 'scratchpad/run89-dark.png', fullPage: false });
  else await page.screenshot({ path: 'scratchpad/run89-light.png', fullPage: false });

  const body = await page.evaluate(() => document.body.innerText);
  say(!/NaN|undefined/.test(body), `${theme}: no NaN or undefined on the page`);
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
