import { describe, expect, it } from 'vitest';
import fixture from './srd/srd-2014-monsters.json';
import { formatCr, formatSpeed, initiativeMod, monsterMod, searchMonsters } from './monsters';
import type { Monster } from './monsters';
import { CONDITIONS } from './conditions';
import { parseNotation } from '../engine/dice';

/**
 * The bestiary.
 *
 * Every other data test in this project asks "has upstream drifted from our
 * table?", because the app keeps its own table and the fixture is the check.
 * Here there is no table: the fixture **is** what the app serves, distilled
 * from SRD 5.1 by the refresh script. So the question is a different one -
 * can the code that reads this actually read all of it?
 *
 * That matters more than it sounds. The dice engine parses a monster's damage
 * and its hit points straight out of these strings, and one stat block written
 * "2d6 + 3" instead of "2d6+3" would fail silently at the table, on that
 * monster, in the middle of somebody's fight.
 */

// Through `unknown` for the reason `loadMonsters` gives: the inferred literal
// type describes this snapshot, and `Monster` is the contract these tests are
// here to enforce.
const monsters = (fixture as unknown as { records: Monster[] }).records;
const byId = (id: string) => monsters.find((m) => m.id === id)!;

const everyAbility = monsters.flatMap((m) => [
  ...m.traits.map((a) => [m, a] as const),
  ...m.actions.map((a) => [m, a] as const),
  ...m.legendary.map((a) => [m, a] as const),
  ...m.reactions.map((a) => [m, a] as const),
]);

describe('what the fixture carries', () => {
  it('has the whole SRD 5.1 bestiary, with unique ids', () => {
    expect(monsters.length).toBe(334);
    expect(new Set(monsters.map((m) => m.id)).size).toBe(monsters.length);
  });

  it('says which SRD it came from', () => {
    // The 2024 endpoint serves three creatures, so there is no licensed
    // structured source for SRD 5.2's bestiary and the app has to say so
    // rather than show a 2024 table three monsters long.
    expect((fixture as { source: string }).source).toBe('dnd5eapi SRD 5.1');
  });

  it('gives every monster the numbers a stat block line needs', () => {
    for (const m of monsters) {
      expect(m.name, m.id).toBeTruthy();
      expect(m.ac, m.id).toBeGreaterThan(0);
      expect(m.hp, m.id).toBeGreaterThan(0);
      expect(m.xp, m.id).toBeGreaterThanOrEqual(0);
      expect(m.passivePerception, m.id).toBeGreaterThan(0);
      for (const score of Object.values(m.scores)) expect(score, m.id).toBeGreaterThan(0);
    }
  });

  it('keeps every speed as a number of feet', () => {
    // The map measures against these. One left as "50 ft." would be a string
    // where arithmetic is expected, and `hover` is a boolean the source files
    // among the speeds - a will-o'-wisp is `{walk: 0, fly: 50, hover: true}`.
    for (const m of monsters) {
      for (const [kind, value] of Object.entries(m.speed)) {
        expect(typeof value, `${m.id} ${kind}`).toBe('number');
      }
      expect(typeof m.hover, m.id).toBe('boolean');
    }
    expect(byId('will-o-wisp').hover).toBe(true);
    expect(byId('will-o-wisp').speed.fly).toBe(50);
  });
});

describe('what the dice engine has to read', () => {
  it('parses every damage expression in the book', () => {
    const unparsed = everyAbility
      .flatMap(([m, a]) => (a.damage ?? []).map((d) => [m, a, d] as const))
      .filter(([, , d]) => !parseNotation(d.dice))
      .map(([m, a, d]) => `${m.id} · ${a.name} · ${d.dice}`);
    expect(unparsed).toEqual([]);
  });

  it('parses every hit point roll', () => {
    // "19d12+133" for an adult red dragon, so its hit points can be rolled
    // rather than taken as the printed average.
    const unparsed = monsters
      .filter((m) => !m.hpRoll || !parseNotation(m.hpRoll))
      .map((m) => `${m.id} · ${m.hpRoll}`);
    expect(unparsed).toEqual([]);
  });

  it('gives an attack a to-hit bonus', () => {
    const attack = byId('goblin').actions.find((a) => a.name === 'Scimitar')!;
    expect(attack.toHit).toBe(4);
    expect(attack.damage).toEqual([{ dice: '1d6+2', type: 'slashing' }]);
  });

  it('writes a recharge the way a stat block writes it', () => {
    // The source states this as `{type:'recharge on roll', min_value:5}`,
    // which reads as nothing at all until it is rewritten.
    const breath = byId('adult-red-dragon').actions.find((a) => a.name === 'Fire Breath')!;
    expect(breath.usage).toBe('Recharge 5-6');
    expect(breath.save).toMatchObject({ ability: 'dex', dc: 21 });

    const resistance = byId('adult-red-dragon').traits.find(
      (a) => a.name === 'Legendary Resistance',
    )!;
    expect(resistance.usage).toBe('3/Day');
  });

  it('never writes "Recharge 6-6"', () => {
    const usages = new Set(everyAbility.map(([, a]) => a.usage).filter(Boolean));
    expect([...usages].filter((u) => u!.includes('6-6'))).toEqual([]);
  });
});

describe('conditions a monster is immune to', () => {
  it('names conditions this app already knows, or exhaustion', () => {
    /*
      The one deliberate exception, and it is the app's own choice rather than
      a defect in the source: exhaustion is a six-level *track* here, not a
      condition, because each level keeps the ones below it and level 2 changes
      a number the app computes. `data/conditions.ts` says so at the top. So
      "immune to exhaustion" is a true statement about a monster and not a
      condition id, and it is allowed through by name rather than by silence.
    */
    const known = new Set([...CONDITIONS.map((c) => c.id), 'exhaustion']);
    const unknown = monsters.flatMap((m) =>
      m.conditionImmunities.filter((id) => !known.has(id)).map((id) => `${m.id}: ${id}`),
    );
    expect(unknown).toEqual([]);
  });
});

describe('reading a stat block', () => {
  it('writes the fractional challenge ratings as fractions', () => {
    // 1/8 on the page, 0.125 in the source. Nobody has ever said "this is a
    // CR nought point one two five encounter".
    expect(formatCr(0.125)).toBe('1/8');
    expect(formatCr(0.25)).toBe('1/4');
    expect(formatCr(0.5)).toBe('1/2');
    expect(formatCr(17)).toBe('17');
  });

  it('leads a speed with walking and marks a hover', () => {
    expect(formatSpeed(byId('adult-red-dragon'))).toBe('40 ft., climb 40 ft., fly 80 ft.');
    expect(formatSpeed(byId('will-o-wisp'))).toContain('fly 50 ft. (hover)');
  });

  it('takes initiative from Dexterity and nothing else', () => {
    // No SRD stat block carries an initiative bonus of its own, so inventing
    // somewhere for one to come from would be inventing a rule.
    expect(monsterMod(14)).toBe(2);
    expect(monsterMod(8)).toBe(-1);
    expect(initiativeMod(byId('goblin'))).toBe(2);
  });
});

describe('finding a monster', () => {
  it('narrows on every term rather than matching more', () => {
    const dragons = searchMonsters(monsters, 'dragon');
    const red = searchMonsters(monsters, 'red dragon');
    expect(dragons.length).toBeGreaterThan(red.length);
    expect(red.every((m) => /red/i.test(m.name))).toBe(true);
  });

  it('searches the creature type, not only the name', () => {
    // "undead" finds a wight, whose name does not contain the word.
    const undead = searchMonsters(monsters, 'undead');
    expect(undead.map((m) => m.id)).toContain('wight');
  });

  it('returns everything for an empty query', () => {
    expect(searchMonsters(monsters, '   ')).toHaveLength(monsters.length);
  });
});
