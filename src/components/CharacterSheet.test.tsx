// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CharacterSheet } from './CharacterSheet';
import { deriveBuild } from '../engine/character';
import { emptyPlay } from '../play';
import type { PlayState } from '../play';
import type { Build } from '../types';
import { buildOf, fighter, warlockSorcerer, wizard } from '../test/factories';

/**
 * The sheet is two things at once and both are worth pinning.
 *
 * It is the printed page, so the facts a paper sheet has a box for have to be
 * on it - saving throws, every skill, attacks, features, the spell list. And it
 * is the play tracker that used to be a panel on the Builder, so the boxes are
 * live: the tests that used to live in PlayPanel.test.tsx are here, against the
 * sheet's markup, because that is where those interactions moved.
 */

function setup(build: Build, initial: PlayState = emptyPlay()) {
  const ctx = deriveBuild(build);
  const onPlayChange = vi.fn();
  const onBuildChange = vi.fn();
  let play = initial;

  const view = render(
    <CharacterSheet
      ctx={ctx}
      play={play}
      onPlayChange={onPlayChange}
      onBuildChange={onBuildChange}
    />,
  );
  // Feed each change back in, so a sequence of clicks behaves like the real app.
  onPlayChange.mockImplementation((next: PlayState) => {
    play = next;
    view.rerender(
      <CharacterSheet
        ctx={ctx}
        play={play}
        onPlayChange={onPlayChange}
        onBuildChange={onBuildChange}
      />,
    );
  });

  return {
    ctx,
    onPlayChange,
    onBuildChange,
    get play() {
      return play;
    },
  };
}

const track = (label: string | RegExp) =>
  screen
    .getAllByText(label)
    .map((node) => node.closest('.cs-track'))
    .find(Boolean) as HTMLElement;

const currentHp = () => screen.getByLabelText(/^current hit points$/i) as HTMLInputElement;

describe('what a paper sheet has a box for', () => {
  it('names the character, their class line and their origin', () => {
    setup(fighter());
    const banner = screen.getByText('Class & level').closest('.cs-banner') as HTMLElement;
    expect(screen.getByLabelText(/character name/i)).toHaveValue('Basher');
    expect(within(banner).getByText('Fighter (Champion) 5')).toBeInTheDocument();
    expect(within(banner).getByText('Human')).toBeInTheDocument();
  });

  it('carries all six abilities and all six saving throws', () => {
    const { ctx } = setup(fighter());
    const saves = screen.getByText('Saving throws').closest('.cs-box') as HTMLElement;

    for (const name of ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']) {
      expect(within(saves).getByText(name)).toBeInTheDocument();
    }
    // A Fighter is proficient in Strength and Constitution saves only.
    const proficient = within(saves).getByText('Strength').closest('li') as HTMLElement;
    expect(proficient.querySelector('.dot')?.className).toContain('on');
    expect(
      (within(saves).getByText('Charisma').closest('li') as HTMLElement).querySelector('.dot')
        ?.className,
    ).not.toContain('on');
    // The ability blocks repeat the six names, so they are found by structure.
    const abilities = document.querySelector('.cs-abilities') as HTMLElement;
    expect(within(abilities).getByText(String(ctx.scores.str))).toBeInTheDocument();
  });

  /** A sheet that only lists the skills you are good at is not a sheet. */
  it('lists every skill, not only the proficient ones', () => {
    setup(fighter());
    const skills = screen.getByText('Skills').closest('.cs-box') as HTMLElement;
    expect(within(skills).getAllByRole('listitem')).toHaveLength(18);
    expect(within(skills).getByText(/Sleight of Hand/)).toBeInTheDocument();
  });

  it('shows armor class, initiative, speed and the hit point maximum', () => {
    const { ctx } = setup(fighter());
    expect(screen.getByText('Armor class').previousSibling).toHaveTextContent(String(ctx.ac.total));
    expect(screen.getByText('Passive wisdom (perception)').previousSibling).toHaveTextContent(
      String(ctx.proficiencies.passivePerception),
    );
    const hp = screen.getByText('Hit points').closest('.cs-box') as HTMLElement;
    expect(within(hp).getByText(String(ctx.hp.total))).toBeInTheDocument();
  });

  it('puts what you swing in the attacks table', () => {
    setup(fighter());
    const table = screen.getByRole('table');
    expect(within(table).getByText('Greatsword')).toBeInTheDocument();
  });

  it('lists species traits and class features together, as the sheet does', () => {
    setup(fighter());
    const features = screen.getByText('Features & traits').closest('.cs-box') as HTMLElement;
    expect(within(features).getByText('Second Wind')).toBeInTheDocument();
    // The SRD tiers this one - "Action Surge (1 use)" - so match the feature
    // rather than the use count. What is being asserted is that a class
    // feature reaches the printed box at all.
    expect(within(features).getByText(/^Action Surge/)).toBeInTheDocument();
  });

  it('gives a caster a spell page with their slots and their spells', () => {
    setup(wizard());
    expect(screen.getByText('Spellcasting class')).toBeInTheDocument();
    expect(screen.getByText('Fireball')).toBeInTheDocument();
    expect(screen.getByText('Fire Bolt')).toBeInTheDocument();
    // A cantrip is not a levelled spell and gets its own box.
    expect(screen.getByText('Cantrips')).toBeInTheDocument();
  });

  it('leaves the spell page off a character who does not cast', () => {
    setup(fighter());
    expect(screen.queryByText('Spellcasting class')).not.toBeInTheDocument();
  });
});

describe('how far this character gets', () => {
  /*
    §65. The jump distances are the half a player asks for at a table and the
    sheet never carried, because they are a rule rather than a stat: the long
    jump is your Strength *score* in feet, which appears nowhere else.
  */
  it('prints the long jump as the Strength score, not the modifier', () => {
    const build = fighter();
    const { scores, mods } = deriveBuild(build);
    setup(build);
    const chip = screen.getByText('Long jump').closest('.cs-chip');
    const printed = Number(within(chip as HTMLElement).getByText(/^\d+$/).textContent);
    // Exactly the score, and provably not the modifier: asserting only
    // "at least 15" would have passed against either.
    expect(printed).toBe(scores.str);
    expect(printed).not.toBe(mods.str);
  });

  it('prints a high jump too, which is a different formula', () => {
    setup(fighter());
    expect(screen.getByText('High jump')).toBeTruthy();
  });

  it('shows no Climb chip for somebody with no climb speed', () => {
    setup(fighter());
    expect(screen.queryByText('Climb')).toBeNull();
    expect(screen.queryByText('Swim')).toBeNull();
  });

  it('shows a Climb chip for somebody who has one', () => {
    // A Tabaxi's claws are 20 feet of climb, on the record since §65.
    setup(buildOf({
      raceId: 'tabaxi',
      classes: [{ classId: 'fighter', level: 3, subclassId: 'champion' }],
    }));
    const chip = screen.getByText('Climb').closest('.cs-chip');
    expect(within(chip as HTMLElement).getByText('20')).toBeTruthy();
  });
});

describe('the roleplay boxes', () => {
  it('writes what you type back onto the character', async () => {
    const app = setup(fighter());
    // One keystroke: nothing feeds the change back in here, so each one starts
    // from the same empty field.
    await userEvent.type(screen.getByLabelText(/^ideals$/i), 'H');
    const last = app.onBuildChange.mock.calls.at(-1)![0] as Build;
    expect(last.details.ideals).toBe('H');
  });
});

/**
 * §82. The appearance boxes: the last thing the PHB page had a box for and
 * this sheet did not. Free text, six of them, and each one writes straight
 * back onto the character like every other roleplay box.
 */
describe('the appearance boxes', () => {
  it('has all six the printed sheet asks for', () => {
    setup(fighter());
    for (const label of ['Age', 'Height', 'Weight', 'Eyes', 'Skin', 'Hair']) {
      expect(screen.getByLabelText(new RegExp(`^${label}$`, 'i'))).toBeInTheDocument();
    }
  });

  it('writes what you type back onto the character', async () => {
    const app = setup(fighter());
    // Free text on purpose: a height is 6'2" as often as it is a number, and
    // a number field would have to refuse one of those.
    await userEvent.type(screen.getByLabelText(/^height$/i), '6');
    const last = app.onBuildChange.mock.calls.at(-1)![0] as Build;
    expect(last.details.height).toBe('6');
  });

  it('takes a written height whole, apostrophe and all', async () => {
    const app = setup(buildOf({ ...fighter(), details: { ...fighter().details, height: `6'2"` } }));
    expect((screen.getByLabelText(/^height$/i) as HTMLInputElement).value).toBe(`6'2"`);
    // And it is still just a string on the way out.
    await userEvent.type(screen.getByLabelText(/^eyes$/i), 'g');
    const last = app.onBuildChange.mock.calls.at(-1)![0] as Build;
    expect(last.details.eyes).toBe('g');
    expect(last.details.height).toBe(`6'2"`);
  });
});

describe('hit points', () => {
  it('starts at full', () => {
    const { ctx } = setup(fighter());
    expect(currentHp()).toHaveValue(ctx.hp.total);
  });

  it('applies damage and healing through the one box', async () => {
    const { ctx } = setup(fighter());
    const max = ctx.hp.total;

    await userEvent.type(screen.getByLabelText(/amount of damage/i), '12');
    await userEvent.click(screen.getByRole('button', { name: 'Damage' }));
    expect(currentHp()).toHaveValue(max - 12);

    await userEvent.type(screen.getByLabelText(/amount of damage/i), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Heal' }));
    expect(currentHp()).toHaveValue(max - 7);
  });

  it('spends temporary hit points first, as the rules do', async () => {
    const { ctx } = setup(fighter());
    const max = ctx.hp.total;

    await userEvent.type(screen.getByLabelText(/amount of damage/i), '8');
    await userEvent.click(screen.getByRole('button', { name: 'Temp' }));
    expect(screen.getByLabelText(/^temporary hit points$/i)).toHaveValue(8);

    await userEvent.type(screen.getByLabelText(/amount of damage/i), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Damage' }));
    expect(screen.getByLabelText(/^temporary hit points$/i)).toHaveValue(3);
    // Real hit points are untouched while the buffer holds.
    expect(currentHp()).toHaveValue(max);
  });
});

describe('death saves', () => {
  /**
   * They are printed on the sheet whether or not you are down, unlike the old
   * panel which hid them - a box that appears only in an emergency is a box you
   * have never used before.
   */
  it('are on the sheet at full health', () => {
    setup(fighter());
    expect(screen.getByText('Death saves')).toBeInTheDocument();
  });

  it('clear themselves the moment you are healed', async () => {
    const app = setup(fighter());
    await userEvent.click(screen.getByLabelText(/death save failure 1/i));
    expect(app.play.deathSaves.failures).toBe(1);

    await userEvent.type(screen.getByLabelText(/amount of damage/i), '4');
    await userEvent.click(screen.getByRole('button', { name: 'Heal' }));
    expect(app.play.deathSaves.failures).toBe(0);
  });
});

describe('hit dice', () => {
  it('gives a multiclass character one row per class', () => {
    setup(warlockSorcerer());
    expect(screen.getByText(/6d8/)).toBeInTheDocument();
    expect(screen.getByText(/4d6/)).toBeInTheDocument();
  });

  it('spends one at a time', async () => {
    setup(fighter(5));
    expect(within(track(/5d10/)).getByText('5/5')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Fighter hit die 1'));
    expect(within(track(/5d10/)).getByText('4/5')).toBeInTheDocument();
  });
});

describe('spell slots', () => {
  it('keeps pact slots apart from ordinary ones', () => {
    setup(warlockSorcerer());
    expect(screen.getByText('Pact magic — level 3')).toBeInTheDocument();
    expect(screen.getByText('Level 1')).toBeInTheDocument();
  });

  it('spends a pact slot without touching the ordinary ones', async () => {
    setup(warlockSorcerer());
    const ordinaryBefore = within(
      screen.getByText('Level 1').closest('.cs-box') as HTMLElement,
    ).getByText(/^\d+\/\d+$/).textContent;

    await userEvent.click(screen.getByLabelText('Pact slot 1'));

    const pactBox = screen.getByText('Pact magic — level 3').closest('.cs-box') as HTMLElement;
    expect(within(pactBox).getByText('1/2')).toBeInTheDocument();
    expect(
      within(screen.getByText('Level 1').closest('.cs-box') as HTMLElement).getByText(
        ordinaryBefore!,
      ),
    ).toBeInTheDocument();
  });

  /**
   * Font of Magic is offered on the slot row rather than beside the points,
   * because the exchange is a thing you do to a slot. Vex is a Warlock 6 /
   * Sorcerer 4, so the points are four and the ordinary slots come from the
   * Sorcerer half alone.
   */
  it('trades sorcery points for a slot and back on the slot row', async () => {
    setup(warlockSorcerer());
    const level1 = () => screen.getByText('Level 1').closest('.cs-box') as HTMLElement;
    const points = () => screen.getByLabelText(/sorcery points remaining/i);
    expect(within(level1()).getByText('4/4')).toBeInTheDocument();
    expect(points()).toHaveValue(4);

    await userEvent.click(within(level1()).getByRole('button', { name: /Make a slot/ }));
    expect(within(level1()).getByText('5/5')).toBeInTheDocument();
    expect(within(level1()).getByText(/1 made/)).toBeInTheDocument();
    expect(points()).toHaveValue(2);

    // And back the other way, at a deliberate loss: one point for the slot.
    await userEvent.click(within(level1()).getByRole('button', { name: /Burn for/ }));
    expect(within(level1()).getByText('4/5')).toBeInTheDocument();
    expect(points()).toHaveValue(3);
  });

  it('offers the exchange only to a character who has the points', () => {
    setup(fighter());
    expect(screen.queryByRole('button', { name: /Make a slot/ })).not.toBeInTheDocument();
  });
});

describe('the quiver', () => {
  const archer = () =>
    buildOf({
      ...fighter(),
      weapons: { ...fighter().weapons, mainHandId: 'longbow', offHandId: undefined },
      gear: [{ gearId: 'arrows', quantity: 2 }],
    });

  it('counts arrows rather than quivers, and names what draws on them', () => {
    setup(archer());
    expect(screen.getByLabelText('Arrows remaining')).toHaveValue(40);
    expect(screen.getByText('Longbow', { selector: 'em' })).toBeInTheDocument();
  });

  it('shoots one at a time and returns half of them off the battlefield', async () => {
    setup(archer());
    const left = () => screen.getByLabelText('Arrows remaining');
    for (let i = 0; i < 7; i++) {
      await userEvent.click(screen.getByRole('button', { name: 'Shoot' }));
    }
    expect(left()).toHaveValue(33);

    await userEvent.click(screen.getByRole('button', { name: 'Recover half' }));
    expect(left()).toHaveValue(36);

    await userEvent.click(screen.getByRole('button', { name: 'Restock' }));
    expect(left()).toHaveValue(40);
  });

  /** Arrows do not grow back overnight, and the sheet must not pretend. */
  it('is the one thing a long rest leaves alone', async () => {
    setup(archer());
    await userEvent.click(screen.getByRole('button', { name: 'Shoot' }));
    await userEvent.click(screen.getByRole('button', { name: /long rest/i }));
    expect(screen.getByLabelText('Arrows remaining')).toHaveValue(39);
  });

  it('says nothing to a character with nothing to shoot', () => {
    setup(fighter());
    expect(screen.queryByRole('button', { name: 'Shoot' })).not.toBeInTheDocument();
  });
});

describe('resting', () => {
  it('gives a short rest back Pact Magic and leaves hit points alone', async () => {
    const { ctx } = setup(warlockSorcerer());
    const max = ctx.hp.total;

    await userEvent.type(screen.getByLabelText(/amount of damage/i), '15');
    await userEvent.click(screen.getByRole('button', { name: 'Damage' }));
    await userEvent.click(screen.getByLabelText('Pact slot 1'));

    await userEvent.click(screen.getByRole('button', { name: /short rest/i }));
    const pactBox = screen.getByText('Pact magic — level 3').closest('.cs-box') as HTMLElement;
    expect(within(pactBox).getByText('2/2')).toBeInTheDocument();
    expect(currentHp()).toHaveValue(max - 15);
  });

  it('puts everything back on a long rest', async () => {
    const { ctx } = setup(warlockSorcerer());
    await userEvent.type(screen.getByLabelText(/amount of damage/i), '15');
    await userEvent.click(screen.getByRole('button', { name: 'Damage' }));

    await userEvent.click(screen.getByRole('button', { name: /long rest/i }));
    expect(currentHp()).toHaveValue(ctx.hp.total);
    expect(screen.getByText(/nothing spent/i)).toBeInTheDocument();
  });
});

describe('class resources', () => {
  it('shows what the class actually grants', () => {
    setup(fighter(9));
    const box = screen.getByText('Class resources').closest('.cs-box') as HTMLElement;
    expect(within(box).getByText(/Second Wind/)).toBeInTheDocument();
    expect(within(box).getByText(/Indomitable/)).toBeInTheDocument();
  });

  it('has no box at all for a class with no per-rest pool', () => {
    setup(
      buildOf({
        name: 'Sneak',
        classes: [{ classId: 'rogue', level: 9, subclassId: 'thief' }],
        baseScores: { str: 8, dex: 15, con: 14, int: 12, wis: 10, cha: 10 },
      }),
    );
    expect(screen.queryByText('Class resources')).not.toBeInTheDocument();
  });

  it('spends a use and puts it back', async () => {
    setup(fighter(9));
    expect(within(track(/Indomitable/)).getByText('1/1')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Indomitable 1'));
    expect(within(track(/Indomitable/)).getByText('0/1')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Indomitable 1'));
    expect(within(track(/Indomitable/)).getByText('1/1')).toBeInTheDocument();
  });

  /** Fifty circles for Lay on Hands would be unusable, so a pool is a number. */
  it('shows a big pool as a number rather than pips', () => {
    setup(
      buildOf({
        name: 'Oath',
        classes: [{ classId: 'paladin', level: 11, subclassId: 'devotion' }],
        baseScores: { str: 15, dex: 10, con: 14, int: 8, wis: 10, cha: 15 },
      }),
    );
    expect(screen.getByLabelText(/Lay on Hands remaining/i)).toHaveValue(55);
  });

  it('a short rest returns what recharges on one and leaves the rest', async () => {
    setup(fighter(9));
    await userEvent.click(screen.getByLabelText('Action Surge 1'));
    await userEvent.click(screen.getByLabelText('Indomitable 1'));

    await userEvent.click(screen.getByRole('button', { name: /short rest/i }));
    // Action Surge recharges short; Indomitable is once a day.
    expect(within(track(/Action Surge/)).getByText('1/1')).toBeInTheDocument();
    expect(within(track(/Indomitable/)).getByText('0/1')).toBeInTheDocument();
  });
});

describe('the death save circles', () => {
  /**
   * Every other track here shows what is left; these show what has happened.
   * Getting it backwards would print a sheet whose death saves are all already
   * ticked, which is the worst possible default.
   */
  it('start empty and fill as they are rolled', async () => {
    setup(fighter());
    const successes = track('Successes');
    expect(successes.querySelectorAll('.pip.is-full')).toHaveLength(0);

    await userEvent.click(screen.getByLabelText('Death save success 1'));
    expect(track('Successes').querySelectorAll('.pip.is-full')).toHaveLength(1);

    // Clicking a filled one clears the row again.
    await userEvent.click(screen.getByLabelText('Death save success 1'));
    expect(track('Successes').querySelectorAll('.pip.is-full')).toHaveLength(0);
  });
});

/**
 * A Cleric/Wizard has two save DCs printed at the top of the spell page, and
 * the pair is only useful if each spell says which one it is cast at.
 */
describe('which class a spell is cast as', () => {
  const clericWizard = (overrides: Partial<Build> = {}) =>
    buildOf({
      name: 'Two Books',
      classes: [
        { classId: 'cleric', level: 5, subclassId: 'life' },
        { classId: 'wizard', level: 5, subclassId: 'evocation' },
      ],
      // WIS 14 is DC 14; INT 20 is DC 17.
      baseScores: { str: 10, dex: 12, con: 14, int: 20, wis: 14, cha: 8 },
      spellIds: ['toll-the-dead', 'fireball'],
      ...overrides,
    });

  const lineFor = (name: string) =>
    screen.getByText(name, { selector: 'b' }).parentElement!.querySelector('.sub')!.textContent;

  it('says nothing for a spell only one of the classes could have taught', () => {
    setup(clericWizard());
    // Fireball is the Wizard's alone, so there is no question to answer.
    expect(lineFor('Fireball')).not.toContain('as a');
  });

  it('marks an unattributed spell as assumed', () => {
    setup(clericWizard());
    expect(lineFor('Toll the Dead')).toContain('as a Wizard DC 17 (assumed)');
  });

  it('prints the recorded class, and drops the hedge', () => {
    setup(clericWizard({ spellSources: { 'toll-the-dead': 'cleric' } }));
    expect(lineFor('Toll the Dead')).toContain('as a Cleric DC 14');
    expect(lineFor('Toll the Dead')).not.toContain('assumed');
  });

  it('leaves a single-class caster alone', () => {
    setup(wizard());
    expect(lineFor('Fireball')).not.toContain('as a');
  });
});

describe('rolling dice', () => {
  /**
   * The engine's own tests pin the arithmetic against a scripted RNG. These
   * pin the wiring: that the button rolls the *right* modifier, that the log
   * says so, and that a roll which also changes the sheet does both.
   */
  const entries = () =>
    [...document.querySelectorAll('.cs-rolllog li')].map((li) => ({
      total: li.querySelector('.cs-rolltotal')!.textContent,
      label: li.querySelector('.cs-rolllabel')!.textContent,
      working: li.querySelector('.cs-rollwork')!.textContent,
    }));

  it('offers the dice panel with nothing in it', () => {
    setup(fighter());
    expect(screen.getByText(/click any modifier on the sheet/i)).toBeInTheDocument();
  });

  it('rolls a skill by clicking its modifier, and logs the working', async () => {
    const user = userEvent.setup();
    // `play` is a getter on the harness, so it is read through `view` rather
    // than destructured - a destructured copy is the state at setup time.
    const view = setup(fighter());
    const athletics = screen.getByText('Athletics').closest('li') as HTMLElement;
    const modifier = within(athletics).getByRole('button');
    const bonus = Number(modifier.textContent);

    await user.click(modifier);

    const [entry] = entries();
    expect(entry.label).toBe('Athletics');
    // Whatever the die did, the total is that die plus this skill's modifier.
    expect(entry.working).toMatch(/^d20: \d+/);
    const die = Number(entry.working!.match(/^d20: (\d+)/)![1]);
    expect(Number(entry.total)).toBe(die + bonus);
    expect(view.play.rolls).toHaveLength(1);
  });

  it('rolls two dice under advantage and keeps the better', async () => {
    const user = userEvent.setup();
    setup(fighter());
    await user.click(screen.getByRole('button', { name: 'Advantage' }));
    const athletics = screen.getByText('Athletics').closest('li') as HTMLElement;
    await user.click(within(athletics).getByRole('button'));

    const [entry] = entries();
    const shown = entry.working!.match(/d20: (\d+) \((\d+)\)|d20: \((\d+)\) (\d+)/);
    expect(shown).not.toBeNull();
    // Two dice appear, and the one in brackets is the one that was dropped.
    const kept = Number(shown![1] ?? shown![4]);
    const dropped = Number(shown![2] ?? shown![3]);
    expect(kept).toBeGreaterThanOrEqual(dropped);
  });

  it('rolls a saving throw with the save bonus, not the bare ability', async () => {
    const user = userEvent.setup();
    setup(fighter());
    const saves = screen.getByText('Saving throws').closest('.cs-box') as HTMLElement;
    const row = within(saves).getByText('Strength').closest('li') as HTMLElement;
    const bonus = Number(within(row).getByRole('button').textContent);

    await user.click(within(row).getByRole('button'));
    const [entry] = entries();
    expect(entry.label).toBe('Strength save');
    expect(Number(entry.total) - Number(entry.working!.match(/^d20: (\d+)/)![1])).toBe(bonus);
  });

  it('rolls damage without a d20 anywhere in it', async () => {
    const user = userEvent.setup();
    setup(fighter());
    const attacks = screen.getByText('Attacks & spellcasting').closest('.cs-box') as HTMLElement;
    const damageCell = within(attacks).getByText('2d6+3');

    await user.click(damageCell);
    const [entry] = entries();
    expect(entry.label).toBe('Greatsword damage');
    expect(entry.working).toMatch(/^2d6: \d+ \d+ \+3 = \d+$/);
  });

  it('doubles the dice and not the bonus on a crit', async () => {
    const user = userEvent.setup();
    setup(fighter());
    const attacks = screen.getByText('Attacks & spellcasting').closest('.cs-box') as HTMLElement;

    await user.click(within(attacks).getByText('crit'));
    const [entry] = entries();
    expect(entry.label).toBe('Greatsword damage (critical)');
    expect(entry.working).toMatch(/^critical · 4d6: \d+ \d+ \d+ \d+ \+3 = \d+$/);
  });

  it('spends a hit die and heals by it in one press', async () => {
    const user = userEvent.setup();
    const view = setup(fighter());
    // Take enough damage that the healing has somewhere to go.
    const before = view.ctx.hp.total;
    await user.clear(currentHp());
    await user.type(currentHp(), '1');

    const dice = screen.getByText('Hit dice').closest('.cs-box') as HTMLElement;
    await user.click(within(dice).getByRole('button', { name: 'Roll' }));

    const [entry] = entries();
    expect(entry.label).toBe('Fighter hit die');
    expect(entry.working).toMatch(/^1d10: \d+ \+\d+ = \d+ healed$/);
    expect(view.play.hitDiceSpent.fighter).toBe(1);
    expect(view.play.currentHp).toBe(1 + Number(entry.total));
    expect(view.play.currentHp).toBeLessThanOrEqual(before);
  });

  it('only offers a death save when you are down', async () => {
    const user = userEvent.setup();
    const view = setup(fighter());
    const button = screen.getByRole('button', { name: /roll a death save/i });
    expect(button).toBeDisabled();

    await user.clear(currentHp());
    await user.type(currentHp(), '0');
    expect(screen.getByRole('button', { name: /roll a death save/i })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /roll a death save/i }));
    const [entry] = entries();
    expect(entry.label).toBe('Death save');
    // Whatever it rolled, the sheet moved in one of the three ways the rules
    // allow: a success, a failure, or back on your feet.
    const saves = view.play.deathSaves;
    const up = view.play.currentHp === 1;
    expect(up || saves.successes > 0 || saves.failures > 0).toBe(true);
    expect(entry.working).toMatch(/success|failure|1 hit point/);
  });

  it('keeps only the last twenty rolls, newest first', async () => {
    const user = userEvent.setup();
    const view = setup(fighter());
    const athletics = screen.getByText('Athletics').closest('li') as HTMLElement;
    for (let i = 0; i < 25; i++) await user.click(within(athletics).getByRole('button'));
    expect(view.play.rolls).toHaveLength(20);
    expect(entries()).toHaveLength(20);
  });

  it('clears the log without touching anything else', async () => {
    const user = userEvent.setup();
    const view = setup(fighter());
    const athletics = screen.getByText('Athletics').closest('li') as HTMLElement;
    await user.click(within(athletics).getByRole('button'));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(view.play.rolls).toEqual([]);
    expect(screen.getByText(/click any modifier on the sheet/i)).toBeInTheDocument();
  });

  it('keeps every roll control off the printed page', () => {
    setup(fighter());
    // The numbers themselves print, because they are the sheet. The controls
    // that are not on a paper sheet at all must carry `cs-screen`.
    for (const selector of ['.cs-rolls', '.cs-crit', '.cs-deathroll']) {
      const node = document.querySelector(selector) as HTMLElement;
      expect(node, selector).not.toBeNull();
      expect(node.closest('.cs-screen'), selector).not.toBeNull();
    }
    // And a rollable number must *not* be hidden from paper.
    const athletics = screen.getByText('Athletics').closest('li') as HTMLElement;
    expect(within(athletics).getByRole('button').closest('.cs-screen')).toBeNull();
  });
});

describe('the portrait', () => {
  /**
   * The one thing on this sheet that is content *and* a control in the same
   * place, so which half prints is worth pinning.
   */
  const portraitBox = () => document.querySelector('.cs-portrait') as HTMLElement;

  it('has a box even when nobody has filled it', () => {
    // A paper sheet has the box whether or not there is a face in it.
    setup(fighter());
    expect(portraitBox()).not.toBeNull();
    expect(within(portraitBox()).getByText('Portrait')).toBeInTheDocument();
    expect(portraitBox().querySelector('img')).toBeNull();
  });

  it('shows a stored portrait', () => {
    const build = fighter();
    setup({
      ...build,
      details: { ...build.details, portrait: 'data:image/jpeg;base64,AAAA' },
    });
    const img = portraitBox().querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('data:image/jpeg;base64,AAAA');
    // Decorative: the name is right beside it, so announcing "portrait of"
    // would only repeat what follows.
    expect(img.getAttribute('alt')).toBe('');
  });

  it('says what it costs, since the roster shares one storage budget', () => {
    const build = fighter();
    setup({
      ...build,
      details: { ...build.details, portrait: `data:image/jpeg;base64,${'A'.repeat(20_000)}` },
    });
    // 512 kB, not the 39 it was: the store underneath is IndexedDB now, so
    // the portrait no longer has to be rationed against five megabytes for
    // the whole origin.
    expect(within(portraitBox()).getByText(/of a 512 kB cap/)).toBeInTheDocument();
    expect(within(portraitBox()).getByText(/Not carried in share links/)).toBeInTheDocument();
  });

  it('prints the picture and not the buttons', () => {
    const build = fighter();
    setup({
      ...build,
      details: { ...build.details, portrait: 'data:image/jpeg;base64,AAAA' },
    });
    // The image is the sheet; the buttons are how you fill the box in.
    expect(portraitBox().querySelector('img')!.closest('.cs-screen')).toBeNull();
    expect(portraitBox().querySelector('.cs-portrait-actions')!.className).toContain('cs-screen');
  });

  it('removes one without touching anything else', async () => {
    const user = userEvent.setup();
    const build = fighter();
    const view = setup({
      ...build,
      details: { ...build.details, portrait: 'data:image/jpeg;base64,AAAA', bonds: 'My sword.' },
    });

    await user.click(within(portraitBox()).getByRole('button', { name: 'Remove' }));
    const next = view.onBuildChange.mock.calls.at(-1)![0] as typeof build;
    expect(next.details.portrait).toBeUndefined();
    expect(next.details.bonds).toBe('My sword.');
  });
});

/**
 * The action economy.
 *
 * Screen-only, and the one rule worth a component test is the one the model
 * exists to get right: "New turn" gives the reaction back, and there is no
 * control that gives it back any earlier.
 */
describe('this turn', () => {
  it('marks a slot spent and gives all four back on a new turn', async () => {
    const user = userEvent.setup();
    const view = setup(fighter());

    await user.click(screen.getByRole('button', { name: 'Action' }));
    await user.click(screen.getByRole('button', { name: 'Reaction' }));
    expect(view.play.turn).toMatchObject({ action: true, reaction: true });

    await user.click(screen.getByRole('button', { name: /new turn/i }));
    expect(view.play.turn).toMatchObject({ action: false, reaction: false });
  });

  it('counts movement against the speed the sheet prints', async () => {
    const user = userEvent.setup();
    const view = setup(fighter());
    const move = screen.getByText('Movement').closest('.cs-turn-move') as HTMLElement;

    expect(within(move).getByText(/of 30 ft/)).toBeTruthy();
    await user.click(within(move).getByRole('button', { name: /−5 ft/ }));
    expect(view.play.turn.moved).toBe(5);

    // Dash adds the speed again rather than doubling what is left.
    await user.click(within(move).getByRole('button', { name: /dash/i }));
    expect(within(move).getByText(/of 60 ft/)).toBeTruthy();
  });

  it('offers no way to end a turn, only to start one', () => {
    // Deliberate: an "end turn" control would hand back a reaction spent
    // between your turns a beat early, which is the misplay this tracks.
    setup(fighter());
    expect(screen.queryByRole('button', { name: /end turn/i })).toBeNull();
  });
});

describe('a counter you named yourself', () => {
  const withPiety = () =>
    buildOf({
      ...fighter(),
      customResources: [
        { id: 'piety', name: 'Piety', max: 50, startsAt: 'empty', recharge: 'none' },
      ],
    });

  it('sits beside the class resources and steps both ways', async () => {
    const user = userEvent.setup();
    const view = setup(withPiety());

    const field = screen.getByLabelText('Piety') as HTMLInputElement;
    expect(field.value).toBe('0');
    await user.click(screen.getByRole('button', { name: /one more piety/i }));
    expect(view.play.customValues.piety).toBe(1);
  });

  it('survives a long rest when it recharges never', async () => {
    const user = userEvent.setup();
    const view = setup(withPiety());

    await user.click(screen.getByRole('button', { name: /one more piety/i }));
    await user.click(screen.getByRole('button', { name: /long rest/i }));
    expect(view.play.customValues.piety).toBe(1);
  });
});

describe('potions and scrolls', () => {
  const withPotions = () =>
    buildOf({
      ...fighter(),
      items: [{ itemId: 'potion-of-healing', attuned: false, quantity: 2 }],
    });

  it('shows the count and offers a drink', () => {
    setup(withPotions());
    expect(screen.getByText('×2')).toBeTruthy();
    expect(screen.getByRole('button', { name: /drink it/i })).toBeTruthy();
  });

  it('spends one and heals for it', async () => {
    const user = userEvent.setup();
    const view = setup(withPotions(), { ...emptyPlay(), currentHp: 1 });

    await user.click(screen.getByRole('button', { name: /drink it/i }));

    // The item comes off the build; the healing lands in play and the log.
    const [next] = view.onBuildChange.mock.calls.at(-1) as [Build];
    expect(next.items[0].quantity).toBe(1);
    expect(view.play.currentHp).toBeGreaterThan(1);
    expect(view.play.rolls[0].label).toMatch(/potion of healing/i);
  });
});
