import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ABILITIES, ABILITY_NAMES, RULESETS, RULESET_LABELS } from '../types';
import type { Ability, Build, ClassEntry, ClassId, Loadout, Ruleset, WeaponStyle } from '../types';
import { CLASSES_BY_ID, classesFor, subclassLevelFor, subclassName, subclassSource, subclassesFor } from '../data/classes';
import { featById, featsFor } from '../data/feats';
import { RACES_BY_ID, raceLineages } from '../data/races';
import { BACKGROUNDS_BY_ID, backgroundsFor } from '../data/backgrounds';
import { abilityMod, racialAsi } from '../engine/character';
import { ARMOR, ARMOR_CATEGORY_LABEL } from '../data/armor';
import { armorProficiencies, isProficientWith, weaponProficiencies } from '../engine/defense';
import { damageDice, isLight, isTwoHanded, weaponsFor } from '../data/weapons';
import { masterySlots, recommendMasteries } from '../engine/attacks';
import { legalPicks, reconcileSkillPicks } from '../engine/proficiency';
import { fillSkillPicks, recommendSkills } from '../engine/skillValue';
import type { SkillId } from '../data/skills';
import type { Line } from '../engine/defense';
import type { BuildContext } from '../engine/character';
import {
  POINT_BUY_BUDGET,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  assignStandardArray,
  optimalPointBuy,
  pointsSpent,
} from '../engine/pointBuy';
import { analyze, problemsOnly } from '../engine/analyze';
import { recommendNext } from '../engine/recommend';
import type { Suggestion } from '../engine/recommend';
import { optionGroups, reconcileClassOptions } from '../engine/classOptions';
import type { OptionSuggestion } from '../engine/classOptions';
import { describeSpell, recommendSpells, spellGroups } from '../engine/spellRecommend';
import { reconcileSpells } from '../engine/spellcasting';
import type { CastingSource } from '../engine/spellcasting';
import type { SpellSuggestion } from '../engine/spellRecommend';
import { CASTING_TIME_LABELS, SPELLS_BY_ID } from '../data/spells';
import { RulesDisclosure } from './RulesText';
import { classFeaturesAtExactly } from '../data/classFeatures';
import { deriveBuild } from '../engine/character';
import { cellFor } from '../engine/raceMatrix';
import { FitBar, Panel, RatingTag, ReasonList, Select, SourceTag, SuggestionCard } from './shared';
import { ItemsPanel } from './ItemsPanel';
import { InventoryPanel } from './InventoryPanel';
import { StartingEquipmentPanel } from './StartingEquipmentPanel';
import { LevelUpPanel } from './LevelUpPanel';
import { levelUpSummary } from '../engine/levelUp';
import type { LevelUpSummary } from '../engine/levelUp';
import { ToolsPanel } from './ToolsPanel';
import { CountersPanel } from './CountersPanel';

const WEAPON_STYLE_LABELS: Record<WeaponStyle, string> = {
  'str-melee': 'Strength melee',
  'dex-melee': 'Dexterity melee',
  'dex-ranged': 'Ranged weapons',
  unarmed: 'Unarmed',
  spell: 'Spells',
};

const LOADOUT_LABELS: Record<Loadout, string> = {
  'two-handed': 'Two-handed',
  polearm: 'Polearm',
  'sword-and-board': 'Weapon and shield',
  'dual-wield': 'Two weapons',
  ranged: 'Ranged',
  none: 'One hand free',
};

/**
 * The Builder's sections.
 *
 * Seventeen panels, all open at once, made this tab five screens tall - long
 * enough that reaching the feats meant scrolling past sixteen ranked cards for
 * two class options. One section at a time is roughly one screen, and each
 * carries the readouts its own edits move: change armor and the attack, damage
 * and armor class panels are already beside you.
 *
 * The badge is the point of having a nav at all. It says where a choice is
 * still unmade, so "what have I not finished" is answered by looking at the
 * nav rather than by scrolling the whole tab.
 */
type Section = 'identity' | 'abilities' | 'equipment' | 'options' | 'feats';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'identity', label: 'Identity' },
  { id: 'abilities', label: 'Abilities' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'options', label: 'Skills & options' },
  { id: 'feats', label: 'Feats' },
];

/**
 * How many choices each section is still waiting on.
 *
 * The two 2024-only ones were missing for a while, which meant a 2024 Fighter
 * could sit on six unspent weapon masteries and three points of free ability
 * increase with every badge reading zero. The rule that unfinished choices are
 * badges rather than build-review findings only works if the badges count them.
 */
function openChoicesBySection(ctx: BuildContext): Record<Section, number> {
  const { proficiencies: profs, spellcasting: casting, build } = ctx;
  const options = optionGroups(ctx).reduce((sum, group) => sum + group.open, 0);
  const openMasteries = Math.max(
    0,
    masterySlots(ctx.slices, build.ruleset) - build.masteryIds.length,
  );

  // A 2024 background hands out +2/+1 or +1/+1/+1, and until they are assigned
  // the character is simply three points short of the one on the page.
  const background = build.backgroundId ? BACKGROUNDS_BY_ID[build.backgroundId] : undefined;
  const backgroundAsiWanted =
    build.ruleset === '2024' && background?.abilities
      ? build.backgroundAsi.mode === '2+1'
        ? 2
        : 3
      : 0;
  const openBackgroundAsi =
    build.backgroundAsi.mode === '1+1+1'
      ? // The spread mode raises all three, so it is done the moment it is picked.
        backgroundAsiWanted > 0 && build.backgroundAsi.picks.length === 0
        ? 1
        : 0
      : Math.max(0, backgroundAsiWanted - build.backgroundAsi.picks.length);

  return {
    identity: (build.backgroundId ? 0 : 1) + openBackgroundAsi,
    // Every score at 8 with the whole budget unspent is a sheet nobody has
    // filled in, which is the one case where this cannot be a false positive:
    // no one rolls or assigns all eights on purpose.
    abilities: pointsSpent(build.baseScores) === 0 ? 1 : 0,
    // Nothing worn and nothing held, plus any weapon mastery still unchosen.
    equipment:
      (!build.weapons.mainHandId && !build.weapons.offHandId && build.defenses.armorId === 'none'
        ? 1
        : 0) + openMasteries,
    options:
      profs.openSkillPicks +
      profs.openExpertisePicks +
      profs.languages.open +
      options +
      (casting.casts ? casting.openCantrips + casting.openSpells + casting.openPrepared : 0),
    feats:
      Math.max(0, ctx.asiSlotsReached - ctx.asiSlotsSpent) +
      Math.max(0, ctx.originFeatSlots - build.originFeatIds.length),
  };
}

/**
 * Where a character is built, and nothing else.
 *
 * Hit points spent, slots burnt and rests taken used to sit in a panel here,
 * which put "I took Sharpshooter" and "I am on 12 hit points" on the same
 * screen. They are different activities: building happens between sessions and
 * playing happens during one. Play tracking lives on the Sheet tab now, in the
 * boxes a paper sheet already has for it.
 */
export function BuilderTab({
  build,
  ctx,
  onChange,
}: {
  build: Build;
  ctx: BuildContext;
  onChange: (build: Build) => void;
}) {
  const patch = (partial: Partial<Build>) => onChange({ ...build, ...partial });
  const [section, setSection] = useState<Section>('identity');

  /*
    Noticing a level-up.

    The build arrives as a prop, so "what changed" needs the previous one. The
    cheap check comes first: `levelUpSummary` derives two whole builds, which
    is far too much to do on every keystroke in the name field, so the total
    level is compared before anything else and almost every edit stops there.
  */
  const lastBuild = useRef(build);
  const [levelUp, setLevelUp] = useState<LevelUpSummary | null>(null);
  if (lastBuild.current !== build) {
    const previous = lastBuild.current;
    lastBuild.current = build;
    const was = previous.classes.reduce((sum: number, entry) => sum + entry.level, 0);
    if (ctx.totalLevel === was + 1) {
      const summary = levelUpSummary(previous, build);
      if (summary) setLevelUp(summary);
    }
  }
  const [changes, setChanges] = useState<string[]>([]);
  const openChoices = openChoicesBySection(ctx);
  // Counted from the badges rather than from the findings, so the sentence in
  // the review and the numbers in the nav cannot disagree.
  const stillOpen = Object.values(openChoices).reduce((sum, n) => sum + n, 0);
  const findings = analyze(ctx);
  // Only the mistakes. Unmade choices are counted on the section badges and a
  // lineage verdict is stated by the fit panel, so repeating either here was
  // what made the review nine entries long on a character nobody had touched.
  const problems = problemsOnly(findings);
  const racial = racialAsi(build, ctx.race);
  const spent = pointsSpent(build.baseScores);

  const raceOptions = raceLineages(build.ruleset).flatMap(({ parent, races }) =>
    races.map((r) => ({ value: r.id, label: r.name, group: parent })),
  );

  const setClass = (index: number, partial: Partial<ClassEntry>) => {
    const classes = build.classes.map((c, i) => (i === index ? { ...c, ...partial } : c));
    // A different class has a different skill list, so picks may no longer be
    // legal. Say what was dropped rather than leaving a stale proficiency.
    const reconciled = reconcileSkillPicks({ ...build, classes });
    // The same is true of spells, and more sharply: a spell that is no longer
    // on any list this character can draw from has no card in the Spells panel,
    // so leaving it on the build would strand it where nobody can remove it.
    const spells = reconcileSpells(reconciled.build, deriveBuild(reconciled.build).spellcasting);
    setChanges([...reconciled.changes, ...spells.changes]);
    onChange(spells.build);
  };

  const featAsiPick = (featId: string, ability: Ability) =>
    patch({ featAsiChoices: { ...build.featAsiChoices, [featId]: ability } });

  const backgrounds = backgroundsFor(build.ruleset);
  // 2014 has no feat categories, so any feat can fill a Variant Human's free
  // pick; 2024 restricts origin feats to the Origin category.
  const originFeatOptions = featsFor(build.ruleset).filter(
    (f) => build.ruleset === '2014' || f.category === 'origin',
  );
  const background = build.backgroundId ? BACKGROUNDS_BY_ID[build.backgroundId] : undefined;

  /**
   * Switching ruleset invalidates the species and background, since neither
   * list overlaps. Clear them rather than leaving a character pointing at an
   * entry that no longer exists in their rules.
   */
  const switchRuleset = (ruleset: Ruleset) => {
    if (ruleset === build.ruleset) return;
    const changes: string[] = [];

    const speciesValid = raceLineages(ruleset).some((g) =>
      g.races.some((r) => r.id === build.raceId),
    );
    const raceId = speciesValid ? build.raceId : raceLineages(ruleset)[0].races[0].id;
    if (!speciesValid) {
      changes.push(
        `${ctx.race.name} is not in the ${RULESET_LABELS[ruleset]}; this character is now ${
          RACES_BY_ID[raceId]?.name ?? raceId
        }.`,
      );
    }

    // Artificer only exists in 2014, so a switch has to move that character.
    const available = classesFor(ruleset);
    const fallback = available[0].id;
    const classes = build.classes.map((entry) => {
      if (!available.some((c) => c.id === entry.classId)) {
        changes.push(
          `${CLASSES_BY_ID[entry.classId].name} is not in the ${RULESET_LABELS[ruleset]}; this character has been moved to ${CLASSES_BY_ID[fallback].name}. Pick a different class if that is wrong.`,
        );
        return { ...entry, classId: fallback, subclassId: undefined };
      }
      const klass = CLASSES_BY_ID[entry.classId];

      // Most subclasses exist in only one book. The ones that carry over keep
      // their id, so a rename is not a loss.
      if (entry.subclassId) {
        const offered = subclassesFor(klass, ruleset);
        const kept = offered.find((sub) => sub.id === entry.subclassId);
        if (!kept) {
          const previous = klass.subclasses.find((sub) => sub.id === entry.subclassId);
          changes.push(
            `${previous?.name ?? 'That subclass'} is not in the ${RULESET_LABELS[ruleset]}, so it was cleared. Pick one of the ${offered.length} that book offers.`,
          );
          return { ...entry, subclassId: undefined };
        }
        if (kept.nameIn2024 && ruleset === '2024') {
          changes.push(`${kept.name} is called ${kept.nameIn2024} in the 2024 rules. Same subclass, kept as-is.`);
        }
      }

      // 2024 moves every subclass to level 3, so a level 1 or 2 pick is no
      // longer legal and would otherwise linger behind a hidden picker.
      const needed = subclassLevelFor(klass, ruleset);
      if (entry.subclassId && entry.level < needed) {
        changes.push(
          `${klass.name} chooses a subclass at level ${needed} in the ${RULESET_LABELS[ruleset]}, so your level ${entry.level} pick was cleared.`,
        );
        return { ...entry, subclassId: undefined };
      }
      return entry;
    });

    if (build.backgroundId) changes.push('Backgrounds differ between the two books, so yours was cleared.');
    if (build.originFeatIds.length) changes.push('Origin feats were cleared, since the feat lists differ.');

    const reconciled = reconcileSkillPicks({
      ...build,
      ruleset,
      raceId,
      classes,
      backgroundId: undefined,
    });
    setChanges([...changes, ...reconciled.changes]);
    patch({
      skillIds: reconciled.build.skillIds,
      expertiseIds: reconciled.build.expertiseIds,
      ruleset,
      raceId,
      classes,
      backgroundId: undefined,
      backgroundAsi: { mode: '2+1', picks: [] },
      flexibleAsiPicks: [],
      originFeatIds: [],
      customOrigin: false,
    });
  };

  return (
    <>
      <nav className="subtabs" role="tablist" aria-label="Builder sections">
        {SECTIONS.map((entry) => {
          const open = openChoices[entry.id];
          return (
            <button
              key={entry.id}
              role="tab"
              aria-selected={section === entry.id}
              onClick={() => setSection(entry.id)}
            >
              {entry.label}
              {open > 0 && (
                <span className="badge" title={`${open} still to choose`}>
                  {open}
                </span>
              )}
            </button>
          );
        })}
      </nav>

    <div className="columns">
      <div className="stack">
        {/* Above the section, and in every section: a level changes things
            across all of them, so it would be odd to only mention it on the
            one that happened to be open. */}
        {levelUp && (
          <LevelUpPanel
            summary={levelUp}
            build={build}
            hpTotal={ctx.hp.total}
            patch={patch}
            onGoTo={(next) => setSection(next as Section)}
            onDismiss={() => setLevelUp(null)}
          />
        )}

        {section === 'identity' && (
        <Panel title="Character">
          <label className="field">
            <span>Name</span>
            <input
              type="text"
              value={build.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </label>

          {build.importedFrom && (
            <p className="muted" style={{ marginTop: -6, marginBottom: 12 }}>
              Imported from {build.importedFrom}.
            </p>
          )}

          <div className="field" role="group" aria-label="Rules">
            <span className="field-label">Rules</span>
            <div className="btn-row">
              {RULESETS.map((ruleset) => (
                <button
                  key={ruleset}
                  className={`btn btn-sm ${build.ruleset === ruleset ? 'btn-primary' : ''}`}
                  aria-pressed={build.ruleset === ruleset}
                  onClick={() => switchRuleset(ruleset)}
                >
                  {RULESET_LABELS[ruleset]}
                </button>
              ))}
            </div>
          </div>
          {build.ruleset === '2024' && (
            <p className="note">
              Under 2024 rules your species grants no ability score increases — those come from your
              background, along with a free Origin feat.
            </p>
          )}
          {changes.length > 0 && (
            <div className="callout warn" style={{ marginBottom: 12 }}>
              <strong>This change updated the character:</strong>
              <ul>
                {changes.map((change, i) => (
                  <li key={i}>{change}</li>
                ))}
              </ul>
              <button
                className="btn btn-sm"
                style={{ marginTop: 8 }}
                onClick={() => setChanges([])}
              >
                Dismiss
              </button>
            </div>
          )}

          <Select
            label={build.ruleset === '2024' ? 'Species' : 'Lineage'}
            value={build.raceId}
            onChange={(raceId) => patch({ raceId, flexibleAsiPicks: [] })}
            options={raceOptions}
          />
          {ctx.race && (
            <p className="pick-source">
              <SourceTag source={ctx.race.source} />
            </p>
          )}

          {build.ruleset === '2014' && (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={build.customOrigin}
                onChange={(e) => patch({ customOrigin: e.target.checked, flexibleAsiPicks: [] })}
              />
              <span>
                Tasha's custom origin - move the lineage's ability increases wherever you like (+2
                and +1). Turn this on if your table uses the optional rule; it makes every lineage
                viable for every class.
              </span>
            </label>
          )}

          {build.ruleset === '2014' && <FlexibleAsiPickers build={build} ctx={ctx} onChange={patch} />}

          <Select
            label="Background"
            value={build.backgroundId ?? ''}
            onChange={(backgroundId) => {
              // A background grants skills outright, which can make a pick you
              // already made redundant.
              const reconciled = reconcileSkillPicks({
                ...build,
                backgroundId: backgroundId || undefined,
                backgroundAsi: { mode: build.backgroundAsi.mode, picks: [] },
                originFeatIds: [],
              });
              setChanges(reconciled.changes);
              onChange(reconciled.build);
            }}
            options={[
              { value: '', label: '— none selected —' },
              ...backgrounds.map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
          {background && (
            <p className="note">
              <SourceTag source={background.source} />
              {background.note}
            </p>
          )}
          {build.ruleset === '2024' && background?.abilities && (
            <BackgroundAsiPickers build={build} background={background} onChange={patch} />
          )}

          <p className="note">{ctx.race.note}</p>

          {build.classes.map((entry, index) => {
            const klass = CLASSES_BY_ID[entry.classId];
            const subclass = klass.subclasses.find((s) => s.id === entry.subclassId);
            return (
              <div key={index}>
                <div className="row">
                  <Select
                    label={index === 0 ? 'Class' : `Class ${index + 1}`}
                    value={entry.classId}
                    onChange={(classId) =>
                      setClass(index, { classId: classId as ClassId, subclassId: undefined })
                    }
                    options={classesFor(build.ruleset).map((c) => ({ value: c.id, label: c.name }))}
                  />
                  <label className="field" style={{ flex: '0 1 90px' }}>
                    <span>Level</span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={entry.level}
                      onChange={(e) =>
                        setClass(index, {
                          level: Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                        })
                      }
                    />
                  </label>
                </div>
                {entry.level >= subclassLevelFor(klass, build.ruleset) && (
                  <Select
                    label="Subclass"
                    value={entry.subclassId ?? ''}
                    onChange={(subclassId) => setClass(index, { subclassId: subclassId || undefined })}
                    options={[
                      { value: '', label: '— none selected —' },
                      ...subclassesFor(klass, build.ruleset).map((s) => ({
                        value: s.id,
                        label: `${subclassName(s, build.ruleset)} (${subclassSource(s, build.ruleset)})`,
                      })),
                    ]}
                  />
                )}
                {subclass && (
                  <p className="subclass-note">
                    <SourceTag source={subclassSource(subclass, build.ruleset)} />
                    {subclass.note}
                  </p>
                )}
                {build.classes.length > 1 && (
                  <button
                    className="btn btn-sm"
                    onClick={() => patch({ classes: build.classes.filter((_, i) => i !== index) })}
                  >
                    Remove {klass.name}
                  </button>
                )}
              </div>
            );
          })}

          {build.classes.length < 3 && (
            <button
              className="btn btn-sm"
              onClick={() =>
                patch({ classes: [...build.classes, { classId: 'fighter', level: 1 }] })
              }
            >
              + Multiclass
            </button>
          )}
        </Panel>
        )}

        {section === 'abilities' && (
        <Panel
          title="Ability scores"
          subtitle="Set your base scores here. Lineage increases, half-feats and spent ASIs are added on top and shown underneath each score."
        >
          <div className="abilities">
            {ABILITIES.map((ability) => {
              const base = build.baseScores[ability];
              const total = ctx.scores[ability];
              const extra = total - base;
              const isPrimary = ctx.abilityPriority[ability] === 3;
              return (
                <div key={ability} className={`ability ${isPrimary ? 'is-primary' : ''}`}>
                  <div className="name">{ability}</div>
                  <div className="total">{total}</div>
                  <div className="mod">
                    {abilityMod(total) >= 0 ? '+' : ''}
                    {abilityMod(total)}
                  </div>
                  <div className="breakdown">
                    {base}
                    {extra > 0 ? ` +${extra}` : ''}
                  </div>
                  <div className="stepper">
                    <button
                      disabled={base <= 3}
                      onClick={() =>
                        patch({ baseScores: { ...build.baseScores, [ability]: base - 1 } })
                      }
                      aria-label={`Decrease base ${ABILITY_NAMES[ability]}`}
                    >
                      −
                    </button>
                    <button
                      disabled={base >= 20}
                      onClick={() =>
                        patch({ baseScores: { ...build.baseScores, [ability]: base + 1 } })
                      }
                      aria-label={`Increase base ${ABILITY_NAMES[ability]}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className={`budget ${spent > POINT_BUY_BUDGET ? 'over' : ''}`}>
            <span>
              Point buy: {spent} / {POINT_BUY_BUDGET}
              {ABILITIES.some(
                (a) => build.baseScores[a] < POINT_BUY_MIN || build.baseScores[a] > POINT_BUY_MAX,
              ) && ' (some scores are outside the 8-15 range)'}
            </span>
            <span className="btn-row">
              <button
                className="btn btn-sm"
                onClick={() => patch({ baseScores: optimalPointBuy(ctx.abilityPriority) })}
              >
                Optimise point buy
              </button>
              <button
                className="btn btn-sm"
                onClick={() => patch({ baseScores: assignStandardArray(ctx.abilityPriority) })}
              >
                Standard array
              </button>
            </span>
          </div>

          <p className="muted" style={{ marginTop: 10 }}>
            {build.ruleset === '2024' ? 'Your background grants' : 'Lineage grants'}{' '}
            {ABILITIES.filter((a) => racial[a]).length
              ? ABILITIES.filter((a) => racial[a])
                  .map((a) => `+${racial[a]} ${ABILITY_NAMES[a]}`)
                  .join(', ')
              : 'no ability increases'}
            {build.ruleset === '2024' && ' — a 2024 species grants none'}.
          </p>
        </Panel>
        )}

        {section === 'equipment' && (
          <>
        {/* First in the section, because "what do I start with" comes before
            "what am I holding" for anyone who has not answered it yet. It
            hides itself above 1st level. */}
        <StartingEquipmentPanel build={build} patch={patch} />

        <Panel
          title="Equipment"
          subtitle="What you are holding. The attack style and loadout every combat feat is rated against are worked out from this, rather than asserted."
        >
          <WeaponPickers build={build} ctx={ctx} patch={patch} />
          <label className="field" style={{ marginBottom: 0 }}>
            <span>Notes</span>
            <textarea
              rows={3}
              placeholder="Table rules, magic items, anything the optimizer cannot see…"
              value={build.notes}
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </label>
        </Panel>

        <DefensesPanel build={build} ctx={ctx} patch={patch} />

        <ItemsPanel build={build} ctx={ctx} patch={patch} />

        <InventoryPanel build={build} ctx={ctx} patch={patch} />
          </>
        )}

        {section === 'options' && (
          <>
        <ProficienciesPanel build={build} ctx={ctx} patch={patch} />

        <ToolsPanel build={build} ctx={ctx} patch={patch} />

        <ClassOptionsPanel build={build} ctx={ctx} patch={patch} />

        <CountersPanel build={build} patch={patch} />

        <SpellsPanel build={build} ctx={ctx} patch={patch} />
          </>
        )}

        {section === 'feats' && (
        <Panel
          title="Feats and ability score improvements"
          subtitle={`Level ${ctx.totalLevel} unlocks ${ctx.asiSlotsReached} ability score improvement ${ctx.asiSlotsReached === 1 ? 'slot' : 'slots'}, ${ctx.asiSlotsSpent} assigned${ctx.originFeatSlots ? `, plus ${ctx.originFeatSlots} free origin ${ctx.originFeatSlots === 1 ? 'feat' : 'feats'}` : ''}.`}
        >
          {ctx.originFeatSlots > 0 && (
            <>
              <p className="muted" style={{ marginBottom: 8 }}>
                Origin {ctx.originFeatSlots === 1 ? 'feat' : 'feats'} — granted free, and never
                counted against an ability score improvement.
              </p>
              <div className="row" style={{ marginBottom: 14 }}>
                {Array.from({ length: ctx.originFeatSlots }).map((_, index) => (
                  <Select
                    key={index}
                    label={`Origin feat ${ctx.originFeatSlots > 1 ? index + 1 : ''}`.trim()}
                    value={build.originFeatIds[index] ?? ''}
                    onChange={(featId) => {
                      const next = [...build.originFeatIds];
                      if (featId) next[index] = featId;
                      else next.splice(index, 1);
                      patch({ originFeatIds: next.filter(Boolean) });
                    }}
                    options={[
                      { value: '', label: '— choose —' },
                      ...originFeatOptions.map((f) => ({ value: f.id, label: f.name })),
                    ]}
                  />
                ))}
              </div>
            </>
          )}

          {build.featIds.length === 0 && build.asiPicks.length === 0 && (
            <p className="muted">Nothing spent yet.</p>
          )}

          <div className="chips">
            {build.featIds.map((featId) => {
              const feat = featById(featId, build.ruleset);
              if (!feat) return null;
              return (
                <span className="chip" key={featId}>
                  {feat.name}
                  {feat.asi && (
                    <select
                      value={build.featAsiChoices[featId] ?? feat.asi.abilities[0]}
                      onChange={(e) => featAsiPick(featId, e.target.value as Ability)}
                      style={{ width: 'auto', padding: '1px 4px', fontSize: 12 }}
                      aria-label={`${feat.name} ability increase`}
                    >
                      {feat.asi.abilities.map((a) => (
                        <option key={a} value={a}>
                          +1 {a.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={() =>
                      patch({ featIds: build.featIds.filter((id) => id !== featId) })
                    }
                    aria-label={`Remove ${feat.name}`}
                  >
                    ×
                  </button>
                </span>
              );
            })}
            {build.asiPicks.map((pick, index) => (
              <span className="chip" key={`asi-${index}`}>
                {pick[0] === pick[1]
                  ? `+2 ${ABILITY_NAMES[pick[0]]}`
                  : pick.map((a) => `+1 ${ABILITY_NAMES[a]}`).join(' / ')}
                <button
                  onClick={() => patch({ asiPicks: build.asiPicks.filter((_, i) => i !== index) })}
                  aria-label="Remove ability score improvement"
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          <NextPicks ctx={ctx} build={build} onChange={onChange} />
        </Panel>
        )}
      </div>

      <div className="stack">
        <GlancePanel ctx={ctx} />

        {section === 'equipment' && (
          <>
        <AttacksPanel ctx={ctx} />

        <DamagePanel build={build} ctx={ctx} patch={patch} />

        <HealingPanel ctx={ctx} />

          </>
        )}

        {section === 'identity' && (
          <>
        <Panel title={build.ruleset === '2024' ? 'Species fit' : 'Lineage fit'}>
          {(() => {
            const cell = cellFor(ctx.race.id, ctx.primary.klass.id, build.ruleset);
            if (!cell) return null;
            return (
              <>
                <p style={{ margin: '0 0 8px' }}>
                  <strong>
                    {ctx.race.name} {ctx.primary.klass.name}
                  </strong>{' '}
                  <RatingTag rating={cell.rating} />
                </p>
                {cell.note && <p className="note">{cell.note}</p>}
                <ul className="reasons">
                  {cell.reasons.map((reason, i) => (
                    <li key={i}>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </>
            );
          })()}
        </Panel>

        <Panel title={build.ruleset === '2024' ? 'Species traits' : 'Lineage traits'}>
          <dl className="detail-list">
            {ctx.race.traits.map((trait) => (
              <div key={trait.name}>
                <dt>{trait.name}</dt>
                <dd>{trait.text}</dd>
              </div>
            ))}
          </dl>
          <p className="muted" style={{ marginTop: 12 }}>
            {ctx.race.size} · {ctx.race.speed} ft. speed · {ctx.race.source}
          </p>
        </Panel>
          </>
        )}

        {section === 'options' && <ClassFeaturesPanel ctx={ctx} />}

        {/* The review is the one readout that belongs to every section: a
            choice made here is often flagged by something over there. */}
        <Panel
          title="Build review"
          subtitle="Mistakes, not unfinished business — what a knowledgeable player would flag reading this sheet."
        >
          {problems.length === 0 && (
            <p className="muted">
              {stillOpen > 0
                ? 'Nothing wrong with what is here.'
                : 'Nothing to flag.'}
            </p>
          )}
          {problems.map((finding, i) => (
            <div key={i} className={`finding ${finding.severity}`}>
              <h3>{finding.title}</h3>
              <p>{finding.detail}</p>
              {finding.fix && <p className="fix">{finding.fix}</p>}
            </div>
          ))}
          {stillOpen > 0 && (
            <p className="muted" style={{ marginTop: problems.length ? 12 : 0 }}>
              {stillOpen} {stillOpen === 1 ? 'choice is' : 'choices are'} still unmade. The numbers
              on the sections above say where.
            </p>
          )}
        </Panel>
      </div>
    </div>
    </>
  );
}

function FlexibleAsiPickers({
  build,
  ctx,
  onChange,
}: {
  build: Build;
  ctx: BuildContext;
  onChange: (partial: Partial<Build>) => void;
}) {
  const amounts = build.customOrigin ? [2, 1] : (ctx.race.flexibleAsi?.amounts ?? []);
  const exclude = build.customOrigin ? [] : (ctx.race.flexibleAsi?.exclude ?? []);
  if (!amounts.length) return null;

  const setPick = (index: number, ability: Ability) => {
    const picks = [...build.flexibleAsiPicks];
    picks[index] = ability;
    onChange({ flexibleAsiPicks: picks });
  };

  const available = ABILITIES.filter((a) => !exclude.includes(a));

  return (
    <div className="row">
      {amounts.map((amount, index) => (
        <Select
          key={index}
          label={`+${amount} to`}
          value={build.flexibleAsiPicks[index] ?? ''}
          onChange={(ability) => setPick(index, ability as Ability)}
          options={[
            { value: '', label: '— choose —' },
            ...available.map((a) => ({ value: a, label: ABILITY_NAMES[a] })),
          ]}
        />
      ))}
    </div>
  );
}

/** An itemised AC or HP calculation, so the total is never just asserted. */
/**
 * The running total, and where each number came from.
 *
 * Armor class and hit points used to have panels of their own, one section
 * away from the strip that showed the same two figures - so the number and its
 * arithmetic were never on screen together, and two of the nine right-hand
 * panels existed only to explain two of the eight figures above them. Clicking
 * a figure opens its own breakdown under the strip instead.
 *
 * One at a time, deliberately: the value of this panel is that it stays short
 * enough to sit above everything else on every section.
 */
function GlancePanel({ ctx }: { ctx: BuildContext }) {
  const [open, setOpen] = useState<string | null>(null);
  const { build } = ctx;
  const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

  const speed = ctx.speed.total;
  const hpMode =
    build.defenses.hpMode === 'average'
      ? 'Fixed average per level, the default in most games.'
      : build.defenses.hpMode === 'rolled'
        ? 'One die per level, rolled at level-up. Any level not yet rolled counts as the average.'
        : build.defenses.hpMode === 'max'
          ? 'Maximum per level.'
        : 'Your own rolled total.';

  const stats: {
    id: string;
    label: string;
    value: string;
    /** Absent for a figure with nothing to explain. */
    detail?: ReactNode;
    /** A rules problem with this number, which must not hide behind a click. */
    flagged?: boolean;
  }[] = [
    { id: 'level', label: 'Level', value: String(ctx.totalLevel) },
    {
      id: 'prof',
      label: 'Prof',
      value: signed(ctx.proficiency),
      detail: (
        <p className="muted" style={{ margin: 0 }}>
          +2 at 1st level and one more at 5th, 9th, 13th and 17th. It follows your character level,
          so a multiclass build never falls behind on it.
        </p>
      ),
    },
    {
      id: 'hp',
      label: 'Hit points',
      value: String(ctx.hp.total),
      detail: (
        <>
          <p className="muted" style={{ marginTop: 0 }}>{hpMode}</p>
          <Breakdown lines={ctx.hp.lines} total={ctx.hp.total} />
          {build.defenses.hpMode !== 'average' && ctx.hp.total !== ctx.hp.averageTotal && (
            <p className="muted" style={{ marginTop: 10 }}>
              The fixed-average total would be {ctx.hp.averageTotal}.
            </p>
          )}
          {ctx.hp.notes.map((note, i) => (
            <p className="note" key={i} style={{ marginTop: 10, marginBottom: 0 }}>
              {note}
            </p>
          ))}
        </>
      ),
    },
    {
      id: 'ac',
      label: 'Armor class',
      value: String(ctx.ac.total),
      flagged: ctx.ac.problems.length > 0,
      detail: (
        <>
          <p className="muted" style={{ marginTop: 0 }}>{ctx.ac.source}</p>
          <Breakdown lines={ctx.ac.lines} total={ctx.ac.total} />
          {ctx.ac.problems.map((problem, i) => (
            <div className="callout error" key={i} style={{ marginTop: 10 }}>
              {problem}
            </div>
          ))}
          {ctx.ac.notes.map((note, i) => (
            <p className="note" key={i} style={{ marginTop: 10, marginBottom: 0 }}>
              {note}
            </p>
          ))}
          {ctx.ac.stealthDisadvantage && (
            <p className="note" style={{ marginTop: 10, marginBottom: 0 }}>
              This armor imposes disadvantage on Stealth checks.
            </p>
          )}
        </>
      ),
    },
  ];

  // Both spell numbers are the same three parts, and neither was explained
  // anywhere before this - they arrived as bare figures on the strip.
  const casting = ctx.spellcasting;
  if (ctx.spellSaveDc !== null && casting.ability) {
    const ability = casting.ability;
    stats.push({
      id: 'dc',
      label: 'Spell DC',
      value: String(ctx.spellSaveDc),
      detail: (
        <Breakdown
          lines={[
            { label: 'Base', value: 8 },
            { label: 'Proficiency bonus', value: ctx.proficiency },
            { label: `${ABILITY_NAMES[ability]} modifier`, value: ctx.mods[ability] },
            ...(ctx.itemEffects.spellBonus
              ? [{ label: 'Magic focus', value: ctx.itemEffects.spellBonus }]
              : []),
          ]}
          total={ctx.spellSaveDc}
        />
      ),
    });
  }
  if (ctx.spellAttack !== null && casting.ability) {
    const ability = casting.ability;
    stats.push({
      id: 'spell-atk',
      label: 'Spell atk',
      value: signed(ctx.spellAttack),
      detail: (
        <Breakdown
          lines={[
            { label: 'Proficiency bonus', value: ctx.proficiency },
            { label: `${ABILITY_NAMES[ability]} modifier`, value: ctx.mods[ability] },
            ...(ctx.itemEffects.spellBonus
              ? [{ label: 'Magic focus', value: ctx.itemEffects.spellBonus }]
              : []),
          ]}
          total={ctx.spellAttack}
        />
      ),
    });
  }

  stats.push(
    {
      id: 'speed',
      label: 'Speed',
      value: String(speed),
      // A speed that is just your species' is not worth a breakdown.
      detail:
        ctx.speed.lines.length > 1 ? (
          <Breakdown lines={ctx.speed.lines} total={speed} />
        ) : undefined,
    },
    {
      id: 'initiative',
      label: 'Initiative',
      value: signed(ctx.mods.dex),
    },
  );

  const showing = stats.find((stat) => stat.id === open && stat.detail);

  return (
    <Panel title="At a glance" subtitle="Tap a figure to see where it comes from.">
      <div className="statline">
        {stats.map((stat) =>
          stat.detail ? (
            <button
              key={stat.id}
              className={`stat ${open === stat.id ? 'is-open' : ''} ${stat.flagged ? 'is-flagged' : ''}`}
              aria-expanded={open === stat.id}
              onClick={() => setOpen(open === stat.id ? null : stat.id)}
            >
              <div className="k">{stat.label}</div>
              <div className="v">{stat.value}</div>
            </button>
          ) : (
            <div className="stat" key={stat.id}>
              <div className="k">{stat.label}</div>
              <div className="v">{stat.value}</div>
            </div>
          ),
        )}
      </div>

      {showing && (
        <div className="glance-detail">
          <div className="field-label">{showing.label}</div>
          {showing.detail}
        </div>
      )}
    </Panel>
  );
}

function Breakdown({ lines, total }: { lines: Line[]; total: number }) {
  return (
    <ul className="reasons">
      {lines.map((line, i) => (
        <li key={i}>
          <span className={`delta ${line.value >= 0 ? 'pos' : 'neg'}`}>
            {line.value >= 0 ? '+' : ''}
            {line.value}
          </span>
          <span>{line.label}</span>
        </li>
      ))}
      <li style={{ borderTop: '1px solid var(--border)', fontWeight: 600 }}>
        <span className="delta">{total}</span>
        <span>Total</span>
      </li>
    </ul>
  );
}

function DefensesPanel({
  build,
  ctx,
  patch,
}: {
  build: Build;
  ctx: BuildContext;
  patch: (partial: Partial<Build>) => void;
}) {
  const defenses = build.defenses;
  const setDefenses = (partial: Partial<Build['defenses']>) =>
    patch({ defenses: { ...defenses, ...partial } });

  const proficiencies = armorProficiencies(ctx.slices, ctx.race, ctx.featIds);

  // Show what each option would actually give, and mark the ones this
  // character is not trained in rather than hiding them.
  const armorOptions = ARMOR.map((armor) => {
    const dex =
      armor.dexCap === null
        ? ctx.mods.dex
        : Math.min(ctx.mods.dex, armor.category === 'medium' && ctx.featIds.has('medium-armor-master') ? 3 : armor.dexCap);
    const ac = armor.category === 'none' ? null : armor.baseAc + dex;
    const proficient = armor.category === 'none' || proficiencies.has(armor.category);
    return {
      value: armor.id,
      label: `${armor.name}${ac !== null ? ` — AC ${ac}` : ''}${proficient ? '' : ' (not proficient)'}`,
      group: ARMOR_CATEGORY_LABEL[armor.category],
    };
  });

  const bonusOptions = [0, 1, 2, 3].map((n) => ({ value: String(n), label: n ? `+${n}` : 'None' }));

  return (
    <Panel
      title="Defenses"
      subtitle="Armor class and hit points are calculated from what you are actually wearing. The breakdowns are in the right-hand column."
    >
      <Select
        label="Armor"
        value={defenses.armorId}
        onChange={(armorId) => setDefenses({ armorId })}
        options={armorOptions}
      />

      <label className="checkbox">
        <input
          type="checkbox"
          checked={defenses.shield}
          onChange={(e) => setDefenses({ shield: e.target.checked })}
        />
        <span>
          Shield (+2 AC)
          {!proficiencies.has('shield') && ' — this character is not proficient with shields'}
        </span>
      </label>

      <div className="row">
        <Select
          label="Magic armor"
          value={String(defenses.armorMagicBonus)}
          onChange={(v) => setDefenses({ armorMagicBonus: Number(v) })}
          options={bonusOptions}
        />
        <Select
          label="Magic shield"
          value={String(defenses.shieldMagicBonus)}
          onChange={(v) => setDefenses({ shieldMagicBonus: Number(v) })}
          options={bonusOptions}
        />
        <label className="field">
          <span>Other AC</span>
          <input
            type="number"
            value={defenses.miscAcBonus}
            onChange={(e) => setDefenses({ miscAcBonus: Number(e.target.value) || 0 })}
          />
        </label>
      </div>
      <p className="muted" style={{ marginTop: -4, marginBottom: 14 }}>
        "Other AC" covers a Ring or Cloak of Protection, cover, or anything else flat.
      </p>

      <div className="row">
        <Select
          label="Hit points per level"
          value={defenses.hpMode}
          onChange={(hpMode) => setDefenses({ hpMode: hpMode as Build['defenses']['hpMode'] })}
          options={[
            { value: 'average', label: 'Fixed average (default)' },
            { value: 'max', label: 'Maximum (house rule)' },
            { value: 'rolled', label: 'Rolled, one die per level' },
            { value: 'manual', label: 'I rolled — enter my total' },
          ]}
        />
        {defenses.hpMode === 'manual' && (
          <label className="field">
            <span>Hit dice total</span>
            <input
              type="number"
              value={defenses.manualHitDiceTotal ?? ctx.hp.averageTotal}
              onChange={(e) => setDefenses({ manualHitDiceTotal: Number(e.target.value) || 0 })}
            />
          </label>
        )}
        <label className="field">
          <span>Other HP</span>
          <input
            type="number"
            value={defenses.miscHpBonus}
            onChange={(e) => setDefenses({ miscHpBonus: Number(e.target.value) || 0 })}
          />
        </label>
      </div>
    </Panel>
  );
}

/**
 * 2024 backgrounds offer three abilities; you take +2/+1 across two of them, or
 * +1 to all three.
 */
function BackgroundAsiPickers({
  build,
  background,
  onChange,
}: {
  build: Build;
  background: { abilities?: Ability[]; name: string };
  onChange: (partial: Partial<Build>) => void;
}) {
  const abilities = background.abilities ?? [];
  const { mode, picks } = build.backgroundAsi;

  const setPick = (index: number, ability: Ability) => {
    const next = [...picks];
    next[index] = ability;
    // The +2 and the +1 must land on different abilities.
    if (next[0] && next[1] && next[0] === next[1]) {
      next[index === 0 ? 1 : 0] = abilities.find((a) => a !== ability) ?? next[index === 0 ? 1 : 0];
    }
    onChange({ backgroundAsi: { mode, picks: next } });
  };

  return (
    <>
      <div className="field" role="group" aria-label={`Ability increases from ${background.name}`}>
        <span className="field-label">Ability increases from {background.name}</span>
        <div className="btn-row">
          <button
            className={`btn btn-sm ${mode === '2+1' ? 'btn-primary' : ''}`}
            aria-pressed={mode === '2+1'}
            onClick={() => onChange({ backgroundAsi: { mode: '2+1', picks } })}
          >
            +2 and +1
          </button>
          <button
            className={`btn btn-sm ${mode === '1+1+1' ? 'btn-primary' : ''}`}
            aria-pressed={mode === '1+1+1'}
            onClick={() => onChange({ backgroundAsi: { mode: '1+1+1', picks: [] } })}
          >
            +1 to all three
          </button>
        </div>
      </div>

      {mode === '2+1' ? (
        <div className="row">
          {[2, 1].map((amount, index) => (
            <Select
              key={index}
              label={`+${amount} to`}
              value={picks[index] ?? ''}
              onChange={(ability) => setPick(index, ability as Ability)}
              options={[
                { value: '', label: '— choose —' },
                ...abilities.map((a) => ({ value: a, label: ABILITY_NAMES[a] })),
              ]}
            />
          ))}
        </div>
      ) : (
        <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
          +1 to {abilities.map((a) => ABILITY_NAMES[a]).join(', ')}.
        </p>
      )}
    </>
  );
}

/**
 * Skills, expertise and the two passive scores. Grouped by governing ability,
 * because that is how you read a character sheet and because it makes the
 * dumped-stat skills obvious at a glance.
 */
function ProficienciesPanel({
  build,
  ctx,
  patch,
}: {
  build: Build;
  ctx: BuildContext;
  patch: (partial: Partial<Build>) => void;
}) {
  const p = ctx.proficiencies;
  const legal = legalPicks({ build, race: ctx.race, slices: ctx.slices, featIds: ctx.featIds });

  const ranked = new Map(recommendSkills(ctx).map((s, i) => [s.skill, { rank: i, ...s }]));

  const togglePick = (skill: SkillId) => {
    const picked = build.skillIds.includes(skill);
    patch({
      skillIds: picked
        ? build.skillIds.filter((s) => s !== skill)
        : [...build.skillIds, skill],
      // Dropping a proficiency drops any expertise resting on it.
      expertiseIds: picked ? build.expertiseIds.filter((s) => s !== skill) : build.expertiseIds,
    });
  };

  const toggleExpertise = (skill: SkillId) =>
    patch({
      expertiseIds: build.expertiseIds.includes(skill)
        ? build.expertiseIds.filter((s) => s !== skill)
        : [...build.expertiseIds, skill],
    });

  const fill = () => patch({ skillIds: [...build.skillIds, ...fillSkillPicks(ctx, legal)] });

  const subtitle = [
    p.openSkillPicks
      ? `${p.openSkillPicks} skill ${p.openSkillPicks === 1 ? 'pick' : 'picks'} still open`
      : `${p.skillPicks} ${p.skillPicks === 1 ? 'pick' : 'picks'}, all assigned`,
    p.expertisePicks
      ? `${p.expertisePicks - p.openExpertisePicks}/${p.expertisePicks} expertise assigned`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Panel title="Proficiencies" subtitle={subtitle}>
      <div className="statline" style={{ marginBottom: 14 }}>
        <div>
          <div className="k">Passive Perception</div>
          <div className="v">{p.passivePerception}</div>
        </div>
        <div>
          <div className="k">Passive Investigation</div>
          <div className="v">{p.passiveInvestigation}</div>
        </div>
      </div>

      {p.openSkillPicks > 0 && (
        <button className="btn btn-primary btn-sm" style={{ marginBottom: 14 }} onClick={fill}>
          Fill {p.openSkillPicks} open {p.openSkillPicks === 1 ? 'pick' : 'picks'} with
          recommendations
        </button>
      )}

      {ABILITIES.map((ability) => {
        const lines = p.skills.filter((line) => line.ability === ability);
        // Nothing keys off Constitution, so it gets no heading.
        if (lines.length === 0) return null;
        return (
          <div key={ability} style={{ marginBottom: 12 }}>
            <div className="field-label" style={{ marginBottom: 4 }}>
              {ABILITY_NAMES[ability]}
            </div>
            {lines.map((line) => {
              const pickable = legal.has(line.skill);
              const isPick = build.skillIds.includes(line.skill);
              const canExpertise = line.proficient && (p.expertisePicks > 0 || line.expertise);
              const suggestion = ranked.get(line.skill);
              const recommended =
                !line.proficient && pickable && p.openSkillPicks > 0 && (suggestion?.rank ?? 99) < 4;

              return (
                <div className="skill-row" key={line.skill}>
                  <label className="skill-name">
                    <input
                      type="checkbox"
                      checked={isPick}
                      disabled={!pickable || (line.proficient && !isPick)}
                      onChange={() => togglePick(line.skill)}
                      aria-label={`${line.name} proficiency`}
                    />
                    <span className={line.proficient ? 'is-proficient' : ''}>{line.name}</span>
                    {line.expertise && <span className="tag">expertise</span>}
                    {line.halfProficiency && <span className="tag">half</span>}
                    {recommended && <span className="tag rec">recommended</span>}
                  </label>
                  <span className="skill-mod">
                    {line.modifier >= 0 ? '+' : ''}
                    {line.modifier}
                  </span>
                  {canExpertise && (
                    <button
                      className={`btn btn-sm ${line.expertise ? 'btn-primary' : ''}`}
                      onClick={() => toggleExpertise(line.skill)}
                      aria-pressed={line.expertise}
                      aria-label={`${line.name} expertise`}
                    >
                      2×
                    </button>
                  )}
                  {line.sources.length > 0 && !isPick && (
                    <span className="src">{line.sources.join(', ')}</span>
                  )}
                  {recommended && suggestion && <span className="src">{suggestion.headline}</span>}
                </div>
              );
            })}
          </div>
        );
      })}

      {p.notes.map((note, i) => (
        <p className="note" key={i}>
          {note}
        </p>
      ))}

      {p.tools.length > 0 && (
        <p className="muted" style={{ marginTop: 10 }}>
          <strong>Tools:</strong> {p.tools.join(', ')}
        </p>
      )}
      {p.languages.open > 0 && (
        <p className="muted">
          {p.languages.open} extra {p.languages.open === 1 ? 'language' : 'languages'} to choose.
          Languages are tracked here but not scored — which ones matter is a question for your DM.
        </p>
      )}
    </Panel>
  );
}

/**
 * The choices a class feature hands you: a Fighting Style, a Pact Boon,
 * invocations, metamagic, maneuvers. Only kinds this character actually has
 * slots in appear, so a Wizard is never shown an empty invocation list.
 */
function ClassOptionsPanel({
  build,
  ctx,
  patch,
}: {
  build: Build;
  ctx: BuildContext;
  patch: (partial: Partial<Build>) => void;
}) {
  const groups = optionGroups(ctx);
  // Each group remembers whether it has been opened out. Hooks cannot live
  // behind the early return below, so this is declared before it.
  const [expanded, setExpanded] = useState<string[]>([]);
  if (!groups.length) return null;

  const toggle = (id: string, kind: string) => {
    if (kind === 'pact-boon') {
      // Exactly one, and changing it can invalidate invocations that needed
      // the old one - so report what it dropped rather than silently pruning.
      const next = { ...build, pactBoon: build.pactBoon === id ? undefined : id };
      const reconciled = reconcileClassOptions(next, deriveBuild(next));
      patch({ pactBoon: reconciled.build.pactBoon, classOptionIds: reconciled.build.classOptionIds });
      return;
    }
    patch({
      classOptionIds: build.classOptionIds.includes(id)
        ? build.classOptionIds.filter((o) => o !== id)
        : [...build.classOptionIds, id],
    });
  };

  const subtitle = groups
    .map((g) => `${g.label}: ${g.slots - g.open}/${g.slots}`)
    .join(' · ');

  return (
    <Panel title="Class options" subtitle={subtitle}>
      {groups.map((group) => {
        const taken = group.suggestions.filter((s) => s.taken);
        const available = group.suggestions.filter((s) => !s.taken && s.eligible);
        const isExpanded = expanded.includes(group.kind);
        /*
          Three, not eight. A Battle Master choosing a fighting style and three
          maneuvers was shown sixteen ranked cards for two decisions, which is
          most of a screen of things you are not going to take. The list is
          ranked, so the fourth-best is rarely the answer - and when it is, the
          whole list is one click away.

          What you have already taken is never truncated: an option you cannot
          see is an option you cannot remove.
        */
        const shown = group.open > 0 ? (isExpanded ? available : available.slice(0, 3)) : [];
        const hidden = available.length - shown.length;

        return (
          <div key={group.kind} style={{ marginBottom: 18 }}>
            <div className="field-label" style={{ marginBottom: 6 }}>
              {group.label} — {group.open > 0 ? `${group.open} to choose` : 'all chosen'}
            </div>

            {[...taken, ...shown].map((suggestion, index) => (
              <OptionCard
                key={suggestion.id}
                suggestion={suggestion}
                rank={index + 1}
                onToggle={() => toggle(suggestion.id, group.kind)}
              />
            ))}

            {group.open > 0 && hidden > 0 && (
              <button
                className="btn btn-sm"
                onClick={() => setExpanded([...expanded, group.kind])}
              >
                {/* The label carries its own case: "maneuvers" is a common
                    noun, "Eldritch Invocations" is not. */}
                Show {hidden} more {group.label}
              </button>
            )}
            {group.open > 0 && isExpanded && available.length > 3 && (
              <button
                className="btn btn-sm"
                onClick={() => setExpanded(expanded.filter((k) => k !== group.kind))}
              >
                Show fewer
              </button>
            )}
            {group.open > 0 && available.length > 3 && (
              <p className="muted" style={{ marginTop: 6 }}>
                Ranked against this build, so the order changes with your combat profile and pact.
              </p>
            )}
          </div>
        );
      })}
    </Panel>
  );
}

function OptionCard({
  suggestion,
  rank,
  onToggle,
}: {
  suggestion: OptionSuggestion;
  rank: number;
  onToggle: () => void;
}) {
  return (
    <details
      className={`suggestion ${suggestion.taken ? 'is-top' : ''} ${!suggestion.eligible ? 'is-blocked' : ''}`}
    >
      <summary>
        <span className="rank">{suggestion.taken ? '✓' : rank}</span>
        <span className="title">
          <strong>{suggestion.option.name}</strong>
          <span className="src">{suggestion.option.source}</span>
        </span>
        <FitBar score={suggestion.score} />
      </summary>
      <div className="body">
        <p>{suggestion.option.summary}</p>
        {!suggestion.eligible && (
          <div className="callout error" style={{ marginBottom: 10 }}>
            {suggestion.blockedBy.join('; ')}
          </div>
        )}
        <ReasonList reasons={suggestion.reasons} />
        {suggestion.eligible && (
          <button className="btn btn-sm" style={{ marginTop: 12 }} onClick={onToggle}>
            {suggestion.taken ? `Remove ${suggestion.option.name}` : `Take ${suggestion.option.name}`}
          </button>
        )}
      </div>
    </details>
  );
}

/**
 * Slots, what is recorded, and ranked picks for what is not.
 *
 * The levels are tabs rather than one long list: a Wizard 9 can draw from over
 * a hundred spells, and a single scrolling column of them is not a choice, it
 * is a wall.
 */
function SpellsPanel({
  build,
  ctx,
  patch,
}: {
  build: Build;
  ctx: BuildContext;
  patch: (partial: Partial<Build>) => void;
}) {
  const casting = ctx.spellcasting;
  const groups = spellGroups(ctx);
  const [level, setLevel] = useState(0);
  const [query, setQuery] = useState('');
  // A character who does not cast still needs this panel if they are carrying a
  // spell from a class they used to have - otherwise it is stranded on the
  // build with nothing on screen able to remove it.
  const hasNothingToShow = !casting.casts || !groups.length;
  if (hasNothingToShow && !casting.illegal.length) return null;

  const active = groups.find((g) => g.level === level) ?? groups[0];
  const search = query.trim().toLowerCase();

  /*
    Which class taught a spell only matters to a multiclass caster with two
    casting abilities, and for them it decides the DC it is cast at. Where only
    one of their classes could have taught it there is nothing to ask, so it is
    recorded silently; where two could, the pick defaults to the better of them
    and the card offers the choice.
  */
  const teachersOf = (id: string) => {
    const spell = SPELLS_BY_ID[id];
    return spell ? casting.sources.filter((s) => spell.classes.includes(s.classId)) : [];
  };
  /*
    The default has to be the class that casts it best, because that is what
    `sourceForSpell` falls back to. Anything else and the card would say one
    thing while the sheet printed another.
  */
  const bestTeacher = (id: string) =>
    teachersOf(id).reduce<CastingSource | undefined>(
      (found, s) => (!found || s.saveDc > found.saveDc ? s : found),
      undefined,
    );

  const toggle = (id: string) => {
    const dropping = build.spellIds.includes(id);
    const sources = { ...(build.spellSources ?? {}) };
    if (dropping) delete sources[id];
    else {
      const best = bestTeacher(id);
      if (best) sources[id] = best.classId;
    }
    patch({
      spellIds: dropping ? build.spellIds.filter((s) => s !== id) : [...build.spellIds, id],
      spellSources: Object.keys(sources).length ? sources : undefined,
    });
  };

  const setSource = (id: string, classId: ClassId) =>
    patch({ spellSources: { ...(build.spellSources ?? {}), [id]: classId } });

  const togglePrepared = (id: string) =>
    patch({
      preparedIds: build.preparedIds.includes(id)
        ? build.preparedIds.filter((s) => s !== id)
        : [...build.preparedIds, id],
    });

  const knownLabel =
    casting.spellsKnown !== null
      ? `${casting.spellsKnown - casting.openSpells}/${casting.spellsKnown} known`
      : casting.preparesFromBook
        ? `${build.spellIds.filter((id) => (casting.chosen.find((c) => c.id === id)?.level ?? 0) > 0).length} in the book, ${casting.prepared.length}/${casting.spellsPrepared} prepared`
        : casting.spellsPrepared !== null
          ? `${casting.spellsPrepared - casting.openSpells}/${casting.spellsPrepared} prepared`
          : null;

  const subtitle = [
    `${casting.cantripsKnown - casting.openCantrips}/${casting.cantripsKnown} cantrips`,
    knownLabel,
    casting.saveDc !== null ? `save DC ${casting.saveDc}` : null,
    casting.attackBonus !== null ? `spell attack +${casting.attackBonus}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // A search crosses every level - looking for Counterspell should not require
  // knowing it is 3rd level - and shows every match, since you asked for it by
  // name. Browsing stays capped, because a Wizard can draw from nearly 200.
  const pool = search
    ? groups.flatMap((g) => g.suggestions).filter((s) => matchesSpell(s, search))
    : (active?.suggestions ?? []);

  const taken = pool.filter((s) => s.taken);
  // Granted spells are yours already, so they belong beside the ones you took
  // rather than in the ranked list of things to consider.
  const granted = pool.filter((s) => s.granted && !s.taken);
  const offered = pool.filter((s) => !s.taken && !s.granted);
  const SHOWN = 10;
  const shown = search ? offered : offered.slice(0, SHOWN);

  const openPicks = casting.openCantrips + casting.openSpells;
  const topPicks = openPicks > 0 ? recommendSpells(ctx, 4) : [];

  return (
    <Panel title="Spells" subtitle={hasNothingToShow ? 'This character no longer casts.' : subtitle}>
      {!hasNothingToShow && (
      <div className="slot-row">
        {casting.bySpellLevel.map((count, index) =>
          count > 0 ? (
            <div className="slot-cell" key={index}>
              <div className="k">{index + 1}</div>
              <div className="v">{count}</div>
            </div>
          ) : null,
        )}
        {casting.pact && (
          <div className="slot-cell is-pact" key="pact">
            <div className="k">Pact {casting.pact.level}</div>
            <div className="v">{casting.pact.count}</div>
          </div>
        )}
        {!casting.bySpellLevel.some((c) => c > 0) && !casting.pact && (
          <p className="muted" style={{ margin: 0 }}>
            No spell slots yet — cantrips only.
          </p>
        )}
      </div>
      )}

      {/*
        A spell that is off every list this character can draw from has no card
        anywhere else, because the tabs are built from what you *can* cast. It
        gets one here, or it would be stranded on the build with no way out.
      */}
      {/*
        A book caster is the one case where what you have recorded and what you
        can cast today are different lists. A Sorcerer knows eight spells and
        can cast all eight; a Wizard copies far more than that into a book and
        decides each morning which of it is live. So the book is the rows and
        the ticks are the morning.
      */}
      {casting.preparesFromBook && casting.chosen.some((s) => s.level > 0) && (
        <div style={{ marginTop: 14 }}>
          <div className="field-label" style={{ marginBottom: 6 }}>
            Prepared today — {casting.prepared.length}/{casting.spellsPrepared} from your spellbook
          </div>
          {[...casting.chosen]
            .filter((spell) => spell.level > 0)
            .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
            .map((spell) => (
              <label className="prepared-row" key={spell.id}>
                <input
                  type="checkbox"
                  checked={build.preparedIds.includes(spell.id)}
                  onChange={() => togglePrepared(spell.id)}
                />
                <span className="name">{spell.name}</span>
                <span className="src">{describeSpell(spell)}</span>
              </label>
            ))}
          <p className="muted" style={{ marginTop: 6 }}>
            Cantrips are always ready and are not prepared. Changing what is prepared takes a long
            rest plus a minute per spell level.
          </p>
        </div>
      )}

      {casting.illegal.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="field-label" style={{ marginBottom: 6 }}>
            Not on any list you can draw from
          </div>
          {casting.illegal.map((spell) => (
            <div className="suggestion is-blocked" key={spell.id}>
              <div className="body" style={{ display: 'block', padding: '10px 14px' }}>
                <strong>{spell.name}</strong> <span className="src">{describeSpell(spell)}</span>
                <button className="btn btn-sm" style={{ marginLeft: 10 }} onClick={() => toggle(spell.id)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/*
        Which level to look at is itself a question when you have eight picks
        open, so the best few across every level you can reach come first.
      */}
      {openPicks > 0 && !search && topPicks.length > 0 && (
        <p className="note" style={{ marginTop: 12 }}>
          <strong>{openPicks} still to pick.</strong> Best across every level you can reach:{' '}
          {topPicks.map((s, i) => (
            <span key={s.id}>
              {i > 0 && ', '}
              <button className="linkish" onClick={() => toggle(s.id)} title={s.headline}>
                {s.spell.name}
              </button>
            </span>
          ))}
          .
        </p>
      )}

      {!hasNothingToShow && (
        <div className="searchbar" style={{ marginTop: 12 }}>
          <input
            type="text"
            placeholder="Search every spell you can cast…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {!search && !hasNothingToShow && (
        <div className="spell-levels" role="tablist">
          {groups.map((group) => (
            <button
              key={group.level}
              role="tab"
              aria-selected={group.level === active.level}
              onClick={() => setLevel(group.level)}
            >
              {group.level === 0 ? 'Cantrips' : group.level}
            </button>
          ))}
        </div>
      )}

      {search && !pool.length && (
        <p className="muted">Nothing on your lists matches “{query.trim()}”.</p>
      )}

      {/*
        What you have comes first and is never truncated - a recorded spell you
        cannot see is one you cannot remove.
      */}
      {taken.map((suggestion) => {
        const teachers = teachersOf(suggestion.id);
        return (
          <div key={suggestion.id}>
            <SpellCard suggestion={suggestion} onToggle={() => toggle(suggestion.id)} />
            {/*
              Only where it is a real question. One class and there is nothing
              to choose; one casting class and the whole idea does not apply.
            */}
            {teachers.length > 1 && (
              <div className="spell-source">
                <span>Learned as a</span>
                {teachers.map((s) => (
                  <button
                    key={s.classId}
                    type="button"
                    className={
                      (build.spellSources?.[suggestion.id] ??
                        bestTeacher(suggestion.id)?.classId) === s.classId
                        ? 'is-on'
                        : ''
                    }
                    onClick={() => setSource(suggestion.id, s.classId)}
                    title={`Cast at DC ${s.saveDc} on ${ABILITY_NAMES[s.ability]}`}
                  >
                    {s.className} · DC {s.saveDc}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {granted.length > 0 && (
        <>
          <div className="field-label" style={{ margin: '10px 0 6px' }}>
            Granted by your subclass — always prepared, and free
          </div>
          {granted.map((suggestion) => (
            <SpellCard
              key={suggestion.id}
              suggestion={suggestion}
              onToggle={() => toggle(suggestion.id)}
            />
          ))}
        </>
      )}
      {shown.map((suggestion, index) => (
        <SpellCard
          key={suggestion.id}
          suggestion={suggestion}
          rank={index + 1}
          onToggle={() => toggle(suggestion.id)}
        />
      ))}

      {!search && offered.length > SHOWN && (
        <p className="muted" style={{ marginTop: 4 }}>
          Showing {SHOWN} of {offered.length} you could still take. Scored spells come first and are
          ranked against this build; the rest are legal picks the app has no opinion on.
        </p>
      )}

      {casting.notes.map((note, i) => (
        <p className="note" key={i}>
          {note}
        </p>
      ))}
    </Panel>
  );
}

/** Name, school and summary, so a half-remembered effect still finds the spell. */
function matchesSpell(suggestion: SpellSuggestion, search: string): boolean {
  const spell = suggestion.spell;
  return (
    spell.name.toLowerCase().includes(search) ||
    spell.school.includes(search) ||
    spell.summary.toLowerCase().includes(search)
  );
}

function SpellCard({
  suggestion,
  rank,
  onToggle,
}: {
  suggestion: SpellSuggestion;
  rank?: number;
  onToggle: () => void;
}) {
  const spell = suggestion.spell;
  return (
    <details className={`suggestion ${suggestion.taken ? 'is-top' : ''}`}>
      <summary>
        <span className="rank">{suggestion.taken ? '✓' : (rank ?? '·')}</span>
        <span className="title">
          <strong>{spell.name}</strong>
          <span className="src">{describeSpell(spell)}</span>
        </span>
        {suggestion.score !== null ? (
          <FitBar score={suggestion.score} />
        ) : (
          <span className="tag" title="No opinion recorded for this spell">
            unrated
          </span>
        )}
      </summary>
      <div className="body">
        <p>{spell.summary}</p>
        <div className="statline" style={{ marginBottom: 10 }}>
          <div>
            <div className="k">Casting</div>
            <div className="v sm">{CASTING_TIME_LABELS[spell.castingTime]}</div>
          </div>
          <div>
            <div className="k">Range</div>
            <div className="v sm">{spell.range}</div>
          </div>
          <div>
            <div className="k">Duration</div>
            <div className="v sm">{spell.duration}</div>
          </div>
          {spell.damage && (
            <div>
              <div className="k">Damage</div>
              <div className="v sm">
                {spell.damage.dice} {spell.damage.type}
              </div>
            </div>
          )}
        </div>
        {spell.note && <p className="note">{spell.note}</p>}
        <ReasonList reasons={suggestion.reasons} />
        {/* The verdict and the ranking come first; the rules are for after you
            have chosen, so they sit at the bottom behind a disclosure. */}
        <RulesDisclosure kind="spell" name={spell.name} />
        {suggestion.granted && !suggestion.taken ? (
          <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
            Your subclass grants this. It is always prepared and costs you none of
            your picks, so there is nothing to add — and taking it as a pick as
            well would spend one for nothing.
          </p>
        ) : (
          <button className="btn btn-sm" style={{ marginTop: 12 }} onClick={onToggle}>
            {suggestion.taken ? `Remove ${spell.name}` : `Add ${spell.name}`}
          </button>
        )}
      </div>
    </details>
  );
}

/** What this character has, and what the next level brings. */
function ClassFeaturesPanel({ ctx }: { ctx: BuildContext }) {
  const held = ctx.features;
  const next = ctx.slices.flatMap((slice) =>
    classFeaturesAtExactly(slice.klass.id, slice.entry.level + 1, ctx.build.ruleset).map((f) => ({
      ...f,
      source: slice.klass.name,
    })),
  );

  const byLevel = new Map<number, typeof held>();
  for (const feature of held) {
    byLevel.set(feature.level, [...(byLevel.get(feature.level) ?? []), feature]);
  }

  return (
    <Panel
      title="Class features"
      subtitle={`${held.length} features from ${ctx.slices.map((s) => `${s.klass.name} ${s.entry.level}`).join(' / ')}.`}
    >
      {[...byLevel.keys()]
        .sort((a, b) => a - b)
        .map((level) => (
          <div key={level} style={{ marginBottom: 10 }}>
            <div className="field-label" style={{ marginBottom: 3 }}>
              Level {level}
            </div>
            {byLevel.get(level)!.map((feature, i) => (
              <div className="feature-row" key={`${feature.name}-${i}`}>
                <strong>{feature.name}</strong>
                <span className="src">{feature.source}</span>
                <p>{feature.summary}</p>
              </div>
            ))}
          </div>
        ))}

      {next.length > 0 && (
        <div className="feature-next">
          <div className="field-label" style={{ marginBottom: 3 }}>
            Next level
          </div>
          {next.map((feature, i) => (
            <div className="feature-row" key={`${feature.name}-${i}`}>
              <strong>{feature.name}</strong>
              <span className="src">{feature.source}</span>
              <p>{feature.summary}</p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/**
 * Main hand, off hand and magic bonuses, plus the style and loadout they imply
 * shown read-only. Those two used to be dropdowns you filled in; they are
 * derived now, and the panel says what produced them.
 */
function WeaponPickers({
  build,
  ctx,
  patch,
}: {
  build: Build;
  ctx: BuildContext;
  patch: (partial: Partial<Build>) => void;
}) {
  const proficiencies = weaponProficiencies(ctx.slices, ctx.race, build.ruleset);

  const weapons = weaponsFor(build.ruleset);
  const byId = new Map(weapons.map((w) => [w.id, w]));

  const options = (melee: boolean | null) =>
    weapons.filter((w) => melee === null || w.melee === melee).map((weapon) => ({
      value: weapon.id,
      label: `${weapon.name} — ${damageDice(weapon)} ${weapon.damage.type}${
        isProficientWith(weapon, proficiencies) ? '' : ' (not proficient)'
      }`,
      group: `${weapon.category === 'simple' ? 'Simple' : 'Martial'} ${weapon.melee ? 'melee' : 'ranged'}`,
    }));

  const setWeapons = (partial: Partial<Build['weapons']>) =>
    patch({ weapons: { ...build.weapons, ...partial } });

  const mainHand = ctx.loadouts.mainHand;
  const offHandUsable = mainHand && !isTwoHanded(mainHand) && !build.defenses.shield;

  return (
    <>
      <Select
        label="Main hand"
        value={build.weapons.mainHandId ?? ''}
        onChange={(mainHandId) => setWeapons({ mainHandId: mainHandId || undefined })}
        options={[{ value: '', label: '— nothing equipped —' }, ...options(null)]}
      />

      {offHandUsable && (
        <Select
          label="Off hand"
          value={build.weapons.offHandId ?? ''}
          onChange={(offHandId) => setWeapons({ offHandId: offHandId || undefined })}
          options={[
            { value: '', label: '— empty —' },
            ...options(true).filter((o) => isLight(byId.get(o.value)!)),
          ]}
        />
      )}
      {mainHand && isTwoHanded(mainHand) && build.weapons.offHandId && (
        <p className="note">
          {mainHand.name} is two-handed, so the off-hand weapon is not in play.
        </p>
      )}

      {mainHand && (
        <Select
          label={`Magic bonus (${mainHand.name})`}
          value={String(build.weapons.magicBonus[mainHand.id] ?? 0)}
          onChange={(value) =>
            setWeapons({
              magicBonus: { ...build.weapons.magicBonus, [mainHand.id]: Number(value) },
            })
          }
          options={[0, 1, 2, 3].map((n) => ({ value: String(n), label: n ? `+${n}` : 'None' }))}
        />
      )}

      <MasteryPicker build={build} ctx={ctx} patch={patch} />

      <p className="note">
        <strong>
          {WEAPON_STYLE_LABELS[ctx.weaponStyle]} · {LOADOUT_LABELS[ctx.loadout]}
        </strong>
        <br />
        {ctx.loadouts.why}
      </p>
    </>
  );
}

/** What you roll to hit and for damage, itemised like the AC breakdown. */
function AttacksPanel({ ctx }: { ctx: BuildContext }) {
  if (!ctx.attacks.length) return null;

  return (
    <Panel title="Attacks" subtitle="Per weapon in hand, before any situational bonus.">
      {ctx.attacks.map((attack) => (
        <div key={`${attack.weapon.id}-${attack.hand}`} style={{ marginBottom: 14 }}>
          <div className="field-label" style={{ marginBottom: 4 }}>
            {attack.weapon.name}
            {attack.hand === 'off' && ' (off hand)'}
          </div>
          <div className="statline" style={{ marginBottom: 8 }}>
            <div>
              <div className="k">To hit</div>
              <div className="v">
                {attack.toHit >= 0 ? '+' : ''}
                {attack.toHit}
              </div>
            </div>
            <div>
              <div className="k">Damage</div>
              <div className="v">
                {attack.damage.dice}
                {attack.damage.bonus ? `+${attack.damage.bonus}` : ''}
              </div>
            </div>
          </div>
          <Breakdown lines={attack.toHitLines} total={attack.toHit} />
          {attack.problems.map((problem, i) => (
            <div className="callout error" key={i} style={{ marginTop: 8 }}>
              {problem}
            </div>
          ))}
          {attack.notes.map((note, i) => (
            <p className="note" key={i}>
              {note}
            </p>
          ))}
        </div>
      ))}
    </Panel>
  );
}

/** 2024 weapon mastery: which weapons you have the property with. */
function MasteryPicker({
  build,
  ctx,
  patch,
}: {
  build: Build;
  ctx: BuildContext;
  patch: (partial: Partial<Build>) => void;
}) {
  const slots = masterySlots(ctx.slices, build.ruleset);
  if (slots === 0) return null;

  const proficiencies = weaponProficiencies(ctx.slices, ctx.race, build.ruleset);
  const suggestions = recommendMasteries(build, proficiencies, ctx.weaponStyle);
  const open = Math.max(0, slots - build.masteryIds.length);

  const toggle = (id: string) =>
    patch({
      masteryIds: build.masteryIds.includes(id)
        ? build.masteryIds.filter((m) => m !== id)
        : [...build.masteryIds, id],
    });

  return (
    <>
      <div className="field-label" style={{ marginTop: 14, marginBottom: 4 }}>
        Weapon mastery — {open > 0 ? `${open} to choose` : 'all chosen'}
      </div>
      {[
        ...suggestions.filter((s) => s.taken),
        ...(open > 0 ? suggestions.filter((s) => !s.taken && s.eligible).slice(0, 5) : []),
      ].map((suggestion) => (
        <div className="skill-row" key={suggestion.weapon.id}>
          <label className="skill-name">
            <input
              type="checkbox"
              checked={suggestion.taken}
              onChange={() => toggle(suggestion.weapon.id)}
              aria-label={`${suggestion.weapon.name} mastery`}
            />
            <span className={suggestion.taken ? 'is-proficient' : ''}>{suggestion.weapon.name}</span>
            <span className="tag">{suggestion.label}</span>
          </label>
          <span className="src">{suggestion.summary}</span>
        </div>
      ))}
    </>
  );
}

/**
 * What this character can put back.
 *
 * Beside the damage curve rather than inside it. Damage and healing are never
 * traded off against each other - nobody asks whether Cure Wounds beats Fire
 * Bolt - so one number covering both would invite a comparison that means
 * nothing. It only appears for a character who has a healing spell, which
 * keeps it off every sheet that would find it noise.
 */
function HealingPanel({ ctx }: { ctx: BuildContext }) {
  const healing = ctx.healing;
  if (!healing.heals || !healing.best) return null;

  const { best, bestSingleTarget } = healing;
  return (
    <Panel
      title="Healing"
      subtitle="An average, and an honest one: healing has no attack roll and no saving throw, so what you roll is what you restore."
    >
      <div className="statline" style={{ marginBottom: 12 }}>
        <div>
          <div className="k">Best casting</div>
          <div className="v">{best.total}</div>
          <div className="sub">
            {best.spell.name}
            {best.targets > 1 ? ` across ${best.targets}` : ''}
          </div>
        </div>
        {bestSingleTarget && bestSingleTarget !== best && (
          <div>
            <div className="k">To one creature</div>
            <div className="v">{bestSingleTarget.perTarget}</div>
            <div className="sub">{bestSingleTarget.spell.name}</div>
          </div>
        )}
      </div>

      <ul className="reasons">
        {healing.lines.map((line) => (
          <li key={line.label}>
            <b>{line.label}</b> — {line.detail}
          </li>
        ))}
      </ul>
      {healing.notes.map((note) => (
        <p className="note" key={note}>
          {note}
        </p>
      ))}
    </Panel>
  );
}

/**
 * Damage per round. The curve is the point: -5/+10 is worth taking below a
 * break-even AC and a trap above it, and a single number hides that.
 */
function DamagePanel({
  build,
  ctx,
  patch,
}: {
  build: Build;
  ctx: BuildContext;
  patch: (partial: Partial<Build>) => void;
}) {
  const dpr = ctx.dpr;
  // A caster with nothing in hand still has a damage number - it comes from
  // cantrips rather than swings, so the panel stays.
  if (!ctx.attacks.length && !ctx.spellcasting.casts) return null;

  const setAssumption = (partial: Partial<Build['combatAssumptions']>) =>
    patch({ combatAssumptions: { ...build.combatAssumptions, ...partial } });

  const peak = Math.max(...dpr.curve.map((p) => p.nova), 1);

  return (
    <Panel
      title="Damage per round"
      subtitle={`Against AC ${dpr.targetAc}, which is typical for level ${ctx.totalLevel}.`}
    >
      <div className="statline" style={{ marginBottom: 12 }}>
        <div>
          <div className="k">Sustained</div>
          <div className="v">{dpr.sustained}</div>
        </div>
        <div>
          <div className="k">Nova</div>
          <div className="v">{dpr.nova}</div>
        </div>
      </div>

      <div className="dpr-chart" role="img" aria-label={`Damage per round from AC 10 to 25, ${dpr.curve.map((p) => `AC ${p.ac}: ${p.sustained}`).join(', ')}`}>
        {dpr.curve.map((point) => (
          <div className="dpr-bar" key={point.ac} title={`AC ${point.ac}: ${point.sustained} sustained, ${point.nova} nova`}>
            <span className="nova" style={{ height: `${(point.nova / peak) * 100}%` }} />
            <span className="sustained" style={{ height: `${(point.sustained / peak) * 100}%` }} />
            {point.ac === dpr.targetAc && <span className="marker" />}
          </div>
        ))}
      </div>
      <div className="dpr-axis">
        <span>AC {dpr.curve[0].ac}</span>
        <span>AC {dpr.targetAc}</span>
        <span>AC {dpr.curve.at(-1)!.ac}</span>
      </div>

      <ul className="reasons" style={{ marginTop: 12 }}>
        {dpr.lines.map((line, i) => (
          <li key={i}>
            <span className="delta pos">{line.value}</span>
            <span>
              {line.label}
              {line.detail && <span className="src"> {line.detail}</span>}
            </span>
          </li>
        ))}
      </ul>

      <div className="row" style={{ marginTop: 10 }}>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={build.combatAssumptions.advantage}
            onChange={(e) => setAssumption({ advantage: e.target.checked })}
          />
          <span>Assume advantage</span>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={build.combatAssumptions.concentrating}
            onChange={(e) => setAssumption({ concentrating: e.target.checked })}
          />
          <span>Assume a concentration buff is up</span>
        </label>
        {ctx.spellcasting.casts && (
          <label className="field field-sm">
            <span>Targets an area spell catches</span>
            <input
              type="number"
              min={1}
              max={8}
              value={build.combatAssumptions.targets}
              onChange={(e) =>
                setAssumption({ targets: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })
              }
            />
          </label>
        )}
      </div>

      {dpr.notes.map((note, i) => (
        <p className="note" key={i}>
          {note}
        </p>
      ))}
    </Panel>
  );
}

/**
 * What to spend an ability score improvement on, offered where it is spent.
 *
 * Every other choice on this tab already ranks itself in place - skills, class
 * options, spells - and this was the one that did not, because the ranking
 * lived on the Optimizer. That meant taking a feat and seeing which feats you
 * had taken were two different screens. The forward plan to level 20 is still
 * the Optimizer's: that answers "what should this character become", which is a
 * different question from "I have a slot open right now".
 */
function NextPicks({
  ctx,
  build,
  onChange,
}: {
  ctx: BuildContext;
  build: Build;
  onChange: (build: Build) => void;
}) {
  const unspent = ctx.asiSlotsReached - ctx.asiSlotsSpent;
  const suggestions = useMemo(() => recommendNext(ctx, unspent > 0 ? 10 : 5), [ctx, unspent]);
  if (!suggestions.length) return null;

  const take = (suggestion: Suggestion) => {
    if (suggestion.kind === 'feat') {
      onChange({
        ...build,
        featIds: [...build.featIds, suggestion.id],
        featAsiChoices: suggestion.asiChoice
          ? { ...build.featAsiChoices, [suggestion.id]: suggestion.asiChoice }
          : build.featAsiChoices,
      });
    } else {
      onChange({ ...build, asiPicks: [...build.asiPicks, [...suggestion.allocation]] });
    }
  };

  return (
    <>
      <div className="field-label" style={{ marginTop: 16 }}>
        {unspent > 0
          ? `Spend now — ${unspent} unspent ${unspent === 1 ? 'slot' : 'slots'}`
          : 'If you had a slot right now'}
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        {unspent > 0
          ? 'Ranked for the build exactly as it stands. Click Take to apply one.'
          : 'Nothing is unspent, so this is a preview of your next level-up. The full plan to level 20 is on the Optimizer tab.'}
      </p>
      {suggestions.map((suggestion, index) => (
        <SuggestionCard
          key={suggestion.id}
          suggestion={suggestion}
          rank={index + 1}
          onTake={() => take(suggestion)}
        />
      ))}
    </>
  );
}
