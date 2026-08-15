import { useEffect, useState } from 'react';

/**
 * §79: whether this user asked for stillness.
 *
 * The CSS block in index.css neutralises CSS animation for
 * `prefers-reduced-motion: reduce` - and reached none of the GL board's
 * motion, which is JavaScript driving a canvas: attack lunges, hit shake,
 * damage flashes, walk interpolation, the death dissolve. All of it played
 * at full amplitude for exactly the people who asked it not to. This hook
 * is the preference made readable from the renderer, live - flipping the
 * OS switch mid-fight takes effect on the next animation, not the next
 * reload.
 *
 * Guarded for jsdom, where `matchMedia` may not exist: tests and any
 * environment without the API get `false`, which is the old behaviour.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    // Older WebKit shipped add/removeListener only; both shapes are guarded.
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  return reduced;
}
