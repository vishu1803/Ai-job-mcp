/**
 * @file Unit Tests for Backup Export, Envelope Encryption & Package Integrity (P14-005).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { BackupExportService } from '../../src/services/backup-export.service.js';
import { BackupRestoreService } from '../../src/services/backup-restore.service.js';
import { closeDatabase } from '../../src/db/index.js';
import { SecurityError } from '../../src/errors/index.js';

describe('P14-005: BackupExportService & Envelope Encryption', () => {
  const testKey = 'test-master-encryption-key-for-unit-tests-32b!';
  const wrongKey = 'completely-wrong-master-key-that-should-fail!';
  const testTempDir = path.resolve(process.cwd(), 'storage', 'unit-test-backups');

  before(async () => {
    await fs.mkdir(testTempDir, { recursive: true });
  });

  after(async () => {
    await closeDatabase();
    try {
      await fs.rm(testTempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should correctly encrypt and decrypt a plaintext payload using AES-256-GCM envelope', () => {
    const service = new BackupExportService({ masterKey: testKey });
    const plaintext = Buffer.from('CONFIDENTIAL_DATABASE_DUMP_PAYLOAD_DATA', 'utf-8');

    const encrypted = service.encryptBuffer(plaintext);
    assert.ok(Buffer.isBuffer(encrypted.encryptedBuffer));
    assert.ok(encrypted.encryptedBuffer.length > plaintext.length);
    assert.equal(typeof encrypted.iv, 'string');
    assert.equal(typeof encrypted.authTag, 'string');

    // Decrypt with same key
    const decrypted = service.decryptBuffer(encrypted.encryptedBuffer);
    assert.equal(decrypted.toString('utf-8'), plaintext.toString('utf-8'));
  });

  it('should fail decryption if an incorrect master key is used', () => {
    const service1 = new BackupExportService({ masterKey: testKey });
    const service2 = new BackupExportService({ masterKey: wrongKey });
    const plaintext = Buffer.from('CRITICAL_USER_IDENTITIES_AND_SECRETS', 'utf-8');

    const encrypted = service1.encryptBuffer(plaintext);

    assert.throws(
      () => {
        service2.decryptBuffer(encrypted.encryptedBuffer);
      },
      (err) => {
        assert.ok(err instanceof SecurityError);
        assert.equal(err.code, 'DECRYPTION_FAILED');
        return true;
      }
    );
  });

  it('should reject tampered or corrupted ciphertext payloads', () => {
    const service = new BackupExportService({ masterKey: testKey });
    const plaintext = Buffer.from('AUTHENTIC_PAYLOAD_UNALTERED', 'utf-8');
    const { encryptedBuffer } = service.encryptBuffer(plaintext);

    // Corrupt one byte of ciphertext (after IV and authTag)
    const tampered = Buffer.from(encryptedBuffer);
    tampered[tampered.length - 1] ^= 0xff;

    assert.throws(
      () => {
        service.decryptBuffer(tampered);
      },
      (err) => {
        assert.ok(err instanceof SecurityError);
        assert.equal(err.code, 'DECRYPTION_FAILED');
        return true;
      }
    );
  });

  it('should reject payloads shorter than minimum envelope header (IV + AuthTag)', () => {
    const service = new BackupExportService({ masterKey: testKey });
    const truncated = Buffer.from('too-short-to-be-an-envelope');

    assert.throws(
      () => {
        service.decryptBuffer(truncated);
      },
      (err) => {
        assert.ok(err instanceof SecurityError);
        assert.equal(err.code, 'INVALID_ENVELOPE');
        return true;
      }
    );
  });

  it('should verify package manifest integrity and detect missing or modified files', async () => {
    const exportService = new BackupExportService({ masterKey: testKey });
    const restoreService = new BackupRestoreService({ masterKey: testKey });

    const backupRes = await exportService.exportBackupPackage(testTempDir, {
      backupId: `pkg-unit-test-${Date.now()}`,
    });

    // 1. Verify pristine package passes integrity check
    const verifiedManifest = await restoreService.verifyPackageIntegrity(backupRes.packagePath);
    assert.equal(verifiedManifest.backupId, backupRes.backupId);
    assert.equal(verifiedManifest.keyVersion, 'v1');
    assert.equal(verifiedManifest.encryptionAlgorithm, 'aes-256-gcm');

    // 2. Corrupt one file in the package and verify checksum failure
    const dumpPath = path.join(backupRes.packagePath, 'database', 'database.dump.enc');
    await fs.appendFile(dumpPath, Buffer.from('TAMPERED_APPENDED_BYTES'));

    await assert.rejects(
      async () => {
        await restoreService.verifyPackageIntegrity(backupRes.packagePath);
      },
      (err) => {
        assert.ok(err instanceof SecurityError);
        assert.equal(err.code, 'CHECKSUM_MISMATCH');
        return true;
      }
    );
  });
});
