import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyBuild } from './engine/character';
import { emptyPlay } from './play';
import {
  LEGACY_BUILD_KEY,
  ROSTER_KEY,
  activeBuild,
  addCharacter,
  duplicateCharacter,
  hydrateBuild,
  isPristine,
  loadRoster,
  removeCharacter,
  renameCharacter,
  saveRoster,
  updateActive,
} from './storage';
import type { Roster } from './storage';

/** vitest runs in node, so localStorage has to be stood up by hand. */
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage());
});

const named = (name: string) => ({ ...emptyBuild(), name });

function rosterOf(...names: string[]): Roster {
  return names.reduce((roster, name) => addCharacter(roster, named(name)), loadRoster());
}

describe('isPristine (§77)', () => {
  /*
    The roster is never empty by construction, so the hub's "start with a
    character" welcome needs a way to tell the untouched starter from a
    character somebody made. Blank name, first level, nothing picked.
  */
  const blank = () => ({
    ...emptyBuild(),
    name: '',
    classes: [{ classId: 'fighter' as const, level: 1 }],
    featIds: [],
    skillIds: [],
    spellIds: [],
  });

  it('is true for the untouched blank starter', () => {
    const roster = updateActive(loadRoster(), blank());
    expect(isPristine(roster)).toBe(true);
  });

  it('turns false the moment the character is named or levelled', () => {
    expect(isPristine(updateActive(loadRoster(), { ...blank(), name: 'Thistle' }))).toBe(false);
    expect(
      isPristine(
        updateActive(loadRoster(), { ...blank(), classes: [{ classId: 'fighter', level: 2 }] }),
      ),
    ).toBe(false);
  });

  it('is false once a second character exists', () => {
    const roster = addCharacter(updateActive(loadRoster(), blank()), blank());
    expect(isPristine(roster)).toBe(false);
  });

  it('is false for the example fighter, which is a loaded character', () => {
    expect(isPristine(updateActive(loadRoster(), named('Example Fighter')))).toBe(false);
  });
});

describe('loading a roster', () => {
  it('starts with one empty character when there is nothing saved', () => {
    const roster = loadRoster();
    expect(roster.entries).toHaveLength(1);
    expect(roster.activeId).toBe(roster.entries[0].id);
  });

  /**
   * The app kept a single build for six phases. Upgrading must not look like
   * losing your character, so the old key is adopted rather than ignored.
   */
  it('adopts the single build the app used to keep', () => {
    localStorage.setItem(LEGACY_BUILD_KEY, JSON.stringify(named('Thistle')));
    const roster = loadRoster();
    expect(roster.entries).toHaveLength(1);
    expect(activeBuild(roster).name).toBe('Thistle');
  });

  it('leaves the old key alone, so an older deployment still finds it', () => {
    localStorage.setItem(LEGACY_BUILD_KEY, JSON.stringify(named('Thistle')));
    saveRoster(loadRoster());
    expect(localStorage.getItem(LEGACY_BUILD_KEY)).not.toBeNull();
  });

  it('prefers a real roster over the legacy key', () => {
    localStorage.setItem(LEGACY_BUILD_KEY, JSON.stringify(named('Old')));
    saveRoster({ entries: [{ id: 'n', build: named('New'), updatedAt: 1, play: emptyPlay() }], activeId: 'n' });

    const names = loadRoster().entries.map((e) => e.build.name);
    expect(names).toEqual(['New']);
  });

  it('survives corrupt storage rather than refusing to load', () => {
    localStorage.setItem(ROSTER_KEY, '{not json at all');
    expect(loadRoster().entries).toHaveLength(1);
  });

  it('drops entries that are not builds but keeps the ones that are', () => {
    localStorage.setItem(
      ROSTER_KEY,
      JSON.stringify({
        activeId: 'a',
        entries: [
          { id: 'a', build: named('Real'), updatedAt: 1 },
          { id: 'b', build: { nonsense: true }, updatedAt: 2 },
        ],
      }),
    );
    const roster = loadRoster();
    expect(roster.entries).toHaveLength(1);
    expect(roster.entries[0].build.name).toBe('Real');
  });

  it('repairs an activeId pointing at a character that is gone', () => {
    localStorage.setItem(
      ROSTER_KEY,
      JSON.stringify({ activeId: 'missing', entries: [{ id: 'a', build: named('Real'), updatedAt: 1 }] }),
    );
    const roster = loadRoster();
    expect(roster.activeId).toBe('a');
    expect(activeBuild(roster).name).toBe('Real');
  });

  it('round-trips through save and load', () => {
    saveRoster(rosterOf('One', 'Two'));
    const names = loadRoster().entries.map((e) => e.build.name);
    // The first entry is the empty character the roster starts life with.
    expect(names).toEqual(['New Character', 'One', 'Two']);
  });
});

describe('editing the roster', () => {
  it('writes an edit through to the active character only', () => {
    let roster = rosterOf('One', 'Two');
    const firstId = roster.entries[0].id;
    roster = { ...roster, activeId: firstId };
    roster = updateActive(roster, named('Renamed'));

    expect(roster.entries[0].build.name).toBe('Renamed');
    expect(roster.entries[1].build.name).toBe('One');
  });

  it('makes a new character active so you are editing what you just made', () => {
    const roster = addCharacter(loadRoster(), named('Fresh'));
    expect(activeBuild(roster).name).toBe('Fresh');
  });

  describe('duplicate', () => {
    it('copies the build and makes the copy active', () => {
      let roster = rosterOf('Thistle');
      const source = roster.entries.find((e) => e.build.name === 'Thistle')!;
      roster = duplicateCharacter(roster, source.id);

      expect(activeBuild(roster).name).toBe('Thistle (copy)');
      // The original is untouched, which is the whole point of the feature.
      expect(roster.entries.some((e) => e.build.name === 'Thistle')).toBe(true);
    });

    it('numbers further copies rather than repeating a name', () => {
      let roster = rosterOf('Thistle');
      const id = roster.entries.find((e) => e.build.name === 'Thistle')!.id;
      roster = duplicateCharacter(roster, id);
      roster = duplicateCharacter(roster, id);

      const names = roster.entries.map((e) => e.build.name);
      expect(names).toContain('Thistle (copy)');
      expect(names).toContain('Thistle (copy 2)');
    });

    it('sits the copy next to its original', () => {
      let roster = rosterOf('One', 'Two');
      const id = roster.entries.find((e) => e.build.name === 'One')!.id;
      roster = duplicateCharacter(roster, id);
      const names = roster.entries.map((e) => e.build.name);
      expect(names.indexOf('One (copy)')).toBe(names.indexOf('One') + 1);
    });

    it('does nothing for an id that is not there', () => {
      const roster = rosterOf('One');
      expect(duplicateCharacter(roster, 'nope')).toBe(roster);
    });
  });

  describe('remove', () => {
    it('moves the active character when you delete the one you are editing', () => {
      let roster = rosterOf('One', 'Two');
      roster = removeCharacter(roster, roster.activeId);
      expect(roster.entries.some((e) => e.id === roster.activeId)).toBe(true);
    });

    it('leaves a fresh character rather than an empty roster', () => {
      let roster = loadRoster();
      roster = removeCharacter(roster, roster.activeId);
      expect(roster.entries).toHaveLength(1);
      expect(roster.activeId).toBe(roster.entries[0].id);
    });
  });

  it('renames without touching anything else about the build', () => {
    let roster = rosterOf('Before');
    const id = roster.entries.find((e) => e.build.name === 'Before')!.id;
    const before = roster.entries.find((e) => e.id === id)!.build;
    roster = renameCharacter(roster, id, 'After');
    const after = roster.entries.find((e) => e.id === id)!.build;

    expect(after.name).toBe('After');
    expect({ ...after, name: '' }).toEqual({ ...before, name: '' });
  });
});

describe('hydrateBuild', () => {
  it('refuses something that is not a build', () => {
    expect(hydrateBuild(null)).toBeNull();
    expect(hydrateBuild({ hello: 'world' })).toBeNull();
    expect(hydrateBuild({ baseScores: {}, classes: 'not an array' })).toBeNull();
  });

  /**
   * The one check here that rejects rather than repairs, and the reason is
   * severity: a build naming a class this app does not carry reached the
   * engine, threw while rendering, and - because the roster is read from
   * storage at start-up - white-screened the app on every load afterwards.
   * The only escape was clearing site data, which takes every character with
   * it. It arrives by share link from a build of the app carrying a class this
   * one does not, or the first time a class id is renamed.
   */
  it('drops a class it does not carry, and refuses a build left with none', () => {
    const scores = emptyBuild().baseScores;
    const mixed = hydrateBuild({
      baseScores: scores,
      classes: [{ classId: 'warlord', level: 3 }, { classId: 'fighter', level: 5 }],
    })!;
    expect(mixed.classes.map((c) => c.classId)).toEqual(['fighter']);

    expect(hydrateBuild({ baseScores: scores, classes: [{ classId: 'warlord', level: 3 }] })).toBeNull();
    expect(hydrateBuild({ baseScores: scores, classes: [{ level: 3 }] })).toBeNull();
  });

  it('fills in every group added after a build was saved', () => {
    const ancient = { baseScores: emptyBuild().baseScores, classes: [{ classId: 'fighter', level: 5 }] };
    const build = hydrateBuild(ancient)!;
    expect(build.ruleset).toBe('2014');
    expect(build.spellIds).toEqual([]);
    expect(build.toolIds).toEqual([]);
    expect(build.weapons).toBeDefined();
    expect(build.combatAssumptions.targets).toBe(1);
  });

  it('turns the old Defense checkbox into the class option it became', () => {
    const build = hydrateBuild({
      baseScores: emptyBuild().baseScores,
      classes: [{ classId: 'fighter', level: 5 }],
      defenses: { ...emptyBuild().defenses, defenseFightingStyle: true },
    })!;
    expect(build.classOptionIds).toEqual(['defense']);
  });
});

describe('the painted map', () => {
  it('keeps terrain and height across a reload, even with nobody in the fight', () => {
    /*
      A DM who spends an evening painting a battlefield and refreshes before
      adding anybody has an encounter with no combatants that is absolutely
      worth keeping - the old "no combatants, drop it" rule predates the map
      being editable.
    */
    const roster = loadRoster();
    saveRoster({
      ...roster,
      encounter: {
        combatants: [],
        turnIndex: -1,
        round: 0,
        nextSeq: 0,
        mapSeed: 'the sunken abbey',
        mapRooms: 12,
        mapSize: 'large',
        terrain: { '3,4': 'pillar', 'garbage': 'pillar' },
        elevation: { '5,5': 2, '6,6': 0 },
      },
    });

    const back = loadRoster();
    expect(back.encounter?.mapSeed).toBe('the sunken abbey');
    expect(back.encounter?.mapRooms).toBe(12);
    expect(back.encounter?.mapSize).toBe('large');
    // Validated square by square: the garbage key and the level nought are gone.
    expect(back.encounter?.terrain).toEqual({ '3,4': 'pillar' });
    expect(back.encounter?.elevation).toEqual({ '5,5': 2 });
  });
});
