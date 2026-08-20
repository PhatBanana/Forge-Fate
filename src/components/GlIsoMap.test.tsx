// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { GlIsoMap } from './GlIsoMap';
import { setWebGlProbeForTests } from '../engine/gl/context';
import { createRenderer } from '../engine/gl/renderer';
import { generateDungeon } from '../engine/dungeon';

/**
 * §66.4: which renderer answers, proven in the environment that decides it.
 *
 * jsdom has no WebGL - `getContext` returns null - so the *unmocked* path
 * here is exactly what every other component test in the suite gets: the SVG
 * fallback, with all its DOM hooks. The GL path is reached by forcing the
 * probe and mocking the renderer module, because a canvas in jsdom can never
 * produce a real one.
 */

vi.mock('../engine/gl/renderer', () => ({
  createRenderer: vi.fn(() => null),
}));

const fakeRenderer = () => ({
  update: vi.fn(),
  render: vi.fn(),
  onFrame: vi.fn(),
  resize: vi.fn(),
  destroy: vi.fn(),
});

const dungeon = generateDungeon('x', { rooms: 0, width: 6, height: 5 });

afterEach(() => {
  setWebGlProbeForTests(null);
  vi.mocked(createRenderer).mockReset();
  vi.mocked(createRenderer).mockReturnValue(null);
});

describe('the shared contract (§104)', () => {
  it('draws sprung traps through FFT\'s lens too - the prop §81 gave only the flat map', () => {
    const trapped = { ...dungeon, traps: [{ x: 2, y: 2, note: 'pit' }] };
    const { container, rerender } = render(
      <GlIsoMap dungeon={trapped} sprung={['2,2']} />,
    );
    // The SVG fallback is the real IsoMap; the marker is §81's, restated iso.
    expect(container.querySelector('.dmap-trap.is-sprung')).not.toBeNull();
    // An armed trap on the shared board is not a trap: nothing drawn.
    rerender(<GlIsoMap dungeon={trapped} sprung={[]} />);
    expect(container.querySelector('.dmap-trap')).toBeNull();
  });
});

describe('which renderer answers', () => {
  it('falls back to the SVG in an environment without WebGL - the jsdom default', () => {
    setWebGlProbeForTests(null);
    const { container } = render(<GlIsoMap dungeon={dungeon} />);
    expect(container.querySelector('svg.isomap')).not.toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('mounts the canvas when GL is available, and no SVG beside it', () => {
    setWebGlProbeForTests(true);
    vi.mocked(createRenderer).mockImplementation(() => fakeRenderer());
    const { container } = render(<GlIsoMap dungeon={dungeon} />);
    const canvas = container.querySelector('canvas.dmap.glmap');
    expect(canvas).not.toBeNull();
    // §79: the label counts the board and points at the readable paths.
    expect(canvas?.getAttribute('aria-label')).toMatch(/tactical map/i);
    expect(container.querySelector('svg.isomap')).toBeNull();
    // And the renderer was actually driven, not merely created.
    const built = vi.mocked(createRenderer).mock.results[0].value;
    expect(built.render).toHaveBeenCalled();
  });

  it('degrades to the SVG when the context cannot actually be created', () => {
    // The probe says yes but the canvas says no - a blocked context, or the
    // real jsdom. The component must land on the fallback, not a blank.
    setWebGlProbeForTests(true);
    vi.mocked(createRenderer).mockReturnValue(null);
    const { container } = render(<GlIsoMap dungeon={dungeon} />);
    expect(container.querySelector('svg.isomap')).not.toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('honours the Classic look toggle even where GL is available', () => {
    setWebGlProbeForTests(true);
    vi.mocked(createRenderer).mockImplementation(() => fakeRenderer());
    const { container } = render(<GlIsoMap dungeon={dungeon} classic />);
    expect(container.querySelector('svg.isomap')).not.toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
    expect(createRenderer).not.toHaveBeenCalled();
  });

  it('tears the renderer down on unmount', () => {
    setWebGlProbeForTests(true);
    const built = fakeRenderer();
    vi.mocked(createRenderer).mockReturnValue(built);
    const { unmount } = render(<GlIsoMap dungeon={dungeon} />);
    unmount();
    expect(built.destroy).toHaveBeenCalledTimes(1);
  });
});
