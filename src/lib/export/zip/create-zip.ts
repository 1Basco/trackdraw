import { crc32 } from "./crc32";

/**
 * A minimal ZIP writer.
 *
 * Everything the packs put in an archive (PNG, GIF) is already compressed, and
 * the text files are a few kilobytes, so entries are stored uncompressed
 * (method 0 / STORE). That keeps the writer to three record types — local file
 * header, central directory header, end-of-central-directory — with no
 * dependency and no DEFLATE implementation.
 *
 * Filenames are written as UTF-8 with general-purpose bit 11 set, which is how
 * every modern unpacker is told to read the name as UTF-8 rather than CP437.
 */

export interface ZipEntry {
  /** Path inside the archive. Forward slashes only; no leading slash. */
  name: string;
  data: Uint8Array;
}

export interface CreateZipOptions {
  /** Timestamp stamped on every entry. Defaults to now. */
  modifiedAt?: Date;
}

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

const LOCAL_FILE_HEADER_SIZE = 30;
const CENTRAL_DIRECTORY_HEADER_SIZE = 46;
const END_OF_CENTRAL_DIRECTORY_SIZE = 22;

/** PKZIP 2.0: the lowest version that understands the UTF-8 name flag. */
const VERSION = 20;
const METHOD_STORE = 0;
const FLAG_UTF8_NAMES = 0x0800;

const MAX_UINT16 = 0xffff;
const MAX_UINT32 = 0xffffffff;

/** ZIP timestamps are MS-DOS values with a 1980 epoch and two-second steps. */
export function toDosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());

  return {
    time:
      (Math.floor(date.getSeconds() / 2) & 0x1f) |
      ((date.getMinutes() & 0x3f) << 5) |
      ((date.getHours() & 0x1f) << 11),
    date:
      (date.getDate() & 0x1f) |
      (((date.getMonth() + 1) & 0x0f) << 5) |
      (((year - 1980) & 0x7f) << 9),
  };
}

function encodeName(name: string): Uint8Array {
  const trimmed = name.replace(/^\/+/, "");
  if (!trimmed) throw new Error("ZIP entry name cannot be empty");
  if (trimmed.includes("\\")) {
    throw new Error(`ZIP entry name must use forward slashes: ${name}`);
  }
  return new TextEncoder().encode(trimmed);
}

/** Convenience wrapper for the text files a pack writes next to its images. */
export function zipTextEntry(name: string, text: string): ZipEntry {
  return { name, data: new TextEncoder().encode(text) };
}

export function createZipArchive(
  entries: ZipEntry[],
  { modifiedAt = new Date() }: CreateZipOptions = {}
): Uint8Array<ArrayBuffer> {
  if (entries.length > MAX_UINT16) {
    throw new Error("ZIP archive would need more than 65535 entries");
  }

  const dos = toDosDateTime(modifiedAt);
  const seen = new Set<string>();
  const prepared = entries.map((entry) => {
    const nameBytes = encodeName(entry.name);
    const key = new TextDecoder().decode(nameBytes);
    if (seen.has(key)) {
      throw new Error(`Duplicate ZIP entry name: ${key}`);
    }
    seen.add(key);

    if (entry.data.length > MAX_UINT32) {
      throw new Error(`ZIP entry is too large to store: ${key}`);
    }

    return { nameBytes, data: entry.data, crc: crc32(entry.data) };
  });

  const localSize = prepared.reduce(
    (sum, entry) =>
      sum + LOCAL_FILE_HEADER_SIZE + entry.nameBytes.length + entry.data.length,
    0
  );
  const centralSize = prepared.reduce(
    (sum, entry) =>
      sum + CENTRAL_DIRECTORY_HEADER_SIZE + entry.nameBytes.length,
    0
  );
  const total = localSize + centralSize + END_OF_CENTRAL_DIRECTORY_SIZE;
  if (total > MAX_UINT32) {
    throw new Error("ZIP archive would exceed the 4 GB single-archive limit");
  }

  const buffer = new Uint8Array(total);
  const view = new DataView(buffer.buffer);
  let offset = 0;

  const writeUint16 = (value: number) => {
    view.setUint16(offset, value, true);
    offset += 2;
  };
  const writeUint32 = (value: number) => {
    view.setUint32(offset, value >>> 0, true);
    offset += 4;
  };
  const writeBytes = (bytes: Uint8Array) => {
    buffer.set(bytes, offset);
    offset += bytes.length;
  };

  const localOffsets: number[] = [];

  for (const entry of prepared) {
    localOffsets.push(offset);
    writeUint32(LOCAL_FILE_HEADER_SIGNATURE);
    writeUint16(VERSION);
    writeUint16(FLAG_UTF8_NAMES);
    writeUint16(METHOD_STORE);
    writeUint16(dos.time);
    writeUint16(dos.date);
    writeUint32(entry.crc);
    writeUint32(entry.data.length);
    writeUint32(entry.data.length);
    writeUint16(entry.nameBytes.length);
    writeUint16(0); // No extra field.
    writeBytes(entry.nameBytes);
    writeBytes(entry.data);
  }

  const centralDirectoryOffset = offset;

  for (const [index, entry] of prepared.entries()) {
    writeUint32(CENTRAL_DIRECTORY_SIGNATURE);
    writeUint16(VERSION); // Version made by.
    writeUint16(VERSION); // Version needed to extract.
    writeUint16(FLAG_UTF8_NAMES);
    writeUint16(METHOD_STORE);
    writeUint16(dos.time);
    writeUint16(dos.date);
    writeUint32(entry.crc);
    writeUint32(entry.data.length);
    writeUint32(entry.data.length);
    writeUint16(entry.nameBytes.length);
    writeUint16(0); // No extra field.
    writeUint16(0); // No comment.
    writeUint16(0); // Disk number start.
    writeUint16(0); // Internal attributes.
    writeUint32(0); // External attributes.
    writeUint32(localOffsets[index]);
    writeBytes(entry.nameBytes);
  }

  const centralDirectoryBytes = offset - centralDirectoryOffset;

  writeUint32(END_OF_CENTRAL_DIRECTORY_SIGNATURE);
  writeUint16(0); // This disk.
  writeUint16(0); // Disk holding the central directory.
  writeUint16(prepared.length);
  writeUint16(prepared.length);
  writeUint32(centralDirectoryBytes);
  writeUint32(centralDirectoryOffset);
  writeUint16(0); // No archive comment.

  return buffer;
}
