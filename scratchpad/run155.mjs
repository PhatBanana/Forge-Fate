import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §155. The whole flow, walked: Start blank → Who you are → every choice
  answered (ranked ones by taking the top pick, forms on the dense page) →
  the naming → the curtain call, whose door opens the finished sheet. This
  is the probe for the two beats games end on and the flow used to lack.
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
  await page.getByRole('button', { name: /start blank/i }).first().click();
  await page.waitForTimeout(1200);

  const card = page.locator('.flow-step');
  const backToGuided = async () => {
    await page.locator('.gbar-views button', { hasText: /guided/i }).click();
    await page.waitForTimeout(600);
  };

  // Walk the flow. Each pass answers whatever the card is asking.
  let named = false;
  for (let turn = 0; turn < 14; turn++) {
    const title = (await card.locator('h2').first().innerText()).toLowerCase();

    if (title.includes('who you are')) {
      await card.locator('.suggestion summary').first().click();
      await page.waitForTimeout(300);
      await card.getByRole('button', { name: /load this pairing/i }).first().click();
      await page.waitForTimeout(900);
      continue;
    }
    if (title.includes('where you came from')) {
      await card.getByRole('button', { name: /answer it under identity/i }).click();
      await page.waitForTimeout(800);
      await page.getByLabel('Background').selectOption({ label: 'Soldier' });
      await page.waitForTimeout(400);
      await backToGuided();
      continue;
    }
    if (title.includes('languages')) {
      await card.getByRole('button', { name: /answer it under/i }).click();
      await page.waitForTimeout(800);
      await page.getByRole('button', { name: /tools and languages/i }).first().click();
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: 'Dwarvish', exact: true }).click();
      await page.waitForTimeout(400);
      await backToGuided();
      continue;
    }
    if (title.includes('what are you called')) {
      say(true, `${theme}: the flow asks for a name before it lets go`);
      await card.getByLabel('Character name').fill('Sir Probe');
      await page.getByRole('button', { name: 'Name them' }).click();
      await page.waitForTimeout(600);
      named = true;
      continue;
    }
    if (title.includes('is ready')) break;
    if (title.includes('what is wrong')) {
      // The review; if the done pip exists the walk is over, else move on.
      const donePip = page.getByRole('button', { name: /is ready/i });
      if ((await donePip.count()) > 0) {
        await donePip.first().click();
        await page.waitForTimeout(400);
        continue;
      }
      break;
    }
    // A ranked step: take the best available pick.
    const apply = card.getByRole('button', { name: 'Apply' });
    if ((await apply.count()) > 0) {
      await apply.first().click();
      await page.waitForTimeout(600);
      continue;
    }
    break;
  }

  say(named, `${theme}: the naming beat was part of the walk`);
  const finale = await card.locator('h2').first().innerText();
  say(/sir probe is ready/i.test(finale), `${theme}: the curtain call announces them by name`);
  say(
    /AC \d+ · \d+ hit points/i.test(await card.innerText()),
    `${theme}: with the confirm-screen summary`,
  );
  await page.screenshot({ path: `scratchpad/run155-done-${theme}.png` });

  // The door leads to the finished sheet - the gbar names the screen and
  // the switcher lights SHEET. (The name itself lives in an input there,
  // which innerText cannot see; the initials "SP" stand in.)
  await card.getByRole('button', { name: /read the sheet/i }).click();
  await page.waitForTimeout(1200);
  say(
    /character sheet/i.test(await page.locator('.gbar-screen').first().innerText()) &&
      /sheet/i.test(await page.locator('.gbar-views .is-on').first().innerText()),
    `${theme}: the door opens the sheet reading`,
  );

  say(errors.length === 0, `${theme}: no console errors${errors.length ? ' - ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll clear.');
process.exit(problems.length ? 1 : 0);
