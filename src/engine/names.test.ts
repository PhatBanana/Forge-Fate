import { describe, expect, it } from 'vitest';
import { suggestName } from './names';
import type { Rng } from './dice';

/** A fixed sequence, so a generated name can be pinned rather than hoped at. */
const seq = (...values: number[]): Rng => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('§157: the name suggester', () => {
  it('composes a capitalised, pronounceable name from syllables', () => {
    for (let i = 0; i < 40; i++) {
      const name = suggestName('human', seq(i / 40, ((i * 7) % 40) / 40, ((i * 13) % 40) / 40));
      expect(name).toMatch(/^[A-Z][a-z]+$/);
      expect(name.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('flavours by lineage - a dwarf and an elf do not sound alike', () => {
    // The same dice, two lineages: the families differ, so the names must.
    const dwarf = suggestName('dwarf-hill', seq(0, 0.9, 0));
    const elf = suggestName('elf-wood', seq(0, 0.9, 0));
    expect(dwarf).not.toBe(elf);
  });

  it('answers for a lineage it has never heard of', () => {
    // Homebrew species fall through to the broad family, never to a crash.
    expect(suggestName('crystalborn-visitor', seq(0.3, 0.3, 0.3))).toMatch(/^[A-Z][a-z]+$/);
  });

  it('is deterministic under a fixed rng, so a re-roll is a real re-roll', () => {
    expect(suggestName('human', seq(0.2, 0.6, 0.4))).toBe(suggestName('human', seq(0.2, 0.6, 0.4)));
    expect(suggestName('human', seq(0.2, 0.6, 0.4))).not.toBe(
      suggestName('human', seq(0.8, 0.1, 0.9)),
    );
  });
});
