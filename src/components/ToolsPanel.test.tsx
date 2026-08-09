// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToolsPanel } from './ToolsPanel';
import { deriveBuild } from '../engine/character';
import type { Build } from '../types';
import { buildOf, fighter } from '../test/factories';

/**
 * Section 43. The panel existed and was mounted; what had never been pinned
 * is that a pick actually **reaches the build** - which is the whole of the
 * gap the §42 audit named. "Counted but never chosen" is only fixed if the
 * chip writes something the proficiency engine reads back.
 */

const shown = { picker: 'tools', onPicker: () => {} };

function setup(initial: Build) {
  const patch = vi.fn();
  let build = initial;

  const view = render(
    <ToolsPanel build={build} ctx={deriveBuild(build)} patch={patch} {...shown} />,
  );
  patch.mockImplementation((partial: Partial<Build>) => {
    build = { ...build, ...partial };
    view.rerender(
      <ToolsPanel build={build} ctx={deriveBuild(build)} patch={patch} {...shown} />,
    );
  });

  return { get build() { return build; } };
}

describe('choosing tools and languages', () => {
  it('writes a language onto the build, where the sheet can read it', async () => {
    const user = userEvent.setup();
    const state = setup(buildOf(fighter()));
    expect(state.build.languages).not.toContain('Dwarvish');

    await user.click(screen.getByRole('button', { name: 'Dwarvish' }));
    expect(state.build.languages).toContain('Dwarvish');

    // And off again, because a mis-click has to be undoable in the same place
    // it was made.
    await user.click(screen.getByRole('button', { name: 'Dwarvish' }));
    expect(state.build.languages).not.toContain('Dwarvish');
  });

  it('counts down the open slots as they are filled', async () => {
    const user = userEvent.setup();
    const build = buildOf(fighter());
    const open = deriveBuild(build).proficiencies.languages.open;

    const state = setup(build);
    await user.click(screen.getByRole('button', { name: 'Elvish' }));
    const after = deriveBuild(state.build).proficiencies.languages;
    // One fewer to choose, and the chosen one in the known list - the two
    // halves of "the pick reached the sheet".
    expect(after.open).toBe(Math.max(0, open - 1));
    expect(state.build.languages).toContain('Elvish');
  });

  it('writes a tool proficiency the same way', async () => {
    const user = userEvent.setup();
    const state = setup(buildOf(fighter()));
    await user.click(screen.getByRole('button', { name: "Thieves' tools" }));
    expect(state.build.toolIds).toContain("Thieves' tools");
  });

  it('shows the secret languages without pretending they are a choice', () => {
    setup(buildOf(fighter()));
    // Thieves' Cant comes with the class rather than being picked; it is
    // listed so the sheet can print it, and the panel says so.
    expect(screen.getByRole('button', { name: "Thieves' Cant" })).toBeTruthy();
    expect(screen.getByText(/comes with its class rather than being chosen/i)).toBeTruthy();
  });
});
