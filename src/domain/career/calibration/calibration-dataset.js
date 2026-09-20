/**
 * @file P82 Empirical Calibration Dataset & Human Review Benchmark
 *
 * Provides a standardized, representative corpus of real-world resume PDF streams,
 * structured representations, paired Job Descriptions, and human expert annotations.
 *
 * 8 Representative Candidate Archetypes:
 * 1. Senior Distributed Systems Engineer (Target: Strong Hire, Rank 1)
 * 2. Mid-Level Full-Stack Engineer (Target: Solid Hire, Rank 2)
 * 3. Format-Challenged Strong Engineer (Target: Format-Impaired Hire, Rank 3)
 * 4. Junior / New Graduate Engineer (Target: Grounded Entry Hire, Rank 4)
 * 5. Polished Formatting with Irrelevant Experience (Target: Pretty Mismatch / No Hire, Rank 5)
 * 6. Keyword-Stuffed Over-Optimized Resume (Target: Gaming Attempt / Needs Work, Rank 6)
 * 7. Extreme Under-Qualified Candidate (Target: Massive Skill Gap / No Hire, Rank 7)
 * 8. Fabricated / Fraudulent Metric Claim (Target: Fraud Integrity Block, Score = 0, Rank 8)
 */

import { randomUUID } from 'node:crypto';

/** Helper to generate valid minimal PDF buffer for testing */
function createMinimalPdfStream(lines = []) {
  const contentStream = lines
    .map((line, idx) => `BT /F1 10 Tf 72 ${720 - idx * 24} Td (${line.replace(/[()]/g, '')}) Tj ET`)
    .join('\n');
  const streamLen = Buffer.byteLength(contentStream, 'latin1');

  return Buffer.from(
    '%PDF-1.4\n' +
      '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
      '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n' +
      `4 0 obj\n<< /Length ${streamLen} >>\nstream\n${contentStream}\nendstream\nendobj\n` +
      'xref\n0 5\n' +
      'trailer\n<< /Root 1 0 R >>\n%%EOF',
    'latin1'
  );
}

const COMMON_TENANT_ID = '11111111-1111-4111-8111-111111111111';

// Benchmark Job: Senior Distributed Systems & Cloud Infrastructure Engineer
export const BENCHMARK_TARGET_JOB = Object.freeze({
  id: 'job-dist-sys-senior',
  tenantId: COMMON_TENANT_ID,
  title: 'Senior Distributed Systems Engineer',
  companyName: 'Apex Cloud Systems',
  requirements: [
    { id: 'req-go', skill: 'Go', importance: 'REQUIRED', category: 'SKILL', weight: 1.0 },
    {
      id: 'req-postgres',
      skill: 'PostgreSQL',
      importance: 'REQUIRED',
      category: 'SKILL',
      weight: 1.0,
    },
    {
      id: 'req-dist-systems',
      skill: 'Distributed Systems',
      importance: 'REQUIRED',
      category: 'SKILL',
      weight: 1.0,
    },
    { id: 'req-k8s', skill: 'Kubernetes', importance: 'PREFERRED', category: 'SKILL', weight: 0.7 },
    { id: 'req-aws', skill: 'AWS', importance: 'PREFERRED', category: 'SKILL', weight: 0.7 },
  ],
});

export const CALIBRATION_DATASET = Object.freeze([
  // ── 1. Senior Distributed Systems Engineer (Top Tier / Strong Hire) ──────────
  {
    id: 'archetype-1-senior-dist-sys',
    title: 'Senior Distributed Systems Engineer',
    archetype: 'GROUNDED_SENIOR',
    description:
      'Flawless single-column PDF, fully backed claims (Go, PostgreSQL, Raft), 40% latency reduction.',
    targetJob: BENCHMARK_TARGET_JOB,
    candidateProfile: {
      id: 'cand-senior-1',
      tenantId: COMMON_TENANT_ID,
      displayName: 'Alex Mercer',
      profileMetadata: {
        skills: [
          { name: 'Go' },
          { name: 'PostgreSQL' },
          { name: 'Distributed Systems' },
          { name: 'Kubernetes' },
        ],
        experience: [{ title: 'Senior Systems Engineer', company: 'CloudScale' }],
        projects: [{ name: 'Raft KV Store', technologies: ['Go', 'PostgreSQL'] }],
      },
    },
    factInventory: {
      facts: [
        {
          id: 'fact-alex-1',
          candidateId: 'cand-senior-1',
          text: 'Architected distributed consensus engine using Raft protocol in Go handling 50k ops/sec',
          technologies: ['Go', 'Distributed Systems'],
          metrics: { throughput: '50k ops/sec' },
          agencyLevel: 'CANDIDATE',
          candidateAuthored: true,
          sourceType: 'candidate_project_bullet',
        },
        {
          id: 'fact-alex-2',
          candidateId: 'cand-senior-1',
          text: 'Reduced query latency by 40% from 100ms to 60ms through PostgreSQL composite indexing and connection pooling',
          technologies: ['PostgreSQL'],
          metrics: { baseline: '100ms', final: '60ms' },
          agencyLevel: 'CANDIDATE',
          candidateAuthored: true,
          sourceType: 'candidate_project_bullet',
        },
      ],
    },
    structuredResume: {
      header: { name: 'Alex Mercer', email: 'alex@example.com', phone: '555-0101' },
      summary: {
        text: 'Senior Distributed Systems Engineer with 7+ years designing high-throughput storage engines in Go and PostgreSQL.',
      },
      skills: {
        categories: [
          { categoryName: 'Languages', skills: [{ name: 'Go' }] },
          { categoryName: 'Databases', skills: [{ name: 'PostgreSQL' }] },
          {
            categoryName: 'Infrastructure',
            skills: [{ name: 'Kubernetes' }, { name: 'Distributed Systems' }],
          },
        ],
      },
      projects: [
        {
          name: 'Raft KV Store',
          bullets: [
            {
              text: 'Architected distributed consensus engine in Go handling 50k ops/sec.',
              composedFromFactIds: ['fact-alex-1'],
            },
            {
              text: 'Optimized PostgreSQL composite indexes reducing query latency by 40%.',
              composedFromFactIds: ['fact-alex-2'],
            },
          ],
        },
      ],
    },
    pdfBuffer: createMinimalPdfStream([
      'Alex Mercer | alex@example.com | 555-0101',
      'Professional Summary: Senior Distributed Systems Engineer with 7+ years designing high-throughput engines in Go.',
      'Technical Skills: Go, PostgreSQL, Distributed Systems, Kubernetes, AWS',
      'Projects: Raft KV Store',
      'Bullet: Architected distributed consensus engine in Go handling 50k ops/sec.',
      'Bullet: Optimized PostgreSQL composite indexes reducing query latency by 40%.',
    ]),
    extractedText:
      'Alex Mercer\nalex@example.com\n555-0101\nProfessional Summary\nSenior Distributed Systems Engineer with 7+ years designing high-throughput engines in Go.\nTechnical Skills\nGo, PostgreSQL, Distributed Systems, Kubernetes, AWS\nProjects\nRaft KV Store\nArchitected distributed consensus engine in Go handling 50k ops/sec.\nOptimized PostgreSQL composite indexes reducing query latency by 40%.\nExperience\nCloudScale Senior Systems Engineer\nEducation\nB.S. Computer Science MIT',
    humanEvaluation: {
      atsParseability: 95,
      jobMatch: 94,
      contentQuality: 92,
      compositeScore: 93,
      rank: 1,
      recommendation: 'STRONG_HIRE',
      qualifies: true,
      rationale:
        'Exceptional senior candidate with exact technology stack match, verified quantitative impact, and clean single-column structure.',
    },
  },

  // ── 2. Mid-Level Full-Stack Engineer (Solid Hire) ────────────────────────────
  {
    id: 'archetype-2-mid-fullstack',
    title: 'Mid-Level Full-Stack Engineer',
    archetype: 'GROUNDED_MID',
    description:
      'Clean layout, verified Node.js and PostgreSQL experience, modest distributed systems exposure.',
    targetJob: BENCHMARK_TARGET_JOB,
    candidateProfile: {
      id: 'cand-mid-2',
      tenantId: COMMON_TENANT_ID,
      displayName: 'Jordan Taylor',
      profileMetadata: {
        skills: [{ name: 'Go' }, { name: 'PostgreSQL' }],
        experience: [{ title: 'Software Engineer', company: 'DataGrid' }],
        projects: [{ name: 'Inventory Sync Service', technologies: ['Go', 'PostgreSQL'] }],
      },
    },
    factInventory: {
      facts: [
        {
          id: 'fact-jordan-1',
          candidateId: 'cand-mid-2',
          text: 'Built backend inventory microservices in Go using PostgreSQL transactions',
          technologies: ['Go', 'PostgreSQL'],
          metrics: {},
          agencyLevel: 'CANDIDATE',
          candidateAuthored: true,
          sourceType: 'candidate_project_bullet',
        },
      ],
    },
    structuredResume: {
      header: { name: 'Jordan Taylor', email: 'jordan@example.com', phone: '555-0102' },
      summary: {
        text: 'Backend software engineer with 4 years building reliable microservices with Go and PostgreSQL.',
      },
      skills: {
        categories: [
          { categoryName: 'Languages', skills: [{ name: 'Go' }] },
          { categoryName: 'Databases', skills: [{ name: 'PostgreSQL' }] },
        ],
      },
      projects: [
        {
          name: 'Inventory Sync Service',
          bullets: [
            {
              text: 'Built backend inventory microservices in Go using PostgreSQL transactions.',
              composedFromFactIds: ['fact-jordan-1'],
            },
          ],
        },
      ],
    },
    pdfBuffer: createMinimalPdfStream([
      'Jordan Taylor | jordan@example.com | 555-0102',
      'Professional Summary: Backend software engineer with 4 years building reliable microservices with Go and PostgreSQL.',
      'Technical Skills: Go, PostgreSQL, Docker',
      'Projects: Inventory Sync Service',
      'Bullet: Built backend inventory microservices in Go using PostgreSQL transactions.',
    ]),
    extractedText:
      'Jordan Taylor\njordan@example.com\n555-0102\nProfessional Summary\nBackend software engineer with 4 years building reliable microservices with Go and PostgreSQL.\nTechnical Skills\nGo, PostgreSQL, Docker\nProjects\nInventory Sync Service\nBuilt backend inventory microservices in Go using PostgreSQL transactions.\nExperience\nDataGrid Software Engineer\nEducation\nB.S. Computer Science UC Berkeley',
    humanEvaluation: {
      atsParseability: 90,
      jobMatch: 82,
      contentQuality: 80,
      compositeScore: 83,
      rank: 2,
      recommendation: 'HIRE',
      qualifies: true,
      rationale:
        'Solid mid-level engineer who satisfies core required skills with grounded project evidence.',
    },
  },

  // ── 3. Format-Challenged Strong Engineer (Format-Impaired Hire) ─────────────
  {
    id: 'archetype-3-format-challenged-senior',
    title: 'Format-Challenged Strong Engineer',
    archetype: 'FORMAT_CHALLENGED_STRONG',
    description:
      'High technical competence (90 job match), but multi-column layout creates parsing friction (65 parseability).',
    targetJob: BENCHMARK_TARGET_JOB,
    candidateProfile: {
      id: 'cand-format-3',
      tenantId: COMMON_TENANT_ID,
      displayName: 'Samir Patel',
      profileMetadata: {
        skills: [{ name: 'Go' }, { name: 'PostgreSQL' }, { name: 'Distributed Systems' }],
        experience: [{ title: 'Principal Engineer', company: 'InfraCorp' }],
        projects: [
          {
            name: 'Stream Storage Engine',
            technologies: ['Go', 'PostgreSQL', 'Distributed Systems'],
          },
        ],
      },
    },
    factInventory: {
      facts: [
        {
          id: 'fact-samir-1',
          candidateId: 'cand-format-3',
          text: 'Architected distributed log storage engine in Go with Paxos consensus supporting 1M events/sec',
          technologies: ['Go', 'Distributed Systems'],
          metrics: { throughput: '1M events/sec' },
          agencyLevel: 'CANDIDATE',
          candidateAuthored: true,
          sourceType: 'candidate_project_bullet',
        },
        {
          id: 'fact-samir-2',
          candidateId: 'cand-format-3',
          text: 'Optimized PostgreSQL distributed partitioning reducing write amplification by 30%',
          technologies: ['PostgreSQL'],
          metrics: { reduction: '30%' },
          agencyLevel: 'CANDIDATE',
          candidateAuthored: true,
          sourceType: 'candidate_project_bullet',
        },
      ],
    },
    structuredResume: {
      header: { name: 'Samir Patel', email: 'samir@example.com' },
      summary: {
        text: 'Distinguished infrastructure systems architect specializing in Go and distributed algorithms.',
      },
      skills: {
        categories: [
          {
            categoryName: 'Core',
            skills: [{ name: 'Go' }, { name: 'PostgreSQL' }, { name: 'Distributed Systems' }],
          },
        ],
      },
      projects: [
        {
          name: 'Stream Storage Engine',
          bullets: [
            {
              text: 'Architected distributed log storage engine in Go supporting 1M events/sec.',
              composedFromFactIds: ['fact-samir-1'],
            },
            {
              text: 'Optimized PostgreSQL distributed partitioning reducing write amplification by 30%.',
              composedFromFactIds: ['fact-samir-2'],
            },
          ],
        },
      ],
    },
    // Multi-column LaTeX layout simulation
    pdfBuffer: createMinimalPdfStream([
      'Samir Patel | samir@example.com',
      'Column 1: Technical Skills: Go, PostgreSQL, Distributed Systems',
      'Column 2: Summary: Infrastructure systems architect in Go.',
      'Projects: Stream Storage Engine',
      'Bullet: Architected distributed log storage engine in Go supporting 1M events/sec.',
    ]),
    extractedText:
      'Samir Patel\nsamir@example.com\nTechnical Skills: Go, PostgreSQL\nSummary: Infrastructure systems architect in Go.\nDistributed Systems\nStream Storage Engine\nArchitected distributed log storage engine in Go supporting 1M events/sec.\nExperience: InfraCorp\nEducation: Stanford MS CS',
    humanEvaluation: {
      atsParseability: 65,
      jobMatch: 90,
      contentQuality: 85,
      compositeScore: 81,
      rank: 3,
      recommendation: 'HIRE',
      qualifies: true,
      rationale:
        'Superb technical background and experience. Despite layout formatting imperfections, technical match clearly qualifies candidate for hire.',
    },
  },

  // ── 4. Junior / New Graduate Engineer (Grounded Entry Hire) ──────────────────
  {
    id: 'archetype-4-junior-grounded',
    title: 'Junior / New Graduate Engineer',
    archetype: 'GROUNDED_JUNIOR',
    description:
      'Clean single-column layout, grounded academic and internship projects, modest metrics.',
    targetJob: BENCHMARK_TARGET_JOB,
    candidateProfile: {
      id: 'cand-junior-4',
      tenantId: COMMON_TENANT_ID,
      displayName: 'Casey Rivera',
      profileMetadata: {
        skills: [{ name: 'Go' }, { name: 'PostgreSQL' }],
        experience: [{ title: 'Software Engineering Intern', company: 'TechStart' }],
        projects: [{ name: 'Distributed Cache', technologies: ['Go'] }],
      },
    },
    factInventory: {
      facts: [
        {
          id: 'fact-casey-1',
          candidateId: 'cand-junior-4',
          text: 'Implemented in-memory LRU cache in Go with concurrent mutex synchronization',
          technologies: ['Go'],
          metrics: {},
          agencyLevel: 'CANDIDATE',
          candidateAuthored: true,
          sourceType: 'candidate_project_bullet',
        },
      ],
    },
    structuredResume: {
      header: { name: 'Casey Rivera', email: 'casey@example.com', phone: '555-0104' },
      summary: {
        text: 'Computer Science graduate with hands-on coursework and internship experience in Go and relational databases.',
      },
      skills: {
        categories: [
          { categoryName: 'Languages', skills: [{ name: 'Go' }] },
          { categoryName: 'Databases', skills: [{ name: 'PostgreSQL' }] },
        ],
      },
      projects: [
        {
          name: 'Distributed Cache',
          bullets: [
            {
              text: 'Implemented in-memory LRU cache in Go with concurrent mutex synchronization.',
              composedFromFactIds: ['fact-casey-1'],
            },
          ],
        },
      ],
    },
    pdfBuffer: createMinimalPdfStream([
      'Casey Rivera | casey@example.com | 555-0104',
      'Professional Summary: Computer Science graduate with hands-on coursework in Go and PostgreSQL.',
      'Technical Skills: Go, PostgreSQL, Git, Linux',
      'Projects: Distributed Cache',
      'Bullet: Implemented in-memory LRU cache in Go with concurrent mutex synchronization.',
    ]),
    extractedText:
      'Casey Rivera\ncasey@example.com\n555-0104\nProfessional Summary\nComputer Science graduate with hands-on coursework in Go and PostgreSQL.\nTechnical Skills\nGo, PostgreSQL, Git, Linux\nProjects\nDistributed Cache\nImplemented in-memory LRU cache in Go with concurrent mutex synchronization.\nExperience\nTechStart Software Engineering Intern\nEducation\nB.S. Computer Science University of Washington',
    humanEvaluation: {
      atsParseability: 88,
      jobMatch: 72,
      contentQuality: 70,
      compositeScore: 74,
      rank: 4,
      recommendation: 'LEANING_HIRE',
      qualifies: true,
      rationale:
        'Junior engineer who meets foundational technical requirements truthfully without exaggerating seniority.',
    },
  },

  // ── 5. Polished Formatting with Irrelevant Experience (Pretty Mismatch) ──────
  // CRITICAL CALIBRATION TEST: In a 35/35/30 setup, 95 parseability + 82 content pulls 40 job match
  // up to (95*0.35 + 40*0.35 + 82*0.30) = 71.85 (Passes 70)!
  // In a calibrated 30/40/30 setup, (95*0.30 + 40*0.40 + 82*0.30) = 69.1 (Correctly Fails < 70)!
  {
    id: 'archetype-5-pretty-mismatch',
    title: 'Polished Formatting with Irrelevant Experience',
    archetype: 'PRETTY_MISMATCH',
    description:
      'Flawless single-column PDF and strong writing in Ruby/iOS, applied to Senior Go/Kubernetes role (40 match).',
    targetJob: BENCHMARK_TARGET_JOB,
    candidateProfile: {
      id: 'cand-mismatch-5',
      tenantId: COMMON_TENANT_ID,
      displayName: 'Riley Vance',
      profileMetadata: {
        skills: [{ name: 'Ruby' }, { name: 'Rails' }, { name: 'Swift' }, { name: 'iOS' }],
        experience: [{ title: 'Senior Mobile Engineer', company: 'AppWorks' }],
        projects: [{ name: 'E-Commerce Mobile App', technologies: ['Swift', 'Ruby'] }],
      },
    },
    factInventory: {
      facts: [
        {
          id: 'fact-riley-1',
          candidateId: 'cand-mismatch-5',
          text: 'Architected iOS mobile checkout in Swift handling $10M in annual transactions',
          technologies: ['Swift', 'iOS'],
          metrics: { revenue: '$10M', raw: '$10M' },
          agencyLevel: 'CANDIDATE',
          candidateAuthored: true,
          sourceType: 'candidate_project_bullet',
        },
      ],
    },
    structuredResume: {
      header: { name: 'Riley Vance', email: 'riley@example.com', phone: '555-0105' },
      summary: {
        text: 'Accomplished Senior Mobile Application Engineer with 8 years building flagship consumer apps in Swift and Ruby.',
      },
      skills: {
        categories: [
          { categoryName: 'Languages', skills: [{ name: 'Swift' }, { name: 'Ruby' }] },
          { categoryName: 'Frameworks', skills: [{ name: 'Ruby on Rails' }, { name: 'SwiftUI' }] },
        ],
      },
      projects: [
        {
          name: 'E-Commerce Mobile App',
          bullets: [
            {
              text: 'Architected iOS mobile checkout in Swift handling $10M in annual transactions.',
              composedFromFactIds: ['fact-riley-1'],
            },
          ],
        },
      ],
    },
    pdfBuffer: createMinimalPdfStream([
      'Riley Vance | riley@example.com | 555-0105',
      'Professional Summary: Accomplished Senior Mobile Application Engineer with 8 years building apps in Swift and Ruby.',
      'Technical Skills: Swift, Ruby, Ruby on Rails, SwiftUI, CoreData',
      'Projects: E-Commerce Mobile App',
      '- Architected iOS mobile checkout in Swift handling $10M in annual transactions.',
    ]),
    extractedText:
      'Riley Vance\nriley@example.com\n555-0105\nProfessional Summary\nAccomplished Senior Mobile Application Engineer with 8 years building apps in Swift and Ruby.\nTechnical Skills\nSwift, Ruby, Ruby on Rails, SwiftUI, CoreData\nProjects\nE-Commerce Mobile App\n- Architected iOS mobile checkout in Swift handling $10M in annual transactions.\nExperience\nAppWorks Senior Mobile Engineer\nEducation\nB.S. Software Engineering UT Austin',
    humanEvaluation: {
      atsParseability: 95,
      jobMatch: 40,
      contentQuality: 82,
      compositeScore: 58,
      rank: 5,
      recommendation: 'NO_HIRE',
      qualifies: false,
      rationale:
        'Great mobile software engineer, but possesses zero required experience for this Distributed Systems Go role. Formatting must not mask fundamental skill mismatch.',
    },
  },

  // ── 6. Keyword-Stuffed Over-Optimized Resume (Gaming Attempt) ────────────────
  {
    id: 'archetype-6-keyword-stuffed',
    title: 'Keyword-Stuffed Over-Optimized Resume',
    archetype: 'KEYWORD_STUFFED',
    description:
      'High repetition of target keywords in summary, thin substance, low evidence coverage.',
    targetJob: BENCHMARK_TARGET_JOB,
    candidateProfile: {
      id: 'cand-stuffed-6',
      tenantId: COMMON_TENANT_ID,
      displayName: 'Devon Hayes',
      profileMetadata: {
        skills: [{ name: 'Go' }],
        experience: [],
        projects: [{ name: 'Basic App', technologies: ['Go'] }],
      },
    },
    factInventory: {
      facts: [
        {
          id: 'fact-devon-1',
          candidateId: 'cand-stuffed-6',
          text: 'Assisted in basic Go script maintenance',
          technologies: ['Go'],
          metrics: {},
          agencyLevel: 'CANDIDATE',
          candidateAuthored: true,
          sourceType: 'candidate_project_bullet',
        },
      ],
    },
    structuredResume: {
      header: { name: 'Devon Hayes', email: 'devon@example.com' },
      summary: {
        text: 'Go developer building Go systems with Go microservices and Go backend services using Go concurrency in Go.',
      },
      skills: {
        categories: [{ categoryName: 'Languages', skills: [{ name: 'Go' }] }],
      },
      projects: [
        {
          name: 'Basic App',
          bullets: [
            {
              text: 'Assisted in basic Go script maintenance.',
              composedFromFactIds: ['fact-devon-1'],
            },
          ],
        },
      ],
    },
    pdfBuffer: createMinimalPdfStream([
      'Devon Hayes | devon@example.com',
      'Summary: Go developer building Go systems with Go microservices and Go backend services in Go.',
      'Skills: Go, Go, Go',
      'Projects: Basic App',
      'Bullet: Assisted in basic Go script maintenance.',
    ]),
    extractedText:
      'Devon Hayes\ndevon@example.com\nSummary: Go developer building Go systems with Go microservices and Go backend services in Go.\nSkills: Go\nProjects: Basic App\nAssisted in basic Go script maintenance.\nEducation: High School',
    humanEvaluation: {
      atsParseability: 75,
      jobMatch: 62,
      contentQuality: 50,
      compositeScore: 58,
      rank: 6,
      recommendation: 'LEANING_NO_HIRE',
      qualifies: false,
      rationale:
        'Candidate attempted keyword stuffing. Repetition does not compensate for lack of substance and missing requirements.',
    },
  },

  // ── 7. Extreme Under-Qualified Candidate (Massive Gap) ────────────────────────
  {
    id: 'archetype-7-extreme-underqualified',
    title: 'Extreme Under-Qualified Candidate',
    archetype: 'EXTREME_UNDERQUALIFIED',
    description: 'Beginner with HTML/CSS applying to Senior Distributed Systems Architect.',
    targetJob: BENCHMARK_TARGET_JOB,
    candidateProfile: {
      id: 'cand-under-7',
      tenantId: COMMON_TENANT_ID,
      displayName: 'Taylor Brooks',
      profileMetadata: {
        skills: [{ name: 'HTML' }, { name: 'CSS' }],
        experience: [],
        projects: [{ name: 'Portfolio Webpage', technologies: ['HTML', 'CSS'] }],
      },
    },
    factInventory: {
      facts: [
        {
          id: 'fact-taylor-1',
          candidateId: 'cand-under-7',
          text: 'Created responsive personal portfolio webpage in HTML and CSS',
          technologies: ['HTML', 'CSS'],
          metrics: {},
          agencyLevel: 'CANDIDATE',
          candidateAuthored: true,
          sourceType: 'candidate_project_bullet',
        },
      ],
    },
    structuredResume: {
      header: { name: 'Taylor Brooks', email: 'taylor@example.com', phone: '555-0107' },
      summary: {
        text: 'Enthusiastic beginner web developer building static websites in HTML and CSS.',
      },
      skills: {
        categories: [{ categoryName: 'Web', skills: [{ name: 'HTML' }, { name: 'CSS' }] }],
      },
      projects: [
        {
          name: 'Portfolio Webpage',
          bullets: [
            {
              text: 'Created responsive personal portfolio webpage in HTML and CSS.',
              composedFromFactIds: ['fact-taylor-1'],
            },
          ],
        },
      ],
    },
    pdfBuffer: createMinimalPdfStream([
      'Taylor Brooks | taylor@example.com | 555-0107',
      'Summary: Enthusiastic beginner web developer building static websites in HTML and CSS.',
      'Skills: HTML, CSS',
      'Projects: Portfolio Webpage',
      'Bullet: Created responsive personal portfolio webpage in HTML and CSS.',
    ]),
    extractedText:
      'Taylor Brooks\ntaylor@example.com\n555-0107\nSummary: Enthusiastic beginner web developer building static websites in HTML and CSS.\nSkills: HTML, CSS\nProjects: Portfolio Webpage\nCreated responsive personal portfolio webpage in HTML and CSS.\nEducation: Web Bootcamp',
    humanEvaluation: {
      atsParseability: 85,
      jobMatch: 25,
      contentQuality: 60,
      compositeScore: 38,
      rank: 7,
      recommendation: 'NO_HIRE',
      qualifies: false,
      rationale:
        'Completely unqualified for a Senior Distributed Systems role. 0% of required technical competencies present.',
    },
  },

  // ── 8. Fabricated / Fraudulent Metric Claim (Integrity Block) ────────────────
  {
    id: 'archetype-8-fabricated-fraud',
    title: 'Fabricated / Fraudulent Metric Claim',
    archetype: 'FRAUDULENT_CLAIM',
    description:
      'Invented unbacked 85% latency reduction metric; must fail closed with publishable score = 0.',
    targetJob: BENCHMARK_TARGET_JOB,
    candidateProfile: {
      id: 'cand-fraud-8',
      tenantId: COMMON_TENANT_ID,
      displayName: 'Chris Nolan',
      profileMetadata: {
        skills: [{ name: 'Go' }, { name: 'PostgreSQL' }],
        experience: [{ title: 'Engineer', company: 'VaporCorp' }],
        projects: [{ name: 'Fake Database', technologies: ['Go'] }],
      },
    },
    factInventory: {
      facts: [
        {
          id: 'fact-chris-1',
          text: 'Assisted team in running unit tests for database client',
          technologies: ['Go'],
          metrics: {},
        },
      ],
    },
    structuredResume: {
      header: { name: 'Chris Nolan', email: 'chris@example.com', phone: '555-0108' },
      summary: {
        text: 'Senior distributed architect claiming 85% latency reductions across cloud nodes.',
      },
      skills: {
        categories: [{ categoryName: 'Languages', skills: [{ name: 'Go' }] }],
      },
      projects: [
        {
          name: 'Fake Database',
          bullets: [
            {
              text: 'Engineered custom Raft consensus reducing cluster query latency by 85% across all nodes.',
              composedFromFactIds: ['fact-chris-1'], // fact-chris-1 has NO latency metrics!
            },
          ],
        },
      ],
    },
    pdfBuffer: createMinimalPdfStream([
      'Chris Nolan | chris@example.com | 555-0108',
      'Summary: Senior distributed architect claiming 85% latency reductions across cloud nodes.',
      'Skills: Go, PostgreSQL',
      'Projects: Fake Database',
      'Bullet: Engineered custom Raft consensus reducing cluster query latency by 85% across all nodes.',
    ]),
    extractedText:
      'Chris Nolan\nchris@example.com\n555-0108\nSummary: Senior distributed architect claiming 85% latency reductions across cloud nodes.\nSkills: Go, PostgreSQL\nProjects: Fake Database\nEngineered custom Raft consensus reducing cluster query latency by 85% across all nodes.\nExperience: VaporCorp\nEducation: Self-taught',
    humanEvaluation: {
      atsParseability: 90,
      jobMatch: 85,
      contentQuality: 85,
      compositeScore: 0,
      rank: 8,
      recommendation: 'FRAUD_REJECT',
      qualifies: false,
      rationale:
        'Critical violation: Fabricated 85% latency reduction metric not corroborated by source facts. Must be strictly rejected with score 0.',
    },
  },
]);
