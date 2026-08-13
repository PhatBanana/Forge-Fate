import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §64. Silence on the board, pressed in the built app.

  ## What this probe covers, and what it does not

  It covers the half of §64 reachable without building a caster: the Silence
  zone, which is what makes the V in "V, S, M" mean anything on a
  battlefield. Place it, and the app has to name it and carry the flag that
  stops a verbal component.

  It does **not** cover the component line on the character sheet or the
  "both hands are full" review finding. Reaching either needs a caster with
  spells recorded, and the Builder's spell catalogue opens behind a collapse
  that stays at zero height under this headless browser - an app behaviour
  this section did not introduce and should not paper over with a forced
  click. Those two are covered where they can be pressed honestly:
  `ActionTray.test.tsx` renders the real tray and checks War Caster and
  Silence against real spells, and `regression.test.ts` pins the finding
  against a mace-and-shield Life Cleric. Written down here rather than left
  as a gap somebody has to rediscover.
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
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /run a battle|resume the fight/i }).first().click();
  await page.waitForTimeout(1200);

  await page.getByRole('button', { name: /^Areas/ }).first().click();
  await page.waitForTimeout(500);

  // The palette is a <select> of presets, not a row of buttons.
  const palette = page.locator('select').filter({ hasText: 'Silence' }).first();
  say(await palette.count() === 1, `${theme}: Silence is offered in the areas palette`);
  await palette.selectOption({ label: 'Silence' });
  await page.waitForTimeout(400);

  await page.getByRole('button', { name: /place on map/i }).first().click();
  const box = await page.locator('.dmap').first().boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(700);

  const body = await page.evaluate(() => document.body.innerText);
  say(/silence/i.test(body), `${theme}: the zone lands and is named`);

  /*
    The flag, not just the label. A zone that drew a circle and carried no
    `silences` would look identical on screen and stop nothing - which is
    exactly the class of bug this project keeps finding.

    Read from IndexedDB, not localStorage: `src/persist.ts` moved the whole
    app off the 5MB origin budget, and localStorage is now only the fallback
    for browsers that refuse IDB (and the store the jsdom tests get). Asking
    localStorage here found nothing and would have failed a working feature.
    Writes are coalesced on a 120ms timer, hence the wait above.
  */
  const flagged = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('dnd-forge', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!db.objectStoreNames.contains('kv')) return false;
    const values = await new Promise((resolve, reject) => {
      const request = db.transaction('kv', 'readonly').objectStore('kv').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return values.some((v) => typeof v === 'string' && v.includes('"silences"'));
  });
  say(flagged, `${theme}: and carries the flag that stops a verbal component`);

  say(!/NaN|undefined/.test(body), `${theme}: no NaN or undefined on the page`);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  say(overflow <= 1, `${theme}: no horizontal overflow (${overflow}px)`);
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await page.screenshot({ path: `scratchpad/run64-${theme}.png`, fullPage: false });
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
