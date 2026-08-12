import type { Race, Ruleset } from '../types';
import { SPECIES_2024 } from './species2024';
import { visible } from '../originals';

/**
 * Lineages are flattened: each subrace is its own entry with a `parent`, so the
 * race/class matrix can rate "Mountain Dwarf" separately from "Hill Dwarf".
 * Trait text is summarised in our own words - it is a mechanics cheat sheet,
 * not a reproduction of the rulebook.
 */
const RACES_2014: Race[] = [
  // ---------------------------------------------------------------- Dwarf
  {
    id: 'dwarf-hill',
    name: 'Hill Dwarf',
    parent: 'Dwarf',
    source: 'PHB',
    size: 'Medium',
    speed: 25,
    asi: { con: 2, wis: 1 },
    traits: [
      { name: 'Darkvision 60 ft.', text: 'See in dim light as bright, darkness as dim.', tags: ['darkvision'], feet: 60 },
      { name: 'Dwarven Resilience', text: 'Advantage on saves vs poison, resistance to poison damage.', tags: ['advantage-saves', 'resistance'] },
      { name: 'Dwarven Toughness', text: '+1 max HP per level.', tags: ['extra-hp'] },
      { name: 'Dwarven Combat Training', text: 'Proficient with battleaxe, handaxe, throwing hammer, warhammer.', tags: ['weapon-prof'] },
      { name: 'Tool Proficiency', text: "One of smith's, brewer's, or mason's tools." },
      { name: 'Stonecunning', text: 'Double proficiency on History checks about stonework.' },
    ],
    note: 'The durability pick. +1 HP/level plus poison resistance keeps squishy WIS casters alive; slow 25 ft. speed is the cost.',
  },
  {
    id: 'dwarf-mountain',
    name: 'Mountain Dwarf',
    parent: 'Dwarf',
    source: 'PHB',
    size: 'Medium',
    speed: 25,
    asi: { str: 2, con: 2 },
    traits: [
      { name: 'Darkvision 60 ft.', text: 'See in dim light as bright, darkness as dim.', tags: ['darkvision'], feet: 60 },
      { name: 'Dwarven Resilience', text: 'Advantage on saves vs poison, resistance to poison damage.', tags: ['advantage-saves', 'resistance'] },
      { name: 'Dwarven Armor Training', text: 'Proficient with light and medium armor.', tags: ['armor-prof'] },
      { name: 'Dwarven Combat Training', text: 'Proficient with battleaxe, handaxe, throwing hammer, warhammer.', tags: ['weapon-prof'] },
      { name: 'Stonecunning', text: 'Double proficiency on History checks about stonework.' },
    ],
    armorProficiency: ['light', 'medium'],
    note: 'The only lineage with two +2s. Medium armor proficiency famously turns a Wizard into an AC 16 wall without a single feat.',
  },
  // ------------------------------------------------------------------ Elf
  {
    id: 'elf-high',
    name: 'High Elf',
    parent: 'Elf',
    source: 'PHB',
    size: 'Medium',
    speed: 30,
    asi: { dex: 2, int: 1 },
    skillGrants: { fixed: ['perception'] },
    weaponProficiency: { categories: [], specific: ['longsword', 'shortsword', 'shortbow', 'longbow'] },
    traits: [
      { name: 'Darkvision 60 ft.', text: 'See in dim light as bright, darkness as dim.', tags: ['darkvision'], feet: 60 },
      { name: 'Fey Ancestry', text: 'Advantage vs charm, immune to magical sleep.', tags: ['advantage-saves'] },
      { name: 'Trance', text: '4-hour meditation instead of 8-hour sleep.', tags: ['no-sleep'] },
      { name: 'Keen Senses', text: 'Perception proficiency.', tags: ['skill-prof'] },
      { name: 'Elf Weapon Training', text: 'Longsword, shortsword, shortbow, longbow.', tags: ['weapon-prof'] },
      { name: 'Cantrip', text: 'One wizard cantrip, cast with Intelligence.', tags: ['free-spells', 'innate-caster-int'] },
    ],
    note: 'Booming Blade or Green-Flame Blade for free makes this the default gish lineage; longbow proficiency covers martials too.',
  },
  {
    id: 'elf-wood',
    name: 'Wood Elf',
    parent: 'Elf',
    source: 'PHB',
    size: 'Medium',
    speed: 35,
    asi: { dex: 2, wis: 1 },
    skillGrants: { fixed: ['perception'] },
    weaponProficiency: { categories: [], specific: ['longsword', 'shortsword', 'shortbow', 'longbow'] },
    traits: [
      { name: 'Darkvision 60 ft.', text: 'See in dim light as bright, darkness as dim.', tags: ['darkvision'], feet: 60 },
      { name: 'Fey Ancestry', text: 'Advantage vs charm, immune to magical sleep.', tags: ['advantage-saves'] },
      { name: 'Trance', text: '4-hour meditation instead of 8-hour sleep.', tags: ['no-sleep'] },
      { name: 'Keen Senses', text: 'Perception proficiency.', tags: ['skill-prof'] },
      { name: 'Fleet of Foot', text: '35 ft. walking speed.', tags: ['mobility'] },
      { name: 'Mask of the Wild', text: 'Hide when lightly obscured by natural phenomena.', tags: ['stealth'] },
    ],
    note: '+2 DEX / +1 WIS with 35 ft. speed and free stealth is the best raw statline for Rangers, Monks and DEX Clerics.',
  },
  {
    id: 'elf-drow',
    name: 'Drow',
    parent: 'Elf',
    source: 'PHB',
    size: 'Medium',
    speed: 30,
    asi: { dex: 2, cha: 1 },
    skillGrants: { fixed: ['perception'] },
    weaponProficiency: { categories: [], specific: ['longsword', 'shortsword', 'shortbow', 'longbow'] },
    traits: [
      { name: 'Superior Darkvision 120 ft.', text: 'Double-range darkvision.', tags: ['darkvision'], feet: 120 },
      { name: 'Fey Ancestry', text: 'Advantage vs charm, immune to magical sleep.', tags: ['advantage-saves'] },
      { name: 'Trance', text: '4-hour meditation instead of 8-hour sleep.', tags: ['no-sleep'] },
      { name: 'Sunlight Sensitivity', text: 'Disadvantage on attacks and Perception in direct sunlight.' },
      { name: 'Drow Magic', text: 'Dancing Lights; Faerie Fire at 3rd; Darkness at 5th, cast with Charisma.', tags: ['free-spells', 'innate-caster-cha'] },
      { name: 'Drow Weapon Training', text: 'Rapier, shortsword, hand crossbow.', tags: ['weapon-prof'] },
    ],
    note: 'Free Faerie Fire is a genuine build enabler for Rogues and Elven Accuracy users. Sunlight Sensitivity is a real tax in outdoor games - check with your DM.',
  },
  // -------------------------------------------------------------- Halfling
  {
    id: 'halfling-lightfoot',
    name: 'Lightfoot Halfling',
    parent: 'Halfling',
    source: 'PHB',
    size: 'Small',
    speed: 25,
    asi: { dex: 2, cha: 1 },
    traits: [
      { name: 'Lucky', text: 'Reroll natural 1s on attacks, checks and saves.', tags: ['save-reroll'] },
      { name: 'Brave', text: 'Advantage on saves vs frightened.', tags: ['advantage-saves'] },
      { name: 'Halfling Nimbleness', text: 'Move through the space of larger creatures.', tags: ['mobility'] },
      { name: 'Naturally Stealthy', text: 'Hide behind a creature one size larger.', tags: ['stealth'] },
    ],
    note: 'Halfling Luck is quietly one of the strongest racial traits in the game, and it scales with how many attacks you make.',
  },
  {
    id: 'halfling-stout',
    name: 'Stout Halfling',
    parent: 'Halfling',
    source: 'PHB',
    size: 'Small',
    speed: 25,
    asi: { dex: 2, con: 1 },
    traits: [
      { name: 'Lucky', text: 'Reroll natural 1s on attacks, checks and saves.', tags: ['save-reroll'] },
      { name: 'Brave', text: 'Advantage on saves vs frightened.', tags: ['advantage-saves'] },
      { name: 'Halfling Nimbleness', text: 'Move through the space of larger creatures.', tags: ['mobility'] },
      { name: 'Stout Resilience', text: 'Advantage vs poison, resistance to poison damage.', tags: ['advantage-saves', 'resistance'] },
    ],
    note: 'Lucky plus poison resistance. The most durable Small lineage and a great Rogue or ranged Fighter chassis.',
  },
  // ----------------------------------------------------------------- Human
  {
    id: 'human',
    name: 'Human',
    source: 'PHB',
    size: 'Medium',
    speed: 30,
    asi: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
    traits: [{ name: 'Versatile', text: '+1 to every ability score.' }],
    note: 'Fine for MAD builds that want odd scores rounded up, but Variant Human is strictly better in almost every optimised build.',
  },
  {
    id: 'human-variant',
    name: 'Variant Human',
    parent: 'Human',
    source: 'PHB',
    size: 'Medium',
    speed: 30,
    asi: {},
    flexibleAsi: { amounts: [1, 1] },
    bonusFeat: true,
    bonusSkills: 1,
    skillGrants: { choose: { count: 1 } },
    traits: [
      { name: 'Feat', text: 'One feat of your choice at 1st level.', tags: ['bonus-feat'] },
      { name: 'Skills', text: 'One extra skill proficiency.', tags: ['skill-prof'] },
    ],
    note: 'A feat at level 1 is worth roughly four levels of progression for feat-dependent builds (Sharpshooter, GWM, Polearm Master).',
  },
  // ------------------------------------------------------------- Dragonborn
  {
    id: 'dragonborn',
    name: 'Dragonborn',
    source: 'PHB',
    size: 'Medium',
    speed: 30,
    asi: { str: 2, cha: 1 },
    traits: [
      { name: 'Breath Weapon', text: 'Cone or line, 2d6 scaling to 5d6, DEX or CON save, once per short rest.', tags: ['breath-weapon'] },
      { name: 'Damage Resistance', text: 'Resistance to your ancestry damage type.', tags: ['resistance'] },
    ],
    note: 'The statline is right for STR Paladins, but the breath weapon falls off hard after tier 1. Take it for flavour, not for math.',
  },
  // ----------------------------------------------------------------- Gnome
  {
    id: 'gnome-forest',
    name: 'Forest Gnome',
    parent: 'Gnome',
    source: 'PHB',
    size: 'Small',
    speed: 25,
    asi: { int: 2, dex: 1 },
    traits: [
      { name: 'Darkvision 60 ft.', text: 'See in dim light as bright, darkness as dim.', tags: ['darkvision'], feet: 60 },
      { name: 'Gnome Cunning', text: 'Advantage on INT, WIS and CHA saves vs magic.', tags: ['advantage-saves'] },
      { name: 'Natural Illusionist', text: 'Minor Illusion cantrip, cast with Intelligence.', tags: ['free-spells', 'innate-caster-int'] },
      { name: 'Speak with Small Beasts', text: 'Communicate simple ideas to small animals.' },
    ],
    note: 'Gnome Cunning is the single best defensive racial trait in the game - it blanks most save-or-suck spells aimed at casters.',
  },
  {
    id: 'gnome-rock',
    name: 'Rock Gnome',
    parent: 'Gnome',
    source: 'PHB',
    size: 'Small',
    speed: 25,
    asi: { int: 2, con: 1 },
    traits: [
      { name: 'Darkvision 60 ft.', text: 'See in dim light as bright, darkness as dim.', tags: ['darkvision'], feet: 60 },
      { name: 'Gnome Cunning', text: 'Advantage on INT, WIS and CHA saves vs magic.', tags: ['advantage-saves'] },
      { name: "Artificer's Lore", text: 'Double proficiency on History for magic/tech/alchemy items.' },
      { name: 'Tinker', text: "Build tiny clockwork devices with tinker's tools." },
    ],
    note: '+2 INT / +1 CON plus Gnome Cunning is the most survivable Wizard and Artificer chassis available.',
  },
  // -------------------------------------------------------------- Half-Elf
  {
    id: 'half-elf',
    name: 'Half-Elf',
    source: 'PHB',
    size: 'Medium',
    speed: 30,
    asi: { cha: 2 },
    flexibleAsi: { amounts: [1, 1], exclude: ['cha'] },
    bonusSkills: 2,
    skillGrants: { choose: { count: 2 } },
    traits: [
      { name: 'Darkvision 60 ft.', text: 'See in dim light as bright, darkness as dim.', tags: ['darkvision'], feet: 60 },
      { name: 'Fey Ancestry', text: 'Advantage vs charm, immune to magical sleep.', tags: ['advantage-saves'] },
      { name: 'Skill Versatility', text: 'Two extra skill proficiencies.', tags: ['skill-prof'] },
    ],
    note: '+2/+1/+1 with two free skills is the best all-round CHA statline. Elven Accuracy makes it the premier crit-fishing lineage.',
  },
  // -------------------------------------------------------------- Half-Orc
  {
    id: 'half-orc',
    name: 'Half-Orc',
    source: 'PHB',
    size: 'Medium',
    speed: 30,
    asi: { str: 2, con: 1 },
    skillGrants: { fixed: ['intimidation'] },
    traits: [
      { name: 'Darkvision 60 ft.', text: 'See in dim light as bright, darkness as dim.', tags: ['darkvision'], feet: 60 },
      { name: 'Relentless Endurance', text: 'Drop to 1 HP instead of 0, once per long rest.', tags: ['survivability'] },
      { name: 'Savage Attacks', text: 'Extra weapon damage die on a melee critical hit.' },
      { name: 'Menacing', text: 'Intimidation proficiency.', tags: ['skill-prof'] },
    ],
    note: 'Savage Attacks pairs with any crit-fishing chassis, and Relentless Endurance is a free extra life every long rest.',
  },
  // -------------------------------------------------------------- Tiefling
  {
    id: 'tiefling',
    name: 'Tiefling',
    source: 'PHB',
    size: 'Medium',
    speed: 30,
    asi: { cha: 2, int: 1 },
    traits: [
      { name: 'Darkvision 60 ft.', text: 'See in dim light as bright, darkness as dim.', tags: ['darkvision'], feet: 60 },
      { name: 'Hellish Resistance', text: 'Resistance to fire damage.', tags: ['resistance'] },
      { name: 'Infernal Legacy', text: 'Thaumaturgy; Hellish Rebuke at 3rd; Darkness at 5th, cast with Charisma.', tags: ['free-spells', 'innate-caster-cha'] },
    ],
    note: 'Fire resistance and free Darkness make this a durable Warlock/Sorcerer frame; the +1 INT is mostly wasted.',
  },
  // -------------------------------------------------------------- Aasimar
  {
    id: 'aasimar-protector',
    name: 'Protector Aasimar',
    parent: 'Aasimar',
    source: 'VGtM',
    size: 'Medium',
    speed: 30,
    asi: { cha: 2, wis: 1 },
    traits: [
      { name: 'Darkvision 60 ft.', text: 'See in dim light as bright, darkness as dim.', tags: ['darkvision'], feet: 60 },
      { name: 'Celestial Resistance', text: 'Resistance to necrotic and radiant damage.', tags: ['resistance'] },
      { name: 'Healing Hands', text: 'Heal a creature for your level, once per long rest.' },
      { name: 'Light Bearer', text: 'Light cantrip, cast with Charisma.', tags: ['free-spells'] },
      { name: 'Radiant Soul', text: 'From 3rd: flight and bonus radiant damage for 1 minute per long rest.', tags: ['flight'] },
    ],
    note: 'Flight from level 3, even for one minute a day, is a huge tactical swing. Best on Paladins and Warlocks.',
  },
  {
    id: 'aasimar-scourge',
    name: 'Scourge Aasimar',
    parent: 'Aasimar',
    source: 'VGtM',
    size: 'Medium',
    speed: 30,
    asi: { cha: 2, con: 1 },
    traits: [
      { name: 'Darkvision 60 ft.', text: 'See in dim light as bright, darkness as dim.', tags: ['darkvision'], feet: 60 },
      { name: 'Celestial Resistance', text: 'Resistance to necrotic and radiant damage.', tags: ['resistance'] },
      { name: 'Healing Hands', text: 'Heal a creature for your level, once per long rest.' },
      { name: 'Radiant Consumption', text: 'From 3rd: radiant aura damaging you and everything nearby.' },
    ],
    note: '+2 CHA / +1 CON is the ideal caster statline; the self-damaging aura is best ignored or used as a finisher.',
  },
  // -------------------------------------------------------------- Goliath
  {
    id: 'goliath',
    name: 'Goliath',
    source: 'VGtM',
    size: 'Medium',
    speed: 30,
    asi: { str: 2, con: 1 },
    skillGrants: { fixed: ['athletics'] },
    traits: [
      { name: "Stone's Endurance", text: 'Reduce damage by 1d12 + CON as a reaction, once per short rest.', tags: ['survivability'] },
      { name: 'Powerful Build', text: 'Count as one size larger for carrying and lifting.', tags: ['carry-capacity'] },
      { name: 'Mountain Born', text: 'Cold resistance, acclimated to high altitude.', tags: ['resistance'] },
      { name: 'Natural Athlete', text: 'Athletics proficiency.', tags: ['skill-prof'] },
    ],
    note: "Stone's Endurance every short rest makes this the toughest STR lineage. The go-to Barbarian pick.",
  },
  // -------------------------------------------------------------- Firbolg
  {
    id: 'firbolg',
    name: 'Firbolg',
    source: 'VGtM',
    size: 'Medium',
    speed: 30,
    asi: { wis: 2, str: 1 },
    traits: [
      { name: 'Firbolg Magic', text: 'Detect Magic and Disguise Self, once each per short rest, cast with Wisdom.', tags: ['free-spells', 'innate-caster-wis'] },
      { name: 'Hidden Step', text: 'Bonus action invisibility until your next turn, once per short rest.', tags: ['stealth'] },
      { name: 'Powerful Build', text: 'Count as one size larger for carrying and lifting.', tags: ['carry-capacity'] },
      { name: 'Speech of Beast and Leaf', text: 'Talk to beasts and plants, advantage on CHA checks with them.' },
    ],
    note: 'The only +2 WIS lineage with a real escape button. Excellent for Druids and Nature Clerics.',
  },
  // --------------------------------------------------------------- Tabaxi
  {
    id: 'tabaxi',
    name: 'Tabaxi',
    source: 'VGtM',
    size: 'Medium',
    speed: 30,
    asi: { dex: 2, cha: 1 },
    skillGrants: { fixed: ['perception', 'stealth'] },
    traits: [
      { name: 'Darkvision 60 ft.', text: 'See in dim light as bright, darkness as dim.', tags: ['darkvision'], feet: 60 },
      { name: "Feline Agility", text: 'Double your speed for a turn; recharge by not moving for a turn.', tags: ['mobility'] },
      { name: 'Cat’s Claws', text: '20 ft. climb speed, 1d4 unarmed strikes.', tags: ['natural-weapon'] },
      { name: "Cat's Talent", text: 'Perception and Stealth proficiency.', tags: ['skill-prof', 'stealth'] },
    ],
    note: 'Feline Agility turns a 30 ft. speed into 60+ ft. burst mobility - the best kiting lineage for Rogues and ranged builds.',
  },
  // ---------------------------------------------------------------- Kenku
  {
    id: 'kenku',
    name: 'Kenku',
    source: 'VGtM',
    size: 'Medium',
    speed: 30,
    asi: { dex: 2, wis: 1 },
    skillGrants: { choose: { count: 2, from: ['acrobatics', 'deception', 'sleight-of-hand', 'stealth'] } },
    traits: [
      { name: 'Expert Forgery', text: 'Double proficiency to duplicate objects.' },
      { name: 'Kenku Training', text: 'Two skills from Acrobatics, Deception, Stealth, Sleight of Hand.', tags: ['skill-prof', 'stealth'] },
      { name: 'Mimicry', text: 'Reproduce sounds and voices you have heard.' },
    ],
    note: 'Right stats for a Ranger or Monk with two bonus skills. The original speech restriction is optional in newer printings.',
  },
  // -------------------------------------------------------------- Lizardfolk
  {
    id: 'lizardfolk',
    name: 'Lizardfolk',
    source: 'VGtM',
    size: 'Medium',
    speed: 30,
    asi: { con: 2, wis: 1 },
    traits: [
      { name: 'Natural Armor', text: 'AC 13 + DEX when unarmored.', tags: ['natural-armor'] },
      { name: 'Bite', text: '1d6 + STR natural weapon.', tags: ['natural-weapon'] },
      { name: 'Hungry Jaws', text: 'Bonus action bite with temp HP, once per short rest.', tags: ['extra-attack-ish'] },
      { name: 'Hold Breath', text: 'Hold breath for 15 minutes.', tags: ['swim'] },
      { name: "Cunning Artisan", text: 'Craft simple gear from corpses during a short rest.' },
    ],
    note: '+2 CON / +1 WIS with natural armor is a strong Druid pick - AC 13 + DEX beats hide armor while wild shaping.',
  },
  // ---------------------------------------------------------------- Triton
  {
    id: 'triton',
    name: 'Triton',
    source: 'VGtM',
    size: 'Medium',
    speed: 30,
    asi: { str: 1, con: 1, cha: 1 },
    traits: [
      { name: 'Darkvision 60 ft.', text: 'See in dim light as bright, darkness as dim.', tags: ['darkvision'], feet: 60 },
      { name: 'Control Air and Water', text: 'Fog Cloud at 1st, Gust of Wind at 3rd, Wall of Water at 5th, cast with Charisma.', tags: ['free-spells', 'innate-caster-cha'] },
      { name: 'Emissary of the Sea', text: 'Communicate with water-breathing creatures.' },
      { name: 'Guardians of the Depths', text: 'Cold resistance, adapted to deep water.', tags: ['resistance', 'swim'] },
    ],
    note: 'Three +1s suit MAD classes, and free Fog Cloud at level 1 is a real combat tool for a Paladin.',
  },
  // -------------------------------------------------------------- Goblinoids
  {
    id: 'goblin',
    name: 'Goblin',
    source: 'VGtM',
    size: 'Small',
    speed: 30,
    asi: { dex: 2, con: 1 },
    traits: [
      { name: 'Darkvision 60 ft.', text: 'See in dim light as bright, darkness as dim.', tags: ['darkvision'], feet: 60 },
      { name: 'Fury of the Small', text: 'Extra damage equal to your level against a larger creature, once per short rest.' },
      { name: 'Nimble Escape', text: 'Disengage or Hide as a bonus action, every turn.', tags: ['mobility', 'stealth', 'action-economy'] },
      { name: 'Fey Ancestry', text: 'Advantage vs charm, immune to magical sleep.', tags: ['advantage-saves'] },
    ],
    note: 'Nimble Escape at level 1 is Cunning Action for free - it makes any DEX build slippery and is close to broken on a Rogue-adjacent chassis.',
  },
  {
    id: 'hobgoblin',
    name: 'Hobgoblin',
    source: 'VGtM',
    size: 'Medium',
    speed: 30,
    asi: { con: 2, int: 1 },
    weaponProficiency: { categories: ['martial'] },
    traits: [
      { name: 'Darkvision 60 ft.', text: 'See in dim light as bright, darkness as dim.', tags: ['darkvision'], feet: 60 },
      { name: 'Saving Face', text: 'Add +1 per ally within 30 ft. (max +5) to a missed roll, once per short rest.' },
      { name: 'Martial Training', text: 'Two martial weapons and light armor.', tags: ['weapon-prof', 'light-armor-prof'] },
      { name: 'Fey Ancestry', text: 'Advantage vs charm, immune to magical sleep.', tags: ['advantage-saves'] },
    ],
    armorProficiency: ['light'],
    note: '+2 CON / +1 INT with martial weapons is the tankiest Wizard and a fine Artificer or Eldritch Knight.',
  },
  {
    id: 'bugbear',
    name: 'Bugbear',
    source: 'VGtM',
    size: 'Medium',
    speed: 30,
    asi: { str: 2, dex: 1 },
    skillGrants: { fixed: ['stealth'] },
    traits: [
      { name: 'Darkvision 60 ft.', text: 'See in dim light as bright, darkness as dim.', tags: ['darkvision'], feet: 60 },
      { name: 'Long-Limbed', text: '+5 ft. reach on melee attacks on your turn.', tags: ['reach'] },
      { name: 'Surprise Attack', text: '+2d6 damage on your first hit against a surprised creature.' },
      { name: 'Powerful Build', text: 'Count as one size larger for carrying and lifting.', tags: ['carry-capacity'] },
      { name: 'Sneaky', text: 'Stealth proficiency.', tags: ['skill-prof', 'stealth'] },
    ],
    note: '10 ft. reach on a Medium body is a genuine advantage - Polearm Master Bugbears threaten 15 ft. Best opening-round nova in the game.',
  },
  {
    id: 'kobold',
    name: 'Kobold',
    source: 'VGtM',
    size: 'Small',
    speed: 30,
    asi: { dex: 2 },
    traits: [
      { name: 'Darkvision 60 ft.', text: 'See in dim light as bright, darkness as dim.', tags: ['darkvision'], feet: 60 },
      { name: 'Pack Tactics', text: 'Advantage on attacks when an ally is within 5 ft. of the target.', tags: ['extra-attack-ish'] },
      { name: 'Sunlight Sensitivity', text: 'Disadvantage on attacks and Perception in direct sunlight.' },
      { name: 'Grovel, Cower and Beg', text: 'Give allies advantage against nearby enemies, once per short rest.' },
    ],
    note: 'Pack Tactics is the strongest offensive racial trait in the game (and a crit engine with Elven Accuracy-style effects). Sunlight Sensitivity is the price. The 2014 printing also has a -2 STR; many tables drop it.',
  },
  // ------------------------------------------------------------------ Orc
  {
    id: 'orc',
    name: 'Orc',
    source: 'MPMM/ERLW',
    size: 'Medium',
    speed: 30,
    asi: { str: 2, con: 1 },
    traits: [
      { name: 'Darkvision 60 ft.', text: 'See in dim light as bright, darkness as dim.', tags: ['darkvision'], feet: 60 },
      { name: 'Adrenaline Rush', text: 'Bonus action Dash plus temp HP, proficiency bonus times per long rest.', tags: ['mobility'] },
      { name: 'Relentless Endurance', text: 'Drop to 1 HP instead of 0, once per long rest.' },
      { name: 'Powerful Build', text: 'Count as one size larger for carrying and lifting.', tags: ['carry-capacity'] },
    ],
    note: 'Bonus action Dash plus temp HP several times a day. A better Half-Orc for anything that needs to close distance.',
  },
  // ------------------------------------------------------------- Yuan-ti
  {
    id: 'yuan-ti',
    name: 'Yuan-ti Pureblood',
    source: 'VGtM',
    size: 'Medium',
    speed: 30,
    asi: { cha: 2, int: 1 },
    traits: [
      { name: 'Darkvision 60 ft.', text: 'See in dim light as bright, darkness as dim.', tags: ['darkvision'], feet: 60 },
      { name: 'Magic Resistance', text: 'Advantage on all saving throws against spells and magical effects.', tags: ['advantage-saves'] },
      { name: 'Poison Immunity', text: 'Immune to poison damage and the poisoned condition.', tags: ['resistance'] },
      { name: 'Innate Spellcasting', text: 'Poison Spray; Animal Friendship at will; Suggestion once per long rest.', tags: ['free-spells', 'innate-caster-cha'] },
    ],
    note: 'Full Magic Resistance is a monster trait handed to a player. If your table allows it, it is arguably the strongest defensive lineage in 5e.',
  },
  // --------------------------------------------------------------- Genasi
  {
    id: 'genasi-air',
    name: 'Air Genasi',
    parent: 'Genasi',
    source: 'EEPC/MPMM',
    size: 'Medium',
    speed: 30,
    asi: { con: 2, dex: 1 },
    traits: [
      { name: 'Unending Breath', text: 'Hold your breath indefinitely.' },
      { name: 'Mingle with the Wind', text: 'Levitate once per long rest.', tags: ['free-spells'] },
    ],
    note: '+2 CON / +1 DEX is a solid frame for a Monk or DEX martial that expects to get hit.',
  },
  {
    id: 'genasi-earth',
    name: 'Earth Genasi',
    parent: 'Genasi',
    source: 'EEPC/MPMM',
    size: 'Medium',
    speed: 30,
    asi: { con: 2, str: 1 },
    traits: [
      { name: 'Earth Walk', text: 'Ignore difficult terrain made of earth or stone.', tags: ['mobility'] },
      { name: 'Merge with Stone', text: 'Pass without Trace once per long rest.', tags: ['free-spells', 'stealth'] },
    ],
    note: 'Free Pass without Trace is a party-wide stealth swing that few lineages offer.',
  },
  {
    id: 'genasi-fire',
    name: 'Fire Genasi',
    parent: 'Genasi',
    source: 'EEPC/MPMM',
    size: 'Medium',
    speed: 30,
    asi: { con: 2, int: 1 },
    traits: [
      { name: 'Darkvision 60 ft.', text: 'See in dim light as bright, darkness as dim.', tags: ['darkvision'], feet: 60 },
      { name: 'Fire Resistance', text: 'Resistance to fire damage.', tags: ['resistance'] },
      { name: 'Reach to the Blaze', text: 'Produce Flame; Burning Hands at 3rd, cast with Intelligence.', tags: ['free-spells', 'innate-caster-int'] },
    ],
    note: '+2 CON / +1 INT with fire resistance makes a durable Wizard or Artificer.',
  },
  {
    id: 'genasi-water',
    name: 'Water Genasi',
    parent: 'Genasi',
    source: 'EEPC/MPMM',
    size: 'Medium',
    speed: 30,
    asi: { con: 2, wis: 1 },
    traits: [
      { name: 'Acid Resistance', text: 'Resistance to acid damage.', tags: ['resistance'] },
      { name: 'Amphibious', text: 'Breathe air and water, 30 ft. swim speed.', tags: ['swim'] },
      { name: 'Call to the Wave', text: 'Shape Water; Create or Destroy Water at 3rd, cast with Wisdom.', tags: ['free-spells', 'innate-caster-wis'] },
    ],
    note: '+2 CON / +1 WIS is a tough Cleric or Druid chassis with a permanent swim speed.',
  },
  // ------------------------------------------------------------- Eberron
  {
    id: 'warforged',
    name: 'Warforged',
    source: 'ERLW',
    size: 'Medium',
    speed: 30,
    asi: { con: 2 },
    flexibleAsi: { amounts: [1], exclude: ['con'] },
    skillGrants: { choose: { count: 1 } },
    traits: [
      { name: 'Constructed Resilience', text: 'Advantage vs poison, resistance to poison, immune to disease, no need to eat, drink or sleep.', tags: ['advantage-saves', 'resistance', 'no-sleep'] },
      { name: 'Sentry’s Rest', text: '6 hours of inactive alertness instead of sleep.', tags: ['no-sleep'] },
      { name: 'Integrated Protection', text: '+1 AC.', tags: ['natural-armor'] },
      { name: 'Specialized Design', text: 'One skill and one tool proficiency.', tags: ['skill-prof'] },
    ],
    note: '+1 AC on top of any armor, floating +1, and near-total immunity to attrition. The most efficient frontliner lineage in the game.',
  },
  {
    id: 'changeling',
    name: 'Changeling',
    source: 'ERLW/MPMM',
    size: 'Medium',
    speed: 30,
    asi: { cha: 2 },
    flexibleAsi: { amounts: [1], exclude: ['cha'] },
    bonusSkills: 2,
    skillGrants: { choose: { count: 2, from: ['deception', 'insight', 'intimidation', 'persuasion'] } },
    traits: [
      { name: 'Shapechanger', text: 'Change appearance as an action, no action or resource cost.', tags: ['social'] },
      { name: 'Changeling Instincts', text: 'Two proficiencies from Deception, Insight, Intimidation, Persuasion.', tags: ['skill-prof', 'social'] },
    ],
    note: 'At-will, unlimited disguise with no concentration and no spell slot. Nothing else in the game does infiltration this cheaply.',
  },
  {
    id: 'kalashtar',
    name: 'Kalashtar',
    source: 'ERLW',
    size: 'Medium',
    speed: 30,
    asi: { wis: 2, cha: 1 },
    traits: [
      { name: 'Dual Mind', text: 'Advantage on all Wisdom saving throws.', tags: ['advantage-saves'] },
      { name: 'Mental Discipline', text: 'Resistance to psychic damage.', tags: ['resistance'] },
      { name: 'Mind Link', text: 'Telepathy out to a distance in miles equal to your level.' },
      { name: 'Severed from Dreams', text: 'Immune to dream-based effects.' },
    ],
    note: 'Advantage on every WIS save patches the most commonly targeted save in the game. Best-in-class for Clerics and Druids.',
  },
  // ------------------------------------------------------------- Feywild
  {
    id: 'satyr',
    name: 'Satyr',
    source: 'MOoT',
    size: 'Medium',
    speed: 35,
    asi: { cha: 2, dex: 1 },
    skillGrants: { fixed: ['performance', 'persuasion'] },
    traits: [
      { name: 'Magic Resistance', text: 'Advantage on saves vs spells and magical effects.', tags: ['advantage-saves'] },
      { name: 'Ram', text: '1d4 + STR unarmed strike.', tags: ['natural-weapon'] },
      { name: 'Mirthful Leaps', text: 'Add 1d8 feet to your jump distance.', tags: ['mobility'] },
      { name: 'Reveler', text: 'Performance and Persuasion proficiency.', tags: ['skill-prof', 'social'] },
    ],
    note: 'Magic Resistance, 35 ft. speed and +2 CHA. If the table allows Theros, this is the strongest Bard, Sorcerer and Warlock lineage available.',
  },
  {
    id: 'fairy',
    name: 'Fairy',
    source: 'WBtW',
    size: 'Small',
    speed: 30,
    asi: {},
    flexibleAsi: { amounts: [2, 1] },
    traits: [
      { name: 'Fairy Flight', text: '30 ft. flying speed at level 1 (no armor restriction in most printings).', tags: ['flight'] },
      { name: 'Fey Passage', text: 'Move through spaces as if Tiny.', tags: ['mobility'] },
      { name: 'Fairy Magic', text: 'Druidcraft; Faerie Fire and Enlarge/Reduce once per long rest each.', tags: ['free-spells'] },
    ],
    note: 'Flight at level 1 with no daily limit trivialises a huge share of tier 1-2 encounters. Expect a DM conversation.',
  },
  {
    id: 'harengon',
    name: 'Harengon',
    source: 'WBtW',
    size: 'Medium',
    speed: 30,
    asi: {},
    flexibleAsi: { amounts: [2, 1] },
    traits: [
      { name: 'Hare-Trigger', text: 'Add your proficiency bonus to initiative.', tags: ['action-economy'] },
      { name: 'Rabbit Hop', text: 'Bonus action jump, proficiency bonus times per long rest.', tags: ['mobility'] },
      { name: 'Lucky Footwork', text: 'Reaction +1d4 to a failed DEX save.', tags: ['save-reroll', 'advantage-saves'] },
    ],
    note: 'Proficiency bonus to initiative is quietly excellent - going first is the single highest-value thing a character can do.',
  },
  {
    id: 'owlin',
    name: 'Owlin',
    source: 'SCC',
    size: 'Medium',
    speed: 30,
    asi: {},
    flexibleAsi: { amounts: [2, 1] },
    skillGrants: { fixed: ['stealth'] },
    traits: [
      { name: 'Flight', text: '30 ft. flying speed while not wearing heavy armor.', tags: ['flight'] },
      { name: 'Superior Darkvision 120 ft.', text: 'Double-range darkvision.', tags: ['darkvision'], feet: 120 },
      { name: 'Silent Feathers', text: 'Stealth proficiency.', tags: ['skill-prof', 'stealth'] },
    ],
    note: 'Flying, floating ASIs, 120 ft. darkvision and free Stealth. The best generic ranged-attacker lineage if flight is allowed.',
  },
  // ----------------------------------------------------------- Custom / VRGtR
  {
    id: 'custom-lineage',
    name: 'Custom Lineage',
    source: 'TCoE',
    size: 'Medium',
    speed: 30,
    asi: {},
    flexibleAsi: { amounts: [2] },
    bonusFeat: true,
    traits: [
      { name: 'Feat', text: 'One feat of your choice at 1st level.', tags: ['bonus-feat'] },
      /*
        A choice, recorded as the darkvision half. This lineage picks either
        60 ft of darkvision *or* its proficiency bonus to initiative, and the
        build model has nowhere to store which - so the battle screen assumes
        the darkvision, exactly as it did when the range was scraped out of
        this same sentence. Written down here rather than left as an accident
        of parsing: a DM whose player took the initiative half turns the
        darkvision off on the token.
      */
      { name: 'Variable Trait', text: 'Darkvision 60 ft. or proficiency bonus to initiative.', tags: ['darkvision'], feet: 60 },
    ],
    note: 'A clean +2 to any stat plus a level 1 feat. The strictly-optimal choice when the DM allows Tasha\'s and you want a specific feat online at level 1.',
  },
  {
    id: 'reborn',
    name: 'Reborn',
    source: 'VRGtR',
    size: 'Medium',
    speed: 30,
    asi: {},
    flexibleAsi: { amounts: [2, 1] },
    traits: [
      { name: 'Deathless Nature', text: 'Advantage on death saves, no food/drink/breath, resistance to poison, immune to disease.', tags: ['advantage-saves', 'resistance', 'no-sleep'] },
      { name: 'Knowledge from a Past Life', text: 'Add 1d6 to any ability check with a skill you lack, proficiency bonus times per long rest.', tags: ['skills'] },
    ],
    note: 'Floating ASIs plus attrition immunity. Mechanically one of the most flexible lineages printed.',
  },
  {
    id: 'dhampir',
    name: 'Dhampir',
    source: 'VRGtR',
    size: 'Medium',
    speed: 35,
    asi: {},
    flexibleAsi: { amounts: [2, 1] },
    traits: [
      { name: 'Darkvision 60 ft.', text: 'See in dim light as bright, darkness as dim.', tags: ['darkvision'], feet: 60 },
      { name: 'Spider Climb', text: 'Climb speed equal to walking speed; climb sheer surfaces from level 3.', tags: ['mobility'] },
      { name: 'Vampiric Bite', text: 'Unarmed bite that heals you and grants a bonus once per long rest.', tags: ['natural-weapon'] },
      { name: 'Deathless Nature', text: 'No need to breathe.' },
    ],
    note: '35 ft. speed, spider climb and floating ASIs. Extremely strong for Rogues and Monks.',
  },
];

/** Every lineage from every ruleset. Use `racesFor` when presenting choices. */
export const RACES: Race[] = [...RACES_2014, ...SPECIES_2024];

/** Ids are unique across rulesets, so this lookup stays global - migration and
 *  import both need to resolve an id without knowing the ruleset. */
export const RACES_BY_ID: Record<string, Race> = Object.fromEntries(
  RACES.map((r) => [r.id, r]),
);

/** A record with no `rulesets` belongs to 2014 only. */
export function rulesetsOf(record: { rulesets?: Ruleset[] }): Ruleset[] {
  return record.rulesets ?? ['2014'];
}

export function racesFor(ruleset: Ruleset): Race[] {
  return visible(RACES.filter((r) => rulesetsOf(r).includes(ruleset)));
}

export function raceLineages(ruleset: Ruleset): { parent: string; races: Race[] }[] {
  const groups = new Map<string, Race[]>();
  for (const race of racesFor(ruleset)) {
    const key = race.parent ?? race.name;
    const list = groups.get(key) ?? [];
    list.push(race);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([parent, races]) => ({ parent, races }));
}
