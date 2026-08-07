import type { Ability } from '../types';

/**
 * The 18 skills. Identical in both rulesets - 2024 reorganised a great deal but
 * left the skill list and its governing abilities alone.
 *
 * `note` is what the skill is actually for at a table, which is what a player
 * choosing between two of them needs to know. It is not rules text.
 */
export interface Skill {
  id: SkillId;
  name: string;
  ability: Ability;
  note: string;
}

export type SkillId =
  | 'acrobatics'
  | 'animal-handling'
  | 'arcana'
  | 'athletics'
  | 'deception'
  | 'history'
  | 'insight'
  | 'intimidation'
  | 'investigation'
  | 'medicine'
  | 'nature'
  | 'perception'
  | 'performance'
  | 'persuasion'
  | 'religion'
  | 'sleight-of-hand'
  | 'stealth'
  | 'survival';

export const SKILLS: Skill[] = [
  {
    id: 'acrobatics',
    name: 'Acrobatics',
    ability: 'dex',
    note: 'Keeping your feet and squeezing through gaps. Overlaps with Athletics often enough that most parties only need one.',
  },
  {
    id: 'animal-handling',
    name: 'Animal Handling',
    ability: 'wis',
    note: 'Calming and driving animals. Narrow unless you have a mount or the campaign is wilderness-heavy.',
  },
  {
    id: 'arcana',
    name: 'Arcana',
    ability: 'int',
    note: 'Identifying spells, magic items and planar effects. Pays off in magic-heavy campaigns and is nearly dead in others.',
  },
  {
    id: 'athletics',
    name: 'Athletics',
    ability: 'str',
    note: 'Grappling and shoving both key off this, which makes it the one Strength skill with real combat weight.',
  },
  {
    id: 'deception',
    name: 'Deception',
    ability: 'cha',
    note: 'Lying convincingly. One of the three social skills a party actually leans on.',
  },
  {
    id: 'history',
    name: 'History',
    ability: 'int',
    note: 'Recalling events, lineages and old wars. Almost entirely campaign-dependent.',
  },
  {
    id: 'insight',
    name: 'Insight',
    ability: 'wis',
    note: 'Reading intent. The defensive half of every social scene, and it is opposed by Deception constantly.',
  },
  {
    id: 'intimidation',
    name: 'Intimidation',
    ability: 'cha',
    note: 'Leaning on someone. Works where Persuasion will not, and burns the relationship doing it.',
  },
  {
    id: 'investigation',
    name: 'Investigation',
    ability: 'int',
    note: 'Deducing from evidence, where Perception is noticing it. Finds traps and secret doors once you know to look.',
  },
  {
    id: 'medicine',
    name: 'Medicine',
    ability: 'wis',
    note: 'The weakest skill in the game. Stabilising a dying ally is what it does, and a cantrip does that better.',
  },
  {
    id: 'nature',
    name: 'Nature',
    ability: 'int',
    note: 'Terrain, plants and beasts as knowledge rather than survival. Frequently ruled interchangeably with Survival.',
  },
  {
    id: 'perception',
    name: 'Perception',
    ability: 'wis',
    note: 'The most-rolled skill in the game, and it sets your passive Perception, which the DM checks whether or not you roll.',
  },
  {
    id: 'performance',
    name: 'Performance',
    ability: 'cha',
    note: 'Entertaining a crowd. Fun, and Persuasion usually covers whatever you needed it for.',
  },
  {
    id: 'persuasion',
    name: 'Persuasion',
    ability: 'cha',
    note: 'The skill parties reach for most often out of combat, and the reason one character usually does all the talking.',
  },
  {
    id: 'religion',
    name: 'Religion',
    ability: 'int',
    note: 'Deities, rites and the undead. Narrow, but it lands hard in the campaigns built around it.',
  },
  {
    id: 'sleight-of-hand',
    name: 'Sleight of Hand',
    ability: 'dex',
    note: 'Picking pockets and palming things. Also planting them, which is the underrated half.',
  },
  {
    id: 'stealth',
    name: 'Stealth',
    ability: 'dex',
    note: 'Decides how most encounters begin. Worth checking against your armor before you take it.',
  },
  {
    id: 'survival',
    name: 'Survival',
    ability: 'wis',
    note: 'Tracking, foraging and not getting lost. Its value swings entirely on how much your DM cares about travel.',
  },
];

export const SKILLS_BY_ID: Record<SkillId, Skill> = Object.fromEntries(
  SKILLS.map((s) => [s.id, s]),
) as Record<SkillId, Skill>;

export function skillName(id: SkillId): string {
  return SKILLS_BY_ID[id].name;
}

/** Display name back to id, for the importer and for the existing prose data. */
export const SKILL_ID_BY_NAME: Record<string, SkillId> = Object.fromEntries(
  SKILLS.map((s) => [s.name.toLowerCase(), s.id]),
);

export function skillIdFromName(name: string): SkillId | undefined {
  return SKILL_ID_BY_NAME[name.trim().toLowerCase()];
}

/** Every skill, for the classes whose list is "any three". */
export const ALL_SKILL_IDS: SkillId[] = SKILLS.map((s) => s.id);
