import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Monster } from '../data/monsters';
import { formatCr, legendaryCost, monsterMod, monsterSummary, parseUsage, searchMonsters } from '../data/monsters';
import { isCustom, mergeBestiary } from '../bestiary';
import { useMonsters } from './useMonsters';
import { elevationAt, keyOf } from '../terrain';
import { lineOfSight, walkable } from '../engine/sight';
import { routeTo, walkMap } from '../engine/path';
import type { Walk } from '../engine/path';
import {
  ZONE_PRESETS,
  ZONE_SHAPES,
  bitesOnEndTurn,
  bitesOnEnter,
  combatantsIn,
  grantsUnder,
  hazardsCrossed,
  inZone,
  removeZone,
  sideOf,
  tickZones,
  zoneReaches,
  zoneSquareKeys,
  zoneSquares,
} from '../zones';
import type { Zone, ZoneEffect, ZoneShape } from '../zones';
import { simulate } from '../engine/simulate';
import { makeRng } from '../engine/dungeon';
import { planDeployment } from '../engine/deploy';
import { applyDungeon, loadDungeons } from '../dungeons';
import { loadEncounters, loadIntoPlay, putEncounter, removeEncounter, saveEncounters } from '../encounters';
import type { Roster } from '../storage';
import { activeEncounter, updateEncounter, updatePlay } from '../storage';
import type { Combatant } from '../encounter';
import {
  addCharacter,
  addMonster,
  currentCombatant,
  damageMonster,
  emptyEncounter,
  endEncounter,
  isRunning,
  nextTurn,
  removeCombatant,
  rollMonsterInitiative,
  setInitiative,
  setMonsterHp,
  sortCombatants,
  placeCombatant,
  recordDamage,
  setDormant,
  setHidden,
  setConditionSource,
  CONDITIONS_WITH_A_SOURCE,
  toggleMonsterCondition,
  addTimedMonsterCondition,
  appendLog,
  delayTurn,
  setMonsterRecharge,
  spendLegendary,
  spendMonsterMovement,
  spendMonsterReaction,
  setMonsterStance,
  spendMonsterUse,
  tickMonsterConditions,
} from '../encounter';
import type { EncounterState, Square } from '../encounter';
import { placeZone } from '../surfaces';
import { canShove, fallDamage, fallFeet, pushedTo, shoveContest } from '../engine/shove';
import { applyDefences } from '../engine/defences';
import { describeOdds, mayApproach, mayAttack, oddsFor, speedUnderExhaustion } from '../engine/advantage';
import { ammunitionCarried } from '../engine/inventory';
import { heldResources, rechargeFor } from '../engine/resources';
import { describeSpoils, spoilsFor } from '../engine/spoils';
import type { Defences } from '../engine/defences';
import { HOUSE_RULE_INFO, highGroundBonus, loadHouseRules, saveHouseRules } from '../houseRules';
import type { HouseRules } from '../houseRules';
import { SURFACE_KINDS } from '../zones';
import type { SurfaceKind } from '../zones';
import { deriveBuild } from '../engine/character';
import { forecast } from '../engine/forecast';
import { concentrationDc, damage, dash, emptyPlay, heal, hpNow, moveBy, movementLeft, awardXp, longRest, newTurn, setTurnSlot, shortRest, tickConditions, toggleCondition, spendAmmo, applyDeathSaveRoll } from '../play';
import { defaultRng, expectedTotal, parseNotation, rollD20, rollDamage, rollNotation } from '../engine/dice';
import { CONDITIONS, CONDITIONS_BY_ID } from '../data/conditions';
import { damageDice } from '../data/weapons';
import { hitChance } from '../engine/dpr';
import { flanked, heightAdvantage } from '../engine/tactics';
import { visibleFrom } from '../engine/fog';
import { Panel } from './shared';
import { MonsterCard } from './MonsterCard';
import { PopOut } from './PopOut';
import { Workspace } from './Workspace';
import { PlayCard } from './PlayCard';
import { InitiativeStrip } from './InitiativeStrip';
import { MonsterCommandMenu } from './MonsterTray';
import type { Strike } from './MonsterTray';
import { isMelee, routineOptions, singleStrikes } from '../engine/strikes';
import { meleeReach, opportunityStrike, provokedBy } from '../engine/reactions';
import { planTurn } from '../engine/enemyTurn';
import type { Actor } from '../engine/enemyTurn';
import { DungeonMap } from './DungeonMap';
import type { Token } from './DungeonMap';
import { IsoMap } from './IsoMap';
import { DEFAULT_SEED, MAP_SIZES, generateDungeon } from '../engine/dungeon';
import { CharacterSheet } from './CharacterSheet';

/**
 * The DM's screen: who is in the fight, whose turn it is, and what is left of
 * everybody.
 *
 * ## One copy of every number
 *
 * A player character here is a row over their *own* roster entry. Their hit
 * points are read with `hpNow` from the `PlayState` their sheet uses and
 * written back with `damage`/`heal` through `updatePlay`, so the number on the
 * DM's screen and the number on the player's sheet are the same number rather
 * than two that have to be reconciled. Monsters have no sheet, so their hit
 * points live on the combatant.
 *
 * ## Advancing a turn does what the rules do
 *
 * "Next" moves the pointer and, when the turn that begins belongs to a
 * character, calls `newTurn` on their play state - which gives back their
 * action, bonus action, reaction and movement. That is the rule the sheet's
 * turn tracker already encodes; here it happens at the moment the rules say it
 * does, rather than when somebody remembers to press it.
 */

/**
 * The map every session starts on, until somebody asks for another.
 *
 * A fixed seed rather than a random one, so the map does not change under a DM
 * who reloads the page - and so two people opening the app cold see the same
 * thing when they are talking about it. DEFAULT_SEED and MAP_SIZES live with
 * the generator now, shared with the Dungeons tab so the two cannot drift.
 */

/**
 * What to say when a combatant's stat block is not there.
 *
 * Two different situations that used to read as one. The bestiary is fetched,
 * so a block is genuinely absent for the first moment of a session - but a
 * *saved* monster can also be deleted while it is still standing in a fight,
 * and "still loading…" would then sit there for ever, describing a wait that
 * had already finished. The hit points on the row keep working either way,
 * because a monster's live in the encounter rather than in the stat block.
 */
/** The win rate in a DM's words. Bands, not precision - it is 200 runs. */
const balanceWord = (winRate: number): string =>
  winRate >= 0.95
    ? 'a walkover'
    : winRate >= 0.8
      ? 'comfortable'
      : winRate >= 0.55
        ? 'a real fight'
        : winRate >= 0.3
          ? 'desperate'
          : 'a likely wipe';

const missingBlock = (loading: boolean) =>
  loading ? 'Stat block still loading…' : 'No stat block — deleted from your bestiary?';

export function TableTab({
  roster,
  onChange,
  bestiary,
  ruleset,
}: {
  roster: Roster;
  onChange: (roster: Roster) => void;
  /** Monsters you made, from their own store. See `src/bestiary.ts`. */
  bestiary: Monster[];
  ruleset: string;
}) {
  const { monsters: srd, loading } = useMonsters();

  /*
    One list, yours first.

    The workshop is under Characters, but a fight is no time to change tabs -
    so the search box here covers both stores and a monster you saved last week
    is one keystroke away, sitting above the block you made it from.
  */
  const monsters = useMemo(() => mergeBestiary(bestiary, srd), [bestiary, srd]);
  const [query, setQuery] = useState('');
  const [rollHp, setRollHp] = useState(false);
  /*
    Which combatant is popped out, by combatant id.

    One at a time. A DM juggling six floating windows has recreated the problem
    the tracker was meant to solve, and the row they want is always the one
    whose turn it is.
  */
  const [popped, setPopped] = useState<string | null>(null);
  /*
    Which combatant the right rail is showing.

    Held rather than derived, because "whose turn it is" and "who I am looking
    at" are different questions - a DM checks the Wizard's hit points on the
    Fighter's turn, and a rail that snapped back to the active combatant every
    time the turn advanced would be unusable for exactly that.

    It falls back to whoever is up when nothing is chosen, so the rail is never
    empty during a fight without somebody having emptied it.
  */
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /** Draw sight lines from whoever is selected. Off by default: lines are for
      the question "who can the archer hit", not for all the time. */
  const [showSight, setShowSight] = useState(false);
  /*
    Which camera. The top-down map is the truth - it prints - and the
    tactical view is the same battlefield through FFT's lens. The brushes
    live in the Dungeons tab now; Play only looks at the ground.
  */
  const [view, setView] = useState<'map' | 'tactical'>('map');
  /** The tactical camera's facing, quarter turns - FFT's L1/R1. */
  const [facing, setFacing] = useState(0);

  /*
    A spell being placed: what it is, waiting for where. Aimed shapes take two
    clicks - origin, then the way it points - so `aimFrom` holds the first.
  */
  const [placing, setPlacing] = useState<{
    label: string;
    shape: ZoneShape;
    feet: number;
    rounds?: number;
    effect?: ZoneEffect;
  } | null>(null);
  const [aimFrom, setAimFrom] = useState<Square | null>(null);
  const [zoneForm, setZoneForm] = useState({
    label: '',
    shape: 'sphere' as ZoneShape,
    feet: 20,
    rounds: '',
    /** Which shelf recipe is loaded; 'custom' is the blank slate. */
    preset: 'custom',
    /** The save DC typed for a preset that saves; empty takes its default. */
    dc: '',
    /**
     * What the ground is made of, for a custom area. A preset brings its own;
     * this is how somebody drawing "Oil slick" gets it to catch fire like the
     * shelf's grease does. Empty means it reacts to nothing.
     */
    surface: '' as SurfaceKind | '',
  });

  /*
    An attack waiting for its target.

    Set by the trays - a character's "vs" button, a monster's whole action row -
    and resolved by the next click on anybody in the strip or the order. One
    aim at a time; a second aim replaces the first, and Escape-by-clicking-the
    -banner cancels.
  */
  const [aim, setAim] = useState<{
    attacker: string;
    attackerId?: string;
    strikes: Strike[];
  } | null>(null);

  /*
    FFT's explicit Move: in combat, feet are spent only while this is armed,
    and only by the active combatant - a stray click on the map never walks
    anybody. Armed from the command menus' Move entry; sticky through a
    multi-step walk; put down by Escape, by aiming (one tool in hand at a
    time), and when the turn ends. Out of combat, placement clicks stay free
    and need no arming - setup is setup.
  */
  const [moveArmed, setMoveArmed] = useState(false);
  /**
   * A shove waiting for a target: the next click on a combatant resolves the
   * contest. The mode was chosen when it was armed, because the SRD leaves
   * the push-or-floor choice to the shover and asking afterwards would be
   * asking after the dice.
   */
  const [shoving, setShoving] = useState<{ byId: string; mode: 'push' | 'prone' } | null>(null);
  /** The optional rules this table has switched on. Off is the book. */
  const [houseRules, setHouseRules] = useState<HouseRules>(loadHouseRules);
  useEffect(() => saveHouseRules(houseRules), [houseRules]);

  /*
    "Everyone make a DEX save, DC 15" - the call, then the answers, then the
    damage, as three steps in one panel. Results are held until applied or
    re-rolled, so the DM can read them out before anything moves.
  */
  /** The hovered map square, for ghosts and the ruler. */
  const [hover, setHover] = useState<Square | null>(null);
  /** Hit counters per combatant, bumped when damage lands, replaying the flash. */
  const [flashes, setFlashes] = useState<Record<string, number>>({});
  /** The number that floats off a token when its hit points change: "-7"
      rising red, "+5" rising green. Keyed by seq so each change replays. */
  const [floats, setFloats] = useState<
    Record<string, { seq: number; text: string; heal?: boolean }>
  >({});
  /** The FFT phase card: "Goblin A's turn", flashed over the map on advance. */
  const [banner, setBanner] = useState<{ seq: number; text: string } | null>(null);

  const [saveForm, setSaveForm] = useState({ ability: 'dex', dc: 15, damage: '', half: true });
  /** Rounds typed beside the rail-monster condition select. */
  const [monsterRounds, setMonsterRounds] = useState('');

  /*
    The drawer of prepped fights, and the name the next one saves under. Its
    own store - see `encounters.ts` - written through on every change like the
    bestiary is.
  */
  const [library, setLibrary] = useState(loadEncounters);
  useEffect(() => saveEncounters(library), [library]);
  const [prepName, setPrepName] = useState('');

  /*
    The dungeon drawer, read-only from Play: the Dungeons tab writes it, the
    battlefield picker reads it. Loaded once per mount - a DM who saves a map
    mid-session revisits the tab, which remounts this.
  */
  const [dungeonLibrary] = useState(loadDungeons);

  /* Prep filters: "CR 2 to 4, undead" is how the question actually asks. */
  const [crMin, setCrMin] = useState('');
  const [crMax, setCrMax] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [saveResults, setSaveResults] = useState<
    { id: string; name: string; bonus: number; total: number; pass: boolean }[] | null
  >(null);

  const encounter = activeEncounter(roster);
  const setEncounter = (next: typeof encounter) => onChange(updateEncounter(roster, next));

  /*
    Every input to the generator lives on the encounter, because the tokens do.

    The seed learned this first - a seed in component state regenerated the map
    the moment somebody glanced at a character sheet, stranding everyone where
    the old rooms were. The room count had exactly the same bug for two phases
    before it moved here: set it to twelve, refresh, and the map was eight
    rooms again with the tokens standing in the corridors of the old one.
  */
  const seed = encounter.mapSeed ?? DEFAULT_SEED;
  const size = encounter.mapSize ?? 'medium';
  const rooms = encounter.mapRooms ?? 8;
  const dungeon = useMemo(
    () => generateDungeon(seed, { rooms, ...MAP_SIZES[size] }),
    [seed, rooms, size],
  );

  const paintAt = (at: Square) => {
    /*
      A spell being placed claims the click. Aimed shapes take the origin
      first, then the click that points them.
    */
    if (placing) {
      const aimed = ZONE_SHAPES.find((s) => s.shape === placing.shape)?.aimed;
      if (aimed && !aimFrom) {
        setAimFrom(at);
        return;
      }
      const origin = aimed ? aimFrom! : at;
      const angle = aimed ? Math.atan2(at.y - origin.y, at.x - origin.x) : 0;
      dropZone({
        id: `z${encounter.nextSeq}`,
        label: placing.label || 'Effect',
        shape: placing.shape,
        at: origin,
        feet: placing.feet,
        angle,
        rounds: placing.rounds,
        tint: (encounter.zones?.length ?? 0) % 4,
        effect: placing.effect,
      });
      setPlacing(null);
      setAimFrom(null);
      return;
    }
    if (placing || aim) return;
    moveSelected(at);
  };

  /*
    The one move rule, shared by the click and the drag: free before the
    fight, and in combat only the active combatant walks, only with Move
    armed, charged what the walk costs against the budget - the amber tier
    is the Dash, beyond it nothing happens. A refused destination is simply
    no write: the token never left its square.
  */
  const moveSelected = (to: Square) => {
    if (!selected) return;
    // An occupied square belongs to the token on it - the mover's own
    // square excepted, so a drag back across the origin is not "occupied".
    if (
      encounter.combatants.some(
        (c) => c.id !== selected.id && c.at && c.at.x === to.x && c.at.y === to.y,
      )
    ) {
      return;
    }
    if (!walkable(sightContext, to)) return;

    // Before the fight, placement is setup: click a token, click a square,
    // free of any budget - nothing has been spent because nothing has begun.
    if (!isRunning(encounter) || !selected.at) {
      setEncounter(placeCombatant(encounter, selected.id, to));
      return;
    }

    // In initiative, walking is deliberate: the Move command arms it, and
    // only for whoever's turn it is. This is what makes "click the goblin
    // to attack it" safe - the click cannot be mistaken for a walk.
    if (!moveArmed || selected.id !== active?.id) return;

    const next = walkInto(roster, selected, to);
    if (next) onChange(next);
  };

  /**
   * The charged walk, composed onto the given roster and RETURNED - null when
   * the destination is refused.
   *
   * Returning rather than writing is what lets a monster's whole turn reach
   * the store at once: the walk and the routine that follows it are one
   * gesture, and two writes would each build from this render's roster with
   * the second discarding the first - the attack would land from the square
   * the monster had already left.
   *
   * The guards are repeated here rather than trusted to the caller, because
   * this is now reachable from the turn planner as well as from a click, and
   * a plan is only a proposal until this agrees to it.
   */
  const walkInto = (updated: Roster, mover: Combatant, to: Square): Roster | null => {
    const encNow = activeEncounter(updated);
    const self = encNow.combatants.find((c) => c.id === mover.id);
    if (!self?.at) return null;
    if (
      encNow.combatants.some(
        (c) => c.id !== self.id && c.at && c.at.x === to.x && c.at.y === to.y,
      )
    ) {
      return null;
    }
    if (!walkable(sightContext, to)) return null;

    /*
      The other half of frightened, and the more tactical one: a frightened
      creature cannot willingly move closer to what frightened it. Refused as a
      destination rather than logged as a ruling, because unlike the flanking
      note this one has a clear answer - measured in a straight line, since the
      rule is about approaching the thing, not about the route taken.
    */
    if (
      !mayApproach(
        { conditions: conditionsOf(self), conditionSources: sourcesOf(self) },
        self.at,
        to,
        (id) => encNow.combatants.find((c) => c.id === id)?.at,
      )
    ) {
      return null;
    }

    /*
      Charged what the walk costs, not what the crow flies - and the walk
      taken is the one that stays out of the fire when the budget allows,
      the burning shortcut when only it fits. Inside the plain wash it is
      just movement; inside the dash tier the click IS the Dash - the budget
      grows by their speed, a character's action pip goes with it, and the
      log says so. Beyond even that, nothing happens.
    */
    const choice = routeChoice(keyOf(to));
    if (!choice || choice.cost > walkBudget.dash) return null;
    const cost = choice.cost;
    const needsDash = cost > walkBudget.base;
    const route = routeTo(choice.via, self.at, to) ?? [self.at, to];

    /*
      The opportunity attack, taken rather than mentioned.

      Resolved BEFORE the step, because that is when the rule fires - "right
      before the creature leaves your reach" - and because it is the only order
      in which the swing is priced from the square the mover is actually still
      standing on. Prone, cover and the ground all read from there.

      Each swing composes onto the roster the last one returned, so a walk past
      three guards is still one write. The announcement goes in before the dice
      because `appendLog` puts the newest line on top.
    */
    let afterReactions = updated;
    for (const taker of provokedBy(
      {
        id: self.id,
        at: self.at,
        disengaged: stanceOf(self) === 'disengage',
      },
      to,
      encNow.combatants
        .filter((c) => c.kind !== self.kind)
        .map((c) => ({
          id: c.id,
          conditions: conditionsOf(c),
          reactionSpent: reactionSpentOf(c),
          at: c.at,
          hp: hpOf(c)?.now ?? 0,
          reach: meleeReach(allStrikesFor(c)),
        })),
      // Hiding is the other half of not being seen: a rogue who vanished
      // walks out of reach unremarked, which is what the Hide action buys.
      (watcherId) => {
        if (self.hidden !== undefined) return false;
        const watcher = encNow.combatants.find((c) => c.id === watcherId);
        if (!watcher?.at || !self.at) return false;
        return lineOfSight(sightContext, watcher.at, self.at).visible;
      },
    )) {
      const swinger = activeEncounter(afterReactions).combatants.find((c) => c.id === taker.id);
      if (!swinger) continue;
      const strikes = opportunitySwing(swinger);
      if (!strikes.length) continue;
      afterReactions = updateEncounter(
        afterReactions,
        appendLog(
          activeEncounter(afterReactions),
          `${nameOf(self)} leaves ${nameOf(swinger)}'s reach — opportunity attack.`,
        ),
      );
      afterReactions = strikesInto(
        afterReactions,
        { name: nameOf(swinger), id: swinger.id },
        strikes,
        self,
      );
      afterReactions = spendReactionOf(afterReactions, swinger);
    }

    /*
      Dropped on the way out. The step does not happen: a creature at nought
      hit points falls where it stood, and the reactions that put it there are
      already in the write we are about to return.
    */
    const encAfter = activeEncounter(afterReactions);
    const stillUp = encAfter.combatants.find((c) => c.id === self.id);
    if (!stillUp || (hpOf(stillUp)?.now ?? 0) <= 0) return afterReactions;

    updated = afterReactions;
    let enc = placeCombatant(encAfter, self.id, to);
    if (needsDash) enc = appendLog(enc, `${nameOf(self)} Dashes.`);

    let next: Roster;
    if (self.kind === 'character') {
      const entry = updated.entries.find((e) => e.id === self.rosterId);
      if (!entry) return null;
      next = updateEncounter(updated, enc);
      let play = entry.play;
      if (needsDash) play = setTurnSlot(dash(play), 'action', true);
      play = moveBy(play, cost, speedOf(self));
      next = updatePlay(next, entry.id, play);
    } else {
      /*
        The monster pays the same bill: movement is a per-turn resource on
        the combatant itself, reset when its turn comes round again.
      */
      next = updateEncounter(updated, spendMonsterMovement(enc, self.id, cost));
    }

    // The ground settles up: every biting zone the route entered, once each.
    for (const zone of hazardsCrossed(encNow.zones, route)) {
      // Spirit Guardians does not burn the cleric who cast it.
      if (!zoneReaches(zone, sideOf(self.kind))) continue;
      next = biteZone(next, self.id, zone, 'walks into');
    }
    return next;
  };

  const byId = useMemo(() => new Map(monsters.map((m) => [m.id, m])), [monsters]);

  /*
    Derived character state, once per entry rather than once per render of a
    row. `deriveBuild` walks the whole character, and a party of five redoing
    that on every hit point typed would be five walks per keystroke.
  */
  const derived = useMemo(
    () =>
      new Map(
        roster.entries.map((entry) => [
          entry.id,
          { name: entry.build.name || 'Unnamed', ctx: deriveBuild(entry.build) },
        ]),
      ),
    [roster.entries],
  );

  const order = sortCombatants(encounter.combatants);
  const active = currentCombatant(encounter);
  const inFight = new Set(
    encounter.combatants.filter((c) => c.kind === 'character').map((c) => c.rosterId),
  );

  const selected =
    (selectedId ? encounter.combatants.find((c) => c.id === selectedId) : null) ?? active;

  const poppedOut = popped ? encounter.combatants.find((c) => c.id === popped) ?? null : null;
  const poppedEntry =
    poppedOut?.kind === 'character'
      ? roster.entries.find((e) => e.id === poppedOut.rosterId) ?? null
      : null;

  /*
    What this fight will actually do.

    Everything it needs is already computed: each character's damage curve
    across armor class 10 to 25, and each monster's attacks. So this is a read
    rather than a second model - and it is deliberately not an XP-budget
    verdict, because those thresholds are DMG content this project does not
    reproduce. See `engine/forecast.ts`.
  */
  const sides = useMemo(() => {
    const party = encounter.combatants
      .filter((c) => c.kind === 'character')
      .map((c) => {
        const info = derived.get(c.rosterId);
        const entry = roster.entries.find((e) => e.id === c.rosterId);
        if (!info || !entry) return null;
        const max = info.ctx.hp.total;
        return {
          name: info.name,
          ac: info.ctx.ac.total,
          hp: hpNow(entry.play, max),
          dprAt: (ac: number) =>
            info.ctx.dpr.curve.find((point) => point.ac === ac)?.sustained ??
            info.ctx.dpr.sustained,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    const inPlay = encounter.combatants
      .filter((c) => c.kind === 'monster')
      .map((c) => {
        const monster = byId.get(c.monsterId);
        return monster ? { monster, hp: c.hp } : null;
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);

    return { party, monsters: inPlay };
  }, [encounter.combatants, derived, roster.entries, byId]);

  const outlook = useMemo(() => forecast(sides), [sides]);

  /*
    The simulation runs on request rather than continuously: a thousand fights
    is cheap once and silly on every keystroke, and its answer belongs to the
    moment the DM asked, not to whatever the party's hit points drifted to
    since. Cleared whenever the sides change, so a stale distribution can never
    sit beside fresh combatants.
  */
  const [sim, setSim] = useState<ReturnType<typeof simulate>>(null);
  useEffect(() => setSim(null), [sides]);

  /*
    The prep-time dial: a quick 200-run estimate that updates as monsters are
    added, under a fixed seed so the same fight reads the same twice. The XP
    thresholds this replaces are DMG content the app does not carry; this
    number is its own work, and a better one - it knows these characters.
  */
  const quick = useMemo(
    () =>
      sides.party.length && sides.monsters.length
        ? simulate(sides, { trials: 200, rng: makeRng(0xd1ce) })
        : null,
    [sides],
  );

  const found = useMemo(() => {
    let pool = searchMonsters(monsters, query);
    const min = crMin === '' ? null : Number(crMin);
    const max = crMax === '' ? null : Number(crMax);
    if (min !== null) pool = pool.filter((m) => m.cr >= min);
    if (max !== null) pool = pool.filter((m) => m.cr <= max);
    if (typeFilter) pool = pool.filter((m) => m.type === typeFilter);
    return pool.slice(0, 40);
  }, [monsters, query, crMin, crMax, typeFilter]);

  const monsterTypes = useMemo(
    () => [...new Set(monsters.map((m) => m.type))].sort(),
    [monsters],
  );

  /** Hit points for a row, from whichever place owns them. */
  const hpOf = (combatant: Combatant): { now: number; max: number } | null => {
    if (combatant.kind === 'monster') return { now: combatant.hp, max: combatant.maxHp };
    const entry = roster.entries.find((e) => e.id === combatant.rosterId);
    const max = derived.get(combatant.rosterId)?.ctx.hp.total ?? 0;
    return entry ? { now: hpNow(entry.play, max), max } : null;
  };

  const nameOf = (combatant: Combatant): string =>
    combatant.kind === 'monster'
      ? combatant.label
      : derived.get(combatant.rosterId)?.name ?? 'Unknown';

  /** Damage or heal, into whichever store owns the number - and damage from
      the rail's own buttons still lands on the tally, dealer unknown. */
  const applyHp = (combatant: Combatant, amount: number) => {
    const hpBefore = hpOf(combatant)?.now ?? 0;
    const tallied =
      amount > 0 && isRunning(encounter)
        ? recordDamage(encounter, {
            to: combatant.id,
            amount: Math.min(amount, hpBefore),
            downed: hpBefore > 0 && hpBefore - amount <= 0,
          })
        : encounter;
    if (combatant.kind === 'monster') {
      // Pain is an alarm clock: damage wakes a dormant monster.
      const woken =
        amount > 0 && combatant.dormant
          ? appendLog(setDormant(tallied, combatant.id, false), `${combatant.label} activates!`)
          : tallied;
      setEncounter(damageMonster(woken, combatant.id, amount));
      return;
    }
    const entry = roster.entries.find((e) => e.id === combatant.rosterId);
    if (!entry) return;
    const max = derived.get(combatant.rosterId)?.ctx.hp.total ?? 0;
    const play = amount >= 0 ? damage(entry.play, amount, max) : heal(entry.play, -amount, max);
    onChange(updatePlay(updateEncounter(roster, tallied), entry.id, play));
  };

  const sightContext = useMemo(
    () => ({
      dungeon,
      terrain: encounter.terrain ?? {},
      elevation: encounter.elevation ?? {},
    }),
    [dungeon, encounter.terrain, encounter.elevation],
  );

  /*
    Fog of war: what the party can see right now, from their eyes, by the
    same line-of-sight rule attacks and cover already use. Null when the fog
    is off - the map shows everything, as it always has.
  */
  const partyVisible = useMemo(() => {
    if (!encounter.fog) return null;
    const eyes = encounter.combatants
      .filter((c) => c.kind === 'character' && c.at && (hpOf(c)?.now ?? 0) > 0)
      .map((c) => c.at!);
    return visibleFrom(sightContext, eyes, dungeon.width, dungeon.height);
    // hpOf derives from exactly these stores.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounter.fog, encounter.combatants, sightContext, dungeon.width, dungeon.height, roster.entries]);

  /*
    The fog's bookkeeping lives in ONE effect below (memory, activation,
    spotting), because two effects each writing the encounter from their own
    closure would take turns clobbering each other - the same stale-closure
    rule every composed write in this file follows.
  */

  /*
    The fog notices things. Two kinds of noticing, one effect: a dormant
    monster the party can now see activates - the squad-game pod, sprung -
    and somebody hiding gets found the moment a watcher with the passive
    Perception to beat their Stealth has a clear line to them. Both write
    once, with the log saying what happened, and the changed-guard keeps the
    effect from chasing its own writes.
  */
  useEffect(() => {
    if (!encounter.fog || !partyVisible) return;
    let enc = encounter;
    let changed = false;

    // The fog's memory: anything seen joins the explored set, once. On the
    // encounter because what the party has mapped survives a refresh.
    const known = new Set(encounter.explored ?? []);
    const fresh = [...partyVisible].filter((key) => !known.has(key));
    if (fresh.length) {
      enc = { ...enc, explored: [...(enc.explored ?? []), ...fresh] };
      changed = true;
    }

    const watchers = encounter.combatants.filter(
      (c): c is Extract<Combatant, { kind: 'character' }> =>
        c.kind === 'character' && !!c.at && (hpOf(c)?.now ?? 0) > 0,
    );

    for (const c of encounter.combatants) {
      if (c.kind !== 'monster' || !c.at) continue;
      const seen = partyVisible.has(keyOf(c.at));
      if (!seen) continue;
      if (c.hidden !== undefined) {
        const spotter = watchers.find((watcher) => {
          const info = derived.get(watcher.rosterId);
          return (
            !!info &&
            info.ctx.proficiencies.passivePerception >= c.hidden! &&
            lineOfSight(sightContext, watcher.at!, c.at!).visible
          );
        });
        if (spotter) {
          const passive = derived.get(spotter.rosterId)!.ctx.proficiencies.passivePerception;
          enc = appendLog(
            setDormant(setHidden(enc, c.id, undefined), c.id, false),
            `${nameOf(spotter)} notices ${c.label} — passive Perception ${passive} against Stealth ${c.hidden}.`,
          );
          changed = true;
        }
      } else if (c.dormant) {
        enc = appendLog(setDormant(enc, c.id, false), `${c.label} is spotted — it activates!`);
        changed = true;
      }
    }

    // The other direction: a hiding character, found by a monster's ears.
    for (const c of encounter.combatants) {
      if (c.kind !== 'character' || c.hidden === undefined || !c.at) continue;
      const spotter = encounter.combatants.find((m) => {
        if (m.kind !== 'monster' || !m.at || m.dormant || (hpOf(m)?.now ?? 0) === 0) return false;
        const monster = byId.get(m.monsterId);
        const passive =
          monster?.passivePerception ?? (monster ? 10 + monsterMod(monster.scores.wis) : 10);
        return passive >= c.hidden! && lineOfSight(sightContext, m.at!, c.at!).visible;
      });
      if (spotter) {
        enc = appendLog(
          setHidden(enc, c.id, undefined),
          `${nameOf(spotter)} notices ${nameOf(c)} — their hiding place is blown.`,
        );
        changed = true;
      }
    }

    if (changed) setEncounter(enc);
    // derived/hpOf/nameOf derive from these same stores.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounter, partyVisible, sightContext]);

  /** A combatant's speed in feet, from whichever side owns it. */
  /** Exhaustion, which only a character carries - a stat block has no track
      for it, so a monster reads as rested. */
  const exhaustionOf = (c: Combatant): number =>
    c.kind === 'character'
      ? (roster.entries.find((e) => e.id === c.rosterId)?.play.exhaustion ?? 0)
      : 0;

  const speedOf = (combatant: Combatant): number => {
    const base =
      combatant.kind === 'monster'
        ? (byId.get(combatant.monsterId)?.speed.walk ?? 30)
        : (derived.get(combatant.rosterId)?.ctx.speed.total ?? 30);
    // Exhaustion halves it from level two and stops it at five - the two
    // levels that are a movement question rather than a roll.
    return speedUnderExhaustion(base, exhaustionOf(combatant));
  };

  /*
    Where the selected combatant can still get to.

    Chebyshev within what is left of their movement - the same rule the drag
    charges by - minus rock, walls and standing-blocked terrain. For a
    character this doubles as the mis-click guard: a click outside the wash
    does nothing. Monsters track their movement too, on the combatant itself.
  */
  /*
    Walked, not radiused. The first wash was a Chebyshev circle with blocked
    squares removed, which offered the far side of a wall at five feet -
    people cannot go through walls (typically). `reachableFrom` walks the
    grid: walls and rock stop it, difficult ground costs double, corners are
    not cut, and the cost it reports per square is what the click charges.
  */
  /*
    One walk serves three masters: the wash, the click's price, and the ruler.

    The wash has two tiers - what plain movement covers and what a Dash adds -
    because "can I get there this turn" has two answers and a DM wants both at
    a glance. The walk itself runs the whole map, so the ruler can measure a
    route to anywhere the feet could ever go, bends included.
  */
  const walkBudget = useMemo(() => {
    if (!selected) return { base: 0, dash: 0 };
    const speed = speedOf(selected);
    if (selected.kind === 'character') {
      const left = movementLeft(
        roster.entries.find((e) => e.id === selected.rosterId)?.play ?? emptyPlay(),
        speed,
      );
      // A Dash adds the full speed to the budget, whatever is left of it.
      return { base: left, dash: left + speed };
    }
    // Monsters spend the same resource: what's walked this turn is on the
    // combatant, and a Dash offers one more speed's worth on top.
    const spent = selected.moved ?? 0;
    return {
      base: Math.max(0, speed - spent),
      dash: Math.max(0, speed * 2 - spent),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, roster.entries]);

  /*
    What the standing zones do to the ground, as key sets the pathfinder
    eats: a wall of force is a wall, a web is deep ground, a wall of fire is
    somewhere a route would rather not go.
  */
  const zoneOverlays = useMemo(
    () => ({
      blocked: zoneSquareKeys(encounter.zones, (z) => Boolean(z.effect?.blocks)),
      difficult: zoneSquareKeys(encounter.zones, (z) => Boolean(z.effect?.difficult)),
      // The same ground, filtered to the side it actually slows - Spirit
      // Guardians is deep going for the goblins and open floor for the party.
      difficultFor: (side: 'party' | 'monsters') =>
        zoneSquareKeys(
          encounter.zones,
          (z) => Boolean(z.effect?.difficult) && zoneReaches(z, side),
        ),
      hazard: zoneSquareKeys(encounter.zones, bitesOnEnter),
    }),
    [encounter.zones],
  );

  const walk = useMemo(() => {
    if (!selected?.at) return null;
    const hp = hpOf(selected);
    if (!hp || hp.now === 0) return null;
    // Uncapped, so the ruler can measure the long way round the whole map.
    return walkMap(sightContext, selected.at, Infinity, {
      blocked: zoneOverlays.blocked,
      difficult: zoneOverlays.difficultFor(sideOf(selected.kind)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, encounter.combatants, roster.entries, sightContext, zoneOverlays]);

  /*
    The same walk with the hazards off the table entirely - the route a sane
    walker takes. Preferring this map when its price fits the budget is what
    "pathing avoids the fire when movement allows" means; when only the
    burning shortcut fits, the ordinary map answers and the fire bites.
  */
  const walkSafe = useMemo(() => {
    if (!walk || !selected?.at || zoneOverlays.hazard.size === 0) return walk;
    return walkMap(sightContext, selected.at, Infinity, {
      blocked: zoneOverlays.blocked,
      difficult: zoneOverlays.difficultFor(sideOf(selected.kind)),
      avoid: zoneOverlays.hazard,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walk, selected, sightContext, zoneOverlays]);

  /**
   * How far every square is from the party, by walking.
   *
   * One sweep seeded from every living character at once, so each square
   * holds its distance to the nearest of them. This is what a monster with
   * nobody in reach uses to decide which way to run, and it has to be a walk:
   * a goblin against the west wall of its room is the same straight-line
   * distance from a party to the west wherever inside the room it steps, so a
   * straight-line answer would have it stand there for the whole fight. The
   * door is the way out and only a walk knows where the door is.
   *
   * Hazards are not avoided here - this is "which way is the fight", not
   * "which way should I step". The step itself is still priced by
   * `routeChoice`, which does prefer the unburned route.
   */
  const partyApproach = useMemo(() => {
    const sources = encounter.combatants
      .filter((c) => c.kind === 'character' && c.at && (hpOf(c)?.now ?? 0) > 0)
      .map((c) => c.at!);
    if (!sources.length) return null;
    return walkMap(sightContext, sources, Infinity, {
      blocked: zoneOverlays.blocked,
      // Seeded from the party but walked by a monster, so the ground is
      // priced the way the monster will experience it.
      difficult: zoneOverlays.difficultFor('monsters'),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounter.combatants, roster.entries, sightContext, zoneOverlays]);

  /** The price to a square - the unburned route when the budget allows it,
      the short one otherwise - and which walk that price came from. */
  const routeChoice = (key: string): { cost: number; via: Walk } | null => {
    if (!walk || !walkSafe) return null;
    const safe = walkSafe.cost.get(key);
    if (safe !== undefined && safe <= walkBudget.dash) return { cost: safe, via: walkSafe };
    const through = walk.cost.get(key);
    if (through === undefined) return null;
    return { cost: through, via: walk };
  };

  const reach = useMemo((): { at: Square; dash?: boolean }[] => {
    // The glow is the armed tool's readout: lit tiles mean "clicking walks".
    // Unarmed, clicks do not walk, so nothing lights. Each tile is priced by
    // the route that would actually be walked - around the fire when the
    // budget allows, through it when only the shortcut fits.
    if (!walk || !isRunning(encounter) || !moveArmed || selected?.id !== active?.id) return [];
    const out: { at: Square; dash?: boolean }[] = [];
    for (const key of walk.cost.keys()) {
      const choice = routeChoice(key);
      if (!choice || choice.cost > walkBudget.dash) continue;
      const [x, y] = key.split(',').map(Number);
      out.push(choice.cost <= walkBudget.base ? { at: { x, y } } : { at: { x, y }, dash: true });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walk, walkSafe, walkBudget, encounter, moveArmed, selected, active]);

  /**
   * What the monster whose turn it is would do, if it were driving itself.
   *
   * Only ever computed for the *active* monster while the cockpit is showing
   * it - which after End turn it always is, since the pane follows the turn.
   * That is not a shortcut so much as the correct scope: the walk, the budget
   * and the route pricing on this render all belong to `selected`, so a plan
   * for anybody else would be priced from the wrong feet. Click away to
   * inspect a goblin and the proposal steps aside; click back and it returns.
   *
   * It is a proposal and nothing more. Nothing here writes.
   */
  const enemyPlan = useMemo(() => {
    if (!isRunning(encounter) || aim || placing || moveArmed) return null;
    if (active?.kind !== 'monster' || selected?.id !== active.id || !active.at) return null;
    if ((hpOf(active)?.now ?? 0) <= 0 || active.dormant) return null;
    const monster = byId.get(active.monsterId);
    if (!monster || !walk) return null;

    const actors: Actor[] = encounter.combatants.map((c) => ({
      id: c.id,
      name: nameOf(c),
      side: c.kind === 'monster' ? 'foe' : 'party',
      at: c.at,
      hp: hpOf(c)?.now ?? 0,
      ac:
        (c.kind === 'monster' ? byId.get(c.monsterId)?.ac : derived.get(c.rosterId)?.ctx.ac.total) ??
        10,
      /*
        Out of the reckoning: a monster still asleep is not in the fight, and
        somebody who has successfully hidden is not somewhere a plan gets to
        know about. Both are already true of the turn order and the fog; this
        just stops the planner from being cleverer than the goblin.
      */
      out: (c.kind === 'monster' && c.dormant) || c.hidden !== undefined,
    }));

    const candidates: Square[] = [];
    for (const key of walk.cost.keys()) {
      const [x, y] = key.split(',').map(Number);
      candidates.push({ x, y });
    }

    return planTurn({
      self: actors.find((a) => a.id === active.id)!,
      actors,
      options: routineOptions(monster),
      budget: walkBudget,
      // The caller's own pricing, hazards and all: a plan can never route
      // through a wall of fire that the DM's own click would have gone round.
      priceOf: (at) => routeChoice(keyOf(at))?.cost ?? null,
      candidates,
      // Which way the fight is, measured by walking rather than by looking.
      approach: partyApproach ? (at) => partyApproach.cost.get(keyOf(at)) ?? null : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounter, aim, placing, moveArmed, active, selected, byId, derived, walk, walkSafe, walkBudget, partyApproach]);

  /**
   * An exchange of blows, composed onto the given roster and RETURNED.
   *
   * The whole exchange is one roster write - the d20s, the damage dice, the
   * hit points and the log lines all composed before a single `onChange` -
   * because two writes here would each build from this render's roster and
   * the second would silently discard the first, which for a Multiattack
   * would mean a dragon's claws erasing its own bite.
   *
   * Returning rather than writing is what extends that rule past a single
   * gesture: a monster's whole turn is a walk *and* a routine, and those have
   * to reach the store together or the attack lands from the square the
   * monster already left. Everything here reads from the roster it was handed
   * rather than from this render's, so a move composed a moment ago is
   * already true by the time the swing is priced - the cover is computed from
   * where it ended up, not from where it started.
   */
  const strikesInto = (
    updated: Roster,
    who: { name: string; id?: string },
    strikes: Strike[],
    targetRef: Combatant,
    opts?: { spendAction?: boolean },
  ): Roster => {
    let enc = activeEncounter(updated);
    // Re-read both ends off the roster we were handed: a walk composed just
    // before this one is already in it, and the old objects are stale.
    const target = enc.combatants.find((c) => c.id === targetRef.id) ?? targetRef;
    const targetName = nameOf(target);
    const targetAc =
      target.kind === 'monster'
        ? byId.get(target.monsterId)?.ac
        : derived.get(target.rosterId)?.ctx.ac.total;
    if (targetAc === undefined) return updated;

    // Cover the way 12.4 computes it, when both ends stand on the map: half
    // cover is +2 AC, said in the log so the ruling is visible. Flanking and
    // high ground ride the same parenthesis - noted, never applied.
    const attacker = who.id ? enc.combatants.find((c) => c.id === who.id) : undefined;
    const attackerAt = attacker?.at;
    const cover =
      attackerAt && target.at
        ? lineOfSight(sightContext, attackerAt, target.at).cover
        : false;
    /*
      The ground both of them are standing on. A paladin's aura raises the
      target's AC; standing somewhere that steadies your hand raises the
      roll. Both are the same `grants` field read from two squares.
    */
    const targetGround = grantsUnder(enc.zones, target.at, sideOf(target.kind));
    const attackerGround = attacker
      ? grantsUnder(enc.zones, attackerAt, sideOf(attacker.kind))
      : { toHit: 0, notes: [] as string[] };
    const effectiveAc = targetAc + (cover ? 2 : 0) + targetGround.ac;
    /*
      High ground, applied only if the table said so. The steps come from the
      one function that decides who is uphill; whether they are worth anything
      is `houseRules`. The log says which - "(high ground +2)" when it counts,
      "(high ground)" when it is merely noticed - so a player reading back can
      always tell what the dice actually faced.
    */
    const uphill =
      attackerAt && target.at
        ? heightAdvantage(enc.elevation ?? {}, attackerAt, target.at)
        : 0;
    const highGround = highGroundBonus(houseRules, uphill);

    /*
      Advantage, at last actually rolled. This app has announced "unseen
      attacker — advantage" since §19.3 and rolled a straight die every time,
      and §26.2 made it worse by creating prone that nothing read. The odds
      come from the conditions on both sides plus how far apart they are,
      since prone helps in reach and hinders beyond it.
    */
    const odds = oddsFor({
      attacker: {
        conditions: attacker ? conditionsOf(attacker) : [],
        hidden: attacker?.hidden !== undefined,
        ...(attacker ? { conditionSources: sourcesOf(attacker) } : {}),
        ...(attacker ? { exhaustion: exhaustionOf(attacker) } : {}),
      },
      // Dodging is the target's own doing rather than something done to them,
      // which is why it rides beside the conditions instead of inside them.
      target: { conditions: conditionsOf(target), dodging: stanceOf(target) === 'dodge' },
      ...(attacker ? { canSee: canSeeFrom(attacker) } : {}),
      adjacent:
        !attackerAt || !target.at
          ? true
          : Math.max(Math.abs(attackerAt.x - target.at.x), Math.abs(attackerAt.y - target.at.y)) <= 1,
    });
    const oddsNote = describeOdds(odds);

    const rulings = [
      cover ? 'half cover' : '',
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
              (hpOf(ally)?.now ?? 0) > 0,
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
    const lines: string[] = [];
    /*
      What the defences had to say, gathered once rather than repeated per
      swing - a dragon's three claws against one resistance is one sentence.
    */
    const rulingNotes = new Set<string>();

    for (const strike of strikes) {
      const d20 = rollD20(
        strike.toHit + highGround + attackerGround.toHit,
        odds.mode,
        defaultRng,
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
        const rolled = rollDamage(parsed, crit, defaultRng);
        /*
          Through the target's defences, per damage part - a strike that deals
          slashing and fire against something that only resists fire has to
          split, which is why this is inside the loop rather than applied to
          the total.
        */
        const through = applyDefences(
          rolled.total,
          { type: part.type.toLowerCase(), magical: strike.magical },
          defencesOf(target),
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
      lines.push(
        `${who.name} — ${strike.label} ${d20.total} vs AC ${effectiveAc}${ruling}: ${crit ? 'CRIT, ' : 'hit, '}${parts.join(' + ')} to ${targetName}.`,
      );
    }

    // Damage into whichever store owns it; the log onto the fight; the
    // score onto the tally - kill marked when this blow is what dropped them.
    const hpBefore = hpOf(target)?.now ?? 0;
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
        const bonus = saveBonusFor(target, 'con') ?? 0;
        const roll = rollD20(bonus, 'normal', defaultRng).total;
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
      const max = derived.get(target.rosterId)?.ctx.hp.total ?? 0;
      if (entry) next = updatePlay(next, entry.id, damage(entry.play, totalDamage, max));
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
  };

  /** The same exchange, written. Every hand-driven attack comes through here. */
  const resolveStrikes = (
    who: { name: string; id?: string },
    strikes: Strike[],
    target: Combatant,
    opts?: { spendAction?: boolean },
  ) => onChange(strikesInto(roster, who, strikes, target, opts));

  /**
   * The DM presses the button and the plan happens - walk first, then swing,
   * in ONE write.
   *
   * The composition is the whole point. Two writes here would each build from
   * this render's roster and the second would discard the first, so the
   * monster would attack from the square it had already left. Instead the
   * walk returns a roster, the routine is composed onto *that*, and only then
   * does anything reach the store.
   *
   * The walk is still allowed to refuse - somebody may have moved since the
   * plan was drawn - and a refused walk abandons the whole turn rather than
   * attacking from the wrong place. Better to hand it back to the DM than to
   * do half of something.
   */
  const runPlan = () => {
    if (!enemyPlan || !active) return;
    let updated = roster;

    if (enemyPlan.move) {
      const walked = walkInto(updated, active, enemyPlan.move.to);
      if (!walked) return;
      updated = walked;
    }

    if (enemyPlan.targetId && enemyPlan.strikes.length) {
      const target = activeEncounter(updated).combatants.find((c) => c.id === enemyPlan.targetId);
      // Dropped by the hazard it just walked through, or already gone: the
      // walk still stands, the swing does not.
      if (target && (hpOf(target)?.now ?? 0) > 0) {
        updated = strikesInto(
          updated,
          { name: nameOf(active), id: active.id },
          enemyPlan.strikes,
          target,
        );
      }
    }

    if (!enemyPlan.move && !enemyPlan.strikes.length) {
      updated = updateEncounter(
        updated,
        appendLog(activeEncounter(updated), `${nameOf(active)} holds.`),
      );
    }

    setMoveArmed(false);
    onChange(updated);
  };

  const resolveAim = (target: Combatant) => {
    if (!aim) return;
    resolveStrikes({ name: aim.attacker, id: aim.attackerId }, aim.strikes, target);
    setAim(null);
  };

  /*
    A hazard zone bites somebody: the dice rolled for real, the save with
    their real bonus, the damage into whichever store owns their hit points,
    the log saying all of it - composed onto the given roster and RETURNED,
    not written, so a walk through two zones plus the movement charge itself
    still land in one onChange. This is the machinery that makes a wall of
    fire different from a drawing of one.
  */
  const biteZone = (
    updated: Roster,
    combatantId: string,
    zone: Zone,
    // "is caught by" is section 26's: a surface reacting under somebody's feet
    // is a third way to be bitten, and it costs exactly like the other two.
    how: 'walks into' | 'ends their turn in' | 'is caught by',
  ): Roster => {
    const effect = zone.effect;
    if (!effect?.damage) return updated;
    const encNow = activeEncounter(updated);
    const combatant = encNow.combatants.find((c) => c.id === combatantId);
    if (!combatant) return updated;
    const parsed = parseNotation(effect.damage.dice);
    if (!parsed) return updated;
    const rolled = rollNotation(parsed, defaultRng).total;

    // A fire elemental standing in a wall of fire is the case this fixes.
    const through = applyDefences(
      rolled,
      { type: effect.damage.type.toLowerCase() },
      defencesOf(combatant),
    );
    let dealt = through.dealt;
    let saveNote = through.notes.length ? ` (${through.notes.join('; ')})` : '';
    if (effect.save) {
      const bonus =
        (saveBonusFor(combatant, effect.save.ability as 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha') ??
          0) + grantsUnder(encNow.zones, combatant.at, sideOf(combatant.kind)).saves;
      const total = rollD20(bonus, 'normal', defaultRng).total;
      const pass = total >= effect.save.dc;
      // Halving the post-defence figure, not the raw roll: resistance and a
      // successful save both apply, and each halves what is left.
      if (pass) dealt = effect.save.half ? Math.floor(dealt / 2) : 0;
      saveNote += ` — ${effect.save.ability.toUpperCase()} save ${total} vs DC ${effect.save.dc}: ${pass ? 'pass' : 'FAIL'}`;
    }

    const name = nameOf(combatant);
    let enc = appendLog(
      encNow,
      `${name} ${how} ${zone.label}${saveNote}${dealt > 0 ? `, ${dealt} ${effect.damage.type}.` : ', no damage.'}`,
    );
    if (dealt <= 0) return updateEncounter(updated, enc);

    const hpBefore = hpOf(combatant)?.now ?? 0;
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
      return updateEncounter(updated, damageMonster(enc, combatant.id, dealt));
    }
    let out = updateEncounter(updated, enc);
    const entry = out.entries.find((e) => e.id === combatant.rosterId);
    const max = derived.get(combatant.rosterId)?.ctx.hp.total ?? 0;
    if (entry) {
      /*
        The same roll the strike path makes. Ground that hurts breaks
        concentration exactly like a sword does, and having one door roll it
        and the other only mention it would be the worse kind of inconsistency.
      */
      let play = damage(entry.play, dealt, max);
      if (entry.play.concentratingOn) {
        const dc = concentrationDc(dealt);
        const roll = rollD20(saveBonusFor(combatant, 'con') ?? 0, 'normal', defaultRng).total;
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
  };

  /**
   * Ground that mends rather than bites: rolled and applied like a bite, with
   * the sign turned round. Returns the roster so it composes with everything
   * else a turn's end settles.
   */
  const healFromZone = (updated: Roster, combatantId: string, dice: string): Roster => {
    const encNow = activeEncounter(updated);
    const c = encNow.combatants.find((x) => x.id === combatantId);
    const parsed = parseNotation(dice);
    if (!c || !parsed) return updated;
    const hp = hpOf(c);
    // Nothing to mend on somebody at full, and nothing at all for the dead:
    // healing the dropped is a ruling, and a loud one, not a side effect of
    // standing somewhere.
    if (!hp || hp.now <= 0 || hp.now >= hp.max) return updated;
    const rolled = rollNotation(parsed, defaultRng).total;
    const enc = appendLog(encNow, `${nameOf(c)} ends their turn on healing ground — ${rolled} back.`);
    // Negative damage, which is how the rail's own +5 button already heals a
    // monster - `damageMonster` clamps at both ends.
    if (c.kind === 'monster') return updateEncounter(updated, damageMonster(enc, c.id, -rolled));
    let out = updateEncounter(updated, enc);
    const entry = out.entries.find((e) => e.id === c.rosterId);
    const max = derived.get(c.rosterId)?.ctx.hp.total ?? 0;
    if (entry) out = updatePlay(out, entry.id, heal(entry.play, rolled, max));
    return out;
  };

  /**
   * Put an area down, and let the ground answer.
   *
   * Section 23 made a wall of fire different from a drawing of one; this makes
   * it different from a wall of fire in an empty room. `placeZone` decides what
   * the surfaces do to each other - the grease catches, the web burns off, the
   * lake conducts - and hands back the new ground, the lines to say, and any
   * jolt that has to bite right now.
   *
   * All of it composes into ONE write. A reaction that damaged three people
   * across three `onChange` calls would have two of them build from a roster
   * that no longer existed, and the last one would win.
   */
  const dropZone = (incoming: Zone) => {
    const { zones, log, jolts } = placeZone(encounter.zones ?? [], incoming);

    let enc: EncounterState = { ...encounter, zones, nextSeq: encounter.nextSeq + 1 };
    for (const line of log) enc = appendLog(enc, line);
    let updated = updateEncounter(roster, enc);

    // A jolt is a zone that bites once: everyone standing in it pays, through
    // the same dice, saves and stores a wall of fire already uses.
    for (const jolt of jolts) {
      for (const victim of combatantsIn(jolt, activeEncounter(updated).combatants)) {
        if ((hpOf(victim)?.now ?? 0) <= 0) continue;
        updated = biteZone(updated, victim.id, jolt, 'is caught by');
      }
    }
    onChange(updated);
  };

  /** A skill's real bonus from whichever side owns it, monster or sheet. */
  const skillBonusFor = (c: Combatant, skill: string, fallback: 'str' | 'dex'): number => {
    if (c.kind === 'monster') {
      const monster = byId.get(c.monsterId);
      if (!monster) return 0;
      return monster.skills?.[skill] ?? monsterMod(monster.scores[fallback]);
    }
    const info = derived.get(c.rosterId);
    if (!info) return 0;
    return (
      info.ctx.proficiencies.skills.find((s) => s.skill === skill)?.modifier ??
      info.ctx.mods[fallback]
    );
  };

  /** The conditions on somebody, from whichever store holds them. */
  const conditionsOf = (c: Combatant): string[] =>
    c.kind === 'monster'
      ? c.conditions
      : (roster.entries.find((e) => e.id === c.rosterId)?.play.conditions ?? []);

  /**
   * Disengage or Dodge, from whichever store holds it.
   *
   * Both trays have offered both actions since the command menu existed and
   * neither ever wrote anything down, which made Disengage an action spent on
   * a rule nothing enforced. The two halves live in different places for the
   * same reason every other fact does - a character's turn is on their sheet,
   * a monster's is on the combatant - so this is the one place that asks.
   */
  const stanceOf = (c: Combatant): 'disengage' | 'dodge' | undefined =>
    c.kind === 'monster'
      ? c.stance
      : roster.entries.find((e) => e.id === c.rosterId)?.play.turn.stance;

  /** Whether their one reaction is already gone. */
  const reactionSpentOf = (c: Combatant): boolean =>
    c.kind === 'monster'
      ? !!c.reactionSpent
      : !!roster.entries.find((e) => e.id === c.rosterId)?.play.turn.reaction;

  /** Spend it, composed onto the given roster rather than written. */
  const spendReactionOf = (target: Roster, c: Combatant): Roster => {
    if (c.kind === 'monster') {
      return updateEncounter(target, spendMonsterReaction(activeEncounter(target), c.id));
    }
    const entry = target.entries.find((e) => e.id === c.rosterId);
    return entry ? updatePlay(target, entry.id, setTurnSlot(entry.play, 'reaction', true)) : target;
  };

  /** Everything they can swing, either side of the table, for the questions
      that are about reach rather than about choosing. */
  const allStrikesFor = (c: Combatant): Strike[] => {
    if (c.kind !== 'monster') return strikesFor(c);
    const monster = byId.get(c.monsterId);
    return monster ? singleStrikes(monster) : [];
  };

  /**
   * The one attack they get for reacting.
   *
   * One, and melee - an opportunity attack is a single melee attack, never a
   * Multiattack, and a dragon reacting with its whole routine would be the
   * biggest damage bug this app could ship. A character takes their main hand,
   * which is the first line the sheet lists.
   */
  const opportunitySwing = (c: Combatant): Strike[] => {
    if (c.kind === 'monster') {
      const monster = byId.get(c.monsterId);
      return monster ? opportunityStrike(monster) : [];
    }
    const melee = strikesFor(c).filter(isMelee);
    return melee.length ? [melee[0]] : [];
  };

  /** And who caused them, for the conditions that turn on it. */
  const sourcesOf = (c: Combatant): Record<string, string> =>
    (c.kind === 'monster'
      ? c.conditionSources
      : roster.entries.find((e) => e.id === c.rosterId)?.play.conditionSources) ?? {};

  /**
   * Whether one combatant can see another, for the rules that ask.
   *
   * The same `lineOfSight` the cover calculation uses, so "in sight" means one
   * thing across the whole app. Somebody off the map is not visible, which is
   * the safe answer: it leaves a rule unapplied rather than applying it wrong.
   */
  const canSeeFrom = (watcher: Combatant) => (id: string): boolean => {
    const other = encounter.combatants.find((c) => c.id === id);
    if (!watcher.at || !other?.at) return false;
    return lineOfSight(sightContext, watcher.at, other.at).visible;
  };

  /**
   * What a creature resists, is immune to, or is vulnerable to.
   *
   * Monsters carry all three on the stat block; characters carry none - the
   * build model has an AC/HP `Defenses` and no damage-type resistances at all,
   * so a raging Barbarian or a Dragonborn's ancestry is still the DM's to
   * apply by hand. Named here so the gap is visible rather than implied.
   */
  const defencesOf = (c: Combatant): Defences => {
    if (c.kind !== 'monster') return {};
    const monster = byId.get(c.monsterId);
    return monster
      ? { resist: monster.resist, immune: monster.immune, vulnerable: monster.vulnerable }
      : {};
  };

  /** A creature's size, for the rule that nobody shoves what towers over them. */
  const sizeOf = (c: Combatant): string =>
    c.kind === 'monster' ? (byId.get(c.monsterId)?.size ?? 'Medium') : 'Medium';

  /**
   * A shove: one contested roll, and whatever the ground does next.
   *
   * Section 23 ruled shoving out as a ruling richer than a grid should model.
   * That was right about grappling and wrong about this, for a reason the
   * register did not account for: **this map has height**, and had never once
   * let it change a number. A ledge nobody can be pushed off is scenery.
   *
   * Everything composes into ONE write - the contest, the move, the fall, the
   * damage, the prone condition, the log. A push that damaged somebody across
   * two `onChange` calls would have the second build from a roster the first
   * had already replaced.
   */
  const resolveShove = (targetId: string) => {
    if (!shoving) return;
    const shover = encounter.combatants.find((c) => c.id === shoving.byId);
    const target = encounter.combatants.find((c) => c.id === targetId);
    setShoving(null);
    if (!shover?.at || !target?.at || shover.id === target.id) return;

    const name = nameOf(shover);
    const them = nameOf(target);

    /*
      Every ending goes through here, because a shove costs the same whether
      it worked: it replaces one attack of the Attack action, so the pip is
      spent on the attempt. Composed into the same write as everything else,
      since a second onChange would build from a roster this one replaced.
    */
    const finish = (enc: EncounterState, then?: (r: Roster) => Roster) => {
      let updated = updateEncounter(roster, enc);
      if (then) updated = then(updated);
      if (shover.kind === 'character') {
        const entry = updated.entries.find((e) => e.id === shover.rosterId);
        if (entry) updated = updatePlay(updated, entry.id, setTurnSlot(entry.play, 'action', true));
      }
      onChange(updated);
    };

    if (Math.max(Math.abs(shover.at.x - target.at.x), Math.abs(shover.at.y - target.at.y)) > 1) {
      // Nothing was attempted, so nothing is spent: this is a mis-click.
      setEncounter(appendLog(encounter, `${name} is not close enough to shove ${them}.`));
      return;
    }
    if (!canShove(sizeOf(shover), sizeOf(target))) {
      setEncounter(
        appendLog(encounter, `${them} is too big for ${name} to shove — more than one size larger.`),
      );
      return;
    }

    const contest = shoveContest(
      skillBonusFor(shover, 'athletics', 'str'),
      skillBonusFor(target, 'athletics', 'str'),
      skillBonusFor(target, 'acrobatics', 'dex'),
      defaultRng,
    );
    const roll = `Athletics ${contest.shoverRoll} vs ${contest.targetUsed} ${contest.targetRoll}`;

    if (!contest.success) {
      finish(appendLog(encounter, `${name} shoves ${them} — ${roll}: holds firm.`));
      return;
    }

    if (shoving.mode === 'prone') {
      finish(appendLog(encounter, `${name} trips ${them} — ${roll}: down they go.`), (r) =>
        knockProne(r, target.id),
      );
      return;
    }

    // Pushed five feet directly away. Somewhere solid to land, or they simply
    // stay where they are - a shove into a wall is a shove that went nowhere.
    const to = pushedTo(shover.at, target.at);
    const blocked =
      !walkable(sightContext, to) ||
      encounter.combatants.some((c) => c.id !== target.id && c.at && c.at.x === to.x && c.at.y === to.y);
    if (blocked) {
      finish(appendLog(encounter, `${name} shoves ${them} — ${roll}: nowhere to go, they stay put.`));
      return;
    }

    const drop = fallFeet(
      elevationAt(encounter.elevation ?? {}, target.at),
      elevationAt(encounter.elevation ?? {}, to),
    );
    let enc = placeCombatant(encounter, target.id, to);
    enc = appendLog(enc, `${name} shoves ${them} five feet back — ${roll}.`);

    /*
      The drop, if there was one. The feet are said out loud because
      `terrain.ts` keeps height in abstract steps on purpose - a table that
      calls a step five feet rather than ten can halve this, and can only do
      that if it can see the number.
    */
    const dice = fallDamage(drop);
    finish(enc, (r) => {
      if (!dice) return r;
      let out = biteZone(
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
      );
      // The SRD lands a falling creature prone, and it is the part everyone
      // forgets - which is exactly the kind of thing a tool should remember.
      out = knockProne(out, target.id);
      return out;
    });
  };

  /** Prone, added rather than toggled: shoving somebody already down must not
      stand them back up. */
  const knockProne = (updated: Roster, id: string): Roster => {
    const encNow = activeEncounter(updated);
    const c = encNow.combatants.find((x) => x.id === id);
    if (!c) return updated;
    if (c.kind === 'monster') {
      if (c.conditions.includes('prone')) return updated;
      return updateEncounter(updated, toggleMonsterCondition(encNow, id, 'prone'));
    }
    const entry = updated.entries.find((e) => e.id === c.rosterId);
    if (!entry || entry.play.conditions.includes('prone')) return updated;
    return updatePlay(updated, entry.id, toggleCondition(entry.play, 'prone'));
  };

  /*
    Roll Stealth and hide, from either home: the row's Hide button or the
    command menu's Hide entry. The real bonus from whichever side owns it -
    the stat block's Stealth skill, or the sheet's.
  */
  const rollHide = (combatant: Combatant, spendAction = false) => {
    const bonus =
      combatant.kind === 'monster'
        ? byId.get(combatant.monsterId)?.skills?.stealth ??
          monsterMod(byId.get(combatant.monsterId)?.scores.dex ?? 10)
        : derived
            .get(combatant.rosterId)
            ?.ctx.proficiencies.skills.find((s) => s.skill === 'stealth')?.modifier ?? 0;
    const roll = rollD20(bonus, 'normal', defaultRng).total;
    // The menu's Hide is the Hide ACTION - the roll, the hidden state, the
    // log line and the spent pip all in one write, because a second write
    // built from the same snapshot would erase the first. The row's Hide
    // stays free of the pip: out-of-turn hiding is the DM's business.
    let updated = updateEncounter(
      roster,
      appendLog(setHidden(encounter, combatant.id, roll), `${nameOf(combatant)} hides — Stealth ${roll}.`),
    );
    if (spendAction && combatant.kind === 'character') {
      const entry = updated.entries.find((e) => e.id === combatant.rosterId);
      if (entry) updated = updatePlay(updated, entry.id, setTurnSlot(entry.play, 'action', true));
    }
    onChange(updated);
  };

  /** A click on somebody in the strip or the order: target when aiming, select otherwise. */
  const choose = (id: string) => {
    const combatant = encounter.combatants.find((c) => c.id === id);
    if (aim && combatant) {
      resolveAim(combatant);
      return;
    }
    setSelectedId(id);
  };

  /** A character's main-hand attack routine, in the shape the aim flow eats -
      the same payload the command menu's vs… button builds. */
  const strikesFor = (combatant: Combatant): Strike[] => {
    if (combatant.kind !== 'character') return [];
    const ctx = derived.get(combatant.rosterId)?.ctx;
    if (!ctx) return [];
    const sign = (value: number) => (value >= 0 ? `+${value}` : `${value}`);
    return ctx.attacks
      .filter((line) => line.hand !== 'off')
      .map((line) => {
        const dice = damageDice(line.weapon, line.hand === 'main' && !ctx.loadouts.offHand);
        return {
          label: line.weapon.name,
          toHit: line.toHit,
          magical: line.magical,
          ...(line.weapon.ammo ? { ammo: line.weapon.ammo } : {}),
          /*
            Reach, which the monsters have carried since §25.1 and the
            characters never did - nothing asked until an opportunity attack
            needed to know whether a glaive reaches the man walking away. A
            thrown melee weapon counts as melee here on purpose: a dagger in
            the hand is a dagger in the hand.
          */
          range: line.weapon.melee
            ? { reach: line.weapon.properties.includes('reach') ? 10 : 5 }
            : { ranged: line.weapon.range ?? { normal: 20, long: 60 } },
          damage: [
            {
              dice: `${dice}${line.damage.bonus ? sign(line.damage.bonus) : ''}`,
              type: line.damage.type,
            },
          ],
        };
      });
  };

  /*
    A click on a token. During a character's turn, clicking a living, seen
    monster IS the attack - "I hit the goblin" in one gesture, resolved
    through the same dice, cover and fog rules the aim chips use, spending
    the action with it. Everything else falls through to the old law: an
    armed aim resolves on whoever was clicked, and otherwise the click
    selects, showing their panel in the rail. Scoped to the MAP on purpose -
    the strip and the order rows still merely select, because inspecting a
    goblin from the rail must never be an assault.
  */
  const tokenClick = (id: string) => {
    // An armed shove takes the click before anything else: the tool in hand
    // is the tool that answers, same as an armed aim.
    if (shoving) {
      resolveShove(id);
      return;
    }
    const target = encounter.combatants.find((c) => c.id === id);
    if (
      target &&
      !aim &&
      !placing &&
      !moveArmed &&
      isRunning(encounter) &&
      active?.kind === 'character' &&
      target.kind === 'monster' &&
      (hpOf(target)?.now ?? 0) > 0 &&
      // A charmed creature cannot attack whoever charmed it.
      mayAttack(
        { conditions: conditionsOf(active), conditionSources: sourcesOf(active) },
        target.id,
      ) &&
      // The fog's rule, same as the aim chips: no attacking what the party
      // cannot see, nor what is hidden in plain sight.
      !(partyVisible && (!target.at || !partyVisible.has(keyOf(target.at)) || target.hidden)) &&
      // A spent action means the click is inspection, not a free second swing.
      !roster.entries.find((e) => e.id === active.rosterId)?.play.turn.action
    ) {
      const strikes = strikesFor(active);
      if (strikes.length) {
        resolveStrikes({ name: nameOf(active), id: active.id }, strikes, target, {
          spendAction: true,
        });
        return;
      }
    }
    choose(id);
  };

  /*
    X-COM's answer to "who can I hit": every live target with the odds the
    dice will actually face - each strike's bonus against their AC, cover
    folded in exactly as resolveAim will charge it. Enemies of the attacker
    sort first, best shot at the front, because a DM aiming a goblin's
    scimitar is rarely aiming it at another goblin.
  */
  const aimTargets = useMemo(() => {
    if (!aim) return [];
    const attacker = aim.attackerId
      ? encounter.combatants.find((c) => c.id === aim.attackerId)
      : undefined;
    const out = encounter.combatants
      .filter((c) => c.id !== aim.attackerId)
      .map((c) => {
        const hp = hpOf(c);
        if (!hp || hp.now === 0) return null;
        // A character cannot aim at what the party cannot see. A monster
        // suffers no such veil - the fog is the party's, not the world's.
        if (
          partyVisible &&
          attacker?.kind === 'character' &&
          c.kind === 'monster' &&
          (!c.at || !partyVisible.has(keyOf(c.at)) || c.hidden)
        ) {
          return null;
        }
        const ac =
          c.kind === 'monster' ? byId.get(c.monsterId)?.ac : derived.get(c.rosterId)?.ctx.ac.total;
        if (ac === undefined) return null;
        const los = attacker?.at && c.at ? lineOfSight(sightContext, attacker.at, c.at) : null;
        const cover = los?.cover ?? false;
        const effectiveAc = ac + (cover ? 2 : 0);
        /*
          The same +2 the dice will get, or the percentage under the crosshair
          is a promise the roll does not keep.
        */
        const uphill =
          attacker?.at && c.at ? heightAdvantage(encounter.elevation ?? {}, attacker.at, c.at) : 0;
        const uphillBonus = highGroundBonus(houseRules, uphill);
        const chance = aim.strikes.length
          ? aim.strikes.reduce(
              (sum, s) => sum + hitChance(s.toHit + uphillBonus, effectiveAc),
              0,
            ) / aim.strikes.length
          : 0;
        // Hit-weighted average damage across the whole routine - the number
        // X-COM prints under the percentage.
        const expected = aim.strikes.reduce((sum, s) => {
          const average = s.damage.reduce((n, d) => {
            const parsed = parseNotation(d.dice);
            return n + (parsed ? expectedTotal(parsed) : 0);
          }, 0);
          return sum + hitChance(s.toHit, effectiveAc) * average;
        }, 0);
        /*
          Rulings the map can see coming, noted rather than applied: the
          optional flanking rule when an ally stands opposite, and steps of
          high ground. The DM makes the call; the chip just points.
        */
        const allies = attacker
          ? encounter.combatants
              .filter(
                (ally) =>
                  ally.kind === attacker.kind &&
                  ally.id !== attacker.id &&
                  ally.at &&
                  (hpOf(ally)?.now ?? 0) > 0,
              )
              .map((ally) => ally.at!)
          : [];
        const isFlanking =
          !!attacker?.at && !!c.at && c.kind !== attacker.kind && flanked(attacker.at, c.at, allies);
        const high =
          attacker?.at && c.at
            ? heightAdvantage(encounter.elevation ?? {}, attacker.at, c.at)
            : 0;
        return {
          id: c.id,
          name: nameOf(c),
          foe: attacker ? c.kind !== attacker.kind : true,
          chance,
          expected,
          cover,
          blocked: los ? !los.visible : false,
          flanking: isFlanking,
          high: Math.max(0, high),
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);
    return out.sort((a, b) => (a.foe !== b.foe ? (a.foe ? -1 : 1) : b.chance - a.chance));
    // hpOf/nameOf are stable per render and derive from the same stores.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aim, encounter.combatants, sightContext, roster.entries, partyVisible]);

  /**
   * The group save: everyone still standing rolls with their real bonus.
   *
   * A monster's comes from its stat block - the proficient ones from `saves`,
   * the rest from the bare ability modifier. A character's is the same sum
   * their sheet prints: modifier, proficiency if their class grants that save,
   * item bonuses. Rolling *for* the characters is what a DM tool does when the
   * players are not in the room, which is most of what balancing prep is.
   */
  /** A combatant's real saving-throw bonus - the stat block's or the sheet's. */
  const saveBonusFor = (
    c: Combatant,
    ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha',
  ): number | null => {
    if (c.kind === 'monster') {
      const monster = byId.get(c.monsterId);
      if (!monster) return null;
      return monster.saves[ability] ?? monsterMod(monster.scores[ability]);
    }
    const info = derived.get(c.rosterId);
    if (!info) return null;
    const proficient = new Set(info.ctx.slices[0]?.klass.saves ?? []).has(ability);
    return (
      info.ctx.mods[ability] + (proficient ? info.ctx.proficiency : 0) + info.ctx.itemEffects.saves
    );
  };

  const rollGroupSaves = () => {
    const ability = saveForm.ability as 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
    const results = encounter.combatants
      .map((c) => {
        const hp = hpOf(c);
        if (!hp || hp.now === 0) return null;
        const base = saveBonusFor(c, ability);
        if (base === null) return null;
        // The ground counts: a paladin's aura is a saving throw bonus and
        // nothing else, and the room save is where it earns its keep.
        const bonus = base + grantsUnder(encounter.zones, c.at, sideOf(c.kind)).saves;
        const total = rollD20(bonus, 'normal', defaultRng).total;
        return { id: c.id, name: nameOf(c), bonus, total, pass: total >= saveForm.dc };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    setSaveResults(results);
    setEncounter(
      appendLog(
        encounter,
        `DC ${saveForm.dc} ${ability.toUpperCase()} save: ${
          results.filter((r) => r.pass).map((r) => r.name).join(', ') || 'nobody'
        } passed; ${
          results.filter((r) => !r.pass).map((r) => r.name).join(', ') || 'nobody'
        } failed.`,
      ),
    );
  };

  /** Full to the failed, half to the passed - a fireball, in one write. */
  const applySaveDamage = () => {
    const amount = Math.max(0, Math.round(Number(saveForm.damage) || 0));
    if (!amount || !saveResults) return;

    let enc = encounter;
    let updated = roster;
    for (const result of saveResults) {
      const dealt = result.pass ? (saveForm.half ? Math.floor(amount / 2) : 0) : amount;
      if (!dealt) continue;
      const combatant = enc.combatants.find((c) => c.id === result.id);
      if (!combatant) continue;
      // The zone's damage scores too - no single hand behind it, so no
      // dealer, but every point taken and every knockdown counts.
      const hpBefore = hpOf(combatant)?.now ?? 0;
      enc = recordDamage(enc, {
        to: combatant.id,
        amount: Math.min(dealt, hpBefore),
        downed: hpBefore > 0 && hpBefore - dealt <= 0,
      });
      if (combatant.kind === 'monster') {
        if (combatant.dormant) {
          enc = appendLog(setDormant(enc, combatant.id, false), `${combatant.label} activates!`);
        }
        enc = damageMonster(enc, combatant.id, dealt);
      } else {
        const entry = updated.entries.find((e) => e.id === combatant.rosterId);
        const max = derived.get(combatant.rosterId)?.ctx.hp.total ?? 0;
        if (entry) {
          if (entry.play.concentratingOn) {
            enc = appendLog(
              enc,
              `${result.name} is concentrating on ${entry.play.concentratingOn} — CON save DC ${concentrationDc(dealt)}.`,
            );
          }
          updated = updatePlay(updated, entry.id, damage(entry.play, dealt, max));
        }
      }
    }
    enc = appendLog(
      enc,
      `${amount} damage applied${saveForm.half ? ', half on a pass' : ' to the failed'}.`,
    );
    onChange(updateEncounter(updated, enc));
    setSaveResults(null);
  };

  /**
   * Next turn, and the action economy of whoever it now is.
   *
   * Both writes go through one `onChange`, because two calls would each build
   * from the roster this render was given and the second would discard the
   * first - the classic stale-closure bug, and here it would silently lose the
   * turn advance every time a character came up.
   */
  const advance = () => {
    /*
      The ending turn settles its debts first: a wall of fire bites whoever
      ends a turn standing in it, composed into the same write as the turn
      advance - a second onChange here would erase the advance itself.
    */
    let base = roster;
    if (isRunning(encounter) && active?.at) {
      for (const zone of (encounter.zones ?? []).filter(bitesOnEndTurn)) {
        if (!zoneReaches(zone, sideOf(active.kind))) continue;
        if (inZone(zone, active.at)) base = biteZone(base, active.id, zone, 'ends their turn in');
      }
      /*
        And the ground that heals rather than bites, on the same beat: a turn
        ended inside a helpful area is worth something, composed into the same
        write as everything else the turn's end settles.
      */
      const under = grantsUnder(encounter.zones, active.at, sideOf(active.kind));
      for (const dice of under.heals) base = healFromZone(base, active.id, dice);
    }
    const encNow = activeEncounter(base);

    const { encounter: stepped, began } = nextTurn(encNow);
    // A new round burns every clock at once: the zones, and every timed
    // condition on both sides - one moment, one rule, same as 12.5.
    const wrapped = stepped.round > encNow.round && encNow.round > 0;
    const next = wrapped ? tickMonsterConditions(tickZones(stepped)) : stepped;
    let updated = updateEncounter(base, next);
    if (wrapped) {
      const inFight = new Set(
        next.combatants.filter((c) => c.kind === 'character').map((c) => c.rosterId),
      );
      updated = {
        ...updated,
        entries: updated.entries.map((entry) =>
          inFight.has(entry.id) ? { ...entry, play: tickConditions(entry.play) } : entry,
        ),
      };
    }
    if (began?.kind === 'character') {
      const entry = updated.entries.find((e) => e.id === began.rosterId);
      if (entry) updated = updatePlay(updated, entry.id, newTurn(entry.play));

      /*
        A death save, at the top of a downed character's turn.

        `applyDeathSaveRoll` has had the whole rule in it since §7 - a natural
        twenty stands you up on one hit point, a natural one counts double -
        and the battle screen never called it, so a dying character simply lay
        there until the DM remembered. Rolled here because this is the moment
        the rule fires, and composed into the same write as the turn advance.
      */
      const now = updated.entries.find((e) => e.id === began.rosterId);
      const max = derived.get(began.rosterId)?.ctx.hp.total ?? 0;
      if (now && hpNow(now.play, max) <= 0 && now.play.deathSaves.failures < 3) {
        const d20 = rollD20(0, 'normal', defaultRng);
        const natural = d20.rolls[d20.kept] ?? d20.rolls[0];
        const roll = {
          total: d20.total,
          natural: (natural === 20 ? 20 : natural === 1 ? 1 : null) as 20 | 1 | null,
        };
        const after = applyDeathSaveRoll(now.play, roll, max);
        updated = updatePlay(updated, now.id, after);
        const said =
          natural === 20
            ? 'a natural 20 — up on one hit point'
            : natural === 1
              ? 'a natural 1 — two failures'
              : d20.total >= 10
                ? 'a success'
                : 'a failure';
        updated = updateEncounter(
          updated,
          appendLog(
            activeEncounter(updated),
            `${nameOf(began)} rolls a death save: ${d20.total}, ${said}. (${after.deathSaves.successes}/3 up, ${after.deathSaves.failures}/3 down)`,
          ),
        );
      }
    }
    // The phase card: a round wrap announces the round, otherwise whoever
    // just came up. Keyed by seq so each advance replays the animation.
    setBanner((prev) => ({
      seq: (prev?.seq ?? 0) + 1,
      text: wrapped ? `Round ${next.round}` : began ? `${nameOf(began)}’s turn` : '',
    }));
    // The right pane follows the turn, the way a squad game's camera does:
    // whoever came up is the cockpit until the DM clicks somebody else.
    if (began) setSelectedId(began.id);
    // The old turn's walk does not carry into the new one's hands.
    setMoveArmed(false);
    onChange(updated);
  };

  /*
    The tokens, and what dragging one costs.

    A drag reports the distance it covered - five feet a square, diagonals
    included, which is the ordinary rule - and for a character that is charged
    against the movement their sheet already tracks. So the map and the turn
    tracker agree about how far somebody has gone, because there is one number
    and the map is just a way of writing to it.

    Monsters pay from the `moved` on their combatant, the same per-turn
    resource, refunded when their turn comes round.
  */
  /*
    Whether a click on an enemy token right now would be an attack - the
    same guard tokenClick applies, precomputed so the cursor can say
    crosshair BEFORE the click commits. While an aim is armed, every token
    is a target: the next click resolves on whoever it lands on.
  */
  const clickAttacks =
    isRunning(encounter) &&
    !placing &&
    !moveArmed &&
    active?.kind === 'character' &&
    !roster.entries.find((e) => e.id === active.rosterId)?.play.turn.action &&
    strikesFor(active).length > 0;

  const tokens: Token[] = order
    .filter((c) => c.at)
    // Under fog, an enemy nobody can see is not on the party's map - and a
    // hidden one is not on it even in plain line of sight. The rail still
    // lists everyone; the fog governs the picture.
    .filter(
      (c) =>
        !partyVisible ||
        c.kind === 'character' ||
        (partyVisible.has(keyOf(c.at!)) && !c.hidden),
    )
    .map((c) => {
      const hp = hpOf(c);
      const name = nameOf(c);
      const conditionIds =
        c.kind === 'monster'
          ? c.conditions
          : roster.entries.find((e) => e.id === c.rosterId)?.play.conditions ?? [];
      return {
        id: c.id,
        // Initials: a grid square is fourteen pixels and a name will not fit.
        label: name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase(),
        at: c.at!,
        kind: c.kind,
        active: c.id === active?.id,
        down: hp?.now === 0,
        bloodied: hp ? hp.now > 0 && hp.now <= hp.max / 2 : false,
        flash: flashes[c.id],
        float: floats[c.id],
        hiding: c.hidden !== undefined,
        targetable: aim
          ? true
          : clickAttacks && c.kind === 'monster' && (hp?.now ?? 0) > 0,
        conditions: conditionIds.map((id) => ({
          short: id.slice(0, 3).toUpperCase(),
          name: CONDITIONS_BY_ID[id]?.name ?? id,
        })),
        title: hp ? `${name} — ${hp.now}/${hp.max}` : name,
      };
    });

  /*
    Sight from whoever is selected to everyone else on the map.

    Computed here rather than in the map component because the *words* matter
    as much as the lines: "cannot see Goblin B — blocked" belongs in prose
    beside the map, where a DM narrating can read it out.
  */
  const sightLines = useMemo(() => {
    if (!showSight || !selected?.at) return [];
    return encounter.combatants
      .filter((c) => c.id !== selected.id && c.at)
      .map((c) => ({
        name: nameOf(c),
        from: selected.at!,
        to: c.at!,
        ...lineOfSight(sightContext, selected.at!, c.at!),
      }));
    // nameOf is stable per render and derived from the same roster this memo
    // already keys on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSight, selected, encounter.combatants, sightContext]);

  /*
    A drag is a click held down - same actor, same arming, same bill.

    It used to be the DM's budget override, teleporting anybody anywhere and
    letting the counter peg; that override is exactly how "clicking to
    attack a monster moved it instead", so it is gone. In combat every step
    of a drag goes through moveSelected - budget-priced, Move-armed, active
    combatant only. Out of combat drags are setup and free for both kinds
    (characters used to be charged for setup drags; also fixed). While an
    attack is being aimed, a drag does nothing at all - a click that slips
    one square must not move the target it meant to hit.
  */
  const onMove = (id: string, to: Square) => {
    if (aim) return;
    const combatant = encounter.combatants.find((c) => c.id === id);
    if (!combatant) return;
    if (!isRunning(encounter) || !combatant.at) {
      if (!walkable(sightContext, to)) return;
      if (
        encounter.combatants.some(
          (c) => c.id !== id && c.at && c.at.x === to.x && c.at.y === to.y,
        )
      ) {
        return;
      }
      setEncounter(placeCombatant(encounter, id, to));
      return;
    }
    if (id !== selected?.id) return;
    moveSelected(to);
  };

  /*
    Put everyone who is not on the map onto it - the party into room 1, the
    monsters spread across the other rooms, farthest first. Nobody starts a
    dungeon in melee. The plan is pure (engine/deploy.ts); this just feeds
    it the map's law - walkable, and not already stood on - and folds every
    placement into one write.
  */
  const deploy = () => {
    const occupied = new Set(
      encounter.combatants.filter((c) => c.at).map((c) => keyOf(c.at!)),
    );
    const placeless = encounter.combatants.filter((c) => !c.at);
    const plan = planDeployment(
      dungeon,
      (at) => walkable(sightContext, at) && !occupied.has(keyOf(at)),
      placeless.filter((c) => c.kind === 'character').map((c) => c.id),
      placeless.filter((c) => c.kind === 'monster').map((c) => c.id),
    );
    let next = encounter;
    for (const [id, at] of plan) next = placeCombatant(next, id, at);
    setEncounter(next);
  };

  const rollAll = () =>
    setEncounter(rollMonsterInitiative(encounter, byId, defaultRng));

  /** A character's initiative, rolled here for a table that wants that. */
  const rollFor = (combatant: Combatant) => {
    const mod =
      combatant.kind === 'character'
        ? derived.get(combatant.rosterId)?.ctx.mods.dex ?? 0
        : 0;
    setEncounter(
      setInitiative(encounter, combatant.id, rollD20(mod, 'normal', defaultRng).total),
    );
  };

  const selectedEntry =
    selected?.kind === 'character'
      ? roster.entries.find((e) => e.id === selected.rosterId) ?? null
      : null;

  const selectedMonster =
    selected?.kind === 'monster' ? byId.get(selected.monsterId) ?? null : null;

  /*
    Acting lives in the right-pane cockpit now: the command menu behind the
    pips (a character) or standing open (a monster). The rail expansion this
    replaced had itself replaced the bottom dock - each move following the
    same instinct, that doing belongs where the doer is, with the map in
    view. One home at last.
  */
  const fightPanel = (
      <Panel
        subtitle={
          isRunning(encounter)
            ? `Round ${encounter.round} · ${nameOf(active!)} is up.`
            : encounter.combatants.length
              ? 'Roll initiative, then start. Nothing is spent until you do.'
              : 'Add your party and whatever they have run into.'
        }
      >
        {/* Starting and advancing live on the HUD bar, which is the one
            control always on screen. This panel keeps the fight's setup and
            teardown. */}
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          <button className="btn btn-sm" disabled={!order.length} onClick={rollAll}>
            Roll monster initiative
          </button>
          {isRunning(encounter) && (
            <button
              className="btn btn-sm"
              onClick={() => {
                setMoveArmed(false);
                setEncounter(endEncounter(encounter));
              }}
            >
              End the fight
            </button>
          )}
          {encounter.combatants.length > 0 && (
            <button className="btn btn-sm" onClick={() => setEncounter(emptyEncounter())}>
              Clear
            </button>
          )}
        </div>

        {order.length === 0 ? (
          <p className="muted">Nobody in the fight yet.</p>
        ) : (
          <ul className="init-list">
            {order.map((combatant) => {
              const hp = hpOf(combatant);
              const monster = combatant.kind === 'monster' ? byId.get(combatant.monsterId) : null;
              const down = hp !== null && hp.now === 0;
              return (
                <React.Fragment key={combatant.id}>
                <li
                  className={`init-row ${combatant.id === active?.id ? 'is-up' : ''} ${down ? 'is-down' : ''} ${combatant.id === selected?.id ? 'is-selected' : ''}`}
                >
                  <input
                    type="number"
                    className="init-score"
                    aria-label={`${nameOf(combatant)} initiative`}
                    value={combatant.initiative}
                    onChange={(e) =>
                      setEncounter(
                        setInitiative(encounter, combatant.id, Number(e.target.value) || 0),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="init-who"
                    aria-pressed={combatant.id === selected?.id}
                    /* Explicit, because the accessible name would otherwise be
                       the row's own text - the name plus an armor class - which
                       says what this is rather than what pressing it does. The
                       visible name is still inside it, so the label contains
                       what a reader sees. */
                    aria-label={aim ? `Target ${nameOf(combatant)}` : `Show ${nameOf(combatant)} in the rail`}
                    title={aim ? `Target ${nameOf(combatant)}` : `Show ${nameOf(combatant)} in the rail`}
                    onClick={() => choose(combatant.id)}
                  >
                    <b>{nameOf(combatant)}</b>
                    <span className="src">
                      {combatant.kind === 'monster'
                        ? monster
                          ? monsterSummary(monster)
                          : missingBlock(loading)
                        : `AC ${derived.get(combatant.rosterId)?.ctx.ac.total ?? '—'}`}
                    </span>
                  </button>

                  {hp && (
                    <span className="init-hp">
                      {combatant.kind === 'monster' ? (
                        <input
                          type="number"
                          aria-label={`${nameOf(combatant)} hit points`}
                          value={hp.now}
                          onChange={(e) =>
                            setEncounter(
                              setMonsterHp(encounter, combatant.id, Number(e.target.value) || 0),
                            )
                          }
                        />
                      ) : (
                        <b>{hp.now}</b>
                      )}
                      <span className="of">/ {hp.max}</span>
                    </span>
                  )}

                  <span className="init-actions">
                    <button
                      className="btn btn-sm"
                      title="Five damage"
                      onClick={() => applyHp(combatant, 5)}
                    >
                      −5
                    </button>
                    <button
                      className="btn btn-sm"
                      title="Heal five"
                      onClick={() => applyHp(combatant, -5)}
                    >
                      +5
                    </button>
                    <button className="btn btn-sm" onClick={() => rollFor(combatant)}>
                      Roll init
                    </button>
                    <button
                      className="btn btn-sm"
                      aria-pressed={popped === combatant.id}
                      title={`Open ${nameOf(combatant)} in its own window`}
                      onClick={() => setPopped(popped === combatant.id ? null : combatant.id)}
                    >
                      {popped === combatant.id ? 'Close window' : 'Pop out'}
                    </button>
                    {isRunning(encounter) && (
                      <button
                        className="btn btn-sm"
                        title="Step down the order past whoever is next"
                        onClick={() => setEncounter(delayTurn(encounter, combatant.id))}
                      >
                        Delay
                      </button>
                    )}
                    {combatant.kind === 'monster' && (
                      <button
                        className="btn btn-sm"
                        title={
                          combatant.dormant
                            ? 'Bring it into the fight: it takes turns again'
                            : 'Stand it down: the turn order passes over it until the party finds it'
                        }
                        onClick={() =>
                          setEncounter(
                            appendLog(
                              setDormant(encounter, combatant.id, !combatant.dormant),
                              combatant.dormant
                                ? `${combatant.label} activates!`
                                : `${combatant.label} stands down.`,
                            ),
                          )
                        }
                      >
                        {combatant.dormant ? 'Wake' : 'Dormant'}
                      </button>
                    )}
                    <button
                      className="btn btn-sm"
                      title={
                        combatant.hidden !== undefined
                          ? `Hiding — Stealth ${combatant.hidden}. Press to step out.`
                          : 'Roll Stealth and hide: unseen until spotted, until attacking, or until revealed by hand'
                      }
                      onClick={() => {
                        if (combatant.hidden !== undefined) {
                          setEncounter(
                            appendLog(
                              setHidden(encounter, combatant.id, undefined),
                              `${nameOf(combatant)} steps out of hiding.`,
                            ),
                          );
                          return;
                        }
                        rollHide(combatant);
                      }}
                    >
                      {combatant.hidden !== undefined ? `Hidden ${combatant.hidden}` : 'Hide'}
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={() => setEncounter(removeCombatant(encounter, combatant.id))}
                    >
                      Remove
                    </button>
                  </span>
                </li>
                </React.Fragment>
              );
            })}
          </ul>
        )}
      </Panel>
  );

  const forecastPanel = (
    <>
      {outlook && (
        <Panel
          title="What this fight will do"
          subtitle="From this app's own damage model, against these characters and these monsters — not an XP budget."
        >
          <p className="forecast-verdict">{outlook.verdict}</p>
          <div className="forecast-grid">
            <div>
              <span className="k">Your party</span>
              <b>{outlook.partyDpr}</b> damage a round at AC {outlook.monsterAc}
              <span className="src">
                {outlook.partyHp} hit points between them · AC {outlook.partyAc} average
              </span>
            </div>
            <div>
              <span className="k">Against you</span>
              <b>{outlook.monsterDpr}</b> damage a round at AC {outlook.partyAc}
              <span className="src">
                {outlook.monsterHp} hit points left · AC {outlook.monsterAc} average
              </span>
            </div>
            <div>
              <span className="k">Rounds</span>
              <b>{outlook.roundsToClear ?? '—'}</b> to clear ·{' '}
              <b>{outlook.roundsToDrop ?? '—'}</b> before the party is out
              <span className="src">{outlook.xp.toLocaleString()} XP from the stat blocks</span>
            </div>
          </div>
          {/*
            What was left out, by name. A model that quietly skipped a dragon's
            breath weapon would read as precise and be wrong; one that named
            what it skipped lets a DM weigh it by eye.
          */}
          {outlook.notes.length > 0 && (
            <ul className="reasons" style={{ marginTop: 8 }}>
              {outlook.notes.map((note, i) => (
                <li key={i}>
                  <span className="delta zero">·</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="muted" style={{ marginTop: 8 }}>
            Expected damage with no variance, nobody moving and nobody using the thing that
            would actually decide it. A projection, not a promise.
          </p>

          {/*
            The prep dial: a fixed-seed 200-run estimate that moves as monsters
            are added. Not the DMG's XP thresholds - this app does not carry
            them - but its own simulation, which knows these characters.
          */}
          {quick && (
            <p className="forecast-verdict" style={{ marginTop: 10 }}>
              Balance: the party wins <b>{Math.round(quick.winRate * 100)}%</b> of 200 quick
              runs — {balanceWord(quick.winRate)}.
            </p>
          )}

          {/*
            The distribution, on request. The expectation above says how the
            averages go; this says how often it goes wrong, which is the
            question a close fight actually poses.
          */}
          <div style={{ marginTop: 12 }}>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => setSim(simulate(sides, { trials: 1000 }))}
            >
              Run it 1,000 times
            </button>
          </div>

          {sim && (
            <div className="sim-result" style={{ marginTop: 10 }}>
              <p className="forecast-verdict">
                The party wins <b>{Math.round(sim.winRate * 100)}%</b> of the time, a typical
                fight lasting <b>{sim.medianRounds}</b> round{sim.medianRounds === 1 ? '' : 's'}
                {sim.winRate > 0 && <> with <b>{sim.meanHpLeftOnWin}</b> hit points left between them</>}
                .
              </p>
              <ul className="reasons">
                {sim.downRate.map((entry) => (
                  <li key={entry.name}>
                    <span
                      className={`delta ${entry.rate > 0.5 ? 'neg' : entry.rate > 0.15 ? 'zero' : 'pos'}`}
                    >
                      {Math.round(entry.rate * 100)}%
                    </span>
                    <span>
                      {entry.name} hits the floor at some point in {Math.round(entry.rate * 100)}% of
                      fights.
                    </span>
                  </li>
                ))}
              </ul>
              <p className="muted" style={{ marginTop: 6 }}>{sim.caveat}</p>
            </div>
          )}
        </Panel>
      )}
    </>
  );

  const partyPanel = (
      <Panel title="Your party" subtitle="Every character on the roster. Their hit points here are the ones on their sheet.">
        <div className="chips">
          {roster.entries.map((entry) => (
            <button
              key={entry.id}
              className={`chip-btn ${inFight.has(entry.id) ? 'is-on' : ''}`}
              aria-pressed={inFight.has(entry.id)}
              onClick={() => {
                const existing = encounter.combatants.find(
                  (c) => c.kind === 'character' && c.rosterId === entry.id,
                );
                setEncounter(
                  existing
                    ? removeCombatant(encounter, existing.id)
                    : addCharacter(encounter, entry.id, {
                        dex: derived.get(entry.id)?.ctx.mods.dex ?? 0,
                      }),
                );
              }}
            >
              {entry.build.name || 'Unnamed'}
            </button>
          ))}
        </div>
      </Panel>
  );

  const monstersPanel = (
      <Panel
        title="Monsters"
        subtitle={
          loading
            ? 'Fetching the bestiary…'
            : bestiary.length
              ? `${bestiary.length} of yours and ${srd.length} from SRD 5.1. Yours come first.`
              : `${srd.length} stat blocks from SRD 5.1. Copy one under Characters → Bestiary to make it yours.`
        }
      >
        {/*
          The honest gap, said where it matters rather than in a README. There
          is no licensed structured source for SRD 5.2's bestiary - the 2024
          endpoint carries three creatures - so a 2024 table gets these and is
          told why rather than being shown a list three monsters long.
        */}
        {ruleset === '2024' && !loading && (
          <div className="callout" style={{ marginBottom: 10 }}>
            You are playing 2024, and these are the 2014 stat blocks. There is no
            licensed machine-readable source for SRD 5.2's bestiary yet, so rather than
            invent one the app gives you the 5.1 monsters and says so. Most of them are
            unchanged; adjust any hit points here in the fight.
          </div>
        )}

        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          <input
            type="search"
            placeholder="Search — goblin, dragon, undead…"
            aria-label="Search the bestiary"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={rollHp}
              onChange={(e) => setRollHp(e.target.checked)}
            />
            <span>Roll hit points</span>
          </label>
        </div>

        {/* "CR 2 to 4, undead" is how prep actually asks. */}
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          <label className="checkbox">
            <span>CR</span>
            <input
              type="number"
              className="qty"
              min={0}
              step="any"
              placeholder="min"
              aria-label="Lowest challenge rating"
              value={crMin}
              onChange={(e) => setCrMin(e.target.value)}
            />
          </label>
          <label className="checkbox">
            <span>to</span>
            <input
              type="number"
              className="qty"
              min={0}
              step="any"
              placeholder="max"
              aria-label="Highest challenge rating"
              value={crMax}
              onChange={(e) => setCrMax(e.target.value)}
            />
          </label>
          <label className="checkbox">
            <span>Type</span>
            <select
              aria-label="Creature type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">any</option>
              {monsterTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!loading && found.length === 0 && (
          <p className="muted">Nothing matches “{query}”.</p>
        )}

        <ul className="mon-list">
          {found.map((monster) => (
            <li key={monster.id}>
              <button
                className="btn btn-sm"
                onClick={() => {
                  // Under fog, a new monster arrives dormant - an unmet pod,
                  // woken the moment the party lays eyes on it.
                  const added = addMonster(encounter, monster, { rollHp });
                  const newest = added.combatants[added.combatants.length - 1];
                  setEncounter(
                    encounter.fog && newest?.kind === 'monster'
                      ? setDormant(added, newest.id, true)
                      : added,
                  );
                }}
              >
                Add
              </button>
              <b>{monster.name}</b>
              {/* A reskin usually keeps enough of the original's name to sort
                  next to it, which is exactly when a DM needs to be told which
                  of the two this row is. */}
              {isCustom(monster.id) && <span className="tag source-tag is-original">Yours</span>}
              <span className="src">
                CR {formatCr(monster.cr)} · AC {monster.ac} · {monster.hp} hp · {monster.type}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
  );

  /*
    The spell's footprint before the click that commits it. The same
    `zoneSquares` that will draw the real thing draws the ghost, so what you
    see is exactly what you get: sphere and cube ride the cursor; a cone or
    line waits for its origin, then swings toward the cursor from there.
  */
  const ghostZone = useMemo(() => {
    if (!placing || !hover) return [];
    const aimed = ZONE_SHAPES.find((z) => z.shape === placing.shape)?.aimed;
    const origin = aimed ? aimFrom ?? hover : hover;
    const angle =
      aimed && aimFrom ? Math.atan2(hover.y - aimFrom.y, hover.x - aimFrom.x) : 0;
    const phantom = {
      id: 'ghost',
      label: placing.label || 'Effect',
      shape: placing.shape,
      at: origin,
      feet: placing.feet,
      angle,
      tint: (encounter.zones?.length ?? 0) % 4,
    };
    return [
      {
        id: 'ghost',
        label: phantom.label,
        tint: phantom.tint,
        origin: phantom.at,
        squares: aimed && !aimFrom ? [origin] : zoneSquares(phantom),
        ghost: true,
      },
    ];
  }, [placing, hover, aimFrom, encounter.zones]);

  /*
    The ruler measures the walk, not the crow: the note is the walked cost and
    the line is the route the walk took, bending through the door - a straight
    line through a wall was a picture of something nobody can do. Where no
    route exists at all, it says so instead of inventing a number.
  */
  const measuring = useMemo(() => {
    if (placing || aim || !hover || !selected?.at || !walk) return null;
    if (hover.x === selected.at.x && hover.y === selected.at.y) return null;
    // The ruler draws the route that would actually be walked - bending
    // around the fire exactly when the walk itself would.
    const choice = routeChoice(keyOf(hover));
    const points = choice ? routeTo(choice.via, selected.at, hover) : null;
    const cost = choice?.cost;
    // The price rides the cursor, and so does what paying it takes: plain
    // feet inside the budget, "Dash" in the outer tier, "too far" beyond.
    const note =
      points === null || cost === undefined
        ? 'no path'
        : !isRunning(encounter)
          ? `${cost} ft`
          : cost > walkBudget.dash
            ? `${cost} ft — too far`
            : cost > walkBudget.base
              ? `${cost} ft · Dash`
              : `${cost} ft`;
    return {
      to: hover,
      points: points ?? [selected.at, hover],
      note,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placing, aim, hover, selected, walk, walkSafe, walkBudget, encounter]);
  const rulerNote = measuring?.note;

  /*
    The banner over the map: what the tool in hand wants next, in the place
    the player is already looking. Priority mirrors what Escape cancels.
  */
  // What the ghost would catch, counted the way the real zone will count it.
  const ghostCaught = (() => {
    const squares = ghostZone[0]?.squares;
    if (!squares || squares.length < 2) return 0;
    const inGhost = new Set(squares.map((s) => keyOf(s)));
    return encounter.combatants.filter((c) => c.at && inGhost.has(keyOf(c.at))).length;
  })();
  const bestShot = aimTargets.find((t) => t.foe) ?? aimTargets[0];
  const hint = aim
    ? bestShot
      ? `Pick ${aim.attacker}'s target — best shot: ${bestShot.name}, ${Math.round(bestShot.chance * 100)}%`
      : `Click ${aim.attacker}'s target — Esc cancels`
    : placing && ZONE_SHAPES.find((s) => s.shape === placing.shape)?.aimed && !aimFrom
      ? 'Click the origin square, then point the shape'
      : placing
        ? `Move to aim the footprint — click to place, Esc cancels${
            ghostCaught ? ` · catches ${ghostCaught} creature${ghostCaught === 1 ? '' : 's'}` : ''
          }`
        : isRunning(encounter) && moveArmed && selected?.id === active?.id
          ? 'Click a lit tile to move — amber needs a Dash, Esc puts the walk down'
          : isRunning(encounter) && selected && selected.id === active?.id
            ? 'Choose Move in the cockpit to walk — clicking a monster attacks'
            : null;

  /* The FFT height readout: steps and feet at the cursor. */
  const heightAtHover = (() => {
    if (!hover) return '';
    const level = encounter.elevation?.[keyOf(hover)] ?? 0;
    return level === 0 ? '0 ft' : `${level > 0 ? '+' : '-'}${Math.abs(level)} · ${Math.abs(level) * 5} ft`;
  })();

  const savesPanel = (
    <Panel
      title="Saving throws"
      subtitle="The call, the answers, the damage — a fireball in three clicks. Everyone rolls with their real bonus."
    >
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <label className="field field-sm">
          <span>Save</span>
          <select
            value={saveForm.ability}
            onChange={(e) => setSaveForm({ ...saveForm, ability: e.target.value })}
          >
            {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((a) => (
              <option key={a} value={a}>
                {a.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="field field-sm">
          <span>DC</span>
          <input
            type="number"
            className="qty"
            value={saveForm.dc}
            onChange={(e) => setSaveForm({ ...saveForm, dc: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="field field-sm">
          <span>Damage</span>
          <input
            type="number"
            className="qty"
            placeholder="—"
            value={saveForm.damage}
            onChange={(e) => setSaveForm({ ...saveForm, damage: e.target.value })}
          />
        </label>
        <label className="checkbox" style={{ alignSelf: 'center' }}>
          <input
            type="checkbox"
            checked={saveForm.half}
            onChange={(e) => setSaveForm({ ...saveForm, half: e.target.checked })}
          />
          <span>Half on a pass</span>
        </label>
        <button
          className="btn btn-sm btn-primary"
          style={{ alignSelf: 'center' }}
          disabled={!encounter.combatants.length}
          onClick={rollGroupSaves}
        >
          Roll the room
        </button>
      </div>

      {saveResults && (
        <>
          <ul className="reasons">
            {saveResults.map((result) => (
              <li key={result.id}>
                <span className={`delta ${result.pass ? 'pos' : 'neg'}`}>
                  {result.pass ? 'pass' : 'FAIL'}
                </span>
                <span>
                  {result.name} rolled <b>{result.total}</b> ({result.bonus >= 0 ? '+' : ''}
                  {result.bonus})
                </span>
              </li>
            ))}
          </ul>
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button
              className="btn btn-sm btn-primary"
              disabled={!Number(saveForm.damage)}
              onClick={applySaveDamage}
            >
              Apply {saveForm.damage || '—'} damage
            </button>
            <button className="btn btn-sm" onClick={() => setSaveResults(null)}>
              Discard
            </button>
          </div>
        </>
      )}
    </Panel>
  );

  const libraryPanel = (
    <Panel
      title="Encounter library"
      subtitle="Prep the other three fights for Saturday. A saved fight keeps its monsters, map, terrain and effects; loading one starts it fresh against today's roster."
    >
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <input
          type="text"
          placeholder="The kennel, level B2…"
          aria-label="Name to save this fight under"
          value={prepName}
          onChange={(e) => setPrepName(e.target.value)}
        />
        <button
          className="btn btn-sm btn-primary"
          disabled={!prepName.trim() || !encounter.combatants.length}
          onClick={() => {
            setLibrary(putEncounter(library, prepName.trim(), encounter));
            setPrepName('');
          }}
        >
          Save this fight
        </button>
      </div>

      {library.length === 0 && (
        <p className="muted">Nothing prepped yet. Build a fight and save it under a name.</p>
      )}
      {library.map((saved) => (
        <p key={saved.id} className="zone-row">
          <button
            className="btn btn-sm"
            aria-label={`Load ${saved.name}`}
            onClick={() =>
              setEncounter(
                loadIntoPlay(saved, new Set(roster.entries.map((e) => e.id))),
              )
            }
          >
            Load
          </button>{' '}
          <button
            className="btn btn-sm"
            aria-label={`Delete ${saved.name}`}
            onClick={() => setLibrary(removeEncounter(library, saved.id))}
          >
            Delete
          </button>{' '}
          <b>{saved.name}</b>
          <span className="src">
            {' '}
            · {saved.encounter.combatants.filter((c) => c.kind === 'monster').length} monsters
            {saved.encounter.mapSeed ? ` · ${saved.encounter.mapSeed}` : ''}
          </span>
        </p>
      ))}
    </Panel>
  );

  /*
    The debrief, when the dust settles: X-COM's post-mission screen as a DM's
    recap. Shown once a fight has ended and something was scored - rounds
    taken, then a row per combatant with what they dealt, took, dropped and
    suffered, MVP first. Printable on purpose: it is the recap you read to
    the table.
  */
  /*
    What the fight was worth, and the two things a table does with it.

    The halves of this app have never spoken after a fight. Hit points carry,
    because the battle screen writes the same `PlayState` the sheet reads - and
    then the fight ends and nothing else does. Every stat block has carried an
    `xp` since the bestiary landed and only the *forecast* ever read it, to say
    how hard the fight looked beforehand. Afterwards the number was thrown away
    and somebody did the arithmetic on paper.

    Two buttons, because after a fight a party does exactly two things: they
    take what they earned, and they sit down. Both write every character in one
    composed `onChange` - a loop of writes would have each build from this
    render's roster and only the last would survive.
  */
  const spoils = useMemo(() => {
    const fallen = encounter.combatants
      .filter((c) => c.kind === 'monster' && c.hp <= 0)
      .map((c) => {
        // The stat block's name, not the combatant's label: "Goblin A" and
        // "Goblin B" are two of the same thing, and the payout says so.
        const monster = c.kind === 'monster' ? byId.get(c.monsterId) : undefined;
        return { name: monster?.name ?? 'Unknown', xp: monster?.xp ?? 0 };
      });
    const inTheFight = encounter.combatants.filter((c) => c.kind === 'character').length;
    return spoilsFor(fallen, inTheFight);
  }, [encounter.combatants, byId]);

  /** Hand out the share, once, and say so. */
  const payOut = () => {
    if (!spoils.each || encounter.paidOut) return;
    let updated = roster;
    for (const c of encounter.combatants) {
      if (c.kind !== 'character') continue;
      const entry = updated.entries.find((e) => e.id === c.rosterId);
      if (entry) updated = updatePlay(updated, entry.id, awardXp(entry.play, spoils.each));
    }
    updated = updateEncounter(
      updated,
      appendLog(
        { ...activeEncounter(updated), paidOut: spoils.total },
        `The party earns ${spoils.each} XP each. ${describeSpoils(spoils)}`,
      ),
    );
    onChange(updated);
  };

  /**
   * Everyone rests at once.
   *
   * The sheet has had both buttons since §7 and pressing them five times over
   * is the DM's least favourite part of the evening. The class-resource lists
   * each rest needs are per character, so they are gathered per character -
   * this is the same call the sheet makes, made in a loop and written once.
   */
  const partyRests = (kind: 'short' | 'long') => {
    let updated = roster;
    for (const c of encounter.combatants) {
      if (c.kind !== 'character') continue;
      const entry = updated.entries.find((e) => e.id === c.rosterId);
      const info = derived.get(c.rosterId);
      if (!entry || !info) continue;
      const custom = entry.build.customResources ?? [];
      /*
        The two lists each rest needs, derived exactly as the sheet derives
        them - a Warlock's pact slots come back on a short rest, a Fighter's
        Second Wind does, and which is which depends on the class level.
      */
      const levelOf = (classId: string) =>
        info.ctx.slices.find((sl) => sl.klass.id === classId)?.entry.level ?? 0;
      const shortKeys = heldResources(info.ctx.slices, entry.build.ruleset, info.ctx.mods)
        .filter((held) => rechargeFor(held, levelOf(held.classId)) === 'short')
        .map((held) => held.key);
      const hitDice = Object.fromEntries(
        info.ctx.slices.map((sl) => [sl.klass.id, sl.entry.level]),
      );
      const rested =
        kind === 'short'
          ? shortRest(entry.play, shortKeys, custom)
          : longRest(entry.play, hitDice, custom);
      updated = updatePlay(updated, entry.id, rested);
    }
    onChange(
      updateEncounter(
        updated,
        appendLog(
          activeEncounter(updated),
          kind === 'short' ? 'The party takes a short rest.' : 'The party takes a long rest.',
        ),
      ),
    );
  };

  const payout = (
    <div className="debrief-payout">
      {spoils.defeated.length > 0 && (
        <p className="hint" style={{ marginTop: 8 }}>
          {describeSpoils(spoils)}
        </p>
      )}
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={payOut}
          disabled={!spoils.each || !!encounter.paidOut}
          title={
            encounter.paidOut
              ? 'Already paid — a button that pays twice is a bug'
              : 'Adds the share to every character who was in the fight'
          }
        >
          {encounter.paidOut ? `Paid ${encounter.paidOut} XP` : `Award ${spoils.each} XP each`}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => partyRests('short')}>
          Short rest
        </button>
        <button type="button" className="btn btn-sm" onClick={() => partyRests('long')}>
          Long rest
        </button>
      </div>
    </div>
  );

  const debriefPanel = (() => {
    if (isRunning(encounter) || !encounter.tally) return null;
    const rows = encounter.combatants
      .map((c) => ({ id: c.id, name: nameOf(c), kind: c.kind, ...(encounter.tally![c.id] ?? {
        dealt: 0, taken: 0, kills: 0, drops: 0,
      }) }))
      .filter((r) => r.dealt || r.taken || r.kills || r.drops)
      .sort((a, b) => b.dealt - a.dealt);
    if (!rows.length) return null;
    const mvp = rows[0];
    return (
      <Panel
        title="The debrief"
        subtitle={
          encounter.endedAfter
            ? `${encounter.endedAfter} round${encounter.endedAfter === 1 ? '' : 's'}. MVP: ${mvp.name} — ${mvp.dealt} damage${mvp.kills ? `, ${mvp.kills} down` : ''}.`
            : `MVP: ${mvp.name} — ${mvp.dealt} damage.`
        }
      >
        <table className="debrief">
          <thead>
            <tr>
              <th>Who</th>
              <th>Dealt</th>
              <th>Took</th>
              <th>Downed</th>
              <th>Dropped</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.kind === 'monster' ? 'is-monster' : ''}>
                <td>{row.name}</td>
                <td>{row.dealt}</td>
                <td>{row.taken}</td>
                <td>{row.kills || ''}</td>
                <td>{row.drops || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {payout}
      </Panel>
    );
  })();

  const logPanel = (
    <>
      {(encounter.log?.length ?? 0) > 0 && (
        <Panel title="What happened" subtitle="The fight's own record, newest first.">
          <ul className="battle-log">
            {encounter.log!.slice(0, 12).map((entry) => (
              <li key={entry.id}>{entry.text}</li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );

  const dungeonPanel = (
      <Panel
        title="The battlefield"
        subtitle="Play is for playing. Build and edit maps in the Dungeons tab; load one here and fight on it."
      >
        {/*
          The optional rules, where the rule applies. Off is the book: the
          app's claim is that it plays fifth edition, and a number quietly
          disagreeing with it would make every other number harder to trust.
          The log names each one either way, so a fight can be read back and
          understood whichever way the switch was set.
        */}
        <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          {HOUSE_RULE_INFO.map((rule) => (
            <label className="checkbox" key={rule.id} title={rule.hint}>
              <input
                type="checkbox"
                checked={houseRules[rule.id]}
                onChange={(e) => setHouseRules({ ...houseRules, [rule.id]: e.target.checked })}
              />
              <span>{rule.label}</span>
            </label>
          ))}
        </div>

        {/*
          The picker: the Dungeons tab's drawer, read-only from here. Loading
          copies the saved map's fields onto the live encounter in one write -
          tokens come off, because the rooms they stood in are gone.
        */}
        {dungeonLibrary.length > 0 && (
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            <label className="checkbox">
              <span>Load a dungeon</span>
              <select
                aria-label="Load a saved dungeon"
                value=""
                onChange={(e) => {
                  const saved = dungeonLibrary.find((d) => d.id === e.target.value);
                  if (saved) setEncounter(applyDungeon(encounter, saved.map));
                }}
              >
                <option value="">— saved in the Dungeons tab —</option>
                {dungeonLibrary.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <p className="muted" style={{ margin: '0 0 8px' }}>
          {dungeon.rooms.length === 0
            ? 'A blank grid. Each square is 5 ft.'
            : `Seed ${seed} · ${dungeon.rooms.length} rooms · each square is 5 ft.`}
        </p>

        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <button
            className="btn btn-sm"
            disabled={!encounter.combatants.length}
            onClick={deploy}
          >
            Put everyone on the map
          </button>
          {tokens.length > 0 && (
            <button
              className="btn btn-sm"
              onClick={() =>
                setEncounter(
                  encounter.combatants.reduce(
                    (acc, c) => placeCombatant(acc, c.id, undefined),
                    encounter,
                  ),
                )
              }
            >
              Take them off
            </button>
          )}
        </div>


        <div className="row" style={{ alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
          <label className="checkbox" style={{ margin: 0 }}>
            <input
              type="checkbox"
              checked={showSight}
              onChange={(e) => setShowSight(e.target.checked)}
            />
            <span>Sight lines from whoever is selected</span>
          </label>
          <label className="checkbox" style={{ margin: 0 }}>
            <input
              type="checkbox"
              checked={!!encounter.fog}
              onChange={(e) => setEncounter({ ...encounter, fog: e.target.checked || undefined })}
            />
            <span>Fog of war</span>
          </label>
          <button
            type="button"
            className={`view-toggle ${view === 'tactical' ? 'is-on' : ''}`}
            aria-pressed={view === 'tactical'}
            onClick={() => setView(view === 'tactical' ? 'map' : 'tactical')}
          >
            Tactical view
          </button>
          {view === 'tactical' && (
            <button
              type="button"
              className="view-toggle"
              title="Rotate the camera a quarter turn"
              aria-label="Rotate the camera"
              onClick={() => setFacing((facing + 1) % 4)}
            >
              Rotate
            </button>
          )}
        </div>

        {/*
          The stage: the map with the tactical readouts floated over it, the
          way squad-tactics screens annotate the field itself rather than a
          sidebar. The hint says what the current tool wants; the height
          readout answers "how high is that" at the cursor; the legend keeps
          the keyboard discoverable.
        */}
        <div className="map-stage">
          {hint && (
            <div className="hud-hint" role="status">
              {hint}
            </div>
          )}
          {hover && (
            <div className="hud-height">
              <span className="hud-k">Height</span>
              <b>{heightAtHover}</b>
            </div>
          )}
          {/* The phase card, replayed by key on every advance. Decorative:
              the turn panel announces the same turn accessibly. */}
          {banner?.text && (
            <div key={banner.seq} className="turn-banner" aria-hidden="true">
              {banner.text}
            </div>
          )}
          {/*
            The shot list, floating along the map's bottom edge - the chips
            sit where the shooting is, X-COM's shot bar. Same resolveAim as
            clicking a token.
          */}
          {aim && (
            <div className="hud-aim-row">
              <button
                type="button"
                className="hud-aim-banner"
                onClick={() => setAim(null)}
                title="Press to cancel"
              >
                Aiming: <b>{aim.strikes.map((s) => s.label).join(', ')}</b> — Esc cancels
              </button>
              {aimTargets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`hud-target ${t.foe ? '' : 'is-friend'}`}
                  title={`${t.name} — ${Math.round(t.chance * 100)}% to hit, about ${
                    Math.round(t.expected * 10) / 10
                  } damage${t.cover ? ', behind half cover' : ''}${
                    t.blocked ? ', no line of sight' : ''
                  }${t.flanking ? '. Flanked — advantage, if your table uses the optional rule' : ''}${
                    t.high ? `. High ground: +${t.high * 5} ft over them` : ''
                  }`}
                  onClick={() => {
                    const target = encounter.combatants.find((c) => c.id === t.id);
                    if (target) resolveAim(target);
                  }}
                >
                  <b>{t.name}</b>
                  <span className="hud-odds">{Math.round(t.chance * 100)}%</span>
                  <span className="hud-exp">~{Math.round(t.expected)} dmg</span>
                  {t.cover && <i>cover</i>}
                  {t.blocked && <i>no sight</i>}
                  {t.flanking && <i className="is-boon">flanked</i>}
                  {t.high > 0 && <i className="is-boon">high ground</i>}
                </button>
              ))}
            </div>
          )}
          {(() => {
            /* One props object, two cameras: the flat map that prints and
               paints, and the tactical view through FFT's lens. Same tokens,
               same washes, same handlers - only the projection differs. */
            const mapProps = {
              dungeon,
              // While aiming, each targetable token carries its odds - the
              // same number the chip shows, floated over the head X-COM puts
              // it on.
              tokens: aim
                ? tokens.map((t) => {
                    const shot = aimTargets.find((a) => a.id === t.id);
                    return shot ? { ...t, odds: `${Math.round(shot.chance * 100)}%` } : t;
                  })
                : tokens,
              terrain: encounter.terrain,
              elevation: encounter.elevation,
              sight: sightLines,
              zones: [
                ...(encounter.zones ?? []).map((zone) => ({
                  id: zone.id,
                  label: zone.label + (zone.rounds !== undefined ? ` (${zone.rounds})` : ''),
                  tint: zone.tint,
                  origin: zone.at,
                  squares: zoneSquares(zone),
                })),
                ...ghostZone,
              ],
              reach,
              cursor: placing ? hover : null,
              note: rulerNote,
              noteAt: measuring?.to ?? null,
              ruler: measuring ? { points: measuring.points } : null,
              arc:
                placing && hover && (aimFrom ?? selected?.at)
                  ? { from: (aimFrom ?? selected?.at)!, to: hover }
                  : null,
              fog: partyVisible
                ? { visible: partyVisible, explored: new Set(encounter.explored ?? []) }
                : null,
              onMove,
              onPaint: paintAt,
              onHover: setHover,
              onTokenClick: tokenClick,
              onTokenOpen: (id: string) => setPopped(id),
            };
            return view === 'tactical' ? (
              <IsoMap {...mapProps} orientation={facing} />
            ) : (
              <DungeonMap {...mapProps} />
            );
          })()}
          <div className="hud-legend" aria-hidden="true">
            Space ends the turn · Esc cancels · double-click a token opens the sheet
          </div>
        </div>

        {/*
          The lines in words, because a DM narrates: "the archer cannot see
          Goblin B" is a sentence before it is a dashed line. Cover is a note
          rather than a modifier - whether that pillar counts is a ruling.
        */}
        {showSight && selected?.at && sightLines.length > 0 && (
          <p className="muted sight-report" style={{ marginTop: 8 }}>
            <b>{selected ? nameOf(selected) : ''}</b> sees{' '}
            {sightLines.filter((l) => l.visible).length
              ? sightLines
                  .filter((l) => l.visible)
                  .map((l) => `${l.name}${l.cover ? ' (half cover, +2 AC)' : ''}`)
                  .join(', ')
              : 'nobody'}
            {sightLines.some((l) => !l.visible) && (
              <>
                {' '}
                — cannot see{' '}
                {sightLines
                  .filter((l) => !l.visible)
                  .map((l) => l.name)
                  .join(', ')}
              </>
            )}
            .
          </p>
        )}
        {showSight && !selected?.at && (
          <p className="muted" style={{ marginTop: 8 }}>
            Select somebody who is on the map to see their sight lines.
          </p>
        )}

        {/*
          Spells on the ground. Since 23.1 a zone can carry what it DOES -
          the shelf below loads the SRD's standing hazards, and the placed
          zone bites for real: entry damage, end-of-turn damage, real saves,
          walls of force nobody walks through. The custom slate still places
          a drawn-only area for everything richer than the model.
        */}
        <div className="zone-kit" style={{ marginTop: 12 }}>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <label className="field field-sm">
              <span>Spell</span>
              <select
                aria-label="Load a hazard from the shelf"
                value={zoneForm.preset}
                onChange={(e) => {
                  const preset = ZONE_PRESETS.find((p) => p.id === e.target.value);
                  if (!preset) return;
                  setZoneForm({
                    ...zoneForm,
                    preset: preset.id,
                    label: preset.id === 'custom' ? '' : preset.label,
                    shape: preset.shape,
                    feet: preset.feet,
                    rounds: preset.rounds ? String(preset.rounds) : '',
                    dc: preset.effect?.save ? String(preset.effect.save.dc) : '',
                    surface: preset.effect?.surface ?? '',
                  });
                }}
              >
                {ZONE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field-sm" style={{ flex: '1 1 130px' }}>
              <span>Effect</span>
              <input
                type="text"
                placeholder="Wall of fire"
                value={zoneForm.label}
                onChange={(e) => setZoneForm({ ...zoneForm, label: e.target.value })}
              />
            </label>
            {/* What the ground is made of, which is what reacts. A preset
                fills this in; a custom area is whatever you say it is. */}
            <label className="field field-sm">
              <span>Made of</span>
              <select
                aria-label="What this area is made of"
                value={zoneForm.surface}
                onChange={(e) =>
                  setZoneForm({ ...zoneForm, surface: e.target.value as SurfaceKind | '' })
                }
              >
                <option value="">Nothing that reacts</option>
                {SURFACE_KINDS.map((s) => (
                  <option key={s.kind} value={s.kind}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field-sm">
              <span>Shape</span>
              <select
                value={zoneForm.shape}
                onChange={(e) => {
                  const shape = e.target.value as ZoneShape;
                  const sizes = ZONE_SHAPES.find((s) => s.shape === shape)!.sizes;
                  setZoneForm({
                    ...zoneForm,
                    shape,
                    feet: sizes.includes(zoneForm.feet) ? zoneForm.feet : sizes[1] ?? sizes[0],
                  });
                }}
              >
                {ZONE_SHAPES.map((s) => (
                  <option key={s.shape} value={s.shape}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field-sm">
              <span>Size</span>
              <select
                aria-label="Size in feet"
                value={zoneForm.feet}
                onChange={(e) => setZoneForm({ ...zoneForm, feet: Number(e.target.value) })}
              >
                {ZONE_SHAPES.find((s) => s.shape === zoneForm.shape)!.sizes.map((feet) => (
                  <option key={feet} value={feet}>
                    {feet} ft
                  </option>
                ))}
              </select>
            </label>
            <label className="field field-sm">
              <span>Rounds</span>
              <input
                type="number"
                min={1}
                className="qty"
                placeholder="∞"
                aria-label="Rounds it lasts — empty means until removed"
                value={zoneForm.rounds}
                onChange={(e) => setZoneForm({ ...zoneForm, rounds: e.target.value })}
              />
            </label>
            {ZONE_PRESETS.find((p) => p.id === zoneForm.preset)?.effect?.save && (
              <label className="field field-sm">
                <span>Save DC</span>
                <input
                  type="number"
                  min={1}
                  className="qty"
                  aria-label="The save DC this casting uses"
                  value={zoneForm.dc}
                  onChange={(e) => setZoneForm({ ...zoneForm, dc: e.target.value })}
                />
              </label>
            )}
            <button
              type="button"
              className={`btn btn-sm ${placing ? 'btn-primary' : ''}`}
              style={{ alignSelf: 'center' }}
              onClick={() => {
                if (placing) {
                  setPlacing(null);
                  setAimFrom(null);
                  return;
                }
                // The shelf's recipe, with this casting's DC typed over it.
                const preset = ZONE_PRESETS.find((p) => p.id === zoneForm.preset);
                const base: ZoneEffect | undefined = preset?.effect
                  ? {
                      ...preset.effect,
                      save: preset.effect.save
                        ? {
                            ...preset.effect.save,
                            dc: Math.max(1, Number(zoneForm.dc) || preset.effect.save.dc),
                          }
                        : undefined,
                    }
                  : undefined;
                /*
                  The chosen material wins over the preset's, so a DM can draw
                  a plain area and declare it oil - and clearing it back to
                  none means the area reacts to nothing, which is the right
                  answer for a drawn-only marker.
                */
                const effect: ZoneEffect | undefined = zoneForm.surface
                  ? { ...(base ?? {}), surface: zoneForm.surface }
                  : base && base.surface
                    ? { ...base, surface: undefined }
                    : base;
                setPlacing({
                  label: zoneForm.label,
                  shape: zoneForm.shape,
                  feet: zoneForm.feet,
                  rounds: zoneForm.rounds ? Math.max(1, Number(zoneForm.rounds)) : undefined,
                  effect,
                });
              }}
            >
              {placing ? 'Cancel placing' : 'Place on map'}
            </button>
          </div>
          {placing && (
            <p className="muted" style={{ margin: '0 0 8px' }}>
              {ZONE_SHAPES.find((s) => s.shape === placing.shape)?.aimed
                ? aimFrom
                  ? 'Now click the way it points.'
                  : 'Click where it starts, then the way it points.'
                : 'Click the map to place it.'}
            </p>
          )}

          {(encounter.zones ?? []).map((zone) => {
            const inside = combatantsIn(zone, encounter.combatants);
            const effect = zone.effect;
            const does = effect
              ? [
                  effect.damage
                    ? `${effect.damage.dice} ${effect.damage.type}${
                        effect.onEnter && effect.onEndTurn
                          ? ' on entry and turn end'
                          : effect.onEnter
                            ? ' on entry'
                            : effect.onEndTurn
                              ? ' at turn end'
                              : ''
                      }`
                    : '',
                  effect.save
                    ? `${effect.save.ability.toUpperCase()} ${effect.save.dc}${effect.save.half ? ' half' : ''}`
                    : '',
                  effect.blocks ? 'impassable' : '',
                  effect.difficult ? 'difficult ground' : '',
                ]
                  .filter(Boolean)
                  .join(' · ')
              : '';
            return (
              <p key={zone.id} className="zone-row">
                <button
                  className="btn btn-sm"
                  aria-label={`Remove ${zone.label}`}
                  onClick={() => setEncounter(removeZone(encounter, zone.id))}
                >
                  Remove
                </button>{' '}
                <b>{zone.label}</b> — {zone.shape}, {zone.feet} ft
                {zone.rounds !== undefined
                  ? `, ${zone.rounds} round${zone.rounds === 1 ? '' : 's'} left`
                  : ''}
                {does && <span className="src"> · {does}</span>}
                {inside.length > 0 && (
                  <span className="src"> · inside: {inside.map(nameOf).join(', ')}</span>
                )}
              </p>
            );
          })}
        </div>

        {/*
          A place to write what is in each room. The map gives you numbered
          rooms so a DM can say "the third one"; this is where the third one
          gets a name. Not stored - a seed reproduces the map, and notes belong
          wherever the DM keeps their notes.
        */}
        <p className="muted" style={{ marginTop: 8 }}>
          Rooms are numbered left to right so you can say which one out loud. Any text works as a
          seed — <b>the sunken abbey</b> is easier to write in your notes than a number, and gives
          the same map every time.
        </p>
      </Panel>
  );

  /*
    The right rail: whoever is selected, in whatever form suits them.

    A character gets the compact play card - a view onto the same `PlayState`
    their sheet reads, so a hit point spent here is spent there. A monster gets
    its stat block plus the two controls that only make sense next to it, since
    a monster has no sheet to pop out to and its hit points live on the
    combatant.
  */
  const selectedTitle = selected ? nameOf(selected) : 'Nobody selected';

  /*
    The turn control, at the top of the right pane - the one piece of the
    retired dock that had to stay always reachable. Space and N still work;
    this is the button. The pane below it follows the turn (see advance),
    so after End turn this column is the active combatant's cockpit.
  */
  const turnPanel = (
    <div className="turn-panel">
      <span className="turn-panel-who">
        <span className="hud-k">
          {isRunning(encounter) ? `Round ${encounter.round}` : 'Standby'}
        </span>
        <b>
          {isRunning(encounter) && active
            ? `${nameOf(active)} is up`
            : order.length
              ? 'Ready when you are.'
              : 'Add combatants to begin.'}
        </b>
      </span>
      <button
        type="button"
        className="hud-advance"
        disabled={order.length === 0}
        onClick={advance}
      >
        {isRunning(encounter) ? 'End turn ▶' : '▶ Start the fight'}
      </button>
    </div>
  );

  const selectedPanel = !selected ? (
    <p className="muted">
      Pick somebody in the turn order to see what is left of them.
    </p>
  ) : selectedEntry ? (
    <PlayCard
      ctx={derived.get(selectedEntry.id)!.ctx}
      play={selectedEntry.play}
      // The cockpit's box stands open like the monster rail's - one glance
      // answers "what can they do", no pip press first.
      standing
      onPlayChange={(next) => onChange(updatePlay(roster, selectedEntry.id, next))}
      onPopOut={() => setPopped(selected.id)}
      onAim={(strikes) => {
        // One tool in hand at a time: aiming puts the walk down.
        setMoveArmed(false);
        setAim({ attacker: nameOf(selected), attackerId: selected.id, strikes });
      }}
      onMoveCommand={
        !isRunning(encounter) || selected.id === active?.id
          ? () => {
              setAim(null);
              setMoveArmed(true);
            }
          : undefined
      }
      onShove={
        !isRunning(encounter) || selected.id === active?.id
          ? (mode) => {
              setAim(null);
              setMoveArmed(false);
              setShoving({ byId: selected.id, mode });
            }
          : undefined
      }
      onAct={({ play, build, log }) => {
        /*
          One command, one write. A potion is a build write, a play write and
          a log line at once; composing them here is what keeps the menu from
          issuing three onChange calls built from the same snapshot, where
          each would erase the one before.
        */
        let updated = roster;
        if (build) {
          updated = {
            ...updated,
            entries: updated.entries.map((e) =>
              e.id === selectedEntry.id ? { ...e, build, updatedAt: Date.now() } : e,
            ),
          };
        }
        if (log) {
          updated = updateEncounter(updated, appendLog(encounter, `${nameOf(selected)} ${log}`));
        }
        if (play) updated = updatePlay(updated, selectedEntry.id, play);
        onChange(updated);
      }}
      onHide={() => rollHide(selected, true)}
    />
  ) : selectedMonster ? (
    <div className="rail-monster">
      <div className="row" style={{ gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-sm" onClick={() => applyHp(selected, 5)}>
          −5
        </button>
        <button className="btn btn-sm" onClick={() => applyHp(selected, -5)}>
          +5
        </button>
        <button className="btn btn-sm" onClick={() => setPopped(selected.id)}>
          Pop out
        </button>
      </div>

      {/* The monster's movement, the same per-turn resource the dock used to
          read out - 16.7 tracks it on the combatant. */}
      {selected.kind === 'monster' &&
        (() => {
          const speed = speedOf(selected);
          const left = Math.max(0, speed - (selected.moved ?? 0));
          return (
            <div className="pcard-movebar hud-move" title={`${left} of ${speed} feet left this turn`}>
              <span className="hud-k">Move</span>
              <span className="hud-move-bar" aria-hidden="true">
                <i style={{ width: `${speed ? Math.min(100, (left / speed) * 100) : 0}%` }} />
              </span>
              <b>
                {left}
                <span className="of">/{speed} ft</span>
              </b>
            </div>
          );
        })()}

      {/*
        Its reaction and its stance, which are per-turn facts the DM has to be
        able to see: a goblin that already swung at somebody walking past gets
        nothing when the next person does, and there is no other way to tell.
        Silent when neither has happened, so an ordinary turn stays quiet.
      */}
      {selected.kind === 'monster' && (selected.reactionSpent || selected.stance) && (
        <p className="hint" style={{ marginTop: 0 }}>
          {[
            selected.reactionSpent ? 'Reaction spent' : '',
            selected.stance === 'disengage' ? 'Disengaging' : '',
            selected.stance === 'dodge' ? 'Dodging' : '',
          ]
            .filter(Boolean)
            .join(' · ')}
          {' — back at the start of its next turn.'}
        </p>
      )}

      {/*
        The turn it would take, if it were driving itself.

        Above the command menu rather than instead of it: this is a proposal,
        and the menu underneath is how the DM disagrees. The reasoning is
        shown because a plan you cannot argue with is one you cannot sensibly
        override, and the DM is the one who knows these goblins are cowards.
      */}
      {enemyPlan && (
        <div className="rail-plan">
          <div className="rail-plan-head">
            <span className="hud-k">Its turn</span>
            <button className="btn btn-sm btn-primary" onClick={runPlan}>
              Run it
            </button>
          </div>
          <p className="rail-plan-why">{enemyPlan.reason}</p>
        </div>
      )}

      {/* The monster's command menu, standing open - Attack drills into the
          stat block's aimable rows, the rest are the table's own commands. */}
      {selected.kind === 'monster' && (
        <MonsterCommandMenu
          monster={selectedMonster}
          combatant={selected}
          onAim={(strikes) => {
            setMoveArmed(false);
            setAim({ attacker: nameOf(selected), attackerId: selected.id, strikes });
          }}
          onMove={
            !isRunning(encounter) || selected.id === active?.id
              ? () => {
                  setAim(null);
                  setMoveArmed(true);
                }
              : undefined
          }
          onShove={
            !isRunning(encounter) || selected.id === active?.id
              ? (mode) => {
                  // One tool in hand: arming a shove puts the walk and the
                  // aim down, the way arming either of those does.
                  setAim(null);
                  setMoveArmed(false);
                  setShoving({ byId: selected.id, mode });
                }
              : undefined
          }
          onStance={
            !isRunning(encounter) || selected.id === active?.id
              ? (stance) => {
                  // The state and the line in one write: two would each build
                  // from this render's encounter and the second would win.
                  setEncounter(
                    appendLog(
                      setMonsterStance(encounter, selected.id, stance),
                      `${nameOf(selected)} takes the ${
                        stance === 'disengage' ? 'Disengage' : 'Dodge'
                      } action.`,
                    ),
                  );
                }
              : undefined
          }
          onUse={(ability, note) => {
            const usage = parseUsage(ability.usage);
            let enc = encounter;
            if (usage?.kind === 'recharge') {
              enc = setMonsterRecharge(enc, selected.id, ability.name, false);
            } else if (usage?.kind === 'perDay') {
              enc = spendMonsterUse(enc, selected.id, ability.name);
            }
            setEncounter(appendLog(enc, note));
          }}
          onRecharge={(ability, ready, rolled) => {
            let enc = ready
              ? setMonsterRecharge(encounter, selected.id, ability.name, true)
              : encounter;
            enc = appendLog(
              enc,
              `${nameOf(selected)} rolls recharge for ${ability.name}: ${rolled} — ${
                ready ? 'it is back' : 'not yet'
              }.`,
            );
            setEncounter(enc);
          }}
          onLog={(text) => setEncounter(appendLog(encounter, `${nameOf(selected)} ${text}`))}
          onHide={() => rollHide(selected)}
        />
      )}

      {/* Conditions, removable in place, with the dock's quick-add - into
          the combatant, where a monster's conditions live. */}
      {selected.kind === 'monster' && (
        <div className="rail-conditions">
          {selected.conditions.map((id) => (
            <button
              key={id}
              type="button"
              className="tag hud-condition"
              title={`${CONDITIONS_BY_ID[id]?.summary ?? ''} — press to remove`}
              onClick={() => setEncounter(toggleMonsterCondition(encounter, selected.id, id))}
            >
              {CONDITIONS_BY_ID[id]?.name ?? id} ×
            </button>
          ))}
          {/*
            Of what? Frightened and charmed both turn on who caused them, and
            without the answer neither rule can be applied - so it is asked
            right where the condition was set rather than buried in a dialog.
          */}
          {selected.conditions
            .filter((id) => CONDITIONS_WITH_A_SOURCE.includes(id))
            .map((id) => (
              <select
                key={`src-${id}`}
                className="hud-add-condition"
                aria-label={`What ${nameOf(selected)} is ${CONDITIONS_BY_ID[id]?.name.toLowerCase() ?? id} of`}
                value={selected.conditionSources?.[id] ?? ''}
                onChange={(e) =>
                  setEncounter(
                    setConditionSource(encounter, selected.id, id, e.target.value || undefined),
                  )
                }
              >
                <option value="">{CONDITIONS_BY_ID[id]?.name ?? id} of…</option>
                {encounter.combatants
                  .filter((c) => c.id !== selected.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {nameOf(c)}
                    </option>
                  ))}
              </select>
            ))}
          <input
            type="number"
            min={1}
            className="hud-rounds"
            placeholder="∞"
            aria-label="Rounds the next condition lasts — empty means until removed"
            title="Rounds the next condition lasts — empty means until removed"
            value={monsterRounds}
            onChange={(e) => setMonsterRounds(e.target.value)}
          />
          <select
            className="hud-add-condition"
            aria-label={`Add a condition to ${nameOf(selected)}`}
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              const id = e.target.value;
              /*
                A zombie cannot be poisoned. The stat blocks have carried
                `conditionImmunities` since §8 and nothing ever read them, so
                the select would cheerfully hang any condition on anything.
                Refused with a reason rather than silently ignored - a control
                that does nothing and says nothing is the worse failure.
              */
              const immunities = byId.get(selected.monsterId)?.conditionImmunities ?? [];
              if (immunities.includes(id)) {
                setEncounter(
                  appendLog(
                    encounter,
                    `${nameOf(selected)} is immune to ${CONDITIONS_BY_ID[id]?.name ?? id}.`,
                  ),
                );
                setMonsterRounds('');
                return;
              }
              setEncounter(
                monsterRounds
                  ? addTimedMonsterCondition(
                      encounter,
                      selected.id,
                      id,
                      Math.max(1, Number(monsterRounds)),
                    )
                  : toggleMonsterCondition(encounter, selected.id, id),
              );
              setMonsterRounds('');
            }}
          >
            <option value="">+ condition</option>
            {CONDITIONS.filter(
              (c) =>
                selected.kind === 'monster' &&
                !selected.conditions.includes(c.id) &&
                // Not offered at all when the stat block says it cannot land.
                !(byId.get(selected.monsterId)?.conditionImmunities ?? []).includes(c.id),
            ).map(
              (c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ),
            )}
          </select>
        </div>
      )}

      {/*
        Legendary actions, spent between other creatures' turns - which is why
        they live on the *selected* monster in the rail rather than on the
        active one's tray: the dragon acts when it is not the dragon's turn.
        Three a round, back at the start of its own; the engine resets them.
      */}
      {selectedMonster.legendary.length > 0 && selected.kind === 'monster' && (
        <div className="rail-legendary">
          <span className="hud-k">
            Legendary · {Math.max(0, 3 - (selected.legendarySpent ?? 0))}/3
          </span>
          {selectedMonster.legendary.map((ability) => {
            const cost = legendaryCost(ability);
            const left = 3 - (selected.legendarySpent ?? 0);
            return (
              <button
                key={ability.name}
                type="button"
                className="hud-act hud-act-sub"
                disabled={cost > left}
                title={ability.desc}
                onClick={() =>
                  setEncounter(
                    appendLog(
                      spendLegendary(encounter, selected.id, cost),
                      `${nameOf(selected)} uses ${ability.name} (${cost} legendary).`,
                    ),
                  )
                }
              >
                {ability.name}
              </button>
            );
          })}
        </div>
      )}

      <MonsterCard monster={selectedMonster} />
    </div>
  ) : (
    <p className="muted">
      {missingBlock(loading)} Their hit points are still on the row — those live in the fight.
    </p>
  );

  const poppedPanel = (
    <>
      {poppedOut && (
        <PopOut title={nameOf(poppedOut)} onClose={() => setPopped(null)}>
          {poppedOut.kind === 'monster' ? (
            byId.get(poppedOut.monsterId) ? (
              <MonsterCard monster={byId.get(poppedOut.monsterId)!} />
            ) : (
              <p className="muted">{missingBlock(loading)}</p>
            )
          ) : (
            /*
              The character's real sheet, not a summary of it. It is the same
              component the Character sheet tab renders and it is wired to the
              same roster entry, so a hit point changed here is changed there
              and on the DM's own row - which is the point of portalling rather
              than copying.
            */
            poppedEntry && (
              <CharacterSheet
                ctx={derived.get(poppedEntry.id)!.ctx}
                play={poppedEntry.play}
                onPlayChange={(next) => onChange(updatePlay(roster, poppedEntry.id, next))}
                onBuildChange={(build) =>
                  onChange({
                    ...roster,
                    entries: roster.entries.map((e) =>
                      e.id === poppedEntry.id ? { ...e, build, updatedAt: Date.now() } : e,
                    ),
                  })
                }
              />
            )
          )}
        </PopOut>
      )}
    </>
  );

  /*
    The hit flash: when anybody's hit points drop between renders, bump their
    counter so the token and tile remount and the animation replays. A ref
    remembers the last numbers; the effect only ever narrows the diff, so it
    cannot loop.
  */
  const lastHp = useRef<Record<string, number>>({});
  useEffect(() => {
    const dropped: string[] = [];
    const deltas: { id: string; delta: number }[] = [];
    for (const combatant of encounter.combatants) {
      const hp = hpOf(combatant);
      if (!hp) continue;
      const before = lastHp.current[combatant.id];
      if (before !== undefined && hp.now < before) dropped.push(combatant.id);
      if (before !== undefined && hp.now !== before) {
        deltas.push({ id: combatant.id, delta: hp.now - before });
      }
      lastHp.current[combatant.id] = hp.now;
    }
    if (dropped.length) {
      setFlashes((prev) => {
        const next = { ...prev };
        for (const id of dropped) next[id] = (next[id] ?? 0) + 1;
        return next;
      });
    }
    if (deltas.length) {
      // The floating number: every change, hurt or healed, rises off the
      // token once - the seq is what replays the animation.
      setFloats((prev) => {
        const next = { ...prev };
        for (const { id, delta } of deltas) {
          next[id] = {
            seq: (prev[id]?.seq ?? 0) + 1,
            text: delta > 0 ? `+${delta}` : `${delta}`,
            heal: delta > 0,
          };
        }
        return next;
      });
    }
    // hpOf is derived from exactly these two inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounter.combatants, roster.entries]);

  /*
    The battle from the keyboard: Space or N ends the turn, Escape puts down
    whatever is in hand - the aim first, then the spell, then the save
    results - one thing per press, most urgent first.
  */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === 'Escape') {
        if (aim) setAim(null);
        else if (shoving) setShoving(null);
        else if (moveArmed) setMoveArmed(false);
        else if (placing) {
          setPlacing(null);
          setAimFrom(null);
        } else if (saveResults) setSaveResults(null);
        return;
      }
      if ((e.key === ' ' || e.key.toLowerCase() === 'n') && isRunning(encounter)) {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /*
    The HUD: the strip above the map, the bar below it.

    Both are windows onto state that already exists - the strip onto the same
    sorted order the rail lists, the bar onto the same `PlayState` the sheet
    tracks - so neither can drift from anything.
  */
  // The queue counted from whoever is up: 1 is acting, 2 is next - the way
  // Tactics numbers its timeline, wrapping through the bottom of the round.
  const activeIdx = Math.max(0, active ? order.findIndex((c) => c.id === active.id) : 0);
  const stripTiles = order.map((c, i) => {
    /*
      The tile's clocks, FFT's forecast: timed conditions with the rounds
      they have left, and the concentration a hit would break. Round
      granularity, same as the clocks themselves.
    */
    const entry = c.kind === 'character' ? roster.entries.find((e) => e.id === c.rosterId) : null;
    const timers = (c.kind === 'monster' ? c.conditionTimers : entry?.play.conditionTimers) ?? {};
    const notes = Object.entries(timers).map(
      ([id, rounds]) => `${(CONDITIONS_BY_ID[id]?.name ?? id).toLowerCase()} ${rounds}`,
    );
    if (entry?.play.concentratingOn) notes.push(`conc: ${entry.play.concentratingOn}`);
    if (c.kind === 'monster' && c.dormant) notes.unshift('dormant');
    if (c.hidden !== undefined) notes.unshift(`hidden ${c.hidden}`);
    return {
      id: c.id,
      name: nameOf(c),
      initiative: c.initiative,
      order: ((i - activeIdx + order.length) % order.length) + 1,
      portrait:
        c.kind === 'character'
          ? roster.entries.find((e) => e.id === c.rosterId)?.build.details.portrait
          : undefined,
      hp: hpOf(c),
      kind: c.kind,
      active: c.id === active?.id,
      selected: c.id === selected?.id,
      flash: flashes[c.id],
      notes,
    };
  });
  /*
    Displayed as the timeline it claims to be: whoever is up leads, the rest
    follow in queue order, and the round boundary sits where the wrap really
    happens - with whatever ends there written on the divider.
  */
  const rotatedTiles = [...stripTiles.slice(activeIdx), ...stripTiles.slice(0, activeIdx)];
  const running = isRunning(encounter);
  const strip = (
    <InitiativeStrip
      round={encounter.round}
      tiles={rotatedTiles}
      wrapAfter={running ? order.length - activeIdx - 1 : undefined}
      wrapLabel={running ? `R${encounter.round + 1}` : undefined}
      wrapNotes={(encounter.zones ?? [])
        .filter((zone) => zone.rounds === 1)
        .map((zone) => `${zone.label} ends`)}
      onSelect={choose}
    />
  );


  /*
    Three columns, the shape a session wants.

    Turn order on the left because it is the question that never stops being
    live. The map in the middle because it is what everyone is looking at. The
    selected combatant on the right because "what is left of them" is the other
    question, and it changes every few seconds.

    Everything else - the forecast, the bestiary - lives in the centre under the
    map, where it is reachable without displacing either rail.
  */
  return (
    <Workspace
      id="table"
      left={{ title: 'Turn order', content: <>{fightPanel}{debriefPanel}{logPanel}{partyPanel}</> }}
      right={{ title: selectedTitle, content: <>{turnPanel}{selectedPanel}</> }}
    >
      {strip}
      {dungeonPanel}
      {savesPanel}
      {forecastPanel}
      {monstersPanel}
      {libraryPanel}
      {poppedPanel}
    </Workspace>
  );
}
