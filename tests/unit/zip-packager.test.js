import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createZipArchive, computeCrc32 } from '../../src/utils/zip-packager.js';

describe('Zip Packager (P15-001)', () => {
  it('computes accurate CRC-32 checksums', () => {
    const data = Buffer.from('hello world', 'utf8');
    const crc = computeCrc32(data);
    assert.equal(typeof crc, 'number');
    assert.ok(crc > 0);
    // Known CRC32 for "hello world" is 0x0D4A1185 (222957957)
    assert.equal(crc, 222957957);
  });

  it('creates valid ZIP archive buffer with multiple files', () => {
    const entries = [
      { name: 'resume.pdf', data: Buffer.from('%PDF-1.5 fake resume content', 'utf8') },
      { name: 'cover-letter.pdf', data: Buffer.from('%PDF-1.5 fake cover letter content', 'utf8') },
      { name: 'manifest.json', data: JSON.stringify({ packageHash: 'abc123' }, null, 2) },
    ];

    const zipBuffer = createZipArchive(entries);
    assert.ok(Buffer.isBuffer(zipBuffer));
    assert.ok(zipBuffer.length > 100);

    // Verify ZIP magic signature (PK\x03\x04)
    assert.equal(zipBuffer[0], 0x50);
    assert.equal(zipBuffer[1], 0x4b);
    assert.equal(zipBuffer[2], 0x03);
    assert.equal(zipBuffer[3], 0x04);

    // Verify filenames are present in the central directory or headers
    const zipString = zipBuffer.toString('utf8');
    assert.ok(zipString.includes('resume.pdf'));
    assert.ok(zipString.includes('cover-letter.pdf'));
    assert.ok(zipString.includes('manifest.json'));
  });
});
