/**
 * @file Unit Tests: Candidate Artifact Content Service (P14-006)
 *
 * Regression coverage for the real ChatGPT acceptance failure where generated
 * resume/cover-letter PDFs contained generic placeholder prose instead of the
 * candidate's actual stored profile data. These tests prove:
 * 1. Real candidate name appears in resume.
 * 2. Real education appears in resume.
 * 3. Real internship/employer appears in resume.
 * 4. Real supported skills appear (with provenance truth separation).
 * 5. Real projects appear.
 * 6. Unsupported claims are not introduced (no placeholder / fabricated content).
 * 7. Cover letter contains real candidate evidence.
 * 8. No generic placeholder sections replace real data.
 * 9. Missing data is not fabricated (sections omitted, no invented values).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CandidateArtifactContentService } from '../../src/services/candidate-artifact-content.service.js';

/**
 * Mirrors the REAL production profile view shape returned by
 * CandidateProfileService.getProfile() (candidate root + userEmail +
 * identities + skills + projects), seeded with the same real-world data
 * found in the live database for candidate Vishwanath Nishad.
 */
const realProfileView = {
  candidate: {
    id: '00000000-0000-0000-0000-00000000c001',
    tenantId: '00000000-0000-0000-0000-00000000t001',
    userId: '00000000-0000-0000-0000-00000000u001',
    displayName: 'Vishwanath Nishad',
    headline: 'Full-Stack & Backend Developer | Full-Stack Architect',
    summary:
      'Full-stack engineer specializing in robust, scalable backend systems and RESTful API design using Python (FastAPI/Django) and Node.js (Express/NestJS), leveraging PostgreSQL and modular service design.',
    canonicalEmail: 'vishwanatnishad@gmail.com',
    profileMetadata: {
      phone: '7905087928',
      location: 'Gorakhpur',
      userCustom: {
        phone: '7905087928',
        location: 'Gorakhpur',
        education: [
          {
            degree: 'Bachelor of Technology in Electronics Engineering',
            institution: 'Rajkiya Engineering College',
            fieldOfStudy: 'Electronics Engineering',
            location: 'Sonbhadra',
            startDate: '2021',
            endDate: '2025-07',
            isCurrent: false,
            coursework: ['Data Structures & Algorithms', 'Operating Systems', 'DBMS'],
          },
        ],
        experience: [
          {
            title: 'Full Stack Developer Intern',
            company: 'FTV Saloon',
            startDate: '2024-06',
            endDate: '2024-09',
            isCurrent: false,
            location: 'Remote',
            bullets: [
              'Designed and implemented robust RESTful APIs for core salon operations.',
              'Optimized critical backend database queries, resulting in a 40% reduction in page load time.',
            ],
          },
        ],
        certifications: [],
      },
    },
  },
  userEmail: 'vishwanatnishad@gmail.com',
  identities: [{ provider: 'GITHUB_APP', externalUsername: 'vishu1803' }],
  skills: [
    { name: 'Postgresql', provenanceStatus: 'VERIFIED' },
    { name: 'FastAPI', provenanceStatus: 'VERIFIED' },
    { name: 'TypeScript', provenanceStatus: 'VERIFIED' },
    { name: 'Jest', provenanceStatus: 'VERIFIED' },
    { name: 'Drizzle ORM', provenanceStatus: 'VERIFIED' },
    { name: 'Django', provenanceStatus: 'CLAIMED' },
    { name: 'Flask', provenanceStatus: 'CLAIMED' },
    { name: 'AWS', provenanceStatus: 'SELF_DECLARED' },
  ],
  projects: [
    {
      name: 'vishu1803/Ai-job-mcp',
      summary: 'AI job application MCP server with encrypted artifact storage.',
      technologies: ['Node.js', 'PostgreSQL'],
    },
    {
      name: 'vishu1803/Collaborative-task-manager',
      summary: 'Realtime collaborative task management service.',
      technologies: ['Socket.io', 'Express'],
    },
  ],
};

const vercelBackendJob = {
  id: 'job-vercel-backend-001',
  source: 'GREENHOUSE',
  company: 'Vercel',
  title: 'Software Engineer, Backend',
  location: 'Remote',
  description: 'Build backend services and APIs for the Vercel platform.',
  responsibilities: ['Design and operate backend APIs'],
  requirements: [
    'Experience with Node.js and TypeScript',
    'Experience with PostgreSQL',
    'REST API design',
  ],
  skills: ['Node.js', 'TypeScript', 'PostgreSQL'],
  applicationUrl: 'https://boards.greenhouse.io/vercel/jobs/1234567',
  retrievedAt: '2026-09-06T00:00:00Z',
};

function buildService() {
  const service = new CandidateArtifactContentService({
    candidateProfileService: {
      getProfile: async (_context, candidateId) => ({
        ...realProfileView,
        candidate: { ...realProfileView.candidate, id: candidateId },
      }),
    },
    database: {
      select: () => {
        throw new Error('db not available in unit test');
      },
    },
  });
  // Bypass stored-project DB load: profile projects carry the evidence
  service.loadStoredProjects = async () => [];
  return service;
}

async function generate() {
  const service = buildService();
  const docs = await service.generateApplicationDocuments({
    tenantId: '00000000-0000-0000-0000-00000000t001',
    userId: '00000000-0000-0000-0000-00000000u001',
    candidateId: realProfileView.candidate.id,
    jobPosting: vercelBackendJob,
  });
  return { service, docs };
}

describe('CandidateArtifactContentService (P14-006 real-content generation)', () => {
  it('1. renders the REAL candidate name and authoritative email in the resume', async () => {
    const { docs } = await generate();
    assert.ok(docs.resume.markdownContent.includes('Vishwanath Nishad'));
    assert.ok(docs.resume.markdownContent.includes('vishwanatnishad@gmail.com'));
  });

  it('2. renders REAL education (institution, degree, dates) in the resume', async () => {
    const { docs } = await generate();
    const resume = docs.resume.markdownContent;
    assert.ok(resume.includes('Rajkiya Engineering College'));
    assert.ok(resume.includes('Bachelor of Technology in Electronics Engineering'));
    assert.ok(resume.includes('Electronics Engineering'));
    assert.ok(resume.includes('2021'));
    assert.ok(resume.includes('July 2025'));
  });

  it('3. renders the REAL internship employer and title in the resume', async () => {
    const { docs } = await generate();
    const resume = docs.resume.markdownContent;
    assert.ok(resume.includes('FTV Saloon'));
    assert.ok(resume.includes('Full Stack Developer Intern'));
    assert.ok(resume.includes('June 2024'));
    assert.ok(resume.includes('September 2024'));
  });

  it('4. renders REAL skills strictly separated by provenance truth', async () => {
    const { docs } = await generate();
    const resume = docs.resume.markdownContent;
    // Verified skills under the Verified label
    const verifiedLine = resume.split('\n').find((l) => l.includes('**Verified:**'));
    assert.ok(verifiedLine.includes('Postgresql'));
    assert.ok(verifiedLine.includes('FastAPI'));
    // Self-reported skills must NOT be presented as verified
    const claimedLine = resume.split('\n').find((l) => l.includes('**Self-reported:**'));
    assert.ok(claimedLine.includes('Django'));
    assert.ok(claimedLine.includes('AWS'));
  });

  it('5. renders REAL projects with repository names and technologies', async () => {
    const { docs } = await generate();
    const resume = docs.resume.markdownContent;
    assert.ok(resume.includes('vishu1803/Ai-job-mcp'));
    assert.ok(resume.includes('vishu1803/Collaborative-task-manager'));
    assert.ok(resume.includes('PostgreSQL'));
  });

  it('6. introduces NO unsupported claims or placeholder prose in either document', async () => {
    const { docs } = await generate();
    const combined = `${docs.resume.markdownContent}\n${docs.coverLetter.markdownContent}`;
    const audit = CandidateArtifactContentService.auditDocumentContent(combined, {
      requiredTokens: ['Vishwanath Nishad'],
    });
    assert.equal(audit.passed, true, `violations: ${audit.violations.join('; ')}`);
    // Fabricated-currency guard: no invented years-of-experience / scale claims
    assert.doesNotMatch(combined, /\b\d+\+?\s*years of experience\b/i);
    assert.doesNotMatch(combined, /led a team of/i);
    assert.doesNotMatch(combined, /production employment at/i);
  });

  it('7. cover letter contains REAL candidate evidence (employer, projects, verified skills)', async () => {
    const { docs } = await generate();
    const letter = docs.coverLetter.markdownContent;
    assert.ok(letter.includes('Software Engineer, Backend'));
    assert.ok(letter.includes('Vercel'));
    assert.ok(letter.includes('FTV Saloon'));
    assert.ok(letter.includes('vishu1803/Ai-job-mcp'));
    assert.ok(letter.includes('RESTful APIs'));
    // Verified skills cited in the letter
    assert.ok(docs.coverLetter.matchedVerifiedSkills.length > 0);
  });

  it('8. NO generic placeholder sections replace real data anywhere', async () => {
    const { docs } = await generate();
    const combined = `${docs.resume.markdownContent}\n${docs.coverLetter.markdownContent}`;
    assert.doesNotMatch(combined, /Software Development Experience Verified/i);
    assert.doesNotMatch(combined, /Independent \/ Open Source Engineering/i);
    assert.doesNotMatch(combined, /Academic \/ Technical Foundation/i);
    assert.doesNotMatch(combined, /Accredited Institution/i);
    assert.doesNotMatch(combined, /Dedicated software engineer with verified technical skills/i);
    assert.doesNotMatch(combined, /verified achievements/i);
    assert.doesNotMatch(combined, /delivering immediate value/i);
  });

  it('9. missing data is NOT fabricated: sparse profile omits sections cleanly', async () => {
    const service = new CandidateArtifactContentService({
      candidateProfileService: {
        getProfile: async (_context, candidateId) => ({
          candidate: {
            id: candidateId,
            tenantId: '00000000-0000-0000-0000-00000000t001',
            userId: '00000000-0000-0000-0000-00000000u001',
            displayName: 'Sparse Candidate',
            headline: null,
            summary: null,
            canonicalEmail: 'sparse@example.test',
            profileMetadata: {},
          },
          userEmail: 'sparse@example.test',
          identities: [],
          skills: [],
          projects: [],
        }),
      },
    });
    service.loadStoredProjects = async () => [];

    const docs = await service.generateApplicationDocuments({
      tenantId: '00000000-0000-0000-0000-00000000t001',
      userId: '00000000-0000-0000-0000-00000000u001',
      candidateId: '00000000-0000-0000-0000-00000000c002',
      jobPosting: vercelBackendJob,
    });

    const resume = docs.resume.markdownContent;
    // No fabricated sections
    assert.ok(!resume.includes('## Professional Experience'));
    assert.ok(!resume.includes('## Education'));
    assert.ok(!resume.includes('## Projects'));
    // Truthful internal missing state for the mandatory summary slot
    assert.ok(resume.includes('not provided in profile'));
    // Identity + tailoring still present
    assert.ok(resume.includes('Sparse Candidate'));
    assert.ok(resume.includes('Software Engineer, Backend'));
  });

  it('10. tailoring prioritizes job-relevant verified skills (Vercel backend)', async () => {
    const { docs } = await generate();
    const { service } = await generate();
    const verifiedRanked = service.rankSkillsForJob(
      ['Jest', 'TypeScript', 'Postgresql', 'FastAPI', 'Drizzle ORM'],
      { jobKeywords: new Set(['node.js', 'typescript', 'postgresql', 'rest', 'api']) }
    );
    // TypeScript / Postgresql should outrank Jest for this backend role
    const names = verifiedRanked.map((s) => s.name);
    assert.ok(names.indexOf('TypeScript') < names.indexOf('Jest'));
    assert.ok(names.indexOf('Postgresql') < names.indexOf('Jest'));
    // Evidence summary reflects backend-relevant matches
    assert.ok(docs.evidence.verifiedSkillsMatched.length > 0);
  });

  it('11. refuses to generate documents without a real candidate identity', async () => {
    const service = new CandidateArtifactContentService({
      candidateProfileService: {
        getProfile: async () => ({
          candidate: { displayName: null, profileMetadata: {} },
          userEmail: null,
          skills: [],
          projects: [],
          identities: [],
        }),
      },
    });
    service.loadStoredProjects = async () => [];

    await assert.rejects(
      () =>
        service.generateApplicationDocuments({
          tenantId: '00000000-0000-0000-0000-00000000t001',
          userId: '00000000-0000-0000-0000-00000000u001',
          candidateId: '00000000-0000-0000-0000-00000000c003',
          jobPosting: vercelBackendJob,
        }),
      (err) => /displayName/.test(err.message) || /email/.test(err.message)
    );
  });
});
