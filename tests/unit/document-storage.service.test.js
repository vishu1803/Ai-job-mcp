/**
 * @file Unit Tests for DocumentStorageService (P13.5-003 / ARCH-052).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { DocumentStorageService } from '../../src/services/document-storage.service.js';
import { SecurityError, ValidationError } from '../../src/errors/index.js';

describe('DocumentStorageService (Unit)', () => {
  let tempDir;
  let storageService;
  const testMasterKey = 'test-encryption-master-key-32bytes!';

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'doc-storage-test-'));
    storageService = new DocumentStorageService({
      storageDir: tempDir,
      masterKey: testMasterKey,
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('encrypts and persists binary buffer returning storageKey, contentHash, and size', async () => {
    const tenantId = '00000000-0000-0000-0000-000000000001';
    const candidateId = '00000000-0000-0000-0000-000000000002';
    const plainBuffer = Buffer.from('Senior Software Engineer Resume Content', 'utf-8');

    const result = await storageService.storeEncryptedDocument({
      tenantId,
      candidateId,
      buffer: plainBuffer,
      originalFileName: 'resume.txt',
      mimeType: 'text/plain',
    });

    assert.ok(result.storageKey);
    assert.equal(typeof result.storageKey, 'string');
    assert.equal(result.fileSizeBytes, plainBuffer.length);

    const expectedHash = crypto.createHash('sha256').update(plainBuffer).digest('hex');
    assert.equal(result.contentHash, expectedHash);

    // Verify file exists on disk in ciphertext
    const storedFile = path.join(tempDir, tenantId, `${result.storageKey}.enc`);
    const rawCiphertext = await fs.readFile(storedFile);
    assert.ok(rawCiphertext.length > plainBuffer.length);
    assert.ok(!rawCiphertext.includes(Buffer.from('Senior Software Engineer')));
  });

  it('decrypts stored document accurately matching original plaintext', async () => {
    const tenantId = 'tenant-alpha';
    const candidateId = 'cand-123';
    const originalText =
      'Distributed Systems Specialist with 8 years experience in Node.js & Postgres';
    const plainBuffer = Buffer.from(originalText, 'utf-8');

    const { storageKey } = await storageService.storeEncryptedDocument({
      tenantId,
      candidateId,
      buffer: plainBuffer,
    });

    const decrypted = await storageService.getDecryptedDocument({
      tenantId,
      storageKey,
    });

    assert.equal(decrypted.toString('utf-8'), originalText);
  });

  it('fails decryption and throws SecurityError if ciphertext is tampered', async () => {
    const tenantId = 'tenant-tamper';
    const plainBuffer = Buffer.from('Confidential CV Data', 'utf-8');

    const { storageKey } = await storageService.storeEncryptedDocument({
      tenantId,
      candidateId: 'cand-1',
      buffer: plainBuffer,
    });

    const storedFile = path.join(tempDir, tenantId, `${storageKey}.enc`);
    const payload = await fs.readFile(storedFile);

    // Corrupt one byte of ciphertext
    payload[payload.length - 1] ^= 0xff;
    await fs.writeFile(storedFile, payload);

    await assert.rejects(
      () => storageService.getDecryptedDocument({ tenantId, storageKey }),
      (err) => err instanceof SecurityError && err.code === 'DECRYPTION_FAILED'
    );
  });

  it('rejects path traversal attempts in tenantId or storageKey', async () => {
    await assert.rejects(
      () => storageService.getDecryptedDocument({ tenantId: '../etc', storageKey: 'passwd' }),
      (err) => err instanceof SecurityError
    );
  });

  it('deletes stored document file', async () => {
    const tenantId = 'tenant-del';
    const { storageKey } = await storageService.storeEncryptedDocument({
      tenantId,
      candidateId: 'cand-1',
      buffer: Buffer.from('To be deleted', 'utf-8'),
    });

    const deleted = await storageService.deleteEncryptedDocument({ tenantId, storageKey });
    assert.equal(deleted, true);

    await assert.rejects(
      () => storageService.getDecryptedDocument({ tenantId, storageKey }),
      (err) => err instanceof ValidationError && err.code === 'DOCUMENT_NOT_FOUND'
    );
  });
});
