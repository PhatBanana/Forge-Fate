/**
 * The languages a character can speak.
 *
 * `Build.languages` has been a list of strings since proficiencies were
 * modelled, the proficiency engine has always read it, and the printed sheet
 * has always listed it - but nothing anywhere ever wrote to it. The Builder
 * would tell you "2 extra languages to choose" and then offer nowhere to
 * choose them, which is worse than not mentioning it. This is the list that
 * closes that.
 *
 * Standard and exotic is the book's own split, and it matters: a DM can
 * reasonably refuse an exotic language to a starting character, so which side
 * of the line one falls on is worth showing rather than hiding.
 */

export type LanguageKind = 'standard' | 'exotic' | 'secret';

export const LANGUAGE_KIND_LABELS: Record<LanguageKind, string> = {
  standard: 'Standard',
  exotic: 'Exotic',
  secret: 'Secret',
};

export interface Language {
  name: string;
  kind: LanguageKind;
  /** Who speaks it, and anything worth knowing. Only where it earns the line. */
  note?: string;
}

export const LANGUAGES: Language[] = [
  { name: 'Common', kind: 'standard', note: 'Everyone has this one; it is rarely worth a pick.' },
  { name: 'Dwarvish', kind: 'standard' },
  { name: 'Elvish', kind: 'standard' },
  { name: 'Giant', kind: 'standard' },
  { name: 'Gnomish', kind: 'standard' },
  { name: 'Goblin', kind: 'standard' },
  { name: 'Halfling', kind: 'standard' },
  { name: 'Orc', kind: 'standard' },

  { name: 'Abyssal', kind: 'exotic', note: 'Demons.' },
  { name: 'Celestial', kind: 'exotic' },
  { name: 'Deep Speech', kind: 'exotic', note: 'Aboleths and mind flayers.' },
  {
    name: 'Draconic',
    kind: 'exotic',
    note: 'Dragons, and most of the written magic in the world. The most useful exotic language by a distance.',
  },
  { name: 'Infernal', kind: 'exotic', note: 'Devils.' },
  { name: 'Primordial', kind: 'exotic', note: 'Elementals. Aquan, Auran, Ignan and Terran are its dialects.' },
  { name: 'Sylvan', kind: 'exotic', note: 'Fey.' },
  { name: 'Undercommon', kind: 'exotic', note: 'The trade tongue of the Underdark.' },

  {
    name: 'Druidic',
    kind: 'secret',
    note: 'Druids only, and it comes with the class rather than being chosen.',
  },
  {
    name: "Thieves' Cant",
    kind: 'secret',
    note: 'Rogues only, and it comes with the class rather than being chosen.',
  },
];

export const LANGUAGE_NAMES: string[] = LANGUAGES.map((l) => l.name);

export function languageByName(name: string): Language | undefined {
  return LANGUAGES.find((l) => l.name === name);
}
