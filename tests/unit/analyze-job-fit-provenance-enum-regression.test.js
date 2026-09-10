/**
 * @file Regression Tests: analyze_job_fit candidateProvenance enum contract
 *
 * Production failure this suite protects against:
 *   Zod `invalid_enum_value` — received: SELF_DECLARED — at
 *   `requirementMatches[5].candidateProvenance` (and [19]) in
 *   AnalyzeJobFitOutputSchema. The producer (EvidenceMatchingService)
 *   deliberately preserves SELF_DECLARED / LEARNING provenance — never
 *   flattened to CLAIMED — per the domain contract (CandidateRequirementMatchSchema
 *   in evidence-matching.schemas.js) and the canonical provenance model
 *   (db provenance_status enum). The MCP output schema excluded those two
 *   canonical states, so any candidate with self-declared or learning skills
 *   503'd the extension analyze route.
 *
 * Contract decision (Option A): SELF_DECLARED and LEARNING are canonical
 * provenance states and were ADDED to AnalyzeJobFitOutputSchema — no
 * normalization at the match boundary, no flattening. Decision grounded in:
 *   - db/schema.js `provenance_status` pgEnum: VERIFIED, CORROBORATED, INFERRED,
 *     CLAIMED, SELF_DECLARED, LEARNING, MISSING (canonical model)
 *   - CandidateRequirementMatchSchema (evidence-matching.schemas.js) — the
 *     domain match schema — already includes SELF_DECLARED + LEARNING
 *   - EvidenceMatchingService CASE B2: "Preserve SELF_DECLARED provenance —
 *     never upgrade"
 *   - list_verified_skills output schema already includes both states
 *   - Existing suites assert SELF_DECLARED is NOT flattened (analyze-job-fit-four-fixes,
 *     skill-catalog-additional-skills, full-acceptance: "Must remain SELF_DECLARED")
 *
 * Covers:
 *  1. analyze_job_fit succeeds when candidate provenance is SELF_DECLARED
 *  2. analyze_job_fit succeeds with all valid existing provenance states
 *  3. SELF_DECLARED represented per the canonical domain contract (not flattened)
 *  4. LEARNING handled per the same contract
 *  5. VERIFIED / CORROBORATED behavior unchanged
 *  6. CLAIMED / USER_PROVIDED behavior unchanged
 *  7. no provenance silently flattened
 *  8. final AnalyzeJobFitOutputSchema validates successfully
 *  9. extension serializeRequirementMatchesForExtension carries SELF_DECLARED
 *     matches so the /analyze-job endpoint returns 200 instead of 503
 * 10. the earlier >500-char requirement regression remains fixed (composite case)
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { pool } from '../../src/db/index.js';
import { handleAnalyzeJobFit } from '../../src/mcp/tools/career-read-tools.js';
import { AnalyzeJobFitOutputSchema } from '../../src/domain/mcp/career-read-tools.schemas.js';
import { serializeRequirementMatchesForExtension } from '../../src/routes/extension.routes.js';
import { EvidenceMatchingService } from '../../src/services/evidence-matching.service.js';

const TENANT_ID = '24d53f53-780e-4431-b065-32180c354175';
const USER_ID = '9dd8e4fb-456b-4104-9cb1-c839a544b721';
const CANDIDATE_ID = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';

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

const REQUIREMENTS_SECTION = [
  'Requirements:',
  OVERSIZED_REQUIREMENT,
  '- Strong proficiency in TypeScript and JavaScript.',
  '- Experience with Docker, Kubernetes, and Terraform.',
  '- 3+ years of experience with Node.js backend services.',
].join('\n');

function createMockContext() {
  return { tenantId: TENANT_ID, user: { id: USER_ID } };
}

function createMockDbClient() {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => [{ id: CANDIDATE_ID }],
        }),
      }),
    }),
  };
}

function makeSkill(slug, name, provenanceStatus, extra = {}) {
  return {
    skillId: randomUUID(),
    slug,
    name,
    category: 'TOOL',
    provenanceStatus,
    truthStatus: provenanceStatus,
    confidenceScore: 0.8,
    evidenceCount: 0,
    evidence: [],
    evidenceItems: [],
    primaryEvidence: null,
    // Mirror canonical candidate_skills read rows: no isUserClaim metadata flag,
    // so SELF_DECLARED flows through the matcher's SELF_DECLARED case exactly
    // as it does in production (the case that 503'd before the schema fix).
    isUserClaim: false,
    ...extra,
  };
}

function createMockProfileView(skillProvenances) {
  return {
    candidate: {
      id: CANDIDATE_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      displayName: 'Test Candidate',
      headline: 'Backend Engineer',
      summary: 'Backend engineer.',
      profileMetadata: {
        userCustom: {
          experience: [
            {
              company: 'TechCorp',
              title: 'Backend Engineer',
              startDate: '2023-01-01',
              endDate: null,
              isCurrent: true,
              bullets: ['Built Node.js microservices.'],
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
    skills: skillProvenances.map(([slug, name, prov]) => makeSkill(slug, name, prov)),
    projects: [],
    resources: [],
    identities: [],
  };
}

function runMatchService(candidateProfile, requirements) {
  return EvidenceMatchingService.matchJobToCandidate(
    { tenantId: TENANT_ID },
    { id: randomUUID(), tenantId: TENANT_ID, requirements },
    candidateProfile
  );
}

describe('analyze_job_fit candidateProvenance enum contract regression', () => {
  after(async () => {
    await pool.end();
  });

  // ---------------------------------------------------------------------------
  // 1. E2E: analyze_job_fit succeeds with a SELF_DECLARED candidate (the 503 case)
  // ---------------------------------------------------------------------------
  describe('1. analyze_job_fit succeeds with SELF_DECLARED provenance', () => {
    const mockProfileService = {
      getProfile: async () =>
        createMockProfileView([
          ['typescript', 'TypeScript', 'VERIFIED'],
          ['docker', 'Docker', 'SELF_DECLARED'],
          ['terraform', 'Terraform', 'LEARNING'],
          ['redis', 'Redis', 'CLAIMED'],
        ]),
    };

    it('returns a valid result (no ZodError) and preserves SELF_DECLARED / LEARNING', async () => {
      const result = await handleAnalyzeJobFit(
        createMockContext(),
        { candidateId: CANDIDATE_ID, jobDescriptionText: REQUIREMENTS_SECTION },
        { db: createMockDbClient(), candidateProfileService: mockProfileService }
      );

      assert.ok(result.overallFit, 'must return analysis, not a Zod 503');
      assert.ok(result.jobContext.totalRequirementsIdentified > 0);
      assert.ok(Array.isArray(result.requirementMatches));
      assert.ok(result.requirementMatches.length > 0);

      const byNormalized = new Map(
        result.requirementMatches.map((m) => [m.normalizedRequirement, m])
      );

      const dockerMatch = byNormalized.get('Docker');
      assert.ok(dockerMatch, 'Docker requirement match must exist');
      assert.strictEqual(dockerMatch.candidateProvenance, 'SELF_DECLARED');
      assert.ok(dockerMatch.matchStatus === 'PARTIAL');

      const terraformMatch = byNormalized.get('Terraform');
      assert.ok(terraformMatch, 'Terraform requirement match must exist');
      assert.strictEqual(terraformMatch.candidateProvenance, 'LEARNING');

      const tsMatch = byNormalized.get('TypeScript');
      assert.ok(tsMatch, 'TypeScript requirement match must exist');
      assert.strictEqual(tsMatch.candidateProvenance, 'VERIFIED');
    });

    it('final output validates against AnalyzeJobFitOutputSchema', async () => {
      const result = await handleAnalyzeJobFit(
        createMockContext(),
        { candidateId: CANDIDATE_ID, jobDescriptionText: REQUIREMENTS_SECTION },
        { db: createMockDbClient(), candidateProfileService: mockProfileService }
      );

      const validated = AnalyzeJobFitOutputSchema.safeParse(result);
      assert.ok(
        validated.success,
        `AnalyzeJobFitOutputSchema must accept producer output: ${JSON.stringify(
          validated.error?.issues?.slice(0, 3)
        )}`
      );
    });
    it('extension serializer carries SELF_DECLARED matches (analyze route 200 path)', async () => {
      const result = await handleAnalyzeJobFit(
        createMockContext(),
        { candidateId: CANDIDATE_ID, jobDescriptionText: REQUIREMENTS_SECTION },
        { db: createMockDbClient(), candidateProfileService: mockProfileService }
      );

      const serialized = serializeRequirementMatchesForExtension(result);
      const all = [
        ...serialized.matches,
        ...serialized.partialMatches,
        ...serialized.missingRequirements,
      ];
      assert.ok(all.length > 0, 'serializer must surface matches for the Requirements tab');

      // The Docker requirement match (SELF_DECLARED) must appear in the partial
      // matches bucket — proving the route would return 200 with real data.
      const docker = serialized.partialMatches.find((m) => m.requirement === 'Docker');
      assert.ok(docker, 'SELF_DECLARED match must surface in extension partialMatches');
      assert.strictEqual(docker.status, 'PARTIAL');
    });
  });

  // ---------------------------------------------------------------------------
  // 2/3/4. Match-service provenance semantics (no flattening)
  // ---------------------------------------------------------------------------
  describe('2/3/4. provenance semantics at the match boundary', () => {
    function req(slug, name) {
      return {
        id: randomUUID(),
        category: 'SKILL',
        importance: 'REQUIRED',
        weight: 1.0,
        skillSlug: slug,
        extractedValue: name,
        originalText: `Required: ${name}`,
        rawSnippet: `Required: ${name}`,
        normalizedCriteria: { skillSlug: slug, skillName: name },
        confidenceScore: 0.9,
      };
    }

    it('SELF_DECLARED stays SELF_DECLARED (PARTIAL, user claim) — never flattened', () => {
      const profile = {
        id: CANDIDATE_ID,
        tenantId: TENANT_ID,
        skills: [makeSkill('docker', 'Docker', 'SELF_DECLARED')],
      };
      const result = runMatchService(profile, [req('docker', 'Docker')]);
      const m = result.requirementMatches[0];
      assert.strictEqual(m.candidateProvenance, 'SELF_DECLARED');
      assert.strictEqual(m.matchStatus, 'PARTIAL');
      assert.strictEqual(m.isUserClaim, true);
      assert.ok(m.explanation.includes('Self-Declared'));
    });

    it('LEARNING stays LEARNING (MISSING for REQUIRED) — never flattened', () => {
      const profile = {
        id: CANDIDATE_ID,
        tenantId: TENANT_ID,
        skills: [makeSkill('kubernetes', 'Kubernetes', 'LEARNING')],
      };
      const result = runMatchService(profile, [req('kubernetes', 'Kubernetes')]);
      const m = result.requirementMatches[0];
      assert.strictEqual(m.candidateProvenance, 'LEARNING');
      assert.strictEqual(m.matchStatus, 'MISSING');
      assert.ok(m.explanation.toLowerCase().includes('learning'));
    });

    it('VERIFIED and CORROBORATED behavior unchanged', () => {
      const profile = {
        id: CANDIDATE_ID,
        tenantId: TENANT_ID,
        skills: [
          makeSkill('typescript', 'TypeScript', 'VERIFIED', {
            confidenceScore: 0.95,
            evidenceCount: 3,
            primaryEvidence: {
              id: randomUUID(),
              resourceId: randomUUID(),
              resourceName: 'repo',
              filePath: 'package.json',
              evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
              confidenceScore: 1.0,
            },
          }),
          makeSkill('react', 'React', 'CORROBORATED', {
            confidenceScore: 0.9,
            evidenceCount: 2,
          }),
        ],
      };
      const result = runMatchService(profile, [req('typescript', 'TypeScript'), req('react', 'React')]);
      const provenances = result.requirementMatches.map((m) => m.candidateProvenance);
      assert.ok(provenances.includes('VERIFIED'));
      assert.ok(provenances.includes('CORROBORATED'));
    });

    it('CLAIMED and USER_PROVIDED behavior unchanged', () => {
      const profile = {
        id: CANDIDATE_ID,
        tenantId: TENANT_ID,
        skills: [makeSkill('redis', 'Redis', 'CLAIMED'), makeSkill('graphql', 'GraphQL', 'USER_PROVIDED')],
      };
      const result = runMatchService(profile, [req('redis', 'Redis'), req('graphql', 'GraphQL')]);
      const provenances = result.requirementMatches.map((m) => m.candidateProvenance);
      assert.ok(
        provenances.every((p) => ['CLAIMED', 'USER_PROVIDED', 'NONE', 'INFERRED'].includes(p)),
        `unexpected provenance values: ${provenances.join(',')}`
      );
      assert.ok(provenances.includes('CLAIMED') || provenances.includes('USER_PROVIDED'));
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Schema-level enum acceptance (all canonical states)
  // ---------------------------------------------------------------------------
  describe('5. AnalyzeJobFitOutputSchema accepts every canonical provenance state', () => {
    // requirementMatches is z.array(...).optional() — unwrap the ZodOptional
    // wrapper to reach the array's element shape across zod builds.
    const requirementMatchesSchema = AnalyzeJobFitOutputSchema.shape.requirementMatches;
    const innerArray = requirementMatchesSchema._def?.innerType ?? requirementMatchesSchema;
    const matchShape = innerArray.element.shape;

    it('requirementMatches[].candidateProvenance enum includes all 8 states', () => {
      const expected = [
        'VERIFIED',
        'CORROBORATED',
        'CLAIMED',
        'NONE',
        'INFERRED',
        'USER_PROVIDED',
        'SELF_DECLARED',
        'LEARNING',
      ];
      for (const value of expected) {
        const res = matchShape.candidateProvenance.safeParse(value);
        assert.ok(res.success, `enum must accept ${value}`);
      }
      const bad = matchShape.candidateProvenance.safeParse('NOT_A_STATE');
      assert.ok(!bad.success, 'enum must reject unknown values');
    });

    it('full-schema validation of a match carrying SELF_DECLARED', () => {
      const validMatch = {
        requirementId: randomUUID(),
        originalRequirement: 'Experience with Docker',
        normalizedRequirement: 'Docker',
        category: 'SKILL',
        required: true,
        matchStatus: 'PARTIAL',
        candidateSkills: ['Docker'],
        candidateProvenance: 'SELF_DECLARED',
        provenanceTrustClass: 'LOW_TRUST',
        matchConfidence: 0.4,
        primaryEvidence: null,
        supportingEvidence: [],
        explanation: 'PARTIAL: Candidate declares Docker (Self-Declared).',
      };
      const matches = AnalyzeJobFitOutputSchema.shape.requirementMatches;
      const res = matches.safeParse([validMatch]);
      assert.ok(res.success, JSON.stringify(res.error?.issues?.slice(0, 3)));
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Composite regression: SELF_DECLARED candidate + >500-char requirement
  // ---------------------------------------------------------------------------
  describe('6. composite: SELF_DECLARED + oversized requirement (>500 chars)', () => {
    it('both regressions hold together — no enum error, no too_big error', async () => {
      const result = await handleAnalyzeJobFit(
        createMockContext(),
        { candidateId: CANDIDATE_ID, jobDescriptionText: REQUIREMENTS_SECTION },
        { db: createMockDbClient(), candidateProfileService: mockProfileServiceForComposite() }
      );

      assert.ok(result.overallFit, 'analyze must succeed (no 503)');
      const maxLen = Math.max(
        ...(result.requirementMatches || []).map((m) => (m.originalRequirement || '').length)
      );
      assert.ok(maxLen <= 500, 'bounded-text contract must still hold');
      assert.ok(
        result.requirementMatches.some((m) => m.candidateProvenance === 'SELF_DECLARED'),
        'SELF_DECLARED provenance must survive end-to-end'
      );
    });
  });
});

function mockProfileServiceForComposite() {
  return {
    getProfile: async () =>
      createMockProfileView([
        ['typescript', 'TypeScript', 'VERIFIED'],
        ['docker', 'Docker', 'SELF_DECLARED'],
      ]),
  };
}
