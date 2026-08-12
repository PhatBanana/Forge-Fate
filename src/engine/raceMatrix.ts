import { ABILITIES, ABILITY_NAMES } from '../types';
import type { CharClass, ClassId, Race, Rating, Ruleset, TraitTag } from '../types';
import { CLASSES, classesFor } from '../data/classes';
import { racesFor } from '../data/races';
import {
  TRAIT_SCALE,
  byQuality,
  choiceAbilityFit,
  fixedAbilityFit,
  needsFor,
  primaryNames,
  ratingFor,
  ratingForTraitsOnly,
} from './matrix';
import type { Cell, ClassNeeds } from './matrix';

/**
 * Species x class. Under 2014 a cell's score is the lineage's ability increases
 * plus its traits plus a curated adjustment; under 2024 species grant no
 * increases at all, so only traits and curation are left and the cell says so.
 */

function asiScore(race: Race, klass: CharClass): { score: number; reasons: string[] } {
  const fixed = fixedAbilityFit(race.asi, klass);
  const parts = [...fixed.parts];
  let score = fixed.score;
  let floating = false;

  if (race.flexibleAsi) {
    const choices = ABILITIES.filter((a) => !race.flexibleAsi!.exclude?.includes(a));
    const flexible = choiceAbilityFit(race.flexibleAsi.amounts, choices, klass);
    score += flexible.score;
    parts.push(...flexible.parts);
    floating = true;
  }

  const matched = parts.length ? parts.join(', ') : 'no ability increases';
  // Lineages with floating increases are rated as if a player placed them well,
  // which is what a player would do - but say so rather than implying the
  // rating read anyone's actual picks.
  const caveat = floating ? ' (floating increases, rated as placed for best effect)' : '';
  return {
    score,
    reasons: [
      score >= 6
        ? `${matched}${caveat} lands on ${klass.name}'s ${primaryNames(klass)} priority.`
        : `${matched}${caveat} — only a partial match for a class that wants ${primaryNames(klass)}.`,
    ],
  };
}

function traitScore(race: Race, klass: CharClass, needs: ClassNeeds): { score: number; reasons: string[] } {
  const tags = new Set<TraitTag>();
  for (const trait of race.traits) for (const tag of trait.tags ?? []) tags.add(tag);

  let score = 0;
  const reasons: string[] = [];
  const add = (amount: number, why: string) => {
    score += amount;
    reasons.push(why);
  };

  if (tags.has('bonus-feat')) {
    add(needs.featHungry ? 4.5 : 3, 'A feat at 1st level is the biggest single power spike available at character creation.');
  }
  if (tags.has('armor-prof') && needs.armorStarved) {
    add(3.5, 'Medium armor proficiency fixes this class\'s worst structural weakness.');
  }
  if (tags.has('light-armor-prof') && needs.armorStarved) {
    add(1.5, 'Light armor proficiency, worth about +2 AC on an otherwise unarmored class.');
  }
  if (tags.has('natural-armor') && needs.unarmoredAc) {
    add(2, 'Natural armor gives a usable AC without spending anything.');
  }
  if (tags.has('flight')) {
    add(3, 'Flight bypasses melee entirely and solves most terrain problems.');
  }
  if (tags.has('advantage-saves')) add(1.5, 'Advantage on saves against common lockout effects.');
  if (tags.has('save-reroll')) add(2, 'Reroll effects convert directly into fewer catastrophic turns.');
  if (tags.has('resistance')) add(1, 'Damage resistance is always live.');
  if (tags.has('extra-hp') && needs.frail) add(1.5, 'Extra hit points matter most on a small hit die.');
  if (tags.has('darkvision')) add(0.8, 'Darkvision, which most parties need at least one of.');
  if (tags.has('mobility')) add(needs.melee || needs.stealthy ? 1.8 : 0.8, 'Above-average mobility.');
  if (tags.has('stealth') && needs.stealthy) add(1.5, 'Built-in stealth support.');
  if (tags.has('skill-prof')) add(needs.social || needs.stealthy ? 1.2 : 0.6, 'Free skill proficiencies.');
  if (tags.has('expertise')) add(1.5, 'Free expertise.');
  if (tags.has('weapon-prof') && needs.weaponStarved) add(1.5, 'Weapon proficiencies this class does not normally get.');
  if (tags.has('free-spells')) add(1, 'Free spells that cost no slots or preparation.');
  if (tags.has('reach') && needs.melee) add(2, 'Extra melee reach, which stacks with polearms.');
  if (tags.has('extra-attack-ish')) add(1.5, 'A free extra attack or an at-will advantage source.');
  if (tags.has('natural-weapon') && klass.id === 'monk') add(1, 'Natural weapons work with Martial Arts.');
  if (tags.has('social') && needs.social) add(1, 'Social tools that match the class fantasy.');
  if (tags.has('carry-capacity') && needs.melee) add(0.4, 'Powerful Build.');
  if (tags.has('no-sleep')) add(0.4, 'Reduced or eliminated sleep requirement.');
  if (tags.has('survivability')) add(1.5, 'A once-per-day save from unconsciousness.');
  if (tags.has('action-economy')) add(1.5, 'Free action economy or initiative.');
  if (tags.has('swim')) add(0.3, 'Swim speed.');

  const casting = needs.castingAbility;
  if (casting) {
    const tag = `innate-caster-${casting}` as TraitTag;
    if (tags.has(tag)) {
      add(1, `Innate spells use ${ABILITY_NAMES[casting]}, the same stat this class already maxes.`);
    }
  }

  if (race.speed >= 35) add(1, `${race.speed} ft. base speed.`);
  if (race.speed <= 25) add(-1, `${race.speed} ft. base speed is a real tactical cost.`);
  if (race.bonusSkills) add(race.bonusSkills * 0.5, `${race.bonusSkills} extra skill proficiencies.`);

  return { score: score * TRAIT_SCALE, reasons };
}

interface Override {
  race: string;
  classes: ClassId[];
  bonus?: number;
  rating?: Rating;
  note: string;
}

/** The pairings that have a reputation, with the reason spelled out. */
const OVERRIDES: Override[] = [
  { race: 'dwarf-mountain', classes: ['wizard'], rating: 'sky', bonus: 4, note: 'The classic. Medium armor plus a shield puts a d6 caster at AC 18-19 without touching DEX, and +2 CON keeps concentration up. You pay for it with a wasted +2 STR and 25 ft. speed.' },
  { race: 'dwarf-mountain', classes: ['sorcerer'], bonus: 1.5, note: 'Same trick as the Wizard, but Sorcerers get less from it because their AC problem is smaller than their spells-known problem.' },
  { race: 'dwarf-hill', classes: ['cleric', 'druid'], bonus: 1.5, note: '+2 CON / +1 WIS plus a hit point every level. The most durable WIS caster in the PHB.' },
  { race: 'human-variant', classes: ['fighter', 'ranger', 'rogue', 'paladin', 'barbarian', 'monk'], rating: 'sky', bonus: 1, note: 'Sharpshooter, Great Weapon Master or Polearm Master online at level 1 is worth roughly four levels of progression for a martial.' },
  { race: 'human-variant', classes: ['warlock', 'sorcerer', 'bard', 'wizard', 'cleric', 'druid', 'artificer'], bonus: 0.5, note: 'A level 1 feat is always strong, but casters get less from it than martials do - your class features are already the payload.' },
  { race: 'custom-lineage', classes: ['fighter', 'ranger', 'rogue', 'paladin', 'barbarian', 'monk', 'warlock', 'sorcerer', 'bard', 'wizard', 'cleric', 'druid', 'artificer'], bonus: 1, note: 'A clean +2 wherever you want plus a level 1 feat. Mechanically the least wasteful origin in the game if your table allows Tasha\'s.' },
  { race: 'half-elf', classes: ['bard', 'sorcerer', 'warlock', 'paladin'], rating: 'sky', note: '+2 CHA / +1 / +1 plus two free skills is the best CHA statline printed, and it unlocks Elven Accuracy.' },
  { race: 'elf-wood', classes: ['ranger', 'monk', 'druid'], rating: 'sky', note: '+2 DEX / +1 WIS is exactly the spread these classes want, and 35 ft. speed with free natural-terrain stealth is pure upside.' },
  { race: 'elf-high', classes: ['wizard'], bonus: 1.5, note: '+2 DEX / +1 INT and a free wizard cantrip. Take Booming Blade if your table allows it, otherwise Fire Bolt for a free attack option.' },
  { race: 'elf-high', classes: ['fighter', 'rogue'], bonus: 1.5, note: 'The free cantrip is the point: Booming Blade turns an Eldritch Knight or Arcane Trickster into a real gish from level 1.' },
  { race: 'elf-drow', classes: ['rogue', 'warlock'], bonus: 1.5, note: 'Faerie Fire is a free advantage engine for your whole party. Sunlight Sensitivity is the price - talk to your DM about how much of the campaign is outdoors.' },
  { race: 'halfling-lightfoot', classes: ['rogue'], rating: 'sky', note: 'Lucky rerolls the natural 1s that cost you a whole turn of Sneak Attack, and Naturally Stealthy lets you hide behind the party fighter every round.' },
  { race: 'halfling-stout', classes: ['rogue', 'ranger', 'fighter'], bonus: 1, note: 'Lucky plus poison resistance. The most durable Small chassis for a DEX martial.' },
  { race: 'goliath', classes: ['barbarian', 'fighter'], rating: 'sky', bonus: 1, note: "Stone's Endurance is a free damage reduction every short rest on top of rage resistance. The toughest STR frame available." },
  { race: 'half-orc', classes: ['barbarian'], bonus: 1.5, note: 'Savage Attacks stacks with Brutal Critical, and Relentless Endurance is a free extra life every long rest.' },
  { race: 'orc', classes: ['barbarian', 'fighter', 'paladin'], bonus: 1.5, note: 'Bonus action Dash plus temporary HP several times a day. Strictly better than Half-Orc for closing distance.' },
  { race: 'yuan-ti', classes: ['sorcerer', 'warlock', 'bard'], rating: 'sky', note: 'Magic Resistance - advantage on every saving throw against every spell - is a monster trait handed to a player. Many DMs ban it, so ask first.' },
  { race: 'satyr', classes: ['bard', 'sorcerer', 'warlock', 'paladin'], rating: 'sky', note: 'Magic Resistance, 35 ft. speed, +2 CHA and two free skills. If Theros is on the table it beats Half-Elf outright.' },
  { race: 'kalashtar', classes: ['cleric', 'druid', 'monk'], rating: 'sky', note: 'Advantage on every WIS save patches the most-targeted save in the game, on the classes that also want +2 WIS.' },
  { race: 'warforged', classes: ['fighter', 'paladin', 'barbarian', 'artificer', 'cleric'], rating: 'sky', note: '+1 AC on top of any armor, a floating +1, and effective immunity to the attrition rules. The most efficient frontliner origin printed.' },
  { race: 'gnome-rock', classes: ['wizard', 'artificer'], rating: 'sky', bonus: 3, note: '+2 INT / +1 CON and Gnome Cunning - advantage on INT, WIS and CHA saves against magic, which is where a d6 caster actually dies.' },
  { race: 'gnome-forest', classes: ['wizard'], bonus: 1, note: 'Gnome Cunning plus +1 DEX for AC and initiative. Slightly better defence than Rock Gnome, slightly worse HP.' },
  { race: 'hobgoblin', classes: ['wizard', 'artificer'], bonus: 1.5, note: '+2 CON / +1 INT with martial weapons and light armor. The tankiest INT caster if you can live with the smaller INT bonus.' },
  { race: 'lizardfolk', classes: ['druid', 'barbarian'], bonus: 1.5, note: 'AC 13 + DEX natural armor beats hide armor, and a bonus action bite with temp HP is real action economy for a Druid out of Wild Shape.' },
  { race: 'firbolg', classes: ['druid', 'cleric'], rating: 'sky', note: '+2 WIS with a bonus action invisibility every short rest. The best escape button on a WIS caster.' },
  { race: 'tabaxi', classes: ['rogue', 'monk', 'ranger'], rating: 'sky', note: 'Feline Agility doubles your speed on demand. On a Rogue with Cunning Action you can cross most battlefields, attack, and be gone.' },
  { race: 'goblin', classes: ['rogue', 'ranger'], rating: 'sky', note: 'Nimble Escape is Cunning Action at level 1. On a Rogue that means Disengage and Hide in the same turn as an attack.' },
  { race: 'bugbear', classes: ['rogue', 'barbarian', 'fighter'], rating: 'sky', note: 'Surprise Attack is +2d6 on your opening hit, and Long-Limbed gives a Medium creature 10 ft. reach - 15 ft. with Polearm Master.' },
  { race: 'kobold', classes: ['rogue', 'ranger', 'fighter'], bonus: 2, note: 'Pack Tactics is at-will advantage whenever an ally is adjacent, which is the strongest offensive racial trait in the game. Sunlight Sensitivity and the 2014 printing\'s -2 STR are the costs.' },
  { race: 'aasimar-protector', classes: ['paladin', 'warlock', 'cleric'], rating: 'sky', note: 'Flight from level 3, even for one minute per day, plus bonus radiant damage on every attack during it.' },
  { race: 'aasimar-scourge', classes: ['sorcerer', 'warlock', 'bard'], bonus: 1, note: '+2 CHA / +1 CON is the textbook caster statline; treat Radiant Consumption as an emergency button, not a rotation.' },
  { race: 'triton', classes: ['paladin'], bonus: 1, note: 'Three +1s suit a MAD Paladin, and free Fog Cloud at level 1 is genuine battlefield control from a class that has none.' },
  { race: 'dragonborn', classes: ['paladin', 'fighter'], bonus: 0.5, note: 'The +2 STR / +1 CHA statline is right for a Paladin, but the breath weapon stops scaling after tier 1. Take it for the theme.' },
  { race: 'owlin', classes: ['ranger', 'rogue', 'warlock', 'wizard', 'sorcerer'], rating: 'sky', note: 'Permanent flight plus floating ability scores. Expect a DM conversation - flight at level 1 removes a lot of encounter design.' },
  { race: 'fairy', classes: ['wizard', 'sorcerer', 'bard', 'warlock', 'druid'], bonus: 2, note: 'Flight with no daily limit and no armor restriction, plus free Faerie Fire. Extremely strong and correspondingly likely to be restricted.' },
  { race: 'dhampir', classes: ['monk', 'rogue'], rating: 'sky', note: '35 ft. speed, a climb speed that works on ceilings, floating ASIs and a self-healing bite. Almost perfect for a mobile skirmisher.' },
  { race: 'harengon', classes: ['rogue', 'monk', 'ranger', 'wizard'], bonus: 1, note: 'Proficiency bonus to initiative is worth more than it looks - acting first is the single highest-leverage thing any character does.' },
  { race: 'changeling', classes: ['bard', 'rogue', 'warlock'], bonus: 1.5, note: 'At-will shapeshifting with no action cost, no concentration and no spell slot. Nothing else in the game does infiltration this cheaply.' },
  { race: 'genasi-fire', classes: ['wizard', 'artificer'], bonus: 0.5, note: '+2 CON / +1 INT with fire resistance. A quietly durable caster.' },
  { race: 'genasi-earth', classes: ['ranger', 'rogue', 'druid'], bonus: 0.5, note: 'Free Pass without Trace once a day is a +10 to the whole party\'s stealth.' },
  { race: 'reborn', classes: ['wizard', 'cleric', 'druid', 'sorcerer', 'bard', 'warlock', 'fighter', 'rogue'], bonus: 1, note: 'Floating ability increases, advantage on death saves, and a d6 on any check you lack proficiency in. Flexible and quietly strong.' },
  { race: 'human', classes: ['monk', 'paladin'], bonus: 1, note: '+1 to everything is only good when the class is MAD - and Monk and Paladin are the two most MAD classes in the game.' },
  { race: 'tiefling', classes: ['warlock', 'sorcerer'], bonus: 0.5, note: 'Fire resistance and free Darkness pair with Devil\'s Sight for a build that fights blind enemies all day.' },
];

export function rateCell(race: Race, klass: CharClass, ruleset: Ruleset): Cell {
  const needs = needsFor(klass);
  const traits = traitScore(race, klass, needs);
  const override = OVERRIDES.find((o) => o.race === race.id && o.classes.includes(klass.id));

  // 2024 species grant no ability increases, so the biggest differentiator is
  // simply absent. Say so rather than quietly rating on a smaller scale.
  const asi =
    ruleset === '2024'
      ? {
          score: 0,
          reasons: [
            `Under 2024 rules a species grants no ability increases, so this rating reflects traits alone — your background carries the ${primaryNames(klass)} increases a ${klass.name} wants.`,
          ],
        }
      : asiScore(race, klass);

  const score = asi.score + traits.score + (override?.bonus ?? 0);

  return {
    originId: race.id,
    classId: klass.id,
    score,
    // Curated verdicts are written about 2014 lineages and assume their
    // increases, so they do not carry over to 2024.
    rating:
      ruleset === '2024'
        ? ratingForTraitsOnly(score)
        : (override?.rating ?? ratingFor(score)),
    reasons: [...asi.reasons, ...traits.reasons.slice(0, 4)],
    note: ruleset === '2014' ? override?.note : undefined,
  };
}

const caches = new Map<Ruleset, Map<string, Cell>>();

function key(raceId: string, classId: ClassId): string {
  return `${raceId}|${classId}`;
}

function ensureCache(ruleset: Ruleset): Map<string, Cell> {
  const existing = caches.get(ruleset);
  if (existing) return existing;
  const cache = new Map<string, Cell>();
  for (const race of racesFor(ruleset)) {
    for (const klass of CLASSES) {
      cache.set(key(race.id, klass.id), rateCell(race, klass, ruleset));
    }
  }
  caches.set(ruleset, cache);
  return cache;
}

export function cellFor(raceId: string, classId: ClassId, ruleset: Ruleset = '2014'): Cell | undefined {
  return ensureCache(ruleset).get(key(raceId, classId));
}

/** Top lineages for a class, best first. */
export function bestRacesFor(classId: ClassId, limit = 8, ruleset: Ruleset = '2014'): Cell[] {
  const cells = racesFor(ruleset)
    .map((r) => cellFor(r.id, classId, ruleset))
    .filter((c): c is Cell => !!c);
  return cells.sort(byQuality).slice(0, limit);
}

/**
 * Every offered class for a lineage, best first.
 *
 * `classesFor` rather than raw `CLASSES`, for the same reason `bestRacesFor`
 * asks `racesFor`: the suggestion list is an *offer*, so it respects the
 * ruleset and the originals switch. Iterating `CLASSES` here would have
 * suggested the Artificer to a 2024 table and a Forge class with the switch
 * off - the caller used to paper over it by passing the offered count as a
 * limit, which trims the list without cleaning the pool.
 */
export function bestClassesFor(raceId: string, ruleset: Ruleset = '2014'): Cell[] {
  const cells = classesFor(ruleset)
    .map((c) => cellFor(raceId, c.id, ruleset))
    .filter((c): c is Cell => !!c);
  return cells.sort(byQuality);
}

export type { Cell } from './matrix';
