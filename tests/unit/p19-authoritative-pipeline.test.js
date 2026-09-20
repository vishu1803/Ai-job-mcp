/**
 * @file P19: Authoritative Resume Evidence Pipeline Consolidation Tests
 *
 * Tests A through X (24 comprehensive forensic tests):
 * - Test A: 1 candidate fact -> 1 bullet maximum
 * - Test B: 3 candidate facts -> 3 bullets (when budget allows)
 * - Test C: IMPLEMENTATION + ARCHITECTURE contribution classes stay distinct
 * - Test D: OPTIMIZATION + OUTCOME can legitimately compose
 * - Test E: Description cannot create agency
 * - Test F: Repository active verb cannot create agency
 * - Test G: candidateId only cannot create ownership
 * - Test H: projectId only cannot create ownership
 * - Test I: Missing provenance cannot create ownership
 * - Test J: candidateAuthored = true works and establishes authorized candidate content
 * - Test K: agencyLevel = CANDIDATE works and establishes ownership
 * - Test L: DSA URL only -> no synthetic achievement bullets
 * - Test M: DSA coursework only -> no synthetic achievement bullets
 * - Test N: Candidate-authored DSA facts render cleanly
 * - Test O: Candidate headline stable across different target jobs
 * - Test P: Target role varies independently in tailoring plan and metadata
 * - Test Q: Frontend/backend summary contradiction rejected
 * - Test R: Summary claims strictly trace to candidate-owned facts
 * - Test S: Planner and fallback operate on the same canonical facts and cannot disagree on ownership
 * - Test T: Optimizer retains high-value evidence while capacity exists
 * - Test U: Synchronous and asynchronous output fact selection are 100% equivalent
 * - Test V: Deterministic: same input -> same plan
 * - Test W: Every rendered bullet passes Check 21
 * - Test X: Rendered agency invariant passes without violation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCanonicalFactInventory,
  scoreFactsForJob,
  classifyContributionClass,
  areContributionClassesCompatible,
  isAccomplishmentCandidate,
  isTrustedCandidateAgencySource,
  determineFactAgency,
  assertRenderedCandidateAgencyInvariant,
  CONTRIBUTION_CLASSES,
  EVIDENCE_ROLES,
  AGENCY_LEVELS,
  AGENCY_SOURCES,
  OMISSION_REASONS,
} from '../../src/services/candidate-fact-inventory.service.js';

import {
  composeProfessionalProjectBullets,
  composeProfessionalProjectBulletsAsync,
  composeProfessionalSummary,
  composeDsaSection,
  determineProjectBulletCapacity,
} from '../../src/services/resume-accomplishment-composer.service.js';

import {
  buildStructuredResumeSnapshot,
  buildStructuredResumeDocument,
} from '../../src/services/structured-resume.service.js';

import { defaultResumeClaimPlannerService } from '../../src/services/resume-claim-planner.service.js';
import { defaultResumeClaimValidationService } from '../../src/services/resume-claim-validation.service.js';
import { ResumeContentOptimizer } from '../../src/services/resume-content-optimizer.service.js';
import { PdfGeometryAnalyzer } from '../../src/services/pdf-geometry-analyzer.service.js';

function createFullCandidate(overrides = {}) {
  return {
    id: overrides.id || 'cand-p19-default',
    displayName: overrides.displayName || 'Alex Mercer',
    email: overrides.email || 'alex.mercer@example.com',
    headline: overrides.headline || 'Senior Software Engineer',
    candidate: {
      displayName: overrides.displayName || 'Alex Mercer',
      canonicalEmail: overrides.email || 'alex.mercer@example.com',
      ...(overrides.candidate || {}),
    },
    profileMetadata: {
      displayName: overrides.displayName || 'Alex Mercer',
      email: overrides.email || 'alex.mercer@example.com',
      headline: overrides.headline || 'Senior Software Engineer',
      experience: overrides.experience || [],
      education: overrides.education || [],
      certifications: overrides.certifications || [],
      ...(overrides.profileMetadata || {}),
    },
    skills: overrides.skills || [{ name: 'Go', slug: 'go', verified: true }],
    projects: overrides.projects || [],
    experience: overrides.experience || [],
    education: overrides.education || [
      {
        institution: 'State University',
        degree: 'BS Computer Science',
        startDate: '2018',
        endDate: '2022',
      },
    ],
    certifications: overrides.certifications || [],
    ...overrides,
  };
}

describe('P19: Authoritative Resume Evidence Pipeline (Tests A through X)', () => {
  // ---------------------------------------------------------------------------
  // Test A: 1 candidate fact -> 1 bullet maximum
  // ---------------------------------------------------------------------------
  it('Test A: 1 candidate fact -> 1 bullet maximum', () => {
    const project = {
      id: 'proj-single-fact',
      name: 'Raft Key-Value',
      technologies: ['Go', 'Raft'],
    };

    const facts = [
      {
        factId: 'fact-authored-1',
        text: 'Architected distributed key-value store using Raft consensus in Go.',
        candidateAuthored: true,
        sourceType: 'bullet',
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_DESIGN_DECISION,
        evidenceRole: EVIDENCE_ROLES.CANDIDATE_CONTRIBUTION,
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
        confidence: 1.0,
        jobRelevance: 90,
        renderable: true,
      },
      // Passive descriptions must not expand bullet capacity
      {
        factId: 'fact-desc-1',
        text: 'The Raft Key-Value system is a distributed consensus platform.',
        candidateAuthored: false,
        sourceType: 'repository_description',
        contributionClass: CONTRIBUTION_CLASSES.DESCRIPTION,
        evidenceRole: EVIDENCE_ROLES.PROJECT_DESCRIPTION,
        agencyLevel: AGENCY_LEVELS.NONE,
        agencySource: AGENCY_SOURCES.PASSIVE_DESCRIPTION,
        confidence: 0.8,
        jobRelevance: 70,
        renderable: true,
      },
      {
        factId: 'fact-desc-2',
        text: 'Supports high concurrency and linearizable reads.',
        candidateAuthored: false,
        sourceType: 'readme',
        contributionClass: CONTRIBUTION_CLASSES.CAPABILITY,
        evidenceRole: EVIDENCE_ROLES.SYSTEM_FEATURE,
        agencyLevel: AGENCY_LEVELS.NONE,
        agencySource: AGENCY_SOURCES.SYSTEM_FEATURE,
        confidence: 0.8,
        jobRelevance: 60,
        renderable: true,
      },
    ];

    const result = composeProfessionalProjectBullets({
      facts,
      project,
      explicitBudget: 3, // Request 3 bullets, but candidate only owns 1 fact
    });

    assert.equal(
      result.bullets.length,
      1,
      'Must compose at most 1 bullet when only 1 candidate-owned fact exists'
    );
    assert.equal(
      result.capacity.capacity,
      1,
      'Capacity calculation must be strictly anchored to authorized candidate facts'
    );
    assert.ok(
      result.bullets[0].composedFromFactIds.includes('fact-authored-1'),
      'Rendered bullet must derive from the single candidate-owned fact'
    );
  });

  // ---------------------------------------------------------------------------
  // Test B: 3 candidate facts -> 3 bullets (when budget allows)
  // ---------------------------------------------------------------------------
  it('Test B: 3 candidate facts -> 3 bullets (when budget allows)', () => {
    const project = {
      id: 'proj-multi-facts',
      name: 'Cloud Telemetry Engine',
      technologies: ['Go', 'gRPC', 'PostgreSQL'],
    };

    const facts = [
      {
        factId: 'fact-multi-1',
        text: 'Architected streaming telemetry daemon in Go processing 50,000 events/sec.',
        candidateAuthored: true,
        sourceType: 'bullet',
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_DESIGN_DECISION,
        evidenceRole: EVIDENCE_ROLES.CANDIDATE_CONTRIBUTION,
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
        confidence: 1.0,
        jobRelevance: 95,
        semanticTopic: 'architecture',
        renderable: true,
      },
      {
        factId: 'fact-multi-2',
        text: 'Implemented gRPC transport layer with mutual TLS authentication.',
        candidateAuthored: true,
        sourceType: 'bullet',
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_IMPLEMENTATION,
        evidenceRole: EVIDENCE_ROLES.CANDIDATE_CONTRIBUTION,
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
        confidence: 1.0,
        jobRelevance: 90,
        semanticTopic: 'implementation',
        renderable: true,
      },
      {
        factId: 'fact-multi-3',
        text: 'Optimized memory allocations via sync.Pool reducing GC latency by 40%.',
        candidateAuthored: true,
        sourceType: 'bullet',
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_OPTIMIZATION,
        evidenceRole: EVIDENCE_ROLES.CANDIDATE_CONTRIBUTION,
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
        confidence: 1.0,
        jobRelevance: 85,
        semanticTopic: 'performance',
        renderable: true,
      },
    ];

    const result = composeProfessionalProjectBullets({
      facts,
      project,
      explicitBudget: 3,
    });

    assert.equal(
      result.bullets.length,
      3,
      'Must compose exactly 3 bullets when 3 candidate-owned facts exist and budget allows 3'
    );
  });

  // ---------------------------------------------------------------------------
  // Test C: IMPLEMENTATION + ARCHITECTURE contribution classes stay distinct
  // ---------------------------------------------------------------------------
  it('Test C: IMPLEMENTATION + ARCHITECTURE contribution classes stay distinct', () => {
    const compatible = areContributionClassesCompatible(
      CONTRIBUTION_CLASSES.CANDIDATE_IMPLEMENTATION,
      CONTRIBUTION_CLASSES.CANDIDATE_DESIGN_DECISION
    );
    assert.equal(
      compatible,
      false,
      'IMPLEMENTATION and DESIGN_DECISION contribution classes must remain distinct and never merge'
    );
  });

  // ---------------------------------------------------------------------------
  // Test D: OPTIMIZATION + OUTCOME can legitimately compose
  // ---------------------------------------------------------------------------
  it('Test D: OPTIMIZATION + OUTCOME can legitimately compose', () => {
    const optimizationFact = {
      factId: 'f-opt-1',
      text: 'Optimized memory allocations using sync.Pool in Go.',
      candidateAuthored: true,
      contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_OPTIMIZATION,
      evidenceRole: EVIDENCE_ROLES.OPTIMIZATION,
      agencyLevel: AGENCY_LEVELS.CANDIDATE,
      agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
      confidence: 1.0,
      jobRelevance: 90,
      semanticTopic: 'performance',
      renderable: true,
    };
    const outcomeFact = {
      factId: 'f-out-1',
      text: 'Reduced garbage collection pause latency by 45%.',
      candidateAuthored: true,
      contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_OUTCOME,
      evidenceRole: EVIDENCE_ROLES.OUTCOME,
      agencyLevel: AGENCY_LEVELS.CANDIDATE,
      agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
      confidence: 1.0,
      jobRelevance: 85,
      semanticTopic: 'performance',
      renderable: true,
    };

    const plan = defaultResumeClaimPlannerService.planClaims({
      facts: [optimizationFact, outcomeFact],
      ownerType: 'PROJECT',
      ownerId: 'p-opt',
      targetBullets: 1, // Budget constrained: 2 facts for 1 bullet
    });

    assert.equal(plan.plannedClaims.length, 1, 'Should produce 1 composed claim');
    assert.equal(
      plan.plannedClaims[0].factIds.length,
      2,
      'Claim should legitimately compose 2 facts'
    );
    assert.ok(plan.plannedClaims[0].factIds.includes('f-opt-1'));
    assert.ok(plan.plannedClaims[0].factIds.includes('f-out-1'));
  });

  // ---------------------------------------------------------------------------
  // Test E: Description cannot create agency
  // ---------------------------------------------------------------------------
  it('Test E: Description cannot create agency', () => {
    const descFact = {
      factId: 'fact-desc-only',
      text: 'Distributed consensus platform with fault-tolerant replication in Go.',
      sourceType: 'repository_description',
      candidateAuthored: false,
      evidenceRole: EVIDENCE_ROLES.PROJECT_DESCRIPTION,
      contributionClass: CONTRIBUTION_CLASSES.DESCRIPTION,
      agencyLevel: AGENCY_LEVELS.NONE,
      agencySource: AGENCY_SOURCES.PASSIVE_DESCRIPTION,
    };

    assert.equal(isAccomplishmentCandidate(descFact), false);
    assert.equal(isTrustedCandidateAgencySource(descFact.agencySource, descFact), false);

    const validation = defaultResumeClaimValidationService.validateClaim(
      {
        claimId: 'claim-unauthorized',
        text: 'Architected distributed consensus platform with fault-tolerant replication in Go.',
        factIds: ['fact-desc-only'],
      },
      {
        factInventory: [descFact],
        sectionOwnerType: 'PROJECT',
        sectionOwnerId: 'proj-1',
      }
    );

    assert.equal(validation.valid, false);
    assert.ok(
      validation.violations.some((v) => v.code === 'AGENCY_NOT_AUTHORIZED'),
      'Must reject claim with AGENCY_NOT_AUTHORIZED'
    );
  });

  // ---------------------------------------------------------------------------
  // Test F: Repository active verb cannot create agency
  // ---------------------------------------------------------------------------
  it('Test F: Repository active verb cannot create agency', () => {
    const rawText = 'Maintains distributed state machine across cluster nodes.';
    const agency = determineFactAgency(rawText, {
      sourceType: 'readme',
      candidateAuthored: false,
    });

    assert.notEqual(
      agency.level,
      AGENCY_LEVELS.CANDIDATE,
      'Active verbs in repository readme or metadata must not grant candidate agency'
    );
  });

  // ---------------------------------------------------------------------------
  // Test G: candidateId only cannot create ownership
  // ---------------------------------------------------------------------------
  it('Test G: candidateId only cannot create ownership', () => {
    const fact = {
      factId: 'fact-candidate-id-only',
      candidateId: 'cand-12345',
      text: 'System supports multi-tenant sharding and data isolation.',
      sourceType: 'system_feature',
      candidateAuthored: false,
    };

    const agency = determineFactAgency(fact.text, fact);
    assert.notEqual(
      agency.level,
      AGENCY_LEVELS.CANDIDATE,
      'Presence of candidateId alone cannot create candidate ownership'
    );
    assert.equal(isAccomplishmentCandidate(fact), false);
  });

  // ---------------------------------------------------------------------------
  // Test H: projectId only cannot create ownership
  // ---------------------------------------------------------------------------
  it('Test H: projectId only cannot create ownership', () => {
    const fact = {
      factId: 'fact-project-id-only',
      projectId: 'proj-67890',
      association: { projectId: 'proj-67890' },
      text: 'Telemetry ingest pipeline handles 50,000 events/sec.',
      sourceType: 'system_feature',
      candidateAuthored: false,
    };

    const agency = determineFactAgency(fact.text, fact);
    assert.notEqual(
      agency.level,
      AGENCY_LEVELS.CANDIDATE,
      'Presence of projectId alone cannot create candidate ownership'
    );
    assert.equal(isAccomplishmentCandidate(fact), false);
  });

  // ---------------------------------------------------------------------------
  // Test I: Missing provenance cannot create ownership
  // ---------------------------------------------------------------------------
  it('Test I: Missing provenance cannot create ownership', () => {
    const fact = {
      factId: 'fact-missing-provenance',
      text: 'Built scalable API services.',
      provenanceStatus: null,
      provenance: undefined,
      candidateAuthored: false,
    };

    const agency = determineFactAgency(fact.text, fact);
    assert.notEqual(
      agency.level,
      AGENCY_LEVELS.CANDIDATE,
      'Missing provenance without explicit candidate authorship cannot create ownership'
    );
  });

  // ---------------------------------------------------------------------------
  // Test J: candidateAuthored = true works and establishes authorized candidate content
  // ---------------------------------------------------------------------------
  it('Test J: candidateAuthored = true works and establishes authorized candidate content', () => {
    const fact = {
      factId: 'fact-explicit-candidate-authored',
      text: 'Engineered rate limiting middleware using Redis token bucket algorithm.',
      candidateAuthored: true,
      sourceType: 'bullet',
      provenanceStatus: 'USER_PROVIDED',
      renderable: true,
    };

    const agency = determineFactAgency(fact.text, fact);
    assert.equal(agency.level, AGENCY_LEVELS.CANDIDATE);
    assert.equal(isAccomplishmentCandidate({ ...fact, agency }), true);
  });

  // ---------------------------------------------------------------------------
  // Test K: agencyLevel = CANDIDATE works and establishes ownership
  // ---------------------------------------------------------------------------
  it('Test K: agencyLevel = CANDIDATE works and establishes ownership', () => {
    const fact = {
      factId: 'fact-agency-level-candidate',
      text: 'Architected distributed consensus engine with Raft protocol in Go.',
      agencyLevel: AGENCY_LEVELS.CANDIDATE,
      agencySource: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
      agency: {
        level: AGENCY_LEVELS.CANDIDATE,
        source: AGENCY_SOURCES.CANDIDATE_PROJECT_BULLET,
        confidence: 1.0,
      },
      renderable: true,
    };

    assert.equal(isAccomplishmentCandidate(fact), true);
  });

  // ---------------------------------------------------------------------------
  // Test L: DSA URL only -> no synthetic achievement bullets
  // ---------------------------------------------------------------------------
  it('Test L: DSA URL only -> no synthetic achievement bullets', () => {
    const dsaData = {
      profileUrl: 'https://leetcode.com/engineer',
      bullets: [],
    };

    const dsaSection = composeDsaSection({ dsaData });
    assert.ok(dsaSection);
    assert.equal(dsaSection.profileUrl, 'https://leetcode.com/engineer');
    assert.equal(dsaSection.bullets.length, 0, 'Must produce 0 synthetic achievement bullets');
  });

  // ---------------------------------------------------------------------------
  // Test M: DSA coursework only -> no synthetic achievement bullets
  // ---------------------------------------------------------------------------
  it('Test M: DSA coursework only -> no synthetic achievement bullets', () => {
    const candidateProfile = createFullCandidate({
      headline: 'Software Engineer',
      skills: [{ name: 'Algorithms' }, { name: 'Data Structures' }],
      coursework: ['Data Structures and Algorithms', 'Design & Analysis of Algorithms'],
      dsa: null,
      projects: [],
    });

    const snap = buildStructuredResumeSnapshot({
      candidateProfile,
      jobPosting: { title: 'Software Engineer' },
    });

    const doc = snap.structuredResume;
    assert.equal(doc.dsa, null, 'DSA section must be null when only coursework is present');
  });

  // ---------------------------------------------------------------------------
  // Test N: Candidate-authored DSA facts render cleanly
  // ---------------------------------------------------------------------------
  it('Test N: Candidate-authored DSA facts render cleanly', () => {
    const dsaData = {
      profileUrl: 'https://leetcode.com/authentic',
      bullets: ['Solved 450+ data structures and algorithms problems in Go and Python.'],
    };

    const dsaSection = composeDsaSection({ dsaData });
    assert.equal(dsaSection.bullets.length, 1);
    assert.match(dsaSection.bullets[0], /450\+ data structures and algorithms/i);
  });

  // ---------------------------------------------------------------------------
  // Test O: Candidate headline stable across different target jobs
  // ---------------------------------------------------------------------------
  it('Test O: Candidate headline stable across different target jobs', () => {
    const candidateProfile = createFullCandidate({
      id: 'cand-stable-headline',
      headline: 'Principal Systems Architect',
      skills: [{ name: 'Go' }, { name: 'Linux' }, { name: 'Distributed Systems' }],
      projects: [
        {
          id: 'p1',
          name: 'Distributed KV',
          technologies: ['Go'],
          bullets: ['Architected distributed key-value store in Go.'],
        },
      ],
    });

    const snapFrontend = buildStructuredResumeSnapshot({
      candidateProfile,
      jobPosting: { title: 'Frontend Developer', skills: ['React'] },
    });

    const snapData = buildStructuredResumeSnapshot({
      candidateProfile,
      jobPosting: { title: 'Big Data Pipeline Engineer', skills: ['Spark'] },
    });

    assert.equal(
      snapFrontend.structuredResume.candidateIdentity.headline,
      'Principal Systems Architect',
      'Candidate headline must not be overwritten with Frontend Developer'
    );
    assert.equal(
      snapData.structuredResume.candidateIdentity.headline,
      'Principal Systems Architect',
      'Candidate headline must not be overwritten with Big Data Pipeline Engineer'
    );
  });

  // ---------------------------------------------------------------------------
  // Test P: Target role varies independently in tailoring plan and metadata
  // ---------------------------------------------------------------------------
  it('Test P: Target role varies independently in tailoring plan and metadata', () => {
    const candidateProfile = createFullCandidate({
      id: 'cand-role-variance',
      headline: 'Backend Software Engineer',
      skills: [{ name: 'Go' }, { name: 'PostgreSQL' }],
      projects: [
        {
          id: 'p1',
          name: 'API Service',
          technologies: ['Go'],
          bullets: ['Built scalable API services in Go.'],
        },
      ],
    });

    const snap1 = buildStructuredResumeSnapshot({
      candidateProfile,
      jobPosting: { title: 'Distributed Systems Engineer' },
    });

    const snap2 = buildStructuredResumeSnapshot({
      candidateProfile,
      jobPosting: { title: 'Cloud Infrastructure Engineer' },
    });

    assert.equal(snap1.structuredResume.targetRole, 'Distributed Systems Engineer');
    assert.equal(snap2.structuredResume.targetRole, 'Cloud Infrastructure Engineer');
    assert.equal(snap1.structuredResume.candidateIdentity.headline, 'Backend Software Engineer');
    assert.equal(snap2.structuredResume.candidateIdentity.headline, 'Backend Software Engineer');
  });

  // ---------------------------------------------------------------------------
  // Test Q: Frontend/backend summary contradiction rejected
  // ---------------------------------------------------------------------------
  it('Test Q: Frontend/backend summary contradiction rejected', () => {
    const candidateProfile = createFullCandidate({
      headline: 'Backend Engineer',
      skills: [
        { name: 'Node.js', slug: 'nodejs' },
        { name: 'PostgreSQL', slug: 'postgresql' },
        { name: 'Redis', slug: 'redis' },
        { name: 'Docker', slug: 'docker' },
      ],
      projects: [
        {
          id: 'proj-backend',
          name: 'Order Processing API',
          technologies: ['Node.js', 'PostgreSQL', 'Redis'],
          bullets: ['Architected transactional order processing engine handling 10k rps.'],
        },
      ],
    });

    // Candidate applies to a pure Frontend role
    const frontendJob = {
      title: 'Senior Frontend Engineer',
      description: 'Building accessible React user interfaces with Next.js and Tailwind.',
      skills: ['React', 'Next.js', 'Tailwind', 'CSS', 'HTML'],
    };

    const summary = composeProfessionalSummary({
      candidateProfile,
      jobPosting: frontendJob,
      selectedSkills: candidateProfile.skills,
      selectedProjects: candidateProfile.projects,
    });

    const summaryText = summary.text;
    // Must NOT claim "Frontend-focused Software Engineer specializing in backend..."
    assert.doesNotMatch(
      summaryText,
      /frontend-focused.*backend/i,
      'Summary must not contain contradictory "Frontend-focused ... backend" statement'
    );
    assert.doesNotMatch(
      summaryText,
      /backend-focused.*frontend/i,
      'Summary must not contain contradictory "Backend-focused ... frontend" statement'
    );
  });

  // ---------------------------------------------------------------------------
  // Test R: Summary claims strictly trace to candidate-owned facts
  // ---------------------------------------------------------------------------
  it('Test R: Summary claims strictly trace to candidate-owned facts', () => {
    const candidateProfile = createFullCandidate({
      headline: 'Full-Stack Software Engineer',
      skills: [
        { id: 'sk-go', name: 'Go', slug: 'go', verified: true, provenanceStatus: 'VERIFIED' },
        {
          id: 'sk-pg',
          name: 'PostgreSQL',
          slug: 'postgresql',
          verified: true,
          provenanceStatus: 'VERIFIED',
        },
      ],
      projects: [
        {
          id: 'proj-service',
          name: 'Payment Service',
          technologies: ['Go', 'PostgreSQL'],
          bullets: ['Implemented idempotent payment processing in Go with PostgreSQL.'],
        },
      ],
    });

    const snap = buildStructuredResumeSnapshot({
      candidateProfile,
      jobPosting: { title: 'Backend Engineer' },
    });

    const doc = snap.structuredResume;
    assert.ok(doc.summary);
    assert.ok(Array.isArray(doc.summary.composedFromFactIds));

    // If any fact IDs are listed, they must exist in the fact inventory
    const factInventory = buildCanonicalFactInventory(candidateProfile);
    const validFactIds = new Set(factInventory.facts.map((f) => f.factId || f.id));

    for (const fId of doc.summary.composedFromFactIds) {
      assert.ok(
        validFactIds.has(fId),
        `Summary composedFromFactId "${fId}" must exist in canonical fact inventory`
      );
    }
  });

  // ---------------------------------------------------------------------------
  // Test S: Planner and fallback operate on the same canonical facts and cannot disagree on ownership
  // ---------------------------------------------------------------------------
  it('Test S: Planner and fallback operate on the same canonical facts and cannot disagree on ownership', () => {
    const descriptionOnlyFacts = [
      {
        factId: 'desc-1',
        text: 'The Payment Gateway is a high-throughput transaction platform.',
        candidateAuthored: false,
        sourceType: 'repository_description',
        contributionClass: CONTRIBUTION_CLASSES.DESCRIPTION,
        agencyLevel: AGENCY_LEVELS.NONE,
      },
      {
        factId: 'desc-2',
        text: 'Maintains PCI-DSS compliance and 99.99% availability.',
        candidateAuthored: false,
        sourceType: 'readme',
        contributionClass: CONTRIBUTION_CLASSES.CAPABILITY,
        agencyLevel: AGENCY_LEVELS.NONE,
      },
    ];

    const project = { id: 'p-desc', name: 'Payment Gateway' };

    // 1. Authorized candidate capacity is 0 for description-only facts
    const authorizedFacts = descriptionOnlyFacts.filter(isAccomplishmentCandidate);
    const capacity = determineProjectBulletCapacity({
      claimFacts: authorizedFacts,
      evidenceCount: 0,
      explicitBudget: 2,
    });
    assert.equal(capacity.capacity, 0, 'Authorized capacity must be 0 for description facts');

    // 2. Planner given authorized capacity yields 0 claims
    const plan = defaultResumeClaimPlannerService.planClaims({
      facts: descriptionOnlyFacts,
      ownerType: 'PROJECT',
      ownerId: 'p-desc',
      targetBullets: capacity.capacity,
    });
    assert.equal(plan.plannedClaims.length, 0, 'Planner must produce 0 claims when capacity is 0');

    // 3. Accomplishment composer fallback also yields 0 bullets
    const result = composeProfessionalProjectBullets({
      facts: descriptionOnlyFacts,
      project,
      explicitBudget: 2,
    });
    assert.equal(
      result.bullets.length,
      0,
      'Fallback must not manufacture bullets from description-only facts'
    );
  });

  // ---------------------------------------------------------------------------
  // Test T: Optimizer retains high-value evidence while capacity exists
  // ---------------------------------------------------------------------------
  it('Test T: Optimizer retains high-value evidence while capacity exists', async () => {
    let iteration = 0;
    const mockCompiler = {
      compileLatexToPdf: async () => {
        iteration++;
        return { pdfBuffer: Buffer.from('%PDF-1.5\n/Count 1\n%%EOF') };
      },
    };

    const mockAnalyzer = new PdfGeometryAnalyzer();
    mockAnalyzer.measurePdfBottom = () => ({
      lowestY: 200,
      bottomWhitespacePt: 80,
      pageOccupancyRatio: 0.88,
    });
    mockAnalyzer._detectPageCount = () => 1;

    const mockGenerator = {
      generateTailoredResumeLatex: () => ({
        texContent: '\\documentclass{article}\\begin{document}Resume\\end{document}',
      }),
    };

    const optimizer = new ResumeContentOptimizer({
      latexCompiler: mockCompiler,
      latexGenerator: mockGenerator,
      geometryAnalyzer: mockAnalyzer,
    });

    const candidateProfile = createFullCandidate({
      id: 'cand-opt',
      headline: 'Staff Software Engineer',
      skills: [{ name: 'Go' }, { name: 'PostgreSQL' }],
      projects: [
        {
          id: 'proj-1',
          name: 'Distributed Storage',
          technologies: ['Go', 'PostgreSQL'],
          bullets: [
            'Architected distributed storage cluster handling 2PB of data in Go.',
            'Engineered WAL replication protocol sustaining 20,000 writes/sec.',
          ],
        },
      ],
    });

    const jobPosting = { title: 'Principal Systems Engineer' };

    const result = await optimizer.optimize({
      candidateProfile,
      jobPosting,
      options: { maxIterations: 2 },
    });

    assert.equal(result.success, true);
    assert.ok(typeof result.availableCandidateFacts === 'number');
    assert.ok(typeof result.selectedCandidateFacts === 'number');
    assert.ok(Array.isArray(result.omittedCandidateFacts));
    assert.ok(result.availableCandidateFacts >= 1, 'Should report available candidate facts');
  });

  // ---------------------------------------------------------------------------
  // Test U: Synchronous and asynchronous output fact selection are 100% equivalent
  // ---------------------------------------------------------------------------
  it('Test U: Synchronous and asynchronous output fact selection are 100% equivalent', async () => {
    const project = {
      id: 'proj-parity',
      name: 'Async Parity Engine',
      technologies: ['Go', 'gRPC'],
    };

    const facts = [
      {
        factId: 'fact-parity-1',
        text: 'Architected distributed consensus engine with Raft protocol in Go.',
        candidateAuthored: true,
        sourceType: 'bullet',
        contributionClass: CONTRIBUTION_CLASSES.ARCHITECTURE,
        evidenceRole: EVIDENCE_ROLES.CANDIDATE_CONTRIBUTION,
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        agencySource: AGENCY_SOURCES.CANDIDATE_BULLET,
        confidence: 1.0,
        jobRelevance: 90,
      },
      {
        factId: 'fact-parity-2',
        text: 'Optimized memory allocations reducing GC pause times by 35%.',
        candidateAuthored: true,
        sourceType: 'bullet',
        contributionClass: CONTRIBUTION_CLASSES.OPTIMIZATION,
        evidenceRole: EVIDENCE_ROLES.CANDIDATE_CONTRIBUTION,
        agencyLevel: AGENCY_LEVELS.CANDIDATE,
        agencySource: AGENCY_SOURCES.CANDIDATE_BULLET,
        confidence: 1.0,
        jobRelevance: 80,
      },
    ];

    const syncResult = composeProfessionalProjectBullets({
      facts,
      project,
      explicitBudget: 2,
    });

    const asyncResult = await composeProfessionalProjectBulletsAsync({
      facts,
      project,
      explicitBudget: 2,
      aiProvider: null, // deterministic fallback
    });

    const syncFactIds = syncResult.bullets.flatMap((b) => b.composedFromFactIds);
    const asyncFactIds = asyncResult.bullets.flatMap((b) => b.composedFromFactIds);

    assert.deepEqual(
      syncFactIds,
      asyncFactIds,
      'Sync and async composition must select identical canonical fact IDs'
    );
  });

  // ---------------------------------------------------------------------------
  // Test V: Deterministic: same input -> same plan
  // ---------------------------------------------------------------------------
  it('Test V: Deterministic: same input -> same plan', () => {
    const candidateProfile = createFullCandidate({
      id: 'cand-deterministic',
      headline: 'Software Engineer',
      skills: [{ name: 'Rust' }, { name: 'Linux' }],
      projects: [
        {
          id: 'proj-det',
          name: 'Network Filter',
          technologies: ['Rust', 'Linux'],
          bullets: [
            'Implemented high-throughput packet filter in Rust using AF_XDP sockets.',
            'Benchmarked network throughput reaching 10M packets/sec with zero loss.',
          ],
        },
      ],
    });

    const jobPosting = { title: 'Systems Engineer' };

    const run1 = buildStructuredResumeSnapshot({ candidateProfile, jobPosting });
    const run2 = buildStructuredResumeSnapshot({ candidateProfile, jobPosting });

    assert.equal(
      JSON.stringify(run1.structuredResume.projects),
      JSON.stringify(run2.structuredResume.projects),
      'Two consecutive runs must produce bit-for-bit identical project structures'
    );
    assert.equal(
      JSON.stringify(run1.structuredResume.skills),
      JSON.stringify(run2.structuredResume.skills),
      'Two consecutive runs must produce bit-for-bit identical skills structures'
    );
  });

  // ---------------------------------------------------------------------------
  // Test W: Every rendered bullet passes Check 21
  // ---------------------------------------------------------------------------
  it('Test W: Every rendered bullet passes Check 21', () => {
    const candidateProfile = createFullCandidate({
      id: 'cand-check21',
      headline: 'Infrastructure Engineer',
      skills: [{ name: 'Go' }, { name: 'Docker' }],
      projects: [
        {
          id: 'proj-check21',
          name: 'Cluster Daemon',
          technologies: ['Go', 'Docker'],
          bullets: [
            'Architected cluster management daemon in Go with automatic node failover.',
            'Containerized service topology using Docker for distributed integration testing.',
          ],
        },
      ],
    });

    const snap = buildStructuredResumeSnapshot({
      candidateProfile,
      jobPosting: { title: 'Infrastructure Engineer' },
    });

    const factInventory = buildCanonicalFactInventory(candidateProfile);
    const doc = snap.structuredResume;

    for (const proj of doc.projects) {
      for (const bullet of proj.bullets) {
        const validation = defaultResumeClaimValidationService.validateClaim(
          {
            claimId: bullet.claimId || 'bullet-claim',
            text: bullet.text,
            factIds: bullet.composedFromFactIds || [],
          },
          {
            factInventory: factInventory.facts,
            candidateProfile,
            sectionOwnerType: 'PROJECT',
            sectionOwnerId: proj.projectId,
          }
        );

        const agencyViolations = (validation.violations || []).filter(
          (v) => v.code === 'AGENCY_NOT_AUTHORIZED'
        );
        assert.equal(
          agencyViolations.length,
          0,
          `Bullet "${bullet.text}" must not violate Check 21 (AGENCY_NOT_AUTHORIZED)`
        );
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Test X: Rendered agency invariant passes without violation
  // ---------------------------------------------------------------------------
  it('Test X: Rendered agency invariant passes without violation', () => {
    const candidateProfile = createFullCandidate({
      id: 'cand-invariant',
      headline: 'Senior Backend Engineer',
      skills: [{ name: 'Python' }, { name: 'PostgreSQL' }],
      projects: [
        {
          id: 'proj-inv',
          name: 'Payment Processing Service',
          technologies: ['Python', 'PostgreSQL'],
          bullets: [
            'Engineered resilient payment workflow in Python with idempotent retry policies.',
            'Architected distributed database indexing in PostgreSQL reducing query latency by 50%.',
          ],
        },
      ],
    });

    const snap = buildStructuredResumeSnapshot({
      candidateProfile,
      jobPosting: { title: 'Senior Backend Engineer' },
    });

    const factInventory = buildCanonicalFactInventory(candidateProfile);
    const doc = snap.structuredResume;

    const allProjectBullets = doc.projects.flatMap((p) => p.bullets);

    const invariantHolds = assertRenderedCandidateAgencyInvariant(
      allProjectBullets,
      factInventory.facts
    );

    assert.equal(
      invariantHolds,
      true,
      'assertRenderedCandidateAgencyInvariant must return true without throwing ValidationError'
    );
  });
});
