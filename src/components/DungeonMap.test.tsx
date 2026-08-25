// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { DungeonMap } from './DungeonMap';
import type { Token } from './DungeonMap';
import { generateDungeon } from '../engine/dungeon';

/*
  §148. What the party has not seen is not on the map.

  Fog was a wash, and a wash at nine-tenths opacity still shows the tenth:
  the outline of a room nobody had entered, its number, its doors. Every
  case here is about *absence* rather than dimness, because dimness is what
  the bug looked like from the outside - the picture was atmospheric and
  wrong at the same time.
*/

const dungeon = generateDungeon('fog-seed', { rooms: 4, width: 20, height: 16 });

/** The group that holds the dungeon's fabric - rooms, doors, corridors. */
const fabricOf = (container: HTMLElement) =>
  container.querySelector('.dmap-room')?.closest('g[clip-path]') ?? null;

/** The squares a clip path actually admits, read back off its subpaths. */
const admitted = (container: HTMLElement): Set<string> => {
  const d = container.querySelector('clipPath path')?.getAttribute('d') ?? '';
  const out = new Set<string>();
  // Each subpath opens "M <x*CELL> <y*CELL>"; CELL is 14 in the drawing.
  for (const move of d.matchAll(/M (-?\d+) (-?\d+)/g)) {
    out.add(`${Number(move[1]) / 14},${Number(move[2]) / 14}`);
  }
  return out;
};

describe('the fog governs what is drawn, not just how brightly', () => {
  it('admits exactly the squares the party has explored', () => {
    const explored = new Set(['3,3', '3,4', '4,3']);
    const { container } = render(
      <DungeonMap dungeon={dungeon} fog={{ visible: new Set(['3,3']), explored }} />,
    );
    expect(admitted(container)).toEqual(explored);
  });

  it('clips the rooms, the doors and the corridors with it', () => {
    const { container } = render(
      <DungeonMap
        dungeon={dungeon}
        fog={{ visible: new Set(['3,3']), explored: new Set(['3,3']) }}
      />,
    );
    const fabric = fabricOf(container);
    expect(fabric).not.toBeNull();
    // One group, so a layer added later is honest without being asked.
    expect(fabric!.querySelector('.dmap-door, .dmap-floor')).not.toBeNull();
  });

  it('draws nothing of the dungeon before anybody has been anywhere', () => {
    const { container } = render(
      <DungeonMap dungeon={dungeon} fog={{ visible: new Set(), explored: new Set() }} />,
    );
    // An empty clip is legal and says exactly the right thing.
    expect(admitted(container).size).toBe(0);
    expect(fabricOf(container)).not.toBeNull();
  });

  it('clips nothing at all when no fog was given - the editor and the page', () => {
    const { container } = render(<DungeonMap dungeon={dungeon} authoring />);
    expect(container.querySelector('clipPath')).toBeNull();
    expect(fabricOf(container)).toBeNull();
    expect(container.querySelector('.dmap-room')).not.toBeNull();
  });

  it('leaves the DM’s own tools outside the clip - they are not party sight', () => {
    const { container } = render(
      <DungeonMap
        dungeon={dungeon}
        fog={{ visible: new Set(['3,3']), explored: new Set(['3,3']) }}
        reach={[{ at: { x: 9, y: 9 } }]}
      />,
    );
    // The reach wash is the DM measuring, and a measurement that stopped at
    // the fog would be a worse lie than the one this section fixed.
    const wash = container.querySelector('.dmap-reach');
    expect(wash).not.toBeNull();
    expect(wash!.closest('g[clip-path]')).toBeNull();
  });
});

/*
  §149. A monster is its own shape and its own colour, even on the plan.

  The top-down map is the default view, so art that only existed in the
  tactical one would be art most tables never saw. What it gets is the
  simple version - a family outline, the monster's colour and the size line -
  because a plan drawing that turned into a cartoon would have cost more
  than it gained.
*/

const beast = (over: Partial<Token['beast']> = {}): Token['beast'] => ({
  monsterId: 'goblin',
  family: 'humanoid',
  primary: [0.35, 0.5, 0.25],
  secondary: [0.5, 0.32, 0.2],
  glow: [0.95, 0.8, 0.3],
  scale: 1,
  ...over,
});

const tokenOf = (over: Partial<Token> = {}): Token => ({
  id: 'm1',
  label: 'GO',
  at: { x: 2, y: 2 },
  kind: 'monster',
  title: 'Goblin',
  ...over,
});

describe('what a monster stands as on the flat map', () => {
  it('draws its family’s outline rather than the party’s disc', () => {
    const { container } = render(
      <DungeonMap dungeon={dungeon} tokens={[tokenOf({ beast: beast() })]} />,
    );
    const pawn = container.querySelector('.dmap-token polygon.pawn');
    expect(pawn).not.toBeNull();
    expect(pawn!.getAttribute('data-family')).toBe('humanoid');
  });

  it('gives two families two different outlines', () => {
    const points = (family: NonNullable<Token['beast']>['family']) => {
      const { container } = render(
        <DungeonMap dungeon={dungeon} tokens={[tokenOf({ beast: beast({ family }) })]} />,
      );
      return container.querySelector('.dmap-token polygon.pawn')?.getAttribute('points') ?? '';
    };
    expect(points('dragon')).not.toBe(points('undead'));
    expect(points('beast')).not.toBe(points('construct'));
  });

  it('grows the outline with the size line', () => {
    const spread = (scale: number) => {
      const { container } = render(
        <DungeonMap dungeon={dungeon} tokens={[tokenOf({ beast: beast({ scale }) })]} />,
      );
      const points = container
        .querySelector('.dmap-token polygon.pawn')!
        .getAttribute('points')!
        .split(/[ ,]/)
        .map(Number);
      return Math.max(...points.map(Math.abs));
    };
    expect(spread(2.7)).toBeGreaterThan(spread(1));
    expect(spread(0.62)).toBeLessThan(spread(1));
  });

  it('carries the monster’s colour, and ink that can be read on it', () => {
    const { container } = render(
      <DungeonMap
        dungeon={dungeon}
        tokens={[tokenOf({ beast: beast({ primary: [0.05, 0.05, 0.05] }) })]}
      />,
    );
    const group = container.querySelector('.dmap-token') as SVGGElement;
    expect(group.style.getPropertyValue('--pawn')).toBe('rgb(13 13 13)');
    // Initials in the map's own dark ink would vanish on a black pudding.
    expect(group.style.getPropertyValue('--pawn-ink')).toBe('var(--paper)');
  });

  it('keeps the disc for the party, who should not need decoding', () => {
    const { container } = render(
      <DungeonMap
        dungeon={dungeon}
        tokens={[tokenOf({ id: 'c1', kind: 'character', label: 'NY', title: 'Nyx' })]}
      />,
    );
    expect(container.querySelector('.dmap-token circle.pawn')).not.toBeNull();
    expect(container.querySelector('.dmap-token polygon.pawn')).toBeNull();
  });

  it('still shows the initials, because two goblins are two goblins', () => {
    const { container } = render(
      <DungeonMap dungeon={dungeon} tokens={[tokenOf({ label: 'GB', beast: beast() })]} />,
    );
    expect(container.querySelector('.dmap-token text')?.textContent).toBe('GB');
  });
});
