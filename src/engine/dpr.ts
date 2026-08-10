import type { Build } from '../types';
import type { MasteryProperty, Weapon } from '../data/weapons';
import { MASTERY_LABELS } from '../data/weapons';
import { masterySlots } from './attacks';
import type { Attack } from './attacks';
import type { Spell } from '../data/spells';
import { hasFeatureTag } from './features';
import type { HeldFeature } from './features';
import type { ClassSlice } from './character';
import type { ItemEffects } from './items';
import { sourceForSpell } from './spellcasting';
import type { CastingSource } from './spellcasting';

/**
 * Damage per round.
 *
 * Every other number in this app is a fact you could look up. This one is a
 * model, so it is built to show its working: the curve across every plausible
 * target AC, an itemised breakdown of where the damage comes from, and the
 * break-even point for the feats whose whole question is "is this worth it".
 *
 * Two numbers come out, because they answer different questions. **Sustained**
 * is what you do every round, all day. **Nova** is your best single round with
 * resources spent, which is what actually kills a boss.
 */

/** The lowest and highest target AC worth plotting. */
export const AC_RANGE = { min: 10, max: 25 };

/**
 * A target AC that suits the character's level. Rough, and deliberately so:
 * monster AC scales loosely with tier, and pretending otherwise would be false
 * precision.
 */
export function typicalAcFor(level: number): number {
  if (level >= 17) return 18;
  if (level >= 11) return 17;
  if (level >= 5) return 15;
  return 13;
}

export interface DprLine {
  label: string;
  /** Damage this contributes at the headline AC. */
  value: number;
  detail?: string;
}

export interface DprResult {
  targetAc: number;
  sustained: number;
  nova: number;
  /** Sustained and nova at each AC from 10 to 25. */
  curve: { ac: number; sustained: number; nova: number }[];
  lines: DprLine[];
  notes: string[];
  /**
   * The highest AC at which taking -5/+10 still beats not taking it. Above
   * this, the feat is a trap for this build.
   */
  powerAttackBreakEven?: number;
  /** Whether the numbers assume advantage on every attack. */
  assumedAdvantage: boolean;
}

// ------------------------------------------------------------------- dice

/** Average of NdX. */
export function averageDice(count: number, die: number): number {
  return count * ((die + 1) / 2);
}

/** "2d6" -> { count: 2, die: 6 }. */
export function parseDice(dice: string): { count: number; die: number } {
  const match = dice.match(/^(\d+)d(\d+)$/);
  if (!match) return { count: 0, die: 0 };
  return { count: Number(match[1]), die: Number(match[2]) };
}

/**
 * Great Weapon Fighting rerolls 1s and 2s once and you keep the new roll. Two
 * faces out of the die become a fresh average; the rest stand. A d6 goes from
 * 3.5 to 25/6, about 4.17.
 */
export function averageWithReroll(die: number): number {
  const fresh = (die + 1) / 2;
  const keptFaces = (die * (die + 1)) / 2 - 1 - 2; // sum of faces 3..die
  return (keptFaces + 2 * fresh) / die;
}

// --------------------------------------------------------------- to-hit odds

/**
 * A natural 1 always misses and a natural 20 always hits, so the chance is
 * clamped either side however good or bad the modifier is.
 */
export function hitChance(toHit: number, ac: number): number {
  const needed = ac - toHit;
  // Rolling `needed` or better on a d20.
  const raw = (21 - needed) / 20;
  return Math.min(0.95, Math.max(0.05, raw));
}

export function withAdvantage(p: number): number {
  return 1 - (1 - p) ** 2;
}

/** Champion widens the crit range; Elven Accuracy effectively does too. */
export function critChance(critOn: number, advantage: boolean): number {
  const p = (21 - critOn) / 20;
  return advantage ? withAdvantage(p) : p;
}

export interface AttackOdds {
  hit: number;
  crit: number;
}

export function oddsFor(toHit: number, ac: number, critOn: number, advantage: boolean): AttackOdds {
  const base = hitChance(toHit, ac);
  return {
    hit: advantage ? withAdvantage(base) : base,
    crit: critChance(critOn, advantage),
  };
}

/**
 * Expected damage from one swing. A critical hit doubles the dice but not the
 * flat bonus, which is why a big flat modifier and a big die pull in different
 * directions.
 */
export function expectedDamage(
  odds: AttackOdds,
  diceAverage: number,
  flatBonus: number,
): number {
  return odds.hit * (diceAverage + flatBonus) + odds.crit * diceAverage;
}

// ------------------------------------------------------------ saving throws

/**
 * A monster's saving throw bonus, by tier. As rough as `typicalAcFor`, and for
 * the same reason: it scales loosely and pretending otherwise would be false
 * precision.
 */
export function typicalSaveBonusFor(level: number): number {
  if (level >= 17) return 7;
  if (level >= 11) return 5;
  if (level >= 5) return 3;
  return 1;
}

/** The chance a target fails a save against your DC. */
export function failChance(saveDc: number, saveBonus: number): number {
  // They need saveDc - saveBonus or better on a d20.
  const needed = saveDc - saveBonus;
  const success = Math.min(0.95, Math.max(0.05, (21 - needed) / 20));
  return 1 - success;
}

/**
 * Expected damage from a save-based spell. Most area spells deal half on a
 * success, which is why they are more reliable than an attack roll and why a
 * Fireball into three enemies is hard to beat.
 */
export function expectedSaveDamage(
  fail: number,
  diceAverage: number,
  halfOnSave: boolean,
  targets: number,
): number {
  const perTarget = fail * diceAverage + (1 - fail) * (halfOnSave ? diceAverage / 2 : 0);
  return perTarget * targets;
}

/** A cantrip's dice step at 5th, 11th and 17th character level. */
export function cantripMultiplier(level: number): number {
  if (level >= 17) return 4;
  if (level >= 11) return 3;
  if (level >= 5) return 2;
  return 1;
}

// ------------------------------------------------------------ attack counts

/**
 * How many times the Attack action swings. Each Extra Attack feature adds one,
 * so a Fighter 11 carrying two of them attacks three times - the count comes
 * from the feature table rather than a per-class rule.
 */
export function attacksPerAction(features: HeldFeature[]): number {
  return 1 + features.filter((f) => f.tags?.includes('extra-attack')).length;
}

/**
 * A concentration spell that improves your attacks, of which you may have
 * exactly one running.
 */
interface ConcentrationBuff {
  label: string;
  /** Extra damage on every hit, as Hunter's Mark and Hex give. */
  perHit?: number;
  /** Added to every attack roll, as Bless gives. */
  toHit?: number;
}

export interface DprInput {
  build: Build;
  attacks: Attack[];
  features: HeldFeature[];
  slices: ClassSlice[];
  mods: Record<string, number>;
  totalLevel: number;
  proficiency: number;
  featIds: Set<string>;
  subclassIds: Set<string>;
  /** Assume advantage on every attack. */
  advantage: boolean;
  /** Assume a concentration buff such as Hunter's Mark is up. */
  concentrating: boolean;
  /** How many creatures an area spell is assumed to catch. */
  targets: number;
  /**
   * What carried weapons add, beyond the flat bonus already folded into the
   * attack line: a Flame Tongue's fire, a Scimitar of Speed's extra swing.
   */
  itemRiders?: ItemEffects['damageRiders'];
  itemExtraBonusAttack?: boolean;
  /** Spells this character has, and what they cast with. */
  spells: Spell[];
  /**
   * The best of the casting classes, used when a spell cannot be attributed to
   * one of them - and the only figures a single-class caster needs.
   */
  spellSaveDc: number | null;
  spellAttack: number | null;
  /**
   * Per casting class, for a multiclass caster. Without this a Cleric/Wizard's
   * Fireball would be modelled at whichever DC happened to be the higher of the
   * two, which is not the one they cast it at.
   */
  castingSources?: CastingSource[];
  /** The highest slot available, for the nova spell. */
  highestSlot: number;
}

/** The best at-will and best slot spell this character has, as damage. */
export interface SpellDamageOptions {
  cantrip?: { spell: Spell; damage: number };
  slotSpell?: { spell: Spell; damage: number };
}

/** The crit range this build attacks on, which Champion widens. */
export function critRangeFor(input: DprInput): number {
  const champion = input.subclassIds.has('champion');
  if (!champion) return 20;
  const fighterLevel = input.slices
    .filter((s) => s.subclass?.id === 'champion')
    .reduce((n, s) => Math.max(n, s.entry.level), 0);
  if (fighterLevel >= 15) return 18;
  if (fighterLevel >= 3) return 19;
  return 20;
}

/** Dice averages for a weapon's damage, honouring Great Weapon Fighting. */
export function weaponDiceAverage(
  weapon: Weapon,
  dice: string,
  greatWeaponFighting: boolean,
): number {
  const { count, die } = parseDice(dice);
  if (count === 0) return 0;
  const heavyEnough = weapon.properties.includes('two-handed') || !!weapon.versatileDie;
  if (greatWeaponFighting && heavyEnough) return count * averageWithReroll(die);
  return averageDice(count, die);
}

// ------------------------------------------------------------------- riders

/** "2d6" -> its average, so a rider can be written the way the book prints it. */
function riderAverage(rider: { dice?: string; flat?: number }): number {
  if (rider.flat !== undefined) return rider.flat;
  const match = /^(\d+)d(\d+)$/.exec(rider.dice ?? '');
  return match ? averageDice(Number(match[1]), Number(match[2])) : 0;
}

/** Sneak Attack is 1d6 per two Rogue levels, rounded up, once per turn. */
function sneakAttackDice(slices: ClassSlice[]): number {
  const rogue = slices.filter((s) => s.klass.id === 'rogue').reduce((n, s) => n + s.entry.level, 0);
  return rogue > 0 ? Math.ceil(rogue / 2) : 0;
}

/**
 * The table-driven once-per-turn rider, for the classes that carry one as data.
 *
 * Sneak Attack, Rage and Divine Smite are each a hand-written function above,
 * because each has a condition this cannot express - finesse and an ally, or
 * Strength and melee, or a spent slot. A class whose rider is simply "one hit a
 * turn deals extra dice" does not need a fourth function, and `oncePerTurn` on
 * the class record is where it goes instead.
 *
 * Summed across slices, so a Reckoner 5 / Harrier 5 is two entries rather than
 * one wrong one - they are different dice and neither is the other's.
 */
function tabledRiders(slices: ClassSlice[]): { name: string; die: number; dice: number }[] {
  const out: { name: string; die: number; dice: number }[] = [];
  for (const slice of slices) {
    const rider = slice.klass.oncePerTurn;
    if (!rider) continue;
    const reached = rider.byLevel.filter((step) => slice.entry.level >= step.level);
    const dice = reached.length ? reached[reached.length - 1].count : 0;
    if (dice > 0) out.push({ name: rider.name, die: rider.die, dice });
  }
  return out;
}

/** Rage adds a flat amount to every Strength melee hit. */
function rageDamage(slices: ClassSlice[]): number {
  const barbarian = slices
    .filter((s) => s.klass.id === 'barbarian')
    .reduce((n, s) => n + s.entry.level, 0);
  if (barbarian === 0) return 0;
  if (barbarian >= 16) return 4;
  if (barbarian >= 9) return 3;
  return 2;
}

/**
 * The mastery property a character actually brings to a swing.
 *
 * Three things have to be true, and the app already knows all three: the
 * ruleset is 2024, the class grants a mastery slot at this level, and the
 * weapon is both recorded as mastered and in your hand. Mastery with a
 * longsword you left at home does nothing, which the build review says out
 * loud - so the damage model must not quietly disagree with it.
 */
function masteryInHand(input: DprInput, attack: Attack): MasteryProperty | undefined {
  if (input.build.ruleset !== '2024') return undefined;
  if (masterySlots(input.slices, input.build.ruleset) < 1) return undefined;
  if (!input.build.masteryIds.includes(attack.weapon.id)) return undefined;
  return attack.weapon.mastery;
}

/** A Paladin's Divine Smite, using the highest slot they have. */
function smiteDice(slices: ClassSlice[]): number {
  const paladin = slices
    .filter((s) => s.klass.id === 'paladin')
    .reduce((n, s) => n + s.entry.level, 0);
  if (paladin < 2) return 0;
  // Slot level roughly tracks half the Paladin's level, capped at 5th.
  const slot = Math.min(5, Math.max(1, Math.floor(paladin / 2)));
  return 1 + slot; // 2d8 at 1st, one more die per level above
}

// ------------------------------------------------------------------ the model

export function computeDpr(input: DprInput): DprResult {
  const { build, attacks, features, slices, featIds, totalLevel } = input;
  const itemRiders = input.itemRiders ?? [];
  const itemExtraBonusAttack = input.itemExtraBonusAttack ?? false;
  const options = new Set(build.classOptionIds);
  const notes: string[] = [];

  const targetAc = typicalAcFor(totalLevel);
  const critOn = critRangeFor(input);
  const swings = attacksPerAction(features);
  const gwf = options.has('great-weapon-fighting');

  const main = attacks.find((a) => a.hand === 'main');
  const off = attacks.find((a) => a.hand === 'off');

  // A caster with nothing in hand is not doing zero damage - they are casting.
  if (!main) {
    return castingResult(input, targetAc, critOn);
  }

  // -- the flat and dice components of one main-hand swing -------------------
  const mainDice = weaponDiceAverage(main.weapon, main.damage.dice, gwf);
  let mainFlat = main.damage.bonus;

  const rage = rageDamage(slices);
  const raging = rage > 0 && main.weapon.melee && main.ability === 'str';
  if (raging) mainFlat += rage;

  // -- power attack ----------------------------------------------------------
  // Great Weapon Master and Sharpshooter trade 5 accuracy for 10 damage, which
  // is a gain only while your hit chance is high enough to afford it.
  const canPowerAttack =
    (featIds.has('great-weapon-master') && main.weapon.melee && main.weapon.properties.includes('heavy')) ||
    (featIds.has('sharpshooter') && !main.weapon.melee);

  const perSwing = (ac: number, power: boolean, toHitBonus = 0) => {
    const odds = oddsFor(main.toHit + toHitBonus - (power ? 5 : 0), ac, critOn, input.advantage);
    return expectedDamage(odds, mainDice, mainFlat + (power ? 10 : 0));
  };

  /*
    2024 weapon mastery.

    The app has ranked which mastery to take since masteries landed, from a
    curated table of opinions, while the damage model could not see them at
    all - so a Fighter with six masteries and one with none produced the same
    curve, and the ranking was an opinion sitting next to a model that
    disagreed with it by omission.

    Two of the eight are arithmetic and are computed here. The other six are
    control - prone, disadvantage, forced movement, a second target - and
    depend on the battlefield rather than on the character, so they stay
    ranked and unmodelled, and the notes say which is which rather than
    letting a reader assume the number covers everything.
  */
  const mastery = masteryInHand(input, main);
  const abilityMod = input.mods[main.ability] ?? 0;

  /** Graze: a miss still deals your ability modifier. */
  const grazeAt = (ac: number, power: boolean, toHitBonus = 0): number => {
    if (mastery !== 'graze' || abilityMod <= 0) return 0;
    const odds = oddsFor(main.toHit + toHitBonus - (power ? 5 : 0), ac, critOn, input.advantage);
    // `odds.hit` is the whole chance of connecting, crits included - `odds.crit`
    // is the extra dice on top, not a separate outcome. So a miss is 1 - hit,
    // and subtracting the crit as well would invent misses that do not happen.
    return swings * Math.max(0, 1 - odds.hit) * abilityMod;
  };

  /*
    Vex: a hit gives advantage on your next attack against that creature.

    So the swings in a round are a chain rather than N copies of one number -
    the second swing is advantaged as often as the first one hits, the third
    as often as the second does, and so on. That is a two-state Markov chain
    and it is cheap to walk directly.

    The first swing of the round carries nothing in. A round that follows a
    round which ended on a hit really would start advantaged, but assuming
    that would be assuming the fight, so this understates rather than
    flatters. It is returned as a delta against the same swings without Vex,
    which is what keeps the breakdown adding up.
  */
  const vexGainAt = (ac: number, power: boolean, toHitBonus = 0): number => {
    // Nothing to gain if the model is already assuming advantage everywhere.
    if (mastery !== 'vex' || input.advantage || swings < 2) return 0;
    const toHit = main.toHit + toHitBonus - (power ? 5 : 0);
    const flat = mainFlat + (power ? 10 : 0);
    const plain = oddsFor(toHit, ac, critOn, false);
    const withAdv = oddsFor(toHit, ac, critOn, true);
    const gainPerSwing = expectedDamage(withAdv, mainDice, flat) - expectedDamage(plain, mainDice, flat);

    let advantaged = 0;
    let gained = 0;
    for (let swing = 0; swing < swings; swing++) {
      gained += advantaged * gainPerSwing;
      advantaged =
        advantaged * (withAdv.hit + withAdv.crit) + (1 - advantaged) * (plain.hit + plain.crit);
    }
    return gained;
  };

  // -- once-per-turn riders --------------------------------------------------
  const sneakDice = sneakAttackDice(slices);
  const tabled = tabledRiders(slices);
  // These are spells, so they count when the character actually has them - not
  // merely because they are the right class.
  const spells = new Set(build.spellIds);

  /*
    The concentration buff, singular.

    This used to add Hunter's Mark and Hex together for a character carrying
    both - two concentration spells at once, which is not a thing you can do,
    and the breakdown below only ever listed one of them, so the number
    disagreed with its own explanation. It also ignored Bless entirely, which
    meant the "assume a concentration buff is up" switch did nothing at all for
    a Cleric.

    So: the candidates the character actually has, and the best one at each AC.
    Which is better genuinely depends on the target - +1d4 to hit is worth more
    against high AC, a flat d6 per hit is worth more against low.
  */
  const buffs: ConcentrationBuff[] = [];
  if (input.concentrating) {
    if (spells.has('hunters-mark')) {
      buffs.push({ label: "Hunter's Mark 1d6", perHit: averageDice(1, 6) });
    } else if (spells.has('hex')) {
      buffs.push({ label: 'Hex 1d6', perHit: averageDice(1, 6) });
    }
    // Bless is +1d4 on every attack roll, which averages 2.5 on the modifier.
    if (spells.has('bless')) buffs.push({ label: 'Bless +1d4 to hit', toHit: 2.5 });
  }

  const sustainedWith = (ac: number, buff: ConcentrationBuff | null): number => {
    const toHit = buff?.toHit ?? 0;
    const power = canPowerAttack && perSwing(ac, true, toHit) > perSwing(ac, false, toHit);
    const odds = oddsFor(main.toHit + toHit - (power ? 5 : 0), ac, critOn, input.advantage);

    let total = swings * perSwing(ac, power, toHit);
    total += grazeAt(ac, power, toHit) + vexGainAt(ac, power, toHit);

    // A d6 rider applies to every hit; Sneak Attack only to the first.
    const riderDice = buff?.perHit ?? 0;
    if (riderDice) total += swings * (odds.hit * riderDice + odds.crit * riderDice);

    // A weapon's own rider. Per-hit riders land on every connecting swing and
    // double nothing - the extra dice are not weapon dice, so a critical does
    // not double them under the rules as written for a Flame Tongue.
    for (const rider of itemRiders) {
      const amount = riderAverage(rider);
      if (!amount) continue;
      total += rider.when === 'crit'
        ? swings * odds.crit * amount
        : swings * (odds.hit + odds.crit) * amount;
    }

    // A weapon that grants its own bonus-action attack, as the Scimitar of
    // Speed does. One swing, at the same odds as the others.
    if (itemExtraBonusAttack) total += perSwing(ac, power, toHit);

    // Once per turn, so it lands on the first attack that connects.
    const chanceAnyHits = 1 - (1 - odds.hit) ** swings;
    if (sneakDice) {
      total += chanceAnyHits * averageDice(sneakDice, 6) + odds.crit * averageDice(sneakDice, 6);
    }
    for (const rider of tabled) {
      const amount = averageDice(rider.dice, rider.die);
      total += chanceAnyHits * amount + odds.crit * amount;
    }

    if (off) {
      const offDice = weaponDiceAverage(off.weapon, off.damage.dice, gwf);
      // Bless is on every attack roll, including the off hand.
      const offOdds = oddsFor(off.toHit + toHit, ac, critOn, input.advantage);
      total += expectedDamage(offOdds, offDice, off.damage.bonus + (raging ? rage : 0));
    }

    // Bonus-action attacks from feats.
    if (featIds.has('polearm-master') && main.weapon.polearm) {
      const buttOdds = oddsFor(main.toHit + toHit - (power ? 5 : 0), ac, critOn, input.advantage);
      total += expectedDamage(buttOdds, averageDice(1, 4), mainFlat + (power ? 10 : 0));
    }
    if (featIds.has('crossbow-expert') && main.weapon.id === 'hand-crossbow') {
      total += perSwing(ac, power, toHit);
    }

    return total;
  };

  /**
   * The buff that pays best against this target, or none at all. Resolved per
   * AC rather than once, because the answer changes across the curve.
   */
  const bestBuffAt = (ac: number): ConcentrationBuff | null =>
    buffs.reduce<ConcentrationBuff | null>(
      (best, buff) => (sustainedWith(ac, buff) > sustainedWith(ac, best) ? buff : best),
      null,
    );

  const sustainedAt = (ac: number): number => sustainedWith(ac, bestBuffAt(ac));

  // -- nova ------------------------------------------------------------------
  const smite = smiteDice(slices);
  /*
    Read by tag, not by name. This was `f.name === 'Action Surge'` until the
    SRD audit renamed the row "Action Surge (1 use)" to match the source's own
    tiering - and every Fighter's nova number silently halved, because a
    display string was load-bearing. Tags exist for exactly this; `swings`
    above has always read `extra-attack` the same way.
  */
  const actionSurge = hasFeatureTag(features, 'action-surge');

  const novaAt = (ac: number): number => {
    let total = sustainedAt(ac);
    const toHit = bestBuffAt(ac)?.toHit ?? 0;
    if (actionSurge) {
      const power = canPowerAttack && perSwing(ac, true, toHit) > perSwing(ac, false, toHit);
      total += swings * perSwing(ac, power, toHit);
    }
    if (smite) {
      // One smite on the first hit of the round.
      const odds = oddsFor(main.toHit, ac, critOn, input.advantage);
      const chanceAnyHits = 1 - (1 - odds.hit) ** swings;
      total += chanceAnyHits * averageDice(smite, 8) + odds.crit * averageDice(smite, 8);
    }
    return total;
  };

  const curve = acRange().map((ac) => ({
    ac,
    sustained: round(sustainedAt(ac)),
    nova: round(novaAt(ac)),
  }));

  // -- the break-even AC for -5/+10 -----------------------------------------
  let powerAttackBreakEven: number | undefined;
  if (canPowerAttack) {
    const worthIt = acRange().filter((ac) => perSwing(ac, true) > perSwing(ac, false));
    powerAttackBreakEven = worthIt.length ? Math.max(...worthIt) : AC_RANGE.min - 1;
    notes.push(
      powerAttackBreakEven >= AC_RANGE.min
        ? `The −5/+10 option pays off up to AC ${powerAttackBreakEven}; above that you lose more to missing than you gain.`
        : 'The −5/+10 option costs more accuracy than it gains damage at every AC on this build.',
    );
  }

  /*
    The itemised breakdown at the headline AC.

    Every line here is computed *without* the concentration buff, and the buff
    gets one line carrying the whole difference it makes. That is the only
    arrangement where the lines add up to the headline number: Bless improves
    the odds on every attack rather than adding damage to one, so folding it
    into the weapon line and then listing it again counts it twice.
  */
  const buff = bestBuffAt(targetAc);
  const power = canPowerAttack && perSwing(targetAc, true) > perSwing(targetAc, false);
  const odds = oddsFor(main.toHit - (power ? 5 : 0), targetAc, critOn, input.advantage);
  const lines: DprLine[] = [
    {
      label: `${main.weapon.name} × ${swings}`,
      value: round(swings * perSwing(targetAc, power)),
      detail: `${Math.round(odds.hit * 100)}% to hit at AC ${targetAc}, ${main.damage.dice}+${mainFlat}${power ? ', with −5/+10' : ''}`,
    },
  ];
  if (off) {
    const offDice = weaponDiceAverage(off.weapon, off.damage.dice, gwf);
    const offOdds = oddsFor(off.toHit, targetAc, critOn, input.advantage);
    lines.push({
      label: `${off.weapon.name} (off hand)`,
      value: round(expectedDamage(offOdds, offDice, off.damage.bonus + (raging ? rage : 0))),
    });
  }
  if (sneakDice) {
    const chanceAnyHits = 1 - (1 - odds.hit) ** swings;
    lines.push({
      label: `Sneak Attack ${sneakDice}d6`,
      value: round(chanceAnyHits * averageDice(sneakDice, 6) + odds.crit * averageDice(sneakDice, 6)),
      detail: 'Once per turn, on the first attack that lands.',
    });
  }
  for (const rider of tabled) {
    const amount = averageDice(rider.dice, rider.die);
    lines.push({
      label: `${rider.name} ${rider.dice}d${rider.die}`,
      value: round((1 - (1 - odds.hit) ** swings) * amount + odds.crit * amount),
      detail: 'Once per turn, on the first attack that lands.',
    });
  }
  if (raging) lines.push({ label: `Rage +${rage} per hit`, value: round(swings * odds.hit * rage) });
  if (mastery === 'graze' && abilityMod > 0) {
    lines.push({
      label: `Graze +${abilityMod} on a miss`,
      value: round(grazeAt(targetAc, power)),
      detail: `${Math.round(Math.max(0, 1 - odds.hit) * 100)}% of swings miss at AC ${targetAc}, and none of them are wasted.`,
    });
  }
  if (mastery === 'vex') {
    const gain = vexGainAt(targetAc, power);
    lines.push({
      label: 'Vex — advantage after a hit',
      value: round(gain),
      detail: input.advantage
        ? 'Nothing, because this build is already assumed to have advantage.'
        : swings < 2
          ? 'Nothing yet: it advantages your *next* swing, and you only make one.'
          : 'Each swing is advantaged as often as the one before it landed.',
    });
  }
  if (buff) {
    const gain = sustainedWith(targetAc, buff) - sustainedWith(targetAc, null);
    const improved = oddsFor(
      main.toHit + (buff.toHit ?? 0) - (power ? 5 : 0),
      targetAc,
      critOn,
      input.advantage,
    );
    lines.push({
      label: buff.label,
      value: round(gain),
      detail: [
        buff.toHit
          ? `${Math.round(odds.hit * 100)}% to hit becomes ${Math.round(improved.hit * 100)}%.`
          : null,
        buffs.length > 1
          ? 'The best of the ones you have at this AC; you can only concentrate on one.'
          : 'Assumes the concentration is up.',
      ]
        .filter(Boolean)
        .join(' '),
    });
  }
  for (const rider of itemRiders) {
    const amount = riderAverage(rider);
    if (!amount) continue;
    const printed = rider.dice ?? String(rider.flat);
    lines.push({
      label: `${rider.label} +${printed} ${rider.type}`,
      value: round(rider.when === 'crit'
        ? swings * odds.crit * amount
        : swings * (odds.hit + odds.crit) * amount),
      detail: rider.when === 'crit'
        ? 'Only on a critical hit, so it is small on average and swingy in play.'
        : 'On every hit.',
    });
  }
  if (itemExtraBonusAttack) {
    lines.push({
      label: 'Extra attack from the weapon',
      value: round(perSwing(targetAc, power)),
      detail: 'A bonus action, so it competes with anything else wanting one.',
    });
  }
  if (actionSurge) {
    lines.push({
      label: 'Action Surge (nova only)',
      value: round(swings * perSwing(targetAc, power)),
      detail: 'Once per short rest.',
    });
  }
  if (smite) {
    const chanceAnyHits = 1 - (1 - odds.hit) ** swings;
    lines.push({
      label: `Divine Smite ${smite}d8 (nova only)`,
      value: round(chanceAnyHits * averageDice(smite, 8) + odds.crit * averageDice(smite, 8)),
      detail: 'One slot, on the first hit.',
    });
  }

  if (mastery && mastery !== 'graze' && mastery !== 'vex') {
    notes.push(
      `${MASTERY_LABELS[mastery]} is not in these numbers. It moves the fight rather than the damage — `
      + 'where the target ends up, what it can do next, whether a second enemy is in reach — so it is '
      + 'ranked in the Equipment section rather than guessed at here.',
    );
  }
  if (critOn < 20) notes.push(`This build crits on ${critOn}+, which is folded into every number.`);
  if (!input.advantage) notes.push('Assumes a straight roll. Turn on advantage to see the difference.');

  const swinging: DprResult = {
    targetAc,
    sustained: round(sustainedAt(targetAc)),
    nova: round(novaAt(targetAc)),
    curve,
    lines,
    notes,
    powerAttackBreakEven,
    assumedAdvantage: input.advantage,
  };

  // A round is a choice: you swing or you cast. Carrying a weapon does not make
  // swinging the right move - a Wizard holding a greatsword should be casting -
  // so the better of the two plans is the one reported, and the other is named.
  return betterOf(swinging, input, targetAc, critOn, main.weapon.name);
}

/**
 * Weapon damage against spell damage, for a character who could do either.
 * Compared on sustained damage, because that is the round you repeat; the
 * losing plan is reported as a note rather than dropped, since knowing your
 * sword is behind your cantrip is the useful part.
 */
function betterOf(
  swinging: DprResult,
  input: DprInput,
  targetAc: number,
  critOn: number,
  weaponName: string,
): DprResult {
  if (!input.spells.some((s) => s.damage)) return swinging;

  const casting = castingResult(input, targetAc, critOn);
  if (casting.sustained <= swinging.sustained) {
    if (casting.sustained > 0) {
      swinging.notes.push(
        `Your best cantrip does ${casting.sustained} a round here, behind the ${swinging.sustained} from ${weaponName}. Swinging is the better round.`,
      );
    }
    return swinging;
  }

  return {
    ...casting,
    // Nova can still belong to the weapon - a Paladin's smite outruns a cantrip
    // even when the cantrip wins the sustained round.
    nova: Math.max(casting.nova, swinging.nova),
    curve: casting.curve.map((point, i) => ({
      ...point,
      nova: Math.max(point.nova, swinging.curve[i].nova),
    })),
    powerAttackBreakEven: swinging.powerAttackBreakEven,
    notes: [
      ...casting.notes,
      `Casting beats swinging on this build: ${weaponName} does ${swinging.sustained} a round against the ${casting.sustained} from your best cantrip.`,
    ],
  };
}

function acRange(): number[] {
  const out: number[] = [];
  for (let ac = AC_RANGE.min; ac <= AC_RANGE.max; ac++) out.push(ac);
  return out;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

// ------------------------------------------------------------ spell damage

/** Expected damage from one casting of a spell, at a given target AC. */
/**
 * The DC and attack bonus this particular spell is cast at.
 *
 * For a single-class caster there is one answer and it is the one the input
 * already carried. For a multiclass caster the answer depends on whose list the
 * spell is on, which is what `dcForSpell` resolves.
 */
function castingFor(
  spell: Spell,
  input: DprInput,
): { saveDc: number | null; attack: number | null } {
  const sources = input.castingSources;
  if (!sources?.length) return { saveDc: input.spellSaveDc, attack: input.spellAttack };

  // The recorded class where there is one, the best eligible where there is
  // not. Same resolution the sheet uses, so the curve and the page agree.
  const { source } = sourceForSpell(spell, sources, input.build.spellSources?.[spell.id]);
  return { saveDc: source?.saveDc ?? null, attack: source?.attackBonus ?? null };
}

export function spellDamageAt(
  spell: Spell,
  input: DprInput,
  ac: number,
  critOn: number,
  slotLevel?: number,
  buff?: SpellBuff | null,
): number {
  const damage = spell.damage;
  if (!damage) return 0;

  const { count, die } = parseDice(damage.dice);
  let dice = averageDice(count, die);

  if (damage.scaling === 'cantrip') {
    dice *= cantripMultiplier(input.totalLevel);
  } else if (damage.scaling === 'slot' && damage.perSlot && slotLevel) {
    const extra = parseDice(damage.perSlot);
    const levelsAbove = Math.max(0, slotLevel - spell.level);
    dice += averageDice(extra.count * levelsAbove, extra.die);
  }

  const targets = Math.min(damage.targets ?? 1, Math.max(1, input.targets));
  const casting = castingFor(spell, input);

  if (damage.save) {
    if (casting.saveDc === null) return 0;
    // Bane subtracts a d4 from the target's saving throws, which is the same
    // 2.5 average taken off their bonus.
    const saveBonus = typicalSaveBonusFor(input.totalLevel) - (buff?.enemySave ?? 0);
    const fail = failChance(casting.saveDc, saveBonus);
    return expectedSaveDamage(fail, dice, damage.halfOnSave ?? false, targets);
  }

  // An attack-roll spell. Eldritch Blast fires several beams, which the cantrip
  // multiplier already accounts for as extra dice.
  if (casting.attack === null) return 0;
  const odds = oddsFor(casting.attack + (buff?.toHit ?? 0), ac, critOn, input.advantage);
  return expectedDamage(odds, dice, 0) * targets;
}

/** The best at-will and best slot spell this character actually has. */
export function bestSpells(
  input: DprInput,
  ac: number,
  critOn: number,
  buff?: SpellBuff | null,
): SpellDamageOptions {
  const out: SpellDamageOptions = {};

  for (const spell of input.spells) {
    if (!spell.damage) continue;

    if (spell.level === 0) {
      const damage = spellDamageAt(spell, input, ac, critOn, undefined, buff);
      if (!out.cantrip || damage > out.cantrip.damage) out.cantrip = { spell, damage };
    } else if (spell.level <= input.highestSlot) {
      const damage = spellDamageAt(spell, input, ac, critOn, input.highestSlot, buff);
      if (!out.slotSpell || damage > out.slotSpell.damage) out.slotSpell = { spell, damage };
    }
  }

  return out;
}

/**
 * A concentration spell that helps you cast rather than swing.
 *
 * The weapon branch has its own list of these. They are kept apart because they
 * do different jobs - Bane is worth nothing to a Fire Bolt and Hunter's Mark is
 * worth nothing to a Fireball - and because only one branch is ever reported.
 * `computeDpr` picks the better of swinging and casting, so a character holding
 * candidates for both is not running two concentration spells at once: they are
 * concentrating on whichever helps the round they actually take, which is the
 * right answer rather than an approximation of one.
 */
interface SpellBuff {
  label: string;
  /** Added to spell attack rolls, as Bless gives. */
  toHit?: number;
  /** Taken off the target's saving throws, as Bane gives. */
  enemySave?: number;
}

/** The candidates this character has, best first at the given AC. */
function spellBuffsFor(input: DprInput): SpellBuff[] {
  if (!input.concentrating) return [];
  const spells = new Set(input.build.spellIds);
  const buffs: SpellBuff[] = [];
  if (spells.has('bless')) buffs.push({ label: 'Bless +1d4 to hit', toHit: 2.5 });
  if (spells.has('bane')) buffs.push({ label: 'Bane −1d4 on their saves', enemySave: 2.5 });
  return buffs;
}

/**
 * Damage for a character with no weapon in hand. Sustained is their best
 * cantrip, which is the honest all-day number; nova is their best slot spell.
 */
function castingResult(input: DprInput, targetAc: number, critOn: number): DprResult {
  const candidates = spellBuffsFor(input);

  /*
    One buff for the whole branch, not one per spell. Bless helps a Fire Bolt
    and Bane helps a Fireball, so choosing per spell would quietly run both at
    once on a character who has them - the same two-concentrations-at-once
    mistake the weapon branch used to make with Hunter's Mark and Hex.
    Chosen on the sustained round, which is the one you repeat.
  */
  const buffAt = (ac: number): SpellBuff | null =>
    candidates.reduce<SpellBuff | null>(
      (best, buff) =>
        (bestSpells(input, ac, critOn, buff).cantrip?.damage ?? 0) >
        (bestSpells(input, ac, critOn, best).cantrip?.damage ?? 0)
          ? buff
          : best,
      null,
    );

  const sustainedAt = (ac: number) =>
    bestSpells(input, ac, critOn, buffAt(ac)).cantrip?.damage ?? 0;
  const novaAt = (ac: number) => {
    const best = bestSpells(input, ac, critOn, buffAt(ac));
    return best.slotSpell?.damage ?? best.cantrip?.damage ?? 0;
  };

  const buff = buffAt(targetAc);
  const best = bestSpells(input, targetAc, critOn, buff);
  /*
    The spell lines are itemised *without* the buff and the buff carries the
    difference, which is the only arrangement where they add up to the headline
    - Bless and Bane both move the odds rather than adding damage, so folding
    them into the spell's own line and then listing them again counts them
    twice.
  */
  const plain = bestSpells(input, targetAc, critOn, null);
  const lines: DprLine[] = [];
  const notes: string[] = [];

  if (best.cantrip) {
    lines.push({
      label: best.cantrip.spell.name,
      value: round(plain.cantrip?.damage ?? best.cantrip.damage),
      detail: `At-will, ${best.cantrip.spell.damage!.type}${
        best.cantrip.spell.damage!.save ? `, ${best.cantrip.spell.damage!.save.toUpperCase()} save` : ''
      }`,
    });
  }
  if (best.slotSpell) {
    lines.push({
      label: `${best.slotSpell.spell.name} (nova only)`,
      value: round(plain.slotSpell?.damage ?? best.slotSpell.damage),
      detail: `Cast at level ${input.highestSlot}, assuming ${input.targets} target${input.targets === 1 ? '' : 's'}`,
    });
  }

  if (buff) {
    lines.push({
      label: buff.label,
      value: round((best.cantrip?.damage ?? 0) - (plain.cantrip?.damage ?? 0)),
      detail: buff.enemySave
        ? 'On the at-will round. Assumes the target failed its own save against Bane, and it helps the nova spell too.'
        : 'On the at-will round. Assumes the concentration is up, and it helps the nova spell too.',
    });
  }

  if (!input.spells.length) {
    notes.push('No spells chosen, so there is nothing to calculate. Pick some in the Spells panel.');
  } else if (!best.cantrip) {
    notes.push('No damage cantrip chosen, so this character has no at-will damage.');
  }
  if (best.slotSpell?.spell.damage?.targets) {
    notes.push(
      `Area damage assumes ${input.targets} target${input.targets === 1 ? '' : 's'}; change that assumption to see the spread.`,
    );
  }

  return {
    targetAc,
    sustained: round(sustainedAt(targetAc)),
    nova: round(novaAt(targetAc)),
    curve: acRange().map((ac) => ({ ac, sustained: round(sustainedAt(ac)), nova: round(novaAt(ac)) })),
    lines,
    notes,
    assumedAdvantage: input.advantage,
  };
}
