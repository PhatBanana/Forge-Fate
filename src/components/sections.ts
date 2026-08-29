import { BACKGROUNDS_BY_ID } from '../data/backgrounds';
import { masterySlots } from '../engine/attacks';
import { optionGroups } from '../engine/classOptions';
import { pointsSpent } from '../engine/pointBuy';
import { ABILITIES } from '../types';
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
 * §138: one waiting choice, named.
 *
 * `openChoicesBySection` returned five numbers, which is everything a badge
 * needs and nothing a *step* does. The guided flow asks a finer question -
 * not "how many does Skills & options owe" but "which one am I answering now,
 * and which box on the sheet does answering it fill" - so the counting was
 * split out into a list and the five numbers are summed from it.
 *
 * That is why this is here rather than in a module of its own. The band's
 * counts and the flow's steps are the same facts read at two grains, and the
 * one way to keep them from drifting is to have one of them derive the other.
 */
export interface WaitingChoice {
  /** Stable across renders, so the flow can stay on a step while the build moves. */
  id: string;
  section: Section;
  /** What the step is called: "Ability score improvement or feat". */
  title: string;
  /**
   * The box on the sheet this fills. The load-bearing half of §138's fusion -
   * a step that cannot name where its answer lands is a step that has not
   * been fused with anything.
   */
  target: string;
  /** How many decisions of this kind are outstanding. */
  open: number;
  /**
   * Which shape the step's body takes. `ranked` steps are the ones the engine
   * can score with reasons; `form` steps are the ones that are a field or a
   * grid rather than a ranking.
   */
  shape: 'ranked' | 'form';
}

/**
 * Everything still unanswered, in the order a character is made.
 *
 * Ordered by section, and within a section by how much the answer moves -
 * an unspent ability score improvement before an unchosen language - because
 * a flow that opens on the smallest question teaches you to skip it.
 */
export function waitingChoices(ctx: BuildContext): WaitingChoice[] {
  const { proficiencies: profs, spellcasting: casting, build } = ctx;
  const out: WaitingChoice[] = [];
  const add = (
    id: string,
    section: Section,
    open: number,
    title: string,
    target: string,
    shape: 'ranked' | 'form',
  ) => {
    if (open > 0) out.push({ id, section, open, title, target, shape });
  };

  // ---------------------------------------------------------- identity
  /*
    §154: the first question, asked first. Species × class was a separate
    screen you had to know to visit before building; now it is the opening
    step of the flow. Open exactly while the sheet is untouched - the same
    no-false-positive rule the abilities step uses, because nobody assigns
    all eights on purpose - which is also the only time loading a pairing
    (which resets scores and equipment) has nothing to wipe. Answering it
    either way closes it: a pairing brings its own point-buy, and setting
    the six numbers by hand says you have moved on.
  */
  add(
    'who',
    'identity',
    pointsSpent(build.baseScores) === 0 ? 1 : 0,
    'Who you are',
    'the identity band',
    'form',
  );
  add(
    'background',
    'identity',
    build.backgroundId ? 0 : 1,
    'Where you came from',
    'the identity band',
    'form',
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
  add(
    'background-asi',
    'identity',
    openBackgroundAsi,
    'What your background is worth',
    'Abilities',
    'form',
  );

  // --------------------------------------------------------- abilities
  add(
    'abilities',
    'abilities',
    // Every score at 8 with the whole budget unspent is a sheet nobody has
    // filled in, which is the one case where this cannot be a false positive:
    // no one rolls or assigns all eights on purpose.
    pointsSpent(build.baseScores) === 0 ? 1 : 0,
    'Six numbers everything else is read from',
    'Abilities',
    'form',
  );

  // --------------------------------------------------------- equipment
  add(
    'loadout',
    'equipment',
    !build.weapons.mainHandId && !build.weapons.offHandId && build.defenses.armorId === 'none'
      ? 1
      : 0,
    'What you wear and what you hold',
    'Armor class and Attacks',
    'form',
  );
  add(
    'masteries',
    'equipment',
    Math.max(0, masterySlots(ctx.slices, build.ruleset) - build.masteryIds.length),
    'Weapon mastery',
    'Attacks',
    'form',
  );

  // --------------------------------------------------- skills & options
  add('skills', 'options', profs.openSkillPicks, 'Skill proficiencies', 'Skills', 'ranked');
  add(
    'expertise',
    'options',
    profs.openExpertisePicks,
    'Expertise',
    'Skills',
    'ranked',
  );
  for (const group of optionGroups(ctx)) {
    add(`option:${group.kind}`, 'options', group.open, group.label, 'Class features & options', 'ranked');
  }
  if (casting.casts) {
    add('cantrips', 'options', casting.openCantrips, 'Cantrips', 'Spells', 'ranked');
    add('spells', 'options', casting.openSpells, 'Spells known', 'Spells', 'ranked');
    /* Preparing is a checklist over spells this character already knows, not
       a ranking of a catalogue - so it is a form, and the Builder's spell
       panel is where the boxes are. */
    add('prepared', 'options', casting.openPrepared, 'Spells prepared', 'Spells', 'form');
  }
  add('languages', 'options', profs.languages.open, 'Languages', 'Proficiencies', 'form');

  // ------------------------------------------------------------- feats
  add(
    'asi',
    'feats',
    Math.max(0, ctx.asiSlotsReached - ctx.asiSlotsSpent),
    'Ability score improvement or feat',
    'Feats & ability increases',
    'ranked',
  );
  add(
    'origin-feat',
    'feats',
    Math.max(0, ctx.originFeatSlots - build.originFeatIds.length),
    'Origin feat',
    'Feats & ability increases',
    'ranked',
  );

  return out;
}

/**
 * How many choices each section is still waiting on.
 *
 * The two 2024-only ones were missing for a while, which meant a 2024 Fighter
 * could sit on six unspent weapon masteries and three points of free ability
 * increase with every badge reading zero. The rule that unfinished choices are
 * badges rather than build-review findings only works if the badges count them.
 *
 * §138: summed from `waitingChoices` rather than counted a second time here.
 * The band and the flow now disagree only if one of them is not rendering,
 * which is a bug you can see rather than one you have to reconcile.
 */
export function openChoicesBySection(ctx: BuildContext): Record<Section, number> {
  const out: Record<Section, number> = {
    identity: 0,
    abilities: 0,
    equipment: 0,
    options: 0,
    feats: 0,
  };
  for (const choice of waitingChoices(ctx)) out[choice.section] += choice.open;
  return out;
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

/**
 * §139: one line describing what a section currently holds.
 *
 * The dense page shows five rows and a row that named only its section would
 * be a table of contents: "Identity", "Abilities", "Equipment". What makes it
 * a *reading* of the character is that each row says what is in it before you
 * open it - which species, which scores, what you are holding - so the page
 * answers "what have I built" without expanding anything.
 *
 * Deliberately short and deliberately lossy. This is the line you skim; the
 * section under it is the whole truth, and a summary that tried to be
 * complete would be the section again in a smaller font.
 */
export function sectionSummary(ctx: BuildContext): Record<Section, string> {
  const { build, proficiencies: profs } = ctx;
  const background = build.backgroundId ? BACKGROUNDS_BY_ID[build.backgroundId] : undefined;
  const classes = ctx.slices
    .map((slice) => `${slice.klass.name} ${slice.entry.level}`)
    .join(' / ');
  const armor = build.defenses.armorId === 'none' ? 'no armor' : build.defenses.armorId;
  const held = [build.weapons.mainHandId, build.weapons.offHandId].filter(Boolean);
  const proficient = profs.skills.filter((line) => line.proficient).length;
  const expertise = profs.skills.filter((line) => line.expertise).length;
  const feats = build.featIds.length + build.originFeatIds.length;

  return {
    identity: [ctx.race.name, classes, background?.name ?? 'no background'].join(' · '),
    // The six, in the order every sheet prints them, because a list of six
    // numbers is only readable if it is always the same six in the same order.
    abilities: ABILITIES.map((ability) => ctx.scores[ability]).join(' / '),
    equipment: [armor, ...(held.length ? held : ['nothing held'])].join(' · '),
    options: [
      `${proficient} skill ${proficient === 1 ? 'proficiency' : 'proficiencies'}`,
      ...(expertise ? [`${expertise} expertise`] : []),
      ...(ctx.spellcasting.casts ? [`${ctx.spellcasting.chosen.length} spells recorded`] : []),
    ].join(' · '),
    feats: feats
      ? `${feats} ${feats === 1 ? 'feat' : 'feats'}${build.asiPicks.length ? ` · ${build.asiPicks.length} increase${build.asiPicks.length === 1 ? '' : 's'}` : ''}`
      : 'nothing taken',
  };
}
