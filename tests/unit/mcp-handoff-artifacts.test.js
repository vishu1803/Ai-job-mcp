/**
 * @file Unit tests for the shared MCP handoff-kit artifact enrichment helper.
 *
 * Regression coverage: the public ChatGPT MCP acceptance test failed because
 * `get_job_application` returned `tailoredDocuments: []` while the encrypted
 * resume / TAILORED_COVER_LETTER artifacts existed in `metadata.handoffKit`.
 * These tests lock in that BOTH inspection paths share one verified
 * enrichment helper and that unverified artifacts are never exposed.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getVerifiedHandoffDocuments } from '../../src/mcp/tools/handoff-artifacts.js';

function makeArtifact(overrides = {}) {
  const bytes = Buffer.from('fake-encrypted-pdf-bytes');
  return {
    filename: 'tailored-resume.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: bytes.length,
    contentHash: crypto.createHash('sha256').update(bytes).digest('hex'),
    storageKey: 'storage/tenant/app/resume.enc',
    status: 'READY',
    qaAudit: { passed: true, score: 92 },
    viewUrl: '/api/applications/app-1/artifacts/resume/view',
    downloadUrl: '/api/applications/app-1/artifacts/resume/download',
    ...overrides,
  };
}

function makeApplication(overrides = {}) {
  return {
    id: 'app-1',
    tenantId: 'tenant-1',
    candidateId: 'candidate-1',
    status: 'SAVED',
    metadata: {
      handoffKit: {
        applicationId: 'app-1',
        generatedAt: '2026-09-05T12:00:00.000Z',
        resume: makeArtifact(),
        coverLetter: makeArtifact({
          filename: 'tailored-cover-letter.pdf',
          storageKey: 'storage/tenant/app/cover-letter.enc',
          viewUrl: '/api/applications/app-1/artifacts/cover-letter/view',
          downloadUrl: '/api/applications/app-1/artifacts/cover-letter/download',
        }),
      },
    },
    ...overrides,
  };
}

/** Fake DocumentStorageService whose decrypted bytes are configurable. */
function makeStorage() {
  const documentTypeBytes = new Map();
  const errors = new Map();
  return {
    documentTypeBytes,
    errors,
    getDecryptedDocument: async ({ storageKey }) => {
      if (errors.has(storageKey)) throw errors.get(storageKey);
      return documentTypeBytes.get(storageKey) ?? Buffer.from('fake-encrypted-pdf-bytes');
    },
  };
}

describe('getVerifiedHandoffDocuments (shared MCP handoff artifact enrichment)', () => {
  it('exposes TAILORED_RESUME and TAILORED_COVER_LETTER from metadata.handoffKit with View/Download references', async () => {
    const app = makeApplication();
    const result = await getVerifiedHandoffDocuments(app, [], makeStorage());

    assert.deepEqual(result.map((d) => d.documentType).sort(), [
      'TAILORED_COVER_LETTER',
      'TAILORED_RESUME',
    ]);
    for (const doc of result) {
      assert.equal(doc.applicationId, 'app-1');
      assert.equal(doc.candidateId, 'candidate-1');
      assert.equal(doc.availabilityStatus, 'READY');
      assert.equal(doc.mimeType, 'application/pdf');
      assert.ok(doc.fileSizeBytes > 0);
      assert.ok(doc.viewUrl.startsWith(`/api/applications/${app.id}/artifacts/`));
      assert.ok(doc.downloadUrl.startsWith(`/api/applications/${app.id}/artifacts/`));
      assert.equal(doc.artifactReference, doc.viewUrl);
      assert.equal(doc.storageKey, undefined, 'storageKey must never be exposed');
    }
    assert.equal(
      result.find((d) => d.documentType === 'TAILORED_COVER_LETTER').filename,
      'tailored-cover-letter.pdf'
    );
  });

  it('refuses to expose artifacts when the handoff kit belongs to a different application', async () => {
    const app = makeApplication({
      metadata: {
        handoffKit: {
          applicationId: 'SOME_OTHER_APP',
          resume: makeArtifact(),
          coverLetter: makeArtifact(),
        },
      },
    });
    const result = await getVerifiedHandoffDocuments(app, [], makeStorage());
    assert.deepEqual(result, []);
  });

  it('does not expose an artifact whose decrypted bytes fail hash or size verification', async () => {
    const app = makeApplication();
    const storage = makeStorage();
    const resumeKey = app.metadata.handoffKit.resume.storageKey;
    storage.documentTypeBytes.set(
      resumeKey,
      Buffer.from('TAMPERED-BYTES-WITH-DIFFERENT-HASH-AND-LENGTH')
    );

    const result = await getVerifiedHandoffDocuments(app, [], storage);
    const types = result.map((d) => d.documentType);
    assert.ok(!types.includes('TAILORED_RESUME'), 'tampered resume must not be exposed');
    assert.ok(
      types.includes('TAILORED_COVER_LETTER'),
      'untampered cover letter must still be exposed'
    );
  });

  it('does not expose an artifact when decryption fails', async () => {
    const app = makeApplication();
    const storage = makeStorage();
    const resumeKey = app.metadata.handoffKit.resume.storageKey;
    storage.errors.set(resumeKey, new Error('decryption failed: authentication tag mismatch'));

    const result = await getVerifiedHandoffDocuments(app, [], storage);
    const types = result.map((d) => d.documentType);
    assert.ok(!types.includes('TAILORED_RESUME'), 'undecryptable resume must not be exposed');
    assert.ok(types.includes('TAILORED_COVER_LETTER'));
  });

  it('prefers an existing tailored_documents row metadata.artifact reference and preserves its identity', async () => {
    const app = makeApplication();
    const kit = app.metadata.handoffKit;
    const existingRows = [
      {
        id: 'row-resume-id',
        documentType: 'TAILORED_RESUME',
        version: 3,
        title: 'Row title wins',
        contentHash: kit.resume.contentHash,
        citationRefs: ['c1', 'c2'],
        integrityScore: 90,
        atsFitScore: 88,
        createdAt: new Date('2026-09-05T10:00:00.000Z'),
        metadata: { artifact: kit.resume },
      },
    ];
    const result = await getVerifiedHandoffDocuments(app, existingRows, makeStorage());
    const resume = result.find((d) => d.documentType === 'TAILORED_RESUME');
    assert.equal(resume.id, 'row-resume-id');
    assert.equal(resume.version, 3);
    assert.equal(resume.title, 'Row title wins');
    assert.equal(resume.citationRefsCount, 2);
    assert.equal(resume.atsFitScore, 88);
    assert.equal(resume.viewUrl, kit.resume.viewUrl);
  });

  it('marks artifacts BLOCKED when qaAudit has not passed and no explicit status exists', async () => {
    const app = makeApplication();
    const kit = app.metadata.handoffKit;
    kit.resume = makeArtifact({ status: undefined, qaAudit: { passed: false } });
    const result = await getVerifiedHandoffDocuments(app, [], makeStorage());
    const resume = result.find((d) => d.documentType === 'TAILORED_RESUME');
    assert.equal(resume.availabilityStatus, 'BLOCKED');
    assert.equal(resume.integrityScore, null);
  });

  it('returns existing documents untouched when there is no handoff kit', async () => {
    const app = { id: 'app-2', tenantId: 'tenant-1', candidateId: 'candidate-1', metadata: {} };
    const rows = [
      {
        id: 'row-1',
        documentType: 'PORTFOLIO_RECOMMENDATION',
        version: 1,
        title: 'Portfolio',
        contentHash: 'a'.repeat(64),
        citationRefs: [],
        integrityScore: null,
        atsFitScore: null,
        createdAt: new Date('2026-09-05T10:00:00.000Z'),
        metadata: {},
      },
    ];
    const result = await getVerifiedHandoffDocuments(app, rows, makeStorage());
    assert.equal(result.length, 1);
    assert.equal(result[0].documentType, 'PORTFOLIO_RECOMMENDATION');
    assert.equal(result[0].viewUrl, undefined);
  });

  it('does not fall back to an unscoped historical document when a current package exists', async () => {
    const currentPackageHash = 'b'.repeat(64);
    const app = makeApplication({
      metadata: {
        currentPackageHash,
        handoffKit: {
          applicationId: 'app-1',
          packageHash: 'a'.repeat(64),
          resume: makeArtifact(),
          coverLetter: makeArtifact({ filename: 'tailored-cover-letter.pdf' }),
        },
      },
    });
    const historicalRows = [
      {
        id: 'historical-resume',
        documentType: 'TAILORED_RESUME',
        version: 1,
        title: 'Historical resume',
        contentHash: 'c'.repeat(64),
        citationRefs: [],
        metadata: {},
      },
    ];

    const result = await getVerifiedHandoffDocuments(app, historicalRows, makeStorage(), {
      currentPackageHash,
    });

    assert.deepEqual(result, [], 'historical unscoped data and stale kit artifacts must be hidden');
  });

  it('uses current package Markdown hashes while exposing the verified PDF hash separately', async () => {
    const resumeMarkdownHash = 'c'.repeat(64);
    const coverLetterMarkdownHash = 'd'.repeat(64);
    const currentPackageHash = 'e'.repeat(64);
    const app = makeApplication({
      metadata: {
        handoffKit: {
          applicationId: 'app-1',
          packageHash: currentPackageHash,
          resume: makeArtifact(),
          coverLetter: makeArtifact({ filename: 'tailored-cover-letter.pdf' }),
        },
      },
    });

    const result = await getVerifiedHandoffDocuments(app, [], makeStorage(), {
      currentPackageHash,
      packageVersion: 3,
      resumeContentHash: resumeMarkdownHash,
      coverLetterContentHash: coverLetterMarkdownHash,
    });

    const resume = result.find((document) => document.documentType === 'TAILORED_RESUME');
    const coverLetter = result.find(
      (document) => document.documentType === 'TAILORED_COVER_LETTER'
    );
    assert.equal(resume.contentHash, resumeMarkdownHash);
    assert.equal(coverLetter.contentHash, coverLetterMarkdownHash);
    assert.equal(resume.pdfContentHash, app.metadata.handoffKit.resume.contentHash);
    assert.equal(coverLetter.pdfContentHash, app.metadata.handoffKit.coverLetter.contentHash);
    assert.equal(resume.packageHash, currentPackageHash);
    assert.equal(coverLetter.packageHash, currentPackageHash);
    assert.equal(resume.packageVersion, 3);
    assert.equal(coverLetter.packageVersion, 3);
  });

  describe('QA metadata exposure and storage isolation regression', () => {
    it('exposes qaScore and qaPassed for both TAILORED_RESUME and TAILORED_COVER_LETTER when persisted', async () => {
      const app = makeApplication({
        metadata: {
          handoffKit: {
            applicationId: 'app-1',
            packageHash: 'f'.repeat(64),
            resume: makeArtifact({
              qaAudit: { passed: true, score: 98 },
            }),
            coverLetter: makeArtifact({
              filename: 'tailored-cover-letter.pdf',
              qaAudit: { passed: true, score: 95 },
            }),
          },
        },
      });

      const result = await getVerifiedHandoffDocuments(app, [], makeStorage(), {
        currentPackageHash: 'f'.repeat(64),
      });

      assert.equal(result.length, 2);
      const resume = result.find((d) => d.documentType === 'TAILORED_RESUME');
      const coverLetter = result.find((d) => d.documentType === 'TAILORED_COVER_LETTER');

      // Both documents expose qaScore and qaPassed
      assert.equal(resume.qaScore, 98);
      assert.equal(resume.qaPassed, true);
      assert.equal(coverLetter.qaScore, 95);
      assert.equal(coverLetter.qaPassed, true);
    });

    it('strictly prevents sensitive storage fields from leaking in tailoredDocuments', async () => {
      const app = makeApplication();
      const existingRows = [
        {
          id: 'doc-resume-id',
          documentType: 'TAILORED_RESUME',
          version: 1,
          title: 'Resume Title',
          content: { markdownContent: '...', packageHash: '...' },
          renderedMarkdown: '# Secret Markdown',
          ciphertext: 'raw-encrypted-bytes-that-should-never-leak',
          metadata: {
            storageKey: 'tenants/t1/secret-storage-key.enc',
            texStorageKey: 'tenants/t1/secret-tex.enc',
            artifact: {
              ...app.metadata.handoffKit.resume,
              storageKey: 'tenants/t1/nested-storage-key.enc',
              texStorageKey: 'tenants/t1/nested-tex.enc',
            },
          },
        },
      ];

      const result = await getVerifiedHandoffDocuments(app, existingRows, makeStorage());

      for (const doc of result) {
        // Assert sensitive storage keys and payloads never leak
        assert.equal(doc.storageKey, undefined, 'storageKey must never leak');
        assert.equal(doc.texStorageKey, undefined, 'texStorageKey must never leak');
        assert.equal(doc.ciphertext, undefined, 'ciphertext must never leak');
        assert.equal(doc.metadata, undefined, 'internal metadata object must never leak');
        assert.equal(doc.content, undefined, 'raw database content object must never leak');
        assert.equal(doc.renderedMarkdown, undefined, 'renderedMarkdown must never leak');

        // Verify public fields are present
        assert.ok(doc.documentType);
        assert.ok(doc.availabilityStatus);
        assert.ok(doc.viewUrl);
        assert.ok(doc.downloadUrl);
        assert.equal(typeof doc.qaScore, 'number');
        assert.equal(typeof doc.qaPassed, 'boolean');
      }
    });
  });
});
