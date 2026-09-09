import { db, pool } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
const r = (await db.execute(sql`
  SELECT profile_metadata::text AS t FROM candidates WHERE id='10a2b51b-09bf-4090-8040-1f60ebeb89c9'`)).rows[0];
const t = r.t || '';
console.log('has TypeORM bullet:', t.includes('Implemented PostgreSQL data persistence via TypeORM'));
console.log('has Next.js bullet:', t.includes('Built a responsive Next.js 14 React frontend'));
const idx = t.indexOf('Built a responsive Next.js 14 React frontend');
if (idx > -1) {
  // print enclosing object keys
  const start = t.lastIndexOf('{"', idx);
  console.log('ENCLOSING OBJECT START:', t.slice(start, start + 120));
  // Which key path? find the nearest preceding '"projects"' or resumeData marker
  const rd = t.lastIndexOf('resumeData', idx);
  const userCustom = t.lastIndexOf('userCustom', idx);
  console.log('nearest resumeData @', rd, 'userCustom @', userCustom, 'bullet @', idx);
}
await pool.end();
