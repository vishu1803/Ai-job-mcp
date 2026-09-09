import { db, pool } from '../src/db/index.js';
import { sql } from 'drizzle-orm';

const pkg = (await db.execute(sql`
  SELECT package_payload
  FROM application_packages
  WHERE application_id = '2f71f4cf-0f86-43eb-b1c0-687e2e2d2d1c' AND version = 5`)).rows[0];
const p = pkg.package_payload;
console.log(JSON.stringify({
  topKeys: Object.keys(p),
  targetJobKeys: Object.keys(p.targetJob || {}),
  targetJobJobFitAnalysis: p.targetJob?.jobFitAnalysis ? {
    keys: Object.keys(p.targetJob.jobFitAnalysis),
    source: p.targetJob.jobFitAnalysis.source,
    snapshotId: p.targetJob.jobFitAnalysis.snapshotId,
    rankingsCount: (p.targetJob.jobFitAnalysis.projectRankings || []).length,
    first3: (p.targetJob.jobFitAnalysis.projectRankings || []).slice(0, 3).map(r => ({ n: r.projectName || r.name, s: r.relevanceScore, rank: r.relevanceRank })),
  } : 'ABSENT',
  targetJobProjectRankings: p.targetJob?.projectRankings ? 'present len=' + p.targetJob.projectRankings.length : 'ABSENT',
  answersKeys: Object.keys(p.answers || {}),
  answersJobFit: p.answers?.jobFitAnalysis ? 'present' : 'ABSENT',
  structuredResumeProjects: (p.structuredResume?.projects || []).map(x => x.name),
  tailoredResumeSelectedProjects: (p.tailoredResume?.selectedProjects || []).map(x => x.name || x.projectName),
  structuredResumeSectionOrder: p.structuredResume?.sectionOrder,
  tailoringPlanSelectedProjectIds: p.tailoringPlan?.selectedProjectIds,
}, null, 1));
await pool.end();
