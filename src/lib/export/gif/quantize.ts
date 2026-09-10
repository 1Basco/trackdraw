/**
 * Median-cut colour quantisation for GIF export.
 *
 * Every frame of a whoop route animation shares the same scenery, so one
 * global palette for the whole animation keeps the file small and avoids
 * per-frame colour shimmer. Colours are histogrammed into a 5-bit-per-channel
 * cube (32768 cells) before the cut, which is precise enough for flat-shaded
 * renders and keeps the whole pass linear in pixel count.
 */

const CHANNEL_BITS = 5;
const CHANNEL_LEVELS = 1 << CHANNEL_BITS; // 32
const CUBE_CELLS = CHANNEL_LEVELS ** 3;
const CHANNEL_SHIFT = 8 - CHANNEL_BITS; // 3

export interface GifPalette {
  /** Flat RGB triples, padded to a power-of-two palette size. */
  palette: Uint8Array;
  /** Number of distinct colours actually used before padding. */
  colorCount: number;
  /** Lookup from 5-bit colour cube cell to palette index. */
  cellToPaletteIndex: Uint8Array;
}

export interface QuantizedFrames {
  palette: Uint8Array;
  /** One palette index per pixel, in frame order. */
  indexed: Uint8Array[];
  colorCount: number;
}

interface ColorBox {
  cells: number[];
  count: number;
  splittable: boolean;
  minR: number;
  maxR: number;
  minG: number;
  maxG: number;
  minB: number;
  maxB: number;
}

export function getCubeCellIndex(r: number, g: number, b: number) {
  return (
    ((r >> CHANNEL_SHIFT) << (CHANNEL_BITS * 2)) |
    ((g >> CHANNEL_SHIFT) << CHANNEL_BITS) |
    (b >> CHANNEL_SHIFT)
  );
}

function boundsForBox(
  cells: number[],
  counts: Int32Array,
  sums: Float64Array
): ColorBox {
  let count = 0;
  let minR = 255;
  let maxR = 0;
  let minG = 255;
  let maxG = 0;
  let minB = 255;
  let maxB = 0;

  for (const cell of cells) {
    const cellCount = counts[cell];
    count += cellCount;
    const r = sums[cell * 3] / cellCount;
    const g = sums[cell * 3 + 1] / cellCount;
    const b = sums[cell * 3 + 2] / cellCount;
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (g < minG) minG = g;
    if (g > maxG) maxG = g;
    if (b < minB) minB = b;
    if (b > maxB) maxB = b;
  }

  return {
    cells,
    count,
    splittable: cells.length > 1,
    minR,
    maxR,
    minG,
    maxG,
    minB,
    maxB,
  };
}

function getLongestAxis(box: ColorBox): 0 | 1 | 2 {
  const spanR = box.maxR - box.minR;
  const spanG = box.maxG - box.minG;
  const spanB = box.maxB - box.minB;
  if (spanG >= spanR && spanG >= spanB) return 1;
  if (spanR >= spanB) return 0;
  return 2;
}

function splitBox(
  box: ColorBox,
  counts: Int32Array,
  sums: Float64Array
): [ColorBox, ColorBox] | null {
  if (box.cells.length < 2) return null;

  const axis = getLongestAxis(box);
  const sorted = [...box.cells].sort((left, right) => {
    const leftValue = sums[left * 3 + axis] / counts[left];
    const rightValue = sums[right * 3 + axis] / counts[right];
    return leftValue - rightValue;
  });

  const half = box.count / 2;
  let running = 0;
  let splitIndex = 0;
  for (let index = 0; index < sorted.length - 1; index += 1) {
    running += counts[sorted[index]];
    splitIndex = index + 1;
    if (running >= half) break;
  }

  const lower = sorted.slice(0, splitIndex);
  const upper = sorted.slice(splitIndex);
  if (!lower.length || !upper.length) return null;

  return [boundsForBox(lower, counts, sums), boundsForBox(upper, counts, sums)];
}

function getBoxPriority(box: ColorBox) {
  const volume =
    (box.maxR - box.minR + 1) *
    (box.maxG - box.minG + 1) *
    (box.maxB - box.minB + 1);
  return box.count * Math.cbrt(volume);
}

/** Smallest GIF-legal palette size (a power of two, at least 2). */
export function getGifPaletteSize(colorCount: number) {
  let size = 2;
  while (size < colorCount) size *= 2;
  return Math.min(256, size);
}

/**
 * Builds one palette for a whole animation. Pass a representative subset of
 * frames when the full animation is too large to hold in memory at once.
 */
export function buildGifPalette(
  frames: readonly Uint8ClampedArray[],
  maxColors = 256
): GifPalette {
  const targetColors = Math.max(2, Math.min(256, Math.floor(maxColors)));
  const counts = new Int32Array(CUBE_CELLS);
  const sums = new Float64Array(CUBE_CELLS * 3);

  for (const frame of frames) {
    for (let offset = 0; offset < frame.length; offset += 4) {
      const r = frame[offset];
      const g = frame[offset + 1];
      const b = frame[offset + 2];
      const cell = getCubeCellIndex(r, g, b);
      counts[cell] += 1;
      sums[cell * 3] += r;
      sums[cell * 3 + 1] += g;
      sums[cell * 3 + 2] += b;
    }
  }

  const usedCells: number[] = [];
  for (let cell = 0; cell < CUBE_CELLS; cell += 1) {
    if (counts[cell] > 0) usedCells.push(cell);
  }
  if (!usedCells.length) {
    return {
      palette: new Uint8Array(6),
      colorCount: 1,
      cellToPaletteIndex: new Uint8Array(CUBE_CELLS),
    };
  }

  let boxes: ColorBox[] = [boundsForBox(usedCells, counts, sums)];
  while (boxes.length < targetColors) {
    let bestIndex = -1;
    let bestPriority = -1;
    for (let index = 0; index < boxes.length; index += 1) {
      if (!boxes[index].splittable) continue;
      const priority = getBoxPriority(boxes[index]);
      if (priority > bestPriority) {
        bestPriority = priority;
        bestIndex = index;
      }
    }
    if (bestIndex < 0) break;

    const split = splitBox(boxes[bestIndex], counts, sums);
    if (!split) {
      // Mark as unsplittable so the search terminates.
      boxes[bestIndex] = { ...boxes[bestIndex], splittable: false };
      continue;
    }
    boxes = [
      ...boxes.slice(0, bestIndex),
      ...split,
      ...boxes.slice(bestIndex + 1),
    ];
  }

  const colorCount = boxes.length;
  const paletteSize = getGifPaletteSize(colorCount);
  const palette = new Uint8Array(paletteSize * 3);
  boxes.forEach((box, boxIndex) => {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const cell of box.cells) {
      r += sums[cell * 3];
      g += sums[cell * 3 + 1];
      b += sums[cell * 3 + 2];
    }
    palette[boxIndex * 3] = Math.round(r / box.count);
    palette[boxIndex * 3 + 1] = Math.round(g / box.count);
    palette[boxIndex * 3 + 2] = Math.round(b / box.count);
  });

  const cellToPaletteIndex = new Uint8Array(CUBE_CELLS);
  for (const cell of usedCells) {
    const r = sums[cell * 3] / counts[cell];
    const g = sums[cell * 3 + 1] / counts[cell];
    const b = sums[cell * 3 + 2] / counts[cell];
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < colorCount; index += 1) {
      const dr = r - palette[index * 3];
      const dg = g - palette[index * 3 + 1];
      const db = b - palette[index * 3 + 2];
      const distance = dr * dr + dg * dg + db * db;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    cellToPaletteIndex[cell] = bestIndex;
  }

  return { palette, colorCount, cellToPaletteIndex };
}

/** Maps one RGBA frame onto an existing palette. */
export function mapFrameToIndices(
  frame: Uint8ClampedArray,
  { cellToPaletteIndex }: Pick<GifPalette, "cellToPaletteIndex">
): Uint8Array {
  const pixels = Math.floor(frame.length / 4);
  const output = new Uint8Array(pixels);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * 4;
    output[pixel] =
      cellToPaletteIndex[
        getCubeCellIndex(frame[offset], frame[offset + 1], frame[offset + 2])
      ];
  }
  return output;
}

export function quantizeRgbaFrames(
  frames: readonly Uint8ClampedArray[],
  maxColors = 256
): QuantizedFrames {
  const built = buildGifPalette(frames, maxColors);
  return {
    palette: built.palette,
    colorCount: built.colorCount,
    indexed: frames.map((frame) => mapFrameToIndices(frame, built)),
  };
}
