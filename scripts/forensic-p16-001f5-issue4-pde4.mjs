import { db, pool } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
// Check v6/v7 packages (previous runs) for the same bullets — is it a persisted historical artifact?
const r = (await db.execute(sql`
  SELECT version, created_at,
    package_payload->'tailoredResume'->>'markdownContent' IS NOT NULL AS has_md,
    (package_payload->'tailoredResume'->>'markdownContent') LIKE '%Built a responsive Next.js 14 React frontend%' AS has_nextjs,
    (package_payload->'structuredResume'->'projects'->0->>'bullets') LIKE '%Next.js 14%' AS struct_pde_nextjs,
    package_payload->'structuredResume'->'projects'->0->>'technologies' AS pde_tech
  FROM application_packages ORDER BY created_at DESC LIMIT 6`)).rows;
for (const x of r) console.log('v' + x.version, x.created_at?.toISOString?.(), '| md_nextjs:', x.has_nextjs, '| struct_pde_nextjs:', x.struct_pde_nextjs, '| pde_tech:', x.pde_tech?.slice(0, 80));
await pool.end();
