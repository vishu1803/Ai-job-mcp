/* Temporary READ-ONLY source-of-truth recovery. No writes. */
import { db, pool } from '../../src/db/index.js';
import { sql } from 'drizzle-orm';

const T = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';
const TENANT = '24d53f53-780e-4431-b065-32180c354175';

const q = async (label, query) => {
  try {
    const r = await db.execute(sql.raw(query));
    console.log(`\n=== ${label} ===`);
    console.log(JSON.stringify(r.rows, null, 1));
  } catch (e) {
    console.log(`\n=== ${label} === ERROR: ${e.message}`);
  }
};

try {
  await q('1. CANDIDATE FULL ROW', `SELECT id, tenant_id, user_id, display_name, headline, summary,
    canonical_email, status, created_at, updated_at, profile_metadata
    FROM candidates WHERE id = '${T}'`);

  await q('2. USERS', `SELECT id, tenant_id, display_name, email, role, status, created_at, updated_at
    FROM users WHERE tenant_id = '${TENANT}'`);

  await q('3. TENANTS', `SELECT id, name, slug, created_at FROM tenants WHERE id = '${TENANT}'`);

  await q('4. CANDIDATE IDENTITIES', `SELECT id, tenant_id, candidate_id, provider, external_account_id,
    external_username, external_email, verified, verified_at, profile_url, metadata
    FROM candidate_identities WHERE candidate_id = '${T}'`);

  await q('5. RESOURCE CONNECTIONS (metadata)', `SELECT id, user_id, provider, display_name,
    external_account_id, external_account_name, status, created_at, metadata
    FROM resource_connections WHERE tenant_id = '${TENANT}'`);

  await q('6. RESUMES', `SELECT id, candidate_id, file_name, status, created_at,
    left(content, 200) AS content_head, metadata
    FROM resumes WHERE candidate_id = '${T}'`);

  await q('7. ADDITIONAL SKILLS (CANDIDATE_DECLARED)', `SELECT cs.id, cs.candidate_id, s.slug, s.name,
    cs.provenance_status, cs.source, cs.proficiency, cs.confidence_score, cs.created_at, cs.updated_at
    FROM candidate_skills cs JOIN skills s ON cs.skill_id = s.id
    WHERE cs.candidate_id = '${T}' AND cs.source = 'CANDIDATE_DECLARED'
    ORDER BY cs.created_at`);

  await q('8. CANDIDATE_SKILL PROVENANCE SUMMARY', `SELECT cs.provenance_status, cs.source,
    count(*)::int AS n, min(cs.created_at) AS first_seen, max(cs.updated_at) AS last_touch
    FROM candidate_skills cs WHERE cs.candidate_id = '${T}'
    GROUP BY cs.provenance_status, cs.source ORDER BY n DESC`);

  await q('9. RESOURCES', `SELECT id, name, display_name, url, status, created_at FROM resources
    WHERE candidate_id = '${T}' ORDER BY created_at`);

  await q('10. BACKUP TABLES PRESENT', `SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE 'backup%'`);

  await q('11. OTHER CANDIDATES IN SAME TENANT', `SELECT id, display_name, headline,
    left(coalesce(summary,''),80) AS summary, created_at, updated_at
    FROM candidates WHERE tenant_id = '${TENANT}'`);

  await q('12. PROJECTS', `SELECT id, name, slug, status, created_at FROM projects
    WHERE candidate_id = '${T}' ORDER BY created_at LIMIT 20`);
} catch (e) {
  console.error('Failed:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
