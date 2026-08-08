/**
 * What the fight was worth, and who it was worth it to.
 *
 * The two halves of this app have never spoken after a fight. The battle
 * screen tracks hit points on the same `PlayState` the sheet does, so wounds
 * carry - and then the fight ends and *nothing else* does. Every stat block
 * has carried an `xp` since §DM-1 and the only thing that ever read it was the
 * forecast, to say how hard a fight looked before it happened. Afterwards the
 * number was thrown away and the DM did the arithmetic on paper, which is
 * exactly the arithmetic a computer should be doing.
 *
 * ## What this does not do
 *
 * It does not tell you when to level up. The XP-per-level table is not in the
 * data this project ships, and inventing one from memory would put a number on
 * a character sheet that no source in this repository backs - which is the
 * thing the whole provenance discipline exists to prevent. So the app counts
 * what it can count and leaves the threshold to the table, where milestone
 * levelling puts it anyway.
 *
 * It does not roll treasure either. The hoard tables are DMG content this
 * project does not reproduce, and the same reasoning that keeps the encounter
 * thresholds out keeps them out.
 */

/** One kind of thing that was beaten, and what the stat block says it is worth. */
export interface Defeat {
  name: string;
  /** How many of them went down. */
  count: number;
  /** Experience for one of them. */
  each: number;
}

export interface Spoils {
  defeated: Defeat[];
  /** Everything the defeated were worth, together. */
  total: number;
  /** How many characters split it. */
  share: number;
  /** What each of them gets, rounded down - the remainder is the table's. */
  each: number;
}

/** The shapes this needs off a fight, named so the engine imports nothing. */
export interface Fallen {
  name: string;
  xp: number;
}

/**
 * Add up a fight.
 *
 * Split between everyone who was *in* the fight rather than everyone still
 * standing, because a character who went down at round two was still there for
 * it - a party that gained by losing someone would be a rule nobody plays.
 *
 * Rounded down, and the remainder simply goes nowhere. Distributing it would
 * mean picking a character to favour, and the amount is a rounding error.
 */
export function spoilsFor(fallen: Fallen[], partySize: number): Spoils {
  const byName = new Map<string, Defeat>();
  for (const one of fallen) {
    const seen = byName.get(one.name);
    if (seen) seen.count += 1;
    else byName.set(one.name, { name: one.name, count: 1, each: one.xp });
  }
  const defeated = [...byName.values()].sort(
    (a, b) => b.each * b.count - a.each * a.count || a.name.localeCompare(b.name),
  );
  const total = defeated.reduce((sum, d) => sum + d.each * d.count, 0);
  const share = Math.max(0, partySize);
  return { defeated, total, share, each: share ? Math.floor(total / share) : 0 };
}

/** How it reads in the debrief and in the log. */
export function describeSpoils(spoils: Spoils): string {
  if (!spoils.defeated.length) return 'Nothing was defeated.';
  const list = spoils.defeated
    .map((d) => (d.count > 1 ? `${d.count}× ${d.name}` : d.name))
    .join(', ');
  return `${list} — ${spoils.total} XP, ${spoils.each} each across ${spoils.share}.`;
}
