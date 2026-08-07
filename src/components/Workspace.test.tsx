// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Workspace } from './Workspace';
import { DEFAULT_LAYOUT, RAIL_COLLAPSED, loadLayout } from '../workspace';

/**
 * The three-column shell.
 *
 * The arithmetic is in `workspace.test.ts`; what matters here is the wiring -
 * that a rail can be collapsed and reopened, that the divider is something a
 * keyboard can reach, and that the layout is remembered. Dragging is a pointer
 * gesture over a seven-pixel target and is checked in a browser.
 */

const setup = (props: Partial<Parameters<typeof Workspace>[0]> = {}) =>
  render(
    <Workspace
      id="test"
      left={{ title: 'Turn order', content: <p>who is up</p> }}
      right={{ title: 'Selected', content: <p>what is left</p> }}
      {...props}
    >
      <p>the map</p>
    </Workspace>,
  );

const grid = () => document.querySelector('.ws') as HTMLElement;

describe('what it renders', () => {
  beforeEach(() => localStorage.clear());

  it('puts a rail either side of the middle', () => {
    setup();
    expect(screen.getByText('who is up')).toBeInTheDocument();
    expect(screen.getByText('the map')).toBeInTheDocument();
    expect(screen.getByText('what is left')).toBeInTheDocument();
  });

  it('sizes the columns from the layout', () => {
    setup();
    expect(grid().style.gridTemplateColumns).toBe(
      `${DEFAULT_LAYOUT.left.width}px var(--ws-divider) minmax(0, 1fr) var(--ws-divider) ${DEFAULT_LAYOUT.right.width}px`,
    );
  });

  it('drops a column entirely when there is no rail for it', () => {
    // A surface with one rail should not carry an empty track and a divider
    // that resizes nothing.
    setup({ right: undefined });
    expect(grid().style.gridTemplateColumns).toBe(
      `${DEFAULT_LAYOUT.left.width}px var(--ws-divider) minmax(0, 1fr)`,
    );
    expect(screen.getAllByRole('separator')).toHaveLength(1);
  });
});

describe('collapsing a rail', () => {
  beforeEach(() => localStorage.clear());

  it('leaves a strip that still says which rail it is', async () => {
    // A bare arrow would leave you opening rails to find out which one you
    // wanted.
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /hide turn order/i }));

    expect(screen.queryByText('who is up')).not.toBeInTheDocument();
    const strip = screen.getByRole('button', { name: /show turn order/i });
    expect(within(strip).getByText('Turn order')).toBeInTheDocument();
    expect(grid().style.gridTemplateColumns).toContain(`${RAIL_COLLAPSED}px`);
  });

  it('reopens at the width it had, not the default', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /hide selected/i }));
    await user.click(screen.getByRole('button', { name: /show selected/i }));
    expect(screen.getByText('what is left')).toBeInTheDocument();
    expect(grid().style.gridTemplateColumns).toContain(`${DEFAULT_LAYOUT.right.width}px`);
  });
});

describe('the divider', () => {
  beforeEach(() => localStorage.clear());

  it('is a separator a screen reader can report', () => {
    setup();
    const [left] = screen.getAllByRole('separator');
    expect(left).toHaveAttribute('aria-orientation', 'vertical');
    expect(left).toHaveAttribute('aria-valuenow', String(DEFAULT_LAYOUT.left.width));
    expect(left).toHaveAttribute('tabindex', '0');
  });

  it('resizes from the keyboard', async () => {
    /*
      A resizer that only answers to a mouse is one a keyboard user cannot
      reach at all - and this one is seven pixels wide, so it is not a
      comfortable mouse target either.
    */
    const user = userEvent.setup();
    setup();
    const [left] = screen.getAllByRole('separator');
    left.focus();

    await user.keyboard('{ArrowRight}');
    expect(grid().style.gridTemplateColumns).toContain(`${DEFAULT_LAYOUT.left.width + 16}px`);

    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}');
    expect(grid().style.gridTemplateColumns).toContain(`${DEFAULT_LAYOUT.left.width - 48}px`);
  });

  it('moves the right rail the other way, so it follows the cursor', async () => {
    // Arrow right shrinks the right rail, because the divider is on its left.
    const user = userEvent.setup();
    setup();
    const separators = screen.getAllByRole('separator');
    separators[1].focus();
    await user.keyboard('{ArrowRight}');
    expect(grid().style.gridTemplateColumns).toContain(`${DEFAULT_LAYOUT.right.width - 16}px`);
  });

  it('collapses on Enter', async () => {
    const user = userEvent.setup();
    setup();
    const [left] = screen.getAllByRole('separator');
    left.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: /show turn order/i })).toBeInTheDocument();
  });
});

describe('remembering the layout', () => {
  beforeEach(() => localStorage.clear());

  it('writes a change through so it survives a reload', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /hide turn order/i }));
    expect(loadLayout('test').left.collapsed).toBe(true);
  });

  it('keeps one surface out of another', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /hide turn order/i }));
    expect(loadLayout('other').left.collapsed).toBe(false);
  });
});
