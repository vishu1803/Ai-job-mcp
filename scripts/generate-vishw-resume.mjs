import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateResumeContent } from '../src/services/resume-generation-content.service.js';
import { GeminiVertexAdapter } from '../src/clients/vertex/vertex-adapter.js';
import { LatexCompilerService } from '../src/services/latex-compiler.service.js';
import { LatexDocumentGenerator } from '../src/services/latex-document-generator.service.js';
import { onePageResumeView } from '../src/services/one-page-resume.service.js';

const candidateProfile = {
  id: '10a2b51b-09bf-4090-8040-1f60ebeb89c9',
  tenantId: '24d53f53-780e-4431-b065-32180c354175',
  displayName: 'Vishwanath Nishad',
  canonicalEmail: 'vishwanath.nishad@gmail.com',
  email: 'vishwanath.nishad@gmail.com',
  phone: '+91 9876543210',
  headline: 'Backend Engineer | Node.js, Python, PostgreSQL',
  location: 'India',
  links: [
    { label: 'GitHub', url: 'https://github.com/vishu1803', platform: 'GITHUB' },
    { label: 'LinkedIn', url: 'https://linkedin.com/in/vishwanath-nishad', platform: 'LINKEDIN' },
  ],
  skills: [
    { name: 'Node.js', provenanceStatus: 'CLAIMED' },
    { name: 'Python', provenanceStatus: 'CLAIMED' },
    { name: 'FastAPI', provenanceStatus: 'CLAIMED' },
    { name: 'Flask', provenanceStatus: 'CLAIMED' },
    { name: 'PostgreSQL', provenanceStatus: 'CLAIMED' },
    { name: 'Prisma', provenanceStatus: 'CLAIMED' },
    { name: 'TypeScript', provenanceStatus: 'CLAIMED' },
    { name: 'JavaScript', provenanceStatus: 'CLAIMED' },
    { name: 'Docker', provenanceStatus: 'CLAIMED' },
    { name: 'Git', provenanceStatus: 'CLAIMED' },
    { name: 'REST APIs', provenanceStatus: 'CLAIMED' },
    { name: 'SQL', provenanceStatus: 'CLAIMED' },
    { name: 'Redis', provenanceStatus: 'CLAIMED' },
  ],
  projects: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Collaborative Task Manager',
      displayName: 'Collaborative Task Manager',
      description:
        'A full-stack task management web application with role-based access control and real-time collaboration.',
      technologies: ['Node.js', 'Prisma', 'PostgreSQL', 'TypeScript'],
      repositoryUrl: 'https://github.com/vishu1803/task-manager',
      provenanceStatus: 'CLAIMED',
      bullets: [
        'Built full-stack task management platform with role-based access control and secure authentication.',
        'Designed relational schema and optimized migrations using PostgreSQL and Prisma ORM.',
        'Implemented RESTful endpoints and real-time collaboration features for multi-user task workflows.',
      ],
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'AI-Powered Code Review Assistant',
      displayName: 'AI-Powered Code Review Assistant',
      description:
        'An automated code review developer tool using Python and FastAPI to analyze source code quality.',
      technologies: ['Python', 'FastAPI', 'Flask', 'Git'],
      repositoryUrl: 'https://github.com/vishu1803/code-review-assistant',
      provenanceStatus: 'CLAIMED',
      bullets: [
        'Engineered automated code analysis tool using Python, FastAPI, and Flask to analyze pull requests.',
        'Implemented rule-based validation to detect anti-patterns, code smells, and syntax issues.',
        'Configured Git integration to post automated review feedback on code changes.',
      ],
    },
  ],
  experience: [
    {
      id: '00000000-0000-4000-8000-000000000003',
      title: 'Full Stack Developer Intern',
      company: 'FTV Saloon',
      startDate: '2024-06',
      endDate: '2024-09',
      location: 'Remote',
      employmentType: 'INTERNSHIP',
      provenanceStatus: 'CLAIMED',
      highlights: [
        'Developed RESTful APIs and backend services using Node.js.',
        'Implemented database queries and data validation for customer workflows.',
        'Collaborated with engineering team to test endpoints and fix regression bugs.',
      ],
    },
  ],
  education: [
    {
      id: '00000000-0000-4000-8000-000000000004',
      institution: 'Rajkiya Engineering College (REC), Sonbhadra',
      degree: 'B.Tech',
      fieldOfStudy: 'Electronics Engineering',
      startDate: '2021-08',
      endDate: '2025-06',
      grade: '7.5 CGPA',
      location: 'Sonbhadra, India',
    },
  ],
};

const targetJob = {
  title: 'Backend Engineer',
  company: 'Redient Security',
  description:
    'Seeking a Backend Engineer to build robust RESTful APIs, scale PostgreSQL databases, and develop microservices. Must have hands-on experience with Node.js or Python, relational schema design, database migrations, and secure authentication (RBAC).',
  requirements: [
    'Node.js',
    'Python',
    'PostgreSQL',
    'REST APIs',
    'Prisma',
    'FastAPI',
    'Docker',
    'Authentication',
  ],
};

console.log('--- Starting Resume Generation for Vishwanath Nishad ---');
const aiProvider = new GeminiVertexAdapter();
const generator = new LatexDocumentGenerator();
const compiler = new LatexCompilerService({
  pdflatexPath: 'missing-offline-quality-tex',
  chromeTimeoutMs: 45000,
});
compiler.tectonicPath = null;

const result = await generateResumeContent({
  candidateProfile,
  jobPosting: targetJob,
  selectedProjects: candidateProfile.projects,
  selectedSkills: candidateProfile.skills,
  projectRankings: candidateProfile.projects.map((p, idx) => ({
    projectId: p.id,
    projectName: p.name,
    status: 'SELECTED',
    relevanceScore: 95 - idx * 5,
    rank: idx + 1,
  })),
  aiProvider,
  generator,
  compiler,
});

const view = onePageResumeView(result.safeStructuredResume);
console.log('Writing method used:', result.safeStructuredResume.writing.method);
console.log('Provider used:', result.safeStructuredResume.writing.providerUsed);
console.log('Provider:', result.safeStructuredResume.writing.provider);
console.log('Summary status:', result.safeStructuredResume.writing.summaryStatus);
console.log('Summary text:', view.summary?.text);
console.log('Projects rendered:', view.projects?.length);
console.log('Experience rendered:', view.experience?.length);

const outDir = path.resolve('output/unified-resume/vishw-backend');
await fs.mkdir(outDir, { recursive: true });

await fs.writeFile(
  path.join(outDir, 'vishw-backend-resume.json'),
  JSON.stringify(result.safeStructuredResume, null, 2)
);

const tex = generator.generateTailoredResumeLatex({
  applicationPackage: { structuredResume: result.safeStructuredResume },
}).texContent;

const compiled = await compiler.compileLatexToPdf({
  texContent: tex,
  jobName: 'vishw-backend-resume',
  strictOnePage: true,
});

await fs.writeFile(path.join(outDir, 'vishw-backend-resume.pdf'), compiled.pdfBuffer);
console.log('PDF saved to:', path.join(outDir, 'vishw-backend-resume.pdf'));
console.log('Page count:', compiled.pageCount);
console.log('--- Finished Successfully ---');
