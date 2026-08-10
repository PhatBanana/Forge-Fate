import type { ClassId, Subclass } from '../../types';
import type { ClassFeature } from '../classFeatures';

/**
 * The app's own subclasses, and the count that decides how many there are.
 *
 * ## The problem this fixes
 *
 * Under 2024 the roster is flat: the Player's Handbook prints four per class
 * and the app carries exactly those four, so every 2024 character picks from
 * the same size list. Under 2014 it is not flat at all. Counted before this
 * file existed:
 *
 * ```
 * cleric 14 · wizard 13 · monk 10 · barbarian 9 · fighter 9 · paladin 9
 * rogue 9 · warlock 9 · bard 8 · ranger 8 · sorcerer 8 · druid 7 · artificer 4
 * ```
 *
 * A spread of ten between the top and the bottom, and it is not a judgement
 * about the classes - it is an accident of publishing. The Cleric got a domain
 * in nearly every book; the Artificer arrived late in one. A player choosing a
 * Druid or an Artificer sees a third of the choices a Cleric player sees, for
 * reasons that have nothing to do with either class.
 *
 * Published content cannot be cut, so the only lever is the floor. These
 * nineteen raise it.
 *
 * ## The arithmetic, which is the whole design
 *
 * Two targets, one per ruleset, and every row's `rulesets` tag is chosen to
 * hit both at once:
 *
 * - **2014**: no class below nine. That is the old median, so the classes that
 *   were already at or above it are not inflated to chase the Cleric - the
 *   goal is that nobody is starved, not that everybody is identical.
 * - **2024**: every class gains exactly one, so a roster that was flat at four
 *   is flat at five. Adding where 2014 needed it and nowhere else would have
 *   broken the one roster that was already balanced.
 *
 * Measured after, with the switch on:
 *
 * ```
 * 2014  artificer 9 · barbarian 10 · bard 9 · cleric 15 · druid 9 · fighter 10
 *       monk 11 · paladin 10 · ranger 9 · rogue 10 · sorcerer 10 · warlock 10
 *       wizard 14
 * 2024  five each, all twelve
 * ```
 *
 * A spread of six where it was ten, and a floor of nine where it was four. The
 * Cleric at fifteen and the Wizard at fourteen are still the tall ones and
 * always will be: those are published rows, and levelling *down* is not
 * something a reference tool gets to do. The Sorcerer is at ten rather than
 * nine because it earned a second - the class has no durable option worth the
 * name, and Draconic Bloodline is the game's own admission of it.
 *
 * `forge/forge.test.ts` measures both numbers rather than trusting this
 * comment, so a row added carelessly - one that leaves a class starved, or
 * that lands on only one of the two rulesets - fails the build.
 *
 * ## What they are not
 *
 * None of these is a reworded published subclass. Section 9 settled that: a
 * table that wants the Hexblade wants *the Hexblade*, and a renamed copy is
 * both useless to them and not ours to ship. Each of these covers ground the
 * printed list leaves empty - a Fighter who can actually hold a line, a Wild
 * Shape that stays useful past tier two, a Ranger who prepares the ground
 * before the fight rather than picking a favoured enemy at level one and
 * hoping. The design note on each row says which hole it fills.
 */

/** Terse constructor, matching `subclassFeatures.ts`. */
const f = (level: number, name: string, summary: string): ClassFeature => ({ level, name, summary });

interface ForgeSubclass {
  classId: ClassId;
  subclass: Subclass;
  features: ClassFeature[];
}

const BOTH: ('2014' | '2024')[] = ['2014', '2024'];

const ROWS: ForgeSubclass[] = [
  // ------------------------------------------------------------- artificer
  /*
    Five, because the Artificer had four and the Cleric had fourteen. It is
    the one class where the gap is not a matter of taste - a player picking it
    was choosing between four things while the player beside them chose
    between fourteen. All five are 2014-only because the class is: the 2024
    Player's Handbook does not carry an Artificer, so neither does the app.
  */
  {
    classId: 'artificer',
    subclass: {
      id: 'siegewright', name: 'Siegewright', source: 'Forge', level: 3,
      note: 'Builds ground rather than damage: deployable cover, a collapsing floor, a bridge where there was none. The Artillerist shoots; this one decides where the fight happens.',
      tags: ['controller'],
    },
    features: [
      f(3, 'Emplacement', 'Deploy a braced frame in a 5-foot space as an action. It is three-quarters cover, has AC 15 and hit points equal to five times your level, and you can fold it up and move it with a bonus action.'),
      f(3, 'Siege Tools', 'You are proficient with carpenter\'s and mason\'s tools, and you gain a set of each.'),
      f(5, 'Sapper\'s Eye', 'You know the weak point of any structure you study for a minute: its hit points, damage threshold and whichever damage type it is worst against.'),
      f(9, 'Shaped Charge', 'Once per short rest, collapse a 10-foot cube of floor, wall or ceiling. Creatures in it make a Dexterity save against your spell save DC or fall prone and take 4d10 bludgeoning.'),
      f(15, 'Fortify', 'At the start of a fight, your Emplacement expands to a 15-foot line and allies behind it have half cover without you spending anything.'),
    ],
  },
  {
    classId: 'artificer',
    subclass: {
      id: 'chirurgeon', name: 'Chirurgeon', source: 'Forge', level: 3,
      note: 'The Alchemist heals; this one works on the dying and the diseased. Reach a downed ally from across the room and end the conditions nothing else in the party can touch.',
      tags: ['support'],
    },
    features: [
      f(3, 'Field Kit', 'Proficiency and expertise with a healer\'s kit. As a bonus action you stabilise a creature you can see within 30 feet, no hands and no roll.'),
      f(3, 'Chirurgeon Spells', 'You always have prepared cure wounds, lesser restoration, revivify, death ward and greater restoration as they come online.'),
      f(5, 'Triage', 'When you heal a creature at 0 hit points, it also stands up and its speed is not reduced this turn.'),
      f(9, 'Transfer', 'As an action, move a condition - poisoned, paralysed, blinded, deafened - from an ally to yourself. You may end it on yourself with a save at the start of your turn.'),
      f(15, 'Nothing Dies On My Watch', 'Once per long rest, when a creature within 60 feet would drop to 0 hit points, it drops to 1 instead.'),
    ],
  },
  {
    classId: 'artificer',
    subclass: {
      id: 'cartwright', name: 'Cartwright', source: 'Forge', level: 3,
      note: 'A construct that carries the party rather than fights for it. Overland speed the game rarely gives anyone, and a moving platform to fight from.',
      tags: ['support'],
    },
    features: [
      f(3, 'The Rig', 'Build a construct vehicle that carries six. Speed 40 feet, AC 15, hit points equal to five times your level, and it repairs itself on a long rest.'),
      f(3, 'Driver', 'You can steer the Rig with a bonus action, and creatures aboard have half cover.'),
      f(5, 'All Terrain', 'The Rig ignores difficult terrain and can cross water and loose sand at full speed.'),
      f(9, 'Ramming Frame', 'Drive through a creature\'s space: Dexterity save against your spell save DC or take 3d10 bludgeoning and be knocked prone.'),
      f(15, 'Skyframe', 'The Rig gains a flying speed of 40 feet while it has hit points remaining.'),
    ],
  },
  {
    classId: 'artificer',
    subclass: {
      id: 'runescribe', name: 'Runescribe', source: 'Forge', level: 3,
      note: 'Infusions are things you make; runes are things that wait. You write conditions onto the party\'s gear and they fire without anyone spending an action - the most hands-off support in the class.',
      tags: ['support'],
    },
    features: [
      f(3, 'Scribed Runes', 'Write a rune on a weapon, shield or suit of armour. It carries a trigger - "when the wearer is hit", "when this weapon crits" - and an effect you choose from the rune list. You have two runes, rising to five.'),
      f(3, 'Arcane Shorthand', 'Proficiency with calligrapher\'s supplies, and you can copy any written magic in half the usual time.'),
      f(5, 'Standing Ward', 'One rune may be active on each ally at once rather than on one creature.'),
      f(9, 'Rewrite', 'As a bonus action, change which trigger a rune is watching for.'),
      f(15, 'Living Text', 'Once per long rest, a rune that fires does not spend itself.'),
    ],
  },
  {
    classId: 'artificer',
    subclass: {
      id: 'voltaic', name: 'Voltaic', source: 'Forge', level: 3,
      note: 'A capacitor with legs: it stores what hits you and gives it back. The only Artificer built to be attacked, and the numbers reward standing in front.',
      tags: ['tank'],
    },
    features: [
      f(3, 'Charge', 'When you take damage you gain charge equal to half of it, up to a maximum of five times your level. Charge empties on a long rest.'),
      f(3, 'Discharge', 'As an action, spend charge to deal that much lightning damage in a 15-foot cone, Dexterity save for half.'),
      f(5, 'Grounding', 'Resistance to lightning damage, and you cannot be knocked prone while you hold any charge.'),
      f(9, 'Overflow', 'When you would exceed your charge maximum, the excess arcs to the nearest hostile creature within 30 feet as lightning damage.'),
      f(15, 'Live Frame', 'Any creature that hits you with a melee attack while you hold charge takes 2d8 lightning damage.'),
    ],
  },

  // ------------------------------------------------------------- barbarian
  {
    classId: 'barbarian',
    subclass: {
      id: 'undertow', name: 'Path of the Undertow', rulesets: BOTH, source: 'Forge', level: 3,
      note: 'The grappling Barbarian the rules always implied and never printed. Rage extends your reach for grabbing, and dragging someone costs you nothing - a real controller in a class that only has tanks and damage.',
      tags: ['controller', 'tank'],
    },
    features: [
      f(3, 'Undertow', 'While raging, your reach for grappling and shoving is 10 feet, and moving a creature you have grappled costs you no extra movement.'),
      f(3, 'Riptide', 'When you hit a creature you are grappling, you may move it 5 feet without provoking opportunity attacks.'),
      f(6, 'Deep Water', 'Advantage on Strength (Athletics) checks to grapple, and creatures you grapple have disadvantage on their escape checks while you rage.'),
      f(10, 'Drag Under', 'A creature you grapple has its speed reduced to 0 and cannot benefit from a flying speed.'),
      f(14, 'Pulled Down', 'When you knock a creature prone while raging, it takes bludgeoning damage equal to your rage damage bonus plus your Strength modifier.'),
    ],
  },

  // ------------------------------------------------------------------ bard
  {
    classId: 'bard',
    subclass: {
      id: 'marching-song', name: 'College of the Marching Song', rulesets: BOTH, source: 'Forge', level: 3,
      note: 'Inspiration spent on position rather than on a roll. No published Bard moves the party, and moving the party is the strongest thing a support character can do.',
      tags: ['support', 'controller'],
    },
    features: [
      f(3, 'Marching Song', 'As a bonus action, spend a Bardic Inspiration die: every ally within 30 feet may immediately move up to that many times 5 feet without provoking opportunity attacks.'),
      f(3, 'Set the Pace', 'The party ignores the first hour of forced march exhaustion each day, and your group\'s travel pace counts as one step faster.'),
      f(6, 'Countermarch', 'As a reaction when an ally within 30 feet is hit, spend a die: they may move up to 10 feet before the damage is rolled, and if that takes them out of range the attack misses.'),
      f(14, 'Rout', 'Spend a die as an action: each hostile creature within 30 feet makes a Wisdom save against your spell save DC or must use its next turn moving away from you by the safest route.'),
    ],
  },

  // ---------------------------------------------------------------- cleric
  {
    classId: 'cleric',
    subclass: {
      id: 'threshold', name: 'Threshold Domain', rulesets: BOTH, source: 'Forge', level: 1,
      note: 'A god of doors, thresholds and what may not cross them. Draws lines on the battlefield that hold - the only domain whose whole identity is denying ground rather than holding it.',
      tags: ['controller', 'medium-armor'],
    },
    features: [
      f(1, 'Warded Line', 'As a bonus action, draw a 15-foot line of warding on the ground. It lasts one minute. A hostile creature that tries to cross makes a Wisdom save against your spell save DC or its movement ends. Uses equal to your proficiency bonus, back on a long rest.'),
      f(1, 'Domain Spells', 'You always have prepared alarm, arcane lock, glyph of warding, guardian of faith and wall of force as they come online.'),
      f(2, 'Channel Divinity: Barred', 'A door, window or portal you touch cannot be opened, broken or teleported through for ten minutes except by you.'),
      f(6, 'Both Sides', 'Your Warded Line may instead keep a creature *in*: choose which direction it denies when you draw it.'),
      f(8, 'Divine Strike', 'Once per turn, your weapon attacks deal an extra 1d8 force damage, rising to 2d8 at 14th level.'),
      f(17, 'Sealed', 'Your Warded Line becomes a 30-foot line, and a creature that fails its save is also restrained until the end of its next turn.'),
    ],
  },

  // ----------------------------------------------------------------- druid
  {
    classId: 'druid',
    subclass: {
      id: 'circle-of-stone', name: 'Circle of Stone', rulesets: BOTH, source: 'Forge', level: 2,
      note: 'Wild Shape as armour rather than as a new body. Fixes the thing every non-Moon Druid complains about: a form whose hit points stop mattering at tier two. This one scales with your level and never takes your spellcasting away.',
      tags: ['tank'],
    },
    features: [
      f(2, 'Stone Skin', 'Spend a use of Wild Shape as a bonus action to sheathe yourself in stone for ten minutes instead of transforming. You gain temporary hit points equal to three times your Druid level, your unarmed strikes deal 1d8 bludgeoning, and you keep your hands, your voice and your spells.'),
      f(2, 'Weight', 'While sheathed, you have advantage on saves against being moved, knocked prone or grappled.'),
      f(6, 'Grinding Stone', 'While sheathed, your unarmed strikes count as magical and deal an extra 1d8 bludgeoning to a creature you have already hit this turn.'),
      f(10, 'Bedrock', 'While sheathed, you have resistance to bludgeoning, piercing and slashing damage from nonmagical attacks.'),
      f(14, 'Mountain Answers', 'When your temporary hit points from Stone Skin are reduced to 0, the ground within 15 feet erupts: Dexterity save against your spell save DC or 4d8 bludgeoning and knocked prone.'),
    ],
  },
  {
    classId: 'druid',
    subclass: {
      id: 'circle-of-the-tide', name: 'Circle of the Tide', source: 'Forge', level: 2,
      note: 'Battlefield control made of moving water. Difficult terrain that goes where you send it, and forced movement without concentration - the Shepherd summons, this one rearranges.',
      tags: ['controller'],
    },
    features: [
      f(2, 'Tidewater', 'As an action, conjure a 20-foot square of shallow water. It is difficult terrain for your enemies and not for your allies, and you may move it 15 feet as a bonus action on your turn. It lasts one minute and needs no concentration.'),
      f(2, 'Circle Spells', 'You always have prepared create or destroy water, gust of wind, tidal wave, control water and maelstrom as they come online.'),
      f(6, 'Undertow', 'A creature that starts its turn in your Tidewater makes a Strength save against your spell save DC or is pulled 10 feet toward the centre.'),
      f(10, 'Breathe Deep', 'You and allies in your Tidewater can breathe water and have a swimming speed equal to your walking speed.'),
      f(14, 'Spring Tide', 'Your Tidewater becomes a 40-foot square, and a creature that fails its Undertow save is also knocked prone.'),
    ],
  },

  // --------------------------------------------------------------- fighter
  {
    classId: 'fighter',
    subclass: {
      id: 'warden', name: 'Warden', rulesets: BOTH, source: 'Forge', level: 3,
      note: 'The sticky defender 5e never printed. Marking an enemy makes ignoring you expensive, which is the one thing a tank needs and the one thing no published Fighter reliably has - the Cavalier gets close and spends half its text on a horse.',
      tags: ['tank', 'controller'],
    },
    features: [
      f(3, 'Warden\'s Mark', 'As a bonus action, mark a creature you can see within 30 feet for one minute. While marked, it has disadvantage on attack rolls against anyone but you.'),
      f(3, 'Sentinel Stance', 'When a marked creature within 5 feet attacks an ally, you may use your reaction to make a melee attack against it, and its speed becomes 0 until the end of its turn.'),
      f(7, 'Hold the Line', 'Marked creatures treat every square within 5 feet of you as difficult terrain.'),
      f(10, 'Immovable', 'Advantage on saves against being moved or knocked prone, and you cannot be forced to move by a marked creature.'),
      f(15, 'Two Fronts', 'You may have two creatures marked at once.'),
      f(18, 'Nobody Passes', 'A marked creature that ends its turn more than 30 feet from you takes 3d8 force damage.'),
    ],
  },

  // ------------------------------------------------------------------ monk
  {
    classId: 'monk',
    subclass: {
      id: 'iron-root', name: 'Way of the Iron Root', rulesets: BOTH, source: 'Forge', level: 3,
      note: 'A Monk that plants and holds. Every published Monk is built on movement, so the stance Monk - trade your feet for damage reduction and reach - is a whole design space nobody has used.',
      tags: ['tank'],
    },
    features: [
      f(3, 'Rooted Stance', 'As a bonus action, take the stance. Your speed becomes 0 and you cannot be moved against your will, your unarmed reach is 10 feet, and you reduce all damage you take by your Wisdom modifier. Ends when you choose or when you are knocked unconscious.'),
      f(3, 'Iron Root', 'While in the stance, you may spend 1 ki as a reaction to make an unarmed strike against a creature that enters your reach.'),
      f(6, 'Deep Root', 'While in the stance, your unarmed strikes count as magical and you have advantage on saves against being frightened or charmed.'),
      f(11, 'Split the Ground', 'Spend 2 ki while in the stance: every creature within 10 feet makes a Dexterity save against your ki save DC or takes your Martial Arts die in bludgeoning and is knocked prone.'),
      f(17, 'Older Than the Mountain', 'While in the stance, a critical hit against you becomes an ordinary hit.'),
    ],
  },

  // --------------------------------------------------------------- paladin
  {
    classId: 'paladin',
    subclass: {
      id: 'oath-of-the-wanderer', name: 'Oath of the Wanderer', rulesets: BOTH, source: 'Forge', level: 3,
      note: 'A Paladin who is not a wall. Auras are the class\'s best feature and its worst problem - they only help what is standing next to you, and Paladins are slow. This oath makes the aura travel and lets you go get people.',
      tags: ['support'],
    },
    features: [
      f(3, 'Channel Divinity: Take the Road', 'You and every ally in your aura gain 15 feet of speed and ignore difficult terrain for one minute.'),
      f(3, 'Channel Divinity: Come Here', 'As an action, teleport to an unoccupied space you can see within 60 feet, bringing one willing ally who was in your aura.'),
      f(3, 'Oath Spells', 'You always have prepared longstrider, misty step, haste, dimension door and far step as they come online.'),
      f(7, 'Aura of the Open Road', 'Allies in your aura cannot be slowed, restrained or paralysed by any effect that allows a saving throw - they may repeat that save at the start of each of their turns.'),
      f(15, 'Never Cornered', 'When you are hit by an attack, you may use your reaction to teleport up to 30 feet after the damage is rolled; the attacker cannot use its reaction against your departure.'),
      f(20, 'The Long Way Round', 'For one minute, your aura extends to 60 feet and every ally in it has a flying speed equal to their walking speed. Once per long rest.'),
    ],
  },

  // ---------------------------------------------------------------- ranger
  {
    classId: 'ranger',
    subclass: {
      id: 'trapper', name: 'Trapper', rulesets: BOTH, source: 'Forge', level: 3,
      note: 'The Ranger who arrives first and prepares the ground. Favored Enemy asks you to guess at level one what you will fight; this asks you what the room looks like, which is a question you can actually answer.',
      tags: ['controller'],
    },
    features: [
      f(3, 'Set Snares', 'During a short or long rest, set a number of snares equal to your proficiency bonus in spaces you can reach. A snare triggers when a hostile creature enters it: Dexterity save against your spell save DC or take 2d6 piercing and be restrained until it escapes.'),
      f(3, 'Ready Ground', 'You may spend one minute to move all your unspent snares to new spaces within 60 feet.'),
      f(7, 'Cruel Ground', 'Your snares deal 4d6 and a creature restrained by one has disadvantage on attack rolls.'),
      f(11, 'Quick Set', 'As a bonus action in combat, set one snare in a space within 30 feet.'),
      f(15, 'The Whole Room', 'Creatures cannot detect your snares with passive Perception, and finding one requires a Wisdom (Perception) check against your spell save DC.'),
    ],
  },

  // ----------------------------------------------------------------- rogue
  {
    classId: 'rogue',
    subclass: {
      id: 'saboteur', name: 'Saboteur', rulesets: BOTH, source: 'Forge', level: 3,
      note: 'A Rogue who breaks the room rather than the person in it. Sneak Attack against objects and structures, charges that go off later, and the only reliable answer in the class to a fight you cannot win by stabbing.',
      tags: ['controller'],
    },
    features: [
      f(3, 'Demolitions', 'Proficiency and expertise with tinker\'s tools. You may apply Sneak Attack to an attack against an object or structure, and you ignore its damage threshold.'),
      f(3, 'Set Charge', 'As an action, place a charge on a surface or object. Detonate it as a bonus action at any time in the next hour: 15-foot radius, Dexterity save against 8 + your proficiency bonus + your Dexterity modifier, 3d6 fire and thunder, half on a success. The damage rises with your Sneak Attack.'),
      f(9, 'Cut the Supports', 'When your charge destroys a load-bearing object, creatures within 10 feet are knocked prone and the space becomes difficult terrain.'),
      f(13, 'Two Fuses', 'You may have two charges placed at once and detonate them independently.'),
      f(17, 'Bring It Down', 'Your charges deal double damage to objects and structures, and once per long rest a charge deals its full damage with no save.'),
    ],
  },

  // -------------------------------------------------------------- sorcerer
  {
    classId: 'sorcerer',
    subclass: {
      id: 'loomwarden', name: 'Loomwarden', rulesets: BOTH, source: 'Forge', level: 1,
      note: 'Sorcery point spent on other people\'s dice. The Divination Wizard replaces rolls with numbers decided this morning; this reacts to the roll in front of you, which is a different and rarer thing.',
      tags: ['support', 'controller'],
    },
    features: [
      f(1, 'Read the Thread', 'When a creature within 60 feet makes an attack roll, save or ability check, you may spend 1 sorcery point as a reaction to add or subtract your Charisma modifier from it, after the roll and before the outcome.'),
      f(1, 'Origin Spells', 'You always have known bless, bane, enhance ability, bestow curse and greater restoration, and they do not count against your spells known.'),
      f(6, 'Crossed Threads', 'Spend 3 sorcery points to swap two d20 results rolled this round by two creatures you can see.'),
      f(14, 'Fray', 'When a creature within 60 feet scores a critical hit, you may spend 3 sorcery points as a reaction to make it an ordinary hit.'),
      f(18, 'Cut and Retie', 'Once per long rest, force a creature within 60 feet to reroll any d20 and take the new result.'),
    ],
  },
  {
    classId: 'sorcerer',
    subclass: {
      id: 'ironblood', name: 'Ironblood', source: 'Forge', level: 1,
      note: 'The durable Sorcerer. Draconic Bloodline is the class\'s attempt at this and it is famously dull - a hit point and a fixed AC. This one is built to be in the fight: armour that comes off your sorcery points, and reach.',
      tags: ['tank', 'gish'],
      abilityPriority: { str: 1, con: 2 },
    },
    features: [
      f(1, 'Iron Skin', 'Your armour class is 13 + your Constitution modifier while you wear no armour, and you are proficient with simple and martial melee weapons.'),
      f(1, 'Hardened', 'Spend 1 sorcery point as a reaction when you take damage to reduce it by 1d8 plus your Charisma modifier.'),
      f(6, 'Iron Reach', 'Your melee weapon attacks have 10 feet of reach, and once per turn a hit deals an extra 1d6 force damage.'),
      f(14, 'Blood of the Forge', 'Resistance to bludgeoning, piercing and slashing damage while you have at least 1 sorcery point remaining.'),
      f(18, 'Unyielding', 'When you drop to 0 hit points, you may spend 5 sorcery points to drop to 1 instead. Once per long rest.'),
    ],
  },

  // --------------------------------------------------------------- warlock
  {
    classId: 'warlock',
    subclass: {
      id: 'cartographer', name: 'The Cartographer', rulesets: BOTH, source: 'Forge', level: 1,
      note: 'A patron that is a place rather than a person. Every published patron is a being you bargained with; this one is a map that is still being drawn, and it pays in shortcuts.',
      tags: ['stealth', 'support'],
    },
    features: [
      f(1, 'Survey', 'You always know which way is north and how far you have travelled. As an action you learn the layout of your surroundings out to 300 feet, including doors, stairs and open ground, though not what occupies them.'),
      f(1, 'Expanded Spells', 'longstrider and jump; misty step and pass without trace; fly and sending; dimension door and locate creature; teleportation circle and passwall.'),
      f(6, 'Fold the Page', 'As a bonus action, teleport up to 30 feet to a space you have seen since the fight began. Uses equal to your proficiency bonus, back on a short rest.'),
      f(10, 'No Blank Spaces', 'You cannot become lost by nonmagical means, and you have advantage on saves against illusions and against being moved against your will.'),
      f(14, 'Redraw', 'As an action, swap the positions of two creatures you can see within 60 feet. An unwilling creature may make a Charisma save against your spell save DC. Once per long rest.'),
    ],
  },

  // ---------------------------------------------------------------- wizard
  {
    classId: 'wizard',
    subclass: {
      id: 'resonance', name: 'School of Resonance', rulesets: BOTH, source: 'Forge', level: 2,
      note: 'A Wizard whose spells make the next caster\'s better. Thirteen published schools and not one of them is a support caster for other casters - the only party-facing Wizard is Abjuration, and that is a personal shield.',
      tags: ['support'],
    },
    features: [
      f(2, 'Resonance', 'When you cast a spell of 1st level or higher, the next spell cast by an ally within 30 feet before the start of your next turn deals an extra 1d6 damage per level of your spell, or heals that much.'),
      f(2, 'Sympathetic Study', 'You may copy a spell into your spellbook from a scroll or book of any class\'s list if a member of your party can cast it, at the usual cost.'),
      f(6, 'Shared Focus', 'As a reaction when an ally within 30 feet makes a concentration save, they may use your Intelligence modifier instead of their own.'),
      f(10, 'Second Voice', 'Once per short rest, when an ally within 30 feet casts a spell that targets one creature, it targets a second creature within 30 feet of the first.'),
      f(14, 'Chorus', 'Once per long rest, when an ally within 30 feet casts a spell of 3rd level or higher, they cast it as though from a slot one level higher.'),
    ],
  },
];

/** The subclass rows, grouped for `classes.ts` to fold into each class. */
export const FORGE_SUBCLASSES_BY_CLASS: Partial<Record<ClassId, Subclass[]>> = ROWS.reduce(
  (map, row) => {
    (map[row.classId] ??= []).push(row.subclass);
    return map;
  },
  {} as Partial<Record<ClassId, Subclass[]>>,
);

/** The display half, in the shape `subclassFeatures.ts` exports. */
export const FORGE_SUBCLASS_FEATURES: Record<string, ClassFeature[]> = Object.fromEntries(
  ROWS.map((row) => [row.subclass.id, row.features]),
);
