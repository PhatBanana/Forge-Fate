/**
 * The turn order as a strip of unit tiles across the top of the map.
 *
 * The shape is borrowed from squad-tactics games, and it earns its place for
 * the same reason it does there: the two questions a DM asks between turns -
 * "who is up" and "who is about to be" - are questions about a *sequence*, and
 * a horizontal strip reads as a sequence in a way a list does not. The list in
 * the left rail keeps every control; these tiles are the glanceable version,
 * and clicking one selects that combatant exactly as clicking the row does.
 *
 * A tile carries what Final Fantasy Tactics puts on its timeline: the face,
 * the queue number counted from whoever is acting now (1 is up, 2 is next),
 * the name, and the hit bar. Not the raw numbers - the rail has the numbers.
 */

export interface StripTile {
  id: string;
  name: string;
  initiative: number;
  /** Position in the queue counted from the active combatant: 1 is up now. */
  order: number;
  /** The face, as a data URL. Characters with a portrait get theirs. */
  portrait?: string;
  /** Absent for a character who has no derived hp yet. */
  hp?: { now: number; max: number } | null;
  kind: 'character' | 'monster';
  active: boolean;
  selected: boolean;
  /** Bumped when damage lands, replaying the tile's hit animation. */
  flash?: number;
  /** What this combatant's clocks say - "stunned 1", "conc: bless". */
  notes?: string[];
}

export function InitiativeStrip({
  tiles,
  round,
  wrapAfter,
  wrapLabel,
  wrapNotes = [],
  onSelect,
}: {
  tiles: StripTile[];
  /** 0 before the fight starts. */
  round: number;
  /** Insert the round boundary after this displayed index. */
  wrapAfter?: number;
  /** What the boundary says - "R4". */
  wrapLabel?: string;
  /** What ends at that boundary - "Wall of Fire ends". */
  wrapNotes?: string[];
  onSelect: (id: string) => void;
}) {
  if (!tiles.length) return null;
  return (
    <div className="init-strip" role="group" aria-label="Turn order">
      {round > 0 && (
        <span className="init-strip-round">
          <b>R{round}</b>
        </span>
      )}
      {tiles.map((tile, index) => {
        const down = tile.hp ? tile.hp.now === 0 : false;
        const bloodied = tile.hp ? tile.hp.now > 0 && tile.hp.now <= tile.hp.max / 2 : false;
        const button = (
          <button
            type="button"
            className={`strip-tile is-${tile.kind} ${tile.active ? 'is-up' : ''} ${
              tile.selected ? 'is-selected' : ''
            } ${down ? 'is-down' : ''} ${bloodied ? 'is-bloodied' : ''} ${tile.flash ? 'is-hit' : ''}`}
            aria-pressed={tile.selected}
            aria-label={`Show ${tile.name} in the rail`}
            title={
              tile.hp
                ? `${tile.name} — ${tile.hp.now}/${tile.hp.max} hp, initiative ${tile.initiative}`
                : `${tile.name} — initiative ${tile.initiative}`
            }
            onClick={() => onSelect(tile.id)}
          >
            {/* The queue number, blue for the party and red for the enemy -
                the FFT convention, carried by the kind class. */}
            <span className="strip-order">{tile.order}</span>
            <span className="strip-face" aria-hidden="true">
              {tile.portrait ? <img src={tile.portrait} alt="" /> : <i>{tile.name[0]}</i>}
            </span>
            <span className="strip-body">
              <span className="strip-name">{tile.name}</span>
              {tile.hp && (
                <span className="strip-bar" aria-hidden="true">
                  <i style={{ width: `${tile.hp.max ? (tile.hp.now / tile.hp.max) * 100 : 0}%` }} />
                </span>
              )}
              {tile.notes && tile.notes.length > 0 && (
                <span className="strip-notes" title={tile.notes.join(' · ')}>
                  {tile.notes.slice(0, 2).join(' · ')}
                </span>
              )}
            </span>
          </button>
        );
        /*
          The round boundary rides between tiles, FFT's timeline divider:
          everything left of it is this round, everything right is the next -
          and what ends at the wrap is written on the divider itself.
        */
        return (
          <span key={`${tile.id}:${tile.flash ?? 0}`} className="strip-slot">
            {button}
            {index === wrapAfter && wrapLabel && (
              <span className="strip-wrap" title={wrapNotes.join(' · ') || undefined}>
                <b>{wrapLabel}</b>
                {wrapNotes.slice(0, 2).map((note) => (
                  <i key={note}>{note}</i>
                ))}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
