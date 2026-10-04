/**
 * @file Phase 6 Candidate Intelligence & Evidence Graph Regression Test Suite
 *
 * Verifies that:
 * 1. Claim-only skills without project evidence resolve to UNVERIFIED_CLAIM / CLAIMED / SELF_DECLARED.
 * 2. Repository-verified skills elevate to MATCHED / VERIFIED with candidate-authored code citations.
 * 3. Strong repository evidence is recognized even if candidate did not explicitly claim the skill.
 * 4. Deterministic evidence precedence (Code usage > Manifest > README > Claim) is enforced.
 * 5. Zero cross-domain fabrication: Code cannot fabricate corporate tenure, degree fields, or certs.
 * 6. Evidence deduplication prevents multiple citations from inflating required counts or scores.
 * 7. Low-trust repository boundaries (node_modules, vendor) cannot produce VERIFIED evidence.
 * 8. Generated-code boundaries (__generated__, dist, build, lockfiles) are blocked from high trust.
 * 9. Technical skill is cleanly separated from professional tenure years.
 * 10. Project and internship experience remain strictly separated from corporate full-time tenure.
 * 11. Project relevance requires authentic code and dependency artifacts, not superficial titles.
 * 12. Education isolation: Having a degree does not fabricate unevidenced technical skills.
 * 13. Certification isolation: Knowing a technology does not satisfy certification requirements.
 * 14. Location vs work authorization isolation: Geographic residency never infers legal work authorization.
 * 15. Domain evidence grounds in genuine project domain metadata and architectural topics.
 * 16. Negative evidence semantics: Distinguishes UNKNOWN (unstated) from MISSING (contradicted/absent).
 * 17. Partial match semantics: Directional taxonomy relationships (BUILT_ON, IMPLEMENTS, ECOSYSTEM_OF).
 * 18. Conflicting evidence: Uncorroborated tenure claims do not override verified work history.
 * 19. Structured evidence explanations provide complete provenance, file paths, and confidence scores.
 * 20. MCP and Extension parity: Both consume the identical canonical candidate graph.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { EvidenceMatchingService } from '../../src/services/evidence-matching.service.js';
import { PrimaryEvidenceSelector } from '../../src/services/evidence/primary-evidence-selector.js';
import { ProjectRelevanceService } from '../../src/services/project-relevance.service.js';
import { serializeRequirementMatchesForExtension } from '../../src/routes/extension.routes.js';
import { handleAnalyzeJobFit } from '../../src/mcp/tools/career-read-tools.js';

const MOCK_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const MOCK_USER_ID = '00000000-0000-0000-0000-000000000002';
const MOCK_CANDIDATE_ID = '00000000-0000-0000-0000-000000000003';
const MOCK_REPO_ID = '00000000-0000-0000-0000-000000000004';

function makeContext() {
  return {
    tenantId: MOCK_TENANT_ID,
    userId: MOCK_USER_ID,
    role: 'MEMBER',
    scopes: ['career:read', 'career:write'],
  };
}

function makeJobDescription(requirements) {
  return {
    id: randomUUID(),
    tenantId: MOCK_TENANT_ID,
    title: 'Senior Software Engineer',
    companyName: 'Acme Corporation',
    requirements: requirements.map((r) => ({
      id: r.id || randomUUID(),
      category: r.category || 'SKILL',
      importance: r.importance || 'REQUIRED',
      weight: r.weight ?? 1.0,
      skillSlug: r.skillSlug || null,
      extractedValue: r.extractedValue || r.name,
      originalText: r.originalText || r.extractedValue || r.name,
      confidenceScore: r.confidenceScore ?? 0.9,
      normalizedCriteria: r.normalizedCriteria || {},
    })),
  };
}

function makeCandidateProfile(overrides = {}) {
  return {
    id: MOCK_CANDIDATE_ID,
    tenantId: MOCK_TENANT_ID,
    userId: MOCK_USER_ID,
    displayName: 'Test Candidate',
    skills: overrides.skills || [],
    projects: overrides.projects || [],
    resources: overrides.resources || [{ id: MOCK_REPO_ID, name: 'web-repo' }],
    identities: [],
    profileMetadata: overrides.profileMetadata || {},
    tenureMetrics: 'tenureMetrics' in overrides ? overrides.tenureMetrics : { professionalTenureYears: 3, professionalTenureMonths: 36 },
    workHistory: overrides.workHistory || [],
    education: overrides.education || [],
    jobPreferences: overrides.jobPreferences || {},
    location: overrides.location || 'India',
  };
}

describe('Phase 6 — Candidate Intelligence & Evidence Graph', () => {
  // ---------------------------------------------------------------------------
  // TEST 1 — Claim-only skill produces UNVERIFIED_CLAIM, CLAIMED, SELF_DECLARED
  // ---------------------------------------------------------------------------
  it('TEST 1 — Claim-only skill produces UNVERIFIED_CLAIM, CLAIMED, and SELF_DECLARED', () => {
    const context = makeContext();
    const jd = makeJobDescription([
      { name: 'Docker', skillSlug: 'docker', importance: 'REQUIRED' },
    ]);
    const candidate = makeCandidateProfile({
      skills: [
        {
          id: randomUUID(),
          slug: 'docker',
          name: 'Docker',
          provenanceStatus: 'SELF_DECLARED',
          truthCategory: 'CLAIMED',
          confidenceScore: 0.8,
          evidenceItems: [],
        },
      ],
      projects: [],
    });

    const analysis = EvidenceMatchingService.matchJobToCandidate(context, jd, candidate);
    const match = analysis.requirementMatches[0];

    assert.equal(match.matchStatus, 'UNVERIFIED_CLAIM');
    assert.equal(match.truthCategory, 'CLAIMED');
    assert.equal(match.candidateProvenance, 'SELF_DECLARED');
    assert.equal(match.isUserClaim, true);
    assert.equal(match.primaryEvidence, null);
  });

  // ---------------------------------------------------------------------------
  // TEST 2 — Repository-verified skill produces MATCHED, VERIFIED, REPO_ANALYSIS
  // ---------------------------------------------------------------------------
  it('TEST 2 — Repository-verified skill produces MATCHED, VERIFIED, and REPO_ANALYSIS', () => {
    const context = makeContext();
    const jd = makeJobDescription([
      { name: 'Node.js', skillSlug: 'node-js', importance: 'REQUIRED' },
    ]);
    const candidate = makeCandidateProfile({
      skills: [
        {
          id: randomUUID(),
          slug: 'node-js',
          name: 'Node.js',
          provenanceStatus: 'SELF_DECLARED',
          truthCategory: 'CLAIMED',
        },
      ],
      projects: [
        {
          id: randomUUID(),
          name: 'backend-api',
          slug: 'backend-api',
          evidenceItems: [
            {
              id: randomUUID(),
              skillSlug: 'node-js',
              skillName: 'Node.js',
              evidenceType: 'CODE_USAGE',
              filePath: 'src/server.js',
              resourceId: MOCK_REPO_ID,
              confidenceScore: 1.0,
            },
          ],
        },
      ],
    });

    const analysis = EvidenceMatchingService.matchJobToCandidate(context, jd, candidate);
    const match = analysis.requirementMatches[0];

    assert.equal(match.matchStatus, 'MATCHED');
    assert.equal(match.truthCategory, 'VERIFIED');
    assert.equal(match.candidateProvenance, 'VERIFIED');
    assert.equal(match.isUserClaim, false);
    assert.ok(match.primaryEvidence);
    assert.equal(match.primaryEvidence.filePath, 'src/server.js');
  });

  // ---------------------------------------------------------------------------
  // TEST 3 — Strong repository evidence recognized without any candidate claim
  // ---------------------------------------------------------------------------
  it('TEST 3 — Strong repository evidence is recognized without any candidate claim', () => {
    const context = makeContext();
    const jd = makeJobDescription([
      { name: 'TypeScript', skillSlug: 'typescript', importance: 'REQUIRED' },
    ]);
    // Candidate profile skills array does NOT list TypeScript at all
    const candidate = makeCandidateProfile({
      skills: [],
      projects: [
        {
          id: randomUUID(),
          name: 'ts-service',
          slug: 'ts-service',
          evidenceItems: [
            {
              id: randomUUID(),
              skillSlug: 'typescript',
              skillName: 'TypeScript',
              evidenceType: 'CODE_USAGE',
              filePath: 'src/index.ts',
              resourceId: MOCK_REPO_ID,
              confidenceScore: 1.0,
            },
          ],
        },
      ],
    });

    const analysis = EvidenceMatchingService.matchJobToCandidate(context, jd, candidate);
    const match = analysis.requirementMatches[0];

    assert.equal(match.matchStatus, 'MATCHED');
    assert.equal(match.truthCategory, 'VERIFIED');
    assert.equal(match.candidateProvenance, 'VERIFIED');
    assert.ok(match.primaryEvidence);
    assert.equal(match.primaryEvidence.filePath, 'src/index.ts');
  });

  // ---------------------------------------------------------------------------
  // TEST 4 — Evidence precedence hierarchy: Code usage > Manifest > README > Claim
  // ---------------------------------------------------------------------------
  it('TEST 4 — Deterministic evidence precedence: Code usage > Manifest > README > Claim', () => {
    const codeEv = {
      id: randomUUID(),
      evidenceType: 'CODE_IMPORT_USAGE',
      filePath: 'src/app.jsx',
      confidenceScore: 0.95,
      detectedAt: '2026-01-01T00:00:00Z',
    };
    const readmeEv = {
      id: randomUUID(),
      evidenceType: 'README_SPECIFICATION',
      filePath: 'README.md',
      confidenceScore: 0.95,
      detectedAt: '2026-01-01T00:00:00Z',
    };
    const lowTrustEv = {
      id: randomUUID(),
      evidenceType: 'CODE_IMPORT_USAGE',
      filePath: 'node_modules/pkg/index.js',
      confidenceScore: 1.0,
    };

    // Candidate-authored code beats README
    assert.ok(PrimaryEvidenceSelector.compare(codeEv, readmeEv) < 0);
    // Candidate-authored code beats low-trust node_modules
    assert.ok(PrimaryEvidenceSelector.compare(codeEv, lowTrustEv) < 0);

    // In matching service: Strong verified evidence is never downgraded by an existing weak claim
    const context = makeContext();
    const jd = makeJobDescription([{ name: 'React', skillSlug: 'react' }]);
    const candidate = makeCandidateProfile({
      skills: [{ id: randomUUID(), slug: 'react', name: 'React', provenanceStatus: 'CLAIMED' }],
      projects: [
        {
          id: randomUUID(),
          evidenceItems: [{ id: randomUUID(), skillSlug: 'react', evidenceType: 'CODE_USAGE', filePath: 'src/App.jsx' }],
        },
      ],
    });
    const analysis = EvidenceMatchingService.matchJobToCandidate(context, jd, candidate);
    assert.equal(analysis.requirementMatches[0].truthCategory, 'VERIFIED');
  });

  // ---------------------------------------------------------------------------
  // TEST 5 — Zero cross-domain fabrication: Repo code cannot fabricate tenure or certs
  // ---------------------------------------------------------------------------
  it('TEST 5 — Zero cross-domain fabrication: Repo code cannot fabricate corporate tenure or certs', () => {
    const context = makeContext();
    const jd = makeJobDescription([
      {
        name: '3+ years React experience',
        category: 'EXPERIENCE',
        importance: 'REQUIRED',
        normalizedCriteria: { minYears: 3 },
      },
      {
        name: 'AWS Certified Solutions Architect',
        category: 'CERTIFICATION',
        importance: 'REQUIRED',
      },
    ]);

    // Candidate has React repo code and AWS skill, but 0 professional corporate tenure and no certification
    const candidate = makeCandidateProfile({
      skills: [
        { id: randomUUID(), slug: 'react', name: 'React', provenanceStatus: 'VERIFIED' },
        { id: randomUUID(), slug: 'aws', name: 'AWS', provenanceStatus: 'VERIFIED' },
      ],
      projects: [
        {
          id: randomUUID(),
          metadata: { domain: 'fintech' },
          evidenceItems: [{ id: randomUUID(), skillSlug: 'react', evidenceType: 'CODE_USAGE', filePath: 'src/App.jsx' }],
        },
      ],
      tenureMetrics: { professionalTenureYears: 0, professionalTenureMonths: 0 },
      workHistory: [],
      profileMetadata: { certifications: [] },
    });

    const analysis = EvidenceMatchingService.matchJobToCandidate(context, jd, candidate);
    const expMatch = analysis.requirementMatches.find((m) => m.category === 'EXPERIENCE');
    const certMatch = analysis.requirementMatches.find((m) => m.category === 'CERTIFICATION');

    // Repo code must NOT satisfy 3 years corporate tenure
    assert.equal(expMatch.matchStatus, 'PARTIAL');
    assert.notEqual(expMatch.matchStatus, 'MATCHED');

    // Knowing AWS must NOT satisfy AWS Certification
    assert.equal(certMatch.matchStatus, 'UNKNOWN');
    assert.notEqual(certMatch.matchStatus, 'MATCHED');
  });

  // ---------------------------------------------------------------------------
  // TEST 6 — Evidence deduplication maintains single identity across profile & repos
  // ---------------------------------------------------------------------------
  it('TEST 6 — Evidence deduplication across profile, resume, and repos maintains single identity', () => {
    const context = makeContext();
    const jd = makeJobDescription([{ name: 'React', skillSlug: 'react', importance: 'REQUIRED' }]);

    // React appears in skills, and in 3 separate project evidence references
    const candidate = makeCandidateProfile({
      skills: [{ id: randomUUID(), slug: 'react', name: 'React', provenanceStatus: 'CLAIMED' }],
      projects: [
        {
          id: randomUUID(),
          evidenceItems: [
            { id: randomUUID(), skillSlug: 'react', evidenceType: 'CODE_USAGE', filePath: 'src/App.jsx' },
            { id: randomUUID(), skillSlug: 'react', evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY', filePath: 'package.json' },
          ],
        },
        {
          id: randomUUID(),
          evidenceItems: [
            { id: randomUUID(), skillSlug: 'react', evidenceType: 'CODE_USAGE', filePath: 'src/components/Header.jsx' },
          ],
        },
      ],
    });

    const analysis = EvidenceMatchingService.matchJobToCandidate(context, jd, candidate);
    // Evaluates exactly 1 canonical match without multiplying requirement counts
    assert.equal(analysis.requirementMatches.length, 1);
    assert.equal(analysis.requirementMatches[0].matchedSkillSlug, 'react');
    assert.equal(analysis.requirementMatches[0].matchStatus, 'MATCHED');
  });

  // ---------------------------------------------------------------------------
  // TEST 7 — Low-trust repository boundaries (node_modules, vendor) cannot produce VERIFIED
  // ---------------------------------------------------------------------------
  it('TEST 7 — Low-trust repository boundaries (node_modules, vendor) cannot produce VERIFIED status', () => {
    const context = makeContext();
    const jd = makeJobDescription([{ name: 'React', skillSlug: 'react', importance: 'REQUIRED' }]);

    const candidate = makeCandidateProfile({
      skills: [
        {
          id: randomUUID(),
          slug: 'react',
          name: 'React',
          provenanceStatus: 'INFERRED',
          evidenceItems: [
            {
              id: randomUUID(),
              skillSlug: 'react',
              evidenceType: 'CODE_USAGE',
              filePath: 'node_modules/react/index.js',
            },
          ],
        },
      ],
      projects: [],
    });

    const analysis = EvidenceMatchingService.matchJobToCandidate(context, jd, candidate);
    const match = analysis.requirementMatches[0];

    assert.equal(match.matchStatus, 'PARTIAL');
    assert.equal(match.truthCategory, 'INFERRED');
    assert.equal(match.claimLabel, '[Low-Trust Evidence Only]');
    assert.notEqual(match.truthCategory, 'VERIFIED');
  });

  // ---------------------------------------------------------------------------
  // TEST 8 — Generated-code boundaries (__generated__, dist, build, lockfiles) are blocked
  // ---------------------------------------------------------------------------
  it('TEST 8 — Generated-code boundaries (__generated__, .next, dist) are blocked from high trust', () => {
    const lockfileEv = { filePath: 'package-lock.json', evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY' };
    const distEv = { filePath: 'dist/bundle.js', evidenceType: 'CODE_USAGE' };
    const nextEv = { filePath: '.next/server/pages/index.js', evidenceType: 'CODE_USAGE' };
    const genEv = { filePath: 'src/__generated__/types.ts', evidenceType: 'CODE_USAGE' };
    const validSrcEv = { filePath: 'src/components/Button.tsx', evidenceType: 'CODE_USAGE' };

    assert.equal(PrimaryEvidenceSelector.isLowTrust(lockfileEv), true);
    assert.equal(PrimaryEvidenceSelector.isLowTrust(distEv), true);
    assert.equal(PrimaryEvidenceSelector.isLowTrust(nextEv), true);
    assert.equal(PrimaryEvidenceSelector.isLowTrust(genEv), true);
    assert.equal(PrimaryEvidenceSelector.isLowTrust(validSrcEv), false);
  });

  // ---------------------------------------------------------------------------
  // TEST 9 — Experience vs skill separation: Technical skill does not satisfy tenure
  // ---------------------------------------------------------------------------
  it('TEST 9 — Experience vs skill separation: Technical skill does not satisfy corporate tenure', () => {
    const context = makeContext();
    const jd = makeJobDescription([
      { name: 'Python', skillSlug: 'python', category: 'SKILL', importance: 'REQUIRED' },
      {
        name: '5+ years software engineering experience',
        category: 'EXPERIENCE',
        importance: 'REQUIRED',
        normalizedCriteria: { minYears: 5 },
      },
    ]);

    const candidate = makeCandidateProfile({
      skills: [{ id: randomUUID(), slug: 'python', name: 'Python', provenanceStatus: 'VERIFIED' }],
      tenureMetrics: { professionalTenureYears: 2, professionalTenureMonths: 24 },
      workHistory: [
        { company: 'Startup A', title: 'Developer', durationYears: 2, employmentType: 'FULL_TIME' },
      ],
    });

    const analysis = EvidenceMatchingService.matchJobToCandidate(context, jd, candidate);
    const skillMatch = analysis.requirementMatches.find((m) => m.category === 'SKILL');
    const expMatch = analysis.requirementMatches.find((m) => m.category === 'EXPERIENCE');
    const expGap = analysis.skillGaps.find((g) => g.requirementId === expMatch.requirementId);

    assert.equal(skillMatch.matchStatus, 'MATCHED');
    assert.equal(expMatch.matchStatus, 'PARTIAL');
    assert.equal(expGap?.severity, 'PARTIAL_TENURE');
  });

  // ---------------------------------------------------------------------------
  // TEST 10 — Project & internship experience separated from corporate tenure
  // ---------------------------------------------------------------------------
  it('TEST 10 — Project and internship experience remain separated from full-time corporate tenure', () => {
    const context = makeContext();
    const jd = makeJobDescription([
      {
        name: '2+ years professional experience',
        category: 'EXPERIENCE',
        importance: 'REQUIRED',
        normalizedCriteria: { minYears: 2 },
      },
    ]);

    // Candidate has 1 year internship and 0 corporate full-time tenure
    const candidate = makeCandidateProfile({
      workHistory: [
        {
          company: 'Acme',
          title: 'Software Engineering Intern',
          employmentType: 'INTERNSHIP',
          durationYears: 1,
        },
      ],
      tenureMetrics: null,
      profileMetadata: { experienceYears: null },
    });

    const analysis = EvidenceMatchingService.matchJobToCandidate(context, jd, candidate);
    const expMatch = analysis.requirementMatches[0];

    // Internships do NOT count as corporate tenure -> candidateTenureYears resolves to 0
    assert.equal(expMatch.matchStatus, 'PARTIAL');
    assert.ok(expMatch.explanation.includes('demonstrates 0 years'));
  });

  // ---------------------------------------------------------------------------
  // TEST 11 — Project relevance grounds in verified code artifacts, not titles
  // ---------------------------------------------------------------------------
  it('TEST 11 — Project relevance grounds in verified code artifacts, not superficial titles', () => {
    const context = makeContext();
    const jd = makeJobDescription([
      { id: randomUUID(), category: 'SKILL', skillSlug: 'react', importance: 'REQUIRED' },
      { id: randomUUID(), category: 'SKILL', skillSlug: 'postgresql', importance: 'REQUIRED' },
    ]);

    // Project 1: Named "Basic App", but has real React and Postgres code & config
    const authenticProject = {
      id: randomUUID(),
      tenantId: MOCK_TENANT_ID,
      name: 'Basic App',
      description: 'Simple web tool',
      skills: [
        { slug: 'react', name: 'React', category: 'FRAMEWORK' },
        { slug: 'postgresql', name: 'PostgreSQL', category: 'DATABASE' },
      ],
      evidence: [
        {
          id: randomUUID(),
          evidenceType: 'CODE_USAGE',
          sourceLocation: { filePath: 'src/App.jsx' },
          skillSlug: 'react',
          skillName: 'React',
          confidenceScore: 1.0,
        },
        {
          id: randomUUID(),
          evidenceType: 'CONFIG_SYNTAX_DECLARATION',
          sourceLocation: { filePath: 'db/schema.sql' },
          skillSlug: 'postgresql',
          skillName: 'PostgreSQL',
          confidenceScore: 1.0,
        },
      ],
      resources: [{ id: MOCK_REPO_ID, name: 'repo-1' }],
      metadata: {},
    };

    // Project 2: Named "Enterprise AI React Postgres Cloud Platform", but zero actual evidence
    const superficialProject = {
      id: randomUUID(),
      tenantId: MOCK_TENANT_ID,
      name: 'Enterprise AI React Postgres Cloud Platform',
      description: 'World-class AI platform',
      skills: [],
      evidence: [],
      resources: [{ id: randomUUID(), name: 'repo-2' }],
      metadata: {},
    };

    const resAuth = ProjectRelevanceService.computeProjectRelevance(context, jd, authenticProject);
    const resSuperficial = ProjectRelevanceService.computeProjectRelevance(context, jd, superficialProject);

    assert.ok(resAuth.relevanceScore > resSuperficial.relevanceScore);
    assert.ok(
      resAuth.scoreBreakdown.requirementCoverageScore >
        resSuperficial.scoreBreakdown.requirementCoverageScore
    );
  });

  // ---------------------------------------------------------------------------
  // TEST 12 — Education isolation: Academic degree does not fabricate technical skills
  // ---------------------------------------------------------------------------
  it('TEST 12 — Education isolation: Academic degree does not fabricate technical skill matches', () => {
    const context = makeContext();
    const jd = makeJobDescription([
      { name: "Bachelor's degree in Computer Science", category: 'EDUCATION', importance: 'REQUIRED' },
      { name: 'Kubernetes', skillSlug: 'kubernetes', category: 'SKILL', importance: 'REQUIRED' },
    ]);

    const candidate = makeCandidateProfile({
      skills: [], // No Kubernetes
      profileMetadata: {
        education: [{ degree: "Bachelor of Science in Computer Science", level: 'BACHELOR' }],
      },
    });

    const analysis = EvidenceMatchingService.matchJobToCandidate(context, jd, candidate);
    const eduMatch = analysis.requirementMatches.find((m) => m.category === 'EDUCATION');
    const skillMatch = analysis.requirementMatches.find((m) => m.category === 'SKILL');

    assert.equal(eduMatch.matchStatus, 'MATCHED');
    assert.equal(skillMatch.matchStatus, 'MISSING');
  });

  // ---------------------------------------------------------------------------
  // TEST 13 — Certification isolation: Skill claim or repo does not satisfy cert
  // ---------------------------------------------------------------------------
  it('TEST 13 — Certification isolation: Skill claim or repo does not satisfy certification', () => {
    const context = makeContext();
    const jd = makeJobDescription([
      { name: 'AWS Certified Developer', category: 'CERTIFICATION', importance: 'REQUIRED' },
    ]);

    const candidate = makeCandidateProfile({
      skills: [{ id: randomUUID(), slug: 'aws', name: 'AWS', provenanceStatus: 'VERIFIED' }],
      projects: [{ id: randomUUID(), evidenceItems: [{ id: randomUUID(), skillSlug: 'aws', evidenceType: 'CODE_USAGE', filePath: 'infra/aws.tf' }] }],
      profileMetadata: { certifications: [] },
    });

    const analysis = EvidenceMatchingService.matchJobToCandidate(context, jd, candidate);
    const certMatch = analysis.requirementMatches[0];

    // Must NOT be MATCHED simply because candidate knows AWS
    assert.equal(certMatch.matchStatus, 'UNKNOWN');
    assert.ok(certMatch.explanation.includes('unstated'));
  });

  // ---------------------------------------------------------------------------
  // TEST 14 — Location vs authorization isolation: Residency never infers visa status
  // ---------------------------------------------------------------------------
  it('TEST 14 — Location vs authorization isolation: Geographic residency does not infer legal work authorization', () => {
    const context = makeContext();
    const jd = makeJobDescription([
      { name: 'Authorized to work in India', category: 'ELIGIBILITY', importance: 'REQUIRED', normalizedCriteria: { acceptedCountries: ['India'] } },
    ]);

    // Candidate has location = 'India', but work authorization record is null/unstated
    const candidate = makeCandidateProfile({
      location: 'Bangalore, India',
      profileMetadata: { workAuthorization: null, visaStatus: null },
    });

    const analysis = EvidenceMatchingService.matchJobToCandidate(context, jd, candidate);
    const eligMatch = analysis.requirementMatches[0];

    // System must return UNKNOWN rather than fabricating authorization from location
    assert.equal(eligMatch.matchStatus, 'UNKNOWN');
    assert.ok(eligMatch.explanation.includes('unrecorded'));
  });

  // ---------------------------------------------------------------------------
  // TEST 15 — Domain evidence grounds in authentic project metadata
  // ---------------------------------------------------------------------------
  it('TEST 15 — Domain evidence grounds in authentic project metadata and repository domain topics', () => {
    const context = makeContext();
    const jd = makeJobDescription([
      { name: 'Fintech domain experience', category: 'DOMAIN', extractedValue: 'fintech', importance: 'PREFERRED' },
    ]);

    const candidate = makeCandidateProfile({
      projects: [
        {
          id: randomUUID(),
          name: 'Payment Processing Service',
          metadata: { domain: 'fintech' },
        },
      ],
    });

    const analysis = EvidenceMatchingService.matchJobToCandidate(context, jd, candidate);
    const domainMatch = analysis.requirementMatches[0];

    assert.equal(domainMatch.matchStatus, 'MATCHED');
    assert.ok(domainMatch.explanation.includes('fintech'));
  });

  // ---------------------------------------------------------------------------
  // TEST 16 — Negative evidence semantics: Absence of record yields UNKNOWN, not rejection
  // ---------------------------------------------------------------------------
  it('TEST 16 — Negative evidence semantics: Absence of record yields UNKNOWN rather than fabricated rejection', () => {
    const context = makeContext();
    const jd = makeJobDescription([
      { name: "Master's degree", category: 'EDUCATION', importance: 'REQUIRED', normalizedCriteria: { degreeLevel: 'MASTER' } },
    ]);

    // Candidate provides 0 education records
    const candidate = makeCandidateProfile({
      profileMetadata: { education: [], degree: null },
    });

    const analysis = EvidenceMatchingService.matchJobToCandidate(context, jd, candidate);
    const eduMatch = analysis.requirementMatches[0];

    // Absence of evidence is not proof of absence
    assert.equal(eduMatch.matchStatus, 'UNKNOWN');
    assert.ok(eduMatch.explanation.includes('absence of evidence is not proof of absence'));
  });

  // ---------------------------------------------------------------------------
  // TEST 17 — Partial match semantics: Directional taxonomy relationships
  // ---------------------------------------------------------------------------
  it('TEST 17 — Partial match semantics: Directional taxonomy relationships correctly evaluate PARTIAL vs MATCHED vs MISSING', () => {
    const context = makeContext();
    const jd = makeJobDescription([
      { name: 'REST API', skillSlug: 'rest-api', importance: 'REQUIRED' },
      { name: 'PostgreSQL', skillSlug: 'postgresql', importance: 'REQUIRED' },
      { name: 'Ruby on Rails', skillSlug: 'rails', importance: 'REQUIRED' },
    ]);

    // Candidate has Fastify (implements REST API) and MySQL (peer implements relational database with PostgreSQL)
    const candidate = makeCandidateProfile({
      skills: [
        { id: randomUUID(), slug: 'fastify', name: 'Fastify', provenanceStatus: 'VERIFIED', confidenceScore: 1.0 },
        { id: randomUUID(), slug: 'mysql', name: 'MySQL', provenanceStatus: 'VERIFIED', confidenceScore: 1.0 },
      ],
    });

    const analysis = EvidenceMatchingService.matchJobToCandidate(context, jd, candidate);
    const restMatch = analysis.requirementMatches.find((m) => m.skillSlug === 'rest-api');
    const pgMatch = analysis.requirementMatches.find((m) => m.skillSlug === 'postgresql');
    const railsMatch = analysis.requirementMatches.find((m) => m.skillSlug === 'rails');

    // Fastify implements REST API -> MATCHED
    assert.equal(restMatch.matchStatus, 'MATCHED');
    assert.equal(restMatch.relationshipType, 'IMPLEMENTS');

    // MySQL peer implements relational database with PostgreSQL -> PARTIAL
    assert.equal(pgMatch.matchStatus, 'PARTIAL');
    assert.equal(pgMatch.relationshipType, 'IMPLEMENTS');

    // Rails has no relationship to Fastify or MySQL -> MISSING
    assert.equal(railsMatch.matchStatus, 'MISSING');
  });

  // ---------------------------------------------------------------------------
  // TEST 18 — Conflicting evidence: Uncorroborated resume tenure does not override work history
  // ---------------------------------------------------------------------------
  it('TEST 18 — Conflicting evidence: Uncorroborated resume tenure claim does not override work history', () => {
    const context = makeContext();
    const jd = makeJobDescription([
      {
        name: '3+ years experience',
        category: 'EXPERIENCE',
        importance: 'REQUIRED',
        normalizedCriteria: { minYears: 3 },
      },
    ]);

    // Candidate resume claims 5 years, but explicit corporate work history proves only 1 year
    const candidate = makeCandidateProfile({
      profileMetadata: {
        userCustom: { resumeClaimTenure: '5 years' },
      },
      tenureMetrics: null,
      workHistory: [
        { company: 'Tech Corp', title: 'Software Engineer', durationYears: 1, employmentType: 'FULL_TIME' },
      ],
    });

    const analysis = EvidenceMatchingService.matchJobToCandidate(context, jd, candidate);
    const expMatch = analysis.requirementMatches[0];

    // Evaluated based on genuine verified work history (1 year), resulting in PARTIAL
    assert.equal(expMatch.matchStatus, 'PARTIAL');
    assert.ok(expMatch.explanation.includes('demonstrates 1 years'));
  });

  // ---------------------------------------------------------------------------
  // TEST 19 — Structured evidence explanation provides complete provenance and citations
  // ---------------------------------------------------------------------------
  it('TEST 19 — Structured evidence explanation provides complete provenance and citation trace', () => {
    const context = makeContext();
    const jd = makeJobDescription([{ name: 'React', skillSlug: 'react', importance: 'REQUIRED' }]);
    const candidate = makeCandidateProfile({
      projects: [
        {
          id: randomUUID(),
          name: 'frontend-app',
          resources: [{ id: MOCK_REPO_ID, name: 'frontend-app' }],
          evidenceItems: [
            {
              id: randomUUID(),
              skillSlug: 'react',
              skillName: 'React',
              evidenceType: 'CODE_USAGE',
              filePath: 'src/App.jsx',
              resourceId: MOCK_REPO_ID,
              confidenceScore: 0.98,
            },
          ],
        },
      ],
    });

    const analysis = EvidenceMatchingService.matchJobToCandidate(context, jd, candidate);
    const match = analysis.requirementMatches[0];
    const explanation = analysis.explanations[0];

    assert.equal(match.matchStatus, 'MATCHED');
    assert.equal(match.truthCategory, 'VERIFIED');
    assert.equal(match.candidateProvenance, 'VERIFIED');
    assert.ok(match.primaryEvidence);
    assert.equal(match.primaryEvidence.filePath, 'src/App.jsx');
    assert.equal(match.primaryEvidence.evidenceType, 'CODE_USAGE');
    assert.equal(match.primaryEvidence.resourceName, 'frontend-app');

    assert.equal(explanation.status, 'MATCHED');
    assert.ok(explanation.evidenceRefs.length > 0);
  });

  // ---------------------------------------------------------------------------
  // TEST 20 — MCP and Extension parity across canonical evidence graph
  // ---------------------------------------------------------------------------
  it('TEST 20 — MCP and Extension parity: Unified candidate evidence evaluation across all client surfaces', async () => {
    const jd = makeJobDescription([
      { name: 'Node.js', skillSlug: 'node-js', importance: 'REQUIRED' },
      { name: 'Docker', skillSlug: 'docker', importance: 'REQUIRED' },
    ]);

    const candidate = makeCandidateProfile({
      skills: [
        {
          id: randomUUID(),
          slug: 'node-js',
          name: 'Node.js',
          provenanceStatus: 'SELF_DECLARED',
          truthCategory: 'CLAIMED',
        },
        {
          id: randomUUID(),
          slug: 'docker',
          name: 'Docker',
          provenanceStatus: 'SELF_DECLARED',
          truthCategory: 'CLAIMED',
        },
      ],
      projects: [
        {
          id: randomUUID(),
          name: 'backend-service',
          evidenceItems: [
            { id: randomUUID(), skillSlug: 'node-js', evidenceType: 'CODE_USAGE', filePath: 'src/index.js', resourceId: MOCK_REPO_ID },
          ],
        },
      ],
    });

    // 1. Direct canonical matching service
    const directAnalysis = EvidenceMatchingService.matchJobToCandidate(makeContext(), jd, candidate);

    // 2. Extension serialization
    const extensionSerialized = serializeRequirementMatchesForExtension(directAnalysis);

    // Verified: Node.js (MATCHED) goes into matches; Docker (UNVERIFIED_CLAIM) goes into partialMatches
    assert.equal(extensionSerialized.matches.length, 1);
    assert.equal(extensionSerialized.matches[0].skillSlug, 'node-js');
    assert.equal(extensionSerialized.matches[0].truthCategory, 'VERIFIED');

    assert.equal(extensionSerialized.partialMatches.length, 1);
    assert.equal(extensionSerialized.partialMatches[0].skillSlug, 'docker');
    assert.equal(extensionSerialized.partialMatches[0].truthCategory, 'CLAIMED');

    // 3. MCP Handler integration test
    const mockProfileView = {
      candidate: {
        id: candidate.id,
        tenantId: MOCK_TENANT_ID,
        userId: MOCK_USER_ID,
        displayName: 'Test Candidate',
      },
      skills: candidate.skills,
      projects: candidate.projects,
      resources: [{ id: MOCK_REPO_ID, name: 'web-repo' }],
    };

    const mockDeps = {
      candidateProfileService: {
        getProfile: async () => mockProfileView,
        getCareerProfile: async () => null,
      },
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => [mockProfileView.candidate],
            }),
          }),
        }),
      },
      rateLimiter: { checkTenantLimit: () => {}, checkToolLimit: () => {} },
    };

    const mcpResult = await handleAnalyzeJobFit(
      { tenantId: MOCK_TENANT_ID },
      {
        candidateId: candidate.id,
        jobDescriptionText: 'We are seeking a backend engineer.\n\nRequired:\n- Node.js\n- Docker\n\nYou will build backend microservices.',
        jobTitle: 'Backend Engineer',
      },
      mockDeps
    );

    assert.ok(mcpResult);
    assert.equal(mcpResult.overallFit.analysisStatus, 'COMPLETE');
    assert.ok(mcpResult.requirementMatches.length >= 2);
    const mcpNodeMatch = mcpResult.requirementMatches.find((m) => m.skillSlug === 'node-js' || m.normalizedRequirement === 'Node.js');
    assert.ok(mcpNodeMatch);
    assert.equal(mcpNodeMatch.matchStatus, 'MATCHED');
  });
});
