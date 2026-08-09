import type { Ability, Build, ClassId, Ruleset } from '../types';
import {
  CANTRIPS_KNOWN,
  PREPARED_2024,
  SPELLS_KNOWN,
  casterLevelContribution,
  pactSlotsFor,
  slotsForCasterLevel,
  soleCasterLevel,
} from '../data/spellSlots';
import { SPELLS, spellById } from '../data/spells';
import type { Spell } from '../data/spells';
import type { ClassSlice } from './character';

/**
 * Spell slots, spells known and spells prepared.
 *
 * The part worth being careful about is multiclassing. Slots do not come from
 * adding class levels: a full caster contributes its whole level, a half caster
 * half rounded down, a third caster a third - so a Paladin 6 / Sorcerer 6 casts
 * as a 9th-level caster, not a 12th. Pact Magic never joins that pool at all.
 *
 * The trap is that this rule is *only* the multiclass rule. A character with
 * one casting class reads that class's own printed table, which rounds up, and
 * applying the multiclass formula to them cost a single-class Paladin or
 * Ranger a slot at every odd level. See `soleCasterLevel`.
 */

export interface SpellSlots {
  /** Slots at each spell level, index 0 being 1st level. */
  bySpellLevel: number[];
  /** The effective caster level those slots came from. */
  casterLevel: number;
  /** Warlock slots, which are a separate resource. */
  pact: { count: number; level: number } | null;
  /** The highest spell level this character can cast at all. */
  highestLevel: number;
}

/**
 * One casting class's numbers.
 *
 * A character has as many of these as they have casting classes, and they are
 * genuinely different: a Cleric 5 / Wizard 5 with Wisdom 14 and Intelligence 20
 * casts their Cleric spells at DC 14 and their Wizard spells at DC 17. Carrying
 * one save DC per *character* is how the sheet came to print a number that was
 * three points wrong for half of what the character could cast.
 */
export interface CastingSource {
  classId: ClassId;
  className: string;
  ability: Ability;
  saveDc: number;
  attackBonus: number;
}

export interface SpellcastingResult extends SpellSlots {
  /** Whether this character casts anything. */
  casts: boolean;
  /** One entry per casting class, in the order the classes are listed. */
  sources: CastingSource[];
  /**
   * The best of `sources`, for the places that genuinely want one number - the
   * comparison view, the Builder's summary strip. A single-class caster has
   * exactly one source, so for them these are unchanged.
   */
  ability: Ability | null;
  saveDc: number | null;
  attackBonus: number | null;
  /** How many cantrips this character knows. */
  cantripsKnown: number;
  /** For known-casters: how many spells they know. Null for preparers. */
  spellsKnown: number | null;
  /** For preparers: how many they prepare each day. Null for known-casters. */
  spellsPrepared: number | null;
  /** Every spell this character could choose from. */
  available: Spell[];
  /** Chosen cantrips and spells, resolved. */
  chosen: Spell[];
  /**
   * Spells a subclass grants outright - always prepared, and free of every
   * count above. Kept apart from `chosen` because they are not picks: they
   * cannot be dropped, and folding them in would eat the budget they are
   * explicitly exempt from.
   */
  granted: Spell[];
  /** `granted` and `chosen` together, which is what the character can cast. */
  castable: Spell[];
  /** Picks made against picks allowed. */
  openCantrips: number;
  openSpells: number;
  /**
   * Whether this character keeps a book and prepares a subset of it each day.
   *
   * The distinction the app used to collapse. A Sorcerer *knows* eight spells
   * and can cast all eight; a Wizard writes far more than that into a spellbook
   * and picks which of them are live this morning. Everyone else prepares from
   * their whole class list, so what they record already is the prepared list.
   */
  preparesFromBook: boolean;
  /** Today's prepared spells, for a book caster. Empty for everyone else. */
  prepared: Spell[];
  /** How many more this character could prepare today. */
  openPrepared: number;
  /** Chosen spells that are not on any list this character can draw from. */
  illegal: Spell[];
  /**
   * Whether any chosen spell is being cast at an assumed class's DC rather than
   * a recorded one. False for every single-class caster, and false for a
   * multiclass caster who has said where each spell came from - which is what
   * lets the sheet disclose the assumption only where it is really being made.
   */
  assumedSources: boolean;
  notes: string[];
}

export interface SpellcastingInput {
  build: Build;
  slices: ClassSlice[];
  mods: Record<Ability, number>;
  proficiency: number;
  subclassIds: Set<string>;
}

/** Classes that prepare from their whole list rather than knowing a few. */
const PREPARERS: ClassId[] = ['cleric', 'druid', 'paladin', 'wizard', 'artificer'];

export function computeSlots(slices: ClassSlice[], ruleset: Ruleset = '2014'): SpellSlots {
  let casterLevel = 0;
  let warlockLevel = 0;

  /*
    Which of the two rules applies depends on how many casting classes there
    are, and this is a rule rather than a special case: the class's own table
    governs a character who has only that class, and the multiclass table
    governs one who has two. They agree for full casters, which is why using
    the multiclass formula everywhere went unnoticed - but a single-class
    Paladin 5 has 4/2 slots and the multiclass formula gives them 3, a whole
    spell level short.
  */
  const casting = slices.filter(
    (slice) => (slice.subclass?.castingType ?? slice.klass.castingType) !== 'none',
  );
  const sole = casting.length === 1;

  for (const slice of slices) {
    const castingType = slice.subclass?.castingType ?? slice.klass.castingType;
    if (castingType === 'pact') {
      warlockLevel += slice.entry.level;
      continue;
    }
    casterLevel += sole
      ? soleCasterLevel(castingType, slice.entry.level, ruleset, slice.klass.castsFromLevel1)
      : casterLevelContribution(castingType, slice.entry.level, slice.klass.multiclassRoundsUp);
  }

  const bySpellLevel = slotsForCasterLevel(casterLevel);
  const pact = pactSlotsFor(warlockLevel);

  // The highest level you can cast is the best of your two pools.
  let highest = 0;
  bySpellLevel.forEach((count, index) => {
    if (count > 0) highest = Math.max(highest, index + 1);
  });
  if (pact) highest = Math.max(highest, pact.level);

  return { bySpellLevel, casterLevel, pact, highestLevel: highest };
}

/**
 * How many spells a character knows or prepares.
 *
 * Under 2014 this is two rules: a Wizard prepares Intelligence plus their
 * Wizard level, a Cleric and Druid the same off Wisdom, and a Sorcerer, Bard,
 * Ranger and Warlock know a fixed number from a table.
 *
 * Under 2024 it is one rule and neither of those: **everyone** prepares, and
 * how many is a printed column that does not consult your ability score at
 * all. So the answer here can differ in both directions - a Cleric with
 * Wisdom 20 at 5th level prepared 10 spells in 2014 and prepares 9 in 2024,
 * while a Sorcerer went from 6 to 9.
 */
function knownAndPrepared(
  slices: ClassSlice[],
  mods: Record<Ability, number>,
  ruleset: Ruleset,
): { known: number | null; prepared: number | null; cantrips: number } {
  let known = 0;
  let prepared = 0;
  let cantrips = 0;
  let anyKnown = false;
  let anyPrepared = false;

  for (const slice of slices) {
    const id = slice.klass.id;
    const level = slice.entry.level;
    const castingType = slice.subclass?.castingType ?? slice.klass.castingType;
    if (castingType === 'none') continue;

    cantrips += CANTRIPS_KNOWN[id]?.[Math.min(20, level) - 1] ?? 0;

    const printed2024 = ruleset === '2024' ? PREPARED_2024[id] : undefined;
    if (printed2024) {
      // One column, no ability score, and it covers every caster - including
      // the Warlock, whose column happens to match their 2014 known list.
      prepared += printed2024[Math.min(20, level) - 1] ?? 0;
      anyPrepared = true;
    } else if (PREPARERS.includes(id)) {
      const ability = slice.subclass?.castingAbility ?? slice.klass.castingAbility;
      if (!ability) continue;
      // Half casters prepare off half their level, rounded up.
      const effective = castingType === 'half' ? Math.ceil(level / 2) : level;
      prepared += Math.max(1, mods[ability] + effective);
      anyPrepared = true;
    } else {
      known += SPELLS_KNOWN[id]?.[Math.min(20, level) - 1] ?? 0;
      anyKnown = true;
    }
  }

  return {
    known: anyKnown ? known : null,
    prepared: anyPrepared ? prepared : null,
    cantrips,
  };
}

/**
 * Which casting class a spell is cast through.
 *
 * A spell is cast with the ability of the class you learned it from, so a
 * Cleric/Wizard's Fireball is a Wizard spell at the Wizard's DC even if their
 * Wisdom is higher. `learnedFrom` is the recorded answer; where it is absent -
 * every character built before it was stored, and any spell only one of your
 * classes could have taught you - this falls back to the best eligible class,
 * which is the favourable reading rather than the certain one.
 *
 * Returning the source rather than a number lets the caller tell the two cases
 * apart, so a sheet only says it is assuming when it actually is.
 */
export function sourceForSpell(
  spell: Spell,
  sources: CastingSource[],
  learnedFrom?: ClassId,
): { source: CastingSource | null; assumed: boolean } {
  const eligible = sources.filter((source) => spell.classes.includes(source.classId));

  const recorded = learnedFrom && eligible.find((s) => s.classId === learnedFrom);
  if (recorded) return { source: recorded, assumed: false };

  // A spell on no source's list - an illegal pick, or one from a class that
  // cannot cast - still has to print something, so it falls back to the
  // character's best overall.
  const pool = eligible.length ? eligible : sources;
  const best = pool.reduce<CastingSource | null>(
    (found, source) => (!found || source.saveDc > found.saveDc ? source : found),
    null,
  );
  // Only one class could have taught it, so there is nothing to assume.
  return { source: best, assumed: eligible.length > 1 };
}

/** The save DC a particular spell is actually cast at. */
export function dcForSpell(
  spell: Spell,
  sources: CastingSource[],
  learnedFrom?: ClassId,
): number | null {
  return sourceForSpell(spell, sources, learnedFrom).source?.saveDc ?? null;
}

/**
 * Spells a subclass hands you outright, at or below the level you have reached
 * in that class.
 *
 * These are always prepared and never count against how many you may prepare -
 * a Life Cleric's Bless and Cure Wounds are free, on top of the list, which is
 * most of why the subclass rates as highly as it does. The app said as much in
 * the subclass notes ("Free spells and recovered slots") for a long time
 * without ever handing them over.
 *
 * 2014 only, deliberately. Every one of these lists was revised for 2024 and no
 * licensed source carries the revisions - the SRD 5.2 API serves the subclass
 * and returns an empty spell list - so a 2024 character gets nothing rather
 * than getting a table somebody made up. `subclassSpellNote` says so on the
 * sheet instead of leaving it as a silent absence.
 */
export function grantedSpells(slices: ClassSlice[], ruleset: Ruleset): Spell[] {
  if (ruleset !== '2014') return [];
  const out: Spell[] = [];
  const seen = new Set<string>();
  for (const slice of slices) {
    for (const grant of slice.subclass?.spells ?? []) {
      if (slice.entry.level < grant.level) continue;
      for (const id of grant.ids) {
        const spell = spellById(id);
        if (spell && !seen.has(id)) {
          seen.add(id);
          out.push(spell);
        }
      }
    }
  }
  return out;
}

/** Every spell this character can draw from, across all their casting classes. */
export function availableSpells(slices: ClassSlice[], highestLevel: number): Spell[] {
  const classIds = new Set<ClassId>();
  for (const slice of slices) {
    const castingType = slice.subclass?.castingType ?? slice.klass.castingType;
    if (castingType !== 'none') classIds.add(slice.klass.id);
  }

  return SPELLS.filter(
    (spell) =>
      spell.level <= highestLevel && spell.classes.some((id) => classIds.has(id)),
  );
}

export function computeSpellcasting(input: SpellcastingInput): SpellcastingResult {
  const { build, slices, mods, proficiency } = input;
  const notes: string[] = [];

  const slots = computeSlots(slices, build.ruleset);
  const castingSlices = slices.filter(
    (s) => (s.subclass?.castingType ?? s.klass.castingType) !== 'none',
  );
  const casts = castingSlices.length > 0;

  const sources: CastingSource[] = [];
  for (const slice of castingSlices) {
    const ability = slice.subclass?.castingAbility ?? slice.klass.castingAbility;
    if (!ability) continue;
    sources.push({
      classId: slice.klass.id,
      className: slice.klass.name,
      ability,
      saveDc: 8 + proficiency + mods[ability],
      attackBonus: proficiency + mods[ability],
    });
  }

  // The headline number is the best of them rather than the first. For one
  // casting class that is the same value it always was, which is what keeps
  // every existing build deriving exactly as before.
  const best = sources.reduce<CastingSource | null>(
    (found, source) => (!found || source.saveDc > found.saveDc ? source : found),
    null,
  );

  const { known, prepared: preparedCount, cantrips } = knownAndPrepared(slices, mods, build.ruleset);
  const available = availableSpells(slices, Math.max(slots.highestLevel, 0));
  const availableIds = new Set(available.map((s) => s.id));

  const chosen = build.spellIds.map(spellById).filter(Boolean) as Spell[];
  const illegal = chosen.filter((s) => !availableIds.has(s.id));

  /*
    Subclass spells. A recorded pick that a subclass grants anyway is dropped
    from the granted list rather than shown twice - the pick is the wasteful
    thing there, and the build review is the place to say so, not this list.
  */
  const chosenIds = new Set(chosen.map((s) => s.id));
  const granted = grantedSpells(slices, build.ruleset).filter((s) => !chosenIds.has(s.id));
  const castable = [...granted, ...chosen];

  const learnedFrom = build.spellSources ?? {};
  const assumedSources =
    sources.length > 1 &&
    chosen.some((spell) => sourceForSpell(spell, sources, learnedFrom[spell.id]).assumed);

  const chosenCantrips = chosen.filter((s) => s.level === 0).length;
  const chosenSpells = chosen.filter((s) => s.level > 0).length;

  /*
    A Wizard is the one caster whose recorded list and castable list differ:
    the book holds everything they have ever copied, and the morning decides
    which of it is live. Every other preparer draws from their entire class
    list, so what they record *is* what they prepared.
  */
  const preparesFromBook = castingSlices.some((slice) => slice.klass.id === 'wizard');
  const preparedSet = new Set(build.preparedIds ?? []);
  const prepared = preparesFromBook
    ? chosen.filter((s) => s.level > 0 && preparedSet.has(s.id))
    : [];

  if (slots.pact && slots.casterLevel > 0) {
    notes.push(
      `Pact Magic is separate: ${slots.pact.count} slot${slots.pact.count === 1 ? '' : 's'} at level ${slots.pact.level}, back on a short rest, on top of the slots above.`,
    );
  }
  if (castingSlices.length > 1) {
    notes.push(
      `Multiclass slots come from an effective caster level of ${slots.casterLevel}, not from adding class levels.`,
    );
  }

  return {
    ...slots,
    casts,
    sources,
    ability: best?.ability ?? null,
    saveDc: best?.saveDc ?? null,
    attackBonus: best?.attackBonus ?? null,
    cantripsKnown: cantrips,
    spellsKnown: known,
    spellsPrepared: preparedCount,
    available,
    chosen,
    openCantrips: Math.max(0, cantrips - chosenCantrips),
    // A book caster's "open" count is about the book, which has no ceiling, so
    // only a known-caster or a whole-list preparer has spells left to choose.
    openSpells: preparesFromBook ? 0 : Math.max(0, (known ?? preparedCount ?? 0) - chosenSpells),
    preparesFromBook,
    prepared,
    openPrepared: preparesFromBook ? Math.max(0, (preparedCount ?? 0) - prepared.length) : 0,
    illegal,
    assumedSources,
    granted,
    castable,
    notes,
  };
}

/**
 * Spells no longer legal after a change - a class swap, or a level drop that
 * put a spell above your highest slot. Reported rather than silently dropped,
 * the way skill picks and class options are.
 */
export function reconcileSpells(
  build: Build,
  result: SpellcastingResult,
): { build: Build; changes: string[] } {
  if (!result.illegal.length) return { build, changes: [] };

  const illegalIds = new Set(result.illegal.map((s) => s.id));
  const changes = result.illegal.map(
    (spell) =>
      `${spell.name} is not on a list this character can draw from any more, so it was dropped.`,
  );
  // A dropped spell's recorded class goes with it, so nothing is left pointing
  // at a spell this character no longer has.
  const spellSources = build.spellSources
    ? Object.fromEntries(Object.entries(build.spellSources).filter(([id]) => !illegalIds.has(id)))
    : undefined;
  return {
    build: {
      ...build,
      spellIds: build.spellIds.filter((id) => !illegalIds.has(id)),
      ...(spellSources ? { spellSources } : {}),
    },
    changes,
  };
}
