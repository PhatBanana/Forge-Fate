import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §161. The backup reminder, end to end: a party two weeks old with no
  backup is reminded at open, the reminder's button downloads the backup,
  and the next open is quiet - a backup resets the clock.
*/
const browser = await chromium.launch({ executablePath: EXE });

/** Write one key straight into IndexedDB, as the app's own store holds it. */
const putKey = (page, key, value) =>
  page.evaluate(([k, v]) => new Promise((resolve) => {
    const req = indexedDB.open('dnd-forge', 1);
    req.onsuccess = () => {
      const tx = req.result.transaction('kv', 'readwrite');
      if (v === null) tx.objectStore('kv').delete(k);
      else tx.objectStore('kv').put(v, k);
      tx.oncomplete = () => resolve(null);
    };
  }), [key, value]);

const toasts = (page) => page.locator('.toasts').innerText().catch(() => '');

for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((t) => { localStorage.setItem('dnd-forge:theme:v1', t); }, theme);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /use these rules/i }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /show me an example/i }).first().click();
  await page.waitForTimeout(1200);
  say(!/back up now/i.test(await toasts(page)), `${theme}: a fresh party is not lectured`);

  // Fifteen days pass with no backup.
  await putKey(page, 'dnd-forge:backup-clock:v1', String(Date.now() - 15 * 86400000));
  await putKey(page, 'dnd-forge:backup-snooze:v1', null);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  say(/no backup of your characters/i.test(await toasts(page)), `${theme}: two weeks on, the reminder comes`);
  await page.screenshot({ path: `scratchpad/run161-reminder-${theme}.png` });

  // Its button is the backup.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.toasts').getByRole('button', { name: /back up now/i }).click(),
  ]);
  say(/forge-fate-backup-.*\.json/.test(download.suggestedFilename()), `${theme}: the reminder's button downloads the backup`);
  await page.waitForTimeout(600);

  // Opened again: quiet, and the panel says when.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  say(!/no backup of your characters/i.test(await toasts(page)), `${theme}: after a backup, the next open is quiet`);
  await page.locator('.gbar-home').first().click().catch(() => {});
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /characters & bestiary/i }).first().click();
  await page.waitForTimeout(700);
  await page.getByRole('tab', { name: /import \/ export/i }).or(page.getByRole('button', { name: /import \/ export/i })).first().click();
  await page.waitForTimeout(500);
  say(
    /last backup on this device: today/i.test(await page.locator('body').innerText()),
    `${theme}: the panel says the last backup was today`,
  );

  say(errors.length === 0, `${theme}: no console errors${errors.length ? ' - ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// The first screens now carry toasts too: a store refusing writes at boot
// (the one-time migration write) is said on the setup screen itself.
{
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    };
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const onSetup = (await page.getByRole('button', { name: /use these rules/i }).count()) > 0;
  say(
    onSetup && /saving failed/i.test(await toasts(page)),
    'a save failure at boot is visible on the first-run screen',
  );
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll clear.');
process.exit(problems.length ? 1 : 0);
