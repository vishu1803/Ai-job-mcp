import { db, pool } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
import { CandidateProfileService } from '../src/services/candidate-profile.service.js';

const TENANT = '24d53f53-780e-4431-b065-32180c354175';
const CAND = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';
const UID = (await db.execute(sql`SELECT user_id FROM candidates WHERE id = ${CAND}`)).rows[0].user_id;

const svc = new CandidateProfileService();
const view = await svc.getProfile({ tenantId: TENANT, userId: UID, role: 'MEMBER' }, CAND);
console.log('profileView.projects sample (first 4):');
for (const p of (view.projects || []).slice(0, 4)) {
  console.log(JSON.stringify({ name: p.name, id: p.id, projectId: p.projectId, keys: Object.keys(p).slice(0, 12) }));
}
await pool.end();
