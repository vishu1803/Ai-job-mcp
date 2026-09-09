import { db, pool } from '../src/db/index.js';
import { sql } from 'drizzle-orm';

const cols = (await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name='projects' ORDER BY ordinal_position`)).rows.map(r => r.column_name);
console.log('projects columns:', cols.join(', '));

const projRows = (await db.execute(sql`SELECT candidate_id, id, name, created_at FROM projects ORDER BY candidate_id, created_at`)).rows;
console.log('\nAll projects rows (' + projRows.length + '):');
const byCand = {};
for (const p of projRows) {
  byCand[p.candidate_id] = byCand[p.candidate_id] || [];
  byCand[p.candidate_id].push({ name: p.name, id: p.id, at: p.created_at });
}
for (const [cid, list] of Object.entries(byCand)) {
  console.log(cid + ': ' + JSON.stringify(list.map(x => x.name)));
}
if (projRows.length === 0) console.log('(projects table EMPTY)');

// Also check evidence_items and resources sources feeding analyzers
const ev = (await db.execute(sql`SELECT candidate_id, count(*) FROM evidence_items GROUP BY candidate_id`)).rows;
console.log('\nevidence_items counts per candidate:', JSON.stringify(ev));

await pool.end();
