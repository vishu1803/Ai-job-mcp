/**
 * @file Lightweight Zero-Dependency ZIP Archive Packager.
 *
 * Creates standard PKZIP (v2.0) archive buffers using Node.js built-in `node:zlib`.
 * Used for packaging full Application Handoff Kits (Resume PDF, Cover Letter PDF,
 * LaTeX sources, and metadata manifest) without external heavy dependencies.
 */

import zlib from 'node:zlib';

/**
 * Standard CRC-32 lookup table.
 */
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c;
}

/**
 * Computes 32-bit CRC checksum for a buffer.
 *
 * @param {Buffer|Uint8Array} buffer
 * @returns {number} Unsigned 32-bit CRC
 */
export function computeCrc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Converts a JS Date to MS-DOS date/time format.
 *
 * @param {Date} [date=new Date()]
 * @returns {{ time: number, date: number }}
 */
function toDosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  return { date: dosDate, time: dosTime };
}

/**
 * Packs multiple file entries into a single ZIP archive Buffer.
 *
 * @param {Array<{ name: string, data: Buffer|string, date?: Date }>} entries
 * @returns {Buffer} Valid PKZIP archive buffer
 */
export function createZipArchive(entries = []) {
  const localChunks = [];
  const centralChunks = [];
  let currentOffset = 0;

  for (const entry of entries) {
    const filenameBuffer = Buffer.from(entry.name, 'utf8');
    const rawData = Buffer.isBuffer(entry.data)
      ? entry.data
      : Buffer.from(entry.data || '', 'utf8');
    const uncompressedSize = rawData.length;
    const crc = computeCrc32(rawData);

    // Deflate compression
    const compressedData = zlib.deflateRawSync(rawData, { level: 6 });
    const compressedSize = compressedData.length;
    const { date: dosDate, time: dosTime } = toDosDateTime(entry.date || new Date());

    // 1. Local File Header (30 bytes + filename.length + compressedSize)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4); // Version needed to extract (2.0)
    localHeader.writeUInt16LE(0x0800, 6); // General purpose bit flag (UTF-8 filename)
    localHeader.writeUInt16LE(8, 8); // Compression method (8 = Deflate)
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(filenameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28); // Extra field length

    localChunks.push(localHeader, filenameBuffer, compressedData);

    // 2. Central Directory File Header (46 bytes + filename.length)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central directory file header signature
    centralHeader.writeUInt16LE(20, 4); // Version made by (2.0)
    centralHeader.writeUInt16LE(20, 6); // Version needed to extract (2.0)
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8 filename flag
    centralHeader.writeUInt16LE(8, 10); // Compression method (Deflate)
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(filenameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30); // Extra field length
    centralHeader.writeUInt16LE(0, 32); // File comment length
    centralHeader.writeUInt16LE(0, 34); // Disk number start
    centralHeader.writeUInt16LE(0, 36); // Internal file attributes
    centralHeader.writeUInt32LE(0x81a40000, 38); // External file attributes (-rw-r--r--)
    centralHeader.writeUInt32LE(currentOffset, 42); // Relative offset of local header

    centralChunks.push(centralHeader, filenameBuffer);

    currentOffset += localHeader.length + filenameBuffer.length + compressedData.length;
  }

  const centralDirBuffer = Buffer.concat(centralChunks);
  const centralDirSize = centralDirBuffer.length;
  const centralDirOffset = currentOffset;

  // 3. End of Central Directory Record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4); // Number of this disk
  eocd.writeUInt16LE(0, 6); // Disk where central directory starts
  eocd.writeUInt16LE(entries.length, 8); // Number of central directory records on this disk
  eocd.writeUInt16LE(entries.length, 10); // Total number of central directory records
  eocd.writeUInt32LE(centralDirSize, 12); // Size of central directory
  eocd.writeUInt32LE(centralDirOffset, 16); // Offset of start of central directory
  eocd.writeUInt16LE(0, 20); // ZIP comment length

  return Buffer.concat([...localChunks, centralDirBuffer, eocd]);
}
