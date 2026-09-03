import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { EvidenceMatchingService } from '../../src/services/evidence-matching.service.js';

const TENANT = crypto.randomUUID();
const CANDIDATE_ID = crypto.randomUUID();

describe('Issue 1: EXPERIENCE requirement — manifest-only evidence must not produce HIGH_TRUST', () => {
  const baseReq = {
    id: crypto.randomUUID(),
    category: 'EXPERIENCE',
    importance: 'REQUIRED',
    weight: 1.0,
    extractedValue: 'Node.js Application Development Experience',
    rawSnippet: 'Practical experience developing and improving applications written in Node.js.',
    normalizedCriteria: {
      experienceType: 'PRACTICAL_DEVELOPMENT',
      technology: 'Node.js',
      associatedSkillSlug: 'node-js',
    },
  };

  const baseProfile = {
    id: CANDIDATE_ID,
    tenantId: TENANT,
    careerStatus: 'FRESHER',
    seniority: 'ENTRY_LEVEL',
    tenureMetrics: {
      totalExperienceMonths: 4,
      professionalTenureMonths: 0,
      professionalTenureYears: 0,
    },
    skills: [],
    projects: [],
  };

  it('CASE 1: Fastify package.json only -> CLAIMED/LOW_TRUST, not VERIFIED/HIGH_TRUST', () => {
    const profile = {
      ...baseProfile,
      skills: [
        {
          id: crypto.randomUUID(),
          slug: 'fastify',
          name: 'Fastify',
          provenanceStatus: 'VERIFIED',
          primaryEvidence: {
            id: crypto.randomUUID(),
            evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
            filePath: 'package.json',
            resourceName: 'ai-job-board-backend',
            confidenceScore: 0.85,
          },
          evidenceItems: [
            {
              id: crypto.randomUUID(),
              evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
              filePath: 'package.json',
              resourceName: 'ai-job-board-backend',
              confidenceScore: 0.85,
            },
          ],
        },
      ],
    };

    const { match } = EvidenceMatchingService._evaluateExperienceRequirement(
      baseReq, profile, new Map()
    );

    assert.equal(match.matchStatus, 'PARTIAL', 'Should be PARTIAL, not MATCHED');
    assert.equal(match.candidateProvenance, 'CLAIMED',
      'Manifest-only should produce CLAIMED provenance, not VERIFIED/CORROBORATED');
    assert.equal(match.provenanceTrustClass, 'LOW_TRUST',
      'Manifest-only should produce LOW_TRUST, not HIGH_TRUST');
    assert.ok(match.explanation.includes('dependency'),
      'Explanation should mention dependency/packaging limitation');
    assert.ok(match.matchConfidence < 0.5,
      'Match confidence should be low for manifest-only evidence');
  });

  it('CASE 2: Fastify source implementation -> preserves source-level trust', () => {
    const profile = {
      ...baseProfile,
      skills: [
        {
          id: crypto.randomUUID(),
          slug: 'fastify',
          name: 'Fastify',
          provenanceStatus: 'VERIFIED',
          primaryEvidence: {
            id: crypto.randomUUID(),
            evidenceType: 'CODE_USAGE',
            filePath: 'src/server.js',
            resourceName: 'ai-job-board-backend',
            confidenceScore: 0.95,
          },
          evidenceItems: [
            {
              id: crypto.randomUUID(),
              evidenceType: 'CODE_IMPORT_USAGE',
              filePath: 'src/routes/api.js',
              resourceName: 'ai-job-board-backend',
              confidenceScore: 0.9,
            },
          ],
        },
      ],
    };

    const { match } = EvidenceMatchingService._evaluateExperienceRequirement(
      baseReq, profile, new Map()
    );

    assert.equal(match.matchStatus, 'PARTIAL', 'Should be PARTIAL (0 professional months)');
    assert.equal(match.candidateProvenance, 'VERIFIED',
      'Source-level evidence should preserve VERIFIED provenance');
    assert.equal(match.provenanceTrustClass, 'HIGH_TRUST',
      'Source-level evidence should produce HIGH_TRUST');
    assert.ok(match.explanation.includes('verified repository implementations'),
      'Explanation should mention verified implementations');
  });

  it('CASE 3: Next.js only -> must not establish standalone Node.js experience', () => {
    const profile = {
      ...baseProfile,
      skills: [
        {
          id: crypto.randomUUID(),
          slug: 'next-js',
          name: 'Next.js',
          provenanceStatus: 'VERIFIED',
          primaryEvidence: {
            id: crypto.randomUUID(),
            evidenceType: 'CODE_USAGE',
            filePath: 'src/app/page.tsx',
            resourceName: 'frontend-app',
            confidenceScore: 0.9,
          },
          evidenceItems: [
            {
              id: crypto.randomUUID(),
              evidenceType: 'CODE_USAGE',
              filePath: 'src/app/page.tsx',
              resourceName: 'frontend-app',
              confidenceScore: 0.9,
            },
          ],
        },
      ],
    };

    const { match } = EvidenceMatchingService._evaluateExperienceRequirement(
      baseReq, profile, new Map()
    );

    assert.equal(match.matchStatus, 'MISSING',
      'Next.js alone should NOT satisfy Node.js application development experience');
    assert.equal(match.candidateProvenance, 'NONE');
  });

  it('CASE 4: Direct Node.js source implementation -> appropriate trust', () => {
    const profile = {
      ...baseProfile,
      skills: [
        {
          id: crypto.randomUUID(),
          slug: 'node-js',
          name: 'Node.js',
          provenanceStatus: 'VERIFIED',
          primaryEvidence: {
            id: crypto.randomUUID(),
            evidenceType: 'CODE_USAGE',
            filePath: 'src/server.js',
            resourceName: 'backend-api',
            confidenceScore: 0.95,
          },
          evidenceItems: [
            {
              id: crypto.randomUUID(),
              evidenceType: 'CODE_IMPORT_USAGE',
              filePath: 'src/server.js',
              resourceName: 'backend-api',
              confidenceScore: 0.9,
            },
          ],
        },
      ],
    };

    const { match } = EvidenceMatchingService._evaluateExperienceRequirement(
      baseReq, profile, new Map()
    );

    assert.equal(match.matchStatus, 'PARTIAL', 'Should be PARTIAL (0 professional months)');
    assert.equal(match.candidateProvenance, 'VERIFIED');
    assert.equal(match.provenanceTrustClass, 'HIGH_TRUST');
    assert.ok(match.explanation.includes('Node.js'));
  });

  it('CASE 5: User claim only (CLAIMED provenance, no evidence) -> MISSING', () => {
    const profile = {
      ...baseProfile,
      skills: [
        {
          id: crypto.randomUUID(),
          slug: 'node-js',
          name: 'Node.js',
          provenanceStatus: 'CLAIMED',
          isUserClaim: true,
          primaryEvidence: null,
          evidenceItems: [],
        },
      ],
    };

    const { match } = EvidenceMatchingService._evaluateExperienceRequirement(
      baseReq, profile, new Map()
    );

    assert.equal(match.matchStatus, 'MISSING');
    assert.equal(match.candidateProvenance, 'NONE');
  });

  it('CASE 6: Mixed evidence (manifest + source) -> uses source-level trust', () => {
    const profile = {
      ...baseProfile,
      skills: [
        {
          id: crypto.randomUUID(),
          slug: 'fastify',
          name: 'Fastify',
          provenanceStatus: 'VERIFIED',
          primaryEvidence: {
            id: crypto.randomUUID(),
            evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
            filePath: 'package.json',
            resourceName: 'app',
            confidenceScore: 0.85,
          },
          evidenceItems: [
            {
              id: crypto.randomUUID(),
              evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
              filePath: 'package.json',
              resourceName: 'app',
              confidenceScore: 0.85,
            },
            {
              id: crypto.randomUUID(),
              evidenceType: 'CODE_IMPORT_USAGE',
              filePath: 'src/server.js',
              resourceName: 'app',
              confidenceScore: 0.95,
            },
          ],
        },
      ],
    };

    const { match } = EvidenceMatchingService._evaluateExperienceRequirement(
      baseReq, profile, new Map()
    );

    assert.equal(match.matchStatus, 'PARTIAL');
    assert.equal(match.candidateProvenance, 'VERIFIED',
      'Mixed evidence with source-level should preserve VERIFIED');
    assert.equal(match.provenanceTrustClass, 'HIGH_TRUST',
      'Mixed evidence with source-level should produce HIGH_TRUST');
  });
});
