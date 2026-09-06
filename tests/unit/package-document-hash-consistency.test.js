/**
 * @file Package Document Hash Consistency Tests (P14-005BC)
 *
 * Proves the critical invariant:
 *   prepare_job_application().tailoredResume.contentHash
 *     === get_job_application().tailoredDocuments[RESUME].contentHash
 *
 * Root cause of the original bug:
 * - prepare_job_application returns SHA256(markdownContent) — Markdown-only hash
 * - tailored_documents.contentHash stores SHA256({markdownContent, packageHash}) — Object hash
 * - get_job_application was falling back to the wrong hash type
 *
 * The fix ensures:
 * 1. application_packages stores the correct Markdown-only hashes
 * 2. handoff-artifacts.js uses authoritative hashes from currentPackage
 * 3. metadata.markdownContentHash is stored for legacy fallback
 * 4. contentHash in MCP output always matches prepare_job_application output
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getVerifiedHandoffDocuments } from '../../src/mcp/tools/handoff-artifacts.js';

/**
 * Simulates the hash computation in candidate-artifact-content.service.js
 * This is the AUTHORITATIVE hash that prepare_job_application returns.
 */
function computeMarkdownContentHash(markdownContent) {
  return crypto.createHash('sha256').update(markdownContent, 'utf8').digest('hex');
}

/**
 * Simulates the hash computation in application-state-machine.js
 * This is what tailored_documents.contentHash stores (WRONG for our invariant).
 */
function computeDocumentContentHash(content) {
  const sortObjectKeys = (value) => {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(sortObjectKeys);
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortObjectKeys(value[key]);
    }
    return sorted;
  };
  const canonicalJson = JSON.stringify(sortObjectKeys(content));
  return crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
}

/**
 * Simulates the hash computation in document-storage.service.js
 * This is the PDF byte hash stored in handoff kit artifacts.
 */
function computePdfByteHash(pdfBuffer) {
  return crypto.createHash('sha256').update(pdfBuffer).digest('hex');
}

describe('P14-005BC: Package Document Hash Consistency', () => {
  const markdownContent = '# Test Resume\n\nThis is a test resume for hash consistency.';
  const packageHash = 'a'.repeat(64);
  const pdfBuffer = Buffer.from('%PDF-1.4 fake pdf content for testing');

  // These are the three different hash types
  let markdownHash; // What prepare_job_application returns (AUTHORITATIVE)
  let objectHash; // What tailored_documents.contentHash stores (WRONG)
  let pdfHash; // What document-storage stores (for artifact integrity)

  beforeEach(() => {
    markdownHash = computeMarkdownContentHash(markdownContent);
    objectHash = computeDocumentContentHash({ markdownContent, packageHash });
    pdfHash = computePdfByteHash(pdfBuffer);

    // Verify these are all different
    assert.notEqual(markdownHash, objectHash, 'Markdown hash should differ from object hash');
    assert.notEqual(markdownHash, pdfHash, 'Markdown hash should differ from PDF hash');
    assert.notEqual(objectHash, pdfHash, 'Object hash should differ from PDF hash');
  });

  describe('Hash type verification', () => {
    it('should compute different hashes for markdown vs object vs PDF', () => {
      // This test documents the root cause of the original bug
      assert.equal(markdownHash.length, 64, 'Markdown hash should be 64 hex chars');
      assert.equal(objectHash.length, 64, 'Object hash should be 64 hex chars');
      assert.equal(pdfHash.length, 64, 'PDF hash should be 64 hex chars');

      // All three are different
      const uniqueHashes = new Set([markdownHash, objectHash, pdfHash]);
      assert.equal(uniqueHashes.size, 3, 'All three hash types should be unique');
    });

    it('should produce deterministic markdown hashes', () => {
      const hash1 = computeMarkdownContentHash(markdownContent);
      const hash2 = computeMarkdownContentHash(markdownContent);
      assert.equal(hash1, hash2, 'Same markdown should produce same hash');
    });
  });

  describe('getVerifiedHandoffDocuments with authoritative hashes', () => {
    it('should return authoritative markdown hash when currentPackage provides it', async () => {
      const application = {
        id: 'app-123',
        tenantId: 'tenant-123',
        candidateId: 'cand-123',
        metadata: {
          currentPackageHash: packageHash,
          handoffKit: {
            applicationId: 'app-123',
            packageHash,
            resume: {
              storageKey: 'storage-key-resume',
              contentHash: pdfHash, // PDF byte hash
              fileSizeBytes: pdfBuffer.length,
              filename: 'resume.pdf',
              mimeType: 'application/pdf',
              viewUrl: '/view/resume',
              downloadUrl: '/download/resume',
            },
          },
        },
      };

      const documents = [];

      // Mock artifact storage that returns the PDF buffer
      const mockStorage = {
        getDecryptedDocument: mock.fn(async () => pdfBuffer),
      };

      const result = await getVerifiedHandoffDocuments(application, documents, mockStorage, {
        currentPackageHash: packageHash,
        resumeContentHash: markdownHash, // AUTHORITATIVE from application_packages
        coverLetterContentHash: null,
      });

      assert.equal(result.length, 1, 'Should return one document');
      const resumeDoc = result[0];

      // THE CRITICAL INVARIANT: contentHash must be the markdown hash
      assert.equal(
        resumeDoc.contentHash,
        markdownHash,
        'contentHash MUST be the authoritative markdown hash from currentPackage'
      );

      // pdfContentHash should be the PDF byte hash for artifact integrity
      assert.equal(
        resumeDoc.pdfContentHash,
        pdfHash,
        'pdfContentHash should be the PDF byte hash for integrity verification'
      );

      // Verify they are different
      assert.notEqual(
        resumeDoc.contentHash,
        resumeDoc.pdfContentHash,
        'contentHash and pdfContentHash should be different'
      );
    });

    it('should NOT fall back to existing.contentHash when currentPackage exists', async () => {
      const application = {
        id: 'app-123',
        tenantId: 'tenant-123',
        candidateId: 'cand-123',
        metadata: {
          currentPackageHash: packageHash,
        },
      };

      // Existing document with WRONG hash type (object hash)
      const documents = [
        {
          id: 'doc-123',
          applicationId: 'app-123',
          candidateId: 'cand-123',
          documentType: 'TAILORED_RESUME',
          version: 1,
          title: 'Resume',
          contentHash: objectHash, // WRONG: This is the object hash
          metadata: {
            packageHash,
            // No markdownContentHash stored (legacy row)
          },
        },
      ];

      const mockStorage = {
        getDecryptedDocument: mock.fn(async () => {
          throw new Error('No artifact');
        }),
      };

      const result = await getVerifiedHandoffDocuments(application, documents, mockStorage, {
        currentPackageHash: packageHash,
        resumeContentHash: markdownHash, // AUTHORITATIVE
        coverLetterContentHash: null,
      });

      assert.equal(result.length, 1);
      const resumeDoc = result[0];

      // MUST use authoritative hash, NOT the existing.contentHash
      assert.equal(
        resumeDoc.contentHash,
        markdownHash,
        'Should use authoritative hash from currentPackage, not existing.contentHash'
      );
    });

    it('should use metadata.markdownContentHash as fallback when authoritative is null', async () => {
      const application = {
        id: 'app-123',
        tenantId: 'tenant-123',
        candidateId: 'cand-123',
        metadata: {
          currentPackageHash: packageHash,
        },
      };

      // Document with markdownContentHash in metadata (new format)
      const documents = [
        {
          id: 'doc-123',
          applicationId: 'app-123',
          candidateId: 'cand-123',
          documentType: 'TAILORED_RESUME',
          version: 1,
          title: 'Resume',
          contentHash: objectHash, // WRONG: object hash
          metadata: {
            packageHash,
            markdownContentHash: markdownHash, // CORRECT: stored for fallback
          },
        },
      ];

      const mockStorage = {
        getDecryptedDocument: mock.fn(async () => {
          throw new Error('No artifact');
        }),
      };

      const result = await getVerifiedHandoffDocuments(application, documents, mockStorage, {
        currentPackageHash: packageHash,
        resumeContentHash: null, // Not available from currentPackage
        coverLetterContentHash: null,
      });

      assert.equal(result.length, 1);
      const resumeDoc = result[0];

      // Should use metadata.markdownContentHash as fallback
      assert.equal(
        resumeDoc.contentHash,
        markdownHash,
        'Should use metadata.markdownContentHash when authoritative is null'
      );
    });

    it('should return null contentHash when no authoritative source exists for new packages', async () => {
      const application = {
        id: 'app-123',
        tenantId: 'tenant-123',
        candidateId: 'cand-123',
        metadata: {
          currentPackageHash: packageHash,
        },
      };

      // Legacy document without markdownContentHash
      const documents = [
        {
          id: 'doc-123',
          applicationId: 'app-123',
          candidateId: 'cand-123',
          documentType: 'TAILORED_RESUME',
          version: 1,
          title: 'Resume',
          contentHash: objectHash, // WRONG: object hash
          metadata: {
            packageHash,
            // No markdownContentHash (legacy)
          },
        },
      ];

      const mockStorage = {
        getDecryptedDocument: mock.fn(async () => {
          throw new Error('No artifact');
        }),
      };

      const result = await getVerifiedHandoffDocuments(application, documents, mockStorage, {
        currentPackageHash: packageHash,
        resumeContentHash: null, // Not available
        coverLetterContentHash: null,
      });

      assert.equal(result.length, 1);
      const resumeDoc = result[0];

      // When hasAuthoritativePackage is true but no authoritative hash exists,
      // we should NOT fall back to the wrong hash type
      assert.equal(
        resumeDoc.contentHash,
        null,
        'Should return null rather than wrong hash type when currentPackage exists but has no authoritative hash'
      );
    });
  });

  describe('Legacy application compatibility (no currentPackage)', () => {
    it('should fall back to existing.contentHash for legacy applications without package ledger', async () => {
      const application = {
        id: 'app-123',
        tenantId: 'tenant-123',
        candidateId: 'cand-123',
        metadata: {
          // No currentPackageHash - legacy application
        },
      };

      const documents = [
        {
          id: 'doc-123',
          applicationId: 'app-123',
          candidateId: 'cand-123',
          documentType: 'TAILORED_RESUME',
          version: 1,
          title: 'Resume',
          contentHash: objectHash, // Legacy hash
          metadata: {},
        },
      ];

      const mockStorage = {
        getDecryptedDocument: mock.fn(async () => {
          throw new Error('No artifact');
        }),
      };

      const result = await getVerifiedHandoffDocuments(application, documents, mockStorage, {
        currentPackageHash: null, // No current package
        resumeContentHash: null,
        coverLetterContentHash: null,
      });

      assert.equal(result.length, 1);
      const resumeDoc = result[0];

      // For legacy applications, fall back to existing hash (even if wrong type)
      // This maintains backward compatibility
      assert.equal(
        resumeDoc.contentHash,
        objectHash,
        'Should fall back to existing.contentHash for legacy applications'
      );
    });
  });

  describe('Idempotency and determinism', () => {
    it('should produce identical results for identical inputs', async () => {
      const application = {
        id: 'app-123',
        tenantId: 'tenant-123',
        candidateId: 'cand-123',
        metadata: {
          currentPackageHash: packageHash,
          handoffKit: {
            applicationId: 'app-123',
            packageHash,
            resume: {
              storageKey: 'storage-key-resume',
              contentHash: pdfHash,
              fileSizeBytes: pdfBuffer.length,
              filename: 'resume.pdf',
              mimeType: 'application/pdf',
              viewUrl: '/view/resume',
              downloadUrl: '/download/resume',
            },
          },
        },
      };

      const mockStorage = {
        getDecryptedDocument: mock.fn(async () => pdfBuffer),
      };

      const options = {
        currentPackageHash: packageHash,
        resumeContentHash: markdownHash,
        coverLetterContentHash: null,
      };

      const result1 = await getVerifiedHandoffDocuments(application, [], mockStorage, options);
      const result2 = await getVerifiedHandoffDocuments(application, [], mockStorage, options);

      assert.deepEqual(
        result1[0].contentHash,
        result2[0].contentHash,
        'Repeated calls should produce identical contentHash'
      );
      assert.deepEqual(
        result1[0].pdfContentHash,
        result2[0].pdfContentHash,
        'Repeated calls should produce identical pdfContentHash'
      );
    });
  });
});
