import { SCHOOL_LABELS } from '../data/spells';
import type { Spell } from '../data/spells';
import type { BuildContext } from './character';
import { headlineOf, scoreRules } from './recommend';
import type { Reason } from './recommend';

/**
 * Ranking the spells a character can pick.
 *
 * This reuses the feat machinery on purpose - `scoreRules` and `headlineOf` are
 * the same functions the feat and class-option rankings use - so a spell
 * recommendation explains itself the same way, with every rule that fired and
 * by how much.
 *
 * Two things are deliberately different from feats. First, most spells are not
 * scored at all: only the ones carrying a `base` have an opinion attached, and
 * the rest are offered without one rather than given a number that means
 * nothing. Second, the value of a spell depends on what you already picked -
 * a second concentration spell is worth less than the first, because you can
 * only hold one at a time.
 */

export interface SpellSuggestion {
  kind: 'spell';
  id: string;
  spell: Spell;
  /** Null when the spell carries no opinion; it is offered, not ranked. */
  score: number | null;
  reasons: Reason[];
  headline: string;
  /** Already known or prepared. */
  taken: boolean;
  /**
   * Handed over by a subclass rather than picked. Not a recommendation and not
   * removable - a Life Cleric's Cure Wounds is theirs whatever they do - so the
   * card says so instead of inviting a pick that would waste a slot.
   */
  granted: boolean;
}

/**
 * You can only concentrate on one thing. The first concentration spell is the
 * one you will actually be holding; each one after competes with it, so it is
 * credited less. This is a soft penalty, not a bar - a caster wants a couple of
 * options - which is why it grows with how many you already have.
 */
const CONCENTRATION_CLASH = 1.5;

/** Concentration spells already taken, other than the one being scored. */
function rivalConcentration(ctx: BuildContext, spell: Spell): number {
  return ctx.spellcasting.castable.filter((s) => s.concentration && s.id !== spell.id).length;
}

export function scoreSpell(spell: Spell, ctx: BuildContext): SpellSuggestion {
  const taken = ctx.build.spellIds.includes(spell.id);
  const granted = ctx.spellcasting.granted.some((s) => s.id === spell.id);

  if (spell.base === undefined) {
    return {
      kind: 'spell',
      id: spell.id,
      spell,
      score: null,
      reasons: [],
      headline: spell.summary,
      taken,
      granted,
    };
  }

  const { score, reasons } = scoreRules(spell.base, spell.rules, ctx);
  let total = score;

  if (spell.concentration) {
    const rivals = rivalConcentration(ctx, spell);
    if (rivals > 0) {
      const penalty = -CONCENTRATION_CLASH * rivals;
      total += penalty;
      reasons.push({
        text: `You already rely on ${rivals} other concentration spell${
          rivals === 1 ? '' : 's'
        }, and only one can be up at a time.`,
        delta: penalty,
      });
    }
  }

  return {
    kind: 'spell',
    id: spell.id,
    spell,
    score: Math.max(0, total),
    reasons: reasons.filter((r) => r.delta !== 0 || reasons.length === 1),
    headline: headlineOf(reasons, spell.note ?? spell.summary),
    taken,
    granted,
  };
}

export interface SpellGroup {
  /** 0 for cantrips. */
  level: number;
  label: string;
  suggestions: SpellSuggestion[];
}

function levelLabel(level: number): string {
  if (level === 0) return 'Cantrips';
  const suffix = level === 1 ? 'st' : level === 2 ? 'nd' : level === 3 ? 'rd' : 'th';
  return `${level}${suffix} level`;
}

/**
 * Everything this character can draw from, grouped by spell level and ranked
 * within each. Scored spells come first, then the unscored ones alphabetically -
 * an unranked spell is still a legal pick, it just has no verdict attached.
 */
export function spellGroups(ctx: BuildContext): SpellGroup[] {
  const byLevel = new Map<number, SpellSuggestion[]>();

  for (const spell of ctx.spellcasting.available) {
    const suggestion = scoreSpell(spell, ctx);
    const bucket = byLevel.get(spell.level) ?? [];
    bucket.push(suggestion);
    byLevel.set(spell.level, bucket);
  }

  return [...byLevel.keys()]
    .sort((a, b) => a - b)
    .map((level) => ({
      level,
      label: levelLabel(level),
      suggestions: (byLevel.get(level) ?? []).sort(
        (a, b) =>
          Number(b.taken) - Number(a.taken) ||
          Number(b.score !== null) - Number(a.score !== null) ||
          (b.score ?? 0) - (a.score ?? 0) ||
          a.spell.name.localeCompare(b.spell.name),
      ),
    }));
}

/**
 * The best picks this character has not made yet, across every level they can
 * reach. This is what the "you have picks open" prompt offers.
 */
export function recommendSpells(ctx: BuildContext, limit = 6, level?: number): SpellSuggestion[] {
  return ctx.spellcasting.available
    .filter((spell) => (level === undefined ? true : spell.level === level))
    .map((spell) => scoreSpell(spell, ctx))
    // A granted spell is already yours, so recommending it would be telling
    // you to spend a pick on something free - and the build review would then
    // flag the pick you just made.
    .filter((s) => !s.taken && !s.granted && s.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.spell.name.localeCompare(b.spell.name))
    .slice(0, limit);
}

/** "3rd level evocation, concentration" - the line under a spell's name. */
export function describeSpell(spell: Spell): string {
  const parts = [
    spell.level === 0
      ? `${SCHOOL_LABELS[spell.school]} cantrip`
      : `${levelLabel(spell.level).toLowerCase()} ${SCHOOL_LABELS[spell.school].toLowerCase()}`,
  ];
  if (spell.concentration) parts.push('concentration');
  if (spell.ritual) parts.push('ritual');
  return parts.join(', ');
}
