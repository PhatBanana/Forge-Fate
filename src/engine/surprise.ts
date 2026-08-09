/**
 * Surprise: the difference between an ambush and a doorway fight.
 *
 * ## Why it was absent
 *
 * Stealth landed in §19.3 - the Hide action rolls a real Stealth score, the
 * hidden state lives on the combatant, and a watcher with the passive
 * Perception to beat it finds them. Everything surprise needs has therefore
 * existed for twenty sections, and initiative still started every fight the
 * same way: an ambush from a pitch-dark alcove and two parties walking into
 * each other at a doorway were the same first round.
 *
 * ## The rule, as the SRD states it
 *
 * "The DM compares the Dexterity (Stealth) checks of anyone hiding with the
 * passive Wisdom (Perception) score of each creature on the opposing side.
 * Any creature that doesn't notice a threat is surprised at the start of the
 * encounter."
 *
 * Two things follow that are easy to get wrong, and both are modelled here:
 *
 * - Surprise is **per creature**, not per side. The elf with the good ears
 *   acts while the rest of the party stands there, which is the whole
 *   texture of the rule.
 * - A creature is surprised only if it notices **nothing**. One unhidden
 *   goblin in the open means the whole party sees the ambush coming, however
 *   well its friends are hiding - "doesn't notice a threat" is about threats,
 *   plural, and noticing one is enough.
 *
 * ## What being surprised costs
 *
 * "You can't move or take an action on your first turn of the combat, and
 * you can't take a reaction until that turn ends." Not a lost turn - the
 * turn happens, and everything in it is spent before it starts. That is how
 * the battle screen applies it, because the app already models a spent
 * action economy and a spent one is exactly what this is.
 *
 * ## What this refuses to decide
 *
 * Whether anybody was *trying* to be stealthy. The SRD makes that the DM's
 * call, and so does this: only a creature the DM has actually hidden - which
 * on this battlefield means somebody who took the Hide action or was placed
 * hidden - counts as an unnoticed threat. Everything else is a fight that
 * starts with both sides looking at each other, which is most fights.
 */

/** One creature, as the surprise question needs to see it. */
export interface Sneak {
  id: string;
  /** Which side of the fight - surprise only ever comes from the other one. */
  side: 'party' | 'monsters';
  /** The Stealth score they are hiding behind. Absent means in plain sight. */
  hidden?: number;
  /** What they notice with, passively, because nobody rolls initiative twice. */
  passivePerception: number;
}

/**
 * Who is surprised when the fight starts.
 *
 * Returns ids rather than a mutated list so the caller can log them, apply
 * them, or show the DM what the rule *would* say and let them disagree -
 * which the Order drawer does, because "the DM determines who might be
 * surprised" is the first sentence of the rule.
 */
export function surprisedAtStart(all: Sneak[]): Set<string> {
  const out = new Set<string>();
  for (const creature of all) {
    const foes = all.filter((other) => other.side !== creature.side);
    // Nobody to be ambushed by. An empty field surprises no one.
    if (!foes.length) continue;
    /*
      Noticed if any one of them is either standing in the open or hiding
      badly enough to be seen. `>=` beats the hider, matching the spotting
      check §19.3 already uses: a passive Perception equal to a Stealth
      score finds them, because a tie goes to the watcher everywhere else in
      this app and one rule should not have two answers.
    */
    const noticesSomething = foes.some(
      (foe) => foe.hidden === undefined || creature.passivePerception >= foe.hidden,
    );
    if (!noticesSomething) out.add(creature.id);
  }
  return out;
}
