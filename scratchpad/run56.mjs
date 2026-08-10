import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

const browser = await chromium.launch({ executablePath: EXE });

for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  // Originals on, and a Druid to look at - the class the section starved most
  // after the Artificer, and the one whose Forge rows are the clearest test.
  await page.addInitScript((t) => {
    localStorage.setItem('dnd-forge:theme', t);
    localStorage.setItem('dnd-forge:originals', 'true');
  }, theme);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  /*
    The first-run wizard is two questions - which rules, then how to start -
    and answering both lands in the Builder. Asked for the example so the
    panels have something in them; the class picker is the same picker either
    way, and an empty build renders half the page as prompts.
  */
  await page.getByRole('button', { name: /use these rules/i }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /show me an example/i }).first().click();
  await page.waitForTimeout(600);
  // The wizard lands on the menu, not on the Builder. Two probes ago this step
  // was missing and every check below was reading the title screen.
  await page.getByRole('button', { name: /build a character/i }).first().click();
  await page.waitForTimeout(900);

  const body = await page.evaluate(() => document.body.innerText);
  say(!/Cannot read|undefined is not/.test(body), `${theme}: builder renders`);

  // The switch is on, so a Forge subclass must be reachable. Search the whole
  // page text rather than a picker selector, which is layout-dependent.
  await page.evaluate(() => {
    const open = [...document.querySelectorAll('details')];
    for (const d of open) d.open = true;
  });
  await page.waitForTimeout(200);

  /*
    The real check, and the reason the first version of it was worthless: it
    matched /Forge/, which the app's own wordmark satisfies. The example build
    is a Fighter, so the Fighter's Forge subclass by name is the assertion -
    a string that can only be on the page if the switch, the fold-in and the
    picker all work.
  */
  /*
    One string, and it has to be this one.

    The first version matched /Forge/, which the app's wordmark satisfies; the
    second matched "Forge original", which the *toggle's own label* satisfies.
    "Warden (Forge)" is in the Fighter's subclass picker and nowhere else, so
    it can only be there if the switch is read at boot, the rows are folded
    into the class, the accessor lets them through and the picker prints the
    provenance. Every one of those was a place this could have failed, and one
    of them had.
  */
  const text = await page.evaluate(() => document.body.innerText);
  say(text.includes('Warden (Forge)'), `${theme}: the Fighter's Forge subclass is offered, labelled as ours`);

  // No horizontal scroll at 1360, the standing rule for the desk screens.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  say(overflow <= 1, `${theme}: no horizontal overflow (${overflow}px)`);

  /*
    And the direction that matters more. Off is the app's claim - that what you
    are looking at is what the books print - so a leak here is worse than a
    row that fails to appear.
  */
  /*
    Turned off through the control rather than by writing storage. An earlier
    draft poked localStorage and was quietly ignored: `hydrate` prefers
    IndexedDB, so the value the app had already carried across won. Pressing
    the button is both the honest test and the one that would have caught it.
  */
  await page.locator('.gbar-home').first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /forge originals/i }).first().click();
  await page.waitForTimeout(900);
  // Read on the menu, where the control lives, before walking away from it.
  const corner = await page.evaluate(() => document.body.innerText);
  say(/Forge originals: off/.test(corner), `${theme}: the toggle says which way it is set`);

  await page.getByRole('button', { name: /build a character/i }).first().click();
  await page.waitForTimeout(800);
  const off = await page.evaluate(() => document.body.innerText);
  say(!off.includes('Warden (Forge)'), `${theme}: and gone again with the switch off`);

  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await page.screenshot({ path: `scratchpad/run56-${theme}.png` });
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
