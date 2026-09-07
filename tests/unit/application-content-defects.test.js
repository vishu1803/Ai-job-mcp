import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CandidateArtifactContentService } from '../../src/services/candidate-artifact-content.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';
import { PdfQaValidatorService } from '../../src/services/pdf-qa-validator.service.js';
import { ApplicationPackageSchema } from '../../src/domain/job/job-workflow.schemas.js';
import { ValidationError } from '../../src/errors/index.js';

describe('Unit: Application Content Defects & Readiness Regression Suite', () => {
  const service = new CandidateArtifactContentService();
  const qaValidator = new PdfQaValidatorService();

  const dummyJob = {
    id: 'job-unit-test-1',
    source: 'GREENHOUSE',
    title: 'Senior Backend Engineer',
    company: 'Vercel',
    location: 'Remote',
    workplaceType: 'REMOTE',
    employmentType: 'FULL_TIME',
    description:
      'We are seeking a Senior Backend Engineer proficient in Node.js, Fastify, PostgreSQL, and Python (FastAPI).',
    responsibilities: ['Architect scalable backend services', 'Design RESTful APIs'],
    requirements: ['Node.js', 'PostgreSQL', 'FastAPI', 'Fastify', 'Docker', 'AWS'],
    skills: ['Node.js', 'PostgreSQL', 'FastAPI', 'Fastify', 'Docker', 'AWS'],
    applicationUrl: 'https://vercel.com/careers/backend-engineer',
    retrievedAt: new Date().toISOString(),
  };

  const makePdfWithText = (text) => {
    const streamContent = `(${text})Tj`;
    const padding = '% '.repeat(300) + '\n';
    return Buffer.from(
      `%PDF-1.5\n${padding}1 0 obj\n<< /Length ${streamContent.length + 50} >>\nstream\n${streamContent}\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF`
    );
  };

  // ---------------------------------------------------------------------------
  // 1. Candidate Input Integrity: Fail-closed on test remnants
  // ---------------------------------------------------------------------------
  describe('Candidate input integrity gate', () => {
    it('fails closed and identifies source field when candidate summary contains test remnants', () => {
      const contaminatedData = {
        displayName: 'Test Engineer',
        email: 'test@example.org',
        summary: 'delivering high-performan Testing dirty state bar.ce applications [updated]',
        jobKeywords: ['backend'],
        experience: [],
        projects: [],
      };

      assert.throws(
        () => service.validateCandidateInputIntegrity(contaminatedData),
        (err) => {
          assert.ok(err instanceof ValidationError);
          assert.ok(
            err.message.includes('candidates.summary'),
            'Must identify field candidates.summary'
          );
          assert.ok(
            err.message.includes('Testing dirty state') ||
              err.message.includes('corrupted word splice'),
            'Must identify specific defect'
          );
          return true;
        }
      );
    });

    it('fails closed when experience bullet contains test remnants', () => {
      const contaminatedData = {
        displayName: 'Test Engineer',
        email: 'test@example.org',
        summary: 'Clean professional summary.',
        jobKeywords: ['backend'],
        experience: [
          {
            title: 'Backend Engineer',
            company: 'TechCorp',
            bullets: [
              'Built scalable APIs',
              'Implemented Testing dirty state bar for UI validation',
            ],
          },
        ],
        projects: [],
      };

      assert.throws(
        () => service.validateCandidateInputIntegrity(contaminatedData),
        (err) => {
          assert.ok(err instanceof ValidationError);
          assert.ok(
            err.message.includes('experience[0].bullets[1]'),
            'Must identify exact bullet index'
          );
          return true;
        }
      );
    });

    it('fails closed when project name contains test tag [test] or [updated]', () => {
      const contaminatedData = {
        displayName: 'Test Engineer',
        email: 'test@example.org',
        summary: 'Clean professional summary.',
        jobKeywords: ['backend'],
        experience: [],
        projects: [
          {
            name: 'vishu1803/Ai-job-mcp [updated]',
            summary: 'AI job MCP platform',
          },
        ],
      };

      assert.throws(
        () => service.validateCandidateInputIntegrity(contaminatedData),
        (err) => {
          assert.ok(err instanceof ValidationError);
          assert.ok(err.message.includes('projects[0].name'), 'Must identify projects[0].name');
          return true;
        }
      );
    });

    it('passes for clean, authentic candidate profile data', () => {
      const cleanData = {
        displayName: 'Vishwanath Nishad',
        email: 'vishwanatnishad@gmail.com',
        summary:
          'Full-stack engineer specializing in robust, scalable backend systems and RESTful API design using Python (FastAPI/Django) and Node.js (Express/NestJS). Proven ability to independently deliver high-performance, production-ready applications, leveraging expertise in PostgreSQL and modular service design.',
        jobKeywords: ['backend', 'fastapi', 'postgresql'],
        experience: [],
        projects: [
          {
            name: 'vishu1803/Ai-job-mcp',
            summary: 'Universal AI career copilot MCP platform.',
          },
        ],
      };

      assert.doesNotThrow(() => service.validateCandidateInputIntegrity(cleanData));
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Project Deduplication: Active vs Archived
  // ---------------------------------------------------------------------------
  describe('Project ranking and deduplication', () => {
    it('deterministically prefers active repository row over duplicate archived row', () => {
      const storedMap = new Map();
      storedMap.set('vishu1803/ai-job-mcp', {
        id: '57e17373-ea29-48ae-94fc-0758ce284969',
        name: 'vishu1803/Ai-job-mcp',
        metadata: {
          sourceUrl: 'https://github.com/vishu1803/Ai-job-mcp',
          portfolioStatus: 'ACTIVE',
        },
      });

      const candidateData = {
        jobKeywords: ['mcp', 'job', 'agent', 'backend'],
        storedProjectByUrl: storedMap,
        projects: [
          {
            name: 'vishu1803/Ai-job-mcp',
            url: null,
            summary: null,
            technologies: ['Node.js', 'Fastify'],
            metadata: {
              portfolioStatus: 'ARCHIVED',
              archivedAt: '2026-08-30T12:11:20.306Z',
            },
          },
          {
            name: 'vishu1803/Ai-job-mcp',
            url: 'https://github.com/vishu1803/Ai-job-mcp',
            summary: 'Repository: https://github.com/vishu1803/Ai-job-mcp',
            technologies: ['Node.js', 'PostgreSQL', 'Fastify'],
            metadata: {
              sourceUrl: 'https://github.com/vishu1803/Ai-job-mcp',
            },
          },
          {
            name: 'vishu1803/Collaborative-task-manager',
            url: 'https://github.com/vishu1803/Collaborative-task-manager',
            summary: 'Real-time collaborative task manager',
            technologies: ['Node.js', 'React', 'PostgreSQL'],
            metadata: {
              sourceUrl: 'https://github.com/vishu1803/Collaborative-task-manager',
            },
          },
        ],
      };

      const ranked = service.rankProjectsForJob(candidateData);

      // Must strictly contain 2 projects (deduplicated)
      assert.strictEqual(ranked.length, 2, 'Duplicate projects must be collapsed to 1');
      const mcpProject = ranked.find((p) => p.name === 'vishu1803/Ai-job-mcp');
      assert.ok(mcpProject, 'vishu1803/Ai-job-mcp must be present');
      assert.strictEqual(
        mcpProject.url,
        'https://github.com/vishu1803/Ai-job-mcp',
        'Active repository URL must be preserved'
      );
    });

    it('renders unique project headers in resume markdown', () => {
      const candidateData = {
        displayName: 'Vishwanath Nishad',
        email: 'vishwanatnishad@gmail.com',
        phone: '+919999999999',
        location: 'Remote',
        summary: 'Full-stack engineer specializing in robust, scalable backend systems.',
        jobKeywords: ['backend', 'node.js', 'postgresql'],
        experience: [],
        education: [],
        skills: [
          { name: 'Node.js', provenanceStatus: 'VERIFIED' },
          { name: 'PostgreSQL', provenanceStatus: 'VERIFIED' },
        ],
        storedProjectByUrl: new Map([
          [
            'vishu1803/ai-job-mcp',
            {
              name: 'vishu1803/Ai-job-mcp',
              metadata: { sourceUrl: 'https://github.com/vishu1803/Ai-job-mcp' },
            },
          ],
        ]),
        projects: [
          {
            name: 'vishu1803/Ai-job-mcp',
            summary: 'Universal AI career copilot MCP platform.',
            technologies: ['Node.js', 'PostgreSQL'],
          },
          {
            name: 'vishu1803/Ai-job-mcp',
            summary: 'Old archived duplicate row.',
            technologies: ['Node.js'],
            metadata: { portfolioStatus: 'ARCHIVED' },
          },
        ],
      };

      const resume = service.buildTailoredResumeMarkdown(candidateData, dummyJob);
      // Name can appear in heading + link once, but the project heading ### must appear exactly once
      const headingMatches = [
        ...resume.markdownContent.matchAll(/###\s+\[AI Job MCP\]/g),
      ];
      assert.strictEqual(
        headingMatches.length,
        1,
        'Resume must contain exactly one project heading for AI Job MCP'
      );
    });

    it('prevents repeated project names in cover letter markdown', () => {
      const candidateData = {
        displayName: 'Vishwanath Nishad',
        email: 'vishwanatnishad@gmail.com',
        phone: '+919999999999',
        location: 'Remote',
        summary: 'Full-stack engineer specializing in robust, scalable backend systems.',
        jobKeywords: ['backend', 'node.js', 'postgresql'],
        experience: [],
        education: [],
        skills: [
          { name: 'Node.js', provenanceStatus: 'VERIFIED' },
          { name: 'PostgreSQL', provenanceStatus: 'VERIFIED' },
        ],
        storedProjectByUrl: new Map(),
        projects: [
          {
            name: 'vishu1803/Ai-job-mcp',
            url: 'https://github.com/vishu1803/Ai-job-mcp',
            summary: 'Universal AI career copilot MCP platform.',
            technologies: ['Node.js', 'PostgreSQL'],
          },
          {
            name: 'vishu1803/Ai-job-mcp',
            url: null,
            summary: 'Duplicate row.',
            technologies: ['Node.js'],
            metadata: { portfolioStatus: 'ARCHIVED' },
          },
        ],
      };

      const cl = service.buildCoverLetterMarkdown(candidateData, dummyJob);
      assert.ok(
        !cl.markdownContent.includes('I built AI Job MCP and AI Job MCP'),
        'Cover letter must never repeat the same project name'
      );
      assert.ok(
        cl.markdownContent.includes('I built AI Job MCP'),
        'Cover letter should mention the project once with clean human-readable name'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Truthful Skills Separation in Cover Letter
  // ---------------------------------------------------------------------------
  describe('Truthful skill framing in cover letter', () => {
    it('separates verified skills from claimed skills without blanket verification claims', () => {
      const candidateData = {
        displayName: 'Vishwanath Nishad',
        email: 'vishwanatnishad@gmail.com',
        phone: '+919999999999',
        location: 'Remote',
        summary: 'Full-stack engineer specializing in robust, scalable backend systems.',
        jobKeywords: ['fastapi', 'postgresql', 'aws', 'docker'],
        experience: [],
        education: [],
        skills: [
          { name: 'FastAPI', provenanceStatus: 'VERIFIED' },
          { name: 'PostgreSQL', provenanceStatus: 'VERIFIED' },
          { name: 'AWS', provenanceStatus: 'SELF_DECLARED' },
          { name: 'Docker', provenanceStatus: 'CLAIMED' },
        ],
        storedProjectByUrl: new Map(),
        projects: [
          {
            name: 'vishu1803/Ai-job-mcp',
            url: 'https://github.com/vishu1803/Ai-job-mcp',
            technologies: ['FastAPI', 'PostgreSQL'],
          },
        ],
      };

      const cl = service.buildCoverLetterMarkdown(candidateData, dummyJob);
      const text = cl.markdownContent;

      assert.ok(
        !/Each of these skills is verified/i.test(text),
        'Must NOT claim that each skill is verified'
      );
      assert.ok(
        text.includes('verified proficiency in'),
        'Must explicitly qualify verified proficiency'
      );
      assert.ok(
        text.includes('practical experience with'),
        'Must separate claimed/self-reported practical experience'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Document Content Audit Gates
  // ---------------------------------------------------------------------------
  describe('Document self-audit gates', () => {
    it('auditDocumentContent detects duplicate project headers in resume', () => {
      const badMarkdown = `
# Vishwanath Nishad
## Projects
### [vishu1803/Ai-job-mcp](https://github.com/vishu1803/Ai-job-mcp)
Description 1
### [vishu1803/Ai-job-mcp](https://github.com/vishu1803/Ai-job-mcp)
Description 2
`;
      const audit = CandidateArtifactContentService.auditDocumentContent(badMarkdown);
      assert.strictEqual(audit.passed, false);
      assert.ok(
        audit.violations.some((v) => v.includes('Duplicate project section in resume')),
        'Must flag duplicate resume project'
      );
    });

    it('auditDocumentContent detects repeated projects in cover letter', () => {
      const badMarkdown = `
Dear Hiring Team,
My public repository work demonstrates this directly: I built vishu1803/Ai-job-mcp and vishu1803/Ai-job-mcp.
`;
      const audit = CandidateArtifactContentService.auditDocumentContent(badMarkdown);
      assert.strictEqual(audit.passed, false);
      assert.ok(
        audit.violations.some((v) => v.includes('Duplicate project in cover letter')),
        'Must flag repeated cover letter project'
      );
    });

    it('auditDocumentContent detects sweeping verification claim', () => {
      const badMarkdown = `
Each of these skills is verified against my public repository work.
`;
      const audit = CandidateArtifactContentService.auditDocumentContent(badMarkdown);
      assert.strictEqual(audit.passed, false);
      assert.ok(
        audit.violations.some((v) => v.includes('Sweeping skill verification claim detected')),
        'Must flag sweeping skill verification claim'
      );
    });

    it('auditDocumentContent detects test remnants and word splices', () => {
      const badMarkdown = `
delivering high-performan Testing dirty state bar.ce applications
`;
      const audit = CandidateArtifactContentService.auditDocumentContent(badMarkdown);
      assert.strictEqual(audit.passed, false);
      assert.ok(
        audit.violations.some((v) => v.includes('Malformed text or test remnant detected')),
        'Must flag test remnants'
      );
    });

    it('LatexDocumentGenerator.auditLatexContent detects test remnants and sweeping claims', () => {
      const badLatex = `
\\atssection{Professional Summary}
delivering high-performan Testing dirty state bar.ce
Each of these skills is verified
`;
      const audit = LatexDocumentGenerator.auditLatexContent(badLatex);
      assert.strictEqual(audit.passed, false);
      assert.ok(
        audit.violations.some((v) => v.includes('Forbidden placeholder content or test remnant')),
        'Must flag LaTeX test remnant'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 5. PDF QA Validator Gates
  // ---------------------------------------------------------------------------
  describe('PdfQaValidatorService gates', () => {
    it('validatePdf fails closed on test remnants in PDF text extraction', async () => {
      const fakePdf = makePdfWithText(
        'Vishwanath Nishad vishwanatnishad@gmail.com high-performan Testing dirty state bar.ce Vercel'
      );

      const result = await qaValidator.validatePdf({
        pdfBuffer: fakePdf,
        expectedCandidate: {
          name: 'Vishwanath Nishad',
          email: 'vishwanatnishad@gmail.com',
        },
        targetJob: { company: 'Vercel' },
        documentType: 'RESUME',
      });

      assert.strictEqual(result.passed, false);
      assert.ok(
        result.criticalFailures.some((f) => f.includes('Suspicious test remnant')),
        'Critical failure must be reported for test remnant'
      );
    });

    it('validatePdf fails closed on sweeping verification claims in cover letter', async () => {
      const fakePdf = makePdfWithText(
        'Vishwanath Nishad vishwanatnishad@gmail.com Vercel Each of these skills is verified against my public repository work.'
      );

      const result = await qaValidator.validatePdf({
        pdfBuffer: fakePdf,
        expectedCandidate: {
          name: 'Vishwanath Nishad',
          email: 'vishwanatnishad@gmail.com',
        },
        targetJob: { company: 'Vercel' },
        documentType: 'COVER_LETTER',
      });

      assert.strictEqual(result.passed, false);
      assert.ok(
        result.criticalFailures.some((f) => f.includes('Sweeping unverified skill claim')),
        'Critical failure must be reported for sweeping verification claim'
      );
    });

    it('validatePdf fails closed on duplicate project clause in cover letter', async () => {
      const fakePdf = makePdfWithText(
        'Vishwanath Nishad vishwanatnishad@gmail.com Vercel I built vishu1803/Ai-job-mcp and vishu1803/Ai-job-mcp. Source code is public.'
      );

      const result = await qaValidator.validatePdf({
        pdfBuffer: fakePdf,
        expectedCandidate: {
          name: 'Vishwanath Nishad',
          email: 'vishwanatnishad@gmail.com',
        },
        targetJob: { company: 'Vercel' },
        documentType: 'COVER_LETTER',
      });

      assert.strictEqual(result.passed, false);
      assert.ok(
        result.criticalFailures.some((f) => f.includes('Duplicate project in cover letter')),
        'Critical failure must be reported for duplicate project clause'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Application Package Schema & Artifact Readiness
  // ---------------------------------------------------------------------------
  describe('ApplicationPackageSchema & Artifact Readiness', () => {
    it('validates package with full artifact metadata and documentsStatus', () => {
      const validPackageWithArtifacts = {
        candidateId: '10a2b51b-09bf-4090-8040-1f60ebeb89c9',
        candidateName: 'Vishwanath Nishad',
        candidateEmail: 'vishwanatnishad@gmail.com',
        targetJob: dummyJob,
        tailoredResume: {
          title: 'Resume - Vercel',
          markdownContent: '# Vishwanath Nishad\nClean Resume',
          contentHash: 'a'.repeat(64),
          fitScore: 90,
          artifact: {
            filename: 'tailored-resume.pdf',
            mimeType: 'application/pdf',
            fileSizeBytes: 45120,
            contentHash: 'a'.repeat(64),
            pdfContentHash: 'b'.repeat(64),
            availabilityStatus: 'READY',
            viewUrl: '/api/applications/app-1/artifacts/resume/view',
            downloadUrl: '/api/applications/app-1/artifacts/resume/download',
            qaScore: 92,
            qaPassed: true,
          },
        },
        coverLetter: {
          title: 'Cover Letter - Vercel',
          markdownContent: 'Clean Cover Letter',
          contentHash: 'c'.repeat(64),
          artifact: {
            filename: 'tailored-cover-letter.pdf',
            mimeType: 'application/pdf',
            fileSizeBytes: 32000,
            contentHash: 'c'.repeat(64),
            pdfContentHash: 'd'.repeat(64),
            availabilityStatus: 'READY',
            viewUrl: '/api/applications/app-1/artifacts/cover-letter/view',
            downloadUrl: '/api/applications/app-1/artifacts/cover-letter/download',
            qaScore: 95,
            qaPassed: true,
          },
        },
        verifiedSkills: [
          { name: 'Node.js', truthCategory: 'VERIFIED' },
          { name: 'PostgreSQL', truthCategory: 'VERIFIED' },
        ],
        claimedSkills: [{ name: 'AWS', truthCategory: 'USER_PROVIDED' }],
        portfolioLinks: [
          {
            projectName: 'vishu1803/Ai-job-mcp',
            repositoryUrl: 'https://github.com/vishu1803/Ai-job-mcp',
            highlights: ['AI MCP Platform'],
          },
        ],
        answers: {},
        packageHash: 'e'.repeat(64),
        preparedAt: new Date().toISOString(),
        applicationId: 'b7591a4c-6735-4668-a3be-d55a48693d5b',
        packageVersion: 2,
        documentsStatus: 'DOCUMENTS_READY',
        artifactsReady: true,
      };

      const parsed = ApplicationPackageSchema.parse(validPackageWithArtifacts);
      assert.strictEqual(parsed.documentsStatus, 'DOCUMENTS_READY');
      assert.strictEqual(parsed.artifactsReady, true);
      assert.strictEqual(parsed.tailoredResume.artifact.availabilityStatus, 'READY');
      assert.strictEqual(parsed.tailoredResume.artifact.pdfContentHash, 'b'.repeat(64));
    });
  });
});
