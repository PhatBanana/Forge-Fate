import { describe, expect, it } from 'vitest';
import fixture from './data/srd/srd-2014-monsters.json';
import type { Monster } from './data/monsters';
import { addCharacter, addMonster, emptyEncounter, toggleMonsterCondition } from './encounter';
import { activeEncounter, updateEncounter, updatePlay } from './storage';
import { deriveBuild } from './engine/character';
import { GRAPPLED } from './engine/grapple';
import {
  conditionsOf,
  defencesOf,
  exhaustionOf,
  grapplerOf,
  heldBy,
  passivePerceptionOf,
  reactionSpentOf,
  rulesetOf,
  sizeOf,
  skillBonusFor,
  sourcesOf,
  stanceOf,
} from './fightFacts';
import type { FightView } from './fightFacts';
import { fighter, rosterOf, wizard } from './test/factories';

/**
 * §110. Twelve questions the fight asks constantly, each answered from
 * whichever store owns the fact - and answerable now without mounting a
 * battle screen, which is the whole point of the first step of §9.
 */

const monsters = (fixture as unknown as { records: Monster[] }).records;
const byId = new Map(monsters.map((m) => [m.id, m]));
const goblin = () => byId.get('goblin')!;

const table = () => {
  const roster = rosterOf(fighter(), wizard());
  let enc = addCharacter(emptyEncounter(), 'c0', { initiative: 20 });
  enc = addCharacter(enc, 'c1', { initiative: 10 });
  enc = addMonster(enc, goblin(), { rng: () => 0.5 });
  return updateEncounter(roster, enc);
};

const viewOf = (roster: ReturnType<typeof table>): FightView => ({
  encounter: activeEncounter(roster),
  roster,
  monsterById: (id) => byId.get(id),
  buildOf: (rosterId) => {
    const entry = roster.entries.find((e) => e.id === rosterId);
    return entry ? deriveBuild(entry.build) : undefined;
  },
  ruleset: '2024',
});

const monsterOf = (v: FightView) => v.encounter.combatants.find((c) => c.kind === 'monster')!;
const charOf = (v: FightView, rosterId: string) =>
  v.encounter.combatants.find((c) => c.kind === 'character' && c.rosterId === rosterId)!;

describe('facts that come from two different stores', () => {
  it('reads conditions off the combatant for a monster and the play state for a character', () => {
    let roster = table();
    const v0 = viewOf(roster);
    expect(conditionsOf(v0, monsterOf(v0))).toEqual([]);

    // A monster's condition rides the combatant.
    roster = updateEncounter(roster, toggleMonsterCondition(activeEncounter(roster), monsterOf(v0).id, 'prone'));
    // A character's rides their sheet.
    const play = roster.entries[0].play;
    roster = updatePlay(roster, 'c0', { ...play, conditions: ['restrained'] });

    const v = viewOf(roster);
    expect(conditionsOf(v, monsterOf(v))).toContain('prone');
    expect(conditionsOf(v, charOf(v, 'c0'))).toEqual(['restrained']);
  });

  it('sizes a character off their species and a monster off its block', () => {
    const v = viewOf(table());
    expect(sizeOf(v, monsterOf(v))).toBe(goblin().size);
    // The factory fighter is a Medium species; the point is it is asked, not assumed.
    expect(sizeOf(v, charOf(v, 'c0'))).toBe(deriveBuild(fighter()).race.size);
  });

  it('exhausts only characters - a stat block has no track, so a monster reads rested', () => {
    let roster = table();
    roster = updatePlay(roster, 'c0', { ...roster.entries[0].play, exhaustion: 3 });
    const v = viewOf(roster);
    expect(exhaustionOf(v, charOf(v, 'c0'))).toBe(3);
    expect(exhaustionOf(v, monsterOf(v))).toBe(0);
  });

  it("§60: a monster is played under the table's edition, not a flat 2014", () => {
    const v = viewOf(table());
    expect(rulesetOf(v, monsterOf(v))).toBe('2024');
    // A character answers with their own build's edition.
    expect(rulesetOf(v, charOf(v, 'c0'))).toBe(fighter().ruleset);
  });

  it('gives a monster its resistances and a character none - theirs are derived', () => {
    const v = viewOf(table());
    const gob = defencesOf(v, monsterOf(v));
    expect(gob).toEqual({
      resist: goblin().resist,
      immune: goblin().immune,
      vulnerable: goblin().vulnerable,
    });
    expect(defencesOf(v, charOf(v, 'c0'))).toEqual({});
  });

  it('falls back honestly where a fact is missing', () => {
    const blind: FightView = { ...viewOf(table()), monsterById: () => undefined };
    const gob = monsterOf(blind);
    expect(sizeOf(blind, gob)).toBe('Medium');
    expect(passivePerceptionOf(blind, gob)).toBe(10);
    expect(skillBonusFor(blind, gob, 'stealth', 'dex')).toBe(0);
    expect(defencesOf(blind, gob)).toEqual({});
  });
});

describe('a grapple, read off the condition and its source', () => {
  it('names both ends without a store of its own', () => {
    let roster = table();
    const v0 = viewOf(roster);
    const gob = monsterOf(v0);
    const me = charOf(v0, 'c0');

    // The goblin holds the fighter: the condition, plus who caused it.
    roster = updatePlay(roster, 'c0', {
      ...roster.entries[0].play,
      conditions: [GRAPPLED],
      conditionSources: { [GRAPPLED]: gob.id },
    });
    const v = viewOf(roster);

    expect(sourcesOf(v, charOf(v, 'c0'))[GRAPPLED]).toBe(gob.id);
    expect(grapplerOf(v, charOf(v, 'c0'))?.id).toBe(gob.id);
    // And from the other end: who is the goblin holding?
    expect(heldBy(v, monsterOf(v))?.id).toBe(me.id);
    // Nobody has hold of the wizard.
    expect(grapplerOf(v, charOf(v, 'c1'))).toBeUndefined();
  });
});

describe('what a turn has spent', () => {
  it('reads stance and reaction from whichever store holds them', () => {
    let roster = table();
    const play = roster.entries[0].play;
    roster = updatePlay(roster, 'c0', {
      ...play,
      turn: { ...play.turn, stance: 'dodge', reaction: true },
    });
    const v = viewOf(roster);
    expect(stanceOf(v, charOf(v, 'c0'))).toBe('dodge');
    expect(reactionSpentOf(v, charOf(v, 'c0'))).toBe(true);
    // The goblin has spent nothing.
    expect(stanceOf(v, monsterOf(v))).toBeUndefined();
    expect(reactionSpentOf(v, monsterOf(v))).toBe(false);
  });
});
