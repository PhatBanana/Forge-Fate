// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScreenSheet } from './ScreenSheet';
import { deriveBuild } from '../engine/character';
import { emptyPlay } from '../play';
import type { PlayState } from '../play';
import type { Build } from '../types';
import { buildOf, fighter, warlockSorcerer, wizard } from '../test/factories';
import { waitingChoices } from './sections';
import type { Called } from '../checkCall';

/**
 * §138. The screen reading of a character.
 *
 * The paper reading is pinned by `CharacterSheet.test.tsx` and is the sheet of
 * record. These pin what makes this one a *different* reading rather than a
 * restyled copy: it is abridged on purpose, it is on the app's palette so the
 * guided flow can point at its boxes, and every figure on it is derived so a
 * choice applied above lands here in the same render.
 */
function setup(build: Build, highlight?: string, called?: Called | null) {
  const onBuildChange = vi.fn();
  const onPlayChange = vi.fn();
  let play: PlayState = emptyPlay();

  const props = () => ({
    ctx: deriveBuild(build),
    play,
    highlight,
    called,
    onPlayChange,
    onBuildChange,
  });
  const view = render(<ScreenSheet {...props()} />);
  onPlayChange.mockImplementation((next: PlayState) => {
    play = next;
    view.rerender(<ScreenSheet {...props()} />);
  });

  return { onBuildChange, onPlayChange, get play() { return play; } };
}

const sheet = () => document.querySelector('.ss') as HTMLElement;

describe('what the screen reading shows', () => {
  it('leads with the six scores and the six figures read off them', () => {
    setup(fighter(5));
    expect(sheet().querySelectorAll('.ss-ability')).toHaveLength(6);
    const stats = [...sheet().querySelectorAll('.ss-stat span')].map((n) => n.textContent);
    expect(stats).toEqual([
      'Armor class',
      'Initiative',
      'Speed',
      'Hit points',
      'Passive perception',
      'Save DC',
    ]);
  });

  /*
    Abridged on purpose. Eighteen skill rows is what you glance *past* while
    choosing; the paper reading has all of them and is one click away. If this
    ever stops being true the reading has quietly become a second sheet of
    record, with two places to fix anything wrong with it.
  */
  it('abridges the skills rather than printing all eighteen', () => {
    setup(
      buildOf({
        ...fighter(5),
        skillIds: ['athletics', 'perception', 'survival', 'intimidation', 'insight'],
      }),
    );
    const rows = sheet().querySelectorAll('.ss-skill');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(8);
  });

  it('says so rather than showing an empty skills box', () => {
    setup(buildOf({ ...fighter(5), skillIds: [] }));
    expect(within(sheet()).getByText(/nothing proficient yet/i)).toBeInTheDocument();
  });

  it('marks expertise apart from proficiency, the way paper does', () => {
    setup(buildOf({ ...fighter(5), skillIds: ['athletics', 'perception'], expertiseIds: ['perception'] }));
    const dots = [...sheet().querySelectorAll('.ss-skill i')];
    expect(dots.some((d) => d.className.includes('is-expert'))).toBe(true);
    expect(dots.some((d) => d.className.includes('is-proficient'))).toBe(true);
  });

  it('says nothing is equipped rather than showing an empty attacks box', () => {
    setup(buildOf({ ...fighter(5), weapons: { magicBonus: {} } }));
    expect(within(sheet()).getByText(/nothing equipped/i)).toBeInTheDocument();
  });

  it('shows a caster’s slots and spends them left to right', async () => {
    const app = setup(warlockSorcerer());
    const pips = [...sheet().querySelectorAll('.ss-pips button')] as HTMLElement[];
    expect(pips.length).toBeGreaterThan(0);
    const full = pips.filter((p) => p.className.includes('is-full')).length;

    await userEvent.click(pips[0]);
    expect(app.onPlayChange).toHaveBeenCalled();
    const now = [...sheet().querySelectorAll('.ss-pips button')].filter((p) =>
      p.className.includes('is-full'),
    ).length;
    expect(now).toBe(full - 1);
  });

  it('edits the name in place, since on a sheet the name is the heading', async () => {
    const app = setup(fighter(5));
    await userEvent.type(screen.getByLabelText('Character name'), 'x');
    expect(app.onBuildChange).toHaveBeenCalled();
  });
});

/*
  The visible half of §138's fusion. The step card names the box it fills and
  the box answers - and it can only answer in the same accent because this
  reading is on the app's palette, which is the whole reason the two readings
  were split. A `highlight` that matched nothing would make the card's promise
  a lie, so the names it passes are pinned here against the boxes that exist.
*/
describe('the box the flow is filling', () => {
  it('lights the box the current step names, and only that one', () => {
    setup(fighter(5), 'Feats & ability increases');
    const lit = [...sheet().querySelectorAll('.ss-box.is-lit')];
    expect(lit).toHaveLength(1);
    expect(lit[0].querySelector('h3')!.textContent).toBe('Feats & ability increases');
  });

  it('lights nothing when the flow is not asking', () => {
    setup(fighter(5));
    expect(sheet().querySelectorAll('.ss-box.is-lit')).toHaveLength(0);
  });

  /*
    The contract, and the thing most likely to rot.

    A *ranked* step is answered inside the flow, so the box it names has to be
    on the screen underneath or the card's promise is a lie - and the promise
    is the whole fusion. A *form* step is answered on the dense page instead,
    and its box is the section it sends you to. So: every ranked target is a
    box here, checked against the real `waitingChoices` for four different
    characters rather than against a list somebody kept in step by hand.

    This is what fails if a step's `target` string is edited and the box is
    not, which is a typo no amount of reading catches.
  */
  it('has a box for every ranked step’s target, on every kind of character', () => {
    for (const build of [fighter(1), fighter(5), fighter(12), warlockSorcerer(), wizard(9)]) {
      const ctx = deriveBuild(build);
      cleanup();
      render(
        <ScreenSheet ctx={ctx} play={emptyPlay()} onPlayChange={() => {}} onBuildChange={() => {}} />,
      );
      const here = new Set(
        [...sheet().querySelectorAll('.ss-box h3')].map((h) => h.textContent ?? ''),
      );
      for (const choice of waitingChoices(ctx)) {
        if (choice.shape !== 'ranked') continue;
        expect(here.has(choice.target), `${choice.id} → ${choice.target}`).toBe(true);
      }
    }
  });
});

/*
  §139. What just landed.

  The fusion's claim is that a choice made in the card above appears in a box
  below, and a figure that changes silently in a page of figures is a figure
  nobody saw change. So a chip that has just arrived wears a one-shot tint.
*/
describe('the chip that just landed', () => {
  const chips = () => [...document.querySelectorAll('.ss-chip')] as HTMLElement[];

  it('marks nothing on arrival, because arriving is not watching something land', () => {
    setup(buildOf({ ...fighter(8), featIds: ['alert'] }));
    expect(chips().length).toBeGreaterThan(0);
    expect(chips().some((c) => c.className.includes('is-fresh'))).toBe(false);
  });

  it('marks the one that arrived, and only that one', () => {
    const onBuildChange = vi.fn();
    let build = buildOf({ ...fighter(8), featIds: ['alert'] });
    const props = () => ({
      ctx: deriveBuild(build),
      play: emptyPlay(),
      onPlayChange: () => {},
      onBuildChange,
    });
    const view = render(<ScreenSheet {...props()} />);
    expect(chips().some((c) => c.className.includes('is-fresh'))).toBe(false);

    // A second feat arrives, the way the step card applies one.
    build = { ...build, featIds: ['alert', 'tough'] };
    view.rerender(<ScreenSheet {...props()} />);

    const fresh = chips().filter((c) => c.className.includes('is-fresh'));
    expect(fresh).toHaveLength(1);
    expect(fresh[0].textContent).not.toMatch(/alert/i);
  });
});

/*
  §141. The DM's question, on the sheet that answers it.

  The comparison itself is `checkCall.test.ts`'s business; these pin the half
  that only exists on screen - that the called row is findable even when the
  abridgement would have dropped it, and that the verdict says which of two
  things it is.
*/
describe('the DM’s check-call', () => {
  const perception = (mine: number, best: { name: string; modifier: number } | null): Called => ({
    ask: 'skill',
    skillId: 'perception',
    name: 'Perception',
    mine,
    best,
    raise: !best || mine >= best.modifier,
  });

  const row = (name: string) =>
    [...sheet().querySelectorAll('.ss-skill')].find((el) => el.textContent?.includes(name));

  it('shows nothing at all when nothing is being asked', () => {
    setup(fighter(5));
    expect(sheet().querySelector('.ss-called')).toBeNull();
    expect(sheet().querySelector('.ss-skill.is-called')).toBeNull();
  });

  it('marks the called row and says to raise a hand', () => {
    setup(fighter(5), undefined, perception(12, { name: 'Bram', modifier: 4 }));
    const called = sheet().querySelector('.ss-skill.is-called') as HTMLElement;
    expect(called).not.toBeNull();
    expect(called.textContent).toContain('Perception');
    expect(called.textContent).toContain('called');
    expect(sheet().querySelector('.ss-called')?.textContent).toBe('+12 · raise your hand');
    expect(sheet().querySelector('.ss-called')?.className).toContain('is-raise');
  });

  it('names whoever has it instead, and does not read as this player’s moment', () => {
    setup(fighter(5), undefined, perception(0, { name: 'Bram', modifier: 9 }));
    expect(sheet().querySelector('.ss-called')?.textContent).toBe('+0 · Bram has this one');
    expect(sheet().querySelector('.ss-called')?.className).not.toContain('is-raise');
  });

  it('puts the called skill on an abridged list that had dropped it', () => {
    /*
      The reading keeps the eight skills this character is best at, and the
      whole point of the DM asking is that somebody might be short. A
      Fighter with no Perception proficiency has no row for it until asked.
    */
    const plain = fighter(5);
    setup(plain);
    expect(row('Perception')).toBeUndefined();

    cleanup();
    setup(plain, undefined, perception(1, null));
    expect(row('Perception')).toBeDefined();
    expect(sheet().querySelector('.ss-skill.is-called')?.textContent).toContain('Perception');
  });
});
