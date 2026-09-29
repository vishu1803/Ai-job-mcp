import { pool, closeDatabase } from '../src/db/index.js';

const tenantId = '24d53f53-780e-4431-b065-32180c354175';
const candidateId = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';

try {
  const client = await pool.connect();
  try {
    await client.query('SET enable_seqscan = off');
    console.log('--- 1. JOB APPLICATIONS QUERY WITH NEW INDEX (seqscan=off) ---');
    const r1 = await client.query(
      `EXPLAIN (ANALYZE, BUFFERS) 
       select id, updated_at from job_applications 
       where tenant_id = $1 and candidate_id = $2 
       order by updated_at desc, id desc limit 25`,
      [tenantId, candidateId]
    );
    console.log(r1.rows.map((r) => r['QUERY PLAN']).join('\n'));

    console.log('\n--- 2. EVIDENCE ITEMS QUERY WITH NEW INDEX (seqscan=off) ---');
    const pRows = await client.query(
      `select distinct project_id from evidence_items where tenant_id = $1 and candidate_id = $2 and project_id is not null limit 5`,
      [tenantId, candidateId]
    );
    const projectIds = pRows.rows.map((r) => r.project_id);
    const r2 = await client.query(
      `EXPLAIN (ANALYZE, BUFFERS)
       select id, confidence_score, detected_at from evidence_items
       where tenant_id = $1 and candidate_id = $2 and project_id = any($3::uuid[])
       order by confidence_score desc, detected_at desc, id asc`,
      [tenantId, candidateId, projectIds]
    );
    console.log(r2.rows.map((r) => r['QUERY PLAN']).join('\n'));
  } finally {
    client.release();
  }
} finally {
  await closeDatabase();
}
