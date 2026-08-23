import { describe, expect, it } from 'vitest';
import { addCharacter, addMonster, emptyEncounter, placeCombatant } from './encounter';
import { activeEncounter, updateEncounter, updatePlay } from './storage';
import { generateDungeon } from './engine/dungeon';
import {
  lightingOf,
  eyesOf,
  partyVisible,
  silencedAt,
} from './fightSight';
import { fixtureMonster, viewOf } from './test/fight';
import { fighter, rosterOf, wizard } from './test/factories';

/**
 * §111. Light is a fact about a square, sight is a fact about a pair of
 * eyes, and since §40 every square is asked both. Asked here directly -
 * no battle screen, no DOM.
 */

const dungeon = generateDungeon('x', { rooms: 0, width: 8, height: 6 });

const table = (fog = false) => {
  const roster = rosterOf(fighter(), wizard());
  let enc = addCharacter(emptyEncounter(), 'c0', { initiative: 20 });
  enc = addCharacter(enc, 'c1', { initiative: 10 });
  enc = addMonster(enc, fixtureMonster('goblin'), { rng: () => 0.5 });
  // Stood on the board: eyes need a position to be worth anything.
  const [a, b] = enc.combatants.filter((c) => c.kind === 'character');
  enc = placeCombatant(enc, a.id, { x: 1, y: 1 });
  enc = placeCombatant(enc, b.id, { x: 2, y: 1 });
  if (fog) enc = { ...enc, fog: true };
  return updateEncounter(roster, enc);
};


describe('how dark it is', () => {
  it('is bright unless the fight says otherwise', () => {
    const enc = activeEncounter(table());
    expect(lightingOf(enc, dungeon).ambient).toBe('bright');
    expect(lightingOf({ ...enc, ambientLight: 'dark' }, dungeon).ambient).toBe('dark');
  });

  it('hands the cameras nothing at all when the map is lit', () => {
    expect(lightingOf(activeEncounter(table()), dungeon).gloom).toEqual({});
  });

  it('names every square that is not bright when the lights go out', () => {
    const enc = { ...activeEncounter(table()), ambientLight: 'dark' as const };
    const { gloom } = lightingOf(enc, dungeon);
    expect(Object.keys(gloom)).toHaveLength(dungeon.width * dungeon.height);
    expect(new Set(Object.values(gloom))).toEqual(new Set(['dark']));
  });

  it('asks a square once and remembers - the cache is the point of the value', () => {
    const enc = { ...activeEncounter(table()), ambientLight: 'dim' as const };
    const { litAt } = lightingOf(enc, dungeon);
    // Same lookup twice is the same answer; a fresh value answers the same.
    expect(litAt({ x: 2, y: 2 })).toBe('dim');
    expect(litAt({ x: 2, y: 2 })).toBe('dim');
    expect(lightingOf(enc, dungeon).litAt({ x: 2, y: 2 })).toBe('dim');
  });

  it('stands a carried light where its bearer is standing', () => {
    const roster = table();
    const enc = activeEncounter(roster);
    const bearer = enc.combatants.find((c) => c.kind === 'character')!;
    const withTorch = {
      ...enc,
      lights: [{ id: 'l1', label: 'Torch', carriedBy: bearer.id, bright: 20, dim: 20 }],
    } as typeof enc;
    const { lights, gloom } = lightingOf(withTorch, dungeon);
    expect(lights[0]?.at).toEqual(bearer.at);
    // The torch is standing on the bearer, so their own square is not dark.
    expect(gloom[`${bearer.at!.x},${bearer.at!.y}`]).toBeUndefined();
  });
});

describe('what the party can see', () => {
  it('shows everything when the fog is off', () => {
    const view = viewOf(table(false));
    const { litAt } = lightingOf(view.encounter, dungeon);
    expect(partyVisible(view, { dungeon, terrain: {}, elevation: {} }, dungeon, litAt)).toBeNull();
  });

  it('looks from the eyes of whoever is still standing', () => {
    const view = viewOf(table(true));
    const { litAt } = lightingOf(view.encounter, dungeon);
    const seen = partyVisible(view, { dungeon, terrain: {}, elevation: {} }, dungeon, litAt);
    expect(seen).not.toBeNull();
    expect(seen!.size).toBeGreaterThan(0);
  });

  it('shuts the eyes of a character at nought - a wipe is dark, not omniscient', () => {
    let roster = table(true);
    // Both characters down.
    for (const id of ['c0', 'c1']) {
      const entry = roster.entries.find((e) => e.id === id)!;
      roster = updatePlay(roster, id, { ...entry.play, currentHp: 0 });
    }
    const view = viewOf(roster);
    const { litAt } = lightingOf(view.encounter, dungeon);
    const seen = partyVisible(view, { dungeon, terrain: {}, elevation: {} }, dungeon, litAt);
    expect(seen!.size).toBe(0);
  });

  it('gives eyes a position, and none at all to a token off the board', () => {
    const view = viewOf(table());
    const standing = view.encounter.combatants.find((c) => c.at)!;
    expect(eyesOf(view, standing)?.at).toEqual(standing.at);
    expect(eyesOf(view, { ...standing, at: undefined })).toBeNull();
  });
});

describe('silence', () => {
  it('is a fact about a square, because Silence is a zone', () => {
    const enc = activeEncounter(table());
    expect(silencedAt(enc, { x: 1, y: 1 })).toBe(false);
    const hushed = {
      ...enc,
      zones: [
        {
          id: 'z1',
          label: 'Silence',
          shape: 'sphere',
          at: { x: 1, y: 1 },
          feet: 20,
          tint: 0,
          effect: { silences: true },
        },
      ],
    } as unknown as typeof enc;
    expect(silencedAt(hushed, { x: 1, y: 1 })).toBe(true);
  });
});
