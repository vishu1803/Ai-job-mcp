import { db, pool } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
const r1 = (await db.execute(sql`
  SELECT count(*)::int AS n FROM candidates
  WHERE profile_metadata::text LIKE '%Built a responsive Next.js 14 React frontend%'
    AND id = '10a2b51b-09bf-4090-8040-1f60ebeb89c9'`)).rows[0];
console.log('candidates.metadata has Next.js bullet:', r1.n > 0);
const r2 = (await db.execute(sql`
  SELECT count(*)::int AS n FROM projects
  WHERE metadata::text LIKE '%Built a responsive Next.js 14 React frontend%'
    AND candidate_id = '10a2b51b-09bf-4090-8040-1f60ebeb89c9'`)).rows[0];
console.log('projects.metadata has Next.js bullet:', r2.n > 0);
const r3 = (await db.execute(sql`
  SELECT count(*)::int AS n FROM resources
  WHERE metadata::text LIKE '%Built a responsive Next.js 14 React frontend%'
    AND candidate_id = '10a2b51b-09bf-4090-8040-1f60ebeb89c9'`)).rows[0];
console.log('resources.metadata has Next.js bullet:', r3.n > 0);
const pkg = (await db.execute(sql`
  SELECT package_payload->'tailoredResume'->>'markdownContent' AS md
  FROM application_packages ORDER BY created_at DESC LIMIT 1`)).rows[0];
console.log('latest package markdown has Next.js bullet:', (pkg.md || '').includes('Built a responsive Next.js 14 React frontend'));
console.log('latest package markdown has NestJS:', (pkg.md || '').includes('NestJS'));
await pool.end();
