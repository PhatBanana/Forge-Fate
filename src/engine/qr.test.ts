import { describe, expect, it } from 'vitest';
import jsQR from 'jsqr';
import { qrMatrix } from './qr';

/**
 * §101. The encoder is judged by a decoder it has never met: every matrix
 * is rasterised and handed to jsqr (dev-only), and the text must come
 * back byte for byte. A structural self-test would only prove the code
 * agrees with itself; this proves a phone's camera will agree with it.
 */

/** Rasterise the matrix the way a camera would see it: scaled, quiet zone. */
function rasterise(matrix: boolean[][], scale = 4): { data: Uint8ClampedArray; size: number } {
  const quiet = 4;
  const size = (matrix.length + quiet * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let r = 0; r < matrix.length; r++)
    for (let c = 0; c < matrix.length; c++) {
      if (!matrix[r][c]) continue;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const x = (c + quiet) * scale + dx;
          const y = (r + quiet) * scale + dy;
          const at = (y * size + x) * 4;
          data[at] = data[at + 1] = data[at + 2] = 0;
        }
    }
  return { data, size };
}

const roundTrip = (text: string): string | null => {
  const { data, size } = rasterise(qrMatrix(text));
  return jsQR(data, size, size)?.data ?? null;
};

describe('the QR encoder (§101)', () => {
  it('round-trips a real seat link through an independent decoder', () => {
    const link =
      'https://phatbanana.github.io/Forge-Fate/#seat=abc123&room=KWXR7N&relay=wss://forge-fate-relay.phatbanana.workers.dev';
    expect(roundTrip(link)).toBe(link);
  });

  it('round-trips every version the seat links can reach', () => {
    // One text per capacity band, so all ten version tables face the decoder.
    for (const length of [7, 20, 40, 60, 80, 100, 120, 150, 180, 190]) {
      const text = `wss://r.example/#${'x'.repeat(length)}`;
      expect(roundTrip(text), `${text.length} bytes`).toBe(text);
    }
  });

  it('is square, odd-sized, and the size names the version', () => {
    const matrix = qrMatrix('hello');
    expect(matrix.length % 4).toBe(1); // 4v + 17
    for (const row of matrix) expect(row.length).toBe(matrix.length);
  });

  it('refuses what version 10 cannot hold, by saying so', () => {
    expect(() => qrMatrix('x'.repeat(500))).toThrow(/too long/);
  });
});
