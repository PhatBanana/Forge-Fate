import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §66. The PS1 tactical renderer, pressed where real pixels come out.

  ## The environment fact this probe settled first

  Headless chromium at this pinned build provides WebGL2 through SwiftShader
  with NO launch flags at all - verified before writing the rest of this file
  (`glcheck.mjs`, renderer string "ANGLE … SwiftShader driver"). Neither
  `--enable-unsafe-swiftshader` nor `--use-angle=swiftshader` is needed, so
  the GL leg launches bare, and the GL-OFF leg has to *disable* WebGL
  explicitly to prove the fallback.

  ## The one check that matters most

  The cross-renderer agreement: the Classic SVG carries `data-at`, so it can
  say exactly where on screen a pawn is drawn. Toggling to the GL renderer at
  the same fitted camera, a click at that same client point must select the
  same token - because both views consume the same `engine/iso.ts` projection
  and the same ViewBox. This is the §32.1 "drawing and hit test are one
  rectangle" invariant, proven across renderers rather than within one.

  ## What stays with the unit tests

  Vertex-level geometry (scene.test.ts), the packing (atlas.test.ts), the
  Bayer arithmetic (runtime.test.ts) and the fallback wiring
  (GlIsoMap.test.tsx). This probe asks only what they cannot: do pixels come
  out, do they change when the camera turns, and does clicking work.
*/

/*
  Read the frame back from inside the page: `getContext` on the app's own
  canvas returns the SAME live context, and `preserveDrawingBuffer` means
  the last blit is still in the default framebuffer to be read. Returns the
  luma variance (a flat clear scores ~0) and a position-weighted hash, so
  "different frame" is checkable without shipping a PNG decoder.
*/
const frameStats = (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector('canvas.glmap');
    if (!canvas) return null;
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return null;
    const w = canvas.width;
    const h = canvas.height;
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let sum = 0;
    let sumSq = 0;
    let hash = 0;
    const n = w * h;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const luma = 0.299 * pixels[o] + 0.587 * pixels[o + 1] + 0.114 * pixels[o + 2];
      sum += luma;
      sumSq += luma * luma;
      hash = (hash * 31 + ((luma * (i % 977)) | 0)) >>> 0;
    }
    const mean = sum / n;
    return { variance: sumSq / n - mean * mean, hash };
  });

const enterBattle = async (page, theme) => {
  /*
    The key is `dnd-forge:theme:v1` - with the version suffix. Every probe
    before this one wrote `dnd-forge:theme`, which the app ignores, so their
    "dark" runs were silently light. Nothing those probes asserted was
    theme-dependent enough to notice; the GL palette is, which is how the
    defect finally surfaced. Recorded here so the next probe copies the
    right line.
  */
  await page.addInitScript((t) => { localStorage.setItem('dnd-forge:theme:v1', t); }, theme);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /use these rules/i }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /show me an example/i }).first().click();
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: /run a battle|resume the fight/i }).first().click();
  await page.waitForTimeout(1200);
  // Somebody on the board, so there is a pawn to draw and click.
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
};

const browser = await chromium.launch({ executablePath: EXE });

for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await enterBattle(page, theme);

  // ---------------------------------------------------------- the GL board
  await page.getByRole('button', { name: 'Tactical view' }).click();
  await page.waitForTimeout(900);

  say(await page.locator('canvas.glmap').count() === 1, `${theme}: the tactical view is a GL canvas`);
  say(await page.locator('svg.isomap').count() === 0, `${theme}: and the SVG board is not also there`);

  const frame1 = await frameStats(page);
  say(
    !!frame1 && frame1.variance > 40,
    `${theme}: the frame has real content, not a flat clear (variance ${frame1?.variance.toFixed(0)})`,
  );

  // The camera: a quarter turn must repaint the board differently.
  await page.keyboard.press('e');
  await page.waitForTimeout(600);
  const frame2 = await frameStats(page);
  say(!!frame2 && frame2.hash !== frame1?.hash, `${theme}: rotating with E repaints the board`);
  await page.keyboard.press('q');
  await page.waitForTimeout(600);

  /*
    Cross-renderer agreement. Classic tells us where the pawn is drawn -
    its group carries data-at and a bounding box - and the GL view, at the
    same fitted camera, must resolve a click at that same point to the same
    token. Same projection module, same ViewBox: this is the invariant.
  */
  await page.getByRole('button', { name: 'Classic look' }).click();
  await page.waitForTimeout(700);
  say(await page.locator('svg.isomap').count() === 1, `${theme}: Classic look brings the SVG board back`);
  await page.keyboard.press('0');
  await page.waitForTimeout(400);
  const pawnBox = await page.locator('.isomap .iso-token').first().boundingBox();
  say(!!pawnBox, `${theme}: the Classic board says where the pawn is drawn`);

  await page.getByRole('button', { name: 'Classic look' }).click();
  await page.waitForTimeout(700);
  await page.keyboard.press('0');
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => document.body.innerText.includes('NOBODY SELECTED'));
  await page.mouse.click(pawnBox.x + pawnBox.width / 2, pawnBox.y + pawnBox.height * 0.9);
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => document.body.innerText.includes('NOBODY SELECTED'));
  say(
    before && !after,
    `${theme}: clicking where Classic drew the pawn selects them in GL - one projection, two renderers`,
  );

  // The Classic choice persists: reload, return, still classic.
  await page.getByRole('button', { name: 'Classic look' }).click();
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: /run a battle|resume the fight/i }).first().click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Tactical view' }).click();
  await page.waitForTimeout(700);
  say(
    (await page.locator('svg.isomap').count()) === 1 &&
      (await page.getByRole('button', { name: 'Classic look' }).getAttribute('aria-pressed')) === 'true',
    `${theme}: the Classic choice survives a reload`,
  );
  // Put it back for the next theme's run.
  await page.getByRole('button', { name: 'Classic look' }).click();
  await page.waitForTimeout(400);

  await page.screenshot({ path: `scratchpad/run66-${theme}.png`, fullPage: false });

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

// ------------------------------------------------- the GL-OFF fallback leg
{
  const blocked = await chromium.launch({
    executablePath: EXE,
    args: ['--disable-webgl', '--disable-webgl2'],
  });
  const page = await (await blocked.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
  await enterBattle(page, 'dark');
  await page.getByRole('button', { name: 'Tactical view' }).click();
  await page.waitForTimeout(900);
  say(
    (await page.locator('svg.isomap').count()) === 1 &&
      (await page.locator('canvas.glmap').count()) === 0,
    'no-WebGL browser: the SVG fallback answers, with all its DOM intact',
  );
  // And the toggle is honestly absent - there is nothing to be classic about.
  say(
    (await page.getByRole('button', { name: 'Classic look' }).count()) === 0,
    'no-WebGL browser: the Classic toggle is not offered',
  );
  await blocked.close();
}

console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
