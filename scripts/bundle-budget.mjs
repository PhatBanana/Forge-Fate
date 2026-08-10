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
 * The budgets are the current sizes plus a little headroom, not aspirations.
 * When one is exceeded, decide which is true and say so in the commit:
 *   - the chunk grew for a good reason -> raise its budget
 *   - something landed in the wrong chunk -> fix `manualChunks`
 * The failure names both, because the second is the one that costs a visitor
 * and the first is the one that looks like it.
 */
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const ASSETS = new URL('../dist/assets/', import.meta.url).pathname;

/**
 * Budgets in bytes, keyed by the chunk name Vite puts before the hash.
 *
 * `data` is the one to watch. It is the rules tables, it is served to every
 * visitor on first paint, and it is where a stray import lands if a lazy chunk
 * loses its exclusion in `vite.config.ts`.
 */
const BUDGETS = {
  /*
    Every visitor pays this - see manualChunks. It grew ~20 kB when the
    starting-equipment table arrived, which is 2.6 kB over the wire because
    the file is highly repetitive, for a panel on the Builder's Equipment
    section that should feel instant. Paid rather than made lazy.
  */
  /*
    Raised 500 -> 530 kB by section 56's nineteen subclasses and their feature
    tables, which is ~21 kB of prose and about 3 kB over the wire once gzip has
    seen how repetitive it is.

    Paid rather than made lazy, and the reason is structural rather than
    thrifty: `classes.ts` folds the Forge rows into each class at module load,
    because `subclassesFor` is a synchronous function called during render and
    cannot await a chunk. Splitting them out would mean the class list changing
    shape after first paint, which is a worse thing to ship than 3 kB.
  */
  'data': 530_000,
  'vendor': 210_000, // React
  'index': 180_000, // the app itself
  'srd-2014-text': 560_000, // lazy: fetched on the first "Full description"
  /*
    Lazy: fetched the first time the Table tab needs a stat block, so a player
    who never runs a game never sees it. This is the entry that matters if the
    `manualChunks` exclusion in `vite.config.ts` is ever lost - the bestiary
    would land in `data`, `data` would blow its budget, and the failure below
    names both possibilities so the right one gets picked.
  */
  'srd-2014-monsters': 540_000,
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
  const budget = BUDGETS[name];
  seen.add(name);

  const { size } = await stat(join(ASSETS, file));
  const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
  if (size > budget) {
    failures.push(`${name}: ${kb(size)} exceeds its ${kb(budget)} budget`);
  } else {
    console.log(`  ok  ${name.padEnd(14)} ${kb(size).padStart(9)} / ${kb(budget)}`);
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
  console.error(
    '\nRaise the budget in scripts/bundle-budget.mjs if the growth is real,' +
      '\nor fix manualChunks in vite.config.ts if something landed in the wrong chunk.',
  );
  process.exit(1);
}

console.log('\nAll chunks within budget.');
