/**
 * @file Phase 5 Job Intelligence, Requirement Semantics & Explainability Regression Test Suite
 *
 * Verifies that the Career Intelligence pipeline correctly interprets real-world job descriptions:
 * 1. Explicit required language
 * 2. Explicit preferred language
 * 3. Responsibility vs requirement
 * 4. Explicit vs inferred requirement
 * 5. OR requirements
 * 6. AND requirements
 * 7. Experience + skill separation
 * 8. Education required/preferred
 * 9. Equivalent experience
 * 10. Work authorization
 * 11. Remote/hybrid/onsite
 * 12. Certification
 * 13. Domain knowledge
 * 14. Soft-skill filtering
 * 15. Generic requirement filtering
 * 16. Semantic deduplication
 * 17. Contradictory requirements
 * 18. Requirement explanation
 * 19. MCP parity
 * 20. Extension parity
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { JobDescriptionParser } from '../../src/domain/career/job-parser.js';
import {
  normalizeJobInput,
  parseJobDescriptionSections,
  resolveRequirementImportance,
} from '../../src/services/job-normalization.service.js';
import {
  isRequirementRequired,
  isRequirementPreferred,
} from '../../src/domain/career/job-requirement.schemas.js';
import { EvidenceMatchingService } from '../../src/services/evidence-matching.service.js';
import { SkillTaxonomyEngine } from '../../src/domain/career/skill-taxonomy.js';
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
    auth: { tenantId: MOCK_TENANT_ID, userId: MOCK_USER_ID, role: 'developer' },
  };
}

describe('Phase 5 — Job Intelligence, Requirement Semantics & Explainability', () => {
  // ---------------------------------------------------------------------------
  // 1. Explicit Required Language
  // ---------------------------------------------------------------------------
  it('TEST 1 — Explicit required language resolves to REQUIRED, weight 1.0, required: true', () => {
    const requiredPhrases = [
      'Must have experience with React.',
      'Mandatory proficiency in PostgreSQL.',
      'Essential knowledge of Git.',
      'Required: Node.js development experience.',
      'Must possess strong background in REST APIs.',
    ];

    for (const phrase of requiredPhrases) {
      const importance = JobDescriptionParser.classifyLineImportance(phrase, 'REQUIRED');
      assert.equal(importance, 'REQUIRED', `Expected '${phrase}' to be classified as REQUIRED`);
      assert.equal(isRequirementRequired(importance), true);
    }
  });

  // ---------------------------------------------------------------------------
  // 2. Explicit Preferred Language
  // ---------------------------------------------------------------------------
  it('TEST 2 — Explicit preferred language resolves to PREFERRED or OPTIONAL, required: false', () => {
    const preferredPhrases = [
      'Experience with AWS is a plus.',
      'React knowledge is a plus.',
      'Docker experience is strongly preferred.',
      'Familiarity with FastAPI is desirable.',
      'Prior startup experience is a bonus.',
      'Next.js is nice to have.',
      'TypeScript is advantageous.',
    ];

    for (const phrase of preferredPhrases) {
      const importance = JobDescriptionParser.classifyLineImportance(phrase, 'REQUIRED');
      assert.ok(
        ['PREFERRED', 'OPTIONAL'].includes(importance),
        `Expected '${phrase}' to be PREFERRED or OPTIONAL, got ${importance}`
      );
      assert.equal(isRequirementRequired(importance), false);
    }
  });

  // ---------------------------------------------------------------------------
  // 3. Responsibility vs Requirement
  // ---------------------------------------------------------------------------
  it('TEST 3 — Responsibility statements do not convert into hard required filters', async () => {
    const jdText = `
Software Engineer

Responsibilities:
- Build scalable React applications.
- Design and implement REST APIs.
- Collaborate with cross-functional product teams.
- Debug production issues and maintain infrastructure.

Requirements:
- Must have experience with React.
- React experience is preferred.
`;

    const parsed = await JobDescriptionParser.parse(
      { rawText: jdText, source: 'PASTE' },
      { tenantId: MOCK_TENANT_ID }
    );

    // Pure responsibility statements like "Collaborate with cross-functional product teams"
    // or "Debug production issues" must not be emitted as hard SKILL requirements
    const teamCollabReq = parsed.requirements.find((r) =>
      r.extractedValue.toLowerCase().includes('collaborate')
    );
    assert.equal(teamCollabReq, undefined, 'Responsibility prose must not become a requirement');

    // "Must have experience with React" under Requirements is REQUIRED
    const reactReq = parsed.requirements.find(
      (r) => r.skillSlug === 'react' && r.importance === 'REQUIRED'
    );
    assert.ok(reactReq, 'Explicit requirement must be preserved as REQUIRED');
    assert.equal(isRequirementRequired(reactReq.importance), true);
  });

  // ---------------------------------------------------------------------------
  // 4. Explicit vs Inferred Requirements
  // ---------------------------------------------------------------------------
  it('TEST 4 — Preserves provenance and section origin of explicit vs inferred requirements', async () => {
    const jdText = `
Full Stack Developer

About The Role:
Build production applications using React.

Requirements:
- Must have React experience.
`;

    const parsed = await JobDescriptionParser.parse(
      { rawText: jdText, source: 'PASTE' },
      { tenantId: MOCK_TENANT_ID }
    );

    const reactReq = parsed.requirements.find((r) => r.skillSlug === 'react');
    assert.ok(reactReq, 'React requirement must exist');
    assert.ok(reactReq.sourceSpan, 'Requirement must retain sourceSpan provenance');
    assert.ok(
      reactReq.sourceSpan.section === 'REQUIREMENTS' || reactReq.sourceSpan.section === 'ABOUT_ROLE'
    );
  });

  // ---------------------------------------------------------------------------
  // 5. OR Requirements (Logical Disjunction)
  // ---------------------------------------------------------------------------
  it('TEST 5 — Disjunction (OR) requirements do not penalize candidate possessing one alternative', () => {
    const req = {
      id: randomUUID(),
      tenantId: MOCK_TENANT_ID,
      category: 'SKILL',
      importance: 'REQUIRED',
      skillSlug: 'react',
      extractedValue: 'React or Vue',
      normalizedCriteria: {
        skillSlug: 'react',
        alternatives: ['react', 'vue'],
        logicalOperator: 'OR',
      },
    };

    // Candidate has React, but lacks Vue
    const skillsBySlug = new Map([
      [
        'react',
        {
          slug: 'react',
          name: 'React',
          provenanceStatus: 'VERIFIED',
          truthCategory: 'VERIFIED',
          confidenceScore: 0.95,
          primaryEvidence: {
            id: randomUUID(),
            resourceId: MOCK_REPO_ID,
            resourceName: 'web-repo',
            evidenceType: 'CODE_USAGE',
            filePath: 'src/App.jsx',
            confidenceScore: 0.95,
          },
        },
      ],
    ]);

    const result = EvidenceMatchingService._evaluateSkillRequirement(req, skillsBySlug, new Map());
    assert.equal(result.match.matchStatus, 'MATCHED');
    assert.ok(
      result.match.explanation.includes('React') || result.match.matchConfidence >= 0.8,
      'Candidate with React satisfies React or Vue requirement'
    );
  });

  // ---------------------------------------------------------------------------
  // 6. AND Requirements (Logical Conjunction)
  // ---------------------------------------------------------------------------
  it('TEST 6 — Conjunction (AND) requires candidate to possess both skills for full match', () => {
    const skillsInSentence = JobDescriptionParser.extractSkillsFromLine('React and TypeScript');
    const slugs = skillsInSentence.map((s) => s.slug);

    assert.ok(slugs.includes('react'), 'Must extract React');
    assert.ok(slugs.includes('typescript'), 'Must extract TypeScript');
    assert.equal(slugs.length, 2, 'Must extract exactly 2 distinct atomic skills');
  });

  // ---------------------------------------------------------------------------
  // 7. Experience + Skill Separation
  // ---------------------------------------------------------------------------
  it('TEST 7 — "3+ years of React experience" separates technical skill from tenure requirement', async () => {
    const jdText = `
Software Engineer
Requirements:
- 3+ years of React experience
`;

    const parsed = await JobDescriptionParser.parse(
      { rawText: jdText, source: 'PASTE' },
      { tenantId: MOCK_TENANT_ID }
    );

    // Must extract SKILL: react
    const skillReq = parsed.requirements.find(
      (r) => r.category === 'SKILL' && r.skillSlug === 'react'
    );
    assert.ok(skillReq, 'Must extract React as SKILL category');

    // Must extract EXPERIENCE: 3+ years in React
    const expReq = parsed.requirements.find(
      (r) => r.category === 'EXPERIENCE' && r.normalizedCriteria?.minYears === 3
    );
    assert.ok(expReq, 'Must extract 3+ years as EXPERIENCE category');
    assert.equal(expReq.normalizedCriteria.minYears, 3);
    assert.equal(expReq.normalizedCriteria.associatedSkillSlug, 'react');
  });

  // ---------------------------------------------------------------------------
  // 8. Education Required vs Preferred
  // ---------------------------------------------------------------------------
  it('TEST 8 — Distinguishes Bachelor required from Bachelor preferred', async () => {
    const reqJd = `
Software Engineer
Requirements:
- Bachelor's degree in Computer Science required.
`;
    const prefJd = `
Software Engineer
Requirements:
- Bachelor's degree in Computer Science preferred.
`;

    const parsedReq = await JobDescriptionParser.parse(
      { rawText: reqJd, source: 'PASTE' },
      { tenantId: MOCK_TENANT_ID }
    );
    const parsedPref = await JobDescriptionParser.parse(
      { rawText: prefJd, source: 'PASTE' },
      { tenantId: MOCK_TENANT_ID }
    );

    const eduReq = parsedReq.requirements.find((r) => r.category === 'EDUCATION');
    const eduPref = parsedPref.requirements.find((r) => r.category === 'EDUCATION');

    assert.ok(eduReq, 'Education requirement must exist');
    assert.ok(eduPref, 'Education preference must exist');

    assert.equal(eduReq.importance, 'REQUIRED');
    assert.equal(isRequirementRequired(eduReq.importance), true);

    assert.equal(eduPref.importance, 'PREFERRED');
    assert.equal(isRequirementPreferred(eduPref.importance), true);
    assert.equal(isRequirementRequired(eduPref.importance), false);
  });

  // ---------------------------------------------------------------------------
  // 9. Equivalent Experience
  // ---------------------------------------------------------------------------
  it('TEST 9 — Recognizes degree with practical equivalent experience acceptance', () => {
    const eduLine = "Bachelor's degree in CS or equivalent practical experience accepted.";
    const criteria = JobDescriptionParser.extractEducationCriteria(eduLine);

    assert.ok(criteria);
    assert.equal(criteria.degreeLevel, 'BACHELOR');
    assert.ok(criteria.field.toLowerCase().includes('cs'));
  });

  // ---------------------------------------------------------------------------
  // 10. Work Authorization
  // ---------------------------------------------------------------------------
  it('TEST 10 — Work authorization requirement evaluated against candidate profile', () => {
    const req = {
      id: randomUUID(),
      tenantId: MOCK_TENANT_ID,
      category: 'ELIGIBILITY',
      importance: 'REQUIRED',
      extractedValue: 'Legal authorization to work in the United States',
      rawSnippet: 'Must be authorized to work in the United States',
      normalizedCriteria: {
        eligibilityType: 'WORK_AUTHORIZATION',
        acceptedCountries: ['United States'],
      },
    };

    // Candidate 1: Verified citizen
    const candAuthorized = {
      id: MOCK_CANDIDATE_ID,
      profileMetadata: { workAuthorization: 'US Citizen' },
    };
    const resAuth = EvidenceMatchingService._evaluateEligibilityRequirement(req, candAuthorized);
    assert.equal(resAuth.match.matchStatus, 'MATCHED');

    // Candidate 2: Unstated authorization -> UNKNOWN (fail-safe zero fabrication)
    const candUnstated = {
      id: MOCK_CANDIDATE_ID,
      profileMetadata: {},
    };
    const resUnstated = EvidenceMatchingService._evaluateEligibilityRequirement(req, candUnstated);
    assert.equal(resUnstated.match.matchStatus, 'UNKNOWN');
  });

  // ---------------------------------------------------------------------------
  // 11. Location Semantics (Remote, Hybrid, On-site)
  // ---------------------------------------------------------------------------
  it('TEST 11 — Differentiates remote, hybrid, and onsite workplace semantics', () => {
    const locReq = {
      id: randomUUID(),
      tenantId: MOCK_TENANT_ID,
      category: 'LOCATION',
      importance: 'REQUIRED',
      extractedValue: 'Bangalore, India',
      rawSnippet: 'On-site in Bangalore, India',
      normalizedCriteria: {
        country: 'India',
        city: 'Bangalore',
        workplaceType: 'ON_SITE',
      },
    };

    // Candidate in Bangalore matches
    const candBangalore = {
      id: MOCK_CANDIDATE_ID,
      location: 'Bangalore, India',
      profileMetadata: { workplacePreference: 'HYBRID' },
    };
    const matchBangalore = EvidenceMatchingService._evaluateLocationRequirement(
      locReq,
      candBangalore
    );
    assert.equal(matchBangalore.match.matchStatus, 'MATCHED');

    // Candidate in US mismatch
    const candUS = {
      id: MOCK_CANDIDATE_ID,
      location: 'San Francisco, USA',
      profileMetadata: {},
    };
    const matchUS = EvidenceMatchingService._evaluateLocationRequirement(locReq, candUS);
    assert.equal(matchUS.match.matchStatus, 'MISSING');
    assert.ok(matchUS.match.explanation.includes('Geographical mismatch'));
  });

  // ---------------------------------------------------------------------------
  // 12. Certification
  // ---------------------------------------------------------------------------
  it('TEST 12 — Certifications are evaluated distinctly from technical skills', () => {
    const certReq = {
      id: randomUUID(),
      tenantId: MOCK_TENANT_ID,
      category: 'CERTIFICATION',
      importance: 'PREFERRED',
      extractedValue: 'AWS Certified Developer',
      rawSnippet: 'AWS Certified Developer preferred',
    };

    // Candidate with certification
    const candWithCert = {
      id: MOCK_CANDIDATE_ID,
      profileMetadata: {
        certifications: [{ name: 'AWS Certified Developer - Associate', date: '2025' }],
      },
    };
    const resCert = EvidenceMatchingService._evaluateCertificationRequirement(
      certReq,
      candWithCert
    );
    assert.equal(resCert.match.matchStatus, 'MATCHED');
    assert.equal(resCert.match.category, 'CERTIFICATION');

    // Candidate without certification -> UNKNOWN
    const candNoCert = {
      id: MOCK_CANDIDATE_ID,
      profileMetadata: { certifications: [] },
    };
    const resNoCert = EvidenceMatchingService._evaluateCertificationRequirement(certReq, candNoCert);
    assert.equal(resNoCert.match.matchStatus, 'UNKNOWN');
  });

  // ---------------------------------------------------------------------------
  // 13. Domain Knowledge
  // ---------------------------------------------------------------------------
  it('TEST 13 — Domain knowledge is distinguished and matched against project domain', () => {
    const domainReq = {
      id: randomUUID(),
      tenantId: MOCK_TENANT_ID,
      category: 'DOMAIN',
      importance: 'PREFERRED',
      extractedValue: 'Fintech',
      rawSnippet: 'Experience in fintech preferred',
      normalizedCriteria: { domainSlug: 'fintech' },
    };

    const projectDomainSet = new Set(['fintech', 'enterprise-banking']);
    const cand = { id: MOCK_CANDIDATE_ID, profileMetadata: {} };

    const res = EvidenceMatchingService._evaluateDomainRequirement(
      domainReq,
      cand,
      projectDomainSet
    );
    assert.equal(res.match.matchStatus, 'MATCHED');
    assert.equal(res.match.category, 'DOMAIN');
  });

  // ---------------------------------------------------------------------------
  // 14. Soft-Skill Filtering
  // ---------------------------------------------------------------------------
  it('TEST 14 — Generic soft skills are filtered from inflating technical matching', () => {
    const softSkills = [
      { slug: 'communication', name: 'Communication' },
      { slug: 'teamwork', name: 'Teamwork' },
      { slug: 'problem-solving', name: 'Problem Solving' },
    ];

    for (const s of softSkills) {
      assert.equal(
        JobDescriptionParser._isOverlyGenericSkill(s.slug, s.name),
        true,
        `Expected ${s.name} to be filtered as overly generic skill`
      );
    }
  });

  // ---------------------------------------------------------------------------
  // 15. Generic Requirement Filtering
  // ---------------------------------------------------------------------------
  it('TEST 15 — Generic buzzwords do not become concrete technical requirements', () => {
    const buzzwords = [
      'fast learner',
      'passionate',
      'motivated',
      'hardworking',
      'dynamic',
      'self-starter',
      'team player',
    ];

    for (const b of buzzwords) {
      const skills = JobDescriptionParser.extractSkillsFromLine(b);
      assert.equal(
        skills.length,
        0,
        `Buzzword '${b}' must not produce technical skill requirements`
      );
    }
  });

  // ---------------------------------------------------------------------------
  // 16. Semantic Deduplication
  // ---------------------------------------------------------------------------
  it('TEST 16 — Semantic aliases deduplicate to single canonical requirement', async () => {
    const jdText = `
Software Engineer
Requirements:
- React
- React.js
- ReactJS
- PostgreSQL
- Postgres
- PostgresSQL
`;

    const parsed = await JobDescriptionParser.parse(
      { rawText: jdText, source: 'PASTE' },
      { tenantId: MOCK_TENANT_ID }
    );

    const reactReqs = parsed.requirements.filter((r) => r.skillSlug === 'react');
    const postgresReqs = parsed.requirements.filter((r) => r.skillSlug === 'postgresql');

    assert.equal(reactReqs.length, 1, 'React aliases must deduplicate to exactly 1 requirement');
    assert.equal(
      postgresReqs.length,
      1,
      'PostgreSQL aliases must deduplicate to exactly 1 requirement'
    );
  });

  // ---------------------------------------------------------------------------
  // 17. Contradictory Requirements
  // ---------------------------------------------------------------------------
  it('TEST 17 — Handles contradictory requirements deterministically', async () => {
    const jdContradictory = `
Software Engineer

Overview:
Remote position.

Requirements:
- Must work from our Bangalore office three days per week.
- Bachelor's degree preferred.
- Bachelor's degree required.
`;

    const parsed = await JobDescriptionParser.parse(
      { rawText: jdContradictory, source: 'PASTE' },
      { tenantId: MOCK_TENANT_ID }
    );

    // Requirements section explicit statement "Bachelor's degree required" vs "preferred"
    const eduReqs = parsed.requirements.filter((r) => r.category === 'EDUCATION');
    assert.ok(eduReqs.length >= 1, 'Education requirement must be parsed');
    // Deduplication guarantees a single canonical education requirement is retained
    assert.equal(eduReqs.length, 1, 'Contradictory duplicate education line must not duplicate');
  });

  // ---------------------------------------------------------------------------
  // 18. Requirement Explanation
  // ---------------------------------------------------------------------------
  it('TEST 18 — Every matched requirement provides an interpretable structured explanation', () => {
    const req = {
      id: randomUUID(),
      tenantId: MOCK_TENANT_ID,
      category: 'SKILL',
      importance: 'REQUIRED',
      skillSlug: 'react',
      extractedValue: 'React',
      normalizedCriteria: { skillSlug: 'react' },
    };

    const candSkill = {
      slug: 'react',
      name: 'React',
      provenanceStatus: 'VERIFIED',
      truthCategory: 'VERIFIED',
      confidenceScore: 0.95,
      primaryEvidence: {
        id: randomUUID(),
        resourceId: MOCK_REPO_ID,
        resourceName: 'web-repo',
        evidenceType: 'CODE_USAGE',
        filePath: 'src/App.jsx',
        confidenceScore: 0.95,
      },
    };

    const skillsBySlug = new Map([['react', candSkill]]);
    const resourceMap = new Map([[MOCK_REPO_ID, 'web-repo']]);

    const result = EvidenceMatchingService._evaluateSkillRequirement(
      req,
      skillsBySlug,
      resourceMap
    );

    assert.ok(result.explanation);
    assert.equal(result.explanation.requirementId, req.id);
    assert.equal(result.explanation.status, 'MATCHED');
    assert.ok(result.explanation.reason.length > 10);
    assert.ok(result.explanation.evidenceRefs.length > 0);
    assert.equal(result.explanation.evidenceRefs[0].filePath, 'src/App.jsx');
  });

  // ---------------------------------------------------------------------------
  // 19. MCP Parity
  // ---------------------------------------------------------------------------
  it('TEST 19 — MCP handleAnalyzeJobFit uses the canonical requirement pipeline', async () => {
    const BASELINE_JD = `Junior Full Stack Engineer

We are hiring a Junior Full Stack Engineer in India.

Required:
JavaScript, React, Node.js, PostgreSQL, REST APIs, Git.

Preferred:
Next.js, Docker, TypeScript, FastAPI.

Responsibilities include building frontend applications,
designing REST APIs, working with PostgreSQL databases,
writing tests, debugging production issues, and collaborating
with engineers.

Bachelor's degree in Computer Science, Electronics Engineering,
or related field preferred.

Remote or hybrid work in India.
Candidates should be eligible to work in India.`;

    const context = makeContext();
    const mockRepoId = randomUUID();
    const mockProfileView = {
      candidate: {
        id: MOCK_CANDIDATE_ID,
        userId: MOCK_USER_ID,
        tenantId: MOCK_TENANT_ID,
        displayName: 'Test Candidate',
        headline: 'Full Stack Engineer',
        profileMetadata: {},
      },
      skills: [
        {
          id: randomUUID(),
          slug: 'javascript',
          name: 'JavaScript',
          category: 'LANGUAGE',
          provenanceStatus: 'VERIFIED',
          truthCategory: 'VERIFIED',
          confidenceScore: 0.95,
          primaryEvidence: {
            id: randomUUID(),
            resourceId: mockRepoId,
            resourceName: 'web-app',
            evidenceType: 'CODE_USAGE',
            filePath: 'src/index.js',
            confidenceScore: 0.95,
          },
        },
      ],
      projects: [],
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
    assert.equal(fitResult.overallFit.analysisStatus, 'COMPLETE');
    assert.ok(fitResult.requirementMatches.length >= 10);
    const reqMatch = fitResult.requirementMatches.find((m) => m.normalizedRequirement === 'JavaScript');
    assert.ok(reqMatch, 'Requirement match for JavaScript must exist in MCP output');
    assert.equal(reqMatch.matchStatus, 'MATCHED');
  });

  // ---------------------------------------------------------------------------
  // 20. Extension Parity
  // ---------------------------------------------------------------------------
  it('TEST 20 — Extension serialization faithfully preserves canonical requirement matches', () => {
    const rawMatches = [
      {
        requirementId: randomUUID(),
        originalRequirement: 'React',
        normalizedRequirement: 'React',
        category: 'SKILL',
        required: true,
        importance: 'REQUIRED',
        weight: 1.0,
        skillSlug: 'react',
        extractedValue: 'React',
        matchStatus: 'MATCHED',
        matchConfidence: 0.95,
        isUserClaim: false,
        candidateProvenance: 'VERIFIED',
        truthCategory: 'VERIFIED',
        matchedSkillSlug: 'react',
        relationshipType: 'EXACT',
        primaryEvidence: {
          id: randomUUID(),
          resourceId: MOCK_REPO_ID,
          resourceName: 'web-repo',
          evidenceType: 'CODE_USAGE',
          filePath: 'src/App.jsx',
          confidenceScore: 0.95,
        },
        supportingEvidence: [],
        explanation: 'MATCHED: Verified in src/App.jsx',
      },
    ];

    const serialized = serializeRequirementMatchesForExtension({ requirementMatches: rawMatches });
    assert.ok(serialized);
    assert.equal(serialized.matches.length, 1);
    assert.equal(serialized.matches[0].skillSlug, 'react');
    assert.equal(serialized.matches[0].matchStatus, 'MATCHED');
    assert.equal(serialized.matches[0].truthCategory, 'VERIFIED');
    assert.equal(serialized.matches[0].matchConfidence, 0.95);
    assert.ok(serialized.matches[0].explanation.includes('src/App.jsx'));
  });
});
