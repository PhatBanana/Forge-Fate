# Roadmap

What is left to do, what was decided against, and why. The README says what the
app *does*; this file says where it is going and what it is knowingly missing.

**Status:** `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked ·
`[–]` decided against

Each item says how big it is, so a session can pick work that fits:
**S** an hour or so · **M** a sitting · **L** its own phase.

Anything claiming a rules fact should say where the fact came from. "Written
from the books" is an honest provenance and a weaker one than "verified against
the SRD" — the audits exist because the difference turned out to matter
fourteen times over. See **Provenance** below.

The shipped history — forty-five sections with their reasoning — moved to
**`docs/HISTORY.md`** so this file could go back to being a plan.

---

## Where things stand

**The app.** The scoring engine and both rulesets; the whole player-facing
stack - proficiencies, features, equipment, damage per round, spellcasting,
roster, share links, play tracking, a 1:1 printable sheet; the DM half - SRD
monsters, the encounter tracker, the forecast, the dungeon generator; a
battle screen that *enforces* the rules it draws rather than mentioning
them; and a UI built as a full-screen game, with hub-and-spoke navigation, a
full-bleed board and a pan/zoom/rotate camera.

**The state.** Tests, lint, types and the build are clean, deployed from
`main` to GitHub Pages. The data tables are diffed against the SRD 5.1 and
5.2 APIs inside `npm test`, so drift fails a build - for twelve tables;
three more have no fixture yet and are item 2 below.

**What is not finished.** The core 5e mechanics are close but not complete,
and the box stays unticked until they are. See the live plan.

---

## The live plan

Only *open* work lives here. Anything shipped moves to `docs/HISTORY.md` —
a plan full of ticked boxes is a changelog wearing a plan's clothes, and it
was hiding how much is actually left.

### 1. 5e core mechanics — `[~]` **not complete, and cannot be ticked yet**

The one section that matters, and the one that stays open. Grappling,
shoving, cover and surprise are not features deserving a heading each; they
are *basic mechanics*, and the only honest question is whether the set is
finished. **It is not.** This section is done when the "still missing" list
below is empty or every line on it is a recorded decision.

**Modelled and enforced** — the fight runs these rather than mentioning
them: the action economy; movement as a spent budget with difficult ground
and opportunity attacks; advantage/disadvantage as one non-stacking rule;
cover at both degrees; grapple, shove and trip with the escape and the
drag; light, darkness and darkvision; surprise; the fifteen conditions,
with the six that stop movement actually stopping it; concentration checks
with real DCs; death saves; damage through resistances; areas of effect
that bite; reactions; stealth, fog and activation; elevation, falling and
high ground; rests, hit dice and every class resource.

**Still missing, each with its reason** — this is the list that keeps the
box unticked:

- `[!]` **Lair actions** — *blocked, no licensed data.* No fixture carries
  them; the phrase appears in the SRD only inside other abilities' prose.
  Building it means authoring content this project has no source for. See
  §42.
- `[ ]` **2014 starting wealth** ("ignore the package, roll for gold").
  **S**, *blocked on provenance* — 2024's equivalent is modelled; the 2014
  table is not in any fixture the app ships, and whether SRD 5.1 carries it
  is unverified. Check the source before doing the work. See §44.
- `[–]` **Four rules ruled out on purpose** — mounted and underwater combat,
  chases, and massive damage. Listed once, under **Decisions on record**;
  they count toward "every line is a recorded decision" rather than toward
  work left.

**Checked and already done** — kept so the same items are not "found"
again, which has now happened twice: concentration DCs, death saves,
temporary hit points, level-20 capstones for all twelve classes, falling,
Ready, sneak attack / divine smite / rage in the damage model, attunement,
encumbrance with the variant thresholds, and the frightened movement
clause.

### 2. Data provenance — `[ ]` three tables nothing verifies **M**

One job wearing three hats: extend `refresh.mjs` and `srdAudit.test.ts` to
the tables they never reached. The audit covers twelve tables today and
misses these.

- `[ ]` **Feats, epic boons included.** No fixture for either edition, and
  the refresh script never fetches them. 2024 feats are core rules and
  Open5e serves `srd-2024`, so that half is auditable now; the 2014 half
  has no licensed source and belongs beside the non-SRD subclasses,
  labelled rather than verified.
- `[ ]` **Backgrounds.** 29 rows, none verified. Matters more under 2024,
  where a background sets the ability increases *and* the origin feat — a
  wrong row moves real numbers, not flavour.
- `[ ]` **The 2014 class feature table.** The classes check compares hit
  die, saves and skill picks only; `CLASS_FEATURES` is checked against
  nothing.

### 3. Small and optional — `[ ]` **XS each**

- `[ ]` **"Roll 4d6, drop the lowest"** for ability scores. Point buy,
  standard array, manual entry and a real dice roller all exist, so this is
  a button rather than a capability.
- `[ ]` **Appearance fields** (age, height, weight, eyes, skin, hair). The
  PHB sheet has the box; this app has a portrait instead. Probably a
  decision to record rather than work to do.

### Parked

- `[!]` **Non-SRD subclasses** (~108) - no licensed source; inventing them
  would be worse than the gap.
- `[ ]` **9.2 The originals switch / 9.3 Twelve original subclasses** -
  parked by the project owner after 9.1.

---

## Decisions on record

Things deliberately not done, kept here so they stay decisions rather than
drifting back into "todo". Each was argued once; the full reasoning is in
`docs/HISTORY.md` under the section named.

- **Mounted combat, underwater combat, chase rules** - out of scope for a
  tabletop aid at this table's scale. The DM rules them.
- **Massive damage** - a table call, unmodelled with a comment in the code
  saying so.
- **The XP-per-level table** - not in the data this project ships, so the
  app records experience and refuses to say what level it makes you.
  Milestone tables ignore the threshold anyway. (§7)
- **Light casts no shadows** - a torch lights the far side of a pillar.
  Doing it properly means a line-of-sight trace from every source to every
  square on every render; the honest trade is that a DM can see where the
  torch is. (§40)
- **Sunlight Sensitivity** - triggers on *sunlight*, and nothing here can
  tell a sunbeam from a lantern. Stays a ruling. (§40)
- **Whether a hand is free** for a grapple - a shield can be doffed and a
  torch dropped, and a DM who has to argue with a tool about it will stop
  using the tool. (§39)
- **Flanking and the resistance qualifiers** - noted in the log, never
  applied, because they are rulings. Flanking is behind an optional-rules
  switch. (§26.3)

---

## Provenance, and what cannot be verified

The rule this project runs on: anything claiming a rules fact says where the
fact came from. "Written from the books" is honest provenance and a weaker
one than "verified against the SRD" - the audits exist because that
difference turned out to matter fourteen times over.

- **Verified in `npm test`:** classes, races, skills, conditions, languages,
  spells, equipment, weapons, magic items, 2014 subclass spell lists, 2024
  subclasses, 2024 class resources. Drift fails a build.
- **Not verified yet:** feats and epic boons, backgrounds, the 2014 class
  feature table. Item 2 in the live plan.
- `[!]` **Not verifiable:** the ~108 non-SRD subclasses. No licensed source
  carries them; the community sites that do are unlicensed copies, and the
  two open-source alternatives evaluated in 2026-08 turned out to be
  reimagined homebrew. Inventing them would be worse than the gap. The
  twelve SRD subclasses **are** verified, in both editions.
- `[!]` **Lair actions** - the same problem in miniature: no fixture carries
  them, so building the feature would mean authoring content.

This is also why the app may write **its own** subclasses under its own
names, badged and off by default - that is a new thing rather than a
forgery, and it is the parked §9.

---

## History

Forty-five shipped sections, with the reasoning intact, live in
**`docs/HISTORY.md`**. They were split out on 2026-08-09: forty-five
numbered sections had made a *plan* unreadable, and a roadmap should say
what is left rather than what was done.

**The numbers there are load-bearing** - code comments cite `§26.2`,
`§32.1`, `§34.7` and friends - so nothing is renumbered, ever.

| Theme | Sections |
|---|---|
| Data, provenance and the SRD audits | 1-5, and the audit notes at the end |
| Decisions on record | 6 |
| Player-facing feature parity | 7 |
| The DM half: monsters, tracker, dungeons | 8, 11, 13-15 |
| Forge originals (parked) | 9 |
| Layout and the workspace era | 10, 12, 20 |
| The battle screen's rules | 16, 19, 21-23, 25-29 |
| The FFT/X-COM treatment | 17, 18, 26 |
| Storage | 24 |
| The campaign layer | 30 |
| The full-screen game UI | 31-35 |
| The game look, finished | 36-38 |
| 5e core mechanics: grapple, light, surprise, the small rules | 39-42 |
| Builder correctness, and the audits that found it | 43-45 |
