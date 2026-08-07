/**
 * Where a row came from.
 *
 * Every lineage, subclass, feat and background already carried a `source`
 * string - `'PHB'`, `'XGtE'`, `'TCoE'` - and nothing read it. Four tables had
 * honest provenance sitting in them that the app never showed anybody.
 *
 * Closing the set does three things a free string could not. A typo becomes a
 * type error. Each code gets one label written once rather than expanded at
 * each call site. And **`'Forge'` becomes a member**, which is what lets the
 * app tell its own content apart from the books' - the thing section 9 needs.
 *
 * ## Why the SRD is not one of these
 *
 * The System Reference Document is not a book; it is a *subset* of the
 * Player's Handbook released under CC-BY. A Life Cleric is `'PHB'` and is also
 * in the SRD; a Twilight Cleric is `'TCoE'` and is not. Adding `'SRD'` as a
 * source would put those two facts in one field and lose one of them. Which
 * rows the SRD confirms is a separate question, answered by the fixtures in
 * `srdAudit.test.ts`, and it is a question about *verification* rather than
 * about origin.
 */

export type Source =
  // Core.
  | 'PHB'
  | 'PHB 2024'
  | 'DMG'
  // Expansions.
  | 'SCAG'
  | 'XGtE'
  | 'TCoE'
  | 'VGtM'
  | 'FToD'
  | 'BGtG'
  // Setting books.
  | 'EGtW'
  | 'ERLW'
  | 'MOoT'
  | 'VRGtR'
  | 'WBtW'
  | 'SCC'
  | 'DSCS'
  /*
    Reprints. A lineage that appeared in one book and was reissued in another
    is one row with two homes, and both are worth keeping: the first says when
    it arrived, the second says where a table is most likely to look it up.

    `MPMM` and `EEPC` are deliberately *not* members on their own. Nothing in
    the tables uses them that way - every row that touches those books is a
    reprint - and a code nothing uses reads as a book the app covers when it
    does not. `sources.test.ts` fails on an orphan for exactly that reason.
  */
  | 'EEPC/MPMM'
  | 'MPMM/ERLW'
  | 'ERLW/MPMM'
  | 'TCoE/SCAG'
  /**
   * This project's own. Never a published option, never presented as one, and
   * off by default - see `forge/` and the switch that reveals it.
   */
  | 'Forge';

export const SOURCE_LABELS: Record<Source, string> = {
  PHB: "Player's Handbook",
  'PHB 2024': "Player's Handbook (2024)",
  DMG: "Dungeon Master's Guide",
  SCAG: "Sword Coast Adventurer's Guide",
  XGtE: "Xanathar's Guide to Everything",
  TCoE: "Tasha's Cauldron of Everything",
  VGtM: "Volo's Guide to Monsters",
  FToD: "Fizban's Treasury of Dragons",
  BGtG: "Bigby Presents: Glory of the Giants",
  EGtW: "Explorer's Guide to Wildemount",
  ERLW: 'Eberron: Rising from the Last War',
  MOoT: 'Mythic Odysseys of Theros',
  VRGtR: "Van Richten's Guide to Ravenloft",
  WBtW: 'The Wild Beyond the Witchlight',
  SCC: 'Strixhaven: A Curriculum of Chaos',
  DSCS: 'Dark Sun Campaign Setting',
  'EEPC/MPMM': "Elemental Evil Player's Companion, reprinted in Monsters of the Multiverse",
  'MPMM/ERLW': 'Monsters of the Multiverse, first in Eberron: Rising from the Last War',
  'ERLW/MPMM': 'Eberron: Rising from the Last War, reprinted in Monsters of the Multiverse',
  'TCoE/SCAG': "Tasha's Cauldron of Everything, first in the Sword Coast Adventurer's Guide",
  Forge: 'Forge & Fate original — not a published option',
};

/** Whether this is something this project wrote rather than something it read. */
export const isOriginal = (source: Source): boolean => source === 'Forge';

/**
 * The short form for a badge. Everything published shows its book code, which
 * is what a table already says out loud - "that's a Tasha's subclass". The
 * original says what it is in words, because a code would look like one more
 * book somebody had not heard of.
 */
export const shortLabel = (source: Source): string =>
  isOriginal(source) ? 'Forge original' : source;
