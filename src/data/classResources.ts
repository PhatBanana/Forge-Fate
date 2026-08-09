import type { Ability, ClassId, Ruleset } from '../types';

/**
 * The things a class spends and gets back on a rest.
 *
 * Hit points, hit dice and spell slots were tracked first because they needed
 * no data - the engine already derived them. These need a table, and this is
 * it: how many you get, at what level, and which rest hands them back.
 *
 * **Both editions now.** This table was 2014-only for a long time, on the
 * belief that the 2024 sources described their changes qualitatively and never
 * printed the numbers. That was wrong: SRD 5.2 prints a column per resource and
 * `src/data/srd/srd-2024-classes.json` carries them, so the audit checks these
 * against the book rather than taking anyone's word.
 *
 * Being 2014-only was not a neutral fallback either. Every row was tagged
 * `['2014']`, so a 2024 character was shown *no class resources at all* - a
 * 2024 Fighter 9 had no Second Wind, no Action Surge and no Indomitable.
 *
 * Three rows stay 2014-only, and each says why on the row. The rule is the one
 * this file always had: a number that cannot be sourced is not written down.
 */

export type Recharge = 'short' | 'long';

/**
 * How a maximum is worked out. Three shapes cover every class resource in the
 * 2014 rules, which is why this is a union rather than a function: data stays
 * inspectable, and a wrong number is a visible edit rather than buried logic.
 */
export type ResourceMax =
  /** A fixed progression, read like `masteries` and `asiLevels`. */
  | { kind: 'table'; byLevel: { level: number; count: number }[] }
  /** Equal to your level in the class, optionally multiplied. */
  | { kind: 'classLevel'; times?: number }
  /** An ability modifier, with an optional flat addition and floor. */
  | { kind: 'abilityMod'; ability: Ability; plus?: number; min?: number };

export interface ClassResource {
  /** Unique within its class. */
  id: string;
  name: string;
  max: ResourceMax;
  recharge: Recharge;
  /**
   * A handful of uses reads as pips you click; a pool of dozens does not -
   * fifty pips for a Paladin's Lay on Hands would be unusable.
   */
  display: 'pips' | 'pool';
  /** The level the feature arrives. */
  minLevel: number;
  rulesets?: Ruleset[];
  /**
   * What 2024 changed, in the same shape `weapons.ts` and `feats.ts` use. The
   * base row holds the 2014 values and this holds the revision, so a resource
   * that only had its numbers moved does not become two rows that can drift
   * apart.
   */
  in2024?: Partial<Pick<ClassResource, 'name' | 'max' | 'recharge' | 'minLevel' | 'note'>>;
  note?: string;
  /**
   * A number the resource is worth, where "how many uses" is not the number a
   * player needs mid-game.
   *
   * Arcane Recovery is the case that earned this. Its `max` is 1 - one use a
   * day, correctly - and the number a Wizard actually wants is *how many spell
   * levels they get back*, which is half their level rounded up. That lived in
   * a `note` that only rendered as a tooltip and only as prose, so a 13th
   * level Wizard was told "half your level rounded up" and left to do it.
   *
   * A function of the class level rather than a string, because it is a
   * progression, and progressions in this app are computed rather than typed
   * out twenty times.
   */
  detail?: (classLevel: number) => string;
}

const IN_2014: Ruleset[] = ['2014'];
const IN_2024: Ruleset[] = ['2024'];

/** A progression written the way the SRD prints it: the levels it steps at. */
const steps = (...pairs: [number, number][]): ResourceMax => ({
  kind: 'table',
  byLevel: pairs.map(([level, count]) => ({ level, count })),
});

export const CLASS_RESOURCES: Partial<Record<ClassId, ClassResource[]>> = {
  barbarian: [
    {
      id: 'rage',
      name: 'Rage',
      max: {
        kind: 'table',
        byLevel: [
          { level: 1, count: 2 },
          { level: 3, count: 3 },
          { level: 6, count: 4 },
          { level: 12, count: 5 },
          { level: 17, count: 6 },
        ],
      },
      recharge: 'long',
      display: 'pips',
      minLevel: 1,
      note: 'At 20th level rages are unlimited; the tracker stops counting at six rather than pretending there is a limit.',
    },
  ],

  bard: [
    {
      id: 'bardic-inspiration',
      name: 'Bardic Inspiration',
      max: { kind: 'abilityMod', ability: 'cha', min: 1 },
      recharge: 'long',
      display: 'pips',
      minLevel: 1,
      note: 'Comes back on a short rest from 5th level, when Font of Inspiration arrives. Until then it is once a day.',
    },
  ],

  cleric: [
    {
      id: 'channel-divinity',
      name: 'Channel Divinity',
      max: {
        kind: 'table',
        byLevel: [
          { level: 2, count: 1 },
          { level: 6, count: 2 },
          { level: 18, count: 3 },
        ],
      },
      // 2024 hands out one more at every step.
      in2024: { max: steps([2, 2], [6, 3], [18, 4]) },
      recharge: 'short',
      display: 'pips',
      minLevel: 2,
    },
  ],

  druid: [
    {
      id: 'wild-shape',
      name: 'Wild Shape',
      max: { kind: 'table', byLevel: [{ level: 2, count: 2 }] },
      recharge: 'short',
      display: 'pips',
      minLevel: 2,
      rulesets: IN_2014,
      note: 'Two uses at every level; a Moon Druid simply gets far more out of each. 2014 only: SRD 5.2 says a 2024 Druid gets "additional uses ... as shown in the Wild Shape column" and the column is not in the source, so the later increases would have to be invented.',
    },
  ],

  fighter: [
    {
      id: 'second-wind',
      name: 'Second Wind',
      max: { kind: 'table', byLevel: [{ level: 1, count: 1 }] },
      // The change most likely to be missed: 2024 turns one use into two,
      // rising to four, which is a different feature to play around.
      in2024: { max: steps([1, 2], [4, 3], [10, 4]) },
      recharge: 'short',
      display: 'pips',
      minLevel: 1,
    },
    {
      id: 'action-surge',
      name: 'Action Surge',
      max: {
        kind: 'table',
        byLevel: [
          { level: 2, count: 1 },
          { level: 17, count: 2 },
        ],
      },
      recharge: 'short',
      display: 'pips',
      minLevel: 2,
    },
    {
      id: 'indomitable',
      name: 'Indomitable',
      max: {
        kind: 'table',
        byLevel: [
          { level: 9, count: 1 },
          { level: 13, count: 2 },
          { level: 17, count: 3 },
        ],
      },
      recharge: 'long',
      display: 'pips',
      minLevel: 9,
    },
  ],

  monk: [
    {
      id: 'ki',
      name: 'Ki points',
      max: { kind: 'classLevel' },
      // Renamed in 2024. The count is unchanged - your Monk level - so this is
      // one row with a new label rather than two rows that can drift apart.
      in2024: { name: 'Focus Points' },
      recharge: 'short',
      display: 'pool',
      minLevel: 2,
    },
  ],

  paladin: [
    {
      id: 'lay-on-hands',
      name: 'Lay on Hands',
      max: { kind: 'classLevel', times: 5 },
      recharge: 'long',
      display: 'pool',
      minLevel: 1,
      note: 'A pool of hit points to spend, not a number of uses.',
    },
    {
      id: 'divine-sense',
      name: 'Divine Sense',
      max: { kind: 'abilityMod', ability: 'cha', plus: 1, min: 1 },
      recharge: 'long',
      display: 'pips',
      minLevel: 1,
      rulesets: IN_2014,
      note: '2014 only. In 2024 this stopped being its own resource: it is a Channel Divinity option, and is counted there.',
    },
    {
      id: 'channel-divinity-paladin',
      name: 'Channel Divinity',
      max: { kind: 'table', byLevel: [{ level: 3, count: 1 }] },
      in2024: { max: steps([3, 2], [11, 3]) },
      recharge: 'short',
      display: 'pips',
      minLevel: 3,
    },
  ],

  sorcerer: [
    {
      id: 'sorcery-points',
      name: 'Sorcery points',
      max: { kind: 'classLevel' },
      recharge: 'long',
      display: 'pool',
      minLevel: 2,
      note: 'Font of Magic: trade points for a spell slot, or a slot back for its level in points. The sheet does both beside the slots.',
    },
  ],

  warlock: [
    {
      id: 'mystic-arcanum',
      name: 'Mystic Arcanum',
      max: {
        kind: 'table',
        byLevel: [
          { level: 11, count: 1 },
          { level: 13, count: 2 },
          { level: 15, count: 3 },
          { level: 17, count: 4 },
        ],
      },
      recharge: 'long',
      display: 'pips',
      minLevel: 11,
      note: 'One casting each of 6th, 7th, 8th and 9th level, separate from Pact Magic.',
    },
  ],

  wizard: [
    {
      id: 'arcane-recovery',
      name: 'Arcane Recovery',
      max: { kind: 'table', byLevel: [{ level: 1, count: 1 }] },
      recharge: 'long',
      display: 'pips',
      minLevel: 1,
      // One use a day; the number that matters is how much it gives back.
      detail: (level) => `${Math.ceil(level / 2)} levels of slots`,
      note: 'Once a day, on a short rest, recover slots totalling half your level rounded up. Restore them in the slot tracker above.',
    },
  ],

  artificer: [
    {
      id: 'flash-of-genius',
      name: 'Flash of Genius',
      max: { kind: 'abilityMod', ability: 'int', min: 1 },
      recharge: 'long',
      display: 'pips',
      minLevel: 7,
      rulesets: IN_2014,
    },
  ],

  ranger: [
    {
      // New in 2024, and the reason a 2024 Ranger plays differently: Favored
      // Enemy stopped being a list of creature types you were good against and
      // became free castings of Hunter's Mark. That is a resource you spend,
      // where the 2014 version was a static bonus with nothing to track.
      id: 'favored-enemy',
      name: "Favored Enemy (Hunter's Mark)",
      max: steps([1, 2], [5, 3], [9, 4], [13, 5], [17, 6]),
      recharge: 'long',
      display: 'pips',
      minLevel: 1,
      rulesets: IN_2024,
      note: "Free castings of Hunter's Mark, which need no spell slot and no concentration beyond the one the spell itself asks for.",
    },
  ],

  // A Rogue has no per-rest pool in either edition: Sneak Attack costs nothing
  // and is counted on the attack line. Absent rather than empty, so the panel
  // says nothing rather than showing an empty box.
};

/**
 * What Font of Magic charges to conjure a spell slot out of sorcery points.
 *
 * The rate is not linear and is not derivable - a 3rd-level slot costs 5 and a
 * 4th costs 6 - so it is a table, checked against the SRD by the data audit.
 * Nothing above 5th can be created, which is why the table simply stops.
 *
 * Going the other way needs no table: expending a slot yields its own level in
 * points.
 */
export const SORCERY_POINT_SLOT_COSTS: Record<number, number> = {
  1: 2,
  2: 3,
  3: 5,
  4: 6,
  5: 7,
};

/** Every resource a class has in a given ruleset, with 2024's revisions applied. */
export function resourcesForClass(classId: ClassId, ruleset: Ruleset): ClassResource[] {
  return (CLASS_RESOURCES[classId] ?? [])
    .filter((resource) => (resource.rulesets ?? ['2014', '2024']).includes(ruleset))
    .map((resource) =>
      ruleset === '2024' && resource.in2024 ? { ...resource, ...resource.in2024 } : resource,
    );
}
