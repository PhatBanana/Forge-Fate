import type { ClassFeature } from './classFeatures';
import { FORGE_SUBCLASS_FEATURES } from './forge/subclasses';

/**
 * What each subclass gives you, level by level.
 *
 * `classFeatures.ts` used to carry a comment saying subclass features were
 * deliberately not exhaustive, because 116 subclasses times four features is a
 * lot of entries for display value a one-line note covers better. That was
 * wrong, and the printed sheet is where it showed: a level 10 Wizard's Features
 * and Traits box listed two things, and a Life Cleric's listed nothing from the
 * Life Domain at all. The curated note tells you whether to pick a subclass; it
 * cannot tell you what to write on your sheet once you have.
 *
 * So this is the display half, keyed by subclass id. `Subclass.features` keeps
 * the engine half - the handful that change maths, like a Bladesinger's Extra
 * Attack - and `featuresFor` merges the two, preferring the engine entry where
 * both describe the same feature, so a tag is never lost.
 *
 * Rules text is summarised rather than reproduced, as everywhere else here.
 */

/** Terse constructor: a level, a name and a line. */
function f(level: number, name: string, summary: string): ClassFeature {
  return { level, name, summary };
}

export const SUBCLASS_FEATURES: Record<string, ClassFeature[]> = {
  /*
    The app's own, spread in first so a published id could never be shadowed
    by one of ours - if a Forge row ever collided with a book's, the book wins
    and the collision test in `forge.test.ts` says so.
  */
  ...FORGE_SUBCLASS_FEATURES,

  // ------------------------------------------------------------- barbarian
  'totem-warrior': [
    f(3, 'Spirit Seeker', 'Beast sense and speak with animals as rituals.'),
    f(3, 'Totem Spirit', 'Bear, eagle or wolf: resistance to everything but psychic while raging, a Dash without opportunity attacks, or advantage for your allies against anything next to you.'),
    f(6, 'Aspect of the Beast', 'Bear carrying capacity, eagle sight, or wolf tracking.'),
    f(10, 'Spirit Walker', 'Commune with nature as a ritual.'),
    f(14, 'Totemic Attunement', 'Bear forces enemies to attack you, eagle grants flight while raging, wolf knocks prone on a hit.'),
  ],
  berserker: [
    f(3, 'Frenzy', 'Rage with a bonus-action attack every turn, at the cost of a level of exhaustion afterwards.'),
    f(6, 'Mindless Rage', 'You cannot be charmed or frightened while raging.'),
    f(10, 'Intimidating Presence', 'Frighten a creature within 30 feet as an action.'),
    f(14, 'Retaliation', 'A reaction attack against anyone who damages you within 5 feet.'),
  ],
  'ancestral-guardian': [
    f(3, 'Ancestral Protectors', 'The first creature you hit each rage has disadvantage against everyone but you.'),
    f(6, 'Spirit Shield', 'Reduce damage to a nearby ally by 2d6, rising to 4d6.'),
    f(10, 'Consult the Spirits', 'Augury or clairvoyance, once per rest.'),
    f(14, 'Vengeful Ancestors', 'Spirit Shield deals the prevented damage back to the attacker.'),
  ],
  zealot: [
    f(3, 'Divine Fury', 'Extra 1d6 + half your level radiant or necrotic on your first hit each turn while raging.'),
    f(3, 'Warrior of the Gods', 'Spells that raise you need no material components.'),
    f(6, 'Fanatical Focus', 'Reroll a failed save once per rage.'),
    f(10, 'Zealous Presence', 'Advantage on attacks and saves for ten allies, once a day.'),
    f(14, 'Rage Beyond Death', 'While raging you do not fall unconscious at 0 hit points.'),
  ],
  'storm-herald': [
    f(3, 'Storm Aura', 'A 10-foot aura of desert, sea or tundra that acts each turn while you rage.'),
    f(6, 'Storm Soul', 'Resistance to your aura’s damage type, and a matching utility.'),
    f(10, 'Shielding Storm', 'Allies in your aura share that resistance.'),
    f(14, 'Raging Storm', 'Your aura punishes anyone who attacks you.'),
  ],
  beast: [
    f(3, 'Form of the Beast', 'A bite, claws or a tail while raging, each with its own rider.'),
    f(6, 'Bestial Soul', 'Your natural weapons count as magical, and you gain swimming, jumping or climbing.'),
    f(10, 'Infectious Fury', 'A hit with your natural weapon can force a target to attack an ally.'),
    f(14, 'Call the Hunt', 'Grant allies extra damage when you rage, and gain temporary hit points.'),
  ],
  giant: [
    f(3, 'Giant’s Power', 'Druidic, and either the elementalism or thorn whip cantrip.'),
    f(3, 'Giant’s Havoc', 'Grow Large while raging, with 5 feet of reach and extra elemental damage.'),
    f(6, 'Elemental Cleaver', 'Your weapon deals your chosen element, and returns when thrown.'),
    f(10, 'Mighty Impel', 'Hurl a Medium or smaller creature 30 feet.'),
    f(14, 'Demiurgic Colossus', 'Grow to Huge, with 10 feet of reach and more elemental damage.'),
  ],
  'wild-magic-barb': [
    f(3, 'Magic Awareness', 'Detect magic within 60 feet as an action.'),
    f(3, 'Wild Surge', 'A random magical effect each time you rage.'),
    f(6, 'Bolstering Magic', 'Grant an ally a d3 bonus to attacks and checks, or restore a spell slot.'),
    f(10, 'Unstable Backlash', 'Reroll your wild surge as a reaction when you are hit.'),
    f(14, 'Controlled Surge', 'Roll twice for your surge and pick.'),
  ],
  battlerager: [
    f(3, 'Battlerager Armor', 'Spiked armor lets you attack as a bonus action and damage anyone you grapple.'),
    f(6, 'Reckless Abandon', 'Temporary hit points equal to your Constitution modifier when you rage recklessly.'),
    f(10, 'Battlerager Charge', 'Dash as a bonus action while raging.'),
    f(14, 'Spiked Retribution', 'Anyone who hits you in melee takes 3 piercing damage.'),
  ],
  'world-tree': [
    f(3, 'Vitality of the Tree', 'Temporary hit points for you, and a share for an ally each turn.'),
    f(6, 'Branches of the Tree', 'Pull a creature to you as a reaction and stop it moving away.'),
    f(10, 'Battering Roots', 'Reach and a push or prone rider on your melee weapons.'),
    f(14, 'Travel along the Tree', 'Teleport yourself, and optionally your allies, while raging.'),
  ],

  // ------------------------------------------------------------------ bard
  lore: [
    f(3, 'Bonus Proficiencies', 'Three more skill proficiencies of your choice.'),
    f(3, 'Cutting Words', 'Spend inspiration as a reaction to subtract from an enemy roll.'),
    f(6, 'Additional Magical Secrets', 'Two spells from any class list.'),
    f(14, 'Peerless Skill', 'Add inspiration to your own ability checks.'),
  ],
  valor: [
    f(3, 'Bonus Proficiencies', 'Medium armor, shields and martial weapons.'),
    f(3, 'Combat Inspiration', 'Inspiration adds to an ally’s damage, or to their AC against one attack.'),
    f(14, 'Battle Magic', 'A weapon attack as a bonus action after casting a spell.'),
  ],
  swords: [
    f(3, 'Bonus Proficiencies', 'Medium armor and scimitars.'),
    f(3, 'Fighting Style', 'Duelling or two-weapon fighting.'),
    f(3, 'Blade Flourish', 'Spend inspiration on a defensive, slashing or mobile flourish when you attack.'),
    f(14, 'Master’s Flourish', 'Flourish with a d6 instead of spending inspiration.'),
  ],
  glamour: [
    f(3, 'Mantle of Inspiration', 'Temporary hit points and a free move for your allies.'),
    f(3, 'Enthralling Performance', 'Charm up to five creatures who listen for a minute.'),
    f(6, 'Mantle of Majesty', 'Command as a bonus action every turn for a minute.'),
    f(14, 'Unbreakable Majesty', 'Attackers must pass a save or lose their attack entirely.'),
  ],
  whispers: [
    f(3, 'Psychic Blades', 'Spend inspiration for 2d6 psychic damage, rising with level.'),
    f(3, 'Words of Terror', 'A minute of conversation can leave someone frightened for an hour.'),
    f(6, 'Mantle of Whispers', 'Take on the identity of someone who has just died.'),
    f(14, 'Shadow Lore', 'A whispered word can charm a creature for eight hours.'),
  ],
  eloquence: [
    f(3, 'Silver Tongue', 'Persuasion and Deception rolls of 9 or lower count as 10.'),
    f(3, 'Unsettling Words', 'Spend inspiration to subtract from an enemy’s next save.'),
    f(6, 'Unfailing Inspiration', 'Inspiration is not spent when the roll still fails.'),
    f(14, 'Infectious Inspiration', 'Grant a second die when the first one lands.'),
  ],
  creation: [
    f(3, 'Mote of Potential', 'Inspiration also grants a thunderous burst, temporary hit points or advantage.'),
    f(3, 'Performance of Creation', 'Conjure a nonmagical object once per rest.'),
    f(6, 'Animating Performance', 'Animate a Large object to fight for you.'),
    f(14, 'Creative Crescendo', 'Create several objects at once, and larger ones.'),
  ],
  spirits: [
    f(3, 'Guiding Whispers', 'Guidance at 60 feet.'),
    f(3, 'Spiritual Focus', 'A candle, censer or crystal ball adds a die to your bard spells.'),
    f(3, 'Tales from Beyond', 'Spend inspiration to roll a random narrative effect.'),
    f(14, 'Mystical Connection', 'Reroll your tale, and use one twice per rest.'),
  ],
  dance: [
    f(3, 'Bardic Dance', 'Your dance adds mobility and lets you avoid attacks.'),
    f(3, 'Dazzling Footwork', 'Unarmored AC from Charisma, and unarmed strikes as a bonus action.'),
    f(6, 'Inspiring Movement', 'Move as a reaction to reposition an ally.'),
    f(14, 'Irresistible Dance', 'Force enemies to dance along.'),
  ],

  // ---------------------------------------------------------------- cleric
  life: [
    f(1, 'Bonus Proficiency', 'Heavy armor.'),
    f(1, 'Disciple of Life', 'Every healing spell restores 2 + the spell’s level more.'),
    f(2, 'Channel Divinity: Preserve Life', 'Heal five times your level, split among nearby creatures.'),
    f(6, 'Blessed Healer', 'Healing others heals you 2 + the spell’s level as well.'),
    f(8, 'Divine Strike', 'Extra 1d8 radiant on a weapon hit once a turn, rising to 2d8.'),
    f(17, 'Supreme Healing', 'Healing dice count as their maximum.'),
  ],
  light: [
    f(1, 'Bonus Cantrip', 'Light.'),
    f(1, 'Warding Flare', 'Impose disadvantage on an attack against you as a reaction.'),
    f(2, 'Channel Divinity: Radiance of the Dawn', 'Dispel magical darkness and deal 2d10 + level radiant nearby.'),
    f(6, 'Improved Flare', 'Warding Flare protects your allies too.'),
    f(8, 'Potent Spellcasting', 'Add your Wisdom modifier to cantrip damage.'),
    f(17, 'Corona of Light', 'An aura of sunlight that gives enemies disadvantage on fire and radiant saves.'),
  ],
  war: [
    f(1, 'Bonus Proficiencies', 'Martial weapons and heavy armor.'),
    f(1, 'War Priest', 'A bonus-action weapon attack, Wisdom-modifier times per rest.'),
    f(2, 'Channel Divinity: Guided Strike', 'Add +10 to an attack roll after seeing it.'),
    f(6, 'Channel Divinity: War God’s Blessing', 'Grant an ally the same +10 as a reaction.'),
    f(8, 'Divine Strike', 'Extra 1d8 of your deity’s damage on a hit, rising to 2d8.'),
    f(17, 'Avatar of Battle', 'Resistance to bludgeoning, piercing and slashing from nonmagical weapons.'),
  ],
  tempest: [
    f(1, 'Bonus Proficiencies', 'Martial weapons and heavy armor.'),
    f(1, 'Wrath of the Storm', 'Deal 2d8 lightning or thunder as a reaction to being hit.'),
    f(2, 'Channel Divinity: Destructive Wrath', 'Maximise lightning or thunder damage.'),
    f(6, 'Thunderbolt Strike', 'Lightning damage pushes Large or smaller creatures 10 feet.'),
    f(8, 'Divine Strike', 'Extra 1d8 thunder on a hit, rising to 2d8.'),
    f(17, 'Stormborn', 'A flying speed equal to your walking speed outdoors.'),
  ],
  trickery: [
    f(1, 'Blessing of the Trickster', 'Give a creature advantage on Stealth for an hour.'),
    f(2, 'Channel Divinity: Invoke Duplicity', 'An illusory double you can cast through, and which grants advantage.'),
    f(6, 'Channel Divinity: Cloak of Shadows', 'Turn invisible for a turn.'),
    f(8, 'Divine Strike', 'Extra 1d8 poison on a hit, rising to 2d8.'),
    f(17, 'Improved Duplicity', 'Four duplicates at once, and they heal your allies.'),
  ],
  knowledge: [
    f(1, 'Blessings of Knowledge', 'Two languages, and expertise in two knowledge skills.'),
    f(2, 'Channel Divinity: Knowledge of the Ages', 'Proficiency with any skill or tool for ten minutes.'),
    f(6, 'Channel Divinity: Read Thoughts', 'Read a creature’s mind, and cast suggestion on it with no save.'),
    f(8, 'Potent Spellcasting', 'Add your Wisdom modifier to cantrip damage.'),
    f(17, 'Visions of the Past', 'Read the history of an object or a place.'),
  ],
  nature: [
    f(1, 'Acolyte of Nature', 'A druid cantrip and a nature skill.'),
    f(1, 'Bonus Proficiency', 'Heavy armor.'),
    f(2, 'Channel Divinity: Charm Animals and Plants', 'Charm beasts and plants within 30 feet.'),
    f(6, 'Dampen Elements', 'Halve acid, cold, fire, lightning or thunder damage as a reaction.'),
    f(8, 'Divine Strike', 'Extra 1d8 cold, fire or lightning on a hit, rising to 2d8.'),
    f(17, 'Master of Nature', 'Command the creatures you have charmed.'),
  ],
  death: [
    f(1, 'Bonus Proficiency', 'Martial weapons.'),
    f(1, 'Reaper', 'A necromancy cantrip that targets one creature can target two.'),
    f(2, 'Channel Divinity: Touch of Death', 'Extra 5 + twice your level necrotic on a melee hit.'),
    f(6, 'Inescapable Destruction', 'Your necrotic damage ignores resistance.'),
    f(8, 'Divine Strike', 'Extra 1d8 necrotic on a hit, rising to 2d8.'),
    f(17, 'Improved Reaper', 'Necromancy spells of 5th level or lower can target two creatures.'),
  ],
  forge: [
    f(1, 'Bonus Proficiencies', 'Heavy armor and smith’s tools.'),
    f(1, 'Blessing of the Forge', 'Grant a weapon or armor a +1 bonus each day.'),
    f(2, 'Channel Divinity: Artisan’s Blessing', 'Craft a simple metal item in an hour.'),
    f(6, 'Soul of the Forge', '+1 AC in heavy armor, and resistance to fire.'),
    f(8, 'Divine Strike', 'Extra 1d8 fire on a hit, rising to 2d8.'),
    f(17, 'Saint of Forge and Fire', 'Immunity to fire, and resistance to nonmagical weapons in heavy armor.'),
  ],
  grave: [
    f(1, 'Circle of Mortality', 'Healing at 0 hit points counts its dice as maximum, and spare the dying at 30 feet.'),
    f(1, 'Eyes of the Grave', 'Sense undead within 60 feet.'),
    f(2, 'Channel Divinity: Path to the Grave', 'A creature becomes vulnerable to the next attack that hits it.'),
    f(6, 'Sentinel at Death’s Door', 'Turn a critical hit against a nearby creature into an ordinary one.'),
    f(8, 'Potent Spellcasting', 'Add your Wisdom modifier to cantrip damage.'),
    f(17, 'Keeper of Souls', 'A dying enemy heals a nearby ally.'),
  ],
  arcana: [
    f(1, 'Arcane Initiate', 'Arcana proficiency and two wizard cantrips.'),
    f(2, 'Channel Divinity: Arcane Abjuration', 'Turn a celestial, elemental, fey or fiend.'),
    f(6, 'Spell Breaker', 'Your healing spells also end one spell on the target.'),
    f(8, 'Potent Spellcasting', 'Add your Wisdom modifier to cantrip damage.'),
    f(17, 'Arcane Mastery', 'Four wizard spells of 6th to 9th level join your list.'),
  ],
  order: [
    f(1, 'Bonus Proficiencies', 'Heavy armor, and Intimidation or Persuasion.'),
    f(1, 'Voice of Authority', 'An ally you heal with a slot gets a free weapon attack.'),
    f(2, 'Channel Divinity: Order’s Demand', 'Charm every creature of your choice within 30 feet.'),
    f(6, 'Embodiment of the Law', 'Cast enchantment spells as a bonus action.'),
    f(8, 'Divine Strike', 'Extra 1d8 psychic on a hit, rising to 2d8.'),
    f(17, 'Order’s Wrath', 'Your Divine Strike marks a target for extra psychic damage from allies.'),
  ],
  peace: [
    f(1, 'Implement of Peace', 'Insight, Performance or Persuasion.'),
    f(1, 'Emboldening Bond', 'Bond several creatures so each can add a d4 when near another.'),
    f(2, 'Channel Divinity: Balm of Peace', 'Move without provoking and heal everyone you pass.'),
    f(6, 'Protective Bond', 'A bonded creature can teleport to take damage for another.'),
    f(8, 'Potent Spellcasting', 'Add your Wisdom modifier to cantrip damage.'),
    f(17, 'Expansive Bond', 'The bond reaches 60 feet and halves the damage taken.'),
  ],
  twilight: [
    f(1, 'Bonus Proficiencies', 'Martial weapons and heavy armor.'),
    f(1, 'Eyes of Night', 'Darkvision to 300 feet, and you can share it.'),
    f(1, 'Vigilant Blessing', 'Give a creature advantage on its next initiative roll.'),
    f(2, 'Channel Divinity: Twilight Sanctuary', 'An aura granting temporary hit points or ending charm and fear each turn.'),
    f(6, 'Steps of Night', 'A flying speed in dim light or darkness.'),
    f(8, 'Divine Strike', 'Extra 1d8 radiant on a hit, rising to 2d8.'),
    f(17, 'Twilight Shroud', 'Your sanctuary also grants half cover.'),
  ],

  // ----------------------------------------------------------------- druid
  land: [
    f(2, 'Bonus Cantrip', 'One more druid cantrip.'),
    f(2, 'Natural Recovery', 'Recover half your level in spell slots on a short rest.'),
    f(3, 'Circle Spells', 'Extra spells from your chosen land, always prepared.'),
    f(6, 'Land’s Stride', 'Difficult terrain from plants costs nothing, and they cannot hinder you.'),
    f(10, 'Nature’s Ward', 'Immune to poison and disease, and elementals and fey cannot charm or frighten you.'),
    f(14, 'Nature’s Sanctuary', 'Beasts and plants must pass a save to attack you.'),
  ],
  moon: [
    f(2, 'Combat Wild Shape', 'Wild Shape as a bonus action, and spend slots to heal in form.'),
    f(2, 'Circle Forms', 'Beasts up to challenge rating equal to a third of your level.'),
    f(6, 'Primal Strike', 'Your beast attacks count as magical.'),
    f(10, 'Elemental Wild Shape', 'Become an air, earth, fire or water elemental for two uses.'),
    f(14, 'Thousand Forms', 'Alter self at will.'),
  ],
  shepherd: [
    f(2, 'Speech of the Woods', 'Speak Sylvan and communicate with beasts.'),
    f(2, 'Spirit Totem', 'A bear, hawk or unicorn spirit in a 30-foot aura.'),
    f(6, 'Mighty Summoner', 'Summoned beasts and fey gain hit points and magical attacks.'),
    f(10, 'Guardian Spirit', 'Your summons heal at the start of their turns in your aura.'),
    f(14, 'Faithful Summons', 'Four dire wolves appear to defend you when you drop.'),
  ],
  dreams: [
    f(2, 'Balm of the Summer Court', 'A pool of d6s that heals and grants temporary hit points.'),
    f(6, 'Hearth of Moonlight and Shadow', 'A camp that hides you and grants advantage on Stealth and Perception.'),
    f(10, 'Hidden Paths', 'Teleport yourself or an ally 60 feet as a bonus action.'),
    f(14, 'Walker in Dreams', 'Dream, scrying or teleportation circle once per rest.'),
  ],
  spores: [
    f(2, 'Halo of Spores', 'Reaction damage to anything that comes within 10 feet.'),
    f(2, 'Symbiotic Entity', 'Spend Wild Shape for temporary hit points and doubled spore damage.'),
    f(6, 'Fungal Infestation', 'Raise a fallen beast or humanoid as a zombie for an hour.'),
    f(10, 'Spreading Spores', 'Throw your halo out to a 10-foot cube.'),
    f(14, 'Fungal Body', 'Immune to blinding, deafening, fright and poison, and critical hits are ordinary.'),
  ],
  stars: [
    f(2, 'Star Map', 'Guiding bolt and an always-prepared spell.'),
    f(2, 'Starry Form', 'Archer, chalice or dragon: a bonus-action attack, healing, or steady concentration.'),
    f(6, 'Cosmic Omen', 'A reaction bonus or penalty to rolls near you.'),
    f(10, 'Twinkling Constellations', 'Your starry forms improve, and the dragon flies.'),
    f(14, 'Full of Stars', 'Resistance to bludgeoning, piercing and slashing in starry form.'),
  ],
  wildfire: [
    f(2, 'Summon Wildfire Spirit', 'A fiery companion that teleports you and burns what it lands near.'),
    f(6, 'Enhanced Bond', 'Extra dice on fire and healing spells cast near your spirit.'),
    f(10, 'Cauterizing Flames', 'A death near you heals or harms.'),
    f(14, 'Blazing Revival', 'Your spirit can bring you back from 0 hit points.'),
  ],
  sea: [
    f(2, 'Wrath of the Sea', 'An emanation that pushes and damages with cold.'),
    f(6, 'Aquatic Affinity', 'Your emanation grows, and you gain a swimming speed.'),
    f(10, 'Stormborn', 'A flying speed while your emanation is active.'),
    f(14, 'Oceanic Gift', 'Give your emanation to an ally.'),
  ],

  // --------------------------------------------------------------- fighter
  champion: [
    f(3, 'Improved Critical', 'Critical hits on a 19 or 20.'),
    f(7, 'Remarkable Athlete', 'Half proficiency on Strength, Dexterity and Constitution checks, and a longer running jump.'),
    f(10, 'Additional Fighting Style', 'A second fighting style.'),
    f(15, 'Superior Critical', 'Critical hits on an 18, 19 or 20.'),
    f(18, 'Survivor', 'Regain 5 + Constitution hit points each turn below half.'),
  ],
  'battle-master': [
    f(3, 'Combat Superiority', 'Four d8 superiority dice and three maneuvers.'),
    f(3, 'Student of War', 'One artisan’s tool proficiency.'),
    f(7, 'Know Your Enemy', 'Study a creature for a minute to learn how it compares to you.'),
    f(10, 'Improved Combat Superiority', 'Superiority dice become d10s, and d12s at 18.'),
    f(15, 'Relentless', 'Regain a superiority die when you have none and roll initiative.'),
  ],
  'eldritch-knight': [
    f(3, 'Weapon Bond', 'Bond up to two weapons: they cannot be disarmed, and you can summon them.'),
    f(3, 'Spellcasting', 'Wizard spells on Intelligence, mostly abjuration and evocation.'),
    f(7, 'War Magic', 'A weapon attack as a bonus action after a cantrip.'),
    f(10, 'Eldritch Strike', 'A hit gives the target disadvantage on your next spell save.'),
    f(15, 'Arcane Charge', 'Action Surge also teleports you 30 feet.'),
    f(18, 'Improved War Magic', 'The bonus attack follows any spell, not just a cantrip.'),
  ],
  'arcane-archer': [
    f(3, 'Arcane Archer Lore', 'Arcana or Nature, plus prestidigitation or druidcraft.'),
    f(3, 'Arcane Shot', 'Two magical arrow effects, twice per rest.'),
    f(7, 'Magic Arrow', 'Your arrows count as magical.'),
    f(7, 'Curving Shot', 'Reroll a missed arrow against another target.'),
    f(15, 'Ever-Ready Shot', 'Regain an Arcane Shot when you roll initiative with none.'),
  ],
  cavalier: [
    f(3, 'Bonus Proficiency', 'A skill or a language.'),
    f(3, 'Born to the Saddle', 'Mount and dismount cheaply, and you rarely fall off.'),
    f(3, 'Unwavering Mark', 'Mark a creature you hit: it has disadvantage against others, and you punish it.'),
    f(7, 'Warding Maneuver', 'Add a d8 to an ally’s AC as a reaction.'),
    f(10, 'Hold the Line', 'Opportunity attacks stop movement and knock prone.'),
    f(18, 'Vigilant Defender', 'A reaction attack on every other creature’s turn.'),
  ],
  samurai: [
    f(3, 'Bonus Proficiency', 'A social skill or a language.'),
    f(3, 'Fighting Spirit', 'Advantage on your attacks and 5 temporary hit points, three times per rest.'),
    f(7, 'Elegant Courtier', 'Wisdom saves, and Charisma on Persuasion.'),
    f(10, 'Tireless Spirit', 'Regain a Fighting Spirit on initiative.'),
    f(15, 'Rapid Strike', 'Trade advantage for an extra attack.'),
    f(18, 'Strength before Death', 'Take a whole extra turn when you drop to 0.'),
  ],
  'psi-warrior': [
    f(3, 'Psionic Power', 'Psionic energy dice fuelling a damage rider, a shield and telekinetic shoves.'),
    f(7, 'Telekinetic Adept', 'A telekinetic thrust, and a psi-powered leap.'),
    f(10, 'Guarded Mind', 'Resistance to psychic damage, and you can shake off charm and fear.'),
    f(15, 'Bulwark of Force', 'Give allies half cover for a minute.'),
    f(18, 'Telekinetic Master', 'Telekinesis at will, with a free attack each turn.'),
  ],
  'rune-knight': [
    f(3, 'Bonus Proficiencies', 'Giant, and smith’s tools.'),
    f(3, 'Rune Carver', 'Carve runes into your gear for passive bonuses and once-per-rest effects.'),
    f(3, 'Giant’s Might', 'Grow one size, with advantage on Strength and extra damage.'),
    f(7, 'Runic Shield', 'Force an attacker to reroll against an ally.'),
    f(10, 'Great Stature', 'Giant’s Might damage rises, and you grow taller for good.'),
    f(15, 'Master of Runes', 'Use each rune twice per rest.'),
    f(18, 'Runic Juggernaut', 'Grow to Huge, with 10 feet of reach.'),
  ],
  'echo-knight': [
    f(3, 'Manifest Echo', 'A duplicate you can swap places with and attack through.'),
    f(3, 'Unleash Incarnation', 'An extra attack from your echo, Constitution-modifier times per rest.'),
    f(7, 'Echo Avatar', 'See and hear through your echo up to 1,000 feet away.'),
    f(10, 'Shadow Martyr', 'Your echo takes an attack meant for an ally.'),
    f(15, 'Reclaim Potential', 'Temporary hit points when your echo is destroyed.'),
    f(18, 'Legion of One', 'Two echoes at once, and Unleash Incarnation recharges on initiative.'),
  ],

  // ------------------------------------------------------------------ monk
  'open-hand': [
    f(3, 'Open Hand Technique', 'Flurry of Blows can knock prone, push, or deny reactions.'),
    f(6, 'Wholeness of Body', 'Heal three times your level, once a day.'),
    f(11, 'Tranquility', 'A sanctuary effect on you after every long rest.'),
    f(17, 'Quivering Palm', 'Set lethal vibrations in a creature, and end them at will.'),
  ],
  shadow: [
    f(3, 'Shadow Arts', 'Darkness, darkvision, pass without trace and silence for ki.'),
    f(6, 'Shadow Step', 'Teleport 60 feet between shadows, with advantage on your next melee attack.'),
    f(11, 'Cloak of Shadows', 'Turn invisible in dim light or darkness.'),
    f(17, 'Opportunist', 'A reaction attack when a nearby creature is hit by someone else.'),
  ],
  'four-elements': [
    f(3, 'Disciple of the Elements', 'Elemental disciplines that spend ki to cast spells.'),
    f(6, 'Extra Discipline', 'More disciplines and higher-level effects as you rise.'),
    f(11, 'Elemental Mastery', 'The strongest disciplines, at a heavy ki cost.'),
    f(17, 'Master of the Elements', 'Your full discipline list, and the biggest spells.'),
  ],
  'sun-soul': [
    f(3, 'Radiant Sun Bolt', 'A ranged spell attack for 1d4 + your modifier, as part of a flurry.'),
    f(6, 'Searing Arc Strike', 'Burning hands as a bonus action after an attack.'),
    f(11, 'Searing Sunburst', 'A 20-foot sphere of radiant damage.'),
    f(17, 'Sun Shield', 'Shed light, and burn anyone who hits you in melee.'),
  ],
  kensei: [
    f(3, 'Path of the Kensei', 'Two kensei weapons, an agile parry, and a shot that deals extra damage.'),
    f(6, 'Magic Kensei Weapons', 'Your kensei weapons count as magical.'),
    f(11, 'Sharpen the Blade', 'Spend ki for up to +3 on attack and damage.'),
    f(17, 'Unerring Accuracy', 'Reroll a missed attack once a turn.'),
  ],
  'drunken-master': [
    f(3, 'Bonus Proficiencies', 'Performance, and brewer’s supplies.'),
    f(3, 'Drunken Technique', 'Flurry of Blows also grants a Disengage and extra movement.'),
    f(6, 'Tipsy Sway', 'Stand from prone cheaply, and redirect a missed attack at another creature.'),
    f(11, 'Drunkard’s Luck', 'Spend ki to cancel disadvantage.'),
    f(17, 'Intoxicated Frenzy', 'Three extra Flurry attacks against separate targets.'),
  ],
  'long-death': [
    f(3, 'Touch of Death', 'Temporary hit points when you drop a creature to 0.'),
    f(6, 'Hour of Reaping', 'Frighten everything within 30 feet as an action.'),
    f(11, 'Mastery of Death', 'Spend ki to stay at 1 hit point instead of dropping.'),
    f(17, 'Touch of the Long Death', 'Up to 10d10 necrotic to a creature you touch.'),
  ],
  'astral-self': [
    f(3, 'Arms of the Astral Self', 'Spectral arms that use Wisdom to hit and reach 10 feet.'),
    f(6, 'Visage of the Astral Self', 'Darkvision, a fear effect, and Wisdom on Insight and Intimidation.'),
    f(11, 'Body of the Astral Self', 'A full spectral body that deflects damage and adds to your strikes.'),
    f(17, 'Awakened Astral Self', 'Armor of the astral self, and a third arm attack.'),
  ],
  mercy: [
    f(3, 'Implements of Mercy', 'Insight, Medicine and a herbalism kit.'),
    f(3, 'Hand of Healing', 'Spend ki to heal instead of striking.'),
    f(3, 'Hand of Harm', 'Extra necrotic damage on an unarmed hit.'),
    f(6, 'Physician’s Touch', 'Your healing cures conditions, and your harm poisons.'),
    f(11, 'Flurry of Healing and Harm', 'Heal or harm as part of a flurry, for free.'),
    f(17, 'Hand of Ultimate Mercy', 'Return a creature dead less than 24 hours to life.'),
  ],
  'ascendant-dragon': [
    f(3, 'Draconic Disciple', 'Draconic, a Charisma reroll, and a breath weapon in place of an unarmed strike.'),
    f(6, 'Breath of the Dragon', 'A cone or line of your chosen damage type.'),
    f(11, 'Wings Unfurled', 'A flying speed after you Dash.'),
    f(17, 'Ascendant Aspect', 'Blindsight, a wider breath, and an aura granting resistance.'),
  ],

  // --------------------------------------------------------------- paladin
  devotion: [
    f(3, 'Channel Divinity: Sacred Weapon', 'Add your Charisma to attack rolls, and your weapon glows and counts as magical.'),
    f(3, 'Channel Divinity: Turn the Unholy', 'Turn fiends and undead.'),
    f(7, 'Aura of Devotion', 'You and nearby allies cannot be charmed.'),
    f(15, 'Purity of Spirit', 'Protection from evil and good, always on.'),
    f(20, 'Holy Nimbus', 'A sunlit aura that burns your enemies and gives you advantage against their spells.'),
  ],
  oathbreaker: [
    f(3, 'Channel Divinity: Control Undead', 'Take command of an undead creature for a day.'),
    f(3, 'Channel Divinity: Dreadful Aspect', 'Frighten everything within 30 feet for a minute.'),
    f(7, 'Aura of Hate', 'You and nearby fiends and undead add your Charisma to melee damage.'),
    f(15, 'Supernatural Resistance', 'Resistance to nonmagical bludgeoning, piercing and slashing.'),
    f(20, 'Dread Lord', 'An aura of darkness that frightens, damages, and hides you from attacks.'),
  ],
  vengeance: [
    f(3, 'Channel Divinity: Abjure Enemy', 'Frighten and halt a creature for a minute.'),
    f(3, 'Channel Divinity: Vow of Enmity', 'Advantage on every attack against one creature.'),
    f(7, 'Relentless Avenger', 'Move half your speed after an opportunity attack, without provoking.'),
    f(15, 'Soul of Vengeance', 'A reaction attack against a creature under your vow.'),
    f(20, 'Avenging Angel', 'Flight, and an aura that frightens.'),
  ],
  ancients: [
    f(3, 'Channel Divinity: Nature’s Wrath', 'Restrain a creature in spectral vines.'),
    f(3, 'Channel Divinity: Turn the Faithless', 'Turn fey and fiends, and reveal their true forms.'),
    f(7, 'Aura of Warding', 'You and nearby allies resist damage from spells.'),
    f(15, 'Undying Sentinel', 'Drop to 1 hit point instead of 0, once per long rest.'),
    f(20, 'Elder Champion', 'Regain hit points each turn, cast spells as a bonus action, and force save disadvantage.'),
  ],
  conquest: [
    f(3, 'Channel Divinity: Conquering Presence', 'Frighten everything within 30 feet.'),
    f(3, 'Channel Divinity: Guided Strike', 'Add +10 to an attack roll.'),
    f(7, 'Aura of Conquest', 'Frightened creatures near you cannot move and take psychic damage.'),
    f(15, 'Scornful Rebuke', 'Anyone who hits you takes psychic damage.'),
    f(20, 'Invincible Conqueror', 'Resistance to all damage, an extra attack, and crits on 19.'),
  ],
  redemption: [
    f(3, 'Channel Divinity: Emissary of Peace', 'A +5 bonus to Persuasion.'),
    f(3, 'Channel Divinity: Rebuke the Violent', 'Reflect damage back at an attacker.'),
    f(7, 'Aura of the Guardian', 'Take the damage your allies would suffer.'),
    f(15, 'Protective Spirit', 'Regain hit points each turn below half in combat.'),
    f(20, 'Emissary of Redemption', 'Resistance to all damage from creatures, and it reflects back at them.'),
  ],
  crown: [
    f(3, 'Channel Divinity: Champion Challenge', 'Nearby creatures cannot move away from you.'),
    f(3, 'Channel Divinity: Turn the Tide', 'Heal every bloodied ally nearby.'),
    f(7, 'Divine Allegiance', 'Take the damage an ally would suffer.'),
    f(15, 'Unyielding Saint', 'Advantage on Strength and Constitution saves.'),
    f(20, 'Exalted Champion', 'Resistance to nonmagical weapons, and advantage on death and Wisdom saves for the party.'),
  ],
  glory: [
    f(3, 'Channel Divinity: Peerless Athlete', 'Advantage on Athletics and Acrobatics, and a longer jump.'),
    f(3, 'Channel Divinity: Inspiring Smite', 'Share temporary hit points after a Divine Smite.'),
    f(7, 'Aura of Alacrity', 'Your speed rises by 10 feet, and allies who join you gain the same.'),
    f(15, 'Glorious Defense', 'Add your Charisma to an ally’s AC and counterattack.'),
    f(20, 'Living Legend', 'Advantage on Charisma checks, a reroll on missed attacks, and saves you cannot fail.'),
  ],
  watchers: [
    f(3, 'Channel Divinity: Watcher’s Will', 'Advantage on Intelligence, Wisdom and Charisma saves for you and your allies.'),
    f(3, 'Channel Divinity: Abjure the Extraplanar', 'Turn aberrations, celestials, elementals, fey and fiends.'),
    f(7, 'Aura of the Sentinel', 'You and nearby allies add your proficiency bonus to initiative.'),
    f(15, 'Vigilant Rebuke', 'Damage anyone who forces you to make an Intelligence, Wisdom or Charisma save.'),
    f(20, 'Mortal Bulwark', 'Truesight, advantage against extraplanar creatures, and a hit can banish one.'),
  ],

  // ---------------------------------------------------------------- ranger
  hunter: [
    f(3, 'Hunter’s Prey', 'Colossus Slayer, Giant Killer or Horde Breaker.'),
    f(7, 'Defensive Tactics', 'Escape the Horde, Multiattack Defense or Steel Will.'),
    f(11, 'Multiattack', 'Volley or Whirlwind Attack.'),
    f(15, 'Superior Hunter’s Defense', 'Evasion, Stand Against the Tide, Uncanny Dodge or Multiattack Defense.'),
  ],
  'gloom-stalker': [
    f(3, 'Dread Ambusher', 'Bonus initiative, an extra attack and extra damage on your first turn.'),
    f(3, 'Umbral Sight', 'Darkvision, and you are invisible to anything relying on it.'),
    f(7, 'Iron Mind', 'Wisdom saves, or Intelligence or Charisma.'),
    f(11, 'Stalker’s Flurry', 'Reroll a miss once a turn.'),
    f(15, 'Shadowy Dodge', 'Impose disadvantage on an attack as a reaction.'),
  ],
  'beast-master': [
    f(3, 'Ranger’s Companion', 'A beast that acts on your command and shares your proficiency bonus.'),
    f(7, 'Exceptional Training', 'Your companion can Dash, Disengage, Dodge or Help, and its attacks count as magical.'),
    f(11, 'Bestial Fury', 'Your companion attacks twice.'),
    f(15, 'Share Spells', 'Spells you target on yourself also affect your companion.'),
  ],
  'monster-slayer': [
    f(3, 'Hunter’s Sense', 'Learn a creature’s immunities, resistances and vulnerabilities.'),
    f(3, 'Slayer’s Prey', 'Extra 1d6 damage on your first hit each turn against a marked creature.'),
    f(7, 'Supernatural Defense', 'Add a d6 to saves and escape attempts against your prey.'),
    f(11, 'Magic-User’s Nemesis', 'Force a caster to fail a spell as a reaction.'),
    f(15, 'Slayer’s Counter', 'Attack in response to a save your prey forces, and succeed on a hit.'),
  ],
  'horizon-walker': [
    f(3, 'Detect Portal', 'Sense a planar portal within a mile.'),
    f(3, 'Planar Warrior', 'Convert your weapon damage to force, with an extra 1d8.'),
    f(7, 'Ethereal Step', 'Etherealness for one turn, once per rest.'),
    f(11, 'Distant Strike', 'Teleport 10 feet before each attack, and strike a third target.'),
    f(15, 'Spectral Defense', 'Halve the damage of an attack as a reaction.'),
  ],
  'fey-wanderer': [
    f(3, 'Dreadful Strikes', 'Extra 1d4 psychic on your first hit each turn.'),
    f(3, 'Otherworldly Glamour', 'Add your Wisdom to every Charisma check, and one social skill.'),
    f(7, 'Beguiling Twist', 'Advantage against charm and fear, and you can redirect it.'),
    f(11, 'Fey Reinforcements', 'Summon fey without a slot, once per rest.'),
    f(15, 'Misty Wanderer', 'Misty step Wisdom-modifier times per rest, bringing an ally.'),
  ],
  drakewarden: [
    f(3, 'Draconic Gift', 'Thaumaturgy, and you speak Draconic.'),
    f(3, 'Drake Companion', 'A drake that fights beside you and shares your proficiency bonus.'),
    f(7, 'Bond of Fang and Scale', 'Your drake grows, resists its element, and lends you and your allies its breath.'),
    f(11, 'Drake’s Breath', 'A 30-foot cone from your drake, once per rest.'),
    f(15, 'Perfected Bond', 'The drake becomes Large enough to ride and gains a flying speed.'),
  ],
  swarmkeeper: [
    f(3, 'Gathered Swarm', 'A swarm that adds damage and moves you or your target.'),
    f(7, 'Writhing Tide', 'A flying speed of 10 feet for a turn.'),
    f(11, 'Mighty Swarm', 'Your swarm knocks prone, moves further and grants half cover.'),
    f(15, 'Swarming Dispersal', 'Resistance to damage, and teleport 30 feet as a reaction.'),
  ],

  // ----------------------------------------------------------------- rogue
  thief: [
    f(3, 'Fast Hands', 'Sleight of Hand, thieves’ tools or Use an Object as a bonus action.'),
    f(3, 'Second-Story Work', 'Climbing costs no extra movement, and you jump further.'),
    f(9, 'Supreme Sneak', 'Advantage on Stealth when you move at half speed.'),
    f(13, 'Use Magic Device', 'Ignore class, race and level requirements on magic items.'),
    f(17, 'Thief’s Reflexes', 'Two turns in the first round of combat.'),
  ],
  assassin: [
    f(3, 'Bonus Proficiencies', 'A disguise kit and a poisoner’s kit.'),
    f(3, 'Assassinate', 'Advantage against anything slower than you, and hits on surprised creatures are critical.'),
    f(9, 'Infiltration Expertise', 'Build a false identity in seven days.'),
    f(13, 'Impostor', 'Mimic someone’s speech, writing and behaviour.'),
    f(17, 'Death Strike', 'Double all your damage against a surprised target.'),
  ],
  'arcane-trickster': [
    f(3, 'Spellcasting', 'Wizard spells on Intelligence, mostly enchantment and illusion.'),
    f(3, 'Mage Hand Legerdemain', 'An invisible mage hand that picks pockets and locks.'),
    f(9, 'Magical Ambush', 'Disadvantage on saves against your spells while you are hidden.'),
    f(13, 'Versatile Trickster', 'Use mage hand to grant yourself advantage.'),
    f(17, 'Spell Thief', 'Steal a spell cast at you for eight hours.'),
  ],
  swashbuckler: [
    f(3, 'Fancy Footwork', 'A creature you attack cannot make opportunity attacks against you.'),
    f(3, 'Rakish Audacity', 'Add Charisma to initiative, and Sneak Attack in a one-on-one duel.'),
    f(9, 'Panache', 'Charm a creature into following you, or taunt it into attacking only you.'),
    f(13, 'Elegant Maneuver', 'Advantage on your next Acrobatics or Athletics check.'),
    f(17, 'Master Duelist', 'Reroll a missed attack with advantage.'),
  ],
  mastermind: [
    f(3, 'Master of Intrigue', 'Disguise kit, forgery kit, a gaming set, two languages, and mimicry.'),
    f(3, 'Master of Tactics', 'Help as a bonus action, at 30 feet.'),
    f(9, 'Insightful Manipulator', 'Learn how a creature compares to you after a minute of watching.'),
    f(13, 'Misdirection', 'Redirect an attack on you to a nearby creature.'),
    f(17, 'Soul of Deceit', 'Your thoughts cannot be read, and you can lie to divination.'),
  ],
  inquisitive: [
    f(3, 'Ear for Deceit', 'Insight checks to spot a lie score at least 8.'),
    f(3, 'Eye for Detail', 'Perception and Investigation as a bonus action.'),
    f(3, 'Insightful Fighting', 'Read a creature to Sneak Attack it without advantage.'),
    f(9, 'Steady Eye', 'Advantage on Perception and Investigation when you move slowly.'),
    f(13, 'Unerring Eye', 'Sense illusions and shapechangers within 30 feet.'),
    f(17, 'Eye for Weakness', 'Extra 3d6 Sneak Attack against a creature you have read.'),
  ],
  scout: [
    f(3, 'Skirmisher', 'Move half your speed as a reaction when an enemy ends its turn near you.'),
    f(3, 'Survivalist', 'Expertise in Nature and Survival.'),
    f(9, 'Superior Mobility', 'Your walking speed rises by 10 feet.'),
    f(13, 'Ambush Master', 'Advantage on initiative, and your allies get advantage on your first target.'),
    f(17, 'Sudden Strike', 'A bonus-action attack that can also Sneak Attack.'),
  ],
  phantom: [
    f(3, 'Whispers of the Dead', 'A new skill or tool proficiency after every rest.'),
    f(3, 'Wails from the Grave', 'Half your Sneak Attack again, to a second creature.'),
    f(9, 'Tokens of the Departed', 'Soul trinkets that grant advantage on saves and fuel your wails.'),
    f(13, 'Ghost Walk', 'Fly, pass through creatures, and resist most damage.'),
    f(17, 'Death’s Friend', 'Your wails trigger on every Sneak Attack.'),
  ],
  soulknife: [
    f(3, 'Psi-Bolstered Knack', 'Psionic dice that rescue failed ability checks.'),
    f(3, 'Psychic Blades', 'Conjured blades that hit with finesse and throw 60 feet.'),
    f(3, 'Psychic Whispers', 'Telepathy with several creatures for hours.'),
    f(9, 'Soul Blades', 'Reroll a missed blade, or teleport with one.'),
    f(13, 'Psychic Veil', 'Invisibility for an hour, once per rest.'),
    f(17, 'Rend Mind', 'A Sneak Attack can stun for a minute.'),
  ],

  // -------------------------------------------------------------- sorcerer
  draconic: [
    f(1, 'Dragon Ancestor', 'Draconic, and double your Charisma when dealing with dragons.'),
    f(1, 'Draconic Resilience', 'One more hit point per level, and unarmored AC of 13 + Dexterity.'),
    f(6, 'Elemental Affinity', 'Add your Charisma to your ancestry’s damage type, and spend a point for resistance.'),
    f(14, 'Dragon Wings', 'A flying speed equal to your walking speed, at will.'),
    f(18, 'Draconic Presence', 'An aura that charms or frightens.'),
  ],
  'wild-magic': [
    f(1, 'Wild Magic Surge', 'A 1-in-20 chance of a random magical effect on every spell.'),
    f(1, 'Tides of Chaos', 'Advantage on one roll, at the cost of a guaranteed surge.'),
    f(6, 'Bend Luck', 'Spend a point to add or subtract a d4 from anyone’s roll.'),
    f(14, 'Controlled Chaos', 'Roll twice on the surge table and pick.'),
    f(18, 'Spell Bombardment', 'Reroll your highest damage die and add it.'),
  ],
  'divine-soul': [
    f(1, 'Divine Magic', 'The whole cleric list joins yours, plus an affinity spell.'),
    f(1, 'Favored by the Gods', 'Add 2d4 to a failed save or missed attack, once per rest.'),
    f(6, 'Empowered Healing', 'Reroll your healing dice.'),
    f(14, 'Otherworldly Wings', 'A flying speed of 30 feet.'),
    f(18, 'Unearthly Recovery', 'Heal half your maximum when you drop below it.'),
  ],
  'shadow-magic': [
    f(1, 'Eyes of the Dark', 'Darkvision to 120 feet, and darkness as a sorcerer spell.'),
    f(1, 'Strength of the Grave', 'Stay at 1 hit point on a Charisma save when you drop.'),
    f(6, 'Hound of Ill Omen', 'A dire wolf of shadow that hounds one creature.'),
    f(14, 'Shadow Walk', 'Teleport 120 feet in dim light or darkness.'),
    f(18, 'Umbral Form', 'Become shadow: resistance to everything but force and radiant, and pass through objects.'),
  ],
  'lunar-sorcery': [
    f(1, 'Lunar Embodiment', 'Extra spells, and sorcery points can cast your phase spells.'),
    f(1, 'Moon Fire', 'A phase of the moon each day - full, new or crescent - each with its own list.'),
    f(6, 'Lunar Boons', 'Add your Charisma to the damage or healing of your phase spells.'),
    f(14, 'Waxing and Waning', 'Change phase as a bonus action, and gain a matching resistance.'),
    f(18, 'Lunar Empowerment', 'Your phase grants light, blindsight or invisibility besides.'),
  ],
  'storm-sorcery': [
    f(1, 'Wind Speaker', 'Primordial and its dialects.'),
    f(1, 'Tempestuous Magic', 'Fly 10 feet without provoking after any spell of 1st level or higher.'),
    f(6, 'Heart of the Storm', 'Lightning or thunder damage to everyone near you when you cast.'),
    f(6, 'Storm Guide', 'Stop rain around you, and steer the wind.'),
    f(14, 'Storm’s Fury', 'Damage and push an attacker as a reaction.'),
    f(18, 'Wind Soul', 'Immunity to lightning and thunder, a 60-foot flying speed, and you can share it.'),
  ],
  'aberrant-mind': [
    f(1, 'Telepathic Speech', 'Speak mind to mind with any creature you can see.'),
    f(1, 'Psionic Spells', 'Extra spells, and sorcery points can replace their components.'),
    f(6, 'Psionic Sorcery', 'Cast your psionic spells with points instead of slots, silently.'),
    f(6, 'Psychic Defenses', 'Resistance to psychic, and advantage against charm and fear.'),
    f(14, 'Revelation in Flesh', 'Spend a point for flight, swimming, sight or a squeezing body.'),
    f(18, 'Warping Implosion', 'Teleport 120 feet and pull everything you left behind.'),
  ],
  'clockwork-soul': [
    f(1, 'Restore Balance', 'Cancel advantage or disadvantage on any roll you can see.'),
    f(1, 'Clockwork Magic', 'Extra spells drawn from order and protection.'),
    f(6, 'Bastion of Law', 'A ward of d8s that absorbs damage for you or an ally.'),
    f(14, 'Trance of Order', 'Attacks against you lose advantage, and your rolls of 9 or lower count as 10.'),
    f(18, 'Clockwork Cavalcade', 'Heal, repair and end spells in a 30-foot cube.'),
  ],

  // --------------------------------------------------------------- warlock
  fiend: [
    f(1, 'Dark One’s Blessing', 'Temporary hit points whenever you drop a creature to 0.'),
    f(6, 'Dark One’s Own Luck', 'Add a d10 to an ability check or save, once per rest.'),
    f(10, 'Fiendish Resilience', 'Resistance to one damage type of your choice, changed after every rest.'),
    f(14, 'Hurl Through Hell', 'Send a creature through the lower planes for 10d10 psychic.'),
  ],
  'great-old-one': [
    f(1, 'Awakened Mind', 'Telepathy at 30 feet.'),
    f(6, 'Entropic Ward', 'Impose disadvantage on an attack, and gain advantage if it misses.'),
    f(10, 'Thought Shield', 'Resistance to psychic, and it reflects back at anyone reading your mind.'),
    f(14, 'Create Thrall', 'Charm an incapacitated creature indefinitely.'),
  ],
  archfey: [
    f(1, 'Fey Presence', 'Charm or frighten everything in a 10-foot cube.'),
    f(6, 'Misty Escape', 'Turn invisible and teleport 60 feet when you take damage.'),
    f(10, 'Beguiling Defenses', 'Immunity to charm, and you can reflect it back.'),
    f(14, 'Dark Delirium', 'Charm or frighten a creature and remove it from reality for a minute.'),
  ],
  celestial: [
    f(1, 'Bonus Cantrips', 'Light and sacred flame.'),
    f(1, 'Healing Light', 'A pool of d6s you can spend as a bonus action to heal.'),
    f(6, 'Radiant Soul', 'Resistance to radiant, and add your Charisma to radiant or fire damage.'),
    f(10, 'Celestial Resilience', 'Temporary hit points for you and your allies after every rest.'),
    f(14, 'Searing Vengeance', 'Rise at half hit points and blind everyone nearby.'),
  ],
  hexblade: [
    f(1, 'Hexblade’s Curse', 'Extra damage, crits on 19, and hit points back when the cursed creature dies.'),
    f(1, 'Hex Warrior', 'Medium armor, shields, martial weapons, and one weapon that uses Charisma.'),
    f(6, 'Accursed Specter', 'Raise a slain humanoid as a specter until your next rest.'),
    f(10, 'Armor of Hexes', 'A cursed creature has a chance to miss you entirely.'),
    f(14, 'Master of Hexes', 'Move your curse to a new creature when the old one dies.'),
  ],
  undying: [
    f(1, 'Among the Dead', 'Spare the dying, and undead hesitate to attack you.'),
    f(6, 'Defy Death', 'Heal 1d8 + Constitution when you stabilise someone or rise yourself.'),
    f(10, 'Undying Nature', 'You no longer need to breathe, eat, drink or sleep, and you age slowly.'),
    f(14, 'Indestructible Life', 'Heal 1d8 + your level as a bonus action, and regrow lost parts.'),
  ],
  undead: [
    f(1, 'Form of Dread', 'Transform for temporary hit points, immunity to fear, and a frightening hit.'),
    f(6, 'Grave Touched', 'No need to eat, drink or breathe, and necrotic damage on demand.'),
    f(10, 'Necrotic Husk', 'Resistance to necrotic, and an explosion when you drop.'),
    f(14, 'Spirit Projection', 'Leave your body: resistances, incorporeal movement and shared teleportation.'),
  ],
  fathomless: [
    f(1, 'Tentacle of the Deep', 'A spectral tentacle that lashes and slows.'),
    f(1, 'Gift of the Sea', 'A swimming speed of 40 feet, and you breathe water.'),
    f(6, 'Oceanic Soul', 'Resistance to cold, and you can talk underwater.'),
    f(6, 'Guardian Coil', 'Your tentacle reduces damage to you or an ally.'),
    f(10, 'Grasping Tentacles', 'Evard’s black tentacles, always prepared, with temporary hit points.'),
    f(14, 'Fathomless Plunge', 'Teleport a group to a body of water.'),
  ],
  genie: [
    f(1, 'Genie’s Vessel', 'A vessel granting bonus damage, and a room you can hide inside.'),
    f(6, 'Elemental Gift', 'Resistance to your genie’s damage type, and a flying speed.'),
    f(10, 'Sanctuary Vessel', 'Bring your allies into the vessel, and everyone finishes a short rest.'),
    f(14, 'Limited Wish', 'A spell of 6th level or lower, once every few days.'),
  ],

  // ---------------------------------------------------------------- wizard
  evocation: [
    f(2, 'Evocation Savant', 'Copy evocation spells at half the time and cost.'),
    f(2, 'Sculpt Spells', 'Choose allies to be missed entirely by your own spells.'),
    f(6, 'Potent Cantrip', 'Cantrips still deal half damage on a successful save.'),
    f(10, 'Empowered Evocation', 'Add your Intelligence to one damage roll of every evocation.'),
    f(14, 'Overchannel', 'Maximise the damage of a spell of 5th level or lower, at a rising cost.'),
  ],
  abjuration: [
    f(2, 'Abjuration Savant', 'Copy abjuration spells at half the time and cost.'),
    f(2, 'Arcane Ward', 'A ward that absorbs damage and recharges every time you cast abjuration.'),
    f(6, 'Projected Ward', 'Your ward protects your allies too.'),
    f(10, 'Improved Abjuration', 'Add your proficiency bonus to counterspell and dispel magic checks.'),
    f(14, 'Spell Resistance', 'Advantage on saves against spells, and resistance to their damage.'),
  ],
  divination: [
    f(2, 'Divination Savant', 'Copy divination spells at half the time and cost.'),
    f(2, 'Portent', 'Two rolls each morning that you can substitute for anyone’s d20.'),
    f(6, 'Expert Divination', 'Casting divination of 2nd level or higher returns a lower slot.'),
    f(10, 'The Third Eye', 'Darkvision, ethereal sight, comprehension or invisibility sight after every rest.'),
    f(14, 'Greater Portent', 'Three portent rolls a day.'),
  ],
  conjuration: [
    f(2, 'Conjuration Savant', 'Copy conjuration spells at half the time and cost.'),
    f(2, 'Minor Conjuration', 'Conjure a small nonmagical object for an hour.'),
    f(6, 'Benign Transposition', 'Teleport 30 feet, or swap places with an ally.'),
    f(10, 'Focused Conjuration', 'Damage cannot break your concentration on a conjuration.'),
    f(14, 'Durable Summons', 'Your summons arrive with 30 temporary hit points.'),
  ],
  enchantment: [
    f(2, 'Enchantment Savant', 'Copy enchantment spells at half the time and cost.'),
    f(2, 'Hypnotic Gaze', 'Charm and incapacitate a creature within 5 feet for as long as you hold it.'),
    f(6, 'Instinctive Charm', 'Redirect an attack on you to another creature.'),
    f(10, 'Split Enchantment', 'Enchantments that target one creature can target two.'),
    f(14, 'Alter Memories', 'Your victims forget being charmed, and lose hours besides.'),
  ],
  illusion: [
    f(2, 'Illusion Savant', 'Copy illusion spells at half the time and cost.'),
    f(2, 'Improved Minor Illusion', 'Minor illusion with both sound and image at once.'),
    f(6, 'Malleable Illusions', 'Reshape an illusion after casting it.'),
    f(10, 'Illusory Self', 'A duplicate that makes one attack miss entirely.'),
    f(14, 'Illusory Reality', 'Make part of an illusion physically real for a minute.'),
  ],
  necromancy: [
    f(2, 'Necromancy Savant', 'Copy necromancy spells at half the time and cost.'),
    f(2, 'Grim Harvest', 'Regain hit points whenever a spell kills something.'),
    f(6, 'Undead Thralls', 'An extra zombie or skeleton per casting, with more hit points and damage.'),
    f(10, 'Inured to Undeath', 'Resistance to necrotic, and your maximum hit points cannot be reduced.'),
    f(14, 'Command Undead', 'Take control of an undead creature.'),
  ],
  transmutation: [
    f(2, 'Transmutation Savant', 'Copy transmutation spells at half the time and cost.'),
    f(2, 'Minor Alchemy', 'Change one material into another for an hour.'),
    f(6, 'Transmuter’s Stone', 'A stone granting darkvision, speed, resistance or proficiency, remade at will.'),
    f(10, 'Shapechanger', 'Polymorph into a beast, once per rest without a slot.'),
    f(14, 'Master Transmuter', 'Spend your stone to transform an object, heal fully, or restore youth.'),
  ],
  'war-magic': [
    f(2, 'Arcane Deflection', 'Spend your reaction for +2 AC or +4 on a save.'),
    f(2, 'Tactical Wit', 'Add your Intelligence to initiative.'),
    f(6, 'Power Surge', 'Store surges from dispelled spells and add your level in force damage.'),
    f(10, 'Durable Magic', 'Concentrating grants +2 to AC and every save.'),
    f(14, 'Deflecting Shroud', 'Arcane Deflection also damages everything nearby.'),
  ],
  bladesinging: [
    f(2, 'Training in War and Song', 'Light armor, one one-handed weapon, and Performance.'),
    f(2, 'Bladesong', 'Add Intelligence to AC, +10 speed, advantage on Acrobatics and concentration.'),
    f(10, 'Song of Defense', 'Spend a slot to absorb five times its level in damage.'),
    f(14, 'Song of Victory', 'Add your Intelligence to your melee weapon damage.'),
  ],
  'chronurgy': [
    f(2, 'Chronal Shift', 'Force a reroll of any d20 within 30 feet, twice per rest.'),
    f(2, 'Temporal Awareness', 'Add your Intelligence to initiative.'),
    f(6, 'Momentary Stasis', 'Incapacitate a Large or smaller creature.'),
    f(10, 'Arcane Abeyance', 'Store a spell in a bead for anyone to release.'),
    f(14, 'Convergent Future', 'Decide a d20 outcome outright, at the cost of exhaustion.'),
  ],
  'graviturgy': [
    f(2, 'Adjust Density', 'Halve or double a creature’s weight, changing its speed and Strength.'),
    f(6, 'Gravity Well', 'Every spell you cast also moves the target 5 feet.'),
    f(10, 'Violent Attraction', 'Add damage to an ally’s hit, or to a falling creature.'),
    f(14, 'Event Horizon', 'An aura that damages and halts everything around you.'),
  ],
  'order-of-scribes': [
    f(2, 'Wizardly Quill', 'A magic quill that writes, copies and forges.'),
    f(2, 'Awakened Spellbook', 'Change a spell’s damage type, cast rituals faster, and replace a lost book.'),
    f(6, 'Manifest Mind', 'A spectral mind that scouts, casts through and helps you.'),
    f(10, 'Master Scrivener', 'Create a spell scroll after every rest.'),
    f(14, 'One with the Word', 'Absorb damage into your book, at the cost of losing spells.'),
  ],

  // ------------------------------------------------------------- artificer
  alchemist: [
    f(3, 'Tool Proficiency', 'Alchemist’s supplies.'),
    f(3, 'Experimental Elixir', 'Random beneficial elixirs after every long rest, and more from slots.'),
    f(5, 'Alchemical Savant', 'Add your Intelligence to acid, fire, necrotic, poison and healing.'),
    f(9, 'Restorative Reagents', 'Elixirs also grant temporary hit points, and greater restoration for free.'),
    f(15, 'Chemical Mastery', 'Resistance to acid and poison, and free tarrasque-grade cures.'),
  ],
  artillerist: [
    f(3, 'Tool Proficiency', 'Woodcarver’s tools.'),
    f(3, 'Eldritch Cannon', 'A cannon that blasts, protects or burns, commanded as a bonus action.'),
    f(5, 'Arcane Firearm', 'Add a d8 to one damage roll of your artificer spells.'),
    f(9, 'Explosive Cannon', 'Your cannon deals more damage, and can be detonated.'),
    f(15, 'Fortified Position', 'Two cannons at once, and half cover around them.'),
  ],
  armorer: [
    f(3, 'Tools of the Trade', 'Smith’s tools, and armor you can integrate.'),
    f(3, 'Arcane Armor', 'Armor that needs no Strength, cannot be removed, and includes your tools.'),
    f(3, 'Armor Model', 'Guardian, with a thunder gauntlet, or Infiltrator, with a lightning launcher.'),
    f(5, 'Extra Attack', 'Attack twice with the Attack action.'),
    f(9, 'Armor Modifications', 'Two extra infusions, on your armor’s pieces.'),
    f(15, 'Perfected Armor', 'Guardian pulls enemies in; Infiltrator’s lightning chains.'),
  ],
  'battle-smith': [
    f(3, 'Tool Proficiency', 'Smith’s tools.'),
    f(3, 'Battle Ready', 'Martial weapons, and Intelligence on magic weapon attacks.'),
    f(3, 'Steel Defender', 'A construct companion that fights and protects.'),
    f(5, 'Extra Attack', 'Attack twice with the Attack action.'),
    f(9, 'Arcane Jolt', 'Extra force damage, or healing, on your hits.'),
    f(15, 'Improved Defender', 'A stronger jolt, and a defender that deflects.'),
  ],
};

/**
 * What 2024 changed, for the subclasses where it changed anything.
 *
 * The table above is the 2014 progression, and it was serving both editions -
 * so a 2024 Champion was told Remarkable Athlete arrives at 7 when it arrives
 * at 3, and a 2024 Berserker had Retaliation and Intimidating Presence the
 * wrong way round. The rewrite moved features wholesale: every subclass now
 * starts at 3, most gained a spell list as a named feature, and several
 * features were renamed or replaced outright.
 *
 * Only the twelve subclasses the 2024 SRD covers are here, because those are
 * the twelve there is a source for. A subclass with no entry falls back to the
 * table above, which is the honest default - the app does not know what
 * Xanathar's subclasses look like under the new rules.
 */
export const SUBCLASS_FEATURES_2024: Record<string, ClassFeature[]> = {
  berserker: [
    f(3, 'Frenzy', 'Reckless Attack while raging adds a die of extra damage, growing with your level. No exhaustion any more.'),
    f(6, 'Mindless Rage', 'Immune to charmed and frightened while raging, and raging ends either condition already on you.'),
    f(10, 'Retaliation', 'A reaction attack against anyone who damages you within 5 feet.'),
    f(14, 'Intimidating Presence', 'A bonus action to frighten everyone in a 30-foot cone; usable again on a short rest.'),
  ],
  lore: [
    f(3, 'Bonus Proficiencies', 'Three skills of your choice.'),
    f(3, 'Cutting Words', 'A reaction spending Bardic Inspiration to subtract from an enemy roll.'),
    f(6, 'Magical Discoveries', 'Two spells from the Cleric, Druid or Wizard list, which count as Bard spells for you.'),
    f(14, 'Peerless Skill', 'Spend Bardic Inspiration after a failed check or attack to try to turn it into a success.'),
  ],
  life: [
    f(3, 'Disciple of Life', 'Your healing spells restore extra hit points.'),
    f(3, 'Life Domain Spells', 'Aid, bless, cure wounds, lesser restoration and the rest, always prepared and free.'),
    f(3, 'Preserve Life', 'Channel Divinity to heal five times your level, split among creatures within 30 feet.'),
    f(6, 'Blessed Healer', 'Healing others heals you as well.'),
    f(17, 'Supreme Healing', 'Healing dice are treated as rolling their maximum.'),
  ],
  land: [
    f(3, 'Circle of the Land Spells', 'Pick arid, polar, temperate or tropical after each long rest for a prepared list.'),
    f(3, "Land's Aid", 'Spend a Wild Shape use for damage in a 10-foot sphere and healing to one creature in it.'),
    f(6, 'Natural Recovery', 'Cast one circle spell free once a day, and recover slots on a short rest.'),
    f(10, "Nature's Ward", 'Immune to poison, and resistant to a damage type set by your chosen land.'),
    f(14, "Nature's Sanctuary", 'Spend a Wild Shape use for a 15-foot cube of spectral growth that restrains your enemies.'),
  ],
  champion: [
    f(3, 'Improved Critical', 'You score a critical hit on a 19 or 20.'),
    f(3, 'Remarkable Athlete', 'Advantage on initiative and Athletics, and a half-speed move after a critical hit.'),
    f(7, 'Additional Fighting Style', 'A second Fighting Style feat.'),
    f(10, 'Heroic Warrior', 'Give yourself Heroic Inspiration whenever you start a turn without it.'),
    f(15, 'Superior Critical', 'You score a critical hit on an 18, 19 or 20.'),
    f(18, 'Survivor', 'Advantage on death saves, and healing every turn you are below half.'),
  ],
  'open-hand': [
    f(3, 'Open Hand Technique', 'Flurry of Blows also knocks prone, pushes 15 feet, or denies reactions.'),
    f(6, 'Wholeness of Body', 'A bonus action to heal your Martial Arts die plus your Wisdom, on a proficiency-bonus budget.'),
    f(11, 'Fleet Step', 'Any other bonus action also gives you Step of the Wind.'),
    f(17, 'Quivering Palm', 'Set up vibrations you can end for 10d12 damage, or death on a failed save.'),
  ],
  devotion: [
    f(3, 'Oath of Devotion Spells', 'Protection from evil and good, shield of faith, and the rest, always prepared.'),
    f(3, 'Sacred Weapon', 'Channel Divinity to add your Charisma to attack rolls with a weapon, and make it shed light.'),
    f(7, 'Aura of Devotion', 'You and your allies in the aura are immune to being charmed.'),
    f(15, 'Smite of Protection', 'Divine Smite gives you and your allies in the aura half cover.'),
    f(20, 'Holy Nimbus', 'A bonus action for radiant damage each turn, advantage on saves against spells, and bright light.'),
  ],
  hunter: [
    f(3, "Hunter's Lore", "Hunter's Mark reveals the target's immunities, resistances and vulnerabilities."),
    f(3, "Hunter's Prey", 'Colossus Slayer or Horde Breaker, re-chosen on a rest.'),
    f(7, 'Defensive Tactics', 'Escape the Horde or Multiattack Defense, re-chosen on a rest.'),
    f(11, "Superior Hunter's Prey", "Hunter's Mark damage also hits a second creature near the target."),
    f(15, "Superior Hunter's Defense", 'A reaction for resistance to that damage and everything else until your next turn.'),
  ],
  thief: [
    f(3, 'Fast Hands', 'A bonus action for Sleight of Hand, thieves’ tools, or the Utilize action.'),
    f(3, 'Second-Story Work', 'A climb speed, and a running jump measured by Dexterity rather than Strength.'),
    f(9, 'Supreme Sneak', 'A Cunning Strike option that keeps you hidden after the attack.'),
    f(13, 'Use Magic Device', 'A fourth attunement slot, scroll use, and a chance not to spend an item’s charge.'),
    f(17, "Thief's Reflexes", 'Two turns in the first round of combat.'),
  ],
  draconic: [
    f(3, 'Draconic Resilience', '+3 hit points and +1 per level after, and 13 + Dexterity armor class unarmoured.'),
    f(3, 'Draconic Spells', 'Always-prepared spells from your bloodline, growing with your level.'),
    f(6, 'Elemental Affinity', 'Add your Charisma to one damage roll of your chosen type, and resist that type.'),
    f(14, 'Dragon Wings', 'A bonus action for a flying speed equal to your walking speed, for an hour.'),
    f(18, 'Dragon Companion', 'Summon Dragon without its material component, and free once a day.'),
  ],
  fiend: [
    f(3, "Dark One's Blessing", 'Temporary hit points whenever you drop an enemy to 0.'),
    f(3, 'Fiend Spells', 'Burning hands, command, scorching ray and the rest, always prepared.'),
    f(6, "Dark One's Own Luck", 'Add a d10 to an ability check or save, on a proficiency-bonus budget.'),
    f(10, 'Fiendish Resilience', 'Resistance to one damage type of your choice, re-chosen on a rest.'),
    f(14, 'Hurl Through Hell', 'Send a target through the Lower Planes for 8d10 psychic damage.'),
  ],
  evocation: [
    f(3, 'Evocation Savant', 'Two evocation spells of level 2 or lower, free, in your spellbook.'),
    f(3, 'Potent Cantrip', 'Your damaging cantrips deal half damage even on a save or a miss.'),
    f(6, 'Sculpt Spells', 'Allies in your evocations automatically pass and take no damage.'),
    f(10, 'Empowered Evocation', 'Add your Intelligence to one damage roll of every evocation you cast.'),
    f(14, 'Overchannel', 'Maximum damage on a spell of level 5 or lower, at a rising cost in necrotic damage.'),
  ],
};

/** Every subclass id with a feature list, for coverage checks. */
export function subclassFeatureIds(): string[] {
  return Object.keys(SUBCLASS_FEATURES);
}
