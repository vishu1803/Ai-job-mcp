import fs from 'node:fs/promises';
import path from 'node:path';
import { generateResumeContent } from '../src/services/resume-generation-content.service.js';
import { GeminiVertexAdapter } from '../src/clients/vertex/vertex-adapter.js';
import { LatexCompilerService } from '../src/services/latex-compiler.service.js';
import { LatexDocumentGenerator } from '../src/services/latex-document-generator.service.js';
import { onePageResumeView } from '../src/services/one-page-resume.service.js';
import { ProjectRelevanceService } from '../src/services/project-relevance.service.js';

const candidateProfile = {
  id: '10a2b51b-09bf-4090-8040-1f60ebeb89c9',
  tenantId: '24d53f53-780e-4431-b065-32180c354175',
  displayName: 'Vishwanath Nishad',
  canonicalEmail: 'vishwanatnishad@gmail.com',
  email: 'vishwanatnishad@gmail.com',
  phone: '+91 7905087928',
  headline: 'Full-Stack & Backend Developer',
  location: 'Gorakhpur, India',
  links: [
    { label: 'LinkedIn', url: 'https://linkedin.com/in/vishwanath-nishad', platform: 'LINKEDIN' },
    { label: 'GitHub', url: 'https://github.com/vishu1803', platform: 'GITHUB' },
    {
      label: 'Portfolio',
      url: 'https://my-portfolio-kappa-beige-71.vercel.app',
      platform: 'PORTFOLIO',
    },
    { label: 'LeetCode', url: 'https://leetcode.com/u/vishwanatnishad', platform: 'LEETCODE' },
  ],
  skills: [
    { name: 'TypeScript', category: 'Languages', provenanceStatus: 'CLAIMED' },
    { name: 'JavaScript', category: 'Languages', provenanceStatus: 'CLAIMED' },
    { name: 'Python', category: 'Languages', provenanceStatus: 'CLAIMED' },
    { name: 'SQL', category: 'Languages', provenanceStatus: 'CLAIMED' },
    { name: 'Node.js', category: 'Backend & APIs', provenanceStatus: 'CLAIMED' },
    { name: 'NestJS', category: 'Backend & APIs', provenanceStatus: 'CLAIMED' },
    { name: 'Express.js', category: 'Backend & APIs', provenanceStatus: 'CLAIMED' },
    { name: 'FastAPI', category: 'Backend & APIs', provenanceStatus: 'CLAIMED' },
    { name: 'Flask', category: 'Backend & APIs', provenanceStatus: 'CLAIMED' },
    { name: 'Django', category: 'Backend & APIs', provenanceStatus: 'CLAIMED' },
    { name: 'REST APIs', category: 'Backend & APIs', provenanceStatus: 'CLAIMED' },
    { name: 'PostgreSQL', category: 'Databases & ORMs', provenanceStatus: 'CLAIMED' },
    { name: 'Prisma', category: 'Databases & ORMs', provenanceStatus: 'CLAIMED' },
    { name: 'Redis', category: 'Databases & ORMs', provenanceStatus: 'CLAIMED' },
    { name: 'MongoDB', category: 'Databases & ORMs', provenanceStatus: 'CLAIMED' },
    { name: 'Docker', category: 'Cloud, DevOps & Systems', provenanceStatus: 'CLAIMED' },
    { name: 'Git', category: 'Cloud, DevOps & Systems', provenanceStatus: 'CLAIMED' },
    { name: 'GitHub Actions', category: 'Cloud, DevOps & Systems', provenanceStatus: 'CLAIMED' },
    { name: 'React', category: 'Frontend & Web', provenanceStatus: 'CLAIMED' },
    { name: 'Next.js', category: 'Frontend & Web', provenanceStatus: 'CLAIMED' },
    { name: 'Tailwind CSS', category: 'Frontend & Web', provenanceStatus: 'CLAIMED' },
  ],
  projects: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Product Data Explorer',
      displayName: 'Product Data Explorer',
      description:
        'Architected a full-stack product explorer with Next.js 14 frontend, Tailwind CSS, modular NestJS backend, PostgreSQL persistence, and Redis caching.',
      technologies: ['TypeScript', 'NestJS', 'Next.js', 'PostgreSQL', 'TypeORM', 'Docker', 'Redis'],
      repositoryUrl: 'https://github.com/vishu1803/Product-Data-Explorer',
      provenanceStatus: 'CLAIMED',
      bullets: [
        'Architected full-stack product explorer with Next.js 14 frontend, Tailwind CSS, and server-side rendering for catalog browsing.',
        'Engineered modular NestJS backend with TypeORM, PostgreSQL persistence, and Redis caching layer to accelerate query response times.',
        'Integrated Swagger/OpenAPI documentation and containerized services using Docker Compose with automated GitHub Actions CI/CD.',
      ],
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Collaborative Task Manager',
      displayName: 'Collaborative Task Manager',
      description:
        'Built full-stack task management platform with role-based access control, secure authentication, PostgreSQL, and Prisma ORM.',
      technologies: [
        'TypeScript',
        'Next.js',
        'Express.js',
        'Node.js',
        'Prisma',
        'PostgreSQL',
        'Role-Based Access Control',
      ],
      repositoryUrl: 'https://github.com/vishu1803/Collaborative-task-manager',
      provenanceStatus: 'CLAIMED',
      bullets: [
        'Built a secure, full-stack task management platform with JWT-based authentication and fine-grained Role-Based Access Control (RBAC) for collaboration.',
        'Designed and implemented high-performance RESTful CRUD APIs using Node.js and Prisma ORM, optimizing complex PostgreSQL queries to support real-time updates.',
        'Provided a responsive interface with real-time updates and an optimized database structure.',
      ],
    },
    {
      id: '00000000-0000-4000-8000-000000000003',
      name: 'AI-Powered Code Review Assistant',
      displayName: 'AI-Powered Code Review Assistant',
      description:
        'Engineered automated code analysis tool using Python, FastAPI, and Flask to analyze pull requests and detect anti-patterns.',
      technologies: ['Python', 'FastAPI', 'Flask', 'Git', 'OpenAI API'],
      repositoryUrl: 'https://github.com/vishu1803/Ai-powered-code-review-assistant',
      provenanceStatus: 'CLAIMED',
      bullets: [
        'Engineered automated code analysis tool using Python, FastAPI, and Flask to analyze pull requests and detect code anti-patterns.',
        'Implemented rule-based validation to detect security vulnerabilities, code smells, and syntax issues in pull requests.',
        'Configured Git and GitHub webhook integration to post automated review feedback directly on code changes.',
      ],
    },
  ],
  experience: [
    {
      id: '00000000-0000-4000-8000-000000000004',
      title: 'Full Stack Developer Intern',
      company: 'FTV Saloon',
      startDate: '2024-06',
      endDate: '2024-09',
      location: 'Remote',
      employmentType: 'INTERNSHIP',
      provenanceStatus: 'CLAIMED',
      highlights: [
        'Designed and implemented robust RESTful APIs for core salon operations, ensuring reliable data consistency.',
        'Developed a secure authentication system featuring role-based access control (RBAC) and specialized admin dashboards.',
        'Optimized critical backend database queries and frontend asset loading, resulting in a 40% reduction in page load time.',
      ],
      bullets: [
        'Designed and implemented robust RESTful APIs for core salon operations, ensuring reliable data consistency.',
        'Developed a secure authentication system featuring role-based access control (RBAC) and specialized admin dashboards.',
        'Optimized critical backend database queries and frontend asset loading, resulting in a 40% reduction in page load time.',
      ],
    },
  ],
  education: [
    {
      id: '00000000-0000-4000-8000-000000000005',
      institution: 'Rajkiya Engineering College | Sonbhadra',
      degree: 'Bachelor of Technology',
      fieldOfStudy: 'Electronics Engineering',
      startDate: '2021-08',
      endDate: '2025-07',
      grade: '7.5 CGPA',
      location: 'Sonbhadra, India',
      coursework: [
        'Data Structures & Algorithms',
        'Python',
        'C',
        'System Modeling',
        'Operating Systems',
        'DBMS',
        'Computer Networks',
      ],
    },
  ],
  languages: [
    { language: 'English', proficiency: 'PROFESSIONAL' },
    { language: 'Hindi', proficiency: 'PROFESSIONAL' },
  ],
  dsa: {
    hasSection: true,
    profileUrl: 'https://leetcode.com/u/vishwanatnishad',
    title: 'LeetCode Profile',
    subtitle: 'Data Structures & Algorithms',
    bullets: [
      '300+ LeetCode problems solved across core computer science topics (Dynamic Programming, Graphs, Trees, Arrays, Binary Search).',
      'Daily competitive programming and DSA practice to maintain interview readiness and a strong analytical foundation.',
      'Demonstrated proficiency in translating complex algorithmic solutions into production code for system optimization.',
    ],
  },
};

const jobSoftwareEngineer = {
  id: '00000000-0000-5000-a000-000000000001',
  tenantId: candidateProfile.tenantId,
  title: 'Software Engineer',
  company: 'TechCorp Solutions',
  description:
    'Seeking a Software Engineer to design, build, and maintain full-stack web applications and robust services. Must have hands-on experience with TypeScript or JavaScript, React/Next.js frontend development, Node.js or Python backend APIs, relational databases like PostgreSQL, and containerization with Docker.',
  requirements: [
    'Software Engineering',
    'TypeScript',
    'JavaScript',
    'React',
    'Next.js',
    'Node.js',
    'Python',
    'PostgreSQL',
    'REST APIs',
    'Docker',
    'Git',
  ],
};

const jobSeniorBackend = {
  id: '00000000-0000-5000-a000-000000000002',
  tenantId: candidateProfile.tenantId,
  title: 'Senior Backend Engineer',
  company: 'Redient Security',
  description:
    'Seeking a Backend Engineer to architect, build, and scale robust backend services, microservices, and RESTful APIs. Must have deep experience with Node.js, Python (FastAPI/Flask), PostgreSQL relational database schema design and query optimization, Redis caching, secure authentication and RBAC, and containerized deployment with Docker.',
  requirements: [
    'Backend Engineering',
    'Node.js',
    'Python',
    'FastAPI',
    'Flask',
    'PostgreSQL',
    'Prisma',
    'Redis',
    'REST APIs',
    'Docker',
    'Authentication',
    'Role-Based Access Control',
  ],
};

async function runComparative() {
  console.log('=== INITIALIZING COMPARATIVE RESUME TAILORING AUDIT ===');
  const aiProvider = new GeminiVertexAdapter();
  const generator = new LatexDocumentGenerator();
  const compiler = new LatexCompilerService({
    pdflatexPath: 'missing-offline-quality-tex',
    chromeTimeoutMs: 60000,
  });
  compiler.tectonicPath = null;

  const outDir = path.resolve('output/unified-resume/comparative-acceptance');
  await fs.mkdir(outDir, { recursive: true });

  for (const [roleName, targetJob] of [
    ['software-engineer', jobSoftwareEngineer],
    ['senior-backend-engineer', jobSeniorBackend],
  ]) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Generating resume for: ${roleName.toUpperCase()}`);
    console.log(`Job Title: ${targetJob.title} at ${targetJob.company}`);

    const context = { tenantId: candidateProfile.tenantId, userId: 'dev-user' };
    const ranking = ProjectRelevanceService.computeProjectsRelevance(
      context,
      targetJob,
      candidateProfile.projects,
      { candidateId: candidateProfile.id, skills: candidateProfile.skills, maxProjects: 3 }
    );

    console.log('Project rankings computed:');
    for (const r of ranking.projectRankings) {
      console.log(
        `  - #${r.rank} ${r.projectName}: score=${r.relevanceScore}, status=${r.selectionStatus}`
      );
    }

    const selectedProjects = candidateProfile.projects.filter((p) =>
      ranking.projectRankings.some((r) => r.projectId === p.id && r.selectionStatus === 'SELECTED')
    );
    console.log(`Selected projects count: ${selectedProjects.length}`);

    const result = await generateResumeContent({
      candidateProfile,
      jobPosting: targetJob,
      selectedProjects,
      selectedSkills: candidateProfile.skills,
      projectRankings: ranking.projectRankings,
      aiProvider,
      generator,
      compiler,
    });

    const view = onePageResumeView(result.safeStructuredResume);
    console.log(`Writing method: ${result.safeStructuredResume.writing?.method}`);
    console.log(`Provider used: ${result.safeStructuredResume.writing?.providerUsed}`);
    console.log(`Provider: ${result.safeStructuredResume.writing?.provider}`);
    console.log(`Summary status: ${result.safeStructuredResume.writing?.summaryStatus}`);
    console.log(`Tailored Headline: "${view.candidateIdentity?.headline}"`);
    console.log(`Tailored Summary: "${view.summary?.text}"`);
    console.log(`Section order: ${view.sectionOrder?.join(' -> ')}`);
    console.log(`Projects rendered count: ${view.projects?.length}`);
    for (const p of view.projects || []) {
      console.log(
        `  * ${p.displayName || p.name} (${(p.technologies || []).slice(0, 4).join(', ')})`
      );
      for (const b of (p.bullets || []).slice(0, 2)) {
        console.log(`    - ${typeof b === 'string' ? b : b.text}`);
      }
    }
    console.log(`Skill categories count: ${view.skills?.categories?.length}`);
    for (const cat of view.skills?.categories || []) {
      console.log(
        `  * ${cat.categoryName}: ${cat.skills?.map((s) => s.displayName || s.name).join(', ')}`
      );
    }

    // Save JSON
    await fs.writeFile(
      path.join(outDir, `${roleName}.structured.json`),
      JSON.stringify(result.safeStructuredResume, null, 2)
    );

    // Compile to PDF
    const tex = generator.generateTailoredResumeLatex({
      applicationPackage: { structuredResume: result.safeStructuredResume },
    }).texContent;

    const compiled = await compiler.compileLatexToPdf({
      texContent: tex,
      jobName: roleName,
      strictOnePage: true,
    });

    const pdfPath = path.join(outDir, `${roleName}.pdf`);
    await fs.writeFile(pdfPath, compiled.pdfBuffer);
    console.log(`Saved PDF to: ${pdfPath} (${compiled.pageCount} page(s))`);
  }

  console.log('\n=== COMPARATIVE RESUME TAILORING COMPLETED SUCCESSFULLY ===');
}

runComparative().catch((err) => {
  console.error('Comparative generation error:', err);
  process.exit(1);
});
