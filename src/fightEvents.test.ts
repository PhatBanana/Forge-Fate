import { describe, expect, it } from 'vitest';
import { nothingHappened } from './fightEvents';
import type { FightEvent, Resolution } from './fightEvents';
import { rosterOf, fighter } from './test/factories';

/*
  §130. There is not much here to test, and that is worth saying plainly
  rather than padding.

  `FightEvent` is a union, and the compiler checks it at every emit site -
  a test that constructs one and asserts its `kind` is testing TypeScript.
  What *is* a decision, and what this pins, is `nothingHappened`: the
  mis-click answer is a `Resolution` with the roster untouched and an empty
  list, deliberately, so no caller has to special-case null. That is a
  choice somebody could undo by making it return null "to save an object",
  and the twelve call sites that stopped checking would all break at once.
*/

describe('nothingHappened', () => {
  const roster = rosterOf(fighter());

  it('hands back the very same roster, not a copy', () => {
    // Identity, not equality: a copy would defeat the reference checks the
    // callers use to decide whether a write is worth composing.
    expect(nothingHappened(roster).roster).toBe(roster);
  });

  it('says nothing, so the screen has nothing to play', () => {
    expect(nothingHappened(roster).events).toEqual([]);
  });

  it('is a Resolution, so a caller never has to test for null', () => {
    const out: Resolution = nothingHappened(roster);
    expect(out.roster).toBeDefined();
    expect(Array.isArray(out.events)).toBe(true);
  });
});

describe('the event union', () => {
  it('carries every channel the screen knows how to play', () => {
    /*
      Not a behaviour test - an inventory. The union is meant to grow one
      member at a time, as each rule that moves needs one, and this list is
      what a reviewer diffs against when a new `kind` appears: an event
      nobody raises is an event nobody has to play.
    */
    const one: FightEvent[] = [
      { kind: 'walk', id: 'a', route: [{ x: 0, y: 0 }] },
      { kind: 'walk', id: 'a', route: [{ x: 0, y: 0 }], slide: true },
      { kind: 'lunge', id: 'a', toward: { x: 1, y: 1 } },
      { kind: 'float', id: 'a', text: '-7' },
      { kind: 'float', id: 'a', text: '+5', heal: true },
      { kind: 'flash', id: 'a' },
      { kind: 'banner', text: 'The ward falls' },
      { kind: 'say', text: 'Nothing in reach' },
    ];
    expect(new Set(one.map((e) => e.kind))).toEqual(
      new Set(['walk', 'lunge', 'float', 'flash', 'banner', 'say']),
    );
  });
});
