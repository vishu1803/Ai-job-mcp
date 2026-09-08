/**
 * @file P15-002 Batch 1 regression tests.
 *
 * Covers:
 * 1. Submitted-status protection across EVERY authoritative protected status
 *    (APPLIED, SCREENING, INTERVIEWING, OFFER_RECEIVED, OFFER_ACCEPTED) and
 *    proof that SAVED remains editable/preparable.
 * 2. Zero-fabrication: authoritative fit-analysis failure returns an explicit
 *    error with NO score/grade/recommendation payload; successful and low-fit
 *    authoritative analyses pass through real values.
 * 3. CORS origin allowlist: allowed web-app origin, configured extension
 *    origin, unknown origin rejected, credentialed behavior correct.
 * 4. Cross-candidate package read scoping: candidate A cannot read candidate
 *    B's package via validate/preview; same candidate + tenant still works;
 *    cross-tenant remains denied.
 * 5. Employment-type word-boundary semantics (shared helper).
 * 6. Extension/backend status-list drift guard.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  jobApplications,
  applicationPackages,
} from '../../src/db/schema.js';
import { createSession } from '../../src/security/session.service.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { ApplicationTrackingService } from '../../src/services/application-tracking.service.js';
import {
  SUBMITTED_APPLICATION_STATUSES,
  isSubmittedApplicationStatus,
  isSubmittedApplication,
} from '../../src/domain/career/application-status.constants.js';
import {
  buildExtensionAllowedOrigins,
  isAllowedExtensionOrigin,
} from '../../src/security/cors-allowlist.js';
import { classifyEmploymentType } from '../../extension/job-detection/employment-type.js';
import { SUBMITTED_APPLICATION_STATUSES as EXTENSION_STATUSES } from '../../extension/lib/application-status.constants.js';

// The JobApplicationWorkflowService dependency used by buildApp in tests.
let forcedFitError = null;

describe('P15-002 Batch 1: Security & Correctness Hardening', () => {
  let app;
  const createdTenantIds = [];

  let _tenantA;
  let userA;
  let _candidateA;
  let sessionA;

  // Second candidate in the SAME tenant (cross-candidate scoping target)
  let userA2;
  let _candidateA2;
  let sessionA2;

  // Second tenant (cross-tenant target)
  let sessionB;

  let workflowService;
  let trackingService;

  before(async () => {
    workflowService = new JobApplicationWorkflowService({ database: db });
    trackingService = new ApplicationTrackingService({ database: db });

    app = buildApp({
      db,
      jobApplicationWorkflowService: workflowService,
      applicationTrackingService: trackingService,
      extensionAllowedOriginsOverride: null,
      // Deterministic stub for the authoritative fit-analysis tool so tests can
      // force success, low-fit, and failure outcomes.
      careerReadToolsOverride: {
        handleAnalyzeJobFit: async (_ctx, params) => {
          if (forcedFitError) {
            throw new Error(forcedFitError);
          }
          const isLowFit = String(params?.jobTitle || '').includes('Nuclear Physicist');
          return {
            structuredData: {
              overallFit: isLowFit
                ? { atsScore: 12, fitGrade: 'F', recommendation: 'NO_FIT' }
                : { atsScore: 78, fitGrade: 'A', recommendation: 'STRONG_FIT' },
              matches: [],
              partialMatches: [],
              missingRequirements: [],
              hardBlockers: [],
            },
          };
        },
      },
    });
    await app.ready();

    // ---- Tenant A / candidate A (primary) ----
    const tenantAId = crypto.randomUUID();
    createdTenantIds.push(tenantAId);
    [_tenantA] = await db
      .insert(tenants)
      .values({ id: tenantAId, name: 'P15-002 Tenant A', slug: `p15a-${Date.now()}`, tier: 'PRO' })
      .returning();

    const userAId = crypto.randomUUID();
    [userA] = await db
      .insert(users)
      .values({
        id: userAId,
        tenantId: tenantAId,
        email: `p15a-${Date.now()}@example.test`,
        displayName: 'Alice A',
        role: 'MEMBER',
        status: 'ACTIVE',
      })
      .returning();

    const candidateAId = crypto.randomUUID();
    [_candidateA] = await db
      .insert(candidates)
      .values({
        id: candidateAId,
        tenantId: tenantAId,
        userId: userAId,
        displayName: 'Alice A',
        canonicalEmail: userA.email,
        status: 'ACTIVE',
        profileMetadata: {
          userCustom: {},
          systemInferred: { onboardingState: 'COMPLETED' },
          resumeData: {
            identity: { fullName: 'Alice A', email: userA.email, phone: '+1-555-0101' },
            skills: ['Node.js', 'PostgreSQL'],
          },
        },
      })
      .returning();

    sessionA = await createSession(db, { userId: userAId, tenantId: tenantAId });

    // ---- Candidate A2: second user in the SAME tenant ----
    const userA2Id = crypto.randomUUID();
    [userA2] = await db
      .insert(users)
      .values({
        id: userA2Id,
        tenantId: tenantAId,
        email: `p15a2-${Date.now()}@example.test`,
        displayName: 'Alice A2',
        role: 'MEMBER',
        status: 'ACTIVE',
      })
      .returning();

    const candidateA2Id = crypto.randomUUID();
    [_candidateA2] = await db
      .insert(candidates)
      .values({
        id: candidateA2Id,
        tenantId: tenantAId,
        userId: userA2Id,
        displayName: 'Alice A2',
        canonicalEmail: userA2.email,
        status: 'ACTIVE',
        profileMetadata: { userCustom: {}, systemInferred: { onboardingState: 'REGISTERED' } },
      })
      .returning();

    sessionA2 = await createSession(db, { userId: userA2Id, tenantId: tenantAId });

    // ---- Tenant B (cross-tenant) ----
    const tenantBId = crypto.randomUUID();
    createdTenantIds.push(tenantBId);
    await db
      .insert(tenants)
      .values({ id: tenantBId, name: 'P15-002 Tenant B', slug: `p15b-${Date.now()}`, tier: 'FREE' });

    const userBId = crypto.randomUUID();
    await db.insert(users).values({
      id: userBId,
      tenantId: tenantBId,
      email: `p15b-${Date.now()}@example.test`,
      displayName: 'Bob B',
      role: 'MEMBER',
      status: 'ACTIVE',
    });
    await db.insert(candidates).values({
      id: crypto.randomUUID(),
      tenantId: tenantBId,
      userId: userBId,
      displayName: 'Bob B',
      status: 'ACTIVE',
      profileMetadata: { userCustom: {}, systemInferred: { onboardingState: 'REGISTERED' } },
    });

    sessionB = await createSession(db, { userId: userBId, tenantId: tenantBId });
  });

  after(async () => {
    try {
      if (createdTenantIds.length > 0) {
        await db.delete(jobApplications).where(inArray(jobApplications.tenantId, createdTenantIds));
        await db.delete(applicationPackages).where(inArray(applicationPackages.tenantId, createdTenantIds));
        await db.delete(candidates).where(inArray(candidates.tenantId, createdTenantIds));
        await db.delete(users).where(inArray(users.tenantId, createdTenantIds));
        await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
      }
      if (app) await app.close();
      await closeDatabase();
    } catch {
      /* ignore teardown */
    }
  });

  // =========================================================================
  // Item 1: Submitted-status protection (every authoritative status)
  // =========================================================================
  describe('Item 1: Submitted-status protection', () => {
    let preparedAppId;

    before(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/extension/prepare-handoff',
        headers: { authorization: `Bearer ${sessionA.rawToken}` },
        payload: {
          job: {
            sourceUrl: 'https://boards.greenhouse.io/p15two/jobs/100',
            provider: 'GREENHOUSE',
            title: 'Protection Probe Engineer',
            company: 'ProbeCo',
            description: 'Node.js and PostgreSQL engineering for protection probes.',
          },
        },
      });
      assert.equal(res.statusCode, 200);
      preparedAppId = JSON.parse(res.payload).applicationId;
    });

    for (const status of SUBMITTED_APPLICATION_STATUSES) {
      it(`protects application in status ${status} (409 APPLICATION_ALREADY_SUBMITTED)`, async () => {
        await db
          .update(jobApplications)
          .set({ status, appliedAt: new Date() })
          .where(eq(jobApplications.id, preparedAppId));

        const res = await app.inject({
          method: 'POST',
          url: '/api/extension/prepare-handoff',
          headers: { authorization: `Bearer ${sessionA.rawToken}` },
          payload: {
            applicationId: preparedAppId,
            job: {
              sourceUrl: 'https://boards.greenhouse.io/p15two/jobs/100',
              title: 'Protection Probe Engineer',
              company: 'ProbeCo',
              description: 'Mutated description should be rejected.',
            },
          },
        });

        assert.equal(res.statusCode, 409, `status ${status} must be protected`);
        const json = JSON.parse(res.payload);
        assert.equal(json.code, 'APPLICATION_ALREADY_SUBMITTED');

        // analyze-job must also report isSubmitted for this status
        const analyzeRes = await app.inject({
          method: 'POST',
          url: '/api/extension/analyze-job',
          headers: { authorization: `Bearer ${sessionA.rawToken}` },
          payload: {
            job: {
              sourceUrl: 'https://boards.greenhouse.io/p15two/jobs/100',
              provider: 'GREENHOUSE',
              title: 'Protection Probe Engineer',
              company: 'ProbeCo',
              description: 'Node.js and PostgreSQL engineering for protection probes.',
            },
          },
        });
        assert.equal(analyzeRes.statusCode, 200);
        assert.equal(JSON.parse(analyzeRes.payload).isSubmitted, true, `analyze-job isSubmitted for ${status}`);
      });
    }

    it('keeps SAVED applications editable/preparable (no 409)', async () => {
      await db
        .update(jobApplications)
        .set({ status: 'SAVED', appliedAt: null })
        .where(eq(jobApplications.id, preparedAppId));

      const res = await app.inject({
        method: 'POST',
        url: '/api/extension/prepare-handoff',
        headers: { authorization: `Bearer ${sessionA.rawToken}` },
        payload: {
          applicationId: preparedAppId,
          job: {
            sourceUrl: 'https://boards.greenhouse.io/p15two/jobs/100',
            title: 'Protection Probe Engineer',
            company: 'ProbeCo',
            description: 'Node.js and PostgreSQL engineering for protection probes.',
          },
        },
      });

      assert.equal(res.statusCode, 200);
      assert.equal(JSON.parse(res.payload).lifecycleAction, 'REUSED');
    });

    it('does NOT treat terminal inactive statuses as submitted', () => {
      assert.equal(isSubmittedApplicationStatus('REJECTED'), false);
      assert.equal(isSubmittedApplicationStatus('WITHDRAWN'), false);
      assert.equal(isSubmittedApplicationStatus('ARCHIVED'), false);
      assert.equal(isSubmittedApplicationStatus('SAVED'), false);
      assert.equal(isSubmittedApplicationStatus(null), false);
      assert.equal(isSubmittedApplicationStatus(undefined), false);
    });

    it('isSubmittedApplication honors appliedAt and externalSubmissionState', () => {
      assert.equal(isSubmittedApplication({ status: 'SAVED', appliedAt: new Date() }), true);
      assert.equal(
        isSubmittedApplication({ status: 'SAVED', appliedAt: null, metadata: { externalSubmissionState: 'SUBMITTED' } }),
        true
      );
      assert.equal(isSubmittedApplication({ status: 'SAVED', appliedAt: null, metadata: {} }), false);
      assert.equal(isSubmittedApplication(null), false);
    });
  });

  // =========================================================================
  // Item 2: Zero-fabrication for analyze-job
  // =========================================================================
  describe('Item 2: Zero-fabrication analyze-job', () => {
    const baseJob = {
      sourceUrl: 'https://boards.greenhouse.io/p15two/jobs/200',
      provider: 'GREENHOUSE',
      company: 'FitCo',
      description: 'TypeScript, Node.js and PostgreSQL product engineering role.',
    };

    it('passes through actual authoritative score/grade on success', async () => {
      forcedFitError = null;
      const res = await app.inject({
        method: 'POST',
        url: '/api/extension/analyze-job',
        headers: { authorization: `Bearer ${sessionA.rawToken}` },
        payload: { job: { ...baseJob, title: 'Senior Platform Engineer' } },
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      assert.equal(json.fitAnalysis.score, 78);
      assert.equal(json.fitAnalysis.grade, 'A');
      assert.equal(json.fitAnalysis.recommendation, 'STRONG_FIT');
    });

    it('passes through actual LOW-FIT authoritative result (not converted to success)', async () => {
      forcedFitError = null;
      const res = await app.inject({
        method: 'POST',
        url: '/api/extension/analyze-job',
        headers: { authorization: `Bearer ${sessionA.rawToken}` },
        payload: { job: { ...baseJob, title: 'Nuclear Physicist Lead' } },
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      assert.equal(json.fitAnalysis.score, 12);
      assert.equal(json.fitAnalysis.grade, 'F');
      assert.equal(json.fitAnalysis.recommendation, 'NO_FIT');
    });

    it('returns explicit 503 ANALYSIS_UNAVAILABLE with NO fabricated score/grade on service failure', async () => {
      forcedFitError = 'LLM provider unreachable';
      try {
        const res = await app.inject({
          method: 'POST',
          url: '/api/extension/analyze-job',
          headers: { authorization: `Bearer ${sessionA.rawToken}` },
          payload: { job: { ...baseJob, title: 'Senior Platform Engineer' } },
        });

        assert.equal(res.statusCode, 503);
        const json = JSON.parse(res.payload);
        assert.equal(json.code, 'ANALYSIS_UNAVAILABLE');
        assert.ok(json.message);
        // The critical zero-fabrication assertions:
        assert.equal(json.fitAnalysis, null);
        assert.equal(json.fitScore, undefined);
        assert.equal(json.fitGrade, undefined);
        assert.ok(!('score' in (json.fitAnalysis || {})));
      } finally {
        forcedFitError = null;
      }
    });
  });

  // =========================================================================
  // Item 3: CORS origin allowlist
  // =========================================================================
  describe('Item 3: CORS origin allowlist', () => {
    it('allows the configured web-app origin (APP_URL)', () => {
      const origins = buildExtensionAllowedOrigins({
        APP_URL: 'https://aicareershub.tech',
        EXTENSION_ALLOWED_ORIGINS: '',
        NODE_ENV: 'production',
      });
      assert.ok(isAllowedExtensionOrigin('https://aicareershub.tech', origins));
    });

    it('allows explicitly configured chrome-extension origins and rejects unknown ones', () => {
      const origins = buildExtensionAllowedOrigins({
        APP_URL: 'https://aicareershub.tech',
        EXTENSION_ALLOWED_ORIGINS: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
        NODE_ENV: 'production',
      });
      assert.ok(isAllowedExtensionOrigin('chrome-extension://abcdefghijklmnopabcdefghijklmnop', origins));
      assert.equal(isAllowedExtensionOrigin('chrome-extension://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', origins), false);
      assert.equal(isAllowedExtensionOrigin('https://evil-localhost.com', origins), false);
    });

    it('rejects unknown origins and never honors wildcards', () => {
      const origins = buildExtensionAllowedOrigins({
        APP_URL: 'https://aicareershub.tech',
        EXTENSION_ALLOWED_ORIGINS: '*, https://allowed.example.com',
        NODE_ENV: 'production',
      });
      assert.equal(isAllowedExtensionOrigin('https://unknown.example.com', origins), false);
      assert.equal(isAllowedExtensionOrigin('*', origins), false);
      assert.equal(isAllowedExtensionOrigin(null, origins), false);
      assert.ok(isAllowedExtensionOrigin('https://allowed.example.com', origins));
    });

    it('allows loopback dev origins only outside production', () => {
      const dev = buildExtensionAllowedOrigins({
        APP_URL: 'http://localhost:3000',
        EXTENSION_ALLOWED_ORIGINS: '',
        NODE_ENV: 'development',
      });
      assert.ok(isAllowedExtensionOrigin('http://localhost:3000', dev));

      const prod = buildExtensionAllowedOrigins({
        APP_URL: 'https://aicareershub.tech',
        EXTENSION_ALLOWED_ORIGINS: '',
        NODE_ENV: 'production',
      });
      assert.equal(isAllowedExtensionOrigin('http://localhost:3000', prod), false);
    });

    it('emits CORS headers for allowed origin and none for unknown origin (live)', async () => {
      const resAllowed = await app.inject({
        method: 'OPTIONS',
        url: '/api/extension/session',
        headers: { origin: 'http://localhost:3000' },
      });
      assert.equal(resAllowed.headers['access-control-allow-origin'], 'http://localhost:3000');
      assert.equal(resAllowed.headers['access-control-allow-credentials'], 'true');

      const resUnknown = await app.inject({
        method: 'GET',
        url: '/api/extension/session',
        headers: { origin: 'https://evil-localhost.com' },
      });
      assert.equal(resUnknown.headers['access-control-allow-origin'], undefined);

      // Credentialed request from an allowed origin still authenticates
      const resAuthed = await app.inject({
        method: 'GET',
        url: '/api/extension/session',
        headers: { origin: 'http://localhost:3000' },
        cookies: { career_hub_session: sessionA.rawToken },
      });
      assert.equal(resAuthed.statusCode, 200);
      assert.equal(JSON.parse(resAuthed.payload).authenticated, true);
    });
  });

  // =========================================================================
  // Item 4: Cross-candidate package read scoping
  // =========================================================================
  describe('Item 4: Cross-candidate package read scoping', () => {
    let scopedAppId;
    let scopedPkgHash;

    before(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/extension/prepare-handoff',
        headers: { authorization: `Bearer ${sessionA.rawToken}` },
        payload: {
          job: {
            sourceUrl: 'https://boards.greenhouse.io/p15two/jobs/300',
            provider: 'GREENHOUSE',
            title: 'Scoping Probe Engineer',
            company: 'ScopeCo',
            description: 'Node.js and PostgreSQL engineering for scoping probes.',
          },
        },
      });
      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      scopedAppId = json.applicationId;
      scopedPkgHash = json.packageHash;
    });

    it('same candidate + same tenant can read the package (validate + preview)', async () => {
      const valRes = await app.inject({
        method: 'POST',
        url: '/api/extension/validate-package',
        headers: { authorization: `Bearer ${sessionA.rawToken}` },
        payload: { applicationId: scopedAppId, packageHash: scopedPkgHash },
      });
      assert.equal(valRes.statusCode, 200);

      const prevRes = await app.inject({
        method: 'POST',
        url: '/api/extension/preview-package',
        headers: { authorization: `Bearer ${sessionA.rawToken}` },
        payload: { applicationId: scopedAppId, packageHash: scopedPkgHash },
      });
      assert.equal(prevRes.statusCode, 200);
    });

    it('candidate A2 (same tenant, different candidate) CANNOT read candidate A package', async () => {
      const valRes = await app.inject({
        method: 'POST',
        url: '/api/extension/validate-package',
        headers: { authorization: `Bearer ${sessionA2.rawToken}` },
        payload: { applicationId: scopedAppId, packageHash: scopedPkgHash },
      });
      assert.equal(valRes.statusCode, 404);

      const prevRes = await app.inject({
        method: 'POST',
        url: '/api/extension/preview-package',
        headers: { authorization: `Bearer ${sessionA2.rawToken}` },
        payload: { applicationId: scopedAppId, packageHash: scopedPkgHash },
      });
      assert.equal(prevRes.statusCode, 404);
    });

    it('cross-tenant remains denied (404)', async () => {
      const valRes = await app.inject({
        method: 'POST',
        url: '/api/extension/validate-package',
        headers: { authorization: `Bearer ${sessionB.rawToken}` },
        payload: { applicationId: scopedAppId, packageHash: scopedPkgHash },
      });
      assert.equal(valRes.statusCode, 404);
    });
  });

  // =========================================================================
  // Item 5: Employment-type word boundaries
  // =========================================================================
  describe('Item 5: Employment-type word boundaries', () => {
    it('classifies Intern and Internship as INTERN (preserved semantics)', () => {
      assert.equal(classifyEmploymentType('Hiring an intern for the summer'), 'INTERN');
      assert.equal(classifyEmploymentType('This is a 12-week internship program'), 'INTERN');
    });

    it('does NOT classify Internal / International / internet as INTERN', () => {
      assert.equal(classifyEmploymentType('Internal tools engineer'), 'FULL_TIME');
      assert.equal(classifyEmploymentType('International expansion role'), 'FULL_TIME');
      assert.equal(classifyEmploymentType('Build internet-scale systems'), 'FULL_TIME');
    });

    it('classifies contract variants as CONTRACT', () => {
      assert.equal(classifyEmploymentType('6-month contract role'), 'CONTRACT');
      assert.equal(classifyEmploymentType('Contractor position available'), 'CONTRACT');
      assert.equal(classifyEmploymentType('Contracting engagement'), 'CONTRACT');
    });

    it('does NOT classify contradictory / unrelated as CONTRACT', () => {
      assert.equal(classifyEmploymentType('Work on contracts database schema'), 'FULL_TIME');
    });

    it('defaults to FULL_TIME for empty or neutral text', () => {
      assert.equal(classifyEmploymentType(''), 'FULL_TIME');
      assert.equal(classifyEmploymentType(null), 'FULL_TIME');
      assert.equal(classifyEmploymentType('Build great products'), 'FULL_TIME');
    });

    it('adapter payloads use word-boundary classification (regression for live Cloudflare INTERN bug)', () => {
      // Live bug evidence: "internet" appeared in the Cloudflare description and
      // the principal role was classified INTERN.
      const text =
        'We help build a better Internet. Principal engineer for data infrastructure. 8+ years experience.';
      assert.equal(classifyEmploymentType(text), 'FULL_TIME');
    });
  });

  // =========================================================================
  // Item 6 (part A): Drift guard between backend authority and extension mirror
  // =========================================================================
  describe('Item 6: Extension/backend status-list drift guard', () => {
    it('extension mirror matches backend authority exactly', () => {
      assert.deepEqual([...EXTENSION_STATUSES], [...SUBMITTED_APPLICATION_STATUSES]);
    });
  });

  // =========================================================================
  // Batch 2 Item 2: Artifact-hash verification on download routes
  // =========================================================================
  describe('Batch 2 Item 2: Artifact-hash verification', () => {
    let hashAppId;
    let hashPkgHash;
    let otherAppPkgHash;

    before(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/extension/prepare-handoff',
        headers: { authorization: `Bearer ${sessionA.rawToken}` },
        payload: {
          job: {
            sourceUrl: 'https://boards.greenhouse.io/p15two/jobs/400',
            provider: 'GREENHOUSE',
            title: 'Hash Probe Engineer',
            company: 'HashCo',
            description: 'Node.js and PostgreSQL engineering for hash probes.',
          },
        },
      });
      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      hashAppId = json.applicationId;
      hashPkgHash = json.packageHash;
      assert.ok(hashPkgHash, 'prepare-handoff returned a packageHash');

      // A second, distinct application/package for cross-application checks.
      const resOther = await app.inject({
        method: 'POST',
        url: '/api/extension/prepare-handoff',
        headers: { authorization: `Bearer ${sessionA.rawToken}` },
        payload: {
          job: {
            sourceUrl: 'https://boards.greenhouse.io/p15two/jobs/401',
            provider: 'GREENHOUSE',
            title: 'Other Package Engineer',
            company: 'HashCo',
            description: 'Node.js and PostgreSQL engineering for the other package.',
          },
        },
      });
      assert.equal(resOther.statusCode, 200);
      otherAppPkgHash = JSON.parse(resOther.payload).packageHash;
      assert.notEqual(otherAppPkgHash, hashPkgHash);
    });

    it('valid packageHash still downloads (behavior preserved)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/applications/${hashAppId}/artifacts/bundle/download?packageHash=${hashPkgHash}`,
        cookies: { career_hub_session: sessionA.rawToken },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['x-package-hash'], hashPkgHash);
    });

    it('unknown packageHash is rejected with 404 PACKAGE_HASH_NOT_FOUND (bundle)', async () => {
      const bogus = `deadbeef${'0'.repeat(48)}`;
      const res = await app.inject({
        method: 'GET',
        url: `/api/applications/${hashAppId}/artifacts/bundle/download?packageHash=${bogus}`,
        cookies: { career_hub_session: sessionA.rawToken },
      });
      assert.equal(res.statusCode, 404);
      const json = JSON.parse(res.payload);
      assert.equal(json.code, 'PACKAGE_HASH_NOT_FOUND');
    });

    it('unknown packageHash is rejected with 404 (individual artifact)', async () => {
      const bogus = `feedface${'0'.repeat(48)}`;
      const res = await app.inject({
        method: 'GET',
        url: `/api/applications/${hashAppId}/artifacts/resume/download?packageHash=${bogus}`,
        cookies: { career_hub_session: sessionA.rawToken },
      });
      assert.equal(res.statusCode, 404);
      const json = JSON.parse(res.payload);
      assert.equal(json.code, 'PACKAGE_HASH_NOT_FOUND');
    });

    it('a packageHash from a different application is rejected (no substitution)', async () => {
      // Cross-application substitution: a real hash belonging to a different
      // application must not unlock this application's artifacts.
      const res = await app.inject({
        method: 'GET',
        url: `/api/applications/${hashAppId}/artifacts/bundle/download?packageHash=${otherAppPkgHash}`,
        cookies: { career_hub_session: sessionA.rawToken },
      });
      assert.equal(res.statusCode, 404);
      const json = JSON.parse(res.payload);
      assert.equal(json.code, 'PACKAGE_HASH_NOT_FOUND');
    });
  });

  // =========================================================================
  // Batch 2 Item 3: No raw error leakage in 500 responses
  // =========================================================================
  describe('Batch 2 Item 3: Raw 500 error leakage', () => {
    it('500 responses from extension routes carry generic messages only', async () => {
      // Force a server error inside prepare-handoff by breaking the workflow
      // service dependency.
      const brokenApp = buildApp({
        db,
        jobApplicationWorkflowService: {
          prepareOrReuseApplicationPackage: async () => {
            throw new Error('ECONNREFUSED 10.0.0.42:5432 - internal db host pg-internal.db.local');
          },
        },
        applicationTrackingService: trackingService,
      });
      await brokenApp.ready();

      const res = await brokenApp.inject({
        method: 'POST',
        url: '/api/extension/prepare-handoff',
        headers: { authorization: `Bearer ${sessionA.rawToken}` },
        payload: {
          job: {
            sourceUrl: 'https://boards.greenhouse.io/p15two/jobs/900',
            provider: 'GREENHOUSE',
            title: 'Leak Probe Engineer',
            company: 'LeakCo',
            description: 'Probe for raw error leakage.',
          },
        },
      });
      assert.equal(res.statusCode, 500);
      const json = JSON.parse(res.payload);
      assert.equal(json.code, 'PREPARE_HANDOFF_FAILED');
      assert.ok(!json.message?.includes('ECONNREFUSED'), 'raw error must not leak');
      assert.ok(!json.message?.includes('pg-internal'), 'internal host must not leak');
      assert.ok(!JSON.stringify(json).includes('ECONNREFUSED'), 'raw error must not leak anywhere in body');
    });
  });
});