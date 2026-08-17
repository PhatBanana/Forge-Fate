import type { KeyboardEvent } from 'react';

/**
 * §85: arrow keys on a tablist.
 *
 * Three real tablists exist - the Builder's spell levels, the Characters
 * sections, the sheet's two layouts - and every one of them was a row of
 * buttons wearing `role="tab"`. A screen reader announces "tab, 1 of 10" and
 * the user presses the arrow key that announcement promises, and nothing
 * happens; Tab walks through all ten instead, because that is what a row of
 * plain buttons does. The role was a claim the markup did not honour.
 *
 * ## What this is, and what it is not
 *
 * It holds **no state and runs no effect**, which is why it is thirty lines
 * rather than a component. The DOM already knows which tab has focus
 * (`document.activeElement`) and which is selected (`aria-selected`), so
 * there is nothing here worth keeping in React - only a key handler for the
 * container and one number for each tab.
 *
 * It also does not learn any screen's selection setter. Moving to a tab
 * focuses it and then **clicks** it, so each tablist's existing `onClick`
 * does the selecting exactly as it does for the mouse. That is what keeps
 * this from needing three different wirings, and it is why adding a fourth
 * tablist is two props rather than a conversation.
 *
 * ## Automatic activation, deliberately
 *
 * ARIA allows either: arrow keys that only move focus (activate with Enter),
 * or arrow keys that select as they go. These three take the second, because
 * all three switch between *views of things you already have* - spell levels,
 * your own characters, one sheet or the other. Nothing is spent by landing on
 * one, so making people press a second key to see what they arrowed to would
 * be ceremony. A tablist whose panels cost something - a purchase, a
 * destructive load - would want the other rule, and should say so here.
 */
export function useRovingTabs(): {
  tablistProps: { onKeyDown: (e: KeyboardEvent<HTMLElement>) => void };
  /** Spread onto each tab. Only the selected one is in the Tab order. */
  tabProps: (selected: boolean) => { tabIndex: number };
} {
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const step = KEYS[e.key];
    if (step === undefined) return;

    // The container is the element the handler is on, so the tabs are its
    // own - a nested tablist cannot steal these keys.
    const tabs = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')].filter(
      (tab) => !tab.hasAttribute('disabled'),
    );
    if (!tabs.length) return;

    // Where we are: whatever has focus, or failing that whatever is
    // selected - so the first arrow press after a click lands sensibly.
    const from = tabs.indexOf(document.activeElement as HTMLElement);
    const here = from >= 0 ? from : tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');

    const to =
      step === 'first' ? 0
      : step === 'last' ? tabs.length - 1
      // Wrapping, which is what a tablist does and what every reader expects:
      // the end of the row is next to the start of it.
      : (Math.max(here, 0) + step + tabs.length) % tabs.length;

    // Ours now - otherwise Home and End would also scroll the page out from
    // under the row being walked.
    e.preventDefault();
    tabs[to].focus();
    tabs[to].click();
  };

  return {
    tablistProps: { onKeyDown },
    /*
      One tab stop for the whole row, which is the other half of the pattern:
      Tab reaches the tablist and then leaves it for the panel, rather than
      making somebody press it ten times to get past the spell levels.
    */
    tabProps: (selected: boolean) => ({ tabIndex: selected ? 0 : -1 }),
  };
}

/** How far each key moves, or which end it jumps to. */
const KEYS: Record<string, number | 'first' | 'last' | undefined> = {
  // Both axes: these rows are horizontal, but a reader's arrow habits are not
  // always, and answering Up/Down costs nothing.
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
  Home: 'first',
  End: 'last',
};
