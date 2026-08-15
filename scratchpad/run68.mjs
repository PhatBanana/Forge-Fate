import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §68. The little animations: a hit shakes and flashes, an attack lunges.

  What only a browser can prove: that the clock actually ticks. Before §68 a
  hit painted a *static* wash - the frame right after the damage landed and
  the frame a second later were identical. Now the wash fades and the pawn
  shakes, so the board must (a) differ mid-animation from its before-frame,
  (b) KEEP CHANGING after the click with no further input - the one thing a
  static wash cannot do - and (c) come to rest: two late hashes equal,
  because pruneAnims empties and the rAF loop puts itself down.

  The hit leg is driven end-to-end here through the cockpit's own −5 button:
  HP drop → flash seq → animation clock → pixels. The lunge's browser leg
  would need a real attack to land through real dice, which §65's probe
  already declined once as a coin-flip; its geometry (peak reach, direction
  normalisation, timing, the counter-attacked attacker summing both motions)
  is pinned in motion.test.ts, and the three noteLunge call sites feed the
  same seq-detection path this probe exercises via flash.
*/
const frameHash = (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector('canvas.glmap');
    if (!canvas) return null;
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return null;
    const w = canvas.width;
    const h = canvas.height;
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let hash = 0;
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      const luma = 0.299 * pixels[o] + 0.587 * pixels[o + 1] + 0.114 * pixels[o + 2];
      hash = (hash * 31 + ((luma * (i % 977)) | 0)) >>> 0;
    }
    return hash;
  });

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
  await page.getByRole('button', { name: /run a battle|resume the fight/i }).first().click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /^Fighters/ }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /example fighter/i }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^Field/ }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /put everyone on the map/i }).first().click();
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  await page.getByRole('button', { name: 'Tactical view' }).click();
  await page.waitForTimeout(900);
  say(await page.locator('canvas.glmap').count() === 1, `${theme}: the GL board is up`);

  // Zoom in so the fighter's sprite is more than a few pixels, then never
  // touch the camera again - every hash below sees the same framing.
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  await page.waitForTimeout(600);

  await page.getByRole('button', { name: /start the fight/i }).click();
  await page.waitForTimeout(900);

  // The Order drawer holds the cockpit's −5. Open it BEFORE the before-hash
  // so all three frames share whatever layout the drawer brings.
  await page.getByRole('button', { name: /^Order/ }).first().click();
  await page.waitForTimeout(700);
  // §80: the ±5 pair became the shared typed field - fill 5, press Damage.
  const fighterRow = page.locator('.init-list li').filter({ hasText: /fighter/i }).first();
  const damageInput = fighterRow.getByLabel(/damage or healing/i);
  say((await damageInput.count()) === 1, `${theme}: the fighter's damage field is in the Order drawer`);
  const hitForFive = async () => {
    await damageInput.fill('5');
    await fighterRow.getByRole('button', { name: 'Damage', exact: true }).click();
  };

  const before = await frameHash(page);
  say(before !== null, `${theme}: the before-frame reads back`);

  await hitForFive();
  // ~120ms in: the shake (380ms) and the wash (450ms) are both mid-flight.
  await page.waitForTimeout(120);
  const mid = await frameHash(page);
  say(mid !== null && mid !== before, `${theme}: the hit visibly lands mid-animation`);

  // Past every duration: the animation must have moved on from the mid frame
  // (a static wash would hash identical here) and then stopped moving.
  await page.waitForTimeout(1600);
  const settled = await frameHash(page);
  say(
    settled !== null && settled !== mid,
    `${theme}: the frame keeps evolving after the click - the wash fades, the shake ends`,
  );
  await page.waitForTimeout(400);
  const settledAgain = await frameHash(page);
  say(
    settledAgain === settled,
    `${theme}: the board comes to rest - the animation loop put itself down`,
  );

  await page.screenshot({ path: `scratchpad/run68-${theme}.png`, fullPage: false });

  const body = await page.evaluate(() => document.body.innerText);
  say(!/NaN|undefined/.test(body), `${theme}: no NaN or undefined on the page`);
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
