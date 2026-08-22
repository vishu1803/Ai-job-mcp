/**
 * @file Unit Tests for Evidence Linking & Primary Selection Engine (P4-004)
 *
 * Verifies:
 * 1. PrimaryEvidenceSelector deterministic ranking, tier weighting, recency, and tie-breakers
 * 2. Immutability validation blocking mutations to provenance and identifiers
 * 3. EvidenceRefMapper lightweight domain output formatting and secret safety
 * 4. Input contract and trusted context validation
 * 5. Provider-neutral behavior across diverse source providers
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EvidenceLinkingService,
  PrimaryEvidenceSelector,
  EvidenceRefMapper,
} from '../../src/services/evidence/index.js';
import { ValidationError } from '../../src/errors/index.js';

describe('Evidence Linking Engine Unit Tests (P4-004)', () => {
  // -------------------------------------------------------------------------
  // 1. Primary Evidence Selector & Deterministic Ordering
  // -------------------------------------------------------------------------
  describe('1. Primary Evidence Selection Logic', () => {
    it('ranks higher confidence score strictly above lower confidence score', () => {
      const highConf = {
        id: '11111111-1111-1111-1111-111111111111',
        confidenceScore: 1.0,
        evidenceType: 'README_SPECIFICATION',
      };
      const lowConf = {
        id: '22222222-2222-2222-2222-222222222222',
        confidenceScore: 0.6,
        evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
      };

      const comparison = PrimaryEvidenceSelector.compare(highConf, lowConf);
      assert.ok(comparison < 0, 'Higher confidence must rank before lower confidence');
      assert.strictEqual(PrimaryEvidenceSelector.isStrongerPrimary(highConf, lowConf), true);
      assert.strictEqual(PrimaryEvidenceSelector.isStrongerPrimary(lowConf, highConf), false);
    });

    it('ranks higher evidence type tier when confidence scores are equal', () => {
      const manifestEvidence = {
        id: '11111111-1111-1111-1111-111111111111',
        confidenceScore: 0.8,
        evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY', // Tier 4
      };
      const readmeEvidence = {
        id: '22222222-2222-2222-2222-222222222222',
        confidenceScore: 0.8,
        evidenceType: 'README_SPECIFICATION', // Tier 3
      };
      const commitEvidence = {
        id: '33333333-3333-3333-3333-333333333333',
        confidenceScore: 0.8,
        evidenceType: 'COMMIT_CONTRIBUTION', // Tier 2
      };
      const dirEvidence = {
        id: '44444444-4444-4444-4444-444444444444',
        confidenceScore: 0.8,
        evidenceType: 'DIRECTORY_STRUCTURE', // Tier 1
      };

      assert.ok(PrimaryEvidenceSelector.compare(manifestEvidence, readmeEvidence) < 0);
      assert.ok(PrimaryEvidenceSelector.compare(readmeEvidence, commitEvidence) < 0);
      assert.ok(PrimaryEvidenceSelector.compare(commitEvidence, dirEvidence) < 0);
    });

    it('ranks more recent detectedAt timestamp when confidence and tier are identical', () => {
      const newer = {
        id: '11111111-1111-1111-1111-111111111111',
        confidenceScore: 1.0,
        evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
        detectedAt: '2026-08-22T10:00:00Z',
      };
      const older = {
        id: '22222222-2222-2222-2222-222222222222',
        confidenceScore: 1.0,
        evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
        detectedAt: '2026-08-20T10:00:00Z',
      };

      assert.ok(PrimaryEvidenceSelector.compare(newer, older) < 0);
      assert.strictEqual(PrimaryEvidenceSelector.isStrongerPrimary(newer, older), true);
    });

    it('uses deterministic UUID lexical tie-breaker when all other attributes match', () => {
      const a = {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        confidenceScore: 1.0,
        evidenceType: 'CODE_IMPORT_USAGE',
        detectedAt: '2026-08-22T10:00:00Z',
      };
      const b = {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        confidenceScore: 1.0,
        evidenceType: 'CODE_IMPORT_USAGE',
        detectedAt: '2026-08-22T10:00:00Z',
      };

      assert.ok(PrimaryEvidenceSelector.compare(a, b) < 0);
      assert.ok(PrimaryEvidenceSelector.compare(b, a) > 0);
    });

    it('selectBestPrimary returns the highest ranking item from an array', () => {
      const items = [
        { id: '1', confidenceScore: 0.5, evidenceType: 'COMMIT_CONTRIBUTION' },
        { id: '2', confidenceScore: 1.0, evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY' },
        { id: '3', confidenceScore: 0.8, evidenceType: 'README_SPECIFICATION' },
      ];

      const best = PrimaryEvidenceSelector.selectBestPrimary(items);
      assert.ok(best);
      assert.strictEqual(best.id, '2');
      assert.strictEqual(best.confidenceScore, 1.0);
    });

    it('selectBestPrimary returns null for empty or invalid array', () => {
      assert.strictEqual(PrimaryEvidenceSelector.selectBestPrimary([]), null);
      assert.strictEqual(PrimaryEvidenceSelector.selectBestPrimary(null), null);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Immutability Guard
  // -------------------------------------------------------------------------
  describe('2. Immutability Enforcement', () => {
    it('rejects attempts to mutate id (EvidenceId)', () => {
      assert.throws(
        () => EvidenceLinkingService.validateImmutability({ id: 'new-uuid' }),
        (err) => err instanceof ValidationError && err.message.includes('id')
      );
    });

    it('rejects attempts to mutate tenantId or candidateId', () => {
      assert.throws(
        () => EvidenceLinkingService.validateImmutability({ tenantId: 'hacked-tenant' }),
        (err) => err instanceof ValidationError && err.message.includes('tenantId')
      );
      assert.throws(
        () => EvidenceLinkingService.validateImmutability({ candidate_id: 'hacked-cand' }),
        (err) => err instanceof ValidationError && err.message.includes('candidate_id')
      );
    });

    it('rejects attempts to mutate resourceId or sourceProvider', () => {
      assert.throws(
        () => EvidenceLinkingService.validateImmutability({ resourceId: 'other-repo' }),
        (err) => err instanceof ValidationError && err.message.includes('resourceId')
      );
      assert.throws(
        () => EvidenceLinkingService.validateImmutability({ source_provider: 'FORGED_PROVIDER' }),
        (err) => err instanceof ValidationError && err.message.includes('source_provider')
      );
    });

    it('rejects attempts to mutate sourceLocation, excerpt, or fingerprint', () => {
      assert.throws(
        () =>
          EvidenceLinkingService.validateImmutability({ sourceLocation: { filePath: 'altered' } }),
        (err) => err instanceof ValidationError && err.message.includes('sourceLocation')
      );
      assert.throws(
        () => EvidenceLinkingService.validateImmutability({ excerpt: 'altered excerpt' }),
        (err) => err instanceof ValidationError && err.message.includes('excerpt')
      );
      assert.throws(
        () => EvidenceLinkingService.validateImmutability({ fingerprint: 'altered-hash' }),
        (err) => err instanceof ValidationError && err.message.includes('fingerprint')
      );
    });

    it('permits safe mutable fields without throwing', () => {
      assert.doesNotThrow(() => {
        EvidenceLinkingService.validateImmutability({
          skillId: 'uuid',
          projectId: 'uuid',
          confidenceScore: 0.9,
          detectedAt: new Date(),
          metadata: { note: 'verified' },
        });
      });
    });
  });

  // -------------------------------------------------------------------------
  // 3. Evidence Reference Mapping & Node Normalization
  // -------------------------------------------------------------------------
  describe('3. Evidence Reference Mapper', () => {
    it('formats lightweight EvidenceRef omitting large payloads', () => {
      const rawDbRow = {
        id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        tenantId: '11111111-1111-1111-1111-111111111111',
        candidateId: '22222222-2222-2222-2222-222222222222',
        resourceId: '33333333-3333-3333-3333-333333333333',
        evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
        sourceProvider: 'GITHUB_APP',
        sourceLocation: {
          filePath: 'package.json',
          commitSha: '5017539ddb5d8d616b5fbfa2682dba7d4910b039',
          lineRange: { start: 10, end: 10 },
        },
        excerpt: '"fastify": "^5.2.0"',
        confidenceScore: 1.0,
        detectedAt: new Date('2026-08-22T08:00:00Z'),
        metadata: { fingerprint: 'b73a216...' },
      };

      const ref = EvidenceRefMapper.toEvidenceRef(rawDbRow, 'VERIFIED');
      assert.strictEqual(ref.evidenceId, rawDbRow.id);
      assert.strictEqual(ref.evidenceType, 'PACKAGE_MANIFEST_DEPENDENCY');
      assert.strictEqual(ref.sourceProvider, 'GITHUB_APP');
      assert.strictEqual(ref.resourceId, rawDbRow.resourceId);
      assert.strictEqual(ref.filePath, 'package.json');
      assert.strictEqual(ref.commitSha, '5017539ddb5d8d616b5fbfa2682dba7d4910b039');
      assert.deepStrictEqual(ref.lineRange, { start: 10, end: 10 });
      assert.strictEqual(ref.confidenceScore, 1.0);
      assert.strictEqual(ref.provenanceStatus, 'VERIFIED');
      assert.strictEqual(ref.detectedAt, '2026-08-22T08:00:00.000Z');
      // Must not contain excerpt or raw metadata in lightweight reference
      assert.strictEqual(ref.excerpt, undefined);
      assert.strictEqual(ref.metadata, undefined);
    });

    it('formats detailed EvidenceNode including excerpt and source location', () => {
      const rawDbRow = {
        id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        tenantId: '11111111-1111-1111-1111-111111111111',
        candidateId: '22222222-2222-2222-2222-222222222222',
        resourceId: '33333333-3333-3333-3333-333333333333',
        projectId: '44444444-4444-4444-4444-444444444444',
        skillId: '55555555-5555-5555-5555-555555555555',
        evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
        sourceProvider: 'GITHUB_APP',
        sourceLocation: {
          filePath: 'package.json',
          commitSha: '5017539ddb5d8d616b5fbfa2682dba7d4910b039',
        },
        excerpt: '"fastify": "^5.2.0"',
        confidenceScore: 1.0,
        detectedAt: new Date('2026-08-22T08:00:00Z'),
        createdAt: new Date('2026-08-22T08:00:00Z'),
        metadata: { fingerprint: 'b73a216...' },
      };

      const node = EvidenceRefMapper.toEvidenceNode(rawDbRow);
      assert.strictEqual(node.evidenceId, rawDbRow.id);
      assert.strictEqual(node.projectId, rawDbRow.projectId);
      assert.strictEqual(node.skillId, rawDbRow.skillId);
      assert.strictEqual(node.excerpt, '"fastify": "^5.2.0"');
    });

    it('returns null safely when given null input', () => {
      assert.strictEqual(EvidenceRefMapper.toEvidenceRef(null), null);
      assert.strictEqual(EvidenceRefMapper.toEvidenceNode(null), null);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Input Contract & Trusted Context Validation
  // -------------------------------------------------------------------------
  describe('4. Input Contract & Security Validation', () => {
    const service = new EvidenceLinkingService();

    it('rejects getEvidenceById when context or tenantId is missing', async () => {
      await assert.rejects(
        async () => {
          await service.getEvidenceById({
            context: null,
            candidateId: 'cand-1',
            evidenceId: 'ev-1',
          });
        },
        (err) => err instanceof ValidationError && err.message.includes('tenantId')
      );
    });

    it('rejects linkEvidenceToSkill when neither skillId nor skillSlug is provided', async () => {
      await assert.rejects(
        async () => {
          await service.linkEvidenceToSkill({
            context: { tenantId: 'tenant-1' },
            candidateId: 'cand-1',
            evidenceId: 'ev-1',
          });
        },
        (err) => err instanceof ValidationError && err.message.includes('skillId or skillSlug')
      );
    });

    it('rejects linkEvidenceToProject when projectId is missing', async () => {
      await assert.rejects(
        async () => {
          await service.linkEvidenceToProject({
            context: { tenantId: 'tenant-1' },
            candidateId: 'cand-1',
            evidenceId: 'ev-1',
            projectId: null,
          });
        },
        (err) => err instanceof ValidationError && err.message.includes('projectId')
      );
    });
  });
});
