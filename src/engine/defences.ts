/**
 * Resistance, immunity and vulnerability, finally consulted.
 *
 * 165 of the 334 stat blocks carry these fields and nothing has ever read
 * them. A fire elemental took full damage from a wall of fire; a skeleton took
 * full damage from a club. Every strike has always carried a damage *type* and
 * the type was only ever printed. This is the same shape of defect as the
 * elevation layer before §26.2 - complete data, zero wiring - and it is worse,
 * because it is wrong on most attacks against half the bestiary.
 *
 * ## The qualified entries
 *
 * Nineteen distinct entries appear across the whole set. Twelve are a bare
 * damage type and decide themselves. Seven carry a qualifier the stat block
 * states in prose - "from nonmagical weapons", "that aren't silvered", "from
 * spells" - and those split into two kinds:
 *
 * - Ones this app **can** settle, because it knows whether the attack came
 *   from a magic weapon. A skeleton's resistance to nonmagical bludgeoning is
 *   a fact once you know the mace is mundane.
 * - Ones it **cannot**: whether a weapon is silvered or adamantine, whether
 *   the wielder is good, whether the damage came from a spell. Those are
 *   announced rather than applied, which is the register this app has used
 *   since §12 for exactly this situation - the log names the qualifier and the
 *   DM rules.
 *
 * Nothing here guesses. A qualifier the parser does not recognise makes the
 * whole entry advisory, so a data refresh that invents new prose degrades to
 * "tell the DM" rather than to a wrong number.
 */

/** What a qualifier depends on, when it depends on something. */
export type Qualifier =
  /** "from nonmagical weapons" - decidable, because magic weapons are known. */
  | 'nonmagical'
  /** Nonmagical *and* not silvered. The silver half is the DM's to say. */
  | 'nonmagical-not-silvered'
  /** Nonmagical *and* not adamantine. Same. */
  | 'nonmagical-not-adamantine'
  /** "damage from spells" - the battle does not tag a strike as a spell. */
  | 'from-spells'
  /** "from magic weapons wielded by good creatures" - alignment is the table's. */
  | 'good-wielder';

export interface ParsedDefence {
  /**
   * The damage types this entry covers, lower-cased. Empty when `allTypes`
   * is set, because some entries are about the *source* rather than the type.
   */
  types: string[];
  /**
   * True for an entry that names no type because it covers all of them -
   * "damage from spells" is a rakshasa's, and it is a defence against a
   * source rather than against a kind of hurt.
   */
  allTypes?: boolean;
  /** Absent for a bare type, which needs no ruling. */
  qualifier?: Qualifier;
  /** True when the parser did not understand it at all. */
  unknown?: boolean;
  /** The entry as written, for the log. */
  source: string;
}

const DAMAGE_TYPES = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
];

/**
 * Read one entry off a stat block.
 *
 * The qualifier is looked for before the types, because "that aren't
 * adamantine" also contains the word "nonmagical" and the narrower reading is
 * the right one.
 */
export function parseDefence(entry: string): ParsedDefence {
  const text = entry.toLowerCase();
  const types = DAMAGE_TYPES.filter((t) => text.includes(t));

  let qualifier: Qualifier | undefined;
  if (text.includes("aren't silvered")) qualifier = 'nonmagical-not-silvered';
  else if (text.includes("aren't adamantine")) qualifier = 'nonmagical-not-adamantine';
  else if (text.includes('good creatures')) qualifier = 'good-wielder';
  else if (text.includes('from spells')) qualifier = 'from-spells';
  else if (text.includes('nonmagical')) qualifier = 'nonmagical';

  /*
    An entry may name no type at all and still be a real defence: "damage from
    spells" covers every type and turns entirely on where the damage came
    from. Only prose with neither a type nor a qualifier is unreadable.
  */
  if (!types.length) {
    if (qualifier) return { types: [], allTypes: true, qualifier, source: entry };
    return { types: [], unknown: true, source: entry };
  }
  // A qualifier that is not one of the five known shapes would have fallen
  // through above and left `qualifier` undefined while the prose clearly says
  // *something* - so a multi-word entry with no qualifier is also unknown.
  if (!qualifier && /[ ,]/.test(entry.trim())) {
    return { types, unknown: true, source: entry };
  }
  return { types, ...(qualifier ? { qualifier } : {}), source: entry };
}

/** What the app knows about the blow being struck. */
export interface Blow {
  /** Lower-cased damage type. */
  type: string;
  /** True when it came from a magic weapon, which the sheet does know. */
  magical?: boolean;
}

export interface Defences {
  resist?: string[];
  immune?: string[];
  vulnerable?: string[];
}

export type Verdict = 'applies' | 'no' | 'ask';

/**
 * Whether one entry bites on this blow.
 *
 * `ask` is a real answer and not a failure: it means the entry covers this
 * damage type but turns on something only the table knows.
 */
export function verdictFor(parsed: ParsedDefence, blow: Blow): Verdict {
  if (!parsed.allTypes && !parsed.types.includes(blow.type)) return 'no';
  if (parsed.unknown) return 'ask';

  switch (parsed.qualifier) {
    case undefined:
      return 'applies';
    case 'nonmagical':
      // Wholly decidable: a magic weapon defeats it, a mundane one does not.
      return blow.magical ? 'no' : 'applies';
    case 'nonmagical-not-silvered':
    case 'nonmagical-not-adamantine':
      // The magic half is settled; the metal is not. A magic weapon is out
      // either way, so only the mundane case needs a ruling.
      return blow.magical ? 'no' : 'ask';
    case 'from-spells':
    case 'good-wielder':
      return 'ask';
  }
}

export interface DamageOutcome {
  /** What actually comes off, after everything. */
  dealt: number;
  /** What to say about why, in the order it was decided. Empty when plain. */
  notes: string[];
}

/**
 * Put damage through a creature's defences.
 *
 * Immunity wins outright. Resistance and vulnerability to the same type
 * **cancel**, which is a ruling rather than a quotation - the SRD does not say
 * what happens, and cancelling is what most tables do and the only answer that
 * does not depend on the order they are applied in.
 *
 * Halving rounds down, as the SRD rounds everything down.
 */
export function applyDefences(amount: number, blow: Blow, defences: Defences): DamageOutcome {
  const notes: string[] = [];
  if (amount <= 0) return { dealt: amount, notes };

  const sift = (entries: string[] | undefined) => {
    let applies = false;
    for (const entry of entries ?? []) {
      const parsed = parseDefence(entry);
      const verdict = verdictFor(parsed, blow);
      if (verdict === 'applies') applies = true;
      else if (verdict === 'ask') notes.push(`ask the table: ${parsed.source}`);
    }
    return applies;
  };

  const immune = sift(defences.immune);
  const resist = sift(defences.resist);
  const vulnerable = sift(defences.vulnerable);

  if (immune) {
    notes.unshift(`immune to ${blow.type}`);
    return { dealt: 0, notes };
  }
  if (resist && vulnerable) {
    notes.unshift(`resistant and vulnerable to ${blow.type} — they cancel`);
    return { dealt: amount, notes };
  }
  if (resist) {
    notes.unshift(`resists ${blow.type}`);
    return { dealt: Math.floor(amount / 2), notes };
  }
  if (vulnerable) {
    notes.unshift(`vulnerable to ${blow.type}`);
    return { dealt: amount * 2, notes };
  }
  return { dealt: amount, notes };
}
