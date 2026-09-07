/**
 * @file Unit Tests: Application Document Content Pipeline Defect Fixes
 *
 * Verifies:
 * 1. Structured selectedProjects flow: Step 4 -> package.tailoredResume.selectedProjects -> LaTeX -> PDF
 * 2. Markdown parsing fallback distinguishes ## Section from ### Project without truncating
 * 3. DSA/LeetCode section gating: Not auto-injected; renders as candidate-provided when explicitly selected
 * 4. Truth model: Projects/skills require evidence; Experience/Education/Certs remain candidate-provided
 * 5. Removal of unsupported project impact metrics and generic evidence grounding
 * 6. Non-seniority-inflating headline curation for FRESHER candidates without source-of-truth DB mutation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CandidateArtifactContentService,
  curateCandidateHeadline,
  groundAndSanitizeProject,
  isRealUrl,
  cleanResumeFacingTechnologies,
  formatProjectDisplayName,
} from '../../src/services/candidate-artifact-content.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';
import { ApplicationPackageSchema } from '../../src/domain/job/job-workflow.schemas.js';

describe('Application Document Pipeline Defect Fixes & Integrity', () => {
  const latexGen = new LatexDocumentGenerator();

  const dummyCandidateData = {
    displayName: 'Vishwanath Nishad',
    email: 'vishwanatnishad@gmail.com',
    phone: '7905087928',
    location: 'Gorakhpur, Uttar Pradesh, India',
    headline: 'Full-Stack & Backend Developer | Full-Stack Architect',
    careerStatus: 'FRESHER',
    summary: 'Full-stack engineer specializing in robust, scalable backend systems.',
    jobKeywords: new Set(['fullstack', 'react', 'typescript', 'python', 'backend']),
    skills: [
      { name: 'TypeScript', provenanceStatus: 'VERIFIED', evidenceCount: 10 },
      { name: 'React', provenanceStatus: 'VERIFIED', evidenceCount: 15 },
      { name: 'FastAPI', provenanceStatus: 'VERIFIED', evidenceCount: 8 },
      { name: 'PostgreSQL', provenanceStatus: 'VERIFIED', evidenceCount: 12 },
      { name: 'Docker', provenanceStatus: 'VERIFIED', evidenceCount: 6 },
      { name: 'Flask', provenanceStatus: 'CLAIMED', evidenceCount: 0 },
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
          'Optimized critical backend database queries.',
        ],
      },
    ],
    education: [
      {
        degree: 'Bachelor of Technology in Electronics Engineering',
        institution: 'Rajkiya Engineering College Sonbhadra',
        startDate: '2021',
        endDate: '2025-07',
      },
    ],
    certifications: ['AWS Certified Cloud Practitioner'],
    portfolioLinks: [
      { label: 'LinkedIn', url: 'https://linkedin.com/in/vishwanath-nishad' },
      { label: 'GitHub', url: 'https://github.com/vishu1803' },
      { label: 'Portfolio', url: 'https://vishu-portfolio.vercel.app' },
      { label: 'LeetCode', url: 'https://leetcode.com/u/vishu1803' },
    ],
    projects: [
      {
        name: 'Product-Data-Explorer',
        technologies: ['NestJS', 'PostgreSQL', 'Redis', 'TypeORM'],
        evidence: [
          { skillName: 'NestJS', sourceLocation: { filePath: 'src/main.ts' } },
          { skillName: 'PostgreSQL', sourceLocation: { filePath: 'src/database.ts' } },
          { skillName: 'Redis', sourceLocation: { filePath: 'src/cache.ts' } },
        ],
        bullets: [],
      },
      {
        name: 'Collaborative-task-manager',
        technologies: ['Node.js', 'Express', 'Socket.io', 'PostgreSQL'],
        evidence: [
          { skillName: 'Socket.io', sourceLocation: { filePath: 'src/server.ts' } },
        ],
        bullets: [
          'Built a collaborative task management platform using Node.js and Express.',
          'Integrated real-time updates, reducing team coordination overhead by 35% and improving team productivity.',
        ],
      },
      {
        name: 'Ai-powered-code-review-assistant',
        technologies: ['Python', 'FastAPI', 'Next.js', 'Docker', 'OpenAI API'],
        evidence: [
          { skillName: 'FastAPI', sourceLocation: { filePath: 'backend/app/main.py' } },
          { skillName: 'Docker', sourceLocation: { filePath: 'Dockerfile' } },
        ],
        bullets: [
          'Integrated OpenAI API for automated pull request analysis.',
          'Architected a Flask backend for webhook processing.',
          'Built a review interface, reduced average manual code review time by 40% and improved developer velocity.',
        ],
      },
    ],
  };

  const dummyJob = {
    title: 'Senior Full-Stack Software Engineer, Growth',
    company: 'Discord',
    skills: ['TypeScript', 'React', 'Python', 'FastAPI'],
    recommendedProjects: [
      'Product-Data-Explorer',
      'Collaborative-task-manager',
      'Ai-powered-code-review-assistant',
    ],
  };

  // ---------------------------------------------------------------------------
  // Defect 1: Structured selectedProjects flow and Markdown Fallback Regex
  // ---------------------------------------------------------------------------
  describe('Defect 1: Structured selectedProjects Data Flow & Fallback Regex', () => {
    it('prioritizes structured selectedProjects array when generating Resume LaTeX', () => {
      const pkg = {
        candidateName: 'Vishwanath Nishad',
        candidateEmail: 'vishwanatnishad@gmail.com',
        targetJob: dummyJob,
        tailoredResume: {
          title: 'Resume',
          markdownContent: '## Technical Projects\n### Dummy Project\n- bullet 1',
          selectedProjects: [
            {
              name: 'Product-Data-Explorer',
              technologies: ['NestJS', 'PostgreSQL', 'Redis'],
              bullets: ['Bullet 1', 'Bullet 2'],
            },
            {
              name: 'Collaborative-task-manager',
              technologies: ['Node.js', 'Socket.io'],
              bullets: ['Bullet 1', 'Bullet 2'],
            },
            {
              name: 'Ai-powered-code-review-assistant',
              technologies: ['FastAPI', 'Next.js'],
              bullets: ['Bullet 1', 'Bullet 2'],
            },
          ],
        },
      };

      const result = latexGen.generateTailoredResumeLatex({
        applicationPackage: pkg,
        candidateProfile: dummyCandidateData,
      });

      assert.ok(
        result.texContent.includes('Product Data Explorer'),
        'Must format to human-readable Product Data Explorer'
      );
      assert.ok(
        result.texContent.includes('Collaborative Task Manager'),
        'Must format to human-readable Collaborative Task Manager'
      );
      assert.ok(
        result.texContent.includes('AI-Powered Code Review Assistant'),
        'Must format to human-readable AI-Powered Code Review Assistant'
      );
      assert.ok(!result.texContent.includes('Dummy Project'));
    });

    it('fallback markdown parser preserves all 3 projects and does not confuse ## with ###', () => {
      const markdownContent = `# Vishwanath Nishad

## Professional Summary
Full-stack engineer.

## Technical Skills
- **Backend & APIs:** FastAPI, Node.js

## Technical Projects

### [Product-Data-Explorer](https://github.com/vishu1803/Product-Data-Explorer)
*Technologies: NestJS, PostgreSQL, Redis*
- Architected analytics platform.
- Implemented PostgreSQL caching.

### [Collaborative-task-manager](https://github.com/vishu1803/Collaborative-task-manager)
*Technologies: Node.js, Express, Socket.io*
- Built collaborative task platform.
- Integrated Socket.io for real-time events.

### [Ai-powered-code-review-assistant](https://github.com/vishu1803/Ai-powered-code-review-assistant)
*Technologies: Python, FastAPI, Next.js*
- Integrated OpenAI API for PR review.
- Built async FastAPI backend.

## Professional Experience
### Full Stack Developer Intern — FTV Saloon
*2024-06 – 2024-09 · Remote*
- Designed RESTful APIs.

## Education
- **B.Tech** | REC Sonbhadra
`;

      const pkg = {
        candidateName: 'Vishwanath Nishad',
        candidateEmail: 'vishwanatnishad@gmail.com',
        targetJob: dummyJob,
        tailoredResume: {
          title: 'Resume',
          markdownContent,
          selectedProjects: undefined, // Force markdown parsing fallback
        },
      };

      const result = latexGen.generateTailoredResumeLatex({
        applicationPackage: pkg,
        candidateProfile: dummyCandidateData,
      });

      assert.ok(result.texContent.includes('Product-Data-Explorer'), 'Project 1 must be present');
      assert.ok(result.texContent.includes('Collaborative-task-manager'), 'Project 2 must be present');
      assert.ok(result.texContent.includes('Ai-powered-code-review-assistant'), 'Project 3 must be present');
      assert.ok(result.texContent.includes('FTV Saloon'), 'Experience must be present');
    });

    it('validates that ApplicationPackageSchema permits selectedProjects and selectedSections', () => {
      const validPackage = {
        candidateId: '10a2b51b-09bf-4090-8040-1f60ebeb89c9',
        candidateName: 'Vishwanath Nishad',
        candidateEmail: 'vishwanatnishad@gmail.com',
        targetJob: {
          id: 'job-123',
          source: 'GREENHOUSE',
          title: 'Software Engineer',
          company: 'Discord',
          description: 'Job description text',
          applicationUrl: 'https://discord.com/jobs/123',
          retrievedAt: new Date().toISOString(),
          requirements: ['React'],
          skills: ['React'],
        },
        tailoredResume: {
          title: 'Resume',
          markdownContent: '## Summary',
          contentHash: 'a'.repeat(32),
          fitScore: 90,
          selectedProjects: [{ name: 'Project-1' }],
          selectedSections: ['TECHNICAL_SKILLS', 'PROJECTS'],
        },
        coverLetter: {
          title: 'Cover Letter',
          markdownContent: 'Dear Team',
          contentHash: 'b'.repeat(32),
        },
        verifiedSkills: [],
        claimedSkills: [],
        portfolioLinks: [],
        answers: {},
        preparedAt: new Date().toISOString(),
        packageHash: 'c'.repeat(64),
      };

      const parsed = ApplicationPackageSchema.parse(validPackage);
      assert.equal(parsed.tailoredResume.selectedProjects.length, 1);
      assert.equal(parsed.tailoredResume.selectedSections.length, 2);
    });
  });

  // ---------------------------------------------------------------------------
  // Defect 2: DSA / LeetCode Section Gating
  // ---------------------------------------------------------------------------
  describe('Defect 2: DSA / LeetCode Section Gating', () => {
    it('does NOT auto-inject Problem Solving section solely because a LeetCode URL exists', () => {
      const pkg = {
        candidateName: 'Vishwanath Nishad',
        candidateEmail: 'vishwanatnishad@gmail.com',
        targetJob: dummyJob,
        tailoredResume: {
          title: 'Resume',
          markdownContent: '## Summary\nEngineer.',
          selectedProjects: [],
          selectedSections: ['TECHNICAL_SKILLS', 'PROJECTS', 'PROFESSIONAL_EXPERIENCE', 'EDUCATION'],
        },
      };

      const result = latexGen.generateTailoredResumeLatex({
        applicationPackage: pkg,
        candidateProfile: dummyCandidateData,
      });

      // Header should have LeetCode profile link
      assert.ok(result.texContent.includes('leetcode.com'), 'Header must contain LeetCode link');
      // Body section must NOT be rendered
      assert.ok(
        !result.texContent.includes('\\atssection{Problem Solving'),
        'Problem Solving body section must NOT be auto-injected'
      );
    });

    it('renders Problem Solving section as Candidate-Reported when explicitly selected', () => {
      const pkg = {
        candidateName: 'Vishwanath Nishad',
        candidateEmail: 'vishwanatnishad@gmail.com',
        targetJob: dummyJob,
        tailoredResume: {
          title: 'Resume',
          markdownContent: '## Summary\nEngineer.',
          selectedProjects: [],
          selectedSections: ['TECHNICAL_SKILLS', 'PROJECTS', 'PROBLEM_SOLVING', 'PROFESSIONAL_EXPERIENCE'],
        },
      };

      const result = latexGen.generateTailoredResumeLatex({
        applicationPackage: pkg,
        candidateProfile: dummyCandidateData,
      });

      assert.ok(
        result.texContent.includes('\\atssection{Problem Solving \\& Algorithmic Practice}'),
        'Must render section when explicitly in selectedSections'
      );
      assert.ok(
        result.texContent.includes('Candidate-Reported Problem Solving'),
        'Must classify as candidate-reported problem solving'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Defect 3: Unsupported Impact Claims & Truth Model
  // ---------------------------------------------------------------------------
  describe('Defect 3: Unsupported Project Impact Claims Sanitization & Truth Model', () => {
    it('generically derives authentic bullets from repository evidence when bullets are empty', () => {
      const project = {
        name: 'Product-Data-Explorer',
        technologies: ['NestJS', 'PostgreSQL', 'Redis', 'TypeORM', 'Docker', 'Jest'],
        evidence: [
          { skillName: 'NestJS', sourceLocation: { filePath: 'src/main.ts' } },
          { skillName: 'PostgreSQL', sourceLocation: { filePath: 'src/database.ts' } },
          { skillName: 'Redis', sourceLocation: { filePath: 'src/cache.ts' } },
          { skillName: 'TypeORM', sourceLocation: { filePath: 'src/entities/user.entity.ts' } },
          { skillName: 'Docker', sourceLocation: { filePath: 'docker-compose.yml' } },
        ],
        bullets: [],
      };

      groundAndSanitizeProject(project);

      assert.ok(project.bullets.length >= 2, 'Should synthesize at least 2 authentic bullets');
      assert.ok(
        project.bullets.some((b) => /NestJS RESTful APIs|OpenAPI/i.test(b)),
        'Must reflect verified NestJS API evidence'
      );
      assert.ok(
        project.bullets.some((b) => /PostgreSQL/i.test(b) && /Redis/i.test(b)),
        'Must reflect verified PostgreSQL and Redis evidence'
      );
    });

    it('sanitizes unsupported team productivity claims and unverified Flask references', () => {
      const project = {
        name: 'Collaborative-task-manager',
        technologies: ['Node.js', 'Express', 'Socket.io', 'PostgreSQL'],
        evidence: [
          { skillName: 'Socket.io', sourceLocation: { filePath: 'src/server.ts' } },
        ],
        bullets: [
          'Built collaborative task manager using Node.js.',
          'Integrated real-time updates, reducing team coordination overhead by 35% and improving team productivity.',
        ],
      };

      groundAndSanitizeProject(project);

      assert.ok(
        !project.bullets.some((b) => /improved team productivity|coordination overhead/i.test(b)),
        'Must remove unsupported team productivity metric'
      );
      assert.ok(
        project.bullets.some((b) => /Socket\.io/i.test(b)),
        'Must replace with authentic Socket.io real-time synchronization statement'
      );
    });

    it('sanitizes unverified Flask to FastAPI when repository evidence supports FastAPI', () => {
      const project = {
        name: 'Ai-powered-code-review-assistant',
        technologies: ['Python', 'FastAPI', 'Docker'],
        evidence: [
          { skillName: 'FastAPI', sourceLocation: { filePath: 'backend/app/main.py' } },
          { skillName: 'Docker', sourceLocation: { filePath: 'Dockerfile' } },
        ],
        bullets: [
          'Integrated OpenAI API for automated pull request analysis.',
          'Architected a Flask backend for webhook processing.',
          'Reduced average manual code review time by 40% and improved developer velocity.',
        ],
      };

      groundAndSanitizeProject(project);

      assert.ok(
        !project.bullets.some((b) => /\bflask\b/i.test(b)),
        'Must prune unverified Flask'
      );
      assert.ok(
        project.bullets.some((b) => /FastAPI/i.test(b)),
        'Must sanitize to verified FastAPI'
      );
      assert.ok(
        !project.bullets.some((b) => /reduced average manual code review time|developer velocity/i.test(b)),
        'Must remove unsupported review time reduction metric'
      );
    });

    it('experience, education, and certifications render without requiring repository verification', () => {
      const pkg = {
        candidateName: 'Vishwanath Nishad',
        candidateEmail: 'vishwanatnishad@gmail.com',
        targetJob: dummyJob,
        tailoredResume: {
          title: 'Resume',
          markdownContent: '## Summary\nEngineer.',
          selectedProjects: [],
        },
      };

      const result = latexGen.generateTailoredResumeLatex({
        applicationPackage: pkg,
        candidateProfile: dummyCandidateData,
      });

      assert.ok(result.texContent.includes('FTV Saloon'), 'Experience must render from candidate profile');
      assert.ok(result.texContent.includes('Rajkiya Engineering College'), 'Education must render from candidate profile');
      assert.ok(result.texContent.includes('AWS Certified Cloud Practitioner'), 'Certifications must render from candidate profile');
    });
  });

  // ---------------------------------------------------------------------------
  // Defect 4: Seniority-Inflating Headline Curation
  // ---------------------------------------------------------------------------
  describe('Defect 4: Non-Seniority-Inflating Headline Curation for Freshers', () => {
    it('strips "Full-Stack Architect" for FRESHER candidate while preserving authentic developer roles', () => {
      const rawHeadline = 'Full-Stack & Backend Developer | Full-Stack Architect';
      const curated = curateCandidateHeadline(rawHeadline, { careerStatus: 'FRESHER' });

      assert.equal(curated, 'Full-Stack & Backend Developer');
    });

    it('strips Senior/Principal/Lead titles for candidates with only internship experience', () => {
      const rawHeadline = 'Lead Backend Engineer | Cloud Architect';
      const curated = curateCandidateHeadline(rawHeadline, {
        experience: [{ title: 'Backend Intern', company: 'Startup' }],
      });

      assert.equal(curated, 'Backend Developer');
    });

    it('leaves headline unchanged for verified experienced candidates', () => {
      const rawHeadline = 'Senior Full-Stack Engineer | System Architect';
      const curated = curateCandidateHeadline(rawHeadline, {
        careerStatus: 'EXPERIENCED',
        experience: [{ title: 'Senior Software Engineer', company: 'BigTech' }],
      });

      assert.equal(curated, rawHeadline);
    });

    it('ensures Resume LaTeX headline is curated for FRESHER candidate', () => {
      const pkg = {
        candidateName: 'Vishwanath Nishad',
        candidateEmail: 'vishwanatnishad@gmail.com',
        targetJob: dummyJob,
        tailoredResume: {
          title: 'Resume',
          markdownContent: '## Summary\nEngineer.',
          selectedProjects: [],
        },
      };

      const result = latexGen.generateTailoredResumeLatex({
        applicationPackage: pkg,
        candidateProfile: dummyCandidateData,
      });

      assert.ok(result.texContent.includes('Full-Stack \\& Backend Developer'));
      assert.ok(!result.texContent.includes('Full-Stack Architect'));
    });
  });

  // ---------------------------------------------------------------------------
  // Content Quality Remediation: Zero Synthetic URLs (Issue 1)
  // ---------------------------------------------------------------------------
  describe('Issue 1: Zero Synthetic / Placeholder URLs Gate', () => {
    it('isRealUrl rejects placeholder, example, and invalid domains', () => {
      assert.equal(isRealUrl('https://task-manager.example.com'), false);
      assert.equal(isRealUrl('http://example.com'), false);
      assert.equal(isRealUrl('https://foo.example.org'), false);
      assert.equal(isRealUrl('https://dummy.com'), false);
      assert.equal(isRealUrl('https://sample.com/project'), false);
      assert.equal(isRealUrl('http://localhost:3000'), false);
      assert.equal(isRealUrl('http://127.0.0.1:8080'), false);
      assert.equal(isRealUrl('not-a-url'), false);
      assert.equal(isRealUrl(''), false);
      assert.equal(isRealUrl(null), false);
    });

    it('isRealUrl accepts authentic candidate and project URLs', () => {
      assert.equal(isRealUrl('https://github.com/vishu1803/Collaborative-task-manager'), true);
      assert.equal(isRealUrl('https://collaborative-task-manager-fc26.vercel.app/'), true);
      assert.equal(isRealUrl('https://linkedin.com/in/vishwanath-nishad'), true);
      assert.equal(isRealUrl('https://leetcode.com/u/vishu1803'), true);
    });

    it('omits live demo and repository links in LaTeX when URLs are synthetic or invalid', () => {
      const pkg = {
        candidateName: 'Vishwanath Nishad',
        candidateEmail: 'vishwanatnishad@gmail.com',
        targetJob: dummyJob,
        tailoredResume: {
          title: 'Resume',
          markdownContent: '',
          selectedProjects: [
            {
              name: 'Collaborative-task-manager',
              repoUrl: 'https://github.com/vishu1803/Collaborative-task-manager',
              liveUrl: 'https://task-manager.example.com', // Placeholder URL
              technologies: ['Node.js', 'Express', 'Socket.io'],
              bullets: ['Real-time task synchronization.'],
            },
          ],
        },
      };

      const result = latexGen.generateTailoredResumeLatex({
        applicationPackage: pkg,
        candidateProfile: dummyCandidateData,
      });

      assert.ok(!result.texContent.includes('example.com'), 'Must never contain example.com');
      assert.ok(!result.texContent.includes('Live Demo'), 'Must omit Live Demo link when URL is synthetic');
      assert.ok(
        result.texContent.includes('github.com/vishu1803/Collaborative-task-manager'),
        'Must keep authentic GitHub link'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Content Quality Remediation: Evidence-Aware Skill Curation (Issue 2)
  // ---------------------------------------------------------------------------
  describe('Issue 2: Evidence-Aware Skill Curation & Alias Normalization', () => {
    it('guarantees featured project technologies (NestJS) are preserved in skills', () => {
      const candidateContentService = new CandidateArtifactContentService({ db: {} });
      const jobPosting = {
        title: 'Senior Full-Stack Software Engineer, Growth',
        skills: ['TypeScript', 'React', 'Python'],
        description: 'Building full-stack web applications with APIs and databases.',
      };

      const candidateSkills = [
        { name: 'TypeScript', provenanceStatus: 'VERIFIED', evidenceCount: 10 },
        { name: 'React', provenanceStatus: 'VERIFIED', evidenceCount: 15 },
        { name: 'React.js', provenanceStatus: 'CLAIMED', evidenceCount: 0 }, // Alias overwrite trap
        { name: 'Python', provenanceStatus: 'VERIFIED', evidenceCount: 8 },
        { name: 'NestJS', provenanceStatus: 'VERIFIED', evidenceCount: 5 },
        { name: 'PostgreSQL', provenanceStatus: 'VERIFIED', evidenceCount: 12 },
        { name: 'Redis', provenanceStatus: 'VERIFIED', evidenceCount: 4 },
      ];

      const featuredProjects = [
        {
          name: 'Product-Data-Explorer',
          technologies: ['TypeScript', 'NestJS', 'PostgreSQL', 'Redis'],
        },
      ];

      const candidateData = {
        skills: candidateSkills,
        projects: featuredProjects,
      };

      const { categorizedSkills } = candidateContentService.selectAndCategorizeSkillsForJob(
        candidateData,
        jobPosting
      );

      // Verify category existence
      assert.ok(categorizedSkills['Backend & APIs'], 'Backend & APIs must exist');
      assert.ok(
        categorizedSkills['Backend & APIs'].includes('NestJS'),
        'NestJS featured in Project 1 must be retained in Backend & APIs'
      );
      assert.ok(categorizedSkills['Frontend & Web'], 'Frontend & Web must exist for full-stack role');
      assert.ok(
        categorizedSkills['Frontend & Web'].includes('React'),
        'React must be retained in Frontend & Web without being dropped by React.js claim'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Content Quality Remediation: Balanced Clean Technologies (Issue 3)
  // ---------------------------------------------------------------------------
  describe('Issue 3: Balanced Resume-Facing Technology Selection & Noise Rejection', () => {
    it('cleanResumeFacingTechnologies eliminates raw package noise and selects balanced stack', () => {
      const rawTechnologies = [
        'fs',
        'path',
        'crypto',
        'reflect-metadata',
        'class-transformer',
        'class-validator',
        'cache-manager',
        'cache-manager-redis-store',
        'rxjs',
        'ts-node',
        'eslint',
        'TypeScript',
        'NestJS',
        'React',
        'Redis',
        'TypeORM',
        'Docker Compose',
        'supertest',
        'jest',
      ];

      const cleaned = cleanResumeFacingTechnologies(rawTechnologies, 6);

      // Must NOT contain noisy dependencies
      for (const noise of [
        'fs',
        'path',
        'crypto',
        'reflect-metadata',
        'class-transformer',
        'class-validator',
        'cache-manager',
        'ts-node',
        'eslint',
      ]) {
        assert.ok(
          !cleaned.some((t) => t.toLowerCase() === noise),
          `Must reject noisy package: ${noise}`
        );
      }

      // Must include balanced primary technologies across categories
      assert.ok(cleaned.includes('TypeScript'), 'Must include Language');
      assert.ok(cleaned.includes('NestJS'), 'Must include Web Framework');
      assert.ok(
        cleaned.includes('Redis') || cleaned.includes('TypeORM'),
        'Must include Database/Cache'
      );
      assert.ok(cleaned.length <= 6, 'Must not exceed max count');
    });
  });

  // ---------------------------------------------------------------------------
  // Content Quality Remediation: Experience Provenance (Issue 4)
  // ---------------------------------------------------------------------------
  describe('Issue 4: Candidate Experience Claim Provenance Classification', () => {
    it('buildCandidateData tags candidate-reported experience with USER_PROVIDED provenance', async () => {
      const mockProfileView = {
        candidate: {
          id: '10a2b51b-09bf-4090-8040-1f60ebeb89c9',
          displayName: 'Vishwanath Nishad',
          headline: 'Full-Stack Developer',
          careerStatus: 'FRESHER',
          profileMetadata: {
            resumeData: {
              experience: [
                {
                  title: 'Full Stack Developer Intern',
                  company: 'FTV Saloon',
                  location: 'Remote',
                  startDate: '2024-06',
                  endDate: '2024-09',
                  bullets: ['Designed RESTful APIs', '40% reduction in query latency'],
                },
              ],
            },
          },
        },
        identities: [],
        resources: [],
        projects: [],
        skills: [],
      };

      const candidateContentService = new CandidateArtifactContentService({
        candidateProfileService: {
          getProfile: async () => mockProfileView,
        },
      });
      candidateContentService.loadStoredProjects = async () => [];

      const candidateData = await candidateContentService.buildCandidateData({
        tenantId: '00000000-0000-0000-0000-000000000001',
        userId: '00000000-0000-0000-0000-000000000001',
        candidateId: '10a2b51b-09bf-4090-8040-1f60ebeb89c9',
        jobPosting: dummyJob,
      });

      assert.ok(candidateData.experience.length > 0);
      assert.equal(
        candidateData.experience[0].provenanceStatus,
        'USER_PROVIDED',
        'Candidate experience must be classified as USER_PROVIDED'
      );
      assert.equal(candidateData.experience[0].company, 'FTV Saloon');
    });
  });

  // ---------------------------------------------------------------------------
  // Policy Correction: Project Names, 1-Page Budget, DSA Section, & Additional Skills
  // ---------------------------------------------------------------------------
  describe('Policy Correction: Project Names, 1-Page Budget, DSA Section, and Additional Skills', () => {
    const contentService = new CandidateArtifactContentService();

    it('formatProjectDisplayName generically normalizes repository slugs into clean Title Case', () => {
      assert.equal(
        formatProjectDisplayName('vishu1803/Product-Data-Explorer'),
        'Product Data Explorer'
      );
      assert.equal(
        formatProjectDisplayName('vishu1803/Collaborative-task-manager'),
        'Collaborative Task Manager'
      );
      assert.equal(
        formatProjectDisplayName('vishu1803/Ai-powered-code-review-assistant'),
        'AI-Powered Code Review Assistant'
      );
      assert.equal(
        formatProjectDisplayName('vishu1803/Audience-query-system'),
        'Audience Query System'
      );
      assert.equal(formatProjectDisplayName('vishu1803/Ai-job-mcp'), 'AI Job MCP');
      assert.equal(formatProjectDisplayName('spotify-clone'), 'Spotify Clone');
      assert.equal(formatProjectDisplayName('REST-api-service'), 'REST API Service');
      assert.equal(
        formatProjectDisplayName('Product Data Explorer'),
        'Product Data Explorer'
      );
    });

    it('Scenario A: 3 recommended projects + DSA selected -> selects top 2 projects, preserves DSA section, explicitly records omitted 3rd project', () => {
      const candidateWithDsa = {
        ...dummyCandidateData,
        hasProblemSolvingSection: true,
        portfolioLinks: [
          { label: 'LeetCode', url: 'https://leetcode.com/u/vishwanatnishad' },
          { label: 'GitHub', url: 'https://github.com/vishu1803' },
        ],
        projects: [
          {
            name: 'Product-Data-Explorer',
            title: 'Product Data Explorer',
            repositoryUrl: 'https://github.com/vishu1803/Product-Data-Explorer',
            technologies: ['TypeScript', 'NestJS', 'React', 'PostgreSQL', 'Redis'],
            bullets: [
              'Architected robust RESTful API endpoints using NestJS with TypeORM and PostgreSQL.',
              'Integrated Redis caching layer reducing high-frequency catalog latency by 60%.',
            ],
            evidenceCount: 73,
            provenanceStatus: 'CORROBORATED',
          },
          {
            name: 'Collaborative-task-manager',
            title: 'Collaborative Task Manager',
            repositoryUrl: 'https://github.com/vishu1803/Collaborative-task-manager',
            technologies: ['Node.js', 'Prisma', 'PostgreSQL', 'Next.js', 'TypeScript'],
            bullets: [
              'Engineered full-stack task management platform with JWT authentication and RBAC.',
              'Implemented RESTful CRUD APIs using Node.js, Prisma ORM, and PostgreSQL.',
            ],
            evidenceCount: 34,
            provenanceStatus: 'CORROBORATED',
          },
          {
            name: 'Ai-powered-code-review-assistant',
            title: 'AI-Powered Code Review Assistant',
            repositoryUrl: 'https://github.com/vishu1803/Ai-powered-code-review-assistant',
            technologies: ['Python', 'FastAPI', 'Next.js', 'OpenAI API'],
            bullets: [
              'Architected an asynchronous PR review pipeline using FastAPI, Python, and OpenAI API.',
              'Implemented modular webhook receiver architecture to process GitHub events.',
            ],
            evidenceCount: 33,
            provenanceStatus: 'CORROBORATED',
          },
        ],
      };

      const jobPosting = {
        ...dummyJob,
        recommendedProjects: [
          'Product-Data-Explorer',
          'Collaborative-task-manager',
          'Ai-powered-code-review-assistant',
        ],
      };

      const resume = contentService.buildTailoredResumeMarkdown(candidateWithDsa, jobPosting, {
        includeProblemSolving: true,
      });

      // 1. Budget: exactly top 2 projects selected
      assert.equal(resume.selectedProjects.length, 2, 'Must select top 2 projects for 1-page budget with DSA');
      assert.equal(resume.selectedProjects[0].name, 'Product Data Explorer');
      assert.equal(resume.selectedProjects[1].name, 'Collaborative Task Manager');

      // 2. No silent loss: 3rd project explicitly tracked in omittedProjects
      assert.equal(resume.omittedProjects.length, 1, 'Must track omitted 3rd project');
      assert.equal(resume.omittedProjects[0].name, 'AI-Powered Code Review Assistant');
      assert.ok(
        resume.omittedProjects[0].reason.includes('1-page resume'),
        'Must record clear 1-page budget omission rationale'
      );

      // 3. DSA section present in sections and markdown
      assert.ok(resume.sections.includes('PROBLEM_SOLVING'), 'PROBLEM_SOLVING must be in sections');
      assert.ok(
        resume.markdownContent.includes('## Problem Solving & Algorithmic Practice'),
        'Markdown must contain Problem Solving section'
      );
      assert.ok(
        !resume.markdownContent.includes('300+'),
        'Must not contain unverified problem count claims'
      );

      // 4. LaTeX generator renders both projects and DSA section
      const latex = latexGen.generateTailoredResumeLatex({
        applicationPackage: {
          candidateName: 'Vishwanath Nishad',
          candidateEmail: 'vishwanatnishad@gmail.com',
          targetJob: jobPosting,
          tailoredResume: resume,
        },
        candidateProfile: candidateWithDsa,
      });

      assert.ok(latex.texContent.includes('Product Data Explorer'));
      assert.ok(latex.texContent.includes('Collaborative Task Manager'));
      assert.ok(latex.texContent.includes('Problem Solving \\& Algorithmic Practice'));
    });

    it('Scenario B: 3 recommended projects + DSA not selected -> selects all 3 projects and omits DSA section', () => {
      const candidateWithoutDsa = {
        ...dummyCandidateData,
        projects: [
          {
            name: 'Product-Data-Explorer',
            title: 'Product Data Explorer',
            repositoryUrl: 'https://github.com/vishu1803/Product-Data-Explorer',
            technologies: ['TypeScript', 'NestJS', 'React', 'PostgreSQL', 'Redis'],
            bullets: ['Bullet 1', 'Bullet 2'],
            evidenceCount: 73,
          },
          {
            name: 'Collaborative-task-manager',
            title: 'Collaborative Task Manager',
            repositoryUrl: 'https://github.com/vishu1803/Collaborative-task-manager',
            technologies: ['Node.js', 'Prisma', 'PostgreSQL', 'Next.js'],
            bullets: ['Bullet 1', 'Bullet 2'],
            evidenceCount: 34,
          },
          {
            name: 'Ai-powered-code-review-assistant',
            title: 'AI-Powered Code Review Assistant',
            repositoryUrl: 'https://github.com/vishu1803/Ai-powered-code-review-assistant',
            technologies: ['Python', 'FastAPI', 'OpenAI API'],
            bullets: ['Bullet 1', 'Bullet 2'],
            evidenceCount: 33,
          },
        ],
      };

      const jobPosting = {
        ...dummyJob,
        recommendedProjects: [
          'Product-Data-Explorer',
          'Collaborative-task-manager',
          'Ai-powered-code-review-assistant',
        ],
      };

      const resume = contentService.buildTailoredResumeMarkdown(candidateWithoutDsa, jobPosting, {
        includeProblemSolving: false,
      });

      assert.equal(resume.selectedProjects.length, 3, 'Must render up to 3 projects when DSA is omitted');
      assert.equal(resume.omittedProjects.length, 0, 'No projects omitted from recommended list');
      assert.ok(!resume.sections.includes('PROBLEM_SOLVING'), 'PROBLEM_SOLVING must NOT be in sections');
      assert.ok(
        !resume.markdownContent.includes('## Problem Solving & Algorithmic Practice'),
        'Markdown must NOT contain DSA section'
      );

      const latex = latexGen.generateTailoredResumeLatex({
        applicationPackage: {
          candidateName: 'Vishwanath Nishad',
          candidateEmail: 'vishwanatnishad@gmail.com',
          targetJob: jobPosting,
          tailoredResume: resume,
        },
        candidateProfile: candidateWithoutDsa,
      });

      assert.ok(latex.texContent.includes('Product Data Explorer'));
      assert.ok(latex.texContent.includes('Collaborative Task Manager'));
      assert.ok(latex.texContent.includes('AI-Powered Code Review Assistant'));
      assert.ok(!latex.texContent.includes('Problem Solving \\& Algorithmic Practice'));
    });

    it('Scenario C: Additional Skills inclusion and accurate SELF_DECLARED provenance audit', () => {
      const candidateWithSelfDeclared = {
        ...dummyCandidateData,
        skills: [
          { name: 'TypeScript', provenanceStatus: 'VERIFIED', evidenceCount: 10 },
          { name: 'Python', provenanceStatus: 'VERIFIED', evidenceCount: 8 },
          { name: 'PostgreSQL', provenanceStatus: 'VERIFIED', evidenceCount: 12 },
          { name: 'NestJS', provenanceStatus: 'VERIFIED', evidenceCount: 15 },
          { name: 'Docker', provenanceStatus: 'VERIFIED', evidenceCount: 5 },
          { name: 'AWS', provenanceStatus: 'SELF_DECLARED', evidenceCount: 0 },
          { name: 'Microsoft Azure', provenanceStatus: 'SELF_DECLARED', evidenceCount: 0 },
          { name: 'Google Cloud Platform', provenanceStatus: 'SELF_DECLARED', evidenceCount: 0 },
          { name: 'Cloudflare', provenanceStatus: 'SELF_DECLARED', evidenceCount: 0 },
        ],
      };

      const { categorizedSkills, skillAudit } = contentService.selectAndCategorizeSkillsForJob(
        candidateWithSelfDeclared,
        dummyJob
      );

      // AWS should be selected under Cloud, DevOps & Systems
      const cloudSkills = categorizedSkills['Cloud, DevOps & Systems'] || [];
      assert.ok(cloudSkills.includes('AWS'), 'AWS must be included as relevant declared cloud platform');

      // AWS provenance in skillAudit must remain strictly SELF_DECLARED
      const awsAudit = skillAudit.find((s) => s.skill === 'AWS');
      assert.ok(awsAudit, 'AWS must be audited');
      assert.equal(awsAudit.provenance, 'SELF_DECLARED', 'AWS provenance must remain SELF_DECLARED');
      assert.equal(awsAudit.status, 'SELECTED', 'AWS must be SELECTED');

      // Redundant secondary cloud platforms must be omitted with clear audit reasons
      const azureAudit = skillAudit.find((s) => s.skill === 'Microsoft Azure');
      assert.ok(azureAudit);
      assert.equal(azureAudit.status, 'OMITTED');
      assert.ok(azureAudit.reason.includes('redundancy'));

      const gcpAudit = skillAudit.find((s) => s.skill === 'Google Cloud Platform');
      assert.ok(gcpAudit);
      assert.equal(gcpAudit.status, 'OMITTED');
    });

    it('Scenario D: Project without real demo URL omits Live Demo and rejects synthetic URLs', () => {
      const candidateWithNoDemo = {
        ...dummyCandidateData,
        projects: [
          {
            name: 'Product Data Explorer',
            repositoryUrl: 'https://github.com/vishu1803/Product-Data-Explorer',
            liveUrl: 'https://task-manager.example.com', // synthetic URL
            technologies: ['NestJS', 'PostgreSQL'],
            bullets: ['Built RESTful APIs'],
          },
        ],
      };

      const resume = contentService.buildTailoredResumeMarkdown(candidateWithNoDemo, dummyJob);
      assert.ok(
        !resume.markdownContent.includes('Live Demo:'),
        'Live Demo must be omitted when demo URL is synthetic example.com'
      );
      assert.ok(
        !resume.markdownContent.includes('example.com'),
        'example.com must never leak into resume'
      );
    });
  });
});
