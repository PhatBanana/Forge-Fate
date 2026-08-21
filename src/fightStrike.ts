import {
  appendLog,
  damageMonster,
  recordDamage,
  setDormant,
  setHidden,
  spendMonsterReaction,
} from './encounter';
import type { Combatant, Square } from './encounter';
import { activeEncounter, updateEncounter, updatePlay } from './storage';
import type { Roster } from './storage';
import { concentrationDc, damage, setTurnSlot, spendAmmo } from './play';
import { defaultRng, parseNotation, rollD20, rollDamage } from './engine/dice';
import type { Rng } from './engine/dice';
import { applyDefences } from './engine/defences';
import { exhaustionEffect } from './engine/exhaustion';
import { COVER_AC, lineOfSight } from './engine/sight';
import type { Cover, SightContext } from './engine/sight';
import { describeOdds, oddsFor } from './engine/advantage';
import { grantsUnder, sideOf } from './zones';
import { flanked, heightAdvantage } from './engine/tactics';
import { highGroundBonus } from './houseRules';
import type { HouseRules } from './houseRules';
import { ammunitionCarried } from './engine/inventory';
import { isMelee, singleStrikes } from './engine/strikes';
import { opportunityStrike } from './engine/reactions';
import type { Strike } from './engine/strikes';
import type { LightLevel } from './engine/light';
import { combatantName, hitPointsOf } from './hitPoints';
import {
  conditionsOf,
  defencesOf,
  exhaustionOf,
  rulesetOf,
  saveBonusFor,
  sourcesOf,
  stanceOf,
} from './fightFacts';
import type { FightView } from './fightFacts';
import { canSeeFrom, lightSees } from './fightSight';

/**
 * §115: the swing - the last and largest step of ROADMAP §9.
 *
 * Everything a 5e attack has to ask before a die is thrown, in one
 * place: the target's armour and the cover between them, the ground
 * both are standing on, the high ground if the table counts it, the
 * advantage the conditions on *both* sides add up to, whether either can
 * see the other and whether there is light to see by, the roll, the
 * crit, the resistances, the concentration check the damage forces, the
 * ammunition it spends and the tally it all lands in.
 *
 * It was 290 lines in the middle of the battle screen and it reads
 * thirteen sibling helpers - which is why the review that started this
 * work said extracting it as a *component* would trade one fused region
 * for a thirteen-prop interface. As a rules module taking the fight as
 * an argument it needs three things and a roster.
 *
 * **It was already pure.** Not one setter in the whole function: the
 * animation fires in the thin wrapper above it, and the screen keeps
 * that. So this step is a move rather than a rewrite - which, after two
 * near-misses this session where a rewritten helper changed a rule
 * (§107, §114), was done by scripted substitution and left to the
 * compiler and 2,455 tests to check.
 */

/**
 * What a swing needs of the world beyond the fight itself: the map it is
 * traced across, how dark each square is, and whether this table counts
 * high ground. Separate from `FightView` because the modules below the
 * strike do not need any of it, and widening the view for one caller
 * makes every test fixture pay.
 */
export interface StrikeContext {
  sight: SightContext;
  litAt: (at: Square) => LightLevel;
  houseRules: HouseRules;
}

export function strikesInto(
  view: FightView,
  ctx: StrikeContext,
  updated: Roster,
  who: { name: string; id?: string },
  strikes: Strike[],
  targetRef: Combatant,
  opts?: { spendAction?: boolean },
  rng: Rng = defaultRng,
): Roster {
  const maxOf = (rosterId: string) => view.buildOf(rosterId)?.hp.total ?? 0;
  let enc = activeEncounter(updated);
  // Re-read both ends off the roster we were handed: a walk composed just
  // before this one is already in it, and the old objects are stale.
  const target = enc.combatants.find((c) => c.id === targetRef.id) ?? targetRef;
  const targetName = combatantName(target, view.roster);
  const targetAc =
    target.kind === 'monster'
      ? view.monsterById(target.monsterId)?.ac
      : view.buildOf(target.rosterId)?.ac.total;
  if (targetAc === undefined) return updated;

  // Cover the way 12.4 computes it, when both ends stand on the map: half
  // cover is +2 AC, said in the log so the ruling is visible. Flanking and
  // high ground ride the same parenthesis - noted, never applied.
  const attacker = who.id ? enc.combatants.find((c) => c.id === who.id) : undefined;
  const attackerAt = attacker?.at;
  const cover: Cover =
    attackerAt && target.at
      ? lineOfSight(ctx.sight, attackerAt, target.at).cover
      : 'none';
  /*
    The ground both of them are standing on. A paladin's aura raises the
    target's AC; standing somewhere that steadies your hand raises the
    roll. Both are the same `grants` field read from two squares.
  */
  const targetGround = grantsUnder(enc.zones, target.at, sideOf(target.kind));
  const attackerGround = attacker
    ? grantsUnder(enc.zones, attackerAt, sideOf(attacker.kind))
    : { toHit: 0, notes: [] as string[] };
  const effectiveAc = targetAc + COVER_AC[cover] + targetGround.ac;
  /*
    High ground, applied only if the table said so. The steps come from the
    one function that decides who is uphill; whether they are worth anything
    is `ctx.houseRules`. The log says which - "(high ground +2)" when it counts,
    "(high ground)" when it is merely noticed - so a player reading back can
    always tell what the dice actually faced.
  */
  const uphill =
    attackerAt && target.at
      ? heightAdvantage(enc.elevation ?? {}, attackerAt, target.at)
      : 0;
  const highGround = highGroundBonus(ctx.houseRules, uphill);

  /*
    Advantage, at last actually rolled. This app has announced "unseen
    attacker — advantage" since §19.3 and rolled a straight die every time,
    and §26.2 made it worse by creating prone that nothing read. The odds
    come from the conditions on both sides plus how far apart they are,
    since prone helps in reach and hinders beyond it.
  */
  const odds = oddsFor({
    attacker: {
      conditions: attacker ? conditionsOf(view, attacker) : [],
      hidden: attacker?.hidden !== undefined,
      ...(attacker ? { conditionSources: sourcesOf(view, attacker) } : {}),
      ...(attacker ? { exhaustion: exhaustionOf(view, attacker) } : {}),
    },
    // Which edition decides what that exhaustion does: disadvantage in
    // 2014, a flat penalty in 2024 that is applied to the bonus instead.
    ...(attacker ? { ruleset: rulesetOf(view, attacker) } : {}),
    // Dodging is the target's own doing rather than something done to them,
    // which is why it rides beside the conditions instead of inside them.
    target: { conditions: conditionsOf(view, target), dodging: stanceOf(view, target) === 'dodge' },
    ...(attacker ? { canSee: canSeeFrom(view, ctx.sight, attacker) } : {}),
    /*
      The dark, both ways round: disadvantage swinging at what you cannot
      see, advantage on somebody who cannot see you, and in mutual darkness
      the two cancel to a straight roll. Both halves are omitted rather than
      guessed at when either side is off the map, which leaves the rule
      unapplied rather than applied wrongly.
    */
    ...(attacker && attackerAt && target.at
      ? {
          attackerSeesTarget: lightSees(view, attacker, target.at, ctx.litAt),
          targetSeesAttacker: lightSees(view, target, attackerAt, ctx.litAt),
        }
      : {}),
    adjacent:
      !attackerAt || !target.at
        ? true
        : Math.max(Math.abs(attackerAt.x - target.at.x), Math.abs(attackerAt.y - target.at.y)) <= 1,
  });
  const oddsNote = describeOdds(odds);

  const rulings = [
    cover === 'none' ? '' : `${cover === 'half' ? 'half' : 'three-quarters'} cover +${COVER_AC[cover]}`,
    attacker && attackerAt && target.at && target.kind !== attacker.kind &&
    flanked(
      attackerAt,
      target.at,
      enc.combatants
        .filter(
          (ally) =>
            ally.kind === attacker.kind &&
            ally.id !== attacker.id &&
            ally.at &&
            (hitPointsOf(ally, updated, maxOf)?.now ?? 0) > 0,
        )
        .map((ally) => ally.at!),
    )
      ? 'flanked'
      : '',
    uphill > 0 ? (highGround ? `high ground +${highGround}` : 'high ground') : '',
    targetGround.ac ? `+${targetGround.ac} AC from the ground` : '',
    attackerGround.toHit ? `+${attackerGround.toHit} to hit from the ground` : '',
    ...targetGround.notes,
    // Replaces a hand-written "unseen attacker — advantage" that was never
    // rolled. This one names every circumstance, including the ones that
    // cancelled, and the die that follows is the die it describes.
    oddsNote,
  ].filter(Boolean);
  const ruling = rulings.length ? ` (${rulings.join(', ')})` : '';

  let totalDamage = 0;
  /*
    Whether any attack in this volley crit, which only matters if the target
    is already down: a critical hit on a creature at 0 hit points is *two*
    death save failures rather than one, and the app applied one either way
    until §48 checked. Tracked across the loop because a Fighter's three
    attacks resolve as one damage write.
  */
  let anyCrit = false;
  const lines: string[] = [];
  /*
    What the defences had to say, gathered once rather than repeated per
    swing - a dragon's three claws against one resistance is one sentence.
  */
  const rulingNotes = new Set<string>();

  /*
    2024's exhaustion is a flat penalty rather than disadvantage, so it goes
    into the bonus rather than into `odds.mode`. `circumstances` deliberately
    leaves it alone under 2024 - asking both would apply it twice.
  */
  const wornDown = attacker
    ? exhaustionEffect(exhaustionOf(view, attacker), rulesetOf(view, attacker)).d20Penalty
    : 0;
  if (wornDown) rulingNotes.add(`exhaustion −${wornDown} to the roll`);

  for (const strike of strikes) {
    const d20 = rollD20(
      strike.toHit + highGround + attackerGround.toHit - wornDown,
      odds.mode,
      rng,
    );
    const natural = d20.rolls[d20.kept] ?? d20.rolls[0];
    const crit = natural === 20;
    const hit = natural !== 1 && (crit || d20.total >= effectiveAc);

    if (!hit) {
      lines.push(
        `${who.name} — ${strike.label} ${d20.total} vs AC ${effectiveAc}${ruling}: miss.`,
      );
      continue;
    }
    let dealt = 0;
    const parts: string[] = [];
    for (const part of strike.damage) {
      const parsed = parseNotation(part.dice);
      if (!parsed) continue;
      const rolled = rollDamage(parsed, crit, rng);
      /*
        Through the target's defences, per damage part - a strike that deals
        slashing and fire against something that only resists fire has to
        split, which is why this is inside the loop rather than applied to
        the total.
      */
      const through = applyDefences(
        rolled.total,
        { type: part.type.toLowerCase(), magical: strike.magical },
        defencesOf(view, target),
      );
      dealt += through.dealt;
      parts.push(
        through.dealt === rolled.total
          ? `${rolled.total} ${part.type}`
          : `${rolled.total} → ${through.dealt} ${part.type}`,
      );
      for (const note of through.notes) rulingNotes.add(note);
    }
    totalDamage += dealt;
    if (crit && dealt > 0) anyCrit = true;
    lines.push(
      `${who.name} — ${strike.label} ${d20.total} vs AC ${effectiveAc}${ruling}: ${crit ? 'CRIT, ' : 'hit, '}${parts.join(' + ')} to ${targetName}.`,
    );
  }

  // Damage into whichever store owns it; the log onto the fight; the
  // score onto the tally - kill marked when this blow is what dropped them.
  const hpBefore = hitPointsOf(target, updated, maxOf)?.now ?? 0;
  if (target.kind === 'monster' && totalDamage > 0) {
    enc = damageMonster(enc, target.id, totalDamage);
  }
  if (totalDamage > 0) {
    // Capped at what actually came off: overkill pads no one's report.
    enc = recordDamage(enc, {
      by: who.id,
      to: target.id,
      amount: Math.min(totalDamage, hpBefore),
      downed: hpBefore > 0 && hpBefore - totalDamage <= 0,
    });
  }
  // Attacking gives you away, hit or miss - the swing is the reveal. And
  // an attack on a dormant monster is the loudest possible introduction.
  if (attacker?.hidden !== undefined) {
    enc = appendLog(
      setHidden(enc, attacker.id, undefined),
      `${who.name} attacks from hiding and is revealed.`,
    );
  }
  if (target.kind === 'monster' && target.dormant) {
    enc = appendLog(setDormant(enc, target.id, false), `${targetName} activates!`);
  }
  if (rulingNotes.size) {
    enc = appendLog(enc, `${targetName} — ${[...rulingNotes].join('; ')}.`);
  }
  for (const line of lines.reverse()) enc = appendLog(enc, line);
  // The concentration reminder rides with the damage, because that is the
  // moment the rule fires: CON save, DC 10 or half the damage.
  /*
    Concentration, rolled rather than announced. The DC has been printed
    correctly since §2.8 and nobody ever made the save: the spell stayed up
    through any amount of punishment unless the DM remembered by hand.
  */
  let concentrationBroken: string | null = null;
  if (target.kind === 'character' && totalDamage > 0) {
    const entry = updated.entries.find((e) => e.id === target.rosterId);
    if (entry?.play.concentratingOn) {
      const dc = concentrationDc(totalDamage);
      const bonus = saveBonusFor(view, target, 'con') ?? 0;
      const roll = rollD20(bonus, 'normal', rng).total;
      const held = roll >= dc;
      enc = appendLog(
        enc,
        `${targetName} — CON save ${roll} vs DC ${dc} to hold ${entry.play.concentratingOn}: ${
          held ? 'holds' : 'LOST'
        }.`,
      );
      if (!held) concentrationBroken = entry.id;
    }
  }
  let next = updateEncounter(updated, enc);
  if (target.kind === 'character' && totalDamage > 0) {
    const entry = next.entries.find((e) => e.id === target.rosterId);
    const max = view.buildOf(target.rosterId)?.hp.total ?? 0;
    if (entry) next = updatePlay(next, entry.id, damage(entry.play, totalDamage, max, anyCrit));
  }
  // The spell drops in the same write as the damage that broke it.
  if (concentrationBroken) {
    const entry = next.entries.find((e) => e.id === concentrationBroken);
    if (entry) next = updatePlay(next, entry.id, { ...entry.play, concentratingOn: undefined });
  }
  /*
    Arrows. §2.3 gave the sheet a quiver and the battle screen never took
    anything out of it, so a fighter could loose forty shots from an empty
    one. One per swing that fires, in the same composed write as the dice.
  */
  if (attacker?.kind === 'character') {
    const fired = strikes.filter((s) => s.ammo);
    if (fired.length) {
      const entry = next.entries.find((e) => e.id === attacker.rosterId);
      const stacks = entry ? ammunitionCarried(entry.build) : [];
      if (entry) {
        let play = entry.play;
        for (const strike of fired) {
          const stack = stacks.find((s) => s.gearId === strike.ammo);
          if (stack) play = spendAmmo(play, stack.gearId, stack.total);
        }
        if (play !== entry.play) next = updatePlay(next, entry.id, play);
      }
    }
  }

  // A token-click attack is taking the Attack action: the pip rides the
  // same write as the dice - two onChange calls would erase each other.
  if (opts?.spendAction && attacker?.kind === 'character') {
    const entry = next.entries.find((e) => e.id === attacker.rosterId);
    if (entry) next = updatePlay(next, entry.id, setTurnSlot(entry.play, 'action', true));
  }
  return next;
  }

/** Everything they can swing, either side of the table, for the
    questions that are about reach rather than about choosing. */
export function allStrikesFor(
  view: FightView,
  c: Combatant,
  strikesForCharacter: (c: Combatant) => Strike[],
): Strike[] {
  if (c.kind !== 'monster') return strikesForCharacter(c);
  const monster = view.monsterById(c.monsterId);
  return monster ? singleStrikes(monster) : [];
}

/**
 * The one attack they get for reacting.
 *
 * One, and melee - an opportunity attack is a single melee attack, never
 * a Multiattack, and a dragon reacting with its whole routine would be
 * the biggest damage bug this app could ship. A character takes their
 * main hand, which is the first line the sheet lists.
 */
export function opportunitySwing(
  view: FightView,
  c: Combatant,
  strikesForCharacter: (c: Combatant) => Strike[],
): Strike[] {
  if (c.kind === 'monster') {
    const monster = view.monsterById(c.monsterId);
    return monster ? opportunityStrike(monster) : [];
  }
  const melee = strikesForCharacter(c).filter(isMelee);
  return melee.length ? [melee[0]] : [];
}

/** Spend the reaction, composed onto the given roster rather than
    written - so an opportunity attack lands in one write with its own
    damage. */
export function spendReactionOf(target: Roster, c: Combatant): Roster {
  if (c.kind === 'monster') {
    return updateEncounter(target, spendMonsterReaction(activeEncounter(target), c.id));
  }
  const entry = target.entries.find((e) => e.id === c.rosterId);
  return entry ? updatePlay(target, entry.id, setTurnSlot(entry.play, 'reaction', true)) : target;
}
