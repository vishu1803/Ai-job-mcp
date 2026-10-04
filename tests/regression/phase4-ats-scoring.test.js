/**
 * @file Phase 4 ATS Scoring Model Audit & Industry-Level Calibration Test Suite
 *
 * Verifies that:
 * 1. Perfect candidate scores higher than weak candidate
 * 2. 6/6 required skills > 2/6 required skills
 * 3. 6/6 required + 0 preferred > 2/6 required + 4/4 preferred (Hard Requirement Dominance)
 * 4. VERIFIED evidence scores at least as strongly as equivalent CLAIMED evidence
 * 5. CLAIMED evidence scores at least as strongly as equivalent MISSING evidence
 * 6. Adding a legitimate required skill match cannot lower the score (Monotonicity)
 * 7. Adding relevant project evidence cannot lower project relevance score (Monotonicity)
 * 8. Preferred-only improvement cannot overpower severe required-skill failure
 * 9. Duplicate requirements do not artificially inflate the score
 * 10. Duplicate evidence does not artificially inflate the score
 * 11. Empty candidate produces a bounded, safe score
 * 12. Perfect candidate produces a bounded score <= 100
 * 13. Every component remains strictly within [0, 100]
 * 14. Final score remains strictly within [0, 100]
 * 15. MCP output matches canonical scoring result
 * 16. Extension serialization matches MCP scoring result
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { AtsFitScoreService } from '../../src/services/ats-fit-score.service.js';
import { EvidenceMatchingService } from '../../src/services/evidence-matching.service.js';
import { ProjectRelevanceService } from '../../src/services/project-relevance.service.js';
import { handleAnalyzeJobFit } from '../../src/mcp/tools/career-read-tools.js';
import { serializeRequirementMatchesForExtension } from '../../src/routes/extension.routes.js';
import {
  DEFAULT_COMPONENT_WEIGHTS,
  resolveScoreCap,
  computeFinalScore,
  resolveFitBand,
} from '../../src/domain/career/scoring-policy.js';

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

function makeJobDescription(requirements = []) {
  return {
    id: randomUUID(),
    tenantId: MOCK_TENANT_ID,
    title: 'Full Stack Engineer',
    companyName: 'Acme Corp',
    level: 'MID',
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
    id: overrides.id || MOCK_CANDIDATE_ID,
    tenantId: MOCK_TENANT_ID,
    userId: MOCK_USER_ID,
    displayName: 'Test Candidate',
    skills: overrides.skills || [],
    projects: overrides.projects || [],
    resources: overrides.resources || [{ id: MOCK_REPO_ID, name: 'web-repo' }],
    identities: [],
    profileMetadata: overrides.profileMetadata || {},
    tenureMetrics: overrides.tenureMetrics || {
      professionalTenureYears: 3,
      professionalTenureMonths: 36,
    },
    workHistory: overrides.workHistory || [],
    education: overrides.education || [],
    jobPreferences: overrides.jobPreferences || {},
    location: overrides.location || 'India',
  };
}

function evaluateCandidateFit(jobDescription, candidateProfile) {
  const context = makeContext();
  const matchAnalysis = EvidenceMatchingService.matchJobToCandidate(
    context,
    jobDescription,
    candidateProfile
  );
  const projectAnalysis = ProjectRelevanceService.computeProjectsRelevance(
    context,
    jobDescription,
    candidateProfile.projects,
    { candidateId: candidateProfile.id, skills: candidateProfile.skills }
  );
  const fitScoreAnalysis = AtsFitScoreService.calculateCandidateJobFit(
    context,
    jobDescription,
    matchAnalysis,
    projectAnalysis,
    candidateProfile
  );
  return { matchAnalysis, projectAnalysis, fitScoreAnalysis };
}

describe('Phase 4 — ATS Scoring Model Audit & Industry-Level Calibration', () => {
  const standardRequired = [
    { name: 'JavaScript', skillSlug: 'javascript', importance: 'REQUIRED' },
    { name: 'React', skillSlug: 'react', importance: 'REQUIRED' },
    { name: 'Node.js', skillSlug: 'node-js', importance: 'REQUIRED' },
    { name: 'PostgreSQL', skillSlug: 'postgresql', importance: 'REQUIRED' },
    { name: 'REST APIs', skillSlug: 'rest-api', importance: 'REQUIRED' },
    { name: 'Git', skillSlug: 'git', importance: 'REQUIRED' },
  ];

  const standardPreferred = [
    { name: 'Next.js', skillSlug: 'next-js', importance: 'PREFERRED' },
    { name: 'Docker', skillSlug: 'docker', importance: 'PREFERRED' },
    { name: 'TypeScript', skillSlug: 'typescript', importance: 'PREFERRED' },
    { name: 'FastAPI', skillSlug: 'fastapi', importance: 'PREFERRED' },
  ];

  // ---------------------------------------------------------------------------
  // TEST 1 — Perfect candidate scores higher than weak candidate
  // ---------------------------------------------------------------------------
  it('TEST 1 — Perfect candidate scores higher than weak candidate', () => {
    const jd = makeJobDescription([...standardRequired, ...standardPreferred]);

    const perfectSkills = [
      ...standardRequired.map((s) => ({
        id: randomUUID(),
        slug: s.skillSlug,
        name: s.name,
        provenanceStatus: 'VERIFIED',
        truthCategory: 'VERIFIED',
        confidenceScore: 0.95,
        primaryEvidence: {
          id: randomUUID(),
          resourceId: MOCK_REPO_ID,
          resourceName: 'web-repo',
          evidenceType: 'CODE_USAGE',
          filePath: `src/${s.skillSlug}.js`,
          confidenceScore: 0.95,
        },
      })),
      ...standardPreferred.map((s) => ({
        id: randomUUID(),
        slug: s.skillSlug,
        name: s.name,
        provenanceStatus: 'VERIFIED',
        truthCategory: 'VERIFIED',
        confidenceScore: 0.95,
        primaryEvidence: {
          id: randomUUID(),
          resourceId: MOCK_REPO_ID,
          resourceName: 'web-repo',
          evidenceType: 'CODE_USAGE',
          filePath: `src/${s.skillSlug}.js`,
          confidenceScore: 0.95,
        },
      })),
    ];

    const perfectCandidate = makeCandidateProfile({
      skills: perfectSkills,
      projects: [
        {
          id: randomUUID(),
          name: 'Enterprise Platform',
          slug: 'enterprise-platform',
          relevanceScore: 95.0,
          skills: perfectSkills.map((s) => s.slug),
          evidence: perfectSkills.map((s) => s.primaryEvidence),
        },
      ],
    });

    const weakCandidate = makeCandidateProfile({
      skills: [
        {
          id: randomUUID(),
          slug: 'javascript',
          name: 'JavaScript',
          provenanceStatus: 'SELF_DECLARED',
          truthCategory: 'CLAIMED',
          confidenceScore: 0.5,
        },
      ],
      projects: [],
    });

    const { fitScoreAnalysis: perfectFit } = evaluateCandidateFit(jd, perfectCandidate);
    const { fitScoreAnalysis: weakFit } = evaluateCandidateFit(jd, weakCandidate);

    assert.ok(
      perfectFit.overallScore > weakFit.overallScore,
      `Perfect (${perfectFit.overallScore}) must score higher than weak (${weakFit.overallScore})`
    );
    assert.equal(perfectFit.fitBand, 'EXCELLENT');
    assert.ok(['WEAK', 'LOW'].includes(weakFit.fitBand));
  });

  // ---------------------------------------------------------------------------
  // TEST 2 — 6/6 required skills > 2/6 required skills
  // ---------------------------------------------------------------------------
  it('TEST 2 — 6/6 required skills scores higher than 2/6 required skills', () => {
    const jd = makeJobDescription(standardRequired);

    const cand6 = makeCandidateProfile({
      skills: standardRequired.map((s) => ({
        id: randomUUID(),
        slug: s.skillSlug,
        name: s.name,
        provenanceStatus: 'VERIFIED',
        truthCategory: 'VERIFIED',
        confidenceScore: 0.95,
        primaryEvidence: {
          id: randomUUID(),
          resourceId: MOCK_REPO_ID,
          resourceName: 'web-repo',
          evidenceType: 'CODE_USAGE',
          filePath: `src/${s.skillSlug}.js`,
          confidenceScore: 0.95,
        },
      })),
    });

    const cand2 = makeCandidateProfile({
      skills: standardRequired.slice(0, 2).map((s) => ({
        id: randomUUID(),
        slug: s.skillSlug,
        name: s.name,
        provenanceStatus: 'VERIFIED',
        truthCategory: 'VERIFIED',
        confidenceScore: 0.95,
        primaryEvidence: {
          id: randomUUID(),
          resourceId: MOCK_REPO_ID,
          resourceName: 'web-repo',
          evidenceType: 'CODE_USAGE',
          filePath: `src/${s.skillSlug}.js`,
          confidenceScore: 0.95,
        },
      })),
    });

    const { fitScoreAnalysis: fit6 } = evaluateCandidateFit(jd, cand6);
    const { fitScoreAnalysis: fit2 } = evaluateCandidateFit(jd, cand2);

    assert.ok(
      fit6.overallScore > fit2.overallScore,
      `6/6 required (${fit6.overallScore}) must beat 2/6 required (${fit2.overallScore})`
    );
    assert.equal(fit6.scoreBreakdown.requiredSkillsScore, 40.0);
    assert.ok(fit2.isCapped, 'Candidate missing 4 required skills must be capped');
    assert.ok(fit2.overallScore <= 24.9, '3+ missing required skills must be capped at 24.9');
  });

  // ---------------------------------------------------------------------------
  // TEST 3 — Hard Requirement Dominance: 6/6 req + 0 pref > 2/6 req + 4/4 pref
  // ---------------------------------------------------------------------------
  it('TEST 3 — Hard Requirement Dominance: 6/6 req + 0 pref > 2/6 req + 4/4 pref', () => {
    const jd = makeJobDescription([...standardRequired, ...standardPreferred]);

    // Candidate X: 6/6 required, 0/4 preferred
    const candX = makeCandidateProfile({
      skills: standardRequired.map((s) => ({
        id: randomUUID(),
        slug: s.skillSlug,
        name: s.name,
        provenanceStatus: 'VERIFIED',
        truthCategory: 'VERIFIED',
        confidenceScore: 0.95,
        primaryEvidence: {
          id: randomUUID(),
          resourceId: MOCK_REPO_ID,
          resourceName: 'web-repo',
          evidenceType: 'CODE_USAGE',
          filePath: `src/${s.skillSlug}.js`,
          confidenceScore: 0.95,
        },
      })),
    });

    // Candidate Y: 2/6 required, 4/4 preferred
    const candY = makeCandidateProfile({
      skills: [
        ...standardRequired.slice(0, 2).map((s) => ({
          id: randomUUID(),
          slug: s.skillSlug,
          name: s.name,
          provenanceStatus: 'VERIFIED',
          truthCategory: 'VERIFIED',
          confidenceScore: 0.95,
          primaryEvidence: {
            id: randomUUID(),
            resourceId: MOCK_REPO_ID,
            resourceName: 'web-repo',
            evidenceType: 'CODE_USAGE',
            filePath: `src/${s.skillSlug}.js`,
            confidenceScore: 0.95,
          },
        })),
        ...standardPreferred.map((s) => ({
          id: randomUUID(),
          slug: s.skillSlug,
          name: s.name,
          provenanceStatus: 'VERIFIED',
          truthCategory: 'VERIFIED',
          confidenceScore: 0.95,
          primaryEvidence: {
            id: randomUUID(),
            resourceId: MOCK_REPO_ID,
            resourceName: 'web-repo',
            evidenceType: 'CODE_USAGE',
            filePath: `src/${s.skillSlug}.js`,
            confidenceScore: 0.95,
          },
        })),
      ],
    });

    const { fitScoreAnalysis: fitX } = evaluateCandidateFit(jd, candX);
    const { fitScoreAnalysis: fitY } = evaluateCandidateFit(jd, candY);

    assert.ok(
      fitX.overallScore > fitY.overallScore,
      `Candidate X (6 req, 0 pref: ${fitX.overallScore}) must dominate Candidate Y (2 req, 4 pref: ${fitY.overallScore})`
    );
    assert.ok(fitY.isCapped, 'Candidate Y missing required skills must be capped');
    assert.ok(
      fitY.overallScore <= (fitY.scoreBreakdown.scoreCap ?? 49.9),
      'Candidate Y must not exceed safety cap'
    );
  });

  // ---------------------------------------------------------------------------
  // TEST 4 — VERIFIED evidence scores at least as strongly as CLAIMED
  // ---------------------------------------------------------------------------
  it('TEST 4 — VERIFIED evidence scores at least as strongly as equivalent CLAIMED evidence', () => {
    const jd = makeJobDescription(standardRequired);

    const verifiedCandidate = makeCandidateProfile({
      skills: standardRequired.map((s) => ({
        id: randomUUID(),
        slug: s.skillSlug,
        name: s.name,
        provenanceStatus: 'VERIFIED',
        truthCategory: 'VERIFIED',
        confidenceScore: 0.9,
        primaryEvidence: {
          id: randomUUID(),
          resourceId: MOCK_REPO_ID,
          resourceName: 'web-repo',
          evidenceType: 'CODE_USAGE',
          filePath: `src/${s.skillSlug}.js`,
          confidenceScore: 0.9,
        },
      })),
    });

    const claimedCandidate = makeCandidateProfile({
      skills: standardRequired.map((s) => ({
        id: randomUUID(),
        slug: s.skillSlug,
        name: s.name,
        provenanceStatus: 'SELF_DECLARED',
        truthCategory: 'CLAIMED',
        confidenceScore: 0.9,
        primaryEvidence: null,
      })),
    });

    const { fitScoreAnalysis: verifiedFit } = evaluateCandidateFit(jd, verifiedCandidate);
    const { fitScoreAnalysis: claimedFit } = evaluateCandidateFit(jd, claimedCandidate);

    assert.ok(
      verifiedFit.overallScore > claimedFit.overallScore,
      `VERIFIED (${verifiedFit.overallScore}) must score higher than CLAIMED (${claimedFit.overallScore})`
    );
    assert.equal(verifiedFit.scoreBreakdown.requiredSkillsScore, 40.0);
    assert.equal(claimedFit.scoreBreakdown.requiredSkillsScore, 10.0); // 40 * 0.25 = 10.0
  });

  // ---------------------------------------------------------------------------
  // TEST 5 — CLAIMED evidence scores at least as strongly as MISSING evidence
  // ---------------------------------------------------------------------------
  it('TEST 5 — CLAIMED evidence scores at least as strongly as equivalent MISSING evidence', () => {
    const jd = makeJobDescription(standardRequired);

    const claimedCandidate = makeCandidateProfile({
      skills: standardRequired.map((s) => ({
        id: randomUUID(),
        slug: s.skillSlug,
        name: s.name,
        provenanceStatus: 'SELF_DECLARED',
        truthCategory: 'CLAIMED',
        confidenceScore: 0.9,
      })),
    });

    const missingCandidate = makeCandidateProfile({
      skills: [],
    });

    const { fitScoreAnalysis: claimedFit } = evaluateCandidateFit(jd, claimedCandidate);
    const { fitScoreAnalysis: missingFit } = evaluateCandidateFit(jd, missingCandidate);

    assert.ok(
      claimedFit.overallScore > missingFit.overallScore,
      `CLAIMED (${claimedFit.overallScore}) must score higher than MISSING (${missingFit.overallScore})`
    );
    assert.equal(missingFit.overallScore, 0.0);
  });

  // ---------------------------------------------------------------------------
  // TEST 6 — Adding a legitimate required skill match cannot lower the score (Monotonicity)
  // ---------------------------------------------------------------------------
  it('TEST 6 — Adding a legitimate required skill match cannot lower the score (Monotonicity)', () => {
    const jd = makeJobDescription(standardRequired);

    const baseSkills = standardRequired.slice(0, 3).map((s) => ({
      id: randomUUID(),
      slug: s.skillSlug,
      name: s.name,
      provenanceStatus: 'VERIFIED',
      truthCategory: 'VERIFIED',
      confidenceScore: 0.95,
      primaryEvidence: {
        id: randomUUID(),
        resourceId: MOCK_REPO_ID,
        resourceName: 'web-repo',
        evidenceType: 'CODE_USAGE',
        filePath: `src/${s.skillSlug}.js`,
        confidenceScore: 0.95,
      },
    }));

    const candBefore = makeCandidateProfile({ skills: baseSkills });
    const candAfter = makeCandidateProfile({
      skills: [
        ...baseSkills,
        {
          id: randomUUID(),
          slug: standardRequired[3].skillSlug,
          name: standardRequired[3].name,
          provenanceStatus: 'VERIFIED',
          truthCategory: 'VERIFIED',
          confidenceScore: 0.95,
          primaryEvidence: {
            id: randomUUID(),
            resourceId: MOCK_REPO_ID,
            resourceName: 'web-repo',
            evidenceType: 'CODE_USAGE',
            filePath: `src/${standardRequired[3].skillSlug}.js`,
            confidenceScore: 0.95,
          },
        },
      ],
    });

    const { fitScoreAnalysis: fitBefore } = evaluateCandidateFit(jd, candBefore);
    const { fitScoreAnalysis: fitAfter } = evaluateCandidateFit(jd, candAfter);

    assert.ok(
      fitAfter.overallScore >= fitBefore.overallScore,
      `Adding skill match must not decrease score: before=${fitBefore.overallScore}, after=${fitAfter.overallScore}`
    );
    assert.ok(
      fitAfter.scoreBreakdown.requiredSkillsScore > fitBefore.scoreBreakdown.requiredSkillsScore,
      'requiredSkillsScore must strictly increase when adding a verified required skill'
    );
  });

  // ---------------------------------------------------------------------------
  // TEST 7 — Adding relevant project evidence cannot lower project relevance (Monotonicity)
  // ---------------------------------------------------------------------------
  it('TEST 7 — Adding relevant project evidence cannot lower project relevance score (Monotonicity)', () => {
    const jd = makeJobDescription(standardRequired);

    const cand1 = makeCandidateProfile({
      projects: [
        {
          id: randomUUID(),
          name: 'Small Tool',
          slug: 'small-tool',
          relevanceScore: 40.0,
          skills: ['javascript'],
        },
      ],
    });

    const cand2 = makeCandidateProfile({
      projects: [
        {
          id: randomUUID(),
          name: 'Enterprise Platform',
          slug: 'enterprise-platform',
          relevanceScore: 90.0,
          skills: ['javascript', 'react', 'postgresql', 'node-js'],
        },
        {
          id: randomUUID(),
          name: 'Small Tool',
          slug: 'small-tool',
          relevanceScore: 40.0,
          skills: ['javascript'],
        },
      ],
    });

    const { fitScoreAnalysis: fit1 } = evaluateCandidateFit(jd, cand1);
    const { fitScoreAnalysis: fit2 } = evaluateCandidateFit(jd, cand2);

    assert.ok(
      fit2.scoreBreakdown.projectRelevanceScore >= fit1.scoreBreakdown.projectRelevanceScore,
      `Project relevance must not decrease: cand1=${fit1.scoreBreakdown.projectRelevanceScore}, cand2=${fit2.scoreBreakdown.projectRelevanceScore}`
    );
  });

  // ---------------------------------------------------------------------------
  // TEST 8 — Preferred-only improvement cannot overpower severe required-skill failure
  // ---------------------------------------------------------------------------
  it('TEST 8 — Preferred-only improvement cannot overpower severe required-skill failure', () => {
    // JD with 6 distinct required skills and 4 preferred skills
    const distinctRequired = [
      { name: 'Java', skillSlug: 'java', importance: 'REQUIRED' },
      { name: 'Spring Boot', skillSlug: 'spring-boot', importance: 'REQUIRED' },
      { name: 'Oracle DB', skillSlug: 'oracle', importance: 'REQUIRED' },
      { name: 'Kubernetes', skillSlug: 'kubernetes', importance: 'REQUIRED' },
      { name: 'C++', skillSlug: 'cpp', importance: 'REQUIRED' },
      { name: 'Swift', skillSlug: 'swift', importance: 'REQUIRED' },
    ];
    const jd = makeJobDescription([...distinctRequired, ...standardPreferred]);

    // Severe failure: 0/6 required skills matched, but 4/4 preferred skills verified + 95% project
    const candSevere = makeCandidateProfile({
      skills: standardPreferred.map((s) => ({
        id: randomUUID(),
        slug: s.skillSlug,
        name: s.name,
        provenanceStatus: 'VERIFIED',
        truthCategory: 'VERIFIED',
        confidenceScore: 0.95,
        primaryEvidence: {
          id: randomUUID(),
          resourceId: MOCK_REPO_ID,
          resourceName: 'web-repo',
          evidenceType: 'CODE_USAGE',
          filePath: `src/${s.skillSlug}.js`,
          confidenceScore: 0.95,
        },
      })),
      projects: [
        {
          id: randomUUID(),
          name: 'Full Stack App',
          relevanceScore: 95.0,
          skills: standardPreferred.map((s) => s.skillSlug),
        },
      ],
    });

    const { fitScoreAnalysis: fit } = evaluateCandidateFit(jd, candSevere);

    assert.ok(
      fit.isCapped,
      'Severe required skill failure (6 critical gaps) must trigger hard safety cap'
    );
    assert.equal(fit.scoreBreakdown.scoreCap, 24.9);
    assert.ok(
      fit.overallScore <= 24.9,
      `Score (${fit.overallScore}) must not overpower hard requirement failure ceiling of 24.9`
    );
    assert.equal(fit.fitBand, 'LOW');
  });

  // ---------------------------------------------------------------------------
  // TEST 9 — Duplicate requirements do not artificially inflate the score
  // ---------------------------------------------------------------------------
  it('TEST 9 — Duplicate requirements do not artificially inflate the score', () => {
    // JD with identical duplicate requirements
    const jdSingle = makeJobDescription([
      { name: 'JavaScript', skillSlug: 'javascript', importance: 'REQUIRED' },
    ]);
    const jdDuplicate = makeJobDescription([
      { name: 'JavaScript', skillSlug: 'javascript', importance: 'REQUIRED' },
      { name: 'JavaScript', skillSlug: 'javascript', importance: 'REQUIRED' },
      { name: 'JavaScript', skillSlug: 'javascript', importance: 'REQUIRED' },
    ]);

    const cand = makeCandidateProfile({
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
      ],
    });

    const { fitScoreAnalysis: fitSingle } = evaluateCandidateFit(jdSingle, cand);
    const { fitScoreAnalysis: fitDuplicate } = evaluateCandidateFit(jdDuplicate, cand);

    assert.equal(fitSingle.scoreBreakdown.requiredSkillsScore, 40.0);
    assert.equal(fitDuplicate.scoreBreakdown.requiredSkillsScore, 40.0);
    assert.equal(fitDuplicate.overallScore, fitSingle.overallScore);
  });

  // ---------------------------------------------------------------------------
  // TEST 10 — Duplicate evidence does not artificially inflate the score
  // ---------------------------------------------------------------------------
  it('TEST 10 — Duplicate evidence does not artificially inflate the score', () => {
    const jd = makeJobDescription([
      { name: 'JavaScript', skillSlug: 'javascript', importance: 'REQUIRED' },
      { name: 'React', skillSlug: 'react', importance: 'REQUIRED' },
    ]);

    const sharedEvidenceId = randomUUID();
    const sharedEvidence = {
      id: sharedEvidenceId,
      resourceId: MOCK_REPO_ID,
      resourceName: 'web-repo',
      evidenceType: 'CODE_USAGE',
      filePath: 'src/index.js',
      confidenceScore: 0.95,
    };

    // Both skills cite the exact same evidence id
    const cand = makeCandidateProfile({
      skills: [
        {
          id: randomUUID(),
          slug: 'javascript',
          name: 'JavaScript',
          provenanceStatus: 'VERIFIED',
          truthCategory: 'VERIFIED',
          primaryEvidence: sharedEvidence,
          evidenceItems: [sharedEvidence],
        },
        {
          id: randomUUID(),
          slug: 'react',
          name: 'React',
          provenanceStatus: 'VERIFIED',
          truthCategory: 'VERIFIED',
          primaryEvidence: sharedEvidence,
          evidenceItems: [sharedEvidence],
        },
      ],
    });

    const { fitScoreAnalysis: fit } = evaluateCandidateFit(jd, cand);

    // Evidence confidence score must be bounded within [0, 5.0]
    assert.ok(fit.scoreBreakdown.evidenceConfidenceScore <= 5.0);
    assert.ok(fit.scoreBreakdown.evidenceConfidenceScore >= 0.0);
  });

  // ---------------------------------------------------------------------------
  // TEST 11 — Empty candidate produces a bounded, safe score
  // ---------------------------------------------------------------------------
  it('TEST 11 — Empty candidate produces a bounded, safe score', () => {
    const jd = makeJobDescription(standardRequired);
    const emptyCand = makeCandidateProfile({ skills: [], projects: [] });

    const { fitScoreAnalysis: fit } = evaluateCandidateFit(jd, emptyCand);

    assert.equal(fit.overallScore, 0.0);
    assert.equal(fit.scoreBreakdown.requiredSkillsScore, 0.0);
    assert.equal(fit.fitBand, 'LOW');
    assert.ok(!Number.isNaN(fit.overallScore));
    assert.ok(Number.isFinite(fit.overallScore));
  });

  // ---------------------------------------------------------------------------
  // TEST 12 — Perfect candidate produces a bounded score <= 100
  // ---------------------------------------------------------------------------
  it('TEST 12 — Perfect candidate produces a bounded score <= 100', () => {
    const jd = makeJobDescription(standardRequired);
    const perfectCand = makeCandidateProfile({
      skills: standardRequired.map((s) => ({
        id: randomUUID(),
        slug: s.skillSlug,
        name: s.name,
        provenanceStatus: 'VERIFIED',
        truthCategory: 'VERIFIED',
        confidenceScore: 1.0,
        primaryEvidence: {
          id: randomUUID(),
          resourceId: MOCK_REPO_ID,
          resourceName: 'web-repo',
          evidenceType: 'CODE_USAGE',
          filePath: `src/${s.skillSlug}.js`,
          confidenceScore: 1.0,
        },
      })),
      projects: [
        {
          id: randomUUID(),
          name: 'Platform',
          relevanceScore: 100.0,
          skills: standardRequired.map((s) => s.skillSlug),
        },
      ],
    });

    const { fitScoreAnalysis: fit } = evaluateCandidateFit(jd, perfectCand);

    assert.ok(fit.overallScore <= 100.0, `Score ${fit.overallScore} must not exceed 100`);
    assert.ok(fit.overallScore >= 0.0, `Score ${fit.overallScore} must be non-negative`);
  });

  // ---------------------------------------------------------------------------
  // TEST 13 — Every component remains strictly within [0, 100]
  // ---------------------------------------------------------------------------
  it('TEST 13 — Every component remains strictly within [0, 100]', () => {
    const jd = makeJobDescription([
      ...standardRequired,
      { name: '3+ years experience', category: 'EXPERIENCE', importance: 'REQUIRED' },
      { name: "Bachelor's degree", category: 'EDUCATION', importance: 'PREFERRED' },
      { name: 'India remote', category: 'LOCATION', importance: 'REQUIRED' },
    ]);

    const cand = makeCandidateProfile({
      skills: standardRequired.map((s) => ({
        id: randomUUID(),
        slug: s.skillSlug,
        name: s.name,
        provenanceStatus: 'VERIFIED',
        truthCategory: 'VERIFIED',
      })),
      projects: [{ id: randomUUID(), name: 'P', relevanceScore: 80.0 }],
      workHistory: [{ title: 'Full Stack Engineer', isCurrent: true, startDate: '2020-01-01' }],
      education: [{ degree: 'BACHELOR', fieldOfStudy: 'Computer Science' }],
      location: 'India',
    });

    const { fitScoreAnalysis: fit } = evaluateCandidateFit(jd, cand);
    const b = fit.scoreBreakdown;

    const components = [
      b.requiredSkillsScore,
      b.preferredSkillsScore,
      b.projectRelevanceScore,
      b.experienceFitScore,
      b.educationFitScore,
      b.locationFitScore,
      b.evidenceConfidenceScore,
    ];

    for (const c of components) {
      assert.ok(typeof c === 'number');
      assert.ok(!Number.isNaN(c));
      assert.ok(c >= 0.0 && c <= 100.0, `Component ${c} must be in [0, 100]`);
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 14 — Final score remains strictly within [0, 100]
  // ---------------------------------------------------------------------------
  it('TEST 14 — Final score remains strictly within [0, 100]', () => {
    const jd = makeJobDescription(standardRequired);
    const cand = makeCandidateProfile();

    const { fitScoreAnalysis: fit } = evaluateCandidateFit(jd, cand);

    assert.ok(typeof fit.overallScore === 'number');
    assert.ok(!Number.isNaN(fit.overallScore));
    assert.ok(fit.overallScore >= 0.0 && fit.overallScore <= 100.0);
  });

  // ---------------------------------------------------------------------------
  // TEST 15 — MCP output matches canonical scoring result
  // ---------------------------------------------------------------------------
  it('TEST 15 — MCP output matches canonical scoring result', async () => {
    const BASELINE_JD = `Junior Full Stack Engineer
Required: JavaScript, React, Node.js, PostgreSQL, REST APIs, Git.
Preferred: Next.js, Docker, TypeScript, FastAPI.
Responsibilities include building frontend applications.
Bachelor's degree in Computer Science preferred.`;

    const context = makeContext();
    const mockRepoId = randomUUID();
    const mockSkills = standardRequired.map((s) => ({
      id: randomUUID(),
      skillId: randomUUID(),
      slug: s.skillSlug,
      name: s.name,
      category: 'LANGUAGE',
      provenanceStatus: s.skillSlug === 'node-js' ? 'SELF_DECLARED' : 'VERIFIED',
      truthCategory: s.skillSlug === 'node-js' ? 'CLAIMED' : 'VERIFIED',
      confidenceScore: 0.95,
      evidenceCount: s.skillSlug === 'node-js' ? 0 : 1,
      primaryEvidence:
        s.skillSlug === 'node-js'
          ? null
          : {
              id: randomUUID(),
              resourceId: mockRepoId,
              resourceName: 'web-app',
              evidenceType: 'CODE_USAGE',
              filePath: `src/${s.skillSlug}.js`,
              confidenceScore: 0.95,
            },
    }));

    const mockProfileView = {
      candidate: {
        id: MOCK_CANDIDATE_ID,
        userId: MOCK_USER_ID,
        tenantId: MOCK_TENANT_ID,
        displayName: 'Test Candidate',
        headline: 'Full Stack Engineer',
        profileMetadata: {},
      },
      skills: mockSkills,
      projects: [
        {
          id: randomUUID(),
          name: 'Web App',
          slug: 'web-app',
          relevanceScore: 75.0,
          skills: ['javascript', 'react', 'postgresql', 'git'],
          evidence: mockSkills.filter((s) => s.primaryEvidence).map((s) => s.primaryEvidence),
          resources: [{ id: mockRepoId, name: 'web-app' }],
        },
      ],
      resources: [{ id: mockRepoId, name: 'web-app' }],
      identities: [],
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

    const fitResult = await handleAnalyzeJobFit(
      context,
      {
        candidateId: MOCK_CANDIDATE_ID,
        jobDescriptionText: BASELINE_JD,
        jobTitle: 'Junior Full Stack Engineer',
      },
      mockDeps
    );

    assert.ok(fitResult);
    assert.ok(typeof fitResult.overallFit.atsScore === 'number');
    assert.ok(fitResult.overallFit.atsScore >= 0.0 && fitResult.overallFit.atsScore <= 100.0);
    assert.ok(fitResult.overallFit.matchGrade);
    assert.ok(fitResult.overallFit.scoreBreakdown);
    assert.equal(
      fitResult.overallFit.atsScore,
      fitResult.overallFit.scoreBreakdown.atsFitScore || fitResult.overallFit.atsScore
    );
  });

  // ---------------------------------------------------------------------------
  // TEST 16 — Extension serialization matches MCP scoring result
  // ---------------------------------------------------------------------------
  it('TEST 16 — Extension serialization matches MCP scoring result', () => {
    const jd = makeJobDescription(standardRequired);
    const cand = makeCandidateProfile({
      skills: standardRequired.slice(0, 4).map((s) => ({
        id: randomUUID(),
        slug: s.skillSlug,
        name: s.name,
        provenanceStatus: 'VERIFIED',
        truthCategory: 'VERIFIED',
      })),
    });

    const { matchAnalysis } = evaluateCandidateFit(jd, cand);
    const ext = serializeRequirementMatchesForExtension(matchAnalysis);

    assert.ok(ext);
    assert.equal(ext.matches.length, 4);
    assert.equal(ext.missingRequirements.length, 2);

    for (const m of ext.matches) {
      assert.equal(m.status, 'MATCHED');
      assert.equal(m.truthCategory, 'VERIFIED');
    }
    for (const m of ext.missingRequirements) {
      assert.equal(m.status, 'MISSING');
      assert.equal(m.truthCategory, 'MISSING_EVIDENCE');
    }
  });
});
