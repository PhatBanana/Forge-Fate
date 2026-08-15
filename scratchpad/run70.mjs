import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §70. The death: dropping to nought plays the fall-and-flicker.

  Driven end to end through the cockpit's own −5, like §68's hit: the
  fighter has 49 hit points, so nine clicks leave them at 4 and the tenth
  is the kill. The board is hashed settled-at-4-hp (the before-frame), then
  mid-death (the flicker and the fall in flight), then at rest twice. The
  §70 signature is the same shape as §69's: different mid-animation,
  different again at rest - the pre-§70 instant pose-swap would already be
  still by the first hash - then two late hashes equal. Classic then
  confirms the token genuinely stands (lies) at nought: is-down on the
  pawn, so the dissolve we hashed was a real death, not a repaint.
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
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  await page.waitForTimeout(600);

  await page.getByRole('button', { name: /start the fight/i }).click();
  await page.waitForTimeout(900);

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

  // Nine hits: 49 hit points down to 4, every flash given time to die out.
  for (let hit = 0; hit < 9; hit++) {
    await hitForFive();
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(1700);
  const before = await frameHash(page);
  say(before !== null, `${theme}: the at-4-hp board settles for the before-frame`);

  // The kill. ~150ms in, the fall (650ms) and its flicker are mid-flight.
  await hitForFive();
  await page.waitForTimeout(150);
  const mid = await frameHash(page);
  say(mid !== null && mid !== before, `${theme}: the death is visibly in flight 150ms after the kill`);

  await page.waitForTimeout(1700);
  const settled = await frameHash(page);
  say(
    settled !== null && settled !== mid,
    `${theme}: the frame keeps evolving until the body lies still - an instant pose swap would not`,
  );
  await page.waitForTimeout(400);
  const settledAgain = await frameHash(page);
  say(settledAgain === settled, `${theme}: the board comes to rest - the death loop put itself down`);

  // Classic agrees this was a real death: the pawn carries is-down. The
  // Order drawer sits over the camera cluster, so put it away first.
  await page.getByRole('button', { name: /^Order/ }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Classic look' }).click();
  await page.waitForTimeout(700);
  say(
    (await page.locator('.isomap .iso-token.is-down').count()) > 0,
    `${theme}: Classic shows the fighter down - the dissolve was a real death`,
  );
  await page.getByRole('button', { name: 'Classic look' }).click();
  await page.waitForTimeout(400);

  await page.screenshot({ path: `scratchpad/run70-${theme}.png`, fullPage: false });

  const body = await page.evaluate(() => document.body.innerText);
  say(!/NaN|undefined/.test(body), `${theme}: no NaN or undefined on the page`);
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
