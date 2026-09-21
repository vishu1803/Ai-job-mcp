/**
 * @file Unit Tests for Provider-Neutral S3 Storage Provider (P13.5-004).
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { S3StorageProvider } from '../../src/storage/s3-storage.provider.js';
import { DocumentStorageService } from '../../src/services/document-storage.service.js';

describe('S3StorageProvider', () => {
  const masterKey = 'test-master-key-32-chars-length!';

  test('in-memory storage engine: put, get, head, and delete round-trip', async () => {
    const provider = new S3StorageProvider({ inMemory: true });
    const tenantId = 'tenant-alpha';
    const key = 'doc-12345';
    const sampleData = Buffer.from('encrypted-content-sample-data', 'utf-8');

    // 1. Put
    const putResult = await provider.putEncryptedObject({
      tenantId,
      key,
      buffer: sampleData,
      metadata: { originalName: 'resume.pdf' },
    });

    assert.equal(putResult.objectKey, 'tenant-alpha/doc-12345.enc');
    assert.equal(putResult.sizeBytes, sampleData.length);
    assert.ok(putResult.etag);

    // 2. Head (exists)
    const headResult = await provider.headObject({ tenantId, key });
    assert.equal(headResult.exists, true);
    assert.equal(headResult.contentLength, sampleData.length);
    assert.equal(headResult.metadata?.originalName, 'resume.pdf');

    // 3. Get
    const fetched = await provider.getEncryptedObject({ tenantId, key });
    assert.deepEqual(fetched, sampleData);

    // 4. Delete
    const deleted = await provider.deleteObject({ tenantId, key });
    assert.equal(deleted, true);

    // 5. Head (after delete)
    const headAfter = await provider.headObject({ tenantId, key });
    assert.equal(headAfter.exists, false);

    // 6. Get (should throw NotFoundError)
    await assert.rejects(
      async () => provider.getEncryptedObject({ tenantId, key }),
      (err) => err.name === 'NotFoundError'
    );
  });

  test('enforces strict tenant isolation', async () => {
    const provider = new S3StorageProvider({ inMemory: true });
    const payload = Buffer.from('secret-payload', 'utf-8');

    await provider.putEncryptedObject({
      tenantId: 'tenant-1',
      key: 'shared-id',
      buffer: payload,
    });

    // Tenant 1 can read
    const t1 = await provider.getEncryptedObject({ tenantId: 'tenant-1', key: 'shared-id' });
    assert.deepEqual(t1, payload);

    // Tenant 2 cannot read
    await assert.rejects(
      async () => provider.getEncryptedObject({ tenantId: 'tenant-2', key: 'shared-id' }),
      (err) => err.name === 'NotFoundError'
    );
  });

  test('rejects path traversal attempts in coordinates', async () => {
    const provider = new S3StorageProvider({ inMemory: true });
    const payload = Buffer.from('data');

    await assert.rejects(
      async () =>
        provider.putEncryptedObject({ tenantId: '../malicious', key: 'file', buffer: payload }),
      (err) => err.name === 'SecurityError'
    );

    await assert.rejects(
      async () =>
        provider.putEncryptedObject({ tenantId: 't1', key: '../../etc/passwd', buffer: payload }),
      (err) => err.name === 'SecurityError'
    );

    await assert.rejects(
      async () => provider.getEncryptedObject({ tenantId: 't1/foo', key: 'key' }),
      (err) => err.name === 'SecurityError'
    );
  });

  test('AWS SigV4 generates authentic signed headers for HTTP requests', async () => {
    let capturedUrl = '';
    let capturedHeaders = {};
    let capturedMethod = '';

    const mockFetch = async (url, opts) => {
      capturedUrl = url;
      capturedMethod = opts.method;
      capturedHeaders = opts.headers;
      return {
        ok: true,
        status: 200,
        headers: {
          get: (k) => (k.toLowerCase() === 'etag' ? '"mock-etag"' : null),
        },
        text: async () => '',
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    };

    const provider = new S3StorageProvider({
      endpoint: 'https://test-account.r2.cloudflarestorage.com',
      bucketName: 'career-docs',
      region: 'auto',
      accessKeyId: 'TEST_ACCESS_KEY_123',
      secretAccessKey: 'TEST_SECRET_KEY_ABCDEF',
      forcePathStyle: true,
      fetchFn: mockFetch,
    });

    const payload = Buffer.from('binary-content', 'utf-8');
    const result = await provider.putEncryptedObject({
      tenantId: 'tenant-test',
      key: 'resume-doc',
      buffer: payload,
      metadata: { format: 'pdf' },
    });

    assert.equal(result.objectKey, 'tenant-test/resume-doc.enc');
    assert.equal(capturedMethod, 'PUT');
    assert.ok(
      capturedUrl.includes(
        'test-account.r2.cloudflarestorage.com/career-docs/tenant-test/resume-doc.enc'
      )
    );

    // SigV4 assertions
    assert.ok(capturedHeaders['Authorization'], 'Authorization header must be present');
    assert.ok(
      capturedHeaders['Authorization'].startsWith(
        'AWS4-HMAC-SHA256 Credential=TEST_ACCESS_KEY_123/'
      )
    );
    assert.ok(capturedHeaders['Authorization'].includes('SignedHeaders='));
    assert.ok(capturedHeaders['Authorization'].includes('Signature='));
    assert.ok(capturedHeaders['x-amz-date'], 'x-amz-date must be present');
    assert.ok(capturedHeaders['x-amz-content-sha256'], 'x-amz-content-sha256 must be present');
    assert.equal(capturedHeaders['x-amz-meta-format'], 'pdf');
  });

  test('health check returns healthy in memory mode', async () => {
    const provider = new S3StorageProvider({ inMemory: true });
    const health = await provider.checkHealth();
    assert.equal(health.status, 'HEALTHY');
    assert.equal(health.provider, 'IN_MEMORY_S3_COMPATIBLE');
  });

  test('DocumentStorageService integration with S3StorageProvider: end-to-end client-side encryption', async () => {
    const s3Provider = new S3StorageProvider({ inMemory: true });
    const docService = new DocumentStorageService({
      masterKey,
      s3Provider,
    });

    const tenantId = 'tenant-xyz';
    const plainResume = Buffer.from(
      'John Doe - Senior Software Engineer\nBuilt high-scale distributed systems.',
      'utf-8'
    );

    // 1. Store encrypted document
    const { storageKey, contentHash, fileSizeBytes } = await docService.storeEncryptedDocument({
      tenantId,
      buffer: plainResume,
    });

    assert.ok(storageKey);
    assert.equal(fileSizeBytes, plainResume.length);
    assert.ok(contentHash);

    // 2. Verify document in raw S3 storage is encrypted (ciphertext != plaintext)
    const rawCiphertext = await s3Provider.getEncryptedObject({ tenantId, key: storageKey });
    assert.notDeepEqual(rawCiphertext, plainResume);
    assert.ok(rawCiphertext.length > plainResume.length); // includes 12B IV + 16B AuthTag

    // 3. Verify hasEncryptedDocument
    const exists = await docService.hasEncryptedDocument({ tenantId, storageKey });
    assert.equal(exists, true);

    // 4. Decrypt and verify exact match
    const decrypted = await docService.getDecryptedDocument({ tenantId, storageKey });
    assert.deepEqual(decrypted, plainResume);

    // 5. Delete
    const deleted = await docService.deleteEncryptedDocument({ tenantId, storageKey });
    assert.equal(deleted, true);

    const existsAfter = await docService.hasEncryptedDocument({ tenantId, storageKey });
    assert.equal(existsAfter, false);
  });
});
