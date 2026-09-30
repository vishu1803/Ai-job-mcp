/**
 * @file Regression Suite: Truth Categories & Required/Preferred Requirement Semantics
 *
 * Validates the root fixes for:
 * 1. Bug 1: Truth Category Contract Normalization (Canonical truth categories + legacy mapping)
 * 2. Bug 2: Required vs Preferred Requirement Classification & Scoring Preservation
 * 3. Bug 3: Aggregation Semantics & Truth State Invariants
 * 4. Deterministic scoring safety and explainability
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import {
  CANONICAL_TRUTH_CATEGORIES,
  CanonicalTruthCategoryEnum,
  normalizeTruthCategory,
  isVerifiedTruthCategory,
  isClaimedTruthCategory,
  isCanonicalTruthCategory,
} from '../../src/domain/career/truth-category.js';

import {
  CareerAssertionSchema,
  CareerAssertionStatusEnum,
} from '../../src/domain/career/integrity-gate.schemas.js';

import {
  CANONICAL_REQUIREMENT_IMPORTANCES,
  RequirementImportanceEnum,
  isRequirementRequired,
  isRequirementPreferred,
} from '../../src/domain/career/job-requirement.schemas.js';

import { JobDescriptionParser } from '../../src/domain/career/job-parser.js';
import { EvidenceMatchingService } from '../../src/services/evidence-matching.service.js';
import { AtsFitScoreService } from '../../src/services/ats-fit-score.service.js';
import { SkillTaxonomyEngine } from '../../src/domain/career/skill-taxonomy.js';

describe('Production Bug Fix Suite: Truth Categories & Requirement Semantics', () => {
  // ---------------------------------------------------------------------------
  // 1. Truth Category Contract & Normalization Layer (Bug 1)
  // ---------------------------------------------------------------------------
  describe('1. Truth Category Contract Normalization Layer', () => {
    it('defines authoritative canonical truth categories', () => {
      assert.deepEqual(CANONICAL_TRUTH_CATEGORIES, [
        'VERIFIED',
        'INFERRED',
        'CLAIMED',
        'MISSING_EVIDENCE',
        'UNKNOWN',
      ]);
    });

    it('passes canonical values through normalizeTruthCategory unchanged', () => {
      for (const cat of CANONICAL_TRUTH_CATEGORIES) {
        assert.equal(normalizeTruthCategory(cat), cat);
        assert.ok(isCanonicalTruthCategory(cat));
      }
    });

    it('normalizes legacy SELF_DECLARED to canonical CLAIMED', () => {
      assert.equal(normalizeTruthCategory('SELF_DECLARED'), 'CLAIMED');
      assert.equal(normalizeTruthCategory('self_declared'), 'CLAIMED');
      assert.ok(isClaimedTruthCategory('SELF_DECLARED'));
    });

    it('normalizes USER_PROVIDED to canonical CLAIMED', () => {
      assert.equal(normalizeTruthCategory('USER_PROVIDED'), 'CLAIMED');
      assert.ok(isClaimedTruthCategory('USER_PROVIDED'));
    });

    it('normalizes CORROBORATED to canonical VERIFIED', () => {
      assert.equal(normalizeTruthCategory('CORROBORATED'), 'VERIFIED');
      assert.ok(isVerifiedTruthCategory('CORROBORATED'));
      assert.ok(isVerifiedTruthCategory('VERIFIED'));
    });

    it('normalizes NO_EVIDENCE to canonical MISSING_EVIDENCE', () => {
      assert.equal(normalizeTruthCategory('NO_EVIDENCE'), 'MISSING_EVIDENCE');
      assert.equal(normalizeTruthCategory('NONE'), 'MISSING_EVIDENCE');
    });

    it('normalizes invalid or unrecognized categories to canonical UNKNOWN', () => {
      assert.equal(normalizeTruthCategory('INVALID_FOO'), 'UNKNOWN');
      assert.equal(normalizeTruthCategory(null), 'UNKNOWN');
      assert.equal(normalizeTruthCategory(undefined), 'UNKNOWN');
    });

    it('CareerAssertionSchema accepts canonical truth categories and rejects un-normalized legacy strings', () => {
      const tenantId = randomUUID();
      const candidateId = randomUUID();
      const validAssertion = {
        assertionId: randomUUID(),
        tenantId,
        candidateId,
        assertionType: 'SKILL',
        statement: 'Candidate has 3 years of React experience',
        status: 'CLAIMED',
      };

      const parsed = CareerAssertionSchema.parse(validAssertion);
      assert.equal(parsed.status, 'CLAIMED');

      // Direct SELF_DECLARED without normalization must fail CareerAssertionSchema validation
      const invalidLegacyAssertion = {
        ...validAssertion,
        status: 'SELF_DECLARED',
      };
      assert.throws(
        () => CareerAssertionSchema.parse(invalidLegacyAssertion),
        /Invalid enum value/
      );

      // With normalization, it parses cleanly
      const normalizedAssertion = {
        ...invalidLegacyAssertion,
        status: normalizeTruthCategory(invalidLegacyAssertion.status),
      };
      const parsedNormalized = CareerAssertionSchema.parse(normalizedAssertion);
      assert.equal(parsedNormalized.status, 'CLAIMED');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Requirement Priority Vocabulary & Semantics (Bug 2)
  // ---------------------------------------------------------------------------
  describe('2. Canonical Requirement Priority Vocabulary & Helpers', () => {
    it('supports full spectrum of canonical requirement priorities', () => {
      const expectedPriorities = [
        'REQUIRED',
        'PREFERRED',
        'NICE_TO_HAVE',
        'CONDITIONAL',
        'LOCATION_GATED',
        'AUTHORIZATION_GATED',
        'EXPERIENCE_GATED',
        'EDUCATION_GATED',
        'CERTIFICATION_GATED',
        'OPTIONAL',
      ];
      for (const p of expectedPriorities) {
        assert.ok(CANONICAL_REQUIREMENT_IMPORTANCES.includes(p), `Missing importance: ${p}`);
        assert.doesNotThrow(() => RequirementImportanceEnum.parse(p));
      }
    });

    it('isRequirementRequired correctly identifies hard gates and constraints', () => {
      assert.equal(isRequirementRequired('REQUIRED'), true);
      assert.equal(isRequirementRequired('CONDITIONAL'), true);
      assert.equal(isRequirementRequired('LOCATION_GATED'), true);
      assert.equal(isRequirementRequired('AUTHORIZATION_GATED'), true);
      assert.equal(isRequirementRequired('EXPERIENCE_GATED'), true);
      assert.equal(isRequirementRequired('EDUCATION_GATED'), true);
      assert.equal(isRequirementRequired('CERTIFICATION_GATED'), true);

      assert.equal(isRequirementRequired('PREFERRED'), false);
      assert.equal(isRequirementRequired('NICE_TO_HAVE'), false);
      assert.equal(isRequirementRequired('OPTIONAL'), false);
      assert.equal(isRequirementRequired(null), false);
    });

    it('isRequirementPreferred correctly identifies secondary preferences', () => {
      assert.equal(isRequirementPreferred('PREFERRED'), true);
      assert.equal(isRequirementPreferred('NICE_TO_HAVE'), true);
      assert.equal(isRequirementPreferred('OPTIONAL'), true);

      assert.equal(isRequirementPreferred('REQUIRED'), false);
      assert.equal(isRequirementPreferred('CONDITIONAL'), false);
      assert.equal(isRequirementPreferred(null), false);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Exact Production Test Fixture: Parsing, Matching, & Scoring
  // ---------------------------------------------------------------------------
  describe('3. Production Fixture End-to-End Extraction, Matching & Scoring', () => {
    const fixtureJobDescription = `
Junior Full Stack Engineer

Required:
JavaScript
React
Node.js
PostgreSQL
REST APIs
Git

Preferred:
Next.js
Docker
TypeScript
FastAPI
`;

    it('job parser extracts all 10 requirements preserving exact Required and Preferred priorities', async () => {
      const tenantId = randomUUID();
      const parsed = await JobDescriptionParser.parse(
        { rawText: fixtureJobDescription, source: 'PASTE' },
        { tenantId }
      );

      assert.ok(
        parsed.requirements.length >= 10,
        `Expected at least 10 requirements, got ${parsed.requirements.length}`
      );

      const reqMap = new Map();
      for (const r of parsed.requirements) {
        if (r.category === 'SKILL' && r.skillSlug) {
          reqMap.set(r.skillSlug, r);
        }
      }

      // Check all 6 REQUIRED skills
      const requiredSlugs = ['javascript', 'react', 'node-js', 'postgresql', 'rest-api', 'git'];
      for (const slug of requiredSlugs) {
        const found = reqMap.get(slug);
        assert.ok(found, `Expected required skill slug '${slug}' to be extracted`);
        assert.equal(found.importance, 'REQUIRED', `Expected '${slug}' to be REQUIRED`);
        assert.equal(isRequirementRequired(found.importance), true);
      }

      // Check all 4 PREFERRED skills
      const preferredSlugs = ['next-js', 'docker', 'typescript', 'fastapi'];
      for (const slug of preferredSlugs) {
        const found = reqMap.get(slug);
        assert.ok(found, `Expected preferred skill slug '${slug}' to be extracted`);
        assert.equal(found.importance, 'PREFERRED', `Expected '${slug}' to be PREFERRED`);
        assert.equal(isRequirementPreferred(found.importance), true);
      }
    });

    it('matches candidate evidence correctly: verified matches, unverified claims, and missing', async () => {
      const tenantId = randomUUID();
      const parsedJob = await JobDescriptionParser.parse(
        { rawText: fixtureJobDescription, source: 'PASTE' },
        { tenantId }
      );

      const mockResourceId = randomUUID();

      // Candidate setup:
      // Verified evidence: JavaScript, React, PostgreSQL, Git, Next.js, FastAPI
      // Unverified claim / self-declared: Node.js, Docker
      // Missing (no evidence or claim): TypeScript
      const candidateProfile = {
        id: randomUUID(),
        tenantId,
        skills: [
          {
            name: 'JavaScript',
            slug: 'javascript',
            category: 'LANGUAGE',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 0.95,
            evidence: [
              {
                id: randomUUID(),
                resourceId: mockResourceId,
                evidenceType: 'CODE_USAGE',
                filePath: 'src/index.js',
                confidenceScore: 0.95,
              },
            ],
          },
          {
            name: 'React',
            slug: 'react',
            category: 'FRAMEWORK',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 0.95,
            evidence: [
              {
                id: randomUUID(),
                resourceId: mockResourceId,
                evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
                filePath: 'package.json',
                confidenceScore: 0.95,
              },
            ],
          },
          {
            name: 'PostgreSQL',
            slug: 'postgresql',
            category: 'DATABASE',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 0.9,
            evidence: [
              {
                id: randomUUID(),
                resourceId: mockResourceId,
                evidenceType: 'CONFIG_SYNTAX_DECLARATION',
                filePath: 'docker-compose.yml',
                confidenceScore: 0.9,
              },
            ],
          },
          {
            name: 'Git',
            slug: 'git',
            category: 'TOOL',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 0.9,
            evidence: [
              {
                id: randomUUID(),
                resourceId: mockResourceId,
                evidenceType: 'COMMIT_CONTRIBUTION',
                filePath: '.git',
                confidenceScore: 0.9,
              },
            ],
          },
          {
            name: 'Next.js',
            slug: 'next-js',
            category: 'FRAMEWORK',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 0.9,
            evidence: [
              {
                id: randomUUID(),
                resourceId: mockResourceId,
                evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
                filePath: 'package.json',
                confidenceScore: 0.9,
              },
            ],
          },
          {
            name: 'FastAPI',
            slug: 'fastapi',
            category: 'FRAMEWORK',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 0.9,
            evidence: [
              {
                id: randomUUID(),
                resourceId: mockResourceId,
                evidenceType: 'CODE_IMPORT_USAGE',
                filePath: 'main.py',
                confidenceScore: 0.9,
              },
            ],
          },
          // Node.js: Self-declared only, no verified code or manifest
          {
            name: 'Node.js',
            slug: 'node-js',
            category: 'RUNTIME',
            provenanceStatus: 'SELF_DECLARED',
            truthCategory: 'CLAIMED',
            confidenceScore: 0.9,
            evidence: [],
          },
          // Docker: Self-declared only, no verified code or manifest
          {
            name: 'Docker',
            slug: 'docker',
            category: 'TOOL',
            provenanceStatus: 'SELF_DECLARED',
            truthCategory: 'CLAIMED',
            confidenceScore: 0.85,
            evidence: [],
          },
        ],
        workHistory: [],
        education: [],
        projects: [
          {
            id: randomUUID(),
            name: 'Web Portfolio',
            skills: ['javascript', 'react', 'postgresql', 'git', 'next-js', 'fastapi'],
            relevanceScore: 85.0,
          },
        ],
      };

      const jobDescriptionObj = {
        id: randomUUID(),
        tenantId,
        requirements: parsedJob.requirements.map((r) => ({
          ...r,
          id: randomUUID(),
        })),
      };

      const context = { tenantId };
      const resourceMap = new Map([[mockResourceId, 'candidate/portfolio-repo']]);

      const matchAnalysis = EvidenceMatchingService.matchJobToCandidate(
        context,
        jobDescriptionObj,
        candidateProfile,
        resourceMap
      );

      // Verify requirement match states
      const matchesBySlug = new Map();
      for (const m of matchAnalysis.requirementMatches) {
        matchesBySlug.set(m.skillSlug, m);
      }

      // 1. JavaScript: MATCHED
      assert.equal(matchesBySlug.get('javascript')?.matchStatus, 'MATCHED');
      assert.equal(matchesBySlug.get('javascript')?.required, true);

      // 2. React: MATCHED
      assert.equal(matchesBySlug.get('react')?.matchStatus, 'MATCHED');
      assert.equal(matchesBySlug.get('react')?.required, true);

      // 3. PostgreSQL: MATCHED
      assert.equal(matchesBySlug.get('postgresql')?.matchStatus, 'MATCHED');
      assert.equal(matchesBySlug.get('postgresql')?.required, true);

      // 4. Git: MATCHED
      assert.equal(matchesBySlug.get('git')?.matchStatus, 'MATCHED');
      assert.equal(matchesBySlug.get('git')?.required, true);

      // 5. REST APIs: MATCHED via taxonomy (FastAPI implements rest-api)
      assert.equal(matchesBySlug.get('rest-api')?.matchStatus, 'MATCHED');
      assert.equal(matchesBySlug.get('rest-api')?.required, true);

      // 6. Node.js (REQUIRED): PARTIAL with UNVERIFIED_CLAIM / self-declared
      const nodeMatch = matchesBySlug.get('node-js');
      assert.ok(nodeMatch, 'Node.js requirement match exists');
      assert.equal(nodeMatch.required, true);
      assert.equal(nodeMatch.matchStatus, 'PARTIAL');
      assert.equal(nodeMatch.isUserClaim, true);
      assert.equal(nodeMatch.claimLabel, '[Self-Declared Skill]');
      assert.notEqual(
        nodeMatch.matchStatus,
        'MATCHED',
        'Self-declared Node.js must not be MATCHED'
      );

      // 7. Next.js (PREFERRED): MATCHED
      assert.equal(matchesBySlug.get('next-js')?.matchStatus, 'MATCHED');
      assert.equal(matchesBySlug.get('next-js')?.required, false);

      // 8. FastAPI (PREFERRED): MATCHED
      assert.equal(matchesBySlug.get('fastapi')?.matchStatus, 'MATCHED');
      assert.equal(matchesBySlug.get('fastapi')?.required, false);

      // 9. Docker (PREFERRED): PARTIAL with UNVERIFIED_CLAIM / self-declared
      const dockerMatch = matchesBySlug.get('docker');
      assert.ok(dockerMatch, 'Docker requirement match exists');
      assert.equal(dockerMatch.required, false);
      assert.equal(dockerMatch.matchStatus, 'PARTIAL');
      assert.equal(dockerMatch.isUserClaim, true);
      assert.equal(dockerMatch.claimLabel, '[Self-Declared Skill]');

      // 10. TypeScript (PREFERRED): MISSING
      const tsMatch = matchesBySlug.get('typescript');
      assert.ok(tsMatch, 'TypeScript requirement match exists');
      assert.equal(tsMatch.required, false);
      assert.equal(tsMatch.matchStatus, 'MISSING');
      assert.equal(tsMatch.matchConfidence, 0.0);

      // Verify Aggregation Invariants
      const summary = matchAnalysis.summary;
      assert.equal(summary.matchedCount, 7); // JS, React, PostgreSQL, Git, REST APIs, Next.js, FastAPI
      assert.equal(summary.partialCount, 2); // Node.js, Docker
      assert.equal(summary.missingCount, 1); // TypeScript
      assert.equal(summary.unverifiedClaimCount, 2); // Node.js and Docker
      assert.equal(
        summary.matchedCount + summary.partialCount + summary.missingCount + summary.unknownCount,
        10
      );

      // Now calculate ATS Fit Score
      const fitScoreResult = AtsFitScoreService.calculateCandidateJobFit(
        context,
        jobDescriptionObj,
        matchAnalysis,
        {
          candidateId: candidateProfile.id,
          jobDescriptionId: jobDescriptionObj.id,
          projectRankings: [{ project: candidateProfile.projects[0], relevanceScore: 85.0 }],
        },
        candidateProfile
      );

      // Verify Score Breakdown
      const breakdown = fitScoreResult.scoreBreakdown;

      // Required skills score MUST be non-zero and populated accurately
      // 5 required matched (JS, React, Postgres, Git, REST APIs) @ weight 1.0 = 5.0
      // 1 required partial (Node.js self-declared) @ 0.25 = 0.25
      // Total required = 5.25 / 6.0 * 40 = 35.0
      assert.ok(
        breakdown.requiredSkillsScore > 0,
        `Expected requiredSkillsScore > 0, got ${breakdown.requiredSkillsScore}`
      );
      assert.equal(breakdown.requiredSkillsScore, 35.0);

      // Preferred skills score MUST be non-zero and populated accurately
      // 2 preferred matched (Next.js, FastAPI) @ 1.0 = 2.0
      // 1 preferred partial (Docker self-declared) @ 0.25 = 0.25
      // 1 preferred missing (TypeScript) = 0.0
      // Total preferred = 2.25 / 4.0 * 15 = 8.44
      assert.ok(
        breakdown.preferredSkillsScore > 0,
        `Expected preferredSkillsScore > 0, got ${breakdown.preferredSkillsScore}`
      );
      assert.equal(breakdown.preferredSkillsScore, 8.44);

      // Scores are deterministic and bounded
      assert.ok(fitScoreResult.overallScore >= 0 && fitScoreResult.overallScore <= 100);
      assert.equal(typeof fitScoreResult.overallScore, 'number');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Section Recognition Flexibility (No Fixture Overfitting)
  // ---------------------------------------------------------------------------
  describe('4. Section Recognition & Requirement Priority Parsing Generalization', () => {
    it('handles various required and preferred heading syntaxes cleanly', async () => {
      const variations = [
        `
## Requirements
- Python
- Django

## Nice to Have
- Kubernetes
- GraphQL
`,
        `
Must-Have Skills:
* Go
* Docker

Bonus Qualifications:
* Terraform
* AWS
`,
        `
Core Requirements:
- Java
- Spring Boot

Preferred:
- Kafka
`,
      ];

      for (const text of variations) {
        const parsed = await JobDescriptionParser.parse(
          { rawText: text, source: 'PASTE' },
          { tenantId: randomUUID() }
        );
        assert.ok(parsed.requirements.length >= 2, `Failed to extract requirements from:\n${text}`);
        const hasRequired = parsed.requirements.some((r) => isRequirementRequired(r.importance));
        const hasPreferred = parsed.requirements.some((r) => isRequirementPreferred(r.importance));
        assert.ok(hasRequired, `Should contain required requirement in:\n${text}`);
        assert.ok(hasPreferred, `Should contain preferred requirement in:\n${text}`);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Logical Relationships & Canonical Match States
  // ---------------------------------------------------------------------------
  describe('5. Logical Relationships & Match States', () => {
    it('evaluates boolean and compound requirements without losing canonical importance', () => {
      const tenantId = randomUUID();
      const andReq = {
        id: randomUUID(),
        category: 'SKILL',
        importance: 'REQUIRED',
        logicalRelation: 'AND',
        extractedValue: 'React AND Redux',
        required: true,
      };
      const orReq = {
        id: randomUUID(),
        category: 'SKILL',
        importance: 'PREFERRED',
        logicalRelation: 'OR',
        extractedValue: 'PostgreSQL OR MySQL',
        required: false,
      };

      assert.equal(isRequirementRequired(andReq.importance), true);
      assert.equal(isRequirementPreferred(orReq.importance), true);
    });

    it('preserves UNSUPPORTED_CANDIDATE match state without crashing summary aggregation', () => {
      const tenantId = randomUUID();
      const requirementMatches = [
        {
          requirementId: randomUUID(),
          category: 'SKILL',
          importance: 'REQUIRED',
          required: true,
          matchStatus: 'MATCHED',
          weight: 1.0,
        },
        {
          requirementId: randomUUID(),
          category: 'SKILL',
          importance: 'REQUIRED',
          required: true,
          matchStatus: 'UNSUPPORTED_CANDIDATE',
          weight: 1.0,
        },
      ];

      // Verify ats-fit-score handles UNSUPPORTED_CANDIDATE as 0.0 value factor
      const candidateProfile = {
        id: randomUUID(),
        tenantId,
        skills: [],
      };
      const jobDescriptionObj = {
        id: randomUUID(),
        tenantId,
        requirements: [],
      };
      const matchAnalysis = {
        candidateId: candidateProfile.id,
        jobDescriptionId: jobDescriptionObj.id,
        tenantId,
        summary: {
          totalRequirements: 2,
          matchedCount: 1,
          partialCount: 0,
          missingCount: 1,
          unknownCount: 0,
          unsupportedCandidateCount: 1,
          criticalGapsCount: 1,
          highGapsCount: 0,
          mediumGapsCount: 0,
          lowGapsCount: 0,
        },
        requirementMatches,
        skillGaps: [],
      };

      const fitScoreResult = AtsFitScoreService.calculateCandidateJobFit(
        { tenantId },
        jobDescriptionObj,
        matchAnalysis,
        {
          candidateId: candidateProfile.id,
          jobDescriptionId: jobDescriptionObj.id,
          projectRankings: [],
        },
        candidateProfile
      );

      assert.ok(fitScoreResult.overallScore >= 0 && fitScoreResult.overallScore <= 100);
      // 1 matched @ 1.0, 1 unsupported candidate @ 0.0 -> 1/2 * 40 = 20.0
      assert.equal(fitScoreResult.scoreBreakdown.requiredSkillsScore, 20.0);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Comprehensive 7-Component Scoring Invariants
  // ---------------------------------------------------------------------------
  describe('6. 7-Component Bounded Scoring Invariants', () => {
    it('verifies all 7 score components remain strictly bounded and non-negative', () => {
      const tenantId = randomUUID();
      const candidateProfile = {
        id: randomUUID(),
        tenantId,
        skills: [],
        workHistory: [
          { title: 'Full Stack Engineer', durationYears: 3, employmentType: 'FULL_TIME' },
        ],
        education: [{ degree: 'BACHELORS', field: 'Computer Science' }],
        projects: [{ id: randomUUID(), name: 'Test Project', relevanceScore: 90.0 }],
      };
      const jobDescriptionObj = {
        id: randomUUID(),
        tenantId,
        requirements: [],
      };

      const matchAnalysis = {
        candidateId: candidateProfile.id,
        jobDescriptionId: jobDescriptionObj.id,
        tenantId,
        summary: {
          totalRequirements: 3,
          matchedCount: 2,
          partialCount: 1,
          missingCount: 0,
          unknownCount: 0,
          criticalGapsCount: 0,
          highGapsCount: 0,
          mediumGapsCount: 0,
          lowGapsCount: 0,
        },
        requirementMatches: [
          {
            requirementId: randomUUID(),
            category: 'SKILL',
            importance: 'REQUIRED',
            required: true,
            matchStatus: 'MATCHED',
            weight: 1.0,
          },
          {
            requirementId: randomUUID(),
            category: 'SKILL',
            importance: 'PREFERRED',
            required: false,
            matchStatus: 'MATCHED',
            weight: 1.0,
          },
          {
            requirementId: randomUUID(),
            category: 'LOCATION',
            importance: 'REQUIRED',
            required: true,
            matchStatus: 'MATCHED',
            weight: 1.0,
          },
        ],
        skillGaps: [],
      };

      const fitScoreResult = AtsFitScoreService.calculateCandidateJobFit(
        { tenantId },
        jobDescriptionObj,
        matchAnalysis,
        {
          candidateId: candidateProfile.id,
          jobDescriptionId: jobDescriptionObj.id,
          projectRankings: [{ project: candidateProfile.projects[0], relevanceScore: 90.0 }],
        },
        candidateProfile
      );

      const bd = fitScoreResult.scoreBreakdown;
      assert.ok(bd.requiredSkillsScore >= 0 && bd.requiredSkillsScore <= 40.0);
      assert.ok(bd.preferredSkillsScore >= 0 && bd.preferredSkillsScore <= 15.0);
      assert.ok(bd.projectRelevanceScore >= 0 && bd.projectRelevanceScore <= 20.0);
      assert.ok(bd.experienceFitScore >= 0 && bd.experienceFitScore <= 10.0);
      assert.ok(bd.educationFitScore >= 0 && bd.educationFitScore <= 5.0);
      assert.ok(bd.locationFitScore >= 0 && bd.locationFitScore <= 5.0);
      assert.ok(bd.evidenceConfidenceScore >= 0 && bd.evidenceConfidenceScore <= 5.0);
      assert.ok(fitScoreResult.overallScore >= 0 && fitScoreResult.overallScore <= 100.0);
    });
  });
});
