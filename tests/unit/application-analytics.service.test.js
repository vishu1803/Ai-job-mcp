/**
 * @file Unit Tests: Application Analytics Service (Phase 12 / P12-004)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ApplicationAnalyticsService } from '../../src/services/application-analytics.service.js';
import { NotFoundError } from '../../src/errors/index.js';
import { NON_CAUSAL_DISCLAIMER } from '../../src/domain/career/application-analytics.schemas.js';

describe('Application Analytics Service Unit Tests (P12-004)', () => {
  const candidateId = 'a1111111-1111-4111-8111-111111111111';
  const tenantId = 't1111111-1111-4111-8111-111111111111';
  const validContext = { tenantId, userId: 'u111', role: 'MEMBER' };

  // Helper mock DB generator
  function createMockDb({ candidateExists = true, apps = [], stages = [] } = {}) {
    return {
      select: () => ({
        from: (table) => {
          const getData = () => {
            if (table.displayName || table.headline) {
              return candidateExists ? [{ id: candidateId, tenantId }] : [];
            }
            if (table.jobTitle || table.companyName) {
              return apps;
            }
            if (table.stageType || table.orderIndex) {
              return stages;
            }
            return [];
          };

          const createQueryBuilder = () => {
            const data = getData();
            const promise = Promise.resolve(data);
            return {
              where: () => createQueryBuilder(),
              limit: async () => data.slice(0, 1),
              then: (resolve, reject) => promise.then(resolve, reject),
              catch: (reject) => promise.catch(reject),
            };
          };

          return createQueryBuilder();
        },
      }),
    };
  }

  describe('1. Tenant Isolation & Context Verification', () => {
    it('throws NotFoundError when candidate does not belong to tenant', async () => {
      const mockDb = createMockDb({ candidateExists: false });
      const service = new ApplicationAnalyticsService({ database: mockDb });

      await assert.rejects(
        () => service.getCandidateAnalytics(validContext, candidateId),
        NotFoundError
      );
    });

    it('throws NotFoundError when tenant context is missing', async () => {
      const mockDb = createMockDb({ candidateExists: true });
      const service = new ApplicationAnalyticsService({ database: mockDb });

      await assert.rejects(() => service.getCandidateAnalytics({}, candidateId), NotFoundError);
    });
  });

  describe('2. Funnel & Response Rate Logic', () => {
    it('strictly excludes SAVED applications from submitted response rate denominator', async () => {
      const apps = [
        {
          id: 'app-1',
          tenantId,
          candidateId,
          status: 'SAVED',
          appliedAt: null,
          createdAt: new Date(),
          atsFitSnapshot: { overallScore: 90 },
        },
        {
          id: 'app-2',
          tenantId,
          candidateId,
          status: 'APPLIED',
          appliedAt: new Date(),
          createdAt: new Date(),
          atsFitSnapshot: { overallScore: 85 },
        },
        {
          id: 'app-3',
          tenantId,
          candidateId,
          status: 'SCREENING',
          appliedAt: new Date(),
          createdAt: new Date(),
          atsFitSnapshot: { overallScore: 92 },
        },
      ];

      const mockDb = createMockDb({ apps });
      const service = new ApplicationAnalyticsService({ database: mockDb });
      const result = await service.getCandidateAnalytics(validContext, candidateId);

      assert.strictEqual(result.funnel.trackedPortfolioTotal, 3);
      assert.strictEqual(result.funnel.submittedCount, 2);
      assert.strictEqual(result.funnel.respondedCount, 1);
    });

    it('excludes applications withdrawn before response from response denominator', async () => {
      const apps = [
        // 5 submitted & responded
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `app-resp-${i}`,
          tenantId,
          candidateId,
          status: 'INTERVIEWING',
          appliedAt: new Date(),
          createdAt: new Date(),
          atsFitSnapshot: { overallScore: 80 },
        })),
        // 5 submitted & no response
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `app-no-resp-${i}`,
          tenantId,
          candidateId,
          status: 'APPLIED',
          appliedAt: new Date(),
          createdAt: new Date(),
          atsFitSnapshot: { overallScore: 80 },
        })),
        // 2 withdrawn before response
        {
          id: 'app-withdrawn-1',
          tenantId,
          candidateId,
          status: 'WITHDRAWN',
          appliedAt: new Date(),
          createdAt: new Date(),
          atsFitSnapshot: { overallScore: 80 },
        },
        {
          id: 'app-withdrawn-2',
          tenantId,
          candidateId,
          status: 'WITHDRAWN',
          appliedAt: new Date(),
          createdAt: new Date(),
          atsFitSnapshot: { overallScore: 80 },
        },
      ];

      const mockDb = createMockDb({ apps });
      const service = new ApplicationAnalyticsService({ database: mockDb });
      const result = await service.getCandidateAnalytics(validContext, candidateId);

      // submitted = 12, withdrawnBeforeResponse = 2, effectiveDenom = 10, responded = 5 -> 50.0%
      assert.strictEqual(result.funnel.submittedCount, 12);
      assert.strictEqual(result.funnel.withdrawnBeforeResponseCount, 2);
      assert.strictEqual(result.funnel.respondedCount, 5);
      assert.strictEqual(result.funnel.observedResponseRate, 50.0);
      assert.strictEqual(result.funnel.sampleSizeAdequate, true);
    });

    it('preserves interview milestone for applications later rejected or archived', async () => {
      const apps = [
        {
          id: 'app-rej',
          tenantId,
          candidateId,
          status: 'REJECTED',
          appliedAt: new Date(),
          createdAt: new Date(),
        },
      ];
      const stages = [
        {
          id: 'stage-1',
          tenantId,
          applicationId: 'app-rej',
          stageType: 'ONSITE_LOOP',
          outcome: 'FAILED',
        },
      ];

      const mockDb = createMockDb({ apps, stages });
      const service = new ApplicationAnalyticsService({ database: mockDb });
      const result = await service.getCandidateAnalytics(validContext, candidateId);

      assert.strictEqual(result.funnel.submittedCount, 1);
      assert.strictEqual(result.funnel.respondedCount, 1);
      assert.strictEqual(result.funnel.interviewCount, 1);
    });
  });

  describe('3. Score Progression Correlation & Small-Sample Safety', () => {
    it('suppresses response rate when bucket sample size N < 5', async () => {
      const apps = [
        {
          id: 'app-1',
          tenantId,
          candidateId,
          status: 'SCREENING',
          appliedAt: new Date(),
          createdAt: new Date(),
          atsFitSnapshot: { overallScore: 95 },
        },
        {
          id: 'app-2',
          tenantId,
          candidateId,
          status: 'APPLIED',
          appliedAt: new Date(),
          createdAt: new Date(),
          atsFitSnapshot: { overallScore: 92 },
        },
      ];

      const mockDb = createMockDb({ apps });
      const service = new ApplicationAnalyticsService({ database: mockDb });
      const result = await service.getScoreProgressionCorrelation(validContext, candidateId);

      const excellentBand = result.scoreBands.find((b) => b.bandLabel === 'EXCELLENT');
      assert.strictEqual(excellentBand.totalApplications, 2);
      assert.strictEqual(excellentBand.observedResponseRate, null);
      assert.strictEqual(excellentBand.sampleSizeAdequate, false);
      assert.strictEqual(excellentBand.statisticalWarning, 'INSUFFICIENT_DATA');
    });

    it('handles UNSCORED applications explicitly without converting to 0.0', async () => {
      const apps = [
        {
          id: 'app-1',
          tenantId,
          candidateId,
          status: 'APPLIED',
          appliedAt: new Date(),
          createdAt: new Date(),
          atsFitSnapshot: null, // missing snapshot
        },
      ];

      const mockDb = createMockDb({ apps });
      const service = new ApplicationAnalyticsService({ database: mockDb });
      const result = await service.getScoreProgressionCorrelation(validContext, candidateId);

      const unscoredBand = result.scoreBands.find((b) => b.bandLabel === 'UNSCORED');
      const lowBand = result.scoreBands.find((b) => b.bandLabel === 'LOW');

      assert.strictEqual(unscoredBand.totalApplications, 1);
      assert.strictEqual(lowBand.totalApplications, 0);
      assert.strictEqual(result.totalUnscoredApplications, 1);
      assert.strictEqual(result.totalScoredApplications, 0);
    });

    it('places scores into deterministic inclusive/exclusive boundaries', async () => {
      const apps = [
        {
          id: 'a1',
          tenantId,
          candidateId,
          status: 'APPLIED',
          appliedAt: new Date(),
          createdAt: new Date(),
          atsFitSnapshot: { overallScore: 85.0 },
        }, // EXCELLENT
        {
          id: 'a2',
          tenantId,
          candidateId,
          status: 'APPLIED',
          appliedAt: new Date(),
          createdAt: new Date(),
          atsFitSnapshot: { overallScore: 84.9 },
        }, // STRONG
        {
          id: 'a3',
          tenantId,
          candidateId,
          status: 'APPLIED',
          appliedAt: new Date(),
          createdAt: new Date(),
          atsFitSnapshot: { overallScore: 70.0 },
        }, // STRONG
        {
          id: 'a4',
          tenantId,
          candidateId,
          status: 'APPLIED',
          appliedAt: new Date(),
          createdAt: new Date(),
          atsFitSnapshot: { overallScore: 69.9 },
        }, // MODERATE
        {
          id: 'a5',
          tenantId,
          candidateId,
          status: 'APPLIED',
          appliedAt: new Date(),
          createdAt: new Date(),
          atsFitSnapshot: { overallScore: 50.0 },
        }, // MODERATE
        {
          id: 'a6',
          tenantId,
          candidateId,
          status: 'APPLIED',
          appliedAt: new Date(),
          createdAt: new Date(),
          atsFitSnapshot: { overallScore: 49.9 },
        }, // LOW
      ];

      const mockDb = createMockDb({ apps });
      const service = new ApplicationAnalyticsService({ database: mockDb });
      const result = await service.getScoreProgressionCorrelation(validContext, candidateId);

      const excel = result.scoreBands.find((b) => b.bandLabel === 'EXCELLENT');
      const strong = result.scoreBands.find((b) => b.bandLabel === 'STRONG');
      const mod = result.scoreBands.find((b) => b.bandLabel === 'MODERATE');
      const low = result.scoreBands.find((b) => b.bandLabel === 'LOW');

      assert.strictEqual(excel.totalApplications, 1);
      assert.strictEqual(strong.totalApplications, 2);
      assert.strictEqual(mod.totalApplications, 2);
      assert.strictEqual(low.totalApplications, 1);
    });
  });

  describe('4. Skill Gap Frequency & Normalization', () => {
    it('normalizes skill aliases and computes target demand and gap rates', async () => {
      const apps = [
        {
          id: 'app-1',
          tenantId,
          candidateId,
          status: 'APPLIED',
          createdAt: new Date(),
          parsedJobDescription: {
            requirements: [{ extractedValue: 'Node.js', category: 'FRAMEWORK' }],
          },
          atsFitSnapshot: {
            missingSkills: ['Node.js', 'PostgreSQL'],
          },
        },
        {
          id: 'app-2',
          tenantId,
          candidateId,
          status: 'APPLIED',
          createdAt: new Date(),
          parsedJobDescription: {
            requirements: [{ extractedValue: 'nodejs', category: 'FRAMEWORK' }],
          },
          atsFitSnapshot: {
            missingSkills: ['node-js'],
          },
        },
      ];

      const mockDb = createMockDb({ apps });
      const service = new ApplicationAnalyticsService({ database: mockDb });
      const result = await service.getSkillGapFrequency(validContext, candidateId);

      assert.strictEqual(result.totalAnalyzedApplications, 2);
      const nodeGap = result.items.find((i) => i.skillSlug === 'node-js');
      assert.ok(nodeGap);
      assert.strictEqual(nodeGap.skillSlug, 'node-js');
      assert.strictEqual(nodeGap.demandedInJobsCount, 2);
      assert.strictEqual(nodeGap.gapInJobsCount, 2);
      assert.strictEqual(nodeGap.targetDemandFrequency, 100.0);
      assert.strictEqual(nodeGap.overallGapRate, 100.0);
    });
  });

  describe('5. Non-Causal Language & Privacy Guardrails', () => {
    it('includes non-causal statistical disclaimer on all outputs', async () => {
      const mockDb = createMockDb({ apps: [] });
      const service = new ApplicationAnalyticsService({ database: mockDb });
      const result = await service.getCandidateAnalytics(validContext, candidateId);

      assert.strictEqual(result.disclaimer, NON_CAUSAL_DISCLAIMER);
      assert.ok(result.disclaimer.includes('Correlation does not imply causation'));
    });
  });
});
