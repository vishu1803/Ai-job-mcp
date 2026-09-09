/**
 * @file Integration Test for P16-001F-3A: Legacy to Structured Package Transition & Artifact Reuse
 *
 * Verifies the 10-step end-to-end lifecycle on a real database:
 * 1. Candidate + canonical job setup
 * 2. Prepare/persist legacy package -> version 1 (isReused: false)
 * 3. Generate handoff kit for legacy package -> legacy PDF stored
 * 4. Query application -> current package is version 1, contract LEGACY
 * 5. Prepare structured package for same candidate and job -> version 2, contract P16-001F, same applicationId
 * 6. Verify legacy package row archived, not deleted
 * 7. Generate handoff kit for structured package -> new structured PDF generated, legacy artifact not reused
 * 8. Prepare structured package again -> version 2, isReused: true
 * 9. Generate handoff kit again -> structured artifact reused
 * 10. Verify application package history contains both version 1 (ARCHIVED) and version 2 (CURRENT)
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
  applicationPackages,
} from '../../src/db/schema.js';
import {
  JobApplicationWorkflowService,
  computeApplicationPackageHash,
} from '../../src/services/job-application-workflow.service.js';
import { ApplicationTrackingService } from '../../src/services/application-tracking.service.js';
import { ApplicationHandoffService } from '../../src/services/application-handoff.service.js';
import { DocumentStorageService } from '../../src/services/document-storage.service.js';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import {
  RESUME_GENERATION_CONTRACT_VERSION,
  LEGACY_GENERATION_CONTRACT_VERSION,
  DEFAULT_STRUCTURED_RESUME_SCHEMA_VERSION,
} from '../../src/domain/job/job-workflow.schemas.js';

describe('Integration: P16-001F-3A Legacy to Structured Package Transition & Artifact Reuse', () => {
  const runId = crypto.randomUUID().slice(0, 8);
  const createdTenantIds = [];
  let tempStorageDir;

  let tenantId;
  let userId;
  let candidateId;
  let candidateEmail;
  let authContext;

  let workflowService;
  let trackingService;
  let handoffService;
  let documentStorage;
  let candidateProfileService;

  let applicationId;
  let legacyPackage;
  let legacyHandoffKit;
  let legacyResumeStorageKey;

  let structuredPackage;
  let structuredHandoffKit;
  let structuredResumeStorageKey;

  const canonicalJob = {
    id: `job-trans-${runId}`,
    canonicalJobId: `greenhouse:stripe:trans-${runId}`,
    source: 'GREENHOUSE',
    company: 'Stripe',
    title: 'Staff Infrastructure Engineer - Telemetry',
    location: 'Remote',
    applicationUrl: `https://boards.greenhouse.io/stripe/jobs/trans-${runId}`,
    directPortalUrl: `https://boards.greenhouse.io/stripe/jobs/trans-${runId}`,
    description: 'Build robust distributed telemetry collection systems in Node.js and TypeScript.',
    requirements: ['Node.js', 'Distributed Systems', 'TypeScript'],
    skills: ['Node.js', 'Distributed Systems', 'TypeScript'],
    retrievedAt: new Date().toISOString(),
  };

  before(async () => {
    tempStorageDir = path.join(os.tmpdir(), `ai-career-p16f3a-${runId}`);
    await fs.mkdir(tempStorageDir, { recursive: true });

    tenantId = crypto.randomUUID();
    createdTenantIds.push(tenantId);
    userId = crypto.randomUUID();
    candidateId = crypto.randomUUID();
    candidateEmail = `taylor.reed.${runId}@authentic-telemetry.io`;
    authContext = { tenantId, userId, role: 'MEMBER', scopes: ['career:read', 'career:write'] };

    // 1. Candidate + tenant setup
    await db.insert(tenants).values({
      id: tenantId,
      name: 'P16-001F-3A Transition Tenant',
      slug: `p16-f3a-${runId}`,
      tier: 'PRO',
    });

    await db.insert(users).values({
      id: userId,
      tenantId,
      email: candidateEmail,
      displayName: 'Taylor Reed',
      role: 'MEMBER',
      status: 'ACTIVE',
    });

    const profileMetadata = {
      identity: {
        phone: '+1-555-0144',
        location: 'Seattle, WA',
      },
      experience: [
        {
          id: 'exp-stripe-01',
          company: 'Acme Telemetry Core',
          title: 'Senior Systems Engineer',
          startDate: '2021-06-01',
          endDate: '2024-08-01',
          isCurrent: false,
          location: 'Seattle, WA',
          bullets: ['Built distributed pipeline handling 5M events per second in Node.js.'],
          provenanceStatus: 'USER_PROVIDED',
        },
      ],
      education: [
        {
          id: 'edu-uw-01',
          institution: 'University of Washington',
          degree: 'B.S.',
          fieldOfStudy: 'Computer Science',
          startDate: '2017-09-01',
          endDate: '2021-05-15',
          isCurrent: false,
          provenanceStatus: 'USER_PROVIDED',
        },
      ],
      certifications: [],
      problemSolving: { hasSection: false },
      portfolioLinks: [
        { platform: 'GitHub', label: 'GitHub', url: 'https://github.com/taylorreed' },
      ],
    };

    await db.insert(candidates).values({
      id: candidateId,
      tenantId,
      userId,
      displayName: 'Taylor Reed',
      headline: 'Staff Infrastructure Engineer',
      canonicalEmail: candidateEmail,
      profileMetadata,
    });

    const [skillNode] = await db
      .insert(skills)
      .values({
        id: crypto.randomUUID(),
        name: 'Node.js',
        slug: `node-p16f3a-${runId}`,
        category: 'FRAMEWORK',
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
    ]);

    trackingService = new ApplicationTrackingService({ database: db });
    workflowService = new JobApplicationWorkflowService({ database: db });
    documentStorage = new DocumentStorageService({ storageDir: tempStorageDir });
    candidateProfileService = new CandidateProfileService({ database: db });
    handoffService = new ApplicationHandoffService({
      applicationTrackingService: trackingService,
      documentStorage,
      candidateProfileService,
    });
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

  // ---------------------------------------------------------------------------
  // STEP 2: Prepare & persist legacy package -> version 1
  // ---------------------------------------------------------------------------
  it('Step 2: Prepare & persist legacy package as version 1', async () => {
    const rawLegacyPayload = {
      candidateId,
      candidateName: 'Taylor Reed',
      candidateEmail,
      targetJob: canonicalJob,
      tailoredResume: {
        title: 'Legacy Tailored Resume - Stripe',
        markdownContent: '# Taylor Reed\n\nExperienced Distributed Systems Engineer with expertise in Node.js and high-throughput pipelines.',
        contentHash: '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
        fitScore: 88,
        generationContractVersion: LEGACY_GENERATION_CONTRACT_VERSION,
        structuredResumeSchemaVersion: null,
      },
      coverLetter: {
        title: 'Legacy Cover Letter - Stripe',
        markdownContent: 'Dear Stripe Team,\n\nI am writing to express my strong enthusiasm...',
        contentHash: 'aaaabbbbccccddddeeeeffff1111222233334444555566667777888899990000',
        generationContractVersion: LEGACY_GENERATION_CONTRACT_VERSION,
        structuredResumeSchemaVersion: null,
      },
      verifiedSkills: [
        { name: 'Node.js', category: 'FRAMEWORK', confidence: 0.95, truthCategory: 'VERIFIED' },
      ],
      claimedSkills: [],
      portfolioLinks: [],
      answers: { workAuth: 'Authorized' },
      generationContractVersion: LEGACY_GENERATION_CONTRACT_VERSION,
      structuredResumeSchemaVersion: null,
    };

    const packageHash = computeApplicationPackageHash(rawLegacyPayload);
    legacyPackage = {
      ...rawLegacyPayload,
      packageHash,
    };

    // Create application and record version 1
    const app = await trackingService.resolveOrCreateApplication(
      authContext,
      candidateId,
      {
        canonicalJobId: canonicalJob.canonicalJobId,
        company: canonicalJob.company,
        title: canonicalJob.title,
        jobUrl: canonicalJob.applicationUrl,
        packageHash,
      }
    );
    applicationId = app.id;
    assert.ok(applicationId, 'Application must be created');

    const recorded = await trackingService.recordApplicationPackage(
      authContext,
      applicationId,
      legacyPackage,
      { source: 'PREPARE_JOB_APPLICATION' }
    );

    assert.strictEqual(recorded.version, 1, 'Initial legacy package must be version 1');
    assert.strictEqual(recorded.lifecycleState, 'CURRENT');
    assert.strictEqual(recorded.isReused, false, 'Initial package must not be reused');
    assert.strictEqual(recorded.generationContractVersion, 'LEGACY');
  });

  // ---------------------------------------------------------------------------
  // STEP 3: Generate handoff kit for legacy package -> legacy PDF stored
  // ---------------------------------------------------------------------------
  it('Step 3: Generate handoff kit for legacy package produces stored legacy PDF', async () => {
    legacyHandoffKit = await handoffService.buildApplicationHandoffKit({
      tenantId,
      userId,
      candidateId,
      applicationPackage: legacyPackage,
      applicationId,
    });

    assert.ok(legacyHandoffKit, 'Handoff kit must be produced');
    assert.strictEqual(legacyHandoffKit.generationContractVersion, 'LEGACY');
    assert.strictEqual(legacyHandoffKit.packageHash, legacyPackage.packageHash);
    assert.ok(legacyHandoffKit.resume.storageKey, 'Must contain resume storageKey');

    legacyResumeStorageKey = legacyHandoffKit.resume.storageKey;
    assert.ok(legacyResumeStorageKey.length > 0);
  });

  // ---------------------------------------------------------------------------
  // STEP 4: Query application -> current package is version 1, contract LEGACY
  // ---------------------------------------------------------------------------
  it('Step 4: Query application shows version 1 with contract LEGACY', async () => {
    const pkgEnvelope = await trackingService.getApplicationPackage(authContext, applicationId);
    assert.ok(pkgEnvelope, 'Must retrieve current package');
    assert.strictEqual(pkgEnvelope.packageVersion, 1);
    assert.strictEqual(pkgEnvelope.generationContractVersion, 'LEGACY');
    assert.strictEqual(pkgEnvelope.packageHash, legacyPackage.packageHash);
  });

  // ---------------------------------------------------------------------------
  // STEP 5: Prepare structured package for same candidate & job -> version 2
  // ---------------------------------------------------------------------------
  it('Step 5: Prepare structured package advances to version 2 on same applicationId', async () => {
    // Calling workflowService.prepareJobApplication creates a structured package
    const preparedResult = await workflowService.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: canonicalJob,
      authContext,
      applicationId,
      answers: { workAuth: 'Authorized' },
    });

    structuredPackage = preparedResult;
    assert.strictEqual(structuredPackage.applicationId, applicationId, 'Must reuse the exact same application ID');
    assert.strictEqual(structuredPackage.packageVersion, 2, 'Version must increment to 2');
    assert.strictEqual(structuredPackage.lifecycleAction, 'UPDATED', 'Lifecycle action must be UPDATED');
    assert.strictEqual(structuredPackage.generationContractVersion, RESUME_GENERATION_CONTRACT_VERSION);
    assert.strictEqual(structuredPackage.structuredResumeSchemaVersion, DEFAULT_STRUCTURED_RESUME_SCHEMA_VERSION);
    assert.notStrictEqual(structuredPackage.packageHash, legacyPackage.packageHash, 'Hash must differ from legacy');
  });

  // ---------------------------------------------------------------------------
  // STEP 6: Verify legacy package row archived, not deleted
  // ---------------------------------------------------------------------------
  it('Step 6: Verify legacy package row is archived and not deleted', async () => {
    const rows = await db
      .select()
      .from(applicationPackages)
      .where(eq(applicationPackages.applicationId, applicationId));

    assert.strictEqual(rows.length, 2, 'Exactly 2 package versions must exist in the database');

    const v1Row = rows.find((r) => r.version === 1);
    const v2Row = rows.find((r) => r.version === 2);

    assert.ok(v1Row, 'Version 1 must exist');
    assert.strictEqual(v1Row.lifecycleState, 'ARCHIVED', 'Version 1 must be ARCHIVED');
    assert.strictEqual(v1Row.packageHash, legacyPackage.packageHash);

    assert.ok(v2Row, 'Version 2 must exist');
    assert.strictEqual(v2Row.lifecycleState, 'CURRENT', 'Version 2 must be CURRENT');
    assert.strictEqual(v2Row.packageHash, structuredPackage.packageHash);
  });

  // ---------------------------------------------------------------------------
  // STEP 7: Generate handoff kit for structured package -> new PDF generated
  // ---------------------------------------------------------------------------
  it('Step 7: Structured package generates new PDF and does NOT reuse legacy artifact', async () => {
    structuredHandoffKit = await handoffService.buildApplicationHandoffKit({
      tenantId,
      userId,
      candidateId,
      applicationPackage: structuredPackage,
      applicationId,
    });

    assert.ok(structuredHandoffKit, 'Must produce structured handoff kit');
    assert.strictEqual(structuredHandoffKit.generationContractVersion, RESUME_GENERATION_CONTRACT_VERSION);
    assert.strictEqual(structuredHandoffKit.structuredResumeSchemaVersion, DEFAULT_STRUCTURED_RESUME_SCHEMA_VERSION);
    assert.strictEqual(structuredHandoffKit.packageHash, structuredPackage.packageHash);

    structuredResumeStorageKey = structuredHandoffKit.resume.storageKey;
    assert.ok(structuredResumeStorageKey, 'Must have structured resume storage key');
    assert.notStrictEqual(
      structuredResumeStorageKey,
      legacyResumeStorageKey,
      'Structured PDF storage key must be different from legacy PDF storage key (no reuse)'
    );
  });

  // ---------------------------------------------------------------------------
  // STEP 8: Prepare structured package again -> version 2, isReused: true
  // ---------------------------------------------------------------------------
  it('Step 8: Re-preparing identical structured package reuses version 2', async () => {
    const repeatResult = await workflowService.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: canonicalJob,
      authContext,
      applicationId,
      answers: { workAuth: 'Authorized' },
    });

    assert.strictEqual(repeatResult.applicationId, applicationId);
    assert.strictEqual(repeatResult.packageVersion, 2, 'Version must remain 2');
    assert.strictEqual(repeatResult.lifecycleAction, 'REUSED', 'Lifecycle action must be REUSED');
    assert.strictEqual(repeatResult.packageHash, structuredPackage.packageHash);
  });

  // ---------------------------------------------------------------------------
  // STEP 9: Generate handoff kit again -> structured artifact reused
  // ---------------------------------------------------------------------------
  it('Step 9: Handoff kit generation reuses existing structured artifact', async () => {
    const repeatHandoffKit = await handoffService.buildApplicationHandoffKit({
      tenantId,
      userId,
      candidateId,
      applicationPackage: structuredPackage,
      applicationId,
    });

    assert.strictEqual(repeatHandoffKit.packageHash, structuredPackage.packageHash);
    assert.strictEqual(repeatHandoffKit.generationContractVersion, RESUME_GENERATION_CONTRACT_VERSION);
    assert.strictEqual(
      repeatHandoffKit.resume.storageKey,
      structuredResumeStorageKey,
      'Structured artifact storageKey must be reused identically'
    );
  });

  // ---------------------------------------------------------------------------
  // STEP 10: Verify application package history contains v1 (ARCHIVED) & v2 (CURRENT)
  // ---------------------------------------------------------------------------
  it('Step 10: Package history contains version 1 (ARCHIVED) and version 2 (CURRENT)', async () => {
    const history = await trackingService.listApplicationPackages(authContext, applicationId);

    assert.strictEqual(history.length, 2, 'Package history must contain exactly 2 versions');

    const v2 = history.find((p) => p.version === 2);
    const v1 = history.find((p) => p.version === 1);

    assert.ok(v2, 'Version 2 must be present in history');
    assert.strictEqual(v2.lifecycleState, 'CURRENT');
    assert.strictEqual(v2.generationContractVersion, 'P16-001F');

    assert.ok(v1, 'Version 1 must be present in history');
    assert.strictEqual(v1.lifecycleState, 'ARCHIVED');
    assert.strictEqual(v1.generationContractVersion, 'LEGACY');
  });
});
