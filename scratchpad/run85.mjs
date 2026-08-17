import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §85. Every map, without a mouse.

  The rules are pinned in jsdom - roving tabs, the trap, the cursor's walk,
  the editor's camera keys. What only a browser can show is the claim the
  section is actually making: that the *GL* board answers the keyboard.
  jsdom has no WebGL, so every component test of the cursor runs against the
  SVG renderer; the one thing that would prove §79's workaround retired is a
  real canvas being driven by the arrow keys, and it is only here.
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

  const home = async () => {
    const gbar = page.locator('.gbar-home').first();
    if (await gbar.count()) await gbar.click();
    else await page.locator('.btl-cmd-home').filter({ hasText: 'Menu' }).first().click();
    await page.waitForTimeout(600);
  };
  const legend = () => page.locator('.hud-legend').first();
  const said = async () => ((await legend().innerText().catch(() => '')) || '').trim();

  // ------------------------------------------------ the board, in both views
  await home();
  await page.getByRole('button', { name: /run a battle|resume the fight/i }).first().click();
  await page.waitForTimeout(1200);

  await page.locator('.btl-bar').getByRole('button', { name: 'Fighters' }).click();
  await page.waitForTimeout(600);
  await page.locator('.btl-drawer button').filter({ hasText: 'Example Fighter' }).first().click();
  await page.waitForTimeout(500);
  await page.locator('.btl-bar').getByRole('button', { name: 'Field' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /put everyone on the map/i }).click();
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  // Started, so there is somebody whose turn it is - which is where the
  // cursor is summoned, and the reason the checks below can name them.
  await page.getByRole('button', { name: /start the fight/i }).click();
  await page.waitForTimeout(700);

  say(
    /Space ends the turn/.test(await said()),
    `${theme}: the glass shows the reminder before the cursor is summoned`,
  );

  for (const view of ['tactical', 'plan']) {
    // Tactical is the GL canvas - the renderer §79 could not drive at all.
    await page.locator('.hud-cam').getByRole('button', { name: new RegExp(view, 'i') }).click();
    await page.waitForTimeout(700);

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    const summoned = await said();
    say(/Row \d+, column \d+/.test(summoned), `${theme}/${view}: an arrow key summons the cursor`);

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    say((await said()) !== summoned, `${theme}/${view}: and the next one moves it a square`);

    // It IS the live region - §79's rule, one element and one copy of the words.
    say(
      (await page.locator('.hud-legend[role="status"]').count()) === 1,
      `${theme}/${view}: the line the cursor speaks through is the live region`,
    );

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    say(
      /Space ends the turn/.test(await said()),
      `${theme}/${view}: Escape puts it down like everything else`,
    );
  }

  // Both renderers draw it from the one square: the SVG board says so in the
  // DOM, which is the half a canvas can never be asked.
  await page.locator('.hud-cam').getByRole('button', { name: /plan/i }).click();
  await page.waitForTimeout(600);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  say(
    (await page.locator('.dmap-cursor').count()) > 0,
    `${theme}: the flat map draws the cursor from the same prop the canvas reads`,
  );

  /*
    The cursor is summoned onto whoever is up, so the very first press is
    standing on somebody - and it names them and their hit points, which is
    the question a canvas could never answer for a reader. That is the whole
    of §79's honest workaround, retired.
  */
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  const onWhom = await said();
  say(
    /Example Fighter/.test(onWhom) && /\d+ of \d+ hit points/.test(onWhom),
    `${theme}: it starts on whoever is up, and names them - "${onWhom.replace(/\s+/g, ' ')}"`,
  );

  await page.screenshot({ path: `scratchpad/run85-${theme}.png`, fullPage: false });
  await page.keyboard.press('Escape');

  // ------------------------------------------- the editor's camera keys
  await home();
  await page.getByRole('button', { name: /^Dungeons/ }).first().click();
  await page.waitForTimeout(900);

  const zoom = () => page.locator('.hud-zoom-n').first().innerText();
  say((await zoom()).startsWith('1.0'), `${theme}: the editor opens fitted`);
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  await page.waitForTimeout(300);
  const zoomed = await zoom();
  say(!zoomed.startsWith('1.0'), `${theme}: + zooms it in (${zoomed})`);

  const box = () => page.locator('.dmap').first().getAttribute('viewBox');
  const before = await box();
  await page.keyboard.press('d');
  await page.waitForTimeout(300);
  say((await box()) !== before, `${theme}: WASD pans it - §77's open question, answered`);

  await page.keyboard.press('0');
  await page.waitForTimeout(300);
  say((await zoom()).startsWith('1.0'), `${theme}: 0 fits the whole map again`);

  // Typing keeps its own letters.
  await page.getByLabel(/name this dungeon/i).fill('the wasd cellar');
  await page.waitForTimeout(300);
  say(
    (await page.getByLabel(/name this dungeon/i).inputValue()) === 'the wasd cellar' &&
      (await zoom()).startsWith('1.0'),
    `${theme}: a W in a dungeon's name does not slide the map`,
  );

  // ------------------------------------------------------ the tablists
  await home();
  await page.getByRole('button', { name: /characters & bestiary/i }).first().click();
  await page.waitForTimeout(900);

  await page.getByRole('tab', { name: /your characters/i }).click();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  say(
    (await page.getByRole('tab', { name: /bestiary/i }).getAttribute('aria-selected')) === 'true',
    `${theme}: the arrow key moves along the tablist and selects as it goes`,
  );
  await page.keyboard.press('End');
  await page.waitForTimeout(400);
  say(
    (await page.getByRole('tab', { name: /import \/ export/i }).getAttribute('aria-selected')) === 'true',
    `${theme}: End jumps to the last tab`,
  );
  say(
    (await page.getByRole('tab', { name: /your characters/i }).getAttribute('tabindex')) === '-1',
    `${theme}: and only the selected tab is in the Tab order`,
  );

  // ----------------------------------------------------- the focus trap
  await home();
  await page.getByRole('button', { name: /run a battle|resume the fight/i }).first().click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Keys' }).first().click();
  await page.waitForTimeout(400);

  const focused = () => page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
  say((await focused()) === 'Close', `${theme}: the Keys dialog takes focus on open`);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  say(
    (await focused()) === 'Close',
    `${theme}: and Tab cannot walk out of it onto the board behind`,
  );
  say(
    /Arrow keys/.test(await page.getByRole('dialog').innerText()),
    `${theme}: the cursor keys are documented where the others are`,
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  const body = await page.evaluate(() => document.body.innerText);
  say(!/NaN|undefined/.test(body), `${theme}: no NaN or undefined on the page`);
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
