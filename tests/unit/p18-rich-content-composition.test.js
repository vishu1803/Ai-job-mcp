/**
 * @file Unit Test Suite for Rich, ATS-Friendly Resume Composition (P18 Architecture)
 *
 * Verifies rich evidence utilization, multi-bullet composition, and fail-closed provenance:
 * - Category A: Multiple candidate-owned facts produce multiple bullets.
 * - Category B: Distinct contribution classes are preserved.
 * - Category C: Implementation + architecture do not collapse into one fact.
 * - Category D: Optimization + supported outcome can compose into a stronger bullet.
 * - Category E: Project description still cannot create candidate agency.
 * - Category F: Repository active verbs still cannot create candidate agency.
 * - Category G: candidateId alone still cannot create ownership.
 * - Category H: projectId alone still cannot create ownership.
 * - Category I: Missing provenance still fails closed.
 * - Category J: Explicit candidateAuthored=true still works.
 * - Category K: ownership=CANDIDATE still works.
 * - Category L: Rendered agency invariant still rejects unauthorized candidate claims.
 * - Category M: Multiple candidate-owned facts survive planning/composition/optimization when page budget permits.
 * - Category N: One-page optimizer does not unnecessarily discard high-value candidate-owned facts while lower-value whitespace remains.
 * - Category O: Rich content does not introduce unsupported metrics or technologies.
 * - Category P: Generated bullets remain valid through the existing claim validation system.
 * - Category Q: Async and sync composition paths preserve the same evidence-selection behavior.
 * - Category R: Output remains deterministic for equivalent evidence.
 *
 * All fixtures are generic and synthetic with zero hardcoded candidates, projects, or companies.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  defaultResumeClaimPlannerService,
  ResumeClaimPlannerService,
} from '../../src/services/resume-claim-planner.service.js';
import {
  buildCanonicalFactInventory,
  EVIDENCE_ROLES,
  OMISSION_REASONS,
  isAccomplishmentCandidate,
} from '../../src/services/candidate-fact-inventory.service.js';
import {
  CONTRIBUTION_CLASSES,
  AGENCY_LEVELS,
  AGENCY_SOURCES,
  isTrustedCandidateAgencySource,
  determineFactAgency,
  areContributionClassesCompatible,
  synthesizeAccomplishmentNarrative,
  determineProjectBulletCapacity,
  assertRenderedCandidateAgencyInvariant,
  assertMetricSafety,
} from '../../src/services/resume-composition-primitives.js';
import {
  composeProfessionalProjectBullets,
  composeProfessionalProjectBulletsAsync,
} from '../../src/services/resume-accomplishment-composer.service.js';
import { defaultResumeClaimValidationService } from '../../src/services/resume-claim-validation.service.js';
import { ResumeContentOptimizer } from '../../src/services/resume-content-optimizer.service.js';

describe('P18: Rich, ATS-Friendly Resume Composition & Provenance Safety', () => {
  // Category A: Multiple candidate-owned facts produce multiple bullets.
  it('Category A: Multiple candidate-owned facts produce multiple bullets', () => {
    const facts = [
      {
        factId: 'fact-arch-1',
        text: 'Architected distributed event streaming platform in Go using Apache Kafka and Raft consensus.',
        evidenceRole: EVIDENCE_ROLES.ARCHITECTURE,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_DESIGN_DECISION,
        semanticTopic: 'architecture',
        provenance: 'VERIFIED',
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
        confidence: 0.95,
        renderable: true,
      },
      {
        factId: 'fact-impl-2',
        text: 'Engineered high-throughput consumer worker pool handling 50k messages per second with zero message loss.',
        evidenceRole: EVIDENCE_ROLES.ACTION,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_IMPLEMENTATION,
        semanticTopic: 'implementation',
        provenance: 'VERIFIED',
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
        confidence: 0.95,
        renderable: true,
      },
      {
        factId: 'fact-out-3',
        text: 'Reduced end-to-end event processing latency by 35% across all distributed subscriber services.',
        evidenceRole: EVIDENCE_ROLES.OUTCOME,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_OUTCOME,
        semanticTopic: 'performance',
        provenance: 'VERIFIED',
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
        confidence: 0.95,
        renderable: true,
      },
    ];

    const result = defaultResumeClaimPlannerService.planClaims({
      facts,
      ownerType: 'PROJECT',
      ownerId: 'proj-stream-engine',
      targetBullets: 3,
    });

    assert.equal(result.plannedClaims.length, 3, 'Must plan exactly 3 distinct claims for 3 distinct candidate-owned facts');
    assert.equal(result.omittedFacts.length, 0, 'No candidate-owned facts should be omitted when budget >= 3');

    const composed = composeProfessionalProjectBullets({
      facts,
      project: { id: 'proj-stream-engine', name: 'Stream Engine' },
      explicitBudget: 3,
    });
    assert.equal(composed.bullets.length, 3, 'Must compose exactly 3 substantive bullets');
  });

  // Category B: Distinct contribution classes are preserved.
  it('Category B: Distinct contribution classes are preserved', () => {
    const facts = [
      {
        factId: 'fact-impl',
        text: 'Implemented RESTful APIs and PostgreSQL schema migrations.',
        evidenceRole: EVIDENCE_ROLES.IMPLEMENTATION,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_IMPLEMENTATION,
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
        confidence: 0.9,
        renderable: true,
      },
      {
        factId: 'fact-design',
        text: 'Architected microservices communication protocol using gRPC.',
        evidenceRole: EVIDENCE_ROLES.DESIGN_DECISION,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_DESIGN_DECISION,
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
        confidence: 0.9,
        renderable: true,
      },
      {
        factId: 'fact-opt',
        text: 'Optimized Redis query caching and TTL configuration.',
        evidenceRole: EVIDENCE_ROLES.OPTIMIZATION,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_OPTIMIZATION,
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
        confidence: 0.9,
        renderable: true,
      },
      {
        factId: 'fact-out',
        text: 'Achieved 99.9% uptime during regional network failover tests.',
        evidenceRole: EVIDENCE_ROLES.OUTCOME,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_OUTCOME,
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
        confidence: 0.9,
        renderable: true,
      },
    ];

    const plan = defaultResumeClaimPlannerService.planClaims({
      facts,
      ownerType: 'PROJECT',
      ownerId: 'proj-classes',
      targetBullets: 4,
    });

    const plannedClasses = plan.plannedClaims.map((c) => c.primaryFact.contributionClass);
    assert.ok(plannedClasses.includes(CONTRIBUTION_CLASSES.CANDIDATE_IMPLEMENTATION));
    assert.ok(plannedClasses.includes(CONTRIBUTION_CLASSES.CANDIDATE_DESIGN_DECISION));
    assert.ok(plannedClasses.includes(CONTRIBUTION_CLASSES.CANDIDATE_OPTIMIZATION));
    assert.ok(plannedClasses.includes(CONTRIBUTION_CLASSES.CANDIDATE_OUTCOME));
  });

  // Category C: Implementation + architecture do not collapse into one fact.
  it('Category C: Implementation + architecture do not collapse into one fact', () => {
    assert.equal(
      areContributionClassesCompatible(
        CONTRIBUTION_CLASSES.CANDIDATE_ACTION,
        CONTRIBUTION_CLASSES.CANDIDATE_DESIGN_DECISION
      ),
      false,
      'CANDIDATE_ACTION and CANDIDATE_DESIGN_DECISION must not be compatible for merging'
    );
    assert.equal(
      areContributionClassesCompatible(
        CONTRIBUTION_CLASSES.CANDIDATE_IMPLEMENTATION,
        CONTRIBUTION_CLASSES.CANDIDATE_DESIGN_DECISION
      ),
      false,
      'CANDIDATE_IMPLEMENTATION and CANDIDATE_DESIGN_DECISION must not be compatible for merging'
    );

    const facts = [
      {
        factId: 'fact-arch',
        text: 'Architected distributed key-value store with raft consensus replication.',
        evidenceRole: EVIDENCE_ROLES.ARCHITECTURE,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_DESIGN_DECISION,
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
        confidence: 0.95,
        renderable: true,
      },
      {
        factId: 'fact-impl',
        text: 'Implemented asynchronous network I/O layer in Rust with tokio framework.',
        evidenceRole: EVIDENCE_ROLES.ACTION,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_IMPLEMENTATION,
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
        confidence: 0.95,
        renderable: true,
      },
    ];

    const plan = defaultResumeClaimPlannerService.planClaims({
      facts,
      ownerType: 'PROJECT',
      ownerId: 'proj-no-collapse',
      targetBullets: 2,
    });

    assert.equal(plan.plannedClaims.length, 2, 'Architecture and implementation must form 2 separate claims');
    assert.equal(plan.plannedClaims[0].complementaryFacts.length, 0, 'Must not swallow implementation into architecture');
  });

  // Category D: Optimization + supported outcome can compose into a stronger bullet.
  it('Category D: Optimization + supported outcome can compose into a stronger bullet', () => {
    const facts = [
      {
        factId: 'fact-opt',
        text: 'Optimized PostgreSQL connection pool and indexing strategy for high-load transaction queries.',
        evidenceRole: EVIDENCE_ROLES.OPTIMIZATION,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_OPTIMIZATION,
        semanticTopic: 'performance',
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
        confidence: 0.95,
        renderable: true,
      },
      {
        factId: 'fact-outcome',
        text: 'Reduced database query response times under simulated peak concurrency by 40%.',
        evidenceRole: EVIDENCE_ROLES.OUTCOME,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_OUTCOME,
        semanticTopic: 'performance',
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
        confidence: 0.95,
        renderable: true,
      },
    ];

    // When budget is constrained to 1, optimization pairs with outcome
    const constrainedPlan = defaultResumeClaimPlannerService.planClaims({
      facts,
      ownerType: 'PROJECT',
      ownerId: 'proj-opt-pair',
      targetBullets: 1,
    });

    assert.equal(constrainedPlan.plannedClaims.length, 1, 'Constrained budget should pair into 1 claim');
    assert.equal(constrainedPlan.plannedClaims[0].facts.length, 2, 'Paired claim must contain both primary and supporting fact');

    const synthesized = synthesizeAccomplishmentNarrative(facts[0].text, facts[1].text);
    assert.ok(synthesized.includes('reducing database query response times'), 'Must use fluent participle transformation');
  });

  // Category E: Project description still cannot create candidate agency.
  it('Category E: Project description still cannot create candidate agency', () => {
    const descFact = {
      factId: 'fact-desc',
      text: 'High-throughput distributed telemetry and data exploration platform in Rust and TypeScript.',
      evidenceRole: EVIDENCE_ROLES.PROJECT_DESCRIPTION,
      contributionClass: CONTRIBUTION_CLASSES.DESCRIPTION,
      agencyLevel: AGENCY_LEVELS.NONE,
      agencySource: AGENCY_SOURCES.PROJECT_DESCRIPTION,
      confidence: 0.8,
      renderable: true,
    };

    assert.equal(isAccomplishmentCandidate(descFact), false, 'Project description must not be accomplishment candidate');

    const plan = defaultResumeClaimPlannerService.planClaims({
      facts: [descFact],
      ownerType: 'PROJECT',
      ownerId: 'proj-desc-only',
      targetBullets: 2,
    });

    // In Strategy C description fallback, action is strictly null, cannot invent candidate action
    assert.equal(plan.plannedClaims[0].action, null, 'Must not invent active verb for project description');

    // Claim validation Check 21 rejects unauthorized candidate agency
    const unauthorizedClaim = {
      claimId: 'claim-unauth',
      text: 'Architected high-throughput distributed telemetry and data exploration platform in Rust.',
      action: 'Architected',
      evidenceRole: 'ACCOMPLISHMENT',
      factIds: ['fact-desc'],
      agencyLevel: 'CANDIDATE',
    };
    const validation = defaultResumeClaimValidationService.validateClaim(
      unauthorizedClaim,
      {
        factInventory: [descFact],
        sectionOwnerType: 'PROJECT',
        sectionOwnerId: 'proj-desc-only',
      }
    );
    assert.equal(validation.valid, false, 'Must reject claim asserting candidate agency without trusted facts');
    assert.ok(validation.violations.some((v) => v.code === 'AGENCY_NOT_AUTHORIZED'));
  });

  // Category F: Repository active verbs still cannot create candidate agency.
  it('Category F: Repository active verbs still cannot create candidate agency', () => {
    const repoFact = {
      factId: 'fact-repo-active',
      text: 'Implemented distributed caching using Redis and connection pooling.',
      sourceType: 'evidence',
      provenance: 'VERIFIED',
    };

    const agency = determineFactAgency(repoFact.text, repoFact);
    assert.equal(agency.level, AGENCY_LEVELS.NONE, 'External repo fact with active verb must have agency.level NONE');
    assert.equal(agency.source, AGENCY_SOURCES.GRAMMATICAL_ACTION_ONLY);
    assert.equal(isAccomplishmentCandidate({ ...repoFact, agencyLevel: agency.level, agencySource: agency.source }), false);
  });

  // Category G: candidateId alone still cannot create ownership.
  it('Category G: candidateId alone still cannot create ownership', () => {
    const fact = {
      factId: 'fact-cand-id',
      text: 'Built scalable real-time messaging pipeline.',
      candidateId: '123e4567-e89b-12d3-a456-426614174000',
      sourceType: 'unknown',
    };

    const isTrusted = isTrustedCandidateAgencySource(fact.sourceType, fact);
    assert.equal(isTrusted, false, 'candidateId alone must not establish trusted agency source');

    const agency = determineFactAgency(fact.text, fact);
    assert.notEqual(agency.level, AGENCY_LEVELS.CANDIDATE, 'candidateId alone must not establish CANDIDATE agency');
  });

  // Category H: projectId alone still cannot create ownership.
  it('Category H: projectId alone still cannot create ownership', () => {
    const fact = {
      factId: 'fact-proj-id',
      text: 'Engineered automated data ingestion microservice.',
      projectId: '987fcdeb-51a2-43f7-9abc-123456789abc',
      sourceType: 'unknown',
    };

    const isTrusted = isTrustedCandidateAgencySource(fact.sourceType, fact);
    assert.equal(isTrusted, false, 'projectId alone must not establish trusted agency source');

    const agency = determineFactAgency(fact.text, fact);
    assert.notEqual(agency.level, AGENCY_LEVELS.CANDIDATE, 'projectId alone must not establish CANDIDATE agency');
  });

  // Category I: Missing provenance still fails closed.
  it('Category I: Missing provenance still fails closed', () => {
    const factMissing = {
      factId: 'fact-no-prov',
      text: 'Designed fault-tolerant consensus service.',
    };

    assert.equal(isTrustedCandidateAgencySource(undefined, factMissing), false);
    const agency = determineFactAgency(factMissing.text, factMissing);
    assert.equal(agency.level, AGENCY_LEVELS.NONE);
    assert.equal(isAccomplishmentCandidate({ ...factMissing, agencyLevel: agency.level }), false);
  });

  // Category J: Explicit candidateAuthored=true still works.
  it('Category J: Explicit candidateAuthored=true still works', () => {
    const fact = {
      factId: 'fact-cand-auth',
      text: 'Engineered webhooks integration service with exponential backoff.',
      candidateAuthored: true,
      sourceType: 'bullet',
      renderable: true,
    };

    assert.equal(isTrustedCandidateAgencySource('bullet', fact), true);
    const agency = determineFactAgency(fact.text, fact);
    assert.equal(agency.level, AGENCY_LEVELS.CANDIDATE);
    assert.equal(agency.source, AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET);
    assert.equal(isAccomplishmentCandidate({ ...fact, agencyLevel: agency.level, agencySource: agency.source }), true);
  });

  // Category K: ownership=CANDIDATE still works.
  it('Category K: ownership=CANDIDATE still works', () => {
    const fact = {
      factId: 'fact-ownership-cand',
      text: 'Designed and deployed automated test harness with 90% code coverage.',
      ownership: 'CANDIDATE',
      renderable: true,
    };

    assert.equal(isTrustedCandidateAgencySource(undefined, fact), true);
    const agency = determineFactAgency(fact.text, fact);
    assert.equal(agency.level, AGENCY_LEVELS.CANDIDATE);
    assert.equal(isAccomplishmentCandidate({ ...fact, agencyLevel: agency.level, agencySource: agency.source }), true);
  });

  // Category L: Rendered agency invariant still rejects unauthorized candidate claims.
  it('Category L: Rendered agency invariant still rejects unauthorized candidate claims', () => {
    const unauthorizedFact = {
      factId: 'fact-unauth',
      agencyLevel: AGENCY_LEVELS.NONE,
      agencySource: AGENCY_SOURCES.REPOSITORY_EVIDENCE,
    };
    const renderedBullet = {
      text: 'Engineered distributed consensus system in Go.',
      agencyLevel: AGENCY_LEVELS.CANDIDATE,
      agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
      composedFromFactIds: ['fact-unauth'],
    };

    assert.throws(
      () => {
        assertRenderedCandidateAgencyInvariant([renderedBullet], [unauthorizedFact]);
      },
      (err) => err.name === 'ValidationError' && /asserts candidate agency without contributing facts/i.test(err.message)
    );
  });

  // Category M: Multiple candidate-owned facts survive planning/composition/optimization when page budget permits.
  it('Category M: Multiple candidate-owned facts survive planning/composition/optimization when page budget permits', () => {
    const facts = [
      {
        factId: 'f-impl-1',
        text: 'Engineered a Flask backend with asynchronous FastAPI endpoints to handle real-time webhook events.',
        evidenceRole: EVIDENCE_ROLES.ACTION,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_IMPLEMENTATION,
        semanticTopic: 'implementation',
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
        confidence: 0.95,
        renderable: true,
      },
      {
        factId: 'f-outcome-2',
        text: 'Reduced average manual review time across multiple code repositories by automating static analysis.',
        evidenceRole: EVIDENCE_ROLES.OUTCOME,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_OUTCOME,
        semanticTopic: 'performance',
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
        confidence: 0.95,
        renderable: true,
      },
      {
        factId: 'f-impl-3',
        text: 'Developed automated analysis system integrating LLM APIs to review pull requests and suggest fixes.',
        evidenceRole: EVIDENCE_ROLES.ACTION,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_IMPLEMENTATION,
        semanticTopic: 'implementation',
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
        confidence: 0.95,
        renderable: true,
      },
    ];

    // Diversity backfill ensures f-impl-3 is not omitted when targetBullets = 3
    const plan = defaultResumeClaimPlannerService.planClaims({
      facts,
      ownerType: 'PROJECT',
      ownerId: 'proj-multi-survive',
      targetBullets: 3,
    });

    assert.equal(plan.plannedClaims.length, 3, 'All 3 facts must survive claim planning with diversity backfill');
    assert.equal(plan.omittedFacts.length, 0, 'Zero facts omitted when targetBullets = 3');

    const comp = composeProfessionalProjectBullets({
      facts,
      project: { id: 'proj-multi-survive', name: 'Code Review Assistant' },
      explicitBudget: 3,
    });
    assert.equal(comp.bullets.length, 3, 'All 3 bullets must be composed');
  });

  // Category N: One-page optimizer does not unnecessarily discard high-value candidate-owned facts while lower-value whitespace remains.
  it('Category N: One-page optimizer does not unnecessarily discard high-value candidate-owned facts while lower-value whitespace remains', () => {
    const optimizer = new ResumeContentOptimizer();

    const inventoryFactCountByProject = new Map();
    inventoryFactCountByProject.set('proj-expandable', 3);
    inventoryFactCountByProject.set('Expandable Project', 3);

    const structuredResume = {
      projects: [
        {
          projectId: 'proj-expandable',
          name: 'Expandable Project',
          bullets: ['Bullet 1'],
        },
      ],
      experience: [],
    };

    // Available space is 50pt (plenty of room for an 18pt bullet)
    const moves = optimizer._generateCandidateMoves({
      structuredResume,
      projectBulletOverrides: {},
      additionalProjectIds: [],
      inventoryFactCountByProject,
      availableSpacePt: 50,
    });

    const expandMove = moves.find((m) => m.type === 'BULLETS' && m.id === 'proj-expandable');
    assert.ok(expandMove, 'Optimizer must generate an expansion move for eligible project when space is available');
    assert.equal(expandMove.currentCount, 1);
  });

  // Category O: Rich content does not introduce unsupported metrics or technologies.
  it('Category O: Rich content does not introduce unsupported metrics or technologies', () => {
    const facts = [
      {
        factId: 'f-tech-metrics',
        text: 'Engineered telemetry worker in Rust reducing memory consumption by 25%.',
        technologies: ['Rust'],
        metrics: [{ type: 'PERCENTAGE', value: 25, raw: '25%' }],
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
      },
    ];

    const composed = composeProfessionalProjectBullets({
      facts,
      project: { id: 'proj-safe', name: 'Telemetry Engine' },
      explicitBudget: 1,
    });

    assert.equal(composed.bullets.length, 1);
    const bulletText = composed.bullets[0].text;
    assert.ok(bulletText.includes('Rust'));
    assert.ok(bulletText.includes('25%'));
    // Ensure metric safety assertion passes
    assert.doesNotThrow(() => {
      assertMetricSafety(bulletText, facts);
    });
  });

  // Category P: Generated bullets remain valid through the existing claim validation system.
  it('Category P: Generated bullets remain valid through the existing claim validation system', () => {
    const facts = [
      {
        factId: 'fact-val-1',
        text: 'Designed and deployed RESTful APIs using Node.js and PostgreSQL.',
        evidenceRole: EVIDENCE_ROLES.ACTION,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_ACTION,
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
        confidence: 0.95,
        renderable: true,
      },
    ];

    const composed = composeProfessionalProjectBullets({
      facts,
      project: { id: 'proj-val', name: 'API Server' },
      explicitBudget: 1,
    });

    assert.equal(composed.bullets.length, 1);
    const bullet = composed.bullets[0];

    const validation = defaultResumeClaimValidationService.validateClaim(
      {
        claimId: 'claim-p',
        text: bullet.text,
        action: 'Designed',
        evidenceRole: 'ACCOMPLISHMENT',
        factIds: bullet.composedFromFactIds,
        agencyLevel: 'CANDIDATE',
        agencySource: 'CANDIDATE_PROJECT_BULLET',
      },
      {
        factInventory: facts,
        sectionOwnerType: 'PROJECT',
        sectionOwnerId: 'proj-val',
      }
    );

    assert.equal(validation.valid, true, 'Composed bullet must pass all claim validation rules');
    assert.equal(validation.violations.length, 0);
  });

  // Category Q: Async and sync composition paths preserve the same evidence-selection behavior.
  it('Category Q: Async and sync composition paths preserve the same evidence-selection behavior', async () => {
    const facts = [
      {
        factId: 'fact-sync-async-1',
        text: 'Built scalable microservice in Go with gRPC communication.',
        evidenceRole: EVIDENCE_ROLES.ACTION,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_IMPLEMENTATION,
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
        confidence: 0.95,
        renderable: true,
      },
      {
        factId: 'fact-sync-async-2',
        text: 'Optimized cache hit ratio to 98% with Redis cluster replication.',
        evidenceRole: EVIDENCE_ROLES.OPTIMIZATION,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_OPTIMIZATION,
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
        confidence: 0.95,
        renderable: true,
      },
    ];

    const syncResult = composeProfessionalProjectBullets({
      facts,
      project: { id: 'proj-parity', name: 'Parity Service' },
      explicitBudget: 2,
    });

    const asyncResult = await composeProfessionalProjectBulletsAsync({
      facts,
      project: { id: 'proj-parity', name: 'Parity Service' },
      explicitBudget: 2,
    });

    assert.equal(syncResult.bullets.length, asyncResult.bullets.length);
    assert.deepEqual(
      syncResult.bullets.map((b) => b.text),
      asyncResult.bullets.map((b) => b.text)
    );
    assert.deepEqual(
      syncResult.bullets.map((b) => b.composedFromFactIds),
      asyncResult.bullets.map((b) => b.composedFromFactIds)
    );
  });

  // Category R: Output remains deterministic for equivalent evidence.
  it('Category R: Output remains deterministic for equivalent evidence', () => {
    const facts = [
      {
        factId: 'fact-det-1',
        text: 'Architected distributed queue in Rust with Tokio.',
        evidenceRole: EVIDENCE_ROLES.ARCHITECTURE,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_DESIGN_DECISION,
        confidence: 0.95,
        renderable: true,
      },
      {
        factId: 'fact-det-2',
        text: 'Engineered high-throughput consumer workers.',
        evidenceRole: EVIDENCE_ROLES.ACTION,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_IMPLEMENTATION,
        confidence: 0.95,
        renderable: true,
      },
    ];

    const planNormal = defaultResumeClaimPlannerService.planClaims({
      facts,
      ownerType: 'PROJECT',
      ownerId: 'proj-det',
      targetBullets: 2,
    });

    const planReversed = defaultResumeClaimPlannerService.planClaims({
      facts: [...facts].reverse(),
      ownerType: 'PROJECT',
      ownerId: 'proj-det',
      targetBullets: 2,
    });

    assert.deepEqual(
      planNormal.plannedClaims.map((c) => c.primaryFact.factId),
      planReversed.plannedClaims.map((c) => c.primaryFact.factId),
      'Claim order must be deterministic regardless of input array order'
    );
  });
});
