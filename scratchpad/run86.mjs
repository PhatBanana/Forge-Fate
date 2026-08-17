import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §86. The narrow pass, scoped as decided: the player screens work at 380px,
  the two board screens say plainly that they want a tablet. The audit that
  opened the section found the §78 single-column work had already carried the
  hub, Builder and Characters to 380 - so half of what this probe pins is
  that they *stay* carried, and the other half is the gate and the one sheet
  defect the audit surfaced.
*/
const browser = await chromium.launch({ executablePath: EXE });

for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 380, height: 820 } });
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
    else await page.getByRole('button', { name: /back to the menu/i }).click();
    await page.waitForTimeout(600);
  };

  /* No sideways scroll, and every game-bar button inside the viewport. */
  const fits = async (label) => {
    const state = await page.evaluate(() => {
      const doc = document.documentElement;
      const scroller = document.querySelector('main');
      const gbar = [...document.querySelectorAll('.gbar button, .gbar a')].map((b) => {
        const r = b.getBoundingClientRect();
        return { text: (b.textContent ?? '').trim().slice(0, 20), right: r.right, left: r.left };
      });
      return {
        doc: doc.scrollWidth <= doc.clientWidth,
        main: !scroller || scroller.scrollWidth <= scroller.clientWidth + 1,
        gbarOut: gbar.filter((b) => b.right > doc.clientWidth + 1 || b.left < -1),
      };
    });
    say(state.doc && state.main, `${theme}: ${label} has no sideways scroll`);
    say(
      state.gbarOut.length === 0,
      `${theme}: ${label}'s bar fits${state.gbarOut.length ? ` - ${state.gbarOut[0].text} sticks out` : ''}`,
    );
  };

  // ------------------------------------------------------- the player screens
  await home();
  await fits('the hub');

  await page.getByRole('button', { name: /build a character/i }).first().click();
  await page.waitForTimeout(1400);
  await fits('the Builder');
  // Walk the whole page: the audit walked it clean and it must stay clean.
  const clean = await page.evaluate(async () => {
    const main = document.querySelector('main');
    for (let y = 0; y < main.scrollHeight; y += 700) {
      main.scrollTop = y;
      await new Promise((r) => setTimeout(r, 60));
      if (main.scrollWidth > main.clientWidth + 1) return `overflow at ${y}`;
    }
    return '';
  });
  say(clean === '', `${theme}: the whole Builder page walks clean${clean ? ` (${clean})` : ''}`);

  await home();
  await page.getByRole('button', { name: /the character sheet/i }).first().click();
  await page.waitForTimeout(1400);
  await fits('the sheet');

  /*
    The one defect the audit found: the name input kept its intrinsic
    twenty-character width and clipped out of its banner cell. Fixed by
    letting it fill the cell; pinned by measuring it against its box.
  */
  const name = await page.evaluate(() => {
    const input = document.querySelector('.cs-charname');
    const cell = input?.parentElement;
    if (!input || !cell) return null;
    return {
      inputRight: input.getBoundingClientRect().right,
      cellRight: cell.getBoundingClientRect().right,
      page: document.documentElement.clientWidth,
    };
  });
  say(
    !!name && name.inputRight <= name.cellRight + 1 && name.inputRight <= name.page,
    `${theme}: the character name stays inside its box (${name ? Math.round(name.inputRight) + ' vs ' + Math.round(name.cellRight) : 'missing'})`,
  );
  await page.screenshot({ path: `scratchpad/run86-${theme}.png`, fullPage: false });

  // ------------------------------------------------------------ the two gates
  await home();
  await page.getByRole('button', { name: /run a battle|resume the fight/i }).first().click();
  await page.waitForTimeout(1400);

  const gate = () => page.locator('.narrow-gate');
  say(await gate().isVisible(), `${theme}: the battle shows the gate at 380`);
  say(
    /battle screen wants a tablet/i.test(await gate().innerText()),
    `${theme}: and it says which screen and why`,
  );
  // The screen behind it is hidden, not half-drawn under it.
  say(
    !(await page.locator('.btl-bar').isVisible().catch(() => false)),
    `${theme}: the crushed command bar is not shown behind it`,
  );

  /*
    The rotation promise: CSS decides, nothing unmounts, so turning the phone
    sideways brings the board straight back - fight intact.
  */
  await page.setViewportSize({ width: 820, height: 380 });
  await page.waitForTimeout(600);
  say(!(await gate().isVisible()), `${theme}: rotate to landscape and the gate steps aside`);
  say(await page.locator('.btl-bar').isVisible(), `${theme}: the board is back, never unmounted`);
  await page.setViewportSize({ width: 380, height: 820 });
  await page.waitForTimeout(600);
  say(await gate().isVisible(), `${theme}: and portrait brings the gate back`);

  await page.getByRole('button', { name: /back to the menu/i }).click();
  await page.waitForTimeout(700);
  say(
    (await page.getByRole('button', { name: /run a battle|resume the fight/i }).count()) > 0,
    `${theme}: its button walks home`,
  );

  await page.getByRole('button', { name: /^Dungeons/ }).first().click();
  await page.waitForTimeout(1200);
  say(
    (await gate().isVisible()) && /dungeon workshop wants a tablet/i.test(await gate().innerText()),
    `${theme}: the workshop gates too, in its own words`,
  );
  if (theme === 'dark') await page.screenshot({ path: 'scratchpad/run86-gate.png', fullPage: false });

  const body = await page.evaluate(() => document.body.innerText);
  say(!/NaN|undefined/.test(body), `${theme}: no NaN or undefined on the page`);
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctx.close();
}

/*
  The other half of the section's contract: nothing above 480 moved. §78's
  probe holds 1024 and 834; this holds the boundary itself.
*/
{
  const ctx = await browser.newContext({ viewport: { width: 481, height: 820 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { localStorage.setItem('dnd-forge:theme:v1', 'dark'); });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /use these rules/i }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /show me an example/i }).first().click();
  await page.waitForTimeout(900);
  await page.locator('.gbar-home').first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /run a battle|resume the fight/i }).first().click();
  await page.waitForTimeout(1400);
  say(
    !(await page.locator('.narrow-gate').isVisible()),
    `481px: one pixel above the line, the battle is a battle`,
  );
  say(await page.locator('.btl-bar').isVisible(), `481px: with its command bar`);
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
