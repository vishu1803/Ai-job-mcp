/**
 * @file Unit Tests for Step 1F: AST Ingestion UX, State Machine, Button Locking & Progress Tracking
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { IngestionStateService } from '../../src/services/ingestion-state.service.js';
import { renderOnboardingPage } from '../../src/views/onboarding.page.js';

describe('Step 1F: AST Ingestion UX & State Machine Unit Tests', () => {
  let service;
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const candidateId = '22222222-2222-2222-2222-222222222222';
  const sampleRepos = [
    { id: '1338724502', name: 'Ai-job-mcp' },
    { id: '808279506', name: 'Spotify-clone' },
    { id: '841836553', name: 'FTVsalon-Academy' },
    { id: '1263837407', name: 'construction-webpage' },
  ];

  beforeEach(() => {
    service = new IngestionStateService();
  });

  it('1. Initializes a new ingestion run with unique ID and snapshot of repositories', () => {
    const run = service.startRun({
      context: { tenantId, userId: 'user-1' },
      candidateId,
      resources: sampleRepos,
    });

    assert.ok(run.ingestionRunId, 'Must generate a unique ingestionRunId');
    assert.equal(run.tenantId, tenantId);
    assert.equal(run.candidateId, candidateId);
    assert.equal(run.state, 'RUNNING');
    assert.equal(run.totalRepositories, 4);
    assert.equal(run.completedRepositories, 0);
    assert.equal(run.failedRepositories, 0);
    assert.equal(run.repositories.length, 4);
    assert.equal(run.repositories[0].state, 'QUEUED');
    assert.equal(run.repositories[1].state, 'QUEUED');
    assert.equal(run.repositories[2].state, 'QUEUED');
    assert.equal(run.repositories[3].state, 'QUEUED');
  });

  it('2. Rejects duplicate concurrent ingestion start attempts with ConflictError', () => {
    service.startRun({
      context: { tenantId, userId: 'user-1' },
      candidateId,
      resources: sampleRepos,
    });

    assert.throws(
      () => {
        service.startRun({
          context: { tenantId, userId: 'user-1' },
          candidateId,
          resources: sampleRepos,
        });
      },
      (err) => {
        assert.equal(err.name, 'ConflictError');
        assert.ok(err.message.includes('INGESTION_ALREADY_RUNNING'));
        return true;
      }
    );
  });

  it('3. Transitions per-repository states through QUEUED -> RUNNING -> COMPLETED', () => {
    service.startRun({
      context: { tenantId, userId: 'user-1' },
      candidateId,
      resources: sampleRepos,
    });

    // Start Repo 1
    service.markRepositoryRunning({
      tenantId,
      candidateId,
      resourceId: '1338724502',
      phase: 'Analyzing AST imports...',
    });

    let current = service.getRunByCandidate({ tenantId, candidateId });
    assert.equal(current.currentRepositoryId, '1338724502');
    assert.equal(current.currentPhase, 'Analyzing AST imports...');
    assert.equal(current.repositories[0].state, 'RUNNING');

    // Complete Repo 1
    service.markRepositoryCompleted({
      tenantId,
      candidateId,
      resourceId: '1338724502',
      result: { projectCreated: true, evidenceCreated: 15 },
    });

    current = service.getRunByCandidate({ tenantId, candidateId });
    assert.equal(current.completedRepositories, 1);
    assert.equal(current.repositories[0].state, 'COMPLETED');
    assert.equal(current.repositories[0].evidenceCreated, 15);
  });

  it('4. Correctly computes final COMPLETED state when all repositories succeed', () => {
    service.startRun({
      context: { tenantId, userId: 'user-1' },
      candidateId,
      resources: sampleRepos,
    });

    for (const repo of sampleRepos) {
      service.markRepositoryRunning({ tenantId, candidateId, resourceId: repo.id });
      service.markRepositoryCompleted({
        tenantId,
        candidateId,
        resourceId: repo.id,
        result: { projectCreated: true, evidenceCreated: 5 },
      });
    }

    const finalRun = service.finishRun({
      tenantId,
      candidateId,
      summary: {
        repositoriesProcessed: 4,
        projectsCreated: 4,
        evidenceCreated: 20,
        verifiedSkillsAdded: 6,
        verifiedSkills: ['Node.js', 'Fastify', 'PostgreSQL', 'Docker', 'Redis', 'TypeScript'],
      },
    });

    assert.equal(finalRun.state, 'COMPLETED');
    assert.equal(finalRun.completedRepositories, 4);
    assert.equal(finalRun.failedRepositories, 0);
    assert.ok(finalRun.completedAt);
    assert.equal(finalRun.summary.projectsCreated, 4);
    assert.equal(finalRun.summary.verifiedSkillsAdded, 6);
  });

  it('5. Correctly computes PARTIAL_FAILURE state when some repositories fail', () => {
    service.startRun({
      context: { tenantId, userId: 'user-1' },
      candidateId,
      resources: sampleRepos,
    });

    // Repo 1, 2, 4 succeed
    service.markRepositoryCompleted({ tenantId, candidateId, resourceId: '1338724502' });
    service.markRepositoryCompleted({ tenantId, candidateId, resourceId: '808279506' });
    service.markRepositoryCompleted({ tenantId, candidateId, resourceId: '1263837407' });

    // Repo 3 fails
    service.markRepositoryFailed({
      tenantId,
      candidateId,
      resourceId: '841836553',
      error: 'GitHub API rate limit exceeded during AST scan',
    });

    const finalRun = service.finishRun({
      tenantId,
      candidateId,
      summary: { repositoriesProcessed: 3 },
    });

    assert.equal(finalRun.state, 'PARTIAL_FAILURE');
    assert.equal(finalRun.completedRepositories, 3);
    assert.equal(finalRun.failedRepositories, 1);
    assert.equal(finalRun.repositories[2].state, 'FAILED');
    assert.equal(finalRun.repositories[2].error, 'GitHub API rate limit exceeded during AST scan');
  });

  it('6. Correctly computes FAILED state when all repositories fail', () => {
    service.startRun({
      context: { tenantId, userId: 'user-1' },
      candidateId,
      resources: sampleRepos,
    });

    for (const repo of sampleRepos) {
      service.markRepositoryFailed({
        tenantId,
        candidateId,
        resourceId: repo.id,
        error: 'Network connection aborted',
      });
    }

    const finalRun = service.finishRun({
      tenantId,
      candidateId,
    });

    assert.equal(finalRun.state, 'FAILED');
    assert.equal(finalRun.completedRepositories, 0);
    assert.equal(finalRun.failedRepositories, 4);
  });

  it('7. Enforces tenant isolation on run queries (foreign tenant returns 404 / null)', () => {
    const run = service.startRun({
      context: { tenantId, userId: 'user-1' },
      candidateId,
      resources: sampleRepos,
    });

    const foreignTenantId = '99999999-9999-9999-9999-999999999999';

    // Query candidate run from foreign tenant
    const foreignCandidateRun = service.getRunByCandidate({
      tenantId: foreignTenantId,
      candidateId,
    });
    assert.equal(foreignCandidateRun, null);

    // Query run ID from foreign tenant
    assert.throws(
      () => {
        service.getRunById({
          tenantId: foreignTenantId,
          runId: run.ingestionRunId,
        });
      },
      (err) => {
        assert.equal(err.name, 'NotFoundError');
        return true;
      }
    );
  });

  it('8. Serializes safe metadata without leaking credentials or tokens', () => {
    service.startRun({
      context: { tenantId, userId: 'user-1' },
      candidateId,
      resources: sampleRepos,
    });

    const serialized = service.getRunByCandidate({ tenantId, candidateId });
    const jsonStr = JSON.stringify(serialized);

    assert.ok(!jsonStr.includes('token'), 'Must not contain token');
    assert.ok(!jsonStr.includes('secret'), 'Must not contain secret');
    assert.ok(!jsonStr.includes('privateKey'), 'Must not contain privateKey');
    assert.ok(!jsonStr.includes('password'), 'Must not contain password');
  });

  it('9. Renders RUNNING state with disabled buttons and progress bar in Step 4 HTML', () => {
    const activeRun = {
      ingestionRunId: 'run-123',
      tenantId,
      candidateId,
      state: 'RUNNING',
      startedAt: new Date().toISOString(),
      completedAt: null,
      totalRepositories: 4,
      completedRepositories: 1,
      failedRepositories: 0,
      currentRepositoryId: '808279506',
      currentRepositoryName: 'Spotify-clone',
      currentPhase: 'Extracting source evidence...',
      repositories: [
        {
          id: '1338724502',
          name: 'Ai-job-mcp',
          state: 'COMPLETED',
          phase: 'AST + evidence complete',
        },
        {
          id: '808279506',
          name: 'Spotify-clone',
          state: 'RUNNING',
          phase: 'Extracting source evidence...',
        },
        { id: '841836553', name: 'FTVsalon-Academy', state: 'QUEUED', phase: 'Queued' },
        { id: '1263837407', name: 'construction-webpage', state: 'QUEUED', phase: 'Queued' },
      ],
      summary: null,
      error: null,
    };

    const html = renderOnboardingPage({
      user: { id: 'user-1', displayName: 'Test User' },
      tenant: { id: tenantId, name: 'Test Tenant' },
      selectedRepos: sampleRepos,
      currentStep: 4,
      ingestionRun: activeRun,
    });

    // Check Running Badge & Progress Text
    assert.ok(html.includes('RUNNING'), 'Must display RUNNING badge');
    assert.ok(html.includes('1 / 4 Repositories Complete'), 'Must display 1 / 4 count');
    assert.ok(html.includes('Extracting source evidence...'), 'Must display active phase');

    // Check Disabled Buttons
    assert.ok(
      html.includes('id="backToReposBtn" class="btn btn-secondary disabled"'),
      'Back button must be disabled'
    );
    assert.ok(html.includes('aria-disabled="true"'), 'Back button must have aria-disabled');
    assert.ok(html.includes('Ingestion Running...'), 'Must render running indicator button');
    assert.ok(html.includes('disabled'), 'Running indicator button must be disabled');

    // Check Screen Reader Live Region
    assert.ok(html.includes('role="status"'), 'Must have role="status"');
    assert.ok(html.includes('aria-live="polite"'), 'Must have aria-live="polite"');
  });

  it('10. Renders COMPLETED state with metric cards and summary link in Step 4 HTML', () => {
    const completedRun = {
      ingestionRunId: 'run-123',
      tenantId,
      candidateId,
      state: 'COMPLETED',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      totalRepositories: 4,
      completedRepositories: 4,
      failedRepositories: 0,
      currentRepositoryId: null,
      currentRepositoryName: null,
      currentPhase: 'Ingestion complete',
      repositories: sampleRepos.map((r) => ({
        id: r.id,
        name: r.name,
        state: 'COMPLETED',
        phase: 'AST + evidence complete',
      })),
      summary: {
        repositoriesProcessed: 4,
        projectsCreated: 4,
        projectsUpdated: 0,
        evidenceCreated: 24,
        evidenceLinked: 24,
        verifiedSkillsAdded: 8,
        verifiedSkills: ['Node.js', 'Fastify', 'PostgreSQL'],
      },
      error: null,
    };

    const html = renderOnboardingPage({
      user: { id: 'user-1', displayName: 'Test User' },
      tenant: { id: tenantId, name: 'Test Tenant' },
      selectedRepos: sampleRepos,
      currentStep: 4,
      ingestionRun: completedRun,
    });

    assert.ok(html.includes('COMPLETED'), 'Must display COMPLETED badge');
    assert.ok(
      html.includes('Ingestion Pipeline Completed Successfully'),
      'Must display success title'
    );
    assert.ok(html.includes('Review Profile Summary →'), 'Must show continue link');
    assert.ok(html.includes('href="/onboarding?step=5"'), 'Continue link must point to step 5');
  });
});
