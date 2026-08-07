// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import fixture from './data/srd/srd-2014-monsters.json';
import type { Monster } from './data/monsters';
import {
  CUSTOM_PREFIX,
  copyOf,
  hydrateMonster,
  isCustom,
  loadBestiary,
  mergeBestiary,
  proficiencyForCr,
  putMonster,
  removeMonster,
  saveBestiary,
  xpForCr,
} from './bestiary';

/**
 * Monsters you made.
 *
 * Two things are load-bearing here and neither announces itself when it breaks.
 *
 * The first is that a saved stat block is a *whole* one. It is read at
 * start-up, so a record missing a field the card renders would white-screen the
 * app on every load, and the way out would be clearing site data - which takes
 * the characters with it.
 *
 * The second is the XP table. A DM who raises a bandit to CR 3 and is still
 * told it is worth 200 XP has been handed a wrong number by this app rather
 * than by the books, and nothing would say so.
 */

const srd = (fixture as unknown as { records: Monster[] }).records;
const bandit = srd.find((m) => m.id === 'bandit')!;

beforeEach(() => localStorage.clear());

describe('experience by challenge rating', () => {
  it('agrees with all 334 SRD stat blocks', () => {
    /*
      The check that pays for the table.

      Every SRD block carries both numbers, so the fixture is 334 independent
      confirmations - and running this the first time found four carrying the
      row above's value: a Brass Dragon Wyrmling at CR 1 worth 100 XP, a Dretch
      and a Riding Horse at CR 1/4 worth 25, a Deep Gnome at CR 1/2 worth 50.
      The refresh script now takes XP from the rating rather than the record, so
      the same drift upstream is corrected rather than shipped.
    */
    const wrong = srd.filter((m) => m.cr > 0 && m.xp !== xpForCr(m.cr));
    expect(wrong.map((m) => `${m.name} CR ${m.cr}`)).toEqual([]);
  });

  it('leaves the one ambiguous row alone', () => {
    // CR 0 is worth 0 XP or 10 depending on whether the thing can fight, and
    // only the stat block knows which. An edit produces 10; the 2 blocks that
    // say 0 keep it.
    expect(xpForCr(0)).toBe(10);
    expect(srd.filter((m) => m.cr === 0 && m.xp === 0).length).toBe(2);
  });

  it('matches every stat block on proficiency bonus', () => {
    for (const m of srd) {
      if (m.proficiencyBonus === null) continue;
      expect(proficiencyForCr(m.cr), m.name).toBe(m.proficiencyBonus);
    }
  });
});

describe('what survives storage', () => {
  it('keeps a saved monster across a reload', () => {
    const mine = { ...copyOf(bandit, []), name: 'Harbour thug' };
    saveBestiary([mine]);
    expect(loadBestiary()).toEqual([mine]);
  });

  it('fills in every field a stat block renders, however little it was given', () => {
    // The whole point of hydrating: `MonsterCard` reads `senses`, `traits`,
    // `scores` and eleven more without checking, because this guarantees them.
    const thin = hydrateMonster({ name: 'A shape in the dark' })!;
    expect(thin.id.startsWith(CUSTOM_PREFIX)).toBe(true);
    expect(thin.scores).toEqual({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 });
    expect(thin.speed).toEqual({ walk: 30 });
    expect(thin.traits).toEqual([]);
    expect(thin.actions).toEqual([]);
    expect(thin.senses).toEqual({});
    expect(thin.xp).toBe(10);
  });

  it('refuses a record with no name rather than saving a blank row', () => {
    expect(hydrateMonster({ ac: 15 })).toBeNull();
    expect(hydrateMonster(null)).toBeNull();
    expect(hydrateMonster('goblin')).toBeNull();
  });

  it('drops the unusable rows and keeps the rest', () => {
    localStorage.setItem(
      'dnd-forge:bestiary:v1',
      JSON.stringify({ monsters: [{ ac: 12 }, { name: 'Kept' }] }),
    );
    expect(loadBestiary().map((m) => m.name)).toEqual(['Kept']);
  });

  it('starts empty rather than throwing on corrupt storage', () => {
    localStorage.setItem('dnd-forge:bestiary:v1', 'not json');
    expect(loadBestiary()).toEqual([]);
  });
});

describe('the operations', () => {
  it('copies under a new id, named so the two are told apart', () => {
    const first = copyOf(bandit, []);
    expect(first.name).toBe('Bandit (copy)');
    expect(isCustom(first.id)).toBe(true);
    expect(isCustom(bandit.id)).toBe(false);

    const second = copyOf(bandit, [first]);
    expect(second.name).toBe('Bandit (copy 2)');
    expect(second.id).not.toBe(first.id);
  });

  it('does not stack "(copy)" onto a copy of a copy', () => {
    const once = copyOf(bandit, []);
    expect(copyOf(once, [once]).name).toBe('Bandit (copy 2)');
  });

  it('replaces in place rather than adding a second of the same id', () => {
    const mine = copyOf(bandit, []);
    const two = putMonster([mine, { ...bandit }], { ...mine, hp: 99 });
    expect(two).toHaveLength(2);
    expect(two[0].hp).toBe(99);
    expect(removeMonster(two, mine.id)).toHaveLength(1);
  });

  it('puts yours in front of the SRD without losing either', () => {
    const mine = copyOf(bandit, []);
    const merged = mergeBestiary([mine], srd);
    expect(merged[0]).toBe(mine);
    expect(merged).toHaveLength(srd.length + 1);
    // The original is still there: a copy is a new monster, not a replacement.
    expect(merged.filter((m) => m.id === bandit.id)).toHaveLength(1);
  });

  it('lets a saved block win over an SRD one of the same id', () => {
    // Belt and braces against the `custom:` prefix - if an id ever did collide,
    // one row is right and two rows are a mystery.
    const shadow = { ...bandit, name: 'Not the bandit' };
    expect(mergeBestiary([shadow], srd).filter((m) => m.id === bandit.id)).toEqual([shadow]);
  });
});
