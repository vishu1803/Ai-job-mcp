/**
 * @file Unit Tests for CandidateRepositoryIngestionService
 *
 * Tests the repository sync pipeline orchestration, project genesis,
 * evidence linking, and skill rollup recalculation using mock connectors
 * and an in-memory database approach where possible.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CandidateRepositoryIngestionService } from '../../src/services/candidate-repository-ingestion.service.js';

describe('CandidateRepositoryIngestionService', () => {
  describe('constructor', () => {
    it('should initialize with default dependencies', () => {
      const service = new CandidateRepositoryIngestionService();
      assert.ok(service.db, 'should have a db instance');
      assert.ok(service.registry, 'should have a connector registry');
      assert.ok(service.extractor, 'should have an evidence extractor');
    });

    it('should accept custom dependencies via options', () => {
      const mockDb = { select: () => {} };
      const mockRegistry = { get: () => {} };
      const mockExtractor = { extractRepositoryEvidence: () => {} };

      const service = new CandidateRepositoryIngestionService({
        db: mockDb,
        registry: mockRegistry,
        extractor: mockExtractor,
      });

      assert.strictEqual(service.db, mockDb);
      assert.strictEqual(service.registry, mockRegistry);
      assert.strictEqual(service.extractor, mockExtractor);
    });
  });

  describe('_deriveProjectSlug', () => {
    it('should convert repository name to lowercase slug', () => {
      const service = new CandidateRepositoryIngestionService();
      assert.strictEqual(service._deriveProjectSlug('Ai-job-mcp'), 'ai-job-mcp');
    });

    it('should replace non-alphanumeric characters with hyphens', () => {
      const service = new CandidateRepositoryIngestionService();
      assert.strictEqual(service._deriveProjectSlug('my_repo.name'), 'my-repo-name');
    });

    it('should collapse consecutive hyphens', () => {
      const service = new CandidateRepositoryIngestionService();
      assert.strictEqual(service._deriveProjectSlug('a---b---c'), 'a-b-c');
    });

    it('should strip leading and trailing hyphens', () => {
      const service = new CandidateRepositoryIngestionService();
      assert.strictEqual(service._deriveProjectSlug('-leading-trailing-'), 'leading-trailing');
    });

    it('should handle simple names', () => {
      const service = new CandidateRepositoryIngestionService();
      assert.strictEqual(service._deriveProjectSlug('myproject'), 'myproject');
    });
  });

  describe('_buildProjectSummary', () => {
    it('should build summary from resource metadata', () => {
      const service = new CandidateRepositoryIngestionService();
      const resource = {
        metadata: { description: 'A career platform', language: 'JavaScript' },
        url: 'https://github.com/user/repo',
      };
      const summary = service._buildProjectSummary(resource);
      assert.ok(summary.includes('A career platform'));
      assert.ok(summary.includes('JavaScript'));
      assert.ok(summary.includes('https://github.com/user/repo'));
    });

    it('should return null when no metadata available', () => {
      const service = new CandidateRepositoryIngestionService();
      const resource = { metadata: {} };
      const summary = service._buildProjectSummary(resource);
      assert.strictEqual(summary, null);
    });

    it('should handle partial metadata', () => {
      const service = new CandidateRepositoryIngestionService();
      const resource = {
        metadata: { description: 'Test project' },
      };
      const summary = service._buildProjectSummary(resource);
      assert.ok(summary.includes('Test project'));
    });
  });

  describe('_buildSummary', () => {
    it('should produce a valid zero-state summary', () => {
      const service = new CandidateRepositoryIngestionService();
      const summary = service._buildSummary({
        startTime: Date.now() - 100,
        warnings: ['No resources found'],
      });

      assert.strictEqual(summary.repositoriesProcessed, 0);
      assert.strictEqual(summary.projectsCreated, 0);
      assert.strictEqual(summary.projectsUpdated, 0);
      assert.strictEqual(summary.evidenceCreated, 0);
      assert.strictEqual(summary.evidenceLinked, 0);
      assert.strictEqual(summary.verifiedSkillsAdded, 0);
      assert.deepStrictEqual(summary.verifiedSkills, []);
      assert.deepStrictEqual(summary.warnings, ['No resources found']);
      assert.ok(summary.durationMs >= 0);
    });

    it('should produce empty warnings by default', () => {
      const service = new CandidateRepositoryIngestionService();
      const summary = service._buildSummary({ startTime: Date.now() });
      assert.deepStrictEqual(summary.warnings, []);
    });
  });

  describe('syncCandidateRepositories - validation', () => {
    it('should reject missing context', async () => {
      const service = new CandidateRepositoryIngestionService();
      await assert.rejects(
        () => service.syncCandidateRepositories({ context: null, candidateId: 'abc' }),
        (err) => {
          assert.ok(err.message.includes('tenantId'));
          return true;
        }
      );
    });

    it('should reject missing candidateId', async () => {
      const service = new CandidateRepositoryIngestionService();
      await assert.rejects(
        () =>
          service.syncCandidateRepositories({
            context: { tenantId: '00000000-0000-0000-0000-000000000001' },
            candidateId: '',
          }),
        (err) => {
          assert.ok(err.message.includes('candidateId'));
          return true;
        }
      );
    });
  });
});
