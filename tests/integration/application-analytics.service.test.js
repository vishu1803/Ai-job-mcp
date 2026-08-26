/**
 * @file Integration Tests: Application Analytics Service (Phase 12 / P12-004)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  jobApplications,
  applicationStages,
} from '../../src/db/schema.js';
import { ApplicationAnalyticsService } from '../../src/services/application-analytics.service.js';
import { NotFoundError } from '../../src/errors/index.js';

describe('Application Analytics Service Integration Tests (P12-004)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');

  let tenantA;
  let userA;
  let candidateA;
  let contextA;

  let tenantB;
  let userB;
  let _candidateB;
  let contextB;

  let analyticsService;
  const createdTenantIds = [];

  before(async () => {
    analyticsService = new ApplicationAnalyticsService({ database: db });

    // 1. Tenant A
    const tidA = crypto.randomUUID();
    createdTenantIds.push(tidA);
    [tenantA] = await db
      .insert(tenants)
      .values({
        id: tidA,
        name: `Tenant A Analytics ${testRunId}`,
        slug: `tenant-a-analytics-${testRunId}`,
        tier: 'PRO',
      })
      .returning();

    const uidA = crypto.randomUUID();
    [userA] = await db
      .insert(users)
      .values({
        id: uidA,
        tenantId: tenantA.id,
        email: `alice-analytics-${testRunId}@example.com`,
        displayName: 'Alice Analytics',
        role: 'MEMBER',
        status: 'ACTIVE',
      })
      .returning();

    [candidateA] = await db
      .insert(candidates)
      .values({
        id: crypto.randomUUID(),
        tenantId: tenantA.id,
        userId: userA.id,
        displayName: 'Alice Analytics Candidate',
        headline: 'Analytics Specialist',
        status: 'ACTIVE',
      })
      .returning();

    contextA = {
      tenantId: tenantA.id,
      userId: userA.id,
      role: 'MEMBER',
    };

    // 2. Tenant B
    const tidB = crypto.randomUUID();
    createdTenantIds.push(tidB);
    [tenantB] = await db
      .insert(tenants)
      .values({
        id: tidB,
        name: `Tenant B Analytics ${testRunId}`,
        slug: `tenant-b-analytics-${testRunId}`,
        tier: 'FREE',
      })
      .returning();

    const uidB = crypto.randomUUID();
    [userB] = await db
      .insert(users)
      .values({
        id: uidB,
        tenantId: tenantB.id,
        email: `bob-analytics-${testRunId}@example.com`,
        displayName: 'Bob Analytics',
        role: 'MEMBER',
        status: 'ACTIVE',
      })
      .returning();

    [_candidateB] = await db
      .insert(candidates)
      .values({
        id: crypto.randomUUID(),
        tenantId: tenantB.id,
        userId: userB.id,
        displayName: 'Bob Analytics Candidate',
        headline: 'Frontend Engineer',
        status: 'ACTIVE',
      })
      .returning();

    contextB = {
      tenantId: tenantB.id,
      userId: userB.id,
      role: 'MEMBER',
    };

    // 3. Seed 8 Application Fixtures for Candidate A
    // App 1: Excellent fit, responded & interviewing
    const [app1] = await db
      .insert(jobApplications)
      .values({
        id: crypto.randomUUID(),
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        companyName: 'OpenAI',
        jobTitle: 'Research Engineer',
        status: 'INTERVIEWING',
        appliedAt: new Date(),
        atsFitSnapshot: { overallScore: 92.0, missingSkills: ['Kubernetes'] },
        parsedJobDescription: {
          requirements: [{ extractedValue: 'Kubernetes', category: 'TOOL' }],
        },
      })
      .returning();

    await db.insert(applicationStages).values({
      id: crypto.randomUUID(),
      tenantId: tenantA.id,
      applicationId: app1.id,
      stageType: 'TECHNICAL_ASSESSMENT',
      title: 'Take-home assessment',
      outcome: 'PASSED',
      orderIndex: 0,
    });

    // App 2: Excellent fit, offer accepted
    const [app2] = await db
      .insert(jobApplications)
      .values({
        id: crypto.randomUUID(),
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        companyName: 'Anthropic',
        jobTitle: 'Safety Engineer',
        status: 'OFFER_ACCEPTED',
        appliedAt: new Date(),
        atsFitSnapshot: { overallScore: 95.0, missingSkills: [] },
        parsedJobDescription: {
          requirements: [{ extractedValue: 'Python', category: 'LANGUAGE' }],
        },
      })
      .returning();

    await db.insert(applicationStages).values({
      id: crypto.randomUUID(),
      tenantId: tenantA.id,
      applicationId: app2.id,
      stageType: 'OFFER_NEGOTIATION',
      title: 'Offer discussion',
      outcome: 'PASSED',
      orderIndex: 0,
    });

    // App 3, 4, 5, 6, 7: Strong fit (75-80), APPLIED with recruiter screen
    for (let i = 3; i <= 7; i++) {
      const [app] = await db
        .insert(jobApplications)
        .values({
          id: crypto.randomUUID(),
          tenantId: tenantA.id,
          candidateId: candidateA.id,
          companyName: `Tech Co ${i}`,
          jobTitle: 'Backend Engineer',
          status: 'APPLIED',
          appliedAt: new Date(),
          atsFitSnapshot: { overallScore: 78.0, missingSkills: ['Kubernetes', 'Go'] },
          parsedJobDescription: {
            requirements: [
              { extractedValue: 'Kubernetes', category: 'TOOL' },
              { extractedValue: 'Go', category: 'LANGUAGE' },
            ],
          },
        })
        .returning();

      await db.insert(applicationStages).values({
        id: crypto.randomUUID(),
        tenantId: tenantA.id,
        applicationId: app.id,
        stageType: 'RECRUITER_SCREEN',
        title: 'Recruiter call',
        outcome: 'PASSED',
        orderIndex: 0,
      });
    }

    // App 8: Saved bookmark
    await db.insert(jobApplications).values({
      id: crypto.randomUUID(),
      tenantId: tenantA.id,
      candidateId: candidateA.id,
      companyName: 'Future Prospect Inc',
      jobTitle: 'VP of AI',
      status: 'SAVED',
      appliedAt: null,
      atsFitSnapshot: { overallScore: 88.0 },
    });
  });

  after(async () => {
    try {
      if (createdTenantIds.length > 0) {
        for (const tid of createdTenantIds) {
          await db.delete(applicationStages).where(eq(applicationStages.tenantId, tid));
          await db.delete(jobApplications).where(eq(jobApplications.tenantId, tid));
          await db.delete(candidates).where(eq(candidates.tenantId, tid));
          await db.delete(users).where(eq(users.tenantId, tid));
          await db.delete(tenants).where(eq(tenants.id, tid));
        }
      }
    } finally {
      await closeDatabase();
    }
  });

  describe('1. Multi-Tenant Sovereign Isolation', () => {
    it('Tenant B cannot access Tenant A candidate analytics (throws NotFoundError 404)', async () => {
      await assert.rejects(
        () => analyticsService.getCandidateAnalytics(contextB, candidateA.id),
        NotFoundError
      );
    });
  });

  describe('2. Comprehensive Candidate Analytics Summary', () => {
    it('computes accurate funnel metrics and response rates', async () => {
      const summary = await analyticsService.getCandidateAnalytics(contextA, candidateA.id);

      assert.strictEqual(summary.candidateId, candidateA.id);
      // Total portfolio: 8 apps (7 submitted + 1 saved)
      assert.strictEqual(summary.funnel.trackedPortfolioTotal, 8);
      assert.strictEqual(summary.funnel.submittedCount, 7);
      // All 7 submitted apps had interview stages -> 7 responded
      assert.strictEqual(summary.funnel.respondedCount, 7);
      assert.strictEqual(summary.funnel.acceptedCount, 1);
      assert.strictEqual(summary.funnel.observedResponseRate, 100.0);
      assert.strictEqual(summary.funnel.sampleSizeAdequate, true);
    });

    it('computes score progression correlation across bands with sample size checks', async () => {
      const correlation = await analyticsService.getScoreProgressionCorrelation(
        contextA,
        candidateA.id
      );

      // Strong band (Apps 3-7: score 78.0) -> total = 5 (adequate sample size)
      const strongBand = correlation.scoreBands.find((b) => b.bandLabel === 'STRONG');
      assert.strictEqual(strongBand.totalApplications, 5);
      assert.strictEqual(strongBand.respondedCount, 5);
      assert.strictEqual(strongBand.observedResponseRate, 100.0);
      assert.strictEqual(strongBand.sampleSizeAdequate, true);

      // Excellent band (Apps 1, 2: score 92, 95) -> total = 2 (N < 5 -> suppressed rate)
      const excelBand = correlation.scoreBands.find((b) => b.bandLabel === 'EXCELLENT');
      assert.strictEqual(excelBand.totalApplications, 2);
      assert.strictEqual(excelBand.observedResponseRate, null);
      assert.strictEqual(excelBand.sampleSizeAdequate, false);
      assert.strictEqual(excelBand.statisticalWarning, 'INSUFFICIENT_DATA');
    });

    it('computes skill gap frequencies with canonical slug normalization', async () => {
      const gapStats = await analyticsService.getSkillGapFrequency(contextA, candidateA.id);

      assert.ok(gapStats.items.length >= 1);
      const k8sGap = gapStats.items.find((i) => i.skillSlug === 'kubernetes');
      assert.ok(k8sGap);
      // Kubernetes was missing in 6 analyzed apps
      assert.strictEqual(k8sGap.gapInJobsCount, 6);
      assert.strictEqual(k8sGap.totalAnalyzedJobsCount, 8);
    });
  });
});
