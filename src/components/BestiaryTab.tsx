import { useMemo, useState } from 'react';
import type { Monster, MonsterAbility } from '../data/monsters';
import { formatCr, searchMonsters } from '../data/monsters';
import {
  CHALLENGE_RATINGS,
  copyOf,
  hydrateMonster,
  isCustom,
  mergeBestiary,
  proficiencyForCr,
  putMonster,
  removeMonster,
  xpForCr,
} from '../bestiary';
import { parseNotation } from '../engine/dice';
import { Panel } from './shared';
import { MonsterCard } from './MonsterCard';
import { useMonsters } from './useMonsters';

/**
 * Where a monster gets built.
 *
 * The 334 SRD stat blocks are a reference; a campaign runs on the twelve of
 * them a DM has bent to fit, and until this existed every one of those bends
 * lasted until the fight ended. So: find the one that is nearly right, copy it,
 * change what is wrong with it, and it is still there next week.
 *
 * ## There is no blank creator, and that is the design
 *
 * Nobody builds a monster from nothing. They start from the one that is nearly
 * right - a bandit captain who is a cult leader now, an owlbear with more hit
 * points - and every field they do not touch is a field the SRD already got
 * right. A blank form would make the common case the hard one.
 *
 * ## Edits are written through, like everything else here
 *
 * No save button and no draft: changing a field writes to the store, the same
 * way the Builder writes to the active character. That is safe here for the
 * same reason it is safe there - you can only edit a copy, never an SRD block,
 * so the thing you started from is always still what it was.
 */

const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];

/** The speeds a stat block can carry, walking first because that is how it reads. */
const SPEEDS = ['walk', 'fly', 'swim', 'climb', 'burrow'] as const;

type Section = 'traits' | 'actions' | 'reactions' | 'legendary';

const SECTIONS: { key: Section; title: string; one: string }[] = [
  { key: 'traits', title: 'Traits', one: 'trait' },
  { key: 'actions', title: 'Actions', one: 'action' },
  { key: 'reactions', title: 'Reactions', one: 'reaction' },
  { key: 'legendary', title: 'Legendary actions', one: 'legendary action' },
];

export function BestiaryTab({
  saved,
  onChange,
}: {
  saved: Monster[];
  onChange: (bestiary: Monster[]) => void;
}) {
  const { monsters: srd, loading } = useMonsters();
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [imported, setImported] = useState<string | null>(null);

  /*
    One list, yours first.

    Searching two boxes for a monster you might have saved is the thing this
    avoids - "bandit" should find your reskinned captain and the SRD's in the
    same list, in that order, exactly as it does on the Table.
  */
  const found = useMemo(
    () => searchMonsters(mergeBestiary(saved, srd), query).slice(0, 40),
    [saved, srd, query],
  );

  const editing = editingId ? saved.find((m) => m.id === editingId) ?? null : null;

  /** Every edit is a whole record put back, which is what makes undo unnecessary. */
  const patch = (changes: Partial<Monster>) => {
    if (!editing) return;
    onChange(putMonster(saved, { ...editing, ...changes }));
  };

  const duplicate = (monster: Monster) => {
    const copy = copyOf(monster, saved);
    onChange(putMonster(saved, copy));
    setEditingId(copy.id);
  };

  const list = (
    <Panel
      className="bestiary-screen"
      title="Monsters"
      subtitle={
        loading
          ? 'Fetching the bestiary…'
          : `${saved.length} of yours and ${srd.length} from SRD 5.1. Copy any of them to make it yours.`
      }
    >
      <input
        type="search"
        placeholder="Search — goblin, dragon, undead…"
        aria-label="Search your monsters and the bestiary"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 10, width: '100%' }}
      />

      {!loading && found.length === 0 && <p className="muted">Nothing matches “{query}”.</p>}

      <ul className="mon-list">
        {found.map((monster) => {
          const mine = isCustom(monster.id);
          return (
            <li key={monster.id} className={monster.id === editingId ? 'is-selected' : ''}>
              {mine ? (
                <>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => setEditingId(monster.id)}
                  >
                    Edit
                  </button>
                  {confirming === monster.id ? (
                    <>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => {
                          onChange(removeMonster(saved, monster.id));
                          if (editingId === monster.id) setEditingId(null);
                          setConfirming(null);
                        }}
                      >
                        Really delete
                      </button>
                      <button className="btn btn-sm" onClick={() => setConfirming(null)}>
                        Keep
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn btn-sm"
                      aria-label={`Delete ${monster.name}`}
                      onClick={() => setConfirming(monster.id)}
                    >
                      Delete
                    </button>
                  )}
                </>
              ) : (
                <button
                  className="btn btn-sm"
                  aria-label={`Copy ${monster.name} and edit it`}
                  onClick={() => duplicate(monster)}
                >
                  Copy
                </button>
              )}
              <b>{monster.name}</b>
              {/* Which store it came from, said on every row, in the same
                  badge provenance uses everywhere else. A DM mid-search has to
                  be able to tell their own captain from the book's, and the
                  names are deliberately similar. */}
              <span className={`tag source-tag ${mine ? 'is-original' : ''}`}>
                {mine ? 'Yours' : 'SRD'}
              </span>
              <span className="src">
                CR {formatCr(monster.cr)} · AC {monster.ac} · {monster.hp} hp · {monster.type}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );

  /*
    A bestiary as a file.

    Its own file rather than a section of a character export, for the reason it
    is its own store: it is not part of any character, it outlives the party,
    and a DM who wants to hand their monsters to the person running next week's
    session should not have to hand over their characters too.
  */
  const download = () => {
    const blob = new Blob([JSON.stringify({ monsters: saved }, null, 2)], {
      type: 'application/json',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'bestiary.json';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const open = async (file: File) => {
    setImported(null);
    try {
      const parsed = JSON.parse(await file.text()) as { monsters?: unknown[] } | unknown[];
      const rows = Array.isArray(parsed) ? parsed : parsed?.monsters ?? [];
      const incoming = rows.map(hydrateMonster).filter((m): m is Monster => m !== null);
      if (!incoming.length) {
        setImported('No monsters in that file.');
        return;
      }
      // By id, so re-opening your own export updates rather than duplicates.
      onChange(incoming.reduce(putMonster, saved));
      setImported(`${incoming.length} loaded.`);
    } catch {
      setImported('That is not a bestiary this app wrote.');
    }
  };

  const files = (
    <Panel
      className="bestiary-screen"
      title="Files"
      subtitle="Your monsters as a file of their own — no characters attached."
    >
      <div className="btn-row" style={{ marginBottom: 12 }}>
        <button className="btn" disabled={!saved.length} onClick={download}>
          Download your bestiary
        </button>
      </div>
      <label className="field">
        <span>Open a bestiary</span>
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void open(file);
          }}
        />
      </label>
      {imported && <p className="muted">{imported}</p>}
    </Panel>
  );

  if (!editing) {
    return (
      <div className="columns">
        {list}
        <div className="stack">
          <Panel
            className="bestiary-screen"
            title="Nothing open"
            subtitle="Copy a monster to start changing one."
          >
            <p className="muted">
              Copying leaves the original alone — the SRD block stays exactly as it was, and the
              copy is yours to break. Saved monsters live in their own store, so clearing out old
              characters never touches them.
            </p>
          </Panel>
          {files}
        </div>
      </div>
    );
  }

  const hpDice = editing.hpRoll ? parseNotation(editing.hpRoll) : null;

  const editor = (
    <div className="stack bestiary-screen">
      <Panel
        title={editing.name || 'Unnamed'}
        subtitle="Every change is saved as you make it. This is a copy — whatever you started from is untouched."
      >
        <div className="btn-row" style={{ marginBottom: 14 }}>
          <button className="btn btn-sm" onClick={() => setEditingId(null)}>
            Close
          </button>
          <button className="btn btn-sm" onClick={() => duplicate(editing)}>
            Copy this one
          </button>
        </div>

        <label className="field">
          <span>Name</span>
          <input
            type="text"
            value={editing.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </label>

        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <label className="field">
            <span>Size</span>
            <select value={editing.size} onChange={(e) => patch({ size: e.target.value })}>
              {SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Type</span>
            <input
              type="text"
              value={editing.type}
              onChange={(e) => patch({ type: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Tag</span>
            <input
              type="text"
              placeholder="goblinoid"
              value={editing.subtype ?? ''}
              onChange={(e) => patch({ subtype: e.target.value || null })}
            />
          </label>
          <label className="field">
            <span>Alignment</span>
            <input
              type="text"
              value={editing.alignment}
              onChange={(e) => patch({ alignment: e.target.value })}
            />
          </label>
        </div>
      </Panel>

      <Panel title="Defences">
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <label className="field field-sm">
            <span>Armor class</span>
            <input
              type="number"
              value={editing.ac}
              onChange={(e) => patch({ ac: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>
          <label className="field">
            <span>From</span>
            <input
              type="text"
              placeholder="natural armor"
              value={editing.acNote ?? ''}
              onChange={(e) => patch({ acNote: e.target.value || null })}
            />
          </label>
          <label className="field field-sm">
            <span>Hit points</span>
            <input
              type="number"
              value={editing.hp}
              onChange={(e) => patch({ hp: Math.max(1, Number(e.target.value) || 1) })}
            />
          </label>
          <label className="field">
            <span>Hit dice</span>
            <input
              type="text"
              placeholder="2d8+2"
              value={editing.hpRoll ?? ''}
              onChange={(e) => patch({ hpRoll: e.target.value || null })}
            />
          </label>
        </div>

        {/* The tracker offers to roll a monster's hit points from this string,
            so an expression it cannot parse is worth saying out loud rather
            than falling back to the average without a word. */}
        {editing.hpRoll && !hpDice && (
          <p className="muted" style={{ margin: '-4px 0 10px' }}>
            Not dice this app can roll — “2d8+2”, no spaces. The printed {editing.hp} will be
            used instead.
          </p>
        )}

        <div className="field-label">Speed, in feet</div>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          {SPEEDS.map((kind) => (
            <label className="field field-sm" key={kind}>
              <span>{kind}</span>
              <input
                type="number"
                min={0}
                step={5}
                value={editing.speed[kind] ?? 0}
                onChange={(e) => {
                  const feet = Math.max(0, Number(e.target.value) || 0);
                  const speed = { ...editing.speed };
                  // Zero means the creature has no such speed, which is not the
                  // same as having one of nought - a stat block that read
                  // "burrow 0 ft." would be nonsense on the page.
                  if (feet) speed[kind] = feet;
                  else delete speed[kind];
                  patch({ speed });
                }}
              />
            </label>
          ))}
          <label className="checkbox" style={{ alignSelf: 'center' }}>
            <input
              type="checkbox"
              checked={editing.hover}
              onChange={(e) => patch({ hover: e.target.checked })}
            />
            <span>Hovers</span>
          </label>
        </div>

        <label className="field">
          <span>Languages</span>
          <input
            type="text"
            placeholder="Common, Goblin"
            value={editing.languages}
            onChange={(e) => patch({ languages: e.target.value })}
          />
        </label>
      </Panel>

      <Panel
        title="Ability scores"
        subtitle="Modifiers, saving throws and the initiative it rolls all come from these."
      >
        <div className="abilities">
          {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((ability) => (
            <label className="field field-sm" key={ability}>
              <span>{ability.toUpperCase()}</span>
              <input
                type="number"
                min={1}
                value={editing.scores[ability]}
                onChange={(e) =>
                  patch({
                    scores: {
                      ...editing.scores,
                      [ability]: Math.max(1, Number(e.target.value) || 1),
                    },
                  })
                }
              />
            </label>
          ))}
        </div>
      </Panel>

      <Panel
        title="Challenge"
        subtitle="Experience and proficiency bonus follow the rating, so they cannot drift apart from it."
      >
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <label className="field field-sm">
            <span>Rating</span>
            <select
              value={editing.cr}
              onChange={(e) => {
                const cr = Number(e.target.value);
                patch({ cr, xp: xpForCr(cr), proficiencyBonus: proficiencyForCr(cr) });
              }}
            >
              {CHALLENGE_RATINGS.map((cr) => (
                <option key={cr} value={cr}>
                  {formatCr(cr)}
                </option>
              ))}
            </select>
          </label>
          <p className="muted" style={{ alignSelf: 'center' }}>
            {editing.xp.toLocaleString()} XP · proficiency +{proficiencyForCr(editing.cr)}
          </p>
        </div>
      </Panel>

      {SECTIONS.map(({ key, title, one }) => (
        <AbilityList
          key={key}
          title={title}
          one={one}
          abilities={editing[key]}
          attacks={key === 'actions'}
          onChange={(next) => patch({ [key]: next } as Partial<Monster>)}
        />
      ))}
    </div>
  );

  return (
    <div className="columns">
      {editor}
      <div className="stack">
        {/* The stat block as it will actually be read, beside the fields that
            change it. A form that only showed fields would mean saving,
            switching tab and coming back to find out that the alignment now
            reads "Medium humanoid, ". */}
        <Panel
          className="bestiary-card"
          title="How it reads"
          subtitle="The stat block a DM will be looking at."
        >
          <MonsterCard monster={editing} />
        </Panel>
        {list}
        {files}
      </div>
    </div>
  );
}

/**
 * One block of a stat block: traits, actions, reactions or legendary actions.
 *
 * Prose plus, on actions, the three numbers the damage model actually reads.
 * Leaving those off would have been tidier and would have made the app lie: a
 * DM who doubles a giant's club damage in the text and is then told the fight
 * is easy has been given a wrong answer by the forecast rather than a missing
 * one.
 */
function AbilityList({
  title,
  one,
  abilities,
  attacks,
  onChange,
}: {
  title: string;
  one: string;
  abilities: MonsterAbility[];
  attacks: boolean;
  onChange: (abilities: MonsterAbility[]) => void;
}) {
  const replace = (i: number, changes: Partial<MonsterAbility>) =>
    onChange(abilities.map((a, at) => (at === i ? { ...a, ...changes } : a)));

  return (
    <Panel
      title={title}
      subtitle={
        attacks
          ? 'To hit and damage feed “what this fight will do”, so change them when you change the text.'
          : undefined
      }
    >
      {abilities.length === 0 && <p className="muted">None.</p>}

      {abilities.map((ability, i) => (
        <div className="ability-edit" key={i}>
          <div className="ability-head">
            <label className="field">
              <span>{one} name</span>
              <input
                type="text"
                value={ability.name}
                onChange={(e) => replace(i, { name: e.target.value })}
              />
            </label>
            <label className="field field-usage">
              <span>Usage</span>
              <input
                type="text"
                placeholder="Recharge 5-6"
                value={ability.usage ?? ''}
                onChange={(e) => replace(i, { usage: e.target.value || undefined })}
              />
            </label>
            <button
              className="btn btn-sm"
              aria-label={`Remove ${ability.name || one}`}
              onClick={() => onChange(abilities.filter((_, at) => at !== i))}
            >
              Remove
            </button>
          </div>

          <label className="field">
            <span>What it does</span>
            <textarea
              rows={3}
              value={ability.desc}
              onChange={(e) => replace(i, { desc: e.target.value })}
            />
          </label>

          {attacks && (
            <div className="ability-nums">
              <label className="field field-tohit">
                <span>To hit</span>
                <input
                  type="number"
                  value={ability.toHit ?? ''}
                  placeholder="—"
                  onChange={(e) =>
                    replace(i, {
                      toHit: e.target.value === '' ? undefined : Number(e.target.value) || 0,
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Damage</span>
                <input
                  type="text"
                  placeholder="1d6+2"
                  value={ability.damage?.[0]?.dice ?? ''}
                  onChange={(e) => {
                    const dice = e.target.value;
                    replace(i, {
                      damage: dice
                        ? [{ dice, type: ability.damage?.[0]?.type ?? 'bludgeoning' }]
                        : undefined,
                    });
                  }}
                />
              </label>
              <label className="field">
                <span>Damage type</span>
                <input
                  type="text"
                  value={ability.damage?.[0]?.type ?? ''}
                  disabled={!ability.damage?.[0]}
                  onChange={(e) =>
                    replace(i, {
                      damage: [{ dice: ability.damage![0].dice, type: e.target.value }],
                    })
                  }
                />
              </label>
            </div>
          )}
        </div>
      ))}

      <button
        className="btn btn-sm"
        onClick={() => onChange([...abilities, { name: '', desc: '' }])}
      >
        Add {one}
      </button>
    </Panel>
  );
}
