#!/usr/bin/env node
/**
 * Per-chunk size budgets for the built app.
 *
 * Rollup's own `chunkSizeWarningLimit` is a single number applied to every
 * chunk, which stopped being useful once one chunk became deliberately huge:
 * `srd-2014-text` is 536 kB of SRD prose that is fetched only when somebody
 * opens a description. Under one global limit you either warn about that chunk
 * forever - training everyone to ignore the warning, including on the day it
 * means something - or raise the limit until it covers the largest chunk and
 * stop watching the ones that matter.
 *
 * So the limit in `vite.config.ts` is raised past the text chunk, and the real
 * guard is here: a budget per chunk, checked against what was actually emitted.
 *
 * These are **alarms, not diets**. §59.5 rewrote them after four reactive
 * raises left `data` with 34 bytes of headroom: a limit set to the current
 * size fires on ordinary growth, gets raised, and teaches everyone to raise it
 * again. The ceilings are now far enough above the real sizes that tripping
 * one means something moved, and the two lazy fixtures carry a floor as well,
 * which is the check that catches the failure this file actually exists for.
 *
 * When one fires, the question is *what moved* - not how much to add.
 *
 * ## §139: a per-chunk size is a proxy, and it drifted from the thing it stood for
 *
 * `index` grew 40.9 kB in one change. Thirty of that was two shared chunks -
 * `analyze` and `sheet` - being *inlined* into it: both had been emitted
 * separately because two chunks imported them, one of those importers moved,
 * and Rollup folded them in. Those bytes were already downloaded on first
 * paint; they simply stopped being separate files. The real growth was 22 kB.
 *
 * So the number moved twice as far as the change did, in a direction that
 * says nothing about what a visitor pays. That is the same defect §59.5 named
 * on `data` - an invariant "proxied by a number I keep editing" - and it is
 * why raising `index` on its own would have made this file weaker rather than
 * better calibrated: it would have restored the alarm margin and left the
 * alarm still measuring the wrong thing.
 *
 * The thing worth defending on the eager path is **what a first visit
 * downloads before anything renders**, which is the entry chunk plus every
 * chunk it statically imports. Vite already writes that set into
 * `dist/index.html` as the module script and its `modulepreload` links, so it
 * can be measured as itself rather than inferred from one chunk's size - and
 * it is immune to re-chunking, because moving a module between two chunks
 * that are both on that list does not change the total.
 *
 * `index`'s own ceiling stays, raised to a real alarm margin. It is no longer
 * carrying the whole argument.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not `.pathname` - see the note in build-sw.mjs.
const ASSETS = fileURLToPath(new URL('../dist/assets/', import.meta.url));
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));

/**
 * Budgets in bytes, keyed by the chunk name Vite puts before the hash.
 *
 * A number is a ceiling. `{ max, min }` adds a **floor**, which is the entry
 * that actually does the work - see the two lazy fixtures below.
 *
 * ## §59.5: what this check is for, after four raises taught me it was not
 *   what I thought
 *
 * `data` went 500 -> 530 -> 575 -> 580 kB, every raise reactive, every one
 * because content grew and the number was in the way. By the last of them the
 * chunk was 579,966 bytes against a 580,000 budget: **34 bytes of headroom**,
 * in the same commit as a note telling the next reader not to nudge the
 * number. A limit you raise every time it fires is not a limit. It is a
 * change detector with a misleading name, and it costs a build every time
 * somebody writes another sentence of class prose.
 *
 * The number was never defending anything measurable either. First paint is
 * ~237 kB gzipped across `data`, `vendor` and `index`, on a PWA whose service
 * worker precaches, so repeat visits are free. Nothing about 580 kB was a
 * performance decision.
 *
 * **What is worth defending is the chunking.** `vite.config.ts` excludes two
 * fixtures from `data` because both are dynamically imported and most visitors
 * never fetch either:
 *
 *     srd-2014-text.json      ~537 kB - rules descriptions
 *     srd-2014-monsters.json  ~519 kB - stat blocks
 *
 * `data` is downloaded by *every* visitor on first paint. If that exclusion is
 * lost, or somebody adds a static import of a heavy fixture from a data file,
 * half a megabyte moves in front of everyone and **nothing visibly breaks** -
 * no test fails, no page looks wrong.
 *
 * So the shape changed. `data` gets a ceiling high enough to mean "half a
 * megabyte just moved" rather than "somebody wrote three more sentences", and
 * the two lazy chunks get a **floor**: if a fixture ever migrates into `data`,
 * the chunk that used to carry it shrinks or disappears, and the floor catches
 * it whichever way it goes. That is the invariant checked as itself rather
 * than proxied by a number I keep editing.
 */
const BUDGETS = {
  /*
    An alarm, not a diet. 1 MB against a current ~580 kB, which is roughly the
    size of either lazy fixture - so this fires when one of them lands here and
    stays quiet while the app's own content grows a paragraph at a time.

    Every visitor pays this chunk on first paint, and that is a deliberate
    trade rather than an oversight: `classes.ts` folds the Forge rows into each
    class at module load, because `subclassesFor` is synchronous and called
    during render. Splitting them behind a lazy chunk would mean the class list
    changing shape after first paint, which is worse to ship than the bytes.

    If this ever fires, the question is *what moved*, not *how much to add*.
  */
  'data': 1_000_000,
  'vendor': 210_000, // React
  /*
    §139: raised from 180 kB, where the app sat at 82% of its ceiling - close
    enough that ordinary growth would fire it, which is how §59.5's four
    reactive raises started. 256 kB puts it back at the margin `data` and
    `TableTab` have, and the first-paint check below is what took over the
    job this number was doing badly.
  */
  'index': 256_000, // the app itself
  /*
    The two that matter, and the only two with a floor.

    Both are fetched on demand - the text on the first "Full description", the
    bestiary the first time the Table tab needs a stat block - so a player who
    never opens either pays for neither. The `min` is the real check in this
    file: a fixture can only leave one of these chunks by going somewhere, and
    the only somewhere is `data`. Whether it takes the whole chunk with it or
    merely most of it, the floor fires and names the file.

    Set well under the current sizes so ordinary fixture churn does not trip
    them; they are watching for a fixture *leaving*, which is a 500 kB event,
    not for one growing by a stat block.
  */
  'srd-2014-text': { max: 700_000, min: 400_000 },
  'srd-2014-monsters': { max: 700_000, min: 400_000 },
  /*
    §66. The battle screen's route chunk, budgeted the day it started
    carrying the PS1 renderer. ~150 kB today against a 320 kB alarm - fires
    if a fixture or a dependency lands in it, stays quiet through ordinary
    growth. A side effect worth wanting: the "no chunk emitted" check below
    now also pins that TableTab *stays* a lazy chunk - if somebody imports
    it statically, this budget line is what says so.
  */
  'TableTab': 320_000,
};

const files = await readdir(ASSETS).catch(() => {
  console.error('No dist/assets - run `npm run build` first.');
  process.exit(1);
});

const failures = [];
const seen = new Set();

for (const file of files) {
  if (!file.endsWith('.js')) continue;
  /*
    `data-r64-ROGa.js` -> `data`. Splitting off the last dash-delimited piece
    does not work: Vite's hash is base64url and contains dashes of its own, so
    that leaves `data-r64`. Match the known names against the front instead,
    longest first so `srd-2014-text` is not read as some chunk named `srd`.
  */
  const name = Object.keys(BUDGETS)
    .sort((a, b) => b.length - a.length)
    .find((candidate) => file.startsWith(`${candidate}-`));
  if (name === undefined) continue; // route chunks, all small and volatile
  const entry = BUDGETS[name];
  const { max, min } = typeof entry === 'number' ? { max: entry, min: 0 } : entry;
  seen.add(name);

  const { size } = await stat(join(ASSETS, file));
  const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
  if (size > max) {
    failures.push(`${name}: ${kb(size)} exceeds its ${kb(max)} ceiling`);
  } else if (size < min) {
    /*
      The floor, and the message says what it means rather than what it
      measured. A lazy fixture chunk shrinking is not a win - it means its
      payload went somewhere, and `data` is the only somewhere there is.
    */
    failures.push(
      `${name}: ${kb(size)} is below its ${kb(min)} floor - its fixture has ` +
        'left this chunk, almost certainly into `data`, where every visitor pays for it',
    );
  } else {
    const range = min ? `${kb(min)}-${kb(max)}` : kb(max);
    console.log(`  ok  ${name.padEnd(18)} ${kb(size).padStart(9)} / ${range}`);
  }
}

/*
  §139. What a first visit downloads before anything renders.

  The entry chunk plus every chunk it statically imports - which is exactly
  the set Vite writes into `index.html`, as the module script and the
  `modulepreload` links beside it. Read from there rather than walked out of
  the bundle, because that file *is* the browser's instruction: whatever is
  listed is fetched before the app runs, and anything not listed is not.

  A ceiling only. There is no floor to add: a chunk leaving this list is a
  chunk that became lazy, which is the direction this check wants.

  1.3 MB against ~1.04 MB today. An alarm at the same margin as the rest of
  this file, and the one number here that corresponds to something a person
  waiting for the page can feel. Most of it is `data`, which every visitor
  pays by the deliberate trade argued above.
*/
const FIRST_PAINT_MAX = 1_300_000;

const html = await readFile(join(DIST, 'index.html'), 'utf8').catch(() => null);
if (html === null) {
  failures.push('no dist/index.html - cannot measure what a first visit downloads');
} else {
  /*
    Both shapes in one pass: `<script type="module" src=...>` is the entry and
    `<link rel="modulepreload" href=...>` is each chunk it statically imports.
    Vite writes them with a `./` or a base prefix, so the path is taken from
    `assets/` onwards rather than trusted whole.
  */
  const paths = [...html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+\.js)"/g)].map((m) =>
    m[1].slice(m[1].indexOf('assets/')),
  );
  const unique = [...new Set(paths)];
  let total = 0;
  for (const path of unique) {
    const { size } = await stat(join(DIST, path)).catch(() => ({ size: 0 }));
    total += size;
  }
  const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
  if (unique.length === 0) {
    // The regex found nothing, which means the emitted HTML changed shape and
    // this check is silently measuring zero rather than measuring first paint.
    failures.push('found no module scripts in dist/index.html - this check has stopped working');
  } else if (total > FIRST_PAINT_MAX) {
    failures.push(
      `first paint: ${kb(total)} across ${unique.length} chunks exceeds its ` +
        `${kb(FIRST_PAINT_MAX)} ceiling - something static landed in front of every visitor`,
    );
  } else {
    console.log(`  ok  ${'first paint'.padEnd(18)} ${kb(total).padStart(9)} / ${kb(FIRST_PAINT_MAX)}`);
  }
}

const missing = Object.keys(BUDGETS).filter((name) => !seen.has(name));
if (missing.length) {
  // A budgeted chunk that no longer exists is not a pass. Either it was
  // renamed, or `manualChunks` stopped producing it and its contents were
  // folded into something else that is now silently carrying them.
  failures.push(`no chunk emitted for: ${missing.join(', ')}`);
}

if (failures.length) {
  console.error('\nBundle budget exceeded:');
  for (const line of failures) console.error(`  - ${line}`);
  /*
    Deliberately does not open with "raise the budget". That was the old advice
    and it was taken every single time - see the header. A ceiling set as high
    as these are is not exceeded by writing prose, and a floor is never fixed
    by lowering it.
  */
  console.error(
    '\nThese are alarms, not diets: something has probably moved between chunks.' +
      '\nCheck manualChunks in vite.config.ts, and look for a static import of a' +
      '\nfixture that used to be dynamic. Only change a number here once you can' +
      '\nsay in the commit what moved and why it belongs where it landed.',
  );
  process.exit(1);
}

console.log('\nAll chunks within budget.');
