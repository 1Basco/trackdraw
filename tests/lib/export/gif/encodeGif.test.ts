import { describe, expect, it } from "vitest";
import { encodeGif, getChangedRect } from "@/lib/export/gif/encode-gif";
import { lzwEncode } from "@/lib/export/gif/lzw";
import {
  getGifPaletteSize,
  quantizeRgbaFrames,
} from "@/lib/export/gif/quantize";

interface ParsedGifFrame {
  left: number;
  top: number;
  width: number;
  height: number;
  delayCentiseconds: number;
  disposal: number;
  minCodeSize: number;
  indices: number[];
}

interface ParsedGif {
  signature: string;
  width: number;
  height: number;
  globalColorTableEntries: number;
  palette: number[][];
  loopCount: number | null;
  frames: ParsedGifFrame[];
  hasTrailer: boolean;
}

/** Minimal GIF89a reader, deliberately independent of the encoder internals. */
function parseGif(bytes: Uint8Array): ParsedGif {
  let offset = 0;
  const readByte = () => bytes[offset++];
  const readShort = () => {
    const value = bytes[offset] | (bytes[offset + 1] << 8);
    offset += 2;
    return value;
  };
  const readSubBlocks = () => {
    const chunks: number[] = [];
    for (;;) {
      const size = readByte();
      if (!size) break;
      for (let index = 0; index < size; index += 1) chunks.push(readByte());
    }
    return Uint8Array.from(chunks);
  };

  const signature = String.fromCharCode(...bytes.subarray(0, 6));
  offset = 6;
  const width = readShort();
  const height = readShort();
  const packed = readByte();
  readByte();
  readByte();

  const globalColorTableEntries =
    (packed & 0x80) === 0 ? 0 : 1 << ((packed & 0x07) + 1);
  const palette: number[][] = [];
  for (let index = 0; index < globalColorTableEntries; index += 1) {
    palette.push([readByte(), readByte(), readByte()]);
  }

  const frames: ParsedGifFrame[] = [];
  let loopCount: number | null = null;
  let pendingDelay = 0;
  let pendingDisposal = 0;
  let hasTrailer = false;

  for (;;) {
    const marker = readByte();
    if (marker === 0x3b) {
      hasTrailer = true;
      break;
    }
    if (marker === undefined) break;

    if (marker === 0x21) {
      const label = readByte();
      if (label === 0xf9) {
        const size = readByte();
        expect(size).toBe(4);
        const flags = readByte();
        pendingDisposal = (flags >> 2) & 0x07;
        pendingDelay = readShort();
        readByte();
        readByte();
        continue;
      }
      if (label === 0xff) {
        const size = readByte();
        const identifier = String.fromCharCode(
          ...bytes.subarray(offset, offset + size)
        );
        offset += size;
        const data = readSubBlocks();
        if (identifier === "NETSCAPE2.0") {
          loopCount = data[1] | (data[2] << 8);
        }
        continue;
      }
      readSubBlocks();
      continue;
    }

    if (marker === 0x2c) {
      const left = readShort();
      const top = readShort();
      const frameWidth = readShort();
      const frameHeight = readShort();
      const imagePacked = readByte();
      expect(imagePacked & 0x80).toBe(0);
      const minCodeSize = readByte();
      const data = readSubBlocks();
      frames.push({
        left,
        top,
        width: frameWidth,
        height: frameHeight,
        delayCentiseconds: pendingDelay,
        disposal: pendingDisposal,
        minCodeSize,
        indices: lzwDecode(data, minCodeSize),
      });
      continue;
    }

    throw new Error(`Unexpected GIF block marker 0x${marker.toString(16)}`);
  }

  return {
    signature,
    width,
    height,
    globalColorTableEntries,
    palette,
    loopCount,
    frames,
    hasTrailer,
  };
}

function lzwDecode(data: Uint8Array, minCodeSize: number): number[] {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  let table: number[][] = [];
  let codeSize = minCodeSize + 1;

  const resetTable = () => {
    table = [];
    for (let index = 0; index < clearCode; index += 1) table.push([index]);
    table.push([], []);
    codeSize = minCodeSize + 1;
  };

  resetTable();

  const output: number[] = [];
  let bitPosition = 0;
  let previous: number[] | null = null;

  const readCode = () => {
    let code = 0;
    for (let bit = 0; bit < codeSize; bit += 1) {
      const byte = data[bitPosition >> 3];
      code |= ((byte >> (bitPosition & 7)) & 1) << bit;
      bitPosition += 1;
    }
    return code;
  };

  while (bitPosition + codeSize <= data.length * 8) {
    const code = readCode();
    if (code === clearCode) {
      resetTable();
      previous = null;
      continue;
    }
    if (code === endCode) break;

    let entry: number[];
    if (code < table.length && table[code].length) {
      entry = table[code];
    } else if (previous) {
      entry = [...previous, previous[0]];
    } else {
      throw new Error(`Undefined LZW code ${code}`);
    }

    output.push(...entry);
    if (previous) {
      table.push([...previous, entry[0]]);
      if (table.length === 1 << codeSize && codeSize < 12) codeSize += 1;
    }
    previous = entry;
  }

  return output;
}

function createFrame(
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number]
) {
  const frame = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      const offset = (y * width + x) * 4;
      frame[offset] = r;
      frame[offset + 1] = g;
      frame[offset + 2] = b;
      frame[offset + 3] = 255;
    }
  }
  return frame;
}

describe("lzwEncode", () => {
  it("round-trips index runs through a standalone decoder", () => {
    const indices = Uint8Array.from(
      Array.from({ length: 600 }, (_, index) => (index * 7) % 16)
    );
    const encoded = lzwEncode(indices, 4);

    expect(lzwDecode(encoded, 4)).toEqual([...indices]);
  });

  it("round-trips long repetitive runs that force a table reset", () => {
    const indices = new Uint8Array(20000);
    for (let index = 0; index < indices.length; index += 1) {
      indices[index] = index % 251 === 0 ? 3 : (index * 13) % 256;
    }
    const encoded = lzwEncode(indices, 8);

    expect(lzwDecode(encoded, 8)).toEqual([...indices]);
    expect(encoded.length).toBeLessThan(indices.length);
  });

  it("rejects code sizes outside the GIF range", () => {
    expect(() => lzwEncode(new Uint8Array([0]), 1)).toThrow();
    expect(() => lzwEncode(new Uint8Array([0]), 9)).toThrow();
  });
});

describe("quantizeRgbaFrames", () => {
  it("keeps a small palette exact and pads to a power of two", () => {
    const frame = createFrame(4, 2, (x) => (x < 2 ? [255, 0, 0] : [0, 0, 255]));
    const { palette, indexed, colorCount } = quantizeRgbaFrames([frame], 256);

    expect(colorCount).toBe(2);
    expect(getGifPaletteSize(colorCount)).toBe(2);
    expect(indexed[0][0]).not.toBe(indexed[0][3]);
    const first = [palette[0], palette[1], palette[2]];
    const second = [palette[3], palette[4], palette[5]];
    expect([first, second]).toContainEqual([255, 0, 0]);
    expect([first, second]).toContainEqual([0, 0, 255]);
  });

  it("reduces a gradient to the requested colour budget", () => {
    const frame = createFrame(64, 64, (x, y) => [x * 4, y * 4, 128]);
    const { colorCount } = quantizeRgbaFrames([frame], 16);

    expect(colorCount).toBeLessThanOrEqual(16);
    expect(colorCount).toBeGreaterThan(1);
  });
});

describe("getChangedRect", () => {
  it("returns the full frame for the first frame", () => {
    const current = new Uint8Array(6 * 4);
    expect(getChangedRect(null, current, 6, 4)).toEqual({
      left: 0,
      top: 0,
      width: 6,
      height: 4,
    });
  });

  it("bounds the changed pixels only", () => {
    const previous = new Uint8Array(10 * 10);
    const current = new Uint8Array(10 * 10);
    current[3 * 10 + 4] = 1;
    current[5 * 10 + 6] = 1;

    expect(getChangedRect(previous, current, 10, 10)).toEqual({
      left: 4,
      top: 3,
      width: 3,
      height: 3,
    });
  });

  it("falls back to a single pixel when nothing changed", () => {
    const frame = new Uint8Array(4 * 4);
    expect(getChangedRect(frame, frame, 4, 4)).toEqual({
      left: 0,
      top: 0,
      width: 1,
      height: 1,
    });
  });
});

describe("encodeGif", () => {
  it("writes a decodable looping GIF89a with one image per frame", () => {
    const width = 8;
    const height = 6;
    const frames = [0, 1, 2].map((frameIndex) =>
      createFrame(width, height, (x, y) =>
        x === frameIndex && y === 1 ? [255, 32, 32] : [16, 16, 24]
      )
    );

    const gif = encodeGif({
      width,
      height,
      frames,
      delayCentiseconds: 7,
      loopCount: 0,
    });
    const parsed = parseGif(gif);

    expect(parsed.signature).toBe("GIF89a");
    expect(parsed.width).toBe(width);
    expect(parsed.height).toBe(height);
    expect(parsed.globalColorTableEntries).toBeGreaterThanOrEqual(2);
    expect(parsed.loopCount).toBe(0);
    expect(parsed.frames).toHaveLength(3);
    expect(parsed.hasTrailer).toBe(true);
    expect(parsed.frames.every((frame) => frame.delayCentiseconds === 7)).toBe(
      true
    );
    expect(parsed.frames.every((frame) => frame.disposal === 1)).toBe(true);

    const firstFrame = parsed.frames[0];
    expect(firstFrame.left).toBe(0);
    expect(firstFrame.top).toBe(0);
    expect(firstFrame.width).toBe(width);
    expect(firstFrame.height).toBe(height);
    expect(firstFrame.indices).toHaveLength(width * height);

    const litIndex = firstFrame.indices[1 * width + 0];
    const darkIndex = firstFrame.indices[0];
    expect(litIndex).not.toBe(darkIndex);
    expect(parsed.palette[litIndex]).toEqual([255, 32, 32]);
    expect(parsed.palette[darkIndex]).toEqual([16, 16, 24]);
  });

  it("encodes later frames as the changed rectangle only", () => {
    const width = 32;
    const height = 32;
    const frames = [0, 1].map((frameIndex) =>
      createFrame(width, height, (x, y) =>
        x >= 10 + frameIndex && x <= 12 + frameIndex && y >= 10 && y <= 12
          ? [240, 240, 240]
          : [10, 20, 30]
      )
    );

    const parsed = parseGif(encodeGif({ width, height, frames }));

    expect(parsed.frames[0].width).toBe(width);
    expect(parsed.frames[1].width).toBeLessThan(width);
    expect(parsed.frames[1].height).toBeLessThan(height);
    expect(parsed.frames[1].left).toBe(10);
    expect(parsed.frames[1].top).toBe(10);
    expect(parsed.frames[1].indices).toHaveLength(
      parsed.frames[1].width * parsed.frames[1].height
    );
  });

  it("keeps an animation-shaped loop small through frame differencing", () => {
    const width = 640;
    const height = 400;
    const frameCount = 96;
    const frames = Array.from({ length: frameCount }, (_, index) => {
      const cx = 60 + index * 5;
      return createFrame(width, height, (x, y) => {
        if (Math.abs(x - cx) < 20 && Math.abs(y - 200) < 20) {
          return [244, 114, 22];
        }
        return y % 40 === 0 || x % 40 === 0 ? [200, 208, 220] : [238, 242, 247];
      });
    });

    const gif = encodeGif({
      width,
      height,
      frames,
      delayCentiseconds: 8,
      maxColors: 128,
    });
    const parsed = parseGif(gif);

    expect(parsed.frames).toHaveLength(frameCount);
    // A static scene with a small moving subject must not cost a full frame
    // each: the changed-rectangle encoding is what keeps the file shareable.
    expect(gif.byteLength).toBeLessThan(400_000);
    expect(
      parsed.frames.slice(1).every((frame) => frame.width < width / 4)
    ).toBe(true);
  });

  it("rejects frames whose size does not match the canvas", () => {
    expect(() =>
      encodeGif({
        width: 4,
        height: 4,
        frames: [new Uint8ClampedArray(4 * 4 * 4), new Uint8ClampedArray(8)],
      })
    ).toThrow(/frame size mismatch/i);
    expect(() => encodeGif({ width: 4, height: 4, frames: [] })).toThrow();
  });
});
