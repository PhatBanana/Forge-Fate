import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §67. The class sprites and their stances, pressed as pixels.

  What only a browser can prove here: that the *stance machinery* actually
  repaints. The token's stance is derived state (down / hiding / fight
  running / at ease), the sprite is an atlas entry keyed on it, and a frame
  hash that fails to change when the fight starts would mean the whole chain
  - stance on the token, key in the placement, raster in the atlas - broke
  somewhere the unit tests cannot see stitched together.

  So: the same board is hashed at ease (idle pose) and mid-fight (battle
  pose), with the camera untouched between them, and the hashes must differ.
  The pose *grids* differing is already pinned in pixelart.test.ts; this is
  the end-to-end half. Sneak and down are the same chain through the same
  key and are exercised by the unit tests; a probe that had to win a Hide
  roll or land a kill to see them would hang on dice, which §65's probe
  already declined once.
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

  // Zoom in on the fighter so the sprite is more than a few pixels, then
  // hold the camera still across the stance change.
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  await page.waitForTimeout(600);

  const atEase = await frameHash(page);
  say(atEase !== null, `${theme}: the at-ease frame reads back`);

  // The fight starts: the same character, the same camera, a new stance.
  await page.getByRole('button', { name: /start the fight/i }).click();
  await page.waitForTimeout(900);
  const midFight = await frameHash(page);
  say(
    midFight !== null && midFight !== atEase,
    `${theme}: starting the fight repaints the pawn into the battle stance`,
  );

  await page.screenshot({ path: `scratchpad/run67-${theme}.png`, fullPage: false });

  // The Classic SVG is untouched by §67: it still stands its §37 card pawn.
  await page.getByRole('button', { name: 'Classic look' }).click();
  await page.waitForTimeout(700);
  say(
    (await page.locator('.isomap .iso-pawn-card').count()) > 0,
    `${theme}: the Classic view still stands its cardboard pawn`,
  );
  await page.getByRole('button', { name: 'Classic look' }).click();
  await page.waitForTimeout(400);

  const body = await page.evaluate(() => document.body.innerText);
  say(!/NaN|undefined/.test(body), `${theme}: no NaN or undefined on the page`);
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
