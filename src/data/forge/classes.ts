import type { CharClass, ClassId } from '../../types';
import type { ClassFeature } from '../classFeatures';
import type { ClassResource } from '../classResources';

/**
 * The app's own classes.
 *
 * ## Why four, and why these four
 *
 * §56 levelled the *subclass* roster and left the class list alone, which was
 * the right order to do it in and only half the job. The class list has holes
 * of its own, and they are not holes of count - thirteen classes is plenty -
 * but of design space that the published thirteen leave empty or handle badly
 * enough that the argument about it never stops.
 *
 * Each of these four exists because of a specific, long-running complaint, and
 * each is written to answer it rather than to be another flavour of something
 * that already works:
 *
 * - **The Reckoner** — the Warlock's recovery clock. Pact Magic comes back on
 *   a short rest, so the class's power is set by how many short rests the
 *   table takes: none in a day and a Warlock casts like an Eldritch Knight,
 *   two and they cast like a full caster. Nothing else in 5e swings that far
 *   on a scheduling decision. The Reckoner's currency comes back at the
 *   *start of every fight* instead, which is why §54 taught the engine a
 *   third kind of recharge before this file existed.
 *
 * - **The Harrier** — the Ranger's Favored Enemy. It asks a first-level
 *   character to guess what the campaign is about, gives no combat benefit
 *   when the guess is right, and has been reworked three times without being
 *   fixed. The Harrier names its quarry **in play**, renames it every fight,
 *   and the naming does something.
 *
 * - **The Marshal** — the commander. 4e had the Warlord and 5e never
 *   replaced it: the Battle Master gestures at it with a handful of dice, and
 *   every other way to help an ally in this game is a spell. A non-magical
 *   leader who hands out attacks, movement and hit points is the single most
 *   frequently asked-for missing class in 5e, and it is missing because it is
 *   hard to balance, not because nobody wants it.
 *
 * - **The Adept** — psionics. Wizards of the Coast tried a psionic class at
 *   least four times across 5e's life and shipped none of them, settling for
 *   subclasses (Psi Warrior, Soulknife, Aberrant Mind) that borrow the
 *   flavour and none of the chassis. The Adept spends dice rather than slots
 *   and does not prepare anything.
 *
 * ## The thing they are all measured against
 *
 * A new class that quietly outdamages the published ones is not a new class,
 * it is a mistake with a name. `forge/balance.test.ts` runs each of these
 * through `computeDpr` at levels 5, 11 and 17 and fails if it sits outside
 * the band the published classes occupy at that level. The band is measured
 * from the published thirteen at run time rather than typed in, so it moves
 * when the damage model does and cannot go stale.
 *
 * ## Subclasses
 *
 * Nine each under 2014 and five under 2024, which are exactly §56's floors.
 * A new class shipping with four while the Cleric has fifteen would recreate
 * the imbalance that section measured and fixed, one file later.
 */

const STANDARD_ASI = [4, 8, 12, 16, 19];

/** A once-per-turn rider's progression, written the way the tables are read. */
const riderSteps = (...pairs: [number, number][]) =>
  pairs.map(([level, count]) => ({ level, count }));

export const FORGE_CLASSES: CharClass[] = [
  {
    id: 'reckoner',
    name: 'Reckoner',
    source: 'Forge',
    hitDie: 8,
    abilityPriority: { str: 0, dex: 2, con: 2, int: 0, wis: 1, cha: 3 },
    saves: ['wis', 'cha'],
    asiLevels: STANDARD_ASI,
    /*
      A half caster on Charisma that starts at 1st level, drawing the Warlock's
      list. Half rather than pact on purpose: Pact Magic *is* the short-rest
      clock this class exists to replace, so inheriting it would have been the
      bug with a new name on it. Half-caster slots top out at 5th level, which
      is where Pact Magic tops out too - the ceiling is kept, the clock is not.
    */
    castingType: 'half',
    castingAbility: 'cha',
    castsFromLevel1: true,
    drawsSpellsFrom: 'warlock',
    armor: 'Light',
    armorProficiency: ['light'],
    weapons: 'Simple, hand crossbows, rapiers, shortswords',
    weaponProficiency: {
      categories: ['simple'],
      specific: ['hand-crossbow', 'rapier', 'shortsword'],
    },
    defaultWeaponStyle: 'dex-melee',
    multiclass: { armor: ['light'], weapons: { categories: ['simple'] } },
    skillChoices: {
      count: 2,
      from: ['arcana', 'deception', 'history', 'insight', 'intimidation', 'investigation', 'persuasion'],
    },
    multiclassPrereq: { abilities: [{ ability: 'cha', min: 13 }], mode: 'all' },
    /*
      The Reckoning die. No Extra Attack, so this is most of the class's
      damage, and it is sized against a Rogue's Sneak Attack rather than
      guessed at: bigger dice, fewer of them, and a half caster's spells on
      top. `balance.test.ts` is what actually decides whether that landed.
    */
    oncePerTurn: {
      name: 'Reckoning die',
      die: 8,
      byLevel: riderSteps([1, 1], [5, 2], [11, 3], [17, 4]),
    },
    subclasses: [],
    note: 'Calls a reckoning on one enemy per fight and collects. Its currency comes back at the start of every combat rather than on a short rest, so it is the same class in a dungeon crawl and in a single set-piece - which is the one thing a Warlock is not.',
  },

  {
    id: 'harrier',
    name: 'Harrier',
    source: 'Forge',
    hitDie: 10,
    abilityPriority: { str: 0, dex: 3, con: 2, int: 0, wis: 2, cha: 0 },
    saves: ['dex', 'wis'],
    asiLevels: STANDARD_ASI,
    castingType: 'half',
    castingAbility: 'wis',
    castsFromLevel1: true,
    drawsSpellsFrom: 'ranger',
    armor: 'Light, medium, shields',
    armorProficiency: ['light', 'medium', 'shield'],
    weapons: 'Simple, martial',
    weaponProficiency: { categories: ['simple', 'martial'] },
    masteries: [{ level: 1, count: 2 }],
    defaultWeaponStyle: 'dex-ranged',
    multiclass: {
      skills: { count: 1, from: ['athletics', 'insight', 'investigation', 'nature', 'perception', 'stealth', 'survival'] },
      armor: ['light', 'medium', 'shield'],
      weapons: { categories: ['simple', 'martial'] },
    },
    skillChoices: {
      count: 3,
      from: ['acrobatics', 'athletics', 'insight', 'investigation', 'nature', 'perception', 'stealth', 'survival'],
    },
    multiclassPrereq: {
      abilities: [{ ability: 'dex', min: 13 }, { ability: 'wis', min: 13 }],
      mode: 'all',
    },
    /*
      Smaller die than the Reckoner's, and stepping later than either of them.

      The first draft used the Reckoner's own step levels and `balance.test.ts`
      failed it at three of six measured cells - the Harrier came out above
      every published class at 5th under 2024, which is what happens when a
      once-per-turn rider is bolted onto a class that already swings twice.
      Second attacks and flat riders multiply; they do not add.

      Steps at 7, 13 and 19 instead, which is the whole correction. The class
      plays the same and the numbers land mid-band.
    */
    oncePerTurn: {
      name: 'Quarry die',
      die: 6,
      byLevel: riderSteps([1, 1], [7, 2], [13, 3], [19, 4]),
    },
    subclasses: [],
    note: 'Names its quarry in the fight rather than at character creation, and renames it every fight. Everything the class does keys off that mark, so it is never the wrong Ranger for the campaign it ended up in.',
  },

  {
    id: 'marshal',
    name: 'Marshal',
    source: 'Forge',
    hitDie: 10,
    abilityPriority: { str: 2, dex: 1, con: 2, int: 1, wis: 1, cha: 3 },
    saves: ['str', 'cha'],
    asiLevels: STANDARD_ASI,
    castingType: 'none',
    armor: 'All armor, shields',
    armorProficiency: ['light', 'medium', 'heavy', 'shield'],
    weapons: 'Simple, martial',
    weaponProficiency: { categories: ['simple', 'martial'] },
    masteries: [{ level: 1, count: 2 }, { level: 10, count: 1 }],
    defaultWeaponStyle: 'str-melee',
    multiclass: {
      armor: ['light', 'medium', 'shield'],
      weapons: { categories: ['simple', 'martial'] },
    },
    skillChoices: {
      count: 2,
      from: ['athletics', 'history', 'insight', 'intimidation', 'perception', 'persuasion'],
    },
    multiclassPrereq: {
      abilities: [{ ability: 'str', min: 13 }, { ability: 'cha', min: 13 }],
      mode: 'all',
    },
    /*
      No rider, and that is the design rather than an omission. The Marshal's
      output is other people's turns - an ally attacking off your command does
      that ally's damage, on that ally's sheet - so a rider here would be the
      model counting the same round twice. `computeDpr` therefore reads it as
      a plain martial with Extra Attack, which is honest about what it does by
      itself and silent about what it does for the party. The class note says
      so; a number the app cannot compute is better left uncomputed than
      guessed.
    */
    subclasses: [],
    note: 'A commander rather than a caster: spends Commands to give allies attacks, movement and hit points. Its damage number here is what it does alone, which understates it badly - most of a Marshal\'s output happens on somebody else\'s turn, and no damage model can see that.',
  },

  {
    id: 'adept',
    name: 'Adept',
    source: 'Forge',
    hitDie: 8,
    abilityPriority: { str: 0, dex: 2, con: 2, int: 3, wis: 1, cha: 0 },
    saves: ['int', 'wis'],
    asiLevels: STANDARD_ASI,
    /*
      Not a caster. That is the whole premise: psionics in this app spends psi
      dice and has no slots, no spell list, no components and nothing to
      prepare - which is what every abandoned Wizards of the Coast attempt at
      a psion kept converging on and then backing away from.

      It costs the class the spell panel and every spell-shaped feat, and it
      buys the one thing a psionic class needs: you cannot be counterspelled,
      silenced, or told to put your hands where the DM can see them.
    */
    castingType: 'none',
    armor: 'None',
    armorProficiency: [],
    weapons: 'Simple',
    weaponProficiency: { categories: ['simple'] },
    defaultWeaponStyle: 'dex-melee',
    multiclass: { weapons: { categories: ['simple'] } },
    skillChoices: {
      count: 2,
      from: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'perception', 'persuasion'],
    },
    multiclassPrereq: { abilities: [{ ability: 'int', min: 13 }], mode: 'all' },
    /*
      One attack a turn, so this rider is most of the Adept's damage and a step
      of it is worth more here than on a class with Extra Attack. Measured at
      the Reckoner's step levels it edged past the Fighter at 11th - by a
      tenth, which is still outside the band and still a fail. The middle two
      steps moved later.
    */
    oncePerTurn: {
      name: 'Psionic strike',
      die: 6,
      byLevel: riderSteps([1, 1], [5, 2], [13, 3], [19, 4]),
    },
    subclasses: [],
    note: 'Spends psi dice rather than spell slots, and prepares nothing. No components, no verbal casting and nothing to counterspell - the trade is no spell list at all, so what it can do is exactly what its discipline says and no more.',
  },
];

export const FORGE_CLASS_FEATURES: Record<string, ClassFeature[]> = {
  reckoner: [
    { level: 1, name: 'Reckonings', summary: 'A pool of Reckonings that refills at the start of every fight. Spend one to call a reckoning on a creature you can see; the first time you hit it each turn you add your Reckoning die.' },
    { level: 1, name: 'Terms', summary: 'Half caster on Charisma from 1st level, drawing on the Warlock spell list. Slots are recovered on a long rest - the Reckonings are what the fight runs on.' },
    { level: 2, name: 'Collect', summary: 'When a creature you called a reckoning on drops to 0 hit points, you get the Reckoning back.' },
    { level: 3, name: 'Ledger', summary: 'Choose what you bargained with. It grants features at 3rd, 6th, 10th and 14th level.' },
    { level: 5, name: 'Double Entry', summary: 'You may hold two reckonings at once, and your Reckoning die becomes 2d8.' },
    { level: 7, name: 'Arrears', summary: 'A creature you called a reckoning on has disadvantage on saves against your spells.' },
    { level: 9, name: 'Called In', summary: 'As a reaction when a creature you called a reckoning on moves out of your reach, make one weapon attack against it. Free, and not your reaction for the round.' },
    { level: 11, name: 'Compound', summary: 'Your Reckoning die becomes 3d8.' },
    { level: 13, name: 'Nothing Is Free', summary: 'Once per fight, when you would take damage from a creature you called a reckoning on, halve it.' },
    { level: 15, name: 'The Long Account', summary: 'A creature you called a reckoning on cannot become invisible to you or hide from you.' },
    { level: 17, name: 'Settled', summary: 'Your Reckoning die becomes 4d8, and you hold three reckonings at once.' },
    { level: 18, name: 'Written Off', summary: 'When you drop to 0 hit points you may spend a Reckoning to drop to 1 instead.' },
    { level: 20, name: 'Debt Collector', summary: 'At the start of each fight you have your full Reckonings and one more. The first creature you call a reckoning on each fight has disadvantage on its first saving throw against you.' },
  ],

  harrier: [
    { level: 1, name: 'Quarry', summary: 'As a bonus action, name a creature you can see as your quarry until the fight ends. The first time you hit it each turn, add your Quarry die. Naming a new quarry costs nothing once the old one is dead; otherwise it is a bonus action and refreshes at the start of every fight.' },
    { level: 1, name: 'Read the Ground', summary: 'Half caster on Wisdom from 1st level, drawing on the Ranger spell list.' },
    { level: 2, name: 'Trailcraft', summary: 'Expertise in one of Nature, Perception, Stealth or Survival. A second at 9th level.' },
    { level: 3, name: 'Discipline', summary: 'Choose how you hunt. It grants features at 3rd, 7th, 11th and 15th level.' },
    { level: 5, name: 'Extra Attack', summary: 'Attack twice with the Attack action.', tags: ['extra-attack'] },
    { level: 5, name: 'Second Sight', summary: 'You always know the direction of your quarry within 300 feet, and can sense whether it is wounded.' },
    { level: 7, name: 'Run Them Down', summary: 'Your Quarry die becomes 2d6. ' +  'Your speed is not reduced by difficult terrain while moving toward your quarry, and opportunity attacks against you from anyone but your quarry have disadvantage.' },
    { level: 9, name: 'Two Trails', summary: 'You may hold two quarries at once.' },
    { level: 11, name: 'Cornered', summary: 'Your quarry cannot take the Disengage action, and cannot benefit from a flying speed while you can see it.' },
    { level: 13, name: 'No Cover', summary: 'Your Quarry die becomes 3d6. ' +  'Your attacks against your quarry ignore half and three-quarters cover.' },
    { level: 15, name: 'Exhaust the Prey', summary: 'Your quarry has disadvantage on saving throws against being frightened, restrained or knocked prone.' },
    { level: 17, name: 'Kill Order', summary: 'You may hold three quarries at once.' },
    { level: 18, name: 'Never Lost', summary: 'You cannot be surprised while you have a quarry, and you have advantage on initiative.' },
    { level: 19, name: 'Run To Ground', summary: 'Your Quarry die becomes 4d6.' },
    { level: 20, name: 'Sworn Hunter', summary: 'When you name a quarry, it is frightened of you until the end of your next turn unless it succeeds on a Wisdom save against your spell save DC.' },
  ],

  marshal: [
    { level: 1, name: 'Commands', summary: 'A pool of Commands that refills at the start of every fight. Spend one as a bonus action for a Field Order: an ally who can see and hear you moves half their speed and makes one weapon attack, or gains temporary hit points equal to your Charisma modifier plus your Marshal level.' },
    { level: 1, name: 'Fighting Style', summary: 'A fighting style of your choice.', tags: ['fighting-style'], grants: { kind: 'fighting-style', count: 1 } },
    { level: 2, name: 'Rally', summary: 'As an action, every ally within 30 feet who can hear you ends one effect of frightened or charmed on themselves and gains temporary hit points equal to your Charisma modifier. Once per short rest.' },
    { level: 3, name: 'Doctrine', summary: 'How you make war. It grants features at 3rd, 7th, 10th and 15th level.' },
    { level: 5, name: 'Extra Attack', summary: 'Attack twice with the Attack action.', tags: ['extra-attack'] },
    { level: 6, name: 'Presence', summary: 'Allies within 30 feet who can see you add your Charisma modifier to saving throws against being frightened.' },
    { level: 7, name: 'Reposition', summary: 'As a reaction when an ally within 30 feet is hit, spend a Command: they move 10 feet without provoking, and if that moves them out of range the attack misses.' },
    { level: 9, name: 'The Line Holds', summary: 'When you spend a Command, one ally within 30 feet may also stand up from prone at no cost.' },
    { level: 10, name: 'Battlefield Sense', summary: 'You and every ally within 30 feet add your Charisma modifier to initiative.' },
    { level: 13, name: 'Two Orders', summary: 'A Field Order may be given to two allies at once.' },
    { level: 15, name: 'Nobody Falls', summary: 'When an ally within 30 feet drops to 0 hit points, you may spend a Command as a reaction to leave them at 1 instead.' },
    { level: 17, name: 'Advance', summary: 'Once per fight, every ally within 30 feet immediately moves up to their speed and makes one weapon attack.' },
    { level: 18, name: 'Veteran Company', summary: 'Allies who spend a short rest with you regain the maximum on each Hit Die they spend.' },
    { level: 20, name: 'Field Marshal', summary: 'Your Commands are equal to your Charisma modifier plus three, and giving a Field Order no longer costs your bonus action once per round.' },
  ],

  adept: [
    { level: 1, name: 'Psi Dice', summary: 'A pool of psi dice, refilled at the start of every fight. They pay for everything you do, and no rest gives you more than a fight does.' },
    { level: 1, name: 'Psionic Strike', summary: 'Once per turn, spend a psi die when you hit with a weapon attack to add your Psionic Strike dice as force damage.' },
    { level: 1, name: 'Mind Over Body', summary: 'While you wear no armour, your armour class is 10 + your Dexterity modifier + your Intelligence modifier. A shield would break your focus.', tags: ['unarmored-defense'], unarmored: { extra: 'int', allowsShield: false } },
    { level: 2, name: 'Telekinetic Hand', summary: 'Move an object or shove a creature within 30 feet with a thought. Against a creature it is a Strength save against 8 + your proficiency bonus + your Intelligence modifier for 10 feet of forced movement. One psi die.' },
    { level: 3, name: 'Discipline', summary: 'The shape your mind takes. It grants features at 3rd, 6th, 11th and 17th level.' },
    { level: 5, name: 'Focused Strike', summary: 'Your Psionic Strike becomes 2d6.' },
    { level: 6, name: 'Shielded Mind', summary: 'Advantage on saving throws against being charmed or frightened, and you cannot be read or scried without your knowledge.' },
    { level: 7, name: 'Second Thought', summary: 'Spend a psi die as a reaction to add it to a saving throw you or an ally within 30 feet just made.' },
    { level: 9, name: 'Sustained', summary: 'You regain one psi die whenever you reduce a creature to 0 hit points.' },
    { level: 11, name: 'Piercing Thought', summary: 'Your Psionic Strike ignores resistance to force damage.' },
    { level: 13, name: 'Unspoken', summary: 'Telepathy with any creature you can see within 120 feet that shares a language with you.' },
    { level: 15, name: 'Blank', summary: 'As a reaction, spend two psi dice to become immune to one damage instance\'s rider effect - a condition, forced movement, or a triggered save.' },
    { level: 13, name: 'Mind Like a Blade', summary: 'Your Psionic Strike becomes 3d6.' },
    { level: 17, name: 'Nothing Held Back', summary: 'Spend three psi dice on a hit to make it a critical.' },
    { level: 18, name: 'Bottomless', summary: 'You regain half your psi dice, rounded up, at the start of each of your turns on which you have none.' },
    { level: 19, name: 'Whole Mind', summary: 'Your Psionic Strike becomes 4d6.' },
    { level: 20, name: 'Ascendant', summary: 'Your psi dice become d8s, and once per long rest you may refill the pool as a free action.' },
  ],
};

/*
  The counters, all four of them per-encounter, which is the point.

  `Recharge: 'encounter'` is §54's addition and this is what it was added for.
  Both rests hand these back as well - anything you get back every fight you
  certainly have after an hour - so a party that rests between fights is never
  worse off than one that did not.
*/
export const FORGE_CLASS_RESOURCES: Partial<Record<ClassId, ClassResource[]>> = {
  reckoner: [
    {
      id: 'reckonings',
      name: 'Reckonings',
      max: { kind: 'table', byLevel: [{ level: 1, count: 2 }, { level: 5, count: 3 }, { level: 11, count: 4 }, { level: 17, count: 5 }] },
      recharge: 'encounter',
      display: 'pips',
      minLevel: 1,
      note: 'Back at the start of every fight, and on either rest. Collect returns one when a marked creature drops.',
    },
  ],
  harrier: [
    {
      id: 'quarries',
      name: 'Quarries held',
      max: { kind: 'table', byLevel: [{ level: 1, count: 1 }, { level: 9, count: 2 }, { level: 17, count: 3 }] },
      recharge: 'encounter',
      display: 'pips',
      minLevel: 1,
      note: 'How many creatures you may have marked at once. Naming a quarry costs a bonus action, not a use.',
    },
  ],
  marshal: [
    {
      id: 'commands',
      name: 'Commands',
      max: { kind: 'table', byLevel: [{ level: 1, count: 2 }, { level: 5, count: 3 }, { level: 11, count: 4 }, { level: 17, count: 5 }] },
      recharge: 'encounter',
      display: 'pips',
      minLevel: 1,
      note: 'Field Orders, Reposition and Nobody Falls all spend these. Back at the start of every fight.',
    },
  ],
  adept: [
    {
      id: 'psi-dice',
      name: 'Psi dice',
      max: { kind: 'table', byLevel: [{ level: 1, count: 4 }, { level: 5, count: 6 }, { level: 11, count: 8 }, { level: 17, count: 10 }] },
      recharge: 'encounter',
      display: 'pool',
      minLevel: 1,
      detail: (level) => `d${level >= 20 ? 8 : 6}`,
      note: 'The whole class runs on these, and they come back every fight rather than every rest - which is why there are not very many.',
    },
  ],
};

/**
 * Spells known, for the two that cast.
 *
 * Both are half casters on the known-spells model rather than preparers,
 * matching the Ranger's column, because a class that draws on somebody else's
 * list should not also get to prepare freely from it - the borrowed list is
 * already a generous starting point.
 */
export const FORGE_SPELLS_KNOWN: Record<string, number[]> = {
  //         1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20
  reckoner: [2, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9,10,10,11,11,12,12],
  harrier:  [2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9,10,10,11,11],
};

/**
 * The same counts again, as 2024's prepared column.
 *
 * §59.4, and it was a decision made by omission rather than on purpose: with
 * no row here, both classes used a *known* list under 2024 while every
 * published caster in that edition prepares from a printed column. A 2024
 * character who could not swap a spell on a long rest, in the edition whose
 * headline caster change is that everybody can, is the app quietly playing
 * 2014 rules under a 2024 heading.
 *
 * The numbers are their own 2014 columns rather than the borrowed class's.
 * Taking the Warlock's or the Ranger's 2024 prepared column would have handed
 * a half caster several more spells in one edition than the other for no
 * reason except which table was nearest - `drawsSpellsFrom` borrows *which*
 * spells exist, not how many you hold.
 */
export const FORGE_PREPARED_2024: Record<string, number[]> = {
  reckoner: FORGE_SPELLS_KNOWN.reckoner,
  harrier: FORGE_SPELLS_KNOWN.harrier,
};

/**
 * Cantrips, for the Reckoner alone.
 *
 * The other half of §59.4's omission, and the two classes land on opposite
 * answers for the same reason - what the borrowed list is made of.
 *
 * The **Reckoner** draws on the Warlock list, and a large share of that list's
 * usefulness before 5th level is its cantrips. Zero of them left a 1st-level
 * Reckoner with two spells, two slots and a rapier: a third of the list it was
 * given was unreachable. It gets the Warlock's own column.
 *
 * Eldritch Blast on a Reckoner is *not* Eldritch Blast on a Warlock, which is
 * what keeps this from being a free upgrade: Agonizing Blast is an invocation,
 * and the Reckoner has no invocations, so the beams carry no Charisma. At 5th
 * that is about 6.6 damage a round against the class's own 10.6 with a weapon
 * and a Reckoning die - a fallback at range rather than a replacement for the
 * class.
 *
 * The **Harrier** gets none, and that is not an oversight either. It draws on
 * the Ranger list, which has no cantrips at all in either edition; a cantrip
 * count would be a column with nothing to spend it on.
 */
export const FORGE_CANTRIPS_KNOWN: Record<string, number[]> = {
  //         1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20
  reckoner: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
};

/**
 * What each of the four starts with.
 *
 * Written by hand, which is a departure worth naming. `startingEquipment.ts`
 * is a *verified* table - it comes out of the SRD's structured data and the
 * audit diffs it against the source - and there is no source to diff these
 * against, because there is no book. So they are held here, beside the classes
 * they belong to, rather than mixed into a table whose whole value is that
 * everything in it was checked.
 *
 * The alternative was to ship four classes with no starting equipment, the way
 * the Artificer has none. That is right for the Artificer: it is a published
 * class whose kit exists in a book this project cannot read, and inventing one
 * would be putting words in Wizards of the Coast's mouth. It is wrong here -
 * these classes have no book, so there is nobody to misquote, and a class that
 * cannot tell a first-level player what they are holding is half a class.
 *
 * Each kit is priced against the published class it sits nearest: the Harrier
 * against the Ranger, the Marshal against the Fighter, the Reckoner and Adept
 * against the Warlock.
 */
export const FORGE_STARTING_EQUIPMENT: Record<string, {
  fixed: { index: string; name: string; quantity: number }[];
  groups: { desc: string; options: { items: { index: string; name: string; quantity: number }[]; picks: { label: string; categories: string[]; choose: number }[]; gold: number }[] }[];
}> = {
  reckoner: {
    fixed: [{ index: 'dagger', name: 'Dagger', quantity: 2 }, { index: 'scholars-pack', name: "Scholar's pack", quantity: 1 }],
    groups: [
      {
        desc: '(a) a rapier or (b) any simple weapon',
        options: [
          { items: [{ index: 'rapier', name: 'Rapier', quantity: 1 }], picks: [], gold: 0 },
          { items: [], picks: [{ label: 'any simple weapon', categories: ['simple-weapons'], choose: 1 }], gold: 0 },
        ],
      },
      {
        desc: '(a) leather armor or (b) a hand crossbow and 20 bolts',
        options: [
          { items: [{ index: 'leather-armor', name: 'Leather armor', quantity: 1 }], picks: [], gold: 0 },
          { items: [{ index: 'hand-crossbow', name: 'Hand crossbow', quantity: 1 }, { index: 'crossbow-bolt', name: 'Crossbow bolts', quantity: 20 }], picks: [], gold: 0 },
        ],
      },
    ],
  },

  harrier: {
    fixed: [{ index: 'explorers-pack', name: "Explorer's pack", quantity: 1 }],
    groups: [
      {
        desc: '(a) scale mail or (b) leather armor',
        options: [
          { items: [{ index: 'scale-mail', name: 'Scale mail', quantity: 1 }], picks: [], gold: 0 },
          { items: [{ index: 'leather-armor', name: 'Leather armor', quantity: 1 }], picks: [], gold: 0 },
        ],
      },
      {
        desc: '(a) a longbow and 20 arrows or (b) two martial weapons',
        options: [
          { items: [{ index: 'longbow', name: 'Longbow', quantity: 1 }, { index: 'arrow', name: 'Arrows', quantity: 20 }], picks: [], gold: 0 },
          { items: [], picks: [{ label: 'two martial weapons', categories: ['martial-weapons'], choose: 2 }], gold: 0 },
        ],
      },
      {
        desc: '(a) two shortswords or (b) two simple melee weapons',
        options: [
          { items: [{ index: 'shortsword', name: 'Shortsword', quantity: 2 }], picks: [], gold: 0 },
          { items: [], picks: [{ label: 'two simple melee weapons', categories: ['simple-melee-weapons'], choose: 2 }], gold: 0 },
        ],
      },
    ],
  },

  marshal: {
    fixed: [{ index: 'dungeoneers-pack', name: "Dungeoneer's pack", quantity: 1 }],
    groups: [
      {
        desc: '(a) chain mail or (b) leather armor, a longbow and 20 arrows',
        options: [
          { items: [{ index: 'chain-mail', name: 'Chain mail', quantity: 1 }], picks: [], gold: 0 },
          { items: [{ index: 'leather-armor', name: 'Leather armor', quantity: 1 }, { index: 'longbow', name: 'Longbow', quantity: 1 }, { index: 'arrow', name: 'Arrows', quantity: 20 }], picks: [], gold: 0 },
        ],
      },
      {
        desc: '(a) a martial weapon and a shield or (b) two martial weapons',
        options: [
          { items: [{ index: 'shield', name: 'Shield', quantity: 1 }], picks: [{ label: 'a martial weapon', categories: ['martial-weapons'], choose: 1 }], gold: 0 },
          { items: [], picks: [{ label: 'two martial weapons', categories: ['martial-weapons'], choose: 2 }], gold: 0 },
        ],
      },
      {
        desc: '(a) a horn or (b) a banner',
        options: [
          { items: [{ index: 'horn', name: 'Horn', quantity: 1 }], picks: [], gold: 0 },
          { items: [{ index: 'pole', name: 'Pole', quantity: 1 }], picks: [], gold: 0 },
        ],
      },
    ],
  },

  adept: {
    fixed: [
      { index: 'scholars-pack', name: "Scholar's pack", quantity: 1 },
      { index: 'quarterstaff', name: 'Quarterstaff', quantity: 1 },
    ],
    groups: [
      {
        desc: '(a) a dagger or (b) any simple weapon',
        options: [
          { items: [{ index: 'dagger', name: 'Dagger', quantity: 1 }], picks: [], gold: 0 },
          { items: [], picks: [{ label: 'any simple weapon', categories: ['simple-weapons'], choose: 1 }], gold: 0 },
        ],
      },
    ],
  },
};
