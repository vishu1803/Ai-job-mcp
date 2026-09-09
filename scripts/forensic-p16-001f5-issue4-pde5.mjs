import { db, pool } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
// The bullets/techs are STABLE across v5→v8 but exist in NO current source table.
// They must come from a TENANT-SCOPED row of another tenant (the 'other tenant' from earlier forensics:
// tenant 24d53f53, candidate 10a2b51b was REAL... but check the OTHER candidate rows in projects table
// with name 'Product-Data-Explorer' (non-vishu1803 rows seen earlier: 55b6047e, 63e253e4, a229b49a, cf0b165a)
const r = (await db.execute(sql`
  SELECT id, candidate_id, tenant_id, name, metadata->'technologies' AS techs, metadata->'bullets' AS bullets
  FROM projects WHERE name ILIKE '%Product-Data-Explorer%' ORDER BY created_at DESC LIMIT 8`)).rows;
for (const x of r) {
  console.log(x.id.slice(0,8), '| cand', x.candidate_id?.slice(0,8), '| tenant', x.tenant_id?.slice(0,8));
  console.log('   techs:', JSON.stringify(x.techs));
  console.log('   bullets:', JSON.stringify(x.bullets)?.slice(0, 200));
}
await pool.end();
