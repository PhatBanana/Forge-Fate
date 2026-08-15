// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DungeonsTab } from './DungeonsTab';

/**
 * The dungeon workshop.
 *
 * The brushes moved here from the battle screen, and so did their tests: a
 * paint lands in the draft, the same stroke erases, Raise stacks. What is
 * new is the drawer - save under a name, reload, and the map is still
 * there, which is the whole point of building it away from the fight.
 */

const mapSvg = () => document.querySelector('.dmap') as SVGSVGElement;

/** jsdom gives every element a zero box, so hand the map one. */
const giveMapABox = () => {
  mapSvg().getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 480, height: 360, right: 480, bottom: 360, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
};

beforeEach(() => localStorage.clear());

describe('the brushes', () => {
  it('paints a pillar into the draft', async () => {
    const user = userEvent.setup();
    render(<DungeonsTab />);
    await user.click(screen.getByRole('button', { name: 'Pillar' }));
    giveMapABox();
    // 480px over 48 squares is 10px a square: this lands on square 5,4.
    fireEvent.pointerDown(mapSvg(), { clientX: 55, clientY: 45 });
    expect(document.querySelector('.dmap-t-pillar')).toBeTruthy();
  });

  it('erases by painting the same thing again, and Clear all retires with it', async () => {
    const user = userEvent.setup();
    render(<DungeonsTab />);
    await user.click(screen.getByRole('button', { name: 'Pillar' }));
    giveMapABox();
    fireEvent.pointerDown(mapSvg(), { clientX: 55, clientY: 45 });
    fireEvent.pointerUp(mapSvg());
    expect(screen.getByRole('button', { name: /clear all/i })).toBeInTheDocument();
    fireEvent.pointerDown(mapSvg(), { clientX: 55, clientY: 45 });
    expect(document.querySelector('.dmap-t-pillar')).toBeNull();
    // Nothing painted: the button has nothing to clear and says so by leaving.
    expect(screen.queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument();
  });

  it('raises a square twice and writes the level on the map', async () => {
    const user = userEvent.setup();
    render(<DungeonsTab />);
    await user.click(screen.getByRole('button', { name: /raise/i }));
    giveMapABox();
    fireEvent.pointerDown(mapSvg(), { clientX: 105, clientY: 105 });
    fireEvent.pointerUp(mapSvg());
    fireEvent.pointerDown(mapSvg(), { clientX: 105, clientY: 105 });
    expect(screen.getByText('+2')).toBeInTheDocument();
  });
});

/**
 * §81. The furniture tools. Each one is a click on a square that changes the
 * architecture rather than the paint, so each is checked by what it leaves on
 * the drawing - which is also what the battle screen will read.
 */
describe('the furniture tools', () => {
  /** Room 1 of the default map holds square 5,4 - where the brush tests paint. */
  const clickSquare = (x: number, y: number) => {
    giveMapABox();
    fireEvent.pointerDown(mapSvg(), { clientX: x * 10 + 5, clientY: y * 10 + 5 });
    fireEvent.pointerUp(mapSvg());
  };

  it('cycles a door through barred and away again', async () => {
    const user = userEvent.setup();
    render(<DungeonsTab />);
    // A room of our own, so the square is certainly inside one.
    await user.click(screen.getByRole('button', { name: 'Room' }));
    giveMapABox();
    fireEvent.pointerDown(mapSvg(), { clientX: 25, clientY: 25 });
    fireEvent.pointerMove(mapSvg(), { clientX: 65, clientY: 65 });
    fireEvent.pointerUp(mapSvg());

    /* The default map is generated and already carries doors of its own, so
       this counts the change rather than the total. No generated door is
       locked, which makes the bar a clean zero to start from. */
    const doors = () => document.querySelectorAll('.dmap-door').length;
    const bars = () => document.querySelectorAll('.dmap-bar').length;

    await user.click(screen.getByRole('button', { name: 'Door' }));
    const before = doors();
    expect(bars()).toBe(0);

    clickSquare(3, 3);
    expect(doors()).toBe(before + 1);
    expect(bars()).toBe(0);

    clickSquare(3, 3);
    expect(doors()).toBe(before + 1);
    expect(bars()).toBe(1);

    clickSquare(3, 3);
    expect(doors()).toBe(before);
    expect(bars()).toBe(0);
  });

  it('hides a room, and says so on the editor’s own map', async () => {
    const user = userEvent.setup();
    render(<DungeonsTab />);
    await user.click(screen.getByRole('button', { name: 'Hidden' }));
    clickSquare(5, 4);
    // The editor draws it dashed, because this is where it is authored. The
    // battle screen is handed a dungeon without it at all - see the engine.
    expect(document.querySelector('.dmap-room.is-hidden')).toBeTruthy();
    clickSquare(5, 4);
    expect(document.querySelector('.dmap-room.is-hidden')).toBeNull();
  });

  it('arms a trap with the DM’s own words, anywhere on the grid', async () => {
    const user = userEvent.setup();
    render(<DungeonsTab />);
    await user.click(screen.getByRole('button', { name: 'Trap' }));
    await user.type(screen.getByLabelText(/what it does/i), 'scything blade, DC 15 Dex');
    clickSquare(5, 4);

    const trap = document.querySelector('.dmap-trap');
    expect(trap).toBeTruthy();
    expect(trap?.querySelector('title')?.textContent).toMatch(/scything blade/);

    // Armed, not sprung - the editor shows both states differently.
    expect(document.querySelector('.dmap-trap.is-sprung')).toBeNull();
    clickSquare(5, 4);
    expect(document.querySelector('.dmap-trap')).toBeNull();
  });

  it('carries all three into the drawer and back', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<DungeonsTab />);
    await user.click(screen.getByRole('button', { name: 'Hidden' }));
    clickSquare(5, 4);
    await user.click(screen.getByRole('button', { name: 'Trap' }));
    clickSquare(6, 4);

    await user.type(screen.getByLabelText(/name this dungeon/i), 'the sunken abbey');
    await user.click(screen.getByRole('button', { name: /save this map/i }));
    unmount();

    render(<DungeonsTab />);
    await user.click(screen.getByRole('button', { name: /open the sunken abbey/i }));
    expect(document.querySelector('.dmap-room.is-hidden')).toBeTruthy();
    expect(document.querySelector('.dmap-trap')).toBeTruthy();
  });
});

describe('the generator inputs', () => {
  it('drives the map from seed, size and rooms', async () => {
    const user = userEvent.setup();
    render(<DungeonsTab />);
    expect(mapSvg().getAttribute('aria-label')).toMatch(/from seed first light/i);

    await user.clear(screen.getByLabelText(/map seed/i));
    await user.type(screen.getByLabelText(/map seed/i), 'the sunken abbey');
    expect(mapSvg().getAttribute('aria-label')).toMatch(/from seed the sunken abbey/i);

    fireEvent.change(screen.getByLabelText(/how many rooms/i), { target: { value: '0' } });
    expect(screen.getByText(/blank grid/i)).toBeInTheDocument();
  });
});

describe('the drawer', () => {
  it('saves under a name, survives a remount, loads back and deletes', async () => {
    const user = userEvent.setup();
    const first = render(<DungeonsTab />);

    await user.clear(screen.getByLabelText(/map seed/i));
    await user.type(screen.getByLabelText(/map seed/i), 'the kennel');
    await user.click(screen.getByRole('button', { name: 'Pillar' }));
    giveMapABox();
    fireEvent.pointerDown(mapSvg(), { clientX: 55, clientY: 45 });
    await user.click(screen.getByRole('button', { name: 'Pillar' }));

    await user.type(screen.getByLabelText(/name this dungeon/i), 'the kennel, level B2');
    await user.click(screen.getByRole('button', { name: /save this map/i }));

    // The store took it, whole.
    const raw = JSON.parse(localStorage.getItem('dnd-forge:dungeons:v1')!);
    expect(raw.dungeons).toHaveLength(1);
    expect(raw.dungeons[0].map.mapSeed).toBe('the kennel');
    expect(raw.dungeons[0].map.terrain).toEqual({ '5,4': 'pillar' });

    // A fresh mount reads it back; Open restores the draft.
    first.unmount();
    render(<DungeonsTab />);
    expect(screen.getByText('the kennel, level B2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /open the kennel/i }));
    expect((screen.getByLabelText(/map seed/i) as HTMLInputElement).value).toBe('the kennel');
    expect(document.querySelector('.dmap-t-pillar')).toBeTruthy();

    // §76: delete asks first, and Keep declines.
    await user.click(screen.getByRole('button', { name: /delete the kennel/i }));
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.getByText('the kennel, level B2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /delete the kennel/i }));
    await user.click(screen.getByRole('button', { name: /really delete/i }));
    expect(screen.getByText(/nothing saved yet/i)).toBeInTheDocument();
  });

  it('carries "Use in a battle" on a saved row and hands over the id (§77)', async () => {
    localStorage.setItem(
      'dnd-forge:dungeons:v1',
      JSON.stringify({
        dungeons: [
          { id: 'd9', name: 'the vault', savedAt: 1, map: { mapSeed: 'x', mapSize: 'small', mapRooms: 2 } },
        ],
      }),
    );
    const user = userEvent.setup();
    const onBattle = vi.fn();
    render(<DungeonsTab onBattle={onBattle} />);

    await user.click(screen.getByRole('button', { name: /use the vault in a battle/i }));
    expect(onBattle).toHaveBeenCalledWith('d9');
  });
});
