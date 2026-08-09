import { ABILITIES, ABILITY_NAMES } from '../types';
import type { Ability } from '../types';
import { featById } from '../data/feats';
import { ARMOR_BY_ID } from '../data/armor';
import { SKILLS_BY_ID } from '../data/skills';
import { skillChoicesFor } from '../data/classes';
import type { BuildContext } from './character';
import { cellFor } from './raceMatrix';
import { checkPrereq, matches } from './conditions';
import { describeSlots, optionGroups, reconcileClassOptions, slotsFor } from './classOptions';
import { isLegalPointBuy, pointsSpent } from './pointBuy';
import { ammunitionCarried } from './inventory';
import { weaponById } from '../data/weapons';
import { BACKGROUNDS_BY_ID } from '../data/backgrounds';
import { checkMulticlass } from './conditions';

export type Severity = 'error' | 'warning' | 'info' | 'good';

export interface Finding {
  severity: Severity;
  title: string;
  detail: string;
  /** Concrete next step, when there is one. */
  fix?: string;
  /**
   * Where this is already being said on screen, when it is.
   *
   * A review that opens with nine entries on an untouched character teaches
   * you to stop reading it, and most of those nine were not mistakes - they
   * were "you have not filled this in yet", which the Builder's section
   * badges now count, and "this lineage suits this class", which the fit
   * panel states in more detail on the same screen.
   *
   * They stay in the list rather than being deleted, because the printed
   * build summary has neither a badge nor a fit panel, and there a reader
   * genuinely wants to be told. Only the Builder hides them.
   */
  alsoShownAs?: 'section-badge' | 'lineage-fit';
}

/** The findings that are mistakes, as opposed to work not yet done. */
export function problemsOnly(findings: Finding[]): Finding[] {
  return findings.filter((finding) => !finding.alsoShownAs);
}

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2, good: 3 };

/** Reviews a build the way a knowledgeable player would look over your sheet. */
export function analyze(ctx: BuildContext): Finding[] {
  const findings: Finding[] = [];
  const { scores, abilityPriority, totalLevel, race, primary } = ctx;

  /*
    Nothing has been assigned yet: every score sits at 8 with the whole
    point-buy budget unspent. Every number derived from them is low by
    construction, so telling someone their Constitution is bad before they have
    spent a single point is noise rather than review - it is the Abilities
    badge's job to say there is work there.
  */
  const untouched = pointsSpent(ctx.build.baseScores) === 0;
  const whenBuilt = untouched ? { alsoShownAs: 'section-badge' as const } : {};

  const primaries = ABILITIES.filter((a) => abilityPriority[a] === 3);
  // Findings about "your primary" mean the attack/save-DC stat specifically,
  // not every ability the class happens to rate highly.
  const key = ctx.keyAbility;

  /*
    Multiclass prerequisites, §43. `checkPrereq` has covered feats since the
    Builder had feats and nothing ever checked the multiclassing table, so a
    Wizard 5 with Strength 8 could take a Fighter level and no screen in the
    app said a word about it.

    An error rather than a warning: this is not "your build is weak", it is
    "your character could not legally have been made". Flagged rather than
    forbidden, because the Builder is a planning tool and refusing the class
    would answer "does this work?" by hiding the answer - and because a table
    running the optional waiver, or a sheet imported from one, has to survive
    the trip.
  */
  const legality = checkMulticlass(ctx.slices, scores);
  if (!legality.ok) {
    findings.push({
      severity: 'error',
      title: 'This multiclass does not meet its prerequisites',
      detail: legality.problems.join(' '),
      fix: 'Raise the score in the Abilities section, drop the class, or agree with your table that you are waiving the prerequisite — it is an optional rule some tables ignore.',
    });
  }

  // --- unspent progression -------------------------------------------------
  const unspent = ctx.asiSlotsReached - ctx.asiSlotsSpent;
  if (unspent > 0) {
    findings.push({
      severity: 'error',
      title: `${unspent} unspent ASI or feat ${unspent === 1 ? 'slot' : 'slots'}`,
      alsoShownAs: 'section-badge',
      detail: `At level ${totalLevel} this build has unlocked ${ctx.asiSlotsReached} ability score improvements but only ${ctx.asiSlotsSpent} have been assigned.`,
      fix: 'The Feats section ranks every feat and ability score improvement for this build, with a Take button.',
    });
  } else if (unspent < 0) {
    findings.push({
      severity: 'warning',
      title: 'More feats and ASIs than the level allows',
      detail: `This build spends ${ctx.asiSlotsSpent} slots but only ${ctx.asiSlotsReached} are unlocked at level ${totalLevel}. If this came from an import, the sheet may include feats granted by a background or magic item.`,
    });
  }

  const unspentOrigin = ctx.originFeatSlots - ctx.build.originFeatIds.length;
  if (unspentOrigin > 0) {
    findings.push({
      severity: 'error',
      title: `${unspentOrigin} unspent origin ${unspentOrigin === 1 ? 'feat' : 'feats'}`,
      alsoShownAs: 'section-badge',
      detail:
        ctx.build.ruleset === '2024'
          ? 'Your background grants a free Origin feat, and the 2024 Human grants a second. They cost no ability score improvement.'
          : `${race.name} grants a free feat at 1st level, which costs no ability score improvement.`,
      fix: 'Pick it in the Feats section.',
    });
  } else if (unspentOrigin < 0) {
    findings.push({
      severity: 'warning',
      title: 'More origin feats than this character is entitled to',
      detail: `This build lists ${ctx.build.originFeatIds.length} origin feats but only ${ctx.originFeatSlots} are granted.`,
    });
  }

  // --- odd scores ----------------------------------------------------------
  const oddPrimaries = [key].filter((a) => scores[a] % 2 === 1 && scores[a] < 20);
  if (oddPrimaries.length) {
    findings.push({
      severity: 'warning',
      title: `Odd score in ${oddPrimaries.map((a) => ABILITY_NAMES[a]).join(' and ')}`,
      ...whenBuilt,
      detail: `${oddPrimaries.map((a) => `${ABILITY_NAMES[a]} ${scores[a]}`).join(', ')} - the odd point does nothing until you add one more.`,
      fix: 'A half-feat (+1 to one ability) converts that dead point into a full modifier step, which is why half-feats are so strong on odd scores.',
    });
  }

  // --- primary stat --------------------------------------------------------
  for (const ability of [key]) {
    if (totalLevel >= 8 && scores[ability] < 18) {
      findings.push({
        severity: 'warning',
        title: `${ABILITY_NAMES[ability]} is low for level ${totalLevel}`,
        ...whenBuilt,
        detail: `${ABILITY_NAMES[ability]} ${scores[ability]} on a build whose attacks and save DC key off it. Most characters are at 18-20 by this point.`,
        fix: `Spend an ASI on ${ABILITY_NAMES[ability]}, or take a half-feat that boosts it.`,
      });
    } else if (totalLevel >= 4 && scores[ability] < 16) {
      findings.push({
        severity: 'warning',
        title: `${ABILITY_NAMES[ability]} ${scores[ability]} is behind the curve`,
        ...whenBuilt,
        detail: `${ABILITY_NAMES[ability]} sets your attack rolls and your save DC. Everything else on the sheet is worth less until it reaches at least 16.`,
      });
    } else if (scores[ability] === 20) {
      findings.push({
        severity: 'good',
        title: `${ABILITY_NAMES[ability]} is maxed`,
        detail: 'Further ASIs into this ability do nothing. From here, feats are strictly better value.',
      });
    }
  }

  // --- constitution and concentration --------------------------------------
  const frontline = ['str-melee', 'dex-melee', 'unarmed'].includes(ctx.weaponStyle);
  if (scores.con < 14 && (frontline || ctx.concentrates)) {
    findings.push({
      severity: 'warning',
      title: `Constitution ${scores.con} is low`,
      ...whenBuilt,
      detail: frontline
        ? 'You are in melee with a below-average hit point total.'
        : 'You rely on concentration spells, and every hit forces a save you are likely to fail.',
      fix: 'CON 14 is the floor for most builds. Tough or Resilient (Constitution) also work.',
    });
  }

  const hasConSave = ctx.slices.some((s) => s.klass.saves.includes('con'));
  const concProtection =
    ctx.featIds.has('war-caster') ||
    (ctx.featIds.has('resilient') && ctx.build.featAsiChoices['resilient'] === 'con');
  if (ctx.concentrates && totalLevel >= 8 && !concProtection && !hasConSave) {
    findings.push({
      severity: 'warning',
      title: 'No concentration protection',
      detail: 'Your best spells are concentration spells, you have no CON save proficiency, and nothing on this sheet protects the save.',
      fix: 'War Caster (advantage on the save) or Resilient (Constitution) (proficiency). War Caster is better if your CON is already even.',
    });
  } else if (ctx.concentrates && concProtection) {
    findings.push({
      severity: 'good',
      title: 'Concentration is protected',
      detail: 'You have taken a feat that keeps your concentration spells running under fire.',
    });
  }

  // --- feat prerequisites and dead feats -----------------------------------
  for (const featId of ctx.build.featIds) {
    const feat = featById(featId, ctx.build.ruleset);
    if (!feat) continue;
    const prereq = checkPrereq(feat, ctx);
    if (!prereq.ok) {
      findings.push({
        severity: 'error',
        title: `${feat.name} prerequisite not met`,
        detail: prereq.problems.join('; '),
      });
    }
  }

  const styleMismatch: { feat: string; needs: string }[] = [
    { feat: 'sharpshooter', needs: 'a ranged weapon' },
    { feat: 'great-weapon-master', needs: 'a heavy two-handed melee weapon' },
    { feat: 'polearm-master', needs: 'a polearm' },
    { feat: 'crossbow-expert', needs: 'a hand crossbow' },
    { feat: 'shield-master', needs: 'a shield' },
    { feat: 'dual-wielder', needs: 'two weapons' },
  ];
  for (const { feat, needs } of styleMismatch) {
    if (!ctx.featIds.has(feat)) continue;
    const suggestion = featById(feat, ctx.build.ruleset);
    if (!suggestion) continue;
    const rule = suggestion.rules?.find((r) => r.delta <= -3);
    if (!rule) continue;
    // Re-run just the penalty rule: if it fires, the feat is dead weight here.
    if (matches(rule.when, ctx)) {
      findings.push({
        severity: 'error',
        title: `${suggestion.name} does nothing with this loadout`,
        detail: `${suggestion.name} requires ${needs}, but this build is set to ${ctx.loadout} / ${ctx.weaponStyle}.`,
        fix: 'Either change the weapon loadout in the Equipment section, or retrain the feat.',
      });
    }
  }

  // --- advantage sources for the -5/+10 feats ------------------------------
  const hasPowerAttack = ctx.featIds.has('sharpshooter') || ctx.featIds.has('great-weapon-master');
  const advantageSource =
    ctx.slices.some((s) => s.klass.id === 'barbarian') ||
    [...ctx.subclassIds].some((s) =>
      ['samurai', 'vengeance', 'assassin', 'gloom-stalker', 'echo-knight', 'battle-master'].includes(s),
    ) ||
    ctx.featIds.has('elven-accuracy');
  if (hasPowerAttack && !advantageSource) {
    findings.push({
      severity: 'info',
      title: 'No reliable advantage for your -5/+10 feat',
      detail: 'Sharpshooter and Great Weapon Master only pay off when you can afford the -5. Without advantage on demand, the break-even point is against low-AC targets only.',
      fix: 'Reckless Attack, a Samurai/Vengeance/Gloom Stalker subclass, an ally with Faerie Fire, or a familiar using Help all solve this.',
    });
  }

  // --- lineage fit ---------------------------------------------------------
  const cell = cellFor(race.id, primary.klass.id);
  if (cell) {
    if (cell.rating === 'red') {
      findings.push({
        severity: 'warning',
        title: `${race.name} is a weak fit for ${primary.klass.name}`,
        alsoShownAs: 'lineage-fit',
        detail: cell.reasons[0] ?? 'The lineage increases do not land on this class\'s priorities.',
        fix: 'See the Races tab for the best lineages for this class. If you are attached to the concept, the Tasha\'s custom origin toggle lets you move the increases.',
      });
    } else if (cell.rating === 'sky') {
      findings.push({
        severity: 'good',
        title: `${race.name} is a top-tier ${primary.klass.name}`,
        alsoShownAs: 'lineage-fit',
        detail: cell.note ?? cell.reasons[0] ?? '',
      });
    }
  }

  // --- MAD warning ---------------------------------------------------------
  if (primaries.length >= 2) {
    const behind = primaries.filter((a) => scores[a] < 16);
    if (behind.length && totalLevel >= 6) {
      findings.push({
        severity: 'info',
        title: `${primary.klass.name} needs two high stats`,
        detail: `This class keys off ${primaries.map((a) => ABILITY_NAMES[a]).join(' and ')}, and ${behind.map((a) => ABILITY_NAMES[a]).join(', ')} ${behind.length === 1 ? 'is' : 'are'} still below 16.`,
        fix: 'Half-feats are the efficient fix for multi-ability-dependent classes - they advance a stat and add a feature at the same time.',
      });
    }
  }

  // --- armor and AC --------------------------------------------------------
  // Anything the AC calculation found illegal is an error, not advice. They are
  // reported as one finding so a single bad armor choice does not fill the list.
  if (ctx.ac.problems.length) {
    findings.push({
      severity: 'error',
      title:
        ctx.ac.problems.length === 1
          ? 'This armor is a problem'
          : `${ctx.ac.problems.length} problems with this armor`,
      detail: ctx.ac.problems.join(' '),
      fix: 'Change your armor in the Equipment section, or pick up the proficiency with Lightly, Moderately or Heavily Armored.',
    });
  }

  const armor = ARMOR_BY_ID[ctx.build.defenses.armorId] ?? ARMOR_BY_ID.none;
  const dexCap =
    armor.category === 'medium' && ctx.featIds.has('medium-armor-master') ? 3 : armor.dexCap;
  if (dexCap !== null && ctx.mods.dex > dexCap) {
    const wasted = ctx.mods.dex - dexCap;
    findings.push({
      severity: 'warning',
      title: `${wasted} point${wasted === 1 ? '' : 's'} of your Dexterity bonus ${wasted === 1 ? 'is' : 'are'} doing nothing`,
      detail: `${armor.name} caps the Dexterity contribution to AC at +${dexCap}, and your modifier is +${ctx.mods.dex}.`,
      fix:
        armor.category === 'medium'
          ? 'Either take Medium Armor Master to raise the cap to +3, switch to light armor, or stop investing in Dexterity.'
          : 'Heavy armor ignores Dexterity entirely; if you want that modifier to count, move to medium or light armor.',
    });
  }

  if (ctx.ac.stealthDisadvantage) {
    findings.push({
      severity: 'info',
      title: `${armor.name} gives disadvantage on Stealth`,
      detail: 'That applies to every Stealth check while you are wearing it, including party-wide sneaking.',
      fix:
        armor.category === 'medium'
          ? 'Medium Armor Master removes this, or a breastplate gives the same AC as scale mail without the penalty.'
          : 'Consider whether the party needs you to be quiet more than it needs the extra point of AC.',
    });
  }

  const expectedAc = 15 + Math.floor(totalLevel / 4);
  if (frontline && ctx.ac.total < expectedAc) {
    findings.push({
      severity: 'warning',
      title: `AC ${ctx.ac.total} is low for a frontliner at level ${totalLevel}`,
      ...whenBuilt,
      detail: `A melee character at this level usually wants AC ${expectedAc} or better. Yours comes from ${ctx.ac.source}.`,
      fix: 'Better armor, a shield, or the Defense fighting style are the cheapest fixes.',
    });
  }

  // --- hit points ----------------------------------------------------------
  const expectedHp = totalLevel * (ctx.primary.klass.hitDie / 2 + 1 + 2);
  if (ctx.hp.total < expectedHp * 0.8) {
    findings.push({
      severity: 'warning',
      title: `${ctx.hp.total} hit points is low for level ${totalLevel}`,
      ...whenBuilt,
      detail: `A ${ctx.primary.klass.name} at this level is usually nearer ${Math.round(expectedHp)}. Constitution ${ctx.scores.con} is the main driver.`,
      fix: 'Raise Constitution, or take Tough for +2 hit points per level.',
    });
  }

  // --- point buy legality --------------------------------------------------
  const base = ctx.build.baseScores;
  if (!isLegalPointBuy(base)) {
    const spent = pointsSpent(base);
    const outOfRange = ABILITIES.filter((a: Ability) => base[a] < 8 || base[a] > 15);
    findings.push({
      severity: 'info',
      title: 'Base scores are not standard point buy',
      detail: outOfRange.length
        ? `${outOfRange.map((a) => `${ABILITY_NAMES[a]} ${base[a]}`).join(', ')} falls outside the 8-15 point-buy range. That is normal for rolled stats or an imported sheet.`
        : `Base scores cost ${spent} points against a 27-point budget.`,
    });
  }

  // --- proficiencies -------------------------------------------------------
  const prof = ctx.proficiencies;

  // The flagship: a pick that landed on something you were already given. The
  // second proficiency does nothing, so the pick is simply gone.
  for (const collision of prof.collisions) {
    const name = SKILLS_BY_ID[collision.skill].name;
    findings.push({
      severity: 'warning',
      title: `${name} is granted twice`,
      detail: `${collision.sources.join(' and ')} already ${collision.sources.length > 1 ? 'grant' : 'grants'} ${name}, so picking it a second time buys nothing. Proficiency does not stack.`,
      fix: 'Spend that pick on another skill in the Proficiencies panel.',
    });
  }

  if (prof.illegalPicks.length) {
    const names = prof.illegalPicks.map((id) => SKILLS_BY_ID[id].name).join(', ');
    findings.push({
      severity: 'error',
      title: `${names} ${prof.illegalPicks.length === 1 ? 'is' : 'are'} not on any list this character can pick from`,
      detail:
        'Your class list and any floating proficiencies from your lineage or feats do not cover this. It usually means a class change left the pick behind, or an imported sheet had it from a source the builder does not model.',
      fix: 'Clear it in the Proficiencies panel, or take the feat or background that grants it.',
    });
  }

  if (prof.openSkillPicks > 0) {
    findings.push({
      severity: 'warning',
      title: `${prof.openSkillPicks} skill ${prof.openSkillPicks === 1 ? 'proficiency' : 'proficiencies'} not chosen`,
      alsoShownAs: 'section-badge',
      detail: `This character is entitled to ${prof.skillPicks} and has assigned ${prof.skillPicks - prof.openSkillPicks}.`,
      fix: 'The Proficiencies panel will fill them with recommendations in one click.',
    });
  }

  if (prof.openExpertisePicks > 0) {
    findings.push({
      severity: 'warning',
      title: `${prof.openExpertisePicks} expertise ${prof.openExpertisePicks === 1 ? 'slot' : 'slots'} unspent`,
      alsoShownAs: 'section-badge',
      detail:
        'Expertise doubles your proficiency bonus on a skill. It is the single biggest reason Rogues and Bards dominate skill checks, and it costs nothing to assign.',
      fix: 'Assign it with the 2× buttons in the Proficiencies panel.',
    });
  }

  // Perception is the most-rolled skill in the game and someone in the party
  // needs it, so an untaken one that was on offer is worth mentioning.
  const perception = prof.skills.find((s) => s.skill === 'perception')!;
  const perceptionOffered = ctx.slices[0]
    ? skillChoicesFor(ctx.slices[0].klass, ctx.build.ruleset).from.includes('perception')
    : false;
  // Only once the picks are actually spent: while some are still open, "you
  // have not taken Perception" is a report on an unfinished sheet, and the
  // Skills badge is already saying there is work there.
  if (!perception.proficient && perceptionOffered && prof.openSkillPicks === 0) {
    findings.push({
      severity: 'info',
      title: 'Perception is on your class list and not taken',
      detail: `It is the most-rolled skill in the game, and passive Perception ${prof.passivePerception} is what the DM checks whether or not you roll. Worth a word with the party about who is covering it.`,
    });
  }

  const stealth = prof.skills.find((s) => s.skill === 'stealth')!;
  if (stealth.proficient && ctx.ac.stealthDisadvantage) {
    findings.push({
      severity: 'warning',
      title: 'Your armor cancels your Stealth proficiency',
      detail: `You are proficient in Stealth, and ${ARMOR_BY_ID[ctx.build.defenses.armorId].name.toLowerCase()} gives disadvantage on every Stealth check you make while wearing it.`,
      fix: 'Move to light armor, or spend that proficiency somewhere it works.',
    });
  }

  // Expertise on a dumped ability is a wasted slot: doubling a bad modifier
  // still leaves a bad modifier.
  for (const skill of ctx.build.expertiseIds) {
    const line = prof.skills.find((s) => s.skill === skill);
    if (line?.expertise && ctx.mods[line.ability] <= 0) {
      findings.push({
        severity: 'info',
        title: `Expertise in ${line.name} is doubling a weak ability`,
        detail: `${line.name} keys off ${ABILITY_NAMES[line.ability]}, which is ${ctx.scores[line.ability]} here. Doubling proficiency helps, but the modifier underneath is doing nothing for you.`,
      });
    }
  }

  // --- what you are carrying ------------------------------------------------
  if (ctx.inventory.overloaded) {
    findings.push({
      severity: 'error',
      title: `${ctx.inventory.weight} lb. is more than you can carry`,
      detail: `Carrying capacity is Strength × 15, which is ${ctx.inventory.capacity} lb. for a Strength of ${scores.str}. Weapons, armor and coins all count.`,
      fix: 'Put something down, raise Strength, or hand the heavy things to a mule - a donkey carries 420 lb. and costs 8 gp.',
    });
  }

  // A bow with nothing to shoot is the cheapest mistake on this list to make
  // and the most annoying to discover at the table.
  for (const stack of ammunitionCarried(ctx.build)) {
    if (stack.total > 0 || stack.usedBy.length === 0) continue;
    findings.push({
      severity: 'warning',
      title: `Your ${stack.usedBy[0].toLowerCase()} has nothing to shoot`,
      detail: `${stack.name} are not in your inventory, so the attack above cannot actually be made.`,
      fix: `Add ${stack.name.toLowerCase()} in the Equipment section - a bundle costs next to nothing.`,
    });
  }

  // --- 2024's own choices ---------------------------------------------------
  /*
    Only the mistakes belong here. "You have not chosen a mastery yet" is a
    section badge by the standing decision below, and a review that opens with
    it teaches you to stop reading. What is worth saying is when a choice was
    made and does not do anything.
  */
  if (ctx.build.ruleset === '2024') {
    const held = new Set(
      [ctx.build.weapons.mainHandId, ctx.build.weapons.offHandId].filter(Boolean),
    );
    const idle = ctx.build.masteryIds.filter((id) => !held.has(id));
    if (idle.length && held.size > 0) {
      const names = idle.map((id) => weaponById(id, '2024')?.name ?? id);
      findings.push({
        severity: 'info',
        title: `Weapon mastery on ${names.length === 1 ? 'a weapon' : 'weapons'} you are not holding`,
        detail: `${names.join(' and ')} ${names.length === 1 ? 'is' : 'are'} mastered but not equipped, so the property does nothing right now. That is fine if you swap weapons; it is a wasted slot if you never do.`,
        fix: 'Equip it in the Equipment section, or move the mastery to what you actually carry.',
      });
    }

    const background = ctx.build.backgroundId
      ? BACKGROUNDS_BY_ID[ctx.build.backgroundId]
      : undefined;
    const allowed = background?.abilities;
    if (allowed) {
      const stray = ctx.build.backgroundAsi.picks.filter((a) => !allowed.includes(a));
      if (stray.length) {
        findings.push({
          severity: 'error',
          title: `${background.name} cannot raise ${stray.map((a) => ABILITY_NAMES[a]).join(' or ')}`,
          detail: `A 2024 background raises only the three abilities it names - for ${background.name} those are ${allowed.map((a) => ABILITY_NAMES[a]).join(', ')}. The increase is not being applied.`,
          fix: 'Pick from the three the background offers, or change the background in the Identity section.',
        });
      }
    }
  }

  // --- class options -------------------------------------------------------
  for (const group of optionGroups(ctx)) {
    if (group.open > 0) {
      findings.push({
        severity: 'warning',
        title: `${describeSlots(group.kind, group.open)} unspent`,
        alsoShownAs: 'section-badge',
        detail: `This character has ${group.slots} and has chosen ${group.slots - group.open}. They cost nothing to assign.`,
        fix: 'Pick them in the Class options panel; the list is ranked for this build.',
      });
    }
  }

  // Eldritch Blast without Agonizing Blast is the single most common Warlock
  // mistake, and it roughly halves the class's at-will damage.
  const isWarlock = ctx.slices.some((s) => s.klass.id === 'warlock');
  if (isWarlock && ctx.weaponStyle === 'spell') {
    const hasAgonizing = ctx.build.classOptionIds.includes('agonizing-blast');
    if (!hasAgonizing && slotsFor('invocation', ctx) > 0) {
      findings.push({
        severity: 'warning',
        title: 'No Agonizing Blast',
        detail: `Eldritch Blast is your at-will damage, and Agonizing Blast adds your Charisma modifier to every beam - ${ctx.mods.cha >= 0 ? '+' : ''}${ctx.mods.cha} per beam, ${ctx.totalLevel >= 5 ? 'twice or more per turn at this level' : 'once per turn for now'}.`,
        fix: 'Take it in the Class options panel.',
      });
    } else if (hasAgonizing) {
      findings.push({
        severity: 'good',
        title: 'Agonizing Blast is taken',
        detail: 'Your at-will damage carries your Charisma modifier on every beam.',
      });
    }
  }

  const lapsed = reconcileClassOptions(ctx.build, ctx);
  for (const change of lapsed.changes) {
    findings.push({
      severity: 'error',
      title: 'A class option no longer applies',
      detail: change,
      fix: 'Clear it in the Class options panel and pick again.',
    });
  }

  // --- weapons -------------------------------------------------------------
  for (const attack of ctx.attacks) {
    for (const problem of attack.problems) {
      findings.push({
        severity: problem.includes('Not proficient') ? 'error' : 'warning',
        title: `${attack.weapon.name}: ${problem.includes('Not proficient') ? 'not proficient' : 'wasted property'}`,
        detail: problem,
        fix: problem.includes('Not proficient')
          ? 'Pick a weapon from your class list, or take the feat that grants the proficiency.'
          : undefined,
      });
    }
  }

  const mainHand = ctx.loadouts.mainHand;
  if (!mainHand && ctx.weaponStyle !== 'spell' && ctx.weaponStyle !== 'unarmed') {
    findings.push({
      severity: 'warning',
      title: 'No weapon equipped',
      alsoShownAs: 'section-badge',
      detail: 'This build attacks with weapons but is not carrying one, so there is nothing to rate combat feats against.',
      fix: 'Equip one in the Equipment panel.',
    });
  }

  if (mainHand && mainHand.properties.includes('heavy') && race.size === 'Small') {
    findings.push({
      severity: 'warning',
      title: `${mainHand.name} is a Heavy weapon and ${race.name} is Small`,
      detail: 'A Small creature has disadvantage on attack rolls with a Heavy weapon, which costs far more than the larger damage die gains.',
      fix: 'Move to a weapon without the Heavy property.',
    });
  }

  if (mainHand && mainHand.properties.includes('two-handed') && ctx.build.defenses.shield) {
    findings.push({
      severity: 'error',
      title: `${mainHand.name} needs both hands, and you are carrying a shield`,
      detail: 'You cannot use a two-handed weapon and a shield at the same time. The AC calculation counts the shield, so one of the two is wrong.',
      fix: 'Drop the shield in the Defenses panel, or move to a one-handed weapon.',
    });
  }

  // A finesse weapon on a build whose other ability is better is a wasted die.
  if (mainHand?.properties.includes('finesse') && ctx.mods.str > ctx.mods.dex) {
    findings.push({
      severity: 'info',
      title: `${mainHand.name} is a finesse weapon on a Strength build`,
      detail: `It uses Strength here, because ${ctx.scores.str} beats your Dexterity of ${ctx.scores.dex}. That works, but you are paying for a finesse property you never use.`,
    });
  }

  // --- damage ---------------------------------------------------------------
  const breakEven = ctx.dpr.powerAttackBreakEven;
  if (breakEven !== undefined) {
    const feat = ctx.featIds.has('great-weapon-master') ? 'Great Weapon Master' : 'Sharpshooter';
    if (breakEven < ctx.dpr.targetAc) {
      findings.push({
        severity: 'info',
        title: `${feat}'s −5/+10 is not paying off at AC ${ctx.dpr.targetAc}`,
        detail: `It beats a straight attack up to AC ${breakEven}, and this character's level usually faces AC ${ctx.dpr.targetAc}. The feat is still worth having for softer targets and when you have advantage.`,
        fix: 'Take the −5 only against lightly armoured enemies, or find a source of advantage.',
      });
    } else {
      findings.push({
        severity: 'good',
        title: `${feat} is paying off`,
        detail: `The −5/+10 beats a straight attack up to AC ${breakEven}, comfortably above the AC ${ctx.dpr.targetAc} this character usually faces.`,
      });
    }
  }

  findings.push(...spellcastingFindings(ctx));

  return findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/**
 * What a knowledgeable player would flag about a caster's spell list. All of it
 * is silent for a character who does not cast, which is most of the reason it
 * is a separate function rather than another block above.
 */
function spellcastingFindings(ctx: BuildContext): Finding[] {
  const findings: Finding[] = [];
  const casting = ctx.spellcasting;

  // A spell left over from a class this character no longer has is worth
  // flagging precisely *because* they no longer cast - that is the case where
  // it is most likely to be a leftover nobody noticed.
  if (casting.illegal.length) {
    findings.push({
      severity: 'error',
      title: `${casting.illegal.length} spell${
        casting.illegal.length === 1 ? ' is' : 's are'
      } not on a list this character can use`,
      detail: `${casting.illegal
        .map((s) => s.name)
        .join(', ')} came from a class or a slot level this build no longer has.`,
      fix: 'The Spells panel lists them at the top with a Remove button.',
    });
  }

  if (!casting.casts) return findings;

  const chosen = casting.chosen;

  /*
    A pick your subclass hands over anyway.

    `granted` excludes anything already recorded as a pick, so this reads the
    subclass lists directly rather than the resolved grant - the collision is
    exactly the case the resolved list hides. Same shape as "Athletics is
    granted twice" in the proficiency section, and the same reason: a pick
    spent on something you already have buys nothing.
  */
  const grantedIds = new Set(
    ctx.slices.flatMap((slice) =>
      (slice.subclass?.spells ?? [])
        .filter((grant) => slice.entry.level >= grant.level && ctx.build.ruleset === '2014')
        .flatMap((grant) => grant.ids),
    ),
  );
  const wasted = chosen.filter((spell) => grantedIds.has(spell.id));
  if (wasted.length) {
    const names = wasted.map((s) => s.name).join(', ');
    findings.push({
      severity: 'warning',
      title: `${names} ${wasted.length === 1 ? 'is' : 'are'} already granted by your subclass`,
      detail: `Your subclass hands ${wasted.length === 1 ? 'this' : 'these'} over always prepared and free of your usual count, so recording ${wasted.length === 1 ? 'it' : 'them'} as a pick spends ${wasted.length === 1 ? 'a slot' : 'slots'} on ${wasted.length === 1 ? 'a spell' : 'spells'} you already have.`,
      fix: 'Drop it in the Spells panel and spend the pick on something else.',
    });
  }

  // --- picks left on the table ---------------------------------------------
  if (casting.openCantrips > 0) {
    findings.push({
      severity: 'error',
      title: `${casting.openCantrips} cantrip${casting.openCantrips === 1 ? '' : 's'} not chosen`,
      alsoShownAs: 'section-badge',
      detail: `This character knows ${casting.cantripsKnown} cantrips and only ${
        casting.cantripsKnown - casting.openCantrips
      } are recorded. Cantrips cost nothing to cast, so an empty pick is pure loss.`,
      fix: 'Pick them in the Spells panel; the list is ranked for this build.',
    });
  }

  if (casting.openSpells > 0) {
    const known = casting.spellsKnown !== null;
    findings.push({
      severity: known ? 'error' : 'warning',
      title: `${casting.openSpells} spell${casting.openSpells === 1 ? '' : 's'} not ${
        known ? 'chosen' : 'prepared'
      }`,
      detail: known
        ? `This character knows ${casting.spellsKnown} spells and only ${
            (casting.spellsKnown ?? 0) - casting.openSpells
          } are recorded. Spells known are permanent picks, so they are worth getting right.`
        : `This character prepares ${casting.spellsPrepared} spells a day and only ${
            (casting.spellsPrepared ?? 0) - casting.openSpells
          } are recorded. Preparation changes daily, so this is a record-keeping gap rather than a mistake.`,
      fix: 'Pick them in the Spells panel.',
      alsoShownAs: 'section-badge',
    });
  }

  // A book caster's book has no ceiling; what is capped is how much of it is
  // live today, which is a different number and a different question.
  if (casting.openPrepared > 0) {
    findings.push({
      severity: 'warning',
      title: `${casting.openPrepared} more ${casting.openPrepared === 1 ? 'spell' : 'spells'} could be prepared`,
      detail: `This character prepares ${casting.spellsPrepared} a day and has ${casting.prepared.length} marked. Preparation changes daily, so this is a record-keeping gap rather than a mistake.`,
      fix: 'Tick them in the Spells panel; the book is everything you have copied, and the ticks are what is live today.',
      alsoShownAs: 'section-badge',
    });
  }

  // --- damage cantrip -------------------------------------------------------
  const fullCaster = ctx.castingTypes.includes('full') || ctx.castingTypes.includes('pact');
  const hasDamageCantrip = chosen.some((s) => s.level === 0 && s.damage);
  if (fullCaster && casting.cantripsKnown > 0 && !hasDamageCantrip && chosen.some((s) => s.level === 0)) {
    findings.push({
      severity: 'warning',
      title: 'No damage cantrip',
      detail:
        'Every cantrip recorded here is a utility spell. A full caster runs out of slots long before the day ends, and an at-will attack is what fills the rounds in between.',
      fix: 'Take one damage cantrip - the Spells panel ranks them for this build.',
    });
  }

  // --- concentration --------------------------------------------------------
  const concentrators = chosen.filter((s) => s.concentration);
  if (concentrators.length > 2) {
    findings.push({
      severity: 'info',
      title: `${concentrators.length} concentration spells, and you can hold one`,
      detail: `${concentrators
        .slice(0, 3)
        .map((s) => s.name)
        .join(', ')}${
        concentrators.length > 3 ? ' and others' : ''
      } all need concentration, so only one can ever be up. A couple of options is sensible; a list made mostly of them is slots you cannot spend.`,
    });
  }

  // --- Twinned Spell with nothing to twin -----------------------------------
  if (ctx.build.classOptionIds.includes('twinned-spell')) {
    const twinnable = chosen.filter(
      (s) => s.level > 0 && (s.damage?.targets ?? 1) === 1 && s.castingTime !== 'reaction',
    );
    if (!twinnable.length) {
      findings.push({
        severity: 'warning',
        title: 'Twinned Spell with nothing worth twinning',
        detail:
          'Twinned Spell only works on a spell that targets exactly one creature. Nothing on this list qualifies, so the Metamagic pick is currently doing nothing.',
        fix: 'Add a single-target spell, or swap Twinned Spell for another Metamagic option.',
      });
    }
  }

  // --- multiclass slots -----------------------------------------------------
  for (const note of casting.notes) {
    findings.push({
      severity: 'info',
      title: 'How this character gets slots',
      detail: note,
    });
  }

  return findings;
}
