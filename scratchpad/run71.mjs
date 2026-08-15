import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §71. The camera round-trip: moving the map must not shred the board.

  The bug this pins: render() ended each frame with depthMask(false) for the
  overlay pass, and glClear respects the write mask - so the depth buffer
  was never cleared after frame one. A still camera survived (the same
  geometry re-lands on its own depths, LEQUAL passes equals); any pan or
  zoom sent fragments onto pixels holding some older frame's nearer depths,
  which rejected them - ragged holes in the terrain, worse with every step.

  The assertion is exact: hash the fitted frame, zoom in, pan about, refit
  with 0 - the frame must hash IDENTICALLY to the first. Against a stale
  depth buffer this fails by construction (the corruption accumulated on
  the way is still standing when the camera comes home); with the buffer
  cleared each frame, the same camera always paints the same picture.
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
  await page.getByRole('button', { name: 'Tactical view' }).click();
  await page.waitForTimeout(900);
  say(await page.locator('canvas.glmap').count() === 1, `${theme}: the GL board is up`);

  await page.keyboard.press('0');
  await page.waitForTimeout(500);
  const atFit = await frameHash(page);
  say(atFit !== null, `${theme}: the fitted frame reads back`);

  // A workout: zoom twice, wander right and down, wheel-zoom, come home.
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  await page.waitForTimeout(300);
  for (let i = 0; i < 6; i++) { await page.keyboard.press('d'); await page.waitForTimeout(40); }
  for (let i = 0; i < 4; i++) { await page.keyboard.press('s'); await page.waitForTimeout(40); }
  await page.waitForTimeout(300);
  await page.screenshot({ path: `scratchpad/run71-${theme}.png`, fullPage: false });
  await page.keyboard.press('0');
  await page.waitForTimeout(500);
  const backAtFit = await frameHash(page);
  say(
    backAtFit === atFit,
    `${theme}: the fitted frame is pixel-identical after the camera wandered - no depth-buffer residue`,
  );

  const body = await page.evaluate(() => document.body.innerText);
  say(!/NaN|undefined/.test(body), `${theme}: no NaN or undefined on the page`);
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
