import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §84. Undo on all three screens.

  `undo.ts` is pinned by unit tests and each screen's wiring by component
  tests. What only a browser can show is the part that spans them: that the
  keystroke reaches the board, that Undo says so through §83's toast layer
  (the whole reason §83 came first), and that the three stacks are genuinely
  separate - undoing on one screen must not reach across into another.
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

  /* §35: the desk screens go home through the game bar, the battle through
     Menu in its own command bar - it has no game bar to go home from. */
  const home = async () => {
    const gbar = page.locator('.gbar-home').first();
    if (await gbar.count()) await gbar.click();
    else await page.locator('.btl-cmd-home').filter({ hasText: 'Menu' }).first().click();
    await page.waitForTimeout(600);
  };
  const undoBtn = () => page.getByRole('button', { name: /↶ Undo/ }).first();
  const redoBtn = () => page.getByRole('button', { name: /↷ Redo/ }).first();
  const toasts = () => page.locator('.toast');

  // ------------------------------------------------- the dungeon editor
  await home();
  await page.getByRole('button', { name: /^Dungeons/ }).first().click();
  await page.waitForTimeout(900);

  say(await undoBtn().isDisabled(), `${theme}: the editor offers no undo before anything is drawn`);

  await page.getByRole('button', { name: 'Pillar' }).click();
  const map = page.locator('.dmap');
  const box = await map.boundingBox();
  // One stroke: press and drag across four squares.
  await page.mouse.move(box.x + 120, box.y + 120);
  await page.mouse.down();
  for (const dx of [12, 24, 36]) await page.mouse.move(box.x + 120 + dx, box.y + 120);
  await page.mouse.up();
  await page.waitForTimeout(300);

  const pillars = () => page.locator('.dmap-t-pillar').count();
  const painted = await pillars();
  say(painted > 1, `${theme}: a drag paints a stroke of ${painted} squares`);

  await undoBtn().click();
  await page.waitForTimeout(300);
  say(
    (await pillars()) === 0 && (await undoBtn().isDisabled()),
    `${theme}: one press takes the whole stroke back, not one square of it`,
  );
  say(
    (await toasts().count()) === 1 && /undone/i.test(await toasts().first().innerText()),
    `${theme}: and the editor says so through §83's layer`,
  );

  await redoBtn().click();
  await page.waitForTimeout(300);
  say((await pillars()) === painted, `${theme}: Redo puts the stroke back`);

  // The keystroke, which is the point of having one: nobody drawing looks
  // away to press a button in the rail. No click on the map first - the
  // Pillar brush is still armed and a click would paint a fourth square.
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  say((await pillars()) === 0, `${theme}: Ctrl+Z reaches the drawing`);

  // ------------------------------------------------------- the battle
  await home();
  await page.getByRole('button', { name: /run a battle|resume the fight/i }).first().click();
  await page.waitForTimeout(1200);

  await page.locator('.btl-bar').getByRole('button', { name: 'Fighters' }).click();
  await page.waitForTimeout(600);
  await page.locator('.btl-drawer button').filter({ hasText: 'Example Fighter' }).first().click();
  await page.waitForTimeout(500);
  await page.locator('.btl-bar').getByRole('button', { name: 'Order' }).click();
  await page.waitForTimeout(600);

  const inFight = () => page.locator('.init-list li').count();
  const seated = await inFight();
  say(seated > 0, `${theme}: ${seated} in the fight`);

  /*
    Clear, which §76 could only guard with a confirm and a one-shot restore.
    §84 retired that button: the way back is now the same stack every other
    mistake on this screen uses.
  */
  await page.getByRole('button', { name: /^Clear$/ }).click();
  await page.getByRole('button', { name: /really clear/i }).click();
  await page.waitForTimeout(400);
  say((await inFight()) === 0, `${theme}: Clear empties the table`);
  say(
    (await page.getByRole('button', { name: /restore last encounter/i }).count()) === 0,
    `${theme}: §76's one-shot Restore has gone`,
  );

  await page.getByRole('button', { name: /↶ Undo/ }).first().click();
  await page.waitForTimeout(500);
  say((await inFight()) === seated, `${theme}: Undo brings the whole fight back`);
  const said = (await toasts().first().innerText().catch(() => '')) || '';
  say(
    /undone/i.test(said) && /in the fight/i.test(said),
    `${theme}: and names what came back - "${said.replace(/\s+/g, ' ').trim().slice(0, 40)}"`,
  );

  // The toast's own way forward, which is the offer §83 built the action for.
  await page.getByRole('button', { name: 'Redo' }).first().click();
  await page.waitForTimeout(500);
  say((await inFight()) === 0, `${theme}: the toast's Redo clears it again`);

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  say((await inFight()) === seated, `${theme}: Ctrl+Z works on the board too`);

  await page.screenshot({ path: `scratchpad/run84-${theme}.png`, fullPage: false });

  // ----------------------------------------------------- the campaign
  await home();
  await page.getByRole('button', { name: /^Campaign/i }).first().click();
  await page.waitForTimeout(900);

  await page.getByLabel(/name this campaign/i).fill('the undone citadel');
  await page.getByRole('button', { name: /start one/i }).click();
  await page.waitForTimeout(400);
  say(
    (await page.getByText('the undone citadel').count()) > 0,
    `${theme}: the campaign is started`,
  );

  await page.getByRole('button', { name: /delete the undone citadel/i }).click();
  await page.getByRole('button', { name: /really delete/i }).click();
  await page.waitForTimeout(400);
  say(
    (await page.getByText('the undone citadel').count()) === 0,
    `${theme}: and deleted, confirm and all`,
  );

  /*
    The one that matters: a campaign's chronicle cannot be rebuilt from
    anything else in the app, and the Undo button has to still be on screen
    when the list it sat above is empty.
  */
  await page.getByRole('button', { name: /↶ Undo/ }).first().click();
  await page.waitForTimeout(400);
  say(
    (await page.getByText('the undone citadel').count()) > 0,
    `${theme}: Undo brings the deleted campaign back`,
  );

  // ------------------------------------ the stacks do not reach across
  await home();
  await page.getByRole('button', { name: /^Dungeons/ }).first().click();
  await page.waitForTimeout(900);
  say(
    await page.getByRole('button', { name: /↶ Undo/ }).first().isDisabled(),
    `${theme}: the editor's stack is its own, and starts empty on arrival`,
  );

  const body = await page.evaluate(() => document.body.innerText);
  say(!/NaN|undefined/.test(body), `${theme}: no NaN or undefined on the page`);
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
