/**
 * §101: a QR encoder, hand-rolled like §66's renderer and for the same
 * reason - the alternative was a dependency, and the *first* alternative
 * anyone reaches for is a QR image API, which would ship the room code
 * (the whole secret, §95) to a third party to make a picture of it.
 *
 * Scope: byte mode, error level M, versions 1-10 chosen by fit - a seat
 * link is ~150 bytes and version 10 holds 213. Everything here is ISO
 * 18004's arithmetic: Reed-Solomon over GF(256), the BCH-protected
 * format and version words, the eight masks scored by the four penalty
 * rules. The proof it is right is not this file's comments but the test
 * beside it: every matrix is decoded by an independent decoder (jsqr,
 * dev-only) and must round-trip byte for byte.
 */

/* GF(256) tables for the Reed-Solomon arithmetic, generator 0x11d. */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

const mul = (a: number, b: number): number => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

/** The ECC generator polynomial of the given degree. */
function generatorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let d = 0; d < degree; d++) {
    const next = new Uint8Array(poly.length + 1);
    for (let i = 0; i < poly.length; i++) {
      next[i] ^= poly[i];
      next[i + 1] ^= mul(poly[i], EXP[d]);
    }
    poly = next;
  }
  return poly;
}

/** Reed-Solomon remainder: the ECC codewords for one block. */
function eccFor(data: Uint8Array, degree: number): Uint8Array {
  const gen = generatorPoly(degree);
  const rem = new Uint8Array(degree);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.copyWithin(0, 1);
    rem[degree - 1] = 0;
    for (let i = 0; i < degree; i++) rem[i] ^= mul(gen[i + 1], factor);
  }
  return rem;
}

/*
  Level-M capacity tables, versions 1-10. `data` is data codewords total;
  `blocks` is [count, dataPerBlock] groups (later groups carry one byte
  more); `ecc` is ECC codewords per block. The round-trip test is what
  holds these to the standard.
*/
const VERSIONS: { data: number; ecc: number; blocks: [number, number][] }[] = [
  { data: 16, ecc: 10, blocks: [[1, 16]] },
  { data: 28, ecc: 16, blocks: [[1, 28]] },
  { data: 44, ecc: 26, blocks: [[1, 44]] },
  { data: 64, ecc: 18, blocks: [[2, 32]] },
  { data: 86, ecc: 24, blocks: [[2, 43]] },
  { data: 108, ecc: 16, blocks: [[4, 27]] },
  { data: 124, ecc: 18, blocks: [[4, 31]] },
  { data: 154, ecc: 22, blocks: [[2, 38], [2, 39]] },
  { data: 182, ecc: 22, blocks: [[3, 36], [2, 37]] },
  { data: 216, ecc: 26, blocks: [[4, 43], [1, 44]] },
];

/** Alignment pattern centre coordinates, versions 2-10. */
const ALIGNMENT: number[][] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

/** Data bits -> padded data codewords for a version. */
function dataCodewords(bytes: Uint8Array, version: number): Uint8Array {
  const capacity = VERSIONS[version - 1].data;
  const bits: number[] = [];
  const push = (value: number, count: number) => {
    for (let i = count - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  // Terminator, then pad to a byte, then the alternating pad codewords.
  push(0, Math.min(4, capacity * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const out = new Uint8Array(capacity);
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    out[i / 8] = byte;
  }
  for (let i = bits.length / 8; i < capacity; i++) out[i] = i % 2 === bits.length / 8 % 2 ? 0xec : 0x11;
  return out;
}

/** Split into RS blocks, compute ECC, interleave both the standard way. */
function interleave(data: Uint8Array, version: number): Uint8Array {
  const spec = VERSIONS[version - 1];
  const blocks: Uint8Array[] = [];
  let offset = 0;
  for (const [count, size] of spec.blocks) {
    for (let i = 0; i < count; i++) {
      blocks.push(data.subarray(offset, offset + size));
      offset += size;
    }
  }
  const eccs = blocks.map((block) => eccFor(block, spec.ecc));
  const out: number[] = [];
  const longest = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < longest; i++)
    for (const block of blocks) if (i < block.length) out.push(block[i]);
  for (let i = 0; i < spec.ecc; i++) for (const ecc of eccs) out.push(ecc[i]);
  return new Uint8Array(out);
}

/** BCH-protect the 5-bit format word (level M = 00, then the mask). */
function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** BCH-protect the 6-bit version word (needed from version 7 up). */
function versionBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >> 11) * 0x1f25);
  return (version << 12) | rem;
}

type Cell = boolean;

function makeTemplate(version: number): { grid: Cell[][]; reserved: boolean[][] } {
  const size = version * 4 + 17;
  const grid: Cell[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const reserved: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const set = (row: number, col: number, on: boolean) => {
    grid[row][col] = on;
    reserved[row][col] = true;
  };

  const finder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++)
      for (let c = -1; c <= 7; c++) {
        const rr = row + r;
        const cc = col + c;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const on =
          r >= 0 && r <= 6 && c >= 0 && c <= 6 &&
          (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        set(rr, cc, on);
      }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);

  for (const centre of ALIGNMENT[version - 1]) {
    for (const centre2 of ALIGNMENT[version - 1]) {
      // Skip the three corners the finders own.
      if (reserved[centre][centre2]) continue;
      for (let r = -2; r <= 2; r++)
        for (let c = -2; c <= 2; c++)
          set(centre + r, centre2 + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
    }
  }

  for (let i = 8; i < size - 8; i++) {
    if (!reserved[6][i]) set(6, i, i % 2 === 0);
    if (!reserved[i][6]) set(i, 6, i % 2 === 0);
  }

  set(size - 8, 8, true); // the dark module

  // Reserve (contents written later) the format areas...
  for (let i = 0; i <= 8; i++) {
    if (!reserved[8][i]) set(8, i, false);
    if (!reserved[i][8]) set(i, 8, false);
    if (i < 8) {
      if (!reserved[8][size - 1 - i]) set(8, size - 1 - i, false);
      if (!reserved[size - 1 - i][8]) set(size - 1 - i, 8, false);
    }
  }
  // ...and the version areas from version 7 up.
  if (version >= 7) {
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 3; j++) {
        set(size - 11 + j, i, false);
        set(i, size - 11 + j, false);
      }
  }

  return { grid, reserved };
}

/** The zigzag data walk, writing codeword bits into unreserved cells. */
function placeData(grid: Cell[][], reserved: boolean[][], codewords: Uint8Array): void {
  const size = grid.length;
  let bitIndex = 0;
  const total = codewords.length * 8;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // the timing column is skipped whole
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step;
      for (const col of [right, right - 1]) {
        if (reserved[row][col]) continue;
        const bit =
          bitIndex < total ? (codewords[bitIndex >> 3] >> (7 - (bitIndex & 7))) & 1 : 0;
        grid[row][col] = bit === 1;
        bitIndex++;
      }
    }
    upward = !upward;
  }
}

const MASKS: ((row: number, col: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** The standard's four penalty rules, used to pick the friendliest mask. */
function penalty(grid: Cell[][]): number {
  const size = grid.length;
  let score = 0;
  // N1: runs of five or more same-coloured cells, both directions.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < size; i++) {
      let run = 1;
      for (let j = 1; j < size; j++) {
        const a = pass === 0 ? grid[i][j] : grid[j][i];
        const b = pass === 0 ? grid[i][j - 1] : grid[j - 1][i];
        if (a === b) {
          run++;
          if (j === size - 1 && run >= 5) score += run - 2;
        } else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
    }
  }
  // N2: 2x2 blocks of one colour.
  for (let r = 0; r < size - 1; r++)
    for (let c = 0; c < size - 1; c++) {
      const v = grid[r][c];
      if (v === grid[r][c + 1] && v === grid[r + 1][c] && v === grid[r + 1][c + 1]) score += 3;
    }
  // N3: the finder-like 1011101 run with four light cells on either side.
  const pattern = [true, false, true, true, true, false, true];
  const finderish = (cells: (r: number) => Cell, at: number, limit: number): boolean => {
    if (at + 6 >= limit) return false;
    for (let i = 0; i < 7; i++) if (cells(at + i) !== pattern[i]) return false;
    const lightBefore =
      at >= 4 && [1, 2, 3, 4].every((i) => !cells(at - i));
    const lightAfter =
      at + 10 < limit && [7, 8, 9, 10].every((i) => !cells(at + i));
    return lightBefore || lightAfter;
  };
  for (let i = 0; i < size; i++)
    for (let j = 0; j < size; j++) {
      if (finderish((k) => grid[i][k], j, size)) score += 40;
      if (finderish((k) => grid[k][i], j, size)) score += 40;
    }
  // N4: how far the dark proportion strays from half.
  let dark = 0;
  for (const row of grid) for (const cell of row) if (cell) dark++;
  score += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  return score;
}

function writeFormat(grid: Cell[][], mask: number): void {
  const size = grid.length;
  const bits = formatBits(mask);
  for (let i = 0; i < 15; i++) {
    const on = ((bits >> i) & 1) === 1;
    // Down column 8: bits 0-5 above the timing row, 6-7 straddling it,
    // 8-14 rising from the bottom edge.
    grid[i < 6 ? i : i < 8 ? i + 1 : size - 15 + i][8] = on;
    // Along row 8: bits 0-7 in from the right edge, 8-14 out to the left,
    // hopping the timing column between 8 and 9.
    grid[8][i < 8 ? size - 1 - i : i < 9 ? 15 - i : 14 - i] = on;
  }
  grid[size - 8][8] = true; // the dark module, restated after the overwrite
}

function writeVersion(grid: Cell[][], version: number): void {
  if (version < 7) return;
  const size = grid.length;
  const bits = versionBits(version);
  for (let i = 0; i < 18; i++) {
    const on = ((bits >> i) & 1) === 1;
    grid[Math.floor(i / 3)][size - 11 + (i % 3)] = on;
    grid[size - 11 + (i % 3)][Math.floor(i / 3)] = on;
  }
}

/**
 * Encode text (UTF-8) as a QR matrix, true = dark. Throws when the text
 * outgrows version 10 - a seat link never does, and a caller with a whole
 * novel should hear so rather than get a picture that lies.
 */
export function qrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  const version = VERSIONS.findIndex(
    (v, i) => bytes.length + (i + 1 <= 9 ? 2 : 3) <= v.data,
  ) + 1;
  if (version === 0) throw new Error(`too long for a version-10 QR: ${bytes.length} bytes`);

  const codewords = interleave(dataCodewords(bytes, version), version);
  let best: Cell[][] | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const { grid, reserved } = makeTemplate(version);
    placeData(grid, reserved, codewords);
    for (let r = 0; r < grid.length; r++)
      for (let c = 0; c < grid.length; c++)
        if (!reserved[r][c] && MASKS[mask](r, c)) grid[r][c] = !grid[r][c];
    writeFormat(grid, mask);
    writeVersion(grid, version);
    const score = penalty(grid);
    if (score < bestScore) {
      bestScore = score;
      best = grid;
    }
  }
  return best!;
}
