import type { CharClass, ClassId, Ruleset, SkillChoice, Subclass } from '../types';
import { ALL_SKILL_IDS } from './skills';
import { isOriginal } from './sources';
import type { Source } from './sources';

const STANDARD_ASI = [4, 8, 12, 16, 19];

/**
 * abilityPriority is the engine's view of what a class actually needs:
 *   3 = primary (attack/save DC), 2 = important, 1 = useful, 0 = safe dump.
 * Subclasses can override individual entries where they change the math
 * (e.g. Eldritch Knight wants INT, Bladesinger wants DEX).
 */
export const CLASSES: CharClass[] = [
  {
    id: 'artificer',
    name: 'Artificer',
    // Not in the 2024 Player's Handbook.
    rulesets: ['2014'],
    source: 'TCoE',
    hitDie: 8,
    abilityPriority: { str: 0, dex: 2, con: 2, int: 3, wis: 1, cha: 0 },
    saves: ['con', 'int'],
    asiLevels: STANDARD_ASI,
    castingType: 'half',
    castingAbility: 'int',
    // TCoE's two Artificer-only departures from the half-caster rules. See
    // `CharClass` for what each one costs when it is missing; both were.
    castsFromLevel1: true,
    multiclassRoundsUp: true,
    armor: 'Light, medium, shields',
    armorProficiency: ['light', 'medium', 'shield'],
    weapons: 'Simple',
    weaponProficiency: { categories: ['simple'] },
    defaultWeaponStyle: 'spell',
    multiclass: { armor: ['light', 'medium', 'shield'] },
    skillChoices: { count: 2, from: ['arcana', 'history', 'investigation', 'medicine', 'nature', 'perception', 'sleight-of-hand'] },
    subclasses: [
      { id: 'alchemist', name: 'Alchemist', source: 'TCoE', level: 3, note: 'The weakest subclass; healing and a small damage bump. Playable, not optimal.', tags: ['support'] },
      { id: 'armorer', name: 'Armorer', source: 'TCoE', level: 3, note: 'Guardian model is a genuine tank with built-in Extra Attack; Infiltrator is a solid ranged damage dealer.', tags: ['heavy-armor', 'tank'], armorProficiency: ['heavy'] },
      { id: 'artillerist', name: 'Artillerist', source: 'TCoE', level: 3, note: 'Eldritch Cannon is free action-economy every turn. The strongest damage Artificer.', tags: ['blaster'] },
      { id: 'battle-smith', name: 'Battle Smith', source: 'TCoE', level: 3, features: [{ level: 5, name: 'Extra Attack', summary: 'Attack twice with the Attack action.', tags: ['extra-attack'] }], weaponProficiency: { categories: ['martial'] }, note: 'Best-in-class: Extra Attack, INT-based weapon attacks, and a Steel Defender that soaks and reacts.', tags: ['gish', 'martial-weapons'] },
    ],
    note: 'Half caster with infusions - permanent magic items for the whole party. Battle Smith is the strongest build.',
  },
  {
    id: 'barbarian',
    name: 'Barbarian',
    source: 'PHB',
    hitDie: 12,
    abilityPriority: { str: 3, dex: 1, con: 2, int: 0, wis: 1, cha: 0 },
    saves: ['str', 'con'],
    asiLevels: STANDARD_ASI,
    castingType: 'none',
    armor: 'Light, medium, shields',
    armorProficiency: ['light', 'medium', 'shield'],
    weapons: 'Simple, martial',
    weaponProficiency: { categories: ['simple', 'martial'] },
    masteries: [{ level: 1, count: 2 }, { level: 4, count: 1 }, { level: 10, count: 1 }],
    defaultWeaponStyle: 'str-melee',
    multiclass: { armor: ['shield'], weapons: { categories: ['simple', 'martial'] } },
    skillChoices: { count: 2, from: ['animal-handling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'] },
    multiclassPrereq: { abilities: [{ ability: 'str', min: 13 }], mode: 'all' },
    subclasses: [
      { id: 'ancestral-guardian', name: 'Path of the Ancestral Guardian', source: 'XGtE', level: 3, note: 'The best tank in 5e - you impose disadvantage and halve damage to allies without spending anything.', tags: ['tank'] },
      { id: 'battlerager', name: 'Path of the Battlerager', source: 'SCAG', level: 3, note: 'Locked to spiked armor and dwarves, and the damage is poor. Skip.', tags: [] },
      { id: 'beast', name: 'Path of the Beast', source: 'TCoE', level: 3, note: 'Bite/claws/tail give flexible damage and a reaction AC bump. Solid but not spectacular.', tags: [] },
      { id: 'berserker', name: 'Path of the Berserker', rulesets: ['2014', '2024'], source: 'PHB', level: 3, note: 'Frenzy costs exhaustion, which is a trap in most campaigns. Take Zealot instead.', tags: [] },
      { id: 'storm-herald', name: 'Path of the Storm Herald', source: 'XGtE', level: 3, note: 'Aura damage is low and it competes with your own positioning. Mostly flavour.', tags: [] },
      { id: 'totem-warrior', name: 'Path of the Totem Warrior', rulesets: ['2014', '2024'], nameIn2024: 'Path of the Wild Heart', source: 'PHB', level: 3, note: 'Bear totem at level 3 is resistance to everything but psychic while raging. The classic tank pick.', tags: ['tank'] },
      { id: 'wild-magic-barb', name: 'Path of Wild Magic', source: 'TCoE', level: 3, note: 'Random effects plus a strong party-wide advantage feature at 6. Fun, medium power.', tags: ['support'] },
      { id: 'world-tree', name: 'Path of the World Tree', rulesets: ['2024'], source: 'PHB 2024', level: 3, note: 'Temporary hit points on every rage and a teleport that drags an enemy with you. A durable, controlling Barbarian.', tags: ['tank'] },
      { id: 'giant', name: 'Path of the Giant', source: 'BGtG', level: 3, note: 'Grow Large while raging, with elemental damage and a thrown-weapon build that actually works.', tags: [] },
      { id: 'zealot', name: 'Path of the Zealot', rulesets: ['2014', '2024'], source: 'XGtE', level: 3, note: 'Free extra damage on every rage, and you literally cannot die while raging. Best damage Barbarian.', tags: [] },
    ],
    note: 'Rage gives resistance to physical damage and damage bonuses. Needs both STR and CON; unarmored defense wants DEX 14 too.',
  },
  {
    id: 'bard',
    name: 'Bard',
    source: 'PHB',
    hitDie: 8,
    abilityPriority: { str: 0, dex: 2, con: 2, int: 1, wis: 1, cha: 3 },
    saves: ['dex', 'cha'],
    asiLevels: STANDARD_ASI,
    castingType: 'full',
    castingAbility: 'cha',
    armor: 'Light',
    armorProficiency: ['light'],
    weapons: 'Simple, hand crossbow, longsword, rapier, shortsword',
    weaponProficiency: { categories: ['simple'], specific: ['hand-crossbow', 'longsword', 'rapier', 'shortsword'] },
    defaultWeaponStyle: 'spell',
    skillChoices: { count: 3, from: ALL_SKILL_IDS },
    multiclass: { skills: { count: 1, from: ALL_SKILL_IDS }, armor: ['light'] },
    multiclassPrereq: { abilities: [{ ability: 'cha', min: 13 }], mode: 'all' },
    subclasses: [
      { id: 'creation', name: 'College of Creation', source: 'TCoE', level: 3, note: 'Animating objects and free items. Quirky, fine.', tags: ['support'] },
      { id: 'dance', name: 'College of Dance', rulesets: ['2024'], source: 'PHB 2024', level: 3, note: 'Unarmored Defense on Dexterity and Charisma, a d6 unarmed strike, and mobility. The Bard answer to a Monk.', tags: ['gish'], abilityPriority: { dex: 2 } },
      { id: 'eloquence', name: 'College of Eloquence', source: 'TCoE', level: 3, note: 'Bardic Inspiration that can never be wasted, plus unfailable social checks. Arguably the strongest Bard.', tags: ['support', 'controller'] },
      { id: 'glamour', name: 'College of Glamour', rulesets: ['2014', '2024'], source: 'XGtE', level: 3, note: 'Mantle of Inspiration is strong early temp HP and free movement.', tags: ['support'] },
      { id: 'lore', name: 'College of Lore', rulesets: ['2014', '2024'], source: 'PHB', level: 3, note: 'Cutting Words and Magical Secrets at 6. The default full-caster Bard.', tags: ['controller', 'support'] },
      { id: 'spirits', name: 'College of Spirits', source: 'VRGtR', level: 3, note: 'Random but powerful table of effects. Medium power, high fun.', tags: ['support'] },
      { id: 'swords', name: 'College of Swords', source: 'XGtE', level: 3, features: [{ level: 6, name: 'Extra Attack', summary: 'Attack twice with the Attack action.', tags: ['extra-attack'] }], note: 'Extra Attack and Blade Flourishes make a real melee Bard. Wants DEX and medium armor.', tags: ['gish', 'medium-armor'], abilityPriority: { dex: 3 }, armorProficiency: ['medium'] },
      { id: 'valor', name: 'College of Valor', rulesets: ['2014', '2024'], source: 'PHB', level: 3, features: [{ level: 6, name: 'Extra Attack', summary: 'Attack twice with the Attack action.', tags: ['extra-attack'] }], weaponProficiency: { categories: ['martial'] }, note: 'Extra Attack, martial weapons and shields, but weaker than Swords for most builds.', tags: ['gish', 'medium-armor'], abilityPriority: { dex: 3 }, armorProficiency: ['medium', 'shield'] },
      { id: 'whispers', name: 'College of Whispers', source: 'XGtE', level: 3, note: 'Psychic Blades adds damage but eats your inspiration dice.', tags: ['stealth'] },
    ],
    note: 'Full caster, best skill monkey, and Magical Secrets lets it steal any spell in the game. CHA is everything.',
  },
  {
    id: 'cleric',
    name: 'Cleric',
    source: 'PHB',
    hitDie: 8,
    abilityPriority: { str: 1, dex: 1, con: 2, int: 0, wis: 3, cha: 0 },
    saves: ['wis', 'cha'],
    asiLevels: STANDARD_ASI,
    castingType: 'full',
    castingAbility: 'wis',
    armor: 'Light, medium, shields (heavy for some domains)',
    armorProficiency: ['light', 'medium', 'shield'],
    weapons: 'Simple',
    weaponProficiency: { categories: ['simple'] },
    defaultWeaponStyle: 'spell',
    multiclass: { armor: ['light', 'medium', 'shield'] },
    skillChoices: { count: 2, from: ['history', 'insight', 'medicine', 'persuasion', 'religion'] },
    multiclassPrereq: { abilities: [{ ability: 'wis', min: 13 }], mode: 'all' },
    subclasses: [
      { id: 'arcana', name: 'Arcana Domain', source: 'SCAG', level: 1, note: 'Wizard cantrips and spells on a WIS chassis. Strong if allowed.', tags: ['blaster'] },
      { id: 'death', name: 'Death Domain', source: 'DMG', level: 1, note: 'Necromantic damage focus; DMG subclass, often not allowed.', tags: ['blaster'] },
      { id: 'forge', name: 'Forge Domain', source: 'XGtE', level: 1, note: 'Heavy armor, +1 AC, and a free +1 weapon at level 1. Best AC in the game early.', tags: ['heavy-armor', 'tank'], abilityPriority: { str: 2 }, armorProficiency: ['heavy'] },
      { id: 'grave', name: 'Grave Domain', source: 'XGtE', level: 1, note: 'Path to the Grave doubles the party\'s damage on a target. Excellent support.', tags: ['support', 'controller'] },
      { id: 'knowledge', name: 'Knowledge Domain', source: 'PHB', level: 1, note: 'Great out of combat, weak in it.', tags: [] },
      { id: 'life', name: 'Life Domain', rulesets: ['2014', '2024'], source: 'PHB', level: 1, note: 'Heavy armor and the best healing in the game. The safe, strong pick.', spells: [
        { level: 1, ids: ['bless', 'cure-wounds'] },
        { level: 3, ids: ['lesser-restoration', 'spiritual-weapon'] },
        { level: 5, ids: ['beacon-of-hope', 'revivify'] },
        { level: 7, ids: ['death-ward', 'guardian-of-faith'] },
        { level: 9, ids: ['mass-cure-wounds', 'raise-dead'] },
      ], tags: ['heavy-armor', 'support'], abilityPriority: { str: 2 }, armorProficiency: ['heavy'] },
      { id: 'light', name: 'Light Domain', rulesets: ['2014', '2024'], source: 'PHB', level: 1, note: 'Warding Flare plus Fireball on a Cleric list. Best blaster Cleric.', tags: ['blaster'] },
      { id: 'nature', name: 'Nature Domain', source: 'PHB', level: 1, note: 'Heavy armor, druid cantrips, some control.', tags: ['heavy-armor'], abilityPriority: { str: 2 }, armorProficiency: ['heavy'] },
      { id: 'order', name: 'Order Domain', source: 'TCoE', level: 1, note: 'Voice of Authority hands out free attacks every time you buff an ally. Superb.', tags: ['heavy-armor', 'support'], abilityPriority: { str: 2 }, armorProficiency: ['heavy'] },
      { id: 'peace', name: 'Peace Domain', source: 'TCoE', level: 1, note: 'Emboldening Bond is close to broken - the whole party gets bonus dice all day.', tags: ['support'] },
      { id: 'tempest', name: 'Tempest Domain', source: 'PHB', level: 1, note: 'Heavy armor and maximised lightning damage. Fun nova.', tags: ['heavy-armor'], abilityPriority: { str: 2 }, armorProficiency: ['heavy'] },
      { id: 'trickery', name: 'Trickery Domain', rulesets: ['2014', '2024'], source: 'PHB', level: 1, note: 'Blessing of the Trickster is nice, the rest is thin.', tags: ['stealth'] },
      { id: 'twilight', name: 'Twilight Domain', source: 'TCoE', level: 1, note: 'Heavy armor, 300 ft. darkvision for the party, and a temp HP aura every round. The strongest Cleric domain printed.', tags: ['heavy-armor', 'support', 'tank'], abilityPriority: { str: 2 }, armorProficiency: ['heavy'] },
      { id: 'war', name: 'War Domain', rulesets: ['2014', '2024'], source: 'PHB', level: 1, note: 'Heavy armor plus bonus action attacks. The melee Cleric.', tags: ['heavy-armor', 'martial-weapons'], abilityPriority: { str: 2 }, armorProficiency: ['heavy'] },
    ],
    note: 'Full caster with the best defensive spell list. Domain decides whether you are a backline caster or a heavy-armor frontliner.',
  },
  {
    id: 'druid',
    name: 'Druid',
    source: 'PHB',
    hitDie: 8,
    abilityPriority: { str: 0, dex: 2, con: 2, int: 1, wis: 3, cha: 0 },
    saves: ['int', 'wis'],
    asiLevels: STANDARD_ASI,
    castingType: 'full',
    castingAbility: 'wis',
    armor: 'Light, medium, shields (non-metal by tradition)',
    armorProficiency: ['light', 'medium', 'shield'],
    weapons: 'Clubs, daggers, darts, javelins, maces, quarterstaffs, scimitars, sickles, slings, spears',
    weaponProficiency: { categories: [], specific: ['club', 'dagger', 'dart', 'javelin', 'mace', 'quarterstaff', 'scimitar', 'sickle', 'sling', 'spear'] },
    defaultWeaponStyle: 'spell',
    multiclass: { armor: ['light', 'medium', 'shield'] },
    skillChoices: { count: 2, from: ['animal-handling', 'arcana', 'insight', 'medicine', 'nature', 'perception', 'religion', 'survival'] },
    multiclassPrereq: { abilities: [{ ability: 'wis', min: 13 }], mode: 'all' },
    subclasses: [
      { id: 'dreams', name: 'Circle of Dreams', source: 'XGtE', level: 2, note: 'Short-rest healing and party travel utility. Solid support.', tags: ['support'] },
      { id: 'land', name: 'Circle of the Land', rulesets: ['2014', '2024'], source: 'PHB', level: 2, note: 'Free spells and recovered slots. The default caster Druid.', tags: ['controller'] },
      { id: 'moon', name: 'Circle of the Moon', rulesets: ['2014', '2024'], source: 'PHB', level: 2, note: 'Combat Wild Shape - a level 2 Druid can be a brown bear. Falls off after tier 2 but dominates early.', tags: ['tank'] },
      { id: 'sea', name: 'Circle of the Sea', rulesets: ['2024'], source: 'PHB 2024', level: 3, note: 'A persistent aura of cold, lightning and thunder damage that costs no concentration once started. Strong and low-effort.', tags: ['blaster'] },
      { id: 'shepherd', name: 'Circle of the Shepherd', source: 'XGtE', level: 2, note: 'Spirit Totem plus doubled summon HP. Best summoner in the game.', tags: ['summoner', 'support'] },
      { id: 'spores', name: 'Circle of Spores', source: 'TCoE', level: 2, note: 'Symbiotic Entity is consistent bonus damage without concentration. Strong melee Druid.', tags: ['gish'] },
      { id: 'stars', name: 'Circle of Stars', rulesets: ['2014', '2024'], source: 'TCoE', level: 2, note: 'Starry Form gives damage, healing or concentration protection on demand. Best all-round Druid.', tags: ['blaster', 'support'] },
      { id: 'wildfire', name: 'Circle of Wildfire', source: 'TCoE', level: 2, note: 'Spirit companion that teleports allies and adds damage to your spells.', tags: ['summoner'] },
    ],
    note: 'Full caster with unique battlefield control (Spike Growth, Conjure Animals). Wild Shape quality depends entirely on the circle.',
  },
  {
    id: 'fighter',
    name: 'Fighter',
    source: 'PHB',
    hitDie: 10,
    abilityPriority: { str: 3, dex: 2, con: 2, int: 0, wis: 1, cha: 0 },
    saves: ['str', 'con'],
    asiLevels: [4, 6, 8, 12, 14, 16, 19],
    castingType: 'none',
    armor: 'All armor, shields',
    armorProficiency: ['light', 'medium', 'heavy', 'shield'],
    weapons: 'Simple, martial',
    weaponProficiency: { categories: ['simple', 'martial'] },
    masteries: [{ level: 1, count: 3 }, { level: 4, count: 1 }, { level: 10, count: 1 }, { level: 16, count: 1 }],
    defaultWeaponStyle: 'str-melee',
    multiclass: { armor: ['light', 'medium', 'shield'], weapons: { categories: ['simple', 'martial'] } },
    skillChoices: { count: 2, from: ['acrobatics', 'animal-handling', 'athletics', 'history', 'insight', 'intimidation', 'perception', 'survival'] },
    // 2024 added Persuasion to the Fighter list.
    skillChoicesIn2024: { count: 2, from: ['acrobatics', 'animal-handling', 'athletics', 'history', 'insight', 'intimidation', 'perception', 'persuasion', 'survival'] },
    multiclassPrereq: { abilities: [{ ability: 'str', min: 13 }, { ability: 'dex', min: 13 }], mode: 'any' },
    subclasses: [
      { id: 'arcane-archer', name: 'Arcane Archer', source: 'XGtE', level: 3, note: 'Two arrows per short rest. Badly underpowered for the concept.', tags: [] },
      { id: 'battle-master', name: 'Battle Master', rulesets: ['2014', '2024'], source: 'PHB', level: 3, note: 'Superiority dice give real tactical options every fight. The best all-round Fighter.', tags: ['controller'] },
      { id: 'cavalier', name: 'Cavalier', source: 'XGtE', level: 3, note: 'Sticky marking and a good tank package even off a mount.', tags: ['tank'] },
      { id: 'champion', name: 'Champion', rulesets: ['2014', '2024'], source: 'PHB', level: 3, features: [{ level: 7, name: 'Remarkable Athlete', summary: 'Half your proficiency bonus on Strength, Dexterity and Constitution checks you are not proficient in.', tags: ['half-proficiency'], rulesets: ['2014'] }], note: 'Improved crit range and nothing else. Simple, and weak unless you are crit-fishing hard.', tags: [] },
      { id: 'echo-knight', name: 'Echo Knight', source: 'EGtW', level: 3, note: 'An extra body that grants extra attacks and teleports. Probably the strongest martial subclass in 5e.', tags: ['gish'] },
      { id: 'eldritch-knight', name: 'Eldritch Knight', rulesets: ['2014', '2024'], source: 'PHB', level: 3, note: 'Third-caster with Shield and Absorb Elements, and War Magic for cantrip + attack. INT is a real third stat.', tags: ['gish'], castingType: 'third', castingAbility: 'int', abilityPriority: { int: 2 } },
      { id: 'psi-warrior', name: 'Psi Warrior', rulesets: ['2014', '2024'], source: 'TCoE', level: 3, note: 'Telekinetic shoves, damage reduction and flight. Excellent and INT-light.', tags: ['gish'], abilityPriority: { int: 1 } },
      { id: 'rune-knight', name: 'Rune Knight', source: 'TCoE', level: 3, note: 'Giant\'s Might, huge skill bonuses, and Large size. Top-tier damage and utility.', tags: [] },
      { id: 'samurai', name: 'Samurai', source: 'XGtE', level: 3, note: 'Free advantage several times per rest - the best enabler for Sharpshooter and GWM.', tags: [] },
    ],
    note: 'Most ASIs in the game (7). That makes Fighter the natural home for feat-heavy builds like Sharpshooter + Crossbow Expert.',
  },
  {
    id: 'monk',
    name: 'Monk',
    source: 'PHB',
    hitDie: 8,
    abilityPriority: { str: 0, dex: 3, con: 2, int: 0, wis: 3, cha: 0 },
    saves: ['str', 'dex'],
    asiLevels: STANDARD_ASI,
    castingType: 'none',
    armor: 'None',
    armorProficiency: [],
    weapons: 'Simple, shortswords',
    weaponProficiency: { categories: ['simple'], specific: ['shortsword'] },
    defaultWeaponStyle: 'unarmed',
    multiclass: { weapons: { categories: ['simple'], specific: ['shortsword'] } },
    skillChoices: { count: 2, from: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'] },
    multiclassPrereq: { abilities: [{ ability: 'dex', min: 13 }, { ability: 'wis', min: 13 }], mode: 'all' },
    subclasses: [
      { id: 'ascendant-dragon', name: 'Way of the Ascendant Dragon', source: 'FToD', level: 3, note: 'Flexible damage types, a breath weapon and flight. Good and thematic.', tags: [] },
      { id: 'astral-self', name: 'Way of the Astral Self', source: 'TCoE', level: 3, note: 'WIS replaces STR/DEX for unarmed strikes and adds reach. Fixes Monk MAD.', tags: [] },
      { id: 'drunken-master', name: 'Way of the Drunken Master', source: 'XGtE', level: 3, note: 'Free Disengage on Flurry plus strong mobility. Very slippery.', tags: ['stealth'] },
      { id: 'four-elements', name: 'Way of the Four Elements', rulesets: ['2014', '2024'], nameIn2024: 'Warrior of the Elements', source: 'PHB', level: 3, note: 'Ki-starved spellcasting that is worse than just punching. The weakest subclass in the PHB.', tags: [] },
      { id: 'kensei', name: 'Way of the Kensei', source: 'XGtE', level: 3, note: 'Ranged Monk with bonus AC and damage. Strong, especially with a longbow.', tags: [] },
      { id: 'long-death', name: 'Way of the Long Death', source: 'SCAG', level: 3, note: 'Temp HP on kills and a fear aura. Reasonable durability.', tags: ['tank'] },
      { id: 'mercy', name: 'Way of Mercy', rulesets: ['2014', '2024'], nameIn2024: 'Warrior of Mercy', source: 'TCoE', level: 3, note: 'Bonus action healing and extra damage. The most useful support Monk.', tags: ['support'] },
      { id: 'open-hand', name: 'Way of the Open Hand', rulesets: ['2014', '2024'], nameIn2024: 'Warrior of the Open Hand', source: 'PHB', level: 3, note: 'Free prone/push/no-reaction rider on every Flurry. The strongest damage-and-control Monk.', tags: ['controller'] },
      { id: 'shadow', name: 'Way of Shadow', rulesets: ['2014', '2024'], nameIn2024: 'Warrior of Shadow', source: 'PHB', level: 3, note: 'Darkness plus teleporting between shadows. Elite infiltrator.', tags: ['stealth'] },
      { id: 'sun-soul', name: 'Way of the Sun Soul', source: 'XGtE', level: 3, note: 'Ranged ki bolts that cost too much ki for too little damage.', tags: [] },
    ],
    note: 'The most MAD class in the game: it wants DEX 20, WIS 16+ and CON 14. Half-feats that give DEX or WIS are worth more here than anywhere else.',
  },
  {
    id: 'paladin',
    name: 'Paladin',
    source: 'PHB',
    hitDie: 10,
    abilityPriority: { str: 3, dex: 0, con: 2, int: 0, wis: 1, cha: 2 },
    saves: ['wis', 'cha'],
    asiLevels: STANDARD_ASI,
    castingType: 'half',
    castingAbility: 'cha',
    armor: 'All armor, shields',
    armorProficiency: ['light', 'medium', 'heavy', 'shield'],
    weapons: 'Simple, martial',
    weaponProficiency: { categories: ['simple', 'martial'] },
    masteries: [{ level: 1, count: 2 }],
    defaultWeaponStyle: 'str-melee',
    multiclass: { armor: ['light', 'medium', 'shield'], weapons: { categories: ['simple', 'martial'] } },
    skillChoices: { count: 2, from: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'] },
    multiclassPrereq: { abilities: [{ ability: 'str', min: 13 }, { ability: 'cha', min: 13 }], mode: 'all' },
    subclasses: [
      { id: 'ancients', name: 'Oath of the Ancients', rulesets: ['2014', '2024'], source: 'PHB', level: 3, note: 'Aura of Warding halves all magic damage for the party. Extremely strong at tier 3.', tags: ['tank'] },
      { id: 'conquest', name: 'Oath of Conquest', source: 'XGtE', level: 3, note: 'Frightened enemies cannot move. Best control Paladin.', tags: ['controller', 'tank'] },
      { id: 'crown', name: 'Oath of the Crown', source: 'SCAG', level: 3, note: 'Sticky tanking with Champion Challenge. Decent.', tags: ['tank'] },
      { id: 'devotion', name: 'Oath of Devotion', rulesets: ['2014', '2024'], source: 'PHB', level: 3, note: 'Sacred Weapon adds CHA to attack rolls - the best accuracy boost available to a martial.', spells: [
        { level: 3, ids: ['protection-from-evil', 'sanctuary'] },
        { level: 5, ids: ['lesser-restoration', 'zone-of-truth'] },
        { level: 9, ids: ['beacon-of-hope', 'dispel-magic'] },
        { level: 13, ids: ['freedom-of-movement', 'guardian-of-faith'] },
        { level: 17, ids: ['commune', 'flame-strike'] },
      ], tags: [] },
      { id: 'glory', name: 'Oath of Glory', rulesets: ['2014', '2024'], source: 'TCoE', level: 3, note: 'Party-wide speed and athletics buffs, strong auras.', tags: ['support'] },
      { id: 'redemption', name: 'Oath of Redemption', source: 'XGtE', level: 3, note: 'Redirect damage from allies to yourself; pacifist-leaning, mechanically sturdy.', tags: ['tank'] },
      { id: 'oathbreaker', name: 'Oathbreaker', source: 'DMG', level: 3, note: 'The fallen Paladin: an aura that boosts undead, and Control Undead. A villain option most tables reserve for the DM.', tags: [] },
      { id: 'vengeance', name: 'Oath of Vengeance', rulesets: ['2014', '2024'], source: 'PHB', level: 3, note: 'Vow of Enmity is advantage on every attack for a minute. The nova damage Paladin.', tags: [] },
      { id: 'watchers', name: 'Oath of the Watchers', source: 'TCoE', level: 3, note: 'Initiative bonuses and anti-caster tools.', tags: [] },
    ],
    note: 'Divine Smite converts spell slots into damage, and Aura of Protection adds CHA to every save for the whole party. STR-first, CHA close behind.',
  },
  {
    id: 'ranger',
    name: 'Ranger',
    source: 'PHB',
    hitDie: 10,
    abilityPriority: { str: 0, dex: 3, con: 2, int: 0, wis: 2, cha: 0 },
    saves: ['str', 'dex'],
    asiLevels: STANDARD_ASI,
    castingType: 'half',
    castingAbility: 'wis',
    armor: 'Light, medium, shields',
    armorProficiency: ['light', 'medium', 'shield'],
    weapons: 'Simple, martial',
    weaponProficiency: { categories: ['simple', 'martial'] },
    masteries: [{ level: 1, count: 2 }],
    defaultWeaponStyle: 'dex-ranged',
    skillChoices: { count: 3, from: ['animal-handling', 'athletics', 'insight', 'investigation', 'nature', 'perception', 'stealth', 'survival'] },
    multiclass: { skills: { count: 1, from: ['animal-handling', 'athletics', 'insight', 'investigation', 'nature', 'perception', 'stealth', 'survival'] }, armor: ['light', 'medium', 'shield'], weapons: { categories: ['simple', 'martial'] } },
    multiclassPrereq: { abilities: [{ ability: 'dex', min: 13 }, { ability: 'wis', min: 13 }], mode: 'all' },
    subclasses: [
      { id: 'beast-master', name: 'Beast Master', rulesets: ['2014', '2024'], source: 'PHB', level: 3, note: 'The PHB version is famously weak; use the Tasha\'s Primal Companion option instead.', tags: ['summoner'] },
      { id: 'fey-wanderer', name: 'Fey Wanderer', rulesets: ['2014', '2024'], source: 'TCoE', level: 3, note: 'WIS-based bonus damage on every hit plus charm defenses. Best all-round Ranger.', tags: ['support'] },
      { id: 'gloom-stalker', name: 'Gloom Stalker', rulesets: ['2014', '2024'], source: 'XGtE', level: 3, note: 'Extra attack and +WIS damage in round one, plus invisibility in darkness. The strongest Ranger by a wide margin.', tags: ['stealth'] },
      { id: 'horizon-walker', name: 'Horizon Walker', source: 'XGtE', level: 3, note: 'Force damage rider and teleports. Good against resistant enemies.', tags: [] },
      { id: 'hunter', name: 'Hunter', rulesets: ['2014', '2024'], source: 'PHB', level: 3, note: 'Colossus Slayer is reliable, if unexciting, extra damage.', tags: [] },
      { id: 'monster-slayer', name: 'Monster Slayer', source: 'XGtE', level: 3, note: 'Anti-caster reaction and a damage rider. Mid.', tags: [] },
      { id: 'drakewarden', name: 'Drakewarden', source: 'FToD', level: 3, note: 'A drake companion that grows into a mount you can fly. The strongest pet Ranger.', tags: ['support'] },
      { id: 'swarmkeeper', name: 'Swarmkeeper', source: 'TCoE', level: 3, note: 'Free forced movement on every attack - excellent with Spike Growth.', tags: ['controller'] },
    ],
    note: 'Half caster with Hunter\'s Mark and top-tier exploration tools. Take the Tasha\'s optional class features - they fix the base class.',
  },
  {
    id: 'rogue',
    name: 'Rogue',
    source: 'PHB',
    hitDie: 8,
    abilityPriority: { str: 0, dex: 3, con: 2, int: 1, wis: 1, cha: 1 },
    saves: ['dex', 'int'],
    asiLevels: [4, 8, 10, 12, 16, 19],
    castingType: 'none',
    armor: 'Light',
    armorProficiency: ['light'],
    weapons: 'Simple, hand crossbow, longsword, rapier, shortsword',
    weaponProficiency: { categories: ['simple'], specific: ['hand-crossbow', 'longsword', 'rapier', 'shortsword'] },
    masteries: [{ level: 1, count: 2 }],
    defaultWeaponStyle: 'dex-melee',
    skillChoices: { count: 4, from: ['acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation', 'perception', 'performance', 'persuasion', 'sleight-of-hand', 'stealth'] },
    multiclass: { skills: { count: 1, from: ['acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation', 'perception', 'performance', 'persuasion', 'sleight-of-hand', 'stealth'] }, armor: ['light'], tools: ["Thieves' tools"] },
    multiclassPrereq: { abilities: [{ ability: 'dex', min: 13 }], mode: 'all' },
    subclasses: [
      { id: 'arcane-trickster', name: 'Arcane Trickster', rulesets: ['2014', '2024'], source: 'PHB', level: 3, note: 'Booming Blade, Shield and Find Familiar (a reliable advantage engine). Excellent.', tags: ['gish'], castingType: 'third', castingAbility: 'int', abilityPriority: { int: 2 } },
      { id: 'assassin', name: 'Assassin', rulesets: ['2014', '2024'], source: 'PHB', level: 3, note: 'Devastating in ambushes, dead weight in every other fight. Highly campaign-dependent.', tags: ['stealth'] },
      { id: 'inquisitive', name: 'Inquisitive', source: 'XGtE', level: 3, note: 'Reliable self-sufficient sneak attack without an ally adjacent. Underrated.', tags: [] },
      { id: 'mastermind', name: 'Mastermind', source: 'XGtE', level: 3, note: 'Bonus action Help at 30 ft. - turns you into a permanent advantage machine for the party.', tags: ['support'] },
      { id: 'phantom', name: 'Phantom', source: 'TCoE', level: 3, note: 'Rotating skill proficiencies and free necrotic damage. Strong and flexible.', tags: [] },
      { id: 'scout', name: 'Scout', source: 'XGtE', level: 3, note: 'Free reaction movement and expertise in Nature/Survival.', tags: ['stealth'] },
      { id: 'soulknife', name: 'Soulknife', rulesets: ['2014', '2024'], source: 'TCoE', level: 3, note: 'Psychic blades and Psionic Energy dice for skills. No resources needed to work.', tags: [] },
      { id: 'swashbuckler', name: 'Swashbuckler', source: 'XGtE', level: 3, note: 'Sneak attack with no ally required, plus free disengage. The best duelist Rogue.', tags: [], abilityPriority: { cha: 2 } },
      { id: 'thief', name: 'Thief', rulesets: ['2014', '2024'], source: 'PHB', level: 3, note: 'Fast Hands lets you use magic items as a bonus action. Quietly one of the best.', tags: [] },
    ],
    note: 'Sneak attack scales for free, so Rogues can afford utility feats. Expertise plus Reliable Talent makes them the best skill users in the game.',
  },
  {
    id: 'sorcerer',
    name: 'Sorcerer',
    source: 'PHB',
    hitDie: 6,
    abilityPriority: { str: 0, dex: 2, con: 2, int: 0, wis: 1, cha: 3 },
    saves: ['con', 'cha'],
    asiLevels: STANDARD_ASI,
    castingType: 'full',
    castingAbility: 'cha',
    armor: 'None',
    armorProficiency: [],
    weapons: 'Daggers, darts, slings, quarterstaffs, light crossbows',
    weaponProficiency: { categories: [], specific: ['dagger', 'dart', 'sling', 'quarterstaff', 'light-crossbow'] },
    defaultWeaponStyle: 'spell',
    skillChoices: { count: 2, from: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'] },
    multiclassPrereq: { abilities: [{ ability: 'cha', min: 13 }], mode: 'all' },
    subclasses: [
      { id: 'aberrant-mind', name: 'Aberrant Mind', rulesets: ['2014', '2024'], nameIn2024: 'Aberrant Sorcery', source: 'TCoE', level: 1, note: 'Free extra spells known and sorcery-point Subtle casting. Fixes the Sorcerer\'s biggest weakness.', tags: ['controller'] },
      { id: 'clockwork-soul', name: 'Clockwork Soul', rulesets: ['2014', '2024'], nameIn2024: 'Clockwork Sorcery', source: 'TCoE', level: 1, note: 'Free spells plus a d8 to any attack or save in the party. Superb.', tags: ['support'] },
      { id: 'divine-soul', name: 'Divine Soul', source: 'XGtE', level: 1, note: 'The Cleric list on a Sorcerer chassis. The strongest Sorcerer if allowed.', tags: ['support'] },
      { id: 'draconic', name: 'Draconic Bloodline', rulesets: ['2014', '2024'], nameIn2024: 'Draconic Sorcery', source: 'PHB', level: 1, note: '+1 HP/level and 13 + DEX AC. Safe, dull, durable.', tags: ['blaster'] },
      { id: 'shadow-magic', name: 'Shadow Magic', source: 'XGtE', level: 1, note: 'Hound of Ill Omen is excellent single-target control.', tags: ['controller'] },
      { id: 'lunar-sorcery', name: 'Lunar Sorcery', source: 'DSCS', level: 1, note: 'Three lunar phases, each granting its own spell list and a damage rider. Unusually flexible for a Sorcerer.', tags: [] },
      { id: 'storm-sorcery', name: 'Storm Sorcery', source: 'XGtE', level: 1, note: 'Bonus action flight after casting. Great mobility, weak damage.', tags: [] },
      { id: 'wild-magic', name: 'Wild Magic', rulesets: ['2014', '2024'], nameIn2024: 'Wild Magic Sorcery', source: 'PHB', level: 1, note: 'Tides of Chaos is real, the surge table is DM-dependent.', tags: [] },
    ],
    note: 'Metamagic - especially Quickened and Twinned - is the whole class. Very few spells known, so every pick matters. CON is nearly as important as CHA for concentration.',
  },
  {
    id: 'warlock',
    name: 'Warlock',
    source: 'PHB',
    hitDie: 8,
    abilityPriority: { str: 0, dex: 2, con: 2, int: 0, wis: 1, cha: 3 },
    saves: ['wis', 'cha'],
    asiLevels: STANDARD_ASI,
    castingType: 'pact',
    castingAbility: 'cha',
    armor: 'Light',
    armorProficiency: ['light'],
    weapons: 'Simple',
    weaponProficiency: { categories: ['simple'] },
    defaultWeaponStyle: 'spell',
    multiclass: { armor: ['light'], weapons: { categories: ['simple'] } },
    skillChoices: { count: 2, from: ['arcana', 'deception', 'history', 'intimidation', 'investigation', 'nature', 'religion'] },
    multiclassPrereq: { abilities: [{ ability: 'cha', min: 13 }], mode: 'all' },
    subclasses: [
      { id: 'archfey', name: 'The Archfey', rulesets: ['2014', '2024'], nameIn2024: 'Archfey Patron', source: 'PHB', level: 1, note: 'Fey Presence charm/fear burst. Decent control.', tags: ['controller'] },
      { id: 'celestial', name: 'The Celestial', rulesets: ['2014', '2024'], nameIn2024: 'Celestial Patron', source: 'XGtE', level: 1, note: 'Healing light and Cure Wounds. The support Warlock.', tags: ['support'] },
      { id: 'fathomless', name: 'The Fathomless', source: 'TCoE', level: 1, note: 'Tentacle of the Deeps is free bonus action damage and slowing, every turn.', tags: ['controller'] },
      { id: 'fiend', name: 'The Fiend', rulesets: ['2014', '2024'], nameIn2024: 'Fiend Patron', source: 'PHB', level: 1, note: 'Temp HP on kills and Dark One\'s Own Luck. Reliable.', spells: [
        { level: 1, ids: ['burning-hands', 'command'] },
        { level: 3, ids: ['blindness-deafness', 'scorching-ray'] },
        { level: 5, ids: ['fireball', 'stinking-cloud'] },
        { level: 7, ids: ['fire-shield', 'wall-of-fire'] },
        { level: 9, ids: ['flame-strike', 'hallow'] },
      ], tags: ['blaster'] },
      { id: 'genie', name: 'The Genie', source: 'TCoE', level: 1, note: 'Free damage rider, a pocket dimension, and Wish at 14. Probably the best patron.', tags: [] },
      { id: 'great-old-one', name: 'The Great Old One', rulesets: ['2014', '2024'], nameIn2024: 'Great Old One Patron', source: 'PHB', level: 1, note: 'Telepathy and, at 6, a free charm on a crit. Flavourful, medium power.', tags: ['controller'] },
      { id: 'hexblade', name: 'The Hexblade', source: 'XGtE', level: 1, weaponProficiency: { categories: ['martial'] }, note: 'CHA to weapon attacks, medium armor and shields. The single most-dipped subclass in 5e.', tags: ['gish', 'medium-armor', 'martial-weapons'], armorProficiency: ['medium', 'shield'] },
      { id: 'undead', name: 'The Undead', source: 'VRGtR', level: 1, note: 'Form of Dread gives frightening and damage resistance. Strong.', tags: ['tank'] },
      { id: 'undying', name: 'The Undying', source: 'SCAG', level: 1, note: 'Superseded by The Undead in almost every way.', tags: [] },
    ],
    note: 'Short-rest slots and Eldritch Blast + Agonizing Blast means consistent damage all day. Invocations are where the customisation lives.',
  },
  {
    id: 'wizard',
    name: 'Wizard',
    source: 'PHB',
    hitDie: 6,
    abilityPriority: { str: 0, dex: 2, con: 2, int: 3, wis: 1, cha: 0 },
    saves: ['int', 'wis'],
    asiLevels: STANDARD_ASI,
    castingType: 'full',
    castingAbility: 'int',
    armor: 'None',
    armorProficiency: [],
    weapons: 'Daggers, darts, slings, quarterstaffs, light crossbows',
    weaponProficiency: { categories: [], specific: ['dagger', 'dart', 'sling', 'quarterstaff', 'light-crossbow'] },
    defaultWeaponStyle: 'spell',
    skillChoices: { count: 2, from: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'religion'] },
    multiclassPrereq: { abilities: [{ ability: 'int', min: 13 }], mode: 'all' },
    subclasses: [
      { id: 'abjuration', name: 'School of Abjuration', rulesets: ['2014', '2024'], nameIn2024: 'Abjurer', source: 'PHB', level: 2, note: 'Arcane Ward soaks damage all day for free. The most durable Wizard.', tags: ['tank'] },
      { id: 'bladesinging', name: 'Bladesinging', source: 'TCoE/SCAG', level: 2, features: [{ level: 6, name: 'Extra Attack', summary: 'Attack twice with the Attack action.', tags: ['extra-attack'] }], note: 'INT to AC, Extra Attack at 6, and full Wizard casting. The best gish in the game. Wants DEX 16+.', tags: ['gish'], abilityPriority: { dex: 3 }, armorProficiency: ['light'] },
      { id: 'chronurgy', name: 'Chronurgy Magic', source: 'EGtW', level: 2, note: 'Chronal Shift twice per rest, and Convergent Future ignores the dice entirely. Overpowered if allowed.', tags: ['controller'] },
      { id: 'conjuration', name: 'School of Conjuration', source: 'PHB', level: 2, note: 'Minor Conjuration is handy, the rest is thin.', tags: ['summoner'] },
      { id: 'divination', name: 'School of Divination', rulesets: ['2014', '2024'], nameIn2024: 'Diviner', source: 'PHB', level: 2, note: 'Portent replaces enemy rolls with your own. Top tier and it never gets worse.', tags: ['controller'] },
      { id: 'enchantment', name: 'School of Enchantment', source: 'PHB', level: 2, note: 'Situational; Split Enchantment at 10 is the payoff.', tags: ['controller'] },
      { id: 'evocation', name: 'School of Evocation', rulesets: ['2014', '2024'], nameIn2024: 'Evoker', source: 'PHB', level: 2, note: 'Sculpt Spells lets you Fireball your own melee. The default blaster.', tags: ['blaster'] },
      { id: 'graviturgy', name: 'Graviturgy Magic', source: 'EGtW', level: 2, note: 'Free forced movement and size manipulation. Strong control.', tags: ['controller'] },
      { id: 'illusion', name: 'School of Illusion', rulesets: ['2014', '2024'], nameIn2024: 'Illusionist', source: 'PHB', level: 2, note: 'As strong as your DM lets illusions be.', tags: [] },
      { id: 'necromancy', name: 'School of Necromancy', source: 'PHB', level: 2, note: 'Undead Thralls is an action-economy engine if your table tolerates the bookkeeping.', tags: ['summoner'] },
      { id: 'order-of-scribes', name: 'Order of Scribes', source: 'TCoE', level: 2, note: 'Swap spell damage types and ritual-cast from anywhere. Great utility.', tags: [] },
      { id: 'transmutation', name: 'School of Transmutation', source: 'PHB', level: 2, note: 'The transmuter\'s stone is fine, the school is weak.', tags: [] },
      { id: 'war-magic', name: 'War Magic', source: 'XGtE', level: 2, note: 'Arcane Deflection and concentration protection. Sturdy.', tags: ['tank'] },
    ],
    note: 'The biggest spell list in the game and rituals for free. d6 hit die means CON and concentration protection are not optional.',
  },
];

export const CLASSES_BY_ID: Record<ClassId, CharClass> = Object.fromEntries(
  CLASSES.map((c) => [c.id, c]),
) as Record<ClassId, CharClass>;

export function classesFor(ruleset: Ruleset): CharClass[] {
  return CLASSES.filter((c) => (c.rulesets ?? ['2014', '2024']).includes(ruleset));
}

/**
 * 2024 moved every class's subclass choice to level 3; in 2014 it ranges from
 * 1 (Cleric, Sorcerer, Warlock) to 3.
 */
export function subclassLevelFor(klass: CharClass, ruleset: Ruleset): number {
  if (ruleset === '2024') return 3;
  return klass.subclasses[0]?.level ?? 3;
}

/**
 * The class skill list, which 2024 changed for exactly one class - the Fighter
 * gained Persuasion. Everything else is identical, so an override on the record
 * beats duplicating thirteen lists.
 */
export function skillChoicesFor(klass: CharClass, ruleset: Ruleset): SkillChoice {
  return ruleset === '2024' ? klass.skillChoicesIn2024 ?? klass.skillChoices : klass.skillChoices;
}

/**
 * The subclasses a class offers in a given ruleset. The 2024 Player's Handbook
 * carries four per class, and almost all of them already existed - some under
 * a different name, which `nameIn2024` carries so the id stays stable and a
 * character does not lose their subclass when the rules switch.
 */
export function subclassesFor(klass: CharClass, ruleset: Ruleset): Subclass[] {
  return klass.subclasses.filter((s) => (s.rulesets ?? ['2014']).includes(ruleset));
}

export function subclassName(subclass: Subclass, ruleset: Ruleset): string {
  return ruleset === '2024' ? subclass.nameIn2024 ?? subclass.name : subclass.name;
}

/**
 * Where a player finds this subclass. Under 2024 that is the Player's
 * Handbook, because the 2024 list *is* that book's four per class - showing a
 * Zealot as XGtE would send someone to the wrong shelf.
 *
 * **Except for what this project wrote itself.** A Forge original is in no
 * book at all, and relabelling it `PHB 2024` because the character is built
 * under 2024 rules would be the app telling a player their homebrew is
 * official - the one thing the whole provenance layer exists to prevent.
 */
export function subclassSource(subclass: Subclass, ruleset: Ruleset): Source {
  if (isOriginal(subclass.source)) return subclass.source;
  return ruleset === '2024' ? 'PHB 2024' : subclass.source;
}
