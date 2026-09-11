/**
 * @file Unit Tests: P16-003 Real PDF Acceptance across 10 Distinct Archetypes
 *
 * Verifies end-to-end PDF generation, exact one-page fit (numpages === 1),
 * zero semantic leakage, and full extraction fidelity using Tectonic compiler
 * across 10 diverse candidate/job profiles:
 *
 * 1. Fresher / CS Graduate (4 projects, verified DSA, zero experience)
 * 2. Early Career / 1 Job (3 projects, 1 experience role)
 * 3. Experienced Senior (2 projects, 2 heavy experience roles)
 * 4. Backend / Distributed Systems Engineer
 * 5. Frontend Product Engineer
 * 6. AI / Machine Learning Engineer
 * 7. Mobile / Full-Stack Engineer
 * 8. DevOps / Infrastructure Engineer
 * 9. Systems / Embedded / C++ Engineer
 * 10. Emerging Tech Stack (Mojo, SurrealDB, Bun, Zig - unknown technology handling)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStructuredResumeDocument,
} from '../../src/services/structured-resume.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';
import { LatexCompilerService } from '../../src/services/latex-compiler.service.js';
import { ResumeParserService } from '../../src/services/resume-parser.service.js';
import { countPdfPages } from '../../src/services/resume-quality-assessment.service.js';

describe('P16-003: 10-Archetype Real PDF Acceptance & One-Page Verification (Req 27)', () => {
  const compiler = new LatexCompilerService();
  const parser = new ResumeParserService();
  const latexGen = new LatexDocumentGenerator();

  const archetypes = [
    // 1. Fresher / CS Graduate (4 projects, verified DSA, 0 experience)
    {
      id: 'fresher-dsa',
      title: 'Fresher / CS Graduate with Problem Solving',
      candidate: {
        id: 'c-fresher',
        displayName: 'Devon Fresher',
        email: 'devon.fresher@synthetic-test.org',
        headline: 'Software Engineer',
        skills: [
          { name: 'Python', provenanceStatus: 'VERIFIED' },
          { name: 'Java', provenanceStatus: 'VERIFIED' },
          { name: 'PostgreSQL', provenanceStatus: 'VERIFIED' },
          { name: 'Git', provenanceStatus: 'VERIFIED' },
        ],
        projects: [
          { id: 'fp-1', name: 'Algorithmic Visualizer', technologies: ['Python', 'React'], bullets: ['Visualized graph traversal and sorting algorithms in interactive web canvas.'] },
          { id: 'fp-2', name: 'Distributed Key-Value Store', technologies: ['Java'], bullets: ['Implemented Raft consensus algorithm with leader election and log replication.'] },
          { id: 'fp-3', name: 'Compiler Frontend', technologies: ['Python'], bullets: ['Constructed recursive descent parser generating abstract syntax trees.'] },
          { id: 'fp-4', name: 'Database Query Engine', technologies: ['PostgreSQL', 'Java'], bullets: ['Built relational query execution engine with B-tree indexing.'] },
        ],
        experience: [],
        education: [
          { institution: 'Institute of Technology', degree: 'B.S. in Computer Science', year: '2024', gpa: '3.9' },
        ],
        problemSolving: {
          hasSection: true,
          profileUrl: 'https://leetcode.com/devon-fresher',
          bullets: ['Solved 400+ algorithmic problems across trees, graphs, and dynamic programming.'],
        },
      },
      job: {
        id: 'job-fresher',
        title: 'Junior Software Engineer',
        company: 'Cloud Scale Inc',
        description: 'Junior engineer role requiring strong algorithmic problem solving, Python, Java, and computer science fundamentals.',
        projectRankings: [
          { projectId: 'fp-1', relevanceScore: 90, relevanceRank: 1 },
          { projectId: 'fp-2', relevanceScore: 85, relevanceRank: 2 },
          { projectId: 'fp-3', relevanceScore: 80, relevanceRank: 3 },
          { projectId: 'fp-4', relevanceScore: 75, relevanceRank: 4 },
        ],
      },
    },

    // 2. Early Career / 1 Job (3 projects, 1 experience role)
    {
      id: 'early-career',
      title: 'Early Career Full-Stack Developer (1 Role + 3 Projects)',
      candidate: {
        id: 'c-early',
        displayName: 'Sam Taylor',
        email: 'sam.taylor@synthetic-test.org',
        headline: 'Full-Stack Developer',
        skills: [
          { name: 'TypeScript', provenanceStatus: 'VERIFIED' },
          { name: 'React', provenanceStatus: 'VERIFIED' },
          { name: 'Node.js', provenanceStatus: 'VERIFIED' },
          { name: 'PostgreSQL', provenanceStatus: 'VERIFIED' },
        ],
        experience: [
          {
            company: 'StartApp Labs',
            title: 'Full-Stack Engineer',
            startDate: '2023-06-01',
            endDate: 'Present',
            isCurrent: true,
            bullets: [
              'Maintained customer-facing dashboard and internal operations microservices.',
              'Implemented automated testing workflows improving build reliability.',
            ],
          },
        ],
        projects: [
          { id: 'ep-1', name: 'E-Commerce Platform', technologies: ['TypeScript', 'Node.js', 'PostgreSQL'], bullets: ['Engineered checkout pipeline and order tracking services.'] },
          { id: 'ep-2', name: 'Analytics Service', technologies: ['React', 'TypeScript'], bullets: ['Delivered real-time telemetry dashboard with websocket streaming.'] },
          { id: 'ep-3', name: 'Notification Service', technologies: ['Node.js', 'Redis'], bullets: ['Built asynchronous webhook dispatcher processing event notifications.'] },
        ],
        education: [
          { institution: 'Tech University', degree: 'B.S. in Software Engineering', year: '2023' },
        ],
      },
      job: {
        id: 'job-early',
        title: 'Full-Stack Software Engineer',
        company: 'Nexus Software',
        description: 'Full-stack developer with experience in React, Node.js, TypeScript, and modern APIs.',
        projectRankings: [
          { projectId: 'ep-1', relevanceScore: 88, relevanceRank: 1 },
          { projectId: 'ep-2', relevanceScore: 82, relevanceRank: 2 },
          { projectId: 'ep-3', relevanceScore: 78, relevanceRank: 3 },
        ],
      },
    },

    // 3. Experienced Senior (2 heavy experience roles + 2 projects)
    {
      id: 'senior-engineer',
      title: 'Senior Staff Engineer (Heavy Work History)',
      candidate: {
        id: 'c-senior',
        displayName: 'Dr. Evelyn Reed',
        email: 'evelyn.reed@synthetic-test.org',
        headline: 'Senior Backend Engineer',
        skills: [
          { name: 'Go', provenanceStatus: 'VERIFIED' },
          { name: 'Kubernetes', provenanceStatus: 'VERIFIED' },
          { name: 'PostgreSQL', provenanceStatus: 'VERIFIED' },
          { name: 'Kafka', provenanceStatus: 'VERIFIED' },
          { name: 'Docker', provenanceStatus: 'VERIFIED' },
        ],
        experience: [
          {
            company: 'Enterprise Distributed Systems',
            title: 'Senior Backend Engineer',
            startDate: '2021-02-01',
            endDate: 'Present',
            isCurrent: true,
            bullets: [
              'Architected high-throughput message bus processing critical transactional events.',
              'Led database replication re-architecture to minimize replication lag.',
              'Spearheaded zero-downtime database schema migrations.',
            ],
          },
          {
            company: 'Global Cloud Solutions',
            title: 'Software Engineer',
            startDate: '2018-03-01',
            endDate: '2021-01-31',
            bullets: [
              'Developed RESTful APIs and distributed worker pools in Go.',
              'Configured infrastructure monitoring and alert routing.',
            ],
          },
        ],
        projects: [
          { id: 'sp-1', name: 'Distributed Task Orchestrator', technologies: ['Go', 'Kubernetes'], bullets: ['Implemented fault-tolerant distributed job scheduler with consensus heartbeat.'] },
          { id: 'sp-2', name: 'Log Ingestion Daemon', technologies: ['Go', 'Kafka'], bullets: ['Constructed high-concurrency log collector with buffer recycling.'] },
        ],
        education: [
          { institution: 'Metro University', degree: 'M.S. in Computer Science', year: '2018' },
        ],
      },
      job: {
        id: 'job-senior',
        title: 'Senior Staff Backend Engineer',
        company: 'DataCore Global',
        description: 'Senior backend engineer required with Go, Kubernetes, Kafka, and distributed architecture background.',
        projectRankings: [
          { projectId: 'sp-1', relevanceScore: 95, relevanceRank: 1 },
          { projectId: 'sp-2', relevanceScore: 89, relevanceRank: 2 },
        ],
      },
    },

    // 4. Backend / Distributed Systems Engineer
    {
      id: 'backend-distributed',
      title: 'Backend / Distributed Systems Engineer',
      candidate: {
        id: 'c-backend',
        displayName: 'Marcus Vance',
        email: 'marcus.vance@synthetic-test.org',
        headline: 'Backend Systems Engineer',
        skills: [
          { name: 'Node.js', provenanceStatus: 'VERIFIED' },
          { name: 'PostgreSQL', provenanceStatus: 'VERIFIED' },
          { name: 'Redis', provenanceStatus: 'VERIFIED' },
          { name: 'Docker', provenanceStatus: 'VERIFIED' },
        ],
        experience: [
          {
            company: 'Telemetry Ingestion Corp',
            title: 'Backend Systems Engineer',
            startDate: '2022-04-01',
            endDate: 'Present',
            isCurrent: true,
            bullets: [
              'Built streaming ingestion service handling high-volume IoT telemetry.',
              'Optimized relational queries and materialized views in PostgreSQL.',
            ],
          },
        ],
        projects: [
          { id: 'bp-1', name: 'Telemetry Stream Processor', technologies: ['Node.js', 'Redis', 'PostgreSQL'], bullets: ['Engineered stream deduping and partition routing pipeline.'] },
          { id: 'bp-2', name: 'Auth & Session Proxy', technologies: ['Node.js', 'Docker'], bullets: ['Implemented stateless token authentication reverse proxy.'] },
        ],
        education: [
          { institution: 'Western Tech University', degree: 'B.S. in Computer Science', year: '2022' },
        ],
      },
      job: {
        id: 'job-backend',
        title: 'Backend Systems Engineer',
        company: 'Apex Infrastructure',
        description: 'Scalable backend engineer with Node.js, PostgreSQL, and distributed caching.',
        projectRankings: [
          { projectId: 'bp-1', relevanceScore: 92, relevanceRank: 1 },
          { projectId: 'bp-2', relevanceScore: 84, relevanceRank: 2 },
        ],
      },
    },

    // 5. Frontend Product Engineer
    {
      id: 'frontend-product',
      title: 'Frontend Product Engineer',
      candidate: {
        id: 'c-frontend',
        displayName: 'Elena Rostova',
        email: 'elena.rostova@synthetic-test.org',
        headline: 'Frontend Product Engineer',
        skills: [
          { name: 'React', provenanceStatus: 'VERIFIED' },
          { name: 'TypeScript', provenanceStatus: 'VERIFIED' },
          { name: 'Next.js', provenanceStatus: 'VERIFIED' },
          { name: 'Tailwind CSS', provenanceStatus: 'VERIFIED' },
        ],
        experience: [
          {
            company: 'DesignFlow Inc',
            title: 'Frontend Engineer',
            startDate: '2022-08-01',
            endDate: 'Present',
            isCurrent: true,
            bullets: [
              'Engineered reusable design system components with accessibility standards.',
              'Integrated server-side rendering in Next.js to improve page render times.',
            ],
          },
        ],
        projects: [
          { id: 'fp-prod-1', name: 'Component Library', technologies: ['React', 'TypeScript', 'Tailwind CSS'], bullets: ['Published accessible design tokens and interactive component suite.'] },
          { id: 'fp-prod-2', name: 'SaaS Workspace Dashboard', technologies: ['Next.js', 'React'], bullets: ['Created responsive analytics dashboard with client-side state management.'] },
        ],
        education: [
          { institution: 'Eastern Polytechnic', degree: 'B.S. in Computer Science', year: '2022' },
        ],
      },
      job: {
        id: 'job-frontend',
        title: 'Frontend Product Engineer',
        company: 'HyperGrowth UI',
        description: 'Frontend specialist experienced with React, TypeScript, and accessible component libraries.',
        projectRankings: [
          { projectId: 'fp-prod-1', relevanceScore: 94, relevanceRank: 1 },
          { projectId: 'fp-prod-2', relevanceScore: 88, relevanceRank: 2 },
        ],
      },
    },

    // 6. AI / Machine Learning Engineer
    {
      id: 'ai-ml-engineer',
      title: 'AI / Machine Learning Engineer',
      candidate: {
        id: 'c-aiml',
        displayName: 'Aarav Patel',
        email: 'aarav.patel@synthetic-test.org',
        headline: 'Machine Learning Engineer',
        skills: [
          { name: 'Python', provenanceStatus: 'VERIFIED' },
          { name: 'PyTorch', provenanceStatus: 'VERIFIED' },
          { name: 'FastAPI', provenanceStatus: 'VERIFIED' },
          { name: 'Docker', provenanceStatus: 'VERIFIED' },
        ],
        experience: [
          {
            company: 'Cognitive Computing Labs',
            title: 'Machine Learning Engineer',
            startDate: '2022-01-01',
            endDate: 'Present',
            isCurrent: true,
            bullets: [
              'Fine-tuned transformer models for semantic search and classification.',
              'Built low-latency FastAPI model serving infrastructure with batch inference.',
            ],
          },
        ],
        projects: [
          { id: 'ml-1', name: 'Semantic Search Engine', technologies: ['Python', 'FastAPI', 'PyTorch'], bullets: ['Implemented vector embedding retrieval pipeline for enterprise documents.'] },
          { id: 'ml-2', name: 'Model Evaluation Harness', technologies: ['Python', 'Docker'], bullets: ['Constructed automated benchmark suite assessing model accuracy and drift.'] },
        ],
        education: [
          { institution: 'National Research University', degree: 'M.S. in Artificial Intelligence', year: '2021' },
        ],
      },
      job: {
        id: 'job-aiml',
        title: 'Machine Learning Engineer',
        company: 'DeepLogic AI',
        description: 'ML engineer experienced with PyTorch, model serving, and Python API architecture.',
        projectRankings: [
          { projectId: 'ml-1', relevanceScore: 96, relevanceRank: 1 },
          { projectId: 'ml-2', relevanceScore: 90, relevanceRank: 2 },
        ],
      },
    },

    // 7. Mobile / Full-Stack Engineer
    {
      id: 'mobile-fullstack',
      title: 'Mobile / Full-Stack Engineer',
      candidate: {
        id: 'c-mobile',
        displayName: 'Lucas Silva',
        email: 'lucas.silva@synthetic-test.org',
        headline: 'Mobile & Full-Stack Engineer',
        skills: [
          { name: 'React Native', provenanceStatus: 'VERIFIED' },
          { name: 'TypeScript', provenanceStatus: 'VERIFIED' },
          { name: 'Node.js', provenanceStatus: 'VERIFIED' },
          { name: 'GraphQL', provenanceStatus: 'VERIFIED' },
        ],
        experience: [
          {
            company: 'MobileFirst Studio',
            title: 'Mobile Developer',
            startDate: '2023-01-01',
            endDate: 'Present',
            isCurrent: true,
            bullets: [
              'Delivered cross-platform mobile features for iOS and Android in React Native.',
              'Integrated GraphQL client caching to support offline document editing.',
            ],
          },
        ],
        projects: [
          { id: 'mob-1', name: 'Field Service App', technologies: ['React Native', 'TypeScript'], bullets: ['Built offline-first mobile app with SQLite synchronization.'] },
          { id: 'mob-2', name: 'GraphQL Gateway', technologies: ['Node.js', 'GraphQL'], bullets: ['Created federated schema aggregating mobile API endpoints.'] },
        ],
        education: [
          { institution: 'Polytechnic Institute', degree: 'B.S. in Information Systems', year: '2022' },
        ],
      },
      job: {
        id: 'job-mobile',
        title: 'Mobile Application Engineer',
        company: 'AppVenture Global',
        description: 'Mobile engineer with React Native, TypeScript, and GraphQL expertise.',
        projectRankings: [
          { projectId: 'mob-1', relevanceScore: 91, relevanceRank: 1 },
          { projectId: 'mob-2', relevanceScore: 85, relevanceRank: 2 },
        ],
      },
    },

    // 8. DevOps / Infrastructure Engineer
    {
      id: 'devops-infra',
      title: 'DevOps / Infrastructure Engineer',
      candidate: {
        id: 'c-devops',
        displayName: 'Karin Lindqvist',
        email: 'karin.lindqvist@synthetic-test.org',
        headline: 'Site Reliability Engineer',
        skills: [
          { name: 'Kubernetes', provenanceStatus: 'VERIFIED' },
          { name: 'Terraform', provenanceStatus: 'VERIFIED' },
          { name: 'Docker', provenanceStatus: 'VERIFIED' },
          { name: 'Linux', provenanceStatus: 'VERIFIED' },
        ],
        experience: [
          {
            company: 'Nordic Cloud Ops',
            title: 'Site Reliability Engineer',
            startDate: '2021-09-01',
            endDate: 'Present',
            isCurrent: true,
            bullets: [
              'Provisioned multi-region cloud infrastructure using modular Terraform templates.',
              'Managed Kubernetes cluster upgrades and autoscaling policies.',
            ],
          },
        ],
        projects: [
          { id: 'inf-1', name: 'Infrastructure as Code Platform', technologies: ['Terraform', 'Kubernetes'], bullets: ['Automated cloud resource provisioning with GitOps workflow.'] },
          { id: 'inf-2', name: 'Observability Exporter', technologies: ['Linux', 'Docker'], bullets: ['Configured Prometheus metric scrapers and custom health endpoints.'] },
        ],
        education: [
          { institution: 'Stockholm Technical University', degree: 'B.S. in Computer Science', year: '2021' },
        ],
      },
      job: {
        id: 'job-devops',
        title: 'Cloud Infrastructure & SRE',
        company: 'ReliableCloud Tech',
        description: 'Site reliability engineer with Kubernetes, Terraform, and Docker expertise.',
        projectRankings: [
          { projectId: 'inf-1', relevanceScore: 93, relevanceRank: 1 },
          { projectId: 'inf-2', relevanceScore: 87, relevanceRank: 2 },
        ],
      },
    },

    // 9. Systems / Embedded / C++ Engineer
    {
      id: 'systems-cpp',
      title: 'Systems & Embedded C++ Engineer',
      candidate: {
        id: 'c-cpp',
        displayName: 'Dmitri Volkov',
        email: 'dmitri.volkov@synthetic-test.org',
        headline: 'Systems Software Engineer',
        skills: [
          { name: 'C++', provenanceStatus: 'VERIFIED' },
          { name: 'C', provenanceStatus: 'VERIFIED' },
          { name: 'Linux', provenanceStatus: 'VERIFIED' },
          { name: 'Git', provenanceStatus: 'VERIFIED' },
        ],
        experience: [
          {
            company: 'Low Latency Systems AG',
            title: 'Systems Engineer',
            startDate: '2021-05-01',
            endDate: 'Present',
            isCurrent: true,
            bullets: [
              'Implemented lock-free ring buffers and low-latency network socket handlers.',
              'Profiled cache efficiency and CPU instruction pipelines on Linux.',
            ],
          },
        ],
        projects: [
          { id: 'sys-1', name: 'High-Performance Order Router', technologies: ['C++', 'Linux'], bullets: ['Engineered memory-mapped matching engine with microsecond latency.'] },
          { id: 'sys-2', name: 'Embedded Sensor Driver', technologies: ['C', 'Linux'], bullets: ['Constructed kernel-space character device driver with interrupt handling.'] },
        ],
        education: [
          { institution: 'Imperial Engineering University', degree: 'B.S. in Electrical & Computer Engineering', year: '2021' },
        ],
      },
      job: {
        id: 'job-cpp',
        title: 'C++ Systems Engineer',
        company: 'Quantum Trading Systems',
        description: 'Systems software engineer specializing in modern C++, memory models, and Linux kernel fundamentals.',
        projectRankings: [
          { projectId: 'sys-1', relevanceScore: 95, relevanceRank: 1 },
          { projectId: 'sys-2', relevanceScore: 88, relevanceRank: 2 },
        ],
      },
    },

    // 10. Emerging Tech Stack (Unknown technologies: Mojo, SurrealDB, Bun, Zig)
    {
      id: 'emerging-tech',
      title: 'Emerging Tech Stack (Novel Tech Names - Req 26)',
      candidate: {
        id: 'c-novel',
        displayName: 'Zoe Sterling',
        email: 'zoe.sterling@synthetic-test.org',
        headline: 'Next-Gen Systems Engineer',
        skills: [
          { name: 'Zig', provenanceStatus: 'VERIFIED' },
          { name: 'Mojo', provenanceStatus: 'VERIFIED' },
          { name: 'SurrealDB', provenanceStatus: 'VERIFIED' },
          { name: 'Bun', provenanceStatus: 'VERIFIED' },
        ],
        experience: [
          {
            company: 'Next Wave Lab',
            title: 'Systems Researcher',
            startDate: '2022-07-01',
            endDate: 'Present',
            isCurrent: true,
            bullets: [
              'Benchmarked modern systems runtimes and emerging database architectures.',
              'Implemented high-throughput data pipelines using novel memory models.',
            ],
          },
        ],
        projects: [
          { id: 'nov-1', name: 'Zero-Allocation Parser', technologies: ['Zig', 'SurrealDB'], bullets: ['Engineered SIMD-accelerated serialization format with zero heap allocations.'] },
          { id: 'nov-2', name: 'Heterogeneous Compute Kernel', technologies: ['Mojo', 'Bun'], bullets: ['Constructed GPU matrix multiply primitives utilizing hardware tensor cores.'] },
        ],
        education: [
          { institution: 'Advanced Computing Academy', degree: 'B.S. in Applied Mathematics & Computing', year: '2022' },
        ],
      },
      job: {
        id: 'job-novel',
        title: 'Modern Systems Engineer',
        company: 'Pioneer Runtimes',
        description: 'Research and development engineer exploring high-performance next-generation systems languages.',
        projectRankings: [
          { projectId: 'nov-1', relevanceScore: 92, relevanceRank: 1 },
          { projectId: 'nov-2', relevanceScore: 86, relevanceRank: 2 },
        ],
      },
    },
  ];

  for (const tc of archetypes) {
    it(`compiles exactly 1 page PDF with zero leakage for archetype: ${tc.title}`, async () => {
      const structuredResume = buildStructuredResumeDocument({
        candidateProfile: tc.candidate,
        jobPosting: tc.job,
        options: { projectRankings: tc.job.projectRankings },
      });

      const latexResult = latexGen.generateTailoredResumeLatex({
        applicationPackage: {
          candidateName: tc.candidate.displayName,
          candidateEmail: tc.candidate.email,
          structuredResume,
          targetJob: tc.job,
        },
      });

      const { pdfBuffer } = await compiler.compileLatexToPdf({
        texContent: latexResult.texContent,
        jobName: `p16-003-${tc.id}`,
      });

      // 1. Strict One-Page Fit Verification (Req 27)
      const pageCount = countPdfPages(pdfBuffer);
      assert.equal(pageCount, 1, `${tc.title} must compile to exactly 1 page; got ${pageCount} pages`);

      // 2. Text Extraction & Fidelity Verification
      const extractedText = parser.extractRawText({ buffer: pdfBuffer, format: 'PDF' });
      assert.ok(extractedText && extractedText.length > 200, 'extracted text must be substantive');

      // Candidate name must survive extraction intact
      assert.ok(
        extractedText.includes(tc.candidate.displayName),
        `${tc.title}: candidate name "${tc.candidate.displayName}" must be present in extracted text`
      );

      // 3. Negative Assertion: ZERO File Path Leakage
      assert.doesNotMatch(
        extractedText,
        /\b(?:src\/|lib\/|app\/|controllers\/|routes\/|components\/)[a-zA-Z0-9_\-\/]+\.(?:js|ts|py|go|rs)\b/i,
        `${tc.title}: must not leak source file paths`
      );
      assert.doesNotMatch(
        extractedText,
        /\b(?:Dockerfile|package\.json|tsconfig\.json|\.env)\b/i,
        `${tc.title}: must not leak build files`
      );

      // 4. Negative Assertion: ZERO Fake Accomplishment Templates
      assert.doesNotMatch(
        extractedText,
        /developed .* functionality in/i,
        `${tc.title}: must not contain fake bullet templates`
      );
      assert.doesNotMatch(
        extractedText,
        /verified by repository evidence/i,
        `${tc.title}: must not contain fake evidence text`
      );

      // 5. Unicode / Ligature Extraction Integrity
      assert.ok(
        !/[\uFB00-\uFB06]/.test(extractedText),
        `${tc.title}: no common ligature codepoints in extracted PDF text`
      );
      assert.ok(
        !extractedText.includes('\uFFFD'),
        `${tc.title}: no Unicode replacement characters`
      );
    });
  }
});
