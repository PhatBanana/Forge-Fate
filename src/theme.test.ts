// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import css from './index.css?raw';
import {
  applyTheme,
  loadThemeChoice,
  resolveTheme,
  saveThemeChoice,
  systemTheme,
} from './theme';

/** A `matchMedia` that answers the dark query however the test wants. */
function systemPrefers(dark: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: dark && query.includes('dark'),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('which theme is on', () => {
  it('follows the system when nobody has chosen', () => {
    systemPrefers(true);
    expect(loadThemeChoice()).toBe('system');
    expect(resolveTheme('system')).toBe('dark');
    systemPrefers(false);
    expect(resolveTheme('system')).toBe('light');
  });

  it('remembers a choice and prefers it over the system', () => {
    systemPrefers(true);
    saveThemeChoice('light');
    expect(loadThemeChoice()).toBe('light');
    expect(resolveTheme(loadThemeChoice())).toBe('light');
  });

  /**
   * Choosing what the system was giving you anyway is not a preference, so the
   * app stores nothing and goes back to following the machine - which is what
   * makes a laptop that flips at sunset keep working after you have touched
   * the switch once and set it back.
   */
  it('clears the choice rather than pinning it to the system value', () => {
    saveThemeChoice('dark');
    expect(localStorage.getItem('dnd-forge:theme:v1')).toBe('dark');
    saveThemeChoice('system');
    expect(localStorage.getItem('dnd-forge:theme:v1')).toBeNull();
    expect(loadThemeChoice()).toBe('system');
  });

  it('survives storage being unavailable', () => {
    const boom = () => { throw new Error('denied'); };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);
    systemPrefers(false);
    expect(loadThemeChoice()).toBe('system');
    expect(() => saveThemeChoice('dark')).not.toThrow();
    vi.restoreAllMocks();
  });

  /** Parchment is the bare `:root`, so only dark is ever an attribute. */
  it('marks the root for dark and leaves it bare for light', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it('treats a machine with no opinion as parchment', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(systemTheme()).toBe('light');
  });
});

/**
 * Contrast, checked against the stylesheet itself.
 *
 * The palettes are the one place in this app where a number is chosen by eye,
 * and eyes are worse at this than arithmetic - the dark theme spent months
 * outlining panels at 1.09:1 before anyone said so out loud. So the ratios are
 * asserted rather than trusted, on both palettes, from the values actually in
 * `index.css` rather than a copy of them here that could drift.
 */
function palette(scope: string): Record<string, string> {
  const block = css.slice(css.indexOf(scope));
  const body = block.slice(block.indexOf('{'), block.indexOf('}'));
  const out: Record<string, string> = {};
  for (const [, name, value] of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[name] = value;
  return out;
}

function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const parts = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe.each([
  ['parchment', ':root {'],
  ['dark', ":root[data-theme='dark'] {"],
])('the %s palette', (_name, scope) => {
  const p = palette(scope);

  it('reads at 4.5:1 or better for every text colour', () => {
    const failures: string[] = [];
    for (const name of ['text', 'text-dim', 'text-faint', 'accent', 'sky', 'blue', 'orange', 'red', 'green']) {
      const ratio = contrast(p[name], p.panel);
      if (ratio < 4.5) failures.push(`--${name} on --panel is ${ratio.toFixed(2)}:1`);
    }
    expect(failures).toEqual([]);
  });

  it('draws an edge you can see', () => {
    // 2:1 is below the 3:1 a control would want and is a deliberate floor for
    // a *decorative* boundary - enough to read as a drawn line at 1px.
    expect(contrast(p.border, p.panel)).toBeGreaterThanOrEqual(2);
    expect(contrast(p['border-strong'], p.panel)).toBeGreaterThanOrEqual(3);
    // And the inner rule stays quieter than the edge, or the hierarchy inverts.
    expect(contrast(p['border-soft'], p.panel)).toBeLessThan(contrast(p.border, p.panel));
  });

  it('keeps text legible on the accent fill and in an input well', () => {
    expect(contrast(p['on-accent'], p.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.text, p['bg-sunken'])).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * The character sheet has a palette of its own.
 *
 * It is ink on paper in *both* themes - that is the whole conceit, and it is
 * why the sheet reads `--ink` rather than `--text`. Which means these colours
 * are never re-checked by the two palette suites above, and a value picked for
 * a dark panel that wandered in here would sit unreadable on cream with
 * nothing to catch it. So the sheet is held to the same bar, once.
 */
describe('the sheet, which is paper in either theme', () => {
  // `.cs, .mc, .dmap` - the character sheet, a monster's stat block and a
  // dungeon map share one declaration of the ink palette, so this suite covers
  // all three. If that selector is ever split, this lookup fails loudly rather
  // than quietly checking one of them.
  const p = palette('.cs, .mc, .dmap {');

  it('reads at 4.5:1 or better for every ink on the paper', () => {
    const failures: string[] = [];
    for (const name of ['ink', 'ink-dim', 'ink-faint', 'ink-good', 'ink-bad', 'ink-accent']) {
      const ratio = contrast(p[name], p.paper);
      if (ratio < 4.5) failures.push(`--${name} on --paper is ${ratio.toFixed(2)}:1`);
    }
    expect(failures).toEqual([]);
  });

  it('draws a rule you can see, and keeps paper legible on the accent fill', () => {
    expect(contrast(p.rule, p.paper)).toBeGreaterThanOrEqual(2);
    // `.cs-roll:active` and the chosen advantage mode invert to paper on ink.
    expect(contrast(p.paper, p['ink-accent'])).toBeGreaterThanOrEqual(4.5);
  });
});
