import { useEffect, useRef, useState } from 'react';
import { ABILITIES, ABILITY_NAMES } from '../types';
import type { Build } from '../types';
import { signed } from '../format';
import { optionById } from '../data/classOptions';
import { optionGroups } from '../engine/classOptions';
import { featById } from '../data/feats';
import { abilityMod } from '../engine/character';
import type { BuildContext } from '../engine/character';
import { resourcesOf, sheetOf } from '../sheet';
import {
  restorePact,
  restoreResource,
  restoreSlot,
  spendPact,
  spendResource,
  spendSlot,
} from '../play';
import type { PlayState } from '../play';

/**
 * §138. The character as a screen, rather than as a photocopy of one.
 *
 * ## Why there are two sheets
 *
 * `CharacterSheet` is ink on cream in both themes, and the comment above its
 * palette says why: the promise it makes is that the screen and the printed
 * page are the same document, so inverting one of them at the printer would
 * break exactly that. That argument was always about *print*, and it is still
 * right - which is why the paper reading keeps the ink palette and is the one
 * the print block targets.
 *
 * This is the other reading. It is never printed, so nothing about it has to
 * survive a printer, and being cream-on-parchment inside a dark app was a
 * cost it was paying for a promise it does not make. It takes the app's own
 * palette and the app's own card shell, and what it gains for that is the
 * thing the fusion needs: when the guided flow says it is filling *Feats &
 * ability increases*, that box can light up in the same accent the step card
 * is using, because they are finally speaking the same colours.
 *
 * ## What it is not
 *
 * Not a replacement, and not the complete document. Eight skills rather than
 * eighteen, no conditions, no death saves, no inventory - the things you read
 * *between* decisions rather than during a fight. Everything omitted here is
 * on the paper reading, which is one click away and is the sheet of record.
 *
 * ## What it is for
 *
 * Reading the character while you change it. Every figure on it is derived
 * from `ctx` and `sheetOf`, so a choice applied in the step card above lands
 * here in the same render - Dexterity 18 to 20 moves the score, the modifier,
 * armor class, initiative, three skills and every attack line at once,
 * because none of them are stored.
 */
export function ScreenSheet({
  ctx,
  play,
  highlight,
  onPlayChange,
  onBuildChange,
}: {
  ctx: BuildContext;
  play: PlayState;
  /**
   * The box the guided flow is filling right now, by the name the step gives
   * it. The visible half of §138's fusion: the step says which box, and the
   * box says "this one". Absent when nothing is being asked.
   */
  highlight?: string;
  onPlayChange: (play: PlayState) => void;
  onBuildChange: (build: Build) => void;
}) {
  const { build, proficiencies: profs } = ctx;
  const sheet = sheetOf(ctx, play);
  const lit = (box: string) => (highlight === box ? 'ss-box is-lit' : 'ss-box');

  const classLine = ctx.slices
    .map((s) => `${s.klass.name}${s.subclass ? ` (${s.subclass.name})` : ''} ${s.entry.level}`)
    .join(' / ');

  /*
    Eight, not eighteen. A screen reading is what you glance at between
    decisions, and the eighteen-row list is the thing you glance *past*. The
    ones that survive are those you are proficient in, best first, and the
    rest are on the paper reading - which is the sheet of record and says so.
  */
  const skills = [...profs.skills]
    .filter((line) => line.proficient || line.expertise)
    .sort((a, b) => b.modifier - a.modifier || a.name.localeCompare(b.name))
    .slice(0, 8);

  const feats = [...ctx.featIds]
    .map((id) => featById(id, build.ruleset)?.name ?? id)
    .sort((a, b) => a.localeCompare(b));

  /*
    An ability score improvement is not a feat and does not appear in
    `featIds`, but it is the other thing this box records - so it is written
    the way a player says it, "+2 Dexterity", rather than as a pair.
  */
  const increases = build.asiPicks.map((picks) => {
    const counted = new Map<string, number>();
    for (const ability of picks) counted.set(ability, (counted.get(ability) ?? 0) + 1);
    return [...counted]
      .map(([ability, n]) => `+${n} ${ABILITY_NAMES[ability as keyof typeof ABILITY_NAMES]}`)
      .join(', ');
  });

  /*
    Whether this character has any option slots at all - not whether they have
    filled any. The box has to exist the moment the flow can point at it, and
    a Fighter 1 who has chosen no fighting style is exactly the character the
    flow is asking. Rendering it only once something was chosen made the step
    card's promise a lie on the one character it mattered for, which is what
    `ScreenSheet.test.tsx` caught.
  */
  const optionSlots = optionGroups(ctx).length;

  /* Named through `optionById` rather than off the build's raw ids, so a
     renamed option shows its new name here without a second table to update. */
  const classOptions = [
    ...(build.pactBoon ? [build.pactBoon] : []),
    ...build.classOptionIds,
  ]
    .map((id) => optionById(id)?.name ?? id)
    .sort((a, b) => a.localeCompare(b));

  const spells = ctx.spellcasting.chosen.map((spell) => spell.name);

  /*
    §139: what landed since the last render.

    The whole claim of the fusion is that a choice made in the card above
    appears in a box below, and a figure that changes silently in a page of
    figures is a figure nobody saw change. So the chip that just arrived wears
    a one-shot tint that fades out - `just-landed`, `--ring` to transparent -
    and nothing else moves.

    A ref rather than derived state, because "new" is a fact about the
    *transition* and there is nothing in the character that records it. The
    first render seeds the ref and marks nothing: arriving at a sheet is not
    the same as watching something land on it, and a sheet that lit up
    everything on arrival would teach you to ignore the tint.
  */
  const chips = [...feats, ...increases, ...classOptions, ...spells];
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const key = JSON.stringify(chips);
  useEffect(() => {
    const now = new Set(chips);
    const before = seen.current;
    seen.current = now;
    if (before === null) return;
    const landed = [...now].filter((name) => !before.has(name));
    if (landed.length) setFresh(new Set(landed));
    // `key` is the whole list as one string: the effect has to run when the
    // *contents* change, and an array identity changes on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const chipClass = (name: string) => (fresh.has(name) ? 'ss-chip is-fresh' : 'ss-chip');

  const stats = [
    { k: 'Armor class', v: String(ctx.ac.total), sub: ctx.ac.lines[0]?.label ?? '' },
    { k: 'Initiative', v: signed(ctx.mods.dex), sub: 'Dexterity' },
    { k: 'Speed', v: `${ctx.speed.total} ft`, sub: '' },
    { k: 'Hit points', v: `${sheet.hp.now}/${sheet.hp.max}`, sub: sheet.hp.temp ? `+${sheet.hp.temp} temp` : '' },
    { k: 'Passive perception', v: String(profs.passivePerception), sub: 'Wisdom' },
    {
      k: 'Save DC',
      v: ctx.spellSaveDc === null ? '—' : String(ctx.spellSaveDc),
      sub: ctx.spellSaveDc === null ? 'no spellcasting' : 'spell save',
    },
  ];

  return (
    <section className="ss" aria-label={`${build.name || 'Character'} — sheet`}>
      <header className="ss-head">
        {/* The same initials-until-a-picture pattern the roster uses, rather
            than a second idea about what an empty portrait looks like. */}
        <div className="ss-face" aria-hidden="true">
          {(build.name || '??')
            .split(/\s+/)
            .slice(0, 2)
            .map((word) => word[0] ?? '')
            .join('')
            .toUpperCase()}
        </div>
        <div className="ss-name">
          <input
            value={build.name}
            placeholder="Unnamed"
            aria-label="Character name"
            onChange={(e) => onBuildChange({ ...build, name: e.target.value })}
          />
          <p>{classLine}</p>
          <span>
            Level {ctx.totalLevel} · {build.ruleset === '2024' ? '2024 rules' : '2014 rules'}
          </span>
        </div>
      </header>

      <div className="ss-abilities">
        {ABILITIES.map((ability) => {
          const primary = (ctx.abilityPriority[ability] ?? 0) >= 2;
          return (
            <div className={`ss-ability${primary ? ' is-primary' : ''}`} key={ability}>
              <span>{ABILITY_NAMES[ability].slice(0, 3)}</span>
              <b>{ctx.scores[ability]}</b>
              <em>{signed(abilityMod(ctx.scores[ability]))}</em>
            </div>
          );
        })}
      </div>

      <div className="ss-stats">
        {stats.map((stat) => (
          <div className="ss-stat" key={stat.k}>
            <span>{stat.k}</span>
            <b>{stat.v}</b>
            {/* A fixed floor, so a build that gains or loses a note does not
                make the whole row of boxes jump by a line. */}
            <em>{stat.sub}</em>
          </div>
        ))}
      </div>

      <div className="ss-cols">
        <div className="ss-col">
          <section className={lit('Attacks')}>
            <h3>Attacks</h3>
            {ctx.attacks.length ? (
              ctx.attacks.map((attack, i) => (
                <div className="ss-attack" key={i}>
                  <span>
                    {attack.weapon.name}
                    {attack.hand === 'off' && <em> off hand</em>}
                  </span>
                  <b>{signed(attack.toHit)}</b>
                  <b>
                    {attack.damage.dice}
                    {attack.damage.bonus !== 0 ? signed(attack.damage.bonus) : ''} {attack.damage.type}
                  </b>
                </div>
              ))
            ) : (
              <p className="muted">Nothing equipped.</p>
            )}
          </section>

          <section className={lit('Skills')}>
            <h3>Skills</h3>
            {skills.length ? (
              skills.map((line) => (
                <div className="ss-skill" key={line.skill}>
                  {/*
                    A filled dot for proficient and a ringed one for expertise.
                    This is the paper convention and it needs no key, which is
                    why there is not one.
                  */}
                  <i className={line.expertise ? 'is-expert' : 'is-proficient'} aria-hidden="true" />
                  <span>{line.name}</span>
                  <b>{signed(line.modifier)}</b>
                </div>
              ))
            ) : (
              <p className="muted">Nothing proficient yet.</p>
            )}
          </section>
        </div>

        <div className="ss-col">
          <section className={lit('Feats & ability increases')}>
            <h3>Feats &amp; ability increases</h3>
            {feats.length || increases.length ? (
              <div className="ss-chips">
                {feats.map((name) => (
                  <span className={chipClass(name)} key={name}>
                    {name}
                  </span>
                ))}
                {increases.map((label, i) => (
                  <span className={chipClass(label)} key={`asi-${i}`}>
                    {label}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted">Nothing taken yet.</p>
            )}
          </section>

          {ctx.spellcasting.casts && (
            /*
              One box, named for the thing the flow points at. A Warlock's pact
              slots and a Sorcerer's ordinary ones are different resources and
              are shown as different rows, but "where do my spells live" is one
              question and the step that adds a spell says `Spells`.
            */
            <section className={lit('Spells')}>
              <h3>Spells</h3>
              {sheet.pact && (
                <div className="ss-slots">
                  <span>Level {sheet.pact.level}</span>
                  <Pips
                    total={sheet.pact.total}
                    left={sheet.pact.left}
                    label="Pact slot"
                    onSpend={() => onPlayChange(spendPact(play, sheet.pact!.total))}
                    onRestore={() => onPlayChange(restorePact(play))}
                  />
                </div>
              )}
              {sheet.slots
                .filter((slot) => slot.total > 0)
                .map((slot) => (
                  <div className="ss-slots" key={slot.level}>
                    <span>Level {slot.level}</span>
                    <Pips
                      total={slot.total}
                      left={slot.left}
                      label={`Level ${slot.level} slot`}
                      onSpend={() => onPlayChange(spendSlot(play, slot.level, slot.fromTable))}
                      onRestore={() => onPlayChange(restoreSlot(play, slot.level))}
                    />
                  </div>
                ))}
              {/* What is recorded, as chips rather than a list: this is the
                  reading you glance at, and a spell here is a name you are
                  checking you still have rather than a thing you are reading. */}
              {ctx.spellcasting.chosen.length > 0 && (
                <div className="ss-chips" style={{ marginTop: 8 }}>
                  {spells.map((name) => (
                    <span className={chipClass(name)} key={name}>
                      {name}
                    </span>
                  ))}
                </div>
              )}
              {ctx.spellcasting.chosen.length === 0 && (
                <p className="muted">Nothing recorded yet.</p>
              )}
            </section>
          )}

          {/*
            What the class handed over and what you picked from it - a fighting
            style, a Pact Boon, an invocation, a maneuver. The flow's option
            steps all name this box, so it exists whenever any of them can.
          */}
          {optionSlots > 0 && (
            <section className={lit('Class features & options')}>
              <h3>Class features &amp; options</h3>
              {classOptions.length ? (
                <div className="ss-chips">
                  {classOptions.map((name) => (
                    <span className="ss-chip" key={name}>
                      {name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="muted">Nothing chosen yet.</p>
              )}
            </section>
          )}

          {resourcesOf(ctx).length > 0 && (
            <section className={lit('Class resources')}>
              <h3>Class resources</h3>
              {sheet.resources.map(({ held, left }) => (
                <div className="ss-slots" key={held.key}>
                  <span>{held.resource.name}</span>
                  <Pips
                    total={held.max}
                    left={left}
                    label={held.resource.name}
                    onSpend={() => onPlayChange(spendResource(play, held.key, held.max))}
                    onRestore={() => onPlayChange(restoreResource(play, held.key))}
                  />
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The same pips the paper sheet uses, at screen-palette colours.
 *
 * Not imported from `CharacterSheet`: that component's pips are `--ink` on
 * `--paper` by construction, and the whole reason this reading exists is that
 * it is not. The *shape* is deliberately identical - spend left to right, the
 * way you tick off a paper sheet - because it is the same gesture.
 */
function Pips({
  total,
  left,
  label,
  onSpend,
  onRestore,
}: {
  total: number;
  left: number;
  label: string;
  onSpend: () => void;
  onRestore: () => void;
}) {
  return (
    <span className="ss-pips">
      {Array.from({ length: total }, (_, i) => (
        <button
          key={i}
          type="button"
          className={i < left ? 'is-full' : ''}
          aria-label={`${label} ${i + 1}`}
          title={i < left ? 'Spend' : 'Restore'}
          onClick={() => (i < left ? onSpend() : onRestore())}
        />
      ))}
      <em>
        {left}/{total}
      </em>
    </span>
  );
}
