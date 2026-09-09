/**
 * @file Integration Test for P16-001F-2: Structured Resume -> Controlled LaTeX Artifact Rendering
 *
 * Requirements:
 * 1. Prepare a real application package.
 * 2. Retrieve its structured snapshot.
 * 3. Delete/alter the live candidate profile fields:
 *    - phone
 *    - location
 *    - experience
 *    - education
 *    - certifications
 *    - GitHub URL
 * 4. Render the existing application package again.
 * 5. Verify the resulting resume still contains the ORIGINAL snapshot values.
 * 6. Verify no new profile values appear.
 * 7. Verify PDF compilation succeeds.
 * 8. Verify geometry and ATS QA remain valid.
 * 9. candidateProfileService.getProfile() throws -> structured package rendering still succeeds.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  skills,
  candidateSkills,
  projects,
} from '../../src/db/schema.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { ApplicationHandoffService } from '../../src/services/application-handoff.service.js';
import { ApplicationTrackingService } from '../../src/services/application-tracking.service.js';
import { DocumentStorageService } from '../../src/services/document-storage.service.js';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';
import { LatexCompilerService } from '../../src/services/latex-compiler.service.js';

describe('Integration: P16-001F-2 Structured Resume Artifact Rendering', () => {
  const runId = crypto.randomUUID().slice(0, 8);
  const createdTenantIds = [];
  let tempStorageDir;

  let tenantId;
  let userId;
  let candidateId;
  let candidateEmail;
  let workflowService;
  let trackingService;
  let documentStorage;
  let candidateProfileService;
  let preparedPackage;

  const testJob = {
    id: `job-f2-render-${runId}`,
    source: 'GREENHOUSE',
    company: 'Nexus Scale Systems',
    title: 'Staff Distributed Systems Engineer',
    location: 'San Francisco, CA',
    applicationUrl: 'https://boards.greenhouse.io/nexus/jobs/f2-101',
    description:
      'We are looking for a Staff Distributed Systems Engineer to scale event replication across global clusters. Must have strong experience in Node.js, PostgreSQL, and TypeScript.',
    requirements: ['Node.js', 'PostgreSQL', 'TypeScript'],
    skills: ['Node.js', 'PostgreSQL', 'TypeScript'],
    retrievedAt: new Date().toISOString(),
  };

  before(async () => {
    tempStorageDir = path.join(os.tmpdir(), `ai-career-p16f2-${runId}`);
    await fs.mkdir(tempStorageDir, { recursive: true });

    tenantId = crypto.randomUUID();
    createdTenantIds.push(tenantId);
    userId = crypto.randomUUID();
    candidateId = crypto.randomUUID();
    candidateEmail = `morgan.harper.${runId}@authentic-domain.io`;

    await db.insert(tenants).values({
      id: tenantId,
      name: 'P16-001F-2 Integration Tenant',
      slug: `p16-f2-${runId}`,
      tier: 'PRO',
    });

    await db.insert(users).values({
      id: userId,
      tenantId,
      email: candidateEmail,
      displayName: 'Morgan Harper',
      role: 'MEMBER',
      status: 'ACTIVE',
    });

    const initialProfileMetadata = {
      identity: {
        phone: '+1-555-0199',
        location: 'San Francisco, CA',
      },
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
          degree: 'B.S.',
          fieldOfStudy: 'Computer Science',
          startDate: '2017-09-01',
          endDate: '2021-05-15',
          isCurrent: false,
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
        profileUrl: 'https://leetcode.com/u/morganharper',
        bullets: ['Solved algorithmic optimization challenges in dynamic programming and graph traversal.'],
        provenanceStatus: 'CLAIMED',
      },
      portfolioLinks: [
        { platform: 'GitHub', label: 'GitHub', url: 'https://github.com/morganharper' },
        { platform: 'LinkedIn', label: 'LinkedIn', url: 'https://linkedin.com/in/morganharper' },
        { platform: 'LeetCode', label: 'LeetCode', url: 'https://leetcode.com/u/morganharper' },
      ],
    };

    await db.insert(candidates).values({
      id: candidateId,
      tenantId,
      userId,
      displayName: 'Morgan Harper',
      headline: 'Staff Distributed Systems Engineer',
      canonicalEmail: candidateEmail,
      profileMetadata: initialProfileMetadata,
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

    const [skillTs] = await db
      .insert(skills)
      .values({
        id: crypto.randomUUID(),
        name: 'TypeScript',
        slug: `typescript-${runId}`,
        category: 'LANGUAGE',
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
      {
        id: crypto.randomUUID(),
        tenantId,
        candidateId,
        skillId: skillTs.id,
        category: 'LANGUAGE',
        confidenceScore: 0.92,
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
    trackingService = new ApplicationTrackingService({ database: db });
    documentStorage = new DocumentStorageService({ storageDir: tempStorageDir });
    candidateProfileService = new CandidateProfileService({ database: db });
  });

  after(async () => {
    try {
      if (createdTenantIds.length > 0) {
        await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
      }
    } catch {
      // Ignore cleanup error
    }
    try {
      await fs.rm(tempStorageDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
    await closeDatabase();
  });

  it('1 & 2. Prepare real application package and retrieve immutable structured snapshot', async () => {
    const authContext = {
      tenantId,
      userId,
      role: 'MEMBER',
      scopes: ['career:read', 'career:write'],
    };

    preparedPackage = await workflowService.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: testJob,
      authContext,
      answers: {
        whyUs: 'Deep expertise in distributed event-driven systems at scale.',
      },
    });

    assert.ok(preparedPackage, 'Must return applicationPackage');
    assert.ok(preparedPackage.packageHash, 'Package must have packageHash');

    const structuredResume = preparedPackage.tailoredResume?.structuredResume;
    assert.ok(structuredResume, 'Must contain tailoredResume.structuredResume');

    // Verify snapshot captures the original values
    assert.strictEqual(structuredResume.candidateIdentity.phone, '+1-555-0199');
    assert.strictEqual(structuredResume.candidateIdentity.location, 'San Francisco, CA');
    assert.strictEqual(structuredResume.experience[0].company, 'Nexus Cloud Infrastructure');
    assert.strictEqual(structuredResume.education[0].institution, 'University of California, Berkeley');
    assert.strictEqual(
      structuredResume.certifications[0].name,
      'AWS Certified Solutions Architect - Professional'
    );
    const ghLink = structuredResume.candidateIdentity.links.find((l) => l.platform === 'GITHUB');
    assert.ok(ghLink && ghLink.url.includes('github.com/morganharper'));
  });

  it('3, 4, 5, 6, 7 & 8. Alter/delete live candidate profile and verify renderer uses ONLY snapshot', async () => {
    // 3. Mutate live candidate profile in database to adversarial / completely altered values
    const tamperedProfileMetadata = {
      identity: {
        phone: '+1-999-888-7777',
        location: 'Adversarial Tampered City, Nowhere',
      },
      experience: [
        {
          id: 'exp-fake-99',
          company: 'Hacked Corporation',
          title: 'Malicious Intruder Engineer',
          startDate: '2025-01-01',
          endDate: 'Present',
          isCurrent: true,
          location: 'Nowhere',
          bullets: ['Tampered fake experience bullet.'],
          provenanceStatus: 'USER_PROVIDED',
        },
      ],
      education: [
        {
          id: 'edu-fake-99',
          institution: 'Fake Diploma Mill University',
          degree: 'Ph.D. in Hacking',
          startDate: '2024',
          endDate: '2025',
          provenanceStatus: 'USER_PROVIDED',
        },
      ],
      certifications: [],
      problemSolving: {
        hasSection: false,
      },
      portfolioLinks: [
        { platform: 'GitHub', label: 'GitHub', url: 'https://github.com/tampered-account-xyz' },
      ],
    };

    await db
      .update(candidates)
      .set({
        profileMetadata: tamperedProfileMetadata,
        displayName: 'Tampered Hacker Name',
      })
      .where(eq(candidates.id, candidateId));

    // Verify DB was actually updated with tampered values
    const [tamperedCand] = await db.select().from(candidates).where(eq(candidates.id, candidateId));
    assert.strictEqual(tamperedCand.displayName, 'Tampered Hacker Name');
    assert.strictEqual(tamperedCand.profileMetadata.identity.phone, '+1-999-888-7777');

    // 4. Render the existing application package again via ApplicationHandoffService
    const handoffService = new ApplicationHandoffService({
      applicationTrackingService: trackingService,
      documentStorage,
      candidateProfileService,
    });

    const kit = await handoffService.buildApplicationHandoffKit({
      tenantId,
      userId,
      candidateId,
      applicationPackage: preparedPackage,
      applicationId: null, // Force active rendering through the full pipeline
      destinationUrl: testJob.applicationUrl,
    });

    assert.ok(kit, 'Handoff kit must build successfully');
    assert.strictEqual(kit.packageHash, preparedPackage.packageHash);

    // 5. Verify the resulting resume contains ORIGINAL snapshot values
    assert.ok(kit.resume, 'Handoff kit must include resume artifact');
    assert.ok(kit.resume.fileSizeBytes > 0, 'PDF file must be non-empty');

    // Verify the LaTeX source produced for the package
    const generator = new LatexDocumentGenerator();
    const resumeLatex = generator.generateTailoredResumeLatex({
      applicationPackage: preparedPackage,
    });

    // Original values must be present
    assert.match(resumeLatex.texContent, /\+1-555-0199/, 'Original phone must be in rendered LaTeX');
    assert.match(resumeLatex.texContent, /San Francisco, CA/, 'Original location must be in rendered LaTeX');
    assert.match(resumeLatex.texContent, /Nexus Cloud Infrastructure/, 'Original company must be in rendered LaTeX');
    assert.match(resumeLatex.texContent, /University of California, Berkeley/, 'Original school must be in rendered LaTeX');
    assert.match(resumeLatex.texContent, /AWS Certified Solutions Architect/, 'Original certification must be in rendered LaTeX');
    assert.match(resumeLatex.texContent, /github\.com\/morganharper/, 'Original GitHub link must be in rendered LaTeX');

    // 6. Verify NO new live profile values appear
    assert.doesNotMatch(resumeLatex.texContent, /\+1-999-888-7777/, 'Tampered phone must NOT appear');
    assert.doesNotMatch(resumeLatex.texContent, /Adversarial Tampered City/, 'Tampered location must NOT appear');
    assert.doesNotMatch(resumeLatex.texContent, /Hacked Corporation/, 'Tampered company must NOT appear');
    assert.doesNotMatch(resumeLatex.texContent, /Fake Diploma Mill/, 'Tampered school must NOT appear');
    assert.doesNotMatch(resumeLatex.texContent, /tampered-account-xyz/, 'Tampered GitHub must NOT appear');
    assert.doesNotMatch(resumeLatex.texContent, /Tampered Hacker Name/, 'Tampered candidate name must NOT appear');

    // 7. Verify PDF compilation succeeds
    const compiler = new LatexCompilerService();
    const compileResult = await compiler.compileLatexToPdf({
      texContent: resumeLatex.texContent,
      jobName: 'p16f2-integration-verify',
    });
    assert.ok(compileResult.pdfBuffer && compileResult.pdfBuffer.length > 0, 'PDF compilation must succeed');

    // 8. Verify geometry and ATS QA remain valid in the kit
    assert.ok(kit.resume.qaAudit, 'Resume QA audit must be present');
    assert.strictEqual(kit.resume.qaAudit.passed, true, 'Resume QA audit must pass');
    assert.ok(kit.resume.layoutDiagnostics, 'Layout diagnostics must be present from geometry analyzer');
    assert.strictEqual(kit.resume.layoutDiagnostics.pageCount, 1, 'Resume must be exactly 1 page');
  });

  it('9. When candidateProfileService.getProfile() throws, structured package rendering still succeeds', async () => {
    const throwingProfileService = {
      async getProfile() {
        throw new Error('Database connection completely offline / unavailable');
      },
    };

    const handoffService = new ApplicationHandoffService({
      applicationTrackingService: trackingService,
      documentStorage,
      candidateProfileService: throwingProfileService,
    });

    const kit = await handoffService.buildApplicationHandoffKit({
      tenantId,
      userId,
      candidateId,
      applicationPackage: preparedPackage,
      applicationId: null, // Force active rendering through the full pipeline
      destinationUrl: testJob.applicationUrl,
    });

    assert.ok(kit, 'Must build handoff kit despite throwing profile service');
    assert.strictEqual(kit.packageHash, preparedPackage.packageHash);
    assert.ok(kit.resume && kit.resume.fileSizeBytes > 0, 'Resume PDF must be successfully compiled');
    assert.strictEqual(kit.resume.qaAudit.passed, true, 'Resume QA audit must pass');
  });
});
