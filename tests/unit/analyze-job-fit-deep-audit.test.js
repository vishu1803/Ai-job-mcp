/**
 * @file Deep Audit Regression Tests for analyze_job_fit
 *
 * Covers all 8 critical issues from the live ChatGPT MCP acceptance audit:
 * 1. Job Identity Verification
 * 2. Requirement Extraction Fidelity (no company prose, no compound slugs)
 * 3. Subjective/Soft Skills Classification
 * 4. Location & Eligibility Semantics
 * 5. Node.js Evidence Trust (no node_modules → VERIFIED)
 * 6. Provenance Preservation
 * 7. Experience Requirement for Freshers
 * 8. Score Traceability & Analysis Status
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Import functions under test
import { handleAnalyzeJobFit } from '../../src/mcp/tools/career-read-tools.js';
import { JobDescriptionParser } from '../../src/domain/career/job-parser.js';
import { EvidenceMatchingService } from '../../src/services/evidence-matching.service.js';
import { SkillTaxonomyEngine } from '../../src/domain/career/skill-taxonomy.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const MOCK_TENANT_ID = randomUUID();
const MOCK_USER_ID = randomUUID();
const MOCK_CANDIDATE_ID = randomUUID();

const VERCEL_JOB_ID = '70ce5b11-0cca-4c6e-8b85-f7b6e8c8321f';
const VERCEL_EXTERNAL_ID = 'gh-vercel-5430088004';

// Full Vercel job description (truncated to key sections)
const VERCEL_JOB_DESCRIPTION = `
About Vercel:

Vercel is the agentic infrastructure company. We free people and agents to ship what's next.

For more than a decade, Vercel has shaped how the web is built. As the team behind Next.js, v0, and AI SDK, we create products that help builders move from idea to production with speed, security, and exceptional developer experience.

Now, software is entering a new era, and the next generation of products will not just be used by people. They will be built, extended, and operated by AI agents. At Vercel, we're building the infrastructure that makes this future possible.

About the Role:

We are seeking a Backend leaning Software Engineer to join our team. You will help build and scale the infrastructure that powers millions of websites and applications worldwide.

What You Will Do:
- Build and maintain backend services using TypeScript and Node.js
- Design and implement RESTful APIs and microservices
- Work with SQL and NoSQL cloud-native databases
- Leverage AWS services including CloudFormation, SCIM, and Terraform
- Collaborate with cross-functional teams to deliver high-quality products
- Participate in code reviews and contribute to engineering best practices
- Troubleshoot production issues and optimize system performance

About You:
- Proficiency in TypeScript, JavaScript, React, and Node.js
- Strong knowledge of security architecture, including LDAP, Active Directory, SAML, SSO, OAuth2, and OpenID Connect
- Experience with XML, SOAP, JSON, and REST
- Understanding of access control models such as RBAC, ABAC, and ReBAC
- Practical experience developing and improving applications written in Node.js
- Excellent problem-solving and communication skills

Compensation:
We offer competitive salary and benefits.
`;

const CANDIDATE_PROFILE = {
  id: MOCK_CANDIDATE_ID,
  userId: MOCK_USER_ID,
  displayName: 'Test Candidate',
  headline: 'Full-Stack & Backend Developer',
  summary: 'Backend engineer specializing in Node.js, TypeScript, and PostgreSQL.',
  canonicalEmail: 'test@example.com',
  location: 'Gorakhpur, India',
  profileMetadata: {
    careerStatus: 'FRESHER',
    currentRole: 'Full-Stack & Backend Developer',
    careerPreferences: {
      targetRoles: ['Backend Engineer', 'Full Stack Engineer'],
      preferredLocations: ['Remote', 'India'],
      remotePreference: 'REMOTE_ONLY',
    },
    userCustom: {
      experience: [
        {
          title: 'Full Stack Developer Intern',
          company: 'FTV Saloon',
          employmentType: 'INTERNSHIP',
          startDate: '2024-06',
          endDate: '2024-09',
          isCurrent: false,
        },
      ],
      education: [
        {
          degree: 'Bachelor of Technology in Electronics Engineering',
          institution: 'Rajkiya Engineering College',
          graduationDate: '2025-07',
        },
      ],
    },
  },
};

const CANDIDATE_SKILLS = [
  { id: randomUUID(), slug: 'typescript', name: 'TypeScript', provenanceStatus: 'VERIFIED', confidenceScore: 0.95, evidenceCount: 15, evidenceItems: [{ id: randomUUID(), skillSlug: 'typescript', evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY', filePath: 'package.json', confidenceScore: 1.0, resourceName: 'Ai-job-mcp' }] },
  { id: randomUUID(), slug: 'javascript', name: 'JavaScript', provenanceStatus: 'VERIFIED', confidenceScore: 0.95, evidenceCount: 20, evidenceItems: [{ id: randomUUID(), skillSlug: 'javascript', evidenceType: 'CODE_IMPORT_USAGE', filePath: 'src/index.js', confidenceScore: 1.0, resourceName: 'Ai-job-mcp' }] },
  { id: randomUUID(), slug: 'node-js', name: 'Node.js', provenanceStatus: 'VERIFIED', confidenceScore: 0.95, evidenceCount: 12, evidenceItems: [{ id: randomUUID(), skillSlug: 'node-js', evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY', filePath: 'package.json', confidenceScore: 1.0, resourceName: 'Ai-job-mcp' }] },
  { id: randomUUID(), slug: 'react', name: 'React', provenanceStatus: 'VERIFIED', confidenceScore: 0.9, evidenceCount: 8, evidenceItems: [{ id: randomUUID(), skillSlug: 'react', evidenceType: 'CODE_IMPORT_USAGE', filePath: 'src/App.tsx', confidenceScore: 1.0, resourceName: 'Ai-job-mcp' }] },
  { id: randomUUID(), slug: 'postgresql', name: 'PostgreSQL', provenanceStatus: 'VERIFIED', confidenceScore: 0.9, evidenceCount: 5, evidenceItems: [{ id: randomUUID(), skillSlug: 'postgresql', evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY', filePath: 'package.json', confidenceScore: 1.0, resourceName: 'Ai-job-mcp' }] },
  { id: randomUUID(), slug: 'next-js', name: 'Next.js', provenanceStatus: 'CORROBORATED', confidenceScore: 0.88, evidenceCount: 10, evidenceItems: [{ id: randomUUID(), skillSlug: 'next-js', evidenceType: 'CODE_IMPORT_USAGE', filePath: 'src/app/page.tsx', confidenceScore: 0.9, resourceName: 'Ai-job-mcp' }] },
  { id: randomUUID(), slug: 'fastapi', name: 'FastAPI', provenanceStatus: 'VERIFIED', confidenceScore: 0.85, evidenceCount: 3, evidenceItems: [{ id: randomUUID(), skillSlug: 'fastapi', evidenceType: 'CODE_IMPORT_USAGE', filePath: 'main.py', confidenceScore: 0.9, resourceName: 'VamTech' }] },
  { id: randomUUID(), slug: 'git', name: 'Git', provenanceStatus: 'VERIFIED', confidenceScore: 0.95, evidenceCount: 25 },
  { id: randomUUID(), slug: 'github', name: 'GitHub', provenanceStatus: 'VERIFIED', confidenceScore: 0.95, evidenceCount: 20 },
  { id: randomUUID(), slug: 'python', name: 'Python', provenanceStatus: 'VERIFIED', confidenceScore: 0.88, evidenceCount: 8 },
  { id: randomUUID(), slug: 'tailwind-css', name: 'Tailwind CSS', provenanceStatus: 'VERIFIED', confidenceScore: 0.85, evidenceCount: 5 },
  { id: randomUUID(), slug: 'aws', name: 'AWS', provenanceStatus: 'INFERRED', confidenceScore: 0.5, evidenceCount: 2, evidenceItems: [{ id: randomUUID(), skillSlug: 'aws', evidenceType: 'README_SPECIFICATION', filePath: 'README.md', confidenceScore: 0.3, resourceName: 'Ai-job-mcp' }] },
  { id: randomUUID(), slug: 'prisma', name: 'Prisma', provenanceStatus: 'VERIFIED', confidenceScore: 0.9, evidenceCount: 6 },
  { id: randomUUID(), slug: 'sql', name: 'SQL', provenanceStatus: 'CORROBORATED', confidenceScore: 0.85, evidenceCount: 4 },
  { id: randomUUID(), slug: 'mongodb', name: 'MongoDB', provenanceStatus: 'CLAIMED', confidenceScore: 0.5, evidenceCount: 0 },
];

const CANDIDATE_PROJECTS = [
  {
    id: randomUUID(),
    name: 'Ai-job-mcp',
    slug: 'ai-job-mcp',
    summary: 'AI-powered job board with MCP integration built with Fastify and PostgreSQL.',
    technologies: ['TypeScript', 'Node.js', 'Fastify', 'PostgreSQL', 'React', 'Next.js'],
    resources: [{ id: randomUUID(), name: 'Ai-job-mcp' }],
    evidence: [
      { id: randomUUID(), skillSlug: 'typescript', evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY', filePath: 'package.json', confidenceScore: 1.0, resourceName: 'Ai-job-mcp' },
      { id: randomUUID(), skillSlug: 'node-js', evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY', filePath: 'package.json', confidenceScore: 1.0, resourceName: 'Ai-job-mcp' },
      { id: randomUUID(), skillSlug: 'fastify', evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY', filePath: 'package.json', confidenceScore: 1.0, resourceName: 'Ai-job-mcp' },
      { id: randomUUID(), skillSlug: 'postgresql', evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY', filePath: 'package.json', confidenceScore: 1.0, resourceName: 'Ai-job-mcp' },
      { id: randomUUID(), skillSlug: 'react', evidenceType: 'CODE_IMPORT_USAGE', filePath: 'src/App.tsx', confidenceScore: 0.9, resourceName: 'Ai-job-mcp' },
    ],
  },
  {
    id: randomUUID(),
    name: 'Ai-powered-code-review-assistant',
    slug: 'ai-powered-code-review-assistant',
    summary: 'Automated PR code reviewer using OpenAI API built with Python and FastAPI.',
    technologies: ['Python', 'FastAPI', 'React', 'Next.js'],
    resources: [{ id: randomUUID(), name: 'Ai-powered-code-review-assistant' }],
    evidence: [
      { id: randomUUID(), skillSlug: 'python', evidenceType: 'CODE_IMPORT_USAGE', filePath: 'main.py', confidenceScore: 0.9, resourceName: 'Ai-powered-code-review-assistant' },
      { id: randomUUID(), skillSlug: 'fastapi', evidenceType: 'CODE_IMPORT_USAGE', filePath: 'main.py', confidenceScore: 0.9, resourceName: 'Ai-powered-code-review-assistant' },
    ],
  },
];

// ─── Mock Builders ───────────────────────────────────────────────────────────

function createMockContext() {
  return { tenantId: MOCK_TENANT_ID, userId: MOCK_USER_ID };
}

function createMockProfileView() {
  return {
    candidate: { ...CANDIDATE_PROFILE },
    skills: CANDIDATE_SKILLS.map((s) => ({ ...s })),
    projects: CANDIDATE_PROJECTS.map((p) => ({ ...p })),
    resources: [],
    identities: [],
  };
}

function createMockCareerProfile() {
  return {
    careerStatus: 'FRESHER',
    seniority: 'ENTRY_LEVEL',
    currentRole: 'Full-Stack & Backend Developer',
    currentEmployment: null,
    tenureMetrics: {
      professionalTenureYears: 0,
      professionalTenureMonths: 0,
      totalExperienceMonths: 4,
      totalExperienceYears: 0,
    },
    topSkills: CANDIDATE_SKILLS.map((s) => ({ ...s })),
    highlightedProjects: CANDIDATE_PROJECTS.map((p) => ({ ...p })),
    jobPreferences: CANDIDATE_PROFILE.profileMetadata.careerPreferences,
    eligibility: {
      workAuthorization: [],
      visaSponsorshipRequired: true,
    },
  };
}

function createMockJob(overrides = {}) {
  return {
    id: VERCEL_JOB_ID,
    externalJobId: VERCEL_EXTERNAL_ID,
    provider: 'GREENHOUSE',
    company: 'Vercel',
    title: 'Software Engineer, Backend',
    location: 'Remote - United States',
    workplaceType: 'REMOTE',
    description: VERCEL_JOB_DESCRIPTION,
    skills: [],
    requirements: [],
    sourceUrl: 'https://boards.greenhouse.io/vercel/jobs/5430088004',
    applicationUrl: 'https://boards.greenhouse.io/vercel/jobs/5430088004',
    ...overrides,
  };
}

async function runAnalyzeJobFit(overrides = {}) {
  const context = createMockContext();
  const mockJob = createMockJob(overrides.jobOverrides);
  const result = await handleAnalyzeJobFit(context, { jobId: mockJob.id, candidateId: MOCK_CANDIDATE_ID }, {
    candidateProfileService: {
      getProfile: async () => createMockProfileView(),
      getCareerProfile: async () => createMockCareerProfile(),
    },
    discoveryService: { findJobById: async () => mockJob },
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ id: MOCK_CANDIDATE_ID }],
          }),
        }),
      }),
    },
  });
  return result;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CRITICAL 1 — Job Identity Verification', () => {
  let result;

  before(async () => {
    result = await runAnalyzeJobFit();
  });

  it('resolves the exact jobId to Vercel Software Engineer Backend', () => {
    assert.strictEqual(result.jobContext.jobId, VERCEL_JOB_ID);
    assert.strictEqual(result.jobContext.company, 'Vercel');
    assert.strictEqual(result.jobContext.extractedTitle, 'Software Engineer, Backend');
  });

  it('preserves external job ID and provider', () => {
    assert.strictEqual(result.jobContext.externalJobId, VERCEL_EXTERNAL_ID);
    assert.strictEqual(result.jobContext.provider, 'GREENHOUSE');
  });

  it('preserves source and application URLs', () => {
    assert.strictEqual(result.jobContext.sourceUrl, 'https://boards.greenhouse.io/vercel/jobs/5430088004');
    assert.strictEqual(result.jobContext.applicationUrl, 'https://boards.greenhouse.io/vercel/jobs/5430088004');
  });

  it('identifies a non-Vercel job differently', async () => {
    const otherResult = await runAnalyzeJobFit({
      jobOverrides: { id: randomUUID(), company: 'Stripe', title: 'Software Engineer', externalJobId: 'gh-stripe-123' },
    });
    assert.notStrictEqual(otherResult.jobContext.company, 'Vercel');
    assert.strictEqual(otherResult.jobContext.externalJobId, 'gh-stripe-123');
  });
});

describe('CRITICAL 2 — Requirement Extraction (No Company Prose, No Compound Slugs)', () => {
  let result;

  before(async () => {
    result = await runAnalyzeJobFit();
  });

  it('extracts a reasonable number of requirements from the Vercel posting', () => {
    assert.ok(result.jobContext.totalRequirementsIdentified >= 20, `Expected at least 20 requirements, got ${result.jobContext.totalRequirementsIdentified}`);
  });

  it('does NOT extract company marketing prose as requirements', () => {
    const marketingPhrases = [
      'agentic infrastructure',
      'free people and agents',
      'shaped how the web is built',
      'next generation of products',
      'competitive salary',
    ];
    for (const phrase of marketingPhrases) {
      const found = result.requirementMatches.some(
        (m) => m.normalizedRequirement?.toLowerCase().includes(phrase.toLowerCase()) ||
               m.originalRequirement?.toLowerCase().includes(phrase.toLowerCase())
      );
      assert.ok(!found, `Company prose "${phrase}" should not appear as a requirement`);
    }
  });

  it('extracts TypeScript as an atomic requirement', () => {
    const tsReq = result.requirementMatches.find(
      (m) => m.normalizedRequirement === 'TypeScript' && m.category === 'SKILL'
    );
    assert.ok(tsReq, 'TypeScript should be an atomic SKILL requirement');
    assert.strictEqual(tsReq.matchStatus, 'MATCHED');
  });

  it('extracts JavaScript as an atomic requirement', () => {
    const jsReq = result.requirementMatches.find(
      (m) => m.normalizedRequirement === 'JavaScript' && m.category === 'SKILL'
    );
    assert.ok(jsReq, 'JavaScript should be an atomic SKILL requirement');
  });

  it('extracts Node.js as an atomic requirement', () => {
    const nodeReq = result.requirementMatches.find(
      (m) => m.normalizedRequirement === 'Node.js' && m.category === 'SKILL'
    );
    assert.ok(nodeReq, 'Node.js should be an atomic SKILL requirement');
  });

  it('extracts React as an atomic requirement', () => {
    const reactReq = result.requirementMatches.find(
      (m) => m.normalizedRequirement === 'React' && m.category === 'SKILL'
    );
    assert.ok(reactReq, 'React should be an atomic SKILL requirement');
  });

  it('extracts SQL as an atomic requirement', () => {
    const sqlReq = result.requirementMatches.find(
      (m) => m.normalizedRequirement === 'SQL' && m.category === 'SKILL'
    );
    assert.ok(sqlReq, 'SQL should be an atomic SKILL requirement');
  });

  it('extracts AWS as an atomic requirement', () => {
    const awsReq = result.requirementMatches.find(
      (m) => m.normalizedRequirement === 'AWS' && m.category === 'SKILL'
    );
    assert.ok(awsReq, 'AWS should be an atomic SKILL requirement');
  });

  it('extracts security/access-control skills individually', () => {
    const securitySkills = ['LDAP', 'Active Directory', 'SAML', 'OAuth 2.0', 'OpenID Connect'];
    for (const skill of securitySkills) {
      const req = result.requirementMatches.find(
        (m) => m.normalizedRequirement === skill && m.category === 'SKILL'
      );
      assert.ok(req, `${skill} should be extracted as a SKILL requirement`);
    }
  });

  it('extracts access control models (RBAC, ABAC, ReBAC)', () => {
    const accessModels = ['Role-Based Access Control', 'ABAC', 'ReBAC'];
    for (const model of accessModels) {
      const req = result.requirementMatches.find(
        (m) => m.normalizedRequirement === model
      );
      assert.ok(req, `${model} should be extracted as a requirement`);
    }
  });

  it('no requirement has a compound slug from company prose', () => {
    const badSlugs = [
      'familiarity-with-access-control-models-such-as-rba',
      'strong-knowledge-of-security-architecture-ldap-act',
      'proficiency-in-typescript-javascript-react-and-nod',
      'experience-with-sql',
      'practical-experience-developing-and-improving-appl',
    ];
    for (const slug of badSlugs) {
      const found = result.requirementMatches.some(
        (m) => m.normalizedRequirement?.toLowerCase().includes(slug) ||
               m.skillSlug?.toLowerCase() === slug
      );
      assert.ok(!found, `Compound pseudo-slug "${slug}" should not appear`);
    }
  });
});

describe('CRITICAL 3 — Subjective/Soft Skills Classification', () => {
  let result;

  before(async () => {
    result = await runAnalyzeJobFit();
  });

  it('does NOT classify Problem Solving as a hard technical SKILL', () => {
    const problemSolving = result.requirementMatches.find(
      (m) => m.normalizedRequirement === 'Problem Solving' || m.normalizedRequirement === 'problem-solving'
    );
    if (problemSolving) {
      assert.notStrictEqual(problemSolving.matchStatus, 'MISSING', 'Problem Solving should not be a MISSING hard skill');
      assert.strictEqual(problemSolving.category !== 'SKILL' || problemSolving.matchStatus === 'UNKNOWN',
        'Problem Solving should be UNKNOWN or non-SKILL category');
    }
  });

  it('does NOT classify Communication as a hard technical SKILL', () => {
    const communication = result.requirementMatches.find(
      (m) => m.normalizedRequirement === 'Communication' || m.normalizedRequirement === 'communication'
    );
    if (communication) {
      assert.notStrictEqual(communication.matchStatus, 'MISSING', 'Communication should not be a MISSING hard skill');
      assert.strictEqual(communication.category !== 'SKILL' || communication.matchStatus === 'UNKNOWN',
        'Communication should be UNKNOWN or non-SKILL category');
    }
  });

  it('subjective skills do NOT inflate the technical skill denominator', () => {
    const subjectiveInSkills = result.requirementMatches.filter(
      (m) => m.category === 'SKILL' && ['problem-solving', 'communication', 'teamwork', 'adaptability'].includes(m.normalizedRequirement?.toLowerCase())
    );
    assert.strictEqual(subjectiveInSkills.length, 0, 'No subjective skills should be classified as hard SKILL');
  });
});

describe('CRITICAL 4 — Node.js Evidence Trust', () => {
  let result;

  before(async () => {
    result = await runAnalyzeJobFit();
  });

  it('Node.js match has candidateSkills populated', () => {
    const nodeReq = result.requirementMatches.find(
      (m) => m.normalizedRequirement === 'Node.js'
    );
    assert.ok(nodeReq, 'Node.js should be a requirement');
    assert.ok(nodeReq.candidateSkills.length > 0, 'Node.js candidateSkills should not be empty');
  });

  it('Node.js primary evidence is NOT from node_modules', () => {
    const nodeReq = result.requirementMatches.find(
      (m) => m.normalizedRequirement === 'Node.js'
    );
    assert.ok(nodeReq, 'Node.js should be a requirement');
    if (nodeReq.primaryEvidence) {
      assert.ok(
        !nodeReq.primaryEvidence.filePath?.includes('node_modules'),
        `Node.js primary evidence should not be from node_modules: ${nodeReq.primaryEvidence.filePath}`
      );
    }
  });

  it('Node.js supporting evidence does not exclusively come from node_modules', () => {
    const nodeReq = result.requirementMatches.find(
      (m) => m.normalizedRequirement === 'Node.js'
    );
    assert.ok(nodeReq, 'Node.js should be a requirement');
    const allEvidence = [nodeReq.primaryEvidence, ...(nodeReq.supportingEvidence || [])].filter(Boolean);
    if (allEvidence.length > 0) {
      const hasNonNodeModulesEvidence = allEvidence.some(
        (ev) => !ev.filePath?.includes('node_modules')
      );
      assert.ok(hasNonNodeModulesEvidence, 'Node.js should have at least one non-node_modules evidence item');
    }
  });
});

describe('CRITICAL 5 — Provenance Preservation', () => {
  let result;

  before(async () => {
    result = await runAnalyzeJobFit();
  });

  it('preserves VERIFIED provenance for TypeScript', () => {
    const tsReq = result.requirementMatches.find(
      (m) => m.normalizedRequirement === 'TypeScript'
    );
    assert.ok(tsReq, 'TypeScript should be a requirement');
    assert.strictEqual(tsReq.candidateProvenance, 'VERIFIED');
  });

  it('preserves CORROBORATED provenance for Next.js', () => {
    const nextReq = result.requirementMatches.find(
      (m) => m.normalizedRequirement === 'Next.js'
    );
    if (nextReq && nextReq.candidateProvenance !== 'NONE') {
      assert.strictEqual(nextReq.candidateProvenance, 'CORROBORATED');
    }
  });

  it('preserves CLAIMED provenance for MongoDB (no evidence)', () => {
    // MongoDB is CLAIMED in candidate skills but should show no high-trust evidence
    const mongoReq = result.requirementMatches.find(
      (m) => m.normalizedRequirement === 'MongoDB'
    );
    if (mongoReq) {
      assert.ok(
        mongoReq.candidateProvenance === 'CLAIMED' || mongoReq.candidateProvenance === 'NONE',
        `MongoDB provenance should be CLAIMED or NONE, got ${mongoReq.candidateProvenance}`
      );
    }
  });

  it('never silently upgrades CORROBORATED to VERIFIED', () => {
    const allMatches = result.requirementMatches.filter(
      (m) => m.candidateProvenance === 'VERIFIED'
    );
    // All VERIFIED should come from actual VERIFIED candidate skills
    for (const match of allMatches) {
      const candidateSkill = CANDIDATE_SKILLS.find(
        (s) => s.slug === match.matchedSkillSlug || s.name === match.candidateSkills?.[0]
      );
      if (candidateSkill) {
        assert.ok(
          candidateSkill.provenanceStatus === 'VERIFIED',
          `Skill ${match.normalizedRequirement} shows VERIFIED in output but candidate skill is ${candidateSkill.provenanceStatus}`
        );
      }
    }
  });
});

describe('CRITICAL 6 — Experience Requirement for Freshers', () => {
  let result;

  before(async () => {
    result = await runAnalyzeJobFit();
  });

  it('extracts the practical Node.js development experience requirement', () => {
    const expReq = result.requirementMatches.find(
      (m) => m.category === 'EXPERIENCE' && m.normalizedRequirement?.includes('Node.js')
    );
    assert.ok(expReq, 'Should have a Node.js EXPERIENCE requirement');
    assert.strictEqual(expReq.category, 'EXPERIENCE');
  });

  it('experience requirement for fresher with 0 professional months is PARTIAL, not MATCHED', () => {
    const expReq = result.requirementMatches.find(
      (m) => m.category === 'EXPERIENCE' && m.normalizedRequirement?.includes('Node.js')
    );
    assert.ok(expReq, 'Should have a Node.js EXPERIENCE requirement');
    assert.strictEqual(expReq.matchStatus, 'PARTIAL', 'Fresher with 0 professional months should get PARTIAL, not MATCHED');
  });

  it('experience explanation mentions internship vs professional tenure distinction', () => {
    const expReq = result.requirementMatches.find(
      (m) => m.category === 'EXPERIENCE' && m.normalizedRequirement?.includes('Node.js')
    );
    assert.ok(expReq, 'Should have a Node.js EXPERIENCE requirement');
    assert.ok(
      expReq.explanation?.includes('internship') || expReq.explanation?.includes('professional tenure') || expReq.explanation?.includes('PARTIAL'),
      `Experience explanation should mention tenure distinction: ${expReq.explanation}`
    );
  });
});

describe('CRITICAL 7 — Location & Eligibility Semantics', () => {
  let result;

  before(async () => {
    result = await runAnalyzeJobFit();
  });

  it('has a LOCATION requirement for Remote - United States', () => {
    const locReq = result.requirementMatches.find(
      (m) => m.category === 'LOCATION'
    );
    assert.ok(locReq, 'Should have a LOCATION requirement');
    assert.strictEqual(locReq.normalizedRequirement, 'Remote - United States');
  });

  it('has an ELIGIBILITY requirement for US work authorization', () => {
    const eligReq = result.requirementMatches.find(
      (m) => m.category === 'ELIGIBILITY'
    );
    assert.ok(eligReq, 'Should have an ELIGIBILITY requirement');
    assert.strictEqual(eligReq.normalizedRequirement, 'United States Work Authorization');
  });

  it('LOCATION and ELIGIBILITY are separate requirements', () => {
    const locReqs = result.requirementMatches.filter((m) => m.category === 'LOCATION');
    const eligReqs = result.requirementMatches.filter((m) => m.category === 'ELIGIBILITY');
    assert.ok(locReqs.length >= 1, 'Should have at least 1 LOCATION requirement');
    assert.ok(eligReqs.length >= 1, 'Should have at least 1 ELIGIBILITY requirement');
    // They should be different requirements
    assert.notStrictEqual(locReqs[0].requirementId, eligReqs[0].requirementId);
  });
});

describe('CRITICAL 8 — Score Traceability & Analysis Status', () => {
  let result;

  before(async () => {
    result = await runAnalyzeJobFit();
  });

  it('analysisStatus is not null', () => {
    assert.ok(result.overallFit.analysisStatus, 'analysisStatus should not be null');
  });

  it('has a valid ATS score', () => {
    assert.ok(typeof result.overallFit.atsScore === 'number', 'atsScore should be a number');
    assert.ok(result.overallFit.atsScore >= 0 && result.overallFit.atsScore <= 100,
      `atsScore should be 0-100, got ${result.overallFit.atsScore}`);
  });

  it('scoreBreakdown has all required components', () => {
    const breakdown = result.overallFit.scoreBreakdown;
    assert.ok(breakdown, 'scoreBreakdown should exist');
    assert.ok(typeof breakdown.requiredSkillsScore === 'number', 'requiredSkillsScore should be a number');
    assert.ok(typeof breakdown.preferredSkillsScore === 'number', 'preferredSkillsScore should be a number');
    assert.ok(typeof breakdown.projectRelevanceScore === 'number', 'projectRelevanceScore should be a number');
    assert.ok(typeof breakdown.experienceFitScore === 'number', 'experienceFitScore should be a number');
    assert.ok(typeof breakdown.educationFitScore === 'number', 'educationFitScore should be a number');
    assert.ok(typeof breakdown.locationFitScore === 'number', 'locationFitScore should be a number');
    assert.ok(typeof breakdown.evidenceConfidenceScore === 'number', 'evidenceConfidenceScore should be a number');
  });

  it('scoreBreakdown has semantic fit objects for experience, education, and location', () => {
    const breakdown = result.overallFit.scoreBreakdown;
    assert.ok(breakdown.experienceFit, 'experienceFit should exist');
    assert.ok(breakdown.experienceFit.status, 'experienceFit.status should exist');
    assert.ok(breakdown.experienceFit.explanation, 'experienceFit.explanation should exist');
    assert.ok(breakdown.educationFit, 'educationFit should exist');
    assert.ok(breakdown.locationFit, 'locationFit should exist');
  });

  it('requirementSummary counts match actual statuses', () => {
    const summary = result.requirementSummary;
    const matches = result.requirementMatches;
    const actualMatched = matches.filter((m) => m.matchStatus === 'MATCHED').length;
    const actualPartial = matches.filter((m) => m.matchStatus === 'PARTIAL').length;
    const actualMissing = matches.filter((m) => m.matchStatus === 'MISSING').length;
    const actualUnknown = matches.filter((m) => m.matchStatus === 'UNKNOWN').length;

    assert.strictEqual(summary.matchedCount, actualMatched, 'matchedCount should match actual');
    assert.strictEqual(summary.partialCount, actualPartial, 'partialCount should match actual');
    assert.strictEqual(summary.missingCount, actualMissing, 'missingCount should match actual');
    assert.strictEqual(summary.unknownCount, actualUnknown, 'unknownCount should match actual');
  });

  it('totalRequirementsIdentified equals actual requirement matches count', () => {
    assert.strictEqual(
      result.jobContext.totalRequirementsIdentified,
      result.requirementMatches.length,
      'totalRequirementsIdentified should equal requirementMatches.length'
    );
  });
});

describe('Parser — Company Prose Detection', () => {
  it('filters Vercel company description as company prose', () => {
    const proseLines = [
      'Vercel is the agentic infrastructure company.',
      'We free people and agents to ship what\'s next.',
      'For more than a decade, Vercel has shaped how the web is built.',
      'Now, software is entering a new era.',
      'They will be built, extended, and operated by agents.',
    ];
    for (const line of proseLines) {
      assert.ok(
        JobDescriptionParser._isCompanyProse(line),
        `"${line}" should be detected as company prose`
      );
    }
  });

  it('does NOT filter actual requirement lines as company prose', () => {
    const requirementLines = [
      'Proficiency in TypeScript, JavaScript, React, and Node.js',
      'Experience with LDAP, Active Directory, SAML, SSO, OAuth2',
      'Strong knowledge of security architecture',
      'Practical experience developing and improving applications written in Node.js',
      '5+ years of experience in backend development',
    ];
    for (const line of requirementLines) {
      assert.ok(
        !JobDescriptionParser._isCompanyProse(line),
        `"${line}" should NOT be detected as company prose`
      );
    }
  });
});

describe('Parser — Generic Skill Filtering', () => {
  it('filters overly generic skills', () => {
    assert.ok(JobDescriptionParser._isOverlyGenericSkill('cloud-native', 'Cloud Native Computing'));
    assert.ok(JobDescriptionParser._isOverlyGenericSkill('database', 'Database Management'));
    assert.ok(JobDescriptionParser._isOverlyGenericSkill('rest-api', 'RESTful API'));
    assert.ok(JobDescriptionParser._isOverlyGenericSkill('problem-solving', 'Problem Solving'));
    assert.ok(JobDescriptionParser._isOverlyGenericSkill('communication', 'Communication'));
  });

  it('does NOT filter concrete technology skills', () => {
    assert.ok(!JobDescriptionParser._isOverlyGenericSkill('typescript', 'TypeScript'));
    assert.ok(!JobDescriptionParser._isOverlyGenericSkill('node-js', 'Node.js'));
    assert.ok(!JobDescriptionParser._isOverlyGenericSkill('react', 'React'));
    assert.ok(!JobDescriptionParser._isOverlyGenericSkill('postgresql', 'PostgreSQL'));
    assert.ok(!JobDescriptionParser._isOverlyGenericSkill('kubernetes', 'Kubernetes'));
    assert.ok(!JobDescriptionParser._isOverlyGenericSkill('terraform', 'Terraform'));
    assert.ok(!JobDescriptionParser._isOverlyGenericSkill('aws', 'AWS'));
  });
});

describe('Subjective Skill Detection — Evidence Matching', () => {
  it('detects subjective skills via normalized taxonomy slug', () => {
    assert.ok(EvidenceMatchingService._isSubjectiveRequirement('problem-solving'));
    assert.ok(EvidenceMatchingService._isSubjectiveRequirement('communication'));
    assert.ok(EvidenceMatchingService._isSubjectiveRequirement('leadership'));
    assert.ok(EvidenceMatchingService._isSubjectiveRequirement('teamwork'));
  });

  it('detects subjective skills via original text', () => {
    assert.ok(EvidenceMatchingService._isSubjectiveRequirement('Problem Solving'));
    assert.ok(EvidenceMatchingService._isSubjectiveRequirement('Communication skills'));
    assert.ok(EvidenceMatchingService._isSubjectiveRequirement('problem solver'));
  });

  it('does NOT flag concrete technical skills as subjective', () => {
    assert.ok(!EvidenceMatchingService._isSubjectiveRequirement('TypeScript'));
    assert.ok(!EvidenceMatchingService._isSubjectiveRequirement('Node.js'));
    assert.ok(!EvidenceMatchingService._isSubjectiveRequirement('PostgreSQL'));
    assert.ok(!EvidenceMatchingService._isSubjectiveRequirement('Kubernetes'));
    assert.ok(!EvidenceMatchingService._isSubjectiveRequirement('React'));
  });
});
