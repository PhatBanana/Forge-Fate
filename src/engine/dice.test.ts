import { describe, expect, it } from 'vitest';
import {
  ROLL_LOG_LIMIT,
  appendRoll,
  expectedTotal,
  formatNotation,
  parseNotation,
  rollD20,
  rollDamage,
  rollDie,
  rollNotation,
} from './dice';
import type { Rng } from './dice';

/**
 * A scripted RNG for one die size.
 *
 * Takes the faces you want, in order, and returns the `[0, 1)` values that
 * produce them. Written this way round because `onDie(20, 14)` says what it
 * means where `() => 0.7` does not.
 *
 * The die size has to be passed: `rollDie` does `floor(rng() * die) + 1`, so
 * the value that yields a 7 depends on whether it is a d10 or a d20. An
 * earlier version of this helper guessed, and produced a 9 where the test said
 * 7 - which is exactly the class of quiet wrongness the injected RNG exists to
 * prevent, so it is worth the extra argument.
 */
function onDie(die: number, ...wanted: number[]): Rng {
  let i = 0;
  return () => {
    const face = wanted[i++];
    if (face === undefined) throw new Error('RNG asked for more rolls than the test scripted');
    return (face - 1) / die;
  };
}

/** The same, for a roll that mixes die sizes: `mixed([10, 7], [6, 3])`. */
function mixed(...wanted: [die: number, face: number][]): Rng {
  let i = 0;
  return () => {
    const next = wanted[i++];
    if (!next) throw new Error('RNG asked for more rolls than the test scripted');
    const [die, face] = next;
    return (face - 1) / die;
  };
}

/** An RNG that must never be called. */
const noRolls: Rng = () => {
  throw new Error('RNG called when the roll should have needed no dice');
};

describe('rollDie', () => {
  it('covers the whole die and nothing beyond it', () => {
    expect(rollDie(6, () => 0)).toBe(1);
    expect(rollDie(6, () => 0.999999)).toBe(6);
    expect(rollDie(20, () => 0.999999)).toBe(20);
  });
});

describe('parseNotation', () => {
  it('reads the forms the app actually produces', () => {
    expect(parseNotation('2d6+3')).toEqual({ terms: [{ count: 2, die: 6 }], modifier: 3 });
    expect(parseNotation('1d8')).toEqual({ terms: [{ count: 1, die: 8 }], modifier: 0 });
    expect(parseNotation('d20')).toEqual({ terms: [{ count: 1, die: 20 }], modifier: 0 });
    expect(parseNotation('1d10-1')).toEqual({ terms: [{ count: 1, die: 10 }], modifier: -1 });
    expect(parseNotation('1d10+2d6+5')).toEqual({
      terms: [
        { count: 1, die: 10 },
        { count: 2, die: 6 },
      ],
      modifier: 5,
    });
  });

  it('tolerates spacing and case', () => {
    expect(parseNotation(' 2D6 + 3 ')).toEqual({ terms: [{ count: 2, die: 6 }], modifier: 3 });
  });

  it('reads a bare modifier, which is what an unarmed strike is', () => {
    expect(parseNotation('3')).toEqual({ terms: [], modifier: 3 });
  });

  it('returns null rather than guessing', () => {
    // A disabled button is a better outcome than a wrong number.
    expect(parseNotation('')).toBeNull();
    expect(parseNotation('greatsword')).toBeNull();
    expect(parseNotation('2d6 3')).toBeNull(); // unsigned second term
    expect(parseNotation('2d')).toBeNull();
    expect(parseNotation('d')).toBeNull();
    // A subtracted dice term is real notation but nothing here produces it, and
    // rolling it as a positive would be worse than declining.
    expect(parseNotation('1d8-1d4')).toBeNull();
  });

  it('round-trips through formatNotation', () => {
    for (const text of ['2d6+3', '1d8', '1d10-1', '1d10+2d6+5']) {
      expect(formatNotation(parseNotation(text)!)).toBe(text);
    }
    // `d20` normalises to its explicit form, which is the one a button shows.
    expect(formatNotation(parseNotation('d20')!)).toBe('1d20');
  });

  it('knows what a notation rolls on average', () => {
    expect(expectedTotal(parseNotation('2d6+3')!)).toBe(10);
    expect(expectedTotal(parseNotation('1d8')!)).toBe(4.5);
    expect(expectedTotal(parseNotation('1d10+2d6+5')!)).toBe(17.5);
  });
});

describe('rollNotation', () => {
  it('sums the dice and adds the modifier once', () => {
    const result = rollNotation(parseNotation('2d6+3')!, onDie(6, 4, 5));
    expect(result.total).toBe(12);
    expect(result.groups).toEqual([{ die: 6, values: [4, 5] }]);
    expect(result.working).toBe('2d6: 4 5 +3 = 12');
  });

  it('keeps mixed dice in separate groups so the working is readable', () => {
    const result = rollNotation(parseNotation('1d10+2d6')!, mixed([10, 7], [6, 3], [6, 6]));
    expect(result.total).toBe(16);
    expect(result.working).toBe('1d10: 7 · 2d6: 3 6 = 16');
  });

  it('shows a negative modifier as a subtraction', () => {
    expect(rollNotation(parseNotation('1d8-1')!, onDie(8, 8)).working).toBe('1d8: 8 -1 = 7');
  });
});

describe('rollD20', () => {
  it('rolls one die when neither side has the edge', () => {
    const result = rollD20(5, 'normal', onDie(20, 14));
    expect(result.rolls).toEqual([14]);
    expect(result.total).toBe(19);
    expect(result.working).toBe('d20: 14 +5 = 19');
  });

  it('keeps the higher die with advantage and shows the one it dropped', () => {
    const result = rollD20(3, 'advantage', onDie(20, 8, 17));
    expect(result.rolls).toEqual([8, 17]);
    expect(result.kept).toBe(17);
    expect(result.total).toBe(20);
    expect(result.working).toBe('d20: (8) 17 +3 = 20');
  });

  it('keeps the lower die with disadvantage', () => {
    const result = rollD20(3, 'disadvantage', onDie(20, 8, 17));
    expect(result.kept).toBe(8);
    expect(result.total).toBe(11);
    expect(result.working).toBe('d20: 8 (17) +3 = 11');
  });

  it('marks exactly one die as kept even when both land the same', () => {
    // By value, two sevens both "are" the kept die and neither would show as
    // dropped - so the display reads the index instead.
    expect(rollD20(0, 'advantage', onDie(20, 7, 7)).working).toBe('d20: 7 (7) = 7');
    expect(rollD20(0, 'disadvantage', onDie(20, 7, 7)).working).toBe('d20: 7 (7) = 7');
  });

  it('rolls the second die first, not last', () => {
    // Guards the bug this whole file exists to prevent: "advantage" that is
    // really "roll twice and keep the second" passes every averaging test.
    const low = rollD20(0, 'advantage', onDie(20, 20, 2));
    expect(low.kept).toBe(20);
  });

  it('reports the natural face from the die that counted', () => {
    expect(rollD20(0, 'normal', onDie(20, 20)).natural).toBe(20);
    expect(rollD20(0, 'normal', onDie(20, 1)).natural).toBe(1);
    expect(rollD20(0, 'normal', onDie(20, 11)).natural).toBeNull();
    // A dropped 20 is not a 20. This is the case a player will notice.
    expect(rollD20(0, 'disadvantage', onDie(20, 20, 4)).natural).toBeNull();
    expect(rollD20(0, 'advantage', onDie(20, 1, 9)).natural).toBeNull();
  });

  it('does not turn a big modifier into a natural 20', () => {
    // `natural` reads the face, not the total, or a +9 Stealth would crit on a
    // roll of 11.
    expect(rollD20(9, 'normal', onDie(20, 11)).total).toBe(20);
    expect(rollD20(9, 'normal', onDie(20, 11)).natural).toBeNull();
  });
});

describe('rollDamage', () => {
  it('leaves an ordinary hit alone', () => {
    const result = rollDamage(parseNotation('2d6+4')!, false, onDie(6, 3, 3));
    expect(result.total).toBe(10);
  });

  it('doubles the dice and not the modifier', () => {
    // The rule the whole DPR model turns on: four d6 and one +4, not two of it.
    const result = rollDamage(parseNotation('2d6+4')!, true, onDie(6, 3, 3, 3, 3));
    expect(result.total).toBe(16);
    expect(result.groups).toEqual([{ die: 6, values: [3, 3, 3, 3] }]);
    expect(result.working).toBe('critical · 4d6: 3 3 3 3 +4 = 16');
  });

  it('rolls the extra dice fresh rather than doubling the first ones', () => {
    // Doubling a rolled 6 gives 12 every time; rolling two more gives what the
    // dice give. Scripting four different faces proves which one happened.
    const result = rollDamage(parseNotation('2d6')!, true, onDie(6, 6, 6, 1, 1));
    expect(result.groups).toEqual([{ die: 6, values: [6, 6, 1, 1] }]);
    expect(result.total).toBe(14);
  });

  it('doubles every dice term, not only the first', () => {
    const result = rollDamage(
      parseNotation('1d10+2d6+3')!,
      true,
      mixed([10, 1], [10, 1], [6, 1], [6, 1], [6, 1], [6, 1]),
    );
    expect(result.groups).toEqual([
      { die: 10, values: [1, 1] },
      { die: 6, values: [1, 1, 1, 1] },
    ]);
    expect(result.total).toBe(9);
  });

  it('crits a flat-only damage line into itself', () => {
    // Nothing to double, so a crit on an unarmed +3 is still 3 rather than 6.
    expect(rollDamage(parseNotation('3')!, true, noRolls).total).toBe(3);
  });
});

describe('the roll log', () => {
  const entry = (label: string) => ({ kind: 'check' as const, label, total: 1, working: 'd20: 1 = 1' });

  it('puts the newest roll first', () => {
    const log = appendRoll(appendRoll([], entry('first')), entry('second'));
    expect(log.map((r) => r.label)).toEqual(['second', 'first']);
  });

  it('gives every entry a distinct id', () => {
    let log = appendRoll([], entry('a'));
    log = appendRoll(log, entry('b'));
    log = appendRoll(log, entry('c'));
    expect(new Set(log.map((r) => r.id)).size).toBe(3);
  });

  it('keeps the ids distinct once the log has wrapped', () => {
    // The id comes from the newest entry, not the length, so dropping the tail
    // cannot make it repeat a live id.
    let log: ReturnType<typeof appendRoll> = [];
    for (let i = 0; i < ROLL_LOG_LIMIT * 3; i++) log = appendRoll(log, entry(`roll ${i}`));
    expect(log).toHaveLength(ROLL_LOG_LIMIT);
    expect(new Set(log.map((r) => r.id)).size).toBe(ROLL_LOG_LIMIT);
    expect(log[0].label).toBe(`roll ${ROLL_LOG_LIMIT * 3 - 1}`);
  });
});
