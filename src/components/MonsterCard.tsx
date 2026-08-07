import { ABILITIES } from '../types';
import type { Monster, MonsterAbility } from '../data/monsters';
import { formatCr, formatSpeed, monsterMod } from '../data/monsters';
import { CONDITIONS_BY_ID } from '../data/conditions';

/**
 * A stat block, laid out the way the books lay one out.
 *
 * Deliberately not a card of the app's own design. A DM reads hundreds of
 * these and reads them fast, and the order the books use - the line, the
 * abilities, the defences, then traits, actions, reactions, legendary actions -
 * is the order their eye already goes in. Reordering it into something tidier
 * would cost the one thing this has to be, which is scannable at speed.
 *
 * It prints, because a stat block is a thing you put on the table.
 */

const signed = (value: number) => (value >= 0 ? `+${value}` : `${value}`);

/** "STR 8 (-1)" - the score and the modifier, since a stat block gives both. */
function Scores({ monster }: { monster: Monster }) {
  return (
    <div className="mc-scores">
      {ABILITIES.map((ability) => (
        <div key={ability}>
          <span className="mc-score-key">{ability.toUpperCase()}</span>
          <b>{monster.scores[ability]}</b>
          <span className="mc-score-mod">({signed(monsterMod(monster.scores[ability]))})</span>
        </div>
      ))}
    </div>
  );
}

/** One labelled line of the defences block, rendered only when it has content. */
function Line({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <p className="mc-line">
      <b>{label}</b> {value}
    </p>
  );
}

function Ability({ ability }: { ability: MonsterAbility }) {
  return (
    <p className="mc-ability">
      <b>{ability.name}.</b>
      {ability.usage && <em> ({ability.usage})</em>} {ability.desc}
    </p>
  );
}

export function MonsterCard({ monster }: { monster: Monster }) {
  const list = (entries: Record<string, number>) =>
    Object.entries(entries)
      .map(([key, value]) => `${key[0].toUpperCase()}${key.slice(1)} ${signed(value)}`)
      .join(', ');

  const senses = [
    ...Object.entries(monster.senses).map(([kind, value]) =>
      `${kind} ${typeof value === 'number' ? `${value} ft.` : value}`,
    ),
    `passive Perception ${monster.passivePerception}`,
  ].join(', ');

  return (
    <article className="mc">
      <header>
        <h3>{monster.name}</h3>
        <p className="mc-kind">
          {monster.size} {monster.type}
          {monster.subtype ? ` (${monster.subtype})` : ''}, {monster.alignment}
        </p>
      </header>

      <div className="mc-top">
        <Line
          label="Armor Class"
          value={`${monster.ac}${monster.acNote ? ` (${monster.acNote})` : ''}`}
        />
        {/* Both, because a DM rolling hit points needs the dice and a DM using
            the printed average needs the number. */}
        <Line
          label="Hit Points"
          value={`${monster.hp}${monster.hpRoll ? ` (${monster.hpRoll})` : ''}`}
        />
        <Line label="Speed" value={formatSpeed(monster)} />
      </div>

      <Scores monster={monster} />

      <div className="mc-top">
        <Line label="Saving Throws" value={list(monster.saves)} />
        <Line label="Skills" value={list(monster.skills)} />
        <Line label="Damage Vulnerabilities" value={monster.vulnerable.join(', ')} />
        <Line label="Damage Resistances" value={monster.resist.join(', ')} />
        <Line label="Damage Immunities" value={monster.immune.join(', ')} />
        <Line
          label="Condition Immunities"
          value={monster.conditionImmunities
            // `exhaustion` is a track in this app rather than a condition, so
            // it has no entry to look up and falls back to its own name.
            .map((id) => CONDITIONS_BY_ID[id]?.name ?? `${id[0].toUpperCase()}${id.slice(1)}`)
            .join(', ')}
        />
        <Line label="Senses" value={senses} />
        <Line label="Languages" value={monster.languages || '—'} />
        <Line
          label="Challenge"
          value={`${formatCr(monster.cr)} (${monster.xp.toLocaleString()} XP)`}
        />
      </div>

      {monster.traits.map((a, i) => (
        <Ability key={i} ability={a} />
      ))}

      {monster.actions.length > 0 && (
        <>
          <h4 className="mc-heading">Actions</h4>
          {monster.actions.map((a, i) => (
            <Ability key={i} ability={a} />
          ))}
        </>
      )}

      {monster.reactions.length > 0 && (
        <>
          <h4 className="mc-heading">Reactions</h4>
          {monster.reactions.map((a, i) => (
            <Ability key={i} ability={a} />
          ))}
        </>
      )}

      {monster.legendary.length > 0 && (
        <>
          <h4 className="mc-heading">Legendary Actions</h4>
          {monster.legendary.map((a, i) => (
            <Ability key={i} ability={a} />
          ))}
        </>
      )}
    </article>
  );
}
