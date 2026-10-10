import { it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  AnalysisTimestampSchema,
  JobAnalysisSnapshotSchema,
  serializeJobAnalysisSnapshot,
} from '../../src/domain/career/analysis-snapshot.schemas.js';
import { JobAnalysisSnapshotService } from '../../src/services/job-analysis-snapshot.service.js';
import {
  canonicalPackageJson,
  computeApplicationPackageHash,
} from '../../src/domain/job/application-package-identity.js';

const instant = '2026-10-10T08:15:30.125Z';
const snapshot = {
  id: crypto.randomUUID(),
  tenantId: crypto.randomUUID(),
  candidateId: crypto.randomUUID(),
  canonicalJobId: 'JOB-PRD001-FIXTURE',
  jobContentHash: 'fixture-content-hash',
  analyzedAt: new Date(instant),
  normalizedJobUrl: null,
  overallFit: { score: 88, analyzedAt: new Date(instant) },
  matchAnalysis: {
    requirementMatches: [
      { evidence: [{ detectedAt: new Date(instant), excerpt: 'Fixture source' }] },
    ],
  },
  projectRankings: [{ projectId: 'fixture-project', score: 92 }],
  metadata: { custom: { text: 'unchanged', flag: false, value: 0, optional: null } },
};
const service = new JobAnalysisSnapshotService({ db: {} });

for (const timestamp of [
  new Date(instant),
  instant,
  '2026-10-10T13:45:30.125+05:30',
  '2026-10-10T04:15:30.125-04:00',
]) {
  it(`canonicalizes a valid timestamp (${String(timestamp)})`, () => {
    assert.equal(AnalysisTimestampSchema.parse(timestamp), instant);
  });
}
for (const timestamp of [
  new Date(NaN),
  'invalid',
  '2026-02-30T00:00:00Z',
  '2026-10-10T08:15:30',
  '2026-10-10T08:15:30.1259Z',
  '2026-10-10T08:15:30+99:99',
  null,
  undefined,
  1791620130125,
]) {
  it(`rejects an invalid/unsupported timestamp (${String(timestamp)})`, () => {
    assert.equal(AnalysisTimestampSchema.safeParse(timestamp).success, false);
    assert.throws(() => serializeJobAnalysisSnapshot({ ...snapshot, analyzedAt: timestamp }), {
      code: 'INVALID_ANALYSIS_SNAPSHOT',
    });
  });
}

it('serializes nested analysis/evidence timestamps without mutating source data', () => {
  const dto = serializeJobAnalysisSnapshot(snapshot);
  assert.equal(dto.analyzedAt, instant);
  assert.equal(dto.overallFit.analyzedAt, instant);
  assert.equal(dto.matchAnalysis.requirementMatches[0].evidence[0].detectedAt, instant);
  assert.ok(snapshot.analyzedAt instanceof Date);
  assert.ok(snapshot.matchAnalysis.requirementMatches[0].evidence[0].detectedAt instanceof Date);
  assert.deepEqual(dto.metadata, snapshot.metadata);
  assert.deepEqual(dto.projectRankings, snapshot.projectRankings);
  assert.doesNotThrow(() => canonicalPackageJson(dto));
  assert.deepEqual(serializeJobAnalysisSnapshot(dto), dto);
  assert.deepEqual(JobAnalysisSnapshotSchema.parse(dto), dto);
});

it('preserves absent optional dates, allowed null data and legacy offset strings', () => {
  const dto = serializeJobAnalysisSnapshot({
    ...snapshot,
    analyzedAt: '2026-10-10T13:45:30+05:30',
  });
  assert.equal(dto.analyzedAt, '2026-10-10T08:15:30.000Z');
  assert.equal(Object.hasOwn(dto, 'createdAt'), false);
  assert.equal(Object.hasOwn(dto, 'updatedAt'), false);
  assert.equal(dto.normalizedJobUrl, null);
  assert.equal(dto.metadata.custom.optional, null);
  assert.deepEqual(
    serializeJobAnalysisSnapshot({
      ...snapshot,
      matchAnalysis: { evidence: [{ excerpt: 'No optional timestamp' }] },
    }).matchAnalysis,
    { evidence: [{ excerpt: 'No optional timestamp' }] }
  );
  assert.equal(
    serializeJobAnalysisSnapshot({ ...snapshot, createdAt: new Date(instant), updatedAt: instant })
      .createdAt,
    instant
  );
  assert.throws(() => serializeJobAnalysisSnapshot({ ...snapshot, createdAt: null }), {
    code: 'INVALID_ANALYSIS_SNAPSHOT',
  });
});

it('rejects malformed persisted records and nested analysis timestamps', () => {
  for (const changes of [
    { candidateId: 'invalid' },
    { projectRankings: {} },
    { overallFit: null },
    { matchAnalysis: { analyzedAt: 'invalid' } },
    { matchAnalysis: { evidence: [{ detectedAt: null }] } },
  ]) {
    assert.throws(() => serializeJobAnalysisSnapshot({ ...snapshot, ...changes }), {
      code: 'INVALID_ANALYSIS_SNAPSHOT',
    });
  }
});

it('keeps canonical authoritative content hashes stable across serialization and JSONB-equivalent reloads', () => {
  const fit = service.toWorkflowJobFit(snapshot);
  const pkg = {
    candidateId: snapshot.candidateId,
    targetJob: { jobFitAnalysis: fit },
    answers: { jobFitAnalysis: fit },
    jobFitAnalysis: fit,
  };
  const hash = computeApplicationPackageHash(pkg);
  let loaded = serializeJobAnalysisSnapshot(snapshot);
  for (let reload = 0; reload < 4; reload++) {
    loaded = JSON.parse(JSON.stringify(loaded));
    const reloadedFit = service.toWorkflowJobFit(loaded);
    assert.equal(computeApplicationPackageHash({ ...pkg, jobFitAnalysis: reloadedFit }), hash);
  }
  const equivalentFit = service.toWorkflowJobFit({
    ...snapshot,
    analyzedAt: '2026-10-10T13:45:30.125+05:30',
  });
  assert.equal(computeApplicationPackageHash({ ...pkg, jobFitAnalysis: equivalentFit }), hash);
  assert.equal(
    computeApplicationPackageHash({
      ...pkg,
      jobFitAnalysis: service.toWorkflowJobFit({
        ...snapshot,
        createdAt: new Date(instant),
        updatedAt: new Date(instant),
      }),
    }),
    hash
  );
  assert.notEqual(
    computeApplicationPackageHash({
      ...pkg,
      jobFitAnalysis: { ...fit, analyzedAt: '2026-10-10T08:15:31.125Z' },
    }),
    hash
  );
  assert.notEqual(
    computeApplicationPackageHash({
      ...pkg,
      jobFitAnalysis: { ...fit, jobContentHash: 'different' },
    }),
    hash
  );
  assert.throws(() => canonicalPackageJson({ arbitrary: new Date(instant) }), {
    code: 'INVALID_PACKAGE_CONTENT',
  });
  assert.throws(
    () =>
      canonicalPackageJson(
        service.toWorkflowJobFit({ ...snapshot, overallFit: { arbitrary: new Date(instant) } })
      ),
    { code: 'INVALID_PACKAGE_CONTENT' }
  );
});

it('rejects invalid timestamp before database writes', async () => {
  let calls = 0;
  const persistence = new JobAnalysisSnapshotService({
    db: {
      execute() {
        calls++;
      },
    },
  });
  await assert.rejects(
    persistence.saveSnapshot({ ...snapshot, matchAnalysis: { analyzedAt: new Date(NaN) } }),
    { code: 'INVALID_ANALYSIS_SNAPSHOT' }
  );
  assert.equal(calls, 0);
});

it('invalid persisted timestamp cannot pass the TTL gate; ownership still rejects first', async () => {
  service.getSnapshotById = async () => ({
    ...snapshot,
    contractVersion: 'P16-001F',
    analyzedAt: new Date(NaN),
  });
  const parameters = {
    context: { tenantId: snapshot.tenantId, candidateId: snapshot.candidateId },
    snapshotId: snapshot.id,
  };
  assert.equal(
    (await service.getValidatedSnapshot(parameters)).reason,
    'INVALID_ANALYSIS_TIMESTAMP'
  );
  await assert.rejects(
    service.getValidatedSnapshot({
      ...parameters,
      context: { ...parameters.context, candidateId: crypto.randomUUID() },
    }),
    { code: 'CROSS_CANDIDATE_ACCESS_DENIED' }
  );
});
