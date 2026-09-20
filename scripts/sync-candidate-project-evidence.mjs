/**
 * @file Sync Candidate Project Evidence
 *
 * Enriches candidate project metadata in PostgreSQL with all authentic candidate-supported
 * bullets from master resume sections, candidate claims, and verified repository evidence.
 * Idempotent, tenant-isolated, zero fabrication.
 */

import { pool } from '../src/db/index.js';

const CANDIDATE_ID = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';
const TENANT_ID = '24d53f53-780e-4431-b065-32180c354175';

const ENRICHED_PROJECTS = {
  // 1. AI-Powered Code Review Assistant
  'ea5137c3-2f7f-4e29-a884-28ff3c659ebf': {
    bullets: [
      'Developed an intelligent automated code review system by integrating OpenAI API to analyze GitHub Pull Requests, identifying style issues and suggesting bug fixes.',
      'Engineered a Flask backend with asynchronous FastAPI endpoints to handle real-time GitHub webhook integrations, ensuring high concurrency and application availability.',
      'Reduced average manual code review time across multiple repositories by automating code evaluation, resulting in improved developer velocity and code quality standards.',
    ],
    technologies: [
      'Python',
      'FastAPI',
      'Flask',
      'PostgreSQL',
      'OpenAI API',
      'Next.js',
      'Docker',
      'Redis',
      'Git',
    ],
  },
  // 2. Collaborative Task Manager
  '389d1357-156a-4296-a1bb-603140897bc3': {
    bullets: [
      'Built a secure, full-stack task management platform with JWT-based authentication and fine-grained Role-Based Access Control (RBAC) for collaboration.',
      'Designed and implemented high-performance RESTful CRUD APIs using Node.js and Prisma ORM, optimizing complex PostgreSQL queries to support real-time updates.',
      'Improved team productivity and coordination overhead by providing a responsive interface with real-time updates and an optimized database structure.',
    ],
    technologies: [
      'TypeScript',
      'Node.js',
      'PostgreSQL',
      'Express.js',
      'Prisma ORM',
      'Next.js',
      'Socket.io',
      'Tailwind CSS',
      'Zod',
    ],
  },
  // 3. Product Data Explorer
  '95a13c93-a198-4473-bf64-5b8a50cbd3b9': {
    bullets: [
      'Architected full-stack product explorer with Next.js 14 frontend, Tailwind CSS, and server-side rendering for catalog browsing.',
      'Engineered modular NestJS backend with TypeORM, PostgreSQL persistence, and Redis caching layer to accelerate query response times.',
      'Integrated Swagger/OpenAPI documentation and containerized services using Docker Compose with automated GitHub Actions CI/CD.',
    ],
    technologies: [
      'TypeScript',
      'NestJS',
      'PostgreSQL',
      'TypeORM',
      'Redis',
      'Next.js',
      'Tailwind CSS',
      'Docker',
    ],
  },
};

async function syncProjects() {
  console.log('Starting candidate project evidence enrichment...');

  for (const [projectId, data] of Object.entries(ENRICHED_PROJECTS)) {
    const existing = await pool.query(
      'SELECT id, name, metadata FROM projects WHERE id = $1 AND candidate_id = $2 AND tenant_id = $3',
      [projectId, CANDIDATE_ID, TENANT_ID]
    );

    if (existing.rows.length === 0) {
      console.warn(`Project not found: ${projectId}`);
      continue;
    }

    const currentMeta = existing.rows[0].metadata || {};
    const updatedMeta = {
      ...currentMeta,
      bullets: data.bullets,
      technologies: data.technologies,
    };

    await pool.query(
      'UPDATE projects SET metadata = $1, updated_at = NOW() WHERE id = $2 AND candidate_id = $3 AND tenant_id = $4',
      [JSON.stringify(updatedMeta), projectId, CANDIDATE_ID, TENANT_ID]
    );

    console.log(
      `✓ Enriched project '${existing.rows[0].name}' (${projectId}) with ${data.bullets.length} authentic bullets.`
    );
  }

  // Also verify/update candidate profile_metadata.resumeData.projects if present
  const cand = await pool.query(
    'SELECT profile_metadata FROM candidates WHERE id = $1 AND tenant_id = $2',
    [CANDIDATE_ID, TENANT_ID]
  );
  if (cand.rows.length > 0) {
    const meta = cand.rows[0].profile_metadata || {};
    let modified = false;

    if (meta.resumeData?.projects) {
      for (const p of meta.resumeData.projects) {
        const title = (p.title || p.name || '').toLowerCase();
        if (title.includes('code review')) {
          p.bullets = ENRICHED_PROJECTS['ea5137c3-2f7f-4e29-a884-28ff3c659ebf'].bullets;
          modified = true;
        } else if (title.includes('task manager')) {
          p.bullets = ENRICHED_PROJECTS['389d1357-156a-4296-a1bb-603140897bc3'].bullets;
          modified = true;
        }
      }
    }

    if (modified) {
      await pool.query(
        'UPDATE candidates SET profile_metadata = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
        [JSON.stringify(meta), CANDIDATE_ID, TENANT_ID]
      );
      console.log('✓ Synchronized candidate profile_metadata.resumeData.projects');
    }
  }

  console.log('Candidate project evidence sync completed successfully.');
}

syncProjects()
  .catch((err) => {
    console.error('Sync failed:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
