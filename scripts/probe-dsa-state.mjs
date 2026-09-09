import { db, pool } from '../src/db/index.js';
import { sql } from 'drizzle-orm';

const CAND = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';
const TENANT = '24d53f53-780e-4431-b065-32180c354175';

// 1. What DSA data does the candidate own?
const cand = (await db.execute(sql`
  SELECT profile_metadata->'userCustom'->'problemSolving' AS uc_ps,
         profile_metadata->'problemSolving' AS pm_ps,
         profile_metadata->'resumeData'->'problemSolving' AS rd_ps,
         profile_metadata->'portfolioLinks' AS links
  FROM candidates WHERE id = ${CAND}`)).rows[0];
console.log('[candidate DSA data]');
console.log(JSON.stringify({ userCustom: cand.uc_ps, profileMetadata: cand.pm_ps, resumeData: cand.rd_ps }, null, 1));
console.log('[portfolio links]', JSON.stringify(cand.links));

// skills that would flag hasDsaSkill
const skills = (await db.execute(sql`
  SELECT s.name FROM candidate_skills cs JOIN skills s ON s.id = cs.skill_id
  WHERE cs.candidate_id = ${CAND}`)).rows.map(r => r.name);
console.log('\n[skill names matching DSA]', skills.filter(n => /data structures|algorithm|leetcode|binary search|competitive/i.test(n)).slice(0, 10));

// 2. What did v6 actually carry?
const v6 = (await db.execute(sql`
  SELECT package_payload->'structuredResume'->'dsa' AS dsa,
         package_payload->'structuredResume'->'sectionOrder' AS so,
         package_payload->'structuredResume'->'experience' AS exp,
         package_payload->'structuredResume'->'education' AS edu,
         package_payload->'structuredResume'->'optionalSections' AS opt
  FROM application_packages WHERE application_id = '2f71f4cf-0f86-43eb-b1c0-687e2e2d2d1c' AND version = 6`)).rows[0];
console.log('\n[v6 structuredResume]');
console.log(JSON.stringify({
  dsa: v6.dsa,
  sectionOrder: v6.so,
  experienceCount: (v6.exp || []).length,
  experienceFirst: (v6.exp || [])[0] ? { company: v6.exp[0].company, title: v6.exp[0].title, bullets: (v6.exp[0].bullets || []).length } : null,
  educationCount: (v6.edu || []).length,
  educationFirst: (v6.edu || [])[0] ? { institution: v6.edu[0].institution, degree: v6.edu[0].degree } : null,
}, null, 1));
await pool.end();
