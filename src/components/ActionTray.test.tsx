// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandMenu } from './ActionTray';
import { deriveBuild } from '../engine/character';
import { emptyPlay, slotsLeft } from '../play';
import type { PlayState } from '../play';
import { fighter, wizard } from '../test/factories';
import type { Build } from '../types';

/**
 * The command menu: the sheet's own numbers behind Attack / Cast / Item.
 *
 * What these check is the *writes* - a cast spends a real slot, an attack
 * spends the action, a potion leaves the inventory, a one-click command
 * spends the pip and says so - because every one of those goes into the
 * same stores the sheet reads, and a menu that only changed its own display
 * would look identical until somebody opened the sheet mid-fight and found
 * a full set of slots.
 */

function setup(
  build: Build,
  initial: PlayState = emptyPlay(),
  slot: 'action' | 'bonus' = 'action',
  extra: { silenced?: boolean; onStandUp?: { feet: number; act: () => void } } = {},
) {
  let play = initial;
  let current = build;
  const onAct = vi.fn();
  const onLog = vi.fn();
  const onClose = vi.fn();
  const onAim = vi.fn();

  const props = () => ({
    ctx: deriveBuild(current),
    play,
    slot,
    onAct,
    onAim,
    onClose,
    ...extra,
  });
  const view = render(<CommandMenu {...props()} />);
  // The composed write, as the cockpit composes it: whatever fields one
  // command carries land together, from one snapshot.
  onAct.mockImplementation(
    (act: { play?: PlayState; build?: Build; log?: string }) => {
      if (act.build) current = act.build;
      if (act.play) play = act.play;
      if (act.log) onLog(act.log);
      view.rerender(<CommandMenu {...props()} />);
    },
  );

  return {
    onLog,
    onClose,
    onAim,
    get play() {
      return play;
    },
    get build() {
      return current;
    },
    get ctx() {
      return deriveBuild(current);
    },
  };
}

describe('the command list', () => {
  it('offers the PHB actions, and the one-click ones spend the pip and say so', async () => {
    const user = userEvent.setup();
    const view = setup(fighter());

    // The grid is the old menus' grammar: Attack, Dash, and the table's own.
    for (const name of ['Attack', 'Dash', 'Disengage', 'Dodge', 'Help', 'Ready']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }

    await user.click(screen.getByRole('button', { name: /^Dodge/ }));
    expect(view.play.turn.action).toBe(true);
    expect(view.onLog).toHaveBeenCalledWith('takes the Dodge action.');
    expect(view.onClose).toHaveBeenCalled();
  });

  it('hides Cast for a fighter and Use an item for an empty pack', () => {
    setup(fighter());
    expect(screen.queryByRole('button', { name: /cast a spell/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /use an item/i })).not.toBeInTheDocument();
  });
});

describe('attacks', () => {
  it('rolls to hit from the Attack submenu and spends the action with it', async () => {
    const user = userEvent.setup();
    const view = setup(fighter());

    await user.click(screen.getByRole('button', { name: /^Attack/ }));
    await user.click(screen.getByRole('button', { name: /greatsword \+/i }));

    expect(view.play.turn.action).toBe(true);
    // The roll landed in the character's own log, where their sheet reads it.
    expect(view.play.rolls[0].label).toMatch(/greatsword to hit/i);
    expect(view.play.rolls[0].total).toBeGreaterThanOrEqual(1);
  });

  it('offers dash, which adds the speed, spends the action and closes', async () => {
    const user = userEvent.setup();
    const view = setup(fighter());
    await user.click(screen.getByRole('button', { name: /^Dash/ }));
    expect(view.play.turn.dashes).toBe(1);
    expect(view.play.turn.action).toBe(true);
    expect(view.onLog).toHaveBeenCalledWith('Dashes.');
    expect(view.onClose).toHaveBeenCalled();
  });
});

describe('spells', () => {
  /*
    Hands free, deliberately.

    `wizard()` inherits the example character's greatsword from `emptyBuild`,
    and since §64 a two-handed weapon stops a somatic component - a real rule,
    and exactly what the component tests further down check. These tests are
    about slots and the action economy, so they put the sword down rather than
    testing two unrelated rules at once and blaming the wrong one on failure.
  */
  const caster = (over: Partial<Build> = {}): Build => ({
    ...wizard(),
    weapons: { magicBonus: {} },
    ...over,
  });

  /** A wizard with today's spells actually prepared - a book is not a morning. */
  const prepared = (): Build => caster({ preparedIds: ['fireball', 'shield'] });

  it('lists only what this pip can pay the casting time of', async () => {
    const user = userEvent.setup();
    setup(prepared());
    await user.click(screen.getByRole('button', { name: /cast a spell/i }));
    // Fireball is an action; Shield is a reaction and has no place here.
    expect(screen.getByRole('button', { name: /fireball/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /shield/i })).not.toBeInTheDocument();
  });

  it('spends a real slot, visible to everything that counts slots', async () => {
    const user = userEvent.setup();
    const view = setup(prepared());
    const thirdLevel = view.ctx.spellcasting.bySpellLevel[2];

    await user.click(screen.getByRole('button', { name: /cast a spell/i }));
    await user.click(screen.getByRole('button', { name: /fireball/i }));

    expect(slotsLeft(view.play, 3, thirdLevel)).toBe(thirdLevel - 1);
    expect(view.play.rolls[0].label).toBe('Cast Fireball');
    expect(view.onClose).toHaveBeenCalled();
  });

  it('refuses a spell nothing can pay for, and says why on the button', async () => {
    const user = userEvent.setup();
    setup(prepared(), {
      ...emptyPlay(),
      // Every slot of every level already spent.
      slotsSpent: [9, 9, 9, 9, 9, 9, 9, 9, 9],
    });
    await user.click(screen.getByRole('button', { name: /cast a spell/i }));
    const button = screen.getByRole('button', { name: /fireball/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', expect.stringMatching(/no slot left/i));
  });

  it('casts cantrips without touching a slot, prepared or not', async () => {
    // Nothing prepared today - the cantrips are still there, because a book
    // caster's cantrips are known rather than prepared.
    const user = userEvent.setup();
    const view = setup(caster());
    const cantrip = view.ctx.spellcasting.castable.find((s) => s.level === 0)!;
    await user.click(screen.getByRole('button', { name: /cast a spell/i }));
    await user.click(screen.getByRole('button', { name: new RegExp(cantrip.name, 'i') }));
    expect(view.play.slotsSpent.every((n) => !n)).toBe(true);
  });
});

describe('the pack', () => {
  const withPotion = (): Build => ({
    ...fighter(),
    items: [{ itemId: 'potion-of-healing', quantity: 2, attuned: false }],
  });

  it('drinks a potion through the inventory, healing rolled for real', async () => {
    const user = userEvent.setup();
    const view = setup(withPotion(), { ...emptyPlay(), currentHp: 1 });

    await user.click(screen.getByRole('button', { name: /use an item/i }));
    await user.click(screen.getByRole('button', { name: /potion of healing/i }));

    // One fewer in the pack - the build itself changed, as the sheet's own
    // "Drink it" changes it.
    expect(view.build.items[0].quantity).toBe(1);
    // And the healing landed: 2d4+2 is at least 4 over 1 hp.
    expect(view.play.currentHp).toBeGreaterThanOrEqual(5);
    expect(view.play.rolls[0].working).toMatch(/healed/);
    // Using an item is the Use an Item action.
    expect(view.play.turn.action).toBe(true);
  });
});

describe('the flasks that throw', () => {
  const armed = (): Build => ({
    ...fighter(),
    gear: [{ gearId: 'alchemists-fire', quantity: 2 }],
  });

  it('arms the aim with an improvised strike and spends the flask either way', async () => {
    const user = userEvent.setup();
    const view = setup(armed());
    const dex = view.ctx.mods.dex;

    await user.click(screen.getByRole('button', { name: /use an item/i }));
    await user.click(screen.getByRole('button', { name: /throw alchemist's fire/i }));

    // The aim flow got the throw: DEX to hit, no proficiency, the real dice.
    expect(view.onAim).toHaveBeenCalledWith([
      { label: "Alchemist's fire (flask)", toHit: dex, damage: [{ dice: '1d4', type: 'fire' }] },
    ]);
    // The flask left the pack on the throw - a miss does not refund it.
    expect(view.build.gear).toEqual([{ gearId: 'alchemists-fire', quantity: 1 }]);
    expect(view.play.turn.action).toBe(true);
    expect(view.onLog).toHaveBeenCalledWith(expect.stringMatching(/throws Alchemist's fire/));
  });
});

describe('the scrolls', () => {
  const scribed = (): Build => ({
    ...fighter(),
    items: [{ itemId: 'spell-scroll-3rd', quantity: 1, attuned: false, detail: 'Fireball' }],
  });

  it('reads out the spell written on it, and the scroll is ash', async () => {
    const user = userEvent.setup();
    const view = setup(scribed());

    await user.click(screen.getByRole('button', { name: /use an item/i }));
    await user.click(screen.getByRole('button', { name: /spell scroll/i }));

    expect(view.build.items).toHaveLength(0);
    expect(view.play.turn.action).toBe(true);
    // The log names the spell and carries the scroll's own DC line.
    expect(view.onLog).toHaveBeenCalledWith(
      expect.stringMatching(/reads Spell Scroll \(3rd Level\) — casts Fireball\..*DC 15/),
    );
  });
});

describe('the bonus menu', () => {
  it('offers bonus-time spells and the plain spend', async () => {
    const user = userEvent.setup();
    // Misty Step is a bonus action; give the wizard it prepared.
    const view = setup(
      { ...wizard(), spellIds: [...wizard().spellIds, 'misty-step'], preparedIds: ['misty-step'] },
      emptyPlay(),
      'bonus',
    );
    await user.click(screen.getByRole('button', { name: /cast a spell/i }));
    expect(screen.getByRole('button', { name: /misty step/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /misty step/i }));
    expect(view.play.turn.bonusAction).toBe(true);
  });

  it('can always just spend the pip', async () => {
    const user = userEvent.setup();
    const view = setup(fighter(), emptyPlay(), 'bonus');
    await user.click(screen.getByRole('button', { name: /just spend it/i }));
    expect(view.play.turn.bonusAction).toBe(true);
    expect(view.onClose).toHaveBeenCalled();
  });
});

/*
  §64. The components, applied to what is actually in this caster's hands.

  Each case names a spell whose component line makes the point: Fireball is
  V/S/M, Shield is V/S, and Counterspell is somatic only - so a silenced
  caster keeps exactly one of the three, which is the rule rather than a
  simplification of it.
*/
describe('what the components stop', () => {
  /*
    Three cantrips and one slot spell, chosen for their component lines:

      Fire Bolt      V, S      the somatic case
      True Strike    S         somatic only - what a silenced caster keeps
      Fireball       V, S, M   the material case War Caster cannot answer

    Cantrips rather than prepared spells wherever possible, so a failure is
    about components and not about whether something was prepared today.
  */
  const KNOWS = ['fire-bolt', 'true-strike', 'fireball'];
  const PREPARED = ['fireball'];

  /** Hands free: nothing recorded in either hand, and no shield. */
  const openHanded = (over: Partial<Build> = {}): Build => ({
    ...wizard(),
    weapons: { magicBonus: {} },
    spellIds: KNOWS,
    preparedIds: PREPARED,
    ...over,
  });

  /** A two-handed weapon actually recorded, which is what takes both hands. */
  const armed = (over: Partial<Build> = {}): Build =>
    openHanded({ weapons: { magicBonus: {}, mainHandId: 'greatsword' }, ...over });

  const spellButton = (name: string) =>
    screen.getByRole('button', { name: new RegExp(`^${name}`) }) as HTMLButtonElement;

  it('offers every spell when both hands are free', async () => {
    const user = userEvent.setup();
    setup(openHanded());
    await user.click(screen.getByRole('button', { name: /^Cast/ }));
    expect(spellButton('Fireball').disabled).toBe(false);
  });

  it('stops a somatic spell when both hands are full, and says which component', async () => {
    const user = userEvent.setup();
    setup(armed());
    await user.click(screen.getByRole('button', { name: /^Cast/ }));

    const fireball = spellButton('Fireball');
    expect(fireball.disabled).toBe(true);
    // The reason, not just the refusal - "both hands are full" is a problem a
    // player can solve on their own turn.
    expect(fireball.title).toMatch(/both hands are full/i);
    expect(fireball.title).toMatch(/somatic/i);
  });

  it('lets War Caster through the gesture but not the material component', async () => {
    const user = userEvent.setup();
    setup(armed({ featIds: ['war-caster'] }));
    await user.click(screen.getByRole('button', { name: /^Cast/ }));

    // Fire Bolt is V/S: War Caster answers it completely.
    expect(spellButton('Fire Bolt').disabled).toBe(false);
    // Fireball is V/S/M: the bat guano still needs a hand.
    expect(spellButton('Fireball').disabled).toBe(true);
    expect(spellButton('Fireball').title).toMatch(/material/i);
  });

  it('leaves the verbal rule alone off the battlefield', async () => {
    const user = userEvent.setup();
    // No `silenced` prop at all: the sheet's own tray has no map to ask.
    setup(openHanded());
    await user.click(screen.getByRole('button', { name: /^Cast/ }));
    expect(spellButton('Fireball').disabled).toBe(false);
  });

  it('stops a verbal spell inside a Silence, and keeps the somatic one', async () => {
    const user = userEvent.setup();
    setup(openHanded(), emptyPlay(), 'action', { silenced: true });
    await user.click(screen.getByRole('button', { name: /^Cast/ }));

    expect(spellButton('Fireball').disabled).toBe(true);
    expect(spellButton('Fireball').title).toMatch(/cannot speak/i);
    // True Strike is somatic only - a silenced caster still has it, which is
    // the half of the rule that makes the V worth modelling separately.
    expect(spellButton('True Strike').disabled).toBe(false);
  });
});

describe('getting up off the floor', () => {
  /*
    §65. Standing up costs half your speed, which is what makes a Trip worth
    an action: before this the condition cost its victim nothing but a round
    of bad rolls, because they stood back up for free.
  */
  it('offers Stand up beside Move, with the price in the tooltip', async () => {
    const act = vi.fn();
    setup(fighter(), emptyPlay(), 'action', { onStandUp: { feet: 15, act } });
    const button = screen.getByRole('button', { name: 'Stand up' });
    expect(button.title).toMatch(/15 ft/);
  });

  it('runs the caller’s write when pressed', async () => {
    const user = userEvent.setup();
    const act = vi.fn();
    const { onClose } = setup(fighter(), emptyPlay(), 'action', {
      onStandUp: { feet: 15, act },
    });
    await user.click(screen.getByRole('button', { name: 'Stand up' }));
    expect(act).toHaveBeenCalledTimes(1);
    // And the menu closes, like every other one-press command.
    expect(onClose).toHaveBeenCalled();
  });

  it('is absent when the caller does not offer it', () => {
    // Which is how "they are not prone" and "they cannot afford it" both
    // reach here: the battle screen knows the speed and the budget, and a
    // menu offering a command the rules refuse would be worse than one that
    // hides it.
    setup(fighter());
    expect(screen.queryByRole('button', { name: 'Stand up' })).toBeNull();
  });
});
