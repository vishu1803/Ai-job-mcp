/**
 * @file Unit Tests for P57.1: Authoritative Recommended Projects Data Flow.
 *
 * Verifies that:
 * 1. normalizeRecommendedProjectsForExtension correctly transforms backend recommendations.
 * 2. technologies and signals are properly enriched from candidate records.
 * 3. Graceful fallback occurs when featuredProjects is empty (falls back to topRelevantProjects).
 * 4. Graceful fallback occurs when both tool calls are empty (falls back to candidate projects).
 * 5. Clean display names strip repository namespaces.
 * 6. BackendClient._normalizeProjects guarantees recommendedProjects presence.
 * 7. Canonical project IDs remain identical throughout the chain.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRecommendedProjectsForExtension } from '../../src/routes/extension.routes.js';
import { BackendClient } from '../../extension/api/backend-client.js';

describe('P57.1: Authoritative Recommended Projects Data Flow', () => {
  const MOCK_CANDIDATE_PROJECTS = [
    {
      id: 'proj-uuid-1',
      name: 'vishu1803/task-runner',
      displayName: 'vishu1803/task-runner',
      slug: 'task-runner',
      technologies: ['TypeScript', 'Node.js', 'PostgreSQL'],
      portfolioStatus: 'FEATURED',
    },
    {
      id: 'proj-uuid-2',
      name: 'vishu1803/code-reviewer',
      displayName: 'vishu1803/code-reviewer',
      slug: 'code-reviewer',
      technologies: ['Python', 'FastAPI', 'Docker'],
      portfolioStatus: 'ACTIVE',
    },
  ];

  it('1. transforms featuredProjects into canonical recommendedProjects contract with technologies', () => {
    const portfolioRecommendations = {
      featuredProjects: [
        {
          projectId: 'proj-uuid-1',
          name: 'vishu1803/task-runner',
          displayName: 'vishu1803/task-runner',
          relevanceScore: 88.5,
          relevanceBand: 'HIGH',
          primarySignals: ['BACKEND_DISTRIBUTED', 'DATABASE_DATA_MODELING'],
          matchedRequirements: ['TypeScript', 'PostgreSQL'],
        },
      ],
    };

    const result = normalizeRecommendedProjectsForExtension({
      portfolioRecommendations,
      fitAnalysis: null,
      candidateProjects: MOCK_CANDIDATE_PROJECTS,
    });

    assert.equal(result.length, 1);
    assert.equal(result[0].projectId, 'proj-uuid-1');
    assert.equal(
      result[0].name,
      'task-runner',
      'Namespace prefix must be stripped from clean name'
    );
    assert.equal(result[0].displayName, 'vishu1803/task-runner');
    assert.deepEqual(result[0].technologies, ['TypeScript', 'Node.js', 'PostgreSQL']);
    assert.equal(result[0].relevanceScore, 88.5);
    assert.equal(result[0].relevanceBand, 'HIGH');
    assert.deepEqual(result[0].matchedRequirements, ['TypeScript', 'PostgreSQL']);
    assert.equal(result[0].verificationStatus, 'VERIFIED');
  });

  it('2. falls back to fitAnalysis.topRelevantProjects when featuredProjects is empty', () => {
    const fitAnalysis = {
      topRelevantProjects: [
        {
          projectId: 'proj-uuid-2',
          projectName: 'vishu1803/code-reviewer',
          relevanceScore: 74.2,
          relevanceBand: 'HIGH',
          matchedRequirements: [
            { normalizedRequirement: 'FastAPI microservices' },
            { normalizedRequirement: 'Docker containerization' },
          ],
        },
      ],
    };

    const result = normalizeRecommendedProjectsForExtension({
      portfolioRecommendations: { featuredProjects: [] },
      fitAnalysis,
      candidateProjects: MOCK_CANDIDATE_PROJECTS,
    });

    assert.equal(result.length, 1);
    assert.equal(result[0].projectId, 'proj-uuid-2');
    assert.equal(result[0].name, 'code-reviewer');
    assert.deepEqual(result[0].technologies, ['Python', 'FastAPI', 'Docker']);
    assert.equal(result[0].relevanceScore, 74.2);
    assert.deepEqual(result[0].matchedRequirements, [
      'FastAPI microservices',
      'Docker containerization',
    ]);
    assert.equal(result[0].verificationStatus, 'VERIFIED');
  });

  it('3. falls back to candidate verified projects when both tool results are empty', () => {
    const result = normalizeRecommendedProjectsForExtension({
      portfolioRecommendations: { featuredProjects: [] },
      fitAnalysis: { topRelevantProjects: [] },
      candidateProjects: MOCK_CANDIDATE_PROJECTS,
    });

    assert.equal(result.length, 2);
    assert.equal(result[0].projectId, 'proj-uuid-1');
    assert.equal(result[0].name, 'task-runner');
    assert.deepEqual(result[0].technologies, ['TypeScript', 'Node.js', 'PostgreSQL']);
    assert.equal(result[0].verificationStatus, 'VERIFIED');
  });

  it('4. BackendClient._normalizeProjects preserves recommendedProjects and backfills if missing', () => {
    const client = new BackendClient();

    // Case A: recommendedProjects already present
    const payloadA = {
      recommendedProjects: [
        {
          projectId: 'p1',
          name: 'Demo Project',
          technologies: ['Node.js'],
          relevanceScore: 90,
          relevanceBand: 'HIGH',
          verificationStatus: 'VERIFIED',
        },
      ],
    };
    const normA = client._normalizeProjects(payloadA);
    assert.equal(normA.recommendedProjects.length, 1);
    assert.equal(normA.recommendedProjects[0].projectId, 'p1');

    // Case B: only legacy portfolioRecommendations present
    const payloadB = {
      portfolioRecommendations: {
        featuredProjects: [
          {
            projectId: 'p2',
            name: 'Legacy Project',
            primarySignals: ['BACKEND_DISTRIBUTED'],
            relevanceScore: 65,
          },
        ],
      },
    };
    const normB = client._normalizeProjects(payloadB);
    assert.ok(Array.isArray(normB.recommendedProjects));
    assert.equal(normB.recommendedProjects.length, 1);
    assert.equal(normB.recommendedProjects[0].projectId, 'p2');
    assert.equal(normB.recommendedProjects[0].name, 'Legacy Project');
    assert.deepEqual(normB.recommendedProjects[0].technologies, ['BACKEND_DISTRIBUTED']);
  });

  it('5. canonical project IDs survive the entire chain without modification', () => {
    const canonicalId = 'canonical-proj-389d1357';
    const backendPayload = {
      portfolioRecommendations: {
        featuredProjects: [
          {
            projectId: canonicalId,
            name: 'vishu1803/task-runner',
            relevanceScore: 82,
          },
        ],
      },
    };

    const serverNormalized = normalizeRecommendedProjectsForExtension({
      portfolioRecommendations: backendPayload.portfolioRecommendations,
      fitAnalysis: null,
      candidateProjects: [
        { id: canonicalId, name: 'vishu1803/task-runner', technologies: ['TypeScript'] },
      ],
    });

    const client = new BackendClient();
    const clientNormalized = client._normalizeProjects({ recommendedProjects: serverNormalized });

    assert.equal(clientNormalized.recommendedProjects[0].projectId, canonicalId);
  });
});
