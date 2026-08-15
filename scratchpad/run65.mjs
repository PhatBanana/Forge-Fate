import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §65. Climbing, swimming, crawling and jumping, pressed in the built app.

  ## What this probe covers

  Two halves, one on each screen.

  On the **sheet**, the jump distances - the numbers §65 added because a
  player asks for them at a table and the app had never had an answer. They
  have to be there, and the long jump has to be the Strength *score*, which
  is checkable from the page itself: the sheet prints the score in the
  ability block, so the probe reads both and compares them rather than
  hardcoding a number that a change to the example character would break.

  In the **Builder**, the same numbers behind the Speed figure, plus the line
  that tells a player climbing and swimming cost them double. Two surfaces
  show this and both have to actually show it.

  On the **map**, that the wash still draws once a real character is standing
  on it - which is the integration risk, since the walk now asks
  `movementFor` about the selected combatant on every render and a throw
  there would take the battle screen down.

  ## What it does not cover, and why

  **The cost arithmetic end to end.** Charging a swim needs painted water and
  charging a climb needs painted elevation, and both brushes live on the
  Dungeons tab rather than in the battle - there is no path from a running
  fight to a painted pool. Rather than contrive one, the costs are pinned
  where they can be pressed for real: `path.test.ts` runs the actual
  Dijkstra over actual water and actual elevation and checks a swimmer
  crosses at five feet where a walker pays ten.

  **Standing up from prone.** Reaching it needs a token that is already
  prone, which needs a Trip to win a contested roll against live dice - a
  probe that rolls until it wins is a probe that hangs on a bad seed. It is
  pressed in `ActionTray.test.tsx` against the real menu instead.

  Both written down rather than left as gaps somebody has to rediscover.
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

  // ------------------------------------------------------- the sheet's jumps
  await page.getByRole('button', { name: /the character sheet/i }).first().click();
  await page.waitForTimeout(900);

  const chipValue = async (label) =>
    page.evaluate((want) => {
      for (const chip of document.querySelectorAll('.cs-chip')) {
        if (chip.querySelector('span')?.textContent?.trim() === want) {
          return Number(chip.querySelector('b')?.textContent?.trim());
        }
      }
      return null;
    }, label);

  const longJump = await chipValue('Long jump');
  const highJump = await chipValue('High jump');
  say(Number.isFinite(longJump) && longJump > 0, `${theme}: the sheet prints a long jump (${longJump} ft.)`);
  say(Number.isFinite(highJump) && highJump > 0, `${theme}: and a high jump (${highJump} ft.)`);

  /*
    The rule, not just the presence of a number. A long jump is the Strength
    score in feet and a high jump is 3 + the modifier - two different shapes
    off the same ability, which is exactly the pair a tool gets wrong by
    printing the modifier twice. Both are read off the page's own ability
    block, so this stays true if the example character changes.
  */
  const str = await page.evaluate(() => {
    for (const box of document.querySelectorAll('.cs-ability')) {
      if (/str/i.test(box.textContent ?? '')) {
        const numbers = (box.textContent ?? '').match(/\d+/g) ?? [];
        return numbers.map(Number);
      }
    }
    return [];
  });
  const score = str.find((n) => n >= 3 && n <= 30);
  say(
    Number.isFinite(score) && longJump === score,
    `${theme}: the long jump is the Strength score (${score}), not the modifier`,
  );
  say(highJump !== longJump, `${theme}: and the high jump is a different number entirely`);

  // ------------------------------------------------ the Builder's speed panel
  // The one way home from a desk screen is the wordmark chip in the game bar.
  await page.locator('.gbar-home').first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /build a character/i }).first().click();
  await page.waitForTimeout(1200);

  await page.getByRole('button', { name: /^Speed/ }).first().click();
  await page.waitForTimeout(500);
  const glance = await page.evaluate(() => document.querySelector('.statline')?.parentElement?.innerText ?? '');
  say(/Long jump/i.test(glance), `${theme}: the Builder's Speed figure explains the jumps`);
  say(
    /costs? you double|no extra movement/i.test(glance),
    `${theme}: and says what climbing and swimming cost`,
  );

  await page.screenshot({ path: `scratchpad/run65-${theme}-builder.png`, fullPage: false });

  // --------------------------------------------------- the map, with somebody on it
  await page.locator('.gbar-home').first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /run a battle|resume the fight/i }).first().click();
  await page.waitForTimeout(1200);

  await page.getByRole('button', { name: /^Fighters/ }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /example fighter/i }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^Field/ }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /put everyone on the map/i }).first().click();
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  say(await page.locator('.dmap-token').count() > 0, `${theme}: a character is standing on the map`);

  // The wash is armed movement, not a passive halo - §22.5 made the click a
  // priced step rather than a teleport, so Move has to be pressed for it.
  await page.getByRole('button', { name: /start the fight/i }).first().click();
  await page.waitForTimeout(900);
  await page.locator('.dmap-token').first().click();
  await page.waitForTimeout(600);
  const move = page.getByRole('button', { name: /^Move$/ }).first();
  if (await move.count()) {
    await move.click();
    await page.waitForTimeout(700);
  }

  /*
    The wash, drawn for a real character. Its *prices* are pinned in
    `path.test.ts`; what this proves is that the walk can ask `movementFor`
    about a live combatant every render without taking the screen down.
  */
  const lit = await page.locator('.dmap-reach, .dmap-glow, .dmap-step, .dmap-move').count();
  say(lit > 0, `${theme}: the movement wash is drawn for them (${lit} squares)`);

  await page.screenshot({ path: `scratchpad/run65-${theme}.png`, fullPage: false });

  const body = await page.evaluate(() => document.body.innerText);
  say(!/NaN|undefined/.test(body), `${theme}: no NaN or undefined on the page`);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  say(overflow <= 1, `${theme}: no horizontal overflow (${overflow}px)`);
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
