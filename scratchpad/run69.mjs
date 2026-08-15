import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §69. The walk: tokens march between tiles instead of teleporting.

  Unlike §68's lunge, the walk IS drivable end to end in a browser without
  dice: arm Move, click a tile, and the whole chain - walkInto → noteWalk →
  walk seq on the token → animation clock → pixels - runs on a sure thing.

  The geography comes from the Classic SVG, which is the established trick
  (run66): its tiles and tokens carry data-at, so the probe reads where the
  fighter stands, picks an empty floor tile two squares away, toggles back
  to GL and clicks the same client point - both renderers share the
  projection and the fitted camera, so the point lands on the same square.

  What the hashes must then show: the frame differs mid-walk from its
  before-frame, differs AGAIN once the walk lands (a teleport would already
  be at rest by the first hash), and finally two late hashes match - the
  loop retired. And Classic must agree the fighter genuinely stands on the
  clicked square, so the animation we hashed was a real move, not a repaint.
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

/** Where the fighter stands, read off the Classic SVG. Assumes Classic is up. */
const fighterAt = (page) =>
  page.evaluate(() => {
    const token = [...document.querySelectorAll('.isomap .iso-token')].find((g) =>
      (g.textContent ?? '').includes('Example Fighter'),
    );
    return token?.getAttribute('data-at') ?? null;
  });

const toggleClassic = async (page) => {
  await page.getByRole('button', { name: 'Classic look' }).click();
  await page.waitForTimeout(700);
  await page.keyboard.press('0');
  await page.waitForTimeout(400);
};

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
  await page.keyboard.press('0');
  await page.waitForTimeout(400);

  await page.getByRole('button', { name: /start the fight/i }).click();
  await page.waitForTimeout(900);

  /*
    The geography, from Classic: where the fighter is, which nearby tiles
    exist, and which squares other bodies already hold. Distance two in a
    straight line - ten feet, comfortably inside anyone's budget.
  */
  await toggleClassic(page);
  const geo = await page.evaluate(() => {
    const token = [...document.querySelectorAll('.isomap .iso-token')].find((g) =>
      (g.textContent ?? '').includes('Example Fighter'),
    );
    const at = token?.getAttribute('data-at');
    if (!at) return null;
    const [fx, fy] = at.split(',').map(Number);
    const occupied = new Set(
      [...document.querySelectorAll('.isomap .iso-token')].map((g) => g.getAttribute('data-at')),
    );
    const candidates = [];
    for (const [dx, dy] of [[2, 0], [0, 2], [-2, 0], [0, -2]]) {
      const key = `${fx + dx},${fy + dy}`;
      const between = `${fx + dx / 2},${fy + dy / 2}`;
      const tile = document.querySelector(`.iso-top[data-at="${key}"]`);
      if (!tile || occupied.has(key) || occupied.has(between)) continue;
      const box = tile.getBoundingClientRect();
      candidates.push({ key, cx: box.x + box.width / 2, cy: box.y + box.height / 2 });
    }
    return { at, candidates };
  });
  say(!!geo && geo.candidates.length > 0, `${theme}: Classic yields the fighter's square and open tiles nearby`);
  await toggleClassic(page);

  // Arm the walk - the Move command in the standing cockpit menu.
  await page.getByRole('button', { name: /^Move$/ }).first().click();
  await page.waitForTimeout(500);

  let landed = null;
  for (const candidate of geo?.candidates ?? []) {
    const before = await frameHash(page);
    await page.mouse.click(candidate.cx, candidate.cy);
    await page.waitForTimeout(150);
    const mid = await frameHash(page);
    await page.waitForTimeout(1600);
    const settled = await frameHash(page);
    await page.waitForTimeout(400);
    const settledAgain = await frameHash(page);

    await toggleClassic(page);
    const nowAt = await fighterAt(page);
    await toggleClassic(page);
    if (nowAt !== candidate.key) continue; // refused (a wall, terrain) - try the next tile

    landed = candidate.key;
    say(mid !== null && mid !== before, `${theme}: the walk is visibly in flight 150ms after the click`);
    say(
      settled !== null && settled !== mid,
      `${theme}: the frame keeps evolving until the body lands - a teleport would already be still`,
    );
    say(settledAgain === settled, `${theme}: the board comes to rest - the walk loop put itself down`);
    break;
  }
  say(
    landed !== null,
    `${theme}: the fighter genuinely stands on the clicked square (${landed ?? 'nowhere'}) - the animation was a real move`,
  );

  await page.screenshot({ path: `scratchpad/run69-${theme}.png`, fullPage: false });

  const body = await page.evaluate(() => document.body.innerText);
  say(!/NaN|undefined/.test(body), `${theme}: no NaN or undefined on the page`);
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
