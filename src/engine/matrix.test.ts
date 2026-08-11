import { describe, expect, it } from 'vitest';
import { CLASSES } from '../data/classes';
import { needsFor } from './matrix';
import { withOriginalsForTests } from '../originals';

/**
 * §59.2. What the matrices and the feat scorer know about a class.
 *
 * `needsFor` was seven hardcoded lists of published class ids plus two fields
 * derived from the class record. That was invisible while thirteen classes was
 * all there was, and stopped being invisible the moment the app wrote four of
 * its own: they came back `featHungry` and `frail` and **false for everything
 * else**, so every species pairing and every feat suggestion for them was made
 * on two bits of information.
 *
 * The visible symptom was the feat recommender offering Great Weapon Master to
 * a Dexterity-and-bows Harrier and to an unarmoured Intelligence Adept.
 *
 * These two tests are the pair that matters: the first is the regression the
 * fix was for, and the second is the reason it was fixed by deriving rather
 * than by adding four ids to seven lists.
 */
describe('what the matrix knows about each class', () => {
  it('knows something about every class, including ours', () => {
    const restore = withOriginalsForTests(true);
    try {
      const blind: string[] = [];
      for (const klass of CLASSES) {
        const needs = needsFor(klass);
        /*
          `featHungry` and `frail` are computed from the class record and were
          therefore never the problem, so they are excluded: a class that
          answers true to those and nothing else is exactly the failure this
          test exists to catch, and counting them would let it through.
        */
        const informative = [
          needs.armorStarved, needs.unarmoredAc, needs.stealthy,
          needs.melee, needs.ranged, needs.social, needs.weaponStarved,
        ].filter(Boolean).length;
        if (informative === 0) blind.push(klass.name);
      }
      expect(blind, 'rated on hit die and casting type alone').toEqual([]);
    } finally {
      restore();
    }
  });

  it('reads the four correctly rather than merely non-emptily', () => {
    /*
      A class could satisfy the sweep above by accident. These are the specific
      facts the recommender was getting wrong, asserted one at a time.
    */
    const restore = withOriginalsForTests(true);
    try {
      const of = (id: string) => needsFor(CLASSES.find((c) => c.id === id)!);

      // The Harrier shoots. This is the one that produced Great Weapon Master.
      expect(of('harrier').ranged, 'Harrier is a ranged class').toBe(true);
      expect(of('harrier').stealthy, 'Harrier has Stealth on its skill list').toBe(true);

      // The Adept wears nothing and has Intelligence armour written into its
      // 1st-level feature, which the derivation reads off the feature tag.
      expect(of('adept').armorStarved, 'Adept has no armour proficiency').toBe(true);
      expect(of('adept').unarmoredAc, 'Adept has Mind Over Body').toBe(true);
      expect(of('adept').weaponStarved, 'Adept has simple weapons only').toBe(true);

      // The Marshal is a Charisma commander in heavy armour.
      expect(of('marshal').social, 'Marshal runs on Charisma').toBe(true);
      expect(of('marshal').armorStarved, 'Marshal wears heavy armour').toBe(false);
      expect(of('marshal').melee, 'Marshal fights in melee').toBe(true);

      // The Reckoner is a d8 Charisma caster in light armour.
      expect(of('reckoner').social, 'Reckoner runs on Charisma').toBe(true);
      expect(of('reckoner').armorStarved, 'Reckoner has light armour only').toBe(true);
      expect(of('reckoner').frail, 'Reckoner has a d8').toBe(true);
    } finally {
      restore();
    }
  });

  it('leaves the published thirteen exactly as they were', () => {
    /*
      The curated lists are tuned and snapshotted, and the derivation disagrees
      with them in a few places on purpose - the Druid is curated as stealthy
      for Wild Shape rather than its skill list, the Rogue as social for
      Expertise rather than its ability priorities. Those rows must not move.
    */
    const wizard = needsFor(CLASSES.find((c) => c.id === 'wizard')!);
    expect(wizard.unarmoredAc, 'Bladesinger, which is a subclass feature').toBe(true);
    const druid = needsFor(CLASSES.find((c) => c.id === 'druid')!);
    expect(druid.stealthy, 'Wild Shape, not the skill list').toBe(true);
    const rogue = needsFor(CLASSES.find((c) => c.id === 'rogue')!);
    expect(rogue.social, 'Expertise, not the ability priorities').toBe(true);
    const bard = needsFor(CLASSES.find((c) => c.id === 'bard')!);
    expect(bard.weaponStarved, 'curated as armed enough despite no martial category').toBe(false);
  });
});
