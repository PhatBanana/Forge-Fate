# How the recommendations work

The detail behind the numbers. [The README](../README.md) says what the app
does; this says how it decides. Split out because a README that is a third
engine documentation is a README nobody finishes.

Nothing here is a black box: every rule that fires contributes its reasoning
along with its weight, so a recommendation is never just a score.

## Feats

Each feat has a baseline power level and a list of conditional rules:

```ts
{
  id: 'sharpshooter',
  base: 8,
  rules: [
    { when: style('dex-ranged'), delta: 3,
      why: 'This is the defining feat for every ranged weapon build in 5e.' },
    { when: extraAttack(), delta: 2,
      why: 'Extra Attack multiplies the +10 damage across every shot.' },
    { when: hasFeat('crossbow-expert'), delta: 2,
      why: 'With Crossbow Expert you get three or more shots per round, each carrying +10.' },
    { when: any(style('str-melee', 'unarmed', 'spell'), load('sword-and-board', /* … */)), delta: -8,
      why: 'Only affects ranged weapon attacks, which this build does not make.' },
  ],
}
```

Conditions compose (`all`, `any`, `not`) over class, subclass, lineage, weapon
style, loadout, casting type, ability scores, level, Extra Attack, feats already
taken, and whether the build concentrates. Every rule that fires contributes its
`delta` **and** its `why`, so a recommendation is never just a score.

## ASIs vs feats

Ability increases are scored on the same scale as feats so the two rank in one
list. The value splits into the modifier you get now and the progress banked
toward the next step, which makes a `+1` onto an **odd** primary score nearly as
good as a full `+2`, a `+1` onto an **even** score nearly worthless, and
half-feats climb the moment a primary score goes odd. Half-feats get their `+1`
at a discount. The engine splits an improvement `+1/+1` across two abilities when
both halves cross a modifier step, and drops that option when either would be
dead weight.

## The weapon style matters

The class table lists Strength as a Fighter's primary ability, but a Fighter with
a longbow has no use for it. So the weapon you equip overrides the class's
priorities and gates every combat feat — swapping a greatsword for a longbow
moves Sharpshooter and Great Weapon Master by ten points each.

Finesse follows the character rather than the weapon, so a rapier on a Strength
build really is a Strength build. A Monk uses Dexterity with a quarterstaff
through Martial Arts; a Fighter holding the same staff uses Strength.

The attack line gets right the rules sheets commonly do not: the off-hand attack
adds no ability modifier without Two-Weapon Fighting, a versatile weapon only
rolls its larger die when the other hand is genuinely free, and a Loading weapon
wastes Extra Attack.

## Armor class and hit points

AC is built from the armor you pick, not inferred from your class: Dexterity caps
per category (raised to +3 by Medium Armor Master), proficiency and Strength
requirements, shields, magic bonuses, the Defense fighting style, and the best
unarmored formula available — Monk, Barbarian, Draconic Resilience, Lizardfolk,
Dragon Hide — respecting which tolerate a shield.

Hit points take the maximum at 1st level and the fixed average afterwards (or
your own rolls), then apply Constitution across every level, plus Tough, Dwarven
Toughness and Draconic Resilience.

Both explain themselves in place — every figure in At a glance with arithmetic
behind it opens its own breakdown — and both feed back into the recommendations:
Heavy Armor Master is only worth taking while you wear heavy armor.

## Skills

Skills split into **granted** (a background's two, an Elf's Perception) and
**picked** (your class list, a Half-Elf's floating pair, Skilled). Only picks are
stored; everything else is derived. So changing your background cannot leave a
stale proficiency behind, and the app can tell you when a pick landed on
something you already had.

Picks are **attributed to the sources that pay for them** rather than checked
against a flat union. A Variant Human Wizard has one unrestricted proficiency and
two from the Wizard list, so they can hold exactly one off-list skill — not
three. Attribution assigns the most constrained pick first, so a Kenku Rogue's
lineage list is not starved by the Rogue list helping itself to Stealth.

Recommendations read from the same value table as the background matrix, so the
two cannot drift. Per build they adjust for what the class needs, a governing
ability you dumped, and armor that gives disadvantage — a Fighter in chain mail
is not told to take Stealth.

## Class features

Every class's features live in one table, level by level. It answers "what do I
get at 6", and it is where the engine reads class facts from: a feature is
declared once with a tag and the engine asks for the tag, rather than Extra
Attack being a boolean plus four subclass exceptions written out by id.

The choices those features hand you are structurally feats without the ability
increase, so they reuse the same scoring code. Two things the naive version gets
wrong and this does not: an invocation's level requirement is against *Warlock*
levels, so a Fighter 10 / Warlock 2 does not qualify for Thirsting Blade, and
maneuver slots come from the Battle Master subclass rather than the Fighter
class.

## Damage per round

Every other number in this app is a fact you could look up. DPR is a model, so it
shows its working: a curve across AC 10 to 25, an itemised breakdown, and a
break-even point for the feats whose entire question is whether they pay.
**Sustained** is what you do every round all day; **nova** is your best single
round with Action Surge and a smite spent.

The −5/+10 feats are evaluated per AC rather than globally. A Fighter 5 with a
greatsword and +6 to hit profits from Great Weapon Master up to AC 16 and loses
beyond it, so that is what the app says.

Riders folded in: Sneak Attack once per turn rather than per attack, Rage only on
Strength melee, Divine Smite, Great Weapon Fighting's rerolls at their true
averages, Polearm Master and Crossbow Expert bonus attacks, a Champion's widened
crit range, and what the weapon adds — Flame Tongue's 2d6, a Vicious Weapon's 7
on a critical, the Scimitar of Speed's bonus attack.

Concentration is one slot and the model spends it once: Hunter's Mark, Hex, Bless
and Bane are candidates rather than a stack, and the best for the target AC is
the one that runs. Bane assumes the target failed its save against Bane, and the
breakdown says so out loud.

Casters are modelled too, because a Wizard reading 0 looks like an answer rather
than an absence. A round is a choice — swing or cast — so the app reports
whichever is better and names the other.

**Healing** sits beside the curve rather than inside it, since damage and healing
are never traded against each other. It folds in Disciple of Life, which is why a
Life Cleric runs so far ahead. It is the most honest figure in the app: no attack
roll, no saving throw, so no hit chance to average in.

## Spellcasting

Slots do not come from adding class levels, and this is the rule most builders
get wrong. A full caster contributes its whole level, a half caster half rounded
down, a third caster a third — so a Paladin 6 / Sorcerer 6 casts as a **9th**-level
caster, not a 12th. Warlock Pact Magic never joins that pool and is reported
alongside it.

Save DC and spell attack are **per casting class, not per character**. A Cleric 5
/ Wizard 5 with Wisdom 14 and Intelligence 20 casts Cleric spells at DC 14 and
Wizard spells at DC 17, and the sheet prints both, labelled. Which class taught a
spell is recorded rather than inferred; where two could have, the card offers the
choice, and until you make it the better DC is used and marked *assumed*, so a
guess never passes for a fact.

How many spells you get is per-class too: a Wizard prepares Intelligence + level,
a Cleric and Druid the same off Wisdom, a Paladin off half their level rounded
up, and Sorcerer, Bard, Ranger and Warlock know a fixed number from a table.

Spells reuse the same scoring machinery as feats. Two things differ: only spells
carrying an opinion are ranked, and the rest are offered marked unrated rather
than given a number that means nothing; and the value of a spell depends on what
you already took, since a second concentration spell competes with the first.

## The origin matrices

Under 2014 the question is "which species for which class", because species carry
the ability increases. Under 2024 those moved to backgrounds, so the same question
is asked of **backgrounds**. Species are still rated in 2024 but on traits alone,
on a scale calibrated for that — reusing the 2014 cutoffs would paint the table
red and tell you to avoid every species.

Each 2014 cell is computed from three parts, so all 559 are explainable:

1. how well the lineage's increases land on what the class needs,
2. how much its traits patch that class's structural weaknesses,
3. a curated adjustment for the 43 pairings with a reputation, each with a
   written verdict.

Increases are weighted well above traits on purpose; without that a pile of small
perks outranks a `+2` in the stat the class runs on. A test asserts the top rating
stays scarce (~14% of cells) so retuning cannot quietly inflate everything to
"Excellent". Curated pairings sort above cells that merely compute well.
