import type { Build } from '../types';
import { WEAPONS_BY_ID, weaponsFor } from '../data/weapons';
import { resolveStartingItem, startingEquipmentFor } from '../data/startingEquipment';
import type { Resolved, StartingEquipment } from '../data/startingEquipment';

/**
 * Turning a chosen starting kit into a character.
 *
 * The data layer says what the SRD offers; this says what happens when
 * somebody takes it. Kept apart because the first is a fact and the second is
 * a set of decisions - which of three weapons goes in your hand, what to do
 * with a shield you were also given - and those decisions want to be visible
 * and testable rather than buried in a click handler.
 */

/** One group's answer: which option, and what was picked inside it. */
export interface StartingChoice {
  /** Index into the group's `options`. */
  option: number;
  /** Chosen ids per pick in that option; the inner array is `pick.choose` long. */
  picks: string[][];
}

/** The default answer: the first option of every group, nothing picked yet. */
export function blankChoices(kit: StartingEquipment): StartingChoice[] {
  return kit.groups.map((group) => ({
    option: 0,
    picks: (group.options[0]?.picks ?? []).map((pick) => Array<string>(pick.choose).fill('')),
  }));
}

/**
 * Re-shape the picks when a different option is chosen.
 *
 * Each option carries its own picks, so the answers to the old one are not
 * answers to the new one and are dropped rather than carried across. Silently
 * keeping them would mean choosing "two martial weapons" after "a martial
 * weapon and a shield" left you holding one weapon and a stale second slot.
 */
export function chooseOption(
  kit: StartingEquipment,
  choices: StartingChoice[],
  groupIndex: number,
  optionIndex: number,
): StartingChoice[] {
  const option = kit.groups[groupIndex]?.options[optionIndex];
  if (!option) return choices;
  return choices.map((choice, i) =>
    i === groupIndex
      ? { option: optionIndex, picks: option.picks.map((p) => Array<string>(p.choose).fill('')) }
      : choice,
  );
}

export function setPick(
  choices: StartingChoice[],
  groupIndex: number,
  pickIndex: number,
  slot: number,
  id: string,
): StartingChoice[] {
  return choices.map((choice, i) => {
    if (i !== groupIndex) return choice;
    const picks = choice.picks.map((values, p) =>
      p === pickIndex ? values.map((value, s) => (s === slot ? id : value)) : values,
    );
    return { ...choice, picks };
  });
}

/** Whether every pick has been answered, so the kit can be taken. */
export function isComplete(choices: StartingChoice[]): boolean {
  return choices.every((choice) => choice.picks.every((values) => values.every(Boolean)));
}

/**
 * Everything the chosen kit contains, flattened.
 *
 * Unresolvable references are dropped rather than thrown on - the audit test
 * asserts there are none, so a survivor here means the source added something
 * mid-flight, and losing one line of a kit beats refusing to hand over any of
 * it.
 */
export function resolveKit(
  kit: StartingEquipment,
  choices: StartingChoice[],
  ruleset: Build['ruleset'],
): Resolved[] {
  const out: Resolved[] = [];
  const push = (resolved: Resolved | null) => {
    if (resolved) out.push(resolved);
  };

  for (const ref of kit.fixed) push(resolveStartingItem(ref, ruleset));

  kit.groups.forEach((group, i) => {
    const choice = choices[i];
    const option = group.options[choice?.option ?? 0];
    if (!option) return;
    for (const ref of option.items) push(resolveStartingItem(ref, ruleset));
    option.picks.forEach((_pick, p) => {
      for (const id of choice?.picks[p] ?? []) {
        if (id) push(resolveStartingItem({ index: id, name: id, quantity: 1 }, ruleset));
      }
    });
  });

  return out;
}

/**
 * Which of the weapons in a kit ends up in each hand.
 *
 * A kit can contain three or four weapons and the character has two hands, so
 * something has to choose. The rule is the one a player would use: the biggest
 * average damage goes in the main hand, and an off-hand weapon is only taken
 * if it is `light` - because a two-weapon fight needs two light weapons, and
 * putting a greatsword in the off hand would produce an attack line the rules
 * do not allow.
 *
 * A shield beats an off-hand weapon, since the kit that grants one says so
 * explicitly and AC is worth more than a d6.
 */
function handsFor(
  weapons: { id: string; quantity: number }[],
  shield: boolean,
  ruleset: Build['ruleset'],
): { mainHandId?: string; offHandId?: string } {
  const table = weaponsFor(ruleset);
  const held = weapons
    .map((w) => table.find((row) => row.id === w.id))
    .filter((w): w is NonNullable<typeof w> => Boolean(w));
  if (!held.length) return {};

  const average = (id: string) => {
    const w = WEAPONS_BY_ID[id] ?? held.find((h) => h.id === id);
    return w ? w.damage.count * ((w.damage.die + 1) / 2) : 0;
  };

  const ranked = [...held].sort((a, b) => average(b.id) - average(a.id));
  const mainHandId = ranked[0].id;
  if (shield) return { mainHandId };

  const offHand = ranked
    .slice(1)
    .find((w) => w.properties.includes('light') && ranked[0].properties.includes('light'));
  return { mainHandId, ...(offHand ? { offHandId: offHand.id } : {}) };
}

/**
 * Apply a chosen kit to a build.
 *
 * Replaces rather than adds: this is the answer to "what do I start with",
 * asked at 1st level, and merging it into whatever was already there would
 * make taking it twice quietly different from taking it once.
 *
 * Returns what it could not record alongside the build - see below.
 */
export function applyStartingEquipment(
  build: Build,
  choices: StartingChoice[],
): { build: Build; unrecorded: string[] } {
  const classId = build.classes[0]?.classId;
  const kit = classId ? startingEquipmentFor(classId, build.ruleset) : null;
  if (!kit) return { build, unrecorded: [] };

  const resolved = resolveKit(kit, choices, build.ruleset);
  const shield = resolved.some((r) => r.kind === 'shield');

  // 2024 hands over coin alongside the kit, and one option per class is coin
  // and nothing else.
  const gold = kit.groups.reduce(
    (sum, group, i) => sum + (group.options[choices[i]?.option ?? 0]?.gold ?? 0),
    0,
  );

  const weapons = resolved.flatMap((r) =>
    r.kind === 'weapon' ? [{ id: r.id, quantity: r.quantity }] : [],
  );
  const armor = resolved.find((r) => r.kind === 'armor');

  /*
    Gear is summed rather than listed, because a kit can name the same thing
    twice - the 2024 Rogue gets two daggers as separate lines - and an
    inventory with two "Dagger" rows is a bug report waiting to happen.
  */
  const gear = new Map<string, number>();
  for (const item of resolved) {
    if (item.kind === 'gear') gear.set(item.id, (gear.get(item.id) ?? 0) + item.quantity);
  }
  const hands = handsFor(weapons, shield, build.ruleset);

  /*
    What the kit contains and the character cannot record.

    A build holds two weapons - a main hand and an off hand - and the gear
    catalogue is equipment, not arms, so there is nowhere to put a spare. A
    Barbarian's kit is a greataxe, two handaxes and four javelins; two of those
    go in hands and the rest have no home in this model.

    Returned rather than dropped, so the panel can say so. Losing part of
    somebody's starting kit without mentioning it is the kind of quiet wrong
    answer this app exists not to give, and "your javelins are not tracked" is
    a fact a player can work with.
  */
  const held = new Set([hands.mainHandId, hands.offHandId].filter(Boolean));
  const unrecorded = resolved.flatMap((r) =>
    r.kind === 'weapon' && !held.has(r.id)
      ? [r.quantity > 1 ? `${r.name} ×${r.quantity}` : r.name]
      : [],
  );

  return {
    build: {
      ...build,
      weapons: { magicBonus: {}, ...hands },
      defenses: {
        ...build.defenses,
        armorId: armor?.kind === 'armor' ? armor.id : 'none',
        shield,
      },
      gear: [...gear].map(([gearId, quantity]) => ({ gearId, quantity })),
      coins: { ...build.coins, gp: build.coins.gp + gold },
    },
    unrecorded,
  };
}
