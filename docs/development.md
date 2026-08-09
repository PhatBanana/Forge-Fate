# Development

Everything a contributor needs. [The README](../README.md) is for people using
the app; this is for people changing it.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine, import and component tests
npm run build    # static bundle in dist/, plus the service worker and budgets
npm run audit    # diff the data tables against the SRD fixtures
npm run audit:refresh   # re-fetch those fixtures from the SRD APIs
```

## Deploying

Pushing to `main` builds and publishes to GitHub Pages via
`.github/workflows/deploy.yml`. Lint, types and the full test suite gate the
deploy, so a build that fails its tests is never published.

**One manual step, once:** in *Settings → Pages*, set **Source** to **GitHub
Actions**, or the workflow runs and the deploy step fails.

`vite.config.ts` sets `base: './'` so the same build works at a domain root,
under a repository path, or opened from disk; share links are built from
`location.pathname` and keep whatever path they were served from.

The one thing a static host cannot do is *fetch* a D&D Beyond character by URL —
that endpoint sends no CORS headers and the dev proxy does not exist in
production. The importer falls back to pasting JSON, which is what the app tells
the reader.

## Layout

```
src/
  types.ts              domain types and the condition language
  data/
    races.ts            43 lineages, flattened so subraces rate separately
    classes.ts          13 classes, ~120 subclasses, ability priorities
    skills.ts           the 18 skills and what each is actually for
    spells.ts           344 spells, with the damage the calculator reads
    feats.ts            75 feats for 2014, 70 for 2024, with prerequisites,
                        scoring rules and per-ruleset overrides
    backgrounds.ts      13 backgrounds for 2014, 16 for 2024
    weapons.ts          37 weapons in 2014 and 39 in 2024, with the rows that differ
    armor.ts · gear.ts · magicItems.ts · classOptions.ts · classResources.ts
    classFeatures.ts · subclassFeatures.ts · spellSlots.ts · species2024.ts
    conditions.ts · languages.ts · startingEquipment.ts · rulesText.ts
    sources.ts          which book a row came from, and what this app wrote
    monsters.ts         334 SRD 5.1 stat blocks, served lazily
    srd/                fixtures the data audit checks the tables against, plus
                        the two files the app *serves* rather than checks:
                        srd-2014-text.json and srd-2014-monsters.json, both
                        lazy chunks excluded from `data` in vite.config.ts
  engine/               no React dependency, tested directly
    character.ts        derives everything from a Build
    defense.ts          armor class and hit points, with breakdowns
    attacks.ts          what you are holding, and the attack line
    dpr.ts              damage per round, the AC curve, the break-even point
    recommend.ts        feat scoring, ASI valuation, the plan to 20
    proficiency.ts      skills, expertise, passives, pick attribution
    spellcasting.ts     slots including the multiclass rule, known and prepared
    raceMatrix.ts · backgroundMatrix.ts · matrix.ts   the origin ratings
    features.ts · classOptions.ts · items.ts · inventory.ts · resources.ts
    healing.ts · dice.ts · levelUp.ts · startingEquipment.ts · portrait.ts
    forecast.ts         what an encounter will do, from the damage model
    dungeon.ts          a seeded map: rooms, corridors, doors
    spellRecommend.ts · skillValue.ts · conditions.ts · analyze.ts · pointBuy.ts
  storage.ts            the roster, and migrations for older saves
  play.ts               hit points, slots, resources, rests, the action
                        economy, user-made counters and the roll log
  encounter.ts          the fight: turn order, rounds, monster instances
  workspace.ts          rail widths and collapse, remembered per surface
  share.ts · undo.ts · theme.ts · serviceWorker.ts
  import/dndbeyond.ts   D&D Beyond character parsing
  components/           the five tabs, the sheet, the stat block, and the
                        comparison view
scripts/
  audit/refresh.mjs     re-fetches the SRD fixtures
  bundle-budget.mjs     per-chunk size budgets, run by `npm run build`
  build-sw.mjs          writes dist/sw.js from the real, hashed asset list
```

## Testing

`npm test` covers ability maths, ASI slot counting, point-buy legality, feat
scoring (including that Sharpshooter is worthless on a greatsword and Heavy
Armor Master needs heavy armor on your body), progression planning, the matrix's
rating distribution, the build review, AC and HP, skill attribution, spell slots
including the multiclass rule, and the D&D Beyond importer.

Three of the suites are less obvious and worth knowing about:

- **The data audit** (`srdAudit.test.ts`) diffs every table against fixtures
  captured from the SRD APIs, with no network. Deliberate departures live in an
  `EXPECTED` table with a reason each, and a departure that stops applying fails
  the run — a stale excuse reads as though somebody checked.
- **Regression fingerprints** pin derived output for a set of characters. No
  fingerprint may move except where a change deliberately alters derived output,
  and then by a hand-checked amount.
- **The doc counts** (`readmeCounts.test.ts`) check the numbers stated in the
  README and in this file against the tables, because prose cannot be tested but
  numbers can, and numbers are what go out of date.

## Which screens

**Tablets and desktops.** The floor is a tablet in portrait, about 768px, so
browser passes run at 1360, 1024 and 768. Phones are out of scope by decision
rather than by neglect: a turn order, a map and a character's numbers all want
to be on screen at once, and a 380px column holds one of the three. See
ROADMAP §6.

## Where the reasoning lives

Design decisions are recorded next to the code they constrain, not here. If a
choice looks arbitrary, the file usually says why. Two documents carry the parts
that do not belong to one file:

- **[docs/engine.md](engine.md)** — how the recommendations are computed.
- **[ROADMAP.md](../ROADMAP.md)** — what is left, what is blocked and by what,
  and the mistakes worth not repeating.
