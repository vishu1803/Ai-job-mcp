/**
 * @file Unit Tests for Resume Optimization Loop Service (Phase 23)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ResumeOptimizationLoopService } from '../../src/services/resume-optimization-loop.service.js';
import { atsSnapshotPersistenceService } from '../../src/services/ats-snapshot-persistence.service.js';

describe('Resume Optimization Loop Service (Phase 23)', () => {
  const service = new ResumeOptimizationLoopService();
  const mockContext = {
    tenantId: '11111111-1111-1111-1111-111111111111',
    candidateId: '22222222-2222-2222-2222-222222222222',
  };

  const sampleResume = `
David Kim
david.kim@example.com | (555) 321-7654 | Seattle, WA
https://github.com/davidkim | https://linkedin.com/in/davidkim

PROFESSIONAL SUMMARY
Backend Engineer with 5 years experience developing Go and Python services with PostgreSQL and Redis.

TECHNICAL SKILLS
Go, Python, PostgreSQL, Redis, Docker, Git, REST APIs, Linux

PROFESSIONAL EXPERIENCE
Backend Engineer | CloudWorks | Seattle, WA | 2021 - Present
- Built microservices in Go and PostgreSQL handling 10k req/sec.
- Containerized development workflows using Docker.

Junior Developer | WebApps Inc. | Bellevue, WA | 2019 - 2021
- Developed RESTful API endpoints using Python and Redis.

EDUCATION
Bachelor of Science in Computer Science | University of Washington | 2015 - 2019
`.trim();

  const targetJob = `
Senior Go Backend Engineer
We are seeking an experienced Go Backend Engineer to scale our distributed cloud backend.
Requirements:
- Strong hands-on proficiency in Go and PostgreSQL
- Experience containerizing applications with Docker
- Background developing high-throughput microservices
- Bachelor's degree in Computer Science or equivalent
`.trim();

  it('1. executes complete optimization cycle: feedback -> tailoring -> re-scoring', async () => {
    const result = await service.executeOptimizationCycle({
      context: mockContext,
      originalResumeText: sampleResume,
      jobDescription: targetJob,
    });

    assert.ok(result);
    assert.ok(result.before);
    assert.ok(result.after);
    assert.ok(result.deltas);
    assert.equal(result.hallucinationAuditPassed, true);
    assert.ok(result.optimizedResumeText.length > 100);

    // Verify scores are numbers between 0 and 100
    assert.ok(result.before.fitScore >= 0 && result.before.fitScore <= 100);
    assert.ok(result.after.fitScore >= 0 && result.after.fitScore <= 100);
    assert.ok(result.after.readinessScore >= 0 && result.after.readinessScore <= 100);

    // Verify monotonic stability or improvement
    assert.ok(result.deltas.readinessScoreDelta >= 0);
  });

  it('2. persists an ATS snapshot during the optimization cycle', async () => {
    const history = await atsSnapshotPersistenceService.getAtsSnapshotHistory({
      tenantId: mockContext.tenantId,
      candidateId: mockContext.candidateId,
    });

    assert.ok(history.totalSnapshots > 0);
    const latest = history.snapshots[0];
    assert.equal(latest.canonicalJobId, 'job-optimization-cycle');
    assert.ok(latest.summary.fitScore > 0);
  });

  it('3. rejects invalid or empty input parameters', async () => {
    await assert.rejects(
      async () => {
        await service.executeOptimizationCycle({
          context: mockContext,
          originalResumeText: '',
          jobDescription: targetJob,
        });
      },
      { name: 'ValidationError' }
    );

    await assert.rejects(
      async () => {
        await service.executeOptimizationCycle({
          context: mockContext,
          originalResumeText: sampleResume,
          jobDescription: '',
        });
      },
      { name: 'ValidationError' }
    );
  });
});
