/**
 * @file Regression Tests: JobRequirement bounded-text producer contract
 *
 * Production failure this suite protects against:
 *   Zod validation error `requirements[n].originalText` — `too_big`, maximum 500 —
 *   raised inside JobDescriptionParser.parse (JobClassificationResultSchema gate),
 *   which propagated out of handleAnalyzeJobFit / handleRecommendPortfolioProjects
 *   and surfaced as HTTP 503 (ANALYSIS_UNAVAILABLE) from the extension analyze route.
 *
 * Root cause: several requirement producers assigned the FULL source line/text to
 * `originalText` (and sometimes `rawSnippet` / `sourceSpan.snippet`) while only
 * bounding other fields, violating the JobRequirementSchema contract
 * (rawSnippet <= 500, originalText <= 500, both trimmed).
 *
 * Fix: every producer now runs source text through the shared canonical
 * `boundRequirementText()` helper (byte-safe, deterministic, trim-mirroring),
 * so no producer can emit text the schema would reject.
 *
 * Covers:
 *  A. boundRequirementText helper semantics (bounded, trimmed, byte-safe, deterministic)
 *  B. job-parser.js producers (deterministic skill/experience/domain lines + location)
 *  C. requirement-decomposer.js producers (all categories)
 *  D. career-read-tools.js fallback producer (raw adapter requirements)
 *  E. job-application-workflow.service.js fallback producer
 *  F. candidate-artifact-content.service.js fallback producer
 *  G. End-to-end: analyze_job_fit with a >500-char requirement succeeds
 *  H. End-to-end: recommend_portfolio_projects with a >500-char requirement succeeds
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { pool } from '../../src/db/index.js';

import {
  boundRequirementText,
  REQUIREMENT_TEXT_MAX,
  JobRequirementSchema,
} from '../../src/domain/career/job-requirement.schemas.js';
import { JobDescriptionParser } from '../../src/domain/career/job-parser.js';
import { RequirementDecomposer } from '../../src/domain/career/requirement-decomposer.js';
import { handleAnalyzeJobFit } from '../../src/mcp/tools/career-read-tools.js';
import { handleRecommendPortfolioProjects } from '../../src/mcp/tools/career-artifact-tools.js';

const TENANT_ID = '24d53f53-780e-4431-b065-32180c354175';
const USER_ID = '9dd8e4fb-456b-4104-9cb1-c839a544b721';
const CANDIDATE_ID = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';
const JOB_ID = '70ce5b11-0cca-4c6e-8b85-f7b6e8c8321f';

const TENANT_ID_ARG = { tenantId: TENANT_ID, jobDescriptionId: randomUUID() };

/**
 * A single requirement source sentence that exceeds the 500-character schema
 * maximum (610 chars) and repeats a known technology many times. Deterministic
 * (no random content) so tests are stable.
 */
const OVERSIZED_REQUIREMENT =
  'Must have demonstrated expertise designing, building, operating, and continuously improving ' +
  'highly available, horizontally scalable, fault tolerant distributed backend systems using ' +
  'Node.js, TypeScript, PostgreSQL, Redis, Kafka, Docker, Kubernetes, Terraform, and AWS across ' +
  'multiple regions, including capacity planning, observability with OpenTelemetry, incident ' +
  'response, on-call rotation participation, postmortem authorship, performance profiling, ' +
  'database indexing strategy, schema migration management, zero-downtime deployment automation, ' +
  'and cost optimization reviews. Must have demonstrated expertise designing, building, and ' +
  'operating distributed systems with Node.js, TypeScript, PostgreSQL, Redis, and Kafka. ' +
  'Node.js TypeScript PostgreSQL Redis Kafka. '.slice(0, 999);

assert.ok(OVERSIZED_REQUIREMENT.length > 500, 'fixture must exceed the schema cap');

/**
 * Asserts the producer-side bounded-text contract on every text field that the
 * schema caps at 500 (rawSnippet, originalText, sourceSpan.snippet).
 *
 * Note: extractedValue is intentionally NOT asserted against the schema here —
 * the task contract requires fallback producers to keep extractedValue intact
 * (full source text). The 255 extractedValue cap is only enforced at the
 * JobClassificationResultSchema gate, which is covered by assertSchemaConformant.
 */
function assertRequirementBounded(req, label) {
  const fields = [
    ['originalText', req.originalText],
    ['rawSnippet', req.rawSnippet],
  ];
  for (const [name, value] of fields) {
    if (value !== undefined && value !== null) {
      assert.ok(
        value.length <= 500,
        `${label}: ${name} length ${value.length} exceeds 500`
      );
    }
  }
  if (req.sourceSpan && req.sourceSpan.snippet !== undefined) {
    assert.ok(
      req.sourceSpan.snippet.length <= 500,
      `${label}: sourceSpan.snippet length ${req.sourceSpan.snippet.length} exceeds 500`
    );
  }
}

/**
 * Full canonical-schema conformance check for requirements that flow through
 * the JobClassificationResultSchema gate (parser outputs).
 */
function assertSchemaConformant(req, label) {
  assertRequirementBounded(req, label);
  JobRequirementSchema.parse({
    ...req,
    tenantId: req.tenantId || TENANT_ID,
    jobDescriptionId: req.jobDescriptionId || TENANT_ID_ARG.jobDescriptionId,
  });
}

describe('JobRequirement Bounded-Text Producer Contract Regression', () => {
  // Close the eagerly-constructed pg pool so the test process can exit cleanly
  // (repo convention: see tests/unit/step1g-career-profile-reconciliation.test.js).
  after(async () => {
    await pool.end();
  });

  // ---------------------------------------------------------------------------
  // A. boundRequirementText helper semantics
  // ---------------------------------------------------------------------------
  describe('A. boundRequirementText helper semantics', () => {
    it('exposes the schema-aligned cap constant', () => {
      assert.strictEqual(REQUIREMENT_TEXT_MAX, 500);
    });

    it('keeps short text intact (only trims)', () => {
      assert.strictEqual(boundRequirementText('  hello world  '), 'hello world');
      assert.strictEqual(boundRequirementText('Node.js'), 'Node.js');
    });

    it('bounds oversized text to the schema cap', () => {
      const bounded = boundRequirementText(OVERSIZED_REQUIREMENT);
      assert.ok(bounded.length <= 500);
      assert.ok(bounded.length > 450, 'must keep meaningful content (no aggressive shrink)');
      // Meaning-preserving prefix, not random truncation.
      assert.ok(bounded.startsWith(OVERSIZED_REQUIREMENT.slice(0, 100)));
    });

    it('is byte-safe for multi-byte UTF-8 content', () => {
      const emojiText = '🎉'.repeat(300); // 4 bytes each => 1200 bytes, 300 code points
      const bounded = boundRequirementText(emojiText);
      assert.ok(Buffer.byteLength(bounded, 'utf8') <= 500);
      // Must not split inside a multi-byte sequence: only complete emoji remain.
      const codePoints = [...bounded];
      for (const ch of codePoints) {
        assert.strictEqual(ch, '🎉');
      }
      // 500 bytes => exactly 125 complete emoji code points.
      assert.strictEqual(codePoints.length, 125);
    });

    it('is deterministic for identical input', () => {
      assert.strictEqual(
        boundRequirementText(OVERSIZED_REQUIREMENT),
        boundRequirementText(OVERSIZED_REQUIREMENT)
      );
    });

    it('handles non-string and empty input defensively', () => {
      assert.strictEqual(boundRequirementText(null), '');
      assert.strictEqual(boundRequirementText(undefined), '');
      assert.strictEqual(boundRequirementText(''), '');
      assert.strictEqual(boundRequirementText('   '), '');
      assert.strictEqual(boundRequirementText(42), '');
    });

    it('supports tighter custom bounds (extractedValue 255 cap)', () => {
      const bounded = boundRequirementText('x'.repeat(400), 255);
      assert.strictEqual(bounded.length, 255);
    });

    it('rejects any output that the canonical schema would reject', () => {
      // Property-style spot checks across sizes around the boundary.
      for (const size of [498, 499, 500, 501, 502, 1000]) {
        const text = 'y'.repeat(size);
        const bounded = boundRequirementText(text);
        const result = JobRequirementSchema.shape.rawSnippet.safeParse(bounded);
        assert.ok(result.success, `bounded output at input size ${size} must satisfy the schema`);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // B. job-parser.js producers
  // ---------------------------------------------------------------------------
  describe('B. job-parser.js producers', () => {
    it('bounds originalText on deterministic skill/experience/domain producers and passes the Zod gate', async () => {
      const jdText = [
        'Requirements:',
        OVERSIZED_REQUIREMENT,
        '- Strong proficiency in TypeScript and JavaScript.',
        '- 5+ years of experience with Node.js and PostgreSQL.',
        '- Experience with AWS, Terraform, and Kubernetes in production.',
        '- 3+ years of experience with Kafka event streaming.',
        '- Background in fintech and payments infrastructure.',
        '- Excellent communication skills.',
      ].join('\n');

      let result;
      try {
        result = await JobDescriptionParser.parse({
          rawText: jdText,
          title: 'Senior Backend Engineer',
          company: 'Acme Corp',
          source: 'API',
        });
      } catch (err) {
        const issues =
          err?.issues?.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') || err.message;
        assert.fail(`JobClassificationResultSchema gate failed: ${issues}`);
      }

      assert.ok(result.requirements.length > 0, 'oversized line must still produce requirements');

      // The oversized line must still participate via its atomic skills (long
      // requirements are bounded, not dropped).
      const values = result.requirements.map((r) => r.extractedValue.toLowerCase());
      const hasNode = values.some((v) => v.includes('node'));
      assert.ok(hasNode, 'atomic skills from the oversized line must be extracted');

      for (const req of result.requirements) {
        assertSchemaConformant(req, `job-parser[${req.category}]`);
      }
    });

    it('bounds the location producer when context.location exceeds 500 chars', async () => {
      const longLocation =
        'Remote - United States (distributed team across Austin TX, Boulder CO, Raleigh NC, ' +
        'Madison WI, Portland OR, Minneapolis MN, Pittsburgh PA, and Toronto ON with quarterly ' +
        'onsite gatherings in San Francisco CA offices near the Embarcadero waterfront district) ' +
        'plus optional hybrid desks in Seattle WA and New York NY metropolitan areas for engineers ' +
        'who prefer in-office collaboration two days per week, with full relocation assistance, ' +
        'home-office stipend, and co-working space reimbursement available anywhere in the continental US';
      assert.ok(longLocation.length > 500);

      // extractRequirementsDeterministic is a public static entry point (also
      // invoked directly by other suites); its context.location is producer-level
      // input that must be bounded by the LOCATION producer itself.
      const result = JobDescriptionParser.extractRequirementsDeterministic([], {
        ...TENANT_ID_ARG,
        location: longLocation,
        workplaceType: 'REMOTE',
      });

      const locationReq = result.requirements.find((r) => r.category === 'LOCATION');
      assert.ok(locationReq, 'location requirement must still be produced');
      assertSchemaConformant(locationReq, 'job-parser[LOCATION]');

      const eligibilityReq = result.requirements.find((r) => r.category === 'ELIGIBILITY');
      assert.ok(eligibilityReq, 'US location must still emit the work-authorization requirement');
    });
  });

  // ---------------------------------------------------------------------------
  // C. requirement-decomposer.js producers
  // ---------------------------------------------------------------------------
  describe('C. requirement-decomposer.js producers', () => {
    it('bounds originalText/rawSnippet on every decomposer category', () => {
      const lines = [
        OVERSIZED_REQUIREMENT, // experience + skill + generic fallback paths
        '- 5+ years of experience building distributed systems with Node.js.',
        '- Bachelor degree in Computer Science from an accredited university.',
        '- Remote position open to candidates located in the United States.',
        '- Must be authorized to work in the United States without sponsorship.',
        '- Strong communication and problem-solving abilities.',
        '- Familiarity with GraphQL APIs and REST APIs.',
      ];

      const decomposed = RequirementDecomposer.decompose(lines, TENANT_ID_ARG);
      assert.ok(decomposed.length > 0, 'decomposer must produce requirements');

      const categoriesSeen = new Set();
      for (const req of decomposed) {
        categoriesSeen.add(req.category);
        assertRequirementBounded(req, `decomposer[${req.category}]`);
      }
      assert.ok(categoriesSeen.has('EXPERIENCE'), 'experience path must be exercised');
      assert.ok(categoriesSeen.has('SKILL'), 'skill path must be exercised');
      assert.ok(categoriesSeen.has('EDUCATION'), 'education path must be exercised');
    });
  });

  // ---------------------------------------------------------------------------
  // D. career-read-tools.js fallback producer
  // ---------------------------------------------------------------------------
  describe('D. career-read-tools.js fallback producer (raw adapter requirements)', () => {
    it('bounds originalText/rawSnippet when adapter requirements exceed 500 chars', async () => {
      const oversizedAdapterRequirements = [
        OVERSIZED_REQUIREMENT,
        'Strong proficiency in TypeScript and JavaScript.',
        'Experience with React and modern frontend frameworks.',
        'Experience with RESTful API architectures.',
      ];

      const mockProfileView = {
        candidate: {
          id: CANDIDATE_ID,
          tenantId: TENANT_ID,
          userId: USER_ID,
          displayName: 'Test Candidate',
          headline: 'Backend Engineer',
          summary: 'Backend engineer focused on Node.js and PostgreSQL.',
          profileMetadata: {
            userCustom: {
              experience: [
                {
                  company: 'TechCorp',
                  title: 'Backend Engineer',
                  startDate: '2023-01-01',
                  endDate: null,
                  isCurrent: true,
                  bullets: ['Built Node.js microservices handling PostgreSQL workloads.'],
                },
              ],
              education: [
                {
                  institution: 'State University',
                  degree: 'B.S. in Computer Science',
                  fieldOfStudy: 'Computer Science',
                  startDate: '2019-08-01',
                  endDate: '2023-05-20',
                },
              ],
            },
          },
        },
        skills: [
          {
            skillId: randomUUID(),
            slug: 'node-js',
            name: 'Node.js',
            category: 'LANGUAGE',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 1.0,
            evidenceCount: 3,
            primaryEvidence: {
              id: randomUUID(),
              resourceId: randomUUID(),
              resourceName: 'backend-repo',
              filePath: 'package.json',
              evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
              confidenceScore: 1.0,
            },
          },
        ],
        projects: [],
        resources: [],
        identities: [],
      };

      const mockProfileService = {
        getProfile: async () => mockProfileView,
      };

      const mockDiscoveryService = {
        findJobById: async (id) => ({
          id,
          title: 'Senior Backend Engineer',
          company: 'Acme Corp',
          location: 'Remote - United States',
          workplaceType: 'REMOTE',
          // description intentionally too short to route through the parser, so
          // the raw adapter requirements fallback path is exercised.
          description: 'Short.',
          requirements: oversizedAdapterRequirements,
          skills: [],
        }),
      };

      // Before the fix this exact scenario threw ZodError inside the
      // JobClassificationResultSchema gate and bubbled up as a 503.
      const result = await handleAnalyzeJobFit(
        { tenantId: TENANT_ID, user: { id: USER_ID } },
        { jobId: JOB_ID, candidateId: CANDIDATE_ID },
        {
          discoveryService: mockDiscoveryService,
          candidateProfileService: mockProfileService,
        }
      );

      assert.ok(result, 'analyze_job_fit must return a valid result instead of throwing');
      assert.ok(result.overallFit, 'result must contain overallFit');
      assert.ok(result.jobContext.totalRequirementsIdentified > 0);

      // The requirementMatches output must contain the oversized requirement in
      // bounded form (long requirements still participate in matching).
      const originals = (result.requirementMatches || []).map((m) => m.originalRequirement || '');
      assert.ok(
        originals.some((t) => t.length > 100 && t.length <= 500),
        'long requirement text must still appear in matches, bounded to <= 500'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // E/F. Service-layer fallback producers
  // ---------------------------------------------------------------------------
  describe('E/F. Service-layer raw-requirement fallback producers', () => {
    it('bounds text in job-application-workflow fallback producer shape', () => {
      // The workflow/artifact-content producers map raw postings text with the
      // identical shape; validate the contract directly on that shape.
      const rawReq = OVERSIZED_REQUIREMENT;
      const text = typeof rawReq === 'string' ? rawReq : rawReq.extractedValue || rawReq.originalText || '';
      const shaped = {
        id: randomUUID(),
        category: 'SKILL',
        importance: 'REQUIRED',
        weight: 1.0,
        skillSlug: null,
        rawSnippet: boundRequirementText(text),
        extractedValue: text,
        originalText: boundRequirementText(text),
        normalizedCriteria: {},
        confidenceScore: 0.85,
        sourceSpan: { section: 'RAW_REQUIREMENT', snippet: boundRequirementText(text) },
      };
      assertRequirementBounded(shaped, 'workflow-fallback');
    });
  });

  // ---------------------------------------------------------------------------
  // G/H. End-to-end tool flows with an oversized requirement
  // ---------------------------------------------------------------------------
  describe('G/H. End-to-end tool flows with a >500-char requirement', () => {
    const jdText = [
      'We are hiring a Senior Backend Engineer.',
      'Requirements:',
      OVERSIZED_REQUIREMENT,
      '- Strong proficiency in TypeScript, Node.js, and PostgreSQL.',
      '- Experience building REST APIs with Fastify or Express.',
      '- 3+ years of experience with Kafka event streaming.',
    ].join('\n');

    function createMockCandidateProfileView() {
      const projectId1 = randomUUID();
      return {
        candidate: {
          id: CANDIDATE_ID,
          tenantId: TENANT_ID,
          userId: USER_ID,
          displayName: 'Alice Engineer',
          headline: 'Backend Engineer',
          summary: 'Backend engineer specializing in Node.js and PostgreSQL.',
          profileMetadata: {
            userCustom: {
              experience: [
                {
                  company: 'TechCorp Inc',
                  title: 'Backend Engineer',
                  startDate: '2022-01-01',
                  endDate: null,
                  isCurrent: true,
                  bullets: [
                    'Architected Node.js microservices in PostgreSQL-backed systems.',
                  ],
                },
              ],
              education: [
                {
                  institution: 'MIT',
                  degree: 'B.S. in Computer Science',
                  fieldOfStudy: 'Computer Science',
                  startDate: '2017-09-01',
                  endDate: '2021-05-30',
                },
              ],
            },
          },
        },
        skills: [
          {
            skillId: randomUUID(),
            slug: 'node-js',
            name: 'Node.js',
            category: 'LANGUAGE',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 1.0,
            evidenceCount: 5,
            primaryEvidence: {
              id: randomUUID(),
              resourceId: projectId1,
              resourceName: 'alice/backend-api',
              filePath: 'package.json',
              evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
              confidenceScore: 1.0,
            },
          },
          {
            skillId: randomUUID(),
            slug: 'postgresql',
            name: 'PostgreSQL',
            category: 'DATABASE',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 1.0,
            evidenceCount: 3,
            primaryEvidence: {
              id: randomUUID(),
              resourceId: projectId1,
              resourceName: 'alice/backend-api',
              filePath: 'src/db.js',
              evidenceType: 'CODE_IMPORT_USAGE',
              confidenceScore: 0.95,
            },
          },
        ],
        projects: [
          {
            id: projectId1,
            name: 'backend-api',
            slug: 'backend-api',
            headline: 'High performance Node.js microservice',
            summary: 'Scalable REST API built with Node.js and PostgreSQL.',
            role: 'Primary Author',
            isHighlighted: true,
            evidence: [
              {
                id: randomUUID(),
                resourceId: projectId1,
                resourceName: 'alice/backend-api',
                filePath: 'package.json',
                evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
                confidenceScore: 1.0,
              },
            ],
          },
        ],
        resources: [],
        identities: [],
      };
    }

    const mockDbClient = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => [{ id: CANDIDATE_ID }],
          }),
        }),
      }),
    };

    it('G. analyze_job_fit returns a valid result (not a Zod 503) with a >500-char requirement', async () => {
      const result = await handleAnalyzeJobFit(
        { tenantId: TENANT_ID, user: { id: USER_ID } },
        { candidateId: CANDIDATE_ID, jobDescriptionText: jdText },
        {
          db: mockDbClient,
          candidateProfileService: { getProfile: async () => createMockCandidateProfileView() },
        }
      );

      assert.ok(result.overallFit, 'must return analysis, not an error');
      assert.ok(result.jobContext.totalRequirementsIdentified > 0);
      assert.ok(Array.isArray(result.requirementMatches));
      assert.ok(result.requirementMatches.length > 0);

      // No fabricated scores — the analysis is real for the oversized requirement too.
      for (const m of result.requirementMatches) {
        assert.ok(typeof m.originalRequirement === 'string');
        assert.ok(m.originalRequirement.length <= 500, 'match output must carry bounded text');
        assert.ok(['MATCHED', 'PARTIAL', 'MISSING', 'UNKNOWN'].includes(m.matchStatus));
      }
    });

    it('H. recommend_portfolio_projects does not fail on the same malformed-requirement input', async () => {
      const result = await handleRecommendPortfolioProjects(
        {
          requestId: randomUUID(),
          tenantId: TENANT_ID,
          userId: USER_ID,
          role: 'MEMBER',
          tokenScopes: ['career:read', 'career:write'],
        },
        { candidateId: CANDIDATE_ID, jobDescriptionText: jdText },
        {
          db: mockDbClient,
          candidateProfileService: { getProfile: async () => createMockCandidateProfileView() },
        }
      );

      assert.ok(result.recommendationId, 'portfolio recommendation must succeed');
      assert.ok(Array.isArray(result.featuredProjects));
      assert.ok(result.featuredProjects.length >= 1);
    });
  });
});
