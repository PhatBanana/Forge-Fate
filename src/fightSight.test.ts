import { describe, expect, it } from 'vitest';
import fixture from './data/srd/srd-2014-monsters.json';
import type { Monster } from './data/monsters';
import { addCharacter, addMonster, emptyEncounter, placeCombatant } from './encounter';
import { activeEncounter, updateEncounter, updatePlay } from './storage';
import { deriveBuild } from './engine/character';
import { generateDungeon } from './engine/dungeon';
import {
  ambientOf,
  eyesOf,
  gloomMap,
  lightsInPlay,
  litLookup,
  partyVisible,
  silencedAt,
} from './fightSight';
import type { FightView } from './fightFacts';
import { fighter, rosterOf, wizard } from './test/factories';

/**
 * §111. Light is a fact about a square, sight is a fact about a pair of
 * eyes, and since §40 every square is asked both. Asked here directly -
 * no battle screen, no DOM.
 */

const monsters = (fixture as unknown as { records: Monster[] }).records;
const byId = new Map(monsters.map((m) => [m.id, m]));
const dungeon = generateDungeon('x', { rooms: 0, width: 8, height: 6 });

const table = (fog = false) => {
  const roster = rosterOf(fighter(), wizard());
  let enc = addCharacter(emptyEncounter(), 'c0', { initiative: 20 });
  enc = addCharacter(enc, 'c1', { initiative: 10 });
  enc = addMonster(enc, byId.get('goblin')!, { rng: () => 0.5 });
  // Stood on the board: eyes need a position to be worth anything.
  const [a, b] = enc.combatants.filter((c) => c.kind === 'character');
  enc = placeCombatant(enc, a.id, { x: 1, y: 1 });
  enc = placeCombatant(enc, b.id, { x: 2, y: 1 });
  if (fog) enc = { ...enc, fog: true };
  return updateEncounter(roster, enc);
};

const viewOf = (roster: ReturnType<typeof table>): FightView => ({
  encounter: activeEncounter(roster),
  roster,
  monsterById: (id) => byId.get(id),
  buildOf: (rosterId) => {
    const entry = roster.entries.find((e) => e.id === rosterId);
    return entry ? deriveBuild(entry.build) : undefined;
  },
  ruleset: '2014',
});

describe('how dark it is', () => {
  it('is bright unless the fight says otherwise', () => {
    const enc = activeEncounter(table());
    expect(ambientOf(enc)).toBe('bright');
    expect(ambientOf({ ...enc, ambientLight: 'dark' })).toBe('dark');
  });

  it('hands the cameras nothing at all when the map is lit', () => {
    const enc = activeEncounter(table());
    const litAt = litLookup(lightsInPlay(enc.lights ?? [], enc.combatants), 'bright');
    expect(gloomMap(litAt, 'bright', 0, dungeon.width, dungeon.height)).toEqual({});
  });

  it('names every square that is not bright when the lights go out', () => {
    const enc = { ...activeEncounter(table()), ambientLight: 'dark' as const };
    const litAt = litLookup(lightsInPlay(enc.lights ?? [], enc.combatants), 'dark');
    const gloom = gloomMap(litAt, 'dark', 0, dungeon.width, dungeon.height);
    expect(Object.keys(gloom)).toHaveLength(dungeon.width * dungeon.height);
    expect(new Set(Object.values(gloom))).toEqual(new Set(['dark']));
  });

  it('stands a carried light where its bearer is standing', () => {
    const roster = table();
    const enc = activeEncounter(roster);
    const bearer = enc.combatants.find((c) => c.kind === 'character')!;
    const withTorch = {
      ...enc,
      lights: [{ id: 'l1', label: 'Torch', carriedBy: bearer.id, bright: 20, dim: 20 }],
    } as typeof enc;
    const placed = lightsInPlay(withTorch.lights ?? [], withTorch.combatants);
    expect(placed[0]?.at).toEqual(bearer.at);
  });
});

describe('what the party can see', () => {
  it('shows everything when the fog is off', () => {
    const view = viewOf(table(false));
    const litAt = litLookup(lightsInPlay(view.encounter.lights ?? [], view.encounter.combatants), 'bright');
    expect(partyVisible(view, { dungeon, terrain: {}, elevation: {} }, dungeon, litAt)).toBeNull();
  });

  it('looks from the eyes of whoever is still standing', () => {
    const view = viewOf(table(true));
    const litAt = litLookup(lightsInPlay(view.encounter.lights ?? [], view.encounter.combatants), 'bright');
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
    const litAt = litLookup(lightsInPlay(view.encounter.lights ?? [], view.encounter.combatants), 'bright');
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
