import type { CastingType, ClassId, Condition, Loadout, Ruleset, ScoreRule, WeaponStyle } from '../types';
import type { ClassOptionKind } from './classFeatures';
import type { Source } from './sources';
import { visible } from '../originals';

// Same condition builders as the feat table, for the same reason: the rules
// below should read like sentences.
const cls = (...ids: ClassId[]): Condition => ({ kind: 'class', ids });
const sub = (...ids: string[]): Condition => ({ kind: 'subclass', ids });
const style = (...styles: WeaponStyle[]): Condition => ({ kind: 'weaponStyle', styles });
const load = (...loadouts: Loadout[]): Condition => ({ kind: 'loadout', loadouts });
const casting = (...types: CastingType[]): Condition => ({ kind: 'casting', types });
const lvl = (min?: number, max?: number): Condition => ({ kind: 'level', min, max });
const extraAttack = (): Condition => ({ kind: 'extraAttack' });
const concentrates = (): Condition => ({ kind: 'concentrates' });
const any = (...of: Condition[]): Condition => ({ kind: 'any', of });
const not = (of: Condition): Condition => ({ kind: 'not', of });

/**
 * The choices a class feature hands you: a Fighting Style, an Eldritch
 * Invocation, a Metamagic, a Battle Master maneuver, a Pact Boon.
 *
 * Structurally these are feats without the ability increase - a baseline power
 * level plus conditional rules in the same Condition language - so they are
 * scored by the same code and explained in the same format. What differs is
 * that they are gated by a class feature rather than by an improvement slot.
 */
export interface ClassOption {
  id: string;
  name: string;
  kind: ClassOptionKind;
  /** Which class's feature offers it. */
  classId: ClassId;
  source: Source;
  /** Absent means both rulesets. */
  rulesets?: Ruleset[];
  summary: string;
  prereq?: {
    minLevel?: number;
    /** Invocations that need a specific Pact Boon. */
    pactBoon?: string;
    /** Free text shown in the UI when nothing else expresses it. */
    note?: string;
  };
  /** Baseline power, 0-10, before build-specific adjustments. */
  base: number;
  rules?: ScoreRule[];
}

export const CLASS_OPTIONS: ClassOption[] = [
  // ------------------------------------------------------- fighting styles
  // Under 2024 these are feats, added in Phase 1b; here they are the 2014
  // class feature. The ids match the feat records, so a character switching
  // ruleset keeps the same style.
  {
    id: 'archery', name: 'Archery', kind: 'fighting-style', classId: 'fighter',
    source: 'PHB', rulesets: ['2014'],
    summary: '+2 to attack rolls with ranged weapons.',
    base: 7,
    rules: [
      { when: style('dex-ranged'), delta: 3, why: '+2 to hit is the largest accuracy bonus in the game, and this build shoots.' },
      { when: not(style('dex-ranged')), delta: -6, why: 'Only applies to ranged weapon attacks, which this build does not make.' },
    ],
  },
  {
    id: 'defense', name: 'Defense', kind: 'fighting-style', classId: 'fighter',
    source: 'PHB', rulesets: ['2014'],
    summary: '+1 AC while wearing armor.',
    base: 6,
    rules: [
      { when: style('unarmed'), delta: -4, why: 'Unarmored builds get nothing from it.' },
    ],
  },
  {
    id: 'dueling', name: 'Dueling', kind: 'fighting-style', classId: 'fighter',
    source: 'PHB', rulesets: ['2014'],
    summary: '+2 damage with a one-handed melee weapon and no second weapon.',
    base: 6,
    rules: [
      { when: load('sword-and-board'), delta: 3, why: 'Sword and board is exactly what this is for, and +2 per hit compounds with Extra Attack.' },
      { when: any(load('two-handed', 'polearm', 'dual-wield', 'ranged')), delta: -6, why: 'Needs a single one-handed weapon, which this loadout does not use.' },
    ],
  },
  {
    id: 'great-weapon-fighting', name: 'Great Weapon Fighting', kind: 'fighting-style', classId: 'fighter',
    source: 'PHB', rulesets: ['2014'],
    summary: 'Reroll 1s and 2s on damage with a two-handed or versatile weapon.',
    base: 4,
    rules: [
      { when: any(load('two-handed', 'polearm')), delta: 2, why: 'Applies on every swing, though it averages under +1 damage per die.' },
      { when: not(any(load('two-handed', 'polearm'))), delta: -4, why: 'Needs a two-handed weapon.' },
    ],
  },
  {
    id: 'protection', name: 'Protection', kind: 'fighting-style', classId: 'fighter',
    source: 'PHB', rulesets: ['2014'],
    summary: 'Impose disadvantage on an attack against a nearby ally, as a reaction.',
    base: 3,
    rules: [
      { when: load('sword-and-board'), delta: 1, why: 'Requires the shield you are already carrying.' },
      { when: not(load('sword-and-board')), delta: -3, why: 'Requires a shield.' },
    ],
  },
  {
    id: 'two-weapon-fighting', name: 'Two-Weapon Fighting', kind: 'fighting-style', classId: 'fighter',
    source: 'PHB', rulesets: ['2014'],
    summary: 'Add your ability modifier to the damage of the off-hand attack.',
    base: 5,
    rules: [
      { when: load('dual-wield'), delta: 3, why: 'Without this the off-hand swing carries no modifier at all.' },
      { when: not(load('dual-wield')), delta: -5, why: 'Only applies while fighting with two weapons.' },
    ],
  },
  {
    id: 'blind-fighting', name: 'Blind Fighting', kind: 'fighting-style', classId: 'fighter',
    source: 'TCoE', rulesets: ['2014'],
    summary: 'Blindsight to 10 feet: see anything within that range even while blinded or in darkness.',
    base: 5,
    rules: [
      { when: any(style('str-melee', 'dex-melee', 'unarmed')), delta: 1, why: 'Melee range is exactly where 10 feet of blindsight pays off.' },
    ],
  },
  {
    id: 'interception', name: 'Interception', kind: 'fighting-style', classId: 'fighter',
    source: 'TCoE', rulesets: ['2014'],
    summary: 'Reduce damage to a nearby ally by 1d10 + proficiency, as a reaction.',
    base: 5,
  },
  {
    id: 'thrown-weapon-fighting', name: 'Thrown Weapon Fighting', kind: 'fighting-style', classId: 'fighter',
    source: 'TCoE', rulesets: ['2014'],
    summary: 'Draw a thrown weapon for free and add +2 to its damage.',
    base: 4,
  },
  {
    id: 'unarmed-fighting', name: 'Unarmed Fighting', kind: 'fighting-style', classId: 'fighter',
    source: 'TCoE', rulesets: ['2014'],
    summary: 'Unarmed strikes deal d6, or d8 with both hands free, and grappled creatures take damage.',
    base: 4,
    rules: [
      { when: style('unarmed'), delta: 3, why: 'This is the only way a non-Monk gets a real unarmed damage die.' },
      { when: not(style('unarmed')), delta: -3, why: 'You are not punching things.' },
    ],
  },

  // ------------------------------------------------------------- pact boons
  {
    id: 'pact-of-the-blade', name: 'Pact of the Blade', kind: 'pact-boon', classId: 'warlock',
    source: 'PHB',
    summary: 'Conjure a melee weapon you are proficient with, and it counts as magical.',
    base: 6,
    rules: [
      { when: sub('hexblade'), delta: 3, why: 'Hex Warrior lets the blade use Charisma, which is what makes a melee Warlock work.' },
      { when: any(style('str-melee', 'dex-melee')), delta: 2, why: 'This build fights in melee, which is what the pact weapon is for.' },
      { when: style('spell'), delta: -4, why: 'A caster who never swings has no use for a conjured sword.' },
    ],
  },
  {
    id: 'pact-of-the-chain', name: 'Pact of the Chain', kind: 'pact-boon', classId: 'warlock',
    source: 'PHB',
    summary: 'A familiar that can be an imp, pseudodragon, quasit or sprite, and can attack.',
    base: 7,
    rules: [
      { when: style('spell'), delta: 1, why: 'An invisible scout costs you nothing on a turn you are casting anyway.' },
    ],
  },
  {
    id: 'pact-of-the-tome', name: 'Pact of the Tome', kind: 'pact-boon', classId: 'warlock',
    source: 'PHB',
    summary: 'Three cantrips from any class list.',
    base: 7,
    rules: [
      { when: style('spell'), delta: 1, why: 'Three extra cantrips widen a spell list that is otherwise very short.' },
    ],
  },
  {
    id: 'pact-of-the-talisman', name: 'Pact of the Talisman', kind: 'pact-boon', classId: 'warlock',
    source: 'TCoE',
    summary: 'An amulet that adds d4 to a failed ability check, a few times per rest.',
    base: 3,
  },

  // ------------------------------------------------------ eldritch invocations
  {
    id: 'agonizing-blast', name: 'Agonizing Blast', kind: 'invocation', classId: 'warlock',
    source: 'PHB',
    summary: 'Add your Charisma modifier to every Eldritch Blast beam.',
    base: 10,
    rules: [
      { when: style('spell'), delta: 3, why: 'Eldritch Blast is your at-will damage, and this roughly doubles it. Close to mandatory.' },
      { when: lvl(5), delta: 2, why: 'From 5th level the blast fires twice, so the modifier is added twice per turn.' },
      { when: any(style('str-melee', 'dex-melee')), delta: -3, why: 'A blade pact Warlock swinging a weapon does not lean on Eldritch Blast.' },
    ],
  },
  {
    id: 'repelling-blast', name: 'Repelling Blast', kind: 'invocation', classId: 'warlock',
    source: 'PHB',
    summary: 'Push a creature 10 feet away with each Eldritch Blast beam.',
    base: 7,
    rules: [
      { when: style('spell'), delta: 2, why: 'Free forced movement every turn, which is control you would otherwise spend a spell on.' },
    ],
  },
  {
    id: 'devils-sight', name: "Devil's Sight", kind: 'invocation', classId: 'warlock',
    source: 'PHB',
    summary: 'See normally in magical and non-magical darkness out to 120 feet.',
    base: 8,
    rules: [
      { when: casting('pact', 'full'), delta: 2, why: 'Paired with Darkness this is advantage on every attack and disadvantage on theirs.' },
    ],
  },
  {
    id: 'eldritch-spear', name: 'Eldritch Spear', kind: 'invocation', classId: 'warlock',
    source: 'PHB',
    summary: "Eldritch Blast's range becomes 300 feet.",
    base: 3,
  },
  {
    id: 'armor-of-shadows', name: 'Armor of Shadows', kind: 'invocation', classId: 'warlock',
    source: 'PHB',
    summary: 'Cast Mage Armor on yourself at will, without a slot.',
    base: 6,
    rules: [
      { when: style('spell'), delta: 1, why: 'AC 13 + Dexterity all day on a d8 class with no armor proficiency worth using.' },
    ],
  },
  {
    id: 'mask-of-many-faces', name: 'Mask of Many Faces', kind: 'invocation', classId: 'warlock',
    source: 'PHB',
    summary: 'Cast Disguise Self at will.',
    base: 5,
  },
  {
    id: 'misty-visions', name: 'Misty Visions', kind: 'invocation', classId: 'warlock',
    source: 'PHB',
    summary: 'Cast Silent Image at will.',
    base: 4,
  },
  {
    id: 'fiendish-vigor', name: 'Fiendish Vigor', kind: 'invocation', classId: 'warlock',
    source: 'PHB',
    summary: 'Cast False Life on yourself at will, for a flat 1d4 + 4 temporary hit points.',
    base: 4,
  },
  {
    id: 'beast-speech', name: 'Beast Speech', kind: 'invocation', classId: 'warlock',
    source: 'PHB',
    summary: 'Speak with animals at will.',
    base: 3,
  },
  {
    id: 'eyes-of-the-rune-keeper', name: 'Eyes of the Rune Keeper', kind: 'invocation', classId: 'warlock',
    source: 'PHB',
    summary: 'Read any writing.',
    base: 3,
  },
  {
    id: 'gaze-of-two-minds', name: 'Gaze of Two Minds', kind: 'invocation', classId: 'warlock',
    source: 'PHB',
    summary: "Perceive through a willing creature's senses.",
    base: 3,
  },
  {
    id: 'thief-of-five-fates', name: 'Thief of Five Fates', kind: 'invocation', classId: 'warlock',
    source: 'PHB',
    summary: 'Cast Bane once per long rest with a spell slot.',
    base: 1,
  },
  {
    id: 'book-of-ancient-secrets', name: 'Book of Ancient Secrets', kind: 'invocation', classId: 'warlock',
    source: 'PHB',
    summary: 'Two 1st level rituals, and you can add more rituals you find.',
    base: 7,
    prereq: { pactBoon: 'pact-of-the-tome' },
    rules: [
      { when: casting('pact'), delta: 1, why: 'Free ritual casting on a class with almost no slots is real utility.' },
    ],
  },
  {
    id: 'improved-pact-weapon', name: 'Improved Pact Weapon', kind: 'invocation', classId: 'warlock',
    source: 'TCoE',
    summary: 'Your pact weapon is +1, can be a ranged weapon, and counts as a spellcasting focus.',
    base: 6,
    prereq: { pactBoon: 'pact-of-the-blade' },
    rules: [
      { when: any(style('str-melee', 'dex-melee')), delta: 2, why: 'A free +1 weapon on the build that actually swings it.' },
    ],
  },
  {
    id: 'thirsting-blade', name: 'Thirsting Blade', kind: 'invocation', classId: 'warlock',
    source: 'PHB',
    summary: 'Attack twice with your pact weapon.',
    base: 8,
    prereq: { minLevel: 5, pactBoon: 'pact-of-the-blade' },
    rules: [
      { when: any(style('str-melee', 'dex-melee')), delta: 3, why: 'This is the Warlock\'s only Extra Attack, and a melee build is dead without it.' },
      { when: style('spell'), delta: -6, why: 'You are not making weapon attacks.' },
    ],
  },
  {
    id: 'lifedrinker', name: 'Lifedrinker', kind: 'invocation', classId: 'warlock',
    source: 'PHB',
    summary: 'Your pact weapon deals extra necrotic damage equal to your Charisma modifier.',
    base: 7,
    prereq: { minLevel: 12, pactBoon: 'pact-of-the-blade' },
    rules: [
      { when: any(style('str-melee', 'dex-melee')), delta: 2, why: 'Charisma to damage on every swing, and you have two swings by now.' },
    ],
  },
  {
    id: 'voice-of-the-chain-master', name: 'Voice of the Chain Master', kind: 'invocation', classId: 'warlock',
    source: 'PHB',
    summary: 'See and speak through your familiar at any distance.',
    base: 6,
    prereq: { pactBoon: 'pact-of-the-chain' },
  },
  {
    id: 'investment-of-the-chain-master', name: 'Investment of the Chain Master', kind: 'invocation', classId: 'warlock',
    source: 'TCoE',
    summary: 'Your familiar gains flight or a swim speed, attacks as a bonus action, and its saves scale with you.',
    base: 8,
    prereq: { pactBoon: 'pact-of-the-chain' },
  },
  {
    id: 'aspect-of-the-moon', name: 'Aspect of the Moon', kind: 'invocation', classId: 'warlock',
    source: 'XGtE',
    summary: 'You no longer need sleep and cannot be forced to.',
    base: 4,
    prereq: { pactBoon: 'pact-of-the-tome' },
  },
  {
    id: 'ascendant-step', name: 'Ascendant Step', kind: 'invocation', classId: 'warlock',
    source: 'PHB',
    summary: 'Cast Levitate on yourself at will.',
    base: 5,
    prereq: { minLevel: 9 },
  },
  {
    id: 'one-with-shadows', name: 'One with Shadows', kind: 'invocation', classId: 'warlock',
    source: 'PHB',
    summary: 'Become invisible in dim light or darkness while you stay still.',
    base: 3,
    prereq: { minLevel: 5 },
  },
  {
    id: 'mire-the-mind', name: 'Mire the Mind', kind: 'invocation', classId: 'warlock',
    source: 'PHB',
    summary: 'Cast Slow once per long rest with a spell slot.',
    base: 4,
    prereq: { minLevel: 5 },
  },
  {
    id: 'sign-of-ill-omen', name: 'Sign of Ill Omen', kind: 'invocation', classId: 'warlock',
    source: 'PHB',
    summary: 'Cast Bestow Curse once per long rest with a spell slot.',
    base: 4,
    prereq: { minLevel: 5 },
  },
  {
    id: 'dreadful-word', name: 'Dreadful Word', kind: 'invocation', classId: 'warlock',
    source: 'PHB',
    summary: 'Cast Confusion once per long rest with a spell slot.',
    base: 4,
    prereq: { minLevel: 7 },
  },
  {
    id: 'sculptor-of-flesh', name: 'Sculptor of Flesh', kind: 'invocation', classId: 'warlock',
    source: 'PHB',
    summary: 'Cast Polymorph once per long rest with a spell slot.',
    base: 7,
    prereq: { minLevel: 7 },
    rules: [
      { when: concentrates(), delta: 1, why: 'Polymorph is one of the strongest concentration spells in the game, and this is a free casting.' },
    ],
  },
  {
    id: 'whispers-of-the-grave', name: 'Whispers of the Grave', kind: 'invocation', classId: 'warlock',
    source: 'PHB',
    summary: 'Cast Speak with Dead at will.',
    base: 4,
    prereq: { minLevel: 9 },
  },
  {
    id: 'visions-of-distant-realms', name: 'Visions of Distant Realms', kind: 'invocation', classId: 'warlock',
    source: 'PHB',
    summary: 'Cast Arcane Eye at will.',
    base: 6,
    prereq: { minLevel: 15 },
  },
  {
    id: 'witch-sight', name: 'Witch Sight', kind: 'invocation', classId: 'warlock',
    source: 'PHB',
    summary: 'See the true form of any shapechanger or illusion-disguised creature within 30 feet.',
    base: 4,
    prereq: { minLevel: 15 },
  },
  {
    id: 'master-of-myriad-forms', name: 'Master of Myriad Forms', kind: 'invocation', classId: 'warlock',
    source: 'PHB',
    summary: 'Cast Alter Self at will.',
    base: 5,
    prereq: { minLevel: 15 },
  },
  {
    id: 'eldritch-mind', name: 'Eldritch Mind', kind: 'invocation', classId: 'warlock',
    source: 'TCoE',
    summary: 'Advantage on Constitution saves to maintain concentration.',
    base: 7,
    rules: [
      { when: concentrates(), delta: 2, why: 'Your best spells are concentration, and this protects every one of them for free.' },
    ],
  },
  {
    id: 'grasp-of-hadar', name: 'Grasp of Hadar', kind: 'invocation', classId: 'warlock',
    source: 'XGtE',
    summary: 'Pull a creature 10 feet toward you once per turn with Eldritch Blast.',
    base: 5,
    rules: [
      { when: style('spell'), delta: 1, why: 'Dragging an enemy into your melee friends is control on a cantrip.' },
    ],
  },
  {
    id: 'lance-of-lethargy', name: 'Lance of Lethargy', kind: 'invocation', classId: 'warlock',
    source: 'XGtE',
    summary: "Reduce a creature's speed by 10 feet once per turn with Eldritch Blast.",
    base: 4,
  },
  {
    id: 'maddening-hex', name: 'Maddening Hex', kind: 'invocation', classId: 'warlock',
    source: 'XGtE',
    summary: 'Bonus-action psychic damage to everything near your hexed target.',
    base: 4,
    prereq: { minLevel: 5 },
  },
  {
    id: 'relentless-hex', name: 'Relentless Hex', kind: 'invocation', classId: 'warlock',
    source: 'XGtE',
    summary: 'Teleport 30 feet to a spot near your hexed target as a bonus action.',
    base: 5,
    prereq: { minLevel: 7 },
    rules: [
      { when: any(style('str-melee', 'dex-melee')), delta: 2, why: 'Free repositioning onto your target every turn on a melee build.' },
    ],
  },
  {
    id: 'tomb-of-levistus', name: 'Tomb of Levistus', kind: 'invocation', classId: 'warlock',
    source: 'XGtE',
    summary: 'As a reaction, encase yourself in ice for temporary hit points and resistance.',
    base: 6,
    rules: [
      { when: casting('pact'), delta: 1, why: 'A short-rest class can afford to spend the slot, and it can save your life.' },
    ],
  },

  // -------------------------------------------------------------- metamagic
  {
    id: 'quickened-spell', name: 'Quickened Spell', kind: 'metamagic', classId: 'sorcerer',
    source: 'PHB',
    summary: 'Cast a 1-action spell as a bonus action for 2 sorcery points.',
    base: 9,
    rules: [
      { when: style('spell'), delta: 2, why: 'A spell plus a cantrip in one turn is the Sorcerer\'s whole damage ceiling.' },
    ],
  },
  {
    id: 'twinned-spell', name: 'Twinned Spell', kind: 'metamagic', classId: 'sorcerer',
    source: 'PHB',
    summary: 'Target a second creature with a single-target spell, for points equal to its level.',
    base: 8,
    rules: [
      { when: concentrates(), delta: 2, why: 'Two Haste or two Polymorph on one concentration is enormous value.' },
    ],
  },
  {
    id: 'subtle-spell', name: 'Subtle Spell', kind: 'metamagic', classId: 'sorcerer',
    source: 'PHB',
    summary: 'Cast without verbal or somatic components for 1 sorcery point.',
    base: 7,
    rules: [
      { when: cls('sorcerer'), delta: 1, why: 'Cast while grappled, silenced, restrained or bound - and nobody can counterspell what they cannot see.' },
    ],
  },
  {
    id: 'heightened-spell', name: 'Heightened Spell', kind: 'metamagic', classId: 'sorcerer',
    source: 'PHB',
    summary: 'One target has disadvantage on its first save against the spell, for 3 sorcery points.',
    base: 6,
  },
  {
    id: 'careful-spell', name: 'Careful Spell', kind: 'metamagic', classId: 'sorcerer',
    source: 'PHB',
    summary: 'Chosen creatures automatically succeed on the save, for 1 sorcery point.',
    base: 5,
  },
  {
    id: 'distant-spell', name: 'Distant Spell', kind: 'metamagic', classId: 'sorcerer',
    source: 'PHB',
    summary: 'Double a spell\'s range, or give a touch spell 30 feet, for 1 sorcery point.',
    base: 4,
  },
  {
    id: 'empowered-spell', name: 'Empowered Spell', kind: 'metamagic', classId: 'sorcerer',
    source: 'PHB',
    summary: 'Reroll damage dice up to your Charisma modifier, for 1 sorcery point.',
    base: 5,
  },
  {
    id: 'extended-spell', name: 'Extended Spell', kind: 'metamagic', classId: 'sorcerer',
    source: 'PHB',
    summary: 'Double a spell\'s duration, to a maximum of 24 hours, for 1 sorcery point.',
    base: 2,
  },
  {
    id: 'seeking-spell', name: 'Seeking Spell', kind: 'metamagic', classId: 'sorcerer',
    source: 'TCoE',
    summary: 'Reroll a missed spell attack, for 2 sorcery points.',
    base: 4,
  },
  {
    id: 'transmuted-spell', name: 'Transmuted Spell', kind: 'metamagic', classId: 'sorcerer',
    source: 'TCoE',
    summary: 'Change a spell\'s damage type, for 1 sorcery point.',
    base: 4,
  },

  // -------------------------------------------------- battle master maneuvers
  {
    id: 'precision-attack', name: 'Precision Attack', kind: 'maneuver', classId: 'fighter',
    source: 'PHB',
    summary: 'Add the superiority die to an attack roll, after seeing it but before the result.',
    base: 9,
    rules: [
      { when: extraAttack(), delta: 1, why: 'Turning a miss into a hit is worth more the more attacks you make.' },
    ],
  },
  {
    id: 'trip-attack', name: 'Trip Attack', kind: 'maneuver', classId: 'fighter',
    source: 'PHB',
    summary: 'Knock a creature prone on a failed Strength save, giving everyone advantage on it.',
    base: 9,
    rules: [
      { when: extraAttack(), delta: 1, why: 'Trip with the first attack and swing at advantage with the rest.' },
    ],
  },
  {
    id: 'riposte', name: 'Riposte', kind: 'maneuver', classId: 'fighter',
    source: 'PHB',
    summary: 'Attack as a reaction when a creature misses you in melee.',
    base: 8,
    rules: [
      { when: any(style('str-melee', 'dex-melee')), delta: 2, why: 'An extra attack every round the enemy misses, which is most rounds.' },
      { when: style('dex-ranged'), delta: -4, why: 'Requires a melee weapon.' },
    ],
  },
  {
    id: 'menacing-attack', name: 'Menacing Attack', kind: 'maneuver', classId: 'fighter',
    source: 'PHB',
    summary: 'Frighten a creature on a failed Wisdom save.',
    base: 6,
  },
  {
    id: 'disarming-attack', name: 'Disarming Attack', kind: 'maneuver', classId: 'fighter',
    source: 'PHB',
    summary: 'Knock a weapon out of a creature\'s hand on a failed Strength save.',
    base: 5,
  },
  {
    id: 'goading-attack', name: 'Goading Attack', kind: 'maneuver', classId: 'fighter',
    source: 'PHB',
    summary: 'Disadvantage on the target\'s attacks against anyone but you.',
    base: 6,
  },
  {
    id: 'pushing-attack', name: 'Pushing Attack', kind: 'maneuver', classId: 'fighter',
    source: 'PHB',
    summary: 'Push a Large or smaller creature 15 feet away.',
    base: 5,
  },
  {
    id: 'maneuvering-attack', name: 'Maneuvering Attack', kind: 'maneuver', classId: 'fighter',
    source: 'PHB',
    summary: 'An ally moves half their speed without provoking an opportunity attack.',
    base: 6,
  },
  {
    id: 'feinting-attack', name: 'Feinting Attack', kind: 'maneuver', classId: 'fighter',
    source: 'PHB',
    summary: 'Bonus action for advantage on your next attack against that creature.',
    base: 6,
  },
  {
    id: 'commanders-strike', name: "Commander's Strike", kind: 'maneuver', classId: 'fighter',
    source: 'PHB',
    summary: 'Give up an attack so an ally can make one as their reaction.',
    base: 5,
    rules: [
      { when: extraAttack(), delta: -1, why: 'You trade one of your own attacks for it, which costs more the better your attacks are.' },
    ],
  },
  {
    id: 'parry', name: 'Parry', kind: 'maneuver', classId: 'fighter',
    source: 'PHB',
    summary: 'Reduce melee damage to yourself by the die plus your Dexterity modifier.',
    base: 5,
  },
  {
    id: 'evasive-footwork', name: 'Evasive Footwork', kind: 'maneuver', classId: 'fighter',
    source: 'PHB',
    summary: 'Add the die to your AC while you move.',
    base: 4,
  },
  {
    id: 'lunging-attack', name: 'Lunging Attack', kind: 'maneuver', classId: 'fighter',
    source: 'PHB',
    summary: 'Five extra feet of reach on one melee attack.',
    base: 4,
  },
  {
    id: 'sweeping-attack', name: 'Sweeping Attack', kind: 'maneuver', classId: 'fighter',
    source: 'PHB',
    summary: 'Deal the die in damage to a second creature next to the first.',
    base: 5,
  },
  {
    id: 'rally', name: 'Rally', kind: 'maneuver', classId: 'fighter',
    source: 'PHB',
    summary: 'Give an ally temporary hit points equal to the die plus your Charisma modifier.',
    base: 4,
  },
  {
    id: 'distracting-strike', name: 'Distracting Strike', kind: 'maneuver', classId: 'fighter',
    source: 'PHB',
    summary: 'The next attack against that creature by anyone else has advantage.',
    base: 6,
  },
  {
    id: 'ambush', name: 'Ambush', kind: 'maneuver', classId: 'fighter',
    source: 'TCoE',
    summary: 'Add the die to a Stealth check or to initiative.',
    base: 4,
  },
  {
    id: 'bait-and-switch', name: 'Bait and Switch', kind: 'maneuver', classId: 'fighter',
    source: 'TCoE',
    summary: 'Swap places with an ally and give one of you the die as an AC bonus.',
    base: 5,
  },
];

export const CLASS_OPTIONS_BY_ID: Record<string, ClassOption> = Object.fromEntries(
  CLASS_OPTIONS.map((o) => [o.id, o]),
);

/** Options of a kind that a given class can choose from, in this ruleset. */
export function optionsFor(kind: ClassOptionKind, ruleset: Ruleset): ClassOption[] {
  return visible(
    CLASS_OPTIONS.filter(
      (o) => o.kind === kind && (o.rulesets ?? ['2014', '2024']).includes(ruleset),
    ),
  );
}

export function optionById(id: string): ClassOption | undefined {
  return CLASS_OPTIONS_BY_ID[id];
}
