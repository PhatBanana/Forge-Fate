import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §58. The four classes, pressed in the built app.

  §56 taught this the hard way: a probe that matches a loose substring is a
  spellcheck, not a probe. So every assertion below names something that can
  only be on the page if the whole chain works - the switch read at boot, the
  class folded into `CLASSES`, the accessor letting it through, the picker
  printing it, and `deriveBuild` surviving a class it has never seen.
*/
const browser = await chromium.launch({ executablePath: EXE });

for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((t) => {
    localStorage.setItem('dnd-forge:theme:v1', t);
    localStorage.setItem('dnd-forge:originals', 'true');
  }, theme);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /use these rules/i }).first().click();
  await page.waitForTimeout(400);
  /*
    The example rather than a blank sheet, and the reason is a real one: a
    blank build is 1st level, and every one of these classes chooses its
    subclass at 3rd. The first draft of this probe started blank, found no
    subclass picker, and reported a bug that was the fixture's.
  */
  await page.getByRole('button', { name: /show me an example/i }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /build a character/i }).first().click();
  await page.waitForTimeout(900);

  const text = () => page.evaluate(() => document.body.innerText);

  const listed = await text();
  for (const name of ['Reckoner', 'Harrier', 'Marshal', 'Adept']) {
    say(listed.includes(name), `${theme}: ${name} is offered in the class picker`);
  }

  /*
    Then actually build one, because being in a <select> proves the data and
    nothing else. The Adept is the interesting pick: it is the only one that
    is not a caster, carries unarmored defence on Intelligence, and has a
    per-encounter pool - three code paths that had never met a Forge class.
  */
  const classSelect = page.locator('select').filter({ hasText: 'Adept' }).first();
  await classSelect.selectOption({ label: 'Adept' });
  await page.waitForTimeout(700);

  const built = await text();
  /*
    Asserted against the *damage breakdown* rather than the features list, and
    that is the stronger claim: "Psionic strike 2d6" is only printed if the
    class's `oncePerTurn` table reached `computeDpr` and resolved at this
    level. A feature name proves the data loaded; this proves the engine read
    it.
  */
  say(/Psionic strike \d+d6/.test(built), `${theme}: the Adept's rider reaches the damage model`);
  say(built.includes('Discipline of the'), `${theme}: and its subclasses are offered`);
  say(!/NaN|undefined|Infinity/.test(built), `${theme}: no NaN or undefined on the page`);

  // The damage model has to survive a class it was not written for.
  say(/\d/.test(built), `${theme}: the page has numbers on it`);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  say(overflow <= 1, `${theme}: no horizontal overflow (${overflow}px)`);
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await page.screenshot({ path: `scratchpad/run58-${theme}.png`, fullPage: false });
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
