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

The shipped history — one hundred and thirteen sections with their reasoning — lives in
**`docs/HISTORY.md`** so this file can be a plan.

---

## Where things stand

**The app.** The scoring engine and both rulesets; the whole player-facing
stack - proficiencies, features, equipment, damage per round, spellcasting,
roster, share links, play tracking, a 1:1 printable sheet; the DM half - SRD
monsters, the encounter tracker, the forecast, the dungeon generator; a
battle screen that *enforces* the rules it draws rather than mentioning
them; a UI built as a full-screen game, with hub-and-spoke navigation, a
full-bleed board and a pan/zoom/rotate camera; and, since §92-§98, a
networked table - seats on phones over a relay, joined Jackbox-style by a
room code, with the DM's device holding all authority.

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
drag; light, darkness, darkvision and the magical darkness it cannot beat;
surprise; the fifteen conditions, with the six that stop movement actually
stopping it; concentration checks with real DCs; death saves; damage through resistances; areas of effect
that bite; reactions; stealth, fog and activation; elevation, falling and
high ground; rests, hit dice and every class resource.

**Still missing, each with its reason** — this is the list that keeps the
box unticked. Surveyed against both SRDs on 2026-08-09; every line below was
checked in the code, not recalled.

- `[x]` **2024 exhaustion** — done in §51. `engine/exhaustion.ts` answers
  the whole question per edition, and all four consumers read it: the
  sheet's effect list, the movement budget, the advantage engine and the
  attack roll.
- `[x]` **2024 condition text** — done in §60. `Condition` gained
  `summaryIn2024`, and `conditionText(condition, ruleset)` is the only way
  any screen reads one, so the sheet, the play card and the Table all answer
  per edition. Eight of the fourteen carry a 2024 line; the six without one
  are a claim rather than an omission, and `srdAudit.test.ts` checks each
  written line against the clause in SRD 5.2 it rests on.

  Two things found on the way, both recorded rather than quietly folded in:
  the fixture diff that says "all fourteen changed" is measuring 2024's new
  *prose format*, not its rules - read rather than diffed, five rules moved;
  and `TableTab`'s `rulesetOf` defaulted a monster to `'2014'`, which is the
  same defect one layer down but **mechanical** - a 2024 table's monsters
  were running the 2014 exhaustion ladder. Fixed here because leaving a
  known wrong rule in place to keep a section's scope tidy is not a trade
  worth making.
- `[x]` **Darkvision, wired from every source** — done in §63. It had one
  source (a species trait) and read the range out of that trait's *display
  name*, which §61 flagged and could only afford to pin. Now every record
  that grants a sense carries a `SightGrant` - species, class and subclass
  features, invocations, feats and worn items - and `engine/senses.ts`
  resolves them, including the "60 feet, or 60 further if you already have
  it" rule that Goggles of Night and Umbral Sight both use and that a
  best-wins resolver gets wrong in both directions.

  **Magical darkness** came with it: a fourth light level that nonmagical
  light cannot lift and darkvision cannot see through, placeable on the map
  and carried on a held object the way the spell is actually cast. Devil's
  Sight is the one thing that beats it, and it beats it *generically* - the
  engine reads a field, so a feat that says otherwise is a line of data.

  Four things recorded rather than guessed, each an absence that is a claim:
  three of the seven subclass features mentioning darkvision actually grant
  it (the rest cast it for ki, summon it, or offer it as one option of
  several); a monster's devil's sight has no structured home on a stat block
  and stays the DM's ruling; the 2024 lineage whose trait is "darkvision *or*
  initiative" is recorded as the darkvision half because the build model has
  nowhere to store the choice; and Daylight dispelling a lower-level Darkness
  is a spell-versus-spell interaction the light layer cannot see, so it is
  one click for the DM instead.
- `[!]` **Lair actions** — *blocked, no licensed data.* No fixture carries
  them; the phrase appears in the SRD only inside other abilities' prose.
  Building it means authoring content this project has no source for. See
  §42.
- `[x]` **2014 starting wealth** ("ignore the package, roll for gold") —
  done in §62, as the *rule* without the *table*. Checked
  `/api/2014/classes/{id}` first as this line asked: it carries no wealth
  field at all. Nor does the 2014 rule-section index, nor
  `srd-2014-text.json`, nor open5e's Equipment sections. **Starting Wealth
  by Class is Player's Handbook content, not SRD 5.1** — the same call
  §42 made about the DMG's encounter thresholds, reached the same way.

  So the mechanism is built and the number is asked for: a 2014 first-level
  character gets a "forgo the kit and buy your own gear" control, types what
  they rolled or were granted, and the coin lands in the purse with the kit
  cleared. 2024 needs no such control and deliberately does not get one —
  all twelve of its SRD classes print a coin alternative inside the
  equipment choice itself, so it is already a radio button carrying the
  book's own number. A data test pins that split, so an SRD refresh which
  moves it fires rather than quietly making the free-hand path wrong.
- `[x]` **Spell components (V/S/M)** — done in §64, and unlike starting
  wealth this one *is* SRD data: `/api/2014/spells` carries `components` and
  `material` for every spell, so all 319 records were generated from the
  fixture and are diffed by `srdAudit.test.ts` on every run rather than
  typed by hand. Distribution: 174 V/S/M, 105 V/S, 26 V, 7 M/V, 4 S, 3 M/S;
  184 carry material text.

  Three rules a tool can actually check, in `engine/components.ts`: a verbal
  component needs a voice (Silence is now a zone that carries `silences`, and
  the battle tray disables the spell and says why); a somatic one needs a
  free hand, which War Caster and nothing else answers; a material one needs
  a hand too, and the SRD says the *same* hand serves both, which is why one
  free hand clears both blocks. Subtle Spell removes V and S outright. The
  Builder's review counts the spells a full pair of hands is costing you, the
  sheet prints the "V, S, M" line, and a costly-material check and the
  holy-symbol-on-a-shield question are stated rather than ruled on.

  The twenty-five spells the app carries that SRD 5.1 does not have no
  components recorded, and the engine leaves the rule *unapplied* for them
  rather than guessing "none" — the same refusal the light and sight models
  make. A test pins that count so it cannot drift.
- `[x]` **Jumping, climbing, swimming, crawling as movement costs** — done in
  §65, and verified against SRD 5.1 `rule-sections/movement` and
  `movement-and-position` rather than written from memory: climbing and
  swimming cost 1 extra foot per foot (2 in difficult terrain) unless you
  have the speed; crawling costs 1 extra always; standing from prone costs
  half your speed; a long jump is your Strength *score* in feet and a high
  jump is 3 + your modifier, halved from standing.

  `engine/movement.ts` owns the arithmetic and `MoveGrant` puts the sources
  on the records — species traits, class and subclass features, feats,
  invocations and worn items, the same shape §63 gave sight. The walk charges
  it: water became swimmable ground rather than plain difficult ground so a
  swim speed is worth something, **going up an elevation step became a
  climb** (elevation had been on the map since §26.2 and cost nothing to
  gain, so high ground was free), and a prone token crawls. Standing up is a
  command in the battle tray that spends the feet, which is what finally
  makes a Trip worth an action.

  The sheet prints the jump distances and the Builder's Speed figure explains
  them. Two absences are recorded rather than fixed: Bestial Soul and
  Revelation in Flesh each offer a movement mode as a *choice* the build
  model has nowhere to store, the same shape as §63's four darkvision
  features. SRD 5.2 moves these rules to a Rules Glossary neither licensed
  feed carries, so the 2024 numbers are unverified; what is verified there is
  that difficult terrain is unchanged and that all four remain ordinary
  movement.
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

### 3. Small and optional — `[x]` **both done in §82**

- `[x]` **"Roll 4d6, drop the lowest"** for ability scores. `rollAbilityScores`
  seats the six by class priority, the way the standard array already did,
  and prints the dice it rolled underneath - the question a table asks next.
  The rng is a parameter, so the tests assert dice rather than ranges.
- `[x]` **Appearance fields** (age, height, weight, eyes, skin, hair). The
  hedge here - that the portrait made them redundant - did not survive
  contact: a portrait shows a face, and "how tall is he" is asked about a
  person standing next to a door. All six are free text, because the box
  holds `6'2"` as readily as a number. Full account in `docs/HISTORY.md` §82.

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

### 5. The look — `[x]` **§66 shipped the PS1 renderer**

- `[x]` **The PS1 tactical renderer** (§66). The Tactical view draws through
  a hand-rolled WebGL renderer - low-poly prisms, billboard-sprite pawns,
  a ~240-row internal frame upscaled nearest-neighbour, vertex snapping,
  Bayer dither and an RGB555 crush - with the SVG board kept as the
  automatic fallback and the user-facing **Classic look** toggle. No new
  dependencies; the whole renderer cost the lazy TableTab chunk ~23 kB.
  Full account in `docs/HISTORY.md` §66.
- `[x]` **Class sprites with stances** (§67). Seventeen classes - the four
  originals included - as authored pixel art *data*: four shared base poses
  (at ease, battle, sneak, down) composed with ten prop overlays and a
  palette per class, so the set reads as one family. The pose follows the
  facts the rules already track (on the floor, hiding, mid-fight, at ease);
  a recorded portrait outranks the sprite, and monsters keep their cards.
  Full account in `docs/HISTORY.md` §67.
- `[x]` **The tactical hit test and WALL_STEPS.** **S**. Fixed in §80:
  `squareAtPoint` iterates the heights things are *drawn* at, so a click on
  a wall's painted cap answers as the wall in both renderers at once. The
  §66.1 pin that reproduced the quirk by name was replaced, as it asked to
  be, with tests of the correct behavior.

### 6. The networked table — `[~]` **the spine is built; what is open is what makes it a product**

§92-§96 built the whole spine in five sections: seats and intents (the
DM's device *is* the table; a player proposes, never writes), the
phone-sized seat screen, the transport interface with BroadcastChannel
proving the protocol, the relay (a Node room for the laptop at the table,
a Cloudflare Worker for the cloud), and the Jackbox join with the table's
roster in its own store so a synced fight never touches the characters a
phone built for itself. Open, each sized:

- `[x]` **The dead spot** — done in §97. The wire keeps a player's own
  `sit` and `play` marks when the socket is down and re-says them after
  the reconnect's hello, so the host's rejoin broadcast cannot undo what
  a player marked; the seat shows the line's status instead of silently
  eating taps. Ops stay dropped - §95's decision, kept on purpose - and
  the strip says to queue the plan again.
- `[x]` **A spell is not `other`** — done in §98. `cast` is an
  IntentKind; the plan names the spell from the caster's own castable
  list, target optional, in both composers, and only casters are offered
  it. "Run it" deliberately does *not* run a cast: a cast is a resource
  choice the plan does not carry (which slot, upcast, pact or grid), and
  §92's rule is that a plan can never do what a click could not — there
  is no one click that casts. The slot rides the note; the DM runs it
  with the pips beside the plan.
- `[x]` **A relay to point at** — deployed 2026-08-20, and verified: the
  worker answers 426 to a plain request, which is a websocket room saying
  hello. `wss://forge-fate-relay.phatbanana.workers.dev`, pinned in
  relay/README.md, free tier (hard caps, no billing), deployed by
  `scratchpad/setup-relay.sh`'s path. Redeploys stay `wrangler deploy` by
  hand - a 45-line worker that changes once a year does not need CI.

### 8. The battle screen's shape — `[~]` **two cuts made, the core left fused**

An architecture review (2026-08-20) surveyed the 7,500-line battle
screen. What was worth doing, and what was not:

- `[x]` **Hit points, promoted to a module** — §106. The two-store rule
  is `hitPoints.ts` now, three pure functions with the write side
  returning a roster rather than calling a setter. The call sites kept
  their names as closures, so all 117 uses were untouched.
- `[x]` **The forecast, peeled** — §107. Expectation, balance dial and
  distribution, with the simulation state and its expiry rule, behind
  three props.
- `[x]` **The other four peels** — §108: the encounter library, the
  table panel, group saves and the fallen. The debrief was on this list
  and stayed: it reads six derived values from the middle of the fight
  (objective, delve, ward, rounds, tally), so peeling it would trade a
  fused region for a prop list as wide as the panel is tall.
- `[–]` **Folding the tool states into one union** — *decided against,
  see §107.* They are not mutually exclusive: Escape is a priority
  stack, and holding a placement under an aim is a real state. A union
  makes it unrepresentable, so it is a behaviour change rather than a
  refactor. Reopen only with a decision that one tool at a time is the
  rule.
- `[–]` **Splitting the entangled core** (map stage, cockpit, field) —
  each reads 8+ pieces of state and writes handlers defined in the
  resolution regions. Cutting there moves complexity rather than
  concentrating it.

### 9. The fight, lifted out of the component — `[ ]` **L, in six steps**

The battle screen is 7,081 lines and **half of it is not a screen**. After
§106-§108 peeled the panels, what is left before the first panel is 3,620
lines and 113 local helpers that are the *rules of the fight*: sight and
light, the movement budget, pathing, strike resolution, grapple and shove,
zones, hiding, opportunity attacks, defences.

**Why the obvious cut is the wrong one.** Splitting that into more
components fails, and §108 already recorded the shape of the failure:
`strikesInto` is 290 lines and reads **13 sibling helpers** to resolve one
swing — hit points, name, defences, conditions, exhaustion, ruleset,
stance, whether the attacker can see, whether light reaches, the sight
context, the monster table, the build derivations, and the write path. A
5e attack genuinely depends on all of that. Extracted as a component it
becomes a 13-prop interface: one fused region traded for a shallow one.

**What is actually true**, measured with comments stripped: **73 of the
113 helpers are already pure** — no `setState`, no `onChange`, no toast.
They look like component code only because they close over `encounter`,
`roster`, `derived` and `byId` instead of taking them. That is exactly the
shape `hpOf`/`applyHp` were in before §106, and §106 is the proof the
pattern works.

#### The shape

One read-side value threaded through every module, so a call site learns
one thing rather than four:

```ts
export interface FightView {
  encounter: EncounterState;
  roster: Roster;
  monsterById(id: string): Monster | undefined;
  buildOf(rosterId: string): BuildContext | undefined;  // memoised by the caller
}
```

Write-side helpers **return what happened; they do not do it.** The
resolvers currently fire five animation channels (`flashes`, `lunges`,
`walks`, `floats`, `banner`) and toasts from inside the rules, which is
the one thing that would keep them in React. So:

```ts
export interface Resolution {
  roster: Roster;            // the new truth, encounter folded in (§106)
  events: FightEvent[];      // lunge, walk, float, flash, banner, say, log
}
```

The component drains `events` into its setters. That is the seam that
lets a whole attack be tested without a DOM.

#### The order, and it is not negotiable

Taken from the dependency graph — each step depends only on the ones
above it, so no step needs a temporary shim:

1. `[x]` **Combatant facts** — done in §110. `fightFacts.ts`, twelve
   questions, `FightView` proven: the encounter, the roster, a monster
   lookup and a build lookup. Every existing test passed unedited, and
   the twelve names stayed in the screen as closures.
2. `[x]` **Sight and light** — done in §111. `fightSight.ts`, all eight.
   The caching stayed in the component on purpose: the module hands back
   a lookup rather than holding a cache that would outlive its fight.
3. `[x]` **Movement and pathing** — done in §112. `fightMovement.ts`
   holds ten of the eleven and states the order the speed rules apply
   in, which was the thing spread across five modules. `reach` stayed:
   it is the armed tool's readout, not a fact about the fight.
4. `[x]` **Zones** — done in §113. `fightZones.ts`, and the dice became
   a parameter, which is what finally made ground that bites testable.
   The `Resolution` shape was not needed after all: these already
   threaded a roster through and handed one back, so they kept that.
5. `[ ]` **Grapple, shove, hide** — **M**. `resolveGrab`, `knockProne`,
   `setHeld`, `holdOn`, `letGo`, `escapeGrapple`, `standUpFrom`,
   `releaseGrapple`, `rollHide`. Needs 1, 3 and 4.
6. `[ ]` **Strike resolution** — **L**, and last. `strikesInto`,
   `resolveStrikes`, `strikesFor`, `allStrikesFor`, `opportunitySwing`,
   `resolveAim`, `runPlan`. Needs everything above. The biggest, and the
   one where a mistake breaks the fight rather than a panel.

#### How to do it safely

- **Keep the call sites.** Every step leaves the local name in place as a
  closure over this render's `FightView`, exactly as §106 left `hpOf`,
  `nameOf` and `applyHp`. All ~2,400 tests must pass untouched at every
  step; a step that needs a test edited has changed behaviour and should
  be re-read rather than re-run.
- **Move, never re-type.** §107 caught `balanceWord` being rewritten from
  memory with different bands. Cut and paste; let the compiler complain.
- **One step per commit**, each with its own § and its own gates.
- **Stop when the payoff stops.** Steps 1-4 are worth doing on their own
  merits. Steps 5 and 6 are worth doing when the next fight feature makes
  you open that region anyway — not as a refactor sprint.

**Expected shape at the end:** `TableTab` around 3,500 lines of screen,
six rules modules with direct tests, and the fight testable without a
DOM. **Not expected:** any change to what the app does. If a step
produces a user-visible difference, it is a bug in the step.

### 7. Housekeeping a fresh clone found — `[x]` **done in §99**

- `[x]` A `.gitattributes` — `* text=auto eol=lf`, ending the phantom
  snapshot modification every Windows clone woke up to.
- `[x]` The scratchpad probes documented in `docs/development.md`,
  per-machine Chromium path and all; and "Which screens" updated - it
  still called phones out of scope, which §93's seat made untrue.

### Parked

- `[!]` **Non-SRD subclasses** (~108) - no licensed source; inventing them
  would be worse than the gap. Unchanged by the above: the app's own rows
  fill the *count*, not the gap, and are never offered as the missing ones.

---

## Decisions on record

Things deliberately not done, kept here so they stay decisions rather than
drifting back into "todo". Each was argued once; the full reasoning is in
`docs/HISTORY.md` under the section named.

- **Git LFS, or dropping the probe screenshots** - the 92 PNGs in
  `scratchpad/` are about half this repository's history by bytes, and
  they grow by roughly a megabyte a section. Neither cure is worth it:
  LFS puts a setup step in front of every clone, and dropping them
  destroys the visual record the "Gates" lines cite. At 27 MB this is
  years from mattering. What *was* worth doing is the cheap half -
  `docs/development.md` now says not to commit a re-run whose only
  difference is anti-aliasing. (§109)
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

One hundred and thirteen shipped sections, with the reasoning intact, live in
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

## Dungeon furniture: hidden rooms, locked doors, traps — `[x]` **built in §81**

Asked for alongside §73/§74 and held back because each needed a *reveal*
decision the map did not have to make: the battle screen is one screen both
sides look at, so "the players cannot see this yet" has to mean something
concrete. §81 answered all three and shipped them.

- `[x]` **Locked doors** — `Door.locked`; the Door tool cycles door → locked
  → none (`toggleDoor` became `cycleDoor`), and the map draws a bar. Purely
  informational at the table, as designed: the pick or the break is a ruling
  with a DC the DM sets, and this app declines to invent it.

- `[x]` **Hidden rooms** — `Room.hidden`, plus `revealed` on the *fight*.
  `seen()` removes a secret room from the architecture outright, taking its
  doors and traps with it, so both renderers, `groundCells`, the sight model,
  the pathing and the deployment agree without any of them learning the rule.
  The DM reveals from the Field drawer; the saved dungeon goes on hiding it,
  which is what makes a map reusable.

- `[x]` **Traps** — architecture-owned, on the layout, invisible until sprung,
  fired from the same walk-settlement hook §23's zones use. **One deliberate
  departure from this sketch:** a sprung trap does not become a zone. A zone
  needs effects, effects need damage, and there is no licensed trap table to
  read one out of — so the trap carries the DM's own words and springing
  announces them. Same call as lair actions and starting wealth.

Full account in `docs/HISTORY.md` §81.
