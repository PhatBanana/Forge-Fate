import type { Ability, Ruleset } from '../types';
import type { SkillId } from './skills';
import type { Source } from './sources';
import { visible } from '../originals';

/**
 * Backgrounds do very different jobs in the two rulesets.
 *
 * In 2014 a background is flavour plus a couple of proficiencies and a feature:
 * it never touches your ability scores.
 *
 * In 2024 it is the origin of your ability score increases and your first feat,
 * which makes background-versus-class the question species-versus-class used to
 * be. `abilities` lists the three scores a background can raise; you take either
 * +2/+1 across two of them or +1 to all three.
 */
export interface Background {
  id: string;
  name: string;
  rulesets: Ruleset[];
  source: Source;
  /** 2024: the three abilities this background can raise. */
  abilities?: Ability[];
  /** 2024: the Origin feat granted at 1st level. */
  originFeatId?: string;
  skills: SkillId[];
  /** Tools, instruments, gaming sets and vehicles, in prose. */
  tools: string[];
  /** 2014 only: number of extra languages. */
  languages?: number;
  /** 2014 only: the named background feature. */
  feature?: { name: string; text: string };
  note: string;
}

export const BACKGROUNDS: Background[] = [
  // ------------------------------------------------------------------- 2024
  // Each grants three ability options, two skills, one tool and an Origin feat.
  {
    id: 'acolyte-2024',
    name: 'Acolyte',
    rulesets: ['2024'],
    source: 'PHB 2024',
    abilities: ['int', 'wis', 'cha'],
    originFeatId: 'magic-initiate',
    skills: ['insight', 'religion'],
    tools: ['Calligrapher’s supplies'],
    note: 'The three mental stats plus Magic Initiate. Natural fit for Clerics and Wizards, and one of the few ways a martial can pick up a cantrip at level 1.',
  },
  {
    id: 'artisan-2024',
    name: 'Artisan',
    rulesets: ['2024'],
    source: 'PHB 2024',
    abilities: ['str', 'dex', 'int'],
    originFeatId: 'crafter',
    skills: ['investigation', 'persuasion'],
    tools: ['One kind of artisan’s tools'],
    note: 'STR/DEX/INT is an unusual spread - it suits an Artificer or a Dexterity-based gish more than anything else.',
  },
  {
    id: 'charlatan-2024',
    name: 'Charlatan',
    rulesets: ['2024'],
    source: 'PHB 2024',
    abilities: ['dex', 'con', 'cha'],
    originFeatId: 'skilled',
    skills: ['deception', 'sleight-of-hand'],
    tools: ['Forgery kit'],
    note: 'DEX/CON/CHA covers a Swashbuckler Rogue or a Sorcerer who wants Constitution, and Skilled adds three more proficiencies.',
  },
  {
    id: 'criminal-2024',
    name: 'Criminal',
    rulesets: ['2024'],
    source: 'PHB 2024',
    abilities: ['dex', 'con', 'int'],
    originFeatId: 'alert',
    skills: ['sleight-of-hand', 'stealth'],
    tools: ['Thieves’ tools'],
    note: 'Alert is the strongest Origin feat in the book, and DEX/CON is exactly what a Rogue wants. The default optimised Rogue origin.',
  },
  {
    id: 'entertainer-2024',
    name: 'Entertainer',
    rulesets: ['2024'],
    source: 'PHB 2024',
    abilities: ['str', 'dex', 'cha'],
    originFeatId: 'musician',
    skills: ['acrobatics', 'performance'],
    tools: ['One musical instrument'],
    note: 'The right stats for a Bard, though Musician is a weak feat next to Alert or Magic Initiate.',
  },
  {
    id: 'farmer-2024',
    name: 'Farmer',
    rulesets: ['2024'],
    source: 'PHB 2024',
    abilities: ['str', 'con', 'wis'],
    originFeatId: 'tough',
    skills: ['animal-handling', 'nature'],
    tools: ['Carpenter’s tools'],
    note: 'STR/CON/WIS with Tough. Unglamorous and genuinely good for a Barbarian, Paladin or melee Cleric.',
  },
  {
    id: 'guard-2024',
    name: 'Guard',
    rulesets: ['2024'],
    source: 'PHB 2024',
    abilities: ['str', 'int', 'wis'],
    originFeatId: 'alert',
    skills: ['athletics', 'perception'],
    tools: ['One gaming set'],
    note: 'Alert on a Strength chassis. The best origin for a STR martial who wants to act first.',
  },
  {
    id: 'guide-2024',
    name: 'Guide',
    rulesets: ['2024'],
    source: 'PHB 2024',
    abilities: ['dex', 'con', 'wis'],
    originFeatId: 'magic-initiate',
    skills: ['stealth', 'survival'],
    tools: ['Cartographer’s tools'],
    note: 'DEX/CON/WIS with free spells - the textbook Ranger and Monk origin.',
  },
  {
    id: 'hermit-2024',
    name: 'Hermit',
    rulesets: ['2024'],
    source: 'PHB 2024',
    abilities: ['con', 'wis', 'cha'],
    originFeatId: 'healer',
    skills: ['medicine', 'religion'],
    tools: ['Herbalism kit'],
    note: 'CON/WIS/CHA suits a Druid or Cleric; Healer is situational but never dead.',
  },
  {
    id: 'merchant-2024',
    name: 'Merchant',
    rulesets: ['2024'],
    source: 'PHB 2024',
    abilities: ['con', 'int', 'cha'],
    originFeatId: 'lucky',
    skills: ['animal-handling', 'persuasion'],
    tools: ['Navigator’s tools'],
    note: 'Lucky at level 1 is extraordinary value, and CON/INT/CHA fits a Sorcerer, Warlock or Artificer.',
  },
  {
    id: 'noble-2024',
    name: 'Noble',
    rulesets: ['2024'],
    source: 'PHB 2024',
    abilities: ['str', 'int', 'cha'],
    originFeatId: 'skilled',
    skills: ['history', 'persuasion'],
    tools: ['One gaming set'],
    note: 'STR/CHA is the Paladin spread, and Skilled papers over a narrow class skill list.',
  },
  {
    id: 'sage-2024',
    name: 'Sage',
    rulesets: ['2024'],
    source: 'PHB 2024',
    abilities: ['con', 'int', 'wis'],
    originFeatId: 'magic-initiate',
    skills: ['arcana', 'history'],
    tools: ['Calligrapher’s supplies'],
    note: 'INT and CON together with two extra cantrips and a spell. The default Wizard origin.',
  },
  {
    id: 'sailor-2024',
    name: 'Sailor',
    rulesets: ['2024'],
    source: 'PHB 2024',
    abilities: ['str', 'dex', 'wis'],
    originFeatId: 'tavern-brawler',
    skills: ['acrobatics', 'perception'],
    tools: ['Navigator’s tools'],
    note: 'The 2024 Tavern Brawler is a real feat - a free push or reroll on every unarmed hit. Good on a Monk.',
  },
  {
    id: 'scribe-2024',
    name: 'Scribe',
    rulesets: ['2024'],
    source: 'PHB 2024',
    abilities: ['dex', 'int', 'wis'],
    originFeatId: 'skilled',
    skills: ['investigation', 'perception'],
    tools: ['Calligrapher’s supplies'],
    note: 'DEX and INT together is the Wizard-who-wants-AC spread, or an Arcane Trickster.',
  },
  {
    id: 'soldier-2024',
    name: 'Soldier',
    rulesets: ['2024'],
    source: 'PHB 2024',
    abilities: ['str', 'dex', 'con'],
    originFeatId: 'savage-attacker',
    skills: ['athletics', 'intimidation'],
    tools: ['One gaming set'],
    note: 'All three physical stats - the only background that can put +2/+1 entirely into a martial\'s attack and hit points.',
  },
  {
    id: 'wayfarer-2024',
    name: 'Wayfarer',
    rulesets: ['2024'],
    source: 'PHB 2024',
    abilities: ['dex', 'wis', 'cha'],
    originFeatId: 'lucky',
    skills: ['insight', 'stealth'],
    tools: ['Thieves’ tools'],
    note: 'Lucky plus DEX and CHA. Excellent for a Rogue, Bard or Warlock.',
  },

  // ------------------------------------------------------------------- 2014
  // No ability increases; a background here is proficiencies and a feature.
  {
    id: 'acolyte',
    name: 'Acolyte',
    rulesets: ['2014'],
    source: 'PHB',
    skills: ['insight', 'religion'],
    tools: [],
    languages: 2,
    feature: { name: 'Shelter of the Faithful', text: 'You and your companions can expect free healing and care at temples of your faith.' },
    note: 'Two languages and a reliable place to rest. The safe pick for a Cleric.',
  },
  {
    id: 'charlatan',
    name: 'Charlatan',
    rulesets: ['2014'],
    source: 'PHB',
    skills: ['deception', 'sleight-of-hand'],
    tools: ['Disguise kit', 'Forgery kit'],
    feature: { name: 'False Identity', text: 'You have a second persona with documentation and contacts to back it up.' },
    note: 'A disguise kit and a forgery kit make this the best infiltration background in the PHB.',
  },
  {
    id: 'criminal',
    name: 'Criminal',
    rulesets: ['2014'],
    source: 'PHB',
    skills: ['deception', 'stealth'],
    tools: ['One gaming set', 'Thieves’ tools'],
    feature: { name: 'Criminal Contact', text: 'You know a fixer who can carry messages to and from the criminal underworld.' },
    note: 'Thieves\' tools without spending a class proficiency. The default Rogue background.',
  },
  {
    id: 'entertainer',
    name: 'Entertainer',
    rulesets: ['2014'],
    source: 'PHB',
    skills: ['acrobatics', 'performance'],
    tools: ['Disguise kit', 'One musical instrument'],
    feature: { name: 'By Popular Demand', text: 'You can always find a place to perform, and lodging comes with it.' },
    note: 'Fits the Bard fantasy, though Acrobatics and Performance are two of the weaker skills.',
  },
  {
    id: 'folk-hero',
    name: 'Folk Hero',
    rulesets: ['2014'],
    source: 'PHB',
    skills: ['animal-handling', 'survival'],
    tools: ['One artisan’s tools', 'Vehicles (land)'],
    feature: { name: 'Rustic Hospitality', text: 'Common folk will shelter and hide you.' },
    note: 'Solid outdoor skills for a Ranger, Druid or Barbarian.',
  },
  {
    id: 'guild-artisan',
    name: 'Guild Artisan',
    rulesets: ['2014'],
    source: 'PHB',
    skills: ['insight', 'persuasion'],
    tools: ['One artisan’s tools'],
    languages: 1,
    feature: { name: 'Guild Membership', text: 'Your guild provides lodging, food and political backing.' },
    note: 'Insight and Persuasion is the strongest social pair in the PHB.',
  },
  {
    id: 'hermit',
    name: 'Hermit',
    rulesets: ['2014'],
    source: 'PHB',
    skills: ['medicine', 'religion'],
    tools: ['Herbalism kit'],
    languages: 1,
    feature: { name: 'Discovery', text: 'Your seclusion produced a unique and powerful discovery, agreed with your DM.' },
    note: 'The Discovery feature is as good as you and your DM decide to make it.',
  },
  {
    id: 'noble',
    name: 'Noble',
    rulesets: ['2014'],
    source: 'PHB',
    skills: ['history', 'persuasion'],
    tools: ['One gaming set'],
    languages: 1,
    feature: { name: 'Position of Privilege', text: 'People assume you have the right to be wherever you are.' },
    note: 'Position of Privilege opens doors that would otherwise need a check.',
  },
  {
    id: 'outlander',
    name: 'Outlander',
    rulesets: ['2014'],
    source: 'PHB',
    skills: ['athletics', 'survival'],
    tools: ['One musical instrument'],
    languages: 1,
    feature: { name: 'Wanderer', text: 'You always remember terrain and can find food and water for your party.' },
    note: 'Wanderer quietly removes most overland travel bookkeeping.',
  },
  {
    id: 'sage',
    name: 'Sage',
    rulesets: ['2014'],
    source: 'PHB',
    skills: ['arcana', 'history'],
    tools: [],
    languages: 2,
    feature: { name: 'Researcher', text: 'When you do not know something, you know where to find it.' },
    note: 'The two headline knowledge skills plus two languages. The default Wizard background.',
  },
  {
    id: 'sailor',
    name: 'Sailor',
    rulesets: ['2014'],
    source: 'PHB',
    skills: ['athletics', 'perception'],
    tools: ['Navigator’s tools', 'Vehicles (water)'],
    feature: { name: 'Ship’s Passage', text: 'You can secure free passage for yourself and your companions.' },
    note: 'Perception is the most-rolled skill in the game, and free passage is real money saved.',
  },
  {
    id: 'soldier',
    name: 'Soldier',
    rulesets: ['2014'],
    source: 'PHB',
    skills: ['athletics', 'intimidation'],
    tools: ['One gaming set', 'Vehicles (land)'],
    feature: { name: 'Military Rank', text: 'Soldiers loyal to your former organisation recognise your authority.' },
    note: 'Athletics and Intimidation suit any front-line martial.',
  },
  {
    id: 'urchin',
    name: 'Urchin',
    rulesets: ['2014'],
    source: 'PHB',
    skills: ['sleight-of-hand', 'stealth'],
    tools: ['Disguise kit', 'Thieves’ tools'],
    feature: { name: 'City Secrets', text: 'You can move through a city at twice the normal travel speed.' },
    note: 'The other strong Rogue background, and the better one if your campaign is urban.',
  },
];

export const BACKGROUNDS_BY_ID: Record<string, Background> = Object.fromEntries(
  BACKGROUNDS.map((b) => [b.id, b]),
);

export function backgroundsFor(ruleset: Ruleset): Background[] {
  return visible(BACKGROUNDS.filter((b) => b.rulesets.includes(ruleset)));
}
