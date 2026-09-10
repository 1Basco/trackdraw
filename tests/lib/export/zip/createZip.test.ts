import { describe, expect, it } from "vitest";
import { crc32 } from "@/lib/export/zip/crc32";
import {
  createZipArchive,
  toDosDateTime,
  zipTextEntry,
} from "@/lib/export/zip/create-zip";

/**
 * The archive is parsed back with a reader written from the ZIP specification
 * on its own — no shared code with the writer, and a bitwise CRC-32 instead of
 * the writer's lookup table — so a matching result means the bytes really are
 * a ZIP file and not just self-consistent.
 */

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;

/** Table-free CRC-32, independent of the implementation under test. */
function referenceCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ParsedEntry {
  name: string;
  method: number;
  flags: number;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  data: Uint8Array;
}

function readZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let endOffset = -1;
  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === END_SIGNATURE) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("No end-of-central-directory record");

  const entryCount = view.getUint16(endOffset + 10, true);
  const centralSize = view.getUint32(endOffset + 12, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  const decoder = new TextDecoder("utf-8", { fatal: true });

  const entries: ParsedEntry[] = [];
  let cursor = centralOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
      throw new Error(`Bad central directory header at ${cursor}`);
    }
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const crc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength)
    );

    if (view.getUint32(localHeaderOffset, true) !== LOCAL_SIGNATURE) {
      throw new Error(`Bad local file header for ${name}`);
    }
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const localName = decoder.decode(
      bytes.subarray(
        localHeaderOffset + 30,
        localHeaderOffset + 30 + localNameLength
      )
    );
    if (localName !== name) {
      throw new Error(`Name mismatch: ${localName} vs ${name}`);
    }
    if (view.getUint32(localHeaderOffset + 14, true) !== crc) {
      throw new Error(`CRC mismatch in the local header of ${name}`);
    }

    const dataStart =
      localHeaderOffset + 30 + localNameLength + localExtraLength;
    entries.push({
      name,
      method,
      flags,
      crc,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      data: bytes.subarray(dataStart, dataStart + compressedSize),
    });

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return {
    entries,
    entryCount,
    centralOffset,
    centralSize,
    centralSizeMatches: cursor - centralOffset === centralSize,
    trailingBytes: bytes.length - (endOffset + 22),
  };
}

const text = (value: string) => new TextEncoder().encode(value);

describe("crc32", () => {
  it("matches a table-free reference implementation", () => {
    const samples = [
      text(""),
      text("a"),
      text("123456789"),
      text("bill-of-materials.csv"),
      new Uint8Array(Array.from({ length: 512 }, (_, index) => index % 256)),
    ];

    for (const sample of samples) {
      expect(crc32(sample)).toBe(referenceCrc32(sample));
    }
    // The classic check value for "123456789".
    expect(crc32(text("123456789"))).toBe(0xcbf43926);
  });
});

describe("toDosDateTime", () => {
  it("packs a date into the MS-DOS fields with a 1980 epoch", () => {
    const { time, date } = toDosDateTime(new Date(2026, 8, 10, 13, 45, 30));

    expect(date & 0x1f).toBe(10);
    expect((date >> 5) & 0x0f).toBe(9);
    expect(((date >> 9) & 0x7f) + 1980).toBe(2026);
    expect((time >> 11) & 0x1f).toBe(13);
    expect((time >> 5) & 0x3f).toBe(45);
    expect((time & 0x1f) * 2).toBe(30);
  });

  it("clamps dates before the 1980 epoch", () => {
    expect(toDosDateTime(new Date(1970, 0, 1)).date >> 9).toBe(0);
  });
});

describe("createZipArchive", () => {
  const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03,
  ]);
  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0xff, 0x00]);

  it("writes a readable STORE archive with a correct central directory", () => {
    const markdown = "# Bill of materials\n\n| Item | Quantity |\n";
    const archive = createZipArchive(
      [
        { name: "route-map.png", data: png },
        { name: "route-flythrough.gif", data: gif },
        zipTextEntry("bill-of-materials.md", markdown),
      ],
      { modifiedAt: new Date(2026, 8, 10, 12, 0, 0) }
    );

    const parsed = readZip(archive);

    expect(parsed.entryCount).toBe(3);
    expect(parsed.trailingBytes).toBe(0);
    expect(parsed.centralSizeMatches).toBe(true);
    expect(parsed.entries.map((entry) => entry.name)).toEqual([
      "route-map.png",
      "route-flythrough.gif",
      "bill-of-materials.md",
    ]);

    for (const entry of parsed.entries) {
      // STORE: nothing is compressed, so both sizes agree.
      expect(entry.method).toBe(0);
      expect(entry.compressedSize).toBe(entry.uncompressedSize);
      // Bit 11 tells the unpacker the name is UTF-8.
      expect(entry.flags & 0x0800).toBe(0x0800);
      expect(entry.crc).toBe(referenceCrc32(entry.data));
    }

    const [mapEntry, gifEntry, bomEntry] = parsed.entries;
    expect(Array.from(mapEntry.data)).toEqual(Array.from(png));
    expect(Array.from(gifEntry.data)).toEqual(Array.from(gif));
    expect(new TextDecoder().decode(bomEntry.data)).toBe(markdown);
    expect(mapEntry.localHeaderOffset).toBe(0);
    expect(gifEntry.localHeaderOffset).toBeGreaterThan(0);
  });

  it("stores non-ASCII names as UTF-8", () => {
    const name = "vue-arrière-上.png";
    const parsed = readZip(
      createZipArchive([{ name, data: new Uint8Array([1, 2, 3]) }])
    );

    expect(parsed.entries[0].name).toBe(name);
    expect(parsed.entries[0].uncompressedSize).toBe(3);
  });

  it("handles an empty entry and an empty archive", () => {
    const withEmptyFile = readZip(
      createZipArchive([{ name: "empty.txt", data: new Uint8Array(0) }])
    );
    expect(withEmptyFile.entries[0].uncompressedSize).toBe(0);
    expect(withEmptyFile.entries[0].crc).toBe(0);

    const empty = readZip(createZipArchive([]));
    expect(empty.entryCount).toBe(0);
    expect(empty.entries).toEqual([]);
  });

  it("keeps nested paths and rejects unusable names", () => {
    const parsed = readZip(
      createZipArchive([
        { name: "/views/top-left.png", data: new Uint8Array([9]) },
      ])
    );
    expect(parsed.entries[0].name).toBe("views/top-left.png");

    expect(() =>
      createZipArchive([{ name: "", data: new Uint8Array() }])
    ).toThrow(/empty/);
    expect(() =>
      createZipArchive([{ name: "views\\a.png", data: new Uint8Array() }])
    ).toThrow(/forward slashes/);
    expect(() =>
      createZipArchive([
        { name: "a.png", data: new Uint8Array() },
        { name: "a.png", data: new Uint8Array() },
      ])
    ).toThrow(/Duplicate/);
  });
});
