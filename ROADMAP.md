# Roadmap

What is left to do, what was decided against, and why. The README says what the
app *does*; this file says where it is going and what it is knowingly missing.

**Status:** `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked ·
`[–]` decided against

Each item says how big it is, so a session can pick work that fits:
**S** an hour or so · **M** a sitting · **L** its own phase.

Anything claiming a rules fact should say where the fact came from. "Written
from the books" is an honest provenance and a weaker one than "verified against
the SRD" — the audits in this file exist because the difference turned out to
matter fourteen times over.

---

## Where things stand (rewritten 2026-08-09)

Thirty-five sections are shipped: the scoring engine and both rulesets, the
whole player-facing stack (proficiencies, features, equipment, damage per
round, spellcasting, roster, share links, play tracking, the 1:1 printable
sheet), the DM half (SRD monsters, the encounter tracker, the forecast, the
dungeon generator), a battle screen that enforces the rules it draws
(movement, reach, sight, cover, zones, hazards, elevation, reactions,
conditions with mechanical teeth), and a UI rebuilt as a full-screen game -
hub-and-spoke navigation, a full-bleed board with a pan/zoom/rotate camera,
and one slim game bar on the desk screens.

1743 tests, lint and types clean, deployed from `main` to GitHub Pages. The
data tables are diffed against the SRD 5.1 and 5.2 APIs inside `npm test`,
so drift fails a build. One item remains `[!]`: no licensed source carries
the ~108 non-SRD subclasses, and inventing them would be worse than the gap.

This file was restructured on 2026-08-09 at the project owner's ask: the
live plan now sits at the top, grouped by theme, and the shipped record
keeps its original chronological numbering below - **the numbers are
load-bearing** (code comments cite §32.1, §34.7 and friends), so nothing is
renumbered. History is under "The shipped record", indexed by theme.

---

## The live plan

Grouped by theme. Sections keep getting numbers in the order they are
*started*, so the numbers here continue the shipped record's sequence.

### A. The game look, finished

- `[x]` **36. The battle HUD moves onto the board.** **M** - *shipped
  2026-08-09; the full account is §36 in the shipped record.*
- `[x]` **37. Standing pawns for the tactical view.** **L** - *shipped
  2026-08-09; the account is §37 in the shipped record.*
- `[ ]` **38. The desk screens finish the game look.** **M**
  From the §35 review, in priority order: the Dungeons editor is the last
  website screen and it is a *map* - it should be a stage like the battle
  (map full-bleed, seed/size/brushes floating, §34's camera plumbed in,
  which it was built for); the Campaign empty state is one input on a vast
  page and should sell the record it will write; the Characters roster rows
  should carry the portraits the data already has. Plus small polish: the
  Species x Class dropdown stretched to paragraph width, the sheet's
  "Print" subtab styled as a tab rather than the action it is.

### B. The rules of the game, honestly finished

The §2 audit closed every gap it knew about; this is the next ring out,
found by auditing the engine against the 5e core combat chapter
(2026-08-09). Absent, partial, and to-verify are different states and are
marked as such. Everything here should keep §2's discipline: model it, or
say on the screen that the table has to rule it.

- `[ ]` **39. Grappling.** **M** - Absent. Shove landed in §26.2; grapple
  never did. Athletics vs Athletics/Acrobatics, the grappled condition
  (speed 0 - the condition *exists* and has teeth, but nothing applies it),
  escape as an action, dragging a grappled creature at half speed.
- `[ ]` **40. Light and darkness.** **L** - Absent. The battlefield has fog
  (party sight radius) but no light model: no dim light or darkness, no
  light sources on the map, and darkvision is a rated builder trait the
  battle never reads. This is the biggest honest gap on the DM side - most
  dungeons are dark.
- `[ ]` **41. Surprise.** **S** - Absent. Stealth and hiding landed in
  §19.3, but initiative has no surprised state; an ambush and a doorway
  fight start identically.
- `[ ]` **42. The smaller combat rules, audited and closed one by one.**
  **M** - Partial or unverified, each needs a look before a decision:
  three-quarters cover (+5 - only half cover's +2 is modelled today), lair
  actions (legendary actions are tracked, lair are parsed and dropped),
  frightened's movement half (the roll half has teeth; "cannot willingly
  approach" may not gate movement), concentration checks on damage (the
  concentration *slot* is tracked; verify a hit prompts the CON save),
  heroic inspiration (absent; a one-checkbox model), ritual casting (tagged
  on spells; verify it is surfaced anywhere it matters), multiclass ability
  prerequisites in the Builder (verify they are enforced or at least
  flagged).
- `[–]` **Mounted combat, underwater combat, chase rules.** Declared out of
  scope for a tabletop aid at this table's scale - the DM rules them. A
  decision, recorded here so it stays one.

### C. The Builder and optimizer, fully set

- `[ ]` **43. The Builder completeness pass.** **M** - Audit the character
  path end to end against the PHB's character-creation chapter the way §2
  audited the engine: languages and tools chosen rather than implied,
  alignment/personality carried to the sheet, starting wealth alternatives,
  level-20 capstones present for every class, epic boon coverage, and
  whatever else the pass turns up. The outcome is a list like §2's - each
  item modelled, or honestly labelled on screen.

### Parked

- `[!]` **Non-SRD subclasses** (~108) - no licensed source; inventing them
  would be worse than the gap.
- `[ ]` **9.2 The originals switch / 9.3 Twelve original subclasses** -
  parked by the project owner after 9.1.

---

## The shipped record, indexed

Everything below this line is history, kept chronological and unrenumbered
because code comments cite the section numbers. By theme:

| Theme | Sections |
|---|---|
| Data, provenance and the SRD audits | 1-5, and the audit notes at the very end of this file |
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

## 1. Data provenance

The audits are the reason the rest of this section is short. They run inside
`npm test` now, so drift fails a build rather than waiting for someone to
remember.

- `[x]` **Bring the audit scripts into the repo.** **M**
  `scripts/audit/refresh.mjs` fetches the SRD and writes distilled fixtures to
  `src/data/srd`; `src/data/srdAudit.test.ts` compares every table against them
  with no network, inside `npm test`. So the audit is no longer an errand you
  remember to run — it fails when the data drifts.
  `npm run audit` runs it alone; `npm run audit:refresh` re-fetches.

- `[x]` **Record the deliberate disagreements as data, not prose.** **S**
  The audit's `EXPECTED` table carries one row per departure with its reason,
  and a departure that stops applying fails the run — a stale excuse reads as
  though someone checked, which is worse than no excuse at all.

- `[!]` **Verify the non-SRD subclass features.** **L** — *blocked, no source*
  ~108 of the 120 subclasses are from Xanathar's, Tasha's and later books and
  were written from the books rather than verified. No licensed source carries
  them: the SRD covers twelve, and the community sites that do have the text
  are unlicensed copies of copyrighted material. Unblocked only by someone
  checking them against their own books, or by WotC licensing more.
  The twelve SRD subclasses **are** verified, in both editions.

  **Amended 2026-08-04.** "Inventing them would be worse than the gap" is about
  inventing *the named ones* - a fabricated Hexblade presented as the real one,
  which would be worse than the gap and is still ruled out. It does not rule
  out this project writing **its own** subclasses under **its own** names,
  badged, off by default and never described as published. That is section 9,
  and the distinction is the difference between a forgery and a new thing.

  **Attempted solution (2026-08-01):** Built a pipeline to compare against two
  open-source sources — the [Open5e API](https://api.open5e.com) and the
  [Free5e repository](https://github.com/wyrmworkspublishing/free5e). Both were
  found to contain **reimagined/homebrew content** with different subclass names,
  mechanics, and structures. They are NOT standard D&D 5e rules. The gap remains
  unfillable without a licensed PHB/Xanathar's/Tasha's source.

- `[x]` **Keep casting times at book fidelity.** **M**
  `'long'` meant "an hour or more", so the sheet could not tell you whether
  Find Familiar cost an hour or Hallow cost a day. The union now carries the
  nine distinct times the 319 SRD spells actually use, and 28 spells were
  remapped from the fixture rather than by hand. The audit checks the field, so
  it cannot flatten again. `'action'`, `'bonus'` and `'reaction'` are unchanged,
  which is what kept the engine untouched.

- `[–]` **"260 of the 371 magic items say nothing at all."** — *withdrawn, the
  measurement was wrong*
  This sat here as an **L** for a while and it should never have been written.
  It claimed the 260 items with no mechanical `effect` and no `note` were "a
  name and a rarity on your sheet", and scheduled a phase of writing 74
  one-line verdicts.

  Every one of those verdicts already existed. `summary` is a **required** field
  on `MagicItem`, all 371 carry a real one, and both the items panel and the
  character sheet render it. The Oathbow reads *"Name a sworn enemy for 3d6
  extra damage against them, at the cost of disadvantage against everyone
  else."* What the 260 actually are is items with nothing the engine can
  compute — which is correct, since most of them genuinely have nothing — and
  nothing to apologise for, which is why they carry no `note`.

  The mistake was reading a query as a finding: I counted `!effect && !note`
  and wrote it up as "silent" without opening the file to see what a row looked
  like. It is recorded rather than deleted because the failure is worth keeping
  in view — a roadmap can invent work as easily as it can miss it, and this
  entry would have cost a phase.

  The one real gap underneath it has since been closed — see 1.6.

- `[x]` **1.6 Five items that were computable and were not computed.** **S**
  Asked whether the app could know what more items do, I counted rather than
  guessed: **83 of 371 carried a computable effect**, not "about a third" as the
  README had been claiming for some time. Five more were added here, so it is 88
  now, and the count is asserted by `readmeCounts.test.ts` rather than written
  down once — this entry itself briefly said 83 after the five had landed, which
  is precisely the drift that test exists to catch.

  Of the 288 without one, most are correctly without one. Reading their actual
  SRD text rather than trusting a keyword sweep, the categories break down as
  spell-granting (38), resistance or immunity (37), their own damage (22),
  movement or senses (20), advantage on something (20) — and almost all of
  those need a model this app does not have. A first pass over the summaries
  suggested 22 damage riders were available; the text said otherwise, because
  most trigger on a creature type and `magicItems.ts` already documents why
  those are excluded: folding a Dragon Slayer's 3d6 into a curve quietly
  assumes every fight is against a dragon.

  Five survived that check, and each was chosen because its absence made the
  app state something **false** rather than merely incomplete:

  - **Mithral Armor** removes the Stealth disadvantage and the Strength
    requirement from whatever armor it is. Both are penalties `defense.ts`
    already computes, so the app was telling a Mithral-clad character their
    armor gave disadvantage on Stealth — the exact opposite of the item, and a
    build review finding that was simply wrong.
  - **+1/+2/+3 Ammunition** now reaches a weapon that fires it. Deliberately
    *not* `weaponBonus`: a quiver of +3 arrows must not improve the greatsword
    on your back, so it is a separate effect keyed off `weapon.ammo`, and it
    takes the better of itself and the bow's own bonus rather than stacking.
  - **Sword of Life Stealing** gains its 3d6 necrotic crit rider, the same
    shape as a Vicious Weapon: it triggers on a natural 20 against anything,
    which is the existing test for belonging in the curve. The SRD exempts
    constructs and undead, and the item's note says so.

  What is still out, and why: **resistances (37 items)** need a damage-taken
  model, which an optimizer does not have; **spell-granting items (38)** need
  charges and a spell source; **Adamantine Armor** needs crits-against-you;
  **Arrow-Catching Shield** needs AC that varies by attack type. Each is real
  work rather than an oversight, and the summary says what the item does in
  the meantime.

  The next one worth doing is **advantage-granting items** — Cloak and Boots of
  Elvenkind on Stealth, Weapon of Warning on initiative. Those became cheap the
  moment the sheet gained a dice roller that already understands advantage.

- `[x]` **Produce Flame's range.** **S**
  Recorded as `30 feet`; the range is `Self` and the 30 feet is how far you may
  then hurl the flame. Now `Self (30-foot throw)`, matching how the app already
  writes `Self (15-foot cone)`. The audit had no way to see it — the spell
  fixture carried neither range nor duration — so both are now captured and
  checked across all 319 SRD spells.

---

## 2. Rules the engine does not model

Most of these were handled by saying so on the item rather than computing it,
which is the honest fallback. Three of them are now computed; the rest are
still notes. Listed so the honesty stays a decision rather than a gap nobody
noticed.

The first entry is different in kind and is deliberately at the top: it was not
a gap the app admitted to, it was **a wrong number the app stated
confidently**. Those rank above everything else in this file.

- `[x]` **Subclass spell lists were rated and never granted.** **M** — *found
  in review, fixed*
  Nothing anywhere handed over a Life Cleric's Bless and Cure Wounds, a
  Devotion Paladin's oath spells or a Fiend Warlock's expanded list. The app
  had been *rating subclasses on them* the whole time — the Circle of the Land
  note reads "Free spells and recovered slots" and Aberrant Mind's reads "Free
  extra spells known" — while the character never received one.
  `Subclass.spells` now carries them and `grantedSpells` hands them over:
  always prepared, exempt from every count, marked on the printed sheet, shown
  in their own group in the Builder rather than as picks to consider, and
  flagged by the build review if you spent a pick on one anyway. Verified
  against SRD 5.1 for Life, Devotion and the Fiend, and checked by the audit —
  which records two departures. dnd5eapi lists only Death Ward at Cleric 7
  where the book gives Guardian of Faith too, so the book wins. And **Circle of
  the Land is deliberately not granted**: its spells depend on which land you
  chose, a choice the app does not model, and the API flattens all seven into
  one list — granting it would hand a coastal Druid the mountain spells.
  2024 revised every one of these lists and no licensed source carries the
  revisions: the SRD 5.2 API serves each subclass and returns an empty spell
  list. So a 2024 character is granted nothing rather than handed the 2014
  table under a 2024 label. That is the same wall as 1.3, and a test pins it,
  because the tempting thing is to grant it anyway and hope nobody checks.

- `[x]` **Weapon mastery was ranked and never modelled.** **M** — *found in
  review, fixed*
  `dpr.ts` mentioned mastery zero times. The app has ranked which mastery to
  take since masteries landed — from `MASTERY_VALUE`, a curated table of
  opinions — while the damage model could not see them, so a 2024 Fighter with
  six masteries and one with none produced the same curve, and the ranking sat
  beside a model that disagreed with it by omission.
  Two of the eight are arithmetic and are now computed. **Graze** is the ability
  modifier on every miss, which makes it the one line on the whole curve worth
  *more* against a high AC. **Vex** advantages your next swing after a hit, so a
  round is a two-state Markov chain rather than N copies of one number; the
  first swing of the round carries nothing in, which understates rather than
  flatters. The other six move the fight rather than the damage — prone,
  disadvantage, forced movement, a second target — and stay ranked and
  unmodelled, with a note naming which one is missing rather than letting the
  number read as complete.
  Found on the way in: **the regression fingerprint pinned no damage at all.**
  One 2024 case carries masteries on an equipped greatsword and could not
  notice this change. `dpr` is now a fingerprint field, which re-recorded ten
  snapshots as pure additions and no edits.

- `[x]` **A single-class Paladin or Ranger was short a slot at every odd
  level.** **M** — *found in review, fixed*
  `computeSlots` applied the *multiclass* caster-level formula to every
  character, including those who are not multiclassed. A half caster contributes
  `floor(level / 2)` to a shared pool — but a character with one casting class
  reads that class's own printed table, which rounds up. A single-class Ranger 5
  has **four 1st-level slots and two 2nd**; the app gave them three 1st-level
  slots and nothing else, a whole spell level short. Verified against the SRD 5.1
  Paladin and Ranger tables at all 20 levels, and wrong since spellcasting
  landed, in both rulesets, for Paladins, Rangers, Eldritch Knights and Arcane
  Tricksters.
  The two rules now sit side by side — `soleCasterLevel` for a character with one
  casting class, `casterLevelContribution` for the shared pool — because both are
  correct in their own place, and a Paladin 5 / Fighter 1 really does have fewer
  slots than a Paladin 5. Only two 2024 snapshots moved, both by hand-checked
  amounts; no 2014 case in the set is a single-class half caster, which is how
  this survived a regression suite.

- `[x]` **2024 casters were counted by the 2014 rules.** **M** — *found in
  review, fixed*
  `spellcasting.ts` had no reference to `ruleset` anywhere. 2024 replaced both
  "spells known" and "ability modifier + level" with one printed **Prepared
  Spells** column per class, and the app applied the 2014 rules under both —
  wrong for seven of the eight casters. A 2024 Sorcerer 5 was told they knew 6
  spells where the book prepares 9; a Ranger 5, 4 against 6. It cuts the other
  way too, since the column ignores your ability score: a Wisdom 20 Cleric 5
  prepared 10 and now prepares 9. Only the Warlock's column was unchanged.
  2024 also starts a Paladin and Ranger's casting at 1st level rather than 2nd,
  so a 2024 Ranger 1 was shown as a non-caster and has two 1st-level slots.
  `PREPARED_2024` is transcribed from `srd/srd-2024-classes.json` and checked
  against it by the audit, along with the half-caster slot progression above —
  the same fixture that unblocked the 2024 resource counts, one endpoint nobody
  had read twice.

- `[x]` **A multiclass caster got one save DC, and it was the wrong one for
  half their spells.** **M** — *found in review, fixed*
  `computeSpellcasting` took the ability from `castingSlices[0]`. For a
  Paladin/Sorcerer that is harmless, since both key off Charisma. For a
  Cleric 5 / Wizard 5 with Wisdom 14 and Intelligence 20 the sheet printed
  **DC 14** and the character's Wizard spells were **DC 17** — three points,
  stated as fact, on the sheet you take to the table. Wrong since spellcasting
  landed, in both rulesets.
  `SpellcastingResult` now carries a `CastingSource` per casting class. The
  singular fields remain as the *best* of them rather than the first, so a
  single-class caster is unchanged and no snapshot moved — which is what said
  the change was contained. The damage model was reading one DC for every
  spell too, so a Cleric/Wizard's Fireball was modelled at the wrong one.

- `[x]` **Record which class a spell was learned through.** **M**
  The fix above had to answer "whose DC is this spell cast at" and the app did
  not store the answer — `spellIds` was one flat list, and every spell fell back
  to whichever of your classes casts it best. That is the favourable reading
  rather than the certain one, and it was the last assumption the save DC work
  shipped under.
  `Build.spellSources?: Record<string, ClassId>` now carries it: set when a
  spell is taken, offered as a chooser on the card where two of your classes
  could have taught it, imported from D&D Beyond through `characterClassId`,
  and absent on every character built before it existed. `sourceForSpell`
  returns whether it is guessing, so the sheet's disclosure note appears only
  where a number really was guessed at, and each spell on the printed page says
  which class it is cast as — the pair of save DCs at the top of the spell page
  is an answer rather than a puzzle.
  An absent or stale entry degrades to the old behaviour rather than to
  nonsense: a recorded class that could not have taught the spell is ignored,
  and no regression snapshot moved.

- `[x]` **Weapon damage riders in the DPR model.** **M**
  Flame Tongue's 2d6, Frost Brand's 1d6, a Vicious Weapon's 7 on a critical and
  the Scimitar of Speed's bonus-action attack now reach the damage curve, each
  itemised in the breakdown. Per-hit riders apply across hit and crit; crit
  riders apply only to the crit share, so a Champion's widened range feeds
  through on its own.
  Riders that depend on the *target* — Dragon Slayer, Giant Slayer, Holy
  Avenger — are deliberately excluded and keep their `note`: folding them into a
  curve would quietly assume every fight is against a dragon.

- `[x]` **Sorcery points to spell slots, and back.** **S**
  Both directions are on the sheet, on the slot row each applies to. The rate
  comes from the SRD rather than from memory — it is in the core fixture and
  the audit checks it, because 5 points for a 3rd-level slot and 6 for a 4th is
  not a number anyone should be trusting their recall on.
  A made slot is counted separately from the ones the class table gives, so it
  can be marked as made and taken away by a long rest rather than refilled.
  The exchange stays lossy in both directions, which is what the rules intend.
  A design note in the repo had the cost, the return and the pool Metamagic
  draws on all wrong. It was not used, and it is gone.

- `[x]` **Ammunition in play.** **S**
  A quiver row under the attacks it feeds, counted in arrows rather than in
  bundles bought — every weapon with the ammunition property now knows which
  gear it loads, and every ammunition row knows how many come in a bundle.
  Recovery is the real rule, not a rest: a minute searching the battlefield
  returns half of what you shot, rounded down. Wiring it to a rest was the
  original sketch here and it was wrong — arrows do not grow back overnight,
  so ammunition is the one thing on the sheet a long rest leaves alone.
  The build review now says so when you carry a bow and no arrows, which the
  Gloom Stalker regression build promptly turned out to be doing.
  The 2024 firearms had nothing to load; SRD 5.2's firearm bullets are in the
  gear table now.

- `[x]` **2024 class resource counts.** **M** — *was `[!]`; it never should have been*
  This sat blocked on the claim that "the 2024 sources describe what changed
  qualitatively and never print the per-level tables". They print them. SRD 5.2
  carries a column per resource and Open5e serves it under
  `document__key=srd-2024` — the same Wizards of the Coast, Creative Commons
  document already trusted here for the 2024 weapon table. Nobody had looked at
  the class endpoint.

  **And the fallback was worse than advertised.** The entry said the app "uses
  the 2014 counts under both editions". It did not: every row was tagged
  `rulesets: ['2014']`, so a 2024 character was shown *no class resources at
  all*. A 2024 Fighter 9 had no Second Wind, no Action Surge, no Indomitable.

  Now: `srd-2024-classes.json` holds the progressions, the audit checks five of
  them column by column, and the rows carry an `in2024` override in the same
  shape `weapons.ts` and `feats.ts` use. What changed —
  - Fighter **Second Wind** 2/3/4 at 1/4/10, where 2014 gives one flat. The
    change most likely to be missed, and now visible: a 2024 Fighter 9 reads
    three where a 2014 Fighter 9 reads one.
  - Cleric **Channel Divinity** 2/3/4 at 2/6/18, one more at every step.
  - Paladin **Channel Divinity** 2 at 3rd and 3 at 11th, where 2014 gives one.
  - Monk **Ki → Focus Points**, a rename with the count unchanged, so it is one
    row with a new label rather than two that can drift.
  - Ranger **Favored Enemy**, new: 2/3/4/5/6 free castings of Hunter's Mark,
    which 2014 has no equivalent of.

  Three rows stay 2014-only and each says why on the row, because the rule this
  file always had still applies — a number that cannot be sourced is not written
  down. **Wild Shape**: SRD 5.2 points at a Wild Shape column that is not in the
  source, so everything past "twice" would be invented. **Divine Sense**: 2024
  folds it into Channel Divinity, so it is not a separate resource. **Flash of
  Genius**: the Artificer is not in SRD 5.2 at all.

- `[x]` **Healing is not a number the app knows.** **M**
  `Spell.healing` mirrors `Spell.damage`, seven spells carry it with figures
  read off the SRD rather than from memory, and a Healing panel sits beside the
  damage curve — never inside it, because damage and healing are not traded off
  against each other and one number covering both would invite a comparison
  that means nothing.
  Disciple of Life is folded in at 2 + the slot's level *per creature*, which
  is what puts a Life Cleric's Mass Cure Wounds so far ahead of anyone else's.
  Mass Heal and Power Word Heal are deliberately left unquantified: "700 hit
  points divided as you choose" and "all of them" are not amounts a per-casting
  average describes, and inventing numbers for them would make the column lie
  at exactly the two levels someone would check it.

- `[x]` **Buff spells do not reach the damage model.** **S**
  The switch knew Hunter's Mark and Hex and nothing else, so it did nothing at
  all for a Cleric — and for anyone carrying both it *added them together*,
  which is two concentration spells at once. The breakdown listed one of them,
  so the number disagreed with its own explanation.
  It now takes the best of the buffs the character actually has, resolved per
  AC because which one wins depends on the target: +1d4 to hit is worth more
  when you are missing often, a flat d6 per hit when you are not.
  Bless caught a subtlety worth recording. It improves the odds on every attack
  rather than adding damage to one, so folding it into the weapon line *and*
  giving it a line of its own counted it twice — a breakdown reading 5.7 under
  a headline of 4.9. Every line is computed without the buff now and the buff
  carries the whole difference. A test pins that the lines sum to the headline,
  since that is the mistake this nearly shipped.

- `[x]` **Bane, and Shillelagh.** **M**
  The two left out of 2.8.
  **Shillelagh** went into `attacks.ts` rather than the damage model: it changes
  the die and the ability your club attacks with, so computing it in the curve
  alone would have left the attack table saying 1d4 on Strength while the number
  below it assumed 1d8 on Wisdom. Applied without a toggle — a cantrip lasting a
  minute and costing no concentration is one a Druid has always cast — and
  itemised on the attack line so it is visible rather than silent.
  **Bane** went into the spell branch, dropping the target's effective save
  bonus by 2.5 and saying out loud that it assumes they failed Bane's own save.
  **Bless** went with it: 2.8 had given it to weapon swings and not to spell
  attacks, which would have been an asymmetry needing an excuse.
  The spell branch picks one buff for the whole branch, the way the weapon
  branch does, because choosing per spell would run Bless on a Fire Bolt and
  Bane on a Fireball at once — the same two-concentrations-at-once mistake 2.8
  had just fixed. A character holding candidates for both branches is fine:
  only one branch is ever reported, so they are concentrating on whichever
  helps the round they actually take.
  Testing Bless on a spell attack needed a Cleric/Wizard, which is worth
  recording: Bless is Cleric and Paladin only, and neither has an attack-roll
  cantrip for it to improve.
  No snapshot moved for either.

---

## 3. Import and export

- `[x]` **Import gear, magic items and background from D&D Beyond.** **M**
  One pass over the sheet's `inventory` array fanning out to four places: the
  weapons in hand, the armor and shield worn, anything the sheet calls magic to
  the item list with its attunement, and the rest to gear. Plus the background,
  the purse, and — because the background is now known — its two skills stop
  reading as your own picks.
  Ammunition needed converting: D&D Beyond counts forty arrows, this app counts
  two bundles of twenty, so bundled items are divided and rounded up.
  Two warnings that had become untrue are gone. "Armor is not read from the
  sheet" and "weapon loadout could not be read" now only appear when the sheet
  genuinely had nothing equipped, which is a different and useful thing to say.

---

## 4. Housekeeping

- `[x]` **The README has drifted from the app.** **S**
  Seven stale counts, four caveats that had outlived what they described, and
  four files missing from the map. The rule this item wanted — that a commit
  changing a table updates the README — is now a test rather than a habit:
  `src/data/readmeCounts.test.ts` checks eighteen stated numbers against the
  tables and fails if a retired caveat comes back.

- `[x]` **The bundle is one 843 kB chunk.** **M**
  Now six: `vendor` (190 kB), `data` (461 kB), the app (142 kB), and one chunk
  per deferred tab — Character sheet, Optimizer, Characters — fetched the first
  time you open them and not again. No chunk exceeds 500 kB, so the warning is
  gone.

  **Be honest about what this bought.** A cold first load went from 845 kB to
  793 kB, 236 kB gzipped to 222 kB. That is 6%, not a transformation, and the
  reason is that almost every table is reached from `deriveBuild` or `analyze`
  — the Optimizer's lineage matrices included, via `cellFor` in the build
  review — so they are genuinely shared and the bundler is right to hoist them.
  Route splitting cannot move data the first route needs.

  What it did buy, and the reason to keep it: the 461 kB of rules text is now
  its own file with its own hash, so a deploy that only changes components
  invalidates 142 kB rather than all of it. Left to itself the bundler produced
  that shared chunk anyway and named it `jsx-runtime`, after whichever module
  happened to be first.

  Getting the initial load meaningfully below this needs the *Builder's own*
  sections deferred — the spell picker is 162 kB of source on its own — which
  is a different and larger piece of work than this item described.

---

## 5. The 2024 ruleset

Both rulesets are a headline feature and the app switches between them
everywhere. For a long time only one of them had a safety net.

- `[x]` **No 2024 build has a pinned fingerprint.** **M**
  All seventeen regression snapshots were 2014 builds — the describe block said
  so in its name. Four 2024 cases now sit beside them, each covering a
  dimension the 2014 table cannot reach: masteries taken, the same shape with
  nothing chosen, a background using the +1/+1/+1 spread, and a caster whose
  two save DCs differ.
  The fingerprint grew rather than changed: the edition-specific parts are
  spread in only when they have something to say, so all seventeen 2014
  snapshots are byte-identical and the new signal is not buried in churn.

- `[x]` **The build review has nothing to say about 2024's own choices.** **M**
  A 2024 Fighter 9 with the background's +2/+1 unassigned and no masteries
  chosen produced **zero** findings about either.
  Split along the standing decision: the badges count what is unchosen —
  Identity reads 2 for an unassigned +2/+1, Equipment counts the mastery slots
  — and the review carries only the mistakes, a mastery on a weapon you are not
  holding and a background increase on an ability the background cannot raise.
  The second immediately caught an illegal pick in the 2024 regression fixture
  written an hour earlier, which is the shortest gap yet between adding a check
  and it earning its place.

---

## 6. Decisions on record

Not backlog. These are settled, and are written down so they are not
relitigated by a future session that notices the gap.

- `[–]` **Only 2014 and 2024.** No Level Up A5E, no Tales of the Valiant, no
  playtest material. Set by the project owner.
- `[–]` **Artificer infusions.** Excluded deliberately.
- `[–]` **Unlicensed sources.** Community sites hosting Xanathar's and Tasha's
  text are copies of copyrighted material and are not scraped, even though
  doing so would close item 1.3. Free5e (CC BY 4.0) was tested but contains
  reimagined content, not standard PHB rules — it is not suitable as a source
  for this project's data.
- `[~]` **Rules text is summarised, never reproduced.** *Superseded, and the
  second half of it was never true.* The first half stands: a one-line verdict
  is more useful than a paragraph while you are choosing, and every card still
  leads with one. But "text it has no licence to" was wrong about the SRD —
  5.1 and 5.2 are CC-BY-4.0 and may be reproduced with attribution, which is
  the same licence this file cites as the reason the *tables* are trustworthy.
  The app was leaving 319 spell and 361 item descriptions on the table on the
  strength of a decision that had quietly stopped being about the licence. Now:
  summary while you build, full text behind a disclosure when you look closer
  (section 7, phase 1).
- `[–]` **Unfinished choices are not build-review findings.** The section
  badges count them. A review that opens with nine entries on an untouched
  character teaches you to stop reading it.
- `[–]` **No backend.** `localStorage` and share links in the URL fragment. A
  fragment is never sent to a server, so no character lands in an access log.
- `[–]` **Tablets and desktops, not phones.** *Set by the project owner,
  2026-08-04, when the app grew a DM's screen.* The reason is content rather
  than taste: a turn order, a map and a character's numbers all want to be on
  screen at once, and a 380px column can hold one of the three. The floor is a
  **tablet in portrait, about 768px**.

  What that changes is the *verification standard*, not the code. Browser
  passes now run at **1360px, 1024px and 768px** rather than 1360 and 380.
  Existing narrow rules are left where they are - nothing here is a reason to
  go and break a layout that already works - but a new layout is no longer held
  to a phone, and the workspace rails stack rather than shrinking below 1000px
  because three columns in a portrait tablet is three columns nobody can use.
- `[~]` **No DM tools.** *Overruled by the project owner, 2026-08-04.* It was
  set when section 7 was scoped — "deeper player tools only" — and it held for
  the whole of that section. The owner has now asked for the other half of the
  table: a party tracker, combat encounters with monsters, a sheet that pops
  out into its own window, and a dungeon map. That is section 8.

  It is left here rather than deleted, marked `[~]` rather than `[–]`, because
  a decision that was real and then reversed is worth more as a record than as
  a blank. The three constraints it travelled with are **not** reversed: no
  backend, 2014 and 2024 only, and nothing unlicensed. Section 8 is built
  inside all three, which is why it has no live party view and why its monsters
  are SRD 5.1.

---

## 7. Toward D&D Beyond's free tier

Asked to close the gap with D&D Beyond, and then told which half to close:
**deeper player tools only.** No DM tools, no homebrew editors, no campaigns or
accounts, no backend.

> The "no DM tools" half of that scope was **overruled on 2026-08-04** and is
> now section 8. Everything below was built under it and is unaffected; the
> line is left standing because it is what this section was built to.

Half of D&D Beyond's value is licensed book content behind a paywall, and that
half is permanently closed here — see the unlicensed-sources decision above. So
the honest target is its *free* tier, plus the optimizer work it has no answer
to. What an audit of the two found missing: full rules text, a dice roller,
guided level-up, starting equipment, a portrait, and offline use. Two more were
found later, in use rather than in the audit: consumables that could not be
consumed, and no accounting of a turn.

- `[x]` **7.1 Full SRD rules text, verdict first.** 319 spells and 361 magic
  items now carry the SRD's own words behind a **Full description** disclosure,
  under the one-line verdict rather than in place of it. Captured by a new
  `srd-2014-text` set in the audit refresh script, keyed through the same alias
  table the audit uses — the SRD files Tenser's Floating Disk as "Floating
  Disk", so the translation had to be shared rather than copied, and it moved
  out of the test into `src/data/srd/names.ts` to be shared.

  The text is 524 kB, larger than every other table put together, so it is a
  dynamic `import()` in its own chunk fetched on the first expand.
  `vite.config.ts` excludes `src/data/srd/` from the `data` chunk to keep it
  that way, and `scripts/bundle-budget.mjs` now fails the build if `data` grows
  past its budget — because losing that exclusion would put half a megabyte in
  front of every visitor and nothing else would have noticed.

  The entries with no text say so, and deliberately do not say *why*. For
  spells the reason is the licence: the source carries all 319 SRD spells, so
  an absence really is a non-SRD spell. For items it is not that clean — both
  SRD APIs are missing entries the SRD itself has (Eye of Vecna, Sword of Kas,
  Mariner's Armor), so "not in the SRD" would have been a false statement about
  some of them. The exempt sets are pinned by test at 25 spells and 21 items so
  neither can silently grow.

- `[x]` **7.2 Dice roller on the sheet.** The most-used feature of D&D Beyond's
  sheet, and the app had nothing. Every modifier is now the button that rolls
  it — six abilities, six saves, eighteen skills, initiative, each attack's
  to-hit and damage, hit dice, death saves — with the working shown and the
  last twenty rolls kept in `PlayState`, where a refresh cannot lose them.

  `engine/dice.ts` takes its RNG as an argument rather than reaching for
  `Math.random`, because a roller whose output cannot be pinned is one whose
  "advantage" could quietly be "roll twice, keep the second" with every
  averaging test still passing. There is a test for exactly that. Crits double
  the dice and not the flat bonus, which is the rule `dpr.ts` already models —
  the two share their vocabulary so a player cannot be shown one rule while the
  optimizer reasons from another — and the extra dice are rolled fresh rather
  than the first ones doubled, which is not the same distribution.

  Death saves apply the two faces everybody misplays: a natural 20 is not a
  success, it is standing up with one hit point, and a natural 1 is two
  failures. A hit die spends and heals in one press, since doing only the first
  leaves the useful half to arithmetic in somebody's head.

  Two things surfaced on the way. Advantage printed `d20: 7 7` when both dice
  landed the same, because "which one was kept" was decided by value — it reads
  the index now, so exactly one die is always shown as dropped. And the sheet's
  own ink palette had never been contrast-checked, having no test that knew it
  existed: `--ink-faint` sat at 3.85:1 on the paper, under the bar every other
  text colour here is held to, and it carries the box labels on a sheet meant
  to be read at a table in poor light. Both are covered by tests now.

- `[x]` **7.3 Offline / PWA.** A manifest, icons, and a service worker
  precaching every built asset — including the 524 kB rules text, since a
  visitor who never opened a description would otherwise find that the one
  thing needing a network was the thing they wanted at a table with no signal.

  `scripts/build-sw.mjs` writes `dist/sw.js` after the build, because the
  asset names are content-hashed and only known then. Not `vite-plugin-pwa`:
  it brings Workbox, which is larger than the script and answers questions
  this app does not have. The build fails if the worker ends up precaching
  itself, or if `index.html` is missing from the list.

  The update path is the whole risk, so it is explicit. The cache name is a
  hash of the precached *bytes*, so any deploy fills a fresh cache and
  `activate` deletes the old one — never a half-updated mixture. The new
  worker does not `skipWaiting()` on its own; it waits, the app says "a new
  version is ready", and the swap happens when the reader presses Reload.
  Navigations are network-first, so somebody online is never a deploy behind.

  Two things a unit test could not have found, both caught by actually going
  offline in a browser. The first: every asset lookup missed, and the app
  served its cached page and then failed to load a single script — a blank
  page with the right title. The cause is `Vary: Origin`, which Vite's preview
  server sends and CDNs commonly do: the worker's own precache request carries
  no `Origin`, and the page's module-script requests always do, so the two are
  not equivalent. `ignoreVary` on the lookups, with the reason written down
  where the next person will meet it. The second: the build id hashed the
  asset *names*, which are content-hashed and so would have been enough for
  the assets — but `index.html`, the manifest and the icons keep their names
  forever, so a deploy touching only those would have left an offline visitor
  on the old page indefinitely. It hashes contents now.

- `[x]` **7.4 Starting equipment by class.** Both editions, all twelve SRD
  classes, from the structured `starting_equipment_options` the API serves.
  Offered at 1st level only and for a single class, because a Fighter 3 taking
  a Rogue level gets the multiclassing list instead and a level 5 character
  being typed in already owns things. Taking it writes `weapons`,
  `defenses.armorId`, `defenses.shield`, `gear` and — for 2024 — `coins`.

  The two editions differ in kind, not only contents: 2014 asks four separate
  questions, 2024 asks one whose answers are whole kits plus "or take the
  gold". Both normalise to groups of options, so one renderer serves both and
  neither is the special case. Where the book says *any martial melee weapon*
  the option carries a **pick** — a category and a count — answered from the
  edition's own weapon table, so a 2014 character is never offered a firearm.

  Three things came out of building it. 2024's gold is stated **only in prose**
  (`"...and 4 GP; or (c) 155 GP"`), and one option per class is structurally
  empty because it *is* the gold — so it is read positionally out of the
  sentence, but only where the count of amounts matches the count of options
  exactly, which holds for all twelve. The bundle unit differs: the source
  counts single arrows and this app owns bundles of twenty. And a build holds
  two weapons with nowhere to put a spare, so a Barbarian's four javelins are
  **reported as unrecorded** rather than dropped — an honest gap beats a quiet
  one.

  The `data` chunk grew ~20 kB, which the bundle budget caught and which was
  paid rather than made lazy: 2.6 kB over the wire for a Builder panel that
  should feel instant.

- `[!]` **Starting equipment by background.** — *blocked, no source*
  The other half of what this item originally claimed, and it cannot be done
  from anything licensed. **SRD 5.1 carries exactly one background** (Acolyte),
  and even that one's list in the API is two items where the book has six. SRD
  5.2 has four — Acolyte, Criminal, Sage, Soldier — and Open5e serves them only
  as a sentence of prose, not structure. The app carries 13 backgrounds for
  2014 and 16 for 2024. Writing kits for the missing twelve would be exactly
  the provenance this file treats as weaker, applied to a table nobody could
  check against anything. Unblocked by a licensed structured source, or by
  someone deciding the four 2024 ones are worth a prose parse on their own.

- `[x]` **7.5 Guided level-up.** Raising the level by one now says what
  happened: hit points, features gained by name, and every decision the level
  opened, each with a count and a button to the section that already knows how
  to make it. **The number field is untouched** — typing 12 over 3 still works
  and says nothing, because that is entering a character rather than levelling
  one.

  It computes rather than stores. Two builds go in and the differences come
  out, so it cannot drift from what the engine believes and there is no "you
  levelled" record to migrate. It reuses the existing machinery rather than
  reimplementing any picker: the same `optionGroups`, the same spell counts,
  the same subclass-level rule that knows 2024 moved every subclass to 3rd.

  `defenses.hpMode` gained a fourth value, `rolled`: one die per level above
  the first, in order, so this level's die can be rolled without disturbing the
  ones before it. A level not yet rolled counts as the **average**, not zero -
  and because the list has to survive JSON, "not rolled" is the sentinel 0
  rather than a hole, since a hole becomes `null` on the way through. Levelling
  twice before reaching for the dice must not silently cost hit points.

  Two things it caught in itself. A class swap - Fighter 4 becomes Wizard 5 -
  read as a level-up, because only *growth* was checked and the Wizard did grow
  from nothing; it now also refuses when anything shrank. And the hit point
  sentence was baked into the summary at level-up, so it went on saying "the
  fixed average" a moment after somebody rolled — the wording is written by the
  panel now, against the character's current mode.

- `[x]` **7.6 Character portrait.** In the box a paper sheet has for one, at
  the top left, and it prints — a face is part of the sheet rather than a
  control on it. The buttons under it are `cs-screen` and are not.

  What you choose is never what gets stored. The image is drawn onto a canvas,
  cropped to centre rather than letterboxed, and re-encoded as JPEG — a phone
  photograph is four megabytes and has no business sitting in a roster.
  Verified in a browser: 3.6 MB of incompressible noise comes out at 32 kB and
  256×256.

  *The sizes here — 256 square, 40 kB, six qualities stepping down to 0.3 —
  were set against a roster-wide `localStorage` budget of five megabytes, and
  §24 raised them once that ceiling came off. `engine/portrait.ts` carries the
  current numbers.*

  It refuses rather than storing something oversized when even the lowest
  quality will not fit, and the sheet says what the portrait costs — "why did
  my characters stop saving" is a bad way to learn about a shared quota.

  **Not carried in share links.** A link is a URL fragment of about 1.2 kB, and
  a portrait would make it a hundred times longer — past what several chat
  clients send in one piece and well past what anyone will paste. That argument
  only got stronger when §24 raised the portrait ceiling. Stripped in
  `share.ts` beside `combatAssumptions`, and pinned by a test that asserts the
  link stays short.

- `[x]` **7.7 Potions and scrolls get used up.** 41 potions and 12 scrolls were
  catalogued with good summaries and *none of them did anything*: the model had
  no concept of a consumable — no count, no use action, and no way to record
  which spell was on a scroll. `CarriedItem` gained `quantity` and `detail`,
  both optional so no save needed migrating, and both offered only on the two
  kinds the books use up, because a quantity on a Cloak of Protection would
  invite two of a thing whose effect does not stack.

  `detail` exists because the SRD has no "Scroll of Invisibility" — it has a
  Spell Scroll (2nd Level), and the spell is written on the scroll. Free text
  rather than a picker from this app's spell list, since a scroll can carry a
  spell this app does not know and a picker would make that unrecordable.

  Only healing has anywhere to go. `MagicItem.use` is deliberately a separate
  field from `effect` — `effect` means "changes a number while you carry it",
  and folding a one-shot into it would corrupt the count of items that do — and
  the four healing potions carry structured dice that roll through the same
  engine as everything else and land in the roll log. Everything else is spent
  and logged with what it was: silently refusing to spend a Potion of Speed
  because the app cannot model haste would be a worse answer than spending it.

- `[x]` **7.8 The action economy, and counters the books here do not have.**
  Action, bonus action, reaction and movement, on the sheet beside the armor
  class and `cs-screen` throughout — what is left of a turn is true for about
  six seconds, and a printed sheet claiming your reaction was spent would be
  wrong before the ink dried.

  There is deliberately **no "end turn"**. All four come back at the *start* of
  your turn, the reaction included, and that is the rule tables misplay most
  often: a reaction spent on somebody else's turn feels like it belongs to last
  turn and gets ticked back a beat early. The only control is "New turn".

  Dash adds your speed again rather than doubling what is left — twenty feet
  into a 30 ft move it leaves forty, not twenty — and costs nothing, because it
  is an action for most characters, a bonus action with Cunning Action and free
  for a Tabaxi burning Feline Agility. Charging one of those would be wrong two
  times in three. Movement measures against the speed the sheet prints, so
  heavy armor you are too weak for and Boots of Speed both reach it.

  Spell slots, pact slots and every class resource were already tracked; this
  closed the one gap next to them. **Piety was the case that shaped the rest.**
  It is not SRD content — Theros is a supplement this project cannot reproduce
  — and it is not a pool either: it is a *score*, counting up rather than down,
  that no rest touches. So `Build.customResources` lets you name a counter with
  a maximum, a direction (`startsAt: 'full' | 'empty'`) and a recharge that can
  be `none`. Values live in `PlayState.customValues` as the number on screen
  rather than an amount spent, because "spent" means nothing for a score. They
  are left out of `isFresh` on purpose: 12 piety is progress, not something a
  rest could give back.

Deliberately out of scope for *this section*: homebrew authoring; campaigns,
party view, accounts and sync; PDF export; VTT integration. The last four need
the backend section 6 rules out. **Monsters, the encounter builder and the
combat tracker were on this list and have moved to section 8**, the owner
having asked for them.

---

## 8. The DM half

Asked for "more of a dungeon master, player tracker & combat encounter — the
whole Shabbag", with a DM who can pick a combatant out of turn order, bring up
their sheet and **ping it open in a mini window**; the same for monsters; and a
dungeon map generator. This reverses §6's "no DM tools", which is recorded
there rather than quietly dropped.

Three constraints survive intact: **no backend**, **2014 and 2024 only**, and
**nothing unlicensed**. Two consequences fall straight out of them and are
stated in the app rather than papered over — the monsters are SRD 5.1, and
encounter difficulty is rated by this project's own damage model rather than by
a reproduced XP-threshold table.

- `[x]` **8.1 Monsters as data.** All **334 SRD 5.1 stat blocks**, fetched by a
  new `srd-2014-monsters` set in the refresh script into
  `src/data/srd/srd-2014-monsters.json`, and served through `data/monsters.ts`
  by the same lazy-import pattern `rulesText.ts` uses.

  **There are no 2024 monsters, and this is a real gap rather than an
  oversight.** The 2024 endpoint serves three creatures — an aboleth and two
  dragons — so no licensed structured source carries SRD 5.2's bestiary. A 2024
  table gets the 5.1 monsters and is told why, which is the answer the full
  rules text already gives for the spells it has no licence to. It costs a 2024
  table less than it sounds: monsters changed far less between the editions
  than characters did.

  The distillation is where the work was. The source states the same fact three
  ways and none of them reads like a stat block: a recharge is
  `{type:'recharge on roll', min_value:5}`, a per-day use is
  `{type:'per day', times:3}`, and `hover` is a **boolean filed among the
  speeds** — a will-o'-wisp is `{walk:'0 ft.', fly:'50 ft.', hover:true}`, which
  left alone prints as "hover true ft." Speeds become numbers because the map
  will measure against them; a sense keeps its string when it carries a
  qualifier, because "60 ft. (blind beyond this radius)" is not a number and
  rounding it to one loses the words that matter.

  **`hit_points_roll` is "19d12+133", which `parseNotation` already reads**, so
  rolling a monster's hit points and its damage needs no new dice code at all —
  the engine written for the character sheet serves the bestiary unchanged.

  `monsters.test.ts` asks a different question from every other data test here.
  The others ask whether upstream has drifted from the app's table; there is no
  table, so this one asks whether the code can read what it will be handed —
  all 140 damage expressions and all 334 hit point rolls parse, every speed is
  a number, and every condition immunity names a condition the app knows. That
  last one found the single honest exception: **exhaustion**, which this app
  models as a six-level track rather than a condition, so it is allowed through
  by name and by reason rather than by silence.

- `[x]` **8.2 The encounter engine and the tracker.** A **Table** tab: the party
  from the roster, monsters from the bestiary, initiative, rounds, and what is
  left of everybody. `src/encounter.ts` is a sibling of `play.ts` under the same
  contract - session state, persisted, off the undo stack.

  **A character in the fight is a reference, not a copy.** The combatant holds
  their roster id and nothing else; every read goes through `hpNow` on the
  `PlayState` their sheet uses and every write through `updatePlay`. So the hit
  points on the DM's screen *are* the hit points on the player's sheet rather
  than two numbers that have to be reconciled - verified in a browser, damage
  dealt in the tracker showing on the sheet without a refresh. The alternative
  was a second copy plus a push-back step, which is two sources of truth and a
  bug waiting for whoever edits the other one. `combatants[0]` carries no `hp`
  key at all, and there is a test asserting exactly that.

  Advancing onto a character's turn calls the `newTurn` written in 7.8, so the
  action economy comes back where the rules say it does rather than when
  somebody remembers to press it. That is the whole payoff of tracking a turn.

  Two ordering rules are load-bearing. **Initiative ties break on a stored
  tie-break, decided once when initiative is rolled** - resolving them at sort
  time, off a stat block or worse off `Math.random`, would reorder the list on
  some later render for reasons nobody could see, in the middle of a fight.
  And **removing a combatant keeps the pointer on whoever is up**: taking out
  somebody earlier in the order shifts everyone below them down one, so an
  untouched index silently skips the next turn. Both have tests named after the
  bug rather than the feature.

  Monsters store the SRD index and never the stat block, so a saved fight is a
  few hundred bytes against the roster's shared quota; the block is resolved
  from the lazy bestiary at render time. `hydrateEncounter` drops a combatant
  naming a character who has since been deleted, the same guard `hydrateBuild`
  applies to an unknown class - a stale reference reaching the UI is a crash on
  every load, and the roster is read at start-up.

  The stat block shares the character sheet's ink palette rather than copying
  it: `.cs, .mc` is one declaration, so the contrast test that caught
  `--ink-faint` at 3.85:1 now covers the bestiary too. Verified in a browser at
  1360px and 380px in both themes and both rulesets: the bestiary chunk is
  fetched **0 times before the Table tab is opened and once after**, and the
  printed page keeps the stat block while dropping every control.
- `[x]` **8.3 The mini window.** `window.open` plus a React **portal**, so the
  popped-out content is the *same component instance* rendered into another
  document. A hit point changed in the window changes in the tracker in the
  same tick, because it is one JS context and one state tree - verified in a
  browser, 49 to 42 in both at once. `BroadcastChannel` and storage events are
  both answers to a problem this shape does not have.

  A new window starts with an empty `<head>`, so every stylesheet is cloned
  across and `data-theme` is mirrored onto the child root and *kept* mirrored
  through a `MutationObserver` - otherwise the theme toggle moves the app and
  leaves the window behind. Confirmed by computing `.cs`'s background in the
  child rather than by counting `<link>` tags, since a stylesheet that arrives
  and does not apply looks identical to one that never arrived.

  **The fallback is not the sad path.** Where a popup is blocked, or the
  viewport is under 900px and there is nowhere to put a window, a draggable
  in-page panel renders instead and callers never branch. It is also the
  default in jsdom - `window.open` returns null there - so every component test
  that pops something out exercises it, which was the standing worry about
  building two paths.

  **The browser pass earned its place again.** `beforeunload` on a popup is the
  obvious hook for "the window was closed" and it does not fire reliably when
  the window is closed rather than navigated. Every unit test passed and the
  app went on believing the window was open, leaving a button reading "Close
  window" with nothing to close. `closed` is polled twice a second instead,
  with `pagehide` kept for when it does fire; a guard means whichever arrives
  first wins and neither repeats.
- `[x]` **8.4 What this fight will actually do.** Party damage per round against
  these monsters' armor, monster damage against this party's, hit points on both
  sides, and who runs out first - read off the damage curve `dpr.ts` already
  computes for every character, so it knows real weapons and feats rather than a
  level. `engine/forecast.ts`.

  **No XP-threshold verdict**, because those thresholds are DMG content and this
  project does not reproduce what it has no licence to. A test asserts the
  wording never uses "deadly", "hard" or "medium": borrowing the vocabulary
  would imply the arithmetic behind it. Each monster's own XP *is* SRD, so the
  total is shown beside the model and labelled as the one figure that is not one.

  It needed a data change. **148 of the 334 monsters have a Multiattack and they
  are the dangerous half**, so reading only a stat block's first attack would
  rate an adult red dragon at a third of what it does. The refresh script now
  keeps the structured `{action_name, count}` list the source states alongside
  the prose - 113 of the 148 have one, and every name in them resolves to a real
  action. The other 35 state it in prose alone; those are counted at one attack
  and the forecast **says so by name** rather than being quietly understated.

  Recharge abilities and saving-throw effects are excluded and also named. A
  dragon's breath counted every round overstates a fight as badly as ignoring it
  understates it - it is a die rolled each turn, and the party's six save
  bonuses are not in the model. Naming it is the honest middle.

  **The bug worth recording:** the first version reached for `dpr.ts`'s
  `parseDice`, which is anchored on bare dice (`^(\d+)d(\d+)$`) because the
  weapon table keeps its bonus in a separate column. Almost every monster's
  damage is written "1d6+2", so it returned zeroes and a goblin was silently
  rated at **1 damage a round instead of 2.9**. Caught because the test worked
  the number by hand rather than pinning whatever came out. It uses
  `parseNotation` now - the same parser `monsters.test.ts` already asserts all
  140 damage expressions against, so there is one parser for one job.
- `[x]` **8.5 The dungeon generator.** Binary space partition, a room per leaf,
  corridors joining neighbours, doors where a corridor crosses a wall. Rendered
  as **SVG** so it prints at any size, needs no `ref` or resize handler, and is
  in the DOM for a screen reader. Ink on paper in both themes, from the palette
  now shared by `.cs`, `.mc` and `.dmap` - three paper artefacts, one
  declaration, one contrast test.

  **Seeded, and that is the design rather than a detail.** A 30-line xorshift32
  and an FNV hash mean any text is a seed, the same seed always gives the same
  map, and the state worth keeping is eight characters. So a DM writes
  `the sunken abbey` in their notes and gets the map back; a map travels in a
  link as a word rather than as a picture; and - the part that made this
  buildable - "it generates a dungeon" becomes testable.

  The tests assert *properties*, not output. Pinning the rectangles would fail
  on any change and say nothing about whether the change was an improvement.
  What has to hold is that rooms never overlap, every room is inside the map and
  big enough to walk into, **every room is reachable** by walking the corridor
  graph, corridors move only orthogonally, and every door is in a wall.

  **That last one was a real bug.** The first version marked the square on the
  far side of each boundary, on both the entering and the leaving branch, so
  every door floated one square out into open floor. It was perfectly plausible
  in a list of coordinates and obvious within a second of drawing the map as
  text - which is the argument for rendering something before trusting it. A
  door is now always the threshold square *inside* a room, deduplicated where
  two corridors meet at one, and `everyDoorIsOnARoomEdge` pins it across seven
  seeds. Merging the two corridor legs into one walk fixed a second artefact at
  the same time: the elbow belonged to both, so every corner grew a door.

  Rooms are numbered left to right rather than by tree order, and joined in a
  chain by position rather than by BSP sibling - a sibling join produces two
  rooms adjacent on screen and twenty squares apart to walk, and "the third room
  on the left" has to mean what it says.
- `[x]` **8.6 Tokens on the map.** Combatants get a square, and dragging one
  reports how far it went - five feet a square, **diagonals included**, which is
  the ordinary rule rather than the optional 5/10 variant. Choosing the variant
  for everybody would quietly change how far a Rogue gets on a turn.

  A character's drag is **charged against the movement their sheet already
  tracks**, so the map and the turn tracker written in 7.8 are two views of one
  number rather than two that have to be kept in step. Verified in a browser:
  four squares dragged on the map, and the sheet reads "10 of 30 ft". Monsters
  are moved but not charged - nothing tracks a monster's movement, and inventing
  a budget the app then policed would be worse than not having one.

  `moveCombatantTo` measures and returns the distance rather than applying it,
  because what a move costs depends on whose it is and `encounter.ts`
  deliberately does not reach into a character's `PlayState`.

  **A browser pass caught the design error.** The map's seed lived in component
  state while the tokens lived on the encounter, so opening a character sheet
  and coming back regenerated the map and left everyone standing where the *old*
  map's rooms had been. The seed is on `EncounterState` now - eight characters,
  and the map is part of the session, which is what that object is for. A fixed
  default rather than a random one, so a reload does not move the dungeon under
  a DM mid-session.

  The pointer handlers are on the `<svg>` rather than on each token: a drag that
  outruns the token - which every drag does - would otherwise stop the moment
  the pointer left the circle it started on.

---

## 9. Forge originals — **parked after 9.1**

Asked how to fill the gaps with *"intellectually distinct content inspired by
the later expansions."* The answer is that you cannot add the missing content -
you can add *different* content covering the same ground, and that difference
is both what makes it legal and what makes it useless as a substitute. Somebody
who wants the Hexblade wants the Hexblade, because that is what is at their
table.

Game **mechanics** are not copyrightable; specific **expression** is - the
prose, the names, and the particular selection and arrangement of features.
That asymmetry is why Kobold Press and Level Up A5E exist. So a new subclass
under an original name is clean, and "Hexblade with every sentence reworded" is
not, however far the wording moves. The owner chose the first, off by default.

- `[x]` **9.1 Say where every row came from.** The `source` field four tables
  already carried, closed into a union with `'Forge'` as a member and put on
  screen. The SRD is deliberately *not* one of the codes: it is not a book but a
  CC-BY subset of the Player's Handbook, and one field cannot hold both facts.
  Fixed a bug on the way in - `subclassSource` rewrote every source to
  `PHB 2024` under the 2024 ruleset, which would have told a player a Forge
  original came from the Player's Handbook.

- `[~]` **9.2 The originals switch** — *parked 2026-08-04.*
- `[~]` **9.3 Twelve original subclasses** — *parked 2026-08-04.*

  Parked by the project owner once the app grew a DM's screen and section 10
  became the live thread. **Nothing is blocked**: 9.1 shipped the whole
  provenance layer, so the switch and the content can land whenever they are
  wanted, on a foundation that is already tested and already knows how to badge
  an original. The design and the editorial standard - original names guarded by
  a reserved-name test, a required design note, and a balance check running
  `computeDpr` against the band each class's SRD subclasses occupy - are written
  up and waiting.

---

## 10. The workspace

A three-panel layout, asked for after section 8: *"Center pane is where all the
action is with left and right panels (moveable) for turn order, player
stats/sheets."* The shape Photoshop, Foundry and Roll20 all settle on, for the
same reason - two questions stay live while you work on the third.

Scoped to the **Table tab first** rather than the whole app, and to **resize and
collapse** rather than full docking. Most of what docking buys is already there:
8.3's pop-out detaches anything into its own window, which goes further than a
dock.

- `[x]` **10.1 The workspace shell.** Two rails and a centre; dividers drag to
  resize and collapse to a labelled strip; widths remembered per surface. Rules
  in `workspace.ts` with no DOM, including what to do with a stored width that
  is not a number - a grid handed `NaNpx` silently collapses the column, which
  reads as the rail failing to render rather than as bad stored state.

  Three deliberate choices. The drag listeners are on `window` rather than the
  divider, because seven pixels cannot keep up with a pointer between renders.
  The dividers are real focusable separators with arrow-key resize and
  `aria-valuenow`. And the centre is `minmax(0, 1fr)` rather than `1fr`, or one
  wide table would push the rails off screen instead of scrolling itself.

- `[x]` **10.2 The compact play card.** Not the character sheet, which is paper
  and wants the width it was designed for. A different thing with a different
  job: what a DM needs about somebody *while it is not their turn*. Hit points
  and armor class, because that is what the next attack roll is measured
  against; the proficient saves, because half of what a monster does is a
  saving throw; the attack line and the movement left, for when it *is* their
  turn. No skills, no equipment, no spell list - those are a click away on the
  sheet, and the point of a rail is that it fits.

  It is a **view**, not a store. Every number is read from the same
  `BuildContext` and `PlayState` the sheet reads and every write goes back
  through `damage`, `heal` and `toggleTurnSlot`. A second copy of a character's
  hit points would not announce itself; the card would simply drift from the
  sheet over an evening, so the tests check the numbers agree rather than that
  the card renders.

- `[x]` **10.3 Lay the Table tab out in the workspace.** Turn order pinned left,
  the map in the centre, the selected combatant on the right. Five stacked
  panels became three columns, and the tab stopped being a scroll.

  **Selection is held, not derived.** "Whose turn is it" and "who am I looking
  at" are different questions - a DM checks the Wizard's hit points on the
  Fighter's turn - so a rail that snapped back to the active combatant every
  time the turn advanced would be unusable for exactly the thing it is for. It
  falls back to whoever is up when nothing is chosen, so it is never empty
  during a fight without somebody having emptied it.

  The inline "Stat block" expander is **gone**: a stat block belongs beside the
  fight, not stuffed into the turn order it pushes apart. Selecting a monster
  puts its block in the rail, and a character gets the compact play card.

  **The Table takes the whole window** (`.app.is-wide`). The 1240px cap is what
  keeps the Builder and the sheet readable - prose stretched across a wide
  monitor is harder to read, not easier - but the Table is neither a form nor a
  document, and capping it left the centre pane at 606px on any monitor. It is
  726px at 1360 now and grows from there.

  Verified at 1360, 1024 and 768 in both themes: three columns above 1000px and
  a single stack below, drag resizes, collapse leaves a labelled strip and
  reopens at the width it had, and print drops both rails and keeps the map.

---

## 11. Monsters you made

Asked for after section 10: *"Monsters may want to be moved into characters so
they can be built and saved for later."* The 334 SRD stat blocks are a
reference; a campaign runs on the twelve of them a DM has bent to fit, and until
now every one of those bends lasted until the fight ended.

Three decisions, all the project owner's:

1. **Characters is the workshop; the Table keeps its own search.** Browsing,
   duplicating, editing and deleting happen under Characters. The Table does not
   send you there mid-fight - its search box simply covers both stores.
2. **Duplicate an SRD block and tweak it**, rather than a blank creator. Nobody
   starts a monster from nothing; they start from the one that is nearly right.
3. **Its own store**, not part of the roster. A bestiary outlives a party - a DM
   clearing out old characters should not lose two years of stat blocks by doing
   it - so it gets its own `localStorage` key and its own export.

- `[x]` **11.1 The bestiary store.** `src/bestiary.ts`: its own key, a `custom:`
  id namespace so an SRD id can never be shadowed by accident, and hydration
  with the same discipline `hydrateBuild` uses - this is read at start-up, so a
  record missing a field the card renders would white-screen the app on every
  load and the only way out would be clearing site data.

  A saved monster **is a `Monster`**. Nothing downstream learns a new type:
  `MonsterCard` renders one, `forecast.ts` measures one, `addMonster` puts one
  in the turn order.

  It also carries `xpForCr`, because editing a challenge rating has to move the
  XP with it. Checking that table against the fixture found **four SRD stat
  blocks carrying the row above's value** — a Brass Dragon Wyrmling at CR 1
  worth 100 XP, a Dretch and a Riding Horse at CR 1/4 worth 25, a Deep Gnome at
  CR 1/2 worth 50. The refresh script now derives XP from the rating rather than
  the record, so the same drift upstream is corrected instead of shipped. CR 0
  is left alone: the SRD awards 0 XP or 10 depending on whether the thing can
  fight, and only the record knows which.

- `[x]` **11.2 The workshop.** A Bestiary section beside "Your characters" and
  "Import / Export": search across both stores, copy any of the 334, edit it,
  delete it. Name, size, type, alignment, armor class, hit points and hit dice,
  five speeds, ability scores, challenge rating, languages, and traits, actions,
  reactions and legendary actions in full — with the stat block drawn beside the
  fields, because a form that only showed fields would mean saving, switching
  tab and coming back to find the header now reads "Medium humanoid, ".

  **Edits are written through**, no save button and no draft, the same way the
  Builder writes to the active character. Safe here for the same reason it is
  safe there: you can only ever edit a copy. The tests check the *store* rather
  than the screen, because a field that changed one without the other would look
  exactly like a field that worked.

  To hit and damage stay editable beside the prose. Leaving them off would have
  been tidier and would have made the app lie — a DM who doubles a giant's club
  damage in the text and is then told the fight is easy has a wrong answer from
  the forecast rather than a missing one.

- `[x]` **11.3 The Table searches both, and the bestiary travels.** One list,
  yours first, each row tagged. The workshop is under Characters, but a fight is
  no time to change tabs.

  A combatant whose stat block is not there now says which of the two things has
  happened. "Still loading…" was true for the first moment of a session and a lie
  for ever after a saved monster was deleted mid-fight — and the row keeps
  working either way, because a monster's hit points live in the encounter rather
  than in the stat block.

  Export is its own file with no characters attached, for the reason the store is
  its own: a DM handing their monsters to whoever runs next week should not have
  to hand over their party. Re-opening your own export updates by id rather than
  giving you two of everything.

---

## 12. The DM tool: Create and Play

The pivot, asked for in these words: *"overhaul the ui and UX. since this is now
moving into a new direction from character builder to full DM tool… almost as if
there should be a play(battle) and create (builder character / monster) modes"*,
with the battle screen taking *"heavy inspiration from the X-COM games. as it is
a grid, turn order, action economy, class based game as well."*

What was asked for, in scope order: encounter **simulation** so a fight can be
balance-checked before it is run; **line of sight** (explicitly not fog of war);
**terrain** placed by hand (rocks, trees, pillars) and tracked in play;
**areas of effect** that persist on the map (a wall of fire, a cloudkill); a
**generator with more options** in the spirit of donjon; and the two-mode
split.

Inspiration is inspiration: the X-COM *shape* — a map that owns the screen, a
turn strip, an action bar for the unit whose turn it is — with nothing copied
from anybody's assets or names. Same rule as always.

Decisions taken (reversible, but taken rather than asked, per the working
style):

1. **Two modes, one switch.** Create holds the Builder, the sheet, the
   Optimizer and Characters (with the Bestiary); Play is the battle screen and
   owns the whole window. The mode control replaces the flat five-tab strip.
2. **The battle screen keeps its engine.** Everything under the new HUD is the
   same `EncounterState`, `PlayState` and damage model — this section is a new
   face and new spatial systems, not a second copy of any number.
3. **Simulation samples real dice**, using each side's actual attack lines
   through the existing dice engine, because an expectation was already built
   in 8.4 and the question a DM actually has is "how often does this wipe
   them", which only a distribution answers.

- `[x]` **12.1 Two modes: Create and Play.** The nav becomes a mode switch;
  Create keeps its four tabs; Play fills the window and takes the desk tabs
  with it; switching back lands on the tab you left. `table` stayed a `Tab`,
  so everything keyed off it - title, wide layout, lazy chunks - was untouched.

- `[x]` **12.2 The battle HUD.** An initiative strip of unit tiles across the
  top of the map — initiative, name, hit bar, whose turn — and an action bar
  stuck to the bottom of the pane for whoever is up: action, bonus action and
  reaction as spendable pips, the movement budget as a draining bar, and End
  turn. The pips are the sheet's own `turn` object through `toggleTurnSlot`; a
  reaction spent on the bar is spent on the sheet in the same tick — a fourth
  window onto one turn, never a second copy.

  The advance moved: starting and ending turns belongs on the bar that is
  always on screen, so the rail's Next-turn button went, as did the map
  panel's duplicate movement line. One readout beats two that agree.

  The skin is geometry and weight, not a third palette — cut-corner tiles,
  mono headings, an accent-edged bar — all drawn from the theme's own
  variables, so parchment stays parchment and dark stays dark. Neither the
  strip nor the bar prints; what prints from a battle is the map.

- `[x]` **12.3 Terrain, and the Z axis.** Seven brushes — wall, pillar, rock,
  tree, water, rubble, floor — painted onto squares by click or drag, plus
  Raise and Lower for height in steps (+1 a ledge, −1 a pit; what a step means
  in feet is the table's call). Painting the same thing again erases it, so
  the commonest fix needs no eraser. All of it stored on the encounter beside
  the tokens, validated square by square on load.

  The kinds carry the flags the rules care about: wall/pillar/rock block sight
  and ground, a tree blocks sight but can be stood under, water and rubble are
  difficult ground - shown, not policed, the same choice as monster movement.
  **Floor is how a DM builds**: with zero rooms the generator hands over a
  blank grid, and floor and wall brushes carve a hand-made map onto it, which
  is what "manual placement of rooms" means on a grid.

  Two bugs paid for along the way. The room count lived in component state for
  two phases with exactly the bug the seed had already taught - set twelve
  rooms, refresh, get eight with the tokens stranded - so every generator
  input (seed, size, rooms) now lives on the encounter. And drag-painting
  outran the render loop, dropping squares mid-stroke: the same stale-closure
  shape `advance` guards against, met as gaps in a painted line, fixed by
  accumulating the stroke through a ref.

- `[x]` **12.4 Line of sight, with height.** `engine/sight.ts`: the line runs
  centre to centre between eyes half a step above the ground stood on, and a
  square cuts it when its top rises strictly above the line there. On a
  generated map everything outside rooms, corridors and painted floor is solid
  rock; painted walls are infinite; pillars, rocks and trees stand one step
  over their ground; bare ground blocks where Z says so.

  That one linear interpolation buys the table's own rulings: a ridge hides
  two people on the flat, an archer a step up shoots over the mid-field rock,
  the same rock still hides whoever crouches right behind it - and a pit's
  floor is hidden from a distant ledge by nothing but its own rim, which a
  test discovered by expecting the opposite and being wrong.

  On screen: a toggle draws lines from whoever is selected - solid when clear,
  dashed when cut - and the same facts in prose beside the map, because a DM
  narrates: "cannot see Goblin B" is a sentence before it is a line. Half
  cover (+2 AC) is reported when a blocking square stands beside the target on
  the attacker's side - a note, not an automatic modifier, because whether
  that pillar counts is famously a ruling.

- `[x]` **12.5 Areas of effect.** The problem is memory, not geometry: by round
  four the table is arguing about where the wall of fire was. A zone is that
  fact, drawn - sphere, cube, cone or line, placed with a click (aimed shapes
  take two: origin, then the way it points), labelled, tinted, counted in
  rounds and burned down as the top of the order comes back around. Who is
  standing in each is listed beside the map.

  The shapes measure the SRD's way: a sphere under the five-foot-diagonal rule
  is the square-ish blob it is on every table's grid; a cone is as wide as it
  is long. What a zone *does* is deliberately not modelled - a zone that
  rolled the saves would be playing the game instead of tracking it. It knows
  where, until when, and who; the table does the rest.

- `[x]` **12.6 Encounter simulation.** "Run it 1,000 times", in the forecast
  panel. Monster dice are real - initiative, every attack roll, every damage
  die, multiattacks attack by attack, crits doubling dice - through the same
  dice engine as the sheet's roller. The party deals its modelled
  damage-per-round against the monster it focuses, because sampling a caster's
  actual round would mean inventing decisions this app has no business making;
  the DPR curve is the honest summary. The caveat prints with the results.

  Out the other side: how often the party wins, the median length, hit points
  left on a win, and each character's chance of hitting the floor - the number
  the expectation cannot give, because the danger in a close fight lives in
  the variance it throws away. Tactics are fixed and dumb on purpose (focus
  fire one way, random targets the other), so two runs differ only by dice.
  Runs on request and clears when the sides change, so a stale distribution
  never sits beside fresh combatants. Deterministic under an injected rng,
  which is what makes any of it testable.

- `[x]` **12.7 The token knows its sheet.** Asked for directly: *"ensure
  players tokens have actions/spells based on their sheets and inventories…
  movement speed, dash action, attack actions"*, and then *"player health,
  status effects, and other key things like exhaustion"*.

  An action tray docks above the bar for whoever is up, and everything in it
  is the sheet with buttons on it. The attack lines roll to hit and damage
  (crit doubling dice) through the dice engine, spending the action with the
  roll and landing in the character's own roll log. Dash adds their speed and
  spends the action. Spells come from the castable list against real slots -
  the cheapest slot that can carry each spell, upcast when its level is spent,
  pact magic when that is what remains - spending the pip its casting time
  names; what a spell *does* stays with the caster. Potions and scrolls are
  used through the same `consumeItem` the sheet uses, healing rolled for real.
  A book caster's cantrips stay on the tray with nothing prepared, because
  cantrips are known, not prepared - a bug the tests caught on the way in.

  The bar itself gained the vitals: hit points with a draining bar (temp hp
  beside them), conditions as removable tags with the full list one select
  away - written to whichever store owns them, a character's sheet or the
  monster combatant - and an exhaustion badge.

---

## 13. Running the monsters

The review after section 12 named the biggest remaining gap in one sentence:
the players' tokens got their sheets, and the monsters' tokens did not get
their stat blocks. When it is a monster's turn the app shows the block and the
DM does everything else in their head. This section closes the DM's own loop.

- `[x]` **13.1 The monster's tray.** The active monster's stat block as
  buttons: every attack aimable, Multiattack as the whole routine, save-based
  abilities announced with their DC and dice ("DC 21 DEX, 18d6 fire" is the
  call a DM reads out), recharge abilities gated behind their own d6, per-day
  uses counted on the *instance* - Goblin A's breath being spent says nothing
  about Goblin B's. Legendary actions live in the rail on the selected
  monster, because a dragon acts when it is not the dragon's turn; three a
  round, refreshed by the engine at the start of its own. And a capped battle
  log on the encounter, because a monster has no sheet for its rolls to land
  on and an exchange belongs to the fight, not either side of it.

- `[x]` **13.2 Roll-to-target.** Aim - from a monster's action row or the
  character tray's "vs…" button - then click anybody in the strip or the
  order. The app rolls each strike, compares against the target's real armor
  class with half cover (+2) counted when both stand on the map, doubles dice
  on a natural 20, applies the total to whichever store owns the hit points,
  and logs every line. The whole exchange is one roster write, because a
  Multiattack resolved as several writes would have the dragon's claws erasing
  its own bite - the same stale-closure shape this file keeps meeting.

- `[x]` **13.3 Group saving throws.** The call, the answers, the damage. Every
  living combatant rolls with their real bonus - a monster's from its stat
  block, a character's from the same sum their sheet prints - pass and fail
  are listed for reading out, then full damage to the failed and half to the
  passed in one write. A fireball in three clicks.

## 14. The fight's clocks

Zones got round-counting in 12.5; nothing else did. Concentration is not
tracked at all despite `spell.concentration` sitting in the data; conditions
are toggles somebody has to remember to untoggle; a downed character's death
saves live only on their sheet.

- `[x]` **14.1 Concentration.** Casting a concentration spell marks it on the
  sheet's own store; casting a second drops the first *and says so* - the half
  of the rule tables forget, handed back by `startConcentration` to be said
  out loud. The bar carries the chip, pressable when it breaks; damage landing
  on a concentrating character writes the CON save and its real DC (10 or half
  the damage) into the fight's log at the moment the rule fires. It does not
  survive a long rest.

- `[x]` **14.2 Condition durations.** The bar's condition select gained a
  rounds box: filled, the condition carries a clock, ticked as the top of the
  order passes on the same beat as the zones, gone at nothing. Untimed
  conditions still wait for a hand, and clearing one by hand clears its clock.
  Both stores - a character's sheet, a monster's combatant - run the same
  rule.

- `[x]` **14.3 The order bends.** When the active character is at nothing the
  bar swaps its pips for death saves: the six dots and a roll that applies the
  two special faces - a 20 stands them up on 1 hp, a 1 is two failures. Delay
  steps a combatant exactly one place down the order by taking the next
  combatant's initiative with a tie-break just under it, and when the delayer
  was up, the pointer now names who moved up - which is what "you go, I'll act
  after" means.

## 15. Encounter prep

There is exactly one encounter slot, and a DM preps four fights for Saturday.

- `[x]` **15.1 The encounter library.** `encounters.ts`: saved, named fights -
  monsters, map seed and size, terrain, zones - in their own store beside the
  bestiary's, saving under the same name replacing, because that is what
  re-prep means. Loading one starts fresh: round nothing, no stale pointer, no
  last month's log, and any character reference today's roster no longer holds
  is dropped - the fight was prepped for a door, not for a departed party.

- `[x]` **15.2 Bestiary filters.** CR range and creature type beside the
  search box on the Table, because "CR 2 to 4, undead" is how prep actually
  asks.

- `[x]` **15.3 Difficulty from the simulation.** A fixed-seed 200-run estimate
  in the forecast panel that moves as monsters are added, worded in bands - a
  walkover, comfortable, a real fight, desperate, a likely wipe. The
  XP-threshold table it replaces is DMG content this app does not carry; this
  number is the app's own work, and better - it knows these characters.

---

## 16. The battle screen answers the hand

Sections 13–15 closed the data loop; this closes the pointer's. Asked for
directly: *"should be able to play Players and Monsters by selecting their
portrait in turn order and then the tile"* and *"Spells should have an overlay
to show where the effect is before clicking to place"*, plus four approved
extras in the same register.

- `[x]` **16.1 Portrait → tile.** Select anybody in the strip or the order,
  click a square, they go - the flow squad-tactics screens taught everybody.
  A character is charged through the same path the drag uses and **refused
  outside their wash**; a monster moves free, as its drags always have. The
  wash is the selected combatant's remaining movement drawn on the map -
  Chebyshev minus rock, walls and standing-blocked terrain, the same rule the
  charge runs on - and doubles as the mis-click guard.

- `[x]` **16.2 Ghosts before commitment.** While placing a spell, the same
  `zoneSquares` that will draw the real thing draws a dashed, thinner ghost at
  the cursor - sphere and cube ride it; a cone or line waits for its origin
  then swings toward the pointer. The brush gets the same cursor square
  outline. What you see is exactly what the click commits.

- `[x]` **16.3 The hand's small change.** A ruler in the map's corner - the
  distance in feet from the selected combatant to the cursor, no tool to pick
  up. Space or N ends the turn; Escape puts down whatever is in hand, most
  urgent first: aim, spell, brush, save results. Damage landing replays a hit
  flash on the token and the strip tile (the flash count lives in the React
  key, because remounting is what replays a CSS animation); at half hit
  points both turn bloodied amber, the word every table uses. Clicking a
  token targets it while aiming; double-clicking pops out its sheet or block.

- `[x]` **16.4 Walked, not radiused.** Asked for plainly: *"People cannot go
  through walls (typically)"*, and *"The Distance tracker should show a line
  between the two targets."* The wash's first cut was a Chebyshev circle with
  blocked squares removed - which offered the far side of a wall at five feet,
  the wall being merely in the way rather than underfoot. `engine/path.ts`
  walks the grid instead: Dijkstra with walls and rock impassable, difficult
  ground costing double (the rule the app previously only *showed*), diagonals
  at five feet like every other step, and no cutting the corner between two
  pillars. The cost the walk reports per square is what the click charges, so
  going around the wall costs the going-around. Drags refuse unwalkable
  destinations too. And the ruler draws the dotted line it is measuring,
  because a number with no line is a quiz.

  Two of the walk's tests were corrected by the walk: one hand-worked the wade
  through water at fifteen feet and Dijkstra found the dry ten-foot route
  around it, and one gave a corner-detour ten feet of budget and was surprised
  the square was missing - the detour is fifteen, and the detour is the point.

- `[x]` **16.5 Acting from the order.** Voice-noted plainly: *"the attack
  actions were down there; they should be in the left where the player is…
  you should be able to do all your movement and everything from somewhere
  where you could still see the map."* The trays moved out of the bottom dock
  and into the turn order itself: click anybody and their row expands with
  what they can do - a character's attacks, spells, dash and pack; a monster's
  stat-block actions - beside the map, not a screenful below it. One turn
  order, not two; the sheet stays on the right for double-checking. The dock
  keeps only what must never scroll away: whose turn, the vitals, End turn.
  And the ruler's readout rides the cursor now, clamped inside the drawing,
  because measuring the bottom-right of a big map with the answer printed
  forty squares away was a quiz.

- `[x]` **16.6 The walk owns the picture.** From the screenshot that showed
  the ruler crossing two walls: the walk (`walkMap`, now with predecessors)
  serves the wash, the click's price and the ruler from one computation. The
  ruler's line **bends along the actual route** - through the door, around
  the wall - and its number is the walked feet; where no route exists it says
  "no path" instead of inventing one. The wash gained a **dash tier**: an
  amber band beyond plain movement showing what a Dash would reach, and a
  click into it *is* the Dash - budget grows by their speed, the action pip
  goes with it, the log says so. And before the fight starts, click-select
  then click-place is free setup, charged to nobody.

  One test began by setting the active character's movement to nearly spent
  and watching the click-to-move "fail" - the app was correctly handing
  movement back, because starting the fight begins their turn. The test moved
  to a character whose turn it was not; the rule stood.

- `[x]` **16.7 Speed is derived, movement is spent.** Two halves of the same
  promise: the number on the map is the sheet's number, and everyone pays it.
  The speed formula (`race.speed - penalty + items`) had been copy-pasted
  across six components, so a character with **Mobile** walked a base 30 on
  the battle map no matter what their sheet said. `computeSpeed` now lives in
  the engine with a breakdown line per source - race base, armor Strength
  penalty, magic items, Mobile/Speedy, Squat Nimbleness, Boon of Speed,
  **Barbarian Fast Movement** (5th level, denied only by *heavy* armor) and
  **Monk Unarmored Movement** (+10 at 2nd scaling to +30 at 18th, forfeited
  by armor or a shield) - and every reader asks `ctx.speed.total`. The
  Builder's speed breakdown shows the engine's own lines.

  And monsters now spend movement like everyone else: `moved` sits on the
  combatant, refunded when its turn comes round (beside the legendary-action
  clock, by the thing that knows a turn began), charged by click-moves and
  drags alike once the fight is on. The monster's wash shrinks as it walks,
  the dash tier is real ("Goblin Dashes." in the log), the bar's Move readout
  counts a monster's feet down, and the cursor ruler says what the walk will
  take: plain feet, "· Dash", or "— too far".

---

## 17. The FFT treatment

The reference points are Final Fantasy Tactics' remaster and X-COM's
targeting. The battle screen borrows their presentation outright: the game
styling applies in Play only, and the ink-on-paper map stays untouched for
printing and Create-mode building.

- `[x]` **17.1 The chrome.** The turn strip is an FFT timeline: queue number
  counted from whoever is up (1 is acting, 2 is next — blue for the party,
  red for the enemy), the face (a character's portrait when they have one),
  name over the hit bar. The action bar's "who" became the unit card: face,
  name, class-and-level line ("Champion Fighter · Lv 5"; a monster shows its
  CR). Over the map itself: a hint pill saying what the tool in hand wants
  next ("Click a lit tile to move — amber needs a Dash", "Click the origin
  square, then point the shape"), the FFT **Height** readout at the cursor
  (steps and feet), and a controls legend in the corner. None of it prints.

- `[x]` **17.2 The ground speaks.** The move tiles are FFT's lit blue, each
  with its own bright edge; the dash tier is X-COM's amber. Around each tier
  runs a hard perimeter line - solid for plain feet, dashed for the Dash -
  built from every tile edge the wash does not share with itself. While a
  spell is being placed, the grenade lob: an arc from the caster (or the
  aimed shape's origin) to the cursor, an impact ring where it lands, and
  the hint counting what the footprint would catch ("catches 2 creatures"),
  counted by the same `combatantsIn` the real zone uses. None of the
  tactical light prints.

- `[x]` **17.3 Tactical View.** The isometric camera. `IsoMap` is a *sibling*
  of the flat map with the same props contract - same tokens, washes, zones,
  ruler, arc, handlers - so `TableTab` swaps cameras on one toggle. A grid
  vertex lands at `((gx − gy)·HW, (gx + gy)·HH)` lifted by `z·ZH`; cells
  paint back-to-front by `x + y` with south-east and south-west skirt faces,
  so the map's real Z-heights finally *look* like height. Painted walls
  stand as blocks; tokens are billboards with ground shadows; every diamond
  carries `data-at` so the DOM says which tile is which. One inverse
  function (`squareAtIso`, trying taller candidates first, exactly as
  cover works visually) makes click-to-move, drags, hover, the ruler and
  targeting work verbatim. Arming a brush snaps back to the flat map -
  painting a square wants a square - and print always uses the flat map.

  The first click through the new camera landed four squares off: the
  inverse had forgotten the viewBox's raised y-origin. The component test
  computes its click point from the rendered polygon itself, which is what
  caught it.

---

## 18. Playing the genre

What else FFT and X-COM have to teach, beyond the look. Considered and left
out on purpose: facing/back-attacks and charge-time casting (not 5e rules),
overwatch as a mechanic (5e's Ready action is a table ruling), sound (no
audio identity yet), pod activation (needs fog of war, deferred at the time).

- `[x]` **18.1 The shot HUD.** X-COM's percentage: while an attack is aimed,
  every live target gets a chip - name, hit chance (each strike's bonus
  against their AC, half cover's +2 folded in exactly as `resolveAim`
  charges it), hit-weighted expected damage from the dice's true averages
  (`expectedTotal` joined the dice engine), "cover" and "no sight" tags.
  Clicking a chip is clicking the token: same `resolveAim`. The same
  percentage floats over each targetable token in both cameras, and the
  hint pill names the best shot. Enemies of the attacker sort first;
  friendly fire is offered - the DM is the DM - but dimmed.

- `[x]` **18.2 Combat juice.** Every hit-point change floats off the token -
  "-7" rising red, "+5" rising green, keyed so each change replays once.
  Conditions ride over the head as FFT status bubbles ("POI·STU", full
  names in the tooltip), yielding the space to the aim percentage when both
  want it. Advancing flashes the phase card over the map - "Goblin A's
  turn", "Round 3" on the wrap - decorative only, since the bar announces
  the same turn accessibly. And going down is an event: one collapse
  animation when the class first lands, then the dimmed marker. All of it
  in both cameras; none of it prints.

- `[x]` **18.3 The timeline ticker.** The strip now displays in true queue
  order - whoever is up leads, the rest follow, re-rotating every advance -
  which is what makes it FFT's timeline rather than a list with numbers.
  Each tile carries its clocks ("stunned 1", "conc: Bless"); the round
  boundary stands where the wrap really happens, naming the next round and
  whatever ends there ("Wall of Fire ends", from zones on their last
  round).

- `[x]` **18.4 The debrief.** X-COM's post-mission report as a DM's recap.
  A `tally` on the encounter scores every blow where damage already lands -
  aimed attacks credit the dealer, group saves and the rail's own buttons
  score the taker, the dropping blow marks a kill and a knockdown, and
  overkill pads nobody (capped at the hit points that existed). Cleared
  when a fight starts; `endEncounter` stamps the rounds it ran and writes
  "The fight ends — N rounds." to the log. The panel shows rounds, an MVP
  line, and a row per combatant - dealt, took, downed, dropped - and it
  prints, because it is the recap you read to the table.

- `[x]` **18.5 Two tactical extras.** The Tactical View rotates through
  four facings - FFT's L1/R1 as a Rotate button - via a quarter-turn
  permutation applied before the projection and inverted after the
  pointer's inverse, so every click still lands where it looks (a probe
  clicks the same tile at all four facings and checks where the combatant
  lands). And the shot chips gained rulings the map can see coming, noted
  in green and never applied: **flanked** (the DMG optional rule - an ally
  directly opposite a melee target) and **high ground** (steps of real
  elevation over the target), both also written into the attack's log
  line beside half cover. A flaky delay-turn test was pinned along the
  way: rolled initiative can tie, and a tie made "one place down"
  ambiguous.

---

## 19. The unseen battlefield

- `[x]` **19.1–19.3 Fog of war, activations, stealth.** Deferred earlier,
  then taken up as the last thing combat needed to be feature complete.
  Three legs, one system:

  **Fog of war.** A toggle on the map. What the party sees is the union of
  every standing character's `lineOfSight` - the same rule attacks and
  cover use - and it draws in three states: never seen is dark, seen-before
  is dim (the explored set persists on the encounter, because what the
  party has mapped is a fact about the session), in sight is clear. Both
  cameras. Monsters the party cannot see are not on the picture at all;
  the rail still lists everyone, because the DM is the DM.

  **Activations.** Under fog, a new monster arrives *dormant* - the squad
  game's unactivated pod. The turn pointer passes over dormant monsters
  (`nextTurn` skips them, opening the fight past a dormant top of the
  order), and they wake three ways: the party lays eyes on them ("Goblin A
  is spotted — it activates!"), they take damage from anything, or the DM
  presses Wake. Their strip tiles carry a "dormant" note.

  **Stealth.** A Hide button on every row rolls the real bonus - the stat
  block's Stealth skill or the sheet's, expertise and armor and all - and
  the total lives on the combatant. A hidden monster is off the party's
  picture even in plain line of sight; a hidden character draws dashed and
  translucent. Spotting is passive Perception against the roll, both
  directions, with a clear line required and the log naming who noticed
  whom. Attacking is the reveal, hit or miss, and the shot's log line says
  "unseen attacker — advantage" - noted, never applied. All the fog's
  bookkeeping (memory, activation, spotting) lives in one composed write,
  after two separate effects spent a test run clobbering each other from
  their own closures.



## 20. The right pane is the cockpit

- `[x]` **20 Retire the dock.** The bottom pane earned nothing where it
  stood and belonged folded into the right one. It was - the dock had
  been a thin duplicate since 16.5
  moved the trays into the rail. The bottom bar is gone; its unique pieces
  moved: **End turn / Start the fight** sits at the top of the right pane
  in a slim turn panel ("Round N · X is up"), always reachable, Space and
  N unchanged. The right pane **follows the turn** - advancing selects
  whoever came up, the way a squad game's camera does, and the DM can
  still click anyone else. The character card grew the dock's widgets:
  the movement bar (same title, same numbers), condition quick-add with
  the rounds clock, the concentration chip, and a death-saves roller
  where the bare warning used to be. The monster rail grew its Move
  readout and the same condition quick-add. The **shot chips** float
  along the map's bottom edge now - the aim row sits where the shooting
  is. The active combatant's unit card went entirely: the timeline's
  leading tile is that card. `ActionBar.tsx` deleted.

---

## 21. The command menu

- `[x]` **21 Attack / Cast / Item from the pips.** Clicking Action should
  show what a character can actually take, in the register of the older
  console RPGs - Breath of Fire's box, the Pokémon combat grid.
  An unspent **Action or Bonus pip now opens a JRPG command box**
  under the pips (a spent pip still refunds; Reaction stays a toggle). The
  Action menu is the PHB's own list: **Attack** drills into the sheet's
  attack lines (roll, damage, crit, the `vs…` aim chips), **Cast a spell**
  into the castables whose `castingTime` this pip can pay — Shield, a
  reaction, never appears — with slots, upcast, pact and concentration
  intact, **Use an item** into the consumables, **Dash / Disengage /
  Dodge / Help / Ready** resolve in one click (pip spent, log line
  written), and **Hide** rolls real Stealth into the fog through 19.3's
  machinery *and* spends the action. The Bonus menu carries the off-hand
  swing, bonus-time spells (Misty Step's shelf) and "Just spend it".
  Monsters get the same box standing open in their rail: Attack (routine +
  recharge/per-day gating), Abilities, and the one-click commands. The
  left rail's expansion tray retired — acting has one home, and the
  cockpit already follows the turn. Entries a character has nothing
  behind (Cast for a fighter, an empty pack) simply do not appear.
  Mechanically the menu is the old trays restructured, not a second model:
  every write goes through the same `play.ts` / roster functions. The one
  new rule it forced: a command that touches several stores (a potion is
  the pack + the hit points + the fight's log) reports everything in **one
  composed `onAct` write**, because two `onChange` calls built from one
  snapshot erase each other. Also fixed along the way: the `▸` pointer is
  CSS `content: '▸' / ''`, so screen readers — and Playwright — see
  "Attack", not "▸ Attack".

---

## 22. The battlefield earns its rules

Four defects found in one pass over the battle screen, all landed:

- `[x]` **22.1–22.2 Nobody starts in melee.** Deploy used to dump the
  party and the monsters into room 1 together, row-major.
  `planDeployment` (engine/deploy.ts, pure and deterministic)
  seats the party in room 1 and round-robins the monsters across the
  *other* rooms, farthest first; occupied and unwalkable squares are
  skipped, surplus bodies stay unplaced rather than stacking, and the
  degenerate maps (one room, a blank grid) fall back to opposite corners.
- `[x]` **22.3 The Dungeons tab.** Play is for playing, so building moved
  off it: the map builder (seed, size, rooms, terrain brushes,
  Raise/Lower) is now a Create-mode **Dungeons** tab that edits a local
  draft and saves named places into its own drawer
  (`dnd-forge:dungeons:v1`, mirroring the encounter drawer). The battle
  panel became **The battlefield**: a Load-a-dungeon picker that copies a
  saved map onto the live encounter in one write — tokens come off,
  because the rooms they stood in are gone — plus the play-time controls
  (deploy, fog, sight lines, tactical camera). Cold start unchanged:
  first light, medium, eight rooms.
- `[x]` **22.4 The character cockpit stands its menu.** Characters should
  read in the right pane the way monsters already did: the command box is
  open the moment the fight selects somebody, like the monster rail's;
  acting collapses the submenu back to the grid; pips still switch slots
  and refund. (The card already carries the character statblock: vitals,
  saves, attack lines.)
- `[x]` **22.5 Movement is deliberate.** Three rules that were not being
  kept: movement should be spent deliberately rather than by any stray
  click, it must not exceed the turn's budget in initiative, and out of
  combat it is free. So in initiative, walking is FFT's explicit **Move**
  command (both menus;
  spends no pip — movement is its own budget). Armed, the glow lights
  and clicks walk, priced by the real path, the amber tier taking the
  Dash, beyond it refused; Escape or the turn ending puts the walk down;
  only the active combatant walks. Drags follow the same law — the old
  teleport-anywhere drag override is gone (it was exactly how "clicking
  to attack a monster moved it instead"), drags are dead while an attack
  is aimed, and setup drags are free for characters too, who used to be
  billed for them. Out of combat, click-to-move stays free.
- `[x]` **22.6 Click the goblin, hit the goblin.** During a character's
  turn, clicking a living, seen monster's token IS the attack — the
  main-hand routine against its real AC through the same dice, cover,
  fog and reveal rules as the aim chips, action spent in the same write.
  A spent pip makes the next click a plain selection; the rail and the
  timeline only ever select. `resolveAim` split into `resolveStrikes` so
  the token click and the aim chips share one attack path.

---

## 23. The battlefield enforces the rules

Four more found in the same pass: hazards did not hurt anyone, pathing
ignored them, the attack click still wore the grab-hand, and items were
narration rather than mechanics.

- `[x]` **23.1 Zones learn what they do.** A zone carries an effect as
  data - damage dice and type, the save (half on a pass), when it bites
  (entry / end of turn), whether it blocks (Wall of Force), whether its
  ground is difficult (Web). `ZONE_PRESETS` ships the SRD shelf: Wall of
  Fire, Wall of Force, Blade Barrier, Cloudkill, Moonbeam, Spike Growth,
  Web, Grease. Changing spell IS changing fields - line to sphere, fire
  to force - which was the ask.
- `[x]` **23.2 The ground bites, and routes avoid it.** The pathfinder
  eats the zones as overlays; a walk prefers the route that stays out of
  the fire whenever the budget allows (the glow tiles and the ruler price
  that route), and only when nothing but the burning shortcut fits does
  it go through - at which point the zone bites for real: dice rolled,
  the walker's real save bonus against the DC, hit points off the store
  that owns them, all in the movement's own write. Ending a turn in a
  hazard bites through End turn the same way. Walking out of a living
  enemy's reach logs the opportunity-attack ruling (noted, never
  applied - the register cover and flanking use).
- `[x]` **23.3 The cursor says attack.** An enemy token a click would
  attack wears a crosshair on both cameras; everything else keeps the
  grab-hand. Retires when the action is spent or a tool is armed.
- `[x]` **23.4 Items act.** Acid, alchemist's fire and holy water carry
  structured `thrown` data and throw through the aim flow (DEX to hit,
  improvised, flask spent either way). Spell scrolls cast what is written
  on them - the carried detail names the spell, the log carries the
  scroll level's DC. Potions already rolled their healing.

**Rules coverage, on the record** - which general rules this app
enforces, and which it leaves to the table: *enforced in code* - action
economy,
movement budgets and Dash, real path costs and difficult ground, cover
(+2 AC applied), zone damage and saves, concentration DCs announced,
death saves, conditions with clocks, stealth/hide, fog and activation,
opportunity-attack provocation (logged). *Noted, never applied* -
flanking, high ground, the OA swing itself (the reaction is the
defender's choice). *Deliberately absent* - grappling/shoving arithmetic,
mounted combat, readied-action triggers, spell components: rulings richer
than a grid should model, logged by hand where they come up.

---

## 24. The ceiling comes off storage

Everything this app remembers — a roster, a bestiary, prepped fights,
saved dungeons, a workspace layout, a theme — shared one `localStorage`
budget of about five megabytes for the whole origin. That is not a lot,
and it had already started shaping the code rather than the design:
`engine/portrait.ts` existed largely to buy headroom back a kilobyte at
a time.

- `[x]` **24.1 `persist.ts`: a synchronous surface over an asynchronous
  store.** IndexedDB has no such ceiling and an API this app cannot use
  directly — a hundred `useState(loadRoster)` call sites want an answer
  *now*, not a promise. So the asynchrony lives in exactly one file.
  `hydrate()` runs once before the first render and fills an in-memory
  cache; `read`/`write`/`remove` are synchronous against that cache, and
  writes echo to the store in the background, coalesced, so a
  save-per-render burst costs one transaction rather than thirty.
- `[x]` **24.2 The six stores repointed.** `storage`, `bestiary`,
  `encounters`, `dungeons`, `theme` and `workspace` swap
  `localStorage.getItem/setItem/removeItem` for `read/write/remove`.
  **No signature changed and no call site moved** — that is the whole
  point of 24.1.
- `[x]` **24.3 Boot hydration, and a store behind an adapter.** One
  `await hydrate()` in `main.tsx` before the tree is built, plus a flush
  on `pagehide` and on the tab being hidden, because a coalesced write
  must not be lost to a closing page. The store sits behind an adapter
  for two reasons: a browser that refuses IndexedDB falls back to
  `localStorage` and then to memory rather than failing to start, and
  jsdom has no IndexedDB at all, so the tests get the `localStorage`
  adapter — which answers synchronously, so a test seeding a fixture
  mid-run is seen at once, exactly as before. **All 1358 tests passed
  with no test file touched**, which is what makes the swap provably
  transparent rather than merely claimed to be.

  Old data is carried across once, keyed on a marker so it cannot happen
  twice, and only for keys the new store lacks so it can never overwrite
  something newer. `localStorage` is deliberately left intact: a version
  rolled back finds every character where it left them.
- `[x]` **24.4 The portrait stops being rationed.** The payoff, landed
  separately so the migration itself stands on "behaviour is identical".
  256 square at 40 kB with a six-step quality search grinding a
  photograph down to 0.3 was what five shared megabytes could afford,
  and it showed. Now 512 square — sharp on a tablet at 2x — with half a
  megabyte to fit in, and the search shrinks to two steps because at
  that ceiling 0.85 fits an ordinary photograph outright. Sized against
  the worst case rather than by eye: 1600×1200 of pure random noise, as
  badly as JPEG can possibly do, encodes to 146 kB. Still refused rather
  than stored above the cap — a store with more room is not a store with
  no limit — and the encoder got the tests it never had.

**What this unblocks.** Not a feature yet, but the reason several were
never proposed: the bestiary holding full stat blocks rather than SRD
indices, a dungeon library measured in dozens rather than a handful,
map thumbnails, an encounter log kept across sessions. Each of those was
a few hundred kilobytes against a budget that could not spare them.

---

## 25. The enemy phase

Every monster turn was hand-driven: pick the token, arm Move, click a
square, open the menu, pick the attack, click the target. Fine for one
ogre, miserable for eight goblins, and the biggest single reason the
battle screen was slower to run than a sheet of paper.

- `[x]` **25.1 Reach and range become data.** The stat blocks state them
  only in prose — "reach 5 ft.", "range 80/320 ft." — which was fine
  while a human read the line and decided where to stand. Three patterns
  cover all 514 attacks across the 334 stat blocks, and the test asserts
  that count rather than spot-checking, because the failure mode is a
  data refresh rewording the sentence and silently making every monster
  melee-only. Eleven attacks carry both a reach and a range; a bandit
  captain with a dagger really can either stab or throw.

  It found something on its first run: nine swarms say *"reach 0 ft.,
  one creature in the swarm's space"*, which is true to the book and
  unusable on a grid where nobody shares a square. The parser still
  reports the 0 — a parser should say what the page says — and the reach
  helpers floor it at adjacent, with the ruling written beside the
  functions whose job is deciding where to stand.
- `[x]` **25.2 A routine leaves the menu.** The `Strike` shape and the
  Multiattack expansion move to `engine/strikes.ts`, so a planner can
  ask what a dragon does in a round without rendering a tray to find
  out. `routineOptions` replaced a first-action-wins helper that would
  have marched every archer into melee: each single attack is its own
  option, while a Multiattack stays one indivisible round priced by its
  *shortest* reach.
- `[x]` **25.3 The turn gets decided.** `engine/enemyTurn.ts` returns a
  plan and never acts. Attack if you can, taking a kill over more damage
  and more damage over a shorter walk; never Dash into an attack, since
  the Dash **is** the action; otherwise close on the nearest enemy with
  everything you have; otherwise hold, and say so. Pure, deterministic,
  and ignorant of the roster — it takes a flat view of the field and the
  caller's own price function, so a plan can never route through a wall
  of fire the DM's own click would have gone around. It rolls no dice:
  the odds it weighs are `hitChance` against real AC and averages off
  the same notation, so the plan does not change when you look twice.

  Writing its tests found a hole: the walk maps the *ground*, not the
  *crowd*, so the planner would plan to stand on top of the fighter —
  and `moveSelected` would then refuse to run its own plan. It subtracts
  occupied squares now, the fallen included.
- `[x]` **25.4 The cockpit proposes; the DM runs it.** Move and attack
  grew cores that take a roster and return one, landed first with **no
  test edits at all** — 88 TableTab tests passing untouched was the
  whole claim. That is what lets a walk and a routine reach the store in
  one write; two would each build from the same render's roster and the
  second would discard the first, so the monster would swing from the
  square it had already left. It is also what makes §27 cheap.

  On top of that, a panel: the turn it would take, the reasoning that
  produced it, and **Run it**. The command menu stays underneath rather
  than being replaced, because a proposal you cannot overrule is an
  instruction, and the DM is the one who knows these goblins are
  cowards.

**What the probe caught that no unit test would have.** In jsdom every
test passed. On a real generated dungeon the goblin announced *"can
reach nobody and get no closer"* and stood still for the whole fight: it
was against the west wall of its room with the party 200 ft west, and
"closer" was measured in straight lines, so every square in the room
scored the same and none looked like progress. The door was the way out
and only a walk knows that.

This is the exact trap `path.ts` documents in its own header — the first
reach wash was a Chebyshev radius that offered a square five feet away
on the far side of a wall — reintroduced one layer up. `walkMap` now
takes several sources at once, seeded at zero, so one sweep from the
whole party gives every square its true walking distance to the nearest
character. A square the party cannot reach at all is *infinitely* far
rather than zero, so a sealed alcove never looks like the ideal place to
stand.

---

## 26. The battlefield borrows from the video games

Asked for by name: the parts of Baldur's Gate 3 and Disgaea that a grid
can actually hold. All four turned out to be small, because §23 and
§12.3 had already built the machinery and then not used it.

- `[x]` **26.1 Surfaces react to each other.** §23 made a wall of fire
  different from a drawing of one, and still left every zone alone in
  the world: fireball a slick of grease and the grease sat there being
  slippery. A zone effect gains a **material** — separate from its label,
  because "Wall of Fire", "Flaming Sphere" and a patch of ignited grease
  are three labels and one material. `surfaces.ts` holds the table: fire
  catches grease, fire flashes a web away, water douses fire, ice freezes
  water, lightning conducts through a pool, acid dissolves web. Each row
  is something a table would rule the same way unasked — the bar is
  remembering the obvious, not inventing house rules — and the ones
  needing a ruling (what a fireball does to a cloudkill) are absent on
  purpose.

  A reaction may **consume**, **become**, or **jolt** — bite everyone
  standing in it once, which is what makes lightning-into-water
  frightening rather than decorative. A jolt is shaped like the surface
  it happened to, not the thing that set it off: lightning into a lake
  catches everyone in the lake, not everyone in the bolt.
- `[x]` **26.2 Shove, and the drop.** §23 filed shoving under
  "deliberately absent" beside grappling. That was right about grappling
  and wrong here, for a reason the register missed: **this map has
  height**, and had never once let it change a number. A ledge nobody
  can be pushed off is scenery. Shoving also fits in a function — one
  contested roll, two outcomes, no ongoing state — where grappling does
  not, and grappling stays absent.

  **Shove** pushes five feet; **Trip** puts them down. Two entries rather
  than a submenu, because the SRD leaves the choice to the shover. The
  defender resists with their better skill rather than being asked, since
  the choice has one right answer. A tie goes to the defender. Both cost
  the action pip whether or not the contest was won — a shove replaces
  one attack of the Attack action, so the *attempt* is what is spent —
  while a mis-click across the room costs nothing.

  Pushed into a wall is a shove that went nowhere; pushed off a ledge is
  1d6 per ten feet, capped at 20d6, landing prone. `terrain.ts` keeps
  height in abstract steps on purpose, so this reads a step as ten feet
  and **prints the feet in the log** — a table calling it five can halve
  the dice, and can only know to if it can see the number.
- `[x]` **26.3 High ground applies, if you say so.** Computed since
  §12.4 and only ever announced. Now an opt-in +2, **off by default and
  staying off**: the app's claim is that it plays the rules as written,
  and a number quietly disagreeing with the book would make every other
  number harder to trust. The log distinguishes the two either way —
  "(high ground +2)" against "(high ground)" — so a fight can be read
  back and understood whichever way the switch was set, and the shot HUD
  gets the same bonus the dice will.

  Two rather than advantage, because advantage stacks strangely with
  everything else the map grants. Stored rules are read field by field,
  so a file from a version that knows about flanking cannot switch
  flanking on in a version with no idea how to apply it.
- `[x]` **26.4 Ground that helps, and ground that picks a side.** The
  zone model could say "this hurts" and nothing else, which left every
  beneficial area a drawing with a label — and left Spirit Guardians,
  which burns your enemies and spares your cleric, impossible to state
  correctly. `affects` names a side, gating damage, difficult ground and
  grants together. `grants` is the other sign: numbers where the app can
  apply them, a note where it cannot — a fog cloud's obscurement is a
  paragraph of rulings, a paladin's aura is plainly +3 to saves.

  The grants land in five places, which is what "applied" means: the
  target's AC, the roll made from inside, a zone's own save, the room
  save, and healing at the end of a turn. The difficult overlay became
  per-walker, so Spirit Guardians is deep going for the goblins and open
  floor for the party.

**Two rulings made on purpose.** Overlapping auras stack — the SRD's
non-stacking rule is about the same spell cast twice, and a table that
disagrees can move a token five feet, which is what a map is for. And
healing ground does not raise the dropped: that is a ruling, and a loud
one, not a side effect of standing somewhere.

**What the tests found.** A test-isolation defect the house-rules switch
introduces by existing: it outlives a render, so it outlives a test, and
one test turning high ground on had the next toggling it back off.
Cleared per test now.

---

## 27. The numbers become true

Asked for as a question — *what else is not wired up?* — and answered from
the code rather than from memory. The audit found one pattern repeated
four times: **data the app records faithfully and never reads**. It is the
same defect §26.2 fixed for elevation, and it was quietly wrong on most
attacks against half the bestiary.

- `[x]` **27.1 Damage lands through defences.** 165 of the 334 stat blocks
  carry `resist`, `immune` and `vulnerable`, and nothing had ever consulted
  them: a fire elemental took full damage from a wall of fire, a skeleton
  full damage from a club. Every strike carried a damage *type* that was
  only ever printed.

  All nineteen entries the bestiary uses are read. Twelve are a bare type.
  Seven carry a prose qualifier, split honestly: the ones the app **can**
  settle (whether the swing was magical — an answer `attacks.ts` had been
  computing and throwing away), and the ones it **cannot** — silvered,
  adamantine, alignment, from-spells — which are announced with the
  qualifier named rather than guessed. Unrecognised prose makes the entry
  advisory, so a data refresh degrades to *"tell the DM"* rather than to a
  wrong number.

  Applied per damage part, since a strike dealing slashing *and* fire
  against something resisting only fire has to split. Immunity beats
  everything; resistance and vulnerability **cancel**, which is a ruling —
  the SRD does not say, and cancelling is the only answer that does not
  depend on which is applied first.
- `[x]` **27.2 Conditions change the dice.** Every read of a condition
  either set one or rendered a list. Not one changed a roll — while the log
  had announced *"unseen attacker — advantage"* since §19.3 over a die
  rolled straight. Stating an advantage you do not grant is worse than
  never mentioning it, and §26.2 had made it worse by creating **prone**
  that nothing read.

  `engine/advantage.ts` gathers every circumstance and folds them with the
  one rule 5e has: they do not stack, any number of each cancels, one alone
  decides. Prone cuts both ways — advantage in reach, *disadvantage*
  beyond — which is what makes going down a choice rather than a
  downgrade. Condition immunities read too: a zombie cannot be poisoned.

  **Frightened was skipped here and then fixed**, which is the more
  interesting half. The rule turns on whether the source of the fear is in
  sight, and nothing recorded what frightened you — so conditions grew
  `conditionSources`. Both halves now work: advantage costs only while the
  source can be seen, and a frightened creature cannot willingly move
  *closer* to it, refused as a destination. Both remain refusable — no
  source, or no sight model, and the rule stays quiet.
- `[x]` **27.3 The trackers that were only ever watched.** Ammunition
  (§2.3 gave the sheet a quiver nothing came out of), the concentration
  save (the DC printed correctly since §2.8, never rolled), and death saves
  (`applyDeathSaveRoll` had the whole rule since §7 and nothing called it).
  Exhaustion and charmed came free — three levels of exhaustion cost
  advantage and two halve the speed; a charmed creature will not attack its
  charmer, using the source field frightened needed.

**What the checking found.** Two of my own mistakes, both worth naming
because both looked at first like app defects. A test asserted a skeleton
*resists* bludgeoning while its own comment said *vulnerable* — the code
was right. And the browser probe swung a greatsword at a skeleton and
reported no defence note as a failure: a skeleton is vulnerable to
bludgeoning and indifferent to slashing, so printing nothing was exactly
correct. The probe now attacks a grick, which resists all three physical
types from nonmagical weapons — the fighter's greatsword is mundane, so
the ruling is wholly decidable and the log reads *"hit, 13 → 6 slashing"*
followed by *"Grick — resists slashing."*

**Rules coverage, restated.** The register in §23 is out of date, and this
replaces it.

*Enforced in code* — action economy; movement budgets, Dash and difficult
ground; real path costs; cover; **damage type against resistance, immunity
and vulnerability**; **advantage and disadvantage, and the conditions that
grant them**; **condition immunities**; zone damage, saves and grants;
**concentration saves, rolled**; **death saves, rolled**; **ammunition**;
**exhaustion on attacks and speed**; **shove, falling and prone**; surface
reactions; stealth, fog and activation; monster recharge and per-day uses;
**opportunity attacks, taken** (§28); **Disengage and Dodge** (§28).

*Noted, never applied* — flanking (the obvious next row on §26.3's switch)
and the resistance qualifiers only a table can settle. The
opportunity-attack swing left this list in §28, along with Disengage and
Dodge.

*Deliberately absent* — grappling, mounted combat, readied-action triggers,
spell components. Frightened left this list in §27.2; shoving left it in
§26.2. The list is meant to shrink.

*Known gap* — **characters have no damage resistances at all**. The build
model's `Defenses` is AC and hit points, so a raging Barbarian or a
Dragonborn's ancestry is still applied by hand. Named in `defencesOf` so it
is visible rather than implied.

---

## 28. Reactions become real

§22.5 made movement deliberate and, in the same breath, wrote the note this
section replaces: *"leaves the reach of X — opportunity attack, unless they
Disengaged."* That sentence has been printed on every walk out of melee
since, and no die has ever followed it. It was the last large entry in the
noted-never-applied register and the most consequential one left, because
the whole reason to spend an action on Disengage is a swing that never
happened.

The dice were never what was missing — `strikesInto` has resolved a full
exchange since §13.2. Three pieces of **state** were.

- `[x]` **Disengage as a fact.** Both trays offered it and both only wrote a
  line in the log, so the app could not tell the creature that spent its
  action from the one that did not. Dodge came with it for the same reason
  and the same price: it is per-turn state that comes back when your turn
  *starts*, which is exactly when a dodge stops protecting you. Dodging now
  costs the attacker advantage through the same circumstance fold everything
  else goes through, and lapses the moment the dodger is stunned or paralysed
  — the SRD suspends it when you are incapacitated.
- `[x]` **A reaction the monsters own.** Characters have had a reaction pip
  since §7; the monster side of the table had legendary actions, recharge
  dice and movement and no reaction at all. It resets when the creature's own
  turn begins — the direction tables get wrong most often is the other one,
  handing it back at the end of the turn it was spent on.
- `[x]` **Reach in feet.** The old note fired on Chebyshev adjacency, so an
  ogre watched people walk out of its ten-foot reach unremarked. Characters
  had no reach at all: the monsters have carried it since §25.1 and nothing
  had ever asked the sheet.

**The swing is one melee attack, never a Multiattack.** A dragon reacting
with its whole routine would be the largest damage bug this app could ship,
so `opportunityStrike` returns at most one and the tests assert that across
all 334 stat blocks. It resolves *before* the step, which is when the rule
fires and the only order in which cover, prone and the ground read from the
square the mover is still standing on. Dropped on the way out means the step
does not happen. A walk past three guards is three swings and one write.

Hiding still works: a rogue who vanished leaves unremarked, which is what
the Hide action buys.

---

## 29. The fight pays out

The two halves of this app had never spoken after a fight. Hit points carry,
because the battle screen writes the same `PlayState` the sheet reads — and
then the fight ends and *nothing else does*. Every stat block has carried an
`xp` since the bestiary landed and the only thing that ever read it was the
forecast, to say how hard a fight looked *before* it happened. Afterwards the
number was thrown away and somebody did the arithmetic on paper.

The debrief now has two buttons, because after a fight a party does exactly
two things: they take what they earned, and they sit down.

- `[x]` **Award.** Every monster at nought hit points, grouped by stat block
  name so "Goblin A" and "Goblin B" read as two goblins, summed, and split
  between everyone who was **in** the fight rather than everyone still
  standing — a party that gained by losing someone would be a rule nobody
  plays. Rounded down with the remainder going nowhere, because distributing
  it would mean picking a character to favour over a rounding error. The
  encounter records what it paid, so the button becomes a receipt: one that
  can be pressed twice and pays twice is a bug.
- `[x]` **Rest.** The sheet has had both rest buttons since §7 and pressing
  them five times over is the DM's least favourite part of the evening. The
  party rests together, each character's short-recharge keys and hit dice
  derived exactly as their own sheet derives them, all in one composed write.

**Two things this deliberately does not do.** It does not say when you level
up: the XP-per-level table is not in the data this project ships, and a
threshold nothing here can source has no business on a character sheet —
milestone tables ignore it anyway. And it does not roll treasure, for the
same reason the encounter-difficulty thresholds stay out.

---

## 30. The campaign layer

Everything else in this app is about one afternoon. A roster of everyone you
have ever built, a drawer of prepped encounters, a library of dungeons, and a
battle screen that runs exactly one fight and forgets it when the next
starts. §29 made the fight pay out; this is where the payments accumulate.

A campaign is two things and no more, because a campaign manager that tries
to be a wiki ends up being neither.

- `[x]` **A party.** Which of the roster's characters are the ones playing.
  The roster is everybody — your friend's Paladin, the Barbarian you were
  trying out, three drafts of the same Wizard. The party is who is at the
  table on Saturday, and the battle screen seats them in one press. A
  character deleted between sessions is *named* rather than silently dropped:
  tidying the roster must not quietly rewrite who was playing.
- `[x]` **A chronicle.** One line per fight, written when the debrief pays
  out — what was beaten, how long it took, who did the most, what it was
  worth. Written by the app rather than by the DM, because the DM is busy,
  and a record nobody has to keep is the only kind that gets kept. Capped at
  fifty, because `localStorage` is not a database.

Its own store key, for the reason the bestiary and the dungeons have theirs:
a campaign outlives any particular character, and clearing the roster must
not clear the record of what the party did. The Campaign tab **reads** the
roster and never writes it — choosing who is at the table is not editing a
character, and the one thing this page must not be able to do is lose one.

A session with no campaign behaves exactly as it did before, which is the
test of whether an added layer is optional or merely claims to be.

**What the probe found.** Two of my own mistakes again, both mine and neither
the app's. The probe clicked at coordinates measured while the map was still
below the fold — the §26 stale-geometry trap, in a new costume — and then
picked a destination by arithmetic (*"four squares east"*) in a dungeon that
has walls there. Both fixed by asking the app instead of guessing: scroll,
re-measure, and walk to the farthest tile the map has actually lit. A third:
the probe dropped the goblin with the −5 button and then wondered why the
debrief was empty. Manual hit-point edits write no tally, correctly — so the
fighter now swings for real, one attack per turn because that is the rule
the app enforces.

---

## 31. The UI makeover: a game rather than a page

Asked for in a sentence — *"the UI should feel more like a full screen game
with buttons and menus to pull up characters, monsters, terrain"* — and the
defect behind it was measurable rather than a matter of taste. On a 1360×900
screen the battlefield began **460 pixels down a scrolling page** and ran off
the bottom. A DM had to scroll to see their own map, and every panel opened
underneath pushed it further away. Thirty sections of building a very good
*document*.

- `[x]` **31.1 The frame.** The shell is a screen: exactly the height of the
  window, chrome pinned at the top, one region below it that fills whatever is
  left, and nothing scrolls but the insides of things. A tab that really is a
  document — the Builder, the character sheet — scrolls within the frame and
  puts its 1240px measure back on, because 74 characters of prose on a 27-inch
  monitor is not an improvement.

  `100dvh` rather than `100vh`: on a tablet with a retracting browser bar those
  differ by the height of the bar, and the version that guesses wrong hides a
  command bar behind chrome. Paper has no viewport, so print undoes all of it.
- `[x]` **31.2 The title screen.** The app opens on a menu that says what it
  knows: which character is loaded, which campaign is being played, and whether
  a fight is still on the table. That last one is why it earns its place — a DM
  who closed the laptop mid-combat gets **"Resume the fight — Round 1 is still
  on the table"**, where before they got a Builder and a hunt.

  No animation and no splash. This is in front of somebody every launch, and a
  screen you sit through is one you resent by the fourth time. A share link
  still lands straight on the character: a menu in front of it is a question
  the link already answered.
- `[x]` **31.3 The battle HUD.** The map *is* the screen. Initiative along the
  top, the cockpit docked right, the last three log lines bottom-left, and
  seven command-bar buttons — Party, Bestiary, Field, Areas, Order, Prep,
  After — that slide over the map and go away. One at a time, Escape closes.

  The cockpit **reserves** its width rather than floating, which is a
  correction to the first draft: deploy puts monsters in the rooms farthest
  from the party, those are often on the right, and the probe caught a goblin
  standing behind the cockpit where nobody could click it. A drawer may cover
  the map, because a drawer is something you opened on purpose. §32.2
  generalises that reservation into a safe area every docked float shares.
- `[x]` **31.4 The Builder becomes a route.** The five sections were already
  the steps of making a character; the strip above them said so only by their
  order, which is the one thing a row of pills does not communicate. Numbered,
  with Back and Next that name where they go. The last step says everything is
  already saved rather than offering a Finish — nothing is submitted at the
  end, and a Finish button would be a lie about how this app works. Still tabs:
  a returning player editing one thing must not walk past four screens.
- `[x]` **31.5 Chrome.** Three moves and no more. The cut corner the mode
  switch has had since §12.1 goes onto everything you press to go somewhere; a
  bevel — a hairline of light on top, a shadow under, reversed when held — which
  is the whole trick behind why a game's buttons look pressable; and weight on
  the selected tab, because an underline is a table of contents and a fill is a
  menu.

**The Workspace is deleted.** §10.1 built it as a shell "so a second surface
can adopt it if it earns it, rather than because every screen should look the
same". No second surface ever did, and the one that had it moved on — a battle
screen with a resizable left rail is a tool for reading about a fight rather
than for running one. Unused code carrying its own tests reads as
load-bearing, so it goes.

**A correction to §§27, 29 and 30.** Every "verified in both themes" claim
before this section was false. The probes set the theme by writing
`localStorage`, but the theme goes through `persist`, which is IndexedDB-backed
in a browser — so that key was never read and both runs rendered parchment. The
behaviour those probes checked was real; the theme coverage was not. They click
the toggle now.

**What the test migration found.** The 122 battle-screen tests open the drawer
a control lives in, which is what a DM does. One of them caught the trap that
creates: a node captured before a drawer closes is detached by the time it is
clicked, and clicking a detached node does nothing at all.

---

## 32. The HUD floats inside the game window

The ask, in the user's words: *"more of the UI should be within the map — think
about how the game is full screen. There's elements floating within the game
window, not alongside of. I still want pop-out windows, but a lot of it should
be HUDs or elements within the main window."*

§31 got the map to full screen and then stopped half way. The initiative
timeline and the command bar were still chrome *around* the stage, so the
battle screen was three stacked regions with a map in the middle one. This
section removes the middle.

- `[x]` **32.1 A click lands on the square you clicked.** Both maps mapped a
  click by dividing straight through the SVG element's box, which is only
  correct while the drawing fills its element. §31.3 made it stop: it styled
  the map `height: 100%` to fill the stage, and an SVG with a viewBox
  letterboxes inside a box of a different aspect. On the real 988×662 stage
  against a 672×504 grid there were 52px bars either side and a click at the
  drawing's right edge resolved **six squares out**.

  Token clicks were unaffected — a token is its own element with its own
  correct box — which is why every browser probe missed it for a whole section,
  and why the regression test clicks empty ground. `engine/letterbox.ts` does
  the maths, taking the viewBox origin as an argument because the isometric
  map's is not zero. The CSS also stops stretching the map, so in practice
  there is no letterbox at all now; the fix still belongs in the maths, because
  a stylesheet can be changed by anybody at any time.
- `[x]` **32.2 One stage.** `.btl-stage` is the whole window, with the
  timeline, cockpit, log tail, drawers and command bar positioned inside it
  over a board that runs edge to edge.

  Floating over a battle map is only survivable with a rule about who may cover
  what, so the stage owns four numbers — `--hud-top/right/bottom/left` — and the
  drawing is inset by them. **Docked floats reserve; drawers do not**, because
  you opened a drawer and can close it, and neither does the log tail, which
  takes no clicks.

  Fitting the drawing to that rectangle took three attempts, and the two failed
  ones are worth naming. `width: 100%` with `max-height` clamps one axis and
  leaves the box the wrong shape. The photograph recipe — `auto` plus both
  maxima — fits but never grows, leaving a 672-wide map in a 1004-wide space.
  Contain is a *comparison* of two axes, so the rule has to see both: the map
  publishes its shape as `--map-ratio` and the stage sizes it in container
  query units.
- `[x]` **32.3 One floating frame.** The cockpit and the drawer were two frames
  doing nearly the same job with their own header markup, and neither could be
  collapsed, dragged or torn off. `HudPanel` is the one frame; the two class
  names now say only where each sits.

  Collapsing and dragging are the same bargain with the safe area: a panel
  docked to a known edge may honestly reserve a rectangle, and one collapsed to
  its title bar or dragged somewhere of the DM's choosing may not — so both hand
  the space back, and Dock puts it on its edge again. Collapsing hides the body
  with CSS rather than unmounting it, so a half-typed damage number survives
  somebody glancing at the board.

  The turn moves out of the cockpit into its own float. It was a header on it,
  which meant whose turn it is and End turn vanished with any panel somebody
  shut — the two things on this screen that must never be more than a glance
  away.

  **A bug found by extracting the drag.** `useDragPosition` comes from
  `PopOut`'s in-page fallback, where the listeners were attached in an effect
  guarded on a ref — and pressing a title bar sets a ref without causing a
  render, so nothing was ever listening and the panel did not move at all. It
  shipped unnoticed because that panel only appears under 900px wide.
- `[x]` **32.4 More than one window, and a key that shows the board.** Pop-out
  has been one at a time since the mini window was built, on the argument that
  six floating panels recreated the problem the tracker solved. That does not
  survive this section: the reason to tear a panel off is precisely that it
  should not be on this screen — a second monitor, or a sheet beside the stat
  block it is fighting.

  Holding **H** fades every float to 15% and stops it taking clicks. Held
  rather than toggled, because a HUD you can switch off is one somebody leaves
  off and then wonders where the controls went. It deliberately does not
  release the safe area: resizing the drawing under a held key would move every
  square out from under the pointer.

**What the probe measures.** That the element box equals the drawing box (zero
skew against the viewBox), that no deployed token's centre falls inside a
docked float, that collapsing and dragging both widen the board and Dock
restores it, that two real browser windows coexist, and that the fade lands
without the drawing changing size. Both themes at 1360, clicking the theme
toggle.

**Deferred: §34, the camera.** Pan and zoom means a `{x, y, scale}` driving the
viewBox, and it must rewrite `squareAt` in lockstep in *both* maps — the
isometric one hardcodes its own origin. That coupling is the riskiest edit on
this screen, which is exactly why it is not in the same section as the HUD.

---

## 33. The Builder becomes one window

The ask, verbatim: *"The actual builder, like the suggestions and stuff. It
should be just one big wizard to walk you through it as opposed to having to go
to a different tab for the lineages and then another tab for the abilities or
feats. It should be just one big window with your character, what your race,
you know, class, all that, and like suggestions and the scaling."*

### The constraint, and the rule that answered it

`BuilderTab`'s own header recorded that this had been tried and abandoned:
seventeen panels open at once ran **five screens tall**, and the pain named was
scrolling past sixteen ranked cards to reach the feats. §31.4 split it into one
section at a time. Four more panels arrived afterwards with nothing to stop
them, so a naive merge would have been worse than the design already rejected.

What made it fit was a rule rather than a diet:

> Your character is always visible. The catalogue of things you have **not**
> taken is not. Exactly one catalogue is open at a time.

That bounds the page at the closed rows plus one picker, so the eighteenth
panel costs about fifty pixels instead of a screen. `ChoiceRow` has no
uncontrolled mode for exactly that reason - per-row state would be more
convenient and would quietly delete the bound.

- `[x]` **33.1 Progression leaves the Optimizer**, and its pure half goes to
  `engine/plan.ts` - which is what let it be tested. It had none, and it does
  two things at once: raises class levels *and* spends ASI slots. Twelve tests,
  including the invariant that every choice applied is paid for by a slot the
  build now owns.
- `[x]` **33.2 `ChoiceRow`**, proven on Class options alone: most of a screen
  down to two rows. What you have taken stays on the closed row as removable
  chips, because class options already ruled that *"an option you cannot see is
  an option you cannot remove"*.
- `[x]` **33.3 The other eight catalogues.** Chips are hidden while a row is
  open, since the catalogue shows the same removals - which makes one thing a
  contract: an open body **must** show what is taken. Omitting `taken` entirely
  differs from passing an empty array; the feats row is the one whose taken
  list is already on screen above it.
- `[x]` **33.4 The merge.** Every section renders at once as a real
  `<section id>`, with a sticky rail of anchors. §31.4's Back/Next route is
  deleted and so are the six tests that walked it.
- `[x]` **33.5 The readouts get pinned**, with **Next choices** naming what is
  left and where rather than counting it. Damage per round and the progression
  plan stop being contextual: a feat and an ability score move damage as much
  as a weapon does.
- `[x]` **33.6 Damage against level**, which is what scaling means. The whole
  build is re-derived at each level rather than extrapolated, so the Fighter's
  step at five is Extra Attack and not a trend line. Two judgements stated out
  loud: one armor class for the whole curve, and feats trimmed to the slots
  that level had reached.
- `[x]` **33.7 The rail follows the page.** `section` state did not die with
  the tabs - its input changed from a click to scroll position. Guarded on
  `typeof IntersectionObserver`, which jsdom does not implement.
- `[x]` **33.8 The Optimizer is retired.** The feat browser is deleted outright
  - it ranked the same feats through the same card as the panel where you take
  one. `RacesTab` survives as its own tab and is deliberately not inlined:
  picking a pairing resets scores, defenses, feats and weapons, and a button
  that wipes the build does not belong in the page where you are editing it.

**The honest number.** The plan estimated 2.2 screens with every catalogue
closed. Measured at 1360 it is **3.34**, and the estimate was optimistic about
one panel: `Character` is 754px by itself and is deliberately the one thing
never compacted. What the design actually claims is that the page does not grow
with the *number* of catalogues, and that holds - nine cost nine rows, and the
closed page sits well under the tallest single open picker. `run33.mjs` asserts
both, at the measured thresholds rather than the hoped-for ones.

### Four bugs found while building it, three of them older than this section

- **`.title` collided with every ranked suggestion card.** §31.2 named the
  title screen's root `.title`, which also matches the `<span class="title">`
  inside every feat, class-option and spell card. They inherited
  `height: 100dvh; display: grid`, so each **collapsed** card rendered 926px
  tall - a near-blank box with the feat's name floating in the middle. Live for
  two sections on the app's most-used screen. 926px to 47px.
- **The Builder did not scroll.** It rendered above `<main id="content">`, as a
  direct child of `.app { overflow: hidden }`. Everything past the first screen
  was unreachable by wheel; only an anchor could move it. Harmless while each
  section was about a screen tall, fatal the moment §33.4 landed.
- **The battle screen printed a 2x2 map.** Broken since §31.3 - confirmed
  against a build of 31.6, where it printed 988 by 2 - and §32.2's absolute
  stage took the width with it. A dungeon map is the whole argument for drawing
  in SVG rather than canvas.
- **`PopOut`'s drag never worked.** The listeners were attached in an effect
  guarded on a ref, and pressing a title bar changes a ref without causing a
  render. It shipped unnoticed because that panel only appears under 900px.

None of the four had a test or a probe looking at them. Both probes do now.

---

## 34. The camera: pan, zoom and rotate

The ask, verbatim: *"wasd can be used for map movement. q and e for rotation"*
and *"use hold right click to drag with mouse"*.

The board is 48×36 squares drawn into roughly 880×660 pixels. A square is about
18px, and a token's conditions, hit bar and floating numbers are drawn inside
it — so on a full map you cannot read them, and there was no way to get closer.

### The camera is the viewBox, not a transform

This is the load-bearing decision and everything else follows from it. Both maps
resolve a click through `getBoundingClientRect()` of the `<svg>` itself, which
reports the element's **untransformed** box. A CSS transform would move the
drawing on screen while every click kept resolving to where the drawing used to
be — silently, because a token is its own element with its own correct box, which
is exactly how the §32.1 bug survived a whole section.

Expressed in the viewBox instead, `toUserSpace` needed **no change at all**: it
already took an arbitrary `ViewBox`, because IsoMap's origin was never zero.
That was §32.1's real payoff, cashed here.

Stored **normalised** — the centre as a fraction of the drawing, not a
coordinate in it. The two maps have unrelated coordinate systems, and rotating
the isometric one changes its width, height, `minX` and `pad` together. A
fraction survives all of that; a coordinate would land somewhere arbitrary.

> **At `scale: 1` the viewBox is byte-identical to the one rendered before §34.**

That invariant is the reason about forty existing tests — which stub a map's box
and compute clicks as raw client coordinates — needed no edits. It is asserted
in `camera.test.ts` for both the flat frame and the isometric `-pad` one rather
than left to be noticed.

- `[x]` **34.1 One viewBox per map.** Each map used to write it **twice** — a
  template string in the JSX, an object literal inside `squareAt` — with nothing
  but discipline keeping them equal. This step changed no behaviour and is what
  made the next one a change to a single expression.
- `[x]` **34.2 `engine/camera.ts`**, pure, with the scale-1 identity asserted
  first. Two things surfaced while testing it, both now in the code: zooming
  **in** can never need the clamp (the anchor is already inside the window and
  the window only shrinks around it), and a drag must convert through the same
  `meet` scale the pointer maths uses or it tracks at one zoom and slips at the
  rest.
- `[x]` **34.3 The maps take a camera.** Right-drag pans, the wheel zooms at the
  pointer, two fingers pan and pinch. Left-drag is deliberately **not** a pan —
  it already places a combatant before the fight and walks them during it.
  Wired once in `useMapCamera`, because duplicated pointer maths across these
  two files is precisely what §32.1 was about.
- `[x]` **34.4 The keys.** WASD moves, Q/E turn the tactical view, `+`/`-` zoom
  and `0` fits. Every step is a fraction of what is on screen rather than a
  distance, so one press moves the view by the same visible amount at every
  zoom. Modifiers bow out first: Ctrl/Cmd+S is a save and Cmd+A is select-all.
- `[x]` **34.5 Follow the turn — only off screen.** Recentring every turn when
  the whole fight is already in view is the version of this people turn off. At
  the fitted view nothing is ever off screen, so it never fires until somebody
  zooms in. Plus a zoom widget, and notes that clamp against the *window*
  instead of the whole drawing.
- `[x]` **34.6 Gates, probe both themes at 1360, and the dead `.ws-*` CSS
  deleted** — 245 lines orphaned when §31.3 removed the Workspace component.
  §31.3's own commit argued that kept-but-unused code reads as load-bearing;
  it deleted the component and left the styles.
- `[x]` **34.7 The view toggle comes out of the drawer.** Reported straight
  after shipping: *"there is no button for Isometric / tactical view."* It
  existed — inside the Field drawer, two clicks in and below two checkboxes,
  which is a strange home for the control you reach for most in a fight and
  unfindable if you did not already know it was there. Plan/Tactical and
  Rotate now sit on the board beside the zoom, since all three answer the same
  question. `.view-toggle` went with them; it was the last thing using that
  style.

### A real bug fixed on the way in

Both maps' `onPointerDown` checked `onPaint` and the token drag but **never
checked `e.button`** — so right-clicking the battle map already placed or walked
the selected token, on top of opening the browser's context menu. Right-drag
could not be added without fixing it, and it was worth fixing regardless.

### Two things the probe caught that nothing else could

- **The zoom widget was invisible.** Bottom-left is the obvious corner and is
  already taken: `.btl-tail`, the combat log, floats there at a higher
  z-index and covered the widget completely. The DOM said it was there and the
  right size. Found by *looking at the screenshot*, which is why `run34.mjs`
  now asserts occlusion with `elementFromPoint` and not merely presence.
- **My own first probe passed vacuously**, twice. It skipped arming Move
  without saying so, and picked a target tile that the camera had scrolled off
  screen — an SVG clips to its viewBox, so the tile still reported a rect but
  was not there to be clicked. Both now fail loudly. A probe that quietly
  passes when it found nothing to click is worse than no probe, which is how
  §32.1 lived through a section.
- **Plan and Tactical rendered identically.** `.hud-cam .seg button` and
  `.seg button.is-on` have the *same* specificity, so the darkened background
  written for the map overlay won on source order alone and killed the accent
  that says which view you are in. `aria-pressed` was correct throughout, so
  the tests were happy. The probe now compares the two halves' computed
  background — a toggle you cannot read is worse than no toggle.

### Decisions taken without asking

- **Battle screen first.** The Dungeons editor passes no camera and is
  unaffected; adopting it there later is small.
- **Maximum zoom 4×** — about eight squares across, close enough to read a
  token's conditions. Minimum is fit-to-map; you cannot zoom out past the board.
- **Not persisted.** A fight reopened starts looking at the whole board, the
  way it did before the camera existed.

---

## 35. One nav, one look: the website chrome dies

The ask, verbatim: *"I am not liking the menu. Seem pretty redundant when it
leads to same page with all the tabs at the top. I am thinking the entire app
should have that full screen game feel."*

The complaint was exact, and it was a real defect in §31's design. The title
screen offered seven destinations; press any of them and you landed on a page
whose top rows offered **the same seven destinations again** — a masthead
with a wordmark and tagline, a CREATE/PLAY mode switch, and six tabs. Two
complete navigation systems for one set of places, one of them decoration.
Underneath that, a split visual language: the battle screen was the
full-bleed game the user kept asking for, and every other screen was a
website wearing its chrome.

### Hub and spoke

Fixed by **deleting the duplicate, not the menu**. The title screen is now
the app's only global navigation — a tactics game's main menu — and every
screen is a spoke with one small, consistent way back:

- **Desk screens wear one slim game bar**: the wordmark chip (home) on the
  left, the screen's name in the middle, the screen's *own* actions on the
  right — never global nav. Builder: Undo/Redo and "Character sheet →";
  Sheet: "← Edit in Builder", because that is the pair people flip between.
  A bar rather than a floating overlay, because desk screens scroll under
  their top edge and §34.7 was a whole commit about chrome that was present,
  correct, and underneath something else.
- **The battle wears nothing.** The map takes the two deleted rows — the
  whole 1360×900 from pixel zero, probe-asserted against the viewport rather
  than against yesterday's layout. Its way home is a **Menu** command at the
  end of its own bar, styled as a door rather than another drawer.
- **The hub earns its screen**: grouped as the three decisions a table faces
  — **Play** (primary) · **Create** · **World** — with live state on any
  line that has something to report: the loaded character on Build, the
  roster count on Characters, the map count on Dungeons, the campaign name,
  the round number on Resume. A hub that says nothing makes you press a
  button to find out.
- **Readability was kept, not traded**: `#content` and its 1240px column are
  untouched. The chrome went to the edges; the words did not.

What went with the strip: the masthead and tagline, the CREATE/PLAY mode
switch and the `createTab` memory that existed only to serve it, the
`tab-actions` undo cluster (undo now lives where it acts), the per-screen
theme toggle (the title corner has it — changing theme is a settings act,
done at the menu), and every line of their CSS, including the battle-skin
restyle of a tab strip that no longer exists. The first-run wizard lost the
masthead too: it asks its two questions under a centred wordmark, in the
title screen's voice.

- `[x]` **35.1 The shell**: game bar in, both navigation rows out; share
  banner and link error moved inside `#content` (shown on desk screens only
  — a banner arriving mid-fight would sit over the board); `document.title`
  reads a plain label map.
- `[x]` **35.2 The battle's way home**: `onHome` prop, Menu command,
  full-viewport board.
- `[x]` **35.3 The hub**: groups and live state lines; `TitleScreen` takes
  `groups`, and its tests grew the two claims that matter — state lines
  appear only where there is state, and the groups read in order.
- `[x]` **35.4 Gates, probe, ship.** `run35.mjs` walks every spoke in both
  themes at 1360: no `.masthead`/`.tabs`/`.mode-switch` anywhere, the home
  chip visible by `elementFromPoint` on every desk screen, both jumps of the
  Builder⇄Sheet pair, print hiding the bar while the sheet keeps its width,
  the battle filling the window, and Menu landing back on the hub.
  `run34.mjs` re-run untouched — the camera did not care that the board
  moved up two rows, which is exactly what §34 promised.

### The judgement call, stated

Hub-and-spoke costs a press: Builder → Dungeons is now two clicks (home,
then Dungeons) instead of one tab. That is the price of having one
navigation instead of two, and it is paid exactly where traffic is lightest
— the pairs that are actually flipped between (Builder⇄Sheet, and
mid-fight glances handled inside the battle's own drawers) have direct
doors. If a third pair turns out to matter, it gets a door too; the menu
does not come back to the top of every screen.

---

## 36. The battle HUD moves onto the board

The ask, verbatim: *"The play/fight screen still has elements 'outside the
screen' such as the turn order at the top, all the buttons on the bottom."*

Correct, and structural: since §32.2 the timeline and the command bar floated
*inside* the stage but reserved rows (`--hud-top`/`--hud-bottom`) that the
board's fit rectangle never extended under - so they sat on page-coloured
margins looking exactly like the chrome rows §35 had just deleted everywhere
else. The §35.5 hold-H fix had already proven the board can take the whole
window; this makes it the resting state.

- **The board's stage spans the full window height, always.** The strip and
  bar reservations died; only the cockpit keeps its column, because it is a
  workspace you read and type in, and §32's token-hiding argument still
  holds for a full-height opaque panel.
- **The in-map floats offset themselves by the same `--hud-top`/`--hud-bottom`
  vars** the reservations used to consume - so the hint, the camera cluster,
  the height readout and the legend clear the strip and bar, and slide to
  the window edges when hold-H zeroes the vars or the strip is absent. One
  set of vars, two consumers swapped.
- **The strip and bar wear the battle's dark glass.** A scrim behind each,
  and the command buttons themselves went from page-coloured panels to the
  same translucent dark the hint, the shot bar and the camera cluster
  already speak - which is most of what made them read as "outside the
  screen" in the first place. Theme-independent, like all the battle glass.

The §32-era worry - tokens hidden under floats - is answered by machinery
that did not exist then: the camera pans and zooms (§34), and hold-H clears
and expands everything (§35.5). `run35.mjs` now asserts the stage spans the
viewport height and both scrims exist, in both themes.

---

## 37. Standing pawns for the tactical view

The ask, verbatim: *"I would like to have 3d Pawns for the tactical view."*

The tactical view exists because height has been in the data since §12 and a
flat wash was the only way to see it. Everything on that board stands up -
tiles are extruded blocks with skirts, walls are two steps tall - except the
tokens, which stayed discs lying flat. That was the last thing still
pretending the board was flat.

A token is now a **cardboard standee**: an elliptical shadow on the ground,
a wedge base sitting in it, and a card standing out of the base carrying the
character's portrait, or their initials when they have no face. §7 gave
characters portraits and only the sheet and the timeline ever showed them; a
standee is a piece of cardboard with a picture on it, which is what the
portrait was for.

**SVG, not a 3D library** - the load-bearing decision. The whole map pipeline
is dependency-free SVG with a box-based hit test, a viewBox camera (§34), a
print path and a browser probe that clicks rendered geometry. A WebGL canvas
would orphan all four at once, for an effect that a wedge, a shadow and
painter's-order overlap already sell. If real 3D is wanted later it is its
own conversation, not a side effect of this one.

The states came with it. The flat map writes every token state on a
`circle` - party fill, active stroke, bloodied tint, down, hiding - so the
card restates each on its own rect rather than inventing a second palette:
the *rules* differ because the shape does, the *meanings* are identical. Down
is the one that changed for the better: the card falls over, which is what a
table does with a dropped miniature and needs no legend.

`run34.mjs` re-run unchanged - clicking a rendered tile still lands the token
on that exact square, which is the check that matters when token geometry
moves.

---

## Recently completed

The SRD audit pass, in order. Each was a real defect, not a tidy-up.

- `[x]` **Weapon table split by edition.** Lance, trident, war pick, warhammer
  and dart differ between 2014 and 2024, and one row was serving both — a 2014
  lance was rolling 1d10 instead of 1d12. Added the 2024 firearms.
- `[x]` **Four magic items corrected.** Two staffs a rarity low; Cubic Gate and
  Periapt of Proof against Poison wrongly requiring attunement, which cost the
  sheet an attunement slot.
- `[x]` **Barding derived from the armor table** at four times cost and twice
  weight — twelve rows that were simply absent.
- `[x]` **Magic item families enumerated.** Ten families were one generic row
  each; 283 entries to 371, with rarity and attunement from the SRD.
- `[x]` **Spell lists corrected.** Eighteen wrong class lists — thirteen of them
  spells offered to Warlocks who cannot take them — three wrong schools, and six
  spells missing, including Hellish Rebuke.
- `[x]` **2024 subclass progressions.** All twelve SRD subclasses were showing
  2014 feature levels under 2024, and the Champion was granting a
  half-proficiency bonus that 2024 does not give.
- `[x]` **Spell ranges and durations are checked.** Fixing Produce Flame meant
  teaching the audit to see the field at all. Doing that exposed a bug in the
  audit's own bookkeeping: it judged an exception stale per *domain*, so adding
  a second spell check made the five class-list exceptions look unused. It
  reconciles per field now.
- `[x]` **The README stopped lying.** Four caveats described an app that no
  longer existed — ordinary gear "not tracked at all", one spell list rather
  than known-versus-prepared, subclass features "not exhaustive", dip tools
  untracked — and every one of them was the opposite of the truth. A stale
  number is untidy; a false caveat is read, believed, and stops someone looking.
- `[x]` **The audit became a test.** Turning the one-off scripts into
  `npm test` found three more things on its first proper run: Bigby's Hand was
  on the Sorcerer list and Rary's Telepathic Bond on the Bard list, neither of
  which is true, and seven pack oddments — alms box, censer, vestments and the
  rest — were missing from the gear table. It also caught a bug in *itself*,
  comparing 2024 species against the 5.1 fixture and reporting a gnome speed
  defect that was not there.

---

## Data pipeline and source evaluation (2026-08-01)

The raw output was a set of scratch JSON files in the repo root; the
conclusion below is what survived them, and they have since been deleted.
`npm run audit` is the standing version of this question.

- `[x]` **Comprehensive gap analysis against Open5e and Free5e.** Built a pipeline
  to fetch and compare all data categories from two open-source sources: the
  [Open5e API](https://api.open5e.com) (OGL + CC-BY 4.0) and the
  [Free5e repository](https://github.com/wyrmworkspublishing/free5e) (CC BY 4.0).

  **The finding worth keeping:** Open5e's *own* documents — `a5e`, `bfrd`,
  `open5e-originals` — and Free5e are reimagined content, not PHB rules. Their
  archetypes carry different names and mechanics, so they cannot fill the
  non-SRD subclass gap in item 1.3. That conclusion stands.

  **The qualification:** Open5e also serves the real thing under
  `document__key=srd-2014` and `srd-2024`, and those are faithful. The data
  audit already uses `srd-2024` for the 2024 weapon table, because dnd5eapi's
  2024 cost column is broken. The source is usable when filtered by document;
  it is only the house content that is a different game.

  The comparison table this section originally carried has been removed rather
  than corrected. Its local-side figures were wrong in six of eight rows — it
  reported 18 magic items against 371, 37 subclass features against 589, 52
  feats against 97, 324 spells against 344 — and it read Open5e's v1 endpoints
  one 50-record page at a time, so the "gap" column did not follow from
  anything. Counting is what `npm run audit` and `readmeCounts.test.ts` are
  for, and they run on every commit.
