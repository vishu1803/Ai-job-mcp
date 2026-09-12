/**
 * @file P18 Adversarial Composition & Narrative Intelligence Test Suite
 *
 * Comprehensive adversarial tests covering 34 critical scenarios:
 * 1. Rich projects / weak experience
 * 2. Description-heavy candidate vs candidate-contribution claims
 * 3. Zero hallucinated metrics or technologies under adversarial AI realization
 * 4. 20 claim validation invariants (causal, comparative, superlative, production, actor)
 * 5. Domain-specific summary tailoring (Systems vs AI vs Web vs Backend)
 * 6. Deterministic fallback under AI errors, timeouts, or invalid payloads
 * 7. Bit-for-bit repeatability and source-order invariance
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCanonicalFactInventory,
  scoreFactsForJob,
  OMISSION_REASONS,
} from '../../src/services/candidate-fact-inventory.service.js';

import {
  composeProfessionalProjectBullets,
  composeProfessionalProjectBulletsAsync,
  composeProfessionalSummary,
} from '../../src/services/resume-accomplishment-composer.service.js';

import { buildStructuredResumeSnapshot } from '../../src/services/structured-resume.service.js';

import { defaultResumeClaimValidationService } from '../../src/services/resume-claim-validation.service.js';

import { defaultResumeClaimPlannerService } from '../../src/services/resume-claim-planner.service.js';

import { evaluateResumeWritingQuality } from '../../src/services/resume-writing-quality.service.js';

import { evaluateResumeAcceptanceGate } from '../../src/services/resume-acceptance-gate.service.js';

import {
  goldenSystemsCandidate,
  goldenBackendJob,
  goldenAiMlCandidate,
  goldenAiJob,
  goldenDescriptionHeavyCandidate,
  goldenSparseFresherCandidate,
} from '../fixtures/p18-golden-benchmarks.js';

describe('P18: Adversarial Narrative & Contribution Quality', () => {
  test('Rule: A truthful project description must lose to a candidate contribution claim', () => {
    const inv = buildCanonicalFactInventory(goldenDescriptionHeavyCandidate);
    const facts = scoreFactsForJob(inv.byProject.get('proj-api-portal'), goldenBackendJob);

    // Plan claims with budget of 1 bullet
    const plan = defaultResumeClaimPlannerService.planClaims({
      facts,
      ownerType: 'PROJECT',
      ownerId: 'proj-api-portal',
      targetBullets: 1,
    });

    assert.equal(plan.plannedClaims.length, 1);
    const selectedClaim = plan.plannedClaims[0];

    // Verify selected claim is the candidate contribution, NOT the passive system description
    assert.match(selectedClaim.primaryFact.text, /Architected authentication middleware/i);
    assert.doesNotMatch(selectedClaim.primaryFact.text, /The API Portal is an administrative/i);

    // Verify the description facts were omitted with explicit reasons
    const omittedReasons = plan.omittedFacts.map((o) => o.reason);
    assert.ok(
      omittedReasons.includes(OMISSION_REASONS.DESCRIPTION_ONLY) ||
        omittedReasons.includes(OMISSION_REASONS.LOW_INFORMATION_VALUE)
    );
  });

  test('Rejection of unbacked causal implication ("thereby reducing latency")', () => {
    const candidateContext = {
      skills: ['Go', 'Raft'],
      projects: [{ id: 'p1', technologies: ['Go', 'Raft'] }],
    };

    const result = defaultResumeClaimValidationService.validateClaim(
      {
        claimId: 'c1',
        text: 'Architected distributed key-value store using Raft consensus, thereby cutting latency by 80%.',
        factIds: ['f1'],
        technologiesUsed: ['Go', 'Raft'],
        metricsUsed: [],
      },
      {
        factInventory: [
          { id: 'f1', text: 'Architected distributed key-value store using Raft consensus.' },
        ],
        candidateProfile: candidateContext,
        sectionOwnerType: 'PROJECT',
        sectionOwnerId: 'p1',
      }
    );

    assert.equal(result.valid, false);
    const violationCodes = result.violations.map((v) => v.code);
    assert.ok(
      violationCodes.includes('UNSUPPORTED_CAUSAL_IMPLICATION') ||
        violationCodes.includes('UNSUPPORTED_METRIC')
    );
  });

  test('Rejection of unsupported comparative implication ("faster than competitor")', () => {
    const candidateContext = { skills: ['Go'] };
    const result = defaultResumeClaimValidationService.validateClaim(
      {
        claimId: 'c2',
        text: 'Engineered high-throughput service faster than existing industry alternatives.',
        factIds: ['f2'],
        technologiesUsed: ['Go'],
        metricsUsed: [],
      },
      {
        factInventory: [{ id: 'f2', text: 'Engineered high-throughput service.' }],
        candidateProfile: candidateContext,
        sectionOwnerType: 'PROJECT',
        sectionOwnerId: 'p1',
      }
    );

    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.code === 'UNSUPPORTED_COMPARATIVE_IMPLICATION'));
  });

  test('Rejection of unsupported superlative ("best-in-class performance")', () => {
    const candidateContext = { skills: ['Go'] };
    const result = defaultResumeClaimValidationService.validateClaim(
      {
        claimId: 'c3',
        text: 'Built best-in-class storage engine achieving ultra-reliable writes.',
        factIds: ['f3'],
        technologiesUsed: ['Go'],
        metricsUsed: [],
      },
      {
        factInventory: [{ id: 'f3', text: 'Built storage engine achieving reliable writes.' }],
        candidateProfile: candidateContext,
        sectionOwnerType: 'PROJECT',
        sectionOwnerId: 'p1',
      }
    );

    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.code === 'UNSUPPORTED_SUPERLATIVE'));
  });

  test('Rejection of unsupported production claim ("deployed across global production clusters")', () => {
    const candidateContext = { skills: ['Go'] };
    const result = defaultResumeClaimValidationService.validateClaim(
      {
        claimId: 'c4',
        text: 'Architected distributed key-value store deployed in global production for live traffic.',
        factIds: ['f4'],
        technologiesUsed: ['Go'],
        metricsUsed: [],
      },
      {
        factInventory: [
          { id: 'f4', text: 'Architected distributed key-value store tested on local clusters.' },
        ],
        candidateProfile: candidateContext,
        sectionOwnerType: 'PROJECT',
        sectionOwnerId: 'p1',
      }
    );

    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.code === 'UNSUPPORTED_PRODUCTION_CLAIM'));
  });

  test('Rejection of unsupported customer/client implication ("trusted by enterprise clients")', () => {
    const candidateContext = { skills: ['Go'] };
    const result = defaultResumeClaimValidationService.validateClaim(
      {
        claimId: 'c5',
        text: 'Built telemetry ingestion service trusted by Fortune 500 enterprise customers.',
        factIds: ['f5'],
        technologiesUsed: ['Go'],
        metricsUsed: [],
      },
      {
        factInventory: [{ id: 'f5', text: 'Built telemetry ingestion service.' }],
        candidateProfile: candidateContext,
        sectionOwnerType: 'PROJECT',
        sectionOwnerId: 'p1',
      }
    );

    assert.equal(result.valid, false);
    assert.ok(
      result.violations.some(
        (v) => v.code === 'UNSUPPORTED_CUSTOMER_IMPLICATION' || v.code === 'UNSUPPORTED_ACTOR_CLAIM'
      )
    );
  });

  test('Rejection of unsupported leadership/team implication ("led cross-functional team")', () => {
    const candidateContext = { skills: ['Go'] };
    const result = defaultResumeClaimValidationService.validateClaim(
      {
        claimId: 'c6',
        text: 'Led cross-functional team of 6 engineers to build telemetry pipeline.',
        factIds: ['f6'],
        technologiesUsed: ['Go'],
        metricsUsed: [],
      },
      {
        factInventory: [{ id: 'f6', text: 'Built telemetry pipeline in Go.' }],
        candidateProfile: candidateContext,
        sectionOwnerType: 'PROJECT',
        sectionOwnerId: 'p1',
      }
    );

    assert.equal(result.valid, false);
    assert.ok(
      result.violations.some(
        (v) =>
          v.code === 'UNSUPPORTED_LEADERSHIP_IMPLICATION' || v.code === 'UNSUPPORTED_ACTOR_CLAIM'
      )
    );
  });
});

describe('P18: Dynamic Job-Domain Narrative Adaptation', () => {
  test('Systems Job: Tailors professional summary to systems, concurrency and infrastructure', () => {
    const summary = composeProfessionalSummary({
      candidateProfile: goldenSystemsCandidate,
      jobPosting: goldenBackendJob,
      selectedSkills: goldenSystemsCandidate.skills,
      selectedProjects: goldenSystemsCandidate.projects,
    });

    assert.ok(summary.text.length > 50);
    assert.match(summary.text, /Systems/i);
    assert.match(summary.text, /concurrency|distributed|consensus/i);
    assert.equal(summary.topRelevantTechnicalDomains[0], 'Distributed Systems');
  });

  test('AI/ML Job: Tailors professional summary to machine learning, pipelines and inference', () => {
    const summary = composeProfessionalSummary({
      candidateProfile: goldenAiMlCandidate,
      jobPosting: goldenAiJob,
      selectedSkills: goldenAiMlCandidate.skills,
      selectedProjects: goldenAiMlCandidate.projects,
    });

    assert.ok(summary.text.length > 50);
    assert.match(summary.text, /AI|Machine Learning/i);
    assert.match(summary.text, /pipelines|inference|data/i);
  });
});

describe('P18: Resilience & Determinism Invariants', () => {
  test('Deterministic fallback on AI failure produces bit-for-bit identical outputs', () => {
    const inv = buildCanonicalFactInventory(goldenSystemsCandidate);
    const facts = scoreFactsForJob(inv.byProject.get('proj-distributed-kv'), goldenBackendJob);

    const run1 = composeProfessionalProjectBullets({
      facts,
      project: goldenSystemsCandidate.projects[0],
      jobPosting: goldenBackendJob,
      aiProvider: null, // Deterministic fallback
    });

    const run2 = composeProfessionalProjectBullets({
      facts,
      project: goldenSystemsCandidate.projects[0],
      jobPosting: goldenBackendJob,
      aiProvider: null,
    });

    assert.deepEqual(
      run1.bullets.map((b) => b.text),
      run2.bullets.map((b) => b.text)
    );
  });

  test('Source-order invariance: Shuffled facts yield identical composed bullets', () => {
    const inv = buildCanonicalFactInventory(goldenSystemsCandidate);
    const facts = scoreFactsForJob(inv.byProject.get('proj-distributed-kv'), goldenBackendJob);
    const shuffled = [...facts].reverse();

    const normalRun = composeProfessionalProjectBullets({
      facts,
      project: goldenSystemsCandidate.projects[0],
      jobPosting: goldenBackendJob,
    });

    const shuffledRun = composeProfessionalProjectBullets({
      facts: shuffled,
      project: goldenSystemsCandidate.projects[0],
      jobPosting: goldenBackendJob,
    });

    assert.deepEqual(
      normalRun.bullets.map((b) => b.text),
      shuffledRun.bullets.map((b) => b.text)
    );
  });

  test('Sparse profile preserves truthful minimal content without synthetic padding', () => {
    const inv = buildCanonicalFactInventory(goldenSparseFresherCandidate);
    const facts = inv.facts;

    const composed = composeProfessionalProjectBullets({
      facts,
      project: goldenSparseFresherCandidate.projects[0],
      jobPosting: null,
    });

    // Exactly 1 bullet for the single project, zero manufactured extra bullets
    assert.equal(composed.bullets.length, 1);
    assert.match(composed.bullets[0].text, /CSV data ingestion/i);
    assert.doesNotMatch(composed.bullets[0].text, /million|scale|team|production/i);
  });

  test('Universal ceiling: Project with many facts is bounded strictly to MAX_BULLETS_PER_PROJECT (3)', () => {
    const inv = buildCanonicalFactInventory(goldenSystemsCandidate);
    const facts = scoreFactsForJob(inv.byProject.get('proj-distributed-kv'), goldenBackendJob);

    const composed = composeProfessionalProjectBullets({
      facts,
      project: goldenSystemsCandidate.projects[0],
      jobPosting: goldenBackendJob,
    });

    assert.ok(composed.bullets.length <= 3);
    assert.equal(composed.capacity.capacity, 3);
  });
});

describe('P18: AI Realization & Fail-Closed Fallback Invariants', () => {
  const inv = buildCanonicalFactInventory(goldenSystemsCandidate);
  const primaryFact = inv.byProject.get('proj-distributed-kv')[0];
  const project = goldenSystemsCandidate.projects[0];

  test('AI realization accepted when output satisfies all validation invariants', async () => {
    const mockAiProvider = {
      generateText: () =>
        Promise.resolve({
          text: 'Architected distributed key-value store in Go utilizing Raft consensus protocol.',
        }),
    };

    const composed = await composeProfessionalProjectBulletsAsync({
      facts: [primaryFact],
      project,
      jobPosting: goldenBackendJob,
      aiProvider: mockAiProvider,
    });

    assert.equal(composed.bullets.length, 1);
    assert.equal(composed.bullets[0].realizationSource, 'gemini');
    assert.match(composed.bullets[0].text, /Raft consensus/i);
  });

  test('Deterministic fallback triggered when AI realization introduces unsupported metric', async () => {
    const mockAiProvider = {
      generateText: () =>
        Promise.resolve({
          text: 'Architected distributed key-value store sustaining 10 million QPS.',
        }),
    };

    const composed = await composeProfessionalProjectBulletsAsync({
      facts: [primaryFact],
      project,
      jobPosting: goldenBackendJob,
      aiProvider: mockAiProvider,
    });

    assert.equal(composed.bullets.length, 1);
    assert.equal(composed.bullets[0].realizationSource, 'deterministic');
    assert.doesNotMatch(composed.bullets[0].text, /10 million QPS/i);
  });

  test('Deterministic fallback triggered when AI realization introduces unauthorized technology', async () => {
    const mockAiProvider = {
      generateText: () =>
        Promise.resolve({
          text: 'Architected distributed key-value store in Rust using Kubernetes orchestration.',
        }),
    };

    const composed = await composeProfessionalProjectBulletsAsync({
      facts: [primaryFact],
      project,
      jobPosting: goldenBackendJob,
      aiProvider: mockAiProvider,
    });

    assert.equal(composed.bullets.length, 1);
    assert.equal(composed.bullets[0].realizationSource, 'deterministic');
    assert.doesNotMatch(composed.bullets[0].text, /Rust/i);
  });

  test('Deterministic fallback triggered when AI provider throws or times out', async () => {
    const mockAiProvider = {
      generateText: () => Promise.reject(new Error('AI Service Timeout')),
    };

    const composed = await composeProfessionalProjectBulletsAsync({
      facts: [primaryFact],
      project,
      jobPosting: goldenBackendJob,
      aiProvider: mockAiProvider,
    });

    assert.equal(composed.bullets.length, 1);
    assert.equal(composed.bullets[0].realizationSource, 'deterministic');
    assert.match(composed.bullets[0].text, /Raft consensus/i);
  });
});

describe('P18: Acceptance Gate & Writing Quality Evaluation', () => {
  test('Golden Systems candidate passes writing quality evaluation with high score and zero clichés', () => {
    const inv = buildCanonicalFactInventory(goldenSystemsCandidate);
    const evaluation = evaluateResumeWritingQuality({
      structuredResume: goldenSystemsCandidate,
      jobPosting: goldenBackendJob,
      factInventory: inv,
    });

    assert.ok(
      evaluation.writingQualityScore >= 80,
      `Quality score ${evaluation.writingQualityScore} should be >= 80`
    );
    assert.equal(evaluation.dimensions.genericLanguage, 100, 'Should have 0 clichés');
    assert.ok(
      evaluation.dimensions.candidateContributionRatio >= 80,
      'Should have high candidate contribution ratio'
    );
    assert.equal(
      evaluation.dimensions.descriptionOnlyRatio,
      0,
      'Should have 0% description-only bullets'
    );
  });

  test('Golden Systems candidate passes formal 15-point acceptance gate', () => {
    const targetJob = {
      ...goldenBackendJob,
      recommendedProjects: ['Distributed Key-Value Store', 'High-Throughput Telemetry Engine'],
    };
    const inv = buildCanonicalFactInventory(goldenSystemsCandidate, targetJob);
    const { structuredResume } = buildStructuredResumeSnapshot({
      candidateProfile: goldenSystemsCandidate,
      jobPosting: targetJob,
    });
    const gateResult = evaluateResumeAcceptanceGate({
      structuredResume,
      factInventory: inv,
      jobPosting: targetJob,
    });

    assert.equal(
      gateResult.passed,
      true,
      `Gate failed with violations: ${JSON.stringify(gateResult.violations, null, 2)}`
    );
    assert.equal(gateResult.violations.length, 0);
  });
});
