import { chromium, devices } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §80. One row, one hand.

  The unit tests pin the machinery (DamageField's clamp-and-clear, the row
  menu's items, the Remove confirm, the wall hit-test). The browser proves
  the shape: an initiative row is [name, HP readout, damage field, ⋯] with
  Delay appearing only once the fight runs; the ⋯ menu drives Hide and the
  badge appears; Remove arms Really/Keep on the row; the cockpit's typed
  field and the row's readout agree about the same goblin; the log panel
  scrolls instead of truncating; the After drawer answers mid-fight; the
  drawer hints are visible text; and the Builder's Abilities and Feats
  sections have their contextual rail panels.
*/
const browser = await chromium.launch({ executablePath: EXE });

/* The bar toggles: a click on an open drawer closes it. Check the state. */
const ensureDrawer = async (page, name, on = true) => {
  const button = page.locator('.btl-bar').getByRole('button', { name });
  if (((await button.getAttribute('aria-pressed')) === 'true') !== on) await button.click();
  await page.waitForTimeout(500);
};

const intoBattleWithGoblin = async (page) => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /use these rules/i }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /show me an example/i }).first().click();
  await page.waitForTimeout(900);

  await page.getByRole('button', { name: /^Battle →$/ }).first().click();
  await page.waitForTimeout(1200);

  // The empty pitch's own door opens the Fighters drawer, which holds the
  // party list and the bestiary both (§75).
  await page.getByRole('button', { name: /add the fighters/i }).click();
  await page.waitForTimeout(600);
  await page.locator('.btl-drawer button').filter({ hasText: 'Example Fighter' }).first().click();
  await page.waitForTimeout(500);

  await page.getByLabel(/search the bestiary/i).fill('goblin');
  await page.waitForTimeout(400);
  const entry = page.locator('.mon-list li').filter({ has: page.locator('b', { hasText: /^Goblin$/ }) }).first();
  await entry.getByRole('button', { name: 'Add', exact: true }).click();
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
};

for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((t) => { localStorage.setItem('dnd-forge:theme:v1', t); }, theme);

  await intoBattleWithGoblin(page);

  // The row, before the fight: HP is a readout, damage is typed, the wall
  // of nine buttons is one ⋯ - and Delay is not here yet.
  await ensureDrawer(page, 'Order');
  const row = page.locator('.init-list li').filter({ hasText: 'Goblin' }).first();
  say((await row.locator('.init-hp b').count()) === 1, `${theme}: the goblin's HP is a readout`);
  say((await row.locator('input').count()) === 2,
    `${theme}: the row holds exactly two inputs - initiative and the damage amount`);
  const rowField = row.getByLabel(/damage or healing/i);
  say((await rowField.count()) === 1, `${theme}: the shared damage field is on the row`);
  say((await row.getByRole('button', { name: /^More for Goblin$/ }).count()) === 1,
    `${theme}: the ⋯ menu button is on the row`);
  say((await row.getByRole('button', { name: 'Delay', exact: true }).count()) === 0,
    `${theme}: Delay stays away until the fight runs`);

  // Typed damage on the row: 7 in, 7 off the readout, and the field clears.
  const hpBefore = parseInt(await row.locator('.init-hp b').innerText(), 10);
  await rowField.fill('7');
  await row.getByRole('button', { name: 'Damage', exact: true }).click();
  await page.waitForTimeout(300);
  const hpAfter = parseInt(await row.locator('.init-hp b').innerText(), 10);
  say(hpAfter === hpBefore - 7, `${theme}: typed 7 damage lands exactly (${hpBefore} → ${hpAfter})`);
  say((await rowField.inputValue()) === '', `${theme}: and the field clears itself`);
  await rowField.fill('7');
  await row.getByRole('button', { name: 'Heal', exact: true }).click();
  await page.waitForTimeout(300);
  say(parseInt(await row.locator('.init-hp b').innerText(), 10) === hpBefore,
    `${theme}: 7 healing brings it back`);

  // The ⋯ menu: Hide rolls Stealth, the badge appears, stepping out clears it.
  await row.getByRole('button', { name: /^More for Goblin$/ }).click();
  await page.waitForTimeout(300);
  const menu = row.locator('.row-menu-list');
  for (const item of ['Roll init', 'Pop out', 'Surprised', 'Dormant', 'Hide', 'Remove']) {
    say((await menu.getByRole('menuitem', { name: item, exact: true }).count()) === 1,
      `${theme}: the menu holds ${item}`);
  }
  await menu.getByRole('menuitem', { name: 'Hide', exact: true }).click();
  await page.waitForTimeout(400);
  // Case-blind: the badges render through text-transform: uppercase.
  say(/hidden \d+/i.test(await row.locator('.init-flags').innerText().catch(() => '')),
    `${theme}: the hidden badge appears on the row`);
  await row.getByRole('button', { name: /^More for Goblin$/ }).click();
  await page.waitForTimeout(300);
  await menu.getByRole('menuitem', { name: 'Step out of hiding', exact: true }).click();
  await page.waitForTimeout(400);
  say((await row.locator('.init-flags').count()) === 0, `${theme}: stepping out clears the badge`);

  // Remove arms on the row and Keep disarms it.
  await row.getByRole('button', { name: /^More for Goblin$/ }).click();
  await page.waitForTimeout(300);
  await menu.getByRole('menuitem', { name: 'Remove', exact: true }).click();
  await page.waitForTimeout(300);
  say((await row.getByRole('button', { name: 'Really remove', exact: true }).count()) === 1,
    `${theme}: Remove asks on the row first`);
  await row.getByRole('button', { name: 'Keep', exact: true }).click();
  await page.waitForTimeout(300);
  say((await page.locator('.init-list li').filter({ hasText: 'Goblin' }).count()) === 1,
    `${theme}: Keep keeps the goblin`);

  // The cockpit's field and the row's readout are one number: select the
  // goblin, damage it 3 from the rail, read the row.
  await row.getByRole('button', { name: /^Show Goblin in the rail$/ }).click();
  await page.waitForTimeout(400);
  const cockpit = page.locator('.rail-monster');
  const cockpitField = cockpit.getByLabel(/damage or healing/i);
  say((await cockpitField.count()) === 1, `${theme}: the cockpit carries the same typed field`);
  await cockpitField.fill('3');
  await cockpit.getByRole('button', { name: 'Damage', exact: true }).click();
  await page.waitForTimeout(300);
  say(parseInt(await row.locator('.init-hp b').innerText(), 10) === hpBefore - 3,
    `${theme}: the cockpit's 3 damage shows on the row (${hpBefore} → ${hpBefore - 3})`);

  // Into the fight: Delay arrives, the After drawer answers mid-fight, the
  // log panel is built to scroll, and the drawer hint is visible words.
  await page.getByRole('button', { name: /start the fight/i }).click();
  await page.waitForTimeout(900);
  await ensureDrawer(page, 'Order');
  say((await row.getByRole('button', { name: 'Delay', exact: true }).count()) === 1,
    `${theme}: Delay joins the row once the fight runs`);
  await ensureDrawer(page, 'Order', false);

  await ensureDrawer(page, 'After');
  say((await page.getByText('So far this fight').count()) === 1,
    `${theme}: the After drawer answers while the fight is on`);
  say(/How it went/.test(await page.locator('.drawer-hint').innerText().catch(() => '')),
    `${theme}: the drawer hint is visible text, not a tooltip`);
  const logOverflow = await page
    .locator('.battle-log')
    .first()
    .evaluate((el) => getComputedStyle(el).overflowY)
    .catch(() => 'missing');
  say(logOverflow === 'auto', `${theme}: the log panel scrolls (overflow-y: ${logOverflow})`);

  await page.screenshot({ path: `scratchpad/run80-${theme}.png`, fullPage: false });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // The Builder's contextual rail: Abilities and Feats have their panels now.
  await page.getByRole('button', { name: 'Menu' }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /build a character/i }).first().click();
  await page.waitForTimeout(900);
  /*
    Scrolled, not clicked: §33.7's spy owns `section` in a real browser and
    overrules a rail click within the second. Case-blind because the panel
    headings are uppercased by CSS. Feats is asserted in BuilderTab.test.tsx
    instead - it is the last section, so at the page's bottom the band the
    spy measures against can never reach it, which is §33.7's shape and not
    this section's business.
  */
  await page.evaluate(() => document.getElementById('section-abilities')?.scrollIntoView());
  await page.waitForTimeout(800);
  say(/What a .+ wants/i.test(await page.locator('.rail').innerText()),
    `${theme}: the Abilities section's rail says what the class wants`);

  const body = await page.evaluate(() => document.body.innerText);
  say(!/NaN|undefined/.test(body), `${theme}: no NaN or undefined on the page`);
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctx.close();
}

// One touch pass: the row's controls are fingerable on an iPad.
{
  const ctx = await browser.newContext({ ...devices['iPad Pro 11'] });
  const page = await ctx.newPage();
  await page.addInitScript(() => { localStorage.setItem('dnd-forge:theme:v1', 'dark'); });
  await intoBattleWithGoblin(page);
  await ensureDrawer(page, 'Order');
  const row = page.locator('.init-list li').filter({ hasText: 'Goblin' }).first();

  /*
    The §80 tablet fix, pinned: the bar used to take its height from the area
    reserved for the docked drawer, so it covered the panel it had opened.
    Ask the document what is actually on top of the row.
  */
  const onTop = await row.evaluate((li) => {
    const b = li.getBoundingClientRect();
    const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return { inDrawer: !!hit?.closest('.btl-drawer'), what: hit?.className ?? '?' };
  });
  say(onTop.inDrawer, `tablet: the open drawer is reachable, not under the bar (${onTop.what})`);

  for (const name of [/^More for Goblin$/, 'Damage']) {
    const box = await row.getByRole('button', { name, exact: typeof name === 'string' }).boundingBox();
    say((box?.height ?? 0) >= 38, `tablet: ${String(name)} is ≥38px tall (${Math.round(box?.height ?? 0)}px)`);
  }
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
