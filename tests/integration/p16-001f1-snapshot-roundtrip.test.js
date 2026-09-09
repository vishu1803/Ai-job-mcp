/**
 * @file Integration Test for P16-001F-1: Structured Resume Snapshot Roundtrip Persistence
 *
 * Proves the end-to-end integration:
 * prepare application
 * → persist into application_packages.package_payload
 * → retrieve package via getApplicationPackage
 * → structuredResume exists
 * → exact structured snapshot survives roundtrip byte-for-byte
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import { tenants, users, candidates, skills, candidateSkills, projects } from '../../src/db/schema.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';

describe('Integration: P16-001F-1 Structured Resume Snapshot Roundtrip', () => {
  const runId = crypto.randomUUID().slice(0, 8);
  const createdTenantIds = [];

  let tenantId;
  let userId;
  let candidateId;
  let workflowService;
  let authContext;

  const testJob = {
    id: `job-roundtrip-${runId}`,
    source: 'GREENHOUSE',
    company: 'Stripe Global',
    title: 'Senior Distributed Systems Engineer',
    location: 'Remote',
    applicationUrl: 'https://boards.greenhouse.io/stripe/jobs/roundtrip-101',
    description: 'We are seeking a Senior Distributed Systems Engineer experienced in Node.js, PostgreSQL, and event architectures.',
    requirements: ['Node.js', 'PostgreSQL', 'TypeScript'],
    skills: ['Node.js', 'PostgreSQL', 'TypeScript'],
    retrievedAt: new Date().toISOString(),
  };

  before(async () => {
    tenantId = crypto.randomUUID();
    createdTenantIds.push(tenantId);
    userId = crypto.randomUUID();
    candidateId = crypto.randomUUID();

    await db.insert(tenants).values({
      id: tenantId,
      name: 'P16-001F1 Test Tenant',
      slug: `p16-tenant-${runId}`,
      tier: 'PRO',
    });

    const candidateEmail = `snapshot.candidate.${runId}@authentic-domain.io`;

    await db.insert(users).values({
      id: userId,
      tenantId,
      email: candidateEmail,
      displayName: 'Morgan Harper',
      role: 'MEMBER',
      status: 'ACTIVE',
    });

    const profileMetadata = {
      experience: [
        {
          id: 'exp-nexus-01',
          company: 'Nexus Cloud Infrastructure',
          title: 'Senior Distributed Systems Engineer',
          startDate: '2021-06-01',
          endDate: '2024-08-01',
          isCurrent: false,
          location: 'San Francisco, CA',
          bullets: ['Engineered scalable event replication pipeline across multi-region clusters.'],
          provenanceStatus: 'USER_PROVIDED',
        },
      ],
      education: [
        {
          id: 'edu-cal-01',
          institution: 'University of California, Berkeley',
          degree: 'B.S. in Electrical Engineering and Computer Sciences',
          fieldOfStudy: 'Computer Science',
          startDate: '2017-09-01',
          endDate: '2021-05-15',
          coursework: ['Distributed Systems', 'Operating Systems'],
          provenanceStatus: 'USER_PROVIDED',
        },
      ],
      certifications: [
        {
          id: 'cert-aws-01',
          name: 'AWS Certified Solutions Architect - Professional',
          issuingOrganization: 'Amazon Web Services',
          issueDate: '2022-10-01',
          expirationDate: '2025-10-01',
          credentialId: 'AWS-SAP-88392',
          provenanceStatus: 'USER_PROVIDED',
        },
      ],
      problemSolving: {
        hasSection: true,
        profileUrl: 'https://leetcode.com/morganharper',
        bullets: ['Solved algorithmic optimization challenges in dynamic programming and graph traversal.'],
        provenanceStatus: 'CLAIMED',
      },
      portfolioLinks: [
        { label: 'GitHub', url: 'https://github.com/morganharper' },
        { label: 'LinkedIn', url: 'https://linkedin.com/in/morganharper' },
        { label: 'LeetCode', url: 'https://leetcode.com/morganharper' },
      ],
    };

    await db.insert(candidates).values({
      id: candidateId,
      tenantId,
      userId,
      displayName: 'Morgan Harper',
      headline: 'Senior Distributed Systems Engineer',
      canonicalEmail: candidateEmail,
      profileMetadata,
    });

    // Seed verified skills
    const [skillNode] = await db
      .insert(skills)
      .values({
        id: crypto.randomUUID(),
        name: 'Node.js',
        slug: `nodejs-${runId}`,
        category: 'FRAMEWORK',
      })
      .returning();

    const [skillPg] = await db
      .insert(skills)
      .values({
        id: crypto.randomUUID(),
        name: 'PostgreSQL',
        slug: `postgres-${runId}`,
        category: 'DATABASE',
      })
      .returning();

    await db.insert(candidateSkills).values([
      {
        id: crypto.randomUUID(),
        tenantId,
        candidateId,
        skillId: skillNode.id,
        category: 'FRAMEWORK',
        confidenceScore: 0.95,
        provenanceStatus: 'VERIFIED',
      },
      {
        id: crypto.randomUUID(),
        tenantId,
        candidateId,
        skillId: skillPg.id,
        category: 'DATABASE',
        confidenceScore: 0.9,
        provenanceStatus: 'VERIFIED',
      },
    ]);

    // Seed project
    await db.insert(projects).values({
      id: crypto.randomUUID(),
      tenantId,
      candidateId,
      name: 'Event-Bus-Replica',
      slug: `event-bus-${runId}`,
      headline: 'High throughput event log replication',
      summary: 'Distributed log with Raft consensus in Node.js',
      metadata: {
        technologies: ['Node.js', 'PostgreSQL', 'TypeScript'],
        repositoryUrl: 'https://github.com/morganharper/event-bus-replica',
      },
    });

    workflowService = new JobApplicationWorkflowService({ database: db });

    authContext = {
      tenantId,
      userId,
      role: 'MEMBER',
      scopes: ['career:read', 'career:write'],
    };
  });

  after(async () => {
    if (createdTenantIds.length > 0) {
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }
    await closeDatabase();
  });

  it('prepare application → retrieve package → structuredResume exists and survives roundtrip exactly', async () => {
    // 1. Prepare application package
    const preparedPkg = await workflowService.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: testJob,
      answers: {
        whyUs: 'Deep expertise in distributed event-driven systems at scale.',
      },
    });

    assert.ok(preparedPkg, 'Prepared package must be returned');
    assert.ok(preparedPkg.packageHash, 'Package must have a deterministic SHA-256 hash');
    assert.ok(preparedPkg.tailoredResume.structuredResume, 'tailoredResume.structuredResume must be present');
    assert.ok(preparedPkg.tailoredResume.tailoringPlan, 'tailoredResume.tailoringPlan must be present');
    assert.ok(preparedPkg.tailoredResume.evidenceValidationReceipt, 'tailoredResume.evidenceValidationReceipt must be present');

    const originalStructured = preparedPkg.tailoredResume.structuredResume;
    const originalPlan = preparedPkg.tailoredResume.tailoringPlan;
    const originalReceipt = preparedPkg.tailoredResume.evidenceValidationReceipt;

    assert.strictEqual(originalReceipt.overallStatus, 'PASS', 'Validation receipt must pass');
    assert.strictEqual(originalStructured.candidateIdentity.displayName, 'Morgan Harper');

    // 2. Retrieve the persisted package via getApplicationPackage
    const retrievedApp = await workflowService.getApplicationPackage(
      authContext,
      preparedPkg.applicationId
    );

    assert.ok(retrievedApp, 'Retrieved application record must exist');
    assert.strictEqual(retrievedApp.packageHash, preparedPkg.packageHash, 'Package hash must match');

    const retrievedPkg = retrievedApp.applicationPackage;
    assert.ok(retrievedPkg, 'applicationPackage payload must exist in database row');

    // 3. Verify structuredResume, tailoringPlan, evidenceValidationReceipt survived roundtrip
    assert.ok(
      retrievedPkg.tailoredResume.structuredResume,
      'Persisted tailoredResume.structuredResume must exist after roundtrip'
    );
    assert.ok(
      retrievedPkg.tailoredResume.tailoringPlan,
      'Persisted tailoredResume.tailoringPlan must exist after roundtrip'
    );
    assert.ok(
      retrievedPkg.tailoredResume.evidenceValidationReceipt,
      'Persisted tailoredResume.evidenceValidationReceipt must exist after roundtrip'
    );

    // Deep equality check between prepared snapshot and roundtrip retrieved snapshot
    assert.deepStrictEqual(
      retrievedPkg.tailoredResume.structuredResume,
      originalStructured,
      'structuredResume document must be byte-for-byte identical after database persistence roundtrip'
    );

    assert.deepStrictEqual(
      retrievedPkg.tailoredResume.tailoringPlan,
      originalPlan,
      'tailoringPlan must be identical after database persistence roundtrip'
    );

    assert.deepStrictEqual(
      retrievedPkg.tailoredResume.evidenceValidationReceipt,
      originalReceipt,
      'evidenceValidationReceipt must be identical after database persistence roundtrip'
    );

    // 4. Verify candidate snapshots inside structuredResume survived roundtrip
    const structured = retrievedPkg.tailoredResume.structuredResume;
    assert.strictEqual(structured.candidateIdentity.displayName, 'Morgan Harper');
    assert.strictEqual(structured.experience.length, 1);
    assert.strictEqual(structured.experience[0].company, 'Nexus Cloud Infrastructure');
    assert.strictEqual(structured.education.length, 1);
    assert.strictEqual(structured.education[0].institution, 'University of California, Berkeley');
    assert.strictEqual(structured.certifications.length, 1);
    assert.strictEqual(structured.certifications[0].name, 'AWS Certified Solutions Architect - Professional');
    assert.strictEqual(structured.dsa?.hasSection, true);
    assert.strictEqual(structured.dsa?.profileUrl, 'https://leetcode.com/morganharper');
  });
});
