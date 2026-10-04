/**
 * @file Phase 3 Evidence Resolution & Candidate Evidence Consistency Regression Test Suite
 *
 * Verifies that:
 * - Claim-only skills without project evidence resolve to UNVERIFIED_CLAIM / CLAIMED / SELF_DECLARED
 * - Verified project evidence elevates self-declared claims to MATCHED / VERIFIED
 * - Missing requirements resolve to MISSING / MISSING_EVIDENCE / NONE
 * - Evidence Priority: Stronger verified evidence wins over weak claims and is never downgraded
 * - Low-trust evidence (node_modules/vendor) never grants VERIFIED status to candidate claims
 * - Skill aliases normalize to identical canonical identities for matching
 * - Free text and job description prose never falsely verify candidate skills
 * - Unified pipeline parity is maintained across MCP and Extension serialization
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { EvidenceMatchingService } from '../../src/services/evidence-matching.service.js';
import { SkillTaxonomyEngine } from '../../src/domain/career/skill-taxonomy.js';
import { serializeRequirementMatchesForExtension } from '../../src/routes/extension.routes.js';

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
    title: 'Software Engineer',
    companyName: 'Acme Corp',
    requirements: requirements.map((r) => ({
      id: r.id || randomUUID(),
      category: r.category || 'SKILL',
      importance: r.importance || 'REQUIRED',
      weight: r.weight ?? 1.0,
      skillSlug: r.skillSlug || null,
      extractedValue: r.extractedValue || r.name,
      originalText: r.originalText || r.extractedValue || r.name,
      confidenceScore: r.confidenceScore ?? 0.9,
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
    profileMetadata: {},
    tenureMetrics: { professionalTenureYears: 3, professionalTenureMonths: 36 },
    workHistory: [],
    education: [],
    jobPreferences: {},
    location: 'India',
  };
}

describe('Phase 3 — Evidence Resolution & Candidate Evidence Consistency', () => {
  // ---------------------------------------------------------------------------
  // TEST 1 — Claim-only skill produces UNVERIFIED_CLAIM / CLAIMED / SELF_DECLARED
  // ---------------------------------------------------------------------------
  it('TEST 1 — Claim-only skill produces UNVERIFIED_CLAIM, CLAIMED, and SELF_DECLARED', () => {
    const jobDescription = makeJobDescription([
      { name: 'Node.js', skillSlug: 'node-js', importance: 'REQUIRED' },
    ]);

    const candidateProfile = makeCandidateProfile({
      skills: [
        {
          id: randomUUID(),
          slug: 'node-js',
          name: 'Node.js',
          category: 'RUNTIME',
          provenanceStatus: 'SELF_DECLARED',
          truthCategory: 'CLAIMED',
          confidenceScore: 0.9,
          evidenceCount: 0,
          primaryEvidence: null,
          evidenceItems: [],
        },
      ],
      projects: [],
    });

    const analysis = EvidenceMatchingService.matchJobToCandidate(
      makeContext(),
      jobDescription,
      candidateProfile
    );

    assert.equal(analysis.requirementMatches.length, 1);
    const match = analysis.requirementMatches[0];

    assert.equal(match.matchStatus, 'UNVERIFIED_CLAIM');
    assert.equal(match.truthCategory, 'CLAIMED');
    assert.equal(match.candidateProvenance, 'SELF_DECLARED');
    assert.equal(match.isUserClaim, true);
    assert.equal(match.primaryEvidence, null);
    assert.match(match.explanation, /UNVERIFIED_CLAIM/);
  });

  // ---------------------------------------------------------------------------
  // TEST 2 — Verified project evidence elevates self-declared claim to MATCHED
  // ---------------------------------------------------------------------------
  it('TEST 2 — Verified project evidence elevates self-declared claim to MATCHED and VERIFIED', () => {
    const jobDescription = makeJobDescription([
      { name: 'Node.js', skillSlug: 'node-js', importance: 'REQUIRED' },
    ]);

    const candidateProfile = makeCandidateProfile({
      skills: [
        {
          id: randomUUID(),
          slug: 'node-js',
          name: 'Node.js',
          category: 'RUNTIME',
          provenanceStatus: 'SELF_DECLARED',
          truthCategory: 'CLAIMED',
          confidenceScore: 0.9,
          evidenceCount: 0,
          primaryEvidence: null,
          evidenceItems: [],
        },
      ],
      projects: [
        {
          id: randomUUID(),
          name: 'Backend API Service',
          slug: 'backend-api-service',
          evidence: [
            {
              id: randomUUID(),
              resourceId: MOCK_REPO_ID,
              resourceName: 'web-repo',
              skillSlug: 'node-js',
              skillName: 'Node.js',
              evidenceType: 'CODE_USAGE',
              filePath: 'src/server.js',
              confidenceScore: 0.95,
            },
          ],
        },
      ],
    });

    const analysis = EvidenceMatchingService.matchJobToCandidate(
      makeContext(),
      jobDescription,
      candidateProfile
    );

    assert.equal(analysis.requirementMatches.length, 1);
    const match = analysis.requirementMatches[0];

    assert.equal(match.matchStatus, 'MATCHED');
    assert.equal(match.truthCategory, 'VERIFIED');
    assert.equal(match.candidateProvenance, 'VERIFIED');
    assert.equal(match.isUserClaim, false);
    assert.ok(match.primaryEvidence);
    assert.equal(match.primaryEvidence.filePath, 'src/server.js');
    assert.equal(match.primaryEvidence.evidenceType, 'CODE_USAGE');
  });

  // ---------------------------------------------------------------------------
  // TEST 3 — Missing evidence produces MISSING, MISSING_EVIDENCE, and NONE
  // ---------------------------------------------------------------------------
  it('TEST 3 — Missing evidence produces MISSING, MISSING_EVIDENCE, and NONE', () => {
    const jobDescription = makeJobDescription([
      { name: 'Kubernetes', skillSlug: 'kubernetes', importance: 'REQUIRED' },
    ]);

    const candidateProfile = makeCandidateProfile({
      skills: [
        {
          id: randomUUID(),
          slug: 'react',
          name: 'React',
          category: 'FRAMEWORK',
          provenanceStatus: 'VERIFIED',
          truthCategory: 'VERIFIED',
        },
      ],
      projects: [],
    });

    const analysis = EvidenceMatchingService.matchJobToCandidate(
      makeContext(),
      jobDescription,
      candidateProfile
    );

    assert.equal(analysis.requirementMatches.length, 1);
    const match = analysis.requirementMatches[0];

    assert.equal(match.matchStatus, 'MISSING');
    assert.equal(match.truthCategory, 'MISSING_EVIDENCE');
    assert.equal(match.candidateProvenance, 'NONE');
    assert.equal(match.isUserClaim, false);
    assert.equal(match.primaryEvidence, null);
    assert.match(match.explanation, /MISSING/);
  });

  // ---------------------------------------------------------------------------
  // TEST 4 — Evidence priority: Weak claim never downgrades strong verified evidence
  // ---------------------------------------------------------------------------
  it('TEST 4 — Evidence priority: Weak claim never downgrades strong verified evidence', () => {
    const jobDescription = makeJobDescription([
      { name: 'Docker', skillSlug: 'docker', importance: 'PREFERRED' },
    ]);

    const candidateProfile = makeCandidateProfile({
      skills: [
        {
          id: randomUUID(),
          slug: 'docker',
          name: 'Docker',
          category: 'TOOL',
          provenanceStatus: 'SELF_DECLARED',
          truthCategory: 'CLAIMED',
          confidenceScore: 0.85,
        },
      ],
      projects: [
        {
          id: randomUUID(),
          name: 'Microservice Deployment',
          slug: 'microservice-deployment',
          evidence: [
            {
              id: randomUUID(),
              resourceId: MOCK_REPO_ID,
              resourceName: 'infra-repo',
              skillSlug: 'docker',
              skillName: 'Docker',
              evidenceType: 'CONFIG_SYNTAX_DECLARATION',
              filePath: 'docker-compose.yml',
              confidenceScore: 0.9,
            },
          ],
        },
      ],
    });

    const analysis = EvidenceMatchingService.matchJobToCandidate(
      makeContext(),
      jobDescription,
      candidateProfile
    );

    const match = analysis.requirementMatches[0];
    assert.equal(match.matchStatus, 'MATCHED');
    assert.equal(match.truthCategory, 'VERIFIED');
    assert.equal(match.candidateProvenance, 'VERIFIED');
    assert.equal(match.isUserClaim, false);
    assert.ok(match.primaryEvidence);
    assert.equal(match.primaryEvidence.filePath, 'docker-compose.yml');
  });

  // ---------------------------------------------------------------------------
  // TEST 5 — Low-trust evidence (node_modules/vendor) never grants VERIFIED status
  // ---------------------------------------------------------------------------
  it('TEST 5 — Low-trust evidence (node_modules/vendor) never grants VERIFIED status', () => {
    const jobDescription = makeJobDescription([
      { name: 'Lodash', skillSlug: 'lodash', importance: 'REQUIRED' },
    ]);

    const candidateProfile = makeCandidateProfile({
      skills: [
        {
          id: randomUUID(),
          slug: 'lodash',
          name: 'Lodash',
          category: 'LIBRARY',
          provenanceStatus: 'SELF_DECLARED',
          truthCategory: 'CLAIMED',
          confidenceScore: 0.8,
        },
      ],
      projects: [
        {
          id: randomUUID(),
          name: 'Web App',
          slug: 'web-app',
          evidence: [
            {
              id: randomUUID(),
              resourceId: MOCK_REPO_ID,
              resourceName: 'web-repo',
              skillSlug: 'lodash',
              skillName: 'Lodash',
              evidenceType: 'CODE_USAGE',
              filePath: 'node_modules/lodash/index.js',
              confidenceScore: 0.5,
            },
          ],
        },
      ],
    });

    const analysis = EvidenceMatchingService.matchJobToCandidate(
      makeContext(),
      jobDescription,
      candidateProfile
    );

    const match = analysis.requirementMatches[0];
    // node_modules evidence must NOT elevate a self-declared claim to VERIFIED
    assert.equal(match.matchStatus, 'UNVERIFIED_CLAIM');
    assert.equal(match.truthCategory, 'CLAIMED');
    assert.equal(match.candidateProvenance, 'SELF_DECLARED');
    assert.notEqual(match.candidateProvenance, 'VERIFIED');
  });

  // ---------------------------------------------------------------------------
  // TEST 6 — Skill aliases canonical matching parity
  // ---------------------------------------------------------------------------
  it('TEST 6 — Skill aliases canonical matching parity', () => {
    // 1. Node.js aliases
    const n1 = SkillTaxonomyEngine.normalizeSkill('Node');
    const n2 = SkillTaxonomyEngine.normalizeSkill('Node.js');
    const n3 = SkillTaxonomyEngine.normalizeSkill('nodejs');
    assert.equal(n1.canonicalSlug, 'node-js');
    assert.equal(n2.canonicalSlug, 'node-js');
    assert.equal(n3.canonicalSlug, 'node-js');

    // 2. PostgreSQL aliases
    const p1 = SkillTaxonomyEngine.normalizeSkill('Postgres');
    const p2 = SkillTaxonomyEngine.normalizeSkill('PostgreSQL');
    const p3 = SkillTaxonomyEngine.normalizeSkill('pg');
    assert.equal(p1.canonicalSlug, 'postgresql');
    assert.equal(p2.canonicalSlug, 'postgresql');
    assert.equal(p3.canonicalSlug, 'postgresql');

    // 3. REST API aliases
    const r1 = SkillTaxonomyEngine.normalizeSkill('REST');
    const r2 = SkillTaxonomyEngine.normalizeSkill('REST API');
    const r3 = SkillTaxonomyEngine.normalizeSkill('RESTful API');
    const r4 = SkillTaxonomyEngine.normalizeSkill('REST APIs');
    assert.equal(r1.canonicalSlug, 'rest-api');
    assert.equal(r2.canonicalSlug, 'rest-api');
    assert.equal(r3.canonicalSlug, 'rest-api');
    assert.equal(r4.canonicalSlug, 'rest-api');

    // 4. End-to-end evidence matching across aliases:
    // Job requires "Node.js", candidate project evidence cites "nodejs"
    const jobDescription = makeJobDescription([
      { name: 'Node.js', extractedValue: 'Node.js', importance: 'REQUIRED' },
    ]);
    const candidateProfile = makeCandidateProfile({
      projects: [
        {
          id: randomUUID(),
          name: 'API Service',
          evidence: [
            {
              id: randomUUID(),
              resourceId: MOCK_REPO_ID,
              resourceName: 'api-repo',
              skillSlug: 'nodejs',
              skillName: 'nodejs',
              evidenceType: 'CODE_USAGE',
              filePath: 'src/main.js',
              confidenceScore: 0.95,
            },
          ],
        },
      ],
    });

    const analysis = EvidenceMatchingService.matchJobToCandidate(
      makeContext(),
      jobDescription,
      candidateProfile
    );
    const match = analysis.requirementMatches[0];
    assert.equal(match.matchStatus, 'MATCHED');
    assert.equal(match.truthCategory, 'VERIFIED');
    assert.equal(match.skillSlug, 'node-js');
  });

  // ---------------------------------------------------------------------------
  // TEST 7 — Prevent false verification from free-text and job description prose
  // ---------------------------------------------------------------------------
  it('TEST 7 — Prevent false verification from free-text and job description prose', () => {
    // Job description contains prose mentioning PostgreSQL and Docker
    const jobDescription = makeJobDescription([
      { name: 'PostgreSQL', skillSlug: 'postgresql', importance: 'REQUIRED' },
      { name: 'Docker', skillSlug: 'docker', importance: 'REQUIRED' },
    ]);

    // Candidate has only free-text summary claiming PostgreSQL, but no code evidence
    const candidateProfile = makeCandidateProfile({
      displayName: 'Prose Candidate',
      profileMetadata: {
        summary: 'Experienced with PostgreSQL databases and Docker containers in production.',
      },
      skills: [],
      projects: [],
    });

    const analysis = EvidenceMatchingService.matchJobToCandidate(
      makeContext(),
      jobDescription,
      candidateProfile
    );

    // Free text mentions in summary MUST NOT manufacture verified skills
    for (const match of analysis.requirementMatches) {
      assert.equal(match.matchStatus, 'MISSING');
      assert.equal(match.truthCategory, 'MISSING_EVIDENCE');
      assert.equal(match.candidateProvenance, 'NONE');
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 8 — Unified pipeline parity across MCP and Extension serialization
  // ---------------------------------------------------------------------------
  it('TEST 8 — Unified pipeline parity across MCP and Extension serialization', () => {
    const jobDescription = makeJobDescription([
      { name: 'JavaScript', skillSlug: 'javascript', importance: 'REQUIRED' },
      { name: 'Node.js', skillSlug: 'node-js', importance: 'REQUIRED' },
      { name: 'Kubernetes', skillSlug: 'kubernetes', importance: 'REQUIRED' },
    ]);

    const candidateProfile = makeCandidateProfile({
      skills: [
        {
          id: randomUUID(),
          slug: 'javascript',
          name: 'JavaScript',
          provenanceStatus: 'VERIFIED',
          truthCategory: 'VERIFIED',
          confidenceScore: 0.95,
          primaryEvidence: {
            id: randomUUID(),
            resourceId: MOCK_REPO_ID,
            resourceName: 'web-repo',
            evidenceType: 'CODE_USAGE',
            filePath: 'src/app.js',
            confidenceScore: 0.95,
          },
        },
        {
          id: randomUUID(),
          slug: 'node-js',
          name: 'Node.js',
          provenanceStatus: 'SELF_DECLARED',
          truthCategory: 'CLAIMED',
          confidenceScore: 0.85,
        },
      ],
      projects: [],
    });

    const analysis = EvidenceMatchingService.matchJobToCandidate(
      makeContext(),
      jobDescription,
      candidateProfile
    );

    // Format for extension display
    const extensionPayload = serializeRequirementMatchesForExtension(analysis);

    // 1. JavaScript -> MATCHED
    const jsMatch = analysis.requirementMatches.find((m) => m.skillSlug === 'javascript');
    const jsExt = extensionPayload.matches.find((m) => m.skillSlug === 'javascript');
    assert.ok(jsExt);
    assert.equal(jsExt.status, jsMatch.matchStatus);
    assert.equal(jsExt.truthCategory, jsMatch.truthCategory);
    assert.equal(jsExt.candidateProvenance, jsMatch.candidateProvenance);

    // 2. Node.js -> UNVERIFIED_CLAIM
    const nodeMatch = analysis.requirementMatches.find((m) => m.skillSlug === 'node-js');
    const nodeExt = extensionPayload.unverifiedClaims.find((m) => m.skillSlug === 'node-js');
    assert.ok(nodeExt);
    assert.equal(nodeExt.matchStatus, nodeMatch.matchStatus);
    assert.equal(nodeExt.truthCategory, nodeMatch.truthCategory);
    assert.equal(nodeExt.candidateProvenance, nodeMatch.candidateProvenance);

    // 3. Kubernetes -> MISSING
    const k8sMatch = analysis.requirementMatches.find((m) => m.skillSlug === 'kubernetes');
    const k8sExt = extensionPayload.missingRequirements.find((m) => m.skillSlug === 'kubernetes');
    assert.ok(k8sExt);
    assert.equal(k8sExt.status, k8sMatch.matchStatus);
    assert.equal(k8sExt.truthCategory, k8sMatch.truthCategory);
    assert.equal(k8sExt.candidateProvenance, k8sMatch.candidateProvenance);
  });
});
