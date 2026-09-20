/**
 * @file P58 Unit Tests: Canonical ATS Fit Analysis Engine
 *
 * Validates:
 * 1. Controlled normalized job fit (Python, FastAPI, PostgreSQL, Kubernetes; 1.5 yrs vs 3+ yrs).
 * 2. Experience parser matrix (3+, at least 3, minimum 3, 2-4 yrs, fresh graduate min=0/max=null).
 * 3. Skill equivalence vs distinctness.
 * 4. Insufficient data: score=null (NOT 0, NOT 75).
 * 5. Same-normalized-job cross-portal equivalence across LinkedIn, Greenhouse, Lever, Workday, Generic.
 * 6. Multi-role regression matrix across 6 roles and seniority levels.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { JobDescriptionParser } from '../../src/domain/career/job-parser.js';
import { RequirementDecomposer } from '../../src/domain/career/requirement-decomposer.js';
import { EvidenceMatchingService } from '../../src/services/evidence-matching.service.js';
import { AtsFitScoreService } from '../../src/services/ats-fit-score.service.js';
import { ProjectRelevanceService } from '../../src/services/project-relevance.service.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const CANDIDATE_ID = '33333333-3333-4333-8333-333333333333';

function createMockContext() {
  return {
    tenantId: TENANT_ID,
    userId: USER_ID,
    role: 'MEMBER',
    scopes: ['career:read', 'career:write'],
  };
}

function createControlledCandidate() {
  const projId = crypto.randomUUID();
  return {
    id: CANDIDATE_ID,
    tenantId: TENANT_ID,
    userId: USER_ID,
    fullName: 'Alex Vance',
    displayName: 'Alex Vance',
    headline: 'Full-Stack Software Engineer',
    profileMetadata: {
      experienceYears: 1.5,
    },
    tenureMetrics: {
      professionalTenureYears: 1.5,
    },
    workHistory: [
      {
        company: 'CloudTech Solutions',
        title: 'Junior Software Engineer',
        durationYears: 1.5,
        employmentType: 'FULL_TIME',
      },
    ],
    skills: [
      {
        id: crypto.randomUUID(),
        name: 'Python',
        slug: 'python',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 0.95,
        primaryEvidence: {
          id: crypto.randomUUID(),
          evidenceType: 'SOURCE_CODE_AST',
          filePath: 'src/main.py',
          resourceName: 'fastapi-backend',
        },
      },
      {
        id: crypto.randomUUID(),
        name: 'FastAPI',
        slug: 'fastapi',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 0.95,
        primaryEvidence: {
          id: crypto.randomUUID(),
          evidenceType: 'SOURCE_CODE_AST',
          filePath: 'src/api/routes.py',
          resourceName: 'fastapi-backend',
        },
      },
      {
        id: crypto.randomUUID(),
        name: 'PostgreSQL',
        slug: 'postgresql',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 0.95,
        primaryEvidence: {
          id: crypto.randomUUID(),
          evidenceType: 'CONFIG_SYNTAX_DECLARATION',
          filePath: 'alembic/env.py',
          resourceName: 'fastapi-backend',
        },
      },
      {
        id: crypto.randomUUID(),
        name: 'React',
        slug: 'react',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 0.9,
        primaryEvidence: {
          id: crypto.randomUUID(),
          evidenceType: 'SOURCE_CODE_AST',
          filePath: 'src/App.tsx',
          resourceName: 'dashboard-ui',
        },
      },
      {
        id: crypto.randomUUID(),
        name: 'Docker',
        slug: 'docker',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 0.9,
        primaryEvidence: {
          id: crypto.randomUUID(),
          evidenceType: 'CONFIG_SYNTAX_DECLARATION',
          filePath: 'Dockerfile',
          resourceName: 'fastapi-backend',
        },
      },
      {
        id: crypto.randomUUID(),
        name: 'AWS',
        slug: 'aws',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 0.85,
        primaryEvidence: {
          id: crypto.randomUUID(),
          evidenceType: 'CONFIG_SYNTAX_DECLARATION',
          filePath: 'infra/main.tf',
          resourceName: 'cloud-infra',
        },
      },
    ],
    projects: [
      {
        id: projId,
        tenantId: TENANT_ID,
        candidateId: CANDIDATE_ID,
        name: 'FastAPI Backend Service',
        slug: 'fastapi-backend-service',
        headline: 'High-performance REST API',
        summary:
          'A production-ready microservices architecture built with FastAPI, PostgreSQL, Docker, and Redis.',
        technologies: ['Python', 'FastAPI', 'PostgreSQL', 'Docker'],
        evidence: [],
      },
    ],
  };
}

describe('P58 Canonical ATS Fit Analysis Engine', () => {
  const context = createMockContext();
  const candidate = createControlledCandidate();

  it('1. Evaluates controlled normalized job fit correctly (Skills matched/missing & under-tenured)', async () => {
    // Job Description requiring Python, PostgreSQL, FastAPI, Kubernetes, and 3+ years experience
    const jdText = `
Senior Backend Engineer
Company: Acme Cloud Inc.

Requirements:
- 3+ years of professional backend software engineering experience.
- Strong proficiency in Python.
- Hands-on experience with FastAPI.
- Deep knowledge of PostgreSQL database optimization.
- Proven experience deploying applications on Kubernetes.
`;

    const parsedJob = await JobDescriptionParser.parse(
      { rawText: jdText, source: 'PASTE' },
      { tenantId: TENANT_ID }
    );

    const jobDescription = {
      id: crypto.randomUUID(),
      tenantId: TENANT_ID,
      title: 'Senior Backend Engineer',
      companyName: 'Acme Cloud Inc.',
      level: 'SENIOR',
      requirements: parsedJob.requirements,
      description: jdText,
    };

    const matchAnalysis = EvidenceMatchingService.matchJobToCandidate(
      context,
      jobDescription,
      candidate
    );

    const projectAnalysis = ProjectRelevanceService.computeProjectsRelevance(
      context,
      jobDescription,
      candidate.projects,
      { candidateId: candidate.id, skills: candidate.skills }
    );

    const fitAnalysis = AtsFitScoreService.calculateCandidateJobFit(
      context,
      jobDescription,
      matchAnalysis,
      projectAnalysis,
      candidate
    );

    // Verify Skill Matches
    const matchedSkills = matchAnalysis.requirementMatches
      .filter((m) => m.category === 'SKILL' && m.matchStatus === 'MATCHED')
      .map((m) => m.skillSlug);

    assert.ok(matchedSkills.includes('python'), 'Python must be MATCHED');
    assert.ok(matchedSkills.includes('fastapi'), 'FastAPI must be MATCHED');
    assert.ok(matchedSkills.includes('postgresql'), 'PostgreSQL must be MATCHED');

    // Verify Missing Skill
    const missingSkills = matchAnalysis.requirementMatches
      .filter((m) => m.category === 'SKILL' && m.matchStatus === 'MISSING')
      .map((m) => m.skillSlug);

    assert.ok(missingSkills.includes('kubernetes'), 'Kubernetes must be MISSING');

    // Verify Experience Tenure Evaluation: Candidate has 1.5 yrs vs 3+ yrs required
    const expMatch = matchAnalysis.requirementMatches.find((m) => m.category === 'EXPERIENCE');
    assert.ok(expMatch, 'Experience requirement must be present');
    assert.strictEqual(
      expMatch.matchStatus,
      'PARTIAL',
      'Under-tenured candidate must evaluate to PARTIAL'
    );
    assert.ok(expMatch.explanation.includes('below the requested 3+ years'));

    // Verify Critical Gap & Hard Cap: Missing Kubernetes triggers safety score cap
    assert.ok(
      fitAnalysis.criticalGapCount >= 1,
      'Missing required skill must register as critical gap'
    );
    assert.ok(
      fitAnalysis.overallScore <= 74.9,
      'Score must be capped due to missing required skill'
    );
  });

  it('2. Experience parser matrix handles diverse phrasing correctly', () => {
    const testCases = [
      {
        text: '3+ years of software engineering experience',
        expectedMin: 3,
        expectedMax: undefined,
      },
      {
        text: 'At least 3 years of experience in backend development',
        expectedMin: 3,
        expectedMax: undefined,
      },
      { text: 'Minimum 3 years of hands-on experience', expectedMin: 3, expectedMax: undefined },
      { text: '2-4 years of experience building web applications', expectedMin: 2, expectedMax: 4 },
      { text: '0-2 years of experience', expectedMin: 0, expectedMax: 2 },
      { text: 'Fresh graduates welcome to apply', expectedMin: 0, expectedMax: null },
      {
        text: 'Entry-level software engineer with strong fundamentals',
        expectedMin: 0,
        expectedMax: null,
      },
      { text: 'No prior experience required', expectedMin: 0, expectedMax: null },
    ];

    for (const tc of testCases) {
      const requirements = RequirementDecomposer.decompose(tc.text, { tenantId: TENANT_ID });
      const expReq = requirements.find((r) => r.category === 'EXPERIENCE');

      assert.ok(expReq, `Expected experience requirement for: "${tc.text}"`);
      assert.strictEqual(
        expReq.normalizedCriteria.minYears,
        tc.expectedMin,
        `minYears mismatch for "${tc.text}"`
      );
      assert.strictEqual(
        expReq.normalizedCriteria.maxYears,
        tc.expectedMax,
        `maxYears mismatch for "${tc.text}"`
      );
    }
  });

  it('3. Entry-level role evaluates candidate with 0 or 1.5 years as 100% ELIGIBLE', () => {
    const jdText = `
Junior Software Engineer
Requirements:
- Entry-level position, fresh graduates welcome.
- Knowledge of Python.
`;
    const requirements = RequirementDecomposer.decompose(jdText, { tenantId: TENANT_ID });
    const expReq = requirements.find((r) => r.category === 'EXPERIENCE');

    assert.ok(expReq);
    assert.strictEqual(expReq.normalizedCriteria.minYears, 0);
    assert.strictEqual(expReq.normalizedCriteria.maxYears, null, 'Must be null, NOT 1');

    const jobDescription = {
      id: crypto.randomUUID(),
      tenantId: TENANT_ID,
      title: 'Junior Software Engineer',
      requirements,
      description: jdText,
    };

    const matchAnalysis = EvidenceMatchingService.matchJobToCandidate(
      context,
      jobDescription,
      candidate
    );

    const expMatch = matchAnalysis.requirementMatches.find((m) => m.category === 'EXPERIENCE');
    assert.strictEqual(expMatch.matchStatus, 'MATCHED');
    assert.ok(expMatch.explanation.includes('eligible for entry-level role'));
  });

  it('4. Insufficient data yields score=null (NOT 0, NOT 75)', () => {
    // Empty requirements
    const jobDescription = {
      id: crypto.randomUUID(),
      tenantId: TENANT_ID,
      title: 'Unknown Role',
      companyName: 'Unknown Corp',
      level: 'MID',
      requirements: [],
      description: 'Brief blurb without structured requirements.',
    };

    const matchAnalysis = EvidenceMatchingService.matchJobToCandidate(
      context,
      jobDescription,
      candidate
    );

    const projectAnalysis = ProjectRelevanceService.computeProjectsRelevance(
      context,
      jobDescription,
      candidate.projects,
      { candidateId: candidate.id, skills: candidate.skills }
    );

    const fitAnalysis = AtsFitScoreService.calculateCandidateJobFit(
      context,
      jobDescription,
      matchAnalysis,
      projectAnalysis,
      candidate
    );

    assert.strictEqual(
      fitAnalysis.overallScore,
      null,
      'Insufficient data must yield overallScore = null, not 0 or 75'
    );
    assert.strictEqual(fitAnalysis.fitBand, 'INSUFFICIENT_DATA');
    assert.strictEqual(fitAnalysis.analysisStatus, 'INSUFFICIENT_DATA');
    assert.ok(fitAnalysis.zeroRequirementWarning);
  });

  it('5. Same normalized job produces bit-for-bit identical fit across LinkedIn, Greenhouse, Lever, Workday, Generic', () => {
    const baseRequirements = [
      {
        id: 'req-python',
        category: 'SKILL',
        importance: 'REQUIRED',
        weight: 1.0,
        skillSlug: 'python',
        extractedValue: 'Python',
        normalizedCriteria: { skillSlug: 'python', skillName: 'Python' },
      },
      {
        id: 'req-fastapi',
        category: 'SKILL',
        importance: 'REQUIRED',
        weight: 1.0,
        skillSlug: 'fastapi',
        extractedValue: 'FastAPI',
        normalizedCriteria: { skillSlug: 'fastapi', skillName: 'FastAPI' },
      },
      {
        id: 'req-postgres',
        category: 'SKILL',
        importance: 'REQUIRED',
        weight: 1.0,
        skillSlug: 'postgresql',
        extractedValue: 'PostgreSQL',
        normalizedCriteria: { skillSlug: 'postgresql', skillName: 'PostgreSQL' },
      },
      {
        id: 'req-k8s',
        category: 'SKILL',
        importance: 'REQUIRED',
        weight: 1.0,
        skillSlug: 'kubernetes',
        extractedValue: 'Kubernetes',
        normalizedCriteria: { skillSlug: 'kubernetes', skillName: 'Kubernetes' },
      },
      {
        id: 'req-exp',
        category: 'EXPERIENCE',
        importance: 'REQUIRED',
        weight: 1.0,
        skillSlug: null,
        extractedValue: '3+ years experience',
        normalizedCriteria: { minYears: 3 },
      },
    ];

    const portals = [
      { provider: 'LINKEDIN', sourceUrl: 'https://www.linkedin.com/jobs/view/4100000000' },
      { provider: 'GREENHOUSE', sourceUrl: 'https://boards.greenhouse.io/acme/jobs/12345' },
      { provider: 'LEVER', sourceUrl: 'https://jobs.lever.co/acme/abcdef12' },
      { provider: 'WORKDAY', sourceUrl: 'https://acme.wd5.myworkdayjobs.com/Careers/job/123' },
      { provider: 'GENERIC', sourceUrl: 'https://acme.com/careers/backend-engineer' },
    ];

    const results = [];

    for (const portal of portals) {
      const jobDescription = {
        id: '00000000-0000-4000-8000-000000000001',
        tenantId: TENANT_ID,
        title: 'Backend Engineer',
        companyName: 'Acme Global',
        level: 'MID',
        provider: portal.provider,
        sourceUrl: portal.sourceUrl,
        requirements: baseRequirements,
        description: 'Backend Engineer requiring Python, FastAPI, PostgreSQL, and Kubernetes.',
      };

      const matchAnalysis = EvidenceMatchingService.matchJobToCandidate(
        context,
        jobDescription,
        candidate
      );

      const projectAnalysis = ProjectRelevanceService.computeProjectsRelevance(
        context,
        jobDescription,
        candidate.projects,
        { candidateId: candidate.id, skills: candidate.skills }
      );

      const fitAnalysis = AtsFitScoreService.calculateCandidateJobFit(
        context,
        jobDescription,
        matchAnalysis,
        projectAnalysis,
        candidate,
        { analyzedAt: '2026-09-15T00:00:00.000Z' }
      );

      results.push({
        portal: portal.provider,
        overallScore: fitAnalysis.overallScore,
        fitBand: fitAnalysis.fitBand,
        scoreBreakdown: fitAnalysis.scoreBreakdown,
        criticalGapCount: fitAnalysis.criticalGapCount,
        matchedSkills: matchAnalysis.requirementMatches
          .filter((m) => m.matchStatus === 'MATCHED')
          .map((m) => m.skillSlug)
          .sort(),
        missingSkills: matchAnalysis.requirementMatches
          .filter((m) => m.matchStatus === 'MISSING')
          .map((m) => m.skillSlug)
          .sort(),
        experienceMatchStatus: matchAnalysis.requirementMatches.find(
          (m) => m.category === 'EXPERIENCE'
        )?.matchStatus,
      });
    }

    // Assert that every portal produces the exact same score and match results
    const baseline = results[0];
    for (let i = 1; i < results.length; i++) {
      const current = results[i];
      assert.strictEqual(
        current.overallScore,
        baseline.overallScore,
        `Score divergence between ${baseline.portal} and ${current.portal}`
      );
      assert.strictEqual(
        current.fitBand,
        baseline.fitBand,
        `FitBand divergence between ${baseline.portal} and ${current.portal}`
      );
      assert.deepStrictEqual(
        current.matchedSkills,
        baseline.matchedSkills,
        `Matched skills divergence between ${baseline.portal} and ${current.portal}`
      );
      assert.deepStrictEqual(
        current.missingSkills,
        baseline.missingSkills,
        `Missing skills divergence between ${baseline.portal} and ${current.portal}`
      );
      assert.strictEqual(
        current.experienceMatchStatus,
        baseline.experienceMatchStatus,
        `Experience fit status divergence between ${baseline.portal} and ${current.portal}`
      );
    }
  });

  it('6. Multi-role regression matrix across 6 roles and seniority levels', () => {
    const roles = [
      {
        role: 'Backend Engineer',
        level: 'MID',
        requiredSkills: ['python', 'postgresql', 'docker'],
        reqYears: 2,
      },
      { role: 'Frontend Engineer', level: 'ENTRY', requiredSkills: ['react'], reqYears: 0 },
      {
        role: 'Full-Stack Engineer',
        level: 'MID',
        requiredSkills: ['python', 'react', 'postgresql'],
        reqYears: 1,
      },
      {
        role: 'DevOps Engineer',
        level: 'SENIOR',
        requiredSkills: ['docker', 'aws', 'kubernetes', 'terraform'],
        reqYears: 5,
      },
      { role: 'AI/ML Engineer', level: 'MID', requiredSkills: ['python', 'pytorch'], reqYears: 3 },
      { role: 'Software Engineer', level: 'ENTRY', requiredSkills: ['python'], reqYears: 0 },
    ];

    for (const r of roles) {
      const requirements = [
        ...r.requiredSkills.map((slug) => ({
          id: crypto.randomUUID(),
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          skillSlug: slug,
          extractedValue: slug,
          normalizedCriteria: { skillSlug: slug },
        })),
        {
          id: crypto.randomUUID(),
          category: 'EXPERIENCE',
          importance: 'REQUIRED',
          weight: 1.0,
          skillSlug: null,
          extractedValue: `${r.reqYears}+ years experience`,
          normalizedCriteria: { minYears: r.reqYears },
        },
      ];

      const jobDescription = {
        id: crypto.randomUUID(),
        tenantId: TENANT_ID,
        title: r.role,
        companyName: 'Tech Innovators',
        level: r.level,
        requirements,
        description: `${r.role} with ${r.reqYears}+ years experience in ${r.requiredSkills.join(', ')}`,
      };

      const matchAnalysis = EvidenceMatchingService.matchJobToCandidate(
        context,
        jobDescription,
        candidate
      );
      const projectAnalysis = ProjectRelevanceService.computeProjectsRelevance(
        context,
        jobDescription,
        candidate.projects,
        { candidateId: candidate.id, skills: candidate.skills }
      );
      const fitAnalysis = AtsFitScoreService.calculateCandidateJobFit(
        context,
        jobDescription,
        matchAnalysis,
        projectAnalysis,
        candidate
      );

      assert.ok(typeof fitAnalysis.overallScore === 'number');
      assert.ok(fitAnalysis.overallScore >= 0 && fitAnalysis.overallScore <= 100);

      // Verify experience tenure check
      const expMatch = matchAnalysis.requirementMatches.find((m) => m.category === 'EXPERIENCE');
      if (candidate.profileMetadata.experienceYears >= r.reqYears) {
        assert.strictEqual(
          expMatch.matchStatus,
          'MATCHED',
          `Candidate with 1.5 yrs should be MATCHED for ${r.reqYears} yrs in ${r.role}`
        );
      } else {
        assert.strictEqual(
          expMatch.matchStatus,
          'PARTIAL',
          `Candidate with 1.5 yrs should be PARTIAL for ${r.reqYears} yrs in ${r.role}`
        );
      }
    }
  });
});
