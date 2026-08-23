/**
 * §131: how numbers read on a character sheet.
 *
 * D&D writes modifiers with their sign - `+3`, `-1`, and `+0` rather than
 * `0`, because a sheet says "you add nothing" out loud rather than leaving
 * the reader to wonder whether the box was filled in. That is a formatting
 * rule about this game's numbers, not a general one about JavaScript's.
 *
 * Seven modules each had their own copy of it, six of them the identical
 * ternary and one written the other way round. Nothing had gone wrong yet,
 * which is the only reason to fix it now rather than after something does:
 * the copies were not being kept in step by anybody, and the first one to
 * be "improved" - trimming `+0` to `0`, say - would have made two sheets of
 * the same character disagree in print.
 *
 * Deliberately not `Delta` (`components/shared.tsx`), which looks similar
 * and is not: that is a component, it rounds to one decimal, and it carries
 * a colour class for a comparison readout. This is a string.
 */
export const signed = (value: number): string => (value >= 0 ? `+${value}` : `${value}`);
