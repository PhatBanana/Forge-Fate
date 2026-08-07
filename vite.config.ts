import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    /*
      Rollup applies one warning limit to every chunk, which stopped saying
      anything useful once `srd-2014-text` became a deliberate 524 kB that is
      fetched only when somebody opens a description. At the 500 kB default the
      build warns on every run about the one chunk whose size is the point,
      which teaches everyone to skim past the warning on the day it is real.

      Raised past that chunk, and the actual per-chunk budgets live in
      `scripts/bundle-budget.mjs`, which `npm run build` runs. That is where a
      chunk growing - especially `data`, which every visitor pays for - gets
      caught.
    */
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        /*
          Two chunks that are not app code, pulled out by hand.

          `data` is the rules: spells, feats, magic items, subclass features,
          the lineage matrices. It is most of the bundle and it changes far less
          often than the app around it, so a deploy that only touches components
          leaves a returning visitor's copy of it still valid. Left to itself
          the bundler hoists it into a shared chunk named after whichever module
          happened to be first, which was `jsx-runtime` - a 470 kB file whose
          name said nothing about what was in it.

          `vendor` is React, for the same reason and more so.
        */
        manualChunks: (id: string) => {
          if (id.includes('/node_modules/')) return 'vendor';
          /*
            Two SRD fixtures are excluded before the `data` rule can claim them.
            `srd-2014-text.json` is 544 kB of rules text and
            `srd-2014-monsters.json` is 590 kB of stat blocks; both are imported
            dynamically - by `rulesText.ts` and `monsters.ts` - so they cost
            nothing until somebody opens a description or a bestiary. Folding
            either into `data` would put it in front of every visitor instead,
            including the ones who never run a game.

            The rest of `src/data/srd/` is either read only by the audit test,
            and so never reaches the bundle, or is a table the app genuinely
            uses - starting equipment - which belongs in `data` with every
            other table. Naming the files rather than the directory is what
            keeps those two cases apart.
          */
          if (id.includes('/src/data/srd/srd-2014-text.json')) return undefined;
          if (id.includes('/src/data/srd/srd-2014-monsters.json')) return undefined;
          if (/\/src\/data\/|\/src\/engine\/(race|background)Matrix\./.test(id)) return 'data';
          return undefined;
        },
      },
    },
  },
  server: {
    proxy: {
      // D&D Beyond's character service sends no CORS headers, so a page cannot
      // call it directly. During `npm run dev` this proxy stands in, which
      // makes "import by URL" work with no extra setup. A static production
      // build falls back to the paste-JSON path.
      '/ddb': {
        target: 'https://character-service.dndbeyond.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ddb/, ''),
      },
    },
  },
  test: {
    // The engine tests are pure and run far faster without a DOM, so node stays
    // the default. Component tests opt in per file with an
    // `@vitest-environment jsdom` docblock.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    /*
      Vitest stubs CSS imports to an empty string by default, which is right
      for component tests - they assert behaviour, not styling, and processing
      the stylesheet for each one would be pure cost. But `theme.test.ts` reads
      the palettes out of `index.css?raw` so the contrast assertions are made
      against the values that actually ship rather than a copy that can drift,
      and that needs the real file.
    */
    css: true,
  },
})
