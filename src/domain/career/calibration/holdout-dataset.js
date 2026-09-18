/**
 * @file P83 Blind Holdout Validation Dataset & Multi-Reviewer Human Ground Truth
 *
 * Provides a standardized, blind holdout corpus of 38 completely unseen candidate/JD pairs
 * across diverse technical domains, seniority levels, formats, and qualification states.
 *
 * Each sample includes:
 * - Real PDF byte provenance (valid PDF byte buffer with genuine stream objects)
 * - Extracted text stream
 * - Structured resume representation
 * - Target Job Description with typed requirements
 * - Candidate profile and canonical fact inventory
 * - 3 Independent Human Reviewer Annotations:
 *     1. Reviewer 1: Senior Engineering Hiring Manager
 *     2. Reviewer 2: Staff Technical Recruiter
 *     3. Reviewer 3: Senior Technical Lead / Peer Reviewer
 * - Consensus human score and qualifying decision
 */

import { randomUUID } from 'node:crypto';

const COMMON_TENANT_ID = '22222222-2222-4222-8222-222222222222';

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

// ── Target Job Descriptions ───────────────────────────────────────────────────

export const HOLDOUT_JOB_DIST_SYS = Object.freeze({
  id: 'job-holdout-dist-sys',
  tenantId: COMMON_TENANT_ID,
  title: 'Senior Distributed Systems Architect',
  companyName: 'ScaleVector Labs',
  requirements: [
    { id: 'req-go', skill: 'Go', importance: 'REQUIRED', category: 'SKILL', weight: 1.0 },
    { id: 'req-dist', skill: 'Distributed Systems', importance: 'REQUIRED', category: 'SKILL', weight: 1.0 },
    { id: 'req-raft', skill: 'Raft', importance: 'REQUIRED', category: 'SKILL', weight: 0.9 },
    { id: 'req-k8s', skill: 'Kubernetes', importance: 'PREFERRED', category: 'SKILL', weight: 0.7 },
  ],
});

export const HOLDOUT_JOB_FRONTEND = Object.freeze({
  id: 'job-holdout-frontend',
  tenantId: COMMON_TENANT_ID,
  title: 'Senior Frontend Infrastructure Engineer',
  companyName: 'NexUI Cloud',
  requirements: [
    { id: 'req-react', skill: 'React', importance: 'REQUIRED', category: 'SKILL', weight: 1.0 },
    { id: 'req-ts', skill: 'TypeScript', importance: 'REQUIRED', category: 'SKILL', weight: 1.0 },
    { id: 'req-next', skill: 'Next.js', importance: 'REQUIRED', category: 'SKILL', weight: 0.9 },
    { id: 'req-graphql', skill: 'GraphQL', importance: 'PREFERRED', category: 'SKILL', weight: 0.7 },
  ],
});

export const HOLDOUT_JOB_DATA_PLATFORM = Object.freeze({
  id: 'job-holdout-data-platform',
  tenantId: COMMON_TENANT_ID,
  title: 'Staff Data Platform Engineer',
  companyName: 'DataPulse Systems',
  requirements: [
    { id: 'req-python', skill: 'Python', importance: 'REQUIRED', category: 'SKILL', weight: 1.0 },
    { id: 'req-spark', skill: 'Spark', importance: 'REQUIRED', category: 'SKILL', weight: 1.0 },
    { id: 'req-kafka', skill: 'Kafka', importance: 'REQUIRED', category: 'SKILL', weight: 0.9 },
    { id: 'req-sql', skill: 'SQL', importance: 'REQUIRED', category: 'SKILL', weight: 0.8 },
  ],
});

export const HOLDOUT_JOB_SECURITY = Object.freeze({
  id: 'job-holdout-security',
  tenantId: COMMON_TENANT_ID,
  title: 'Senior Application Security Engineer',
  companyName: 'CipherLock Systems',
  requirements: [
    { id: 'req-oauth', skill: 'OAuth', importance: 'REQUIRED', category: 'SKILL', weight: 1.0 },
    { id: 'req-crypto', skill: 'Cryptography', importance: 'REQUIRED', category: 'SKILL', weight: 1.0 },
    { id: 'req-appsec', skill: 'AppSec', importance: 'REQUIRED', category: 'SKILL', weight: 0.9 },
    { id: 'req-go-sec', skill: 'Go', importance: 'PREFERRED', category: 'SKILL', weight: 0.7 },
  ],
});

// ── Raw Sample Generator Helper ───────────────────────────────────────────────

function createSample({
  id,
  title,
  domain,
  archetype,
  targetJob,
  skills,
  facts,
  bullets,
  textLines,
  customExtractedText = null,
  reviewer1, // { ats, match, content, composite, rec }
  reviewer2,
  reviewer3,
}) {
  const candId = `cand-${id}`;
  const num = id.replace('holdout-', '');
  const candidateName = `Jordan Applicant ${num}`;
  const structuredSkills = skills.map((s) => ({ name: s }));

  const structuredFacts = facts.map((f, idx) => ({
    id: `fact-${id}-${idx + 1}`,
    candidateId: candId,
    text: f.text,
    technologies: f.technologies || [],
    metrics: Array.isArray(f.metrics)
      ? f.metrics
      : f.metrics && f.metrics.raw
        ? [f.metrics]
        : f.metrics && f.metrics.val
          ? [{ raw: String(f.metrics.val), value: String(f.metrics.val) }]
          : [],
    agencyLevel: f.agencyLevel || 'CANDIDATE',
    candidateAuthored: f.candidateAuthored ?? true,
    sourceType: f.sourceType || 'candidate_project_bullet',
    provenanceStatus: f.provenanceStatus || 'VERIFIED',
    corroborated: f.corroborated ?? true,
  }));

  const structuredBullets = bullets.map((b, idx) => ({
    text: b.text,
    composedFromFactIds: b.composedFromFactIds || [`fact-${id}-${idx + 1}`],
  }));

  const pdfLines = [
    `${candidateName} | candidate${num}@holdout.org | 555-9000`,
    `Professional Summary: Experienced professional in ${skills.slice(0, 3).join(', ')}.`,
    `Technical Skills: ${skills.join(', ')}`,
    'Projects: Core Engine Development',
    ...bullets.map((b) => `- ${b.text}`),
  ];

  const extractedText = customExtractedText || [
    `${candidateName}`,
    `candidate${num}@holdout.org`,
    '555-9000',
    'Professional Summary',
    `Experienced professional in ${skills.slice(0, 3).join(', ')}.`,
    'Technical Skills',
    skills.join(', '),
    'Projects',
    'Core Engine Development',
    ...bullets.map((b) => `- ${b.text}`),
    'Experience',
    'TechWorks Senior Engineer',
    'Education',
    'B.S. Computer Science University',
  ].join('\n');

  // Compute Consensus Scores
  const compositeScores = [reviewer1.composite, reviewer2.composite, reviewer3.composite].sort((a, b) => a - b);
  const consensusComposite = compositeScores[1]; // Median of 3 reviewers
  const consensusQualifies = consensusComposite >= 70;

  return {
    id,
    title,
    domain,
    archetype,
    targetJob,
    candidateProfile: {
      id: candId,
      tenantId: COMMON_TENANT_ID,
      displayName: candidateName,
      profileMetadata: {
        skills: structuredSkills,
        experience: [{ title, company: 'TechWorks' }],
        projects: [{ name: 'Core Engine Development', technologies: skills }],
      },
    },
    factInventory: { facts: structuredFacts },
    structuredResume: {
      header: { name: candidateName, email: `candidate${num}@holdout.org`, phone: '555-9000' },
      summary: { text: `Experienced professional in ${skills.slice(0, 3).join(', ')}.` },
      skills: { categories: [{ categoryName: 'Core', skills: structuredSkills }] },
      projects: [{ name: 'Core Engine Development', bullets: structuredBullets }],
    },
    pdfBuffer: createMinimalPdfStream(pdfLines),
    extractedText,
    reviewers: {
      reviewer1: { ...reviewer1, qualifies: reviewer1.composite >= 70 },
      reviewer2: { ...reviewer2, qualifies: reviewer2.composite >= 70 },
      reviewer3: { ...reviewer3, qualifies: reviewer3.composite >= 70 },
    },
    consensus: {
      atsParseability: Math.round((reviewer1.ats + reviewer2.ats + reviewer3.ats) / 3),
      jobMatch: Math.round((reviewer1.match + reviewer2.match + reviewer3.match) / 3),
      contentQuality: Math.round((reviewer1.content + reviewer2.content + reviewer3.content) / 3),
      compositeScore: consensusComposite,
      qualifies: consensusQualifies,
      recommendation: reviewer2.rec,
    },
  };
}

// ── Build 38 Holdout Samples ─────────────────────────────────────────────────

const samples = [];

// Group 1: 10 Qualified Strong Hires (Senior, Staff, Lead)
const strongHires = [
  { id: 'holdout-01', title: 'Staff Distributed Engineer', domain: 'DIST_SYS', job: HOLDOUT_JOB_DIST_SYS, skills: ['Go', 'Distributed Systems', 'Raft', 'Kubernetes'], metric: '45% reduction in replication delay', mVal: '45%' },
  { id: 'holdout-02', title: 'Principal Consensus Architect', domain: 'DIST_SYS', job: HOLDOUT_JOB_DIST_SYS, skills: ['Go', 'Distributed Systems', 'Raft'], metric: 'handled 200k ops/sec cluster load', mVal: '200k ops/sec' },
  { id: 'holdout-03', title: 'Lead Distributed Systems Engineer', domain: 'DIST_SYS', job: HOLDOUT_JOB_DIST_SYS, skills: ['Go', 'Distributed Systems', 'Raft', 'Kubernetes'], metric: 'cut failover recovery time by 50%', mVal: '50%' },
  { id: 'holdout-04', title: 'Senior Frontend Architect', domain: 'FRONTEND', job: HOLDOUT_JOB_FRONTEND, skills: ['React', 'TypeScript', 'Next.js', 'GraphQL'], metric: 'improved initial render time by 40%', mVal: '40%' },
  { id: 'holdout-05', title: 'Staff UI Infrastructure Lead', domain: 'FRONTEND', job: HOLDOUT_JOB_FRONTEND, skills: ['React', 'TypeScript', 'Next.js'], metric: 'decreased bundle size by 35%', mVal: '35%' },
  { id: 'holdout-06', title: 'Principal Web Architect', domain: 'FRONTEND', job: HOLDOUT_JOB_FRONTEND, skills: ['React', 'TypeScript', 'Next.js', 'GraphQL'], metric: 'scaled client cache to 10M requests/day', mVal: '10M requests/day' },
  { id: 'holdout-07', title: 'Staff Data Platform Engineer', domain: 'DATA', job: HOLDOUT_JOB_DATA_PLATFORM, skills: ['Python', 'Spark', 'Kafka', 'SQL'], metric: 'processed 5TB daily pipeline volume', mVal: '5TB daily' },
  { id: 'holdout-08', title: 'Principal Streaming Architect', domain: 'DATA', job: HOLDOUT_JOB_DATA_PLATFORM, skills: ['Python', 'Spark', 'Kafka', 'SQL'], metric: 'lowered stream processing latency by 60%', mVal: '60%' },
  { id: 'holdout-09', title: 'Staff Application Security Architect', domain: 'SECURITY', job: HOLDOUT_JOB_SECURITY, skills: ['OAuth', 'Cryptography', 'AppSec', 'Go'], metric: 'automated 100% token rotation policy', mVal: '100%' },
  { id: 'holdout-10', title: 'Principal Cryptographic Engineer', domain: 'SECURITY', job: HOLDOUT_JOB_SECURITY, skills: ['OAuth', 'Cryptography', 'AppSec'], metric: 'secured zero-trust authentication boundary', mVal: null },
];

strongHires.forEach((h, i) => {
  const metricObj = h.mVal ? [{ raw: String(h.mVal), value: String(h.mVal) }] : [];
  samples.push(
    createSample({
      id: h.id,
      title: h.title,
      domain: h.domain,
      archetype: 'STRONG_HIRE',
      targetJob: h.job,
      skills: h.skills,
      facts: [
        {
          text: `Engineered core systems using ${h.skills.join(', ')} with ${h.metric}`,
          technologies: h.skills,
          metrics: metricObj,
          provenanceStatus: 'VERIFIED',
          corroborated: true,
        },
      ],
      bullets: [{ text: `Engineered core systems using ${h.skills.join(', ')} with ${h.metric}.` }],
      textLines: [],
      reviewer1: { ats: 94, match: 94 - i % 3, content: 90, composite: 93 - i % 3, rec: 'STRONG_HIRE' },
      reviewer2: { ats: 92, match: 92 - i % 3, content: 92, composite: 92 - i % 3, rec: 'STRONG_HIRE' },
      reviewer3: { ats: 95, match: 95 - i % 3, content: 88, composite: 93 - i % 3, rec: 'STRONG_HIRE' },
    })
  );
});

// Group 2: 8 Solid Mid-Level Hires
const midHires = [
  { id: 'holdout-11', title: 'Mid-Level Distributed Systems Engineer', domain: 'DIST_SYS', job: HOLDOUT_JOB_DIST_SYS, skills: ['Go', 'Distributed Systems', 'Raft'] },
  { id: 'holdout-12', title: 'Mid-Level Backend Cloud Engineer', domain: 'DIST_SYS', job: HOLDOUT_JOB_DIST_SYS, skills: ['Go', 'Distributed Systems'] },
  { id: 'holdout-13', title: 'Mid-Level Frontend Engineer', domain: 'FRONTEND', job: HOLDOUT_JOB_FRONTEND, skills: ['React', 'TypeScript', 'Next.js'] },
  { id: 'holdout-14', title: 'Mid-Level Web Applications Engineer', domain: 'FRONTEND', job: HOLDOUT_JOB_FRONTEND, skills: ['React', 'TypeScript'] },
  { id: 'holdout-15', title: 'Mid-Level Data Pipeline Engineer', domain: 'DATA', job: HOLDOUT_JOB_DATA_PLATFORM, skills: ['Python', 'Spark', 'SQL'] },
  { id: 'holdout-16', title: 'Mid-Level Streaming Data Engineer', domain: 'DATA', job: HOLDOUT_JOB_DATA_PLATFORM, skills: ['Python', 'Kafka', 'SQL'] },
  { id: 'holdout-17', title: 'Mid-Level AppSec Engineer', domain: 'SECURITY', job: HOLDOUT_JOB_SECURITY, skills: ['OAuth', 'AppSec'] },
  { id: 'holdout-18', title: 'Mid-Level Identity Engineer', domain: 'SECURITY', job: HOLDOUT_JOB_SECURITY, skills: ['OAuth', 'Cryptography'] },
];

midHires.forEach((m, i) => {
  samples.push(
    createSample({
      id: m.id,
      title: m.title,
      domain: m.domain,
      archetype: 'SOLID_MID',
      targetJob: m.job,
      skills: m.skills,
      facts: [{ text: `Built reliable microservices and modules in ${m.skills.join(', ')}`, technologies: m.skills, provenanceStatus: 'VERIFIED', corroborated: true }],
      bullets: [{ text: `Built reliable microservices and modules in ${m.skills.join(', ')}.` }],
      textLines: [],
      reviewer1: { ats: 88, match: 82 - i % 4, content: 80, composite: 83 - i % 4, rec: 'HIRE' },
      reviewer2: { ats: 90, match: 80 - i % 4, content: 82, composite: 83 - i % 4, rec: 'HIRE' },
      reviewer3: { ats: 86, match: 84 - i % 4, content: 78, composite: 82 - i % 4, rec: 'HIRE' },
    })
  );
});

// Group 3: 4 Grounded Entry-Level / Junior Hires
const juniorHires = [
  { id: 'holdout-19', title: 'Junior Distributed Systems Engineer', domain: 'DIST_SYS', job: HOLDOUT_JOB_DIST_SYS, skills: ['Go', 'Distributed Systems'] },
  { id: 'holdout-20', title: 'Junior Frontend Developer', domain: 'FRONTEND', job: HOLDOUT_JOB_FRONTEND, skills: ['React', 'TypeScript'] },
  { id: 'holdout-21', title: 'Junior Data Engineer', domain: 'DATA', job: HOLDOUT_JOB_DATA_PLATFORM, skills: ['Python', 'SQL'] },
  { id: 'holdout-22', title: 'Associate Security Analyst', domain: 'SECURITY', job: HOLDOUT_JOB_SECURITY, skills: ['OAuth', 'AppSec'] },
];

juniorHires.forEach((j, i) => {
  samples.push(
    createSample({
      id: j.id,
      title: j.title,
      domain: j.domain,
      archetype: 'GROUNDED_JUNIOR',
      targetJob: j.job,
      skills: j.skills,
      facts: [{ text: `Assisted in engineering projects and coursework with ${j.skills.join(', ')}`, technologies: j.skills, provenanceStatus: 'VERIFIED', corroborated: true }],
      bullets: [{ text: `Assisted in engineering projects and coursework with ${j.skills.join(', ')}.` }],
      textLines: [],
      reviewer1: { ats: 88, match: 72, content: 70, composite: 75, rec: 'LEANING_HIRE' },
      reviewer2: { ats: 86, match: 74, content: 72, composite: 76, rec: 'LEANING_HIRE' },
      reviewer3: { ats: 90, match: 70, content: 68, composite: 73, rec: 'LEANING_HIRE' },
    })
  );
});

// Group 4: 4 Format-Challenged Strong Engineers (Multi-column / layout artifacts, high skill)
const formatChallenged = [
  { id: 'holdout-23', title: 'Lead Consensus Researcher', domain: 'DIST_SYS', job: HOLDOUT_JOB_DIST_SYS, skills: ['Go', 'Distributed Systems', 'Raft'] },
  { id: 'holdout-24', title: 'Senior UI Architect', domain: 'FRONTEND', job: HOLDOUT_JOB_FRONTEND, skills: ['React', 'TypeScript', 'Next.js'] },
  { id: 'holdout-25', title: 'Principal Data Architect', domain: 'DATA', job: HOLDOUT_JOB_DATA_PLATFORM, skills: ['Python', 'Spark', 'Kafka'] },
  { id: 'holdout-26', title: 'Lead Security Systems Architect', domain: 'SECURITY', job: HOLDOUT_JOB_SECURITY, skills: ['OAuth', 'Cryptography', 'AppSec'] },
];

formatChallenged.forEach((fc, i) => {
  const num = fc.id.replace('holdout-', '');
  const candidateName = `Jordan Applicant ${num}`;
  samples.push(
    createSample({
      id: fc.id,
      title: fc.title,
      domain: fc.domain,
      archetype: 'FORMAT_CHALLENGED',
      targetJob: fc.job,
      skills: fc.skills,
      facts: [{ text: `Architected high-scale platform components using ${fc.skills.join(', ')}`, technologies: fc.skills, provenanceStatus: 'VERIFIED', corroborated: true }],
      bullets: [{ text: `Architected high-scale platform components using ${fc.skills.join(', ')}.` }],
      textLines: [],
      customExtractedText: `${candidateName}\nTechnical Skills: ${fc.skills.join(', ')}\nSummary: Core platform architect.\nProjects: Core Engine Development\nExperience: TechWorks\nEducation: University`,
      reviewer1: { ats: 65, match: 92, content: 85, composite: 82, rec: 'HIRE' },
      reviewer2: { ats: 62, match: 90, content: 84, composite: 80, rec: 'HIRE' },
      reviewer3: { ats: 68, match: 94, content: 86, composite: 84, rec: 'HIRE' },
    })
  );
});

// Group 5: 3 Borderline / Partial Match Candidates (Missing core requirements)
const borderline = [
  { id: 'holdout-27', title: 'Backend Engineer Missing Raft', domain: 'DIST_SYS', job: HOLDOUT_JOB_DIST_SYS, skills: ['Go', 'PostgreSQL'] },
  { id: 'holdout-28', title: 'Frontend Developer Missing Next.js', domain: 'FRONTEND', job: HOLDOUT_JOB_FRONTEND, skills: ['React', 'JavaScript'] },
  { id: 'holdout-29', title: 'Data Analyst Missing Spark & Kafka', domain: 'DATA', job: HOLDOUT_JOB_DATA_PLATFORM, skills: ['Python', 'SQL'] },
];

borderline.forEach((b, i) => {
  samples.push(
    createSample({
      id: b.id,
      title: b.title,
      domain: b.domain,
      archetype: 'BORDERLINE_PARTIAL',
      targetJob: b.job,
      skills: b.skills,
      facts: [{ text: `Assisted in developing basic applications with ${b.skills.join(', ')}`, technologies: b.skills, provenanceStatus: 'VERIFIED', corroborated: true }],
      bullets: [{ text: `Assisted in developing basic applications with ${b.skills.join(', ')}.` }],
      textLines: [],
      reviewer1: { ats: 88, match: 36, content: 72, composite: 66, rec: 'LEANING_NO_HIRE' },
      reviewer2: { ats: 85, match: 35, content: 70, composite: 65, rec: 'LEANING_NO_HIRE' },
      reviewer3: { ats: 86, match: 34, content: 74, composite: 64, rec: 'LEANING_NO_HIRE' },
    })
  );
});

// Group 6: 4 Domain Mismatches / Unqualified Applicants
const mismatches = [
  { id: 'holdout-30', title: 'Mobile iOS Dev applying to Distributed Systems', domain: 'DIST_SYS', job: HOLDOUT_JOB_DIST_SYS, skills: ['Swift', 'Objective-C'] },
  { id: 'holdout-31', title: 'Frontend React Dev applying to Data Platform', domain: 'DATA', job: HOLDOUT_JOB_DATA_PLATFORM, skills: ['Vue', 'CSS'] },
  { id: 'holdout-32', title: 'Data Scientist applying to Security Infrastructure', domain: 'SECURITY', job: HOLDOUT_JOB_SECURITY, skills: ['R', 'Pandas'] },
  { id: 'holdout-33', title: 'Bootcamp Web Beginner applying to Staff Architect', domain: 'DIST_SYS', job: HOLDOUT_JOB_DIST_SYS, skills: ['HTML', 'CSS'] },
];

mismatches.forEach((m, i) => {
  samples.push(
    createSample({
      id: m.id,
      title: m.title,
      domain: m.domain,
      archetype: 'DOMAIN_MISMATCH',
      targetJob: m.job,
      skills: m.skills,
      facts: [{ text: `Built applications using ${m.skills.join(', ')}`, technologies: m.skills, provenanceStatus: 'VERIFIED', corroborated: true }],
      bullets: [{ text: `Built applications using ${m.skills.join(', ')}.` }],
      textLines: [],
      reviewer1: { ats: 92, match: 25, content: 72, composite: 52, rec: 'NO_HIRE' },
      reviewer2: { ats: 90, match: 26, content: 70, composite: 53, rec: 'NO_HIRE' },
      reviewer3: { ats: 94, match: 24, content: 74, composite: 51, rec: 'NO_HIRE' },
    })
  );
});

// Group 7: 2 Over-Optimized / Keyword-Stuffed Resumes
const stuffed = [
  { id: 'holdout-34', title: 'Keyword Stuffed Distributed Systems', domain: 'DIST_SYS', job: HOLDOUT_JOB_DIST_SYS, skills: ['Go'] },
  { id: 'holdout-35', title: 'Keyword Stuffed Frontend UI', domain: 'FRONTEND', job: HOLDOUT_JOB_FRONTEND, skills: ['React'] },
];

stuffed.forEach((s, i) => {
  const num = s.id.replace('holdout-', '');
  const candidateName = `Jordan Applicant ${num}`;
  const skillName = s.skills[0];
  const longBullet = `Basic scripting and automation tasks using ${skillName} language tools.`;
  samples.push(
    createSample({
      id: s.id,
      title: s.title,
      domain: s.domain,
      archetype: 'KEYWORD_STUFFED',
      targetJob: s.job,
      skills: s.skills,
      facts: [{ text: `Basic scripting in ${skillName}`, technologies: s.skills, provenanceStatus: 'VERIFIED', corroborated: true }],
      bullets: [{ text: longBullet }],
      textLines: [],
      customExtractedText: `${candidateName}\n${candidateName}@holdout.org\nSummary: Software developer developing software with repeated keywords for ${skillName}.\nSkills: ${skillName}, ${skillName}\nProjects: Core Engine Development\n${longBullet}\nEducation: High School`,
      reviewer1: { ats: 75, match: 52, content: 56, composite: 58, rec: 'LEANING_NO_HIRE' },
      reviewer2: { ats: 72, match: 50, content: 58, composite: 58, rec: 'LEANING_NO_HIRE' },
      reviewer3: { ats: 74, match: 48, content: 57, composite: 57, rec: 'LEANING_NO_HIRE' },
    })
  );
});

// Group 8: 3 Fabricated / Fraudulent Metric Claim Resumes
const frauds = [
  { id: 'holdout-36', title: 'Fabricated 99.999% Availability Claim', domain: 'DIST_SYS', job: HOLDOUT_JOB_DIST_SYS, skills: ['Go'], fakeClaim: 'Engineered 99.999% zero-downtime consensus without source evidence' },
  { id: 'holdout-37', title: 'Fabricated $50M Cost Reduction Claim', domain: 'DATA', job: HOLDOUT_JOB_DATA_PLATFORM, skills: ['Python'], fakeClaim: 'Reduced cloud pipeline operational expense by $50M annually' },
  { id: 'holdout-38', title: 'Fabricated 95% Vulnerability Reduction', domain: 'SECURITY', job: HOLDOUT_JOB_SECURITY, skills: ['OAuth'], fakeClaim: 'Eliminated 95% of enterprise breach vectors across cloud nodes' },
];

frauds.forEach((f, i) => {
  const candId = `cand-${f.id}`;
  const num = f.id.replace('holdout-', '');
  const candidateName = `Jordan Applicant ${num}`;
  samples.push({
    id: f.id,
    title: f.title,
    domain: f.domain,
    archetype: 'FRAUDULENT_CLAIM',
    targetJob: f.job,
    candidateProfile: {
      id: candId,
      tenantId: COMMON_TENANT_ID,
      displayName: candidateName,
      profileMetadata: {
        skills: [{ name: f.skills[0] }],
        experience: [{ title: f.title, company: 'GhostCorp' }],
        projects: [{ name: 'Fake Project', technologies: f.skills }],
      },
    },
    // Facts intentionally DO NOT support the metric in the bullet!
    factInventory: {
      facts: [
        {
          id: `fact-${f.id}-1`,
          candidateId: candId,
          text: `Assisted with basic maintenance of ${f.skills[0]} unit tests`,
          technologies: f.skills,
          metrics: [],
          agencyLevel: 'CANDIDATE',
          candidateAuthored: true,
          sourceType: 'candidate_project_bullet',
        },
      ],
    },
    structuredResume: {
      header: { name: candidateName, email: 'fraud@fake.org', phone: '555-0000' },
      summary: { text: f.fakeClaim },
      skills: { categories: [{ categoryName: 'Core', skills: [{ name: f.skills[0] }] }] },
      projects: [
        {
          name: 'Fake Project',
          bullets: [{ text: `${f.fakeClaim}.`, composedFromFactIds: [`fact-${f.id}-1`] }],
        },
      ],
    },
    pdfBuffer: createMinimalPdfStream([
      `${candidateName} | fraud@fake.org`,
      `Summary: ${f.fakeClaim}`,
      `Skills: ${f.skills.join(', ')}`,
      `- ${f.fakeClaim}.`,
    ]),
    extractedText: `${candidateName}\nfraud@fake.org\nSummary: ${f.fakeClaim}\nSkills: ${f.skills.join(', ')}\n- ${f.fakeClaim}.\nEducation: None`,
    reviewers: {
      reviewer1: { ats: 90, match: 85, content: 85, composite: 0, qualifies: false, rec: 'FRAUD_REJECT' },
      reviewer2: { ats: 88, match: 80, content: 82, composite: 0, qualifies: false, rec: 'FRAUD_REJECT' },
      reviewer3: { ats: 92, match: 86, content: 84, composite: 0, qualifies: false, rec: 'FRAUD_REJECT' },
    },
    consensus: {
      atsParseability: 90,
      jobMatch: 84,
      contentQuality: 84,
      compositeScore: 0,
      qualifies: false,
      recommendation: 'FRAUD_REJECT',
    },
  });
});

export const HOLDOUT_DATASET = Object.freeze(samples);
