import type { Ability, ClassId, Ruleset } from '../types';

/**
 * What each class gives you, level by level.
 *
 * This is a display table and an engine table at once. The `summary` answers
 * "what do I get at 6"; the `tags` are what the engine reads, so facts like
 * Extra Attack live here rather than as `klass.id === 'monk'` checks scattered
 * through character.ts, defense.ts and proficiency.ts.
 *
 * Rules text is summarised, not reproduced, matching the rest of the app.
 *
 * `Subclass.features` carries only the ones that change maths the engine
 * computes - which is exactly the set that used to be hardcoded. The rest live
 * in `subclassFeatures.ts`, keyed by subclass id, because the printed sheet
 * needs them and a curated one-line note cannot fill a Features and Traits box.
 */

export type FeatureTag =
  | 'extra-attack'
  | 'half-proficiency'
  | 'reliable-talent'
  | 'unarmored-defense'
  | 'fighting-style'
  | 'expertise'
  | 'asi';

export type ClassOptionKind =
  | 'fighting-style'
  | 'invocation'
  | 'metamagic'
  | 'maneuver'
  | 'pact-boon';

export interface ClassFeature {
  level: number;
  name: string;
  summary: string;
  /** Absent means both rulesets. */
  rulesets?: Ruleset[];
  tags?: FeatureTag[];
  /** Choices this feature opens: two invocations, three maneuvers, a style. */
  grants?: { kind: ClassOptionKind; count: number };
  /** For 'expertise': how many skills this grant covers. */
  count?: number;
  /**
   * For 'unarmored-defense': the ability added on top of 10, and whether a
   * shield is allowed alongside. The Monk's forbids one, the Barbarian's
   * does not.
   */
  unarmored?: { extra: Ability; allowsShield: boolean };
}

/**
 * The Ability Score Improvement levels are already on `CharClass.asiLevels` and
 * drive the planner, so they are not repeated as features. Everything else a
 * class gives you is here.
 */
export const CLASS_FEATURES: Record<ClassId, ClassFeature[]> = {
  artificer: [
    { level: 1, name: 'Magical Tinkering', summary: 'Give tiny properties to objects: light, a recorded message, a smell.' },
    { level: 1, name: 'Spellcasting', summary: 'Half caster on Intelligence, preparing from the Artificer list.' },
    { level: 2, name: 'Infuse Item', summary: 'Permanent magic items for you and the party, reworked on every long rest. The reason to play the class.' },
    { level: 3, name: 'The Right Tool for the Job', summary: 'Conjure any set of artisan\'s tools in an hour.' },
    { level: 6, name: 'Tool Expertise', summary: 'Double proficiency on every tool you are proficient with.' },
    { level: 7, name: 'Flash of Genius', summary: 'Add Intelligence to an ally\'s check or save as a reaction. Excellent and easy to forget.' },
    { level: 10, name: 'Magic Item Adept', summary: 'A fourth attunement slot and faster crafting.' },
    { level: 11, name: 'Spell-Storing Item', summary: 'Load a 1st or 2nd level spell into an item for the party to use all day.' },
    { level: 14, name: 'Magic Item Savant', summary: 'A fifth attunement slot; ignore class, race and level requirements on items.' },
    { level: 18, name: 'Magic Item Master', summary: 'A sixth attunement slot.' },
    { level: 20, name: 'Soul of Artifice', summary: '+1 to all saves per attunement, and drop to 1 HP once per long rest.' },
  ],

  barbarian: [
    { level: 1, name: 'Rage', summary: 'Resistance to bludgeoning, piercing and slashing, bonus melee damage, advantage on Strength checks and saves.' },
    { level: 1, name: 'Unarmored Defense', summary: 'AC 10 + Dexterity + Constitution while wearing no armor. A shield still works.', tags: ['unarmored-defense'], unarmored: { extra: 'con', allowsShield: true } },
    { level: 2, name: 'Reckless Attack', summary: 'Advantage on your Strength attacks, and everyone gets advantage on you. Usually worth it.' },
    { level: 2, name: 'Danger Sense', summary: 'Advantage on Dexterity saves against effects you can see.' },
    { level: 5, name: 'Extra Attack', summary: 'Attack twice with the Attack action.', tags: ['extra-attack'] },
    { level: 5, name: 'Fast Movement', summary: '+10 feet of speed while unarmored.' },
    { level: 7, name: 'Feral Instinct', summary: 'Advantage on initiative, and you can act while surprised if you rage first.' },
    { level: 9, name: 'Brutal Critical', summary: 'An extra damage die on a critical hit. Underwhelming - crits are rare.' },
    { level: 9, name: 'Brutal Strike', summary: 'Trade Reckless Attack\'s advantage for extra damage and a rider.', rulesets: ['2024'] },
    { level: 11, name: 'Relentless Rage', summary: 'A Constitution save keeps you at 1 HP instead of dropping while raging.' },
    { level: 15, name: 'Persistent Rage', summary: 'Rage no longer ends early from not attacking or taking damage.' },
    { level: 18, name: 'Indomitable Might', summary: 'A Strength check below your Strength score counts as your score.' },
    { level: 20, name: 'Primal Champion', summary: '+4 Strength and Constitution, to a maximum of 24.' },
  ],

  bard: [
    { level: 1, name: 'Bardic Inspiration', summary: 'A die an ally adds to a check, attack or save. Scales from d6 to d12.' },
    { level: 1, name: 'Spellcasting', summary: 'Full caster on Charisma, with spells known rather than prepared.' },
    { level: 2, name: 'Jack of All Trades', summary: 'Half your proficiency bonus on any check you are not already proficient in.', tags: ['half-proficiency'] },
    { level: 2, name: 'Song of Rest', summary: 'Extra healing for the party on a short rest.', rulesets: ['2014'] },
    { level: 3, name: 'Expertise', summary: 'Double proficiency on two skills.', tags: ['expertise'], count: 2 },
    { level: 5, name: 'Font of Inspiration', summary: 'Bardic Inspiration comes back on a short rest, not just a long one. The class\'s real power spike.' },
    { level: 6, name: 'Countercharm', summary: 'Advantage against being frightened or charmed for you and nearby allies.' },
    { level: 10, name: 'Magical Secrets', summary: 'Two spells from any class list. This is what makes a Bard able to do anything.' },
    { level: 10, name: 'Expertise', summary: 'Double proficiency on two more skills.', tags: ['expertise'], count: 2 },
    { level: 20, name: 'Superior Inspiration', summary: 'Regain Bardic Inspiration uses when you roll initiative.' },
  ],

  cleric: [
    { level: 1, name: 'Spellcasting', summary: 'Full caster on Wisdom, preparing from the whole Cleric list every day.' },
    { level: 1, name: 'Divine Domain', summary: 'Your subclass, chosen at 1st level.', rulesets: ['2014'] },
    { level: 2, name: 'Channel Divinity', summary: 'Turn Undead plus a domain effect, on a short rest.' },
    { level: 5, name: 'Destroy Undead', summary: 'Turned undead of low enough CR are destroyed outright.' },
    { level: 10, name: 'Divine Intervention', summary: 'Ask your deity for help. A percentile roll at first, automatic at 20.' },
    { level: 20, name: 'Divine Intervention Improvement', summary: 'Divine Intervention always works.', rulesets: ['2014'] },
  ],

  druid: [
    { level: 1, name: 'Druidic', summary: 'A secret language, and you can leave hidden messages in it.' },
    { level: 1, name: 'Spellcasting', summary: 'Full caster on Wisdom, preparing from the whole Druid list every day.' },
    { level: 2, name: 'Wild Shape', summary: 'Turn into a beast twice per short rest. Circle of the Moon makes this a combat form; otherwise it is utility.' },
    { level: 18, name: 'Timeless Body', summary: 'You age more slowly.' },
    { level: 18, name: 'Beast Spells', summary: 'Cast spells while wild shaped.' },
    { level: 20, name: 'Archdruid', summary: 'Unlimited Wild Shape, and ignore the verbal and somatic components of Druid spells.' },
  ],

  fighter: [
    { level: 1, name: 'Fighting Style', summary: 'A combat specialisation you keep for the whole character.', tags: ['fighting-style'], grants: { kind: 'fighting-style', count: 1 } },
    { level: 1, name: 'Second Wind', summary: 'Heal 1d10 + level as a bonus action, once per short rest.' },
    { level: 2, name: 'Action Surge', summary: 'One extra action on your turn, once per short rest. The single best action-economy feature in the game.' },
    { level: 5, name: 'Extra Attack', summary: 'Attack twice with the Attack action.', tags: ['extra-attack'] },
    { level: 9, name: 'Indomitable', summary: 'Reroll a failed saving throw, once per long rest.' },
    { level: 11, name: 'Extra Attack (2)', summary: 'Attack three times. Only the Fighter gets this.', tags: ['extra-attack'] },
    { level: 20, name: 'Extra Attack (3)', summary: 'Attack four times.', tags: ['extra-attack'] },
  ],

  monk: [
    { level: 1, name: 'Unarmored Defense', summary: 'AC 10 + Dexterity + Wisdom while wearing no armor and no shield.', tags: ['unarmored-defense'], unarmored: { extra: 'wis', allowsShield: false } },
    { level: 1, name: 'Martial Arts', summary: 'Dexterity on unarmed and monk weapon attacks, a scaling damage die, and a bonus-action unarmed strike.' },
    { level: 2, name: 'Ki', summary: 'Points for Flurry of Blows, Patient Defense and Step of the Wind, back on a short rest.' },
    { level: 2, name: 'Unarmored Movement', summary: '+10 feet of speed unarmored, rising to +30 by 18.' },
    { level: 3, name: 'Deflect Missiles', summary: 'Reduce ranged weapon damage as a reaction, and throw it back for ki.' },
    { level: 4, name: 'Slow Fall', summary: 'Reduce falling damage by five times your level as a reaction.' },
    { level: 5, name: 'Extra Attack', summary: 'Attack twice with the Attack action.', tags: ['extra-attack'] },
    { level: 5, name: 'Stunning Strike', summary: 'Spend ki to stun on a failed Constitution save. The Monk\'s best turn, and the reason Wisdom matters.' },
    { level: 6, name: 'Ki-Empowered Strikes', summary: 'Unarmed strikes count as magical.' },
    { level: 7, name: 'Evasion', summary: 'No damage on a successful Dexterity save, half on a failure.' },
    { level: 7, name: 'Stillness of Mind', summary: 'End a charm or fear on yourself as an action.' },
    { level: 10, name: 'Purity of Body', summary: 'Immune to disease and poison.', rulesets: ['2014'] },
    { level: 13, name: 'Tongue of the Sun and Moon', summary: 'Understand and be understood in any language.' },
    { level: 14, name: 'Diamond Soul', summary: 'Proficiency in every saving throw, and reroll failures for ki.' },
    { level: 15, name: 'Timeless Body', summary: 'You stop ageing and no longer need food.' },
    { level: 18, name: 'Empty Body', summary: 'Invisibility and resistance for ki, and Astral Projection.' },
    { level: 20, name: 'Perfect Self', summary: 'Regain 4 ki when you roll initiative with none left.' },
  ],

  paladin: [
    { level: 1, name: 'Divine Sense', summary: 'Detect celestials, fiends and undead nearby.' },
    { level: 1, name: 'Lay on Hands', summary: 'A pool of healing equal to five times your level, and it cures disease and poison.' },
    { level: 2, name: 'Fighting Style', summary: 'A combat specialisation you keep for the whole character.', tags: ['fighting-style'], grants: { kind: 'fighting-style', count: 1 } },
    { level: 2, name: 'Spellcasting', summary: 'Half caster on Charisma, preparing from the Paladin list.' },
    { level: 2, name: 'Divine Smite', summary: 'Burn a spell slot on a hit for 2d8 radiant, more against undead and fiends. Nova damage on demand.' },
    { level: 3, name: 'Divine Health', summary: 'Immune to disease.' },
    { level: 5, name: 'Extra Attack', summary: 'Attack twice with the Attack action.', tags: ['extra-attack'] },
    { level: 6, name: 'Aura of Protection', summary: 'You and nearby allies add your Charisma to every saving throw. Arguably the strongest defensive feature in 5e.' },
    { level: 10, name: 'Aura of Courage', summary: 'You and nearby allies cannot be frightened.' },
    { level: 11, name: 'Improved Divine Smite', summary: '+1d8 radiant on every melee weapon hit, for free.' },
    { level: 14, name: 'Cleansing Touch', summary: 'End a spell on yourself or an ally.' },
  ],

  ranger: [
    { level: 1, name: 'Favored Enemy', summary: 'Advantage on tracking one creature type, and a language. Weak, and 2024 replaced it.', rulesets: ['2014'] },
    { level: 1, name: 'Natural Explorer', summary: 'Travel benefits in one terrain type. Heavily campaign-dependent.', rulesets: ['2014'] },
    { level: 2, name: 'Fighting Style', summary: 'A combat specialisation you keep for the whole character.', tags: ['fighting-style'], grants: { kind: 'fighting-style', count: 1 } },
    { level: 2, name: 'Spellcasting', summary: 'Half caster on Wisdom, with spells known rather than prepared.' },
    // 2024 folded Natural Explorer into Deft Explorer, which hands over an
    // Expertise instead of a terrain type - a much better trade.
    { level: 2, name: 'Deft Explorer', summary: 'Expertise in one skill, plus two languages.', rulesets: ['2024'], tags: ['expertise'], count: 1 },
    { level: 5, name: 'Extra Attack', summary: 'Attack twice with the Attack action.', tags: ['extra-attack'] },
    { level: 9, name: 'Expertise', summary: 'Double proficiency on two more skills.', rulesets: ['2024'], tags: ['expertise'], count: 2 },
    { level: 8, name: 'Land\'s Stride', summary: 'Difficult terrain costs no extra movement; advantage against entangling plants.' },
    { level: 10, name: 'Hide in Plain Sight', summary: 'Camouflage yourself for a large Stealth bonus while you stay still. Rarely useful.', rulesets: ['2014'] },
    { level: 14, name: 'Vanish', summary: 'Hide as a bonus action, and you cannot be tracked non-magically.' },
    { level: 18, name: 'Feral Senses', summary: 'Fight invisible creatures without disadvantage.' },
    { level: 20, name: 'Foe Slayer', summary: 'Add Wisdom to one attack or damage roll each turn.', rulesets: ['2014'] },
  ],

  rogue: [
    { level: 1, name: 'Sneak Attack', summary: 'Extra damage once per turn with advantage or an adjacent ally. Scales to 10d6 and costs nothing.' },
    { level: 1, name: 'Expertise', summary: 'Double proficiency on two skills.', tags: ['expertise'], count: 2 },
    { level: 1, name: 'Thieves\' Cant', summary: 'A secret code of slang and symbols.' },
    { level: 2, name: 'Cunning Action', summary: 'Dash, Disengage or Hide as a bonus action, every turn.' },
    { level: 5, name: 'Uncanny Dodge', summary: 'Halve the damage of one attack you can see, as a reaction.' },
    { level: 6, name: 'Expertise', summary: 'Double proficiency on two more skills.', tags: ['expertise'], count: 2 },
    { level: 7, name: 'Evasion', summary: 'No damage on a successful Dexterity save, half on a failure.' },
    { level: 11, name: 'Reliable Talent', summary: 'Treat any d20 of 9 or lower as a 10 on a skill you are proficient in.', tags: ['reliable-talent'] },
    { level: 14, name: 'Blindsense', summary: 'Sense hidden and invisible creatures within 10 feet.' },
    { level: 15, name: 'Slippery Mind', summary: 'Proficiency in Wisdom saving throws.' },
    { level: 18, name: 'Elusive', summary: 'No attack roll has advantage against you while you are not incapacitated.' },
    { level: 20, name: 'Stroke of Luck', summary: 'Turn a miss into a hit or a failed check into a 20, once per short rest.' },
  ],

  sorcerer: [
    { level: 1, name: 'Spellcasting', summary: 'Full caster on Charisma, with very few spells known. Every pick matters.' },
    { level: 2, name: 'Font of Magic', summary: 'Sorcery points, convertible to and from spell slots.' },
    { level: 3, name: 'Metamagic', summary: 'Two ways to bend your spells. This is the class.', grants: { kind: 'metamagic', count: 2 } },
    { level: 10, name: 'Metamagic', summary: 'A third Metamagic option.', grants: { kind: 'metamagic', count: 1 } },
    { level: 17, name: 'Metamagic', summary: 'A fourth Metamagic option.', grants: { kind: 'metamagic', count: 1 } },
    { level: 20, name: 'Sorcerous Restoration', summary: 'Regain sorcery points on a short rest.' },
  ],

  warlock: [
    { level: 1, name: 'Otherworldly Patron', summary: 'Your subclass, chosen at 1st level.', rulesets: ['2014'] },
    { level: 1, name: 'Pact Magic', summary: 'A handful of slots, always at your highest level, back on a short rest.' },
    { level: 2, name: 'Eldritch Invocations', summary: 'Where the customisation lives. Two to start, swappable as you level.', grants: { kind: 'invocation', count: 2 } },
    { level: 3, name: 'Pact Boon', summary: 'Blade, Chain, Tome or Talisman. It gates about a third of the invocations.', grants: { kind: 'pact-boon', count: 1 } },
    { level: 5, name: 'Eldritch Invocations', summary: 'A third invocation.', grants: { kind: 'invocation', count: 1 } },
    { level: 7, name: 'Eldritch Invocations', summary: 'A fourth invocation.', grants: { kind: 'invocation', count: 1 } },
    { level: 9, name: 'Eldritch Invocations', summary: 'A fifth invocation.', grants: { kind: 'invocation', count: 1 } },
    { level: 11, name: 'Mystic Arcanum (6th)', summary: 'One 6th level spell, once per long rest.' },
    { level: 12, name: 'Eldritch Invocations', summary: 'A sixth invocation.', grants: { kind: 'invocation', count: 1 } },
    { level: 13, name: 'Mystic Arcanum (7th)', summary: 'One 7th level spell, once per long rest.' },
    { level: 15, name: 'Eldritch Invocations', summary: 'A seventh invocation.', grants: { kind: 'invocation', count: 1 } },
    { level: 15, name: 'Mystic Arcanum (8th)', summary: 'One 8th level spell, once per long rest.' },
    { level: 17, name: 'Mystic Arcanum (9th)', summary: 'One 9th level spell, once per long rest.' },
    { level: 18, name: 'Eldritch Invocations', summary: 'An eighth invocation.', grants: { kind: 'invocation', count: 1 } },
    { level: 20, name: 'Eldritch Master', summary: 'Regain all Pact Magic slots once per long rest.' },
  ],

  wizard: [
    { level: 1, name: 'Spellcasting', summary: 'Full caster on Intelligence, preparing from a spellbook you keep adding to.' },
    { level: 1, name: 'Arcane Recovery', summary: 'Recover spell slots on a short rest, once per day.' },
    { level: 18, name: 'Spell Mastery', summary: 'Cast one 1st and one 2nd level spell at will.' },
    { level: 20, name: 'Signature Spells', summary: 'Two 3rd level spells always prepared, free once per short rest.' },
  ],
};

/**
 * Features a class has reached at a given level, in the given ruleset.
 * Ability Score Improvements are excluded; the planner owns those.
 */
export function classFeaturesAt(
  classId: ClassId,
  level: number,
  ruleset: Ruleset,
): ClassFeature[] {
  return CLASS_FEATURES[classId].filter(
    (f) => f.level <= level && (f.rulesets ?? ['2014', '2024']).includes(ruleset),
  );
}

/** Everything a class gains at exactly this level - "what does 6 give me". */
export function classFeaturesAtExactly(
  classId: ClassId,
  level: number,
  ruleset: Ruleset,
): ClassFeature[] {
  return CLASS_FEATURES[classId].filter(
    (f) => f.level === level && (f.rulesets ?? ['2014', '2024']).includes(ruleset),
  );
}
