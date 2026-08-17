// @vitest-environment jsdom
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRovingTabs } from './useRovingTabs';

/**
 * §85. The tablist contract three rows of buttons were claiming and none of
 * them kept.
 *
 * Tested through a harness rather than through the Builder, because what is
 * under test is the *rule* - wrap, Home, End, one tab stop - and driving it
 * through ten spell levels would be testing the Builder's spell panel with
 * extra steps. The three real call sites get one assertion each that they are
 * wired at all; this file owns the behaviour.
 */

function Tabs({ names, onPick }: { names: string[]; onPick?: (name: string) => void }) {
  const [active, setActive] = useState(names[0]);
  const { tablistProps, tabProps } = useRovingTabs();
  return (
    <div role="tablist" aria-label="Harness" {...tablistProps}>
      {names.map((name) => (
        <button
          key={name}
          role="tab"
          aria-selected={name === active}
          {...tabProps(name === active)}
          onClick={() => {
            setActive(name);
            onPick?.(name);
          }}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

const setup = (onPick?: (name: string) => void) =>
  render(<Tabs names={['one', 'two', 'three']} onPick={onPick} />);

describe('one tab stop for the row', () => {
  it('keeps only the selected tab in the Tab order', () => {
    setup();
    expect(screen.getByRole('tab', { name: 'one' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'two' })).toHaveAttribute('tabindex', '-1');
  });

  it('moves the tab stop with the selection', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('tab', { name: 'three' }));
    expect(screen.getByRole('tab', { name: 'three' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'one' })).toHaveAttribute('tabindex', '-1');
  });

  it('lets one press of Tab reach the row and one leave it', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Tabs names={['one', 'two', 'three']} />
        <button>after</button>
      </>,
    );
    await user.tab();
    expect(screen.getByRole('tab', { name: 'one' })).toHaveFocus();
    // Not "two" - the whole point. Three tabs used to cost three presses.
    await user.tab();
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
  });
});

describe('the arrow keys', () => {
  it('moves focus and selects as it goes', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('tab', { name: 'one' }));
    await user.keyboard('{ArrowRight}');
    const two = screen.getByRole('tab', { name: 'two' });
    expect(two).toHaveFocus();
    // Automatic activation: these tablists switch between views of things you
    // already have, so a second key to confirm would be ceremony.
    expect(two).toHaveAttribute('aria-selected', 'true');
  });

  it('answers Up and Down as well as Left and Right', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('tab', { name: 'one' }));
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('tab', { name: 'two' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('tab', { name: 'one' })).toHaveFocus();
  });

  it('wraps at both ends', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('tab', { name: 'one' }));
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'three' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'one' })).toHaveFocus();
  });

  it('jumps to each end on Home and End', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('tab', { name: 'two' }));
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'three' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'one' })).toHaveFocus();
  });

  it('starts from the selected tab when nothing in the row has focus', async () => {
    const user = userEvent.setup();
    const { container } = setup();
    await user.click(screen.getByRole('tab', { name: 'two' }));
    (document.activeElement as HTMLElement)?.blur();

    // Fired at the tablist itself, which is where a bubbling keypress from a
    // blurred row arrives. Without the aria-selected fallback the handler has
    // no idea where "here" is and would land on the first tab.
    const list = container.querySelector('[role="tablist"]') as HTMLElement;
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'three' })).toHaveAttribute('aria-selected', 'true');
  });

  it('leaves every other key alone', async () => {
    const user = userEvent.setup();
    const picked: string[] = [];
    setup((name) => picked.push(name));
    await user.click(screen.getByRole('tab', { name: 'one' }));
    picked.length = 0;
    // No Space or Enter here - those press the focused button, which is the
    // browser's job and not this hook's to prevent.
    await user.keyboard('{PageDown}xq');
    expect(picked).toEqual([]);
  });

  it('skips a disabled tab rather than selecting one that cannot be', async () => {
    const user = userEvent.setup();
    render(
      <div role="tablist" {...useRovingTabsFor()}>
        <button role="tab" aria-selected="true">
          first
        </button>
        <button role="tab" aria-selected="false" disabled>
          shut
        </button>
        <button role="tab" aria-selected="false">
          last
        </button>
      </div>,
    );
    await user.click(screen.getByRole('tab', { name: 'first' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'last' })).toHaveFocus();
  });
});

/** The hook's container props, for the one test that needs a hand-built row. */
function useRovingTabsFor() {
  return useRovingTabs().tablistProps;
}
