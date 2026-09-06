/**
 * @file Unit Tests: Evidence-Aware Professional Summary Truth Curation (P14-013)
 *
 * Verifies:
 * 1. Claimed framework with zero evidence is omitted from tailored summary.
 * 2. Verified framework remains in tailored summary.
 * 3. Corroborated framework remains where appropriate.
 * 4. Candidate database summary remains strictly unchanged (immutability).
 * 5. No fabricated replacement is inserted.
 * 6. Summary remains coherent and grammatically clean after pruning.
 * 7. Job-specific relevance influences which supported framework is retained.
 * 8. All-unsupported framework parentheticals gracefully reduce to the base technology.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CandidateArtifactContentService,
  curateProfessionalSummary,
} from '../../src/services/candidate-artifact-content.service.js';

describe('Evidence-Aware Professional Summary Curation (P14-013)', () => {
  const service = new CandidateArtifactContentService();

  const candidateData = {
    displayName: 'Vishwanath Nishad',
    headline: 'Full-Stack & Backend Developer | Full-Stack Architect',
    summary:
      'Full-stack engineer specializing in robust, scalable backend systems and RESTful API design using Python (FastAPI/Django) and Node.js (Express/NestJS). Proven ability to independently deliver high-performance, production-ready applications, leveraging expertise in PostgreSQL and modular service design. Strong foundational problem-solver with a rigorous daily practice in Data Structures and Algorithms.',
    skills: [
      { name: 'Python', provenanceStatus: 'VERIFIED', evidenceCount: 6 },
      { name: 'FastAPI', provenanceStatus: 'VERIFIED', evidenceCount: 9 },
      {
        name: 'Django',
        provenanceStatus: 'CLAIMED',
        evidenceCount: 0,
        isUserClaim: true,
        claimNote: '[Unverified User Claim]',
      },
      { name: 'Node.js', provenanceStatus: 'VERIFIED', evidenceCount: 2 },
      { name: 'Express.js', provenanceStatus: 'VERIFIED', evidenceCount: 4 },
      { name: 'NestJS', provenanceStatus: 'VERIFIED', evidenceCount: 4 },
      { name: 'PostgreSQL', provenanceStatus: 'VERIFIED', evidenceCount: 16 },
    ],
    experience: [
      {
        title: 'Full Stack Developer Intern',
        company: 'FTV Saloon',
        bullets: [
          'Designed and implemented robust RESTful APIs for core salon operations, ensuring reliable data consistency.',
          'Developed a secure authentication system featuring role-based access control (RBAC).',
        ],
      },
    ],
    projects: [
      {
        name: 'Collaborative Task Manager',
        technologies: ['Node.js', 'Prisma', 'PostgreSQL', 'Next.js', 'TypeScript'],
        bullets: [
          'Designed and implemented high-performance RESTful CRUD APIs using Node.js and Prisma ORM.',
        ],
      },
      {
        name: 'AI-Powered Code Review Assistant',
        technologies: ['Python', 'Flask', 'FastAPI', 'Next.js'],
        bullets: [
          'Engineered a Flask backend with asynchronous FastAPI endpoints to handle real-time GitHub webhook integrations.',
        ],
      },
    ],
  };

  const stripeJob = {
    title: 'Senior Backend Engineer',
    company: 'Stripe',
    skills: ['Node.js', 'TypeScript', 'PostgreSQL', 'REST APIs', 'FastAPI'],
    description:
      'Stripe is looking for a Senior Backend Engineer to architect, build, and scale high-throughput payment systems and core APIs using Node.js, TypeScript, PostgreSQL, and distributed service architecture.',
    requirements: [
      'Strong production experience with Node.js, TypeScript, or Python',
      'RESTful API architecture and relational databases (PostgreSQL preferred)',
    ],
  };

  it('1. Claimed framework with zero evidence (Django) is omitted from tailored summary', () => {
    const curated = curateProfessionalSummary(candidateData.summary, candidateData, stripeJob);
    assert.equal(
      curated.includes('Django'),
      false,
      'Django (unverified claim, 0 evidence) must NOT appear in tailored summary'
    );
  });

  it('2. Verified framework (FastAPI) remains in tailored summary', () => {
    const curated = curateProfessionalSummary(candidateData.summary, candidateData, stripeJob);
    assert.ok(
      curated.includes('Python (FastAPI)'),
      `Expected "Python (FastAPI)" in curated summary, got: "${curated}"`
    );
  });

  it('3. Corroborated framework remains where appropriate', () => {
    const customData = {
      ...candidateData,
      skills: [
        ...candidateData.skills,
        {
          name: 'Flask',
          provenanceStatus: 'CORROBORATED',
          evidenceCount: 2,
        },
      ],
      summary: 'Backend developer proficient in Python (Flask/Django).',
    };
    const curated = curateProfessionalSummary(customData.summary, customData, stripeJob);
    assert.ok(
      curated.includes('Python (Flask)'),
      `Expected corroborated framework Flask to remain, got: "${curated}"`
    );
    assert.equal(curated.includes('Django'), false);
  });

  it('4. Candidate database summary remains strictly unchanged (immutability)', () => {
    const originalSummary = candidateData.summary;
    const resume = service.buildTailoredResumeMarkdown(candidateData, stripeJob);

    assert.equal(
      candidateData.summary,
      originalSummary,
      'Source candidateData.summary must NEVER be mutated'
    );
    assert.ok(
      resume.markdownContent.includes('Python (FastAPI)'),
      'Tailored markdown must contain curated summary'
    );
    assert.equal(
      resume.markdownContent.includes('Django'),
      false,
      'Tailored markdown must not expose unevidenced Django'
    );
  });

  it('5. No fabricated replacement is inserted', () => {
    const minimalData = {
      displayName: 'Jane Doe',
      summary: 'Specialized in Ruby (Sinatra/Hanami).',
      skills: [
        { name: 'Ruby', provenanceStatus: 'VERIFIED', evidenceCount: 1 },
        { name: 'Sinatra', provenanceStatus: 'CLAIMED', evidenceCount: 0 },
        { name: 'Hanami', provenanceStatus: 'CLAIMED', evidenceCount: 0 },
      ],
    };
    const curated = curateProfessionalSummary(minimalData.summary, minimalData, stripeJob);
    assert.equal(
      curated,
      'Specialized in Ruby.',
      `Expected unsupported parenthetical to gracefully prune to base tech without inventions, got: "${curated}"`
    );
    assert.equal(curated.includes('Rails'), false, 'Must not hallucinate Rails or any replacement');
  });

  it('6. Summary remains coherent and grammatically clean after pruning', () => {
    const curated = curateProfessionalSummary(candidateData.summary, candidateData, stripeJob);
    assert.ok(!curated.includes('()'), 'Must not contain empty parentheses');
    assert.ok(!curated.includes('  '), 'Must not contain double spaces');
    assert.ok(!curated.includes('(FastAPI/'), 'Must not contain dangling trailing slashes');
    assert.ok(!curated.includes('/Express)'), 'Must not contain dangling leading slashes');
    assert.ok(
      curated.startsWith('Full-stack engineer specializing in robust, scalable backend systems'),
      'Surrounding text must be fully preserved'
    );
  });

  it('7. Job-specific relevance influences which supported framework is retained', () => {
    // For Stripe (emphasizing RESTful APIs & Express-aligned backend services):
    const stripeCurated = curateProfessionalSummary(
      candidateData.summary,
      candidateData,
      stripeJob
    );
    assert.ok(
      stripeCurated.includes('Node.js (Express)'),
      `For Stripe, expected "Node.js (Express)", got: "${stripeCurated}"`
    );

    // For a NestJS-specific role:
    const nestJob = {
      title: 'Senior NestJS Backend Architect',
      skills: ['NestJS', 'TypeScript', 'PostgreSQL'],
      description: 'Architect scalable enterprise backend microservices strictly using NestJS.',
      requirements: ['Extensive production experience with NestJS framework'],
    };
    const nestCurated = curateProfessionalSummary(candidateData.summary, candidateData, nestJob);
    assert.ok(
      nestCurated.includes('Node.js (NestJS)'),
      `For NestJS-specific role, expected "Node.js (NestJS)", got: "${nestCurated}"`
    );
  });
});
