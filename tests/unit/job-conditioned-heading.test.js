/**
 * @file Unit Test: Job-Conditioned Heading & Evidence-Backed Fallback
 *
 * Verifies that deriveTargetRoleHeading and normalizeTargetRoleTitle:
 * 1. Genuinely condition the resume heading/targetRole for target jobs.
 * 2. Produce distinct headings for contrasting roles:
 *    - Full-Stack
 *    - Backend
 *    - Frontend
 *    - Distributed Systems
 *    - DevOps / Platform
 * 3. Safely fall back to candidate-supported generalist title (e.g. "Software Engineer")
 *    when the candidate lacks evidence for the target role (zero fabrication).
 * 4. Strictly strip unsupported seniority prefixes (Senior, Principal, Lead, Staff)
 *    for fresher/junior candidates (seniority inflation protection).
 * 5. Cleanly strip employer-specific trailing qualification clauses, tech stacks,
 *    and team names separated by dashes, em-dashes, pipes, or commas, while preserving
 *    compound hyphens (e.g., Full-Stack).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveTargetRoleHeading,
  normalizeTargetRoleTitle,
} from '../../src/services/resume-content-strategy.service.js';

describe('Job-Conditioned Resume Heading Suite', () => {
  const candidateWithBroadEvidence = {
    displayName: 'Test Candidate',
    headline: 'Full-Stack & Backend Developer',
    careerStatus: 'FRESHER',
    seniority: 'ENTRY_LEVEL',
    skills: [
      { name: 'JavaScript', slug: 'javascript' },
      { name: 'TypeScript', slug: 'typescript' },
      { name: 'React', slug: 'react' },
      { name: 'Next.js', slug: 'nextjs' },
      { name: 'Node.js', slug: 'nodejs' },
      { name: 'Express.js', slug: 'express' },
      { name: 'Python', slug: 'python' },
      { name: 'FastAPI', slug: 'fastapi' },
      { name: 'PostgreSQL', slug: 'postgresql' },
      { name: 'Docker', slug: 'docker' },
      { name: 'Redis', slug: 'redis' },
      { name: 'Git', slug: 'git' },
      { name: 'CI/CD', slug: 'ci-cd' },
    ],
    projects: [
      {
        name: 'Web Platform',
        technologies: ['React', 'Next.js', 'TypeScript'],
      },
      {
        name: 'Distributed Task Queue',
        technologies: ['Python', 'FastAPI', 'Redis', 'Docker'],
      },
      {
        name: 'REST Microservice',
        technologies: ['Node.js', 'Express', 'PostgreSQL', 'Docker', 'CI/CD'],
      },
    ],
    experience: [],
    education: [{ institution: 'State University', degree: 'B.S. Computer Science' }],
  };

  const candidateWithBackendOnly = {
    displayName: 'Backend Specialist',
    headline: 'Backend Developer',
    careerStatus: 'FRESHER',
    skills: [
      { name: 'Python', slug: 'python' },
      { name: 'FastAPI', slug: 'fastapi' },
      { name: 'PostgreSQL', slug: 'postgresql' },
      { name: 'Docker', slug: 'docker' },
    ],
    projects: [{ name: 'API Server', technologies: ['Python', 'FastAPI', 'PostgreSQL'] }],
    experience: [],
    education: [{ institution: 'State University', degree: 'B.S. Computer Science' }],
  };

  const candidateWithFrontendOnly = {
    displayName: 'Frontend Specialist',
    headline: 'Frontend Developer',
    careerStatus: 'FRESHER',
    skills: [
      { name: 'React', slug: 'react' },
      { name: 'Next.js', slug: 'nextjs' },
      { name: 'TypeScript', slug: 'typescript' },
      { name: 'CSS', slug: 'css' },
    ],
    projects: [{ name: 'UI Kit', technologies: ['React', 'TypeScript', 'Next.js'] }],
    experience: [],
    education: [{ institution: 'State University', degree: 'B.S. Computer Science' }],
  };

  describe('normalizeTargetRoleTitle', () => {
    it('strips trailing tech clauses separated by em-dash', () => {
      assert.strictEqual(
        normalizeTargetRoleTitle('Senior Full-Stack Developer — React / Node.js / PostgreSQL'),
        'Senior Full-Stack Developer'
      );
      assert.strictEqual(
        normalizeTargetRoleTitle('Python Backend Engineer — FastAPI / Distributed Systems'),
        'Python Backend Engineer'
      );
      assert.strictEqual(
        normalizeTargetRoleTitle('Frontend Engineer — React / Next.js / TypeScript'),
        'Frontend Engineer'
      );
    });

    it('strips trailing tech clauses separated by pipe and dash', () => {
      assert.strictEqual(
        normalizeTargetRoleTitle('Distributed Systems Engineer — High-Throughput Services'),
        'Distributed Systems Engineer'
      );
      assert.strictEqual(
        normalizeTargetRoleTitle('DevOps / Platform Engineer — Cloud Infrastructure'),
        'DevOps / Platform Engineer'
      );
      assert.strictEqual(
        normalizeTargetRoleTitle('Backend Engineer | High Scale Architecture'),
        'Backend Engineer'
      );
    });

    it('preserves internal hyphens in compound words like Full-Stack', () => {
      assert.strictEqual(
        normalizeTargetRoleTitle('Full-Stack Engineer (Remote)'),
        'Full-Stack Engineer'
      );
      assert.strictEqual(normalizeTargetRoleTitle('Full Stack Developer'), 'Full-Stack Developer');
    });

    it('strips employer attachments and trailing commas', () => {
      assert.strictEqual(
        normalizeTargetRoleTitle('Senior Software Engineer, Core Team at Datadog'),
        'Senior Software Engineer'
      );
      assert.strictEqual(
        normalizeTargetRoleTitle('Staff Infrastructure Engineer at Google'),
        'Staff Infrastructure Engineer'
      );
    });
  });

  describe('deriveTargetRoleHeading across Contrasting Roles', () => {
    it('conditions Job 1 (Full-Stack): strips Senior for fresher and keeps Full-Stack Developer', () => {
      const result = deriveTargetRoleHeading({
        candidateProfile: candidateWithBroadEvidence,
        jobPosting: {
          title: 'Senior Full-Stack Developer — React / Node.js / PostgreSQL',
        },
      });
      assert.strictEqual(result.heading, 'Full-Stack Developer');
      assert.strictEqual(result.targetRole, 'Full-Stack Developer');
      assert.strictEqual(result.seniorityAdjusted, true);
    });

    it('conditions Job 2 (Python Backend): yields Python Backend Engineer', () => {
      const result = deriveTargetRoleHeading({
        candidateProfile: candidateWithBroadEvidence,
        jobPosting: {
          title: 'Python Backend Engineer — FastAPI / Distributed Systems',
        },
      });
      assert.strictEqual(result.heading, 'Python Backend Engineer');
      assert.strictEqual(result.targetRole, 'Python Backend Engineer');
    });

    it('conditions Job 3 (Frontend): yields Frontend Engineer', () => {
      const result = deriveTargetRoleHeading({
        candidateProfile: candidateWithBroadEvidence,
        jobPosting: {
          title: 'Frontend Engineer — React / Next.js / TypeScript',
        },
      });
      assert.strictEqual(result.heading, 'Frontend Engineer');
      assert.strictEqual(result.targetRole, 'Frontend Engineer');
    });

    it('conditions Job 4 (Distributed Systems): yields Distributed Systems Engineer', () => {
      const result = deriveTargetRoleHeading({
        candidateProfile: candidateWithBroadEvidence,
        jobPosting: {
          title: 'Distributed Systems Engineer — High-Throughput Services',
        },
      });
      assert.strictEqual(result.heading, 'Distributed Systems Engineer');
      assert.strictEqual(result.targetRole, 'Distributed Systems Engineer');
    });

    it('conditions Job 5 (DevOps / Platform): yields DevOps / Platform Engineer', () => {
      const result = deriveTargetRoleHeading({
        candidateProfile: candidateWithBroadEvidence,
        jobPosting: {
          title: 'DevOps / Platform Engineer — Cloud Infrastructure',
        },
      });
      assert.strictEqual(result.heading, 'DevOps / Platform Engineer');
      assert.strictEqual(result.targetRole, 'DevOps / Platform Engineer');
    });

    it('ensures distinct headings across all 5 contrasting jobs', () => {
      const jobs = [
        'Senior Full-Stack Developer — React / Node.js / PostgreSQL',
        'Python Backend Engineer — FastAPI / Distributed Systems',
        'Frontend Engineer — React / Next.js / TypeScript',
        'Distributed Systems Engineer — High-Throughput Services',
        'DevOps / Platform Engineer — Cloud Infrastructure',
      ];
      const headings = jobs.map(
        (title) =>
          deriveTargetRoleHeading({
            candidateProfile: candidateWithBroadEvidence,
            jobPosting: { title },
          }).heading
      );
      const uniqueHeadings = new Set(headings);
      assert.strictEqual(
        uniqueHeadings.size,
        5,
        `All 5 contrasting jobs must produce distinct headings! Got: ${headings.join(', ')}`
      );
    });
  });

  describe('Zero Fabrication & Safe Evidence Fallbacks', () => {
    it('falls back to Software Engineer for unsupported mobile/iOS role without evidence', () => {
      const result = deriveTargetRoleHeading({
        candidateProfile: candidateWithBroadEvidence, // has JS, TS, React, Node, Python, Docker; NO iOS/Swift
        jobPosting: {
          title: 'Senior iOS Engineer — Swift / SwiftUI',
        },
      });
      assert.strictEqual(
        result.heading,
        'Software Engineer',
        'Must NOT fabricate iOS Engineer title when candidate lacks Swift/iOS evidence'
      );
    });

    it('falls back to Frontend Engineer when candidate has only Frontend evidence for Full-Stack role', () => {
      const result = deriveTargetRoleHeading({
        candidateProfile: candidateWithFrontendOnly,
        jobPosting: {
          title: 'Full-Stack Developer',
        },
      });
      assert.strictEqual(
        result.heading,
        'Frontend Developer',
        'Candidate with only Frontend evidence must not be titled Full-Stack'
      );
    });

    it('falls back to Backend Engineer when candidate has only Backend evidence for Full-Stack role', () => {
      const result = deriveTargetRoleHeading({
        candidateProfile: candidateWithBackendOnly,
        jobPosting: {
          title: 'Full-Stack Developer',
        },
      });
      assert.strictEqual(
        result.heading,
        'Backend Developer',
        'Candidate with only Backend evidence must not be titled Full-Stack'
      );
    });

    it('falls back to Backend Engineer when candidate has only Backend evidence for Frontend role', () => {
      const result = deriveTargetRoleHeading({
        candidateProfile: candidateWithBackendOnly,
        jobPosting: {
          title: 'Frontend Engineer',
        },
      });
      assert.strictEqual(
        result.heading,
        'Backend Engineer',
        'Candidate with only Backend evidence applying to Frontend must fall back safely'
      );
    });
  });
});
