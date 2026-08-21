import { appendLog, damageMonster, recordDamage, setDormant } from './encounter';
import type { EncounterState } from './encounter';
import { activeEncounter, updateEncounter, updatePlay } from './storage';
import type { Roster } from './storage';
import { concentrationDc, damage, heal } from './play';
import { parseNotation, rollD20, rollNotation, defaultRng } from './engine/dice';
import type { Rng } from './engine/dice';
import { applyDefences } from './engine/defences';
import { combatantsIn, grantsUnder, sideOf } from './zones';
import { placeZone } from './surfaces';
import type { Zone } from './zones';
import { hitPointsOf } from './hitPoints';
import { combatantName } from './hitPoints';
import { defencesOf, maxHpOf, saveBonusFor } from './fightFacts';
import type { FightView } from './fightFacts';

/**
 * §113: ground that bites, ground that mends, and what happens when you
 * put a new one down on top of an old one (§23, §26).
 *
 * The first **write-side** step of ROADMAP §9, which is why it was
 * chosen small: everything here takes a roster and hands one back, so
 * the shape gets proven on three functions rather than on the strike
 * resolver.
 *
 * **Everything composes into one write.** A wall of fire that damaged
 * three people across three `onChange` calls would have two of them
 * build from a roster that no longer existed and the last one would
 * win - so a bite threads its roster through, and the caller writes
 * once at the end. That rule is why these return rosters rather than
 * calling setters, and it predates the plan; the plan only moved it.
 *
 * The dice are a parameter now. They were `defaultRng` reached for
 * inline, which is exactly why none of this had a test: a bite that
 * rolls its own damage cannot be asserted on. `defaultRng` is still the
 * default, so no caller changed.
 *
 * **One thing deliberately not tidied.** This path records damage into
 * the tally without asking whether the fight is running, where §106's
 * `applyHitPoints` gates on `isRunning`. Folding one into the other
 * would change what a zone does to the debrief outside a running fight,
 * which is a behaviour change wearing a cleanup's clothes. Recorded
 * here rather than done.
 */

/**
 * A zone bites: rolled, defended, saved against, logged and applied -
 * to whichever store owns the hit points.
 *
 * `how` is the third way to be bitten as well as the two obvious ones:
 * "is caught by" is §26's surface reacting under somebody's feet, and
 * it costs exactly like walking in.
 */
export function biteZone(
  view: FightView,
  roster: Roster,
  combatantId: string,
  zone: Zone,
  how: 'walks into' | 'ends their turn in' | 'is caught by',
  rng: Rng = defaultRng,
): Roster {
  const effect = zone.effect;
  if (!effect?.damage) return roster;
  const encNow = activeEncounter(roster);
  const combatant = encNow.combatants.find((c) => c.id === combatantId);
  if (!combatant) return roster;
  const parsed = parseNotation(effect.damage.dice);
  if (!parsed) return roster;
  const rolled = rollNotation(parsed, rng).total;

  // A fire elemental standing in a wall of fire is the case this fixes.
  const through = applyDefences(
    rolled,
    { type: effect.damage.type.toLowerCase() },
    defencesOf(view, combatant),
  );
  let dealt = through.dealt;
  let saveNote = through.notes.length ? ` (${through.notes.join('; ')})` : '';
  if (effect.save) {
    const bonus =
      (saveBonusFor(view, combatant, effect.save.ability as 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha') ??
        0) + grantsUnder(encNow.zones, combatant.at, sideOf(combatant.kind)).saves;
    const total = rollD20(bonus, 'normal', rng).total;
    const pass = total >= effect.save.dc;
    // Halving the post-defence figure, not the raw roll: resistance and a
    // successful save both apply, and each halves what is left.
    if (pass) dealt = effect.save.half ? Math.floor(dealt / 2) : 0;
    saveNote += ` — ${effect.save.ability.toUpperCase()} save ${total} vs DC ${effect.save.dc}: ${pass ? 'pass' : 'FAIL'}`;
  }

  const name = combatantName(combatant, roster);
  let enc = appendLog(
    encNow,
    `${name} ${how} ${zone.label}${saveNote}${dealt > 0 ? `, ${dealt} ${effect.damage.type}.` : ', no damage.'}`,
  );
  if (dealt <= 0) return updateEncounter(roster, enc);

  // This render's roster, as the closure this replaced read it - see
  // the note in fightStrike.ts.
  const hpBefore = hitPointsOf(combatant, view.roster, maxHpOf(view))?.now ?? 0;
  // The zone's damage scores in the debrief too - no hand behind it, so no
  // dealer, but every point taken and every knockdown counts.
  enc = recordDamage(enc, {
    to: combatant.id,
    amount: Math.min(dealt, hpBefore),
    downed: hpBefore > 0 && hpBefore - dealt <= 0,
  });
  if (combatant.kind === 'monster') {
    if (combatant.dormant) {
      enc = appendLog(setDormant(enc, combatant.id, false), `${combatant.label} activates!`);
    }
    return updateEncounter(roster, damageMonster(enc, combatant.id, dealt));
  }
  let out = updateEncounter(roster, enc);
  const entry = out.entries.find((e) => e.id === combatant.rosterId);
  const max = maxHpOf(view)(combatant.rosterId);
  if (entry) {
    /*
      The same roll the strike path makes. Ground that hurts breaks
      concentration exactly like a sword does, and having one door roll it
      and the other only mention it would be the worse kind of inconsistency.
    */
    let play = damage(entry.play, dealt, max);
    if (entry.play.concentratingOn) {
      const dc = concentrationDc(dealt);
      const roll = rollD20(saveBonusFor(view, combatant, 'con') ?? 0, 'normal', rng).total;
      const held = roll >= dc;
      out = updateEncounter(
        out,
        appendLog(
          activeEncounter(out),
          `${name} — CON save ${roll} vs DC ${dc} to hold ${entry.play.concentratingOn}: ${
            held ? 'holds' : 'LOST'
          }.`,
        ),
      );
      if (!held) play = { ...play, concentratingOn: undefined };
    }
    out = updatePlay(out, entry.id, play);
  }
  return out;
}

/**
 * Ground that mends rather than bites: rolled and applied like a bite,
 * with the sign turned round.
 *
 * Nothing to mend on somebody at full, and nothing at all for the dead:
 * healing the dropped is a ruling, and a loud one, not a side effect of
 * standing somewhere.
 */
export function healFromZone(
  view: FightView,
  roster: Roster,
  combatantId: string,
  dice: string,
  rng: Rng = defaultRng,
): Roster {
  const encNow = activeEncounter(roster);
  const c = encNow.combatants.find((x) => x.id === combatantId);
  const parsed = parseNotation(dice);
  if (!c || !parsed) return roster;
  const hp = hitPointsOf(c, view.roster, maxHpOf(view));
  if (!hp || hp.now <= 0 || hp.now >= hp.max) return roster;
  const rolled = rollNotation(parsed, rng).total;
  const enc = appendLog(
    encNow,
    `${combatantName(c, roster)} ends their turn on healing ground — ${rolled} back.`,
  );
  // Negative damage, which is how the rail's own +5 button already heals a
  // monster - `damageMonster` clamps at both ends.
  if (c.kind === 'monster') return updateEncounter(roster, damageMonster(enc, c.id, -rolled));
  let out = updateEncounter(roster, enc);
  const entry = out.entries.find((e) => e.id === c.rosterId);
  if (entry) out = updatePlay(out, entry.id, heal(entry.play, rolled, maxHpOf(view)(c.rosterId)));
  return out;
}

/**
 * Put an area down, and let the ground answer.
 *
 * §23 made a wall of fire different from a drawing of one; this makes it
 * different from a wall of fire in an empty room. `placeZone` decides
 * what the surfaces do to each other - the grease catches, the web burns
 * off, the lake conducts - and hands back the new ground, the lines to
 * say, and any jolt that has to bite right now.
 *
 * A jolt is a zone that bites once: everyone standing in it pays,
 * through the same dice, saves and stores a wall of fire already uses.
 */
export function dropZone(
  view: FightView,
  roster: Roster,
  incoming: Zone,
  rng: Rng = defaultRng,
): Roster {
  const encounter: EncounterState = view.encounter;
  const { zones, log, jolts } = placeZone(encounter.zones ?? [], incoming);

  let enc: EncounterState = { ...encounter, zones, nextSeq: encounter.nextSeq + 1 };
  for (const line of log) enc = appendLog(enc, line);
  let updated = updateEncounter(roster, enc);

  for (const jolt of jolts) {
    for (const victim of combatantsIn(jolt, activeEncounter(updated).combatants)) {
      if ((hitPointsOf(victim, view.roster, maxHpOf(view))?.now ?? 0) <= 0) continue;
      updated = biteZone(view, updated, victim.id, jolt, 'is caught by', rng);
    }
  }
  return updated;
}

