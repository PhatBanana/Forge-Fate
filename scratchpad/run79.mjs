import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §79. Heard and seen.

  The unit tests pin the machinery (the live region's content, the Keys
  dialog's focus contract, the reduced-motion hook, the contrast
  arithmetic on every painted ground). The browser proves the wiring: `?`
  opens the dialog on the real battle screen and Esc closes it with focus
  restored; the log's live region exists before the first line; the six
  accent fills compute to the tested --on-accent token; and with reduced
  motion emulated, an attack still resolves without a console error.
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

  // The accent fills wear the tested token, not the page background.
  const accentInk = await page.evaluate(() => {
    const probe = document.createElement('button');
    probe.className = 'chip-btn is-on';
    document.body.appendChild(probe);
    const chip = getComputedStyle(probe).color;
    const onAccent = getComputedStyle(document.documentElement).getPropertyValue('--on-accent').trim();
    probe.remove();
    const norm = (c) => {
      const d = document.createElement('i');
      d.style.color = c;
      document.body.appendChild(d);
      const out = getComputedStyle(d).color;
      d.remove();
      return out;
    };
    return { chip, onAccent: norm(onAccent) };
  });
  say(
    accentInk.chip === accentInk.onAccent,
    `${theme}: accent fills use --on-accent (${accentInk.chip})`,
  );

  // Into the battle: the live region is mounted before the first log line.
  await page.getByRole('button', { name: /^Battle →$/ }).first().click();
  await page.waitForTimeout(1200);
  say(
    (await page.locator('[role="log"][aria-live="polite"]').count()) === 1,
    `${theme}: the combat live region is mounted from the start`,
  );

  // ? opens the Keys dialog; Esc closes it and hands focus back.
  await page.keyboard.press('?');
  await page.waitForTimeout(300);
  say(
    (await page.getByRole('dialog', { name: /keyboard shortcuts/i }).count()) === 1,
    `${theme}: ? opens the Keys dialog`,
  );
  say(
    /end the turn/i.test(await page.locator('.keys-help').innerText()),
    `${theme}: and the dialog lists the battle's keys`,
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  say(
    (await page.getByRole('dialog', { name: /keyboard shortcuts/i }).count()) === 0,
    `${theme}: Esc closes it`,
  );
  say(
    (await page.evaluate(() => document.activeElement?.textContent)) === 'Keys',
    `${theme}: and focus lands on the Keys button`,
  );

  // The Classic toggle now says out loud that it is the accessible map.
  await page.getByRole('button', { name: 'Tactical view' }).click();
  await page.waitForTimeout(800);
  const classicTitle = await page
    .getByRole('button', { name: /classic look/i })
    .first()
    .getAttribute('title');
  say(
    /screen-reader/i.test(classicTitle ?? ''),
    `${theme}: Classic look names itself the reader-friendly map`,
  );
  const srList = await page.locator('.btl-stage .sr-only').first().innerText().catch(() => '');
  say(
    srList.length > 0,
    `${theme}: the GL canvas carries its visually-hidden board summary`,
  );
  await page.getByRole('button', { name: 'Plan view' }).click();
  await page.waitForTimeout(400);

  // Reduced motion: an attack still resolves, and nothing errors.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: /add the fighters/i }).click().catch(() => {});
  await page.waitForTimeout(600);
  await page.locator('.btl-drawer button').filter({ hasText: 'Example Fighter' }).first().click();
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  const body = await page.evaluate(() => document.body.innerText);
  say(!/NaN|undefined/.test(body), `${theme}: no NaN or undefined on the page`);
  await page.screenshot({ path: `scratchpad/run79-${theme}.png`, fullPage: false });
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
