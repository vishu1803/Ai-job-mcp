import { db, pool } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
// Where do the PDF PDE bullets live if not in source tables? They were in the P16-001F-3B report's
// curated 'resumeDataProjects' fixture... but for the REAL user, curated entries exist ONLY for ACRA/CTM.
// Yet the structured PDE entry HAS those bullets. The structured builder reads rawProjects = meta.projects
// || source.projects — source = candidateProfileInput = {...documentContent.candidateData} whose projects
// = reconciled (bullets from profile metadata = 'Engineered high-throughput...'). But the PACKAGE shows
// different bullets. UNLESS candidateProfileInput.projects was REPLACED by profileView.projects in the
// getProfile fallback branch (line ~861: projects: profileView.projects || []) — same thing.
// OR the structured builder got projects from jobPosting.jobFitAnalysis... No.
// DECISIVE: check the v8 package's tailoringPlan.selectedProjectIds vs structured projects' projectId,
// then check buildStructuredResumeSnapshot's 'source' — is documentContent.candidateData.projects REALLY
// what entered? Print the v8 package markdown PDE section to compare with PDF:
const pkg = (await db.execute(sql`
  SELECT package_payload->'tailoredResume'->>'markdownContent' AS md,
         package_payload->'structuredResume'->'projects'->0 AS p0,
         package_payload->'structuredResume'->'projects'->1 AS p1
  FROM application_packages ORDER BY created_at DESC LIMIT 1`)).rows[0];
console.log('=== markdown PDE section ===');
const m = pkg.md.match(/###?\s*\*?\*?Product Data Explorer[\s\S]{0,900}/);
console.log(m ? m[0].slice(0, 800) : 'not found');
console.log('=== structured PDE (projects[0]) ===');
console.log(JSON.stringify(JSON.parse(JSON.stringify(pkg.p0)), null, 1).slice(0, 900));
console.log('=== structured p1 ===');
console.log(JSON.stringify(pkg.p1)?.slice(0, 400));
await pool.end();
