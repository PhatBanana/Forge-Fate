import { chromium, devices } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §78. Tablet reach: nothing unreachable, everything pressable.

  This probe grows the harness: alongside the desktop 1360×900 runs, it
  opens a 1024×768 landscape context and an 834×1112 portrait context with
  touch (isMobile makes Chromium's `pointer: coarse` true, which is what
  arms the app's finger-sized targets). The §75 camera dodge must not leak
  into the ≤900px layout, the gbar must never clip its own navigation, the
  Builder's rail must lead on a single column, and the theme toggle must be
  reachable from a desk screen and the battle alike.
*/
const browser = await chromium.launch({ executablePath: EXE });

const firstRun = async (page) => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /use these rules/i }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /show me an example/i }).first().click();
  await page.waitForTimeout(900);
};

// ------------------------------------------------- desktop, both themes
for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((t) => { localStorage.setItem('dnd-forge:theme:v1', t); }, theme);
  await firstRun(page);

  // The gbar carries the theme toggle now; flipping it flips the app.
  const group = page.getByRole('group', { name: /colour theme/i });
  say((await group.count()) === 1, `${theme}: the Builder's bar carries the theme toggle`);
  const other = theme === 'dark' ? 'Parchment' : 'Dark';
  await group.getByRole('button', { name: other }).click();
  await page.waitForTimeout(300);
  // Picking what the system would give clears the override (data-theme comes
  // off), so assert the flip by what the page stops being, not what it says.
  say(
    (await page.evaluate(() => document.documentElement.dataset.theme)) !== theme,
    `${theme}: flipping it flips the page`,
  );
  await group.getByRole('button', { name: theme === 'dark' ? 'Dark' : 'Parchment' }).click();
  await page.waitForTimeout(300);

  // And the battle bar carries it too - no gbar there to ride.
  await page.getByRole('button', { name: /^Battle →$/ }).first().click();
  await page.waitForTimeout(1200);
  say(
    (await page.locator('.btl-bar .theme-toggle').count()) === 1,
    `${theme}: the battle's command bar carries the toggle`,
  );

  await page.screenshot({ path: `scratchpad/run78-${theme}.png`, fullPage: false });
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);
  await ctx.close();
}

// -------------------------------------- 1024×768 landscape: the gbar whole
{
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await firstRun(page);

  let whole = true;
  for (const el of await page.locator('.gbar button').all()) {
    const box = await el.boundingBox();
    if (!box || box.x < 0 || box.x + box.width > 1025) whole = false;
  }
  say(whole, `1024: every gbar button sits inside the viewport`);
  say(
    (await page.getByRole('button', { name: /^Battle →$/ }).first().isVisible()),
    `1024: "Battle →" is visible - the clipped-nav defect is dead`,
  );
  await ctx.close();
}

// --------------- 834×1112 portrait with touch: coarse targets + rail order
{
  const ctx = await browser.newContext({
    ...devices['iPad Pro 11'],
    viewport: { width: 834, height: 1112 },
    executablePath: undefined,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await firstRun(page);

  // The gbar wraps rather than clips at 834 too.
  let whole = true;
  for (const el of await page.locator('.gbar button').all()) {
    const box = await el.boundingBox();
    if (!box || box.x < 0 || box.x + box.width > 835) whole = false;
  }
  say(whole, `834+touch: the gbar wraps - every button inside the viewport`);

  // Coarse pointer grows the small buttons to finger size.
  const undoBox = await page.getByRole('button', { name: /undo/i }).boundingBox();
  say(
    undoBox !== null && undoBox.height >= 38,
    `834+touch: .btn-sm grows to a finger target (${Math.round(undoBox?.height ?? 0)}px)`,
  );

  // Single column: the rail leads - "At a glance" sits above the form.
  const railBox = await page.locator('.rail .panel').first().boundingBox();
  const formBox = await page.locator('#section-identity, .columns > .stack .panel').first().boundingBox();
  say(
    railBox !== null && formBox !== null && railBox.y < formBox.y,
    `834+touch: the rail (At a glance, Next choices) leads the single column`,
  );

  // The battle: bar buttons finger-sized, and the §75 camera dodge does not
  // leak into the bottom-docked drawer layout.
  await page.getByRole('button', { name: /^Battle →$/ }).first().click();
  await page.waitForTimeout(1400);
  const cmdBox = await page.locator('.btl-cmd').first().boundingBox();
  say(cmdBox !== null && cmdBox.height >= 42, `834+touch: battle commands are finger-sized`);

  await page.getByRole('button', { name: /^Fighters/ }).first().click();
  await page.waitForTimeout(800);
  const camBox = await page.locator('.hud-cam').boundingBox();
  say(
    camBox !== null && camBox.x <= 60,
    `834+touch: with a drawer open the camera cluster stays on the left edge (x=${Math.round(camBox?.x ?? -1)})`,
  );

  await page.screenshot({ path: `scratchpad/run78-tablet.png`, fullPage: false });
  say(errors.length === 0, `834+touch: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
