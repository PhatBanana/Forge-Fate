import { useMemo, useState } from 'react';
import type { Build } from '../types';
import { Panel } from './shared';
import { pickOptions, startingEquipmentFor } from '../data/startingEquipment';
import type { StartingGroup, StartingOption } from '../data/startingEquipment';
import {
  applyStartingEquipment,
  blankChoices,
  chooseOption,
  isComplete,
  setPick,
} from '../engine/startingEquipment';
import type { StartingChoice } from '../engine/startingEquipment';

/**
 * "What do I start with?"
 *
 * The question a 1st-level character asks first and this app had no answer to,
 * so everyone began with a blank inventory and looked their kit up elsewhere.
 *
 * Only at 1st level, and only for a single class. Starting equipment is what
 * you get for *beginning* as something; a Fighter 3 who takes a level of Rogue
 * gets the multiclassing list instead, which is a different table, and a level
 * 5 character being typed in already owns things. Offering it there would be
 * offering to overwrite an inventory with a beginner's kit.
 */
export function StartingEquipmentPanel({
  build,
  patch,
}: {
  build: Build;
  patch: (partial: Partial<Build>) => void;
}) {
  const classId = build.classes[0]?.classId;
  const kit = classId ? startingEquipmentFor(classId, build.ruleset) : null;

  /*
    The answers are component state rather than part of the character. What
    ends up on the sheet is the equipment itself - a longbow, chain mail - and
    keeping "you answered (b) to question two" beside it would be storing the
    receipt as well as the goods, then having to migrate it when a source
    renumbers a group.
  */
  const [choices, setChoices] = useState<StartingChoice[]>(() =>
    kit ? blankChoices(kit) : [],
  );
  const [taken, setTaken] = useState<string[] | null>(null);

  /*
    A new class means new questions, so the old answers are abandoned. Keyed on
    the class and ruleset because those are exactly what change the kit.
  */
  const signature = `${classId}:${build.ruleset}`;
  const [lastSignature, setLastSignature] = useState(signature);
  if (signature !== lastSignature) {
    setLastSignature(signature);
    setChoices(kit ? blankChoices(kit) : []);
    setTaken(null);
  }

  const complete = useMemo(() => isComplete(choices), [choices]);

  const level = build.classes.reduce((sum, entry) => sum + entry.level, 0);
  if (level !== 1 || build.classes.length !== 1) return null;
  if (!kit) {
    // The Artificer, which is in neither SRD. Saying so beats an empty panel.
    return (
      <Panel title="Starting equipment" subtitle="What the book hands a 1st-level character.">
        <p className="muted">
          The Artificer is not in either SRD, so there is no verified starting kit to offer. The
          inventory below takes anything you want to add by hand.
        </p>
      </Panel>
    );
  }

  const take = () => {
    const result = applyStartingEquipment(build, choices);
    patch(result.build);
    setTaken(result.unrecorded);
  };

  return (
    <Panel
      title="Starting equipment"
      subtitle="What the book hands a 1st-level character, straight from the SRD. Taking it replaces what you are wearing, holding and carrying."
    >
      {kit.fixed.length > 0 && (
        <p className="cs-para start-fixed">
          <b>Everyone gets:</b> {kit.fixed.map((ref) => label(ref.name, ref.quantity)).join(', ')}.
        </p>
      )}

      {kit.groups.map((group, g) => (
        <Group
          key={g}
          group={group}
          choice={choices[g]}
          ruleset={build.ruleset}
          onOption={(option) => setChoices(chooseOption(kit, choices, g, option))}
          onPick={(pickIndex, slot, id) => setChoices(setPick(choices, g, pickIndex, slot, id))}
        />
      ))}

      <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 12 }}>
        <button type="button" className="btn btn-primary" disabled={!complete} onClick={take}>
          Take this kit
        </button>
        {!complete && <span className="muted">Answer the picks above first.</span>}
      </div>

      {taken && (
        <div className="callout" style={{ marginTop: 10 }}>
          <b>Equipped.</b> Your armor, weapons and pack are set below — change any of it there.
          {taken.length > 0 && (
            <>
              {' '}
              {/*
                A build holds two weapons and the gear catalogue has no arms in
                it, so a spare has nowhere to live. Better said than silently
                dropped: a player who knows can write it in their notes.
              */}
              Not recorded, because a character sheet here holds two weapons and no rack:{' '}
              <b>{taken.join(', ')}</b>.
            </>
          )}
        </div>
      )}
    </Panel>
  );
}

const label = (name: string, quantity: number) => (quantity > 1 ? `${name} ×${quantity}` : name);

/** One "choose one" question, with its options as radio buttons. */
function Group({
  group,
  choice,
  ruleset,
  onOption,
  onPick,
}: {
  group: StartingGroup;
  choice: StartingChoice | undefined;
  ruleset: Build['ruleset'];
  onOption: (option: number) => void;
  onPick: (pickIndex: number, slot: number, id: string) => void;
}) {
  const chosen = choice?.option ?? 0;
  return (
    <fieldset className="start-group">
      {/* The source's own sentence. Nothing this app could write would be
          clearer than the one the book prints. */}
      <legend>{group.desc}</legend>
      {group.options.map((option, o) => (
        <label className={`start-option ${chosen === o ? 'is-on' : ''}`} key={o}>
          <input
            type="radio"
            checked={chosen === o}
            onChange={() => onOption(o)}
            name={group.desc}
          />
          <span className="start-option-body">
            <span>{describe(option)}</span>
            {chosen === o &&
              option.picks.map((pick, p) => (
                <span className="start-picks" key={p}>
                  {Array.from({ length: pick.choose }, (_, slot) => (
                    <select
                      key={slot}
                      aria-label={`${pick.label}${pick.choose > 1 ? ` ${slot + 1}` : ''}`}
                      value={choice?.picks[p]?.[slot] ?? ''}
                      onChange={(e) => onPick(p, slot, e.target.value)}
                    >
                      <option value="">{pick.label}…</option>
                      {pick.categories.flatMap((category) =>
                        pickOptions(category, ruleset).map((entry) => (
                          <option key={`${category}-${entry.id}`} value={entry.id}>
                            {entry.name}
                          </option>
                        )),
                      )}
                    </select>
                  ))}
                </span>
              ))}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** An option's contents in one line, with the picks left to the selects. */
function describe(option: StartingOption): string {
  const parts = [
    ...option.items.map((ref) => label(ref.name, ref.quantity)),
    ...option.picks.map((pick) => pick.label),
    ...(option.gold ? [`${option.gold} gp`] : []),
  ];
  // Only reachable if a source ever offers an option that is nothing at all.
  return parts.join(', ') || '—';
}
