// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PORTRAIT_MAX_BYTES,
  PORTRAIT_SIZE,
  dataUrlBytes,
  preparePortrait,
} from './portrait';

/**
 * The encoder, with the canvas standing in.
 *
 * jsdom has no 2D context and no JPEG encoder, so the drawing itself cannot be
 * exercised here - and it does not need to be, because the part with decisions
 * in it is the part around the drawing: what size the canvas is made, what
 * rectangle of the source is taken, which qualities are tried, and when a
 * picture is refused rather than stored. Those are what these pin.
 *
 * The stub records what it was asked to do and returns a data URL of whatever
 * length the test wants, which is the only property of the encoder's output
 * that any of this logic reads.
 */

interface DrawCall {
  sx: number;
  sy: number;
  side: number;
  dw: number;
}

let drawn: DrawCall[];
let sized: { width: number; height: number }[];
/** Quality -> data URL length, so a test can say "0.85 overshoots". */
let encode: (quality: number) => number;
let qualitiesTried: number[];

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  #src = '';
  set src(value: string) {
    this.#src = value;
    // `${width}x${height}`, carried through the object URL the stub minted.
    const [w, h] = value.split(':').slice(1).map(Number);
    this.naturalWidth = w;
    this.naturalHeight = h;
    queueMicrotask(() => (w && h ? this.onload?.() : this.onerror?.()));
  }
  get src() {
    return this.#src;
  }
}

const imageFile = (width: number, height: number, type = 'image/jpeg') =>
  ({ type, __size: `${width}:${height}` }) as unknown as File;

beforeEach(() => {
  drawn = [];
  sized = [];
  qualitiesTried = [];
  encode = () => 1_000;

  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: (file: File & { __size?: string }) => `blob:${file.__size ?? '0:0'}`,
    revokeObjectURL: () => {},
  });

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    sized.push({ width: this.width, height: this.height });
    return {
      imageSmoothingQuality: 'low',
      drawImage: (
        _source: unknown,
        sx: number,
        sy: number,
        side: number,
        _sh: number,
        _dx: number,
        _dy: number,
        dw: number,
      ) => drawn.push({ sx, sy, side, dw }),
    } as unknown as CanvasRenderingContext2D;
  });

  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(
    (_type?: string, quality?: unknown) => {
      const q = quality as number;
      qualitiesTried.push(q);
      return 'x'.repeat(encode(q));
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the size a portrait is kept at', () => {
  it('draws onto a 512 square canvas', async () => {
    // The number the storage move bought. It was 256 while the roster shared
    // one five megabyte `localStorage` budget with everything else.
    expect(PORTRAIT_SIZE).toBe(512);

    const result = await preparePortrait(imageFile(1200, 1200));
    expect(result.ok).toBe(true);
    expect(sized).toEqual([{ width: 512, height: 512 }]);
    expect(drawn[0].dw).toBe(512);
  });

  it('caps at half a megabyte, which is what the sheet prints', async () => {
    expect(PORTRAIT_MAX_BYTES).toBe(524_288);
    // The sheet says "of a NNN kB cap" off this constant; a cap that rounds to
    // something ugly is a cap somebody will misread.
    expect(Math.round(PORTRAIT_MAX_BYTES / 1024)).toBe(512);
  });

  it('crops the long side rather than letterboxing, centred', async () => {
    // A wide photograph: the square taken is the middle 200, not the left.
    await preparePortrait(imageFile(400, 200));
    expect(drawn[0]).toMatchObject({ sx: 100, sy: 0, side: 200 });

    drawn = [];
    await preparePortrait(imageFile(200, 400));
    expect(drawn[0]).toMatchObject({ sx: 0, sy: 100, side: 200 });
  });
});

describe('choosing a quality', () => {
  it('stores the first one when it fits, and stops there', async () => {
    encode = () => 90_000; // an ordinary photograph at 512 square
    const result = await preparePortrait(imageFile(2000, 1500));

    expect(result).toMatchObject({ ok: true, bytes: 90_000 });
    // One call, not a search: the ceiling is high enough that the good
    // setting is the setting, for everything short of a pathological picture.
    expect(qualitiesTried).toEqual([0.85]);
  });

  it('steps down once for a picture the first setting overshoots', async () => {
    encode = (q) => (q > 0.8 ? 700_000 : 300_000);
    const result = await preparePortrait(imageFile(4000, 3000));

    expect(result).toMatchObject({ ok: true, bytes: 300_000 });
    expect(qualitiesTried).toEqual([0.85, 0.7]);
  });

  it('takes something exactly at the cap, and refuses one byte more', async () => {
    encode = () => PORTRAIT_MAX_BYTES;
    expect((await preparePortrait(imageFile(900, 900))).ok).toBe(true);

    encode = () => PORTRAIT_MAX_BYTES + 1;
    expect((await preparePortrait(imageFile(900, 900))).ok).toBe(false);
  });

  it('refuses rather than storing something over the cap', async () => {
    encode = () => 2_000_000;
    const result = await preparePortrait(imageFile(6000, 4000));

    expect(result.ok).toBe(false);
    // A store with more room is not a store with no limit, and the message
    // has to leave the reader with something to do.
    expect(result.ok === false && result.error).toMatch(/crop it first/);
    expect(qualitiesTried).toEqual([0.85, 0.7]);
  });
});

describe('what it will not accept at all', () => {
  it('turns away a file that is not an image, before touching a canvas', async () => {
    const result = await preparePortrait({ type: 'application/pdf' } as File);
    expect(result).toEqual({ ok: false, error: 'That is not an image file.' });
    expect(sized).toEqual([]);
  });

  it('turns away an image that will not decode', async () => {
    const result = await preparePortrait(imageFile(0, 0, 'image/png'));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/could not be read/);
  });
});

describe('counting the cost', () => {
  it('measures a data URL by its length, which is what storage charges', () => {
    expect(dataUrlBytes('data:image/jpeg;base64,AAAA')).toBe(27);
  });
});
