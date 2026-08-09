import { describe, expect, it } from 'vitest';
import type { Build, ClassId } from '../types';
import { CASTING_TIME_LABELS, SPELLS, SPELLS_BY_ID, spellsFor } from '../data/spells';
import { CLASSES } from '../data/classes';
import { deriveBuild, emptyBuild } from './character';
import { computeSlots, dcForSpell, reconcileSpells, sourceForSpell } from './spellcasting';
import { analyze } from './analyze';
import { recommendSpells } from './spellRecommend';

function build(overrides: Partial<Build> = {}): Build {
  return {
    ...emptyBuild(),
    raceId: 'human',
    baseScores: { str: 10, dex: 14, con: 14, int: 16, wis: 14, cha: 16 },
    ...overrides,
  };
}

const cast = (b: Build) => deriveBuild(b).spellcasting;
const slotsOf = (b: Build) => cast(b).bySpellLevel;

describe('the spell list', () => {
  it('has unique ids, and each id matches its name', () => {
    const ids = SPELLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const spell of SPELLS) {
      // Apostrophes vanish rather than becoming separators, so "Hunter's Mark"
      // slugs to "hunters-mark".
      const slug = spell.name
        .toLowerCase()
        .replace(/'/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      // The id may be shortened, but must be a prefix of the slug.
      expect(slug.startsWith(spell.id) || spell.id.startsWith(slug.slice(0, 10)), `${spell.id} vs ${spell.name}`).toBe(true);
    }
  });

  it('puts every spell on at least one real class list', () => {
    const known = new Set(CLASSES.map((c) => c.id));
    for (const spell of SPELLS) {
      expect(spell.classes.length, spell.name).toBeGreaterThan(0);
      for (const id of spell.classes) expect(known.has(id), `${spell.name}: ${id}`).toBe(true);
    }
  });

  /**
   * The Warlock list is short and curated, not "the arcane list". Reaching for
   * the shared ARCANE shorthand by reflex put thirteen spells in front of
   * Warlocks who cannot take any of them, so the ones that caught it are named.
   */
  it('keeps off the Warlock list the spells that are not on it', () => {
    for (const id of ['acid-splash', 'alter-self', 'dancing-lights', 'disguise-self',
                      'feather-fall', 'light', 'mage-armor', 'message', 'polymorph',
                      'see-invisibility', 'sleep', 'sleet-storm', 'teleport']) {
      expect(SPELLS_BY_ID[id].classes, id).not.toContain('warlock');
    }
    // And the ones that really are on it stayed.
    for (const id of ['eldritch-blast', 'hex', 'hellish-rebuke', 'mage-hand', 'minor-illusion']) {
      expect(SPELLS_BY_ID[id].classes, id).toContain('warlock');
    }
    // Imprisonment is Warlock and Wizard only - not Cleric, not Sorcerer.
    expect(SPELLS_BY_ID['imprisonment'].classes.sort()).toEqual(['warlock', 'wizard']);
  });

  /** Bard picks up three cantrips the app used to withhold. */
  it('gives the Bard the cantrips the Bard has', () => {
    for (const id of ['mage-hand', 'message', 'minor-illusion']) {
      expect(SPELLS_BY_ID[id].classes, id).toContain('bard');
    }
  });

  /**
   * Healing is Evocation right up until it is not: the three spells that
   * restore several creatures at once, or the dead, are Conjuration.
   */
  it('schools the healing spells the way the books do', () => {
    for (const id of ['cure-wounds', 'healing-word', 'heal']) {
      expect(SPELLS_BY_ID[id].school, id).toBe('evocation');
    }
    for (const id of ['mass-cure-wounds', 'mass-heal', 'revivify']) {
      expect(SPELLS_BY_ID[id].school, id).toBe('conjuration');
    }
  });

  /**
   * Everything slow used to collapse into `'long'`, captioned "1 hour or
   * more" - which could not tell you whether Find Familiar costs you an hour
   * or Hallow costs you a day. These are the four the flattening hid.
   */
  it('distinguishes the slow casting times instead of calling them all long', () => {
    expect(SPELLS_BY_ID['find-familiar'].castingTime).toBe('hour');
    expect(SPELLS_BY_ID['hallow'].castingTime).toBe('24-hours');
    expect(SPELLS_BY_ID['awaken'].castingTime).toBe('8-hours');
    expect(SPELLS_BY_ID['simulacrum'].castingTime).toBe('12-hours');
    // Ten-minute casts were being called a minute, which is a real difference
    // when the party is deciding whether there is time.
    expect(SPELLS_BY_ID['prayer-of-healing'].castingTime).toBe('10-minutes');
    expect(SPELLS_BY_ID['clairvoyance'].castingTime).toBe('10-minutes');

    // The three the engine reasons about are untouched.
    expect(SPELLS_BY_ID['fireball'].castingTime).toBe('action');
    expect(SPELLS_BY_ID['healing-word'].castingTime).toBe('bonus');
    expect(SPELLS_BY_ID['shield'].castingTime).toBe('reaction');
  });

  it('labels every casting time it can hold', () => {
    for (const spell of SPELLS) {
      expect(CASTING_TIME_LABELS[spell.castingTime], spell.name).toBeTruthy();
    }
  });

  it('keeps levels in range and marks cantrips as level 0', () => {
    for (const spell of SPELLS) {
      expect(spell.level, spell.name).toBeGreaterThanOrEqual(0);
      expect(spell.level, spell.name).toBeLessThanOrEqual(9);
    }
    expect(SPELLS_BY_ID['fire-bolt'].level).toBe(0);
    expect(SPELLS_BY_ID.fireball.level).toBe(3);
  });

  it('gives every damaging spell a dice expression and a type', () => {
    for (const spell of SPELLS) {
      if (!spell.damage) continue;
      expect(spell.damage.dice, spell.name).toMatch(/^\d+d\d+$/);
      expect(spell.damage.type, spell.name).toBeTruthy();
    }
  });

  /**
   * The list was thin at high levels once, which showed up as a Wizard 15
   * tabbing to 8th level and finding nothing there. These pin the shape of the
   * coverage so it cannot quietly regress again.
   */
  it('gives every full caster something at every spell level they reach', () => {
    const fullCasters: ClassId[] = ['bard', 'cleric', 'druid', 'sorcerer', 'wizard'];
    for (const id of fullCasters) {
      for (let level = 1; level <= 9; level++) {
        const at = SPELLS.filter((s) => s.classes.includes(id) && s.level === level);
        expect(at.length, `${id} at spell level ${level}`).toBeGreaterThan(0);
      }
      expect(SPELLS.filter((s) => s.classes.includes(id) && s.level === 0).length).toBeGreaterThan(0);
    }
  });

  it('keeps half and third casters inside their real ceiling', () => {
    // Paladins, Rangers and Artificers never cast above 5th level, so a spell
    // on their list above that would be unreachable.
    for (const id of ['paladin', 'ranger', 'artificer'] as ClassId[]) {
      const tooHigh = SPELLS.filter((s) => s.classes.includes(id) && s.level > 5);
      expect(tooHigh.map((s) => s.name), `${id} above 5th`).toEqual([]);
    }
    // And Paladins and Rangers get no cantrips at all.
    for (const id of ['paladin', 'ranger'] as ClassId[]) {
      expect(SPELLS.filter((s) => s.classes.includes(id) && s.level === 0)).toEqual([]);
    }
  });

  it('agrees with the Warlock ceiling, which is 5th for Pact Magic', () => {
    // Warlocks reach 6th to 9th only through Mystic Arcanum, one spell each,
    // so their list does carry them - but nothing below that should be missing.
    for (let level = 1; level <= 9; level++) {
      const at = SPELLS.filter((s) => s.classes.includes('warlock') && s.level === level);
      expect(at.length, `warlock at spell level ${level}`).toBeGreaterThan(0);
    }
  });

  it('filters a class list', () => {
    const wizard = spellsFor('wizard').map((s) => s.id);
    expect(wizard).toContain('fireball');
    expect(wizard).toContain('shield');
    expect(wizard).not.toContain('eldritch-blast');
    expect(wizard).not.toContain('spiritual-weapon');

    expect(spellsFor('warlock').map((s) => s.id)).toContain('eldritch-blast');
    expect(spellsFor('cleric').map((s) => s.id)).toContain('spirit-guardians');
  });
});

describe('spell slots', () => {
  it('matches the full caster table', () => {
    const wizard = (level: number) => slotsOf(build({ classes: [{ classId: 'wizard', level }] }));
    expect(wizard(1)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(wizard(3)).toEqual([4, 2, 0, 0, 0, 0, 0, 0, 0]);
    expect(wizard(5)).toEqual([4, 3, 2, 0, 0, 0, 0, 0, 0]);
    expect(wizard(9)).toEqual([4, 3, 3, 3, 1, 0, 0, 0, 0]);
    expect(wizard(20)).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
  });

  it('gives a Cleric 9 the 4/3/3/3/1 spread', () => {
    expect(slotsOf(build({ classes: [{ classId: 'cleric', level: 9 }] }))).toEqual([
      4, 3, 3, 3, 1, 0, 0, 0, 0,
    ]);
  });

  it('halves a half caster, and gives them nothing at level 1', () => {
    const paladin = (level: number) => slotsOf(build({ classes: [{ classId: 'paladin', level }] }));
    // Paladins and Rangers do not cast at all until 2nd level.
    expect(paladin(1)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(paladin(2)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
    // Paladin 10 casts as a 5th-level caster.
    expect(paladin(10)).toEqual([4, 3, 2, 0, 0, 0, 0, 0, 0]);
  });

  it('keeps Pact Magic separate from everything else', () => {
    const warlock = cast(build({ classes: [{ classId: 'warlock', level: 5, subclassId: 'fiend' }] }));
    // A pure Warlock has no ordinary slots at all.
    expect(warlock.bySpellLevel).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(warlock.pact).toEqual({ count: 2, level: 3 });
    expect(warlock.highestLevel).toBe(3);
  });

  it('does not merge pact slots into a multiclass pool', () => {
    const both = cast(
      build({
        classes: [
          { classId: 'warlock', level: 5, subclassId: 'fiend' },
          { classId: 'sorcerer', level: 5 },
        ],
      }),
    );
    // The Sorcerer 5 alone sets the ordinary slots; the Warlock adds none.
    expect(both.casterLevel).toBe(5);
    expect(both.bySpellLevel).toEqual([4, 3, 2, 0, 0, 0, 0, 0, 0]);
    expect(both.pact).toEqual({ count: 2, level: 3 });
  });

  it('adds multiclass caster levels by contribution, not by class level', () => {
    // The rule people get wrong: Paladin 6 / Sorcerer 6 casts as a 9th-level
    // caster, because the Paladin's half rounds down to 3.
    const mixed = cast(
      build({
        classes: [
          { classId: 'paladin', level: 6, subclassId: 'devotion' },
          { classId: 'sorcerer', level: 6 },
        ],
      }),
    );
    expect(mixed.casterLevel).toBe(9);
    expect(mixed.bySpellLevel).toEqual([4, 3, 3, 3, 1, 0, 0, 0, 0]);

    // A Fighter 1 / Wizard 1 casts as a 1st-level caster, not a 2nd.
    const dip = cast(
      build({ classes: [{ classId: 'fighter', level: 1 }, { classId: 'wizard', level: 1 }] }),
    );
    expect(dip.casterLevel).toBe(1);
    expect(dip.bySpellLevel).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('gives a non-caster nothing', () => {
    const barbarian = cast(build({ classes: [{ classId: 'barbarian', level: 10 }] }));
    expect(barbarian.casts).toBe(false);
    expect(barbarian.highestLevel).toBe(0);
    expect(barbarian.saveDc).toBeNull();
  });
});

describe('spells known and prepared', () => {
  it('has a Wizard prepare Intelligence plus level', () => {
    // INT 16 is +3, so a Wizard 5 prepares 8.
    expect(cast(build({ classes: [{ classId: 'wizard', level: 5 }] })).spellsPrepared).toBe(8);
    expect(cast(build({ classes: [{ classId: 'wizard', level: 10 }] })).spellsPrepared).toBe(13);
  });

  it('has a Sorcerer know a fixed number', () => {
    expect(cast(build({ classes: [{ classId: 'sorcerer', level: 1 }] })).spellsKnown).toBe(2);
    expect(cast(build({ classes: [{ classId: 'sorcerer', level: 5 }] })).spellsKnown).toBe(6);
    expect(cast(build({ classes: [{ classId: 'sorcerer', level: 20 }] })).spellsKnown).toBe(15);
  });

  it('prepares off half a level for a half caster', () => {
    // Paladin 10 with CHA 16 (+3) prepares 3 + 5 = 8.
    expect(cast(build({ classes: [{ classId: 'paladin', level: 10, subclassId: 'devotion' }] })).spellsPrepared).toBe(8);
  });

  it('counts cantrips off the class table', () => {
    expect(cast(build({ classes: [{ classId: 'wizard', level: 1 }] })).cantripsKnown).toBe(3);
    expect(cast(build({ classes: [{ classId: 'wizard', level: 10 }] })).cantripsKnown).toBe(5);
    expect(cast(build({ classes: [{ classId: 'sorcerer', level: 1 }] })).cantripsKnown).toBe(4);
    // A Paladin has none.
    expect(cast(build({ classes: [{ classId: 'paladin', level: 10, subclassId: 'devotion' }] })).cantripsKnown).toBe(0);
  });

  it('counts open picks against what has been chosen', () => {
    const empty = cast(build({ classes: [{ classId: 'sorcerer', level: 5 }] }));
    expect(empty.openSpells).toBe(6);

    const partial = cast(
      build({ classes: [{ classId: 'sorcerer', level: 5 }], spellIds: ['shield', 'fireball'] }),
    );
    expect(partial.openSpells).toBe(4);
  });
});

describe('which spells a character can draw from', () => {
  it('offers only spells on their list and within their slots', () => {
    const wizard = cast(build({ classes: [{ classId: 'wizard', level: 5 }] }));
    const ids = wizard.available.map((s) => s.id);
    expect(ids).toContain('fireball'); // 3rd level, and they have 3rd-level slots
    expect(ids).not.toContain('wall-of-force'); // 5th level, out of reach
    expect(ids).not.toContain('spirit-guardians'); // Cleric list
  });

  it('widens as the character levels', () => {
    const at = (level: number) =>
      cast(build({ classes: [{ classId: 'wizard', level }] })).available.length;
    expect(at(9)).toBeGreaterThan(at(5));
    expect(at(5)).toBeGreaterThan(at(1));
  });

  it('flags a chosen spell that is off every accessible list', () => {
    const b = build({
      classes: [{ classId: 'wizard', level: 5 }],
      spellIds: ['fireball', 'spirit-guardians'],
    });
    const result = cast(b);
    expect(result.illegal.map((s) => s.id)).toEqual(['spirit-guardians']);

    const reconciled = reconcileSpells(b, result);
    expect(reconciled.build.spellIds).toEqual(['fireball']);
    expect(reconciled.changes.join(' ')).toContain('Spirit Guardians');
  });

  it('says nothing when every spell is legal', () => {
    const b = build({ classes: [{ classId: 'wizard', level: 5 }], spellIds: ['fireball'] });
    expect(reconcileSpells(b, cast(b)).changes).toEqual([]);
  });
});

describe('save DC and attack bonus', () => {
  it('is 8 + proficiency + the casting ability', () => {
    // Wizard 5: proficiency +3, INT 16 is +3.
    const wizard = cast(build({ classes: [{ classId: 'wizard', level: 5 }] }));
    expect(wizard.saveDc).toBe(14);
    expect(wizard.attackBonus).toBe(6);
    expect(wizard.ability).toBe('int');
  });

  it('follows a subclass that changes the casting ability', () => {
    const knight = cast(
      build({ classes: [{ classId: 'fighter', level: 6, subclassId: 'eldritch-knight' }] }),
    );
    // Eldritch Knight casts on Intelligence.
    expect(knight.casts).toBe(true);
    expect(knight.ability).toBe('int');
  });

  it('gives a single-class caster exactly one source', () => {
    const wizard = cast(build({ classes: [{ classId: 'wizard', level: 5 }] }));
    expect(wizard.sources).toEqual([
      { classId: 'wizard', className: 'Wizard', ability: 'int', saveDc: 14, attackBonus: 6 },
    ]);
  });

  /**
   * The defect this replaced: one save DC per character, taken from whichever
   * class happened to be listed first. A Cleric/Wizard has two, and printing
   * one of them was wrong by three points for half of what they can cast.
   */
  it('gives a caster with two casting abilities two of everything', () => {
    const mixed = cast(
      build({
        classes: [
          { classId: 'cleric', level: 5, subclassId: 'life' },
          { classId: 'wizard', level: 5, subclassId: 'evocation' },
        ],
        baseScores: { str: 10, dex: 12, con: 14, int: 20, wis: 14, cha: 8 },
      }),
    );
    // Proficiency +4 at character level 10; WIS 14 is +2, INT 20 is +5.
    expect(mixed.sources).toEqual([
      { classId: 'cleric', className: 'Cleric', ability: 'wis', saveDc: 14, attackBonus: 6 },
      { classId: 'wizard', className: 'Wizard', ability: 'int', saveDc: 17, attackBonus: 9 },
    ]);
    // The headline number is the best of them, not the first.
    expect(mixed.saveDc).toBe(17);
    expect(mixed.ability).toBe('int');
  });

  it('collapses to one source when both classes cast off the same ability', () => {
    const gish = cast(
      build({
        classes: [
          { classId: 'paladin', level: 6 },
          { classId: 'sorcerer', level: 6 },
        ],
        baseScores: { str: 14, dex: 10, con: 14, int: 8, wis: 10, cha: 18 },
      }),
    );
    expect(gish.sources.map((s) => s.ability)).toEqual(['cha', 'cha']);
    // Two entries, one answer - so nothing on the sheet reads as a choice.
    expect(new Set(gish.sources.map((s) => s.saveDc)).size).toBe(1);
  });
});

/**
 * `assumedSources` is what the sheet's disclosure note hangs on, so it has to
 * be true only where a number really was guessed at.
 */
describe('whether the sheet is assuming which class taught a spell', () => {
  const clericWizard = (extra: Partial<Build> = {}) =>
    cast(
      build({
        classes: [
          { classId: 'cleric', level: 5, subclassId: 'life' },
          { classId: 'wizard', level: 5, subclassId: 'evocation' },
        ],
        baseScores: { str: 10, dex: 12, con: 14, int: 20, wis: 14, cha: 8 },
        ...extra,
      }),
    );

  it('is false for a single-class caster', () => {
    expect(cast(build({ classes: [{ classId: 'wizard', level: 5 }], spellIds: ['fireball'] })).assumedSources)
      .toBe(false);
  });

  it('is false when only one of the classes could have taught the spell', () => {
    // Fireball is the Wizard's and Cure Wounds the Cleric's; neither is a choice.
    expect(clericWizard({ spellIds: ['fireball', 'cure-wounds'] }).assumedSources).toBe(false);
  });

  it('is true for a spell on both lists with nothing recorded', () => {
    // Detect Magic is on both, so its DC was picked rather than known.
    expect(SPELLS_BY_ID['detect-magic'].classes).toEqual(
      expect.arrayContaining(['cleric', 'wizard']),
    );
    expect(clericWizard({ spellIds: ['detect-magic'] }).assumedSources).toBe(true);
  });

  it('goes quiet once that spell is attributed', () => {
    const attributed = clericWizard({
      spellIds: ['detect-magic'],
      spellSources: { 'detect-magic': 'cleric' },
    });
    expect(attributed.assumedSources).toBe(false);
  });
});

/**
 * 2024 replaced "spells known" and "Wisdom + level" with one printed column
 * per class. The app applied the 2014 rules under both rulesets, which was
 * wrong for seven of the eight casters.
 */
describe('how many spells a 2024 caster prepares', () => {
  const at = (classId: ClassId, level: number, ruleset: Build['ruleset'], scores?: Build['baseScores']) =>
    cast(
      build({
        ruleset,
        raceId: ruleset === '2024' ? 'human-2024' : 'human',
        classes: [{ classId, level }],
        ...(scores ? { baseScores: scores } : {}),
      }),
    );

  it('reads the printed column rather than a formula', () => {
    // SRD 5.2: a Sorcerer 5 prepares 9. The 2014 table said they knew 6.
    expect(at('sorcerer', 5, '2024').spellsPrepared).toBe(9);
    expect(at('sorcerer', 5, '2014').spellsKnown).toBe(6);
    // A Ranger 5 prepares 6 where they knew 4.
    expect(at('ranger', 5, '2024').spellsPrepared).toBe(6);
    expect(at('ranger', 5, '2014').spellsKnown).toBe(4);
  });

  it('stops consulting the ability score, which cuts both ways', () => {
    const scores = { str: 10, dex: 10, con: 10, int: 8, wis: 20, cha: 8 } as const;
    // 2014: Wisdom +5 plus 5 levels is 10. 2024: the column says 9 regardless.
    expect(at('cleric', 5, '2014', scores).spellsPrepared).toBe(10);
    expect(at('cleric', 5, '2024', scores).spellsPrepared).toBe(9);
    const dumped = { str: 10, dex: 10, con: 10, int: 8, wis: 8, cha: 8 } as const;
    expect(at('cleric', 5, '2014', dumped).spellsPrepared).toBe(4);
    expect(at('cleric', 5, '2024', dumped).spellsPrepared).toBe(9);
  });

  it('turns every 2024 caster into a preparer', () => {
    for (const classId of ['bard', 'sorcerer', 'ranger', 'warlock'] as ClassId[]) {
      const result = at(classId, 5, '2024');
      expect(result.spellsKnown, `${classId} should no longer "know"`).toBeNull();
      expect(result.spellsPrepared, `${classId} prepares`).toBeGreaterThan(0);
    }
  });

  /** The one column 2024 left alone, which is worth pinning as deliberate. */
  it('leaves the Warlock where they were', () => {
    for (const level of [1, 5, 11, 20]) {
      expect(at('warlock', level, '2024').spellsPrepared).toBe(at('warlock', level, '2014').spellsKnown);
    }
  });

  it('leaves the cantrip count alone, because that table did not change', () => {
    for (const classId of ['bard', 'cleric', 'sorcerer', 'wizard'] as ClassId[]) {
      expect(at(classId, 7, '2024').cantripsKnown).toBe(at(classId, 7, '2014').cantripsKnown);
    }
  });
});

describe('which DC a particular spell is cast at', () => {
  const sources = [
    { classId: 'cleric' as const, className: 'Cleric', ability: 'wis' as const, saveDc: 14, attackBonus: 6 },
    { classId: 'wizard' as const, className: 'Wizard', ability: 'int' as const, saveDc: 17, attackBonus: 9 },
  ];

  it('uses the class whose list actually carries the spell', () => {
    // Fireball is a Wizard spell and no Cleric's.
    expect(dcForSpell(SPELLS_BY_ID['fireball'], sources)).toBe(17);
    // Cure Wounds is on the Cleric list and not the Wizard's.
    expect(dcForSpell(SPELLS_BY_ID['cure-wounds'], sources)).toBe(14);
  });

  /**
   * Strict RAW is the class you learned it through. Where that is not recorded
   * the favourable reading is taken, and the sheet says so.
   */
  it('takes the better of them when a spell is on both lists', () => {
    expect(SPELLS_BY_ID['bless'].classes).toContain('cleric');
    expect(dcForSpell(SPELLS_BY_ID['fireball'], sources)).toBe(17);
    const onBoth = SPELLS.find(
      (s) => s.classes.includes('cleric') && s.classes.includes('wizard'),
    )!;
    expect(dcForSpell(onBoth, sources)).toBe(17);
  });

  it('honours the recorded class even when it is the worse one', () => {
    const onBoth = SPELLS.find(
      (s) => s.classes.includes('cleric') && s.classes.includes('wizard'),
    )!;
    // Learned as a Cleric, so it is cast at the Cleric's 14 - not the 17 the
    // favourable reading would have handed over.
    expect(dcForSpell(onBoth, sources, 'cleric')).toBe(14);
    expect(sourceForSpell(onBoth, sources, 'cleric').assumed).toBe(false);
    expect(sourceForSpell(onBoth, sources).assumed).toBe(true);
  });

  it('ignores a recorded class that could not have taught the spell', () => {
    // Fireball is no Cleric's, however the build has it recorded, so the one
    // class that can actually cast it wins rather than a stale pick.
    expect(dcForSpell(SPELLS_BY_ID['fireball'], sources, 'cleric')).toBe(17);
    expect(sourceForSpell(SPELLS_BY_ID['fireball'], sources, 'cleric').assumed).toBe(false);
  });

  it('falls back to the best when nothing claims the spell', () => {
    // An illegal pick still has to print something, and the best is what the
    // sheet showed for everything before sources existed.
    const druidOnly = SPELLS.find(
      (s) => s.classes.length === 1 && s.classes[0] === 'druid',
    )!;
    expect(dcForSpell(druidOnly, sources)).toBe(17);
    expect(dcForSpell(druidOnly, [])).toBeNull();
  });
});

describe('the slot maths in isolation', () => {
  it('computes a caster level from slices directly', () => {
    const slice = (classId: Build['classes'][0]['classId'], level: number) => ({
      entry: { classId, level },
      klass: CLASSES.find((c) => c.id === classId)!,
      subclass: undefined,
    });
    expect(computeSlots([slice('wizard', 7)]).casterLevel).toBe(7);
    /*
      A single-class half caster reads their own table, which rounds *up*: the
      SRD 5.1 Ranger has four 1st-level slots and three 2nd at 7th level, and
      that is a 4th-level caster. This expectation used to say 3, which was the
      multiclass formula applied to a character who is not multiclassed - and
      it cost a single-class Paladin or Ranger a slot at every odd level, a
      whole spell level from 5th on.
    */
    expect(computeSlots([slice('ranger', 7)]).casterLevel).toBe(4);
    expect(computeSlots([slice('ranger', 5)]).bySpellLevel.slice(0, 3)).toEqual([4, 2, 0]);
    // And the multiclass rule still rounds down, because that is its own rule.
    expect(computeSlots([slice('wizard', 3), slice('ranger', 4)]).casterLevel).toBe(5);
    expect(computeSlots([slice('wizard', 1), slice('ranger', 7)]).casterLevel).toBe(4);
  });

  /**
   * Every level of the SRD 5.1 Paladin and Ranger tables, which is what
   * `soleCasterLevel` claims to reproduce. Written out rather than derived, so
   * a change to the rule has to disagree with the book rather than with itself.
   */
  it('matches the printed half-caster progression at every level', () => {
    const printed: [number, number[]][] = [
      [1, [0, 0, 0, 0, 0]],
      [2, [2, 0, 0, 0, 0]],
      [3, [3, 0, 0, 0, 0]],
      [4, [3, 0, 0, 0, 0]],
      [5, [4, 2, 0, 0, 0]],
      [6, [4, 2, 0, 0, 0]],
      [7, [4, 3, 0, 0, 0]],
      [8, [4, 3, 0, 0, 0]],
      [9, [4, 3, 2, 0, 0]],
      [10, [4, 3, 2, 0, 0]],
      [11, [4, 3, 3, 0, 0]],
      [13, [4, 3, 3, 1, 0]],
      [15, [4, 3, 3, 2, 0]],
      [17, [4, 3, 3, 3, 1]],
      [19, [4, 3, 3, 3, 2]],
      [20, [4, 3, 3, 3, 2]],
    ];
    for (const [level, slots] of printed) {
      const got = computeSlots([
        { entry: { classId: 'paladin', level }, klass: CLASSES.find((c) => c.id === 'paladin')!, subclass: undefined },
      ]).bySpellLevel.slice(0, 5);
      expect(got, `Paladin ${level}`).toEqual(slots);
    }
  });

  /** 2024 moved a Paladin and Ranger's first slots from 2nd level to 1st. */
  it('gives a 2024 half caster slots at first level, and 2014 none', () => {
    const ranger = (level: number) => [
      { entry: { classId: 'ranger' as const, level }, klass: CLASSES.find((c) => c.id === 'ranger')!, subclass: undefined },
    ];
    expect(computeSlots(ranger(1), '2014').bySpellLevel[0]).toBe(0);
    expect(computeSlots(ranger(1), '2024').bySpellLevel[0]).toBe(2);
    // From 2nd level the two editions agree again.
    expect(computeSlots(ranger(2), '2024').bySpellLevel).toEqual(computeSlots(ranger(2), '2014').bySpellLevel);
  });
});

/**
 * A spell that is off every list this character can draw from is reported by
 * `illegal`, but it has no card in the Spells panel - the tabs are built from
 * what you *can* cast. So the finding used to tell you to remove something the
 * UI gave you no way to remove. Reconciliation on a class change is the fix,
 * and the panel renders the leftovers as a fallback.
 */
describe('orphaned spells', () => {
  it('drops a spell when the class that granted it is gone', () => {
    const wizard = build({ classes: [{ classId: 'wizard', level: 5 }], spellIds: ['fireball'] });
    expect(cast(wizard).illegal).toEqual([]);

    const fighter = { ...wizard, classes: [{ classId: 'fighter' as const, level: 5 }] };
    const result = cast(fighter);
    expect(result.illegal.map((s) => s.name)).toEqual(['Fireball']);

    const { build: cleaned, changes } = reconcileSpells(fighter, result);
    expect(cleaned.spellIds).toEqual([]);
    expect(changes[0]).toContain('Fireball');
  });

  it('drops a spell that has risen above the highest slot', () => {
    const high = build({ classes: [{ classId: 'wizard', level: 9 }], spellIds: ['fireball'] });
    expect(cast(high).illegal).toEqual([]);

    // Dropping to level 1 puts Fireball out of reach.
    const low = { ...high, classes: [{ classId: 'wizard' as const, level: 1 }] };
    const { build: cleaned } = reconcileSpells(low, cast(low));
    expect(cleaned.spellIds).toEqual([]);
  });

  it('keeps everything still legal when only one spell is orphaned', () => {
    const b = build({
      classes: [{ classId: 'wizard', level: 9 }],
      spellIds: ['fire-bolt', 'fireball', 'cure-wounds'],
    });
    // Cure Wounds is not on the Wizard list.
    const { build: cleaned } = reconcileSpells(b, cast(b));
    expect(cleaned.spellIds).toEqual(['fire-bolt', 'fireball']);
  });
});

describe('the orphaned-spell finding', () => {
  it('fires even for a character who no longer casts at all', () => {
    const fighter = build({
      classes: [{ classId: 'fighter', level: 5 }],
      spellIds: ['fireball'],
    });
    const titles = analyze(deriveBuild(fighter)).map((f) => f.title);
    expect(titles.some((t) => t.includes('not on a list this character can use'))).toBe(true);
  });

  it('says nothing when a caster has only legal spells', () => {
    const wizard = build({
      classes: [{ classId: 'wizard', level: 9 }],
      spellIds: ['fire-bolt', 'fireball'],
    });
    const titles = analyze(deriveBuild(wizard)).map((f) => f.title);
    expect(titles.some((t) => t.includes('not on a list'))).toBe(false);
  });
});

describe('known versus prepared', () => {
  const at = (classId: string, level: number, spellIds: string[], preparedIds: string[] = []) =>
    deriveBuild({
      ...emptyBuild(),
      classes: [{ classId: classId as never, level }],
      baseScores: { str: 8, dex: 14, con: 14, int: 16, wis: 16, cha: 16 },
      spellIds,
      preparedIds,
    }).spellcasting;

  /**
   * The distinction the app used to collapse into one list. A Sorcerer knows
   * eight spells and can cast all eight; a Wizard copies far more than that
   * into a book and decides each morning which of it is live.
   */
  it('treats a known caster’s whole list as castable', () => {
    const sorcerer = at('sorcerer', 5, ['fireball', 'shield', 'fire-bolt']);
    expect(sorcerer.preparesFromBook).toBe(false);
    expect(sorcerer.prepared).toEqual([]);
    expect(sorcerer.openPrepared).toBe(0);
    expect(sorcerer.spellsKnown).toBeGreaterThan(0);
  });

  it('separates a Wizard’s book from what is prepared today', () => {
    const book = ['fireball', 'shield', 'magic-missile', 'fire-bolt'];
    const wizard = at('wizard', 5, book, ['fireball']);

    expect(wizard.preparesFromBook).toBe(true);
    expect(wizard.prepared.map((s) => s.id)).toEqual(['fireball']);
    // The book has no ceiling, so nothing is "left to choose" for it.
    expect(wizard.openSpells).toBe(0);
    expect(wizard.openPrepared).toBe((wizard.spellsPrepared ?? 0) - 1);
  });

  /** Cantrips are always ready; preparing one is not a thing. */
  it('never counts a cantrip as prepared', () => {
    const wizard = at('wizard', 5, ['fire-bolt', 'fireball'], ['fire-bolt', 'fireball']);
    expect(wizard.prepared.map((s) => s.id)).toEqual(['fireball']);
  });

  /** A Cleric draws from the whole class list, so what they record is prepared. */
  it('leaves a whole-list preparer alone', () => {
    const cleric = at('cleric', 5, ['bless', 'cure-wounds']);
    expect(cleric.preparesFromBook).toBe(false);
    expect(cleric.openSpells).toBe((cleric.spellsPrepared ?? 0) - 2);
  });
});

/**
 * Spells a subclass hands over. The app has said "Free spells and recovered
 * slots" in the Circle of the Land note since subclasses landed, and rated
 * Life Domain and the Fiend on exactly this, without ever granting them.
 */
describe('spells a subclass grants', () => {
  const lifeCleric = (level: number, spellIds: string[] = []) =>
    cast(build({ classes: [{ classId: 'cleric', level, subclassId: 'life' }], spellIds }));

  it('hands them over at the level the subclass reaches them', () => {
    expect(lifeCleric(1).granted.map((s) => s.id)).toEqual(['bless', 'cure-wounds']);
    expect(lifeCleric(5).granted.map((s) => s.id)).toEqual([
      'bless', 'cure-wounds', 'lesser-restoration', 'spiritual-weapon', 'beacon-of-hope', 'revivify',
    ]);
    // Nothing from 7th yet at 6th.
    expect(lifeCleric(6).granted.map((s) => s.id)).not.toContain('death-ward');
  });

  it('costs none of the picks, which is the whole point of them', () => {
    const bare = cast(build({ classes: [{ classId: 'cleric', level: 5 }] }));
    const life = lifeCleric(5);
    expect(life.spellsPrepared).toBe(bare.spellsPrepared);
    expect(life.openSpells).toBe(bare.openSpells);
    // And they are castable all the same.
    expect(life.castable.map((s) => s.id)).toContain('spiritual-weapon');
  });

  it('does not list a spell twice when it was also picked', () => {
    const both = lifeCleric(5, ['bless']);
    expect(both.granted.map((s) => s.id)).not.toContain('bless');
    expect(both.castable.filter((s) => s.id === 'bless')).toHaveLength(1);
  });

  it('gives nothing to a subclass with no list, or to no subclass at all', () => {
    expect(cast(build({ classes: [{ classId: 'cleric', level: 5, subclassId: 'war' }] })).granted)
      .toEqual([]);
    expect(cast(build({ classes: [{ classId: 'cleric', level: 5 }] })).granted).toEqual([]);
  });

  it('covers the three SRD subclasses that have a list', () => {
    const paladin = cast(build({ classes: [{ classId: 'paladin', level: 5, subclassId: 'devotion' }] }));
    expect(paladin.granted.map((s) => s.id)).toEqual([
      'protection-from-evil', 'sanctuary', 'lesser-restoration', 'zone-of-truth',
    ]);
    const warlock = cast(build({ classes: [{ classId: 'warlock', level: 5, subclassId: 'fiend' }] }));
    expect(warlock.granted.map((s) => s.id)).toContain('fireball');
  });

  /**
   * 2024 revised every one of these lists and no licensed source carries the
   * revisions, so a 2024 character gets nothing rather than the 2014 table
   * under a 2024 label. Pinned because the tempting thing is to grant it
   * anyway and hope nobody checks.
   */
  it('grants nothing under 2024, where the lists are not sourced', () => {
    const in2024 = cast(
      build({
        ruleset: '2024',
        raceId: 'human-2024',
        classes: [{ classId: 'cleric', level: 5, subclassId: 'life' }],
      }),
    );
    expect(in2024.granted).toEqual([]);
  });
});

/**
 * The recommender must not point at a spell you already have for free. Caught
 * in the browser: a Life Cleric 5 was told the best spells they could reach
 * were Revivify and Spiritual Weapon, both of which the domain grants - and
 * taking either would then be flagged by the build review as a wasted pick.
 */
describe('recommending around what is already granted', () => {
  it('never offers a granted spell as a pick', () => {
    const ctx = deriveBuild(
      build({ classes: [{ classId: 'cleric', level: 5, subclassId: 'life' }] }),
    );
    const grantedIds = new Set(ctx.spellcasting.granted.map((s) => s.id));
    expect(grantedIds.has('revivify')).toBe(true);
    for (const suggestion of recommendSpells(ctx, 12)) {
      expect(grantedIds.has(suggestion.id), `${suggestion.spell.name} is granted`).toBe(false);
    }
  });

  it('still offers them to a subclass that grants nothing', () => {
    const war = deriveBuild(build({ classes: [{ classId: 'cleric', level: 5, subclassId: 'war' }] }));
    expect(recommendSpells(war, 12).map((s) => s.id)).toContain('revivify');
  });
});

/**
 * The Artificer, which is a half caster at everything except the two things
 * TCoE says it is not.
 *
 * Both of these were live bugs, found by walking the casting rules class by
 * class rather than by anyone reporting them. Sharing `castingType: 'half'`
 * with the Paladin and Ranger is right about the slot shape, the prepared
 * count and the multiclass pool - and wrong about exactly two rules, which
 * are now flags on the class rather than assumptions in the engine.
 */
describe('the Artificer, whose half-casting has two exceptions', () => {
  const art = (level: number, ruleset: Build['ruleset'] = '2014') =>
    cast(build({ ruleset, classes: [{ classId: 'artificer', level }] }));

  it('casts from 1st level, where a 2014 Paladin waits until 2nd', () => {
    /*
      The app gave a 1st-level Artificer two cantrips and no spell slots -
      internally inconsistent, and the inconsistency is what gave it away.
      Its own table prints two 1st-level slots at 1st level.
    */
    expect(art(1).bySpellLevel[0]).toBe(2);
    expect(art(1).cantripsKnown).toBe(2);
    // And the classes the late start belongs to still have it.
    expect(cast(build({ classes: [{ classId: 'paladin', level: 1 }] })).bySpellLevel[0]).toBe(0);
    expect(cast(build({ classes: [{ classId: 'ranger', level: 1 }] })).bySpellLevel[0]).toBe(0);
  });

  it('follows its own printed table the rest of the way up', () => {
    expect(art(2).bySpellLevel.slice(0, 3)).toEqual([2, 0, 0]);
    expect(art(3).bySpellLevel.slice(0, 3)).toEqual([3, 0, 0]);
    expect(art(5).bySpellLevel.slice(0, 3)).toEqual([4, 2, 0]);
    expect(art(9).bySpellLevel.slice(0, 3)).toEqual([4, 3, 2]);
  });

  it('rounds its multiclass contribution up, where every other half caster rounds down', () => {
    /*
      "Add half your levels (rounded up) in the artificer class." An Artificer
      3 / Wizard 3 is a 5th-level caster; the app made them a 4th, one whole
      spell level short, at every odd Artificer level.
    */
    const together = (a: ClassId, aLevel: number, b: ClassId, bLevel: number) =>
      cast(build({ classes: [{ classId: a, level: aLevel }, { classId: b, level: bLevel }] }))
        .casterLevel;

    expect(together('artificer', 3, 'wizard', 3)).toBe(5);
    expect(together('artificer', 5, 'wizard', 5)).toBe(8);
    expect(together('artificer', 1, 'wizard', 1)).toBe(2);
    // Even levels agree either way, which is why this hid for so long.
    expect(together('artificer', 4, 'wizard', 4)).toBe(6);

    // The Paladin is the control: it rounds down, and still does.
    expect(together('paladin', 3, 'wizard', 3)).toBe(4);
    expect(together('paladin', 5, 'wizard', 5)).toBe(7);
    // A Paladin 1 contributes nothing at all - the rule has no round-up and
    // no minimum, and floor(1/2) is zero either way.
    expect(together('paladin', 1, 'wizard', 5)).toBe(5);
  });

  it('reaches the slot the fix is worth: a real 3/3 gets 3rd-level spells', () => {
    // The point of the caster level is the row it reads. At 4 the character
    // has no 3rd-level slot; at 5 they do, and that is the whole bug.
    const ctx = deriveBuild(build({
      classes: [{ classId: 'artificer', level: 3 }, { classId: 'wizard', level: 3 }],
    }));
    expect(ctx.spellcasting.bySpellLevel[2]).toBeGreaterThan(0);
    expect(ctx.spellcasting.highestLevel).toBe(3);
  });
});
