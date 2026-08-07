/**
 * Making a photograph small enough to keep.
 *
 * The original file is never stored. It is drawn onto a canvas at a fixed
 * square size, re-encoded as JPEG, and only that is kept - a four megabyte
 * phone photograph has no business sitting in a roster, whatever the store
 * underneath will tolerate.
 *
 * ## Why these numbers moved
 *
 * They were set against `localStorage`, which gives one budget of roughly five
 * megabytes to the entire origin: 256 square at 40 kB, with a six-step quality
 * search grinding a photograph down until it fit. That was rationing, and it
 * showed - a face at 256 square is soft on any modern display, and 0.3 quality
 * is visibly mushy.
 *
 * The roster now lives in IndexedDB (see `persist.ts`), where the budget is
 * measured against free disk rather than five megabytes. So the portrait gets
 * the size it should always have had, and the search shrinks to a single
 * fallback: at 512 square and half a megabyte, quality 0.85 fits every ordinary
 * photograph outright, and 0.7 catches the noisy ones. Anything that will not
 * fit at 0.7 is still refused rather than stored, because a store with more
 * room is not a store with no limit.
 */

/**
 * The stored size.
 *
 * 512 rather than 256 so the face is still sharp on a tablet at 2x, which is
 * the screen this is actually used on.
 */
export const PORTRAIT_SIZE = 512;

/**
 * The cap, in bytes of data URL.
 *
 * Half a megabyte each. A roster of twenty characters is a lot, and even all
 * twenty carrying a portrait at the ceiling comes to 10 MB - twice what the
 * whole origin used to get, and a rounding error against an IndexedDB quota.
 */
export const PORTRAIT_MAX_BYTES = 524_288;

/**
 * Tried in order until one fits.
 *
 * Two steps, not six. The first is the one nearly every picture is stored at;
 * the second exists for the noisy photograph that the first overshoots.
 */
const QUALITIES = [0.85, 0.7];

export type PortraitResult =
  | { ok: true; dataUrl: string; bytes: number }
  | { ok: false; error: string };

/**
 * Draw the image square, centred, cropping the long side.
 *
 * Cropping rather than letterboxing because the box on the sheet is square and
 * a portrait with bars down the side looks like a mistake. Centre-weighted
 * because that is where a face is in almost every photograph anyone chooses.
 */
function drawSquare(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = PORTRAIT_SIZE;
  canvas.height = PORTRAIT_SIZE;
  const context = canvas.getContext('2d');
  if (!context) return canvas;

  const side = Math.min(width, height);
  const sx = (width - side) / 2;
  const sy = (height - side) / 2;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, sx, sy, side, side, 0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);
  return canvas;
}

/** Bytes a data URL costs in storage, which is its length in UTF-16 code units. */
export const dataUrlBytes = (dataUrl: string) => dataUrl.length;

/**
 * Turn a chosen file into something small enough to store.
 *
 * Rejects rather than throws, and every rejection says what a reader can do
 * about it.
 */
export async function preparePortrait(file: File): Promise<PortraitResult> {
  if (!file.type.startsWith('image/')) {
    return { ok: false, error: 'That is not an image file.' };
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('decode'));
      element.src = url;
    }).catch(() => null);

    if (!image || !image.naturalWidth || !image.naturalHeight) {
      return { ok: false, error: 'That image could not be read. Try a JPEG or a PNG.' };
    }

    const canvas = drawSquare(image, image.naturalWidth, image.naturalHeight);

    for (const quality of QUALITIES) {
      /*
        JPEG rather than PNG or WebP. PNG is lossless and would blow the
        budget on any photograph; WebP is smaller but a data URL saved today
        has to still open in whatever browser the roster is loaded in later,
        and JPEG is the one nothing has ever failed to read.
      */
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const bytes = dataUrlBytes(dataUrl);
      if (bytes <= PORTRAIT_MAX_BYTES) return { ok: true, dataUrl, bytes };
    }

    return {
      ok: false,
      error:
        'That image will not compress small enough to store. Try a simpler picture, or crop it first.',
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
