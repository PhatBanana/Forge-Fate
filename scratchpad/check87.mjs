import { chromium } from 'playwright-core';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §87's contract is "no behavior change", and for CSS that means: the
  computed styles of .chip and .chip-btn after the consolidation equal the
  values the two blocks declared before it, copied here from the old file.
*/
const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => { localStorage.setItem('dnd-forge:theme:v1', 'dark'); });
await page.goto('http://localhost:4180', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /use these rules/i }).first().click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /show me an example/i }).first().click();
await page.waitForTimeout(1200);

/*
  Neither class is unconditionally on screen: .chip needs a taken feat, and
  .chip-btn lives in the battle's Fighters drawer. Take a feat, then open
  the drawer, and measure both where they actually render.
*/
await page.locator('.crow-toggle').filter({ hasText: 'Spend now' }).first().click();
await page.waitForTimeout(500);
// The ranked cards are collapsed too - expand the first, then take it.
await page.locator('.crow.is-open .card-head, .crow.is-open .sug-head, .crow.is-open .suggestion, .crow.is-open [class*="card"]').first().click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /^Take /, exact: false }).first().click();
await page.waitForTimeout(600);

const chipStyles = await page.evaluate(() => {
  const el = document.querySelector('.chip');
  if (!el) return null;
  const s = getComputedStyle(el);
  return {
    display: s.display, gap: s.gap, background: s.backgroundColor,
    border: s.borderTopWidth + ' ' + s.borderTopStyle,
    radius: s.borderTopLeftRadius, padding: s.padding,
    fontSize: s.fontSize, color: s.color,
  };
});

await page.getByRole('button', { name: /battle →/i }).first().click();
await page.waitForTimeout(1400);
await page.locator('.btl-bar').getByRole('button', { name: 'Fighters' }).click();
await page.waitForTimeout(700);

const styles = await page.evaluate((chip) => {
  const grab = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const s = getComputedStyle(el);
    return {
      display: s.display, gap: s.gap, background: s.backgroundColor,
      border: s.borderTopWidth + ' ' + s.borderTopStyle,
      radius: s.borderTopLeftRadius, padding: s.padding,
      fontSize: s.fontSize, color: s.color,
    };
  };
  return { chip, chipBtn: grab('.chip-btn') };
}, chipStyles);
console.log(JSON.stringify(styles, null, 1));

const { chip, chipBtn } = styles;
say(!!chip && !!chipBtn, 'both classes are on the example page');
if (chip) {
  // 'flex', not the declared 'inline-flex': measured against the pre-§87
  // build, which computed exactly the same - another rule already won on
  // display before this section, and the consolidation preserves it.
  say(chip.display === 'flex' && chip.gap === '7px', '.chip keeps its measured display + 7px gap');
  say(chip.padding === '4px 6px 4px 12px', `.chip keeps its padding (${chip.padding})`);
  say(chip.fontSize === '13px' && chip.radius === '999px', '.chip keeps 13px and the full radius');
  say(chip.border === '1px solid', '.chip keeps its border');
}
if (chipBtn) {
  say(chipBtn.padding === '5px 14px', `.chip-btn keeps its padding (${chipBtn.padding})`);
  say(chipBtn.fontSize === '13px' && chipBtn.radius === '999px', '.chip-btn keeps 13px and the full radius');
  say(chipBtn.border === '1px solid', '.chip-btn keeps its border');
  say(chip && chipBtn.background === chip.background, 'both sit on the same sunken fill');
  say(chip && chipBtn.color !== chip.color, '.chip-btn keeps its dimmer text - the difference survives');
}
await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
