import fs from 'node:fs';
import path from 'node:path';
import { db, pool, closeDatabase } from '../src/db/index.js';
import { sql } from 'drizzle-orm';

async function main() {
  const TENANT_ID = '24d53f53-780e-4431-b065-32180c354175';
  const USER_ID = '9dd8e4fb-456b-4104-9cb1-c839a544b721';
  const CANDIDATE_ID = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';
  const JOB_ID = '70ce5b11-0cca-4c6e-8b85-f7b6e8c8321f';

  const tenantsRes = await db.execute(sql`SELECT * FROM tenants WHERE id = ${TENANT_ID}`);
  const usersRes = await db.execute(sql`SELECT * FROM users WHERE id = ${USER_ID}`);
  const candidatesRes = await db.execute(sql`SELECT * FROM candidates WHERE id = ${CANDIDATE_ID}`);
  const projectsRes = await db.execute(
    sql`SELECT * FROM projects WHERE candidate_id = ${CANDIDATE_ID}`
  );
  const resourcesRes = await db.execute(
    sql`SELECT * FROM resources WHERE candidate_id = ${CANDIDATE_ID}`
  );
  const candidateSkillsRes = await db.execute(
    sql`SELECT * FROM candidate_skills WHERE candidate_id = ${CANDIDATE_ID}`
  );
  const evidenceItemsRes = await db.execute(
    sql`SELECT * FROM evidence_items WHERE candidate_id = ${CANDIDATE_ID}`
  );
  const jobApplicationsRes = await db.execute(
    sql`SELECT * FROM job_applications WHERE id = ${JOB_ID} OR tenant_id = ${TENANT_ID}`
  );

  const skillsRes = await db.execute(sql`SELECT * FROM skills`);

  const dump = {
    tenants: tenantsRes.rows,
    users: usersRes.rows,
    candidates: candidatesRes.rows,
    skills: skillsRes.rows,
    projects: projectsRes.rows,
    resources: resourcesRes.rows,
    candidate_skills: candidateSkillsRes.rows,
    evidence_items: evidenceItemsRes.rows,
    job_applications: jobApplicationsRes.rows,
  };

  const outPath = path.resolve('src/db/seeds/test-fixtures.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(dump, null, 2));

  console.log(`Successfully exported test fixtures to ${outPath}:`, {
    tenants: dump.tenants.length,
    users: dump.users.length,
    candidates: dump.candidates.length,
    skills: dump.skills.length,
    projects: dump.projects.length,
    resources: dump.resources.length,
    candidate_skills: dump.candidate_skills.length,
    evidence_items: dump.evidence_items.length,
    job_applications: dump.job_applications.length,
  });

  await closeDatabase(pool);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
