import { useState } from 'react';
import { ABILITIES, ABILITY_NAMES } from '../types';
import type { Ability, Build, CharacterDetails, ClassId } from '../types';
import { CASTING_TIME_LABELS, SPELLS_BY_ID } from '../data/spells';
import { sourceForSpell } from '../engine/spellcasting';
import { damageDice } from '../data/weapons';
import { RARITY_LABELS } from '../data/magicItems';
import { formatWeight } from '../data/gear';
import { ammunitionCarried, describePurse } from '../engine/inventory';
import { BACKGROUNDS_BY_ID } from '../data/backgrounds';
import { ARMOR_CATEGORY_LABEL } from '../data/armor';
import { armorProficiencies } from '../engine/defense';
import type { BuildContext } from '../engine/character';
import { describeSpell } from '../engine/spellRecommend';
import { RECHARGE_LABEL, heldResources, rechargeFor, restoredKeys } from '../engine/resources';
import { describeComponents } from '../engine/components';
import { SORCERY_POINT_SLOT_COSTS } from '../data/classResources';
import { CONDITIONS, conditionText } from '../data/conditions';
import { MAX_EXHAUSTION, exhaustionLines } from '../engine/exhaustion';
import { RulesDisclosure } from './RulesText';
import { consumeItem, isConsumable, quantityOf } from '../engine/items';
import { RUN_UP_FEET, describeJump, jumpDistances, movementFor } from '../engine/movement';
import { Portrait } from './Portrait';
import {
  applyDeathSaveRoll,
  clearDeathSaves,
  clearRolls,
  damage,
  heal,
  hitDiceLeft,
  hpNow,
  isFresh,
  longRest,
  recordDeathSave,
  resourceLeft,
  restorePact,
  restoreResource,
  restoreSlot,
  setResourceSpent,
  setExhaustion,
  setTempHp,
  shortRest,
  startOfEncounter,
  toggleCondition,
  ammoLeft,
  spendAmmo,
  setAmmoLeft,
  recoverAmmo,
  restockAmmo,
  slotsLeft,
  slotsTotal,
  createSlotWithPoints,
  convertSlotToPoints,
  spendHitDie,
  spendPact,
  spendResource,
  spendSlot,
  recordRoll,
  newTurn,
  toggleTurnSlot,
  moveBy,
  movementBudget,
  movementLeft,
  dash,
  customValue,
  stepCustom,
  setCustomValue,
} from '../play';
import type { PlayState, TurnSlot } from '../play';
import { defaultRng, parseNotation, rollD20, rollDamage, rollDie, rollNotation } from '../engine/dice';
import type { D20Mode, RollKind } from '../engine/dice';

/**
 * The paper character sheet, on screen.
 *
 * The whole point is that there is one layout, not two. Every other tool keeps
 * a web view and a separate "export to PDF" that looks nothing like it; here
 * the boxes you read on screen are the boxes that come out of the printer,
 * because they are the same elements with the app chrome removed. If a number
 * moves on screen it moves on paper.
 *
 * That makes this the natural home for what used to be a separate "In play"
 * panel. A paper sheet already has boxes for current hit points, temporary hit
 * points, hit dice and death saves - a tracker bolted on beside it would be
 * duplicating the sheet rather than filling it in. So the boxes are live: the
 * pips are buttons, current hit points is an input, and what you write in them
 * is session state rather than an edit to the character.
 *
 * The few things that are genuinely controls rather than content - the damage
 * and healing buttons, the rest buttons - carry `cs-screen` and are dropped
 * from the printed page. They are how you fill the box in, not what is in it.
 */

/**
 * The three things you get one of a turn, with the reminder each one needs.
 *
 * The hints are the rules people play wrong, not definitions: that a bonus
 * action needs something that says "bonus action" rather than being a second
 * small action, and that the reaction comes back at the start of your turn
 * rather than the end of it.
 */
const TURN_SLOTS: { slot: TurnSlot; label: string; hint: string }[] = [
  {
    slot: 'action',
    label: 'Action',
    hint: 'Attack, Cast a Spell, Dash, Disengage, Dodge, Help, Hide, Ready, Search, Use an Object.',
  },
  {
    slot: 'bonusAction',
    label: 'Bonus action',
    hint: 'Only when a feature or spell says "bonus action". You do not get one otherwise.',
  },
  {
    slot: 'reaction',
    label: 'Reaction',
    hint: 'One between turns - an opportunity attack, a Shield, a Counterspell. You get it back at the start of your next turn, not at the end of this one.',
  },
];

function signed(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

/** A bordered box with the small caps label the paper sheet uses. */
function Box({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`cs-box ${className}`}>
      <div className="cs-box-body">{children}</div>
      <h3 className="cs-label">{label}</h3>
    </section>
  );
}

/** A row of pips that spend left to right, the way you tick off a paper sheet. */
function Pips({
  total,
  left,
  label,
  kind = '',
  count = false,
  onSpend,
  onRestore,
}: {
  total: number;
  left: number;
  label: string;
  kind?: string;
  /** Show "3/5" beside the circles, for anything you might have a lot of. */
  count?: boolean;
  onSpend: () => void;
  onRestore: () => void;
}) {
  return (
    <>
      <span className="cs-pips">
        {Array.from({ length: total }, (_, i) => (
          <button
            key={i}
            className={`pip ${kind} ${i < left ? 'is-full' : ''}`}
            aria-label={`${label} ${i + 1}`}
            title={i < left ? 'Spend' : 'Restore'}
            onClick={() => (i < left ? onSpend() : onRestore())}
          />
        ))}
      </span>
      {count && (
        <span className="cs-count">
          {left}/{total}
        </span>
      )}
    </>
  );
}

/**
 * A number on the sheet that you can roll by clicking it.
 *
 * It is the number itself rather than a button beside it, for the same reason
 * the pips are buttons: the sheet has one layout, and a column of "roll" links
 * next to every skill would be a control panel bolted onto a paper sheet. On
 * paper this prints as the plain text it looks like - `.cs-roll` carries no
 * border or background of its own, only a hover affordance the printer never
 * sees.
 */
function Rollable({
  label,
  onRoll,
  className = '',
  children,
}: {
  label: string;
  onRoll: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className={`cs-roll ${className}`} title={`Roll ${label}`} onClick={onRoll}>
      {children}
    </button>
  );
}

/** A written-in field: an input that reads as handwriting, not a form. */
function Written({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="cs-written">
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      />
      <span>{label}</span>
    </label>
  );
}

function Prose({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <div className="cs-prose">
      <textarea
        rows={rows}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      />
      <h3 className="cs-label">{label}</h3>
    </div>
  );
}

export function CharacterSheet({
  ctx,
  play,
  onPlayChange,
  onBuildChange,
}: {
  ctx: BuildContext;
  play: PlayState;
  onPlayChange: (play: PlayState) => void;
  onBuildChange: (build: Build) => void;
}) {
  const [amount, setAmount] = useState('');
  /*
    Advantage is a state of the character right now, not of one button, so it
    is chosen once and applies to every d20 until it is changed. The
    alternative - three buttons on each of eighteen skills, or a modifier key
    nobody discovers - is worse in both directions.
  */
  const [mode, setMode] = useState<D20Mode>('normal');

  const { build, proficiencies: profs, spellcasting: casting } = ctx;
  const details = build.details;
  const background = build.backgroundId ? BACKGROUNDS_BY_ID[build.backgroundId] : undefined;
  const armor = [...armorProficiencies(ctx.slices, ctx.race, ctx.featIds, build.ruleset)];
  const setDetail = (partial: Partial<CharacterDetails>) =>
    onBuildChange({ ...build, details: { ...details, ...partial } });

  const max = ctx.hp.total;
  const current = hpNow(play, max);
  const down = current === 0;

  // Read once rather than at each use: the movement tracker measures against
  // the same number the Speed chip prints, armor penalty and Boots of Speed
  // and all.
  const speed = ctx.speed.total;
  /*
    §65. The other ways this character gets about, and how far they jump.

    The jump distances are the half a player actually asks for at a table -
    "can I clear that?" - and the app has never had an answer, because the
    numbers are a rule rather than a stat: the long jump is your Strength
    *score*, which appears nowhere else on a sheet as a distance.
  */
  const movement = movementFor(ctx);
  const jump = jumpDistances(ctx.scores, ctx.mods, movement);
  const customResources = build.customResources ?? [];

  const value = Math.max(0, Math.round(Number(amount) || 0));
  const apply = (fn: (n: number) => void) => {
    if (value > 0) fn(value);
    setAmount('');
  };

  // Saving throws come from your starting class only; a multiclass dip grants
  // none, which is the same rule the armor and weapon tables follow.
  const saveAbilities = new Set<Ability>(ctx.slices[0]?.klass.saves ?? []);

  const classLine = ctx.slices
    .map((s) => `${s.klass.name}${s.subclass ? ` (${s.subclass.name})` : ''} ${s.entry.level}`)
    .join(' / ');

  const hitDice = ctx.slices.map((slice) => ({
    classId: slice.klass.id,
    name: slice.klass.name,
    die: slice.klass.hitDie,
    total: slice.entry.level,
    left: hitDiceLeft(play, slice.klass.id, slice.entry.level),
  }));
  const hitDiceByClass = Object.fromEntries(hitDice.map((d) => [d.classId, d.total]));

  /*
    Rolling.

    Every roll goes through one of these three so the log entry and the state
    change happen together - a roll that updated the sheet without saying what
    it was would be indistinguishable from a misclick.
  */
  const logRoll = (
    next: PlayState,
    kind: RollKind,
    label: string,
    result: { total: number; working: string; natural?: 20 | 1 | null },
  ) =>
    onPlayChange(
      recordRoll(next, {
        kind,
        label,
        total: result.total,
        working: result.working,
        ...(result.natural ? { natural: result.natural } : {}),
      }),
    );

  /** A d20 roll under the current advantage setting: checks, saves, attacks. */
  const rollCheck = (kind: RollKind, label: string, modifier: number) =>
    logRoll(play, kind, label, rollD20(modifier, mode, defaultRng));

  /** Damage, which is not a d20 and so is never rolled with advantage. */
  const rollDamageLine = (label: string, notation: string, crit: boolean) => {
    const parsed = parseNotation(notation);
    if (!parsed) return;
    logRoll(play, 'damage', crit ? `${label} (critical)` : label, rollDamage(parsed, crit, defaultRng));
  };

  /**
   * Spend a hit die and heal by it, in one press.
   *
   * A hit die restores its roll plus your Constitution modifier, and a
   * negative modifier can only take the healing to zero rather than into
   * damage - so the two are clamped together rather than applied separately.
   */
  const rollHitDie = (classId: ClassId, die: number, total: number, className: string) => {
    const face = rollDie(die, defaultRng);
    const healed = Math.max(0, face + ctx.mods.con);
    const conPart = ctx.mods.con ? ` ${signed(ctx.mods.con)}` : '';
    logRoll(
      heal(spendHitDie(play, classId, total), healed, max),
      'hit-die',
      `${className} hit die`,
      { total: healed, working: `1d${die}: ${face}${conPart} = ${healed} healed` },
    );
  };

  /**
   * Drink it, read it, use it up.
   *
   * The potion goes whether or not the app knows what it does: 41 potions and
   * 12 scrolls are catalogued and only the four healing potions have an effect
   * this app has anywhere to put, so the rest are consumed and logged and what
   * they do is left to the description and the table. Silently refusing to
   * spend a Potion of Speed because the app cannot model haste would be a
   * worse answer than spending it.
   *
   * Healing rolls for real, through the same dice engine as everything else,
   * and lands in the same log - so "I drank a potion and got 6" is on the
   * record next to the attack roll that made it necessary.
   */
  const consumeCarried = (index: number) => {
    const resolved = ctx.items[index];
    if (!resolved) return;

    const heals = resolved.item?.use?.heals;
    const spent = { ...build, items: consumeItem(build.items, index) };
    onBuildChange(spent);

    if (!heals) {
      logRoll(play, 'check', `Used ${resolved.name}`, { total: 0, working: 'no roll' });
      return;
    }
    const parsed = parseNotation(heals);
    if (!parsed) return;
    const rolled = rollNotation(parsed, defaultRng);
    logRoll(heal(play, rolled.total, max), 'check', `${resolved.name}`, {
      total: rolled.total,
      working: `${rolled.working} healed`,
    });
  };

  /** A death saving throw, with its two special faces applied by the rules. */
  const rollDeathSave = () => {
    // Never with advantage: a death save has no ability behind it, so nothing
    // that grants advantage on a check or a save reaches it by default.
    const result = rollD20(0, 'normal', defaultRng);
    const outcome =
      result.natural === 20
        ? 'up with 1 hit point'
        : result.natural === 1
          ? 'two failures'
          : result.total >= 10
            ? 'success'
            : 'failure';
    logRoll(applyDeathSaveRoll(play, result, max), 'death-save', 'Death save', {
      ...result,
      working: `${result.working} · ${outcome}`,
    });
  };

  const ammo = ammunitionCarried(build);
  const resources = heldResources(ctx.slices, build.ruleset, ctx.mods);
  const shortRechargeKeys = restoredKeys(resources, 'short');
  const encounterKeys = restoredKeys(resources, 'encounter');

  const spellsByLevel = new Map<number, typeof casting.chosen>();
  const grantedIds = new Set(casting.granted.map((s) => s.id));
  for (const spell of [...casting.castable].sort((a, b) => a.name.localeCompare(b.name))) {
    spellsByLevel.set(spell.level, [...(spellsByLevel.get(spell.level) ?? []), spell]);
  }
  const spellLevels = [...spellsByLevel.keys()].sort((a, b) => a - b);

  /*
    A caster with two save DCs printed above needs to know which one a given
    spell uses, or the two headers are a puzzle rather than an answer. Only
    said where it is a real question: one casting class, or a spell only one of
    them could have taught, and the class is already the obvious one.
  */
  const castAs = (spell: { id: string; classes: string[] }) => {
    if (casting.sources.length < 2) return null;
    if (casting.sources.filter((s) => spell.classes.includes(s.classId)).length < 2) return null;
    const { source, assumed } = sourceForSpell(
      SPELLS_BY_ID[spell.id],
      casting.sources,
      build.spellSources?.[spell.id],
    );
    return source ? `${source.className} DC ${source.saveDc}${assumed ? ' (assumed)' : ''}` : null;
  };

  const maxSlotLevel = casting.bySpellLevel.reduce((n, count, i) => (count > 0 ? i + 1 : n), 0);
  const slotLevels = Array.from(
    new Set([
      ...spellLevels.filter((l) => l > 0),
      ...Array.from({ length: maxSlotLevel }, (_, i) => i + 1),
      // A slot conjured at a level you do not otherwise have still needs a row,
      // or it would be paid for and then invisible.
      ...play.slotsCreated.flatMap((count, i) => (count > 0 ? [i + 1] : [])),
    ]),
  ).sort((a, b) => a - b);

  // Font of Magic is offered where the slots are rather than where the points
  // are, because the exchange is a thing you do to a slot.
  const sorceryPoints = resources.find((held) => held.resource.id === 'sorcery-points');

  return (
    <article className="cs">
      {/*
        The sheet's box labels are h3, which left a jump from the app's h1
        straight to them. This is the level in between - it is not printed and
        not shown, it is there so the outline of the page is a shape rather
        than a hole.
      */}
      <h2 className="sr-only">{build.name || 'Character'} — character sheet</h2>
      <header className="cs-banner">
        {/* Left of the name, where a paper sheet puts it. Prints, because a
            portrait *is* part of the sheet rather than a control on it. */}
        <Portrait details={details} onChange={setDetail} />
        <div className="cs-namebox">
          <input
            className="cs-charname"
            value={build.name}
            placeholder="Unnamed"
            aria-label="Character name"
            onChange={(e) => onBuildChange({ ...build, name: e.target.value })}
          />
          <h3 className="cs-label">Character name</h3>
        </div>

        <div className="cs-headgrid">
          <div className="cs-headfield">
            <b>{classLine}</b>
            <span>Class &amp; level</span>
          </div>
          <div className="cs-headfield">
            <b>{background?.name ?? '—'}</b>
            <span>Background</span>
          </div>
          <Written
            label="Player name"
            value={details.playerName}
            onChange={(playerName) => setDetail({ playerName })}
          />
          <div className="cs-headfield">
            <b>{ctx.race.name}</b>
            <span>{build.ruleset === '2024' ? 'Species' : 'Race'}</span>
          </div>
          <Written
            label="Alignment"
            value={details.alignment}
            onChange={(alignment) => setDetail({ alignment })}
            placeholder="Neutral good"
          />
          <Written
            label="Experience points"
            value={details.experience}
            onChange={(experience) => setDetail({ experience })}
          />
        </div>
      </header>

      <div className="cs-body">
        {/* ------------------------------------------------ column one */}
        <div className="cs-col">
          <div className="cs-lead">
            <div className="cs-abilities">
              {ABILITIES.map((ability) => (
                <div className="cs-ability" key={ability}>
                  <div className="k">{ABILITY_NAMES[ability]}</div>
                  <div className="score">{ctx.scores[ability]}</div>
                  <div className="mod">
                    <Rollable
                      label={`a ${ABILITY_NAMES[ability]} check`}
                      onRoll={() =>
                        rollCheck('check', `${ABILITY_NAMES[ability]} check`, ctx.mods[ability])
                      }
                    >
                      {signed(ctx.mods[ability])}
                    </Rollable>
                  </div>
                </div>
              ))}
            </div>

            <div className="cs-lead-right">
              <div className="cs-chip">
                <b>{signed(ctx.proficiency)}</b>
                <span>Proficiency bonus</span>
              </div>

              <Box label="Saving throws" className="cs-marks">
                <ul className="cs-list">
                  {ABILITIES.map((ability) => {
                    const proficient = saveAbilities.has(ability);
                    const bonus =
                      ctx.mods[ability] +
                      (proficient ? ctx.proficiency : 0) +
                      ctx.itemEffects.saves;
                    return (
                      <li key={ability}>
                        <span className={`dot ${proficient ? 'on' : ''}`} />
                        <span className="val">
                          <Rollable
                            label={`a ${ABILITY_NAMES[ability]} save`}
                            onRoll={() =>
                              rollCheck('save', `${ABILITY_NAMES[ability]} save`, bonus)
                            }
                          >
                            {signed(bonus)}
                          </Rollable>
                        </span>
                        <span className="name">{ABILITY_NAMES[ability]}</span>
                      </li>
                    );
                  })}
                </ul>
              </Box>

              <Box label="Skills" className="cs-marks">
                <ul className="cs-list">
                  {profs.skills.map((skill) => (
                    <li key={skill.skill}>
                      <span
                        className={`dot ${skill.expertise ? 'double' : skill.proficient ? 'on' : skill.halfProficiency ? 'half' : ''}`}
                      />
                      <span className="val">
                        <Rollable
                          label={skill.name}
                          onRoll={() => rollCheck('check', skill.name, skill.modifier)}
                        >
                          {signed(skill.modifier)}
                        </Rollable>
                      </span>
                      <span className="name">
                        {skill.name} <em>{ABILITY_NAMES[skill.ability].slice(0, 3)}</em>
                      </span>
                    </li>
                  ))}
                </ul>
              </Box>
            </div>
          </div>

          <div className="cs-chip cs-wide">
            <b>{profs.passivePerception}</b>
            <span>Passive wisdom (perception)</span>
          </div>

          <Box label="Other proficiencies &amp; languages" className="cs-grow">
            <p className="cs-para">
              <b>Armor.</b>{' '}
              {listOr(
                armor.map((a) => ARMOR_CATEGORY_LABEL[a as keyof typeof ARMOR_CATEGORY_LABEL] ?? a),
                'None',
              )}
            </p>
            <p className="cs-para">
              <b>Tools.</b> {listOr(profs.tools, 'None recorded')}
            </p>
            <p className="cs-para">
              <b>Languages.</b> {listOr(profs.languages.known, 'Common')}
              {profs.languages.open > 0 && ` · ${profs.languages.open} still to choose`}
            </p>
          </Box>
        </div>

        {/* ------------------------------------------------ column two */}
        <div className="cs-col">
          <div className="cs-defense">
            <div className="cs-shield">
              <b>{ctx.ac.total}</b>
              <span>Armor class</span>
            </div>
            <div className="cs-chip">
              <b>
                <Rollable
                  label="initiative"
                  onRoll={() => rollCheck('initiative', 'Initiative', ctx.mods.dex)}
                >
                  {signed(ctx.mods.dex)}
                </Rollable>
              </b>
              <span>Initiative</span>
            </div>
            <div className="cs-chip">
              <b>{speed}</b>
              <span>Speed</span>
            </div>
            {/* Only when they have one - an empty Climb chip on every sheet
                would be noise on the one layout that has to fit a page. */}
            {movement.climb > 0 && (
              <div className="cs-chip">
                <b>{movement.climb}</b>
                <span>Climb</span>
              </div>
            )}
            {movement.swim > 0 && (
              <div className="cs-chip">
                <b>{movement.swim}</b>
                <span>Swim</span>
              </div>
            )}
            <div
              className="cs-chip"
              title={`Long jump ${describeJump(jump.longRunning, jump.longStanding)}. High jump ${describeJump(jump.highRunning, jump.highStanding)}. A running jump needs ${RUN_UP_FEET} ft. of run-up, and every foot you clear costs a foot of movement.`}
            >
              <b>{jump.longRunning}</b>
              <span>Long jump</span>
            </div>
            <div
              className="cs-chip"
              title={`High jump ${describeJump(jump.highRunning, jump.highStanding)}. Standing, half of it.`}
            >
              <b>{jump.highRunning}</b>
              <span>High jump</span>
            </div>
          </div>

          {/*
            The action economy.

            Entirely `cs-screen`, like the rest buttons: what you have left of
            this turn is true for about six seconds, and a printed sheet that
            claimed your reaction was spent would be wrong before the ink
            dried.

            The button says "New turn" rather than "End turn" on purpose. All
            four of these come back at the *start* of your turn - the reaction
            included - and a tracker that refreshed them when you finished
            would hand back a reaction you spent on somebody else's turn.
          */}
          <div className="cs-screen cs-turn">
            <div className="cs-turn-head">
              <span className="cs-turn-title">This turn</span>
              <button
                type="button"
                className="cs-turn-new"
                onClick={() => onPlayChange(newTurn(play))}
              >
                New turn
              </button>
            </div>
            <div className="cs-turn-slots">
              {TURN_SLOTS.map(({ slot, label, hint }) => (
                <button
                  key={slot}
                  type="button"
                  className={play.turn[slot] ? 'is-spent' : ''}
                  aria-pressed={play.turn[slot]}
                  title={hint}
                  onClick={() => onPlayChange(toggleTurnSlot(play, slot))}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="cs-turn-move">
              <span className="label">Movement</span>
              <button
                type="button"
                disabled={movementLeft(play, speed) <= 0}
                title="Move five feet"
                onClick={() => onPlayChange(moveBy(play, 5, speed))}
              >
                −5 ft
              </button>
              <span className="cs-turn-left">
                <b>{movementLeft(play, speed)}</b> of {movementBudget(play, speed)} ft
              </span>
              <button
                type="button"
                disabled={play.turn.moved <= 0}
                title="Take five feet back"
                onClick={() => onPlayChange(moveBy(play, -5, speed))}
              >
                +5 ft
              </button>
              {/* Dash grants the movement and does not spend anything: it is
                  an action for most people, a bonus action with Cunning
                  Action, and free for a Tabaxi. Guessing would be wrong two
                  times in three. */}
              <button type="button" title="Add your speed again" onClick={() => onPlayChange(dash(play))}>
                Dash
              </button>
            </div>
          </div>

          <Box label="Hit points" className="cs-hp">
            <div className="cs-hp-line">
              <span className="cs-hp-max">
                Maximum <b>{max}</b>
              </span>
              <label className="cs-hp-current">
                <input
                  type="number"
                  aria-label="Current hit points"
                  className={down ? 'is-down' : ''}
                  value={current}
                  min={0}
                  max={max}
                  onChange={(e) =>
                    onPlayChange({
                      ...play,
                      currentHp: Math.max(0, Math.min(max, Number(e.target.value) || 0)),
                    })
                  }
                />
              </label>
              <label className="cs-hp-temp">
                <input
                  type="number"
                  aria-label="Temporary hit points"
                  value={play.tempHp}
                  min={0}
                  onChange={(e) =>
                    onPlayChange({ ...play, tempHp: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
              </label>
            </div>
            <div className="cs-hp-keys">
              <span>Current</span>
              <span>Temporary</span>
            </div>

            <div className="cs-bar" role="img" aria-label={`${current} of ${max} hit points`}>
              <span
                className={`fill ${down ? 'is-down' : current / Math.max(1, max) <= 0.5 ? 'is-hurt' : ''}`}
                style={{ width: `${max > 0 ? (current / max) * 100 : 0}%` }}
              />
            </div>

            <div className="cs-screen cs-row">
              <input
                type="number"
                min={0}
                className="cs-amount"
                placeholder="0"
                aria-label="Amount of damage, healing or temporary hit points"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') apply((n) => onPlayChange(damage(play, n, max)));
                }}
              />
              <button
                className="btn btn-sm btn-danger"
                onClick={() => apply((n) => onPlayChange(damage(play, n, max)))}
              >
                Damage
              </button>
              <button
                className="btn btn-sm"
                onClick={() => apply((n) => onPlayChange(heal(play, n, max)))}
              >
                Heal
              </button>
              <button
                className="btn btn-sm"
                onClick={() => apply((n) => onPlayChange(setTempHp(play, n)))}
              >
                Temp
              </button>
            </div>
          </Box>

          <div className="cs-pair">
            <Box label="Hit dice">
              {hitDice.map((entry) => (
                <div className="cs-track" key={entry.classId}>
                  <span className="label">
                    {entry.total}d{entry.die}
                    {hitDice.length > 1 && <em> {entry.name}</em>}
                  </span>
                  <Pips
                    total={entry.total}
                    left={entry.left}
                    count
                    label={`${entry.name} hit die`}
                    onSpend={() => onPlayChange(spendHitDie(play, entry.classId, entry.total))}
                    onRestore={() =>
                      onPlayChange({
                        ...play,
                        hitDiceSpent: {
                          ...play.hitDiceSpent,
                          [entry.classId]: Math.max(0, (play.hitDiceSpent[entry.classId] ?? 0) - 1),
                        },
                      })
                    }
                  />
                  {/*
                    Spending a hit die and healing by it are one action, so this
                    does both. Doing only the first would leave the useful half
                    to arithmetic in somebody's head.
                  */}
                  <button
                    type="button"
                    className="cs-screen"
                    disabled={entry.left <= 0}
                    title={`Spend a hit die: roll 1d${entry.die} and add your Constitution modifier`}
                    onClick={() => rollHitDie(entry.classId, entry.die, entry.total, entry.name)}
                  >
                    Roll
                  </button>
                </div>
              ))}
            </Box>

            <Box label="Death saves">
              {/* These read the other way round from every other track here:
                  a death save circle is empty until the save happens, so what
                  is filled is what has been recorded, not what remains. */}
              <div className="cs-track">
                <span className="label">Successes</span>
                <Pips
                  total={3}
                  left={play.deathSaves.successes}
                  kind="is-success"
                  label="Death save success"
                  onSpend={() => onPlayChange(clearDeathSaves(play))}
                  onRestore={() => onPlayChange(recordDeathSave(play, 'success'))}
                />
              </div>
              <div className="cs-track">
                <span className="label">Failures</span>
                <Pips
                  total={3}
                  left={play.deathSaves.failures}
                  kind="is-failure"
                  label="Death save failure"
                  onSpend={() => onPlayChange(clearDeathSaves(play))}
                  onRestore={() => onPlayChange(recordDeathSave(play, 'failure'))}
                />
              </div>
              {/*
                Rolled rather than ticked, because the two faces that matter
                are the two everybody misplays: a natural 20 is not a success,
                it is standing back up, and a natural 1 is two failures.
              */}
              <div className="cs-screen cs-deathroll">
                <button type="button" disabled={!down} title="Roll a death saving throw" onClick={rollDeathSave}>
                  Roll a death save
                </button>
              </div>
              {play.deathSaves.successes >= 3 && <p className="cs-para">Stable.</p>}
              {play.deathSaves.failures >= 3 && <p className="cs-para is-down">Dead.</p>}
            </Box>
          </div>

          {/*
            The states a table forgets. Nobody forgets they are on 6 hit
            points; everybody forgets that being prone gives their ranged
            attacks disadvantage. So the effect is written next to the switch.
          */}
          <Box label="Conditions &amp; exhaustion">
            <div className="cs-conditions">
              {CONDITIONS.map((condition) => {
                const on = play.conditions.includes(condition.id);
                return (
                  <button
                    key={condition.id}
                    className={`cs-cond ${on ? 'is-on' : ''}`}
                    aria-pressed={on}
                    title={conditionText(condition, build.ruleset)}
                    onClick={() => onPlayChange(toggleCondition(play, condition.id))}
                  >
                    {condition.name}
                  </button>
                );
              })}
            </div>

            {/*
              Not a Pips row: exhaustion is a track, so clicking the fourth
              circle means "I am on four", not "add one". Clicking the level you
              are already on steps back down, which is how it is recovered.
            */}
            <div className="cs-track" style={{ marginTop: 6 }}>
              <span className="label">Exhaustion</span>
              <span className="cs-pips">
                {Array.from({ length: MAX_EXHAUSTION }, (_, i) => (
                  <button
                    key={i}
                    className={`pip is-failure ${i < play.exhaustion ? 'is-full' : ''}`}
                    aria-label={`Exhaustion level ${i + 1}`}
                    aria-pressed={i < play.exhaustion}
                    onClick={() => onPlayChange(setExhaustion(play, play.exhaustion === i + 1 ? i : i + 1))}
                  />
                ))}
              </span>
              <span className="cs-count">
                {play.exhaustion}/{MAX_EXHAUSTION}
              </span>
            </div>

            {play.conditions.length > 0 &&
              CONDITIONS.filter((c) => play.conditions.includes(c.id)).map((c) => (
                <p className="cs-para" key={c.id}>
                  <b>{c.name}.</b> {conditionText(c, build.ruleset)}
                </p>
              ))}
            {play.exhaustion > 0 &&
              exhaustionLines(play.exhaustion, ctx.build.ruleset).map((effect, i) => (
                <p className="cs-para" key={i}>
                  <b>Exhaustion {i + 1}.</b> {effect}
                </p>
              ))}
            {play.conditions.length === 0 && play.exhaustion === 0 && (
              <p className="cs-para">Nothing on you.</p>
            )}
          </Box>

          <Box label="Attacks &amp; spellcasting" className="cs-attacks">
            {ctx.attacks.length ? (
              <table className="cs-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Atk bonus</th>
                    <th>Damage / type</th>
                  </tr>
                </thead>
                <tbody>
                  {ctx.attacks.map((attack, i) => {
                    const dice = damageDice(
                      attack.weapon,
                      attack.hand === 'main' && !ctx.loadouts.offHand,
                    );
                    const line = `${dice}${attack.damage.bonus !== 0 ? signed(attack.damage.bonus) : ''}`;
                    return (
                      <tr key={i}>
                        <td>
                          {attack.weapon.name}
                          {attack.hand === 'off' && <em> (off hand)</em>}
                        </td>
                        <td>
                          <Rollable
                            label={`to hit with ${attack.weapon.name}`}
                            onRoll={() =>
                              rollCheck('attack', `${attack.weapon.name} to hit`, attack.toHit)
                            }
                          >
                            {signed(attack.toHit)}
                          </Rollable>
                        </td>
                        <td>
                          <Rollable
                            label={`${attack.weapon.name} damage`}
                            onRoll={() =>
                              rollDamageLine(`${attack.weapon.name} damage`, line, false)
                            }
                          >
                            {line}
                          </Rollable>{' '}
                          {attack.damage.type}
                          {/*
                            A crit doubles the dice and not the bonus, and that
                            rule is easier to get right by pressing a button
                            than by remembering it at the table. Kept off the
                            paper sheet: on paper the damage line is a number,
                            not a pair of choices.
                          */}
                          <button
                            type="button"
                            className="cs-screen cs-crit"
                            title={`Roll ${attack.weapon.name} damage as a critical hit — double the dice, not the bonus`}
                            onClick={() => rollDamageLine(`${attack.weapon.name} damage`, line, true)}
                          >
                            crit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="cs-para">Nothing equipped.</p>
            )}

            {ammo.map((stack) => {
              const left = ammoLeft(play, stack.gearId, stack.total);
              return (
                <div className="cs-track cs-ammo" key={stack.gearId}>
                  <span className="label">
                    {stack.name}
                    <em> {stack.usedBy.length ? stack.usedBy.join(', ') : 'nothing in hand'}</em>
                  </span>
                  <span className="cs-pool">
                    <input
                      type="number"
                      min={0}
                      max={stack.total}
                      aria-label={`${stack.name} remaining`}
                      value={left}
                      onChange={(e) =>
                        onPlayChange(
                          setAmmoLeft(play, stack.gearId, Number(e.target.value || 0), stack.total),
                        )
                      }
                    />
                    <span className="of">/ {stack.total}</span>
                  </span>
                  <button
                    type="button"
                    disabled={left <= 0}
                    title={`Shoot one ${stack.name.toLowerCase().replace(/s$/, '')}`}
                    onClick={() => onPlayChange(spendAmmo(play, stack.gearId, stack.total))}
                  >
                    Shoot
                  </button>
                  <button
                    type="button"
                    disabled={left >= stack.total}
                    title="A minute searching the battlefield returns half of what you shot, rounded down"
                    onClick={() => onPlayChange(recoverAmmo(play, stack.gearId))}
                  >
                    Recover half
                  </button>
                  <button
                    type="button"
                    disabled={left >= stack.total}
                    title="Back to a full quiver, for when you have restocked in town"
                    onClick={() => onPlayChange(restockAmmo(play, stack.gearId))}
                  >
                    Restock
                  </button>
                </div>
              );
            })}

            {casting.casts &&
              casting.sources.map((source) => (
                <p className="cs-para" key={source.classId}>
                  {casting.sources.length > 1 && <b>{source.className}. </b>}
                  <b>Spell attack</b> {signed(source.attackBonus)} · <b>save DC</b> {source.saveDc}{' '}
                  · {ABILITY_NAMES[source.ability]}
                  {casting.sources.length === 1 && ' — the spell list is on the second page.'}
                </p>
              ))}
          </Box>

          {(resources.length > 0 || customResources.length > 0) && (
            <Box label="Class resources">
              {resources.map((held) => {
                const left = resourceLeft(play, held.key, held.max);
                const recharge = rechargeFor(held);
                const label = `${held.resource.name}${
                  resources.some((o) => o !== held && o.resource.name === held.resource.name)
                    ? ` (${held.className})`
                    : ''
                }`;
                return (
                  <div className="cs-track" key={held.key} title={held.resource.note}>
                    <span className="label">
                      {label}
                      {/*
                        What a use is worth, where the count does not say it -
                        a Wizard's Arcane Recovery is one use and the number
                        they need is how many slot levels it gives back.
                      */}
                      {held.detail && <em> {held.detail}</em>}
                      <em> {RECHARGE_LABEL[recharge]}</em>
                    </span>
                    {held.resource.display === 'pips' ? (
                      <Pips
                        total={held.max}
                        left={left}
                        count
                        label={label}
                        onSpend={() => onPlayChange(spendResource(play, held.key, held.max))}
                        onRestore={() => onPlayChange(restoreResource(play, held.key))}
                      />
                    ) : (
                      // A pool of dozens is a number, not fifty circles.
                      <span className="cs-pool">
                        <input
                          type="number"
                          min={0}
                          max={held.max}
                          aria-label={`${label} remaining`}
                          value={left}
                          onChange={(e) =>
                            onPlayChange(
                              setResourceSpent(
                                play,
                                held.key,
                                held.max - Number(e.target.value || 0),
                                held.max,
                              ),
                            )
                          }
                        />
                        <span className="of">/ {held.max}</span>
                      </span>
                    )}
                  </div>
                );
              })}

              {/*
                Counters this app has no table for. Piety, renown, a pool your
                DM invented - the books they come from are not ones this
                project can reproduce, so you name it and the app counts it.
                It prints, because a counter you keep is part of the sheet.
              */}
              {customResources.map((resource) => (
                <div className="cs-track" key={resource.id}>
                  <span className="label">
                    {resource.name}
                    <em>
                      {' '}
                      {resource.recharge === 'none'
                        ? 'no recharge'
                        : `${resource.recharge} rest`}
                    </em>
                  </span>
                  <span className="cs-pool">
                    <button
                      type="button"
                      className="cs-screen"
                      aria-label={`One fewer ${resource.name}`}
                      onClick={() => onPlayChange(stepCustom(play, resource, -1))}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={resource.max}
                      aria-label={resource.name}
                      value={customValue(play, resource)}
                      onChange={(e) =>
                        onPlayChange(setCustomValue(play, resource, Number(e.target.value || 0)))
                      }
                    />
                    <span className="of">/ {resource.max}</span>
                    <button
                      type="button"
                      className="cs-screen"
                      aria-label={`One more ${resource.name}`}
                      onClick={() => onPlayChange(stepCustom(play, resource, 1))}
                    >
                      +
                    </button>
                  </span>
                </div>
              ))}
            </Box>
          )}

          <Box label="Equipment" className="cs-grow">
            <p className="cs-para">
              <b>{ctx.inventory.weight} lb.</b> carried of {ctx.inventory.capacity} you can lift ·{' '}
              <b>{describePurse(build.coins)}</b> in the purse
            </p>
            {ctx.inventory.lines.length > 0 && (
              <ul className="cs-plain">
                {ctx.inventory.lines.map((line, i) => (
                  <li key={i}>
                    <b>
                      {line.quantity > 1 && `${line.quantity} × `}
                      {line.label}
                    </b>
                    {line.weight > 0 && (
                      <span className="cs-weight"> {formatWeight(line.weight)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {ctx.items.length ? (
              <ul className="cs-plain">
                {ctx.items.map((resolved, i) => {
                  const count = quantityOf(resolved.carried);
                  const consumable = isConsumable(resolved.item);
                  return (
                    <li key={i}>
                      <b>{resolved.name}</b>
                      {count > 1 && <b> ×{count}</b>}
                      {/* What is written on the scroll, which is most of what
                          a scroll is - a Spell Scroll (2nd Level) tells you
                          nothing without it. */}
                      {resolved.carried.detail && <em> ({resolved.carried.detail})</em>}
                      {resolved.item && (
                        <em>
                          {' '}
                          {RARITY_LABELS[resolved.item.rarity]}
                          {resolved.item.attunement &&
                            (resolved.carried.attuned ? ' · attuned' : ' · not attuned')}
                        </em>
                      )}
                      {resolved.item && <div className="sub">{resolved.item.summary}</div>}
                      {consumable && (
                        /* A control, so it does not print - the paper sheet
                           lists what you own and you cross it off yourself. */
                        <div className="cs-screen cs-useline">
                          <button type="button" onClick={() => consumeCarried(i)}>
                            {resolved.item?.use?.heals ? 'Drink it' : 'Use one'}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="cs-para">No magic items.</p>
            )}
            {build.defenses.armorId !== 'none' && (
              <p className="cs-para">
                Wearing {ctx.ac.source}
                {build.defenses.shield ? ' with a shield' : ''}.
              </p>
            )}
          </Box>

          <div className="cs-screen cs-rests">
            <button
              className="btn btn-sm"
              onClick={() => onPlayChange(shortRest(play, shortRechargeKeys, customResources))}
            >
              Short rest
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => onPlayChange(longRest(play, hitDiceByClass, customResources))}
            >
              Long rest
            </button>
            {/*
              The third moment, shown only to the characters who have one.

              The battle screen presses this by itself when a fight starts, so
              a table running combat on the map never needs the button. It is
              here for the table that does not: a sheet whose Reckonings say
              "each fight" and offer no way to start a fight would be a rule
              the app states and cannot apply.
            */}
            {encounterKeys.length > 0 && (
              <button
                className="btn btn-sm"
                onClick={() => onPlayChange(startOfEncounter(play, encounterKeys))}
                title="Hand back everything that recharges every fight."
              >
                New fight
              </button>
            )}
            <span className="muted">
              {isFresh(play, max) ? 'Nothing spent.' : 'Spent this session.'}
            </span>
            {/*
              What the fights added up to. Shown only once there is something
              to show, and without a level next to it: the XP-per-level table
              is not in the data this project ships, and a threshold nothing
              here can source has no business on a character sheet. Most tables
              level on milestones anyway.
            */}
            {!!play.xp && (
              <span className="muted" title="Earned in play. When it is enough is the table's call.">
                {play.xp.toLocaleString()} XP
              </span>
            )}
          </div>

          {/*
            The dice.

            Entirely `cs-screen`: a paper sheet has no roll log, and the point
            of this one layout is that the paper version is the sheet rather
            than a stripped-down copy of an app.
          */}
          <div className="cs-screen cs-rolls">
            <div className="cs-rolls-head">
              <span className="cs-rolls-title">Dice</span>
              <span className="cs-modes" role="group" aria-label="Roll every d20 with">
                {(['normal', 'advantage', 'disadvantage'] as D20Mode[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={mode === option ? 'is-on' : ''}
                    aria-pressed={mode === option}
                    onClick={() => setMode(option)}
                  >
                    {option === 'normal' ? 'Straight' : option === 'advantage' ? 'Advantage' : 'Disadvantage'}
                  </button>
                ))}
              </span>
              {play.rolls.length > 0 && (
                <button type="button" className="cs-rolls-clear" onClick={() => onPlayChange(clearRolls(play))}>
                  Clear
                </button>
              )}
            </div>
            {play.rolls.length === 0 ? (
              <p className="muted">
                Click any modifier on the sheet — a skill, a save, an attack — to roll it. Damage,
                hit dice and death saves have their own buttons.
              </p>
            ) : (
              <ol className="cs-rolllog">
                {play.rolls.map((record) => (
                  <li key={record.id} className={record.natural ? `is-nat${record.natural}` : ''}>
                    <b className="cs-rolltotal">{record.total}</b>
                    <span className="cs-rolllabel">{record.label}</span>
                    <span className="cs-rollwork">{record.working}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {/* ---------------------------------------------- column three */}
        <div className="cs-col">
          <Prose
            label="Personality traits"
            value={details.personality}
            onChange={(personality) => setDetail({ personality })}
          />
          <Prose label="Ideals" value={details.ideals} onChange={(ideals) => setDetail({ ideals })} rows={2} />
          <Prose label="Bonds" value={details.bonds} onChange={(bonds) => setDetail({ bonds })} rows={2} />
          <Prose label="Flaws" value={details.flaws} onChange={(flaws) => setDetail({ flaws })} rows={2} />

          <Box label="Features &amp; traits" className="cs-grow">
            <ul className="cs-plain">
              {ctx.race.traits.map((trait) => (
                <li key={trait.name}>
                  <b>{trait.name}</b> <em>{ctx.race.name}</em>
                  <div className="sub">{trait.text}</div>
                </li>
              ))}
              {ctx.features.map((feature, i) => (
                <li key={`f${i}`}>
                  <b>{feature.name}</b> <em>level {feature.level}</em>
                  <div className="sub">{feature.summary}</div>
                </li>
              ))}
              {[...ctx.featIds].length > 0 && (
                <li>
                  <b>Feats</b>
                  <div className="sub">{[...ctx.featIds].join(', ')}</div>
                </li>
              )}
            </ul>
          </Box>

          {build.notes && (
            <Box label="Notes">
              <p className="cs-para">{build.notes}</p>
            </Box>
          )}
        </div>
      </div>

      {/* ------------------------------------------------ the second page */}
      {casting.casts && (
        <section className="cs-page">
          {/*
            One header row per casting class. A single-class caster has one and
            sees exactly what they always saw; a Cleric/Wizard has two, because
            they genuinely have two save DCs and printing one of them was how
            this sheet came to be three points wrong about half their spells.
          */}
          {casting.sources.map((source) => (
            <header className="cs-spellhead" key={source.classId}>
              <div className="cs-headfield">
                <b>{source.className}</b>
                <span>Spellcasting class</span>
              </div>
              <div className="cs-chip">
                <b>{ABILITY_NAMES[source.ability].slice(0, 3).toUpperCase()}</b>
                <span>Ability</span>
              </div>
              <div className="cs-chip">
                <b>{source.saveDc}</b>
                <span>Spell save DC</span>
              </div>
              <div className="cs-chip">
                <b>{signed(source.attackBonus)}</b>
                <span>Spell attack bonus</span>
              </div>
            </header>
          ))}

          {casting.assumedSources && (
            <p className="cs-para cs-castingnote">
              Each spell is cast with the class you learned it from. Some of yours are on more than
              one of your lists and have not been told apart, so this sheet assumes the better of
              them — say which in the Spells section to be sure.
            </p>
          )}

          <div className="cs-spellbook">
            {spellsByLevel.has(0) && (
              <Box label="Cantrips" className="cs-spelllevel">
                <ul className="cs-plain">
                  {spellsByLevel.get(0)!.map((spell) => (
                    <li key={spell.id}>
                      <b>{spell.name}</b>
                      <div className="sub">
                        {describeSpell(spell)} · {CASTING_TIME_LABELS[spell.castingTime]}
                        {castAs(spell) && ` · as a ${castAs(spell)}`}
                        {grantedIds.has(spell.id) && ' · always prepared'}
                      </div>
                      {/* Screen only: the printed spellbook is already two
                          pages, and the summary above is what fits on paper. */}
                      <div className="cs-screen">
                        <RulesDisclosure kind="spell" name={spell.name} />
                      </div>
                    </li>
                  ))}
                </ul>
              </Box>
            )}

            {slotLevels.map((level) => {
              const fromTable = casting.bySpellLevel[level - 1] ?? 0;
              const have = slotsTotal(play, level, fromTable);
              const known = spellsByLevel.get(level) ?? [];
              const cost = SORCERY_POINT_SLOT_COSTS[level];
              return (
                <Box label={`Level ${level}`} className="cs-spelllevel" key={level}>
                  <div className="cs-track cs-slotrow">
                    <span className="label">Slots</span>
                    {have > 0 ? (
                      <Pips
                        total={have}
                        left={slotsLeft(play, level, fromTable)}
                        count
                        label={`Level ${level} slot`}
                        onSpend={() => onPlayChange(spendSlot(play, level, fromTable))}
                        onRestore={() => onPlayChange(restoreSlot(play, level))}
                      />
                    ) : (
                      <span className="muted">none</span>
                    )}
                  </div>
                  {sorceryPoints && cost !== undefined && (
                    <div className="cs-fontofmagic">
                      <button
                        type="button"
                        disabled={resourceLeft(play, sorceryPoints.key, sorceryPoints.max) < cost}
                        title={`Spend ${cost} sorcery points for one level ${level} slot`}
                        onClick={() =>
                          onPlayChange(
                            createSlotWithPoints(play, level, sorceryPoints.key, sorceryPoints.max),
                          )
                        }
                      >
                        Make a slot · {cost} pts
                      </button>
                      <button
                        type="button"
                        disabled={slotsLeft(play, level, fromTable) <= 0}
                        title={`Expend one level ${level} slot for ${level} sorcery ${level === 1 ? 'point' : 'points'}`}
                        onClick={() =>
                          onPlayChange(
                            convertSlotToPoints(play, level, fromTable, sorceryPoints.key),
                          )
                        }
                      >
                        Burn for {level} {level === 1 ? 'pt' : 'pts'}
                      </button>
                      {(play.slotsCreated[level - 1] ?? 0) > 0 && (
                        <em>
                          {play.slotsCreated[level - 1]} made — gone after a long rest
                        </em>
                      )}
                    </div>
                  )}
                  {known.length ? (
                    <ul className="cs-plain">
                      {known.map((spell) => (
                        <li key={spell.id}>
                          {casting.preparesFromBook && (
                            <span
                              className={`dot ${casting.prepared.some((p) => p.id === spell.id) ? 'on' : ''}`}
                              title={
                                casting.prepared.some((p) => p.id === spell.id)
                                  ? 'Prepared today'
                                  : 'In the book, not prepared'
                              }
                            />
                          )}
                          <b>{spell.name}</b>
                          {spell.concentration && <em> concentration</em>}
                          {/*
                            Ritual, §42. The field has been on every spell
                            since the list was built and was surfaced
                            **nowhere** - data with no reader, which is the
                            same thing as no data. It changes how a spell is
                            cast, so it belongs beside concentration.
                          */}
                          {spell.ritual && (
                            <em title="Castable as a ritual: ten minutes longer, and it costs no slot">
                              {' '}
                              ritual
                            </em>
                          )}
                          <div className="sub">
                            {describeSpell(spell)} · {CASTING_TIME_LABELS[spell.castingTime]}
                            {castAs(spell) && ` · as a ${castAs(spell)}`}
                            {/*
                              Components, §64. On the sheet because it is the
                              copy that goes to the table, and "can I cast
                              this with a sword and shield in my hands" is
                              answered by these three letters and nothing
                              else. The material is the title, since it is a
                              sentence and the row is a line.
                            */}
                            {describeComponents(spell) && (
                              <span title={spell.components?.m ?? undefined}>
                                {' · '}
                                {describeComponents(spell)}
                              </span>
                            )}
                            {grantedIds.has(spell.id) && ' · always prepared'}
                          </div>
                          <div className="cs-screen">
                            <RulesDisclosure kind="spell" name={spell.name} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="cs-para">Nothing recorded at this level.</p>
                  )}
                </Box>
              );
            })}

            {casting.pact && (
              <Box label={`Pact magic — level ${casting.pact.level}`} className="cs-spelllevel">
                <div className="cs-track cs-slotrow">
                  <span className="label">Slots</span>
                  <Pips
                    total={casting.pact.count}
                    left={casting.pact.count - play.pactSpent}
                    kind="is-pact"
                    count
                    label="Pact slot"
                    onSpend={() => onPlayChange(spendPact(play, casting.pact!.count))}
                    onRestore={() => onPlayChange(restorePact(play))}
                  />
                </div>
                <p className="cs-para">Both come back on a short rest.</p>
              </Box>
            )}
          </div>
        </section>
      )}

      {details.backstory && (
        <section className="cs-page">
          <Prose
            label="Backstory"
            value={details.backstory}
            onChange={(backstory) => setDetail({ backstory })}
            rows={10}
          />
        </section>
      )}
      {!details.backstory && (
        <div className="cs-screen cs-addback">
          <button className="btn btn-sm" onClick={() => setDetail({ backstory: ' ' })}>
            Add a backstory page
          </button>
        </div>
      )}
    </article>
  );
}

function listOr(values: string[], fallback: string): string {
  return values.length ? values.join(', ') : fallback;
}
