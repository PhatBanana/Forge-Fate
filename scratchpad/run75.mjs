import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §75. The UI pass: fewer doors, each in the right wall.

  What only a browser proves:
    - the battle bar is eight buttons and none of them clips off the edge,
      even at the narrow width where "the Field button disappeared";
    - Fighters is one drawer holding both the party and the bestiary;
    - the group save rolls from Areas, next to the hazards it belongs with;
    - the camera cluster slides clear of an open drawer, so Classic look
      and the zoom keep working with a drawer up (§70's probe had to close
      the drawer to reach them);
    - Character is the bar's one exit to the sheet;
    - Species × Class is off the hub and behind the Builder's gbar door.
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

  // The example lands on the hub; it no longer lists Species × Class -
  // the Builder's gbar door carries it now.
  const hub = await page.locator('.title-menu').innerText();
  say(!/Species × Class/.test(hub), `${theme}: the hub menu no longer lists Species × Class`);
  await page.getByRole('button', { name: /build a character/i }).first().click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Species × Class' }).first().click();
  await page.waitForTimeout(900);
  say(
    /species × class/i.test(await page.locator('.gbar-screen').first().innerText()),
    `${theme}: the Builder's gbar door opens the pairings screen`,
  );
  await page.getByRole('button', { name: /back to the builder/i }).first().click();
  await page.waitForTimeout(600);
  say(
    (await page.getByRole('button', { name: /^Battle →$/ }).count()) > 0,
    `${theme}: and its door leads back to the Builder`,
  );

  // Into the battle: the bar is eight buttons, whole at full width.
  await page.getByRole('button', { name: /^Battle →$/ }).first().click();
  await page.waitForTimeout(1200);
  const barButtons = page.locator('.btl-bar .btl-cmd');
  say((await barButtons.count()) === 8, `${theme}: the bar is eight buttons (was ten)`);
  // innerText reports the CSS text-transform, so compare case-blind.
  const labels = (await barButtons.allInnerTexts()).map((l) => l.trim().toLowerCase());
  say(
    ['fighters', 'field', 'areas', 'order', 'prep', 'after', 'character', 'menu']
      .every((l) => labels.includes(l)),
    `${theme}: Fighters and Character replaced Party/Bestiary and Sheet/Builder`,
  );

  // At the width that used to clip the tenth button, every button is visible.
  await page.setViewportSize({ width: 820, height: 700 });
  await page.waitForTimeout(600);
  let whole = true;
  for (let i = 0; i < 8; i++) {
    const box = await barButtons.nth(i).boundingBox();
    if (!box || box.x + box.width > 821) whole = false;
  }
  say(whole, `${theme}: at 820px every bar button is on screen - the Field button cannot vanish`);
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.waitForTimeout(600);

  // Fighters: one drawer, party and bestiary together.
  await page.getByRole('button', { name: /^Fighters/ }).first().click();
  await page.waitForTimeout(900);
  const drawer = await page.locator('.btl-drawer').innerText();
  say(/Your party/i.test(drawer), `${theme}: the Fighters drawer holds the party`);
  say(
    (await page.getByLabel(/search the bestiary/i).count()) === 1,
    `${theme}: and the bestiary search, in the same drawer`,
  );

  // The camera cluster slides clear of the open drawer and stays clickable.
  const drawerBox = await page.locator('.btl-drawer').boundingBox();
  const camBox = await page.locator('.hud-cam').boundingBox();
  say(
    camBox.x >= drawerBox.x + drawerBox.width,
    `${theme}: the camera cluster slides out from under the drawer`,
  );
  await page.getByRole('button', { name: 'Tactical view' }).click();
  await page.waitForTimeout(800);
  say(
    (await page.getByRole('button', { name: /classic look/i }).count()) > 0 &&
      await page.getByRole('button', { name: /classic look/i }).first().isVisible(),
    `${theme}: Classic look is reachable with a drawer open`,
  );
  await page.getByRole('button', { name: 'Plan view' }).click();
  await page.waitForTimeout(500);

  // The group save now rolls from Areas, beside the hazards.
  await page.getByRole('button', { name: /^Areas/ }).first().click();
  await page.waitForTimeout(700);
  const areas = await page.locator('.btl-drawer').innerText();
  say(/DC/.test(areas) && /roll the room/i.test(areas), `${theme}: the group save lives in Areas`);

  // And Order no longer carries it - initiative only.
  await page.getByRole('button', { name: /^Order/ }).first().click();
  await page.waitForTimeout(700);
  say(
    !/roll the room/i.test(await page.locator('.btl-drawer').innerText()),
    `${theme}: Order is initiative and conditions, not saves`,
  );

  // Character: the bar's one exit to the loaded character's sheet.
  await page.getByRole('button', { name: /^Character$/ }).first().click();
  await page.waitForTimeout(900);
  say(
    (await page.getByRole('button', { name: /edit in builder/i }).count()) > 0,
    `${theme}: Character lands on the sheet, whose door reaches the Builder`,
  );

  const body = await page.evaluate(() => document.body.innerText);
  say(!/NaN|undefined/.test(body), `${theme}: no NaN or undefined on the page`);
  await page.screenshot({ path: `scratchpad/run75-${theme}.png`, fullPage: false });
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
