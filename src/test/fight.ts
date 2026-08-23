import fixture from '../data/srd/srd-2014-monsters.json';
import type { Monster } from '../data/monsters';
import { activeEncounter } from '../storage';
import type { Roster } from '../storage';
import { deriveBuild } from '../engine/character';
import type { FightView } from '../fightFacts';
import type { Combatant } from '../encounter';
import type { Ruleset } from '../types';

/**
 * §125: the bench the fight modules are tested on.
 *
 * Six test files each carried their own copy of `viewOf`, and five of the
 * six carried `charOf` and `monsterOf` as well. They were byte-identical
 * apart from one string literal - the ruleset - which is the shape
 * duplication takes when nobody has anywhere to put the thing.
 *
 * It matters more than tidiness. `FightView` is the read-side seam every
 * one of those modules answers through (§110), and six hand-written copies
 * of how to build one are six chances for a test to be exercising a view
 * the app never actually constructs. There is one production caller. There
 * should be one test builder.
 *
 * What deliberately stayed local: each file's own `table()`. They look
 * alike and are not - one takes a fog flag, one takes an elevation map, and
 * they stand their combatants on different squares because different rules
 * need different geometry. A shared `table()` would have grown a parameter
 * per caller, which is the same duplication wearing a hat.
 */

const monsters = (fixture as unknown as { records: Monster[] }).records;

/** The SRD bestiary, by id - the same lookup `monsterById` answers from. */
export const monsterFixture = new Map(monsters.map((m) => [m.id, m]));

/** One monster off the shelf, by id. Throws rather than returning undefined:
    a fixture that has gone missing should fail loudly, not silently. */
export const fixtureMonster = (id: string): Monster => {
  const found = monsterFixture.get(id);
  if (!found) throw new Error(`no monster '${id}' in the SRD fixture`);
  return found;
};

/**
 * A fight view over this roster, built the way the battle screen builds it.
 *
 * The ruleset is the one thing that genuinely varied between the copies, so
 * it is the one parameter - defaulting to 2014, which is what five of the
 * six wanted.
 */
export const viewOf = (roster: Roster, ruleset: Ruleset = '2014'): FightView => ({
  encounter: activeEncounter(roster),
  roster,
  monsterById: (id) => monsterFixture.get(id),
  buildOf: (rosterId) => {
    const entry = roster.entries.find((e) => e.id === rosterId);
    return entry ? deriveBuild(entry.build) : undefined;
  },
  ruleset,
});

/** The combatant standing in for this roster character. */
export const charOf = (view: FightView, rosterId: string): Combatant =>
  view.encounter.combatants.find((c) => c.kind === 'character' && c.rosterId === rosterId)!;

/** The first monster on the board - the tests put one there. */
export const monsterOf = (view: FightView): Combatant =>
  view.encounter.combatants.find((c) => c.kind === 'monster')!;
