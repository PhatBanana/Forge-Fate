import type { CastingType, Condition, Feat, Ruleset, WeaponStyle } from '../../types';

/**
 * The app's own feats.
 *
 * §53 built the switch and gated `featsFor` along with five other catalogues.
 * §56 and §58 gave it subclasses and classes to reveal. The feat catalogue had
 * **nothing behind it at all** - the gate worked perfectly on an empty set,
 * which is the quietest kind of unfinished.
 *
 * ## What these are for
 *
 * The same rule as everything else in `forge/`: not reworded published feats,
 * but ground the printed list leaves empty. 5e's feat list is long and its
 * gaps are specific and well known, and each of these eight names one:
 *
 * - **Nothing in the game makes healing better.** Healer works off a kit,
 *   Inspiring Leader hands out temporary hit points; no feat improves the
 *   spells and features a healer actually spends their turns on.
 * - **Nothing lets you help an ally's saving throw.** Lucky rerolls your own;
 *   Bless is a spell; Aura of Protection is a class feature nobody else gets.
 * - **The reaction is the least-used economy in the game** and no feat gives
 *   you another one.
 * - **Nothing rewards standing still.** Every mobility feat pays you to move,
 *   and the character who braces and shoots gets nothing for it.
 * - **Knowledge skills do nothing in combat.** A high Arcana tells the DM you
 *   might know something; it changes no roll.
 * - **Concentration has advantage (War Caster) and proficiency (Resilient)
 *   and no floor.** A caster who rolls a 2 with advantage still drops it.
 * - **The exploration pillar has no feats with teeth.**
 * - **Breaking an enemy's concentration means Counterspell or nothing.**
 *
 * ## Sizing
 *
 * `forge/feats.test.ts` checks each one's `base` against the published
 * catalogue's own distribution rather than against a number typed here, the
 * same way `balance.test.ts` measures the classes. A homebrew feat that
 * outranks Lucky is not a feat, it is a mistake with a name.
 */

// The same tiny builders `feats.ts` uses, for the same reason: the rules below
// should read like sentences rather than like object literals.
const style = (...styles: WeaponStyle[]): Condition => ({ kind: 'weaponStyle', styles });
const casting = (...types: CastingType[]): Condition => ({ kind: 'casting', types });
const lvl = (min?: number, max?: number): Condition => ({ kind: 'level', min, max });
const concentrates = (): Condition => ({ kind: 'concentrates' });
const all = (...of: Condition[]): Condition => ({ kind: 'all', of });
const not = (of: Condition): Condition => ({ kind: 'not', of });

const BOTH: Ruleset[] = ['2014', '2024'];
const ANY_CASTER: CastingType[] = ['full', 'half', 'third', 'pact'];

export const FORGE_FEATS: Feat[] = [
  {
    id: 'forge-field-medic',
    name: 'Field Medic',
    source: 'Forge',
    rulesets: BOTH,
    category: 'general',
    summary:
      'When you restore hit points to a creature other than yourself, add your proficiency bonus. When you stabilise a dying creature, it regains 1 hit point instead.',
    tags: ['utility', 'survivability'],
    prereq: { minLevel: 4 },
    base: 6,
    rules: [
      {
        when: casting(...ANY_CASTER),
        delta: 2,
        why: 'Every healing spell you cast gets better, and this is the only feat in the game that says so.',
      },
      {
        when: not(casting(...ANY_CASTER)),
        delta: -3,
        why: 'Without a healing spell or feature there is little for this to add to.',
      },
    ],
    in2024: { asi: { abilities: ['wis', 'cha'], amount: 1 } },
  },

  {
    id: 'forge-standing-order',
    name: 'Standing Order',
    source: 'Forge',
    rulesets: BOTH,
    category: 'general',
    summary:
      'When an ally you can see within 30 feet fails a saving throw, you may use your reaction to let them reroll it. Uses equal to your proficiency bonus, back on a long rest.',
    tags: ['defense', 'utility'],
    prereq: { minLevel: 4 },
    base: 7,
    rules: [
      {
        when: lvl(9),
        delta: 2,
        why: 'From tier three onward a failed save is usually the thing that loses the fight, and this is a second chance at somebody else\'s.',
      },
    ],
    in2024: { asi: { abilities: ['cha'], amount: 1 } },
  },

  {
    id: 'forge-second-reaction',
    name: 'Quick to Answer',
    source: 'Forge',
    rulesets: BOTH,
    category: 'general',
    summary:
      'Once per fight you may take a second reaction in the same round. You still cannot take the same reaction twice.',
    tags: ['action-economy', 'defense'],
    prereq: { minLevel: 4 },
    base: 6,
    rules: [
      {
        when: all(style('str-melee', 'dex-melee'), lvl(5)),
        delta: 2,
        why: 'Opportunity attacks and Sentinel-style riders both want a reaction you have already spent.',
      },
      {
        when: casting('full'),
        delta: 1,
        why: 'Shield and Counterspell compete for the same reaction every round.',
      },
    ],
  },

  {
    id: 'forge-set',
    name: 'Set',
    source: 'Forge',
    rulesets: BOTH,
    category: 'general',
    summary:
      'If you do not move on your turn, your attacks that turn score a critical hit on a 19 or 20, and you ignore half cover.',
    tags: ['damage', 'accuracy', 'ranged'],
    prereq: { minLevel: 4 },
    base: 6,
    rules: [
      {
        when: style('dex-ranged'),
        delta: 3,
        why: 'A ranged attacker rarely wants to move anyway, so this is close to a free extra crit range.',
      },
      {
        when: style('str-melee', 'dex-melee', 'unarmed'),
        delta: -2,
        why: 'Melee builds move to reach things, which is exactly what this asks you not to do.',
      },
    ],
  },

  {
    id: 'forge-field-analysis',
    name: 'Field Analysis',
    source: 'Forge',
    rulesets: BOTH,
    category: 'general',
    summary:
      'As a bonus action, make an Intelligence check against a creature you can see (DC 10 + half its challenge rating). On a success you learn one of its resistances, immunities or vulnerabilities, and the next attack an ally makes against it has advantage.',
    tags: ['utility', 'skills', 'accuracy'],
    prereq: { minLevel: 4 },
    base: 6,
    rules: [
      {
        when: casting('third', 'full'),
        delta: 1,
        why: 'You already have the Intelligence to pass the check reliably.',
      },
    ],
    in2024: { asi: { abilities: ['int'], amount: 1 } },
  },

  {
    id: 'forge-unbroken-focus',
    name: 'Unbroken Focus',
    source: 'Forge',
    rulesets: BOTH,
    category: 'general',
    summary:
      'You cannot roll below 10 on a saving throw to maintain concentration, and being moved against your will never ends it.',
    tags: ['caster', 'defense'],
    prereq: { minLevel: 4, spellcasting: true },
    base: 7,
    rules: [
      {
        when: concentrates(),
        delta: 3,
        why: 'War Caster gives you advantage and Resilient gives you proficiency; neither stops a low roll, and this does.',
      },
      {
        when: not(casting(...ANY_CASTER)),
        delta: -6,
        why: 'Nothing to concentrate on.',
      },
    ],
    in2024: { asi: { abilities: ['con', 'int', 'wis', 'cha'], amount: 1 } },
  },

  {
    id: 'forge-trailwise',
    name: 'Trailwise',
    source: 'Forge',
    rulesets: BOTH,
    category: 'origin',
    summary:
      'Your party ignores the first level of exhaustion from a forced march each day, needs half the usual food and water, and cannot be lost while you are conscious. You have advantage on checks to find a path, a camp or a water source.',
    tags: ['utility', 'skills'],
    base: 5,
    rules: [
      {
        when: lvl(1, 5),
        delta: 1,
        why: 'Travel and supply matter most before the party can teleport or conjure food.',
      },
    ],
  },

  {
    id: 'forge-disruptor',
    name: 'Disruptor',
    source: 'Forge',
    rulesets: BOTH,
    category: 'general',
    summary:
      'When you damage a creature that is concentrating, it has disadvantage on the saving throw to maintain it. If you damage it twice in the same round, the second save is made at disadvantage even if the first succeeded.',
    tags: ['control', 'damage'],
    prereq: { minLevel: 4 },
    base: 6,
    rules: [
      {
        when: lvl(5),
        delta: 2,
        why: 'From tier two the enemy caster\'s concentration spell is usually the fight, and this is the answer that does not cost a slot.',
      },
      {
        when: style('dex-ranged'),
        delta: 1,
        why: 'You can reach the back line, which is where the concentration usually is.',
      },
    ],
  },
];
