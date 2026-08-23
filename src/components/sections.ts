import { BACKGROUNDS_BY_ID } from '../data/backgrounds';
import { masterySlots } from '../engine/attacks';
import { optionGroups } from '../engine/classOptions';
import { pointsSpent } from '../engine/pointBuy';
import type { BuildContext } from '../engine/character';

/**
 * The Builder's sections - all of them, on one page.
 *
 * ## What was tried, and why it was abandoned
 *
 * Seventeen panels all open at once made this tab **five screens tall**, long
 * enough that reaching the feats meant scrolling past sixteen ranked cards for
 * two class options. §31.4 split it into one section at a time, roughly a
 * screen each.
 *
 * ## Why it came back anyway
 *
 * Because five sections are five places, and the ask was for one: *"it should
 * be just one big window with your character, race, class, all that, and
 * suggestions and the scaling"*, instead of *"having to go to a different tab
 * for the lineages and then another tab for the abilities or feats"*.
 *
 * ## What makes it fit this time
 *
 * Not a diet - a diet is what failed, and four more panels arrived afterwards
 * with nothing to stop them. A **rule**, in `ChoiceRow`: your character is
 * always visible, the catalogue of what you have *not* taken is not, and
 * exactly one catalogue is open at a time. That bounds the page at the closed
 * rows plus one picker, so the eighteenth panel costs about fifty pixels
 * rather than a screen.
 *
 * Measured at 1360 with every catalogue shut, by section: 0.91, 0.44, 0.81,
 * 0.6, 0.39 screens - and the tallest single picker takes the section it is in
 * to 1.5. `scratchpad/run33.mjs` checks it, because a number the design is
 * built to bound should be measured rather than asserted in a comment.
 *
 * The rail down the side is anchors into this page, and the badge is what
 * makes it worth having: it says where a choice is unmade without making you
 * scroll to find out.
 */
export type Section = 'identity' | 'abilities' | 'equipment' | 'options' | 'feats';

export const SECTIONS: { id: Section; label: string }[] = [
  { id: 'identity', label: 'Identity' },
  { id: 'abilities', label: 'Abilities' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'options', label: 'Skills & options' },
  { id: 'feats', label: 'Feats' },
];

/**
 * How many choices each section is still waiting on.
 *
 * The two 2024-only ones were missing for a while, which meant a 2024 Fighter
 * could sit on six unspent weapon masteries and three points of free ability
 * increase with every badge reading zero. The rule that unfinished choices are
 * badges rather than build-review findings only works if the badges count them.
 */
export function openChoicesBySection(ctx: BuildContext): Record<Section, number> {
  const { proficiencies: profs, spellcasting: casting, build } = ctx;
  const options = optionGroups(ctx).reduce((sum, group) => sum + group.open, 0);
  const openMasteries = Math.max(
    0,
    masterySlots(ctx.slices, build.ruleset) - build.masteryIds.length,
  );

  // A 2024 background hands out +2/+1 or +1/+1/+1, and until they are assigned
  // the character is simply three points short of the one on the page.
  const background = build.backgroundId ? BACKGROUNDS_BY_ID[build.backgroundId] : undefined;
  const backgroundAsiWanted =
    build.ruleset === '2024' && background?.abilities
      ? build.backgroundAsi.mode === '2+1'
        ? 2
        : 3
      : 0;
  const openBackgroundAsi =
    build.backgroundAsi.mode === '1+1+1'
      ? // The spread mode raises all three, so it is done the moment it is picked.
        backgroundAsiWanted > 0 && build.backgroundAsi.picks.length === 0
        ? 1
        : 0
      : Math.max(0, backgroundAsiWanted - build.backgroundAsi.picks.length);

  return {
    identity: (build.backgroundId ? 0 : 1) + openBackgroundAsi,
    // Every score at 8 with the whole budget unspent is a sheet nobody has
    // filled in, which is the one case where this cannot be a false positive:
    // no one rolls or assigns all eights on purpose.
    abilities: pointsSpent(build.baseScores) === 0 ? 1 : 0,
    // Nothing worn and nothing held, plus any weapon mastery still unchosen.
    equipment:
      (!build.weapons.mainHandId && !build.weapons.offHandId && build.defenses.armorId === 'none'
        ? 1
        : 0) + openMasteries,
    options:
      profs.openSkillPicks +
      profs.openExpertisePicks +
      profs.languages.open +
      options +
      (casting.casts ? casting.openCantrips + casting.openSpells + casting.openPrepared : 0),
    feats:
      Math.max(0, ctx.asiSlotsReached - ctx.asiSlotsSpent) +
      Math.max(0, ctx.originFeatSlots - build.originFeatIds.length),
  };
}

/**
 * §123: what to call a section, by id.
 *
 * Derived from `SECTIONS` rather than written out a second time. The Level Up
 * panel used to keep its own copy of three of these - and its own idea of what
 * a section id was, which was `string` - so a renamed id was a silent no-op
 * there and a cast back to `Section` at the Builder's end.
 */
export const SECTION_LABEL: Record<Section, string> = Object.fromEntries(
  SECTIONS.map((s) => [s.id, s.label]),
) as Record<Section, string>;
