import type { Build, ClassId } from '../types';
import { deriveBuild, emptyBuild } from '../engine/character';
import type { BuildContext } from '../engine/character';
import { emptyPlay } from '../play';
import type { Roster } from '../storage';

/**
 * Builds and rosters for component tests.
 *
 * Component tests want a character that is *specific* - a Warlock with pact
 * slots, a Fighter with none - because most UI branches turn on exactly that.
 * Spelling one out inline every time buries the assertion, so they live here.
 */

export function buildOf(overrides: Partial<Build> = {}): Build {
  return {
    ...emptyBuild(),
    name: 'Test Character',
    raceId: 'human',
    ...overrides,
  };
}

export function ctxOf(overrides: Partial<Build> = {}): BuildContext {
  return deriveBuild(buildOf(overrides));
}

/** A martial with no spellcasting: two hit dice types, no slots. */
export function fighter(level = 5): Build {
  return buildOf({
    name: 'Basher',
    classes: [{ classId: 'fighter', level, subclassId: 'champion' }],
    baseScores: { str: 15, dex: 14, con: 14, int: 10, wis: 10, cha: 8 },
  });
}

/** A full caster: slots at several levels, a save DC, damage from cantrips. */
export function wizard(level = 9): Build {
  return buildOf({
    name: 'Ünwyn',
    classes: [{ classId: 'wizard', level, subclassId: 'evocation' }],
    baseScores: { str: 8, dex: 14, con: 14, int: 15, wis: 12, cha: 10 },
    spellIds: ['fire-bolt', 'fireball', 'shield'],
  });
}

/** Pact slots alongside ordinary ones, and two kinds of hit die. */
export function warlockSorcerer(): Build {
  return buildOf({
    name: 'Vex',
    classes: [
      { classId: 'warlock', level: 6, subclassId: 'fiend' },
      { classId: 'sorcerer', level: 4 },
    ],
    baseScores: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 15 },
    spellIds: ['eldritch-blast', 'hex'],
  });
}

export function rosterOf(...builds: Build[]): Roster {
  const entries = builds.map((build, i) => ({
    id: `c${i}`,
    build,
    updatedAt: 1,
    play: emptyPlay(),
  }));
  return { entries, activeId: entries[0]?.id ?? '' };
}

export type { ClassId };
