// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmButton } from './shared';

/*
  §76. The two-step confirm, tested once here so every call site can lean on
  it - the battle's Clear, the dungeon and campaign deletes all render this
  exact machine.
*/
describe('ConfirmButton', () => {
  it('does nothing destructive on the first press', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Clear" confirmLabel="Really clear" onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Really clear' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument();
  });

  it('Keep disarms without firing', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Delete" confirmLabel="Really delete" onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Keep' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Really delete' })).not.toBeInTheDocument();
  });

  it('the armed press fires once and disarms', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Delete" confirmLabel="Really delete" onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Really delete' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('carries the aria-label a row needs to name its subject', () => {
    render(
      <ConfirmButton
        label="Delete"
        confirmLabel="Really delete"
        ariaLabel="Delete the sunken abbey"
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Delete the sunken abbey' })).toBeInTheDocument();
  });
});
