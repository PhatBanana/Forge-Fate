import type { Monster, MonsterAbility } from '../data/monsters';

/**
 * A monster's attacks, in a shape something other than a button can read.
 *
 * This was inside `MonsterCommandMenu`, which was fine while the only thing
 * that wanted a goblin's scimitar was the goblin's own menu. A turn planner
 * wants the same routine without rendering anything, so it comes out here -
 * pure, and testable against all 334 stat blocks at once.
 *
 * ## Where the reach comes from
 *
 * The stat blocks state reach and range **only in prose**: "Melee Weapon
 * Attack: +4 to hit, reach 5 ft., one target." Nothing structured carries it.
 * That was survivable while a human read the line and decided where to stand;
 * it is not survivable for a planner, which otherwise cannot tell a goblin's
 * shortbow from its scimitar and would walk an archer into melee.
 *
 * So it is parsed. The prose is machine-generated from the SRD and regular
 * enough for three patterns to cover **every** attack in the fixture, which
 * `strikes.test.ts` asserts across all of them rather than trusting a spot
 * check - a data refresh that rewords the line fails the test rather than
 * quietly making every monster melee-only.
 */

export interface StrikeRange {
  /** Melee reach in feet, when the attack can be made in melee at all. */
  reach?: number;
  /** Normal and long range in feet, when it can be thrown or fired. */
  ranged?: { normal: number; long: number };
}

export interface Strike {
  label: string;
  toHit: number;
  damage: { dice: string; type: string }[];
  /**
   * True when the blow counts as magical, which decides every "from
   * nonmagical weapons" clause in the bestiary. Absent reads as mundane,
   * which is right for a monster's claws unless its stat block says otherwise
   * in prose this app does not parse.
   */
  magical?: boolean;
  /**
   * How far it reaches. Absent when the prose did not say - a homebrew
   * monster written in the bestiary workshop has no SRD sentence to read -
   * and callers treat that as ordinary melee rather than as unlimited.
   */
  range?: StrikeRange;
}

/**
 * The floor under every reach, and a ruling rather than a fix.
 *
 * Nine swarms state "reach 0 ft., one creature in the swarm's space", which
 * is true to the book: a swarm of rats bites what is standing inside it. This
 * grid does not let two combatants share a square, so a swarm taken at its
 * word could never attack anything at all. Read as adjacent instead - the
 * nearest thing the grid can express to being in the swarm - because a swarm
 * that cannot bite is more wrong than a swarm that bites from one square away.
 *
 * `rangeOf` keeps reporting the 0, because a parser should say what the page
 * says. The ruling lives here, in the pair of functions whose job is deciding
 * where to stand.
 */
const ADJACENT = 5;

/** What a strike can reach at all, in feet, long range included. */
export const maxReach = (strike: Strike): number =>
  Math.max(
    strike.range?.ranged?.long ?? strike.range?.ranged?.normal ?? strike.range?.reach ?? ADJACENT,
    ADJACENT,
  );

/**
 * How far away a monster would *choose* to stand to use this.
 *
 * Long range is deliberately not it: a shot at long range is at disadvantage,
 * so a planner that treated 320 feet as "in range" would have every goblin
 * plinking away at odds it should not accept.
 */
export const preferredReach = (strike: Strike): number =>
  Math.max(strike.range?.ranged?.normal ?? strike.range?.reach ?? ADJACENT, ADJACENT);

/** True when closing to melee is the point of this attack. */
export const isMelee = (strike: Strike): boolean =>
  strike.range?.ranged === undefined;

/**
 * Read reach and range out of an attack's prose.
 *
 * Three patterns, because the SRD writes three sentences: "reach 5 ft." for
 * melee, "range 80/320 ft." for a weapon with a long range, and "range 150
 * ft." for a spell attack that has only the one. An attack can say both -
 * eleven do, all of them thrown daggers - and both are kept, because a bandit
 * captain with a dagger really can either stab or throw.
 */
export function rangeOf(desc: string): StrikeRange | null {
  const reach = /reach (\d+)\s*ft/i.exec(desc);
  const banded = /range (\d+)\/(\d+)\s*ft/i.exec(desc);
  const flat = banded ? null : /range (\d+)\s*ft/i.exec(desc);

  const out: StrikeRange = {};
  if (reach) out.reach = Number(reach[1]);
  if (banded) out.ranged = { normal: Number(banded[1]), long: Number(banded[2]) };
  else if (flat) out.ranged = { normal: Number(flat[1]), long: Number(flat[1]) };

  return out.reach === undefined && out.ranged === undefined ? null : out;
}

/** An ability as a strike, or null when it is not an attack at all. */
export function strikeOf(ability: MonsterAbility): Strike | null {
  if (ability.toHit === undefined || !ability.damage?.length) return null;
  const range = rangeOf(ability.desc ?? '');
  return {
    label: ability.name,
    toHit: ability.toHit,
    damage: ability.damage,
    ...(range ? { range } : {}),
  };
}

/**
 * A monster's whole round: the Multiattack expanded into the swings it is
 * made of, or empty when it has none.
 *
 * Only 113 of the 148 monsters with a Multiattack state its parts as data;
 * the rest describe it in prose, which is not something to parse. Those come
 * back empty here and the caller falls back to `singleStrikes`, which is the
 * same thing the command menu already did by listing each attack separately.
 */
export function routineFor(monster: Monster): Strike[] {
  const byName = new Map(monster.actions.map((a) => [a.name, a]));
  const multi = monster.actions.find((a) => a.multiattack?.length);
  if (!multi?.multiattack) return [];
  return multi.multiattack.flatMap((part) => {
    const ability = byName.get(part.name);
    const strike = ability ? strikeOf(ability) : null;
    return strike ? Array.from({ length: part.count }, () => strike) : [];
  });
}

/** Every single attack the monster has, for when there is no Multiattack. */
export const singleStrikes = (monster: Monster): Strike[] =>
  monster.actions.map(strikeOf).filter((s): s is Strike => s !== null);

/**
 * Every round this monster could choose to throw, each as a whole round.
 *
 * A Multiattack is one option and is taken entire - a dragon does not bite
 * without clawing. Without one, each single attack is its own option, because
 * a goblin picking between its scimitar and its shortbow is choosing, and a
 * planner that was handed only the first action in the list would march every
 * archer into melee.
 */
export const routineOptions = (monster: Monster): Strike[][] => {
  const routine = routineFor(monster);
  return routine.length ? [routine] : singleStrikes(monster).map((s) => [s]);
};

/**
 * How close a whole round needs you to be, in feet: the *shortest* reach in
 * it, because a dragon whose bite reaches 10 and whose claws reach 5 has to
 * stand at 5 to use the round it actually has.
 */
export const routineReach = (routine: Strike[]): number =>
  routine.length ? Math.min(...routine.map(preferredReach)) : 0;
