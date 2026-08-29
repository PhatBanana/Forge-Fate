import type { Rng } from './dice';
import { defaultRng } from './dice';

/**
 * §157: a name to offer, when the flow asks "What are you called?".
 *
 * Every videogame creator keeps a dice button beside the name field, and it
 * earns its place: a blank field is a blank page, and a suggestion - even a
 * refused one - starts the naming. These are **generated, not listed**:
 * syllables composed at random, flavoured by lineage, so nothing here is
 * anyone's published name table. The player re-rolls until one lands or
 * types their own; the button only ever fills the draft, never the sheet.
 */

interface Family {
  /** Matched against the raceId, first hit wins. */
  match: RegExp;
  starts: string[];
  ends: string[];
  /** Optional middles, used about half the time for a longer name. */
  mids?: string[];
}

const FAMILIES: Family[] = [
  {
    match: /dwarf|duergar/,
    starts: ['Bor', 'Dur', 'Thra', 'Kil', 'Bal', 'Thor', 'Grun', 'Hel', 'Mor', 'Dag'],
    ends: ['in', 'din', 'li', 'mir', 'nar', 'grim', 'dur', 'bek', 'ra', 'gita'],
  },
  {
    match: /elf|eladrin/,
    starts: ['Ael', 'Syl', 'Thal', 'Ela', 'Fen', 'Lor', 'Cael', 'Ari', 'Vara', 'Ily'],
    mids: ['a', 'i', 'e', 'ora', 'ind'],
    ends: ['rion', 'wen', 'dil', 'thas', 'riel', 'las', 'nna', 'dor'],
  },
  {
    match: /halfling/,
    starts: ['Mer', 'Pip', 'Ros', 'Tan', 'Wil', 'Cor', 'Bel', 'Dav'],
    ends: ['ry', 'la', 'doc', 'bo', 'na', 'ver', 'po', 'dle'],
  },
  {
    match: /gnome/,
    starts: ['Fizz', 'Bim', 'Nack', 'Wren', 'Zook', 'Ell', 'Glim', 'Pog'],
    ends: ['wick', 'ble', 'ini', 'bert', 'nock', 'do', 'phee'],
  },
  {
    match: /dragonborn/,
    starts: ['Bala', 'Kriv', 'Rha', 'Sor', 'Tor', 'Arj', 'Med', 'Nala'],
    ends: ['sar', 'rax', 'gar', 'han', 'thys', 'esh', 'kan'],
  },
  {
    match: /tiefling/,
    starts: ['Mal', 'Aza', 'Zeph', 'Kai', 'Lev', 'Mor', 'Sera', 'Dam'],
    ends: ['ice', 'riel', 'on', 'ius', 'eth', 'ara', 'akos'],
  },
  {
    match: /orc/,
    starts: ['Gra', 'Thok', 'Ur', 'Sha', 'Kar', 'Mog', 'Bru', 'Yaz'],
    ends: ['sh', 'gar', 'tha', 'ruk', 'za', 'dek', 'ka'],
  },
  {
    // Humans and everyone unmatched: broad, pronounceable, unplaceable.
    match: /./,
    starts: ['Al', 'Bran', 'Ced', 'El', 'Mar', 'Ro', 'Ser', 'Ta', 'Iss', 'Cor'],
    mids: ['a', 'e', 'i', 'o', 'an', 'el'],
    ends: ['ric', 'wyn', 'dan', 'lia', 'ton', 'mund', 'ra', 'ys', 'beth'],
  },
];

const pick = <T,>(from: T[], rng: Rng): T => from[Math.floor(rng() * from.length) % from.length];

export function suggestName(raceId: string, rng: Rng = defaultRng): string {
  const family = FAMILIES.find((f) => f.match.test(raceId)) ?? FAMILIES[FAMILIES.length - 1];
  const start = pick(family.starts, rng);
  // A middle about half the time, where the family has any - two beats
  // reads sturdy, three reads storied, and a table wants both on offer.
  const mid = family.mids && rng() < 0.5 ? pick(family.mids, rng) : '';
  const end = pick(family.ends, rng);
  return `${start}${mid}${end}`;
}
