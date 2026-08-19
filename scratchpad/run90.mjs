import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §90. The Delve, walked whole in a real browser: a goblin authored into a
  place on the Dungeons screen, "Begin a delve" pressed once, and the battle
  arriving mid-run - party seated at the entrance, fog down, the denizen
  asleep in the dark, the counters on the glass. Then the breath between
  rooms, and a reload that comes back mid-run, because the encounter owns it.
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

  // Seat the fighter first: the delve keeps whoever is already in the fight.
  await page.locator('.gbar-home').first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /run a battle|resume the fight/i }).first().click();
  await page.waitForTimeout(1200);
  await page.locator('.btl-bar').getByRole('button', { name: 'Fighters' }).click();
  await page.waitForTimeout(600);
  await page.locator('.btl-drawer button').filter({ hasText: 'Example Fighter' }).first().click();
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ------------------------------------- author the place, denizen and all
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^Dungeons/ }).first().click();
  await page.waitForTimeout(900);

  await page.getByLabel('Search monsters').fill('goblin');
  await page.waitForTimeout(400);
  const goblinRow = page.locator('.dgn-list li').filter({ has: page.locator('b', { hasText: /^Goblin$/ }) });
  await goblinRow.getByRole('button', { name: 'Wander' }).click();
  await page.waitForTimeout(300);
  say(
    /wandering — placed on deploy/.test(await page.locator('.dgn-side').innerText()),
    `${theme}: a goblin lives here now, wandering until the deploy`,
  );

  await page.getByLabel('Name this dungeon').fill('The Sunken Vault');
  await page.getByRole('button', { name: /save this map/i }).click();
  await page.waitForTimeout(400);

  // ------------------------------------------------------ the one press in
  // The saved row sits deep in the side panel's scroll; a dispatched click
  // reaches the button without fighting the sticky chrome above it.
  await page
    .getByRole('button', { name: /begin a delve into the sunken vault/i })
    .dispatchEvent('click');
  await page.waitForTimeout(1500);

  say(
    (await page.locator('.toast').filter({ hasText: /the delve begins/i }).count()) > 0,
    `${theme}: the door says the run has started`,
  );
  const strip = (await page.locator('.turn-delve').textContent().catch(() => '')) ?? '';
  say(/\d+\/\d+ rooms/.test(strip), `${theme}: the counters fly on the glass - "${strip.trim()}"`);
  say(
    (await page.locator('.dmap-token.character').first().getAttribute('data-at')) !== null,
    `${theme}: the party is seated at the entrance`,
  );
  say(
    (await page.locator('.dmap-token.monster').count()) === 0,
    `${theme}: the goblin sleeps unseen in the dark - fog is down`,
  );

  // ------------------------------------------- the breath between rooms
  await page.getByRole('button', { name: /start the fight/i }).click();
  await page.waitForTimeout(600);
  const breath = page.getByRole('button', { name: /catch your breath/i });
  say((await breath.count()) === 1, `${theme}: with nobody hostile awake, a breath is offered`);
  await breath.click();
  await page.waitForTimeout(600);
  const rested = (await page.locator('.turn-delve').textContent()) ?? '';
  say(/1 rest/.test(rested), `${theme}: and the rest is counted - "${rested.trim()}"`);

  // --------------------------------------------- the reload: mid-run back
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /resume the fight/i }).first().click();
  await page.waitForTimeout(1200);
  const back = (await page.locator('.turn-delve').textContent().catch(() => '')) ?? '';
  say(
    /\d+\/\d+ rooms · 1 rest/.test(back),
    `${theme}: a reload comes back mid-run - "${back.trim()}"`,
  );

  if (theme === 'dark') await page.screenshot({ path: 'scratchpad/run90-dark.png', fullPage: false });
  else await page.screenshot({ path: 'scratchpad/run90-light.png', fullPage: false });

  const body = await page.evaluate(() => document.body.innerText);
  say(!/NaN|undefined/.test(body), `${theme}: no NaN or undefined on the page`);
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
