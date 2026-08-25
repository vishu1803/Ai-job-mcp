/**
 * @file Unit Tests for Evidence Matching & Gap Analysis Engine (P5-003)
 *
 * Tests:
 * 1. Exact verified technical skill matching & evidence selection
 * 2. Multi-variation alias normalization
 * 3. Inferred skills & low-confidence evidence handling
 * 4. Manual claims ([Unverified User Claim]) & fact-vs-claim precedence
 * 5. Missing technical skills & gap severity prioritization (CRITICAL, HIGH, MEDIUM, LOW)
 * 6. Directional taxonomy relationship graph evaluations (BUILT_ON, ECOSYSTEM_OF, IMPLEMENTS, PARENT_OF)
 * 7. Non-skill protocols: Experience, Education, Location, Domain, Certifications
 * 8. Subjective & soft-skill qualification routing (UNKNOWN, zero false negatives)
 * 9. Multi-tenant sovereign default-deny (404 isolation)
 * 10. Deterministic execution & stable output sorting
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  EvidenceMatchingService,
  matchJobToCandidate,
} from '../../src/services/evidence-matching.service.js';
import { NotFoundError, ValidationError } from '../../src/errors/index.js';

describe('Evidence Matching & Gap Analysis Service (P5-003)', () => {
  const mockTenantId = randomUUID();
  const mockCandidateId = randomUUID();
  const mockJobId = randomUUID();
  const mockResourceId = randomUUID();

  const baseContext = Object.freeze({
    tenantId: mockTenantId,
    userId: randomUUID(),
  });

  const createBaseCandidate = (overrides = {}) => ({
    id: mockCandidateId,
    tenantId: mockTenantId,
    displayName: 'Ada Lovelace',
    headline: 'Senior Backend Engineer',
    profileMetadata: {},
    skills: [],
    projects: [
      {
        id: randomUUID(),
        tenantId: mockTenantId,
        candidateId: mockCandidateId,
        name: 'Distributed Platform',
        slug: 'distributed-platform',
        resources: [
          {
            id: mockResourceId,
            tenantId: mockTenantId,
            name: 'vishu1803/distributed-platform',
            displayName: 'Distributed Platform',
            provider: 'GITHUB_APP',
            resourceType: 'REPOSITORY',
            externalResourceId: '12345678',
            status: 'ACTIVE',
          },
        ],
      },
    ],
    ...overrides,
  });

  const createBaseJob = (requirements = [], overrides = {}) => ({
    id: mockJobId,
    tenantId: mockTenantId,
    title: 'Senior Systems Engineer',
    requirements,
    ...overrides,
  });

  // ===========================================================================
  // 1. Exact Verified Skill Matches
  // ===========================================================================
  describe('1. Exact Verified Technical Skill Matches', () => {
    it('evaluates verified skill with package manifest evidence as MATCHED', () => {
      const candidate = createBaseCandidate({
        skills: [
          {
            id: randomUUID(),
            tenantId: mockTenantId,
            candidateId: mockCandidateId,
            name: 'PostgreSQL',
            slug: 'postgresql',
            category: 'DATABASE',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 0.95,
            evidence: [
              {
                id: randomUUID(),
                tenantId: mockTenantId,
                candidateId: mockCandidateId,
                resourceId: mockResourceId,
                evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
                sourceProvider: 'GITHUB_APP',
                sourceLocation: {
                  filePath: 'package.json',
                  commitSha: 'a'.repeat(40),
                  lineRange: { start: 10, end: 12 },
                },
                excerpt: '"pg": "^8.11.0"',
                confidenceScore: 0.95,
              },
            ],
          },
        ],
      });

      const job = createBaseJob([
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          skillSlug: 'postgresql',
          rawSnippet: 'Must have deep experience with PostgreSQL databases.',
          extractedValue: 'PostgreSQL',
          sourceSpan: { section: 'Requirements', snippet: 'PostgreSQL' },
        },
      ]);

      const result = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);

      assert.equal(result.summary.totalRequirements, 1);
      assert.equal(result.summary.matchedCount, 1);
      assert.equal(result.summary.missingCount, 0);
      assert.equal(result.summary.criticalGapsCount, 0);

      const match = result.requirementMatches[0];
      assert.equal(match.matchStatus, 'MATCHED');
      assert.equal(match.relationshipType, 'EXACT');
      assert.equal(match.isUserClaim, false);
      assert.ok(match.matchConfidence >= 0.85);
      assert.ok(
        match.explanation.includes(
          'MATCHED: PostgreSQL is verified through PACKAGE_MANIFEST_DEPENDENCY'
        )
      );
      assert.equal(match.primaryEvidence.filePath, 'package.json');
      assert.equal(match.primaryEvidence.resourceName, 'vishu1803/distributed-platform');
    });

    it('normalizes synonym variations ("Postgres" -> postgresql) seamlessly', () => {
      const candidate = createBaseCandidate({
        skills: [
          {
            name: 'PostgreSQL',
            slug: 'postgresql',
            category: 'DATABASE',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 0.92,
            evidence: [
              {
                id: randomUUID(),
                resourceId: mockResourceId,
                evidenceType: 'CODE_IMPORT_USAGE',
                sourceProvider: 'GITHUB_APP',
                sourceLocation: { filePath: 'src/db.js', commitSha: 'b'.repeat(40) },
                excerpt: 'import { Pool } from "pg";',
                confidenceScore: 0.9,
              },
            ],
          },
        ],
      });

      const job = createBaseJob([
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          skillSlug: 'postgres',
          rawSnippet: 'Required: Postgres experience',
          extractedValue: 'Postgres',
          sourceSpan: { section: 'Requirements', snippet: 'Postgres' },
        },
      ]);

      const result = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);
      assert.equal(result.requirementMatches[0].matchStatus, 'MATCHED');
      assert.equal(result.requirementMatches[0].matchedSkillSlug, 'postgresql');
    });
  });

  // ===========================================================================
  // 2. Unverified Claims & Fact vs Claim Separation
  // ===========================================================================
  describe('2. User Claims & Fact vs Claim Separation', () => {
    it('evaluates manual claim without code evidence as PARTIAL, never MATCHED', () => {
      const candidate = createBaseCandidate({
        skills: [
          {
            id: randomUUID(),
            tenantId: mockTenantId,
            candidateId: mockCandidateId,
            name: 'AWS',
            slug: 'aws',
            category: 'CLOUD_DEVOPS',
            provenanceStatus: 'CLAIMED',
            confidenceScore: 0.5,
            evidence: [],
          },
        ],
      });

      const job = createBaseJob([
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          skillSlug: 'aws',
          rawSnippet: 'Required: 3+ years AWS cloud deployment.',
          extractedValue: 'AWS',
          sourceSpan: { section: 'Requirements', snippet: 'AWS' },
        },
      ]);

      const result = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);

      assert.equal(result.summary.matchedCount, 0);
      assert.equal(result.summary.partialCount, 1);
      assert.equal(result.summary.highGapsCount, 1);

      const match = result.requirementMatches[0];
      assert.equal(match.matchStatus, 'PARTIAL');
      assert.equal(match.isUserClaim, true);
      assert.equal(match.claimLabel, '[Unverified User Claim]');
      assert.ok(match.explanation.includes('[Unverified User Claim]'));

      const gap = result.skillGaps[0];
      assert.equal(gap.priority, 'HIGH');
      assert.equal(gap.severity, 'UNVERIFIED_CLAIM');
      assert.equal(gap.status, 'PARTIAL');
    });

    it('evaluates README keyword mention only as PARTIAL, not MATCHED', () => {
      const candidate = createBaseCandidate({
        skills: [
          {
            name: 'Redis',
            slug: 'redis',
            category: 'DATABASE',
            provenanceStatus: 'INFERRED',
            confidenceScore: 0.6,
            evidence: [
              {
                id: randomUUID(),
                resourceId: mockResourceId,
                evidenceType: 'README_SPECIFICATION',
                sourceProvider: 'GITHUB_APP',
                sourceLocation: { filePath: 'README.md', commitSha: 'c'.repeat(40) },
                excerpt: 'This project connects to a Redis cache.',
                confidenceScore: 0.6,
              },
            ],
          },
        ],
      });

      const job = createBaseJob([
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          skillSlug: 'redis',
          rawSnippet: 'Experience with Redis caching',
          extractedValue: 'Redis',
          sourceSpan: { section: 'Requirements', snippet: 'Redis' },
        },
      ]);

      const result = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);
      assert.equal(result.requirementMatches[0].matchStatus, 'PARTIAL');
      assert.ok(result.requirementMatches[0].explanation.includes('README'));
    });
  });

  // ===========================================================================
  // 3. Missing Skills & Gap Severity Prioritization
  // ===========================================================================
  describe('3. Missing Skills & Prioritized Gaps', () => {
    it('creates CRITICAL gap for missing REQUIRED skill', () => {
      const candidate = createBaseCandidate({ skills: [] });
      const job = createBaseJob([
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          skillSlug: 'kubernetes',
          rawSnippet: 'Must have production Kubernetes experience.',
          extractedValue: 'Kubernetes',
          sourceSpan: { section: 'Requirements', snippet: 'Kubernetes' },
        },
      ]);

      const result = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);

      assert.equal(result.summary.missingCount, 1);
      assert.equal(result.summary.criticalGapsCount, 1);

      const gap = result.skillGaps[0];
      assert.equal(gap.priority, 'CRITICAL');
      assert.equal(gap.severity, 'EXPLICITLY_MISSING');
      assert.equal(gap.status, 'MISSING');
      assert.equal(gap.skillSlug, 'kubernetes');
    });

    it('creates HIGH gap for missing PREFERRED skill with weight >= 0.5', () => {
      const candidate = createBaseCandidate({ skills: [] });
      const job = createBaseJob([
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'SKILL',
          importance: 'PREFERRED',
          weight: 0.8,
          skillSlug: 'graphql',
          rawSnippet: 'Preferred: Experience with GraphQL APIs.',
          extractedValue: 'GraphQL',
          sourceSpan: { section: 'Preferred', snippet: 'GraphQL' },
        },
      ]);

      const result = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);
      assert.equal(result.summary.highGapsCount, 1);
      assert.equal(result.skillGaps[0].priority, 'HIGH');
    });

    it('creates LOW gap for missing OPTIONAL skill', () => {
      const candidate = createBaseCandidate({ skills: [] });
      const job = createBaseJob([
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'SKILL',
          importance: 'OPTIONAL',
          weight: 0.2,
          skillSlug: 'terraform',
          rawSnippet: 'Bonus: Terraform familiarity.',
          extractedValue: 'Terraform',
          sourceSpan: { section: 'Bonus', snippet: 'Terraform' },
        },
      ]);

      const result = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);
      assert.equal(result.summary.lowGapsCount, 1);
      assert.equal(result.skillGaps[0].priority, 'LOW');
    });
  });

  // ===========================================================================
  // 4. Directional Taxonomy Relationships
  // ===========================================================================
  describe('4. Directional Taxonomy Relationship Traversals', () => {
    it('evaluates BUILT_ON specialization as MATCHED (Next.js candidate for React requirement)', () => {
      const candidate = createBaseCandidate({
        skills: [
          {
            name: 'Next.js',
            slug: 'next-js',
            category: 'FRAMEWORK',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 0.95,
            evidence: [
              {
                id: randomUUID(),
                resourceId: mockResourceId,
                evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
                sourceProvider: 'GITHUB_APP',
                sourceLocation: { filePath: 'package.json', commitSha: 'd'.repeat(40) },
                excerpt: '"next": "^14.0.0"',
                confidenceScore: 0.95,
              },
            ],
          },
        ],
      });

      const job = createBaseJob([
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          skillSlug: 'react',
          rawSnippet: 'Required: Strong React experience',
          extractedValue: 'React',
          sourceSpan: { section: 'Requirements', snippet: 'React' },
        },
      ]);

      const result = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);

      assert.equal(result.summary.matchedCount, 1);
      const match = result.requirementMatches[0];
      assert.equal(match.matchStatus, 'MATCHED');
      assert.equal(match.relationshipType, 'BUILT_ON');
      assert.equal(match.matchedSkillSlug, 'next-js');
      assert.ok(match.explanation.includes('Next.js'));
    });

    it('evaluates ECOSYSTEM_OF driver as PARTIAL (Drizzle ORM for PostgreSQL requirement)', () => {
      const candidate = createBaseCandidate({
        skills: [
          {
            name: 'Drizzle ORM',
            slug: 'drizzle-orm',
            category: 'TOOL',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 0.9,
            evidence: [
              {
                id: randomUUID(),
                resourceId: mockResourceId,
                evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
                sourceProvider: 'GITHUB_APP',
                sourceLocation: { filePath: 'package.json', commitSha: 'e'.repeat(40) },
                excerpt: '"drizzle-orm": "^0.30.0"',
                confidenceScore: 0.9,
              },
            ],
          },
        ],
      });

      const job = createBaseJob([
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          skillSlug: 'postgresql',
          rawSnippet: 'Required: PostgreSQL database expertise',
          extractedValue: 'PostgreSQL',
          sourceSpan: { section: 'Requirements', snippet: 'PostgreSQL' },
        },
      ]);

      const result = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);

      assert.equal(result.summary.partialCount, 1);
      const match = result.requirementMatches[0];
      assert.equal(match.matchStatus, 'PARTIAL');
      assert.equal(match.relationshipType, 'ECOSYSTEM_OF');
      assert.equal(match.matchedSkillSlug, 'drizzle-orm');
    });

    it('evaluates IMPLEMENTS sibling paradigm as PARTIAL (MySQL for PostgreSQL requirement)', () => {
      const candidate = createBaseCandidate({
        skills: [
          {
            name: 'MySQL',
            slug: 'mysql',
            category: 'DATABASE',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 0.9,
            evidence: [
              {
                id: randomUUID(),
                resourceId: mockResourceId,
                evidenceType: 'CODE_IMPORT_USAGE',
                sourceProvider: 'GITHUB_APP',
                sourceLocation: { filePath: 'src/db.js', commitSha: 'f'.repeat(40) },
                excerpt: 'import mysql from "mysql2";',
                confidenceScore: 0.9,
              },
            ],
          },
        ],
      });

      const job = createBaseJob([
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          skillSlug: 'postgresql',
          rawSnippet: 'Required: Relational DB (PostgreSQL)',
          extractedValue: 'PostgreSQL',
          sourceSpan: { section: 'Requirements', snippet: 'PostgreSQL' },
        },
      ]);

      const result = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);

      assert.equal(result.summary.partialCount, 1);
      const match = result.requirementMatches[0];
      assert.equal(match.matchStatus, 'PARTIAL');
      assert.equal(match.relationshipType, 'IMPLEMENTS');
    });

    it('evaluates DIRECT IMPLEMENTS as MATCHED (Fastify candidate for REST API requirement)', () => {
      const candidate = createBaseCandidate({
        skills: [
          {
            name: 'Fastify',
            slug: 'fastify',
            category: 'FRAMEWORK',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 1.0,
            evidence: [
              {
                id: randomUUID(),
                resourceId: mockResourceId,
                evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
                sourceProvider: 'GITHUB_APP',
                sourceLocation: { filePath: 'package.json', commitSha: 'a'.repeat(40) },
                excerpt: '"fastify": "^5.2.1"',
                confidenceScore: 1.0,
              },
            ],
          },
        ],
      });

      const job = createBaseJob([
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          skillSlug: 'rest-api',
          rawSnippet: 'Required: Designing and developing REST APIs',
          extractedValue: 'REST API',
          sourceSpan: { section: 'Requirements', snippet: 'REST API' },
        },
      ]);

      const result = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);

      assert.equal(result.summary.matchedCount, 1);
      assert.equal(result.summary.missingCount, 0);
      const match = result.requirementMatches[0];
      assert.equal(match.matchStatus, 'MATCHED');
      assert.equal(match.relationshipType, 'IMPLEMENTS');
      assert.equal(match.matchedSkillSlug, 'fastify');
      assert.ok(match.explanation.includes('Fastify'));
      assert.ok(match.explanation.includes('REST'));
    });

    it('evaluates DIRECT IMPLEMENTS as MATCHED (MCP candidate for json-rpc requirement)', () => {
      const candidate = createBaseCandidate({
        skills: [
          {
            name: 'Model Context Protocol',
            slug: 'mcp',
            category: 'TOOL',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 1.0,
            evidence: [
              {
                id: randomUUID(),
                resourceId: mockResourceId,
                evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
                sourceProvider: 'GITHUB_APP',
                sourceLocation: { filePath: 'package.json', commitSha: 'b'.repeat(40) },
                excerpt: '"@modelcontextprotocol/server": "^0.6.0"',
                confidenceScore: 1.0,
              },
            ],
          },
        ],
      });

      const job = createBaseJob([
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          skillSlug: 'json-rpc',
          rawSnippet: 'Required: JSON-RPC communication protocols',
          extractedValue: 'JSON-RPC',
          sourceSpan: { section: 'Requirements', snippet: 'JSON-RPC' },
        },
      ]);

      const result = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);

      assert.equal(result.summary.matchedCount, 1);
      assert.equal(result.summary.missingCount, 0);
      const match = result.requirementMatches[0];
      assert.equal(match.matchStatus, 'MATCHED');
      assert.equal(match.relationshipType, 'IMPLEMENTS');
      assert.equal(match.matchedSkillSlug, 'mcp');
    });

    it('evaluates taxonomy specialization as MATCHED (PostgreSQL candidate for relational-database requirement)', () => {
      const candidate = createBaseCandidate({
        skills: [
          {
            name: 'PostgreSQL',
            slug: 'postgresql',
            category: 'DATABASE',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 1.0,
            evidence: [
              {
                id: randomUUID(),
                resourceId: mockResourceId,
                evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
                sourceProvider: 'GITHUB_APP',
                sourceLocation: { filePath: 'package.json', commitSha: 'b'.repeat(40) },
                excerpt: '"pg": "^8.13.3"',
                confidenceScore: 1.0,
              },
            ],
          },
        ],
      });

      const job = createBaseJob([
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          skillSlug: 'relational-database',
          rawSnippet: 'Required: Hands-on experience with Relational Databases',
          extractedValue: 'Relational Database',
          sourceSpan: { section: 'Requirements', snippet: 'Relational Database' },
        },
      ]);

      const result = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);

      assert.equal(result.summary.matchedCount, 1);
      assert.equal(result.summary.missingCount, 0);
      const match = result.requirementMatches[0];
      assert.equal(match.matchStatus, 'MATCHED');
      assert.equal(match.matchedSkillSlug, 'postgresql');
    });

    it('enforces negative relationship boundaries (prettier does not match rest-api, fastify does not match graphql/grpc)', () => {
      const candidate = createBaseCandidate({
        skills: [
          {
            name: 'Prettier',
            slug: 'prettier',
            category: 'TOOL',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 1.0,
            evidence: [
              {
                id: randomUUID(),
                resourceId: mockResourceId,
                evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
                sourceProvider: 'GITHUB_APP',
                sourceLocation: { filePath: 'package.json', commitSha: 'c'.repeat(40) },
                excerpt: '"prettier": "^3.0.0"',
                confidenceScore: 1.0,
              },
            ],
          },
          {
            name: 'Fastify',
            slug: 'fastify',
            category: 'FRAMEWORK',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 1.0,
            evidence: [
              {
                id: randomUUID(),
                resourceId: mockResourceId,
                evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
                sourceProvider: 'GITHUB_APP',
                sourceLocation: { filePath: 'package.json', commitSha: 'd'.repeat(40) },
                excerpt: '"fastify": "^5.2.1"',
                confidenceScore: 1.0,
              },
            ],
          },
        ],
      });

      const job = createBaseJob([
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          skillSlug: 'graphql',
          rawSnippet: 'Required: GraphQL API schema design',
          extractedValue: 'GraphQL',
          sourceSpan: { section: 'Requirements', snippet: 'GraphQL' },
        },
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          skillSlug: 'grpc',
          rawSnippet: 'Required: gRPC distributed messaging',
          extractedValue: 'gRPC',
          sourceSpan: { section: 'Requirements', snippet: 'gRPC' },
        },
      ]);

      const result = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);

      assert.equal(result.summary.matchedCount, 0);
      assert.equal(result.summary.missingCount, 2);
      assert.equal(result.requirementMatches[0].matchStatus, 'MISSING');
      assert.equal(result.requirementMatches[1].matchStatus, 'MISSING');
    });
  });

  // ===========================================================================
  // 5. Non-Skill Categories: Experience, Education, Location, Domain
  // ===========================================================================
  describe('5. Non-Skill Requirements (Experience, Education, Location, Domain)', () => {
    it('evaluates explicit work history years for EXPERIENCE requirement', () => {
      const candidate = createBaseCandidate({
        profileMetadata: {
          experienceYears: 5,
        },
      });

      const job = createBaseJob([
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'EXPERIENCE',
          importance: 'REQUIRED',
          weight: 1.0,
          extractedValue: '3+ years experience',
          normalizedCriteria: { minYears: 3 },
          sourceSpan: { section: 'Requirements', snippet: '3+ years' },
        },
      ]);

      const result = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);
      assert.equal(result.requirementMatches[0].matchStatus, 'MATCHED');
      assert.ok(result.requirementMatches[0].explanation.includes('5 years'));
    });

    it('evaluates repository activity years without corporate work history as PARTIAL', () => {
      const candidate = createBaseCandidate({
        profileMetadata: {
          repositoryActivityYears: 4,
        },
      });

      const job = createBaseJob([
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'EXPERIENCE',
          importance: 'REQUIRED',
          weight: 1.0,
          extractedValue: '3+ years experience',
          normalizedCriteria: { minYears: 3 },
          sourceSpan: { section: 'Requirements', snippet: '3+ years' },
        },
      ]);

      const result = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);
      assert.equal(result.requirementMatches[0].matchStatus, 'PARTIAL');
      assert.ok(result.requirementMatches[0].explanation.includes('repository commit activity'));
    });

    it('evaluates degree level matching for EDUCATION requirement', () => {
      const candidate = createBaseCandidate({
        profileMetadata: {
          education: [{ degree: 'Master of Science', level: 'MASTER' }],
        },
      });

      const job = createBaseJob([
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'EDUCATION',
          importance: 'REQUIRED',
          weight: 1.0,
          extractedValue: 'Bachelor in Computer Science',
          normalizedCriteria: { degreeLevel: 'BACHELOR' },
          sourceSpan: { section: 'Education', snippet: 'Bachelor' },
        },
      ]);

      const result = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);
      assert.equal(result.requirementMatches[0].matchStatus, 'MATCHED');
    });

    it('evaluates unstated candidate education as UNKNOWN, never false negative MISSING', () => {
      const candidate = createBaseCandidate({ profileMetadata: {} });
      const job = createBaseJob([
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'EDUCATION',
          importance: 'REQUIRED',
          weight: 1.0,
          extractedValue: 'Bachelor in Computer Science',
          sourceSpan: { section: 'Education', snippet: 'Bachelor' },
        },
      ]);

      const result = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);
      assert.equal(result.requirementMatches[0].matchStatus, 'UNKNOWN');
      assert.equal(result.skillGaps.length, 0);
    });

    it('evaluates REMOTE workplace matching correctly', () => {
      const candidate = createBaseCandidate({
        profileMetadata: { location: 'San Francisco, CA' },
      });

      const job = createBaseJob([
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'LOCATION',
          importance: 'REQUIRED',
          weight: 1.0,
          extractedValue: 'Remote - US',
          normalizedCriteria: { workplaceType: 'REMOTE' },
          sourceSpan: { section: 'Location', snippet: 'Remote' },
        },
      ]);

      const result = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);
      assert.equal(result.requirementMatches[0].matchStatus, 'MATCHED');
    });

    it('evaluates verified project domain tags for DOMAIN requirement', () => {
      const candidate = createBaseCandidate({
        projects: [
          {
            id: randomUUID(),
            tenantId: mockTenantId,
            candidateId: mockCandidateId,
            name: 'Payment Processing Service',
            slug: 'payment-processing-service',
            metadata: { domain: 'fintech' },
            resources: [],
          },
        ],
      });

      const job = createBaseJob([
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'DOMAIN',
          importance: 'REQUIRED',
          weight: 1.0,
          extractedValue: 'Fintech Payments',
          normalizedCriteria: { domainSlug: 'fintech' },
          sourceSpan: { section: 'Domain', snippet: 'Fintech' },
        },
      ]);

      const result = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);
      assert.equal(result.requirementMatches[0].matchStatus, 'MATCHED');
    });
  });

  // ===========================================================================
  // 6. Qualitative & Subjective Soft-Skill Qualifications
  // ===========================================================================
  describe('6. Qualitative & Subjective Soft-Skill Routing', () => {
    it('routes leadership and communication soft skills to UNKNOWN with zero gaps', () => {
      const candidate = createBaseCandidate();
      const job = createBaseJob([
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'OTHER',
          importance: 'REQUIRED',
          weight: 1.0,
          extractedValue: 'Demonstrated cross-functional leadership and communication',
          sourceSpan: { section: 'Soft Skills', snippet: 'leadership' },
        },
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'SKILL',
          importance: 'PREFERRED',
          weight: 0.5,
          extractedValue: 'Startup mindset and culture fit',
          sourceSpan: { section: 'Culture', snippet: 'startup mindset' },
        },
      ]);

      const result = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);

      assert.equal(result.summary.unknownCount, 2);
      assert.equal(result.requirementMatches[0].matchStatus, 'UNKNOWN');
      assert.equal(result.requirementMatches[1].matchStatus, 'UNKNOWN');
      assert.equal(result.skillGaps.length, 0);
    });
  });

  // ===========================================================================
  // 7. Evidence Selection Bounds (Max 3 EvidenceRefs)
  // ===========================================================================
  describe('7. Evidence Selection Bounds & Evidentiary Sorting', () => {
    it('selects top 3 evidence refs prioritized by manifest over imports and readme', () => {
      const candidate = createBaseCandidate({
        skills: [
          {
            name: 'TypeScript',
            slug: 'typescript',
            category: 'LANGUAGE',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 0.98,
            evidence: [
              {
                id: randomUUID(),
                resourceId: mockResourceId,
                evidenceType: 'README_SPECIFICATION',
                sourceProvider: 'GITHUB_APP',
                sourceLocation: { filePath: 'README.md' },
                confidenceScore: 0.6,
              },
              {
                id: randomUUID(),
                resourceId: mockResourceId,
                evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
                sourceProvider: 'GITHUB_APP',
                sourceLocation: { filePath: 'package.json' },
                confidenceScore: 0.99,
              },
              {
                id: randomUUID(),
                resourceId: mockResourceId,
                evidenceType: 'CODE_IMPORT_USAGE',
                sourceProvider: 'GITHUB_APP',
                sourceLocation: { filePath: 'src/index.ts' },
                confidenceScore: 0.95,
              },
              {
                id: randomUUID(),
                resourceId: mockResourceId,
                evidenceType: 'CONFIG_SYNTAX_DECLARATION',
                sourceProvider: 'GITHUB_APP',
                sourceLocation: { filePath: 'tsconfig.json' },
                confidenceScore: 0.92,
              },
            ],
          },
        ],
      });

      const job = createBaseJob([
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          skillSlug: 'typescript',
          extractedValue: 'TypeScript',
          sourceSpan: { section: 'Requirements', snippet: 'TypeScript' },
        },
      ]);

      const result = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);

      const match = result.requirementMatches[0];
      assert.equal(match.primaryEvidence.evidenceType, 'PACKAGE_MANIFEST_DEPENDENCY');
      assert.equal(match.supportingEvidence.length, 2);
      assert.equal(match.supportingEvidence[0].evidenceType, 'CODE_IMPORT_USAGE');
      assert.equal(match.supportingEvidence[1].evidenceType, 'CONFIG_SYNTAX_DECLARATION');
      // 4th item (README) is pruned to keep max 3 total references
    });
  });

  // ===========================================================================
  // 8. Multi-Tenant Sovereign Isolation Security Tests
  // ===========================================================================
  describe('8. Multi-Tenant Sovereign Isolation (404 Default Deny)', () => {
    it('throws ValidationError if context tenantId is missing', () => {
      const candidate = createBaseCandidate();
      const job = createBaseJob([]);

      assert.throws(
        () => EvidenceMatchingService.matchJobToCandidate({}, job, candidate),
        (err) => err instanceof ValidationError && err.statusCode === 400
      );
    });

    it('throws NotFoundError (404) if context tenantId does not match job tenantId', () => {
      const candidate = createBaseCandidate();
      const job = createBaseJob([], { tenantId: randomUUID() });

      assert.throws(
        () => EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate),
        (err) => err instanceof NotFoundError && err.statusCode === 404
      );
    });

    it('throws NotFoundError (404) if context tenantId does not match candidate tenantId', () => {
      const candidate = createBaseCandidate({ tenantId: randomUUID() });
      const job = createBaseJob([]);

      assert.throws(
        () => EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate),
        (err) => err instanceof NotFoundError && err.statusCode === 404
      );
    });
    it('throws NotFoundError (404) if job tenantId does not match candidate tenantId', () => {
      const candidate = createBaseCandidate({ tenantId: mockTenantId });
      const job = createBaseJob([], { tenantId: randomUUID() });

      assert.throws(
        () => EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate),
        (err) => err instanceof NotFoundError && err.statusCode === 404
      );
    });
  });

  // ===========================================================================
  // 9. Negative & Boundary Tests
  // ===========================================================================
  describe('9. Negative & Boundary Scenarios', () => {
    it('evaluates candidate with lower degree level as PARTIAL with INSUFFICIENT_EVIDENCE', () => {
      const candidate = createBaseCandidate({
        profileMetadata: {
          education: [{ degree: 'Associate Degree', level: 'ASSOCIATE' }],
        },
      });

      const job = createBaseJob([
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'EDUCATION',
          importance: 'REQUIRED',
          weight: 1.0,
          extractedValue: 'Master of Science in Computer Science',
          normalizedCriteria: { degreeLevel: 'MASTER' },
          sourceSpan: { section: 'Education', snippet: 'Master' },
        },
      ]);

      const result = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);
      assert.equal(result.requirementMatches[0].matchStatus, 'PARTIAL');
      assert.equal(result.skillGaps.length, 1);
      assert.equal(result.skillGaps[0].severity, 'INSUFFICIENT_EVIDENCE');
    });

    it('evaluates on-site location mismatch as MISSING with EXPLICITLY_MISSING gap', () => {
      const candidate = createBaseCandidate({
        profileMetadata: { location: 'London, UK' },
      });

      const job = createBaseJob([
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'LOCATION',
          importance: 'REQUIRED',
          weight: 1.0,
          extractedValue: 'Tokyo, Japan',
          normalizedCriteria: { workplaceType: 'ON_SITE', city: 'Tokyo' },
          sourceSpan: { section: 'Location', snippet: 'Tokyo' },
        },
      ]);

      const result = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);
      assert.equal(result.requirementMatches[0].matchStatus, 'MISSING');
      assert.equal(result.skillGaps.length, 1);
      assert.equal(result.skillGaps[0].severity, 'EXPLICITLY_MISSING');
    });

    it('evaluates verified certifications correctly', () => {
      const candidate = createBaseCandidate({
        profileMetadata: {
          certifications: ['AWS Certified Solutions Architect - Associate'],
        },
      });

      const job = createBaseJob([
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'CERTIFICATION',
          importance: 'REQUIRED',
          weight: 1.0,
          extractedValue: 'AWS Certified Solutions Architect',
          sourceSpan: { section: 'Certifications', snippet: 'AWS Certified' },
        },
      ]);

      const result = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);
      assert.equal(result.requirementMatches[0].matchStatus, 'MATCHED');
    });

    it('handles inferred skills with < 0.85 confidence with INSUFFICIENT_EVIDENCE gap', () => {
      const candidate = createBaseCandidate({
        skills: [
          {
            name: 'Docker',
            slug: 'docker',
            category: 'CLOUD_DEVOPS',
            provenanceStatus: 'INFERRED',
            confidenceScore: 0.7,
            evidence: [
              {
                id: randomUUID(),
                resourceId: mockResourceId,
                evidenceType: 'FILE_PATTERN_MATCH',
                sourceProvider: 'GITHUB_APP',
                sourceLocation: { filePath: 'Dockerfile' },
                confidenceScore: 0.7,
              },
            ],
          },
        ],
      });

      const job = createBaseJob([
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          skillSlug: 'docker',
          extractedValue: 'Docker',
          sourceSpan: { section: 'Req', snippet: 'Docker' },
        },
      ]);

      const result = EvidenceMatchingService.matchJobToCandidate(baseContext, job, candidate);
      assert.equal(result.requirementMatches[0].matchStatus, 'PARTIAL');
      assert.equal(result.skillGaps[0].severity, 'INSUFFICIENT_EVIDENCE');
    });
  });

  // ===========================================================================
  // 10. Determinism & Functional Invocation
  // ===========================================================================
  describe('10. Determinism & Functional Invocation', () => {
    it('produces bit-for-bit identical outputs across consecutive runs', () => {
      const candidate = createBaseCandidate({
        skills: [
          {
            name: 'Python',
            slug: 'python',
            category: 'LANGUAGE',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 0.95,
            evidence: [
              {
                id: randomUUID(),
                resourceId: mockResourceId,
                evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
                sourceProvider: 'GITHUB_APP',
                sourceLocation: { filePath: 'requirements.txt' },
                confidenceScore: 0.95,
              },
            ],
          },
        ],
      });

      const job = createBaseJob([
        {
          id: randomUUID(),
          tenantId: mockTenantId,
          jobDescriptionId: mockJobId,
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          skillSlug: 'python',
          extractedValue: 'Python',
          sourceSpan: { section: 'Req', snippet: 'Python' },
        },
      ]);

      const run1 = matchJobToCandidate(baseContext, job, candidate);
      const run2 = matchJobToCandidate(baseContext, job, candidate);

      assert.deepEqual(run1.summary, run2.summary);
      assert.deepEqual(
        run1.requirementMatches[0].matchStatus,
        run2.requirementMatches[0].matchStatus
      );
      assert.deepEqual(
        run1.requirementMatches[0].explanation,
        run2.requirementMatches[0].explanation
      );
    });
  });
});
