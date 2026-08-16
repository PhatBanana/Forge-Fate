// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastHost } from './ToastHost';
import { push } from '../toast';
import type { Toast } from '../toast';

/**
 * §83. The host, which is one component with one job and one rule about it:
 * it *is* the live region, so there is no hidden second copy of the text.
 * §79 learned that the hard way when a mirrored combat log made every
 * `getByText` find two of everything.
 */

function setup(toasts: Toast[]) {
  const onChange = vi.fn();
  const view = render(<ToastHost toasts={toasts} onChange={onChange} />);
  return { onChange, view };
}

describe('what it puts on the screen', () => {
  it('says nothing at all when there is nothing to say', () => {
    const { view } = setup([]);
    // Not an empty box, and nothing for a reader to land on.
    expect(view.container).toBeEmptyDOMElement();
  });

  it('is the live region itself - one copy of the text', () => {
    setup(push([], 'Share link copied'));
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    // Exactly one node carries the words. A hidden mirror would make this two.
    expect(screen.getAllByText('Share link copied')).toHaveLength(1);
    expect(region).toContainElement(screen.getByText('Share link copied'));
  });

  it('stacks the newest nearest the corner', () => {
    // Visual order is CSS (column-reverse); the DOM order is newest-first,
    // which is also the reading order for a screen reader.
    setup(push(push([], 'older'), 'newer'));
    const texts = [...document.querySelectorAll('.toast-text')].map((n) => n.textContent);
    expect(texts).toEqual(['newer', 'older']);
  });
});

describe('going away', () => {
  it('dismisses the one whose close button was pressed', async () => {
    const toasts = push(push([], 'a'), 'b');
    const { onChange } = setup(toasts);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss: a' }));
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)![0] as Toast[];
    expect(next.map((t) => t.text)).toEqual(['b']);
  });

  it('runs the action and then clears the toast that offered it', async () => {
    const onAct = vi.fn();
    const { onChange } = setup(push([], 'Undone: cleared the fight', { label: 'Redo', onAct }));
    await userEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(onAct).toHaveBeenCalledOnce();
    // The offer is spent, so it goes - leaving it would invite a second press
    // that means something different.
    expect((onChange.mock.calls.at(-1)![0] as Toast[])).toEqual([]);
  });

  it('holds while the pointer is on it, and lets go after', async () => {
    // The oldest bug this component has: vanishing as the click lands.
    const toasts = push([], 'Undone', { label: 'Redo', onAct: () => {} });
    const { onChange } = setup(toasts);
    const toast = document.querySelector('.toast') as HTMLElement;

    await userEvent.hover(toast);
    expect((onChange.mock.calls.at(-1)![0] as Toast[])[0].held).toBe(true);

    onChange.mockClear();
    await userEvent.unhover(toast);
    expect((onChange.mock.calls.at(-1)![0] as Toast[])[0].held).toBe(false);
  });
});
