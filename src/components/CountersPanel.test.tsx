// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CountersPanel } from './CountersPanel';
import type { Build } from '../types';
import { fighter } from '../test/factories';

/**
 * The escape hatch for anything the app has no table for.
 *
 * Piety is the case it was built around, and it is the awkward one: a score
 * rather than a pool, counting up rather than down, untouched by any rest.
 * The panel has to be able to describe that shape, or the feature only covers
 * the easy half.
 */

function setup(initial: Build = fighter()) {
  const patch = vi.fn();
  let build = initial;

  const view = render(<CountersPanel build={build} patch={patch} />);
  patch.mockImplementation((partial: Partial<Build>) => {
    build = { ...build, ...partial };
    view.rerender(<CountersPanel build={build} patch={patch} />);
  });

  return {
    get build() {
      return build;
    },
  };
}

describe('your own counters', () => {
  it('says class resources are already handled', () => {
    setup();
    expect(screen.getByText(/already on your sheet/i)).toBeInTheDocument();
  });

  it('adds a piety score: counts up, and no rest touches it', async () => {
    const user = userEvent.setup();
    const view = setup();

    await user.type(screen.getByLabelText(/name the counter/i), 'Piety');
    await user.clear(screen.getByLabelText(/^maximum$/i));
    await user.type(screen.getByLabelText(/^maximum$/i), '50');
    await user.selectOptions(screen.getByLabelText(/pool or score/i), 'empty');
    await user.selectOptions(screen.getByLabelText(/when it comes back/i), 'none');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(view.build.customResources).toHaveLength(1);
    expect(view.build.customResources?.[0]).toMatchObject({
      name: 'Piety',
      max: 50,
      startsAt: 'empty',
      recharge: 'none',
    });
    expect(screen.getByText(/no rest brings it back/i)).toBeInTheDocument();
  });

  it('refuses a counter with no name', async () => {
    const user = userEvent.setup();
    const view = setup();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    await user.type(screen.getByLabelText(/name the counter/i), '   ');
    expect(view.build.customResources).toBeUndefined();
  });

  it('removes one without disturbing the others', async () => {
    const user = userEvent.setup();
    const view = setup({
      ...fighter(),
      customResources: [
        { id: 'a', name: 'Piety', max: 50, startsAt: 'empty', recharge: 'none' },
        { id: 'b', name: 'Wrath', max: 4, startsAt: 'full', recharge: 'short' },
      ],
    });

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(view.build.customResources?.map((c) => c.name)).toEqual(['Wrath']);
  });
});
