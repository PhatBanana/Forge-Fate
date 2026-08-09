import type { BuildContext } from './character';
import { KIND_LABELS, optionGroups } from './classOptions';
import { masterySlots } from './attacks';

/**
 * What this build spends that it does not have.
 *
 * ## Why this is one function and not six checks
 *
 * Every budget in the app was written the same way and got the same bug.
 * `openSpells` is `Math.max(0, known - chosen)`; so is `openCantrips`, so is
 * `openExpertisePicks`, so is a class option group's `open`. That clamp is
 * right for the question those fields answer - "how many are left to pick" -
 * and it silently destroys the *other* question nobody was asking: how many
 * too many. A sweep across every class at every level in both rulesets found
 * roughly two hundred illegal builds the app had nothing to say about: a
 * Bard knowing 25 spells of a permitted 22, a level-3 Fighter with four
 * fighting styles, a Barbarian with five weapon masteries of two.
 *
 * The pattern is the point. Six budgets were added at six different times and
 * each one re-derived "how many are open" without anybody asking what happens
 * past zero. So this is deliberately **one list of budgets** rather than six
 * checks bolted onto six panels: adding a seventh budget means adding a row
 * here, and the conformance suite fails until it is added.
 *
 * ## What counts as illegal
 *
 * Only over-spending a countable budget, and only where the count is the
 * app's own. Not "your build is weak" - that is `analyze`'s job and has its
 * own tone. Not a rule the DM might waive silently: this reports, the review
 * renders, and the character is still built, for the same reasons §43's
 * multiclass check flags rather than forbids.
 */

/** One budget spent past its limit. */
export interface Overspend {
  /** Stable id, so a caller can filter or test one without matching prose. */
  kind:
    | 'cantrips'
    | 'spells'
    | 'prepared'
    | 'expertise'
    | 'mastery'
    | 'fighting-style'
    | 'pact-boon'
    | 'invocation'
    | 'metamagic'
    | 'maneuver';
  /** Plural noun for a sentence: "cantrips", "Eldritch Invocations". */
  label: string;
  allowed: number;
  taken: number;
  /** Which Builder section fixes it, named as it appears on screen. */
  where: string;
}

/** A spell recorded that no slot this character owns could ever cast. */
export interface UncastableSpell {
  name: string;
  level: number;
  /** The highest spell level this character has a slot for; 0 for none. */
  topSlot: number;
}

/** The highest spell level this character has a slot for. Pact slots count. */
export function topSlotLevel(ctx: BuildContext): number {
  const casting = ctx.spellcasting;
  const fromTable = casting.bySpellLevel.reduce((best, n, i) => (n > 0 ? i + 1 : best), 0);
  return Math.max(fromTable, casting.pact?.level ?? 0);
}

/**
 * Spells recorded above every slot the character owns.
 *
 * A level-3 Artificer with a 2nd-level spell on the sheet is not a
 * questionable choice, it is a spell they cannot cast - and the app said
 * nothing, at 36 class-and-level combinations.
 *
 * Cantrips are exempt by definition, and so is a **book**: a Wizard writes
 * spells into a spellbook long before they can cast them, which is the whole
 * point of a book, so only what is *prepared* is judged for them.
 */
export function uncastableSpells(ctx: BuildContext): UncastableSpell[] {
  const casting = ctx.spellcasting;
  if (!casting.casts) return [];
  const top = topSlotLevel(ctx);
  const judged = casting.preparesFromBook
    ? casting.chosen.filter((s) => ctx.build.preparedIds.includes(s.id))
    : casting.chosen;
  return judged
    .filter((spell) => spell.level > 0 && spell.level > top)
    .map((spell) => ({ name: spell.name, level: spell.level, topSlot: top }));
}

/**
 * Every budget this build has spent past its limit.
 *
 * Returns an empty list for a legal build, so a caller can treat a non-empty
 * result as "this could not have been made" without inspecting it.
 */
export function overspends(ctx: BuildContext): Overspend[] {
  const out: Overspend[] = [];
  const casting = ctx.spellcasting;

  const add = (
    kind: Overspend['kind'],
    label: string,
    allowed: number,
    taken: number,
    where: string,
  ) => {
    if (taken > allowed) out.push({ kind, label, allowed, taken, where });
  };

  if (casting.casts) {
    const cantrips = casting.chosen.filter((s) => s.level === 0).length;
    add('cantrips', 'cantrips', casting.cantripsKnown, cantrips, 'Spells');

    const leveled = casting.chosen.filter((s) => s.level > 0).length;
    if (casting.spellsKnown !== null) {
      // A known caster's list is permanent picks, so the count is a hard cap.
      add('spells', 'spells known', casting.spellsKnown, leveled, 'Spells');
    } else if (casting.spellsPrepared !== null) {
      /*
        A preparer's cap is on what is prepared today, not on what they could
        prepare - and for a book caster the book itself is uncapped, which is
        why the prepared list is what gets counted rather than `chosen`.
      */
      const prepared = casting.preparesFromBook
        ? ctx.build.preparedIds.length
        : leveled;
      add('prepared', 'prepared spells', casting.spellsPrepared, prepared, 'Spells');
    }
  }

  add(
    'expertise',
    'expertise picks',
    ctx.proficiencies.expertisePicks,
    ctx.build.expertiseIds.length,
    'Proficiencies',
  );

  if (ctx.build.ruleset === '2024') {
    add(
      'mastery',
      'weapon masteries',
      masterySlots(ctx.slices, ctx.build.ruleset),
      ctx.build.masteryIds.length,
      'Equipment',
    );
  }

  /*
    The class options - fighting styles, invocations, metamagic, maneuvers,
    the pact boon - all the way through one loop, because `optionGroups`
    already knows each kind's slots and what is taken against them. A seventh
    option kind therefore arrives here for free, which is the opposite of how
    the six budgets above got into this state.
  */
  for (const group of optionGroups(ctx)) {
    add(
      group.kind as Overspend['kind'],
      KIND_LABELS[group.kind].many,
      group.slots,
      group.chosen.length,
      'Class options',
    );
  }

  return out;
}

/** A feat recorded somewhere it cannot legally sit. */
export interface IllegalFeat {
  name: string;
  /** Why: the wrong category for the slot, or a prerequisite not met. */
  reason: string;
}

/**
 * Feats in the wrong slot, and origin feats nobody checked.
 *
 * Two holes on the same list, both found by probing rather than reading:
 *
 * 1. **A general feat in an origin slot is silent.** 2024 backgrounds grant
 *    an *Origin* feat specifically, and the app happily accepted Resilient -
 *    a General feat - in that slot with nothing to say. The over-count check
 *    beside it masked this for a while: on a character with no origin slot at
 *    all it complains about the *number*, which reads like a category
 *    complaint until you give the character a real slot and watch it go
 *    quiet.
 * 2. **Origin feats' prerequisites were never checked at all.** The
 *    prerequisite loop in `analyze` walks `featIds` and stops; `originFeatIds`
 *    is a second list nobody pointed it at. The same feat flagged in one slot
 *    passed silently in the other.
 *
 * 2014 has no feat categories, so the category half applies to 2024 only -
 * checked rather than assumed, since a 2014 feat has no `category` at all and
 * "not origin" would be true of every one of them.
 */
export function illegalFeats(
  ctx: BuildContext,
  featById: (id: string, ruleset: string) => { name: string; category?: string } | undefined,
  prereqProblems: (id: string) => string[],
): IllegalFeat[] {
  const out: IllegalFeat[] = [];
  for (const id of ctx.build.originFeatIds) {
    const feat = featById(id, ctx.build.ruleset);
    if (!feat) continue;
    if (ctx.build.ruleset === '2024' && feat.category && feat.category !== 'origin') {
      out.push({
        name: feat.name,
        reason: `is a ${feat.category.replace('-', ' ')} feat, and an origin slot takes an Origin feat`,
      });
    }
    const problems = prereqProblems(id);
    if (problems.length) out.push({ name: feat.name, reason: problems.join('; ') });
  }
  return out;
}

/** "3 of 2 metamagic options" - the sentence every caller wants. */
export function describeOverspend(over: Overspend): string {
  return `${over.taken} of ${over.allowed} ${over.label}`;
}
