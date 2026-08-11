import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §60. Which edition's condition text a player is actually shown.

  The trap this probe is written around: `conditionText` falls back to the 2014
  wording when there is no 2024 line, so "the tooltip has words in it" passes
  for both editions no matter how broken the wiring is. Every assertion below
  therefore names a phrase that exists in **exactly one** of the two summaries -
  "advantage on initiative" is only in the 2024 Invisible, "without magic" only
  in the 2014 one - and each is checked positively for its own edition and
  negatively for the other. A stuck ruleset fails half of them.
*/
const browser = await chromium.launch({ executablePath: EXE });

// [id, phrase only in 2014, phrase only in 2024]
const SPLIT = [
  ['Invisible', 'without magic', 'advantage on initiative'],
  ['Grappled', 'if the grappler is incapacitated', 'anyone but the grappler'],
  ['Prone', null, 'half your speed rounded down'],
];

for (const theme of ['dark', 'light']) {
  for (const ruleset of ['2014', '2024']) {
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript((t) => { localStorage.setItem('dnd-forge:theme', t); }, theme);

    const tag = `${theme}/${ruleset}`;
    await page.goto(BASE, { waitUntil: 'networkidle' });

    // The first-run question. Both cards say "Use these rules"; pick by order.
    await page.getByRole('button', { name: /use these rules/i }).nth(ruleset === '2014' ? 0 : 1).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /show me an example/i }).first().click();
    await page.waitForTimeout(700);
    await page.getByRole('button', { name: /the character sheet/i }).first().click();
    await page.waitForTimeout(900);

    for (const [name, only2014, only2024] of SPLIT) {
      const tip = await page.getByRole('button', { name, exact: true }).first().getAttribute('title');
      const text = (tip ?? '').toLowerCase();
      const want = ruleset === '2024' ? only2024 : only2014;
      const avoid = ruleset === '2024' ? only2014 : only2024;
      if (want) say(text.includes(want), `${tag}: ${name} says "${want}"`);
      if (avoid) say(!text.includes(avoid), `${tag}: ${name} does not say "${avoid}"`);
    }

    /*
      Then press one, because the tooltip and the paragraph under the track are
      two separate call sites and only one of them was wrong before §60.
    */
    await page.getByRole('button', { name: 'Invisible', exact: true }).first().click();
    await page.waitForTimeout(300);
    const body = (await page.evaluate(() => document.body.innerText)).toLowerCase();
    const wantPara = ruleset === '2024' ? 'advantage on initiative' : 'without magic';
    say(body.includes(wantPara), `${tag}: the Invisible paragraph says "${wantPara}"`);

    say(!/NaN|undefined/.test(body), `${tag}: no NaN or undefined on the page`);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    say(overflow <= 1, `${tag}: no horizontal overflow (${overflow}px)`);
    say(errors.length === 0, `${tag}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

    await page.screenshot({ path: `scratchpad/run60-${theme}-${ruleset}.png`, fullPage: false });
    await ctx.close();
  }
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
