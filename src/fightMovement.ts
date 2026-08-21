import { speedAfterExhaustion } from './engine/exhaustion';
import { speedUnderConditions } from './engine/advantage';
import { movementFor, standUpCost } from './engine/movement';
import { dragSpeed } from './engine/grapple';
import { walkMap } from './engine/path';
import type { Walk, Walker } from './engine/path';
import type { SightContext } from './engine/sight';
import { bitesOnEnter, sideOf, zoneReaches, zoneSquareKeys } from './zones';
import type { Zone } from './zones';
import { emptyPlay, movementLeft } from './play';
import { hitPointsOf } from './hitPoints';
import { conditionsOf, exhaustionOf, heldBy, maxHpOf, rulesetOf, sizeOf } from './fightFacts';
import type { FightView } from './fightFacts';
import type { Combatant } from './encounter';

/**
 * §112: how far somebody can get, and what the ground charges them.
 *
 * Speed had been spread across five places - the play state's budget,
 * the exhaustion ladder, the advantage engine's condition rule,
 * `engine/movement`'s grants, and the battle screen's own reconciliation
 * of all four, which carried a comment apologising for it. This is the
 * one place that asks now, which is the third step of ROADMAP §9 and the
 * reason it was worth doing on its own merits.
 *
 * **The order the rules apply in is itself the rule**, and it is stated
 * once here rather than rediscovered: a surprised creature has no
 * movement at all; six conditions say speed nought; exhaustion halves it
 * from rung two and stops it at five; and hauling somebody costs half of
 * whatever is left, unless they are two sizes smaller and weigh nothing
 * worth counting.
 *
 * What stayed in the screen: the wash of reachable tiles, because that
 * is the *armed tool's* readout rather than a fact about the fight - it
 * asks whether a tool is in hand and whose turn it is, which is UI.
 */

/** What this creature does with climbing, swimming and being prone -
    the pathfinder's view of a body (§65). */
export function walkerOf(view: FightView, c: Combatant): Walker {
  const prone = conditionsOf(view, c).includes('prone');
  if (c.kind === 'monster') {
    const speed = view.monsterById(c.monsterId)?.speed ?? {};
    return { climbFree: (speed.climb ?? 0) > 0, swimFree: (speed.swim ?? 0) > 0, prone };
  }
  const ctx = view.buildOf(c.rosterId);
  if (!ctx) return { prone };
  const profile = movementFor(ctx);
  return { climbFree: profile.climbFree, swimFree: profile.swimFree, prone };
}

/**
 * A combatant's speed in feet, from whichever side owns it, with every
 * rule that reduces it applied in order.
 */
export function speedOf(view: FightView, c: Combatant): number {
  const base =
    c.kind === 'monster'
      ? (view.monsterById(c.monsterId)?.speed.walk ?? 30)
      : (view.buildOf(c.rosterId)?.speed.total ?? 30);
  /*
    Ambushed: "you can't move or take an action on your first turn". The
    action and the bonus are spent when the turn begins; the movement is
    refused here, because this is the one function the walk, the wash and
    the ruler all price themselves from.
  */
  if (c.surprised) return 0;
  /*
    Nought, if any of the six conditions that say so is on them. Grappled
    and restrained say "speed 0" outright; stunned, paralysed, petrified
    and unconscious say "can't move", which is the same sentence. Every
    one of them was decorative until §39.
  */
  const stopped = speedUnderConditions(base, conditionsOf(view, c));
  // Exhaustion halves it from level two and stops it at five - the two
  // rungs that are a movement question rather than a roll.
  const walking = speedAfterExhaustion(stopped, exhaustionOf(view, c), rulesetOf(view, c));
  // Hauling somebody costs half your pace, unless they are two or more
  // sizes smaller, in which case they weigh nothing worth counting.
  const dragging = heldBy(view, c);
  return dragging ? dragSpeed(walking, sizeOf(view, c), sizeOf(view, dragging)) : walking;
}

/** What is left of somebody's movement this turn, from whichever side
    owns the tally. */
export function movementLeftFor(view: FightView, c: Combatant): number {
  const speed = speedOf(view, c);
  if (c.kind === 'monster') return Math.max(0, speed - (c.moved ?? 0));
  const play = view.roster.entries.find((e) => e.id === c.rosterId)?.play ?? emptyPlay();
  return movementLeft(play, speed);
}

/** What standing up costs: half their speed, or five feet for somebody
    carrying the grant that says so. */
export function standUpCostFor(view: FightView, c: Combatant): number {
  const speed = speedOf(view, c);
  if (c.kind === 'character') {
    const ctx = view.buildOf(c.rosterId);
    if (ctx) return standUpCost(speed, movementFor(ctx).quickStand);
  }
  return standUpCost(speed);
}

/**
 * The two tiers of "can I get there this turn": what plain movement
 * covers, and what a Dash adds. A DM wants both at a glance, which is
 * why the wash has two.
 */
export function walkBudget(view: FightView, c: Combatant | null): { base: number; dash: number } {
  if (!c) return { base: 0, dash: 0 };
  const speed = speedOf(view, c);
  if (c.kind === 'character') {
    const play = view.roster.entries.find((e) => e.id === c.rosterId)?.play ?? emptyPlay();
    const left = movementLeft(play, speed);
    // A Dash adds the full speed to the budget, whatever is left of it.
    return { base: left, dash: left + speed };
  }
  // Monsters spend the same resource: what is walked this turn is on the
  // combatant, and a Dash offers one more speed's worth on top.
  const spent = c.moved ?? 0;
  return { base: Math.max(0, speed - spent), dash: Math.max(0, speed * 2 - spent) };
}

export interface ZoneOverlays {
  blocked: Set<string>;
  difficult: Set<string>;
  difficultFor: (side: 'party' | 'monsters') => Set<string>;
  hazard: Set<string>;
}

/**
 * What the standing zones do to the ground, as the key sets the
 * pathfinder eats: a wall of force is a wall, a web is deep ground, a
 * wall of fire is somewhere a route would rather not go.
 */
export const zoneOverlays = (zones: Zone[] | undefined): ZoneOverlays => ({
  blocked: zoneSquareKeys(zones, (z) => Boolean(z.effect?.blocks)),
  difficult: zoneSquareKeys(zones, (z) => Boolean(z.effect?.difficult)),
  // The same ground, filtered to the side it actually slows - Spirit
  // Guardians is deep going for the goblins and open floor for the party.
  difficultFor: (side) =>
    zoneSquareKeys(zones, (z) => Boolean(z.effect?.difficult) && zoneReaches(z, side)),
  hazard: zoneSquareKeys(zones, bitesOnEnter),
});

/**
 * One walk serves three masters: the wash, the click's price and the
 * ruler - so it runs the whole map uncapped, and the budget is applied
 * by whoever is asking. Null for somebody off the board or at nought.
 *
 * Walked, not radiused: a Chebyshev circle offers the far side of a wall
 * at five feet, and people cannot go through walls (typically).
 */
export function walkFor(
  view: FightView,
  sight: SightContext,
  c: Combatant | null,
  overlays: ZoneOverlays,
): Walk | null {
  if (!c?.at) return null;
  const hp = hitPointsOf(c, view.roster, maxHpOf(view));
  if (!hp || hp.now === 0) return null;
  return walkMap(
    sight,
    c.at,
    Infinity,
    { blocked: overlays.blocked, difficult: overlays.difficultFor(sideOf(c.kind)) },
    walkerOf(view, c),
  );
}

/**
 * The same walk with the hazards off the table entirely - the route a
 * sane walker takes. Preferring this map when its price fits the budget
 * is what "pathing avoids the fire when movement allows" means; when
 * only the burning shortcut fits, the ordinary map answers and the fire
 * bites.
 */
export function safeWalkFor(
  view: FightView,
  sight: SightContext,
  c: Combatant | null,
  overlays: ZoneOverlays,
  walk: Walk | null,
): Walk | null {
  if (!walk || !c?.at || overlays.hazard.size === 0) return walk;
  return walkMap(
    sight,
    c.at,
    Infinity,
    {
      blocked: overlays.blocked,
      difficult: overlays.difficultFor(sideOf(c.kind)),
      avoid: overlays.hazard,
    },
    walkerOf(view, c),
  );
}

/**
 * How far every square is from the party, by walking.
 *
 * One sweep seeded from every living character at once, so each square
 * holds its distance to the nearest of them. This is what a monster with
 * nobody in reach uses to decide which way to run, and it has to be a
 * walk: a goblin against the west wall of its room is the same
 * straight-line distance from a party to the west wherever inside the
 * room it steps, so a straight-line answer would have it stand there for
 * the whole fight. The door is the way out, and only a walk knows where
 * the door is.
 *
 * Hazards are not avoided here - this is "which way is the fight", not
 * "which way should I step". The step itself is still priced by
 * `routeChoice`, which does prefer the unburned route.
 */
export function partyApproach(
  view: FightView,
  sight: SightContext,
  overlays: ZoneOverlays,
): Walk | null {
  const sources = view.encounter.combatants
    .filter(
      (c) => c.kind === 'character' && c.at && (hitPointsOf(c, view.roster, maxHpOf(view))?.now ?? 0) > 0,
    )
    .map((c) => c.at!);
  if (!sources.length) return null;
  // Seeded from the party but walked by a monster, so the ground is
  // priced the way the monster will experience it.
  return walkMap(sight, sources, Infinity, {
    blocked: overlays.blocked,
    difficult: overlays.difficultFor('monsters'),
  });
}

/** The price to a square - the unburned route when the budget allows it,
    the short one otherwise - and which walk that price came from. */
export function routeChoice(
  key: string,
  walk: Walk | null,
  safe: Walk | null,
  budget: { dash: number },
): { cost: number; via: Walk } | null {
  if (!walk || !safe) return null;
  const around = safe.cost.get(key);
  if (around !== undefined && around <= budget.dash) return { cost: around, via: safe };
  const through = walk.cost.get(key);
  if (through === undefined) return null;
  return { cost: through, via: walk };
}
