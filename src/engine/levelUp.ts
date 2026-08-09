import type { Build } from '../types';
import { subclassLevelFor } from '../data/classes';
import { deriveBuild } from './character';
import { optionGroups } from './classOptions';
import type { HeldFeature } from './features';

/**
 * What changed when you went up a level, and what you still owe.
 *
 * Levelling used to be a number you typed. Everything downstream was already
 * correct - the features appeared, the ASI slot opened, the spell counts moved
 * - but nothing *said* so, so you found out by noticing a badge or by not
 * noticing it. This is the missing sentence: here is what this level gave you,
 * and here is what it is waiting for you to choose.
 *
 * It computes rather than stores. Two builds go in, the differences come out,
 * which means it cannot drift from what the rest of the engine believes and
 * there is no record of "you levelled" to migrate later.
 *
 * The number field stays. This is an explanation, not a gate.
 */

export interface LevelUpStep {
  kind: 'hp' | 'features' | 'subclass' | 'asi' | 'spells' | 'options';
  title: string;
  detail: string;
  /**
   * How many decisions this step is still waiting on. Zero means it is
   * information rather than a task - hit points and features always are.
   */
  owed: number;
}

export interface LevelUpSummary {
  from: number;
  to: number;
  /** Which class took the level, for a multiclass character. */
  className: string | null;
  hitDie: number;
  /** Hit points the level added, under whatever mode the character uses. */
  hpGained: number;
  featuresGained: HeldFeature[];
  steps: LevelUpStep[];
  /** Total decisions owed, which is what a badge would show. */
  owed: number;
}

const totalLevel = (build: Build) =>
  build.classes.reduce((sum, entry) => sum + entry.level, 0);

/**
 * The class whose level went up, if exactly one did and nothing else moved.
 *
 * Both halves matter. Only checking for growth would read "Fighter 4 becomes
 * Wizard 5" as a Wizard levelling up, because the Wizard did go from nothing
 * to five - and would then report a whole character's worth of features as
 * though one level had granted them.
 */
function whatChanged(before: Build, after: Build) {
  const levelOf = (build: Build, classId: string) =>
    build.classes.find((entry) => entry.classId === classId)?.level ?? 0;

  const shrank = before.classes.some(
    (entry) => levelOf(after, entry.classId) < entry.level,
  );
  if (shrank) return null;

  const grown = after.classes.filter(
    (entry) => entry.level > levelOf(before, entry.classId),
  );
  return grown.length === 1 ? grown[0] : null;
}

/**
 * `2 spells`, `1 spell`.
 *
 * The plural form is a separate argument rather than `${one}s`, because the
 * thing being counted is often a phrase - "spell to choose" pluralises in the
 * middle, and an earlier version of this produced "8 spell to chooses".
 */
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Compare two builds and describe the step between them.
 *
 * Returns null when the level did not go up, or when more than one thing
 * changed at once - an import, or a class swap. A summary of "you gained
 * everything" for a character who was replaced wholesale would be noise
 * dressed as a report.
 */
export function levelUpSummary(before: Build, after: Build): LevelUpSummary | null {
  const from = totalLevel(before);
  const to = totalLevel(after);
  if (to !== from + 1) return null;

  const grew = whatChanged(before, after);
  if (!grew) return null;

  const wasCtx = deriveBuild(before);
  const nowCtx = deriveBuild(after);

  const slice = nowCtx.slices.find((s) => s.klass.id === grew.classId);
  const className = slice?.klass.name ?? null;
  const hitDie = slice?.klass.hitDie ?? 0;

  // --- what it gave -------------------------------------------------------

  /*
    Keyed by level as well as by name, and the level is the whole point: a
    class can grant the same feature more than once. Without it, "Rogue:
    Expertise" from level 1 matched the second grant at 6, and this screen -
    the one thing that tells a player what a level gave them - said the level
    gave them nothing. The same silence covered the Bard's second and third
    Magical Secrets and every scaling tier the SRD audit added.
  */
  const stamp = (f: HeldFeature) => `${f.source}:${f.level}:${f.name}`;
  const had = new Set(wasCtx.features.map(stamp));
  const featuresGained = nowCtx.features.filter((f) => !had.has(stamp(f)));

  const hpGained = nowCtx.hp.total - wasCtx.hp.total;

  // --- what it wants ------------------------------------------------------

  const steps: LevelUpStep[] = [];

  /*
    The hit point step carries no prose. Its wording depends on how the
    character counts hit points *now*, and rolling changes that from inside the
    panel - so a sentence baked in here would still be saying "the fixed
    average" a moment after somebody had rolled. The panel writes it.
  */
  steps.push({ kind: 'hp', title: `+${hpGained} hit points`, detail: '', owed: 0 });

  if (featuresGained.length) {
    steps.push({
      kind: 'features',
      title: plural(featuresGained.length, 'new feature', 'new features'),
      detail: featuresGained.map((f) => f.name).join(', '),
      owed: 0,
    });
  }

  /*
    A subclass is due when the class has reached the level that grants one and
    nothing is chosen. 2024 moved that to 3rd for everyone, which is why the
    level is asked for rather than assumed.
  */
  if (slice && !slice.subclass && grew.level >= subclassLevelFor(slice.klass, after.ruleset)) {
    steps.push({
      kind: 'subclass',
      title: `Choose a ${slice.klass.name} subclass`,
      detail: 'It is due at this level, and most of what the class becomes follows from it.',
      owed: 1,
    });
  }

  const asiOwed = Math.max(0, nowCtx.asiSlotsReached - nowCtx.asiSlotsSpent);
  const asiNew = nowCtx.asiSlotsReached - wasCtx.asiSlotsReached;
  if (asiNew > 0 || asiOwed > 0) {
    steps.push({
      kind: 'asi',
      title:
        asiNew > 0
          ? 'An ability score improvement, or a feat'
          : `${plural(asiOwed, 'improvement', 'improvements')} still unspent`,
      detail:
        asiNew > 0 && asiOwed > asiNew
          ? `This level opened one, and ${asiOwed - asiNew} from earlier levels are still waiting.`
          : 'The Feats section ranks every option against this build.',
      owed: asiOwed,
    });
  }

  /*
    Spellcasting counts move for a lot of reasons at once - a new spell known,
    a wider prepared list, a first cantrip - so the numbers are read from the
    engine rather than reconstructed here.
  */
  const casting = nowCtx.spellcasting;
  const spellsOwed = casting.casts
    ? casting.openCantrips + casting.openSpells + casting.openPrepared
    : 0;
  const slotsGrew =
    casting.casts &&
    JSON.stringify(casting.bySpellLevel) !== JSON.stringify(wasCtx.spellcasting.bySpellLevel);
  if (spellsOwed > 0 || slotsGrew) {
    steps.push({
      kind: 'spells',
      title:
        spellsOwed > 0
          ? plural(spellsOwed, 'spell to choose', 'spells to choose')
          : 'New spell slots',
      detail: slotsGrew
        ? 'Your slots changed at this level; the Spells panel ranks what to take.'
        : 'The Spells panel ranks every option against this build.',
      owed: spellsOwed,
    });
  }

  const optionsOwed = optionGroups(nowCtx).reduce(
    (sum, group) => sum + Math.max(0, group.slots - group.chosen.length),
    0,
  );
  const optionsBefore = optionGroups(wasCtx).reduce(
    (sum, group) => sum + Math.max(0, group.slots - group.chosen.length),
    0,
  );
  if (optionsOwed > 0) {
    steps.push({
      kind: 'options',
      title: plural(optionsOwed, 'class option to choose', 'class options to choose'),
      detail:
        optionsOwed > optionsBefore
          ? 'This level opened at least one — invocations, metamagic, maneuvers, and the rest.'
          : 'Still open from an earlier level.',
      owed: optionsOwed,
    });
  }

  return {
    from,
    to,
    className,
    hitDie,
    hpGained,
    featuresGained,
    steps,
    owed: steps.reduce((sum, step) => sum + step.owed, 0),
  };
}

/**
 * Record this level's hit die roll.
 *
 * The list is one face per level above the first, in order, so a roll is
 * appended rather than written at an index - the character's own level says
 * where it lands. Rolling again at the same level replaces that entry rather
 * than growing the list, which is what "reroll" has to mean.
 */
export function recordHitDieRoll(build: Build, face: number): Build {
  const level = totalLevel(build);
  const wanted = Math.max(0, level - 1);
  const rolls = [...(build.defenses.rolledHitDice ?? [])].slice(0, wanted);
  // Zero is the "not rolled yet" sentinel, so padding with it is padding with
  // "these levels still take the average" rather than with zero hit points.
  while (rolls.length < wanted - 1) rolls.push(0);
  rolls[wanted - 1] = face;
  return {
    ...build,
    defenses: { ...build.defenses, hpMode: 'rolled', rolledHitDice: rolls },
  };
}
