import { describe, expect, it } from 'vitest';
import { resourcesOf, restoredOn, sheetOf } from './sheet';
import { deriveBuild } from './engine/character';
import { damage, emptyPlay, setTempHp, spendHitDie, spendPact, spendResource, spendSlot } from './play';
import { fighter, warlockSorcerer, wizard } from './test/factories';

/*
  §120. The join of the two stores, tested without rendering anything - which
  is the point of the module. Before it existed, "does the sheet count a
  Warlock's pact slot the same way the battle screen does" could only be
  asked by mounting both screens.
*/

describe('sheetOf', () => {
  it('reads hit points against the derived maximum', () => {
    const ctx = deriveBuild(fighter());
    const fresh = sheetOf(ctx, emptyPlay());
    expect(fresh.hp.now).toBe(ctx.hp.total);
    expect(fresh.hp.max).toBe(ctx.hp.total);
    expect(fresh.hp.fresh).toBe(true);
    expect(fresh.hp.down).toBe(false);

    const hurt = sheetOf(ctx, damage(emptyPlay(), 5, ctx.hp.total));
    expect(hurt.hp.now).toBe(ctx.hp.total - 5);
    expect(hurt.hp.fresh).toBe(false);
  });

  it('carries temporary hit points beside the maximum, not inside it', () => {
    const ctx = deriveBuild(fighter());
    const sheet = sheetOf(ctx, setTempHp(emptyPlay(), 7));
    expect(sheet.hp.temp).toBe(7);
    expect(sheet.hp.max).toBe(ctx.hp.total);
  });

  it('is down at zero', () => {
    const ctx = deriveBuild(fighter());
    const sheet = sheetOf(ctx, damage(emptyPlay(), ctx.hp.total + 3, ctx.hp.total));
    expect(sheet.hp.now).toBe(0);
    expect(sheet.hp.down).toBe(true);
  });

  it('gives a caster one entry per level the table reaches', () => {
    const ctx = deriveBuild(wizard());
    const sheet = sheetOf(ctx, emptyPlay());
    expect(sheet.slots).toHaveLength(9);
    expect(sheet.slots[0]).toMatchObject({ level: 1, fromTable: ctx.spellcasting.bySpellLevel[0] });
    expect(sheet.slots[0].left).toBe(sheet.slots[0].fromTable);
  });

  it('gives a martial nine zeros rather than an empty list', () => {
    // The row still exists so `slots[level - 1]` is always safe to index; what
    // says "not a caster" is the count, not a missing entry.
    const slots = sheetOf(deriveBuild(fighter()), emptyPlay()).slots;
    expect(slots).toHaveLength(9);
    expect(slots.every((s) => s.fromTable === 0 && s.left === 0)).toBe(true);
  });

  it('takes a spent slot off the level it was spent at', () => {
    const ctx = deriveBuild(wizard());
    const table = ctx.spellcasting.bySpellLevel;
    const play = spendSlot(emptyPlay(), 1, table[0]);
    const sheet = sheetOf(ctx, play);
    expect(sheet.slots[0].left).toBe(table[0] - 1);
    expect(sheet.slots[1].left).toBe(table[1]);
  });

  it('keeps pact slots apart from the ordinary ones', () => {
    const ctx = deriveBuild(warlockSorcerer());
    const fresh = sheetOf(ctx, emptyPlay());
    expect(fresh.pact).not.toBeNull();
    expect(fresh.pact?.left).toBe(fresh.pact?.total);

    const spent = sheetOf(ctx, spendPact(emptyPlay(), ctx.spellcasting.pact?.count ?? 0));
    expect(spent.pact?.left).toBe((fresh.pact?.total ?? 0) - 1);
    // The sorcerer half's ordinary slots are untouched by a pact spend.
    expect(spent.slots[0].left).toBe(fresh.slots[0].left);
  });

  it('has no pact block for a character without Pact Magic', () => {
    expect(sheetOf(deriveBuild(wizard()), emptyPlay()).pact).toBeNull();
  });

  it('counts hit dice per class, not per character', () => {
    const ctx = deriveBuild(warlockSorcerer());
    const sheet = sheetOf(ctx, emptyPlay());
    expect(sheet.hitDice).toHaveLength(2);
    expect(sheet.hitDice.map((d) => d.total)).toEqual(ctx.slices.map((s) => s.entry.level));

    const spent = sheetOf(ctx, spendHitDie(emptyPlay(), sheet.hitDice[0].classId, sheet.hitDice[0].total));
    expect(spent.hitDice[0].left).toBe(sheet.hitDice[0].total - 1);
    expect(spent.hitDice[1].left).toBe(sheet.hitDice[1].total);
  });

  it('reads a held resource against the cap the class table gives it', () => {
    const ctx = deriveBuild(fighter());
    const sheet = sheetOf(ctx, emptyPlay());
    const wind = sheet.resources.find((r) => r.held.resource.id === 'second-wind');
    expect(wind).toBeDefined();
    expect(wind?.left).toBe(wind?.held.max);

    const after = sheetOf(ctx, spendResource(emptyPlay(), wind!.held.key, wind!.held.max));
    expect(after.resources.find((r) => r.held.key === wind!.held.key)?.left).toBe(wind!.held.max - 1);
  });
});

describe('resourcesOf', () => {
  it('asks the context rather than three of its fields', () => {
    const ctx = deriveBuild(warlockSorcerer());
    expect(resourcesOf(ctx).map((h) => h.key)).toEqual(
      sheetOf(ctx, emptyPlay()).resources.map((r) => r.held.key),
    );
  });
});

describe('restoredOn', () => {
  it("brings back a Warlock's pact-adjacent resources on a short rest", () => {
    const ctx = deriveBuild(warlockSorcerer());
    const short = restoredOn(ctx, 'short');
    const encounter = restoredOn(ctx, 'encounter');
    // Everything an encounter restores, a short rest restores too.
    for (const key of encounter) expect(short).toContain(key);
  });

  it('restores nothing on an encounter for a character with only long-rest resources', () => {
    const ctx = deriveBuild(wizard());
    expect(restoredOn(ctx, 'encounter')).toEqual([]);
  });
});
