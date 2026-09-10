/**
 * GIF LZW compression (GIF89a, variable code size, LSB-first bit packing).
 *
 * The algorithm is the classic one from the GIF specification: emit a clear
 * code, then greedily match the longest sequence already in the string table,
 * adding one new entry per emitted code and widening the code size just before
 * the encoder would create an entry that no longer fits.
 */

const MAX_CODE = 4096;

class LsbBitWriter {
  private bytes: number[] = [];
  private current = 0;
  private bitCount = 0;

  write(code: number, codeSize: number) {
    this.current |= code << this.bitCount;
    this.bitCount += codeSize;
    while (this.bitCount >= 8) {
      this.bytes.push(this.current & 0xff);
      this.current >>= 8;
      this.bitCount -= 8;
    }
  }

  finish(): Uint8Array {
    if (this.bitCount > 0) {
      this.bytes.push(this.current & 0xff);
      this.current = 0;
      this.bitCount = 0;
    }
    return Uint8Array.from(this.bytes);
  }
}

/**
 * Compresses palette indices into the raw GIF code stream. The caller is
 * responsible for framing the result into 255-byte sub-blocks.
 */
export function lzwEncode(
  indices: Uint8Array | Uint8ClampedArray,
  minCodeSize: number
): Uint8Array {
  if (minCodeSize < 2 || minCodeSize > 8) {
    throw new Error(`Unsupported GIF LZW code size: ${minCodeSize}`);
  }

  const clearCode = 1 << minCodeSize;
  const endOfInformationCode = clearCode + 1;
  const writer = new LsbBitWriter();
  let codeSize = minCodeSize + 1;
  let nextCode = endOfInformationCode + 1;
  let table = new Map<number, number>();

  writer.write(clearCode, codeSize);

  if (indices.length === 0) {
    writer.write(endOfInformationCode, codeSize);
    return writer.finish();
  }

  let prefix = indices[0] & (clearCode - 1);

  for (let index = 1; index < indices.length; index += 1) {
    const suffix = indices[index] & (clearCode - 1);
    const key = prefix * 256 + suffix;
    const existing = table.get(key);
    if (existing !== undefined) {
      prefix = existing;
      continue;
    }

    writer.write(prefix, codeSize);

    if (nextCode === MAX_CODE) {
      writer.write(clearCode, codeSize);
      table = new Map();
      codeSize = minCodeSize + 1;
      nextCode = endOfInformationCode + 1;
    } else {
      // Widen just before creating an entry that would not fit; decoders
      // widen at the same point, so the two stay in step.
      if (nextCode >= 1 << codeSize) codeSize += 1;
      table.set(key, nextCode);
      nextCode += 1;
    }

    prefix = suffix;
  }

  writer.write(prefix, codeSize);
  writer.write(endOfInformationCode, codeSize);
  return writer.finish();
}
