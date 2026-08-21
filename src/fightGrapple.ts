import {
  appendLog,
  placeCombatant,
  setHidden,
  toggleMonsterCondition,
  setConditionSource,
} from './encounter';
import type { Combatant, EncounterState } from './encounter';
import { activeEncounter, updateEncounter, updatePlay } from './storage';
import type { Roster } from './storage';
import { moveBy, setPlayConditionSource, setTurnSlot, toggleCondition } from './play';
import { defaultRng, rollD20 } from './engine/dice';
import type { Rng } from './engine/dice';
import { GRAPPLED, canGrapple, escapeContest } from './engine/grapple';
import type { GrabMode } from './engine/grapple';
import { canShove, fallDamage, fallFeet, pushedTo, shoveContest } from './engine/shove';
import { walkable } from './engine/sight';
import type { SightContext } from './engine/sight';
import { elevationAt } from './terrain';
import { combatantName } from './hitPoints';
import { grapplerOf, heldBy, sizeOf, skillBonusFor } from './fightFacts';
import { monsterMod } from './data/monsters';
import type { FightView } from './fightFacts';
import { movementLeftFor, speedOf, standUpCostFor } from './fightMovement';
import { biteZone } from './fightZones';
import { nothingHappened } from './fightEvents';
import type { Resolution } from './fightEvents';

/**
 * §114: hands on somebody - the grapple, the shove, the trip, the
 * escape, getting up off the floor, and hiding (§26.2, §39, §65).
 *
 * The fifth step of ROADMAP §9, and the one the `Resolution` shape was
 * designed for: a shove that pushes somebody off a ledge has to *say* so
 * as well as write it, because the sprite slides. The rules here return
 * the new truth and a list of what happened; the screen plays the list.
 *
 * **Everything composes into one write.** The contest, the move, the
 * fall, the damage, the condition and the log all thread one roster
 * through - a push that damaged somebody across two writes would have
 * the second build from a roster the first had already replaced. That
 * rule is older than this module and is the reason it can exist at all.
 */

/** Prone, added rather than toggled: shoving somebody already down must
    not stand them back up. */
export function knockProne(roster: Roster, id: string): Roster {
  const encNow = activeEncounter(roster);
  const c = encNow.combatants.find((x) => x.id === id);
  if (!c) return roster;
  if (c.kind === 'monster') {
    if (c.conditions.includes('prone')) return roster;
    return updateEncounter(roster, toggleMonsterCondition(encNow, id, 'prone'));
  }
  const entry = roster.entries.find((e) => e.id === c.rosterId);
  if (!entry || entry.play.conditions.includes('prone')) return roster;
  return updatePlay(roster, entry.id, toggleCondition(entry.play, 'prone'));
}

/**
 * The hold applied, and the hold released - one writer for both, since
 * they are the same four moves with the direction flipped.
 *
 * Both write the condition AND the source, in one composed roster,
 * because a `grappled` with nobody named on it is a condition nothing
 * can ever end: the escape has no-one to roll against and the sweep has
 * no-one to check.
 */
export function setHeld(roster: Roster, id: string, byWhom: string | undefined): Roster {
  const want = byWhom !== undefined;
  const encNow = activeEncounter(roster);
  const c = encNow.combatants.find((x) => x.id === id);
  if (!c) return roster;
  if (c.kind === 'monster') {
    const enc =
      c.conditions.includes(GRAPPLED) === want ? encNow : toggleMonsterCondition(encNow, id, GRAPPLED);
    return updateEncounter(roster, setConditionSource(enc, id, GRAPPLED, byWhom));
  }
  const entry = roster.entries.find((e) => e.id === c.rosterId);
  if (!entry) return roster;
  const play =
    entry.play.conditions.includes(GRAPPLED) === want
      ? entry.play
      : toggleCondition(entry.play, GRAPPLED);
  return updatePlay(roster, entry.id, setPlayConditionSource(play, GRAPPLED, byWhom));
}

export const holdOn = (roster: Roster, id: string, byWhom: string): Roster =>
  setHeld(roster, id, byWhom);

/** Let go: the condition off and the source cleared, so nothing is left
    pointing at a grappler who is no longer holding anybody. */
export const letGo = (roster: Roster, id: string): Roster => setHeld(roster, id, undefined);

/**
 * A shove, a trip or a grapple: one contested roll, and whatever
 * follows.
 *
 * All three modes share this function because they share the contest,
 * the reach, the size rule and the cost. Only the last step differs.
 *
 * The attempt costs the same whether it worked - it replaces one attack
 * of the Attack action, so the pip is spent on the *try*. The three
 * refusals above the contest are mis-clicks rather than attempts, and
 * spend nothing.
 */
export function resolveGrab(
  view: FightView,
  roster: Roster,
  shoverId: string,
  targetId: string,
  mode: GrabMode,
  sight: SightContext,
  rng: Rng = defaultRng,
): Resolution {
  const encounter = view.encounter;
  const shover = encounter.combatants.find((c) => c.id === shoverId);
  const target = encounter.combatants.find((c) => c.id === targetId);
  if (!shover?.at || !target?.at || shover.id === target.id) return nothingHappened(roster);

  const name = combatantName(shover, roster);
  const them = combatantName(target, roster);
  /** What the attempt is called, for the lines that have to name it. */
  const verb = mode === 'grapple' ? 'grapple' : 'shove';

  /** A refusal: said out loud, nothing spent, because nothing was tried. */
  const misclick = (line: string): Resolution => ({
    roster: updateEncounter(roster, appendLog(encounter, line)),
    events: [],
  });

  /** Every ending that *was* an attempt: the pip is spent on the try. */
  const finish = (
    enc: EncounterState,
    then?: (r: Roster) => Roster,
    events: Resolution['events'] = [],
  ): Resolution => {
    let updated = updateEncounter(roster, enc);
    if (then) updated = then(updated);
    if (shover.kind === 'character') {
      const entry = updated.entries.find((e) => e.id === shover.rosterId);
      if (entry) updated = updatePlay(updated, entry.id, setTurnSlot(entry.play, 'action', true));
    }
    return { roster: updated, events };
  };

  if (Math.max(Math.abs(shover.at.x - target.at.x), Math.abs(shover.at.y - target.at.y)) > 1) {
    return misclick(`${name} is not close enough to ${verb} ${them}.`);
  }
  // One size rule, applied to both: the SRD states it once.
  if (!(mode === 'grapple' ? canGrapple : canShove)(sizeOf(view, shover), sizeOf(view, target))) {
    return misclick(`${them} is too big for ${name} to ${verb} — more than one size larger.`);
  }
  // Two hands, one hold: somebody already holding a creature has to let go
  // before grabbing another, which is the honest reading of a rule that
  // costs a free hand.
  const already = mode === 'grapple' ? heldBy(view, shover) : undefined;
  if (already) {
    return misclick(
      `${name} already has hold of ${combatantName(already, roster)} — let go first.`,
    );
  }

  const contest = shoveContest(
    skillBonusFor(view, shover, 'athletics', 'str'),
    skillBonusFor(view, target, 'athletics', 'str'),
    skillBonusFor(view, target, 'acrobatics', 'dex'),
    rng,
  );
  const roll = `Athletics ${contest.shoverRoll} vs ${contest.targetUsed} ${contest.targetRoll}`;

  if (!contest.success) {
    return finish(
      appendLog(
        encounter,
        mode === 'grapple'
          ? `${name} grabs at ${them} — ${roll}: they twist away.`
          : `${name} shoves ${them} — ${roll}: holds firm.`,
      ),
    );
  }

  if (mode === 'grapple') {
    return finish(
      appendLog(encounter, `${name} has hold of ${them} — ${roll}: grappled, speed 0.`),
      (r) => holdOn(r, target.id, shover.id),
    );
  }

  if (mode === 'prone') {
    return finish(appendLog(encounter, `${name} trips ${them} — ${roll}: down they go.`), (r) =>
      knockProne(r, target.id),
    );
  }

  // Pushed five feet directly away. Somewhere solid to land, or they simply
  // stay where they are - a shove into a wall is a shove that went nowhere.
  const to = pushedTo(shover.at, target.at);
  const blocked =
    !walkable(sight, to) ||
    encounter.combatants.some(
      (c) => c.id !== target.id && c.at && c.at.x === to.x && c.at.y === to.y,
    );
  if (blocked) {
    return finish(appendLog(encounter, `${name} shoves ${them} — ${roll}: nowhere to go, they stay put.`));
  }

  const drop = fallFeet(
    elevationAt(encounter.elevation ?? {}, target.at),
    elevationAt(encounter.elevation ?? {}, to),
  );
  let enc = placeCombatant(encounter, target.id, to);
  enc = appendLog(enc, `${name} shoves ${them} five feet back — ${roll}.`);
  // §69: shoved bodies slide - forced movement glides flat, no walking hop.
  const events: Resolution['events'] = target.at
    ? [{ kind: 'walk', id: target.id, route: [target.at, to], slide: true }]
    : [];

  /*
    The drop, if there was one. The feet are said out loud because
    `terrain.ts` keeps height in abstract steps on purpose - a table that
    calls a step five feet rather than ten can halve this, and can only do
    that if it can see the number.
  */
  const dice = fallDamage(drop);
  return finish(
    enc,
    (r) => {
      if (!dice) return r;
      let out = biteZone(
        view,
        r,
        target.id,
        {
          id: `fall-${target.id}`,
          label: `the ${drop} ft drop`,
          shape: 'sphere',
          at: to,
          feet: 5,
          angle: 0,
          tint: 0,
          effect: { damage: { dice, type: 'bludgeoning' } },
        },
        'is caught by',
        rng,
      );
      // The SRD lands a falling creature prone, and it is the part everyone
      // forgets - which is exactly the kind of thing a tool should remember.
      out = knockProne(out, target.id);
      return out;
    },
    events,
  );
}

/**
 * The Escape action: their better of Athletics and Acrobatics against
 * the grappler's Athletics.
 *
 * The action is spent either way, because *trying* is what costs - and a
 * table that could re-roll a failed escape for free would never fail
 * one.
 */
export function escapeGrapple(
  view: FightView,
  roster: Roster,
  c: Combatant,
  rng: Rng = defaultRng,
): Roster {
  const grappler = grapplerOf(view, c);
  if (!grappler) return roster;
  const out = escapeContest(
    skillBonusFor(view, c, 'athletics', 'str'),
    skillBonusFor(view, c, 'acrobatics', 'dex'),
    skillBonusFor(view, grappler, 'athletics', 'str'),
    rng,
  );
  const roll = `${out.escapeeUsed} ${out.escapeeRoll} vs Athletics ${out.grapplerRoll}`;
  let updated = out.success ? letGo(roster, c.id) : roster;
  updated = updateEncounter(
    updated,
    appendLog(
      activeEncounter(updated),
      out.success
        ? `${combatantName(c, roster)} breaks out of ${combatantName(grappler, roster)}'s grip — ${roll}.`
        : `${combatantName(c, roster)} struggles against ${combatantName(grappler, roster)} — ${roll}: still held.`,
    ),
  );
  if (c.kind === 'character') {
    const entry = updated.entries.find((e) => e.id === c.rosterId);
    if (entry) updated = updatePlay(updated, entry.id, setTurnSlot(entry.play, 'action', true));
  }
  return updated;
}

/**
 * Getting up off the floor, which costs feet rather than an action
 * (§65). "Standing up costs an amount of movement equal to half your
 * speed… You can't stand up if you don't have enough movement left or if
 * your speed is 0."
 *
 * Both halves are enforced: the cost is charged against the same budget
 * a step is, and **null** comes back when the budget will not cover it -
 * which is what makes a Trip worth an action, since before this a prone
 * character stood up for free.
 *
 * Monsters pay it too, from the `moved` on their combatant, because a
 * stat block has a speed and the rule is about speed rather than about
 * being a character.
 */
export function standUpFrom(view: FightView, roster: Roster, c: Combatant): Roster | null {
  const speed = speedOf(view, c);
  const cost = standUpCostFor(view, c);
  if (speed === 0 || cost > movementLeftFor(view, c)) return null;

  const encounter = view.encounter;
  let updated = roster;
  if (c.kind === 'monster') {
    const spent = {
      ...encounter,
      combatants: encounter.combatants.map((x) =>
        x.id === c.id && x.kind === 'monster' ? { ...x, moved: (x.moved ?? 0) + cost } : x,
      ),
    };
    updated = updateEncounter(updated, toggleMonsterCondition(spent, c.id, 'prone'));
  } else {
    const entry = roster.entries.find((e) => e.id === c.rosterId);
    if (!entry) return null;
    const play = moveBy(toggleCondition(entry.play, 'prone'), cost, speed);
    updated = updatePlay(updated, entry.id, play);
  }
  return updateEncounter(
    updated,
    appendLog(
      activeEncounter(updated),
      `${combatantName(c, roster)} stands up — ${cost} ft. of movement.`,
    ),
  );
}

/** Letting go, which the SRD makes free: no roll, no action, no
    argument. Null when they are not holding anybody. */
export function releaseGrapple(view: FightView, roster: Roster, c: Combatant): Roster | null {
  const held = heldBy(view, c);
  if (!held) return null;
  const updated = letGo(roster, held.id);
  return updateEncounter(
    updated,
    appendLog(
      activeEncounter(updated),
      `${combatantName(c, roster)} lets go of ${combatantName(held, roster)}.`,
    ),
  );
}

/**
 * Roll Stealth and hide, from either home: the row's Hide button or the
 * command menu's Hide entry. The real bonus from whichever side owns it
 * - the stat block's Stealth skill, or the sheet's.
 *
 * The menu's Hide is the Hide *action* - the roll, the hidden state, the
 * log line and the spent pip all in one write. The row's Hide stays free
 * of the pip: out-of-turn hiding is the DM's business.
 */
export function rollHide(
  view: FightView,
  roster: Roster,
  c: Combatant,
  spendAction = false,
  rng: Rng = defaultRng,
): Roster {
  /*
    Moved verbatim rather than folded into `skillBonusFor`, which looks
    like the same question and is not: that one falls back to the raw
    ability modifier where this one falls back to nothing. Swapping them
    would quietly give every non-proficient character their DEX on a
    hide - defensible as a rule, but a rules change, and this was a move.
  */
  const bonus =
    c.kind === 'monster'
      ? (view.monsterById(c.monsterId)?.skills?.stealth ??
        monsterMod(view.monsterById(c.monsterId)?.scores.dex ?? 10))
      : (view.buildOf(c.rosterId)?.proficiencies.skills.find((s) => s.skill === 'stealth')
          ?.modifier ?? 0);
  const roll = rollD20(bonus, 'normal', rng).total;
  let updated = updateEncounter(
    roster,
    appendLog(
      setHidden(view.encounter, c.id, roll),
      `${combatantName(c, roster)} hides — Stealth ${roll}.`,
    ),
  );
  if (spendAction && c.kind === 'character') {
    const entry = updated.entries.find((e) => e.id === c.rosterId);
    if (entry) updated = updatePlay(updated, entry.id, setTurnSlot(entry.play, 'action', true));
  }
  return updated;
}
