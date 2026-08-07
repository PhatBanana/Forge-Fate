// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CompareView } from './CompareView';
import { deriveBuild } from '../engine/character';
import { buildOf, fighter, wizard } from '../test/factories';

/**
 * The comparison.
 *
 * The load-bearing property is that both damage figures are read at the *same*
 * target AC. Each build carries its own level-appropriate AC, so reading each
 * at its own would compare a level 5 against a level 17 at different tables and
 * call the result a difference.
 */

const row = (label: string | RegExp) =>
  screen.getByText(label).closest('tr') as HTMLElement;

const cells = (label: string | RegExp) =>
  [...row(label).querySelectorAll('td')].map((td) => td.textContent);

function renderPair(left = fighter(), right = wizard()) {
  return render(<CompareView left={deriveBuild(left)} right={deriveBuild(right)} />);
}

describe('the headline table', () => {
  it('names both characters as the columns', () => {
    const { container } = renderPair();
    // Each name also appears in the chart key, so scope to the table head.
    const headers = [...container.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers).toEqual(['', 'Basher', 'Ünwyn']);
  });

  it('marks the stronger side, and only on the row where it leads', () => {
    renderPair(fighter(5), wizard(9));
    // The Wizard is nine levels to the Fighter's five.
    const levelCells = [...row('Character level').querySelectorAll('td')];
    expect(levelCells[0].className).not.toContain('wins');
    expect(levelCells[1].className).toContain('wins');
  });

  it('marks nothing on a row where the two are equal', () => {
    renderPair(fighter(5), fighter(5));
    expect([...row('Character level').querySelectorAll('td.wins')]).toHaveLength(0);
  });

  /** Fewer problems is better, which is the one row where lower wins. */
  it('treats fewer flagged problems as the better score', () => {
    const clean = fighter(5);
    const broken = buildOf({
      name: 'Reckless',
      classes: [{ classId: 'wizard', level: 5 }],
      defenses: { ...buildOf().defenses, armorId: 'plate' },
    });

    render(<CompareView left={deriveBuild(clean)} right={deriveBuild(broken)} />);
    const problemCells = [...row('Problems flagged').querySelectorAll('td')];
    expect(problemCells[0].className).toContain('wins');
    expect(problemCells[1].className).not.toContain('wins');
  });

  it('reads both damage figures at one shared AC', () => {
    renderPair(fighter(5), wizard(17));
    // A level 5 faces AC 15 and a level 17 faces AC 18; the row must name one.
    const label = screen.getByText(/sustained damage at AC \d+/i).textContent!;
    const ac = Number(label.match(/AC (\d+)/)![1]);
    expect(ac).toBe(18);
    // And there is exactly one such row, not one per character.
    expect(screen.getAllByText(/sustained damage at AC/i)).toHaveLength(1);
  });

  it('lists an ability score the two do not share', () => {
    renderPair(fighter(), wizard());
    expect(screen.getByText('Strength')).toBeInTheDocument();
  });

  it('lists no ability rows at all when the two are identical', () => {
    render(<CompareView left={deriveBuild(fighter())} right={deriveBuild(fighter())} />);
    for (const ability of ['Strength', 'Charisma', 'Intelligence']) {
      expect(screen.queryByText(ability)).not.toBeInTheDocument();
    }
  });
});

describe('what they chose differently', () => {
  it('lists a feat one has and the other does not', () => {
    const left = { ...fighter(), featIds: ['great-weapon-master'] };
    const right = { ...fighter(), name: 'Other', featIds: ['sharpshooter'] };
    render(<CompareView left={deriveBuild(left)} right={deriveBuild(right)} />);

    expect(cells('Feats')).toEqual(['Great Weapon Master', 'Sharpshooter']);
  });

  it('leaves out what both of them share', () => {
    const left = { ...fighter(), featIds: ['tough', 'great-weapon-master'] };
    const right = { ...fighter(), name: 'Other', featIds: ['tough'] };
    render(<CompareView left={deriveBuild(left)} right={deriveBuild(right)} />);

    // Tough is on both, so it is not a difference.
    const [onlyLeft, onlyRight] = cells('Feats');
    expect(onlyLeft).toBe('Great Weapon Master');
    expect(onlyRight).not.toContain('Tough');
  });

  it('says so plainly when the two made the same choices', () => {
    render(<CompareView left={deriveBuild(fighter())} right={deriveBuild(fighter())} />);
    expect(screen.getByText(/made all the same choices/i)).toBeInTheDocument();
  });

  it('lists spells one knows and the other does not', () => {
    const left = wizard();
    const right = { ...wizard(), name: 'Other', spellIds: ['fire-bolt'] };
    render(<CompareView left={deriveBuild(left)} right={deriveBuild(right)} />);

    const [onlyLeft] = cells('Spells');
    expect(onlyLeft).toContain('Fireball');
    expect(onlyLeft).not.toContain('Fire Bolt');
  });
});

describe('the damage curves', () => {
  it('draws one line per character with a key naming both', () => {
    const { container } = renderPair();
    expect(container.querySelectorAll('svg.curve-chart path.curve')).toHaveLength(2);
    expect(container.querySelector('.curve-key')!.textContent).toContain('Basher');
    expect(container.querySelector('.curve-key')!.textContent).toContain('Ünwyn');
  });

  it('describes itself for anyone who cannot see the chart', () => {
    const { container } = renderPair();
    const label = container.querySelector('svg.curve-chart')!.getAttribute('aria-label')!;
    expect(label).toMatch(/sustained damage from AC 10 to 25/i);
    expect(label).toContain('Basher');
  });
});
