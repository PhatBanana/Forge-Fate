import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §160. What only a real browser proves:
    - a store that refuses writes (IndexedDB put throwing, as a full quota
      does) is said out loud rather than swallowed;
    - the browser is asked to keep the data, once there is data to keep;
    - a full backup survives the browser forgetting everything: download,
      wipe IndexedDB and localStorage, restore, and the party is back.
*/
const browser = await chromium.launch({ executablePath: EXE });

const toastText = (page) => page.locator('.toasts').innerText().catch(() => '');
/** The roster as the browser actually stores it - IndexedDB, not the DOM. */
const storedRoster = (page) =>
  page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.open('dnd-forge', 1);
    req.onsuccess = () => {
      try {
        const get = req.result.transaction('kv', 'readonly').objectStore('kv').get('dnd-forge:roster:v1');
        get.onsuccess = () => resolve(String(get.result ?? ''));
        get.onerror = () => resolve('');
      } catch {
        resolve('');
      }
    };
    req.onerror = () => resolve('');
  }));
const start = async (page, how) => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /use these rules/i }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: how }).first().click();
  await page.waitForTimeout(1200);
};

for (const theme of ['dark', 'light']) {
  // ------------------------------------- a store that refuses every write
  {
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const page = await ctx.newPage();
    await page.addInitScript((t) => {
      localStorage.setItem('dnd-forge:theme:v1', t);
      // A full quota: every put on the object store throws.
      IDBObjectStore.prototype.put = function () {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      };
    }, theme);
    await start(page, /show me an example/i);
    await page.waitForTimeout(800);
    say(
      /saving failed/i.test(await toastText(page)),
      `${theme}: a refused write is said out loud, not swallowed`,
    );
    await page.screenshot({ path: `scratchpad/run160-refused-${theme}.png` });
    await ctx.close();
  }

  // ------------------------------------- durable storage, and the backup
  {
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript((t) => {
      localStorage.setItem('dnd-forge:theme:v1', t);
      // Record the ask without depending on what headless Chromium answers.
      const real = navigator.storage.persist.bind(navigator.storage);
      navigator.storage.persist = () => {
        window.__persistAsked = (window.__persistAsked ?? 0) + 1;
        return real();
      };
      navigator.storage.persisted = async () => false;
    }, theme);

    await start(page, /show me an example/i);
    await page.waitForTimeout(800);
    const asked = await page.evaluate(() => window.__persistAsked ?? 0);
    say(asked === 1, `${theme}: the browser is asked to keep the data, once (${asked})`);

    // Download a full backup from Characters & bestiary → Import / Export.
    await page.locator('.gbar-home').first().click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /characters & bestiary/i }).first().click();
    await page.waitForTimeout(700);
    await page.getByRole('tab', { name: /import \/ export/i }).or(page.getByRole('button', { name: /import \/ export/i })).first().click();
    await page.waitForTimeout(500);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /download a full backup/i }).click(),
    ]);
    const file = await download.path();
    const text = await readFile(file, 'utf8');
    const backup = JSON.parse(text);
    say(backup.format === 'forge-fate-backup', `${theme}: the backup file is the backup format`);
    say(/Example/.test(backup.data['dnd-forge:roster:v1'] ?? ''), `${theme}: and holds the party`);
    await page.screenshot({ path: `scratchpad/run160-backup-${theme}.png` });

    // The browser forgets everything.
    await page.evaluate(async () => {
      localStorage.clear();
      await new Promise((resolve) => {
        const req = indexedDB.deleteDatabase('dnd-forge');
        req.onsuccess = req.onerror = req.onblocked = () => resolve(null);
      });
    });
    await start(page, /start blank/i);
    await page.waitForTimeout(600);
    say(!/Example Fighter/.test(await storedRoster(page)), `${theme}: wiped - the party is gone`);
    await page.locator('.gbar-home').first().click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /characters & bestiary/i }).first().click();
    await page.waitForTimeout(700);

    // Restore it.
    await page.getByRole('tab', { name: /import \/ export/i }).or(page.getByRole('button', { name: /import \/ export/i })).first().click();
    await page.waitForTimeout(500);
    await page.getByLabel('Restore from a backup file').setInputFiles(file);
    await page.waitForTimeout(500);
    say(
      /holds \d+ saved stores/i.test(await page.locator('body').innerText()),
      `${theme}: the file is described before anything is overwritten`,
    );
    await Promise.all([
      page.waitForEvent('load'),
      page.getByRole('button', { name: /restore and reload/i }).click(),
    ]);
    await page.waitForTimeout(1500);
    say(/Example Fighter/.test(await storedRoster(page)), `${theme}: restored - the party is back in storage`);
    say(
      /Example Fighter/.test(await page.locator('.title-screen, body').first().innerText()),
      `${theme}: and on the hub after the reload`,
    );
    await page.screenshot({ path: `scratchpad/run160-restored-${theme}.png` });
    say(errors.length === 0, `${theme}: no console errors${errors.length ? ' - ' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll clear.');
process.exit(problems.length ? 1 : 0);
