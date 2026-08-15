import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4180';

const problems = [];
const say = (ok, what) => { console.log(`${ok ? '  ok ' : ' FAIL'}  ${what}`); if (!ok) problems.push(what); };

/*
  §81. Dungeon furniture: locked doors, hidden rooms, traps.

  The unit tests pin the rules (what `seen` removes, when a trap fires, what
  the hydrator believes). The browser proves the two things only a real run
  can: that a map authored in the Dungeons editor arrives at the battle
  screen with its furniture intact through storage, and that the hidden room
  is *absent* over there rather than merely drawn faintly - the whole design
  of the reveal rests on that being true in both renderers at once.
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

  // ------------------------------------------------ author it in the editor
  // §77 lands the example in the Builder, whose bar goes home by the wordmark
  // - "Menu" is the battle screen's own way out.
  await page.locator('.gbar-home').first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^Dungeons/ }).first().click();
  await page.waitForTimeout(900);

  const map = page.locator('.dmap');
  const box = await map.boundingBox();
  // The editor's map is 48 squares wide; work in squares and convert.
  const squares = 48;
  const step = box.width / squares;
  const clickSquare = async (x, y) => {
    await page.mouse.move(box.x + (x + 0.5) * step, box.y + (y + 0.5) * step);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(150);
  };
  const dragSquares = async (a, b) => {
    await page.mouse.move(box.x + (a.x + 0.5) * step, box.y + (a.y + 0.5) * step);
    await page.mouse.down();
    await page.mouse.move(box.x + (b.x + 0.5) * step, box.y + (b.y + 0.5) * step, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(200);
  };

  // A blank grid, so nothing the generator made confuses the counting.
  await page.getByLabel(/how many rooms/i).fill('0');
  await page.waitForTimeout(300);
  say(
    (await page.locator('.dmap-room').count()) === 0,
    `${theme}: the editor starts from a blank grid`,
  );

  // Two rooms: one ordinary, one to hide.
  await page.getByRole('button', { name: 'Room' }).click();
  await dragSquares({ x: 2, y: 2 }, { x: 7, y: 7 });
  await dragSquares({ x: 12, y: 2 }, { x: 15, y: 5 });
  say((await page.locator('.dmap-room').count()) === 2, `${theme}: two rooms drawn`);

  // A door into the second, barred by a second click on the same square.
  await page.getByRole('button', { name: 'Door' }).click();
  await clickSquare(12, 3);
  say((await page.locator('.dmap-door').count()) === 1, `${theme}: a door`);
  await clickSquare(12, 3);
  say((await page.locator('.dmap-bar').count()) === 1, `${theme}: the second click bars it`);

  // The second room becomes secret.
  await page.getByRole('button', { name: 'Hidden' }).click();
  await clickSquare(13, 3);
  say(
    (await page.locator('.dmap-room.is-hidden').count()) === 1,
    `${theme}: the editor dashes the hidden room - the DM can still see it here`,
  );

  // A trap in the first room, in the DM's own words.
  await page.getByRole('button', { name: 'Trap' }).click();
  await page.getByLabel(/what it does/i).fill('scything blade, DC 15 Dex');
  await clickSquare(5, 5);
  say((await page.locator('.dmap-trap').count()) === 1, `${theme}: a trap, armed`);

  // Save it under a name.
  await page.getByLabel(/name this dungeon/i).fill('the sunken abbey');
  await page.getByRole('button', { name: /save this map/i }).click();
  await page.waitForTimeout(400);
  say(
    (await page.getByText('the sunken abbey').count()) > 0,
    `${theme}: the map is in the drawer`,
  );

  // ------------------------------------------------- take it to the battle
  await page.getByRole('button', { name: /use the sunken abbey in a battle/i }).first().click();
  await page.waitForTimeout(1600);

  // `textContent`, not `innerText`: these are SVG <text> nodes, which have no
  // innerText at all - Playwright hands back a list of undefined for them.
  const roomNumbers = () =>
    page.locator('.dmap-number').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));
  say(
    JSON.stringify(await roomNumbers()) === '["1"]',
    `${theme}: the hidden room is not on the battle map at all (${(await roomNumbers()).join(',')})`,
  );
  say(
    (await page.locator('.dmap-door').count()) === 0,
    `${theme}: and its door went with it - a door into rock is not a door`,
  );
  say(
    (await page.locator('.dmap-trap').count()) === 0,
    `${theme}: an armed trap is invisible to the table`,
  );

  // The tactical renderer agrees, because the floor itself is absent: the
  // hidden room's squares are not ground, so nothing is drawn there.
  await page.getByRole('button', { name: 'Tactical view' }).click();
  await page.waitForTimeout(900);
  say(
    (await page.locator('.btl-stage canvas, .iso').count()) > 0,
    `${theme}: the tactical view draws the same architecture`,
  );
  await page.getByRole('button', { name: 'Plan view' }).click();
  await page.waitForTimeout(500);

  // The DM's reveal, in the Field drawer.
  await page.locator('.btl-bar').getByRole('button', { name: 'Field' }).click();
  await page.waitForTimeout(600);
  const reveal = page.getByRole('button', { name: /reveal room 2/i });
  say((await reveal.count()) === 1, `${theme}: the Field drawer lists what is still to be found`);
  await reveal.click();
  await page.waitForTimeout(600);
  say(
    JSON.stringify(await roomNumbers()) === '["1","2"]',
    `${theme}: revealing puts the room on the board`,
  );
  say(
    (await page.locator('.dmap-bar').count()) === 1,
    `${theme}: and its locked door arrives barred`,
  );
  say(
    (await reveal.count()) === 0,
    `${theme}: a found room stops being offered`,
  );

  await page.screenshot({ path: `scratchpad/run81-${theme}.png`, fullPage: false });

  const body = await page.evaluate(() => document.body.innerText);
  say(!/NaN|undefined/.test(body), `${theme}: no NaN or undefined on the page`);
  say(errors.length === 0, `${theme}: no console errors${errors.length ? ` - ${errors[0]}` : ''}`);

  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
