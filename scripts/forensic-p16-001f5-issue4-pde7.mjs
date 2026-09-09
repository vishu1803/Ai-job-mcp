import { db, pool } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
// Structured PDE bullets have evidenceRefs (resourceId 39b504f5 = PDE repo resource).
// So the bullets were selected by selectAndRephraseProjectBullets from project.bullets —
// the reconciled PDE entry's bullets. But profile metadata.bullets = only 1 Rust bullet.
// The evidenceRefs filePath 'frontend/package.json' — those come from evidence_items!
// So bullets were DERIVED FROM EVIDENCE. Check evidence_items excerpts for PDE resource:
const r = (await db.execute(sql`
  SELECT ei.evidence_type, ei.source_location->>'filePath' AS file, ei.excerpt
  FROM evidence_items ei WHERE ei.resource_id = '39b504f5-2cf2-4656-ab9a-2d897a29523e'
  AND (ei.excerpt ILIKE '%Next.js 14%' OR ei.excerpt ILIKE '%Tailwind%')
  LIMIT 4`)).rows;
console.log('evidence excerpts with Next.js 14:', r.length);
for (const x of r) console.log('-', x.evidence_type, x.file, '|', (x.excerpt||'').slice(0, 120));
await pool.end();
