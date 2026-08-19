import type { Build } from './types';
import type { RelayConfig } from './sync';
import { hydrateBuild } from './storage';

/**
 * Sharing a character as a link.
 *
 * The whole build goes in the URL's **fragment**, not its query string. That is
 * the difference between a feature this app can have and one it cannot: a
 * fragment is never sent to a server, so a static page with no backend can read
 * it, and nobody's character ends up in an access log. It also sidesteps query
 * length limits, though it turns out not to need to - a fully equipped level 14
 * multiclass build is about 1.1 kB of JSON and well under a kilobyte packed.
 *
 * The format is `#c1.<base64url>`, and the version tag is the point: if the
 * encoding ever changes, an old link is recognised and refused with an
 * explanation rather than decoded into nonsense.
 */

const PREFIX = 'c1.';

/** base64url, which unlike plain base64 survives being pasted into a URL. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Only the fields that describe the character, and only the ones that fit.
 *
 * `combatAssumptions` is a view setting - whether *you* want to see the damage
 * numbers with advantage on - so it is not carried into someone else's copy.
 *
 * The portrait comes out for a different reason: size. A share link is a URL
 * fragment, about 1.2 kB for a full character, and a 40 kB portrait would
 * make it forty times longer - past what several chat clients will send in one
 * piece and well past what anyone will paste. So a shared character arrives
 * without a face, and the recipient can give it one.
 */
function shareable(build: Build): Build {
  const { combatAssumptions: _assumptions, details, ...rest } = build;
  const { portrait: _portrait, ...detailsWithoutPortrait } = details;
  return { ...rest, details: detailsWithoutPortrait } as Build;
}

export function encodeBuild(build: Build): string {
  const json = JSON.stringify(shareable(build));
  return PREFIX + toBase64Url(new TextEncoder().encode(json));
}

export interface DecodeResult {
  build: Build | null;
  /** Why it failed, phrased for someone who was just handed a broken link. */
  error?: string;
}

export function decodeBuild(token: string): DecodeResult {
  const trimmed = token.trim().replace(/^#/, '');
  if (!trimmed) return { build: null, error: 'That link carries no character.' };
  if (!trimmed.startsWith(PREFIX)) {
    return {
      build: null,
      error:
        'That link is not in a format this version understands. It may have been made by a newer build of the app.',
    };
  }

  try {
    const json = new TextDecoder().decode(fromBase64Url(trimmed.slice(PREFIX.length)));
    const build = hydrateBuild(JSON.parse(json));
    if (!build) return { build: null, error: 'That link decoded, but not into a character.' };
    return { build };
  } catch {
    return { build: null, error: 'That link is damaged - it may have been cut short when copied.' };
  }
}

/** The full URL to hand someone, based on wherever the app is being served. */
export function shareUrl(build: Build, base?: string): string {
  const origin =
    base ?? (typeof location === 'undefined' ? '' : location.origin + location.pathname);
  return `${origin}#${encodeBuild(build)}`;
}

/**
 * Anything in the address bar that is *meant* to be a share link, whatever
 * version made it.
 *
 * Deliberately looser than `PREFIX`: matching only the version this build
 * understands would make a link from a newer one invisible, and the person
 * holding it would get no explanation at all - just the app's ordinary first-run
 * screen. Recognising the shape and letting `decodeBuild` reject the version is
 * what turns that into a message. A fragment like `#builder` is not a share
 * attempt and stays ignored.
 */
const TOKEN_SHAPE = /^c\d+\./;

export function tokenFromLocation(hash?: string): string | null {
  const raw = (hash ?? (typeof location === 'undefined' ? '' : location.hash)).replace(/^#/, '');
  return TOKEN_SHAPE.test(raw) ? raw : null;
}

/**
 * §93: a seat in the address bar. `#seat=r3` opens the player screen holding
 * that roster character; a bare `#seat` opens it on the picker. Returns the
 * roster id, `''` for the bare form, and `null` when the fragment is
 * something else - a share token, an anchor, nothing. The same fragment
 * discipline as the share link: read synchronously at boot, stripped after.
 *
 * §95 grew the fragment into a whole invitation -
 * `#seat=r3&table=X7Q2M4&relay=wss://…` - so one link (or the QR that will
 * someday wrap it) hands a phone its chair *and* the room it meets the
 * table in. Parsed as query parameters, which is what the shape now is.
 */
const params = (hash?: string): URLSearchParams => {
  const raw = (hash ?? (typeof location === 'undefined' ? '' : location.hash)).replace(/^#/, '');
  return new URLSearchParams(raw);
};

export function seatFromLocation(hash?: string): string | null {
  const parsed = params(hash);
  return parsed.has('seat') ? (parsed.get('seat') ?? '') : null;
}

/** §95: the relay half of the invitation. Both halves or nothing - a room
    with no relay has no door, a relay with no room has no table. */
export function tableFromLocation(hash?: string): RelayConfig | null {
  const parsed = params(hash);
  const room = parsed.get('table');
  const url = parsed.get('relay');
  return room && url ? { url, room } : null;
}

/** §95: the invitation, whole - what the DM's screen offers to copy. */
export function seatUrl(rosterId: string, relay: RelayConfig): string {
  const base =
    typeof location === 'undefined' ? '' : `${location.origin}${location.pathname}`;
  const query = new URLSearchParams({
    seat: rosterId,
    table: relay.room,
    relay: relay.url,
  });
  return `${base}#${query.toString()}`;
}
