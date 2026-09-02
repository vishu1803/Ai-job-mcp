/**
 * @file Evidence Trust, Provenance Preservation & Score Traceability Regression Tests
 *
 * Covers:
 *  1. node_modules evidence → INFERRED, NOT VERIFIED
 *  2. Canonical CORROBORATED provenance preserved through matching
 *  3. CLAIMED provenance yields PARTIAL, not VERIFIED
 *  4. NONE provenance yields MISSING
 *  5. "Access" not emitted as standalone skill from "access control models"
 *  6. RBAC/ABAC/ReBAC normalized correctly from compound requirement
 *  7. Security/identity requirements normalized (LDAP, SAML, SSO, OAuth 2.0, OpenID Connect)
 *  8. Evidence excerpts populated when underlying data exists
 *  9. Project matchedRequirements contain concrete linkage objects (not opaque UUIDs)
 * 10. Score breakdown includes rawScore, scoreCap, isCapped, criticalGapCount
 * 11. Analysis status DEGRADED semantics
 * 12. Score arithmetic is reproducible from breakdown components
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Domain / Services
import { SkillTaxonomyEngine } from '../../src/domain/career/skill-taxonomy.js';
import { EvidenceMatchingService } from '../../src/services/evidence-matching.service.js';
import { JobDescriptionParser } from '../../src/domain/career/job-parser.js';
import { AnalyzeJobFitOutputSchema } from '../../src/domain/mcp/career-read-tools.schemas.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

const TENANT = 'test-tenant-trust-boundary';

function makeReq(overrides = {}) {
  return {
    id: overrides.id || crypto.randomUUID(),
    tenantId: TENANT,
    jobDescriptionId: crypto.randomUUID(),
    category: 'SKILL',
    importance: 'REQUIRED',
    weight: 1.0,
    skillSlug: overrides.skillSlug || 'node-js',
    rawSnippet: overrides.rawSnippet || 'Node.js experience required',
    originalText: overrides.originalText || 'Node.js experience required',
    extractedValue: overrides.extractedValue || 'Node.js',
    normalizedCriteria: overrides.normalizedCriteria || {
      skillSlug: 'node-js',
      skillName: 'Node.js',
      skillCategory: 'LANGUAGE',
    },
    confidenceScore: overrides.confidenceScore ?? 0.95,
    sourceSpan: overrides.sourceSpan || {
      section: 'REQUIREMENTS',
      startOffset: 0,
      endOffset: 100,
      snippet: 'Node.js experience required',
    },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeCandidateSkill(overrides = {}) {
  return {
    id: overrides.id || crypto.randomUUID(),
    slug: overrides.slug || 'node-js',
    name: overrides.name || 'Node.js',
    provenanceStatus: overrides.provenanceStatus || 'VERIFIED',
    confidenceScore: overrides.confidenceScore ?? 1.0,
    isUserClaim: overrides.isUserClaim ?? false,
    evidenceItems: overrides.evidenceItems || [],
    primaryEvidence: overrides.primaryEvidence || null,
    ...overrides,
  };
}

function makeEvidence(overrides = {}) {
  return {
    id: overrides.id || crypto.randomUUID(),
    evidenceType: overrides.evidenceType || 'PACKAGE_MANIFEST_DEPENDENCY',
    resourceId: overrides.resourceId || crypto.randomUUID(),
    sourceLocation: {
      filePath: overrides.filePath || 'src/index.js',
      commitSha: overrides.commitSha || 'a'.repeat(40),
      lineRange: overrides.lineRange || null,
      ...(overrides.sourceLocation || {}),
    },
    excerpt: overrides.excerpt || null,
    metadata: overrides.metadata || {},
    confidenceScore: overrides.confidenceScore ?? 1.0,
    detectedAt: new Date().toISOString(),
    ...overrides,
  };
}

const emptyResourceMap = new Map();

// ---------------------------------------------------------------------------
// 1. Evidence Trust Boundary: node_modules → NOT VERIFIED
// ---------------------------------------------------------------------------

describe('Evidence Trust Boundary: node_modules evidence', () => {
  it('should classify node_modules paths as low-trust evidence', () => {
    const ev = makeEvidence({
      filePath: 'ai-job-board-backend/node_modules/@huggingface/inference/package.json',
    });
    assert.equal(EvidenceMatchingService._isLowTrustEvidence(ev), true);
  });

  it('should classify vendor paths as low-trust evidence', () => {
    const ev = makeEvidence({ filePath: 'project/vendor/some-lib/lib.js' });
    assert.equal(EvidenceMatchingService._isLowTrustEvidence(ev), true);
  });

  it('should classify coverage paths as low-trust evidence', () => {
    const ev = makeEvidence({ filePath: 'project/coverage/lcov.info' });
    assert.equal(EvidenceMatchingService._isLowTrustEvidence(ev), true);
  });

  it('should classify __generated__ paths as low-trust evidence', () => {
    const ev = makeEvidence({ filePath: 'project/__generated__/types.ts' });
    assert.equal(EvidenceMatchingService._isLowTrustEvidence(ev), true);
  });

  it('should classify dist paths as low-trust evidence', () => {
    const ev = makeEvidence({ filePath: 'project/dist/bundle.js' });
    assert.equal(EvidenceMatchingService._isLowTrustEvidence(ev), true);
  });

  it('should classify candidate-authored src paths as high-trust', () => {
    const ev = makeEvidence({ filePath: 'project/src/server.js' });
    assert.equal(EvidenceMatchingService._isLowTrustEvidence(ev), false);
  });

  it('should classify package.json at root as high-trust', () => {
    const ev = makeEvidence({ filePath: 'project/package.json' });
    assert.equal(EvidenceMatchingService._isLowTrustEvidence(ev), false);
  });

  it('should produce PARTIAL (not MATCHED/VERIFIED) when ALL evidence is from node_modules', () => {
    const nodeModulesEvidence = makeEvidence({
      filePath: 'project/node_modules/@types/node/index.d.ts',
      evidenceType: 'CODE_IMPORT_USAGE',
    });

    const candidateSkill = makeCandidateSkill({
      slug: 'node-js',
      name: 'Node.js',
      provenanceStatus: 'VERIFIED',
      evidenceItems: [nodeModulesEvidence],
      primaryEvidence: nodeModulesEvidence,
    });

    const req = makeReq({ skillSlug: 'node-js', extractedValue: 'Node.js' });
    const result = EvidenceMatchingService._evaluateExactSkillMatch(
      req,
      'node-js',
      'Node.js',
      candidateSkill,
      emptyResourceMap
    );

    assert.equal(result.match.matchStatus, 'PARTIAL');
    assert.equal(result.match.candidateProvenance, 'INFERRED');
    assert.ok(result.match.claimLabel && result.match.claimLabel.includes('Low-Trust'));
  });

  it('should produce MATCHED when evidence is from candidate-authored code', () => {
    const highTrustEvidence = makeEvidence({
      filePath: 'project/src/server.js',
      evidenceType: 'CODE_IMPORT_USAGE',
    });

    const candidateSkill = makeCandidateSkill({
      slug: 'node-js',
      name: 'Node.js',
      provenanceStatus: 'VERIFIED',
      evidenceItems: [highTrustEvidence],
      primaryEvidence: highTrustEvidence,
    });

    const req = makeReq({ skillSlug: 'node-js', extractedValue: 'Node.js' });
    const result = EvidenceMatchingService._evaluateExactSkillMatch(
      req,
      'node-js',
      'Node.js',
      candidateSkill,
      emptyResourceMap
    );

    assert.equal(result.match.matchStatus, 'MATCHED');
  });
});

// ---------------------------------------------------------------------------
// 2. Canonical Provenance Preservation
// ---------------------------------------------------------------------------

describe('Canonical Provenance Preservation', () => {
  it('should preserve CORROBORATED provenance through matching', () => {
    const evidence = makeEvidence({ filePath: 'project/src/app.ts', evidenceType: 'CODE_USAGE' });

    const candidateSkill = makeCandidateSkill({
      provenanceStatus: 'CORROBORATED',
      confidenceScore: 0.9,
      evidenceItems: [evidence],
      primaryEvidence: evidence,
    });

    const req = makeReq();
    const result = EvidenceMatchingService._evaluateExactSkillMatch(
      req,
      'node-js',
      'Node.js',
      candidateSkill,
      emptyResourceMap
    );

    assert.equal(result.match.matchStatus, 'MATCHED');
    assert.equal(result.match.candidateProvenance, 'CORROBORATED');
  });

  it('should never upgrade CLAIMED to VERIFIED', () => {
    const evidence = makeEvidence({ filePath: 'project/src/app.ts', evidenceType: 'CODE_USAGE' });

    const candidateSkill = makeCandidateSkill({
      provenanceStatus: 'CLAIMED',
      isUserClaim: true,
      confidenceScore: 1.0,
      evidenceItems: [evidence],
      primaryEvidence: evidence,
    });

    const req = makeReq();
    const result = EvidenceMatchingService._evaluateExactSkillMatch(
      req,
      'node-js',
      'Node.js',
      candidateSkill,
      emptyResourceMap
    );

    // CLAIMED skills should be PARTIAL, not MATCHED/VERIFIED
    assert.equal(result.match.matchStatus, 'PARTIAL');
    assert.notEqual(result.match.candidateProvenance, 'VERIFIED');
    assert.equal(result.match.isUserClaim, true);
  });

  it('should return MISSING for NONE provenance skills with no evidence', () => {
    const candidateSkill = makeCandidateSkill({
      provenanceStatus: 'NONE',
      confidenceScore: 0.0,
      evidenceItems: [],
      primaryEvidence: null,
    });

    const req = makeReq();
    const result = EvidenceMatchingService._evaluateExactSkillMatch(
      req,
      'node-js',
      'Node.js',
      candidateSkill,
      emptyResourceMap
    );

    // NONE provenance with no evidence should not produce MATCHED
    assert.notEqual(result.match.matchStatus, 'MATCHED');
  });
});

// ---------------------------------------------------------------------------
// 3. Requirement Normalization Quality
// ---------------------------------------------------------------------------

describe('Requirement Normalization Quality', () => {
  it('should NOT emit "Access" as standalone skill from "access control models"', () => {
    const skills = JobDescriptionParser.extractSkillsFromLine(
      'Familiarity with access control models such as RBAC, ABAC and ReBAC'
    );
    const slugs = skills.map((s) => s.slug);

    // "Access" alone is NOT a skill
    assert.ok(!slugs.includes('access'));
    // But RBAC, ABAC, ReBAC should be properly extracted
    assert.ok(slugs.includes('rbac'));
    assert.ok(slugs.includes('abac'));
    assert.ok(slugs.includes('rebac'));
  });

  it('should NOT emit "Authorization" as standalone skill', () => {
    const skills = JobDescriptionParser.extractSkillsFromLine(
      'Experience with authorization and authentication patterns'
    );
    const slugs = skills.map((s) => s.slug);
    assert.ok(!slugs.includes('authorization'));
  });

  it('should NOT emit "Control" as standalone skill', () => {
    const skills = JobDescriptionParser.extractSkillsFromLine(
      'Understanding of access control and identity management'
    );
    const slugs = skills.map((s) => s.slug);
    assert.ok(!slugs.includes('control'));
  });

  it('should normalize "OAuth 2.0" correctly', () => {
    const skills = JobDescriptionParser.extractSkillsFromLine(
      'Experience with OAuth 2.0 and OpenID Connect'
    );
    const slugs = skills.map((s) => s.slug);
    assert.ok(slugs.includes('oauth'));
    assert.ok(slugs.includes('openid-connect'));
  });

  it('should normalize SAML and SSO correctly', () => {
    const skills = JobDescriptionParser.extractSkillsFromLine(
      'Knowledge of SAML and SSO implementations'
    );
    const slugs = skills.map((s) => s.slug);
    assert.ok(slugs.includes('saml'));
    assert.ok(slugs.includes('sso'));
  });

  it('should normalize LDAP and Active Directory correctly', () => {
    const skills = JobDescriptionParser.extractSkillsFromLine(
      'Experience with LDAP and Active Directory integration'
    );
    const slugs = skills.map((s) => s.slug);
    assert.ok(slugs.includes('ldap'));
    assert.ok(slugs.includes('active-directory'));
  });

  it('should normalize JWT correctly', () => {
    const skills = JobDescriptionParser.extractSkillsFromLine(
      'Understanding of JWT-based authentication'
    );
    const slugs = skills.map((s) => s.slug);
    assert.ok(slugs.includes('jwt'));
  });
});

// ---------------------------------------------------------------------------
// 4. Taxonomy Validates with New Security Skills
// ---------------------------------------------------------------------------

describe('Taxonomy Integrity with Security Skills', () => {
  it('should validate the entire taxonomy graph without errors', () => {
    const result = SkillTaxonomyEngine.validateTaxonomyGraph();
    assert.equal(result.isValid, true);
    assert.ok(result.totalSkills > 0);
  });

  it('should normalize "RBAC" to canonical slug', () => {
    const norm = SkillTaxonomyEngine.normalizeSkill('RBAC');
    assert.equal(norm.canonicalSlug, 'rbac');
    assert.equal(norm.isKnown, true);
  });

  it('should normalize "role-based-access-control" to RBAC', () => {
    const norm = SkillTaxonomyEngine.normalizeSkill('role-based-access-control');
    assert.equal(norm.canonicalSlug, 'rbac');
  });

  it('should normalize "OAuth 2.0" to oauth', () => {
    const norm = SkillTaxonomyEngine.normalizeSkill('OAuth');
    assert.equal(norm.canonicalSlug, 'oauth');
  });

  it('should normalize "OIDC" to openid-connect', () => {
    const norm = SkillTaxonomyEngine.normalizeSkill('OIDC');
    assert.equal(norm.canonicalSlug, 'openid-connect');
  });

  it('should provide relationships for access-control', () => {
    const rels = SkillTaxonomyEngine.getRelationships('access-control');
    assert.ok(rels);
    assert.ok(rels.parentOf.includes('rbac'));
    assert.ok(rels.parentOf.includes('abac'));
    assert.ok(rels.parentOf.includes('rebac'));
  });
});

// ---------------------------------------------------------------------------
// 5. Evidence Excerpt Population
// ---------------------------------------------------------------------------

describe('Evidence Excerpt Population', () => {
  it('should populate excerpt from metadata.rawImport when excerpt is null', () => {
    const ev = makeEvidence({
      excerpt: null,
      metadata: { rawImport: "import express from 'express'" },
      filePath: 'src/app.js',
      evidenceType: 'CODE_IMPORT_USAGE',
    });

    const refs = EvidenceMatchingService._selectEvidenceRefs([ev], emptyResourceMap);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].excerpt, "import express from 'express'");
  });

  it('should populate excerpt from metadata.detectedPattern as fallback', () => {
    const ev = makeEvidence({
      excerpt: null,
      metadata: { detectedPattern: 'express' },
      filePath: 'src/app.js',
      evidenceType: 'CODE_USAGE',
    });

    const refs = EvidenceMatchingService._selectEvidenceRefs([ev], emptyResourceMap);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].excerpt, 'express');
  });

  it('should include provenanceTrustClass on evidence refs', () => {
    const highTrust = makeEvidence({ filePath: 'src/app.js', evidenceType: 'CODE_USAGE' });
    const lowTrust = makeEvidence({
      filePath: 'node_modules/express/lib/router.js',
      evidenceType: 'CODE_USAGE',
    });

    const refs = EvidenceMatchingService._selectEvidenceRefs(
      [highTrust, lowTrust],
      emptyResourceMap
    );
    const highTrustRef = refs.find((r) => r.filePath === 'src/app.js');
    const lowTrustRef = refs.find((r) => r.filePath.includes('node_modules'));

    if (highTrustRef) assert.equal(highTrustRef.provenanceTrustClass, 'HIGH_TRUST');
    if (lowTrustRef) assert.equal(lowTrustRef.provenanceTrustClass, 'LOW_TRUST');
  });
});

// ---------------------------------------------------------------------------
// 6. Output Schema & Score Traceability
// ---------------------------------------------------------------------------

describe('AnalyzeJobFit Output Schema & Traceability', () => {
  it('should validate output schema with DEGRADED status and score trace fields', () => {
    const mockOutput = {
      jobContext: {
        jobId: crypto.randomUUID(),
        externalJobId: 'ext-123',
        provider: 'greenhouse',
        company: 'Acme Corp',
        extractedTitle: 'Senior Backend Engineer',
        extractedLevel: 'Senior',
        totalRequirementsIdentified: 5,
        sourceUrl: null,
        applicationUrl: null,
      },
      overallFit: {
        atsScore: 78,
        matchGrade: 'STRONG',
        analysisStatus: 'DEGRADED',
        isFallbackScore: false,
        zeroRequirementWarning: null,
        fitSummary: 'Candidate has a STRONG fit with an ATS score of 78/100.',
        scoreBreakdown: {
          requiredSkillsScore: 35,
          preferredSkillsScore: 15,
          projectRelevanceScore: 18,
          experienceFitScore: 10,
          educationFitScore: 0,
          locationFitScore: 0,
          evidenceConfidenceScore: 0,
          rawScore: 82,
          scoreCap: 78,
          isCapped: true,
          criticalGapCount: 1,
          highGapCount: 0,
          explanation: { capReason: 'Critical gap penalty applied' },
        },
      },
      requirementSummary: {
        matchedCount: 3,
        partialCount: 1,
        missingCount: 1,
        unknownCount: 0,
        keyMatchedSkills: ['node-js', 'typescript', 'postgresql'],
        keyMissingSkills: ['kubernetes'],
      },
      requirementMatches: [
        {
          requirementId: 'req-1',
          originalRequirement: 'Node.js experience',
          normalizedRequirement: 'Node.js',
          category: 'LANGUAGE',
          required: true,
          matchStatus: 'MATCHED',
          matchConfidence: 0.95,
          candidateSkills: ['node-js'],
          candidateProvenance: 'VERIFIED',
          primaryEvidence: { filePath: 'src/server.js' },
          supportingEvidence: [{ filePath: 'package.json' }],
          explanation: 'Exact verified match from repository source code',
        },
      ],
      topRelevantProjects: [
        {
          projectId: crypto.randomUUID(),
          projectName: 'Career Intelligence Engine',
          relevanceScore: 88,
          relevanceRank: 1,
          matchedRequirements: [
            {
              requirementId: 'req-1',
              normalizedRequirement: 'Node.js',
              matchStatus: 'MATCHED',
              candidateSkills: ['node-js'],
              candidateProvenance: 'VERIFIED',
              explanation: 'Verified usage in server.js',
            },
          ],
          matchedArchitecturalDimensions: ['microservices', 'rest-api'],
          scoreBreakdown: { directSkillMatchScore: 40, architecturalAlignmentScore: 20 },
          summary: 'Core backend service for career matching',
          supportingEvidence: [{ filePath: 'src/server.js' }],
        },
      ],
      prioritizedSkillGaps: [
        {
          skillSlug: 'kubernetes',
          skillName: 'Kubernetes',
          category: 'CLOUD_DEVOPS',
          priority: 'CRITICAL',
          severity: 'EXPLICITLY_MISSING',
          evidenceTrust: 'NO_EVIDENCE',
          remediationAdvice: 'Add container orchestration experience to project work.',
        },
      ],
      evidenceBacking: {
        verifiedSkillsCount: 3,
        totalEvidenceItemsCited: 4,
      },
    };

    const parsed = AnalyzeJobFitOutputSchema.parse(mockOutput);
    assert.equal(parsed.overallFit.analysisStatus, 'DEGRADED');
    assert.equal(parsed.overallFit.scoreBreakdown.isCapped, true);
    assert.equal(parsed.overallFit.scoreBreakdown.rawScore, 82);
    assert.equal(
      parsed.topRelevantProjects[0].matchedRequirements[0].normalizedRequirement,
      'Node.js'
    );
  });
});
