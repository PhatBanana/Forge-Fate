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

The shipped history — fifty-two sections with their reasoning — lives in
**`docs/HISTORY.md`** so this file can be a plan.

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
5.2 APIs inside `npm test`, so drift fails a build - for twenty-three tables,
including every spell slot, cantrip and spells-known column, both editions'
subclass progressions and the 2014 resource columns. Two tables have no
fixture, and item 2 says why neither is simply work.

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
box unticked. Surveyed against both SRDs on 2026-08-09; every line below was
checked in the code, not recalled.

- `[x]` **2024 exhaustion** — done in §51. `engine/exhaustion.ts` answers
  the whole question per edition, and all four consumers read it: the
  sheet's effect list, the movement budget, the advantage engine and the
  attack roll.
- `[ ]` **2024 condition text.** **S**. Both editions have the same fifteen
  conditions, and 2024 rewrote several of them - Invisible now grants
  advantage on Initiative and no longer works the way the 2014 wording says;
  Prone spells out crawling versus half your Speed to stand. `Condition` has
  one `summary` and no ruleset dimension, so a 2024 player is reading 2014
  text on every screen that shows it.
- `[!]` **Lair actions** — *blocked, no licensed data.* No fixture carries
  them; the phrase appears in the SRD only inside other abilities' prose.
  Building it means authoring content this project has no source for. See
  §42.
- `[ ]` **2014 starting wealth** ("ignore the package, roll for gold").
  **S** — 2024's equivalent is modelled; the 2014 table is not in any
  fixture the app ships. Now that `/api/2014/classes/{id}` is known to carry
  the class record whole, check it there before assuming the table is
  absent. See §44 and §49.
- `[ ]` **Spell components (V/S/M).** **M**. Not on the spell record at all,
  so nothing can say a silenced caster loses their verbal spells or that a
  hand is needed. Arguably a DM ruling, but it is currently *unmodelled*
  rather than *decided against* - and the difference is this list.
- `[ ]` **Jumping, climbing, swimming, crawling as movement costs.** **S**.
  Climb and swim *speeds* exist as race traits and the map spends a movement
  budget, but the extra cost of climbing or swimming without a speed, and
  long/high jump distances, are not modelled.
- `[–]` **Four rules ruled out on purpose** — mounted and underwater combat,
  chases, and massive damage. Listed once, under **Decisions on record**;
  they count toward "every line is a recorded decision" rather than toward
  work left.
- `[–]` **Suffocation, lifestyle expenses and downtime** — absent, and
  deliberately: none of them happen in a fight or on a character sheet, which
  is what this app is. Recorded here so the next survey stops finding them.

**Checked and already done** — kept so the same items are not "found"
again, which has now happened twice: concentration DCs, death saves,
temporary hit points, level-20 capstones (all thirteen classes have one;
the Paladin's is the Oath's, which is where 5e puts it), falling, Ready,
sneak attack / divine smite / rage in the damage model, attunement,
encumbrance with the variant thresholds, and the frightened movement
clause.

### 2. Data provenance — `[x]` **done, and it does not mean what a tick usually means**

All three tables now have a source and a check. The tick is real; what it
certifies is narrower than "the tables are right", and the difference is the
honest part of this item.

- `[x]` **The 2014 class feature table** — §46. Found eight missing features
  and a Barbarian ladder a 2024 character was getting on top of its
  replacement.
- `[x]` **Feats, epic boons included** — §50. Found **Boon of the Night
  Spirit** missing: the app had nine boons where the SRD prints seven, and
  being longer than the source hid being incomplete.
- `[x]` **Backgrounds** — §50. All four SRD rows already agreed on abilities,
  Origin feat and skills.

**What the tick does not cover.** The SRD carries 17 feats and 4 backgrounds
under 2024, 1 and 1 under 2014. The app ships 70 and 16. So fifty-four feats
and twelve backgrounds are 2024 PHB content with **no licensed source** — the
same position as the ~108 non-SRD subclasses. They are labelled in the
Builder by their source badge and counted by a pinned coverage assertion;
they are not, and cannot be, verified. See **Provenance**.

### 3. Small and optional — `[ ]` **XS each**

- `[ ]` **"Roll 4d6, drop the lowest"** for ability scores. Point buy,
  standard array, manual entry and a real dice roller all exist, so this is
  a button rather than a capability.
- `[ ]` **Appearance fields** (age, height, weight, eyes, skin, hair). The
  PHB sheet has the box; this app has a portrait instead. Probably a
  decision to record rather than work to do.

### 4. The app's own content — done

Section 9 argued that the missing published content cannot be added and that
**different** content covering the same ground can. Sections 53 and 56 built
both halves.

- `[x]` **9.2 The originals switch** (§53, §56). Built, gated across all six
  catalogues, and - as of §56 - actually reachable: §53 never called
  `loadOriginals()` at boot, so the setting existed and could not be turned
  on. There is a control on the menu now.
- `[x]` **9.3 Original subclasses** (§56). Nineteen of them, sized by the
  roster rather than by a round number: the 2014 spread was 4-14, and the
  additions raise the floor to nine while keeping the 2024 roster flat.
- `[x]` **9.4 Original classes** (§58). Four - the **Reckoner** (the
  Warlock's short-rest clock), the **Harrier** (Favored Enemy named in play),
  the **Marshal** (the non-magical commander 5e never replaced) and the
  **Adept** (psionics as a chassis rather than a subclass) - each with nine
  subclasses under 2014 and five under 2024, so §56's floors hold with
  seventeen classes on the table. `forge/balance.test.ts` measures the
  published band at run time and fails any of the four that falls outside it,
  or that tops it.
- `[x]` **9.5 Original feats** (§59.3). Eight, each naming a hole the printed
  list leaves - no feat improves healing, none helps an ally's saving throw,
  none gives you a second reaction, none rewards standing still. Sized against
  the published catalogue's own spread by `forge/feats.test.ts`.

### Parked

- `[!]` **Non-SRD subclasses** (~108) - no licensed source; inventing them
  would be worse than the gap. Unchanged by the above: the app's own rows
  fill the *count*, not the gap, and are never offered as the missing ones.

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

- **Verified in `npm test`:** classes (hit die, saves, skill picks, and the
  whole 2014 feature table), lineages (speed, size *and* ability increases,
  plus the four SRD subraces), skills, conditions, languages, spells,
  equipment, weapons, magic items, subclass progressions in **both**
  editions, 2014 subclass spell lists, class resource columns in both
  editions, armor and weapon proficiency, the skill list each class chooses
  from, and every casting column - slot grid, pact slots, cantrips known,
  spells known, 2024 prepared. Drift fails a build.
- **Stronger than audited:** starting equipment is *loaded from* its fixture
  rather than transcribed beside it, so there is nothing to drift.
- `[!]` **Not verifiable from SRD 5.1:** the feat list and the background
  list. Checked, not assumed: the SRD 5.1 API carries exactly one of each -
  Grappler and Acolyte. Every other row in both tables is written from the
  books, and no 5.1 fixture can say otherwise. The 2024 halves are auditable
  in principle and blocked on reaching Open5e; item 2 in the live plan.
- **Written from the books, and 2024-only:** every `CLASS_FEATURES` row
  tagged `['2024']`, and every untagged row's 2024 behaviour. The feature
  check is SRD 5.1 and compares the 2014 side only; nothing anywhere carries
  2024 class features.
- **Written from the books, and not in any SRD:** the whole **Artificer** -
  it is TCoE, so no fixture reaches it, and the audits that pass over every
  other class say nothing about this one. Two of its rules were wrong until
  §47 read the book by hand: it casts from 1st level, and it rounds *up*
  when multiclassing. Both are now flags on the class carrying that
  provenance in a comment. Treat the rest of it as unverified.
- `[!]` **Not verifiable, and counted rather than assumed:** ~108 non-SRD
  subclasses, **54** of the 70 2024 feats, and **12** of the 16 2024
  backgrounds. Each is labelled by its source badge in the Builder, and the
  SRD-covered fraction is pinned in the audit so it cannot drift quietly.
- `[!]` **Not verifiable:** the ~108 non-SRD subclasses. No licensed source
  carries them; the community sites that do are unlicensed copies, and the
  two open-source alternatives evaluated in 2026-08 turned out to be
  reimagined homebrew. Inventing them would be worse than the gap. The
  twelve SRD subclasses **are** verified, in both editions.
- `[!]` **Lair actions** - the same problem in miniature: no fixture carries
  them, so building the feature would mean authoring content.

### Where the data comes from

Surveyed and timed on 2026-08-09, because "no source exists" had been
asserted twice on the strength of one unchecked URL and one bad afternoon.

| Source | Covers | Notes |
|---|---|---|
| **dnd5eapi** `/api/2014/*` | SRD 5.1 | 24 endpoints. The only source for **spells**, `rules` and `rule-sections`. |
| **dnd5eapi** `/api/2024/*` | SRD 5.2 | 23 endpoints incl. feats, backgrounds, species, subspecies, poisons, weapon-mastery-properties. **No spells.** |
| **Open5e** `v2/?document__key=srd-2014` | SRD 5.1 | Second opinion. 319 spells, 1 feat, 1 background. |
| **Open5e** `v2/?document__key=srd-2024` | SRD 5.2 | The 2024 equipment table and class progressions; 339 spells, 17 feats, 4 backgrounds. |

Two traps worth writing down:

1. **`/api/feats` is not `/api/2024/feats`.** The unversioned paths alias to
   2014, so checking `/api/feats`, finding one record and concluding "the SRD
   has no feats" is a mistake this project has now made once. Always name the
   edition.
2. **Open5e serves 24 documents and only two of them are the SRD.** Kobold
   Press (Tome of Beasts, Deep Magic), Level Up A5e, Tal'dorei and Black Flag
   all sit behind the same endpoints under different `document__key`s. They
   are separately licensed third-party content, not SRD, and this project
   takes neither - `document__key` is a filter that has to be passed every
   time, not a default.

GitHub is a third route in principle - the `5e-bits/5e-database` repo is what
dnd5eapi serves - but `api.github.com` is gated in this environment (403,
needs an explicit repo grant) and the raw-content paths did not resolve on a
first guess. Not needed while both APIs answer.

This is also why the app may write **its own** subclasses under its own
names, badged and off by default - that is a new thing rather than a
forgery, and it is the parked §9.

---

## History

Fifty-two shipped sections, with the reasoning intact, live in
**`docs/HISTORY.md`**. Forty-four of them were split out of this file on
2026-08-09 — forty-four numbered sections had made a *plan* unreadable, and
a roadmap should say what is left rather than what was done. §45 was
written straight into `HISTORY.md` the same day, which is where every
section has gone since.

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
| Builder correctness, and the audits that found it | 43-52 |
