/**
 * The bestiary, loaded only when somebody opens the DM's side of the app.
 *
 * ## Why this is a dynamic import
 *
 * 334 stat blocks come to ~590 kB, second only to the rules text and larger
 * than every rules table put together. A player who never runs a game must not
 * pay for it, so it lives in its own chunk fetched the first time the Table tab
 * asks for a monster, exactly like `rulesText.ts`. `vite.config.ts` names the
 * JSON in the same `manualChunks` exclusion, and `scripts/bundle-budget.mjs`
 * fails the build if the `data` chunk grows - because losing that exclusion
 * would put half a megabyte in front of every visitor and nothing else would
 * notice.
 *
 * ## Why there are no 2024 monsters
 *
 * There is no licensed structured source for SRD 5.2's bestiary. The 2024
 * endpoint carries three creatures - an aboleth and two dragons - so a table
 * playing 2024 gets the SRD 5.1 monsters and is told why. That is the same
 * answer the full rules text gives for the entries it has no licence to, and
 * for the same reason: an honest gap beats an invented table.
 *
 * In practice this costs a 2024 table very little. Monsters changed less
 * between the editions than characters did, and a DM adjusts a stat block at
 * the table anyway - which is what `hp` being editable in the tracker is for.
 */

/** What a stat block says, in the shapes the app reads rather than the source's. */
export interface MonsterAbility {
  name: string;
  desc: string;
  /** Present on an attack. */
  toHit?: number;
  /** One entry per damage type, each with dice `parseNotation` can read. */
  damage?: { dice: string; type: string }[];
  save?: { ability: string; dc: number; onSuccess: string };
  /** "Recharge 5-6", "3/Day" - shown, not enforced. */
  usage?: string;
  /**
   * What a Multiattack is made of, on the Multiattack action itself.
   *
   * Present on 113 of the 148 monsters that have one; the rest state it only
   * in prose, which is not something to parse. Each `name` resolves to another
   * entry in the same `actions` list, so the damage model can read a round
   * rather than a swing.
   */
  multiattack?: { name: string; count: number }[];
}

export interface Monster {
  id: string;
  name: string;
  size: string;
  type: string;
  subtype: string | null;
  alignment: string;
  ac: number;
  /** "natural armor", "armor" - what the number comes from. */
  acNote: string | null;
  /** The average printed on the stat block. */
  hp: number;
  /** "19d12+133", so hit points can be rolled instead of taken as printed. */
  hpRoll: string | null;
  speed: Record<string, number>;
  hover: boolean;
  scores: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  /** Only the ones it is proficient in, by ability. */
  saves: Record<string, number>;
  skills: Record<string, number>;
  vulnerable: string[];
  resist: string[];
  immune: string[];
  /** Condition ids, which match `data/conditions.ts`. */
  conditionImmunities: string[];
  senses: Record<string, number | string>;
  passivePerception: number | null;
  languages: string;
  cr: number;
  xp: number;
  proficiencyBonus: number | null;
  traits: MonsterAbility[];
  actions: MonsterAbility[];
  legendary: MonsterAbility[];
  reactions: MonsterAbility[];
}

let pending: Promise<Monster[]> | null = null;

/**
 * Fetches the bestiary chunk once; every later caller gets the same promise.
 *
 * The cast goes through `unknown` deliberately. TypeScript infers a literal
 * type per record, so 334 stat blocks become a 334-way union in which a speed
 * object that happens to have no `burrow` key carries `burrow?: undefined` -
 * which is not assignable to `Record<string, number>` however true it is. That
 * inferred type describes this snapshot of the data rather than the shape the
 * app depends on, so `Monster` is the contract and `monsters.test.ts` is what
 * enforces it: every field the UI reads is asserted there, across all 334.
 */
export function loadMonsters(): Promise<Monster[]> {
  pending ??= import('./srd/srd-2014-monsters.json').then(
    (module) => (module.default as unknown as { records: Monster[] }).records,
  );
  return pending;
}

/**
 * How a challenge rating is written. The three below one are fractions on the
 * page and would otherwise print as 0.125.
 */
export function formatCr(cr: number): string {
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return String(cr);
}

/** An ability modifier from a score, the same rule the character engine uses. */
export const monsterMod = (score: number): number => Math.floor((score - 10) / 2);

/**
 * Initiative modifier. A monster's is its Dexterity modifier and nothing else -
 * none of the SRD stat blocks carry an initiative bonus of their own.
 */
export const initiativeMod = (monster: Monster): number => monsterMod(monster.scores.dex);

/** "30 ft., fly 80 ft." - walking first because that is how a stat block reads. */
export function formatSpeed(monster: Monster): string {
  const parts: string[] = [];
  if (monster.speed.walk !== undefined) parts.push(`${monster.speed.walk} ft.`);
  for (const [kind, value] of Object.entries(monster.speed)) {
    if (kind === 'walk') continue;
    parts.push(`${kind} ${value} ft.${kind === 'fly' && monster.hover ? ' (hover)' : ''}`);
  }
  return parts.join(', ');
}

/** The one line a row in the turn order needs: what it takes to hit it. */
export function monsterSummary(monster: Monster): string {
  const dex = monsterMod(monster.scores.dex);
  return `AC ${monster.ac} · ${monster.hp} hp · CR ${formatCr(monster.cr)} · Dex ${dex >= 0 ? '+' : ''}${dex}`;
}

/**
 * What a usage string means, so the tracker can count it.
 *
 * The distillation normalised these to two forms - "Recharge 5-6" and
 * "3/Day" - plus "Recharges after a Short or Long Rest", which plays as
 * 1/Day at the table. Anything else is prose, shown and not counted.
 */
export function parseUsage(
  usage: string | undefined,
): { kind: 'recharge'; min: number } | { kind: 'perDay'; times: number } | null {
  if (!usage) return null;
  const recharge = /^Recharge (\d)/.exec(usage);
  if (recharge) return { kind: 'recharge', min: Number(recharge[1]) };
  const perDay = /^(\d+)\/Day/.exec(usage);
  if (perDay) return { kind: 'perDay', times: Number(perDay[1]) };
  if (/rest/i.test(usage)) return { kind: 'perDay', times: 1 };
  return null;
}

/**
 * What a legendary action costs: 1 unless the name says otherwise, the way
 * the books write it - "Wing Attack (Costs 2 Actions)".
 */
export function legendaryCost(ability: MonsterAbility): number {
  const match = /\(Costs (\d) Actions\)/i.exec(ability.name);
  return match ? Number(match[1]) : 1;
}

/**
 * Search over name and type, so "dragon" finds all of them and "red dragon"
 * narrows it. Every term must match somewhere, which is what makes a second
 * word useful rather than a way to match more.
 */
export function searchMonsters(monsters: Monster[], query: string): Monster[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return monsters;
  return monsters.filter((monster) => {
    const haystack = `${monster.name} ${monster.type} ${monster.subtype ?? ''}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
