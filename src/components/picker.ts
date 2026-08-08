/**
 * The one-open-at-a-time rule, as a pair of props.
 *
 * Separate from `ChoiceRow` so that file exports only its component - a module
 * that mixes components with plain functions breaks fast refresh, and this is
 * the plain half.
 *
 * See `ChoiceRow` for why the rule exists at all.
 */

/**
 * The one-open-at-a-time state, as a pair of props.
 *
 * Every catalogue on the Builder takes these two and nothing else, so the rule
 * is enforced by there being exactly one `picker` to be open - a panel cannot
 * opt out of it without changing its own signature, which is the point.
 */
export interface PickerProps {
  picker: string | null;
  onPicker: (id: string | null) => void;
}

/**
 * `id`, `open` and `onOpen` for a row, from the shared picker.
 *
 * Spread onto a `ChoiceRow`. Saves each of nine panels writing the same
 * `open={picker === id} onOpen={(next) => onPicker(next ? id : null)}`, and
 * more usefully means none of them can write it *slightly differently*.
 */
export function rowState(id: string, { picker, onPicker }: PickerProps) {
  return {
    id,
    open: picker === id,
    onOpen: (next: boolean) => onPicker(next ? id : null),
  };
}

