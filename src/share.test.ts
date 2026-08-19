import { describe, expect, it } from 'vitest';
import type { Build } from './types';
import { emptyBuild } from './engine/character';
import { decodeBuild, encodeBuild, seatFromLocation, shareUrl, tableFromLocation, tokenFromLocation } from './share';

function loaded(): Build {
  return {
    ...emptyBuild(),
    name: 'Thistle Underbough',
    raceId: 'elf-wood',
    classes: [
      { classId: 'ranger', level: 11, subclassId: 'gloom-stalker' },
      { classId: 'rogue', level: 3, subclassId: 'assassin' },
    ],
    baseScores: { str: 8, dex: 15, con: 14, int: 10, wis: 13, cha: 12 },
    featIds: ['sharpshooter', 'crossbow-expert'],
    skillIds: ['stealth', 'perception', 'survival'],
    expertiseIds: ['stealth', 'perception'],
    classOptionIds: ['archery'],
    spellIds: ['hunters-mark', 'pass-without-trace', 'spike-growth'],
  };
}

describe('share links', () => {
  it('round-trips a fully loaded build', () => {
    const original = loaded();
    const { build, error } = decodeBuild(encodeBuild(original));
    expect(error).toBeUndefined();
    expect(build?.name).toBe('Thistle Underbough');
    expect(build?.classes).toEqual(original.classes);
    expect(build?.featIds).toEqual(original.featIds);
    expect(build?.spellIds).toEqual(original.spellIds);
    expect(build?.expertiseIds).toEqual(original.expertiseIds);
    expect(build?.baseScores).toEqual(original.baseScores);
  });

  it('stays short enough to paste', () => {
    // A fragment has no practical length limit, but a link nobody will paste is
    // not a feature. Well under a kilobyte for a fully equipped 14th level.
    expect(encodeBuild(loaded()).length).toBeLessThan(1800);
  });

  it('survives a name with characters base64 would choke on', () => {
    const build = { ...emptyBuild(), name: 'Ünwyn "the Bold" — Sønn av Þór 🎲' };
    expect(decodeBuild(encodeBuild(build)).build?.name).toBe(build.name);
  });

  it('does not carry your own view settings onto someone else', () => {
    const build = {
      ...loaded(),
      combatAssumptions: { advantage: true, concentrating: false, targets: 5 },
    };
    const decoded = decodeBuild(encodeBuild(build)).build!;
    // Their copy gets the defaults, not your "show me this with advantage".
    expect(decoded.combatAssumptions).toEqual({
      advantage: false,
      concentrating: true,
      targets: 1,
    });
  });

  it('fills in defaults for a build shared before a field existed', () => {
    const token = encodeBuild(loaded());
    const decoded = decodeBuild(token).build!;
    expect(decoded.toolIds).toEqual([]);
    expect(decoded.defenses).toBeDefined();
    expect(decoded.weapons).toBeDefined();
  });

  describe('a link that does not work', () => {
    it('says so rather than throwing', () => {
      expect(decodeBuild('').error).toContain('no character');
      expect(decodeBuild('#').error).toContain('no character');
    });

    it('names an unknown format instead of guessing', () => {
      const result = decodeBuild('c9.abcdef');
      expect(result.build).toBeNull();
      expect(result.error).toContain('newer build');
    });

    it('catches a link cut short when copied', () => {
      const full = encodeBuild(loaded());
      const result = decodeBuild(full.slice(0, full.length - 30));
      expect(result.build).toBeNull();
      expect(result.error).toBeTruthy();
    });

    it('rejects something that decodes but is not a character', () => {
      const notABuild = 'c1.' + btoa('{"hello":"world"}').replace(/=+$/, '');
      expect(decodeBuild(notABuild).build).toBeNull();
    });
  });

  it('builds a full URL and reads the token back out of it', () => {
    const url = shareUrl(loaded(), 'https://example.test/forge');
    expect(url.startsWith('https://example.test/forge#c1.')).toBe(true);

    const hash = url.slice(url.indexOf('#'));
    expect(tokenFromLocation(hash)).toBe(hash.slice(1));
    expect(decodeBuild(tokenFromLocation(hash)!).build?.name).toBe('Thistle Underbough');
  });

  it('ignores a fragment that is not a share link', () => {
    expect(tokenFromLocation('#builder')).toBeNull();
    expect(tokenFromLocation('')).toBeNull();
  });
});

describe('recognising a link at all', () => {
  /**
   * Found by a component test: matching only the version this build understands
   * made a link from a newer one invisible - the app showed its ordinary
   * first-run screen and the person holding the link got no explanation.
   */
  it('recognises a share link from a version it cannot read', () => {
    expect(tokenFromLocation('#c9.abcdef')).toBe('c9.abcdef');
    expect(decodeBuild('c9.abcdef').error).toContain('newer build');
  });

  it('still ignores a fragment that was never a share link', () => {
    expect(tokenFromLocation('#builder')).toBeNull();
    expect(tokenFromLocation('#')).toBeNull();
    expect(tokenFromLocation('#section-2')).toBeNull();
  });
});

describe('what a link deliberately leaves behind', () => {
  /**
   * A share link is a URL fragment. Everything in it is paid for by the person
   * pasting it, so two things are stripped: one because it is yours rather
   * than the character's, and one because it would not fit.
   */
  const withPortrait = (): Build => {
    const build = loaded();
    return {
      ...build,
      details: { ...build.details, portrait: `data:image/jpeg;base64,${'A'.repeat(40_000)}` },
    };
  };

  it('drops the portrait', () => {
    const decoded = decodeBuild(encodeBuild(withPortrait())).build!;
    expect(decoded.details.portrait).toBeUndefined();
  });

  it('keeps the link short enough to paste', () => {
    // The portrait alone is 40 kB; without stripping, the link would be
    // roughly forty times a full character and past what several chat clients
    // will send in one piece.
    const link = encodeBuild(withPortrait());
    expect(link.length).toBeLessThan(4000);
  });

  it('keeps every other detail', () => {
    const build = withPortrait();
    const decoded = decodeBuild(encodeBuild(build)).build!;
    expect(decoded.details.playerName).toBe(build.details.playerName);
    expect(decoded.details.bonds).toBe(build.details.bonds);
  });

  it('leaves a character without one alone', () => {
    const decoded = decodeBuild(encodeBuild(loaded())).build!;
    expect('portrait' in decoded.details).toBe(false);
  });
});

describe('the seat fragment (§93)', () => {
  it('reads a seat, a bare picker, and nothing else', () => {
    expect(seatFromLocation('#seat=r3')).toBe('r3');
    expect(seatFromLocation('#seat')).toBe('');
    expect(seatFromLocation('#c1.whatever')).toBeNull();
    expect(seatFromLocation('#builder')).toBeNull();
    expect(seatFromLocation('')).toBeNull();
    // Encoded ids survive the address bar.
    expect(seatFromLocation('#seat=a%20b')).toBe('a b');
  });
});

describe('the table fragment (§95)', () => {
  it('reads the whole invitation, and the seat half still stands alone', () => {
    const hash = '#seat=c0&table=X7Q2M4&relay=ws%3A%2F%2Flocalhost%3A4390';
    expect(seatFromLocation(hash)).toBe('c0');
    expect(tableFromLocation(hash)).toEqual({ url: 'ws://localhost:4390', room: 'X7Q2M4' });
  });

  it('takes both halves or nothing - a room with no relay has no door', () => {
    expect(tableFromLocation('#seat=c0&table=X7Q2M4')).toBeNull();
    expect(tableFromLocation('#seat=c0&relay=ws%3A%2F%2Fx')).toBeNull();
    expect(tableFromLocation('#builder')).toBeNull();
  });
});
