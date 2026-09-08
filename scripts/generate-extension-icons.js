/**
 * @file Generate Valid PNG Extension Icons for aicareershub.
 *
 * Generates 16x16, 48x48, and 128x128 PNG files using built-in Node.js buffers and zlib.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { computeCrc32 } from '../src/utils/zip-packager.js';

function createPngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const toCrc = Buffer.concat([typeBuf, data]);
  const crc = computeCrc32(toCrc);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function generateIconPng(size) {
  // PNG Signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR Chunk: width (4), height (4), bit depth (1), color type (6 = RGBA), compression (0), filter (0), interlace (0)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData.writeUInt8(8, 8); // 8-bit depth
  ihdrData.writeUInt8(6, 9); // RGBA
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);
  const ihdr = createPngChunk('IHDR', ihdrData);

  // Scanlines: each row starts with filter byte (0) followed by size * 4 RGBA bytes
  const rowLength = 1 + size * 4;
  const rawScanlines = Buffer.alloc(rowLength * size);

  const radius = size / 2;
  const center = size / 2;

  for (let y = 0; y < size; y++) {
    const rowOffset = y * rowLength;
    rawScanlines.writeUInt8(0, rowOffset); // Filter type 0 (None)

    for (let x = 0; x < size; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius - 0.5) {
        // Deep indigo/navy background: #0f172a / #3b82f6 gradient
        const t = (x + y) / (2 * size);
        const r = Math.round(15 + t * 44); // 15 to 59
        const g = Math.round(23 + t * 107); // 23 to 130
        const b = Math.round(42 + t * 204); // 42 to 246
        const a = 255;

        // Inner emblem/star: in the center 40%
        const isCore = Math.abs(dx) + Math.abs(dy) < radius * 0.45;
        if (isCore) {
          // Bright cyan/white core: #38bdf8
          rawScanlines.writeUInt8(255, pixelOffset);
          rawScanlines.writeUInt8(255, pixelOffset + 1);
          rawScanlines.writeUInt8(255, pixelOffset + 2);
          rawScanlines.writeUInt8(255, pixelOffset + 3);
        } else {
          rawScanlines.writeUInt8(r, pixelOffset);
          rawScanlines.writeUInt8(g, pixelOffset + 1);
          rawScanlines.writeUInt8(b, pixelOffset + 2);
          rawScanlines.writeUInt8(a, pixelOffset + 3);
        }
      } else {
        // Transparent outside circular badge
        rawScanlines.writeUInt8(0, pixelOffset);
        rawScanlines.writeUInt8(0, pixelOffset + 1);
        rawScanlines.writeUInt8(0, pixelOffset + 2);
        rawScanlines.writeUInt8(0, pixelOffset + 3);
      }
    }
  }

  const compressedData = zlib.deflateSync(rawScanlines);
  const idat = createPngChunk('IDAT', compressedData);
  const iend = createPngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

const iconsDir = path.resolve('extension/icons');
fs.mkdirSync(iconsDir, { recursive: true });

for (const size of [16, 48, 128]) {
  const pngBuf = generateIconPng(size);
  const outPath = path.join(iconsDir, `icon-${size}.png`);
  fs.writeFileSync(outPath, pngBuf);
  console.log(`Generated ${outPath} (${pngBuf.length} bytes)`);
}
