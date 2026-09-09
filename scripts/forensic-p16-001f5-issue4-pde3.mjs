import { db, pool } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
// The bullet text exists NOWHERE in candidate-owned source data — it exists only in package markdown.
// Search other candidates/tenants for it (is it fixture pollution or another candidate's content?)
const r = (await db.execute(sql`
  SELECT id, candidate_id, tenant_id, name FROM projects
  WHERE metadata::text LIKE '%Built a responsive Next.js 14 React frontend%' LIMIT 5`)).rows;
console.log('projects anywhere with that bullet:', r.length);
for (const x of r) console.log(' ', x.id?.slice(0,8), x.candidate_id?.slice(0,8), x.name);
const r2 = (await db.execute(sql`
  SELECT count(*)::int AS n FROM evidence_items
  WHERE excerpt::text LIKE '%Built a responsive Next.js 14 React frontend%'`)).rows[0];
console.log('evidence_items with that text:', r2.n);
// Check PDE resource metadata (GitHub repo ingest may have generated README-based bullets)
const res = (await db.execute(sql`
  SELECT name, metadata::text AS t FROM resources WHERE candidate_id='10a2b51b-09bf-4090-8040-1f60ebeb89c9' AND url ILIKE '%Product-Data-Explorer%'`)).rows;
for (const x of res) {
  console.log('PDE resource:', x.name, '| meta has NestJS:', (x.t||'').includes('NestJS'), '| meta has Next bullet:', (x.t||'').includes('Next.js 14'));
  console.log('  meta sample:', (x.t||'').slice(0, 500));
}
await pool.end();
