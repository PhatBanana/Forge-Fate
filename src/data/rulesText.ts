import { srdKey } from './srd/names';

/**
 * The full rules text, loaded only when somebody asks to read some.
 *
 * Everywhere else in this app the rules are *summarised* - a one-line verdict
 * is what a builder needs while you are choosing, and a paragraph in every card
 * would bury the ranking underneath it. But once you have chosen, "what does
 * this actually do" is a fair question, and answering it with a link to a
 * rulebook is a poor answer for a tool that is meant to be usable at a table.
 *
 * So both: the verdict while you build, the text when you look closer.
 *
 * ## Why this is a dynamic import
 *
 * The text is ~544 kB, larger than every other data table in the app put
 * together. Loading it up front to serve the small number of entries anyone
 * actually opens would be a poor trade, so it lives in its own chunk fetched on
 * the first expand and cached from then on. `vite.config.ts` excludes
 * `src/data/srd/` from the `data` chunk to keep it that way - if that exclusion
 * is ever lost, this file's cost silently lands on every visitor.
 *
 * ## Why only some entries have it
 *
 * SRD 5.1 is CC-BY-4.0, so its text may be reproduced with attribution. The
 * ~25 spells and ~9 items this app carries from outside the SRD have no
 * licensed text and none is invented for them: `rulesTextFor` returns null and
 * the UI says why. That asymmetry is the licence showing through, and it is
 * better stated than papered over.
 */

export type RulesTextKind = 'spell' | 'magicItem';

interface TextBundle {
  spells: Record<string, string[]>;
  magicItems: Record<string, string[]>;
}

let pending: Promise<TextBundle> | null = null;

/** Fetches the text chunk once; every later caller gets the same promise. */
export function loadRulesText(): Promise<TextBundle> {
  pending ??= import('./srd/srd-2014-text.json').then(
    (module) => (module.default as { records: TextBundle }).records,
  );
  return pending;
}

/**
 * The text for one entry, by the name the *app* uses.
 *
 * The SRD strips the wizards' names off seventeen spells - Tenser's Floating
 * Disk is filed as "Floating Disk" - so the lookup goes through the same
 * translation the data audit uses rather than a second copy of it.
 */
export function rulesTextFor(
  bundle: TextBundle,
  kind: RulesTextKind,
  name: string,
): string[] | null {
  const table = kind === 'spell' ? bundle.spells : bundle.magicItems;
  return table[srdKey(name)] ?? null;
}
