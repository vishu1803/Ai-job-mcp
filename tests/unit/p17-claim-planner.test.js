import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ResumeClaimPlannerService,
  defaultResumeClaimPlannerService,
  SEMANTIC_DIMENSION_CLUSTERS,
} from '../../src/services/resume-claim-planner.service.js';
import {
  buildCanonicalFactInventory,
  EVIDENCE_ROLES,
  OMISSION_REASONS,
} from '../../src/services/candidate-fact-inventory.service.js';
import {
  benchmarkBackendEarlyCareer,
  criticalRegressionFixture,
} from '../fixtures/resume-benchmarks.js';

describe('P17: ResumeClaimPlannerService', () => {
  it('instantiates and provides standard semantic dimension clusters', () => {
    const planner = new ResumeClaimPlannerService();
    assert.ok(planner);
    assert.ok(Array.isArray(SEMANTIC_DIMENSION_CLUSTERS));
    assert.ok(SEMANTIC_DIMENSION_CLUSTERS.length >= 4);

    const clusterKeys = SEMANTIC_DIMENSION_CLUSTERS.map((c) => c.key);
    assert.ok(clusterKeys.includes('architecture'));
    assert.ok(clusterKeys.includes('reliability'));
    assert.ok(clusterKeys.includes('performance_outcome'));
    assert.ok(clusterKeys.includes('integration_api'));
  });

  it('plans complementary, non-repetitive claims for rich backend project', () => {
    const inventory = buildCanonicalFactInventory(benchmarkBackendEarlyCareer);
    const projFacts = inventory.facts.filter(
      (f) => f.association?.projectId === 'proj-dist-kv' || f.ownerId === 'proj-dist-kv'
    );

    assert.ok(projFacts.length >= 3, 'Should have at least 3 facts for dist-kv');

    const result = defaultResumeClaimPlannerService.planClaims({
      facts: projFacts,
      ownerType: 'PROJECT',
      ownerId: 'proj-dist-kv',
      targetBullets: 3,
    });

    assert.ok(Array.isArray(result.plannedClaims));
    assert.ok(result.plannedClaims.length >= 2, 'Should plan at least 2 distinct claims');
    assert.ok(result.plannedClaims.length <= 3, 'Must not exceed target 3 bullets');

    // Each claim must have factIds, dimensions, and facts
    for (const claim of result.plannedClaims) {
      assert.ok(claim.claimId);
      assert.ok(Array.isArray(claim.factIds) && claim.factIds.length > 0);
      assert.ok(Array.isArray(claim.semanticDimensions) && claim.semanticDimensions.length > 0);
      assert.ok(claim.primaryFact, 'Must have primaryFact');
    }

    // Verify distinct semantic dimensions across planned claims
    const primaryDims = result.plannedClaims.map((c) => c.semanticDimensions[0]);
    const uniqueDims = new Set(primaryDims);
    assert.equal(uniqueDims.size, primaryDims.length, 'Each bullet should cover a distinct dimension');
  });

  it('separates project description facts and prioritizes accomplishments', () => {
    const mixedFacts = [
      {
        factId: 'f-desc-1',
        text: 'A distributed key-value storage system built with Go and Raft.',
        factType: 'project-description',
        evidenceRole: EVIDENCE_ROLES.PROJECT_DESCRIPTION,
        provenance: 'USER_PROVIDED',
        confidence: 0.8,
        renderable: true,
      },
      {
        factId: 'f-accomp-1',
        text: 'Architected Raft consensus algorithm handling leader election and log replication.',
        factType: 'candidate-authored',
        evidenceRole: EVIDENCE_ROLES.ARCHITECTURE,
        provenance: 'VERIFIED',
        confidence: 0.95,
        renderable: true,
      },
      {
        factId: 'f-accomp-2',
        text: 'Implemented write-ahead logging (WAL) and memory-mapped SSTables for point-in-time recovery.',
        factType: 'candidate-authored',
        evidenceRole: EVIDENCE_ROLES.IMPLEMENTATION,
        provenance: 'VERIFIED',
        confidence: 0.95,
        renderable: true,
      },
    ];

    const result = defaultResumeClaimPlannerService.planClaims({
      facts: mixedFacts,
      ownerType: 'PROJECT',
      ownerId: 'test-proj',
      targetBullets: 2,
    });

    assert.equal(result.plannedClaims.length, 2);
    // Both selected claims must be accomplishments, not description-only
    for (const c of result.plannedClaims) {
      assert.equal(c.descriptionOnlyRisk, false);
      assert.notEqual(c.factIds[0], 'f-desc-1');
    }

    // Description fact must be recorded in omittedFacts
    assert.ok(result.omittedFacts.some((o) => o.factId === 'f-desc-1'));
  });

  it('prevents redundant fact reuse across globally used fact IDs', () => {
    const facts = [
      {
        factId: 'fact-shared-1',
        text: 'Engineered high-throughput event processing pipeline in Go.',
        evidenceRole: EVIDENCE_ROLES.IMPLEMENTATION,
        provenance: 'VERIFIED',
        confidence: 0.9,
        renderable: true,
      },
      {
        factId: 'fact-unique-2',
        text: 'Automated CI/CD deployment with GitHub Actions and Docker.',
        evidenceRole: EVIDENCE_ROLES.IMPLEMENTATION,
        provenance: 'VERIFIED',
        confidence: 0.9,
        renderable: true,
      },
    ];

    const globallyUsed = new Set(['fact-shared-1']);
    const result = defaultResumeClaimPlannerService.planClaims({
      facts,
      ownerType: 'PROJECT',
      ownerId: 'proj-2',
      targetBullets: 2,
      globallyUsedFactIds: globallyUsed,
    });

    // Should not select fact-shared-1 since it was globally consumed
    const usedIds = result.plannedClaims.flatMap((c) => c.factIds);
    assert.ok(!usedIds.includes('fact-shared-1'), 'Must not reuse globally consumed fact');
    assert.ok(usedIds.includes('fact-unique-2'));
  });

  it('produces 100% deterministic output on identical inputs', () => {
    const inventory = buildCanonicalFactInventory(criticalRegressionFixture.candidate);
    const facts = inventory.facts.filter((f) => f.association?.projectId === 'proj-engine');

    const plan1 = defaultResumeClaimPlannerService.planClaims({
      facts,
      ownerType: 'PROJECT',
      ownerId: 'proj-engine',
      targetBullets: 3,
    });

    const plan2 = defaultResumeClaimPlannerService.planClaims({
      facts: [...facts].reverse(), // reversed input order
      ownerType: 'PROJECT',
      ownerId: 'proj-engine',
      targetBullets: 3,
    });

    assert.deepEqual(
      plan1.plannedClaims.map((c) => c.claimId),
      plan2.plannedClaims.map((c) => c.claimId),
      'Claim planning must be source-order invariant and deterministic'
    );
  });
});
