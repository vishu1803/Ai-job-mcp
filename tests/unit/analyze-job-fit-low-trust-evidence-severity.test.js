/**
 * @file Regression Tests — Skill Gap Severity vs Evidence Trust Separation
 *
 * Reproduces and locks the exact live ChatGPT MCP failure:
 *
 *   skillGaps[17].severity = "LOW_TRUST_EVIDENCE"
 *   Invalid enum value. Expected:
 *     "EXPLICITLY_MISSING" | "UNVERIFIED_CLAIM" | "INSUFFICIENT_EVIDENCE" | "PARTIAL_TENURE"
 *   received: "LOW_TRUST_EVIDENCE"
 *
 * Root cause: the low-trust-evidence branch of `_evaluateExactSkillMatch`
 * emitted an evidence-TRUST state through the gap SEVERITY slot, conflating two
 * orthogonal axes.
 *
 * Canonical model locked by these tests:
 *   severity      -> reason category    (EXPLICITLY_MISSING | UNVERIFIED_CLAIM |
 *                                        INSUFFICIENT_EVIDENCE | PARTIAL_TENURE)
 *   evidenceTrust -> evidence provenance (HIGH_TRUST | LOW_TRUST | NO_EVIDENCE)
 *
 * Coverage:
 *  1. A low-trust evidence gap produces a schema-valid result (no throw)
 *  2. CandidateMatchAnalysisSchema validation succeeds end-to-end
 *  3. The severity/evidenceTrust semantic distinction is preserved
 *  4. `LOW_TRUST_EVIDENCE` is rejected as a severity by the canonical enum
 *  5. No invalid enum can escape the producer (`_createSkillGap`)
 *  6. The complete analyze_job_fit MCP response validates and carries both axes
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { EvidenceMatchingService } from '../../src/services/evidence-matching.service.js';
import {
  SkillGapSchema,
  SkillGapSeverityEnum,
  SkillGapEvidenceTrustEnum,
  EvidenceTrustClassEnum,
  CandidateMatchAnalysisSchema,
} from '../../src/domain/career/evidence-matching.schemas.js';
import { AnalyzeJobFitOutputSchema } from '../../src/domain/mcp/career-read-tools.schemas.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = crypto.randomUUID();
const CANDIDATE_ID = crypto.randomUUID();
const JOB_ID = crypto.randomUUID();
const RESOURCE_ID = crypto.randomUUID();

const baseContext = Object.freeze({ tenantId: TENANT_ID, userId: crypto.randomUUID() });

function makeEvidence({ filePath, evidenceType = 'CODE_IMPORT_USAGE' }) {
  return {
    id: crypto.randomUUID(),
    tenantId: TENANT_ID,
    candidateId: CANDIDATE_ID,
    resourceId: RESOURCE_ID,
    evidenceType,
    sourceProvider: 'GITHUB_APP',
    sourceLocation: { filePath, commitSha: 'a'.repeat(40), lineRange: { start: 1, end: 4 } },
    excerpt: "require('express')",
    confidenceScore: 0.9,
  };
}

function makeRequirement({ extractedValue, skillSlug, importance = 'REQUIRED' }) {
  return {
    id: crypto.randomUUID(),
    tenantId: TENANT_ID,
    jobDescriptionId: JOB_ID,
    category: 'SKILL',
    importance,
    weight: 1.0,
    skillSlug,
    rawSnippet: `${extractedValue} experience required`,
    originalText: `${extractedValue} experience required`,
    extractedValue,
    confidenceScore: 0.95,
    sourceSpan: { section: 'Requirements', snippet: extractedValue },
  };
}

function makeCandidate(skills) {
  return {
    id: CANDIDATE_ID,
    tenantId: TENANT_ID,
    displayName: 'Ada Lovelace',
    headline: 'Backend Engineer',
    profileMetadata: {},
    skills,
    projects: [
      {
        id: crypto.randomUUID(),
        tenantId: TENANT_ID,
        candidateId: CANDIDATE_ID,
        name: 'Platform',
        slug: 'platform',
        resources: [
          {
            id: RESOURCE_ID,
            tenantId: TENANT_ID,
            name: 'vishu1803/platform',
            displayName: 'Platform',
            provider: 'GITHUB_APP',
            resourceType: 'REPOSITORY',
            externalResourceId: '999',
            status: 'ACTIVE',
          },
        ],
      },
    ],
  };
}

/** A skill whose ONLY evidence lives in transitive dependencies (low trust). */
function makeLowTrustOnlySkill({ slug, name }) {
  const ev = makeEvidence({ filePath: `project/node_modules/${slug}/index.js` });
  return {
    id: crypto.randomUUID(),
    tenantId: TENANT_ID,
    candidateId: CANDIDATE_ID,
    name,
    slug,
    category: 'FRAMEWORK',
    provenanceStatus: 'VERIFIED',
    confidenceScore: 0.95,
    evidence: [ev],
    primaryEvidence: ev,
  };
}

// ---------------------------------------------------------------------------
// 1. The exact reported failure: low-trust gap must be schema-valid
// ---------------------------------------------------------------------------

describe('Regression: low-trust evidence gap is schema-valid', () => {
  it('produces a SkillGapSchema-valid gap instead of throwing on severity', () => {
    const skill = makeLowTrustOnlySkill({ slug: 'express-js', name: 'Express.js' });
    const req = makeRequirement({ extractedValue: 'Express.js', skillSlug: 'express-js' });

    const result = EvidenceMatchingService._evaluateExactSkillMatch(
      req,
      'express-js',
      'Express.js',
      skill,
      new Map()
    );

    assert.ok(result.gap, 'low-trust evidence must still emit a skill gap');

    // Must not throw — this is the exact assertion the live call violated.
    const parsed = SkillGapSchema.parse(result.gap);
    assert.equal(parsed.severity, 'INSUFFICIENT_EVIDENCE');
    assert.equal(parsed.evidenceTrust, 'LOW_TRUST');
  });

  it('never emits LOW_TRUST_EVIDENCE in the severity slot', () => {
    const skill = makeLowTrustOnlySkill({ slug: 'express-js', name: 'Express.js' });
    const req = makeRequirement({ extractedValue: 'Express.js', skillSlug: 'express-js' });

    const { gap } = EvidenceMatchingService._evaluateExactSkillMatch(
      req,
      'express-js',
      'Express.js',
      skill,
      new Map()
    );

    assert.notEqual(gap.severity, 'LOW_TRUST_EVIDENCE');
    assert.ok(SkillGapSeverityEnum.options.includes(gap.severity));
  });

  it('keeps the gap semantically accurate — PARTIAL status, not dropped', () => {
    const skill = makeLowTrustOnlySkill({ slug: 'express-js', name: 'Express.js' });
    const req = makeRequirement({ extractedValue: 'Express.js', skillSlug: 'express-js' });

    const { match, gap } = EvidenceMatchingService._evaluateExactSkillMatch(
      req,
      'express-js',
      'Express.js',
      skill,
      new Map()
    );

    assert.equal(match.matchStatus, 'PARTIAL');
    assert.equal(gap.status, 'PARTIAL');
    assert.ok(/transitive dependencies/i.test(gap.reason));
    assert.ok(gap.recommendation.length > 0);
  });
});

// ---------------------------------------------------------------------------
// 2. End-to-end aggregate validation (the failing parse site)
// ---------------------------------------------------------------------------

describe('Regression: CandidateMatchAnalysisSchema validation succeeds', () => {
  it('validates the full analysis when a low-trust gap is present', () => {
    const candidate = makeCandidate([
      makeLowTrustOnlySkill({ slug: 'express-js', name: 'Express.js' }),
    ]);
    const job = {
      id: JOB_ID,
      tenantId: TENANT_ID,
      title: 'Backend Engineer',
      requirements: [makeRequirement({ extractedValue: 'Express.js', skillSlug: 'express-js' })],
    };

    // Previously threw: skillGaps[n].severity invalid enum "LOW_TRUST_EVIDENCE".
    const analysis = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);

    // matchJobToCandidate already parses internally; re-parse to assert the
    // returned payload is itself contract-valid.
    const revalidated = CandidateMatchAnalysisSchema.parse(analysis);
    assert.equal(revalidated.skillGaps.length, 1);
    assert.equal(revalidated.skillGaps[0].severity, 'INSUFFICIENT_EVIDENCE');
    assert.equal(revalidated.skillGaps[0].evidenceTrust, 'LOW_TRUST');
  });

  it('validates a mixed analysis carrying every severity/trust combination', () => {
    const lowTrustSkill = makeLowTrustOnlySkill({ slug: 'express-js', name: 'Express.js' });

    const claimedEv = null;
    const claimedSkill = {
      id: crypto.randomUUID(),
      tenantId: TENANT_ID,
      candidateId: CANDIDATE_ID,
      name: 'Kubernetes',
      slug: 'kubernetes',
      category: 'CLOUD_DEVOPS',
      provenanceStatus: 'CLAIMED',
      confidenceScore: 0.5,
      isUserClaim: true,
      evidence: [],
      primaryEvidence: claimedEv,
    };

    const readmeOnlySkill = {
      id: crypto.randomUUID(),
      tenantId: TENANT_ID,
      candidateId: CANDIDATE_ID,
      name: 'Redis',
      slug: 'redis',
      category: 'DATABASE',
      provenanceStatus: 'INFERRED',
      confidenceScore: 0.6,
      evidence: [makeEvidence({ filePath: 'README.md', evidenceType: 'README_SPECIFICATION' })],
    };

    const candidate = makeCandidate([lowTrustSkill, claimedSkill, readmeOnlySkill]);
    const job = {
      id: JOB_ID,
      tenantId: TENANT_ID,
      title: 'Platform Engineer',
      requirements: [
        makeRequirement({ extractedValue: 'Express.js', skillSlug: 'express-js' }),
        makeRequirement({ extractedValue: 'Kubernetes', skillSlug: 'kubernetes' }),
        makeRequirement({ extractedValue: 'Redis', skillSlug: 'redis' }),
        // Explicit absence — no candidate skill at all.
        makeRequirement({ extractedValue: 'Terraform', skillSlug: 'terraform' }),
      ],
    };

    const analysis = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);
    const revalidated = CandidateMatchAnalysisSchema.parse(analysis);

    assert.ok(revalidated.skillGaps.length >= 3);
    for (const gap of revalidated.skillGaps) {
      assert.ok(
        SkillGapSeverityEnum.options.includes(gap.severity),
        `severity "${gap.severity}" is not a canonical severity`
      );
      assert.ok(
        SkillGapEvidenceTrustEnum.options.includes(gap.evidenceTrust),
        `evidenceTrust "${gap.evidenceTrust}" is not a canonical trust state`
      );
    }

    const byName = new Map(revalidated.skillGaps.map((g) => [g.skillName, g]));

    // Low-trust evidence: insufficient BECAUSE the evidence is untrusted.
    assert.equal(byName.get('Express.js').severity, 'INSUFFICIENT_EVIDENCE');
    assert.equal(byName.get('Express.js').evidenceTrust, 'LOW_TRUST');

    // Unverified self-claim: no evidence at all — a different severity entirely.
    assert.equal(byName.get('Kubernetes').severity, 'UNVERIFIED_CLAIM');
    assert.equal(byName.get('Kubernetes').evidenceTrust, 'NO_EVIDENCE');

    // Explicit absence: no evidence and no claim.
    assert.equal(byName.get('Terraform').severity, 'EXPLICITLY_MISSING');
    assert.equal(byName.get('Terraform').evidenceTrust, 'NO_EVIDENCE');
  });
});

// ---------------------------------------------------------------------------
// 3. Semantic distinction is structurally enforced
// ---------------------------------------------------------------------------

describe('Canonical model: severity and evidenceTrust are separate axes', () => {
  it('rejects LOW_TRUST_EVIDENCE as a severity value', () => {
    assert.equal(SkillGapSeverityEnum.safeParse('LOW_TRUST_EVIDENCE').success, false);
    assert.deepEqual(SkillGapSeverityEnum.options, [
      'EXPLICITLY_MISSING',
      'UNVERIFIED_CLAIM',
      'INSUFFICIENT_EVIDENCE',
      'PARTIAL_TENURE',
    ]);
  });

  it('exposes evidence trust as its own canonical enum', () => {
    assert.deepEqual(SkillGapEvidenceTrustEnum.options, ['HIGH_TRUST', 'LOW_TRUST', 'NO_EVIDENCE']);
    // Trust states are not severities and severities are not trust states.
    for (const severity of SkillGapSeverityEnum.options) {
      assert.equal(SkillGapEvidenceTrustEnum.safeParse(severity).success, false);
    }
    for (const trust of SkillGapEvidenceTrustEnum.options) {
      assert.equal(SkillGapSeverityEnum.safeParse(trust).success, false);
    }
  });

  it('derives the per-gap trust enum from the single evidence trust class enum', () => {
    for (const option of EvidenceTrustClassEnum.options) {
      assert.ok(SkillGapEvidenceTrustEnum.options.includes(option));
    }
  });

  it('rejects a gap that carries a trust state in the severity slot', () => {
    const result = SkillGapSchema.safeParse({
      requirementId: crypto.randomUUID(),
      skillSlug: 'express-js',
      skillName: 'Express.js',
      category: 'SKILL',
      priority: 'HIGH',
      severity: 'LOW_TRUST_EVIDENCE',
      status: 'PARTIAL',
      reason: 'Evidence only in node_modules.',
      recommendation: 'Add candidate-authored code.',
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// 4. No invalid enum can escape the producer
// ---------------------------------------------------------------------------

describe('Producer guard: _createSkillGap validates before returning', () => {
  const req = makeRequirement({ extractedValue: 'Express.js', skillSlug: 'express-js' });

  it('throws at the producer when given a non-canonical severity', () => {
    assert.throws(
      () =>
        EvidenceMatchingService._createSkillGap(
          req,
          'express-js',
          'Express.js',
          'PARTIAL',
          'LOW_TRUST_EVIDENCE',
          'Evidence only in node_modules.',
          'Add candidate-authored code.'
        ),
      /severity|invalid_enum_value|Invalid enum/i
    );
  });

  it('throws at the producer when given a non-canonical evidence trust state', () => {
    assert.throws(
      () =>
        EvidenceMatchingService._createSkillGap(
          req,
          'express-js',
          'Express.js',
          'PARTIAL',
          'INSUFFICIENT_EVIDENCE',
          'Evidence only in node_modules.',
          'Add candidate-authored code.',
          'SORT_OF_TRUSTED'
        ),
      /evidenceTrust|invalid_enum_value|Invalid enum/i
    );
  });

  it('defaults evidenceTrust to NO_EVIDENCE for gaps with no backing evidence', () => {
    const gap = EvidenceMatchingService._createSkillGap(
      req,
      'express-js',
      'Express.js',
      'MISSING',
      'EXPLICITLY_MISSING',
      'MISSING: no evidence found.',
      'Connect a repository containing Express.js code.'
    );
    assert.equal(gap.evidenceTrust, 'NO_EVIDENCE');
  });

  it('derives trust state from evidence refs', () => {
    assert.equal(EvidenceMatchingService._deriveGapEvidenceTrust([]), 'NO_EVIDENCE');
    assert.equal(EvidenceMatchingService._deriveGapEvidenceTrust(null), 'NO_EVIDENCE');
    assert.equal(
      EvidenceMatchingService._deriveGapEvidenceTrust([{ provenanceTrustClass: 'LOW_TRUST' }]),
      'LOW_TRUST'
    );
    assert.equal(
      EvidenceMatchingService._deriveGapEvidenceTrust([
        { provenanceTrustClass: 'LOW_TRUST' },
        { provenanceTrustClass: 'HIGH_TRUST' },
      ]),
      'HIGH_TRUST'
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Complete analyze_job_fit MCP response carries both axes and validates
// ---------------------------------------------------------------------------

describe('analyze_job_fit MCP response contract', () => {
  it('requires severity on prioritizedSkillGaps and rejects a trust state there', () => {
    const gapShape = {
      skillSlug: 'express-js',
      skillName: 'Express.js',
      category: 'SKILL',
      priority: 'CRITICAL',
      remediationAdvice: 'Add candidate-authored code.',
    };

    const missingSeverity = AnalyzeJobFitOutputSchema.shape.prioritizedSkillGaps.safeParse([
      gapShape,
    ]);
    assert.equal(missingSeverity.success, false, 'severity must be a required output field');

    const trustAsSeverity = AnalyzeJobFitOutputSchema.shape.prioritizedSkillGaps.safeParse([
      { ...gapShape, severity: 'LOW_TRUST_EVIDENCE' },
    ]);
    assert.equal(trustAsSeverity.success, false, 'trust states must not pass as severity');

    const valid = AnalyzeJobFitOutputSchema.shape.prioritizedSkillGaps.safeParse([
      { ...gapShape, severity: 'INSUFFICIENT_EVIDENCE', evidenceTrust: 'LOW_TRUST' },
    ]);
    assert.equal(valid.success, true);
    assert.equal(valid.data[0].evidenceTrust, 'LOW_TRUST');
    assert.equal(valid.data[0].severity, 'INSUFFICIENT_EVIDENCE');
  });

  it('rejects unknown keys on prioritizedSkillGaps entries (no silent drift)', () => {
    const result = AnalyzeJobFitOutputSchema.shape.prioritizedSkillGaps.safeParse([
      {
        skillSlug: 'express-js',
        skillName: 'Express.js',
        category: 'SKILL',
        priority: 'CRITICAL',
        severity: 'INSUFFICIENT_EVIDENCE',
        evidenceTrust: 'LOW_TRUST',
        remediationAdvice: 'Add candidate-authored code.',
        unexpectedField: 'LOW_TRUST_EVIDENCE',
      },
    ]);
    assert.equal(result.success, false);
  });
});
