import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §156-§158, one walk. A blank sheet, a Cleric this time - because a 2014
  Cleric owes a subclass at level 1, which is the step §156 added. Along the
  way: the class kit inside the loadout step, Surprise me on the who card,
  the name suggester filling the draft, and a curtain call with a face frame
  and the story line.
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

  // §158: the dice button, standing on the first card.
  say(
    (await card.getByRole('button', { name: /surprise me/i }).count()) === 1,
    `${theme}: Surprise me stands on the who card`,
  );

  // §158: the class kit lives inside the loadout step, door still below it.
  await page.getByRole('button', { name: /what you wear and what you hold/i }).click();
  await page.waitForTimeout(500);
  const loadout = await card.innerText();
  say(/starting equipment/i.test(loadout), `${theme}: the loadout step carries the class kit`);
  say(/take this kit/i.test(loadout), `${theme}: one click from equipped`);
  await page.screenshot({ path: `scratchpad/run158-kit-${theme}.png` });

  // Back to the first question, and this walk goes Cleric.
  await page.getByRole('button', { name: /who you are/i }).first().click();
  await page.waitForTimeout(500);
  await card.getByLabel('Class').selectOption({ label: 'Cleric' });
  await page.waitForTimeout(500);
  await card.locator('.suggestion summary').first().click();
  await page.waitForTimeout(300);
  await card.getByRole('button', { name: /load this pairing/i }).first().click();
  await page.waitForTimeout(900);

  // The walk: answer whatever the card asks until the curtain call.
  let sawCalling = false;
  let suggested = '';
  /* The Acolyte grants two language picks, so this branch runs more than
     once - and a chip is a toggle, so clicking the same one twice would
     un-answer it. A fresh tongue per visit. */
  const tongues = ['Dwarvish', 'Elvish', 'Giant', 'Goblin', 'Gnomish', 'Halfling'];
  let tongueIx = 0;
  for (let turn = 0; turn < 30; turn++) {
    const title = (await card.locator('h2').first().innerText()).toLowerCase();

    if (title.includes('your calling')) {
      // §156: the step the flow never used to ask.
      sawCalling = true;
      await card.getByRole('button', { name: 'Apply' }).first().click();
      await page.waitForTimeout(600);
      continue;
    }
    if (title.includes('where you came from')) {
      await card.getByRole('button', { name: /answer it under identity/i }).click();
      await page.waitForTimeout(800);
      await page.getByLabel('Background').selectOption({ label: 'Acolyte' });
      await page.waitForTimeout(400);
      await backToGuided();
      continue;
    }
    if (title.includes('spells prepared')) {
      // A preparing caster's checklist is a form on the dense page; recording
      // the known spells is what the flow ranks. Skip past it.
      await card.getByRole('button', { name: /skip for now/i }).click();
      await page.waitForTimeout(400);
      continue;
    }
    if (title.includes('languages')) {
      await card.getByRole('button', { name: /answer it under/i }).click();
      await page.waitForTimeout(800);
      // The door's own scroll can eat the first click, so open until open.
      const row = page.getByRole('button', { name: /tools and languages/i }).first();
      for (let i = 0; i < 4 && (await row.getAttribute('aria-expanded')) !== 'true'; i++) {
        await row.click();
        await page.waitForTimeout(500);
      }
      await page.getByRole('button', { name: tongues[tongueIx++], exact: true }).click();
      await page.waitForTimeout(400);
      await backToGuided();
      continue;
    }
    if (title.includes('what are you called')) {
      // §157: the suggester fills the draft; the walk keeps what it offered.
      await card.getByRole('button', { name: /suggest one/i }).click();
      await page.waitForTimeout(200);
      suggested = await card.getByLabel('Character name').inputValue();
      say(suggested.trim().length > 2, `${theme}: the dice offered "${suggested}"`);
      await card.getByRole('button', { name: 'Name them' }).click();
      await page.waitForTimeout(600);
      continue;
    }
    if (title.includes('is ready')) break;
    if (title.includes('what is wrong')) {
      const donePip = page.getByRole('button', { name: /is ready/i });
      if ((await donePip.count()) > 0) {
        await donePip.first().click();
        await page.waitForTimeout(400);
        continue;
      }
      break;
    }
    const apply = card.getByRole('button', { name: 'Apply' });
    if ((await apply.count()) > 0) {
      await apply.first().click();
      await page.waitForTimeout(600);
      continue;
    }
    break;
  }

  say(sawCalling, `${theme}: §156 - the Cleric was asked for their calling`);
  const finale = await card.innerText();
  say(
    new RegExp(`${suggested}\\s+is ready`, 'i').test(finale.replace(/\n/g, ' ')),
    `${theme}: the curtain call announces the suggested name`,
  );
  // §157: the face frame, upload buttons and all; §158: the story line.
  say((await card.locator('.cs-portrait').count()) === 1, `${theme}: the face frame stands on the curtain call`);
  say(/personality, ideals, bonds and flaws/i.test(finale), `${theme}: the story is acknowledged`);
  await page.screenshot({ path: `scratchpad/run158-done-${theme}.png` });

  say(errors.length === 0, `${theme}: no console errors${errors.length ? ' - ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll clear.');
process.exit(problems.length ? 1 : 0);
