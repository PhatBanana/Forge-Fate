import { GRAPPLED } from './engine/grapple';
import { monsterMod } from './data/monsters';
import type { Monster } from './data/monsters';
import type { Combatant, EncounterState } from './encounter';
import type { Roster } from './storage';
import type { BuildContext } from './engine/character';
import type { Defences } from './engine/defences';
import type { Ruleset } from './types';

/**
 * §110: what is true of one combatant right now.
 *
 * Twelve questions the fight asks constantly - what conditions are on
 * them, who put them there, how big they are, who has hold of them, what
 * they notice without looking, how exhausted they are, which edition
 * they play under, what they resist, whether they are dodging, whether
 * their reaction is gone, what a skill is worth to them. Every one of
 * them answers from **whichever store owns the fact**, which is the same
 * two-store rule §106 named: a monster carries its truth on the
 * combatant because it exists only for this fight, a character's lives
 * on the roster because they outlive it.
 *
 * These were twelve closures inside the battle screen. They are pure -
 * no state is written by any of them - and they depended on no other
 * helper in that file, which is why they are the first step of ROADMAP
 * §9 and the proof that the `FightView` shape carries.
 */

/**
 * The read-side of a fight, bundled so a rules module learns one thing
 * rather than four. `buildOf` is a function rather than a map because
 * deriving a character is expensive and the caller already memoises it
 * per render; this module never asks twice for the same one.
 */
export interface FightView {
  encounter: EncounterState;
  roster: Roster;
  /** The stat block behind a monster combatant. */
  monsterById: (id: string) => Monster | undefined;
  /** The derived character behind a character combatant. */
  buildOf: (rosterId: string) => BuildContext | undefined;
  /** The table's edition - what a monster is played under (§60). */
  ruleset: Ruleset;
}

const playOf = (view: FightView, rosterId: string) =>
  view.roster.entries.find((e) => e.id === rosterId)?.play;

/** Conditions on them, from whichever store owns the list. */
export const conditionsOf = (view: FightView, c: Combatant): string[] =>
  c.kind === 'monster' ? c.conditions : (playOf(view, c.rosterId)?.conditions ?? []);

/** And who caused them, for the conditions that turn on it. */
export const sourcesOf = (view: FightView, c: Combatant): Record<string, string> =>
  (c.kind === 'monster' ? c.conditionSources : playOf(view, c.rosterId)?.conditionSources) ?? {};

/**
 * A creature's size, for the rules that compare two of them. A
 * character's comes off their species - a halfling is Small, and Small
 * cannot grapple Large - rather than a flat 'Medium' that made every
 * party mid-sized.
 */
export const sizeOf = (view: FightView, c: Combatant): string =>
  c.kind === 'monster'
    ? (view.monsterById(c.monsterId)?.size ?? 'Medium')
    : (view.buildOf(c.rosterId)?.race.size ?? 'Medium');

/**
 * The two ends of a grapple, read off the condition and its source.
 *
 * No new store: a hold IS the grappled condition plus the source field
 * conditions grew in §27.2. That is what makes it survive a refresh, an
 * undo and a save without a line of migration.
 */
export function grapplerOf(view: FightView, c: Combatant): Combatant | undefined {
  if (!conditionsOf(view, c).includes(GRAPPLED)) return undefined;
  const by = sourcesOf(view, c)[GRAPPLED];
  return by ? view.encounter.combatants.find((x) => x.id === by) : undefined;
}

/** Whoever this one has hold of, if anybody. */
export const heldBy = (view: FightView, c: Combatant): Combatant | undefined =>
  view.encounter.combatants.find(
    (x) =>
      x.id !== c.id &&
      conditionsOf(view, x).includes(GRAPPLED) &&
      sourcesOf(view, x)[GRAPPLED] === c.id,
  );

/**
 * What somebody notices without looking, from whichever side owns it.
 *
 * The stat block states it; a character's is derived. Ten is the floor
 * for a monster with neither, which is a plain unmodified passive - the
 * honest default rather than a zero that would make every ambush work.
 */
export function passivePerceptionOf(view: FightView, c: Combatant): number {
  if (c.kind === 'monster') {
    const monster = view.monsterById(c.monsterId);
    return monster?.passivePerception ?? (monster ? 10 + monsterMod(monster.scores.wis) : 10);
  }
  return view.buildOf(c.rosterId)?.proficiencies.passivePerception ?? 10;
}

/** Exhaustion, which only a character carries - a stat block has no
    track for it, so a monster reads as rested. */
export const exhaustionOf = (view: FightView, c: Combatant): number =>
  c.kind === 'character' ? (playOf(view, c.rosterId)?.exhaustion ?? 0) : 0;

/**
 * Which edition this combatant is played under. Exhaustion is the first
 * rule where the two disagree *in play* rather than at build time, so
 * the fight has to ask.
 *
 * §60 changed what a *monster* answers. It used to be a flat `'2014'`,
 * on the reasoning that a monster has no edition of its own - true, and
 * the wrong conclusion. A table runs one edition; the DM who built a
 * 2024 party is running 2024, and their monsters were reading the 2014
 * exhaustion ladder. So a monster reads the table's edition.
 */
export const rulesetOf = (view: FightView, c: Combatant): Ruleset =>
  (c.kind === 'character'
    ? view.roster.entries.find((e) => e.id === c.rosterId)?.build.ruleset
    : view.ruleset) ?? '2014';

/** What a skill is worth to them: the stat block's number, or the
    derived one, falling back to a raw ability modifier. */
export function skillBonusFor(
  view: FightView,
  c: Combatant,
  skill: string,
  fallback: 'str' | 'dex',
): number {
  if (c.kind === 'monster') {
    const monster = view.monsterById(c.monsterId);
    if (!monster) return 0;
    return monster.skills?.[skill] ?? monsterMod(monster.scores[fallback]);
  }
  const ctx = view.buildOf(c.rosterId);
  if (!ctx) return 0;
  return (
    ctx.proficiencies.skills.find((s) => s.skill === skill)?.modifier ?? ctx.mods[fallback]
  );
}

/**
 * Disengage or Dodge, from whichever store holds it. Both trays have
 * offered both actions since the command menu existed and neither ever
 * wrote anything down, which made Disengage an action spent on a rule
 * nothing enforced.
 */
export const stanceOf = (view: FightView, c: Combatant): 'disengage' | 'dodge' | undefined =>
  c.kind === 'monster' ? c.stance : playOf(view, c.rosterId)?.turn.stance;

/** Whether their one reaction is already gone. */
export const reactionSpentOf = (view: FightView, c: Combatant): boolean =>
  c.kind === 'monster' ? !!c.reactionSpent : !!playOf(view, c.rosterId)?.turn.reaction;

/** What they resist, ignore or take double from - a stat block's, since
    a character's defences are already in their derived build. */
export function defencesOf(view: FightView, c: Combatant): Defences {
  if (c.kind !== 'monster') return {};
  const monster = view.monsterById(c.monsterId);
  return monster
    ? { resist: monster.resist, immune: monster.immune, vulnerable: monster.vulnerable }
    : {};
}

/**
 * What they add to a saving throw, from whichever side owns it - the
 * stat block's number, or proficiency and items off the derived build.
 * Null where the record is missing entirely, which the callers read as
 * "this one does not roll" rather than as a zero.
 */
export function saveBonusFor(
  view: FightView,
  c: Combatant,
  ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha',
): number | null {
  if (c.kind === 'monster') {
    const monster = view.monsterById(c.monsterId);
    if (!monster) return null;
    return monster.saves[ability] ?? monsterMod(monster.scores[ability]);
  }
  const ctx = view.buildOf(c.rosterId);
  if (!ctx) return null;
  const proficient = new Set(ctx.slices[0]?.klass.saves ?? []).has(ability);
  return ctx.mods[ability] + (proficient ? ctx.proficiency : 0) + ctx.itemEffects.saves;
}
