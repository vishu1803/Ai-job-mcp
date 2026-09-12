/**
 * @file P18 Forensic Narrative Repair & Candidate Agency Integrity Test Suite
 *
 * Verifies candidate agency integrity, evidence ownership, and fail-closed acceptance:
 *
 * Core Invariant:
 * Technical architecture presence must never be converted into candidate agency.
 * Rendered candidate agency ⊆ Authorized candidate-owned contribution evidence.
 * RenderedClaims ⊆ AuthorizedCanonicalEvidence.
 *
 * Covers Tests A through H:
 * - Test A: Project description cannot create candidate agency (rejected with AGENCY_NOT_AUTHORIZED)
 * - Test B: Explicit implementation preserves candidate agency (CANDIDATE_ACTION)
 * - Test C: Explicit architecture preserves candidate agency (CANDIDATE_DESIGN_DECISION)
 * - Test D: Unowned outcome is rejected (AGENCY_NOT_AUTHORIZED)
 * - Test E: PDE Case 1 (1 authored + 1 description -> 1 bullet, no synthetic expansion)
 *           vs Case 2 (2 authored -> 2 bullets)
 * - Test F: Fallback parity with normal path (single validation gate, no bypass)
 * - Test G: Action vs Implementation distinct (areContributionClassesCompatible is false)
 * - Test H: No false narrative collapse (1 authored + 1 description -> no PROJECT_NARRATIVE_COLLAPSE)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCanonicalFactInventory,
  classifyEvidenceRole,
  classifyContributionClass,
  CONTRIBUTION_CLASSES,
  EVIDENCE_ROLES,
  areContributionClassesCompatible,
  AGENCY_LEVELS,
  AGENCY_SOURCES,
  isTrustedCandidateAgencySource,
  isAccomplishmentCandidate,
  assertRenderedCandidateAgencyInvariant,
  determineFactAgency,
  OMISSION_REASONS,
} from '../../src/services/candidate-fact-inventory.service.js';

import {
  composeProfessionalProjectBullets,
  composeProfessionalProjectBulletsAsync,
  composeProfessionalSummary,
} from '../../src/services/resume-accomplishment-composer.service.js';

import { defaultResumeClaimValidationService } from '../../src/services/resume-claim-validation.service.js';
import { evaluateResumeWritingQuality } from '../../src/services/resume-writing-quality.service.js';
import { defaultResumeClaimPlannerService } from '../../src/services/resume-claim-planner.service.js';

describe('Test A: Project description cannot create candidate agency', () => {
  const descriptionFact = {
    id: 'fact-desc-1',
    factId: 'fact-desc-1',
    projectId: 'proj-desc',
    text: 'High-throughput distributed telemetry and data exploration platform in Rust and TypeScript with streaming pipelines.',
    evidenceRole: EVIDENCE_ROLES.PROJECT_DESCRIPTION,
    contributionClass: CONTRIBUTION_CLASSES.DESCRIPTION,
    agency: {
      level: AGENCY_LEVELS.NONE,
      source: 'PASSIVE_DESCRIPTION',
      confidence: 1.0,
    },
    agencyLevel: AGENCY_LEVELS.NONE,
    semanticTopic: 'architecture',
    technologies: ['Rust', 'TypeScript'],
    metrics: {},
    renderable: true,
    confidence: 1.0,
    jobRelevance: 80,
  };

  test('Claim validation rejects candidate agency claims with AGENCY_NOT_AUTHORIZED', () => {
    // Attempt to assert candidate agency on a description fact
    const candidateClaim = {
      claimId: 'claim-synth-agency',
      text: 'Architected high-throughput distributed telemetry platform in Rust.',
      factIds: ['fact-desc-1'],
      technologies: ['Rust'],
    };

    const validation = defaultResumeClaimValidationService.validateClaim(candidateClaim, {
      factInventory: [descriptionFact],
      sectionOwnerType: 'PROJECT',
      sectionOwnerId: 'proj-desc',
    });

    assert.equal(validation.valid, false, 'Candidate agency claim must NOT be valid');
    assert.equal(validation.rejected, true, 'Candidate agency claim must be rejected');
    assert.ok(
      validation.violations.some((v) => v.code === 'AGENCY_NOT_AUTHORIZED'),
      'Must reject with AGENCY_NOT_AUTHORIZED'
    );
  });

  test('Candidate accomplishment bullet count is 0 and no synthetic "Architected..." bullet is produced', () => {
    const project = {
      id: 'proj-desc',
      name: 'Telemetry Explorer',
      technologies: ['Rust', 'TypeScript'],
      evidenceCount: 1,
    };

    const composed = composeProfessionalProjectBullets({
      facts: [descriptionFact],
      project,
      jobPosting: { title: 'Systems Engineer' },
    });

    // Bullets must NOT contain synthetic candidate accomplishment claims
    for (const bullet of composed.bullets) {
      assert.doesNotMatch(bullet.text, /^(Architected|Engineered|Designed|Built)\b/i);
    }
    // Candidate accomplishment bullet count is 0
    const accomplishmentBullets = composed.bullets.filter((b) =>
      /^(Architected|Engineered|Designed|Built|Developed|Implemented)\b/i.test(b.text)
    );
    assert.equal(accomplishmentBullets.length, 0, 'Must have 0 candidate accomplishment bullets');

    // Candidate accomplishment bullet count is 0 (or description-only if context bullet allowed)
    if (composed.bullets.length > 0) {
      assert.equal(composed.bullets.length, 1);
      assert.match(composed.bullets[0].text, /^High-throughput\b/i);
    } else {
      assert.ok(
        composed.omittedFacts.some(
          (o) =>
            o.factId === 'fact-desc-1' &&
            (o.reason === OMISSION_REASONS.DESCRIPTION_ONLY ||
              o.reason === OMISSION_REASONS.AGENCY_NOT_AUTHORIZED ||
              o.reason === OMISSION_REASONS.CAPACITY_LIMIT)
        ),
        'Description fact must be recorded in omittedFacts when omitted'
      );
    }
  });
});

describe('Test B: Explicit implementation preserves candidate agency', () => {
  const implFactText =
    'Engineered high-throughput distributed telemetry pipelines in Rust with Raft consensus.';

  test('Recognized as CANDIDATE_ACTION / candidate agency and authorized for accomplishment bullet', () => {
    const agency = determineFactAgency(implFactText, {
      candidateAuthored: true,
      sourceType: 'candidate_project_bullet',
    });
    assert.equal(agency.level, AGENCY_LEVELS.CANDIDATE);
    assert.equal(agency.source, AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET);

    const role = classifyEvidenceRole(implFactText);
    assert.equal(role, EVIDENCE_ROLES.ACCOMPLISHMENT);

    const fact = {
      id: 'fact-b-1',
      factId: 'fact-b-1',
      projectId: 'proj-b',
      text: implFactText,
      sourceType: 'candidate_project_bullet',
      candidateAuthored: true,
      evidenceRole: role,
      contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_ACTION,
      agency,
      agencyLevel: agency.level,
      agencySource: agency.source,
      semanticTopic: 'performance',
      technologies: ['Rust', 'Raft'],
      renderable: true,
      confidence: 1.0,
      jobRelevance: 85,
    };

    // Passes claim validation
    const validation = defaultResumeClaimValidationService.validateClaim(
      {
        claimId: 'claim-b-1',
        text: implFactText,
        factIds: ['fact-b-1'],
        technologies: ['Rust', 'Raft'],
      },
      {
        factInventory: [fact],
        sectionOwnerType: 'PROJECT',
        sectionOwnerId: 'proj-b',
      }
    );
    assert.equal(validation.valid, true, 'Explicit candidate implementation must pass validation');

    // Produces accomplishment bullet
    const composed = composeProfessionalProjectBullets({
      facts: [fact],
      project: { id: 'proj-b', name: 'Telemetry Pipeline', technologies: ['Rust', 'Raft'] },
    });
    assert.equal(composed.bullets.length, 1);
    assert.match(composed.bullets[0].text, /^Engineered\b/i);
  });
});

describe('Test C: Explicit architecture preserves candidate agency', () => {
  const archFactText =
    'Architected event streaming pipeline using Kafka and Rust, handling 50k events/sec.';

  test('Recognized as CANDIDATE_DESIGN_DECISION / candidate agency and authorized for accomplishment bullet', () => {
    const agency = determineFactAgency(archFactText, {
      candidateAuthored: true,
      sourceType: 'candidate_project_bullet',
    });
    assert.equal(agency.level, AGENCY_LEVELS.CANDIDATE);
    assert.equal(agency.source, AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET);

    const role = classifyEvidenceRole(archFactText);
    assert.equal(role, EVIDENCE_ROLES.DESIGN_DECISION);

    const fact = {
      id: 'fact-c-1',
      factId: 'fact-c-1',
      projectId: 'proj-c',
      text: archFactText,
      sourceType: 'candidate_project_bullet',
      candidateAuthored: true,
      evidenceRole: role,
      contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_DESIGN_DECISION,
      agency,
      agencyLevel: agency.level,
      agencySource: agency.source,
      semanticTopic: 'architecture',
      technologies: ['Kafka', 'Rust'],
      metrics: { raw: '50k events/sec', value: '50k' },
      renderable: true,
      confidence: 1.0,
      jobRelevance: 90,
    };

    // Passes claim validation
    const validation = defaultResumeClaimValidationService.validateClaim(
      {
        claimId: 'claim-c-1',
        text: archFactText,
        factIds: ['fact-c-1'],
        technologies: ['Kafka', 'Rust'],
        metricsUsed: ['50k events/sec'],
      },
      {
        factInventory: [fact],
        sectionOwnerType: 'PROJECT',
        sectionOwnerId: 'proj-c',
      }
    );
    assert.equal(validation.valid, true, 'Explicit architecture action must pass validation');

    // Produces accomplishment bullet
    const composed = composeProfessionalProjectBullets({
      facts: [fact],
      project: { id: 'proj-c', name: 'Event Streamer', technologies: ['Kafka', 'Rust'] },
    });
    assert.equal(composed.bullets.length, 1);
    assert.match(composed.bullets[0].text, /^Architected\b/i);
  });
});

describe('Test D: Unowned outcome is rejected', () => {
  const unownedOutcomeFact = {
    id: 'fact-d-1',
    factId: 'fact-d-1',
    projectId: 'proj-d',
    text: 'Platform processed 100k events/sec with 99.9% uptime.',
    evidenceRole: EVIDENCE_ROLES.OUTCOME,
    contributionClass: CONTRIBUTION_CLASSES.CONTEXT,
    agency: {
      level: AGENCY_LEVELS.NONE,
      source: 'PASSIVE_DESCRIPTION',
      confidence: 1.0,
    },
    agencyLevel: AGENCY_LEVELS.NONE,
    technologies: [],
    metrics: { raw: '100k events/sec' },
    renderable: true,
    confidence: 1.0,
  };

  test('Claiming unowned outcome as candidate accomplishment is rejected with AGENCY_NOT_AUTHORIZED', () => {
    // Attempting to claim unowned system outcome as candidate action
    const claim = {
      claimId: 'claim-d-1',
      text: 'Delivered platform processing 100k events/sec with 99.9% uptime.',
      factIds: ['fact-d-1'],
    };

    const validation = defaultResumeClaimValidationService.validateClaim(claim, {
      factInventory: [unownedOutcomeFact],
      sectionOwnerType: 'PROJECT',
      sectionOwnerId: 'proj-d',
    });

    assert.equal(validation.valid, false);
    assert.ok(
      validation.violations.some((v) => v.code === 'AGENCY_NOT_AUTHORIZED'),
      'Must reject unowned outcome claimed as candidate action with AGENCY_NOT_AUTHORIZED'
    );
  });
});

describe('Test E: PDE Case 1 vs Case 2', () => {
  const pdeProject = {
    id: 'proj-pde',
    name: 'Product Data Explorer',
    displayName: 'Product Data Explorer',
    technologies: ['Rust', 'TypeScript', 'Raft', 'WebSockets'],
    evidenceCount: 2,
  };

  test('Case 1: 1 candidate-authored fact + 1 project description fact renders 1 bullet, no synthetic expansion', () => {
    const case1Facts = [
      {
        id: 'fact-pde-authored',
        factId: 'fact-pde-authored',
        projectId: 'proj-pde',
        text: 'Engineered high-throughput distributed telemetry pipelines in Rust with Raft consensus.',
        sourceType: 'candidate_project_bullet',
        candidateAuthored: true,
        evidenceRole: EVIDENCE_ROLES.ACCOMPLISHMENT,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_ACTION,
        agency: { level: AGENCY_LEVELS.CANDIDATE, source: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET },
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
        semanticTopic: 'performance',
        technologies: ['Rust', 'Raft'],
        metrics: {},
        renderable: true,
        confidence: 1.0,
        jobRelevance: 85,
      },
      {
        id: 'fact-pde-desc',
        factId: 'fact-pde-desc',
        projectId: 'proj-pde',
        text: 'High-throughput distributed telemetry and data exploration platform in Rust and TypeScript with streaming pipelines.',
        sourceType: 'description',
        candidateAuthored: false,
        evidenceRole: EVIDENCE_ROLES.PROJECT_DESCRIPTION,
        contributionClass: CONTRIBUTION_CLASSES.DESCRIPTION,
        agency: { level: AGENCY_LEVELS.NONE, source: AGENCY_SOURCES.PROJECT_DESCRIPTION },
        agencyLevel: AGENCY_LEVELS.NONE,
        agencySource: AGENCY_SOURCES.PROJECT_DESCRIPTION,
        semanticTopic: 'architecture',
        technologies: ['Rust', 'TypeScript'],
        metrics: {},
        renderable: true,
        confidence: 1.0,
        jobRelevance: 80,
      },
    ];

    const composed = composeProfessionalProjectBullets({
      facts: case1Facts,
      project: pdeProject,
      jobPosting: { title: 'Senior Systems Engineer' },
      explicitBudget: 2,
    });

    // In Case 1: Preserves candidate-authored accomplishment bullet (Engineered...)
    assert.equal(composed.bullets.length, 1, 'Case 1 must render exactly 1 candidate accomplishment bullet');
    assert.match(composed.bullets[0].text, /^Engineered\b/i);

    // Project description fact does NOT become a second candidate-agency bullet (no Architected...)
    assert.equal(
      composed.bullets.some((b) => /^(Architected|Designed|Built)\b/i.test(b.text)),
      false,
      'Must NOT synthesize Architected/Designed/Built on description fact'
    );

    // Description fact must be recorded in omittedFacts
    assert.ok(
      composed.omittedFacts.some((o) => o.factId === 'fact-pde-desc'),
      'Description fact must be in omittedFacts'
    );
  });

  test('Case 2: 2 candidate-authored facts (1 implementation + 1 architecture) yields >= 2 bullets', () => {
    const case2Facts = [
      {
        id: 'fact-pde-1',
        factId: 'fact-pde-1',
        projectId: 'proj-pde',
        text: 'Engineered high-throughput distributed telemetry pipelines in Rust with Raft consensus.',
        sourceType: 'candidate_project_bullet',
        candidateAuthored: true,
        evidenceRole: EVIDENCE_ROLES.ACCOMPLISHMENT,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_ACTION,
        agency: { level: AGENCY_LEVELS.CANDIDATE, source: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET },
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
        semanticTopic: 'performance',
        technologies: ['Rust', 'Raft'],
        metrics: {},
        renderable: true,
        confidence: 1.0,
        jobRelevance: 85,
      },
      {
        id: 'fact-pde-2',
        factId: 'fact-pde-2',
        projectId: 'proj-pde',
        text: 'Architected distributed consensus engine and streaming platform in Rust.',
        sourceType: 'candidate_project_bullet',
        candidateAuthored: true,
        evidenceRole: EVIDENCE_ROLES.DESIGN_DECISION,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_DESIGN_DECISION,
        agency: { level: AGENCY_LEVELS.CANDIDATE, source: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET },
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
        semanticTopic: 'architecture',
        technologies: ['Rust'],
        metrics: {},
        renderable: true,
        confidence: 1.0,
        jobRelevance: 80,
      },
    ];

    const composed = composeProfessionalProjectBullets({
      facts: case2Facts,
      project: pdeProject,
      jobPosting: { title: 'Senior Systems Engineer' },
      explicitBudget: 2,
    });

    assert.equal(composed.bullets.length, 2, 'Case 2 must yield 2 distinct accomplishment bullets');
    assert.notEqual(composed.bullets[0].text, composed.bullets[1].text);
    assert.match(composed.bullets[0].text, /^(Engineered|Architected)\b/i);
    assert.match(composed.bullets[1].text, /^(Engineered|Architected)\b/i);
  });
});

describe('Test F: Fallback parity with normal path', () => {
  test('Fallback narrative generation under minimal evidence routes through validation gate', () => {
    // A single description-only fact with no candidate agency
    const descFact = {
      id: 'fact-fb-desc',
      factId: 'fact-fb-desc',
      projectId: 'proj-fb',
      text: 'Distributed key-value store in Rust using consensus algorithms.',
      evidenceRole: EVIDENCE_ROLES.PROJECT_DESCRIPTION,
      contributionClass: CONTRIBUTION_CLASSES.DESCRIPTION,
      agency: { level: AGENCY_LEVELS.NONE, source: 'PASSIVE_DESCRIPTION' },
      agencyLevel: AGENCY_LEVELS.NONE,
      semanticTopic: 'architecture',
      technologies: ['Rust'],
      renderable: true,
      confidence: 1.0,
    };

    const project = {
      id: 'proj-fb',
      name: 'KV Store',
      technologies: ['Rust'],
      evidenceCount: 1,
    };

    const composed = composeProfessionalProjectBullets({
      facts: [descFact],
      project,
    });

    // Fallback must NOT bypass claim validation to synthesize candidate agency!
    for (const bullet of composed.bullets) {
      assert.doesNotMatch(
        bullet.text,
        /^(Architected|Engineered|Designed|Built|Developed)\b/i,
        'Fallback must not create synthetic candidate agency'
      );
    }
  });
});

describe('Test G: Action vs Implementation contribution classes', () => {
  test('areContributionClassesCompatible returns false for CANDIDATE_ACTION and CANDIDATE_IMPLEMENTATION', () => {
    const actionClass = CONTRIBUTION_CLASSES.CANDIDATE_ACTION;
    const implClass = CONTRIBUTION_CLASSES.CANDIDATE_IMPLEMENTATION;
    const designClass = CONTRIBUTION_CLASSES.CANDIDATE_DESIGN_DECISION;
    const descClass = CONTRIBUTION_CLASSES.DESCRIPTION;

    // Action and Implementation are treated as distinct contribution classes
    assert.equal(
      areContributionClassesCompatible(actionClass, implClass),
      false,
      'Action and Implementation must NOT be compatible'
    );
    assert.equal(
      areContributionClassesCompatible(actionClass, designClass),
      false,
      'Action and Design Decision must NOT be compatible'
    );
    assert.equal(
      areContributionClassesCompatible(implClass, designClass),
      false,
      'Implementation and Design Decision must NOT be compatible'
    );
    assert.equal(
      areContributionClassesCompatible(actionClass, descClass),
      false,
      'Action and Description must NOT be compatible'
    );
  });
});

describe('Test H: No false narrative collapse', () => {
  test('1 candidate-authored fact + 1 project description fact does NOT trigger PROJECT_NARRATIVE_COLLAPSE', () => {
    // A resume rendering 1 authentic bullet for a project that has 1 candidate-authored fact + 1 description fact
    const structuredResume = {
      projects: [
        {
          id: 'proj-pde',
          name: 'Product Data Explorer',
          bullets: [
            {
              text: 'Engineered high-throughput distributed telemetry pipelines in Rust with Raft consensus.',
              composedFromFactIds: ['fact-pde-1'],
            },
          ],
        },
      ],
      experience: [],
    };

    const factInventory = {
      facts: [
        {
          id: 'fact-pde-1',
          factId: 'fact-pde-1',
          projectId: 'proj-pde',
          text: 'Engineered high-throughput distributed telemetry pipelines in Rust with Raft consensus.',
          evidenceRole: EVIDENCE_ROLES.ACCOMPLISHMENT,
          contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_ACTION,
          agencyLevel: AGENCY_LEVELS.CANDIDATE,
          renderable: true,
        },
        {
          id: 'fact-pde-2',
          factId: 'fact-pde-2',
          projectId: 'proj-pde',
          text: 'High-throughput distributed telemetry and data exploration platform in Rust and TypeScript with streaming pipelines.',
          evidenceRole: EVIDENCE_ROLES.PROJECT_DESCRIPTION,
          contributionClass: CONTRIBUTION_CLASSES.DESCRIPTION,
          agencyLevel: AGENCY_LEVELS.NONE,
          renderable: true,
        },
      ],
    };

    const quality = evaluateResumeWritingQuality({
      structuredResume,
      factInventory,
    });

    const collapseFinding = quality.findings.find(
      (f) => f.code === 'PROJECT_NARRATIVE_COLLAPSE'
    );
    assert.equal(
      collapseFinding,
      undefined,
      'Must NOT trigger PROJECT_NARRATIVE_COLLAPSE when 1 bullet is rendered for 1 candidate accomplishment fact'
    );
  });
});

describe('P18 Invariant: RenderedClaims <= AuthorizedCanonicalEvidence', () => {
  test('No unauthorized metrics or technologies are fabricated during composition', () => {
    const facts = [
      {
        id: 'fact-auth-1',
        factId: 'fact-auth-1',
        projectId: 'proj-auth',
        text: 'Engineered high-throughput telemetry stream processing in Rust.',
        evidenceRole: EVIDENCE_ROLES.ACCOMPLISHMENT,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_ACTION,
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        semanticTopic: 'performance',
        technologies: ['Rust'],
        metrics: {},
        renderable: true,
      },
    ];

    const project = {
      id: 'proj-auth',
      name: 'Telemetry Streamer',
      technologies: ['Rust'],
    };

    const composed = composeProfessionalProjectBullets({
      facts,
      project,
      jobPosting: { title: 'Backend Engineer' },
    });

    assert.equal(composed.bullets.length, 1);
    const bulletText = composed.bullets[0].text;

    // Must NOT invent metric numbers
    assert.doesNotMatch(bulletText, /\b\d+(?:%|ms|k|m|rps|qps)\b/i);
    // Must NOT invent technologies not in authorized facts or project
    assert.doesNotMatch(bulletText, /\b(Kafka|Kubernetes|AWS|GCP|Python|Docker)\b/i);
  });
});

describe('P18 Single Composition Authority: Sync and Async Parity', () => {
  test('Sync and Async deterministic realizations yield bit-for-bit identical outputs', async () => {
    const facts = [
      {
        id: 'fact-pde-1',
        factId: 'fact-pde-1',
        projectId: 'proj-pde',
        text: 'Engineered high-throughput distributed telemetry pipelines in Rust with Raft consensus.',
        evidenceRole: EVIDENCE_ROLES.ACCOMPLISHMENT,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_ACTION,
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        semanticTopic: 'performance',
        technologies: ['Rust', 'Raft'],
        metrics: {},
        renderable: true,
      },
      {
        id: 'fact-pde-2',
        factId: 'fact-pde-2',
        projectId: 'proj-pde',
        text: 'Architected distributed consensus engine and streaming platform in Rust.',
        evidenceRole: EVIDENCE_ROLES.DESIGN_DECISION,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_DESIGN_DECISION,
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        semanticTopic: 'architecture',
        technologies: ['Rust'],
        metrics: {},
        renderable: true,
      },
    ];

    const project = {
      id: 'proj-pde',
      name: 'Product Data Explorer',
      technologies: ['Rust', 'TypeScript', 'Raft'],
    };

    const syncResult = composeProfessionalProjectBullets({
      facts,
      project,
    });

    const asyncResult = await composeProfessionalProjectBulletsAsync({
      facts,
      project,
      aiProvider: null, // deterministic fallback
    });

    assert.equal(syncResult.bullets.length, asyncResult.bullets.length);
    for (let i = 0; i < syncResult.bullets.length; i++) {
      assert.equal(syncResult.bullets[i].text, asyncResult.bullets[i].text);
      assert.deepEqual(
        syncResult.bullets[i].composedFromFactIds,
        asyncResult.bullets[i].composedFromFactIds
      );
    }
    assert.deepEqual(syncResult.omittedFacts, asyncResult.omittedFacts);
    assert.deepEqual(syncResult.capacity, asyncResult.capacity);
  });
});

describe('P18 Dynamic Evidence-Weighted Summary Composition', () => {
  test('Adapts dynamically to job keywords and candidate evidence without hardcoded regex branches', () => {
    const candidate = {
      displayName: 'Alex Rivers',
      headline: 'Software Engineer',
      skills: [
        { name: 'Rust', slug: 'rust' },
        { name: 'Raft', slug: 'raft' },
        { name: 'Distributed Systems', slug: 'distributed-systems' },
        { name: 'Docker', slug: 'docker' },
      ],
      projects: [
        {
          id: 'proj-kv',
          name: 'Distributed KV Store',
          technologies: ['Rust', 'Raft'],
        },
      ],
    };

    const systemsJob = {
      title: 'Distributed Systems Engineer',
      requirements: ['Raft consensus', 'Distributed fault-tolerance', 'Rust'],
    };

    const summary = composeProfessionalSummary({
      candidateProfile: candidate,
      jobPosting: systemsJob,
      selectedSkills: candidate.skills,
      selectedProjects: candidate.projects,
    });

    assert.ok(summary.text.length > 50);
    assert.match(summary.text, /Systems/i);
    assert.match(summary.text, /Rust/i);
    assert.equal(summary.topRelevantTechnicalDomains[0], 'Distributed Systems');
    assert.ok(summary.topRelevantTechnologies.some((t) => t.toLowerCase() === 'rust'));
  });
});

describe('Test I: Repository active verb is not candidate agency', () => {
  const repoFactText = 'Implemented distributed caching using Redis.';

  test('sourceType = evidence with active verb yields agency.level !== CANDIDATE and isAccomplishmentCandidate === false', () => {
    const agency = determineFactAgency(repoFactText, { sourceType: 'evidence' });
    assert.notEqual(agency.level, AGENCY_LEVELS.CANDIDATE);
    assert.equal(agency.level, AGENCY_LEVELS.NONE);
    assert.equal(agency.source, AGENCY_SOURCES.GRAMMATICAL_ACTION_ONLY);
    assert.equal(agency.actionEvidence.hasActiveVerb, true);

    const fact = {
      id: 'fact-i-1',
      factId: 'fact-i-1',
      text: repoFactText,
      sourceType: 'evidence',
      renderable: true,
      agency,
      agencyLevel: agency.level,
      agencySource: agency.source,
    };

    assert.equal(isAccomplishmentCandidate(fact), false);
  });
});

describe('Test J: Candidate-authored active verb is candidate agency', () => {
  const authoredFactText = 'Implemented distributed caching using Redis.';

  test('sourceType = candidate_project_bullet and candidateAuthored = true yields agency.level === CANDIDATE and isAccomplishmentCandidate === true', () => {
    const agency = determineFactAgency(authoredFactText, {
      sourceType: 'candidate_project_bullet',
      candidateAuthored: true,
    });
    assert.equal(agency.level, AGENCY_LEVELS.CANDIDATE);
    assert.equal(agency.source, AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET);
    assert.equal(agency.actionEvidence.hasActiveVerb, true);

    const fact = {
      id: 'fact-j-1',
      factId: 'fact-j-1',
      text: authoredFactText,
      sourceType: 'candidate_project_bullet',
      candidateAuthored: true,
      renderable: true,
      agency,
      agencyLevel: agency.level,
      agencySource: agency.source,
      evidenceRole: EVIDENCE_ROLES.ACTION,
      contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_IMPLEMENTATION,
    };

    assert.equal(isAccomplishmentCandidate(fact), true);
  });
});

describe('Test K: Repository architecture wording is not candidate design', () => {
  const archRepoText = 'Architected streaming telemetry platform using Raft.';

  test('sourceType = evidence with architecture wording yields agency !== CANDIDATE without trusted ownership', () => {
    const agency = determineFactAgency(archRepoText, { sourceType: 'evidence' });
    assert.notEqual(agency.level, AGENCY_LEVELS.CANDIDATE);
    assert.equal(agency.level, AGENCY_LEVELS.NONE);

    const fact = {
      id: 'fact-k-1',
      factId: 'fact-k-1',
      text: archRepoText,
      sourceType: 'evidence',
      renderable: true,
      agency,
      agencyLevel: agency.level,
      agencySource: agency.source,
    };

    assert.equal(isAccomplishmentCandidate(fact), false);
  });
});

describe('Test L: Explicit ownership metadata overrides ambiguity', () => {
  const text = 'Distributed telemetry platform using Raft.';

  test('ownership = CANDIDATE yields agency.level === CANDIDATE', () => {
    const agency = determineFactAgency(text, { ownership: 'CANDIDATE' });
    assert.equal(agency.level, AGENCY_LEVELS.CANDIDATE);
    assert.equal(agency.source, AGENCY_SOURCES.EXPLICIT_METADATA);

    const fact = {
      id: 'fact-l-1',
      factId: 'fact-l-1',
      text,
      renderable: true,
      agency,
      agencyLevel: agency.level,
      agencySource: agency.source,
      evidenceRole: EVIDENCE_ROLES.DESIGN_DECISION,
      contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_DESIGN_DECISION,
    };

    assert.equal(isAccomplishmentCandidate(fact), true);
  });
});

describe('Test M: Inferred attribution remains non-renderable as accomplishment', () => {
  const text = 'Helped with distributed caching.';

  test('helped with wording yields agency.level === INFERRED and isAccomplishmentCandidate === false', () => {
    const agency = determineFactAgency(text);
    assert.equal(agency.level, AGENCY_LEVELS.INFERRED);
    assert.equal(agency.source, AGENCY_SOURCES.AMBIGUOUS_ATTRIBUTION);

    const fact = {
      id: 'fact-m-1',
      factId: 'fact-m-1',
      text,
      renderable: true,
      agency,
      agencyLevel: agency.level,
      agencySource: agency.source,
    };

    assert.equal(isAccomplishmentCandidate(fact), false);
  });
});

describe('Test N: Candidate-authored passive architecture may still be candidate-owned', () => {
  const text = 'Distributed telemetry platform with streaming pipelines.';

  test('candidateAuthored = true preserves candidate ownership without inventing an action verb', () => {
    const agency = determineFactAgency(text, { candidateAuthored: true });
    assert.equal(agency.level, AGENCY_LEVELS.CANDIDATE);
    assert.equal(agency.source, AGENCY_SOURCES.CANDIDATE_AUTHORED);
    assert.equal(agency.actionEvidence.hasActiveVerb, false);

    const contribution = classifyContributionClass(text, 'bullet', 'IMPLEMENTATION', {
      agency,
      candidateAuthored: true,
    });
    assert.equal(contribution, CONTRIBUTION_CLASSES.CANDIDATE_DESIGN_DECISION);

    const fact = {
      id: 'fact-n-1',
      factId: 'fact-n-1',
      projectId: 'proj-n',
      text,
      renderable: true,
      agency,
      agencyLevel: agency.level,
      agencySource: agency.source,
      evidenceRole: EVIDENCE_ROLES.DESIGN_DECISION,
      contributionClass: contribution,
      semanticTopic: 'architecture',
      technologies: ['Rust'],
      jobRelevance: 80,
    };

    const composed = composeProfessionalProjectBullets({
      facts: [fact],
      project: { id: 'proj-n', name: 'Telemetry Platform', technologies: ['Rust'] },
    });

    // Bullets should NOT invent a synthetic verb like "Architected" or "Designed"
    if (composed.bullets.length > 0) {
      assert.doesNotMatch(
        composed.bullets[0].text,
        /^(?:Architected|Designed|Engineered)\s+distributed\b/i
      );
    }
  });
});

describe('Test O: No hidden synthetic agency through fallback', () => {
  test('Repository-derived active-verb evidence fed into fallback realization is rejected via AGENCY_NOT_AUTHORIZED', () => {
    const repoFact = {
      id: 'fact-o-1',
      factId: 'fact-o-1',
      projectId: 'proj-o',
      text: 'Implemented distributed caching using Redis.',
      sourceType: 'evidence',
      candidateAuthored: false,
      renderable: true,
      agency: {
        level: AGENCY_LEVELS.NONE,
        source: AGENCY_SOURCES.REPOSITORY_EVIDENCE,
        confidence: 1.0,
      },
      agencyLevel: AGENCY_LEVELS.NONE,
      agencySource: AGENCY_SOURCES.REPOSITORY_EVIDENCE,
      evidenceRole: EVIDENCE_ROLES.IMPLEMENTATION,
      contributionClass: CONTRIBUTION_CLASSES.DESCRIPTION,
      semanticTopic: 'implementation',
      technologies: ['Redis'],
      confidence: 1.0,
      jobRelevance: 90,
    };

    const composed = composeProfessionalProjectBullets({
      facts: [repoFact],
      project: { id: 'proj-o', name: 'Caching Service', technologies: ['Redis'] },
    });

    // Zero accomplishment bullets accepted because agency is not authorized
    assert.equal(composed.bullets.length, 0);
    assert.ok(
      composed.omittedFacts.some(
        (o) =>
          o.reason === OMISSION_REASONS.AGENCY_NOT_AUTHORIZED ||
          o.reason === OMISSION_REASONS.DESCRIPTION_ONLY
      )
    );
  });
});

describe('Test P: Full rendered trace & Formal Invariant Assertion', () => {
  test('Every rendered accomplishment bullet traces to trusted candidate ownership and satisfies formal invariant', () => {
    const candFact = {
      id: 'fact-p-1',
      factId: 'fact-p-1',
      projectId: 'proj-p',
      text: 'Engineered high-throughput distributed telemetry pipelines in Rust with Raft consensus.',
      sourceType: 'candidate_project_bullet',
      candidateAuthored: true,
      renderable: true,
      agency: {
        level: AGENCY_LEVELS.CANDIDATE,
        source: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
        confidence: 1.0,
      },
      agencyLevel: AGENCY_LEVELS.CANDIDATE,
      agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
      evidenceRole: EVIDENCE_ROLES.ACTION,
      contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_ACTION,
      semanticTopic: 'performance',
      technologies: ['Rust', 'Raft'],
      confidence: 1.0,
      jobRelevance: 95,
      evidenceRefs: [{ evidenceId: 'ev-p-1', sourceType: 'USER_PROVIDED' }],
    };

    const composed = composeProfessionalProjectBullets({
      facts: [candFact],
      project: { id: 'proj-p', name: 'Telemetry Engine', technologies: ['Rust', 'Raft'] },
    });

    assert.equal(composed.bullets.length, 1);
    const bullet = composed.bullets[0];

    // Assert machine-readable trace
    assert.ok(bullet.text.startsWith('Engineered'));
    assert.deepEqual(bullet.composedFromFactIds, ['fact-p-1']);
    assert.ok(Array.isArray(bullet.evidenceRefs));

    // Verify machine-verifiable invariant assertion
    assert.equal(
      assertRenderedCandidateAgencyInvariant(composed.bullets, [candFact]),
      true
    );
  });
});
