// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ShortcutsHelp } from './ShortcutsHelp';

function Host() {
  const [open, setOpen] = useState(false);
  return (
    <ShortcutsHelp
      shortcuts={[{ keys: 'Space', does: 'End the turn' }]}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
    />
  );
}

/* §79: the keys, findable - and the dialog contract honoured. */
describe('ShortcutsHelp', () => {
  it('opens a labelled dialog, moves focus in, and hands it back on close', async () => {
    const user = userEvent.setup();
    render(<Host />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keys' }));

    const dialog = screen.getByRole('dialog', { name: /keyboard shortcuts/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Space')).toBeInTheDocument();
    expect(screen.getByText('End the turn')).toBeInTheDocument();
    // Focus lands on Close, so the next key press belongs to the dialog.
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // And the opener has its focus back.
    expect(screen.getByRole('button', { name: 'Keys' })).toHaveFocus();
  });
});

/*
  §85: the trap `aria-modal="true"` had been promising since §79. A modal
  that lets Tab wander onto the board behind it leaves a keyboard user
  reading a page they cannot see, with no way back but a key nobody told
  them about.
*/
describe('the focus trap', () => {
  it('holds Tab inside the dialog, both ways', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('button', { name: 'Keys' }));
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveFocus();

    // One focusable, so both directions hold it where it is - and the opener
    // behind the dialog never gets it.
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Keys' })).not.toHaveFocus();
  });
});
