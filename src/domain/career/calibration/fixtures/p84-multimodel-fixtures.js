/**
 * @file P84 Multi-Model Calibration Fixtures
 *
 * Houses versioned calibration fixtures for Claude, Gemini, and Grok evaluations
 * of the Vishwanath Nishad candidate resume against the Target Full Stack Job Description.
 *
 * Guaranteed Blind: Evaluator payloads contain zero engine scores or expected benchmark scores.
 */

import { createHash } from 'node:crypto';

export const P84_TARGET_JOB = Object.freeze({
  id: 'job-fullstack-target-2026',
  title: 'Full Stack Software Engineer',
  company: 'ScaleCraft Labs',
  description:
    'ScaleCraft Labs is seeking a Full Stack Software Engineer to develop scalable web applications, real-time developer tooling, and robust REST APIs. Required: Python, TypeScript, JavaScript, React, Next.js, Node.js, Express.js, PostgreSQL, REST APIs, Git. Preferred/Good-to-have: Cloud infrastructure (AWS, GCP, or Azure), Redis, AI coding tools (Copilot, Cursor), NoSQL databases, automated unit testing, and a degree in Computer Science, IT, or related engineering discipline.',
  skills: [
    'Python',
    'TypeScript',
    'JavaScript',
    'React',
    'Next.js',
    'Node.js',
    'Express.js',
    'PostgreSQL',
    'REST APIs',
    'Git',
    'Redis',
    'AWS',
    'AI Coding Tools',
    'NoSQL',
    'Unit Testing',
  ],
  requirements: [
    { skill: 'Python', importance: 'REQUIRED' },
    { skill: 'TypeScript', importance: 'REQUIRED' },
    { skill: 'JavaScript', importance: 'REQUIRED' },
    { skill: 'React', importance: 'REQUIRED' },
    { skill: 'Next.js', importance: 'REQUIRED' },
    { skill: 'Node.js', importance: 'REQUIRED' },
    { skill: 'Express.js', importance: 'REQUIRED' },
    { skill: 'PostgreSQL', importance: 'REQUIRED' },
    { skill: 'REST APIs', importance: 'REQUIRED' },
    { skill: 'Git', importance: 'REQUIRED' },
    { skill: 'Redis', importance: 'PREFERRED' },
    { skill: 'AWS', importance: 'PREFERRED' },
    { skill: 'AI Coding Tools', importance: 'PREFERRED' },
    { skill: 'NoSQL', importance: 'PREFERRED' },
    { skill: 'Computer Science Degree', importance: 'REQUIRED' },
  ],
});

export const P84_RESUME_TEXT = `Vishwanath Nishad
Email: vishwanath@example.com | Phone: +91 9876543210
LinkedIn · GitHub · Portfolio · LeetCode

Professional Summary
Full-stack engineer specializing in robust, scalable backend systems and RESTful API design using Python (FastAPI/Django) and Node.js (Express/NestJS). Proven ability to independently deliver high-performance, production-ready applications, leveraging expertise in PostgreSQL and modular service design. Strong foundational problem-solver with a rigorous daily practice in Data Structures and Algorithms.

Technical Skills
Languages: Python, TypeScript, JavaScript, SQL
Frontend: React, Next.js, HTML5, CSS3, Tailwind CSS
Backend & APIs: Node.js, Express.js, RESTful APIs, Next.js API Routes
Databases & Tools: PostgreSQL, Redis, Prisma ORM, Git, GitHub
Core Concepts: Data Structures & Algorithms, OOP, Database Management Systems, Operating Systems, Computer Networks

Technical Projects
Collaborative Task Manager | Next.js, TypeScript, Express.js, PostgreSQL, Prisma
• Architected a responsive collaborative task management platform using Next.js 14 and TypeScript with server-side rendering.
• Implemented RESTful CRUD APIs with Node.js, Express.js, and Prisma ORM, backed by a normalized PostgreSQL schema.
• Developed real-time updates and role-based access control with secure JWT authentication.

AI-Powered Code Review Assistant | Python, FastAPI, Flask, Redis, OpenAI API, Next.js
• Built an automated code review service integrating OpenAI API with asynchronous FastAPI endpoints for pull request evaluation.
• Automated code evaluation across multiple repositories.
• Integrated Redis caching to reduce redundant LLM API calls and optimize response latencies for repeated diffs.

Professional Experience
FTV Saloon — Full Stack Developer Intern (Remote)
2024-06 – 2024-09
• Designed and implemented modular RESTful APIs for core scheduling and customer management operations.
• Optimized critical backend database queries, resulting in a 40% reduction in page load time.
• Built secure role-based access control (RBAC) middleware for multi-tenant branch authentication.

Education
B.Tech in Electronics Engineering
Dr. A.P.J. Abdul Kalam Technical University | 2021 – 2025

Problem Solving & Algorithmic Practice
LeetCode: 300+ problems solved across Arrays, Strings, Trees, Graphs, Dynamic Programming, and System Design fundamentals.
`;

export const P84_JOB_SHA256 = createHash('sha256')
  .update(JSON.stringify(P84_TARGET_JOB))
  .digest('hex');

export const P84_RESUME_SHA256 = createHash('sha256')
  .update(P84_RESUME_TEXT)
  .digest('hex');

export const P84_CLAUDE_EVALUATION = Object.freeze({
  evaluationVersion: 'p84.0',
  resumeArtifactSha256: P84_RESUME_SHA256,
  jobDescriptionSha256: P84_JOB_SHA256,
  engineScoreVersion: 'p82.0',
  evaluator: {
    provider: 'claude',
    model: 'claude-3-7-sonnet-20250219',
    promptVersion: 'p84-evaluator-v1',
  },
  scores: {
    ats_parseability: 82,
    job_match: 70,
    keyword_coverage: 60,
    content_quality: 75,
    evidence_integrity: 66,
    human_recruiter_strength: 72,
    overall_resume_quality: 70,
  },
  recommendation: 'MODERATE_MATCH',
  criticalWeaknesses: [
    'Degree is B.Tech in Electronics Engineering, not Computer Science/IT as the JD specifies; "or related field" provides some cover, but it is not an exact match.',
    'No cloud platform experience (AWS/GCP/Azure) despite this being an explicit good-to-have item.',
    'No mention of AI coding tools such as GitHub Copilot, Cursor, or ChatGPT as a development tool.',
    'NestJS is claimed in the professional summary but does not appear in Technical Skills or projects — unsupported claim.',
    '40% reduction in page load time during a short internship has no supporting context/baseline/measurement method and is therefore unverifiable.',
  ],
  strongestEvidence: [
    'Two substantive technically detailed projects demonstrating backend/API/database work.',
    '300+ LeetCode problems across core DSA topics.',
    'Direct language match: Python, TypeScript and JavaScript.',
    'React and Next.js demonstrated at project level.',
    'PostgreSQL and REST API experience demonstrated across projects/internship.',
  ],
  atsRiskFlags: [
    'LinkedIn/GitHub/Portfolio/LeetCode appear only as labels without visible URLs in extracted text.',
    'Inconsistent date formatting.',
    'NestJS appears in summary but not skills/projects.',
    'Git/version control is implied but not explicit enough in skills.',
    'SQL/NoSQL and Node.js terminology may not be sufficiently explicit.',
  ],
  unsupportedOrSuspicious: [
    'NestJS unsupported.',
    '40% page-load reduction insufficiently evidenced.',
  ],
  confidence: 'MEDIUM',
  createdAt: '2026-09-18T00:00:00.000Z',
});

export const P84_GEMINI_EVALUATION = Object.freeze({
  evaluationVersion: 'p84.0',
  resumeArtifactSha256: P84_RESUME_SHA256,
  jobDescriptionSha256: P84_JOB_SHA256,
  engineScoreVersion: 'p82.0',
  evaluator: {
    provider: 'gemini',
    model: 'gemini-1.5-pro-002',
    promptVersion: 'p84-evaluator-v1',
  },
  scores: {
    ats_parseability: 88,
    job_match: 86,
    keyword_coverage: 80,
    content_quality: 75,
    evidence_integrity: 80,
    human_recruiter_strength: 85,
    overall_resume_quality: 82,
  },
  recommendation: 'STRONG_MATCH',
  criticalWeaknesses: [
    'Degree branch divergence: Electronics Engineering rather than Computer Science/IT.',
    'Missing AWS/GCP/Azure.',
    'Projects are under-quantified.',
    'NestJS appears in summary but not skills/projects/experience.',
    'FastAPI and Express.js are omitted from Technical Skills despite project usage.',
  ],
  strongestEvidence: [
    'Strong stack alignment: Next.js, React, Node.js/Express.js, TypeScript and PostgreSQL.',
    'AI-Powered Code Review Assistant using OpenAI API, Redis and FastAPI.',
    '300+ LeetCode problems.',
    '3-month remote Full Stack Developer internship.',
    'Relevant CS coursework: DSA, DBMS, OS, Computer Networks.',
  ],
  atsRiskFlags: [
    'Portfolio/GitHub/LeetCode links lack visible fallback URLs.',
    'Date ranges use non-standard formatting such as 2024-06-2024-09.',
    'Dangling/incomplete bullet: "Automated code evaluation across multiple repositories."',
    'AWS/GCP/Azure, unit testing and AI coding tools are absent.',
    'Flask/FastAPI wording may be architecturally ambiguous.',
  ],
  unsupportedOrSuspicious: [
    'NestJS unsupported.',
    '40% page-load reduction insufficiently evidenced.',
    'Flask/FastAPI architecture ambiguous.',
  ],
  confidence: 'HIGH',
  createdAt: '2026-09-18T00:00:00.000Z',
});

export const P84_GROK_EVALUATION = Object.freeze({
  evaluationVersion: 'p84.0',
  resumeArtifactSha256: P84_RESUME_SHA256,
  jobDescriptionSha256: P84_JOB_SHA256,
  engineScoreVersion: 'p82.0',
  evaluator: {
    provider: 'grok',
    model: 'grok-2-1212',
    promptVersion: 'p84-evaluator-v1',
  },
  scores: {
    ats_parseability: 88,
    job_match: 78,
    keyword_coverage: 72,
    content_quality: 76,
    evidence_integrity: 82,
    human_recruiter_strength: 80,
    overall_resume_quality: 78,
  },
  recommendation: 'MODERATE_MATCH',
  criticalWeaknesses: [
    'Electronics Engineering rather than Computer Science/IT/related CS degree.',
    'Only approximately 3 months professional experience.',
    'Skills/summary contain technologies weakly or not demonstrated in projects/experience.',
    'No AWS/GCP/Azure or AI coding assistant experience.',
    'Contact links lack visible URLs in extracted text.',
  ],
  strongestEvidence: [
    'Relevant full-stack projects using TypeScript, Next.js, Express.js/Prisma/PostgreSQL and Python/FastAPI/Flask/PostgreSQL/Redis/OpenAI API.',
    'Internship experience with REST APIs, RBAC/authentication and quantified optimization.',
    'JavaScript, TypeScript and Python plus REST APIs/PostgreSQL/Git.',
    '300+ LeetCode problems.',
    'Practical backend/full-stack exposure including async endpoints, webhooks, real-time features and Agile collaboration.',
  ],
  atsRiskFlags: [
    'Middot-separated contact links.',
    'Skills categories mix technologies with inconsistent evidence.',
    'Education date ambiguity.',
    'Possible formatting risk.',
    'Limited quantified evidence.',
  ],
  unsupportedOrSuspicious: [
    'NestJS unsupported.',
    'Drizzle ORM and Socket.io insufficiently evidenced.',
    '40% page-load reduction insufficiently evidenced.',
  ],
  confidence: 'HIGH',
  createdAt: '2026-09-18T00:00:00.000Z',
});

export const P84_EVALUATIONS = Object.freeze([
  P84_CLAUDE_EVALUATION,
  P84_GEMINI_EVALUATION,
  P84_GROK_EVALUATION,
]);
