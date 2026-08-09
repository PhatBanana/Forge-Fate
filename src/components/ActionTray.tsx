import { useState } from 'react';
import type { Build } from '../types';
import type { BuildContext } from '../engine/character';
import type { PlayState } from '../play';
import {
  dash,
  heal,
  recordRoll,
  setStance,
  setTurnSlot,
  slotsLeft,
  spendPact,
  spendSlot,
  startConcentration,
} from '../play';
import { defaultRng, parseNotation, rollD20, rollDamage, rollNotation } from '../engine/dice';
import { damageDice } from '../data/weapons';
import type { Spell } from '../data/spells';
import { consumeItem, isConsumable, quantityOf } from '../engine/items';
import { gearById } from '../data/gear';
import type { GrabMode } from '../engine/grapple';

/**
 * The command menu: what an action can be spent on, the way the old RPGs
 * asked - Attack / Cast / Item, Breath of Fire's box, Pokémon's grid.
 *
 * Opened from the cockpit's Action or Bonus pip. The top level is the PHB's
 * own list of actions; picking one either drills into a submenu (attacks,
 * spells, items) or resolves on the spot (Dash, Dodge, Hide). Everything in
 * it comes from the same derivation the sheet prints - the attack lines are
 * `ctx.attacks` with their real to-hit, the spells are the castable list
 * with the slot arithmetic `play.ts` does, the potions are the inventory
 * used through the same `consumeItem` the sheet uses. Nothing here is a
 * second model of a character - it is the character, with a menu.
 *
 * Spending is real: attacks and casts mark the pip their casting time names,
 * Dash adds speed to the budget, the one-click commands (Dodge, Disengage,
 * Help, Ready) spend the pip and write the log line a table would say out
 * loud. Hide rolls the character's actual Stealth onto the battlefield
 * through the same machinery the rail's Hide button uses.
 */

const signed = (value: number) => (value >= 0 ? `+${value}` : `${value}`);

export function CommandMenu({
  ctx,
  play,
  slot,
  onAct,
  onAim,
  onMoveCommand,
  onGrab,
  onEscapeGrapple,
  onReleaseGrapple,
  onHide,
  standing,
  onClose,
}: {
  ctx: BuildContext;
  play: PlayState;
  /** Which pip opened the menu - the commands offered cost exactly it. */
  slot: 'action' | 'bonus';
  /*
    Everything a command changes, in ONE call. A command can touch three
    stores at once - a potion is an inventory write, a play write, and a log
    line - and the owner builds them from one snapshot, so two calls in a
    gesture would each start from the same state and the second would erase
    the first. The owner composes the fields into a single write.
  */
  onAct: (act: { play?: PlayState; build?: Build; log?: string }) => void;
  /** Aim these strikes; the shot chips take over from there. */
  onAim?: (strikes: { label: string; toHit: number; damage: { dice: string; type: string }[] }[]) => void;
  /** Arm move mode - walking is its own budget, so this spends no pip. */
  onMoveCommand?: () => void;
  /**
   * Arm a shove or a grapple. Three entries rather than a submenu, because the
   * SRD leaves the choice to the attacker and "Shove" versus "Trip" versus
   * "Grapple" says which at a glance - a table does not need a menu level to
   * tell a push from a leg sweep from a headlock.
   */
  onGrab?: (mode: GrabMode) => void;
  /** Offered only while this character is held: the action that gets them out. */
  onEscapeGrapple?: () => void;
  /** Offered only while they are holding somebody: letting go is free. */
  onReleaseGrapple?: () => void;
  /** Roll Stealth and hide, through the battlefield's own machinery. The
      owner spends the action in the same write as the roll. */
  onHide?: () => void;
  /** A standing box never closes - the cockpit keeps it open the way the
      monster rail does. Acting collapses the submenu back to the grid. */
  standing?: boolean;
  onClose: () => void;
}) {
  const [sub, setSub] = useState<null | 'attack' | 'cast' | 'item'>(null);
  /** The last thing rolled, shown in the submenu beside the buttons. */
  const [lastRoll, setLastRoll] = useState<string | null>(null);

  const slotKey = slot === 'bonus' ? 'bonusAction' : 'action';

  /** A command resolved: back to the grid, and the pop-from-pip box closes.
      (A standing owner's onClose is inert - the box stays, reset.) */
  const done = () => {
    setSub(null);
    onClose();
  };

  /** A roll into the character's own log - one play write, no log line. */
  const log = (
    next: PlayState,
    kind: 'attack' | 'damage' | 'check',
    label: string,
    result: { total: number; working: string; natural?: 20 | 1 | null },
  ) => {
    setLastRoll(`${label}: ${result.total}`);
    onAct({
      play: recordRoll(next, {
        kind,
        label,
        total: result.total,
        working: result.working,
        ...(result.natural ? { natural: result.natural } : {}),
      }),
    });
  };

  // ---------------------------------------------------------------- attacks

  // The Action menu attacks with the main hand; the Bonus menu is where the
  // off-hand swing lives, exactly as the two-weapon rule splits them.
  const attackLines = ctx.attacks
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => (slot === 'bonus' ? line.hand === 'off' : line.hand !== 'off'));

  const attack = (i: number) => {
    const line = ctx.attacks[i];
    log(
      setTurnSlot(play, line.hand === 'off' ? 'bonusAction' : 'action', true),
      'attack',
      `${line.weapon.name} to hit`,
      rollD20(line.toHit, 'normal', defaultRng),
    );
  };

  const damageFor = (i: number, crit: boolean) => {
    const line = ctx.attacks[i];
    const dice = damageDice(line.weapon, line.hand === 'main' && !ctx.loadouts.offHand);
    const notation = `${dice}${line.damage.bonus ? signed(line.damage.bonus) : ''}`;
    const parsed = parseNotation(notation);
    if (!parsed) return;
    log(
      play,
      'damage',
      `${line.weapon.name} damage${crit ? ' (critical)' : ''}`,
      rollDamage(parsed, crit, defaultRng),
    );
  };

  // ----------------------------------------------------------------- spells

  const casting = ctx.spellcasting;
  const spells = casting.casts
    ? (casting.preparesFromBook
        ? [
            // A book caster's cantrips are not "prepared" - they are simply
            // known, and dropping them would take Fire Bolt off the menu.
            ...casting.castable.filter((s) => s.level === 0),
            ...casting.granted,
            ...casting.prepared,
          ]
        : casting.castable
      )
        .slice()
        // Only what this pip can pay for: the casting time names the slot.
        .filter((s) => s.castingTime === (slot === 'bonus' ? 'bonus' : 'action'))
        .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
    : [];

  /** The cheapest way to pay for a spell, or null when nothing can. */
  const slotFor = (spell: Spell): { kind: 'slot'; level: number } | { kind: 'pact' } | null => {
    if (spell.level === 0) return null;
    for (let level = spell.level; level <= casting.bySpellLevel.length; level++) {
      if (slotsLeft(play, level, casting.bySpellLevel[level - 1] ?? 0) > 0) {
        return { kind: 'slot', level };
      }
    }
    if (casting.pact && casting.pact.level >= spell.level && play.pactSpent < casting.pact.count) {
      return { kind: 'pact' };
    }
    return null;
  };

  const cast = (spell: Spell) => {
    let next = play;
    let cost = 'no slot';
    if (spell.level > 0) {
      const pay = slotFor(spell);
      if (!pay) return;
      if (pay.kind === 'pact') {
        next = spendPact(next, casting.pact?.count ?? 0);
        cost = `pact slot`;
      } else {
        next = spendSlot(next, pay.level, casting.bySpellLevel[pay.level - 1] ?? 0);
        cost =
          pay.level > spell.level ? `level ${pay.level} slot, upcast` : `level ${pay.level} slot`;
      }
    } else {
      cost = 'cantrip';
    }
    if (spell.castingTime === 'action') next = setTurnSlot(next, 'action', true);
    if (spell.castingTime === 'bonus') next = setTurnSlot(next, 'bonusAction', true);
    if (spell.castingTime === 'reaction') next = setTurnSlot(next, 'reaction', true);

    let note = cost;
    if (spell.concentration) {
      const taken = startConcentration(next, spell.name);
      next = taken.play;
      note = taken.dropped
        ? `${cost}; concentration — dropped ${taken.dropped}`
        : `${cost}; concentration`;
    }

    setLastRoll(`Cast ${spell.name}`);
    onAct({
      play: recordRoll(next, { kind: 'check', label: `Cast ${spell.name}`, total: 0, working: note }),
      log: `casts ${spell.name} (${note}).`,
    });
    done();
  };

  // ------------------------------------------------------------------ items

  const consumables = ctx.items
    .map((resolved, index) => ({ resolved, index }))
    .filter(({ resolved }) => isConsumable(resolved.item));

  /*
    The flasks in the ordinary pack that are weapons when thrown - acid,
    alchemist's fire, holy water. Only offered where there is a battlefield
    to aim at: throwing is the aim flow with an improvised strike.
  */
  const throwables = (ctx.build.gear ?? [])
    .map((carried, index) => ({ carried, gear: gearById(carried.gearId), index }))
    .filter((row) => row.gear?.thrown && row.carried.quantity > 0);

  const throwGear = (index: number) => {
    const carried = ctx.build.gear[index];
    const gear = carried ? gearById(carried.gearId) : undefined;
    if (!carried || !gear?.thrown || !onAim) return;
    /*
      An improvised ranged attack: Dexterity, no proficiency - the flask is
      not a weapon anyone trains with. Spent on the throw, hit or miss, and
      all of it one write: the pack, the pip and the log together.
    */
    onAim([
      {
        label: gear.name,
        toHit: ctx.mods.dex,
        damage: [{ dice: gear.thrown.dice, type: gear.thrown.type }],
      },
    ]);
    onAct({
      build: {
        ...ctx.build,
        gear: ctx.build.gear
          .map((entry, i) => (i === index ? { ...entry, quantity: entry.quantity - 1 } : entry))
          .filter((entry) => entry.quantity > 0),
      },
      play: setTurnSlot(play, slotKey, true),
      log: `throws ${gear.name}${gear.note ? ` (${gear.note})` : ''} — pick the target.`,
    });
    done();
  };

  // An item is three stores in one swallow - the pack, the hit points, the
  // fight's log - which is exactly why onAct exists: one composed write.
  const spendItem = (index: number) => {
    const resolved = ctx.items[index];
    if (!resolved) return;
    const build = { ...ctx.build, items: consumeItem(ctx.build.items, index) };

    const heals = resolved.item?.use?.heals;
    const parsed = heals ? parseNotation(heals) : null;
    if (parsed) {
      const rolled = rollNotation(parsed, defaultRng);
      setLastRoll(`${resolved.name}: ${rolled.total}`);
      onAct({
        build,
        play: recordRoll(setTurnSlot(heal(play, rolled.total, ctx.hp.total), slotKey, true), {
          kind: 'check',
          label: resolved.name,
          total: rolled.total,
          working: `${rolled.working} healed`,
        }),
        log: `uses ${resolved.name} — ${rolled.total} healed.`,
      });
    } else if (resolved.item?.kind === 'scroll') {
      /*
        A scroll is cast, not drunk: the log says which spell is written on
        it (the carried `detail`) and the DC/attack its level carries (the
        item's own summary), so the table can resolve the spell it names.
        Consumed either way - a read scroll is ash.
      */
      const written = resolved.carried.detail?.trim();
      setLastRoll(`Read ${resolved.name}`);
      onAct({
        build,
        play: recordRoll(setTurnSlot(play, slotKey, true), {
          kind: 'check',
          label: `Read ${resolved.name}`,
          total: 0,
          working: written ?? 'unlabelled',
        }),
        log: `reads ${resolved.name}${written ? ` — casts ${written}` : ''}. ${resolved.item.summary}`,
      });
    } else {
      setLastRoll(`Used ${resolved.name}`);
      onAct({
        build,
        play: recordRoll(setTurnSlot(play, slotKey, true), {
          kind: 'check',
          label: `Used ${resolved.name}`,
          total: 0,
          working: 'no roll',
        }),
        log: `uses ${resolved.name}.`,
      });
    }
    done();
  };

  // The one-click commands: spend the pip, say so, close the box.
  const generic = (name: string) => {
    onAct({ play: setTurnSlot(play, slotKey, true), log: `takes the ${name} action.` });
    done();
  };

  /*
    Disengage and Dodge, which are the same shape as `generic` plus the one
    thing that makes them worth an action: a fact recorded rather than a
    sentence logged. Both were narrated only until §28, so Disengage was an
    entire action bought against a rule nothing enforced.
  */
  const stance = (kind: 'disengage' | 'dodge', name: string) => {
    onAct({
      play: setStance(setTurnSlot(play, slotKey, true), kind),
      log: `takes the ${name} action.`,
    });
    done();
  };

  const slotSummary = casting.casts
    ? casting.bySpellLevel
        .map((total, i) => ({ level: i + 1, left: slotsLeft(play, i + 1, total), total }))
        .filter((s) => s.total > 0)
    : [];

  /*
    Escape backs out one level, the way every menu of this shape ever has.
    Stopped here so the map's own Escape chain (aim, spells, brushes) does
    not also fire from a keypress meant for the box.
  */
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (sub) setSub(null);
    else if (!standing) onClose();
  };

  const item = (label: string, onPick: () => void, hint?: string, count?: number) => (
    <button key={label} type="button" className="cmd-item" title={hint} onClick={onPick}>
      {label}
      {count !== undefined && <em>{count}</em>}
    </button>
  );

  return (
    <div
      className="cmd-menu"
      role="menu"
      aria-label={`Spend the ${slot === 'bonus' ? 'bonus action' : 'action'} on`}
      onKeyDown={onKey}
    >
      {sub === null && (
        <>
          <div className="cmd-grid">
            {slot === 'action' && onMoveCommand &&
              item(
                'Move',
                () => {
                  onMoveCommand();
                  done();
                },
                'Walk the lit tiles — movement is its own budget, not the action',
              )}
            {attackLines.length > 0 &&
              item('Attack', () => setSub('attack'), 'The weapons in hand', attackLines.length)}
            {spells.length > 0 &&
              item('Cast a spell', () => setSub('cast'), 'Against real slots', spells.length)}
            {slot === 'action' &&
              item(
                'Dash',
                () => {
                  onAct({ play: setTurnSlot(dash(play), 'action', true), log: 'Dashes.' });
                  done();
                },
                "Add your speed to this turn's movement. Cunning Action? Give the action back on the pip and spend the bonus instead.",
              )}
            {slot === 'action' && (consumables.length > 0 || (throwables.length > 0 && onAim)) &&
              item(
                'Use an item',
                () => setSub('item'),
                'The consumables in the pack — and the flasks that throw',
                consumables.length + (onAim ? throwables.length : 0),
              )}
            {slot === 'action' && onHide &&
              item(
                'Hide',
                () => {
                  // The owner rolls, hides, logs AND spends the action in one
                  // write - a second write from here would erase the first.
                  onHide();
                  done();
                },
                'Roll Stealth for real and vanish from the fog',
              )}
            {slot === 'action' && onGrab &&
              item(
                'Shove',
                () => {
                  onGrab('push');
                  done();
                },
                'Athletics against their Athletics or Acrobatics — five feet back, and off a ledge if one is behind them',
              )}
            {slot === 'action' && onGrab &&
              item(
                'Trip',
                () => {
                  onGrab('prone');
                  done();
                },
                'The same contest, spent on putting them on the floor instead',
              )}
            {slot === 'action' && onGrab &&
              item(
                'Grapple',
                () => {
                  onGrab('grapple');
                  done();
                },
                'The same contest again, spent on holding them: speed 0 until they break free or you let go',
              )}
            {slot === 'action' && onEscapeGrapple &&
              item(
                'Escape the grapple',
                () => {
                  // The owner rolls, frees, logs and spends the action in one
                  // write - trying costs the action whether or not it works.
                  onEscapeGrapple();
                  done();
                },
                'Your Athletics or Acrobatics, whichever is better, against their Athletics',
              )}
            {onReleaseGrapple &&
              item(
                'Let go',
                () => {
                  onReleaseGrapple();
                  done();
                },
                'Release whoever you are holding — free, and takes nothing from the turn',
              )}
            {slot === 'action' &&
              item(
                'Disengage',
                () => stance('disengage', 'Disengage'),
                'Nobody gets an opportunity attack as you leave — recorded, and enforced',
              )}
            {slot === 'action' &&
              item(
                'Dodge',
                () => stance('dodge', 'Dodge'),
                'Attacks against you have disadvantage until your next turn',
              )}
            {slot === 'action' && item('Help', () => generic('Help'), 'An ally gets advantage')}
            {slot === 'action' && item('Ready', () => generic('Ready'), 'Hold the action for a trigger — the reaction spends when it fires')}
            {slot === 'bonus' &&
              item('Just spend it', () => generic('Bonus'), 'Mark the bonus action used, for anything the menu does not know')}
          </div>
          {!standing && (
            <button type="button" className="cmd-back" onClick={onClose}>
              ‹ Close
            </button>
          )}
        </>
      )}

      {sub === 'attack' && (
        <div className="cmd-sub">
          {attackLines.map(({ line, index }) => (
            <span className="hud-attack" key={index}>
              <button
                type="button"
                className="hud-act"
                title={`Roll to hit with the ${line.weapon.name}${line.hand === 'off' ? ' (off hand — bonus action)' : ''}`}
                onClick={() => attack(index)}
              >
                {line.weapon.name} {signed(line.toHit)}
              </button>
              <button
                type="button"
                className="hud-act hud-act-sub"
                title={`Roll ${line.weapon.name} damage`}
                onClick={() => damageFor(index, false)}
              >
                {damageDice(line.weapon, line.hand === 'main' && !ctx.loadouts.offHand)}
                {line.damage.bonus ? signed(line.damage.bonus) : ''}
              </button>
              <button
                type="button"
                className="hud-act hud-act-sub"
                title="Damage as a critical hit — double the dice, not the bonus"
                onClick={() => damageFor(index, true)}
              >
                crit
              </button>
              {onAim && (
                <button
                  type="button"
                  className="hud-act hud-act-sub"
                  title={`Aim the ${line.weapon.name} at somebody — the app compares the roll to their armor class and applies the damage`}
                  onClick={() => {
                    const dice = damageDice(line.weapon, line.hand === 'main' && !ctx.loadouts.offHand);
                    onAim([
                      {
                        label: line.weapon.name,
                        toHit: line.toHit,
                        damage: [
                          {
                            dice: `${dice}${line.damage.bonus ? signed(line.damage.bonus) : ''}`,
                            type: line.damage.type,
                          },
                        ],
                      },
                    ]);
                    // Aiming is taking the Attack action, same as rolling.
                    onAct({
                      play: setTurnSlot(play, line.hand === 'off' ? 'bonusAction' : 'action', true),
                    });
                    done();
                  }}
                >
                  vs…
                </button>
              )}
            </span>
          ))}
          {lastRoll && <span className="hud-lastroll">{lastRoll}</span>}
          <button type="button" className="cmd-back" onClick={() => setSub(null)}>
            ‹ Back
          </button>
        </div>
      )}

      {sub === 'cast' && (
        <div className="cmd-sub">
          <p className="cmd-note">
            {casting.saveDc !== null && <span>DC {casting.saveDc}</span>}
            {casting.attackBonus !== null && <span> · {signed(casting.attackBonus)} to hit</span>}
            {slotSummary.map((s) => (
              <span key={s.level} className={`tag ${s.left === 0 ? 'is-spent' : ''}`}>
                L{s.level} {s.left}/{s.total}
              </span>
            ))}
            {casting.pact && (
              <span className={`tag ${play.pactSpent >= casting.pact.count ? 'is-spent' : ''}`}>
                Pact {Math.max(0, casting.pact.count - play.pactSpent)}/{casting.pact.count}
              </span>
            )}
          </p>
          <div className="hud-spell-list">
            {spells.map((spell) => {
              const payable = spell.level === 0 || slotFor(spell) !== null;
              return (
                <button
                  key={spell.id}
                  type="button"
                  className="hud-act"
                  disabled={!payable}
                  title={
                    spell.level === 0
                      ? `${spell.name} — cantrip. ${spell.summary}`
                      : payable
                        ? `${spell.name} — level ${spell.level}. ${spell.summary}`
                        : `${spell.name} — no slot left that can carry it`
                  }
                  onClick={() => cast(spell)}
                >
                  {spell.name}
                  <em>{spell.level === 0 ? 'c' : spell.level}</em>
                </button>
              );
            })}
          </div>
          <button type="button" className="cmd-back" onClick={() => setSub(null)}>
            ‹ Back
          </button>
        </div>
      )}

      {sub === 'item' && (
        <div className="cmd-sub">
          {consumables.map(({ resolved, index }) => (
            <button
              key={index}
              type="button"
              className="hud-act"
              title={resolved.item?.summary ?? resolved.name}
              onClick={() => spendItem(index)}
            >
              {resolved.name}
              {quantityOf(resolved.carried) > 1 && <em>×{quantityOf(resolved.carried)}</em>}
            </button>
          ))}
          {onAim &&
            throwables.map(({ carried, gear, index }) => (
              <button
                key={`g${index}`}
                type="button"
                className="hud-act"
                title={`Throw it — improvised: DEX to hit (${signed(ctx.mods.dex)}), ${gear!.thrown!.dice} ${gear!.thrown!.type}, the flask spent either way. ${gear!.note ?? ''}`}
                onClick={() => throwGear(index)}
              >
                Throw {gear!.name}
                {carried.quantity > 1 && <em>×{carried.quantity}</em>}
              </button>
            ))}
          <button type="button" className="cmd-back" onClick={() => setSub(null)}>
            ‹ Back
          </button>
        </div>
      )}
    </div>
  );
}
