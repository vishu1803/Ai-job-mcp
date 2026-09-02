/**
 * @file Regression Tests for analyze_job_fit Live Semantic Fixes
 *
 * Verifies:
 * 1. Company/marketing prose is NOT extracted as candidate requirements
 * 2. Evidence items are populated in requirementMatches.supportingEvidence
 * 3. PostgreSQL -> SQL relationship populates candidateSkills correctly
 * 4. node_modules evidence does NOT produce VERIFIED status
 * 5. Provenance is preserved (CORROBORATED stays CORROBORATED)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JobDescriptionParser } from '../../src/domain/career/job-parser.js';
import { EvidenceMatchingService } from '../../src/services/evidence-matching.service.js';

import { randomUUID } from 'node:crypto';

const FIXED_TENANT_ID = '11111111-1111-4111-8111-111111111111';
const FIXED_JOB_ID = '44444444-4444-4444-8444-444444444444';
const FIXED_CANDIDATE_ID = '33333333-3333-4333-8333-333333333333';

describe('analyze_job_fit Live Semantic Fixes Regression', () => {

  // ===========================================================================
  // 1. Company Prose Filtering
  // ===========================================================================
  describe('1. Company prose is NOT extracted as requirements', () => {
    it('skips "Company is the agentic infrastructure company"', () => {
      const isProse = JobDescriptionParser._isCompanyProse(
        'Vercel is the agentic infrastructure company. We free people and agents to ship what\'s next.'
      );
      assert.strictEqual(isProse, true, 'Company description should be detected as prose');
    });

    it('skips "For more than a decade, Company has shaped..."', () => {
      const isProse = JobDescriptionParser._isCompanyProse(
        'For more than a decade, Vercel has shaped how the web is built.'
      );
      assert.strictEqual(isProse, true, 'Company history should be detected as prose');
    });

    it('skips "We are an equal opportunity employer"', () => {
      const isProse = JobDescriptionParser._isCompanyProse(
        'We are an equal opportunity employer and value diversity.'
      );
      assert.strictEqual(isProse, true, 'EEO statement should be detected as prose');
    });

    it('skips "What we offer" compensation sections', () => {
      const isProse = JobDescriptionParser._isCompanyProse(
        'What we offer: competitive salary, health insurance, 401k matching.'
      );
      assert.strictEqual(isProse, true, 'Benefits section should be detected as prose');
    });

    it('does NOT skip actual requirement lines', () => {
      const isProse1 = JobDescriptionParser._isCompanyProse(
        'Proficiency in TypeScript, JavaScript, React, and Node.js'
      );
      assert.strictEqual(isProse1, false, 'Technical requirement should NOT be prose');

      const isProse2 = JobDescriptionParser._isCompanyProse(
        '3+ years of experience building backend systems'
      );
      assert.strictEqual(isProse2, false, 'Experience requirement should NOT be prose');

      const isProse3 = JobDescriptionParser._isCompanyProse(
        'Bachelor\'s degree in Computer Science or equivalent'
      );
      assert.strictEqual(isProse3, false, 'Education requirement should NOT be prose');
    });

    it('extracts real requirements from mixed prose+requirement text', async () => {
      const text = `
About Vercel: Vercel is the agentic infrastructure company.
We free people and agents to ship what's next.

About the Role: We are seeking a Backend leaning Software Engineer.
Leveraging JavaScript/TypeScript, Node.js, SQL and NoSQL cloud-native databases, and AWS.

Requirements:
- 3+ years experience with TypeScript and Node.js
- Strong proficiency in PostgreSQL and database indexing
- Experience with Docker and Kubernetes in production
      `.trim();

      const result = await JobDescriptionParser.parse(
        { rawText: text, title: 'Backend Engineer', company: 'Vercel', source: 'API' },
        { tenantId: FIXED_TENANT_ID }
      );

      const skillReqs = result.requirements.filter(r => r.category === 'SKILL');
      const skillNames = skillReqs.map(r => r.extractedValue.toLowerCase());

      // Should NOT contain "Next.js" from "infrastructure company" or "ship what's next"
      assert.ok(!skillNames.includes('next.js'),
        `Should not extract "Next.js" from company prose. Got: ${JSON.stringify(skillNames)}`);

      // Should NOT contain "JavaScript" from "Vercel has shaped how the web is built"
      // But SHOULD contain it from the actual requirements section
      // The key check: company prose should not generate spurious requirements
      assert.ok(skillNames.length >= 3,
        `Should extract at least 3 skills from requirements section. Got ${skillNames.length}: ${JSON.stringify(skillNames)}`);
    });
  });

  // ===========================================================================
  // 2. Evidence Population in Requirement Matches
  // ===========================================================================
  describe('2. Supporting evidence is populated in requirementMatches', () => {
    it('MATCHED requirement has primaryEvidence or supportingEvidence', () => {
      const context = { tenantId: FIXED_TENANT_ID };
      const jobDescription = {
        id: FIXED_JOB_ID,
        tenantId: FIXED_TENANT_ID,
        title: 'Backend Engineer',
        companyName: 'Test Corp',
        level: 'MID',
        requirements: [
          {
            id: randomUUID(),
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
            skillSlug: 'typescript',
            rawSnippet: 'TypeScript proficiency',
            extractedValue: 'TypeScript',
            normalizedCriteria: { skillSlug: 'typescript', skillName: 'TypeScript' },
            confidenceScore: 0.95,
            sourceSpan: { section: 'REQUIREMENTS', snippet: 'TypeScript proficiency' },
          },
        ],
        skills: [],
        description: 'TypeScript required',
      };

      const candidateProfile = {
        id: FIXED_CANDIDATE_ID,
        tenantId: FIXED_TENANT_ID,
        skills: [
          {
            id: randomUUID(),
            slug: 'typescript',
            name: 'TypeScript',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 0.95,
            evidenceItems: [
              {
                id: randomUUID(),
                evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
                filePath: 'package.json',
                confidenceScore: 1.0,
                resourceId: randomUUID(),
                sourceLocation: { filePath: 'package.json' },
              },
            ],
            primaryEvidence: {
              id: randomUUID(),
              evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
              filePath: 'package.json',
              confidenceScore: 1.0,
              resourceId: randomUUID(),
            },
          },
        ],
        projects: [],
        resources: [],
        profileMetadata: {},
      };

      const result = EvidenceMatchingService.matchJobToCandidate(context, jobDescription, candidateProfile);
      const tsMatch = result.requirementMatches.find(m => m.skillSlug === 'typescript');

      assert.ok(tsMatch, 'Should have TypeScript match');
      assert.strictEqual(tsMatch.matchStatus, 'MATCHED');
      assert.ok(tsMatch.primaryEvidence || tsMatch.supportingEvidence.length > 0,
        'MATCHED requirement must have evidence: ' + JSON.stringify(tsMatch.primaryEvidence));
    });
  });

  // ===========================================================================
  // 3. PostgreSQL -> SQL Relationship
  // ===========================================================================
  describe('3. PostgreSQL satisfies SQL requirement with correct candidateSkills', () => {
    it('SQL requirement matched via PostgreSQL shows candidateSkills: ["PostgreSQL"]', () => {
      const context = { tenantId: FIXED_TENANT_ID };
      const jobDescription = {
        id: FIXED_JOB_ID,
        tenantId: FIXED_TENANT_ID,
        title: 'Backend Engineer',
        companyName: 'Test Corp',
        level: 'MID',
        requirements: [
          {
            id: randomUUID(),
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
            skillSlug: 'sql',
            rawSnippet: 'SQL databases',
            extractedValue: 'SQL',
            normalizedCriteria: { skillSlug: 'sql', skillName: 'SQL' },
            confidenceScore: 0.95,
            sourceSpan: { section: 'REQUIREMENTS', snippet: 'SQL databases' },
          },
        ],
        skills: [],
        description: 'SQL required',
      };

      const candidateProfile = {
        id: FIXED_CANDIDATE_ID,
        tenantId: FIXED_TENANT_ID,
        skills: [
          {
            id: randomUUID(),
            slug: 'postgresql',
            name: 'PostgreSQL',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 0.95,
            evidenceItems: [
              {
                id: randomUUID(),
                evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
                filePath: 'package.json',
                confidenceScore: 1.0,
                resourceId: randomUUID(),
                sourceLocation: { filePath: 'package.json' },
              },
            ],
            primaryEvidence: {
              id: randomUUID(),
              evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
              filePath: 'package.json',
              confidenceScore: 1.0,
              resourceId: randomUUID(),
            },
          },
        ],
        projects: [],
        resources: [],
        profileMetadata: {},
      };

      const result = EvidenceMatchingService.matchJobToCandidate(context, jobDescription, candidateProfile);
      const sqlMatch = result.requirementMatches.find(m => m.skillSlug === 'sql');

      assert.ok(sqlMatch, 'Should have SQL match');
      assert.ok(
        sqlMatch.matchStatus === 'MATCHED' || sqlMatch.matchStatus === 'PARTIAL',
        `SQL should be matched or partial via PostgreSQL, got: ${sqlMatch.matchStatus}`
      );
      assert.ok(
        sqlMatch.candidateSkills && sqlMatch.candidateSkills.length > 0,
        `candidateSkills must include PostgreSQL. Got: ${JSON.stringify(sqlMatch.candidateSkills)}`
      );
      assert.ok(
        sqlMatch.candidateSkills.some(s => s.toLowerCase().includes('postgresql')),
        `candidateSkills should contain PostgreSQL. Got: ${JSON.stringify(sqlMatch.candidateSkills)}`
      );
      assert.ok(
        sqlMatch.explanation.toLowerCase().includes('postgresql'),
        `Explanation should mention PostgreSQL. Got: ${sqlMatch.explanation}`
      );
    });
  });

  // ===========================================================================
  // 4. node_modules Evidence Downgrade
  // ===========================================================================
  describe('4. node_modules evidence does NOT produce VERIFIED status', () => {
    it('_isLowTrustEvidence detects node_modules paths', () => {
      const nodeModulesEv = {
        sourceLocation: { filePath: 'ai-job-board-backend/node_modules/@huggingface/inference/package.json' },
      };
      assert.strictEqual(EvidenceMatchingService._isLowTrustEvidence(nodeModulesEv), true);
    });

    it('_isLowTrustEvidence detects lock files', () => {
      assert.strictEqual(EvidenceMatchingService._isLowTrustEvidence({ sourceLocation: { filePath: 'package-lock.json' } }), true);
      assert.strictEqual(EvidenceMatchingService._isLowTrustEvidence({ sourceLocation: { filePath: 'yarn.lock' } }), true);
      assert.strictEqual(EvidenceMatchingService._isLowTrustEvidence({ sourceLocation: { filePath: 'pnpm-lock.yaml' } }), true);
    });

    it('_isLowTrustEvidence detects generated/dist directories', () => {
      assert.strictEqual(EvidenceMatchingService._isLowTrustEvidence({ sourceLocation: { filePath: '.next/server/page.js' } }), true);
      assert.strictEqual(EvidenceMatchingService._isLowTrustEvidence({ sourceLocation: { filePath: 'dist/bundle.js' } }), true);
    });

    it('_isLowTrustEvidence accepts normal source code', () => {
      assert.strictEqual(
        EvidenceMatchingService._isLowTrustEvidence({ sourceLocation: { filePath: 'src/services/api.ts' } }),
        false
      );
      assert.strictEqual(
        EvidenceMatchingService._isLowTrustEvidence({ sourceLocation: { filePath: 'package.json' } }),
        false
      );
    });

    it('node_modules evidence is deprioritized when high-trust evidence exists', () => {
      const evidenceList = [
        {
          id: randomUUID(),
          evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
          sourceLocation: { filePath: 'node_modules/@types/node/package.json' },
          confidenceScore: 1.0,
          resourceId: randomUUID(),
        },
        {
          id: randomUUID(),
          evidenceType: 'CODE_IMPORT_USAGE',
          sourceLocation: { filePath: 'src/services/api.ts' },
          confidenceScore: 0.95,
          resourceId: randomUUID(),
        },
      ];

      const refs = EvidenceMatchingService._selectEvidenceRefs(evidenceList, new Map());
      assert.ok(refs.length > 0, 'Should have at least one evidence ref');
      const primaryFilePath = refs[0].filePath || '';
      assert.ok(!primaryFilePath.includes('node_modules'),
        `Primary evidence should not be from node_modules when high-trust evidence exists. Got: ${primaryFilePath}`);
    });
  });

  // ===========================================================================
  // 5. Provenance Preservation
  // ===========================================================================
  describe('5. Provenance is preserved correctly', () => {
    it('CORROBORATED skill stays CORROBORATED in match result', () => {
      const context = { tenantId: FIXED_TENANT_ID };
      const jobDescription = {
        id: FIXED_JOB_ID,
        tenantId: FIXED_TENANT_ID,
        title: 'Backend Engineer',
        companyName: 'Test Corp',
        level: 'MID',
        requirements: [
          {
            id: randomUUID(),
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
            skillSlug: 'docker',
            rawSnippet: 'Docker experience',
            extractedValue: 'Docker',
            normalizedCriteria: { skillSlug: 'docker', skillName: 'Docker' },
            confidenceScore: 0.95,
            sourceSpan: { section: 'REQUIREMENTS', snippet: 'Docker experience' },
          },
        ],
        skills: [],
        description: 'Docker required',
      };

      const candidateProfile = {
        id: FIXED_CANDIDATE_ID,
        tenantId: FIXED_TENANT_ID,
        skills: [
          {
            id: randomUUID(),
            slug: 'docker',
            name: 'Docker',
            provenanceStatus: 'CORROBORATED',
            confidenceScore: 0.90,
            evidenceItems: [
              {
                id: randomUUID(),
                evidenceType: 'README_SPECIFICATION',
                filePath: 'README.md',
                confidenceScore: 0.7,
                resourceId: randomUUID(),
                sourceLocation: { filePath: 'README.md' },
              },
            ],
            primaryEvidence: {
              id: randomUUID(),
              evidenceType: 'README_SPECIFICATION',
              filePath: 'README.md',
              confidenceScore: 0.7,
              resourceId: randomUUID(),
            },
          },
        ],
        projects: [],
        resources: [],
        profileMetadata: {},
      };

      const result = EvidenceMatchingService.matchJobToCandidate(context, jobDescription, candidateProfile);
      const dockerMatch = result.requirementMatches.find(m => m.skillSlug === 'docker');

      assert.ok(dockerMatch, 'Should have Docker match');
      assert.strictEqual(
        dockerMatch.candidateProvenance,
        'CORROBORATED',
        `Provenance should be CORROBORATED, not silently converted to VERIFIED. Got: ${dockerMatch.candidateProvenance}`
      );
    });
  });

  // ===========================================================================
  // 6. Section-Aware Vercel Job Description Extraction & Atomic Grounding
  // ===========================================================================
  describe('6. Section-aware extraction on live Vercel Backend Engineer posting', () => {
    const vercelJobPostingText = `
About Vercel:
Vercel is the agentic infrastructure company. We free people and agents to ship what's next.
For more than a decade, Vercel has shaped how the web is built. Now, software is entering a new era, and the next generation of products will not just be used by people. They will be built, extended, and operated by agents.

About the Role:
We are seeking a Backend leaning Software Engineer to build scalable, high-throughput agent infrastructure.
Leveraging JavaScript/TypeScript, Node.js, SQL and NoSQL cloud-native databases, and AWS, you will design resilient distributed systems.

What You'll Do:
- Architect and scale distributed backend APIs and event streams.
- Optimize database schemas and queries across PostgreSQL and DynamoDB.
- Secure cloud infrastructure adhering to strict compliance standards.

Requirements:
- 4+ years of professional backend engineering experience.
- Strong proficiency in TypeScript, JavaScript, and Node.js.
- Hands-on expertise with SQL and NoSQL databases.
- Practical experience with AWS and cloud infrastructure.
- Bachelor's degree in Computer Science or equivalent field.

Benefits:
- Competitive salary and equity.
- 401(k) matching and comprehensive health coverage.

Equal Opportunity Employer:
Vercel is an equal opportunity employer and values diversity at our company.
    `.trim();

    it('does NOT extract company prose, branding, or benefits as requirements', async () => {
      const result = await JobDescriptionParser.parse(
        {
          rawText: vercelJobPostingText,
          title: 'Software Engineer, Backend',
          company: 'Vercel',
          source: 'API',
        },
        { tenantId: FIXED_TENANT_ID }
      );

      const reqValues = result.requirements.map((r) => (r.extractedValue || '').toLowerCase());
      const rawSnippets = result.requirements.map((r) => (r.rawSnippet || '').toLowerCase());

      // 1. Must NOT extract "Vercel" as a skill requirement from "About Vercel:"
      assert.ok(
        !reqValues.includes('vercel'),
        `Should NOT extract "Vercel" as a requirement from company intro. Got: ${JSON.stringify(reqValues)}`
      );

      // 2. Must NOT extract "Next.js" from marketing text ("what's next", "next generation")
      assert.ok(
        !reqValues.includes('next.js'),
        `Should NOT extract "Next.js" from marketing prose. Got: ${JSON.stringify(reqValues)}`
      );

      // 3. Must NOT extract benefits or EEO text as requirements
      assert.ok(
        !rawSnippets.some((s) => s.includes('401(k)') || s.includes('equal opportunity')),
        `Should NOT extract benefits/EEO as requirements`
      );
    });

    it('extracts atomic technical requirements from qualification & responsibility sections', async () => {
      const result = await JobDescriptionParser.parse(
        {
          rawText: vercelJobPostingText,
          title: 'Software Engineer, Backend',
          company: 'Vercel',
          source: 'API',
        },
        { tenantId: FIXED_TENANT_ID }
      );

      const skillReqs = result.requirements.filter((r) => r.category === 'SKILL');
      const skillNames = skillReqs.map((r) => (r.extractedValue || '').toLowerCase());

      // Verify atomic technical skills are extracted independently
      assert.ok(skillNames.includes('typescript'), 'Should extract TypeScript');
      assert.ok(skillNames.includes('javascript'), 'Should extract JavaScript');
      assert.ok(
        skillNames.includes('node.js') || skillNames.includes('node'),
        'Should extract Node.js'
      );
      assert.ok(skillNames.includes('sql'), 'Should extract SQL');
      assert.ok(skillNames.includes('aws'), 'Should extract AWS');

      // Verify experience requirement
      const expReqs = result.requirements.filter((r) => r.category === 'EXPERIENCE');
      assert.ok(expReqs.length >= 1, 'Should extract experience requirement (4+ years)');

      // Verify education requirement
      const eduReqs = result.requirements.filter((r) => r.category === 'EDUCATION');
      assert.ok(eduReqs.length >= 1, 'Should extract education requirement (Bachelor degree)');
    });
  });

  // ===========================================================================
  // 7. MCP analyze_job_fit End-to-End Contract & Consistency
  // ===========================================================================
  describe('7. MCP handleAnalyzeJobFit output consistency & evidence linkage', () => {
    it('guarantees summary count agreement and excludes PARTIAL from keyMissingSkills', async () => {
      const { handleAnalyzeJobFit } = await import('../../src/mcp/tools/career-read-tools.js');

      const mockCandidateProfileService = {
        getProfile: async () => ({
          candidate: {
            id: FIXED_CANDIDATE_ID,
            tenantId: FIXED_TENANT_ID,
            displayName: 'Test Backend Engineer',
            headline: 'Senior Backend Engineer',
            summary: 'Experienced with Node.js, TypeScript, PostgreSQL, and AWS.',
            profileMetadata: {
              skills: [
                {
                  id: randomUUID(),
                  name: 'TypeScript',
                  slug: 'typescript',
                  provenanceStatus: 'VERIFIED',
                  confidenceScore: 0.95,
                  evidenceItems: [
                    {
                      id: randomUUID(),
                      evidenceType: 'CODE_USAGE',
                      filePath: 'src/server.ts',
                      confidenceScore: 0.95,
                      resourceId: randomUUID(),
                      sourceLocation: { filePath: 'src/server.ts' },
                    },
                  ],
                  primaryEvidence: {
                    id: randomUUID(),
                    evidenceType: 'CODE_USAGE',
                    filePath: 'src/server.ts',
                    confidenceScore: 0.95,
                    resourceId: randomUUID(),
                  },
                },
                {
                  id: randomUUID(),
                  name: 'Node.js',
                  slug: 'node-js',
                  provenanceStatus: 'VERIFIED',
                  confidenceScore: 0.95,
                  evidenceItems: [
                    {
                      id: randomUUID(),
                      evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
                      filePath: 'package.json',
                      confidenceScore: 1.0,
                      resourceId: randomUUID(),
                      sourceLocation: { filePath: 'package.json' },
                    },
                  ],
                  primaryEvidence: {
                    id: randomUUID(),
                    evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
                    filePath: 'package.json',
                    confidenceScore: 1.0,
                    resourceId: randomUUID(),
                  },
                },
                {
                  id: randomUUID(),
                  name: 'PostgreSQL',
                  slug: 'postgresql',
                  provenanceStatus: 'VERIFIED',
                  confidenceScore: 0.95,
                  evidenceItems: [
                    {
                      id: randomUUID(),
                      evidenceType: 'CODE_USAGE',
                      filePath: 'src/db/client.ts',
                      confidenceScore: 0.95,
                      resourceId: randomUUID(),
                      sourceLocation: { filePath: 'src/db/client.ts' },
                    },
                  ],
                  primaryEvidence: {
                    id: randomUUID(),
                    evidenceType: 'CODE_USAGE',
                    filePath: 'src/db/client.ts',
                    confidenceScore: 0.95,
                    resourceId: randomUUID(),
                  },
                },
                {
                  id: randomUUID(),
                  name: 'AWS',
                  slug: 'aws',
                  provenanceStatus: 'CLAIMED',
                  confidenceScore: 0.5,
                  evidenceItems: [],
                },
              ],
              experience: [
                {
                  title: 'Backend Engineer',
                  company: 'Acme Corp',
                  startDate: '2020-01-01',
                  endDate: '2025-01-01',
                  isCurrent: true,
                },
              ],
              education: [
                {
                  degree: 'Bachelor of Science in Computer Science',
                  institution: 'State University',
                },
              ],
            },
          },
          skills: [
            {
              id: randomUUID(),
              name: 'TypeScript',
              slug: 'typescript',
              provenanceStatus: 'VERIFIED',
              confidenceScore: 0.95,
              evidenceItems: [
                {
                  id: randomUUID(),
                  evidenceType: 'CODE_USAGE',
                  filePath: 'src/server.ts',
                  confidenceScore: 0.95,
                  resourceId: randomUUID(),
                  sourceLocation: { filePath: 'src/server.ts' },
                },
              ],
              primaryEvidence: {
                id: randomUUID(),
                evidenceType: 'CODE_USAGE',
                filePath: 'src/server.ts',
                confidenceScore: 0.95,
                resourceId: randomUUID(),
              },
            },
            {
              id: randomUUID(),
              name: 'Node.js',
              slug: 'node-js',
              provenanceStatus: 'VERIFIED',
              confidenceScore: 0.95,
              evidenceItems: [
                {
                  id: randomUUID(),
                  evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
                  filePath: 'package.json',
                  confidenceScore: 1.0,
                  resourceId: randomUUID(),
                  sourceLocation: { filePath: 'package.json' },
                },
              ],
              primaryEvidence: {
                id: randomUUID(),
                evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
                filePath: 'package.json',
                confidenceScore: 1.0,
                resourceId: randomUUID(),
              },
            },
            {
              id: randomUUID(),
              name: 'PostgreSQL',
              slug: 'postgresql',
              provenanceStatus: 'VERIFIED',
              confidenceScore: 0.95,
              evidenceItems: [
                {
                  id: randomUUID(),
                  evidenceType: 'CODE_USAGE',
                  filePath: 'src/db/client.ts',
                  confidenceScore: 0.95,
                  resourceId: randomUUID(),
                  sourceLocation: { filePath: 'src/db/client.ts' },
                },
              ],
              primaryEvidence: {
                id: randomUUID(),
                evidenceType: 'CODE_USAGE',
                filePath: 'src/db/client.ts',
                confidenceScore: 0.95,
                resourceId: randomUUID(),
              },
            },
            {
              id: randomUUID(),
              name: 'AWS',
              slug: 'aws',
              provenanceStatus: 'CLAIMED',
              confidenceScore: 0.5,
              evidenceItems: [],
            },
          ],
          projects: [
            {
              id: randomUUID(),
              name: 'High-Throughput API Gateway',
              slug: 'api-gateway',
              description: 'Backend gateway built with Fastify, TypeScript, Node.js, and PostgreSQL.',
              evidence: [
                {
                  id: randomUUID(),
                  skillSlug: 'typescript',
                  skillName: 'TypeScript',
                  evidenceType: 'CODE_USAGE',
                  filePath: 'src/server.ts',
                  confidenceScore: 0.95,
                  sourceLocation: { filePath: 'src/server.ts' },
                },
                {
                  id: randomUUID(),
                  skillSlug: 'postgresql',
                  skillName: 'PostgreSQL',
                  evidenceType: 'CODE_USAGE',
                  filePath: 'src/db/client.ts',
                  confidenceScore: 0.95,
                  sourceLocation: { filePath: 'src/db/client.ts' },
                },
              ],
              resources: [],
            },
          ],
          resources: [],
          identities: [],
        }),
      };

      const jobPostingText = `
About Vercel:
Vercel is the agentic infrastructure company. We free people and agents to ship what's next.

Requirements:
- Proficiency in TypeScript and Node.js
- Experience with SQL and PostgreSQL databases
- Experience with AWS
- 4+ years of backend development experience
      `.trim();

      const context = { tenantId: FIXED_TENANT_ID, userId: 'user-001', role: 'READONLY' };
      const deps = {
        candidateProfileService: mockCandidateProfileService,
        db: {
          select: () => ({
            from: () => ({
              where: () => ({
                limit: async () => [{ id: FIXED_CANDIDATE_ID }],
              }),
            }),
          }),
        },
      };

      const output = await handleAnalyzeJobFit(
        context,
        { jobDescriptionText: jobPostingText, jobTitle: 'Software Engineer, Backend' },
        deps
      );

      // 1. Verify requirement count > 2 (not truncated or missed)
      assert.ok(
        output.jobContext.totalRequirementsIdentified >= 4,
        `Should identify at least 4 real requirements, got ${output.jobContext.totalRequirementsIdentified}`
      );

      // 2. Verify summary counts match requirementMatches exactly
      const matches = output.requirementMatches || [];
      const matchedCount = matches.filter((m) => m.matchStatus === 'MATCHED').length;
      const partialCount = matches.filter((m) => m.matchStatus === 'PARTIAL').length;
      const missingCount = matches.filter((m) => m.matchStatus === 'MISSING').length;

      assert.strictEqual(output.requirementSummary.matchedCount, matchedCount);
      assert.strictEqual(output.requirementSummary.partialCount, partialCount);
      assert.strictEqual(output.requirementSummary.missingCount, missingCount);

      // 3. Verify keyMissingSkills excludes PARTIAL items (such as AWS which is CLAIMED/PARTIAL)
      const partialRequirements = matches
        .filter((m) => m.matchStatus === 'PARTIAL')
        .map((m) => m.normalizedRequirement.toLowerCase());

      for (const missing of output.requirementSummary.keyMissingSkills) {
        assert.ok(
          !partialRequirements.includes(missing.toLowerCase()),
          `PARTIAL requirement "${missing}" must NOT appear in keyMissingSkills`
        );
      }

      // 4. Verify supportingEvidence is NOT empty for MATCHED requirements with evidence
      const tsMatch = matches.find((m) => m.normalizedRequirement.toLowerCase() === 'typescript');
      assert.ok(tsMatch, 'Must have TypeScript match');
      assert.strictEqual(tsMatch.matchStatus, 'MATCHED');
      assert.ok(
        tsMatch.supportingEvidence.length > 0,
        'TypeScript match must have non-empty supportingEvidence'
      );

      // 5. Verify topRelevantProjects has matchedRequirements populated
      assert.ok(output.topRelevantProjects.length > 0, 'Must have at least 1 top relevant project');
      const topProject = output.topRelevantProjects[0];
      assert.ok(
        topProject.relevanceScore > 0,
        'Project relevance score should be > 0'
      );
      assert.ok(
        topProject.matchedRequirements.length > 0,
        `Project matchedRequirements must be populated, got: ${JSON.stringify(topProject.matchedRequirements)}`
      );
    });
  });
});

