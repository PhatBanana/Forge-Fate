import { describe, expect, it } from 'vitest';
import readme from '../../README.md?raw';
import development from '../../docs/development.md?raw';
import engine from '../../docs/engine.md?raw';
import { SPELLS } from './spells';
import { MAGIC_ITEMS } from './magicItems';
import { SKILLS } from './skills';
import { CLASSES, classesFor, subclassesFor } from './classes';
import { racesFor } from './races';
import { featsFor } from './feats';
import { backgroundsFor } from './backgrounds';
import { weaponsFor } from './weapons';
import { SUBCLASS_FEATURES } from './subclassFeatures';
import monsterFixture from './srd/srd-2014-monsters.json';

/**
 * The counts the docs state, against the tables.
 *
 * The README claimed 338 spells and 283 magic items for a while after those
 * tables had grown to 344 and 371 - and worse, carried a caveat saying ordinary
 * gear and encumbrance were "not tracked at all" months after both were. Stale
 * numbers are untidy; a caveat that is the opposite of the truth is read and
 * believed, and stops someone looking.
 *
 * Prose cannot be tested, but numbers can, and the numbers are what go out of
 * date. Each pattern below anchors on enough words to survive a rewrite and
 * fail loudly on a real change.
 *
 * Every document is searched rather than the README alone. The file map moved
 * to `docs/development.md` when the README was rewritten for people using the
 * app rather than building it, and a check that only watches one file quietly
 * stops watching the counts the moment they are moved somewhere sensible.
 */

const text = [readme, development, engine].join('\n\n');

/** How many times a subclass feature appears across the whole table. */
const subclassFeatureCount = Object.values(SUBCLASS_FEATURES)
  .reduce((total, features) => total + features.length, 0);

const CLAIMS: { what: string; pattern: RegExp; actual: number }[] = [
  { what: 'spells (feature list)', pattern: /\*\*Spells\.\*\* (\d+) spells/, actual: SPELLS.length },
  { what: 'spells (file map)', pattern: /spells\.ts\s+(\d+) spells/, actual: SPELLS.length },
  { what: 'spells (caveat)', pattern: /later books\.\*\* (\d+) spells/, actual: SPELLS.length },
  { what: 'magic items', pattern: /\*\*Magic items\.\*\* The whole list — (\d+) entries/, actual: MAGIC_ITEMS.length },
  { what: 'monsters (feature list)', pattern: /\*\*(\d+) SRD monster\s*\n?stat blocks\*\*/, actual: monsterFixture.records.length },
  { what: 'monsters (file map)', pattern: /monsters\.ts\s+(\d+) SRD 5\.1 stat blocks/, actual: monsterFixture.records.length },
  {
    what: 'magic items with a computed effect',
    pattern: /(\d+) of them change a number/,
    actual: MAGIC_ITEMS.filter((item) => item.effect).length,
  },
  { what: 'skills', pattern: /All (\d+) skills with their modifiers/, actual: SKILLS.length },
  { what: 'skills (file map)', pattern: /skills\.ts\s+the (\d+) skills/, actual: SKILLS.length },
  { what: 'subclasses', pattern: /(\d+) subclasses across \d+ entries/, actual: CLASSES.flatMap((c) => c.subclasses).length },
  { what: 'subclass features', pattern: /\d+ subclasses across (\d+) entries/, actual: subclassFeatureCount },
  { what: 'lineages (matrix)', pattern: /matrix — (\d+) lineages × \d+ classes/, actual: racesFor('2014').length },
  { what: 'classes (matrix)', pattern: /\d+ lineages × (\d+) classes/, actual: CLASSES.length },
  { what: 'lineages (file map)', pattern: /races\.ts\s+(\d+) lineages/, actual: racesFor('2014').length },
  { what: '2014 feats', pattern: /feats\.ts\s+(\d+) feats for 2014/, actual: featsFor('2014').length },
  { what: '2024 feats', pattern: /feats for 2014, (\d+) for 2024/, actual: featsFor('2024').length },
  { what: '2014 backgrounds', pattern: /backgrounds\.ts\s+(\d+) backgrounds for 2014/, actual: backgroundsFor('2014').length },
  { what: '2024 backgrounds', pattern: /backgrounds for 2014, (\d+) for 2024/, actual: backgroundsFor('2024').length },
  { what: '2014 weapons', pattern: /weapons\.ts\s+(\d+) weapons in 2014/, actual: weaponsFor('2014').length },
  { what: '2024 weapons', pattern: /weapons in 2014 and (\d+) in 2024/, actual: weaponsFor('2024').length },
  { what: '2024 classes (file map)', pattern: /classes\.ts\s+(\d+) classes/, actual: classesFor('2014').length },
  {
    what: '2014 subclasses (ruleset table)',
    pattern: /Every published one, (\d+) in all/,
    actual: CLASSES.reduce((total, klass) => total + subclassesFor(klass, '2014').length, 0),
  },
];

describe('the README against the tables', () => {
  it('states a count that is still true', () => {
    const wrong: string[] = [];
    for (const claim of CLAIMS) {
      const match = text.match(claim.pattern);
      if (!match) {
        wrong.push(`${claim.what}: the README no longer says this at all `
          + `(pattern ${claim.pattern}). Update the pattern or restore the sentence.`);
        continue;
      }
      const stated = Number(match[1]);
      if (stated !== claim.actual) {
        wrong.push(`${claim.what}: README says ${stated}, the table holds ${claim.actual}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  /**
   * Caveats that outlived what they described. These assert the corrections
   * are still there, because the failure mode is a revert, not a typo.
   */
  it('does not carry the caveats that stopped being true', () => {
    const gone = [
      'Ordinary gear, weight and encumbrance are not tracked at all',
      'The app tracks one list of spells',
      'Subclass features are not exhaustive',
      'Tool proficiencies from a dip are still not tracked',
      'Sorcery points do not convert',
      'nothing counts your arrows',
      // Recorded since per-spell class attribution landed.
      'Which class you learned a given spell from is not something the app',
      // Subclass features became a level-by-level table; only the pools claim
      // stayed true, and it was resting on a reason that had stopped being one.
      'since subclass features are carried as written verdicts',
    ].filter((claim) => text.includes(claim));
    expect(gone).toEqual([]);
  });
});
