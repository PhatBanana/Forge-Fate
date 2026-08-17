import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

/*
  §86 audit, before any CSS is written: what actually overflows at 380px on
  the three player screens, and what the battle and editor look like there.
  Findings drive the section; nothing is fixed on instinct.
*/
const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 380, height: 820 } });
const page = await ctx.newPage();
await page.addInitScript(() => { localStorage.setItem('dnd-forge:theme:v1', 'dark'); });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /use these rules/i }).first().click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /show me an example/i }).first().click();
await page.waitForTimeout(900);

const overflowers = async (label) => {
  const wide = await page.evaluate(() => {
    const bad = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth) {
      for (const el of document.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > doc.clientWidth + 1 || r.left < -1)) {
          const cls = typeof el.className === 'string' ? el.className.split(/\s+/)[0] : '';
          bad.push(`${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} right=${Math.round(r.right)} left=${Math.round(r.left)} w=${Math.round(r.width)}`);
        }
      }
    }
    return { scroll: doc.scrollWidth, client: doc.clientWidth, bad: bad.slice(0, 25) };
  });
  console.log(`\n== ${label}: scrollWidth ${wide.scroll} vs ${wide.client}${wide.bad.length ? '' : ' (no horizontal overflow)'}`);
  for (const line of wide.bad) console.log('   ', line);
};

const home = async () => {
  const gbar = page.locator('.gbar-home').first();
  if (await gbar.count()) await gbar.click();
  else {
    const menu = page.locator('.btl-cmd-home').filter({ hasText: 'Menu' }).first();
    if (await menu.count()) await menu.click();
  }
  await page.waitForTimeout(600);
};

// The hub.
await home();
await overflowers('hub');
await page.screenshot({ path: 'scratchpad/audit86-hub.png', fullPage: true });

// The Builder.
await page.getByRole('button', { name: /build a character/i }).first().click();
await page.waitForTimeout(1200);
await overflowers('builder (top)');
await page.screenshot({ path: 'scratchpad/audit86-builder.png', fullPage: false });
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 3));
await page.waitForTimeout(300);
await overflowers('builder (mid)');

// The sheet.
await home();
await page.getByRole('button', { name: /the character sheet/i }).first().click();
await page.waitForTimeout(1200);
await overflowers('sheet');
await page.screenshot({ path: 'scratchpad/audit86-sheet.png', fullPage: false });

// Characters (a desk screen too, and reachable by a player).
await home();
await page.getByRole('button', { name: /characters & bestiary/i }).first().click();
await page.waitForTimeout(900);
await overflowers('characters');

// The battle, as it stands - to see what the notice must replace.
await home();
await page.getByRole('button', { name: /run a battle|resume the fight/i }).first().click();
await page.waitForTimeout(1500);
await overflowers('battle');
await page.screenshot({ path: 'scratchpad/audit86-battle.png', fullPage: false });

// The editor.
await home();
await page.getByRole('button', { name: /^Dungeons/ }).first().click();
await page.waitForTimeout(1200);
await overflowers('dungeons');
await page.screenshot({ path: 'scratchpad/audit86-dungeons.png', fullPage: false });

await browser.close();
console.log('\naudit done');
