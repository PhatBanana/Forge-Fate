import { Panel } from './shared';
import type { Say } from '../toast';

/** One character at nought, and what the table knows about how. */
export interface FallenSoul {
  id: string;
  name: string;
  /** Dead by the dice: three failed death saves. */
  deadByDice: boolean;
  /** Where they fell - the delve and its room, when there was one. */
  where?: string;
  /** Already written into the campaign's roll. */
  onRoll: boolean;
}

/**
 * §108: the roll of the Fallen (§91).
 *
 * **Nobody dies by app.** The panel lists who is at nought and offers
 * one button, and that button writes a name into the campaign - it does
 * not kill anybody. The character stays on the roster and the ruling
 * stays the DM's, which is why the only verb here is "lay to rest".
 *
 * Peeled with the fight's knowledge already resolved: who is down, and
 * where they fell, are the battle screen's to work out. What is left is
 * the roll, the list and the one irreversible-feeling button - which is
 * exactly what a panel should be.
 */
export function FallenPanel({
  down,
  onLay,
  say,
}: {
  down: FallenSoul[];
  /** Write this name into the campaign's roll of the Fallen. */
  onLay: (soul: FallenSoul) => void;
  say?: Say;
}) {
  if (!down.length) return null;
  return (
    <Panel
      title="The fallen"
      subtitle="Nobody dies by app. Laying someone to rest writes their name into the campaign — the character stays on the roster, and the ruling stays yours."
    >
      {down.map((soul) => (
        <p key={soul.id} className="zone-row">
          <b>{soul.name}</b>
          <span className="src">
            {' '}
            · at nought
            {soul.deadByDice ? ' · dead by the dice' : ''}
            {soul.where ? ` · ${soul.where}` : ''}
          </span>{' '}
          {soul.onRoll ? (
            <span className="src">· on the roll</span>
          ) : (
            <button
              className="btn btn-sm"
              aria-label={`Lay ${soul.name} to rest`}
              title="Write their name into the campaign's roll of the Fallen"
              onClick={() => {
                onLay(soul);
                say?.(`${soul.name} joins the Fallen.`);
              }}
            >
              Lay to rest
            </button>
          )}
        </p>
      ))}
    </Panel>
  );
}
