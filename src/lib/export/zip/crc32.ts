/**
 * CRC-32 (IEEE 802.3, reflected polynomial 0xEDB88320) — the checksum every
 * ZIP entry header has to carry. Kept separate from the archive writer so the
 * table can be reused and tested on its own.
 */

const CRC32_POLYNOMIAL = 0xedb88320;

function buildCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? (value >>> 1) ^ CRC32_POLYNOMIAL : value >>> 1;
    }
    table[index] = value >>> 0;
  }

  return table;
}

const CRC32_TABLE = buildCrc32Table();

/** Unsigned CRC-32 of `bytes`, as the ZIP format stores it. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}
