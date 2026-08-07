/**
 * Which palette the app is wearing.
 *
 * Three states, not two. `'light'` and `'dark'` are choices someone made and
 * are remembered; `'system'` is the absence of a choice, and follows the
 * operating system for as long as it stays absent - so a laptop that switches
 * to dark at sunset takes the app with it, right up until someone says
 * otherwise, and then their say holds.
 *
 * The theme is deliberately *not* part of a Build. It belongs to the browser
 * you are sitting at rather than to the character, so it never lands on the
 * undo stack, never travels in a share link, and switching character does not
 * switch the lights.
 */

export type Theme = 'light' | 'dark';
export type ThemeChoice = Theme | 'system';

const KEY = 'dnd-forge:theme:v1';

/** Parchment unless the machine asks for dark. */
export function systemTheme(): Theme {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function loadThemeChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    // Private browsing, or storage disabled. Following the system is a fine
    // answer and is what someone with no saved choice would get anyway.
    return 'system';
  }
}

export function saveThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Not being able to remember it is not a reason to refuse to apply it.
  }
}

export function resolveTheme(choice: ThemeChoice): Theme {
  return choice === 'system' ? systemTheme() : choice;
}

/**
 * `data-theme` is set on the root element rather than swapping a stylesheet,
 * so the whole palette is one attribute and nothing has to re-render to
 * follow it. The light palette is the bare `:root`, so the attribute is only
 * ever present for dark.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'dark') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
}
