/**
 * @file Integrated Real-Browser Acceptance Server & Fixtures Harness.
 *
 * Sets up the full Antigravity Career Hub application backed by the disposable
 * PostgreSQL 17 cluster on loopback port 55447.
 *
 * Seeds 5 distinct candidate archetypes for browser testing:
 *   - Archetype A (New): First-time user, 0 profile data, 0 resumes, 0 applications.
 *   - Archetype B (Partial): Incomplete profile, missing phone, claimed skills, readiness warnings.
 *   - Archetype C (Junior Backend): Verified skills, project evidence, base resume, saved job, Studio draft.
 *   - Archetype D (Experienced Lead): Staff Architect, 12 verified skills, 3 projects, 2 master resumes,
 *     4 applications (SAVED, PREPARED, HANDOFF_READY, APPLIED), active Studio draft with proposals & preview.
 *   - Archetype E (Second Tenant / Readonly): Multi-tenant isolation and READONLY permission enforcement.
 *
 * Zero live AI provider requests (deterministic synthetic AI).
 * Zero remote database access (strictly disposable loopback on port 55447).
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq, and, sql } from 'drizzle-orm';
import { db, closeDatabase } from '../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  skills,
  candidateSkills,
  projects,
  resources,
  evidenceItems,
  jobApplications,
  applicationPackages,
  tailoredDocuments,
} from '../src/db/schema.js';
import { ResumeRepository } from '../src/db/repositories/resume.repository.js';
import { DocumentStorageService } from '../src/services/document-storage.service.js';
import { ResumeStudioDraftService } from '../src/services/resume-studio-draft.service.js';
import { JobDiscoveryService } from '../src/services/job-discovery.service.js';
import { createSession, generateCsrfToken } from '../src/security/session.service.js';
import { buildApp } from '../src/app.js';
import { studioPersonas } from '../tests/fixtures/resume-studio-personas.js';
import {
  sealGeneratedPackage,
  sealHandoffManifest,
  packageBodyHash,
} from '../src/services/evidence/artifact-policy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.STUDIO_PDF_PYTHONPATH) {
  process.env.STUDIO_PDF_PYTHONPATH = path.join(os.tmpdir(), 'product-pdf-inspection');
}

export const BROWSER_ACCEPTANCE_JOBS = [
  {
    id: 'b0a10001-0000-4000-8000-000000000001',
    source: 'GREENHOUSE',
    provider: 'GREENHOUSE',
    externalJobId: 'gh-stripe-staff-sys',
    company: 'Stripe',
    title: 'Staff Systems Engineer, Distributed Infrastructure',
    location: 'Remote, US',
    workplaceType: 'REMOTE',
    employmentType: 'FULL_TIME',
    description:
      'Stripe is looking for a Staff Systems Engineer to design high-throughput distributed state engines. Requirements: Deep experience with Go or Rust, distributed consensus (Raft/Paxos), PostgreSQL, Kubernetes, and Linux internals. Experience designing fault-tolerant systems handling millions of events per second.',
    skills: ['Go', 'Rust', 'Kubernetes', 'PostgreSQL', 'Distributed Systems', 'Linux'],
    requirements: [
      '8+ years building high-scale distributed backend systems',
      'Proficiency in Go, Rust, or C++',
      'Expertise in PostgreSQL and database performance optimization',
      'Experience with consensus protocols and distributed coordination',
    ],
    responsibilities: [
      'Architect core distributed state machines for payment processing',
      'Optimize query throughput and latency across multi-region PostgreSQL clusters',
      'Mentor senior engineers and drive infrastructure architectural roadmaps',
    ],
    applicationUrl: 'https://boards.greenhouse.io/stripe/jobs/gh-stripe-staff-sys',
    sourceUrl: 'https://boards.greenhouse.io/stripe/jobs/gh-stripe-staff-sys',
    postedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    retrievedAt: new Date().toISOString(),
  },
  {
    id: 'b0a10002-0000-4000-8000-000000000002',
    source: 'LEVER',
    provider: 'LEVER',
    externalJobId: 'lever-datadog-lead-dist',
    company: 'Datadog',
    title: 'Lead Distributed Systems Engineer, Telemetry Core',
    location: 'New York, NY / Remote',
    workplaceType: 'HYBRID',
    employmentType: 'FULL_TIME',
    description:
      'Build telemetry ingestion pipelines streaming trillions of metrics daily. Requirements: Go, Kafka, gRPC, Docker, Kubernetes, and time-series data storage. Strong background in zero-loss streaming architectures.',
    skills: ['Go', 'Kafka', 'gRPC', 'Kubernetes', 'Docker', 'Distributed Systems'],
    requirements: [
      '6+ years backend software engineering experience',
      'Strong expertise in Go and asynchronous event-driven architectures with Kafka',
      'High-performance gRPC service design',
    ],
    responsibilities: [
      'Design low-latency ingestion microservices',
      'Scale Kafka pipelines to support peak event traffic',
    ],
    applicationUrl: 'https://jobs.lever.co/datadog/lever-datadog-lead-dist',
    sourceUrl: 'https://jobs.lever.co/datadog/lever-datadog-lead-dist',
    postedAt: new Date(Date.now() - 86400000 * 4).toISOString(),
    retrievedAt: new Date().toISOString(),
  },
  {
    id: 'b0a10003-0000-4000-8000-000000000003',
    source: 'GREENHOUSE',
    provider: 'GREENHOUSE',
    externalJobId: 'gh-snowflake-prin-arch',
    company: 'Snowflake',
    title: 'Principal Backend Architect, Query Mesh',
    location: 'Bellevue, WA / Remote',
    workplaceType: 'REMOTE',
    employmentType: 'FULL_TIME',
    description:
      'Snowflake data cloud platform architecture. Requirements: Systems programming, database internals, Raft consensus, query execution engines, and cloud distributed storage. Tenacity in performance debugging.',
    skills: ['Rust', 'Go', 'Distributed Systems', 'PostgreSQL', 'AWS'],
    requirements: [
      '10+ years engineering experience with focus on database internals',
      'Proven track record delivering mission-critical storage/compute layers',
    ],
    responsibilities: [
      'Lead architecture for next-generation query orchestration mesh',
      'Conduct rigorous performance evaluations and latency profiling',
    ],
    applicationUrl: 'https://boards.greenhouse.io/snowflake/jobs/gh-snowflake-prin-arch',
    sourceUrl: 'https://boards.greenhouse.io/snowflake/jobs/gh-snowflake-prin-arch',
    postedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    retrievedAt: new Date().toISOString(),
  },
  {
    id: 'b0a10004-0000-4000-8000-000000000004',
    source: 'LEVER',
    provider: 'LEVER',
    externalJobId: 'lever-hashicorp-staff-infra',
    company: 'HashiCorp',
    title: 'Staff Infrastructure Engineer, Cloud Ecosystems',
    location: 'Remote, US',
    workplaceType: 'REMOTE',
    employmentType: 'FULL_TIME',
    description:
      'HashiCorp Cloud Platform infrastructure engineering. Requirements: Terraform, Go, Kubernetes, Linux, AWS, and secure secrets management. Build resilient control planes.',
    skills: ['Go', 'Kubernetes', 'Linux', 'AWS', 'CI/CD'],
    requirements: [
      '7+ years experience in cloud infrastructure & platform engineering',
      'Proficiency in Go and infrastructure-as-code automation',
    ],
    responsibilities: [
      'Develop reliable cloud automation control planes',
      'Automate deployment pipelines with high reliability',
    ],
    applicationUrl: 'https://jobs.lever.co/hashicorp/lever-hashicorp-staff-infra',
    sourceUrl: 'https://jobs.lever.co/hashicorp/lever-hashicorp-staff-infra',
    postedAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    retrievedAt: new Date().toISOString(),
  },
  {
    id: 'b0a10005-0000-4000-8000-000000000005',
    source: 'GREENHOUSE',
    provider: 'GREENHOUSE',
    externalJobId: 'gh-synthetix-junior-backend',
    company: 'Synthetix Inc.',
    title: 'Junior Backend Developer',
    location: 'Austin, TX / Remote',
    workplaceType: 'HYBRID',
    employmentType: 'FULL_TIME',
    description:
      'Entry to junior level backend role. Requirements: Node.js, TypeScript, PostgreSQL, REST APIs, Git, Docker. Enthusiasm for test-driven development and clean documentation.',
    skills: ['Node.js', 'TypeScript', 'PostgreSQL', 'Docker', 'Git'],
    requirements: [
      'BS in Computer Science or equivalent practical project experience',
      'Knowledge of Node.js / TypeScript backend development',
      'Basic understanding of SQL queries and schema design',
    ],
    responsibilities: [
      'Develop and test RESTful API endpoints',
      'Write integration tests and maintain API documentation',
    ],
    applicationUrl: 'https://boards.greenhouse.io/synthetix/jobs/gh-synthetix-junior-backend',
    sourceUrl: 'https://boards.greenhouse.io/synthetix/jobs/gh-synthetix-junior-backend',
    postedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    retrievedAt: new Date().toISOString(),
  },
];

export const studioJobTarget = {
  title: 'Staff Platform Engineer, Distributed Core',
  company: 'Synthetic Systems',
  sourceUrl: 'https://careers.synthetic.test/jobs/staff-platform',
  rawDescription:
    'Requirements: High-throughput distributed state management, Go or Rust systems programming, PostgreSQL query optimization, and Kubernetes orchestration. Proven experience architecting fault-tolerant microservices, writing technical specifications, and maintaining high test coverage.',
};

async function getAvailablePort(start = 4330, end = 4350) {
  for (let port = start; port <= end; port++) {
    const probe = net.createServer();
    const isFree = await new Promise((resolve) => {
      probe.once('error', () => resolve(false));
      probe.listen(port, '127.0.0.1', () => {
        probe.close(() => resolve(true));
      });
    });
    if (isFree) return port;
  }
  throw new Error(`No free port in range ${start}-${end}`);
}

/**
 * Starts the complete integrated browser acceptance harness.
 *
 * @param {object} [options]
 * @param {number} [options.port]
 * @param {string} [options.storageDir]
 * @returns {Promise<object>} Harness instance
 */
export async function startBrowserAcceptanceHarness({ port = 0, storageDir = null } = {}) {
  assert.equal(process.env.NODE_ENV, 'test');
  const target = new URL(process.env.DATABASE_URL);
  assert.equal(target.hostname, '127.0.0.1');
  assert.equal(target.port, '55447');
  assert.equal(target.pathname, '/product_audit_resume_studio');

  const assignedPort = port > 0 ? port : await getAvailablePort();
  const actualStorageDir =
    storageDir || (await fs.mkdtemp(path.join(os.tmpdir(), 'career-browser-acceptance-storage-')));
  const storage = new DocumentStorageService({ database: db, storageDir: actualStorageDir });
  const resumeRepo = new ResumeRepository(db);

  // 1. Create two isolated tenants
  const tenant1Id = crypto.randomUUID();
  const tenant2Id = crypto.randomUUID();

  await db.insert(tenants).values([
    {
      id: tenant1Id,
      name: 'Antigravity Career Hub Workspace',
      slug: 'browser-acceptance-primary-' + tenant1Id.slice(0, 8),
      tier: 'PRO',
    },
    {
      id: tenant2Id,
      name: 'Isolated Acme Corp Workspace',
      slug: 'browser-acceptance-isolated-' + tenant2Id.slice(0, 8),
      tier: 'FREE',
    },
  ]);

  // Skill helper: find or create skill by name
  const skillCache = new Map();
  const categoryMap = {
    JavaScript: 'LANGUAGE',
    TypeScript: 'LANGUAGE',
    Go: 'LANGUAGE',
    Rust: 'LANGUAGE',
    'Node.js': 'FRAMEWORK',
    CSS: 'FRAMEWORK',
    React: 'FRAMEWORK',
    PostgreSQL: 'DATABASE',
    Redis: 'DATABASE',
    Docker: 'CLOUD_DEVOPS',
    Kubernetes: 'CLOUD_DEVOPS',
    AWS: 'CLOUD_DEVOPS',
    'CI/CD': 'CLOUD_DEVOPS',
    Linux: 'TOOL',
    Git: 'TOOL',
    gRPC: 'ARCHITECTURE',
    Kafka: 'ARCHITECTURE',
    'Distributed Systems': 'CONCEPT',
  };

  async function resolveSkill(name) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const category = categoryMap[name] || 'CONCEPT';
    if (skillCache.has(slug)) return skillCache.get(slug);
    const [existing] = await db.select().from(skills).where(eq(skills.slug, slug)).limit(1);
    if (existing) {
      skillCache.set(slug, existing);
      return existing;
    }
    const [inserted] = await db
      .insert(skills)
      .values({
        id: crypto.randomUUID(),
        name,
        slug,
        category,
        aliases: [],
      })
      .returning();
    skillCache.set(slug, inserted);
    return inserted;
  }

  // 2. Archetype A: New Candidate (Empty Slate)
  const personaA = {
    key: 'A',
    label: 'New Candidate (Empty Slate)',
    tenantId: tenant1Id,
    userId: crypto.randomUUID(),
    candidateId: crypto.randomUUID(),
    email: 'alex.rivers@careerhub.test',
    displayName: 'Alex Rivers',
    role: 'MEMBER',
  };
  await db.insert(users).values({
    id: personaA.userId,
    tenantId: personaA.tenantId,
    email: personaA.email,
    displayName: personaA.displayName,
    role: personaA.role,
    status: 'ACTIVE',
  });
  await db.insert(candidates).values({
    id: personaA.candidateId,
    tenantId: personaA.tenantId,
    userId: personaA.userId,
    displayName: personaA.displayName,
    canonicalEmail: personaA.email,
    headline: 'Aspiring Software Engineer',
    profileMetadata: {},
  });

  // 3. Archetype B: Partial Candidate (Missing Phone, Incomplete Claims)
  const personaB = {
    key: 'B',
    label: 'Partial Candidate (Missing Phone, Claimed Skills)',
    tenantId: tenant1Id,
    userId: crypto.randomUUID(),
    candidateId: crypto.randomUUID(),
    email: 'jordan.lee@careerhub.test',
    displayName: 'Jordan Lee',
    role: 'MEMBER',
  };
  await db.insert(users).values({
    id: personaB.userId,
    tenantId: personaB.tenantId,
    email: personaB.email,
    displayName: personaB.displayName,
    role: personaB.role,
    status: 'ACTIVE',
  });
  await db.insert(candidates).values({
    id: personaB.candidateId,
    tenantId: personaB.tenantId,
    userId: personaB.userId,
    displayName: personaB.displayName,
    canonicalEmail: personaB.email,
    headline: 'Junior Web Developer',
    location: 'San Francisco, CA',
    phone: null, // Deliberately missing to trigger completeness prompt
    profileMetadata: {
      userCustom: {
        summary:
          'Passionate self-taught developer looking for frontend and full-stack opportunities.',
      },
    },
  });
  // 2 Claimed skills
  for (const skillName of ['JavaScript', 'CSS']) {
    const s = await resolveSkill(skillName);
    await db.insert(candidateSkills).values({
      id: crypto.randomUUID(),
      tenantId: personaB.tenantId,
      candidateId: personaB.candidateId,
      skillId: s.id,
      category: s.category,
      provenanceStatus: 'CLAIMED',
    });
  }
  // 1 Claimed project
  await db.insert(projects).values({
    id: crypto.randomUUID(),
    tenantId: personaB.tenantId,
    candidateId: personaB.candidateId,
    name: 'Personal Portfolio Site',
    slug: 'personal-portfolio-site',
    headline: 'Responsive portfolio website built with HTML and CSS',
    summary: 'A clean, semantic portfolio showcasing early personal projects.',
    role: 'Creator & Maintainer',
    isHighlighted: true,
    metadata: {},
  });

  // 4. Archetype C: Junior Backend Candidate
  const personaC = {
    key: 'C',
    label: 'Junior Backend Engineer',
    tenantId: tenant1Id,
    userId: crypto.randomUUID(),
    candidateId: crypto.randomUUID(),
    resumeId: crypto.randomUUID(),
    email: 'taylor.coder@careerhub.test',
    displayName: 'Taylor Coder',
    role: 'MEMBER',
  };
  await db.insert(users).values({
    id: personaC.userId,
    tenantId: personaC.tenantId,
    email: personaC.email,
    displayName: personaC.displayName,
    role: personaC.role,
    status: 'ACTIVE',
  });
  const juniorSource = studioPersonas().junior;
  await db.insert(candidates).values({
    id: personaC.candidateId,
    tenantId: personaC.tenantId,
    userId: personaC.userId,
    displayName: personaC.displayName,
    canonicalEmail: personaC.email,
    headline: 'Junior Backend Engineer',
    phone: '+1-555-010-2345',
    location: 'Austin, TX',
    profileMetadata: {
      resumeData: {
        ...juniorSource,
        sourceResumeId: personaC.resumeId,
        sourceVersion: 1,
      },
    },
  });

  // Repository resource for Candidate C evidence
  const resourceCId = crypto.randomUUID();
  await db.insert(resources).values({
    id: resourceCId,
    tenantId: personaC.tenantId,
    candidateId: personaC.candidateId,
    provider: 'GITHUB_APP',
    resourceType: 'REPOSITORY',
    externalResourceId: 'repo-c-101',
    name: 'library-api',
    displayName: 'taylor/library-api',
  });

  // 5 Verified skills
  for (const skillName of ['Node.js', 'TypeScript', 'PostgreSQL', 'Docker', 'Git']) {
    const s = await resolveSkill(skillName);
    await db.insert(candidateSkills).values({
      id: crypto.randomUUID(),
      tenantId: personaC.tenantId,
      candidateId: personaC.candidateId,
      skillId: s.id,
      category: s.category,
      provenanceStatus: 'VERIFIED',
    });
    await db.insert(evidenceItems).values({
      id: crypto.randomUUID(),
      tenantId: personaC.tenantId,
      candidateId: personaC.candidateId,
      resourceId: resourceCId,
      skillId: s.id,
      evidenceType: 'CODE_IMPORT_USAGE',
      sourceProvider: 'GITHUB_APP',
      sourceLocation: { filePath: 'src/server.ts', line: 1 },
      confidenceScore: 0.95,
      excerpt: `import { ${skillName} } from './modules';`,
      metadata: { verification: { verifiedSourceFact: true } },
    });
  }
  // 1 Project
  const projectCId = crypto.randomUUID();
  await db.insert(projects).values({
    id: projectCId,
    tenantId: personaC.tenantId,
    candidateId: personaC.candidateId,
    name: 'Library Lending API',
    slug: 'library-lending-api',
    headline: 'RESTful API with TypeScript, PostgreSQL, and Jest',
    summary:
      'Engineered a complete lending API with database migrations, JWT auth, and 95% test coverage.',
    role: 'Backend Developer',
    isHighlighted: true,
    metadata: { technologies: ['TypeScript', 'Node.js', 'PostgreSQL'] },
  });
  // 1 Base resume
  const storedDocC = await storage.storeEncryptedDocument({
    tenantId: personaC.tenantId,
    candidateId: personaC.candidateId,
    buffer: Buffer.from('Synthetic Master Resume for Taylor Coder (Junior Backend)'),
    originalFileName: 'taylor-coder-junior-backend.pdf',
    mimeType: 'application/pdf',
  });
  await resumeRepo.createResume({
    id: personaC.resumeId,
    tenantId: personaC.tenantId,
    candidateId: personaC.candidateId,
    version: 1,
    fileName: 'taylor-coder-junior-backend.pdf',
    mimeType: 'application/pdf',
    ...storedDocC,
    lifecycleState: 'BASE_RESUME',
    isBaseResume: true,
  });
  // 1 Saved Job Application
  const appCId = crypto.randomUUID();
  await db.insert(jobApplications).values({
    id: appCId,
    tenantId: personaC.tenantId,
    candidateId: personaC.candidateId,
    companyName: 'Synthetix Inc.',
    jobTitle: 'Junior Backend Developer',
    jobUrl: 'https://boards.greenhouse.io/synthetix/jobs/gh-synthetix-junior-backend',
    status: 'SAVED',
    matchScore: 84,
    notes: 'Saved from Radar discovery.',
    metadata: {},
  });
  // 1 Studio Draft for Candidate C
  const draftService = new ResumeStudioDraftService({ database: db });
  const draftC = await draftService.create(
    {
      tenantId: personaC.tenantId,
      userId: personaC.userId,
      candidateId: personaC.candidateId,
      role: personaC.role,
    },
    {
      source: { kind: 'RESUME', resumeId: personaC.resumeId },
      jobTarget: {
        title: 'Junior Backend Developer',
        company: 'Synthetix Inc.',
        sourceUrl: 'https://boards.greenhouse.io/synthetix/jobs/gh-synthetix-junior-backend',
        rawDescription:
          'Requirements: Node.js, TypeScript, PostgreSQL, REST APIs, Git, Docker. Enthusiastic about automated tests and clear documentation.',
      },
    }
  );
  personaC.draftId = draftC.id;

  // 5. Archetype D: Experienced Lead Engineer (Rich Data, 4 Applications, Studio Draft)
  const personaD = {
    key: 'D',
    label: 'Experienced Lead Engineer (Rich Data, 4 Apps, Studio Draft)',
    tenantId: tenant1Id,
    userId: crypto.randomUUID(),
    candidateId: crypto.randomUUID(),
    resumeId1: crypto.randomUUID(),
    resumeId2: crypto.randomUUID(),
    email: 'morgan.vance@careerhub.test',
    displayName: 'Morgan Vance',
    role: 'OWNER',
  };
  await db.insert(users).values({
    id: personaD.userId,
    tenantId: personaD.tenantId,
    email: personaD.email,
    displayName: personaD.displayName,
    role: personaD.role,
    status: 'ACTIVE',
  });
  const experiencedSource = studioPersonas().experienced;
  experiencedSource.experience[0].bullets[0] =
    'Implemented React views with the use of component interfaces in order to support internal workflows.';
  await db.insert(candidates).values({
    id: personaD.candidateId,
    tenantId: personaD.tenantId,
    userId: personaD.userId,
    displayName: personaD.displayName,
    canonicalEmail: personaD.email,
    headline: 'Staff Distributed Systems Engineer',
    phone: '+1-555-019-9876',
    location: 'Seattle, WA',
    profileMetadata: {
      resumeData: {
        ...experiencedSource,
        sourceResumeId: personaD.resumeId1,
        sourceVersion: 1,
      },
      userCustom: {
        education: [
          {
            institution: 'University of Washington',
            degree: 'Master of Science',
            fieldOfStudy: 'Computer Science & Engineering',
            startDate: '2014',
            endDate: '2016',
          },
          {
            institution: 'University of California, Berkeley',
            degree: 'Bachelor of Science',
            fieldOfStudy: 'Electrical Engineering & Computer Science',
            startDate: '2010',
            endDate: '2014',
          },
        ],
      },
    },
  });

  // Repository resource for Candidate D evidence
  const resourceDId = crypto.randomUUID();
  await db.insert(resources).values({
    id: resourceDId,
    tenantId: personaD.tenantId,
    candidateId: personaD.candidateId,
    provider: 'GITHUB_APP',
    resourceType: 'REPOSITORY',
    externalResourceId: 'repo-d-201',
    name: 'mesh-consensus',
    displayName: 'morgan/mesh-consensus',
  });

  // 12 Verified Skills for Archetype D
  const leadSkills = [
    'Go',
    'Rust',
    'Kubernetes',
    'gRPC',
    'PostgreSQL',
    'Kafka',
    'Distributed Systems',
    'CI/CD',
    'Linux',
    'Docker',
    'AWS',
    'Redis',
  ];
  for (const skillName of leadSkills) {
    const s = await resolveSkill(skillName);
    await db.insert(candidateSkills).values({
      id: crypto.randomUUID(),
      tenantId: personaD.tenantId,
      candidateId: personaD.candidateId,
      skillId: s.id,
      category: s.category,
      provenanceStatus: 'VERIFIED',
    });
    await db.insert(evidenceItems).values({
      id: crypto.randomUUID(),
      tenantId: personaD.tenantId,
      candidateId: personaD.candidateId,
      resourceId: resourceDId,
      skillId: s.id,
      evidenceType: 'CODE_IMPORT_USAGE',
      sourceProvider: 'GITHUB_APP',
      sourceLocation: { filePath: `pkg/core/${s.slug}.go`, line: 1 },
      confidenceScore: 0.98,
      excerpt: `package core // Production verified ${skillName} implementation`,
      metadata: { verification: { verifiedSourceFact: true } },
    });
  }

  // 3 Verified Projects for Archetype D
  const leadProjects = [
    {
      name: 'Mesh Consensus Engine',
      slug: 'mesh-consensus-engine',
      headline: 'Raft-based multi-region consensus coordinator in Go',
      summary:
        'Architected a low-latency consensus engine achieving sub-10ms state synchronization across geo-distributed regions with zero data loss under simulated partitions.',
      role: 'Staff Systems Architect',
      isHighlighted: true,
      technologies: ['Go', 'Raft', 'gRPC', 'Distributed Systems'],
    },
    {
      name: 'Distributed KV Store',
      slug: 'distributed-kv-store',
      headline: 'High-throughput LSM-tree persistent storage engine in Rust',
      summary:
        'Designed an embedded LSM-tree key-value store with concurrent SSTable compaction, processing 250,000 IOPS on NVMe drives with predictable p99 latency.',
      role: 'Lead Storage Engineer',
      isHighlighted: true,
      technologies: ['Rust', 'Linux', 'Storage'],
    },
    {
      name: 'Telemetry Streaming Pipeline',
      slug: 'telemetry-streaming-pipeline',
      headline: 'Real-time telemetry event processor over Apache Kafka',
      summary:
        'Engineered an ingestion cluster handling 1.5 million events per second with automatic schema validation, backpressure mitigation, and dead-letter queuing.',
      role: 'Principal Engineer',
      isHighlighted: false,
      technologies: ['Kafka', 'Go', 'Docker', 'Kubernetes'],
    },
  ];

  for (const proj of leadProjects) {
    await db.insert(projects).values({
      id: crypto.randomUUID(),
      tenantId: personaD.tenantId,
      candidateId: personaD.candidateId,
      name: proj.name,
      slug: proj.slug,
      headline: proj.headline,
      summary: proj.summary,
      role: proj.role,
      isHighlighted: proj.isHighlighted,
      metadata: { technologies: proj.technologies },
    });
  }

  // 2 Master Resumes for Archetype D
  const storedDocD1 = await storage.storeEncryptedDocument({
    tenantId: personaD.tenantId,
    candidateId: personaD.candidateId,
    buffer: Buffer.from('Master Staff Backend Architect Resume (A4, 1-page optimized)'),
    originalFileName: 'morgan-vance-staff-architect-master.pdf',
    mimeType: 'application/pdf',
  });
  await resumeRepo.createResume({
    id: personaD.resumeId1,
    tenantId: personaD.tenantId,
    candidateId: personaD.candidateId,
    version: 1,
    fileName: 'morgan-vance-staff-architect-master.pdf',
    mimeType: 'application/pdf',
    ...storedDocD1,
    lifecycleState: 'BASE_RESUME',
    isBaseResume: true,
  });

  const storedDocD2 = await storage.storeEncryptedDocument({
    tenantId: personaD.tenantId,
    candidateId: personaD.candidateId,
    buffer: Buffer.from('Master Distributed Systems Engineer Resume'),
    originalFileName: 'morgan-vance-distributed-systems-master.pdf',
    mimeType: 'application/pdf',
  });
  await resumeRepo.createResume({
    id: personaD.resumeId2,
    tenantId: personaD.tenantId,
    candidateId: personaD.candidateId,
    version: 2,
    fileName: 'morgan-vance-distributed-systems-master.pdf',
    mimeType: 'application/pdf',
    ...storedDocD2,
    lifecycleState: 'USER_APPROVED',
    isBaseResume: false,
  });

  // 4 Applications across 4 lifecycle states for Archetype D
  // App 1: SAVED (Stripe)
  const appD1Id = crypto.randomUUID();
  await db.insert(jobApplications).values({
    id: appD1Id,
    tenantId: personaD.tenantId,
    candidateId: personaD.candidateId,
    companyName: 'Stripe',
    jobTitle: 'Staff Systems Engineer, Distributed Infrastructure',
    jobUrl: 'https://boards.greenhouse.io/stripe/jobs/gh-stripe-staff-sys',
    status: 'SAVED',
    matchScore: 94,
    notes: 'Saved from Radar fit evaluation. Ready to initiate tailoring in Studio.',
    metadata: {},
  });

  // App 2: PREPARED (Datadog)
  const appD2Id = crypto.randomUUID();
  await db.insert(jobApplications).values({
    id: appD2Id,
    tenantId: personaD.tenantId,
    candidateId: personaD.candidateId,
    companyName: 'Datadog',
    jobTitle: 'Lead Distributed Systems Engineer, Telemetry Core',
    jobUrl: 'https://jobs.lever.co/datadog/lever-datadog-lead-dist',
    status: 'PREPARED',
    matchScore: 91,
    notes: 'Tailored resume generated and verified against 1-page A4 geometry bounds.',
    metadata: {},
  });
  await db.insert(tailoredDocuments).values({
    id: crypto.randomUUID(),
    tenantId: personaD.tenantId,
    applicationId: appD2Id,
    candidateId: personaD.candidateId,
    documentType: 'TAILORED_RESUME',
    version: 1,
    title: 'Tailored Resume — Datadog Lead Distributed',
    content: {
      headline: 'Lead Distributed Systems Engineer',
      summary:
        'Architect with extensive background in Kafka telemetry streaming and Go microservices.',
    },
    renderedMarkdown: '# Morgan Vance\nLead Distributed Systems Engineer',
    renderedPlainText: 'Morgan Vance - Lead Distributed Systems Engineer',
    contentHash: crypto.createHash('sha256').update('datadog-tailored-resume').digest('hex'),
    integrityScore: 0.96,
    atsFitScore: 0.91,
  });

  // App 3: HANDOFF_READY (Snowflake)
  const appD3Id = crypto.randomUUID();

  const rawPkg = {
    candidateId: personaD.candidateId,
    candidateName: personaD.displayName,
    candidateEmail: personaD.email,
    candidatePhone: '+1-555-019-9876',
    targetJob: {
      id: appD3Id,
      company: 'Snowflake',
      title: 'Principal Backend Architect, Query Mesh',
      applicationUrl: 'https://boards.greenhouse.io/snowflake/jobs/gh-snowflake-prin-arch',
      directPortalUrl: 'https://boards.greenhouse.io/snowflake/jobs/gh-snowflake-prin-arch',
      description: 'Snowflake platform architecture for distributed systems.',
      retrievedAt: new Date().toISOString(),
    },
    tailoredResume: {
      title: 'Tailored Resume — Snowflake',
      markdownContent:
        '# Morgan Vance\n\n- Architected distributed query engines and maintained database performance benchmarks.\n',
      contentHash: crypto.createHash('sha256').update('snowflake-tailored-resume').digest('hex'),
      fitScore: 96,
    },
    coverLetter: {
      title: 'Cover Letter — Snowflake',
      markdownContent:
        '# Application\n\nDear Hiring Team at Snowflake,\n\nI am thrilled to apply for the Principal Backend Architect role.\n',
      contentHash: crypto.createHash('sha256').update('snowflake-cover-letter').digest('hex'),
    },
    verifiedSkills: leadSkills.map((s) => ({ name: s, truthCategory: 'VERIFIED' })),
    claimedSkills: [],
    portfolioLinks: [{ platform: 'GitHub', url: 'https://github.com/morgan-vance' }],
    answers: {
      workAuthorization: 'Authorized to work in the US without sponsorship',
      noticePeriod: '2 weeks',
      preferredLocation: 'Remote or Seattle, WA',
    },
  };

  const currentPackage = await sealGeneratedPackage(
    db,
    { tenantId: personaD.tenantId, candidateId: personaD.candidateId },
    rawPkg
  );

  const storedHandoffResume = await storage.storeEncryptedDocument({
    tenantId: personaD.tenantId,
    candidateId: personaD.candidateId,
    buffer: Buffer.from('Official Tailored A4 PDF for Snowflake Principal Architect application'),
    originalFileName: 'morgan-vance-snowflake-principal-architect.pdf',
    mimeType: 'application/pdf',
    generatedPackage: {
      receipt: currentPackage.evidenceTrustReceipt,
      bodyHash: packageBodyHash(currentPackage),
      packageHash: currentPackage.packageHash,
    },
  });

  const storedHandoffCoverLetter = await storage.storeEncryptedDocument({
    tenantId: personaD.tenantId,
    candidateId: personaD.candidateId,
    buffer: Buffer.from(
      'Official Tailored Cover Letter PDF for Snowflake Principal Architect application'
    ),
    originalFileName: 'morgan-vance-snowflake-cover-letter.pdf',
    mimeType: 'application/pdf',
    generatedPackage: {
      receipt: currentPackage.evidenceTrustReceipt,
      bodyHash: packageBodyHash(currentPackage),
      packageHash: currentPackage.packageHash,
    },
  });

  const handoffKitPayload = {
    status: 'HANDOFF_READY',
    packageHash: currentPackage.packageHash,
    applicationId: appD3Id,
    submissionNotice:
      'Package compiled for human-in-the-loop submission. External submission has not occurred.',
    targetJob: {
      title: 'Principal Backend Architect, Query Mesh',
      company: 'Snowflake',
      location: 'Bellevue, WA / Remote',
      directPortalUrl: 'https://boards.greenhouse.io/snowflake/jobs/gh-snowflake-prin-arch',
    },
    candidate: {
      fullName: 'Morgan Vance',
      email: personaD.email,
      phone: '+1-555-019-9876',
      location: 'Seattle, WA',
      linkedin: 'https://linkedin.com/in/morgan-vance-dist',
      github: 'https://github.com/morgan-vance',
    },
    resume: {
      filename: 'morgan-vance-snowflake-principal-architect.pdf',
      mimeType: 'application/pdf',
      contentHash: storedHandoffResume.contentHash,
      fileSizeBytes: storedHandoffResume.fileSizeBytes,
      storageKey: storedHandoffResume.storageKey,
      viewUrl: `/api/applications/${appD3Id}/artifacts/resume/view`,
      downloadUrl: `/api/applications/${appD3Id}/artifacts/resume/download`,
      qaAudit: { passed: true, score: 96, qualityLevel: 'EXCELLENT' },
    },
    coverLetter: {
      filename: 'morgan-vance-snowflake-cover-letter.pdf',
      mimeType: 'application/pdf',
      contentHash: storedHandoffCoverLetter.contentHash,
      fileSizeBytes: storedHandoffCoverLetter.fileSizeBytes,
      storageKey: storedHandoffCoverLetter.storageKey,
      viewUrl: `/api/applications/${appD3Id}/artifacts/cover-letter/view`,
      downloadUrl: `/api/applications/${appD3Id}/artifacts/cover-letter/download`,
      qaAudit: { passed: true, score: 96, qualityLevel: 'EXCELLENT' },
    },
    answers: currentPackage.answers,
    readiness: [
      { field: 'FullName', status: 'READY', value: 'Morgan Vance' },
      { field: 'Email', status: 'READY', value: personaD.email },
      { field: 'Phone', status: 'READY', value: '+1-555-019-9876' },
      { field: 'Resume', status: 'READY', value: 'Attached PDF (1 page)' },
    ],
    directPortalUrl: 'https://boards.greenhouse.io/snowflake/jobs/gh-snowflake-prin-arch',
    generatedAt: new Date().toISOString(),
  };

  sealHandoffManifest(
    handoffKitPayload,
    { tenantId: personaD.tenantId, candidateId: personaD.candidateId },
    currentPackage
  );

  await db.insert(jobApplications).values({
    id: appD3Id,
    tenantId: personaD.tenantId,
    candidateId: personaD.candidateId,
    companyName: 'Snowflake',
    jobTitle: 'Principal Backend Architect, Query Mesh',
    jobUrl: 'https://boards.greenhouse.io/snowflake/jobs/gh-snowflake-prin-arch',
    status: 'HANDOFF_READY',
    matchScore: 96,
    notes:
      'Handoff kit prepared and verified. Copy-paste answers and verified PDF ready for portal submission.',
    metadata: {
      handoffKit: handoffKitPayload,
      currentPackageHash: currentPackage.packageHash,
      destinationUrl: 'https://boards.greenhouse.io/snowflake/jobs/gh-snowflake-prin-arch',
      externalSubmissionState: 'HANDOFF_READY',
    },
  });

  await db.insert(applicationPackages).values({
    id: crypto.randomUUID(),
    tenantId: personaD.tenantId,
    applicationId: appD3Id,
    candidateId: personaD.candidateId,
    version: 1,
    packageHash: currentPackage.packageHash,
    resumeContentHash: storedHandoffResume.contentHash,
    fitScore: 96,
    answers: handoffKitPayload.answers,
    packagePayload: currentPackage,
    source: 'PREPARE_JOB_APPLICATION',
    lifecycleState: 'CURRENT',
  });

  await db.insert(tailoredDocuments).values({
    id: crypto.randomUUID(),
    tenantId: personaD.tenantId,
    applicationId: appD3Id,
    candidateId: personaD.candidateId,
    documentType: 'TAILORED_RESUME',
    version: 1,
    title: 'Tailored Resume — Snowflake',
    content: {
      markdownContent: currentPackage.tailoredResume.markdownContent,
      packageHash: currentPackage.packageHash,
    },
    renderedMarkdown: currentPackage.tailoredResume.markdownContent,
    renderedPlainText: 'Morgan Vance - Principal Backend Architect',
    contentHash: currentPackage.tailoredResume.contentHash,
    metadata: {
      source: 'APPLICATION_HANDOFF',
      packageHash: currentPackage.packageHash,
      artifact: {
        filename: 'morgan-vance-snowflake-principal-architect.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: storedHandoffResume.fileSizeBytes,
        contentHash: storedHandoffResume.contentHash,
        status: 'READY',
        storageKey: storedHandoffResume.storageKey,
        viewUrl: `/api/applications/${appD3Id}/artifacts/resume/view`,
        downloadUrl: `/api/applications/${appD3Id}/artifacts/resume/download`,
        packageHash: currentPackage.packageHash,
      },
    },
    integrityScore: 0.96,
    atsFitScore: 0.96,
  });

  await db.insert(tailoredDocuments).values({
    id: crypto.randomUUID(),
    tenantId: personaD.tenantId,
    applicationId: appD3Id,
    candidateId: personaD.candidateId,
    documentType: 'TAILORED_COVER_LETTER',
    version: 1,
    title: 'Tailored Cover Letter — Snowflake',
    content: {
      markdownContent: currentPackage.coverLetter.markdownContent,
      packageHash: currentPackage.packageHash,
    },
    renderedMarkdown: currentPackage.coverLetter.markdownContent,
    renderedPlainText: 'Dear Snowflake Team',
    contentHash: currentPackage.coverLetter.contentHash,
    metadata: {
      source: 'APPLICATION_HANDOFF',
      packageHash: currentPackage.packageHash,
      artifact: {
        filename: 'morgan-vance-snowflake-cover-letter.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: storedHandoffCoverLetter.fileSizeBytes,
        contentHash: storedHandoffCoverLetter.contentHash,
        status: 'READY',
        storageKey: storedHandoffCoverLetter.storageKey,
        viewUrl: `/api/applications/${appD3Id}/artifacts/cover-letter/view`,
        downloadUrl: `/api/applications/${appD3Id}/artifacts/cover-letter/download`,
        packageHash: currentPackage.packageHash,
      },
    },
    integrityScore: 0.96,
  });

  // App 4: APPLIED (HashiCorp)
  const appD4Id = crypto.randomUUID();
  await db.insert(jobApplications).values({
    id: appD4Id,
    tenantId: personaD.tenantId,
    candidateId: personaD.candidateId,
    companyName: 'HashiCorp',
    jobTitle: 'Staff Infrastructure Engineer, Cloud Ecosystems',
    jobUrl: 'https://jobs.lever.co/hashicorp/lever-hashicorp-staff-infra',
    status: 'APPLIED',
    matchScore: 89,
    appliedAt: new Date(Date.now() - 86400000 * 3),
    notes: 'Submitted via official employer portal. Tracking interview progress.',
    metadata: {},
  });

  // Active Studio Draft for Archetype D
  const draftD = await draftService.create(
    {
      tenantId: personaD.tenantId,
      userId: personaD.userId,
      candidateId: personaD.candidateId,
      role: personaD.role,
    },
    {
      source: { kind: 'RESUME', resumeId: personaD.resumeId1 },
      jobTarget: studioJobTarget,
    }
  );
  personaD.draftId = draftD.id;
  personaD.appD3Id = appD3Id;

  // 6. Archetype E: Second Tenant / Readonly User
  const personaE = {
    key: 'E',
    label: 'Second Tenant / Readonly User (Isolation & Permission Gate)',
    tenantId: tenant2Id,
    userId: crypto.randomUUID(),
    candidateId: crypto.randomUUID(),
    resumeId: crypto.randomUUID(),
    email: 'sam.security@isolated.test',
    displayName: 'Sam Security',
    role: 'READONLY',
  };
  await db.insert(users).values({
    id: personaE.userId,
    tenantId: personaE.tenantId,
    email: personaE.email,
    displayName: personaE.displayName,
    role: personaE.role,
    status: 'ACTIVE',
  });
  await db.insert(candidates).values({
    id: personaE.candidateId,
    tenantId: personaE.tenantId,
    userId: personaE.userId,
    displayName: personaE.displayName,
    canonicalEmail: personaE.email,
    headline: 'Security Compliance Analyst',
    profileMetadata: {
      resumeData: {
        ...studioPersonas()['mid-level'],
        sourceResumeId: personaE.resumeId,
        sourceVersion: 1,
      },
    },
  });
  const storedDocE = await storage.storeEncryptedDocument({
    tenantId: personaE.tenantId,
    candidateId: personaE.candidateId,
    buffer: Buffer.from('Isolated Tenant Master Resume for Sam Security'),
    originalFileName: 'sam-security-isolated.pdf',
    mimeType: 'application/pdf',
  });
  await resumeRepo.createResume({
    id: personaE.resumeId,
    tenantId: personaE.tenantId,
    candidateId: personaE.candidateId,
    version: 1,
    fileName: 'sam-security-isolated.pdf',
    mimeType: 'application/pdf',
    ...storedDocE,
    lifecycleState: 'BASE_RESUME',
    isBaseResume: true,
  });
  const draftE = await draftService.create(
    {
      tenantId: personaE.tenantId,
      userId: personaE.userId,
      candidateId: personaE.candidateId,
      role: 'MEMBER', // create draft as member then user is READONLY
    },
    {
      source: { kind: 'RESUME', resumeId: personaE.resumeId },
      jobTarget: studioJobTarget,
    }
  );
  personaE.draftId = draftE.id;

  // 7. Deterministic Synthetic AI Provider for Resume Studio
  const studioAiProvider = {
    async generateStructured(request) {
      const candidateVariants = request.candidateFacts?.variants || [];
      const factId = request.candidateFacts?.facts?.[0]?.factId || 'fact-1';
      const proposedText =
        candidateVariants.at(-1) ||
        'Architected fault-tolerant distributed systems and maintained PostgreSQL query performance benchmarks.';
      return {
        data: {
          proposedText,
          factIds: [factId],
          truthState: 'CLAIMED',
        },
        provider: 'synthetic',
        modelId: 'deterministic-acceptance-studio',
      };
    },
  };

  // 8. Custom JobDiscoveryService with realistic jobs for Radar
  const jobDiscoveryService = new JobDiscoveryService({
    customJobs: BROWSER_ACCEPTANCE_JOBS,
    includeSynthetic: false,
  });

  // 9. Build and launch Fastify application
  const app = await buildApp({
    logger: false,
    resumeStudioAiProvider: studioAiProvider,
    jobDiscoveryService,
  });

  await app.listen({ host: '127.0.0.1', port: assignedPort });
  const serverPort = app.server.address().port;
  const baseUrl = `http://127.0.0.1:${serverPort}`;

  // 10. Generate sessions and dev-login links for all personas
  const personas = [personaA, personaB, personaC, personaD, personaE];
  for (const p of personas) {
    const session = await createSession(db, {
      userId: p.userId,
      tenantId: p.tenantId,
      ipAddress: '127.0.0.1',
      userAgent: 'Real-Browser-Acceptance-Agent/1.0',
    });
    p.rawSessionToken = session.rawToken;
    p.csrfToken = generateCsrfToken(session.sessionId);
    p.loginUrl = `${baseUrl}/auth/dev-login?userId=${encodeURIComponent(p.userId)}&returnTo=/dashboard`;
    p.studioUrl = p.draftId ? `${baseUrl}/resume-studio?draftId=${p.draftId}` : null;
  }

  const manifest = {
    baseUrl,
    port: serverPort,
    database: 'product_audit_resume_studio',
    databasePort: 55447,
    startedAt: new Date().toISOString(),
    personas: personas.map((p) => ({
      key: p.key,
      label: p.label,
      email: p.email,
      displayName: p.displayName,
      role: p.role,
      tenantId: p.tenantId,
      candidateId: p.candidateId,
      loginUrl: p.loginUrl,
      draftId: p.draftId || null,
      appD3Id: p.appD3Id || null,
      studioUrl: p.studioUrl || null,
    })),
    routes: [
      { name: 'Root Landing', path: '/' },
      { name: 'Login Portal', path: '/login' },
      { name: 'Candidate Dashboard', path: '/dashboard' },
      { name: 'Onboarding Wizard', path: '/onboarding' },
      { name: 'Profile Editor', path: '/profile' },
      { name: 'Skills Explorer', path: '/skills' },
      { name: 'Projects Portfolio', path: '/projects' },
      { name: 'Connected Sources', path: '/sources' },
      { name: 'Radar Job Discovery', path: '/apps/radar' },
      { name: 'Resumes Hub', path: '/resumes' },
      { name: 'Resume Studio', path: '/resume-studio' },
      { name: 'Applications Board', path: '/applications' },
      { name: 'Snowflake Handoff Kit', path: `/applications/${appD3Id}/handoff` },
      { name: 'AI Connection Center', path: '/connect' },
      { name: 'Account Settings', path: '/settings' },
      { name: 'MCP Documentation', path: '/docs/mcp' },
    ],
  };

  const runtimeFile = path.resolve(__dirname, '../output/server-browser-acceptance.json');
  await fs.mkdir(path.dirname(runtimeFile), { recursive: true });
  await fs.writeFile(runtimeFile, JSON.stringify(manifest, null, 2));

  let closed = false;
  const cleanup = async () => {
    if (closed) return;
    closed = true;
    try {
      await app.close();
    } catch {
      // ignore app close error on exit
    }
    try {
      for (const tId of [tenant1Id, tenant2Id]) {
        await db.delete(tenants).where(eq(tenants.id, tId));
      }
    } catch {
      // ignore tenant delete error on exit
    }
    try {
      await fs.rm(actualStorageDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    await closeDatabase();
  };

  return {
    app,
    baseUrl,
    personas,
    manifest,
    runtimeFile,
    cleanup,
  };
}

// Standalone execution entrypoint
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const harness = await startBrowserAcceptanceHarness();
  console.log('Antigravity Career Hub Acceptance Server running at: ' + harness.baseUrl);
  console.log('Manifest written to: ' + harness.runtimeFile);
  for (const p of harness.personas) {
    console.log(`[Archetype ${p.key}] ${p.displayName} (${p.email}): ${p.loginUrl}`);
  }
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
      console.log('\nShutting down acceptance server...');
      await harness.cleanup();
      process.exit(0);
    });
  }
}
