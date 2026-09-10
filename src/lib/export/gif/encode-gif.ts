/**
 * Minimal self-contained GIF89a encoder.
 *
 * TrackDraw only needs one shape of animation: a static scene with a small
 * moving subject. That makes two decisions easy — one global colour table for
 * the whole file, and per-frame sub-rectangles limited to the pixels that
 * actually changed, which keeps a 100-frame route loop in the low hundreds of
 * kilobytes instead of several megabytes.
 */

import { lzwEncode } from "./lzw";
import { getGifPaletteSize, quantizeRgbaFrames } from "./quantize";

const HEADER = "GIF89a";
const EXTENSION_INTRODUCER = 0x21;
const GRAPHIC_CONTROL_LABEL = 0xf9;
const APPLICATION_EXTENSION_LABEL = 0xff;
const IMAGE_SEPARATOR = 0x2c;
const TRAILER = 0x3b;
/** Leave the frame on screen; the next frame paints its changed rectangle over it. */
const DISPOSAL_NONE = 1;

export interface EncodeGifOptions {
  width: number;
  height: number;
  /** RGBA pixel buffers, one per frame, each `width * height * 4` bytes long. */
  frames: readonly Uint8ClampedArray[];
  /** Frame delay in hundredths of a second. */
  delayCentiseconds?: number;
  /** 0 repeats forever. */
  loopCount?: number;
  maxColors?: number;
}

export interface EncodeIndexedGifOptions {
  width: number;
  height: number;
  /** Flat RGB triples for the global colour table. */
  palette: Uint8Array;
  /** Colours actually used, before padding to a power of two. */
  colorCount: number;
  /** One palette index per pixel, one buffer per frame. */
  frames: readonly Uint8Array[];
  delayCentiseconds?: number;
  loopCount?: number;
}

class ByteWriter {
  private buffer: Uint8Array<ArrayBuffer> = new Uint8Array(1024);
  private length = 0;

  private ensure(extra: number) {
    if (this.length + extra <= this.buffer.length) return;
    let capacity = this.buffer.length * 2;
    while (capacity < this.length + extra) capacity *= 2;
    const next = new Uint8Array(capacity);
    next.set(this.buffer.subarray(0, this.length));
    this.buffer = next;
  }

  byte(value: number) {
    this.ensure(1);
    this.buffer[this.length] = value & 0xff;
    this.length += 1;
  }

  bytes(values: ArrayLike<number>) {
    this.ensure(values.length);
    this.buffer.set(values as Uint8Array, this.length);
    this.length += values.length;
  }

  short(value: number) {
    this.byte(value & 0xff);
    this.byte((value >> 8) & 0xff);
  }

  ascii(value: string) {
    for (let index = 0; index < value.length; index += 1) {
      this.byte(value.charCodeAt(index));
    }
  }

  /** Writes a byte stream as 255-byte GIF data sub-blocks, terminated by 0x00. */
  subBlocks(data: Uint8Array) {
    for (let offset = 0; offset < data.length; offset += 255) {
      const chunk = data.subarray(offset, Math.min(offset + 255, data.length));
      this.byte(chunk.length);
      this.bytes(chunk);
    }
    this.byte(0);
  }

  toUint8Array(): Uint8Array<ArrayBuffer> {
    return this.buffer.slice(0, this.length);
  }
}

export interface GifFrameRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Bounding box of the pixels that differ between two indexed frames. Returns a
 * 1x1 rectangle when nothing changed, because every frame still has to carry
 * its own delay.
 */
export function getChangedRect(
  previous: Uint8Array | null,
  current: Uint8Array,
  width: number,
  height: number
): GifFrameRect {
  if (!previous) return { left: 0, top: 0, width, height };

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * width;
    for (let x = 0; x < width; x += 1) {
      if (previous[rowStart + x] === current[rowStart + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) return { left: 0, top: 0, width: 1, height: 1 };
  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function cropIndexed(
  indices: Uint8Array,
  width: number,
  rect: GifFrameRect
): Uint8Array {
  if (rect.left === 0 && rect.top === 0 && rect.width === width) {
    return indices.subarray(0, rect.width * rect.height);
  }

  const cropped = new Uint8Array(rect.width * rect.height);
  for (let row = 0; row < rect.height; row += 1) {
    const sourceStart = (rect.top + row) * width + rect.left;
    cropped.set(
      indices.subarray(sourceStart, sourceStart + rect.width),
      row * rect.width
    );
  }
  return cropped;
}

function getMinCodeSize(paletteSize: number) {
  let bits = 1;
  while (1 << bits < paletteSize) bits += 1;
  return Math.max(2, bits);
}

/**
 * Encodes frames that are already quantised against a shared palette. Useful
 * when the caller streams frames and cannot hold every RGBA buffer in memory.
 */
export function encodeIndexedGif({
  width,
  height,
  palette,
  colorCount,
  frames,
  delayCentiseconds = 8,
  loopCount = 0,
}: EncodeIndexedGifOptions): Uint8Array<ArrayBuffer> {
  if (width <= 0 || height <= 0) {
    throw new Error("GIF dimensions must be positive");
  }
  if (!frames.length) {
    throw new Error("GIF export needs at least one frame");
  }
  const expectedLength = width * height;
  for (const frame of frames) {
    if (frame.length !== expectedLength) {
      throw new Error(
        `GIF frame size mismatch: expected ${expectedLength} indices, got ${frame.length}`
      );
    }
  }

  const paletteSize = getGifPaletteSize(colorCount);
  const minCodeSize = getMinCodeSize(paletteSize);
  // The colour-table size field is log2(entries) - 1, and the smallest table a
  // decoder accepts holds four entries, so a two-colour palette is padded.
  const tableSizeField = minCodeSize - 1;
  const tableEntries = 1 << (tableSizeField + 1);
  const globalColorTable = new Uint8Array(tableEntries * 3);
  globalColorTable.set(
    palette.subarray(0, Math.min(palette.length, tableEntries * 3))
  );

  const writer = new ByteWriter();

  writer.ascii(HEADER);
  writer.short(width);
  writer.short(height);
  // Global colour table present, 8-bit colour resolution, unsorted.
  writer.byte(0x80 | 0x70 | tableSizeField);
  writer.byte(0);
  writer.byte(0);
  writer.bytes(globalColorTable);

  writer.byte(EXTENSION_INTRODUCER);
  writer.byte(APPLICATION_EXTENSION_LABEL);
  writer.byte(11);
  writer.ascii("NETSCAPE2.0");
  writer.byte(3);
  writer.byte(1);
  writer.short(loopCount);
  writer.byte(0);

  let previous: Uint8Array | null = null;
  for (const frameIndices of frames) {
    const rect = getChangedRect(previous, frameIndices, width, height);

    writer.byte(EXTENSION_INTRODUCER);
    writer.byte(GRAPHIC_CONTROL_LABEL);
    writer.byte(4);
    writer.byte(DISPOSAL_NONE << 2);
    writer.short(Math.max(1, Math.round(delayCentiseconds)));
    writer.byte(0);
    writer.byte(0);

    writer.byte(IMAGE_SEPARATOR);
    writer.short(rect.left);
    writer.short(rect.top);
    writer.short(rect.width);
    writer.short(rect.height);
    // No local colour table, no interlace.
    writer.byte(0);
    writer.byte(minCodeSize);
    writer.subBlocks(
      lzwEncode(cropIndexed(frameIndices, width, rect), minCodeSize)
    );

    previous = frameIndices;
  }

  writer.byte(TRAILER);
  return writer.toUint8Array();
}

export function encodeGif({
  width,
  height,
  frames,
  delayCentiseconds = 8,
  loopCount = 0,
  maxColors = 256,
}: EncodeGifOptions): Uint8Array<ArrayBuffer> {
  if (!frames.length) {
    throw new Error("GIF export needs at least one frame");
  }
  const expectedLength = width * height * 4;
  for (const frame of frames) {
    if (frame.length !== expectedLength) {
      throw new Error(
        `GIF frame size mismatch: expected ${expectedLength} bytes, got ${frame.length}`
      );
    }
  }

  const { palette, indexed, colorCount } = quantizeRgbaFrames(
    frames,
    maxColors
  );

  return encodeIndexedGif({
    width,
    height,
    palette,
    colorCount,
    frames: indexed,
    delayCentiseconds,
    loopCount,
  });
}
