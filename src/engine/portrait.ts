/**
 * Making a photograph small enough to keep.
 *
 * The roster lives in `localStorage`, which is one budget of roughly five
 * megabytes shared by every character on it. A phone camera produces four of
 * those in a single picture, so storing what somebody chose would fill the
 * quota with one portrait and take the whole roster down with it - a saved
 * character that will not save is a worse failure than no portraits at all.
 *
 * So the file is never stored. It is drawn onto a canvas at 256 square,
 * re-encoded as JPEG, and only that is kept.
 *
 * ## Why the quality search
 *
 * A single fixed quality cannot serve both a flat drawing and a photograph of
 * a face: the first is tiny at 0.9 and the second is still over budget at 0.6.
 * So it steps down until the result fits, and reports honestly when even the
 * lowest setting will not - which is better than storing something that breaks
 * the roster the next time anything else is saved.
 */

/** The stored size. Big enough to print at an inch square without mush. */
export const PORTRAIT_SIZE = 256;

/**
 * The cap, in bytes of data URL.
 *
 * Chosen against the budget rather than by eye: `localStorage` gives about
 * 5 MB, a roster of twenty characters is a lot, and 40 kB each leaves the
 * portraits under a fifth of it with everything else's growth still covered.
 */
export const PORTRAIT_MAX_BYTES = 40_000;

/** Tried in order until one fits. */
const QUALITIES = [0.82, 0.7, 0.6, 0.5, 0.4, 0.3];

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
